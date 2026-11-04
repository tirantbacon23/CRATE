// CRATE — sharing the crate with the add-on, MusicBrainz history, genre data, genre page.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Share the crate with the browser add-on ----------
   The "CRATE for RateYourMusic" browser add-on flags releases on RYM artist pages that you already have. It can only learn what you
   have from CRATE itself, so CRATE offers it a compact list — artist, title, type (album/EP/single…), release date, descriptor, catalogue number and RYM link,
   and nothing else (no ratings, reviews or listening history) — by posting a message to ITS OWN window, addressed to this page's own
   origin; only an add-on you installed and connected to this address can receive it. It's sent after the library loads or changes,
   and whenever the add-on asks. ⚙ → "Share my crate with the RYM add-on" turns it off (the add-on is then told sharing is off). */
let addonLastRaw = null;
function addonItems() { return state.raw.map(it => ({ artist: it.artist, title: it.title, type: it.type === 'Unknown' ? '' : it.type, releaseDate: it.releaseDate, descriptor: it.descriptor, catalog: it.catalog, rymLink: it.rymLink })); }
function addonPublish() {
  try {
    if (!state.shareWithAddon) { window.postMessage({ source: 'crate-app', type: 'disabled' }, window.location.origin); return; }
    window.postMessage({ source: 'crate-app', type: 'index', version: 1, appVersion: APP_VERSION, items: addonItems() }, window.location.origin);
  } catch (e) { /* best effort: it only matters when an add-on is listening */ }
}
// An EMPTY list is shared too, but only once the library has really loaded (catalogFetchedAt): you deleted the last release, so the add-on must stop saying you own it;
// a load that hasn't finished or has failed must not wipe what the add-on holds.
function addonPublishIfChanged() { if (state.raw && (state.raw.length || state.catalogFetchedAt) && state.raw !== addonLastRaw) { addonLastRaw = state.raw; addonPublish(); if (!rymOutState.asked) { rymOutState.asked = true; rymCheckOutbox(); } } }
function initAddonBridge() {
  document.documentElement.setAttribute('data-crate-bridge', APP_VERSION);      // lets the add-on tell a CRATE that supports it from an older one (or from some other page) when nothing arrives
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;          // only this page itself, never another frame or site
    const d = e.data;
    if (d && d.source === 'crate-addon' && d.type === 'request-index') { addonPublish(); rymCheckOutbox(); }       // the add-on is here: see whether anything was sent from Rate Your Music
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && rymOutState.present) rymCheckOutbox(); });
  window.addEventListener('focus', () => { if (rymOutState.present) rymCheckOutbox(); });                         // CRATE in its own window: coming back to it counts too
  setInterval(() => { if (!document.hidden && rymOutState.present) rymCheckOutbox(); }, 20000);                   // and a quiet look now and then while it is open
  [['rymUpdClose', rymUpdateClose], ['rymUpdCancel', rymUpdateClose], ['rymUpdApply', () => rymApplyUpdate()]].forEach(([id, fn]) => { const x = document.getElementById(id); if (x) x.addEventListener('click', fn); });
  const bgBar = document.getElementById('bgStatus');
  initJobs();
  if (bgBar) bgBar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) { if (e.target.closest('#bgStatusText')) jobsOpen(); return; }          // the text: everything that is going on (Processing)
    if (b.id === 'bgStatusCancel' && rymFetchState.active) rymFetchCancel();
    else if (b.id === 'bgStatusCancel' && cxImp) cxImp.cancel = true;
    else if (b.id === 'bgStatusView') { if (state.rymQueueMode && rymQ.entries.length && !(typeof cxImp !== 'undefined' && cxImp)) rymQOpen(); else { const ov = document.getElementById('cxImportOverlay'); if (ov) ov.hidden = false; } bgStatusHide(); }
    else if (b.id === 'bgStatusClose') bgStatusHide();
  });
  const inbox = document.getElementById('rymInbox');
  if (inbox) inbox.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-rym-review')) openRymBatch(rymOutState.batches[0]);
    else if (b.hasAttribute('data-rym-applyall')) rymUpdateAllWaiting();
    else if (b.hasAttribute('data-rym-later')) { rymOutState.dismissed = rymOutState.batches.map(x => x.id).join(','); renderRymInbox(); }
    else if (b.hasAttribute('data-rym-discard')) rymBatchDone(rymOutState.batches.map(x => x.id));
  });
  const btn = document.getElementById('menuShareAddon');
  if (!btn) return;
  btn.setAttribute('aria-pressed', state.shareWithAddon ? 'true' : 'false');
  btn.addEventListener('click', () => {
    state.shareWithAddon = !state.shareWithAddon; savePrefs(); btn.setAttribute('aria-pressed', state.shareWithAddon ? 'true' : 'false');
    el.layoutMenu.hidden = true; flashGlobalToast(`Sharing your crate with the RYM add-on: ${state.shareWithAddon ? 'on' : 'off'}.`);
    addonPublish();
  });
}

