// CRATE — P2P, phase 0: search Soulseek through the CRATE for P2P add-on (1.96.0).
// One part of the page's script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope.
//
// The add-on talks to slskd, a Soulseek client you run on your own computer, and keeps its address and API key; this page never sees the key.
// Phase 0 only searches and shows what was found, grouped by folder (one folder, one candidate release). Nothing is downloaded yet; matching a
// folder to your tracklist (phase 1) and downloading it (phase 2) come next. Opened from a release's right-click menu ("Find on P2P…") or from
// ⚙ → "P2P search…" for any text.
const p2p = { ready: false, version: '', configured: false, calls: new Map(), seq: 0, cur: null };
const p2pSay = (op, extra) => window.postMessage(Object.assign({ source: 'crate-app', type: 'p2p-call', op }, extra || {}), window.location.origin);
function p2pCall(op, extra, ms) {                                   // -> the add-on's answer, or { ok: false, reason: 'noanswer' }
  return new Promise((resolve) => {
    const callId = 'p' + Date.now().toString(36) + (++p2p.seq), t = setTimeout(() => { p2p.calls.delete(callId); resolve({ ok: false, reason: 'noanswer' }); }, ms || 12000);
    p2p.calls.set(callId, (r) => { clearTimeout(t); p2p.calls.delete(callId); resolve(r || { ok: false, reason: 'noanswer' }); });
    p2pSay(op, Object.assign({ callId }, extra || {}));
  });
}
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== window.location.origin) return; const d = e.data;
  if (!d || d.source !== 'crate-addon') return;
  if (d.type === 'p2p-reply') { const f = p2p.calls.get(d.callId); if (f) f(d.resp); }
  else if (d.type === 'p2p-script') p2pHello();
});
async function p2pHello() {
  const r = await p2pCall('hello', null, 4000);
  if (r.ok) { p2p.ready = true; p2p.version = r.version || ''; p2p.configured = !!r.configured; }
  if (p2p.cur) p2pRender();
}
setTimeout(p2pHello, 900);

function p2pWhy(r) {
  return ({ noanswer: 'The CRATE for P2P add-on didn’t answer. Is it installed and connected to this page (its options page says how)? If you just reloaded the add-on, reload CRATE too.',
    setup: 'The add-on isn’t set up yet: open its options and enter slskd’s address and API key.',
    unreachable: 'The add-on couldn’t reach slskd. Is slskd running on your computer?',
    auth: 'slskd refused the add-on’s API key. Check it in the add-on’s options.',
    denied: 'The add-on is connected to a different CRATE address. Connect this one in its options.',
    unknown: 'That search has gone (the browser was restarted, say). Search again.',
    bad: 'That search text can’t be used: 2 to 200 characters.' })[r && r.reason] || `slskd answered with an error${r && r.status ? ' (' + r.status + ')' : ''}${r && r.detail ? ': ' + r.detail : ''}.`;
}
const p2pSize = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : b ? Math.max(1, Math.round(b / 1e3)) + ' KB' : '';
const p2pLen = (sec) => sec ? formatMs(sec * 1000) : '';

