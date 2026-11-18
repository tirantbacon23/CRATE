// ===== (1.135.134) Heard: a release or a song marked as listened to, with no date (like Letterboxd's "watched") =====
// The eye (◉) marks it. A release: in its cover popup, the deck's buttons and its right-click menu, and a small eye on its cover in the
// grid. A song: an eye on its row in the popup and the deck. Nothing goes in the diary and no date is asked for. A release marked heard
// counts as listened wherever CRATE asks (the Listened filter, listened:yes / listened:no). Kept with the release's song data (the
// TrackData column the sheet already has: no new column), so it's the same on every device.

const HD_EYE = (on) => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="${on ? 'var(--bg, #12161C)' : 'none'}" stroke="${on ? 'var(--bg, #12161C)' : 'currentColor'}" stroke-width="1.8"/></svg>`;
function heardRel(item) { const r = item && item.trackData && item.trackData.rel; return !!(r && r.heard); }
function heardSong(item, num) { const e = item && item.trackData && item.trackData[num]; return !!(e && e.heard); }
async function hdSave(item, undo) {
  try { await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData || {}) }); }
  catch (e) { undo(); hdPaint(item); flashGlobalToast('Couldn’t save that. Try again.'); }
}
function heardSetRel(item, on) {
  if (!item) return; item.trackData = item.trackData || {};
  const was = heardRel(item);
  if (on) item.trackData.rel = Object.assign({}, item.trackData.rel, { heard: 1 }); else if (item.trackData.rel) { delete item.trackData.rel.heard; if (!Object.keys(item.trackData.rel).length) delete item.trackData.rel; }
  hdPaint(item);
  if (typeof flashGlobalToast === 'function') flashGlobalToast(on ? `Heard: “${item.title}”` : `“${item.title}” isn’t marked heard any more`);
  hdSave(item, () => { if (was) item.trackData.rel = Object.assign({}, item.trackData.rel, { heard: 1 }); else if (item.trackData.rel) delete item.trackData.rel.heard; });
  if (state.listenedOnly || /listened:/i.test((el.searchInput && el.searchInput.value) || '')) { try { applyFiltersSort(); } catch (e) { /* next time */ } }
}
function heardSetSong(item, num, on) {
  if (!item || !num) return; item.trackData = item.trackData || {};
  const e = item.trackData[num] || (item.trackData[num] = {});
  if (on) e.heard = 1; else { delete e.heard; if (!Object.keys(e).length) delete item.trackData[num]; }
  hdPaint(item);
  hdSave(item, () => { const x = item.trackData[num] || (item.trackData[num] = {}); if (on) delete x.heard; else x.heard = 1; });
}
// a release marked heard counts as listened (the diary's entries still do too)
if (typeof hasLoggedListen === 'function') { const hdBaseListen = hasLoggedListen; hasLoggedListen = function (item) { return heardRel(item) || hdBaseListen.apply(this, arguments); }; }

// ----- where the eye is -----
function hdBtnHtml(on, cls, label) { return `<button type="button" class="hd-btn ${cls || ''}${on ? ' on' : ''}" aria-pressed="${on}" title="${on ? 'Heard. Click to unmark' : 'Mark as heard (no date, no diary entry)'}" aria-label="${escapeHtml(label || (on ? 'Heard' : 'Mark as heard'))}">${HD_EYE(on)}<span>${on ? 'Heard' : 'Heard?'}</span></button>`; }
function hdSongBtnHtml(item, num) { const on = heardSong(item, num); return `<button type="button" class="hd-song${on ? ' on' : ''}" data-hd-num="${escapeHtml(String(num))}" aria-pressed="${on}" title="${on ? 'Heard. Click to unmark' : 'Mark this song as heard'}" aria-label="${on ? 'Heard' : 'Mark as heard'}">${HD_EYE(on)}</button>`; }
function hdPaint(item) {
  // the cover popup
  if (typeof quickPeekItem !== 'undefined' && quickPeekItem === item) hdPeek(item);
  // the deck
  if (typeof activeItem !== 'undefined' && activeItem === item) hdDeck(item);
  // songs (popup and deck rows)
  document.querySelectorAll('.hd-song').forEach(b => { const host = b.closest('[data-hd-row]'); if (!host || host.dataset.hdRow !== String(item.row)) return; const on = heardSong(item, b.dataset.hdNum); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.innerHTML = HD_EYE(on); });
  hdCards();
}
function hdPeek(item) {
  const acts = el.albumQuickPeekActions; if (!acts) return;
  const old = acts.querySelector('.hd-btn'); if (old) old.remove();
  const tmp = document.createElement('div'); tmp.innerHTML = hdBtnHtml(heardRel(item), 'qp-btn'); const nb = tmp.firstChild;
  const cover = document.getElementById('albumQuickPeekCover'); if (cover && cover.parentNode === acts) acts.insertBefore(nb, cover); else acts.appendChild(nb);
  if (el.albumQuickPeekTracks) el.albumQuickPeekTracks.dataset.hdRow = String(item.row);
}
function hdDeck(item) {
  const bar = document.getElementById('deckActionsBar'); if (!bar) return;
  let b = bar.querySelector('.hd-btn'); const tmp = document.createElement('div'); tmp.innerHTML = hdBtnHtml(heardRel(item), 'deck-btn'); const nb = tmp.firstChild;
  if (b) b.replaceWith(nb); else { const q = document.getElementById('deckQueueBtn'); if (q) q.before(nb); else bar.prepend(nb); }
  const tl = el.deckTracklist; if (tl) { tl.dataset.hdRow = String(item.row); hdDeckRows(item); }
}
function hdDeckRows(item) {
  const tl = el.deckTracklist; if (!tl || !item) return;
  tl.querySelectorAll('.track-row-wrap[data-track]').forEach(w => { const box = w.querySelector('.track-interactive'); if (!box || box.querySelector('.hd-song')) return; box.insertAdjacentHTML('afterbegin', hdSongBtnHtml(item, w.dataset.track)); });
}
// the popup's song rows: an eye beside the like
if (typeof quickPeekTrackRowHtml === 'function') { const hdBaseRow = quickPeekTrackRowHtml; quickPeekTrackRowHtml = function (item, t) { const h = hdBaseRow.apply(this, arguments); const num = t && t.trackNumber; if (!item || !num) return h; return h.replace('<span class="qp-links', hdSongBtnHtml(item, num) + '<span class="qp-links'); }; }
if (typeof openAlbumQuickPeek === 'function') { const hdBaseQp = openAlbumQuickPeek; openAlbumQuickPeek = function (item) { const r = hdBaseQp.apply(this, arguments); try { hdPeek(item); } catch (e) { /* as before */ } return r; }; }
if (typeof openDeck === 'function') { const hdBaseDeck = openDeck; openDeck = function (item) { const r = hdBaseDeck.apply(this, arguments); try { hdDeck(item); setTimeout(() => { if (activeItem === item) hdDeckRows(item); }, 600); } catch (e) { /* as before */ } return r; }; }
// the deck's songs arrive after it opens: their eyes are added as they come
(function hdDeckWatch() { const go = () => { const tl = el && el.deckTracklist; if (!tl) return setTimeout(go, 500); new MutationObserver(() => { if (typeof activeItem !== 'undefined' && activeItem) hdDeckRows(activeItem); }).observe(tl, { childList: true }); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); })();
// the right-click menu
if (typeof openAlbumCardContextMenu === 'function') {
  const hdBaseMenu = openAlbumCardContextMenu;
  openAlbumCardContextMenu = function (item) {
    const r = hdBaseMenu.apply(this, arguments);
    try {
      const ms = document.querySelectorAll('.album-card-menu'), m = ms[ms.length - 1];
      if (m && item) {
        const sel = state.selectedAlbums.size > 1 && state.selectedAlbums.has(String(item.row)) ? state.raw.filter(x => state.selectedAlbums.has(String(x.row))) : [item];
        const allOn = sel.every(heardRel), b = document.createElement('button'); b.type = 'button'; b.className = 'hd-menu-btn';
        b.innerHTML = HD_EYE(allOn) + (sel.length > 1 ? (allOn ? ` Unmark ${sel.length} as heard` : ` Mark ${sel.length} as heard`) : (allOn ? ' Heard · unmark' : ' Mark as heard'));
        b.addEventListener('click', (e) => { e.stopPropagation(); if (typeof closeNowPlayingAddMenu === 'function') closeNowPlayingAddMenu(); sel.forEach(it => { if (heardRel(it) === allOn) heardSetRel(it, !allOn); }); });
        const q = m.querySelector('[data-card-action="queue"]'); if (q) q.after(b); else m.appendChild(b);
      }
    } catch (e) { /* the menu as it was */ }
    return r;
  };
}
// clicks on the eyes
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('.hd-btn, .hd-song'); if (!t) return;
  e.stopPropagation(); e.preventDefault();
  if (t.classList.contains('hd-song')) { const host = t.closest('[data-hd-row]'), item = host && state.raw.find(r => String(r.row) === host.dataset.hdRow); if (item) heardSetSong(item, t.dataset.hdNum, !heardSong(item, t.dataset.hdNum)); return; }
  const item = t.closest('#albumQuickPeek') ? quickPeekItem : t.closest('#deckActionsBar') ? activeItem : null; if (item) heardSetRel(item, !heardRel(item));
}, true);
// a small eye on the grid's covers of releases marked heard
function hdCards() {
  const g = el && el.gridContainer; if (!g) return;
  const byRow = typeof rawIndex === 'function' ? rawIndex('row', r => String(r.row)) : null;
  g.querySelectorAll('.card[data-album-row]:not(.card-shell)').forEach(c => { const it = byRow ? byRow.get(c.dataset.albumRow) : null, on = heardRel(it); const w = c.querySelector('.art-wrap'); if (!w) return; let m = w.querySelector(':scope > .hd-mark'); if (on && !m) { w.insertAdjacentHTML('beforeend', `<span class="hd-mark" title="Heard">${HD_EYE(true)}</span>`); } else if (!on && m) m.remove(); });
}
(function hdCardWatch() { const go = () => { const g = el && el.gridContainer; if (!g) return setTimeout(go, 500); let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(hdCards, 150); }).observe(g, { childList: true, subtree: true }); hdCards(); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); })();