// BEGIN mb-hist
// ---- MusicBrainz release counts by year: the plan (pure — the request itself is injected, so this can be tested) ----
// MusicBrainz can't list "releases per year" in one go, but a search reports its total (count) for any query, and a
// query can carry a date prefix: tag:"x" AND firstreleasedate:197* is the decade, ...:1972* the year. (A trailing *
// is used rather than an exact date because it matches however the field is indexed — whole date or its parts.)
// So the histogram is asked for in two passes, as cheaply as the numbers allow:
//   1. every decade from 1900 to the current one (13 requests);
//   2. the years inside each decade that has anything — stopping a decade as soon as its years add up to its total
//      (the rest are 0), and working out a full decade's LAST year by subtraction instead of asking.
// Everything is written into one shared "known" object ({decades, years, requests}) as it goes, so a run that is
// cancelled or fails can be resumed later and repeats no request. Releases dated before 1900, with no date, or in a
// future year of the current decade are in the tag's total but not in the chart.
function genreMbPhrase(label) { return String(label).toLowerCase().replace(/[\\"]/g, '\\$&'); }   // inside a quoted Lucene phrase only " and \ are special
// HOW MusicBrainz wants a date written in a search isn't something this page can see, and it was guessed wrong once (a
// trailing wildcard, "firstreleasedate:197*", which the real service didn't answer usefully). So several ways are known, the
// first that works is found by asking (see mbPickDateSyntax) and remembered, and if none works the page shows what
// MusicBrainz said instead of guessing again. Each way can ask for a decade and for a year.
const MB_DATE_SYNTAXES = [
  { id: 'prefix', label: 'date starts with', year: y => `firstreleasedate:${y}*`, decade: d => `firstreleasedate:${String(d).slice(0, 3)}*` },
  { id: 'range-year', label: 'range of years', year: y => `firstreleasedate:[${y} TO ${y}]`, decade: d => `firstreleasedate:[${d} TO ${d + 9}]` },
  { id: 'range-date', label: 'range of dates', year: y => `firstreleasedate:[${y}-01-01 TO ${y}-12-31]`, decade: d => `firstreleasedate:[${d}-01-01 TO ${d + 9}-12-31]` },
  { id: 'range-time', label: 'range of timestamps', year: y => `firstreleasedate:[${y}-01-01T00:00:00Z TO ${y}-12-31T23:59:59Z]`, decade: d => `firstreleasedate:[${d}-01-01T00:00:00Z TO ${d + 9}-12-31T23:59:59Z]` }
];
const MB_PROBE_MIN = 3000;      // a single year of the 1990s has far more release groups than this on MusicBrainz, whatever the genre
function genreMbQuery(label, datePrefix, syntax) {      // datePrefix: '197' = a decade, '1972' = a year; syntax defaults to the first known way
  const syn = syntax || MB_DATE_SYNTAXES[0], p = datePrefix ? String(datePrefix) : '';
  return 'tag:"' + genreMbPhrase(label) + '"' + (p ? ' AND ' + (p.length === 3 ? syn.decade(Number(p) * 10) : syn.year(Number(p))) : '');
}
// Finds the first way of writing a date that MusicBrainz answers sensibly. The test has no genre in it: two different years of
// the 1990s, asked about on their own, must each come back with thousands of release groups. `ask(query)` returns
// {ok, count} or {ok:false, status, body}. Every attempt is recorded (what was asked, what came back) for the page to show.
async function mbPickDateSyntax(ask) {
  const tried = [];
  for (const syn of MB_DATE_SYNTAXES) {
    const q1 = syn.year(1990), q2 = syn.year(1995);
    const a = await ask(q1), b = a.ok ? await ask(q2) : null;
    tried.push({ id: syn.id, q: q1, status: a.ok ? 200 : a.status, count: a.ok ? a.count : null, count2: b && b.ok ? b.count : null, body: a.ok ? '' : String(a.body || '') });
    if (a.ok && b && b.ok && a.count >= MB_PROBE_MIN && b.count >= MB_PROBE_MIN) return { syntax: syn, tried };
  }
  return { syntax: null, tried, networkDown: tried.length > 0 && tried.every(t => t.status === 0), busy: tried.some(t => t.status === 503) };
}
async function buildMbYearHistogram(countFor, opts) {
  const known = opts.known, nowYear = opts.nowYear, stop = opts.shouldStop || (() => false), step = opts.onStep || (() => {});
  known.decades = known.decades || {}; known.years = known.years || {}; known.requests = known.requests || 0;
  const ask = async (prefix) => { const n = await countFor(prefix); known.requests++; return n; };
  const lastDecade = Math.floor(nowYear / 10) * 10;
  for (let d = 1900; d <= lastDecade; d += 10) {
    if (stop()) return false;
    if (known.decades[d] === undefined) { known.decades[d] = await ask(String(d / 10)); step(); }
  }
  for (let d = 1900; d <= lastDecade; d += 10) {
    const want = known.decades[d], yLast = Math.min(d + 9, nowYear);
    if (!want) { for (let y = d; y <= yLast; y++) if (known.years[y] === undefined) known.years[y] = 0; continue; }
    let have = 0;
    for (let y = d; y <= yLast; y++) if (known.years[y] !== undefined) have += known.years[y];
    for (let y = d; y <= yLast; y++) {
      if (known.years[y] !== undefined) continue;
      if (have >= want) { known.years[y] = 0; continue; }                        // the decade's total is already accounted for
      if (y === d + 9) { known.years[y] = want - have; have = want; continue; }   // the last year of a full decade is whatever is left
      if (stop()) return false;
      known.years[y] = await ask(String(y)); have += known.years[y]; step();
    }
  }
  return true;
}
// ---- MusicBrainz answers HTTP 503 when it is busy. Rather than stop and wait for a Retry press, wait a little and ask again ----
// The wait doubles each time (2 s, 4 s, 8 s … never more than 30 s), or follows MusicBrainz's own Retry-After if it sends one.
// It gives up after MB_503_MAX tries in a row for one request (about five minutes) so a service that is really down can't keep
// this going for ever; the run is then left stopped with its Retry button, and resumes from where it was. Cancel (or closing the
// genre's tab) ends a wait within a quarter of a second.
let mb503BaseMs = 2000;              // a `let` so a test can shorten the waits
const MB_503_CAP_MS = 30000, MB_503_MAX = 15, MB_503_RETRY_AFTER_CAP_MS = 60000;
function mbRetryAfterMs(res) { try { const v = res && res.headers && res.headers.get ? res.headers.get('Retry-After') : null, n = v == null || v === '' ? NaN : Number(v); return isFinite(n) && n > 0 ? Math.round(n * 1000) : 0; } catch (e) { return 0; } }
function mbBackoffMs(attempt, retryAfterMs) { return retryAfterMs > 0 ? Math.min(retryAfterMs, MB_503_RETRY_AFTER_CAP_MS) : Math.min(MB_503_CAP_MS, mb503BaseMs * Math.pow(2, attempt - 1)); }
function mbStoppedError() { const e = new Error('stopped'); e.mbStopped = true; return e; }
// run() makes the request and returns a response (anything with .status). Returns the first response that is not a 503 — or the last
// 503 once it has given up. hooks: { shouldStop(), onWait({attempt, max, ms}), onResume(), maxAttempts, sleep(ms) }
async function mbRetry503(run, hooks) {
  const h = hooks || {}, max = h.maxAttempts == null ? MB_503_MAX : h.maxAttempts, sleep = h.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const stopped = () => !!(h.shouldStop && h.shouldStop());
  for (let attempt = 0; ; attempt++) {
    const res = await run();
    if (attempt > 0 && h.onResume) h.onResume(res);
    if (!res || res.status !== 503) return res;
    if (attempt >= max) return res;
    if (stopped()) throw mbStoppedError();
    const ms = mbBackoffMs(attempt + 1, mbRetryAfterMs(res));
    if (h.onWait) h.onWait({ attempt: attempt + 1, max, ms });
    for (let left = ms; left > 0;) { const slice = Math.min(250, left); await sleep(slice); left -= slice; if (stopped()) throw mbStoppedError(); }
  }
}
// END mb-hist

// BEGIN genre-data
// ---- Genre page: the numbers (pure functions of the library + the taxonomy, so they can be tested on their own) ----
// A release belongs to a genre if ANY of its genres (primary, secondary…) is that genre — or, with includeSub, is
// anywhere under it in the taxonomy (the same rule the left panel's genre filter uses).
function genreReleaseMatches(r, genre, includeSub, taxonomy) {
  const key = genreTaxonomyKey(genre);
  return getGenreList(combinedGenreStr(r)).some(g => genreTaxonomyKey(g) === key || (includeSub && genreMatchesFilter(taxonomy, g, genre)));
}
function genreReleasesOf(genre, includeSub) {
  return state.raw.filter(r => genreReleaseMatches(r, genre, includeSub, state.genreTaxonomy));
}
function genreYear(r) {
  const ms = dateVal(r.releaseDate);
  return ms === -Infinity ? null : new Date(ms).getUTCFullYear();
}
function genreYearCounts(items) {
  const m = new Map();
  items.forEach(r => { const y = genreYear(r); if (y !== null) m.set(y, (m.get(y) || 0) + 1); });
  return m;
}
// The "Years active" chart: one column per year from the first to the last year with a release (padded to at least
// ten so a handful of releases isn't one fat bar). Heights are each series' share of ITS OWN busiest year, so two genres
// of very different size can still be compared by shape.
function genreChartModel(counts, compareCounts) {
  const years = [...counts.keys(), ...(compareCounts ? [...compareCounts.keys()] : [])];
  if (!years.length) return null;
  const dataLo = Math.min(...counts.size ? [...counts.keys()] : years), dataHi = Math.max(...counts.size ? [...counts.keys()] : years);
  const cYears = compareCounts ? [...compareCounts.keys()] : [];
  const dataLoC = cYears.length ? Math.min(...cYears) : null, dataHiC = cYears.length ? Math.max(...cYears) : null;   // the second series' own span
  let lo = Math.min(...years), hi = Math.max(...years);
  if (hi - lo < 9) { const pad = Math.ceil((9 - (hi - lo)) / 2); lo -= pad; hi += pad; }
  const maxN = Math.max(1, ...counts.values()), maxC = compareCounts && compareCounts.size ? Math.max(...compareCounts.values()) : 0;
  const bars = []; let peakYear = null, peakYearC = null;
  for (let y = lo; y <= hi; y++) {
    const n = counts.get(y) || 0, c = compareCounts ? (compareCounts.get(y) || 0) : 0;
    bars.push({ year: y, n, c, h: n / maxN, ch: maxC ? c / maxC : 0 });
    if (peakYear === null && counts.size && n === maxN) peakYear = y;
    if (peakYearC === null && maxC && c === maxC) peakYearC = y;
  }
  return { lo, hi, dataLo, dataHi, dataLoC, dataHiC, bars, peakYear, peakYearC, maxN, maxC };
}
function genrePlayMap() {      // normalised "artist|album" -> plays (diary entries + Last.fm scrobbles)
  const m = new Map();
  state.diary.forEach(d => { const k = lastfmNormKey(d.artist, d.title); m.set(k, (m.get(k) || 0) + 1); });
  state.scrobbles.forEach(s => { const k = lastfmNormKey(s.artist, s.title); m.set(k, (m.get(k) || 0) + (s.playCount || 1)); });
  return m;
}
function genreStatsOf(items) {
  const plays = genrePlayMap(), logged = new Set(state.diary.map(d => lastfmNormKey(d.artist, d.title)));
  const rated = items.filter(r => Number(r.rating) > 0);
  const decades = new Map();
  items.forEach(r => { const y = genreYear(r); if (y !== null) { const d = Math.floor(y / 10) * 10; decades.set(d, (decades.get(d) || 0) + 1); } });
  let topDecade = null, best = 0;
  [...decades.entries()].sort((a, b) => a[0] - b[0]).forEach(([d, n]) => { if (n > best) { best = n; topDecade = d; } });   // ties: the earlier decade
  return {
    releases: items.length,
    artists: new Set(items.map(r => r.artist)).size,
    avgRating: rated.length ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : null,
    plays: items.reduce((s, r) => s + (plays.get(lastfmNormKey(r.artist, r.title)) || 0), 0),
    listened: items.filter(r => logged.has(lastfmNormKey(r.artist, r.title))).length,
    topDecade
  };
}
// Parents, direct sub-genres (with how many of YOUR releases sit under each) and the genres most often tagged
// alongside this one. "Alongside" leaves out the genre's own ancestors/descendants — Rock beside Progressive Rock
// says nothing.
function genreFamilyOf(genre, items, taxonomy, allItems) {
  const key = genreTaxonomyKey(genre);
  const parents = getGenreParents(taxonomy, genre);
  const children = genreLabelsWithRuleParents(taxonomy).filter(l => getGenreParents(taxonomy, l).some(p => genreTaxonomyKey(p) === key))          // (getGenreParents: the taxonomy's parents, and Scenes / Movements for scene and movement genres)
    .map(l => ({ label: l, count: allItems.filter(r => genreReleaseMatches(r, l, true, taxonomy)).length })).filter(c => c.count || taxonomy[genreTaxonomyKey(c.label)])
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const related = new Map();
  items.forEach(r => new Set(getGenreList(combinedGenreStr(r)).filter(g => genreTaxonomyKey(g) !== key && !genreMatchesFilter(taxonomy, g, genre) && !genreMatchesFilter(taxonomy, genre, g)).map(genreTaxonomyKey)).forEach(k => {
    const label = getGenreList(combinedGenreStr(r)).find(g => genreTaxonomyKey(g) === k);
    const cur = related.get(k) || { label, count: 0 }; cur.count++; related.set(k, cur);
  }));
  const cooccur = [...related.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 8);
  return { parents, children, cooccur };
}
function genreTopArtistsOf(items, limit) {
  const by = new Map();
  items.forEach(r => { const e = by.get(r.artist) || { artist: r.artist, count: 0, first: r }; e.count++; by.set(r.artist, e); });
  return [...by.values()].sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist)).slice(0, limit);
}
// The breadcrumb: follow the FIRST parent upward (a genre with two parents sits under both in the tree; the trail
// shows one path). Stops if the taxonomy loops.
function genreTrail(genre, taxonomy) {
  const trail = [genre], seen = new Set([genreTaxonomyKey(genre)]);
  let cur = genre;
  for (;;) {
    const p = getGenreParents(taxonomy, cur)[0];
    if (!p || seen.has(genreTaxonomyKey(p))) break;
    seen.add(genreTaxonomyKey(p)); trail.unshift(p); cur = p;
  }
  return trail;
}
// Splits a description into plain text and mentions of OTHER genres you know (taxonomy or tagged on a release), so
// the page can turn the mentions into links. Each genre links once (its first mention) — linking every "rock" in a
// description of rock music is noise — whole words only, longest name first ("Progressive Rock" before "Rock"),
// and never the genre's own name. No lookbehind: older Safari can't compile one.
function genreLinkSegments(text, selfLabel, knownLabels) {
  const self = genreTaxonomyKey(selfLabel);
  // The genre's own name stays in the pattern: it has to match AS A UNIT (and be left as plain text) so the words
  // inside it — the "Rock" of "Progressive Rock" — aren't linked as if they were a mention of another genre.
  const labels = [...new Set([...knownLabels, selfLabel].filter(l => l && genreTaxonomyKey(l) !== 'unknown'))].sort((a, b) => b.length - a.length);
  if (!text || labels.length < 2) return [{ text: text || '' }];
  const byKey = new Map(labels.map(l => [genreTaxonomyKey(l), l]));
  const re = new RegExp('(' + labels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  const word = /[\p{L}\p{N}_]/u, out = [], used = new Set();
  let last = 0, m;
  while ((m = re.exec(text))) {
    const start = m.index, end = start + m[0].length, k = genreTaxonomyKey(m[0]);
    const before = start > 0 ? text[start - 1] : '', after = end < text.length ? text[end] : '';
    if ((before && word.test(before)) || (after && word.test(after)) || !byKey.has(k)) { re.lastIndex = start + 1; continue; }
    if (k === self) { re.lastIndex = end; continue; }                  // its own name: plain text, and nothing inside it is linked
    if (used.has(k)) continue;
    used.add(k);
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: m[0], genre: byKey.get(k) });
    last = end;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
// END genre-data

/* ---------- Genre page ----------
   Right-click a genre in the left panel > "View genre description" opens it as its own tab (like an artist),
   showing what your crate holds under that genre: the years its releases span (with an optional second genre
   overlaid for comparison), your own description of it (the free-text blurb stored in the genre taxonomy, now
   editable here too, with mentions of other genres turned into links), counts, where it sits in the taxonomy,
   the artists you have most of, and its releases.

   Same shape as the Artist Information page: the page sits inside #panels beside the Music main panel (only one
   of the two shows), and the left panel gains a fourth view — the genre tree — so the position, width, resizer
   and row styling are the Music tab's own. All the numbers come from the pure functions in the genre-data block
   above; this part is the tabs, the DOM and the events. Session-only, like artist tabs. */
const GI_CHART_H = 130;
const GI_TAG_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.4V2.5h5.9l6 6-5.5 5.5z"></path><circle cx="5.3" cy="5.4" r="1" fill="currentColor" stroke="none"></circle></svg>';
let giRenderedGenre = null;       // which genre the page body currently shows (to keep the scroll position across re-renders of the same one)
let giClickTimer = null;

function giUi(genre) {            // per-genre view settings, kept while the tab is open
  const k = genreTaxonomyKey(genre);
  return state.genreUi[k] || (state.genreUi[k] = { includeSub: true, sort: 'year', view: 'covers', year: null, compare: null, editing: false, descOpen: false });
}
function canonicalGenreLabel(label) {
  const k = genreTaxonomyKey(label);
  const hit = getAllKnownGenres(state.genreTaxonomy).find(g => g.key === k);
  return hit ? hit.label : String(label || '').trim();
}
function giShowing(genre) { return state.activeTab === 'genreInfo' && genreTaxonomyKey(state.activeGenreTab) === genreTaxonomyKey(genre); }

// ----- MusicBrainz: how many release groups carry this genre as a tag -----
// MusicBrainz has no "release count per genre" endpoint, but a search of release groups by tag reports a total
// (count) however few results are asked for, so one request with limit=1 answers it. A release group is an album/EP/
// single with all its reissues counted once, which is the nearest MusicBrainz has to "releases" in your sense.
// Tags are typed by MusicBrainz users, so this is "tagged with that name", not a curated total, and it does not
// fold in sub-genres. One request per genre, then remembered for 30 days; a failure is never remembered and never
// retried on its own (the Retry button does that) so a flaky connection can't turn into a request loop. It goes
// through mbFetch like every other MusicBrainz call, so it shares the app-wide rate limit.
const GENRE_MB_CACHE_KEY = 'crate_genre_mb_count_v1';
const GENRE_MB_TTL_MS = 30 * 24 * 3600 * 1000;
const giMbFlight = new Map();
function giMbCacheRead() { try { return JSON.parse(localStorage.getItem(GENRE_MB_CACHE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function giMbCacheWrite(key, count) {
  try { const all = giMbCacheRead(); all[key] = { count, at: Date.now() }; localStorage.setItem(GENRE_MB_CACHE_KEY, JSON.stringify(all)); } catch (e) { /* storage full or blocked: just not remembered */ }
}
async function fetchGenreMbCount(label, datePrefix, hooks) {     // datePrefix (e.g. '197' or '1972') narrows it to a decade or a year — see buildMbYearHistogram
  const res = await mbFetchRetry503(`https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(genreMbQuery(label, datePrefix, mbDateSyntax))}&limit=1&fmt=json`, { headers: { 'Accept': 'application/json' } }, hooks);
  if (!res.ok) { const e = new Error(res.status === 503 ? 'MusicBrainz is busy (HTTP 503) and still was after every retry' : 'MusicBrainz HTTP ' + res.status); e.status = res.status; throw e; }
  const data = await res.json();
  if (!data || typeof data.count !== 'number') throw new Error('MusicBrainz sent no count');
  return data.count;
}
function mbFetchRetry503(url, opts, hooks) { return mbRetry503(() => mbFetch(url, opts), hooks); }
function giEnsureMb(genre, force) {
  const key = genreTaxonomyKey(genre), cur = state.genreMb[key];
  if (cur && (cur.status === 'ok' || cur.status === 'loading' || (cur.status === 'error' && !force))) { giRenderMb(genre); return; }
  const hit = giMbCacheRead()[key];
  if (hit && typeof hit.count === 'number' && Date.now() - hit.at < GENRE_MB_TTL_MS) { state.genreMb[key] = { status: 'ok', count: hit.count }; giRenderMb(genre); return; }
  state.genreMb[key] = { status: 'loading' };
  giRenderMb(genre);
  let p = giMbFlight.get(key);
  if (!p) { p = fetchGenreMbCount(genre, undefined, { maxAttempts: 6 }); giMbFlight.set(key, p); p.then(() => giMbFlight.delete(key), () => giMbFlight.delete(key)); }
  p.then(count => { giMbCacheWrite(key, count); state.genreMb[key] = { status: 'ok', count }; })
   .catch(err => { console.warn('MusicBrainz genre count failed', err); state.genreMb[key] = { status: 'error' }; })
   .then(() => { if (giShowing(genre)) giRenderMb(genre); });   // a late answer for a genre you've left is kept, just not painted over the one you're on
}
function giRenderMb(genre) {
  const out = document.getElementById('giMb');
  if (!out) return;
  const key = genreTaxonomyKey(genre), st = state.genreMb[key] || {};
  out.textContent = '';
  if (st.status === 'ok') {
    out.append(' \u00b7 ');
    if (st.count > 0) {
      const a = document.createElement('a');
      a.href = 'https://musicbrainz.org/tag/' + encodeURIComponent(String(genre).toLowerCase());
      a.target = '_blank'; a.rel = 'noopener';
      a.textContent = st.count.toLocaleString() + ' on MusicBrainz \u2197';
      a.title = `Release groups tagged \u201c${String(genre).toLowerCase()}\u201d on MusicBrainz \u2014 an album and its reissues count once. Tags are added by MusicBrainz users, and sub-genres aren\u2019t included.`;
      out.appendChild(a);
    } else out.append('not tagged on MusicBrainz');
  } else if (st.status === 'error') {
    out.append(' \u00b7 MusicBrainz count unavailable ');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ai-link-btn'; b.dataset.gi = 'mb-retry'; b.textContent = 'Retry';
    out.appendChild(b);
  } else if (st.status === 'loading') out.append(' \u00b7 checking MusicBrainz\u2026');
}

// ----- MusicBrainz: the Years active chart's second series — release groups by year -----
// Asked for only when you press Load (it is dozens of requests through the app's one-a-second MusicBrainz queue, so
// roughly a minute the first time) and remembered for 30 days once it has finished. One request at a time, each
// awaited before the next is queued, so other MusicBrainz work (an art lookup, adding a release) slots in between
// rather than waiting behind the whole run. It stops if you press Cancel or close the genre's tab, and a stopped or
// failed run resumes where it left off (the shared "rec" object keeps every answer). When it finishes, the numbers are
// checked against each other: a genre MusicBrainz says has releases but none with a date means its date search didn't
// answer the way this expects, and the page says so instead of drawing a flat chart.
const GENRE_MBY_CACHE_KEY = 'crate_genre_mb_years_v1';
function giMbYearsCacheRead() { try { return JSON.parse(localStorage.getItem(GENRE_MBY_CACHE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function giMbYearsCacheWrite(key, rec) {
  try { const all = giMbYearsCacheRead(); all[key] = { decades: rec.decades, years: rec.years, total: rec.total, requests: rec.requests, at: rec.at }; localStorage.setItem(GENRE_MBY_CACHE_KEY, JSON.stringify(all)); } catch (e) { /* storage full or blocked: just not remembered */ }
}
function giMbYearsRec(genre) {
  const key = genreTaxonomyKey(genre);
  return state.genreMbYears[key] || (state.genreMbYears[key] = { decades: {}, years: {}, requests: 0, total: null, status: 'idle', error: '', stop: false, at: null });
}
function giMbYearsHydrate(genre) {      // the saved answer, if there is a fresh one and nothing newer is in memory
  const key = genreTaxonomyKey(genre), rec = giMbYearsRec(genre);
  if (rec.status !== 'idle') return rec;
  const hit = giMbYearsCacheRead()[key];
  if (hit && hit.years && typeof hit.total === 'number' && Date.now() - hit.at < GENRE_MB_TTL_MS) Object.assign(rec, { decades: hit.decades || {}, years: hit.years, total: hit.total, requests: hit.requests || 0, at: hit.at, status: 'done' });
  return rec;
}
let mbDateSyntax = null;      // the way of writing a date that MusicBrainz was found to understand (null until the first Load)
const MB_SYNTAX_CACHE_KEY = 'crate_mb_date_syntax_v1';
async function mbAskCount(query, hooks) {
  try {
    const res = await mbFetchRetry503(`https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(query)}&limit=1&fmt=json`, { headers: { 'Accept': 'application/json' } }, hooks);
    if (!res.ok) { let body = ''; try { body = (await res.text()).replace(/\s+/g, ' ').slice(0, 140); } catch (e) { /* no body */ } return { ok: false, status: res.status, body }; }
    const data = await res.json();
    return typeof data.count === 'number' ? { ok: true, count: data.count } : { ok: false, status: 200, body: 'the answer had no count' };
  } catch (e) { if (e && e.mbStopped) throw e; return { ok: false, status: 0, body: String((e && e.message) || e) }; }
}
async function mbEnsureDateSyntax(force, hooks) {
  if (force) { mbDateSyntax = null; try { localStorage.removeItem(MB_SYNTAX_CACHE_KEY); } catch (e) { /* ignore */ } }
  if (mbDateSyntax) return { syntax: mbDateSyntax, tried: [] };
  try {
    const c = JSON.parse(localStorage.getItem(MB_SYNTAX_CACHE_KEY) || 'null');
    const known = c && Date.now() - c.at < GENRE_MB_TTL_MS ? MB_DATE_SYNTAXES.find(x => x.id === c.id) : null;
    if (known) { mbDateSyntax = known; return { syntax: known, tried: [] }; }
  } catch (e) { /* unreadable: just ask again */ }
  const r = await mbPickDateSyntax((q) => mbAskCount(q, hooks));
  if (r.syntax) { mbDateSyntax = r.syntax; try { localStorage.setItem(MB_SYNTAX_CACHE_KEY, JSON.stringify({ id: r.syntax.id, at: Date.now() })); } catch (e) { /* not remembered */ } }
  return r;
}
function giMbCheckUrl(genre) { return 'https://musicbrainz.org/search?query=' + encodeURIComponent(genreMbQuery(genre)) + '&type=release_group&method=advanced'; }
function giPaintMbYears(genre) {
  if (!giShowing(genre)) return;
  const ui = giUi(genre);
  giRenderChart(genre, ui, genreReleasesOf(genre, ui.includeSub));
}
async function giLoadMbYears(genre, fresh) {
  const key = genreTaxonomyKey(genre);
  if (fresh) { mbDateSyntax = null; delete state.genreMbYears[key]; try { const all = giMbYearsCacheRead(); delete all[key]; localStorage.setItem(GENRE_MBY_CACHE_KEY, JSON.stringify(all)); } catch (e) {} }
  const rec = giMbYearsRec(genre);
  if (rec.status === 'loading') return;
  rec.status = 'loading'; rec.stop = false; rec.error = ''; rec.wait = null; rec.retries = 0;
  giPaintMbYears(genre);
  const tabOpen = () => state.genreTabs.some(g => genreTaxonomyKey(g) === key);
  const hooks = {                                                   // HTTP 503 = MusicBrainz is busy: wait and ask again by itself (see mbRetry503)
    shouldStop: () => rec.stop || !tabOpen(),
    onWait: (w) => { rec.retries++; rec.wait = w; giPaintMbYears(genre); },
    onResume: () => { rec.wait = null; }
  };
  try {
    if (rec.total === null) {
      const have = state.genreMb[key];
      rec.total = have && have.status === 'ok' ? have.count : await fetchGenreMbCount(genre, undefined, hooks);
    }
    if (!mbDateSyntax || fresh) {
      rec.phase = 'probe'; giPaintMbYears(genre);
      const got = await mbEnsureDateSyntax(!!fresh, hooks);
      rec.phase = '';
      if (!got.syntax) {
        if (got.networkDown) throw new Error('MusicBrainz couldn\u2019t be reached');
        if (got.busy) throw new Error('MusicBrainz is busy (HTTP 503) and still was after every retry');     // not a problem with how a date is written
        rec.status = 'odd'; rec.diag = got.tried; giPaintMbYears(genre); return;     // nothing it was asked worked: show what it said
      }
    }
    const finished = await buildMbYearHistogram((prefix) => fetchGenreMbCount(genre, prefix, hooks), {
      nowYear: new Date().getFullYear(), known: rec, onStep: () => giPaintMbYears(genre),
      shouldStop: () => rec.stop || !state.genreTabs.some(g => genreTaxonomyKey(g) === key)
    });
    if (!finished) rec.status = 'stopped';
    else {
      const decadeSum = Object.values(rec.decades).reduce((a, b) => a + b, 0);
      if ((rec.total > 0 && decadeSum === 0) || decadeSum > rec.total * 1.05 + 5) { rec.status = 'odd'; rec.diag = [{ q: genreMbQuery(genre, '197', mbDateSyntax), status: 200, note: `decade counts add up to ${decadeSum.toLocaleString()} but the tag's total is ${rec.total.toLocaleString()}` }]; }   // dated answers that contradict the total
      else { rec.status = 'done'; rec.at = Date.now(); giMbYearsCacheWrite(key, rec); }
    }
  } catch (err) {
    if (err && err.mbStopped) rec.status = 'stopped';                 // Cancel (or closing the tab) during a wait: what is loaded stays, and Load carries on from there
    else { console.warn('MusicBrainz year counts failed', err); rec.status = 'error'; rec.error = String((err && err.message) || err); }
  }
  rec.wait = null;
  giPaintMbYears(genre);
}
function giMbPanelHtml(genre, rec) {
  const check = `<a href="${escapeHtml(giMbCheckUrl(genre))}" target="_blank" rel="noopener">Check the same search on MusicBrainz \u2197</a>`;
  const reqs = `${rec.requests} request${rec.requests === 1 ? '' : 's'}`;
  if (rec.status === 'loading') {
    const decades = Object.keys(rec.decades).length, phase = rec.phase === 'probe' ? 'checking how MusicBrainz wants a date written' : decades < Math.floor(new Date().getFullYear() / 10) - 189 ? `counting decades (${decades} of ${Math.floor(new Date().getFullYear() / 10) - 189})` : 'counting years';
    return `<div class="gi-mb-panel" role="status" aria-live="polite"><div class="gi-mb-line"><span>${rec.wait ? `MusicBrainz is busy (HTTP 503). Trying again in about ${Math.max(1, Math.round(rec.wait.ms / 1000))} s (try ${rec.wait.attempt} of ${rec.wait.max}), by itself.` : `Reading MusicBrainz\u2026 ${reqs} so far, ${phase}`}${rec.retries ? ` \u00b7 it was busy ${rec.retries} time${rec.retries === 1 ? '' : 's'}` : ''}${rec.stop ? ' \u2014 stopping' : ''}</span><button type="button" class="ai-link-btn" data-gi="mb-stop"${rec.stop ? ' disabled' : ''}>Cancel</button></div><div class="gi-mb-bar"><i></i></div><p class="gi-hint">MusicBrainz allows one request a second, so the first time takes about a minute. The page stays usable, and the result is remembered for 30 days.</p></div>`;
  }
  if (rec.status === 'stopped') return `<div class="gi-mb-panel" role="status"><div class="gi-mb-line"><span>Stopped after ${reqs}. What's loaded is shown below.</span><button type="button" class="ai-link-btn" data-gi="mb-load">Resume</button></div></div>`;
  if (rec.status === 'error') return `<div class="gi-mb-panel" role="status"><div class="gi-mb-line"><span>MusicBrainz stopped answering after ${reqs} (${escapeHtml(rec.error)}${rec.retries ? `; it was retried ${rec.retries} time${rec.retries === 1 ? '' : 's'} first` : ''}).</span><button type="button" class="ai-link-btn" data-gi="mb-load">Retry</button></div><p class="gi-hint">Retrying carries on from where it stopped; nothing already fetched is asked again.</p></div>`;
  if (rec.status === 'odd') {
    const tried = rec.diag || [], probed = tried.some(t => t.id);
    const lines = tried.map(t => `<li><code>${escapeHtml(t.q || '')}</code> \u2192 ${t.note ? escapeHtml(t.note) : t.status === 200 ? `answered ${t.count == null ? '?' : t.count.toLocaleString()}${t.count2 != null ? ' and ' + t.count2.toLocaleString() : ''}` : t.status === 0 ? 'no answer' : 'HTTP ' + t.status}${t.body ? ` \u2014 ${escapeHtml(t.body)}` : ''}</li>`).join('');
    const why = probed ? `MusicBrainz says ${rec.total.toLocaleString()} release groups carry this tag, but none of the ${tried.length} ways I tried asking it for a year gave usable counts (any single year in the 1990s should have thousands of release groups).`
      : `MusicBrainz says ${rec.total.toLocaleString()} release groups carry this tag, but its date search didn\u2019t return counts that add up, so no chart was drawn.`;
    return `<div class="gi-mb-panel" role="status"><div class="gi-mb-line"><span>${why}</span><button type="button" class="ai-link-btn" data-gi="mb-load" data-fresh="1">Try again</button></div>${lines ? `<details class="gi-mb-details"><summary>What MusicBrainz answered</summary><ul>${lines}</ul></details>` : ''}<p class="gi-hint">${check}</p></div>`;
  }
  return `<div class="gi-mb-panel"><div class="gi-mb-line"><span>MusicBrainz can't list releases by year in one go, so this asks it year by year \u2014 about a minute the first time, then remembered for 30 days.</span><button type="button" class="config-btn" data-gi="mb-load">Load MusicBrainz release counts</button></div></div>`;
}
function giMbSummary(genre, rec) {
  const ys = Object.keys(rec.years).map(Number).filter(y => rec.years[y] > 0);
  const dated = ys.reduce((a, y) => a + rec.years[y], 0);   // worked out here, not stored: numbers read back from the cache never had it set
  if (!ys.length) return `MusicBrainz: ${rec.total.toLocaleString()} release groups tagged \u201c${escapeHtml(String(genre).toLowerCase())}\u201d, none with a first-release year.`;
  const rest = Math.max(0, rec.total - dated);
  return `MusicBrainz: ${rec.total.toLocaleString()} release groups tagged \u201c${escapeHtml(String(genre).toLowerCase())}\u201d \u00b7 ${dated.toLocaleString()} with a first-release year (${Math.min(...ys)}\u2013${Math.max(...ys)}) \u00b7 ${rest.toLocaleString()} undated, before 1900 or not yet released. <a href="${escapeHtml(giMbCheckUrl(genre))}" target="_blank" rel="noopener">Check \u2197</a> \u00b7 <button type="button" class="ai-link-btn" data-gi="mb-refresh">Refresh</button>`;
}
function giRenderChart(genre, ui, items) {
  const mode = state.genreChartMb || 'off', mbOn = mode !== 'off';
  const rec = mbOn ? giMbYearsHydrate(genre) : null;
  const mbMap = rec ? new Map(Object.entries(rec.years).filter(([, v]) => v > 0).map(([y, v]) => [Number(y), v])) : null;
  const cmpItems = !mbOn && ui.compare ? genreReleasesOf(ui.compare, ui.includeSub) : null;
  const counts = genreYearCounts(items);
  const second = mbOn ? (mbMap.size ? mbMap : null) : (cmpItems ? genreYearCounts(cmpItems) : null);
  const model = genreChartModel(counts, second);
  const undated = items.length - [...counts.values()].reduce((a, b) => a + b, 0);
  const labels = getAllKnownGenres(state.genreTaxonomy).map(g => g.label).filter(l => genreTaxonomyKey(l) !== genreTaxonomyKey(genre));
  const showPlot = !!model && !(mode === 'only' && !mbMap.size);
  let chart = '';
  if (!showPlot) { if (!mbOn) chart = '<p class="ai-empty">No dated releases in this genre yet.</p>'; }
  else {
    const n = model.bars.length, pct = (y) => ((y - model.lo + 0.5) / n * 100).toFixed(2);
    const bands = [];
    for (let d = Math.floor(model.lo / 10) * 10; d <= model.hi; d += 10) {
      if ((d / 10) % 2) continue;
      const s = Math.max(d, model.lo), e = Math.min(d + 9, model.hi);
      bands.push(`<span class="gi-band" style="left:${((s - model.lo) / n * 100).toFixed(3)}%;width:${((e - s + 1) / n * 100).toFixed(3)}%"></span>`);
    }
    const cols = model.bars.map(b => {
      const sel = ui.year === b.year;
      const tip = mbOn ? `${b.year} \u00b7 ${b.n} in your crate \u00b7 ${b.c.toLocaleString()} on MusicBrainz`
        : `${b.year} \u00b7 ${b.n} release${b.n === 1 ? '' : 's'}` + (cmpItems ? ` \u00b7 ${ui.compare}: ${b.c}` : '');
      return `<button type="button" class="gi-col${sel ? ' selected' : ''}${ui.year && !sel ? ' dim' : ''}" data-gi="year" data-year="${b.year}" data-n="${b.n}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}" aria-pressed="${sel}"${b.n || b.c ? '' : ' disabled'}>` +
        (second && b.c ? `<span class="gi-bar gi-bar-c" style="height:${Math.max(3, Math.round(b.ch * GI_CHART_H))}px"></span>` : '') +
        (b.n && mode !== 'only' ? `<span class="gi-bar" style="height:${Math.max(3, Math.round(b.h * GI_CHART_H))}px"></span>` : '') + '</button>';
    }).join('');
    const only = mode === 'only';
    const first = only ? model.dataLoC : (mbOn && model.dataLoC !== null ? Math.min(model.dataLo, model.dataLoC) : model.dataLo);
    const last = only ? model.dataHiC : (mbOn && model.dataHiC !== null ? Math.max(model.dataHi, model.dataHiC) : model.dataHi);
    const peak = only ? model.peakYearC : model.peakYear;
    chart = `<div class="gi-plot${only ? ' mb-only' : ''}" style="height:${GI_CHART_H}px">${bands.join('')}<div class="gi-cols-row">${cols}</div></div>
      <div class="gi-axis"><span style="left:${pct(first)}%">${first}</span>${peak !== null && peak !== first && peak !== last ? `<span class="gi-axis-peak" style="left:${pct(peak)}%">${peak}</span>` : ''}${last !== first ? `<span style="left:${pct(last)}%">${last}</span>` : ''}</div>`;
  }
  const panel = mbOn && rec.status !== 'done' ? giMbPanelHtml(genre, rec) : '';
  const hint = mbOn && rec.status === 'done' ? giMbSummary(genre, rec)
    : ui.year ? `Showing ${ui.year} only. <button type="button" class="ai-link-btn" data-gi="clear-year">Show all years</button>`
    : (model && !(mode === 'only' && !mbMap.size) ? 'Your releases in this genre by year of release. Click a year to filter the releases below.' : '') + (undated ? ` ${undated} undated release${undated === 1 ? '' : 's'} not shown.` : '');
  const seg = (m, text) => `<button type="button" class="gi-seg-btn${mode === m ? ' active' : ''}" data-gi="mb-mode" data-mode="${m}" aria-pressed="${mode === m}">${text}</button>`;
  const legend = mbOn
    ? (mode === 'only' ? '' : `<span class="gi-legend"><i class="gi-swatch"></i>Your crate</span>`) + `<span class="gi-legend"><i class="gi-swatch gi-swatch-c"></i>MusicBrainz</span>`
    : `<span class="gi-legend"><i class="gi-swatch"></i>${escapeHtml(genre)}</span>` + (ui.compare ? `<span class="gi-legend"><i class="gi-swatch gi-swatch-c"></i>${escapeHtml(ui.compare)} <button type="button" class="gi-x" data-gi="clear-compare" aria-label="Stop comparing with ${escapeHtml(ui.compare)}">\u00d7</button></span>`
        : `<input id="giCompare" class="gi-compare" type="text" list="giGenreOptions" placeholder="Compare to a genre…" aria-label="Compare to a genre" autocomplete="off"><datalist id="giGenreOptions">${labels.map(l => `<option value="${escapeHtml(l)}"></option>`).join('')}</datalist>`);
  $gi('giChart').innerHTML = `
    <div class="gi-chart-head"><h2 class="gi-h2">Years active</h2>
      <div class="gi-chart-tools">
        <span class="gi-seg gi-seg-text" role="group" aria-label="What the chart shows">${seg('off', 'Your crate')}${seg('both', 'Both')}${seg('only', 'MusicBrainz')}</span>
        ${legend}
        <span class="gi-help" tabindex="0" role="img" aria-label="About this chart" title="Releases in your crate by year of release. Compare overlays another genre; MusicBrainz overlays its count of release groups tagged with this genre, by first-release year. Each series is scaled to its own busiest year, so you are comparing shapes, not sizes.">?</span>
      </div></div>
    ${panel}${chart}<p class="gi-hint">${hint}</p>`;
}

// ----- tabs -----
function renderGenreTabButtons() {
  if (!el.genreTabsContainer) return;
  el.genreTabsContainer.innerHTML = state.genreTabs.map(g => `
    <button type="button" class="nav-tab genre-tab-btn${g === state.activeGenreTab && state.activeTab === 'genreInfo' ? ' active' : ''}" data-genre="${escapeHtml(g)}">
      <span class="genre-tab-icon">${GI_TAG_ICON}</span>
      <span class="genre-tab-label">${escapeHtml(g)}</span>
      <span class="genre-tab-close" data-genre="${escapeHtml(g)}" title="Close" aria-label="Close ${escapeHtml(g)} tab">\u00d7</span>
    </button>`).join('');
  updateTabHistoryButtons();
}
function openGenreTab(label, opts) {
  const name = canonicalGenreLabel(label);
  if (!name) return;
  const existing = state.genreTabs.find(g => genreTaxonomyKey(g) === genreTaxonomyKey(name));
  if (!existing) state.genreTabs.push(name);
  state.activeGenreTab = existing || name;
  if (opts && opts.edit) giUi(state.activeGenreTab).editing = true;
  renderGenreTabButtons();
  if (isMobileDrawerLayout()) setMobileDrawer(null);      // chosen from the ☰ drawer on a phone: show the page, not the drawer
  switchTab('genreInfo');
}
function closeGenreTab(genre) {   // same rules as closeArtistInfoTab: only navigate away if it was the page being shown
  const idx = state.genreTabs.indexOf(genre);
  if (idx === -1) return;
  state.genreTabs.splice(idx, 1);
  delete state.genreUi[genreTaxonomyKey(genre)];
  const wasShowing = state.activeTab === 'genreInfo' && state.activeGenreTab === genre;
  if (state.activeGenreTab === genre) {
    if (state.genreTabs.length) {
      state.activeGenreTab = state.genreTabs[Math.max(0, idx - 1)];
      renderGenreTabButtons();
      if (wasShowing) switchTab('genreInfo');
      return;
    }
    state.activeGenreTab = null;
    if (wasShowing) switchTab('albums');
  }
  renderGenreTabButtons();
}

// ----- left panel: the genre tree (the fourth view of #leftPanel) -----
function toggleGenreBranch(key) {          // shares state.collapsedGenres with the Music tab's tree, so a branch is open or closed in both
  if (state.collapsedGenres.has(key)) state.collapsedGenres.delete(key); else state.collapsedGenres.add(key);
  savePrefs();
  buildLeftList();
  renderGenreBrowser(state.activeGenreTab);
}
function renderGenreBrowser(current) {
  const list = el.giGenreList;
  if (!list) return;
  const rows = buildGenreTree(state.raw, state.genreTaxonomy);
  rows.forEach((row, i) => { row.hasChildren = !!(rows[i + 1] && rows[i + 1].depth > row.depth); });
  const curKey = genreTaxonomyKey(current);
  const prev = list.scrollTop;
  list.textContent = '';
  filterCollapsedGenreRows(rows).forEach(entry => {
    const key = genreTaxonomyKey(entry.key);
    const row = document.createElement('div');
    row.className = 'left-row gi-genre-row' + (key === curKey ? ' active' : '');
    row.setAttribute('role', 'listitem'); row.tabIndex = 0; row.dataset.genre = entry.label;
    row.style.paddingLeft = entry.depth ? (6 + entry.depth * 16) + 'px' : '';
    const ancestors = getGenreAncestors(state.genreTaxonomy, entry.label);
    if (ancestors.length) row.title = 'Under: ' + ancestors.join(', ');
    let lead;
    if (entry.hasChildren) {
      lead = document.createElement('button'); lead.type = 'button';
      const collapsed = state.collapsedGenres.has(key);
      lead.className = 'genre-tree-caret' + (collapsed ? ' collapsed' : '');
      lead.textContent = '\u25be'; lead.title = collapsed ? 'Expand' : 'Collapse'; lead.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
      lead.addEventListener('click', (e) => { e.stopPropagation(); toggleGenreBranch(key); });
    } else { lead = document.createElement('span'); lead.className = 'genre-tree-caret-spacer'; lead.setAttribute('aria-hidden', 'true'); }
    const text = document.createElement('div'); text.className = 'left-row-text';
    const title = document.createElement('p'); title.className = 'left-row-title ' + (entry.depth ? 'genre-tree-child' : 'genre-tree-root'); title.textContent = entry.label;
    if (entry.depth) title.style.opacity = Math.max(0.55, 1 - entry.depth * 0.14);
    text.appendChild(title);
    const count = document.createElement('span'); count.className = 'left-row-count'; count.textContent = Math.round(entry.count * 10) / 10;
    row.append(lead, text, count);
    attachLongPress(row, (x, y) => openGenreContextMenu(row.dataset.genre, x, y));    // the same menu as right-click, for a phone
    list.appendChild(row);
  });
  list.scrollTop = prev;
  const a = list.querySelector('.gi-genre-row.active');
  if (a) {
    if (a.offsetTop < list.scrollTop) list.scrollTop = a.offsetTop;
    else if (a.offsetTop + a.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = a.offsetTop + a.offsetHeight - list.clientHeight;
  }
}

// ----- sorting / playing -----
function giSortItems(items, sort) {
  const t = (r) => { const ms = dateVal(r.releaseDate); return ms === -Infinity ? null : ms; };
  const byYear = (dir) => (a, b) => { const x = t(a), y = t(b); if (x === null && y === null) return a.title.localeCompare(b.title); if (x === null) return 1; if (y === null) return -1; return (x - y) * dir || a.title.localeCompare(b.title); };
  const out = items.slice();
  if (sort === 'yeardesc') out.sort(byYear(-1));
  else if (sort === 'rating') out.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || a.title.localeCompare(b.title));
  else if (sort === 'artist') out.sort((a, b) => a.artist.localeCompare(b.artist) || byYear(1)(a, b));
  else if (sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title));
  else out.sort(byYear(1));
  return out;
}
function giPlayGenre(genre, shuffle) {
  const ui = giUi(genre), items = giSortItems(genreReleasesOf(genre, ui.includeSub), ui.sort);
  if (!items.length) { flashGlobalToast('Nothing to play \u2014 no releases in ' + genre + '.'); return; }
  if (shuffle && !state.shuffle) setShuffle(true);
  playAlbumsReplacingQueue(items);
}

// ----- the page -----
function giEnsureSkeleton() {
  if (el.genreInfoBody.dataset.ready) return;
  el.genreInfoBody.dataset.ready = '1';
  el.genreInfoBody.innerHTML = `
    <nav id="giCrumbs" class="gi-crumbs" aria-label="Where this genre sits"></nav>
    <div id="giTitle" class="gi-titlebar"></div>
    <section id="giChart" class="gi-card gi-chart" aria-label="Years active"></section>
    <div class="gi-cols">
      <section id="giAbout" class="gi-card gi-about" aria-label="About this genre"></section>
      <div class="gi-side"><section id="giStats" class="gi-card" aria-label="Your crate"></section><section id="giFamily" class="gi-card" aria-label="Family"></section></div>
    </div>
    <section id="giArtists" class="gi-artists" aria-label="Top artists in this genre"></section>
    <section id="giReleases" class="gi-releases" aria-label="Releases"></section>`;
}
function renderGenreInfoTab() {
  const genre = state.activeGenreTab;
  if (!genre) return;
  giEnsureSkeleton();
  // Opening (or switching to) a genre never leaves it hidden inside a collapsed branch. This is here, not in
  // renderGenreBrowser: collapsing a branch that holds the open genre is the user's own choice and must stick.
  const hidden = getGenreAncestors(state.genreTaxonomy, genre).map(genreTaxonomyKey).filter(k => state.collapsedGenres.has(k));
  if (hidden.length) { hidden.forEach(k => state.collapsedGenres.delete(k)); savePrefs(); buildLeftList(); }
  renderGenreBrowser(genre);
  const keepScroll = giRenderedGenre === genreTaxonomyKey(genre) ? el.genreInfoBody.scrollTop : 0;
  giRenderAll(genre);
  giEnsureMb(genre);
  el.genreInfoBody.scrollTop = keepScroll;
  giRenderedGenre = genreTaxonomyKey(genre);
}
function giRenderAll(genre) {
  const ui = giUi(genre), items = genreReleasesOf(genre, ui.includeSub);
  const family = genreFamilyOf(genre, items, state.genreTaxonomy, state.raw);
  giRenderCrumbs(genre);
  giRenderTitle(genre, ui, items, family);
  giRenderChart(genre, ui, items);
  giRenderAbout(genre, ui);
  giRenderStats(items);
  giRenderFamily(family);
  giRenderArtists(items);
  giRenderReleases(genre, ui, items);
}
const $gi = (id) => document.getElementById(id);
function giRenderCrumbs(genre) {
  const trail = genreTrail(genre, state.genreTaxonomy);
  $gi('giCrumbs').innerHTML = '<span>Genres</span>' + trail.map((g, i) => '<span class="gi-crumb-sep">\u203a</span>' +
    (i === trail.length - 1 ? `<span class="gi-crumb-here">${escapeHtml(g)}</span>` : `<a href="#" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</a>`)).join('');
}
function giRenderTitle(genre, ui, items, family) {
  const st = genreStatsOf(items);
  const bits = [`<b>${st.releases}</b> in your crate`, `${st.artists} artist${st.artists === 1 ? '' : 's'}`];
  if (family.children.length) bits.push(`${family.children.length} sub-genre${family.children.length === 1 ? '' : 's'}`);
  $gi('giTitle').innerHTML = `
    <div class="gi-titlewrap"><h1 class="gi-title">${escapeHtml(genre)}</h1><p class="gi-meta">${bits.join(' \u00b7 ')}<span id="giMb" class="gi-mb"></span></p></div>
    <div class="gi-actions">
      <button type="button" class="gi-round gi-round-accent" data-gi="play" title="Play every release in this genre" aria-label="Play every release in ${escapeHtml(genre)}"${st.releases ? '' : ' disabled'}>\u25b6</button>
      <button type="button" class="gi-round" data-gi="shuffle" title="Shuffle this genre" aria-label="Shuffle ${escapeHtml(genre)}"${st.releases ? '' : ' disabled'}>\u21cc</button>
      <button type="button" class="gi-pill" data-gi="export" title="Export the releases on this page as a file you can keep or share (uses your sub-genre and year choices)"${st.releases ? '' : ' disabled'}>Export these\u2026</button>
      <button type="button" class="gi-pill" data-gi="edit">Edit description</button>
    </div>`;
}
function giRenderAbout(genre, ui) {
  const entry = state.genreTaxonomy[genreTaxonomyKey(genre)] || {};
  const text = (entry.description || '').trim();
  let body;
  if (ui.editing) {
    body = `<textarea id="giDescInput" class="gi-desc-input" placeholder="Write a description for this genre…" aria-label="Description of ${escapeHtml(genre)}">${escapeHtml(text)}</textarea>
      <div class="gi-edit-actions"><button type="button" class="config-btn" data-gi="save-desc">Save</button><button type="button" class="ai-link-btn" data-gi="cancel-desc">Cancel</button><span class="gi-hint-inline">Names of other genres you have become links.</span></div>`;
  } else if (!text) {
    body = `<p class="ai-empty">No description yet. <button type="button" class="ai-link-btn" data-gi="edit">Write one</button> \u2014 other genres you mention become links to their pages.</p>`;
  } else {
    const known = getAllKnownGenres(state.genreTaxonomy).map(g => g.label);
    // Linked as ONE text (each genre links once, at its first mention anywhere in the description), then cut into
    // paragraphs at the blank lines — a paragraph at a time would link "Rock" again in every paragraph.
    const parasHtml = [''];
    genreLinkSegments(text, genre, known).forEach(sg => {
      if (sg.genre) { parasHtml[parasHtml.length - 1] += `<a href="#" class="gi-genre-link" data-genre="${escapeHtml(sg.genre)}">${escapeHtml(sg.text)}</a>`; return; }
      sg.text.split(/\n{2,}/).forEach((part, i) => { if (i > 0) parasHtml.push(''); parasHtml[parasHtml.length - 1] += escapeHtml(part); });
    });
    const paras = parasHtml.map(h => '<p>' + h + '</p>').join('');
    body = `<div id="giDesc" class="gi-desc${ui.descOpen ? '' : ' clamped'}">${paras}</div><button type="button" id="giMore" class="ai-link-btn gi-more" data-gi="more" hidden>${ui.descOpen ? 'Show less' : 'Read more'}</button>`;
  }
  $gi('giAbout').innerHTML = `<div class="gi-card-label">About</div>${body}${ui.editing ? '' : rymGenreAboutNote(genre, entry, ui)}`;
  if (ui.editing) { const ta = $gi('giDescInput'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
  const d = $gi('giDesc'), more = $gi('giMore');
  if (d && more) more.hidden = !(ui.descOpen || d.scrollHeight > d.clientHeight + 4);   // only offer "Read more" when the text is actually cut
}
function giRenderStats(items) {
  const s = genreStatsOf(items), cell = (k, v) => `<div class="gi-stat"><div class="gi-stat-v">${v}</div><div class="gi-stat-k">${k}</div></div>`;
  $gi('giStats').innerHTML = `<div class="gi-card-label">Your crate</div><div class="gi-stats">` +
    cell('Releases', s.releases) + cell('Artists', s.artists) + cell('Avg rating', s.avgRating === null ? '\u2014' : '\u2605 ' + s.avgRating.toFixed(1)) +
    cell('Plays', s.plays) + cell('Listened', `${s.listened} / ${s.releases}`) + cell('Top decade', s.topDecade === null ? '\u2014' : s.topDecade + 's') + '</div>';
}
function giRenderFamily(f) {
  const chip = (c, dim) => `<button type="button" class="gi-chip${dim ? ' dim' : ''}" data-gi="genre" data-genre="${escapeHtml(c.label)}">${escapeHtml(c.label)}<span class="gi-chip-n">${c.count === undefined ? '' : c.count}</span></button>`;
  const famGroup = (title, chips) => chips ? `<div class="gi-fam-title">${title}</div><div class="gi-chips">${chips}</div>` : '';
  const html = famGroup('Parent', f.parents.map(p => chip({ label: p })).join('')) + famGroup('Sub-genres', f.children.slice(0, 14).map(c => chip(c, !c.count)).join('')) + famGroup('Often tagged with', f.cooccur.map(c => chip(c)).join(''));
  $gi('giFamily').innerHTML = `<div class="gi-card-label">Family</div>` + (html || '<p class="ai-empty">This genre has no parents or sub-genres, and nothing else is tagged alongside it.</p>');
}
function giRenderArtists(items) {
  const top = genreTopArtistsOf(items, 14);
  if (!top.length) { $gi('giArtists').innerHTML = ''; return; }
  aiTouchArt(top.map(t => t.first));
  $gi('giArtists').innerHTML = `<div class="gi-section-head"><span class="gi-card-label">Top artists in this genre</span></div><div class="gi-artist-row">` +
    top.map(t => `<button type="button" class="gi-artist" data-gi="artist" data-artist="${escapeHtml(t.artist)}" title="Open ${escapeHtml(t.artist)}"><span class="gi-avatar">${aiArtImg(t.first, 'gi-avatar-img')}</span><span class="gi-artist-name">${escapeHtml(t.artist)}</span><span class="gi-artist-n">${t.count} release${t.count === 1 ? '' : 's'}</span></button>`).join('') + '</div>';
}
function giTileHtml(it) {
  return `<div class="ai-album" data-row="${escapeHtml(String(it.row))}" tabindex="0" title="Click to open \u00b7 double-click to play \u00b7 right-click for more">
    <div class="ai-cover">${aiArtImg(it, 'ai-cover-img')}${linkFlagHtml(it)}</div><div class="ai-album-title">${escapeHtml(it.title)}</div><div class="ai-album-year">${escapeHtml(it.artist)}</div></div>`;
}
function giListRowHtml(it) {
  const y = genreYear(it), r = Number(it.rating) || 0;
  return `<div class="gi-list-row" data-row="${escapeHtml(String(it.row))}" tabindex="0" title="Click to open \u00b7 double-click to play \u00b7 right-click for more">
    <span class="gi-list-cover">${aiArtImg(it, 'gi-list-img')}</span><span class="gi-list-main"><span class="gi-list-title">${linkFlagHtml(it, 'before')}${escapeHtml(it.title)}</span><span class="gi-list-artist">${escapeHtml(it.artist)}</span></span>
    <span class="gi-list-year">${y === null ? '' : y}</span><span class="gi-list-rating">${r > 0 ? '\u2605 ' + (Number.isInteger(r) ? r : r.toFixed(1)) : ''}</span></div>`;
}
function giRenderReleases(genre, ui, items) {
  const shown = giSortItems(ui.year ? items.filter(r => genreYear(r) === ui.year) : items, ui.sort);
  aiTouchArt(shown);
  let body;
  if (!shown.length) body = `<p class="ai-empty">${items.length ? 'No releases that year.' : 'No releases in this genre yet.'}</p>`;
  else if (ui.view === 'list') body = `<div class="gi-list">${shown.map(giListRowHtml).join('')}</div>`;
  else if (ui.sort === 'year' || ui.sort === 'yeardesc') {
    const groups = []; shown.forEach(r => { const y = genreYear(r), g = groups[groups.length - 1]; if (g && g.y === y) g.items.push(r); else groups.push({ y, items: [r] }); });
    body = groups.map(g => `<div class="gi-year-head">${g.y === null ? 'Undated' : g.y} \u00b7 ${g.items.length}</div><div class="ai-album-grid">${g.items.map(giTileHtml).join('')}</div>`).join('');
  } else body = `<div class="ai-album-grid">${shown.map(giTileHtml).join('')}</div>`;
  const opt = (v, t) => `<option value="${v}"${ui.sort === v ? ' selected' : ''}>${t}</option>`;
  $gi('giReleases').innerHTML = `
    <div class="gi-rel-head">
      <div class="gi-rel-title"><h2 class="gi-h2">Releases</h2><span class="gi-rel-count">${ui.year ? `${shown.length} of ${items.length}` : items.length}</span>${ui.year ? `<button type="button" class="gi-chip" data-gi="clear-year">${ui.year} \u00d7</button>` : ''}</div>
      <div class="gi-rel-tools">
        <label class="gi-check"><input type="checkbox" id="giIncludeSub"${ui.includeSub ? ' checked' : ''}> Include sub-genres</label>
        <select id="giSort" class="gi-select" aria-label="Sort releases">${opt('year', 'Year (oldest first)')}${opt('yeardesc', 'Year (newest first)')}${opt('rating', 'Rating')}${opt('artist', 'Artist A\u2013Z')}${opt('title', 'Title A\u2013Z')}</select>
        <span class="gi-seg"><button type="button" class="gi-seg-btn${ui.view === 'covers' ? ' active' : ''}" data-gi="view" data-view="covers" aria-label="Covers" aria-pressed="${ui.view === 'covers'}" title="Covers">\u25a6</button><button type="button" class="gi-seg-btn${ui.view === 'list' ? ' active' : ''}" data-gi="view" data-view="list" aria-label="List" aria-pressed="${ui.view === 'list'}" title="List">\u2630</button></span>
      </div></div>${body}`;
}

// ----- events -----
function giItemByRow(node) { const t = node && node.closest('[data-row]'); return t ? state.raw.find(r => String(r.row) === t.dataset.row) : null; }
function giSaveDescription(genre) {
  const key = genreTaxonomyKey(genre), ui = giUi(genre);
  if (!state.genreTaxonomy[key]) state.genreTaxonomy[key] = { label: genre, parents: [] };   // a genre that is only tagged on releases gets its taxonomy entry the first time it has something to say
  state.genreTaxonomy[key].description = $gi('giDescInput').value.trim();
  saveGenreTaxonomy(state.genreTaxonomy);
  ui.editing = false;
  giRenderAbout(genre, ui);
  if (el.genreDescElement && !el.genreDescElement.hidden) renderGenreDescElement();   // the Main-panel Genre Description box, if it's showing, reads the same field
  flashGlobalToast('Genre description saved.');
}
function giClick(e) {
  const genre = state.activeGenreTab;
  if (!genre) return;
  const ui = giUi(genre);
  const link = e.target.closest('a[data-genre]');
  if (link) { e.preventDefault(); openGenreTab(link.dataset.genre); return; }
  const act = e.target.closest('[data-gi]');
  if (act) {
    const a = act.dataset.gi;
    if (a === 'play') giPlayGenre(genre, false);
    else if (a === 'shuffle') giPlayGenre(genre, true);
    else if (a === 'export') openCxExport({ kind: 'genre', genre, includeSub: ui.includeSub, year: ui.year });
    else if (a === 'edit') { ui.editing = true; ui.descOpen = true; giRenderAbout(genre, ui); }
    else if (a === 'cancel-desc') { ui.editing = false; giRenderAbout(genre, ui); }
    else if (a === 'save-desc') giSaveDescription(genre);
    else if (a === 'rym-show') { ui.rymShown = !ui.rymShown; giRenderAbout(genre, ui); }
    else if (a === 'rym-use') giUseRymDescription(genre);
    else if (a === 'more') { ui.descOpen = !ui.descOpen; giRenderAbout(genre, ui); }
    else if (a === 'year') { if (act.dataset.n === '0') return; ui.year = ui.year === Number(act.dataset.year) ? null : Number(act.dataset.year); const items = genreReleasesOf(genre, ui.includeSub); giRenderChart(genre, ui, items); giRenderReleases(genre, ui, items); }
    else if (a === 'clear-year') { ui.year = null; const items = genreReleasesOf(genre, ui.includeSub); giRenderChart(genre, ui, items); giRenderReleases(genre, ui, items); }
    else if (a === 'clear-compare') { ui.compare = null; giRenderChart(genre, ui, genreReleasesOf(genre, ui.includeSub)); }
    else if (a === 'view') { ui.view = act.dataset.view; giRenderReleases(genre, ui, genreReleasesOf(genre, ui.includeSub)); }
    else if (a === 'genre') openGenreTab(act.dataset.genre);
    else if (a === 'artist') openArtistInfoTab(act.dataset.artist);
    else if (a === 'mb-retry') giEnsureMb(genre, true);
    else if (a === 'mb-mode') { state.genreChartMb = act.dataset.mode; savePrefs(); giRenderChart(genre, ui, genreReleasesOf(genre, ui.includeSub)); }
    else if (a === 'mb-load') giLoadMbYears(genre, !!act.dataset.fresh);
    else if (a === 'mb-stop') { giMbYearsRec(genre).stop = true; giPaintMbYears(genre); }
    else if (a === 'mb-refresh') giLoadMbYears(genre, true);
    return;
  }
  const item = giItemByRow(e.target);
  if (item) {                                   // wait out a possible double-click (which plays it) before opening the album page
    clearTimeout(giClickTimer);
    giClickTimer = setTimeout(() => openDeck(item), 260);
  }
}
function giChange(e) {
  const genre = state.activeGenreTab;
  if (!genre) return;
  const ui = giUi(genre), id = e.target.id;
  if (id === 'giIncludeSub') { ui.includeSub = e.target.checked; ui.year = null; giRenderAll(genre); giRenderMb(genre); }
  else if (id === 'giSort') { ui.sort = e.target.value; giRenderReleases(genre, ui, genreReleasesOf(genre, ui.includeSub)); }
  else if (id === 'giCompare') {
    const v = e.target.value.trim();
    if (!v) return;
    const hit = getAllKnownGenres(state.genreTaxonomy).find(g => genreTaxonomyKey(g.label) === genreTaxonomyKey(v));
    if (!hit || genreTaxonomyKey(hit.label) === genreTaxonomyKey(genre)) { flashGlobalToast(hit ? 'That is this genre.' : 'No genre called \u201c' + v + '\u201d.'); e.target.value = ''; return; }
    ui.compare = hit.label;
    giRenderChart(genre, ui, genreReleasesOf(genre, ui.includeSub));
  }
}
function giDblClick(e) {
  const item = giItemByRow(e.target);
  if (item) { clearTimeout(giClickTimer); playAlbumReplacingQueue(item); }
}
function giContextMenu(e) {
  const item = giItemByRow(e.target);
  if (item) { e.preventDefault(); openAlbumCardContextMenu(item, e.clientX, e.clientY); }
}

// ----- the right-click menu on a genre row -----
function openArtistRowContextMenu(artist, x, y) {
  closeNowPlayingAddMenu();
  const n = aiOwned(artist).length;                 // the same list the Artist page and its "Export these…" use
  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu';
  menu.innerHTML = `
    <div class="menu-section-title">${escapeHtml(artist)}</div>
    <button type="button" data-artist-action="view">Open artist page <span class="menu-hint-right">new tab</span></button>
    <div class="menu-divider"></div>
    <button type="button" data-artist-action="export"${n ? '' : ' disabled'}>Export ${n} release${n === 1 ? '' : 's'}\u2026</button>`;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-artist-action]');
    if (!b || b.disabled) return;
    closeNowPlayingAddMenu();
    if (b.dataset.artistAction === 'view') openArtistInfoTab(artist);
    else openCxExport({ kind: 'artist', artist });
  });
  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}

function openGenreContextMenu(label, x, y) {
  closeNowPlayingAddMenu();
  const name = canonicalGenreLabel(label), n = genreReleasesOf(name, true).length;
  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu';
  menu.innerHTML = `
    <div class="menu-section-title">${escapeHtml(name)}</div>
    <button type="button" data-genre-action="view">View genre description <span class="menu-hint-right">new tab</span></button>
    <button type="button" data-genre-action="play"${n ? '' : ' disabled'}>Play all ${n} release${n === 1 ? '' : 's'}</button>
    <button type="button" data-genre-action="shuffle"${n ? '' : ' disabled'}>Shuffle</button>
    <div class="menu-divider"></div>
    <button type="button" data-genre-action="export"${n ? '' : ' disabled'}>Export ${n} release${n === 1 ? '' : 's'}\u2026</button>
    <button type="button" data-genre-action="match"${n ? '' : ' disabled'}>Match songs in this genre\u2026</button>
    <button type="button" data-genre-action="edit">Edit description\u2026</button>`;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-genre-action]');
    if (!b || b.disabled) return;
    closeNowPlayingAddMenu();
    const a = b.dataset.genreAction;
    if (a === 'view') openGenreTab(name);
    else if (a === 'edit') openGenreTab(name, { edit: true });
    else if (a === 'export') openCxExport({ kind: 'genre', genre: name, includeSub: true });      // the same set "Play all N" above uses: sub-genres included
    else if (a === 'match') { const items = genreReleasesOf(name, true); bmOpen({ genre: { name, items }, view: (state.filtered || []).slice() }); }
    else { const ui = giUi(name), items = giSortItems(genreReleasesOf(name, true), ui.sort); if (a === 'shuffle' && !state.shuffle) setShuffle(true); playAlbumsReplacingQueue(items); }
  });
  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}

function initGenrePage() {
  if (!el.genreInfoBody) return;
  el.genreTabsContainer.addEventListener('click', (e) => {
    const close = e.target.closest('.genre-tab-close');
    if (close) { e.stopPropagation(); closeGenreTab(close.dataset.genre); return; }
    const tab = e.target.closest('.genre-tab-btn');
    if (!tab) return;
    state.activeGenreTab = tab.dataset.genre;
    switchTab('genreInfo');
  });
  // A double-click is detected from the click COUNT, not a 'dblclick' event: the first click opens the genre and redraws
  // these rows, and a browser only fires dblclick when both clicks land on the same element — so it never would.
  el.giGenreList.addEventListener('click', (e) => {
    const row = e.target.closest('.gi-genre-row');
    if (!row || e.target.closest('.genre-tree-caret')) return;
    if (e.detail >= 2) { giPlayGenre(canonicalGenreLabel(row.dataset.genre), false); return; }
    openGenreTab(row.dataset.genre);
    if (isMobileDrawerLayout()) setMobileDrawer(null);
  });
  el.giGenreList.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const row = e.target.closest('.gi-genre-row'); if (row) { e.preventDefault(); openGenreTab(row.dataset.genre); } } });
  el.giGenreList.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.gi-genre-row');
    if (row) { e.preventDefault(); openGenreContextMenu(row.dataset.genre, e.clientX, e.clientY); }
  });
  el.genreInfoBody.addEventListener('click', giClick);
  el.genreInfoBody.addEventListener('change', giChange);
  el.genreInfoBody.addEventListener('dblclick', giDblClick);
  el.genreInfoBody.addEventListener('contextmenu', giContextMenu);
}