// ----- the dialog -----
function p2pEnsureDom() {
  if (document.getElementById('p2pOverlay')) return;
  const ov = document.createElement('div'); ov.id = 'p2pOverlay'; ov.className = 'arrange-overlay'; ov.hidden = true;
  ov.innerHTML = `<div class="arrange-modal p2p-modal" role="dialog" aria-modal="true" aria-labelledby="p2pTitle">
    <div class="arrange-header"><h2 id="p2pTitle">Find on P2P</h2><button type="button" id="p2pClose" class="modal-x" aria-label="Close">✕</button></div>
    <form id="p2pForm" class="p2p-form"><input id="p2pQuery" type="search" autocomplete="off" spellcheck="false" aria-label="Search Soulseek for"><button type="submit" id="p2pGo" class="chip-btn p2p-go">Search</button><button type="button" id="p2pStop" class="chip-btn" hidden>Stop</button></form>
    <p id="p2pStatus" class="p2p-status" role="status"></p>
    <i id="p2pBar" class="p2p-bar" hidden><b></b></i>
    <div id="p2pResults" class="p2p-results"></div>
    <p class="p2p-foot">Search only, for now: nothing is downloaded. Results come from slskd, through the CRATE for P2P add-on.</p>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) p2pClose(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); p2pClose(); } });
  document.getElementById('p2pClose').addEventListener('click', p2pClose);
  document.getElementById('p2pForm').addEventListener('submit', (e) => { e.preventDefault(); p2pSearch(document.getElementById('p2pQuery').value); });
  document.getElementById('p2pStop').addEventListener('click', p2pStop);
  document.getElementById('p2pResults').addEventListener('click', (e) => { const h = e.target.closest('[data-p2p-folder]'); if (!h) return; const row = h.closest('.p2p-folder'); row.classList.toggle('open'); h.setAttribute('aria-expanded', row.classList.contains('open')); });
}
function p2pOpen(item) {                                            // item: a release (prefills "Artist Title"), or nothing (free search)
  p2pEnsureDom();
  const ov = document.getElementById('p2pOverlay'), q = document.getElementById('p2pQuery');
  p2p.cur = { item: item || null, reqId: '', state: 'idle', folders: [], responses: 0, files: 0, error: '' };
  q.value = item ? `${item.artist || ''} ${item.title || ''}`.replace(/\s+/g, ' ').trim() : '';
  document.getElementById('p2pTitle').textContent = item ? `Find on P2P: ${item.title || ''}` : 'P2P search';
  ov.hidden = false; p2pRender(); q.focus(); q.select();
  if (!p2p.ready) p2pHello();
}
function p2pClose() { const ov = document.getElementById('p2pOverlay'); if (!ov || ov.hidden) return; p2pStop(); ov.hidden = true; p2p.cur = null; }
async function p2pSearch(text) {
  const c = p2p.cur; if (!c) return;
  if (c.reqId && c.state === 'searching') await p2pStop();
  const reqId = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  Object.assign(c, { reqId, state: 'searching', folders: [], responses: 0, files: 0, error: '', started: Date.now() }); p2pRender();
  const r = await p2pCall('search', { reqId, q: String(text || '').trim() });
  if (p2p.cur !== c || c.reqId !== reqId) return;
  if (!r.ok) { c.state = 'error'; c.error = p2pWhy(r); p2pRender(); return; }
  const tick = async () => {
    if (p2p.cur !== c || c.reqId !== reqId || c.state !== 'searching') return;
    const p = await p2pCall('poll', { reqId });
    if (p2p.cur !== c || c.reqId !== reqId || c.state !== 'searching') return;
    if (!p.ok) { c.state = 'error'; c.error = p2pWhy(p); p2pRender(); return; }
    Object.assign(c, { responses: p.responses, files: p.files, folders: p.folders || c.folders });
    if (p.done) c.state = 'done'; p2pRender();
    if (!p.done) setTimeout(tick, 1500);
  };
  setTimeout(tick, 1200);
}
async function p2pStop() {
  const c = p2p.cur; if (!c || !c.reqId || c.state !== 'searching') return;
  c.state = 'done'; p2pRender(); await p2pCall('cancel', { reqId: c.reqId });
}
function p2pRender() {
  const c = p2p.cur; if (!c) return;
  const st = document.getElementById('p2pStatus'), bar = document.getElementById('p2pBar'), res = document.getElementById('p2pResults');
  document.getElementById('p2pStop').hidden = c.state !== 'searching'; document.getElementById('p2pGo').disabled = c.state === 'searching';
  bar.hidden = c.state !== 'searching';
  if (c.state === 'searching') bar.firstChild.style.width = Math.min(100, (Date.now() - c.started) / 150).toFixed(1) + '%';          // a search runs about 15 seconds
  const n = c.folders.length;
  st.className = 'p2p-status' + (c.state === 'error' ? ' bad' : '');
  st.textContent = c.state === 'error' ? c.error
    : !p2p.ready ? 'Waiting for the CRATE for P2P add-on… (not installed? Its options page says how to connect it to this CRATE.)'
    : !p2p.configured ? 'The add-on isn’t set up yet: open its options and enter slskd’s address and API key.'
    : c.state === 'idle' ? 'Searches Soulseek through your slskd. Takes about 15 seconds.'
    : c.state === 'searching' ? `Searching… ${c.responses} user${c.responses === 1 ? '' : 's'} answered so far.`
    : n ? `${n} folder${n === 1 ? '' : 's'} with audio, from ${c.responses} user${c.responses === 1 ? '' : 's'}. Ones you could start on now are first.`
    : 'Nothing found. Try fewer words (the artist and the release’s main title), or check that slskd is logged in to Soulseek.';
  res.innerHTML = c.folders.map((f, i) => {
    const fmt = (f.ext || '?').toUpperCase() + (f.lossless ? (f.files[0] && f.files[0].bitDepth ? ` ${f.files[0].bitDepth}/${Math.round((f.files[0].sampleRate || 44100) / 100) / 10}` : '') : f.bitRate ? ` ${f.bitRate}` : '');
    const avail = f.locked >= f.count ? '' : f.freeSlot ? '<span class="p2p-pill ok">Free slot</span>' : `<span class="p2p-pill">Queue ${f.queue}</span>`;          // (all locked: only "Locked" says anything)
    return `<div class="p2p-folder">
      <button type="button" class="p2p-folder-head" data-p2p-folder="${i}" aria-expanded="false">
        <span class="p2p-name"><b>${escapeHtml(f.name)}</b>${f.parent ? `<small>${escapeHtml(f.parent)}</small>` : ''}</span>
        <span class="p2p-meta"><span class="p2p-fmt${f.lossless ? ' lossless' : ''}">${escapeHtml(fmt)}</span><span>${f.count} song${f.count === 1 ? '' : 's'}</span><span>${p2pLen(f.totalSec)}</span><span>${p2pSize(f.totalSize)}</span>${avail}${f.locked ? '<span class="p2p-pill bad" title="This user only shares these with friends">Locked</span>' : ''}</span>
        <span class="p2p-user">${escapeHtml(f.user)}${f.speed ? ` · ${p2pSize(f.speed)}/s` : ''}</span>
      </button>
      <ol class="p2p-files">${f.files.map(x => `<li><span>${escapeHtml(x.name)}</span><span>${p2pLen(x.lengthSec)}</span><span>${p2pSize(x.size)}</span></li>`).join('')}</ol>
    </div>`;
  }).join('');
}
setInterval(() => { if (p2p.cur && p2p.cur.state === 'searching') p2pRender(); }, 500);          // the bar moves between answers
(function p2pWire() {                                               // ⚙ → P2P search…
  const m = document.getElementById('menuActivity'); if (!m) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'menuP2p'; b.textContent = 'P2P search…';
  m.insertAdjacentElement('afterend', b);
  b.addEventListener('click', () => { const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; p2pOpen(null); });
})();
