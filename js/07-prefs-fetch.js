// CRATE — preferences, loading the crate (fetchCatalog, postUpdate).
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Preferences (localStorage) ----------
   Persists layout/view choices across reloads once this file is opened in a
   real browser tab. Inside Claude.ai's in-chat preview, localStorage is
   sandboxed and silently no-ops — everything still works, it just won't
   remember your settings until you open the downloaded file directly. */

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.viewMode) state.viewMode = p.viewMode;
    if (p.mainViewMode) state.mainViewMode = p.mainViewMode;
    if (p.playlistViewMode) state.playlistViewMode = p.playlistViewMode;
    if (p.playlistSort) state.playlistSort = p.playlistSort;
    if (p.cardSize) state.cardSize = p.cardSize;
    if (p.sort) state.sort = p.sort;
    if (p.groupBy) state.groupBy = p.groupBy;
    if (p.groupBy2) state.groupBy2 = p.groupBy2;
    if (p.activeType) state.activeType = p.activeType;
    if (p.leftMode) state.leftMode = p.leftMode;
	if (p.leftSort) state.leftSort = p.leftSort;             // 👈 ADD THIS
	if (p.leftThumbSize) state.leftThumbSize = p.leftThumbSize; // 👈 ADD THIS
	if (p.leftGroupBy) state.leftGroupBy = p.leftGroupBy;
    if (typeof p.showLeft === 'boolean') state.showLeft = p.showLeft;
    if (typeof p.showRight === 'boolean') state.showRight = p.showRight;
    // showCoverLinks intentionally no longer restored from saved prefs —
    // the S/C/R/Y cover-art icons are being removed outright, and this was
    // defaulting to true, so anyone whose prefs blob already had that
    // saved from before this change would otherwise still see them despite
    // the new `showCoverLinks: false` default above. The checkbox (still
    // in the layout menu) keeps working for this session/going forward —
    // it's only the old persisted true value that's ignored.
    if (typeof p.fitArtwork === 'boolean') state.fitArtwork = p.fitArtwork;
    if (p.fieldPlacement === 'overlay' || p.fieldPlacement === 'below') state.fieldPlacement = p.fieldPlacement;
    if (typeof p.closeGaps === 'boolean') state.closeGaps = p.closeGaps;
    if (typeof p.leftNavCompact === 'boolean') state.leftNavCompact = p.leftNavCompact;
    if (typeof p.shuffle === 'boolean') state.shuffle = p.shuffle;
    if (['exact', 'subgenres', 'loose'].includes(p.genreSearchMode)) state.genreSearchMode = p.genreSearchMode;
    if (typeof p.firstGenreOnly === 'boolean') state.firstGenreOnly = p.firstGenreOnly;
    if (typeof p.genreNavExact === 'boolean') state.genreNavExact = p.genreNavExact;
    if (['any', 'primary', 'secondary'].includes(p.genreRole)) state.genreRole = p.genreRole;
    ['rymBold', 'rymShowNext', 'rymAuto', 'rymMissingOnly', 'rymGenreAuto', 'rymQueueMode', 'rymTickDiffs', 'rymUpdateOnAdd', 'rymAutoImport', 'rymAutoApply', 'afOn'].forEach(k => { if (typeof p[k] === 'boolean') state[k] = p[k]; });
    if (p.afOrder && typeof p.afOrder === 'object') state.afOrder = p.afOrder;
    if (rymVotesNum(p.rymBoldRank)) state.rymBoldRank = rymVotesNum(p.rymBoldRank);
    if ([0, 3, 3.5, 3.8, 4, 4.5].includes(Number(p.rymMin))) state.rymMin = Number(p.rymMin);
    if (['', 'yes', 'no'].includes(p.rymUpdatedFilter)) state.rymUpdatedFilter = p.rymUpdatedFilter;
    if (p.panelWidths) state.panelWidths = Object.assign({}, state.panelWidths, p.panelWidths);
    if (p.fields) state.fields = Object.assign(state.fields, p.fields);
    // Once: a Tracks column showing the RELEASE's RYM rating becomes the song's own (the first) and its rating count (the second). They used to
    // share the name "RYM rating", so the release's was picked for the song's. Done once; a column you set back afterwards stays.
    if (!p.songRymCols && Array.isArray(state.fields.tracks)) { const t = state.fields.tracks; let n = 0; state.fields.tracks = t.map(k => { if (k !== 'rymRating') return k; n++; return n === 1 && !t.includes('rymTrackRating') ? 'rymTrackRating' : n === 2 && !t.includes('rymTrackVotes') ? 'rymTrackVotes' : k; }); }
    state.songRymCols = true;
    if (p.trackColWidths && p.trackColsWide) state.trackColWidths = p.trackColWidths;          // (once: 1.83.3 saved every column at its squeezed width whenever one was dragged, so those widths start over)
    if (Array.isArray(p.playlistFoldersCollapsed)) state.playlistFoldersCollapsed = p.playlistFoldersCollapsed;
    if (Array.isArray(p.playlistFolders)) state.playlistFolders = p.playlistFolders;
    if (p.playlistFolderMap && typeof p.playlistFolderMap === 'object') state.playlistFolderMap = p.playlistFolderMap;
    if (p.statsMode === 'listening' || p.statsMode === 'collection' || p.statsMode === 'map') state.statsMode = p.statsMode;
    if (typeof p.rightPanelShowQueue === 'boolean') state.rightPanelShowQueue = p.rightPanelShowQueue;
    if (typeof p.rightPanelShowHistory === 'boolean') state.rightPanelShowHistory = p.rightPanelShowHistory;
    if (typeof p.rightPanelShowTrackInfo === 'boolean') state.rightPanelShowTrackInfo = p.rightPanelShowTrackInfo;
    if (p.panelLayout && typeof p.panelLayout === 'object' && p.panelLayout.main && p.panelLayout.right && p.panelLayout.bottom) {
      state.panelLayout = p.panelLayout;
    } else {
      // No saved layout yet — either a genuinely fresh install (the three
      // legacy booleans' own defaults, read just above, already produce
      // the right fallback: Queue on, History/TrackInfo off) or an
      // existing install updating to this version, whose real prior setup
      // this preserves exactly rather than resetting everyone back to
      // Up Next only. Main/Bottom get sensible defaults either way, since
      // neither concept existed before this version.
      const right = [];
      if (state.rightPanelShowQueue) right.push('queue');
      if (state.rightPanelShowHistory) right.push('lastfmHistory');
      if (state.rightPanelShowTrackInfo) right.push('trackInfo');
      state.panelLayout = { main: ['musicView'], right, top: [], bottom: ['playerControls'] };
    }
    // Two follow-up migrations, applied regardless of which branch above
    // ran, since both can produce a layout predating either change:
    // (1) 'top' didn't exist as a panel before Player Controls did — add
    // it if a saved layout from that era is missing it entirely.
    // (2) Now Playing Bar used to BE the docked player when placed in
    // Bottom (the confusing conflation fixed by splitting it into this
    // display-only element plus the new Player Controls one) — anyone
    // with 'nowPlayingBar' still sitting in their saved bottom array gets
    // it swapped for 'playerControls' instead, preserving "docked at the
    // bottom" rather than silently losing their player entirely once
    // 'nowPlayingBar' stops being a valid occupant of that panel.
    if (!Array.isArray(state.panelLayout.top)) state.panelLayout.top = [];
    const legacyIdx = state.panelLayout.bottom.indexOf('nowPlayingBar');
    if (legacyIdx !== -1) state.panelLayout.bottom[legacyIdx] = 'playerControls';
    if (!state.panelLayout.bottom.includes('playerControls') && !state.panelLayout.top.includes('playerControls')) {
      state.panelLayout.bottom.push('playerControls'); // never allowed to end up nowhere at all — see LAYOUT_ELEMENTS' own comment on this element
    }
    if (p.panelStackMode === 'stacked' || p.panelStackMode === 'tabs') state.panelStackMode = p.panelStackMode;
    if (p.activeTabByPanel && typeof p.activeTabByPanel === 'object') state.activeTabByPanel = p.activeTabByPanel;
    if (Array.isArray(p.collapsedGenres)) state.collapsedGenres = new Set(p.collapsedGenres);
    if (['none','genre','year','artist'].includes(p.mapColorBy)) state.mapColorBy = p.mapColorBy;
    if (['thumbnail','trackDetail','releaseTracks'].includes(p.queueViewMode)) state.queueViewMode = p.queueViewMode;
    if (typeof p.showTrackCredits === 'boolean') state.showTrackCredits = p.showTrackCredits;
    if (typeof p.chartGenre === 'string') state.chartGenre = p.chartGenre;
    if (typeof p.flagMissingLinks === 'boolean') state.flagMissingLinks = p.flagMissingLinks;
    if (typeof p.autoMatchOnAdd === 'boolean') state.autoMatchOnAdd = p.autoMatchOnAdd;
    if (typeof p.autoMatchYoutube === 'boolean') state.autoMatchYoutube = p.autoMatchYoutube;
    if (typeof p.lastfmReviewAtStartup === 'boolean') state.lastfmReviewAtStartup = p.lastfmReviewAtStartup;
    if (typeof p.shareWithAddon === 'boolean') state.shareWithAddon = p.shareWithAddon;
    if (['off', 'both', 'only'].includes(p.genreChartMb)) state.genreChartMb = p.genreChartMb;
    if (typeof p.trackInfoShowPlayer === 'boolean') state.trackInfoShowPlayer = p.trackInfoShowPlayer;
    if (typeof p.trackInfoShowVideo === 'boolean') state.trackInfoShowVideo = p.trackInfoShowVideo;
    if (typeof p.releaseSearchGridView === 'boolean') state.releaseSearchGridView = p.releaseSearchGridView;
    if (p.lastfmHistoryLayout === 'chronological' || p.lastfmHistoryLayout === 'byDay') state.lastfmHistoryLayout = p.lastfmHistoryLayout;
    if (p.lastfmHistoryViewMode === 'list' || p.lastfmHistoryViewMode === 'grid') state.lastfmHistoryViewMode = p.lastfmHistoryViewMode;
    if (p.albumQuickPeekStyle === 'floating' || p.albumQuickPeekStyle === 'inline' || p.albumQuickPeekStyle === 'sleeve') state.albumQuickPeekStyle = p.albumQuickPeekStyle;
    if (p.addFormVisibleFields && typeof p.addFormVisibleFields === 'object') state.addFormVisibleFields = p.addFormVisibleFields;
  } catch (e) { /* localStorage unavailable — safe to ignore */ }
}

