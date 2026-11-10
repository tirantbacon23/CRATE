// CRATE — Edit album, streaming quick-links, YouTube player and segments.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Edit album ---------- */

function openEditModal() {
  if (!activeItem) return;
  refreshGenreAutocompleteList();
  el.editOverlay.hidden = false;
  el.editGenreDiscogsStatus.hidden = true;
  el.editArtist.value = activeItem.artist || '';
  el.editTitle.value = activeItem.title || '';
  const validTypes = ['Album', 'EP', 'Single', 'Compilation', 'Live', 'Mixtape'];
  el.editType.value = validTypes.includes(activeItem.type) ? activeItem.type : 'Album';
  setReleaseDateFields('edit', activeItem.releaseDate || '');
  setRecordedDateFields('edit', activeItem.recordedDate || '');
  el.editGenre.value = activeItem.genre || '';
  el.editGenre2.value = activeItem.genre2 || '';
  el.editRegion.value = activeItem.region || '';
  el.editLocation.value = activeItem.location || '';
  el.editLabel.value = activeItem.label || '';
  el.editCatalog.value = activeItem.catalog || ''; // 👈 ADD THIS
  el.editDescriptor.value = activeItem.descriptor || '';
  { const rd = document.getElementById('editRymDescriptors'); if (rd) rd.value = activeItem.rymDescriptors || ''; }
  el.editScene.value = activeItem.scene || '';
  el.editMovement.value = activeItem.movement || '';
  el.editLink.value = activeItem.link || '';
  el.editRymLink.value = activeItem.rymLink || '';
  rymEl('editRymRating').value = activeItem.rymRating ? activeItem.rymRating.toFixed(2) : ''; rymEl('editRymVotes').value = activeItem.rymVotes ? String(activeItem.rymVotes) : '';
  el.editCover.value = activeItem.cover || '';
  el.editToast.textContent = '';
  renderTracklistBuilderRows(el.editTracksRows, activeItem.manualTracks || []);
  tlResetTools('edit');
}

function closeEditModal() { el.editOverlay.hidden = true; }

async function saveEditAlbum() {
  if (!activeItem) return;
  const artist = el.editArtist.value.trim();
  const title = el.editTitle.value.trim();
  if (!artist || !title) { flashToast(el.editToast, 'Artist and title are required'); return; }

  const rawRows = collectTracklistBuilderRows(el.editTracksRows, { minNext: tlMinNext(activeItem) });
  const manualTracks = tlPersist(rawRows, 'typed');
  // Same reasoning as saveNewAlbum: only actually write ManualTracks when
  // there's a reason to — either the builder has real rows in it, or the
  // album was already manual before this save (so an empty builder here
  // means deliberately clearing it, which should stick as "manual, zero
  // tracks" rather than silently reverting to the iTunes/MusicBrainz
  // auto-lookup — see isManualAlbum/hasManualTracklist). An album that was
  // never manual and still has no rows typed in just leaves ManualTracks
  // untouched, so editing an unrelated field (e.g. adding a Genre) doesn't
  // wipe out whatever tracklist the auto-lookup was already showing.
  const wasManual = isManualAlbum(activeItem);
  const shouldBeManual = manualTracks.length > 0 || wasManual;

  // Update the payload to include Catalog
  const payload = {
    action: 'editAlbum',
    row: activeItem.row,
    Artist: artist,
    Title: title,
    Type: el.editType.value,
    ReleaseDate: getReleaseDateFields('edit'),
    Recorded: getRecordedDateFields('edit'),
    Genre: el.editGenre.value.trim(),
    SecondaryGenre: el.editGenre2.value.trim(),
    Region: el.editRegion.value.trim(),
    Location: el.editLocation.value.trim(), // 👈 Map viewer — REQUIRES BACKEND COLUMN, see 1.29.14 log entry
    Label: el.editLabel.value.trim(),
    Catalog: el.editCatalog.value.trim(), // 👈 ADD THIS
    Descriptor: el.editDescriptor.value.trim(),
    RymDescriptors: descNormalizeField((document.getElementById('editRymDescriptors') || {}).value),
    Scene: el.editScene.value.trim(),
    Movement: el.editMovement.value.trim(),
    Link: el.editLink.value.trim(),
    RymLink: el.editRymLink.value.trim(),
    Cover: el.editCover.value.trim(),
    RymRating: rymNum(rymEl('editRymRating').value) || '', RymVotes: rymNum(rymEl('editRymRating').value) ? (rymVotesNum(rymEl('editRymVotes').value) || '') : '',
    RymSrc: rymNum(rymEl('editRymRating').value) ? (rymNum(rymEl('editRymRating').value) !== (activeItem.rymRating || 0) ? 'm' : (activeItem.rymSrc || 'm')) : ''     // typing a new value makes it yours; leaving it alone keeps whoever set it
  };
  if (shouldBeManual) payload.ManualTracks = JSON.stringify(manualTracks);

  const oldKey = artKey(activeItem);

  try {
    const editRes = await postUpdate(payload);
    
    // Update local state
    activeItem.artist = artist;
    activeItem.title = title;
    activeItem.type = el.editType.value;
    activeItem.releaseDate = payload.ReleaseDate;
    activeItem.recordedDate = payload.Recorded;
    activeItem.genre = payload.Genre;
    activeItem.genre2 = payload.SecondaryGenre;
    activeItem.region = payload.Region;
    activeItem.location = payload.Location;
    activeItem.label = payload.Label;
	activeItem.catalog = payload.Catalog || 'CRT-' + String(activeItem.row).padStart(3, '0'); // 👈 ADD THIS
    activeItem.descriptor = payload.Descriptor;
    activeItem.scene = payload.Scene;
    activeItem.movement = payload.Movement;
    activeItem.link = payload.Link;
    activeItem.rymLink = payload.RymLink;
    activeItem.rymRating = rymNum(payload.RymRating); activeItem.rymVotes = activeItem.rymRating ? rymVotesNum(payload.RymVotes) : 0; activeItem.rymSrc = payload.RymSrc || '';
    rymLocalSet(activeItem); if (activeItem.rymRating && !(editRes && editRes.rymSaved)) { activeItem._rymLocal = true; rymNoteLocalOnly(); } else { rymLocalClear(activeItem); activeItem._rymLocal = false; }
    activeItem.cover = payload.Cover;
    activeItem.manualTracks = manualTracks;
    activeItem.hasManualTracklist = shouldBeManual;
    tlApplyTrackRatings(activeItem, rawRows);       // track ratings that came from Rate Your Music (filled in synchronously, saved right after)
    setTimeout(addonPublish, 400);                  // an edit in place changes what the add-on is told you have (the add-on ignores an unchanged list)
    
    const newKey = artKey(activeItem);

    // Spotify/SoundCloud/RYM link resolution (getExternalLinksFor) is cached
    // per artKey — clear it so a changed Link/RYM Link, or an artist/title
    // edit that changes the key, gets re-resolved instead of showing stale
    // (or wrong) quick-links.
    delete state.linkCache[oldKey];
    delete state.linkCache[newKey];

    // getTracksFor()'s cache now also serves manually-typed tracklists (see
    // getTracksFor) — clear it too so an edited manual tracklist, or an
    // artist/title edit that changes the key, is picked up instead of
    // showing whatever was cached before this save.
    delete state.trackCache[oldKey];
    delete state.trackCache[newKey];
    
    // Manage artwork cache routing
    if (payload.Cover) {
      state.artCache[newKey] = { art: payload.Cover, collectionId: state.artCache[oldKey]?.collectionId || null };
    } else if (oldKey !== newKey || (state.artCache[oldKey] && state.artCache[oldKey].art && !payload.Cover && !state.artCache[oldKey].art.includes('itunes.apple.com'))) {
      delete state.artCache[newKey];
      fetchArt(activeItem); // Refetch from iTunes if cover was removed or title/artist changed
    } else if (oldKey !== newKey) {
      state.artCache[newKey] = state.artCache[oldKey]; // Maintain iTunes cache if just slightly renamed
    }

    flashToast(el.editToast, 'Changes saved');
    setTimeout(() => {
      closeEditModal();
      openDeck(activeItem); // Refreshes deck text instantly
      keepGridPlace(() => { buildLeftList(); applyFiltersSort(); });
    }, 700);
  } catch (err) {
    flashToast(el.editToast, 'Couldn\u2019t save — try again');
  }
}


/* ---------- Streaming / database quick-links ----------
   Spotify's own Search API gives the exact album page directly (given a
   free Client ID/Secret — see the Spotify API item in the ⚙ menu), so
   that's tried first for Spotify. Without credentials configured, or if
   the API call fails, this falls back to MusicBrainz's cross-linked
   "streaming" relationships (many editors add these on the release or
   release-group — since we already talk to MusicBrainz for tracklists, we
   ask it for those relationship URLs too, which also covers SoundCloud).
   RateYourMusic has no public API of its own and is rarely cross-linked on
   MusicBrainz, but Wikidata's WikiProject Albums editors frequently tag the
   same item with both a MusicBrainz release-group ID (P436) and a Rate Your
   Music release ID (P8392) — see fetchRymFromWikidata() below — so that's
   tried before falling all the way back to a plain RYM search link. The
   RYM Link field in Add/Edit always wins over all of this, though — a
   pasted-in link is assumed correct and skips the lookup entirely.
   Results are cached per album so we only ever look each one up once. */

function spotifySearchUrl(item) {
  return 'https://open.spotify.com/search/' + encodeURIComponent(item.artist + ' ' + item.title);
}
function soundcloudSearchUrl(item) {
  return 'https://soundcloud.com/search?q=' + encodeURIComponent(item.artist + ' ' + item.title);
}
function rymSearchUrl(item) {
  // searchtype=l restricts results to releases (albums/EPs/etc) rather than artists or songs.
  return 'https://rateyourmusic.com/search?searchterm=' + encodeURIComponent(item.artist + ' ' + item.title) + '&searchtype=l';
}

/* ---- RYM release resolution via Wikidata ----
   RateYourMusic release IDs on Wikidata (P8392) look like
   "album/stromae/racine-carree" and turn into a real page at
   https://rateyourmusic.com/release/$1/ — so once we have one, no search
   is needed. query.wikidata.org's SPARQL endpoint is public, unauthenticated
   and CORS-enabled, so it can be queried straight from the browser like any
   other fetch() here.

   Two ways in, tried in order:
   1. Join on the MusicBrainz release-group ID (P436) we already resolved
      via MusicBrainz elsewhere in getExternalLinksFor — this is the more
      reliable match since it's a hard ID-to-ID join, not a text match.
   2. If that comes up empty (either no release-group id to join on, or a
      Wikidata item exists but wasn't tagged with a RYM id), fall back to
      matching by artist + title label instead.
   Either way returns a real https://rateyourmusic.com/release/... URL, or
   null if Wikidata has nothing for this release. */

async function sparqlQuery(query) {
  try {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'query=' + encodeURIComponent(query)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.results && data.results.bindings) || [];
  } catch (e) {
    console.warn('Wikidata SPARQL query failed', e);
    return null;
  }
}

function rymUrlFromWikidataId(rymId) {
  // Values are stored without a trailing slash; the formatter URL Wikidata
  // documents for P8392 is https://rateyourmusic.com/release/$1/
  return 'https://rateyourmusic.com/release/' + rymId.replace(/^\/|\/$/g, '') + '/';
}

