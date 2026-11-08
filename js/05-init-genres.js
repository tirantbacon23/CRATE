// CRATE — init(), genre tree and scenes, genre autocomplete and taxonomy editor.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.

// ---- Export to Obsidian: the dialog (the notes themselves are made by obsBuild above) ----
async function obsTracksFor(item) {                                   // the tracks as the release shows them; only a tracklist you keep yourself, or one already loaded, is used (nothing is looked up on the web for this)
  let tracks = state.trackCache[artKey(item)];
  if (!Array.isArray(tracks) || !tracks.length) { tracks = []; if (item.manualTracks && item.manualTracks.length) { try { tracks = (await getTracksFor(item)) || []; } catch (e) { tracks = []; } } }
  return tgRowsFrom(tracks, item.trackData || {}).map(r => ({ title: r.title, side: r.side, length: r.length, rating: r.rating, listened: r.listened, note: r.note, rymRating: r.rymRating, rymVotes: r.rymVotes, youtube: r.youtube, spotify: r.spotify, soundcloud: r.soundcloud }));
}
function obsOpen() {
  const g = (id) => document.getElementById(id);
  g('obsScopeAllN').textContent = `(${state.raw.length.toLocaleString()})`; g('obsScopeViewN').textContent = `(${(state.filtered || state.raw).length.toLocaleString()})`;
  g('obsScopeAll').checked = true; g('obsMsg').textContent = ''; g('obsOverlay').hidden = false; g('obsGo').focus();
}
function obsClose() { document.getElementById('obsOverlay').hidden = true; }
async function obsRun() {
  const g = (id) => document.getElementById(id), btn = g('obsGo'), msg = g('obsMsg'); if (btn.disabled) return;
  btn.disabled = true; btn.textContent = 'Building\u2026'; msg.textContent = '';
  try {
    const items = (g('obsScopeView').checked ? (state.filtered || state.raw) : state.raw) || [], withTracks = g('obsTracks').checked, releases = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      releases.push({ artist: it.artist, title: it.title, type: it.type, releaseDate: it.releaseDate, recordedDate: it.recordedDate, genre: it.genre, genre2: it.genre2, label: it.label, catalog: it.catalog, rating: it.rating, rymRating: it.rymRating, rymVotes: it.rymVotes, rymRank: it.rymRank, rymDescriptors: it.rymDescriptors, rymLink: it.rymLink, link: it.link, cover: it.cover, review: it.review, region: it.region, location: it.location, dateAdded: it.dateAdded, tracks: withTracks ? await obsTracksFor(it) : [] });
      if (i % 200 === 199) await new Promise(r => setTimeout(r, 0));                // let the page breathe on a big crate
    }
    const out = obsBuild({ releases, taxonomy: state.genreTaxonomy, options: { tracks: withTracks, reviews: g('obsReviews').checked }, now: Date.now() });
    if (out.files.length > 65000) { msg.textContent = `That would be ${out.files.length.toLocaleString()} notes, more than one zip can hold. Narrow it with \u201cWhat\u2019s showing now\u201d.`; return; }
    const enc = new TextEncoder(), zip = zipStore(out.files.map(f => ({ path: f.path, data: enc.encode(f.text) })), new Date()), d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const name = `crate-obsidian-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`, url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    const c = out.counts; msg.textContent = `Made ${name}: ${out.files.length.toLocaleString()} notes (${c.releases.toLocaleString()} releases, ${c.artists.toLocaleString()} artists, ${c.genres.toLocaleString()} genres, ${c.labels.toLocaleString()} labels)${c.skipped ? `; ${c.skipped} release${c.skipped === 1 ? '' : 's'} without an artist or title left out` : ''}.`;
    flashGlobalToast(`Exported ${out.files.length.toLocaleString()} notes to ${name}.`);
  } catch (e) { console.warn('Obsidian export failed', e); msg.textContent = 'Something went wrong making the notes: ' + String((e && e.message) || e).slice(0, 160); }
  finally { btn.disabled = false; btn.textContent = 'Export'; }
}
(function wireObsidianExport() {
  const g = (id) => document.getElementById(id); if (!g('obsOverlay')) return;
  g('menuObsidianExport').addEventListener('click', obsOpen); g('obsClose').addEventListener('click', obsClose); g('obsCancel').addEventListener('click', obsClose); g('obsGo').addEventListener('click', obsRun);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !g('obsOverlay').hidden) { e.preventDefault(); e.stopPropagation(); obsClose(); } }, true);          // for the whole page: the download link takes the cursor with it
})();

