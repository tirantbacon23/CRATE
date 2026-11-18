// (1.135.157) When a new version of CRATE has been put up, the page refreshes itself. Every minute (and when you come back to the tab)
// it reads CURRENT_VERSION from the CHANGELOG.txt beside the page, past any cache; a newer one than this page's APP_VERSION means the
// update is up. It refreshes straight away when nothing would be lost; while music plays, or you're typing in a box, or a form or window
// is open, a small bar says a new version is ready (Refresh now / Later) and it refreshes by itself once you're done: the music
// paused or stopped, the box left, the window closed. Not in the test page (?crate-test).
const AU = { latest: '', timer: 0, waitT: 0, later: 0 };
function auNewer(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; }
async function auCheck() {
  if (/[?&]crate-test\b/.test(location.search) || !/^https?:$/.test(location.protocol)) return;
  try {
    const r = await fetch('CHANGELOG.txt?au=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const m = /CURRENT_VERSION:\s*([\d.]+)/.exec((await r.text()).slice(0, 4000)); if (!m) return;
    if (auNewer(m[1], APP_VERSION)) { AU.latest = m[1]; auTry(); }
  } catch (e) { /* offline: next time */ }
}
function auBusy() {
  if (typeof pbPlaying === 'function' && pbPlaying()) return 'music is playing';
  const a = document.activeElement;
  if (a && (a.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'range' && a.type !== 'checkbox' && a.type !== 'button'))) return 'you’re typing';
  const form = [...document.querySelectorAll('.arrange-overlay, .mood-overlay, .del-overlay, .pt-overlay, .rymq-overlay, #addOverlay, #editOverlay')].some(n => !n.hidden && n.offsetParent !== null);
  if (form) return 'a window is open';
  if (typeof bm !== 'undefined' && bm && bm.started && typeof bmEl === 'function') { const ov = bmEl('batchMatchOverlay'); if (ov && !ov.hidden) return 'Match songs is open'; }
  return '';
}
function auReload() { try { if (typeof pbSnapshotSave === 'function') pbSnapshotSave(); } catch (e) { /* fine */ } location.reload(); }
function auTry() {
  if (!AU.latest) return;
  const why = auBusy();
  if (!why && !AU.later) { auReload(); return; }
  auBar(why);
  clearTimeout(AU.waitT); AU.waitT = setTimeout(auTry, 4000);          // (asked again every few seconds: refreshes once you're done)
}
function auBar(why) {
  let b = document.getElementById('auBar');
  if (!b) {
    b = document.createElement('div'); b.id = 'auBar'; b.className = 'au-bar'; b.setAttribute('role', 'status'); document.body.appendChild(b);
    b.addEventListener('click', (e) => { const k = e.target.closest('[data-au]'); if (!k) return; if (k.dataset.au === 'now') auReload(); else { AU.later = Date.now(); b.hidden = true; clearTimeout(AU.waitT); setTimeout(() => { AU.later = 0; auTry(); }, 20 * 60e3); } });
  }
  if (AU.later) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<span><b>CRATE ${escapeHtml(AU.latest)}</b> is ready. It refreshes by itself once ${escapeHtml(why || 'you’re done')}${why === 'music is playing' ? ' (pause it, or let the queue end)' : ''}.</span><button type="button" class="au-btn au-pri" data-au="now">Refresh now</button><button type="button" class="au-btn" data-au="later">Later</button>`;
}
(function () {
  setTimeout(auCheck, 15000);
  AU.timer = setInterval(auCheck, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) auCheck(); });
  window.addEventListener('focus', () => auCheck());
})();