async function fetchRymFromWikidata(item, releaseGroupId) {
  // 1) Hard ID join on the MusicBrainz release-group id, when we have one.
  if (releaseGroupId) {
    const byMbid = await sparqlQuery(`
      SELECT ?rymId WHERE {
        ?item wdt:P436 "${releaseGroupId}".
        ?item wdt:P8392 ?rymId.
      } LIMIT 1
    `);
    if (byMbid && byMbid.length) return rymUrlFromWikidataId(byMbid[0].rymId.value);
  }

  // 2) Fall back to a label match on artist + title. CONTAINS + LCASE
  // instead of an exact match since Wikidata album labels frequently carry
  // punctuation/formatting differences from what's in the crate.
  const escape = s => s.replace(/["\\]/g, '\\$&').toLowerCase();
  const byLabel = await sparqlQuery(`
    SELECT ?rymId WHERE {
      ?item wdt:P8392 ?rymId;
            rdfs:label ?label;
            wdt:P175 ?artist.
      ?artist rdfs:label ?artistLabel.
      FILTER(LANG(?label) = "en" && CONTAINS(LCASE(?label), "${escape(item.title)}"))
      FILTER(LANG(?artistLabel) = "en" && CONTAINS(LCASE(?artistLabel), "${escape(item.artist)}"))
    } LIMIT 1
  `);
  if (byLabel && byLabel.length) return rymUrlFromWikidataId(byLabel[0].rymId.value);

  return null;
}

function youtubeSearchUrl(item) {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(item.artist + ' ' + item.title);
}

/* ---------- YouTube floating player ----------
   A persistent, draggable floating window for tracks with a manually-
   attached YouTube link (see the tracklist builder / manualTracks). Built
   on YouTube's real IFrame API (loaded lazily, once, on first use) rather
   than a plain embed src, so it can expose actual transport controls —
   play/pause, seek, volume + mute, fullscreen, minimize-to-a-slim-bar —
   and a local queue. Deliberately separate from the Spotify Web Playback
   SDK setup elsewhere in this file (spotifyPlayer, showMiniPlayer(), the
   docked mini player UI) rather than trying to unify the two into one
   transport — YouTube's IFrame API and Spotify's SDK are different
   playback engines with different queue/seek models, and manually-added
   albums are the one case that needs YouTube at all. Unlike the Spotify
   mini player (docked by default; "detach" into a floating window is
   opt-in), this one is *always* floating, since that's what a background
   YouTube video actually calls for. Modeled closely on that mini player's
   drag/seek/queue patterns (initPlayerDrag/initSeekDrag/queue-panel CSS)
   rather than reusing them directly, since this one also owns a video
   area and its own YT.Player instance. */
// BEGIN yt-segments
// A full-release video: ONE YouTube video that holds a whole release. A song's link is that video plus where the song starts and ends in it, kept IN the link
// ("watch?v=ID&t=284&end=546": YouTube itself starts at t= and ignores end=), so it goes wherever the link goes: saved, exported, played, matched.
function ytParseTime(s) {                                           // "90", "1:30", "1:02:03", "1m30s", "90s" -> whole seconds; NaN when it isn't a time
  const t = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ''); if (!t) return NaN;
  let m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s?)?$/.exec(t);
  if (m && (m[1] || m[2] || m[3])) { const v = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); return isFinite(v) ? Math.round(v) : NaN; }
  m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})(?:\.\d+)?$/.exec(t); if (!m) return NaN;
  const h = +m[1] || 0, mi = +m[2], se = +m[3]; if (se > 59 || (m[1] !== undefined && mi > 59)) return NaN;
  return h * 3600 + mi * 60 + se;
}
function ytFormatTime(sec) {                                        // 284 -> "4:44", 3723 -> "1:02:03"
  sec = Math.max(0, Math.round(Number(sec) || 0)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60, two = (n) => String(n).padStart(2, '0');
  return h ? h + ':' + two(m) + ':' + two(x) : m + ':' + two(x);
}
function youtubeSegmentFromUrl(url) {                               // { start, end } in seconds, 0 where the link says nothing
  const out = { start: 0, end: 0 }; let u; try { u = new URL(String(url || '')); } catch (e) { return out; }
  const q = u.searchParams, frag = /^#t=(.+)$/.exec(u.hash || '');
  const s = ytParseTime(q.get('t') || q.get('start') || (frag ? frag[1] : '')), e = ytParseTime(q.get('end') || '');
  if (s > 0) out.start = s; if (e > 0 && e > out.start) out.end = e; return out;
}
function youtubeLinkWithSegment(url, start, end) {                  // the video's plain link with where the song starts (and ends); '' when there is no video in it
  const id = youtubeVideoIdFromUrl(url); if (!id) return '';
  const s = Math.max(0, Math.round(Number(start) || 0)), e = Math.max(0, Math.round(Number(end) || 0)), base = videoPageUrl(id), sep = base.includes('?') ? '&' : '?';
  return base + (s > 0 || e > s ? sep : '') + [s > 0 ? 't=' + s : '', e > s ? 'end=' + e : ''].filter(Boolean).join('&');
}
// ---- Bilibili (1.95.0) ----
// A Bilibili video is kept in a song's video link just like a YouTube one ("https://www.bilibili.com/video/BV…?p=2&t=95&end=301"), so
// a full-release video there is set up in the same Full-release video dialog and played by the same player. Inside CRATE its id is
// "bili:<BV id>" ("bili:<BV id>~3" for part 3 of a video in parts), which is never a YouTube id: nothing sends it to YouTube.
const BILI_RE = /^(?:https?:\/\/)?(?:www\.|m\.)?bilibili\.com\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?video\/(BV[0-9A-Za-z]{10})(?![0-9A-Za-z])/i;          // (1.95.2) also the English site's "bilibili.com/en/video/…"
function biliIdFromUrl(url) {
  const t = String(url || '').trim(), m = BILI_RE.exec(t); if (!m) return '';
  let p = 1; try { p = Math.max(1, parseInt(new URL(/^https?:/i.test(t) ? t : 'https://' + t).searchParams.get('p'), 10) || 1); } catch (e) { /* part 1 */ }
  return 'bili:' + m[1] + (p > 1 ? '~' + p : '');
}
const isBiliId = (id) => /^bili:/.test(String(id || ''));
function biliParts(id) { const m = /^bili:(BV[0-9A-Za-z]{10})(?:~(\d+))?$/.exec(String(id || '')); return m ? { bvid: m[1], p: +(m[2] || 1) } : null; }
function videoPageUrl(id) { const b = biliParts(id); return b ? 'https://www.bilibili.com/video/' + b.bvid + (b.p > 1 ? '?p=' + b.p : '') : 'https://www.youtube.com/watch?v=' + id; }
const ytSegOf = (url, ms) => {                                      // what a queue entry carries: nothing for an ordinary link
  const g = youtubeSegmentFromUrl(url), len = Math.round((Number(ms) || 0) / 1000);
  if (!g.end && len > 0 && isBiliId(youtubeVideoIdFromUrl(url))) return { start: g.start || 0, end: (g.start || 0) + len };          // (1.95.1) Bilibili's player can't say when a video ends: a song on its own ends after its length
  return g.start || g.end ? g : {};
};          // what a queue entry carries: nothing for an ordinary link
function ytParseTimestampList(text) {                               // a video description's "0:00 Song" lines -> [{ start, end, title }]
  const out = [], TIME = /(?:\d{1,2}:)?\d{1,3}:\d{2}(?!\d)/g;
  String(text || '').split(/\r?\n/).forEach(line => {
    const times = line.match(TIME); if (!times) return;
    const start = ytParseTime(times[0]); if (isNaN(start)) return;
    let end = 0;
    if (times.length >= 2) { const i1 = line.indexOf(times[0]), i2 = line.indexOf(times[1], i1 + times[0].length); if (/^\s*[-\u2013\u2014>]+\s*$/.test(line.slice(i1 + times[0].length, i2))) { const e = ytParseTime(times[1]); if (e > start) end = e; } }
    let title = line;
    [times[0]].concat(end ? [times[1]] : []).forEach(tm => { const esc = tm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); title = title.replace(new RegExp('[\\[\\(]\\s*' + esc + '\\s*[\\]\\)]'), ' ').replace(tm, ' '); });
    title = title.replace(/\s+/g, ' ').replace(/^[\s\-\u2013\u2014|:.>\u2022*]+/, '').replace(/[\s\-\u2013\u2014|:.>\u2022*]+$/, '').replace(/^(?:#\d{1,3}|\d{1,3}\s*[.)\-\u2013\u2014:])\s*/, '').trim();
    out.push({ start, end, title });
  });
  return out;
}
function ytTitleNorm(x) { return String(x || '').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function ytAssignTimestamps(titles, parsed) {                       // each song's { start, end } or null: by order when there are as many lines as songs, else by title
  if (parsed.length === titles.length) return parsed.map(p => ({ start: p.start, end: p.end }));
  const norm = ytTitleNorm, used = new Set();
  return titles.map(t => {
    const n = norm(t); if (!n) return null; let hit = -1;
    parsed.forEach((q, i) => { if (hit < 0 && !used.has(i) && norm(q.title) === n) hit = i; });
    if (hit < 0) parsed.forEach((q, i) => { const pn = norm(q.title); if (hit < 0 && !used.has(i) && pn.length >= 3 && (pn.includes(n) || n.includes(pn))) hit = i; });
    if (hit < 0) return null; used.add(hit); return { start: parsed[hit].start, end: parsed[hit].end };
  });
}
function ytFillEnds(starts, total) {                                // starts in song order (seconds, or NaN) -> each song's end: where the next song that starts later begins; the last one ends at the video's end when that is known
  return starts.map((s, i) => { if (!(s >= 0)) return NaN; for (let j = i + 1; j < starts.length; j++) if (starts[j] > s) return starts[j]; return total > s ? total : NaN; });
}
function ytTimesFromLengths(lengths, intro) {                      // song lengths in seconds (in order; NaN or 0 = not known) -> [{ start, end }] back to back after the intro; a song after one with no length can't be placed (null)
  let at = Math.max(0, Math.round(Number(intro) || 0));
  return lengths.map(len => { if (at === null || !(len > 0)) { at = null; return null; } const r = { start: at, end: at + Math.round(len) }; at = r.end; return r; });
}
const ytTimestampLines = (desc) => String(desc || '').split(/\r?\n/).filter(l => /(?:\d{1,2}:)?\d{1,3}:\d{2}(?!\d)/.test(l)).join('\n').slice(0, 4000);          // only a description's lines with a time in them are kept
function ytTimingFrom(titles, lengths, info) {                      // where each song is in a full-release video -> { times: [{ start, end } | null], how, placed, named, agree }: from the video's chapters, else the times in its
  const n = titles.length, total = Math.round(((info && info.durationMs) || 0) / 1000);          // description, else your song lengths stretched to the video's length (when they come within 4% of it), else the lengths back to back
  const tries = [['chapters', ((info && info.chapters) || []).map(c => ({ start: Math.round(Number(c.start) || 0), end: 0, title: String(c.title || '') }))], ['description', ytParseTimestampList(info && info.description)]];
  for (const [how, raw] of tries) {
    const list = raw.filter(p => p.start >= 0 && (!total || p.start < total)).sort((a, b) => a.start - b.start);
    if (list.length < 2 || !n) continue;
    const starts = list.map(p => p.start);
    const times = ytAssignTimestamps(titles, list).map(g => { if (!g) return null; const end = g.end > g.start ? g.end : (starts.find(s => s > g.start) || (total > g.start ? total : 0)); return end > g.start ? { start: g.start, end } : null; });
    const placed = times.filter(Boolean).length; if (placed < Math.max(2, Math.ceil(n * 0.6))) continue;          // too few songs found in them: not this release's chapters
    const named = titles.filter(t => { const k = ytTitleNorm(t); return k && list.some(p => { const q = ytTitleNorm(p.title); return q === k || (q.length >= 3 && k.length >= 3 && (q.includes(k) || k.includes(q))); }); }).length;
    return { times, how, placed, named, agree: placed === n && (named >= n * 0.8 || (list.length === n && named >= n * 0.5)) };          // agree: every song placed, and (nearly) all of them by name
  }
  const secs = lengths.map(l => Number(l) || 0), sum = secs.reduce((a, b) => a + b, 0);
  if (total && sum && secs.every(l => l > 0) && Math.abs(total - sum) > 1 && Math.abs(total - sum) <= sum * 0.04) {          // a slightly faster or slower transfer, or gaps between the songs: spread evenly
    const r = total / sum; let at = 0;
    return { times: secs.map(l => { const s = Math.round(at * r); at += l; return { start: s, end: Math.round(at * r) }; }), how: 'scaled', placed: n, named: 0, agree: false };
  }
  const times = ytTimesFromLengths(secs, 0);
  return { times, how: 'lengths', placed: times.filter(Boolean).length, named: 0, agree: false };
}
function ytTimingWhy(t) { return !t ? '' : t.how === 'chapters' ? 'timed by the video’s chapters' : t.how === 'description' ? 'timed by the times in the video’s description' : t.how === 'scaled' ? 'placed from your song lengths, stretched to the video’s length' : 'placed back to back from your song lengths'; }
// END yt-segments
function youtubeVideoIdFromUrl(url) {                              // a YouTube video's id; for a Bilibili video, its "bili:" id (see biliIdFromUrl)
  if (!url) return '';
  const bili = biliIdFromUrl(url); if (bili) return bili;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/
  ];
  for (const re of patterns) {
    const m = String(url).match(re);
    if (m) return m[1];
  }
  return '';
}

function loadYtPlayerPrefs() {
  try { return JSON.parse(localStorage.getItem(YT_PLAYER_PREFS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveYtPlayerPrefs(patch) {
  try { localStorage.setItem(YT_PLAYER_PREFS_KEY, JSON.stringify({ ...loadYtPlayerPrefs(), ...patch })); }
  catch (e) { /* localStorage unavailable — safe to ignore */ }
}

let ytQueue = [];                // [{videoId, trackName}] — rebuilt each time a YT track is played
let ytQueueIndex = -1;
let ytPlayer = null;             // the YT.Player instance, created once and reused via loadVideoById
let ytApiPromise = null;         // resolves once https://www.youtube.com/iframe_api has loaded
let ytPlayerReadyPromise = null; // resolves once ytPlayer itself fires onReady
let ytIsPaused = false;
let ytDuration = 0;
let ytSeg = { start: 0, end: 0, fired: true, loadedAt: 0 };          // the part of the video the current track is (a full-release video holds many tracks); fired: its end has been handled
let ytLastKnownVolume = 80;      // remembered across sessions, shown on the master player's shared volume slider whenever activePlayerEngine is 'youtube'
let ytRealPlayer = null;         // the YouTube player itself: ytPlayer is it, or biliShim while a Bilibili video plays
const YTS = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };          // YouTube's player states (the numbers its API documents); the Bilibili stand-in uses them too, before YouTube's script is ever loaded

function loadYouTubeIframeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise(resolve => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') prevReady();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// Creates the underlying YT.Player exactly once and re-uses it across
// tracks via loadVideoById (rather than tearing down/rebuilding an iframe
// per track) — that's what lets the volume/mute state stay put as the
// queue advances.
function ensureYtPlayer() {
  if (ytPlayerReadyPromise) return ytPlayerReadyPromise;
  ytPlayerReadyPromise = loadYouTubeIframeApi().then(() => new Promise(resolve => {
    ytPlayer = ytRealPlayer = new YT.Player('ytPlayerMount', {
      width: '100%', height: '100%',
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 0, iv_load_policy: 3, fs: 0 },          // (1.94.3) none of YouTube's own controls: the player bar has them, and the floating video shows CRATE's own on hover (42-floating-video.js)
      events: {
        onReady: (e) => {
          const prefs = loadYtPlayerPrefs();
          ytLastKnownVolume = prefs.volume ?? 80;
          e.target.setVolume(ytLastKnownVolume);
          if (activePlayerEngine === 'youtube') el.miniPlayerVolume.value = ytLastKnownVolume;
          resolve(e.target);
        },
        onStateChange: (e) => { if (ytPlayer === ytRealPlayer) onYtPlayerStateChange(e); }          // (none while a Bilibili video is playing)
      }
    });
  }));
  return ytPlayerReadyPromise;
}

function onYtPlayerStateChange(e) {
  if (e.data === YTS.ENDED) {
    ytSeg.fired = true;
    if (ytPlayer === biliShim && !(ytQueueIndex < ytQueue.length - 1 && biliContinues(ytQueue[ytQueueIndex + 1]))) biliHalt();          // Bilibili's player can't be told where to stop: it is stopped here, unless the next song simply follows on in the same video
    ytScrobbleFlush(); // it ended: counts if it was played for half its length or 4 minutes (Last.fm's rule), before anything below moves on to another track
    if (ytQueueIndex < ytQueue.length - 1) { playYtQueueIndex(ytQueueIndex + 1); return; }
    setYtPlayPauseUI(true);
    // This video standing in for the current entry of a "Play playlist"
    // run (see playCrateTrackOnYoutube) just finished with nothing left
    // in its own local queue — hand control back to the playlist queue
    // instead of just stopping here.
    if (ytPlayingForCrateQueue && isPlayingCrateQueue()) {
      playCrateQueueIndex(crateQueueId, crateQueueIndex + 1);
    }
    return;
  }
  if (e.data === YTS.PLAYING) {
    phoneTapToStartDone();
    setYtPlayPauseUI(false);
    ytDuration = ytPlayer.getDuration() || 0;
    ytScrobbleResume();          // Last.fm: the clock for THIS play runs while it plays (and the "now playing" is sent the first time)
  }
  else if (e.data === YTS.PAUSED) { setYtPlayPauseUI(true); ytScrobblePause(); }
  else if (e.data === YTS.BUFFERING) ytScrobblePause();
}

// ---- The Bilibili stand-in player (1.95.0) ----
// Bilibili's embedded player (player.bilibili.com) takes where to start but offers no way for a page to control it or ask where it is. So
// CRATE keeps its own clock from the moment the player loads, and the rest of the app talks to biliShim exactly as to YouTube's player:
// pausing unloads it (remembering where), playing or seeking loads it again at that moment, and the full-release loop (js/11) moves on at
// a song's end. Its clock can run a second or two ahead if the video stalls, and the volume can only be set in Bilibili's own player.
const bili = { frame: null, bvid: '', p: 1, playing: false, base: 0, at: 0, end: 0 };
function biliFrame() {
  if (bili.frame && bili.frame.isConnected) return bili.frame;
  const f = document.createElement('iframe');
  f.id = 'biliPlayerFrame'; f.className = 'bili-player-frame'; f.title = 'Bilibili player';
  f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.setAttribute('allowfullscreen', ''); f.style.display = 'none';
  f.addEventListener('load', () => { if (bili.playing) bili.at = Date.now(); });          // the clock starts when the player has loaded, not when it was asked for
  el.miniPlayerVideoWrap.appendChild(f); bili.frame = f; return f;
}
function biliShow(on) {
  const yt = document.getElementById('ytPlayerMount'); if (yt) yt.style.display = on ? 'none' : '';
  if (bili.frame) bili.frame.style.display = on ? '' : 'none';
}
const biliNow = () => bili.playing ? bili.base + (Date.now() - bili.at) / 1000 : bili.base;
function biliLoad(t) {
  t = Math.max(0, Math.floor(Number(t) || 0));
  biliFrame().src = 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(bili.bvid) + '&p=' + bili.p + '&t=' + t + '&autoplay=1&danmaku=0&high_quality=1';
  bili.base = t; bili.at = Date.now(); bili.playing = true; biliShow(true);
}
function biliHalt() { if (bili.playing) bili.base = biliNow(); bili.playing = false; if (bili.frame) bili.frame.src = 'about:blank'; }
function biliStop() { biliHalt(); bili.bvid = ''; bili.end = 0; biliShow(false); }
function biliContinues(q) {                                         // the next song starts where this one ends, in the video already playing: it plays on, nothing reloads
  const b = q && biliParts(q.videoId);
  return !!(b && bili.playing && b.bvid === bili.bvid && b.p === bili.p && Math.abs(biliNow() - (q.start || 0)) <= 3);
}
const biliState = (code) => setTimeout(() => { if (ytPlayer === biliShim) onYtPlayerStateChange({ data: code }); }, 0);
function biliPlay(q) {
  const b = biliParts(q.videoId); if (!b) return;
  if (ytRealPlayer && ytPlayer === ytRealPlayer) { try { ytRealPlayer.stopVideo(); } catch (e) { /* not ready */ } }
  const goesOn = biliContinues(q);
  ytPlayer = biliShim; bili.end = q.end || 0;
  if (!goesOn) { bili.bvid = b.bvid; bili.p = b.p; biliLoad(q.start || 0); }
  biliState(YTS.PLAYING);
}
const biliShim = {
  getCurrentTime: () => biliNow(),
  getDuration: () => bili.end || 0,                                 // known only for a song inside a full-release video (its end)
  getPlayerState: () => bili.playing ? YTS.PLAYING : YTS.PAUSED,
  playVideo() { if (!bili.playing && bili.bvid) { biliLoad(bili.base); biliState(YTS.PLAYING); } },
  pauseVideo() { if (bili.playing) { biliHalt(); biliState(YTS.PAUSED); } },
  seekTo(s) { bili.base = Math.max(0, Number(s) || 0); if (bili.playing) biliLoad(bili.base); },
  stopVideo() { biliStop(); },
  setVolume(v) { ytLastKnownVolume = v; }, getVolume: () => ytLastKnownVolume,
  mute() {}, unMute() {}, isMuted: () => false
};

function setYtPlayPauseUI(paused) {
  ytIsPaused = paused;
  if (activePlayerEngine !== 'youtube') return; // stale event from a video no longer on screen — Spotify owns the shared button now
  setMiniPlayerPlayPauseIcon(paused);
}

// Clicking a track's "▶ YT" button builds a queue out of every track in its
// own album that has a YouTube link attached (not just the one clicked), so
// Prev/Next and the queue panel below have the rest of the album to work
// with. `tracks` should be that album's track list; the deck's own tracklist
// click handler omits it and falls back to currentTracklistTracks (populated
// by loadTracklist()/renderTracklistBody() for whatever's open in the deck),
// which is correct there since the two always match. Every OTHER call site
// (the "Album and Tracks" view, the flat Tracks table's double-click,
// playTrackNow()'s manual-album branch) now passes its own album's tracks
// explicitly instead of relying on that global — it used to fall back to
// currentTracklistTracks there too, but that reflects whatever album
// happens to be open in the deck, not necessarily the one being played, so
// a mismatch meant the clicked video's ID wasn't found in the (wrong) list
// and playback silently landed on ytQueue[0] instead — some other, unrelated
// track. Falls back to a single-track queue when there's no tracklist
// context at all (or nothing else in it has a YouTube link).
function openYoutubePlayer(url, trackName, tracks, item) {
  ytPlayingForCrateQueue = false; // manual play, not the "Play playlist" queue — see playCrateTrackOnYoutube
  if (item) nowPlayingItem = item;
  const videoId = youtubeVideoIdFromUrl(url);
  if (!videoId) { flashGlobalToast('That doesn\u2019t look like a valid YouTube link'); return; }
  nowPlayingYoutubeLink = url;

  const ytTracks = (tracks || currentTracklistTracks || []).filter(t => t.youtubeLink && youtubeVideoIdFromUrl(t.youtubeLink));
  if (ytTracks.length) {
    ytQueue = ytTracks.map(t => Object.assign({ videoId: youtubeVideoIdFromUrl(t.youtubeLink), trackName: t.trackName || 'Untitled track' }, ytSegOf(t.youtubeLink, t.trackTimeMillis)));
    const seg = youtubeSegmentFromUrl(url);          // (in a full-release video every song has the same video: the clicked one is told apart by where it starts)
    let idx = ytQueue.findIndex(q => q.videoId === videoId && (q.start || 0) === seg.start && (q.end || 0) === seg.end);
    if (idx === -1) idx = ytQueue.findIndex(q => q.videoId === videoId);
    ytQueueIndex = idx === -1 ? 0 : idx;
  } else {
    ytQueue = [Object.assign({ videoId, trackName: trackName || 'Now playing' }, ytSegOf(url))];
    ytQueueIndex = 0;
  }

  if (state.shuffle && ytQueue.length > 1) { ensureOrigSeq(ytQueue); shuffleTail(ytQueue, ytQueueIndex); } // the clicked track plays first; the rest of the album is shuffled
  playYtQueueIndex(ytQueueIndex);
}

// ---- Full-release video: one YouTube video that is the whole release. Say where each song starts and ends in it. ----
let fv = null;                                                      // { item, intro, rows: [{ n, title, start, end, len }] } while the dialog is open (start/end are what is typed; len: the song's length you have, in seconds, 0 if none)
const fvEl = (id) => document.getElementById(id);
async function fvOpen(item, hintUrl) {
  if (!item) return;
  let tracks = []; try { tracks = (await getTracksFor(item)) || []; } catch (e) { /* none */ }
  tracks = tracks.filter(t => t && t.trackNumber);
  if (!tracks.length) { flashGlobalToast('This release has no tracklist yet: add one first (Edit details, or Match songs).'); return; }
  try { mergeTrackLinkOverrides(item, tracks); } catch (e) { /* as they are */ }
  const counts = {}; tracks.forEach(t => { const id = youtubeVideoIdFromUrl(t.youtubeLink); if (id) counts[id] = (counts[id] || 0) + 1; });
  const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0], shared = common && counts[common] >= 2 ? common : '';          // two songs on one video: that is the full-release video already
  const hint = youtubeVideoIdFromUrl(hintUrl) || (shared ? '' : youtubeVideoIdFromUrl(item.link));          // (the release's own link, when it is a YouTube video)
  const id = hint || shared, url = id ? videoPageUrl(id) : '';
  fv = { item, rows: tracks.map(t => { const same = id && youtubeVideoIdFromUrl(t.youtubeLink) === id, g = same ? youtubeSegmentFromUrl(t.youtubeLink) : { start: 0, end: 0 }; return { n: t.trackNumber, title: t.trackName || '', start: same ? ytFormatTime(g.start) : '', end: g.end ? ytFormatTime(g.end) : '', len: Math.round((Number(t.trackTimeMillis) || 0) / 1000) }; }), intro: 0 };
  const firstStart = fv.rows.map(r => r.start.trim() ? ytParseTime(r.start) : NaN).find(s => s >= 0); if (firstStart > 0) fv.intro = firstStart;          // times saved before: the intro is where song 1 starts
  const autoFill = !!id && fv.rows.every(r => !r.start && !r.end) && fv.rows.every(r => r.len > 0);          // a video with no times yet, and every song's length known: placed back to back to begin with
  fvEl('fullVideoFound').hidden = true; fvEl('fullVideoFound').innerHTML = ''; fvEl('fullVideoSub').textContent = `${item.artist} \u2014 ${item.title}`; fvEl('fullVideoUrl').value = url; fvEl('fullVideoPasteBox').hidden = true; fvEl('fullVideoPasteText').value = ''; fvEl('fullVideoPasteMsg').textContent = '';
  fvEl('fullVideoIntro').value = ytFormatTime(fv.intro); fvEl('fullVideoIntro').classList.remove('bad'); fvEl('fullVideoFromLengths').disabled = !fv.rows.some(r => r.len > 0);
  if (autoFill) fvFromLengths(true); else fvRender();
  fvEl('fullVideoOverlay').hidden = false;
  (url ? document.querySelector('#fullVideoList [data-fv="start"]') : fvEl('fullVideoUrl')).focus();
}
function fvClose() { fvEl('fullVideoOverlay').hidden = true; fv = null; }
function fvRender() {
  if (!fv) return;
  const field = (which, v, n) => `<span class="fv-time"><input type="text" data-fv="${which}" value="${escapeHtml(v)}" placeholder="${which === 'start' ? '0:00' : 'm:ss'}" aria-label="${which === 'start' ? 'Starts' : 'Ends'}, song ${n}" autocomplete="off"><button type="button" class="chip-btn" data-fv-now="${which}" title="Use the time the video is at now" aria-label="Use the video's time now">⏱</button></span>`;
  fvEl('fullVideoList').innerHTML = '<div class="fv-row fv-head"><span>#</span><span>Song</span><span title="The length you have for the song">Length</span><span>Starts</span><span>Ends</span><span></span></div>' +
    fv.rows.map((r, i) => `<div class="fv-row" data-i="${i}"><span class="sm-num">${escapeHtml(String(r.n))}</span><span class="sm-title">${escapeHtml(r.title)}</span><span class="fv-len">${r.len ? ytFormatTime(r.len) : '\u2014'}</span>${field('start', r.start, r.n)}${field('end', r.end, r.n)}<button type="button" class="chip-btn" data-fv-play title="Play this part" aria-label="Play this part">▶</button></div>`).join('');
  fvValidate();
}
function fvValidate() {                                             // reads what is typed, marks what is wrong, says what is there, and decides whether it can be saved
  if (!fv) return { ok: false, rows: [] };
  const url = fvEl('fullVideoUrl').value.trim(), id = youtubeVideoIdFromUrl(url); let bad = 0, has = 0, warn = 0, off = 0, prev = -1; const rows = [];
  fv.rows.forEach((r, i) => {
    const node = document.querySelector(`#fullVideoList .fv-row[data-i="${i}"]`); if (!node) return;
    const sIn = node.querySelector('[data-fv="start"]'), eIn = node.querySelector('[data-fv="end"]'); r.start = sIn.value; r.end = eIn.value;
    const s = r.start.trim() ? ytParseTime(r.start) : null, e = r.end.trim() ? ytParseTime(r.end) : null;
    const sBad = s !== null && isNaN(s), eBad = e !== null && (isNaN(e) || (s !== null && !isNaN(s) && e <= s));
    sIn.classList.toggle('bad', sBad); eIn.classList.toggle('bad', eBad); if (sBad || eBad) bad++;
    const sv = s !== null && !isNaN(s) ? s : null, ev = e !== null && !isNaN(e) ? e : null; if (sv !== null || ev !== null) has++;
    if (sv !== null) { if (sv < prev) warn++; prev = Math.max(prev, sv); }
    const longBy = sv !== null && ev !== null && r.len ? (ev - sv) - r.len : 0, isOff = Math.abs(longBy) > 3;          // the part is more than 3 s longer or shorter than the song's length
    node.classList.toggle('fv-off', isOff); node.querySelector('.fv-len').title = isOff ? `This part is ${ytFormatTime(Math.abs(longBy))} ${longBy > 0 ? 'longer' : 'shorter'} than the song` : ''; if (isOff) off++;
    rows.push({ n: r.n, start: sv || 0, end: ev || 0, has: sv !== null || ev !== null });
  });
  const ok = !!id && !bad && has > 0;
  fvEl('fullVideoStatus').textContent = !id ? (url ? 'That link isn\u2019t a YouTube or Bilibili video, so Save stays off: paste the video\u2019s own address.' : 'Paste the full-release video\u2019s link above.') : bad ? `${bad} time${bad === 1 ? '' : 's'} to fix (in red).` : `${has} of ${fv.rows.length} songs have times.` + (warn ? ` ${warn} start${warn === 1 ? 's' : ''} earlier than a song before ${warn === 1 ? 'it' : 'them'}.` : '') + (off ? ` ${off} ${off === 1 ? 'part doesn\u2019t' : 'parts don\u2019t'} match the song\u2019s length (amber).` : '');
  fvEl('fullVideoSave').disabled = !ok;
  return { ok, url, id, rows };
}
function fvCurrentTime(id) {                                        // where the video is now, when CRATE's player has THIS video; else null
  if (activePlayerEngine !== 'youtube' || !ytPlayer || !ytPlayer.getCurrentTime) return null;          // (a Bilibili video's time is CRATE's own clock: close, not exact)
  const q = ytQueue[ytQueueIndex]; if (!q || q.videoId !== id) return null;
  try { return Math.round(ytPlayer.getCurrentTime() || 0); } catch (e) { return null; }
}
// "Later songs move too" (1.95.1): a start moved by some seconds takes its own end and every later song's times along by as much, for
// a gap the uploader left between songs. Off (the default), only that start moves: silence at the start of the song itself.
const FV_FOLLOW_KEY = 'crate_fv_follow_v1';
function fvFollowOn() { try { return localStorage.getItem(FV_FOLLOW_KEY) === '1'; } catch (e) { return false; } }
function fvShiftFrom(i, delta) {                                    // row i's end and every later row's start and end move by delta seconds (times not given stay empty)
  if (!fv || !delta) return 0; let n = 0;
  const move = (t) => { if (!String(t).trim()) return t; const s = ytParseTime(t); if (isNaN(s)) return t; n++; return ytFormatTime(Math.max(0, s + delta)); };
  fv.rows.forEach((r, k) => { if (k < i) return; if (k > i) r.start = move(r.start); r.end = move(r.end); });
  return n;
}
function fvStartMoved(i, oldText, newText) {                        // after a start changes: with the switch on, the rest follow
  if (!fv || !fvFollowOn()) return;
  const a = String(oldText || '').trim() ? ytParseTime(oldText) : NaN, b = String(newText || '').trim() ? ytParseTime(newText) : NaN;
  if (isNaN(a) || isNaN(b) || a === b) return;                     // a start typed for the first time has nothing to move from
  fvValidate(); fv.rows[i].start = ytFormatTime(b);
  const n = fvShiftFrom(i, b - a); fvRender();
  if (n) fvEl('fullVideoStatus').textContent = fvLinkNote() + `Moved ${n} later time${n === 1 ? '' : 's'} ${ytFormatTime(Math.abs(b - a))} ${b > a ? 'later' : 'earlier'} with it.`;
}
function fvNow(which, i) {
  const v = fvValidate(), id = youtubeVideoIdFromUrl(fvEl('fullVideoUrl').value.trim());
  if (!id) { flashGlobalToast('Paste the full-release video\u2019s link first.'); return; }
  const t = fvCurrentTime(id); if (t === null) { flashGlobalToast('Play the video with \u201c\u25b6 Play it here\u201d first, then press \u23f1 as a song begins.'); return; }
  const rowEl = (k) => document.querySelector(`#fullVideoList .fv-row[data-i="${k}"]`);
  const was = rowEl(i).querySelector(`[data-fv="${which}"]`).value;
  rowEl(i).querySelector(`[data-fv="${which}"]`).value = ytFormatTime(t);
  if (which === 'start' && fvFollowOn() && String(was).trim()) { fvStartMoved(i, was, ytFormatTime(t)); return; }          // (the song before keeps its own end: the gap is between them)
  if (which === 'start' && i > 0) { const prevEnd = rowEl(i - 1).querySelector('[data-fv="end"]'); if (!prevEnd.value.trim()) prevEnd.value = ytFormatTime(t); }          // where one song starts the one before it ends
  fvValidate();
}
function fvPlayPart(i) {
  const v = fvValidate(); if (!v.id) { flashGlobalToast('Paste the full-release video\u2019s link first.'); return; }
  const r = v.rows[i], link = youtubeLinkWithSegment(v.url, r && r.start, r && r.end);
  openYoutubePlayer(link, fv.rows[i].title, [], fv.item);          // (just this part: an empty list so the rest of the album is not queued after it)
}
function fvApplyPaste() {
  if (!fv) return; fvValidate();
  const parsed = ytParseTimestampList(fvEl('fullVideoPasteText').value), msg = fvEl('fullVideoPasteMsg');
  if (!parsed.length) { msg.textContent = 'No times found. Each line needs one, like 0:00 Song.'; return; }
  const got = ytAssignTimestamps(fv.rows.map(r => r.title), parsed); let k = 0;
  fv.rows.forEach((r, i) => { const g = got[i]; if (!g) return; r.start = ytFormatTime(g.start); r.end = g.end ? ytFormatTime(g.end) : ''; k++; });
  const ends = ytFillEnds(fv.rows.map(r => r.start.trim() ? ytParseTime(r.start) : NaN), 0);
  fv.rows.forEach((r, i) => { if (!r.end && !isNaN(ends[i])) r.end = ytFormatTime(ends[i]); });
  msg.textContent = `Matched ${k} of ${fv.rows.length} songs` + (parsed.length !== fv.rows.length ? ` (the description has ${parsed.length} lines)` : '') + '.';
  fvRender();
}
function fvLinkNote() { return fv && !youtubeVideoIdFromUrl(fvEl('fullVideoUrl').value.trim()) ? 'Save needs a YouTube or Bilibili video link above. ' : ''; }          // (1.95.2) a status that replaces fvValidate's still says why Save is off
function fvFromLengths(quiet) {                                     // every song placed back to back from the lengths you have, after the intro
  if (!fv) return; if (!quiet) fvValidate();
  const got = ytTimesFromLengths(fv.rows.map(r => r.len), fv.intro); let k = 0;
  fv.rows.forEach((r, i) => { const g = got[i]; if (!g) return; r.start = ytFormatTime(g.start); r.end = ytFormatTime(g.end); k++; });
  fvRender();
  const miss = fv.rows.length - k; fvEl('fullVideoStatus').textContent = fvLinkNote() + `Placed ${k} of ${fv.rows.length} songs from their lengths, after an intro of ${ytFormatTime(fv.intro)}.` + (miss ? ` ${miss} after a song with no length ${miss === 1 ? 'needs its' : 'need their'} times set by hand.` : '') + ' Play a part to check it; change Intro if the first song starts later.';
}
function fvSetIntro() {                                             // a new intro moves every time already there by the same amount
  if (!fv) return; const inp = fvEl('fullVideoIntro'), v = ytParseTime(inp.value.trim() || '0');
  inp.classList.toggle('bad', isNaN(v)); if (isNaN(v)) return;
  const d = v - fv.intro; fv.intro = v; inp.value = ytFormatTime(v); if (!d) return;
  fvValidate();
  const move = (t) => { if (!t.trim()) return t; const s = ytParseTime(t); return isNaN(s) ? t : ytFormatTime(Math.max(0, s + d)); };
  fv.rows.forEach(r => { r.start = move(r.start); r.end = move(r.end); });
  fvRender();
}
// ----- finding the video: a YouTube search for the whole release, ranked by its title, its artist and how close its length is to your songs' -----
function fvWords(s) { return smWords(smFold(s)).replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' $& ').split(/\s+/).filter(w => w && w !== 'the'); }          // Japanese has no spaces between words: each kana or kanji counts as one
function fvScoreVideo(item, totalMs, v) {                           // -> { score 0..100, diffMs (video length minus the songs', 0 when either is unknown) }
  const have = new Set(fvWords(`${v.title} ${v.channel || ''}`)), frac = (s) => { const w = fvWords(s); return w.length ? w.filter(x => have.has(x)).length / w.length : 0; };
  const title = frac(smCore(item.title)), artist = frac(item.artist), full = /\b(full|complete|whole|entire)\s+(album|ep|lp|record)\b|\bfull\s+(length|release)\b/i.test(v.title) ? 1 : 0;
  let len = 0.5, diffMs = 0;
  if (totalMs > 0 && v.durationMs > 0) {
    diffMs = v.durationMs - totalMs; const d = Math.abs(diffMs) / totalMs;
    len = d <= 0.03 ? 1 : Math.max(0, 1 - d * 3);
    if (v.durationMs < totalMs * 0.6) len = 0;                       // much shorter than the release: one song, a trailer
  }
  const mine = ` ${fvWords(`${item.title} ${item.artist} ${item.type || ''}`).join(' ')} `, theirs = ` ${fvWords(v.title).join(' ')} `;
  const odd = ['reaction', 'reacts', 'review', 'cover', 'covers', 'tribute', 'karaoke', 'slowed', 'reverb', 'sped up', 'nightcore', '8d', 'remix', 'remixed', 'bass boosted', 'instrumental', 'acapella', '8 bit', 'piano version', 'live', 'demo', 'demos', 'outtake', 'outtakes', 'rehearsal', 'rehearsals', 'alternate', 'alt take', 'acoustic', 'unplugged'];
  const takes = /\btakes? \d/.test(theirs) && !/\btakes? \d/.test(mine);          // "(take 4-6)": studio takes of one song
  const other = takes || odd.some(w => theirs.includes(` ${w} `) && !mine.includes(` ${w} `)) ? 1 : 0;          // a reaction, a cover, a slowed or live version, demos and outtakes: not the release (unless the release is one)
  const topic = / - topic$/i.test(v.channel || '') && artist >= 0.99 ? 1 : 0, yr = (String(item.releaseDate || '').match(/\b(?:19|20)\d{2}\b/) || [])[0], year = yr && theirs.includes(` ${yr} `) ? 1 : 0;          // the artist's own "- Topic" channel; the release's year in the title
  return { score: Math.max(0, Math.min(100, Math.round(40 * title + 15 * artist + 35 * len + 10 * full + 5 * topic + 5 * year - 35 * other))), diffMs, titleFit: title };
}
async function ytVideoInfo(v) {                                     // a found video's chapters and description: its page through the add-on (free), or the description the API's search already brought; null when there is neither
  if (ytUseAddon()) {
    try { const r = (await ytAddonRequest({ kind: 'video', id: v.id }))[0]; if (r) return { durationMs: r.durationMs || v.durationMs || 0, description: ytTimestampLines(r.description), chapters: Array.isArray(r.chapters) ? r.chapters.slice(0, 200) : [] }; }
    catch (e) { /* an add-on older than 1.4.0 can't read a video's page: the song lengths still place the songs */ }
    return null;
  }
  return v.description ? { durationMs: v.durationMs || 0, description: v.description, chapters: [] } : null;
}
async function ytTimeVideos(list, titles, lengths) {                // each video's v.timing: where the songs are in it
  for (const v of list) { if (v.timing) continue; const info = await ytVideoInfo(v); v.timing = ytTimingFrom(titles, lengths, info || { durationMs: v.durationMs || 0 }); }
}
async function ytFindFullVideos(item, knownMs) {                    // YouTube videos that may be the whole release, best first (at most six): through the add-on (free) or the API (100 units; remembered). Throws as the lookups do.
  const viaAddon = ytUseAddon();
  const clean = String(item.title).replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim(), q = `${item.artist} ${clean} full album`, ck = 'full|' + ytCacheNorm(q);
  let vids = [];
  const known = viaAddon ? null : ytCacheGet(ck), fromAddon = async (qq) => (await ytAddonRequest({ kind: 'search-video', q: qq })).slice(0, 12).map(v => ({ id: v.id, title: v.title || '', channel: v.channel || '', durationMs: v.durationMs || 0 }));
  if (known) vids = known.v.vids;
  else if (viaAddon) vids = await fromAddon(q);
  else {
    const d = await smYtApi('search', { part: 'snippet', type: 'video', maxResults: 10, q }, 100), ids = (d.items || []).filter(x => x.id && x.id.videoId).map(x => x.id.videoId);
    const det = ids.length ? await smYtDetails(ids) : new Map();
    vids = ids.map(id => { const t = det.get(id) || {}; return { id, title: t.title || '', channel: t.channel || '', durationMs: t.durationMs || 0, blocked: !!t.blocked, description: ytTimestampLines(t.description) }; });
    ytCachePut(ck, { vids }, vids.length ? YT_REL_TTL : YT_NONE_TTL);
  }
  const rank = () => vids.filter(v => v.id && !v.blocked).map(v => Object.assign({}, v, fvScoreVideo(item, knownMs, v))).filter(v => v.score >= 35 && !(knownMs && v.durationMs && v.durationMs < knownMs * 0.6)).sort((a, b) => b.score - a.score);
  let ranked = rank();
  if (viaAddon && !(ranked[0] && ranked[0].score >= 75)) {          // nothing sure under "full album": the add-on asks once more without those words (an upload titled just "Artist - Album")
    try { const more = await fromAddon(`${item.artist} ${clean}`), have = new Set(vids.map(v => v.id)); vids = vids.concat(more.filter(v => !have.has(v.id))); ranked = rank(); } catch (e) { /* the first search's answer stands */ }
  }
  return ranked.slice(0, 6);
}
function ytFullVideoConfident(v, knownMs) {                         // its title fits and its length is within 3% (20 s at least) of your songs', or its chapters name the songs
  if (v && v.timing && v.timing.agree && (v.titleFit || 0) >= 0.6 && v.score >= 50) return true;
  return !!(v && knownMs && v.durationMs && v.score >= 75 && Math.abs(v.diffMs) <= Math.max(20000, knownMs * 0.03));
}
async function fvFindVideos() {
  if (!fv) return; const box = fvEl('fullVideoFound'), it = fv.item, me = fv;
  const viaAddon = ytUseAddon();
  if (!viaAddon && !loadYoutubeApiKey()) { box.hidden = false; box.innerHTML = '<div class="fv-note">Finding videos needs the CRATE for YouTube add-on or a YouTube API key (\u2699 \u2192 YouTube API\u2026). <b>Search \u2197</b> opens YouTube instead.</div>'; return; }
  if (!viaAddon && !confirm('Searching YouTube costs 100 of today\u2019s quota units. Go ahead?')) return;
  box.hidden = false; box.innerHTML = '<div class="fv-note">Looking on YouTube\u2026</div>'; fvEl('fullVideoFind').disabled = true;
  const total = fv.rows.reduce((a, r) => a + (r.len || 0), 0) * 1000, known = fv.rows.every(r => r.len > 0) ? total : 0;
  let ranked = [];
  try { ranked = await ytFindFullVideos(it, known); }
  catch (e) { if (fv === me) box.innerHTML = `<div class="fv-note">${escapeHtml(viaAddon ? ytAddonErrText(e) : String((e && e.message) || e))}</div>`; fvEl('fullVideoFind').disabled = false; return; }
  fvEl('fullVideoFind').disabled = false; if (fv !== me) return;
  fv.found = ranked;
  if (!ranked.length) { box.innerHTML = '<div class="fv-note">Nothing on YouTube looks like the whole release. <b>Search \u2197</b> to look yourself.</div>'; return; }
  const diffTxt = (v) => !known || !v.durationMs ? '' : Math.abs(v.diffMs) <= 5000 ? ' \u00b7 same length as your songs' : ` \u00b7 ${ytFormatTime(Math.abs(v.diffMs) / 1000)} ${v.diffMs > 0 ? 'longer' : 'shorter'} than your songs`;
  box.innerHTML = `<div class="fv-note">${known ? `Your songs come to ${ytFormatTime(known / 1000)}. ` : ''}Best first: pick one to use it.</div>` + ranked.map((v, i) => `<div class="fv-found-row"><div class="fv-found-t"><div class="sm-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div><div class="fv-note">${escapeHtml(v.channel)}${v.durationMs ? ' \u00b7 ' + ytFormatTime(v.durationMs / 1000) : ''}${escapeHtml(diffTxt(v))}</div></div><button type="button" class="chip-btn" data-fv-found-play="${i}" aria-label="Play ${escapeHtml(v.title)}">\u25b6</button><button type="button" class="chip-btn" data-fv-found-use="${i}">Use</button></div>`).join('');
}
async function fvUseFound(i) {
  const v = fv && fv.found && fv.found[i]; if (!v) return;
  fvEl('fullVideoUrl').value = 'https://www.youtube.com/watch?v=' + v.id; fvEl('fullVideoFound').hidden = true;
  if (fv.rows.every(r => !r.start.trim() && !r.end.trim())) {          // nothing typed yet: the video's own chapters (or its description's times) first
    const me = fv; fvEl('fullVideoStatus').textContent = 'Reading the video’s chapters…';
    const info = await ytVideoInfo(v); if (fv !== me) return;
    const t = info ? ytTimingFrom(fv.rows.map(r => r.title), fv.rows.map(r => r.len), info) : null;
    if (t && (t.how === 'chapters' || t.how === 'description')) {
      fvValidate(); fv.rows.forEach((r, k) => { const g = t.times[k]; if (g) { r.start = ytFormatTime(g.start); r.end = ytFormatTime(g.end); } });
      const first = t.times.find(Boolean); fv.intro = first ? first.start : 0; fvEl('fullVideoIntro').value = ytFormatTime(fv.intro); fvRender();
      const n = fv.rows.length; fvEl('fullVideoStatus').textContent = `Timed ${t.placed} of ${n} songs by the ${t.how === 'chapters' ? 'video’s chapters' : 'times in the video’s description'}.` + (t.placed < n ? ` ${n - t.placed} not found there ${n - t.placed === 1 ? 'needs its' : 'need their'} times set by hand.` : '') + ' Play a part to check it.';
      return;
    }
  }
  if (fv.rows.every(r => !r.start.trim() && !r.end.trim()) && fv.rows.some(r => r.len > 0)) fvFromLengths(true); else fvValidate();          // nothing typed yet: placed from the song lengths
  if (v.diffMs > 5000 && v.durationMs) fvEl('fullVideoStatus').textContent += ` The video is ${ytFormatTime(v.diffMs / 1000)} longer than your songs: if it opens with an intro, set Intro.`;
}
function fvEndsFromNext() {
  if (!fv) return; fvValidate();
  const id = youtubeVideoIdFromUrl(fvEl('fullVideoUrl').value.trim()); let total = 0;
  if (id && ytQueue[ytQueueIndex] && ytQueue[ytQueueIndex].videoId === id && ytPlayer && ytPlayer.getDuration) { try { total = Math.round(ytPlayer.getDuration() || 0); } catch (e) { total = 0; } }          // the last song ends where the video does, when the player knows
  const ends = ytFillEnds(fv.rows.map(r => r.start.trim() ? ytParseTime(r.start) : NaN), total);
  fv.rows.forEach((r, i) => { if (r.start.trim() && !isNaN(ends[i])) r.end = ytFormatTime(ends[i]); });
  fvRender();
}
async function fvSave() {
  const v = fvValidate(); if (!v.ok || !fv) return;
  const item = fv.item; item.trackData = item.trackData || {}; let n = 0;
  v.rows.forEach(r => { if (!r.has) return; const td = item.trackData[r.n] || (item.trackData[r.n] = {}); td.youtubeLink = youtubeLinkWithSegment(v.url, r.start, r.end); n++; });          // (a song with no times is left as it was)
  try { await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData) }); }
  catch (err) { flashGlobalToast('Couldn\u2019t save \u2014 try again.'); return; }
  if (currentTracklistTracks.length) mergeTrackLinkOverrides(item, currentTracklistTracks);
  const cached = state.trackCache[artKey(item)]; if (cached && cached !== currentTracklistTracks) mergeTrackLinkOverrides(item, cached);
  if (activeItem === item) renderTracklistBody(item, currentTracklistTracks);
  flashGlobalToast(`Saved where ${n} song${n === 1 ? '' : 's'} start${n === 1 ? 's' : ''} and end${n === 1 ? 's' : ''} in the video.`); fvClose();
}
fvEl('deckFullVideoBtn').addEventListener('click', () => { if (activeItem) fvOpen(activeItem); });
fvEl('fullVideoClose').addEventListener('click', fvClose); fvEl('fullVideoCancel').addEventListener('click', fvClose);
fvEl('fullVideoOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) fvClose(); });
fvEl('fullVideoOverlay').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); fvClose(); } });
fvEl('fullVideoSave').addEventListener('click', fvSave);
fvEl('fullVideoUrl').addEventListener('input', fvValidate);
fvEl('fullVideoOpenPlayer').addEventListener('click', () => { const u = fvEl('fullVideoUrl').value.trim(); if (!youtubeVideoIdFromUrl(u)) { flashGlobalToast('Paste the full-release video\u2019s link first.'); return; } openYoutubePlayer(youtubeLinkWithSegment(u, 0, 0), fv ? `${fv.item.artist} \u2014 ${fv.item.title}` : 'Full-release video', [], fv && fv.item); });
fvEl('fullVideoSearch').addEventListener('click', () => { if (fv) window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(`${fv.item.artist} ${fv.item.title} full album`), '_blank', 'noopener'); });
fvEl('fullVideoPasteBtn').addEventListener('click', () => { const b = fvEl('fullVideoPasteBox'); b.hidden = !b.hidden; if (!b.hidden) fvEl('fullVideoPasteText').focus(); });
fvEl('fullVideoPasteApply').addEventListener('click', fvApplyPaste);
fvEl('fullVideoEnds').addEventListener('click', fvEndsFromNext);
fvEl('fullVideoFromLengths').addEventListener('click', () => fvFromLengths());
fvEl('fullVideoFind').addEventListener('click', fvFindVideos);
fvEl('fullVideoFound').addEventListener('click', (e) => {
  const use = e.target.closest('[data-fv-found-use]'); if (use) { fvUseFound(+use.dataset.fvFoundUse); return; }
  const play = e.target.closest('[data-fv-found-play]'); if (play && fv && fv.found) { const v = fv.found[+play.dataset.fvFoundPlay]; if (v) openYoutubePlayer('https://www.youtube.com/watch?v=' + v.id, v.title, [], fv.item); }
});
fvEl('fullVideoIntro').addEventListener('change', fvSetIntro);
fvEl('fullVideoClear').addEventListener('click', () => { if (!fv) return; fv.rows.forEach(r => { r.start = ''; r.end = ''; }); fvRender(); });
fvEl('fullVideoList').addEventListener('input', fvValidate);
fvEl('fullVideoList').addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('[data-fv="start"]')) e.target.dataset.was = e.target.value; });          // what a start was before you typed in it
fvEl('fullVideoList').addEventListener('change', (e) => {
  const t = e.target; if (!t.matches || !t.matches('[data-fv="start"]')) return;
  const row = t.closest('.fv-row[data-i]'); if (row) fvStartMoved(+row.dataset.i, t.dataset.was || '', t.value);
  t.dataset.was = t.value;
});
fvEl('fullVideoFollow').checked = fvFollowOn();
fvEl('fullVideoFollow').addEventListener('change', (e) => { try { localStorage.setItem(FV_FOLLOW_KEY, e.target.checked ? '1' : '0'); } catch (err) { /* for this visit only */ } });
fvEl('fullVideoList').addEventListener('click', (e) => {
  const row = e.target.closest('.fv-row[data-i]'); if (!row) return; const i = +row.dataset.i;
  const now = e.target.closest('[data-fv-now]'); if (now) { fvNow(now.dataset.fvNow, i); return; }
  if (e.target.closest('[data-fv-play]')) fvPlayPart(i);
});

