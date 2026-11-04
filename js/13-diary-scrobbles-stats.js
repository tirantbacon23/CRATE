// CRATE — Diary, Scrobbles and Stats tabs.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Diary tab (full history \u2014 compendium of logged entries) ---------- */
// The compendium can be browsed as a Feed (chronological, Letterboxd-style),
// a Grid (cover-art tiles, like the Music tab), or By track (entries grouped
// by which track they cover). Clicking any entry opens the detail modal
// rather than jumping straight to the album, since the whole point of the
// diary is to review *what you thought*, not just the album itself.

function diaryDateLabel(entry) {
  const hasDate = dateVal(entry.date) !== -Infinity;
  let label = hasDate
    ? new Date(entry.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Undated';
  if (dateVal(entry.timestamp) !== -Infinity) {
    label += ` at ${new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  return label;
}

function diaryEntryTracksLabel(entry) {
  const tracks = entry.tracks || [];
  if (entry.full) return 'Full album';
  if (tracks.length) return tracks.map(t => t.name).join(' \u00b7 ');
  return '';
}

function matchAlbumForEntry(entry) {
  return state.raw.find(r => r.artist === entry.artist && r.title === entry.title) || null;
}

function coverArtForEntry(entry) {
  const match = matchAlbumForEntry(entry);
  if (match) return match.cover || state.artCache[artKey(match)]?.art || placeholderArt(match);
  return placeholderArt({ artist: entry.artist || '?' });
}

function setDiaryViewMode(mode) {
  state.diaryViewMode = mode;
  [['feed', el.diaryViewFeedBtn], ['grid', el.diaryViewGridBtn], ['tracks', el.diaryViewTracksBtn]]
    .forEach(([m, btn]) => btn && btn.classList.toggle('active', m === mode));
  el.diaryTrackGroupToolbar.hidden = mode !== 'tracks';
  el.app.classList.toggle('app-wide-diary-tracks', state.activeTab === 'diary' && mode === 'tracks');
  renderDiary();
}

function setDiaryTrackGroupMode(mode) {
  state.diaryTrackGroupMode = mode;
  [['track', el.diaryGroupByTrackBtn], ['entry', el.diaryGroupByEntryBtn]]
    .forEach(([m, btn]) => btn && btn.classList.toggle('active', m === mode));
  renderDiary();
}

function renderDiary() {
  el.diaryContainer.innerHTML = '';
  el.diaryContainer.className = '';
  if (!state.diary.length) {
    showState('emptyDiary', 'diary');
    return;
  }
  hideState('diary');

  const mode = state.diaryViewMode || 'feed';
  el.diaryWrap.classList.toggle('diary-wrap-wide', mode !== 'feed');
  el.diaryWrap.classList.toggle('diary-wrap-tracks', mode === 'tracks');
  if (mode === 'grid') renderDiaryGrid();
  else if (mode === 'tracks') renderDiaryByTrack();
  else renderDiaryFeed();
}

function renderDiaryFeed() {
  const sorted = [...state.diary].sort((a, b) => dateVal(b.date) - dateVal(a.date));
  const feed = document.createElement('div');
  feed.className = 'diary-feed' + (state.diarySelectMode ? ' diary-select-active' : '');

  sorted.forEach(entry => {
    const row = document.createElement('div');
    const selected = selectedDiaryKeys.has(diaryEntryKey(entry));
    row.className = 'diary-entry' + (selected ? ' diary-entry-selected' : '');
    const tracksLabel = diaryEntryTracksLabel(entry);

    row.innerHTML = `
      ${state.diarySelectMode ? `<label class="diary-select-checkbox" title="Select entry">
        <input type="checkbox" ${selected ? 'checked' : ''} aria-label="Select entry">
      </label>` : ''}
      <div class="diary-date">${diaryDateLabel(entry)}</div>
      <div class="diary-main">
        ${entry.entryTitle ? `<p class="diary-entry-title">${escapeHtml(entry.entryTitle)}</p>` : ''}
        <p class="diary-title">${escapeHtml(entry.title)}</p>
        <p class="diary-artist">${escapeHtml(entry.artist)}</p>
        ${tracksLabel ? `<p class="diary-tracks-label${entry.full ? ' dd-tracks-full' : ''}">${escapeHtml(tracksLabel)}</p>` : ''}
        ${entry.description ? `<p class="diary-note">${escapeHtml(entry.description)}</p>` : ''}
      </div>
      <div class="diary-rating">${entry.rating ? starRatingHtml(entry.rating) : ''}</div>
    `;
    const checkboxInput = row.querySelector('.diary-select-checkbox input');
    if (checkboxInput) {
      checkboxInput.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDiarySelection(entry);
      });
    }
    row.addEventListener('click', (e) => {
      if (e.target.closest('.diary-select-checkbox')) return;
      if (state.diarySelectMode) { toggleDiarySelection(entry); return; }
      openDiaryEntryModal(entry);
    });
    feed.appendChild(row);
  });

  el.diaryContainer.appendChild(feed);
}

function renderDiaryGrid() {
  el.diaryContainer.className = 'diary-grid' + (state.diarySelectMode ? ' diary-select-active' : '');
  const sorted = [...state.diary].sort((a, b) => dateVal(b.date) - dateVal(a.date));

  el.diaryContainer.innerHTML = sorted.map(entry => {
    const selected = selectedDiaryKeys.has(diaryEntryKey(entry));
    return `
    <div class="diary-grid-tile${selected ? ' diary-grid-tile-selected' : ''}" data-key="${escapeHtml(diaryEntryKey(entry))}">
      ${state.diarySelectMode ? `<label class="diary-select-checkbox diary-select-checkbox-grid" title="Select entry">
        <input type="checkbox" ${selected ? 'checked' : ''} aria-label="Select entry">
      </label>` : ''}
      <img class="diary-grid-cover" src="${coverArtForEntry(entry)}" alt="${escapeHtml(entry.title)}" loading="lazy">
      <div class="diary-grid-meta">
        <p class="diary-grid-title">${escapeHtml(entry.entryTitle || entry.title)}</p>
        <p class="diary-grid-sub">${diaryDateLabel(entry)}${entry.rating ? ' \u00b7 ' + starRatingHtml(entry.rating) : ''}</p>
      </div>
    </div>
  `;
  }).join('');

  [...el.diaryContainer.querySelectorAll('.diary-grid-tile')].forEach((tile, i) => {
    const entry = sorted[i];
    const checkboxInput = tile.querySelector('.diary-select-checkbox input');
    if (checkboxInput) {
      checkboxInput.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDiarySelection(entry);
        diaryGridShiftAnchor = i;
      });
    }
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.diary-select-checkbox')) return;
      if (e.shiftKey) {
        e.preventDefault(); // stop the browser's own text-selection from kicking in on the shift-click
        selectDiaryRange(sorted, i);
        return;
      }
      diaryGridShiftAnchor = i;
      if (state.diarySelectMode) { toggleDiarySelection(entry); return; }
      openDiaryEntryModal(entry);
    });
  });
}

// Anchor tile (index into the currently-sorted grid list) that shift-click
// range selection extends from. Reset whenever the grid is re-sorted by a
// fresh renderDiaryGrid() call working from a stale index would otherwise
// silently select the wrong range, so callers always pass the current
// `sorted` array rather than relying on anything captured earlier.
let diaryGridShiftAnchor = null;

function selectDiaryRange(sorted, endIdx) {
  if (!state.diarySelectMode) {
    state.diarySelectMode = true;
    el.diarySelectModeBtn.textContent = 'Done';
    el.diarySelectModeBtn.classList.add('active');
  }
  const startIdx = diaryGridShiftAnchor === null ? endIdx : diaryGridShiftAnchor;
  const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
  for (let i = from; i <= to; i++) selectedDiaryKeys.add(diaryEntryKey(sorted[i]));
  diaryGridShiftAnchor = endIdx;
  updateDiarySelectionBar();
  renderDiary();
}

// Groups entries by individual track (full-album entries are listed under
// each of the album's tracks, since MusicBrainz/iTunes may need a network
// call to resolve a full album's tracklist \u2014 we use whatever entry.tracks
// captured, falling back to a per-album bucket for legacy/untracked entries).
function renderDiaryByTrack() {
  if ((state.diaryTrackGroupMode || 'track') === 'entry') { renderDiaryGroupedByEntry(); return; }
  renderDiaryGroupedByTrack();
}

function renderDiaryGroupedByTrack() {
  el.diaryContainer.className = 'diary-track-groups';
  const groupsByKey = new Map(); // "artist::title::trackname" -> { label, artist, title, entries: [] }
  const untracked = [];

  state.diary.forEach(entry => {
    const tracks = entry.tracks || [];
    if (!tracks.length) { untracked.push(entry); return; }
    tracks.forEach(t => {
      const key = entry.artist + '::' + entry.title + '::' + t.name;
      if (!groupsByKey.has(key)) groupsByKey.set(key, { label: t.name, artist: entry.artist, title: entry.title, entries: [] });
      groupsByKey.get(key).entries.push(entry);
    });
  });

  // Index-based lookup (rather than matching back on track name) so two
  // different albums that happen to share a track title never collide.
  const groupList = [...groupsByKey.values()].sort((a, b) => b.entries.length - a.entries.length);

  const entryRow = (entry, gi, ei, label) => {
    const selected = selectedDiaryKeys.has(diaryEntryKey(entry));
    return `<div class="diary-track-group-entry${selected ? ' diary-track-group-entry-selected' : ''}" data-group="${gi}" data-entry="${ei}" role="button" tabindex="0">
      ${state.diarySelectMode ? `<label class="diary-select-checkbox" title="Select entry"><input type="checkbox" ${selected ? 'checked' : ''} aria-label="Select entry"></label>` : ''}
      <span class="diary-track-group-entry-main">${label}</span>
    </div>`;
  };

  let html = groupList.map((g, gi) => `
    <div class="diary-track-group">
      <div class="diary-track-group-head">
        <img class="diary-track-group-art" src="${coverArtForEntry(g.entries[0])}" alt="" loading="lazy">
        <div class="diary-track-group-headtext">
          <p class="diary-track-group-name">${escapeHtml(g.label)}</p>
          <p class="diary-track-group-sub">${escapeHtml(g.artist)} \u2014 ${escapeHtml(g.title)} \u00b7 ${g.entries.length} listen${g.entries.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div class="diary-track-group-entries">
        ${g.entries.map((e, ei) => entryRow(e, gi, ei, `${diaryDateLabel(e)}${e.rating ? ' \u00b7 ' + starRatingHtml(e.rating) : ''}`)).join('')}
      </div>
    </div>
  `).join('');

  if (untracked.length) {
    html += `
    <div class="diary-track-group diary-track-group-untracked">
      <div class="diary-track-group-head">
        <div class="diary-track-group-art diary-track-group-art-placeholder"></div>
        <div class="diary-track-group-headtext">
          <p class="diary-track-group-name">No track detail</p>
          <p class="diary-track-group-sub">Entries logged before track selection, or logged without picking tracks \u00b7 ${untracked.length} listen${untracked.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div class="diary-track-group-entries">
        ${untracked.map((e, ei) => entryRow(e, 'untracked', ei, `${escapeHtml(e.title)} \u2014 ${diaryDateLabel(e)}`)).join('')}
      </div>
    </div>`;
  }

  el.diaryContainer.innerHTML = html || '<p class="diary-empty">Nothing to group yet.</p>';

  el.diaryContainer.querySelectorAll('.diary-track-group-entry').forEach(row => {
    const g = row.dataset.group;
    const ei = Number(row.dataset.entry);
    const entry = g === 'untracked' ? untracked[ei] : groupList[Number(g)].entries[ei];
    if (!entry) return;
    const checkboxInput = row.querySelector('.diary-select-checkbox input');
    if (checkboxInput) {
      checkboxInput.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDiarySelection(entry);
      });
    }
    row.addEventListener('click', (e) => {
      if (e.target.closest('.diary-select-checkbox')) return;
      if (state.diarySelectMode) { toggleDiarySelection(entry); return; }
      openDiaryEntryModal(entry);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });
  });
}

// Groups by album instead, with each diary entry appearing exactly once \u2014
// even when it covers several tracks \u2014 rather than being repeated once per
// track the way the "Track" grouping above does. Every track logged as part
// of one listen shares the same date/time anyway, since they all came from
// the same log-a-listen action, so splitting them across separate track
// buckets was just showing the same entry over and over.
function renderDiaryGroupedByEntry() {
  el.diaryContainer.className = 'diary-track-groups';
  const groupsByKey = new Map(); // "artist::title" -> { artist, title, entries: [] }

  state.diary.forEach(entry => {
    const key = entry.artist + '::' + entry.title;
    if (!groupsByKey.has(key)) groupsByKey.set(key, { artist: entry.artist, title: entry.title, entries: [] });
    groupsByKey.get(key).entries.push(entry);
  });

  const groupList = [...groupsByKey.values()]
    .map(g => ({ ...g, entries: [...g.entries].sort((a, b) => dateVal(b.date) - dateVal(a.date)) }))
    .sort((a, b) => b.entries.length - a.entries.length);

  const html = groupList.map((g, gi) => `
    <div class="diary-track-group">
      <div class="diary-track-group-head">
        <img class="diary-track-group-art" src="${coverArtForEntry(g.entries[0])}" alt="" loading="lazy">
        <div class="diary-track-group-headtext">
          <p class="diary-track-group-name">${escapeHtml(g.title)}</p>
          <p class="diary-track-group-sub">${escapeHtml(g.artist)} \u00b7 ${g.entries.length} listen${g.entries.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div class="diary-track-group-entries">
        ${g.entries.map((e, ei) => {
          const tracksLabel = diaryEntryTracksLabel(e);
          const selected = selectedDiaryKeys.has(diaryEntryKey(e));
          return `<div class="diary-track-group-entry${selected ? ' diary-track-group-entry-selected' : ''}" data-group="${gi}" data-entry="${ei}" role="button" tabindex="0">
            ${state.diarySelectMode ? `<label class="diary-select-checkbox" title="Select entry"><input type="checkbox" ${selected ? 'checked' : ''} aria-label="Select entry"></label>` : ''}
            <span class="diary-track-group-entry-main">
              <span class="dtg-entry-date">${diaryDateLabel(e)}${e.rating ? ' \u00b7 ' + starRatingHtml(e.rating) : ''}</span>
              ${tracksLabel ? `<span class="dtg-entry-tracks">${escapeHtml(tracksLabel)}</span>` : ''}
            </span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  el.diaryContainer.innerHTML = html || '<p class="diary-empty">Nothing to group yet.</p>';

  el.diaryContainer.querySelectorAll('.diary-track-group-entry').forEach(row => {
    const entry = groupList[Number(row.dataset.group)].entries[Number(row.dataset.entry)];
    if (!entry) return;
    const checkboxInput = row.querySelector('.diary-select-checkbox input');
    if (checkboxInput) {
      checkboxInput.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDiarySelection(entry);
      });
    }
    row.addEventListener('click', (e) => {
      if (e.target.closest('.diary-select-checkbox')) return;
      if (state.diarySelectMode) { toggleDiarySelection(entry); return; }
      openDiaryEntryModal(entry);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });
  });
}

/* ---------- Diary multi-select (Feed / Grid views) ---------- */
// Selection lives outside `state` since it's transient UI, not something
// that should ever be persisted or synced. Keyed the same way the grid
// tiles already were, so entries stay identifiable across re-renders.
let selectedDiaryKeys = new Set();
let deleteSelectedConfirm = false;
let deleteSelectedConfirmTimeout = null;

function diaryEntryKey(entry) {
  return entry.artist + '::' + entry.title + '::' + entry.date + '::' + entry.timestamp;
}

function toggleDiarySelection(entry) {
  const key = diaryEntryKey(entry);
  if (selectedDiaryKeys.has(key)) selectedDiaryKeys.delete(key);
  else selectedDiaryKeys.add(key);
  updateDiarySelectionBar();
  renderDiary();
}

function setDiarySelectMode(on) {
  state.diarySelectMode = on;
  el.diarySelectModeBtn.textContent = on ? 'Done' : 'Select';
  el.diarySelectModeBtn.classList.toggle('active', on);
  if (!on) clearDiarySelection();
  else renderDiary();
}

function selectAllDiaryEntries() {
  if (!state.diary.length) return;
  if (!state.diarySelectMode) setDiarySelectMode(true);
  state.diary.forEach(entry => selectedDiaryKeys.add(diaryEntryKey(entry)));
  updateDiarySelectionBar();
  renderDiary();
}

function clearDiarySelection() {
  diaryGridShiftAnchor = null;
  if (!selectedDiaryKeys.size) { renderDiary(); return; }
  selectedDiaryKeys.clear();
  updateDiarySelectionBar();
  renderDiary();
}

function updateDiarySelectionBar() {
  const n = selectedDiaryKeys.size;
  el.diarySelectionBar.hidden = n === 0;
  el.diarySelectionCount.textContent = `${n} selected`;
  if (!n) {
    deleteSelectedConfirm = false;
    clearTimeout(deleteSelectedConfirmTimeout);
    el.diaryDeleteSelectedBtn.textContent = 'Delete selected';
    el.diaryDeleteSelectedBtn.classList.remove('confirm');
  }
}

function onDeleteSelectedClick() {
  if (!selectedDiaryKeys.size) return;
  if (deleteSelectedConfirm) {
    clearTimeout(deleteSelectedConfirmTimeout);
    deleteSelectedConfirm = false;
    deleteSelectedDiaryEntries();
    return;
  }
  deleteSelectedConfirm = true;
  el.diaryDeleteSelectedBtn.textContent = 'Click again to confirm';
  el.diaryDeleteSelectedBtn.classList.add('confirm');
  deleteSelectedConfirmTimeout = setTimeout(() => {
    deleteSelectedConfirm = false;
    el.diaryDeleteSelectedBtn.textContent = 'Delete selected';
    el.diaryDeleteSelectedBtn.classList.remove('confirm');
  }, 2500);
}

// Best-effort bulk delete \u2014 mirrors deleteDiaryEntryDirect()'s per-entry
// payload shape (row/artist/title/date/timestamp) since selected entries can
// span multiple albums, not just the currently open deck.
async function deleteSelectedDiaryEntries() {
  const toDelete = state.diary.filter(e => selectedDiaryKeys.has(diaryEntryKey(e)));
  if (!toDelete.length) return;
  let failures = 0;
  for (const entry of toDelete) {
    try {
      await postUpdate({ action: 'deleteListen', row: entry.row, artist: entry.artist, title: entry.title, date: entry.date, timestamp: entry.timestamp });
      const idx = state.diary.indexOf(entry);
      if (idx !== -1) state.diary.splice(idx, 1);
      selectedDiaryKeys.delete(diaryEntryKey(entry));
    } catch (err) {
      failures++;
    }
  }
  updateDiarySelectionBar();
  renderDiary();
  if (activeItem) renderDeckDiaryList(activeItem);
  flashGlobalToast(failures ? `Deleted ${toDelete.length - failures} \u2014 ${failures} couldn\u2019t be removed` : `Deleted ${toDelete.length} entr${toDelete.length === 1 ? 'y' : 'ies'}`);
}

/* ---------- Scrobbles tab (Last.fm play-count history, separate from the diary) ---------- */

function scrobbleTotals() {
  // Roll all imported rows up into one row per album: total plays,
  // last-played date, and whether it's still in the crate (it always
  // will be here since we only store matched imports, but the match is
  // re-checked live in case the album's row was later edited/removed).
  // Rows are now per (album, track, day), so several rows can share the
  // same day — track unique days in a Set rather than counting rows.
  const byAlbum = new Map();
  state.scrobbles.forEach(s => {
    const key = s.row + '::' + s.artist + '::' + s.title;
    if (!byAlbum.has(key)) byAlbum.set(key, { row: s.row, artist: s.artist, title: s.title, totalPlays: 0, lastDay: s.day, dayset: new Set() });
    const g = byAlbum.get(key);
    g.totalPlays += s.playCount;
    g.dayset.add(s.day);
    if (s.day > g.lastDay) g.lastDay = s.day;
  });
  return [...byAlbum.values()].map(g => ({ row: g.row, artist: g.artist, title: g.title, totalPlays: g.totalPlays, lastDay: g.lastDay, days: g.dayset.size }));
}

function scrobbleCountFor(artist, title) {
  return state.scrobbles
    .filter(s => s.artist === artist && s.title === title)
    .reduce((sum, s) => sum + s.playCount, 0);
}

// Normalize a track name for matching Last.fm scrobble titles against
// iTunes/MusicBrainz tracklist names — same idea as lastfmNormKey but for
// a single track title (strips edition/remaster noise, punctuation).
// String(name || '') rather than (name || '') — a purely-numeric track
// title (e.g. "21", "1989") can come back from the sheet as a real
// JS number rather than a string (see the PlaylistItems TrackName fix in
// fetchCatalog), and .toLowerCase() isn't a function on a number. Coercing
// here means this is safe regardless of what type slips through upstream.
function trackNormKey(name) {                // "\u00bd Way Down" and "Halfway Down" are one track
  return foldFractions(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\(\[][^)\]]*[\)\]]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function trackScrobbleCountFor(artist, title, trackName) {
  const tn = trackNormKey(trackName);
  if (!tn) return 0;
  return state.scrobbles
    .filter(s => s.artist === artist && s.title === title && trackNormKey(s.track) === tn)
    .reduce((sum, s) => sum + s.playCount, 0);
}

function renderScrobbles() {
  el.scrobblesContainer.innerHTML = '';
  if (!state.scrobbles.length) {
    showState('emptyScrobbles', 'scrobbles');
    return;
  }
  hideState('scrobbles');

  const totals = scrobbleTotals().sort((a, b) => b.totalPlays - a.totalPlays);
  const feed = document.createElement('div');
  feed.className = 'diary-feed';

  totals.forEach(g => {
    const row = document.createElement('div');
    row.className = 'diary-entry';
    const lastPlayedLabel = dateVal(g.lastDay) !== -Infinity
      ? new Date(g.lastDay).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : g.lastDay;

    row.innerHTML = `
      <div class="diary-date">Last: ${lastPlayedLabel}</div>
      <div class="diary-main">
        <p class="diary-title">${escapeHtml(g.title)}</p>
        <p class="diary-artist">${escapeHtml(g.artist)}</p>
        <p class="diary-note">Listened on ${g.days} day${g.days === 1 ? '' : 's'}</p>
      </div>
      <div class="diary-rating">${g.totalPlays} play${g.totalPlays === 1 ? '' : 's'}</div>
    `;
    row.addEventListener('click', () => {
      const match = state.raw.find(r => r.artist === g.artist && r.title === g.title);
      if (match) { switchTab('albums'); openDeck(match); }
    });
    feed.appendChild(row);
  });

  el.scrobblesContainer.appendChild(feed);
}

/* ---------- Stats tab: albums listened to, by year ---------- */
// Combines the Diary (dates you explicitly logged a listen) and Scrobbles
// (Last.fm play history) into one "distinct albums per year" count. An
// album counts once for a year even if it shows up in both sources, or
// several times in either — identity is the normalized artist+title pair
// (same matching used for Last.fm import), not the row itself.

function computeYearStats() {
  const byYear = new Map(); // year -> { diary: Set, scrobble: Set, items: Map(key -> {artist,title}) }

  function bucket(year) {
    if (!byYear.has(year)) byYear.set(year, { diary: new Set(), scrobble: new Set(), items: new Map() });
    return byYear.get(year);
  }

  state.diary.forEach(d => {
    if (dateVal(d.date) === -Infinity) return; // undated diary entries can't be attributed to a year
    const year = String(new Date(d.date).getFullYear());
    const key = lastfmNormKey(d.artist, d.title);
    const b = bucket(year);
    b.diary.add(key);
    if (!b.items.has(key)) b.items.set(key, { artist: d.artist, title: d.title });
  });

  state.scrobbles.forEach(s => {
    if (dateVal(s.day) === -Infinity) return;
    const year = String(new Date(s.day).getFullYear());
    const key = lastfmNormKey(s.artist, s.title);
    const b = bucket(year);
    b.scrobble.add(key);
    if (!b.items.has(key)) b.items.set(key, { artist: s.artist, title: s.title });
  });

  return [...byYear.entries()]
    .map(([year, b]) => ({
      year,
      diaryCount: b.diary.size,
      scrobbleCount: b.scrobble.size,
      combinedCount: new Set([...b.diary, ...b.scrobble]).size,
      items: b.items
    }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

let statsRowsCache = [];

// Release-level breakdowns of the crate itself — type, decade, genre
// (reusing the taxonomy's hierarchy-aware aggregation), region, label,
// ratings — distinct from renderStats()/computeYearStats() above, which
// are about listening ACTIVITY (Diary/scrobbles), not the releases
// themselves.
function computeCollectionStats() {
  const raw = state.raw;
  const total = raw.length;
  const artistSet = new Set();
  raw.forEach(r => (r.artist || '').split(',').forEach(a => { const t = a.trim(); if (t) artistSet.add(t); }));
  const rated = raw.filter(r => Number(r.rating) > 0);
  const avgRating = rated.length ? (rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length) : 0;

  const countBy = (fn, fallback) => {
    const map = new Map();
    raw.forEach(r => {
      const v = (fn(r) || '').toString().trim() || fallback;
      map.set(v, (map.get(v) || 0) + 1);
    });
    return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };

  const byType = countBy(r => r.type, 'Unknown');
  const byRegion = countBy(r => r.region, 'Unknown').slice(0, 10);
  const byLabel = countBy(r => r.label, null).filter(r => r.label).slice(0, 10);

  const decadeCounts = new Map();
  raw.forEach(r => {
    const ms = dateVal(r.releaseDate);
    if (ms === -Infinity) return;
    const decade = Math.floor(new Date(ms).getUTCFullYear() / 10) * 10 + 's';
    decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
  });
  const byDecade = [...decadeCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));

  // Top-level genre breakdown — reuses the Genre Taxonomy's own hierarchy-
  // aware aggregation (buildGenreTree) rather than a flat re-count, so
  // this naturally reflects whatever hierarchy is set up in ⚙ → Genre
  // Taxonomy… (a Shoegaze album counts toward Rock here too).
  const byGenreTop = buildGenreTree(raw, state.genreTaxonomy).filter(r => r.depth === 0).sort((a, b) => b.count - a.count);

  const ratingCounts = [0, 0, 0, 0, 0]; // index 0 = 1★ ... index 4 = 5★
  rated.forEach(r => {
    const n = Math.round(Number(r.rating));
    if (n >= 1 && n <= 5) ratingCounts[n - 1]++;
  });

  return { total, artistCount: artistSet.size, avgRating, ratedCount: rated.length, byType, byRegion, byLabel, byDecade, byGenreTop, ratingCounts };
}

// One "label — bar — count" row, reused across every breakdown section
// below so they all share the same visual language (a plain, self-
// contained bar sized relative to that section's own max, not a shared
// scale across sections — a "10 albums" bar in By Type and a "10 albums"
// bar in By Label should each look "full" for their own section).
function collectionStatBarRows(rows) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return rows.map(r => `
    <div class="stats-bar-row">
      <span class="stats-bar-label">${escapeHtml(r.label)}</span>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.round((r.count / max) * 100)}%"></div></div>
      <span class="stats-bar-count">${Math.round(r.count * 10) / 10}</span>
    </div>
  `).join('');
}

function renderCollectionStats() {
  const s = computeCollectionStats();
  if (!s.total) {
    el.statsCollectionBody.innerHTML = '<p class="diary-empty">Your crate is empty — add a release to see collection statistics.</p>';
    return;
  }

  const ratingLabels = ['★', '★★', '★★★', '★★★★', '★★★★★'];
  const ratingRows = s.ratingCounts.map((count, i) => ({ label: ratingLabels[i], count })).filter(r => r.count > 0).reverse();

  el.statsCollectionBody.innerHTML = `
    <div class="stats-summary-cards">
      <div class="stats-summary-card"><span class="stats-summary-value">${s.total}</span><span class="stats-summary-label">Release${s.total === 1 ? '' : 's'}</span></div>
      <div class="stats-summary-card"><span class="stats-summary-value">${s.artistCount}</span><span class="stats-summary-label">Artist${s.artistCount === 1 ? '' : 's'}</span></div>
      <div class="stats-summary-card"><span class="stats-summary-value">${s.avgRating ? s.avgRating.toFixed(1) : '\u2014'}</span><span class="stats-summary-label">Avg rating${s.ratedCount ? ` (${s.ratedCount})` : ''}</span></div>
    </div>

    ${s.byGenreTop.length ? `<div class="stats-section"><h3>By genre</h3>${collectionStatBarRows(s.byGenreTop)}</div>` : ''}
    <div class="stats-section"><h3>By type</h3>${collectionStatBarRows(s.byType)}</div>
    ${s.byDecade.length ? `<div class="stats-section"><h3>By decade</h3>${collectionStatBarRows(s.byDecade)}</div>` : ''}
    ${ratingRows.length ? `<div class="stats-section"><h3>Ratings</h3>${collectionStatBarRows(ratingRows)}</div>` : ''}
    <div class="stats-section"><h3>By region</h3>${collectionStatBarRows(s.byRegion)}</div>
    ${s.byLabel.length ? `<div class="stats-section"><h3>Top labels</h3>${collectionStatBarRows(s.byLabel)}</div>` : ''}
  `;
}

// Release Chart tab — releases-per-year for ONE genre at a time, its own
// dedicated panel (see #chartWrap) rather than a section tucked inside
// Stats. Genre select defaults to whatever's filtered in the left panel
// (state.navFilter) if anything is, falling back to state.chartGenre (the
// last one picked here) or the first genre alphabetically if neither.
// Uses the same genreMatchesFilter() the grid itself filters by, so this
// always matches exactly what browsing that genre would show — a
// Shoegaze album counts here while charting Rock, same as the grid itself
// would include it.
function computeChartGenreYearData(genre) {
  const yearCounts = new Map();
  let matched = 0;
  state.raw.forEach(r => {
    if (!filterGenreTags(r).some(g => genreNavMatches(state.genreTaxonomy, g, genre))) return;
    matched++;
    const ms = dateVal(r.releaseDate);
    if (ms === -Infinity) return;
    const year = new Date(ms).getUTCFullYear();
    yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
  });
  const rows = [...yearCounts.entries()].map(([label, count]) => ({ label: String(label), count })).sort((a, b) => a.label.localeCompare(b.label));
  return { matched, rows };
}

// Release Chart — now a Main-panel layout element (see LAYOUT_ELEMENTS,
// applyMainPanelLayout) rather than its own top-level tab. Guard checks
// hidden (like Genre Description/Now Playing Bar's own render functions)
// instead of existence, since #chartElement is a static part of the page
// now, just toggled by the layout system.
function renderChartElement() {
  if (!el.chartElement || el.chartElement.hidden) return;
  // getAllKnownGenres returns {key, label, parents} objects, not plain
  // strings (it even sorts internally by .label) — extracting .label right
  // away here lets every line below keep comparing/sorting plain strings,
  // as it was always meant to. Using the object array directly threw
  // "a.localeCompare is not a function" on the very first sort, and would
  // have ALSO silently broken the includes()/=== checks further down even
  // without that (comparing an object to a string is just always false).
  const allGenres = getAllKnownGenres(state.genreTaxonomy).map(g => g.label).sort((a, b) => a.localeCompare(b));
  if (!allGenres.length) {
    el.chartGenreSelect.innerHTML = '';
    el.chartBody.innerHTML = '<p class="diary-empty">No genres yet — tag a release with one to see this chart.</p>';
    return;
  }

  // Pick which genre to show: the left panel's own active genre filter
  // wins if there is one (so clicking a genre there shows that genre here
  // immediately), else the last one picked here, else just the first
  // alphabetically.
  let genre = (state.navFilter && state.navFilter.mode === 'genre') ? state.navFilter.value
    : (state.chartGenre && allGenres.includes(state.chartGenre)) ? state.chartGenre
    : allGenres[0];
  if (!allGenres.includes(genre)) genre = allGenres[0];
  state.chartGenre = genre;

  el.chartGenreSelect.innerHTML = allGenres.map(g => `<option value="${escapeHtml(g)}" ${g === genre ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('');

  const data = computeChartGenreYearData(genre);
  if (!data.matched) {
    el.chartBody.innerHTML = `<p class="diary-empty">No releases tagged ${escapeHtml(genre)} yet.</p>`;
  } else if (!data.rows.length) {
    el.chartBody.innerHTML = `<p class="diary-empty">${data.matched} release${data.matched === 1 ? '' : 's'} match ${escapeHtml(genre)}, but none have a usable release date.</p>`;
  } else {
    el.chartBody.innerHTML = collectionStatBarRows(data.rows);
  }
}

function setStatsMode(mode) {
  state.statsMode = mode;
  savePrefs();
  el.statsModeListening.classList.toggle('active', mode === 'listening');
  el.statsModeCollection.classList.toggle('active', mode === 'collection');
  sndMapEl('statsModeMap').classList.toggle('active', mode === 'map');
  el.statsListeningWrap.hidden = mode !== 'listening';
  el.statsCollectionWrap.hidden = mode !== 'collection';
  sndMapEl('statsMapWrap').hidden = mode !== 'map';
  el.statsWrap.classList.toggle('stats-wide', mode === 'map');
  if (mode === 'collection') renderCollectionStats();
  if (mode === 'map') sndMapRender();
}

function renderStats() {
  el.statsModeListening.classList.toggle('active', state.statsMode !== 'collection' && state.statsMode !== 'map');
  el.statsModeCollection.classList.toggle('active', state.statsMode === 'collection');
  sndMapEl('statsModeMap').classList.toggle('active', state.statsMode === 'map');
  el.statsListeningWrap.hidden = state.statsMode === 'collection' || state.statsMode === 'map';
  el.statsCollectionWrap.hidden = state.statsMode !== 'collection';
  sndMapEl('statsMapWrap').hidden = state.statsMode !== 'map';
  el.statsWrap.classList.toggle('stats-wide', state.statsMode === 'map');
  if (state.statsMode === 'collection') { renderCollectionStats(); return; }
  if (state.statsMode === 'map') { sndMapRender(); return; }

  statsRowsCache = computeYearStats();
  el.statsDetail.hidden = true;

  if (!statsRowsCache.length) {
    el.statsYearList.innerHTML = '<p class="diary-empty">No dated listens yet — log something in your Diary or import Last.fm scrobbles to see year-by-year stats.</p>';
    return;
  }

  el.statsYearList.innerHTML = statsRowsCache.map(r => `
    <div class="stats-year-row" data-year="${escapeHtml(r.year)}">
      <span class="stats-year-label">${escapeHtml(r.year)}</span>
      <span class="stats-year-metric"><strong>${r.combinedCount}</strong> album${r.combinedCount === 1 ? '' : 's'}</span>
      <span class="stats-year-sub">${r.diaryCount} diaried · ${r.scrobbleCount} scrobbled</span>
    </div>
  `).join('');

  [...el.statsYearList.children].forEach((rowEl, i) => {
    rowEl.addEventListener('click', () => openStatsDetail(statsRowsCache[i]));
  });

  if (state.statsSelectedYear) {
    const match = statsRowsCache.find(r => r.year === state.statsSelectedYear);
    if (match) openStatsDetail(match); else state.statsSelectedYear = null;
  }
}

function openStatsDetail(row) {
  state.statsSelectedYear = row.year;
  el.statsDetail.hidden = false;
  el.statsDetailYear.textContent = row.year;

  const items = [...row.items.values()].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  el.statsDetailBody.innerHTML = items.map(it => `
    <div class="stats-detail-row" data-artist="${escapeHtml(it.artist)}" data-title="${escapeHtml(it.title)}">
      <span class="stats-detail-title">${escapeHtml(it.title)}</span>
      <span class="stats-detail-artist">${escapeHtml(it.artist)}</span>
    </div>
  `).join('');

  [...el.statsDetailBody.children].forEach(rowEl => {
    const match = state.raw.find(r => r.artist === rowEl.dataset.artist && r.title === rowEl.dataset.title);
    if (!match) return;
    rowEl.classList.add('clickable');
    rowEl.addEventListener('click', () => { switchTab('albums'); openDeck(match); });
  });

  el.statsYearList.querySelectorAll('.stats-year-row').forEach(r => r.classList.toggle('active', r.dataset.year === row.year));
}
