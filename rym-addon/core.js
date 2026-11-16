/* CRATE · RYM add-on — shared matching logic (no browser APIs, so it can be tested on its own).
   The matching rules are the same ones CRATE uses for its duplicate protection (dupKey / dupCompare in the app): keep them in step. */
(function (root) {
  'use strict';
  function fold(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['\u2018\u2019`]/g, ''); }
  function words(s) { return fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }                 // letters and digits in any script
  function key(artist, title) {
    artist = tidyName(artist); title = tidyName(title);          // (a name that picked up the page's own wording matches the clean one)
    const raw = String(title == null ? '' : title), stripped = raw.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ');
    const a = words(artist).replace(/^the /, ''), t = (words(stripped) || words(raw)).replace(/^the /, '');
    return a && t ? a + '::' + t : '';
  }
  function editionText(x) {
    const br = (String(x.title || '').match(/[\(\[][^\)\]]*[\)\]]/g) || []).map(s => s.slice(1, -1));
    return [x.descriptor].concat(br).map(s => String(s == null ? '' : s).trim()).filter(Boolean).join(', ');
  }
  function editionSig(x) { return [...new Set(words(editionText(x)).split(' ').filter(Boolean))].sort().join(' '); }
  function year(d) { const m = /^(\d{4})/.exec(String(d == null ? '' : d).trim()); return m ? m[1] : ''; }
  function sameEdition(a, b) {                           // a: what the page shows, b: what you own -> true when nothing says they're different editions
    if (editionSig(a) !== editionSig(b)) return false;
    const ya = year(a.releaseDate), yb = year(b.releaseDate);
    return !(ya && yb && ya !== yb);
  }
  // Release TYPES. CRATE's (Album, EP, Single, Compilation, Live, Mixtape) and RYM's (album, ep, single, comp, musicvideo, mixtape, djmix, bootleg…)
  // are both reduced to RYM's own groups. '' means unknown, which never counts against a match. RYM files live albums under "album".
  const TYPE_GROUPS = { album: 'album', lp: 'album', live: 'album', livealbum: 'album', soundtrack: 'album', ep: 'ep', single: 'single', comp: 'comp', compilation: 'comp',
    mixtape: 'mixtape', djmix: 'djmix', musicvideo: 'video', video: 'video', bootleg: 'bootleg', unauthorized: 'bootleg', additional: 'additional' };
  function typeGroup(t) {
    const s = fold(t).replace(/[^a-z]+/g, '');
    if (!s || s === 'unknown') return '';
    return TYPE_GROUPS[s] || s;                                                            // a type not listed stays as it is, so two different ones still differ
  }
  function slug(s) { return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  // "https://rateyourmusic.com/release/album/yes/close-to-the-edge/?x=1#y" -> "/release/album/yes/close-to-the-edge"; '' if it isn't a release address
  function rymPath(u) {
    let p = String(u == null ? '' : u).trim();
    if (!p) return '';
    try { p = new URL(p, 'https://rateyourmusic.com/').pathname; } catch (e) { return ''; }
    try { p = decodeURIComponent(p); } catch (e) { /* keep as is */ }
    p = p.toLowerCase().replace(/\/+$/, '');
    return /^\/release\/[a-z0-9_-]+\/[^\/]+\/[^\/]+$/.test(p) ? p : '';
  }
  function rymType(u) { const p = rymPath(u); return p ? typeGroup(p.split('/')[2]) : ''; }          // "/release/single/…" -> 'single'
  function typeFromText(text) {                                                                      // the "1986 | Single" line, for when a row has no usable address
    const m = /[|\u00b7\u2022\u2502\u00a6]\s*(album|ep|single|compilation|mixtape|dj mix|music video|video|bootleg|additional|unauthorized)\b/i.exec(String(text == null ? '' : text));
    return m ? typeGroup(m[1]) : '';
  }
  function compact(it) {                                  // what is kept about a release: just enough to recognise it
    const c = String(it.catalog == null ? '' : it.catalog).trim();
    const r = rymPath(it.rymLink);
    return { a: String(it.artist || '').trim(), t: String(it.title || '').trim(), y: year(it.releaseDate), d: String(it.descriptor || '').trim(), r, c: /^CRT-\d+$/i.test(c) ? '' : c, ty: typeGroup(it.type) || (r ? typeGroup(r.split('/')[2]) : '') };
  }
  function fromCrateItems(items) { return (items || []).map(compact).filter(c => c.a && c.t); }
  function fromExportJson(data) {                         // a "crate-export" file made by CRATE's Export crate…
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return { ok: false, error: 'That isn\u2019t valid JSON.' }; } }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.releases) ? data.releases : null;
    if (!list) return { ok: false, error: 'That doesn\u2019t look like a CRATE export (no releases in it).' };
    const items = list.filter(r => r && typeof r === 'object').map(r => compact({ artist: r.artist, title: r.title, type: r.type, releaseDate: r.releaseDate, descriptor: r.descriptor, catalog: r.catalog, rymLink: r.rymLink })).filter(c => c.a && c.t);
    return { ok: true, items, withRym: items.filter(i => i.r).length };
  }
  function yearFromText(text, title) {                    // the release year shown on a discography item (a year inside the title itself is ignored)
    let t = String(text == null ? '' : text);
    if (title) t = t.split(String(title)).join(' ');
    const m = /\b(1[89]\d\d|20\d\d)\b/.exec(t);
    return m ? m[1] : '';
  }
  function makeMatcher(items) {
    const byPath = new Map(), byKey = new Map();
    (items || []).forEach(it => {
      if (it.r && !byPath.has(it.r)) byPath.set(it.r, it);
      const k = key(it.a, it.t); if (!k) return;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(it);
    });
    return {
      size: (items || []).length, withRym: byPath.size,
      // q: { href, title, artist (the page's artist), year } -> { status: 'owned' | 'edition' | 'none', how, item }
      match(q, opts) {
        opts = opts || {};
        const p = rymPath(q.href);
        if (p && byPath.has(p)) return { status: 'owned', how: 'rym-link', item: byPath.get(p) };
        if (opts.byTitle === false || !q.title || !q.artist) return { status: 'none' };
        const urlArtist = p ? p.split('/')[3] : '', pageArtist = slug(q.artist);
        const strip = s => s.replace(/^the-/, '');
        if (opts.guard !== false && urlArtist && pageArtist && strip(urlArtist) !== strip(pageArtist)) return { status: 'none', note: 'a release by another artist' };   // guard: for a page about ONE artist; a row that names its own artist (a genre page) turns it off   // e.g. a compilation the artist "appears on"
        const all = byKey.get(key(q.artist, q.title)) || [];
        if (!all.length) return { status: 'none' };
        // Same artist and title is NOT enough: an album, its single and its video share both. A known type on each side must agree
        // (an unknown type on either side gets the benefit of the doubt: a saved RYM address already settles those exactly).
        const qt = typeGroup(q.type) || rymType(q.href);                                  // the type is in the release address itself, so the matcher reads it even if the caller didn't
        const cands = opts.types === false || !qt ? all : all.filter(c => !c.ty || c.ty === qt);
        if (!cands.length) return { status: 'none', note: 'same title, but a different type of release', other: all[0] };
        const shown = { title: q.title, releaseDate: q.year || '' };
        const same = cands.find(c => sameEdition(shown, { title: c.t, descriptor: c.d, releaseDate: c.y }));
        return same ? { status: 'owned', how: 'title', item: same } : { status: opts.editions === false ? 'owned' : 'edition', how: 'title', item: cands[0] };
      }
    };
  }
  // ---- the record of how a release's rating changes (the same rules as CRATE's, generated from one source) ----
  const ADDON_HIST_CAP = 40;                                 // what this add-on keeps per release (browser storage is limited); CRATE keeps more