// Shows/positions the master player the same way showMiniPlayer/
// renderMiniPlayerTrack do for Spotify — same detach/drag prefs
// (loadSpotifyPlayerPrefs/setPlayerDetached), since it's the same
// container regardless of which engine is playing.
function playYtQueueIndex(i) {
  if (i < 0 || i >= ytQueue.length) return;
  ytScrobbleFlush();             // the track being left counts if it had been played enough
  // A YouTube video starting stops Spotify AND SoundCloud so no two engines
  // play at once — see stopOtherEngines (this used to pause Spotify only).
  stopOtherEngines('youtube');
  ytQueueIndex = i;
  const q = ytQueue[i];

  setMasterPlayerEngine('youtube');
  el.miniPlayer.hidden = false;
  if (!el.miniPlayer.classList.contains('detached')) document.body.classList.add('has-mini-player');
  el.miniPlayerTitle.textContent = q.trackName;
  el.miniPlayerTitle.title = q.trackName;
  refreshMiniPlayerMeta();
  ytScrobbleBegin(q);            // a fresh record for this play (also when it is the same track again)

  ytDuration = 0;
  ytSeg = { start: q.start || 0, end: q.end || 0, fired: false, loadedAt: Date.now() };
  if (isBiliId(q.videoId)) biliPlay(q);                             // a Bilibili video: the stand-in player above
  else {
    biliStop(); ytPlayer = ytRealPlayer;
    ensureYtPlayer().then(player => { if (ytQueue[ytQueueIndex] !== q) return; ytPlayer = player; player.loadVideoById(q.start || q.end ? Object.assign({ videoId: q.videoId, startSeconds: q.start || 0 }, q.end ? { endSeconds: q.end } : {}) : q.videoId); player.playVideo(); });          // (a track inside a full-release video starts and stops at its own times)
  }
  setYtPlayPauseUI(false);
  phoneTapToStartWatch('youtube');          // a phone may refuse to start it without a tap on YouTube's own player (js/39-phone-playback.js)
}

