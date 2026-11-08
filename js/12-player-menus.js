// CRATE — player context menus, Spotify / YouTube playback and links.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// ---------- Right-click on the player's track ----------
// Right-clicking the art/title/artist/album area of the player opens one menu
// for whatever is playing, whichever engine it's on: Add to playlist, Add to
// queue, Go to artist, Go to album, View credits. This replaces a menu that
// only existed on the album NAME and only for Spotify (it keyed off
// currentSpotifyTrack, so it did nothing at all for a YouTube/SoundCloud track
// or one played from the crate queue).

// Which release/track is the player actually on? Prefers the crate queue's own
// current entry (exact release, name and track number, for every engine), then
// nowPlayingItem (set by single-track/album plays), then — for a Spotify track
// played from outside the crate — a lookup of it in the crate by artist+album.
// item is null when it isn't in the crate; trackName comes from what the player
// is showing, so it's right for any engine.
function resolveNowPlayingForMenu() {
  let item = null, trackName = '', trackNum = '';
  const entry = isPlayingCrateQueue() ? crateQueueList[crateQueueIndex] : null;
  if (entry && entry.item) {
    item = entry.item;
    trackName = (entry.track && entry.track.trackName) || '';
    trackNum = (entry.track && entry.track.trackNumber != null) ? entry.track.trackNumber : '';
  } else {
    const spotifyTrack = activePlayerEngine === 'spotify' ? currentSpotifyTrack : null;
    item = nowPlayingItem || (spotifyTrack ? findCrateItemForTrack(spotifyTrack) : null);
    trackName = spotifyTrack ? spotifyTrack.name : (el.miniPlayerTitle.textContent || '').trim();
  }
  if (trackName === '\u2014') trackName = ''; // the player's own "nothing here yet" placeholder
  if (item && trackName && trackNum === '') trackNum = lookupTrackNum(item, trackName);
  return { item, trackName, trackNum };
}

// Track number for a track NAME within a release, from what's already loaded
// (the tracklist cache, or a manual album's own tracklist) — or '' if unknown.
function lookupTrackNum(item, trackName) {
  const key = normMatchKey(trackName);
  if (!key) return '';
  const cached = state.trackCache[artKey(item)];
  if (Array.isArray(cached)) {
    const t = cached.find(c => normMatchKey(c.trackName) === key);
    if (t && t.trackNumber != null) return t.trackNumber;
  }
  const m = (item.manualTracks || []).find(t => normMatchKey(t.title) === key);
  return m && m.trackNumber != null ? m.trackNumber : '';
}

function openPlayerTrackContextMenu(x, y) {
  const { item, trackName, trackNum } = resolveNowPlayingForMenu();
  const spotifyTrack = activePlayerEngine === 'spotify' ? currentSpotifyTrack : null;
  if (!trackName && !item) return false;   // nothing to act on — let the browser's own menu through
  openTrackActionsMenu({ item, trackName, trackNum, spotifyTrack, x, y, queueEntry: null });
  return true;
}

// Right-click on a row of the Up Next panel (the crate queue). The queue-specific actions come first —
// Play now / Play next / Remove from queue, only for tracks that are still UPCOMING — then the same
// playlist / artist / album / credits actions every other track menu has. The folded-in "something
// is already playing" placeholder (item === null) isn't a crate track, so it gets the player's menu.
function openQueueTrackContextMenu(entry, x, y) {
  if (!entry) return false;
  if (!entry.item) return openPlayerTrackContextMenu(x, y);
  openTrackActionsMenu({
    item: entry.item, trackName: (entry.track && entry.track.trackName) || '',
    trackNum: entry.track && entry.track.trackNumber != null ? entry.track.trackNumber : '',
    spotifyTrack: null, x, y, queueEntry: entry
  });
  return true;
}

// The menu itself, shared by the player's right-click and the queue's. queueEntry is the crate-queue entry
// the menu was opened on (null for the player). It is remembered as the ENTRY, not as a position: the queue
// can advance or be edited while the menu is open, and a position would then point at the wrong track.
function openTrackActionsMenu({ item, trackName, trackNum, spotifyTrack, x, y, queueEntry }) {
  closeNowPlayingAddMenu();
  const qIdx = queueEntry ? crateQueueList.indexOf(queueEntry) : -1;
  const upcoming = qIdx > crateQueueIndex;            // false for the playing track, or one that has already played

  // Same shape every other track menu feeds the playlist/queue code.
  const trackPlaylistItems = item
    ? [{ itemType: 'track', row: item.row, albumId: item.albumId || '', trackNum: trackNum === '' ? '' : trackNum, trackName }]
    : [];
  // Artist can be known even when the release isn't in the crate (a Spotify
  // track by an artist you do own other releases of).
  const artistGuess = item ? item.artist : ((spotifyTrack && spotifyTrack.artists && spotifyTrack.artists[0] && spotifyTrack.artists[0].name) || '');
  const crateArtist = artistGuess ? (state.raw.find(r => normMatchKey(r.artist) === normMatchKey(artistGuess)) || {}).artist : '';
  const needsCrate = 'title="Not in your crate" disabled';

  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu';
  menu.innerHTML = `
    <div class="menu-section-title">${escapeHtml(trackName || (item && item.title) || 'Now playing')}</div>
    ${!item && spotifyTrack ? '<button type="button" data-player-action="addToCrate">Add album to your crate\u2026</button><div class="menu-divider"></div>' : ''}
    ${queueEntry && upcoming ? `
    <button type="button" data-player-action="queuePlayNow">Play now</button>
    <button type="button" data-player-action="queuePlayNext" ${qIdx === crateQueueIndex + 1 ? 'disabled title="Already next"' : ''}>Play next</button>
    <button type="button" data-player-action="queueRemove">Remove from queue</button>
    <div class="menu-divider"></div>` : ''}
    <button type="button" class="menu-parent-btn" data-player-action="playlist" ${item ? '' : needsCrate}>Add to playlist <span class="submenu-caret">\u25b8</span></button>
    ${queueEntry ? '' : `<button type="button" data-player-action="queue" ${item ? '' : needsCrate}>Add to queue</button>`}
    <div class="menu-divider"></div>
    <button type="button" data-player-action="artist" ${crateArtist ? '' : needsCrate}>Go to artist</button>
    <button type="button" data-player-action="album" ${item ? '' : needsCrate}>Go to album</button>
    <button type="button" data-player-action="credits" ${item ? '' : needsCrate}>View credits</button>
    <div class="menu-divider"></div>
    <button type="button" data-player-action="rym" ${item || spotifyTrack ? '' : needsCrate}>Look up on RateYourMusic \u2197</button>
    ${queueEntry && qIdx !== crateQueueIndex ? '' : `<button type="button" data-player-action="copyLink" ${nowPlayingLink() ? '' : 'disabled title="Nothing is playing"'}>Copy link to what\u2019s playing</button>`}
    ${queueEntry ? '' : '<div class="menu-divider"></div><button type="button" data-player-action="fields">Choose what the player shows\u2026</button>'}
  `;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);

  if (item) {
    const playlistBtn = menu.querySelector('[data-player-action="playlist"]');
    playlistBtn.addEventListener('mouseenter', () => openAddToPlaylistSubmenu(playlistBtn, trackPlaylistItems));
    playlistBtn.addEventListener('mouseleave', scheduleCloseAddToPlaylistSubmenu);
    // Track number not known yet (a tracklist that hasn't been fetched) —
    // fetch it in the background; it fills in on the SAME object the
    // playlist submenu will hand to the server, so "Add to playlist" still
    // carries it if the tracklist arrives before the click.
    if (trackNum === '' && trackName) {
      getTracksFor(item).then(() => { const n = lookupTrackNum(item, trackName); if (n !== '') trackPlaylistItems[0].trackNum = n; }).catch(() => {});
    }
  }

  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-player-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.playerAction;
    if (action === 'playlist') { openAddToPlaylistSubmenu(btn, trackPlaylistItems); return; } // tap-to-open for touch
    closeNowPlayingAddMenu();

    if (action === 'queue') queueTracksNow(trackPlaylistItems);
    else if (action === 'queuePlayNow') { const i = crateQueueList.indexOf(queueEntry); if (i > crateQueueIndex) playCrateQueueIndex(crateQueueId, i); }
    else if (action === 'queuePlayNext') crateQueuePlayNext(queueEntry);
    else if (action === 'queueRemove') crateQueueRemove(queueEntry);
    else if (action === 'artist') openArtistInfoTab(crateArtist);
    else if (action === 'album') { switchTab('albums'); openDeck(item); }
    else if (action === 'rym') { if (item) openAlbumOnRym(item); else { const a = spotifyTrack.artists && spotifyTrack.artists[0] ? spotifyTrack.artists[0].name : '', t = (spotifyTrack.album && spotifyTrack.album.name) || ''; window.open(rymSearchUrl({ artist: a, title: t }), '_blank', 'noopener,noreferrer'); } }          // (a track that isn't in your crate: RYM's search for its album)
    else if (action === 'copyLink') copyNowPlayingLink();
    else if (action === 'addToCrate') openNowPlayingAddMenu(spotifyTrack, x, y);
    else if (action === 'fields') { renderConfigSlots('miniPlayer'); el.mainConfigModal.hidden = false; }   // the same settings as Panels configuration → Now Playing Bar → Panel Settings…
    else if (action === 'credits') {
      let tn = trackNum;
      if (tn === '') {            // resolve from the full tracklist if it wasn't loaded yet
        try { await getTracksFor(item); } catch (err) { /* fall through with what we have */ }
        tn = lookupTrackNum(item, trackName);
      }
      openTrackCreditsPopover(item, tn, trackName, x, y);
    }
  });

  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}

// Credits for one track (the "Name \u2014 Role" lines saved under Edit track
// properties\u2026 \u2192 Credits), shown in a small popover rather than only inside
// the album page's tracklist, which is the only other place they appear.
function openTrackCreditsPopover(item, trackNum, trackName, x, y) {
  closeNowPlayingAddMenu();
  const known = trackNum !== '' && trackNum != null;
  const credits = known ? parseTrackCredits((item.trackData && item.trackData[trackNum] && item.trackData[trackNum].credits) || '') : [];

  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu track-credits-popover';
  menu.innerHTML = `
    <div class="menu-section-title">Credits \u2014 ${escapeHtml(trackName || item.title)}</div>
    ${credits.length
      ? `<div class="track-credits-list">${credits.map(c => `<p class="track-credit-entry"><span class="track-credit-name">${escapeHtml(c.name)}</span>${c.role ? `<span class="track-credit-role">${escapeHtml(c.role)}</span>` : ''}</p>`).join('')}</div>`
      : `<p class="menu-hint">${known ? 'No credits saved for this track yet.' : 'Couldn\u2019t match this track to one in the album\u2019s tracklist, so there are no credits to show.'}</p>`}
    ${known ? `<div class="menu-divider"></div><button type="button" data-credits-action="edit">${credits.length ? 'Edit credits\u2026' : 'Add credits\u2026'}</button>` : ''}
  `;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);
  menu.addEventListener('click', (e) => {
    if (!e.target.closest('[data-credits-action="edit"]')) return;
    closeNowPlayingAddMenu();
    openTrackPropertiesModal(item, trackNum, trackName);
  });
  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}
