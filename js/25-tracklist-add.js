// CRATE — tracklist lookup, Add album.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Tracklist (iTunes lookup, best-effort) ---------- */

// Tracks currently rendered in the deck's tracklist, kept alongside the
// active item so the per-track "listened" toggle handler can re-render
// without re-fetching from iTunes, and so it can tell when every track
// in the album has been marked -- at which point a full-album listen is
// logged to the Diary automatically (see handleFullAlbumComplete below).
let currentTracklistTracks = [];

async function loadTracklist(item) {
  el.deckTracklist.innerHTML = '<p class="tracklist-status">Looking up tracklist\u2026</p>';

  // A manually-typed tracklist (see the Add/Edit forms' tracklist builder)
  // always wins over the iTunes/MusicBrainz auto-lookup below — it exists
  // specifically for albums that lookup can't find, or where you want your
  // own YouTube links attached per track.
  if (isManualAlbum(item)) {
    const tracks = item.manualTracks.map(t => ({
      trackNumber: t.trackNumber,
      trackName: t.title,
      trackTimeMillis: t.durationMs || null, section: t.section || '', s: t.s || '',
      youtubeLink: t.youtubeLink || ''
    }));
    mergeTrackLinkOverrides(item, tracks);
    const year = dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : '';
    const metaParts = [year, genreDisplayStr(item), item.region, item.label].filter(Boolean);
    const recordedMeta = formatRecordedDate(item);
    if (recordedMeta) metaParts.push('Recorded ' + recordedMeta);
    el.deckMeta.textContent = metaParts.join(' \u00b7 ');
    currentTracklistTracks = tracks;
    renderTracklistBody(item, tracks);
    return;
  }

  try {
    const tracks = await getTracksFor(item);
    if (activeItem !== item) return;
    if (tracks.length === 0) {
      currentTracklistTracks = [];
      el.deckTracklist.innerHTML = '<p class="tracklist-status">No tracklist found.</p>';
      return;
    }

    const year = dateVal(item.releaseDate) !== -Infinity ? new Date(item.releaseDate).getUTCFullYear() : '';
    const metaParts = [year, genreDisplayStr(item), item.region, item.label].filter(Boolean);
    const recordedMeta = formatRecordedDate(item);
    if (recordedMeta) metaParts.push('Recorded ' + recordedMeta);
    el.deckMeta.textContent = metaParts.join(' \u00b7 ');

    currentTracklistTracks = tracks;
    renderTracklistBody(item, tracks);
  } catch (err) {
    if (activeItem === item) el.deckTracklist.innerHTML = '<p class="tracklist-status">Error loading tracks.</p>';
  }
}

// Renders the tracklist markup (rows + footer) from already-fetched tracks.
// Split out from loadTracklist so the "mark as listened" toggle can refresh
// the checkmarks/progress in place after a click, with no re-fetch.
// Parses the Track Properties editor's "Name — Role(s)" one-per-line
// credits format into {name, role} entries for RYM-style display — see
// renderTracklistBody's own use of this, and the reference screenshots
// this was built from. Delimiter is an em-dash or en-dash specifically
// (not a plain hyphen) — a hyphenated name like "Jean-Paul Smith" would
// otherwise get its own hyphen mistaken for the split point. A line with
// no recognizable delimiter is treated as a bare name with no role,
// rather than dropped.
function parseTrackCredits(raw) {
  if (!raw) return [];
  return raw.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.*?)\s*[\u2014\u2013]\s*(.*)$/);
    return (m && m[2]) ? { name: m[1].trim(), role: m[2].trim() } : { name: line, role: '' };
  });
}