function initTabBar() {
  if (!el.tabBar) return;
  state.tabHistory = [tabHistoryEntry()];     // seed with wherever the app starts, so "back" has somewhere to go
  state.tabHistoryIndex = 0;
  updateTabHistoryButtons();
  el.tabBackBtn.addEventListener('click', () => navigateTabHistory(-1));
  el.tabForwardBtn.addEventListener('click', () => navigateTabHistory(1));
  el.tabAddBtn.addEventListener('click', openArtistQuickOpen);
}

function initArtistInfoPage() {
  if (el.artistBioBody) el.artistBioBody.addEventListener('click', aiBioClick);
  if (!el.artistInfoWrap) return;
  el.aiArtistFilter.addEventListener('input', debounce(() => aiRenderSidebar(state.activeArtistInfoTab), 120));
  const openRow = (row) => { if (!row) return; openArtistInfoTab(row.dataset.artist); if (isMobileDrawerLayout()) setMobileDrawer(null); };
  el.aiArtistList.addEventListener('click', (e) => openRow(e.target.closest('.ai-artist-row')));
  el.aiArtistList.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const row = e.target.closest('.ai-artist-row'); if (row) { e.preventDefault(); openRow(row); } } });
  el.aiSubtabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-aitab]'), a = state.activeArtistInfoTab;
    if (!b || !a) return;
    state.artistInfoSubTab[a] = b.dataset.aitab;
    aiRenderBody(a);
  });
  el.aiExportBtn.addEventListener('click', () => { if (state.activeArtistInfoTab) openCxExport({ kind: 'artist', artist: state.activeArtistInfoTab }); });
  el.aiPlayBtn.addEventListener('click', () => {
    const owned = state.activeArtistInfoTab ? aiOwned(state.activeArtistInfoTab) : [];
    if (owned.length) playAlbumsReplacingQueue(owned);   // discography order; honours Shuffle
  });
  el.aiBody.addEventListener('click', aiBodyClick);
  el.aiBody.addEventListener('dblclick', aiBodyDblClick);
  el.aiBody.addEventListener('contextmenu', aiBodyContextMenu);
  el.aiBody.addEventListener('change', (e) => {
    if (e.target.id !== 'aiTrackSort') return;
    state.artistInfoTrackSort = e.target.value;
    if (state.activeArtistInfoTab) aiRenderTopTracks(state.activeArtistInfoTab);
  });
  // A Cover Art Archive tile with no art (404) or a dead Wikipedia photo falls back
  // instead of showing a broken-image icon. 'error' doesn't bubble, hence capture.
  el.aiBody.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains('ai-caa')) {
      img.classList.remove('ai-caa');
      const t = img.closest('.ai-album');
      img.src = placeholderArt({ artist: (t && t.dataset.title) || '?' });
    } else if (img.classList.contains('ai-wiki-img')) img.closest('.ai-hero').remove();
  }, true);
  el.aiAvatar.addEventListener('error', () => {
    if (el.aiAvatar.dataset.fallback) return;          // never loop
    el.aiAvatar.dataset.fallback = '1';
    const owned = state.activeArtistInfoTab ? aiOwned(state.activeArtistInfoTab) : [];
    el.aiAvatar.src = owned.length ? aiArtSrc(owned[0]) : placeholderArt({ artist: state.activeArtistInfoTab || '?' });
  });
}