function closeNowPlayingAddMenuOnOutsideClick(e) {
  if (nowPlayingAddMenuEl && !nowPlayingAddMenuEl.contains(e.target)) closeNowPlayingAddMenu();
}
function closeNowPlayingAddMenu() {
  document.querySelectorAll('.queue-context-target').forEach(r => r.classList.remove('queue-context-target'));
  if (nowPlayingAddMenuEl) { nowPlayingAddMenuEl.remove(); nowPlayingAddMenuEl = null; }
  document.removeEventListener('click', closeNowPlayingAddMenuOnOutsideClick);
  closeAlbumSearchSubmenu();
  closeAddToPlaylistSubmenu();
  if (typeof closePlaylistMoveSubmenu === 'function') closePlaylistMoveSubmenu();
}

// Right-click menu on an individual track row — in the flat Tracks table,
// the per-album "Album and Tracks" view, and the album deck's own
// tracklist. Keeps it simple (view the album, or jump to the artist) since
// a single track doesn't carry its own crate row the way an album card
// does. "Search" reuses the same flyout as the album card menu.
// selectedItems, when passed with more than one entry (flat table / "Album
// and Tracks" view only — both have real click multi-select), makes "Add
// to playlist" act on the whole selection instead of just the row that was
// right-clicked.
function openTrackContextMenu(item, trackName, x, y, trackNum, selectedItems) {
  closeNowPlayingAddMenu();

  const isMultiSelect = selectedItems && selectedItems.length > 1;
  const trackPlaylistItems = isMultiSelect
    ? selectedItems
    : [{ itemType: 'track', row: item.row, albumId: item.albumId || '', trackNum: trackNum || '', trackName: trackName || '' }];
  const menuTitle = isMultiSelect ? `${trackPlaylistItems.length} tracks selected` : (trackName || item.title);

  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu';
  // "Confirm"/"Try next match" only make sense for a single, non-manual
  // track — a manual album's tracks skip the automatic Spotify search
  // entirely (see isManualAlbum/playTrackNow) and use their own saved
  // YouTube/Spotify link instead, so there's no fuzzy match here to fix.
  const showMatchTools = !isMultiSelect && !isManualAlbum(item);
  const trackRymLink = !isMultiSelect && item.trackData && item.trackData[trackNum] && item.trackData[trackNum].rymLink;
  const trackSoundcloudLink = !isMultiSelect && item.trackData && item.trackData[trackNum] && item.trackData[trackNum].soundcloudLink;
  menu.innerHTML = `
    <div class="menu-section-title">${escapeHtml(menuTitle)}</div>
    <button type="button" data-track-menu-action="play">▶ Play</button>
    <button type="button" data-track-menu-action="queue">Add to queue</button>
    <button type="button" class="menu-parent-btn" data-track-menu-action="playlist">Add to playlist <span class="submenu-caret">▸</span></button>
    <button type="button" data-track-menu-action="entry">Add to entry</button>
    <div class="menu-divider"></div>
    ${!isMultiSelect ? '<button type="button" data-track-menu-action="editProps">Edit track properties\u2026</button>' : ''}
    ${showMatchTools ? '<button type="button" data-track-menu-action="confirmMatch">\u2713 Confirm Spotify match</button>' : ''}
    ${showMatchTools ? '<button type="button" data-track-menu-action="nextMatch">\u21bb Try next Spotify match</button>' : ''}
    ${trackRymLink ? '<button type="button" data-track-menu-action="rym">View on RateYourMusic \u2197</button>' : ''}
    ${trackSoundcloudLink ? '<button type="button" data-track-menu-action="soundcloud">Open on SoundCloud \u2197</button>' : ''}
    <button type="button" class="remove-menu-btn" data-track-menu-action="removeTrack">Remove from tracklist</button>
    <button type="button" data-track-menu-action="view">View album</button>
    <button type="button" class="menu-parent-btn" data-track-menu-action="search">Search <span class="submenu-caret">▸</span></button>
    ${state.activePlaylistId ? '<div class="menu-divider"></div><button type="button" class="remove-menu-btn" data-track-menu-action="removeFromPlaylist">Remove from playlist</button>' : ''}
  `;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);

  const playlistBtn = menu.querySelector('[data-track-menu-action="playlist"]');
  playlistBtn.addEventListener('mouseenter', () => openAddToPlaylistSubmenu(playlistBtn, trackPlaylistItems));
  playlistBtn.addEventListener('mouseleave', scheduleCloseAddToPlaylistSubmenu);

  const searchBtn = menu.querySelector('[data-track-menu-action="search"]');
  searchBtn.addEventListener('mouseenter', () => openAlbumSearchSubmenu(searchBtn, item, isMultiSelect ? '' : trackName));
  searchBtn.addEventListener('mouseleave', scheduleCloseAlbumSearchSubmenu);

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-track-menu-action]');
    if (!btn) return;
    const action = btn.dataset.trackMenuAction;

    if (action === 'search') { openAlbumSearchSubmenu(btn, item, isMultiSelect ? '' : trackName); return; } // tap-to-open for touch
    if (action === 'playlist') { openAddToPlaylistSubmenu(btn, trackPlaylistItems); return; } // tap-to-open for touch

    closeNowPlayingAddMenu();
    if (action === 'view') openDeck(item);
    else if (action === 'play') { if (isMultiSelect) playTracksNow(trackPlaylistItems); else playTrackNow(item, trackName, trackNum); }
    else if (action === 'queue') queueTracksNow(trackPlaylistItems);
    else if (action === 'entry') addTracksToEntry(trackPlaylistItems);
    else if (action === 'editProps') openTrackPropertiesModal(item, trackNum, trackName);
    else if (action === 'confirmMatch') confirmSpotifyMatch(item, trackName, trackNum);
    else if (action === 'nextMatch') tryNextSpotifyMatch(item, trackName, trackNum);
    else if (action === 'rym') window.open(trackRymLink, '_blank', 'noopener,noreferrer');
    else if (action === 'soundcloud') window.open(trackSoundcloudLink, '_blank', 'noopener,noreferrer');
    else if (action === 'removeTrack') { if (isMultiSelect) quickRemoveTracksFromTracklist(trackPlaylistItems); else quickRemoveTrackFromTracklist(item, trackNum, trackName); }
    else if (action === 'removeFromPlaylist') removeTracksFromActivePlaylist(trackPlaylistItems);
  });

  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}

// ▶ Play from a track's context menu — same lookup+playback the deck's own
// per-track play button uses (spotifyTrackId + showMiniPlayer), just
// factored out so it can be called from the menu regardless of which view
// (deck/flat table/"Album and Tracks") it was opened from. trackNum is
// optional (older call sites that only ever had a manual album's title to
// match on still work via trackLinkOverridesFor's title fallback) but
// should be passed whenever available — it's required to look up a saved
// link on a non-manual album's track, which has no other unique key.
async function playTrackNow(item, trackName, trackNum) {
  if (!trackName) return;
  nowPlayingItem = item;

  // Playing a single track directly (this function) is a distinct action
  // from queuing one — it should replace whatever's lined up, the same way
  // playAlbumReplacingQueue already does for a whole release, rather than
  // leaving an old queue sitting there to confusingly resume once this
  // track ends. Safe to do unconditionally here: playCrateQueueIndex (the
  // actual queue-advance path) has its own fully separate playback logic
  // and never calls this function, so this can't clear the very queue
  // it's supposed to be playing from.
  crateQueueId++;
  crateQueueList = [];
  crateQueueIndex = -1;
  renderCrateQueuePanel();

  // A saved link override (see "Edit track properties…") always wins over
  // the per-album-type default below — Spotify first since that's the
  // app's primary/continuous player, then YouTube.
  const links = trackLinkOverridesFor(item, trackNum, trackName);
  nowPlayingYoutubeLink = links.youtubeLink || '';
  const overrideUri = trackSpotifyUriFromLink(links.spotifyLink);
  if (overrideUri) {
    await showMiniPlayer(overrideUri, beginPlayIntent());
    return;
  }
  if (links.youtubeLink) {
    openYoutubePlayer(links.youtubeLink, trackName, state.trackCache[artKey(item)], item);
    return;
  }
  if (links.soundcloudLink) {
    openSoundcloudPlayer(links.soundcloudLink, trackName, state.trackCache[artKey(item)], item);
    return;
  }

  // Manually-added albums skip the automatic Spotify search — see
  // isManualAlbum() — rather than confidently landing on whatever unrelated
  // track Spotify's fuzzy search turns up.
  if (isManualAlbum(item)) {
    flashGlobalToast('No link saved for this track — add one from Edit track properties.');
    return;
  }

  const intent = beginPlayIntent();
  flashGlobalToast(`Looking up "${trackName}" on Spotify…`);
  try {
    const trackId = await spotifyTrackId(item.artist, trackName, songContextFor(item, trackNum, trackName));
    if (!isPlayIntentCurrent(intent)) return; // a newer play action started while this was looking up
    if (trackId) {
      showMiniPlayer(`spotify:track:${trackId}`, intent);
    } else {
      flashGlobalToast('Couldn\u2019t find that track on Spotify' + (loadSpotifyCreds().clientId ? '' : ' — set up the Spotify API in \u2699 first'));
    }
  } catch (err) {
    flashGlobalToast('Couldn\u2019t find that track on Spotify');
  }
}

// Shared by queueTracksNow and playTracksNow — builds an { item, track }
// crate-queue entry per selected track, looking its owning album up in
// state.raw by row (a multi-selection in the flat table/"Album and Tracks"
// view can span more than one album), the same shape playPlaylistFromStart
// builds for a standalone playlist track. Manual albums aren't skipped here
// — addToCrateQueue/playCrateQueueIndex resolve each entry (Spotify search
// or saved YouTube link) only once playback actually reaches it.
function buildCrateQueueEntriesForTracks(trackPlaylistItems) {
  const entries = [];
  for (const t of trackPlaylistItems || []) {
    if (!t.trackName) continue;
    const owner = (activeItem && activeItem.row === t.row) ? activeItem : state.raw.find(r => r.row === t.row);
    if (!owner) continue;
    entries.push({ item: owner, track: { trackNumber: t.trackNum, trackName: t.trackName, ...trackLinkOverridesFor(owner, t.trackNum, t.trackName) } });
  }
  return entries;
}

// "Add to queue" from a track's context menu — cross-platform, see
// addToCrateQueue.
function queueTracksNow(trackPlaylistItems) {
  if (!trackPlaylistItems || !trackPlaylistItems.length) return;
  addToCrateQueue(buildCrateQueueEntriesForTracks(trackPlaylistItems));
}