function renderTracklistBody(item, tracks) {
  const totalMs = tracks.reduce((sum, t) => sum + (t.trackTimeMillis || 0), 0);
  const totalTimeStr = formatDuration(totalMs);

  let listenedCount = 0;
  let anyCredits = false;

  let lastSection = '';
  let html = tracks.map((t, pos) => {
    const tNum = t.trackNumber || 0;
    const tData = (item.trackData && item.trackData[tNum]) ? item.trackData[tNum] : {};
    const rating = tData.rating || 0;
    const note = tData.note || '';
    const genre = tData.genre || '';
    const credits = parseTrackCredits(tData.credits);
    if (credits.length) anyCredits = true;
    const listened = !!tData.listened;
    if (listened) listenedCount++;
    const scrobbleCount = trackScrobbleCountFor(item.artist, item.title, t.trackName);
    const rowKey = `${item.row}::${tNum}`;
    const selected = state.selectedTracks.has(rowKey);

    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      const fillPctInit = fillPct(fillForIndex(rating, i - 1));
      starsHtml += `<button type="button" class="track-star-btn" data-track="${tNum}" data-val="${i}"><span class="star-glyph"><span class="star-back">\u2606</span><span class="star-front" style="width:${fillPctInit}%">\u2605</span></span></button>`;
    }

    // Manually-added albums skip the Spotify play button entirely — see
    // isManualAlbum(). These exist because the auto-lookup couldn't find
    // the release, so a fuzzy Spotify track search would just as often
    // return a confidently-wrong unrelated track as the right one. A
    // YouTube link (if the person added one) is the only playback option.
    const manual = isManualAlbum(item);
    const sec = t.section || '', secHtml = sec && sec !== lastSection ? `<div class="track-section-header">${escapeHtml(sec)}</div>` : ''; lastSection = sec;
    return `${secHtml}
      <div class="track-row-wrap${selected ? ' selected' : ''}" data-track="${tNum}" data-track-key="${rowKey}">
        <div class="track-row">
          <span class="track-num">${pos + 1}</span>
          <div class="track-info-main">
             ${(!manual || t.spotifyLink) ? `<button type="button" class="track-play-btn" data-track-name="${escapeHtml(t.trackName || '')}" title="Play on Spotify" aria-label="Play ${escapeHtml(t.trackName || '')} on Spotify">\u25b6</button>` : ''}
             ${t.youtubeLink ? `<button type="button" class="track-play-yt-btn" data-youtube-link="${escapeHtml(t.youtubeLink)}" data-track-name="${escapeHtml(t.trackName || '')}" title="Play on YouTube" aria-label="Play ${escapeHtml(t.trackName || '')} on YouTube">▶ YT</button>` : ''}
             ${t.soundcloudLink ? `<a class="track-play-sc-btn" href="${escapeHtml(t.soundcloudLink)}" target="_blank" rel="noopener noreferrer" title="Open on SoundCloud" aria-label="Open ${escapeHtml(t.trackName || '')} on SoundCloud">SC ↗</a>` : ''}
             ${songFlagHtml(item, t)}<span class="track-name${rymBoldTrackClass(t)}">${escapeHtml(t.trackName || '')}</span>
             ${scrobbleCount > 0 ? `<span class="track-scrobble-count" title="Last.fm plays">${scrobbleCount} play${scrobbleCount === 1 ? '' : 's'}</span>` : ''}
             ${genre ? `<span class="track-genre-preview" title="Track genre">${escapeHtml(genre)}</span>` : ''}
             ${note ? `<span class="track-note-preview">${escapeHtml(note)}</span>` : ''}
          </div>
          <div class="track-interactive">
            <button type="button" class="track-listen-toggle ${listened ? 'listened' : ''}" data-track="${tNum}" title="${listened ? 'Remove from next diary entry' : 'Include in next diary entry'}" aria-label="${listened ? 'Remove track from selection' : 'Select track for diary entry'}" aria-pressed="${listened}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
            <div class="track-stars" data-rating="${rating}">${starsHtml}</div>
            <button type="button" class="track-note-toggle ${note ? 'has-note' : ''}" title="Add/Edit Note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <span class="track-time">${formatDuration(t.trackTimeMillis)}</span>
          </div>
        </div>
        <div class="track-note-wrap">
          <div class="track-note-inner">
            <textarea class="track-note-input" placeholder="Thoughts on this track?">${escapeHtml(note)}</textarea>
            <button type="button" class="save-track-note-btn save-btn">Save track note</button>
          </div>
        </div>
        ${credits.length ? `
        <div class="track-credits-wrap"${state.showTrackCredits ? '' : ' hidden'}>
          ${credits.map(c => `<p class="track-credit-entry"><span class="track-credit-name">${escapeHtml(c.name)}</span>${c.role ? `<span class="track-credit-role">${escapeHtml(c.role)}</span>` : ''}</p>`).join('')}
        </div>` : ''}
      </div>
    `;
  }).join('');

  // Toggles every track's credits block at once (RYM's own "Show/Hide
  // track credits" pattern, not a per-row toggle) — only shown if at
  // least one track here actually has any, same as RYM only shows the
  // link when there's something to show.
  if (anyCredits) {
    html = `<div class="tracklist-credits-toggle-row"><button type="button" id="tlToggleCreditsBtn" class="chip-btn">${state.showTrackCredits ? 'Hide' : 'Show'} track credits</button></div>` + html;
  }

  const allListened = tracks.length > 0 && listenedCount === tracks.length;
  html += `${tlSourceLine(item)}`;
  html += `
    <div class="tracklist-footer">
      <span class="track-total-label">Total Duration</span>
      <span>${tracks.length} tracks \u00b7 ${totalTimeStr}</span>
    </div>
    <div class="tracklist-select-actions">
      <button type="button" id="tlSelectAllBtn" class="chip-btn">Select all</button>
      <button type="button" id="tlClearSelectionBtn" class="chip-btn" ${listenedCount ? '' : 'disabled'}>Clear selection</button>
      <button type="button" id="tlAddTrackBtn" class="chip-btn">+ Add track</button>
      <button type="button" id="tlMatchSongsBtn" class="chip-btn" title="Find Spotify and YouTube links for every song at once">Match songs…</button>
    </div>
    <div class="tracklist-listen-progress ${allListened ? 'complete' : ''}">
      <div class="tlp-bar"><div class="tlp-fill" style="width:${tracks.length ? (listenedCount / tracks.length * 100) : 0}%"></div></div>
      <span class="tlp-label">${listenedCount}/${tracks.length} tracks selected${allListened ? ' \u2014 whole album \u2014 hit \u201cLog a listen\u201d to save it' : ''}</span>
    </div>
  `;

  el.deckTracklist.innerHTML = html;
  renderLogTrackSummary();
}