// Opens a tab for the given artist — the actual entry point clicking an
// artist name (Album Quick Peek's own subtitle link) calls. Re-clicking an
// artist that already has a tab open just switches to the existing one
// rather than opening a duplicate, same as a browser not re-opening a
// page you already have a tab on just because you clicked its link again.
function openArtistInfoTab(artistName) {
  if (!state.artistInfoTabs.includes(artistName)) state.artistInfoTabs.push(artistName);
  state.activeArtistInfoTab = artistName;
  renderArtistInfoTabButtons();
  switchTab('artistInfo');
  renderArtistInfoTab();
}

// Closes one tab. If it was the active one, falls back to whichever tab
// sat just before it (or the first remaining one), matching how closing
// the active tab in a real browser usually lands you on its neighbor
// rather than some arbitrary other tab; with none left, drops back to the
// Music tab entirely rather than showing an empty Artist Information view.
function closeArtistInfoTab(artistName) {
  const idx = state.artistInfoTabs.indexOf(artistName);
  if (idx === -1) return;
  state.artistInfoTabs.splice(idx, 1);
  // activeArtistInfoTab is the LAST artist tab you were on, and stays set after you've gone off to
  // Diary or Stats. Closing it from there used to take the "I closed the tab I'm looking at" branch
  // and throw you to MUSIC; closing a background tab must leave you where you are, as in a browser.
  const wasShowing = state.activeTab === 'artistInfo' && state.activeArtistInfoTab === artistName;
  if (state.activeArtistInfoTab === artistName) {
    if (state.artistInfoTabs.length) {
      state.activeArtistInfoTab = state.artistInfoTabs[Math.max(0, idx - 1)];
      renderArtistInfoTabButtons();
      if (wasShowing) { switchTab('artistInfo'); renderArtistInfoTab(); }
      return;
    }
    state.activeArtistInfoTab = null;
    if (wasShowing) switchTab('albums');
  }
  renderArtistInfoTabButtons();
}

