// CRATE — Last.fm review helpers, duplicate check, crate file format.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// BEGIN lastfm-review
// ---- Last.fm startup review: what is kept, merged and shown (pure: the key function is passed in) ----
// Scrobbles for albums that aren't in your crate used to be counted in a toast and then forgotten (the sync baseline moved on).
// They are now kept as track-level "groups" (artist, album, track, day, plays), merged as more arrive, and offered for review.
function lfGroupKey(g, keyFn) { return keyFn(g.artist, g.title) + '::' + g.day + '::' + String(g.track || '').toLowerCase().trim(); }
function lfMergePending(pending, groups, keyFn, cap) {
  const map = new Map();
  (pending || []).concat(groups || []).forEach(g => {
    const k = lfGroupKey(g, keyFn), cur = map.get(k);
    if (!cur) map.set(k, Object.assign({}, g));
    else { cur.playCount += g.playCount; cur.firstUts = Math.min(cur.firstUts, g.firstUts); cur.lastUts = Math.max(cur.lastUts, g.lastUts); }
  });
  let out = [...map.values()];
  if (cap && out.length > cap) out = out.sort((a, b) => b.lastUts - a.lastUts).slice(0, cap);
  return out;
}
function lfAlbumsFromGroups(groups, keyFn, ignored) {
  const skip = new Set(ignored || []), byKey = new Map();
  (groups || []).forEach(g => {
    const key = keyFn(g.artist, g.title);
    if (skip.has(key)) return;
    if (!byKey.has(key)) byKey.set(key, { key, artist: g.artist, album: g.title, plays: 0, tracks: new Map(), firstUts: g.firstUts, lastUts: g.lastUts });
    const a = byKey.get(key);
    a.plays += g.playCount; a.firstUts = Math.min(a.firstUts, g.firstUts); a.lastUts = Math.max(a.lastUts, g.lastUts);
    const t = g.track || '(unknown track)'; a.tracks.set(t, (a.tracks.get(t) || 0) + g.playCount);
  });
  return [...byKey.values()].map(a => Object.assign(a, { tracks: [...a.tracks].map(([name, plays]) => ({ name, plays })).sort((x, y) => y.plays - x.plays || x.name.localeCompare(y.name)) }))
    .sort((x, y) => y.lastUts - x.lastUts);
}
function lfIsSnoozed(st, now) { return !!(st && st.snoozeUntil && st.snoozeUntil > now); }
function lfLoggedAlbums(groups) {
  const byRow = new Map();
  (groups || []).forEach(g => { const k = g.row; if (!byRow.has(k)) byRow.set(k, { artist: g.artist, title: g.title, plays: 0 }); byRow.get(k).plays += g.playCount; });
  return [...byRow.values()].sort((a, b) => b.plays - a.plays);
}
// END lastfm-review

// BEGIN dup-check
// ---- Is this release already in the crate? (pure) ----
// Two releases are "the same album" when artist and title match after ignoring case, accents, a leading "The", "&" vs "and",
// apostrophes and other punctuation, and any (bracketed) edition note in the title. Whether it's the same EDITION is a second
// question (descriptor / bracketed text, catalogue number, year): same album + same edition = an exact duplicate (blocked);
// same album + a different edition = maybe a deliberate second pressing (warned about, and needs an explicit yes).
function dupFold(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['\u2018\u2019`]/g, ''); }
function dupWords(s) { return dupFold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }       // letters and digits in ANY script, so titles in other alphabets don't all collapse to nothing
function dupKey(artist, title) {
  const raw = String(title == null ? '' : title), stripped = raw.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ');
  const a = dupWords(String(artist == null ? '' : artist).replace(/(?:\s*\([^()]*\))?\s*:\s*Reviews,?\s*Ratings[\s\S]*$/i, '')).replace(/^the /, ''), t = (dupWords(stripped) || dupWords(raw)).replace(/^the /, '');       // (an artist that picked up a release page's wording: "Ulver (Album, Trip Hop): Reviews, Ratings…" is Ulver)
  return a && t ? a + '::' + t : '';
}
function dupEditionText(x) {
  const br = (String(x.title || '').match(/[\(\[][^\)\]]*[\)\]]/g) || []).map(s => s.slice(1, -1));
  return [x.descriptor].concat(br).map(s => String(s == null ? '' : s).trim()).filter(Boolean).join(', ');
}
function dupEditionSig(x) { return [...new Set(dupWords(dupEditionText(x)).split(' ').filter(Boolean))].sort().join(' '); }
function dupYear(d) { const m = /^(\d{4})/.exec(String(d == null ? '' : d).trim()); return m ? m[1] : ''; }
function dupCat(c) { const s = String(c == null ? '' : c).trim(); return /^CRT-\d+$/i.test(s) ? '' : dupWords(s); }      // an automatic CRT-007 number says nothing
function dupCompare(a, b) {                       // a: the release being added, b: one you already have -> { level: 'exact' | 'edition', diffs: [why] }
  const diffs = [];
  if (dupEditionSig(a) !== dupEditionSig(b)) diffs.push(`the edition differs (${dupEditionText(a) || 'standard'} vs ${dupEditionText(b) || 'standard'})`);
  const ca = dupCat(a.catalog), cb = dupCat(b.catalog);
  if (ca && cb && ca !== cb) diffs.push(`a different catalogue number (${String(a.catalog).trim()} vs ${String(b.catalog).trim()})`);
  const ya = dupYear(a.releaseDate), yb = dupYear(b.releaseDate);
  if (ya && yb && ya !== yb) diffs.push(`a different year (${ya} vs ${yb})`);
  return { level: diffs.length ? 'edition' : 'exact', diffs };
}
function dupVerdict(matches) { return matches.some(m => m.level === 'exact') ? 'exact' : matches.length ? 'edition' : 'none'; }
// END dup-check

