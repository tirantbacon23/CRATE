// CRATE — grid rendering, track views, track popularity, iTunes match, cards, mini player, quick peek.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Grid rendering ---------- */

function renderGrid() {
  gridEagerReset();                                      // each drawing builds its own first GRID_EAGER cards (see buildGridSection)
  if (state.activePlaylistId) { renderPlaylistMainPanel(); return; }
  // Safety: an inline-style album quick peek (see openAlbumQuickPeek) can
  // be sitting inside #gridContainer right now — closeAlbumQuickPeek()
  // moves it back out to its normal top-level spot first, so the
  // innerHTML wipe just below can't destroy it outright. A stale peek
  // anchored to a card that's about to be re-rendered/reordered wouldn't
  // make sense to leave open anyway, floating or inline.
  closeAlbumQuickPeek();
  el.viewbar.hidden = false; el.viewbar.classList.remove('in-playlist');
  el.gridContainer.classList.toggle('covers-only', state.mainViewMode === 'covers');
  el.gridContainer.innerHTML = '';
  if (state.filtered.length === 0) {
    showState(state.raw.length === 0 ? 'emptyCatalog' : 'empty', 'albums');
    return;
  }
  hideState('albums');

  if (state.mainViewMode === 'tracks' || state.mainViewMode === 'albumTracks') {
    renderTrackView();
    return;
  }

  if (state.groupBy === 'none') {
    el.gridContainer.appendChild(buildGridSection(state.filtered));
  } else {
    groupItems(state.filtered, state.groupBy).forEach(g => {
      const header = document.createElement('h3');
      header.className = 'group-header';
      header.textContent = g.label + ' · ' + g.items.length;
      el.gridContainer.appendChild(header);
      // "Then by" — a second grouping variable nested within each primary
      // group (e.g. Year, then within each year, Type). Same groupItems()
      // call recursed onto just this group's own items, so a multi-genre
      // album that already appears under two primary groups can ALSO land
      // under two different secondary sub-groups within each, exactly
      // consistent with how the primary grouping already handles that.
      if (state.groupBy2 !== 'none') {
        groupItems(g.items, state.groupBy2).forEach(g2 => {
          const subHeader = document.createElement('h4');
          subHeader.className = 'group-header group-header-sub';
          subHeader.textContent = g2.label + ' · ' + g2.items.length;
          el.gridContainer.appendChild(subHeader);
          el.gridContainer.appendChild(buildGridSection(g2.items));
        });
      } else {
        el.gridContainer.appendChild(buildGridSection(g.items));
      }
    });
  }
  applyCachedArt();
  // The height cards not yet drawn stand in with (see .grid > .card in the CSS): the first card's real one.
  const firstCard = el.gridContainer.querySelector('.grid > .card');
  const cardH = firstCard ? Math.round(firstCard.getBoundingClientRect().height) : 0;
  if (cardH) el.gridContainer.style.setProperty('--card-h', cardH + 'px');
}

/* ---------- Track / Album+Tracks main views ---------- */

function renderTrackView() {
  const wrap = document.createElement('div');
  wrap.className = 'track-view';
  const list = state.filtered;

  if (state.mainViewMode === 'tracks') {
    wrap.classList.add('track-view-table');
    wrap.appendChild(buildTrackTableHeader());
    const body = document.createElement('div');
    body.id = 'trackTableBody';
    body.innerHTML = `<p class="tracklist-status">Loading tracks…</p>`;
    wrap.appendChild(body);
    el.gridContainer.appendChild(wrap);
    loadFlatTrackTable(list);
    return;
  }

  list.forEach(item => wrap.appendChild(buildAlbumTrackGroup(item)));
  el.gridContainer.appendChild(wrap);
  applyCachedArt();
  loadTracksForList(list, state.mainViewMode);
}

// Column widths for the flat "Tracks" file-list table. "#" and "Track" are
// always present (like a Name column in a file explorer); any additional
// configured attributes (Album, Genre, Year, Length, etc.) are appended as
// their own columns, and a Plays column always trails on the right. Each
// column can be dragged narrower/wider from its right edge (see
// wireTrackHeaderResize); widths are pixel-based and persisted per-column.
// BEGIN track-popularity
// How well-liked and how well-known a track is, from Rate Your Music's own rating of it and the number of ratings that rating rests on.
//   wr    adjusted rating: a track's average is pulled toward the library's average until it has enough ratings behind it (TPOP_PRIOR of them), so 5.0 from 3 people does not beat 4.5 from 5,000.
//   pop   popularity, 0-100, relative to the tracks in THIS library: the geometric mean of where its number of ratings and its adjusted rating stand among all of them (a track is only high on both).
//   stand how far its adjusted rating is above (+) or below (-) the average of its own album's rated tracks: what tells tracks on one album apart, since an album's tracks share most of their raters.
// Only tracks with BOTH a rating and a count are worked out. Counts of thousands are rounded by Rate Your Music ("6k"), so small differences between big counts mean little.
const TPOP_PRIOR = 25, TPOP_MIN_TRACKS = 5, TPOP_MIN_ALBUM = 3;
function tpopPercentile(sortedAsc, x) {                              // mid-rank: ties share the middle of their rank, so equal values get the same number
  let lo = 0, hi = sortedAsc.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedAsc[mid] < x) lo = mid + 1; else hi = mid; }
  let eq = 0; for (let i = lo; i < sortedAsc.length && sortedAsc[i] === x; i++) eq++;
  return (lo + eq / 2) / sortedAsc.length * 100;
}
function tpopCompute(entries) {                                      // [{ key, album, rating, votes }] -> Map(key -> { wr, pop, stand, votes })
  const out = new Map(), valid = (entries || []).filter(e => e && Number(e.rating) > 0 && Number(e.votes) > 0).map(e => ({ key: e.key, album: String(e.album), rating: Number(e.rating), votes: Number(e.votes) }));
  if (!valid.length) return out;
  const C = valid.reduce((a, e) => a + e.rating, 0) / valid.length;
  const rows = valid.map(e => ({ e, wr: (e.votes * e.rating + TPOP_PRIOR * C) / (e.votes + TPOP_PRIOR) }));
  const votesSorted = rows.map(r => r.e.votes).sort((a, b) => a - b), wrSorted = rows.map(r => r.wr).sort((a, b) => a - b), enough = rows.length >= TPOP_MIN_TRACKS, byAlbum = new Map();
  rows.forEach(r => { if (!byAlbum.has(r.e.album)) byAlbum.set(r.e.album, []); byAlbum.get(r.e.album).push(r.wr); });
  rows.forEach(r => {
    const wrs = byAlbum.get(r.e.album), mean = wrs.reduce((a, b) => a + b, 0) / wrs.length;
    out.set(r.e.key, { wr: r.wr, pop: enough ? Math.sqrt(tpopPercentile(votesSorted, r.e.votes) * tpopPercentile(wrSorted, r.wr)) : null, stand: wrs.length >= TPOP_MIN_ALBUM ? r.wr - mean : null, votes: r.e.votes });
  });
  return out;
}
// END track-popularity
let tpopCache = null;
function trackPopMap() {                                             // every rated track of the library worked out together (they are ranked against each other); kept for a second so a sort doesn't redo it for every row
  if (tpopCache && Date.now() - tpopCache.at < 1000) return tpopCache.map;
  const entries = [];
  (state.raw || []).forEach(it => { const td = it.trackData || {}; Object.keys(td).forEach(n => { const e = td[n]; if (e && Number(e.rymRating) > 0 && Number(e.rymVotes) > 0) entries.push({ key: it.row + '|' + n, album: String(it.row), rating: Number(e.rymRating), votes: Number(e.rymVotes) }); }); });
  tpopCache = { at: Date.now(), map: tpopCompute(entries) }; return tpopCache.map;
}
const trackPopOf = (item, trackNumber) => trackPopMap().get(item.row + '|' + trackNumber) || null;
function trackColDefaultWidth(sortKey) {
  if (sortKey === 'num') return 40;
  if (sortKey === 'name') return 260;
  if (sortKey === 'plays') return 64;
  if (sortKey === 'rymTrackRating') return 150;          // their headings are long ("RYM track ratings (count)"): room to read them
  if (sortKey === 'rymTrackVotes') return 200;
  if (sortKey === 'rymTrackWR' || sortKey === 'rymTrackPop' || sortKey === 'rymTrackStand') return 190;
  return 120;
}
const TRACK_COL_MIN_WIDTH = 40;

function trackColWidth(sortKey) {
  const w = state.trackColWidths && state.trackColWidths[sortKey];
  return (typeof w === 'number' && w > 0) ? w : trackColDefaultWidth(sortKey);
}

// The widths the Tracks table is drawn with. The Track name column takes whatever the other columns leave, so resizing one column
// changes only that column (the name column gives or takes the difference) and the row fills the pane. When even a narrow name column
// won't fit, every column keeps the width you gave it and the table scrolls sideways: squeezing them all to fit (as before) left a
// narrow pane with every column at its minimum, none of which could be widened.
const TRACK_NAME_MIN_WIDTH = 120;
function trackColWidthsShown() {
  const cols = trackHeaderColumns();
  const widths = cols.map(col => trackColWidth(col.sortKey));
  const available = Math.max(0, el.gridContainer.clientWidth - trackTableRowOverhead(cols.length));
  if (!available) return widths;
  const ni = cols.findIndex(col => col.sortKey === 'name');
  const others = widths.reduce((s, w, i) => i === ni ? s : s + w, 0);
  const own = Number(state.trackColWidths && state.trackColWidths.name) || TRACK_NAME_MIN_WIDTH;          // a width you dragged it to: at least that
  widths[ni] = Math.max(own, available - others);
  return widths;
}
function trackTableGridTemplate() {
  return trackColWidthsShown().map(w => `${w}px`).join(' ');
}

// Pixels consumed by the row itself beyond the column widths — the grid gap
// between each column plus left/right padding (see .track-table-header /
// .main-track-row). Column widths need to leave room for these, or the row
// still overflows the pane even when the widths themselves sum to exactly
// the container's width.
function trackTableRowOverhead(numCols) {
  const GAP = 12;
  const HORIZONTAL_PADDING = 20; // 10px left + 10px right
  return GAP * Math.max(0, numCols - 1) + HORIZONTAL_PADDING;
}

// Re-applies the (fit-to-container) grid template to the Tracks table's
// header and every rendered row — used whenever the container's available
// width changes for reasons other than dragging a column (window resize,
// dragging a side panel, or showing/hiding a side panel), so the table
// re-fits instead of silently drifting out of sync.
function refitTrackTable() {
  const inLibraryTracks = !state.activePlaylistId && state.mainViewMode === 'tracks';
  const inPlaylistTracks = !!state.activePlaylistId && state.playlistViewMode === 'tracks';
  if (!inLibraryTracks && !inPlaylistTracks) return;
  const header = document.getElementById('trackTableHeader');
  if (!header) return;
  const template = trackTableGridTemplate();
  header.style.gridTemplateColumns = template;
  const body = document.getElementById('trackTableBody');
  if (body) body.querySelectorAll('.main-track-row').forEach(row => { row.style.gridTemplateColumns = template; });
}

function activeTrackColumns() {
  return (state.fields.tracks || []).filter(v => v && v !== 'none');
}

// Resolves a configured column's value for one specific track row. Most
// keys are album-level (artist, genre, year, ...) and come from keyToVal;
// 'trackLength' and 'duration' need the individual track / cached tracklist;
// 'genre' checks this specific track's own override (set via "Edit track
// properties…", item.trackData[trackNum].genre) first, falling back to the
// album's genre exactly as before when the track has none — so populating
// a track's own genre actually shows up here instead of being stored but
// never displayed.
function trackColumnVal(key, item, track) {
  if (key === 'rymTrackWR' || key === 'rymTrackPop' || key === 'rymTrackStand') {            // worked out from the rating and the number of ratings (see track-popularity): blank where a track has not got both
    const v = trackPopOf(item, track.trackNumber); if (!v) return '';
    if (key === 'rymTrackWR') return v.wr.toFixed(2);
    if (key === 'rymTrackPop') return v.pop === null ? '' : String(Math.round(v.pop));
    return v.stand === null ? '' : (v.stand >= 0 ? '+' : '\u2212') + Math.abs(v.stand).toFixed(2);
  }
  if (key === 'rymTrackBold') return rymTrackIsBold(item, track) ? 'Bold' : '';          // one of the songs RYM prints in bold
  if (key === 'rymTrackRating' || key === 'rymTrackVotes') {            // Rate Your Music's own rating of THIS song, and how many ratings it rests on
    const td = item.trackData && item.trackData[track.trackNumber]; if (!td || !(td.rymRating > 0)) return '';
    return key === 'rymTrackRating' ? Number(td.rymRating).toFixed(2) : (td.rymVotes ? Number(td.rymVotes).toLocaleString() : '');
  }
  if (key === 'trackLength') return formatDuration(track.trackTimeMillis);
  if (key === 'duration') {
    const cache = state.trackCache[artKey(item)];
    return (cache && cache.length > 0) ? formatDuration(cache.reduce((s, t) => s + (t.trackTimeMillis || 0), 0)) : '---';
  }
  if (key === 'genre') {
    const tGenre = item.trackData && item.trackData[track.trackNumber] && item.trackData[track.trackNumber].genre;
    if (tGenre) return tGenre;
  }
  return keyToVal(key, item);
}

// Column key -> sort key. '#' sorts by track number, 'Track' sorts by track
// name; everything else lines up with the configured field key. This is the
// single source of truth for which header cells are clickable/reassignable.
function trackHeaderColumns() {
  const activeCols = activeTrackColumns();
  return [
    { sortKey: 'num', label: '#', fixed: true },
    { sortKey: 'name', label: 'Track', fixed: true },
    ...activeCols.map((key, i) => ({ sortKey: key, label: TRACK_COLUMN_LABELS[key] || '', fixed: false, slotIndex: i })),
    { sortKey: 'plays', label: 'Plays', fixed: true, plays: true }
  ];
}