const RYM_HIST_CAP = 120, RYM_HIST_VOTES_STEP = 0.05, RYM_DAY_MS = 86400000;
function rymHistPoint(p) {                                   // one point cleaned, or null: [ms, average 0.01-5 (2 places), count (whole, never negative)]
  if (!Array.isArray(p)) return null;
  const t = Math.round(Number(p[0])), a = Math.round(Number(p[1]) * 100) / 100, n = Math.max(0, Math.round(Number(p[2]) || 0));
  return isFinite(t) && t > 0 && isFinite(a) && a > 0 && a <= 5 ? [t, a, n] : null;
}
function rymHistNorm(list, cap) {                            // untrusted list -> clean, oldest first, exact duplicates removed, one point a day (the latest), capped
  const pts = (Array.isArray(list) ? list : []).map(rymHistPoint).filter(Boolean).sort((x, y) => x[0] - y[0]), out = [];
  pts.forEach(p => {
    const last = out[out.length - 1];
    if (last && Math.floor(last[0] / RYM_DAY_MS) === Math.floor(p[0] / RYM_DAY_MS)) out[out.length - 1] = p;     // same day: the later one stands
    else out.push(p);
  });
  const c = cap || RYM_HIST_CAP; while (out.length > c) out.splice(1, 1);
  return out;
}
const rymHistSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function rymHistRecord(hist, point, cap) {                   // a NEW reading: kept only when it is worth keeping -> { hist, changed }
  const h = rymHistNorm(hist, cap), p = rymHistPoint(point); if (!p) return { hist: h, changed: false };
  if (!h.length) return { hist: [p], changed: true };
  if (h.some(q => Math.floor(q[0] / RYM_DAY_MS) === Math.floor(p[0] / RYM_DAY_MS) && q[1] === p[1] && q[2] === p[2])) return { hist: h, changed: false };      // already there (the same figures that day, whatever the time): nothing to record
  const last = h[h.length - 1];
  if (p[0] < last[0]) { const m = rymHistNorm(h.concat([p]), cap); return { hist: m, changed: !rymHistSame(m, h) }; }       // out of order (merging old with new): just place it
  const moved = p[2] > 0 && (last[2] <= 0 || Math.abs(p[2] - last[2]) / last[2] >= RYM_HIST_VOTES_STEP);
  if (p[1] === last[1] && !moved) return { hist: h, changed: false };
  const m = rymHistNorm(h.concat([p]), cap); return { hist: m, changed: !rymHistSame(m, h) };       // (a reading from the same day as the last one replaces it: the normaliser keeps one point a day)
}
function rymHistMerge(lists, cap) {                          // the union of several records of the same release (yours, the add-on's, the copy kept here)
  const all = []; (lists || []).forEach(l => { if (Array.isArray(l)) l.forEach(p => all.push(p)); });
  return rymHistNorm(all, cap);
}
  // ---- reading a tracklist: the same rules the CRATE editor uses for a pasted list (generated from one source) ----
