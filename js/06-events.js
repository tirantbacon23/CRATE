// CRATE — bindEvents(), track data, left menu, element configuration.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
function bindEvents() {
  // Delegated capture-phase listener (the 'error' event doesn't bubble, so
  // capture is required) catching every cover-art <img> failure anywhere
  // in the app — see recoverFailedArt above for why this exists and what
  // badArtUrls guards against.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('art')) return;
    const key = img.dataset.key;
    if (!key) return;
    const failedUrl = img.src;
    if (badArtUrls[key] === failedUrl) return; // already tried recovering from this exact failure
    badArtUrls[key] = failedUrl;
    recoverFailedArt(key);
  }, true);

  // Star rating widgets: click, hover-preview, and drag-to-rate.
  setupStarInteraction(el.deckStars, () => activeItem ? (activeItem.rating || 0) : 0, (val) => setRating(val));
  setupStarInteraction(el.logStars, () => logRating, (val) => renderLogStars(val));
  setupTrackStarInteraction(el.deckTracklist);
  // Quick Actions sheet's own star row — separate DOM/container from
  // el.deckStars, so it needs its own setupStarInteraction wiring, but
  // setRating() itself is unchanged: it always writes to activeItem plus
  // el.deckStars plus the card's own .card-rating, so we just additionally
  // repaint el.qaStars to match after every commit.
  setupStarInteraction(el.qaStars, () => quickActionsItem ? (quickActionsItem.rating || 0) : 0, async (val) => {
    await setRating(val);
    paintStarButtons(el.qaStars, 5, val);
  });

  // Quick Actions sheet (see openQuickActions/#qaOverlay) — every button
  // here delegates to the same functions the full deck view and the
  // right-click album card menu already use.
  el.qaBackdrop.addEventListener('click', closeQuickActions);
  el.qaDoneBtn.addEventListener('click', closeQuickActions);
  el.qaPlayBtn.addEventListener('click', () => { if (quickActionsItem) playAlbumNow(quickActionsItem); closeQuickActions(); });
  el.qaQueueBtn.addEventListener('click', () => { if (quickActionsItem) queueAlbumTracks(quickActionsItem); });
  el.qaPlaylistBtn.addEventListener('click', () => {
    if (!quickActionsItem) return;
    openAddToPlaylistSubmenu(el.qaPlaylistBtn, [{ itemType: 'album', row: quickActionsItem.row, albumId: quickActionsItem.albumId || '', trackNum: '', trackName: '' }]);
  });
  el.qaViewBtn.addEventListener('click', () => { const item = quickActionsItem; closeQuickActions(); if (item) openDeck(item); });
  // "+ Log a listen" from Quick Actions — opens the deck for this item (so
  // its diary history is visible to review too, not just the add form)
  // and immediately shows the log form, same as pressing the deck's own
  // "+ Log a listen" button. openDeck() already resets/hides the log form
  // before this runs, so clicking logListenBtn here always opens it fresh
  // rather than risking the toggle-closed branch in its own handler.
  el.qaLogListenBtn.addEventListener('click', () => {
    const item = quickActionsItem;
    closeQuickActions();
    if (!item) return;
    openDeck(item);
    el.logListenBtn.click();
  });
  el.qaEditBtn.addEventListener('click', () => {
    // Hide the sheet but deliberately don't call closeQuickActions() here —
    // that nulls activeItem, and openEditModal() (like setRating) reads
    // activeItem to know which album to populate the form from.
    el.qaOverlay.classList.remove('open');
    document.body.style.overflow = el.deckOverlay.classList.contains('open') ? 'hidden' : '';
    quickActionsItem = null;
    openEditModal();
  });
  el.qaSpotifyBtn.addEventListener('click', () => { if (quickActionsItem) openAlbumOnSpotify(quickActionsItem); });
  el.qaSoundcloudBtn.addEventListener('click', () => { if (quickActionsItem) openAlbumOnSoundcloud(quickActionsItem); });
  el.qaListenBtn.addEventListener('click', () => { if (quickActionsItem && quickActionsItem.link) window.open(quickActionsItem.link, '_blank', 'noopener,noreferrer'); });
  el.qaRymBtn.addEventListener('click', () => { if (quickActionsItem) openAlbumOnRym(quickActionsItem); });
  el.qaRemoveBtn.addEventListener('click', () => { if (quickActionsItem) removeAlbumFromActivePlaylist(quickActionsItem); closeQuickActions(); });
  el.qaDeleteBtn.addEventListener('click', () => { const item = quickActionsItem; closeQuickActions(); if (item) deleteAlbumFromContextMenu(item); });

  // Deck view's mobile entry point into the same sheet — on desktop the
  // equivalent actions are laid out directly as #deckActionsBar instead
  // (see the HTML comments there and above #deckQuickActionsBtn).
  // Deliberately reads `activeItem`, not a captured closure variable, since
  // this button lives inside the deck and stays valid across however many
  // different albums the deck gets opened on.
  el.deckQuickActionsBtn.addEventListener('click', () => { if (activeItem) openQuickActions(activeItem); });

  // 1. Search Logic
  el.searchInput.addEventListener('input', debounce(() => {
    state.query = el.searchInput.value.trim().toLowerCase();
    el.searchWrap.classList.toggle('mobile-search-has-value', !!state.query); // keeps the mobile icon-collapsed search bar expanded while a query is active — see .search-wrap's mobile CSS
    buildLeftList();
    applyFiltersSort();
  }, 150));

  // Mobile: the search icon is now a real button (visually inert on
  // desktop via pointer-events:none in the base .search-icon rule) so
  // tapping it can focus the — collapsed-to-invisible-on-mobile — input;
  // :focus-within in the CSS does the actual expand/collapse.
  el.searchIconBtn.addEventListener('click', () => el.searchInput.focus());
  initSearchSuggest();          // suggestions as you type (see ssSuggest)
  // The icon must not take focus when pressed: focus inside the search box is what opens it (:focus-within), and opening it
  // moves the icon, so the finger lifted somewhere else, no click happened, and the box never got focus (the first letters
  // typed went nowhere). Same for the ✕ below, so that pressing it doesn't blur the box and close it before its click.
  el.searchIconBtn.addEventListener('mousedown', (e) => e.preventDefault());
  const searchClearBtn = document.getElementById('searchClearBtn');
  if (searchClearBtn) {
    searchClearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    searchClearBtn.addEventListener('click', () => { el.searchInput.value = ''; el.searchWrap.classList.remove('mobile-search-has-value'); el.searchInput.dispatchEvent(new Event('input')); el.searchInput.blur(); });   // the box closes at once; the grid follows when the (debounced) input handler runs
  }
  // Phone: the keyboard's Search key puts the keyboard away so the results can be seen (the search itself runs as you type).
  el.searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && window.matchMedia('(max-width: 900px)').matches) el.searchInput.blur(); });

  // Advanced search modal — see #advSearchOverlay's HTML comment for why
  // this just assembles a query string into #searchInput rather than
  // filtering anything itself.
  el.advancedSearchBtn.addEventListener('click', openAdvSearch);
  el.advSearchClose.addEventListener('click', closeAdvSearch);
  el.advSearchOverlay.addEventListener('click', (e) => { if (e.target === el.advSearchOverlay) closeAdvSearch(); });
  el.advSearchApplyBtn.addEventListener('click', applyAdvSearch);
  el.advSearchClearBtn.addEventListener('click', () => {
    [el.advArtist, el.advTitle, el.advYearFrom, el.advYearTo, el.advGenre, el.advLabel, el.advCatalog, el.advDescriptor, el.advScene, el.advMovement, el.advExtra].forEach(i => i.value = '');
    el.advRatingMin.value = ''; el.advType.value = '';
  });

  // 2. Sort logic — now driven entirely by the "Sort & filter" popover
  // (#sortFilterMenu), the single sort control at every breakpoint. The old
  // always-visible #sortSelect dropdown (previously desktop-only, with this
  // popover as a mobile-only stand-in for it) has been removed — see the
  // maintenance log — so state.sort is set directly here instead of
  // proxying through a hidden <select>'s value/change event.
  el.sortFilterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.sortFilterMenu.hidden = !el.sortFilterMenu.hidden;
    if (!el.sortFilterMenu.hidden) { renderSortFilterMenu(); closeAlbumQuickPeek(); }
  });
  el.sortFilterMenu.querySelectorAll('.sort-filter-option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.activePlaylistId) state.playlistSort = btn.dataset.sort; else state.sort = btn.dataset.sort;          // a playlist keeps its own sort: the library's is left alone
      savePrefs();
      applyFiltersSort();
      renderSortFilterMenu();
      el.sortFilterMenu.hidden = true;
    });
  });
  el.sortFilterListenedToggle.addEventListener('change', () => {
    el.listenedFilterBtn.click(); // sets state.listenedOnly + applyFiltersSort(), same as the icon itself
  });
  el.sortFilterMenu.querySelectorAll('.genre-search-option').forEach(btn => {
    btn.addEventListener('click', () => {
      state.genreSearchMode = btn.dataset.genreMode;
      savePrefs();
      buildLeftList();   // the left panel's artist/genre/album lists are derived from the search results too
      applyFiltersSort();
      renderSortFilterMenu();
      el.sortFilterMenu.hidden = true;
      flashGlobalToast('Genre search: ' + GENRE_SEARCH_LABELS[state.genreSearchMode].toLowerCase());
    });
  });

  // The RYM part of the menu: at least a rating, missing one, and updated from Rate Your Music or not. (The first two were shown but never
  // listened to before 1.93.0: choosing them changed nothing.)
  const rymFilterChanged = () => { savePrefs(); buildLeftList(); applyFiltersSort(); updateMainLabel(); renderSortFilterMenu(); };
  rymEl('sortRymMin').addEventListener('change', (e) => { state.rymMin = Number(e.target.value) || 0; rymFilterChanged(); });
  rymEl('sortRymMissing').addEventListener('change', (e) => { state.rymMissingOnly = e.target.checked; rymFilterChanged(); });
  rymEl('sortRymUpdated').addEventListener('change', (e) => { state.rymUpdatedFilter = ['yes', 'no'].includes(e.target.value) ? e.target.value : ''; rymFilterChanged(); });

  el.firstGenreOnlyToggle.addEventListener('change', () => {
    state.firstGenreOnly = el.firstGenreOnlyToggle.checked;
    savePrefs();
    buildLeftList();   // the left panel's lists and counts come from the search results, which depend on this too
    applyFiltersSort();
    updateMainLabel(); // the panel title says "(first genre only)" while it's in effect
    renderSortFilterMenu();
    if (typeof renderChartElement === 'function') { try { renderChartElement(); } catch (e) { /* chart not showing */ } }
    flashGlobalToast('First genre only: ' + (state.firstGenreOnly ? 'on' : 'off'));
  });

  document.getElementById('genreNavExactToggle').addEventListener('change', (e) => {
    state.genreNavExact = e.target.checked;
    savePrefs();
    buildLeftList();   // the genre tree's counts follow: a genre's own releases only, or everything under it too
    applyFiltersSort();
    updateMainLabel(); // the panel title says "(not sub-genres)" while it's in effect
    renderSortFilterMenu();
    if (typeof renderChartElement === 'function') { try { renderChartElement(); } catch (err) { /* chart not showing */ } }
    flashGlobalToast('Selected genre only: ' + (state.genreNavExact ? 'on' : 'off'));
  });

  document.getElementById('genreRoleSelect').addEventListener('change', (e) => {
    state.genreRole = ['primary', 'secondary'].includes(e.target.value) ? e.target.value : 'any';
    savePrefs();
    buildLeftList();   // the left panel's genre tree counts the chosen role too
    applyFiltersSort();
    updateMainLabel(); // the panel title says "(primary genres only)" etc. while it's in effect
    renderSortFilterMenu();
    if (typeof renderChartElement === 'function') { try { renderChartElement(); } catch (err) { /* chart not showing */ } }
    flashGlobalToast('A genre counts when it\u2019s: ' + GENRE_ROLE_TEXT[state.genreRole]);
  });

  el.refreshBtn.addEventListener('click', () => fetchCatalog());

  el.menuSignOut.addEventListener('click', () => { el.layoutMenu.hidden = true; signOut(); });

  el.listenedFilterBtn.addEventListener('click', () => {
    state.listenedOnly = !state.listenedOnly;
    el.listenedFilterBtn.classList.toggle('active', state.listenedOnly);
    el.sortFilterListenedToggle.checked = state.listenedOnly; // keep the mobile popover's checkbox in sync regardless of which control toggled it
    applyFiltersSort();
  });

  // 3. Tab Switching
  el.tabAlbums.addEventListener('click', () => { if (state.activeTab !== 'albums') switchTab('albums'); });
  el.tabDiary.addEventListener('click', () => { switchTab('diary'); });
  el.diaryViewFeedBtn.addEventListener('click', () => setDiaryViewMode('feed'));
  el.diaryViewGridBtn.addEventListener('click', () => setDiaryViewMode('grid'));
  el.diaryViewTracksBtn.addEventListener('click', () => setDiaryViewMode('tracks'));
  el.diaryGroupByTrackBtn.addEventListener('click', () => setDiaryTrackGroupMode('track'));
  el.diaryGroupByEntryBtn.addEventListener('click', () => setDiaryTrackGroupMode('entry'));
  el.diarySelectModeBtn.addEventListener('click', () => setDiarySelectMode(!state.diarySelectMode));
  el.diaryClearSelectionBtn.addEventListener('click', clearDiarySelection);
  el.diaryDeleteSelectedBtn.addEventListener('click', onDeleteSelectedClick);
  el.diaryEntryClose.addEventListener('click', closeDiaryEntryModal);
  el.diaryEntryModal.addEventListener('click', (e) => { if (e.target === el.diaryEntryModal) closeDiaryEntryModal(); });
  el.diaryEntryOpenAlbumBtn.addEventListener('click', () => {
    if (!activeDiaryEntry) return;
    const match = matchAlbumForEntry(activeDiaryEntry);
    closeDiaryEntryModal();
    if (match) { switchTab('albums'); openDeck(match); }
  });
  el.diaryEntryDeleteBtn.addEventListener('click', () => { if (activeDiaryEntry) deleteDiaryEntryDirect(activeDiaryEntry); });
  el.tabScrobbles.addEventListener('click', () => { switchTab('scrobbles'); });
  el.tabStats.addEventListener('click', () => { switchTab('stats'); });
  el.statsModeListening.addEventListener('click', () => setStatsMode('listening'));
  el.statsModeCollection.addEventListener('click', () => setStatsMode('collection'));
  el.chartGenreSelect.addEventListener('change', () => {
    state.chartGenre = el.chartGenreSelect.value;
    savePrefs();
    renderChartElement();
  });
  el.tabArtist.addEventListener('click', () => { switchTab('artist'); });
  // Dynamic artist tabs — event delegation, since the buttons are fully
  // regenerated by renderArtistInfoTabButtons. The close ✕ is checked first
  // so clicking it never also counts as clicking the tab it sits inside.
  el.artistInfoTabsContainer.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.artist-info-tab-close');
    if (closeBtn) { e.stopPropagation(); closeArtistInfoTab(closeBtn.dataset.artist); return; }
    const tabBtn = e.target.closest('.artist-info-tab-btn');
    if (!tabBtn) return;
    state.activeArtistInfoTab = tabBtn.dataset.artist;
    switchTab('artistInfo');
  });
  el.playlistModalClose.addEventListener('click', closePlaylistModal);
  el.playlistModalCancelBtn.addEventListener('click', closePlaylistModal);
  el.playlistModalSaveBtn.addEventListener('click', savePlaylistModalClick);
  el.newPlaylistBtn.addEventListener('click', (e) => { e.stopPropagation(); openPlaylistModal('create'); });
  el.newPlaylistFolderBtn.addEventListener('click', (e) => { e.stopPropagation(); openFolderModal('create'); });
  el.folderModalClose.addEventListener('click', closeFolderModal);
  el.folderModalCancelBtn.addEventListener('click', closeFolderModal);
  el.folderModalSaveBtn.addEventListener('click', saveFolderModalClick);

  // Far-left nav rail: two plain, always-visible buttons, no dropdown/popup
  // to open first. "Music" swaps the browser column back to Albums/
  // Artists/Genres (and leaves playlist view); "Playlist Explorer" swaps it
  // to the playlist/folder tree (see setLeftNavView()).
  // The rail is also visible on the Artist Information tab now (it's the same left column), where these two
  // are the way back to the Music tab, landing on whichever view was clicked.
  el.navMusicBtn.addEventListener('click', () => { if (state.activeTab !== 'albums') switchTab('albums'); setLeftNavView('music'); });
  if (el.playlistsBrowserView && el.navPlaylistsBtn) el.navPlaylistsBtn.after(el.playlistsBrowserView);          // the playlists are listed in the far-left strip, under the playlist icon
  el.navPlaylistsBtn.addEventListener('click', () => { if (state.activeTab !== 'albums') switchTab('albums'); setLeftNavView('playlists'); });
  setLeftNavView(state.leftNavView);

  // Drop target for filing a playlist into whichever folder it lands in
  // (matched via the closest .playlist-folder ancestor, so drops inside a
  // folder's child list still count as long as they don't land on the
  // folder's own header row, which is handled separately in
  // renderPlaylistSidebar()); dropping outside any folder un-files it.
  if (el.playlistSidebarList) {
    el.playlistSidebarList.addEventListener('dragover', (e) => e.preventDefault());
    el.playlistSidebarList.addEventListener('drop', (e) => {
      if (e.target.closest('.playlist-folder-row')) return; // handled by the row's own drop listener
      e.preventDefault();
      const playlistId = e.dataTransfer.getData('text/plain');
      const playlist = state.playlists.find(p => p.id === playlistId);
      const folderWrap = e.target.closest('.playlist-folder');
      const targetFolderId = folderWrap ? folderWrap.dataset.folderId : null;
      if (playlist && playlist.folderId !== (targetFolderId || null)) movePlaylistToFolder(playlist, targetFolderId || null);
    });
  }

  // Stats tab: back button collapses the expanded year detail.
  el.statsDetailBack.addEventListener('click', () => {
    state.statsSelectedYear = null;
    el.statsDetail.hidden = true;
    el.statsYearList.querySelectorAll('.stats-year-row').forEach(r => r.classList.remove('active'));
  });

  // Artist tab: filter the artist list as you type.
  el.artistSearchInput.addEventListener('input', debounce(() => renderArtistList(), 150));

  // 4. Main Panel View Menu (Dropdown)
  el.mainViewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.albumsViewMenu.hidden = !el.albumsViewMenu.hidden;
    if (!el.albumsViewMenu.hidden) { refreshViewMenuForContext(); closeAlbumQuickPeek(); }
  });

  // Open "Customize Panel" - Context dependent Slot logic
  // Open Customize Panel - Shows different slots based on current view
  el.menuCustomizeMain.addEventListener('click', (e) => {
    e.stopPropagation();
    // While a playlist is open this menu is scoped to state.playlistViewMode
    // instead of the library's state.mainViewMode (see
    // refreshViewMenuForContext()) — only its Tracks view is customizable
    // for now, which is the only case the menu item is shown in that case.
    const effectiveMode = state.activePlaylistId ? state.playlistViewMode : state.mainViewMode;
    const mode = (effectiveMode === 'covers') ? 'covers' : 
                 (effectiveMode === 'tracks' || effectiveMode === 'albumTracks' ? 'tracks' : 'grid');
    
    renderConfigSlots(mode); 
    el.mainConfigModal.hidden = false;
    el.albumsViewMenu.hidden = true;
  });

  // Mode buttons inside View dropdown (only the top-level view switches, not the Group-by flyout).
  // While a playlist is open, this same dropdown drives state.playlistViewMode
  // instead of the library's state.mainViewMode — see refreshViewMenuForContext()
  // and renderPlaylistBody() for how the two stay independent.
  [...el.albumsViewMenu.querySelectorAll('button[data-view]')].forEach(btn => {
    btn.addEventListener('click', () => {
      el.albumsViewMenu.hidden = true;
      if (state.activePlaylistId) {
        state.playlistViewMode = btn.dataset.view;
        refreshViewMenuForContext();
        savePrefs();
        renderPlaylistMainPanel();
        return;
      }
      state.mainViewMode = btn.dataset.view;
      applyMainViewMode();
      savePrefs();
      if (state.activeTab !== 'albums') switchTab('albums'); else renderGrid();
    });
  });

  // "Group by" flyout — hover to reveal (CSS), click also toggles it open for touch/keyboard use
  const groupByMenuItem = document.getElementById('groupByMenuItem');
  const groupByParentBtn = groupByMenuItem.querySelector('.menu-parent-btn');
  groupByParentBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    groupByMenuItem.classList.toggle('submenu-open');
  });
  [...document.querySelectorAll('#groupBySubmenu > button[data-group]')].forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.groupBy = btn.dataset.group;
      updateGroupByMenuUI();
      savePrefs();
      renderGrid();
      groupByMenuItem.classList.remove('submenu-open');
      el.albumsViewMenu.hidden = true;
    });
  });

  // "Then by" nested flyout — same open/close pattern as "Group by" itself,
  // one level deeper. Note the `> button[data-group]` scoping just above:
  // without it, this nested flyout's own buttons (being descendants of
  // #groupBySubmenu too) would ALSO match that handler and stomp
  // state.groupBy with undefined the moment "Then by" was clicked.
  const groupBy2MenuItem = document.getElementById('groupBy2MenuItem');
  const groupBy2ParentBtn = groupBy2MenuItem.querySelector('.menu-parent-btn');
  groupBy2ParentBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    groupBy2MenuItem.classList.toggle('submenu-open');
  });
  [...document.querySelectorAll('#groupBy2Submenu > button[data-group2]')].forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.groupBy2 = btn.dataset.group2;
      updateGroupByMenuUI();
      savePrefs();
      renderGrid();
      groupBy2MenuItem.classList.remove('submenu-open');
      groupByMenuItem.classList.remove('submenu-open');
      el.albumsViewMenu.hidden = true;
    });
  });

  // 5. Grid View Controls (Size Slider / Grid-List Toggle)
  el.viewGridBtn.addEventListener('click', () => { setViewMode('grid'); savePrefs(); renderGrid(); });
  el.viewListBtn.addEventListener('click', () => { setViewMode('list'); savePrefs(); renderGrid(); });
  el.sizeSlider.addEventListener('input', () => {
    state.cardSize = Number(el.sizeSlider.value);
    el.gridContainer.style.setProperty('--card-min', state.cardSize + 'px');
    savePrefs();
  });

  // 6. Left Panel (Category) Menu
  el.leftModeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = el.leftModeMenu.hidden;
    el.leftModeMenu.hidden = !el.leftModeMenu.hidden;
    if (opening) closeAlbumQuickPeek();
  });

  [...el.leftModeMenu.querySelectorAll('button')].forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode) {
        state.leftMode = btn.dataset.mode;
        el.leftModeLabel.textContent = capitalize(state.leftMode) + 's';
        state.navFilter = null;
      } else if (btn.dataset.leftSort) {
        state.leftSort = btn.dataset.leftSort;
      } else if (btn.dataset.leftGroup) {
        state.leftGroupBy = btn.dataset.leftGroup;
      } else if (btn.dataset.leftThumb) {
        state.leftThumbSize = btn.dataset.leftThumb;
      }
      updateLeftMenuUI();
      savePrefs();
      buildLeftList();
      updateMainLabel();
      applyFiltersSort();
      el.leftModeMenu.hidden = true;
    });
  });

  // 7. Configuration & Layout Popovers
  el.layoutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = el.layoutMenu.hidden;
    el.layoutMenu.hidden = !el.layoutMenu.hidden;
    if (opening) closeAlbumQuickPeek(); // same mutual-exclusion reasoning as closeOtherDropdownMenus' own comment, the other direction
  });
  el.menuArrangePanels.addEventListener('click', () => { el.arrangeModal.hidden = false; el.layoutMenu.hidden = true; renderAddFieldsChecklist(); renderLayoutConfigUI(); });
  el.arrangeClose.addEventListener('click', () => { el.arrangeModal.hidden = true; });
  el.mainConfigClose.addEventListener('click', () => { el.mainConfigModal.hidden = true; });

  el.menuSpotifyApi.addEventListener('click', () => {
    const creds = loadSpotifyCreds();
    el.spotifyClientId.value = creds.clientId || '';
    el.spotifyClientSecret.value = creds.clientSecret || '';
    el.spotifyStatus.hidden = true;
    el.spotifyConnectStatus.hidden = true;
    el.spotifyRedirectUriDisplay.textContent = spotifyRedirectUri();
    updateSpotifyConnectUI();
    el.spotifyOverlay.hidden = false;
    el.layoutMenu.hidden = true;
  });
  el.spotifyClose.addEventListener('click', () => { el.spotifyOverlay.hidden = true; });
  el.spotifyCancelBtn.addEventListener('click', () => { el.spotifyOverlay.hidden = true; });
  el.spotifySaveBtn.addEventListener('click', () => {
    const clientId = el.spotifyClientId.value.trim();
    const clientSecret = el.spotifyClientSecret.value.trim();
    saveSpotifyCreds(clientId, clientSecret);
    spotifyToken = null; // force a fresh token on next lookup
    el.spotifyStatus.textContent = clientId && clientSecret ? 'Saved.' : 'Cleared — falling back to MusicBrainz/search links.';
    el.spotifyStatus.hidden = false;
    setTimeout(() => { el.spotifyOverlay.hidden = true; }, 900);
  });

  el.menuLastfmScrobble.addEventListener('click', () => {
    el.lastfmScrobbleStatus.hidden = true;
    el.lastfmScrobbleConnectStatus.hidden = true;
    renderLastfmScrobbleModalState();
    el.lastfmScrobbleOverlay.hidden = false;
    el.layoutMenu.hidden = true;
  });
  el.lastfmScrobbleClose.addEventListener('click', () => { el.lastfmScrobbleOverlay.hidden = true; });
  el.lastfmScrobbleCancelBtn.addEventListener('click', () => { el.lastfmScrobbleOverlay.hidden = true; });
  el.lastfmScrobbleSaveBtn.addEventListener('click', () => {
    const apiKey = el.lastfmScrobbleApiKey.value.trim();
    const sharedSecret = el.lastfmScrobbleSecret.value.trim();
    saveLastfmScrobbleCreds(apiKey, sharedSecret);
    el.lastfmScrobbleStatus.textContent = apiKey && sharedSecret ? 'Saved.' : 'Cleared.';
    el.lastfmScrobbleStatus.hidden = false;
  });
  el.lastfmScrobbleConnectBtn.addEventListener('click', connectLastfmScrobbleAccount);
  el.lastfmScrobbleFinishBtn.addEventListener('click', finishLastfmScrobbleConnect);
  el.lastfmScrobbleDisconnectBtn.addEventListener('click', disconnectLastfmScrobbleAccount);

  el.menuDiscogsApi.addEventListener('click', () => {
    el.discogsToken.value = loadDiscogsToken();
    el.discogsStatus.hidden = true;
    el.discogsOverlay.hidden = false;
    el.layoutMenu.hidden = true;
  });
  el.discogsClose.addEventListener('click', () => { el.discogsOverlay.hidden = true; });
  el.discogsCancelBtn.addEventListener('click', () => { el.discogsOverlay.hidden = true; });
  el.discogsSaveBtn.addEventListener('click', () => {
    const token = el.discogsToken.value.trim();
    saveDiscogsToken(token);
    el.discogsStatus.textContent = token ? 'Saved.' : 'Cleared — the Discogs lookup button will prompt for a token again.';
    el.discogsStatus.hidden = false;
    setTimeout(() => { el.discogsOverlay.hidden = true; }, 900);
  });

  el.menuYoutubeApi.addEventListener('click', () => {
    el.youtubeApiKey.value = loadYoutubeApiKey();
    el.youtubeApiStatus.hidden = true; ytPaintQuotaLine();
    el.youtubeApiOverlay.hidden = false;
    el.layoutMenu.hidden = true;
  });
  el.youtubeApiClose.addEventListener('click', () => { el.youtubeApiOverlay.hidden = true; });
  document.getElementById('ytCacheClearBtn').addEventListener('click', () => { ytCacheClear(); ytPaintQuotaLine(); flashGlobalToast('Forgot the remembered YouTube lookups: the next ones will be looked up again.'); });
  el.youtubeApiCancelBtn.addEventListener('click', () => { el.youtubeApiOverlay.hidden = true; });
  el.youtubeApiSaveBtn.addEventListener('click', () => {
    const key = el.youtubeApiKey.value.trim();
    saveYoutubeApiKey(key);
    el.youtubeApiStatus.textContent = key ? 'Saved.' : 'Cleared — YouTube matching will fall back to opening a search tab.';
    el.youtubeApiStatus.hidden = false;
    setTimeout(() => { el.youtubeApiOverlay.hidden = true; }, 900);
  });

  el.menuNewReleases.addEventListener('click', () => {
    el.layoutMenu.hidden = true;
    el.newReleasesOverlay.hidden = false;
    el.newReleasesStatus.hidden = true;
    renderNewReleasesList(loadNewReleaseResults());
    updateNewReleasesLastChecked();
  });
  el.newReleasesClose.addEventListener('click', () => { el.newReleasesOverlay.hidden = true; });
  el.newReleasesCheckBtn.addEventListener('click', triggerNewReleaseScan);
  el.newReleasesList.addEventListener('click', (e) => {
    const row = e.target.closest('.new-release-row');
    if (!row) return;
    const id = row.dataset.releaseId;
    const results = loadNewReleaseResults();
    const release = results.find(r => r.id === id);
    if (!release) return;

    if (e.target.closest('.new-release-add-btn')) {
      el.newReleasesOverlay.hidden = true;
      openAddModal();
      showAddForm({
        artist: release.artist,
        title: release.title,
        type: release.type === 'single' ? 'Single' : 'Album',
        releaseDate: release.releaseDate || '',
        link: release.spotifyUrl,
        cover: release.image
      });
      return;
    }
    if (e.target.closest('.new-release-dismiss-btn')) {
      const dismissed = loadNewReleaseDismissed();
      dismissed[id] = Date.now();
      saveNewReleaseDismissed(dismissed);
      const remaining = results.filter(r => r.id !== id);
      saveNewReleaseResults(remaining);
      renderNewReleasesList(remaining);
      updateNewReleasesBadge();
    }
  });

  el.menuGenreTaxonomy.addEventListener('click', () => {
    el.layoutMenu.hidden = true;
    el.genreTaxonomyOverlay.hidden = false;
    el.genreTaxonomyStatus.hidden = true;
    renderGenreTaxonomyEditor(); taxStatusRender();
  });
  el.genreTaxonomyClose.addEventListener('click', () => { el.genreTaxonomyOverlay.hidden = true; });
  el.genreTaxonomyAddBtn.addEventListener('click', () => {
    const name = (window.prompt('Genre name:') || '').trim();
    if (!name) return;
    const key = genreTaxonomyKey(name);
    if (state.genreTaxonomy[key]) { flashGlobalToast(`${name} is already in the taxonomy.`); return; }
    // Blank parents (top-level) until they set one via its own row's field —
    // adding it here just makes it exist so it can be referenced/edited.
    // `parents` (an array — see the 1.29.82 multi-parent migration), NOT
    // the old single `parent` string this line used to write: every other
    // taxonomy function (getAllKnownGenres, buildGenreTree, ...) calls
    // .forEach directly on entry.parents, which throws on undefined the
    // moment a genre added here got looked up.
    state.genreTaxonomy[key] = { label: name, parents: [] };
    saveGenreTaxonomy(state.genreTaxonomy);
    renderGenreTaxonomyEditor();
  });

  el.editGenreDiscogsBtn.addEventListener('click', async () => {
    const artist = el.editArtist.value.trim();
    const title = el.editTitle.value.trim();
    if (!artist || !title) {
      el.editGenreDiscogsStatus.textContent = 'Fill in Artist and Title first.';
      el.editGenreDiscogsStatus.hidden = false;
      return;
    }
    el.editGenreDiscogsStatus.textContent = 'Searching Discogs…';
    el.editGenreDiscogsStatus.hidden = false;
    el.editGenreDiscogsBtn.disabled = true;
    try {
      const result = await fetchDiscogsGenreStyle(artist, title, el.editCatalog.value);
      if (result.error === 'no-token') {
        el.editGenreDiscogsStatus.textContent = 'Add a Discogs personal access token first (⚙ → Discogs API…).';
      } else if (result.error === 'unauthorized') {
        el.editGenreDiscogsStatus.textContent = 'Discogs rejected that token — double-check it in ⚙ → Discogs API…';
      } else if (result.error === 'rate-limited') {
        el.editGenreDiscogsStatus.textContent = 'Discogs rate limit hit — wait a minute and try again.';
      } else if (result.error === 'no-match') {
        el.editGenreDiscogsStatus.textContent = `No Discogs match for "${title}" by ${artist}.`;
      } else if (result.error === 'network') {
        el.editGenreDiscogsStatus.textContent = 'Couldn\u2019t reach Discogs — check your connection.';
      } else if (result.error) {
        el.editGenreDiscogsStatus.textContent = 'Discogs request failed — try again.';
      } else {
        el.editGenre.value = result.combined.join(', ');
        el.editGenreDiscogsStatus.textContent = `Found on Discogs: ${result.combined.join(', ')}`;
      }
    } catch (e) {
      el.editGenreDiscogsStatus.textContent = 'Something went wrong — try again.';
    } finally {
      el.editGenreDiscogsBtn.disabled = false;
    }
  });

  el.spotifyConnectBtn.addEventListener('click', () => {
    const clientId = el.spotifyClientId.value.trim() || loadSpotifyCreds().clientId;
    if (!clientId) {
      el.spotifyConnectStatus.textContent = 'Add and save a Client ID above first.';
      el.spotifyConnectStatus.hidden = false;
      return;
    }
    saveSpotifyCreds(clientId, el.spotifyClientSecret.value.trim());
    connectSpotifyPremium(clientId);
  });
  el.spotifyDisconnectBtn.addEventListener('click', () => {
    if (spotifyPlayer) { try { spotifyPlayer.disconnect(); } catch (e) {} spotifyPlayer = null; }
    spotifyDeviceId = null;
    spotifyDeviceReady = null;
    clearSpotifyUserTokens();
    hideMiniPlayer();
    el.miniPlayer.hidden = true;
    updateSpotifyConnectUI();
  });

  el.toggleLeftPanel.addEventListener('change', () => {
    state.showLeft = el.toggleLeftPanel.checked;
    applyPanelVisibility();
    savePrefs();
  });
  el.toggleRightPanel.addEventListener('change', () => {
    state.showRight = el.toggleRightPanel.checked;
    applyPanelVisibility();
    savePrefs();
  });
  el.trackInfoShowPlayerToggle.addEventListener('change', () => {
    state.trackInfoShowPlayer = el.trackInfoShowPlayerToggle.checked;
    savePrefs();
    applyTrackInfoPlayerMode();
  });
  el.genreDescSaveBtn.addEventListener('click', () => {
    if (!(state.navFilter && state.navFilter.mode === 'genre')) return;
    const key = genreTaxonomyKey(state.navFilter.value);
    if (!state.genreTaxonomy[key]) return; // shouldn't happen — the genre has to exist in the taxonomy to be filterable at all
    state.genreTaxonomy[key].description = el.genreDescInput.value.trim();
    saveGenreTaxonomy(state.genreTaxonomy);
    flashGlobalToast('Genre description saved.');
  });
  el.trackInfoShowVideoToggle.addEventListener('change', () => {
    state.trackInfoShowVideo = el.trackInfoShowVideoToggle.checked;
    savePrefs();
    applyTrackInfoPlayerMode();
  });
  el.albumQuickPeekStyleSelect.addEventListener('change', () => {
    state.albumQuickPeekStyle = el.albumQuickPeekStyleSelect.value;
    savePrefs();
    closeAlbumQuickPeek(); // avoid a currently-open peek being left in the old style
  });

  el.toggleCoverLinks.addEventListener('change', () => {
    state.showCoverLinks = el.toggleCoverLinks.checked;
    el.gridContainer.classList.toggle('hide-cover-links', !state.showCoverLinks);
    savePrefs();
  });

  el.toggleFitArtwork.addEventListener('change', () => {
    state.fitArtwork = el.toggleFitArtwork.checked;
    el.gridContainer.classList.toggle('contain-art', !state.fitArtwork);
    el.fieldPlacementGroup.hidden = !state.fitArtwork;
    el.gridContainer.classList.toggle('overlay-fields', state.fitArtwork && state.fieldPlacement === 'overlay');
    renderGrid();
    savePrefs();
  });

  [el.fieldPlacementOverlay, el.fieldPlacementBelow].forEach(radio => {
    radio.addEventListener('change', () => {
      state.fieldPlacement = el.fieldPlacementOverlay.checked ? 'overlay' : 'below';
      el.gridContainer.classList.toggle('overlay-fields', state.fitArtwork && state.fieldPlacement === 'overlay');
      renderGrid();
      savePrefs();
    });
  });

  el.toggleCloseGaps.addEventListener('change', () => {
    state.closeGaps = el.toggleCloseGaps.checked;
    el.gridContainer.classList.toggle('close-gaps', state.closeGaps);
    savePrefs();
  });
  el.toggleLeftNavCompact.addEventListener('change', () => {
    state.leftNavCompact = el.toggleLeftNavCompact.checked;
    applyLeftNavCompact();
    savePrefs();
  });

  // Each element's own settings modal, now opened via the ⚙ button on its
  // chip in the new Layout drag-and-drop UI (see renderLayoutConfigUI)
  // rather than a dedicated button that only existed while that element
  // had its own checkbox row.
  // openElementConfig() lives at the top level now, next to renderConfigSlots —
  // it used to be declared HERE, inside bindEvents, so it only existed in this
  // function while its one caller (the Panels configuration's "Panel Settings…"
  // button, in initLayoutDragDrop) is elsewhere and threw ReferenceError.
  el.queueViewModeSelect.addEventListener('change', () => {
    state.queueViewMode = el.queueViewModeSelect.value;
    savePrefs();
    renderCrateQueuePanel();
  });

  el.historyLayoutChronoBtn.addEventListener('click', () => setLastfmHistoryLayout('chronological'));
  el.historyLayoutByDayBtn.addEventListener('click', () => setLastfmHistoryLayout('byDay'));
  el.historyViewListBtn.addEventListener('click', () => setLastfmHistoryViewMode('list'));
  el.historyViewGridBtn.addEventListener('click', () => setLastfmHistoryViewMode('grid'));

  // 8. Add / Edit Album Events
  el.addAlbumBtn.addEventListener('click', openAddModal);
  el.lastfmBtn.addEventListener('click', () => { el.layoutMenu.hidden = true; openLastfmModal(); });
  el.timelineBtn.addEventListener('click', openTimelineModal);
  el.timelineClose.addEventListener('click', closeTimelineModal);
  el.timelinePrevYear.addEventListener('click', () => timelineStep(-1));
  el.timelineNextYear.addEventListener('click', () => timelineStep(1));
  el.timelineSlider.addEventListener('input', () => setTimelineYear(Number(el.timelineSlider.value)));
  el.timelineModeReleaseBtn.addEventListener('click', () => setTimelineMode('release'));
  el.timelineModeListenBtn.addEventListener('click', () => setTimelineMode('listen'));
  el.mapBtn.addEventListener('click', openMapModal);
  el.mapClose.addEventListener('click', closeMapModal);
  el.mapApiKeySaveBtn.addEventListener('click', saveMapApiKeyAndLoad);
  el.mapApiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveMapApiKeyAndLoad(); });
  el.mapKeyEditBtn.addEventListener('click', () => {
    el.mapApiKeyInput.value = loadMapApiKey() || '';
    el.mapMain.hidden = true;
    el.mapKeySetup.hidden = false;
    el.mapApiKeyInput.focus();
  });
  el.mapCategorySelect.addEventListener('change', () => {
    populateMapCategoryValues();
    if (state.mapTimeEnabled) renderMapTimeTicks();
    renderMap();
  });
  el.mapCategoryValueSelect.addEventListener('change', () => {
    if (state.mapTimeEnabled) renderMapTimeTicks();
    renderMap();
  });
  el.mapSortSelect.addEventListener('change', renderMap);
  el.mapColorBySelect.addEventListener('change', () => {
    state.mapColorBy = el.mapColorBySelect.value;
    savePrefs();
    renderMap();
  });
  el.mapTimeToggleBtn.addEventListener('click', toggleMapTimeMode);
  el.mapTimeGranYearBtn.addEventListener('click', () => setMapTimeGranularity('year'));
  el.mapTimeGranMonthBtn.addEventListener('click', () => setMapTimeGranularity('month'));
  el.mapTimeSlider.addEventListener('input', () => setMapTimeIndex(Number(el.mapTimeSlider.value)));
  el.mapTimePrev.addEventListener('click', () => mapTimeStep(-1));
  el.mapTimeNext.addEventListener('click', () => mapTimeStep(1));
  applyMapWindowPrefs();
  initMapWindowDrag();
  observeMapWindowResize();
  initMapMobileBreakpointListener();
  wireMapColumnResize();
  el.lastfmClose.addEventListener('click', closeLastfmModal);
  el.lastfmCancelBtn.addEventListener('click', closeLastfmModal);
  el.lastfmFetchBtn.addEventListener('click', runLastfmFetch);
  el.lastfmBackBtn.addEventListener('click', () => { el.lastfmPreview.hidden = true; el.lastfmSetup.hidden = false; });
  el.lastfmImportBtn.addEventListener('click', confirmLastfmImport);
  el.addClose.addEventListener('click', closeAddModal);
  el.addCancelBtn.addEventListener('click', closeAddModal);
  el.addSearchInput.addEventListener('input', debounce(() => {
    const q = el.addSearchInput.value.trim();
    if (q.length < 2) {
      // Too short to search yet — clear any stale suggestions instead of
      // leaving the last query's results showing.
      addSearchSeq++;
      el.addResults.innerHTML = '';
      el.addForm.hidden = true;
      return;
    }
    doAddSearch();
  }, 450));
  el.addSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doAddSearch(); }
  });
  // Lets someone skip the MusicBrainz search entirely and go straight to a
  // blank manual-entry form — previously the only way there was to type a
  // query, wait for (or fail) a search, then hit "Enter it manually" inside
  // the results list. Same destination (showAddForm with no prefill) as
  // that existing link, just reachable without searching first.
  el.addResultsListBtn.addEventListener('click', () => setReleaseSearchGridView(false));
  el.addResultsGridBtn.addEventListener('click', () => setReleaseSearchGridView(true));
  el.addSearchHelpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.addSearchHelpPopover.hidden = !el.addSearchHelpPopover.hidden;
  });
  document.addEventListener('click', (e) => {
    if (el.addSearchHelpPopover.hidden) return;
    if (el.addSearchHelpPopover.contains(e.target) || e.target === el.addSearchHelpBtn) return;
    el.addSearchHelpPopover.hidden = true;
  });
  el.addManualEntryBtn.addEventListener('click', () => {
    addSearchSeq++; // invalidate any in-flight/pending search
    el.addResults.innerHTML = '';
    showAddForm({});
  });
  el.addSaveBtn.addEventListener('click', saveNewAlbum);
  el.addTracksAddRowBtn.addEventListener('click', () => addTracklistBuilderRow(el.addTracksRows).querySelector('.tracklist-builder-title').focus());      // the new row is ready to type in
  wireTracklistBuilderContainer(el.addTracksRows, () => el.addArtist.value);
  tlInitTools('add');
  el.addSpotifyMatchAddBtn.addEventListener('click', () => {
    if (!pendingAddSpotifyTracklist) return;
    renderTracklistBuilderRows(el.addTracksRows, pendingAddSpotifyTracklist.map(t => Object.assign({}, t, { s: 'spotify' })));
    hideAddSpotifyMatchBanner();
    flashToast(el.addToast, 'Tracklist added — review it below before saving');
    if (state.autoMatchOnAdd) autoMatchAddForm();
  });
  el.addSpotifyMatchDismissBtn.addEventListener('click', () => hideAddSpotifyMatchBanner());
  el.addMusicBrainzMatchAddBtn.addEventListener('click', () => {
    if (!pendingAddMusicBrainzTracklist) return;
    renderTracklistBuilderRows(el.addTracksRows, pendingAddMusicBrainzTracklist.map(t => Object.assign({}, t, { s: 'musicbrainz' })));
    hideAddMusicBrainzMatchBanner();
    flashToast(el.addToast, 'Tracklist added — review it below before saving');
    if (state.autoMatchOnAdd) autoMatchAddForm();
  });
  el.addMusicBrainzMatchDismissBtn.addEventListener('click', () => hideAddMusicBrainzMatchBanner());
  el.deckEditBtn.addEventListener('click', openEditModal);
  el.editClose.addEventListener('click', closeEditModal);
  el.editCancelBtn.addEventListener('click', closeEditModal);
  el.editSaveBtn.addEventListener('click', saveEditAlbum);
  el.editTracksAddRowBtn.addEventListener('click', () => addTracklistBuilderRow(el.editTracksRows).querySelector('.tracklist-builder-title').focus());
  el.editTracksLoadBtn.addEventListener('click', () => loadCurrentTracklistIntoBuilder());
  wireTracklistBuilderContainer(el.editTracksRows, () => el.editArtist.value);
  tlInitTools('edit');

  // 9. Deck (Detail Modal) Actions
  el.deckClose.addEventListener('click', closeDeck);
  el.deckSaveReview.addEventListener('click', saveReview);
  el.deckRemoveBtn.addEventListener('click', onRemoveBtnClick);
  el.deckPlaylistBtn.addEventListener('click', () => {
    if (!activeItem) return;
    openAddToPlaylistSubmenu(el.deckPlaylistBtn, [{ itemType: 'album', row: activeItem.row, albumId: activeItem.albumId || '', trackNum: '', trackName: '' }]);
  });
  // Mirrors qaQueueBtn/qaRemoveBtn from the Quick Actions sheet (see
  // #qaOverlay), just acting on the deck's own activeItem instead of
  // whichever grid item opened the sheet — deckActionsBar is the desktop
  // equivalent of that same set of actions, laid out as a full bar instead
  // of a popover since there's room for it here.
  el.deckQueueBtn.addEventListener('click', () => { if (activeItem) queueAlbumTracks(activeItem); });
  el.deckPlaylistRemoveBtn.addEventListener('click', () => { if (activeItem) removeAlbumFromActivePlaylist(activeItem); });

  // The deck's Spotify link starts on a search page and gets upgraded to
  // the exact album once MusicBrainz resolution finishes (kicked off in
  // openDeck). If clicked before that finishes, open the tab immediately
  // (so it isn't popup-blocked) and swap it to the exact album page as
  // soon as resolution completes, instead of leaving the user on a search.
  el.deckSpotifyLink.addEventListener('click', (e) => {
    if (el.deckSpotifyLink.classList.contains('direct-link')) return; // already the exact album
    e.preventDefault();
    const item = activeItem;
    const win = window.open(el.deckSpotifyLink.href, '_blank', 'noopener,noreferrer');
    if (!item) return;
    getExternalLinksFor(item).then(links => {
      if (links.spotify && win && !win.closed) win.location = links.spotify;
    });
  });

  // Play button only appears once a real Spotify match is resolved (see
  // applyResolvedLinksToDeck) — docks a compact player at the bottom of
  // the screen that keeps playing even after the deck is closed.
  el.deckPlayBtn.addEventListener('click', () => {
    const uri = el.deckPlayBtn.dataset.uri;
    if (uri) { nowPlayingItem = activeItem; showMiniPlayer(uri, beginPlayIntent()); }
  });
  el.miniPlayerClose.addEventListener('click', () => {
    // Closing the player docks it back to the bottom bar rather than
    // stopping playback — there's no "close" that pauses, for either
    // engine; to actually stop listening, use the play/pause control (or,
    // for Spotify, disconnect the account).
    setPlayerDetached(false);
  });
  el.miniPlayerPlayPause.addEventListener('click', () => {
    // The queue's current track never started (Spotify refused it): Play tries THAT track again, rather than
    // resuming the one paused when the queue moved on to it.
    if (isPlayingCrateQueue() && crateQueueStalledIndex === crateQueueIndex) { playCrateQueueIndex(crateQueueId, crateQueueIndex); return; }
    if (activePlayerEngine === 'youtube') {
      if (!ytPlayer) return;
      if (ytIsPaused) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
    } else if (activePlayerEngine === 'soundcloud') {
      if (!scWidget) return;
      if (scIsPaused) scWidget.play(); else scWidget.pause();
    } else if (activePlayerEngine === 'local') {          // (1.98.0) the Local player (js/49-p2p-local.js)
      p2pLocalToggle();
    } else if (spotifyPlayer) {
      spotifyPlayer.togglePlay();
    }
  });
  el.miniPlayerPrev.addEventListener('click', () => masterPlayerStepTrack(-1));
  el.miniPlayerNext.addEventListener('click', () => masterPlayerStepTrack(1));
  el.miniPlayerShuffle.addEventListener('click', () => setShuffle(!state.shuffle));
  if (el.miniPlayerLoop) { el.miniPlayerLoop.addEventListener('click', cycleLoop); updateLoopButtonUI(); }
  updateShuffleButtonUI();
  el.miniPlayerVolume.addEventListener('input', () => {
    const val = Number(el.miniPlayerVolume.value);
    if (activePlayerEngine === 'youtube') {
      ytLastKnownVolume = val || ytLastKnownVolume;
      if (ytPlayer && ytPlayer.setVolume) {
        ytPlayer.setVolume(val);
        if (val > 0 && ytPlayer.isMuted && ytPlayer.isMuted()) ytPlayer.unMute();
      }
      saveYtPlayerPrefs({ volume: val });
    } else if (activePlayerEngine === 'soundcloud') {
      scLastKnownVolume = val || scLastKnownVolume;
      if (scWidget && scWidget.setVolume) scWidget.setVolume(val);
      saveScPlayerPrefs({ volume: val });
    } else if (activePlayerEngine === 'local') {
      p2pLocalSetVolume(val);          // (1.98.0) the Local player (js/49-p2p-local.js)
    } else {
      if (spotifyPlayer) spotifyPlayer.setVolume(val / 100).catch(() => {});
      saveSpotifyPlayerPrefs({ volume: val });
    }
  });
  el.miniPlayerFullscreenBtn.addEventListener('click', toggleYtFullscreen);
  el.miniPlayerQueueBtn.addEventListener('click', () => {
    el.devicePanel.hidden = true;
    if (!el.queuePanel.hidden) { el.queuePanel.hidden = true; return; }
    el.queuePanel.hidden = false;
    refreshQueuePanel();
  });
  el.miniPlayerDeviceBtn.addEventListener('click', () => {
    el.queuePanel.hidden = true;
    if (!el.devicePanel.hidden) { el.devicePanel.hidden = true; return; }
    el.devicePanel.hidden = false;
    refreshDevicePanel();
  });
  el.devicePanelClose.addEventListener('click', () => { el.devicePanel.hidden = true; });

  el.albumQuickPeekClose.addEventListener('click', closeAlbumQuickPeek);
  el.albumQuickPeek.addEventListener('click', (e) => { const b = e.target.closest('[data-qp]'); if (b) { e.stopPropagation(); qpAction(b.dataset.qp, b); return; } const t = e.target.closest('[data-qp-tab]'); if (t) qpSetTab(t.dataset.qpTab); });
  document.addEventListener('keydown', (e) => {                       // with the popup open: ‹ › to the next cover, Escape to close
    if (el.albumQuickPeek.hidden || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); qpNav(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); qpNav(-1); } else if (e.key === 'Escape') closeAlbumQuickPeek();
  });
  el.albumQuickPeekArt.addEventListener('click', () => { if (quickPeekItem) { const it = quickPeekItem; closeAlbumQuickPeek(); openDeck(it); } });
  el.albumQuickPeekTitle.addEventListener('click', () => { if (quickPeekItem) { const it = quickPeekItem; closeAlbumQuickPeek(); openDeck(it); } });
  // Event delegation (not a direct listener) since .quick-peek-artist-link
  // itself is regenerated via innerHTML on every open, not a stable element.
  el.albumQuickPeekSub.addEventListener('click', (e) => {
    if (!e.target.closest('.quick-peek-artist-link') || !quickPeekItem) return;
    const artist = quickPeekItem.artist;
    closeAlbumQuickPeek();
    openArtistInfoTab(artist);
  });
  document.addEventListener('click', (e) => {
    if (el.albumQuickPeek.hidden) return;
    if (el.albumQuickPeek.contains(e.target)) return;
    if (e.target.closest('.card[data-album-row]')) return; // let a click on another card open its own peek instead of just closing this one
    closeAlbumQuickPeek();
  });
  el.devicePanelList.addEventListener('click', (e) => {
    const row = e.target.closest('.device-row-clickable');
    if (!row) return;
    transferSpotifyPlayback(row.dataset.deviceId);
  });
  el.devicePanelList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.device-row-clickable');
    if (!row) return;
    e.preventDefault();
    transferSpotifyPlayback(row.dataset.deviceId);
  });
  el.miniPlayerDetachBtn.addEventListener('click', () => setPlayerDetached(true));
  el.miniPlayerDockBtn.addEventListener('click', () => setPlayerDetached(false));
  initPlayerDrag();
  initPlayerFit();
  initMobileDrawers();
  initMobileOverflowMenu();
  initSeekDrag();
  initLayoutDragDrop();
  initTrackInfoSeek();
  initArtistInfoPage();
  initTabBar();
  initUpdateLog();
  initGenrePage();
  initLinkFlags();
  initAddMatch();
  initLastfmReview();
  initCrateExchange();
  initDupGuard();
  initAddonBridge();
  initSoundAnalysis();
  initRymRatings();
  initGenreLinks();
  el.miniPlayerArt.addEventListener('click', () => {
    // On the compact mobile layout, tapping anywhere on the bar (including
    // the art) opens Quick Actions instead — see the el.miniPlayer listener
    // below. Bail out here so this click bubbles up to that one rather than
    // also opening the add-menu underneath it.
    if (isMiniPlayerMobileLayout()) return;
    if (!currentSpotifyTrack) return;
    const rect = el.miniPlayerArt.getBoundingClientRect();
    openNowPlayingAddMenu(currentSpotifyTrack, rect.left, rect.bottom + 6);
  });
  // Title/artist/album click-throughs only make sense for a Spotify track
  // (they navigate using currentSpotifyTrack) — a no-op while a YouTube
  // track is showing in the same slot, guarded via activePlayerEngine.
  // Same mobile bail-out as the art click above, same reasoning.
  el.miniPlayerTitle.addEventListener('click', () => { if (isMiniPlayerMobileLayout()) return; if (activePlayerEngine === 'spotify') goToTrackPage(currentSpotifyTrack); });
  // A line that shows the artist (the player's lines are yours to choose) opens the artist's page; otherwise they do what they did.
  const playerArtistName = (slot) => { if ((state.fields.miniPlayer || [])[slot] !== 'artist') return ''; return (nowPlayingItem && nowPlayingItem.artist) || (activePlayerEngine === 'spotify' && currentSpotifyTrack && currentSpotifyTrack.artists && currentSpotifyTrack.artists[0] ? currentSpotifyTrack.artists[0].name : ''); };
  el.miniPlayerArtist.addEventListener('click', (e) => { if (isMiniPlayerMobileLayout() || e.target.closest('a')) return; const a = playerArtistName(0); if (a) { openArtistInfoTab(a); return; } if (activePlayerEngine === 'spotify') goToArtistTracks(currentSpotifyTrack); });
  el.miniPlayerAlbum.addEventListener('click', (e) => { if (isMiniPlayerMobileLayout() || e.target.closest('a')) return; const a = playerArtistName(1); if (a) { openArtistInfoTab(a); return; } if (activePlayerEngine === 'spotify') goToTrackPage(currentSpotifyTrack); });
  // Right-click anywhere on the player's track area (art, title, artist, album)
  // — see openPlayerTrackContextMenu. Only swallows the browser's own menu when
  // there's actually something playing to act on.
  el.miniPlayerTrackInfo.addEventListener('contextmenu', (e) => {
    if (openPlayerTrackContextMenu(e.clientX, e.clientY)) e.preventDefault();
  });
  // Shared by the whole-bar tap (below) and miniPlayerExpandBtn's own
  // click handler — the mobile mini player's "there's more here" action,
  // pointed at whatever's currently playing.
  function openMiniPlayerMoreSheet() {
    if (nowPlayingItem) { openQuickActions(nowPlayingItem); return; }
    // Nothing playing that's already matched to a crate item (e.g. a track
    // found via search, or reviewing a Last.fm scrobble) — this is exactly
    // the case openNowPlayingAddMenu (album name click on desktop) covers,
    // offering "as Album" / "as Single" / "Search manually…", but that's
    // wired to a click handler that bails out on mobile, so on mobile this
    // previously did nothing at all. Open the same choice menu here
    // instead of jumping straight into a form, positioned above the bar.
    if (activePlayerEngine === 'spotify' && currentSpotifyTrack) {
      const rect = el.miniPlayer.getBoundingClientRect();
      openNowPlayingAddMenu(currentSpotifyTrack, rect.left, rect.top - 6);
    }
  }
  // Whole-bar tap-to-open, mobile only: the compact mobile mini player drops
  // most of its buttons (see .mini-player-options/.mini-player-progress-row
  // in the stylesheet) to stay short, so tapping the bar itself is now how
  // you reach everything else. Excludes anything that still has its own
  // control on the compact bar (transport buttons, the seek track, volume,
  // close, drag handle) so those keep working normally; everything else
  // (art/title/artist/album/background) falls through to here since their
  // own click handlers above already bail out on mobile.
  el.miniPlayer.addEventListener('click', (e) => {
    if (!isMiniPlayerMobileLayout()) return;
    if (e.target.closest('.mini-player-btn, .mini-player-seek-track, .mini-player-volume, .mini-player-close, .mini-player-drag-handle')) return;
    openMiniPlayerMoreSheet();
  });
  el.nowPlayingBox.addEventListener('click', () => {
    if (!currentSpotifyTrack) return;
    const rect = el.nowPlayingBox.getBoundingClientRect();
    openNowPlayingAddMenu(currentSpotifyTrack, rect.left, rect.bottom + 6);
  });
  el.queuePanelClose.addEventListener('click', () => { el.queuePanel.hidden = true; });
  if (el.crateQueueClearBtn) el.crateQueueClearBtn.addEventListener('click', clearCrateQueue);
  el.queuePanelList.addEventListener('click', (e) => {
    const row = e.target.closest('.queue-row-clickable');
    if (!row) return;
    const idx = parseInt(row.dataset.queueIndex, 10);
    const uris = lastQueueData.slice(idx).map(t => t.uri).filter(Boolean);
    if (uris.length) { beginPlayIntent(); playSpotifyUri(uris); }
  });
  el.queuePanelList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.queue-row-clickable');
    if (!row) return;
    e.preventDefault();
    row.click();
  });

  // 10. Listen Log (Diary) Events
  el.logListenBtn.addEventListener('click', () => {
    if (!el.logForm.hidden && editingEntryIdx === null) {
      el.logForm.hidden = true;
      return;
    }
    editingEntryIdx = null;
    el.logSaveBtn.textContent = 'Save entry';
    el.logForm.hidden = false;
    el.logDate.value = new Date().toISOString().slice(0, 10);
    el.logEntryTitle.value = '';
    el.logDescription.value = '';
    el.logSelectAllBtn.disabled = false;
    renderLogStars(0);

    // If several tracks were already highlighted (clicked) in the tracklist
    // before hitting "+ Log a listen", fold them straight into the entry —
    // same effect as right-clicking them and choosing "Add to entry", just
    // automatic so highlight-then-log is a two-click flow instead of three.
    if (activeItem) {
      const highlighted = currentTracklistTracks
        .filter(t => state.selectedTracks.has(`${activeItem.row}::${t.trackNumber || 0}`))
        .map(t => ({ itemType: 'track', row: activeItem.row, trackNum: t.trackNumber || '', trackName: t.trackName || '' }));
      if (highlighted.length > 1) { addTracksToEntry(highlighted); return; } // addTracksToEntry re-renders the summary itself
    }
    renderLogTrackSummary();
  });
  el.logCancelBtn.addEventListener('click', () => { resetLogForm(); });
  el.logSaveBtn.addEventListener('click', saveLogEntry);
  el.logSelectAllBtn.addEventListener('click', () => { if (activeItem) selectAllTracks(activeItem); });
  el.logClearSelectionBtn.addEventListener('click', () => { if (activeItem) clearTrackSelection(activeItem); });
  el.deckDiaryList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.dd-edit-btn');
    if (editBtn) {
      const row = editBtn.closest('.deck-diary-entry');
      openEditEntry(parseInt(row.dataset.idx, 10));
      return;
    }
    const delBtn = e.target.closest('.dd-delete-btn');
    if (delBtn) {
      const row = delBtn.closest('.deck-diary-entry');
      onDiaryDeleteClick(parseInt(row.dataset.idx, 10));
      return;
    }
    const row = e.target.closest('.deck-diary-entry');
    if (row) openDeckDiaryEntryInDiaryTab(parseInt(row.dataset.idx, 10));
  });
  el.deckDiaryList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.dd-action-btn')) return; // let the button's own click handle it
    const row = e.target.closest('.deck-diary-entry');
    if (!row) return;
    e.preventDefault();
    openDeckDiaryEntryInDiaryTab(parseInt(row.dataset.idx, 10));
  });

  // 11. Tracklist Interactions (Stars, Notes, Play)
  el.deckTracklist.addEventListener('click', async (e) => {
    if (!activeItem) return;

    const playBtn = e.target.closest('.track-play-btn');
    if (playBtn) {
      const trackName = playBtn.dataset.trackName;
      const trackNum = playBtn.closest('.track-row-wrap')?.dataset.track;
      const item = activeItem;
      const originalContent = playBtn.textContent;
      playBtn.textContent = '…';
      playBtn.disabled = true;
      try {
        await playTrackNow(item, trackName, trackNum);
      } finally {
        if (playBtn.isConnected) { playBtn.textContent = originalContent; playBtn.disabled = false; }
      }
      return;
    }

    const ytPlayBtn = e.target.closest('.track-play-yt-btn');
    if (ytPlayBtn) {
      openYoutubePlayer(ytPlayBtn.dataset.youtubeLink, ytPlayBtn.dataset.trackName, undefined, activeItem);
      return;
    }

    // Track star ratings (hover-preview + drag-to-rate) are handled by
    // setupTrackStarInteraction(), wired up separately — see init.

    if (e.target.closest('#tlSelectAllBtn')) { await selectAllTracks(activeItem); return; }
    if (e.target.closest('#tlMatchSongsBtn')) { openSongMatcher(activeItem); return; }
    if (e.target.closest('#tlClearSelectionBtn')) { await clearTrackSelection(activeItem); return; }
    if (e.target.closest('#tlAddTrackBtn')) { tlAddTrackFromDeck(activeItem); return; }
    if (e.target.closest('#tlToggleCreditsBtn')) {
      state.showTrackCredits = !state.showTrackCredits;
      savePrefs();
      renderTracklistBody(activeItem, currentTracklistTracks);
      return;
    }

    const listenToggleBtn = e.target.closest('.track-listen-toggle');
    if (listenToggleBtn) {
      const trackNum = listenToggleBtn.closest('.track-row-wrap').dataset.track;
      listenToggleBtn.disabled = true;
      try {
        await toggleTrackListened(activeItem, trackNum);
      } finally {
        if (listenToggleBtn.isConnected) listenToggleBtn.disabled = false;
      }
      return;
    }

    const toggleBtn = e.target.closest('.track-note-toggle');
    if (toggleBtn) {
      const wrap = toggleBtn.closest('.track-row-wrap').querySelector('.track-note-wrap');
      wrap.classList.toggle('open');
      return;
    }

    const saveBtn = e.target.closest('.save-track-note-btn');
    if (saveBtn) {
      const wrapWrap = saveBtn.closest('.track-row-wrap');
      const trackNum = wrapWrap.dataset.track;
      const noteInput = wrapWrap.querySelector('.track-note-input');
      const noteVal = noteInput.value.trim();
      saveBtn.textContent = 'Saved!';
      const infoMain = wrapWrap.querySelector('.track-info-main');
      let previewEl = infoMain.querySelector('.track-note-preview');
      if (noteVal) {
        if (!previewEl) { previewEl = document.createElement('span'); previewEl.className = 'track-note-preview'; infoMain.appendChild(previewEl); }
        previewEl.textContent = noteVal;
      } else if (previewEl) previewEl.remove();
      wrapWrap.querySelector('.track-note-toggle').classList.toggle('has-note', !!noteVal);
      setTimeout(() => { wrapWrap.querySelector('.track-note-wrap').classList.remove('open'); }, 300);
      updateTrackData(activeItem, trackNum, { note: noteVal }).then(() => { setTimeout(() => { saveBtn.textContent = 'Save track note'; }, 500); });
      return;
    }

    // Row highlight (plain/ctrl/shift click) — same handleTrackRowClick()
    // the flat Tracks table and "Album and Tracks" view use, scoped to this
    // tracklist's own rows. Excludes the interactive column (listen-toggle/
    // stars/note-toggle/time — stars use their own pointer handlers, see
    // setupTrackStarInteraction, so a plain click there still bubbles here)
    // and the expandable note editor, both handled above/elsewhere.
    if (e.target.closest('.track-interactive') || e.target.closest('.track-note-wrap')) return;
    const rowWrap = e.target.closest('.track-row-wrap');
    if (rowWrap) handleTrackRowClick(e, rowWrap, el.deckTracklist, '.track-row-wrap');
  });

  el.deckTracklist.addEventListener('contextmenu', (e) => {
    if (!activeItem) return;
    const rowEl = e.target.closest('.track-row-wrap');
    if (!rowEl) return;
    e.preventDefault();
    const trackNum = rowEl.dataset.track;
    const track = currentTracklistTracks.find(t => String(t.trackNumber || 0) === String(trackNum));
    const rowKey = rowEl.dataset.trackKey;

    // Right-clicking a row outside the current highlight selects it first
    // (standard behavior, same as the flat Tracks table/"Album and Tracks"
    // view) so the menu always acts on whatever ends up highlighted.
    if (rowKey && !state.selectedTracks.has(rowKey)) {
      state.selectedTracks.clear();
      state.selectedTracks.add(rowKey);
      state.lastSelectedTrackKey = rowKey;
      Array.from(el.deckTracklist.querySelectorAll('.track-row-wrap')).forEach(r => r.classList.toggle('selected', r.dataset.trackKey === rowKey));
    }
    const selectedItems = currentTracklistTracks
      .map(t => ({ t, key: `${activeItem.row}::${t.trackNumber || 0}` }))
      .filter(x => state.selectedTracks.has(x.key))
      .map(x => ({ itemType: 'track', row: activeItem.row, albumId: activeItem.albumId || '', trackNum: x.t.trackNumber || '', trackName: x.t.trackName || '' }));

    openTrackContextMenu(activeItem, track ? track.trackName : '', e.clientX, e.clientY, track ? track.trackNumber : '', selectedItems);
  });

  // 11b. Play buttons in the "Album and Tracks" list (each row carries its
  // own artist, since — unlike the deck — this view shows many albums at
  // once and there's no single activeItem to fall back on).
  el.gridContainer.addEventListener('click', async (e) => {
    const ytPlayBtn = e.target.closest('.track-play-yt-btn');
    if (ytPlayBtn) {
      // data-row identifies which album this row belongs to (this view can
      // show several albums at once) — used to pass that album's own
      // cached tracklist rather than whatever's open in the deck, if
      // anything. See openYoutubePlayer's comment for why that matters.
      const rowItem = state.raw.find(r => String(r.row) === ytPlayBtn.dataset.row);
      openYoutubePlayer(ytPlayBtn.dataset.youtubeLink, ytPlayBtn.dataset.trackName, rowItem ? state.trackCache[artKey(rowItem)] : undefined, rowItem);
      return;
    }
    const playBtn = e.target.closest('.track-play-btn');
    if (!playBtn) return;
    const rowItem = state.raw.find(r => String(r.row) === playBtn.dataset.row);
    if (!rowItem) return;
    const trackName = playBtn.dataset.trackName;
    const trackNum = playBtn.dataset.trackNum;
    const originalContent = playBtn.textContent;
    playBtn.textContent = '…';
    playBtn.disabled = true;
    try {
      await playTrackNow(rowItem, trackName, trackNum);
    } finally {
      if (playBtn.isConnected) { playBtn.textContent = originalContent; playBtn.disabled = false; }
    }
  });

  // 12. Global Click Listeners (Close dropdowns/modals when clicking outside)
  document.addEventListener('click', (e) => {
    if (!el.leftModeMenu.hidden && !el.leftModeMenu.contains(e.target) && !el.leftModeBtn.contains(e.target)) el.leftModeMenu.hidden = true;
    if (!el.albumsViewMenu.hidden && !el.albumsViewMenu.contains(e.target) && !el.mainViewBtn.contains(e.target)) { el.albumsViewMenu.hidden = true; document.getElementById('groupByMenuItem').classList.remove('submenu-open'); }
    if (!el.layoutMenu.hidden && !el.layoutMenu.contains(e.target) && !el.layoutBtn.contains(e.target)) el.layoutMenu.hidden = true;
    if (!el.sortFilterMenu.hidden && !el.sortFilterMenu.contains(e.target) && !el.sortFilterBtn.contains(e.target)) el.sortFilterMenu.hidden = true;
    if (!el.arrangeModal.hidden && !el.arrangeModal.contains(e.target) && !el.menuArrangePanels.contains(e.target)) el.arrangeModal.hidden = true;
    // .layout-row-configure is the Panels configuration's "Panel Settings…" button — the
    // exemption below only named .layout-chip-configure, its pre-rebuild class, which
    // no longer exists. So the click that OPENED this dialog from there also bubbled up
    // to this handler, looked like a click outside it, and closed it again instantly.
    if (!el.mainConfigModal.hidden && !el.mainConfigModal.contains(e.target) && !e.target.closest('.layout-chip-configure, .layout-row-configure') && !el.menuCustomizeMain.contains(e.target)) el.mainConfigModal.hidden = true;
  });

  // Global Key Listeners (Escape key to close, Ctrl/Cmd+A to select all)
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
      // Skip entirely while the deck (release view) or a form modal is open
      // — those either have no "select all" concept here, or (the deck)
      // aren't wired up to it, so falling through would otherwise select
      // whatever's in the main panel behind it instead.
      // The deck (release view) is shown/hidden via a CSS class
      // (.open), NOT the `hidden` attribute — unlike every other overlay
      // checked below, which does use `hidden`. el.deckOverlay.hidden is
      // therefore always false, deck open or not, which meant modalOpen
      // below was permanently stuck at true and this entire Ctrl/Cmd+A
      // handler — every branch, in every context — has never actually
      // run. Checking the real open state instead.
      const deckIsOpen = el.deckOverlay.classList.contains('open');
      if (deckIsOpen && !isEditable && activeItem) {
        e.preventDefault();
        selectAllTracks(activeItem);
        return;
      }
      const modalOpen = deckIsOpen || !el.addOverlay.hidden || !el.editOverlay.hidden || !el.timelineOverlay.hidden || !el.mapOverlay.hidden;
      if (!isEditable && !modalOpen) {
        if (state.activeTab === 'diary') {
          e.preventDefault();
          selectAllDiaryEntries();
          return;
        }
        if (state.activeTab === 'albums' && !state.activePlaylistId) {
          if (state.mainViewMode === 'tracks' || state.mainViewMode === 'albumTracks') {
            e.preventDefault();
            selectAllVisibleTracks();
            return;
          }
          if (state.mainViewMode === 'albums' || state.mainViewMode === 'covers') {
            e.preventDefault();
            selectAllVisibleAlbums();
            return;
          }
        }
        // A playlist's own "Tracks" sub-view (renderPlaylistTracksView)
        // reuses the exact same flat-table rows/data-track-key/
        // state.selectedTracks setup as the main library's Tracks view —
        // selectAllVisibleTracks() already works for it unchanged. This
        // branch was simply missing before, so Ctrl/Cmd+A did nothing at
        // all while a playlist was open, even in its Tracks view.
        if (state.activeTab === 'albums' && state.activePlaylistId && state.playlistViewMode === 'tracks') {
          e.preventDefault();
          selectAllVisibleTracks();
          return;
        }
      }
    }
    if (e.key !== 'Escape') return;
    closeCxImport(); closeCxExport(); closeSoundDialog(); closeRymDialog(); closeLastfmReview(); closeSongMatcher(); closeUpdateLog(); closeArtistQuickOpen(); closeNowPlayingAddMenu(); closeDeck(); closeQuickActions(); closeAdvSearch(); el.arrangeModal.hidden = true; el.mainConfigModal.hidden = true; closeAddModal(); closeEditModal(); closeTrackPropertiesModal(); closeTimelineModal(); closeMapModal();
    setMobileDrawer(null);
    // Deliberately NOT closing the master player here — whichever engine
    // (Spotify or YouTube) is driving it, it's a persistent background
    // player now, not a modal, so Escape (used to dismiss whatever modal/
    // menu is open) leaves it playing.
    el.albumsViewMenu.hidden = true; el.leftModeMenu.hidden = true; el.layoutMenu.hidden = true; el.sortFilterMenu.hidden = true;
    document.getElementById('groupByMenuItem').classList.remove('submenu-open');
  });

  // Full-screen overlay backdrop clicks
  [el.deckOverlay, el.addOverlay, el.editOverlay, el.lastfmOverlay, el.playlistModalOverlay, el.timelineOverlay, el.mapOverlay].forEach(overlay => {
    overlay.addEventListener('click', (e) => { 
      if (e.target === overlay) {
        if (overlay === el.deckOverlay) closeDeck();
        else if (overlay === el.addOverlay) closeAddModal();
        else if (overlay === el.lastfmOverlay) closeLastfmModal();
        else if (overlay === el.playlistModalOverlay) closePlaylistModal();
        else if (overlay === el.timelineOverlay) closeTimelineModal();
        else if (overlay === el.mapOverlay) closeMapModal();
        else closeEditModal();
      }
    });
  });
}