function getGenreParents(taxonomy, genre) {
  const key = genreTaxonomyKey(genre), entry = taxonomy[key]; let own = (entry && entry.parents) || [];
  // A genre from a release's Scene field also sits under "Scenes", one from its Movement field under "Movements", besides any parents of its own;
  // and those two sit under "Scenes & Movements" (unless the taxonomy gives them parents itself). Labels as the taxonomy spells them, when it has them.
  // "Scenes & Movements" and "Scenes and Movements" are one group, named as your taxonomy names it; a genre you filed straight under it goes under
  // its Scenes or Movements instead, so the group only ever holds those two.
  const label = (k) => (taxonomy[k] && taxonomy[k].label) || SCENE_PARENTS[k], group = sceneGroupLabel(taxonomy), toGroup = (p) => isSceneGroup(p) ? group : p;
  if (isSceneGroup(key)) return own;
  if (key === 'scenes' || key === 'movements') return own.length ? [...new Set(own.map(toGroup))] : [group];
  const kinds = sceneGenreKeys().get(key), direct = own.some(isSceneGroup);
  if (!kinds && !direct) return own;
  own = own.filter(p => !isSceneGroup(p));
  const have = new Set(own.map(genreTaxonomyKey)), add = [];
  const scene = kinds ? kinds.has('scene') : false, movement = kinds ? kinds.has('movement') : false;
  if (direct && !scene && !movement && !have.has('scenes') && !have.has('movements')) add.push(label(/\bmovement$/i.test(String(genre).trim()) ? 'movements' : 'scenes'));          // filed under the group with no Scene or Movement field to say which: a "… Movement" is a movement, anything else a scene
  if (scene && !have.has('scenes')) add.push(label('scenes'));
  if (movement && !have.has('movements')) add.push(label('movements'));
  return add.length ? own.concat(add) : own;
}
const SCENE_PARENTS = { scenes: 'Scenes', movements: 'Movements' };
function isSceneGroup(g) { return String(g || '').trim().toLowerCase().replace(/\s*(?:&|\+|\band\b)\s*/g, ' and ').replace(/\s+/g, ' ') === 'scenes and movements'; }
function sceneGroupLabel(taxonomy) {                                 // the group's name as the taxonomy spells it (the "&" spelling if it has both), "Scenes & Movements" if it has none; kept for two seconds
  if (sceneGroupCache && sceneGroupCache.tax === taxonomy && Date.now() - sceneGroupCache.at < 2000) return sceneGroupCache.label;
  const seen = [];
  Object.values(taxonomy || {}).forEach(e => { if (!e) return; [e.label, ...(e.parents || [])].forEach(p => { if (isSceneGroup(p)) seen.push(String(p).trim()); }); });
  const label = seen.find(s => s.includes('&')) || seen[0] || 'Scenes & Movements';          // both spellings there: the "&" one
  sceneGroupCache = { tax: taxonomy, at: Date.now(), label }; return label;
}
let sceneGroupCache = null;
function sceneGenreKeys() {                                          // genre key → the field(s) it comes from ('scene', 'movement') across the crate; kept for two seconds, like sceneKnownGenres
  if (sceneKeysCache && Date.now() - sceneKeysCache.at < 2000) return sceneKeysCache.map;
  const map = new Map(); sceneKeysCache = { at: Date.now(), map };
  (state.raw || []).forEach(r => { if (r.scene || r.movement) sceneGenreParts(r).forEach(p => { const k = genreTaxonomyKey(p.name); if (!map.has(k)) { const s = new Set(); s.label = p.name; map.set(k, s); } map.get(k).add(p.kind); }); });
  return map;
}
// The labels of every genre whose parents may come from those rules, for listing a genre's sub-genres (genreFamilyOf): the taxonomy's, plus the genres the
// Scene and Movement fields give, plus Scenes and Movements themselves.
function genreLabelsWithRuleParents(taxonomy) {
  const out = new Map(); Object.values(taxonomy).forEach(e => { if (e && e.label) out.set(genreTaxonomyKey(e.label), e.label); });
  sceneGenreKeys().forEach((s, k) => { if (!out.has(k)) out.set(k, s.label); });
  ['scenes', 'movements'].forEach(k => { if (!out.has(k)) out.set(k, SCENE_PARENTS[k]); });
  return [...out.values()];
}

// Every ancestor reachable through ANY parent branch (a genre with two
// parents pulls in both branches' ancestors) — a breadth-first walk over
// what's really a DAG now, not a single chain. `visited` guards against a
// cyclical taxonomy (shouldn't be reachable via wouldCreateGenreCycle's own
// check, but defends anyway) rather than looping forever.
function getGenreAncestors(taxonomy, genre) {
  const result = [];
  const visited = new Set([genreTaxonomyKey(genre)]);
  let frontier = [genre];
  while (frontier.length) {
    const next = [];
    frontier.forEach(g => {
      getGenreParents(taxonomy, g).forEach(parent => {
        const pk = genreTaxonomyKey(parent);
        if (visited.has(pk)) return;
        visited.add(pk);
        result.push(parent);
        next.push(parent);
      });
    });
    frontier = next;
  }
  return result;
}

// True if `genre` IS filterGenre, or has filterGenre anywhere above it in
// the taxonomy — the actual "filtering by Rock also surfaces Shoegaze (and
// Glam Punk, via either of its two parents)" behavior, used both by the
// navFilter match (searchFilteredRaw's matchesNav) and buildGenreTree's
// aggregated counts below.
function genreMatchesFilter(taxonomy, genre, filterGenre) {
  if (genreTaxonomyKey(genre) === genreTaxonomyKey(filterGenre)) return true;
  return getGenreAncestors(taxonomy, genre).some(a => genreTaxonomyKey(a) === genreTaxonomyKey(filterGenre));
}
// The genre PICKED in the left panel: the genre itself and, unless "Selected genre only" is on (the ⇅ menu), everything under it. The grid, "Closest genre match", the genre weight bar and the stats
// beside it all ask this one question, so they cannot disagree.
function genreNavMatches(taxonomy, genre, filterGenre) {
  if (genreTaxonomyKey(genre) === genreTaxonomyKey(filterGenre)) return true;
  return !state.genreNavExact && genreMatchesFilter(taxonomy, genre, filterGenre);
}