// Now Playing Bar's inline rendering when placed in Main instead of its
// default spot in Bottom — a simpler, read-only strip (no transport
// controls) rather than duplicating the full mini player, since that one
// is still what's actually driving playback regardless of where this
// element sits. Mirrors the mini player's own title/artist text and
// current art rather than maintaining a second source of truth for either.
// Now Playing Bar's inline rendering when placed in Main instead of its
// default spot in Bottom — a simpler, read-only strip (no transport
// controls) rather than duplicating the full mini player, since that one
// is still what's actually driving playback regardless of where this
// element sits. Track name is fixed (mirrors the mini player's own title,
// which is already correct for whichever of the three engines is
// playing); the two lines below it are genuinely configurable now — same
// state.fields.miniPlayer field slots and "Panel Settings…" already wired
// up for the docked mini player, reused here rather than inventing a
// second, separate field config for what's conceptually the same element
// just placed somewhere else. Was hardcoded to a single Artist-only line
// before, ignoring whatever was actually configured there — this was the
// actual gap behind "should be details about the actual track/artist,
// which can be set."
function refreshNowPlayingBarMain() {
  if (!el.nowPlayingBarMainElement || el.nowPlayingBarMainElement.hidden) return;
  const hasTrack = !!nowPlayingItem || (activePlayerEngine === 'spotify' && currentSpotifyTrack);
  if (!hasTrack) {
    el.nowPlayingBarMainTitle.textContent = 'Nothing playing right now';
    el.nowPlayingBarMainSub.textContent = '';
    el.nowPlayingBarMainSub2.textContent = '';
    { const x = el.nowPlayingBarMainSub2.parentElement.querySelector('.now-playing-bar-main-extra'); if (x) { x.innerHTML = ''; x.hidden = true; } }
    el.nowPlayingBarMainArt.removeAttribute('src');
    // An <img> with no src renders as a small blank/broken box rather than
    // just taking up no space — hide it outright in the "nothing playing"
    // state instead, same as Track Info's own art wrap does, rather than
    // leaving an empty square sitting there with nothing next to it.
    el.nowPlayingBarMainArt.hidden = true;
    return;
  }
  el.nowPlayingBarMainArt.hidden = false;
  el.nowPlayingBarMainTitle.textContent = el.miniPlayerTitle.textContent || '';
  const slots = (state.fields.miniPlayer || []).slice(0, 2);
  el.nowPlayingBarMainSub.textContent = miniPlayerFieldVal(slots[0]);
  el.nowPlayingBarMainSub2.textContent = miniPlayerFieldVal(slots[1]);
  {                                                                         // fields 3 and 4, as in the player (miniPlayerExtraHtml)
    let x = el.nowPlayingBarMainSub2.parentElement.querySelector('.now-playing-bar-main-extra');
    if (!x) { x = document.createElement('span'); x.className = el.nowPlayingBarMainSub2.className + ' now-playing-bar-main-extra'; el.nowPlayingBarMainSub2.insertAdjacentElement('afterend', x); }
    x.innerHTML = miniPlayerExtraHtml((state.fields.miniPlayer || []).slice(0, 4)); x.hidden = !x.innerHTML;
  }
  if (nowPlayingItem) {
    el.nowPlayingBarMainArt.dataset.key = artKey(nowPlayingItem);
    el.nowPlayingBarMainArt.src = state.artCache[artKey(nowPlayingItem)]?.art || placeholderArt(nowPlayingItem);
  } else if (currentSpotifyTrack?.album?.images?.[0]) {
    el.nowPlayingBarMainArt.dataset.key = '';
    el.nowPlayingBarMainArt.src = currentSpotifyTrack.album.images[0].url;
  }
}

