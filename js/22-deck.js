// CRATE — the deck, quick actions, remove, star ratings, anniversaries.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- The deck (detail / tracklist / rating / diary modal) ---------- */

function openDeck(item) {
  activeItem = item;
  
  // 1. Set all your data (Keep this logic as is)
  el.deckImg.src = item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item);
  el.deckCatalog.textContent = item.catalog + ' · ' + item.type.toUpperCase();
  el.deckTitle.textContent = item.title;
  el.deckTitle.insertAdjacentHTML('beforeend', linkFlagHtml(item, 'after'));
  el.deckArtist.textContent = item.artist;
  el.deckArtist.onclick = () => { closeDeck(); openArtistInfoTab(item.artist); };          // the artist's page, as from Quick Peek and the player

  const year = dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : '';
  const metaParts = [year, genreDisplayStr(item), item.region, item.label].filter(Boolean);
  const recordedMeta = formatRecordedDate(item);
  if (recordedMeta) metaParts.push('Recorded ' + recordedMeta);
  if (item.rymDescriptors) metaParts.push('RYM: ' + item.rymDescriptors);
  el.deckMeta.textContent = metaParts.join(' · ');

  if (dateVal(item.dateAdded) !== -Infinity) {
    const added = new Date(item.dateAdded).toLocaleString(undefined, { 
      year: 'numeric', month: 'short', day: 'numeric', 
      hour: 'numeric', minute: '2-digit' 
    });
    el.deckAdded.textContent = 'Added ' + added;
    el.deckAdded.style.display = 'block';
  } else {
    el.deckAdded.style.display = 'none';
  }

  const scrobbleTotal = scrobbleCountFor(item.artist, item.title);
  if (scrobbleTotal > 0) {
    el.deckScrobbleCount.textContent = `Listened ${scrobbleTotal} time${scrobbleTotal === 1 ? '' : 's'} (Last.fm)`;
    el.deckScrobbleCount.hidden = false;
  } else {
    el.deckScrobbleCount.hidden = true;
  }

  if (item.link) {
    el.deckLink.href = item.link;
    el.deckLink.style.display = 'inline-flex';
  } else {
    el.deckLink.removeAttribute('href');
    el.deckLink.style.display = 'none';
  }

  el.deckSpotifyLink.href = spotifySearchUrl(item);
  el.deckSpotifyLink.classList.remove('direct-link');
  el.deckSpotifyLink.title = 'Search on Spotify';
  el.deckPlayBtn.hidden = true;
  delete el.deckPlayBtn.dataset.uri;
  el.deckSoundcloudLink.href = soundcloudSearchUrl(item);
  el.deckSoundcloudLink.classList.remove('direct-link');
  el.deckSoundcloudLink.title = 'Search on SoundCloud';
  // Same reasoning as buildCard(): a manually-entered RYM Link needs no
  // lookup, so show it as the direct link immediately instead of flashing
  // "Search on RateYourMusic" until getExternalLinksFor() resolves below.
  const deckRymLinkSet = !!(item.rymLink && item.rymLink.trim());
  el.deckRymLink.href = deckRymLinkSet ? item.rymLink.trim() : rymSearchUrl(item);
  el.deckRymLink.classList.toggle('direct-link', deckRymLinkSet);
  el.deckRymLink.title = deckRymLinkSet ? 'Open on RateYourMusic' : 'Search on RateYourMusic';
  // Same condition as qaRemoveBtn in the Quick Actions sheet — only makes
  // sense while actually browsing inside a playlist.
  el.deckPlaylistRemoveBtn.hidden = !state.activePlaylistId;
  getExternalLinksFor(item).then(links => {
    if (activeItem !== item) return; // deck moved on to a different album — don't touch stale DOM
    applyResolvedLinksToDeck(links);
  });

  el.deckReview.value = item.review || '';
  el.deckToast.textContent = '';
  resetLogForm();
  deleteEntryConfirmIdx = null;
  clearTimeout(deleteEntryConfirmTimeout);
  renderDeckStars(item.rating);
  deckRymPaint(item);
  renderDeckDiaryList(item);
  loadTracklist(item);
  resetRemoveBtn();

  // 2. Open the modal
  el.deckOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // 3. 👇 RESET SCROLL HERE 👇
  // We use requestAnimationFrame to make sure the "open" class is fully 
  // processed by the browser before we try to scroll the element.
  requestAnimationFrame(() => {
    const deckElement = el.deckOverlay.querySelector('.deck');
    if (deckElement) deckElement.scrollTop = 0;
  });
}

