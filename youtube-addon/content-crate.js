/* CRATE for YouTube · content-crate.js — runs on YOUR CRATE page (only once you have connected it in the options). The page and the add-on talk through window messages; only a few kinds are passed on, with
   their contents trimmed to what they may hold. The page can ask the add-on for a YouTube search, a playlist or a video's page, and (1.5.0) to hear its own tab; it can't ask for anything else, and what it asks is checked again in the background. */
(function () {
  'use strict';
  const ext = chrome; if (!ext || !ext.runtime || window.__crateYtBridge) return; window.__crateYtBridge = true;
  const post = (m) => window.postMessage(Object.assign({ source: 'crate-addon' }, m), location.origin), str = (v, n) => String(v == null ? '' : v).slice(0, n);
  let live = false;
  let vizPort = null;                                                    // (1.5.1) frames from the add-on's hidden page, which listens to this tab
  function pull() {
    if (!vizPort) {
      try { vizPort = ext.runtime.connect({ name: 'crate-viz' }); } catch (e) { return; }
      vizPort.onMessage.addListener((m) => { if (!m) return; if (m.ended) { post({ type: 'yt-audio-ended' }); return; } post({ type: 'yt-viz-frame', f: str(m.f, 4096), w: str(m.w, 4096), r: Number(m.r) || 0, l: Math.min(1, Math.max(0, Number(m.l) || 0)), rr: Math.min(1, Math.max(0, Number(m.rr) || 0)) }); });
      vizPort.onDisconnect.addListener(() => { const err = ext.runtime.lastError; vizPort = null; if (err) post({ type: 'yt-audio-ended' }); });          // nothing listening any more (the add-on was reloaded, say)
    }
    try { vizPort.postMessage('f'); } catch (e) { vizPort = null; }
  }
  const send = (msg, cb) => { try { ext.runtime.sendMessage(msg, (r) => { void ext.runtime.lastError; cb(r || null); }); } catch (e) { cb(null); } };
  const item = (x) => ({ id: str(x && x.id, 80), title: str(x && x.title, 240), channel: str(x && x.channel, 120), durationMs: Number(x && x.durationMs) > 0 ? Math.round(Number(x.durationMs)) : 0, index: Number(x && x.index) || 0, count: Number(x && x.count) || 0, official: !!(x && x.official),
    description: typeof (x && x.description) === 'string' ? x.description.slice(0, 8000) : undefined,          // a video's own page (1.4.0 read these; until 1.5.0 they were dropped here, so CRATE never got them)
    chapters: Array.isArray(x && x.chapters) ? x.chapters.slice(0, 200).map(c => ({ start: Math.max(0, Math.round(Number(c && c.start) || 0)), title: str(c && c.title, 200) })) : undefined });
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return; const d = e.data;
    if (!d || d.source !== 'crate-app' || typeof d.type !== 'string' || d.type.slice(0, 3) !== 'yt-') return;
    if (d.type === 'yt-hello') send({ type: 'yt-hello' }, (r) => post({ type: 'yt-ready', ok: !!(r && r.ok), version: str(r && r.version, 20), state: str(r && r.state, 20), today: Number(r && r.today) || 0, cap: Number(r && r.cap) || 0, parallel: Math.min(4, Math.max(1, Number(r && r.parallel) || 1)) }));
    else if (d.type === 'yt-request') { const o = d.op && typeof d.op === 'object' ? d.op : {}; send({ type: 'yt-request', reqId: str(d.reqId, 40), op: { kind: str(o.kind, 20), q: typeof o.q === 'string' ? o.q.slice(0, 400) : undefined, id: typeof o.id === 'string' ? o.id.slice(0, 80) : undefined } }, (r) => post({ type: 'yt-accepted', reqId: str(d.reqId, 40), resp: r ? { ok: !!r.ok, reason: str(r.reason, 20), cached: !!r.cached, left: Number(r.left) || 0 } : { ok: false, reason: 'noanswer' } })); }
    else if (d.type === 'yt-cancel' || d.type === 'yt-continue') send({ type: d.type }, (r) => post({ type: 'yt-ack', for: d.type, resp: r ? { ok: !!r.ok, reason: str(r.reason, 20) } : { ok: false, reason: 'noanswer' } }));
    else if (d.type === 'yt-audio') send({ type: 'yt-audio' }, (r) => post({ type: 'yt-audio', ok: !!(r && r.ok), reason: str(r ? r.reason : 'noanswer', 20) }));          // (1.5.0) the visualizer asks to hear this tab
    else if (d.type === 'yt-audio-stop') { send({ type: 'yt-audio-stop' }, () => {}); if (vizPort) { try { vizPort.disconnect(); } catch (e) { /* gone */ } vizPort = null; } }
    else if (d.type === 'yt-viz-pull') pull();          // (1.5.1) the next frame of the add-on's listening
    else if (d.type === 'yt-get') send({ type: 'yt-get', reqId: str(d.reqId, 40) }, (r) => post(r && r.result ? { type: 'yt-result', reqId: str(d.reqId, 40), ok: !!r.result.ok, items: (r.result.items || []).slice(0, 100).map(item), reason: str(r.result.reason, 20), cached: !!r.result.cached } : { type: 'yt-result', reqId: str(d.reqId, 40), pending: true }));
  });
  ext.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg) return;
    if (msg.type === 'yt-audio-id') { post({ type: 'yt-audio', ok: true, fromPopup: true }); reply({ ok: true }); return; }          // (1.5.0) from the toolbar button's "Let CRATE hear this tab"
    if (msg.type === 'yt-result') post({ type: 'yt-result', reqId: str(msg.reqId, 40), ok: !!msg.ok, items: (Array.isArray(msg.items) ? msg.items : []).slice(0, 100).map(item), reason: str(msg.reason, 20), cached: !!msg.cached });
    else if (msg.type === 'yt-state') { live = msg.state === 'loading' || msg.state === 'gap' || msg.state === 'stopped'; post({ type: 'yt-state', state: str(msg.state, 20), reason: str(msg.reason, 20), queue: Number(msg.queue) || 0, nextAt: Number(msg.nextAt) || 0 }); }
  });
  setInterval(() => { if (live) send({ type: 'yt-ping' }, () => {}); }, 8000);           // wakes the background while something is waiting
  post({ type: 'yt-script' });
})();
