// ===== (1.135.121) The cover wall: the releases shown, as covers filling the whole screen =====
// ⛶ beside the grid / list buttons (or W): every release the view shows (filters, search and sort as they are) as a grid of covers edge
// to edge, full screen. − / + (or the slider, or Ctrl+wheel) make the covers smaller or bigger; T shows names under them; S shuffles
// the order; the release playing has a ring. A click opens a release's popup, a double-click plays it, right-click its menu. Esc leaves.
// Covers are drawn as they come into view, so thousands are fine.

const WALL_KEY = 'crate_wall_v1';
function wallPrefs() { try { return Object.assign({ size: 180, names: false, gap: 0 }, JSON.parse(localStorage.getItem(WALL_KEY) || '{}') || {}); } catch (e) { return { size: 180, names: false, gap: 0 }; } }
function wallSave(p) { try { localStorage.setItem(WALL_KEY, JSON.stringify(p)); } catch (e) { /* this visit */ } }
const wall = { el: null, items: [], shuffled: false, io: null };
function wallItems() { return (state.filtered && state.filtered.length ? state.filtered : state.raw || []).slice(); }
function wallOpen() {
  if (wall.el) return;
  wall.items = wallItems(); wall.shuffled = false;
  const ov = document.createElement('div'); ov.id = 'coverWall'; ov.className = 'cw'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Cover wall');
  ov.innerHTML = `<div class="cw-bar"><span class="cw-name">CRATE</span><span class="cw-count"></span><span class="cw-sp"></span>
    <button type="button" class="cw-btn" data-cw="smaller" title="Smaller covers (−)" aria-label="Smaller covers">−</button><input type="range" class="cw-size" min="80" max="420" step="10" aria-label="Cover size"><button type="button" class="cw-btn" data-cw="bigger" title="Bigger covers (+)" aria-label="Bigger covers">+</button>
    <button type="button" class="cw-btn cw-tog" data-cw="names" title="Names under the covers (T)">Names</button><button type="button" class="cw-btn cw-tog" data-cw="gap" title="A little space between covers">Gaps</button><button type="button" class="cw-btn" data-cw="shuffle" title="Shuffle the order (S)">Shuffle</button>
    <button type="button" class="cw-btn" data-cw="close" title="Leave (Esc)" aria-label="Leave the cover wall">✕</button></div><div class="cw-grid" tabindex="0"></div>`;
  document.body.appendChild(ov); wall.el = ov;
  const grid = ov.querySelector('.cw-grid');
  ov.addEventListener('click', wallClick); ov.addEventListener('dblclick', wallDbl); ov.addEventListener('contextmenu', wallCtx);
  ov.querySelector('.cw-size').addEventListener('input', (e) => { const p = wallPrefs(); p.size = +e.target.value; wallSave(p); wallStyle(); });
  grid.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); wallZoom(e.deltaY < 0 ? 20 : -20); }, { passive: false });
  document.addEventListener('keydown', wallKey, true);
  let idle = 0; ov.addEventListener('mousemove', () => { ov.classList.remove('cw-idle'); clearTimeout(idle); idle = setTimeout(() => ov.classList.add('cw-idle'), 2500); });
  wallDraw(); wallStyle();
  try { if (ov.requestFullscreen && !document.fullscreenElement) ov.requestFullscreen().catch(() => {}); } catch (e) { /* in the window, then */ }
  document.addEventListener('fullscreenchange', wallFsChange);
  grid.focus({ preventScroll: true });
  wall.ring = setInterval(wallRing, 700);
}
function wallFsChange() { if (wall.el && !document.fullscreenElement && wall.wasFs) wallClose(); wall.wasFs = !!document.fullscreenElement; }
function wallClose() {
  if (!wall.el) return;
  document.removeEventListener('keydown', wallKey, true); document.removeEventListener('fullscreenchange', wallFsChange);
  clearInterval(wall.ring); if (wall.io) wall.io.disconnect();
  if (document.fullscreenElement === wall.el && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  wall.el.remove(); wall.el = null; wall.wasFs = false;
}
function wallStyle() {
  if (!wall.el) return; const p = wallPrefs();
  wall.el.style.setProperty('--cw-size', p.size + 'px'); wall.el.style.setProperty('--cw-gap', p.gap ? '6px' : '0px');
  wall.el.classList.toggle('cw-names', !!p.names);
  wall.el.querySelector('.cw-size').value = p.size;
  wall.el.querySelector('[data-cw="names"]').setAttribute('aria-pressed', String(!!p.names));
  wall.el.querySelector('[data-cw="gap"]').setAttribute('aria-pressed', String(!!p.gap));
}
function wallZoom(d) { const p = wallPrefs(); p.size = Math.max(80, Math.min(420, p.size + d)); wallSave(p); wallStyle(); }
function wallDraw() {
  const grid = wall.el.querySelector('.cw-grid'), n = wall.items.length;
  wall.el.querySelector('.cw-count').textContent = `${n.toLocaleString()} release${n === 1 ? '' : 's'}${wall.shuffled ? ' · shuffled' : ''}`;
  grid.innerHTML = wall.items.map((it, i) => `<div class="cw-cell" data-i="${i}" title="${escapeHtml(it.title + ' · ' + it.artist)}"><img class="cw-art art" data-key="${escapeHtml(artKey(it))}" src="${escapeHtml(srchItemCover(it))}" alt="" loading="lazy" decoding="async"><div class="cw-cap"><b>${escapeHtml(it.title)}</b><span>${escapeHtml(it.artist)}</span></div></div>`).join('');
  if (wall.io) wall.io.disconnect();
  // (1.135.125) a cover not fetched yet is fetched as it comes near the screen, as the grid's cards do (before, releases the grid had
  // never shown had no cover here, so most of the wall below the first screens was blank); it fills in where it is when it arrives
  wall.io = new IntersectionObserver((ents) => ents.forEach(e => { if (!e.isIntersecting) return; const a = e.target, it = wall.items[+a.parentNode.dataset.i]; wall.io.unobserve(a); if (!it) return;
    const k = artKey(it), c = state.artCache[k], coverOk = it.cover && (typeof badArtUrls === 'undefined' || badArtUrls[k] !== it.cover);
    if (c && c.art) { if (a.src !== c.art) a.src = c.art; return; }
    if (!coverOk && typeof fetchArt === 'function' && typeof artFetchInFlight !== 'undefined' && !artFetchInFlight.has(k)) { artFetchInFlight.add(k); fetchArt(it); }
  }), { root: grid, rootMargin: '800px' });
  grid.querySelectorAll('.cw-art').forEach(a => wall.io.observe(a));
  wallRing();
}
function wallRing() {
  if (!wall.el) return;
  if (el.deckOverlay && el.deckOverlay.classList.contains('open')) { wallClose(); return; }          // (the release's page opened from the wall: it steps aside)
  const it = typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null;
  wall.el.querySelectorAll('.cw-cell.cw-now').forEach(c => c.classList.remove('cw-now'));
  if (!it) return; const i = wall.items.indexOf(it); if (i < 0) return;
  const c = wall.el.querySelector(`.cw-cell[data-i="${i}"]`); if (c) c.classList.add('cw-now');
}
const wallCellItem = (e) => { const c = e.target.closest('.cw-cell'); return c ? wall.items[+c.dataset.i] : null; };
let wallClickT = 0;
function wallClick(e) {
  const b = e.target.closest('[data-cw]');
  if (b) { const a = b.dataset.cw, p = wallPrefs();
    if (a === 'close') wallClose(); else if (a === 'smaller') wallZoom(-20); else if (a === 'bigger') wallZoom(20);
    else if (a === 'names') { p.names = !p.names; wallSave(p); wallStyle(); } else if (a === 'gap') { p.gap = !p.gap; wallSave(p); wallStyle(); }
    else if (a === 'shuffle') { for (let i = wall.items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [wall.items[i], wall.items[j]] = [wall.items[j], wall.items[i]]; } wall.shuffled = true; wallDraw(); wall.el.querySelector('.cw-grid').scrollTop = 0; }
    return; }
  const it = wallCellItem(e), cell = e.target.closest('.cw-cell'); if (!it) return;
  clearTimeout(wallClickT); wallClickT = setTimeout(() => wallPeek(it, cell), 260);          // (a double-click plays it instead)
}
function wallDbl(e) { const it = wallCellItem(e); if (!it) return; clearTimeout(wallClickT); if (typeof playAlbumNow === 'function') playAlbumNow(it); setTimeout(wallRing, 600); }
function wallCtx(e) { const it = wallCellItem(e); if (!it) return; e.preventDefault(); if (typeof openAlbumCardContextMenu !== 'function') return; openAlbumCardContextMenu(it, e.clientX, e.clientY); const ms = document.querySelectorAll('.album-card-menu'), m = ms[ms.length - 1]; if (m && wall.el && !wall.el.contains(m)) wall.el.appendChild(m); }          // (in full screen only what's inside the wall shows: the menu is moved in)
// the release's popup, over the wall (fullscreen shows only what's inside the wall, so the popup is moved in while it's open)
function wallPeek(it, cell) {
  if (typeof openAlbumQuickPeek !== 'function') return;
  openAlbumQuickPeek(it, cell);
  const qp = el.albumQuickPeek; if (!qp || !wall.el) return;
  if (!wall.qpHome) wall.qpHome = { parent: qp.parentNode, next: qp.nextSibling };
  wall.el.appendChild(qp); qp.classList.add('cw-peek');
  const back = new MutationObserver(() => { if (qp.hidden) { back.disconnect(); qp.classList.remove('cw-peek'); const h = wall.qpHome; if (h && h.parent) h.parent.insertBefore(qp, h.next && h.next.parentNode === h.parent ? h.next : null); wall.qpHome = null; } });
  back.observe(qp, { attributes: true, attributeFilter: ['hidden'] });
}
function wallKey(e) {
  if (!wall.el) return;
  if (e.target.closest && e.target.closest('input, textarea, select') && !e.target.classList.contains('cw-size')) return;
  if (el.albumQuickPeek && !el.albumQuickPeek.hidden && e.key === 'Escape') return;          // (the popup closes first)
  const k = e.key;
  if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); wallClose(); }
  else if (k === '+' || k === '=') { e.preventDefault(); wallZoom(20); }
  else if (k === '-' || k === '_') { e.preventDefault(); wallZoom(-20); }
  else if (k === 't' || k === 'T') { const p = wallPrefs(); p.names = !p.names; wallSave(p); wallStyle(); }
  else if (k === 's' || k === 'S') { wall.el.querySelector('[data-cw="shuffle"]').click(); }
  else return;
}
// ⛶ beside the grid / list buttons, and W anywhere (not while typing)
(function wallInit() {
  const go = () => {
    const lb = document.getElementById('viewListBtn'); if (!lb) return setTimeout(go, 500); if (document.getElementById('viewWallBtn')) return;
    const b = document.createElement('button'); b.id = 'viewWallBtn'; b.type = 'button'; b.className = 'view-btn'; b.textContent = '⛶'; b.title = 'Cover wall: the releases shown, full screen (W)'; b.setAttribute('aria-label', 'Cover wall');
    lb.after(b); b.addEventListener('click', (e) => { e.stopPropagation(); wallOpen(); });
    document.addEventListener('keydown', (e) => {
      if (wall.el || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'w' && e.key !== 'W')) return;
      const t = e.target; if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (document.querySelector('.arrange-overlay:not([hidden]), #deckOverlay.open')) return;
      e.preventDefault(); wallOpen();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