// Toggles a track's checkmark. The checkmark now does double duty as BOTH
// "I've heard this track" and "include this track in the diary entry I'm
// about to save" -- ticking off a couple of tracks and hitting "Log a
// listen" logs a partial listen naming just those tracks; ticking every
// track (or using "Select all") and logging captures a full-album listen.
// Nothing is saved to the Diary automatically here -- see saveLogEntry().
async function toggleTrackListened(item, trackNum) {
  const wasListened = !!(item.trackData && item.trackData[trackNum] && item.trackData[trackNum].listened);
  const nowListened = !wasListened;

  // Optimistic update: flip the local state and re-render immediately so
  // the click feels instant, then let the save to the sheet happen in the
  // background (it's a slow Apps Script round-trip). If it fails, roll the
  // local state back and re-render again so the UI matches what's saved.
  if (!item.trackData) item.trackData = {};
  if (!item.trackData[trackNum]) item.trackData[trackNum] = {};
  if (nowListened) item.trackData[trackNum].listened = true;
  else delete item.trackData[trackNum].listened;
  if (!item.trackData[trackNum].rating && !item.trackData[trackNum].note && !item.trackData[trackNum].listened && !item.trackData[trackNum].genre && !item.trackData[trackNum].youtubeLink && !item.trackData[trackNum].spotifyLink && !item.trackData[trackNum].name && !item.trackData[trackNum].lengthMs && !item.trackData[trackNum].album && !item.trackData[trackNum].rymLink && !item.trackData[trackNum].rymRating && !item.trackData[trackNum].date && !item.trackData[trackNum].artist && !item.trackData[trackNum].albumArtist && !item.trackData[trackNum].soundcloudLink && !item.trackData[trackNum].credits) {
    delete item.trackData[trackNum];
  }

  if (activeItem === item) renderTracklistBody(item, currentTracklistTracks);

  if (nowListened && currentTracklistTracks.length) {
    const allListened = currentTracklistTracks.every(t => {
      const tNum = t.trackNumber || 0;
      return !!(item.trackData && item.trackData[tNum] && item.trackData[tNum].listened);
    });
    if (allListened) flashToast(el.deckToast, 'Whole album selected \u2014 hit \u201cLog a listen\u201d to save it');
  }

  try {
    await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData || {}) });
  } catch (err) {
    // Roll back on failure
    if (!item.trackData) item.trackData = {};
    if (!item.trackData[trackNum]) item.trackData[trackNum] = {};
    if (wasListened) item.trackData[trackNum].listened = true;
    else delete item.trackData[trackNum].listened;
    if (!item.trackData[trackNum].rating && !item.trackData[trackNum].note && !item.trackData[trackNum].listened && !item.trackData[trackNum].genre && !item.trackData[trackNum].youtubeLink && !item.trackData[trackNum].spotifyLink && !item.trackData[trackNum].name && !item.trackData[trackNum].lengthMs && !item.trackData[trackNum].album && !item.trackData[trackNum].rymLink && !item.trackData[trackNum].rymRating && !item.trackData[trackNum].date && !item.trackData[trackNum].artist && !item.trackData[trackNum].albumArtist && !item.trackData[trackNum].soundcloudLink && !item.trackData[trackNum].credits) {
      delete item.trackData[trackNum];
    }
    if (activeItem === item) renderTracklistBody(item, currentTracklistTracks);
    flashToast(el.deckToast, 'Couldn\u2019t save \u2014 try again');
  }
}

