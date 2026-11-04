// CRATE — Timeline and Map viewers.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// ---------- Timeline viewer (1.29.13) ----------
// Lets someone scrub through release years and see what was in the crate
// at that point in time. state.timelineYear holds the currently-selected
// year; timelineYearCounts (rebuilt every time the modal opens, since the
// crate can change between opens) backs both the tick histogram and the
// prev/next stepping so those only ever land on years that actually have
// a dated release, rather than stepping one-by-one through empty years.
state.timelineYear = null;
state.timelineMode = 'release'; // 'release' (default, by release date) or 'listen' (by scrobble activity) — transient, not persisted
let timelineYearCounts = []; // [{ year, count }], ascending by year

state.mapTimeEnabled = false; // Map's "Spread through time" toggle — off by default, transient
state.mapColorBy = 'none'; // 'none' | 'genre' | 'year' | 'artist' — marker/symbology colour grouping, see mapColorForGroup()/renderMapLegend()
state.mapTimeGranularity = 'year'; // 'year' or 'month'
state.mapTimeIndex = null; // absolute period index (year, or year*12+month) currently scrubbed to

function timelineYearOf(item) {
  return dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : null;
}

function buildTimelineYearCounts() {
  return state.timelineMode === 'listen' ? buildListenYearCounts() : buildReleaseYearCounts();
}

function buildReleaseYearCounts() {
  const counts = new Map();
  state.raw.forEach(item => {
    const y = timelineYearOf(item);
    if (y == null) return;
    counts.set(y, (counts.get(y) || 0) + 1);
  });
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
}

// Listen-mode ticks: total scrobble plays per year (not distinct albums),
// so a year you hammered a handful of records shows up as tall as one
// where you played lots of different things a little each — density of
// listening activity, same spirit as the release-mode album-count ticks.
function buildListenYearCounts() {
  const counts = new Map();
  state.scrobbles.forEach(s => {
    if (dateVal(s.day) === -Infinity) return;
    const y = new Date(s.day).getUTCFullYear();
    counts.set(y, (counts.get(y) || 0) + (s.playCount || 1));
  });
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
}

function setTimelineMode(mode) {
  if (state.timelineMode === mode) return;
  state.timelineMode = mode;
  el.timelineModeReleaseBtn.classList.toggle('active', mode === 'release');
  el.timelineModeListenBtn.classList.toggle('active', mode === 'listen');
  el.timelineHint.textContent = mode === 'listen'
    ? 'Scrub through years to see what you actually listened to at that point in time.'
    : 'Scrub through release years to see what was out at that point in time.';

  timelineYearCounts = buildTimelineYearCounts();
  const empty = timelineYearCounts.length === 0;
  el.timelineEmpty.hidden = !empty;
  el.timelineEmpty.textContent = mode === 'listen'
    ? 'No scrobbles logged yet — import your Last.fm history to see listening activity here.'
    : 'No albums in your crate have a release date yet — add one from the Edit form to see it here.';

  if (empty) {
    el.timelineSlider.disabled = true;
    el.timelineYearLabel.textContent = '—';
    el.timelineTicks.innerHTML = '';
    el.timelineRangeStart.textContent = '';
    el.timelineRangeEnd.textContent = '';
    el.timelineCount.textContent = '';
    el.timelineAlbumList.innerHTML = '';
    return;
  }

  el.timelineSlider.disabled = false;
  const minYear = timelineYearCounts[0].year;
  const maxYear = timelineYearCounts[timelineYearCounts.length - 1].year;
  el.timelineSlider.min = minYear;
  el.timelineSlider.max = maxYear;
  el.timelineRangeStart.textContent = minYear;
  el.timelineRangeEnd.textContent = maxYear;

  const startYear = (state.timelineYear != null && state.timelineYear >= minYear && state.timelineYear <= maxYear)
    ? state.timelineYear : maxYear;

  renderTimelineTicks();
  setTimelineYear(startYear);
}

function openTimelineModal() {
  timelineYearCounts = buildTimelineYearCounts();
  el.timelineEmpty.hidden = timelineYearCounts.length > 0;
  el.timelineOverlay.hidden = false;

  if (!timelineYearCounts.length) {
    el.timelineSlider.disabled = true;
    el.timelineYearLabel.textContent = '—';
    el.timelineTicks.innerHTML = '';
    el.timelineRangeStart.textContent = '';
    el.timelineRangeEnd.textContent = '';
    el.timelineCount.textContent = '';
    el.timelineAlbumList.innerHTML = '';
    return;
  }
  el.timelineSlider.disabled = false;

  const minYear = timelineYearCounts[0].year;
  const maxYear = timelineYearCounts[timelineYearCounts.length - 1].year;
  el.timelineSlider.min = minYear;
  el.timelineSlider.max = maxYear;
  el.timelineRangeStart.textContent = minYear;
  el.timelineRangeEnd.textContent = maxYear;

  // Land on whichever year was showing last time if it's still in range,
  // otherwise the most recent year with a dated release.
  const startYear = (state.timelineYear != null && state.timelineYear >= minYear && state.timelineYear <= maxYear)
    ? state.timelineYear : maxYear;

  renderTimelineTicks();
  setTimelineYear(startYear);
}

function closeTimelineModal() {
  el.timelineOverlay.hidden = true;
}