// How strongly a release belongs to the currently-active genre nav-filter,
// as a 0-1 weight — 1.0 if the filtered genre is the release's PRIMARY
// genre, 0.5 if it's only the secondary genre, 0.333 for a third slot, etc.
// Same harmonic-decay convention as the New Release Radar genre weighting
// (1st = 1.0, 2nd = 0.5, 3rd = 0.333...), reused here so "how much of this
// release is that genre" reads consistently across the app. Returns null
// when no genre filter is active, or when (defensively — shouldn't happen,
// since an item only reaches the grid under a genre filter because one of
// its genres already matched) none of the item's genres actually match.
function genreFilterWeight(item) {
  if (!(state.navFilter && state.navFilter.mode === 'genre')) return null;
  const genres = getGenreList(combinedGenreStr(item));
  const idx = genres.findIndex(g => genreNavMatches(state.genreTaxonomy, g, state.navFilter.value));
  return idx === -1 ? null : 1 / (idx + 1);
}

// Would adding `parent` as one of genre's parents create a cycle (genre
// already sits somewhere above parent, through any branch)? Checked before
// saving any taxonomy edit, once per newly-typed parent.
function wouldCreateGenreCycle(taxonomy, genre, parent) {
  if (genreTaxonomyKey(genre) === genreTaxonomyKey(parent)) return true;
  return getGenreAncestors(taxonomy, parent).some(a => genreTaxonomyKey(a) === genreTaxonomyKey(genre));
}


let quickPeekItem = null;
let quickPeekSeq = 0;
let quickPeekOpenedAt = 0;
const QP_DOUBLE_CLICK_WAIT = 500;          // ms: Windows' default double-click time; the inline popup scrolls into view only after it
let quickPeekCardEl = null;          // the card the popup was opened from (‹ › move to its neighbours)
let quickPeekSelectedTracks = new Set(); // trackNum::trackName keys — reset each time the peek opens for a (possibly different) album
let quickPeekLastSelectedKey = null;
let quickPeekOriginalParent = null; // where #albumQuickPeek normally lives in the DOM — captured once, restored on every close
let quickPeekOriginalNextSibling = null;

const badArtUrls = {}; // key -> the src that already failed once for it — see recoverFailedArt/bindEvents' delegated error listener. Declared here (not next to recoverFailedArt further down) for the same TDZ reason as the quickPeek/genre-taxonomy fixes above: bindEvents() runs synchronously as part of this same startApp() cascade and references it immediately.
const artFetchInFlight = new Set(); // keys with a fetchArt() call already outstanding — see buildCard's own belt-and-suspenders fetch call, guards against firing off duplicate iTunes lookups for the same item if a grid re-renders rapidly (e.g. typing a search query) before the first one resolves. Same TDZ placement reasoning as badArtUrls just above — buildCard (and by extension this) runs as part of the same early render cascade.

let artApplyPending = null;          // keys of covers that just arrived, put on the page together by applyCachedArtFor. Declared here for the same TDZ reason as artFetchInFlight just above
const ART_LOOKUPS_AT_ONCE = 4; let artLookupsActive = 0; const artLookupWaiting = [];   // iTunes cover lookups running / waiting for a turn (see artLookupSlot). Same TDZ reason

// Page-state classes, kept here instead of CSS :has(). Ten rules like body:has(.mini-player.docked-top:not([hidden])) made the browser
// re-check the styles of the WHOLE page (about 18 ms with a big crate) every time any element was added, removed or shown: each card
// the covers grid builds or empties as you scroll, opening the cover popup... Now a few observers watch just the elements those rules
// were about and set: body.mp-docked-top, body.dialog-open, body.qa-open, and .topbar.search-focus / .topbar.search-has-value.
(function bodyStateClasses() {
  const body = document.body, mp = document.getElementById('miniPlayer'), qa = document.getElementById('qaOverlay'), sw = document.getElementById('searchWrap'), top = sw && sw.closest('.topbar');
  const overlays = document.getElementsByClassName('arrange-overlay');          // live: includes dialogs made later
  const floating = document.getElementsByClassName('floating-modal');          // Panels configuration and Panel Settings: dialogs without an overlay, full-screen on a phone
  const paintMp = () => body.classList.toggle('mp-docked-top', !!(mp && mp.classList.contains('docked-top') && !mp.classList.contains('detached') && !mp.hidden));
  const paintDialogs = () => { let open = false; for (const o of overlays) { if (!o.hidden) { open = true; break; } } if (!open) for (const f of floating) { if (!f.hidden) { open = true; break; } } body.classList.toggle('dialog-open', open); };
  const paintQa = () => body.classList.toggle('qa-open', !!(qa && qa.classList.contains('open')));
  const paintSearch = () => { if (!top || !sw) return; top.classList.toggle('search-focus', sw.contains(document.activeElement)); top.classList.toggle('search-has-value', sw.classList.contains('mobile-search-has-value')); };
  const watchAttrs = new MutationObserver((recs) => { let m = false, d = false, q = false, s2 = false; recs.forEach(r => { if (r.target === mp) m = true; else if (r.target === qa) q = true; else if (r.target === sw) s2 = true; else d = true; }); if (m) paintMp(); if (d) paintDialogs(); if (q) paintQa(); if (s2) paintSearch(); });
  const watched = new WeakSet(), watch = (o) => { if (!watched.has(o)) { watched.add(o); watchAttrs.observe(o, { attributes: true, attributeFilter: ['hidden'] }); } };
  if (mp) watchAttrs.observe(mp, { attributes: true, attributeFilter: ['class', 'hidden'] });
  if (qa) watchAttrs.observe(qa, { attributes: true, attributeFilter: ['class'] });
  if (sw) { watchAttrs.observe(sw, { attributes: true, attributeFilter: ['class'] }); sw.addEventListener('focusin', paintSearch); sw.addEventListener('focusout', () => setTimeout(paintSearch, 0)); }
  for (const o of overlays) watch(o);
  for (const f of floating) watch(f);
  new MutationObserver((recs) => { let any = false; recs.forEach(r => { r.addedNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains('arrange-overlay')) { watch(n); any = true; } }); r.removedNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains('arrange-overlay')) any = true; }); }); if (any) paintDialogs(); }).observe(body, { childList: true });
  paintMp(); paintDialogs(); paintQa(); paintSearch();
})();

