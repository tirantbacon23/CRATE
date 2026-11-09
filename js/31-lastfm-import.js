// CRATE — cover art, Last.fm scrobble import, background sync, startup review.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Cover art (iTunes Search API, no key required) ---------- */

function artKey(item) { return (item.artist + '::' + item.title).toLowerCase(); }

/* ================= Last.fm scrobble import =================
   Reads the user's public recent-tracks history via the Last.fm API
   (read-only, needs only an API key — no OAuth/session key required
   since we're just reading a public profile's scrobbles).

   Flow: fetch all pages -> aggregate scrobbles per (artist,title,day)
   -> match against albums already in the crate -> preview -> batch
   write matched groups to a separate 'Scrobbles' sheet via a
   'bulkLogScrobbles' backend action (chunked, since a big import can
   mean hundreds of day-groups and one POST per group would be slow).

   Scrobbles are intentionally kept OUT of the Diary — the diary is for
   your own written entries (rating + note), and scrobbles are a raw
   play-count log. They're surfaced instead via the SCROBBLES tab and
   a "Listened N times" line in the album deck.
*/

const LASTFM_CREDS_KEY = 'crate_lastfm_creds_v1';
const LASTFM_SYNC_KEY = 'crate_lastfm_lastsync_v1';
const LASTFM_CHUNK_SIZE = 150;

let lastfmMatchedGroups = [];   // [{ row, artist, title, day, playCount, firstUts, lastUts }]
let lastfmUnmatchedGroups = []; // [{ artist, title, playCount }]

function loadLastfmCreds() {
  try { return JSON.parse(localStorage.getItem(LASTFM_CREDS_KEY) || '{}'); }
  catch { return {}; }
}
function saveLastfmCreds(username, apiKey) {
  localStorage.setItem(LASTFM_CREDS_KEY, JSON.stringify({ username, apiKey }));
}

function openLastfmModal() {
  const creds = loadLastfmCreds();
  el.lastfmUsername.value = creds.username || '';
  el.lastfmApiKey.value = creds.apiKey || '';

  const lastSync = localStorage.getItem(LASTFM_SYNC_KEY + ':' + (creds.username || ''));
  if (lastSync) {
    el.lastfmSinceDate.value = lastSync.slice(0, 10);
    el.lastfmLastSync.hidden = false;
    el.lastfmLastSync.textContent = 'Last imported through ' + new Date(lastSync).toLocaleString();
  } else {
    el.lastfmSinceDate.value = '';
    el.lastfmLastSync.hidden = true;
  }

  el.lastfmSetup.hidden = false;
  el.lastfmPreview.hidden = true;
  el.lastfmFetchStatus.hidden = true;
  el.lastfmImportStatus.hidden = true;
  el.lastfmOverlay.hidden = false;
}

function closeLastfmModal() { el.lastfmOverlay.hidden = true; }

// Normalize an artist/title pair for matching. Strips edition/remaster
// noise in parentheses or brackets, punctuation, and a leading "the",
// so "Artist (The)" / "Album [Deluxe Edition]" lines up with a plainer
// catalog entry for the same release.
function lastfmNormKey(artist, title) {
  const strip = s => (s || '')
    .toLowerCase()
    .replace(/[\(\[][^)\]]*[\)\]]/g, '')   // drop (...) / [...] qualifiers
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return strip(artist) + '::' + strip(title);
}