// Checks every track in the currently-loaded tracklist off, ready to log a
// full-album listen. Saves each flag individually (mirrors toggleTrackListened)
// then re-renders once.
async function selectAllTracks(item) {
  if (!item || !currentTracklistTracks.length) return;
  if (!item.trackData) item.trackData = {};

  // Flip everything locally and re-render once immediately, instead of
  // awaiting a separate network save per track (which was making "Select
  // all" take as long as N slow round-trips in a row).
  for (const t of currentTracklistTracks) {
    const tNum = t.trackNumber || 0;
    if (!item.trackData[tNum]) item.trackData[tNum] = {};
    item.trackData[tNum].listened = true;
  }
  if (activeItem === item) renderTracklistBody(item, currentTracklistTracks);

  try {
    await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData) });
  } catch (err) {
    flashToast(el.deckToast, 'Couldn\u2019t save \u2014 try again');
  }
}

// Unchecks every track -- used to abandon a selection without logging it.
async function clearTrackSelection(item) {
  if (!item || !currentTracklistTracks.length) return;
  if (!item.trackData) item.trackData = {};

  for (const t of currentTracklistTracks) {
    const tNum = t.trackNumber || 0;
    if (item.trackData[tNum]) {
      delete item.trackData[tNum].listened;
      if (!item.trackData[tNum].rating && !item.trackData[tNum].note && !item.trackData[tNum].genre && !item.trackData[tNum].youtubeLink && !item.trackData[tNum].spotifyLink && !item.trackData[tNum].name && !item.trackData[tNum].lengthMs && !item.trackData[tNum].album && !item.trackData[tNum].rymLink && !item.trackData[tNum].date && !item.trackData[tNum].artist && !item.trackData[tNum].albumArtist && !item.trackData[tNum].soundcloudLink && !item.trackData[tNum].credits) delete item.trackData[tNum];
    }
  }
  if (activeItem === item) renderTracklistBody(item, currentTracklistTracks);

  try {
    await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData) });
  } catch (err) {
    flashToast(el.deckToast, 'Couldn\u2019t save \u2014 try again');
  }
}

// Reads which tracks are currently checked off for an item, returning
// [{num, name}] in tracklist order. Used both to build a diary entry's
// `tracks` payload and to render the live summary in the log form.
function getSelectedTracksForItem(item) {
  if (!item || !currentTracklistTracks.length) return [];
  return currentTracklistTracks
    .filter(t => !!(item.trackData && item.trackData[t.trackNumber || 0] && item.trackData[t.trackNumber || 0].listened))
    .map(t => ({ num: t.trackNumber || 0, name: t.trackName || '' }));
}

// Updates the live "N tracks selected" summary shown inside the open log
// form, so it's obvious what an entry will capture before you save it.
function renderLogTrackSummary() {
  if (!el.logTrackSummary || el.logForm.hidden || !activeItem) return;
  const selected = getSelectedTracksForItem(activeItem);
  const total = currentTracklistTracks.length;
  if (!selected.length) {
    el.logTrackSummary.textContent = 'No tracks selected \u2014 check tracks off in the tracklist below, or log without track detail.';
  } else if (total && selected.length === total) {
    el.logTrackSummary.textContent = `Logging the whole album \u2014 all ${total} tracks.`;
  } else {
    el.logTrackSummary.textContent = `Logging ${selected.length} track${selected.length === 1 ? '' : 's'}: ${selected.map(t => t.name).join(', ')}`;
  }
  el.logClearSelectionBtn.disabled = !selected.length;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return m + ':' + String(s).padStart(2, '0');
}

/* ---------- Add album (search iTunes, disambiguate, confirm, save) ---------- */

// Renders the checklist in ⚙ → Panels configuration… → "add a release" —
// one checkbox per ADD_FORM_FIELD_OPTIONS entry, reflecting/updating
// state.addFormVisibleFields directly. Called once at init and again each
// time the Panels configuration modal opens, so it always reflects
// whatever's actually current.