function savePrefs() {
  try {
	localStorage.setItem(PREF_KEY, JSON.stringify({
      viewMode: state.viewMode, mainViewMode: state.mainViewMode, playlistViewMode: state.playlistViewMode, playlistSort: state.playlistSort, cardSize: state.cardSize, sort: state.sort, groupBy: state.groupBy, groupBy2: state.groupBy2,
      activeType: state.activeType, leftMode: state.leftMode, leftSort: state.leftSort, leftThumbSize: state.leftThumbSize, leftGroupBy: state.leftGroupBy, // 👈 UPDATED HERE
      showLeft: state.showLeft, songRymCols: true, trackColsWide: true, showRight: state.showRight, showCoverLinks: state.showCoverLinks, fitArtwork: state.fitArtwork, fieldPlacement: state.fieldPlacement, closeGaps: state.closeGaps, leftNavCompact: state.leftNavCompact, panelWidths: state.panelWidths, fields: state.fields, trackColWidths: state.trackColWidths,
      playlistFoldersCollapsed: state.playlistFoldersCollapsed,
      playlistFolders: state.playlistFolders,
      playlistFolderMap: state.playlistFolderMap,
      shuffle: state.shuffle,
      genreSearchMode: state.genreSearchMode,
      firstGenreOnly: state.firstGenreOnly, genreRole: state.genreRole, genreNavExact: state.genreNavExact,
      rymGenreAuto: state.rymGenreAuto, rymBold: state.rymBold, rymQueueMode: state.rymQueueMode, rymUpdateOnAdd: state.rymUpdateOnAdd, rymAutoImport: state.rymAutoImport, rymAutoApply: state.rymAutoApply, afOn: state.afOn, afOrder: state.afOrder, rymTickDiffs: state.rymTickDiffs, rymShowNext: state.rymShowNext, rymAuto: state.rymAuto, rymMissingOnly: state.rymMissingOnly, rymBoldRank: state.rymBoldRank, rymMin: state.rymMin, rymUpdatedFilter: state.rymUpdatedFilter || '',
      statsMode: state.statsMode,
      rightPanelShowQueue: state.rightPanelShowQueue,
      rightPanelShowHistory: state.rightPanelShowHistory,
      rightPanelShowTrackInfo: state.rightPanelShowTrackInfo,
      panelLayout: state.panelLayout,
      panelStackMode: state.panelStackMode,
      activeTabByPanel: state.activeTabByPanel,
      collapsedGenres: [...state.collapsedGenres],
      mapColorBy: state.mapColorBy,
      queueViewMode: state.queueViewMode,
      showTrackCredits: state.showTrackCredits,
      chartGenre: state.chartGenre,
      flagMissingLinks: state.flagMissingLinks,
      autoMatchOnAdd: state.autoMatchOnAdd,
      autoMatchYoutube: state.autoMatchYoutube,
      lastfmReviewAtStartup: state.lastfmReviewAtStartup,
      shareWithAddon: state.shareWithAddon,
      genreChartMb: state.genreChartMb,
      trackInfoShowPlayer: state.trackInfoShowPlayer,
      trackInfoShowVideo: state.trackInfoShowVideo,
      releaseSearchGridView: state.releaseSearchGridView,
      lastfmHistoryLayout: state.lastfmHistoryLayout,
      lastfmHistoryViewMode: state.lastfmHistoryViewMode,
      albumQuickPeekStyle: state.albumQuickPeekStyle,
      addFormVisibleFields: state.addFormVisibleFields
    }));
  } catch (e) { /* localStorage unavailable — safe to ignore */ }
}