// "▶ Play" from a track's context menu when more than one track is
// selected — starts a fresh crate queue from the whole selection, in
// selection order, replacing anything currently playing/queued. Without
// this, choosing "▶ Play" over a multi-selection only ever played the row
// that was actually right-clicked (playTrackNow(item, trackName) below)
// and nothing else in the selection would follow it: there was no queue
// backing it at all, so the single track just played and then stopped.
function playTracksNow(trackPlaylistItems) {
  const entries = buildCrateQueueEntriesForTracks(trackPlaylistItems);
  if (!entries.length) return;
  const myId = ++crateQueueId;
  crateQueueList = entries;
  crateQueueIndex = -1;
  ytPlayingForCrateQueue = false; // fresh run — any prior YouTube handoff no longer applies
  playCrateQueueIndex(myId, 0);
}

// "Add to entry" from a track's context menu — flags the given track(s)
// listened for their owning album, the same flag the per-track checkmark/
// "Select all" already use (see toggleTrackListened/selectAllTracks), so
// they're picked out as soon as the log form below opens. Groups by album
// row so each album's trackData is only saved once even if several of its
// tracks were selected together. For a single-album selection this also
// opens (or refreshes) the actual "+ Log a listen" form afterward — see
// the block at the end — since flagging tracks with no visible way to
// finish logging them would otherwise be a dead end now that the desktop
// checkmark UI (the toggle's other entry point into that same form) is
// hidden (see .track-listen-toggle, 1.29.43). Left alone for a selection
// spanning more than one album — there's no single form to open there.
async function addTracksToEntry(trackPlaylistItems) {
  if (!trackPlaylistItems || !trackPlaylistItems.length) return;
  const byRow = new Map();
  for (const t of trackPlaylistItems) {
    if (!t.trackNum && t.trackNum !== 0) continue; // no track number to key off — skip
    if (!byRow.has(t.row)) byRow.set(t.row, []);
    byRow.get(t.row).push(t.trackNum);
  }
  if (!byRow.size) return;

  let total = 0;
  for (const [row, trackNums] of byRow) {
    const owner = (activeItem && activeItem.row === row) ? activeItem : state.raw.find(r => r.row === row);
    if (!owner) continue;
    if (!owner.trackData) owner.trackData = {};
    for (const tNum of trackNums) {
      if (!owner.trackData[tNum]) owner.trackData[tNum] = {};
      owner.trackData[tNum].listened = true;
      total++;
    }
    if (activeItem === owner) renderTracklistBody(owner, currentTracklistTracks);
    try {
      await postUpdate({ row: owner.row, trackData: JSON.stringify(owner.trackData) });
    } catch (err) {
      flashGlobalToast('Couldn\u2019t save \u2014 try again');
    }
  }
  flashGlobalToast(`Added ${total} track${total === 1 ? '' : 's'} to entry`);
  if (activeItem && !el.logForm.hidden) { renderLogTrackSummary(); return; }

  // Single album, form not already open: open (or switch) the deck to it
  // and pop the log form open, same as pressing "+ Log a listen" directly
  // — openDeck() resets/hides the log form itself first, so the click
  // below always opens it fresh rather than risking its own toggle-closed
  // branch. Skipped for a multi-album selection, and skipped if the form
  // was already open for this exact album (handled by the branch above).
  if (byRow.size === 1) {
    const onlyRow = byRow.keys().next().value;
    const owner = (activeItem && activeItem.row === onlyRow) ? activeItem : state.raw.find(r => r.row === onlyRow);
    if (owner) {
      if (activeItem !== owner) openDeck(owner);
      el.logListenBtn.click();
    }
  }
}