const GRID_EAGER = 120, GRID_LAZY_AHEAD = '1600px 0px', GRID_UNLOAD_BEYOND = '5000px 0px';          // see buildGridSection; declared here because the grid can be drawn while startApp runs
let gridEagerLeft = 0, gridEagerTick = false, gridLazyObs = null, gridLazyRoot = null, gridUnloadObs = null;
const jobsState = { waiting: [], timer: 0, nextTimer: 0, nextAt: 0, rymLast: null, rymLogged: true, scan: null, acts: [], runRows: [], held: false, pausing: false, filter: 'all', menu: false, dragging: null };          // see Processing (jobsCollect)          // see Activity (jobsCollect)
let sceneKnownCache = null, sceneKeysCache = null;          // see sceneKnownGenres / sceneGenreKeys: genres are read while startApp draws the first page

// (startApp() used to be called here; it now runs in js/99-boot.js, once every file has loaded)

// iOS Safari's own dynamic toolbar (address bar + bottom bar) can leave
// `position:fixed; bottom:0` elements (.nav-tabs, .mini-player) visually
// "stuck" at the OLD viewport edge for a moment when the toolbar collapses
// on scroll, instead of immediately re-anchoring to the new, taller
// visible area — leaving a gap the height of the now-hidden toolbar below
// them until something forces a reflow. window.innerHeight tracks the
// LAYOUT viewport (the large one, toolbar-collapsed size), while
// visualViewport.height + offsetTop tracks the actually-visible area right
// now — the difference is exactly that gap. Feeding it into a CSS custom
// property and adding it to .nav-tabs/.mini-player's own `bottom` offset
// (rather than trusting position:fixed alone to stay in sync) keeps them
// flush against whatever's actually visible, self-correcting on every
// visualViewport resize/scroll rather than only on next reflow. Resolves
// to 0 (no-op) on anything without visualViewport support, or wherever the
// bug doesn't apply (desktop, Android).
function syncMobileChromeGap() {
  if (!window.visualViewport) return;
  const gap = Math.max(0, window.innerHeight - (window.visualViewport.height + window.visualViewport.offsetTop));
  document.documentElement.style.setProperty('--mobile-chrome-gap', gap + 'px');
}