// Stops YouTube playback — used both for the mutual-exclusion handoff when
// a Spotify track is about to start (see playSpotifyUri) and as the
// person's own play/pause control naturally winding down. Doesn't hide the
// master player itself; whatever plays next (Spotify, or nothing) decides
// that the same way it always did.
function closeYoutubePlayer() {
  ytScrobbleFlush(); ytScrobble = null;
  if (ytPlayer && ytPlayer.stopVideo) { try { ytPlayer.stopVideo(); } catch (e) { /* not ready yet — nothing to stop */ } }
  ytQueue = []; ytQueueIndex = -1;
  ytPlayingForCrateQueue = false; // stopped manually/handed off — don't let a stray advance land on the playlist queue later
}

/* ---- Fullscreen — requests fullscreen on the video area itself, not the
   whole player bar/window, so the transport chrome doesn't come along. ---- */
function toggleYtFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  if (el.miniPlayerVideoWrap.requestFullscreen) el.miniPlayerVideoWrap.requestFullscreen();
}

/* ---- SoundCloud master-player engine (1.29.106) ------------------------
   Third master-player engine alongside Spotify/YouTube above — see
   activePlayerEngine/setMasterPlayerEngine. Built on SoundCloud's real
   Widget API (loaded lazily, once, on first use — same pattern as
   loadYouTubeIframeApi) rather than a plain unscriptable <iframe> embed,
   so it gets real transport controls (play/pause, seek, volume) wired
   into the same shared mini-player chrome. Unlike YouTube this is audio
   only: the widget's iframe lives off-screen in #scPlayerMount
   (.sc-player-mount) and the mini player keeps showing the track's own
   art the whole time (see playScQueueIndex) rather than swapping in a
   video face. Reuses one widget instance across tracks via widget.load()
   (SC.Widget's own equivalent of YT.Player's loadVideoById) rather than
   tearing down/recreating the iframe each time, same reasoning as the
   YouTube side: it's what lets the volume level stick as the queue
   advances. */