// "Edit track properties…" — a real modal window (single-track only, see
// openTrackContextMenu), using the same .arrange-overlay/.arrange-modal
// pattern as the app's other modals (Add album, Edit details, etc.) instead
// of a small floating popup. For per-track fields that don't belong on the
// album-level Edit modal — currently just Genre, saved into the same
// trackData JSON blob rating/note/listened already live in via
// updateTrackData(), so it needs no backend change. Reachable from every
// place a track can be right-clicked — the flat Tracks table (library and
// playlist), the per-album "Album and Tracks" view (library and playlist),
// and the album deck's own tracklist — since they all funnel through
// openTrackContextMenu()'s "Edit track properties…" action.
let trackPropsOverlayEl = null;
function openTrackPropertiesModal(item, trackNum, trackName) {
  closeTrackPropertiesModal();
  refreshGenreAutocompleteList();

  const tData = (item.trackData && item.trackData[trackNum]) || {};
  // YouTube prefills from the same resolved value the tracklist itself
  // plays (trackData override, falling back to a manual album's own
  // manualTracks entry — see trackLinkOverridesFor) so editing a manual
  // album's track here shows its existing link instead of a blank field.
  // Spotify has no such fallback to prefill from, so it comes straight
  // from trackData.
  const links = trackLinkOverridesFor(item, trackNum, trackName);
  // The currently-known length for this track, so the field starts
  // prefilled with what's already showing rather than blank when there's
  // no override yet — pulled from whichever tracklist is actually loaded
  // right now (the deck's currentTracklistTracks if this album's is open,
  // else whatever's cached from a prior getTracksFor() call).
  const knownTracks = (activeItem === item && currentTracklistTracks.length) ? currentTracklistTracks : (state.trackCache[artKey(item)] || []);
  const knownTrack = knownTracks.find(t => (t.trackNumber || 0) === trackNum);
  const currentLengthMs = (knownTrack && knownTrack.trackTimeMillis) || 0;

  const overlay = document.createElement('div');
  overlay.className = 'arrange-overlay track-props-overlay';
  overlay.innerHTML = `
    <div class="arrange-modal track-props-modal">
      <div class="arrange-header">
        <h2>${escapeHtml(trackName || 'Track properties')}</h2>
        <button type="button" class="modal-x" data-track-props-action="cancel" aria-label="Close">✕</button>
      </div>
      <div class="arrange-body">
        <div class="track-props-field">
          <label for="trackPropsName">Track title</label>
          <input type="text" id="trackPropsName" placeholder="Track title" value="${escapeHtml(trackName || '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsArtist">Artist</label>
          <input type="text" id="trackPropsArtist" placeholder="${escapeHtml(item.artist || '')}" value="${escapeHtml(links.artist || '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsAlbumArtist">Album artist</label>
          <input type="text" id="trackPropsAlbumArtist" placeholder="${escapeHtml(item.artist || '')}" value="${escapeHtml(links.albumArtist || '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsAlbum">Album</label>
          <input type="text" id="trackPropsAlbum" placeholder="${escapeHtml(item.title || '')}" value="${escapeHtml(links.album || '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsDate">Date</label>
          <input type="text" id="trackPropsDate" placeholder="YYYY, YYYY-MM, or YYYY-MM-DD" value="${escapeHtml(links.date || '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsGenre">Genre</label>
          <input type="text" id="trackPropsGenre" list="genreAutocompleteList" placeholder="e.g. Dream Pop" value="${escapeHtml(tData.genre || '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsCredits">Credits (one per line: Name \u2014 Role(s))</label>
          <textarea id="trackPropsCredits" rows="4" placeholder="John Lennon \u2014 lead vocals, songwriter&#10;Paul McCartney \u2014 bass, backing vocals">${escapeHtml(tData.credits || '')}</textarea>
        </div>
        <div class="track-props-field">
          <label for="trackPropsLength">Track length</label>
          <input type="text" id="trackPropsLength" placeholder="m:ss" value="${links.lengthMs ? formatMs(links.lengthMs) : (currentLengthMs ? formatMs(currentLengthMs) : '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsYoutube">YouTube link <a href="#" class="track-props-search" data-track-search="yt">Search \u2197</a></label>
          <input type="text" id="trackPropsYoutube" placeholder="https://youtube.com/watch?v=..." value="${escapeHtml(links.youtubeLink || '')}">
          <button type="button" class="chip-btn" data-track-props-action="fullvideo" style="margin-top:6px" title="This video is the whole release: say where each song starts and ends in it">Start and end in a full-release video…</button>
        </div>
        <div class="track-props-field">
          <label for="trackPropsSpotify">Spotify link <a href="#" class="track-props-search" data-track-search="sp">Search \u2197</a></label>
          <input type="text" id="trackPropsSpotify" placeholder="https://open.spotify.com/track/..." value="${escapeHtml(links.spotifyLink || '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsRym">RateYourMusic link</label>
          <input type="text" id="trackPropsRym" placeholder="https://rateyourmusic.com/release/..." value="${escapeHtml(links.rymLink || '')}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsRymRating">RYM rating of this track (0.01 to 5)</label>
          <input type="text" inputmode="decimal" id="trackPropsRymRating" placeholder="e.g. 3.9" value="${links.rymRating ? escapeHtml(String(links.rymRating)) : ''}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsRymVotes">How many ratings that is based on</label>
          <input type="text" inputmode="numeric" id="trackPropsRymVotes" placeholder="e.g. 683" value="${links.rymVotes ? escapeHtml(String(links.rymVotes)) : ''}">
        </div>
        <div class="track-props-field">
          <label for="trackPropsSoundcloud">SoundCloud link</label>
          <input type="text" id="trackPropsSoundcloud" placeholder="https://soundcloud.com/..." value="${escapeHtml(links.soundcloudLink || '')}">
        </div>
        ${!isManualAlbum(item) ? `
        <div class="track-props-field track-props-match-field">
          <label>Fix a wrong Spotify match</label>
          <div class="track-props-match-search-row">
            <input type="text" id="trackPropsMatchQuery" placeholder="Search title" value="${escapeHtml(trackName || '')}">
            <button type="button" id="trackPropsMatchSearchBtn" class="chip-btn">Search</button>
          </div>
          <p id="trackPropsMatchStatus" class="tracklist-builder-hint">Looking up matches on Spotify\u2026</p>
          <div id="trackPropsMatchList" class="track-props-match-list"></div>
          <p class="tracklist-builder-hint">Preview a result with \u25b6, then \u201cUse this\u201d to fill the Spotify link above \u2014 still needs Save below to stick.</p>
        </div>
        <div class="track-props-field track-props-match-field">
          <label>Find a YouTube match</label>
          <div class="track-props-match-search-row">
            <input type="text" id="trackPropsYtMatchQuery" placeholder="Search title" value="${escapeHtml(trackName || '')}">
            <button type="button" id="trackPropsYtMatchSearchBtn" class="chip-btn">Search</button>
          </div>
          <p id="trackPropsYtMatchStatus" class="tracklist-builder-hint" hidden></p>
          <div id="trackPropsYtMatchList" class="track-props-match-list"></div>
          <p class="tracklist-builder-hint">Needs a free YouTube API key (\u2699 \u2192 YouTube API\u2026) \u2014 doesn't search automatically like Spotify does, since the free quota is much smaller.</p>
        </div>` : ''}
        <div class="track-props-actions">
          <button type="button" class="chip-btn" data-track-props-action="cancel">Cancel</button>
          <button type="button" class="save-btn" data-track-props-action="save">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector('#trackPropsName');
  const artistInput = overlay.querySelector('#trackPropsArtist');
  const albumArtistInput = overlay.querySelector('#trackPropsAlbumArtist');
  const lengthInput = overlay.querySelector('#trackPropsLength');
  const albumInput = overlay.querySelector('#trackPropsAlbum');
  const dateInput = overlay.querySelector('#trackPropsDate');
  const genreInput = overlay.querySelector('#trackPropsGenre');
  const creditsInput = overlay.querySelector('#trackPropsCredits');
  const youtubeInput = overlay.querySelector('#trackPropsYoutube');
  const spotifyInput = overlay.querySelector('#trackPropsSpotify');
  const rymInput = overlay.querySelector('#trackPropsRym');
  overlay.addEventListener('click', (e) => {                                            // "Search" beside a link field: a web search for the title as it is typed now, to find the track and paste its address
    const a = e.target.closest('[data-track-search]'); if (!a) return; e.preventDefault();
    const typed = (overlay.querySelector('#trackPropsName') || {}).value;
    openWebSearch(a.dataset.trackSearch, item, (typed || trackName || '').trim());
  });
  const soundcloudInput = overlay.querySelector('#trackPropsSoundcloud');
  nameInput.focus();
  nameInput.select();

  // ---- Spotify match troubleshoot list (skipped entirely for manual
  // albums — see isManualAlbum/playTrackNow, they never use the automatic
  // search so there's nothing here to fix). Loads the cached top-10
  // candidates automatically on open (cheap — cached per artist::track),
  // and lets the person re-search with different wording, preview any
  // candidate before committing, and pick one into the Spotify link field
  // above. Nothing is saved until the modal's own Save button is pressed,
  // same as every other field here. Both this and the YouTube section
  // below share renderMatchCandidateList/toMatchCandidates so the two
  // pickers behave identically apart from where they get results from.
  const matchListEl = overlay.querySelector('#trackPropsMatchList');
  const matchStatusEl = overlay.querySelector('#trackPropsMatchStatus');
  const matchQueryInput = overlay.querySelector('#trackPropsMatchQuery');
  const matchSearchBtn = overlay.querySelector('#trackPropsMatchSearchBtn');

  function currentSpotifyIdFromInput() {
    const uri = trackSpotifyUriFromLink(spotifyInput.value.trim());
    return uri && uri.startsWith('spotify:track:') ? uri.slice('spotify:track:'.length) : null;
  }
  async function loadMatches(query, live) {
    if (!matchListEl) return;
    matchStatusEl.hidden = false;
    matchStatusEl.textContent = 'Looking up matches on Spotify\u2026';
    matchListEl.innerHTML = '';
    const raw = live ? await spotifyTrackCandidatesLive(item.artist, query) : await spotifyTrackCandidates(item.artist, query);
    if (trackPropsOverlayEl !== overlay) return; // modal closed/replaced while this was in flight
    if (!raw.length) {
      matchStatusEl.textContent = 'No Spotify matches found for this search.';
      return;
    }
    matchStatusEl.hidden = true;
    renderMatchCandidateList(matchListEl, toMatchCandidates('spotify', raw), currentSpotifyIdFromInput(), 'spotify', spotifyInput);
  }
  if (matchSearchBtn) {
    matchSearchBtn.addEventListener('click', () => loadMatches(matchQueryInput.value.trim() || trackName, true));
    matchQueryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); loadMatches(matchQueryInput.value.trim() || trackName, true); }
    });
    if (trackName) loadMatches(trackName, false); // auto-load on open, using the cache — Spotify's search has generous limits (getSpotifyToken), unlike YouTube's below
    else { matchStatusEl.hidden = false; matchStatusEl.textContent = 'No track title to search with.'; }
  }

  // ---- YouTube match troubleshoot list — same idea, but NEVER auto-loads
  // (see youtubeSearchCandidates' comment on quota) and needs a YouTube
  // API key configured (\u2699 \u2192 YouTube API\u2026) or it just says so.
  const ytMatchListEl = overlay.querySelector('#trackPropsYtMatchList');
  const ytMatchStatusEl = overlay.querySelector('#trackPropsYtMatchStatus');
  const ytMatchQueryInput = overlay.querySelector('#trackPropsYtMatchQuery');
  const ytMatchSearchBtn = overlay.querySelector('#trackPropsYtMatchSearchBtn');

  function currentYoutubeIdFromInput() {
    const m = youtubeInput.value.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
  async function loadYtMatches(query) {
    if (!ytMatchListEl) return;
    if (!loadYoutubeApiKey()) {
      ytMatchStatusEl.hidden = false;
      ytMatchStatusEl.textContent = 'No YouTube API key configured — add one in \u2699 \u2192 YouTube API\u2026 first.';
      ytMatchListEl.innerHTML = '';
      return;
    }
    ytMatchStatusEl.hidden = false;
    ytMatchStatusEl.textContent = 'Looking up matches on YouTube\u2026';
    ytMatchListEl.innerHTML = '';
    const raw = await youtubeSearchCandidates(item.artist, query);
    if (trackPropsOverlayEl !== overlay) return;
    if (!raw.length) {
      ytMatchStatusEl.textContent = 'No YouTube matches found for this search.';
      return;
    }
    ytMatchStatusEl.hidden = true;
    renderMatchCandidateList(ytMatchListEl, toMatchCandidates('youtube', raw), currentYoutubeIdFromInput(), 'youtube', youtubeInput);
  }
  if (ytMatchSearchBtn) {
    ytMatchSearchBtn.addEventListener('click', () => loadYtMatches(ytMatchQueryInput.value.trim() || trackName));
    ytMatchQueryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); loadYtMatches(ytMatchQueryInput.value.trim() || trackName); }
    });
  }

  const doSave = async () => {
    // name/artist/albumArtist/album are only written when they actually
    // differ from the track's/release's real values — typing into the
    // field and leaving it unchanged (or blanking it back out) shouldn't
    // create a permanent override that then has to be noticed and cleared
    // later.
    const typedName = nameInput.value.trim();
    const typedArtist = artistInput.value.trim();
    const typedAlbumArtist = albumArtistInput.value.trim();
    const typedAlbum = albumInput.value.trim();
    const realArtist = (item.artist || '').trim();
    await updateTrackData(item, trackNum, {
      name: (typedName && typedName !== (trackName || '').trim()) ? typedName : '',
      artist: (typedArtist && typedArtist !== realArtist) ? typedArtist : '',
      albumArtist: (typedAlbumArtist && typedAlbumArtist !== realArtist) ? typedAlbumArtist : '',
      lengthMs: parseLengthToMs(lengthInput.value),
      album: (typedAlbum && typedAlbum !== (item.title || '').trim()) ? typedAlbum : '',
      date: dateInput.value.trim(),
      genre: genreInput.value.trim(),
      credits: creditsInput.value.trim(),
      youtubeLink: youtubeInput.value.trim(),
      spotifyLink: spotifyInput.value.trim(),
      rymLink: rymInput.value.trim(),
      rymRating: rymNum(overlay.querySelector('#trackPropsRymRating').value),
      rymVotes: rymNum(overlay.querySelector('#trackPropsRymRating').value) ? rymVotesNum(overlay.querySelector('#trackPropsRymVotes').value) : 0,
      // still "from Rate Your Music" only if left as it was; a rating typed here is yours, and an update never replaces it (tlApplyTrackRatings)
      rymFrom: (() => { const td = item.trackData && item.trackData[trackNum], typed = rymNum(overlay.querySelector('#trackPropsRymRating').value); return td && td.rymFrom && typed && Math.abs(typed - (Number(td.rymRating) || 0)) < 0.005 ? td.rymFrom : ''; })(),
      soundcloudLink: soundcloudInput.value.trim()
    });
    // Refresh whichever cached tracklist(s) this track lives in so every
    // view (deck, "Album and Tracks", flat Tracks table) reflects the new
    // link immediately rather than waiting on the next getTracksFor() call.
    if (currentTracklistTracks.length) mergeTrackLinkOverrides(item, currentTracklistTracks);
    const cached = state.trackCache[artKey(item)];
    if (cached && cached !== currentTracklistTracks) mergeTrackLinkOverrides(item, cached);
    if (activeItem === item) renderTracklistBody(item, currentTracklistTracks);
    closeTrackPropertiesModal();
  };

  // Backdrop click closes it, same as the app's other overlay modals (see
  // the "Full-screen overlay backdrop clicks" wiring for Add/Edit/etc.).
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { closeTrackPropertiesModal(); return; }
    const btn = e.target.closest('button[data-track-props-action]');
    if (!btn) return;
    if (btn.dataset.trackPropsAction === 'save') doSave();
    else if (btn.dataset.trackPropsAction === 'fullvideo') { const hint = youtubeInput.value.trim(); closeTrackPropertiesModal(); fvOpen(item, hint); }
    else closeTrackPropertiesModal();
  });
  overlay.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSave(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeTrackPropertiesModal(); }
  }));

  trackPropsOverlayEl = overlay;
}
function closeTrackPropertiesModal() {
  if (trackPropsOverlayEl) { trackPropsOverlayEl.remove(); trackPropsOverlayEl = null; }
}

// Right-click menu on an album card in the grid/list/covers views (see
// buildCard). Unlike openAlbumContextMenu above — which has to search for a
// track's album first — this always has a real crate row to work with, so
// it can jump straight to acting on it.
function openAlbumCardContextMenu(item, x, y) {
  closeNowPlayingAddMenu();

  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu album-card-menu';
  const selItems = (state.selectedAlbums.size > 1 && state.selectedAlbums.has(String(item.row))) ? state.raw.filter(r => state.selectedAlbums.has(String(r.row))) : [item];
  menu.innerHTML = `
    <div class="menu-section-title">${escapeHtml(item.title)}</div>
    <button type="button" data-card-action="play">▶ Play now</button>
    <button type="button" data-card-action="queue">Add to queue</button>
    <button type="button" class="menu-parent-btn" data-card-action="playlist">Add to playlist <span class="submenu-caret">▸</span></button>
    <div class="menu-divider"></div>
    <button type="button" data-card-action="view">View album</button>
    <button type="button" data-card-action="artist">View artist discography</button>
    <button type="button" class="menu-parent-btn" data-card-action="search">Search <span class="submenu-caret">▸</span></button>
    <div class="menu-divider"></div>
    <button type="button" data-card-action="spotify">Open on Spotify ↗</button>
    <button type="button" data-card-action="rym">View on RateYourMusic ↗</button>
    ${nowPlayingItem === item && nowPlayingLink() ? '<button type="button" data-card-action="copyLink">Copy link to what\u2019s playing</button>' : ''}
    <button type="button" data-card-action="rymUpdate">${selItems.length > 1 ? `Update ${selItems.length} selected from Rate Your Music\u2026` : 'Update from Rate Your Music'}</button>
    ${selItems.length > 1 ? '' : '<button type="button" data-card-action="match">Match songs\u2026</button>'}
    ${selItems.length > 1 ? `<button type="button" data-card-action="matchMany">Match songs for ${selItems.length} selected\u2026</button>` : ''}
    <button type="button" data-card-action="matchQueue">${selItems.length > 1 ? `Add ${selItems.length} to the match queue` : 'Add to the match queue'}</button>
    <button type="button" data-card-action="fullVideo">Full-release video…</button>
    <button type="button" data-card-action="editTracks">Edit tracks…</button>
    ${selItems.length > 1 ? '' : '<button type="button" data-card-action="pullDetails">Pull details\u2026</button>'}
    ${state.activePlaylistId ? '<div class="menu-divider"></div><button type="button" class="remove-menu-btn" data-card-action="removeFromPlaylist">Remove from playlist</button>' : ''}
    <div class="menu-divider"></div>
    <button type="button" class="remove-menu-btn" data-card-action="delete">${selItems.length > 1 ? `Delete ${selItems.length} selected from crate` : 'Delete from crate'}</button>
  `;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);

  // "Search" opens a flyout (hover, or tap for touch) with two artist-level
  // actions — see openAlbumSearchSubmenu. It's a separate floating element
  // rather than a nested CSS submenu because this menu scrolls
  // (max-height/overflow-y from .now-playing-add-menu), which would clip an
  // absolutely-positioned child flyout. "Add to playlist" is the same
  // flyout pattern — see openAddToPlaylistSubmenu.
  const albumPlaylistItems = [{ itemType: 'album', row: item.row, albumId: item.albumId || '', trackNum: '', trackName: '' }];
  const playlistBtn = menu.querySelector('[data-card-action="playlist"]');
  playlistBtn.addEventListener('mouseenter', () => openAddToPlaylistSubmenu(playlistBtn, albumPlaylistItems));
  playlistBtn.addEventListener('mouseleave', scheduleCloseAddToPlaylistSubmenu);

  const searchBtn = menu.querySelector('[data-card-action="search"]');
  searchBtn.addEventListener('mouseenter', () => openAlbumSearchSubmenu(searchBtn, item));
  searchBtn.addEventListener('mouseleave', scheduleCloseAlbumSearchSubmenu);

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-card-action]');
    if (!btn) return;
    const action = btn.dataset.cardAction;

    if (action === 'search') { openAlbumSearchSubmenu(btn, item); return; } // tap-to-open for touch
    if (action === 'playlist') { openAddToPlaylistSubmenu(btn, albumPlaylistItems); return; } // tap-to-open for touch

    closeNowPlayingAddMenu();
    if (action === 'view') openDeck(item);
    else if (action === 'artist') filterByArtist(item.artist);
    else if (action === 'play') playAlbumNow(item);
    else if (action === 'queue') queueAlbumTracks(item);
    else if (action === 'spotify') openAlbumOnSpotify(item);
    else if (action === 'rym') openAlbumOnRym(item);
    else if (action === 'copyLink') copyNowPlayingLink();
    else if (action === 'rymUpdate') rymFetchUpdates(selItems);
    else if (action === 'match') openSongMatcher(item);
    else if (action === 'matchMany') bmOpen({ ticked: selItems, view: (state.filtered || []).slice() });
    else if (action === 'matchQueue') { const its = selItems.length > 1 ? selItems : [item], n = mqAdd(its, 'menu'); flashGlobalToast(n ? `Added ${n} to the match queue (Match songs \u2192 Start).` : 'Already in the match queue.'); }
    else if (action === 'fullVideo') fvOpen(item);
    else if (action === 'editTracks') tgOpen(item);
    else if (action === 'pullDetails') pdOpen(item);
    else if (action === 'removeFromPlaylist') removeAlbumFromActivePlaylist(item);
    else if (action === 'delete') deleteAlbumsFromContextMenu(selItems);
  });

  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}

// Flyout for the album card menu's "Search" item — "Find artist" jumps to
// that artist in the Artist tab (Albums/EPs discography, the normal view);
// "Open discography" jumps there too but in the fuller "show everything"
// mode (singles, compilations) so less-common releases can be added. A
// separate floating element (see openAlbumCardContextMenu) rather than a
// CSS-hover submenu, appended/positioned next to whichever button opened it.
let albumSearchSubmenuEl = null;
let albumSearchSubmenuCloseTimer = null;

// Web searches to find a track (or, with no track, the album) yourself. The text is the artist and the title, except that a split release's or compilation's "Artist - Song" titles already name the artist.
function webSearchQuery(item, trackName) {
  const t = String(trackName || '').trim(), a = String((item && item.artist) || '').trim();
  if (!t) return `${a} ${(item && item.title) || ''}`.trim();
  if (/ - /.test(t) && (item.type === 'Compilation' || /\//.test(a) || /^various\b/i.test(a))) return t;
  return `${a} ${t}`.trim();
}
function webSearchUrl(site, q) { return site === 'sp' ? `https://open.spotify.com/search/${encodeURIComponent(q)}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`; }
function openWebSearch(site, item, trackName) { window.open(webSearchUrl(site, webSearchQuery(item, trackName)), '_blank', 'noopener,noreferrer'); }
function openAlbumSearchSubmenu(anchorEl, item, trackName) {
  clearTimeout(albumSearchSubmenuCloseTimer);
  closeAlbumSearchSubmenu();

  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu album-search-submenu';
  menu.innerHTML = `
    <button type="button" data-search-action="find">Find artist "${escapeHtml(item.artist)}"</button>
    <button type="button" data-search-action="discog">Open discography</button>
    <div class="menu-divider"></div>
    <button type="button" data-search-action="yt">Search \u201c${escapeHtml(trackName || item.title)}\u201d on YouTube \u2197</button>
    <button type="button" data-search-action="sp">Search \u201c${escapeHtml(trackName || item.title)}\u201d on Spotify \u2197</button>
  `;
  document.body.appendChild(menu);

  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${rect.right + 2}px`;
  menu.style.top = `${rect.top}px`;
  requestAnimationFrame(() => {
    if (!albumSearchSubmenuEl) return; // closed again before this ran
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) menu.style.left = `${Math.max(4, rect.left - menuRect.width - 2)}px`;
    if (menuRect.bottom > window.innerHeight) menu.style.top = `${Math.max(4, window.innerHeight - menuRect.height - 4)}px`;
  });

  menu.addEventListener('mouseenter', () => clearTimeout(albumSearchSubmenuCloseTimer));
  menu.addEventListener('mouseleave', scheduleCloseAlbumSearchSubmenu);

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-search-action]');
    if (!btn) return;
    const action = btn.dataset.searchAction;
    closeNowPlayingAddMenu(); // also closes this submenu — see closeNowPlayingAddMenu
    if (action === 'find') openArtistInArtistView(item.artist, { showAll: false });
    else if (action === 'discog') openArtistInArtistView(item.artist, { showAll: true });
    else if (action === 'yt' || action === 'sp') openWebSearch(action, item, trackName);
  });

  albumSearchSubmenuEl = menu;
}
function scheduleCloseAlbumSearchSubmenu() {
  clearTimeout(albumSearchSubmenuCloseTimer);
  albumSearchSubmenuCloseTimer = setTimeout(closeAlbumSearchSubmenu, 220);
}
function closeAlbumSearchSubmenu() {
  if (albumSearchSubmenuEl) { albumSearchSubmenuEl.remove(); albumSearchSubmenuEl = null; }
  clearTimeout(albumSearchSubmenuCloseTimer);
}

// Jumps straight to an artist in the Artist tab's MusicBrainz discography
// view — used by the album card menu's Search flyout. Works even for
// artists you don't own anything by yet (unlike the left-panel list, which
// only lists artists already in your crate). `showAll` requests the fuller
// release list (singles + compilations, not just Albums/EPs) — see
// fetchArtistDiscography/fetchReleaseGroupsForMbid for the filtering.
function openArtistInArtistView(artistName, { showAll = false } = {}) {
  state.artistSelectedName = artistName;
  state.artistShowAllTypes = showAll;
  switchTab('artist');
}

// Resolves the exact Spotify album page (same lookup the cover-link "S"
// icon uses) and opens it, falling back to a plain search if no direct
// match has been found for this album.
async function openAlbumOnSpotify(item) {
  const links = await getExternalLinksFor(item);
  window.open(links.spotify || spotifySearchUrl(item), '_blank', 'noopener,noreferrer');
}

// Resolves the album's RateYourMusic page — a manually-entered RYM Link
// wins immediately (see getExternalLinksFor), otherwise this is the same
// Wikidata/MusicBrainz lookup the cover-link "R" icon uses — falling back
// to a plain RYM search if no direct match has been found for this album.
// The link to what is playing now, to share or keep: the Spotify track, the YouTube video (at the song's start, for a song that is part of a
// full-release video), or the SoundCloud track. '' when nothing is playing.
function nowPlayingLink() {
  if (activePlayerEngine === 'youtube') { const q = ytQueue[ytQueueIndex]; if (!q || !q.videoId) return ''; const s = Math.round(Number(q.start) || 0); return `https://www.youtube.com/watch?v=${q.videoId}${s > 0 ? '&t=' + s + 's' : ''}`; }
  if (activePlayerEngine === 'spotify') { const t = currentSpotifyTrack, id = t && (t.id || String(t.uri || '').split(':').pop()); return id ? `https://open.spotify.com/track/${id}` : ''; }
  if (activePlayerEngine === 'soundcloud') { const q = scQueue[scQueueIndex]; return (q && q.url) || ''; }
  return '';
}
async function copyNowPlayingLink() {
  const link = nowPlayingLink(); if (!link) { flashGlobalToast('Nothing is playing.'); return; }
  flashGlobalToast(await cxCopy(link) ? `Copied: ${link}` : `Couldn\u2019t copy. The link is ${link}`);
}
async function openAlbumOnRym(item) {
  const links = await getExternalLinksFor(item);
  window.open(links.rym || rymSearchUrl(item), '_blank', 'noopener,noreferrer');
}

// Same pattern as openAlbumOnSpotify/openAlbumOnRym, for the Quick Actions
// sheet's "Open on SoundCloud" row — the deck's own #deckSoundcloudLink
// resolves the same way but as a plain <a href>, updated in place by
// applyResolvedLinksToDeck once getExternalLinksFor() finishes.
async function openAlbumOnSoundcloud(item) {
  const links = await getExternalLinksFor(item);
  window.open(links.soundcloud || soundcloudSearchUrl(item), '_blank', 'noopener,noreferrer');
}

// Resolves the album's Spotify URI and starts it playing on CRATE's own
// Spotify Connect device — same mechanism as the deck's "▶ Play" button and
// per-track play buttons, just entered from the right-click menu instead.
async function playAlbumNow(item) {
  nowPlayingItem = item;
  const intent = beginPlayIntent();
  flashGlobalToast(`Looking up "${item.title}" on Spotify…`);
  const links = await getExternalLinksFor(item);
  if (!isPlayIntentCurrent(intent)) return; // a newer play action started while this was looking up
  const uri = links.spotify && spotifyUri(links.spotify);
  if (!uri) { flashGlobalToast('Couldn\u2019t find this album on Spotify.'); return; }
  await showMiniPlayer(uri, intent);
}

// Adds every track on the album to the shared crate queue (see
// addToCrateQueue) — cross-platform, same as queueTracksNow, using
// getTracksFor()'s existing tracklist loader (manual tracklist, or the
// iTunes/MusicBrainz auto-lookup) instead of resolving one Spotify album
// URI and bulk-queuing via the Web API, which only ever worked for albums
// Spotify itself has — a manually-tracklisted album (the whole reason it
// was added manually) had no album URI at all and nothing got queued.
async function queueAlbumTracks(item) {
  flashGlobalToast(`Queuing "${item.title}"\u2026`);
  const tracks = await getTracksFor(item);
  if (!tracks || !tracks.length) {
    flashGlobalToast('No tracklist found for this album.');
    return;
  }
  addToCrateQueue(tracks.map(t => ({ item, track: t })));
}

// Unlike queueAlbumTracks/addToCrateQueue above (which always APPENDS —
// extends the existing queue, or folds in as "play after whatever's
// currently going"), this unconditionally REPLACES it — clears whatever
// was queued/playing and starts fresh with just this release. Used for
// double-clicking an album row in the left panel: the expectation there
// is "play THIS now", not "add this to what's already lined up".
// crateQueueId is bumped the same way addToCrateQueue's own fresh-queue
// branch does, so any in-flight end-of-track heuristic tied to the OLD
// queue can't fire against this new one.
async function playAlbumReplacingQueue(item) {
  flashGlobalToast(`Queuing "${item.title}"\u2026`);
  const tracks = await getTracksFor(item);
  if (!tracks || !tracks.length) {
    flashGlobalToast('No tracklist found for this album.');
    return;
  }
  const myId = ++crateQueueId;
  crateQueueList = tracks.map(t => ({ item, track: t }));
  crateQueueIndex = -1;
  renderCrateQueuePanel();
  playCrateQueueIndex(myId, 0);
}

// Multi-release version of playAlbumReplacingQueue — used by double-clicking
// "All Albums" (and its Artists/Genres siblings) in the left panel to queue
// and play every release currently included by the search/filters, in the
// order the main view is showing them.
//
// Deliberately NOT built like playPlaylistFromStart (which awaits every
// tracklist before starting): a playlist is a handful of releases, but this
// can be the whole library, and getTracksFor() may need a network lookup
// per release (MusicBee-style "play everything" shouldn't sit silent for
// minutes first). So it starts playing the moment the FIRST release's tracks
// are ready, and loads the rest only a little AHEAD of what's playing
// (QUEUE_LOAD_AHEAD tracks), topped up by playCrateQueueIndex as the queue
// moves on. It used to load every release at once: a genre of a few thousand
// releases meant tens of thousands of queue entries, a tracklist lookup for
// each release whether it would ever be reached or not, and an Up Next panel
// redrawn over and over as they arrived, which slowed the whole page down.
// The releases not loaded yet wait in crateQueuePending, in play order.
// Loads 3 at a time via Promise.all, appended in order so the queue never
// ends up shuffled by whichever lookup happened to finish first.
//
// crateQueueId is the stale-run guard, same as everywhere else: a new Play,
// "Clear", or anything else that bumps it makes this loop stop appending
// instead of resurrecting a queue the person has since replaced or cleared
// (and leaves crateQueuePending, which carries the old id, ignored).
const QUEUE_LOAD_AHEAD = 60, QUEUE_PANEL_MAX_ROWS = 150;   // tracks loaded ahead of the playing one; rows the Up Next panel draws
async function playAlbumsReplacingQueue(items) {
  const releases = (items || []).filter(Boolean);
  if (!releases.length) return;
  if (releases.length === 1) return playAlbumReplacingQueue(releases[0]);

  const myId = ++crateQueueId;
  crateQueueList = [];
  crateQueueIndex = -1;

  // With shuffle on, load the releases in RANDOM order (each entry still
  // remembers its release's position in the original list as origSeq, so
  // turning shuffle off can restore list order) — otherwise "shuffle
  // everything" would always open on a track from whichever release sorts
  // first, since playback starts after only the first release has loaded.
  const order = releases.map((_, k) => k);
  if (state.shuffle) shuffleTail(order, -1);
  crateQueuePending = { id: myId, releases, order, next: 0, skipped: 0, loading: null };
  renderCrateQueuePanel();
  flashGlobalToast(`Playing ${releases.length} releases…`);

  await crateQueueTopUp(myId, 1);
  if (myId !== crateQueueId) return; // replaced/cleared while loading
  if (!crateQueueList.length) {
    crateQueuePending = null;
    renderCrateQueuePanel();
    flashGlobalToast('None of those releases have a tracklist to play.');
    return;
  }
  playCrateQueueIndex(myId, 0); // which tops the queue up to QUEUE_LOAD_AHEAD
}

// Loads releases from crateQueuePending until at least `want` tracks wait
// after the current one, or none are left. One load at a time: a second call
// while one runs waits for it, then checks again.
async function crateQueueTopUp(myId, want) {
  const p = crateQueuePending;
  if (!p || p.id !== myId || myId !== crateQueueId) return;
  if (p.loading) { await p.loading; return crateQueueTopUp(myId, want); }
  const ahead = () => crateQueueList.length - (crateQueueIndex + 1);
  if (p.next >= p.order.length || ahead() >= want) return;
  p.loading = (async () => {
    try {
      while (myId === crateQueueId && p.next < p.order.length && ahead() < want) {
        const size = crateQueueList.length ? 3 : 1; // the first one alone so playback starts as soon as possible
        const chunk = p.order.slice(p.next, p.next + size);
        p.next += size;
        const results = await Promise.all(chunk.map(rel => {
          const item = p.releases[rel];
          return withHardTimeout(getTracksFor(item), 20000, []).then(tracks => ({ item, rel, tracks }), () => ({ item, rel, tracks: [] }));
        }));
        if (myId !== crateQueueId) return;
        results.forEach(({ item, rel, tracks }) => {
          if (!tracks || !tracks.length) { p.skipped++; return; }
          const entries = tracks.map((t, ti) => ({ item, track: t, origSeq: rel * 10000 + ti }));
          if (crateQueueIndex < 0) crateQueueList.push(...entries); // before playback starts everything just accumulates (it gets shuffled as a whole when it starts)
          else crateQueueAppend(entries);
        });
      }
    } finally { p.loading = null; }
  })();
  await p.loading;
  if (myId !== crateQueueId) return;
  if (p.next >= p.order.length && crateQueuePending === p) {
    crateQueuePending = null;
    if (p.skipped && crateQueueList.length) flashGlobalToast(`${p.skipped} of the ${p.releases.length} releases had no tracklist and were skipped.`);
  }
  if (crateQueueIndex >= 0) renderCrateQueuePanel();
}

// How many releases of the current queue are still waiting to be loaded into it.
function crateQueuePendingCount() {
  const p = crateQueuePending;
  return p && p.id === crateQueueId ? p.order.length - p.next : 0;
}

// Every action that can start Spotify playback (album Play Now, a track's
// play button, double-clicking a track row, the deck's Play button, …)
// goes through an async lookup first (resolving a Spotify URI/ID) before it
// can actually call the Play API. Without guarding against that, a slow
// lookup for an earlier click can resolve *after* a later one and clobber
// current playback with whatever was clicked first — which looks like a
// random, unrelated album/track starting to play. Each play attempt grabs
// a token via beginPlayIntent() up front (before its lookup starts) and
// checks isPlayIntentCurrent() right before actually calling the Play API;
// if a newer play attempt has started in the meantime, the stale one no-ops.
let playIntentId = 0;
function beginPlayIntent() { return ++playIntentId; }
function isPlayIntentCurrent(token) { return token === playIntentId; }

async function showMiniPlayer(uri, intent) {
  if (intent === undefined) intent = beginPlayIntent();
  if (!loadSpotifyUserTokens()) {
    flashGlobalToast('Connect your Spotify Premium account to play in-app', {
      onClick: () => { el.menuSpotifyApi.click(); }
    });
    return false;
  }
  await initSpotifyPlayerIfReady();
  if (!spotifyPlayer) return false;
  el.miniPlayer.hidden = false;
  if (!el.miniPlayer.classList.contains('detached')) document.body.classList.add('has-mini-player');
  el.miniPlayerVolume.value = loadSpotifyPlayerPrefs().volume ?? 50;
  if (spotifyDeviceReady) await spotifyDeviceReady;
  if (!isPlayIntentCurrent(intent)) return null; // a newer play action started while this one was getting ready
  return playSpotifyUri(uri);       // true once Spotify accepted it, false if it didn't (the crate queue retries once)
}

async function playSpotifyUri(uriOrUris) {
  // The floating YouTube player, the SoundCloud widget, and Spotify
  // playback are all mutually exclusive — see stopOtherEngines.
  stopOtherEngines('spotify');
  const token = await getSpotifyUserAccessToken();
  if (!token || !spotifyDeviceId) {
    flashGlobalToast('Spotify device isn\u2019t ready yet — try again in a moment.');
    return false;
  }
  const isAlbum = typeof uriOrUris === 'string' && uriOrUris.startsWith('spotify:album:');
  let body;
  if (isAlbum) {
    body = { context_uri: uriOrUris };
  } else if (Array.isArray(uriOrUris)) {
    body = { uris: uriOrUris };
  } else {
    body = { uris: [uriOrUris] };
  }
  if (isAlbum) await setSpotifyShuffle(state.shuffle); // shuffle lives on the device — make sure it matches the button before an album starts
  return sendSpotifyPlayRequest(token, body, true);
}

// Split out of playSpotifyUri so a stale device_id can retry itself once.
// This is the fix for "player gets stuck on one song, nothing new plays" —
// the Web Playback SDK's `not_ready` event (which nulls spotifyDeviceId,
// see its listener) doesn't reliably fire for every way this browser's
// device can quietly drop out from under Spotify's own device list (long
// idle, another device taking over, a network blip that reconnects with a
// fresh device_id the SDK doesn't always re-announce via `ready`). Without
// this, every subsequent play request 404s silently — console.warn only,
// no toast, nothing telling the user why — while whatever was already
// playing just keeps going, exactly the reported symptom. Now: on a 404
// specifically, re-fetch the actual devices list, find the one actually
// named 'CRATE' (the fixed name this Player instance registers under —
// see `new Spotify.Player({name: 'CRATE', ...})`), and retry once with the
// corrected id if it's different. Every failure path now also surfaces a
// real toast instead of just a console.warn.
async function sendSpotifyPlayRequest(token, body, allowRetry) {
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok || res.status === 204) {
      setTimeout(() => { if (!el.queuePanel.hidden) refreshQueuePanel(); }, 700);
      return true;
    }
    console.warn('Spotify play request failed', res.status);
    if (res.status === 403) {
      flashGlobalToast('In-app playback needs a Spotify Premium account.');
      return false;
    }
    if (res.status === 404 && allowRetry) {
      const recovered = await recoverStaleSpotifyDeviceId(token);
      if (recovered) return sendSpotifyPlayRequest(token, body, false); // one retry only — don't loop if it's still wrong
    }
    flashGlobalToast(`Spotify playback didn\u2019t start (error ${res.status}) \u2014 try again, or reconnect via the device picker.`);
    return false;
  } catch (e) {
    console.warn('Spotify play failed', e);
    flashGlobalToast('Spotify playback failed \u2014 check your connection and try again.');
    return false;
  }
}

