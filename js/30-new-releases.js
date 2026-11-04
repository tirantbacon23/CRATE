// CRATE — New release radar.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ===========================================================
   NEW RELEASE RADAR
   ===========================================================
   Checks Spotify for recent releases by artists already in the crate, and
   skips anything that looks already owned. Everything here is per-browser
   (localStorage) — nothing round-trips through the Apps Script backend,
   since this is discovery scaffolding on top of the existing Spotify
   client-credentials setup (getSpotifyToken), not crate data itself.

   Two costs kept deliberately small, since a big crate can mean a LOT of
   distinct artists and this has no server-side cron to spread the work
   over: (1) an artist's resolved Spotify ID (or confirmed absence of one)
   is cached indefinitely (artists don't change), so only genuinely new
   artists or ones that previously failed to resolve get re-searched; (2)
   album fetches only look back NEW_RELEASE_WINDOW_DAYS, and a background
   scan runs at most once a calendar day — see newReleaseNextAutoAt() and
   maybeAutoScanNewReleases(). "Check now" in the modal bypasses that
   limit (but still uses the artist-ID cache) since that's an explicit
   ask, not a background nicety. */

const NEW_RELEASES_ARTIST_CACHE_KEY = 'crate_new_releases_artist_cache_v1'; // normKey -> {id: string|null, checkedAt}
const NEW_RELEASES_DISMISSED_KEY = 'crate_new_releases_dismissed_v1';       // spotify album id -> dismissedAt
const NEW_RELEASES_RESULTS_KEY = 'crate_new_releases_results_v1';          // last scan's surfaced results, so reopening the modal is instant
const NEW_RELEASES_LAST_SCAN_KEY = 'crate_new_releases_last_scan_v1';      // timestamp of the last completed scan (any trigger)
const NEW_RELEASE_WINDOW_DAYS = 270; // ~9 months — catches things released while you weren't looking without dredging up an artist's whole back catalog every time
const NEW_RELEASE_ARTIST_RETRY_MS = 30 * 24 * 60 * 60 * 1000; // re-attempt an artist we previously couldn't find on Spotify after 30 days, in case they're on it now
const NEW_RELEASES_AUTO_TRIED_KEY = 'crate_new_releases_auto_tried_v1';    // when the background check last STARTED (a scan cut short by closing CRATE still counts for that day)
function newReleaseNextAutoAt() {          // the background check runs once a day: after a check (or a try) today, the next is from midnight
  const last = Math.max(Number(localStorage.getItem(NEW_RELEASES_LAST_SCAN_KEY) || 0), Number(localStorage.getItem(NEW_RELEASES_AUTO_TRIED_KEY) || 0));
  if (!last) return 0; const d = new Date(last); d.setHours(24, 0, 0, 0); return d.getTime();
}
const NEW_RELEASE_CONCURRENCY = 2; // was 4 — that "low enough to not hammer Spotify's API" assumption turned out wrong: a real report showed a cascade of consecutive 429s starting from exactly this scan. See spotifyApiFetch's own comment for the actual (reactive) fix; this reduction is the complementary (proactive) half — fewer simultaneous in-flight requests means less chance of tripping the limit in the first place, even before any single one gets a chance to report back and trigger the shared backoff.

function loadNewReleaseArtistCache() {
  try { return JSON.parse(localStorage.getItem(NEW_RELEASES_ARTIST_CACHE_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveNewReleaseArtistCache(cache) {
  try { localStorage.setItem(NEW_RELEASES_ARTIST_CACHE_KEY, JSON.stringify(cache)); }
  catch (e) { /* ignore */ }
}
function loadNewReleaseDismissed() {
  try { return JSON.parse(localStorage.getItem(NEW_RELEASES_DISMISSED_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveNewReleaseDismissed(obj) {
  try { localStorage.setItem(NEW_RELEASES_DISMISSED_KEY, JSON.stringify(obj)); }
  catch (e) { /* ignore */ }
}
function loadNewReleaseResults() {
  try { return JSON.parse(localStorage.getItem(NEW_RELEASES_RESULTS_KEY) || '[]'); }
  catch (e) { return []; }
}
function saveNewReleaseResults(results) {
  try { localStorage.setItem(NEW_RELEASES_RESULTS_KEY, JSON.stringify(results)); }
  catch (e) { /* ignore */ }
}

// Every distinct artist name across the crate, individually — a multi-
// artist row ("Jazzbois, Telemakus, Tristan Cappel") is split the same way
// the rest of the app already treats comma-joined artist credits, so each
// name gets checked for new releases on its own rather than only as that
// exact combined credit. "Various Artists"-style rows are excluded since
// there's no one specific artist to track new releases FOR.
function getDistinctCrateArtists() {
  const byKey = new Map(); // normMatchKey -> display name (first casing seen)
  state.raw.forEach(r => {
    (r.artist || '').split(',').forEach(part => {
      const name = part.trim();
      if (!name) return;
      const key = normMatchKey(name);
      if (!key || key === 'various artists' || key === 'va') return;
      if (!byKey.has(key)) byKey.set(key, name);
    });
  });
  return [...byKey.values()];
}

// Resolves (and caches) one artist's Spotify artist ID. Returns null, not
// an error, for an artist Spotify doesn't have — that's an expected,
// common outcome (see the a.s.o./Match-button saga elsewhere in this
// file's history for how often small/DIY artists just aren't on Spotify),
// not a failure worth retrying every single scan.
// Shared rate-limit handling for EVERY api.spotify.com search/lookup call
// (artist search, an artist's albums, album search, track search) — they
// all share the same client-credentials token/app-level quota, so a 429
// from ANY one of them means Spotify's rate limit has been hit globally,
// not just for that one call.
//
// A reactive-only version of this (check a timestamp, wait if already
// rate-limited, record a new wait time on 429) shipped first and turned
// out NOT enough on its own — confirmed by a follow-up report showing a
// whole burst of DIFFERENT album/track searches all still hitting 429
// together. The reason: a reactive check can only prevent requests made
// AFTER the first 429 is already known. If a batch of calls all fire in
// the same tick — before any of them has returned to actually set that
// flag — every single one sees "not rate-limited yet" and fires anyway,
// and Spotify's real limit is tight enough that even a small simultaneous
// burst trips it outright. So this is now a true one-at-a-time QUEUE
// (spotifyApiPump, which lets one run at a time) — every call is forced to
// wait for the previous one to fully finish, plus a minimum gap, before
// it's even allowed to start, regardless of how many things try to call
// this "simultaneously." That's what actually prevents the burst itself,
// rather than only reacting after the damage is done; the Retry-After-
// driven cooldown below still handles a 429 that gets through anyway.
let spotifyRateLimitedUntil = 0;
const SPOTIFY_MIN_REQUEST_GAP_MS = 150; // enforced between EVERY pair of requests, 429 or not — a burst of many calls shouldn't be able to trip the limit in the first place just by going one-at-a-time with no gap
// How many requests may be in flight at once. 1 (the queue described above) except while "Match songs for many
// releases" works on several releases at once (bmRunLane raises it to the number you chose and puts it back). Then
// the starts are spaced by SPOTIFY_PARALLEL_GAP_MS instead of waiting for each to finish, and a 429 still makes every
// one of them wait out Retry-After.
let spotifyApiParallel = 1;
const SPOTIFY_PARALLEL_GAP_MS = 80;
let spotifyApiActive = 0, spotifyApiNextStart = 0;
const spotifyApiWaiting = [];
function spotifyApiFetch(url, options) {
  return new Promise((resolve, reject) => { spotifyApiWaiting.push({ url, options, resolve, reject }); spotifyApiPump(); });
}
function spotifyApiPump() {
  while (spotifyApiActive < spotifyApiParallel && spotifyApiWaiting.length) {
    const job = spotifyApiWaiting.shift();
    spotifyApiActive++;
    (async () => {
      try {
        for (;;) {                       // wait out a 429's cool-down and the spacing; checked again after each wait, since another start may have moved them
          const waitMs = Math.max(spotifyRateLimitedUntil, spotifyApiNextStart) - Date.now();
          if (waitMs <= 0) break;
          await new Promise(r => setTimeout(r, waitMs));
        }
        spotifyApiNextStart = Date.now() + (spotifyApiParallel > 1 ? SPOTIFY_PARALLEL_GAP_MS : 0);
        const res = await fetch(job.url, job.options);
        smNet.spotify++; if (res.status === 429) smNet.spotify429++;
        if (res.status === 429) {
          const retryAfterSec = Number(res.headers.get('Retry-After'));
          spotifyRateLimitedUntil = Date.now() + (retryAfterSec > 0 ? retryAfterSec : 3) * 1000;
        } else if (spotifyApiParallel === 1) {
          spotifyRateLimitedUntil = Math.max(spotifyRateLimitedUntil, Date.now() + SPOTIFY_MIN_REQUEST_GAP_MS);
        }
        job.resolve(res);
      } catch (e) {
        job.reject(e);                   // a network error reaches whoever asked; the queue keeps moving
      } finally {
        spotifyApiActive--;
        spotifyApiPump();
      }
    })();
  }
}

async function resolveSpotifyArtistId(name, cache) {
  const key = normMatchKey(name);
  const cached = cache[key];
  if (cached && (cached.id || (Date.now() - cached.checkedAt < NEW_RELEASE_ARTIST_RETRY_MS))) {
    return cached.id;
  }
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    const res = await spotifyApiFetch(`https://api.spotify.com/v1/search?type=artist&limit=1&q=${encodeURIComponent('artist:' + name)}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) { cache[key] = { id: null, checkedAt: Date.now() }; return null; }
    const data = await res.json();
    const hit = data.artists && data.artists.items && data.artists.items[0];
    // Same reasoning as spotifyResultArtistMatches elsewhere — Spotify's
    // search is fuzzy, so confirm the name actually matches before trusting it.
    const id = (hit && normMatchKey(hit.name) === key) ? hit.id : null;
    cache[key] = { id, checkedAt: Date.now() };
    return id;
  } catch (e) {
    cache[key] = { id: null, checkedAt: Date.now() };
    return null;
  }
}

function spotifyReleaseDateToMs(dateStr, precision) {
  if (!dateStr) return 0;
  if (precision === 'year') return Date.parse(dateStr + '-01-01') || 0;
  if (precision === 'month') return Date.parse(dateStr + '-01') || 0;
  return Date.parse(dateStr) || 0;
}

// True if this artist+title combo already looks present in the crate —
// checked against every row whose Artist field CONTAINS this individual
// artist name (since a crate row's Artist can itself be a comma-joined
// multi-artist credit), not just an exact whole-field match.
function crateHasRelease(artist, title) {
  const artistKey = normMatchKey(artist);
  const titleKey = normMatchKey(title);
  if (!artistKey || !titleKey) return false;
  return state.raw.some(r => normMatchKey(r.artist).includes(artistKey) && normMatchKey(r.title) === titleKey);
}

// Runs a small worker over `items` with at most `limit` running at once —
// used here so checking dozens/hundreds of artists doesn't run fully
// sequentially (slow) or fully in parallel (hammers Spotify's API).
async function runWithConcurrency(items, limit, worker) {
  let i = 0;
  async function lane() {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

let newReleaseScanInFlight = null; // the in-progress scan's promise, so concurrent triggers (auto + manual) share one run instead of doubling up
async function runNewReleaseScan(onProgress) {
  if (newReleaseScanInFlight) return newReleaseScanInFlight;
  newReleaseScanInFlight = (async () => {
    const artists = getDistinctCrateArtists();
    const artistCache = loadNewReleaseArtistCache();
    const dismissed = loadNewReleaseDismissed();
    const cutoff = Date.now() - NEW_RELEASE_WINDOW_DAYS * 86400000;
    const found = [];

    let done = 0;
    await runWithConcurrency(artists, NEW_RELEASE_CONCURRENCY, async (artist) => {
      const id = await resolveSpotifyArtistId(artist, artistCache);
      if (id) {
        const token = await getSpotifyToken();
        if (token) {
          try {
            const res = await spotifyApiFetch(`https://api.spotify.com/v1/artists/${id}/albums?include_groups=album,single&limit=20`, {
              headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.ok) {
              const data = await res.json();
              (data.items || []).forEach(a => {
                if (spotifyReleaseDateToMs(a.release_date, a.release_date_precision) < cutoff) return;
                if (dismissed[a.id]) return;
                if (crateHasRelease(artist, a.name)) return;
                found.push({
                  id: a.id,
                  artist,
                  title: a.name,
                  releaseDate: a.release_date,
                  type: a.album_type,
                  image: ((a.images && (a.images[1] || a.images[0])) || {}).url || '',
                  spotifyUrl: (a.external_urls && a.external_urls.spotify) || ''
                });
              });
            }
          } catch (e) { /* one artist failing shouldn't sink the whole scan */ }
        }
      }
      done++;
      jobsState.scan = { done, total: artists.length };
      if (onProgress) onProgress(done, artists.length);
    });

    found.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
    const seenIds = new Set();
    const deduped = found.filter(r => { if (seenIds.has(r.id)) return false; seenIds.add(r.id); return true; }); // same album can surface once per artist you have on it

    saveNewReleaseArtistCache(artistCache);
    saveNewReleaseResults(deduped);
    localStorage.setItem(NEW_RELEASES_LAST_SCAN_KEY, String(Date.now()));
    jobsState.scan = null; jobsDone('scan', `Looked for new releases from ${jobsPl(artists.length, 'artist')}: ${deduped.length ? jobsPl(deduped.length, 'release') + ' found' : 'none found'}`);
    return deduped;
  })();
  try { return await newReleaseScanInFlight; } finally { newReleaseScanInFlight = null; }
}

function updateNewReleasesBadge() {
  const count = loadNewReleaseResults().length;
  if (!el.newReleasesBadge) return;
  el.newReleasesBadge.textContent = String(count);
  el.newReleasesBadge.hidden = count === 0;
}

function renderNewReleasesList(results) {
  if (!el.newReleasesList) return;
  if (!results.length) {
    el.newReleasesList.innerHTML = '<p class="tracklist-status">No new releases found from artists in your crate.</p>';
    return;
  }
  el.newReleasesList.innerHTML = results.map(r => `
    <div class="new-release-row" data-release-id="${escapeHtml(r.id)}">
      ${r.image ? `<img class="new-release-thumb" src="${escapeHtml(r.image)}" alt="">` : '<div class="new-release-thumb new-release-thumb-empty"></div>'}
      <div class="new-release-info">
        <span class="new-release-title">${escapeHtml(r.title)}</span>
        <span class="new-release-sub">${escapeHtml(r.artist)} \u00b7 ${escapeHtml(r.releaseDate || '')} \u00b7 ${escapeHtml(r.type || '')}</span>
      </div>
      <button type="button" class="chip-btn new-release-add-btn">+ Add</button>
      <button type="button" class="chip-btn new-release-dismiss-btn" title="Dismiss" aria-label="Dismiss this release">✕</button>
    </div>
  `).join('');
}

function updateNewReleasesLastChecked() {
  if (!el.newReleasesLastChecked) return;
  const t = Number(localStorage.getItem(NEW_RELEASES_LAST_SCAN_KEY) || 0);
  el.newReleasesLastChecked.textContent = t ? `Last checked ${new Date(t).toLocaleString()}` : 'Never checked yet';
}

async function triggerNewReleaseScan() {
  if (!loadSpotifyCreds().clientId) {
    el.newReleasesStatus.hidden = false;
    el.newReleasesStatus.textContent = 'Add a Spotify Client ID/Secret first (\u2699 \u2192 Spotify API\u2026).';
    return;
  }
  el.newReleasesCheckBtn.disabled = true;
  el.newReleasesStatus.hidden = false;
  el.newReleasesStatus.textContent = 'Checking your artists\u2026';
  try {
    const results = await runNewReleaseScan((done, total) => {
      el.newReleasesStatus.textContent = `Checking your artists\u2026 (${done}/${total})`;
    });
    el.newReleasesStatus.hidden = true;
    renderNewReleasesList(results);
    updateNewReleasesLastChecked();
    updateNewReleasesBadge();
  } catch (e) {
    console.warn('New release scan failed', e);
    el.newReleasesStatus.textContent = 'Something went wrong checking for new releases.';
  } finally {
    el.newReleasesCheckBtn.disabled = false;
  }
}

// Fire-and-forget, called once after the catalog first loads (see init()) —
// silently refreshes the cached results (and therefore the menu badge)
// once a calendar day, without ever popping the modal open on its own.
// Does nothing if Spotify isn't configured or the crate is completely empty.
function maybeAutoScanNewReleases() {
  updateNewReleasesBadge(); // reflect whatever's already cached immediately, before any network call
  if (Date.now() < newReleaseNextAutoAt()) return;
  if (!loadSpotifyCreds().clientId) return;
  if (!state.raw.length || newReleaseScanInFlight) return;
  try { localStorage.setItem(NEW_RELEASES_AUTO_TRIED_KEY, String(Date.now())); } catch (e) { /* storage full or blocked */ }
  runNewReleaseScan().then(updateNewReleasesBadge).catch(() => {});
}


// Spotify's /search endpoint is a fuzzy relevance ranking, not a strict
// filter — "album:X artist:Y" is a scoring hint, not a guarantee the top
// hit is actually by Y. A short or generic title can easily out-rank the
// real match with something from a totally unrelated artist (seen in the
// wild: a downtempo/dream pop release's tracklist offer landed on a KC and
// the Sunshine Band compilation). Used by both spotifySearchDirect and
// spotifyFindAlbumTracklist below to reject a hit whose artist credit
// doesn't reasonably match, rather than confidently returning it anyway.
// Deliberately doesn't also check the album title — an artist-name
// mismatch is the failure mode actually seen (wrong artist entirely); a
// same-artist wrong-edition mismatch is rarer and lower-impact.
function spotifyResultArtistMatches(albumOrTrack, wantArtist) {
  const want = trackNormKey(wantArtist);
  if (!want) return true; // nothing to check against — don't block on empty input
  const names = ((albumOrTrack && albumOrTrack.artists) || []).map(a => trackNormKey(a.name));
  return names.some(n => n && (n === want || n.includes(want) || want.includes(n)));
}

// Searches Spotify's real catalog for this artist/title and returns the
// exact album page URL for the best match — a genuine album page, not a
// search results page.
// Runs one raw Spotify album search and returns its first hit (or null) —
// factored out so both spotifySearchDirect and spotifyFindAlbumTracklist
// can try the strict field-filtered query first, then a plain free-text
// one as a fallback (same reasoning as spotifyTrackSearchRaw above: a
// short/unusual artist name can make the fielded query return nothing
// even when the album is genuinely there).
async function spotifyAlbumSearchRaw(token, q) {
  try {
    const res = await spotifyApiFetch(`https://api.spotify.com/v1/search?type=album&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.status === 401) { spotifyToken = null; return { hit: null, unauthorized: true }; }
    if (!res.ok) return { hit: null, unauthorized: false };
    const data = await res.json();
    return { hit: (data.albums && data.albums.items && data.albums.items[0]) || null, unauthorized: false };
  } catch (e) {
    console.warn('Spotify search failed', e);
    return { hit: null, unauthorized: false };
  }
}
async function spotifySearchDirect(item) {
  const token = await getSpotifyToken();
  if (!token) return null;

  const cleanTitle = item.title.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim();
  let { hit, unauthorized } = await spotifyAlbumSearchRaw(token, `album:${cleanTitle} artist:${item.artist}`);
  if (unauthorized) return null;
  if (!hit) ({ hit } = await spotifyAlbumSearchRaw(token, `${item.artist} ${cleanTitle}`));
  if (!hit || !spotifyResultArtistMatches(hit, item.artist)) return null;
  return (hit.external_urls && hit.external_urls.spotify) || null;
}

// Same idea as spotifySearchDirect but pulls the album's *full tracklist*
// rather than just its page URL — used to offer "add this tracklist" when
// adding a new album (see maybeOfferAddSpotifyTracklist). Paginates past
// Spotify's default 50-item page since a double album/deluxe edition can
// run longer than that. Returns null on no match/any failure so the caller
// can just silently skip offering anything.
async function spotifyFindAlbumTracklist(artist, title) {
  const token = await getSpotifyToken();
  if (!token) return null;

  const cleanTitle = title.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim();
  let { hit: album, unauthorized } = await spotifyAlbumSearchRaw(token, `album:${cleanTitle} artist:${artist}`);
  if (unauthorized) return null;
  if (!album) ({ hit: album } = await spotifyAlbumSearchRaw(token, `${artist} ${cleanTitle}`));
  if (!album || !spotifyResultArtistMatches(album, artist)) return null;

  try {
    let items = [];
    let url = `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`;
    while (url) {
      const tRes = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
      if (!tRes.ok) break;
      const tData = await tRes.json();
      items = items.concat(tData.items || []);
      url = tData.next || null;
    }
    if (!items.length) return null;

    return {
      albumName: album.name,
      tracks: items.map((t, i) => ({
        trackNumber: i + 1,
        title: t.name,
        spotifyLink: (t.external_urls && t.external_urls.spotify) || '',
        durationMs: t.duration_ms || 0
      }))
    };
  } catch (e) {
    console.warn('Spotify tracklist lookup failed', e);
    return null;
  }
}

// Same idea as spotifySearchDirect but for a single track, so each row in
// the tracklist can be played on its own rather than only the whole album.
// Caches the full list of candidates (not just the top hit) so "Try next
// Spotify match" (see tryNextSpotifyMatch) can step through real
// alternatives instead of re-searching blind every time the fuzzy match is
// wrong — a cover version, a live/remix take, or an entirely different
// song with the same title are all common enough that "just search again"
// alone wasn't a real fix.
const spotifyTrackCandidatesCache = {}; // "artist::track" (lowercase) -> [{id, name, artists, album}]
// Which candidate index each track currently resolves to — in-memory only
// (not persisted; a confirmed match is saved via confirmSpotifyMatch into
// trackData.spotifyLink instead, same field/precedence Track Properties
// already uses, so it survives a reload — this index is just for stepping
// through options in the moment).
const spotifyMatchAttemptIndex = {};
function trackMatchCacheKey(artist, trackName) {
  return (artist + '::' + trackName).toLowerCase();
}
// Runs one raw Spotify track search and returns its items array (never
// throws) — factored out of spotifyTrackCandidatesLive so it can try the
// strict field-filtered query first, then a plain free-text one as a
// fallback, without duplicating the request/error-handling logic.
async function spotifyTrackSearchRaw(token, q) {
  try {
    const res = await spotifyApiFetch(`https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.status === 401) { spotifyToken = null; flashGlobalToast('Spotify session expired \u2014 try again in a moment.'); return []; }
    if (!res.ok) {
      console.warn('Spotify track search failed', res.status);
      flashGlobalToast(`Spotify search failed (error ${res.status}) \u2014 not "no results found", the request itself didn\u2019t go through.`);
      return [];
    }
    const data = await res.json();
    return (data.tracks && data.tracks.items) || [];
  } catch (e) {
    // Previously silent (console.warn only) — every caller (the automatic
    // match search AND "Fix a wrong Spotify match"/"Try next match") saw
    // an identical empty result whether this was a genuine no-match or the
    // request never reaching Spotify at all, e.g. a real, recurring
    // pattern on Spotify's own side where their API's CORS preflight
    // handling breaks for browser requests carrying an Authorization
    // header (reported multiple times historically, most recently
    // mid-2026, and has self-resolved on Spotify's end each time so far)
    // — a fetch() to a CORS-blocked endpoint throws exactly this kind of
    // TypeError, not an HTTP error status, so the `!res.ok` branch above
    // never even runs.
    console.warn('Spotify live track search failed', e);
    flashGlobalToast('Spotify search couldn\u2019t reach Spotify at all \u2014 not necessarily "no results found". Check the browser console for the exact error.');
    return [];
  }
}
async function spotifyTrackCandidatesLive(artist, query) {
  const token = await getSpotifyToken();
  if (!token) return [];
  let items = await spotifyTrackSearchRaw(token, `track:${query} artist:${artist}`);
  if (!items.length) {
    // Spotify's track:/artist: field filters are stricter than a plain
    // search and can come back completely empty even for a real match —
    // seen with unusual/short artist names (e.g. "a.s.o.") where the
    // fielded query found nothing but the track is genuinely there. A
    // plain free-text query is more forgiving, so try it before giving up
    // entirely. toMatchCandidates/spotifyResultArtistMatches-style
    // filtering still isn't applied here (this function returns raw
    // candidates for a person to pick from themselves — see
    // handleTracklistMatchBtnClick/openTrackPropertiesModal), so a looser
    // second pass is safe: worst case, irrelevant results just sit
    // unpicked in the list.
    items = await spotifyTrackSearchRaw(token, `${artist} ${query}`);
  }
  return items.map(t => ({
    id: t.id,
    name: t.name,
    artists: (t.artists || []).map(a => a.name).join(', '),
    album: (t.album && t.album.name) || '',
    durationMs: t.duration_ms || 0
  }));
}
async function spotifyTrackCandidates(artist, trackName) {
  const cacheKey = trackMatchCacheKey(artist, trackName);
  if (spotifyTrackCandidatesCache[cacheKey]) return spotifyTrackCandidatesCache[cacheKey];
  const candidates = await spotifyTrackCandidatesLive(artist, trackName);
  spotifyTrackCandidatesCache[cacheKey] = candidates;
  return candidates;
}
// The automatic match no longer trusts Spotify's order. When a song has no saved link, whatever Spotify lists first used to
// play — sometimes a live take, a karaoke version or someone's cover with the same title. The candidates are now ranked
// with the same scoring as the Match songs dialog (title, artist, album, length, and a penalty for version words the song
// itself doesn't have); ctx is the release's album title and the song's length when known. Spotify's order still decides
// ties, and "Try next match" steps through this same ranked order.
function songContextFor(item, trackNum, trackName) {
  const cache = state.trackCache[artKey(item)] || [];
  const t = cache.find(x => (trackNum !== undefined && trackNum !== '' && x.trackNumber === trackNum)) || cache.find(x => x.trackName === trackName);
  return { album: item.title, durationMs: (t && t.trackTimeMillis) || 0 };
}
async function spotifyRankedCandidates(artist, trackName, ctx) {
  const raw = await spotifyTrackCandidates(artist, trackName);
  if (raw.length < 2) return raw;
  const wrapped = raw.map(c => ({ c, v: { title: c.name, artists: String(c.artists || '').split(', '), album: c.album, durationMs: c.durationMs || 0 } }));
  return smRank({ title: trackName, artist, album: ctx && ctx.album, durationMs: ctx && ctx.durationMs }, wrapped.map(w => w.v)).map(v => wrapped.find(w => w.v === v).c);
}
async function spotifyTrackId(artist, trackName, ctx) {
  const candidates = await spotifyRankedCandidates(artist, trackName, ctx);
  if (!candidates.length) return null;
  const cacheKey = trackMatchCacheKey(artist, trackName);
  const idx = Math.min(spotifyMatchAttemptIndex[cacheKey] || 0, candidates.length - 1);
  return candidates[idx].id;
}

// "Try next Spotify match" — steps to the next search result for this
// track (wrapping back to the first after the last) and immediately plays
// it, so the person can hear whether it's the right recording without
// leaving the moment. Nothing is saved yet — see confirmSpotifyMatch for
// that — so reloading the page resets back to the top match.
async function tryNextSpotifyMatch(item, trackName, trackNum) {
  const candidates = await spotifyRankedCandidates(item.artist, trackName, songContextFor(item, trackNum, trackName));
  if (!candidates.length) { flashGlobalToast('No Spotify matches found for this track.'); return; }
  if (candidates.length === 1) { flashGlobalToast('Only one Spotify match found for this track.'); return; }
  const key = trackMatchCacheKey(item.artist, trackName);
  const next = ((spotifyMatchAttemptIndex[key] || 0) + 1) % candidates.length;
  spotifyMatchAttemptIndex[key] = next;
  const candidate = candidates[next];
  flashGlobalToast(`Trying "${candidate.name}" \u2014 ${candidate.artists}`);
  await playTrackNow(item, trackName, trackNum);
}

// "Confirm Spotify match" — pins whichever recording is CURRENTLY resolved
// for this track (the default top match, or wherever "Try next match"
// landed) as a permanent per-track override. Writes to the same
// trackData.spotifyLink field Track Properties already uses, so from now
// on this track always plays that exact recording instead of depending on
// the fuzzy search (or the in-memory attempt index above, which resets on
// reload) to land on it again.
async function confirmSpotifyMatch(item, trackName, trackNum) {
  const id = await spotifyTrackId(item.artist, trackName, songContextFor(item, trackNum, trackName));
  if (!id) { flashGlobalToast('No Spotify match to confirm yet.'); return; }
  await updateTrackData(item, trackNum, { spotifyLink: `https://open.spotify.com/track/${id}` });
  if (currentTracklistTracks.length) mergeTrackLinkOverrides(item, currentTracklistTracks);
  const cached = state.trackCache[artKey(item)];
  if (cached && cached !== currentTracklistTracks) mergeTrackLinkOverrides(item, cached);
  if (activeItem === item) renderTracklistBody(item, currentTracklistTracks);
  flashGlobalToast('Match confirmed \u2014 pinned for this track.');
}

async function getExternalLinksFor(item) {
  const key = artKey(item);
  if (state.linkCache[key]) return state.linkCache[key];

  const result = { spotify: null, soundcloud: null, rym: null, youtube: null };

  // A manually-entered RYM Link always wins — no lookup needed, and it's
  // the escape hatch for the releases Wikidata/MusicBrainz just don't have.
  if (item.rymLink && item.rymLink.trim()) result.rym = item.rymLink.trim();

  // If the crate's own Link field already points straight at a Spotify,
  // SoundCloud, or YouTube release page, that's already a direct link — use
  // it as-is, no lookup needed for that platform.
  if (item.link) {
    if (/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(album|track)\//i.test(item.link)) result.spotify = item.link;
    if (/soundcloud\.com\//i.test(item.link)) result.soundcloud = item.link;
    if (/(?:music\.)?youtube\.com\/|youtu\.be\//i.test(item.link)) result.youtube = item.link;
  }

  // Spotify's own search API, when configured, resolves a real album page
  // directly — try this before falling back to MusicBrainz's cross-links.
  if (!result.spotify) {
    try { result.spotify = await spotifySearchDirect(item); }
    catch (e) { console.warn('Spotify direct lookup failed', e); }
  }

  let mbReleaseGroupId = null; // reused below for the Wikidata RYM lookup

  try {
    let mbid = null;

    // Reuse the MBID if the album's own Link field is a MusicBrainz release URL.
    if (item.link) {
      const m = item.link.match(/musicbrainz\.org\/release\/([a-f0-9-]+)/);
      if (m) mbid = m[1];
    }

    // Otherwise look one up by artist + title.
    if (!mbid) mbid = await lookupMbReleaseId(item.artist, item.title);

    if (mbid && (!result.spotify || !result.soundcloud || !result.rym || !result.youtube)) {
      // Single call gets both the release's own url-rels AND its
      // release-group id, so the release-group fallback below still runs
      // even when the mbid came from a reused Link field (not a fresh
      // search) rather than needing a second round trip to find it.
      const { relations, releaseGroupId } = await fetchMbReleaseWithGroup(mbid);
      applyRelationUrls(relations, result);
      mbReleaseGroupId = releaseGroupId;

      // Streaming links are frequently attached to the release-group instead
      // of one specific release — check there too for whatever we're missing.
      if ((!result.spotify || !result.soundcloud || !result.rym || !result.youtube) && releaseGroupId) {
        const rgRelations = await fetchMbRelations(`https://musicbrainz.org/ws/2/release-group/${releaseGroupId}?inc=url-rels&fmt=json`);
        applyRelationUrls(rgRelations, result);
      }
    }
  } catch (e) {
    console.warn('External link lookup failed', e);
  }

  // MusicBrainz itself rarely has a RYM cross-link, so most releases reach
  // here still missing one — try Wikidata (see fetchRymFromWikidata above)
  // before giving up and handing back a plain search link elsewhere.
  if (!result.rym) {
    try { result.rym = await fetchRymFromWikidata(item, mbReleaseGroupId); }
    catch (e) { console.warn('Wikidata RYM lookup failed', e); }
  }

  state.linkCache[key] = result;
  return result;
}

// Look up a MusicBrainz release id for an artist/title pair. Tries a
// field-qualified Lucene query first (artist:"..." AND release:"...") since
// a bare bag-of-words query frequently matched the wrong release for common
// album titles — and because a match (right or wrong) short-circuits the
// rest of the lookup, a wrong first hit meant silently getting stuck on a
// search-fallback link instead of a real one. Falls back to the loose query
// only if the precise one comes up empty.
async function lookupMbReleaseId(artist, title) {
  const cleanTitle = title.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim();
  const escape = s => s.replace(/["\\]/g, '\\$&');

  const tryQuery = async (q) => {
    try {
      const res = await mbFetch(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(q)}&fmt=json&limit=1`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }
      });
      const data = await res.json();
      const hit = data.releases && data.releases[0];
      return hit ? hit.id : null;
    } catch (e) {
      return null;
    }
  };

  let id = await tryQuery(`artist:"${escape(artist)}" AND release:"${escape(cleanTitle)}"`);
  if (!id) id = await tryQuery(`${artist} ${cleanTitle}`);
  return id;
}

async function fetchMbReleaseWithGroup(mbid) {
  try {
    const res = await mbFetch(`https://musicbrainz.org/ws/2/release/${mbid}?inc=url-rels+release-groups&fmt=json`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }
    });
    if (!res.ok) return { relations: [], releaseGroupId: null };
    const data = await res.json();
    return { relations: data.relations || [], releaseGroupId: data['release-group'] && data['release-group'].id };
  } catch (e) {
    return { relations: [], releaseGroupId: null };
  }
}

async function fetchMbRelations(endpoint) {
  try {
    const res = await fetch(endpoint, { headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.relations || [];
  } catch (e) {
    return [];
  }
}

function applyRelationUrls(relations, result) {
  relations.forEach(rel => {
    const url = rel.url && rel.url.resource;
    if (!url) return;
    if (!result.spotify && /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(album|track)\//i.test(url)) result.spotify = url;
    else if (!result.soundcloud && /soundcloud\.com\//i.test(url)) result.soundcloud = url;
    else if (!result.rym && /rateyourmusic\.com\//i.test(url)) result.rym = url;
    else if (!result.youtube && /(?:music\.)?youtube\.com\/|youtu\.be\//i.test(url)) result.youtube = url;
  });
}
