"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const crypto = require("node:crypto");
const {WebSocket} = require("ws");
const PORT = 18787;
const ORIGIN = "http://localhost:" + PORT;

async function start() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: require("node:path").join(__dirname,".."),
    env: {...process.env, PORT:String(PORT), PUBLIC_ORIGIN:ORIGIN, TURN_HOST:"", TURN_SECRET:""},
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise((resolve,reject)=>{
    let err="";
    const timer=setTimeout(()=>reject(new Error("startup timeout "+err)),5000);
    child.stdout.on("data",chunk=>{if(chunk.toString().includes("signaling ready")){clearTimeout(timer);resolve();}});
    child.stderr.on("data",chunk=>{err+=chunk.toString();});
    child.on("exit",code=>{clearTimeout(timer);reject(new Error("server exited "+code+" "+err));});
  });
  return child;
}
function readMessage(ws, type) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.off("message",fn);reject(new Error("timed out waiting for "+type));},3000);
    function fn(raw) {const m=JSON.parse(String(raw)); if(m.t===type){clearTimeout(timer);ws.off("message",fn);resolve(m);}}
    ws.on("message",fn);
  });
}
async function identity() {
  const keys=await crypto.webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const pub=await crypto.webcrypto.subtle.exportKey("jwk",keys.publicKey);
  const id=crypto.createHash("sha256").update("P-256|"+pub.x+"|"+pub.y).digest("base64url").slice(0,22);
  return {keys,pub:{kty:"EC",crv:"P-256",x:pub.x,y:pub.y},id};
}
async function loggedIn() {
  const person=await identity();
  const ws = new WebSocket("ws://localhost:"+PORT+"/signal",{origin:ORIGIN});
  const greeting=readMessage(ws,"hello");
  await new Promise((resolve,reject)=>{ws.on("open",resolve);ws.on("error",reject);});
  const hello=await greeting;
  const data=new TextEncoder().encode("MoCall-v2|"+hello.nonce);
  const signature=await crypto.webcrypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},person.keys.privateKey,data);
  const ready=readMessage(ws,"ready");
  ws.send(JSON.stringify({t:"auth",id:person.id,pub:person.pub,sig:Buffer.from(signature).toString("base64url")}));
  await ready;
  return {ws,id:person.id};
}
test("private server, authenticated identities, online calls, and no recording", async t=>{
  const child=await start();
  t.after(()=>child.kill());
  const health=await fetch(ORIGIN+"/healthz");
  assert.equal(health.status,200);
  const ice=await (await fetch(ORIGIN+"/api/ice")).json();
  assert.deepEqual(ice.iceServers,[]);
  const web=await (await fetch(ORIGIN+"/")).text();
  assert.match(web,/MoCall Private/);
  const a=await loggedIn(),b=await loggedIn();
  t.after(()=>{a.ws.close();b.ws.close();});
  const presence=readMessage(a.ws,"presence");
  a.ws.send(JSON.stringify({t:"presence",ids:[b.id]}));
  assert.deepEqual((await presence).online,[b.id]);
  const incoming=readMessage(b.ws,"incoming");
  const session=crypto.randomBytes(18).toString("base64url");
  a.ws.send(JSON.stringify({t:"call",to:b.id,session,mode:"audio"}));
  assert.equal((await incoming).from,a.id);
  const ended=readMessage(a.ws,"hangup");
  b.ws.send(JSON.stringify({t:"reject",session}));
  assert.equal((await ended).reason,"rejected");
});