// Re-finds this browser's own Spotify Connect device by name (fixed at
// 'CRATE' — see the Player constructor) when the cached spotifyDeviceId
// has gone stale, and updates spotifyDeviceId if a different one turns up.
// Returns true only if it found a (possibly new) id to retry with.
async function recoverStaleSpotifyDeviceId(token) {
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return false;
    const data = await res.json();
    const mine = (data.devices || []).find(d => d.name === 'CRATE');
    if (!mine) return false;
    const changed = mine.id !== spotifyDeviceId;
    spotifyDeviceId = mine.id;
    return changed;
  } catch (e) {
    console.warn('Device recovery lookup failed', e);
    return false;
  }
}

function hideMiniPlayer() {
  if (spotifyPlayer) spotifyPlayer.pause().catch(() => {});
  el.queuePanel.hidden = true;
  document.body.classList.remove('has-mini-player');
}

// Pulls the account's real up-next queue (not anything CRATE keeps track of
// itself) via the Web API and renders it into the queue popover.
let lastQueueData = []; // flat [currently_playing, ...queue] with .uri, used so clicking a row can play it + everything after it
async function refreshQueuePanel() {
  const token = await getSpotifyUserAccessToken();
  if (!token) {
    el.queuePanelNowPlaying.innerHTML = '';
    el.queuePanelList.innerHTML = '<p class="queue-empty">Not connected.</p>';
    lastQueueData = [];
    return;
  }
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/queue', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) { el.queuePanelList.innerHTML = '<p class="queue-empty">Couldn\u2019t load queue.</p>'; return; }
    const data = await res.json();

    const current = data.currently_playing;
    const upcoming = (data.queue || []).slice(0, 20);
    lastQueueData = [current, ...upcoming].filter(Boolean);

    el.queuePanelNowPlaying.innerHTML = current ? queueRowHtml(current, 0, true) : '<p class="queue-empty">Nothing playing.</p>';

    el.queuePanelList.innerHTML = upcoming.length
      ? upcoming.map((t, i) => queueRowHtml(t, i + 1, false)).join('')
      : '<p class="queue-empty">Queue is empty.</p>';
  } catch (e) {
    console.warn('Queue fetch failed', e);
    el.queuePanelList.innerHTML = '<p class="queue-empty">Couldn\u2019t load queue.</p>';
  }
}
// Lists the account's active Spotify Connect devices (this browser tab
// included) so playback can be moved to a phone, speaker, desktop app, etc.
async function refreshDevicePanel() {
  const token = await getSpotifyUserAccessToken();
  if (!token) {
    el.devicePanelList.innerHTML = '<p class="queue-empty">Not connected.</p>';
    return;
  }
  el.devicePanelList.innerHTML = '<p class="queue-empty">Loading devices…</p>';
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) { el.devicePanelList.innerHTML = '<p class="queue-empty">Couldn\u2019t load devices.</p>'; return; }
    const data = await res.json();
    const devices = data.devices || [];
    if (!devices.length) {
      el.devicePanelList.innerHTML = '<p class="queue-empty">No active devices — open Spotify somewhere first.</p>';
      return;
    }
    el.devicePanelList.innerHTML = devices.map(deviceRowHtml).join('');
  } catch (e) {
    console.warn('Device list fetch failed', e);
    el.devicePanelList.innerHTML = '<p class="queue-empty">Couldn\u2019t load devices.</p>';
  }
}