function closeDeck() {
  el.deckOverlay.classList.remove('open');
  document.body.style.overflow = '';
  activeItem = null;
  resetRemoveBtn();
  // Note: the mini player is intentionally left alone here — it's meant to
  // keep playing even after the album detail view is closed.
}

/* ---------- Quick Actions bottom sheet ---------- */
// Touch-friendly stand-in for the right-click album card menu — see the
// #qaOverlay markup comment for why this exists and what it reuses.
let quickActionsItem = null;

function openQuickActions(item) {
  quickActionsItem = item;
  // Reusing activeItem (rather than inventing a parallel "current item" for
  // this sheet) is what lets setRating()/openEditModal() below work
  // unmodified — both already read activeItem, same as the full deck view.
  activeItem = item;

  const art = item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item);
  el.qaHeader.style.backgroundImage = `url("${art}")`;
  el.qaTitle.textContent = item.title;
  const year = dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : '';
  el.qaSub.textContent = [item.artist, year].filter(Boolean).join(' · ');

  paintStarButtons(el.qaStars, 5, item.rating || 0);

  el.qaListenBtn.hidden = !item.link;

  // Only meaningful while browsing an actual playlist's contents — same
  // condition the right-click menu (openAlbumCardContextMenu) uses.
  el.qaRemoveBtn.hidden = !state.activePlaylistId;

  el.qaOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeQuickActions() {
  el.qaOverlay.classList.remove('open');
  // Quick Actions is now only opened from within an already-open deck (see
  // #deckQuickActionsBtn), so the deck overlay is still behind it — leave
  // its overflow:hidden and activeItem alone in that case, or the deck's
  // own rating/edit/playlist buttons would stop working underneath until
  // it was reopened. Only reset both if nothing else is using them.
  const deckStillOpen = el.deckOverlay.classList.contains('open');
  document.body.style.overflow = deckStillOpen ? 'hidden' : '';
  quickActionsItem = null;
  if (!deckStillOpen) activeItem = null;
}

/* ---------- Remove album ---------- */

let removeConfirmTimeout = null;

function resetRemoveBtn() {
  clearTimeout(removeConfirmTimeout);
  el.deckRemoveBtn.disabled = false;
  el.deckRemoveBtn.classList.remove('confirm');
  el.deckRemoveBtn.textContent = 'Remove from crate';
}

function onRemoveBtnClick() {
  if (!activeItem) return;
  if (el.deckRemoveBtn.classList.contains('confirm')) {
    removeAlbum(activeItem);
    return;
  }
  el.deckRemoveBtn.classList.add('confirm');
  el.deckRemoveBtn.textContent = 'Click again to confirm';
  clearTimeout(removeConfirmTimeout);
  removeConfirmTimeout = setTimeout(resetRemoveBtn, 3000);
}

// "Delete from crate" — the album-card context menu's own entry point for
// removing a release, reachable anywhere that menu opens from (the main
// grid's cards, and the left panel's Albums list — see buildLeftList's
// contextmenu handler). Deliberately separate from the deck's
// removeAlbum()/onRemoveBtnClick, which drives #deckRemoveBtn's own
// two-click confirm UI and unconditionally closes the deck — calling that
// here would closeDeck() even if the deck happened to be open on some
// OTHER album entirely. Uses a plain confirm() instead, same pattern as
// deleting a playlist/folder elsewhere in the app, since a context menu
// closes as soon as an action is picked so there's no button left to
// re-click for a second confirmation.
function deleteAlbumFromContextMenu(item) { return item ? deleteAlbumsFromContextMenu([item]) : undefined; }

// Several selected releases at once. Each is deleted by its row in the sheet, and deleting one moves every row below it up, so they go
// from the bottom up: the rows still to come are all above, and don't move. (One at a time, in the order picked, deleted the wrong releases
// or stopped after the first; and the menu only ever deleted the one clicked.) onEach(item, ok) hears each one as it is done.
async function deleteAlbumRows(items, post, onEach) {
  const list = (items || []).filter(it => it && Number(it.row) > 0).sort((a, b) => Number(b.row) - Number(a.row)), done = [], failed = [];
  for (const it of list) {
    let ok = false;
    try { await post({ action: 'deleteAlbum', row: it.row }); done.push(it); ok = true; }
    catch (e) { failed.push(it); if (onEach) await onEach(it, false); if (/unauthorized/i.test(String((e && e.message) || e))) break; continue; }
    if (ok && onEach) await onEach(it, true);
  }
  return { done, failed };
}

