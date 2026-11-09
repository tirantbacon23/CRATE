// CRATE — geocoding queue, filter chips, filter / sort / group, advanced search, recorded date.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// ---------- Geocoding queue for the Map viewer (LocationIQ) ----------
// Same shared-queue pattern as mbFetch above. LocationIQ's free tier is
// good for roughly 2 requests/sec, so every geocode lookup — regardless of
// how many locations the map needs to resolve at once — is chained onto
// one queue with a fixed spacing between requests, rather than firing them
// all in parallel. (Nominatim, used here before 1.29.15, needs no key but
// its usage policy doesn't really permit this kind of client-side lookup
// and requests were getting blocked — LocationIQ is the same idea with a
// key that lets it actually work from a browser.)
let geoQueueTail = Promise.resolve();
let geoLastRequestAt = 0;
const GEO_MIN_INTERVAL_MS = 550;
const MAP_APIKEY_KEY = 'crate_map_apikey_v1';

function loadMapApiKey() {
  try { return (localStorage.getItem(MAP_APIKEY_KEY) || '').trim(); } catch (e) { return ''; }
}
function saveMapApiKey(key) {
  try { localStorage.setItem(MAP_APIKEY_KEY, key); } catch (e) { /* ignore */ }
}

function saveMapApiKeyAndLoad() {
  const key = el.mapApiKeyInput.value.trim();
  if (!key) { el.mapApiKeyInput.focus(); return; }
  saveMapApiKey(key);
  openMapModal();
}

