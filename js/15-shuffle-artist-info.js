// CRATE — shuffle, Artist information page, artist biography.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Shuffle ----------
   One toggle on the player (state.shuffle, persisted) that has to work on all
   three ways this app actually plays things:

   1. The crate queue (double-click an album, Play playlist, Add to queue...) —
      an ordered list plus an index; Prev/Next/end-of-track all just move the
      index. So shuffle REORDERS THE UNPLAYED PART of the list in place rather
      than adding a "random next pick" mode on the side. That keeps everything
      downstream untouched (Prev still walks back through what actually
      played, the Up Next panel shows what really comes next) and means turning
      shuffle off can put the remaining tracks back in their original order.
   2. Standalone YouTube / SoundCloud album queues (clicking a track's ▶ YT /
      SC) — the same array-plus-index shape, so the same helpers apply.
   3. Spotify's own album playback (the deck's ▶ Play sends a context_uri;
      Spotify, not us, owns that queue) — there the only lever is Spotify's
      own shuffle endpoint, see setSpotifyShuffle.

   "Original order" is remembered per entry (origSeq), not as a separate copy
   of the list: entries get a sequence number the first time a queue is
   shuffled (or up front, for lists that load progressively), and restoring is
   just sorting the not-yet-played tail by it. That survives entries being
   appended mid-queue and never goes stale when a queue is replaced, since it
   lives on the entries themselves. */
function origSeqOf(e) { return (e && typeof e.origSeq === 'number') ? e.origSeq : Number.MAX_SAFE_INTEGER; }

// Gives every entry that doesn't have one yet an origSeq after the highest
// existing one, in list order — i.e. the list's CURRENT order becomes its
// "original" order for anything not already numbered.
function ensureOrigSeq(list) {
  let max = -1;
  list.forEach(e => { if (e && typeof e.origSeq === 'number' && e.origSeq > max) max = e.origSeq; });
  list.forEach(e => { if (e && typeof e.origSeq !== 'number') e.origSeq = ++max; });
}

// Fisher–Yates over just list[index+1 ..] (everything not yet played);
// index -1 shuffles the whole list.
function shuffleTail(list, index) {
  const start = index + 1;
  for (let i = list.length - 1; i > start; i--) {
    const j = start + Math.floor(Math.random() * (i - start + 1));
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
  }
}

// Shuffle off: the not-yet-played tracks go back to their original relative
// order. Anything already played (before the current one) stays as it was.
function restoreTailOrder(list, index) {
  const start = index + 1;
  const tail = list.slice(start).sort((a, b) => origSeqOf(a) - origSeqOf(b));
  for (let i = 0; i < tail.length; i++) list[start + i] = tail[i];
}

// Used wherever entries get added to a queue that's already running. With
// shuffle on they're dropped into RANDOM positions among the unplayed tracks
// instead of stacking up at the end in order (which would quietly un-shuffle
// a queue that keeps loading, e.g. double-clicking "All Albums").
function crateQueueAppend(entries) {
  if (!entries || !entries.length) return;
  if (!state.shuffle || crateQueueIndex < 0) { crateQueueList.push(...entries); return; }
  ensureOrigSeq(crateQueueList.concat(entries));
  entries.forEach(e => {
    const lo = crateQueueIndex + 1;
    crateQueueList.splice(lo + Math.floor(Math.random() * (crateQueueList.length - lo + 1)), 0, e);
  });
}

// Remove an UPCOMING entry (never the one playing, never one that already played). By entry, not position:
// the menu that calls this can have been open while the queue moved on. A no-op in those cases.
// The queue only ever advances by playCrateQueueIndex(id, index + 1) from the playing track, and new tracks
// are only appended, so deleting something after the current track needs no other bookkeeping.
function crateQueueRemove(entry) {
  const i = crateQueueList.indexOf(entry);
  if (i <= crateQueueIndex) return false;
  crateQueueList.splice(i, 1);
  renderCrateQueuePanel();
  return true;
}
// Make an upcoming entry the NEXT one to play. With Shuffle on, each entry carries an original-order number
// that "Shuffle off" sorts the rest of the queue back by — so the moved entry takes one just below the
// smallest in the tail, otherwise turning Shuffle off would quietly put it back where it came from.
function crateQueuePlayNext(entry) {
  const i = crateQueueList.indexOf(entry), dest = crateQueueIndex + 1;
  if (i <= crateQueueIndex || i === dest) return false;
  crateQueueList.splice(i, 1);
  const seqs = crateQueueList.slice(dest).map(e => e && e.origSeq).filter(n => typeof n === 'number');
  if (seqs.length) entry.origSeq = Math.min(...seqs) - 1;
  crateQueueList.splice(dest, 0, entry);
  renderCrateQueuePanel();
  return true;
}

function applyShuffleToCrateQueue(on) {
  if (!isPlayingCrateQueue()) return false;
  if (on) { ensureOrigSeq(crateQueueList); shuffleTail(crateQueueList, crateQueueIndex); }
  else restoreTailOrder(crateQueueList, crateQueueIndex);
  if (crateQueuePendingCount()) {      // the releases of a big "play everything" not loaded yet follow suit
    const p = crateQueuePending, rest = p.order.slice(p.next);
    if (on) shuffleTail(rest, -1); else rest.sort((a, b) => a - b);
    p.order = p.order.slice(0, p.next).concat(rest);
  }
  renderCrateQueuePanel();
  return true;
}

// The standalone YouTube/SoundCloud album queue, when that's what is playing
// (NOT when the YT/SC player is just standing in for one entry of the crate
// queue — then the crate queue is in charge and ytQueue is a single item).
function standaloneQueueRef() {
  if (activePlayerEngine === 'youtube' && !ytPlayingForCrateQueue && ytQueue.length > 1) return { list: ytQueue, index: ytQueueIndex };
  if (activePlayerEngine === 'soundcloud' && !scPlayingForCrateQueue && scQueue.length > 1) return { list: scQueue, index: scQueueIndex };
  return null;
}
function applyShuffleToStandaloneQueue(on) {
  const q = standaloneQueueRef();
  if (!q || q.index < 0) return false;
  if (on) { ensureOrigSeq(q.list); shuffleTail(q.list, q.index); }
  else restoreTailOrder(q.list, q.index);
  return true;
}