async function init() {
  state.genreTaxonomy = loadGenreTaxonomy();
  syncMobileChromeGap();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncMobileChromeGap);
    window.visualViewport.addEventListener('scroll', syncMobileChromeGap);
  }
  el.menuAppVersion.textContent = 'CRATE v' + APP_VERSION;
  loadPrefs();
  loadCoverageCache();
  updateGroupByMenuUI();
  el.sizeSlider.value = state.cardSize;
  setViewMode(state.viewMode);
  applyMainViewMode();
  el.gridContainer.style.setProperty('--card-min', state.cardSize + 'px');
  el.leftModeLabel.textContent = capitalize(state.leftMode) + 's';
  updateLeftMenuUI();
  el.toggleLeftPanel.checked = state.showLeft;
  el.toggleRightPanel.checked = state.showRight;
  el.queueViewModeSelect.value = state.queueViewMode;
  el.trackInfoShowPlayerToggle.checked = state.trackInfoShowPlayer;
  el.trackInfoShowVideoToggle.checked = state.trackInfoShowVideo;
  el.albumQuickPeekStyleSelect.value = state.albumQuickPeekStyle;
  el.addResultsListBtn.classList.toggle('active', !state.releaseSearchGridView);
  el.addResultsGridBtn.classList.toggle('active', state.releaseSearchGridView);
  el.historyLayoutChronoBtn.classList.toggle('active', state.lastfmHistoryLayout !== 'byDay');
  el.historyLayoutByDayBtn.classList.toggle('active', state.lastfmHistoryLayout === 'byDay');
  el.historyViewListBtn.classList.toggle('active', state.lastfmHistoryViewMode !== 'grid');
  el.historyViewGridBtn.classList.toggle('active', state.lastfmHistoryViewMode === 'grid');
  el.toggleCoverLinks.checked = state.showCoverLinks;
  el.gridContainer.classList.toggle('hide-cover-links', !state.showCoverLinks);
  el.toggleFitArtwork.checked = state.fitArtwork;
  el.gridContainer.classList.toggle('contain-art', !state.fitArtwork);
  el.fieldPlacementGroup.hidden = !state.fitArtwork;
  el.fieldPlacementOverlay.checked = state.fieldPlacement === 'overlay';
  el.fieldPlacementBelow.checked = state.fieldPlacement !== 'overlay';
  el.gridContainer.classList.toggle('overlay-fields', state.fitArtwork && state.fieldPlacement === 'overlay');
  el.toggleCloseGaps.checked = state.closeGaps;
  el.toggleLeftNavCompact.checked = state.leftNavCompact;
  el.gridContainer.classList.toggle('close-gaps', state.closeGaps);
  el.leftPanel.style.flexBasis = state.panelWidths.left + 'px';
  el.rightPanel.style.flexBasis = state.panelWidths.right + 'px';
  if (el.leftNavPanel) el.leftNavPanel.style.flexBasis = state.panelWidths.leftNav + 'px';
  applyLeftNavCompact(); // after the manual-width restore just above, since compact mode needs to win over whatever inline flexBasis that (or a manual drag-resize) sets — see its own comment for why
  applyPanelVisibility();

  // bindEvents()/makeResizable() attach listeners with no removal step, so
  // re-running them on a second init() (signOut() then signing back in, or
  // handleAuthError() bouncing back to the gate mid-session, both reset
  // appEntered and lead back here on the same live DOM) would double-bind
  // every listener they set up. A doubled toggle listener is the visible
  // symptom — e.g. the "Albums ▾" dropdown's click handler firing twice
  // opens then immediately closes it again in the same click, so it looks
  // like the dropdown "stops working" — but every other button bound here
  // is equally double-bound, just less noticeably. Only do this once.
  if (!eventsBound) {
    eventsBound = true;
    bindEvents();
    makeResizable(el.resizerLeft, el.leftPanel, 'left');
    makeResizable(el.resizerRight, el.rightPanel, 'right');
    if (el.resizerLeftNav && el.leftNavPanel) makeResizable(el.resizerLeftNav, el.leftNavPanel, 'leftNav', 64, 220);
  }

  if (loadSpotifyPlayerPrefs().detached) setPlayerDetached(true); // restore floating-window state (still hidden until playback starts)

  handleSpotifyAuthRedirect().then(() => {
    initSpotifyPlayerIfReady(); // registers this tab as a Connect device
    refreshNowPlayingFromWebApi(); // shows whatever's already playing elsewhere, right away
  }); // fire-and-forget, doesn't block first paint

  // Keep polling afterwards, too. The Web Playback SDK's player_state_changed
  // event is only reliably fired for this tab's own local "CRATE" device —
  // when playback is actually happening on a different Spotify Connect
  // device (a TV, a phone, a speaker...), track changes there don't always
  // reach us as SDK events. Polling the Web API is the fallback that catches
  // those changes instead of leaving the mini player stuck on a stale track.
  setInterval(refreshNowPlayingFromWebApi, 6000);

  await fetchCatalog();
  applyPanelLayout(); // covers all three panels — see its own comment. Right panel's own piece needs to run after fetchCatalog so state.scrobbles/state.raw are populated if History is on; also this is the earliest safe point for crateQueueList (declared later in the file — see the genre-taxonomy TDZ note above for why that matters)
  applyAddFormFieldVisibility();
  maybeRunBackgroundLastfmSync(); // fire-and-forget; doesn't block first paint
  maybeAutoScanNewReleases(); // same — see its own comment for the throttling
}

function getGenreList(genreStr) {
  if (!genreStr || typeof genreStr !== 'string' || !genreStr.trim()) return ['Unknown'];
  return genreStr.split(',').map(g => g.trim()).filter(g => g.length > 0);
}

