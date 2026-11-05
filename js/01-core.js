// CRATE — version, config, state, element lookup, RYM history and ratings basics, tracklist basics.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* Bump this with every deploy — it's what actually gets printed to the
   console and shown on-site (⚙ Layout menu). MUST match CURRENT_VERSION
   in the maintenance log comment at the very top of this file — see the
   instruction there. */
const APP_VERSION = '1.85.5';
console.log('%c[CRATE] build v' + APP_VERSION, 'font-weight:bold;font-size:14px;color:#1DB954');

/* Declared first so they're available before init()/handleSpotifyAuthRedirect()
   run on page load further down this script (was previously declared much later,
   causing a temporal-dead-zone ReferenceError on load). */
const SPOTIFY_PLAYBACK_SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
// Tiny neutral placeholder so missing/blank Spotify artwork never falls back
// to the browser's broken-image glyph (a src="" is still a request that
// fails and renders that icon).
const NO_ART_FALLBACK = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#1F2530"/></svg>');
// Long multi-artist joins ("A, B, C, D…") wrap ugly and truncate mid-word in
// tight spaces — keep the first couple of names and count the rest instead.
function formatArtistNames(artists, max) {
  max = max || 2;
  const names = (artists || []).map(a => a.name).filter(Boolean);
  if (names.length <= max) return names.join(', ');
  return names.slice(0, max).join(', ') + ` +${names.length - max}`;
}
const SPOTIFY_USER_TOKENS_KEY = 'crate_spotify_user_tokens_v1';
const SPOTIFY_PLAYER_PREFS_KEY = 'crate_spotify_player_prefs_v1';
const YT_PLAYER_PREFS_KEY = 'crate_yt_player_prefs_v1';
const SC_PLAYER_PREFS_KEY = 'crate_sc_player_prefs_v1';
const SPOTIFY_PKCE_VERIFIER_KEY = 'crate_spotify_pkce_verifier';
const SPOTIFY_PKCE_STATE_KEY = 'crate_spotify_pkce_state';
// Moved up next to the other pre-init() constants above (was previously
// declared down with the rest of the Map code, at its original usage site) —
// bindEvents() calls applyMapWindowPrefs()->isMapMobileLayout() synchronously
// during startApp()'s initial init(), long before script execution reaches
// the Map section further down, so a `const` declared only there was in its
// temporal dead zone at that point: "ReferenceError: Cannot access
// 'MAP_MOBILE_BREAKPOINT_QUERY' before initialization", thrown out of
// init() and aborting it before it ever reached fetchCatalog() — which is
// why the catalogue "loaded" with 0 albums and no error shown anywhere.
// Single source of truth shared with the matching CSS media query, so
// mobile-layout detection here and the stylesheet's cutoff never drift.
const MAP_MOBILE_BREAKPOINT_QUERY = '(max-width: 700px)';
// Same reasoning as the two consts above, one more time: fetchCatalog() is
// called synchronously (via init()'s `await fetchCatalog()`, reached with no
// preceding await) as part of the exact same startApp() chain, and its very
// first lines check/set this flag before doing anything else. A `let`
// declared only right above the function itself further down the file was
// therefore also in its own temporal dead zone at call time —
// "ReferenceError: Cannot access 'fetchCatalogInFlight' before
// initialization" — which, same as the others, aborted init() before
// fetchCatalog() could do anything, well before this flag would ever
// meaningfully matter (it only guards against a second, overlapping call).
// This one isn't gated behind any mobile-only condition like the two above,
// so it likely would have surfaced on desktop too once the earlier two
// stopped masking it by crashing first.
let fetchCatalogInFlight = false;
// Same reasoning, same fix, one const over: bindEvents() also calls
// initMobileDrawers()/initMobileOverflowMenu() synchronously, which read
// MOBILE_DRAWER_BREAKPOINT_QUERY and MOBILE_OVERFLOW_ACTIONS respectively.
// Both were declared far later in the file (in the "Mobile nav/queue
// drawers" and "Topbar overflow menu" sections) and were still in their own
// temporal dead zone at the moment bindEvents() actually ran, throwing a
// second, near-identical ReferenceError right after the Map one above got
// fixed. Moved both up here for the same reason.
const MOBILE_DRAWER_BREAKPOINT_QUERY = '(max-width: 900px)';
const MOBILE_OVERFLOW_ACTIONS = [
  { id: 'listenedFilterBtn', label: 'Listened filter' },
  { id: 'addAlbumBtn', label: 'Add album' },
  { id: 'refreshBtn', label: 'Refresh from sheet' },
  { id: 'timelineBtn', label: 'Timeline viewer' },
  { id: 'mapBtn', label: 'Map viewer' }
];
const SPOTIFY_CREDS_KEY = 'crate_spotify_creds_v1';
const DISCOGS_TOKEN_KEY = 'crate_discogs_token_v1';
const LASTFM_SCROBBLE_CREDS_KEY = 'crate_lastfm_scrobble_creds_v1'; // { apiKey, sharedSecret }
const LASTFM_SCROBBLE_SESSION_KEY = 'crate_lastfm_scrobble_session_v1'; // { sessionKey, username }
const LASTFM_PENDING_TOKEN_KEY = 'crate_lastfm_pending_token_v1'; // { token, requestedAt } — mid-way through auth.getToken -> user approves on last.fm -> auth.getSession
const YOUTUBE_API_KEY_KEY = 'crate_youtube_api_key_v1';
const COVERAGE_CACHE_KEY = 'crate_coverage_cache_v1';
// Map viewer (see openMapModal): resolved lat/lon per Location string,
// keyed lowercase/trimmed. A cached value of null means that string was
// already looked up and Nominatim couldn't place it — kept as null (not
// just omitted) so a bad location doesn't get re-queried on every open.
const GEOCODE_CACHE_KEY = 'crate_geocode_cache_v1';
// How long a cached "N of T" lookup stays valid before it's refetched.
// Long enough that opening the app doesn't re-hit MusicBrainz for
// everything every time; short enough that a newly-released album/EP
// eventually gets picked up instead of the count going stale forever.
const COVERAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ================= CONFIG =================
   Paste the Web App URL you get after deploying apps-script-backend.gs.
   Everything else in this file works as-is once this is set. */
const CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzQ3a4q67jIr3kRjlekx596Lgwnl8YYil3wX9olaTQJJ_ghGwDfdooMZ7KSCuwwzRE/exec',
  // OAuth 2.0 "Web application" Client ID from Google Cloud Console
  // (APIs & Services → Credentials). Used only for Sign in with Google —
  // it's not a secret itself, but the app won't gate anything until this
  // is set and apps-script-backend.gs is checking tokens against it.
  GOOGLE_CLIENT_ID: '32599125234-i1puq1t7mc9bmmh2634sr3bsdo5t4oen.apps.googleusercontent.com'
};
/* ============================================ */

const PREF_KEY = 'crate_prefs_slot_v1';

// Which fields show in the "Add a release" form — see ⚙ → Panels
// configuration… → "add a release", applyAddFormFieldVisibility(). Every
// field wrapper in the form itself carries a matching data-add-field
// attribute (see the HTML) so this stays purely declarative — no per-field
// show/hide code to maintain as fields get added or removed.
// BEGIN rym-hist-core
// ---- The history of a release's RYM rating: [[time in ms, average, how many ratings], ...], oldest first ----
// A new point is kept when the average CHANGES, or the number of ratings has moved by 5% or more (RYM's count creeps up all the time while its
// average hardly moves, so logging every tick would bury the signal). At most one point per (UTC) day: a later reading the same day replaces
// that day's point. At most `cap` points: past that the second-oldest go first, so the very first reading and the recent ones stay.
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
function rymHistSummary(hist, now) {                         // what to say about it
  const h = rymHistNorm(hist); if (!h.length) return null;
  const first = h[0], last = h[h.length - 1], t = now || Date.now();
  const ref = h.filter(p => p[0] <= t - 90 * RYM_DAY_MS).pop() || null;                      // the reading nearest to (and not after) 90 days ago
  return { count: h.length, first: { t: first[0], a: first[1], n: first[2] }, last: { t: last[0], a: last[1], n: last[2] }, delta: Math.round((last[1] - first[1]) * 100) / 100,
    days: Math.round((last[0] - first[0]) / RYM_DAY_MS), d90: ref ? { t: ref[0], a: ref[1], delta: Math.round((last[1] - ref[1]) * 100) / 100 } : null };
}
function rymHistSvg(hist, w, h) {                            // a small line chart: average against time (self-contained SVG, colours from CSS)
  const pts = rymHistNorm(hist); if (!pts.length) return '';
  const W = w || 280, H = h || 76, L = 30, R = 8, T = 8, B = 16, t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1])); if (hi - lo < 0.2) { const mid = (hi + lo) / 2; lo = mid - 0.1; hi = mid + 0.1; } else { const pad = (hi - lo) * 0.12; lo -= pad; hi += pad; }
  const X = (t) => t1 === t0 ? (L + (W - L - R) / 2) : L + (t - t0) / (t1 - t0) * (W - L - R), Y = (a) => T + (hi - a) / (hi - lo) * (H - T - B);
  const f = (v) => Math.round(v * 10) / 10, day = (t) => new Date(t).toISOString().slice(0, 10);
  const line = pts.length > 1 ? `<polyline fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" points="${pts.map(p => f(X(p[0])) + ',' + f(Y(p[1]))).join(' ')}"/>` : '';
  const dots = pts.map(p => `<circle cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="2.6" fill="currentColor"><title>${day(p[0])}: ${p[1].toFixed(2)}${p[2] ? ' (' + p[2].toLocaleString('en-US') + ' ratings)' : ''}</title></circle>`).join('');
  const lab = (a, y) => `<text x="${L - 4}" y="${f(y + 3)}" text-anchor="end" font-size="9" fill="currentColor" opacity=".6">${a.toFixed(2)}</text>`;
  const dates = `<text x="${L}" y="${H - 3}" font-size="9" fill="currentColor" opacity=".6">${day(t0)}</text>` + (t1 > t0 ? `<text x="${W - R}" y="${H - 3}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${day(t1)}</text>` : '');
  return `<svg class="rym-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="RYM rating over time, ${pts.length} reading${pts.length === 1 ? '' : 's'}">${lab(hi, T)}${lab(lo, H - B)}${line}${dots}${dates}</svg>`;
}
// END rym-hist-core