// Single entry point covering all three panels — called at init and
// whenever the drag-and-drop layout config actually changes something
// (see renderLayoutConfigUI). The four pre-existing call sites for
// applyRightPanelSections() elsewhere (track/state changes that only ever
// needed the right panel refreshed, not the whole layout) are untouched.
function applyPanelLayout() {
  applyRightPanelSections();
  applyMainPanelLayout();
  applyPlayerControlsPosition();
}

// Currently-playing track details for the right panel — cover art (or,
// Currently-playing track details for the right panel — structured to
// match a reference screenshot: track title fixed at top, then compact
// "Label: Value" rows (state.fields.trackInfo, up to 4 — same "Panel
// Settings…" mechanism as every other configurable panel — ALWAYS
// showing the label even when a value is blank, same as the reference),
// then a fixed star-rating row, then cover art (or, toggled via
// applyTrackInfoPlayerMode, compact playback controls in that same slot)
// below all of it. Reuses miniPlayerFieldVal for field resolution — same
// fallback between nowPlayingItem (a real crate item) and
// currentSpotifyTrack (raw Spotify metadata, for something playing that
// isn't in the crate at all, e.g. via Spotify Connect from another
// device) the mini player itself uses — and el.miniPlayerTitle's own text
// for the title line specifically, since that's already kept correct for
// whichever of the three engines is actually playing, rather than
// re-deriving a track name from scratch here. Called from
// applyRightPanelSections (on init/section toggle) and refreshMiniPlayerMeta
// (every time a new track actually starts).
// Genre names that are links. A release's genre cell can hold several, comma-separated (see getGenreList); each becomes its own link
// to that genre's page. Names are escaped for both the text and the data attribute: a genre can contain quotes, & or <.
// One delegated click handler (initGenreLinks) serves every .genre-link on the page, so other places can use this too.
function genreLinksHtml(value) {
  return String(value || '').split(',').map(g => g.trim()).filter(Boolean)
    .map(g => `<a href="#" class="genre-link" data-genre="${escapeHtml(g)}" title="Open the ${escapeHtml(g)} genre page">${escapeHtml(g)}</a>`).join(', ');
}
function initGenreLinks() {
  // Capture phase: a genre link inside something clickable (the player's lines go to the artist or the track) opens the genre, not that.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.genre-link');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();          // it's href="#": don't jump the page
    if (el.albumQuickPeek && el.albumQuickPeek.contains(a)) closeAlbumQuickPeek();
    openGenreTab(a.dataset.genre);
  }, true);
  document.addEventListener('contextmenu', (e) => {    // right-click: the genre's menu (play, shuffle, export, match songs…)
    const a = e.target.closest && e.target.closest('.genre-link');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    openGenreContextMenu(a.dataset.genre, e.clientX, e.clientY);
  }, true);
}
function renderTrackInfoPanel() {
  if (!state.rightPanelShowTrackInfo) return;
  const hasTrack = !!nowPlayingItem || (activePlayerEngine === 'spotify' && currentSpotifyTrack);
  el.trackInfoEmpty.hidden = hasTrack;
  el.trackInfoTextWrap.hidden = !hasTrack;
  el.trackInfoArtWrap.hidden = !hasTrack;
  if (!hasTrack) return;

  if (nowPlayingItem) {
    el.trackInfoArt.dataset.key = artKey(nowPlayingItem);
    el.trackInfoArt.src = state.artCache[artKey(nowPlayingItem)]?.art || placeholderArt(nowPlayingItem);
  } else if (currentSpotifyTrack?.album?.images?.[0]) {
    // Something's playing that isn't linked to any crate item at all —
    // no artKey to cache against, so just point straight at Spotify's own
    // album art for it.
    el.trackInfoArt.dataset.key = '';
    el.trackInfoArt.src = currentSpotifyTrack.album.images[0].url;
  }

  el.trackInfoTitle.textContent = el.miniPlayerTitle.textContent || '';

  const fields = (state.fields.trackInfo || []).filter(k => k && k !== 'none');
  el.trackInfoFields.innerHTML = fields.map(key => `
    <div class="track-info-field">
      <span class="track-info-field-label">${escapeHtml(FIELD_OPTIONS[key] || '')}:</span>
      <span class="track-info-field-value">${key === 'genre' ? genreLinksHtml(miniPlayerFieldVal(key)) : escapeHtml(miniPlayerFieldVal(key))}</span>
    </div>
  `).join('');

  el.trackInfoRatingRow.innerHTML = nowPlayingItem ? starRatingHtml(nowPlayingItem.rating) : '';

  applyCachedArt();
  applyTrackInfoPlayerMode();
}

// Picks what shows in the Track Info art slot — cover art, playback
// progress, or an embedded video — and applies it. Video (⚙ → Panels
// configuration… → "Show video, if a YouTube link is available") wins
// whenever it's on AND nowPlayingYoutubeLink resolves to a real video ID;
// otherwise falls back to the existing art/progress toggle exactly as
// before. updateProgressUI (already-existing shared 500ms interval) drives
// the seek bar/time whenever progress mode is showing — no separate
// polling/state-tracking needed for that half.
// Track Info always shows cover art in that slot — the "show playback
// progress instead" / "show video instead" toggles were removed per an
// explicit "I don't want to see a player there" request, rather than just
// flipping their default off. Flipping a default wouldn't reliably have
// fixed this either: anyone who'd already toggled one on would have it
// sitting true in their own saved prefs regardless of what a fresh
// install defaults to. This resolves unconditionally instead of reading
// state.trackInfoShowPlayer/trackInfoShowVideo at all, so it can't recur
// from an old saved value. The underlying seek-bar/video-embed code
// (initTrackInfoSeek, the iframe mount, etc.) is left in place rather than
// torn out — harmless dead code now that nothing calls into it, and far
// lower-risk than also excising every interconnected piece of it.
function applyTrackInfoPlayerMode() {
  el.trackInfoVideoWrap.hidden = true;
  el.trackInfoArtWrap.classList.remove('showing-video');
  if (el.trackInfoVideoMount.dataset.videoId) {
    el.trackInfoVideoMount.dataset.videoId = '';
    el.trackInfoVideoMount.innerHTML = '';
  }
  el.trackInfoArt.hidden = false;
  el.trackInfoPlayerControls.hidden = true;
}

// Switches the Last.fm History layout (flat chronological vs grouped
// under a day header) — see renderLastfmHistoryPanel(). Separate from
// state.fields.lastfmHistory (which fields show per row, set via "Panel
// Settings…") — this is about grouping/structure, not content.
function setLastfmHistoryLayout(layout) {
  state.lastfmHistoryLayout = layout;
  savePrefs();
  el.historyLayoutChronoBtn.classList.toggle('active', layout !== 'byDay');
  el.historyLayoutByDayBtn.classList.toggle('active', layout === 'byDay');
  if (state.rightPanelShowHistory) renderLastfmHistoryPanel();
}

// Switches between a compact row list and a cover-art grid — full parity
// with the library's own List/Covers view concept, per request. Grid mode
// only ever shows the first configured field (state.fields.lastfmHistory[0])
// as its caption, same as the Add-album search grid cards — a 3-line
// layout doesn't fit under a small cover the way it does in a full-width row.
function setLastfmHistoryViewMode(viewMode) {
  state.lastfmHistoryViewMode = viewMode;
  savePrefs();
  el.historyViewListBtn.classList.toggle('active', viewMode !== 'grid');
  el.historyViewGridBtn.classList.toggle('active', viewMode === 'grid');
  if (state.rightPanelShowHistory) renderLastfmHistoryPanel();
}

function lastfmHistoryRowHtml(s) {
  const match = state.raw.find(r => r.row === s.row) || state.raw.find(r => r.artist === s.artist && r.title === s.title);
  const fields = state.fields.lastfmHistory || [];
  if (state.lastfmHistoryViewMode === 'grid') {
    const caption = fields[0] ? lastfmHistoryFieldVal(fields[0], s, match) : '';
    const sub = fields[1] ? lastfmHistoryFieldVal(fields[1], s, match) : '';
    return `
      <div class="right-history-grid-card"${match ? ` data-row="${escapeHtml(String(match.row))}"` : ''}>
        <img class="right-history-grid-thumb art" data-key="${match ? artKey(match) : ''}" alt="">
        <p class="right-history-grid-caption">${escapeHtml(caption)}</p>
        ${sub ? `<p class="right-history-grid-sub">${escapeHtml(sub)}</p>` : ''}
      </div>
    `;
  }
  const line1 = fields[0] ? lastfmHistoryFieldVal(fields[0], s, match) : '';
  const line2 = fields[1] ? lastfmHistoryFieldVal(fields[1], s, match) : '';
  const line3 = fields[2] ? lastfmHistoryFieldVal(fields[2], s, match) : '';
  return `
    <div class="right-history-row"${match ? ` data-row="${escapeHtml(String(match.row))}"` : ''}>
      <img class="right-history-thumb art" data-key="${match ? artKey(match) : ''}" alt="">
      <div class="right-history-info">
        <span class="right-history-title">${escapeHtml(line1)}</span>
        <span class="right-history-sub">${escapeHtml(line2)}</span>
      </div>
      <div class="right-history-meta">
        <span class="right-history-date">${escapeHtml(line3)}</span>
      </div>
    </div>
  `;
}

// Chronological Last.fm scrobble feed for the right panel — DAY-level only
// (most recent first), not time-of-day, since that's the actual
// granularity the Scrobbles sheet stores (one row per album/track/day with
// a play count — see fetchCatalog's state.scrobbles parsing) rather than a
// timestamp per individual play. Every scrobble row gets its own entry
// (not aggregated by album, unlike renderScrobbles()'s all-time totals on
// the Scrobbles tab) since the point here is a real history to scroll
// through, not a leaderboard. Three independently-customizable things:
// state.fields.lastfmHistory (which fields show — Panel Settings…),
// state.lastfmHistoryLayout (flat vs grouped-by-day — the ≡/⊟ toggle),
// and state.lastfmHistoryViewMode (list rows vs a cover grid — the ☰/▦
// toggle, full parity with the library's own List/Covers concept).
function renderLastfmHistoryPanel() {
  if (!state.scrobbles.length) {
    el.rightHistoryPanelBody.innerHTML = '<p class="queue-empty">No Last.fm history yet — import scrobbles via \u2699 \u2192 Import from Last.fm to see your listening history here.</p>';
    return;
  }
  const sorted = [...state.scrobbles].sort((a, b) => {
    if (a.day !== b.day) return b.day.localeCompare(a.day); // most recent day first
    return (a.artist + a.title + a.track).localeCompare(b.artist + b.title + b.track); // stable tiebreak — no time-of-day to sort by within the same day
  });
  const isGrid = state.lastfmHistoryViewMode === 'grid';
  const wrapGroup = items => isGrid ? `<div class="right-history-grid">${items.map(lastfmHistoryRowHtml).join('')}</div>` : items.map(lastfmHistoryRowHtml).join('');

  if (state.lastfmHistoryLayout === 'byDay') {
    const groups = [];
    sorted.forEach(s => {
      const last = groups[groups.length - 1];
      if (!last || last.day !== s.day) groups.push({ day: s.day, items: [s] });
      else last.items.push(s);
    });
    el.rightHistoryPanelBody.innerHTML = groups.map(g => `
      <div class="right-history-day-header">${escapeHtml(g.day ? new Date(g.day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date')}</div>
      ${wrapGroup(g.items)}
    `).join('');
  } else {
    el.rightHistoryPanelBody.innerHTML = wrapGroup(sorted);
  }

  el.rightHistoryPanelBody.querySelectorAll('.right-history-row[data-row], .right-history-grid-card[data-row]').forEach(rowEl => {
    const match = state.raw.find(r => String(r.row) === rowEl.dataset.row);
    if (!match) return;
    rowEl.classList.add('clickable');
    rowEl.addEventListener('click', () => { switchTab('albums'); openDeck(match); });
  });
  applyCachedArt();
}