// ---- deleting, as you see it: CRATE's own dialog (the covers, the names), then each release's card fades out as it goes and the
// ones around it slide into its place. Releases waiting their turn are dimmed; one that couldn't be deleted shakes and comes back. ----
const delReduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function delCover(it) { return it.cover || (state.artCache[artKey(it)] && state.artCache[artKey(it)].art) || placeholderArt(it); }
function deleteConfirm(items) {
  return new Promise(resolve => {
    const n = items.length, one = n === 1, ov = document.createElement('div');
    ov.className = 'del-overlay';
    const covers = items.slice(0, 5).map((it, i) => `<img src="${escapeHtml(delCover(it))}" alt="" style="--i:${i};--n:${Math.min(n, 5)}">`).join('') + (n > 5 ? `<span class="del-more">+${n - 5}</span>` : '');
    const names = items.slice(0, 4).map(it => `<li><b>${escapeHtml(it.title)}</b><span>${escapeHtml(it.artist)}</span></li>`).join('') + (n > 4 ? `<li class="del-rest">and ${n - 4} more</li>` : '');
    ov.innerHTML = `<div class="del-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delTitle" aria-describedby="delNote">
      <div class="del-covers${one ? ' one' : ''}">${covers}</div>
      <h2 id="delTitle">${one ? 'Delete this release?' : `Delete ${n} releases?`}</h2>
      <ul class="del-names">${names}</ul>
      <p id="delNote" class="del-note">${one ? 'It' : 'They'} will be removed from your crate, with ${one ? 'its' : 'their'} ratings, notes and links. This can’t be undone.</p>
      <div class="del-btns"><button type="button" class="cancel-btn" data-del="no">Cancel</button><button type="button" class="del-go" data-del="yes">${one ? 'Delete' : `Delete ${n}`}</button></div>
    </div>`;
    const finish = (yes) => { document.removeEventListener('keydown', onKey, true); ov.classList.add('closing'); setTimeout(() => ov.remove(), delReduceMotion() ? 0 : 160); resolve(yes); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) finish(b.dataset.del === 'yes'); else if (e.target === ov) finish(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    ov.querySelector('[data-del="no"]').focus();
  });
}
function delCardsFor(it) { return [...document.querySelectorAll(`[data-album-row="${CSS.escape(String(it.row))}"]`)]; }
function delAnimateOut(it) {                       // fade this release's cards out, then let the cards after them slide into place (measured before and after: FLIP)
  const els = delCardsFor(it); if (!els.length) return Promise.resolve();
  if (delReduceMotion()) { els.forEach(e => { e.style.display = 'none'; }); return Promise.resolve(); }
  els.forEach(e => { e.classList.remove('del-waiting'); e.classList.add('del-leaving'); });
  return new Promise(res => setTimeout(() => {
    const parents = [...new Set(els.map(e => e.parentElement).filter(Boolean))];
    const sibs = parents.flatMap(p => [...p.children].filter(c => !els.includes(c) && c.style.display !== 'none').slice(0, 400));
    const before = new Map(sibs.map(s => [s, s.getBoundingClientRect()]));
    els.forEach(e => { e.style.display = 'none'; });
    sibs.forEach(s => {
      const a = before.get(s), b = s.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      s.style.transition = 'none'; s.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { s.style.transition = 'transform 260ms cubic-bezier(.2,.7,.2,1)'; s.style.transform = ''; setTimeout(() => { s.style.transition = ''; }, 300); }));
    });
    res();
  }, 260));
}
async function deleteAlbumsFromContextMenu(items) {
  items = (items || []).filter(Boolean); if (!items.length) return;
  if (!(await deleteConfirm(items))) return;
  const n = items.length; let k = 0;
  items.forEach(it => delCardsFor(it).forEach(e => e.classList.add('del-waiting')));
  if (n > 1) bgStatus(`Deleting ${n} releases…`, 5, {});
  const r = await deleteAlbumRows(items, postUpdate, async (it, ok) => {
    k++; if (n > 1) bgStatus(`Deleting ${n} releases… ${k} of ${n}`, Math.round(k / n * 100), {});
    if (ok) { catalogRemoveLocal(it); await delAnimateOut(it); }
    else delCardsFor(it).forEach(e => { e.classList.remove('del-waiting'); e.classList.add('del-failed'); setTimeout(() => e.classList.remove('del-failed'), 900); });
  });
  if (activeItem && r.done.some(it => it.row === activeItem.row)) closeDeck();
  if (r.done.length) state.selectedAlbums.clear();          // (rows below a deleted one have moved up: a kept selection would point at other releases)
  items.forEach(it => delCardsFor(it).forEach(e => e.classList.remove('del-waiting')));
  if (r.done.length) { catalogRedraw(); scheduleCatalogSync(); }
  const what = n === 1 && r.done.length === 1 ? `“${items[0].title}”` : `${r.done.length} release${r.done.length === 1 ? '' : 's'}`;
  const msg = r.done.length ? `Deleted ${what}${r.failed.length ? `; ${r.failed.length} couldn’t be deleted — try again` : ''}` : 'Couldn’t delete — try again';
  if (n > 1) bgStatus(msg, 100, { close: true, always: true });
  flashGlobalToast(msg);
}