// BEGIN rym-hist-data
// ---- the record of a rating's changes: kept in this browser too, until the sheet confirms it (an Apps Script from before this feature ignores the field) ----
const RYM_HIST_LOCAL_KEY = 'crate_rym_hist_v1';
let rymHistLocalCache = null;
function rymHistLocalAll() { if (!rymHistLocalCache) { try { const o = JSON.parse(localStorage.getItem(RYM_HIST_LOCAL_KEY) || '{}'); rymHistLocalCache = o && typeof o === 'object' ? o : {}; } catch (e) { rymHistLocalCache = {}; } } return rymHistLocalCache; }
function rymHistLocalSave() { try { localStorage.setItem(RYM_HIST_LOCAL_KEY, JSON.stringify(rymHistLocalCache || {})); } catch (e) { /* not kept */ } }
function rymHistLocalSet(item) { const all = rymHistLocalAll(), k = artKey(item); if (item.rymHist && item.rymHist.length) all[k] = item.rymHist; else delete all[k]; rymHistLocalSave(); }
function rymHistLocalClear(item) { const all = rymHistLocalAll(), k = artKey(item); if (all[k]) { delete all[k]; rymHistLocalSave(); } }
function rymParseHist(v) { if (!v) return []; try { return rymHistNorm(JSON.parse(String(v))); } catch (e) { return []; } }
function rymMergeHistLocal() {                                    // on load: whatever the copy kept here has that the sheet doesn't is joined to it, and sent when the backend can take it
  const all = rymHistLocalAll(); let flush = false;
  (state.raw || []).forEach(it => {
    it.rymHist = rymHistNorm(it.rymHist);
    const l = all[artKey(it)]; if (!l) return;
    const merged = rymHistMerge([it.rymHist, l]);
    if (rymHistSame(merged, it.rymHist)) { delete all[artKey(it)]; return; }          // the sheet already has all of it
    it.rymHist = merged; it._rymHistLocal = true; flush = true;
  });
  rymHistLocalSave();
  if (flush && state.backendRymHist) rymFlushHist();
}
function rymFlushHist() { const list = (state.raw || []).filter(it => it._rymHistLocal && it.rymHist && it.rymHist.length).map(it => ({ item: it, hist: it.rymHist })); if (list.length) rymSaveHistBatch(list); }
async function rymSaveHistBatch(list) {                           // [{ item, hist }]: history only, no rating touched
  list.forEach(u => { u.item.rymHist = u.hist; rymHistLocalSet(u.item); u.item._rymHistLocal = true; });
  rymRefreshViews();
  for (let i = 0; i < list.length; i += 100) {
    const part = list.slice(i, i + 100);
    try { const d = await postUpdate({ action: 'setRymRatings', items: part.map(u => ({ row: u.item.row, rymHistory: JSON.stringify(u.hist) })) });
      if (d && d.histSaved) { part.forEach(u => { rymHistLocalClear(u.item); u.item._rymHistLocal = false; }); state.backendRymHist = true; } else state.backendRymHist = false; }
    catch (e) { /* kept here, sent next time */ }
  }
}
function rymPaintHist(item) {                                     // the album page's history: a line chart, the change, and the readings
  const box = rymEl('deckRymHist'); if (!box) return;
  const h = rymHistNorm(item && item.rymHist); box.hidden = h.length === 0; if (!h.length) return;
  const S = rymHistSummary(h), day = (t) => rymDateText(new Date(t).toISOString());
  const move = S.count < 2 ? 'one reading, ' + day(S.last.t) : (S.delta > 0 ? '+' : S.delta < 0 ? '\u2212' : '\u00b1') + Math.abs(S.delta).toFixed(2) + ' since ' + day(S.first.t);
  rymEl('deckRymHistSum').textContent = `RYM history \u00b7 ${S.count} reading${S.count === 1 ? '' : 's'} \u00b7 ${move}`;
  const rows = h.slice().reverse().slice(0, 15).map(pt => `<tr><td>${escapeHtml(day(pt[0]))}</td><td>${pt[1].toFixed(2)}</td><td>${pt[2] ? pt[2].toLocaleString() : '\u2014'}</td></tr>`).join('');
  const d90 = S.d90 ? `<p class="rym-hist-line">${S.d90.delta === 0 ? 'No change' : (S.d90.delta > 0 ? 'Up ' : 'Down ') + Math.abs(S.d90.delta).toFixed(2)} since ${escapeHtml(day(S.d90.t))}, the reading about 90 days ago or earlier.</p>` : '';
  rymEl('deckRymHistBody').innerHTML = rymHistSvg(h, 280, 76) + d90 + `<table class="rym-hist-table"><thead><tr><th>Date</th><th>RYM average</th><th>Ratings</th></tr></thead><tbody>${rows}</tbody></table>` + (h.length > 15 ? `<p class="rym-hist-line">The latest 15 of ${h.length} readings.</p>` : '');
}
// END rym-hist-data