function renderTimelineTicks() {
  const minYear = timelineYearCounts[0].year;
  const maxYear = timelineYearCounts[timelineYearCounts.length - 1].year;
  const span = Math.max(1, maxYear - minYear);
  const maxCount = Math.max(...timelineYearCounts.map(y => y.count));

  el.timelineTicks.innerHTML = timelineYearCounts.map(({ year, count }) => {
    const leftPct = ((year - minYear) / span) * 100;
    const heightPct = Math.max(15, Math.round((count / maxCount) * 100));
    return `<div class="timeline-tick" data-year="${year}" title="${year} \u00b7 ${count} album${count === 1 ? '' : 's'}" style="left:${leftPct}%; height:${heightPct}%;"></div>`;
  }).join('');

  [...el.timelineTicks.querySelectorAll('.timeline-tick')].forEach(tick => {
    tick.addEventListener('click', () => setTimelineYear(Number(tick.dataset.year)));
  });
}

function setTimelineYear(year) {
  state.timelineYear = year;
  el.timelineSlider.value = year;
  el.timelineYearLabel.textContent = year;

  [...el.timelineTicks.querySelectorAll('.timeline-tick')].forEach(tick => {
    tick.classList.toggle('active', Number(tick.dataset.year) === year);
  });

  renderTimelineAlbumList(year);
}

function timelineStep(direction) {
  if (!timelineYearCounts.length) return;
  const years = timelineYearCounts.map(y => y.year);
  const current = state.timelineYear != null ? state.timelineYear : years[years.length - 1];
  // Step to the nearest year in either direction that actually has a
  // dated release, rather than every single calendar year.
  const candidates = direction > 0 ? years.filter(y => y > current) : years.filter(y => y < current).reverse();
  if (candidates.length) setTimelineYear(candidates[0]);
}

function renderTimelineAlbumList(year) {
  if (state.timelineMode === 'listen') { renderTimelineListenList(year); return; }
  const items = state.raw.filter(item => timelineYearOf(item) === year);
  // Chronological within the year (fuller-precision dates sort correctly
  // against year-only ones since dateVal() falls back to Jan 1 for those),
  // then alphabetically by title as a stable tiebreaker.
  items.sort((a, b) => dateVal(a.releaseDate) - dateVal(b.releaseDate) || a.title.localeCompare(b.title));

  el.timelineCount.textContent = items.length + ' album' + (items.length === 1 ? '' : 's') + ' released in ' + year;

  el.timelineAlbumList.innerHTML = items.map(item => `
    <button type="button" class="timeline-album-row" data-row="${escapeHtml(String(item.row))}">
      <img class="timeline-album-cover art" data-key="${artKey(item)}" src="${item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item)}" alt="">
      <span class="timeline-album-text">
        <span class="timeline-album-title">${escapeHtml(item.title)}</span>
        <span class="timeline-album-sub">${escapeHtml(item.artist)}</span>
      </span>
      <span class="timeline-album-date">${escapeHtml(formatReleaseDateStr(item.releaseDate))}</span>
    </button>
  `).join('');

  [...el.timelineAlbumList.querySelectorAll('.timeline-album-row')].forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const item = items[i];
      closeTimelineModal();
      switchTab('albums');
      openDeck(item);
    });
  });
}

// Listen-mode counterpart to renderTimelineAlbumList: rolls state.scrobbles
// for the given year up into one row per album (total plays that year),
// sorted most-played first, matched back to the crate by artist+title —
// same identity match the Scrobbles tab and computeYearStats() use. An
// album with plays but no crate match still shows (with a placeholder
// cover) since scrobble history can outlive a since-removed album, but
// isn't clickable in that case.
function renderTimelineListenList(year) {
  const byAlbum = new Map(); // "artist::title" -> { artist, title, plays }
  state.scrobbles.forEach(s => {
    if (dateVal(s.day) === -Infinity) return;
    if (new Date(s.day).getUTCFullYear() !== year) return;
    const key = s.artist + '::' + s.title;
    if (!byAlbum.has(key)) byAlbum.set(key, { artist: s.artist, title: s.title, plays: 0 });
    byAlbum.get(key).plays += (s.playCount || 1);
  });
  const items = [...byAlbum.values()].sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title));

  el.timelineCount.textContent = items.length + ' album' + (items.length === 1 ? '' : 's') + ' played in ' + year;

  el.timelineAlbumList.innerHTML = items.map(it => {
    const match = state.raw.find(r => r.artist === it.artist && r.title === it.title);
    const cover = match ? (match.cover || state.artCache[artKey(match)]?.art || placeholderArt(match)) : placeholderArt(it);
    return `
    <button type="button" class="timeline-album-row"${match ? '' : ' disabled'}>
      <img class="timeline-album-cover art" src="${cover}" alt="">
      <span class="timeline-album-text">
        <span class="timeline-album-title">${escapeHtml(it.title)}</span>
        <span class="timeline-album-sub">${escapeHtml(it.artist)}</span>
      </span>
      <span class="timeline-album-date">${it.plays} play${it.plays === 1 ? '' : 's'}</span>
    </button>
  `;
  }).join('');

  [...el.timelineAlbumList.querySelectorAll('.timeline-album-row')].forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const match = state.raw.find(r => r.artist === items[i].artist && r.title === items[i].title);
      if (!match) return;
      closeTimelineModal();
      switchTab('albums');
      openDeck(match);
    });
  });
}

