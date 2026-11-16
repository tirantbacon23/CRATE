// CRATE — (1.135.22) RECENTLY ADDED: a header button (next to the Timeline and Map) that drops down the releases added most recently, newest
// first, under Today / Yesterday / This week / then each date. A click opens the release; right-click its menu (Show in catalogue…); the footer
// shows the whole crate newest-added first in the Music view. From each release's DateAdded (the sheet's column).
const RECENT_SHOW = 40;
function recentList() {
  return (state.raw || []).filter(r => dateVal(r.dateAdded) !== -Infinity).slice().sort((a, b) => dateVal(b.dateAdded) - dateVal(a.dateAdded)).slice(0, RECENT_SHOW);
}
function recentWhen(ms) {
  const d = new Date(ms), now = new Date(), day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This week';
  if (diff < 31) return 'This month';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function recentClose() { const m = document.getElementById('recentMenu'); if (m) m.remove(); document.removeEventListener('mousedown', recentOutside, true); const b = document.getElementById('recentBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
function recentOutside(e) { if (!e.target.closest('#recentMenu, #recentBtn')) recentClose(); }
function recentOpen() {
  if (document.getElementById('recentMenu')) { recentClose(); return; }
  const btn = document.getElementById('recentBtn'), list = recentList();
  const m = document.createElement('div'); m.id = 'recentMenu'; m.className = 'recent-menu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Recently added');
  let last = '', rows = '';
  list.forEach(it => {
    const ms = dateVal(it.dateAdded), when = recentWhen(ms);
    if (when !== last) { rows += `<div class="recent-grp">${escapeHtml(when)}</div>`; last = when; }
    const art = (state.artCache[artKey(it)] && state.artCache[artKey(it)].art) || it.cover || placeholderArt(it);
    rows += `<button type="button" class="recent-row" data-recent-row="${escapeHtml(String(it.row))}" title="Open ${escapeHtml(it.title)} · right-click for more">
      <img class="recent-cv art" data-key="${escapeHtml(artKey(it))}" src="${escapeHtml(art)}" alt="" loading="lazy">
      <span class="recent-t"><b>${escapeHtml(it.title)}</b><i>${escapeHtml(it.artist)}</i></span>
      <span class="recent-d">${escapeHtml(new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</span></button>`;
  });
  m.innerHTML = `<div class="recent-head"><b>Recently added</b><span>${list.length ? `the last ${list.length}` : ''}</span></div>
    <div class="recent-list">${rows || '<p class="recent-empty">Nothing with a date added yet.</p>'}</div>
    <div class="recent-foot"><button type="button" class="chip-btn" data-recent-all>Show the crate newest-added first</button></div>`;
  document.body.appendChild(m);
  const r = btn ? btn.getBoundingClientRect() : { right: window.innerWidth - 8, bottom: 56 };
  const w = Math.min(380, window.innerWidth - 16);
  m.style.width = w + 'px'; m.style.top = Math.round(r.bottom + 6) + 'px'; m.style.left = Math.round(Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))) + 'px';
  if (btn) btn.setAttribute('aria-expanded', 'true');
  const itemOf = (b) => rawIndex('row', x => String(x.row)).get(b.dataset.recentRow);
  m.addEventListener('click', (e) => {
    if (e.target.closest('[data-recent-all]')) { recentClose(); if (state.activeTab !== 'albums') switchTab('albums'); if (state.activePlaylistId) setLeftNavView('music'); state.sort = 'added'; state.navFilter = null; savePrefs(); buildLeftList(); updateMainLabel(); applyFiltersSort(); if (typeof renderSortFilterMenu === 'function') renderSortFilterMenu(); return; }
    const b = e.target.closest('[data-recent-row]'); if (!b) return; const it = itemOf(b); if (!it) return;
    recentClose(); openDeck(it);
  });
  m.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-recent-row]'); if (!b) return; const it = itemOf(b); if (!it) return; e.preventDefault(); recentClose(); openAlbumCardContextMenu(it, e.clientX, e.clientY, { showInCatalogue: true }); });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { recentClose(); if (btn) btn.focus(); } });
  setTimeout(() => document.addEventListener('mousedown', recentOutside, true), 0);
  const first = m.querySelector('.recent-row'); if (first) first.focus();
}
(function initRecent() {
  const b = document.getElementById('recentBtn'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); recentOpen(); });
  const mb = document.getElementById('menuRecent'); if (mb) mb.addEventListener('click', () => { const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; setTimeout(recentOpen, 0); });
})();