let scQueue = [];                // [{url, trackName}] — rebuilt each time a SoundCloud track is played
let scQueueIndex = -1;
let scWidget = null;             // the SC.Widget instance, created once and reused via load()
let scApiPromise = null;         // resolves once https://w.soundcloud.com/player/api.js has loaded
let scWidgetReadyPromise = null; // resolves once scWidget itself fires its READY event
let scIsPaused = false;
let scDuration = 0;              // ms — SoundCloud's Widget API reports duration in ms already, unlike YouTube's seconds
let scPosition = 0;              // ms — kept current by the widget's own PLAY_PROGRESS event, see bindScWidgetEvents
let scLastKnownVolume = 80;      // remembered across sessions, shown on the master player's shared volume slider whenever activePlayerEngine is 'soundcloud'
let scPlayingForCrateQueue = false; // true while the SoundCloud widget is standing in for the current queue entry, see playCrateTrackOnSoundcloud

function loadScPlayerPrefs() {
  try { return JSON.parse(localStorage.getItem(SC_PLAYER_PREFS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveScPlayerPrefs(patch) {
  try { localStorage.setItem(SC_PLAYER_PREFS_KEY, JSON.stringify({ ...loadScPlayerPrefs(), ...patch })); }
  catch (e) { /* localStorage unavailable — safe to ignore */ }
}

function loadSoundcloudWidgetApi() {
  if (window.SC && window.SC.Widget) return Promise.resolve();
  if (scApiPromise) return scApiPromise;
  scApiPromise = new Promise(resolve => {
    const tag = document.createElement('script');
    tag.src = 'https://w.soundcloud.com/player/api.js';
    tag.onload = resolve;
    document.head.appendChild(tag);
  });
  return scApiPromise;
}

// Binds every widget event this player cares about — called exactly once,
// right after the widget's own READY fires (see ensureScWidget). Mirrors
// onYtPlayerStateChange's job, just split into SoundCloud's separate
// per-event callbacks instead of one combined onStateChange.
function bindScWidgetEvents() {
  scWidget.bind(SC.Widget.Events.PLAY, () => {
    phoneTapToStartDone();
    setScPlayPauseUI(false);
    scWidget.getDuration(d => { scDuration = d || 0; });
  });
  scWidget.bind(SC.Widget.Events.PAUSE, () => setScPlayPauseUI(true));
  scWidget.bind(SC.Widget.Events.FINISH, onScTrackFinish);
  scWidget.bind(SC.Widget.Events.PLAY_PROGRESS, (data) => { scPosition = (data && data.currentPosition) || 0; });
  scWidget.bind(SC.Widget.Events.ERROR, () => flashGlobalToast('SoundCloud playback error'));
}

// Creates the underlying SC.Widget exactly once and re-uses it across
// tracks via load() — see the file-header comment on this section for why.
// Takes the first track's URL directly (unlike ensureYtPlayer, which mounts
// blank and loads its first video the same way as every later one) since
// the widget's iframe needs a real track URL in its src from the start.
function ensureScWidget(initialUrl) {
  if (scWidgetReadyPromise) return scWidgetReadyPromise;
  scWidgetReadyPromise = loadSoundcloudWidgetApi().then(() => new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.allow = 'autoplay';
    iframe.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(initialUrl) +
      '&auto_play=true&show_artwork=false&visual=false&show_comments=false&show_user=false&show_reposts=false&sharing=false&download=false&buying=false';
    el.scPlayerMount.appendChild(iframe);
    scWidget = SC.Widget(iframe);
    scWidget.bind(SC.Widget.Events.READY, () => {
      const prefs = loadScPlayerPrefs();
      scLastKnownVolume = prefs.volume ?? 80;
      scWidget.setVolume(scLastKnownVolume);
      if (activePlayerEngine === 'soundcloud') el.miniPlayerVolume.value = scLastKnownVolume;
      bindScWidgetEvents();
      resolve(scWidget);
    });
  }));
  return scWidgetReadyPromise;
}

function onScTrackFinish() {
  if (scQueueIndex < scQueue.length - 1) { playScQueueIndex(scQueueIndex + 1); return; }
  setScPlayPauseUI(true);
  // Mirror of onYtPlayerStateChange's ENDED handling — this SoundCloud
  // track standing in for the current entry of a "Play playlist" run (see
  // playCrateTrackOnSoundcloud) just finished with nothing left in its own
  // local queue, so hand control back to the playlist queue instead of
  // just stopping here.
  if (scPlayingForCrateQueue && isPlayingCrateQueue()) {
    playCrateQueueIndex(crateQueueId, crateQueueIndex + 1);
  }
}

function setScPlayPauseUI(paused) {
  scIsPaused = paused;
  if (activePlayerEngine !== 'soundcloud') return; // stale event from a track no longer showing — another engine owns the shared button now
  setMiniPlayerPlayPauseIcon(paused);
}

// Clicking a track's "SC ↗" link still just opens the real page (unchanged
// — see the maintenance log) — this is reached only from playTrackNow()'s
// and playCrateQueueIndex()'s own soundcloudLink checks, i.e. an actual
// "play this track" action. Builds a same-album queue out of every track
// with a SoundCloud link attached, same "queue the rest of the album, not
// just the one clicked" reasoning as openYoutubePlayer.
function openSoundcloudPlayer(url, trackName, tracks, item) {
  scPlayingForCrateQueue = false; // manual play, not the "Play playlist" queue — see playCrateTrackOnSoundcloud
  if (item) nowPlayingItem = item;
  // Best-effort only: unlike the direct playTrackNow/playCrateQueueIndex
  // paths, there's no trackNum here — just title-matching (via
  // trackLinkOverridesFor's manualTracks fallback), so this only actually
  // finds a link for manual albums. Same limitation as manualYoutubeLinkFor
  // itself; a non-manual album's per-track trackData link can't be found
  // without the trackNum key it's stored under.
  nowPlayingYoutubeLink = item ? (trackLinkOverridesFor(item, undefined, trackName).youtubeLink || '') : '';
  if (!/soundcloud\.com\//i.test(url || '')) { flashGlobalToast('That doesn\u2019t look like a valid SoundCloud link'); return; }

  const scTracks = (tracks || currentTracklistTracks || []).filter(t => t.soundcloudLink);
  if (scTracks.length) {
    scQueue = scTracks.map(t => ({ url: t.soundcloudLink, trackName: t.trackName || 'Untitled track' }));
    const idx = scQueue.findIndex(q => q.url === url);
    scQueueIndex = idx === -1 ? 0 : idx;
  } else {
    scQueue = [{ url, trackName: trackName || 'Now playing' }];
    scQueueIndex = 0;
  }

  if (state.shuffle && scQueue.length > 1) { ensureOrigSeq(scQueue); shuffleTail(scQueue, scQueueIndex); } // the clicked track plays first; the rest of the album is shuffled
  playScQueueIndex(scQueueIndex);
}

// Shows/positions the master player the same way playYtQueueIndex does for
// YouTube — same detach/drag prefs, same shared container regardless of
// which engine is playing. The one real difference: SoundCloud is audio
// only, so instead of swapping in a video face this keeps miniPlayerArt
// showing, filled from the item's own art cache (same lookup renderAlbumCard/
// the deck use elsewhere — item.cover, then the resolved art cache, then a
// generic placeholder).
function playScQueueIndex(i) {
  if (i < 0 || i >= scQueue.length) return;
  // Starting a SoundCloud track stops Spotify and YouTube so no two engines
  // ever play at once — see stopOtherEngines.
  stopOtherEngines('soundcloud');
  scQueueIndex = i;
  const q = scQueue[i];

  setMasterPlayerEngine('soundcloud');
  el.miniPlayer.hidden = false;
  if (!el.miniPlayer.classList.contains('detached')) document.body.classList.add('has-mini-player');
  el.miniPlayerTitle.textContent = q.trackName;
  el.miniPlayerTitle.title = q.trackName;
  el.miniPlayerArt.src = nowPlayingItem
    ? (nowPlayingItem.cover || state.artCache[artKey(nowPlayingItem)]?.art || placeholderArt(nowPlayingItem))
    : NO_ART_FALLBACK;
  refreshMiniPlayerMeta();

  scDuration = 0; scPosition = 0;
  if (scWidget) {
    scWidget.load(q.url, { auto_play: true });
    scWidget.getDuration(d => { scDuration = d || 0; });
  } else {
    ensureScWidget(q.url);
  }
  setScPlayPauseUI(false);
  phoneTapToStartWatch('soundcloud');
}

// Stops SoundCloud playback — used both for the mutual-exclusion handoff
// when a Spotify track is about to start (see playSpotifyUri) and as the
// person's own play/pause control naturally winding down. Doesn't hide the
// master player itself, same as closeYoutubePlayer.
function closeSoundcloudPlayer() {
  if (scWidget && scWidget.pause) { try { scWidget.pause(); } catch (e) { /* not ready yet — nothing to stop */ } }
  scQueue = []; scQueueIndex = -1;
  scPlayingForCrateQueue = false; // stopped manually/handed off — don't let a stray advance land on the playlist queue later
}

/* ---- Discogs API (personal access token) ----
   Same trust model as the Spotify/Last.fm keys above: stored in this
   browser's localStorage only, sent directly from the browser to Discogs.
   Discogs's /database/search endpoint requires authentication (unlike most
   of MusicBrainz), so unlike the MusicBrainz lookups elsewhere in this
   file, this one simply won't work until a token is saved. */
function loadDiscogsToken() {
  try { return localStorage.getItem(DISCOGS_TOKEN_KEY) || ''; }
  catch (e) { return ''; }
}
function saveDiscogsToken(token) {
  try { localStorage.setItem(DISCOGS_TOKEN_KEY, token); }
  catch (e) { /* ignore */ }
}

function loadYoutubeApiKey() {
  try { return localStorage.getItem(YOUTUBE_API_KEY_KEY) || ''; }
  catch (e) { return ''; }
}
function saveYoutubeApiKey(key) {
  try { localStorage.setItem(YOUTUBE_API_KEY_KEY, key); }
  catch (e) { /* ignore */ }
}

// Searches YouTube's real catalog (Data API v3 — see \u2699 \u2192 YouTube
// API\u2026 for the free API key this needs) for candidate videos matching
// an artist + track title. Returns [] — never throws, never null — on any
// failure (no key configured, quota exceeded, network error), so callers
// can fall back to the old "open a YouTube search tab" behavior rather
// than treat it as a hard error. Deliberately only ever called from an
// explicit click (see handleTracklistMatchBtnClick), never automatically —
// the free tier's quota (100 searches/day) would drain almost immediately
// if this fired for every track a form happened to show.
async function youtubeSearchCandidates(artist, title) {
  if (ytUseAddon()) {                                               // through the add-on when it is connected: no quota
    try { const r = await ytAddonRequest({ kind: 'search-video', q: `${artist} ${title}` }); return r.slice(0, 10).map(v => ({ id: v.id, title: v.title, channel: v.channel, thumbnail: '' })); }
    catch (e) { console.warn('YouTube add-on search failed', e); return []; }
  }
  const apiKey = loadYoutubeApiKey();
  if (!apiKey) return [];
  const q = `${artist} ${title}`, ck = 'cand|' + ytCacheNorm(q), known = ytCacheGet(ck);
  if (known) return known.v.list;                                    // looked up before: nothing to pay
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) return [];
    smYtQuotaAdd(100);                                               // (this search was never counted on the meter before: it costs 100 units)
    const data = await res.json();
    const list = (data.items || [])
      .filter(it => it.id && it.id.videoId && it.snippet)
      .map(it => ({
        id: it.id.videoId,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        thumbnail: (it.snippet.thumbnails && (it.snippet.thumbnails.default || it.snippet.thumbnails.medium) || {}).url || ''
      }));
    ytCachePut(ck, { list }, list.length ? YT_REL_TTL : YT_NONE_TTL);
    return list;
  } catch (e) {
    console.warn('YouTube search failed', e);
    return [];
  }
}

// Shared by every match-candidate picker (tracklist builder rows, "Edit
// track properties…") regardless of platform — normalizes Spotify's
// {id, name, artists, album} and YouTube's {id, title, channel, thumbnail}
// into one {id, name, sub, thumbnail} shape so rendering only has to be
// written once (see renderMatchCandidateList).
function toMatchCandidates(kind, raw) {
  if (kind === 'spotify') {
    return (raw || []).map(c => ({ id: c.id, name: c.name, sub: c.artists + (c.album ? ' \u2014 ' + c.album : ''), thumbnail: '' }));
  }
  return (raw || []).map(c => ({ id: c.id, name: c.title, sub: c.channel, thumbnail: c.thumbnail }));
}
function matchCandidatePreview(kind, candidate) {
  if (kind === 'spotify') showMiniPlayer(`spotify:track:${candidate.id}`, beginPlayIntent());
  else window.open(`https://www.youtube.com/watch?v=${candidate.id}`, '_blank'); // no inline embed player for a quick preview — opening the real page is simpler and always works
}
function matchCandidateLink(kind, candidate) {
  return kind === 'spotify' ? `https://open.spotify.com/track/${candidate.id}` : `https://www.youtube.com/watch?v=${candidate.id}`;
}
// Renders one platform's candidate list into `container` and wires each
// row's preview/use buttons — targetInput is whichever link field ("Use
// this" should fill) for the picker this call belongs to. onAfterUse is
// optional: when given, it's called instead of re-rendering the list with
// a "Selected" marker — used by the tracklist builder to close/collapse
// its expandable match panel the moment a pick is made (see
// loadTracklistRowMatches), since leaving a long results list sitting
// open after the person's already chosen just pushes every row below it
// down the page for no reason. The Track Properties picker has no such
// panel to close, so it omits this and keeps the old re-render-in-place
// behavior.
function renderMatchCandidateList(container, candidates, selectedId, kind, targetInput, onAfterUse) {
  container.innerHTML = candidates.map(c => `
    <div class="track-props-match-row${c.id === selectedId ? ' selected' : ''}" data-candidate-id="${escapeHtml(c.id)}">
      ${c.thumbnail ? `<img class="track-props-match-thumb" src="${escapeHtml(c.thumbnail)}" alt="">` : ''}
      <button type="button" class="track-props-match-preview" title="Preview" aria-label="Preview ${escapeHtml(c.name)}">▶</button>
      <div class="track-props-match-info">
        <span class="track-props-match-name">${escapeHtml(c.name)}</span>
        <span class="track-props-match-sub">${escapeHtml(c.sub || '')}</span>
      </div>
      <button type="button" class="track-props-match-use chip-btn">${c.id === selectedId ? 'Selected' : 'Use this'}</button>
    </div>
  `).join('');
  container.querySelectorAll('.track-props-match-row').forEach(rowEl => {
    const candidate = candidates.find(c => c.id === rowEl.dataset.candidateId);
    if (!candidate) return;
    rowEl.querySelector('.track-props-match-preview').addEventListener('click', (e) => {
      e.stopPropagation();
      matchCandidatePreview(kind, candidate);
    });
    rowEl.querySelector('.track-props-match-use').addEventListener('click', (e) => {
      e.stopPropagation();
      targetInput.value = matchCandidateLink(kind, candidate);
      if (onAfterUse) onAfterUse(candidate);
      else renderMatchCandidateList(container, candidates, candidate.id, kind, targetInput);
    });
  });
}

// Looks up genre + style tags for one release on Discogs. Discogs splits
// tagging into two levels — broad "genre" (Rock, Electronic…) and much
// more specific "style" (Dub Techno, Shoegaze…) — which combined is the
// closer-to-RYM granularity this was added for. Returns either
// { combined, genres, styles } or { error: '...' } for the caller to
// turn into a human-readable status message.
// Finding a release on Discogs (1.95.3). The strict search (this artist AND this title) finds nothing when Discogs writes the artist
// another way ("Tatsu Yamashita" here, "Tatsuro Yamashita" or "山下達郎" there) or the title has curly quotes, so two looser searches
// follow: by the title alone, then by both as plain words. What they bring back is checked, so a loose search never hands over
// another artist's record: the title must be a near-exact match, and the artist close (or written in another script).
const dgClean = (s) => String(s || '').replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s*\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const dgArtist = (s) => dgClean(s).replace(/\s*\(\d+\)$/, '').replace(/\*$/, '');          // Discogs's "Name (2)" and "Name*"
function discogsResultFit(r, artist, title) {                       // a search result -> { ok, score }: is it this release?
  const full = String((r && r.title) || ''), m = /^(.+?)\s+-\s+(.+)$/.exec(full), ra = m ? m[1] : '', rt = m ? m[2] : full;
  const ts = smTitleSim(title, rt);
  const names = ra.split(/\s*(?:,|&|\/|\bfeat\.?|\band\b)\s*/i).map(dgArtist).filter(Boolean);
  let as = smArtistMatch(artist, names.length ? names : [ra]);
  if (as !== null && as < 1) { const k = smArtistKey(artist); as = Math.max(as, ...names.map(n => smSim(k, smArtistKey(n)))); }          // "tatsu yamashita" / "tatsuro yamashita": a few letters apart
  const ok = as === null ? ts >= 0.95 : ts >= 0.85 && as >= 0.75;
  return { ok, score: ts + (as === null ? 0.5 : as) };
}
async function discogsFindRelease(artist, title, headers) {        // -> { hit } (a search result) or { error: 'network' | 'unauthorized' | 'rate-limited' | 'http-NNN' | 'no-match' }
  const a = dgArtist(artist), t = dgClean(title), enc = encodeURIComponent;
  const tries = [`artist=${enc(a)}&release_title=${enc(t)}&per_page=5`, `release_title=${enc(t)}&per_page=50`, `q=${enc(a + ' ' + t)}&per_page=50`];
  for (let i = 0; i < tries.length; i++) {
    let res; try { res = await fetch(`https://api.discogs.com/database/search?type=release&${tries[i]}`, { headers }); } catch (e) { return { error: 'network' }; }
    if (res.status === 401) return { error: 'unauthorized' };
    if (res.status === 429) return { error: 'rate-limited' };
    if (!res.ok) return { error: 'http-' + res.status };
    const list = ((await res.json()).results || []);
    if (i === 0 && list.length) return { hit: list[0] };           // both fields matched: Discogs's own first answer, as before
    const best = list.map(r => Object.assign({ r }, discogsResultFit(r, a, t))).filter(x => x.ok).sort((x, y) => y.score - x.score)[0];
    if (best) return { hit: best.r };
  }
  return { error: 'no-match' };
}

async function fetchDiscogsGenreStyle(artist, title) {
  const token = loadDiscogsToken();
  if (!token) return { error: 'no-token' };

  const headers = { 'Accept': 'application/json', 'Authorization': `Discogs token=${token}` };
  const found = await discogsFindRelease(artist, title, headers);
  if (found.error) return { error: found.error };
  const hit = found.hit;

  const genres = hit.genre || [];
  const styles = hit.style || [];
  return { genres, styles, combined: [...new Set([...genres, ...styles])] };
}

/* ---- Spotify Web API (Client Credentials flow) ----
   Client Credentials is meant for server-to-server use, so the secret is
   technically exposed to anyone who opens devtools on this page — same
   trust model this file already uses for the Last.fm API key. Only usable
   for reading the public catalog (search), never anyone's account data. */
let spotifyToken = null; // { value, expiresAt } — cached in memory for this session
