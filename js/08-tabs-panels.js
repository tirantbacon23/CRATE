// CRATE — tabs, panel visibility and resizing, left category panel.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Tabs ---------- */

function switchTab(tab) {
  if (tab !== 'diary') {
    diaryGridShiftAnchor = null;
    state.diarySelectMode = false;
    el.diarySelectModeBtn.textContent = 'Select';
    el.diarySelectModeBtn.classList.remove('active');
    if (selectedDiaryKeys.size) { selectedDiaryKeys.clear(); updateDiarySelectionBar(); }
  }
  state.activeTab = tab;
  syncLeftPanelViews();
  el.tabAlbums.classList.toggle('active', tab === 'albums');
  renderArtistInfoTabButtons(); // dynamic tabs — .active depends on state.activeTab, so re-render rather than toggle a fixed button
  renderGenreTabButtons();
  el.tabDiary.classList.toggle('active', tab === 'diary');
  el.tabScrobbles.classList.toggle('active', tab === 'scrobbles');
  el.tabStats.classList.toggle('active', tab === 'stats');
  el.tabArtist.classList.toggle('active', tab === 'artist');
  el.panels.style.display = (tab === 'albums' || tab === 'artistInfo' || tab === 'genreInfo') ? 'flex' : 'none';   // #panels hosts both tabs: the Music browser, or the Artist Information tab's list + page
  el.artistInfoWrap.hidden = tab !== 'artistInfo';
  el.genreInfoWrap.hidden = tab !== 'genreInfo';
  el.diaryWrap.hidden = tab !== 'diary';
  el.scrobblesWrap.hidden = tab !== 'scrobbles';
  el.statsWrap.hidden = tab !== 'stats';
  el.artistWrap.hidden = tab !== 'artist';
  el.app.classList.toggle('app-wide-diary-tracks', tab === 'diary' && state.diaryViewMode === 'tracks');
  if (tab === 'albums') renderGrid();
  else if (tab === 'artistInfo') renderArtistInfoTab();
  else if (tab === 'genreInfo') renderGenreInfoTab();
  else if (tab === 'diary') renderDiary();
  else if (tab === 'scrobbles') renderScrobbles();
  else if (tab === 'stats') renderStats();
  else if (tab === 'artist') renderArtistTab();
  recordTabHistory();
}

function applyMainViewMode() {
  updateMainLabel(); // Refreshes the new dynamic button text
  refreshViewMenuHighlight();
  const isFlatTrackMode = state.mainViewMode === 'tracks' || state.mainViewMode === 'albumTracks';
  el.mainPanel.classList.toggle('mode-tracks', isFlatTrackMode);
  el.viewbar.style.display = isFlatTrackMode ? 'none' : '';
}

// Highlights whichever view-menu button matches the mode that's actually in
// effect right now — state.playlistViewMode while a playlist is open,
// state.mainViewMode otherwise — since the two share one menu.
function refreshViewMenuHighlight() {
  const mode = state.activePlaylistId ? state.playlistViewMode : state.mainViewMode;
  [...el.albumsViewMenu.querySelectorAll('button[data-view]')].forEach(btn => {
    btn.classList.toggle('active-option', btn.dataset.view === mode);
  });
}

// Called whenever the view dropdown is opened — shows/hides the playlist-only
// "List" option and the library-only Group-by/Customize sections depending on
// whether a playlist is currently open, and syncs the highlight either way.
function refreshViewMenuForContext() {
  const isPlaylist = !!state.activePlaylistId;
  const listBtn = document.getElementById('playlistListViewBtn');
  const listDivider = document.getElementById('playlistOnlyViewDivider');
  if (listBtn) listBtn.hidden = !isPlaylist;
  if (listDivider) listDivider.hidden = !isPlaylist;
  // Group by and Customize panel now have full parity with the library's
  // own menu — both are always visible regardless of context, matching
  // how the library itself always shows Group by even in Tracks/Album and
  // Tracks mode where it has no visible effect (see renderGrid's early
  // return for those modes; the same is true here for playlists' Tracks/
  // Album and Tracks views — see renderPlaylistCoversView for where Group
  // by actually takes effect). Customize is hidden only for playlists'
  // "List" mode (the classic drag-to-reorder view), which has nothing
  // configurable — every other playlist view reuses the library's own
  // field-configured rendering (buildAlbumTrackGroup/buildGridSection),
  // same state.fields as the library.
  if (el.menuCustomizeMain) {
    const currentMode = isPlaylist ? state.playlistViewMode : state.mainViewMode;
    const canCustomize = !isPlaylist || currentMode !== 'list';
    el.menuCustomizeMain.hidden = !canCustomize;
    const divider = el.menuCustomizeMain.previousElementSibling;
    if (divider && divider.classList.contains('menu-divider')) divider.hidden = !canCustomize;
  }
  updateMainLabel();
  refreshViewMenuHighlight();
}