async function updateTrackData(item, trackNum, updates) {
  if (!item.trackData) item.trackData = {};
  if (!item.trackData[trackNum]) item.trackData[trackNum] = {};
  
  Object.assign(item.trackData[trackNum], updates);
  
  // Cleanup empty objects so we don't save useless bloat
  if (!item.trackData[trackNum].altTitle && !item.trackData[trackNum].rating && !item.trackData[trackNum].note && !item.trackData[trackNum].listened && !item.trackData[trackNum].genre && !item.trackData[trackNum].youtubeLink && !item.trackData[trackNum].spotifyLink && !item.trackData[trackNum].name && !item.trackData[trackNum].lengthMs && !item.trackData[trackNum].album && !item.trackData[trackNum].rymLink && !item.trackData[trackNum].rymRating && !item.trackData[trackNum].date && !item.trackData[trackNum].artist && !item.trackData[trackNum].albumArtist && !item.trackData[trackNum].soundcloudLink && !item.trackData[trackNum].credits) {
    delete item.trackData[trackNum];
  }

  refreshLinkFlagsFor(item);   // a link may have just been added or removed
  try {
    await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData) });
    flashToast(el.deckToast, 'Track saved');
  } catch (err) {
    flashToast(el.deckToast, 'Couldn\u2019t save track data — try again');
  }
}


