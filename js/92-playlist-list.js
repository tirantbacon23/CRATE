// (1.135.152) The playlist list, nicer: each playlist with a mosaic of its first four covers, its name, and what's in it ("14 songs ·
// 3 releases"); the open one marked in gold. Liked songs gets a tile to match, folders a drawn folder, and the header plain icons in
// place of the emoji. Same rows underneath: clicking, dragging into folders and the right-click menus work as before.
const PLL_FOLDER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const PLL_FOLDER_ADD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/></svg>';
const PLL_PLUS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
function pllCover(it) { return it.cover || ((state.artCache || {})[artKey(it)] || {}).art || (typeof placeholderArt === 'function' ? placeholderArt(it) : ''); }
function pllMosaic(p) {
  const seen = new Set(), rel = [];
  for (const x of p.items || []) { const a = typeof playlistAlbumFor === 'function' ? playlistAlbumFor(x) : null; if (a && !seen.has(a)) { seen.add(a); rel.push(a); if (rel.length === 4) break; } }
  if (!rel.length) return '<span class="pll-mosaic pll-empty" aria-hidden="true">♪</span>';
  if (rel.length < 4) return `<span class="pll-mosaic pll-one" aria-hidden="true"><img src="${escapeHtml(pllCover(rel[0]))}" alt="" loading="lazy"></span>`;
  return `<span class="pll-mosaic" aria-hidden="true">${rel.map(a => `<img src="${escapeHtml(pllCover(a))}" alt="" loading="lazy">`).join('')}</span>`;
}
function pllSub(p) {
  const items = p.items || [], songs = items.filter(x => x.type === 'track').length, whole = items.length - songs;
  const rels = new Set(items.map(x => String(x.row || x.albumId || ''))).size, parts = [];
  if (songs) parts.push(`${songs} song${songs === 1 ? '' : 's'}`);
  if (whole) parts.push(`${whole} whole release${whole === 1 ? '' : 's'}`);
  if (songs && rels > 1) parts.push(`${rels} releases`);
  return parts.join(' · ') || 'empty';
}
playlistRowHtml = function (p) {
  return `
    <div class="left-row playlist-sidebar-row pll-row ${p.id === state.activePlaylistId ? 'active' : ''}" data-id="${escapeHtml(p.id)}" draggable="true" tabindex="0" title="${escapeHtml(p.name)}${p.description ? ' — ' + escapeHtml(p.description) : ''}">
      ${pllMosaic(p)}
      <div class="left-row-text"><p class="left-row-title">${escapeHtml(p.name)}</p><p class="pll-sub">${escapeHtml(pllSub(p))}</p></div>
    </div>`;
};
(function () {
  const fb = document.getElementById('newPlaylistFolderBtn'), nb = document.getElementById('newPlaylistBtn');
  if (fb) { fb.innerHTML = PLL_FOLDER_ADD; fb.classList.add('pll-hbtn'); }
  if (nb) { nb.innerHTML = PLL_PLUS; nb.classList.add('pll-hbtn'); }
  const lbl = document.querySelector('#playlistsBrowserView .panel-label'); if (lbl) lbl.textContent = 'Playlists';
  const base = renderPlaylistSidebar;
  renderPlaylistSidebar = function () {
    const r = base.apply(this, arguments);
    const list = el.playlistSidebarList; if (!list) return r;
    list.querySelectorAll('.playlist-folder-icon').forEach(n => { if (!n.querySelector('svg')) n.innerHTML = PLL_FOLDER; });
    return r;
  };
  try { if (state.playlists && state.playlists.length) renderPlaylistSidebar(); } catch (e) { /* drawn when the crate is in */ }
})();