function geoFetch(url) {
  const run = async () => {
    const wait = Math.max(0, geoLastRequestAt + GEO_MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    geoLastRequestAt = Date.now();
    return fetchWithTimeout(url, {}, 10000);
  };
  const queued = geoQueueTail.then(run, run);
  geoQueueTail = queued.catch(() => {});
  return queued;
}

function loadGeocodeCache() {
  try { return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveGeocodeCache(cache) {
  try { localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ }
}

// Resolves one Location string to { lat, lon, label } via LocationIQ,
// consulting/populating the shared cache first. Returns null (and caches
// null) if LocationIQ has nothing for it — that's a real answer, not a
// failure, so it's not retried on every subsequent map open. A bad/expired
// key (401/403) is also treated as "not found" rather than crashing the
// whole placement loop; the mapCount "couldn't be found" tally is the only
// symptom, so a rejected key mostly just looks like nothing geocodes.
async function geocodeLocation(query, cache, apiKey) {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
  if (!apiKey) return null;
  try {
    const url = 'https://us1.locationiq.com/v1/search?key=' + encodeURIComponent(apiKey)
      + '&format=json&limit=1&q=' + encodeURIComponent(query);
    const res = await geoFetch(url);
    if (!res.ok) { cache[key] = null; return null; }
    const results = await res.json();
    const hit = results && results[0];
    const resolved = hit ? { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.display_name } : null;
    cache[key] = resolved;
    return resolved;
  } catch (e) {
    // A timed-out/failed request is NOT the same as "no such place" — don't
    // poison the cache with a permanent null for what might just be a
    // dropped connection, so it gets another try next time the map opens.
    return null;
  }
}

// --- Discography completion badges (left panel, grouped by Artist) ---
// Shows "N of T (P%)" next to each artist — N is how many albums you've
// logged for them (already known locally), T is how many studio albums
// MusicBrainz has on file for that artist. This is an approximate, "fun
// stat" number, not a title-by-title match: T only counts release-groups
// with primary type Album and no secondary type (so live albums,
// compilations, soundtracks, remix albums, etc. don't inflate the count),
// and very prolific artists (100+ release-groups) may undercount since we
// only fetch one page per candidate.
//
// Artist names aren't unique on MusicBrainz (e.g. there's more than one act
// named "Florist"), so a plain "take the first search result" approach can
// silently resolve to the wrong entity and report 0 albums for a real
// artist. To guard against that, we fetch a few same-named candidates and
// walk them in order, using the first one that actually has studio albums
// on file, rather than trusting relevance ranking alone.
//
// MusicBrainz's unauthenticated rate limit is ~1 request/sec, so this loads
// one artist at a time (and, for ambiguous names, one candidate at a time)
// rather than in parallel.
async function fetchArtistDiscogCount(artistName) {
  const cacheKey = artistName.toLowerCase();
  if (state.artistDiscogCache[cacheKey]) return state.artistDiscogCache[cacheKey];

  const headers = { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' };
  let result = { total: null };
  try {
    const searchRes = await mbFetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${artistName}"`)}&fmt=json&limit=5`, { headers });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const allHits = searchData.artists || [];
      // Prefer exact (case-insensitive) name matches over loosely-related
      // hits Lucene decided were relevant; fall back to the top hit if
      // nothing matches exactly.
      const exact = allHits.filter(a => a.name.toLowerCase() === artistName.toLowerCase());
      const candidates = (exact.length ? exact : allHits.slice(0, 1)).slice(0, 3);

      let best = { total: 0, mbid: null };
      for (const artist of candidates) {
        const rgRes = await mbFetch(`https://musicbrainz.org/ws/2/release-group?artist=${artist.id}&type=album&limit=100&fmt=json`, { headers });
        if (!rgRes.ok) continue;
        const rgData = await rgRes.json();
        const groups = rgData['release-groups'] || [];
        const studioAlbums = groups.filter(rg => rg['primary-type'] === 'Album' && (!rg['secondary-types'] || rg['secondary-types'].length === 0));
        if (studioAlbums.length > 0) { best = { total: studioAlbums.length, mbid: artist.id }; break; }
      }
      if (candidates.length) result = best; // we found the artist, even if their studio-album count is genuinely 0
    }
  } catch (e) { /* leave result as { total: null } — badge just won't show */ }

  state.artistDiscogCache[cacheKey] = { ...result, fetchedAt: Date.now() };
  saveCoverageCache();
  return state.artistDiscogCache[cacheKey];
}

function formatCoverageBadge(owned, total) {
  const pct = total > 0 ? Math.round((owned / total) * 100) : null;
  return pct == null ? `${owned} of ${total}` : `${owned} of ${total} (${pct}%)`;
}

function loadArtistDiscogBadges(artistNames) {
  const queue = artistNames.filter(name => !state.artistDiscogCache[name.toLowerCase()]);

  function next() {
    if (queue.length === 0) return;
    const artistName = queue.shift();
    fetchArtistDiscogCount(artistName).then(result => {
      if (state.leftMode !== 'artist') return; // left panel switched away — don't touch stale DOM
      const badge = el.leftList.querySelector(`.left-row-count[data-artist="${cssEscape(artistName)}"]`);
      if (!badge || result.total == null) return;
      badge.textContent = formatCoverageBadge(Number(badge.dataset.ownedCount), result.total);
    }).finally(next); // mbFetch() itself paces every MusicBrainz request globally now
  }
  next();
}

// --- Year coverage badges (left panel, grouped by Year) ---
// Shows "N of T (P%)" — N is how many albums/EPs/singles you've logged for
// that year, T is how many MusicBrainz has on file with that first-release
// year. Unlike the artist badge, this only needs ONE request per year:
// MusicBrainz's search endpoint returns a total match `count` up front, so
// we ask for it with limit=1 and never fetch the actual (potentially huge)
// result list. Restricted to primary type Album/EP/Single with no secondary
// type, for the same "don't let live albums/compilations/etc. inflate the
// total" reasoning as the artist badge. This is a rough, approximate count,
// not a precise catalog — MusicBrainz's coverage of small/self-released
// music varies a lot by year and genre.
async function fetchYearReleaseCount(year) {
  if (state.yearCoverageCache[year]) return state.yearCoverageCache[year];

  const headers = { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' };
  let result = { total: null };
  try {
    const q = `firstreleasedate:[${year}-01-01 TO ${year}-12-31] AND (primarytype:Album OR primarytype:EP OR primarytype:Single) AND NOT secondarytype:*`;
    const res = await mbFetch(`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=1`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.count === 'number') result = { total: data.count };
    }
  } catch (e) { /* leave result as { total: null } — badge just won't show */ }

  state.yearCoverageCache[year] = { ...result, fetchedAt: Date.now() };
  saveCoverageCache();
  return state.yearCoverageCache[year];
}

function loadYearCoverageBadges(years) {
  const queue = years.filter(y => !state.yearCoverageCache[y]);

  function next() {
    if (queue.length === 0) return;
    const year = queue.shift();
    fetchYearReleaseCount(year).then(result => {
      if (state.leftMode !== 'year') return; // left panel switched away — don't touch stale DOM
      const badge = el.leftList.querySelector(`.left-row-count[data-year="${cssEscape(year)}"]`);
      if (!badge || result.total == null) return;
      badge.textContent = formatCoverageBadge(Number(badge.dataset.ownedCount), result.total);
    }).finally(next); // mbFetch() itself paces every MusicBrainz request globally now
  }
  next();
}

function updateMainLabel() {
  if (state.activePlaylistId) {
    const playlist = state.playlists.find(p => p.id === state.activePlaylistId);
    const base = playlist ? `Playlist: ${playlist.name}` : 'Playlists';
    const suffix = PLAYLIST_VIEW_LABELS[state.playlistViewMode];
    el.mainPanelLabel.textContent = suffix ? `${base} \u00b7 ${suffix}` : base;
    return;
  }

  const baseLabel = MAIN_VIEW_LABELS[state.mainViewMode] || 'Albums';
  if (!state.navFilter) { 
    el.mainPanelLabel.textContent = baseLabel; 
    return; 
  }
  
  const prefixes = { artist: 'Artist: ', genre: 'Genre: ', album: 'Album: ', descriptor: 'Descriptor: ', label: 'Label: ' };
  let label = state.navFilter.mode === 'label' ? labelDisplayOf(state.navFilter.value) : state.navFilter.value;
  if (state.navFilter.mode === 'album') {
    const match = state.raw.find(r => r.row === state.navFilter.value);
    if (match) label = match.title;
  }
  
  // Example output: "Artist: Daft Punk · Tracks"
  el.mainPanelLabel.textContent = `${prefixes[state.navFilter.mode]}${label}${state.navFilter.mode === 'genre' ? genreFilterSuffix(state.genreRole, state.firstGenreOnly, state.genreNavExact) : ''} · ${baseLabel}`;
}

/* ---------- Filter chips ---------- */



/* ---------- Filter / sort / group ---------- */
// Advanced search syntax:
//   field:value            e.g. artist:sylvie, genre:jazz, label:"warp records"
//   field:"value with spaces"
//   year:2022 / year:>2020 / year:>=2020 / year:<2020 / year:<=2020 / year:2020-2022
//   rating:>=4 / rating:4 (same operators as year)
//   updated:never / updated:yes   (has it had its first update from Rate Your Music?)
//   -term / -field:value   excludes matches instead of requiring them
//   "exact phrase"          a plain quoted phrase, matched as one substring
//   plain words             same old behavior: substring match against
//                           artist/title/year/catalog/genres combined
// All tokens are AND'd together, same as the old space-separated words.
const SEARCH_FIELD_ALIASES = {
  artist: 'artist', title: 'title', album: 'title',
  genre: 'genre', label: 'label',
  catalog: 'catalog', cat: 'catalog', type: 'type',
  year: 'year', rating: 'rating',
  region: 'region', location: 'location',
  track: 'track', song: 'track',
  descriptor: 'descriptor', descriptors: 'descriptor',
  scene: 'scene', movement: 'movement', movements: 'movement', scenes: 'scene',
  rym: 'rym',
  updated: 'updated'
};

// Manual tokenizer (rather than one big regex) so quoted phrases, an
// optional leading "-" (negation), and an optional "field:" prefix can all
// combine predictably — e.g. -artist:"the beatles" needs all three at once.
function tokenizeSearchQuery(q) {
  const tokens = [];
  let i = 0;
  const n = q.length;
  while (i < n) {
    while (i < n && /\s/.test(q[i])) i++;
    if (i >= n) break;
    let negate = false;
    if (q[i] === '-') { negate = true; i++; }
    let field = null;
    const fieldStart = i;
    while (i < n && /[a-zA-Z]/.test(q[i])) i++;
    if (i < n && q[i] === ':' && i > fieldStart) {
      field = q.slice(fieldStart, i);
      i++; // skip the ':'
      while (i < n && /[ \t]/.test(q[i])) i++; // tolerate "artist: sylvie" (space after the colon) same as "artist:sylvie"
    } else {
      i = fieldStart; // wasn't actually a "field:" prefix — back up and read it as the value
    }
    let value;
    let quoted = false; // an explicitly quoted value is taken literally — see mergeGenrePhrases
    if (q[i] === '"') {
      quoted = true;
      i++;
      const vs = i;
      while (i < n && q[i] !== '"') i++;
      value = q.slice(vs, i);
      if (i < n) i++; // skip closing quote
    } else {
      const vs = i;
      while (i < n && !/\s/.test(q[i])) i++;
      value = q.slice(vs, i);
    }
    if (field !== null || value) tokens.push({ negate, field, value, quoted });
  }
  return tokens;
}

// Parses a numeric clause's value into a comparable shape: a bare number
// ("4"), a comparison (">=4"), or a range ("2020-2022"). Returns null if
// the value isn't numeric at all, so the caller can fall back gracefully.
function parseNumericClause(raw) {
  const cmp = raw.match(/^(>=|<=|>|<)?(-?\d+(?:\.\d+)?)$/);
  if (cmp) return { op: cmp[1] || '=', value: parseFloat(cmp[2]) };
  const range = raw.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (range) return { op: 'range', lo: parseFloat(range[1]), hi: parseFloat(range[2]) };
  return null;
}

function numericClauseMatches(actual, clause) {
  if (actual == null || isNaN(actual) || !clause) return false;
  switch (clause.op) {
    case '>': return actual > clause.value;
    case '<': return actual < clause.value;
    case '>=': return actual >= clause.value;
    case '<=': return actual <= clause.value;
    case 'range': return actual >= clause.lo && actual <= clause.hi;
    default: return actual === clause.value;
  }
}

// Same fields the old plain-word search checked (artist/title/year/catalog/
// genres), plus track titles — kept as its own helper since both the
// free-text-token case and the "field: prefix wasn't actually a real field"
// fallback below need it. Track titles only come from a saved/manually-
// entered tracklist (r.manualTracks) — that's loaded upfront for every row,
// unlike an auto-looked-up MusicBrainz tracklist, which is only fetched
// lazily when the album's deck is opened and isn't available to search here.
function releaseSearchTextNoTracks(r) {
  const year = dateVal(r.releaseDate) !== -Infinity ? new Date(r.releaseDate).getUTCFullYear() : '';
  const genres = getGenreList(combinedGenreStr(r)).join(' ');
  const canon = artistCanon(r.artist);
  return `${r.artist} ${canon !== r.artist ? canon + ' ' : ''}${r.title} ${year} ${r.catalog} ${r.descriptor || ''} ${r.rymDescriptors || ''} ${r.scene || ''} ${r.movement || ''} ${genres}`.toLowerCase();
}

function combinedSearchText(r) {
  return `${releaseSearchTextNoTracks(r)} ${trackTitlesFor(r).join(' ').toLowerCase()}`;
}

// Search matches whole RELEASES (a track title counts toward its release's
// searchable text, see combinedSearchText), but the Tracks and Album-and-
// Tracks views then expand every matching release into ALL of its tracks —
// so searching one track's title also listed every other track on that
// release (reported: searching "do re mi" from a Woody Guthrie single showed
// the single's other track too). This narrows a matching release's tracks to
// the ones the query was actually about, when it was about specific tracks.
//
// A track is kept when every free-text / track: term is found in either
// the release's own non-track text (artist, title, year, genres...) or that
// track's title, AND at least one term hit the track's title itself — so
// "woody do re mi" keeps just "Do Re Mi" (woody is satisfied by the artist),
// while a track: term must be in the track's own title outright. If no track
// qualifies at all, the search was purely about the release ("woody guthrie")
// and every track is kept, exactly as before. Field terms for other fields
// (artist:, year:, rating:...) and negated terms already gated which
// releases got here, so they're ignored at this level.
function filterTracksBySearch(item, tracks) {
  const terms = getSearchTerms().filter(t =>
    !t.negate && t.value && (!t.field || SEARCH_FIELD_ALIASES[t.field.toLowerCase()] === 'track'));
  if (!terms.length) return tracks;
  // A plain word the release itself already has (its artist, title, genres…) is about the release, not its songs: "artist:the jesus and m"
  // is read as artist "the" plus the words "jesus", "and", "m", and those must not narrow the list to "Vegetable Man" and "Never Understand".
  // Only a track: term, or a word the release doesn't have, narrows it.
  const base = releaseSearchTextNoTracks(item);
  const songTerms = terms.map(t => ({ field: t.field, v: t.value.toLowerCase() })).filter(t => t.field || !base.includes(t.v));
  if (!songTerms.length) return tracks;
  const hits = tracks.filter(t => { const name = (t.trackName || '').toLowerCase(); return songTerms.every(term => name.includes(term.v)); });
  return hits.length ? hits : tracks;
}

// Track titles available for search without triggering a network fetch —
// see combinedSearchText's comment on why this can't include lazily-loaded
// MusicBrainz tracklists.
function trackTitlesFor(r) {
  return (r.manualTracks || []).map(t => t.title).filter(Boolean);
}

function searchTokenMatches(r, token) {
  const { field, value } = token;
  if (!field) return combinedSearchText(r).includes(value.toLowerCase());

  const canonicalField = SEARCH_FIELD_ALIASES[field.toLowerCase()];
  // Not a recognized field name (e.g. someone typed a literal "foo:bar") —
  // treat the whole thing as a plain substring search rather than silently
  // matching everything or nothing.
  if (!canonicalField) return combinedSearchText(r).includes(`${field}:${value}`.toLowerCase());

  if (canonicalField === 'year') {
    const year = dateVal(r.releaseDate) !== -Infinity ? new Date(r.releaseDate).getUTCFullYear() : null;
    return numericClauseMatches(year, parseNumericClause(value));
  }
  if (canonicalField === 'rating') {
    return numericClauseMatches(r.rating || 0, parseNumericClause(value));
  }
  if (canonicalField === 'updated') { const v = String(value).toLowerCase(); if (['never', 'no', 'none', 'not'].includes(v)) return !r.rymUpdated; if (['yes', 'done', 'rym', 'updated'].includes(v)) return !!r.rymUpdated; return false; }          // updated:never / updated:yes (has it had its first update from Rate Your Music?)
  if (canonicalField === 'rym') { const v = String(value).toLowerCase(); if (v === 'none' || v === 'missing') return !r.rymRating; return numericClauseMatches(r.rymRating || 0, parseNumericClause(value)); }
  if (canonicalField === 'genre') return genreSearchMatches(r, value);
  if (canonicalField === 'track') {
    return trackTitlesFor(r).some(t => t.toLowerCase().includes(value.toLowerCase()));
  }
  if (canonicalField === 'artist') { const v = value.toLowerCase(); return [r.artist, artistCanon(r.artist)].some(n => String(n || '').toLowerCase().includes(v)); }          // an alias's releases answer to its artist's name
  return String(r[canonicalField] || '').toLowerCase().includes(value.toLowerCase());
}

// Lower-cased names of every genre the app knows (catalog tags + the genre
// taxonomy). Only needed when a query has an unquoted genre: followed by a
// bare word, but search runs per keystroke and filterTracksBySearch asks for
// the terms once per release, so it is cached against the things it's
// derived from rather than rebuilt on every call.
let knownGenreCache = { raw: null, tax: null, taxN: -1, rawN: -1, names: [] };
function knownGenreNamesLower() {
  const c = knownGenreCache;
  const taxN = Object.keys(state.genreTaxonomy || {}).length;
  if (c.raw !== state.raw || c.tax !== state.genreTaxonomy || c.taxN !== taxN || c.rawN !== state.raw.length) {
    c.names = getAllKnownGenres(state.genreTaxonomy).map(g => String(g.label || '').toLowerCase());
    c.raw = state.raw; c.tax = state.genreTaxonomy; c.taxN = taxN; c.rawN = state.raw.length;
  }
  return c.names;
}

// "genre:indie rock" tokenizes as genre:indie AND the free-text word "rock" —
// two separate conditions — so even a perfectly taxonomy-aware genre: match
// would still lose a Twee Pop release to the stray "rock" (its genres are
// "Twee Pop", whose PARENTS include Indie Rock). Multi-word genre names are
// the normal case, not the exception, so when an UNQUOTED genre: value is
// followed by bare words, the words are folded into the genre value for as
// long as the growing phrase is still contained in some real genre name.
// Anything that doesn't extend a real genre ("genre:rock beatles", or
// genre:indie sylvie) is left alone as its own AND-ed word, exactly as
// before, and quoting a value always takes it literally.
function mergeGenrePhrases(tokens) {
  const out = [];
  let known = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const isGenre = t.field && SEARCH_FIELD_ALIASES[t.field.toLowerCase()] === 'genre';
    if (!isGenre || t.quoted || !t.value) { out.push(t); continue; }
    let value = t.value, j = i + 1;
    while (j < tokens.length && !tokens[j].field && !tokens[j].negate && !tokens[j].quoted && tokens[j].value) {
      known = known || knownGenreNamesLower();
      const candidate = `${value} ${tokens[j].value}`;
      const cl = candidate.toLowerCase();
      if (!known.some(g => g.includes(cl))) break;
      value = candidate; j++;
    }
    out.push({ ...t, value });
    i = j - 1;
  }
  return out;
}

function getSearchTerms() {
  return state.query ? mergeGenrePhrases(tokenizeSearchQuery(state.query)) : [];
}

// How a genre: term matches a release — set by "Genre search" in the ⇅
// popover (state.genreSearchMode), checked per genre TAG rather than against
// all of a release's tags glued together with spaces (which let two separate
// tags, "Indie Pop" + "Rock", falsely satisfy genre:"pop rock").
//   exact      the release is tagged with exactly this genre.
//   subgenres  ...or with any genre filed UNDER it in the genre taxonomy —
//              the same rule as picking the genre in the left panel
//              (genreMatchesFilter), so Twee Pop, whose parents include Indie
//              Rock, shows up for "indie rock".
//   loose      ...and also any genre whose NAME merely contains the text
//              ("rock" -> Krautrock), or that sits under a genre whose name
//              does. This is the old substring behaviour plus sub-genres, so
//              nothing that matched before stops matching (the default).
// The genre tags of a release that a genre FILTER looks at. Normally all of them (a genre counts wherever it appears in the list);
// with "First genre only" (⇅ menu) just the first one listed — the release's primary genre, so a release with Funk Rock as its second
// or third genre no longer shows up under Funk Rock. "First" is the first tag of the combined Genre + Secondary Genre list, in the
// order they're written. A release with no genre at all has the single placeholder tag "Unknown" and so matches no real genre.
// Used by the left-panel genre filter, genre:/-genre: search terms and the Release Chart, so they always agree with each other.
function filterGenreTags(r) {
  const tags = genreTagsForRole(r, state.genreRole);        // which list(s) count: primary, secondary or both (⇅ menu → "A genre counts when it's")
  return state.firstGenreOnly ? tags.slice(0, 1) : tags;
}

function genreSearchMatches(r, rawValue) {
  const v = String(rawValue || '').trim().toLowerCase();
  if (!v) return true;
  const mode = state.genreSearchMode;
  return filterGenreTags(r).some(tag => {
    const tk = tag.trim().toLowerCase();
    if (tk === v) return true;
    if (mode === 'exact') return false;
    if (mode === 'loose' && tk.includes(v)) return true;
    return getGenreAncestors(state.genreTaxonomy, tag).some(a => {
      const ak = genreTaxonomyKey(a);
      return mode === 'loose' ? ak.includes(v) : ak === v;
    });
  });
}

// Shared by the main grid and the left panel (artists/genres/albums) so a
// search query narrows both consistently — e.g. "beatles" leaves only the
// Beatles' albums/artist row, and a genre name leaves only albums (and the
// artists/genre rows derived from them) tagged with that genre.
function matchesSearchTerms(r, searchTerms) {
  if (searchTerms.length === 0) return true;
  return searchTerms.every(token => token.negate ? !searchTokenMatches(r, token) : searchTokenMatches(r, token));
}

// The raw catalog narrowed down to just what matches the current search
// box query (independent of navFilter/listenedOnly) — this is what feeds
// the left panel so its artist/genre/album lists stay in sync with search.
function searchFilteredRaw() {
  const searchTerms = getSearchTerms();
  const base = state.leftNavView === 'playlists' ? playlistScopeRaw(activePlaylist()) : state.raw;          // beside a playlist, the browser lists what is IN that playlist
  if (searchTerms.length === 0) return base;
  return base.filter(r => matchesSearchTerms(r, searchTerms));
}

/* ---------- Advanced search modal ---------- */
// Quotes a value for the query string only when it actually needs it (has
// whitespace) — keeps the assembled query readable for the common
// one-word case instead of quoting everything unconditionally.
function advQuoteIfNeeded(v) {
  return /\s/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function openAdvSearch() {
  el.advSearchOverlay.hidden = false;
  el.advArtist.focus();
}

function closeAdvSearch() {
  el.advSearchOverlay.hidden = true;
}

function applyAdvSearch() {
  const clauses = [];
  const artist = el.advArtist.value.trim();
  const title = el.advTitle.value.trim();
  const genre = el.advGenre.value.trim();
  const label = el.advLabel.value.trim();
  const type = el.advType.value.trim();
  const catalog = el.advCatalog.value.trim();
  const descriptor = el.advDescriptor.value.trim();
  const scene = el.advScene.value.trim();
  const movement = el.advMovement.value.trim();
  const extra = el.advExtra.value.trim();
  const yearFrom = el.advYearFrom.value.trim();
  const yearTo = el.advYearTo.value.trim();
  const ratingMin = el.advRatingMin.value.trim();

  if (artist) clauses.push(`artist:${advQuoteIfNeeded(artist)}`);
  if (title) clauses.push(`title:${advQuoteIfNeeded(title)}`);
  if (genre) clauses.push(`genre:${advQuoteIfNeeded(genre)}`);
  if (label) clauses.push(`label:${advQuoteIfNeeded(label)}`);
  if (type) clauses.push(`type:${advQuoteIfNeeded(type)}`);
  if (catalog) clauses.push(`catalog:${advQuoteIfNeeded(catalog)}`);
  if (descriptor) clauses.push(`descriptor:${advQuoteIfNeeded(descriptor)}`);
  if (scene) clauses.push(`scene:${advQuoteIfNeeded(scene)}`);
  if (movement) clauses.push(`movement:${advQuoteIfNeeded(movement)}`);

  if (yearFrom && yearTo) clauses.push(yearFrom === yearTo ? `year:${yearFrom}` : `year:${yearFrom}-${yearTo}`);
  else if (yearFrom) clauses.push(`year:>=${yearFrom}`);
  else if (yearTo) clauses.push(`year:<=${yearTo}`);

  if (ratingMin) clauses.push(`rating:>=${ratingMin}`);

  if (extra) clauses.push(extra);

  el.searchInput.value = clauses.join(' ');
  state.query = el.searchInput.value.trim().toLowerCase();
  el.searchWrap.classList.toggle('mobile-search-has-value', !!state.query);
  buildLeftList();
  applyFiltersSort();
  closeAdvSearch();
}

// ---- Browsing, sorting and filtering: ONE set of rules, used by the Music grid and by a playlist's own view ----
function albumPassesBrowse(r, searchTerms) {          // does this album pass the search box, the Albums/Artists/Genres pick on the left, "Listened only" and the RYM filters?
    const matchesQuery = matchesSearchTerms(r, searchTerms);
    
    const matchesNav = !state.navFilter || (
      state.navFilter.mode === 'artist' ? sameArtist(r.artist, state.navFilter.value) :
      state.navFilter.mode === 'genre' ? filterGenreTags(r).some(g => genreNavMatches(state.genreTaxonomy, g, state.navFilter.value)) : 
      state.navFilter.mode === 'descriptor' ? parseDescriptors(r.rymDescriptors).some(d => descKey(d) === state.navFilter.value) :
      state.navFilter.mode === 'label' ? labelKeysOf(r).includes(state.navFilter.value) :
      r.row === state.navFilter.value
    );

    const matchesListened = !state.listenedOnly || hasLoggedListen(r);
    const matchesRym = (!state.rymMin || (r.rymRating || 0) >= state.rymMin) && (!state.rymMissingOnly || !r.rymRating);

    return matchesQuery && matchesNav && matchesListened && matchesRym;
}
// How popular a release is, from RYM's rating of it and the number of ratings (the same rules as for tracks, see track-popularity): where its number of ratings and its
// adjusted rating stand among all the rated releases of THIS library, combined so it is high only if it is high on both. A release without a rating AND a count has none.
let apopCache = null;
function albumPopMap() {                                              // every rated release worked out together (they are ranked against each other); kept for a second so a sort doesn't redo it for every comparison
  if (apopCache && Date.now() - apopCache.at < 1000) return apopCache.map;
  const entries = (state.raw || []).filter(it => Number(it.rymRating) > 0 && Number(it.rymVotes) > 0).map(it => ({ key: String(it.row), album: String(it.row), rating: Number(it.rymRating), votes: Number(it.rymVotes) }));
  apopCache = { at: Date.now(), map: tpopCompute(entries) }; return apopCache.map;
}
const albumPopOf = (it) => albumPopMap().get(String(it.row)) || null;
const albumPopSortVal = (it) => { const v = albumPopOf(it); return v ? (v.pop === null ? v.wr : v.pop) : -1; };          // (with fewer than five rated releases there is nothing to rank against: the adjusted rating orders them); unrated ones come last
function compareAlbumsBy(sortKey, a, b) {
  switch (sortKey) {
    case 'oldest': return dateVal(a.releaseDate) - dateVal(b.releaseDate);
    case 'artist': return a.artist.localeCompare(b.artist);
    case 'title': return a.title.localeCompare(b.title);
    case 'rating': return b.rating - a.rating;
    case 'rym': return (b.rymRating || 0) - (a.rymRating || 0);
    case 'rymVotes': return (b.rymVotes || 0) - (a.rymVotes || 0);          // the most-rated first
    case 'rymPop': return (albumPopSortVal(b) - albumPopSortVal(a)) || ((b.rymVotes || 0) - (a.rymVotes || 0));          // the most popular first; level ones by how many rated them
    case 'unrated': return a.rating - b.rating;
    case 'added': return dateVal(b.dateAdded) - dateVal(a.dateAdded);
    case 'genreMatch': return (genreFilterWeight(b) || 0) - (genreFilterWeight(a) || 0);
    case 'newest':
    default: return dateVal(b.releaseDate) - dateVal(a.releaseDate);
  }
}
// ---- ...and the playlist side of it ----
const PLAYLIST_SORT_LABELS = { newest: 'Newest release', rymVotes: 'Most RYM ratings', rymPop: 'Most popular (RYM)', oldest: 'Oldest release', artist: 'Artist A\u2013Z', title: 'Title A\u2013Z', rating: 'Top rated', rym: 'Top RYM rated', unrated: 'Unrated first', added: 'Recently added', genreMatch: 'Closest genre match' };
function activePlaylist() { return state.activePlaylistId ? (state.playlists.find(p => p.id === state.activePlaylistId) || null) : null; }
function playlistScopeRaw(playlist) {                            // the albums that are in this playlist (an album once, whether it is there whole or by a track): what the browser on the left lists
  const seen = new Set(), out = [];
  (playlist ? playlist.items : []).forEach(it => { const a = playlistAlbumFor(it); if (a && !seen.has(a.row)) { seen.add(a.row); out.push(a); } });
  return out;
}
function playlistViewOf(playlist) {                              // the playlist as it is SHOWN: narrowed by the search box / the browser / the filters, sorted, and flagged when it is not in its own order
  const terms = getSearchTerms(), narrowing = !!(terms.length || state.navFilter || state.listenedOnly || state.rymMin || state.rymMissingOnly);
  let entries = playlist.items.map((it, idx) => ({ it, idx, album: playlistAlbumFor(it) }));
  if (narrowing) entries = entries.filter(e => e.album && albumPassesBrowse(e.album, terms));
  let key = state.playlistSort || 'playlist';
  if (key === 'genreMatch' && !(state.navFilter && state.navFilter.mode === 'genre')) key = 'playlist';
  if (key !== 'playlist') entries.sort((x, y) => (!x.album - !y.album) || (x.album && y.album ? compareAlbumsBy(key, x.album, y.album) : 0) || x.idx - y.idx);
  const items = entries.map(e => e.it), grouped = !!(state.groupBy && state.groupBy !== 'none');
  return Object.assign({}, playlist, { items, total: playlist.items.length, narrowed: items.length !== playlist.items.length, sortKey: key, reorderable: key === 'playlist' && !narrowing && !grouped });
}
function playlistListRows(view) {                                // the default list view's rows, with group headings when Group by is on
  if (!state.groupBy || state.groupBy === 'none') return view.items.map((it, idx) => ({ it, idx }));
  const blank = { artist: '', title: '', genre: '', releaseDate: '', type: '' };
  const entries = view.items.map((it, idx) => Object.assign({}, playlistAlbumFor(it) || blank, { __it: it, __idx: idx })), rows = [];
  groupItems(entries, state.groupBy).forEach(g => {
    rows.push({ head: g.label, lvl: 1 });
    const put = (arr) => arr.forEach(e => rows.push({ it: e.__it, idx: e.__idx }));
    if (state.groupBy2 && state.groupBy2 !== 'none') groupItems(g.items, state.groupBy2).forEach(g2 => { rows.push({ head: g2.label, lvl: 2 }); put(g2.items); }); else put(g.items);
  });
  return rows;
}

function applyFiltersSort() {
  addonPublishIfChanged();      // the library just loaded or changed: tell the browser add-on (if any)
  rymMergeLocal();              // ...and show any RYM rating the sheet doesn't have yet from the copy kept in this browser
  const searchTerms = getSearchTerms();

  let list = state.raw.filter(r => albumPassesBrowse(r, searchTerms));

  // "Closest genre match" only means anything while a genre filter is
  // actually active — if the filter got cleared/changed to something else
  // while this was selected (rather than tracking down and patching every
  // place navFilter can change), fall back to the normal default here,
  // the one guaranteed choke point every filter/sort pass runs through.
  if (state.sort === 'genreMatch' && !(state.navFilter && state.navFilter.mode === 'genre')) {
    state.sort = 'newest';
    savePrefs();
  }
  list.sort((a, b) => compareAlbumsBy(state.sort, a, b));

  state.filtered = list;
  if (typeof catStatsSoon === 'function') catStatsSoon();
  if (state.activeTab === 'albums') renderGrid();
  if (!el.genreDescElement.hidden) renderGenreDescElement(); // stays in sync with whichever genre gets clicked, not just whatever it showed when first enabled
  if (!el.artistBioElement.hidden) renderArtistBioElement(); // follows the artist you click / filter to
  if (!el.chartElement.hidden) renderChartElement(); // same idea — Release Chart's own genre select also defaults to the left panel's active filter
}

// Syncs the "Sort & filter" popover's UI (which sort option is highlighted,
// whether "Listened only" is checked) to current state. Called whenever the
// popover opens, so it can't go stale from a change made some other way
// (e.g. the listened-filter icon button toggled directly).
function renderSortFilterMenu() {
  const isGenreFilter = !!(state.navFilter && state.navFilter.mode === 'genre');
  el.sortGenreMatchOption.hidden = !isGenreFilter;
  el.sortFilterMenu.querySelectorAll('.sort-filter-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === (state.activePlaylistId ? state.playlistSort : state.sort));
  });
  { const po = document.getElementById('sortPlaylistOrderOption'); if (po) po.hidden = !state.activePlaylistId; }
  el.sortFilterListenedToggle.checked = state.listenedOnly;
  el.sortFilterMenu.querySelectorAll('.genre-search-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.genreMode === state.genreSearchMode);
  });
  el.genreSearchHint.textContent = GENRE_SEARCH_HINTS[state.genreSearchMode] || '';
  el.firstGenreOnlyToggle.checked = state.firstGenreOnly;
  { const gx = document.getElementById('genreNavExactToggle'), gxh = document.getElementById('genreNavExactHint'); gx.checked = !!state.genreNavExact; gxh.hidden = !state.genreNavExact; }
  rymEl('sortRymMin').value = String(state.rymMin); rymEl('sortRymMissing').checked = state.rymMissingOnly;
  el.firstGenreHint.hidden = !state.firstGenreOnly;          // only worth the space while it's in effect
  el.firstGenreHint.textContent = FIRST_GENRE_HINTS[state.genreRole] || FIRST_GENRE_HINTS.any;
  { const gr = document.getElementById('genreRoleSelect'), grh = document.getElementById('genreRoleHint'); gr.value = state.genreRole; grh.hidden = state.genreRole === 'any'; grh.textContent = GENRE_ROLE_HINTS[state.genreRole] || ''; }
}

const GENRE_SEARCH_HINTS = {
  exact: 'genre:rock finds only releases tagged exactly \u201cRock\u201d.',
  subgenres: 'genre:rock also finds everything filed under Rock in your genre tree (Indie Rock, Twee Pop\u2026) \u2014 the same as picking it in the left panel.',
  loose: 'Also finds any genre whose name merely contains the text (rock \u2192 Krautrock), on top of sub-genres. The most inclusive option.'
};
const GENRE_SEARCH_LABELS = { exact: 'Exact genre only', subgenres: 'Include sub-genres', loose: 'Sub-genres + partial names' };

function hasLoggedListen(item) {
  return state.diary.some(d => d.artist === item.artist && d.title === item.title);
}

function dateVal(d) {
  const t = new Date(d).getTime();
  return isNaN(t) ? -Infinity : t;
}

// Full release date for the "Release Date" field option (see FIELD_OPTIONS)
// — an alternative to the plain "Release Year" field, for anywhere a field
// can be picked (grid slots, cover tags, list/Tracks columns). Same
// day-month-year style used elsewhere in the app (diary dates, stats).
function formatReleaseDate(item) {
  if (!item.releaseDate || dateVal(item.releaseDate) === -Infinity) return '';
  return formatReleaseDateStr(item.releaseDate);
}

// Release dates can be known to year, year+month, or full day precision —
// same three levels MusicBrainz/Spotify themselves distinguish (a lot of
// older/obscure releases genuinely only have a year on record). Rather than
// force a fake Jan 1 onto a year-only release, the stored string's own
// length ("YYYY" / "YYYY-MM" / "YYYY-MM-DD") records exactly how much is
// known, and every place that displays a release date reads that precision
// back out instead of assuming it's always a full date.
function releaseDatePrecision(str) {
  if (!str) return null;
  const s = String(str);
  if (/^\d{4}$/.test(s)) return 'year';
  if (/^\d{4}-\d{2}$/.test(s)) return 'month';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'day';
  return 'day'; // anything else (e.g. a full ISO timestamp) — treat as fully known
}
function formatReleaseDateStr(str) {
  const precision = releaseDatePrecision(str);
  if (!precision) return '';
  const d = new Date(String(str));
  if (precision === 'year') return String(d.getUTCFullYear());
  if (precision === 'month') return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' });
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Splits a stored release date into the three parts the Add/Edit form's
// Year/Month/Day fields work with. Normally that's our own plain
// "YYYY"/"YYYY-MM"/"YYYY-MM-DD" precision string, but it can also arrive as
// a full ISO timestamp like "2026-04-24T00:00:00.000Z" — that happens when
// the sheet cell got auto-converted to a real Date by Google Sheets (the
// exact failure mode _ensureColumn's asText fix exists to prevent going
// forward — see the backend — but can still show up for a cell that was
// already Date-formatted before that fix ran, or a backend not yet
// running it) and _readSheet serializes it back via toISOString(). The
// regex is intentionally NOT anchored at the end ($) so it matches just
// the leading YYYY-MM-DD and ignores whatever follows, instead of failing
// to match at all and silently returning three blank fields — which is
// exactly what was happening here (the sheet cell visibly had a date, the
// form just showed nothing).
function splitReleaseDate(str) {
  const s = String(str || '').trim();
  const m = /^(\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s);
  if (!m) return { year: '', month: '', day: '' };
  return { year: m[1] || '', month: m[2] || '', day: m[3] || '' };
}

// Inverse of splitReleaseDate — builds the most-precise string the given
// parts support. A day with no month, or a month with no year, is dropped
// rather than guessed at (the UI itself also disables those fields, this is
// just the same rule enforced on the way out).
function combineReleaseDate(year, month, day) {
  const y = String(year || '').trim();
  if (!y) return '';
  const m = String(month || '').trim();
  if (!m) return y;
  const d = String(day || '').trim();
  if (!d) return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

// Populates a Year/Month/Day field trio from a stored release date string,
// and wires the Month→Day enable/disable relationship. prefix is 'add' or
// 'edit'. Safe to call repeatedly (e.g. every time the Add/Edit modal
// opens) — options are only built once per select via its data-built flag.
function initReleaseDateFields(prefix) {
  const monthSel = el[`${prefix}ReleaseMonth`];
  const daySel = el[`${prefix}ReleaseDay`];
  if (monthSel && !monthSel.dataset.built) {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    monthNames.forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = String(i + 1).padStart(2, '0');
      opt.textContent = name;
      monthSel.appendChild(opt);
    });
    monthSel.dataset.built = '1';
  }
  if (daySel && !daySel.dataset.built) {
    for (let i = 1; i <= 31; i++) {
      const opt = document.createElement('option');
      opt.value = String(i).padStart(2, '0');
      opt.textContent = String(i);
      daySel.appendChild(opt);
    }
    daySel.dataset.built = '1';
  }
  // A day only means anything alongside a month — keep it disabled (and
  // cleared) until a month is actually picked, same relationship enforced
  // in combineReleaseDate on the way out.
  if (monthSel && daySel) {
    const syncDayEnabled = () => {
      daySel.disabled = !monthSel.value;
      if (!monthSel.value) daySel.value = '';
    };
    if (!monthSel.dataset.dayWired) {
      monthSel.addEventListener('change', syncDayEnabled);
      monthSel.dataset.dayWired = '1';
    }
    syncDayEnabled();
  }
}
function setReleaseDateFields(prefix, value) {
  initReleaseDateFields(prefix);
  const { year, month, day } = splitReleaseDate(value);
  el[`${prefix}ReleaseYear`].value = year;
  el[`${prefix}ReleaseMonth`].value = month;
  el[`${prefix}ReleaseDay`].value = day;
  el[`${prefix}ReleaseDay`].disabled = !month;
}
function getReleaseDateFields(prefix) {
  return combineReleaseDate(el[`${prefix}ReleaseYear`].value, el[`${prefix}ReleaseMonth`].value, el[`${prefix}ReleaseDay`].value);
}

// ---------- Recorded date (1.29.0) ----------
// Mirrors the releaseDate helpers immediately above, field for field —
// same "YYYY"/"YYYY-MM"/"YYYY-MM-DD" precision string, same Year/Month/Day
// form fields, kept as its own set of functions rather than generalized
// alongside releaseDate so this doesn't touch that already-working path.
// This is when the release was RECORDED, as distinct from releaseDate
// (when it came out) — the two commonly differ, e.g. a live album, or a
// reissue of older sessions.
function formatRecordedDate(item) {
  if (!item.recordedDate || dateVal(item.recordedDate) === -Infinity) return '';
  return formatRecordedDateStr(item.recordedDate);
}
function recordedDatePrecision(str) {
  if (!str) return null;
  const s = String(str);
  if (/^\d{4}$/.test(s)) return 'year';
  if (/^\d{4}-\d{2}$/.test(s)) return 'month';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'day';
  return 'day';
}
function formatRecordedDateStr(str) {
  const precision = recordedDatePrecision(str);
  if (!precision) return '';
  const d = new Date(str);
  if (precision === 'year') return String(d.getUTCFullYear());
  if (precision === 'month') return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' });
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
// Mirrors splitReleaseDate above, same fix for the same reason — see its
// comment for why the regex isn't end-anchored.
function splitRecordedDate(str) {
  const s = (str || '').trim();
  const m = /^(\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s);
  if (!m) return { year: '', month: '', day: '' };
  return { year: m[1] || '', month: m[2] || '', day: m[3] || '' };
}
function combineRecordedDate(year, month, day) {
  const y = String(year || '').trim();
  if (!y) return '';
  const m = String(month || '').trim();
  if (!m) return y;
  const d = String(day || '').trim();
  if (!d) return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}
function initRecordedDateFields(prefix) {
  const monthSel = el[`${prefix}RecordedMonth`];
  const daySel = el[`${prefix}RecordedDay`];
  if (monthSel && !monthSel.dataset.built) {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    monthNames.forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = String(i + 1).padStart(2, '0');
      opt.textContent = name;
      monthSel.appendChild(opt);
    });
    monthSel.dataset.built = '1';
  }
  if (daySel && !daySel.dataset.built) {
    for (let i = 1; i <= 31; i++) {
      const opt = document.createElement('option');
      opt.value = String(i).padStart(2, '0');
      opt.textContent = String(i);
      daySel.appendChild(opt);
    }
    daySel.dataset.built = '1';
  }
  if (monthSel && daySel) {
    const syncDayEnabled = () => {
      daySel.disabled = !monthSel.value;
      if (!monthSel.value) daySel.value = '';
    };
    if (!monthSel.dataset.dayWired) {
      monthSel.addEventListener('change', syncDayEnabled);
      monthSel.dataset.dayWired = '1';
    }
    syncDayEnabled();
  }
}
function setRecordedDateFields(prefix, value) {
  initRecordedDateFields(prefix);
  const { year, month, day } = splitRecordedDate(value);
  el[`${prefix}RecordedYear`].value = year;
  el[`${prefix}RecordedMonth`].value = month;
  el[`${prefix}RecordedDay`].value = day;
  el[`${prefix}RecordedDay`].disabled = !month;
}
function getRecordedDateFields(prefix) {
  return combineRecordedDate(el[`${prefix}RecordedYear`].value, el[`${prefix}RecordedMonth`].value, el[`${prefix}RecordedDay`].value);
}