function buildTrackTableHeader() {
  const cols = trackHeaderColumns();
  const header = document.createElement('div');
  header.className = 'track-table-header';
  header.id = 'trackTableHeader';
  header.style.gridTemplateColumns = trackTableGridTemplate();
  header.innerHTML = cols.map(col => {
    const arrow = state.trackSort.key === col.sortKey ? (state.trackSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    const classes = ['ttc-head', col.plays ? 'ttc-head-plays' : '', col.fixed ? '' : 'ttc-head-draggable'].filter(Boolean).join(' ');
    const dragAttrs = col.fixed ? '' : `data-slot-index="${col.slotIndex}" draggable="true"`;
    const titleText = col.plays ? 'Click to sort · right-click to add a column' : col.fixed ? 'Click to sort' : 'Click to sort · right-click to change column · drag to reorder';
    return `<span class="${classes}" data-sort-key="${col.sortKey}" ${dragAttrs} title="${titleText}">` +
      `<span class="ttc-head-label">${escapeHtml(col.label)}${arrow}</span>` +
      `<span class="ttc-resize-handle" data-resize-key="${col.sortKey}" title="Drag to resize column"></span>` +
      `</span>`;
  }).join('');

  header.addEventListener('click', (e) => {
    if (e.target.closest('.ttc-resize-handle')) return; // was a resize, not a sort click
    const head = e.target.closest('.ttc-head');
    if (!head) return;
    const key = head.dataset.sortKey;
    if (state.trackSort.key === key) {
      state.trackSort.dir = state.trackSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.trackSort.key = key;
      state.trackSort.dir = 'asc';
    }
    renderFlatTrackTable();
    header.replaceWith(buildTrackTableHeader());
  });

  header.addEventListener('contextmenu', (e) => {
    const head = e.target.closest('.ttc-head');
    if (!head) return;
    const plays = head.dataset.sortKey === 'plays';                // Plays stays last; right-clicking it adds a column before it
    if (head.dataset.slotIndex === undefined && !plays) return;    // # and Track are fixed
    e.preventDefault();
    openTrackColumnMenu(head, plays ? activeTrackColumns().length : parseInt(head.dataset.slotIndex, 10), e.clientX, e.clientY, plays);
  });

  wireTrackHeaderDragToReorder(header);
  wireTrackHeaderResize(header);

  return header;
}

// Column resizing for the Tracks-table header: dragging a column's right
// edge live-updates that column's pixel width across the header and every
// currently-rendered row (they share one grid-template-columns string), then
// persists the new width once the drag ends. Works alongside — not instead
// of — the drag-to-reorder handles above; dragstart on the reorder handles
// is guarded to ignore the resize handle (see wireTrackHeaderDragToReorder).
function wireTrackHeaderResize(header) {
  let resizeKey = null;
  let startX = 0;
  let startWidth = 0;
  let handleEl = null;
  let nameEdge = false, nameStart = 0, nextStart = 0, fillStart = 0, nextKey = '';          // the Track name column's own edge (see onMove)

  function applyTemplateEverywhere() {
    refitTrackTable();
  }

  function onMove(e) {
    if (!resizeKey) return;
    const delta = Math.round(e.clientX - startX);
    if (nameEdge) {
      // The name column fills the room the others leave. Dragged wider than that, it keeps the width you drag it to (the table scrolls);
      // dragged narrower, it stays filling and the column to its right takes the room, so the edge follows the mouse either way.
      const target = Math.max(TRACK_NAME_MIN_WIDTH, Math.min(1600, nameStart + delta));
      if (target >= fillStart) { state.trackColWidths.name = target; if (nextKey) state.trackColWidths[nextKey] = nextStart; }
      else { delete state.trackColWidths.name; if (nextKey) state.trackColWidths[nextKey] = Math.max(TRACK_COL_MIN_WIDTH, nextStart + fillStart - target); }
    } else state.trackColWidths[resizeKey] = Math.max(TRACK_COL_MIN_WIDTH, Math.min(1200, startWidth + delta));
    applyTemplateEverywhere();
  }

  function onUp() {
    if (!resizeKey) return;
    if (handleEl) handleEl.classList.remove('ttc-resizing');
    resizeKey = null;
    handleEl = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    savePrefs();
  }

  header.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.ttc-resize-handle');
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const cols = trackHeaderColumns(), shown = trackColWidthsShown();
    let i = cols.findIndex(col => col.sortKey === handle.dataset.resizeKey);
    if (!cols[i]) return;
    nameEdge = cols[i].sortKey === 'name';
    if (!state.trackColWidths) state.trackColWidths = {};
    if (nameEdge) {
      const available = Math.max(0, el.gridContainer.clientWidth - trackTableRowOverhead(cols.length));
      nameStart = shown[i]; nextKey = cols[i + 1] ? cols[i + 1].sortKey : ''; nextStart = nextKey ? shown[i + 1] : 0;
      fillStart = available - shown.reduce((sum, w, j) => j === i ? sum : sum + w, 0);
    }
    resizeKey = cols[i].sortKey;
    handleEl = handle;
    handleEl.classList.add('ttc-resizing');
    startX = e.clientX;
    startWidth = shown[i];
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Double-click a resize handle to reset that column back to its default width.
  header.addEventListener('dblclick', (e) => {
    const handle = e.target.closest('.ttc-resize-handle');
    if (!handle) return;
    e.stopPropagation();
    if (state.trackColWidths) delete state.trackColWidths[handle.dataset.resizeKey];
    applyTemplateEverywhere();
    savePrefs();
  });
}

// Drag-and-drop reordering for the configurable Tracks-table columns. "#",
// "Track" and "Plays" stay pinned at their ends (not draggable); only the
// columns pulled from state.fields.tracks can be picked up and dropped onto
// each other to swap position. Reordering rewrites state.fields.tracks to
// match the new left-to-right order (dropping any gaps), persists it, then
// rebuilds the header and re-renders the body so column contents line up.
function wireTrackHeaderDragToReorder(header) {
  let draggedIndex = null;

  header.addEventListener('dragstart', (e) => {
    if (e.target.closest('.ttc-resize-handle')) { e.preventDefault(); return; }
    const head = e.target.closest('.ttc-head-draggable');
    if (!head) { e.preventDefault(); return; }
    draggedIndex = parseInt(head.dataset.slotIndex, 10);
    head.classList.add('ttc-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(draggedIndex)); } catch (err) {}
  });

  header.addEventListener('dragover', (e) => {
    const head = e.target.closest('.ttc-head-draggable');
    if (!head || draggedIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    header.querySelectorAll('.ttc-drop-target').forEach(el => el.classList.remove('ttc-drop-target'));
    if (parseInt(head.dataset.slotIndex, 10) !== draggedIndex) head.classList.add('ttc-drop-target');
  });

  header.addEventListener('dragleave', (e) => {
    const head = e.target.closest('.ttc-head-draggable');
    if (head) head.classList.remove('ttc-drop-target');
  });

  header.addEventListener('drop', (e) => {
    const head = e.target.closest('.ttc-head-draggable');
    header.querySelectorAll('.ttc-drop-target').forEach(el => el.classList.remove('ttc-drop-target'));
    if (!head || draggedIndex === null) return;
    e.preventDefault();
    const targetIndex = parseInt(head.dataset.slotIndex, 10);
    if (targetIndex === draggedIndex) return;

    const cols = activeTrackColumns();
    const [moved] = cols.splice(draggedIndex, 1);
    cols.splice(targetIndex, 0, moved);
    state.fields.tracks = cols;
    savePrefs();

    const oldHeader = document.getElementById('trackTableHeader');
    if (oldHeader) oldHeader.replaceWith(buildTrackTableHeader());
    renderFlatTrackTable();
  });

  header.addEventListener('dragend', () => {
    draggedIndex = null;
    header.querySelectorAll('.ttc-dragging, .ttc-drop-target').forEach(el => el.classList.remove('ttc-dragging', 'ttc-drop-target'));
  });
}

// Right-click context menu for reassigning a single Tracks-table column to a
// different field, without opening the full "Customize panel" modal.
let trackColumnMenuEl = null;
function openTrackColumnMenu(headEl, slotIndex, x, y, adding) {
  closeTrackColumnMenu();
  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu track-col-menu';
  // The Tracks list, not the releases' one: it has the song's own Rate Your Music rating and rating count.
  const cur = activeTrackColumns();
  menu.innerHTML = `
    <div class="menu-section-title">${adding ? 'Add a column' : 'Change column'}</div>
    ${Object.entries(TRACK_COLUMN_LABELS).filter(([val]) => !(adding && val === 'none')).map(([val, lbl]) => {
      const current = adding ? undefined : cur[slotIndex];
      const isActive = (val === 'none' && !current) || current === val;
      return `<button type="button" data-field-val="${val}" class="${isActive ? 'track-col-menu-active' : ''}">${escapeHtml(lbl)}</button>`;
    }).join('')}
  `;
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = Math.max(4, left) + 'px';
  menu.style.top = Math.max(4, top) + 'px';

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-field-val]');
    if (!btn) return;
    const val = btn.dataset.fieldVal;
    // Slots count the columns on screen (blank slots skipped), so the list is compacted before one is set.
    const cols = activeTrackColumns();
    if (val === 'none') cols.splice(slotIndex, 1); else cols[slotIndex] = val;
    state.fields.tracks = cols;
    savePrefs();
    closeTrackColumnMenu();
    const oldHeader = document.getElementById('trackTableHeader');
    if (oldHeader) oldHeader.replaceWith(buildTrackTableHeader());
    renderFlatTrackTable();
  });

  trackColumnMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeTrackColumnMenuOnOutsideClick), 0);
}
function closeTrackColumnMenuOnOutsideClick(e) {
  if (trackColumnMenuEl && !trackColumnMenuEl.contains(e.target)) closeTrackColumnMenu();
}
function closeTrackColumnMenu() {
  if (trackColumnMenuEl) { trackColumnMenuEl.remove(); trackColumnMenuEl = null; }
  document.removeEventListener('click', closeTrackColumnMenuOnOutsideClick);
}

// Belt-and-suspenders guard for loadFlatTrackTable/loadPlaylistFlatTrackTable
// below. fetchWithTimeout (see mbFetch above) already stops the individual
// iTunes/MusicBrainz requests inside getTracksFor() from hanging forever,
// but this wraps the per-item CALL as well, so any future unguarded async
// step added to that lookup chain can't reintroduce the same "one stuck
// album freezes the whole Tracks table forever" failure — a wedged item
// just resolves as `fallback` once the timeout passes, instead of leaving
// loadFlatTrackTable's "wait for every item" loop stuck at non-zero forever.
function withHardTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      () => { clearTimeout(timer); resolve(fallback); }
    );
  });
}

// Loads every album's tracklist (concurrently, using the same cache as the
// other track views) and flattens them into one array so the Tracks table
// behaves like a real sortable file-list rather than per-album chunks.
let flatTrackLoadToken = 0;
function loadFlatTrackTable(list) {
  const token = ++flatTrackLoadToken;
  const queue = list.slice();
  const rows = [];
  const concurrency = 4;
  let active = 0;
  let remaining = queue.length;

  if (remaining === 0) { state.flatTrackRows = []; renderFlatTrackTable(); return; }

  function stale() {
    return token !== flatTrackLoadToken || state.mainViewMode !== 'tracks' || state.activePlaylistId;
  }

  const total = remaining; let shownAt = 0, shownTimer = 0;
  state.flatTrackLoading = { done: 0, total, token };
  function settle() {
    clearTimeout(shownTimer); shownTimer = 0;
    if (stale()) return;
    state.flatTrackLoading = remaining ? { done: total - remaining, total, token } : null;
    state.flatTrackRows = rows.slice(); shownAt = Date.now();
    renderFlatTrackTable();
  }
  function settleSoon() {                                            // (1.93.4) the table fills in as tracklists arrive, at most about once a second, not only when all are in
    if (shownTimer) return;
    shownTimer = setTimeout(settle, Math.max(0, (shownAt ? 1000 : 250) - (Date.now() - shownAt)));
  }

  function next() {
    if (queue.length === 0) return;
    if (active >= concurrency) return;
    const item = queue.shift();
    active++;
    withHardTimeout(getTracksFor(item), 20000, []).then(tracks => {
      const kept = new Set(filterTracksBySearch(item, tracks));
      tracks.forEach((t, i) => { if (kept.has(t)) rows.push({ item, track: t, idx: i }); }); // idx stays the track's position in the FULL tracklist — it's part of the row key when trackNumber is missing
    }).finally(() => {
      active--; remaining--;
      if (stale()) return;
      if (remaining === 0) settle();
      else { settleSoon(); next(); }
    });
    next();
  }
  for (let i = 0; i < concurrency; i++) next();
}

function trackRowKey(row) {
  return `${row.item.row}::${row.track.trackNumber || row.idx}`;
}

// Resolves the value used to *sort* a row for a given sort key — numeric
// where it makes sense (track #, year, rating, length, plays) and
// case-folded strings otherwise.
function trackSortValue(row, key) {
  if (key === 'rymTrackWR' || key === 'rymTrackPop' || key === 'rymTrackStand') { const v = trackPopOf(row.item, row.track.trackNumber), x = v ? (key === 'rymTrackWR' ? v.wr : key === 'rymTrackPop' ? v.pop : v.stand) : null; return x === null || x === undefined ? -1e9 : x; }          // numbers, and tracks without one last when sorting high to low
  if (key === 'rymTrackBold') return rymTrackIsBold(row.item, row.track) ? 1 : 0;
  if (key === 'num') return row.idx + 1;                     // its place in the tracklist, the number shown
  if (key === 'name') return (row.track.trackName || '').toLowerCase();
  if (key === 'plays') return trackScrobbleCountFor(row.item.artist, row.item.title, row.track.trackName) || 0;
  if (key === 'trackLength') return row.track.trackTimeMillis || 0;
  if (key === 'duration') {
    const cache = state.trackCache[artKey(row.item)];
    return (cache || []).reduce((s, t) => s + (t.trackTimeMillis || 0), 0);
  }
  if (key === 'year' || key === 'releaseDate') return dateVal(row.item.releaseDate) === -Infinity ? -Infinity : dateVal(row.item.releaseDate);
  if (key === 'recordedDate') return dateVal(row.item.recordedDate) === -Infinity ? -Infinity : dateVal(row.item.recordedDate);
  if (key === 'rating') return row.item.rating || 0;
  if (key === 'rymTrackRating' || key === 'rymTrackVotes') { const td = row.item.trackData && row.item.trackData[row.track.trackNumber]; return td ? (Number(key === 'rymTrackRating' ? td.rymRating : td.rymVotes) || 0) : 0; }          // sorted as numbers
  if (key === 'rymVotes') return row.item.rymVotes || 0;
  return String(trackColumnVal(key, row.item, row.track) || '').toLowerCase();
}