// from the Spotify mini player's own queue popover (#queuePanel,
// refreshQueuePanel/queueRowHtml above), which only ever shows Spotify's
// native device queue and has no concept of a YouTube-only track. This is
// the one place that shows upcoming tracks regardless of which engine each
// will actually play on. Call it any time crateQueueList/crateQueueIndex
// change (playCrateQueueIndex, addToCrateQueue, playTracksNow,
// playPlaylistFromStart, clearCrateQueue).
// Dispatches to one of three queue display styles (state.queueViewMode,
// set via the "View" dropdown in Panels configuration… → right panel →
// Up Next — a separate control from "Customize Layout" since that button
// configures whichever style is currently active, not a style of its own):
//   'thumbnail'     — renderQueueThumbnailHtml: the original row style,
//                      now with a cover-art thumbnail per track. The
//                      simplest of the three — just the tracks queued/
//                      playing, each with a quick visual.
//   'trackDetail'   — renderQueueTrackDetailHtml: a real table, modeled
//                      directly on the main Tracks View's own "# and
//                      Track are always fixed, the rest are configurable
//                      columns" structure (trackHeaderColumns), scoped to
//                      a plain CSS grid rather than that view's full
//                      resizable-column machinery.
//   'releaseTracks' — renderQueueReleaseTracksHtml: modeled on the
//                      Playlist Explorer's own "Album and Tracks" view —
//                      a release header shown once, its tracks listed
//                      under it — applied here to the live queue instead
//                      of a saved playlist.
// All three emit the same .queue-row-clickable/data-queue-index
// convention, so the single click/keyboard handler at the bottom of this
// function works unchanged regardless of which style is showing.
function renderCrateQueuePanel() {
  if (!el.crateQueuePanelBody) return;
  const current = crateQueueIndex >= 0 ? crateQueueList[crateQueueIndex] : null;
  const upcomingAll = crateQueueList.slice(crateQueueIndex + 1);
  // Only the next QUEUE_PANEL_MAX_ROWS are drawn, with a line saying how many more there are: this panel is
  // redrawn on every track change, and thousands of rows (cover images and all) made each redraw slow.
  const upcoming = upcomingAll.length > QUEUE_PANEL_MAX_ROWS ? upcomingAll.slice(0, QUEUE_PANEL_MAX_ROWS) : upcomingAll;
  const pendingReleases = crateQueuePendingCount();

  // Only touch the Clear button's visibility if the queue section is
  // actually visible right now — otherwise this would un-hide it while
  // the queue is turned off just because it has content in the
  // background (see applyRightPanelSections, which owns that decision
  // whenever either checkbox is toggled).
  if (el.crateQueueClearBtn && state.rightPanelShowQueue) el.crateQueueClearBtn.hidden = !current && !upcomingAll.length && !pendingReleases;

  if (!current && !upcomingAll.length) {
    el.crateQueuePanelBody.innerHTML = pendingReleases ? '<p class="queue-panel-subheading">Loading…</p>' : '';
    return;
  }

  // The folded-in "something already playing" placeholder (see
  // addToCrateQueue) sits at crateQueueIndex 0 with item === null — it has
  // no real lookup behind it, so it's rendered but not made clickable.
  const currentIndex = current && current.item !== null ? crateQueueIndex : null;

  if (state.queueViewMode === 'trackDetail') el.crateQueuePanelBody.innerHTML = renderQueueTrackDetailHtml(current, upcoming, currentIndex);
  else if (state.queueViewMode === 'releaseTracks') el.crateQueuePanelBody.innerHTML = renderQueueReleaseTracksHtml(current, upcoming, currentIndex);
  else el.crateQueuePanelBody.innerHTML = renderQueueThumbnailHtml(current, upcoming, currentIndex);
  const moreTracks = upcomingAll.length - upcoming.length;
  if (moreTracks || pendingReleases) {
    const parts = [];
    if (moreTracks) parts.push(`${moreTracks.toLocaleString('en-US')} more track${moreTracks === 1 ? '' : 's'}`);
    if (pendingReleases) parts.push(`${pendingReleases.toLocaleString('en-US')} more release${pendingReleases === 1 ? '' : 's'} to come`);
    el.crateQueuePanelBody.insertAdjacentHTML('beforeend', `<p class="queue-panel-subheading queue-panel-more">+ ${parts.join(', ')}</p>`);
  }

  // Every row — the playing one and the placeholder too, which have no data-queue-index because they aren't
  // click-to-play — gets its position in crateQueueList, for the right-click menu. All three views emit exactly
  // one row per entry, in queue order (the playing one first when there is one), so a row's position is just
  // its place in the DOM; if a row count ever disagrees with the queue, positions are left off rather than guessed.
  const queueRows = [...el.crateQueuePanelBody.querySelectorAll('.queue-row, .queue-table-row:not(.queue-table-header), .queue-nested-track-row')];
  if (queueRows.length === (current ? 1 : 0) + upcoming.length) {
    let pos = current ? crateQueueIndex : crateQueueIndex + 1;
    queueRows.forEach(r => { r.dataset.queuePos = String(pos++); });
  }
  if (!el.crateQueuePanelBody.dataset.ctxBound) {
    el.crateQueuePanelBody.dataset.ctxBound = '1';
    el.crateQueuePanelBody.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-queue-pos]');
      if (!row) return;                                   // header / empty space: the browser's own menu
      const entry = crateQueueList[parseInt(row.dataset.queuePos, 10)];
      if (!entry) return;
      e.preventDefault();
      openQueueTrackContextMenu(entry, e.clientX, e.clientY);
      row.classList.add('queue-context-target');          // shows which row the open menu is about
    });
  }
  if (!el.crateQueuePanelBody.dataset.clickBound) {
    el.crateQueuePanelBody.dataset.clickBound = '1';
    const jumpToRow = (e) => {
      const row = e.target.closest('.queue-row-clickable');
      if (!row) return;
      const index = parseInt(row.dataset.queueIndex, 10);
      if (Number.isNaN(index)) return;
      playCrateQueueIndex(crateQueueId, index);
    };
    el.crateQueuePanelBody.addEventListener('click', jumpToRow);
    el.crateQueuePanelBody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!e.target.closest('.queue-row-clickable')) return;
      e.preventDefault();
      jumpToRow(e);
    });
  }
}

// "Track with Thumbnail" — see renderCrateQueuePanel's own dispatch
// comment. Same row shape/grouping-line logic (state.fields.queue) as
// this view always had, with a cover-art thumbnail added per track — the
// item without one (the folded-in "already playing" placeholder) gets a
// blank same-size spacer instead, so its row doesn't shift out of
// alignment with the ones around it (the exact same class of bug fixed
// for the genre-tree caret a few versions back).
function renderQueueThumbnailHtml(current, upcoming, currentIndex) {
  const rowHtml = (entry, isCurrent, index) => {
    const isSoundcloud = entry.track && entry.track.soundcloudLink ? true : (!entry.item && isCurrent && scPlayingForCrateQueue);
    const isYoutube = !isSoundcloud && (entry.item ? isManualAlbum(entry.item) : (isCurrent && ytPlayingForCrateQueue));
    const clickable = index !== null;
    const groupingParts = entry.item ? (state.fields.queue || []).map(k => trackColumnVal(k, entry.item, entry.track)).filter(Boolean) : [];
    const groupingLine = groupingParts.length ? escapeHtml(groupingParts.join(' · ')) : '&nbsp;';
    const sourceTitle = isSoundcloud ? 'Plays on SoundCloud' : (isYoutube ? 'Plays on YouTube' : 'Plays on Spotify');
    const sourceIcon = isSoundcloud ? '\u2601' : (isYoutube ? '\u25b6' : '\u266b');
    const thumbHtml = entry.item
      ? `<img class="queue-row-thumbnail art" data-key="${artKey(entry.item)}" src="${state.artCache[artKey(entry.item)]?.art || placeholderArt(entry.item)}" alt="">`
      : `<span class="queue-row-thumbnail queue-row-thumbnail-spacer" aria-hidden="true"></span>`;
    return `<div class="queue-row queue-row-thumb${isCurrent ? ' queue-row-current' : ''}${clickable ? ' queue-row-clickable' : ''}" ${clickable ? `data-queue-index="${index}" role="button" tabindex="0" title="Play this track"` : ''}>
      ${thumbHtml}
      <span class="crate-queue-source" title="${sourceTitle}">${sourceIcon}</span>
      <div class="queue-row-meta">
        <p class="queue-track-title">${escapeHtml(entry.track.trackName || '')}</p>
        <p class="queue-track-artist">${groupingLine}</p>
      </div>
    </div>`;
  };
  return (current ? `<p class="queue-panel-subheading">Now playing</p>${rowHtml(current, true, currentIndex)}` : '') +
    (upcoming.length
      ? `<p class="queue-panel-subheading">${current ? 'Up next' : 'Queued'}</p><div class="queue-list">${upcoming.map((e, i) => rowHtml(e, false, crateQueueIndex + 1 + i)).join('')}</div>`
      : '');
}

// "Track Detail" — see renderCrateQueuePanel's own dispatch comment. "#"
// (position in queue) and "Track" (name) are always shown, same fixed-
// column convention as the main Tracks View; state.fields.queueTrackDetail
// fills the rest, resolved through the same trackColumnVal() that view
// itself uses.
function renderQueueTrackDetailHtml(current, upcoming, currentIndex) {
  const cols = (state.fields.queueTrackDetail || []).filter(k => k && k !== 'none');
  const gridTemplate = `24px minmax(0,1.4fr) ${cols.map(() => 'minmax(0,1fr)').join(' ')}`;
  const headerHtml = `<div class="queue-table-row queue-table-header" style="grid-template-columns:${gridTemplate}">
    <span>#</span><span>Track</span>${cols.map(k => `<span>${escapeHtml(TRACK_COLUMN_LABELS[k] || '')}</span>`).join('')}
  </div>`;
  const rowHtml = (entry, isCurrent, index, num) => {
    const clickable = index !== null;
    return `<div class="queue-table-row${isCurrent ? ' queue-row-current' : ''}${clickable ? ' queue-row-clickable' : ''}" style="grid-template-columns:${gridTemplate}" ${clickable ? `data-queue-index="${index}" role="button" tabindex="0" title="Play this track"` : ''}>
      <span class="queue-table-num">${num}</span>
      <span class="queue-table-track">${escapeHtml(entry.track.trackName || '')}</span>
      ${cols.map(k => `<span>${entry.item ? escapeHtml(trackColumnVal(k, entry.item, entry.track) || '') : ''}</span>`).join('')}
    </div>`;
  };
  let n = 1;
  return headerHtml
    + (current ? rowHtml(current, true, currentIndex, n++) : '')
    + upcoming.map((e, i) => rowHtml(e, false, crateQueueIndex + 1 + i, n++)).join('');
}

// "Release and Tracks" — see renderCrateQueuePanel's own dispatch comment.
// Current + upcoming are treated as ONE continuous sequence for grouping
// (rather than kept in separate "Now playing"/"Up next" sections like the
// other two views), since the currently-playing track very often shares a
// release with whatever's queued right after it — grouping stops at
// exactly that boundary would fragment the one thing this view exists to
// show. Groups by each entry's item identity (artKey) — the folded-in
// "already playing" placeholder (item === null) never groups with
// anything, since it has no release of its own to group by. Release
// fields (state.fields.queueReleaseInfo) show once per group; track
// fields (state.fields.queueTrackInfoNested) repeat per track under it,
// with the track's own name always shown there regardless of what's
// configured, same fixed-vs-configurable split as every other view here.
function renderQueueReleaseTracksHtml(current, upcoming, currentIndex) {
  const all = [];
  if (current) all.push({ entry: current, isCurrent: true, index: currentIndex });
  upcoming.forEach((e, i) => all.push({ entry: e, isCurrent: false, index: crateQueueIndex + 1 + i }));

  const groups = [];
  all.forEach(row => {
    const key = row.entry.item ? artKey(row.entry.item) : null;
    const last = groups[groups.length - 1];
    if (key !== null && last && last.key === key) last.rows.push(row);
    else groups.push({ key, item: row.entry.item, rows: [row] });
  });

  const releaseFields = (state.fields.queueReleaseInfo || []).filter(k => k && k !== 'none');
  const trackFields = (state.fields.queueTrackInfoNested || []).filter(k => k && k !== 'none');

  return groups.map(group => {
    const releaseHeaderHtml = group.item ? `
      <div class="queue-release-header">
        <img class="queue-release-thumb art" data-key="${artKey(group.item)}" src="${state.artCache[artKey(group.item)]?.art || placeholderArt(group.item)}" alt="">
        <div class="queue-release-header-text">
          ${releaseFields.map(k => `<p class="queue-release-field">${escapeHtml(keyToVal(k, group.item) || '')}</p>`).join('') || '&nbsp;'}
        </div>
      </div>` : '';
    const tracksHtml = group.rows.map(({ entry, isCurrent, index }) => {
      const clickable = index !== null;
      const extraFields = entry.item ? trackFields.map(k => trackColumnVal(k, entry.item, entry.track)).filter(Boolean) : [];
      return `<div class="queue-nested-track-row${isCurrent ? ' queue-row-current' : ''}${clickable ? ' queue-row-clickable' : ''}" ${clickable ? `data-queue-index="${index}" role="button" tabindex="0" title="Play this track"` : ''}>
        <p class="queue-track-title">${escapeHtml(entry.track.trackName || '')}</p>
        ${extraFields.length ? `<p class="queue-track-artist">${escapeHtml(extraFields.join(' · '))}</p>` : ''}
      </div>`;
    }).join('');
    return `<div class="queue-release-group">${releaseHeaderHtml}<div class="queue-release-tracks">${tracksHtml}</div></div>`;
  }).join('');
}

// "Clear" button on the Up Next panel — stops the crate queue from
// advancing any further (bumping crateQueueId invalidates any in-flight
// lookup/advance) without touching whatever's currently playing.
function clearCrateQueue() {
  ++crateQueueId;
  crateQueuePending = null;
  crateQueueList = [];
  crateQueueIndex = -1;
  crateQueueExpectedSpotifyTrackId = null;
  ytPlayingForCrateQueue = false;
  scPlayingForCrateQueue = false;
  renderCrateQueuePanel();
}