async function fetchAllLastfmScrobbles(username, apiKey, sinceUts, statusCb) {
  const tracks = [];
  let page = 1, totalPages = 1;
  do {
    const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}`
      + `&api_key=${encodeURIComponent(apiKey)}&format=json&limit=200&page=${page}`
      + (sinceUts ? `&from=${sinceUts}` : '');
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.message || 'Last.fm API error');

    const rt = data.recenttracks || {};
    totalPages = parseInt((rt['@attr'] && rt['@attr'].totalPages) || '1', 10) || 1;
    const items = Array.isArray(rt.track) ? rt.track : (rt.track ? [rt.track] : []);

    items.forEach(t => {
      if (t['@attr'] && t['@attr'].nowplaying) return; // no timestamp, not a completed scrobble
      const uts = t.date && t.date.uts ? parseInt(t.date.uts, 10) : null;
      if (!uts) return;
      tracks.push({
        artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '',
        album: (t.album && t.album['#text']) || '',
        name: t.name || '',
        uts
      });
    });

    if (statusCb) statusCb(`Fetched page ${page} of ${totalPages} (${tracks.length} scrobbles so far)…`);
    page++;
  } while (page <= totalPages);

  return tracks;
}

function aggregateScrobbles(tracks) {
  // Group by artist + album + track + calendar day. Skip scrobbles with no
  // album tag (Last.fm doesn't always have one) since there's nothing to
  // match. Track-level granularity is what lets individual tracks show
  // their own play counts later on; use rollupByAlbumDay() below wherever
  // an album-level (not per-track) summary is needed instead.
  const groups = new Map();
  tracks.forEach(t => {
    if (!t.album) return;
    const day = new Date(t.uts * 1000).toISOString().slice(0, 10);
    const trackKey = (t.name || '').toLowerCase().trim();
    const key = lastfmNormKey(t.artist, t.album) + '::' + day + '::' + trackKey;
    if (!groups.has(key)) {
      groups.set(key, { artist: t.artist, title: t.album, track: t.name || '', day, playCount: 0, firstUts: t.uts, lastUts: t.uts });
    }
    const g = groups.get(key);
    g.playCount++;
    g.firstUts = Math.min(g.firstUts, t.uts);
    g.lastUts = Math.max(g.lastUts, t.uts);
  });
  return [...groups.values()];
}

// Sum track-level groups back up to one entry per (album, day) — used for
// the import preview and the background-sync toast, which talk about
// albums/days rather than individual tracks. Keys on `row` when present
// (matched groups, post-crate-lookup) and falls back to the normalized
// artist/title key otherwise (unmatched groups).
function rollupByAlbumDay(groups) {
  const byKey = new Map();
  groups.forEach(g => {
    const albumKey = g.row !== undefined ? g.row : lastfmNormKey(g.artist, g.title);
    const key = albumKey + '::' + g.day;
    if (!byKey.has(key)) byKey.set(key, { ...g, playCount: 0 });
    const r = byKey.get(key);
    r.playCount += g.playCount;
    r.firstUts = Math.min(r.firstUts, g.firstUts);
    r.lastUts = Math.max(r.lastUts, g.lastUts);
  });
  return [...byKey.values()];
}

function matchScrobbleGroups(groups) {
  const byKey = new Map();
  state.raw.forEach(item => byKey.set(lastfmNormKey(item.artist, item.title), item));

  const matched = [], unmatched = [];
  groups.forEach(g => {
    const hit = byKey.get(lastfmNormKey(g.artist, g.title));
    if (hit) matched.push({ ...g, row: hit.row, artist: hit.artist, title: hit.title });
    else unmatched.push(g);
  });
  return { matched, unmatched };
}

async function runLastfmFetch() {
  const username = el.lastfmUsername.value.trim();
  const apiKey = el.lastfmApiKey.value.trim();
  if (!username || !apiKey) {
    el.lastfmFetchStatus.hidden = false;
    el.lastfmFetchStatus.textContent = 'Username and API key are both required.';
    return;
  }
  saveLastfmCreds(username, apiKey);

  const sinceDate = el.lastfmSinceDate.value;
  const sinceUts = sinceDate ? Math.floor(new Date(sinceDate + 'T00:00:00Z').getTime() / 1000) : null;

  el.lastfmFetchStatus.hidden = false;
  el.lastfmFetchBtn.disabled = true;
  el.lastfmFetchStatus.textContent = 'Fetching scrobbles…';

  try {
    const tracks = await fetchAllLastfmScrobbles(username, apiKey, sinceUts, msg => { el.lastfmFetchStatus.textContent = msg; });
    if (!tracks.length) {
      el.lastfmFetchStatus.textContent = 'No scrobbles found for that range.';
      el.lastfmFetchBtn.disabled = false;
      return;
    }
    const groups = aggregateScrobbles(tracks);
    const { matched, unmatched } = matchScrobbleGroups(groups);
    lastfmMatchedGroups = matched;
    lastfmUnmatchedGroups = unmatched;
    renderLastfmPreview(tracks.length);
    el.lastfmSetup.hidden = true;
    el.lastfmPreview.hidden = false;
  } catch (err) {
    el.lastfmFetchStatus.textContent = 'Couldn\u2019t fetch from Last.fm: ' + err.message;
  } finally {
    el.lastfmFetchBtn.disabled = false;
  }
}

function renderLastfmPreview(totalScrobbles) {
  // lastfmMatchedGroups/lastfmUnmatchedGroups are per-track now; roll them
  // up to album/day for this list so it still reads the way it used to.
  const matchedRollup = rollupByAlbumDay(lastfmMatchedGroups);
  const unmatchedRollup = rollupByAlbumDay(lastfmUnmatchedGroups);

  el.lastfmSummary.textContent = `${totalScrobbles} scrobbles found \u2192 ${matchedRollup.length} album/day entries matched to your crate, ${unmatchedRollup.length} unmatched.`;

  el.lastfmMatchedCount.textContent = matchedRollup.length;
  el.lastfmUnmatchedCount.textContent = unmatchedRollup.length;

  const sortByDay = (a, b) => a.day < b.day ? 1 : -1;

  el.lastfmMatchedList.innerHTML = matchedRollup.length
    ? matchedRollup.slice().sort(sortByDay).map(g => `
        <div class="add-result-row" style="cursor:default;">
          <div class="add-result-text">
            <p class="add-result-title">${escapeHtml(g.artist)} \u2014 ${escapeHtml(g.title)}</p>
            <p class="add-result-artist">${g.day} \u00b7 ${g.playCount} track${g.playCount === 1 ? '' : 's'} played</p>
          </div>
        </div>`).join('')
    : '<p class="diary-empty">Nothing matched.</p>';

  el.lastfmUnmatchedList.innerHTML = unmatchedRollup.length
    ? unmatchedRollup.slice().sort((a, b) => b.playCount - a.playCount).map(g => `
        <div class="add-result-row" style="cursor:default;">
          <div class="add-result-text">
            <p class="add-result-title">${escapeHtml(g.artist)} \u2014 ${escapeHtml(g.title)}</p>
            <p class="add-result-artist">${g.playCount} track${g.playCount === 1 ? '' : 's'} scrobbled \u2014 not in crate</p>
          </div>
        </div>`).join('')
    : '<p class="diary-empty">Everything matched \u2014 nice.</p>';
}

async function confirmLastfmImport() {
  if (!lastfmMatchedGroups.length) { closeLastfmModal(); return; }

  el.lastfmImportBtn.disabled = true;
  el.lastfmImportStatus.hidden = false;

  // One row per (album, track, day) group with a play count — not per
  // individual scrobble timestamp, and not written into the Diary.
  // Scrobbles are a separate, raw play-count log; the Diary stays reserved
  // for your own rated/noted entries.
  const entries = lastfmMatchedGroups.map(g => ({
    row: g.row, artist: g.artist, title: g.title, date: g.day, track: g.track, playCount: g.playCount
  }));

  const chunks = [];
  for (let i = 0; i < entries.length; i += LASTFM_CHUNK_SIZE) chunks.push(entries.slice(i, i + LASTFM_CHUNK_SIZE));

  let done = 0;
  try {
    for (const chunk of chunks) {
      await postUpdate({ action: 'bulkLogScrobbles', entries: chunk });
      done += chunk.length;
      el.lastfmImportStatus.textContent = `Saved ${done} of ${entries.length} groups…`;
    }

    // Reflect locally without a full refetch
    entries.forEach(payload => {
      state.scrobbles.push({ row: payload.row, artist: payload.artist, title: payload.title, day: payload.date, track: payload.track, playCount: payload.playCount });
    });

    const totalPlays = entries.reduce((sum, e) => sum + e.playCount, 0);
    const newestUts = Math.max(...lastfmMatchedGroups.map(g => g.lastUts));
    const username = el.lastfmUsername.value.trim();
    localStorage.setItem(LASTFM_SYNC_KEY + ':' + username, new Date(newestUts * 1000).toISOString());

    el.lastfmImportStatus.textContent = `Done \u2014 ${totalPlays} plays across ${entries.length} album/day groups saved to Scrobbles.`;
    if (state.activeTab === 'scrobbles') renderScrobbles();
    if (state.rightPanelShowHistory) renderLastfmHistoryPanel();
    if (activeItem) {
      const scrobbleTotal = scrobbleCountFor(activeItem.artist, activeItem.title);
      if (scrobbleTotal > 0) {
        el.deckScrobbleCount.textContent = `Listened ${scrobbleTotal} time${scrobbleTotal === 1 ? '' : 's'} (Last.fm)`;
        el.deckScrobbleCount.hidden = false;
      }
    }
  } catch (err) {
    el.lastfmImportStatus.textContent = 'Import failed partway (' + done + ' groups saved): ' + err.message;
  } finally {
    el.lastfmImportBtn.disabled = false;
  }
}

/* ---------- Silent background sync ---------- */
/* Runs once per page load if credentials + a prior manual import both
   already exist (so the very first import is always the deliberate,
   reviewable one via the modal — background sync only ever pulls
   NEW scrobbles since that baseline, it never does a first full-history
   pull on its own). Never opens the modal, never blocks the UI; reports
   through the quiet corner toast instead. */

let lastfmBackgroundSyncRunning = false;

function flashGlobalToast(msg, opts) {
  opts = opts || {};
  el.globalToast.textContent = msg;
  el.globalToast.hidden = false;
  el.globalToast.classList.toggle('clickable', !!opts.onClick);
  el.globalToast.onclick = opts.onClick || null;
  requestAnimationFrame(() => el.globalToast.classList.add('show'));
  clearTimeout(flashGlobalToast._t);
  flashGlobalToast._t = setTimeout(() => {
    el.globalToast.classList.remove('show');
    setTimeout(() => { if (!el.globalToast.classList.contains('show')) el.globalToast.hidden = true; }, 250);
  }, opts.duration || 5000);
}

/* ---------- Last.fm startup review ----------
   At boot the app already fetched your new Last.fm scrobbles, logged the ones for albums in your crate, and toasted a count
   of the rest. Those others were then forgotten. Now they are KEPT (per Last.fm user, in this browser), re-matched at every
   boot in case you've since added the album, and shown in a review: what you played, what's already logged, and the albums
   that aren't in your crate yet, each with Add... / Ignore, or tick several and Add selected. Adding goes through the normal
   Add modal, pre-searched, one album at a time with a "2 of 4" bar (Skip / Stop); after each album is added its stored plays
   are logged to Scrobbles automatically. "Decide later" (or closing) snoozes the review for 12 hours unless NEW unmatched
   albums turn up. A setting in the menu turns the startup review off (the old toast then points at it). */
const LFR_STATE_KEY = 'crate_lastfm_review_v1', LFR_PENDING_CAP = 3000, LFR_SNOOZE_MS = 12 * 3600 * 1000;
let lfrState = null, lfAddQueue = null;
function lfLoadState(user) {
  try { const s = (JSON.parse(localStorage.getItem(LFR_STATE_KEY) || '{}') || {})[user] || {}; return { groups: Array.isArray(s.groups) ? s.groups : [], ignored: Array.isArray(s.ignored) ? s.ignored : [], snoozeUntil: s.snoozeUntil || 0 }; }
  catch (e) { return { groups: [], ignored: [], snoozeUntil: 0 }; }
}
function lfSaveState(user, st) {
  try { const all = JSON.parse(localStorage.getItem(LFR_STATE_KEY) || '{}') || {}; all[user] = st; localStorage.setItem(LFR_STATE_KEY, JSON.stringify(all)); } catch (e) { /* storage full or blocked: it just won't be remembered */ }
}
async function lfLogGroups(groups) {      // writes matched track-level groups to the Scrobbles sheet (as the import does) and refreshes what's on screen
  if (!groups.length) return 0;
  const entries = groups.map(g => ({ row: g.row, artist: g.artist, title: g.title, date: g.day, track: g.track, playCount: g.playCount }));
  for (let i = 0; i < entries.length; i += LASTFM_CHUNK_SIZE) await postUpdate({ action: 'bulkLogScrobbles', entries: entries.slice(i, i + LASTFM_CHUNK_SIZE) });
  entries.forEach(p => state.scrobbles.push({ row: p.row, artist: p.artist, title: p.title, day: p.date, track: p.track, playCount: p.playCount }));
  if (state.activeTab === 'scrobbles') renderScrobbles();
  if (activeItem) {
    const total = scrobbleCountFor(activeItem.artist, activeItem.title);
    if (total > 0) { el.deckScrobbleCount.textContent = `Listened ${total} time${total === 1 ? '' : 's'} (Last.fm)`; el.deckScrobbleCount.hidden = false; }
    loadTracklist(activeItem);
  }
  if (state.rightPanelShowHistory) renderLastfmHistoryPanel();
  return entries.reduce((sum, e) => sum + e.playCount, 0);
}
function lfSyncToast(user, sync) {          // used when the review isn't shown (switched off, or snoozed): the toast opens it
  const n = sync.newUnmatched, pl = sync.loggedPlays, open = () => openLastfmReview(user, sync);
  if (pl && !n) flashGlobalToast(`Last.fm: synced ${pl} new play${pl === 1 ? '' : 's'}.`);
  else if (pl && n) flashGlobalToast(`Last.fm: synced ${pl} new play${pl === 1 ? '' : 's'} \u00b7 ${n} album${n === 1 ? '' : 's'} not in your crate \u2014 click to review`, { onClick: open, duration: 8000 });
  else if (n) flashGlobalToast(`Last.fm: ${n} new album${n === 1 ? '' : 's'} scrobbled but not in your crate \u2014 click to review`, { onClick: open, duration: 8000 });
}
async function maybeRunBackgroundLastfmSync() {
  if (!crateIsMain()) return;                                       // (1.93.4) one window syncs
  if (lastfmBackgroundSyncRunning) return;
  const creds = loadLastfmCreds();
  if (!creds.username || !creds.apiKey) return;                 // never configured — nothing to do
  const syncKey = LASTFM_SYNC_KEY + ':' + creds.username;
  const lastSync = localStorage.getItem(syncKey);
  if (!lastSync) return;                                        // no baseline yet — wait for a deliberate first import via the modal
  if (!state.raw.length) return;                                // nothing to match against
  const sinceUts = Math.floor(new Date(lastSync).getTime() / 1000) + 1;   // one past the last-synced scrobble
  lastfmBackgroundSyncRunning = true;
  try {
    const tracks = await fetchAllLastfmScrobbles(creds.username, creds.apiKey, sinceUts, null);
    const groups = tracks.length ? aggregateScrobbles(tracks) : [];
    const { matched, unmatched } = matchScrobbleGroups(groups);
    // What isn't in the crate is KEPT, merged with what was kept before, and re-matched: some may have been added since.
    const st = lfLoadState(creds.username);
    const ignoredKeys = new Set(st.ignored);                      // plays of an album you chose to ignore are discarded, not stored out of sight
    st.groups = lfMergePending(st.groups, unmatched.filter(g => !ignoredKeys.has(lastfmNormKey(g.artist, g.title))), lastfmNormKey, LFR_PENDING_CAP);
    const re = matchScrobbleGroups(st.groups);
    st.groups = re.unmatched;
    const toLog = matched.concat(re.matched);
    const loggedPlays = await lfLogGroups(toLog);
    lfSaveState(creds.username, st);                           // only after the log succeeded: a failure keeps everything for next time
    if (tracks.length) localStorage.setItem(syncKey, new Date(Math.max(...tracks.map(t => t.uts)) * 1000).toISOString());
    const sync = { since: lastSync, totalTracks: tracks.length, noAlbum: tracks.filter(t => !t.album).length, loggedPlays, loggedAlbums: lfLoggedAlbums(toLog),
      newUnmatched: lfAlbumsFromGroups(unmatched, lastfmNormKey, st.ignored).length };
    const pending = lfAlbumsFromGroups(st.groups, lastfmNormKey, st.ignored);
    if (state.lastfmReviewAtStartup && pending.length && (sync.newUnmatched > 0 || !lfIsSnoozed(st, Date.now()))) openLastfmReview(creds.username, sync);
    else lfSyncToast(creds.username, sync);
    try { localStorage.setItem(JOBS_LF_AT_KEY, String(Date.now())); } catch (e) { /* the next 6-hourly sync waits for a reload */ }
    if (tracks.length) jobsDone('lastfm', `Last.fm sync: ${jobsPl(tracks.length, 'new play')}, ${jobsPl(Number(loggedPlays) || 0, 'play')} logged`);
    if (state.rightPanelShowHistory) renderLastfmHistoryPanel();
  } catch (err) {
    console.warn('Background Last.fm sync failed:', err);      // stays silent in the UI — a failed background sync shouldn't interrupt anyone
  } finally {
    lastfmBackgroundSyncRunning = false;
  }
}
function lfrDay(uts) { return new Date(uts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
function lfrPlural(n, w) { return `${n} ${w}${n === 1 ? '' : 's'}`; }
function openLastfmReview(user, sync) {
  const st = lfLoadState(user), albums = lfAlbumsFromGroups(st.groups, lastfmNormKey, st.ignored);
  if (!albums.length && !(sync && sync.loggedPlays)) return;
  lfrState = { user, sync: sync || null, albums, selected: new Set() };
  el.lfrOverlay.hidden = false;
  if (!el.lfrOverlay.dataset.bound) lfrBind();
  lfrRender();
}
function closeLastfmReview(snooze) {
  if (!el.lfrOverlay || el.lfrOverlay.hidden) return;
  if (lfrState && snooze !== false) { const st = lfLoadState(lfrState.user); st.snoozeUntil = Date.now() + LFR_SNOOZE_MS; lfSaveState(lfrState.user, st); }
  el.lfrOverlay.hidden = true; lfrState = null;
}
function lfrRender() {
  const st = lfrState; if (!st) return;
  const s = st.sync, albums = st.albums, plays = albums.reduce((n, a) => n + a.plays, 0);
  el.lfrSub.textContent = s && s.since ? 'Last.fm \u00b7 since ' + new Date(s.since).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Last.fm';
  const parts = [];
  if (s && s.totalTracks) parts.push(`You played <b>${lfrPlural(s.totalTracks, 'track')}</b> on Last.fm since your last visit.`);
  if (s && s.loggedPlays) parts.push(`<b>${lfrPlural(s.loggedPlays, 'play')}</b> from <b>${lfrPlural(s.loggedAlbums.length, 'album')}</b> in your crate ${s.loggedAlbums.length === 1 ? 'was' : 'were'} added to Scrobbles.`);
  parts.push(albums.length ? `<b>${lfrPlural(albums.length, 'album')}</b> (${lfrPlural(plays, 'play')}) ${albums.length === 1 ? 'isn\u2019t' : 'aren\u2019t'} in your crate yet.` : 'Everything you played is in your crate.');
  if (s && s.noAlbum) parts.push(`${lfrPlural(s.noAlbum, 'play')} had no album on Last.fm, so ${s.noAlbum === 1 ? 'it' : 'they'} can\u2019t be matched.`);
  el.lfrSummary.innerHTML = parts.join(' ');
  el.lfrList.innerHTML = albums.map(a => {
    const names = a.tracks.map(t => t.name), shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : ''), on = st.selected.has(a.key);
    return `<div class="lfr-row${on ? ' picked' : ''}" data-key="${escapeHtml(a.key)}"><label class="lfr-check"><input type="checkbox" data-lfr="pick"${on ? ' checked' : ''} aria-label="Select ${escapeHtml(a.artist)} \u2014 ${escapeHtml(a.album)}"></label>
      <div class="lfr-main"><span class="lfr-title">${escapeHtml(a.artist)} \u2014 ${escapeHtml(a.album)}</span><span class="lfr-meta">${lfrPlural(a.tracks.length, 'track')} \u00b7 ${lfrPlural(a.plays, 'play')} \u00b7 last played ${lfrDay(a.lastUts)}</span><span class="lfr-tracks" title="${escapeHtml(names.join(', '))}">${escapeHtml(shown)}</span></div>
      <div class="lfr-actions"><button type="button" class="ai-link-btn" data-lfr="add">Add\u2026</button><button type="button" class="ai-link-btn" data-lfr="ignore">Ignore</button></div></div>`;
  }).join('');
  const logged = s && s.loggedAlbums && s.loggedAlbums.length ? s.loggedAlbums : [];
  el.lfrLoggedWrap.hidden = !logged.length;
  el.lfrLoggedSummary.textContent = `In your crate \u2014 ${lfrPlural(logged.length, 'album')}, ${lfrPlural(s ? s.loggedPlays : 0, 'play')} added to Scrobbles`;
  el.lfrLogged.innerHTML = logged.map(a => `<div class="lfr-logged-row">${escapeHtml(a.artist)} \u2014 ${escapeHtml(a.title)} <span>\u00b7 ${lfrPlural(a.plays, 'play')}</span></div>`).join('');
  const n = st.selected.size;
  el.lfrAdd.textContent = n ? `Add ${n} selected\u2026` : 'Add selected\u2026'; el.lfrAdd.disabled = !n;
  el.lfrIgnore.disabled = !n; el.lfrIgnore.hidden = !albums.length; el.lfrAdd.hidden = !albums.length;
  el.lfrSelectAll.hidden = !albums.length; el.lfrSelectAll.textContent = n === albums.length ? 'Select none' : 'Select all';
}
function lfrIgnore(keys) {
  const st = lfrState; if (!st || !keys.length) return;
  const saved = lfLoadState(st.user), set = new Set(keys);
  saved.ignored = [...new Set(saved.ignored.concat(keys))];
  saved.groups = saved.groups.filter(g => !set.has(lastfmNormKey(g.artist, g.title)));
  lfSaveState(st.user, saved);
  st.albums = st.albums.filter(a => !set.has(a.key)); keys.forEach(k => st.selected.delete(k));
  flashGlobalToast(`Ignored ${lfrPlural(keys.length, 'album')} \u2014 Last.fm won\u2019t ask about ${keys.length === 1 ? 'it' : 'them'} again.`);
  if (!st.albums.length && !(st.sync && st.sync.loggedPlays)) closeLastfmReview(false); else lfrRender();
}
function lfrBind() {
  const ov = el.lfrOverlay; ov.dataset.bound = '1';
  el.lfrClose.addEventListener('click', () => closeLastfmReview());
  el.lfrLater.addEventListener('click', () => closeLastfmReview());
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeLastfmReview(); });
  el.lfrSelectAll.addEventListener('click', () => { const st = lfrState; st.selected = st.selected.size === st.albums.length ? new Set() : new Set(st.albums.map(a => a.key)); lfrRender(); });
  el.lfrIgnore.addEventListener('click', () => lfrIgnore([...lfrState.selected]));
  el.lfrAdd.addEventListener('click', () => lfStartAddQueue(lfrState.albums.filter(a => lfrState.selected.has(a.key))));
  ov.addEventListener('change', (e) => { const t = e.target.closest('[data-lfr="pick"]'); if (!t || !lfrState) return; const key = t.closest('.lfr-row').dataset.key; if (t.checked) lfrState.selected.add(key); else lfrState.selected.delete(key); lfrRender(); });
  ov.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lfr]'); if (!t || !lfrState) return;
    const row = t.closest('.lfr-row'); if (!row) return;
    const a = lfrState.albums.find(x => x.key === row.dataset.key);
    if (t.dataset.lfr === 'add' && a) lfStartAddQueue([a]);
    else if (t.dataset.lfr === 'ignore' && a) lfrIgnore([a.key]);
  });
}
function lfStartAddQueue(albums) {
  if (!albums.length || !lfrState) return;
  const user = lfrState.user;
  closeLastfmReview(false);
  lfAddQueue = { user, items: albums, idx: 0, added: 0, skipped: 0, advancing: false };
  lfOpenNextAdd();
}
function lfOpenNextAdd() {
  const q = lfAddQueue; if (!q) return;
  if (q.idx >= q.items.length) { lfQueueEnd('done'); return; }
  const a = q.items[q.idx]; q.advancing = false;
  openAddModal();
  el.addSearchInput.value = `${a.artist} ${a.album}`.trim();
  doAddSearch();
  el.addLastfmBar.hidden = false;
  el.addLastfmBar.innerHTML = `<span>Last.fm review \u00b7 ${q.idx + 1} of ${q.items.length} \u2014 ${escapeHtml(a.artist)} \u2014 ${escapeHtml(a.album)}</span><button type="button" class="ai-link-btn" data-lfq="skip">Skip</button><button type="button" class="ai-link-btn" data-lfq="stop">Stop</button>`;
}
function lfQueueEnd(reason) {
  const q = lfAddQueue; lfAddQueue = null;
  if (el.addLastfmBar) { el.addLastfmBar.hidden = true; el.addLastfmBar.innerHTML = ''; }
  if (!q) return;
  const left = q.items.length - q.idx;
  if (reason === 'done') flashGlobalToast(`Last.fm review done \u2014 ${q.added} added${q.skipped ? `, ${q.skipped} skipped` : ''}.`);
  else if (left > 0) flashGlobalToast(`Last.fm review stopped \u2014 ${lfrPlural(left, 'album')} still waiting; ${left === 1 ? 'it' : 'they'}\u2019ll be back in your next review.`);
}
function lfOnAddClosed() { if (lfAddQueue && !lfAddQueue.advancing) lfQueueEnd('closed'); }     // closing the Add modal yourself ends the queue
async function lfAfterAdd() {
  const creds = loadLastfmCreds();
  if (creds.username) {
    try {
      const st = lfLoadState(creds.username);
      if (st.groups.length) {
        const re = matchScrobbleGroups(st.groups);                 // the catalogue has just been refetched: anything now in it gets its plays logged
        if (re.matched.length) {
          const plays = await lfLogGroups(re.matched);
          st.groups = re.unmatched; lfSaveState(creds.username, st);
          const names = [...new Set(re.matched.map(g => g.title))];
          flashGlobalToast(`Last.fm: logged ${lfrPlural(plays, 'play')} for \u201c${names[0]}\u201d${names.length > 1 ? ` and ${names.length - 1} more` : ''}.`);
          if (lfAddQueue) lfAddQueue.added++;
        }
      }
    } catch (e) { console.warn('Logging plays for the new album failed:', e); }
  }
  if (lfAddQueue) { lfAddQueue.idx++; lfOpenNextAdd(); }
}
function initLastfmReview() {
  if (el.menuLastfmReview) {
    el.menuLastfmReview.setAttribute('aria-pressed', state.lastfmReviewAtStartup ? 'true' : 'false');
    el.menuLastfmReview.addEventListener('click', () => {
      state.lastfmReviewAtStartup = !state.lastfmReviewAtStartup; savePrefs(); el.menuLastfmReview.setAttribute('aria-pressed', state.lastfmReviewAtStartup ? 'true' : 'false');
      el.layoutMenu.hidden = true; flashGlobalToast(`Last.fm review at startup: ${state.lastfmReviewAtStartup ? 'on' : 'off'}.`);
    });
  }
  if (el.addLastfmBar) el.addLastfmBar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lfq]'); const q = lfAddQueue; if (!b || !q) return;
    if (b.dataset.lfq === 'stop') lfQueueEnd('stopped');          // the Add form stays open for this album; just no more queue
    else if (b.dataset.lfq === 'skip') { q.skipped++; q.idx++; q.advancing = true; closeAddModal(); lfOpenNextAdd(); }
  });
}

function prefetchArt(items) {
  const queue = items.slice();
  const concurrency = 4;
  let active = 0;

  function next() {
    if (queue.length === 0) return;
    if (active >= concurrency) return;
    const item = queue.shift();
    active++;
    fetchArt(item).finally(() => { active--; next(); });
    next();
  }
  for (let i = 0; i < concurrency; i++) next();
}

// iTunes cover lookups take turns, at most ART_LOOKUPS_AT_ONCE (declared above startApp) at a time across the whole page. Every card without a
// cover used to start its own lookup the moment it was drawn, so a big crate fired thousands at once: iTunes refuses
// that many (and the release got a placeholder), and the tracklist lookups behind them — playing a genre — had to wait.
function artLookupSlot() {
  return new Promise(resolve => { artLookupWaiting.push(resolve); artLookupNext(); });
}
function artLookupNext() {
  while (artLookupsActive < ART_LOOKUPS_AT_ONCE && artLookupWaiting.length) { artLookupsActive++; artLookupWaiting.shift()(); }
}
function artLookupDone() { artLookupsActive--; artLookupNext(); }

async function fetchArt(item) {
  const key = artKey(item);
  
  if (item.cover) {
    state.artCache[key] = { art: item.cover, collectionId: null };
    applyCachedArtFor(key);
    artFetchInFlight.delete(key);
    return;
  }
  
  if (state.artCache[key]) { artFetchInFlight.delete(key); return applyCachedArtFor(key); }
  await artLookupSlot();
  try {
    // Another lookup for the same release (prefetchArt and a card both ask) may have finished while this one waited.
    if (!state.artCache[key]) {
      const hit = await findItunesAlbum(item);
      if (hit && hit.artworkUrl100) {
        state.artCache[key] = { art: hit.artworkUrl100.replace('100x100', '600x600'), collectionId: hit.collectionId };
      } else {
        state.artCache[key] = { art: placeholderArt(item), collectionId: null };
      }
    }
  } catch (e) {
    state.artCache[key] = { art: placeholderArt(item), collectionId: null };
  } finally { artLookupDone(); }
  artFetchInFlight.delete(key);
  applyCachedArtFor(key);
}

// Recovery for an <img class="art"> that actually FAILED to load — a
// release "having" a Cover URL doesn't guarantee the image behind it
// still exists: Cover Art Archive/MusicBrainz images get replaced or
// removed by other editors, iTunes CDN links occasionally expire. Before
// this, that case had zero fallback at all — fetchArt() above only ever
// runs its iTunes lookup when item.cover is blank in the first place, so
// a populated-but-now-dead Cover URL just showed broken, silently,
// forever. Wired up as a single delegated listener (see bindEvents) that
// catches every art image everywhere in the app, not just one view.
// badArtUrls (declared up near startApp() — see that comment) tracks the
// URL that already failed for a given key so a permanently-dead link
// doesn't get retried every re-render, while still allowing a genuinely
// NEW failure (e.g. after editing in a different cover, or if the
// fallback itself later goes bad) to attempt recovery again, since it'll
// be a different failed URL.
async function recoverFailedArt(key) {
  const item = state.raw.find(r => artKey(r) === key);
  if (!item) return;
  try {
    const hit = await findItunesAlbum(item);
    state.artCache[key] = hit && hit.artworkUrl100
      ? { art: hit.artworkUrl100.replace('100x100', '600x600'), collectionId: hit.collectionId }
      : { art: placeholderArt(item), collectionId: null };
  } catch (e) {
    state.artCache[key] = { art: placeholderArt(item), collectionId: null };
  }
  applyCachedArtFor(key);
}

// One pass over the art images on the page, each looked up in the cache. It used to be one whole-page search
// PER CACHED COVER, which with a few thousand releases on screen took over 20 seconds every time the grid was drawn.
function applyCachedArt(onlyKeys) {
  document.querySelectorAll('img.art[data-key]').forEach(img => {
    const key = img.dataset.key;
    if (onlyKeys && !onlyKeys.has(key)) return;
    const url = state.artCache[key]?.art;
    if (url && img.src !== url) img.src = url;
  });
  const deckKey = activeItem ? artKey(activeItem) : null;
  const deckUrl = deckKey && (!onlyKeys || onlyKeys.has(deckKey)) ? state.artCache[deckKey]?.art : null;
  if (deckUrl) el.deckImg.src = deckUrl;
}

// A cover that just arrived (the startup prefetch fetches every release's) is put on the page with the others that
// arrived within the same moment, in one applyCachedArt pass, rather than with a whole-page search of its own.
function applyCachedArtFor(key) {
  if (!state.artCache[key]?.art) return;
  if (!artApplyPending) {
    artApplyPending = new Set();
    setTimeout(() => { const keys = artApplyPending; artApplyPending = null; applyCachedArt(keys); }, 30);
  }
  artApplyPending.add(key);
}

function placeholderArt(item) {
  const initials = (item.artist.match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
      <rect width="600" height="600" fill="#1B212B"/>
      <text x="50%" y="52%" font-family="IBM Plex Mono, monospace" font-size="180"
        fill="#D6A24C" text-anchor="middle" dominant-baseline="middle">${initials}</text>
    </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}