// Persists the "N of T" artist-discography and year-coverage lookups so
// re-opening the app (or switching views away and back) doesn't re-hit
// MusicBrainz for data it already has — that's what made the badges feel
// slow to reappear. Entries older than COVERAGE_CACHE_TTL_MS are dropped on
// load so counts still refresh eventually rather than being stuck forever.
function loadCoverageCache() {
  try {
    const raw = localStorage.getItem(COVERAGE_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const now = Date.now();
    Object.entries(parsed.artist || {}).forEach(([key, entry]) => {
      if (entry && typeof entry.fetchedAt === 'number' && (now - entry.fetchedAt) < COVERAGE_CACHE_TTL_MS) {
        state.artistDiscogCache[key] = entry;
      }
    });
    Object.entries(parsed.year || {}).forEach(([key, entry]) => {
      if (entry && typeof entry.fetchedAt === 'number' && (now - entry.fetchedAt) < COVERAGE_CACHE_TTL_MS) {
        state.yearCoverageCache[key] = entry;
      }
    });
  } catch (e) { /* localStorage unavailable — safe to ignore */ }
}

function saveCoverageCache() {
  try {
    localStorage.setItem(COVERAGE_CACHE_KEY, JSON.stringify({
      artist: state.artistDiscogCache,
      year: state.yearCoverageCache
    }));
  } catch (e) { /* localStorage unavailable, or quota exceeded — safe to ignore */ }
}

/* ---------- Fetch ---------- */

// ---- Where you are in the catalogue, kept across a CHANGE to it (a release added, removed or edited, a reload, a RYM rating arriving). Rebuilding the cards used to send the view to the top. ----
// Before the rebuild: remember the first release in view and the few after it (by id, else artist + title + date: sheet rows shift when one is deleted, so a row number can't be remembered), and how far each
// sits below the top of the view. After it: put the first of them that is still there back at the same place. If a release was removed from the very spot you were at, the next one takes its place; if
// nothing from the view is left, the old distance from the top is used (kept inside the list). Filtering, sorting and searching are NOT this: they still start from the top.
function gridPlaceKey(item) { return item ? (item.albumId ? 'id:' + item.albumId : 'k:' + artKey(item) + '|' + (item.releaseDate || item.year || '')) : ''; }
function captureGridPlace() {
  const wrap = document.getElementById('gridWrap'); if (!wrap || state.activePlaylistId || state.activeTab !== 'albums' || wrap.scrollTop <= 0) return null;          // at the top there is nothing to keep
  const top = wrap.getBoundingClientRect().top, byRow = new Map((state.raw || []).map(r => [String(r.row), r])), seen = [];
  for (const c of el.gridContainer.querySelectorAll('[data-album-row]')) {
    const r = c.getBoundingClientRect(); if (r.bottom <= top + 1) continue;
    const it = byRow.get(c.dataset.albumRow); if (!it) continue;
    seen.push({ key: gridPlaceKey(it), off: r.top - top }); if (seen.length >= 14) break;
  }
  return { scrollTop: wrap.scrollTop, seen };
}
function restoreGridPlace(place) {
  const wrap = document.getElementById('gridWrap'); if (!wrap || !place) return;
  const top = wrap.getBoundingClientRect().top, byKey = new Map(), cardOf = new Map();
  (state.raw || []).forEach(r => { const k = gridPlaceKey(r); if (!byKey.has(k)) byKey.set(k, r); });
  el.gridContainer.querySelectorAll('[data-album-row]').forEach(c => cardOf.set(c.dataset.albumRow, c));
  for (const s of place.seen) {
    const it = byKey.get(s.key), c = it && cardOf.get(String(it.row)); if (!c) continue;
    wrap.scrollTop += (c.getBoundingClientRect().top - top) - s.off; return;
  }
  wrap.scrollTop = Math.min(place.scrollTop, Math.max(0, wrap.scrollHeight - wrap.clientHeight));
}
function gridPlaceSnapshot() { const left = document.getElementById('leftList'); return { place: captureGridPlace(), leftTop: left ? left.scrollTop : 0 }; }          // (taken BEFORE anything that clears the view, such as the reload's "loading" state)
function keepGridPlace(fn, snap) { snap = snap || gridPlaceSnapshot(); const out = fn(); restoreGridPlace(snap.place); if (snap.place) gridFillVisible(); const left = document.getElementById('leftList'); if (left && snap.leftTop) left.scrollTop = snap.leftTop; return out; }
// fetchCatalog(): the whole crate from the sheet. { quiet: true } is the sync after a change of your own (an add, a delete, an update): the
// grid stays as it is, with no "Cataloguing\u2026", and is redrawn only when something really differs (catalogReconcile keeps each release's
// object, so an open release, the player and the queue keep theirs). A quiet call that arrives while a load is running gets one more quiet
// load after it, so it always ends with fresh data, and a burst of changes shares one. scheduleCatalogSync() is the same, a moment after the
// last change. Without quiet (opening CRATE, the \u27f3 button) it is the full, visible reload as before.
let fetchCatalogRun = null, fetchCatalogAgain = false, catalogSyncTimer = 0;
// Writes to the sheet (postUpdate) are counted. A quiet sync whose answer was read while one was being written, or before one started, can
// hold the sheet as it was before that write: applied, it put the old values back over what had just been saved (in an automatic run,
// a tracklist just filled from Rate Your Music turned empty again). Such an answer is set aside and the sync is done again once the
// writes are through (at most three times in a row, so a long run of writes can't hold it back for ever).
const catalogWrites = { started: 0, inFlight: 0, waiters: [] };
function catalogWriteStart() { catalogWrites.started++; catalogWrites.inFlight++; }
function catalogWriteEnd() { catalogWrites.inFlight = Math.max(0, catalogWrites.inFlight - 1); if (!catalogWrites.inFlight) catalogWrites.waiters.splice(0).forEach(f => f()); }
const catalogWritesSettled = () => catalogWrites.inFlight ? new Promise(res => catalogWrites.waiters.push(res)) : Promise.resolve();
function fetchCatalog(opts) {
  opts = opts || {};
  if (fetchCatalogRun) { if (opts.quiet) fetchCatalogAgain = true; return fetchCatalogRun; }
  fetchCatalogRun = (async () => {
    try { let o = opts; while (o) { fetchCatalogAgain = false; const r = await fetchCatalogOnce(o); o = r && r.stale ? { quiet: true, staleTries: (o.staleTries || 0) + 1 } : fetchCatalogAgain ? { quiet: true } : null; } }
    finally { fetchCatalogRun = null; fetchCatalogAgain = false; }
  })();
  return fetchCatalogRun;
}
function scheduleCatalogSync(ms) { clearTimeout(catalogSyncTimer); catalogSyncTimer = setTimeout(() => { fetchCatalog({ quiet: true }).catch(() => {}); }, ms == null ? 2500 : ms); }
function catalogSyncing(on) { const b = el.refreshBtn; if (!b) return; b.classList.toggle('syncing', !!on); b.title = on ? 'Syncing with your sheet\u2026' : 'Refresh from sheet'; }
// A release's identity across loads: its AlbumId, else what it is (rows move when one above them is deleted).
function catalogKey(it) { return it.albumId ? 'id:' + it.albumId : 'k:' + [it.artist, it.title, it.releaseDate, it.type].join('\u0001').toLowerCase(); }
// The fresh rows against the ones on screen: a release that is the same keeps its object as it is (with what was added to it since, such as a
// rating kept in this browser); one that changed keeps its object with the sheet's values written in; new ones come in. changed = anything to redraw.
function catalogReconcile(oldRaw, fresh) {
  const pool = new Map(), added = [];
  (oldRaw || []).forEach(o => { const k = catalogKey(o); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(o); });
  let modified = 0;
  const raw = (fresh || []).map(n => {
    const sig = JSON.stringify(n), list = pool.get(catalogKey(n)), o = list && list.shift();
    if (!o) { Object.defineProperty(n, '__sig', { value: sig, writable: true, configurable: true }); added.push(n); return n; }
    if (o.__sig !== sig) { Object.keys(n).forEach(k => { o[k] = n[k]; }); if (!Object.prototype.hasOwnProperty.call(o, '__sig')) Object.defineProperty(o, '__sig', { value: '', writable: true, configurable: true }); o.__sig = sig; modified++; }
    return o;
  });
  const removed = [].concat(...pool.values()), old = oldRaw || [];
  const changed = !!(added.length || removed.length || modified || raw.length !== old.length || raw.some((x, i) => x !== old[i]));
  return { raw, added, removed, modified, changed };
}
// The sheet just lost this release's row: the same here at once, and every row below it moves up one, as the sheet's do (so a change made
// before the next sync still goes to the right row).
function catalogRemoveLocal(item) {
  const r = Number(item && item.row); if (!r) return;
  state.raw = (state.raw || []).filter(x => x !== item);
  state.raw.forEach(x => { if (Number(x.row) > r) x.row = Number(x.row) - 1; });
}
function catalogRedraw() { keepGridPlace(() => { buildLeftList(); renderPlaylistSidebar(); updateMainLabel(); applyFiltersSort(); }); if (state.activeTab === 'artist') { renderArtistList(); renderArtistDetail(); } }
// A release that arrives is the delete animation the other way round (22-deck.js: delAnimateOut): the cards on screen slide aside to make
// room for it (where each was before the redraw, measured: FLIP), and it comes into focus where it lands, with a moment of the accent around it.
const catalogCalm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function catalogFlipBefore() {                       // the cards on screen now, and where each is, by its release (rows can change with the sync)
  if (catalogCalm()) return null;
  const byRow = new Map((state.raw || []).map(x => [String(x.row), x])), h = window.innerHeight, out = [];
  for (const c of document.querySelectorAll('[data-album-row]')) {
    const r = c.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > h) continue;
    const it = byRow.get(c.getAttribute('data-album-row')); if (it) out.push({ it, r, box: c.parentElement && c.parentElement.id });
    if (out.length >= 400) break;
  }
  return out;
}
function catalogFlipAfter(before, added) {          // (also when nothing was added: a release whose date or rating changed moves to its new place, sliding)
  if (!before || !before.length || (added || []).length > 60) return;
  const h = window.innerHeight;
  before.forEach(({ it, r, box }) => {
    const c = [...document.querySelectorAll(`[data-album-row="${CSS.escape(String(it.row))}"]`)].find(e => (e.parentElement && e.parentElement.id) === box); if (!c) return;
    const b = c.getBoundingClientRect(), dx = r.left - b.left, dy = r.top - b.top;
    if ((!dx && !dy) || Math.abs(dy) > h || b.bottom < 0 || b.top > h) return;
    c.style.transition = 'none'; c.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = 'transform 320ms cubic-bezier(.2,.7,.2,1)'; c.style.transform = ''; setTimeout(() => { c.style.transition = ''; }, 360); }));
  });
}
function catalogMarkArrived(items) {                 // releases that came in with a sync come into focus where they land
  if (!items.length || items.length > 60 || catalogCalm()) return;
  items.forEach((it, i) => document.querySelectorAll(`[data-album-row="${CSS.escape(String(it.row))}"]`).forEach(c => {
    c.style.animationDelay = Math.min(i, 12) * 45 + 'ms'; c.classList.add('card-arrive');          // (several at once: one after another)
    setTimeout(() => { c.classList.remove('card-arrive'); c.style.animationDelay = ''; }, 1500 + Math.min(i, 12) * 45);
  }));
}
async function fetchCatalogOnce(opts) {
  opts = opts || {};
  if (!CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
    showState('setup', 'albums');
    return;
  }
  if (!opts.retried && tokenExpMs(getStoredIdToken()) && tokenExpMs(getStoredIdToken()) < Date.now() + 30000) await authRenew();          // about to run out: renew first
  const idToken = getStoredIdToken();
  if (!idToken) { handleAuthError(); return; }
  let authRetry = false;

  // Guards against the visible symptom of double-tapping Refresh (or the
  // initial load and a manual refresh landing at the same time): two
  // in-flight requests racing to overwrite state.raw, where whichever
  // happens to resolve last wins regardless of which was actually more
  // recent. A plain boolean is enough since this only needs to block
  // *overlapping* calls, not queue them — the one already running will
  // finish and reflect the current data either way.
  fetchCatalogInFlight = true;
  const quiet = !!opts.quiet && (state.raw || []).length > 0;          // (with nothing on screen yet, there is nothing to keep: a full load)
  if (quiet) catalogSyncing(true);
  const placeBefore = gridPlaceSnapshot();          // where you are, before the loading state clears the view

  if (!quiet) showState('loading', 'albums');
  // If it's taking a while, say so explicitly rather than leaving the
  // original "Cataloguing…" message sitting there looking frozen — a
  // real full-catalog load (albums + diary + scrobbles + playlists all in
  // one Apps Script response) can legitimately take a while, especially
  // right after the script's been idle, and that's not the same thing as
  // being stuck.
  const slowNotice = setTimeout(() => {
    if (el.stateMsg && !el.stateMsg.hidden) {
      el.stateMsg.innerHTML = 'Still cataloguing… larger collections (or a Google Apps Script that\u2019s been idle a while) can take a bit longer than usual.';
    }
  }, 12000);
  try {
    // Previously a plain fetch() with no timeout at all, which meant a
    // genuine hang (Apps Script wedged, network dropped mid-request) left
    // the UI stuck forever with no error and no way to recover short of
    // reloading. The very first fix here used a 25s ceiling, which turned
    // out to be shorter than this app's own normal full-catalog load time
    // for at least some setups — that's a load that's just slow, not
    // stuck, and 25s was cutting it off every single time instead of only
    // the genuinely-hung case it was meant to catch. 90s is long enough to
    // clear a legitimately heavy load; the slowNotice above is what
    // actually addresses "is this frozen?" now, not an aggressive timeout.
    const writeGen = catalogWrites.started, writing = catalogWrites.inFlight;          // (see catalogWrites)
    const res = await fetchWithTimeout(
      CONFIG.SCRIPT_URL + '?id_token=' + encodeURIComponent(idToken),
      { method: 'GET' },
      90000
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (quiet && (opts.staleTries || 0) < 3 && (writing || catalogWrites.inFlight || catalogWrites.started !== writeGen)) { await catalogWritesSettled(); return { stale: true }; }          // read while the sheet was being written: done again
    if (isAuthError(data)) {                                        // the token ran out: renew it quietly and load again, once
      if (!opts.retried && await authRenew()) { authRetry = true; return; }
      handleAuthError(); return;
    }
    // Any other error shape from the backend (an Apps Script exception,
    // a malformed response, etc.) was previously falling straight through
    // here unnoticed — (data.rows || []) below just quietly defaults to an
    // empty array with no rows/diary/scrobbles, and nothing else in this
    // function distinguishes that from a genuinely empty-but-successful
    // catalog. The visible result was the app looking fully loaded ("All
    // Genres · 0", "No sleeves match your search") with no error message
    // anywhere — worse than an obvious failure, since there's nothing to
    // even suggest something's wrong. Surface it as a real error instead.
    if (data && data.error) {
      console.error('Apps Script returned an error:', data.error);
      if (quiet) flashGlobalToast('Couldn\u2019t sync with your sheet just now \u2014 \u27f3 to try again.'); else showState('error', 'albums', data.error);
      return;
    }

    // Genre taxonomy sync — per-account (via the backend's own Settings
    // sheet) rather than per-browser, so a taxonomy built up on one device
    // now actually shows up on another. Backend is the source of truth
    // once it has a value at all; localStorage stays as the fast local
    // cache used for the very first render (before this response has
    // even arrived) and as the fallback if this account has never synced
    // one yet (data.genreTaxonomy null — e.g. a brand new account, or one
    // that hasn't opened the taxonomy editor since this feature shipped).
    artistAliasesArrived(data); artistDetailsArrived(data);
    if (data.genreTaxonomy) {
      if (taxSyncState().dirty) {
        saveGenreTaxonomy(state.genreTaxonomy);          // this browser has changes the account never received: keep them and send them again, instead of replacing them with the account's older copy
      } else try {
        const synced = JSON.parse(data.genreTaxonomy);
        state.genreTaxonomy = synced;
        saveGenreTaxonomy(synced, { skipSync: true }); // refresh the local cache only — don't re-post what we just received
      } catch (e) { console.warn('Malformed genre taxonomy from backend, keeping local copy', e); }
    } else if (taxSyncState().dirty || (!taxSyncState().seeded && !taxIsDefault(state.genreTaxonomy))) {
      saveGenreTaxonomy(state.genreTaxonomy);            // the account has none yet and this browser has one of its own: put it there, so the next browser gets it
    }

    // Inside fetchCatalog(), update the state.raw mapping:
      state.catalogFetchedAt = Date.now();      // so the duplicate check knows how fresh its copy of the crate is
      state.backendTaxChunks = !!(data && data.taxChunks);          // the backend stores a long genre taxonomy in pieces
      state.backendRym = !!(data && data.rym);
      state.backendRymHist = !!(data && data.rymHist);        // the backend stores the history column          // the backend says it can store RYM ratings
      const freshRaw = (data.rows || [])
        .filter(r => r.Artist && r.Title)
        .map((r, i) => ({
          row: r._row,
          // Permanent, stable identifier — see apps-script-backend.gs's
          // AlbumId column/backfillAlbumIds(). Preferred over `row` by
          // playlistAlbumFor and friends wherever available, since `row`
          // itself shifts whenever an earlier row is deleted/inserted and
          // can even collide across two different albums after enough
          // sheet edits (the actual root cause of a playlist showing one
          // album's track under a completely different album's title/
          // artist). Blank for any album added before that backend change
          // and not yet backfilled — those fall back to the old row-based
          // lookup exactly as before.
          albumId: r.AlbumId ? String(r.AlbumId).trim() : '',
          artist: String(r.Artist).trim(),
          title: String(r.Title).trim(),
          type: (r.Type ? String(r.Type).trim() : 'Unknown'),
          releaseDate: r.ReleaseDate != null ? String(r.ReleaseDate) : '',
          recordedDate: r.Recorded != null ? String(r.Recorded) : '',
          genre: r.Genre || '',
          genre2: r.SecondaryGenre || '',
          label: r.Label ? String(r.Label).trim() : '',
          rymDescriptors: r.RymDescriptors ? String(r.RymDescriptors).trim() : '',          // Rate Your Music's descriptors (lo-fi, melodic…): their own field, because "Descriptor" is the EDITION label the duplicate check compares
          region: r.Region ? String(r.Region).trim() : '',
          // Where it happened — formed, recorded (studio), or played
          // (venue). Free text, geocoded client-side for the Map viewer
          // (see openMapModal/geocodeLocation). REQUIRES A BACKEND CHANGE
          // THIS FILE CAN'T MAKE: apps-script-backend.gs needs a
          // "Location" column read here and written on addAlbum/editAlbum,
          // same as Catalog/ManualTracks were added before.
          location: r.Location ? String(r.Location).trim() : '',
          cover: r.Cover ? String(r.Cover).trim() : '',
          rating: Number(r.Rating) || 0,
          review: r.Review || '',
          link: r.Link ? String(r.Link).trim() : '',
          rymLink: r.RymLink ? String(r.RymLink).trim() : '',
          rymRank: rymVotesNum(r.RymRank), rymBoldMark: String(r.RymBold == null ? '' : r.RymBold).trim() === '1' ? true : String(r.RymBold == null ? '' : r.RymBold).trim() === '0' ? false : undefined, rymUpdated: r.RymUpdated ? String(r.RymUpdated).trim() : '', rymUpdateLog: rymParseLog(r.RymUpdateLog), rymRating: rymNum(r.RymRating), rymVotes: rymVotesNum(r.RymVotes), rymSrc: rymNum(r.RymRating) ? (r.RymSrc === 'a' ? 'a' : 'm') : '', rymHist: rymParseHist(r.RymHistory),
          dateAdded: r.DateAdded || '',
          catalog: r.Catalog ? String(r.Catalog).trim() : 'CRT-' + String(i + 1).padStart(3, '0'),
          // Free-text release descriptor (e.g. "Deluxe Edition", "2024
          // Remaster") — same simple string-column pattern as Catalog just
          // above. Backend now has a "Descriptor" column read here and
          // written on addAlbum/editAlbum (added to apps-script-backend.gs
          // after the column was found missing entirely — the field had
          // been silently failing to persist since it first shipped).
          descriptor: r.Descriptor ? String(r.Descriptor).trim() : '',
          // Scene (a local music community/geographic cultural moment —
          // "Madchester", "Seattle grunge scene") and Movement (a broader
          // artistic/stylistic movement — "Post-Punk", "British
          // Invasion") — same plain string-column pattern as Descriptor
          // just above, added to apps-script-backend.gs's fields arrays
          // in the SAME pass as this frontend change specifically to
          // avoid repeating the exact mistake that silently dropped every
          // Descriptor save for months (see that bugfix's own changelog
          // entry) — the backend column and the frontend read/write both
          // need to exist together, not one now and the other "later".
          scene: r.Scene ? String(r.Scene).trim() : '',
          movement: r.Movement ? String(r.Movement).trim() : '',
          trackData: (function(){ try { return r.TrackData ? JSON.parse(String(r.TrackData)) : {}; } catch(e) { return {}; } })(),
          // Manually-typed tracklist (title + optional YouTube link per
          // track), entered via the Add/Edit forms — see showAddForm()'s
          // tracklist-builder rows and saveNewAlbum()/saveEditForm(). Same
          // JSON-in-a-column pattern as TrackData above. REQUIRES A BACKEND
          // CHANGE THIS FILE CAN'T MAKE: apps-script-backend.gs needs a new
          // "ManualTracks" column read here and written on addAlbum/editAlbum,
          // same as Catalog/TrackData were added before.
          manualTracks: (function(){ try { const arr = r.ManualTracks ? JSON.parse(String(r.ManualTracks)) : []; return Array.isArray(arr) ? arr : []; } catch(e) { return []; } })(),
          // Whether this album has EVER had a manual tracklist explicitly
          // saved against it — including an intentionally emptied one
          // (ManualTracks: "[]"). Deliberately separate from manualTracks
          // itself: manualTracks.length reaching 0 (user removed every
          // track via the tracklist builder / batch "Remove from
          // tracklist") must NOT be treated the same as an album that never
          // had a manual tracklist at all, or isManualAlbum() below falls
          // back to the iTunes/MusicBrainz auto-lookup and silently
          // repopulates the very tracks that were just deleted — which is
          // also why a release could never be made to have zero tracks.
          // r.ManualTracks is a non-empty string ("[]") once anything has
          // been saved, vs. "" / undefined when the column's never been
          // touched for that row, so this needs no backend change.
          hasManualTracklist: !!(r.ManualTracks && String(r.ManualTracks).trim())
        }));
      const flip = quiet ? catalogFlipBefore() : null;
      const rec = catalogReconcile(state.raw, freshRaw); state.raw = rec.raw;
      const sideBefore = quiet ? JSON.stringify([state.diary, state.scrobbles, state.playlists]) : '';

    state.diary = (data.diary || []).map(d => ({
      date: d.Date || '',
	  timestamp: d.Timestamp || '', // 👈 ADD THIS LINE
      artist: String(d.Artist || '').trim(),
      title: String(d.Title || '').trim(),
      row: d.Row || '',
      rating: Number(d.Rating) || 0,
      entryTitle: d.EntryTitle || '',
      description: d.Description || d.Note || '', // fall back to legacy Note column
      // Which tracks (if any) this entry covers — [{num, name}]. Absent/empty
      // means either a legacy entry (logged before track-level tracking) or
      // an entry saved with nothing checked. `full` marks a whole-album listen.
      tracks: (function(){ try { return d.Tracks ? JSON.parse(String(d.Tracks)) : []; } catch(e) { return []; } })(),
      full: d.Full === true || d.Full === 'TRUE' || d.Full === 1 || d.Full === '1'
    }));

    state.scrobbles = (data.scrobbles || []).map(s => ({
      row: s.Row || '',
      artist: String(s.Artist || '').trim(),
      title: String(s.Title || '').trim(),
      day: s.Date || '',
      track: String(s.Track || '').trim(), // blank on older album/day-only rows, imported pre-track-tracking
      playCount: Number(s.PlayCount) || 0
    }));

    // Playlists: PlaylistItems rows are grouped under their PlaylistId and
    // sorted by Position, then nested into each playlist's `items` array.
    const itemsByPlaylist = {};
    (data.playlistItems || []).forEach(it => {
      const pid = it.PlaylistId;
      if (!pid) return;
      if (!itemsByPlaylist[pid]) itemsByPlaylist[pid] = [];
      itemsByPlaylist[pid].push({
        id: it.Id,
        type: it.ItemType === 'track' ? 'track' : 'album',
        // Preferred way to resolve which album this item belongs to — see
        // state.raw's own albumId field and playlistAlbumFor. Blank for any
        // item added before this backend change (falls back to `row`).
        albumId: it.AlbumId ? String(it.AlbumId).trim() : '',
        row: it.Row,
        trackNum: it.TrackNum || '',
        // String(...) here, not just `|| ''` — a purely-numeric track title
        // ("21", "1989", etc.) can round-trip from the sheet as a real
        // number rather than text (Sheets auto-detects it on write), and
        // every other field parsed here (Artist/Title/etc.) already guards
        // against that the same way. Without this, a numeric-looking track
        // name broke playlist tracklist rendering with a ".toLowerCase is
        // not a function" error.
        trackName: String(it.TrackName || '').trim(),
        position: Number(it.Position) || 0
      });
    });
    Object.values(itemsByPlaylist).forEach(arr => arr.sort((a, b) => a.position - b.position));

    // Folders are client-side only (see state.playlistFolders /
    // playlistFolderMap comments) — not touched here, just applied onto
    // each fresh playlist row below.
    state.playlists = (data.playlists || [])
      .filter(p => p.Id)
      .map(p => ({
        id: p.Id,
        name: p.Name ? String(p.Name).trim() : 'Untitled Playlist',
        description: p.Description || '',
        createdAt: p.CreatedAt || '',
        updatedAt: p.UpdatedAt || '',
        folderId: state.playlistFolderMap[p.Id] || null,
        items: itemsByPlaylist[p.Id] || []
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)); // newest first

    // Drop map entries for playlists that no longer exist (deleted elsewhere)
    // so the map doesn't grow stale forever.
    const livePlaylistIds = new Set(state.playlists.map(p => p.id));
    Object.keys(state.playlistFolderMap).forEach(pid => {
      if (!livePlaylistIds.has(pid)) delete state.playlistFolderMap[pid];
    });

    if (quiet && !rec.changed && JSON.stringify([state.diary, state.scrobbles, state.playlists]) === sideBefore) return;          // a sync that found nothing new: nothing on screen moves
    keepGridPlace(() => { buildLeftList(); renderPlaylistSidebar(); updateMainLabel(); applyFiltersSort(); }, placeBefore);          // (a reload after an add, a remove or an edit keeps you where you were)
    prefetchArt(state.raw);
    if (state.activeTab === 'artist') { renderArtistList(); renderArtistDetail(); }
    checkAlbumAnniversaries();
    checkForDuplicateRows();
    if (quiet) { catalogFlipAfter(flip, rec.added); catalogMarkArrived(rec.added); rymUpdateAdded(rec.added); afQueueAdded(rec.added); if (typeof locQueueAdded === 'function') locQueueAdded(rec.added); }
  } catch (err) {
    console.error(err);
    // AbortError is fetchWithTimeout's controller.abort() firing — a real
    // timeout, not a network/server failure, and worth telling the person
    // apart from "check your Apps Script URL" (which isn't the problem
    // when it's just slow).
    if (quiet) flashGlobalToast('Couldn\u2019t sync with your sheet just now \u2014 \u27f3 to try again.'); else showState(err.name === 'AbortError' ? 'timeout' : 'error', 'albums');
  } finally {
    clearTimeout(slowNotice);
    fetchCatalogInFlight = false; if (quiet) catalogSyncing(false);
    if (authRetry) setTimeout(() => fetchCatalog({ retried: true, quiet: opts.quiet }), 0);          // (a return inside the try skips anything after this block)
  }
}