/* ---------- Map viewer (1.29.15) ----------
   Groups every album with a non-empty `location` (see state.raw mapping)
   by that text, geocodes each unique string once via LocationIQ (through
   the geoFetch queue above, cached in localStorage), and drops one Leaflet
   marker per resolved place — a popup lists every album grouped there and
   clicking one closes the modal and opens that release, same click-through
   pattern as the Timeline viewer's album list. A Category+Value picker
   filters which located albums count, and a Sort picker orders them
   within each pin's popup and in the flat album list under the map. */

let leafletMapInstance = null;
let leafletMarkerLayer = null;
let mapLoadToken = 0; // race guard: only the latest open's geocoding pass may render

function ensureLeafletMap() {
  if (leafletMapInstance) return leafletMapInstance;
  leafletMapInstance = L.map(el.mapContainer, { worldCopyJump: true }).setView([20, 0], 2);
  // Was CARTO's dark_all basemap (basemaps.cartocdn.com) — genuinely
  // keyless when this was first written, but CARTO started requiring a
  // separate Basemaps API key (carto.com/basemaps/apikey) on that endpoint
  // in late August 2026. It doesn't reject the request — it returns a
  // real 200 PNG with "API KEY REQUIRED" burned diagonally into the tile
  // image itself, which is why it looked like a rendering bug rather than
  // an auth failure, and why the LocationIQ key already entered above
  // (for geocoding — a completely different service) had no effect on it.
  // Switched to plain keyless OpenStreetMap tiles instead of adding yet
  // another API key to manage, restoring the dark look via a CSS filter
  // (see .leaflet-tile-pane below) rather than depending on a third-party
  // dark-styled tile set again.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: 'abc'
  }).addTo(leafletMapInstance);
  leafletMarkerLayer = L.layerGroup().addTo(leafletMapInstance);
  return leafletMapInstance;
}

// ---- Floating window: drag-to-move + resize (1.29.17) ----
// The Map modal isn't a centered/backdrop dialog like the app's other
// modals — it's a real floating window (see .map-overlay/.map-modal CSS):
// dragged by its header the same clamp-to-viewport way the Spotify mini
// player's detached mode works (initPlayerDrag), and resized via the
// browser's native `resize: both` corner handle rather than a custom one.
// Position + size persist to localStorage so the window comes back where
// you left it.
//
// Below the .map-modal mobile breakpoint (see CSS), the window is forced
// full-screen instead (drag/resize don't really work with a touch-only,
// small viewport, and a floating window would just get in its own way) —
// MAP_MOBILE_BREAKPOINT_QUERY (single source of truth for that cutoff,
// shared with the matching CSS media query) is now declared up near the top
// of the script alongside the other pre-init() constants — see the comment
// there for why.
const MAP_WINDOW_PREFS_KEY = 'crate_map_window_prefs_v1';

function isMapMobileLayout() {
  return window.matchMedia(MAP_MOBILE_BREAKPOINT_QUERY).matches;
}

// Matches the compact single-row mini player CSS (`@media (max-width:
// 620px)`, same cutoff the rest of the app's phone-only rules use — see
// .deck-header/.deck-art etc. in that block). A plain function (not a
// const, unlike MAP_MOBILE_BREAKPOINT_QUERY above) since it's only ever
// called from inside click-handler callbacks, well after the whole script
// has finished loading — no temporal-dead-zone risk to guard against here.
function isMiniPlayerMobileLayout() {
  return window.matchMedia('(max-width: 620px)').matches;
}

function loadMapWindowPrefs() {
  try { return JSON.parse(localStorage.getItem(MAP_WINDOW_PREFS_KEY) || '{}'); } catch (e) { return {}; }
}
function saveMapWindowPrefs(patch) {
  try { localStorage.setItem(MAP_WINDOW_PREFS_KEY, JSON.stringify({ ...loadMapWindowPrefs(), ...patch })); }
  catch (e) { /* localStorage unavailable — safe to ignore */ }
}

// Applies any remembered position/size before the window is ever shown —
// only needs to run once at startup since the ResizeObserver + drag
// handler below keep localStorage in sync as the user moves/resizes it.
// Skipped entirely in mobile layout so a desktop-sized/positioned window
// never gets forced onto a phone screen — the CSS breakpoint's full-screen
// rule is left in sole control there.
function applyMapWindowPrefs() {
  if (isMapMobileLayout()) return;
  const p = loadMapWindowPrefs();
  if (p.top != null) el.mapModal.style.top = p.top + 'px';
  if (p.left != null) el.mapModal.style.left = p.left + 'px';
  if (p.width != null) el.mapModal.style.width = p.width + 'px';
  if (p.height != null) el.mapModal.style.height = p.height + 'px';
}