// The group key(s) an item belongs under for a given "group by" choice —
// shared by the main grid's groupItems() below and buildLeftList's own
// left-panel grouping (state.leftGroupBy). An array since Genre can put
// one album under more than one heading (primary + secondary genre).
// Album-level only (getGenreList(combinedGenreStr), not allGenresForItem)
// — a per-track genre override must not change which genre group(s) the
// release itself falls under here, same reasoning as buildGenreTree above.
function groupKeysFor(item, by) {
  if (by === 'artist') return [item.artist];
  if (by === 'type') return [item.type];
  if (by === 'genre') {
    const genres = getGenreList(combinedGenreStr(item));
    // When a genre nav-filter is active (left panel), only group by
    // genres actually relevant to it — the filtered genre itself, or a
    // taxonomy descendant of it — not every genre this item happens to
    // carry. Otherwise filtering by Rock and then Group by Genre would
    // create a group for, say, Baroque Pop or Avant-Prog just because a
    // Rock-tagged album also happens to carry one of those as a
    // secondary genre, even though neither is nested under Rock at all.
    if (state.navFilter && state.navFilter.mode === 'genre') {
      const relevant = genres.filter(g => genreNavMatches(state.genreTaxonomy, g, state.navFilter.value));
      // Shouldn't ever be empty in practice — an item only reaches this
      // grouping step under a genre filter because at least one of its
      // own genres already matched it (see searchFilteredRaw's
      // matchesNav) — but fall back to the full list defensively rather
      // than silently dropping the item from every group.
      if (relevant.length) return relevant;
    }
    return genres;
  }
  if (by === 'year') return [dateVal(item.releaseDate) !== -Infinity ? String(new Date(item.releaseDate).getUTCFullYear()) : 'Unknown'];
  if (by === 'decade') {
    if (dateVal(item.releaseDate) === -Infinity) return ['Unknown'];
    const y = new Date(item.releaseDate).getUTCFullYear();
    return [(Math.floor(y / 10) * 10) + 's'];
  }
  return [];
}

function groupItems(items, by) {
  const map = new Map();
  items.forEach(item => {
    const keys = groupKeysFor(item, by);

    // This loop ensures multi-genre albums appear in every relevant group
    keys.forEach(key => {
      const groupKey = key || 'Unknown';
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(item);
    });
  });

  let sortedKeys = Array.from(map.keys());
  const numeric = by === 'year' || by === 'decade';
  sortedKeys.sort((a, b) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return numeric ? b.localeCompare(a) : a.localeCompare(b);
  });

  return sortedKeys.map(k => ({ label: k, items: map.get(k) }));
}	