async function removeAlbum(item) {
  clearTimeout(removeConfirmTimeout);
  el.deckRemoveBtn.disabled = true;
  el.deckRemoveBtn.textContent = 'Removing…';
  try {
    await postUpdate({ action: 'deleteAlbum', row: item.row });
    closeDeck();
    
    // 👈 Replace state filtering with a fresh data fetch to resync row numbers
    catalogRemoveLocal(item); catalogRedraw(); scheduleCatalogSync(); 
    
  } catch (err) {
    el.deckRemoveBtn.disabled = false;
    el.deckRemoveBtn.classList.remove('confirm');
    el.deckRemoveBtn.textContent = 'Couldn\u2019t remove — try again';
    setTimeout(() => { if (activeItem === item) resetRemoveBtn(); }, 2200);
  }
}

/* ---------- Star rating widgets (click, hover-preview, drag-to-rate, half-star) ---------- */

// Ratings are stored in 0.5 increments (0, 0.5, 1, 1.5 ... 5). Each star is
// rendered as two stacked glyphs: a dim "back" ☆ for the empty portion and
// an accent "front" ★ clipped to 0/50/100% width for the filled portion —
// that clip is what lets a single star show as exactly half-filled.
function starGlyphHtml() {
  return '<span class="star-glyph"><span class="star-back">☆</span><span class="star-front">★</span></span>';
}

// How full is the star at 0-based position `idx` given a (possibly
// fractional) rating value — 0, 0.5, or 1.
function fillForIndex(value, idx) {
  const diff = value - idx;
  if (diff >= 1) return 1;
  if (diff >= 0.5) return 0.5;
  return 0;
}

function fillPct(fill) {
  return fill >= 1 ? 100 : (fill >= 0.5 ? 50 : 0);
}

// Paints a single star button/span's fill. `ghost` renders the fill
// translucent (hover/drag preview) instead of solid (committed).
function paintStarFill(el, fill, ghost) {
  const front = el.querySelector('.star-front');
  if (!front) return;
  front.style.width = fillPct(fill) + '%';
  front.classList.toggle('preview', !!ghost);
}


// Makes sure `container` has exactly `count` <button class="star-btn"> children,
// rebuilding only if the count is wrong so button identity (and therefore focus)
// is preserved across re-renders.
function ensureStarButtons(container, count) {
  if (container.children.length !== count) {
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'star-btn';
      s.innerHTML = starGlyphHtml();
      s.setAttribute('aria-label', `Rate ${i} star${i === 1 ? '' : 's'}`);
      container.appendChild(s);
    }
  }
  return [...container.children];
}

function paintStarButtons(container, count, rating) {
  const btns = ensureStarButtons(container, count);
  btns.forEach((btn, idx) => paintStarFill(btn, fillForIndex(rating, idx), false));
  return btns;
}