function updateLeftMenuUI() {
  [...el.leftModeMenu.querySelectorAll('button')].forEach(btn => {
    btn.classList.remove('active-option');
    if (btn.dataset.mode === state.leftMode) btn.classList.add('active-option');
    if (btn.dataset.leftSort === state.leftSort) btn.classList.add('active-option');
    if (btn.dataset.leftGroup === state.leftGroupBy) btn.classList.add('active-option');
    if (btn.dataset.leftThumb === state.leftThumbSize) btn.classList.add('active-option');
  });
  // "Group by" only means anything in Albums mode — Artists/Genres/Years
  // already show one row per category, so there's nothing to cluster there.
  if (el.leftGroupBySection) el.leftGroupBySection.hidden = state.leftMode !== 'album';
}

// Opens the field-slot settings dialog for one element in the Panels
// configuration ("Panel Settings…" on its row). For Music View that is where
// you choose which details appear on the album cards — the corner tags on the
// artwork, the fields underneath, and (with "Fit artwork" on) "Overlay fields
// inside artwork". Was declared inside bindEvents() but called from
// initLayoutDragDrop(), a different scope, so the button threw "openElementConfig
// is not defined" and none of those settings could be reached.
function openElementConfig(elementKey) {
  if (!LAYOUT_ELEMENTS_WITH_SETTINGS.has(elementKey)) return; // before closing the Panels dialog, so a no-settings element can't make it vanish for nothing
  el.arrangeModal.hidden = true;
  if (elementKey === 'musicView') {
    const mode = (state.mainViewMode === 'covers') ? 'covers'
      : (state.mainViewMode === 'tracks' || state.mainViewMode === 'albumTracks' ? 'tracks' : 'grid');
    renderConfigSlots(mode);
  } else if (elementKey === 'queue') {
    // Adapts to whichever of the three Queue view styles is currently
    // selected (queueViewModeSelect in "element options" below).
    const modeForConfig = state.queueViewMode === 'trackDetail' ? 'queueTrackDetail'
      : state.queueViewMode === 'releaseTracks' ? 'queueReleaseTracks'
      : 'queue';
    renderConfigSlots(modeForConfig);
  } else if (elementKey === 'lastfmHistory') {
    renderConfigSlots('lastfmHistory');
  } else if (elementKey === 'trackInfo') {
    renderConfigSlots('trackInfo');
  } else if (elementKey === 'nowPlayingBar') {
    renderConfigSlots('miniPlayer');
  } else if (elementKey === 'playerControls') {
    renderConfigSlots('playerControls');
  } else {
    return; // genreDesc/chart/playerControls have no separate field-slot config — genreDesc is a single free-text box, chart is just its own genre dropdown, playerControls has nothing to configure beyond its Top/Bottom position (set by dragging it, not a modal)
  }
  el.mainConfigModal.hidden = false;
}