function updateGroupByMenuUI() {
  document.querySelectorAll('#groupBySubmenu > button[data-group]').forEach(btn => {
    btn.classList.toggle('active-option', btn.dataset.group === state.groupBy);
  });
  document.querySelectorAll('#groupBy2Submenu > button[data-group2]').forEach(btn => {
    btn.classList.toggle('active-option', btn.dataset.group2 === state.groupBy2);
  });
}

/* ---------- Panel visibility & resizing ---------- */

// Icons-only mode for the far-left Music/Playlist Explorer rail. Both
// buttons already carry a `title` attribute so the label is still
// available as a native tooltip once the visible text is hidden. Sets the
// inline flexBasis directly rather than relying purely on the
// .leftnav-compact CSS class's own flex-basis — makeResizable's manual
// drag-resize (and its restored state.panelWidths.leftNav width at init)
// ALSO sets this same inline style, which would otherwise beat a CSS
// class rule at equal/lower specificity and silently make this toggle do
// nothing for anyone who's ever manually resized that panel. Restores the
// user's own saved width when turning compact mode back off, rather than
// just clearing it back to the CSS default.
function applyLeftNavCompact() { applyLeftNavWidth(); }
function applyLeftNavWidth() {                                   // beside the playlists the strip is wide (they are listed in it); the icons-only mode only applies to Music
  if (!el.leftNavPanel) return;
  const pl = state.leftNavView === 'playlists';
  el.leftNavPanel.classList.toggle('leftnav-compact', !!state.leftNavCompact && !pl);
  el.leftNavPanel.classList.toggle('leftnav-playlists', pl);
  el.leftNavPanel.style.flexBasis = pl ? ((state.panelWidths.leftNavPl || 250) + 'px') : (state.leftNavCompact ? '52px' : (state.panelWidths.leftNav + 'px'));
}

function applyPanelVisibility() {
  el.leftPanel.style.display = state.showLeft ? 'flex' : 'none';
  if (el.leftNavPanel) el.leftNavPanel.style.display = state.showLeft ? 'flex' : 'none';
  if (el.resizerLeftNav) el.resizerLeftNav.style.display = state.showLeft ? 'block' : 'none';
  el.resizerLeft.style.display = state.showLeft ? 'block' : 'none';
  el.rightPanel.style.display = state.showRight ? 'flex' : 'none';
  el.resizerRight.style.display = state.showRight ? 'block' : 'none';
  refitTrackTable();
}

// ---- Mobile nav/queue drawers (1.29.19) ----
// Below the existing sub-900px breakpoint, .panel-leftnav/.panel-left/
// .panel-right are display:none (see that media query) with nothing to
// replace them — on a phone there was previously no way to switch Music/
// Playlist Explorer, browse by Artist/Genre/Decade, or see the queue at
// all. These two off-canvas drawers reuse those same panel elements
// (rather than duplicating their content) by toggling a class on #panels
// that the mobile media query turns into a fixed, full-height overlay —
// so anything that already renders into #leftNavPanel/#leftPanel/
// #rightPanel (which is most of the app's browsing/filtering UI) just
// works inside the drawer with no changes of its own.
// MOBILE_DRAWER_BREAKPOINT_QUERY is now declared up near the top of the
// script alongside the other pre-init() constants — see the comment there.