// BEGIN crate-exchange
// ---- Exporting and importing a crate: what a file contains, how it is checked, and what an import will write (pure) ----
// A release in the file: artist, title, type, releaseDate, recorded, genre, secondaryGenre, region, location, label, catalog (only when you
// set one yourself), descriptor, scene, movement, link (the album's link), rymLink, cover, tracks [{n, title, spotify, youtube, soundcloud}].
// Links are sorted by WHAT THEY POINT AT (the host), not by the box they were typed in: spotify, youtube, soundcloud, or "other".
// Ratings, reviews, diary entries and scrobbles are yours and are not exported.
const CX_FORMAT = 'crate-export', CX_VERSION = 1, CX_MAX_RELEASES = 5000, CX_AUTO_CATALOG = /^CRT-\d+$/;
const CX_KINDS = ['spotify', 'youtube', 'soundcloud', 'other'];
function cxLinkKind(url) {
  const u = String(url == null ? '' : url).trim();
  if (!u) return '';
  if (/^spotify:/i.test(u)) return 'spotify';
  let host = '';
  try { host = new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return 'other'; }
  if (host === 'spotify.link' || host === 'spotify.com' || host.endsWith('.spotify.com')) return 'spotify';
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
  if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com') || host === 'snd.sc') return 'soundcloud';
  return 'other';
}
function cxCleanUrl(v) { const s = String(v == null ? '' : v).trim(); if (!s) return ''; if (/^spotify:\S+$/i.test(s)) return s; return /^https?:\/\/\S+$/i.test(s) ? s : ''; }   // http(s) links and spotify: URIs only (never javascript: and the like)
function cxExportTracks(item, opts) {
  if (!opts.tracks || !item.hasManualTracklist || !Array.isArray(item.manualTracks)) return [];
  const td = item.trackData || {}, out = [];
  item.manualTracks.forEach((mt, i) => {
    const title = String((mt && mt.title) || '').trim();
    if (!title) return;
    const n = Number(mt.trackNumber) || i + 1, o = td[n] || {}, t = { n, title };
    [o.spotifyLink || mt.spotifyLink, o.youtubeLink || mt.youtubeLink, o.soundcloudLink || mt.soundcloudLink].forEach(v => {
      const k = cxLinkKind(v);
      if (k && k !== 'other' && opts.links[k] && !t[k]) t[k] = String(v).trim();       // a song link to a site that isn't one of the three has nowhere to go on import, so it isn't exported
    });
    out.push(t);
  });
  return out;
}
// RYM's figures for one release and its rated tracks, for an export: rating, how many ratings, and the popularity CRATE works out from both
// (0-100, where it stands among the rated releases / tracks of this crate on both counts; see track-popularity) with the adjusted rating behind it.
// Read-only facts: an import ignores them (it never overwrites ratings), so a file with them still imports anywhere.
function cxTrackTitle(item, n) {
  const td = (item.trackData || {})[n] || {}, num = Number(n);
  const mt = Array.isArray(item.manualTracks) ? item.manualTracks.find((t, i) => (Number(t && t.trackNumber) || i + 1) === num) : null;
  if (mt && mt.title) return String(mt.title).trim();
  const ct = (state.trackCache[artKey(item)] || []).find(t => Number(t.trackNumber) === num);
  return String(td.name || (ct && ct.trackName) || '').trim();
}
function cxRymFigures(it) {
  const out = {}, ap = albumPopOf(it);
  if (Number(it.rymRating) > 0) { out.rymRating = Number(it.rymRating); if (Number(it.rymVotes) > 0) out.rymVotes = Number(it.rymVotes); }
  if (ap) { if (ap.pop !== null) out.rymPopularity = Math.round(ap.pop); out.rymAdjusted = +ap.wr.toFixed(3); }
  const td = it.trackData || {}, rated = Object.keys(td).filter(n => Number(td[n] && td[n].rymRating) > 0).sort((a, b) => Number(a) - Number(b));
  if (rated.length) out.rymTracks = rated.map(n => {
    const e = td[n], v = trackPopOf(it, n), t = { n: Number(n), title: cxTrackTitle(it, n), rymRating: Number(e.rymRating) };
    if (Number(e.rymVotes) > 0) t.rymVotes = Number(e.rymVotes);
    if (v) { if (v.pop !== null) t.rymPopularity = Math.round(v.pop); t.rymAdjusted = +v.wr.toFixed(3); if (v.stand !== null) t.vsAlbum = +v.stand.toFixed(3); }
    return t;
  });
  return out;
}
// The same figures as a spreadsheet: a row for each release, then a row for each of its rated tracks under it. Opens in Excel, Numbers, Google Sheets.
function cxRatingsCsv(items) {
  const cell = (v) => { const x = v == null ? '' : String(v); return /[",\n\r]/.test(x) || /^[=+\-@]/.test(x) ? '"' + (/^[=+\-@]/.test(x) ? "'" : '') + x.replace(/"/g, '""') + '"' : x; };          // quoted, and never read as a formula
  const lines = [['Row', 'Artist', 'Release', 'Year', 'Type', 'Track #', 'Track', 'RYM rating', 'Number of ratings', 'Popularity (0-100)', 'Adjusted rating', 'Vs album average'].join(',')];
  items.forEach(it => {
    const f = cxRymFigures(it), y = cxItemYear(it);
    lines.push(['Release', it.artist, it.title, y === null ? '' : y, it.type === 'Unknown' ? '' : it.type, '', '', f.rymRating || '', f.rymVotes || '', f.rymPopularity != null ? f.rymPopularity : '', f.rymAdjusted != null ? f.rymAdjusted.toFixed(2) : '', ''].map(cell).join(','));
    (f.rymTracks || []).forEach(t => lines.push(['Track', it.artist, it.title, y === null ? '' : y, '', t.n, t.title, t.rymRating, t.rymVotes || '', t.rymPopularity != null ? t.rymPopularity : '', t.rymAdjusted != null ? t.rymAdjusted.toFixed(2) : '', t.vsAlbum != null ? (t.vsAlbum >= 0 ? '+' : '') + t.vsAlbum.toFixed(2) : ''].map(cell).join(',')));
  });
  return '\ufeff' + lines.join('\r\n') + '\r\n';          // (the mark at the start makes Excel read it as UTF-8, so accents and dashes survive)
}
function cxBuildExport(items, opts, meta) {
  const releases = (items || []).map(it => {
    const rel = {}, put = (k, v) => { const s = String(v == null ? '' : v).trim(); if (s) rel[k] = s; };
    put('artist', it.artist); put('title', it.title); put('type', it.type === 'Unknown' ? '' : it.type);
    put('releaseDate', it.releaseDate); put('recorded', it.recordedDate); put('genre', it.genre); put('secondaryGenre', it.genre2);
    put('region', it.region); put('location', it.location); put('label', it.label);
    if (it.catalog && !CX_AUTO_CATALOG.test(String(it.catalog).trim())) put('catalog', it.catalog);
    put('descriptor', it.descriptor); put('rymDescriptors', it.rymDescriptors); put('scene', it.scene); put('movement', it.movement);
    const lk = cxLinkKind(it.link); if (it.link && opts.links[lk]) put('link', it.link);
    if (it.rymLink && opts.links.other) put('rymLink', it.rymLink);
    if (opts.cover) put('cover', it.cover);
    const tracks = cxExportTracks(it, opts); if (tracks.length) rel.tracks = tracks;
    if (opts.rym) Object.assign(rel, cxRymFigures(it));
    return rel;
  });
  return { format: CX_FORMAT, version: CX_VERSION, exportedAt: (meta && meta.exportedAt) || new Date().toISOString(), options: { tracks: !!opts.tracks, cover: !!opts.cover, rym: !!opts.rym, links: Object.assign({}, opts.links) }, releases };
}
function cxCounts(releases) {
  const c = { releases: releases.length, tracks: 0, links: { spotify: 0, youtube: 0, soundcloud: 0, other: 0 } };
  releases.forEach(r => {
    if (r.link) c.links[cxLinkKind(r.link) || 'other']++;
    if (r.rymLink) c.links.other++;
    (r.tracks || []).forEach(t => { c.tracks++; ['spotify', 'youtube', 'soundcloud'].forEach(k => { if (t[k]) c.links[k]++; }); });
  });
  return c;
}
function cxNormalizeRelease(raw, idx) {
  const str = (v) => (v == null ? '' : String(v)).trim();
  const r = { idx, artist: '', title: '', type: '', releaseDate: '', recorded: '', genre: '', secondaryGenre: '', region: '', location: '', label: '', catalog: '', descriptor: '', rymDescriptors: '', scene: '', movement: '', link: '', rymLink: '', cover: '', tracks: [], problems: [], warnings: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { r.problems.push('Not a release entry'); r.invalid = true; return r; }
  r.artist = str(raw.artist); r.title = str(raw.title); r.type = str(raw.type);
  r.recorded = str(raw.recorded != null ? raw.recorded : raw.recordedDate); r.releaseDate = str(raw.releaseDate);
  r.genre = str(raw.genre); r.secondaryGenre = str(raw.secondaryGenre != null ? raw.secondaryGenre : raw.genre2);
  ['region', 'location', 'label', 'catalog', 'descriptor', 'rymDescriptors', 'scene', 'movement'].forEach(k => { r[k] = str(raw[k]); });
  if (!r.artist) r.problems.push('Missing artist');
  if (!r.title) r.problems.push('Missing title');
  [['releaseDate', 'release date'], ['recorded', 'recorded date']].forEach(([k, label]) => {
    if (r[k] && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(r[k])) { r.warnings.push(`Unrecognised ${label} \u201c${r[k]}\u201d left blank`); r[k] = ''; }
  });
  ['link', 'rymLink', 'cover'].forEach(k => {
    const v = str(raw[k]); if (!v) return;
    r[k] = cxCleanUrl(v); if (!r[k]) r.warnings.push(`Ignored an invalid ${{ link: 'album', rymLink: 'RYM', cover: 'cover art' }[k]} link`);
  });
  if (Array.isArray(raw.tracks)) {
    let dropped = 0, badLinks = 0;
    raw.tracks.forEach((t, i) => {
      if (!t || typeof t !== 'object') { dropped++; return; }
      const title = str(t.title); if (!title) { dropped++; return; }
      const nt = { n: Number(t.n) || i + 1, title };
      if (Number(t.durationMs) > 0) nt.durationMs = Math.round(Number(t.durationMs));
      const sec = str(t.section).slice(0, 40); if (sec) nt.section = sec;
      if (t.s === 'rym') nt.s = 'rym';
      const rr = rymNum(t.rymRating != null ? t.rymRating : t.rating), rl = rymSongUrl(t.rymLink != null ? t.rymLink : t.url);          // Rate Your Music's rating of the track and its song page (a release sent by the add-on)
      if (rr) { nt.rymRating = rr; const rv = rymVotesNum(t.rymVotes != null ? t.rymVotes : t.votes); if (rv) nt.rymVotes = rv; }
      if (rl) nt.rymLink = rl;
      ['spotify', 'youtube', 'soundcloud'].forEach(k => {
        const v = str(t[k]); if (!v) return;
        const clean = cxCleanUrl(v);
        if (clean && cxLinkKind(clean) === k) nt[k] = clean; else badLinks++;
      });
      r.tracks.push(nt);
    });
    if (dropped) r.warnings.push(`${dropped} track${dropped === 1 ? '' : 's'} without a title skipped`);
    if (badLinks) r.warnings.push(`${badLinks} song link${badLinks === 1 ? '' : 's'} ignored (not a valid ${'Spotify/YouTube/SoundCloud'} link)`);
  }
  r.invalid = r.problems.length > 0;
  return r;
}
function cxParseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'That isn\u2019t valid JSON \u2014 is it a CRATE export file?' }; }
  let list, meta = {};
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object' && Array.isArray(data.releases)) {
    list = data.releases;
    if (data.format && data.format !== CX_FORMAT) return { ok: false, error: `This file is a \u201c${String(data.format).slice(0, 40)}\u201d file, not a CRATE export.` };
    meta = { version: data.version, exportedAt: data.exportedAt || '', options: data.options || null };
    if (Number(data.version) > CX_VERSION) return { ok: false, error: `This file was made by a newer version of CRATE (format ${data.version}); this one reads format ${CX_VERSION}.` };
  } else return { ok: false, error: 'This doesn\u2019t look like a CRATE export (no releases found in it).' };
  if (!list.length) return { ok: false, error: 'The file has no releases in it.' };
  if (list.length > CX_MAX_RELEASES) return { ok: false, error: `The file has ${list.length.toLocaleString()} releases; the limit for one import is ${CX_MAX_RELEASES.toLocaleString()}.` };
  return { ok: true, meta, releases: list.map((r, i) => cxNormalizeRelease(r, i)) };
}
function cxClassify(releases, existingIndex, keyFn) {          // new | duplicate (you own it) | repeat (again in the file) | invalid; and for the last three, dupLevel: exact (can't be added) or edition (a different pressing: your call)
  const first = new Map();
  releases.forEach(r => {
    if (r.invalid) { r.status = 'invalid'; return; }
    const k = keyFn(r.artist, r.title), owned = k ? (existingIndex.get(k) || []) : [];
    if (owned.length) { const cmp = owned.map(o => dupCompare(r, o)), ex = cmp.find(c => c.level === 'exact'); r.status = 'duplicate'; r.dupLevel = ex ? 'exact' : 'edition'; r.dupDiffs = (ex || cmp[0]).diffs; }
    else if (k && first.has(k)) { const c = dupCompare(r, first.get(k)); r.status = 'repeat'; r.dupLevel = c.level; r.dupDiffs = c.diffs; }
    else r.status = 'new';
    if (k && !first.has(k)) first.set(k, r);
  });
  return releases;
}
function cxShape(rel, opts) {                                  // what an import will really write, given the link / tracklist / cover choices
  const s = Object.assign({}, rel);
  if (rel.link && !opts.links[cxLinkKind(rel.link) || 'other']) s.link = '';
  if (rel.rymLink && !opts.links.other) s.rymLink = '';
  if (!opts.cover) s.cover = '';
  s.tracks = opts.tracks ? (rel.tracks || []).map(t => { const nt = { n: t.n, title: t.title }; if (t.durationMs) nt.durationMs = t.durationMs; if (t.section) nt.section = t.section; if (t.s) nt.s = t.s; if (t.rymRating) { nt.rymRating = t.rymRating; if (t.rymVotes) nt.rymVotes = t.rymVotes; } if (t.rymLink && opts.links.other) nt.rymLink = t.rymLink; ['spotify', 'youtube', 'soundcloud'].forEach(k => { if (t[k] && opts.links[k]) nt[k] = t[k]; }); return nt; }) : [];
  return s;
}
function cxAddPayload(s) {
  const p = { action: 'addAlbum', Artist: s.artist, Title: s.title, Type: s.type || 'Album', ReleaseDate: s.releaseDate, Recorded: s.recorded, Genre: s.genre, SecondaryGenre: s.secondaryGenre,
    Region: s.region, Location: s.location, Label: s.label, Catalog: s.catalog, Descriptor: s.descriptor, RymDescriptors: s.rymDescriptors, Scene: s.scene, Movement: s.movement, Link: s.link, RymLink: s.rymLink, Cover: s.cover };
  if (s.tracks.length) p.ManualTracks = JSON.stringify(s.tracks.some(t => t.durationMs || t.section || t.s)
    ? tlPersist(s.tracks.map(t => ({ trackNumber: t.n, title: t.title, youtubeLink: t.youtube || '', spotifyLink: t.spotify || '', durationMs: t.durationMs, section: t.section, s: t.s })), 'rym')       // lengths, headings and where the list came from, as the editor saves them
    : s.tracks.map(t => ({ trackNumber: t.n, title: t.title, youtubeLink: t.youtube || '', spotifyLink: t.spotify || '' })));   // only when there are songs: an empty list would stop the app looking the tracklist up
  return p;
}
function cxSoundcloudUpdates(s) {          // SoundCloud links, RYM's track ratings and song pages live with the per-song data, set after the release exists
  const u = {};
  (s.tracks || []).forEach(t => {
    const e = {}; if (t.soundcloud) e.soundcloudLink = t.soundcloud;
    if (t.rymRating) { e.rymRating = t.rymRating; if (t.rymVotes) e.rymVotes = t.rymVotes; e.rymFrom = 'rym'; }
    if (t.rymLink) e.rymLink = t.rymLink;
    if (Object.keys(e).length) u[t.n] = e;
  });
  return u;
}
// END crate-exchange