function initMapWindowDrag() {
  let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
  function onDown(e) {
    if (isMapMobileLayout()) return; // full-screen there — nothing to drag, and dragging would fight the CSS inset
    if (e.target.closest('.modal-x')) return; // let the close button's own click through
    dragging = true;
    const point = (e.touches && e.touches[0]) || e;
    startX = point.clientX; startY = point.clientY;
    const rect = el.mapModal.getBoundingClientRect();
    origX = rect.left; origY = rect.top;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const point = (e.touches && e.touches[0]) || e;
    const w = el.mapModal.offsetWidth, h = el.mapModal.offsetHeight;
    let nx = origX + (point.clientX - startX);
    let ny = origY + (point.clientY - startY);
    nx = Math.max(4, Math.min(window.innerWidth - w - 4, nx));
    ny = Math.max(4, Math.min(window.innerHeight - h - 4, ny));
    el.mapModal.style.left = nx + 'px';
    el.mapModal.style.top = ny + 'px';
    if (e.cancelable) e.preventDefault();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    const rect = el.mapModal.getBoundingClientRect();
    saveMapWindowPrefs({ top: rect.top, left: rect.left });
  }
  el.mapModal.querySelector('.arrange-header').addEventListener('mousedown', onDown);
  el.mapModal.querySelector('.arrange-header').addEventListener('touchstart', onDown, { passive: false });
}

// Watches the window's box for size changes — both from the native corner
// resize handle and from the browser being resized under it — so Leaflet
// can re-lay-out its tiles (invalidateSize) and the new size gets
// remembered. Debounced since ResizeObserver can fire in bursts mid-drag.
// invalidateSize() always runs (needed on mobile too — e.g. a phone
// rotating between portrait/landscape resizes the full-screen window and
// the map tiles need to catch up) but the mobile full-screen box itself
// is never persisted as if it were a deliberate resize.
let mapResizeSaveTimer = null;
function observeMapWindowResize() {
  new ResizeObserver(() => {
    if (leafletMapInstance) leafletMapInstance.invalidateSize();
    if (isMapMobileLayout()) return;
    clearTimeout(mapResizeSaveTimer);
    mapResizeSaveTimer = setTimeout(() => {
      const rect = el.mapModal.getBoundingClientRect();
      saveMapWindowPrefs({ width: rect.width, height: rect.height });
    }, 300);
  }).observe(el.mapModal);
}


// Handles the boundary itself: if the viewport crosses the mobile
// breakpoint while the map happens to be open (window resized, or a
// phone/tablet rotated), any inline position/size left over from the
// other mode needs to get out of the way — inline styles beat the CSS
// media query's rule, so without this a stale desktop position could
// pin the "full screen" mobile layout to one corner, or vice versa.
function clearMapWindowInlineGeometry() {
  el.mapModal.style.top = '';
  el.mapModal.style.left = '';
  el.mapModal.style.width = '';
  el.mapModal.style.height = '';
}
function initMapMobileBreakpointListener() {
  window.matchMedia(MAP_MOBILE_BREAKPOINT_QUERY).addEventListener('change', (e) => {
    if (e.matches) clearMapWindowInlineGeometry(); // entering mobile — hand control back to the CSS full-screen rule
    else applyMapWindowPrefs(); // leaving mobile — restore the remembered floating position/size
    applyMapColumnWidths(); // mobile/desktop use different fixed-vs-persisted column widths
    if (leafletMapInstance) leafletMapInstance.invalidateSize();
  });
}

// ---- Attribute table column widths (Name/Artist/Location/Year/Genre) ----
// Resizable the same way the Tracks table's columns are (drag handle on
// the right edge of each header), but simpler: just widths, no reordering
// — the columns here are fixed attributes, not a user-configurable set.
// Column resizing itself is desktop-only (drag handles aren't a great
// touch interaction on a table this dense) — mobile layout uses its own
// fixed, narrower widths below instead of whatever's persisted from a
// desktop session, since inline widths set here would otherwise override
// the mobile CSS's column-hiding/sizing rules.
const MAP_COL_WIDTHS_KEY = 'crate_map_col_widths_v1';
const MAP_COL_DEFAULT_WIDTHS = { title: 190, artist: 150, location: 170, year: 64, genre: 140 };
const MAP_COL_MOBILE_WIDTHS = { title: 120, artist: 100, location: 120, year: 46 }; // genre/type are hidden on mobile — see .map-attr-th-optional

function loadMapColWidths() {
  try { return { ...MAP_COL_DEFAULT_WIDTHS, ...JSON.parse(localStorage.getItem(MAP_COL_WIDTHS_KEY) || '{}') }; }
  catch (e) { return { ...MAP_COL_DEFAULT_WIDTHS }; }
}
function saveMapColWidth(col, width) {
  const widths = loadMapColWidths();
  widths[col] = width;
  try { localStorage.setItem(MAP_COL_WIDTHS_KEY, JSON.stringify(widths)); } catch (e) { /* ignore */ }
}

function applyMapColumnWidths() {
  const mobile = isMapMobileLayout();
  const widths = mobile ? MAP_COL_MOBILE_WIDTHS : loadMapColWidths();
  el.mapAttrHeadRow.querySelectorAll('.map-attr-th[data-col]').forEach(th => {
    const w = widths[th.dataset.col];
    th.style.width = w ? w + 'px' : '';
  });
}