function isMobileDrawerLayout() {
  return window.matchMedia(MOBILE_DRAWER_BREAKPOINT_QUERY).matches;
}

// which is 'nav', 'queue', or null (both closed).
function setMobileDrawer(which) {
  el.panels.classList.toggle('mobile-nav-open', which === 'nav');
  el.panels.classList.toggle('mobile-queue-open', which === 'queue');
  el.mobileDrawerBackdrop.hidden = !which;
  document.body.classList.toggle('mobile-drawer-open', !!which); // locks background scroll while a drawer covers the screen
}
function toggleMobileNavDrawer() {
  setMobileDrawer(el.panels.classList.contains('mobile-nav-open') ? null : 'nav');
}
function toggleMobileQueueDrawer() {
  setMobileDrawer(el.panels.classList.contains('mobile-queue-open') ? null : 'queue');
}
function initMobileDrawers() {
  el.mobileNavToggleBtn.addEventListener('click', toggleMobileNavDrawer);
  el.mobileQueueToggleBtn.addEventListener('click', toggleMobileQueueDrawer);
  el.mobileDrawerBackdrop.addEventListener('click', () => setMobileDrawer(null));
  // Growing past the breakpoint (rotating a tablet, resizing a browser
  // window) should drop back to the normal three-pane layout rather than
  // leaving a "drawer" open that the CSS no longer treats as one.
  window.matchMedia(MOBILE_DRAWER_BREAKPOINT_QUERY).addEventListener('change', (e) => {
    if (!e.matches) setMobileDrawer(null);
    applyMobileOverflowMenu();
  });
}

// ---- Topbar overflow menu (mobile) ----
// The topbar's secondary icon buttons (everything past search/sort) don't
// fit comfortably next to the hamburger + nav tabs + search on a phone —
// below the same breakpoint the nav/queue drawers use, they're relocated
// (not cloned — actually moved via appendChild, so their existing click
// handlers just keep working) into the gear icon's existing dropdown menu,
// which becomes the "more actions" entry point on mobile as a result.
// Growing back past the breakpoint moves them straight back to their
// original spot in the topbar, right before the queue-drawer button.
// MOBILE_OVERFLOW_ACTIONS is now declared up near the top of the script
// alongside the other pre-init() constants — see the comment there.

function applyMobileOverflowMenu() {
  const mobile = isMobileDrawerLayout();
  MOBILE_OVERFLOW_ACTIONS.forEach(({ id, label }) => {
    const btn = el[id];
    if (!btn) return;
    if (mobile) {
      if (!btn.querySelector('.menu-icon-btn-label')) {
        const labelEl = document.createElement('span');
        labelEl.className = 'menu-icon-btn-label';
        labelEl.textContent = label;
        btn.appendChild(labelEl);
      }
      el.menuMobileActionsSlot.appendChild(btn);
    } else {
      const labelEl = btn.querySelector('.menu-icon-btn-label');
      if (labelEl) labelEl.remove();
      el.topbarControls.insertBefore(btn, el.mobileQueueToggleBtn);
    }
  });
  el.menuMobileActionsLabel.hidden = !mobile;
  el.menuMobileActionsDivider.hidden = !mobile;
}

// One-time setup: these buttons keep their existing click handlers (which
// do the actual add-album/refresh/etc. work) — this just additionally
// closes the gear menu on tap, same as the menu's other action buttons
// (menuArrangePanels, menuSignOut, ...) already do, so it doesn't linger
// open behind whatever the tap just opened. Harmless when the button is
// sitting in its normal desktop topbar spot — the menu's just already
// closed there.
function initMobileOverflowMenu() {
  MOBILE_OVERFLOW_ACTIONS.forEach(({ id }) => {
    const btn = el[id];
    if (btn) btn.addEventListener('click', () => { el.layoutMenu.hidden = true; });
  });
  applyMobileOverflowMenu();
}