// BEGIN rym-core
// ---- RYM ratings: the pure parts (no page, no storage), so they can be tested on their own ----
// A release's RYM rating is a number from 0.01 to 5 (0 / blank = none). It comes from two places and remembers which:
//   'm' = typed by you: never overwritten by anything automatic.   'a' = copied by the browser add-on while you browse RYM: refreshed when RYM's average moves.
function rymNum(v) { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 && n <= 5 ? Math.round(n * 100) / 100 : 0; }
// A count (how many ratings; also used for a rank) as a whole number. Reads "7,000", "7.000", "7 000", and RYM's shortened "6k" / "6.1k" / "1.2m"
// (before 1.63.0, "6k" was read as 6 and "7.000" as 7).
function rymVotesNum(v) {
  if (typeof v === 'number') return isFinite(v) && v > 0 ? Math.min(Math.round(v), 1e9) : 0;
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const m = /(\d{1,3}(?:[,.\u202f\u00a0 ]\d{3})+|\d+(?:[.,]\d+)?)(?:\s?([kKmM])(?![a-zA-Z]))?/.exec(t); if (!m) return 0;
  const n = m[2] ? Math.round(parseFloat(m[1].replace(',', '.')) * (/k/i.test(m[2]) ? 1e3 : 1e6)) : /^\d+[.,]\d{1,2}$/.test(m[1]) ? parseInt(m[1], 10) : parseInt(m[1].replace(/\D/g, ''), 10);
  return isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0;
}
function rymPathOfUrl(u) {                                  // "https://rateyourmusic.com/release/album/yes/fragile/?x" -> "/release/album/yes/fragile"
  let p = String(u == null ? '' : u).trim(); if (!p) return '';
  try { p = new URL(p, 'https://rateyourmusic.com/').pathname; } catch (e) { return ''; }
  try { p = decodeURIComponent(p); } catch (e) { /* keep as is */ }
  p = p.toLowerCase().replace(/\/+$/, '');
  return /^\/release\/[a-z0-9_-]+\/[^\/]+\/[^\/]+$/.test(p) ? p : '';
}
const RYM_TYPE_GROUPS = { album: 'album', lp: 'album', live: 'album', ep: 'ep', single: 'single', comp: 'comp', compilation: 'comp', mixtape: 'mixtape', musicvideo: 'video', video: 'video', djmix: 'djmix', bootleg: 'bootleg' };
function rymTypeGroup(t) { const s = String(t == null ? '' : t).toLowerCase().replace(/[^a-z]+/g, ''); return !s || s === 'unknown' ? '' : (RYM_TYPE_GROUPS[s] || s); }
function rymTypeOfPath(p) { const m = /^\/release\/([a-z0-9_-]+)\//.exec(String(p || '')); return m ? rymTypeGroup(m[1]) : ''; }
function rymYearOf(d) { const m = /^(\d{4})/.exec(String(d == null ? '' : d).trim()); return m ? m[1] : ''; }
function rymBuildIndex(items, keyFn) {                      // so thousands of entries can be matched without scanning the whole crate for each
  const byPath = new Map(), byKey = new Map();
  (items || []).forEach(it => {
    const p = rymPathOfUrl(it.rymLink); if (p && !byPath.has(p)) byPath.set(p, it);
    const k = keyFn(it.artist, it.title); if (!k) return; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(it);
  });
  return { byPath, byKey, keyFn };
}
// entry: { p: rym path, ar: artist, ti: title, ty: type, y: year }.  -> { item, how: 'link' | 'title' } | { ambiguous: true } | null
function rymMatchEntry(index, entry) {
  const p = rymPathOfUrl(entry.p);
  if (p && index.byPath.has(p)) return { item: index.byPath.get(p), how: 'link' };                    // the saved RYM address is certain
  if (!entry.ar || !entry.ti) return null;
  const cands = (index.byKey.get(index.keyFn(entry.ar, entry.ti)) || []).filter(it => {
    const et = rymTypeGroup(entry.ty) || rymTypeOfPath(p), it2 = rymTypeGroup(it.type);
    if (et && it2 && et !== it2) return false;                                                             // an album is not its single or its video
    const ey = rymYearOf(entry.y), iy = rymYearOf(it.releaseDate);
    return !(ey && iy && ey !== iy);
  });
  if (!cands.length) return null; if (cands.length > 1) return { ambiguous: true };
  return { item: cands[0], how: 'title' };
}
// What to do with a batch of entries (newest first wins per release). Never touches a rating you typed.
function rymPlan(index, entries, now) {
  const out = { updates: [], histOnly: [], ranks: [], skippedManual: 0, ambiguous: 0, unmatched: 0, unchanged: 0 }, best = new Map();
  (entries || []).forEach(e => {
    const rating = rymNum(e.a); if (!rating) return;
    const m = rymMatchEntry(index, e); if (!m) { out.unmatched++; return; } if (m.ambiguous) { out.ambiguous++; return; }
    // A page that showed no count, or a shortened one ("6k", add-on 1.12.5 says how rough: e.u) that the exact count already saved fits, leaves that count alone:
    // before 1.63.0 the count flipped between the real number and blank as you browsed release pages and lists.
    let votes = rymVotesNum(e.n); const have = m.item.rymVotes || 0;
    if (have && (!votes || (Number(e.u) > 0 && Math.abs(have - votes) <= Number(e.u) / 2))) votes = have;
    if (have >= 100 && votes && votes * 50 < have && !(Number(e.u) > 0)) votes = have;          // an older add-on read "6k" as 6: a count never really falls by 98%
    const prev = best.get(m.item); if (!prev || (e.t || 0) >= (prev.t || 0)) best.set(m.item, { item: m.item, rating, votes, rank: rymVotesNum(e.k), how: m.how, t: e.t || 0, h: e.h });
  });
  best.forEach(b => {
    if (b.rank > 0 && b.rank !== (b.item.rymRank || 0)) out.ranks.push({ item: b.item, rank: b.rank });          // a rank is a fact about RYM, saved even where a rating you typed is left alone
    // The history: the add-on's own trail (which already ends with this reading) joined to what the release already has. An add-on with no trail gives just this reading.
    // It is kept even for a rating you typed (that rating is left alone, but what RYM said still goes in the record).
    const have = rymHistNorm(b.item.rymHist), trail = Array.isArray(b.h) && b.h.length ? b.h : null;
    let hist = rymHistMerge([have, trail || []]);
    if (!trail) hist = rymHistRecord(hist, [b.t || now || Date.now(), b.rating, b.votes]).hist;
    const histChanged = !rymHistSame(hist, have); let rated = false;
    if (b.item.rymSrc === 'm' && b.item.rymRating) out.skippedManual++;
    else if (b.item.rymRating === b.rating && (b.item.rymVotes || 0) === b.votes) out.unchanged++;
    else { out.updates.push({ item: b.item, rating: b.rating, votes: b.votes, how: b.how, was: b.item.rymRating || 0, hist }); rated = true; }
    if (histChanged && !rated) out.histOnly.push({ item: b.item, hist });
  });
  return out;
}
// bold marks: like Rate Your Music, a release is bold when its overall RANK is within the top N (7,500 by default). It has nothing to do with a rating.
function rymIsBoldRank(rank, limit, on) { const k = rymVotesNum(rank); return !!(on && k && k <= limit); }
// END rym-core

// BEGIN rym-data
// ---- RYM ratings in the page: showing them, saving them, and taking in what the browser add-on saw on RateYourMusic ----
// Each release has rymRating (0.01-5), rymVotes (how many ratings RYM has) and rymSrc ('m' typed by you, 'a' copied by the add-on).
// SAFETY NET: every rating is also kept in this browser (RYM_LOCAL_KEY) until the sheet confirms it saved it. An Apps Script backend that
// predates RYM ratings answers "ok" to a write it silently ignored, so without this a rating you typed would vanish on the next refresh.
const RYM_LOCAL_KEY = 'crate_rym_local_v1';
let rymLocalCache = null, rymMergedFor = null, rymViewTimer = 0, rymReqTimer = 0, rymAddonIndexFor = null, rymAddonIndex = null;
const rymState = { addonSeen: false, lastAt: 0, lastTotal: 0, pending: null, last: [], localOnlyWarned: false };
function rymLocalAll() { if (!rymLocalCache) { try { const o = JSON.parse(localStorage.getItem(RYM_LOCAL_KEY) || '{}'); rymLocalCache = o && typeof o === 'object' ? o : {}; } catch (e) { rymLocalCache = {}; } } return rymLocalCache; }
function rymLocalSave() { try { localStorage.setItem(RYM_LOCAL_KEY, JSON.stringify(rymLocalCache || {})); } catch (e) { /* not kept */ } }
function rymLocalSet(item) { const k = artKey(item), all = rymLocalAll(); if (item.rymRating) all[k] = { r: item.rymRating, n: item.rymVotes || 0, s: item.rymSrc || 'm', t: Date.now() }; else delete all[k]; rymLocalSave(); }
function rymLocalClear(item) { const all = rymLocalAll(), k = artKey(item); if (all[k]) { delete all[k]; rymLocalSave(); } }
function rymMergeLocal() {                                       // a rating the sheet doesn't have yet (backend not updated, or not saved yet) is shown from the copy kept here
  if (rymMergedFor === state.raw) return; rymMergedFor = state.raw;
  { const L = rymLogLocalAll(); (state.raw || []).forEach(it => { const l = L[artKey(it)]; if (!l) return; if (!it.rymUpdated && l.u) it.rymUpdated = l.u; if (!(it.rymUpdateLog || []).length && l.l && l.l.length) it.rymUpdateLog = rymParseLog(l.l); }); }          // what the sheet doesn't hold yet is shown from the copy kept here
  { const rl = rymRankLocal(); (state.raw || []).forEach(it => { const l = rl[artKey(it)]; if (l && !it.rymRank) it.rymRank = rymVotesNum(l.k); }); }          // a rank the sheet doesn't have yet is shown from the copy kept here
  const all = rymLocalAll(); let flush = false;
  (state.raw || []).forEach(it => { const l = all[artKey(it)]; if (!l) return; if (!it.rymRating) { it.rymRating = rymNum(l.r); it.rymVotes = rymVotesNum(l.n); it.rymSrc = l.s === 'a' ? 'a' : 'm'; it._rymLocal = true; flush = true; } else delete all[artKey(it)]; });
  if (flush && state.backendRym) rymFlushLocal();
  rymMergeHistLocal();
  if (rymMergedFor && rymMergedFor.length) { clearTimeout(rymReqTimer); rymReqTimer = setTimeout(rymRequestFromAddon, 1500); }          // the library just loaded: ask the add-on (if any) what it has seen
}
async function rymFlushLocal() {                                  // the backend now supports it: send what only this browser had
  const list = (state.raw || []).filter(it => it._rymLocal && it.rymRating).map(it => ({ row: it.row, rymRating: it.rymRating, rymVotes: it.rymVotes || '', rymSrc: it.rymSrc || 'm' }));
  if (!list.length) return;
  try { const d = await postUpdate({ action: 'setRymRatings', items: list }); if (d && d.rymSaved) (state.raw || []).forEach(it => { if (it._rymLocal) { rymLocalClear(it); it._rymLocal = false; } }); } catch (e) { /* try again next load */ }
}
function rymRefreshViews() {                                      // redraw the cards/lists and the open album page, once, shortly after the last change
  clearTimeout(rymViewTimer);
  rymViewTimer = setTimeout(() => {          // sorted again too (a new date or rating can move a release), and whatever moved slides to its new place
    try { const flip = catalogFlipBefore(); if (typeof applyFiltersSort === 'function') keepGridPlace(() => applyFiltersSort()); catalogFlipAfter(flip, []); if (activeItem) deckRymPaint(activeItem); rymPaintCoverage(); } catch (e) { /* views not up yet */ }
  }, 350);
}
function rymChipHtml(item) {
  if (!state.rymShowNext || !item || !item.rymRating) return '';
  const v = item.rymVotes ? ` (${item.rymVotes.toLocaleString()} ratings)` : '', H = item.rymHist && item.rymHist.length > 1 ? item.rymHist : null;
  const was = H ? ` \u00b7 first saved ${H[0][1].toFixed(2)} on ${rymDateText(new Date(H[0][0]).toISOString())}` : '';
  return `<span class="rym-chip" title="Rate Your Music average${v}${item.rymSrc === 'm' ? ', typed by you' : ''}${was}">RYM ${item.rymRating.toFixed(2)}</span>`;
}
function rymBoldClass(item) { return item && rymIsBoldRank(item.rymRank, state.rymBoldRank, state.rymBold) ? ' rym-bold' : ''; }
function rymBoldTrackClass(t) { return ''; }          // RYM bolds a release by its rank; there is no such mark on a track, so none is made up
// Save one release's RYM rating. src: 'm' typed, 'a' from the add-on. Returns { ok, localOnly }.
async function rymSaveItem(item, rating, votes, src) {
  rating = rymNum(rating); votes = rating ? rymVotesNum(votes) : 0;
  item.rymRating = rating; item.rymVotes = votes; item.rymSrc = rating ? (src || 'm') : ''; item._rymLocal = false;
  const hr = rating ? rymHistRecord(item.rymHist, [Date.now(), rating, votes]) : { hist: item.rymHist || [], changed: false };      // a typed rating goes in the record too
  if (hr.changed) { item.rymHist = hr.hist; rymHistLocalSet(item); }
  rymLocalSet(item); rymRefreshViews();                           // first keep a copy here: nothing typed is ever lost
  try {
    const body = { row: item.row, rymRating: rating || '', rymVotes: votes || '', rymSrc: item.rymSrc };
    if (hr.changed) body.rymHistory = JSON.stringify(item.rymHist);
    const d = await postUpdate(body);
    if (hr.changed) { if (d && d.histSaved) { rymHistLocalClear(item); state.backendRymHist = true; } else { state.backendRymHist = false; item._rymHistLocal = true; } }
    if (d && d.rymSaved) { rymLocalClear(item); state.backendRym = true; return { ok: true }; }
    item._rymLocal = !!rating; state.backendRym = false; return { ok: true, localOnly: true };
  } catch (err) { item._rymLocal = !!rating; if (hr.changed) item._rymHistLocal = true; return { ok: false, error: err }; }
}
async function rymSaveBatch(updates, src) {                       // updates: [{ item, rating, votes, hist }]
  updates.forEach(u => { u.item.rymRating = u.rating; u.item.rymVotes = u.votes; u.item.rymSrc = src; u.item._rymLocal = false; rymLocalSet(u.item); if (u.hist) { u.item.rymHist = u.hist; rymHistLocalSet(u.item); u.item._rymHistLocal = true; } });
  rymRefreshViews(); let saved = 0, localOnly = false;
  for (let i = 0; i < updates.length; i += 150) {
    const part = updates.slice(i, i + 150);
    try { const d = await postUpdate({ action: 'setRymRatings', items: part.map(u => { const o = { row: u.item.row, rymRating: u.rating, rymVotes: u.votes || '', rymSrc: src }; if (u.hist) o.rymHistory = JSON.stringify(u.hist); return o; }) });
      if (d && d.rymSaved) { part.forEach(u => rymLocalClear(u.item)); saved += part.length; state.backendRym = true; } else { localOnly = true; part.forEach(u => { u.item._rymLocal = true; }); state.backendRym = false; }
      if (d && d.histSaved) { part.forEach(u => { if (u.hist) { rymHistLocalClear(u.item); u.item._rymHistLocal = false; } }); state.backendRymHist = true; } else if (d) state.backendRymHist = false; }
    catch (e) { part.forEach(u => { u.item._rymLocal = true; }); localOnly = true; }
  }
  return { saved, localOnly };
}
function rymNoteLocalOnly() { if (rymState.localOnlyWarned) return; rymState.localOnlyWarned = true; flashGlobalToast('Saved on this device only: your Apps Script backend needs the RYM update (see the update log).'); }
// ---- what the add-on saw on RateYourMusic ----
function rymIndex() { if (rymAddonIndexFor !== state.raw || !rymAddonIndex) { rymAddonIndex = rymBuildIndex(state.raw || [], dupKey); rymAddonIndexFor = state.raw; } return rymAddonIndex; }
// ---- Updates from Rate Your Music, remembered: a FLAG for whether a release has had its first update, and a LOG of every update that changed something ----
// RymUpdated = when it was first read and updated (blank = never). RymUpdateLog = a list of { t: when, s: how, c: [{ k: field, l: its name, a: before, b: after }] }, newest last, kept inside a sheet cell's limit.
const RYM_LOG_MAX = 30, RYM_LOG_LOCAL_KEY = 'crate_rym_log_v1';
function rymParseLog(v) { let a = v; if (typeof v === 'string') { try { a = JSON.parse(v || '[]'); } catch (e) { a = []; } } return Array.isArray(a) ? a.filter(x => x && x.t && Array.isArray(x.c)).slice(-RYM_LOG_MAX) : []; }
function rymLogEntry(rows, src) { return { t: Date.now(), s: src || 'update', c: rows.map(p => ({ k: String(p.key), l: String(p.label || p.key).slice(0, 30), a: String(p.current == null ? '' : p.current).slice(0, 60), b: String(p.proposed == null ? '' : p.proposed).slice(0, 60) })) }; }
function rymLogJson(log) { let l = log.slice(-RYM_LOG_MAX), j = JSON.stringify(l); while (j.length > 40000 && l.length > 1) { l = l.slice(1); j = JSON.stringify(l); } return j; }          // (a sheet cell holds 50,000 characters: the oldest entries go first)
function rymLogLocalAll() { try { const o = JSON.parse(localStorage.getItem(RYM_LOG_LOCAL_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function rymLogLocalSet(item) { const o = rymLogLocalAll(); o[artKey(item)] = { u: item.rymUpdated || '', l: (item.rymUpdateLog || []).slice(-5) }; try { localStorage.setItem(RYM_LOG_LOCAL_KEY, JSON.stringify(o)); } catch (e) { /* not kept */ } }          // (a copy kept here, for a sheet that doesn't have the columns yet)
async function rymMarkUpdated(item) {                              // a release was read and needed nothing: it has still had its first update
  if (item.rymUpdated) return; const at = new Date().toISOString();
  await postUpdate({ action: 'editAlbum', row: item.row, RymUpdated: at }); item.rymUpdated = at; rymLogLocalSet(item);
}
const RYM_RANK_KEY = 'crate_rym_rank_v1';
function rymRankLocal() { try { const o = JSON.parse(localStorage.getItem(RYM_RANK_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function rymRankLocalSave(o) { try { localStorage.setItem(RYM_RANK_KEY, JSON.stringify(o)); } catch (e) { /* not kept */ } }
async function rymSaveRanks(list) {                              // [{ item, rank }]: the overall rank the add-on saw on a release page
  if (!list || !list.length) return;
  const loc = rymRankLocal(); list.forEach(u => { u.item.rymRank = u.rank; loc[artKey(u.item)] = { k: u.rank, t: Date.now() }; }); rymRankLocalSave(loc); rymRefreshViews();
  for (let i = 0; i < list.length; i += 150) {
    const part = list.slice(i, i + 150);
    try { const d = await postUpdate({ action: 'setRymRanks', items: part.map(u => ({ row: u.item.row, rymRank: u.rank })) });
      if (d && d.rankSaved) { const l2 = rymRankLocal(); part.forEach(u => { delete l2[artKey(u.item)]; }); rymRankLocalSave(l2); } }
    catch (e) { /* an older script ("Missing row number") or no connection: the rank stays on this device until the sheet has the column */ }
  }
}
async function rymApplyPlan(plan) {
  const r = await rymSaveBatch(plan.updates, 'a');
  rymState.last = plan.updates.map(u => ({ artist: u.item.artist, title: u.item.title, rating: u.rating, was: u.was }));
  if (r.localOnly) rymNoteLocalOnly();
  return r;
}
async function rymHandleAddon(list) {
  rymState.addonSeen = true; rymState.lastAt = Date.now(); rymState.lastTotal = (list || []).length;
  const plan = rymPlan(rymIndex(), list || []); rymState.plan = plan;
  if (plan.ranks.length) await rymSaveRanks(plan.ranks);
  if (plan.histOnly.length) await rymSaveHistBatch(plan.histOnly);         // what RYM said is recorded even where no rating changes (and where the rating is one you typed)
  if (plan.updates.length && state.rymAuto) {
    await rymApplyPlan(plan); rymState.pending = null;
    flashGlobalToast(`Added RYM ratings to ${plan.updates.length} release${plan.updates.length === 1 ? '' : 's'} from what you browsed on RateYourMusic.`);
  } else if (plan.updates.length) { rymState.pending = plan; flashGlobalToast(`${plan.updates.length} RYM rating${plan.updates.length === 1 ? '' : 's'} ready: ⚙ → RYM ratings…`); }
  else rymState.pending = null;
  rymPaintDialog();
}
function rymAfterAdd(payload, res) {                               // a rating typed while adding: keep a copy until the sheet confirms it has the column
  const r = rymNum(payload.RymRating); if (!r) return;
  if (res && res.rymSaved) { state.backendRym = true; return; }
  rymLocalAll()[artKey({ artist: payload.Artist, title: payload.Title })] = { r, n: rymVotesNum(payload.RymVotes), s: 'm', t: Date.now() }; rymLocalSave(); rymNoteLocalOnly();
}
function rymRequestFromAddon() { rymLastReq = Date.now(); try { window.postMessage({ source: 'crate-app', type: 'request-rym-ratings' }, window.location.origin); window.postMessage({ source: 'crate-app', type: 'request-rym-genres' }, window.location.origin); } catch (e) { /* no add-on */ } }
function rymCoverage() { const raw = state.raw || [], has = raw.filter(r => r.rymRating); return { total: raw.length, has: has.length, typed: has.filter(r => r.rymSrc === 'm').length, auto: has.filter(r => r.rymSrc === 'a').length, hist: raw.filter(r => r.rymHist && r.rymHist.length >= 2).length }; }
// END rym-data

// BEGIN rym-ui
// ---- ⚙ → RYM ratings…: settings, the add-on's status, and a quick-entry list for typing ratings in ----
function rymEl(id) { return document.getElementById(id); }
let rymQEShown = 40;
function openRymDialog() { rymQEShown = 40; rymRenderSettings(); rymEl('rymOverlay').hidden = false; el.layoutMenu.hidden = true; rymPaintDialog(); rymRequestFromAddon(); }
function closeRymDialog() { const ov = rymEl('rymOverlay'); if (ov && !ov.hidden) ov.hidden = true; }
function rymRenderSettings() {
  rymEl('rymGenreAuto').checked = !!state.rymGenreAuto; rymEl('rymShowNext').checked = !!state.rymShowNext; rymEl('rymBold').checked = !!state.rymBold; rymEl('rymQueueMode').checked = !!state.rymQueueMode; rymEl('rymUpdateOnAdd').checked = !!state.rymUpdateOnAdd; if (typeof afRenderSettings === 'function') afRenderSettings(); rymEl('rymAutoImport').checked = !!state.rymAutoImport; rymEl('rymAutoApply').checked = !!state.rymAutoApply; rymEl('rymTickDiffs').checked = !!state.rymTickDiffs; rymEl('rymAuto').checked = !!state.rymAuto;
  rymEl('rymBoldRank').value = String(state.rymBoldRank);
}
function rymQueue() {
  const mode = rymEl('rymQEFilter').value, sort = rymEl('rymQESort').value;
  let list = (state.raw || []).filter(r => r.artist && r.title);
  if (mode === 'missing') list = list.filter(r => !r.rymRating); else if (mode === 'link') list = list.filter(r => !r.rymRating && r.rymLink);
  if (sort === 'artist') list.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  else if (sort === 'mine') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else list.sort((a, b) => dateVal(b.dateAdded) - dateVal(a.dateAdded));
  return list;
}
function rymPaintCoverage() {
  const ov = rymEl('rymOverlay'); if (!ov || ov.hidden) return; const c = rymCoverage();
  rymEl('rymCoverage').textContent = c.total ? `${c.has.toLocaleString()} of ${c.total.toLocaleString()} releases have an RYM rating (${c.typed.toLocaleString()} typed by you, ${c.auto.toLocaleString()} from the add-on).${c.hist ? ' ' + c.hist.toLocaleString() + ' ' + (c.hist === 1 ? 'has' : 'have') + ' a history of changes.' : ''}` : 'Your crate is empty.';
}
function rymPaintDialog() {
  const ov = rymEl('rymOverlay'); if (!ov || ov.hidden) return;
  rymPaintCoverage();
  { const g = rymState.genres, kept = Object.values(state.genreTaxonomy || {}).filter(e => e && e.rym && e.rym.text).length, pl = g && g.plan;
    rymEl('rymGenreStatus').textContent = !g || !g.seen ? 'No answer about genres from the add-on yet. Open a genre\u2019s page on RateYourMusic (for example rateyourmusic.com/genre/progressive-rock/) with the add-on installed, then press Check now.'
      : `The add-on has ${g.total.toLocaleString()} genre description${g.total === 1 ? '' : 's'}. ${kept.toLocaleString()} of your genres have RYM\u2019s version saved${pl ? ` (last check: ${pl.filled} filled in, ${pl.refreshed} refreshed beside your own text, ${pl.unchanged} already up to date${pl.unmatched ? `, ${pl.unmatched} for genres you don\u2019t have` : ''})` : ''}.`; }
  const st = rymEl('rymAddonStatus');
  st.textContent = rymState.addonSeen ? `The add-on has handed over ${rymState.lastTotal.toLocaleString()} rating${rymState.lastTotal === 1 ? '' : 's'} from RateYourMusic pages you've browsed${rymState.plan ? ` (${rymState.plan.updates.length} new or changed, ${rymState.plan.unchanged} already up to date${rymState.plan.skippedManual ? `, ${rymState.plan.skippedManual} left alone because you typed them` : ''}${rymState.plan.unmatched ? `, ${rymState.plan.unmatched} not in your crate` : ''}${rymState.plan.ambiguous ? `, ${rymState.plan.ambiguous} too ambiguous to place` : ''})` : ''}.`
    : 'No answer from the add-on yet. It answers when it is installed (version 1.3 or newer), connected to this CRATE, and has seen ratings on RateYourMusic pages. Browse some artist pages, genre pages or release pages there, then press Check.';
  const ap = rymEl('rymApplyPending'); ap.hidden = !(rymState.pending && rymState.pending.updates.length); if (!ap.hidden) ap.textContent = `Apply ${rymState.pending.updates.length} rating${rymState.pending.updates.length === 1 ? '' : 's'} now`;
  const last = rymEl('rymLast'); last.innerHTML = ''; (rymState.last || []).slice(0, 8).forEach(x => { const li = document.createElement('li'); li.textContent = `${x.artist} \u2014 ${x.title}: ${x.rating.toFixed(2)}${x.was ? ` (was ${x.was.toFixed(2)})` : ''}`; last.appendChild(li); });
  rymEl('rymLastWrap').hidden = !(rymState.last && rymState.last.length);
  rymPaintQE();
}
function rymPaintQE() {
  const box = rymEl('rymQE'); if (box.contains(document.activeElement)) return;      // don't rebuild the rows while you are typing in one
  box.innerHTML = ''; const list = rymQueue(), shown = list.slice(0, rymQEShown);
  rymEl('rymQECount').textContent = list.length ? `${list.length.toLocaleString()} release${list.length === 1 ? '' : 's'} in this list` : 'Nothing here. Every release in this list has an RYM rating.';
  shown.forEach(it => {
    const li = document.createElement('li'); li.className = 'rym-qe-row';
    const name = document.createElement('span'); name.className = 'rym-qe-name'; const y = it.releaseDate && dateVal(it.releaseDate) !== -Infinity ? new Date(it.releaseDate).getUTCFullYear() : ''; name.textContent = `${it.artist} \u2014 ${it.title}${y ? ' (' + y + ')' : ''}`;
    const a = document.createElement('a'); a.href = it.rymLink && it.rymLink.trim() ? it.rymLink.trim() : rymSearchUrl(it); a.target = '_blank'; a.rel = 'noopener'; a.textContent = it.rymLink ? 'open on RYM \u2197' : 'find on RYM \u2197'; a.title = 'Opens RateYourMusic in a new tab';
    const r = document.createElement('input'); r.type = 'text'; r.inputMode = 'decimal'; r.className = 'rym-qe-input'; r.placeholder = '3.65'; r.value = it.rymRating ? it.rymRating.toFixed(2) : ''; r.setAttribute('aria-label', `RYM rating for ${it.artist} \u2014 ${it.title}`);
    const n = document.createElement('input'); n.type = 'text'; n.inputMode = 'numeric'; n.className = 'rym-qe-votes'; n.placeholder = 'ratings'; n.value = it.rymVotes ? String(it.rymVotes) : ''; n.setAttribute('aria-label', 'Number of RYM ratings (optional)');
    const stat = document.createElement('span'); stat.className = 'rym-qe-stat'; stat.setAttribute('aria-live', 'polite');
    const save = async () => {
      const val = rymNum(r.value); if (r.value.trim() && !val) { stat.textContent = '0.01 to 5'; stat.className = 'rym-qe-stat bad'; return; }
      stat.textContent = '\u2026'; const res = await rymSaveItem(it, val, n.value, 'm');
      stat.className = 'rym-qe-stat ' + (res.ok ? 'ok' : 'bad'); stat.textContent = !res.ok ? 'couldn\u2019t save' : res.localOnly ? 'saved here only' : val ? '\u2713' : 'cleared'; if (res.localOnly) rymNoteLocalOnly();
      rymPaintCoverage();
    };
    r.addEventListener('change', save); n.addEventListener('change', save);
    [r, n].forEach(box => box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); box.blur(); const next = li.nextElementSibling && li.nextElementSibling.querySelector('.rym-qe-input'); if (next) next.focus(); } }));
    li.append(name, a, r, n, stat); box.appendChild(li);
  });
  const more = rymEl('rymQEMore'); more.hidden = list.length <= rymQEShown; more.textContent = `Show ${Math.min(40, list.length - rymQEShown)} more`;
}
function rymLogSrc(sv) { return ({ queue: 'applied automatically', review: 'you reviewed it', together: 'applied together' })[sv] || 'updated'; }
function rymPaintLog(item) {                                    // the album page's "updated from RYM" flag and history
  const d = rymEl('deckRymLog'); if (!d) return; if (!item || !(item.rymLink || '').trim()) { d.hidden = true; return; }
  const log = item.rymUpdateLog || [], first = item.rymUpdated, fmt = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  d.hidden = false;
  rymEl('deckRymLogSum').textContent = first ? `Updated from RYM \u00b7 first ${fmt(first)} \u00b7 ${log.length ? `${log.length} update${log.length === 1 ? '' : 's'} logged` : 'nothing needed changing'}` : 'Not updated from RYM yet';
  rymEl('deckRymLogBody').innerHTML = log.length ? log.slice().reverse().map(e => `<div class="rym-log-entry"><div class="rym-log-when">${escapeHtml(fmt(e.t))} \u00b7 ${escapeHtml(rymLogSrc(e.s))}</div>${e.c.map(c => `<div class="rym-log-ch"><b>${escapeHtml(c.l)}</b> ${c.a ? escapeHtml(c.a) + ' \u2192 ' : ''}${escapeHtml(c.b)}</div>`).join('')}</div>`).join('') : `<div class="rym-log-none">${first ? 'Its Rate Your Music page was read and matched what you have.' : 'Use \u201cupdate \u21bb\u201d to read its Rate Your Music page.'}</div>`;
}
function deckRymPaint(item) {                                   // the album page's RYM row
  const inp = rymEl('deckRym'); if (!inp || !item) return;
  const vot = rymEl('deckRymVotes');                              // never overwrite a box you are in the middle of typing in
  if (document.activeElement !== inp) inp.value = item.rymRating ? item.rymRating.toFixed(2) : '';
  if (document.activeElement !== vot) vot.value = item.rymVotes ? String(item.rymVotes) : '';
  const a = rymEl('deckRymOpen'); a.href = item.rymLink && item.rymLink.trim() ? item.rymLink.trim() : rymSearchUrl(item); a.textContent = item.rymLink ? 'open \u2197' : 'find \u2197';
  rymEl('deckRymUpdate').hidden = !rymUpdateUrl(item);
  el.deckTitle.classList.toggle('rym-bold', !!rymBoldClass(item));
  rymPaintHist(item); rymPaintLog(item);
}
async function deckRymSave() {
  if (!activeItem) return; const val = rymNum(rymEl('deckRym').value);
  if (rymEl('deckRym').value.trim() && !val) { flashToast(el.deckToast, 'An RYM rating is 0.01 to 5'); return; }
  const res = await rymSaveItem(activeItem, val, rymEl('deckRymVotes').value, 'm');
  flashToast(el.deckToast, !res.ok ? 'Couldn\u2019t save \u2014 try again' : res.localOnly ? 'Saved on this device only (backend needs the RYM update)' : val ? 'RYM rating saved' : 'RYM rating cleared'); if (res.localOnly) rymNoteLocalOnly(); deckRymPaint(activeItem);
}
function initRymRatings() {
  const ov = rymEl('rymOverlay'); if (!ov) return;
  rymEl('menuRymRatings').addEventListener('click', openRymDialog);
  rymEl('rymClose').addEventListener('click', closeRymDialog);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeRymDialog(); });
  const setting = (id, key, num) => rymEl(id).addEventListener('change', (e) => { if (num) { const v = rymNum(e.target.value); if (!v) { e.target.value = String(state[key]); return; } state[key] = v; } else state[key] = e.target.checked; savePrefs(); rymRefreshViews(); });
  setting('rymShowNext', 'rymShowNext'); setting('rymBold', 'rymBold'); setting('rymQueueMode', 'rymQueueMode'); setting('rymUpdateOnAdd', 'rymUpdateOnAdd'); setting('rymAutoImport', 'rymAutoImport'); setting('rymAutoApply', 'rymAutoApply'); setting('rymTickDiffs', 'rymTickDiffs'); setting('rymAuto', 'rymAuto'); rymEl('rymBoldRank').addEventListener('change', (e) => { const v = rymVotesNum(e.target.value); if (!v) { e.target.value = String(state.rymBoldRank); return; } state.rymBoldRank = v; savePrefs(); rymRefreshViews(); });
  rymEl('deckRymUpdate').addEventListener('click', () => { if (activeItem) rymFetchUpdates([activeItem]); });
  rymEl('rymQEFilter').addEventListener('change', () => { rymQEShown = 40; rymPaintQE(); }); rymEl('rymQESort').addEventListener('change', () => { rymQEShown = 40; rymPaintQE(); });
  rymEl('rymQEMore').addEventListener('click', () => { rymQEShown += 40; rymPaintQE(); });
  rymEl('rymAddonCheck').addEventListener('click', () => { rymRequestFromAddon(); flashGlobalToast('Asked the add-on for the ratings it has seen.'); });
  rymEl('rymApplyPending').addEventListener('click', async () => { const p = rymState.pending; if (!p) return; await rymApplyPlan(p); rymState.pending = null; flashGlobalToast(`Added ${p.updates.length} RYM rating${p.updates.length === 1 ? '' : 's'}.`); rymPaintDialog(); });
  setting('rymGenreAuto', 'rymGenreAuto');
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - rymLastReq > 8000) rymRequestFromAddon(); });      // coming back from a RateYourMusic tab: ask again, so what it just saved shows up
  rymEl('deckRym').addEventListener('change', deckRymSave); rymEl('deckRymVotes').addEventListener('change', deckRymSave);
  ['deckRym', 'deckRymVotes'].forEach(id => rymEl(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }));        // Enter commits either box
  // the add-on answers a request with the ratings it has seen on RateYourMusic pages
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;       // only this page itself, never another frame or site
    const d = e.data; if (!d || d.source !== 'crate-addon') return;
    if (d.type === 'rym-genres' && Array.isArray(d.genres)) { rymHandleGenres(rymCleanGenres(d.genres)); return; }
    if (d.type === 'rym-tracklists' && Array.isArray(d.tracklists)) { rymTracklistsArrived(rymCleanTracklists(d.tracklists)); return; }
    if (d.type === 'rym-outbox' && Array.isArray(d.batches)) { rymOutboxArrived(rymCleanOutbox(d.batches)); return; }
    if (d.type !== 'rym-ratings' || !Array.isArray(d.ratings)) return;
    const s = (x) => String(x == null ? '' : x).slice(0, 200), clean = d.ratings.slice(0, 20000).map(x => ({ p: s(x && x.p), a: Number(x && x.a), n: Number(x && x.n) || 0, ar: s(x && x.ar), ti: s(x && x.ti), ty: s(x && x.ty), y: s(x && x.y), k: rymVotesNum(x && x.k), t: Number(x && x.t) || 0, h: Array.isArray(x && x.h) ? rymHistNorm(x.h.slice(0, 400)) : [] })).filter(x => x.a > 0 && x.a <= 5);
    rymHandleAddon(clean);
  });
}
// END rym-ui