function wireMapColumnResize() {
  let resizeCol = null, startX = 0, startWidth = 0, handleEl = null;
  function onMove(e) {
    if (!resizeCol) return;
    const w = Math.max(48, startWidth + (e.clientX - startX));
    el.mapAttrHeadRow.querySelector(`.map-attr-th[data-col="${resizeCol}"]`).style.width = w + 'px';
  }
  function onUp() {
    if (!resizeCol) return;
    const w = parseInt(el.mapAttrHeadRow.querySelector(`.map-attr-th[data-col="${resizeCol}"]`).style.width, 10);
    saveMapColWidth(resizeCol, w);
    if (handleEl) handleEl.classList.remove('ttc-resizing');
    resizeCol = null; handleEl = null;
    document.body.style.cursor = ''; document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  el.mapAttrHeadRow.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.ttc-resize-handle');
    if (!handle) return;
    e.preventDefault();
    resizeCol = handle.dataset.col;
    handleEl = handle;
    handleEl.classList.add('ttc-resizing');
    startX = e.clientX;
    startWidth = handle.closest('.map-attr-th').getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ---- Category filter + sort (toolbar controls above the map) ----
// Reuses groupKeysFor() (the same Artist/Genre/Type/Decade logic behind
// the left panel's "Group by") so "Category" on the map means the same
// thing it does everywhere else in the app.

function mapCategoryFilter(item) {
  const cat = el.mapCategorySelect.value;
  if (cat === 'none') return true;
  const val = el.mapCategoryValueSelect.value;
  if (!val) return true;
  return groupKeysFor(item, cat).includes(val);
}

// Rebuilds the Value <select> whenever Category changes, from the distinct
// values actually present among *located* albums (no point offering a
// genre with no pin behind it). Alphabetical, except year/decade which
// sort numerically.
function populateMapCategoryValues() {
  const cat = el.mapCategorySelect.value;
  el.mapCategoryValueField.hidden = cat === 'none';
  if (cat === 'none') { el.mapCategoryValueSelect.innerHTML = ''; return; }

  const located = state.raw.filter(item => (item.location || '').trim());
  const values = new Set();
  located.forEach(item => groupKeysFor(item, cat).forEach(v => { if (v) values.add(v); }));
  const sorted = [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const prev = el.mapCategoryValueSelect.value;
  el.mapCategoryValueSelect.innerHTML = sorted.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (sorted.includes(prev)) el.mapCategoryValueSelect.value = prev;
}

function mapSortComparator() {
  const sortKey = el.mapSortSelect.value;
  if (sortKey === 'artist') return (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);
  if (sortKey === 'year-new') return (a, b) => dateVal(b.releaseDate) - dateVal(a.releaseDate);
  if (sortKey === 'year-old') return (a, b) => dateVal(a.releaseDate) - dateVal(b.releaseDate);
  return (a, b) => a.title.localeCompare(b.title); // 'title', the default
}

// ---- "Spread through time" scrubber ----
// Answers "how did this spread" by revealing a location as soon as ANY
// album tied to it was released, then letting you scrub forward/back
// through when new locations joined — a way to watch a genre/scene's
// geography unfold release by release, using each album's own release
// date (no scrobble/listen history involved).
//
// Granularity ('year' or 'month') is expressed as one absolute integer
// index so the slider can step across every period in range even where a
// period has zero activity: plain calendar year for 'year', and
// (year * 12 + zero-based month) for 'month'.
let mapTimeMinIdx = 0, mapTimeMaxIdx = 0;

function periodIndexFor(dayStr, granularity) {
  const d = new Date(dayStr);
  if (isNaN(d)) return null;
  return granularity === 'month' ? d.getUTCFullYear() * 12 + d.getUTCMonth() : d.getUTCFullYear();
}

function periodIndexToLabel(idx, granularity) {
  if (granularity === 'month') {
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return MONTH_NAMES[((idx % 12) + 12) % 12] + ' ' + Math.floor(idx / 12);
  }
  return String(idx);
}

function itemReleasePeriodIndex(item) {
  return dateVal(item.releaseDate) !== -Infinity ? periodIndexFor(item.releaseDate, state.mapTimeGranularity) : null;
}

// Rebuilds the slider's range from current release-date data. Returns
// false (and leaves everything hidden) if there's no dated, located album
// at all to scrub through.
function refreshMapTimeScrubber() {
  const indices = state.raw
    .filter(item => (item.location || '').trim())
    .map(itemReleasePeriodIndex)
    .filter(v => v != null);
  if (!indices.length) return false;

  mapTimeMinIdx = Math.min(...indices);
  mapTimeMaxIdx = Math.max(...indices);
  el.mapTimeSlider.min = mapTimeMinIdx;
  el.mapTimeSlider.max = mapTimeMaxIdx;
  el.mapTimeRangeStart.textContent = periodIndexToLabel(mapTimeMinIdx, state.mapTimeGranularity);
  el.mapTimeRangeEnd.textContent = periodIndexToLabel(mapTimeMaxIdx, state.mapTimeGranularity);
  renderMapTimeTicks();

  const startIdx = (state.mapTimeIndex != null && state.mapTimeIndex >= mapTimeMinIdx && state.mapTimeIndex <= mapTimeMaxIdx)
    ? state.mapTimeIndex : mapTimeMinIdx; // default to the earliest period — "watch it spread" starts from the start
  state.mapTimeIndex = startIdx;
  el.mapTimeSlider.value = startIdx;
  el.mapTimeLabel.textContent = periodIndexToLabel(startIdx, state.mapTimeGranularity);
  return true;
}

// Ticks show how many NEW locations were reached each period (respecting
// the current Category filter, so the ticks match what's actually being
// scrubbed through) — a density map of how fast the map's geography grew.
function renderMapTimeTicks() {
  const firstReachedAt = new Map(); // location key -> earliest period index among its (category-matching, dated) albums
  state.raw.forEach(item => {
    const loc = (item.location || '').trim();
    if (!loc || !mapCategoryFilter(item)) return;
    const idx = itemReleasePeriodIndex(item);
    if (idx == null) return;
    const key = loc.toLowerCase();
    if (!firstReachedAt.has(key) || idx < firstReachedAt.get(key)) firstReachedAt.set(key, idx);
  });
  const counts = new Map();
  firstReachedAt.forEach(idx => counts.set(idx, (counts.get(idx) || 0) + 1));

  const span = Math.max(1, mapTimeMaxIdx - mapTimeMinIdx);
  const maxCount = Math.max(1, ...counts.values(), 0);
  let html = '';
  counts.forEach((count, idx) => {
    const leftPct = ((idx - mapTimeMinIdx) / span) * 100;
    const heightPct = 15 + (count / maxCount) * 85;
    html += `<div class="timeline-tick" data-idx="${idx}" title="${escapeHtml(periodIndexToLabel(idx, state.mapTimeGranularity))} \u00b7 ${count} new location${count === 1 ? '' : 's'}" style="left:${leftPct}%; height:${heightPct}%;"></div>`;
  });
  el.mapTimeTicks.innerHTML = html;
  [...el.mapTimeTicks.querySelectorAll('.timeline-tick')].forEach(tick => {
    tick.addEventListener('click', () => setMapTimeIndex(Number(tick.dataset.idx)));
  });
  updateMapTimeTickActive();
}

function updateMapTimeTickActive() {
  [...el.mapTimeTicks.querySelectorAll('.timeline-tick')].forEach(tick => {
    tick.classList.toggle('active', Number(tick.dataset.idx) === state.mapTimeIndex);
  });
}

function setMapTimeIndex(idx) {
  state.mapTimeIndex = idx;
  el.mapTimeSlider.value = idx;
  el.mapTimeLabel.textContent = periodIndexToLabel(idx, state.mapTimeGranularity);
  updateMapTimeTickActive();
  renderMap();
}

function mapTimeStep(direction) {
  const next = Math.max(mapTimeMinIdx, Math.min(mapTimeMaxIdx, state.mapTimeIndex + direction));
  if (next !== state.mapTimeIndex) setMapTimeIndex(next);
}

function toggleMapTimeMode() {
  if (state.mapTimeEnabled) {
    state.mapTimeEnabled = false;
    el.mapTimeToggleBtn.classList.remove('active');
    el.mapTimeGranularity.hidden = true;
    el.mapTimeScrubber.hidden = true;
    el.mapTimeHint.hidden = true;
    renderMap();
    return;
  }
  const ok = refreshMapTimeScrubber();
  if (!ok) {
    flashGlobalToast('No located albums have a release date yet — add one from the Edit form to scrub through the spread.');
    return;
  }
  state.mapTimeEnabled = true;
  el.mapTimeToggleBtn.classList.add('active');
  el.mapTimeGranularity.hidden = false;
  el.mapTimeScrubber.hidden = false;
  el.mapTimeHint.hidden = false;
  renderMap();
}

function setMapTimeGranularity(granularity) {
  if (state.mapTimeGranularity === granularity) return;
  state.mapTimeGranularity = granularity;
  el.mapTimeGranYearBtn.classList.toggle('active', granularity === 'year');
  el.mapTimeGranMonthBtn.classList.toggle('active', granularity === 'month');
  state.mapTimeIndex = null; // old index was in the other granularity's units — re-default
  if (state.mapTimeEnabled) {
    refreshMapTimeScrubber();
    renderMap();
  }
}

// Groups state.raw by trimmed/lowercased `location` text, applying the
// current Category filter, the "Spread through time" cutoff (if on —
// albums with no release date are excluded while it's on, since there's
// no date to place them at), and the current Sort within each group.
// Returns [{ label, key, items: [item, ...] }, ...] for every matching
// non-empty location — geocoding happens later, per unique key, once this
// grouping is known.
function buildMapGroups() {
  const groups = new Map();
  state.raw.forEach(item => {
    const loc = (item.location || '').trim();
    if (!loc) return;
    if (!mapCategoryFilter(item)) return;
    if (state.mapTimeEnabled) {
      const idx = itemReleasePeriodIndex(item);
      if (idx == null || idx > state.mapTimeIndex) return;
    }
    const key = loc.toLowerCase();
    if (!groups.has(key)) groups.set(key, { label: loc, key, items: [] });
    groups.get(key).items.push(item);
  });
  const sortFn = mapSortComparator();
  groups.forEach(g => g.items.sort(sortFn));
  return [...groups.values()];
}

async function openMapModal() {
  el.mapOverlay.hidden = false;
  const apiKey = loadMapApiKey();
  if (!apiKey) {
    el.mapMain.hidden = true;
    el.mapKeySetup.hidden = false;
    el.mapApiKeyInput.value = '';
    el.mapApiKeyInput.focus();
    return;
  }
  el.mapKeySetup.hidden = true;
  el.mapMain.hidden = false;

  const map = ensureLeafletMap();
  // Leaflet sizes its canvas from the container's dimensions at creation
  // time — if that happened while the modal was hidden (display:none has
  // zero size), the tiles render into a collapsed box. invalidateSize()
  // after the overlay is visible fixes that up.
  setTimeout(() => map.invalidateSize(), 0);

  populateMapCategoryValues();
  applyMapColumnWidths();
  el.mapColorBySelect.value = state.mapColorBy;

  // Re-sync the time-scrubber UI to state.mapTimeEnabled every open, since
  // the crate/scrobbles may have changed while the modal was closed.
  el.mapTimeToggleBtn.classList.toggle('active', state.mapTimeEnabled);
  el.mapTimeGranYearBtn.classList.toggle('active', state.mapTimeGranularity === 'year');
  el.mapTimeGranMonthBtn.classList.toggle('active', state.mapTimeGranularity === 'month');
  if (state.mapTimeEnabled && !refreshMapTimeScrubber()) state.mapTimeEnabled = false; // scrobble history vanished — fall back to off
  el.mapTimeGranularity.hidden = !state.mapTimeEnabled;
  el.mapTimeScrubber.hidden = !state.mapTimeEnabled;
  el.mapTimeHint.hidden = !state.mapTimeEnabled;

  await renderMap();
}

// Re-runs the geocode-and-render pass with whatever Category/Value/Sort is
// currently selected. Called on open, and again whenever a toolbar control
// changes — cheap on repeat calls since resolved locations are cached, so
// changing a filter after the initial load doesn't re-hit the network.
async function renderMap() {
  const token = ++mapLoadToken;
  const anyLocated = state.raw.some(item => (item.location || '').trim());
  el.mapEmpty.hidden = anyLocated;
  leafletMarkerLayer.clearLayers();
  el.mapCount.textContent = '';
  el.mapAttrBody.innerHTML = '';

  const groups = buildMapGroups();
  if (!groups.length) {
    el.mapStatus.hidden = true;
    if (anyLocated) el.mapCount.textContent = '0 locations match this filter';
    renderMapAttrTable(groups);
    renderMapLegend(groups);
    return;
  }

  el.mapStatus.hidden = false;
  el.mapStatus.textContent = 'Placing ' + groups.length + ' location' + (groups.length === 1 ? '' : 's') + '…';

  const apiKey = loadMapApiKey();
  const cache = loadGeocodeCache();
  let placed = 0, failed = 0;
  for (const group of groups) {
    const resolved = await geocodeLocation(group.label, cache, apiKey);
    if (token !== mapLoadToken) return; // a newer render superseded this one — stop touching stale state
    if (resolved) { placed++; addMapMarker(group, resolved); }
    else failed++;
    el.mapStatus.textContent = 'Placing locations… (' + (placed + failed) + '/' + groups.length + ')';
  }
  saveGeocodeCache(cache);

  const totalAlbums = groups.reduce((sum, g) => sum + g.items.length, 0);
  el.mapStatus.hidden = true;
  el.mapCount.textContent = placed + ' location' + (placed === 1 ? '' : 's')
    + ' \u00b7 ' + totalAlbums + ' album' + (totalAlbums === 1 ? '' : 's')
    + (failed ? ' \u00b7 ' + failed + ' couldn\u2019t be found' : '');

  renderMapAttrTable(groups);
  renderMapLegend(groups);
}

function closeMapModal() {
  el.mapOverlay.hidden = true;
  mapLoadToken++; // invalidate any geocoding pass still in flight
}

// Attribute table (Name/Artist/Location/Year/Genre/Type) listing every
// currently-filtered located album, sorted the same way as each pin's
// popup — a spreadsheet-style, sortable-by-the-same-Sort-control way to
// browse the same set the pins represent, and the only view of it once
// several pins overlap at the current zoom.
function renderMapAttrTable(groups) {
  const items = groups.flatMap(g => g.items.map(item => ({ item, location: g.label })));
  items.sort((a, b) => mapSortComparator()(a.item, b.item));

  if (!items.length) {
    el.mapAttrBody.innerHTML = '<tr class="map-attr-empty-row"><td colspan="100%">No albums match this filter.</td></tr>';
    return;
  }

  el.mapAttrBody.innerHTML = items.map(({ item, location }) => {
    const year = dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : '';
    const genre = combinedGenreStr(item);
    return `
    <tr class="map-attr-row">
      <td class="map-attr-td map-attr-td-cover"><img class="map-attr-row-cover art" data-key="${artKey(item)}" src="${item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item)}" alt=""></td>
      <td class="map-attr-td" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</td>
      <td class="map-attr-td" title="${escapeHtml(item.artist)}">${escapeHtml(item.artist)}</td>
      <td class="map-attr-td" title="${escapeHtml(location)}">${escapeHtml(location)}</td>
      <td class="map-attr-td">${year}</td>
      <td class="map-attr-td map-attr-td-optional" title="${escapeHtml(genre)}">${escapeHtml(genre || '\u2014')}</td>
      <td class="map-attr-td map-attr-td-optional">${escapeHtml(typeAbbrev(item.type || 'album'))}</td>
    </tr>
  `;
  }).join('');

  [...el.mapAttrBody.querySelectorAll('.map-attr-row')].forEach((row, i) => {
    row.addEventListener('click', () => {
      closeMapModal();
      switchTab('albums');
      openDeck(items[i].item);
    });
  });
}

// A fixed, visually-distinct palette for map symbology ("Color by" —
// Genre/Year/Artist). Consistent hashing onto this palette means the same
// genre/artist/decade always gets the same colour across renders and
// reopens, without needing to persist a colour-per-value mapping anywhere.
const MAP_SYMBOLOGY_PALETTE = [
  '#e8734a', '#4ea8de', '#8ac926', '#ffca3a', '#c77dff',
  '#ff6b9d', '#4dd0c4', '#f4a261', '#6a994e', '#a06cd5'
];
const MAP_MIXED_COLOR = '#8a8f98'; // a location whose albums disagree on the chosen attribute's value
function mapColorHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = (hash * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(hash) % MAP_SYMBOLOGY_PALETTE.length;
}

// Resolves the value a group of albums (all at one geocoded location)
// should be coloured by for the current state.mapColorBy — or null if they
// disagree (a location with both a Rock and a Jazz album, say, when
// colouring by Genre), in which case the marker gets a neutral "mixed"
// colour instead of misrepresenting the location as belonging to just one.
function mapGroupSymbologyValue(group) {
  const values = group.items.map(item => {
    if (state.mapColorBy === 'artist') return item.artist || 'Unknown';
    if (state.mapColorBy === 'year') {
      if (dateVal(item.releaseDate) === -Infinity) return 'Unknown';
      const y = new Date(item.releaseDate).getUTCFullYear();
      return (Math.floor(y / 10) * 10) + 's';
    }
    // genre — this release's own first-listed (primary) genre only, not
    // every genre it carries, so a location gets one clean colour per
    // album rather than needing to represent a whole genre list at once.
    const genres = getGenreList(combinedGenreStr(item));
    return genres[0] || 'Unknown';
  });
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : null; // null = mixed
}
function mapColorForGroup(group) {
  if (state.mapColorBy === 'none') return null;
  const value = mapGroupSymbologyValue(group);
  return value === null ? MAP_MIXED_COLOR : MAP_SYMBOLOGY_PALETTE[mapColorHash(value)];
}

// Legend for whatever's actually on the map right now — every distinct
// value+colour combination currently represented (not every genre/artist
// that theoretically could be), plus "Mixed" only if at least one location
// actually has one. Rebuilt on every renderMap() pass alongside the
// markers themselves, from the exact same groups list.
function renderMapLegend(groups) {
  if (state.mapColorBy === 'none' || !groups.length) { el.mapLegend.hidden = true; return; }
  const seen = new Map(); // value -> color
  let hasMixed = false;
  groups.forEach(group => {
    const value = mapGroupSymbologyValue(group);
    if (value === null) { hasMixed = true; return; }
    if (!seen.has(value)) seen.set(value, MAP_SYMBOLOGY_PALETTE[mapColorHash(value)]);
  });
  const entries = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (hasMixed) entries.push(['Mixed', MAP_MIXED_COLOR]);
  if (!entries.length) { el.mapLegend.hidden = true; return; }
  el.mapLegend.innerHTML = entries.map(([label, color]) => `
    <div class="map-legend-item"><span class="map-legend-swatch" style="background:${color}"></span>${escapeHtml(label)}</div>
  `).join('');
  el.mapLegend.hidden = false;
}

function addMapMarker(group, resolved) {
  const color = mapColorForGroup(group);
  const marker = color
    ? L.circleMarker([resolved.lat, resolved.lon], { radius: 8, color: '#12161c', weight: 1.5, fillColor: color, fillOpacity: 0.9 }).addTo(leafletMarkerLayer)
    : L.marker([resolved.lat, resolved.lon]).addTo(leafletMarkerLayer);
  const popup = document.createElement('div');
  popup.className = 'map-popup';
  const title = document.createElement('div');
  title.className = 'map-popup-title';
  title.textContent = group.label;
  popup.appendChild(title);
  group.items.forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'timeline-album-row map-popup-row';
    row.innerHTML = `
      <img class="timeline-album-cover art" data-key="${artKey(item)}" src="${item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item)}" alt="">
      <span class="timeline-album-text">
        <span class="timeline-album-title">${escapeHtml(item.title)}</span>
        <span class="timeline-album-sub">${escapeHtml(item.artist)}</span>
      </span>
    `;
    row.addEventListener('click', () => {
      closeMapModal();
      switchTab('albums');
      openDeck(item);
    });
    popup.appendChild(row);
  });
  marker.bindPopup(popup, { maxWidth: 260 });
}

el.anniversaryBannerClose.addEventListener('click', () => {
  el.anniversaryBanner.hidden = true;
  try { localStorage.setItem(ANNIV_DISMISS_KEY, todayDateKey()); } catch (e) { /* safe to ignore */ }
});
el.duplicateRowBannerClose.addEventListener('click', () => {
  el.duplicateRowBanner.hidden = true;
  try { localStorage.setItem(DUPLICATE_ROW_DISMISS_KEY, todayDateKey()); } catch (e) { /* safe to ignore */ }
});