// Wires up click, hover-preview, and drag-to-rate behavior on a star-rating
// container ONCE. `getCommitted()` returns the currently saved rating (so we
// can restore it on mouse-leave and support "click the current star to clear
// it"), and `onCommit(value)` is called with the final rating once the
// pointer is released — anywhere on the page, so a drag can end off the stars.
function setupStarInteraction(container, getCommitted, onCommit) {
  let dragging = false;
  // Cached bounding rects for the star buttons. Re-measuring the DOM on every
  // single pointermove (the old behavior) forces a synchronous layout each
  // time right after we've just written to the DOM (classList/textContent),
  // which is what made hover/drag feel laggy. Instead we measure once per
  // hover/drag session and only re-measure when the layout could plausibly
  // have changed (resize, or a fresh pointerenter).
  let rects = null;

  function starButtons() { return [...container.querySelectorAll('.star-btn')]; }

  function measure() {
    rects = starButtons().map(b => b.getBoundingClientRect());
  }

  function valueAtX(clientX) {
    if (!rects || !rects.length) measure();
    if (!rects.length) return 0;
    if (clientX < rects[0].left) return 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (clientX <= r.right) {
        const frac = (clientX - r.left) / (r.right - r.left); // position within this star, 0..1
        return i + (frac < 0.5 ? 0.5 : 1); // left half = .5, right half = full
      }
    }
    return rects.length;
  }

  // val: the (possibly half) rating to show. ghost: true while hovering/dragging
  // and not yet committed (renders as a translucent preview); false to render
  // the actual committed rating (solid fill).
  function paint(val, ghost) {
    starButtons().forEach((btn, idx) => paintStarFill(btn, fillForIndex(val, idx), ghost));
  }

  function paintCommitted() {
    paint(getCommitted(), false);
  }

  window.addEventListener('resize', () => { rects = null; refitTrackTable(); });

  // Hover preview (mouse only — touch has no real hover, so skip there to
  // avoid a stuck preview after a tap).
  container.addEventListener('pointerenter', (e) => {
    if (dragging || e.pointerType === 'touch') return;
    measure(); // fresh measurement for this hover session
  });
  container.addEventListener('pointermove', (e) => {
    if (dragging || e.pointerType === 'touch') return;
    paint(valueAtX(e.clientX), true);
  });
  container.addEventListener('pointerleave', () => {
    if (dragging) return;
    paintCommitted();
  });

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return; // primary button/touch only
    dragging = true;
    measure(); // lock in positions for the duration of the drag
    const downVal = valueAtX(e.clientX);
    let finalVal = downVal;
    paint(finalVal, true);

    const onMove = (ev) => {
      finalVal = valueAtX(ev.clientX);
      paint(finalVal, true);
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      // A true click (no drag) on the already-committed star clears the rating.
      const commitVal = (finalVal === downVal && finalVal === getCommitted()) ? 0 : finalVal;
      onCommit(commitVal);
      // onCommit is expected to re-render committed state (e.g. via
      // renderDeckStars/renderLogStars); this just guarantees the ghost
      // class never lingers even if that render doesn't run synchronously.
      paintCommitted();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

// Delegated version of the same hover-preview / drag-to-rate behavior for
// the tracklist's per-track star widgets. Delegated (rather than one
// setupStarInteraction() per row) because .track-stars containers get
// rebuilt whenever a rating changes or the deck re-renders, which would
// orphan any listeners attached directly to them.
function setupTrackStarInteraction(root) {
  let dragging = false;
  let hoverContainer = null;
  let rects = null;

  function starButtonsOf(container) { return [...container.querySelectorAll('.track-star-btn')]; }

  function measure(container) {
    rects = starButtonsOf(container).map(b => b.getBoundingClientRect());
  }

  function valueAtX(clientX) {
    if (!rects || !rects.length) return 0;
    if (clientX < rects[0].left) return 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (clientX <= r.right) {
        const frac = (clientX - r.left) / (r.right - r.left);
        return i + (frac < 0.5 ? 0.5 : 1);
      }
    }
    return rects.length;
  }

  function paint(container, val, ghost) {
    starButtonsOf(container).forEach((btn, idx) => paintStarFill(btn, fillForIndex(val, idx), ghost));
  }

  function paintCommitted(container) {
    paint(container, parseFloat(container.dataset.rating) || 0, false);
  }

  root.addEventListener('pointermove', (e) => {
    if (dragging || e.pointerType === 'touch') return;
    const container = e.target.closest('.track-stars');
    if (container !== hoverContainer) {
      if (hoverContainer) paintCommitted(hoverContainer);
      hoverContainer = container;
      if (container) measure(container);
    }
    if (!container) return;
    paint(container, valueAtX(e.clientX), true);
  });

  root.addEventListener('pointerleave', () => {
    if (dragging) return;
    if (hoverContainer) { paintCommitted(hoverContainer); hoverContainer = null; }
  });

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return; // primary button/touch only
    const btn = e.target.closest('.track-star-btn');
    if (!btn) return;
    const container = btn.closest('.track-stars');
    const trackNum = btn.dataset.track;
    dragging = true;
    measure(container);
    const downVal = valueAtX(e.clientX);
    let finalVal = downVal;
    paint(container, finalVal, true);

    const onMove = (ev) => {
      finalVal = valueAtX(ev.clientX);
      paint(container, finalVal, true);
    };
    const onUp = async () => {
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const committed = parseFloat(container.dataset.rating) || 0;
      const commitVal = (finalVal === downVal && finalVal === committed) ? 0 : finalVal;
      container.dataset.rating = commitVal;
      paintCommitted(container);
      if (!activeItem) return;
      await updateTrackData(activeItem, trackNum, { rating: commitVal });
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

function renderDeckStars(rating) {
  paintStarButtons(el.deckStars, 5, rating);
  if (el.deckRatingNum) el.deckRatingNum.textContent = `${rating || 0}/5`;
}

// Live-updates the star glyphs/number without saving — used while dragging
// across the rating widget so the fill tracks the pointer in real time.
function previewDeckStars(value) {
  [...el.deckStars.children].forEach((s, idx) => {
    const i = idx + 1;
    s.classList.toggle('filled', i <= value);
    s.textContent = i <= value ? '★' : '☆';
  });
  if (el.deckRatingNum) el.deckRatingNum.textContent = `${value || 0}/5`;
}

// Maps a pointer's x position to a 0–5 rating by dividing the stars
// container into 5 equal segments — lets a drag fill stars proportionally
// as it crosses the widget, rather than only reacting to discrete clicks.
function starIndexFromClientX(container, clientX) {
  const rect = container.getBoundingClientRect();
  if (!rect.width) return 0;
  if (clientX <= rect.left) return 0;
  if (clientX >= rect.right) return 5;
  const ratio = (clientX - rect.left) / rect.width;
  return Math.min(5, Math.max(0, Math.ceil(ratio * 5)));
}

async function setRating(value) {
  if (!activeItem) return;
  activeItem.rating = value;
  renderDeckStars(value);

  document.querySelectorAll(`[data-key="${cssEscape(artKey(activeItem))}"]`).forEach(img => {
    const ratingEl = img.closest('.sleeve')?.querySelector('.card-rating');
    if (ratingEl) ratingEl.innerHTML = starRatingHtml(value);
  });

  try {
    await postUpdate({ row: activeItem.row, rating: value });
    flashToast(el.deckToast, 'Saved to ' + activeItem.catalog);
  } catch (err) {
    flashToast(el.deckToast, 'Couldn\u2019t save — try again');
  }
}

async function saveReview() {
  if (!activeItem) return;
  const text = el.deckReview.value;
  try {
    await postUpdate({ row: activeItem.row, review: text });
    activeItem.review = text;
    flashToast(el.deckToast, 'Note saved');
  } catch (err) {
    flashToast(el.deckToast, 'Couldn\u2019t save — try again');
  }
}

function postUpdate(payload, retried) {
  const idToken = getStoredIdToken();
  if (!idToken) { handleAuthError(); return Promise.reject(new Error('unauthorized')); }
  const exp = tokenExpMs(idToken);
  if (!retried && exp && exp < Date.now() + 30000) return authRenew().then(() => postUpdate(payload, true));          // about to run out: renew first (see authRenew)
  catalogWriteStart();                                              // a quiet sync reading the sheet meanwhile is done again (see catalogWrites)
  return fetch(CONFIG.SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight against Apps Script
    body: JSON.stringify(Object.assign({}, payload, { idToken }))
  }).finally(catalogWriteEnd).then(r => r.json()).then(data => {
    if (isAuthError(data)) {                                        // refused: renew the token quietly and send the same change again, once
      if (!retried) return authRenew().then(ok => { if (ok) return postUpdate(payload, true); handleAuthError(); throw new Error('unauthorized'); });
      handleAuthError(); throw new Error('unauthorized');
    }
    // A generic backend error (an Apps Script exception during the actual
    // write — a spreadsheet access/creation issue, entirely plausible for
    // a freshly-provisioned multi-tenant spreadsheet, say) was previously
    // falling straight through here unnoticed: every caller just assumed
    // success once this promise resolved at all, regardless of what the
    // response body actually said. A real report matches this exactly —
    // an add "succeeding" (the toast said so) while silently never
    // landing in the sheet, only surfacing later as a confusing empty-
    // looking catalog rather than an obvious save failure. Rejects with
    // the backend's own message now, so every write path's existing catch
    // block (already there, already showing some failure toast) actually
    // gets a chance to fire instead of silently declaring victory — same
    // fix in spirit as fetchCatalog's own data.error check (1.29.23),
    // just on the write side instead of the read side.
    if (data && data.error) { throw new Error(data.error); }
    try {                                         // a release just added: into the match queue (Match songs → Preferences can switch this off)
      if (smPrefs().queueNew && payload.action === 'addAlbum' && payload.Artist && payload.Title) mqAdd([{ artist: String(payload.Artist), title: String(payload.Title) }], 'added');
      else if (smPrefs().queueNew && payload.action === 'addAlbums' && Array.isArray(payload.albums)) mqAdd(payload.albums.filter(x => x && x.Artist && x.Title).map(x => ({ artist: String(x.Artist), title: String(x.Title) })), 'added');
      if (smPrefs().autoMatchNew && (payload.action === 'addAlbum' || payload.action === 'addAlbums')) bmAutoQueue(payload.action === 'addAlbum' ? (payload.Artist && payload.Title ? [{ artist: String(payload.Artist), title: String(payload.Title) }] : []) : (Array.isArray(payload.albums) ? payload.albums : []).filter(x => x && x.Artist && x.Title).map(x => ({ artist: String(x.Artist), title: String(x.Title) })));          // and matched by themselves
      if (typeof p2pNewQueue === 'function' && (payload.action === 'addAlbum' || payload.action === 'addAlbums')) p2pNewQueue(payload.action === 'addAlbum' ? [{ artist: payload.Artist, title: payload.Title }] : (Array.isArray(payload.albums) ? payload.albums : []).map(x => x && { artist: x.Artist, title: x.Title }));          // (1.104.0) and find it on Soulseek
    } catch (e) { /* the queue is a convenience */ }
    return data;
  });
}

function flashToast(node, msg) {
  node.textContent = msg;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 1800);
}

