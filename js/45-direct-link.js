// CRATE — strict sync's direct link: two devices talking straight to each other, for changes there in a moment and clocks agreed to a few ms.
// One part of the page's script, split by feature (see 01-core.js). Used by strict sync (41-playback-sync.js) when it is on on both devices.
//
// How they meet: each device tells the backend it is here (with its id) whenever it asks what's playing; the one whose id sorts first
// writes an introduction (a WebRTC offer, the way video calls connect) and leaves it at the backend for the other, which answers the same way.
// Then they talk directly (a data channel), with public STUN servers only to find a way through home routers; two devices on the same Wi-Fi
// almost always connect. If they can't, nothing is lost: everything still goes through the backend, only slower.
// Over the link: what's playing (the same message the backend gets, a moment earlier), where it is every second from the device leading,
// and pings that measure the other device's clock (half the round trip, which is a few ms at home).

const DL_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const dl = { peers: new Map(), retryAt: new Map(), lastBeat: 0 };
function dlEnabled() {
  const s = pbSet();
  return !!(s.on && s.strict && typeof RTCPeerConnection === 'function' && pbIsActiveWindow());          // (the window that plays)
}
async function dlSignal(to, msg) {
  const idToken = await pbToken(); if (!idToken) return;
  try { await fetch(CONFIG.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'sig', to, msg: JSON.stringify(msg), idToken }) }); } catch (e) { /* tried again later */ }
}
function dlIceDone(pc) {                                                 // the whole introduction at once (no trickling): one message each way
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') { res(); return; }
    const t = setTimeout(res, 3000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
function dlDrop(id, why) {
  const p = dl.peers.get(id); if (!p) return;
  try { if (p.ch) p.ch.close(); } catch (e) { /* gone */ } try { p.pc.close(); } catch (e) { /* gone */ }
  clearInterval(p.pingT); dl.peers.delete(id);
  if (why) dl.retryAt.set(id, Date.now() + 45000);                       // try again a little later
}
function dlCloseAll() { [...dl.peers.keys()].forEach(id => dlDrop(id)); }
function dlNewPeer(id, role) {
  dlDrop(id);
  const pc = new RTCPeerConnection({ iceServers: DL_ICE }), p = { id, pc, ch: null, role, created: Date.now(), off: 0, offRtt: Infinity, name: '' };
  dl.peers.set(id, p);
  pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed'].includes(pc.connectionState)) dlDrop(id, 'failed'); });
  pc.addEventListener('datachannel', (e) => dlWire(p, e.channel));
  setTimeout(() => { const q = dl.peers.get(id); if (q === p && !(p.ch && p.ch.readyState === 'open')) dlDrop(id, 'timeout'); }, 25000);          // (never opened)
  return p;
}
function dlWire(p, ch) {
  p.ch = ch;
  ch.addEventListener('open', () => {
    const ping = () => { try { if (ch.readyState === 'open') ch.send(JSON.stringify({ k: 'ping', a: Date.now() })); } catch (e) { /* closed */ } };
    for (let i = 0; i < 5; i++) setTimeout(ping, i * 150);
    p.pingT = setInterval(ping, 5000);
    const last = pbSnapshot(); if (last && pbOwner === pbSet().id) dlSend(Object.assign({}, last, { dev: pbSet().id, devName: pbSet().name, mid: 'hello-' + Date.now() }));          // the other device catches up at once
  });
  ch.addEventListener('close', () => dlDrop(p.id, 'closed'));
  ch.addEventListener('message', (e) => { try { dlOnMessage(p, JSON.parse(e.data)); } catch (er) { /* not ours */ } });
}
function dlOnMessage(p, m) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'ping') { p.ch.send(JSON.stringify({ k: 'pong', a: m.a, b: Date.now() })); return; }
  if (m.k === 'pong') {                                                  // its clock, against this one: the quickest round trips count most
    const now = Date.now(), rtt = now - m.a; if (!(rtt >= 0)) return;
    if (rtt <= p.offRtt * 1.25 || Date.now() - (p.offAt || 0) > 60000) { p.off = m.b - (m.a + now) / 2; p.offRtt = rtt; p.offAt = Date.now(); }
    return;
  }
  if ((m.k === 'state' || m.k === 'beat') && m.s && typeof m.s.t === 'string') {
    const s = Object.assign({}, m.s);
    if (typeof m.lts === 'number' && p.offAt) s.ts = Math.round(m.lts - p.off + pbOff);          // its moment, on this device's clock, to a few ms
    p.name = s.devName || p.name;
    const rm = { s, at: pbSrvNow(), dev: s.dev, devName: s.devName, age: 0, seenAt: Date.now(), via: 'link' };
    if (m.k === 'state') { pbRemoteGot(rm); return; }
    // where the leading device is, every second: kept for keeping in line (not a change to act on)
    if (pbOwner === s.dev && pbStrictRef && pbStrictRef.s.r === s.r && pbNamesMatch(pbStrictRef.s.t, s.t) && s.playing) { pbStrictRef = rm; }          // (the watch, four times a second, keeps in line: after first looking for a jump you made here)
  }
}
function dlOpen() { return [...dl.peers.values()].filter(p => p.ch && p.ch.readyState === 'open'); }
function dlSend(full) {
  const open = dlOpen(); if (!open.length) return;
  const msg = JSON.stringify({ k: 'state', s: full, lts: (full.ts || pbSrvNow()) - pbOff });
  open.forEach(p => { try { p.ch.send(msg); } catch (e) { /* closed */ } });
}
function dlBeat(s) {
  if (Date.now() - dl.lastBeat < 900) return; dl.lastBeat = Date.now();
  const open = dlOpen(); if (!open.length) return;
  const set = pbSet(), msg = JSON.stringify({ k: 'beat', s: Object.assign({}, s, { dev: set.id, devName: set.name }), lts: (s.ts || pbSrvNow()) - pbOff });
  open.forEach(p => { try { p.ch.send(msg); } catch (e) { /* closed */ } });
}
// From each answer of the backend: who else is here, and the introductions left for this device.
async function dlFromBackend(devs, signals) {
  if (!dlEnabled()) { if (dl.peers.size) dlCloseAll(); return; }
  const me = pbSet().id;
  for (const raw of signals || []) {
    let m; try { m = JSON.parse(raw); } catch (e) { continue; }
    if (!m || !m.from || m.from === me) continue;
    if (m.kind === 'offer') {
      const have = dl.peers.get(m.from);
      if (have && have.role === 'offer' && me < m.from && have.pc.signalingState === 'have-local-offer') continue;          // both introduced at once: the one sorting first keeps its own
      const p = dlNewPeer(m.from, 'answer');
      try {
        await p.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        await dlIceDone(p.pc);
        dlSignal(m.from, { from: me, kind: 'answer', sdp: p.pc.localDescription.sdp });
      } catch (e) { dlDrop(m.from, 'answer failed'); }
    } else if (m.kind === 'answer') {
      const p = dl.peers.get(m.from);
      if (p && p.pc.signalingState === 'have-local-offer') { try { await p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); } catch (e) { dlDrop(m.from, 'answer refused'); } }
    }
  }
  Object.entries(devs || {}).forEach(([id, d]) => {
    if (id === me || !d || !d.strict || !(pbSrvNow() - d.at < 30000)) return;          // (a strict device heard from lately)
    if (dl.peers.has(id) || (dl.retryAt.get(id) || 0) > Date.now() || me > id) return;          // the one sorting first introduces itself
    const p = dlNewPeer(id, 'offer');
    dlWire(p, p.pc.createDataChannel('crate', { ordered: true }));
    (async () => {
      try {
        await p.pc.setLocalDescription(await p.pc.createOffer());
        await dlIceDone(p.pc);
        dlSignal(id, { from: me, kind: 'offer', sdp: p.pc.localDescription.sdp });
      } catch (e) { dlDrop(id, 'offer failed'); }
    })();
  });
}
function dlStatus() {
  if (!dlEnabled()) return 'no direct link (this window)';
  const open = dlOpen();
  if (open.length) return 'direct link to ' + open.map(p => `${escapeHtml(p.name || 'a device')} (${Math.round(p.offRtt === Infinity ? 0 : p.offRtt)} ms)`).join(', ');
  return dl.peers.size ? 'connecting directly…' : 'no direct link yet (using the backend)';
}
