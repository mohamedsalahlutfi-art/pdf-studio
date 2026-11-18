"use strict";
/* MoCall Private 0.2 — local device keys, HTTPS signaling, encrypted WebRTC media. */
(() => {
  const $ = id => document.getElementById(id);
  const ID_RE = /^[A-Za-z0-9_-]{22}$/;
  const CONTACTS_KEY = "mocall-private-contacts-v2";
  const state = {
    id: null, pair: null, socket: null, ready: false, contacts: [],
    peer: null, call: null, pending: null, stream: null, candidates: [], ice: null,
    online: new Set(), reconnectTimer: null, iceTicket: null
  };
  let toastTimeout;
  const enc = new TextEncoder();

  function show(msg) {
    const box = $("snackbar");
    box.textContent = msg; box.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { box.hidden = true; }, 3500);
  }
  function setNetwork(ok, message) {
    $("network-state").textContent = message;
    $("online-led").classList.toggle("connected", !!ok);
    for (const name of ["share-identity", "copy-identity", "dial-video", "dial-audio"]) {
      $(name).disabled = !ok;
    }
  }
  function bytesToB64Url(buffer) {
    const b = new Uint8Array(buffer);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function randomId(n) {
    return bytesToB64Url(crypto.getRandomValues(new Uint8Array(n)));
  }
  function idFromText(input) {
    const s = String(input || "").trim();
    if (ID_RE.test(s)) return s;
    try {
      const u = new URL(s);
      const id = u.searchParams.get("call");
      if (ID_RE.test(id || "")) return id;
    } catch {}
    return null;
  }
  function contactName(id) {
    const item = state.contacts.find(c => c.id === id);
    return item ? item.name : "جهة اتصال غير محفوظة";
  }
  function contactLink(id) {
    return location.origin + "/?call=" + encodeURIComponent(id);
  }
  function storageContacts() {
    try {
      const x = JSON.parse(localStorage.getItem(CONTACTS_KEY) || "[]");
      return Array.isArray(x) ? x.filter(c => c && ID_RE.test(c.id || "") && typeof c.name === "string").slice(0,50) : [];
    } catch { return []; }
  }
  function persistContacts() {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(state.contacts.slice(0,50)));
    renderContacts(); queryPresence();
  }
  function dbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("MoCallPrivateIdentityV2", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("identity");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }
  async function getOrCreateIdentity() {
    const db = await dbOpen();
    try {
      let pair = await new Promise((resolve, reject) => {
        const tx = db.transaction("identity", "readonly");
        const req = tx.objectStore("identity").get("keypair");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!pair || !pair.privateKey || !pair.publicKey) {
        pair = await crypto.subtle.generateKey(
          {name: "ECDSA", namedCurve: "P-256"}, false, ["sign", "verify"]);
        await new Promise((resolve, reject) => {
          const tx = db.transaction("identity", "readwrite");
          tx.objectStore("identity").put(pair, "keypair");
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
      const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
      const digest = await crypto.subtle.digest("SHA-256", enc.encode("P-256|" + pub.x + "|" + pub.y));
      state.id = bytesToB64Url(digest).slice(0,22);
      state.pair = pair;
      return {pub: {kty: "EC", crv: "P-256", x: pub.x, y: pub.y}, id: state.id};
    } finally { db.close(); }
  }
  function send(data) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify(data)); return true;
    }
    return false;
  }
  function queryPresence() {
    if (!state.ready) return;
    const ids = [...new Set([...state.contacts.map(c => c.id), idFromText($("target-id").value)].filter(Boolean))];
    send({t: "presence", ids: ids.slice(0,25)});
  }
  function displayPresence() {
    const to = idFromText($("target-id").value);
    $("target-presence").textContent = to ?
      (state.online.has(to) ? "● الشخص متصل الآن ويمكنك الاتصال" : "○ الشخص غير متصل حاليًا، أو لم يتم تحديث حالته") :
      "الطرف الثاني لازم يكون فاتح MoCall ومتصلاً بالخادم.";
  }
  function renderContacts() {
    const root = $("contacts-list");
    root.replaceChildren();
    if (!state.contacts.length) {
      const p = document.createElement("p"); p.className="empty"; p.textContent="لسه مفيش جهات اتصال. أضف أول شخص من فوق.";
      root.appendChild(p); return;
    }
    for (const person of state.contacts) {
      const outer=document.createElement("div"); outer.className="contact";
      const details=document.createElement("div"); details.className="contact-details";
      const title=document.createElement("div");title.className="contact-name";
      const dot=document.createElement("span");dot.className="dot"+(state.online.has(person.id)?" on":"");
      const name=document.createElement("span");name.textContent=person.name;
      title.append(dot,name);
      const small=document.createElement("div");small.className="contact-id";small.textContent=person.id;
      details.append(title,small);
      const controls=document.createElement("div");controls.className="contact-controls";
      const b=document.createElement("button"); b.className="btn subtle smallbtn"; b.textContent="☎ اتصال";
      b.disabled = !state.ready; b.addEventListener("click",() => makeCall(person.id,"audio"));
      const v=document.createElement("button"); v.className="btn subtle smallbtn";v.textContent="▣ فيديو";
      v.disabled=!state.ready;v.addEventListener("click",()=>makeCall(person.id,"video"));
      const remove=document.createElement("button");remove.className="btn subtle smallbtn";remove.textContent="✕";remove.title="حذف جهة الاتصال";
      remove.addEventListener("click",()=>{state.contacts=state.contacts.filter(x=>x.id!==person.id);persistContacts();});
      controls.append(b,v,remove);outer.append(details,controls);root.appendChild(outer);
    }
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); show("تم نسخ الرابط"); }
    catch { show("المتصفح منع النسخ التلقائي"); }
  }
  async function shareIdentity() {
    if (!state.id) return;
    const text="اتصل بي على MoCall الخاص:\n" + contactLink(state.id);
    if (navigator.share) {
      try { await navigator.share({title:"MoCall",text,url:contactLink(state.id)}); }
      catch {}
    } else if (/Android/i.test(navigator.userAgent) && window.location.protocol === "https:") {
      window.location.href = "mocall://share?text=" + encodeURIComponent(text);
    } else { copyText(contactLink(state.id)); }
  }
  async function connectSignal(identity) {
    if (state.socket && state.socket.readyState <= 1) return;
    state.ready = false;
    setNetwork(false,"جارٍ الاتصال بخادمك الخاص...");
    const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/signal";
    const ws = new WebSocket(wsUrl);
    state.socket = ws;
    ws.addEventListener("open", () => { setNetwork(false,"جاري إثبات هوية جهازك..."); });
    ws.addEventListener("message", async event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.t === "hello") {
        try {
          const signature = await crypto.subtle.sign(
            {name:"ECDSA",hash:"SHA-256"},state.pair.privateKey,
            enc.encode("MoCall-v2|" + msg.nonce));
          send({t:"auth",id:identity.id,pub:identity.pub,sig:bytesToB64Url(signature)});
        } catch {show("فشل توقيع هوية جهازك");}
      }
      else if (msg.t === "ready") {
        state.ready=true;
        state.iceTicket=msg.iceTicket;
        $("my-id").textContent=state.id;
        setNetwork(true,"متصل بخادمك الخاص");
        renderContacts(); queryPresence();
      }
      else if (msg.t === "presence") {
        state.online=new Set((msg.online||[]).filter(id=>ID_RE.test(id)));
        renderContacts(); displayPresence();
      }
      else if (msg.t === "incoming") {
        if (state.call || state.pending) { send({t:"reject",session:msg.session});return; }
        state.pending={session:msg.session,peerId:msg.from,mode:msg.mode,caller:false};
        $("incoming-name").textContent=contactName(msg.from);
        $("incoming-info").textContent=msg.mode==="video" ? "مكالمة فيديو واردة" : "مكالمة صوت واردة";
        $("incoming-overlay").hidden=false;
      }
      else if (msg.t === "ringing") {
        $("call-status").textContent="بيرن على الطرف الآخر...";
      }
      else if (msg.t === "unavailable") {
        show(msg.reason === "busy"?"الشخص مشغول بمكالمة":"الشخص غير متصل الآن");
        finishCall(false);
      }
      else if (msg.t === "accepted") {
        try {
          if (!state.call || state.call.session !== msg.session) return;
          $("call-status").textContent="جارٍ توصيل الصوت والفيديو...";
          if (state.call.caller) {
            await obtainMedia(state.call.mode);
            const p=await ensurePeer();
            const offer=await p.createOffer();
            await p.setLocalDescription(offer);
            send({t:"rtc",session:msg.session,kind:"offer",data:p.localDescription.toJSON()});
          }
        } catch (e) { show("تعذر تشغيل الميكروفون أو الكاميرا");finishCall(true); }
      }
      else if (msg.t === "rtc") {
        if (!state.call || msg.session !== state.call.session) return;
        try { await onRtc(msg); } catch { show("حصل خطأ في تفاوض الاتصال");finishCall(true); }
      }
      else if (msg.t === "hangup") {
        if (state.pending && state.pending.session === msg.session) {
          state.pending=null;$("incoming-overlay").hidden=true;
        }
        if (state.call && state.call.session === msg.session) {
          const rejected=msg.reason==="rejected";
          finishCall(false);
          show(rejected?"تم رفض المكالمة":"انتهت المكالمة");
        }
      }
    });
    ws.addEventListener("close", () => {
      if (state.socket !== ws) return;
      state.ready=false;
      state.iceTicket=null;
      state.ice=null;
      state.online.clear();setNetwork(false,"غير متصل — إعادة المحاولة");
      $("incoming-overlay").hidden=true; state.pending=null;
      if (state.call) finishCall(false);
      renderContacts();displayPresence();
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer=setTimeout(()=>connectSignal(identity),2500);
    });
    ws.addEventListener("error", () => {});
  }
  function setCallUi(peerId,mode,description) {
    $("call-partner").textContent=contactName(peerId);
    $("call-status").textContent=description||"جارٍ الاتصال...";
    $("call-overlay").hidden=false;
    $("call-partner").title=peerId;
    $("toggle-camera").disabled=(mode!=="video");
    $("video-placeholder").hidden=false;
    $("local-video").hidden=(mode!=="video");
  }
  function makeCall(to,mode) {
    if (!state.ready) {show("خادمك غير متصل");return;}
    if (!ID_RE.test(to||"")){show("هوية المستلم غير صحيحة");return;}
    if (to===state.id){show("ماينفعش ترن على نفس الجهاز");return;}
    if (state.call||state.pending){show("فيه مكالمة شغالة بالفعل");return;}
    state.call={session:randomId(18),peerId:to,mode,caller:true};
    state.candidates=[];
    setCallUi(to,mode,"بنطلب الاتصال...");
    send({t:"call",to,session:state.call.session,mode});
  }
  async function obtainMedia(mode) {
    if (state.stream) return state.stream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Error("WebRTC media unavailable");
    const stream=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true},
      video:mode==="video" ? {facingMode:"user",width:{ideal:1280},height:{ideal:720}} : false
    });
    state.stream=stream;
    $("local-video").srcObject=stream;
    $("toggle-mic").classList.remove("off");
    $("toggle-camera").classList.remove("off");
    return stream;
  }
  async function ensurePeer() {
    if (state.peer) return state.peer;
    if (!state.call) throw Error("no call");
    if (!state.ice) {
      const res=await fetch("/api/ice",{cache:"no-store",headers:{"Authorization":"Bearer "+state.iceTicket}});
      if (!res.ok) throw Error("ICE settings unavailable");
      state.ice=await res.json();
    }
    const pc=new RTCPeerConnection({iceServers:state.ice.iceServers || []});
    state.peer=pc;
    for (const track of state.stream.getTracks()) pc.addTrack(track,state.stream);
    pc.ontrack=e=>{
      const remote=$("remote-video");
      remote.srcObject=e.streams[0];
      $("video-placeholder").hidden=true;
      remote.play().catch(()=>{});
    };
    pc.onicecandidate=e=>{
      if (e.candidate && state.call) send({
        t:"rtc",session:state.call.session,kind:"candidate",data:e.candidate.toJSON()
      });
    };
    pc.onconnectionstatechange=()=>{
      if (!state.call || state.peer!==pc) return;
      if (pc.connectionState==="connected") {
        $("call-status").textContent="مكالمة متصلة ومشفرة";
        $("video-placeholder").hidden=true;
      }
      if (pc.connectionState==="failed") {
        show("فشل الاتصال — قد تحتاج إعداد TURN على خادمك");
        finishCall(true);
      }
    };
    return pc;
  }
  async function onRtc(msg) {
    const pc=await ensurePeer();
    if (msg.kind==="candidate") {
      if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(msg.data));
      else state.candidates.push(msg.data);
      return;
    }
    if (msg.kind==="offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
      for (const c of state.candidates.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(c));
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({t:"rtc",session:state.call.session,kind:"answer",data:pc.localDescription.toJSON()});
    }
    else if (msg.kind==="answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
      for (const c of state.candidates.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(c));
    }
  }
  async function acceptIncoming() {
    const incoming=state.pending;
    if (!incoming) return;
    state.pending=null;$("incoming-overlay").hidden=true;
    state.call=incoming;state.candidates=[];
    setCallUi(incoming.peerId,incoming.mode,"بتجهز الميكروفون...");
    try {
      await obtainMedia(incoming.mode);
      await ensurePeer();
      send({t:"accept",session:incoming.session});
    } catch {
      send({t:"reject",session:incoming.session});
      finishCall(false);
      show("اسمح باستخدام الميكروفون / الكاميرا وجرب تاني");
    }
  }
  function finishCall(notify=true) {
    if (notify && state.call) send({t:"hangup",session:state.call.session});
    if (state.peer) { try{state.peer.close();}catch{} state.peer=null; }
    if (state.stream) {state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
    $("local-video").srcObject=null;$("remote-video").srcObject=null;
    $("call-overlay").hidden=true;$("video-placeholder").hidden=false;
    state.call=null;state.candidates=[];state.ice=null;
  }
  function saveContact() {
    const name=$("contact-name").value.trim();
    const id=idFromText($("contact-id").value);
    if (!name||!id){show("اكتب الاسم وهوية صحيحة");return;}
    if (id===state.id){show("ماينفعش تحفظ نفسك كجهة اتصال");return;}
    state.contacts=state.contacts.filter(c=>c.id!==id);
    state.contacts.unshift({name:name.slice(0,50),id});
    persistContacts();
    $("contact-name").value="";$("contact-id").value="";
    show("تم حفظ الشخص على جهازك");
  }
  function events() {
    $("share-identity").addEventListener("click",shareIdentity);
    $("copy-identity").addEventListener("click",()=>copyText(contactLink(state.id)));
    $("dial-video").addEventListener("click",()=>makeCall(idFromText($("target-id").value),"video"));
    $("dial-audio").addEventListener("click",()=>makeCall(idFromText($("target-id").value),"audio"));
    $("target-id").addEventListener("input",()=>{displayPresence();queryPresence();});
    $("save-contact").addEventListener("click",saveContact);
    $("reject-call").addEventListener("click",()=>{
      if (!state.pending) return;
      send({t:"reject",session:state.pending.session});
      state.pending=null;$("incoming-overlay").hidden=true;
    });
    $("accept-call").addEventListener("click",acceptIncoming);
    $("end-call").addEventListener("click",()=>finishCall(true));
    $("toggle-mic").addEventListener("click",()=>{
      const track=state.stream && state.stream.getAudioTracks()[0];
      if (!track)return;
      track.enabled=!track.enabled;
      $("toggle-mic").classList.toggle("off",!track.enabled);
    });
    $("toggle-camera").addEventListener("click",()=>{
      const track=state.stream && state.stream.getVideoTracks()[0];
      if (!track)return;
      track.enabled=!track.enabled;
      $("toggle-camera").classList.toggle("off",!track.enabled);
    });
    window.addEventListener("beforeunload",()=>{
      if (state.call) finishCall(true);
      if (state.socket) state.socket.close();
    });
    document.addEventListener("visibilitychange",()=>{
      if (!document.hidden) queryPresence();
    });
  }
  async function init() {
    state.contacts=storageContacts();
    events();renderContacts();
    const requested = idFromText(new URL(location.href).searchParams.get("call"));
    if (requested) {
      $("target-id").value=requested;
      $("contact-id").value=requested;
    }
    if (!isSecureContext || !window.crypto || !crypto.subtle) {
      setNetwork(false,"يلزم HTTPS لحماية هويتك وتشغيل المكالمات");
      show("افتح التطبيق عبر HTTPS، أو localhost للتجربة");return;
    }
    try {
      const identity=await getOrCreateIdentity();
      $("my-id").textContent=identity.id;
      await connectSignal(identity);
      setInterval(queryPresence,20000);
    } catch(e) {
      setNetwork(false,"فشل إنشاء هوية الجهاز");
      show("متصفحك لا يدعم تخزين مفاتيح التشفير المطلوبة");
    }
  }
  init();
})();