/* ---------- Album anniversary notification ---------- */
// Checked once per catalog load (see fetchCatalog). Surfaces any albums
// whose release date's month/day matches today, i.e. "released N years ago
// today." Dismissing the banner suppresses it for the rest of the day
// (stored in localStorage) rather than nagging on every reload.

const ANNIV_DISMISS_KEY = 'crate_anniversary_dismissed_date';
const DUPLICATE_ROW_DISMISS_KEY = 'crate_duplicate_row_dismissed_date';

function todayDateKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function checkAlbumAnniversaries() {
  if (!state.raw.length) return;
  const todayKey = todayDateKey();
  try {
    if (localStorage.getItem(ANNIV_DISMISS_KEY) === todayKey) return; // already dismissed today
  } catch (e) { /* localStorage unavailable — just show it every load */ }

  const today = new Date();
  const mm = today.getMonth();
  const dd = today.getDate();

  const matches = [];
  state.raw.forEach(item => {
    if (dateVal(item.releaseDate) === -Infinity) return;
    const rel = new Date(item.releaseDate);
    if (rel.getMonth() !== mm || rel.getDate() !== dd) return;
    const years = today.getFullYear() - rel.getFullYear();
    if (years <= 0) return; // released today this year — not an anniversary yet
    matches.push({ item, years });
  });

  if (!matches.length) { el.anniversaryBanner.hidden = true; return; }
  matches.sort((a, b) => b.years - a.years);
  renderAnniversaryBanner(matches);
}