// Spotify owns the queue for album (context_uri) playback, so its own
// endpoint is the only way to shuffle that. Shuffle state lives on the
// DEVICE, not on a play request, so it's set on toggle and again right before
// each album starts (see playSpotifyUri) — otherwise a state left over from a
// previous album would silently win over what the button says.
async function setSpotifyShuffle(on) {
  try {
    const token = await getSpotifyUserAccessToken();
    if (!token || !spotifyDeviceId) return false;
    const res = await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${on ? 'true' : 'false'}&device_id=${encodeURIComponent(spotifyDeviceId)}`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.ok || res.status === 204;
  } catch (e) {
    console.warn('Spotify shuffle request failed', e);
    return false;
  }
}

function updateShuffleButtonUI() {
  if (!el.miniPlayerShuffle) return;
  el.miniPlayerShuffle.setAttribute('aria-pressed', state.shuffle ? 'true' : 'false');
  el.miniPlayerShuffle.title = state.shuffle ? 'Shuffle: on' : 'Shuffle: off';
}

function setShuffle(on) {
  state.shuffle = !!on;
  savePrefs();
  updateShuffleButtonUI();
  if (!applyShuffleToCrateQueue(state.shuffle) && !applyShuffleToStandaloneQueue(state.shuffle)
      && activePlayerEngine === 'spotify' && spotifyPlayer && spotifyDeviceId) {
    setSpotifyShuffle(state.shuffle).then(ok => {
      if (!ok) flashGlobalToast('Couldn\u2019t change Spotify\u2019s shuffle \u2014 it will apply the next time an album starts.');
    });
  }
  flashGlobalToast(state.shuffle ? 'Shuffle on' : 'Shuffle off');
}

async function playCrateQueueIndex(myId, index) {
  if (myId !== crateQueueId) return;
  // Caught up with what's loaded of a big "play everything": load the next release(s) first.
  if (index >= crateQueueList.length && crateQueuePendingCount()) {
    await crateQueueTopUp(myId, index - crateQueueIndex);
    if (myId !== crateQueueId) return;
  }
  if (index < 0 || index >= crateQueueList.length) {
    crateQueueIndex = -1; // reached the end of the queue
    crateQueueExpectedSpotifyTrackId = null;
    renderCrateQueuePanel();
    return;
  }
  // A brand-new queue starting from the top while shuffle is on (album,
  // playlist, library double-click...): shuffle the whole thing first so it
  // opens on a random track, not track 1. Only the very first call of a run
  // qualifies — crateQueueIndex is -1 exactly once, before it first plays.
  if (state.shuffle && index === 0 && crateQueueIndex === -1 && crateQueueList.length > 1) {
    ensureOrigSeq(crateQueueList);
    shuffleTail(crateQueueList, -1);
  }
  crateQueueIndex = index;
  crateQueueStalledIndex = -1;
  renderCrateQueuePanel();
  crateQueueTopUp(myId, QUEUE_LOAD_AHEAD); // keeps a big "play everything" loaded a little ahead; a no-op otherwise
  const { item, track } = crateQueueList[index];
  nowPlayingItem = item;
  nowPlayingYoutubeLink = track.youtubeLink || '';
  const trackName = track.trackName || '';
  if (!trackName) { playCrateQueueIndex(myId, index + 1); return; }

  // Moving to another track: whatever was playing stops NOW, not when the next one is ready (a Spotify lookup can
  // take seconds). Before, the old track played on meanwhile, and if it ended in that time the queue advanced a
  // second time; if the new one then failed to start, the old one played on while the queue showed the new one,
  // and when it ended nothing advanced, because the queue was waiting to hear from a different track.
  // The play intent is taken here for every engine (it was Spotify-only), so a slower Spotify start from an earlier
  // press can no longer begin playing over a YouTube or SoundCloud track that was chosen after it.
  const intent = beginPlayIntent();
  await pauseForQueueSwitch();
  if (myId !== crateQueueId || crateQueueIndex !== index || !isPlayIntentCurrent(intent)) return;

  // A saved Spotify link override (see "Edit track properties…") always
  // wins, on any album — an exact pin the person chose ahead of both the
  // manual-tracklist YouTube link and the automatic fuzzy search below.
  const overrideUri = trackSpotifyUriFromLink(track.spotifyLink);
  if (overrideUri) {
    crateQueueExpectedSpotifyTrackId = overrideUri.startsWith('spotify:track:') ? overrideUri.slice('spotify:track:'.length) : null;
    startCrateQueueSpotify(myId, index, overrideUri, intent, trackName);
    return;
  }

  // A saved YouTube link (trackData override or, for a manual album, its
  // own manualTracks entry — see trackLinkOverridesFor) plays next.
  if (track.youtubeLink) {
    crateQueueExpectedSpotifyTrackId = null;
    playCrateTrackOnYoutube(myId, index, track.youtubeLink, trackName);
    return;
  }

  // A saved SoundCloud link (trackData override — see trackLinkOverridesFor)
  // plays next, same priority slot as the YouTube check just above.
  if (track.soundcloudLink) {
    crateQueueExpectedSpotifyTrackId = null;
    playCrateTrackOnSoundcloud(myId, index, track.soundcloudLink, trackName);
    return;
  }

  // Manual albums never get the automatic Spotify search — see
  // isManualAlbum() — so a track with no link saved has no reliable way to
  // play here and is skipped rather than guessed at.
  if (isManualAlbum(item)) {
    crateQueueExpectedSpotifyTrackId = null;
    flashGlobalToast(`Skipping "${trackName}" \u2014 no link saved.`);
    mqAdd([item], 'skipped', trackName);          // queued for Match songs
    playCrateQueueIndex(myId, index + 1);
    return;
  }

  try {
    const trackId = await spotifyTrackId(item.artist, trackName, { album: item.title, durationMs: track.trackTimeMillis || 0 });
    if (myId !== crateQueueId || crateQueueIndex !== index || !isPlayIntentCurrent(intent)) return; // queue moved on while this lookup was in flight
    if (trackId) {
      crateQueueExpectedSpotifyTrackId = trackId;
      startCrateQueueSpotify(myId, index, `spotify:track:${trackId}`, intent, trackName);
    } else {
      flashGlobalToast(`Skipping "${trackName}" \u2014 not found on Spotify.`);
      mqAdd([item], 'skipped', trackName);
      playCrateQueueIndex(myId, index + 1);
    }
  } catch (e) {
    if (myId === crateQueueId && crateQueueIndex === index) playCrateQueueIndex(myId, index + 1);
  }
}

// Pauses whichever engine is playing, for playCrateQueueIndex moving on. Also forgets which Spotify track the queue
// was waiting to hear end: the old one's pause must not count as it ending (see maybeAdvanceCrateQueueOnEnd).
async function pauseForQueueSwitch() {
  crateQueueExpectedSpotifyTrackId = null;
  try {
    if (activePlayerEngine === 'youtube') { if (ytPlayer && ytPlayer.pauseVideo && !ytIsPaused) ytPlayer.pauseVideo(); }
    else if (activePlayerEngine === 'soundcloud') { if (scWidget && !scIsPaused) scWidget.pause(); }
    else if (spotifyPlayer && spotifyLastState && !spotifyLastState.paused) await withHardTimeout(spotifyPlayer.pause(), 1500, null); // finished before the next play request goes out, so it can't pause that one
  } catch (e) { /* nothing to pause */ }
}

// Starts a queue entry on Spotify, trying once more if Spotify doesn't accept it (a device that went quiet, a network
// blip). If it still doesn't, the queue stays on that track with nothing playing, and Play tries it again
// (crateQueueStalledIndex) instead of resuming the track that was paused when the queue moved on.
async function startCrateQueueSpotify(myId, index, uri, intent, trackName) {
  const current = () => myId === crateQueueId && crateQueueIndex === index && isPlayIntentCurrent(intent);
  if (await showMiniPlayer(uri, intent) !== false || !current()) return;
  await new Promise(r => setTimeout(r, 1500));
  if (!current()) return;
  if (await showMiniPlayer(uri, intent) !== false || !current()) return;
  crateQueueStalledIndex = index;
  flashGlobalToast(`"${trackName}" didn\u2019t start on Spotify \u2014 press Play to try again, or Next to skip it.`);
}

// Plays one video on the floating YouTube player as part of a "Play
// playlist" run, bypassing openYoutubePlayer()'s own "queue the rest of
// this album" behavior — this master queue is what decides what plays
// next, since that could mean handing off back to Spotify partway through.
function playCrateTrackOnYoutube(myId, index, url, trackName) {
  const videoId = youtubeVideoIdFromUrl(url);
  if (!videoId) {
    flashGlobalToast(`Skipping "${trackName}" \u2014 that YouTube link looks invalid.`);
    playCrateQueueIndex(myId, index + 1);
    return;
  }
  ytPlayingForCrateQueue = true;
  ytQueue = [Object.assign({ videoId, trackName }, ytSegOf(url))];
  ytQueueIndex = 0;
  playYtQueueIndex(0);
}

// SoundCloud counterpart to playCrateTrackOnYoutube just above — same
// "bypass the click-time queue-building, this master queue decides what's
// next" reasoning. No ID to extract here (unlike YouTube, the widget takes
// the track URL directly), just a sanity check that it's actually a
// SoundCloud URL.
function playCrateTrackOnSoundcloud(myId, index, url, trackName) {
  if (!/soundcloud\.com\//i.test(url || '')) {
    flashGlobalToast(`Skipping "${trackName}" \u2014 that SoundCloud link looks invalid.`);
    playCrateQueueIndex(myId, index + 1);
    return;
  }
  scPlayingForCrateQueue = true;
  scQueue = [{ url, trackName }];
  scQueueIndex = 0;
  playScQueueIndex(0);
}

// Cross-platform "Add to queue" — the single entry point both the track
// context menu (queueTracksNow) and the album card menu (queueAlbumTracks)
// funnel into. Everything is pushed onto this same crate queue rather than
// Spotify's own remote device queue, since a Spotify-only queue has nowhere
// to put a manually-tracklisted album's track (see isManualAlbum()) — that
// used to mean a mixed selection silently dropped every non-Spotify track.
// Building on the crate queue means Spotify and YouTube-only tracks can sit
// in the same queue and playCrateQueueIndex's existing handoff logic — the
// same logic "Play playlist" already relies on — carries them through in
// order regardless of which engine each one needs.
function addToCrateQueue(entries) {
  entries = (entries || []).filter(e => e && e.track && e.track.trackName);
  if (!entries.length) return;
  const label = entries.length > 1 ? `Added ${entries.length} tracks to queue` : `Added "${entries[0].track.trackName}" to queue`;

  // A crate queue is already driving playback (either "Play playlist" or an
  // earlier "Add to queue" run) — just extend the tail, the existing
  // end-of-track handoff naturally reaches these once it gets there.
  if (isPlayingCrateQueue() || ytPlayingForCrateQueue || scPlayingForCrateQueue) {
    crateQueueAppend(entries); // random positions among the unplayed tracks when shuffle is on
    flashGlobalToast(label);
    renderCrateQueuePanel();
    return;
  }

  const myId = ++crateQueueId;
  const spotifyIsPlaying = !!(spotifyLastState && !spotifyLastState.paused && spotifyCurrentTrackId);
  const youtubeIsPlaying = activePlayerEngine === 'youtube' && !ytIsPaused && ytQueue.length > 0;
  const soundcloudIsPlaying = activePlayerEngine === 'soundcloud' && !scIsPaused && scQueue.length > 0;

  if (spotifyIsPlaying || youtubeIsPlaying || soundcloudIsPlaying) {
    // Something is already playing outside of any queue (a direct "Play" on
    // a single track/album/video) — fold it in as the current entry so
    // when IT ends, the usual heuristic hands off into what's being queued
    // instead of just stopping. `item` stays null (never re-resolved, only
    // read for display — see renderCrateQueuePanel), and `track.trackName`
    // is filled from whichever engine is actually playing so the "Up Next"
    // panel's "Now playing" row shows the real title instead of a stand-in.
    const nowPlayingName = spotifyIsPlaying
      ? (currentSpotifyTrack ? currentSpotifyTrack.name : 'Currently playing')
      : soundcloudIsPlaying
        ? ((scQueue[scQueueIndex] && scQueue[scQueueIndex].trackName) || 'Currently playing')
        : ((ytQueue[ytQueueIndex] && ytQueue[ytQueueIndex].trackName) || 'Currently playing');
    crateQueueList = [{ item: null, track: { trackName: nowPlayingName } }, ...entries];
    crateQueueIndex = 0;
    if (state.shuffle) { ensureOrigSeq(crateQueueList); shuffleTail(crateQueueList, 0); } // the "already playing" placeholder stays first; what's queued behind it gets shuffled
    if (spotifyIsPlaying) {
      crateQueueExpectedSpotifyTrackId = spotifyCurrentTrackId;
    } else if (soundcloudIsPlaying) {
      scPlayingForCrateQueue = true;
    } else {
      ytPlayingForCrateQueue = true;
    }
    flashGlobalToast(label);
    renderCrateQueuePanel();
    return;
  }

  // Nothing else playing anywhere — queuing starts it right away.
  crateQueueList = entries;
  crateQueueIndex = -1;
  playCrateQueueIndex(myId, 0);
}

// Shows/hides each right-panel section independently — "Up Next",
// "Last.fm History", and "Track Info" can all be on at once and stack
// (see ⚙ → Panels configuration… → right panel). Called on init, whenever
// any checkbox there changes, and after fetchCatalog() refreshes
// state.scrobbles (a Last.fm sync happening while History is visible
// should update it).
// Right panel's element-driven equivalent of the old three independent
// booleans (rightPanelShowQueue/History/TrackInfo) — now entirely driven
// by state.panelLayout.right (which elements are assigned here, and in
// what order; see LAYOUT_ELEMENTS/renderLayoutConfigUI's drag-and-drop).
// Kept under this same name/signature since it already has four call
// sites elsewhere that just need the right panel refreshed, not rewired.
// The three booleans are kept too, as a read-only projection kept in sync
// here — every OTHER place in the file that already reads them (e.g.
// renderTrackInfoPanel's own early-return guard) keeps working unchanged,
// rather than needing every one of those checks individually rewritten to
// read state.panelLayout.right directly.
const RIGHT_PANEL_ELEMENT_NODES = {
  queue: () => el.rightPanelQueueSection,
  lastfmHistory: () => el.rightPanelHistorySection,
  trackInfo: () => el.rightPanelTrackInfoSection
};
function applyRightPanelSections() {
  const order = state.panelLayout.right;
  Object.keys(RIGHT_PANEL_ELEMENT_NODES).forEach(key => { RIGHT_PANEL_ELEMENT_NODES[key]().hidden = true; });
  order.forEach(key => {
    const node = RIGHT_PANEL_ELEMENT_NODES[key] && RIGHT_PANEL_ELEMENT_NODES[key]();
    if (!node) return;
    node.hidden = false;
    el.rightPanel.appendChild(node); // moves to the end — repeated in list order achieves the full reorder
  });
  applyPanelTabs('right', order, RIGHT_PANEL_ELEMENT_NODES, el.rightPanel);
  state.rightPanelShowQueue = order.includes('queue');
  state.rightPanelShowHistory = order.includes('lastfmHistory');
  state.rightPanelShowTrackInfo = order.includes('trackInfo');
  el.rightPanelEmptyMsg.hidden = order.length > 0;
  el.crateQueueClearBtn.hidden = !state.rightPanelShowQueue || !crateQueueList.length;
  if (state.rightPanelShowHistory) renderLastfmHistoryPanel();
  if (state.rightPanelShowTrackInfo) renderTrackInfoPanel();
}

// Global stacked-vs-tabs toggle (state.panelStackMode, ⚙ → Panels
// configuration… → layout — MusicBee's own "stack *" setting) applied to
// one panel at a time. In "stacked" mode, or with fewer than two elements
// assigned, this is a no-op beyond removing any leftover tab bar. In
// "tabs" mode with 2+ elements, only state.activeTabByPanel[panelKey]
// (defaulting to the first, and reset to it if it's no longer valid — an
// element got removed, say) actually stays visible; the rest are hidden
// on top of whatever the caller already set, and a small tab bar is
// injected at the very top of the panel to switch between them.
function applyPanelTabs(panelKey, order, nodeMap, containerEl) {
  let barEl = containerEl.querySelector(':scope > .panel-tab-bar');
  if (state.panelStackMode !== 'tabs' || order.length < 2) {
    if (barEl) barEl.remove();
    return;
  }
  if (!state.activeTabByPanel[panelKey] || !order.includes(state.activeTabByPanel[panelKey])) {
    state.activeTabByPanel[panelKey] = order[0];
  }
  const active = state.activeTabByPanel[panelKey];
  order.forEach(key => { const node = nodeMap[key] && nodeMap[key](); if (node) node.hidden = (key !== active); });
  if (!barEl) {
    barEl = document.createElement('div');
    barEl.className = 'panel-tab-bar';
    barEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.panel-tab-btn');
      if (!btn) return;
      state.activeTabByPanel[panelKey] = btn.dataset.element;
      savePrefs();
      applyPanelLayout();
    });
  }
  containerEl.insertBefore(barEl, containerEl.firstChild);
  barEl.innerHTML = order.map(key => `<button type="button" class="panel-tab-btn${key === active ? ' active' : ''}" data-element="${key}">${escapeHtml(LAYOUT_ELEMENTS[key].label)}</button>`).join('');
}

// Main panel's element-driven layout — Music View plus, when assigned
// here, Genre Description and/or Now Playing Bar (see LAYOUT_ELEMENTS).
// Music View itself is untouched by any of this — it's still the exact
// same grid/tracks/covers rendering as always, just now living inside a
// wrapper (#musicViewElement) that can be reordered relative to the other
// two rather than being this panel's one unconditional piece of content.
const MAIN_PANEL_ELEMENT_NODES = {
  musicView: () => el.musicViewElement,
  genreDesc: () => el.genreDescElement,
  chart: () => el.chartElement,
  artistBio: () => el.artistBioElement,
  nowPlayingBar: () => el.nowPlayingBarMainElement
};
function applyMainPanelLayout() {
  const order = state.panelLayout.main;
  Object.keys(MAIN_PANEL_ELEMENT_NODES).forEach(key => { MAIN_PANEL_ELEMENT_NODES[key]().hidden = true; });
  order.forEach(key => {
    const node = MAIN_PANEL_ELEMENT_NODES[key] && MAIN_PANEL_ELEMENT_NODES[key]();
    if (!node) return;
    node.hidden = false;
    el.mainPanel.appendChild(node);
  });
  applyPanelTabs('main', order, MAIN_PANEL_ELEMENT_NODES, el.mainPanel);
  if (order.includes('genreDesc')) renderGenreDescElement();
  if (order.includes('chart')) renderChartElement();
  if (order.includes('artistBio')) renderArtistBioElement();
  if (order.includes('nowPlayingBar')) refreshNowPlayingBarMain();
}

// Player Controls — the docked mini player (play/pause/seek/skip), now
// its own element distinct from the display-only Now Playing Bar (see
// LAYOUT_ELEMENTS' own comments on why that split exists). Only ever
// affects WHICH EDGE #miniPlayer docks to, never its visibility — that
// stays entirely governed by the existing playback-state logic, untouched
// by any of this, exactly the guarantee the previous version's bugfix
// established. Defaults to bottom if it's somehow in neither panel —
// loadPrefs' own migration already prevents that via a saved layout, but
// this is a second, independent line of defense against the player ever
// silently having nowhere to dock.
function applyPlayerControlsPosition() {
  const top = state.panelLayout.top.includes('playerControls');
  el.miniPlayer.classList.toggle('docked-top', top);
}

// Genre Description's actual content — a free-text blurb per genre,
// editable in place, shown only while that genre is filtered in the left
// panel (see applyFiltersSort's own hook into this). Text lives on the
// taxonomy entry itself (state.genreTaxonomy[key].description) and syncs
// through the exact same backend mechanism the rest of the taxonomy
// already does — nothing new needed there.
function renderGenreDescElement() {
  if (!el.genreDescElement || el.genreDescElement.hidden) return;
  if (!(state.navFilter && state.navFilter.mode === 'genre')) {
    el.genreDescLabel.textContent = 'Genre Description';
    el.genreDescInput.value = '';
    el.genreDescInput.placeholder = 'Select a genre in the left panel to write a description for it.';
    el.genreDescInput.disabled = true;
    el.genreDescSaveBtn.disabled = true;
    return;
  }
  const genre = state.navFilter.value;
  const key = genreTaxonomyKey(genre);
  el.genreDescLabel.textContent = `Genre Description \u2014 ${genre}`;
  el.genreDescInput.disabled = false;
  el.genreDescSaveBtn.disabled = false;
  el.genreDescInput.placeholder = `Write a description for ${genre}\u2026`;
  el.genreDescInput.value = (state.genreTaxonomy[key] && state.genreTaxonomy[key].description) || '';
}

// Artist Information — modeled on MusicBee's own Music Explorer (an artist
// stats header above that artist's own releases, shown whenever an artist
// filter is active). Play count combines logged Diary listens and
// imported Last.fm scrobbles — both represent a real logged play of
// something by this artist, so a user asking "how many plays" would want
// the total regardless of which mechanism recorded it. Album/track counts
// are scoped to what's actually in this crate, not an external
// discography — "all the releases that belong to the artist" meant what's
// owned here, same as the Music View grid itself shows once filtered.
function computeArtistStats(artistName) {
  const albums = state.raw.filter(r => r.artist === artistName);
  // trackTitlesFor only knows MANUALLY entered tracklists; once a release's real tracklist has been
  // fetched (the Artist Information page does that in the background) it's in trackCache, so take
  // whichever is larger rather than undercounting every release that wasn't typed in by hand.
  const trackCount = albums.reduce((sum, a) => sum + Math.max(trackTitlesFor(a).length, (state.trackCache[artKey(a)] || []).length), 0);
  const diaryPlays = state.diary.filter(d => d.artist === artistName).length;
  const scrobblePlays = state.scrobbles.filter(s => s.artist === artistName).reduce((sum, s) => sum + (s.playCount || 1), 0);
  return { albumCount: albums.length, trackCount, totalPlays: diaryPlays + scrobblePlays };
}

// Artist Information — genuine browser-style tabs (Firefox/Chrome, per
// the reference), not one fixed tab reused for whichever artist was
// clicked most recently. Each artist you open gets its own entry in
// state.artistInfoTabs, independently closeable, same as MusicBee's own
// several simultaneous "Music Explorer" tabs — the Music tab itself is
// left completely untouched by any of this, its own filter/view state
// independent the whole time.
function renderArtistInfoTabButtons() {
  el.artistInfoTabsContainer.innerHTML = state.artistInfoTabs.map(artist => `
    <button type="button" class="nav-tab artist-info-tab-btn${artist === state.activeArtistInfoTab && state.activeTab === 'artistInfo' ? ' active' : ''}" data-artist="${escapeHtml(artist)}">
      <span class="artist-info-tab-label">${escapeHtml(artist)}</span>
      <span class="artist-info-tab-close" data-artist="${escapeHtml(artist)}" title="Close" aria-label="Close ${escapeHtml(artist)} tab">\u00d7</span>
    </button>
  `).join('');
  updateTabHistoryButtons(); // an artist tab opening/closing changes which history entries are still reachable
}

/* ---------- Artist Information page ----------
   The page behind each artist tab (see openArtistInfoTab), modeled on
   MusicBee's "Music Explorer": an artist list on the left; for the chosen
   artist a header (photo, name, ▶ to play everything, "N plays · N albums/
   N tracks", the decade and main genre) over four sub-tabs:

     Albums & Stats   the releases you own, plus a Top Tracks list with play
                      counts (scrobbles per track) and the total.
     More Albums      the artist's full discography from MusicBrainz, owned
                      releases marked, the rest one click from "+ Add".
     Profile          a biography and photo from Wikipedia (found through the
                      artist's MusicBrainz links), plus Top Tracks.
     Similar Artists  other artists IN YOUR CRATE ranked by how much their
                      genres overlap — a taxonomy-aware comparison, so it
                      needs no external service or API key.

   What it deliberately reuses rather than reimplements: fetchArtistDiscography
   (MusicBrainz matching, same-named-artist disambiguation, caching), the card
   artwork system (images carry data-key and applyCachedArtFor fills them),
   openTrackContextMenu / openAlbumCardContextMenu, playAlbumsReplacingQueue.
   The older ARTIST tab is untouched.

   Async work (tracklists, discography, profile) can finish after the person has
   moved on, so every continuation checks it's still the artist/sub-tab being
   shown (aiBodyToken, and state.activeArtistInfoTab) before painting. */
const ARTIST_PROFILE_CACHE_KEY = 'crate_artist_profile_cache_v1';
const ARTIST_PROFILE_TTL_MS = { ok: 30 * 86400000, none: 7 * 86400000 }; // transient failures are never cached
let aiBodyToken = 0;
let aiRowsShown = [];            // the track rows currently on screen — click handlers index into this
let aiAmbiguousResult = null;    // the MusicBrainz "which artist is this?" options currently on screen
let aiClickTimer = null;         // single-click vs double-click on an album tile
const aiExternal = new Map();    // artist.toLowerCase() -> { profile, promise }
const aiTracksLoading = new Set();

function aiOwned(artist) {
  return state.raw.filter(r => r.artist === artist).sort((a, b) => {
    const da = dateVal(a.releaseDate), db = dateVal(b.releaseDate);
    if (da === db) return a.title.localeCompare(b.title);
    if (da === -Infinity) return 1;           // undated last
    if (db === -Infinity) return -1;
    return da - db;
  });
}
function aiYear(item) { const ms = dateVal(item.releaseDate); return ms === -Infinity ? '' : new Date(ms).getUTCFullYear(); }
function aiSubTab(artist) { return state.artistInfoSubTab[artist] || 'stats'; }
function aiExt(artist) {
  const k = artist.toLowerCase();
  if (!aiExternal.has(k)) aiExternal.set(k, { profile: null, promise: null });
  return aiExternal.get(k);
}
function aiClock(ms) { if (!ms) return ''; const t = Math.round(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
function aiShowing(artist) { return state.activeTab === 'artistInfo' && state.activeArtistInfoTab === artist; }

// ----- artwork (shares the card system: img.art + data-key) -----
function aiArtSrc(item) { const c = state.artCache[artKey(item)]; return (c && c.art) || item.cover || placeholderArt(item); }
function aiArtImg(item, cls) { return `<img class="art ${cls}" data-key="${escapeHtml(artKey(item))}" src="${escapeHtml(aiArtSrc(item))}" alt="" loading="lazy">`; }
// Same "make sure this item's art is at least requested" guard buildCard uses.
function aiTouchArt(items) {
  items.forEach(it => {
    const key = artKey(it), c = state.artCache[key];
    const need = it.cover ? (!c || c.art !== it.cover) : !c;
    if (need && !artFetchInFlight.has(key)) { artFetchInFlight.add(key); fetchArt(it); }
  });
}

// The REAL genre tags on a release. getGenreList returns the placeholder ['Unknown'] for a release
// with no genre at all — right for the genre sidebar, wrong here: two untagged artists would then
// "share" the genre Unknown and rank as identical, and the header would read "2000s · Unknown".
function aiGenresOf(r) { const g = combinedGenreStr(r); return g.trim() ? getGenreList(g) : []; }

// ----- the two header facts: "1970s · Freak Folk" -----
function aiDecadeGenreLabel(owned) {
  const decades = new Map();
  owned.forEach(r => { const y = aiYear(r); if (y === '') return; const d = Math.floor(y / 10) * 10; decades.set(d, (decades.get(d) || 0) + 1); });
  let decade = null, best = 0;
  [...decades.entries()].sort((a, b) => a[0] - b[0]).forEach(([d, n]) => { if (n > best) { best = n; decade = d; } }); // ties go to the earlier decade
  const genres = new Map();
  owned.forEach(r => aiGenresOf(r).forEach((g, i) => {
    const k = genreTaxonomyKey(g), cur = genres.get(k) || { label: g, w: 0 };
    cur.w += genrePositionWeight(i); genres.set(k, cur);
  }));
  const top = [...genres.values()].sort((a, b) => b.w - a.w)[0];
  return [decade != null ? `${decade}s` : '', top ? top.label : ''].filter(Boolean).join(' \u00b7 ');
}
function aiStatsText(artist) {
  const s = computeArtistStats(artist);
  return `${s.totalPlays} play${s.totalPlays === 1 ? '' : 's'} \u00b7 ${s.albumCount} album${s.albumCount === 1 ? '' : 's'}/ ${s.trackCount} track${s.trackCount === 1 ? '' : 's'}`;
}

// ----- left list -----
function aiRenderSidebar(current) {
  const list = el.aiArtistList;
  if (!list) return;
  const q = (el.aiArtistFilter.value || '').trim().toLowerCase();
  const byArtist = new Map();
  state.raw.forEach(r => { if (!byArtist.has(r.artist)) byArtist.set(r.artist, []); byArtist.get(r.artist).push(r); });
  // Same ordering rule as the Music tab's Artists list (state.leftSort: Name A-Z, or Highest Count then name).
  const names = [...byArtist.keys()].filter(n => !q || n.toLowerCase().includes(q))
    .sort(state.leftSort === 'count' ? (a, b) => byArtist.get(b).length - byArtist.get(a).length || a.localeCompare(b) : (a, b) => a.localeCompare(b));
  const prev = list.scrollTop;
  // The list takes the same size class the Music list does, so the Thumbnails setting (none … XX-large) applies here too.
  list.className = 'left-list thumb-' + state.leftThumbSize;
  // The row is buildLeftRow's 'artist' row, class for class: round thumbnail, name, count pill (showing the
  // "N of M (x%)" coverage badge once that artist's MusicBrainz discography has been counted, exactly as there).
  list.innerHTML = names.length ? names.map(n => {
    const rel = byArtist.get(n), first = rel[0], cached = state.artistDiscogCache[n.toLowerCase()];
    const countText = (cached && cached.total != null) ? formatCoverageBadge(rel.length, cached.total) : rel.length;
    return `<div class="left-row ai-artist-row${n === current ? ' active' : ''}" role="listitem" tabindex="0" data-artist="${escapeHtml(n)}">
      <img class="left-thumb left-thumb-round art" data-key="${escapeHtml(artKey(first))}" src="${escapeHtml(aiArtSrc(first))}" alt="">
      <div class="left-row-text"><p class="left-row-title">${escapeHtml(n)}</p></div>
      <span class="left-row-count">${countText}</span>
    </div>`;
  }).join('') : '<p class="ai-empty">No artists match.</p>';
  list.scrollTop = prev;
  const a = list.querySelector('.ai-artist-row.active');   // keep the current artist in view, scrolling only the list itself
  if (a) {
    if (a.offsetTop < list.scrollTop) list.scrollTop = a.offsetTop;
    else if (a.offsetTop + a.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = a.offsetTop + a.offsetHeight - list.clientHeight;
  }
}

// ----- header -----
function aiSetAvatar(artist, owned) {
  const img = el.aiAvatar, prof = aiExt(artist).profile;
  img.dataset.fallback = '';
  if (prof && prof.status === 'ok' && prof.thumb) {
    img.classList.remove('art'); img.removeAttribute('data-key');
    if (img.src !== prof.thumb) img.src = prof.thumb;
  } else if (owned.length) {
    img.classList.add('art'); img.dataset.key = artKey(owned[0]); img.src = aiArtSrc(owned[0]);
  } else {
    img.classList.remove('art'); img.removeAttribute('data-key'); img.src = placeholderArt({ artist });
  }
}
function aiRenderHeader(artist, owned) {
  el.artistInfoName.textContent = artist;
  el.artistInfoStats.textContent = aiStatsText(artist);
  el.aiDecadeGenre.textContent = aiDecadeGenreLabel(owned);
  el.aiPlayBtn.disabled = !owned.length;
  el.aiExportBtn.disabled = !owned.length;
  aiSetAvatar(artist, owned);
  aiRefreshNowPlaying();
}
// "playing now:" — shown when what's loaded in the player is by this artist.
function aiRefreshNowPlaying() {
  if (!el.aiNowPlaying) return;
  const artist = state.activeArtistInfoTab;
  let text = '';
  if (artist && aiShowing(artist) && !el.miniPlayer.hidden) {
    const np = resolveNowPlayingForMenu();
    const sp = activePlayerEngine === 'spotify' ? currentSpotifyTrack : null;
    const who = np.item ? np.item.artist : ((sp && sp.artists && sp.artists[0] && sp.artists[0].name) || '');
    if (np.trackName && who && normMatchKey(who) === normMatchKey(artist)) text = `playing now: ${np.trackName}`;
  }
  el.aiNowPlaying.textContent = text;
}

// ----- tracks & play counts -----
function aiTrackRows(artist) {
  const rows = [];
  aiOwned(artist).forEach(item => {
    let tracks = state.trackCache[artKey(item)];
    if (!tracks && isManualAlbum(item)) tracks = item.manualTracks.map(t => ({ trackNumber: t.trackNumber, trackName: t.title, trackTimeMillis: t.durationMs || null }));
    (tracks || []).forEach(t => rows.push({
      item, trackName: t.trackName, trackNum: t.trackNumber != null ? t.trackNumber : '', ms: t.trackTimeMillis || 0,
      order: rows.length, plays: trackScrobbleCountFor(item.artist, item.title, t.trackName)
    }));
  });
  return rows;
}
function aiSortedRows(artist) {
  const rows = aiTrackRows(artist);
  if (state.artistInfoTrackSort === 'plays') rows.sort((a, b) => b.plays - a.plays || a.order - b.order);
  return rows;
}
// Real tracklists for releases that haven't had theirs fetched yet (a manually
// typed one needs no lookup; the rest hit iTunes/MusicBrainz via getTracksFor,
// which caches). Two at a time, repainting as each pair lands.
async function aiEnsureTracks(artist) {
  const missing = aiOwned(artist).filter(it => !state.trackCache[artKey(it)]);
  if (!missing.length || aiTracksLoading.has(artist)) return;
  aiTracksLoading.add(artist);
  try {
    for (let i = 0; i < missing.length; i += 2) {
      await Promise.all(missing.slice(i, i + 2).map(it => withHardTimeout(getTracksFor(it), 15000, []).catch(() => [])));
      if (!aiShowing(artist)) break;   // moved on — the rest loads next time
      aiRefreshTrackViews(artist);
    }
  } finally { aiTracksLoading.delete(artist); }
  if (aiShowing(artist)) aiRefreshTrackViews(artist);
}
function aiRefreshTrackViews(artist) {
  el.artistInfoStats.textContent = aiStatsText(artist);
  const sub = aiSubTab(artist);
  if (sub === 'stats') aiRenderTopTracks(artist);
  else if (sub === 'profile') aiRenderProfileTracks(artist);
}
function aiTrackRowHtml(r, i, withAlbum) {
  return `<div class="ai-track-row${withAlbum ? ' wide' : ''}" data-i="${i}" title="Double-click to play \u00b7 right-click for more">
    <span class="ai-track-name">${escapeHtml(r.trackName)}</span>
    ${withAlbum ? `<span class="ai-track-album">${escapeHtml(r.item.title)}</span><span class="ai-track-time">${aiClock(r.ms)}</span>` : ''}
    <span class="ai-track-plays${r.plays ? '' : ' zero'}">${r.plays}</span>
  </div>`;
}
function aiRenderTopTracks(artist) {
  const box = document.getElementById('aiTopTracks');
  if (!box) return;
  const rows = aiSortedRows(artist);
  const limit = state.artistInfoShowAllTracks ? Infinity : 12;
  aiRowsShown = rows.slice(0, limit);
  box.innerHTML = aiRowsShown.length
    ? aiRowsShown.map((r, i) => aiTrackRowHtml(r, i, false)).join('')
      + (rows.length > 12 ? `<button type="button" class="ai-link-btn ai-more-btn" data-ai-action="${state.artistInfoShowAllTracks ? 'showFewerTracks' : 'showAllTracks'}">${state.artistInfoShowAllTracks ? 'Show fewer' : `Show all ${rows.length} tracks`}</button>` : '')
    : `<p class="ai-empty">${aiTracksLoading.has(artist) ? 'Loading tracks\u2026' : 'No tracklists known for these releases yet.'}</p>`;
  const t = document.getElementById('aiTotalPlays');
  if (t) t.textContent = computeArtistStats(artist).totalPlays;
}

// ----- Albums & Stats -----
function aiStatsBodyHtml(owned) {
  const tiles = owned.length ? owned.map(it => `
    <div class="ai-album" data-row="${escapeHtml(String(it.row))}" tabindex="0" title="Click to open \u00b7 double-click to play \u00b7 right-click for more">
      <div class="ai-cover">${aiArtImg(it, 'ai-cover-img')}${linkFlagHtml(it)}</div>
      <div class="ai-album-title">${escapeHtml(it.title)}</div>
      <div class="ai-album-year">${aiYear(it)}</div>
    </div>`).join('') : '<p class="ai-empty">No releases by this artist are in your crate.</p>';
  return `<div class="ai-stats-layout">
    <div id="artistInfoGrid" class="ai-album-grid">${tiles}</div>
    <aside class="ai-top-tracks">
      <label class="ai-top-head"><select id="aiTrackSort" aria-label="Order of the track list">
        <option value="plays">Top tracks</option><option value="album">Album order</option></select></label>
      <div id="aiTopTracks" class="ai-track-list"></div>
      <div class="ai-total"><span>TOTAL PLAY COUNT</span><span id="aiTotalPlays"></span></div>
    </aside>
  </div>`;
}

// ----- More Albums (MusicBrainz discography) -----
async function aiRenderAlbumsTab(artist, owned, token) {
  el.aiBody.innerHTML = `<div class="ai-albums-head"><h3 class="ai-h3">${escapeHtml(artist)} Albums</h3>
      <div class="ai-albums-tools"><button type="button" class="ai-link-btn" data-ai-action="toggleAllTypes">${state.artistShowAllTypes ? 'Albums &amp; EPs only' : 'Show everything (singles, comps\u2026)'}</button><span id="aiMbLink"></span></div></div>
    <div id="aiRgGrid" class="ai-album-grid"><p class="ai-empty">Looking up ${escapeHtml(artist)}\u2019s discography on MusicBrainz\u2026</p></div>`;
  const ownedKeys = new Set(owned.map(r => lastfmNormKey(artist, r.title)));
  const result = await fetchArtistDiscography(artist, ownedKeys, state.artistShowAllTypes);
  if (token !== aiBodyToken) return;               // sub-tab or artist changed while that was in flight
  const grid = document.getElementById('aiRgGrid');
  if (!grid) return;
  if (result.items == null && !result.ambiguous) {   // ambiguous results carry no items either — see the same fix in renderArtistDetail
    grid.innerHTML = '<div class="ai-note"><p>Couldn\u2019t reach MusicBrainz right now \u2014 try again in a moment.</p><button type="button" class="config-btn" data-ai-action="retryAlbums">Retry</button></div>';
    return;
  }
  if (result.ambiguous) {
    aiAmbiguousResult = result;
    grid.innerHTML = `<div class="ai-note"><p>More than one artist named \u201c${escapeHtml(artist)}\u201d has releases on MusicBrainz \u2014 which one is this?</p>` +
      result.options.map(opt => {
        const sample = opt.items.slice(0, 3).map(it => it.title).join(', ');
        return `<div class="ai-disambig"><div class="ai-disambig-desc">${escapeHtml(opt.disambiguation || 'No description on MusicBrainz')}</div>
          <div class="ai-disambig-sample">${opt.items.length} release${opt.items.length === 1 ? '' : 's'} \u2014 e.g. ${escapeHtml(sample)}${opt.items.length > 3 ? ', \u2026' : ''}</div>
          <button type="button" class="config-btn" data-ai-action="pickMbid" data-mbid="${escapeHtml(opt.mbid)}">Use this one</button></div>`;
      }).join('') + '</div>';
    return;
  }
  const mb = document.getElementById('aiMbLink');
  if (mb && result.mbid) mb.innerHTML = `<a class="ai-link-btn" href="https://musicbrainz.org/artist/${escapeHtml(result.mbid)}" target="_blank" rel="noopener noreferrer">MusicBrainz \u2197</a>`;
  if (!result.items.length) {
    const why = result.mbid ? 'No albums or EPs found on MusicBrainz for this artist.' : `${escapeHtml(artist)} isn\u2019t on MusicBrainz under this name, so there\u2019s no discography to show.`;
    grid.innerHTML = `<div class="ai-note"><p>${why}</p><button type="button" class="config-btn" data-ai-action="manualAdd">+ Add a release manually</button></div>`;
    return;
  }
  const ownedByKey = new Map(owned.map(r => [lastfmNormKey(artist, r.title), r]));
  const reset = loadArtistMbidChoice(artist) ? `<div class="ai-note ai-note-inline"><button type="button" class="ai-link-btn" data-ai-action="resetMatch">Not the right ${escapeHtml(artist)}? Reset match</button></div>` : '';
  grid.innerHTML = reset + result.items.map(w => {
    const match = ownedByKey.get(lastfmNormKey(artist, w.title));
    const cover = match ? aiArtImg(match, 'ai-cover-img')
      : `<img class="ai-cover-img ai-caa" loading="lazy" alt="" src="https://coverartarchive.org/release-group/${escapeHtml(w.id)}/front-250">`;
    return `<div class="ai-album ai-rg${match ? ' owned' : ''}" data-rg="${escapeHtml(w.id)}" data-title="${escapeHtml(w.title)}" data-type="${escapeHtml(w.type || '')}" data-year="${escapeHtml(w.year || '')}" tabindex="0"
        title="${match ? 'In your crate \u2014 click to open' : 'Not in your crate \u2014 click to search Spotify'}">
      <div class="ai-cover">${cover}${match ? '<span class="ai-owned-badge" title="In your crate">\u25cf</span>' : ''}</div>
      <div class="ai-album-title">${escapeHtml(w.title)}</div>
      <div class="ai-album-year">${w.year || '\u2014'}${w.type && w.type !== 'Album' ? ` \u00b7 ${escapeHtml(w.type)}` : ''}</div>
      ${match ? '' : '<button type="button" class="ai-add-btn" data-ai-action="addRg">+ Add</button>'}
    </div>`;
  }).join('');
}

// ----- Profile (Wikipedia, found through MusicBrainz) -----
function aiLoadProfileCache(mbid) {
  try {
    const e = (JSON.parse(localStorage.getItem(ARTIST_PROFILE_CACHE_KEY) || '{}'))[mbid];
    if (!e || !e.data) return null;
    const ttl = ARTIST_PROFILE_TTL_MS[e.data.status];
    return ttl && Date.now() - e.at < ttl ? e.data : null;
  } catch (err) { return null; }
}
function aiSaveProfileCache(mbid, data) {
  try {
    const all = JSON.parse(localStorage.getItem(ARTIST_PROFILE_CACHE_KEY) || '{}');
    all[mbid] = { at: Date.now(), data };
    const keys = Object.keys(all);
    if (keys.length > 120) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 120).forEach(k => delete all[k]);
    localStorage.setItem(ARTIST_PROFILE_CACHE_KEY, JSON.stringify(all));
  } catch (err) { /* storage unavailable/full — it just won't be cached */ }
}
// MusicBrainz artist -> its Wikipedia page. MusicBrainz links to Wikipedia
// directly for some artists and via Wikidata for most; both are handled. The
// match comes from MusicBrainz's own link, never a text search, so a common
// name can't pull in a different person's biography. Returns {status:'ok'|'none'|'error'}.
async function fetchArtistProfile(mbid) {
  const cached = aiLoadProfileCache(mbid);
  if (cached) return cached;
  try {
    const mbRes = await mbFetch(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`, { headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' } });
    if (!mbRes.ok) return { status: 'error' };
    const rels = ((await mbRes.json()).relations || []).filter(r => r.url && r.url.resource);
    let title = null;
    const wp = rels.find(r => r.type === 'wikipedia' && /^https?:\/\/en\.wikipedia\.org\/wiki\//.test(r.url.resource));
    if (wp) title = decodeURIComponent(wp.url.resource.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, '').split('#')[0]).replace(/_/g, ' ');
    if (!title) {
      const wd = rels.find(r => r.type === 'wikidata');
      const q = wd && wd.url.resource.match(/\/(Q\d+)$/);
      if (q) {
        const wRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${q[1]}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`);
        if (!wRes.ok) return { status: 'error' };
        const ent = ((await wRes.json()).entities || {})[q[1]];
        title = ent && ent.sitelinks && ent.sitelinks.enwiki && ent.sitelinks.enwiki.title;
      }
    }
    if (!title) { const none = { status: 'none' }; aiSaveProfileCache(mbid, none); return none; }
    const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts%7Cpageimages&exintro=1&explaintext=1&redirects=1&piprop=thumbnail&pithumbsize=640&format=json&origin=*&titles=' + encodeURIComponent(title);
    const res = await fetch(url);
    if (!res.ok) return { status: 'error' };
    const pages = ((await res.json()).query || {}).pages || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined || !page.extract) { const none = { status: 'none' }; aiSaveProfileCache(mbid, none); return none; }
    const ok = { status: 'ok', title: page.title, extract: page.extract, thumb: (page.thumbnail && page.thumbnail.source) || '', url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_')) };
    aiSaveProfileCache(mbid, ok);
    return ok;
  } catch (err) { return { status: 'error' }; }
}
// Finds the MusicBrainz id (through the same discography lookup the More Albums
// tab uses, which also settles same-named artists) and then the profile.
function aiEnsureProfile(artist) {
  const ext = aiExt(artist);
  if (ext.profile && ext.profile.status !== 'error') return Promise.resolve();
  if (!ext.promise) {
    ext.promise = (async () => {
      const owned = aiOwned(artist);
      const disco = await fetchArtistDiscography(artist, new Set(owned.map(r => lastfmNormKey(artist, r.title))), false);
      if (disco.ambiguous) return { status: 'ambiguous' };      // checked first: an ambiguous result has no items either
      if (disco.items == null) return { status: 'error' };
      if (!disco.mbid) return { status: 'unmatched' };          // MusicBrainz has no artist by this name
      return { ...(await fetchArtistProfile(disco.mbid)), mbid: disco.mbid };
    })().then(p => { ext.profile = p; return p; }).finally(() => { ext.promise = null; });
  }
  return ext.promise.then(() => {
    aiRefreshBioElement(artist);       // the Main-panel biography strip, if it's showing this artist
    if (!aiShowing(artist)) return;
    aiSetAvatar(artist, aiOwned(artist));
    if (aiSubTab(artist) === 'profile') aiRenderBody(artist);
  });
}
function aiBioHtml(text) {
  return text.split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('');
}
function aiProfileTracksHtml(artist) {
  const rows = aiSortedRows(artist).slice(0, 5);
  aiRowsShown = rows;
  return rows.length ? rows.map((r, i) => aiTrackRowHtml(r, i, true)).join('')
    : `<p class="ai-empty">${aiTracksLoading.has(artist) ? 'Loading tracks\u2026' : 'No tracklists known for these releases yet.'}</p>`;
}
function aiRenderProfileTracks(artist) {
  const box = document.getElementById('aiProfileTracks');
  if (box) box.innerHTML = aiProfileTracksHtml(artist);
}
function aiRenderProfileTab(artist, owned) {
  const prof = aiExt(artist).profile;
  const fallbackCover = owned.length ? `<div class="ai-hero">${aiArtImg(owned[0], 'ai-hero-img')}</div>` : '';
  let top;
  if (!prof) {
    top = `${fallbackCover}<div class="ai-bio"><h3 class="ai-h3">${escapeHtml(artist)}</h3><p class="ai-empty">Loading biography\u2026</p></div>`;
  } else if (prof.status === 'ok') {
    const hero = prof.thumb ? `<div class="ai-hero"><img class="ai-hero-img ai-wiki-img" src="${escapeHtml(prof.thumb)}" alt=""></div>` : fallbackCover;
    top = `${hero}<div class="ai-bio"><h3 class="ai-h3">${escapeHtml(artist)}</h3>
      <div id="aiBioText" class="ai-bio-text">${aiBioHtml(prof.extract)}</div>
      <button type="button" id="aiReadMore" class="ai-link-btn" data-ai-action="readMore" hidden>Read More\u2026</button>
      <p class="ai-bio-source">Text from <a href="${escapeHtml(prof.url)}" target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA)</p></div>`;
  } else {
    const q = encodeURIComponent(artist);
    let msg, extra = '';
    if (prof.status === 'ambiguous') { msg = `More than one artist named \u201c${escapeHtml(artist)}\u201d is on MusicBrainz, so there\u2019s no way to know whose biography to show.`; extra = '<button type="button" class="config-btn" data-ai-action="gotoAlbums">Choose the right one in More Albums</button>'; }
    else if (prof.status === 'error') { msg = 'Couldn\u2019t reach the biography sources right now.'; extra = '<button type="button" class="config-btn" data-ai-action="retryProfile">Retry</button>'; }
    else if (prof.status === 'unmatched') { msg = `${escapeHtml(artist)} isn\u2019t on MusicBrainz under this name, so there\u2019s no biography source to look in.`; extra = `<a class="ai-link-btn" href="https://en.wikipedia.org/w/index.php?search=${q}" target="_blank" rel="noopener noreferrer">Search Wikipedia \u2197</a>`; }
    else { msg = `No Wikipedia page is linked to ${escapeHtml(artist)} on MusicBrainz.`; extra = `<a class="ai-link-btn" href="https://en.wikipedia.org/w/index.php?search=${q}" target="_blank" rel="noopener noreferrer">Search Wikipedia \u2197</a>`; }
    top = `${fallbackCover}<div class="ai-bio"><h3 class="ai-h3">${escapeHtml(artist)}</h3><div class="ai-note"><p>${msg}</p>${extra}</div></div>`;
  }
  el.aiBody.innerHTML = `<div class="ai-profile"><div class="ai-profile-top">${top}</div>
    <div class="ai-profile-tracks-wrap"><div class="ai-section-row"><h3 class="ai-h3">Top Tracks</h3><button type="button" class="ai-link-btn" data-ai-action="gotoStats">View All \u203a</button></div>
    <div id="aiProfileTracks" class="ai-track-list">${aiProfileTracksHtml(artist)}</div></div></div>`;
  const bio = document.getElementById('aiBioText'), more = document.getElementById('aiReadMore');
  if (bio && more && bio.scrollHeight > bio.clientHeight + 2) more.hidden = false;   // only offer "Read More" when the text is actually clipped
}

// ----- Similar Artists (within your own crate) -----
let aiVectorCache = { raw: null, tax: null, rawN: -1, taxN: -1, map: null };
// One genre-weight vector per artist: each genre counts by the position it holds
// on the release (first = 1, second = 1/2 … the same convention as everywhere
// else), its ancestors in the genre tree count half as much, and a shared
// scene/movement counts too. Normalised so a prolific artist doesn't dominate.
function aiArtistVectors() {
  const c = aiVectorCache, taxN = Object.keys(state.genreTaxonomy || {}).length;
  if (c.map && c.raw === state.raw && c.tax === state.genreTaxonomy && c.rawN === state.raw.length && c.taxN === taxN) return c.map;
  const map = new Map();
  state.raw.forEach(r => {
    if (!map.has(r.artist)) map.set(r.artist, { v: new Map(), labels: new Map(), first: r });
    const e = map.get(r.artist);
    const add = (key, label, w) => { e.v.set(key, (e.v.get(key) || 0) + w); if (!e.labels.has(key)) e.labels.set(key, label); };
    aiGenresOf(r).forEach((g, i) => {
      const w = genrePositionWeight(i);
      add(genreTaxonomyKey(g), g, w);
      getGenreAncestors(state.genreTaxonomy, g).forEach(a => add(genreTaxonomyKey(a), a, w * 0.5));
    });
    [['scene', r.scene], ['movement', r.movement]].forEach(([kind, val]) => { if (val && String(val).trim()) add(`${kind}:${String(val).trim().toLowerCase()}`, `${capitalize(kind)}: ${String(val).trim()}`, 0.75); });
  });
  map.forEach(e => { let sum = 0; e.v.forEach(x => { sum += x; }); if (sum > 0) e.v.forEach((x, k) => e.v.set(k, x / sum)); });
  aiVectorCache = { raw: state.raw, tax: state.genreTaxonomy, rawN: state.raw.length, taxN, map };
  return map;
}
function aiSimilarArtists(artist, limit = 16) {
  const vecs = aiArtistVectors(), me = vecs.get(artist);
  if (!me || !me.v.size) return null;                 // nothing tagged to compare on
  const out = [];
  vecs.forEach((o, name) => {
    if (name === artist) return;
    let score = 0; const shared = [];
    me.v.forEach((w, k) => { const m = Math.min(w, o.v.get(k) || 0); if (m > 0) { score += m; shared.push([m, o.labels.get(k) || me.labels.get(k)]); } });
    if (score >= 0.05) out.push({ name, score, first: o.first, shared: shared.sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]) });
  });
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
function aiRenderSimilarTab(artist) {
  const sim = aiSimilarArtists(artist);
  let inner;
  if (sim === null) inner = '<p class="ai-empty">Tag this artist\u2019s releases with genres to find similar artists in your crate.</p>';
  else if (!sim.length) inner = `<p class="ai-empty">No other artist in your crate shares enough genres with ${escapeHtml(artist)} yet.</p>`;
  else inner = `<div class="ai-album-grid ai-sim-grid">${sim.map(s => `
    <div class="ai-album ai-sim" data-ai-action="openArtist" data-artist="${escapeHtml(s.name)}" tabindex="0" title="${Math.round(s.score * 100)}% genre overlap">
      <div class="ai-cover ai-cover-round">${aiArtImg(s.first, 'ai-cover-img')}</div>
      <div class="ai-album-title">${escapeHtml(s.name)}</div>
      <div class="ai-album-year">${escapeHtml(s.shared.join(', '))}</div>
    </div>`).join('')}</div>`;
  el.aiBody.innerHTML = `<div class="ai-albums-head"><h3 class="ai-h3">Similar to ${escapeHtml(artist)}</h3><span class="ai-sub-note">In your crate \u00b7 by genre overlap</span></div>${inner}<div id="aiBeyond" class="ai-beyond"></div>`;
  aiRenderBeyondCrate(artist, aiBodyToken);   // aiRenderBody bumped the token just before calling this
}

// ----- Beyond your crate (Last.fm) -----
// "People who listen to X also listen to…" from Last.fm's artist.getSimilar, minus anything you
// already own — the one real taste-matching signal still available (Spotify's related-artists and
// recommendations endpoints are closed to new apps). Uses the API key already saved for the Last.fm
// import. It's a READ-ONLY method, so it needs only the key — not the signed, write-capable
// lastfmApiCall, which also swallows the error reason; here "key rejected", "artist unknown" and
// "unreachable" each need their own message. Opened lazily (only with the Similar Artists tab) and cached.
const LASTFM_SIMILAR_CACHE_KEY = 'crate_lastfm_similar_cache_v1';
const LASTFM_SIMILAR_TTL_MS = 14 * 86400000;
const aiBeyondMem = new Map();    // artist.toLowerCase() -> result, this session
const aiBeyondFlight = new Map(); // artist.toLowerCase() -> the request currently in flight, so concurrent callers share it
const aiBeyondArt = new Map();    // artist.toLowerCase() -> picture URL, or '' when looked up and none found
let aiBeyondArtChain = Promise.resolve();

function aiLoadSimilarCache(artist) {
  try {
    const e = JSON.parse(localStorage.getItem(LASTFM_SIMILAR_CACHE_KEY) || '{}')[artist.toLowerCase()];
    return e && Date.now() - e.at < LASTFM_SIMILAR_TTL_MS ? e.data : null;
  } catch (err) { return null; }
}
function aiSaveSimilarCache(artist, data) {
  try {
    const all = JSON.parse(localStorage.getItem(LASTFM_SIMILAR_CACHE_KEY) || '{}');
    all[artist.toLowerCase()] = { at: Date.now(), data };
    const keys = Object.keys(all);
    if (keys.length > 80) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 80).forEach(k => delete all[k]);
    localStorage.setItem(LASTFM_SIMILAR_CACHE_KEY, JSON.stringify(all));
  } catch (err) { /* storage unavailable/full — just not cached */ }
}
// -> { status: 'ok', artists: [{name, match, url}] } | 'nokey' | 'badkey' | 'notfound' | 'error'.
// Only 'ok' and 'notfound' are cached: a missing/rejected key or a network failure must be retried
// the moment it's fixed, not remembered for two weeks.
function fetchLastfmSimilar(artist) {
  // Re-rendering the tab (e.g. clicking the sub-tab you're already on) re-asks before the first answer
  // has arrived; for anything not cached — a rejected key, a failure — that was two identical requests
  // for the same artist at once. Callers now share the one in flight.
  const k = artist.toLowerCase();
  if (aiBeyondFlight.has(k)) return aiBeyondFlight.get(k);
  const p = fetchLastfmSimilarOnce(artist).finally(() => aiBeyondFlight.delete(k));
  aiBeyondFlight.set(k, p);
  return p;
}
async function fetchLastfmSimilarOnce(artist) {
  const k = artist.toLowerCase();
  if (aiBeyondMem.has(k)) return aiBeyondMem.get(k);
  const apiKey = (loadLastfmCreds().apiKey || '').trim();
  if (!apiKey) return { status: 'nokey' };
  const cached = aiLoadSimilarCache(artist);
  if (cached) { aiBeyondMem.set(k, cached); return cached; }
  try {
    const res = await fetch('https://ws.audioscrobbler.com/2.0/?' + new URLSearchParams({ method: 'artist.getsimilar', artist, api_key: apiKey, autocorrect: '1', limit: '50', format: 'json' }));
    const data = await res.json().catch(() => null);          // Last.fm sends its error JSON with a 4xx status too, so read the body before looking at res.ok
    if (data && data.error) {
      if (data.error === 6) { const nf = { status: 'notfound' }; aiBeyondMem.set(k, nf); aiSaveSimilarCache(artist, nf); return nf; }
      if (data.error === 10 || data.error === 26) return { status: 'badkey' };   // invalid / suspended key
      return { status: 'error' };                                                 // incl. 29 (rate limited)
    }
    if (!res.ok || !data || !data.similarartists) return { status: 'error' };
    const artists = [].concat(data.similarartists.artist || []).map(a => ({ name: String(a.name || ''), match: parseFloat(a.match) || 0, url: String(a.url || '') })).filter(a => a.name);
    const ok = { status: 'ok', artists };
    aiBeyondMem.set(k, ok); aiSaveSimilarCache(artist, ok);
    return ok;
  } catch (err) { return { status: 'error' }; }
}
// Last.fm has no artist pictures any more, so borrow the cover of one of the artist's albums from iTunes
// — but only when iTunes says that album really is BY this artist (a fuzzy search for an obscure name
// happily returns somebody else's record, and a wrong picture is worse than a letter). One lookup at a
// time, spaced out, because iTunes rate-limits.
function aiBeyondArtFor(name) {
  const k = name.toLowerCase();
  if (aiBeyondArt.has(k)) return Promise.resolve(aiBeyondArt.get(k));
  aiBeyondArtChain = aiBeyondArtChain.then(async () => {
    if (aiBeyondArt.has(k)) return;
    let url = '';
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=album&limit=3`);
      const hit = ((await res.json()).results || []).find(r => r.artistName && normMatchKey(r.artistName) === normMatchKey(name) && r.artworkUrl100);
      if (hit) url = hit.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.');
    } catch (err) { /* no picture — the letter stands in */ }
    aiBeyondArt.set(k, url);
    await new Promise(r => setTimeout(r, 250));
  });
  return aiBeyondArtChain.then(() => aiBeyondArt.get(k) || '');
}
async function aiRenderBeyondCrate(artist, token) {
  const box = document.getElementById('aiBeyond');
  if (!box) return;
  const head = `<div class="ai-albums-head ai-beyond-head"><h3 class="ai-h3">Beyond your crate</h3><span class="ai-sub-note">Last.fm \u00b7 what listeners of ${escapeHtml(artist)} also play</span></div>`;
  box.innerHTML = head + '<p class="ai-empty">Asking Last.fm\u2026</p>';
  const res = await fetchLastfmSimilar(artist);
  if (token !== aiBodyToken || !document.getElementById('aiBeyond')) return;   // moved to another artist/tab meanwhile
  const note = (msg, btn) => { box.innerHTML = head + `<div class="ai-note"><p>${msg}</p>${btn || ''}</div>`; };
  const setup = '<button type="button" class="config-btn" data-ai-action="setupLastfm">Set up Last.fm</button>';
  if (res.status === 'nokey') return note('Add your Last.fm API key to see artists beyond your crate.', setup);
  if (res.status === 'badkey') return note('Last.fm rejected the API key \u2014 check it in the Last.fm settings.', setup);
  if (res.status === 'notfound') return note(`Last.fm doesn\u2019t know an artist called \u201c${escapeHtml(artist)}\u201d.`);
  if (res.status !== 'ok') return note('Couldn\u2019t reach Last.fm right now.', '<button type="button" class="config-btn" data-ai-action="retryBeyond">Retry</button>');
  const owned = new Set(state.raw.map(r => normMatchKey(r.artist)));
  const fresh = res.artists.filter(a => !owned.has(normMatchKey(a.name))).sort((a, b) => b.match - a.match).slice(0, 12);
  if (!fresh.length) return note(res.artists.length ? 'Everything Last.fm suggests is already in your crate.' : 'Last.fm has no similar artists for this one.');
  box.innerHTML = head + `<div class="ai-album-grid ai-sim-grid">${fresh.map(a => `
    <div class="ai-album ai-beyond-tile" data-ai-action="searchSpotifyArtist" data-artist="${escapeHtml(a.name)}" tabindex="0" title="Search ${escapeHtml(a.name)} on Spotify">
      <div class="ai-cover ai-cover-round"><img class="ai-cover-img" alt="" src="${escapeHtml(placeholderArt({ artist: a.name }))}"></div>
      <div class="ai-album-title">${escapeHtml(a.name)}</div>
      <div class="ai-album-year">${Math.round(a.match * 100)}% match${/^https:\/\/www\.last\.fm\//.test(a.url) ? ` \u00b7 <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">Last.fm \u2197</a>` : ''}</div>
    </div>`).join('')}</div>`;
  box.querySelectorAll('.ai-beyond-tile').forEach(tile => {
    aiBeyondArtFor(tile.dataset.artist).then(url => { if (url && token === aiBodyToken && tile.isConnected) tile.querySelector('img').src = url; });
  });
}

// ----- page assembly -----
function aiRenderBody(artist) {
  const owned = aiOwned(artist), token = ++aiBodyToken, sub = aiSubTab(artist);
  el.aiSubtabs.querySelectorAll('[data-aitab]').forEach(b => {
    const on = b.dataset.aitab === sub;
    b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  el.aiBody.scrollTop = 0;
  aiTouchArt(owned);
  if (sub === 'stats') {
    el.aiBody.innerHTML = aiStatsBodyHtml(owned);
    document.getElementById('aiTrackSort').value = state.artistInfoTrackSort;
    aiRenderTopTracks(artist);
  } else if (sub === 'albums') aiRenderAlbumsTab(artist, owned, token);
  else if (sub === 'profile') aiRenderProfileTab(artist, owned);
  else aiRenderSimilarTab(artist);
}
function renderArtistInfoTab() {
  const artist = state.activeArtistInfoTab;
  if (!artist) return;
  const owned = aiOwned(artist);
  aiRenderSidebar(artist);
  aiRenderHeader(artist, owned);
  aiRenderBody(artist);
  aiEnsureTracks(artist);
  aiEnsureProfile(artist);
}

// ----- events (delegated: the body is rebuilt constantly) -----
function aiAction(action, node, artist) {
  if (action === 'showAllTracks' || action === 'showFewerTracks') { state.artistInfoShowAllTracks = action === 'showAllTracks'; aiRenderTopTracks(artist); }
  else if (action === 'toggleAllTypes') { state.artistShowAllTypes = !state.artistShowAllTypes; aiRenderBody(artist); }
  else if (action === 'retryAlbums') aiRenderBody(artist);
  else if (action === 'resetMatch') {
    clearArtistMbidChoice(artist);
    delete state.artistWorksCache[`${artist.toLowerCase()}::main`]; delete state.artistWorksCache[`${artist.toLowerCase()}::all`];
    aiExt(artist).profile = null; aiEnsureProfile(artist);
    aiRenderBody(artist);
  } else if (action === 'pickMbid') {
    const chosen = aiAmbiguousResult && aiAmbiguousResult.options.find(o => o.mbid === node.dataset.mbid);
    if (!chosen) return;
    saveArtistMbidChoice(artist, chosen.mbid);
    state.artistWorksCache[`${artist.toLowerCase()}::${state.artistShowAllTypes ? 'all' : 'main'}`] = { items: chosen.items, mbid: chosen.mbid, fetchedAt: Date.now() };
    aiExt(artist).profile = null; aiEnsureProfile(artist);
    aiRenderBody(artist);
  } else if (action === 'manualAdd') { openAddModal(); showAddForm({ artist }); }
  else if (action === 'addRg') {
    const t = node.closest('.ai-rg');
    openAddModalForReleaseGroup({ artist, title: t.dataset.title, type: t.dataset.type, releaseDate: t.dataset.year || '', rgId: t.dataset.rg || '' });
  } else if (action === 'readMore') {
    const open = document.getElementById('aiBioText').classList.toggle('expanded');
    node.textContent = open ? 'Show less' : 'Read More\u2026';
  } else if (action === 'retryProfile') { aiExt(artist).profile = null; aiRenderBody(artist); aiEnsureProfile(artist); }
  else if (action === 'gotoAlbums') { state.artistInfoSubTab[artist] = 'albums'; aiRenderBody(artist); }
  else if (action === 'gotoStats') { state.artistInfoSubTab[artist] = 'stats'; aiRenderBody(artist); }
  else if (action === 'openArtist') openArtistInfoTab(node.dataset.artist);
  else if (action === 'setupLastfm') openLastfmModal();
  else if (action === 'retryBeyond') { aiBeyondMem.delete(artist.toLowerCase()); aiRenderBeyondCrate(artist, aiBodyToken); }
  else if (action === 'searchSpotifyArtist') window.open(spotifySearchUrl({ artist: node.dataset.artist, title: '' }), '_blank', 'noopener,noreferrer');
}
function aiBodyClick(e) {
  const artist = state.activeArtistInfoTab;
  if (!artist) return;
  if (e.target.closest('a')) return;   // a real link (Wikipedia, Last.fm…) just follows itself, even when it sits inside a clickable tile
  const act = e.target.closest('[data-ai-action]');
  if (act) { aiAction(act.dataset.aiAction, act, artist); return; }
  const rg = e.target.closest('.ai-rg');
  if (rg) {
    const match = aiOwned(artist).find(r => lastfmNormKey(artist, r.title) === lastfmNormKey(artist, rg.dataset.title));
    if (match) openDeck(match); else window.open(spotifySearchUrl({ artist, title: rg.dataset.title }), '_blank', 'noopener,noreferrer');
    return;
  }
  const tile = e.target.closest('.ai-album');
  if (tile && tile.dataset.row !== undefined) {
    // Wait out a possible double-click (which plays the album) before opening the album page.
    clearTimeout(aiClickTimer);
    aiClickTimer = setTimeout(() => { const it = state.raw.find(r => String(r.row) === tile.dataset.row); if (it) openDeck(it); }, 260);
  }
}
function aiBodyDblClick(e) {
  const tile = e.target.closest('.ai-album');
  if (tile && tile.dataset.row !== undefined) {
    clearTimeout(aiClickTimer);
    const it = state.raw.find(r => String(r.row) === tile.dataset.row);
    if (it) playAlbumReplacingQueue(it);
    return;
  }
  const row = e.target.closest('.ai-track-row');
  if (row && aiRowsShown[+row.dataset.i]) { const r = aiRowsShown[+row.dataset.i]; playTrackNow(r.item, r.trackName, r.trackNum); }
}
function aiBodyContextMenu(e) {
  const tile = e.target.closest('.ai-album');
  if (tile && tile.dataset.row !== undefined) {
    const it = state.raw.find(r => String(r.row) === tile.dataset.row);
    if (it) { e.preventDefault(); openAlbumCardContextMenu(it, e.clientX, e.clientY); }
    return;
  }
  const row = e.target.closest('.ai-track-row');
  if (row && aiRowsShown[+row.dataset.i]) { const r = aiRowsShown[+row.dataset.i]; e.preventDefault(); openTrackContextMenu(r.item, r.trackName, e.clientX, e.clientY, r.trackNum); }
}
/* ---------- Artist Biography (Main-panel element) ----------
   The strip under the grid in the MusicBee reference: an "Artist Biography" bar,
   a centred "Simon & Garfunkel  [ 8 plays ]" title, the picture on the left and
   the biography on the right. Same data and the same rules as the Artist
   Information page's Profile tab (aiExt/aiEnsureProfile — MusicBrainz's own link
   to the artist's Wikipedia page, cached), just surfaced where you're already
   browsing. Clicking the name or picture opens the full artist page.

   Which artist? What you're BROWSING wins over what's playing, since the point
   is to read about what you've just clicked: an artist picked/filtered in the
   left panel, a picked album's artist, or a search that has narrowed the grid to
   one artist; only then the artist of the track in the player.

   Lookups are debounced: clicking quickly through ten artists must not queue
   thirty MusicBrainz requests for artists you've already moved past. */
let aiBioTimer = null;

function currentArtistForBio() {
  const nf = state.navFilter;
  if (nf && nf.mode === 'artist') return nf.value;
  if (nf && nf.mode === 'album') { const it = state.raw.find(r => String(r.row) === String(nf.value)); if (it) return it.artist; }
  if (state.filtered.length && state.filtered.length < state.raw.length) {
    const a = state.filtered[0].artist;
    if (state.filtered.every(r => r.artist === a)) return a;
  }
  if (el.miniPlayer && !el.miniPlayer.hidden) {
    const np = resolveNowPlayingForMenu();
    if (np.item) return np.item.artist;
    const sp = activePlayerEngine === 'spotify' ? currentSpotifyTrack : null;
    const name = sp && sp.artists && sp.artists[0] && sp.artists[0].name;
    if (name) return name;
  }
  return '';
}
function aiScheduleBioLookup(artist) {
  clearTimeout(aiBioTimer);
  aiBioTimer = setTimeout(() => {
    if (el.artistBioElement && !el.artistBioElement.hidden && el.artistBioElement.dataset.artist === artist) aiEnsureProfile(artist);
  }, 600);
}
function aiRefreshBioElement(artist) {
  if (el.artistBioElement && !el.artistBioElement.hidden && el.artistBioElement.dataset.artist === artist) renderArtistBioElement();
}
function renderArtistBioElement() {
  const host = el.artistBioElement, box = el.artistBioBody;
  if (!host || !box || host.hidden) return;
  const artist = currentArtistForBio();
  host.dataset.artist = artist;
  if (!artist) {
    box.innerHTML = '<p class="artist-bio-note">Pick an artist in the left panel \u2014 or play something \u2014 to see their biography here.</p>';
    return;
  }
  const prof = aiExt(artist).profile, owned = aiOwned(artist);
  const cover = owned.length ? aiArtImg(owned[0], 'artist-bio-img') : '';
  const q = encodeURIComponent(artist);
  let picture = cover, text;
  if (!prof) {
    text = '<p class="artist-bio-note">Loading biography\u2026</p>';
    aiScheduleBioLookup(artist);
  } else if (prof.status === 'ok') {
    if (prof.thumb) picture = `<img class="artist-bio-img" src="${escapeHtml(prof.thumb)}" alt="">`;
    text = `<div class="artist-bio-text">${aiBioHtml(prof.extract)}<p class="artist-bio-source">Text from <a href="${escapeHtml(prof.url)}" target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA)</p></div>`;
  } else if (prof.status === 'ambiguous') {
    text = `<p class="artist-bio-note">More than one artist named \u201c${escapeHtml(artist)}\u201d is on MusicBrainz, so there\u2019s no way to know whose biography to show.</p><button type="button" class="ai-link-btn" data-bio-action="chooseArtist">Choose the right one</button>`;
  } else if (prof.status === 'error') {
    text = '<p class="artist-bio-note">Couldn\u2019t reach the biography sources right now.</p><button type="button" class="ai-link-btn" data-bio-action="retry">Retry</button>';
  } else if (prof.status === 'unmatched') {
    text = `<p class="artist-bio-note">${escapeHtml(artist)} isn\u2019t on MusicBrainz under this name, so there\u2019s no biography source to look in. <a class="ai-link-btn" href="https://en.wikipedia.org/w/index.php?search=${q}" target="_blank" rel="noopener noreferrer">Search Wikipedia \u2197</a></p>`;
  } else {
    text = `<p class="artist-bio-note">No Wikipedia page is linked to ${escapeHtml(artist)} on MusicBrainz. <a class="ai-link-btn" href="https://en.wikipedia.org/w/index.php?search=${q}" target="_blank" rel="noopener noreferrer">Search Wikipedia \u2197</a></p>`;
  }
  const n = computeArtistStats(artist).totalPlays;
  box.innerHTML = `<div class="artist-bio-title"><button type="button" class="artist-bio-name" data-bio-action="openArtist" title="Open the full artist page">${escapeHtml(artist)}</button><span class="artist-bio-plays">[ ${n} play${n === 1 ? '' : 's'} ]</span></div>
    <div class="artist-bio-main">${picture ? `<div class="artist-bio-pic" data-bio-action="openArtist" title="Open the full artist page">${picture}</div>` : ''}<div class="artist-bio-body">${text}</div></div>`;
}
function aiBioClick(e) {
  const a = e.target.closest('[data-bio-action]');
  const artist = el.artistBioElement && el.artistBioElement.dataset.artist;
  if (!a || !artist) return;
  const act = a.dataset.bioAction;
  if (act === 'openArtist') openArtistInfoTab(artist);
  else if (act === 'chooseArtist') { state.artistInfoSubTab[artist] = 'albums'; openArtistInfoTab(artist); }
  else if (act === 'retry') { aiExt(artist).profile = null; renderArtistBioElement(); }   // the render schedules the new lookup
}