// Merges primary + secondary genre into one comma string so genre-list/filter/
// search call sites can treat both the same way without every one of them
// needing to know secondary genre exists as a separate field. Primary-only
// items behave exactly as before (secondary is just blank).
// A release's Scene and Movement count as genres (Rate Your Music files scenes and movements in its genre tree: Canterbury Scene, Madchester…), after its
// secondary genres. One already in its genre lists isn't repeated, "Canterbury" and "Canterbury Scene" counting as the same.
function sceneNameKey(g) { return String(g || '').trim().toLowerCase().replace(/\s+(scene|movement)$/, ''); }          // "Canterbury" and "Canterbury Scene" are one name
function sceneGenreParts(item) {                                     // the genres a release's Scene and Movement fields give, each with which field it came from: [{ name, kind: 'scene' | 'movement' }]
  if (!item.scene && !item.movement) return [];
  const out = [], seen = new Set(), known = sceneKnownGenres();
  [[item.scene, 'Scene', 'scene'], [item.movement, 'Movement', 'movement']].forEach(([l, word, kind]) => String(l || '').split(',').forEach(g => {
    let t = g.trim(); const k = sceneNameKey(t); if (!t || seen.has(k)) return;
    if (!/\s(scene|movement)$/i.test(t)) t = known.get(genreTaxonomyKey(t + ' ' + word)) || t;          // "Canterbury" typed as a scene IS the genre "Canterbury Scene" when CRATE knows that one
    seen.add(k); out.push({ name: t, kind });
  }));
  return out;
}
function sceneGenreStr(item) {                                       // those of them not already in the release's genre lists
  const parts = sceneGenreParts(item); if (!parts.length) return '';
  const inLists = new Set(); [item.genre, item.genre2].forEach(l => String(l || '').split(',').forEach(g => { if (g.trim()) inLists.add(sceneNameKey(g)); }));
  return parts.filter(p => !inLists.has(sceneNameKey(p.name))).map(p => p.name).join(', ');
}
function sceneKnownGenres() {                                        // every genre name in the taxonomy and in the crate's genre lists, by key; kept for two seconds (it is asked for every release)
  if (sceneKnownCache && Date.now() - sceneKnownCache.at < 2000) return sceneKnownCache.map;
  const map = new Map(), put = (g) => { const t = String(g || '').trim(); if (t) { const k = genreTaxonomyKey(t); if (!map.has(k)) map.set(k, t); } };
  Object.keys(state.genreTaxonomy || {}).forEach(k => put((state.genreTaxonomy[k] || {}).label || k));
  (state.raw || []).forEach(r => [r.genre, r.genre2].forEach(l => String(l || '').split(',').forEach(put)));
  sceneKnownCache = { at: Date.now(), map }; return map;
}
function combinedGenreStr(item) {
  const primary = (item.genre || '').trim();
  const secondary = [(item.genre2 || '').trim(), sceneGenreStr(item)].filter(Boolean).join(', ');          // scenes and movements are genres too (sceneGenreStr)
  if (!primary) return secondary;
  if (!secondary) return primary;
  return primary + ', ' + secondary;
}

// Every genre that applies to this release — its own genre/secondary
// genre, PLUS any per-track genre override set via "Edit track
// properties…" (item.trackData[trackNum].genre). A track-level genre is
// cheap to check here: trackData lives on the crate item itself (loaded
// eagerly with everything else in fetchCatalog), not inside a tracklist
// that would need fetching. Used everywhere a release's genre is
// determined for taxonomy/filtering/grouping purposes (buildGenreTree,
// the left panel's Genre filter, "Group by Genre", the search index) so a
// track tagged with a genre the album itself isn't makes that release
// show up under that genre too — e.g. one Ambient interlude on an
// otherwise Rock album surfaces the album when filtering by Ambient,
// without needing to also tag the whole release Ambient. Doesn't touch
// combinedGenreStr's own callers that are just displaying the album's own
// genre as plain text (the Map viewer's attribute table) — those stay
// album-only on purpose, since folding in every track's genre there would
// clutter a single summary column rather than aid filtering.
function allGenresForItem(item) {
  const albumGenres = getGenreList(combinedGenreStr(item));
  const trackGenres = new Set();
  if (item.trackData) {
    Object.values(item.trackData).forEach(td => {
      const g = (td && td.genre || '').trim();
      if (g) trackGenres.add(g);
    });
  }
  if (!trackGenres.size) return albumGenres;
  const merged = new Set(albumGenres.filter(g => g !== 'Unknown'));
  trackGenres.forEach(g => merged.add(g));
  return merged.size ? [...merged] : ['Unknown'];
}

// How much a genre's POSITION in a release's own combined Genre/Secondary
// Genre list counts toward that genre's tally in buildGenreTree below —
// harmonic decay (1st = 1.0, 2nd = 0.5, 3rd = 0.333, 4th = 0.25, ...:
// weight = 1 / position). Reflects that the first genre listed is usually
// the release's actual primary identity and each one after characterizes
// it further but less definitively — e.g. RYM lists King Crimson's "In the
// Court of the Crimson King" as primarily Progressive Rock, with Art Rock
// as a real but secondary descriptor, not an equally-weighted second
// identity. Halving outright (1.0/0.5/0.25/0.125) was considered and
// rejected — it craters too fast for an album that's just thoroughly
// tagged with 4-5 genres, punishing thoroughness rather than reflecting
// prominence. i is 0-indexed (array position), so position = i + 1.
function genrePositionWeight(i) {
  return 1 / (i + 1);
}