// BEGIN rym-genre-core
// ---- RYM genre descriptions: which of your genres a description captured by the add-on belongs to, and what may be done with it ----
// Each genre in your taxonomy can hold  description  (the text you see and edit) and  rym  = { text, url, at } (the description as Rate Your Music
// had it when the add-on last saw it: kept apart from yours, so editing your own text never loses it). The rules:
//   - an EMPTY description is filled in from RYM (if "fill in" is on). A description that has any text is never changed by this.
//   - the saved RYM version is refreshed whenever the add-on brings a different text, and kept for you to read or to choose ("Use RYM's").
function rymGenreSlug(label) { return String(label == null ? '' : label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function rymGenreUrl(label) { const s = rymGenreSlug(label); return s ? 'https://rateyourmusic.com/genre/' + s + '/' : ''; }
// knownLabels: every genre CRATE knows (taxonomy + the ones on your releases). entries: [{ s: RYM slug, n: name RYM gives it, d: text, u: address, t: when }].
function rymGenrePlan(taxonomy, knownLabels, entries, opts) {
  const o = opts || {}, keyFn = o.keyFn || (g => String(g || '').trim().toLowerCase()), tax = taxonomy || {};
  const byKey = new Map(), bySlug = new Map();
  (knownLabels || []).forEach(l => { if (!l) return; byKey.set(keyFn(l), l); const s = rymGenreSlug(l); if (s && !bySlug.has(s)) bySlug.set(s, l); });
  const out = { items: [], unmatched: 0, unchanged: 0, filled: 0, refreshed: 0 }, best = new Map();
  (entries || []).forEach(e => {
    const text = typeof (e && e.d) === 'string' ? e.d.trim() : ''; if (text.length < 20) return;                       // real text only: not a number, not a scrap
    const label = (e.n && byKey.get(keyFn(e.n))) || (e.s && bySlug.get(rymGenreSlug(e.s))) || (e.n && bySlug.get(rymGenreSlug(e.n))) || null;
    if (!label) { out.unmatched++; return; }
    const prev = best.get(label); if (!prev || (e.t || 0) >= (prev.t || 0)) best.set(label, { label, text, url: String(e.u || ''), t: e.t || 0 });
  });
  best.forEach(b => {
    const key = keyFn(b.label), entry = tax[key] || null, saved = entry && entry.rym, empty = !entry || !String(entry.description || '').trim();
    const fill = !!o.auto && empty, sameSaved = !!(saved && saved.text === b.text);
    if (sameSaved && !fill) { out.unchanged++; return; }
    out.items.push({ label: b.label, key, rym: { text: b.text, url: b.url || (saved && saved.url) || '', at: b.t ? new Date(b.t).toISOString() : (saved && saved.at) || new Date(0).toISOString() }, fill });
    if (fill) out.filled++; else out.refreshed++;
  });
  return out;
}
// what to say on the genre page: how your description stands against RYM's saved version
function rymGenreState(entry) {
  const text = String(entry && entry.description || '').trim(), r = entry && entry.rym && entry.rym.text ? entry.rym : null;
  if (!r) return { kind: text ? 'none-mine' : 'none-empty' };
  if (!text) return { kind: 'rym-only', rym: r };
  return { kind: text === r.text ? 'same' : 'differs', rym: r };
}
// END rym-genre-core

// BEGIN rym-genre
// ---- RYM genre descriptions in the page: taking in what the add-on saw, and showing it on the genre page ----
let rymLastReq = 0, rymTaxWarned = false;
function rymCleanGenres(list) {                                   // whatever arrives is treated as untrusted: only text, bounded
  const t = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';                  // text only: a number or an object where text should be is dropped, not turned into text
  return (list || []).slice(0, 2000).map(x => ({ s: t(x && x.s, 200), n: t(x && x.n, 200), d: t(x && x.d, 9000), u: t(x && x.u, 300), t: Number(x && x.t) || 0 }));
}
async function rymHandleGenres(list) {
  const g = rymState.genres = rymState.genres || { seen: false, total: 0, at: 0, plan: null, last: [] };
  g.seen = true; g.total = list.length; g.at = Date.now();
  const plan = g.plan = rymGenrePlan(state.genreTaxonomy, getAllKnownGenres(state.genreTaxonomy).map(x => x.label), list, { auto: state.rymGenreAuto, keyFn: genreTaxonomyKey });
  if (plan.items.length) {
    plan.items.forEach(it => {
      const e = state.genreTaxonomy[it.key] || (state.genreTaxonomy[it.key] = { label: it.label, parents: [] });
      e.rym = it.rym; if (it.fill) e.description = it.rym.text;     // only an EMPTY description is ever filled (the plan decides), and RYM's version is kept beside it either way
    });
    saveGenreTaxonomy(state.genreTaxonomy);
    g.last = plan.items.filter(i => i.fill).map(i => i.label);
    if (plan.filled) flashGlobalToast(`Filled in ${plan.filled} genre description${plan.filled === 1 ? '' : 's'} from Rate Your Music.`);
    try { if (state.activeGenreTab && giShowing(state.activeGenreTab)) giRenderAbout(state.activeGenreTab, giUi(state.activeGenreTab)); if (el.genreDescElement && !el.genreDescElement.hidden) renderGenreDescElement(); } catch (e) { /* the genre page is not up */ }
  }
  rymPaintDialog();
}
function rymWarnTaxonomyBig(tax) {                                // an Apps Script from before 1.32 can't store this much: say so once, instead of failing quietly
  if (rymTaxWarned || state.backendTaxChunks) return; let n = 0; try { n = JSON.stringify(tax).length; } catch (e) { /* ignore */ }
  if (n > 45000) { rymTaxWarned = true; flashGlobalToast('Your genre descriptions are now too long to sync to one spreadsheet cell. Update apps-script-backend.gs (see the update log); they are kept on this device meanwhile.'); }
}
function rymDateText(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
function rymParas(text) { return String(text || '').split(/\n{2,}/).map(x => '<p>' + escapeHtml(x.trim()) + '</p>').join(''); }
function rymGenreAboutNote(genre, entry, ui) {                    // the line under a genre's About text: how your description stands against RYM's saved version
  const st = rymGenreState(entry), r = st.rym, when = r ? rymDateText(r.at) : '', link = r && r.url ? ` \u00b7 <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">open on RYM \u2197</a>` : '';
  const shown = ui.rymShown && r ? `<div class="gi-rym-text">${rymParas(r.text)}</div>` : '';
  if (st.kind === 'same') return `<p class="gi-rym-note">From Rate Your Music${when ? ' \u00b7 saved ' + escapeHtml(when) : ''}${link}</p>`;
  if (st.kind === 'differs' || st.kind === 'rym-only') {
    const use = ui.rymConfirm && st.kind === 'differs' ? 'Replace mine? Press again' : 'Use RYM\u2019s';
    return `<p class="gi-rym-note">${st.kind === 'differs' ? 'Rate Your Music has a different description' : 'Rate Your Music has a description'}${when ? ' (saved ' + escapeHtml(when) + ')' : ''}. <button type="button" class="ai-link-btn" data-gi="rym-show">${ui.rymShown ? 'Hide' : 'Show'}</button> <button type="button" class="ai-link-btn" data-gi="rym-use">${use}</button>${link}</p>${shown}`;
  }
  if (st.kind === 'none-empty') { const u = rymGenreUrl(genre); return u ? `<p class="gi-rym-note">Rate Your Music may have one: <a href="${escapeHtml(u)}" target="_blank" rel="noopener" title="Opens RYM's page for this genre. With the browser add-on, CRATE fills the description in when you come back.">Get it from RYM \u2197</a></p>` : ''; }
  return '';
}
function giUseRymDescription(genre) {
  const key = genreTaxonomyKey(genre), entry = state.genreTaxonomy[key], ui = giUi(genre); if (!entry || !entry.rym || !entry.rym.text) return;
  const mine = String(entry.description || '').trim();
  if (mine && mine !== entry.rym.text && !ui.rymConfirm) { ui.rymConfirm = true; giRenderAbout(genre, ui); return; }          // replacing something you wrote takes a second press
  entry.description = entry.rym.text; ui.rymConfirm = false; saveGenreTaxonomy(state.genreTaxonomy); giRenderAbout(genre, ui);
  if (el.genreDescElement && !el.genreDescElement.hidden) renderGenreDescElement();
  flashGlobalToast('Using the Rate Your Music description.');
}
// END rym-genre

// BEGIN tl-core
// ---- the tracklist editor: the pure parts (reading a pasted list, times, keeping existing tracks' numbers when a list is replaced, moving rows) ----
// A track's NUMBER is its identity: ratings, notes, listened ticks and links are saved against it. It is never reused for a different song, and it is
// not what is shown (the list shows the position, 1, 2, 3...), so reordering never moves anyone's data.
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
const FRACTION_WORDS = { '\u00bd': 'half', '\u00bc': 'quarter', '\u00be': 'three quarter', '\u2153': 'third', '\u215b': 'eighth' };
function foldFractions(s) { return String(s == null ? '' : s).replace(/[\u00bc-\u00be\u2153\u215b]/g, c => ' ' + FRACTION_WORDS[c] + ' '); }          // "\u00bd Way Down" is "Half Way Down" (normalising alone would drop the \u00bd)
function tlKey(title) {                                      // for telling whether two titles are the same song: case, accents, punctuation and (bracketed notes) don't matter
  const plain = foldFractions(title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['\u2019]/g, '');      // an apostrophe disappears (dont = don't), other punctuation is a space
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
// The number a song is SHOWN with: its place in the tracklist (1, 2, 3...), and beside it the release's own position when that says more
// ("A", "B2" on a record, from Rate Your Music or MusicBrainz). The stored trackNumber is the song's identity (its ratings, links and plays
// are kept under it) and runs on past the list after a tracklist is replaced, so it is never what is shown.
function trackPosOf(t) { return String((t && t.pos) || '').trim().slice(0, 8); }
function trackNumHtml(t, i) {
  if (!(i >= 0)) return t && t.trackNumber ? String(t.trackNumber) : '';
  const n = String(i + 1), p = trackPosOf(t);
  return n + (p && p !== n ? `<span class="track-pos" title="Its position on the release">${escapeHtml(p)}</span>` : '');
}
function tlMove(arr, from, to) {                              // a copy with the item at `from` moved to index `to`
  const a = (arr || []).slice(); if (from < 0 || from >= a.length) return a; const t = Math.max(0, Math.min(a.length - 1, to)), [x] = a.splice(from, 1); a.splice(t, 0, x); return a;
}
const TL_SOURCE_TEXT = { typed: 'typed by you', pasted: 'pasted', spotify: 'from Spotify', musicbrainz: 'from MusicBrainz', itunes: 'from iTunes', lookup: 'looked up automatically, then edited', rym: 'from Rate Your Music' };
function tlSourceText(tracks) {                               // "from Spotify" / "typed by you" / "from more than one source" / '' (a list with no record of where it came from)
  const codes = [...new Set((tracks || []).map(t => t && t.s).filter(c => TL_SOURCE_TEXT[c]))];
  return !codes.length ? '' : codes.length === 1 ? TL_SOURCE_TEXT[codes[0]] : 'from more than one source';
}
// END tl-core
const tlPending = { add: null, edit: null }, tlSeq = { add: 0, edit: 0 }, rymTlWaiters = [], rymOutWaiters = [], rymOutState = { batches: [], present: false, asked: false, last: 0, timer: 0, dismissed: '' };      // a list on offer from a source / the last source lookup asked for, per editor

// BEGIN genre-role
// ---- which of a release's genres a genre FILTER looks at ----
// A release has a Genre list (primary: the main flavour of the music, and there can be several) and a Secondary Genre list (influences that colour it without
// dominating). A filter can look at:  any (both lists together: how filters have always worked, the default) · primary (only the Genre list) · secondary (only the
// Secondary Genre list). "First genre only" then takes the first of whatever list is left. A release with nothing in the chosen list simply isn't in it (no tags);
// a release with no genres at all still has the single placeholder tag "Unknown", as before.
function genreTagsForRole(r, role) {
  if (role !== 'primary' && role !== 'secondary') return getGenreList(combinedGenreStr(r));
  const own = getGenreList(role === 'primary' ? r.genre : [r.genre2, sceneGenreStr(r)].filter(Boolean).join(', '));          // a scene or movement counts as a secondary genre
  if (own[0] !== 'Unknown') return own;
  return getGenreList(combinedGenreStr(r))[0] === 'Unknown' ? ['Unknown'] : [];
}
const GENRE_ROLE_TEXT = { any: 'primary or secondary', primary: 'primary only', secondary: 'secondary only' };
const GENRE_ROLE_HINTS = { any: '', primary: 'Only a release\u2019s Genre list counts (its main flavour, however many there are): left panel, genre: searches and the Release Chart.', secondary: 'Only a release\u2019s Secondary Genre list counts (the influences that colour it without dominating): left panel, genre: searches and the Release Chart.' };
const FIRST_GENRE_HINTS = { any: 'A genre only counts when it is the release\u2019s first one: left panel, genre: searches and the Release Chart.', primary: 'A genre only counts when it is the release\u2019s first primary genre: left panel, genre: searches and the Release Chart.', secondary: 'A genre only counts when it is the release\u2019s first secondary genre: left panel, genre: searches and the Release Chart.' };
function genreFilterSuffix(role, first, exact) {              // for the panel title: '' when nothing narrows it
  const r = role === 'primary' || role === 'secondary' ? role : '', tail = exact ? ' (not sub-genres)' : '';
  if (!r && !first) return tail;
  return ' (' + (first ? 'first ' : '') + (r ? r + ' ' : '') + 'genre' + (first ? '' : 's') + ' only)' + tail;
}
// END genre-role

const ADD_FORM_FIELD_OPTIONS = {
  artist: 'Artist',
  title: 'Release name',
  type: 'Type',
  releaseDate: 'Release date',
  recorded: 'Recorded',
  genre: 'Genre',
  genre2: 'Secondary genre',
  region: 'Region / Language',
  location: 'Location',
  label: 'Label',
  catalog: 'Catalog No.',
  descriptor: 'Descriptor',
  rymDescriptors: 'RYM descriptors',
  scene: 'Scene',
  movement: 'Movement',
  link: 'Link',
  rymLink: 'RYM link',
  rymRating: 'RYM rating',
  cover: 'Cover art URL',
  tracklist: 'Tracklist'
};

const FIELD_OPTIONS = {
  none: '— Empty —',
  title: 'Title',
  artist: 'Artist',
  year: 'Release Year',
  releaseDate: 'Release Date',
  recordedDate: 'Recorded',
  rating: 'Rating (Stars)',
  rymRating: 'RYM rating',
  rymVotes: 'RYM ratings (count)',
  rymPop: 'RYM popularity',
  type: 'Media Type (LP/EP)',
  catalog: 'Catalog Number',
  descriptor: 'Descriptor',
  scene: 'Scene',
  movement: 'Movement',
  genre: 'Genre',
  label: 'Label',
  region: 'Region / Language',
  duration: 'Total Duration',
  trackLength: 'Length'
};

// In the Tracks table, "title" would otherwise read as "Title" right next to
// the fixed Track-name column — relabel it "Album" for clarity there. The song's own Rate Your Music numbers (the ones in Edit track
// properties) come first and say "Song"; the release's say "Release": both used to read "RYM rating", and the release's was picked by mistake.
const TRACK_COLUMN_LABELS = Object.assign({ none: FIELD_OPTIONS.none, rymTrackRating: 'Song rating (RYM)', rymTrackVotes: 'Song rating count (RYM)', rymTrackWR: 'Song adjusted rating (RYM)', rymTrackPop: 'Song popularity (RYM)', rymTrackStand: 'Song vs album (RYM)' },
  FIELD_OPTIONS, { title: 'Album', rymRating: 'Release rating (RYM)', rymVotes: 'Release rating count (RYM)', rymPop: 'Release popularity (RYM)' });

// Field choices for the right panel's Last.fm History rows — mostly
// FIELD_OPTIONS' album-level fields (resolved via the matched crate item,
// when there is one), plus scrobble-native fields FIELD_OPTIONS has no
// concept of at all (date, track, play count). "title" relabeled "Album"
// here too, same reasoning as TRACK_COLUMN_LABELS — "Track" is its own
// separate option right next to it.
const LASTFM_HISTORY_FIELD_OPTIONS = Object.assign({}, FIELD_OPTIONS, {
  title: 'Album',
  date: 'Date',
  track: 'Track',
  playCount: 'Play Count'
});

// Resolves one configured Last.fm History field slot to displayable text —
// scrobble-native fields (date/track/playCount) come straight off the
// scrobble row itself; everything else falls through to keyToVal() against
// whichever crate item this scrobble matched (renderLastfmHistoryPanel's
// own lookup), or blank if it didn't match anything in the crate.
function lastfmHistoryFieldVal(key, scrobble, matchedItem) {
  if (!key || key === 'none') return '';
  if (key === 'date') return scrobble.day ? new Date(scrobble.day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  if (key === 'track') return scrobble.track || '';
  if (key === 'playCount') return scrobble.playCount > 1 ? `${scrobble.playCount}\u00d7` : '';
  if (!matchedItem) return key === 'artist' ? scrobble.artist : (key === 'title' ? scrobble.title : '');
  return keyToVal(key, matchedItem);
}

const state = {
  raw: [],
  filtered: [],
  diary: [],
  scrobbles: [],
  // Genre hierarchy — { [normalizedGenreKey]: { label: "Shoegaze", parent:
  // "Alternative Rock" } } — see loadGenreTaxonomy()/GENRE TAXONOMY section
  // below. Loaded once at init() and mutated in place by the taxonomy
  // editor; saveGenreTaxonomy(state.genreTaxonomy) persists it.
  genreTaxonomy: {},
  // Playlists: array of {id, name, description, createdAt, updatedAt, items}
  // where each item is {id, type: 'album'|'track', row, trackNum, trackName,
  // position} — see fetchCatalog() for how this is built from data.playlists
  // / data.playlistItems, and the "Playlists tab" section below for the UI.
  playlists: [],
  // Playlist Explorer folders: array of {id, name}. Purely a client-side
  // organizing layer — the backend (apps-script-backend.gs) has no concept
  // of folders, so this lives in localStorage via prefs (see loadPrefs() /
  // savePrefs()) rather than coming from fetchCatalog()'s data at all.
  playlistFolders: [],
  // {playlistId: folderId} — which folder (if any) each playlist is filed
  // under. Also localStorage-only; applied onto each playlist's folderId
  // every time fetchCatalog() rebuilds state.playlists, since the playlist
  // rows themselves come fresh from the backend on every fetch and carry
  // no folder info of their own.
  playlistFolderMap: {},
  // Ids of folders currently collapsed in the Playlist Explorer tree,
  // persisted via prefs so it survives a reload.
  playlistFoldersCollapsed: [],
  activePlaylistId: null,
  // Which layout the main panel uses for whichever playlist is currently
  // open — same idea as mainViewMode but scoped to playlists, so browsing
  // a playlist's tracks/artists never touches (or gets clobbered by) the
  // regular library's view mode. 'list' | 'tracks' | 'albumTracks' |
  // 'covers' | 'artists' — see renderPlaylistBody().
  playlistViewMode: 'list',
  descCollapsed: new Set(),               // the descriptor categories folded away in the left browser
  playlistSort: 'playlist',               // how the open playlist is sorted: 'playlist' = its own order (drag to reorder), or any of the library's sorts
  // Which view the far-left Music/Playlists nav rail has selected for the
  // thumbnail-browser column (#leftPanel): 'music' shows the Albums/
  // Artists/Genres browser, 'playlists' shows the flat playlist list.
  leftNavView: 'music',
  activeTab: 'albums',
  activeType: 'All',
  query: '',
  sort: 'newest',
  groupBy: 'none',
  groupBy2: 'none', // secondary "then by" grouping, nested within each primary group — see renderGrid/groupItems
  viewMode: 'grid',
  mainViewMode: 'albums', // 'albums' | 'tracks' | 'albumTracks' | 'covers'
  diaryViewMode: 'feed', // 'feed' | 'grid' | 'tracks'
  diaryTrackGroupMode: 'track', // 'track' | 'entry' — only relevant when diaryViewMode is 'tracks'
  diarySelectMode: false, // when true, clicking a Feed row or Grid tile toggles its selection instead of opening it
  cardSize: 190,
  leftMode: 'album',
  leftSort: 'name',       // 👈 ADD THIS
  leftThumbSize: 'medium',// 👈 ADD THIS
  // Clusters the left panel's Albums list under Artist/Genre/Year/Decade/
  // Type section headers — same categories/logic as the main grid's own
  // "Group by" (see groupKeysFor). Only meaningful in Albums mode; the
  // Artists/Genres/Years modes already show one row per category.
  leftGroupBy: 'none',
  navFilter: null,
  listenedOnly: false,
  showLeft: true,
  showRight: true,
  showCoverLinks: false,
  fitArtwork: true,
  fieldPlacement: 'below', // 'below' | 'overlay' — only relevant when fitArtwork is true
  closeGaps: false,
  leftNavCompact: false, // icons-only mode for the far-left Music/Playlist Explorer rail — see applyLeftNavCompact()
  // Which of the three Queue display styles is active — set via the new
  // "View" dropdown in Panels configuration…, right panel, under Up Next
  // (not the existing "Panel Settings…" button, which only ever configured
  // ONE of these three styles' fields — see the "View" dropdown's own
  // comment for why it needed to be a separate control). Each mode has its
  // own reference noted where it's implemented — see renderCrateQueuePanel's
  // dispatch and each of the three render functions it calls.
  queueViewMode: 'thumbnail', // 'thumbnail' | 'trackDetail' | 'releaseTracks'
  // Deck tracklist's "Show/Hide track credits" toggle (see
  // parseTrackCredits/renderTracklistBody) — RYM-style per-track credits
  // (who played what, who wrote it), expanded/collapsed for every track at
  // once rather than per-row, matching the reference this was built from.
  showTrackCredits: false,
  chartGenre: null, // last-selected genre in the Release Chart element (Main panel) — see renderChartElement()
  rymBold: true, rymBoldRank: 7500, rymQueueMode: !window.__CRATE_LEGACY_REVIEW, rymUpdateOnAdd: true, rymAutoImport: true, rymAutoApply: true, afOn: true, afOrder: null, rymTickDiffs: true, rymShowNext: true, rymAuto: true, rymMin: 0, rymMissingOnly: false, backendRym: false, backendRymHist: false, backendTaxChunks: false, rymGenreAuto: true,   // RYM ratings (see rym-data)
  genreNavExact: false, // when on, the genre picked in the left panel shows only releases tagged with THAT genre, not ones under it in the taxonomy (and the counts follow)
  genreRole: 'any',   // which of a release's genres a genre filter looks at: 'any' (Genre + Secondary Genre), 'primary' (Genre only), 'secondary' (Secondary Genre only) — see genre-role
  firstGenreOnly: false, // when on, a genre only counts if it is the FIRST one listed on a release (left-panel genre filter, genre: searches, Release Chart) — see filterGenreTags
  genreSearchMode: 'loose', // how strictly genre: searches match — 'exact' | 'subgenres' | 'loose', see genreSearchMatches / the ⇅ popover's "Genre search"
  shuffle: false, // player's Shuffle toggle (persisted) — see setShuffle(); applies to the crate queue, standalone YouTube/SoundCloud queues, and Spotify's own album playback
  tabHistory: [],       // [{tab, artist}] — what the tab bar's back/forward walk (session only)
  tabHistoryIndex: -1,  // -1 until initTabBar() seeds it
  genreTabs: [],        // genre tabs, in the order opened (session only, like artist tabs)
  activeGenreTab: null, // the last genre tab you were on
  genreMb: {},          // per genre: what MusicBrainz said about it this session ({status: loading|ok|error, count})
  genreMbYears: {},     // per genre: MusicBrainz release groups by year, as far as they've been read ({decades, years, requests, total, status})
  genreChartMb: 'off',  // Years active chart: 'off' = your crate only, 'both' = + MusicBrainz overlaid, 'only' = MusicBrainz alone
  genreUi: {},          // per genre (by taxonomy key): include sub-genres, sort, view, year filter, compare, editing — kept while its tab is open
  artistInfoSubTab: {}, // per artist: which of the page's sub-tabs ('stats'|'albums'|'profile'|'similar') is showing — session only
  artistInfoTrackSort: 'plays', // Top Tracks order: 'plays' | 'album'
  artistInfoShowAllTracks: false,
  artistInfoTabs: [], // ordered list of artist names, each an independently open/closeable tab — genuine multi-tab, not one reused tab. See openArtistInfoTab()/closeArtistInfoTab()/renderArtistInfoTabButtons()
  activeArtistInfoTab: null, // which one of artistInfoTabs (if any) is the currently showing one — independent of navFilter (which only ever governs the Music tab's own grid)
  // Ordered element assignments per panel — see LAYOUT_ELEMENTS just above.
  // This default (Music View alone in Main, Up Next alone in Right, Player
  // Controls docked in Bottom, nothing in Top) is only what a genuinely
  // first-ever load gets; an existing install's real setup is carried over
  // by migrateLegacyPanelLayout() instead, called once from loadPrefs.
  panelLayout: { main: ['musicView'], right: ['queue'], top: [], bottom: ['playerControls'] },
  // Global "stacked" (every assigned element in a panel shows at once,
  // the only mode that existed before this) vs "tabs" (only one shows at
  // a time, switched via a tab bar) — matches MusicBee's own "stack *"
  // toggle. activeTabByPanel tracks which element is the visible tab per
  // panel; only meaningful in tabs mode, and only for a panel with more
  // than one element assigned. See applyPanelTabsBar()/LAYOUT_ELEMENTS.
  panelStackMode: 'stacked',
  activeTabByPanel: {},
  panelWidths: { leftNav: 148, leftNavPl: 250, left: 220, right: 260 },
fields: { 
    // Ordered slots for the Albums Grid
    grid: ['title', 'artist', 'year', 'rating', 'type'], 
    // Ordered columns for the Tracks View (rendered as a file-list table: # and Track are always shown, these fill the extra columns)
    tracks: ['artist', 'title', 'genre', 'year', 'trackLength'],
    // Overlays painted ON TOP of the artwork itself (Slot 1 = Top Left, Slot 2 = Bottom Right, Slot 3 = Bottom Left)
    covers: ['catalog', 'type', 'rating', null, null],
    // Text rows printed UNDERNEATH the artwork in Covers view (independent of the Albums Grid fields)
    coversBelow: ['title', 'artist', null, null, null],
    // Right sidebar's "Now Playing"/Up Next queue — printed on a second
    // line under each queued track's name, one release-grouping line per
    // row (e.g. artist, year) so tracks that are collectively part of one
    // release read as a group at a glance. Used by the "Track with
    // Thumbnail" queue view specifically — see state.queueViewMode and
    // QUEUE_VIEW_MODES just below fields.
    queue: ['artist', 'year', null],
    // "Track Detail" queue view — a real table, same "# and Track are
    // always fixed, these fill the rest" pattern as the main Tracks View
    // (state.fields.tracks just above) reused deliberately rather than
    // invented fresh, just scoped to the queue's own narrower sidebar
    // width (fewer slots than the main view gets). See
    // renderQueueTrackDetailView().
    queueTrackDetail: ['artist', 'trackLength', null],
    // "Release and Tracks" queue view — TWO separate slot groups under one
    // "Customize Layout" button: the release-level block shown once per
    // contiguous run of same-release queue entries, and the track-level
    // block repeated under it for each individual track (track name
    // itself is always shown there, same fixed-vs-configurable split as
    // Track Detail above). Modeled on the Playlist Explorer's own "Album
    // and Tracks" view — release header once, its tracks listed under it —
    // applied here to the queue instead of a saved playlist. See
    // renderQueueReleaseTracksView().
    queueReleaseInfo: ['artist', 'title', 'year'],
    queueTrackInfoNested: ['trackLength', null],
    // Bottom mini player — printed under the track title, one field per
    // line (top-to-bottom = slot order). Defaults match the previous
    // hardcoded artist/album lines so nothing changes until customized.
    miniPlayer: ['artist', 'title'],
    // Right panel's Last.fm History rows — see LASTFM_HISTORY_FIELD_OPTIONS/
    // lastfmHistoryFieldVal(). Defaults match the original hardcoded
    // track/artist/date layout so nothing changes until customized.
    lastfmHistory: ['track', 'artist', 'date'],
    // Right panel's Track Info section — see renderTrackInfoPanel(). Up to
    // 4 slots, each a plain "Label: Value" line under the cover art/player.
    trackInfo: ['artist', 'genre', 'title', 'year']
  },
  lastfmHistoryLayout: 'chronological', // 'chronological' | 'byDay' — see renderLastfmHistoryPanel()
  lastfmHistoryViewMode: 'list', // 'list' | 'grid' — see renderLastfmHistoryPanel()
  albumQuickPeekStyle: 'floating', // 'floating' | 'inline' — see openAlbumQuickPeek()
  addFormVisibleFields: {}, // { [ADD_FORM_FIELD_OPTIONS key]: false } for anything hidden — absent/true = visible (default). See applyAddFormFieldVisibility()
  artCache: {},
  trackCache: {},
  linkCache: {},
  // Flat "Tracks" table state: rows are loaded once (across every album in
  // the current filter) then sorted/rendered client-side so columns behave
  // like a real file-list table instead of per-album async chunks.
  flatTrackRows: [],
  flatTrackLoading: false,
  trackSort: { key: null, dir: 'asc' },
  selectedTracks: new Set(),
  lastSelectedTrackKey: null,
  // Album-card selection (main "Albums"/"Album covers" grid views) — a
  // click selects a card instead of opening its release view, same
  // plain/ctrl/shift semantics as selectedTracks above; opening the deck
  // is now a deliberate double-click, Enter, or right-click → "View album"
  // instead. Keyed by String(item.row) since dataset attributes are always
  // strings and this Set is compared against them directly.
  selectedAlbums: new Set(),
  lastSelectedAlbumRow: null,
  // Per-column pixel widths for the flat "Tracks" table, keyed by column
  // sortKey ('num', 'name', 'plays', or a configured field key like 'genre').
  // Missing entries fall back to trackColDefaultWidth().
  trackColWidths: {},
  // Cache for "N of T albums" discography-completion lookups (left panel,
  // Artist grouping) — keyed by artist name lowercased. In-memory only
  // (doesn't need to survive a reload — it's cheap to refetch and MusicBrainz
  // discographies do occasionally grow).
  artistDiscogCache: {},
  // Cache for "N of T albums/EPs/singles" year-coverage lookups (left panel,
  // Year grouping) — keyed by year string. In-memory only, same reasoning
  // as artistDiscogCache above.
  yearCoverageCache: {},
  // Stats tab: which year's detail (if any) is expanded.
  statsSelectedYear: null,
  statsMode: 'listening', // 'listening' | 'collection' — see setStatsMode()
  rightPanelShowQueue: true,     // both independently toggleable — see applyRightPanelSections()
  rightPanelShowHistory: false,
  rightPanelShowTrackInfo: false, // Track Info section — cover art (or, toggled, playback controls) + configurable fields for whatever's currently playing
  collapsedGenres: new Set(), // genre taxonomy keys currently collapsed in the left panel's Genre tree — see filterCollapsedGenreRows/toggleGenreCollapse
  autoMatchOnAdd: true,  // match a new release's songs to Spotify while it's being added — see autoMatchAddForm
  autoMatchYoutube: false, // ...and to YouTube too (uses API quota, so it is opt-in)
  shareWithAddon: true,   // offer the browser add-on a compact list of the crate (see "Share the crate with the browser add-on")
  lastfmReviewAtStartup: true, // at boot, review what you played on Last.fm and offer to add albums that aren't in your crate
  flagMissingLinks: true, // red ! on releases with songs that have no link — see songLinkGaps / initLinkFlags
  trackInfoShowPlayer: false, // false = cover art (default), true = compact playback progress in that same slot — see renderTrackInfoPanel()
  trackInfoShowVideo: false, // if true AND the current track has a resolvable YouTube link, shows an embedded video in that same slot instead (takes priority over trackInfoShowPlayer) — see applyTrackInfoPlayerMode()
  releaseSearchGridView: false, // Add-album search results: list (default) or a Topster-style cover-art grid — see setReleaseSearchGridView()
  // Artist tab: which of your artists is selected, and a cache of their
  // full MusicBrainz discography (title/type/year per release-group) so
  // switching back to an already-viewed artist doesn't re-hit the API.
  artistSelectedName: null,
  artistWorksCache: {},
  // Whether the Artist tab's discography list should show everything
  // (singles, compilations) instead of just Albums/EPs. Set by the album
  // right-click menu's Search → "Open discography" action, and toggleable
  // from the Artist tab itself.
  artistShowAllTypes: false
};

const MAIN_VIEW_LABELS = { albums: 'Albums', tracks: 'Tracks', albumTracks: 'Album and Tracks', covers: 'Album covers' };
// Suffix shown after "Playlist: <name>" in the main panel label — 'list' (the
// default ordered/draggable view) gets no suffix since that's just "the playlist".
const PLAYLIST_VIEW_LABELS = { tracks: 'Tracks', albumTracks: 'Album and Tracks', covers: 'Album covers', artists: 'Artists' };

const el = {};
[
  'gridContainer','stateMsg','searchInput','refreshBtn',
  'musicViewElement','genreDescElement','genreDescLabel','genreDescBody','genreDescInput','genreDescSaveBtn',
  'tabBar','tabBackBtn','tabForwardBtn','tabAddBtn','artistBrowserView','genreInfoWrap','genreInfoBody','genreBrowserView','giGenreList','genreTabsContainer','artistBioElement','artistBioBody','artistInfoTabsContainer','artistInfoWrap','artistInfoName','artistInfoStats','aiArtistFilter','aiArtistList','aiAvatar','aiPlayBtn','aiNowPlaying','aiSubtabs','aiDecadeGenre','aiBody',
  'nowPlayingBarMainElement','nowPlayingBarMainArt','nowPlayingBarMainTitle','nowPlayingBarMainSub','nowPlayingBarMainSub2',
  'tabAlbums','tabDiary','tabScrobbles','viewGridBtn','viewListBtn','sizeControl','sizeSlider',
  'leftPanel','leftModeBtn','leftModeLabel','leftModeMenu','leftGroupBySection','leftList',
  'mainPanel','mainPanelLabel','rightPanel','crateQueuePanelBody','crateQueueClearBtn','resizerLeft','resizerRight','panels','viewbar',
  'mobileNavToggleBtn','mobileQueueToggleBtn','mobileDrawerBackdrop','topbarControls',
  'menuMobileActionsLabel','menuMobileActionsSlot','menuMobileActionsDivider',
  'diaryWrap','diaryContainer','diaryStateMsg',
  'scrobblesWrap','scrobblesContainer','scrobblesStateMsg',
  'tabStats','tabArtist',
  'statsWrap','statsModeListening','statsModeCollection','statsListeningWrap','statsCollectionWrap','statsCollectionBody','statsYearList','statsDetail','statsDetailBack','statsDetailYear','statsDetailBody',
  'chartElement','chartGenreSelect','chartBody',
  'artistWrap','artistSearchInput','artistList','artistDetail',
  'layoutBtn','layoutMenu','menuArrangePanels','arrangeModal','arrangeClose','toggleLeftPanel','toggleLeftNavCompact','toggleRightPanel','albumQuickPeekStyleSelect','addFieldsChecklist','trackInfoShowPlayerToggle','trackInfoShowVideoToggle','rightPanelQueueSection','rightPanelHistorySection','rightPanelTrackInfoSection','rightPanelEmptyMsg','rightHistoryPanelBody','trackInfoBody','trackInfoTextWrap','trackInfoTitle','trackInfoRatingRow','trackInfoArtWrap','trackInfoArt','trackInfoPlayerControls','trackInfoVideoWrap','trackInfoVideoMount','trackInfoFields','trackInfoEmpty','trackInfoSeekTrack','trackInfoSeekFill','trackInfoSeekHandle','trackInfoTimeCurrent','trackInfoTimeTotal','queueViewModeSelect','historyViewListBtn','historyViewGridBtn','historyLayoutChronoBtn','historyLayoutByDayBtn','toggleCoverLinks','toggleFitArtwork','toggleCloseGaps','fieldPlacementGroup','fieldPlacementOverlay','fieldPlacementBelow',
  'layoutZoneMain','layoutZoneRight','layoutZoneTop','layoutZoneBottom','layoutZoneAvailable','layoutStackModeStacked','layoutStackModeTabs',
  'mainConfigModal','mainConfigClose','mainConfigArtworkOptions',
  'fldTitle','fldArtist','fldYear','fldRating','fldType','fldCatalog','fldGenre','fldLabel','fldDuration','menuCustomizeMain',
  'listenedFilterBtn',
  'addAlbumBtn','addOverlay','addClose','addSearchInput','addSearchHelpBtn','addSearchHelpPopover','addManualEntryBtn','addResultsListBtn','addResultsGridBtn','addResults','addForm',
  'addArtist','addTitle','addType','addReleaseYear','addReleaseMonth','addReleaseDay','addRecordedYear','addRecordedMonth','addRecordedDay','addGenre','addGenre2','addRegion','addLocation','addLabel','addCatalog','addDescriptor','addScene','addMovement','addLink','addRymLink','addCover','addSaveBtn','addCancelBtn','addToast',
  'addTracksRows','addTracksAddRowBtn',
  'addSpotifyMatchBanner','addSpotifyMatchText','addSpotifyMatchAddBtn','addSpotifyMatchDismissBtn',
  'addMusicBrainzMatchBanner','addMusicBrainzMatchText','addMusicBrainzMatchAddBtn','addMusicBrainzMatchDismissBtn',
  'deckOverlay','deckClose','deckImg','deckCatalog','deckTitle','deckArtist','deckMeta','deckAdded','deckScrobbleCount','deckLink','deckRatingNum',
  'deckSpotifyLink','deckSoundcloudLink','deckRymLink','deckPlayBtn','deckActionsBar','deckQueueBtn','deckPlaylistRemoveBtn',
  'deckEditBtn','editOverlay','editClose','editArtist','editTitle','editType','editReleaseYear','editReleaseMonth','editReleaseDay','editRecordedYear','editRecordedMonth','editRecordedDay','editGenre','editGenre2','editRegion','editLocation','editLabel','editCatalog','editDescriptor','editScene','editMovement','editLink','editRymLink','editCover','editSaveBtn','editCancelBtn','editToast',
  'editTracksRows','editTracksAddRowBtn','editTracksLoadBtn',
  'ytPlayerMount','scPlayerMount',
  'deckTracklist','deckStars','deckReview','deckSaveReview','deckToast','deckRemoveBtn','deckPlaylistBtn',
  'logListenBtn','logForm','logDate','logStars','logEntryTitle','logDescription','logSaveBtn','logCancelBtn','deckDiaryList',
  'logTrackSummary','logSelectAllBtn','logClearSelectionBtn',
  'diaryToolbar','diaryViewFeedBtn','diaryViewGridBtn','diaryViewTracksBtn',
  'diaryTrackGroupToolbar','diaryGroupByTrackBtn','diaryGroupByEntryBtn',
  'diarySelectModeBtn','diarySelectionBar','diarySelectionCount','diaryDeleteSelectedBtn','diaryClearSelectionBtn',
  'diaryEntryModal','diaryEntryClose','diaryEntryImg','diaryEntryEntryTitle','diaryEntryTitle','diaryEntryArtist','diaryEntryDate',
  'diaryEntryRating','diaryEntryNote','diaryEntryTracksWrap','diaryEntryOpenAlbumBtn','diaryEntryDeleteBtn','diaryEntryToast',
  'anniversaryBanner','anniversaryBannerClose','anniversaryBannerList',
  'duplicateRowBanner','duplicateRowBannerClose','duplicateRowBannerList',
  'albumsViewMenu', 'mainViewBtn',
  'lastfmBtn','lastfmOverlay','lastfmClose','lastfmSetup','lastfmUsername','lastfmApiKey','lastfmSinceDate',
  'lastfmLastSync','lastfmFetchBtn','lastfmCancelBtn','lastfmFetchStatus','lastfmPreview','lastfmSummary',
  'lastfmMatchedCount','lastfmMatchedList','lastfmUnmatchedCount','lastfmUnmatchedList',
  'lastfmImportBtn','lastfmBackBtn','lastfmImportStatus','globalToast',
  'miniPlayer','miniPlayerClose','miniPlayerArt','miniPlayerVideoWrap','miniPlayerTitle','miniPlayerArtist','miniPlayerAlbum','miniPlayerExtra','miniPlayerTrackInfo',
  'miniPlayerShuffle','miniPlayerPrev','miniPlayerPlayPause','miniPlayerNext','miniPlayerVolume','miniPlayerQueueBtn','miniPlayerFullscreenBtn',
  'miniPlayerDetachBtn','miniPlayerDragHandle','miniPlayerDockBtn','miniPlayerMobileProgress','miniPlayerMobileProgressFill',
  'miniPlayerSeekTrack','miniPlayerSeekFill','miniPlayerSeekHandle','miniPlayerTimeCurrent','miniPlayerTimeTotal',
  'queuePanel','queuePanelClose','queuePanelNowPlaying','queuePanelList',
  'miniPlayerDeviceBtn','devicePanel','devicePanelClose','devicePanelList',
  'albumQuickPeek','albumQuickPeekClose','albumQuickPeekArt','albumQuickPeekTitle','albumQuickPeekSub','albumQuickPeekTracks','albumQuickPeekFacts','albumQuickPeekActions','albumQuickPeekCover','albumQuickPeekTabs','albumQuickPeekAbout','albumQuickPeekListens','albumQuickPeekListensTab','albumQuickPeekSelBar','albumQuickPeekSelCount',
  'nowPlayingBox','nowPlayingArt','nowPlayingTitle','nowPlayingArtist',
  'menuSpotifyApi','spotifyOverlay','spotifyClose','spotifyClientId','spotifyClientSecret','spotifySaveBtn','spotifyCancelBtn','spotifyStatus',
  'menuLastfmScrobble','lastfmScrobbleOverlay','lastfmScrobbleClose','lastfmScrobbleApiKey','lastfmScrobbleSecret','lastfmScrobbleSaveBtn','lastfmScrobbleCancelBtn','lastfmScrobbleStatus',
  'lastfmScrobbleConnectHint','lastfmScrobbleConnectBtn','lastfmScrobbleFinishBtn','lastfmScrobbleDisconnectBtn','lastfmScrobbleConnectStatus',
  'menuDiscogsApi','discogsOverlay','discogsClose','discogsToken','discogsSaveBtn','discogsCancelBtn','discogsStatus',
  'menuYoutubeApi','menuFlagMissingLinks','menuAutoMatchAdd','menuAutoMatchYt','menuLastfmReview','lfrOverlay','lfrClose','lfrTitle','lfrSub','lfrSummary','lfrList','lfrLoggedWrap','lfrLoggedSummary','lfrLogged','lfrSelectAll','lfrIgnore','lfrLater','lfrAdd','addLastfmBar','addTracksMatchBtn','addMatchStatus','songMatchOverlay','songMatchClose','songMatchTitle','songMatchSub','songMatchTabs','songMatchStatus','songMatchList','songMatchSave','songMatchSelectConf','songMatchSaved','menuUpdateLog','updateLogOverlay','updateLogClose','updateLogSearch','updateLogToggleAll','updateLogSummary','updateLogNote','updateLogList','youtubeApiOverlay','youtubeApiClose','youtubeApiKey','youtubeApiSaveBtn','youtubeApiCancelBtn','youtubeApiStatus',
  'menuNewReleases','newReleasesBadge','newReleasesOverlay','newReleasesClose','newReleasesCheckBtn','newReleasesLastChecked','newReleasesStatus','newReleasesList',
  'menuGenreTaxonomy','genreTaxonomyOverlay','genreTaxonomyClose','genreTaxonomyDatalist','genreTaxonomyList','genreTaxonomyAddBtn','genreTaxonomyStatus',
  'genreAutocompleteList',
  'editGenreDiscogsBtn','editGenreDiscogsStatus',
  'spotifyRedirectUriDisplay','spotifyConnectBtn','spotifyDisconnectBtn','spotifyConnectStatus',
  'authGate','authGateStatus','menuSignOut','menuAppVersion','app',
  'playlistModalOverlay','playlistModalHeading','playlistModalClose','playlistNameInput','playlistDescInput',
  'playlistModalSaveBtn','playlistModalCancelBtn','playlistModalToast','newPlaylistBtn','newPlaylistFolderBtn','playlistSidebarList',
  'folderModalOverlay','folderModalHeading','folderModalClose','folderNameInput','folderModalSaveBtn','folderModalCancelBtn','folderModalToast',
  'leftNavPanel','navMusicBtn','navPlaylistsBtn','musicBrowserView','playlistsBrowserView','resizerLeftNav',
  'timelineBtn','timelineOverlay','timelineClose','timelinePrevYear','timelineNextYear','timelineYearLabel',
  'timelineSlider','timelineTicks','timelineRangeStart','timelineRangeEnd','timelineCount','timelineAlbumList','timelineEmpty',
  'timelineHint','timelineModeReleaseBtn','timelineModeListenBtn',
  'mapBtn','mapOverlay','mapModal','mapContainer','mapStatus','mapCount','mapEmpty','mapMain','mapClose',
  'mapKeySetup','mapApiKeyInput','mapApiKeySaveBtn','mapKeyEditBtn',
  'mapCategorySelect','mapCategoryValueField','mapCategoryValueSelect','mapColorBySelect','mapLegend','mapSortSelect',
  'mapAttrTableWrap','mapAttrHeadRow','mapAttrBody',
  'mapTimeToggleBtn','mapTimeGranularity','mapTimeGranYearBtn','mapTimeGranMonthBtn','mapTimeHint',
  'mapTimeScrubber','mapTimePrev','mapTimeNext','mapTimeLabel','mapTimeSlider','mapTimeTicks',
  'mapTimeRangeStart','mapTimeRangeEnd',
  'qaOverlay','qaBackdrop','qaHeader','qaTitle','qaSub','qaStars',
  'qaPlayBtn','qaQueueBtn','qaPlaylistBtn','qaViewBtn','qaLogListenBtn','qaEditBtn','qaSpotifyBtn','qaRymBtn','qaRemoveBtn','qaDeleteBtn','qaDoneBtn',
  'qaListenBtn','qaSoundcloudBtn','deckQuickActionsBtn',
  'advancedSearchBtn','advSearchOverlay','advSearchClose','advArtist','advTitle','advYearFrom','advYearTo',
  'advRatingMin','advGenre','advLabel','advType','advCatalog','advDescriptor','advScene','advMovement','advExtra','advSearchApplyBtn','advSearchClearBtn',
  'searchWrap','searchIconBtn','sortFilterBtn','sortFilterMenu','sortFilterListenedToggle','sortGenreMatchOption','genreSearchHint','firstGenreOnlyToggle','firstGenreHint','aiExportBtn'
].forEach(id => { el[id] = document.getElementById(id); });

let activeItem = null;
let logRating = 0;
