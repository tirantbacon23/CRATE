// ===== (1.135.135) Liking a whole release =====
// A heart for the release itself, beside its Heard eye: in its cover popup, the deck's buttons and its right-click menu (several selected:
// all at once), and a small heart on its cover in the grid. liked:yes finds liked releases too. Kept with the release's song data (the
// TrackData column the sheet already has) under its own name, so the Liked songs list (each song's heart) is left as it is.

const ALK_SVG = (on) => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.7 3.4 4.5 6.8 4.5c2.1 0 3.7 1.1 5.2 3 1.5-1.9 3.1-3 5.2-3 3.4 0 5.6 3.2 4.2 6.7-1.9 4.7-9.4 9.3-9.4 9.3z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
function albumLiked(item) { const r = item && item.trackData && item.trackData.rel; return !!(r && r.fav); }
function albumLikeSet(item, on) {
  if (!item) return; item.trackData = item.trackData || {};
  const was = albumLiked(item);
  if (on) item.trackData.rel = Object.assign({}, item.trackData.rel, { fav: new Date().toISOString() });
  else if (item.trackData.rel) { delete item.trackData.rel.fav; if (!Object.keys(item.trackData.rel).length) delete item.trackData.rel; }
  alkPaint(item);
  flashGlobalToast(on ? `♥ Liked “${item.title}”` : `“${item.title}” isn’t liked any more`);
  hdSave(item, () => { if (was) item.trackData.rel = Object.assign({}, item.trackData.rel, { fav: new Date().toISOString() }); else if (item.trackData.rel) delete item.trackData.rel.fav; alkPaint(item); });
  if (/liked:/i.test((el.searchInput && el.searchInput.value) || '')) { try { applyFiltersSort(); } catch (e) { /* next time */ } }
}
function alkBtnHtml(on, cls) { return `<button type="button" class="alk-btn ${cls || ''}${on ? ' on' : ''}" aria-pressed="${on}" title="${on ? 'You like this release. Click to unlike' : 'Like this release'}" aria-label="${on ? 'Unlike the release' : 'Like the release'}">${ALK_SVG(on)}<span>${on ? 'Liked' : 'Like'}</span></button>`; }
function alkPlace(container, cls, before) {
  if (!container) return null; const old = container.querySelector('.alk-btn'); if (old) old.remove();
  const tmp = document.createElement('div'); tmp.innerHTML = alkBtnHtml(false, cls); const b = tmp.firstChild;
  if (before && before.parentNode === container) container.insertBefore(b, before); else container.appendChild(b);
  return b;
}
function alkPaint(item) {
  const set = (b, on) => { if (!b) return; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.innerHTML = ALK_SVG(on) + `<span>${on ? 'Liked' : 'Like'}</span>`; b.title = on ? 'You like this release. Click to unlike' : 'Like this release'; };
  if (typeof quickPeekItem !== 'undefined' && quickPeekItem === item) set(el.albumQuickPeekActions && el.albumQuickPeekActions.querySelector('.alk-btn'), albumLiked(item));
  if (typeof activeItem !== 'undefined' && activeItem === item) set(document.querySelector('#deckActionsBar .alk-btn'), albumLiked(item));
  alkCards();
}
// beside the Heard eye (made by 79-heard.js) in the popup and the deck
if (typeof hdPeek === 'function') { const alkBasePeek = hdPeek; hdPeek = function (item) { const r = alkBasePeek.apply(this, arguments); const acts = el.albumQuickPeekActions; if (acts) { alkPlace(acts, 'qp-btn', acts.querySelector('.hd-btn')); alkPaint(item); } return r; }; }
if (typeof hdDeck === 'function') { const alkBaseDeck = hdDeck; hdDeck = function (item) { const r = alkBaseDeck.apply(this, arguments); const bar = document.getElementById('deckActionsBar'); if (bar) { alkPlace(bar, 'deck-btn', bar.querySelector('.hd-btn')); alkPaint(item); } return r; }; }
// the right-click menu
if (typeof openAlbumCardContextMenu === 'function') {
  const alkBaseMenu = openAlbumCardContextMenu;
  openAlbumCardContextMenu = function (item) {
    const r = alkBaseMenu.apply(this, arguments);
    try {
      const ms = document.querySelectorAll('.album-card-menu'), m = ms[ms.length - 1];
      if (m && item) {
        const sel = state.selectedAlbums.size > 1 && state.selectedAlbums.has(String(item.row)) ? state.raw.filter(x => state.selectedAlbums.has(String(x.row))) : [item];
        const allOn = sel.every(albumLiked), b = document.createElement('button'); b.type = 'button'; b.className = 'alk-menu-btn';
        b.innerHTML = ALK_SVG(allOn) + (sel.length > 1 ? (allOn ? ` Unlike ${sel.length} releases` : ` Like ${sel.length} releases`) : (allOn ? ' Liked · unlike' : ' Like the release'));
        b.addEventListener('click', (e) => { e.stopPropagation(); if (typeof closeNowPlayingAddMenu === 'function') closeNowPlayingAddMenu(); sel.forEach(it => { if (albumLiked(it) === allOn) albumLikeSet(it, !allOn); }); });
        const h = m.querySelector('.hd-menu-btn') || m.querySelector('[data-card-action="queue"]'); if (h) h.after(b); else m.appendChild(b);
      }
    } catch (e) { /* the menu as it was */ }
    return r;
  };
}
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('.alk-btn'); if (!t) return;
  e.stopPropagation(); e.preventDefault();
  const item = t.closest('#albumQuickPeek') ? quickPeekItem : t.closest('#deckActionsBar') ? activeItem : null; if (item) albumLikeSet(item, !albumLiked(item));
}, true);
// a small heart on the covers of liked releases
function alkCards() {
  const g = el && el.gridContainer; if (!g) return;
  const byRow = typeof rawIndex === 'function' ? rawIndex('row', r => String(r.row)) : null;
  g.querySelectorAll('.card[data-album-row]:not(.card-shell)').forEach(c => { const it = byRow ? byRow.get(c.dataset.albumRow) : null, on = albumLiked(it), w = c.querySelector('.art-wrap'); if (!w) return; const m = w.querySelector(':scope > .alk-mark'); if (on && !m) w.insertAdjacentHTML('beforeend', `<span class="alk-mark" title="You like this release">${ALK_SVG(true)}</span>`); else if (!on && m) m.remove(); });
}
if (typeof hdCards === 'function') { const alkBaseCards = hdCards; hdCards = function () { const r = alkBaseCards.apply(this, arguments); try { alkCards(); } catch (e) { /* next time */ } return r; }; }