// Builds the left panel's genre-mode row list as a hierarchy: every known
// genre (tagged on some album, OR purely organizational — named in the
// taxonomy but never itself tagged), each with an AGGREGATED count (its
// own direct tags plus every descendant's), indented under its parent and
// alphabetized within each level of siblings. A genre with a 0 aggregated
// count (organizational, nothing tagged under it yet within the current
// search-filtered set) is left out — same idea as the old flat list never
// showing genres with no matches. Counts are now WEIGHTED by each genre's
// position within the release's own combined Genre/Secondary Genre list —
// see genrePositionWeight() just above. Rounded to 1 decimal for
// display; comparisons/aggregation use the full-precision value. This
// counting is deliberately album-level only (getGenreList(combinedGenreStr),
// not allGenresForItem) — a per-track genre override changes what shows in
// that track's own Genre column (see trackColumnVal) but must NOT change
// which genre(s) the release itself is considered to belong to here.
function buildGenreTree(sourceRaw, taxonomy) {
  const ownCount = new Map(); // normKey -> {label, count}
  sourceRaw.forEach(item => {
    genreTagsForRole(item, state.genreRole).forEach((g, i) => {      // the genres in the chosen role, weighted by their position in THAT list, so a count never promises what clicking it can't show
      const key = genreTaxonomyKey(g);
      const weight = genrePositionWeight(i);
      if (!ownCount.has(key)) ownCount.set(key, { label: g, count: 0 });
      ownCount.get(key).count += weight;
    });
  });

  const labelByKey = new Map();
  ownCount.forEach((v, k) => labelByKey.set(k, v.label));
  Object.entries(taxonomy).forEach(([key, entry]) => {
    if (!labelByKey.has(key)) labelByKey.set(key, entry.label);
    entry.parents.forEach(parent => {
      const parentKey = genreTaxonomyKey(parent);
      if (!labelByKey.has(parentKey)) labelByKey.set(parentKey, parent);
    });
  });

  // Parents that come from CRATE's own rules rather than the taxonomy (Scenes / Movements / Scenes and Movements: see getGenreParents) need
  // rows of their own, or their branches would have no root and vanish. Repeated until nothing new turns up (Scenes brings Scenes and Movements).
  for (let grew = true; grew; ) { grew = false; [...labelByKey.values()].forEach(l => getGenreParents(taxonomy, l).forEach(p => { const pk = genreTaxonomyKey(p); if (!labelByKey.has(pk)) { labelByKey.set(pk, p); grew = true; } })); }

  // parentKey -> [childKey, ...] — a genre with multiple parents (Glam
  // Punk) is added under EACH of them, so it appears as its own row in
  // every applicable branch of the tree, not just one.
  const childrenOf = new Map();
  labelByKey.forEach((label, key) => {
    getGenreParents(taxonomy, label).forEach(parent => {
      const pk = genreTaxonomyKey(parent);
      if (!childrenOf.has(pk)) childrenOf.set(pk, []);
      if (!childrenOf.get(pk).includes(key)) childrenOf.get(pk).push(key);
    });
  });

  function aggregatedCount(key, seen) {
    if (seen.has(key)) return 0; // cycle guard
    seen.add(key);
    let total = (ownCount.get(key) || { count: 0 }).count;
    (childrenOf.get(key) || []).forEach(childKey => { total += aggregatedCount(childKey, seen); });
    return total;
  }

  const rootKeys = [...labelByKey.keys()].filter(key => !getGenreParents(taxonomy, labelByKey.get(key)).length);
  const rows = [];
  function walk(key, depth) {
    const count = aggregatedCount(key, new Set());
    if (count > 0) rows.push({ key: labelByKey.get(key), label: labelByKey.get(key), sub: '', count: state.genreNavExact ? (ownCount.get(key) || { count: 0 }).count : count, depth });          // "Selected genre only": the number is the genre's own releases, so it matches what clicking it shows (a parent with none of its own stays as a heading)
    (childrenOf.get(key) || [])
      .slice()
      .sort((a, b) => labelByKey.get(a).localeCompare(labelByKey.get(b)))
      .forEach(childKey => walk(childKey, depth + 1));
  }
  rootKeys.sort((a, b) => labelByKey.get(a).localeCompare(labelByKey.get(b))).forEach(key => walk(key, 0));
  return rows;
}