function tlParseTime(s) {                                    // "3:12", "03:12", "1:02:03" -> milliseconds; anything else 0
  const t = String(s == null ? '' : s).trim(); let m;
  if ((m = /^(\d{1,3}):([0-5]\d)$/.exec(t))) return (Number(m[1]) * 60 + Number(m[2])) * 1000;
  if ((m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(t))) return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000;
  return 0;
}
function tlFormatTime(ms) {                                  // 192000 -> "3:12"; 3723000 -> "1:02:03"; nothing/0 -> ""
  const sec = Math.round(Number(ms) / 1000); if (!(sec > 0)) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
function tlKey(title) {                                      // for telling whether two titles are the same song: case, accents, punctuation and (bracketed notes) don't matter
  const plain = String(title == null ? '' : title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['\u2019]/g, '');      // an apostrophe disappears (dont = don't), other punctuation is a space
  const noParen = plain.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  return noParen || plain.replace(/[^a-z0-9]+/g, ' ').trim();
}
const TL_IGNORE = /^(?:track\s*list(?:ing)?|tracks?|total(?:\s+(?:length|time|playing\s+time|duration|running\s+time))?\b.*|running\s+time\b.*|length\s*:.*|duration\s*:.*)\s*:?$/i;
const TL_HEADERS = [/^(?:disc|disk|cd|lp)\s*(?:\d{1,2}|one|two|three|four)\b.{0,28}$/i, /^side\s+(?:[a-d]|\d{1,2}|one|two)\b.{0,20}$/i, /^bonus(?:\s+(?:tracks?|disc|disk|cd|material))?\s*:?$/i];
function tlIsHeader(line) { return line.length <= 40 && !/\d:\d\d/.test(line) && TL_HEADERS.some(re => re.test(line)); }
function tlParseText(text) {                                 // a pasted list -> { tracks: [{ title, durationMs, section }], notes: { sections, withTimes, skipped } }
  const lines = String(text == null ? '' : text).replace(/\r/g, '').replace(/[\u00a0\u202f]/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
  const vinyl = lines.filter(l => /^[A-Ha-h]\d{1,2}\s*[.):\-\u2013\u2014]?\s+\S/.test(l)).length >= 2;      // "A1 Title / A2 Title / B1 Title": vinyl numbering, only when it clearly is
  const tracks = [], notes = { sections: 0, withTimes: 0, skipped: 0 }; let section = '', expected = 1;
  for (let line of lines) {
    if (TL_IGNORE.test(line)) { notes.skipped++; continue; }
    if (tlIsHeader(line)) { section = line.replace(/\s*:\s*$/, '').replace(/^./, c => c.toUpperCase()); notes.sections++; expected = 1; continue; }
    let durationMs = 0, num = 0, title = line, m;
    if (line.includes('\t')) {                               // columns copied from a table: number, title, time
      const cells = line.split('\t').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2 && /^\d{1,3}[.)]?$/.test(cells[0])) { num = parseInt(cells[0], 10); const rest = cells.slice(1), tc = rest.find(c => tlParseTime(c) > 0); if (tc) durationMs = tlParseTime(tc); title = rest.filter(c => c !== tc)[0] || ''; }
      else title = cells.join(' ');
    }
    if (!num) {
      title = title.replace(/^[\u2022\u00b7*]\s+/, '').replace(/^-\s+/, '');
      if ((m = /^(?:\d{1,2}:)?\d{1,2}:[0-5]\d\s+(\S.*)$/.exec(title))) title = m[1];                          // a time at the START is a chapter stamp, not a length: ignored
      else if ((m = /^(\d{1,3})\s*[.):\]]\s*(\S.*)$/.exec(title))) { num = +m[1]; title = m[2]; }              // "1. Title", "1) Title", "01: Title"
      else if ((m = /^(\d{1,3})\s*[-\u2013\u2014]\s+(\S.*)$/.exec(title))) { num = +m[1]; title = m[2]; }      // "01 - Title" (a dash with a space after: "7-Eleven" stays a title)
      else if (vinyl && (m = /^[A-Ha-h]\d{1,2}\s*[.):\-\u2013\u2014]?\s+(\S.*)$/.exec(title))) title = m[1];
      else if ((m = /^(\d{1,3})\s+(\S.*)$/.exec(title)) && +m[1] === expected) { num = +m[1]; title = m[2]; }  // "3 Title": only when it is the NEXT number ("99 Problems" is a title)
    }
    if (!durationMs) {
      const tm = /^(.*?)[\s\-\u2013\u2014]*[\(\[]?\s*((?:\d{1,2}:)?\d{1,3}:[0-5]\d)\s*[\)\]]?\s*$/.exec(title);
      if (tm && tm[1].trim() && tlParseTime(tm[2])) { durationMs = tlParseTime(tm[2]); title = tm[1]; }
    }
    title = title.replace(/\s+/g, ' ').trim().replace(/^(["\u201c])(.+)(["\u201d])$/, '$2').trim();
    if (!title || (/^\d{1,3}$/.test(title) && !durationMs) || tlParseTime(title)) { notes.skipped++; continue; }       // a lone 1-3 digit number is a stray track number, not a title ('1979' is a title)
    tracks.push({ title, durationMs, section }); if (durationMs) notes.withTimes++; expected = (num || expected) + 1;
  }
  return { tracks, notes };
}
// Replacing a list: a new track whose title matches an old one KEEPS the old one's number (and its links and length, unless the new list gives its own), so its rating, notes and ticks stay with it.
// Anything else gets a number nobody has used (past every number in the rows AND every number the album still holds data for).
function tlAssignNumbers(oldRows, newTracks, minNext) {
  const pool = (oldRows || []).filter(r => r && r.trackNumber).map(r => ({ r, key: tlKey(r.title), used: false }));
  let next = Math.max(Number(minNext) || 0, ...pool.map(p => p.r.trackNumber), 0) + 1, matched = 0;
  const rows = (newTracks || []).map(t => {
    const k = tlKey(t.title), hit = k ? pool.find(p => !p.used && p.key === k) : null;
    if (hit) { hit.used = true; matched++; return Object.assign({}, t, { trackNumber: hit.r.trackNumber, youtubeLink: t.youtubeLink || hit.r.youtubeLink || '', spotifyLink: t.spotifyLink || hit.r.spotifyLink || '', durationMs: t.durationMs || hit.r.durationMs || 0 }); }
    return Object.assign({}, t, { trackNumber: next++ });
  });
  return { rows, matched, fresh: rows.length - matched, dropped: pool.filter(p => !p.used).map(p => p.r) };
}
function tlMove(arr, from, to) {                              // a copy with the item at `from` moved to index `to`
  const a = (arr || []).slice(); if (from < 0 || from >= a.length) return a; const t = Math.max(0, Math.min(a.length - 1, to)), [x] = a.splice(from, 1); a.splice(t, 0, x); return a;
}
  // ---- ratings seen on RateYourMusic pages (so CRATE can show them next to your own) ----
  // A discography row ends with three figures: the average (3.65), how many ratings (146), how many reviews (1). The average always has two
  // decimals, so a year (1990), a count or a review total can never be mistaken for it; the ratings count is the whole number right after it.
  const AVG_RE = /^(?:[0-4]\.\d{2}|5\.00)$/, COUNT_RE = /^(?:\d{1,3}(?:[,.\u202f\u00a0 ]\d{3})+|\d+|\d+(?:[.,]\d+)?\s?[kKmM])$/;
  // A ratings count as the page writes it -> { n, u } (u: how far a SHORTENED count can be from the real one, 0 for an exact count), or null.
  // Exact: "7,000", "7.000", "7 000", "146". Shortened: "6k" (5,500 to 6,499), "6.1k", "1.2m". Before 1.12.5 a shortened count was read as 0
  // (or, in CRATE, "6k" as 6), and that 0 then replaced the real count.
  function countFrom(text) {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    const m = /(\d{1,3}(?:[,.\u202f\u00a0 ]\d{3})+|\d+(?:[.,]\d+)?)(?:\s?([kKmM])(?![a-zA-Z]))?/.exec(t); if (!m) return null;
    if (m[2]) {
      const dec = (m[1].split(/[.,]/)[1] || '').length, mult = /k/i.test(m[2]) ? 1e3 : 1e6, v = parseFloat(m[1].replace(',', '.'));
      return isFinite(v) && v > 0 ? { n: Math.round(v * mult), u: mult / Math.pow(10, dec) } : null;
    }
    const n = parseInt(m[1].replace(/\D/g, ''), 10); return n > 0 ? { n, u: 0 } : null;
  }
  function ratingFromLeaves(leaves) {                      // the visible text of an item's smallest elements, in page order -> { a, n } | null
    const L = (leaves || []).map(t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (let i = 0; i < L.length; i++) {
      if (!AVG_RE.test(L[i])) continue;
      const a = Number(L[i]); if (!(a > 0 && a <= 5)) continue;
      const c = i + 1 < L.length && COUNT_RE.test(L[i + 1]) ? countFrom(L[i + 1]) : null;
      return { a, n: c ? c.n : 0, u: c ? c.u : 0 };
    }
    return null;
  }
  function ratingFromTexts(avgText, countText) {            // the same, when the page names the two elements
    const at = String(avgText == null ? '' : avgText).replace(/\s+/g, ' ').trim(); if (!AVG_RE.test(at)) return null;
    const ct = String(countText == null ? '' : countText).replace(/\s+/g, ' ').trim();
    const c = countFrom(ct);                                                               // the first number in it: "7,000", "7,000 Ratings", "Ratings: 7,000" and "7k" (about 7000)
    return { a: Number(at), n: c ? c.n : 0, u: c ? c.u : 0 };
  }
  function rymNames(path) {                                 // "/release/album/sigur-ros/agaetis-byrjun" -> { ar: 'sigur ros', ti: 'agaetis byrjun' }: a way to recognise a release seen only by its address
    const parts = String(path || '').split('/'); return parts.length >= 5 ? { ar: parts[3].replace(/-/g, ' '), ti: parts[4].replace(/-/g, ' ') } : { ar: '', ti: '' };
  }
  // What is kept: { [release address]: { a, n, ar, ti, ty, y, t } }. Merge new sightings in; only a real change touches the stored copy (and its time).
  function overallRank(text) {                              // "Ranked #40 for 1991, #1,475 overall" -> 1475 (0 when the page gives no overall rank)
    const m = /#\s*(\d[\d,\s]*)\s+overall\b/i.exec(String(text == null ? '' : text)); if (!m) return 0;
    const n = parseInt(m[1].replace(/[,\s]/g, ''), 10); return isFinite(n) && n > 0 && n < 10000000 ? n : 0;
  }
  function mergeRatings(existing, entries, cap) {
    const out = Object.assign({}, existing || {}); let changed = false, added = 0, updated = 0;
    (entries || []).forEach(e => {
      if (!e || !e.p || !(e.a > 0 && e.a <= 5)) return;
      const prev = out[e.p], kk = Number(e.k) > 0 ? Math.round(Number(e.k)) : 0;          // kk: the overall rank, when this sighting gave one (a list page doesn't)
      const bb = e.b === 1 || e.b === 0 ? e.b : null;          // bb: printed in bold on a list page (1) or not (0), when that page told
      let n = Number(e.n) > 0 ? Math.round(Number(e.n)) : 0, u = n && Number(e.u) > 0 ? Number(e.u) : 0;
      if (prev && prev.n > 0) {
        if (!n) { n = prev.n; u = prev.u || 0; }                                          // this page showed no count: the one already known stands
        else if (u && !(prev.u > 0) && Math.abs(prev.n - n) <= u / 2) { n = prev.n; u = 0; }          // a shortened count ("6k") that the exact one already known fits
      }
      if (prev && prev.a === e.a && (prev.n || 0) === n) {                          // same figures: only fill in names the older sighting lacked, and keep the rank current
        const fill = {}; ['ar', 'ti', 'ty', 'y'].forEach(k => { if (!prev[k] && e[k]) fill[k] = e[k]; }); if (kk && (prev.k || 0) !== kk) fill.k = kk; if (bb !== null && prev.b !== bb) fill.b = bb;
        if (Object.keys(fill).length) { out[e.p] = Object.assign({}, prev, fill); changed = true; }
        return;
      }
      const t = e.t || Date.now(), seed = prev ? (prev.h && prev.h.length ? prev.h : [rymHistPoint([prev.t, prev.a, prev.n])].filter(Boolean)) : [];      // an older entry with no trail starts one from what it had
      out[e.p] = { a: e.a, n, u, ar: e.ar || (prev && prev.ar) || '', ti: e.ti || (prev && prev.ti) || '', ty: e.ty || (prev && prev.ty) || '', y: e.y || (prev && prev.y) || '', k: kk || (prev && prev.k) || 0, ...(bb !== null ? { b: bb } : prev && (prev.b === 1 || prev.b === 0) ? { b: prev.b } : {}), t, h: rymHistRecord(seed, [t, e.a, n], ADDON_HIST_CAP).hist };
      changed = true; if (prev) updated++; else added++;
    });
    const keys = Object.keys(out); const max = cap || 20000;
    if (keys.length > max) { keys.sort((x, y) => (out[x].t || 0) - (out[y].t || 0)).slice(0, keys.length - max).forEach(k => delete out[k]); changed = true; }
    return { out, changed, added, updated };
  }
  // ---- genre descriptions seen on RateYourMusic genre pages (so CRATE can fill in a genre's description) ----
  function genreSlugFromPath(path) {                        // "/genre/progressive-rock/" -> "progressive-rock"; a sub-page ("/genre/x/artists") or anything else -> ''
    const m = /^\/genre\/([^\/?#]+)\/?$/.exec(String(path == null ? '' : path).toLowerCase()); if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  function genreNameFromSlug(slug) { return String(slug == null ? '' : slug).replace(/-/g, ' ').trim(); }
  const NOISE_LINE = /^(?:read more|show more|show less|more|less|edit|suggest(?:ed)? edit|report|share|\d+ comments?)$/i;
  function cleanGenreText(raw) {                            // the text of the description, as paragraphs separated by one blank line, with page furniture ("Read more") removed
    const lines = String(raw == null ? '' : raw).replace(/\r/g, '').replace(/[\u00a0\u202f]/g, ' ').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());
    let t = lines.filter(l => !NOISE_LINE.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
    if (t.length > 8000) t = t.slice(0, 8000).replace(/\s+\S*$/, '') + '\u2026';
    return t;
  }
  // What is kept: { [slug]: { s, n, d, u, t } } (slug, name as the page calls it, description, address, time). Only a real change touches the stored copy.
  // ---- an artist's page (1.21.0): the facts RYM lists beside the name ("Born", "Formed", "Members", "Member of", "Also Known As"…), kept for CRATE ----
  function splitNameList(text) {                           // "John Lennon (vocals, guitar, 1960-70), Paul McCartney (bass)" -> [{ name, role }]: commas inside brackets don't split
    const out = [], s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim(); let depth = 0, cur = '';
    const push = () => { const t = cur.trim(); cur = ''; if (!t) return; const m = /^(.*?)\s*\((.*)\)\s*$/.exec(t), name = (m ? m[1] : t).trim(), role = m ? m[2].trim() : ''; if (name && name.length <= 200) out.push({ name, role: role.slice(0, 80) }); };
    for (const ch of s) { if (ch === '(' || ch === '[') depth++; if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1); if (ch === ',' && depth === 0) push(); else cur += ch; }
    push(); return out.slice(0, 100);
  }
  const ARTIST_FIELDS = { born: /^born$/i, died: /^died$/i, formed: /^formed$/i, disbanded: /^disbanded$/i, members: /^(?:members|current members|former members)$/i, memberOf: /^member of$/i, aka: /^(?:also known as|aka)$/i, genres: /^genres?$/i };
  function artistFromFields(fields, name, p) {             // fields: [{ label, text }] read beside the name -> the entry kept for CRATE, or null
    const out = { p: String(p || ''), name: String(name || '').trim().slice(0, 200), t: Date.now() }, s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
    (fields || []).forEach(f => {
      const key = Object.keys(ARTIST_FIELDS).find(k => ARTIST_FIELDS[k].test(String(f && f.label || '').trim())); if (!key) return;
      if (key === 'members') out.members = (out.members || []).concat(splitNameList(f.text));
      else if (key === 'memberOf') out.memberOf = splitNameList(f.text).map(m => m.name);
      else if (key === 'aka') out.aka = splitNameList(f.text).map(m => m.name);
      else if (key === 'genres') out.genres = splitNameList(f.text).map(m => m.name).slice(0, 12);
      else out[key] = s(f.text, 160);
    });
    return out.name && out.p && (out.born || out.formed || out.members || out.memberOf || out.aka || out.died || out.disbanded) ? out : null;
  }
  function mergeArtist(existing, e, cap) {
    const out = Object.assign({}, existing || {}); if (!e || !e.p) return { out, changed: false };
    const prev = out[e.p], strip = (x) => JSON.stringify(Object.assign({}, x, { t: 0 }));
    if (prev && strip(prev) === strip(e)) return { out, changed: false };
    out[e.p] = e; const keys = Object.keys(out), max = cap || 3000;
    if (keys.length > max) keys.sort((x, y) => (out[x].t || 0) - (out[y].t || 0)).slice(0, keys.length - max).forEach(k => delete out[k]);
    return { out, changed: true };
  }
  function mergeGenre(existing, e, cap) {
    const out = Object.assign({}, existing || {}); let changed = false, added = false, updated = false;
    if (e && e.s && e.d && e.d.length >= 20) {
      const prev = out[e.s];
      if (prev && prev.d === e.d) { if ((!prev.n && e.n) || (!prev.u && e.u)) { out[e.s] = Object.assign({}, prev, { n: prev.n || e.n, u: prev.u || e.u }); changed = true; } }
      else { out[e.s] = { s: e.s, n: e.n || (prev && prev.n) || genreNameFromSlug(e.s), d: e.d, u: e.u || (prev && prev.u) || '', t: e.t || Date.now() }; changed = true; if (prev) updated = true; else added = true; }
    }
    const keys = Object.keys(out), max = cap || 1500;
    if (keys.length > max) { keys.sort((x, y) => (out[x].t || 0) - (out[y].t || 0)).slice(0, keys.length - max).forEach(k => delete out[k]); changed = true; }
    return { out, changed, added, updated };
  }
  // ---- a release's tracklist as RateYourMusic shows it ----
  const TL_NOISE = /^(?:show track credits|hide track credits|show credits|hide credits|credits|lyrics|edit|more|less|add|rate|show more|show less|buy|listen|play|\|)$/i;
  function tlIsNoise(t) { return TL_NOISE.test(String(t == null ? '' : t).replace(/\s+/g, ' ').trim()); }            // a button's text (lyrics, show credits…), never part of a title
  const TL_BULLET = /^[-\u2013\u2014\u2022]\s*/, TL_NUM = /^(?:[A-Pa-p]\d{1,2}|\d{1,3}(?:-\d{1,3})?)[.)]?$/;
  const TL_RATING = /^[\u2605\u2606]?\s*([0-4]\.\d{1,2}|5\.0{1,2})(?:\s*\|\s*[\d,.\u202f\u00a0 ]+)?$/;      // "4.3", "4.31", "\u2605 4.3 | 683"
  function trackFromLeaves(leaves) {                       // one tracklist row's visible pieces -> { title, durationMs, rating, sub? } | null
    // The pieces are classified by what they ARE, not by where they sit: a page can put the rating and vote count before the number and title ("4.0", "11", "1", "Our Secret", "lyrics", "2:51"),
    // another after them. The title is the first piece with a letter in it that is not a track number (A1), a rating or a time, and (when the row has a length) comes before the length.
    const raw = (leaves || []).map(t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim()).filter(Boolean);
    const P = raw.map((t, i) => ({ t, i })).filter(x => !TL_NOISE.test(x.t));
    let durationMs = 0, timeAt = -1;
    P.forEach((x, k) => { if (timeAt < 0) { const ms = tlParseTime(x.t); if (ms) { durationMs = ms; timeAt = k; } } });
    const ratingShaped = (t) => TL_RATING.test(t) && !TL_NUM.test(t), bar = (x) => raw[x.i + 1] === '|', lone = (t) => /^[-\u2013\u2014\u2022]$/.test(t);
    const sideLetter = (t) => /^[A-H]{1,2}$/.test(t), countShaped = (t) => /^\d[\d,]*$/.test(t) || /^\d{1,3}(?:\.\d)?\s?[kKmM]$/.test(t), afterRating = (j) => j > 0 && ratingShaped(P[j - 1].t) && countShaped(P[j].t);          // a side on its own ("A", "AA"); digits straight after a rating are its vote count, written out ("683") or abbreviated ("6k", "1.2k")
    // A side letter on its own is the track NUMBER when the row has something else that can be the title: a piece with letters in it, or digits after it ("A", "1490"). A track really called "A" is
    // still found when it has a number of its own before it ("1", "A") or nothing else beside it.
    const isSideNum = (k) => sideLetter(P[k].t) && P.some((x, j) => j !== k && (timeAt < 0 || j < timeAt) && !sideLetter(x.t) && !ratingShaped(x.t) && !afterRating(j) && !tlParseTime(x.t) && ((/\p{L}/u.test(x.t) && !TL_NUM.test(x.t)) || (j > k && /^\d{1,6}$/.test(x.t))));
    let title = '', sub = false, chosen = -1;
    for (let k = 0; k < P.length; k++) {
      const t = P[k].t; if (timeAt >= 0 && k > timeAt) break; if (k === timeAt) continue;
      if (lone(t)) { sub = true; continue; }
      if (TL_NUM.test(t) || isSideNum(k) || ratingShaped(t) || afterRating(k) || !/\p{L}/u.test(t)) continue;          // (a count straight after a rating, "6k", has a letter in it but is never the title)
      title = t; chosen = k; break;
    }
    if (!title) {                                           // no piece with a letter: a title made of digits ("1979", "99") or one that looks like a rating ("4.20")
      const end = timeAt >= 0 ? timeAt : P.length, seq = [];
      for (let k = 0; k < end; k++) if (!afterRating(k)) seq.push(k);
      const numAt = seq.findIndex(k => TL_NUM.test(P[k].t) || isSideNum(k));                      // the track number: the first piece that looks like one (3, A1, 1-04, or a side letter)
      const rest = numAt < 0 ? [] : seq.filter((k, idx) => idx !== numAt && /^\d{1,6}$/.test(P[k].t) && !ratingShaped(P[k].t));          // a title of digits ("1979", "1490") needs a number of its own to be told from it
      if (rest.length) { chosen = rest[rest.length - 1]; title = P[chosen].t; }
      else { for (let k = 0; k < end; k++) if (ratingShaped(P[k].t) && !bar(P[k]) && !(P[k + 1] && /^\d[\d,.]*$/.test(P[k + 1].t))) { chosen = k; title = P[k].t; break; } }          // a rating followed by "|" and a count, or by the count itself, is a rating, never a title
    }
    if (!title) return null;
    let rating = 0, votes = 0; const cnt = (x) => { const t = String(x).trim(), m = /^(\d{1,3}(?:\.\d)?)\s?([kKmM])$/.exec(t), n = m ? Math.round(parseFloat(m[1]) * (/k/i.test(m[2]) ? 1e3 : 1e6)) : parseInt(t.replace(/\D/g, ''), 10); return n > 0 && n <= 1e9 ? n : 0; };          // "6k" is about 6000 (the page rounds it)
    for (let k = 0; k < P.length; k++) {
      if (k === chosen) continue; const m = TL_RATING.exec(P[k].t);
      if (m && !TL_NUM.test(P[k].t)) {
        rating = Number(m[1]);
        const inl = /\|\s*(\d[\d,.\u202f\u00a0 ]*)$/.exec(P[k].t);                               // how many ratings it is based on: after a bar in the same piece ("4.3 | 683"),
        let j = k + 1; if (P[j] && P[j].t === '|') j++;
        if (inl) votes = cnt(inl[1]); else if (P[j] && countShaped(P[j].t)) votes = cnt(P[j].t);          // or as the digits right after it (with or without a bar between)
        break;
      }
    }
    if (TL_BULLET.test(title) && title.replace(TL_BULLET, '')) { sub = true; title = title.replace(TL_BULLET, ''); }
    let pos = '';                                           // its position as the page writes it ("A", "B2", "3"): the first track-number piece before the title (a vote count is never one)
    for (let k = 0; k < P.length && (chosen < 0 || k < chosen); k++) if (k !== timeAt && !afterRating(k) && !ratingShaped(P[k].t) && (TL_NUM.test(P[k].t) || isSideNum(k))) { pos = P[k].t.replace(/[.)]$/, ''); break; }
    return Object.assign({ title: title.slice(0, 200), durationMs, rating }, rating && votes ? { votes } : {}, sub ? { sub: true } : {}, pos ? { pos } : {});
  }
  function tracksFromRow(pieces) {                          // one row's pieces -> [the track, ...its sub-items]: a row can hold its own "- Piece One 3:58" lines
    const L = (pieces || []).map(t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim()).filter(Boolean);       // (the separators stay: trackFromLeaves uses a "|" to tell a rating from a title)
    const cuts = []; let seen = false;
    L.forEach((t, i) => { if (TL_NOISE.test(t)) return; const bullet = TL_BULLET.test(t); if (!seen) { if (!TL_NUM.test(t) && !/^[-\u2013\u2014\u2022]$/.test(t)) seen = true; return; } if (bullet) cuts.push(i); });
    const out = [], edges = [0].concat(cuts, [L.length]);
    for (let k = 0; k < edges.length - 1; k++) { const t = trackFromLeaves(L.slice(edges[k], edges[k + 1])); if (t) out.push(t); }
    return out;
  }
  function isExtraTitle(title) { return /^total\b.*\b(?:length|time|duration)\b/i.test(title) || /\[(?:video|dvd|cd-?rom|multimedia|enhanced)\]\s*$/i.test(title); }       // "Total length: 57:16", "Limbo Central [video]"
  function isExtrasHeader(text) { return /^(?:enhanced content|multimedia|bonus (?:video|dvd|content)s?|videos?)$/i.test(String(text == null ? '' : text).trim()); }
  // A part of a track is not a track of its own: a "- Piece One 3:58" line, or (1.20.1) a lettered one with no position of its own under a track that has one
  // ("A4 The Nancy & Mary Music" / "a) Part 1 2:42", "b) Part 2", "i. …"). It adds its length to a track that had none.
  const TL_PART = /^\(?(?:[a-z]|[ivx]{1,4})[.)]\s+\S/i;
  function foldSubTracks(list) {
    const out = []; let open = null;
    (list || []).forEach(t => {
      const prev = out[out.length - 1], part = t.sub || (!t.pos && TL_PART.test(String(t.title || '')) && prev && !!prev.pos);
      if (part) { if (open) open.durationMs += t.durationMs || 0; return; }
      const o = Object.assign({}, t); out.push(o); open = o.durationMs ? null : o;
    });
    return out;
  }
  function tracklistLooksWrong(tracks) {                    // titles that are mostly numbers are ratings or counts read as titles: never offer such a list
    const t = Array.isArray(tracks) ? tracks : []; if (t.length < 2) return false;
    const bad = t.filter(x => /^\d{1,3}(?:[.,]\d{1,2})?[kKmM]?$/.test(String(x && x.title || '').trim())).length;
    return bad / t.length >= 0.5;
  }
  // RYM prints some of a release's songs in bold (its highlights). The page reader notes how heavy each title is drawn (w); a song is bold only when the
  // release has both kinds, so a page that draws every title heavy (or none) marks nothing.
  function markBold(list) {
    const heavy = (Array.isArray(list) ? list : []).map(t => (Number(t && t.w) || 0) >= 600), some = heavy.some(Boolean) && !heavy.every(Boolean);
    return (Array.isArray(list) ? list : []).map((t, i) => { const o = Object.assign({}, t); delete o.w; if (some && heavy[i]) o.bold = true; return o; });
  }
  // The same for releases on a list page (a discography, a chart): RYM prints some release titles in bold. Each sighting gets b: 1 (bold) or 0 (not)
  // only when the page has both kinds; otherwise it says nothing (no b), and what was known before stands.
  function boldMarks(list) {
    const L = Array.isArray(list) ? list : [], heavy = L.map(e => (Number(e && e.w) || 0) >= 600), mixed = heavy.some(Boolean) && !heavy.every(Boolean);
    return L.map((e, i) => { const o = Object.assign({}, e); delete o.w; if (mixed) o.b = heavy[i] ? 1 : 0; return o; });
  }
  function cleanTracks(list) {                              // untrusted tracks -> only text, whole milliseconds, ratings in range, at most 200
    return (Array.isArray(list) ? list : []).slice(0, 200).map(t => {
      const title = typeof (t && t.title) === 'string' ? t.title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''; if (!title) return null;
      const o = { title, durationMs: Math.max(0, Math.round(Number(t.durationMs) || 0)) };
      if (typeof t.section === 'string' && t.section.trim()) o.section = t.section.trim().slice(0, 40);
      if (typeof t.pos === 'string' && /^[A-Za-z0-9][A-Za-z0-9.\-]{0,7}$/.test(t.pos.trim())) o.pos = t.pos.trim();          // its position on the release ("A", "B2")
      if (t.bold === true) o.bold = true;          // one of the songs RYM shows in bold
      const r = Math.round(Number(t.rating) * 100) / 100; if (r > 0 && r <= 5) o.rating = r;
      const v = Math.round(Number(t.votes)); if (o.rating && v > 0 && v <= 1e9) o.votes = v;          // how many ratings that average is based on (only ever alongside a rating)
      if (typeof t.url === 'string' && /^https:\/\/(www\.)?rateyourmusic\.com\/song\/[^\s"'<>?#]+$/.test(t.url) && t.url.length <= 300) o.url = t.url;          // the song's RYM page
      return o;
    }).filter(Boolean);
  }
  // Compared by value, whatever order the keys come in: the browser's extension storage hands objects back with their keys sorted, so comparing them as text
  // saw a difference where there was none and rewrote the entry on every visit.
  function sameTracks(a, b) { const canon = (l) => JSON.stringify((Array.isArray(l) ? l : []).map(t => Object.keys(t || {}).sort().map(k => [k, t[k]]))); return canon(a) === canon(b); }
  // What is kept: { [release address]: { p, ar, ti, ty, u, t, tracks: [{ title, durationMs, section?, rating? }] } }. Only a different tracklist touches the stored copy.
  function cleanDetails(d) {                                  // { label, catalog, date, genre, cover }: text only, kept short; null when there is nothing
    if (!d || typeof d !== 'object') return null;
    const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n), cover = s(d.cover, 500);
    const o = { label: s(d.label, 200), catalog: s(d.catalog, 100), date: s(d.date, 10), genre: s(d.genre, 400), cover: /^https:\/\//i.test(cover) ? cover : '' };
    return Object.values(o).some(Boolean) ? o : null;
  }
  function mergeTracklist(existing, e, cap) {
    const out = Object.assign({}, existing || {}); let changed = false;
    const tracks = cleanTracks(e && e.tracks);
    if (e && e.p && tracks.length >= 2) {
      const prev = out[e.p];
      const d = cleanDetails(e.d) || (prev && prev.d) || null;                                    // the release's label, date, genres and cover as the page shows them (1.18.0)
      if (prev && sameTracks(prev.tracks, tracks)) { if ((!prev.ar && e.ar) || (!prev.u && e.u) || JSON.stringify(prev.d || null) !== JSON.stringify(d)) { out[e.p] = Object.assign({}, prev, { ar: prev.ar || e.ar, ti: prev.ti || e.ti, u: prev.u || e.u }, d ? { d } : {}); changed = true; } }
      else { out[e.p] = Object.assign({ p: e.p, ar: e.ar || (prev && prev.ar) || '', ti: e.ti || (prev && prev.ti) || '', ty: e.ty || (prev && prev.ty) || '', u: e.u || (prev && prev.u) || '', t: e.t || Date.now(), tracks }, d ? { d } : {}); changed = true; }
    }
    const keys = Object.keys(out), max = cap || 300;
    if (keys.length > max) { keys.sort((x, y) => (out[x].t || 0) - (out[y].t || 0)).slice(0, keys.length - max).forEach(k => delete out[k]); changed = true; }
    return { out, changed };
  }
  // ---- releases sent to CRATE ----
  // An outbox in this browser: nothing is sent until you press "Send to CRATE" on a RateYourMusic page, and what you send waits here until CRATE asks for it.
  const CRATE_TYPES = { album: 'Album', ep: 'EP', single: 'Single', comp: 'Compilation', mixtape: 'Mixtape', djmix: 'Mixtape', additional: 'Album', bootleg: 'Album', unauth: 'Album', unauthorized: 'Album' };
  function crateType(group) { return CRATE_TYPES[group] || ''; }                      // '' = not something CRATE keeps (a video, say)
  function titleCase(s) { return String(s == null ? '' : s).replace(/\b[a-z]/g, c => c.toUpperCase()); }
  const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function releaseDateFromText(text) {                       // "Released 4 January 1971", "Released: January 1971", "Released 1971" -> "1971-01-04" / "1971-01" / "1971"
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ');
    const at = t.search(/\bReleased(?![A-Za-z])/i); if (at < 0) return '';       // (a table cell can put the date right against the word: "Released4 January 1971")
    const m = /^Released\s*:?\s*(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(?:([A-Za-z]{3,9})\.?\s+)?((?:19|20)\d\d)(?!\d)/i.exec(t.slice(at));
    if (!m) return '';
    const mo = m[2] ? MONTHS[m[2].toLowerCase()] : 0, day = m[1] ? parseInt(m[1], 10) : 0;
    if (mo && day >= 1 && day <= 31) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}`;
    return m[3];
  }
  // The release's "Recorded" row: "June 1973 - August 1973 at Electric Lady Studios, New York City, NY, United States", "1969", "Abbey Road Studios, London, England"
  // -> { date: "1973-06" (when it began), place: "Electric Lady Studios, New York City, NY, United States" }. Either can be missing.
  function recordedFromText(text) {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').replace(/^\s*recorded\s*:?\s*/i, '').trim().slice(0, 400), mn = Object.keys(MONTHS).join('|');
    let date = ''; const m = new RegExp('(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+)?(?:(' + mn + ')\\.?\\s+)?((?:19|20)\\d\\d)(?![\\ds])', 'i').exec(t);
    if (m) { const mo = m[2] ? MONTHS[m[2].toLowerCase()] : 0, day = m[1] ? parseInt(m[1], 10) : 0; date = mo && day >= 1 && day <= 31 ? `${m[3]}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}` : mo ? `${m[3]}-${String(mo).padStart(2, '0')}` : m[3]; }
    let place = t.replace(new RegExp('(?:\\b(?:early|mid|late)-?\\s*)?(?:\\b(?:spring|summer|autumn|fall|winter)\\s+)?\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?(?:(?:' + mn + ')\\.?\\s+)?(?:19|20)\\d\\d(?:s)?(?!\\d)', 'gi'), ' ')          // the dates, whole ("late 1985", "autumn 1985" too)
      .replace(/(^|\s)[-\u2013\u2014~&\/](?=\s|$)/g, ' ').replace(/\s{2,}/g, ' ').trim();
    for (let i = 0; i < 3; i++) place = place.replace(/^(?:[,;:]\s*|(?:at|in|to|and|between|from|during|recorded)\s+)/i, '').replace(/\s*[,;:]\s*$|\s+(?:at|in|to|and)$/i, '').trim();
    place = place.replace(/\s+,/g, ',').replace(/,\s*,/g, ',');
    if (place.length < 2 || !/[A-Za-z]{2}/.test(place) || /^(?:unknown|various|n\/a)$/i.test(place)) place = '';
    return { date, place: place.slice(0, 200) };
  }
  // A release page's title reads "Title by Artist (Album, Genre, Genre): Reviews, Ratings, Credits, Song list - Rate Your Music" (older wording: "... by Artist - Reviews, ..."). The LAST " by "
  // splits title from artist ("Stand by Me by Ben E. King"); the bracket after the artist holds the release type and the primary genres.
  const RYM_TITLE_TAIL = /\s*[-\u2013\u2014|]\s*Rate Your Music\s*$/i;
  const RYM_PAGE_WORDS = /(?:\s*:\s*|\s[-\u2013\u2014|]\s*)Reviews,?\s*Ratings.*$/i;
  const REL_TYPES = /^(?:album|ep|single|compilation|mixtape|dj mix|live album|video|music video|bootleg|additional release|unauthorized)$/i;
  function parseReleaseDocTitle(text) {                      // -> { title, artist, kind, genres[] }
    let t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    t = t.replace(RYM_TITLE_TAIL, '');
    const had = RYM_PAGE_WORDS.test(t); t = t.replace(RYM_PAGE_WORDS, '').trim();
    let meta = null; const m = /\s*\(([^()]*)\)\s*$/.exec(t);
    if (m && (had || REL_TYPES.test(m[1].split(',')[0].trim()))) { meta = m[1]; t = t.slice(0, m.index); }       // a bracket is the type and genres only when the page's own wording followed it, or it starts with a type
    else { const cut = t.search(/\s[-\u2013\u2014|]\s/); if (cut > 0) t = t.slice(0, cut); }
    const i = t.lastIndexOf(' by '); if (i <= 0) return { title: '', artist: '', kind: '', genres: [] };
    const parts = meta ? meta.split(',').map(x => x.trim()).filter(Boolean) : [];
    const kind = parts.length && REL_TYPES.test(parts[0]) ? parts.shift() : '';
    return { title: t.slice(0, i).trim(), artist: t.slice(i + 4).trim(), kind, genres: parts };
  }
  function tidyName(s) {                                     // an artist or title that picked up the page's own wording: "Ulver (Album, Trip Hop): Reviews, Ratings, Credits, Song list" -> "Ulver"
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (!/Reviews,?\s*Ratings/i.test(t)) return t;
    return t.replace(RYM_TITLE_TAIL, '').replace(RYM_PAGE_WORDS, '').replace(/\s*\([^()]*\)\s*$/, '').trim() || t;
  }
  // ---- a release's cover image: the address of the picture RateYourMusic shows for it ----
  const NOT_A_COVER = /(?:^|[\/_.-])(?:blank|spacer|placeholder|pixel|loading|1x1|transparent|noimage|no_image|default)[\/_.-]|\.(?:svg|gif)(?:\?|$)/i;      // lazy-load stand-ins and icons
  function cleanCoverUrl(u) {                                // -> an https address of a picture, or ''
    const s = typeof u === 'string' ? u.trim() : ''; if (!s || s.length > 500 || /\s/.test(s)) return '';
    let url; try { url = new URL(s); } catch (e) { return ''; }
    if (url.protocol !== 'https:' || url.username || url.password || !/\./.test(url.hostname) || NOT_A_COVER.test(url.pathname)) return '';
    return url.href;
  }
  function pictureSize(u) { const m = /\/i\/(\d{2,4})\//.exec(String(u || '')); return m ? Number(m[1]) : 0; }       // e.snmc.io/i/300/s/...: the number in the address is the picture's size
  function biggestCover(urls) {                              // of several addresses for the same cover, the one that names the largest size (the first if none say)
    const list = (urls || []).map(cleanCoverUrl).filter(Boolean); let best = list[0] || '';
    list.forEach(u => { if (pictureSize(u) > pictureSize(best)) best = u; });
    return best;
  }
  // RYM offers one cover in several sizes and formats (e.snmc.io/i/75/w/<hash>/<id>/...webp, /i/150/s/<hash>/<id>/...jpeg): the <hash>/<id> part
  // names the picture. oneRymCover(urls) -> the biggest of them (a jpeg before a webp of the same size) when they are all the same picture, else ''.
  function rymPictureId(u) { const m = /\/(?:i|lk)\/\d{2,4}\/\w\/([0-9a-f]{16,})\/(\d+)\//i.exec(String(u || '')); return m ? m[1] + '/' + m[2] : ''; }
  function oneRymCover(urls) {
    const list = (urls || []).map(cleanCoverUrl).filter(Boolean); if (!list.length) return '';
    const ids = new Set(list.map(u => rymPictureId(u) || u)); if (ids.size !== 1) return '';
    const webp = (u) => /\.webp(?:\?|$)/i.test(u) ? 1 : 0;
    return list.slice().sort((a, b) => (pictureSize(b) - pictureSize(a)) || (webp(a) - webp(b)))[0];
  }
  function bestImageUrl(c, base) {                           // an <img>'s candidate addresses -> the best usable one: what it is showing, its lazy-load address, the biggest of its srcset
    if (!c || typeof c !== 'object') return '';
    const last = (set) => { const parts = String(set || '').split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean); return parts.length ? parts[parts.length - 1] : ''; };
    const list = [last(c.srcset), last(c.dataSrcset), c.currentSrc, c.src, c.dataSrc, c.dataOriginal, c.dataLazy];       // the biggest size on offer first (a list shows thumbnails), then what it is showing, then its lazy-load addresses
    for (const x of list) { if (!x || typeof x !== 'string' || /^data:/i.test(x)) continue; let abs; try { abs = new URL(x, base || 'https://rateyourmusic.com/').href; } catch (e) { continue; } const ok = cleanCoverUrl(abs); if (ok) return ok; }
    return '';
  }
  function rowToRelease(row, ctx) {                          // a row read off a list page { href, artist, title, year, type, genres[] } -> what CRATE can add, or null
    const p = rymPath(row && row.href); if (!p) return null;
    const type = crateType((row.type && typeGroup(row.type)) || rymType(p)); if (!type) return null;
    const names = rymNames(p), genres = (row.genres && row.genres.length ? row.genres : (ctx && ctx.genre ? [ctx.genre] : [])).filter(Boolean);
    return { artist: String(row.artist || '').trim() || titleCase(names.ar), title: String(row.title || '').trim() || titleCase(names.ti), type, releaseDate: /^\d{4}$/.test(String(row.year || '')) ? String(row.year) : '', genre: genreJoin(genres), secondaryGenre: '', rymLink: 'https://rateyourmusic.com' + p + '/', cover: cleanCoverUrl(row.cover) };
  }
  // A release page lists its genres in two groups (primary and secondary) and either can run to a dozen or more. Until 1.12.3 both were cut to the first FOUR, and the cleaner below cut the text at 200
  // characters, so a longer list lost its tail (and a name could be sliced in half). Now the lists are kept whole: trimmed, each name once (case aside), at most MAX_GENRES of them, no name cut short.
  const MAX_GENRES = 30;
  function genreJoin(list) {                                 // ["A", " b ", "A"] -> "A, b"
    const seen = new Set(), out = [];
    (Array.isArray(list) ? list : []).forEach(g => { const t = typeof g === 'string' ? g.replace(/\s+/g, ' ').trim().slice(0, 80) : '', k = t.toLowerCase(); if (/\bscene$/i.test(t)) return;          // a scene ("Laurel Canyon Scene") is not a genre
      if (t && !seen.has(k) && out.length < MAX_GENRES) { seen.add(k); out.push(t); } });
    return out.join(', ');
  }
  const genreClean = (v) => genreJoin(typeof v === 'string' ? v.split(',') : []);       // the same for a list already joined with commas
  function cleanRelease(r) {                                 // untrusted -> only text, a valid date, a RateYourMusic address, a bounded tracklist
    if (!r || typeof r !== 'object') return null;
    const s = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
    const artist = tidyName(s(r.artist, 200)), title = tidyName(s(r.title, 200)); if (!artist || !title) return null;
    const p = rymPath(typeof r.rymLink === 'string' ? r.rymLink : ''), type = Object.values(CRATE_TYPES).includes(r.type) ? r.type : 'Album';
    const o = { label: s(r.label, 200), catalog: s(r.catalog, 100), descriptor: s(r.descriptor, 500), artist, title, type, releaseDate: /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(r.releaseDate) ? r.releaseDate : '', genre: genreClean(r.genre), secondaryGenre: genreClean(r.secondaryGenre), rymLink: p ? 'https://rateyourmusic.com' + p + '/' : '', cover: cleanCoverUrl(r.cover) };
    const tr = cleanTracks(r.tracks); if (tr.length >= 2) o.tracks = tr;
    const sc = s(r.scene, 300), mv = s(r.movement, 300), rp = s(r.recordedPlace, 200); if (sc) o.scene = sc; if (mv) o.movement = mv; if (rp) o.recordedPlace = rp;          // (kept here, or they never reach CRATE)
    if (/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(r.recordedDate)) o.recordedDate = r.recordedDate;
    const rr = Math.round(Number(r.rymRating) * 100) / 100; if (rr >= 0.5 && rr <= 5) { o.rymRating = rr; const rv = Math.round(Number(r.rymVotes)); if (rv > 0 && rv < 1e8) o.rymVotes = rv; }       // the page's average rating, when an update carries it
    return o;
  }
  function cleanBatch(b) {
    if (!b || typeof b !== 'object') return null;
    const s = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
    const seen = new Set(), releases = [];
    (Array.isArray(b.releases) ? b.releases : []).slice(0, 600).forEach(r => { const c = cleanRelease(r); if (!c) return; const k = c.rymLink || (slug(c.artist) + '|' + slug(c.title)); if (seen.has(k)) return; seen.add(k); releases.push(c); });
    if (!releases.length || releases.length > 300) { if (!releases.length) return null; releases.length = 300; }
    const src = b.source && typeof b.source === 'object' ? b.source : {};
    let url = ''; try { const u = new URL(String(src.url || '')); if (/^https:$/.test(u.protocol) && /(^|\.)rateyourmusic\.com$/.test(u.hostname)) url = 'https://rateyourmusic.com' + u.pathname.replace(/\/+$/, '').toLowerCase(); } catch (e) { /* no address */ }       // one form per page: no www, no trailing slash, so sending a page again replaces its earlier batch
    return { id: s(b.id, 40) || ('b' + Date.now()), t: Number(b.t) || Date.now(), kind: b.kind === 'release' ? 'release' : b.kind === 'update' ? 'update' : 'list', source: { url, title: s(src.title, 200) }, genre: s(b.genre, 100), releases };
  }
  function addBatch(outbox, batch, cap) {                    // newest first; sending the same page again REPLACES its earlier batch instead of piling up
    const b = cleanBatch(batch); if (!b) return { out: Array.isArray(outbox) ? outbox : [], changed: false };
    const rest = (Array.isArray(outbox) ? outbox : []).filter(x => x && !(b.source.url && x.source && x.source.url === b.source.url) && x.id !== b.id);
    return { out: [b].concat(rest).slice(0, cap || 60), changed: true };
  }
  function removeBatches(outbox, ids) { const gone = new Set(Array.isArray(ids) ? ids : []); const out = (Array.isArray(outbox) ? outbox : []).filter(x => x && !gone.has(x.id)); return { out, changed: out.length !== (Array.isArray(outbox) ? outbox.length : 0) }; }
  // The exact figures RYM keeps behind a rounded "4.6 | 5k": its hover text says "4.56 from 4,733 ratings". -> { a, n } or null.
  const EXACT_RE = /(?<![\d.])([0-4]\.\d{2}|5\.00)\s*(?:\/\s*5(?:\.0+)?\s*)?from\s+(\d{1,3}(?:[,.\u202f\u00a0 ]\d{3})+|\d+)\s+ratings?\b/i;
  function exactFromText(text) {
    const m = EXACT_RE.exec(String(text == null ? '' : text)); if (!m) return null;
    const a = Number(m[1]), n = parseInt(m[2].replace(/\D/g, ''), 10);
    return a > 0 && a <= 5 ? { a, n: n > 0 ? n : 0 } : null;
  }
  // Where a page keeps that text: an attribute of the element or one inside it (title, aria-label, data-tooltip, data-tippy-content… any), or text
  // inside it that isn't shown until you hover. The first found wins; at most `limit` elements are looked at.
  function exactIn(el, limit) {
    if (!el || !el.querySelectorAll) return null;
    const els = [el, ...el.querySelectorAll('*')].slice(0, limit || 300);
    for (const e of els) { for (const at of e.attributes || []) { if (at.value && at.value.length < 400 && /from/i.test(at.value)) { const r = exactFromText(at.value); if (r) return r; } } }
    return exactFromText(el.textContent || '') || exactFromTip(el);
  }
  // RYM's tooltip plugin (tipTip) takes the title off each .has_tip element when the page loads and keeps it inside its own script, so it is
  // nowhere in the page; content-tips.js copies it first, but not if the add-on was loaded after the page or the title went too early.
  // This asks the plugin for it instead: a pretend mouse-over makes it write that element's text into #tiptip_content, read at once,
  // and a pretend mouse-out right after cancels the tooltip before its delay is up, so nothing shows on screen.
  function exactFromTip(el) {
    if (typeof document === 'undefined' || typeof MouseEvent === 'undefined') return null;
    const tip = el.matches && el.matches('.has_tip') ? el : el.querySelector && el.querySelector('.has_tip');
    if (!tip) return null;
    const box = () => document.getElementById('tiptip_content');
    if (box()) box().textContent = '';                                                  // so an old tooltip's text can't be read as this one's
    const out = document.body || document.documentElement;
    tip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: out }));  // jQuery's mouseenter is built on mouseover from outside
    let text = box() ? box().textContent : '';
    if (!exactFromText(text)) { tip.dispatchEvent(new MouseEvent('mouseenter', { relatedTarget: out })); text = box() ? box().textContent : ''; }          // a plugin listening for the real mouseenter
    tip.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: out }));
    tip.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: out }));
    exactFromTip.last = { box: !!box(), text: String(text).slice(0, 80) };            // for the popup's Diagnose
    const r = exactFromText(text);
    if (r) tip.setAttribute('data-crate-tip', text.trim());                             // kept, so a second read doesn't ask again
    return r;
  }
  // ---- which pages of a genre or chart you have checked (rymPages in storage) ----
  // A list is a genre ("/genre/indie-rock/") or a chart ("/charts/top/album/all-time/g:indie-rock/"); RYM puts its page number last ("/genre/indie-rock/3/").
  // Only 1 to 3 digits count as a page, so a chart's year ("/charts/top/album/1986/") stays part of the list.
  function listPage(path) {
    const p = String(path == null ? '' : path).toLowerCase().replace(/[?#].*$/, '').replace(/\/?$/, '/');
    let m = /^(\/genre\/[^\/]+\/)(?:(\d{1,3})\/)?$/.exec(p), kind = 'genre';
    if (!m) { m = /^(\/charts\/.+?\/)(?:(\d{1,3})\/)?$/.exec(p); kind = 'chart'; }
    if (!m) return null;
    return { key: m[1], page: Math.max(1, Number(m[2]) || 1), kind };
  }
  function listPageUrl(key, page) { return 'https://rateyourmusic.com' + key + (page > 1 ? page + '/' : ''); }
  // e: { key, page, kind, label, owned, edition, total, t }. A page is done when you say so, when you sent it to CRATE, or when you have every release on it
  // (h says which: 'you', 'sent', 'all'; 'no' is a page you said isn't done, which having everything on it doesn't change).
  function recordPage(store, e, cap) {
    const out = Object.assign({}, store || {}), now = e.t || Date.now(), prev = out[e.key], L = prev ? Object.assign({}, prev, { pages: Object.assign({}, prev.pages) }) : { k: e.key, kind: e.kind, label: '', pages: {} };
    const was = L.pages[e.page], pg = Object.assign({ f: now, d: 0, h: '' }, was || {});
    const counted = e.owned != null && e.total > 0;
    if (counted) { pg.o = e.owned; pg.e = e.edition || 0; pg.n = e.total; if (!pg.d && pg.h !== 'no' && e.owned + (e.edition || 0) >= e.total) { pg.d = 1; pg.h = 'all'; } }
    const same = was && was.o === pg.o && was.e === pg.e && was.n === pg.n && was.d === pg.d && (L.label || !e.label) && now - (was.s || 0) < 600000;
    if (same) return { out: store, changed: false };
    pg.s = now; L.pages[e.page] = pg; if (e.label) L.label = e.label; L.s = now; out[e.key] = L;
    const keys = Object.keys(out); if (keys.length > (cap || 300)) keys.sort((a, b) => (out[a].s || 0) - (out[b].s || 0)).slice(0, keys.length - (cap || 300)).forEach(k => delete out[k]);          // the lists you haven't opened for longest go first
    return { out, changed: true };
  }
  function markPage(store, key, page, done, how) {
    const L = store && store[key]; if (!L) return { out: store, changed: false };
    const pg = Object.assign({ f: Date.now(), s: Date.now() }, L.pages[page] || {}, { d: done ? 1 : 0, h: done ? (how || 'you') : 'no' });
    return { out: Object.assign({}, store, { [key]: Object.assign({}, L, { pages: Object.assign({}, L.pages, { [page]: pg }), s: Date.now() }) }), changed: true };
  }
  function pageRanges(nums) {                                 // [1,2,3,5,8,9] -> "1–3, 5, 8–9"
    const n = [...new Set(nums.map(Number))].filter(x => x > 0).sort((a, b) => a - b), out = [];
    for (let i = 0; i < n.length; i++) { let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; out.push(j > i ? `${n[i]}–${n[j]}` : String(n[i])); i = j; }
    return out.join(', ');
  }
  function listProgress(L) {                                  // { checked, done, open (opened, not done), next (the first page not done) }
    const pages = (L && L.pages) || {}, nums = Object.keys(pages).map(Number).filter(x => x > 0).sort((a, b) => a - b);
    const done = nums.filter(x => pages[x].d), open = nums.filter(x => !pages[x].d);
    let next = 1; while (pages[next] && pages[next].d) next++;
    return { checked: nums, done, open, next };
  }
  // (1.22.0) A page's credits ("Credits" on a release page, the credits on a song page): each person with their roles, and the tracks a role
  // is on when the page says ("1-3, 5", "A1, B2"). Read from the credit list's own parts where they are there (the person's link, each role
  // and its tracks), else from its text ("Name - guitar, vocals [1, 3]"). Text only, bounded.
  function readCredits(doc) {
    const t = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim(), out = [], seen = new Set();
    const lists = doc.querySelectorAll('ul.credits, [id^="credits" i] ul, .section_credits ul, [class*="credits" i] ul');
    const TRK = /^(.*?)\s*\[?\s*((?:[A-Z]?\d+[a-z]?|[A-Z])(?:\s*[-–,&]\s*(?:[A-Z]?\d+[a-z]?|[A-Z]))*)\s*\]?$/;
    lists.forEach(ul => ul.querySelectorAll(':scope > li').forEach(li => {
      if (seen.has(li) || out.length >= 200) return; seen.add(li);
      const a = li.querySelector('a[href*="/artist/"], a.artist, .credit_artist, span.artist');
      let name = a ? t(a) : '';
      const roles = [];
      li.querySelectorAll('.role_name, [class*="role_name" i]').forEach(r => {
        const tr = r.querySelector('.role_tracks, [class*="role_tracks" i]'), tracks = tr ? t(tr) : '';
        let role = t(r); if (tracks) role = role.replace(tracks, ''); role = role.replace(/[\s,;:\-–]+$/, '').trim();
        if (role) roles.push({ role: role.slice(0, 80), tracks: tracks.replace(/[^\w,\-–& ]/g, '').trim().slice(0, 60) });
      });
      if (!roles.length) {
        let rest = t(li); if (!name) name = rest.split(/\s[-–—:]\s/)[0];
        if (name && rest.startsWith(name)) rest = rest.slice(name.length);
        rest = rest.replace(/^\s*[-–—:]\s*/, '');
        rest.split(/\s*[,;]\s*(?![\d\-–])/).filter(Boolean).forEach(r => { const m = TRK.exec(r); roles.push(m && m[1] && /\d/.test(m[2]) ? { role: m[1].slice(0, 80), tracks: m[2].slice(0, 60) } : { role: r.slice(0, 80), tracks: '' }); });
        const last = roles[roles.length - 1]; if (last && last.tracks && roles.slice(0, -1).every(r => !r.tracks)) roles.forEach(r => { r.tracks = last.tracks; });          // "drums, percussion [1-5]": the tracks are for all of them
      }
      if (!name || name.length > 120 || /^(show|hide)\b/i.test(name) || !roles.length) return;
      out.push({ name: name.slice(0, 120), roles: roles.slice(0, 20) });
    }));
    return out;
  }
  function mergeSong(store, e, cap) {                         // (1.22.0) a song page's details, newest kept; unchanged ones aren't rewritten
    const out = Object.assign({}, store || {}), prev = out[e.p];
    const sig = (x) => JSON.stringify([x.ar, x.ti, x.a, x.n, x.pri, x.sec, x.desc, x.credits, x.rels]);
    if (prev && sig(prev) === sig(e)) return { out: store, changed: false };
    out[e.p] = e;
    const keys = Object.keys(out); if (keys.length > (cap || 3000)) keys.sort((a, b) => (out[a].t || 0) - (out[b].t || 0)).slice(0, keys.length - (cap || 3000)).forEach(k => delete out[k]);
    return { out, changed: true };
  }
  const api = { readCredits, mergeSong, splitNameList, artistFromFields, mergeArtist, listPage, listPageUrl, recordPage, markPage, pageRanges, listProgress, oneRymCover, rymPictureId, MAX_GENRES, countFrom, exactFromText, exactIn, exactFromTip, genreJoin, genreClean, overallRank, tlIsNoise, pictureSize, biggestCover, tidyName, tracklistLooksWrong, tracksFromRow, foldSubTracks, markBold, boldMarks, isExtraTitle, isExtrasHeader, cleanCoverUrl, bestImageUrl, crateType, titleCase, releaseDateFromText, recordedFromText, parseReleaseDocTitle, rowToRelease, cleanRelease, cleanBatch, addBatch, removeBatches, trackFromLeaves, cleanTracks, mergeTracklist, tlParseText, tlParseTime, tlIsHeader, tlFormatTime, genreSlugFromPath, genreNameFromSlug, cleanGenreText, mergeGenre, key, slug, typeGroup, rymType, typeFromText, rymPath, compact, fromCrateItems, fromExportJson, yearFromText, makeMatcher, year, ratingFromLeaves, ratingFromTexts, rymNames, mergeRatings, histRecord: rymHistRecord, histMerge: rymHistMerge, histNorm: rymHistNorm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CrateRym = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