// side is also the key into state.panelWidths that the resized width is
// saved under. minWidth/maxWidth default to the album-grid columns' usual
// range; the far-left nav rail passes its own, much narrower range.
function makeResizable(resizerEl, panelEl, side, minWidth = 160, maxWidth = 420) {
  resizerEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelEl.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const delta = side === 'right' ? (startX - ev.clientX) : (ev.clientX - startX);
      const key = (side === 'leftNav' && state.leftNavView === 'playlists') ? 'leftNavPl' : side, lo = key === 'leftNavPl' ? 200 : minWidth, hi = key === 'leftNavPl' ? 420 : maxWidth;          // the strip has its own width while it lists the playlists
      const newWidth = Math.min(hi, Math.max(lo, Math.round(startWidth + delta)));
      panelEl.style.flexBasis = newWidth + 'px';
      state.panelWidths[key] = newWidth;
      refitTrackTable();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      savePrefs();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/* ---------- Left category panel ---------- */

// Builds one clickable row for buildLeftList — factored out so both the
// flat list and the grouped-by-Artist/Genre/Year/etc. rendering (see
// state.leftGroupBy below) can share the exact same row markup/behavior.
function buildLeftRow(entry, mode) {
  const row = document.createElement('div');
  row.className = 'left-row';
  row.tabIndex = 0;
  const isActive = (!state.activePlaylistId || state.leftNavView === 'playlists') && state.navFilter && state.navFilter.mode === mode && state.navFilter.value === entry.key;
  if (isActive) row.classList.add('active');

  if (mode === 'album') {
    row.innerHTML = `
      <img class="left-thumb art" data-key="${entry.artKey}" alt="">
      <div class="left-row-text">
        <p class="left-row-title">${linkFlagHtml(entry.item, 'before')}${escapeHtml(entry.label)}</p>
        <p class="left-row-sub">${escapeHtml(entry.sub)}</p>
      </div>`;
  } else if (mode === 'artist') {
    const cached = state.artistDiscogCache[entry.label.toLowerCase()];
    const countText = (cached && cached.total != null) ? formatCoverageBadge(entry.count, cached.total) : entry.count;
    row.innerHTML = `
      <img class="left-thumb left-thumb-round art" data-key="${entry.sampleKey}" alt="">
      <div class="left-row-text"><p class="left-row-title">${escapeHtml(entry.label)}</p></div>
      <span class="left-row-count" data-artist="${escapeHtml(entry.label)}" data-owned-count="${entry.count}" title="Studio albums logged vs. MusicBrainz's discography for this artist">${countText}</span>`;
  } else if (mode === 'year') {
    const cached = state.yearCoverageCache[entry.label];
    const countText = (cached && cached.total != null) ? formatCoverageBadge(entry.count, cached.total) : entry.count;
    row.innerHTML = `
      <div class="left-row-text"><p class="left-row-title">${escapeHtml(entry.label)}</p></div>
      <span class="left-row-count" data-year="${escapeHtml(entry.label)}" data-owned-count="${entry.count}" title="Albums/EPs/singles logged vs. MusicBrainz's count of releases for this year">${countText}</span>`;
  } else {
    row.innerHTML = `
      <div class="left-row-text"><p class="left-row-title">${escapeHtml(entry.label)}</p></div>
      <span class="left-row-count">${Math.round(entry.count * 10) / 10}</span>`;
    // Genre mode is the only one with a real hierarchy (see buildGenreTree)
    // — indent each row under its parent AND visually distinguish parent
    // vs. child (root: full weight/brightness; each level down: a small
    // "↳" connector via CSS, smaller text, progressively dimmer) so the
    // tree structure reads at a glance instead of only being implied by
    // indentation and aggregated counts. A row with children (entry.hasChildren
    // — see buildLeftList's own DFS-pre-order "does the NEXT row go one
    // level deeper" check, right after calling buildGenreTree, which is a
    // generic/shared function with no notion of collapse state at all)
    // gets a clickable caret to collapse/expand it — see
    // filterCollapsedGenreRows/toggleGenreCollapse.
    if (mode === 'genre') {
      const depth = entry.depth || 0;
      row.style.paddingLeft = depth ? (6 + depth * 16) + 'px' : '';
      const titleEl = row.querySelector('.left-row-title');
      if (depth === 0) {
        titleEl.classList.add('genre-tree-root');
      } else {
        titleEl.classList.add('genre-tree-child');
        titleEl.style.opacity = Math.max(0.55, 1 - depth * 0.14);
      }
      // Hover tooltip showing what this genre is nested under — every
      // ancestor, not just its immediate parent, since getGenreAncestors
      // already walks the full chain (and, for a genre with more than one
      // parent — e.g. Glam Punk under both Punk Rock and Glam Rock — every
      // branch, not just one). Root genres have nothing to show here.
      const ancestors = getGenreAncestors(state.genreTaxonomy, entry.label);
      if (ancestors.length) row.title = 'Under: ' + ancestors.join(', ');
      // ALWAYS insert something here, whether or not this row actually has
      // children — a real caret if it does, an empty same-width spacer if
      // it doesn't. Only inserting the caret conditionally (as this
      // originally shipped) meant a row's caret plus the flex gap around
      // it pushed its text further right than a childless sibling at the
      // EXACT same depth, which — since a caret's own presence has nothing
      // to do with real nesting — created a confusing illusion of one
      // genre being nested under an unrelated alphabetically-adjacent one
      // that simply doesn't happen to have children of its own. Depth
      // alone (the paddingLeft above) is what actually reflects the
      // taxonomy; this slot needs to take the same horizontal space
      // either way so it doesn't distort that.
      const key = genreTaxonomyKey(entry.key);
      if (entry.hasChildren) {
        const collapsed = state.collapsedGenres.has(key);
        const caret = document.createElement('button');
        caret.type = 'button';
        caret.className = 'genre-tree-caret' + (collapsed ? ' collapsed' : '');
        caret.textContent = '▾';
        caret.title = collapsed ? 'Expand' : 'Collapse';
        caret.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
        caret.addEventListener('click', (e) => {
          e.stopPropagation(); // don't also trigger the row's own click-to-filter handler below
          toggleGenreCollapse(key);
        });
        row.insertBefore(caret, row.firstChild);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'genre-tree-caret-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        row.insertBefore(spacer, row.firstChild);
      }
    }
  }

  row.addEventListener('click', () => {
    if (state.navFilter && state.navFilter.mode === mode && state.navFilter.value === entry.key) {
      state.navFilter = null;
    } else {
      state.navFilter = { mode, value: entry.key };
    }
    if (state.leftNavView !== 'playlists') exitPlaylistView();          // beside a playlist, a pick NARROWS the playlist instead of leaving it
    buildLeftList();
    updateMainLabel();
    applyFiltersSort();
  });
  // Right-click an album row for the same menu (Play, queue, add to
  // playlist, view, search, Spotify/RYM links, Delete…) the main grid's
  // album cards already have — only wired for mode === 'album' since
  // artist/genre/year rows represent a group, not one crate item.
  if (mode === 'album') {
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openAlbumCardContextMenu(entry.item, e.clientX, e.clientY);
    });
    // Double-click replaces whatever's currently queued/playing with this
    // release and starts it immediately — see playAlbumReplacingQueue for
    // why that's a different function from queueAlbumTracks/"Add to
    // queue" (which appends instead), and works for every album, not
    // just ones on Spotify.
    row.addEventListener('dblclick', () => playAlbumReplacingQueue(entry.item));
  }
  // Double-click a GENRE: queue and play every release under it (sub-genres
  // included — the same set the grid shows when you filter by it, since both
  // go through genreMatchesFilter), after any search/Listened filter, in the
  // current sort order.
  //
  // Not as simple as the "All ___" row, because a row's single click is a
  // TOGGLE (clicking the already-selected row clears the filter): the first
  // click of a double-click selects the genre and the second one DESELECTS
  // it again, so by the time dblclick fires the filter is cleared and
  // state.filtered is the whole library — playing that would queue
  // everything instead of this genre. (Album rows don't have the problem:
  // they play their own entry.item directly.) So the genre is explicitly
  // re-selected here first, which also leaves it selected afterwards, i.e.
  // what you'd expect to see after double-clicking it.
  if (mode === 'artist') {
    // Artist rows had no menu. Right-click (or a long-press on a phone, like genre rows) opens one: the artist's page, and Export these…
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); openArtistRowContextMenu(entry.label, e.clientX, e.clientY); });
    attachLongPress(row, (x, y) => openArtistRowContextMenu(entry.label, x, y));
  }
  if (mode === 'label') {
    row.addEventListener('dblclick', () => {          // the first click selected it and the second cleared it: select it again, then play what is shown
      state.navFilter = { mode, value: entry.key }; exitPlaylistView(); buildLeftList(); updateMainLabel(); applyFiltersSort(); playFilteredReleases();
    });
  }
  if (mode === 'genre') {
    row.addEventListener('dblclick', (e) => {
      // Two quick clicks on the expand/collapse caret aren't a play gesture
      // (the event still bubbles up to the row from the caret).
      if (e.target && e.target.closest && e.target.closest('.genre-tree-caret')) return;
      state.navFilter = { mode, value: entry.key };
      exitPlaylistView();
      buildLeftList();
      updateMainLabel();
      applyFiltersSort();
      playFilteredReleases();
    });
    // Right-click: View genre description (opens the genre's own tab), play, shuffle, edit the description.
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); openGenreContextMenu(entry.label, e.clientX, e.clientY); });
    // A phone has no right-click, and iPhone Safari doesn't turn a long-press into one either — so touch gets its own two ways in:
    // a long-press (the same helper the album covers use) opens the same menu, and a visible (i) button opens the genre's page
    // directly (hidden on a mouse-and-keyboard desktop, where right-click does it; see .genre-info-btn).
    attachLongPress(row, (x, y) => openGenreContextMenu(entry.label, x, y));
    const info = document.createElement('button');
    info.type = 'button'; info.className = 'genre-info-btn'; info.textContent = 'i';
    info.title = 'Open the genre page'; info.setAttribute('aria-label', `Open the ${entry.label} genre page`);
    info.addEventListener('click', (e) => { e.stopPropagation(); openGenreTab(entry.label); });     // not also "filter the grid by this genre"
    info.addEventListener('dblclick', (e) => e.stopPropagation());                                  // nor "play this genre"
    row.appendChild(info);
  }
  return row;
}