/* ---------- Export / import a crate ----------
   ⚙ → "Export crate…": choose which releases (everything, or what's showing now) and what goes in — tracklists, cover art, and
   WHICH LINKS: Spotify, YouTube, SoundCloud, Other (album/RYM links on any other site), with one-click presets (Everything / Only
   Spotify / Only YouTube / No links). A live summary and a preview show exactly what the file will hold; Download or Copy.
   ⚙ → "Import crate…": pick a file or paste its contents, choose again which links / tracklists / cover art to bring in, then REVIEW:
   every release is marked new, already in your crate, repeated in the file, or can't be imported (with the reason), you tick what
   to add and the totals follow. Only then are releases added — one at a time through the normal add call, with progress and
   Cancel; failures are listed with a Retry, and SoundCloud song links are attached once the releases exist. */
const CX_OPTS_KEY = 'crate_export_opts_v1';
function cxEl(id) { return document.getElementById(id); }      // a function declaration, not a const: init runs earlier in the file than this block, and a const wouldn't exist yet
const CX_LINK_IDS = { spotify: 'LinkSpotify', youtube: 'LinkYoutube', soundcloud: 'LinkSoundcloud', other: 'LinkOther' };
let cxImp = null, cxExportText = '';
function cxDefaultOpts() { return { tracks: true, cover: true, rym: false, links: { spotify: true, youtube: true, soundcloud: true, other: true } }; }
function cxLoadOpts() {
  const d = cxDefaultOpts();
  try {
    const s = JSON.parse(localStorage.getItem(CX_OPTS_KEY) || '{}') || {};
    if (typeof s.tracks === 'boolean') d.tracks = s.tracks;
    if (typeof s.cover === 'boolean') d.cover = s.cover;
    if (typeof s.rym === 'boolean') d.rym = s.rym;
    CX_KINDS.forEach(k => { if (s.links && typeof s.links[k] === 'boolean') d.links[k] = s.links[k]; });
  } catch (e) { /* defaults */ }
  return d;
}
function cxSaveOpts(o) { try { localStorage.setItem(CX_OPTS_KEY, JSON.stringify(o)); } catch (e) { /* not remembered */ } }
function cxSetBoxes(prefix, o) { cxEl(prefix + 'Tracks').checked = !!o.tracks; cxEl(prefix + 'Cover').checked = !!o.cover; if (cxEl(prefix + 'Rym')) cxEl(prefix + 'Rym').checked = !!o.rym; CX_KINDS.forEach(k => { cxEl(prefix + CX_LINK_IDS[k]).checked = !!o.links[k]; }); }
function cxGetBoxes(prefix) { const links = {}; CX_KINDS.forEach(k => { links[k] = cxEl(prefix + CX_LINK_IDS[k]).checked; }); return { tracks: cxEl(prefix + 'Tracks').checked, cover: cxEl(prefix + 'Cover').checked, rym: !!(cxEl(prefix + 'Rym') && cxEl(prefix + 'Rym').checked), links }; }
function cxPresetLinks(name) { return { spotify: name === 'all' || name === 'spotify', youtube: name === 'all' || name === 'youtube', soundcloud: name === 'all', other: name === 'all' }; }
function cxN(n, w) { return `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`; }
function cxFmtCounts(c, head) {
  const L = c.links, bits = [];
  if (L.spotify) bits.push(`${L.spotify.toLocaleString()} Spotify`); if (L.youtube) bits.push(`${L.youtube.toLocaleString()} YouTube`);
  if (L.soundcloud) bits.push(`${L.soundcloud.toLocaleString()} SoundCloud`); if (L.other) bits.push(`${L.other.toLocaleString()} other`);
  return `${head || cxN(c.releases, 'release')} \u00b7 ${cxN(c.tracks, 'song')} \u00b7 ${bits.length ? 'links: ' + bits.join(', ') : 'no links'}`;
}