function renderFlatTrackTable() {
  const body = document.getElementById('trackTableBody');
  if (!body) return;
  const rows = state.flatTrackRows.slice();

  const ld = state.flatTrackLoading && state.flatTrackLoading.token === flatTrackLoadToken && !state.activePlaylistId ? state.flatTrackLoading : null, loadingNote = ld ? `<p class="tracklist-status">Loading tracklists\u2026 ${ld.done.toLocaleString()} of ${ld.total.toLocaleString()}</p>` : '';
  if (rows.length === 0) {
    body.innerHTML = ld ? loadingNote : '<p class="tracklist-status">No tracks found for this filter.</p>';
    return;
  }

  const { key, dir } = state.trackSort;
  if (key) {
    rows.sort((a, b) => {
      const va = trackSortValue(a, key), vb = trackSortValue(b, key);
      let cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  const activeCols = activeTrackColumns();
  const template = trackTableGridTemplate();

  body.innerHTML = rows.map(row => {
    const { item, track: t } = row;
    const rowKey = trackRowKey(row);
    const scrobbleCount = trackScrobbleCountFor(item.artist, item.title, t.trackName);
    const colsHtml = activeCols.map(colKey => {
      if (colKey === 'rating') {
        const titleText = escapeHtml(item.rating ? `${item.rating}/5` : '');
        return `<span class="mt-col" title="${titleText}">${item.rating ? starRatingHtml(item.rating) : '—'}</span>`;
      }
      const val = trackColumnVal(colKey, item, t);
      return `<span class="mt-col" title="${escapeHtml(String(val || ''))}">${val ? escapeHtml(String(val)) : '—'}</span>`;
    }).join('');
    const selected = state.selectedTracks.has(rowKey);
    return `
      <div class="main-track-row${selected ? ' selected' : ''}" data-track-key="${rowKey}" tabindex="0" style="grid-template-columns: ${template}">
        <span class="mt-num">${trackNumHtml(t, row.idx)}</span>
        <span class="mt-title${rymBoldTrackClass(t, item)}" title="${escapeHtml(t.trackName || '')}${rymTrackIsBold(item, t) ? ' · one of the songs Rate Your Music prints in bold' : ''}">${escapeHtml(t.trackName || '')}</span>
        ${colsHtml}
        <span class="mt-plays">${scrobbleCount > 0 ? scrobbleCount : ''}</span>
      </div>`;
  }).join('') + loadingNote;

  // Event delegation: single click selects (with shift/ctrl range & toggle
  // support), double-click opens the album deck for that track's row.
  body.onclick = (e) => {
    const rowEl = e.target.closest('.main-track-row');
    if (!rowEl) return;
    handleTrackRowClick(e, rowEl);
  };
  body.ondblclick = async (e) => {
    const rowEl = e.target.closest('.main-track-row');
    if (!rowEl) return;
    
    const rowKey = rowEl.dataset.trackKey;
    const match = rows.find(r => trackRowKey(r) === rowKey);
    if (!match) return;

    // Saved link overrides, the per-album default (manual → YouTube link
    // only, auto-lookup → fuzzy Spotify search), and the "no reliable way
    // to play" skip are all handled centrally by playTrackNow now — see its
    // comment for why a manual album's fuzzy search stays skipped.
    const titleEl = rowEl.querySelector('.mt-title');
    const originalTitle = titleEl.textContent;
    titleEl.textContent = 'Loading...';
    try {
      await playTrackNow(match.item, match.track.trackName, match.track.trackNumber);
    } finally {
      if (titleEl.isConnected) titleEl.textContent = originalTitle;
    }
  };
  body.oncontextmenu = (e) => {
    const rowEl = e.target.closest('.main-track-row');
    if (!rowEl) return;
    e.preventDefault();
    const rowKey = rowEl.dataset.trackKey;
    const match = rows.find(r => trackRowKey(r) === rowKey);
    if (!match) return;

    // Right-clicking a row that's part of the current selection acts on the
    // whole selection; right-clicking outside it selects just that row
    // first (standard behavior), same as a plain click would.
    if (!state.selectedTracks.has(rowKey)) {
      state.selectedTracks.clear();
      state.selectedTracks.add(rowKey);
      state.lastSelectedTrackKey = rowKey;
      Array.from(body.querySelectorAll('.main-track-row')).forEach(r => r.classList.toggle('selected', r.dataset.trackKey === rowKey));
    }
    const selectedItems = rows
      .filter(r => state.selectedTracks.has(trackRowKey(r)))
      .map(r => ({ itemType: 'track', row: r.item.row, albumId: r.item.albumId || '', trackNum: r.track.trackNumber || '', trackName: r.track.trackName || '' }));

    openTrackContextMenu(match.item, match.track.trackName, e.clientX, e.clientY, match.track.trackNumber, selectedItems);
  };
}

// Handles click-select (plain click, ctrl/cmd toggle, shift range) for a
// list of track rows that all share the single state.selectedTracks Set —
// used by both the flat Tracks table and the per-album "Album and Tracks"
// view. containerEl/rowSelector default to the flat table's own body/rows;
// the per-album view passes its own tracklist wrapper so shift-range
// selection stays scoped to that one album instead of spanning all of them.
function handleTrackRowClick(e, rowEl, containerEl, rowSelector) {
  const key = rowEl.dataset.trackKey;
  const body = containerEl || document.getElementById('trackTableBody');
  const selector = rowSelector || '.main-track-row';
  const allRows = Array.from(body.querySelectorAll(selector));
  const keys = allRows.map(r => r.dataset.trackKey);

  if (e.shiftKey && state.lastSelectedTrackKey && keys.includes(state.lastSelectedTrackKey)) {
    const a = keys.indexOf(state.lastSelectedTrackKey);
    const b = keys.indexOf(key);
    const [start, end] = a < b ? [a, b] : [b, a];
    if (!(e.ctrlKey || e.metaKey)) state.selectedTracks.clear();
    for (let i = start; i <= end; i++) state.selectedTracks.add(keys[i]);
  } else if (e.ctrlKey || e.metaKey) {
    if (state.selectedTracks.has(key)) state.selectedTracks.delete(key);
    else state.selectedTracks.add(key);
    state.lastSelectedTrackKey = key;
  } else {
    state.selectedTracks.clear();
    state.selectedTracks.add(key);
    state.lastSelectedTrackKey = key;
  }

  allRows.forEach(r => r.classList.toggle('selected', state.selectedTracks.has(r.dataset.trackKey)));
}

// Ctrl/Cmd+A for whichever flat track view is currently on screen (the
// main "Tracks" table or the per-album "Album and Tracks" view) — both
// tag their rows with data-track-key, matched against the single shared
// state.selectedTracks Set, so selecting "everything visible" is just
// every such row currently in the DOM.
function selectAllVisibleTracks() {
  const rowEls = Array.from(el.gridContainer.querySelectorAll('[data-track-key]'));
  if (!rowEls.length) return;
  rowEls.forEach(r => state.selectedTracks.add(r.dataset.trackKey));
  state.lastSelectedTrackKey = rowEls[rowEls.length - 1].dataset.trackKey;
  rowEls.forEach(r => r.classList.add('selected'));
}

// Click-select for an album card (main "Albums" grid and "Album covers"
// view — both render through buildCard) — plain/ctrl/shift semantics
// mirroring handleTrackRowClick, but selecting a card no longer opens its
// release view; that's now double-click, Enter, or right-click → "View
// album" (see buildCard). Range/select-all order follows DOM order, i.e.
// whatever's currently sorted/grouped into the grid.
function handleAlbumCardClick(e, item, card) {
  const rowStr = String(item.row);
  const cardEls = Array.from(el.gridContainer.querySelectorAll('.card[data-album-row]'));
  const rows = cardEls.map(c => c.dataset.albumRow);

  if (e.shiftKey && state.lastSelectedAlbumRow && rows.includes(state.lastSelectedAlbumRow)) {
    const a = rows.indexOf(state.lastSelectedAlbumRow);
    const b = rows.indexOf(rowStr);
    const [start, end] = a < b ? [a, b] : [b, a];
    if (!(e.ctrlKey || e.metaKey)) state.selectedAlbums.clear();
    for (let i = start; i <= end; i++) state.selectedAlbums.add(rows[i]);
  } else if (e.ctrlKey || e.metaKey) {
    if (state.selectedAlbums.has(rowStr)) state.selectedAlbums.delete(rowStr);
    else state.selectedAlbums.add(rowStr);
    state.lastSelectedAlbumRow = rowStr;
  } else {
    state.selectedAlbums.clear();
    state.selectedAlbums.add(rowStr);
    state.lastSelectedAlbumRow = rowStr;
  }

  cardEls.forEach(c => c.classList.toggle('selected', state.selectedAlbums.has(c.dataset.albumRow)));
  updateAlbumSelBar();
}

// Ctrl/Cmd+A for the "Albums" and "Album covers" grid views — every
// currently-rendered card (respecting whatever filter/sort/group is
// active), same DOM-order approach as selectAllVisibleTracks above.
function selectAllVisibleAlbums() {
  const cardEls = Array.from(el.gridContainer.querySelectorAll('.card[data-album-row]'));
  if (!cardEls.length) return;
  cardEls.forEach(c => state.selectedAlbums.add(c.dataset.albumRow));
  state.lastSelectedAlbumRow = cardEls[cardEls.length - 1].dataset.albumRow;
  cardEls.forEach(c => c.classList.add('selected'));
  updateAlbumSelBar();
}

function buildAlbumTrackGroup(item) {
  const group = document.createElement('div');
  group.className = 'track-group';

  const year = dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : '';
  const header = document.createElement('div');
  header.className = 'track-group-header';
  header.innerHTML = `
    <img class="art track-group-art" data-key="${artKey(item)}" alt="">
    <div class="track-group-text">
      <p class="track-group-title">${escapeHtml(item.title)}</p>
      <p class="track-group-sub">${escapeHtml(item.artist)}${year ? ' · ' + year : ''}</p>
    </div>
    <div class="track-group-rating">${starRatingHtml(item.rating)}</div>
  `;
  header.addEventListener('click', () => openDeck(item));
  header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openAlbumCardContextMenu(item, e.clientX, e.clientY);
  });
  group.appendChild(header);

  const tracksWrap = document.createElement('div');
  tracksWrap.className = 'track-group-tracks';
  tracksWrap.dataset.tracksFor = item.row;
  tracksWrap.innerHTML = '<p class="tracklist-status">Loading tracks…</p>';
  group.appendChild(tracksWrap);

  return group;
}

function loadTracksForList(list, mode) {
  const queue = list.slice();
  const concurrency = 3;
  let active = 0;

  function next() {
    if (queue.length === 0) return;
    if (active >= concurrency) return;
    const item = queue.shift();
    active++;
    withHardTimeout(getTracksFor(item), 20000, []).then(tracks => {
      if (state.mainViewMode !== mode) return; // view changed since — don't touch stale DOM
      // 'tracks' mode is handled by loadFlatTrackTable() instead — this loader
      // now only serves the per-album "Album and Tracks" view.
      const tw = el.gridContainer.querySelector(`[data-tracks-for="${item.row}"]`);
      if (!tw) return;
      let shown = []; // filled in below once there are tracks to show
      if (!tracks.length) {
        tw.innerHTML = '<p class="tracklist-status">No tracklist found for this release.</p>';
      } else {
        // Manually-added albums (isManualAlbum) skip the Spotify play
        // button and get a YouTube one instead when a link was saved for
        // that track — same reasoning as the deck's tracklist: a fuzzy
        // Spotify search on a release the auto-lookup couldn't even find
        // would otherwise confidently play back an unrelated track.
        const manual = isManualAlbum(item);
        // Same search narrowing as the flat Tracks table — see
        // filterTracksBySearch. Each shown row keeps its index in the FULL
        // tracklist (i) since that's part of its row key when trackNumber is
        // missing; `shown` is also what the context-menu handler below must
        // index into, as DOM child order now matches it rather than `tracks`.
        const kept = new Set(filterTracksBySearch(item, tracks));
        shown = tracks.map((t, i) => ({ t, i })).filter(x => kept.has(x.t));
        tw.innerHTML = shown.map(({ t, i }) => {
          const scrobbleCount = trackScrobbleCountFor(item.artist, item.title, t.trackName);
          const trackName = t.trackName || '';
          const rowKey = `${item.row}::${t.trackNumber || i}`;
          const selected = state.selectedTracks.has(rowKey);
          return `
          <div class="track-row${selected ? ' selected' : ''}" data-track-key="${rowKey}" tabindex="0">
            <span class="track-num">${trackNumHtml(t, i)}</span>
            <span class="track-name">
              ${(!manual || t.spotifyLink) ? `<button type="button" class="track-play-btn" data-row="${escapeHtml(String(item.row))}" data-track-num="${escapeHtml(String(t.trackNumber || ''))}" data-track-name="${escapeHtml(trackName)}" title="Play on Spotify" aria-label="Play ${escapeHtml(trackName)} on Spotify">▶</button>` : ''}
              ${t.youtubeLink ? `<button type="button" class="track-play-yt-btn" data-youtube-link="${escapeHtml(t.youtubeLink)}" data-track-name="${escapeHtml(trackName)}" data-row="${escapeHtml(String(item.row))}" title="Play on YouTube" aria-label="Play ${escapeHtml(trackName)} on YouTube">▶ YT</button>` : ''}
              ${t.soundcloudLink ? `<a class="track-play-sc-btn" href="${escapeHtml(t.soundcloudLink)}" target="_blank" rel="noopener noreferrer" title="Open on SoundCloud" aria-label="Open ${escapeHtml(trackName)} on SoundCloud">SC ↗</a>` : ''}
              <span class="trk-title${rymBoldTrackClass(t, item)}">${escapeHtml(trackName)}</span>${scrobbleCount > 0 ? `<span class="track-scrobble-count" title="Last.fm plays">${scrobbleCount} play${scrobbleCount === 1 ? '' : 's'}</span>` : ''}
            </span>
            <span class="track-time">${formatDuration(t.trackTimeMillis)}</span>
          </div>
        `;
        }).join('');
      }
      // Click-select (plain/ctrl/shift, same as the flat Tracks table —
      // see handleTrackRowClick) scoped to this album's own rows, so a
      // couple of tracks can be picked out before right-clicking. Right-
      // click any row to get the same track context menu (View album /
      // Add to playlist / Search) as the flat Tracks table and the deck —
      // "Add to playlist" acts on the whole selection when the row that
      // was right-clicked is part of one.
      tw.onclick = (e) => {
        if (e.target.closest('.track-play-btn') || e.target.closest('.track-play-yt-btn')) return; // handled by the delegated play-button listener below
        const rowEl = e.target.closest('.track-row');
        if (!rowEl) return;
        handleTrackRowClick(e, rowEl, tw, '.track-row');
      };
      tw.oncontextmenu = (e) => {
        const rowEl = e.target.closest('.track-row');
        if (!rowEl) return;
        e.preventDefault();
        const rowKey = rowEl.dataset.trackKey;
        const idx = Array.from(tw.children).indexOf(rowEl);
        const track = shown[idx] && shown[idx].t;
        if (!track) return;

        if (!state.selectedTracks.has(rowKey)) {
          state.selectedTracks.clear();
          state.selectedTracks.add(rowKey);
          state.lastSelectedTrackKey = rowKey;
          Array.from(tw.querySelectorAll('.track-row')).forEach(r => r.classList.toggle('selected', r.dataset.trackKey === rowKey));
        }
        const selectedItems = shown
          .map(({ t, i }) => ({ t, key: `${item.row}::${t.trackNumber || i}` }))
          .filter(x => state.selectedTracks.has(x.key))
          .map(x => ({ itemType: 'track', row: item.row, albumId: item.albumId || '', trackNum: x.t.trackNumber || '', trackName: x.t.trackName || '' }));

        openTrackContextMenu(item, track.trackName, e.clientX, e.clientY, track.trackNumber, selectedItems);
      };
    }).finally(() => { active--; next(); });
    next();
  }
  for (let i = 0; i < concurrency; i++) next();
}

// True for an album added/edited via the manual tracklist builder (see
// showAddForm()/saveEditAlbum()) — these exist specifically for releases
// the iTunes/MusicBrainz auto-lookup can't find, so callers use this to
// skip the automatic Spotify fuzzy-search that would otherwise confidently
// return an unrelated track for a niche release Spotify doesn't actually have.
function isManualAlbum(item) {
  return !!(item && item.hasManualTracklist);
}

// BEGIN itunes-match
// ---- Finding the iTunes album that IS this release ----
// An iTunes album search is ordered by RELEVANCE to the words typed, not by how closely a result is the album
// you asked for. Three lookups (the cover art, its recovery path, and the tracklist) used to take results[0] on
// faith — so an album like "Touch" by "Touch", whose search terms ("Touch Touch") are also the heart of "Total
// Touch", got Total Touch's cover and, worse, its TRACKS. A result is now accepted only when its title AND its
// artist match this release; otherwise there is no iTunes match (the tracklist then falls back to the release's
// own MusicBrainz link, and art to the placeholder) rather than a confident wrong one.
const ITUNES_EDITION_TAIL = /\b(ep|single|deluxe|remaster(?:ed)?|expanded|anniversary|edition|version|bonus|explicit|special|collector|reissue|mono|stereo|digital|\d{4}\s+mix)\b/i;
function foldKey(s) {
  return normMatchKey(String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ')).replace(/^the /, '');
}
// iTunes adds edition talk to titles: in brackets ("(Deluxe Edition)" — normMatchKey already drops those) or
// after a dash ("Abbey Road - Remastered", "Touch - EP"). Only a tail that LOOKS like edition talk is dropped,
// so a real subtitle ("Live - Paris") still has to match.
function itunesTitleKey(name) {
  return foldKey(String(name || '').replace(/\s+[-\u2013\u2014]\s+([^-\u2013\u2014]*)$/, (m, tail) => (ITUNES_EDITION_TAIL.test(tail) ? '' : m)));
}
function creditKeys(s) {
  return String(s || '').split(/\s*(?:,|;|\/|&|\band\b|\bfeat\.?|\bfeaturing\b|\bwith\b|\bx\b)\s*/i).map(foldKey).filter(Boolean);
}
// Same artist, or — for collaborations/features — at least one credited artist in common.
function itunesArtistMatches(hitArtist, itemArtist) {
  const a = foldKey(hitArtist), b = foldKey(itemArtist);
  if (!a || !b) return false;
  if (a === b) return true;
  const cb = creditKeys(itemArtist);
  return creditKeys(hitArtist).some(x => cb.includes(x));
}
// The best match among iTunes results, or null. When several qualify (the album and its deluxe edition), the
// one whose title equals ours exactly wins; otherwise the most relevant.
// rawKey is foldKey WITHOUT dropping bracketed text, so "Abbey Road (Deluxe)" and "Abbey Road" stay different
// for the tie-break below (foldKey/normMatchKey would make them identical).
function rawKey(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
}
function pickItunesAlbum(results, item) {
  const want = itunesTitleKey(item.title), exact = rawKey(item.title);
  const ok = (results || []).filter(r => r && r.collectionId && itunesTitleKey(r.collectionName) === want && itunesArtistMatches(r.artistName, item.artist));
  return ok.find(r => rawKey(r.collectionName) === exact) || ok[0] || null;
}
// Two queries, the second only when the first finds nothing that matches: "artist title" (relevance-ranked, so a
// short or common title can be buried or crowded out), then the title ALONE restricted to album titles and
// filtered by artist. doFetch lets the tracklist lookup keep its timeout.
async function findItunesAlbum(item, doFetch = fetch) {
  const cleanTitle = item.title.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '');
  const get = async (url) => { const res = await doFetch(url); const data = await res.json(); return data.results || []; };
  const first = pickItunesAlbum(await get(`https://itunes.apple.com/search?term=${encodeURIComponent(item.artist + ' ' + cleanTitle)}&entity=album&limit=15`), item);
  if (first) return first;
  return pickItunesAlbum(await get(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&entity=album&attribute=albumTerm&limit=50`), item);
}
// END itunes-match

// (1.93.4) Tracklists looked up from iTunes / MusicBrainz are kept in this browser (IndexedDB 'crate-tracks') between visits, so the Tracks view
// doesn't fetch every release's tracklist again each time CRATE opens: one is used for 30 days (a release none of them knew, for 3 days), and
// again only while the release's link is the same. What is kept is the source's own tracklist; your song links and names are laid over it as before.
const TL_KEEP_MS = 30 * 864e5, TL_EMPTY_MS = 3 * 864e5;
const TL_FIELDS = ['trackNumber', 'trackName', 'trackTimeMillis', 'discNumber', 'discCount', 'pos', 'previewUrl', 'trackViewUrl', 'artistName', 'collectionName'];
let tlDbP = null, tlMapP = null;
function tlDb() { return tlDbP || (tlDbP = new Promise((res, rej) => { try { const r = indexedDB.open('crate-tracks', 1); r.onupgradeneeded = () => r.result.createObjectStore('lists'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } })); }
function tlAll() {                                                   // every kept tracklist, read once per visit
  return tlMapP || (tlMapP = tlDb().then(db => new Promise((res) => {
    const m = new Map(); try { const tx = db.transaction('lists', 'readonly'), st = tx.objectStore('lists'), c = st.openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { m.set(cur.key, cur.value); cur.continue(); } else res(m); }; c.onerror = () => res(m); } catch (e) { res(m); }
  })).catch(() => new Map()));
}
async function tlGet(item, key) {
  const m = await tlAll(), e = m.get(key); if (!e || !Array.isArray(e.tracks)) return null;
  if ((e.link || '') !== (item.link || '') || Date.now() - e.t > (e.tracks.length ? TL_KEEP_MS : TL_EMPTY_MS)) return null;
  return e.tracks.map(t => Object.assign({}, t));
}
function tlPut(item, key, tracks) {
  const e = { t: Date.now(), link: item.link || '', tracks: (tracks || []).map(t => { const o = {}; TL_FIELDS.forEach(f => { if (t[f] !== undefined && t[f] !== null && t[f] !== '') o[f] = t[f]; }); return o; }) };
  tlAll().then(m => m.set(key, e));
  tlDb().then(db => { try { db.transaction('lists', 'readwrite').objectStore('lists').put(e, key); } catch (er) { /* kept for this visit only */ } }).catch(() => {});
}

async function getTracksFor(item) {
  const key = artKey(item);
  if (state.trackCache[key]) return state.trackCache[key];

  // A manually-typed tracklist always wins over the iTunes/MusicBrainz
  // auto-lookup below — same precedence loadTracklist() already gives it
  // for the deck. Without this, an album added via the tracklist builder
  // (typically because the auto-lookup can't find it at all) shows "No
  // tracklist found" everywhere except the deck.
  if (isManualAlbum(item)) {
    const tracks = item.manualTracks.map(t => ({
      trackNumber: t.trackNumber,
      trackName: t.title,
      trackTimeMillis: t.durationMs || null, section: t.section || '', s: t.s || '', pos: t.pos || '',
      youtubeLink: t.youtubeLink || ''
    }));
    // mergeTrackLinkOverrides reads item.trackData, which can be malformed
    // on older/hand-edited entries — this function must never reject (every
    // caller either chains straight into a rendering step or, worse, an
    // unguarded Promise.all/await — see playPlaylistFromStart), so a failure
    // here falls back to the un-merged tracks rather than blowing up the
    // whole tracklist load.
    try { mergeTrackLinkOverrides(item, tracks); } catch (e) { console.warn('mergeTrackLinkOverrides failed', item, e); }
    state.trackCache[key] = tracks;
    return tracks;
  }

  const kept = await tlGet(item, key);                               // looked up on an earlier visit
  if (kept) {
    if (state.trackCache[key]) return state.trackCache[key];
    try { mergeTrackLinkOverrides(item, kept); } catch (e) { console.warn('mergeTrackLinkOverrides failed', item, e); }
    state.trackCache[key] = kept;
    if (typeof catStatsSoon === 'function') catStatsSoon();
    return kept;
  }

  let tracks = [];
  let tlLooked = true;                                               // false when a source couldn't be asked (then an empty answer isn't kept)
  let collectionId = state.artCache[key]?.collectionId;

  // ATTEMPT 1: iTunes Search (Fast, handles 95% of cases)
  try {
    if (!collectionId) {
      // Only an iTunes album that really IS this release (title and artist) — see findItunesAlbum. When
      // there isn't one, collectionId stays empty and the MusicBrainz fallback below gets its turn.
      const hit = await findItunesAlbum(item, (u) => fetchWithTimeout(u));
      collectionId = hit && hit.collectionId;
    }

    if (collectionId) {
      const lookupRes = await fetchWithTimeout(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200`);
      const lookupData = await lookupRes.json();
      // iTunes' own trackNumber is only unique WITHIN a disc — for multi-disc
      // releases, disc 2 track 1 collides with disc 1 track 1. Sort by disc
      // then in-disc position, then renumber sequentially so every track in
      // the album gets a unique, ordered number.
      tracks = (lookupData.results || [])
        .filter(r => r.wrapperType === 'track')
        .sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0))
        .map((r, i) => Object.assign({}, r, { trackNumber: i + 1 }));
    }
  } catch (e) {
    console.warn("iTunes tracklist lookup failed", e); tlLooked = false;
  }

  // ATTEMPT 2: MusicBrainz Fallback (If iTunes doesn't have it, but we have a MB link)
  if (tracks.length === 0 && item.link && item.link.includes('musicbrainz.org/release/')) {
    try {
      const mbidMatch = item.link.match(/release\/([a-f0-9-]+)/);
      if (mbidMatch && mbidMatch[1]) {
        const mbid = mbidMatch[1];
        const mbRes = await mbFetch(`https://musicbrainz.org/ws/2/release/${mbid}?inc=recordings&fmt=json`, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }
        });
        
        if (mbRes.ok) {
          const mbData = await mbRes.json();
          let trackCounter = 1;

          // MusicBrainz's t.number is per-disc (side "A1"/"B1" for vinyl, or
          // 1,2,3... restarting on each medium for multi-disc releases), so
          // using it directly produced duplicate numbers across the album.
          // trackCounter instead runs continuously across every medium,
          // guaranteeing each track gets a unique, ordered number.
          if (mbData.media) {
            mbData.media.forEach((media, mi) => {
              if (media.tracks) {
                media.tracks.forEach(t => {
                  tracks.push({
                    trackNumber: trackCounter,
                    trackName: t.title || t.recording?.title || 'Unknown Track',
                    trackTimeMillis: t.length || t.recording?.length || 0,
                    // The continuous trackCounter above deliberately hides which disc a track
                    // is on, so keep that separately (iTunes results already carry the same
                    // two fields): the Album Quick Peek uses them to mark where each disc starts.
                    discNumber: media.position || mi + 1,
                    discCount: mbData.media.length,
                    pos: /[A-Za-z]/.test(t.number || '') ? String(t.number) : mbData.media.length > 1 && t.number ? `${media.position || mi + 1}-${t.number}` : ''
                  });
                  trackCounter++;
                });
              }
            });
          }
        }
      }
    } catch (e) {
      console.warn("MusicBrainz tracklist fallback failed", e); tlLooked = false;
    }
  }

  // Same guarantee as the manual-album branch above: never let a bad
  // trackData entry turn a resolved tracklist fetch into a rejected
  // promise this far down the call chain.
  if (tracks.length || tlLooked) tlPut(item, key, tracks);                        // kept for next time (before your links are laid over it)
  try { mergeTrackLinkOverrides(item, tracks); } catch (e) { console.warn('mergeTrackLinkOverrides failed', item, e); }
  state.trackCache[key] = tracks;
  if (typeof catStatsSoon === 'function') catStatsSoon();          // its songs and length now count in the stats bar
  return tracks;
}