function deviceRowHtml(d) {
  const icon = d.type === 'Smartphone' ? '📱' : d.type === 'Speaker' ? '🔊' : d.type === 'TV' ? '📺' : d.id === spotifyDeviceId ? '🎧' : '💻';
  const isThisDevice = d.id === spotifyDeviceId;
  const label = isThisDevice ? `${escapeHtml(d.name)} (this browser)` : escapeHtml(d.name);
  return `
    <div class="queue-row device-row${d.is_active ? ' queue-row-current' : ''} device-row-clickable" data-device-id="${escapeHtml(d.id)}" role="button" tabindex="0">
      <span class="device-row-icon" aria-hidden="true">${icon}</span>
      <div class="queue-row-meta">
        <p class="queue-track-title">${label}${d.is_active ? ' — active' : ''}</p>
        <p class="queue-track-artist">${escapeHtml(d.type || '')}${d.volume_percent != null ? ' · ' + d.volume_percent + '%' : ''}</p>
      </div>
    </div>`;
}

async function transferSpotifyPlayback(deviceId) {
  if (!deviceId) return;
  const token = await getSpotifyUserAccessToken();
  if (!token) return;
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [deviceId], play: true })
    });
    if (!res.ok && res.status !== 204) {
      flashGlobalToast('Couldn\u2019t switch device — try again.');
      return;
    }
    el.devicePanel.hidden = true;
    flashGlobalToast('Playback moved.');
    setTimeout(() => { if (!el.queuePanel.hidden) refreshQueuePanel(); }, 700);
  } catch (e) {
    console.warn('Transfer playback failed', e);
    flashGlobalToast('Couldn\u2019t switch device — try again.');
  }
}

