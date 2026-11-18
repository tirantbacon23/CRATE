// ===== (1.135.121) The cover wall: the releases shown, as covers filling the whole screen =====
// ⛶ beside the grid / list buttons (or W): every release the view shows (filters, search and sort as they are) as a grid of covers edge
// to edge, full screen. − / + (or the slider, or Ctrl+wheel) make the covers smaller or bigger; T shows names under them; S shuffles
// the order; the release playing has a ring. A click opens a release's popup, a double-click plays it, right-click its menu. Esc leaves.
// Covers are drawn as they come into view, so thousands are fine.

const WALL_KEY = 'crate_wall_v1';
function wallPrefs() { try { return Object.assign({ size: 180, names: false, gap: 0 }, JSON.parse(localStorage.getItem(WALL_KEY) || '{}') || {}); } catch (e) { return { size: 180, names: false, gap: 0 }; } }
function wallSave(p) { try { localStorage.setItem(WALL_KEY, JSON.stringify(p)); } catch (e) { /* this visit */ } }
const wall = { el: null, items: [], shuffled: false, io: null, nodes: new Map(), space: null, L: null };
// (1.135.133) What's shown where you are: a playlist's releases (in its order and narrowing), the releases of your liked songs on Liked
// songs (narrowed as that page is), else the library as the view shows it
function wallSource() {
  const uniq = (arr) => { const seen = new Set(), out = []; arr.forEach(a => { if (a && !seen.has(a)) { seen.add(a); out.push(a); } }); return out; };
  if (state.activeTab === 'liked' && typeof likedShown === 'function') { try { return { items: uniq(likedShown().map(x => x.item)), label: 'Liked songs' }; } catch (e) { /* the library, then */ } }
  const pl = state.activePlaylistId && typeof activePlaylist === 'function' ? activePlaylist() : null;
  if (pl && typeof playlistViewOf === 'function' && typeof playlistAlbumFor === 'function') { try { return { items: uniq(playlistViewOf(pl).items.map(playlistAlbumFor)), label: pl.name || 'Playlist' }; } catch (e) { /* the library, then */ } }
  return { items: (state.filtered && state.filtered.length ? state.filtered : state.raw || []).slice(), label: '' };
}
function wallItems() { const src = wallSource(); wall.label = src.label; return src.items; }
function wallOpen() {
  if (wall.el) return;
  wall.items = wallItems(); wall.shuffled = false;
  const ov = document.createElement('div'); ov.id = 'coverWall'; ov.className = 'cw'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Cover wall');
  ov.innerHTML = `<div class="cw-bar"><span class="cw-name">CRATE</span><span class="cw-count"></span>
    <input type="search" class="cw-q" placeholder="Filter: words, genre:, year:, format:…" aria-label="Filter the releases" value="${escapeHtml(el.searchInput ? el.searchInput.value : '')}">
    <select class="cw-sel" data-cws="sort" aria-label="Sort">${wallOpts('sort')}</select><select class="cw-sel" data-cws="group" aria-label="Group by">${wallOpts('group')}</select><select class="cw-sel" data-cws="group2" aria-label="Then by">${wallOpts('group2')}</select>
    <button type="button" class="cw-btn cw-tog" data-cw="listened" title="Only releases you've logged a full listen for" aria-pressed="${!!state.listenedOnly}">Listened</button><button type="button" class="cw-btn" data-cw="clear" title="Clear the filter, the browser's selection and the listened filter">Clear</button>
    <span class="cw-sp"></span>
    <button type="button" class="cw-btn" data-cw="smaller" title="Smaller covers (−)" aria-label="Smaller covers">−</button><input type="range" class="cw-size" min="80" max="420" step="10" aria-label="Cover size"><button type="button" class="cw-btn" data-cw="bigger" title="Bigger covers (+)" aria-label="Bigger covers">+</button>
    <button type="button" class="cw-btn cw-tog" data-cw="names" title="Names under the covers (T)">Names</button><button type="button" class="cw-btn cw-tog" data-cw="gap" title="A little space between covers">Gaps</button><button type="button" class="cw-btn" data-cw="shuffle" title="Shuffle the order (S)">Shuffle</button>
    <button type="button" class="cw-btn" data-cw="close" title="Leave (Esc)" aria-label="Leave the cover wall">✕</button></div><div class="cw-grid" tabindex="0"></div>`;
  document.body.appendChild(ov); wall.el = ov;
  const grid = ov.querySelector('.cw-grid');
  ov.addEventListener('click', wallClick); ov.addEventListener('dblclick', wallDbl); ov.addEventListener('contextmenu', wallCtx);
  ov.querySelector('.cw-q').addEventListener('input', (e) => { const inp = el.searchInput; if (!inp) return; inp.value = e.target.value; inp.dispatchEvent(new Event('input', { bubbles: true })); });
  ov.addEventListener('change', (e) => { const sel = e.target.closest('[data-cws]'); if (!sel) return; wallSetting(sel.dataset.cws, sel.value); });
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
  clearInterval(wall.ring); if (wall.io) wall.io.disconnect(); if (wall.ro) wall.ro.disconnect(); wall.nodes.clear(); wall.space = null; wall.L = null; wall.stick = null; wall.ro = null;
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
  if (wall.L) wallRelayout(true);
}
function wallZoom(d) { const p = wallPrefs(); p.size = Math.max(80, Math.min(420, p.size + d)); wallSave(p); wallStyle(); }
// (1.135.126) the view's Group by / Then by as headings across the wall (not while shuffled)
function wallDisplay() {
  const g1 = state.groupBy && state.groupBy !== 'none' && !wall.shuffled && typeof groupItems === 'function' ? state.groupBy : '', g2 = g1 && state.groupBy2 && state.groupBy2 !== 'none' ? state.groupBy2 : '';
  if (!g1) return wall.items.map(it => ({ it }));
  const out = [];
  groupItems(wall.items, g1).forEach(g => { out.push({ head: g.label, n: g.items.length, lvl: 1 }); if (!g2) { g.items.forEach(it => out.push({ it })); return; } groupItems(g.items, g2).forEach(h => { out.push({ head: h.label, n: h.items.length, lvl: 2 }); h.items.forEach(it => out.push({ it })); }); });
  return out;
}
// (1.135.132) Only the covers on screen (and a screen and a half above and below) are made, and made again as the wall scrolls: before,
// every release was made at once (6,000 releases: 30,000 elements, over a second to open, scrolling at half speed). Each row's place is
// worked out from the cover size, so the scrollbar is right for the whole wall. A cover that arrives is put straight into its tile.
const WALL_CAP = 44, WALL_H1 = 52, WALL_H2 = 40;
function wallDraw() {
  const grid = wall.el.querySelector('.cw-grid'), n = wall.items.length;
  wall.el.querySelector('.cw-count').textContent = `${wall.label ? wall.label + ' · ' : ''}${n.toLocaleString()} release${n === 1 ? '' : 's'}${wall.shuffled ? ' · shuffled' : ''}`;
  wall.disp = wallDisplay();
  if (!wall.space) {
    grid.innerHTML = '<div class="cw-space"></div>'; wall.space = grid.firstChild;
    wall.stick = document.createElement('div'); wall.stick.className = 'cw-stick'; wall.stick.hidden = true; wall.el.appendChild(wall.stick);
    grid.addEventListener('scroll', () => { if (!wall.raf) wall.raf = requestAnimationFrame(() => { wall.raf = 0; wallPaint(); }); }, { passive: true });
    if (typeof ResizeObserver === 'function') { wall.ro = new ResizeObserver(() => { if (wall.el) wallRelayout(true); }); wall.ro.observe(grid); }
  }
  wall.nodes.forEach(n2 => n2.remove()); wall.nodes.clear();
  wallLayout(); wallPaint();
}
function wallLayout() {
  const grid = wall.el.querySelector('.cw-grid'), p = wallPrefs(), gap = p.gap ? 6 : 0, inner = Math.max(80, grid.clientWidth - gap * 2);
  // (1.135.151) fitted to the screen: a whole number of rows fills its height exactly (the size slider picks how many), then as many
  // columns as fit the width at that height, so the covers line up with the screen's edges at every size (near square: cropped a hair)
  const cap = p.names ? WALL_CAP : 0, H = Math.max(120, grid.clientHeight || window.innerHeight);
  const fitRows = Math.max(1, Math.round((H - gap) / (p.size + cap + gap))), ch = (H - gap) / fitRows - gap, ih = Math.max(40, ch - cap);
  const cols = Math.max(1, Math.round((inner + gap) / (ih + gap))), cw = (inner - (cols - 1) * gap) / cols;
  wall.space.style.setProperty('--cw-ih', ih + 'px');
  const rows = []; let y = gap, cur = null;
  wall.disp.forEach((d, i) => {
    if (d.head !== undefined) { cur = null; const h = d.lvl === 1 ? WALL_H1 : WALL_H2; rows.push({ head: i, y, h }); y += h; return; }
    if (!cur || cur.items.length === cols) { cur = { items: [], y, h: ch }; rows.push(cur); y += ch + gap; }
    cur.items.push(i);
  });
  wall.L = { cols, cw, ch, gap, rows, total: y + gap, px: Math.round(cw * (window.devicePixelRatio || 1)) };
  wall.space.style.height = wall.L.total + 'px';
}
function wallRelayout(keep) {          // the size, gaps, names or window changed: laid out again, the same covers at the top
  if (!wall.el || !wall.L) return;
  const grid = wall.el.querySelector('.cw-grid'), first = keep ? wallFirstShown() : -1;
  wall.nodes.forEach(n2 => n2.remove()); wall.nodes.clear(); wallLayout();
  if (first >= 0) { const r = wall.L.rows.find(r2 => r2.head === first || (r2.items && r2.items.includes(first))); if (r) grid.scrollTop = r.y; }
  wallPaint();
}
function wallFirstShown() { const g = wall.el.querySelector('.cw-grid'), r = wallRowAt(g.scrollTop); const row = wall.L.rows[r]; return row ? (row.head !== undefined ? row.head : row.items[0]) : -1; }
function wallRowAt(y) { const R = wall.L.rows; let lo = 0, hi = R.length - 1, ans = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (R[m].y <= y) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; }
function wallImg(u) {          // a smaller copy of an iTunes cover for small tiles (its address says the size)
  const px = wall.L ? wall.L.px : 600, want = px <= 200 ? 200 : px <= 400 ? 400 : 600;
  return /mzstatic\.com/.test(u || '') ? String(u).replace(/\/(\d+)x(\d+)(bb|cc)?(\.[a-z]+)$/i, (m0, a, b, c, ext) => `/${want}x${want}${c || 'bb'}${ext}`) : u;
}
function wallCellNode(i) {
  const d = wall.disp[i], L = wall.L;
  if (d.head !== undefined) { const h = document.createElement('div'); h.className = `cw-head cw-head-${d.lvl}`; h.innerHTML = `${escapeHtml(String(d.head))}<span> · ${d.n.toLocaleString()}</span>`; return h; }
  const it = d.it, k = artKey(it), c = state.artCache[k], c2 = document.createElement('div');
  c2.className = 'cw-cell' + (typeof nowPlayingItem !== 'undefined' && nowPlayingItem === it ? ' cw-now' : ''); c2.dataset.i = i; c2.title = it.title + ' · ' + it.artist;
  c2.innerHTML = `<img class="cw-art" alt="" decoding="async" draggable="false" src="${escapeHtml(wallImg(c && c.art ? c.art : srchItemCover(it)))}"><div class="cw-cap"><b>${escapeHtml(it.title)}</b><span>${escapeHtml(it.artist)}</span></div>`;
  c2._key = k;
  const coverOk = it.cover && (typeof badArtUrls === 'undefined' || badArtUrls[k] !== it.cover);
  if (!(c && c.art) && !coverOk && typeof fetchArt === 'function' && typeof artFetchInFlight !== 'undefined' && !artFetchInFlight.has(k)) { artFetchInFlight.add(k); fetchArt(it); }          // (as the grid's cards do)
  return c2;
}
function wallPaint() {
  if (!wall.el || !wall.L) return;
  const g = wall.el.querySelector('.cw-grid'), L = wall.L, H = g.clientHeight, top = g.scrollTop;
  const a = wallRowAt(Math.max(0, top - H * 1.5)), want = new Set();
  for (let r = a; r < L.rows.length && L.rows[r].y < top + H * 2.5; r++) {
    const row = L.rows[r];
    if (row.head !== undefined) { want.add(row.head); if (!wall.nodes.has(row.head)) { const n2 = wallCellNode(row.head); n2.style.cssText = `top:${row.y}px;height:${row.h}px`; wall.space.appendChild(n2); wall.nodes.set(row.head, n2); } continue; }
    row.items.forEach((i, j) => { want.add(i); if (wall.nodes.has(i)) return; const n2 = wallCellNode(i); n2.style.cssText = `left:${L.gap + j * (L.cw + L.gap)}px;top:${row.y}px;width:${L.cw}px;height:${L.ch}px`; wall.space.appendChild(n2); wall.nodes.set(i, n2); });
  }
  wall.nodes.forEach((n2, i) => { if (!want.has(i)) { n2.remove(); wall.nodes.delete(i); } });
  // the heading of the group you're in, pinned at the top
  let h1 = null, h2 = null; for (let r = wallRowAt(top); r >= 0; r--) { const row = L.rows[r]; if (row.head === undefined) continue; const d = wall.disp[row.head]; if (d.lvl === 2 && !h2 && !h1) h2 = d; if (d.lvl === 1) { h1 = d; break; } }
  let onHead = false; for (let r = wallRowAt(top); r < L.rows.length && L.rows[r].y < top + 70; r++) if (L.rows[r].head !== undefined && L.rows[r].y >= top - 4) { onHead = true; break; }          // (a heading coming up to the top: it shows itself)
  if (h1 && !onHead) { wall.stick.hidden = false; const t = `${escapeHtml(String(h1.head))}${h2 ? ` <i>›</i> ${escapeHtml(String(h2.head))}` : ''}`; if (wall.stick._t !== t) { wall.stick.innerHTML = t; wall.stick._t = t; } } else wall.stick.hidden = true;
}
function wallRing() {
  if (!wall.el) return;
  if (el.deckOverlay && el.deckOverlay.classList.contains('open')) { wallClose(); return; }          // (the release's page opened from the wall: it steps aside)
  const it = typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null;
  wall.nodes.forEach((n2, i) => { const d = wall.disp[i]; if (d && d.it) n2.classList.toggle('cw-now', !!it && d.it === it); });
}
// a cover that arrives goes straight into its tile (the wall's covers aren't in the page-wide pass over every cover)
if (typeof applyCachedArtFor === 'function') { const wallBaseArt = applyCachedArtFor; applyCachedArtFor = function (key) { const r = wallBaseArt.apply(this, arguments); if (wall.el && state.artCache[key] && state.artCache[key].art) wall.nodes.forEach(n2 => { if (n2._key === key) { const im = n2.querySelector('img'); const u = wallImg(state.artCache[key].art); if (im && im.src !== u) im.src = u; } }); return r; }; }
const wallCellItem = (e) => { const c = e.target.closest('.cw-cell'); return c ? ((wall.disp || [])[+c.dataset.i] || {}).it || null : null; };
let wallClickT = 0;
function wallClick(e) {
  const b = e.target.closest('[data-cw]');
  if (b) { const a = b.dataset.cw, p = wallPrefs();
    if (a === 'close') wallClose(); else if (a === 'smaller') wallZoom(-20); else if (a === 'bigger') wallZoom(20);
    else if (a === 'listened') { if (el.listenedFilterBtn) el.listenedFilterBtn.click(); b.setAttribute('aria-pressed', String(!!state.listenedOnly)); }
    else if (a === 'clear') { const inp = el.searchInput; if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); } wall.el.querySelector('.cw-q').value = ''; if (state.listenedOnly && el.listenedFilterBtn) el.listenedFilterBtn.click(); if (state.navFilter) { state.navFilter = null; if (typeof buildLeftList === 'function') buildLeftList(); } applyFiltersSort(); wall.el.querySelector('[data-cw="listened"]').setAttribute('aria-pressed', 'false'); }
    else if (a === 'names') { p.names = !p.names; wallSave(p); wallStyle(); } else if (a === 'gap') { p.gap = !p.gap; wallSave(p); wallStyle(); }
    else if (a === 'shuffle') { for (let i = wall.items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [wall.items[i], wall.items[j]] = [wall.items[j], wall.items[i]]; } wall.shuffled = true; wall.el.querySelector('.cw-grid').scrollTop = 0; wallDraw(); }
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