// "Album and Tracks" view: each distinct album referenced by the playlist
// gets its own header + full tracklist, reusing the exact same
// buildAlbumTrackGroup() markup as the library's Album and Tracks view.
// Tracks are loaded with a dedicated loader (not loadTracksForList) so this
// never collides with the library's state.mainViewMode-guarded version.
function renderPlaylistAlbumTracksView(playlist, body) {
  const albums = [...new Map(
    playlist.items.map(it => playlistAlbumFor(it)).filter(Boolean).map(a => [a.row, a])
  ).values()];
  if (!albums.length) {
    body.innerHTML = '<p class="playlist-empty">Nothing here yet \u2014 right-click an album or track and choose \u201cAdd to playlist\u201d.</p>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'track-view';
  albums.forEach(album => wrap.appendChild(buildAlbumTrackGroup(album)));
  body.innerHTML = '';
  body.appendChild(wrap);
  applyCachedArt();
  loadTracksForPlaylistGroups(albums, wrap, playlist);
}

// Was showing every track off the ACTUAL album (via getTracksFor's normal
// full-tracklist lookup) regardless of which specific tracks were actually
// added to the playlist — if you'd only added 3 songs off a 12-track
// album, this view still showed all 12. Now filters down to just the
// playlist's own picks for that album, UNLESS the whole album was added
// as a single item (type: 'album'), in which case every track legitimately
// belongs and the full lookup is exactly right, same as before.
function loadTracksForPlaylistGroups(list, wrap, playlist) {
  const queue = list.slice();
  const concurrency = 3;
  let active = 0;
  function next() {
    if (queue.length === 0) return;
    if (active >= concurrency) return;
    const item = queue.shift();
    active++;
    getTracksFor(item).then(tracks => {
      const tw = wrap.querySelector(`[data-tracks-for="${item.row}"]`);
      if (!tw) return;

      const albumItems = playlist.items.filter(it => String(it.row) === String(item.row));
      const hasWholeAlbum = albumItems.some(it => it.type === 'album');
      const tracksToShow = hasWholeAlbum
        ? tracks
        : (() => {
            const wantedTrackNums = new Set(albumItems.filter(it => it.type === 'track').map(it => String(it.trackNum)));
            return tracks.filter(t => wantedTrackNums.has(String(t.trackNumber)));
          })();

      tw.innerHTML = tracksToShow.length ? tracksToShow.map((t, i) => `
        <div class="track-row" data-track-key="${item.row}::${t.trackNumber || i}">
          <span class="track-num">${t.trackNumber || ''}</span>
          <span class="track-name${rymBoldTrackClass(t)}">${escapeHtml(t.trackName || '')}</span>
          <span class="track-time">${formatDuration(t.trackTimeMillis)}</span>
        </div>
      `).join('') : '<p class="tracklist-status">No tracklist found for this release.</p>';
    }).finally(() => { active--; next(); });
    next();
  }
  for (let i = 0; i < concurrency; i++) next();
}

// "Album covers" view: a plain covers grid of every distinct album in the
// playlist, reusing the library's own card/grid builders so it looks and
// behaves identically (click to open the deck, right-click for the same
// context menu, Spotify/SoundCloud/RYM quick links, cached art). Now also
// respects state.groupBy (Group by menu, full parity with the library —
// see refreshViewMenuForContext) the exact same way renderGrid() does for
// the library's own Albums/Covers modes — grouped-by header + a
// buildGridSection() per group, or one ungrouped section when groupBy is
// 'none'.
function renderPlaylistCoversView(playlist, body) {
  gridEagerReset();
  const albums = [...new Map(
    playlist.items.map(it => playlistAlbumFor(it)).filter(Boolean).map(a => [a.row, a])
  ).values()];
  if (!albums.length) {
    body.innerHTML = '<p class="playlist-empty">Nothing here yet \u2014 right-click an album or track and choose \u201cAdd to playlist\u201d.</p>';
    return;
  }
  body.innerHTML = '';
  if (state.groupBy === 'none') {
    body.appendChild(buildGridSection(albums));
  } else {
    groupItems(albums, state.groupBy).forEach(g => {
      const header = document.createElement('h3');
      header.className = 'group-header';
      header.textContent = g.label + ' · ' + g.items.length;
      body.appendChild(header);
      // "Then by" secondary grouping — same nested pattern as renderGrid().
      if (state.groupBy2 !== 'none') {
        groupItems(g.items, state.groupBy2).forEach(g2 => {
          const subHeader = document.createElement('h4');
          subHeader.className = 'group-header group-header-sub';
          subHeader.textContent = g2.label + ' · ' + g2.items.length;
          body.appendChild(subHeader);
          body.appendChild(buildGridSection(g2.items));
        });
      } else {
        body.appendChild(buildGridSection(g.items));
      }
    });
  }
  applyCachedArt();
}

// "Artists" view: the playlist's distinct albums grouped by artist, using
// the same groupItems()/buildGridSection() pipeline the library's own
// Group by \u2192 Artist option uses.
function renderPlaylistArtistsView(playlist, body) {
  const albums = [...new Map(
    playlist.items.map(it => playlistAlbumFor(it)).filter(Boolean).map(a => [a.row, a])
  ).values()];
  if (!albums.length) {
    body.innerHTML = '<p class="playlist-empty">Nothing here yet \u2014 right-click an album or track and choose \u201cAdd to playlist\u201d.</p>';
    return;
  }
  body.innerHTML = '';
  groupItems(albums, 'artist').forEach(g => {
    const header = document.createElement('h3');
    header.className = 'group-header';
    header.textContent = g.label + ' \u00b7 ' + g.items.length;
    body.appendChild(header);
    body.appendChild(buildGridSection(g.items));
  });
  applyCachedArt();
}

// Native HTML5 drag-and-drop reorder. Reordering updates state.playlists
// (and re-renders) immediately for a snappy feel, then persists the new
// order to the sheet in the background — see reorderPlaylist in the
// backend, which just rewrites Position to match the given Id order.
function setupPlaylistItemDrag(listEl, playlist) {
  let dragSrcIdx = null;
  [...listEl.children].forEach(rowEl => {
    rowEl.addEventListener('dragstart', () => {
      dragSrcIdx = parseInt(rowEl.dataset.idx, 10);
      rowEl.classList.add('dragging');
    });
    rowEl.addEventListener('dragend', () => rowEl.classList.remove('dragging'));
    rowEl.addEventListener('dragover', (e) => { e.preventDefault(); });
    rowEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetIdx = parseInt(rowEl.dataset.idx, 10);
      if (dragSrcIdx === null || targetIdx === dragSrcIdx) return;
      const real = state.playlists.find(p => p.id === playlist.id) || playlist, items = real.items;          // (the real playlist, not the copy being shown)
      const [moved] = items.splice(dragSrcIdx, 1);
      items.splice(targetIdx, 0, moved);
      dragSrcIdx = null;
      renderPlaylistMainPanel();
      renderPlaylistSidebar();
      postUpdate({ action: 'reorderPlaylist', playlistId: playlist.id, itemIds: items.map(x => x.id) })
        .catch(() => flashGlobalToast('Couldn\u2019t save the new order \u2014 try again'));
    });
  });
}

async function removePlaylistItem(playlist, itemId) {
  return removePlaylistItemsByIds(playlist, [itemId]);
}

// Shared bulk remove — used by the single ✕ button in the default List
// view above, and by the "Remove from playlist" track/album context-menu
// actions below (see removeTracksFromActivePlaylist /
// removeAlbumFromActivePlaylist).
async function removePlaylistItemsByIds(playlist, itemIds) {
  if (!itemIds || !itemIds.length) return;
  { const real = state.playlists.find(p => p.id === playlist.id) || playlist; real.items = real.items.filter(it => !itemIds.includes(it.id)); }          // the real playlist, not the filtered copy being shown
  renderPlaylistMainPanel();
  renderPlaylistSidebar();
  try {
    await postUpdate({ action: 'removePlaylistItems', itemIds });
  } catch (e) {
    flashGlobalToast('Couldn\u2019t remove \u2014 try again');
    await fetchCatalog();
  }
}

// Resolves which of the *active* playlist's own items correspond to a set
// of right-clicked track rows (row + track number pairs, same shape
// openTrackContextMenu already builds for "Add to playlist"/"Add to
// queue"). A standalone 'track' playlist item matches by row+trackNum; a
// whole 'album' item has no track number of its own, so any track selected
// from that release resolves to (and removes) the whole album entry —
// there's no such thing as partially removing one track from a whole-album
// playlist entry. Prefers matching by albumId when both the crate item and
// the playlist item being compared have one (see playlistAlbumFor for why
// row alone isn't reliable) — degrades to the row-based match wherever
// either side predates that field, exactly as it always worked before.
function activePlaylistItemIdsForTracks(trackPlaylistItems) {
  const playlist = state.playlists.find(p => p.id === state.activePlaylistId);
  if (!playlist || !trackPlaylistItems || !trackPlaylistItems.length) return [];
  const wantedByRow = new Map();
  const wantedByAlbumId = new Map();
  trackPlaylistItems.forEach(t => {
    const trackNumKey = String(t.trackNum);
    if (t.albumId) {
      if (!wantedByAlbumId.has(t.albumId)) wantedByAlbumId.set(t.albumId, new Set());
      wantedByAlbumId.get(t.albumId).add(trackNumKey);
    }
    const rowKey = String(t.row);
    if (!wantedByRow.has(rowKey)) wantedByRow.set(rowKey, new Set());
    wantedByRow.get(rowKey).add(trackNumKey);
  });
  return playlist.items.filter(it => {
    if (it.albumId && wantedByAlbumId.has(it.albumId)) {
      if (it.type === 'album') return true;
      return wantedByAlbumId.get(it.albumId).has(String(it.trackNum));
    }
    const rowKey = String(it.row);
    if (!wantedByRow.has(rowKey)) return false;
    if (it.type === 'album') return true;
    return wantedByRow.get(rowKey).has(String(it.trackNum));
  }).map(it => it.id);
}

async function removeTracksFromActivePlaylist(trackPlaylistItems) {
  const playlist = state.playlists.find(p => p.id === state.activePlaylistId);
  const ids = activePlaylistItemIdsForTracks(trackPlaylistItems);
  if (!playlist || !ids.length) return;
  await removePlaylistItemsByIds(playlist, ids);
}

// Removes an entire release from the active playlist — whether it's there
// as a whole-album entry, one or more standalone tracks off it, or both.
// Prefers matching by albumId when both sides have one, same reasoning as
// activePlaylistItemIdsForTracks above.
async function removeAlbumFromActivePlaylist(item) {
  const playlist = state.playlists.find(p => p.id === state.activePlaylistId);
  if (!playlist) return;
  const ids = playlist.items.filter(it =>
    (item.albumId && it.albumId) ? it.albumId === item.albumId : String(it.row) === String(item.row)
  ).map(it => it.id);
  if (!ids.length) return;
  await removePlaylistItemsByIds(playlist, ids);
}

function onPlaylistDeleteClick(btn, playlist) {
  if (btn.classList.contains('confirm')) {
    deletePlaylistDirect(playlist);
    return;
  }
  btn.classList.add('confirm');
  btn.textContent = 'Click again to confirm';
  clearTimeout(playlistDeleteConfirmTimeout);
  playlistDeleteConfirmTimeout = setTimeout(() => {
    if (btn.isConnected) { btn.classList.remove('confirm'); btn.textContent = 'Delete playlist'; }
  }, 3000);
}

async function deletePlaylistDirect(playlist) {
  clearTimeout(playlistDeleteConfirmTimeout);
  try {
    await postUpdate({ action: 'deletePlaylist', playlistId: playlist.id });
    state.activePlaylistId = null;
    await fetchCatalog();
  } catch (e) {
    flashGlobalToast('Couldn\u2019t delete this playlist \u2014 try again');
  }
}

/* Playlist create/rename modal — shares the same simple overlay pattern as
   the Add/Edit album modals. */
function openPlaylistModal(mode, playlist, pendingItems) {
  playlistModalMode = mode;
  playlistModalEditingId = playlist ? playlist.id : null;
  pendingPlaylistAddItems = pendingItems || null;
  el.playlistModalHeading.textContent = mode === 'rename' ? 'Edit playlist' : 'New playlist';
  el.playlistNameInput.value = playlist ? playlist.name : '';
  el.playlistDescInput.value = playlist ? playlist.description : '';
  el.playlistModalToast.textContent = '';
  el.playlistModalOverlay.hidden = false;
  setTimeout(() => el.playlistNameInput.focus(), 0);
}
function closePlaylistModal() {
  el.playlistModalOverlay.hidden = true;
  pendingPlaylistAddItems = null;
}
async function savePlaylistModalClick() {
  const name = el.playlistNameInput.value.trim();
  if (!name) { el.playlistModalToast.textContent = 'Give it a name first'; return; }
  const description = el.playlistDescInput.value.trim();

  el.playlistModalSaveBtn.disabled = true;
  try {
    if (playlistModalMode === 'rename' && playlistModalEditingId) {
      await postUpdate({ action: 'renamePlaylist', playlistId: playlistModalEditingId, name, description });
      const editingId = playlistModalEditingId;
      closePlaylistModal();
      await fetchCatalog();
      openPlaylist(editingId);
    } else {
      const res = await postUpdate({ action: 'createPlaylist', name, description });
      const newId = res && res.id;
      if (newId && pendingPlaylistAddItems && pendingPlaylistAddItems.length) {
        // Same (row, trackNum) dedupe as openAddToPlaylistSubmenu — see its
        // comment for why.
        const seen = new Set();
        const dedupedItems = pendingPlaylistAddItems.filter(it => {
          const key = `${it.itemType}::${it.row}::${it.trackNum}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        await postUpdate({ action: 'addPlaylistItems', playlistId: newId, items: dedupedItems });
      }
      closePlaylistModal();
      await fetchCatalog();
      if (newId) { switchTab('albums'); openPlaylist(newId); }
      flashGlobalToast(`Created "${name}"`);
    }
  } catch (e) {
    el.playlistModalToast.textContent = 'Couldn\u2019t save \u2014 try again';
  } finally {
    el.playlistModalSaveBtn.disabled = false;
  }
}

/* "Add to playlist" flyout — a hover/tap submenu shared by the album card
   context menu and the track context menu (see openAlbumCardContextMenu /
   openTrackContextMenu), same pattern as openAlbumSearchSubmenu. `items` is
   the array of {itemType,row,trackNum,trackName} to add if a playlist
   (existing, or brand new via "+ New playlist…") is picked. */
let addToPlaylistSubmenuEl = null;
let addToPlaylistSubmenuCloseTimer = null;

function openAddToPlaylistSubmenu(anchorEl, items) {
  clearTimeout(addToPlaylistSubmenuCloseTimer);
  closeAddToPlaylistSubmenu();

  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu album-search-submenu';
  const existingHtml = state.playlists.map(p =>
    `<button type="button" data-playlist-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`
  ).join('');
  menu.innerHTML = `
    ${existingHtml}
    ${state.playlists.length ? '<div class="menu-divider"></div>' : ''}
    <button type="button" data-playlist-id="__new__">+ New playlist\u2026</button>
  `;
  document.body.appendChild(menu);

  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${rect.right + 2}px`;
  menu.style.top = `${rect.top}px`;
  requestAnimationFrame(() => {
    if (!addToPlaylistSubmenuEl) return; // closed again before this ran
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) menu.style.left = `${Math.max(4, rect.left - menuRect.width - 2)}px`;
    if (menuRect.bottom > window.innerHeight) menu.style.top = `${Math.max(4, window.innerHeight - menuRect.height - 4)}px`;
  });

  menu.addEventListener('mouseenter', () => clearTimeout(addToPlaylistSubmenuCloseTimer));
  menu.addEventListener('mouseleave', scheduleCloseAddToPlaylistSubmenu);

  let submenuActionTaken = false; // guards against a fast double-click (or a click landing while
                                   // this menu is already mid-close) firing addPlaylistItems twice
  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-playlist-id]');
    if (!btn) return;
    if (submenuActionTaken) return;
    submenuActionTaken = true;
    const playlistId = btn.dataset.playlistId;

    if (playlistId === '__new__') {
      closeNowPlayingAddMenu(); // also closes this submenu
      openPlaylistModal('create', null, items);
      return;
    }
    closeNowPlayingAddMenu();
    try {
      // Deduped by (row, trackNum) in case a selection ever ends up
      // listing the same track more than once — belt-and-braces alongside
      // submenuActionTaken above, both there to keep a single "Add to
      // playlist" action from ever resulting in more than one item per
      // track server-side.
      const seen = new Set();
      const dedupedItems = (items || []).filter(it => {
        const key = `${it.itemType}::${it.row}::${it.trackNum}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      await postUpdate({ action: 'addPlaylistItems', playlistId, items: dedupedItems });
      flashGlobalToast('Added to playlist');
      if (state.activeTab === 'albums') await fetchCatalog();
    } catch (err) {
      flashGlobalToast('Couldn\u2019t add to playlist \u2014 try again');
    }
  });

  addToPlaylistSubmenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeAddToPlaylistSubmenuOnOutsideClick), 0);
}
function closeAddToPlaylistSubmenuOnOutsideClick(e) {
  if (addToPlaylistSubmenuEl && !addToPlaylistSubmenuEl.contains(e.target)) closeAddToPlaylistSubmenu();
}
function scheduleCloseAddToPlaylistSubmenu() {
  clearTimeout(addToPlaylistSubmenuCloseTimer);
  addToPlaylistSubmenuCloseTimer = setTimeout(closeAddToPlaylistSubmenu, 220);
}
function closeAddToPlaylistSubmenu() {
  if (addToPlaylistSubmenuEl) { addToPlaylistSubmenuEl.remove(); addToPlaylistSubmenuEl = null; }
  clearTimeout(addToPlaylistSubmenuCloseTimer);
  document.removeEventListener('click', closeAddToPlaylistSubmenuOnOutsideClick);
}