// Every genre CRATE knows about right now — tagged on some album, or
// purely organizational (named in the taxonomy but never itself tagged) —
// as {key, label, parents}, alphabetized. Unlike buildGenreTree above,
// this includes zero-count genres too (the editor needs to show and let
// you manage the whole structure, not just what currently has matches),
// and carries no depth/aggregation — the editor is a flat list, not a
// tree render, since every row's own parents field already shows its
// place in the hierarchy.
function getAllKnownGenres(taxonomy) {
  const labelByKey = new Map();
  state.raw.forEach(item => {
    allGenresForItem(item).forEach(g => {
      const key = genreTaxonomyKey(g);
      if (!labelByKey.has(key)) labelByKey.set(key, g);
    });
  });
  Object.entries(taxonomy).forEach(([key, entry]) => {
    if (!labelByKey.has(key)) labelByKey.set(key, entry.label);
    entry.parents.forEach(parent => {
      const parentKey = genreTaxonomyKey(parent);
      if (!labelByKey.has(parentKey)) labelByKey.set(parentKey, parent);
    });
  });
  return [...labelByKey.entries()]
    .map(([key, label]) => ({ key, label, parents: getGenreParents(taxonomy, label) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Feeds the shared #genreAutocompleteList <datalist> that the Genre/
// Secondary Genre fields (add album, edit album, edit track properties)
// all point at via list="genreAutocompleteList", so typing into any of
// them suggests genres already used somewhere in the crate (plus any
// purely organizational ones named in the taxonomy) instead of only the
// dedicated Genre Taxonomy editor's own datalist getting them. Cheap
// enough to just recompute fresh every time one of those forms opens.
function refreshGenreAutocompleteList() {
  el.genreAutocompleteList.innerHTML = getAllKnownGenres(state.genreTaxonomy)
    .map(g => `<option value="${escapeHtml(g.label)}">`).join('');
}

function renderGenreTaxonomyEditor() {
  const genres = getAllKnownGenres(state.genreTaxonomy);
  el.genreTaxonomyDatalist.innerHTML = genres.map(g => `<option value="${escapeHtml(g.label)}">`).join('');
  if (!genres.length) {
    el.genreTaxonomyList.innerHTML = '<p class="tracklist-status">No genres yet \u2014 add one below, or tag an album with a genre first.</p>';
    return;
  }
  el.genreTaxonomyList.innerHTML = genres.map(g => `
    <div class="genre-taxonomy-row" data-genre-key="${escapeHtml(g.key)}">
      <span class="genre-taxonomy-name">${escapeHtml(g.label)}</span>
      <span class="genre-taxonomy-arrow">under</span>
      <input type="text" class="genre-taxonomy-parent" list="genreTaxonomyDatalist" placeholder="Top-level (or a, b for multiple)" value="${escapeHtml(g.parents.join(', '))}">
      <button type="button" class="genre-taxonomy-remove chip-btn" title="Clear this genre's parents" aria-label="Clear this genre's parents">✕</button>
    </div>
  `).join('');

  el.genreTaxonomyList.querySelectorAll('.genre-taxonomy-row').forEach(rowEl => {
    const key = rowEl.dataset.genreKey;
    const genreInfo = genres.find(g => g.key === key);
    const parentInput = rowEl.querySelector('.genre-taxonomy-parent');
    // Comma-separated, same convention as the Genre/Secondary Genre fields
    // elsewhere in the app — a genre with two parents (Glam Punk = Punk
    // Rock + Glam Rock) just types both, rather than needing a second
    // field or a multi-select.
    const applyParents = (rawValue) => {
      const requested = rawValue.split(',').map(s => s.trim()).filter(Boolean);
      const deduped = [];
      const dedupedKeys = new Set();
      const rejected = [];
      requested.forEach(parent => {
        const pk = genreTaxonomyKey(parent);
        if (dedupedKeys.has(pk)) return;
        if (wouldCreateGenreCycle(state.genreTaxonomy, genreInfo.label, parent)) { rejected.push(parent); return; }
        dedupedKeys.add(pk);
        deduped.push(parent);
      });
      if (rejected.length) {
        flashGlobalToast(`Skipped ${rejected.join(', ')} \u2014 would put ${genreInfo.label} under itself.`);
      }
      if (deduped.length) {
        state.genreTaxonomy[key] = { label: genreInfo.label, parents: deduped };
      } else {
        delete state.genreTaxonomy[key];
      }
      parentInput.value = deduped.join(', ');
      saveGenreTaxonomy(state.genreTaxonomy);
      if (state.leftMode === 'genre') buildLeftList();
      if (state.navFilter && state.navFilter.mode === 'genre') applyFiltersSort();
    };
    parentInput.addEventListener('change', () => applyParents(parentInput.value));
    // Native <datalist> matches the ENTIRE input value against its
    // options, so past the first comma it stops suggesting anything —
    // "Punk Rock, G" isn't a real option no matter what. Standard
    // workaround: rewrite the shared datalist's own options to include
    // whatever's already been typed as a literal prefix, so the browser's
    // matching sees "Punk Rock, Glam Rock" as a real option and offers it
    // — the segment after the last comma is what's actually being
    // completed, already-used genres for THIS field are excluded so it
    // doesn't suggest a duplicate.
    parentInput.addEventListener('input', () => {
      const value = parentInput.value;
      const lastComma = value.lastIndexOf(',');
      const prefix = lastComma === -1 ? '' : value.slice(0, lastComma + 1) + ' ';
      const alreadyUsed = new Set(
        value.slice(0, lastComma + 1).split(',').map(s => genreTaxonomyKey(s)).filter(Boolean)
      );
      el.genreTaxonomyDatalist.innerHTML = genres
        .filter(g => g.key !== key && !alreadyUsed.has(g.key))
        .map(g => `<option value="${escapeHtml(prefix + g.label)}">`)
        .join('');
    });
    parentInput.addEventListener('focus', () => parentInput.dispatchEvent(new Event('input'))); // seed the datalist for this field the moment it's focused, not just after the first keystroke
    rowEl.querySelector('.genre-taxonomy-remove').addEventListener('click', () => applyParents(''));
  });
}

// Display form for the deck meta line — primary genre as normal, secondary
// genre(s) parenthesized after it (mirrors how RYM itself distinguishes
// "Genres" from "Secondary Genres" on a release page).
function genreDisplayStr(item) {
  const primary = (item.genre || '').trim();
  const secondary = [(item.genre2 || '').trim(), sceneGenreStr(item)].filter(Boolean).join(', ');
  if (!primary) return secondary;
  if (!secondary) return primary;
  return `${primary} (${secondary})`;
}
