"use strict";
/**
 * MoCall private signaling server.
 * Zero call recording, zero third-party signaling, no media processing.
 * HTTPS/WSS must be provided by Caddy (or another reverse proxy) in production.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "http://localhost:8787";
const TURN_HOST = process.env.TURN_HOST || "";
const TURN_SECRET = process.env.TURN_SECRET || "";
const PUBLIC_ROOT = path.join(__dirname, "public");
const ONLINE = new Map();
const CALLS = new Map();
const TICKETS = new Map();
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const SESSION_RE = /^[A-Za-z0-9_-]{16,48}$/;
const routes = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "application/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/favicon.svg": ["favicon.svg", "image/svg+xml"]
};

function respond(res, code, data, type = "application/json; charset=utf-8") {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(self)",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' wss: ws:; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, PUBLIC_ORIGIN).pathname; }
  catch { respond(res, 400, "{}"); return; }
  if (req.method !== "GET") { respond(res, 405, "{}"); return; }

  if (pathname === "/healthz") {
    respond(res, 200, JSON.stringify({status: "ok", version: "0.2.0"}));
    return;
  }
  if (pathname === "/api/ice") {
    const match = String(req.headers.authorization || "").match(/^Bearer ([A-Za-z0-9_-]{43})$/);
    const ticket = match && TICKETS.get(match[1]);
    if (!ticket || ticket.expires < Date.now() || !ONLINE.has(ticket.id)) {
      respond(res, 401, JSON.stringify({error:"authenticated session required"}));
      return;
    }
    let iceServers = [];
    if (TURN_HOST && TURN_SECRET) {
      const username = Math.floor(Date.now() / 1000 + 3600) + ":" + crypto.randomBytes(8).toString("hex");
      const credential = crypto.createHmac("sha1", TURN_SECRET).update(username).digest("base64");
      iceServers = [{urls: [
        "turn:" + TURN_HOST + ":3478?transport=udp",
        "turn:" + TURN_HOST + ":3478?transport=tcp"
      ], username, credential}];
    }
    respond(res, 200, JSON.stringify({iceServers, relayConfigured: iceServers.length > 0}));
    return;
  }
  const file = routes[pathname];
  if (!file) { respond(res, 404, "Not found", "text/plain; charset=utf-8"); return; }
  fs.readFile(path.join(PUBLIC_ROOT, file[0]), (error, bytes) => {
    if (error) { respond(res, 500, "Missing asset", "text/plain; charset=utf-8"); return; }
    respond(res, 200, bytes, file[1]);
  });
});

const wss = new WebSocketServer({noServer: true, maxPayload: 150 * 1024, perMessageDeflate: false});
const send = (ws, data) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(data)); } catch {}
  }
};

server.on("upgrade", (req, socket, head) => {
  const origin = req.headers.origin;
  const expected = new URL(PUBLIC_ORIGIN).origin;
  const pathname = new URL(req.url || "/", PUBLIC_ORIGIN).pathname;
  if (pathname !== "/signal" || (origin && origin !== expected)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

function closeCall(sessionId, by, reason = "ended") {
  const c = CALLS.get(sessionId);
  if (!c) return;
  CALLS.delete(sessionId);
  for (const id of [c.from, c.to]) {
    if (id !== by) send(ONLINE.get(id), {t: "hangup", session: sessionId, reason});
  }
}
function busy(id) {
  for (const c of CALLS.values()) if (c.from === id || c.to === id) return true;
  return false;
}
function peerCall(ws, msg) {
  const c = CALLS.get(msg.session);
  if (!c || !c.accepted || (c.from !== ws.identity && c.to !== ws.identity)) return;
  const peer = c.from === ws.identity ? c.to : c.from;
  const p = ONLINE.get(peer);
  if (!p) { closeCall(msg.session, ws.identity, "offline"); return; }
  if (msg.t === "rtc") {
    if (!["offer", "answer", "candidate"].includes(msg.kind)) return;
    if (!msg.data || typeof msg.data !== "object") return;
    const serialized = JSON.stringify(msg.data);
    if (serialized.length > 96000) return;
    send(p, {t: "rtc", kind: msg.kind, session: msg.session, data: msg.data});
  }
}
function validateIdentity(identity, pub, sig, nonce) {
  if (!ID_RE.test(identity) || !pub || pub.kty !== "EC" || pub.crv !== "P-256" ||
      !/^[A-Za-z0-9_-]{43}$/.test(pub.x || "") ||
      !/^[A-Za-z0-9_-]{43}$/.test(pub.y || "") ||
      typeof sig !== "string" || sig.length > 160) return false;
  const digest = crypto.createHash("sha256")
    .update("P-256|" + pub.x + "|" + pub.y).digest("base64url").slice(0, 22);
  if (digest !== identity) return false;
  try {
    const key = crypto.createPublicKey({key: {kty:"EC", crv:"P-256", x: pub.x, y: pub.y}, format: "jwk"});
    return crypto.verify("sha256", Buffer.from("MoCall-v2|" + nonce, "utf8"),
      {key, dsaEncoding: "ieee-p1363"}, Buffer.from(sig, "base64url"));
  } catch { return false; }
}

wss.on("connection", (ws) => {
  ws.identity = null;
  ws.nonce = crypto.randomBytes(24).toString("base64url");
  ws.isAlive = true;
  ws.windowStart = Date.now();
  ws.messageCount = 0;
  ws.on("pong", () => { ws.isAlive = true; });
  send(ws, {t:"hello", nonce: ws.nonce});
  const authTimeout = setTimeout(() => { if (!ws.identity) ws.close(1008, "authentication required"); }, 12000);
  ws.on("message", (raw) => {
    const now = Date.now();
    if (now - ws.windowStart > 10000) { ws.windowStart = now; ws.messageCount = 0; }
    if (++ws.messageCount > 120) { ws.close(1008, "rate limited"); return; }
    let msg;
    try { msg = JSON.parse(raw.toString("utf8")); }
    catch { return; }
    if (!msg || typeof msg.t !== "string") return;
    if (!ws.identity) {
      if (msg.t !== "auth" || !validateIdentity(msg.id, msg.pub, msg.sig, ws.nonce)) {
        ws.close(1008, "invalid identity"); return;
      }
      ws.identity = msg.id;
      ws.nonce = null;
      clearTimeout(authTimeout);
      const old = ONLINE.get(ws.identity);
      if (old && old !== ws) old.close(1000, "new session");
      ONLINE.set(ws.identity, ws);
      const ticket = crypto.randomBytes(32).toString("base64url");
      ws.iceTicket = ticket;
      TICKETS.set(ticket, {id:ws.identity, expires:Date.now()+10*60*1000});
      send(ws, {t:"ready", id: ws.identity, iceTicket:ticket});
      return;
    }
    if (msg.t === "presence") {
      const ids = Array.isArray(msg.ids) ? msg.ids.filter(x => typeof x === "string" && ID_RE.test(x)).slice(0, 25) : [];
      send(ws, {t:"presence", online: ids.filter(id => ONLINE.has(id))});
      return;
    }
    if (msg.t === "call") {
      if (!ID_RE.test(msg.to || "") || !SESSION_RE.test(msg.session || "") ||
          msg.to === ws.identity || !["audio", "video"].includes(msg.mode) ||
          CALLS.has(msg.session) || busy(ws.identity)) return;
      if (busy(msg.to)) { send(ws, {t:"unavailable", reason:"busy", id:msg.to}); return; }
      const other = ONLINE.get(msg.to);
      if (!other) { send(ws, {t:"unavailable", reason:"offline", id:msg.to}); return; }
      CALLS.set(msg.session, {from: ws.identity, to: msg.to, mode: msg.mode, accepted:false, created:Date.now()});
      send(other, {t:"incoming", from: ws.identity, session:msg.session, mode:msg.mode});
      send(ws, {t:"ringing", session:msg.session});
      return;
    }
    if (!SESSION_RE.test(msg.session || "")) return;
    const call = CALLS.get(msg.session);
    if (!call || (call.from !== ws.identity && call.to !== ws.identity)) return;
    if (msg.t === "accept" && ws.identity === call.to && !call.accepted) {
      call.accepted = true;
      send(ONLINE.get(call.from), {t:"accepted", session:msg.session});
      send(ws, {t:"accepted", session:msg.session});
    } else if (msg.t === "reject" && ws.identity === call.to) {
      closeCall(msg.session, ws.identity, "rejected");
    } else if (msg.t === "hangup") {
      closeCall(msg.session, ws.identity);
    } else if (msg.t === "rtc") peerCall(ws, msg);
  });
  ws.on("close", () => {
    clearTimeout(authTimeout);
    if (ws.iceTicket) TICKETS.delete(ws.iceTicket);
    if (!ws.identity) return;
    if (ONLINE.get(ws.identity) === ws) {
      ONLINE.delete(ws.identity);
      for (const [session, call] of CALLS) {
        if (call.from === ws.identity || call.to === ws.identity) closeCall(session, ws.identity, "offline");
      }
    }
  });
  ws.on("error", () => {});
});

const heartbeat = setInterval(() => {
  for (const [token, data] of TICKETS) {
    if (data.expires < Date.now()) TICKETS.delete(token);
  }
  for (const [session, call] of CALLS) {
    if (!call.accepted && Date.now()-call.created > 45000) closeCall(session, "", "timeout");
  }
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
heartbeat.unref();

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write("MoCall signaling ready on port " + PORT + " (no media recording)\n");
});
