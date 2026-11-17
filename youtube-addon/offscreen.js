/* CRATE for YouTube · offscreen.js (1.5.1) — a hidden page of the add-on's own, where CRATE's tab is listened to for its visualizer.
   Chrome mutes a tab while it is captured, and sound played from inside that tab stays muted too, so the sound is played out from HERE. CRATE gets only
   what it draws: when it asks (each frame, over a port from its own tab), the spectrum and a short stretch of the wave. Nothing is recorded or sent anywhere else. */
'use strict';
const ext = chrome;
let cap = null;                                                          // { tabId, stream, ctx, an, freq, wave }
const bytes = (a) => { let s = ''; for (let i = 0; i < a.length; i += 4096) s += String.fromCharCode.apply(null, a.subarray(i, i + 4096)); return s; };
const ports = new Set();
function stop() {
  if (!cap) return; const c = cap; cap = null;
  try { c.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* gone */ }
  try { c.ctx.close(); } catch (e) { /* gone */ }
  ports.forEach(p => { try { p.postMessage({ ended: true }); } catch (e) { /* gone */ } });
}
async function start(streamId, tabId) {
  if (cap && cap.tabId === tabId) return { ok: true };
  stop();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }, video: false }); }
  catch (e) { return { ok: false, reason: 'failed', detail: String((e && e.message) || e).slice(0, 200) }; }
  const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
  an.fftSize = 4096; an.smoothingTimeConstant = 0.78; an.minDecibels = -90; an.maxDecibels = -18;
  src.connect(ctx.destination);                                          // so you still hear it
  src.connect(an);
  const sp = ctx.createChannelSplitter(2), aL = ctx.createAnalyser(), aR = ctx.createAnalyser(); aL.fftSize = aR.fftSize = 1024; src.connect(sp); sp.connect(aL, 0); sp.connect(aR, 1);          // (1.5.2) each channel, for CRATE's level meter
  try { await ctx.resume(); } catch (e) { /* an offscreen page may play */ }
  cap = { tabId, stream, ctx, an, aL, aR, bufL: new Float32Array(1024), bufR: new Float32Array(1024), freq: new Uint8Array(an.frequencyBinCount), wave: new Uint8Array(an.fftSize) };
  const tr = stream.getAudioTracks()[0]; if (tr) tr.addEventListener('ended', stop);
  return { ok: true };
}
ext.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || m.target !== 'crate-offscreen') return false;               // the add-on's other messages are not for this page
  (async () => {
    if (m.type === 'start') reply(await start(String(m.streamId || ''), Number(m.tabId) || 0));
    else if (m.type === 'stop') { stop(); reply({ ok: true }); }
    else if (m.type === 'status') reply({ ok: true, tabId: cap ? cap.tabId : 0 });
    else reply({ ok: false });
  })();
  return true;
});
ext.runtime.onConnect.addListener((port) => {                            // CRATE's tab asking for frames
  if (port.name !== 'crate-viz') return;
  ports.add(port); port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((m) => {
    if (m !== 'f') return;
    if (!cap || !port.sender || !port.sender.tab || port.sender.tab.id !== cap.tabId) { port.postMessage({ ended: true }); return; }          // only the captured tab gets its own frames
    cap.an.getByteFrequencyData(cap.freq); cap.an.getByteTimeDomainData(cap.wave);
    const w = new Uint8Array(1024), k = cap.wave.length / 1024; for (let i = 0; i < 1024; i++) w[i] = cap.wave[Math.floor(i * k)];
    const pk = (a, b) => { a.getFloatTimeDomainData(b); let m = 0; for (let i = 0; i < b.length; i++) { const v = Math.abs(b[i]); if (v > m) m = v; } return Math.min(1, m); };
    const l = pk(cap.aL, cap.bufL), rr = pk(cap.aR, cap.bufR);
    port.postMessage({ f: bytes(cap.freq), w: bytes(w), r: cap.ctx.sampleRate, l, rr: rr || l });          // l, rr (1.5.2): each channel's peak; a mono source shows on both
  });
});