function renderConfigSlots(mode) {
  const container = document.getElementById('configRowsContainer');
  if (!container) return;
  container.innerHTML = '';

  // The artwork-related toggles (cover links, fit-to-panel, field
  // placement, close gaps) only mean anything for the card-based views —
  // hide them entirely for the queue/mini-player field pickers, which are
  // just a plain list of text slots with nothing to do with artwork.
  if (el.mainConfigArtworkOptions) el.mainConfigArtworkOptions.hidden = (mode === 'queue' || mode === 'queueTrackDetail' || mode === 'queueReleaseTracks' || mode === 'miniPlayer' || mode === 'lastfmHistory' || mode === 'trackInfo' || mode === 'playerControls');

  const labels = {
    grid: ['Slot 1 (Top)', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5 (Bottom)'],
    tracks: ['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5'],
    covers: ['Top Left Tag', 'Bottom Right Tag', 'Bottom Left Tag'],
    coversBelow: ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'],
    queue: ['Field 1', 'Field 2', 'Field 3'],
    // "Track Detail" queue view's table columns — "#" and "Track" are
    // always fixed (same as the main Tracks View), these fill the rest.
    queueTrackDetail: ['Column 1', 'Column 2', 'Column 3'],
    // "Release and Tracks" queue view's two groups — see the addRows calls
    // for this mode below, same dual-group pattern 'covers' already uses.
    queueReleaseInfo: ['Field 1', 'Field 2', 'Field 3'],
    queueTrackInfoNested: ['Field 1 (Track name is always shown)', 'Field 2'],
    miniPlayer: ['Line 1 (under title)', 'Line 2', 'Line 3', 'Line 3, after a \u00b7'],
    lastfmHistory: ['Line 1 (title)', 'Line 2 (subtitle)', 'Line 3 (right-aligned)'],
    trackInfo: ['Field 1', 'Field 2', 'Field 3', 'Field 4']
  };

  function addSubheading(text) {
    const h = document.createElement('div');
    h.className = 'config-subheading';
    h.textContent = text;
    container.appendChild(h);
  }

  function addRows(fieldKey, slotLabels) {
    if (!state.fields[fieldKey]) state.fields[fieldKey] = [];
    const currentFields = state.fields[fieldKey];

    slotLabels.forEach((label, i) => {
      const row = document.createElement('div');
      row.className = 'config-row';

      row.innerHTML = `
        <span class="config-row-label">${label}</span>
        <select data-index="${i}" data-mode="${fieldKey}" class="config-select">
          ${Object.entries(fieldKey === 'tracks' || fieldKey === 'queue' || fieldKey === 'queueTrackDetail' || fieldKey === 'queueTrackInfoNested' || fieldKey === 'miniPlayer' ? TRACK_COLUMN_LABELS : fieldKey === 'lastfmHistory' ? LASTFM_HISTORY_FIELD_OPTIONS : FIELD_OPTIONS).map(([val, lbl]) => `<option value="${val}" ${currentFields[i] === val ? 'selected' : ''}>${lbl}</option>`).join('')}
        </select>
      `;

      row.querySelector('select').addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const m = e.target.dataset.mode;
        const val = e.target.value;

        // Update the specific slot in the state
        if (!state.fields[m]) state.fields[m] = [];
        state.fields[m][idx] = (val === 'none') ? null : val;

        savePrefs();

        // Force a re-render to show changes instantly, scoped to whichever
        // panel this field group belongs to.
        if (m === 'queue' || m === 'queueTrackDetail' || m === 'queueReleaseInfo' || m === 'queueTrackInfoNested') renderCrateQueuePanel();
        else if (m === 'miniPlayer') refreshMiniPlayerMeta();
        else if (m === 'lastfmHistory') renderLastfmHistoryPanel();
        else if (m === 'trackInfo') renderTrackInfoPanel();
        else if (state.activeTab === 'albums') renderGrid();
      });
      container.appendChild(row);
    });
  }

  if (mode === 'covers') {
    // Covers view has two independent field groups: small tags overlaid on the
    // artwork itself, and text rows printed underneath the artwork.
    addSubheading('Tags on artwork');
    addRows('covers', labels.covers);
    addSubheading('Fields below cover');
    addRows('coversBelow', labels.coversBelow);
  } else if (mode === 'grid') {
    // The tags on the artwork (catalogue number, type, stars) show on the Albums grid too, but could only be changed from
    // Album covers' settings, so in the Albums view there was no way to turn them off. Same setting (state.fields.covers),
    // reachable from both views now.
    addSubheading('Tags on artwork');
    addRows('covers', labels.covers);
    addSubheading('Fields below cover');
    addRows('grid', labels.grid);
  } else if (mode === 'queueReleaseTracks') {
    // "Release and Tracks" queue view — same dual-group pattern as
    // 'covers' just above: the release-level block shown once per
    // contiguous run of same-release queue entries, and the track-level
    // block repeated under it per track. See renderQueueReleaseTracksView().
    addSubheading('Release fields');
    addRows('queueReleaseInfo', labels.queueReleaseInfo);
    addSubheading('Track fields');
    addRows('queueTrackInfoNested', labels.queueTrackInfoNested);
  } else if (mode === 'playerControls') {
    // (1.95.25) no field slots: switches for the player itself
    const row = document.createElement('label'); row.className = 'arrange-row';
    row.innerHTML = '<input type="checkbox" id="releaseBarClickToggle"> Release bar: hover to see which song is where, click to play it';
    const cb = row.querySelector('input'); cb.checked = state.releaseBarClick !== false;
    cb.addEventListener('change', () => { state.releaseBarClick = cb.checked; savePrefs(); updateReleaseProgress(); });
    container.appendChild(row);
    const auto = document.createElement('label'); auto.className = 'arrange-row';          // (1.95.26)
    auto.innerHTML = '<input type="checkbox" id="vizAutoToggle"> Listen to this tab when CRATE opens, for the visualizer and level meter (YouTube add-on 1.5.1 or later; this device)';
    const ac = auto.querySelector('input'); ac.checked = typeof vizAutoOn === 'function' ? vizAutoOn() : true;
    ac.addEventListener('change', () => { if (typeof vizSetAuto === 'function') vizSetAuto(ac.checked); });
    container.appendChild(auto);
  } else {
    addRows(mode, labels[mode]);
  }

  const titles = { grid: 'Albums Grid', tracks: 'Tracks View', covers: 'Album Covers', queue: 'Queue (Track with Thumbnail)', queueTrackDetail: 'Queue (Track Detail)', queueReleaseTracks: 'Queue (Release and Tracks)', miniPlayer: 'Now Playing Bar', playerControls: 'Player Controls', lastfmHistory: 'Last.fm History', trackInfo: 'Track Info' };
  document.getElementById('configModalTitle').textContent = `Configure ${titles[mode]}`;
  const hint = document.querySelector('#mainConfigModal .arrange-hint');
  if (hint) {
    hint.textContent = (mode === 'tracks')
      ? '"#" and "Track" are always shown as columns — pick up to 5 more columns to add (e.g. Album, Genre, Year, Length).'
      : (mode === 'queue')
      ? 'Shown on a second line under each queued track — lets tracks that share a release read as a group (e.g. Artist, Year).'
      : (mode === 'queueTrackDetail')
      ? '"#" and "Track" are always shown as columns, same as the main Tracks View — pick up to 3 more to add.'
      : (mode === 'queueReleaseTracks')
      ? 'Release fields show once per release, grouping consecutive queued tracks from it; track fields repeat under each one (Track name is always shown there).'
      : (mode === 'miniPlayer')
      ? 'Printed under the track title, in the bottom player and in Now Playing Bar if it\u2019s placed in Main instead. Lines 1 and 2 hold one field each; the third line holds two, side by side (e.g. Year \u00b7 Descriptor). Leave a line Empty to hide it.'
      : (mode === 'lastfmHistory')
      ? 'Line 1 and 2 read as title/subtitle; Line 3 sits right-aligned (e.g. Date, Play Count).'
      : (mode === 'playerControls')
      ? 'The bar under the song\u2019s scrubber shows the whole release while one of its songs plays.'
      : (mode === 'trackInfo')
      ? 'Shown under the cover art (or player controls) for whatever\u2019s currently playing, one field per line.'
      : 'Define the fields and order (Slot 1 = Top).';
  }
}