// Only the cards near the screen are built. A full card is about 50 elements, so 4,000 releases made a page of over 220,000,
// and every change to it (selecting a cover, opening or closing the popup, a hover) made the browser go over all of them: the
// page froze. Now the first GRID_EAGER cards of a render are built at once and the rest start as an empty placeholder of the
// same size (.card-shell: the same class and data-album-row, so selection, Ctrl+A, keeping your place and the popup's ‹ ›
// all still find them), filled in as it comes within about two screens of view, and never emptied again.
function gridScrollParent(n) { for (let a = n && n.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowY; if (o === 'auto' || o === 'scroll') return a; } return null; }
function gridShellFor(item) {
  const sh = document.createElement('div');
  sh.className = 'card card-shell' + (state.selectedAlbums.has(String(item.row)) ? ' selected' : '');
  sh.dataset.albumRow = item.row; sh._item = item; return sh;
}
function gridFillShell(shell) {
  const it = shell._item; if (!it || !shell.isConnected) return;
  shell._item = null;
  const full = buildCard(it); full._item = it; shell.replaceWith(full);
  const img = full.querySelector('img.art[data-key]'), url = img && state.artCache[img.dataset.key] && state.artCache[img.dataset.key].art;
  if (url && img.src !== url) img.src = url;
  if (gridUnloadObs) gridUnloadObs.observe(full);
}
function gridEmptyCard(card) {                                      // a card far out of view goes back to a placeholder, so the page stays small however far you scroll
  if (!card.isConnected || !card._item || card === quickPeekCardEl || card.contains(document.activeElement)) return;
  if (card.nextElementSibling && card.nextElementSibling.id === 'albumQuickPeek') return;
  const sh = gridShellFor(card._item); card.replaceWith(sh); if (gridLazyObs) gridLazyObs.observe(sh);
}
// The placeholders on screen (and a screen either side), filled at once: after a redraw that keeps your place far down the grid,
// and as a safety net shortly after any drawing, in case the observer is late (a busy or background tab).
function gridFillVisible(scope) {
  const box = scope || el.gridContainer, root = gridScrollParent(box.querySelector('.grid') || box); if (!root) return;
  const r = root.getBoundingClientRect(), lo = r.top - r.height, hi = r.bottom + r.height;
  const due = [...box.querySelectorAll('.card-shell')].filter(sh => { const b = sh.getBoundingClientRect(); return b.bottom > lo && b.top < hi; });          // all rects first, then fill: one layout, not one per card
  due.forEach(sh => { if (gridLazyObs) gridLazyObs.unobserve(sh); gridFillShell(sh); });
}
function gridLazyWatch(wrap, tries) {                               // once the section is on the page: watch its placeholders from its own scrolling box
  if (!wrap.isConnected) { if ((tries || 0) < 20) setTimeout(() => gridLazyWatch(wrap, (tries || 0) + 1), 50); else wrap.querySelectorAll('.card-shell').forEach(gridFillShell); return; }
  const root = gridScrollParent(wrap);
  if (!gridLazyObs || gridLazyRoot !== root) {
    if (gridLazyObs) gridLazyObs.disconnect();
    gridLazyRoot = root;
    gridLazyObs = new IntersectionObserver((entries) => entries.forEach(en => { if (en.isIntersecting) { gridLazyObs.unobserve(en.target); gridFillShell(en.target); } }), { root, rootMargin: GRID_LAZY_AHEAD });
    if (gridUnloadObs) gridUnloadObs.disconnect();
    gridUnloadObs = new IntersectionObserver((entries) => entries.forEach(en => { if (!en.isIntersecting && en.target._item) { gridUnloadObs.unobserve(en.target); gridEmptyCard(en.target); } }), { root, rootMargin: GRID_UNLOAD_BEYOND });
  }
  wrap.querySelectorAll('.card-shell').forEach(sh => gridLazyObs.observe(sh));
  wrap.querySelectorAll('.card:not(.card-shell)').forEach(c => { if (c._item) gridUnloadObs.observe(c); });
  setTimeout(() => { if (wrap.isConnected) gridFillVisible(wrap.parentElement); }, 150);
}
function gridEagerReset() { gridEagerLeft = GRID_EAGER; if (!gridEagerTick) { gridEagerTick = true; queueMicrotask(() => { gridEagerTick = false; }); } }
function buildGridSection(items) {
  const wrap = document.createElement('div');
  wrap.className = 'grid' + (state.viewMode === 'list' ? ' list-view' : '');
  if (!gridEagerTick) { gridEagerTick = true; gridEagerLeft = GRID_EAGER; queueMicrotask(() => { gridEagerTick = false; }); }          // one budget for everything drawn in one go (all the groups of one render)
  let shells = 0;
  items.forEach(item => {
    if (gridEagerLeft > 0 || typeof IntersectionObserver === 'undefined') { gridEagerLeft--; const c = buildCard(item); c._item = item; wrap.appendChild(c); return; }
    wrap.appendChild(gridShellFor(item)); shells++;
  });
  if (shells) queueMicrotask(() => gridLazyWatch(wrap));
  return wrap;
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'card' + (state.selectedAlbums.has(String(item.row)) ? ' selected' : '');
  card.tabIndex = 0;
  card.dataset.albumRow = item.row;
  
  // --- 1. THE TEXT ROWS (underneath the artwork) ---
  // Covers view has its own independent set of fields (coversBelow) so it doesn't
  // just inherit whatever the Albums Grid happens to be configured to show.
  let infoHtml = '';
  const isCoversMode = state.mainViewMode === 'covers';
  const gridSlots = (isCoversMode ? state.fields.coversBelow : state.fields.grid) || [];
  const activeGridSlots = gridSlots.filter(val => val && val !== 'none');
  const useOverlayFields = state.fitArtwork && state.fieldPlacement === 'overlay' && state.viewMode !== 'list';

  if (activeGridSlots.length > 0) {
    infoHtml = `<div class="card-info${useOverlayFields ? ' overlay-mode' : ''}">`;
    activeGridSlots.forEach(key => {
      let val = '', cls = 'card-artist', isRatingHtml = false;
      if (key === 'title') { val = item.title; cls = 'card-title' + rymBoldClass(item); }
      else if (key === 'rating') { val = starRatingHtml(item.rating) + rymChipHtml(item); cls = 'card-rating'; isRatingHtml = true; }
      else if (key === 'duration') {
        const cache = state.trackCache[artKey(item)];
        val = (cache && cache.length > 0) ? formatDuration(cache.reduce((s,t) => s + (t.trackTimeMillis || 0), 0)) : '---';
      } else {
        val = keyToVal(key, item);
      }
      if (val) infoHtml += `<p class="${cls}">${isRatingHtml ? val : escapeHtml(val)}</p>`;
    });
    infoHtml += '</div>';
  }

  // --- 2. THE ARTWORK TAGS (Covers View) ---
  // Renders one of the three configurable overlay-tag slots. 'rating' gets
  // real half-fill star markup (see starRatingHtml); everything else is a
  // plain escaped string.
  function overlayTagContent(key) {
    if (key === 'rating') return { html: starRatingHtml(item.rating) + rymChipHtml(item), empty: !item.rating && !(state.rymShowNext && item.rymRating) };
    const val = keyToVal(key, item);
    return { html: val ? escapeHtml(val) : '', empty: !val };
  }
  const cSlots = state.fields.covers || [];
  const tagTopLeft = overlayTagContent(cSlots[0]);
  const tagBottomRight = overlayTagContent(cSlots[1]);
  const tagBottomLeft = overlayTagContent(cSlots[2]);

  const overlayHtml = `
    ${!tagTopLeft.empty ? `<span class="catalog-tag">${tagTopLeft.html}</span>` : ''}
    ${!tagBottomRight.empty ? `<span class="type-tag">${tagBottomRight.html}</span>` : ''}
    ${!tagBottomLeft.empty ? `<div class="card-rating-overlay" style="position:absolute; bottom:6px; left:6px; background:rgba(18,22,28,0.85); padding:3px 6px; font-size:10px; color:var(--accent); border-radius:2px; font-family:'IBM Plex Mono'; max-width:90%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${tagBottomLeft.html}</div>` : ''}
  `;

  // A manually-entered RYM Link is already the exact page — no need to wait
  // for the hover-triggered getExternalLinksFor() lookup below just to show
  // that (that lookup still runs, for Spotify/SoundCloud and for albums
  // with no manual RYM Link at all, but it has nothing left to add here).
  const rymLinkSet = !!(item.rymLink && item.rymLink.trim());
  const rymHref = rymLinkSet ? item.rymLink.trim() : rymSearchUrl(item);

  // Subtle "how much of this release is that genre" cue — only shown while
  // a genre nav-filter is active (see genreFilterWeight). A thin accent
  // strip rather than a badge/percentage, deliberately low-key: full
  // strength for a primary-genre match, fading out for a secondary/
  // tertiary one, so it reads as a glance-able signal rather than another
  // number to parse. The weight drives the accent-color overlay's opacity
  // via --genre-weight (see .genre-match-bar's CSS) rather than the whole
  // element's — that element itself is a fixed dark backing so the strip
  // still shows up against art in a similar hue to the accent color, even
  // at low weight. title gives the exact percentage for anyone who hovers.
  const genreWeight = genreFilterWeight(item);
  const genreMatchBarHtml = genreWeight === null ? '' :
    `<div class="genre-match-bar" style="--genre-weight:${genreWeight}" title="${Math.round(genreWeight * 100)}% match to this genre"></div>`;

  card.innerHTML = `
    <div class="sleeve">
      <div class="art-wrap">
        <img class="art" data-key="${artKey(item)}" loading="lazy">
        ${genreMatchBarHtml}
        ${overlayHtml}
        ${linkFlagHtml(item)}
        ${useOverlayFields ? infoHtml : ''}
        <div class="cover-links" onclick="event.stopPropagation()">
          <a class="cover-link-btn cover-link-spotify" href="${spotifySearchUrl(item)}" target="_blank" rel="noopener noreferrer" title="Search on Spotify">S</a>
          <a class="cover-link-btn cover-link-soundcloud" href="${soundcloudSearchUrl(item)}" target="_blank" rel="noopener noreferrer" title="Search on SoundCloud">C</a>
          <a class="cover-link-btn cover-link-rym${rymLinkSet ? ' direct-link' : ''}" href="${escapeHtml(rymHref)}" target="_blank" rel="noopener noreferrer" title="${rymLinkSet ? 'Open on RateYourMusic' : 'Search on RateYourMusic'}">R</a>
          <a class="cover-link-btn cover-link-youtube" href="${youtubeSearchUrl(item)}" target="_blank" rel="noopener noreferrer" title="Search on YouTube">Y</a>
        </div>
      </div>
      ${useOverlayFields ? '' : infoHtml}
    </div>
  `;
    
  // Album covers view specifically (not the regular Albums grid): a plain
  // click opens a quick tracklist peek instead of just selecting, and
  // double-click plays the release directly instead of opening the deck —
  // the peek popover is now the way back to the full deck (click its
  // cover/title), since double-click no longer goes there in this view.
  card.addEventListener('click', (e) => {
    const isCoversView = (state.activePlaylistId ? state.playlistViewMode : state.mainViewMode) === 'covers';
    handleAlbumCardClick(e, item, card); // keeps selection in sync either way
    if (isCoversView && !e.shiftKey && !e.ctrlKey && !e.metaKey) openAlbumQuickPeek(item, card);
  });
  card.addEventListener('dblclick', () => {
    const isCoversView = (state.activePlaylistId ? state.playlistViewMode : state.mainViewMode) === 'covers';
    if (isCoversView) { closeAlbumQuickPeek(); playAlbumReplacingQueue(item); }
    else openDeck(item);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    openDeck(item);
  });
  card.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.cover-links')) return; // let the S/C/R/Y link icons keep their own native right-click menu
    e.preventDefault();
    // Right-clicking a card outside the current selection selects just it
    // first, same standard behavior as the track tables' own context menu.
    const rowStr = String(item.row);
    if (!state.selectedAlbums.has(rowStr)) {
      state.selectedAlbums.clear();
      state.selectedAlbums.add(rowStr);
      state.lastSelectedAlbumRow = rowStr;
      el.gridContainer.querySelectorAll('.card[data-album-row]').forEach(c => c.classList.toggle('selected', c.dataset.albumRow === rowStr)); updateAlbumSelBar();
    }
    openAlbumCardContextMenu(item, e.clientX, e.clientY);
  });
  // Touch has no equivalent of a right-click — attachLongPress() is the
  // touch stand-in, but opens openQuickActions() (the mobile-native bottom
  // sheet, same one the deck's own "Quick Actions" button and the mini
  // player's mobile fallback use) rather than openAlbumCardContextMenu()
  // (the desktop-style floating dropdown the actual right-click opens) —
  // a small menu positioned at a touch point isn't the right shape for
  // touch the way it is for a mouse cursor.
  attachLongPress(card, (x, y, targetEl) => {
    if (targetEl && targetEl.closest && targetEl.closest('.cover-links')) return;
    const rowStr = String(item.row);
    if (!state.selectedAlbums.has(rowStr)) {
      state.selectedAlbums.clear();
      state.selectedAlbums.add(rowStr);
      state.lastSelectedAlbumRow = rowStr;
      el.gridContainer.querySelectorAll('.card[data-album-row]').forEach(c => c.classList.toggle('selected', c.dataset.albumRow === rowStr)); updateAlbumSelBar();
    }
    openQuickActions(item);
  });

  // Cover-art quick links start out pointing at a search page (instant, always
  // works) and get upgraded to the exact page the first time this card is
  // hovered or focused, if MusicBrainz has that relationship on file.
  let coverLinksResolved = false;
  let coverLinksPromise = null;
  function resolveCoverLinksOnce() {
    if (coverLinksResolved) return coverLinksPromise;
    coverLinksResolved = true;
    coverLinksPromise = getExternalLinksFor(item).then(links => {
      applyResolvedLinksToCard(card, links);
      return links;
    });
    return coverLinksPromise;
  }
  card.addEventListener('mouseenter', resolveCoverLinksOnce);
  card.addEventListener('focus', resolveCoverLinksOnce);

  // On touch devices (and fast clicks that beat the hover resolution), the
  // Spotify link may still be pointing at the search page when tapped.
  // Rather than send the user to a search, open the tab right away (so it
  // isn't blocked as a popup) and swap it over to the exact album page the
  // moment resolution finishes.
  const spotifyLinkEl = card.querySelector('.cover-link-spotify');
  if (spotifyLinkEl) {
    spotifyLinkEl.addEventListener('click', (e) => {
      if (spotifyLinkEl.classList.contains('direct-link')) return; // already the exact album — normal navigation
      e.preventDefault();
      e.stopPropagation();
      const win = window.open(spotifyLinkEl.href, '_blank', 'noopener,noreferrer');
      resolveCoverLinksOnce().then(links => {
        if (links.spotify && win && !win.closed) win.location = links.spotify;
      });
    });
  }

  // Belt-and-suspenders against a card ending up with no art request ever
  // made for it at all (the img tag starts with no src attribute — see
  // just above — relying entirely on the one-time prefetchArt(state.raw)
  // batch from fetchCatalog to eventually populate it). If that batch
  // somehow missed this item (still working through a large crate,
  // whatever transient reason), the card would otherwise stay a
  // permanently blank box forever — no broken-image icon, no placeholder,
  // nothing — since no error event ever fires for an <img> with no src to
  // begin with, meaning fetchArt/bindEvents' delegated recovery listener
  // has nothing to catch. Every card render now makes sure ITS OWN key is
  // at least in flight if it isn't already cached — AND, when item.cover
  // is set, that the cache actually matches it, not just that some entry
  // exists. That second check matters: the deck reads item.cover directly
  // every time and so always shows the current value, but the grid card
  // only ever reads state.artCache[key] via applyCachedArtFor — if
  // something got cached for this key BEFORE item.cover was set/changed
  // (an earlier iTunes-fallback resolution, a stale value from before a
  // Cover URL edit), a bare "does an entry exist" check would silently
  // keep that stale art forever, even though the correct URL is sitting
  // right there on the item and shows up fine everywhere that reads it
  // directly.
  const thisArtKey = artKey(item);
  const cachedArt = state.artCache[thisArtKey];
  const artNeedsFetch = item.cover ? (!cachedArt || cachedArt.art !== item.cover) : !cachedArt;
  if (artNeedsFetch && !artFetchInFlight.has(thisArtKey)) {
    artFetchInFlight.add(thisArtKey);
    fetchArt(item);
  }

  return card;
}

function applyResolvedLinksToCard(card, links) {
  if (links.spotify) {
    const a = card.querySelector('.cover-link-spotify');
    if (a) { a.href = links.spotify; a.classList.add('direct-link'); a.title = 'Open on Spotify'; }
  }
  if (links.soundcloud) {
    const a = card.querySelector('.cover-link-soundcloud');
    if (a) { a.href = links.soundcloud; a.classList.add('direct-link'); a.title = 'Open on SoundCloud'; }
  }
  if (links.rym) {
    const a = card.querySelector('.cover-link-rym');
    if (a) { a.href = links.rym; a.classList.add('direct-link'); a.title = 'Open on RateYourMusic'; }
  }
  if (links.youtube) {
    const a = card.querySelector('.cover-link-youtube');
    if (a) { a.href = links.youtube; a.classList.add('direct-link'); a.title = 'Open on YouTube'; }
  }
}

// Converts a real open.spotify.com album/track URL into a Spotify URI
// (spotify:album:ID / spotify:track:ID) for the IFrame API controller.
// Only ever called with links that are already confirmed direct matches
// (never a plain search URL — see getExternalLinksFor).
function spotifyUri(spotifyUrl) {
  const m = spotifyUrl.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(album|track)\/([a-zA-Z0-9]+)/i);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

function applyResolvedLinksToDeck(links) {
  if (links.spotify) {
    el.deckSpotifyLink.href = links.spotify; el.deckSpotifyLink.classList.add('direct-link'); el.deckSpotifyLink.title = 'Open on Spotify';
    const uri = spotifyUri(links.spotify);
    if (uri) {
      el.deckPlayBtn.dataset.uri = uri;
      el.deckPlayBtn.hidden = false;
    }
  }
  if (links.soundcloud) { el.deckSoundcloudLink.href = links.soundcloud; el.deckSoundcloudLink.classList.add('direct-link'); el.deckSoundcloudLink.title = 'Open on SoundCloud'; }
  if (links.rym) { el.deckRymLink.href = links.rym; el.deckRymLink.classList.add('direct-link'); el.deckRymLink.title = 'Open on RateYourMusic'; }
}

// Persistent bottom mini player — independent of the deck, so it keeps
// playing if the album detail view is closed or another album is browsed.
// Built on Spotify's real Web Playback SDK: this tab registers itself as a
// Spotify Connect device, which is what makes real transport controls, a
// volume Spotify itself honors, and the account's real queue possible.
// Requires the listener to have Spotify Premium and to have connected their
// account via the Spotify API panel (Client ID + OAuth/PKCE login).
let spotifyPlayer = null;
let spotifyDeviceId = null;
let spotifyDeviceReady = null;   // Promise, resolves once the SDK device registers
let spotifyDeviceReadyResolve = null;
let spotifyCurrentTrackId = null;

async function initSpotifyPlayerIfReady() {
  if (spotifyPlayer) return; // already set up this session
  const tokens = loadSpotifyUserTokens();
  if (!tokens) return; // not connected — nothing to initialize yet
  // A phone: the SDK doesn't run there. Playback goes to the Spotify app through the Web API instead (js/39-phone-playback.js).
  if (isPhonePlayback()) { spotifyPlayer = makePhoneSpotifyPlayer(); spotifyDeviceReady = null; return; }

  await window.spotifyWebPlaybackReady;

  spotifyDeviceReady = new Promise(resolve => { spotifyDeviceReadyResolve = resolve; });

  spotifyPlayer = new Spotify.Player({
    name: 'CRATE',
    getOAuthToken: async (cb) => { cb((await getSpotifyUserAccessToken()) || ''); },
    volume: (loadSpotifyPlayerPrefs().volume ?? 50) / 100
  });

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    spotifyDeviceId = device_id;
    if (spotifyDeviceReadyResolve) { spotifyDeviceReadyResolve(); spotifyDeviceReadyResolve = null; }
  });
  spotifyPlayer.addListener('not_ready', () => { spotifyDeviceId = null; });
  spotifyPlayer.addListener('initialization_error', ({ message }) => console.warn('Spotify init error', message));
  spotifyPlayer.addListener('authentication_error', ({ message }) => {
    console.warn('Spotify auth error', message);
    flashGlobalToast('Spotify session expired — reconnect in \u2699 \u2192 Spotify API.');
  });
  spotifyPlayer.addListener('account_error', ({ message }) => {
    console.warn('Spotify account error', message);
    flashGlobalToast('In-app playback needs a Spotify Premium account.');
  });
  spotifyPlayer.addListener('player_state_changed', onSpotifyPlayerStateChanged);

  spotifyPlayer.connect();
}

let currentSpotifyTrack = null;
// The SDK only fires player_state_changed on discrete events (play, pause,
// seek, track change) — not continuously. To animate a smooth-looking
// timeline in between those events, we snapshot the state + the moment we
// received it, then extrapolate elapsed time from Date.now() in
// updateProgressUI (ticked on an interval below).
let spotifyLastState = null;
let spotifyLastStateAt = 0;

// Shared by onSpotifyPlayerStateChanged and refreshNowPlayingFromWebApi: a
// Spotify report of "paused" while a YouTube video is the active engine is
// just our own mutual-exclusion pause() (see playYtQueueIndex) echoing back
// — not something the person did on Spotify. Letting it through calls
// setMasterPlayerEngine('spotify') via renderMiniPlayerTrack below, which
// hides the video wrap and shows the Spotify face while the video itself
// keeps playing behind it (audible but out of sight), and leaves
// activePlayerEngine pointing at 'spotify' from then on — so a later
// Prev/Next or a switch back to Spotify acts on the wrong engine (playSpotifyUri's
// `if (activePlayerEngine === 'youtube') closeYoutubePlayer()` guard no
// longer fires, so the video is never actually stopped either). A genuine
// resume or track change from Spotify always arrives with paused:false, so
// this only ever swallows the pause we caused ourselves.
function isStaleSpotifyPauseWhileYoutubePlaying(paused) {
  return (activePlayerEngine === 'youtube' || activePlayerEngine === 'soundcloud') && paused;
}

// Shared by onSpotifyPlayerStateChanged (the real-time SDK listener) and
// refreshNowPlayingFromWebApi (the 6s poll that also catches playback on
// other Connect devices, e.g. a TV) — both can be the one to first notice
// "this was playing, now it's paused", and both need to trigger the crate
// queue's auto-advance when that transition looks like the track ending
// naturally. Previously only the SDK listener checked for this; the poll
// just re-rendered the paused state directly. That meant whichever of the
// two happened to notice the transition first won a silent race: if the
// poll's own interval landed on (or narrowly beat) the SDK event, the crate
// queue just stopped instead of advancing, since nothing else ever calls
// playCrateQueueIndex for a same-device natural end. Returns true if it
// handled the advance (caller should skip its own render — the advance's
// own showMiniPlayer call re-renders for the next track), false if the
// caller should render normally (nothing queue-related happened here).
function maybeAdvanceCrateQueueOnEnd(track, paused, position, duration) {
  if (!track) return false;
  if (!(isPlayingCrateQueue() && crateQueueExpectedSpotifyTrackId && track.id === crateQueueExpectedSpotifyTrackId &&
      spotifyLastState && !spotifyLastState.paused && paused && spotifyLastState.duration > 0)) {
    return false;
  }
  // Compare against the EXTRAPOLATED position (last known position + real
  // time elapsed since then — same math as getEstimatedPosition()), not
  // the raw stored spotifyLastState.position. The SDK doesn't re-fire
  // player_state_changed just because time is passing, and the fallback
  // Web API poll (refreshNowPlayingFromWebApi) only refreshes it every
  // ~6s, so the raw stored position can be several seconds stale by the
  // time a track actually ends — comparing it directly against duration
  // made this heuristic miss far more often than it hit, independent of
  // which of the two callers noticed the pause first.
  const estimatedPosition = spotifyLastState.position + (Date.now() - spotifyLastStateAt);
  if (spotifyLastState.duration - estimatedPosition > CRATE_QUEUE_END_THRESHOLD_MS) return false;

  const endedQueueId = crateQueueId, endedIndex = crateQueueIndex;
  renderMiniPlayerTrack(track, paused, position, duration, { announceNowPlaying: true });
  if (endedQueueId === crateQueueId && endedIndex === crateQueueIndex) playCrateQueueIndex(endedQueueId, endedIndex + 1);
  return true;
}

function onSpotifyPlayerStateChanged(state) {
  if (!state) return;
  const track = state.track_window && state.track_window.current_track;
  if (!track) return;
  if (isStaleSpotifyPauseWhileYoutubePlaying(state.paused)) return;

  // Playlist "▶ Play" / "Add to queue" auto-advance — see
  // maybeAdvanceCrateQueueOnEnd and the caveat above CRATE_QUEUE_END_THRESHOLD_MS
  // about this being a heuristic, not a real ended event.
  if (maybeAdvanceCrateQueueOnEnd(track, state.paused, state.position, state.duration)) return;

  renderMiniPlayerTrack(track, state.paused, state.position, state.duration, { announceNowPlaying: true });
}

// Shared by both playback sources that can populate the mini player:
// the Spotify Web Playback SDK (real-time events, once this tab is the
// active device — see onSpotifyPlayerStateChanged above) and a periodic
// Web API poll of whatever's actually playing on the account (see
// refreshNowPlayingFromWebApi below, run at boot and on an interval).
// Both hand this a track shaped like the Web API's track object
// (id/name/artists/album), so it's a safe common shape either way.
// ---- Master player (1.24.0) --------------------------------------------
// One bar/floating window now serves both playback engines — see the HTML
// comment above #miniPlayer. `activePlayerEngine` tracks which one the
// shared transport/seek/volume controls should act on; setMasterPlayerEngine
// swaps the visible face (album art vs. live video) and shows/hides the
// Spotify-only queue/device/fullscreen buttons to match. Called from
// renderMiniPlayerTrack (Spotify) and playYtQueueIndex (YouTube).
let activePlayerEngine = null; // 'spotify' | 'youtube' | 'soundcloud' | null
// The crate item (release row) behind whatever's currently playing, when
// known — set at every playback entry point that has one (playTrackNow,
// playAlbumNow, playCrateQueueIndex, the deck's "▶ Play" button, and the
// per-row "▶ YT" buttons via openYoutubePlayer's new item param). Backs
// the configurable mini-player/queue field slots (state.fields.miniPlayer/
// queue — see "Panel Settings…" on the bottom player and Right Panel in
// Panels configuration) with real release metadata (year, genre, rating,
// etc.), not just whatever the raw Spotify track object itself carries.
// Left stale rather than cleared between tracks — harmless in practice,
// since every path that starts a new track also sets this before the mini
// player actually re-renders.
let nowPlayingItem = null;
// The current track's resolved YouTube link, for the Track Info panel's
// optional video view (⚙ → Panels configuration… → "Show video, if a
// YouTube link is available" — see applyTrackInfoPlayerMode). Set at every
// entry point that already resolves a specific track's links anyway
// (playTrackNow, playCrateQueueIndex, openYoutubePlayer, openSoundcloudPlayer)
// so this comes for free rather than needing its own lookup pass. Cleared
// on masterPlayerStepTrack (Prev/Next) since the new track isn't known yet
// at that point — renderMiniPlayerTrack's own "genuine track change" branch
// then does a best-effort re-resolution for a manual album (the only case
// with no trackNum available to look it up properly), same limitation as
// that function's existing artistsRoughlyMatch check just above it.
let nowPlayingYoutubeLink = '';
// Spotify, the floating YouTube player and the SoundCloud widget must never
// play at the same time, and every engine's play function calls this FIRST
// with its own name. It used to be three hand-written copies of "stop the
// others" that had drifted apart: starting YouTube only paused Spotify and
// never touched SoundCloud, so playing a SoundCloud track and then queuing
// music that starts on a YouTube-linked track left BOTH audible, with the
// SoundCloud one carrying on underneath (and, worse, still holding its own
// queue/"standing in for the crate queue" flag, so its eventual finish could
// skip the crate queue ahead). One function means a fourth engine can't be
// added with one of the cases forgotten.
//
// Deliberately NOT gated on activePlayerEngine alone: that value is just the
// last engine to call setMasterPlayerEngine, so it can be stale or wrong
// (it's exactly what the YouTube path flipped away from 'soundcloud' while
// the SoundCloud widget kept playing). If the widget/player exists it's
// stopped; pausing something already paused is harmless.
function stopOtherEngines(keep) {
  if (keep !== 'spotify' && spotifyPlayer) spotifyPlayer.pause().catch(() => {});
  if (keep !== 'youtube' && (ytPlayer || activePlayerEngine === 'youtube')) closeYoutubePlayer();
  if (keep !== 'soundcloud' && (scWidget || activePlayerEngine === 'soundcloud')) closeSoundcloudPlayer();
}

function setMasterPlayerEngine(engine) {
  activePlayerEngine = engine;
  const isYoutube = engine === 'youtube';
  const isSoundcloud = engine === 'soundcloud';
  // SoundCloud is audio-only — unlike YouTube it never swaps miniPlayerArt
  // out for a video face, it just keeps showing the track's own art (see
  // playScQueueIndex), so miniPlayerArt only hides for YouTube.
  el.miniPlayerArt.hidden = isYoutube;
  el.miniPlayerVideoWrap.hidden = !isYoutube;
  el.miniPlayerFullscreenBtn.hidden = !isYoutube;
  // Spotify's device queue popovers have no YouTube/SoundCloud equivalent —
  // the sidebar's "Up Next" panel (renderCrateQueuePanel) already covers
  // upcoming tracks for all three engines, so these just hide rather than
  // trying to show something in their place.
  el.miniPlayerQueueBtn.hidden = isYoutube || isSoundcloud;
  el.miniPlayerDeviceBtn.hidden = isYoutube || isSoundcloud;
  if (isYoutube || isSoundcloud) { el.queuePanel.hidden = true; el.devicePanel.hidden = true; }
  el.miniPlayerVolume.value = isYoutube ? ytLastKnownVolume : (isSoundcloud ? scLastKnownVolume : (loadSpotifyPlayerPrefs().volume ?? 50));
}

// Shared Prev/Next handler for the master player's transport buttons.
// Routes through the cross-platform crate queue whenever one is actually
// driving playback, so skipping moves correctly between a Spotify track
// and a YouTube-only one in the same queue; otherwise falls back to
// whichever single engine is currently active (see masterPlayer* usage in
// the init() event bindings above).
function masterPlayerStepTrack(direction) {
  if (isPlayingCrateQueue() && (direction > 0 || crateQueueIndex > 0)) {
    playCrateQueueIndex(crateQueueId, crateQueueIndex + direction);
    return;
  }
  if (activePlayerEngine === 'youtube') {
    playYtQueueIndex(ytQueueIndex + direction);
  } else if (activePlayerEngine === 'soundcloud') {
    playScQueueIndex(scQueueIndex + direction);
  } else if (spotifyPlayer) {
    // Going straight through the SDK rather than our own crate queue — the
    // resulting track isn't known yet, so clear the stale link rather than
    // carrying over the wrong one; renderMiniPlayerTrack's genuine-change
    // branch does a best-effort re-resolution once the new track reports in.
    nowPlayingYoutubeLink = '';
    if (direction < 0) spotifyPlayer.previousTrack(); else spotifyPlayer.nextTrack();
  }
}

function renderMiniPlayerTrack(track, paused, positionMs, durationMs, opts) {
  if (!track) return;
  const announceNowPlaying = !!(opts && opts.announceNowPlaying);

  currentSpotifyTrack = track;
  // nowPlayingItem may be stale — carried over from whatever track this app
  // itself last started — if this update actually reflects some other,
  // unrelated Spotify playback the periodic Web API poll picked up (a
  // different device/app). A loose artist-name check is cheap insurance
  // against showing another release's metadata under the wrong track.
  if (nowPlayingItem && !artistsRoughlyMatch(nowPlayingItem.artist, track.artists)) nowPlayingItem = null;
  spotifyLastState = { paused, position: positionMs || 0, duration: durationMs || 0 };
  spotifyLastStateAt = Date.now();

  setMasterPlayerEngine('spotify');
  el.miniPlayer.hidden = false;
  if (!el.miniPlayer.classList.contains('detached')) document.body.classList.add('has-mini-player');

  el.miniPlayerTitle.textContent = track.name;
  refreshMiniPlayerMeta();
  const smallArt = track.album && track.album.images && track.album.images[track.album.images.length - 1];
  el.miniPlayerArt.src = smallArt ? smallArt.url : NO_ART_FALLBACK;
  setMiniPlayerPlayPauseIcon(paused);

  updateProgressUI();

  if (!el.queuePanel.hidden) refreshQueuePanel();

  if (track.id && track.id !== spotifyCurrentTrackId) {
    spotifyCurrentTrackId = track.id;
    // Best-effort re-resolution of the YouTube-link video cue (see
    // nowPlayingYoutubeLink) for a track change we didn't initiate
    // ourselves (SDK-level skip, another Spotify Connect device, etc.) —
    // only works for a manual album, matching by title, same limitation as
    // openSoundcloudPlayer's fallback above and manualYoutubeLinkFor itself.
    nowPlayingYoutubeLink = (nowPlayingItem && isManualAlbum(nowPlayingItem))
      ? manualYoutubeLinkFor(nowPlayingItem, undefined, track.name)
      : '';
    // Only pop the transient "now playing" card for a genuine change of
    // track (SDK events) — not for the boot-time sync, where surfacing
    // something that was already playing before CRATE even opened would
    // read as a false "just started" notification.
    if (announceNowPlaying) showNowPlayingBox(track);
  }
}

// Runs at boot, and then repeatedly on an interval (see init()), to catch
// playback happening on *other* Spotify Connect devices — e.g. a TV — that
// the Web Playback SDK doesn't reliably report via player_state_changed
// (see onSpotifyPlayerStateChanged above). Both hand this a track shaped
// like the Web API's track object (id/name/artists/album), so it's a safe
// common shape either way.
let nowPlayingHasBooted = false; // gates the "now playing" popup — the very
                                  // first sync shouldn't announce whatever
                                  // was already playing before CRATE opened

async function refreshNowPlayingFromWebApi() {
  const token = await getSpotifyUserAccessToken();
  if (!token) return;
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.status === 204 || !res.ok) return; // nothing playing right now
    const data = await res.json();
    if (!data || !data.item) return; // e.g. a podcast episode, or an empty payload

    if (isStaleSpotifyPauseWhileYoutubePlaying(!data.is_playing)) return;

    const trackChanged = data.item.id !== spotifyCurrentTrackId;
    const pauseChanged = !!spotifyLastState && spotifyLastState.paused !== !data.is_playing;
    if (!spotifyLastState || trackChanged || pauseChanged) {
      // Something actually changed since our last known state (or we don't
      // have one yet). Before just repainting it, give the crate queue a
      // chance to treat this as its current track ending naturally — see
      // maybeAdvanceCrateQueueOnEnd for why this poll needs the same check
      // the real-time SDK listener does, not just its own render.
      if (maybeAdvanceCrateQueueOnEnd(data.item, !data.is_playing, data.progress_ms, data.item.duration_ms)) return;
      renderMiniPlayerTrack(data.item, !data.is_playing, data.progress_ms, data.item.duration_ms, {
        announceNowPlaying: nowPlayingHasBooted && trackChanged
      });
    } else {
      // Same track, same play/pause state — just nudge our extrapolated
      // position back in sync with the server without a full re-render.
      spotifyLastState.position = data.progress_ms;
      spotifyLastStateAt = Date.now();
    }
  } catch (e) {
    console.warn('Spotify currently-playing fetch failed', e);
  } finally {
    nowPlayingHasBooted = true;
  }
}

// ---- Timeline / scrubber ----------------------------------------------
function formatMs(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// Inverse of formatMs — used by "Edit track properties…" to parse a typed
// track length back into milliseconds for trackData.lengthMs. Accepts
// "m:ss", "h:mm:ss", or a bare number of seconds; returns 0 (meaning "no
// override") for anything empty or unparseable, rather than throwing —
// this is user-typed free text, not a trusted format.
function parseLengthToMs(str) {
  const trimmed = String(str || '').trim();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000; // bare seconds
  const parts = trimmed.split(':').map(p => Number(p.trim()));
  if (!parts.length || parts.some(p => !isFinite(p) || p < 0)) return 0;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return Math.round(sec * 1000);
}

// getEstimatedPosition/getCurrentDurationMs read from whichever engine is
// active (see activePlayerEngine) so the one shared progress bar/seek drag
// below works for both — Spotify's SDK only fires discrete state-changed
// events (extrapolated via spotifyLastState/spotifyLastStateAt), while the
// YouTube IFrame API's getCurrentTime()/getDuration() are pollable directly
// (in seconds — scaled to ms here to share formatMs with the Spotify side).
function getEstimatedPosition() {
  if (activePlayerEngine === 'youtube') {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return 0;
    try { return Math.max(0, (ytPlayer.getCurrentTime() || 0) - (ytSeg.start || 0)) * 1000; } catch (e) { return 0; }          // (within the part, for a track in a full-release video)
  }
  if (activePlayerEngine === 'soundcloud') {
    // SoundCloud's Widget API only reports position async (getPosition's
    // callback) — scPosition is instead kept current by the widget's own
    // PLAY_PROGRESS event (see bindScWidgetEvents), same "cache the last
    // known value, read it back synchronously" shape as spotifyLastState.
    return scPosition || 0;
  }
  if (!spotifyLastState) return 0;
  if (spotifyLastState.paused) return spotifyLastState.position;
  return spotifyLastState.position + (Date.now() - spotifyLastStateAt);
}

function ytSegDurationMs() { const total = ytDuration || 0; if (!ytSeg.start && !ytSeg.end) return total * 1000; return Math.max(0, (ytSeg.end || total) - (ytSeg.start || 0)) * 1000; }          // a part of a video is as long as the part
function ytSeekInSegment(sec) { ytPlayer.seekTo((ytSeg.start || 0) + sec, true); }
function getCurrentDurationMs() {
  if (activePlayerEngine === 'youtube') {
    if (ytPlayer && ytPlayer.getDuration) { try { ytDuration = ytPlayer.getDuration() || ytDuration; } catch (e) {} }
    return ytSegDurationMs();
  }
  if (activePlayerEngine === 'soundcloud') {
    // scDuration is already in ms (SoundCloud's Widget API reports
    // getDuration() in ms, unlike YouTube's seconds) — refreshed whenever a
    // track starts (see playScQueueIndex/bindScWidgetEvents' PLAY handler).
    return scDuration || 0;
  }
  return (spotifyLastState && spotifyLastState.duration) || 0;
}

let progressDragging = false; // true while the user is actively dragging the scrubber handle
function updateProgressUI() {
  if (progressDragging || el.miniPlayer.hidden) return;
  if (activePlayerEngine === 'youtube') { if (!ytPlayer || !ytPlayer.getCurrentTime) return; }
  else if (activePlayerEngine === 'soundcloud') { if (!scWidget) return; }
  else if (!spotifyLastState) return;
  if (activePlayerEngine === 'youtube' && ytSeg.end && !ytSeg.fired && Date.now() - ytSeg.loadedAt > 1500) {          // the player is meant to stop at the end of the part by itself; if it hasn't, move on
    try { if ((ytPlayer.getCurrentTime() || 0) >= ytSeg.end + 0.3) { onYtPlayerStateChange({ data: YT.PlayerState.ENDED }); return; } } catch (e) { /* not ready */ }
  }
  const duration = getCurrentDurationMs();
  const pos = duration ? Math.min(getEstimatedPosition(), duration) : getEstimatedPosition();
  const pct = duration ? (pos / duration) * 100 : 0;
  el.miniPlayerSeekFill.style.width = pct + '%';
  el.miniPlayerSeekHandle.style.left = pct + '%';
  el.miniPlayerMobileProgressFill.style.width = pct + '%';
  el.miniPlayerSeekTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
  el.miniPlayerTimeCurrent.textContent = formatMs(pos);
  el.miniPlayerTimeTotal.textContent = formatMs(duration);
  // Track Info panel's own seek bar (right panel, if that section + player
  // mode are both on) mirrors the exact same position/duration — reuses
  // this one already-running 500ms interval rather than a second one.
  if (state.rightPanelShowTrackInfo && state.trackInfoShowPlayer && !trackInfoSeekDragging) {
    el.trackInfoSeekFill.style.width = pct + '%';
    el.trackInfoSeekHandle.style.left = pct + '%';
    el.trackInfoTimeCurrent.textContent = formatMs(pos);
    el.trackInfoTimeTotal.textContent = formatMs(duration);
  }
}
setInterval(updateProgressUI, 500);

function seekRatioFromEvent(e) {
  const rect = el.miniPlayerSeekTrack.getBoundingClientRect();
  const point = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  const ratio = (point.clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(1, ratio));
}

// Single seek-drag implementation shared by both engines — commits via
// spotifyPlayer.seek() or ytPlayer.seekTo() depending on activePlayerEngine
// at the moment the drag ends (or an arrow key is pressed).
function initSeekDrag() {
  let previewRatio = 0;
  function updatePreview(e) {
    previewRatio = seekRatioFromEvent(e);
    const duration = getCurrentDurationMs();
    el.miniPlayerSeekFill.style.width = (previewRatio * 100) + '%';
    el.miniPlayerSeekHandle.style.left = (previewRatio * 100) + '%';
    el.miniPlayerTimeCurrent.textContent = formatMs(previewRatio * duration);
  }
  function onMove(e) {
    if (!progressDragging) return;
    updatePreview(e);
    if (e.cancelable) e.preventDefault();
  }
  async function onUp() {
    if (!progressDragging) return;
    progressDragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    if (activePlayerEngine === 'youtube') {
      if (ytPlayer && ytPlayer.seekTo) {
        try { ytSeekInSegment(previewRatio * (getCurrentDurationMs() / 1000)); } catch (e) { /* not ready */ }
      }
    } else if (activePlayerEngine === 'soundcloud') {
      if (scWidget && scWidget.seekTo) {
        const seekMs = Math.round(previewRatio * getCurrentDurationMs());
        try { scWidget.seekTo(seekMs); scPosition = seekMs; } catch (e) { /* not ready */ }
      }
    } else if (spotifyPlayer && spotifyLastState) {
      const seekMs = Math.round(previewRatio * (spotifyLastState.duration || 0));
      try {
        await spotifyPlayer.seek(seekMs);
        spotifyLastState = { ...spotifyLastState, position: seekMs };
        spotifyLastStateAt = Date.now();
      } catch (e) { console.warn('Spotify seek failed', e); }
    }
  }
  function onDown(e) {
    if (activePlayerEngine === 'youtube' ? !ytPlayer : activePlayerEngine === 'soundcloud' ? !scWidget : !spotifyLastState) return;
    progressDragging = true;
    updatePreview(e);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    e.preventDefault();
  }
  el.miniPlayerSeekTrack.addEventListener('mousedown', onDown);
  el.miniPlayerSeekTrack.addEventListener('touchstart', onDown, { passive: false });
  el.miniPlayerSeekTrack.addEventListener('keydown', async (e) => {
    let delta = 0;
    if (e.key === 'ArrowRight') delta = 5000;
    else if (e.key === 'ArrowLeft') delta = -5000;
    else return;
    e.preventDefault();
    const duration = getCurrentDurationMs();
    if (activePlayerEngine === 'youtube') {
      if (!ytPlayer || !ytPlayer.seekTo) return;
      const posMs = Math.max(0, Math.min(duration, getEstimatedPosition() + delta));
      try { ytSeekInSegment(posMs / 1000); updateProgressUI(); } catch (err) { /* not ready */ }
    } else if (activePlayerEngine === 'soundcloud') {
      if (!scWidget || !scWidget.seekTo) return;
      const posMs = Math.max(0, Math.min(duration, getEstimatedPosition() + delta));
      try { scWidget.seekTo(posMs); scPosition = posMs; updateProgressUI(); } catch (err) { /* not ready */ }
    } else {
      if (!spotifyPlayer || !spotifyLastState) return;
      const seekMs = Math.max(0, Math.min(duration, getEstimatedPosition() + delta));
      try {
        await spotifyPlayer.seek(seekMs);
        spotifyLastState = { ...spotifyLastState, position: seekMs };
        spotifyLastStateAt = Date.now();
        updateProgressUI();
      } catch (err) { console.warn('Spotify seek failed', err); }
    }
  });
}

// Track Info panel's own seek bar (right panel, player mode) — a
// self-contained click/drag-to-seek, separate from initSeekDrag's mini-
// player-specific implementation (hardcoded throughout to
// el.miniPlayerSeekTrack) rather than refactoring that shared, working
// code to be generic. Same three engine-specific seek commands, just
// triggered from this second element. trackInfoSeekDragging (module-level,
// declared alongside it below) is checked by updateProgressUI so the
// shared 500ms interval doesn't fight an in-progress drag here, same
// relationship progressDragging has with the mini player's own bar.
let trackInfoSeekDragging = false;
function trackInfoSeekRatioFromEvent(e) {
  const rect = el.trackInfoSeekTrack.getBoundingClientRect();
  const point = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  const ratio = (point.clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(1, ratio));
}
function initTrackInfoSeek() {
  function paint(ratio) {
    el.trackInfoSeekFill.style.width = (ratio * 100) + '%';
    el.trackInfoSeekHandle.style.left = (ratio * 100) + '%';
    el.trackInfoTimeCurrent.textContent = formatMs(ratio * getCurrentDurationMs());
  }
  async function commitSeek(ratio) {
    const seekMs = Math.round(ratio * getCurrentDurationMs());
    if (activePlayerEngine === 'youtube') {
      if (ytPlayer && ytPlayer.seekTo) { try { ytSeekInSegment(seekMs / 1000); } catch (e) { /* not ready */ } }
    } else if (activePlayerEngine === 'soundcloud') {
      if (scWidget && scWidget.seekTo) { try { scWidget.seekTo(seekMs); scPosition = seekMs; } catch (e) { /* not ready */ } }
    } else if (spotifyPlayer && spotifyLastState) {
      try {
        await spotifyPlayer.seek(seekMs);
        spotifyLastState = { ...spotifyLastState, position: seekMs };
        spotifyLastStateAt = Date.now();
      } catch (e) { console.warn('Spotify seek failed', e); }
    }
    updateProgressUI();
  }
  function onMove(e) {
    if (!trackInfoSeekDragging) return;
    paint(trackInfoSeekRatioFromEvent(e));
    if (e.cancelable) e.preventDefault();
  }
  async function onUp(e) {
    if (!trackInfoSeekDragging) return;
    trackInfoSeekDragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    await commitSeek(trackInfoSeekRatioFromEvent(e));
  }
  function onDown(e) {
    if (activePlayerEngine === 'youtube' ? !ytPlayer : activePlayerEngine === 'soundcloud' ? !scWidget : !spotifyLastState) return;
    trackInfoSeekDragging = true;
    paint(trackInfoSeekRatioFromEvent(e));
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    e.preventDefault();
  }
  el.trackInfoSeekTrack.addEventListener('mousedown', onDown);
  el.trackInfoSeekTrack.addEventListener('touchstart', onDown, { passive: false });
  el.trackInfoSeekTrack.addEventListener('keydown', async (e) => {
    let delta = 0;
    if (e.key === 'ArrowRight') delta = 5000;
    else if (e.key === 'ArrowLeft') delta = -5000;
    else return;
    e.preventDefault();
    const duration = getCurrentDurationMs();
    if (!duration) return;
    const posMs = Math.max(0, Math.min(duration, getEstimatedPosition() + delta));
    await commitSeek(posMs / duration);
  });
}

// ---- Detachable floating player ----------------------------------------
// The docked mini player is position:fixed already, so "detaching" it is
// just a CSS-class + inline left/top swap rather than re-parenting the DOM.
function defaultDetachedPos() {
  return { x: Math.max(16, window.innerWidth - 336), y: 80 };
}

function setPlayerDetached(detached) {
  el.miniPlayer.classList.toggle('detached', detached);
  el.miniPlayerDragHandle.hidden = !detached;
  if (detached) {
    const saved = loadSpotifyPlayerPrefs().pos, pos = clampDetachedPos(saved || defaultDetachedPos());
    if (saved && (pos.x !== Number(saved.x) || pos.y !== Number(saved.y))) saveSpotifyPlayerPrefs({ pos });      // a position that was off screen (or not a position at all) is replaced by the corrected one
    el.miniPlayer.style.left = pos.x + 'px';
    el.miniPlayer.style.top = pos.y + 'px';
    el.miniPlayer.style.right = 'auto';
    el.miniPlayer.style.bottom = 'auto';
    document.body.classList.remove('has-mini-player');
    if (!el.queuePanel.hidden) el.queuePanel.hidden = true; // anchored for the docked layout only
  } else {
    el.miniPlayer.style.left = '';
    el.miniPlayer.style.top = '';
    el.miniPlayer.style.right = '';
    el.miniPlayer.style.bottom = '';
    if (!el.miniPlayer.hidden) document.body.classList.add('has-mini-player');
  }
  saveSpotifyPlayerPrefs({ detached });
}

// A floating player's position is saved in pixels, so it can come back somewhere that no longer exists (a smaller window, another screen, a saved
// value that was never valid). Keep it wholly on screen: clamped when it is applied, again when it is shown (its size is only known then), and when the
// window changes size. What it is moved to is saved, so it stays fixed.
function clampDetachedPos(pos) {
  const b = el.miniPlayer, w = (b && b.offsetWidth) || 300, h = (b && b.offsetHeight) || 190, m = 8;
  const x = Number(pos && pos.x), y = Number(pos && pos.y);
  return { x: Math.min(Math.max(m, isFinite(x) ? x : m), Math.max(m, window.innerWidth - w - m)), y: Math.min(Math.max(m, isFinite(y) ? y : m), Math.max(m, window.innerHeight - h - m)) };
}
function fitDetachedPlayer() {
  const b = el.miniPlayer; if (!b || b.hidden || !b.classList.contains('detached')) return;
  const r = b.getBoundingClientRect(), p = clampDetachedPos({ x: r.left, y: r.top });
  if (Math.abs(p.x - r.left) > 0.5 || Math.abs(p.y - r.top) > 0.5) { b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; saveSpotifyPlayerPrefs({ pos: p }); }
}
function initPlayerFit() {
  window.addEventListener('resize', fitDetachedPlayer);
  new MutationObserver(fitDetachedPlayer).observe(el.miniPlayer, { attributes: true, attributeFilter: ['hidden', 'class'] });       // shown, or just detached
}
function initPlayerDrag() {
  let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
  function onDown(e) {
    if (!el.miniPlayer.classList.contains('detached')) return;
    if (e.target.closest('#miniPlayerDockBtn')) return; // let the dock button's own click through
    dragging = true;
    const point = (e.touches && e.touches[0]) || e;
    startX = point.clientX; startY = point.clientY;
    const rect = el.miniPlayer.getBoundingClientRect();
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
    const w = el.miniPlayer.offsetWidth, h = el.miniPlayer.offsetHeight;
    let nx = origX + (point.clientX - startX);
    let ny = origY + (point.clientY - startY);
    nx = Math.max(4, Math.min(window.innerWidth - w - 4, nx));
    ny = Math.max(4, Math.min(window.innerHeight - h - 4, ny));
    el.miniPlayer.style.left = nx + 'px';
    el.miniPlayer.style.top = ny + 'px';
    if (e.cancelable) e.preventDefault();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    const rect = el.miniPlayer.getBoundingClientRect();
    saveSpotifyPlayerPrefs({ pos: { x: rect.left, y: rect.top } });
  }
  el.miniPlayerDragHandle.addEventListener('mousedown', onDown);
  el.miniPlayerDragHandle.addEventListener('touchstart', onDown, { passive: false });
}

let nowPlayingTimer = null;
function showNowPlayingBox(track) {
  const bigArt = track.album && track.album.images && track.album.images[0];
  el.nowPlayingArt.src = bigArt ? bigArt.url : NO_ART_FALLBACK;
  el.nowPlayingTitle.textContent = track.name;
  el.nowPlayingArtist.textContent = formatArtistNames(track.artists);
  el.nowPlayingBox.hidden = false;
  requestAnimationFrame(() => el.nowPlayingBox.classList.add('show'));
  clearTimeout(nowPlayingTimer);
  nowPlayingTimer = setTimeout(() => {
    el.nowPlayingBox.classList.remove('show');
    setTimeout(() => { if (!el.nowPlayingBox.classList.contains('show')) el.nowPlayingBox.hidden = true; }, 300);
  }, 4500);
}

// Click-the-currently-playing-song menu — lets you log what's playing into
// your crate without re-searching for it. Spotify's track object already
// tells us whether the release is an album/single/compilation, but not
// whether *you* want to log the full album or just this one track, so we
// offer both plus a manual-search fallback for anything that needs editing
// beyond what Spotify gives us (genre, catalog no., region, etc.).
function spotifyAlbumTypeToOurType(t) {
  const map = { album: 'Album', single: 'Single', compilation: 'Compilation' };
  return map[t] || 'Album';
}

// Shared "float this menu near (x, y), clamped to the viewport" positioning
// used by both the now-playing add menu and the album right-click menu.
// Touch has no native equivalent of a right-click, so this is the touch
// stand-in wherever a contextmenu handler needs one — holds the shape of
// "touch and hold this element, get the same menu a right-click would" for
// any element, not just album cards, so it can be reused elsewhere without
// re-deriving the timing/tolerance logic each time.
// onLongPress(x, y, targetEl) fires once the hold clears LONG_PRESS_MS
// without the finger moving past LONG_PRESS_MOVE_TOLERANCE px (a real
// press, not the start of a scroll) — x/y are the touch point (for
// positioning the menu, same as a contextmenu event's clientX/clientY),
// targetEl is the exact element under the finger (so callers can still
// exclude sub-elements the way a contextmenu handler checks e.target).
// Also suppresses the click/dblclick the same touch would otherwise still
// fire afterward, so a long-press doesn't ALSO open the item it was
// holding down on.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;
function attachLongPress(el, onLongPress) {
  let timer = null;
  let startX = 0, startY = 0;
  let startTarget = null;
  let fired = false;

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
    el.classList.remove('long-press-active');
  }
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { clearTimer(); return; }
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    startTarget = e.target;
    fired = false;
    el.classList.add('long-press-active');
    timer = setTimeout(() => {
      fired = true;
      el.classList.remove('long-press-active');
      if (navigator.vibrate) navigator.vibrate(15); // no-op where unsupported (notably iOS Safari) — harmless either way
      onLongPress(startX, startY, startTarget);
    }, LONG_PRESS_MS);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t) return;
    if (Math.abs(t.clientX - startX) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(t.clientY - startY) > LONG_PRESS_MOVE_TOLERANCE) clearTimer();
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (fired) e.preventDefault(); // block the click/dblclick this same touch would otherwise still fire
    clearTimer();
  });
  el.addEventListener('touchcancel', clearTimer);
}

// Swaps the mini player's play/pause button between the two SVG icons
// (inline, not a font glyph — see 1.29.71) — shared by both engines'
// paused-state handlers (renderMiniPlayerTrack for Spotify,
// setYtPlayPauseUI for YouTube) so the icon markup only lives in one place.
const MINI_PLAYER_PLAY_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 4.5v15l13-7.5-13-7.5z"/></svg>';
const MINI_PLAYER_PAUSE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
function setMiniPlayerPlayPauseIcon(paused) {
  el.miniPlayerPlayPause.innerHTML = paused ? MINI_PLAYER_PLAY_ICON : MINI_PLAYER_PAUSE_ICON;
  el.miniPlayerPlayPause.title = paused ? 'Play' : 'Pause';
}

// Album covers view: a plain click opens this instead of the full deck —
// see the card click/dblclick wiring in the card-building function above
// for why. Positioned next to whichever card was clicked (reusing
// positionFloatingMenu's viewport-clamping). Clicking the cover or title
// inside here is the way back to the full deck, since double-click plays
// instead of opening it in this view now.
// Shared by openAlbumQuickPeek and the gear/layout menu's own open handler
// — closes every dropdown-style menu that can otherwise end up open at
// the same time as the thing about to open, which is exactly what a real
// report showed: the gear menu and this popover visually overlapping on
// mobile, with the menu's own stacking context sitting above the
// popover's close (✕) button and physically intercepting the tap meant
// for it — not a broken click handler, a genuinely blocked one. Neither
// side previously closed the other at all.
function closeOtherDropdownMenus() {
  el.layoutMenu.hidden = true;
  el.sortFilterMenu.hidden = true;
  el.albumsViewMenu.hidden = true;
  el.leftModeMenu.hidden = true;
}

// One row of the Album Quick Peek's tracklist. Beyond ▶ / number / title / length it now carries the
// per-track details the album page's tracklist already shows (and the peek never did): your star
// rating, Last.fm plays, the track's own genre, the "listened" tick, your note, and its credits.
// Only what a track actually HAS is shown, so an un-annotated album looks exactly as it did.
// Read-only: editing stays where it was (right-click > Edit track properties…, or the album page).
// Same element and class names as before so the row's select / double-click / context-menu
// handlers in openAlbumQuickPeek are untouched. In the inline style the peek spans the whole grid, so
// the details sit on the title's line; in the narrow floating style they wrap to a second line
// (see the .album-quick-peek-track-details rules for the ordering).
// Does this release have more than one disc? (iTunes and, now, MusicBrainz results both carry
// discNumber/discCount; a source that has neither — a hand-typed tracklist — reads as one disc.)
function tracksSpanMultipleDiscs(tracks) {
  return (tracks || []).some(t => (t.discNumber || 1) > 1 || (t.discCount || 1) > 1);
}
// ---- The cover popup's extra parts (1.65.0): facts, actions, tabs (Tracks / About / Listens), moving to the next cover, the cover's colour ----
const QP_TAB_KEY = 'crate_qp_tab';
function qpTabGet() { try { const t = localStorage.getItem(QP_TAB_KEY); return t === 'about' || t === 'listens' ? t : 'tracks'; } catch (e) { return 'tracks'; } }
function qpSetTab(tab) {
  try { localStorage.setItem(QP_TAB_KEY, tab); } catch (e) { /* kept for this visit only */ }
  el.albumQuickPeek.querySelectorAll('.qp-tab').forEach(b => { const on = b.dataset.qpTab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  el.albumQuickPeekTracks.hidden = tab !== 'tracks'; el.albumQuickPeekAbout.hidden = tab !== 'about'; el.albumQuickPeekListens.hidden = tab !== 'listens';
  el.albumQuickPeekSelBar.hidden = tab !== 'tracks' || !quickPeekSelectedTracks.size;
}
function qpPlays(item) {                                            // this release's plays: Last.fm scrobbles and diary entries, with their dates
  const k = lastfmNormKey(item.artist, item.title), out = { n: 0, dates: [], bySong: new Map() };
  (state.scrobbles || []).forEach(s => { if (lastfmNormKey(s.artist, s.title) !== k) return; const c = s.playCount || 1; out.n += c; if (s.day) out.dates.push([String(s.day).slice(0, 10), c]); if (s.track) out.bySong.set(s.track, (out.bySong.get(s.track) || 0) + c); });
  (state.diary || []).forEach(d => { if (lastfmNormKey(d.artist, d.title) !== k) return; out.n++; if (d.date) out.dates.push([String(d.date).slice(0, 10), 1]); });
  out.dates.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return out;
}
function qpRymLine(item) {
  if (!item.rymRating) return '';
  return `<span class="qp-rym" title="Rate Your Music">${item.rymRating.toFixed(2)}</span> <span class="qp-dim">RYM${item.rymVotes ? ` · ${item.rymVotes.toLocaleString()}` : ''}${item.rymRank ? ` · #${item.rymRank.toLocaleString()}` : ''}</span>`;
}
function qpFacts(item) {                                            // the lines under the title: what it is, its genres, the two ratings
  const year = dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : '';
  el.albumQuickPeekSub.innerHTML = `<button type="button" class="quick-peek-artist-link">${escapeHtml(item.artist)}</button>${[year, item.label, item.type && item.type !== 'Unknown' ? item.type : ''].filter(Boolean).map(x => ' · ' + escapeHtml(String(x))).join('')}<span class="qp-len"></span>`;
  const genres = genreLinksHtml(getGenreList(combinedGenreStr(item)).slice(0, 4).join(', '));          // links: click opens the genre's page, right-click its menu
  const mine = Number(item.rating) > 0 ? `<span class="qp-stars" title="Your rating">${starRatingHtml(item.rating)}</span>` : '';
  el.albumQuickPeekFacts.innerHTML = `${genres ? `<p class="qp-line qp-dim">${genres}</p>` : ''}${mine || item.rymRating ? `<p class="qp-line">${mine}${mine && item.rymRating ? ' ' : ''}${qpRymLine(item)}</p>` : ''}`;
}
function qpAboutHtml(item) {
  const row = (label, v) => v ? `<div class="qp-about-row"><span class="qp-dim">${label}</span><span>${v}</span></div>` : '';
  const mine = Number(item.rating) > 0 ? starRatingHtml(item.rating) + ' <span class="qp-dim">yours</span>' : '';
  const review = String(item.review || '').trim();
  return row('Genres', genreLinksHtml(getGenreList(item.genre).join(', '))) + row('Also', genreLinksHtml(getGenreList(item.genre2).join(', '))) + (sceneGenreStr(item) ? row('Scenes', genreLinksHtml(sceneGenreStr(item))) : '') + row('Descriptors', escapeHtml(item.rymDescriptors || ''))
    + row('Released', escapeHtml(item.releaseDate || '')) + row('Label', escapeHtml([item.label, item.catalog && !/^CRT-\d+$/.test(item.catalog) ? item.catalog : ''].filter(Boolean).join(' · ')))
    + row('Ratings', [mine, qpRymLine(item)].filter(Boolean).join(' · ')) + row('Where', escapeHtml([item.location, item.region].filter(Boolean).join(' · ')))
    + (review ? `<div class="qp-about-row qp-review"><span class="qp-dim">Your review</span><span>${escapeHtml(review.length > 420 ? review.slice(0, 420) + '…' : review)}</span></div>` : '')
    || '<p class="tracklist-status">Nothing more is known about this release yet.</p>';
}
function qpListensHtml(item, p) {
  if (!p.n) return '<p class="tracklist-status">No plays yet: none in your diary, and none scrobbled to Last.fm.</p>';
  const years = new Map(); p.dates.forEach(([d, c]) => { const y = d.slice(0, 4); if (/^\d{4}$/.test(y)) years.set(y, (years.get(y) || 0) + c); });
  const ys = [...years.keys()].sort(), max = Math.max(1, ...years.values());
  const bars = ys.length ? `<div class="qp-hist">${ys.map(y => `<span class="qp-hbar" style="height:${Math.max(6, years.get(y) / max * 100)}%" title="${y}: ${years.get(y)} play${years.get(y) === 1 ? '' : 's'}"></span>`).join('')}</div><div class="qp-hist-x qp-dim"><span>${ys[0]}</span><span>${ys[ys.length - 1]}</span></div>` : '';
  const top = [...p.bySong.entries()].sort((a, b) => b[1] - a[1])[0];
  const first = p.dates[0] && p.dates[0][0], last = p.dates.length && p.dates[p.dates.length - 1][0];
  return `${bars}<div class="qp-about-row"><span class="qp-dim">Plays</span><span>${p.n.toLocaleString()}</span></div>${first ? `<div class="qp-about-row"><span class="qp-dim">First</span><span>${escapeHtml(first)}</span></div>` : ''}${last ? `<div class="qp-about-row"><span class="qp-dim">Last</span><span>${escapeHtml(last)}</span></div>` : ''}${top ? `<div class="qp-about-row"><span class="qp-dim">Most played</span><span>${escapeHtml(top[0])} <span class="qp-dim">(${top[1]})</span></span></div>` : ''}`;
}
function qpNeighbour(d) {                                           // the card before or after this one in the grid it was opened from
  if (!quickPeekCardEl || !quickPeekCardEl.isConnected) return null;
  const gridEl = state.activePlaylistId ? document.getElementById('playlistBody') : el.gridContainer;
  const cards = [...(gridEl || el.gridContainer).querySelectorAll('.card[data-album-row]')], i = cards.indexOf(quickPeekCardEl);
  const c = i < 0 ? null : cards[i + d]; if (!c) return null;
  const item = state.raw.find(r => String(r.row) === c.dataset.albumRow); return item ? { item, card: c } : null;
}
function qpNav(d) { const n = qpNeighbour(d); if (!n) return; openAlbumQuickPeek(n.item, n.card); }
// The cover's colour, for the popup's header (sampled from a small copy of the cover; a cover whose server doesn't allow
// that keeps the plain background). Remembered per cover.
const qpTintCache = new Map();
function qpTint(url) {
  const peek = el.albumQuickPeek, set = (c) => { if (c) peek.style.setProperty('--qp-tint', c); else peek.style.removeProperty('--qp-tint'); };
  if (!url || /^data:/.test(url)) { set(null); return; }
  if (qpTintCache.has(url)) { set(qpTintCache.get(url)); return; }
  set(null);
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4, k = 0.55;
      const col = `rgb(${Math.round(r / n * k)}, ${Math.round(g / n * k)}, ${Math.round(b / n * k)})`; qpTintCache.set(url, col); if (el.albumQuickPeekArt.src === url || quickPeekItem) set(col); } catch (e) { qpTintCache.set(url, null); } };
  img.onerror = () => qpTintCache.set(url, null);
  img.src = url;
}
function qpSelectionItems() {
  if (!quickPeekItem) return [];
  return [...el.albumQuickPeekTracks.querySelectorAll('.album-quick-peek-track.selected')].map(r => ({ itemType: 'track', row: quickPeekItem.row, albumId: quickPeekItem.albumId || '', trackNum: r.dataset.trackNum, trackName: r.dataset.trackName }));
}
function qpSelBarPaint() { const n = quickPeekSelectedTracks.size; el.albumQuickPeekSelBar.hidden = !n || el.albumQuickPeekTracks.hidden; if (n) el.albumQuickPeekSelCount.textContent = `${n} selected`; }
function qpAction(a, btn) {
  const item = quickPeekItem; if (!item) return;
  if (a === 'play') playAlbumReplacingQueue(item);
  else if (a === 'shuffle') { if (!state.shuffle) setShuffle(true); playAlbumReplacingQueue(item); }
  else if (a === 'queue') queueAlbumTracks(item);
  else if (a === 'match') { closeAlbumQuickPeek(); openSongMatcher(item); }
  else if (a === 'more') { const r = btn.getBoundingClientRect(); openAlbumCardContextMenu(item, r.left, r.bottom + 4); }
  else if (a === 'prev') qpNav(-1); else if (a === 'next') qpNav(1);
  else if (a === 'sel-play') { const sel = qpSelectionItems(); if (!sel.length) return; playTrackNow(item, sel[0].trackName, sel[0].trackNum); if (sel.length > 1) setTimeout(() => queueTracksNow(sel.slice(1)), 400); }
  else if (a === 'sel-queue') { const sel = qpSelectionItems(); if (sel.length) queueTracksNow(sel); }
}
function quickPeekTrackRowHtml(item, t, ord) {
  const tNum = t.trackNumber || 0;
  const d = (item.trackData && item.trackData[tNum]) || {};
  const rating = Number(d.rating) || 0, note = String(d.note || '').trim(), genre = String(d.genre || '').trim();
  const credits = parseTrackCredits(d.credits), listened = !!d.listened;
  const plays = trackScrobbleCountFor(item.artist, item.title, t.trackName);
  const bits = [];
  if (rating > 0) bits.push(`<span class="qp-detail qp-rating" title="Your rating">\u2605 ${Number.isInteger(rating) ? rating : rating.toFixed(1)}</span>`);
  if (plays > 0) bits.push(`<span class="qp-detail" title="Last.fm plays">${plays} play${plays === 1 ? '' : 's'}</span>`);
  if (genre) bits.push(`<span class="qp-detail" title="Track genre">${escapeHtml(genre)}</span>`);
  if (listened) bits.push('<span class="qp-detail qp-listened" title="Marked for the next diary entry">\u2713 listened</span>');
  if (credits.length) bits.push(`<button type="button" class="qp-detail qp-credits-btn" aria-expanded="false" title="Show this track\u2019s credits">${credits.length} credit${credits.length === 1 ? '' : 's'} \u25be</button>`);
  if (note) bits.push(`<span class="qp-detail qp-note" title="${escapeHtml(note)}">${escapeHtml(note)}</span>`);
  const ov = trackLinkOverridesFor(item, tNum, t.trackName), rr = Number(ov.rymRating) || 0;
  const rymBar = rr ? `<span class="qp-rymbar" title="RYM ${rr.toFixed(2)}${ov.rymVotes ? ` from ${Number(ov.rymVotes).toLocaleString()} ratings` : ''}"><i style="width:${Math.max(4, Math.min(100, (rr - 2) / 3 * 100)).toFixed(0)}%"></i></span>` : '<span class="qp-rymbar qp-slot-empty" aria-hidden="true"></span>';          // the slot stays when a song has no rating, so every row's bar, marks and length line up
  const sp = !!trackSpotifyUriFromLink(ov.spotifyLink || t.spotifyLink), yt = !!youtubeVideoIdFromUrl(ov.youtubeLink || t.youtubeLink);
  const linkMarks = sp || yt ? `<span class="qp-links" title="${[sp ? 'Spotify link saved' : '', yt ? 'YouTube link saved' : ''].filter(Boolean).join(', ')}">${sp ? 'S' : ''}${sp && yt ? ' ' : ''}${yt ? 'Y' : ''}</span>` : '<span class="qp-links" aria-hidden="true"></span>';
  const isNow = nowPlayingItem === item && (el.miniPlayerTitle && el.miniPlayerTitle.textContent || '').trim() === String(t.trackName || '').trim();
  return `
      <div class="album-quick-peek-track${isNow ? ' now' : ''}" data-track-num="${escapeHtml(String(t.trackNumber || ''))}" data-track-name="${escapeHtml(t.trackName || '')}">
        <button type="button" class="album-quick-peek-track-play" title="Play this track" aria-label="Play ${escapeHtml(t.trackName || 'this track')}">▶</button>
        <span class="album-quick-peek-track-num">${trackNumHtml(t, ord)}</span>
        <span class="album-quick-peek-track-name"><span class="qp-title${rymBoldTrackClass(t, item)}">${escapeHtml(t.trackName || '')}</span>${songFlagHtml(item, t)}${t.trackExplicitness === 'explicit' ? '<span class="qp-explicit" title="Explicit">E</span>' : ''}</span>
        ${bits.length ? `<span class="album-quick-peek-track-details">${bits.join('')}</span>` : ''}
        ${rymBar}${linkMarks}<span class="album-quick-peek-track-time">${formatDuration(t.trackTimeMillis)}</span>
        ${credits.length ? `<div class="album-quick-peek-track-credits" hidden>${credits.map(c => `<p class="track-credit-entry"><span class="track-credit-name">${escapeHtml(c.name)}</span>${c.role ? `<span class="track-credit-role">${escapeHtml(c.role)}</span>` : ''}</p>`).join('')}</div>` : ''}
      </div>
    `;
}
// Places the FLOATING peek beside its card without ever covering it: below the card when there is
// reasonable room, otherwise above it, with the peek's height capped to the room on that side (its track
// list scrolls inside). Done once, at open, from the card's position — not re-done when the tracklist
// arrives. A version (1.29.178) that re-ran the keep-it-on-screen clamp after the tracks loaded pushed
// the peek UP over its own card for any card in the lower part of the window, so the second click of a
// double-click (which plays the album) landed on the peek instead of the card.
function placeFloatingQuickPeek(cardEl) {
  const peek = el.albumQuickPeek, r = cardEl.getBoundingClientRect();
  const gap = 6, margin = 8, cap = 560;
  const below = window.innerHeight - r.bottom - gap - margin;
  const above = r.top - gap - margin;
  const useAbove = below < 240 && above > below;
  peek.style.maxHeight = Math.max(160, Math.min(cap, useAbove ? above : below)) + 'px';
  const w = peek.getBoundingClientRect().width;
  peek.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - margin)) + 'px';
  if (useAbove) { peek.style.top = 'auto'; peek.style.bottom = (window.innerHeight - r.top + gap) + 'px'; }
  else { peek.style.bottom = 'auto'; peek.style.top = Math.max(4, r.bottom + gap) + 'px'; }
}
function openAlbumQuickPeek(item, cardEl) {
  closeOtherDropdownMenus();
  quickPeekItem = item;
  const mySeq = ++quickPeekSeq;
  quickPeekOpenedAt = performance.now();
  // An inline popup already open in a row ABOVE this cover changes height as it's refilled ("Loading tracklist…") and then moves away,
  // pulling this cover up by its height, so the second click of a double-click landed on a different cover. Where the cover is now,
  // before any of that; keepCardStill scrolls it back there.
  const cardTop0 = cardEl ? cardEl.getBoundingClientRect().top : 0;
  const keepCardStill = () => { if (!cardEl) return; const moved = Math.round(cardEl.getBoundingClientRect().top - cardTop0), sc = moved && gridScrollParent(cardEl); if (sc) sc.scrollTop += moved; };
  quickPeekSelectedTracks = new Set();
  quickPeekLastSelectedKey = null;
  if (!quickPeekOriginalParent) {
    quickPeekOriginalParent = el.albumQuickPeek.parentElement;
    quickPeekOriginalNextSibling = el.albumQuickPeek.nextElementSibling;
  }

  el.albumQuickPeekArt.src = item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item);
  el.albumQuickPeekArt.dataset.key = artKey(item);
  el.albumQuickPeekTitle.innerHTML = `${escapeHtml(item.title)}${linkFlagHtml(item, 'after')} <span class="album-quick-peek-arrow">▸</span>`;
  quickPeekCardEl = cardEl;
  qpFacts(item); el.albumQuickPeekCover.textContent = '';
  el.albumQuickPeekAbout.innerHTML = qpAboutHtml(item);
  const plays = qpPlays(item); el.albumQuickPeekListens.innerHTML = qpListensHtml(item, plays); el.albumQuickPeekListensTab.textContent = plays.n ? `Listens \u00b7 ${plays.n.toLocaleString()}` : 'Listens';
  el.albumQuickPeek.querySelector('[data-qp="prev"]').disabled = !qpNeighbour(-1); el.albumQuickPeek.querySelector('[data-qp="next"]').disabled = !qpNeighbour(1);
  const year = dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : '';
  // Artist name is clickable — jumps to Artist Information + that
  // artist's own releases (filterByArtist), matching the reference this
  // was built from exactly (a hand cursor over the artist name in the
  // quick peek's own subtitle line). Year stays plain text next to it.
  void year;                                   // (the year now goes in qpFacts' line, with the label and type)
  el.albumQuickPeekTracks.innerHTML = '<p class="tracklist-status">Loading tracklist\u2026</p>';
  qpSetTab(qpTabGet()); qpSelBarPaint(); qpTint(el.albumQuickPeekArt.src);

  el.albumQuickPeek.hidden = false;
  el.albumQuickPeek.classList.toggle('album-quick-peek-sleeve', state.albumQuickPeekStyle === 'sleeve');
  if (state.albumQuickPeekStyle === 'inline') {
    // Finder-style "expand in place": inserted as a grid-spanning sibling
    // (grid-column: 1 / -1, see CSS) right after the last card in the same
    // visual row as the one clicked, so it renders directly below that row
    // and pushes every later row down, instead of floating above the grid.
    el.albumQuickPeek.classList.add('album-quick-peek-inline');
    el.albumQuickPeek.style.left = '';
    el.albumQuickPeek.style.top = '';
    el.albumQuickPeek.style.bottom = '';       // floating mode anchors to the card's top edge when it opens upward
    el.albumQuickPeek.style.maxHeight = '';
    // Playlists' own Covers view renders into #playlistBody, not
    // #gridContainer — pick whichever one actually holds this card so row-
    // mate detection works in both contexts.
    const gridEl = state.activePlaylistId ? document.getElementById('playlistBody') : el.gridContainer;
    const allCards = [...(gridEl || el.gridContainer).querySelectorAll('.card[data-album-row]')];
    const rowTop = cardEl.getBoundingClientRect().top;
    const rowMates = allCards.filter(c => Math.abs(c.getBoundingClientRect().top - rowTop) < 2);
    const lastInRow = rowMates[rowMates.length - 1] || cardEl;
    lastInRow.insertAdjacentElement('afterend', el.albumQuickPeek);
    keepCardStill();
  } else {
    el.albumQuickPeek.classList.remove('album-quick-peek-inline');
    // Make sure it's back under its normal top-level parent first — it may
    // still be sitting inside #gridContainer from a previous inline peek,
    // and positionFloatingMenu assumes fixed positioning, not grid flow.
    if (el.albumQuickPeek.parentElement !== quickPeekOriginalParent) {
      if (quickPeekOriginalNextSibling && quickPeekOriginalNextSibling.parentElement === quickPeekOriginalParent) {
        quickPeekOriginalParent.insertBefore(el.albumQuickPeek, quickPeekOriginalNextSibling);
      } else {
        quickPeekOriginalParent.appendChild(el.albumQuickPeek);
      }
      keepCardStill();                         // it left the grid: the covers below where it was move up
    }
    if (state.albumQuickPeekStyle === 'sleeve') { const pk = el.albumQuickPeek; pk.style.maxHeight = ''; pk.style.bottom = 'auto'; const w = pk.getBoundingClientRect().width, h = pk.getBoundingClientRect().height; pk.style.left = Math.max(8, (window.innerWidth - w) / 2) + 'px'; pk.style.top = Math.max(8, (window.innerHeight - Math.min(660, window.innerHeight * 0.82)) / 2) + 'px'; void h; }
    else placeFloatingQuickPeek(cardEl);
  }
  applyCachedArt();

  getTracksFor(item).then(tracks => {
    if (mySeq !== quickPeekSeq) return; // closed, or replaced by a different card, while this was loading
    // Decided from the WHOLE release, before any playlist/search narrowing below: a search that
    // leaves only disc-2 tracks should still say "Disc 2", not look like a one-disc album.
    const multiDisc = tracksSpanMultipleDiscs(tracks);
    // Same fix as loadTracksForPlaylistGroups/loadPlaylistFlatTrackTable
    // (Album and Tracks view, flat Tracks table) — getTracksFor() always
    // returns the FULL release tracklist with no playlist-awareness at
    // all. When opened from a playlist's own Covers view, filter down to
    // just the tracks actually added to THIS playlist for this album,
    // UNLESS the whole album was added as a single item (type: 'album'),
    // in which case every track legitimately belongs and the full
    // tracklist is exactly right.
    const fullList = tracks;                                         // a song's number is its place in the WHOLE tracklist, whatever is filtered out below
    if (state.activePlaylistId) {
      const playlist = state.playlists.find(p => p.id === state.activePlaylistId);
      const albumItems = playlist ? playlist.items.filter(it => (item.albumId && it.albumId) ? it.albumId === item.albumId : String(it.row) === String(item.row)) : [];
      const hasWholeAlbum = albumItems.some(it => it.type === 'album');
      if (!hasWholeAlbum && albumItems.length) {
        const wantedTrackNums = new Set(albumItems.filter(it => it.type === 'track').map(it => String(it.trackNum)));
        tracks = tracks.filter(t => wantedTrackNums.has(String(t.trackNumber)));
      }
    } else if (state.activeTab === 'albums') {
      // Same search narrowing as the flat Tracks table / Album and Tracks
      // view (see filterTracksBySearch): searching "track:emerald nile"
      // matched the release, but this popup then listed all 10 of its
      // tracks. Only when this peek was opened from the Music tab's own
      // library grid, which is the one place the search box actually
      // governs — NOT from a playlist (handled just above, where the
      // playlist's own contents are what matter) and NOT from the Artist
      // Information tab, whose grid shows every release by that artist
      // regardless of whatever search happens to still be typed in the
      // Music tab.
      tracks = filterTracksBySearch(item, tracks);
    }
    let lastDisc = null, lastSide = null;
    const sided = tracks.some(t => t.section);
    el.albumQuickPeekTracks.innerHTML = tracks.length ? tracks.map(t => {
      const disc = t.discNumber || 1;
      let head = multiDisc && disc !== lastDisc ? `<div class="album-quick-peek-disc">Disc ${disc}</div>` : '';
      if (sided && (t.section || '') !== lastSide && t.section) head += `<div class="album-quick-peek-disc">${escapeHtml(/^[A-Z]$/i.test(t.section) ? 'Side ' + t.section.toUpperCase() : t.section)}</div>`;
      lastDisc = disc; lastSide = t.section || lastSide;
      return head + quickPeekTrackRowHtml(item, t, fullList.indexOf(t));
    }).join('') : '<p class="tracklist-status">No tracklist found for this release.</p>';
    {                                                                // songs and length in the header line, and how many songs each service can play
      const total = tracks.reduce((a, t) => a + (t.trackTimeMillis || 0), 0), lenEl = el.albumQuickPeekSub.querySelector('.qp-len');
      if (lenEl && tracks.length) lenEl.textContent = ` \u00b7 ${tracks.length} song${tracks.length === 1 ? '' : 's'}${total ? ' \u00b7 ' + formatDuration(total) : ''}`;
      let sp = 0, yt = 0; tracks.forEach(t => { const ov = trackLinkOverridesFor(item, t.trackNumber || 0, t.trackName); if (trackSpotifyUriFromLink(ov.spotifyLink || t.spotifyLink)) sp++; if (youtubeVideoIdFromUrl(ov.youtubeLink || t.youtubeLink)) yt++; });
      el.albumQuickPeekCover.innerHTML = tracks.length && (sp || yt || isManualAlbum(item)) ? `<span title="Songs with a Spotify link">S ${sp}/${tracks.length}</span> \u00b7 <span title="Songs with a YouTube link"${yt < tracks.length && isManualAlbum(item) && !sp ? ' class="qp-warn"' : ''}>Y ${yt}/${tracks.length}</span>` : '';
    }
    // The INLINE peek opens in the grid's own flow, right under the clicked row — so for a card in the
    // bottom visible row it opened entirely below the fold and looked like nothing had happened. It also
    // only gets its real height now, once the tracks are in, so this is where it can be brought into view
    // (nearest = the least scrolling that shows it, none if it's already visible).
    // Not at once, though: scrolling under the mouse straight after the first click sent a double-click's second click to another cover
    // (double-click plays the release). It waits until a double-click could no longer come, and is dropped if the popup was closed meanwhile.
    if (el.albumQuickPeek.classList.contains('album-quick-peek-inline')) {
      setTimeout(() => {
        if (mySeq === quickPeekSeq && !el.albumQuickPeek.hidden) el.albumQuickPeek.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, Math.max(0, quickPeekOpenedAt + QP_DOUBLE_CLICK_WAIT - performance.now()));
    }

    const rowEls = [...el.albumQuickPeekTracks.querySelectorAll('.album-quick-peek-track')];
    const rowKey = r => r.dataset.trackNum + '::' + r.dataset.trackName;
    rowEls.forEach(rowEl => {
      rowEl.querySelector('.album-quick-peek-track-play').addEventListener('click', (e) => {
        e.stopPropagation();
        playTrackNow(item, rowEl.dataset.trackName, rowEl.dataset.trackNum);
      });
      // The "N credits" chip shows/hides that track's credits under the row. It must not also
      // select the row (hence stopPropagation here, and the matching guards on click/dblclick below).
      const creditsBtn = rowEl.querySelector('.qp-credits-btn');
      if (creditsBtn) creditsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const block = rowEl.querySelector('.album-quick-peek-track-credits');
        block.hidden = !block.hidden;
        creditsBtn.setAttribute('aria-expanded', String(!block.hidden));
      });
      // Click selects (shift/ctrl for range/toggle, same convention as
      // album-card and Tracks-table selection elsewhere in the app);
      // double-click plays it directly, same as the ▶ button.
      rowEl.addEventListener('click', (e) => {
        if (e.target.closest('.album-quick-peek-track-play, .qp-credits-btn')) return;
        const key = rowKey(rowEl);
        const allKeys = rowEls.map(rowKey);
        if (e.shiftKey && quickPeekLastSelectedKey && allKeys.includes(quickPeekLastSelectedKey)) {
          const a = allKeys.indexOf(quickPeekLastSelectedKey);
          const b = allKeys.indexOf(key);
          const [start, end] = a < b ? [a, b] : [b, a];
          if (!(e.ctrlKey || e.metaKey)) quickPeekSelectedTracks.clear();
          for (let i = start; i <= end; i++) quickPeekSelectedTracks.add(allKeys[i]);
        } else if (e.ctrlKey || e.metaKey) {
          if (quickPeekSelectedTracks.has(key)) quickPeekSelectedTracks.delete(key);
          else quickPeekSelectedTracks.add(key);
          quickPeekLastSelectedKey = key;
        } else {
          quickPeekSelectedTracks.clear();
          quickPeekSelectedTracks.add(key);
          quickPeekLastSelectedKey = key;
        }
        rowEls.forEach(r => r.classList.toggle('selected', quickPeekSelectedTracks.has(rowKey(r))));
        qpSelBarPaint();
      });
      rowEl.addEventListener('dblclick', (e) => {
        if (e.target.closest('.album-quick-peek-track-play, .qp-credits-btn')) return;
        playTrackNow(item, rowEl.dataset.trackName, rowEl.dataset.trackNum);
      });
      // Right-click — same context menu (play, queue, playlist, edit
      // properties, etc.) the flat Tracks table and deck tracklist already
      // have, for full parity with those views. If the right-clicked row
      // is part of an active multi-selection, the menu acts on the whole
      // selection, same convention as those other views.
      rowEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const key = rowKey(rowEl);
        const isPartOfSelection = quickPeekSelectedTracks.has(key) && quickPeekSelectedTracks.size > 1;
        const selectedItems = isPartOfSelection
          ? rowEls.filter(r => quickPeekSelectedTracks.has(rowKey(r)))
              .map(r => ({ itemType: 'track', row: item.row, albumId: item.albumId || '', trackNum: r.dataset.trackNum, trackName: r.dataset.trackName }))
          : undefined;
        openTrackContextMenu(item, rowEl.dataset.trackName, e.clientX, e.clientY, rowEl.dataset.trackNum, selectedItems);
      });
    });
  });
}
function closeAlbumQuickPeek() {
  el.albumQuickPeek.hidden = true;
  quickPeekItem = null;
  quickPeekSeq++; // invalidate any in-flight tracklist fetch so it can't populate a closed/reused popover
  // Always return it to its normal top-level spot on close, regardless of
  // which style it was just shown in — if it were left sitting inside
  // #gridContainer from an inline peek, the next renderGrid() call (which
  // does gridContainer.innerHTML = '') would destroy this element outright
  // instead of just hiding it.
  if (quickPeekOriginalParent && el.albumQuickPeek.parentElement !== quickPeekOriginalParent) {
    if (quickPeekOriginalNextSibling && quickPeekOriginalNextSibling.parentElement === quickPeekOriginalParent) {
      quickPeekOriginalParent.insertBefore(el.albumQuickPeek, quickPeekOriginalNextSibling);
    } else {
      quickPeekOriginalParent.appendChild(el.albumQuickPeek);
    }
  }
}

function positionFloatingMenu(menu, x, y) {
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = Math.max(4, left) + 'px';
  menu.style.top = Math.max(4, top) + 'px';
}

// Builds the "add to crate" prefill object for a Spotify album, shared by
// the now-playing add menu and the album context menu's "Add" action.
function crateAlbumPrefillFromTrack(track) {
  const album = track.album || {};
  const artistName = (track.artists || []).map(a => a.name).join(', ');
  const bigArt = album.images && album.images[0];
  return {
    artist: artistName,
    title: album.name || track.name,
    type: spotifyAlbumTypeToOurType(album.album_type),
    releaseDate: album.release_date ? album.release_date.slice(0, 10) : '',
    genre: '',
    region: '',
    label: '',
    catalog: '',
    link: album.uri || '',
    cover: bigArt ? bigArt.url : ''
  };
}

// Best-effort match of a currently-playing Spotify track back to an item
// already in the crate, by normalized artist + album title — same idea as
// the exact-match lookup used for scrobbles, but loose enough to survive
// Spotify's "(Remastered 2011)"-style edition suffixes.
function normMatchKey(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[\(\[][^)\]]*[\)\]]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function findCrateItemForTrack(track) {
  if (!track) return null;
  const album = track.album || {};
  const albumKey = normMatchKey(album.name || track.name);
  const artistKeys = (track.artists || []).map(a => normMatchKey(a.name));
  if (!albumKey || !artistKeys.length) return null;
  return state.raw.find(r => artistKeys.includes(normMatchKey(r.artist)) && normMatchKey(r.title) === albumKey) || null;
}

// Clicking the track title (or album name) in the mini player: jump to that
// album's page in the crate if it's already logged, otherwise fall back to
// the "add to crate" menu so there's still somewhere useful to go.
function goToTrackPage(track) {
  if (!track) return;
  const match = findCrateItemForTrack(track);
  if (match) {
    switchTab('albums');
    openDeck(match);
    return;
  }
  const rect = el.miniPlayerTitle.getBoundingClientRect();
  openNowPlayingAddMenu(track, rect.left, rect.bottom + 6);
}

// Clicking the artist name in the mini player: filter the main library down
// to that artist's tracks, same as picking them from the Artists left panel.
function goToArtistTracks(track) {
  if (!track) return;
  const artistName = track.artists && track.artists[0] && track.artists[0].name;
  if (!artistName) return;
  const known = state.raw.find(r => normMatchKey(r.artist) === normMatchKey(artistName));
  const filterValue = known ? known.artist : artistName;

  state.mainViewMode = 'tracks';
  applyMainViewMode();
  filterByArtist(filterValue);
}

// Filters the main panel down to one artist's discography — switches the
// left panel into Artist mode and applies the same navFilter clicking that
// artist there would. Shared by the mini player's artist link and the album
// card context menu's "View artist discography" action; whichever main view
// mode (grid/covers/tracks) is already active is left alone, so this reads
// as "show me everything by them" rather than forcing a specific layout.
function filterByArtist(artistName) {
  switchTab('albums');
  state.leftMode = 'artist';
  el.leftModeLabel.textContent = capitalize('artist') + 's';
  state.navFilter = { mode: 'artist', value: artistParts(artistName)[0] };          // (a shared credit: its first artist)
  buildLeftList();
  updateMainLabel();
  applyFiltersSort();
}

let nowPlayingAddMenuEl = null;
function openNowPlayingAddMenu(track, x, y) {
  closeNowPlayingAddMenu();
  const album = track.album || {};
  const artistName = (track.artists || []).map(a => a.name).join(', ');

  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu';
  menu.innerHTML = `
    <div class="menu-section-title">Add to your crate</div>
    <button type="button" data-add-mode="album">"${escapeHtml(album.name || track.name)}" as Album</button>
    <button type="button" data-add-mode="single">"${escapeHtml(track.name)}" as Single</button>
    <div class="menu-divider"></div>
    <button type="button" data-add-mode="search">Search manually…</button>
  `;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-add-mode]');
    if (!btn) return;
    const mode = btn.dataset.addMode;
    closeNowPlayingAddMenu();

    if (mode === 'search') {
      openAddModal();
      el.addSearchInput.value = `${artistName} ${album.name || track.name}`.trim();
      doAddSearch();
      return;
    }
    if (mode === 'single') {
      openAddModal();
      showAddForm({ ...crateAlbumPrefillFromTrack(track), title: track.name, type: 'Single' });
      return;
    }
    // "as Album": don't drop straight into a form with a blank label — look up
    // the release group on MusicBrainz first so the different pressings/labels
    // for this album can be picked from, same as the Artist tab's + Add flow.
    openAddModalForTrackAlbum(track);
  });

  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}