// ----- (1.135.126) the view's sort, grouping and filters, from the wall -----
// They are the view's own (the same buttons are pressed), so the wall and the view always agree, and the wall follows whenever the view's
// list changes (a filter typed here or anywhere, a genre picked in the browser before, a release added…).
function wallOpts(kind) {
  if (kind === 'sort') { const cur = state.activePlaylistId ? state.playlistSort : state.sort; return [...document.querySelectorAll('#sortFilterMenu .sort-filter-option[data-sort]')].filter(b => !b.hidden).map(b => `<option value="${b.dataset.sort}"${b.dataset.sort === cur ? ' selected' : ''}>${escapeHtml(b.textContent.trim())}</option>`).join(''); }
  const sel = kind === 'group' ? '#groupBySubmenu > button[data-group]' : '#groupBy2Submenu > button[data-group2]', cur = kind === 'group' ? (state.groupBy || 'none') : (state.groupBy2 || 'none');
  const att = kind === 'group' ? 'group' : 'group2';
  return [...document.querySelectorAll(sel)].map(b => `<option value="${b.dataset[att]}"${b.dataset[att] === cur ? ' selected' : ''}>${escapeHtml(kind === 'group' ? (b.dataset[att] === 'none' ? 'No grouping' : 'Group: ' + b.textContent.trim()) : (b.dataset[att] === 'none' ? 'Then: none' : 'Then: ' + b.textContent.trim()))}</option>`).join('');
}
function wallSetting(kind, v) {
  const btn = kind === 'sort' ? document.querySelector(`#sortFilterMenu .sort-filter-option[data-sort="${v}"]`) : kind === 'group' ? document.querySelector(`#groupBySubmenu > button[data-group="${v}"]`) : document.querySelector(`#groupBy2Submenu > button[data-group2="${v}"]`);
  if (btn) btn.click();
  if (el.sortFilterMenu) el.sortFilterMenu.hidden = true; if (el.albumsViewMenu) el.albumsViewMenu.hidden = true;
  wall.shuffled = false; wallRefresh();
}
function wallRefresh() {
  if (!wall.el) return;
  const g = wall.el.querySelector('.cw-grid'), top = g.scrollTop;
  wall.items = wallItems(); wall.shuffled = false; wallDraw();
  ['sort', 'group', 'group2'].forEach(k => { const s = wall.el.querySelector(`[data-cws="${k}"]`); if (s) s.innerHTML = wallOpts(k); });
  const lb = wall.el.querySelector('[data-cw="listened"]'); if (lb) lb.setAttribute('aria-pressed', String(!!state.listenedOnly));
  g.scrollTop = Math.min(top, g.scrollHeight); wallPaint();
}
const wallBaseAFS = applyFiltersSort;
applyFiltersSort = function () { const r = wallBaseAFS.apply(this, arguments); if (wall.el) { clearTimeout(wallRefresh.t); wallRefresh.t = setTimeout(wallRefresh, 120); } return r; };
const wallBaseRenderGrid = renderGrid;
renderGrid = function () { const r = wallBaseRenderGrid.apply(this, arguments); if (wall.el) { clearTimeout(wallRefresh.t); wallRefresh.t = setTimeout(wallRefresh, 120); } return r; };          // (Group by and Then by redraw the grid without filtering again)

// ⛶ on the Liked songs page too
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-lkp-wall]'); if (!b) return; e.stopPropagation(); wallOpen(); });
// the liked page and a playlist redraw without the view's filtering: the wall follows them too
if (typeof renderLikedPage === 'function') { const wallBaseLiked = renderLikedPage; renderLikedPage = function () { const r = wallBaseLiked.apply(this, arguments); if (wall.el) { clearTimeout(wallRefresh.t); wallRefresh.t = setTimeout(wallRefresh, 120); } return r; }; }