function renderAnniversaryBanner(matches) {
  el.anniversaryBannerList.innerHTML = matches.map(({ item, years }) => `
    <button type="button" class="anniversary-item">
      <img class="anniversary-cover art" data-key="${artKey(item)}" src="${item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item)}" alt="">
      <span class="anniversary-text">
        <span class="anniversary-item-title">${escapeHtml(item.title)}</span>
        <span class="anniversary-item-sub">${escapeHtml(item.artist)} \u00b7 ${years} year${years === 1 ? '' : 's'} old today</span>
      </span>
    </button>
  `).join('');

  [...el.anniversaryBannerList.querySelectorAll('.anniversary-item')].forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const { item } = matches[i];
      el.anniversaryBanner.hidden = true;
      switchTab('albums');
      openDeck(item);
    });
  });

  el.anniversaryBanner.hidden = false;
}

// Data-integrity check: playlist items (and anything else that looks an
// album up by row — see playlistAlbumFor) reference an album by its
// spreadsheet Row number. If two rows in the sheet ever end up sharing the
// same Row value — a manual edit, a row insertion that didn't renumber
// correctly, deleting a row without the ones below shifting up — that
// lookup can silently resolve to the WRONG one of the two, showing one
// album's track under a completely different album's title/artist. Can't
// be fixed from this file alone (playlist items would need to reference
// something sturdier than a row number, which is a backend/
// apps-script-backend.gs change), so this just surfaces exactly which
// rows collide rather than leaving it a confusing, silent mismatch.
// "Dismissed today" follows the exact same one-day-quiet convention as the
// anniversary banner just above, rather than a permanent dismissal — the
// underlying duplicate is still there every reload until actually fixed in
// the sheet, so a gentle daily reminder is more useful than nagging on
// every single load OR going silent forever after one click.
function checkForDuplicateRows() {
  if (!state.raw.length) return;
  const todayKey = todayDateKey();
  try {
    if (localStorage.getItem(DUPLICATE_ROW_DISMISS_KEY) === todayKey) return;
  } catch (e) { /* localStorage unavailable — just show it every load */ }

  const byRow = new Map();
  state.raw.forEach(item => {
    const key = String(item.row);
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key).push(item);
  });
  const dupeGroups = [...byRow.values()].filter(group => group.length > 1);

  if (!dupeGroups.length) { el.duplicateRowBanner.hidden = true; return; }
  console.warn('CRATE: duplicate spreadsheet rows detected:', dupeGroups.map(g => ({ row: g[0].row, albums: g.map(a => `${a.artist} \u2013 ${a.title}`) })));
  renderDuplicateRowBanner(dupeGroups);
}