// Filters a DFS pre-order genre-tree row list (from buildGenreTree, with
// .hasChildren already set — see buildLeftList's own genre-mode branch)
// down to what should actually be visible given state.collapsedGenres.
// Single pass: once a collapsed row with children is hit, everything
// deeper than it is skipped until the list returns back up to its own
// depth — nested collapses inside an already-hidden branch don't need
// separate handling, since their rows are already being skipped anyway.
function filterCollapsedGenreRows(rows) {
  const visible = [];
  let hideUntilDepth = null;
  rows.forEach(row => {
    if (hideUntilDepth !== null) {
      if (row.depth > hideUntilDepth) return;
      hideUntilDepth = null;
    }
    visible.push(row);
    if (row.hasChildren && state.collapsedGenres.has(genreTaxonomyKey(row.key))) {
      hideUntilDepth = row.depth;
    }
  });
  return visible;
}

// Expand/collapse one genre's children in the left panel's Genre tree —
// the caret button built in buildLeftRow's genre-mode branch. Persisted
// (state.collapsedGenres, saved as an array — see savePrefs/loadPrefs)
// so a collapsed branch stays collapsed across a reload.
function toggleGenreCollapse(key) {
  if (state.collapsedGenres.has(key)) state.collapsedGenres.delete(key);
  else state.collapsedGenres.add(key);
  savePrefs();
  buildLeftList();
}

// Plays every release currently included by the main view — state.filtered:
// search terms, the Listened filter, the nav filter and the chosen sort order.
// Shared by double-clicking "All ___" and double-clicking a genre row.
function playFilteredReleases() {
  if (!state.filtered.length) { flashGlobalToast('Nothing to play \u2014 no releases match.'); return; }
  playAlbumsReplacingQueue(state.filtered.slice());
}