function queueRowHtml(t, index, isCurrent) {
  const art = t.album && t.album.images && t.album.images[t.album.images.length - 1];
  const artistText = formatArtistNames(t.artists) || (t.show && t.show.name) || '';
  const timeText = formatDuration(t.duration_ms) || '--:--';
  return `<div class="queue-row${isCurrent ? ' queue-row-current' : ' queue-row-clickable'}" data-queue-index="${index}" ${isCurrent ? '' : 'role="button" tabindex="0" title="Play this track"'}>
    <img src="${art ? art.url : NO_ART_FALLBACK}" alt="">
    <div class="queue-row-meta">
      <p class="queue-track-title">${escapeHtml(t.name || '')}</p>
      <p class="queue-track-artist">${artistText ? escapeHtml(artistText) : '&nbsp;'}</p>
    </div>
    <span class="queue-track-time">${escapeHtml(timeText)}</span>
  </div>`;
}

/* ---- Spotify Premium playback auth (Authorization Code + PKCE) ----
   Client Credentials (above) only reads the public catalog — it can never
   control playback on an account. Controlling playback needs a real user
   login, so this uses PKCE: no client secret leaves the browser, just the
   Client ID already saved above plus a Redirect URI the listener adds to
   their own app in the Spotify dashboard (this exact page's URL). */

function spotifyRedirectUri() { return window.location.origin + window.location.pathname; }

function loadSpotifyPlayerPrefs() {
  try { return JSON.parse(localStorage.getItem(SPOTIFY_PLAYER_PREFS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveSpotifyPlayerPrefs(patch) {
  try { localStorage.setItem(SPOTIFY_PLAYER_PREFS_KEY, JSON.stringify({ ...loadSpotifyPlayerPrefs(), ...patch })); }
  catch (e) { /* localStorage unavailable — safe to ignore */ }
}

function loadSpotifyUserTokens() {
  try { return JSON.parse(localStorage.getItem(SPOTIFY_USER_TOKENS_KEY) || 'null'); }
  catch (e) { return null; }
}
function saveSpotifyUserTokens(data) {
  const existing = loadSpotifyUserTokens() || {};
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || existing.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000
  };
  try { localStorage.setItem(SPOTIFY_USER_TOKENS_KEY, JSON.stringify(tokens)); } catch (e) {}
  return tokens;
}
function clearSpotifyUserTokens() {
  try { localStorage.removeItem(SPOTIFY_USER_TOKENS_KEY); } catch (e) {}
}

async function getSpotifyUserAccessToken() {
  const tokens = loadSpotifyUserTokens();
  if (!tokens) return null;
  if (tokens.expires_at > Date.now() + 5000) return tokens.access_token;

  const { clientId } = loadSpotifyCreds();
  if (!clientId || !tokens.refresh_token) return null;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    return saveSpotifyUserTokens(data).access_token;
  } catch (e) {
    console.warn('Spotify token refresh failed', e);
    return null;
  }
}

function updateSpotifyConnectUI() {
  const connected = !!loadSpotifyUserTokens();
  el.spotifyConnectBtn.hidden = connected;
  el.spotifyDisconnectBtn.hidden = !connected;
}

function pkceRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  values.forEach(v => { out += possible[v % possible.length]; });
  return out;
}
async function pkceChallengeFromVerifier(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function connectSpotifyPremium(clientId) {
  const verifier = pkceRandomString(64);
  const state = pkceRandomString(16);
  try {
    localStorage.setItem(SPOTIFY_PKCE_VERIFIER_KEY, verifier);
    localStorage.setItem(SPOTIFY_PKCE_STATE_KEY, state);
  } catch (e) {
    alert('[debug] localStorage.setItem THREW: ' + e);
  }
  const readBack = localStorage.getItem(SPOTIFY_PKCE_VERIFIER_KEY);
  alert('[' + APP_VERSION + '] wrote verifier, read back: ' + (readBack === verifier ? 'MATCH OK' : 'MISMATCH — got: ' + readBack));
  const challenge = await pkceChallengeFromVerifier(verifier);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_PLAYBACK_SCOPES,
    redirect_uri: spotifyRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state
  });
  window.location = 'https://accounts.spotify.com/authorize?' + params.toString();
}

// Runs once on load; picks up the ?code= Spotify redirects back with after
// the listener approves access, and exchanges it for real tokens.
async function handleSpotifyAuthRedirect() {
  console.log('[spotify-debug] BUILD MARKER v2-localstorage loaded');
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) { console.log('[spotify-debug] no ?code= param present, skipping'); return; }
  console.log('[spotify-debug] code param found, proceeding with exchange');

  const returnedState = params.get('state');
  let expectedState = null, verifier = null;
  try {
    expectedState = localStorage.getItem(SPOTIFY_PKCE_STATE_KEY);
    verifier = localStorage.getItem(SPOTIFY_PKCE_VERIFIER_KEY);
    localStorage.removeItem(SPOTIFY_PKCE_STATE_KEY);
    localStorage.removeItem(SPOTIFY_PKCE_VERIFIER_KEY);
  } catch (e) { console.log('[spotify-debug] localStorage read threw', e); }
  console.log('[spotify-debug] verifier present:', !!verifier, '| expectedState:', expectedState, '| returnedState:', returnedState);

  // Strip the auth params from the URL either way, so a refresh doesn't
  // try to redeem an already-used code.
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);

  if (!verifier) {
    flashGlobalToast('[' + APP_VERSION + '] No PKCE verifier found in localStorage — it was lost between redirect out and back.');
    return;
  }
  if (expectedState && returnedState !== expectedState) {
    flashGlobalToast('[' + APP_VERSION + '] State mismatch — expected "' + expectedState + '" got "' + returnedState + '".');
    return;
  }
  const { clientId } = loadSpotifyCreds();
  if (!clientId) {
    flashGlobalToast('[' + APP_VERSION + '] No Client ID found in saved Spotify creds at redemption time.');
    return;
  }
  console.log('[spotify-debug] all checks passed, calling token endpoint with redirect_uri=', spotifyRedirectUri());

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: spotifyRedirectUri(),
        client_id: clientId,
        code_verifier: verifier
      })
    });
    const data = await res.json();
    console.log('[spotify-debug] token endpoint status:', res.status, '| body:', data);
    if (data.access_token) {
      saveSpotifyUserTokens(data);
      updateSpotifyConnectUI();
      flashGlobalToast('[' + APP_VERSION + '] Spotify Premium connected \u2014 playback controls are live.');
      initSpotifyPlayerIfReady();
    } else {
      flashGlobalToast('[' + APP_VERSION + '] Token exchange failed: ' + (data.error || 'unknown') + ' \u2014 ' + (data.error_description || 'no description'));
    }
  } catch (e) {
    console.warn('Spotify auth exchange failed', e);
    flashGlobalToast('[' + APP_VERSION + '] fetch to token endpoint threw: ' + (e && e.message ? e.message : e));
  }
}