function renderDuplicateRowBanner(dupeGroups) {
  el.duplicateRowBannerList.innerHTML = dupeGroups.map(group => `
    <div class="duplicate-row-group">
      <span class="duplicate-row-group-label">Row ${escapeHtml(String(group[0].row))}</span>
      ${group.map(item => `
        <button type="button" class="anniversary-item">
          <img class="anniversary-cover art" data-key="${artKey(item)}" src="${item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item)}" alt="">
          <span class="anniversary-text">
            <span class="anniversary-item-title">${escapeHtml(item.title)}</span>
            <span class="anniversary-item-sub">${escapeHtml(item.artist)}</span>
          </span>
        </button>
      `).join('')}
    </div>
  `).join('');

  const items = dupeGroups.flat();
  [...el.duplicateRowBannerList.querySelectorAll('.anniversary-item')].forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const item = items[i];
      el.duplicateRowBanner.hidden = true;
      switchTab('albums');
      openDeck(item);
    });
  });

  el.duplicateRowBanner.hidden = false;
  applyCachedArt();
}

// (1.95.16) The album page's cover, big: a click on it shows it as large as the screen allows (iTunes artwork at a bigger size when that is
// where it came from). A click anywhere, or Esc, closes it and leaves the album page as it was.
function coverZoomHiRes(src) { return /mzstatic\.com/.test(src) ? src.replace(/\/\d{2,4}x\d{2,4}(bb|cc)?(\.\w+)$/, '/1200x1200bb$2') : src; }
function openCoverZoom(src, alt) {
  if (!src) return;
  let box = document.getElementById('coverZoom');
  if (!box) {
    box = document.createElement('div'); box.id = 'coverZoom'; box.className = 'cover-zoom'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Cover');
    box.innerHTML = '<img alt="">'; document.body.appendChild(box);
    box.addEventListener('click', closeCoverZoom);
  }
  const img = box.querySelector('img'); img.src = src; img.alt = alt || (activeItem ? `${activeItem.artist} — ${activeItem.title}` : 'Cover');
  const hi = coverZoomHiRes(src);
  if (hi !== src) { const pre = new Image(); pre.onload = () => { if (img.src === src) img.src = hi; }; pre.src = hi; }
  box.hidden = false;
}
function closeCoverZoom() { const box = document.getElementById('coverZoom'); if (!box || box.hidden) return false; box.hidden = true; return true; }
el.deckImg.addEventListener('click', () => openCoverZoom(el.deckImg.currentSrc || el.deckImg.src));
el.deckImg.title = 'Show the cover big';
el.trackInfoArt.addEventListener('click', () => { const src = el.trackInfoArt.currentSrc || el.trackInfoArt.src; if (!src || /^data:image\/svg/.test(src)) return; openCoverZoom(src, nowPlayingItem ? `${nowPlayingItem.artist} — ${nowPlayingItem.title}` : 'Cover'); });          // (1.95.25) Track Info's cover too
el.trackInfoArt.title = 'Show the cover big';
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && closeCoverZoom()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);          // (before the album page's own Esc, which would close it)
