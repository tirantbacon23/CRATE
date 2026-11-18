// (1.135.140) Several releases picked at once in the left list (the browser column, by album): Ctrl/⌘-click adds or takes away one, Shift-click
// takes every release between the last one clicked and this one. The catalogue then shows just those, and they are selected too, so a right-click
// on any of them (or the selection bar) acts on all of them: play, queue, add to a playlist, match songs, delete. A plain click goes back to one.
function lmsHas(nf, row) {
  if (!nf._s || nf._s.src !== nf.multi) { const st = new Set((nf.multi || []).map(String)); st.src = nf.multi; Object.defineProperty(nf, '_s', { value: st, writable: true, configurable: true, enumerable: false }); }
  return nf._s.has(String(row));
}
function lmsPicked() { const nf = state.navFilter; if (!nf || nf.mode !== 'album') return []; return nf.multi ? nf.multi.slice() : [String(nf.value)]; }
function lmsApply(keys) {
  keys = [...new Set(keys.map(String))];
  if (!keys.length) state.navFilter = null;
  else { const first = state.raw.find(r => String(r.row) === keys[0]); state.navFilter = { mode: 'album', value: first ? first.row : keys[0] }; if (keys.length > 1) state.navFilter.multi = keys; }
  if (state.selectedAlbums) { state.selectedAlbums.clear(); if (keys.length > 1) keys.forEach(k => state.selectedAlbums.add(k)); }
  if (state.leftNavView !== 'playlists' && typeof exitPlaylistView === 'function') exitPlaylistView();
  const sc = typeof leftListScroller === 'function' ? leftListScroller() : null, keep = sc ? sc.scrollTop : 0;
  buildLeftList();
  if (sc && keep > 0) { if (typeof leftListFinish === 'function') leftListFinish(); sc.scrollTop = keep; }
  updateMainLabel(); applyFiltersSort();
  if (sc && keep > 0 && Math.abs(sc.scrollTop - keep) > 2) sc.scrollTop = keep;
  if (typeof updateAlbumSelBar === 'function') try { updateAlbumSelBar(); } catch (e) { /* the bar updates on its own */ }
}
let lmsAnchor = null;
(function () {
  const base = buildLeftRow;
  buildLeftRow = function (entry, mode) {
    const row = base.apply(this, arguments);
    if (mode !== 'album' || !row) return row;
    const key = String(entry.key); row.dataset.lrow = key;
    const nf = state.navFilter;
    if (nf && nf.mode === 'album' && nf.multi && lmsHas(nf, key) && (!state.activePlaylistId || state.leftNavView === 'playlists')) row.classList.add('active', 'lms-on');
    row.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.preventDefault(); e.stopImmediatePropagation();
        let keys = lmsPicked();
        if (e.shiftKey && lmsAnchor != null) {
          if (typeof leftListFinish === 'function') leftListFinish();
          const order = [...el.leftList.querySelectorAll('.left-row[data-lrow]')].map(n => n.dataset.lrow), a = order.indexOf(lmsAnchor), b = order.indexOf(key);
          if (a >= 0 && b >= 0) { const range = order.slice(Math.min(a, b), Math.max(a, b) + 1); keys = (e.ctrlKey || e.metaKey) ? keys.concat(range) : range; }
          else keys = keys.concat([key]);
        } else {
          keys = keys.includes(key) ? keys.filter(k => k !== key) : keys.concat([key]); lmsAnchor = key;
        }
        if (window.getSelection) try { window.getSelection().removeAllRanges(); } catch (x) { /* fine */ }
        lmsApply(keys);
        return;
      }
      lmsAnchor = key;
      if (state.navFilter && state.navFilter.multi) { state.navFilter = null; if (state.selectedAlbums) state.selectedAlbums.clear(); }          // a plain click: back to one
    }, true);
    row.addEventListener('mousedown', (e) => { if (e.shiftKey) e.preventDefault(); });          // (no text selected by a Shift-click)
    return row;
  };
})();