// Helper to get raw values for overlay tags
function keyToVal(key, item) {
  if (!key || key === 'none') return "";
  if (key === 'rymPop') { const v = albumPopOf(item); return v && v.pop !== null ? 'Popularity ' + Math.round(v.pop) : ''; }          // worked out, not stored (see albumPopMap)
  
  const year = (item.releaseDate && dateVal(item.releaseDate) !== -Infinity) 
               ? new Date(item.releaseDate).getUTCFullYear() : '';

  const map = {
    catalog: item.catalog,
    descriptor: item.descriptor,
    scene: item.scene,
    movement: item.movement,
    type: typeAbbrev(item.type),
    year: year,
    releaseDate: formatReleaseDate(item),
    recordedDate: formatRecordedDate(item),
    genre: item.genre,
    label: item.label,
    region: item.region,
    artist: item.artist, // <--- This ensures the Artist field is pulled
    title: item.title,
    rating: starString(item.rating),
    rymRating: item.rymRating ? 'RYM ' + item.rymRating.toFixed(2) : '',
    rymVotes: item.rymVotes ? item.rymVotes.toLocaleString() + ' ratings' : ''
  };

  return map[key] || "";
}

// Loose artist-name match — used only to sanity-check nowPlayingItem
// against whatever track Spotify just reported (see renderMiniPlayerTrack)
// before trusting it for display, since nowPlayingItem is left stale
// between tracks rather than reset on every possible playback path (see
// its own comment). Not used for anything that needs to be exact.
function artistsRoughlyMatch(itemArtist, trackArtists) {
  if (!itemArtist || !trackArtists || !trackArtists.length) return false;
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(itemArtist);
  if (!a) return false;
  return trackArtists.some(t => { const b = norm(t && t.name); return b && (a.includes(b) || b.includes(a)); });
}

// Resolves one configured mini-player/queue field slot to displayable text.
// Prefers the linked crate item (nowPlayingItem) for full metadata; when
// there isn't one — arbitrary external Spotify playback with no matching
// crate release — falls back to whatever the raw Spotify track object
// itself carries, which only ever covers artist/album ("title").
function miniPlayerFieldVal(key) {
  if (!key || key === 'none') return '';
  if (nowPlayingItem) {
    const val = keyToVal(key, nowPlayingItem);
    if (val) return val;
  }
  if (activePlayerEngine === 'spotify' && currentSpotifyTrack) {
    if (key === 'artist') return formatArtistNames(currentSpotifyTrack.artists);
    if (key === 'title') return (currentSpotifyTrack.album && currentSpotifyTrack.album.name) || '';
  }
  return '';
}

// Fields 3 and 4 of the player (state.fields.miniPlayer), side by side on one line so the player stays short: "1994 · melancholic, nocturnal".
// Blank ones drop out; a genre is links. Empty string when neither has a value (the line then hides: .mini-player-album:empty).
function miniPlayerExtraHtml(slots) {
  return slots.slice(2, 4).map(k => { const v = miniPlayerFieldVal(k); return !v ? '' : k === 'genre' ? genreLinksHtml(v) : escapeHtml(v); }).filter(Boolean).join(' \u00b7 ');
}
// Refreshes the two configurable lines under the mini player's track title
// (#miniPlayerArtist/#miniPlayerAlbum — reused as generic slots rather than
// adding new DOM) from state.fields.miniPlayer. Called from both
// renderMiniPlayerTrack (Spotify) and playYtQueueIndex (YouTube) whenever a
// track starts, and directly from the "Panel Settings…" field pickers so a
// change shows up immediately on whatever's already playing.
function refreshMiniPlayerMeta() {
  const slots = (state.fields.miniPlayer || []).slice(0, 4);
  [el.miniPlayerArtist, el.miniPlayerAlbum].forEach((lineEl, i) => {
    if (!lineEl) return;
    if (slots[i] === 'genre') lineEl.innerHTML = genreLinksHtml(miniPlayerFieldVal(slots[i]));          // each genre opens its page (see initGenreLinks)
    else lineEl.textContent = miniPlayerFieldVal(slots[i]);
  });
  if (el.miniPlayerExtra) el.miniPlayerExtra.innerHTML = miniPlayerExtraHtml(slots);
  renderTrackInfoPanel(); // no-op if that section isn't on — see its own guard
  refreshNowPlayingBarMain(); // no-op if Now Playing Bar isn't placed in Main — see its own guard
  aiRefreshNowPlaying();      // the Artist Information page's "playing now:" line
  if (el.artistBioElement && !el.artistBioElement.hidden) renderArtistBioElement(); // the biography strip falls back to the playing artist
}




function starString(rating) {
  const r = rating || 0;
  const full = Math.floor(r);
  const half = (r - full) >= 0.5 ? 1 : 0;
  const empty = Math.max(0, 5 - full - half);
  // Plain-text fallback for contexts that can't hold markup (title/aria
  // attributes, tooltips). ★/☆ (U+2605/2606) are old and near-universally
  // supported; a dedicated half-star glyph is not (see starRatingHtml).
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// Real half-filled star rendering for anywhere a rating is actually
// *displayed* on screen. Unicode has no half-star glyph with reliable font
// support (U+2BE8 renders as a tofu box in most browsers), so instead each
// star is its own dim "back" ☆ with an accent "front" ★ layered on top and
// clipped to an exact 0/50/100% width — the same technique the interactive
// star-rating widget already uses (see starGlyphHtml/fillForIndex/fillPct
// below). Returns HTML — insert with innerHTML, never escapeHtml.
function starRatingHtml(rating, count) {
  count = count || 5;
  const r = Math.max(0, Math.min(count, rating || 0));
  let html = '<span class="star-rating-display">';
  for (let i = 0; i < count; i++) {
    const pct = fillPct(fillForIndex(r, i));
    html += `<span class="star-glyph"><span class="star-back">☆</span><span class="star-front" style="width:${pct}%">★</span></span>`;
  }
  return html + '</span>';
}

function typeAbbrev(type) {
  const map = { album: 'LP', ep: 'EP', single: 'SGL', compilation: 'COMP', live: 'LIVE', mixtape: 'MIX' };
  const key = type.toLowerCase();
  return map[key] || type.slice(0, 4).toUpperCase();
}

function setViewMode(mode) {
  state.viewMode = mode;
  el.viewGridBtn.classList.toggle('active', mode === 'grid');
  el.viewListBtn.classList.toggle('active', mode === 'list');
  el.sizeControl.style.visibility = mode === 'grid' ? 'visible' : 'hidden';
}

// Explains what's currently narrowing state.filtered down, for the "no
// results" empty state below — a genuine diagnostic gap otherwise:
// someone with a stray filter active (a genre/artist/year click,
// "Listened only", a leftover search query) sees "No sleeves match your
// search" with zero indication of why, which is especially confusing
// right after adding something that plainly should show up — a real
// report of exactly that ("happens to anything I add") is what prompted
// this. Returns '' if nothing is actually filtering.
function describeActiveFilters() {
  const parts = [];
  if (state.query) parts.push(`the search "${state.query}"`);
  if (state.navFilter) {
    const modeLabel = state.navFilter.mode === 'genre' ? 'genre' : state.navFilter.mode === 'artist' ? 'artist' : state.navFilter.mode === 'year' ? 'year' : state.navFilter.mode;
    parts.push(`the ${modeLabel} filter \u201c${state.navFilter.mode === 'label' ? labelDisplayOf(state.navFilter.value) : state.navFilter.value}\u201d`);
  }
  if (state.activeType && state.activeType !== 'All') parts.push(`the \u201c${state.activeType}\u201d type filter`);
  if (state.listenedOnly) parts.push('\u201cListened only\u201d');
  if (!parts.length) return '';
  return ' You currently have ' + parts.join(', ') + ' active \u2014 clear it to see everything.';
}

function showState(kind, which, detail) {
  const container = which === 'diary' ? el.diaryContainer : which === 'scrobbles' ? el.scrobblesContainer : el.gridContainer;
  const msg = which === 'diary' ? el.diaryStateMsg : which === 'scrobbles' ? el.scrobblesStateMsg : el.stateMsg;
  container.innerHTML = '';
  msg.hidden = false;
  const retryBtnHtml = '<div><button type="button" class="state-msg-retry-btn">Retry</button></div>';
  // A backend-reported error (fetchCatalog's data.error check) gets shown
  // verbatim rather than the generic "check your Apps Script URL" text —
  // that generic message is a guess at the cause, and an actual message
  // from the script itself (a spreadsheet permissions error, a broken
  // formula, whatever it turns out to be) is strictly more useful whenever
  // one is available. escapeHtml since this is server-controlled text
  // going into innerHTML.
  const errorMsg = detail
    ? 'The crate reported an error: \u201c' + escapeHtml(String(detail)) + '\u201d'
    : 'Couldn\u2019t reach the crate. Check your Apps Script URL and that the sheet is deployed with access set to "Anyone".';
  const messages = {
    loading: 'Cataloguing your collection…',
    error: errorMsg + retryBtnHtml,
    // Distinct from plain 'error' (see fetchCatalog's AbortError check) —
    // a slow response isn't the same problem as a broken URL/deployment,
    // and telling them apart means not sending someone down the wrong
    // troubleshooting path for what's usually just a Google Apps Script
    // cold start.
    timeout: 'The crate took a while to respond — Google Apps Script can be slow to spin up, especially after it\u2019s been idle. Give it another try.' + retryBtnHtml,
    empty: 'No sleeves match your search.' + describeActiveFilters(),
    // Distinct from 'empty' above: that one means "you searched/filtered
    // and nothing matched" — this one means the catalog has literally
    // nothing in it yet (a brand-new spreadsheet, e.g. a friend's first
    // sign-in). Telling them apart matters because the search-flavored
    // message is actively misleading on a fresh, empty crate. See renderGrid().
    emptyCatalog: 'Your crate is empty — add your first album with the + button up top to get started.',
    emptyDiary: 'No listens logged yet. Open an album and hit \u201c+ Log a listen\u201d to start your diary.',
    emptyScrobbles: 'No scrobbles imported yet. Use the Last.fm button up top to pull in your listening history.',
    setup: 'CRATE isn\u2019t connected yet. Open index.html, find CONFIG.SCRIPT_URL near the top of the &lt;script&gt;, and paste in your Apps Script Web App URL. See README.md for the full setup.'
  };
  msg.innerHTML = messages[kind] || '';
  const retryBtn = msg.querySelector('.state-msg-retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', () => fetchCatalog());
}
function hideState(which) {
  (which === 'diary' ? el.diaryStateMsg : which === 'scrobbles' ? el.scrobblesStateMsg : el.stateMsg).hidden = true;
}
