/**
 * CRATE — the master crate (Master.gs)
 *
 * A third file in the same Apps Script project as apps-script-backend.gs (and Social.gs). It uses that file's helpers (_getUserSpreadsheet,
 * _readSheet, _json, SHEET_NAME) and, when Friends is set up, Social.gs's (_socGet, _socShareFor), and apps-script-backend.gs sends it every
 * request whose action starts with "master" (one line near the top of doPost, beside the "social" one).
 *
 * WHAT IT IS
 *   One shared catalog made from the crates of everyone on this CRATE who joins (you and your friends): each release once, with the details
 *   their crates hold (genres, descriptors, label, cover, RYM link and rating, tracklist and song links), how many crates have it, the
 *   ratings and plays pooled, and for each person what crates like theirs love that they don't have yet.
 *
 * WHAT IT KEEPS, AND WHERE
 *   - Each person's switches, in Script Properties: MASTER_SHARE_<email> { joined, details, have, ratings, plays, fill, id }.
 *   - The master crate itself, in a spreadsheet of its own in the script owner's Drive ("CRATE — master crate"; its id in MASTER_SS):
 *       Releases: one row per release (Key, Artist, Title, …, Members as JSON: [{ id, r, p, p30 }])
 *       ForYou:   one row per person (Id, Json): their taste match with each other person and their recommendations
 *       Status:   one row (Json): when it was built, how long it took, the totals, the charts
 *   - It is made again every night (a time trigger, made the first time anyone opens the master crate's settings), or on "Rebuild now".
 *   - Never read, never pooled: notes, reviews, diary text, catalog numbers, when anything was added, a release marked "Hide from friends".
 *   - A person who leaves is out of it at once (it is built again there and then).
 *
 * WHO SEES WHAT
 *   Totals (how many crates, the average rating, plays) are everyone's. A person's name beside their rating and plays is shown only to
 *   their friends on CRATE they share ratings with (the Friends switches); to anyone else they are "a friend" without a name.
 */

const MASTER_VERSION = 1;
const MASTER_REBUILD_MIN_MS = 5 * 60 * 1000;          // "Rebuild now" at most every 5 minutes
const MASTER_TRACKS_MAX = 40000;                      // a release's tracklist JSON, kept under a cell's 50,000 characters
const MASTER_RECS = 40;
const MASTER_REL_COLS = ['Key', 'Artist', 'Title', 'Type', 'Year', 'Genre', 'Genre2', 'Descriptors', 'Label', 'Cover', 'RymLink', 'RymRating', 'RymVotes', 'Tracks', 'Crates', 'Ratings', 'AvgRating', 'Plays', 'Plays30', 'Members', 'Agree', 'Also'];

function _mProps() { return PropertiesService.getScriptProperties(); }
function _mFold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
    .replace(/\s*[\(\[][^)\]]*(deluxe|remaster|edition|expanded|anniversary|bonus|version|reissue)[^)\]]*[\)\]]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim();
}
function _mKey(artist, title) { const a = _mFold(artist), t = _mFold(title); return a && t ? a + '|' + t : ''; }
function _mShare(email) {
  let s = null; try { s = JSON.parse(_mProps().getProperty('MASTER_SHARE_' + email) || 'null'); } catch (e) { s = null; }
  s = s && typeof s === 'object' ? s : {};
  const on = (v) => v !== false;
  return { joined: !!s.joined, details: on(s.details), have: on(s.have), ratings: on(s.ratings), plays: on(s.plays), fill: on(s.fill), id: s.id || '' };
}
function _mPutShare(email, s) { _mProps().setProperty('MASTER_SHARE_' + email, JSON.stringify(s)); }
function _mIdOf(email) {          // the person's id: their Friends id when they have one (so friends recognise them), else one of its own
  const u = typeof _socGet === 'function' ? _socGet(email) : null; if (u && u.id) return u.id;
  const s = _mShare(email); if (s.id) return s.id;
  s.id = 'm' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); _mPutShare(email, s); return s.id;
}
function _mNameOf(email) { const u = typeof _socGet === 'function' ? _socGet(email) : null; return (u && u.name) || ''; }
function _mMembers() {            // everyone with a crate here who has joined
  const all = _mProps().getProperties(), out = [];
  Object.keys(all).forEach(k => { if (k.indexOf('CRATE_SS_') !== 0) return; const email = k.slice(9); const s = _mShare(email); if (s.joined) out.push({ email: email, share: s, id: _mIdOf(email) }); });
  return out;
}
function _mSS() {
  const p = _mProps(), id = p.getProperty('MASTER_SS');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* made again below */ } }
  const ss = SpreadsheetApp.create('CRATE — master crate'); p.setProperty('MASTER_SS', ss.getId()); return ss;
}
function _mTab(ss, name, cols) {
  let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
  if (cols) { sh.clear(); sh.getRange(1, 1, 1, cols.length).setValues([cols]); sh.setFrozenRows(1); }
  return sh;
}
function _mEnsureTrigger() {
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'masterBuild');
  if (!has) ScriptApp.newTrigger('masterBuild').timeBased().everyDays(1).atHour(3).create();
}

// ----- reading one person's crate -----
function _mHidden(r) { const v = r && r.FriendsHidden; return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1'; }
function _mCleanTracks(r) {        // the tracklist and song links, never what's that person's own (song ratings, notes, likes, listens)
  let list = [];
  try { const mt = r.ManualTracks ? JSON.parse(String(r.ManualTracks)) : null; list = Array.isArray(mt) ? mt : (mt && Array.isArray(mt.tracks) ? mt.tracks : []); } catch (e) { list = []; }
  let td = {}; try { td = r.TrackData ? JSON.parse(String(r.TrackData)) || {} : {}; } catch (e) { td = {}; }
  const out = list.filter(t => t && (t.title || t.trackName)).slice(0, 80).map(t => {
    const n = Number(t.trackNumber || t.n) || 0, e = td[n] || {}, o = { n: n, title: String(t.title || t.trackName).slice(0, 300) };
    if (t.durationMs) o.ms = Number(t.durationMs) || 0;
    const sp = t.spotifyLink || e.spotifyLink, yt = t.youtubeLink || e.youtubeLink, sc = t.soundcloudLink || e.soundcloudLink;
    if (sp) o.sp = String(sp).slice(0, 300); if (yt) o.yt = String(yt).slice(0, 300); if (sc) o.sc = String(sc).slice(0, 300);
    return o;
  });
  return out;
}
function _mPlays(ss) {             // plays per release: the Last.fm scrobbles saved in the sheet, plus each listen logged in the diary
  const plays = {}, recent = {}, cut = Date.now() - 30 * 864e5;
  const add = (k, n, when) => { if (!k || !n) return; plays[k] = (plays[k] || 0) + n; if (when && when >= cut) recent[k] = (recent[k] || 0) + n; };
  const sc = ss.getSheetByName('Scrobbles');
  if (sc && sc.getLastRow() > 1) {
    const v = sc.getDataRange().getValues(), h = v[0].map(x => String(x).trim()), iA = h.indexOf('Artist'), iT = h.indexOf('Title'), iP = h.indexOf('PlayCount'), iD = h.indexOf('Date');
    for (let i = 1; i < v.length; i++) { const d = v[i][iD]; add(_mKey(v[i][iA], v[i][iT]), Number(v[i][iP]) || 1, d instanceof Date ? d.getTime() : Date.parse(d) || 0); }
  }
  const di = ss.getSheetByName('Diary');
  if (di && di.getLastRow() > 1) {
    const v = di.getDataRange().getValues(), h = v[0].map(x => String(x).trim()), iA = h.indexOf('Artist'), iT = h.indexOf('Title'), iD = h.indexOf('Date');
    for (let i = 1; i < v.length; i++) { const d = v[i][iD]; add(_mKey(v[i][iA], v[i][iT]), 1, d instanceof Date ? d.getTime() : Date.parse(d) || 0); }
  }
  return { plays: plays, recent: recent };
}

// ----- the build -----
function masterBuild() {          // the nightly trigger, "Rebuild now", and leaving
  const lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return { ok: false, error: 'A build is already running' };
  const t0 = Date.now();
  try {
    const members = _mMembers(), rel = new Map(), taste = {};
    members.forEach(m => {
      let ss; try { ss = _getUserSpreadsheet(m.email); } catch (e) { return; }
      const log = ss.getSheetByName(SHEET_NAME), rows = log ? _readSheet(log) : [], pl = m.share.plays ? _mPlays(ss) : { plays: {}, recent: {} };
      const mine = taste[m.id] = { keys: {}, n: 0 };
      rows.forEach(r => {
        if (_mHidden(r)) return;
        const k = _mKey(r.Artist, r.Title); if (!k) return;
        let x = rel.get(k);
        if (!x) { x = { k: k, names: {}, types: {}, years: [], genre: {}, genre2: {}, desc: {}, label: {}, cover: '', rym: {}, rymR: 0, rymV: 0, tracks: null, members: [] }; rel.set(k, x); }
        const nm = String(r.Artist).trim() + '\u0001' + String(r.Title).trim(); x.names[nm] = (x.names[nm] || 0) + 1;
        if (m.share.details) {
          const tally = (o, v) => { v = String(v || '').trim(); if (v) o[v] = (o[v] || 0) + 1; };
          tally(x.types, r.Type); tally(x.genre, r.Genre); tally(x.genre2, r.SecondaryGenre); tally(x.desc, r.RymDescriptors || r.Descriptor); tally(x.label, r.Label); tally(x.rym, r.RymLink);
          const y = parseInt(String(r.ReleaseDate || '').slice(0, 4), 10); if (y > 1000) x.years.push(String(r.ReleaseDate).slice(0, 10));
          if (!x.cover && /^https:\/\//.test(String(r.Cover || ''))) x.cover = String(r.Cover);
          const rv = Number(r.RymVotes) || 0; if (Number(r.RymRating) && rv >= x.rymV) { x.rymR = Number(r.RymRating); x.rymV = rv; }
          const tr = _mCleanTracks(r); if (tr.length && (!x.tracks || tr.length > x.tracks.length || tr.filter(t => t.sp || t.yt).length > x.tracks.filter(t => t.sp || t.yt).length)) x.tracks = tr;
        }
        const o = { id: m.id };
        const rating = Number(r.Rating) || 0; if (m.share.ratings && rating) o.r = rating;
        if (m.share.plays) { const p = pl.plays[k] || 0, p30 = pl.recent[k] || 0; if (p) o.p = p; if (p30) o.p30 = p30; }
        if (m.share.have || o.r || o.p) { if (!x.members.some(e => e.id === m.id)) x.members.push(o); }
        mine.keys[k] = o; mine.n++;
      });
    });
    // (step 2) crates with this also love: for each person, the releases they love most (rated 4 or more, or played 10 times or more; their
    // top 300), and for each of those, how often each other one is loved by the same people
    const co = {};
    Object.keys(taste).forEach(id => {
      const K = taste[id].keys, liked = Object.keys(K).filter(k => (K[k].r || 0) >= 4 || (K[k].p || 0) >= 10).sort((a, b) => ((K[b].r || 0) * 10 + (K[b].p || 0)) - ((K[a].r || 0) * 10 + (K[a].p || 0))).slice(0, 300);
      liked.forEach(k => { const m = co[k] = co[k] || {}; liked.forEach(j => { if (j !== k) m[j] = (m[j] || 0) + 1; }); });
    });
    // releases
    const mode = (o) => { let b = '', n = 0; Object.keys(o).forEach(k => { if (o[k] > n) { n = o[k]; b = k; } }); return b; };
    const agreeOf = (o) => { const b = mode(o); return b ? o[b] : 0; };
    const out = [], info = {};
    rel.forEach(x => {
      const nm = mode(x.names).split('\u0001'), ms = x.members, rated = ms.filter(e => e.r), avg = rated.length ? rated.reduce((a, e) => a + e.r, 0) / rated.length : 0;
      const plays = ms.reduce((a, e) => a + (e.p || 0), 0), p30 = ms.reduce((a, e) => a + (e.p30 || 0), 0);
      const yr = x.years.sort()[0] || '';
      let tracks = x.tracks ? JSON.stringify(x.tracks) : ''; if (tracks.length > MASTER_TRACKS_MAX) tracks = '';
      out.push([x.k, nm[0] || '', nm[1] || '', mode(x.types), yr, mode(x.genre), mode(x.genre2), mode(x.desc), mode(x.label), x.cover, mode(x.rym), x.rymR || '', x.rymV || '', tracks,
        ms.length, rated.length, avg ? Math.round(avg * 100) / 100 : '', plays, p30, JSON.stringify(ms), JSON.stringify({ genre: agreeOf(x.genre), desc: agreeOf(x.desc) }),
        JSON.stringify(Object.keys(co[x.k] || {}).map(j => ({ k: j, n: co[x.k][j] })).sort((a, b) => b.n - a.n).slice(0, 8))]);
      info[x.k] = { a: nm[0] || '', t: nm[1] || '', y: yr.slice(0, 4), g: mode(x.genre), d: mode(x.desc), crates: ms.length, n: rated.length, avg: avg, plays: plays, p30: p30 };
    });
    // taste: for each person, how alike each other person is, and what crates like theirs love that they don't have
    const ids = Object.keys(taste), tok = (k) => { const i = info[k]; return i ? new Set((i.g + ',' + i.d).toLowerCase().split(/\s*,\s*/).filter(Boolean)) : new Set(); };
    const forYou = [];
    ids.forEach(u => {
      const U = taste[u], matches = [];
      ids.forEach(f => {
        if (f === u) return; const F = taste[f], co = Object.keys(U.keys).filter(k => F.keys[k]);
        const overlap = co.length / Math.sqrt(Math.max(1, U.n) * Math.max(1, F.n));
        const both = co.filter(k => U.keys[k].r && F.keys[k].r), agree = both.length >= 3 ? 1 - both.reduce((a, k) => a + Math.abs(U.keys[k].r - F.keys[k].r), 0) / both.length / 4 : null;
        const pct = Math.round(Math.max(0, Math.min(1, agree == null ? Math.sqrt(overlap) : 0.4 * Math.sqrt(overlap) + 0.6 * agree)) * 100);
        matches.push({ id: f, pct: pct, shared: co.length, rated: both.length });
      });
      matches.sort((a, b) => b.pct - a.pct);
      const sim = {}; matches.forEach(m => { sim[m.id] = m.pct / 100; });
      const loved = Object.keys(U.keys).filter(k => (U.keys[k].r || 0) >= 4 || (U.keys[k].p || 0) >= 20).sort((a, b) => ((U.keys[b].r || 0) * 10 + (U.keys[b].p || 0)) - ((U.keys[a].r || 0) * 10 + (U.keys[a].p || 0))).slice(0, 60);
      const lovedTok = loved.map(k => ({ k: k, t: tok(k) }));
      const score = {};
      ids.forEach(f => { if (f === u) return; const F = taste[f], w = sim[f] || 0.05;
        Object.keys(F.keys).forEach(k => { if (U.keys[k]) return; const e = F.keys[k], like = (e.r ? (e.r - 2.5) / 2.5 : 0.25) + Math.log(1 + (e.p || 0)) / 6; if (like <= 0) return; score[k] = (score[k] || 0) + w * like; }); });
      const recs = Object.keys(score).map(k => {
        const t = tok(k); let why = '', best = 0;
        lovedTok.forEach(L => { if (!t.size || !L.t.size) return; let inter = 0; t.forEach(x => { if (L.t.has(x)) inter++; }); const j = inter / (t.size + L.t.size - inter); if (j > best) { best = j; why = L.k; } });
        return { k: k, s: Math.round((score[k] + best * 0.8) * 1000) / 1000, why: best >= 0.2 ? why : '' };
      }).sort((a, b) => b.s - a.s).slice(0, MASTER_RECS);
      forYou.push([u, JSON.stringify({ match: matches, recs: recs })]);
    });
    // charts
    const keys = Object.keys(info), I = (k) => info[k];
    const prior = 3.5, C = 2, bayes = (k) => (I(k).avg * I(k).n + prior * C) / (I(k).n + C);
    // gems: loved, and in few crates (only one, in a small group)
    const charts = {
      played30: keys.filter(k => I(k).p30 > 0).sort((a, b) => I(b).p30 - I(a).p30).slice(0, 30),
      consensus: keys.filter(k => I(k).n >= 2).sort((a, b) => bayes(b) - bayes(a)).slice(0, 30),
      gems: keys.filter(k => I(k).n >= 1 && I(k).avg >= 4.2 && I(k).crates <= Math.max(1, Math.floor(members.length / 3))).sort((a, b) => I(b).avg - I(a).avg || I(b).plays - I(a).plays).slice(0, 30),
      shared: keys.filter(k => I(k).crates >= 2).sort((a, b) => I(b).crates - I(a).crates || I(b).plays - I(a).plays).slice(0, 30)
    };
    const ss = _mSS();
    const relSh = _mTab(ss, 'Releases', MASTER_REL_COLS);
    if (out.length) relSh.getRange(2, 1, out.length, MASTER_REL_COLS.length).setValues(out);
    const fy = _mTab(ss, 'ForYou', ['Id', 'Json']); if (forYou.length) fy.getRange(2, 1, forYou.length, 2).setValues(forYou);
    const status = { v: MASTER_VERSION, builtAt: Date.now(), took: Date.now() - t0, crates: members.length, releases: out.length, shared2: keys.filter(k => I(k).crates >= 2).length,
      ratings: keys.reduce((a, k) => a + I(k).n, 0), plays: keys.reduce((a, k) => a + I(k).plays, 0),
      members: members.map(m => ({ id: m.id, releases: taste[m.id] ? taste[m.id].n : 0, share: { details: m.share.details, have: m.share.have, ratings: m.share.ratings, plays: m.share.plays } })), charts: charts };
    const st = _mTab(ss, 'Status', ['Json']); st.getRange(2, 1).setValue(JSON.stringify(status));
    _mProps().setProperty('MASTER_BUILT', String(status.builtAt));
    CacheService.getScriptCache().remove('master:status');
    return { ok: true, status: status };
  } finally { lock.releaseLock(); }
}

// ----- reading it -----
function _mStatus() {
  const c = CacheService.getScriptCache(), hit = c.get('master:status'); if (hit) { try { return JSON.parse(hit); } catch (e) { /* read again */ } }
  const id = _mProps().getProperty('MASTER_SS'); if (!id) return null;
  let s = null; try { const sh = SpreadsheetApp.openById(id).getSheetByName('Status'); s = sh ? JSON.parse(String(sh.getRange(2, 1).getValue() || 'null')) : null; } catch (e) { s = null; }
  if (s) { const t = JSON.stringify(s); if (t.length < 90000) c.put('master:status', t, 600); }
  return s;
}
function _mFindRow(sheetName, key) {
  const id = _mProps().getProperty('MASTER_SS'); if (!id) return null;
  const sh = SpreadsheetApp.openById(id).getSheetByName(sheetName); if (!sh || sh.getLastRow() < 2) return null;
  const hit = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).matchCase(true).findNext(); if (!hit) return null;
  const cols = sh.getLastColumn(), head = sh.getRange(1, 1, 1, cols).getValues()[0], vals = sh.getRange(hit.getRow(), 1, 1, cols).getValues()[0], o = {};
  head.forEach((h, i) => { o[String(h)] = vals[i]; }); return o;
}
// a person as one viewer may see them: their name only to a friend they share ratings with
function _mWho(viewerEmail, viewerId, memberId) {
  if (memberId === viewerId) return { me: true, name: 'You' };
  if (typeof _socEmailOf !== 'function' || typeof _socGet !== 'function') return { name: '' };
  const fe = _socEmailOf(memberId), f = fe && _socGet(fe), v = _socGet(viewerEmail);
  if (!f || !v || (f.friends || []).indexOf(viewerId) === -1 || (v.friends || []).indexOf(memberId) === -1) return { name: '' };
  const sh = typeof _socShareFor === 'function' ? _socShareFor(f, viewerId) : f.share || {};
  return sh && sh.ratings ? { name: f.name || '', friend: true } : { name: '' };
}
function _mPeople(email, list) {      // the per-person entries of a release, as this viewer may see them
  const me = _mIdOf(email);
  return (list || []).map(e => { const w = _mWho(email, me, e.id); return w.me || w.name ? { me: !!w.me, name: w.name, r: e.r || 0, p: e.p || 0 } : { r: 0, p: 0, anon: true }; });
}

function _master(email, action, payload) {
  try {
    if (action === 'masterState') {          // the switches, and the master crate as it is now
      try { _mEnsureTrigger(); } catch (e) { /* made by the next one to open it */ }
      const s = _mShare(email), st = _mStatus(), me = _mIdOf(email);
      const people = st && st.members ? st.members.map(m => { const w = _mWho(email, me, m.id); return { me: !!w.me, name: w.name || '', releases: m.releases, share: m.share }; }) : [];
      return _json({ ok: true, master: true, share: s, joined: s.joined, status: st ? { builtAt: st.builtAt, took: st.took, crates: st.crates, releases: st.releases, shared2: st.shared2, ratings: st.ratings, plays: st.plays } : null, people: people, rebuildIn: Math.max(0, MASTER_REBUILD_MIN_MS - (Date.now() - Number(_mProps().getProperty('MASTER_BUILT') || 0))) });
    }
    if (action === 'masterShare') {          // join, leave, or a switch changed
      const s = _mShare(email), p = payload.share || {};
      ['details', 'have', 'ratings', 'plays', 'fill'].forEach(k => { if (typeof p[k] === 'boolean') s[k] = p[k]; });
      const was = s.joined; if (typeof payload.joined === 'boolean') s.joined = payload.joined;
      _mIdOf(email); const keep = _mShare(email); s.id = keep.id || s.id;
      _mPutShare(email, s);
      let built = null; if (was && !s.joined) built = masterBuild();          // leaving: out of it at once
      return _json({ ok: true, master: true, share: _mShare(email), rebuilt: !!(built && built.ok) });
    }
    if (action === 'masterBuild') {
      if (!_mShare(email).joined) return _json({ ok: false, master: true, error: 'Join the master crate first' });
      const last = Number(_mProps().getProperty('MASTER_BUILT') || 0);
      if (Date.now() - last < MASTER_REBUILD_MIN_MS) return _json({ ok: false, master: true, error: 'It was built a moment ago: try again in a few minutes', rebuildIn: MASTER_REBUILD_MIN_MS - (Date.now() - last) });
      const r = masterBuild(); return _json(Object.assign({ master: true }, r));
    }
    if (action === 'masterRelease') {        // one release: its pooled details and numbers, and who has it (as this person may see them)
      if (!_mShare(email).joined) return _json({ ok: true, master: true, joined: false });
      const row = _mFindRow('Releases', _mKey(payload.artist, payload.title)); if (!row) return _json({ ok: true, master: true, joined: true, found: false });
      let ms = []; try { ms = JSON.parse(String(row.Members || '[]')); } catch (e) { ms = []; }
      let tracks = []; try { tracks = row.Tracks ? JSON.parse(String(row.Tracks)) : []; } catch (e) { tracks = []; }
      let agree = {}; try { agree = JSON.parse(String(row.Agree || '{}')); } catch (e) { agree = {}; }
      const rel = { key: row.Key, artist: row.Artist, title: row.Title, type: row.Type, date: row.Year, genre: row.Genre, genre2: row.Genre2, descriptors: row.Descriptors, label: row.Label, cover: row.Cover, rymLink: row.RymLink, rymRating: row.RymRating, rymVotes: row.RymVotes, tracks: tracks,
        crates: row.Crates, ratings: row.Ratings, avg: row.AvgRating, plays: row.Plays, plays30: row.Plays30, agree: agree };
      const me = _mIdOf(email), others = ms.filter(e => e.id !== me), oR = others.filter(e => e.r);
      rel.others = { crates: others.length, n: oR.length, avg: oR.length ? Math.round(oR.reduce((a, e) => a + e.r, 0) / oR.length * 100) / 100 : 0, plays: others.reduce((a, e) => a + (e.p || 0), 0) };
      const st = _mStatus(), p30 = st && st.charts && st.charts.played30 ? st.charts.played30.indexOf(row.Key) : -1; rel.rank30 = p30 >= 0 ? p30 + 1 : 0; rel.totalCrates = st ? st.crates : 0;
      let also = []; try { also = JSON.parse(String(row.Also || '[]')); } catch (e) { also = []; }
      rel.also = also.slice(0, 6).map(a => { const r2 = _mFindRow('Releases', a.k); return r2 ? { artist: r2.Artist, title: r2.Title, year: String(r2.Year || '').slice(0, 4), cover: r2.Cover, n: a.n, avg: r2.AvgRating || 0, crates: r2.Crates } : null; }).filter(Boolean);
      return _json({ ok: true, master: true, joined: true, found: true, release: rel, people: _mPeople(email, ms), fill: _mShare(email).fill });
    }
    if (action === 'masterDiscover') {       // this person's recommendations and taste matches, and the charts
      if (!_mShare(email).joined) return _json({ ok: true, master: true, joined: false });
      const st = _mStatus(), me = _mIdOf(email), row = _mFindRow('ForYou', me);
      let fy = { match: [], recs: [] }; try { fy = row ? JSON.parse(String(row.Json || '{}')) : fy; } catch (e) { /* none yet */ }
      const want = new Set(); (fy.recs || []).forEach(r => { want.add(r.k); if (r.why) want.add(r.why); }); const ch = (st && st.charts) || {}; Object.keys(ch).forEach(c => (ch[c] || []).forEach(k => want.add(k)));
      const id = _mProps().getProperty('MASTER_SS'), sh = id ? SpreadsheetApp.openById(id).getSheetByName('Releases') : null, rels = {};
      if (sh && sh.getLastRow() > 1) {
        const v = sh.getRange(1, 1, sh.getLastRow(), MASTER_REL_COLS.length).getValues(), h = v[0].map(String), ix = (n) => h.indexOf(n);
        for (let i = 1; i < v.length; i++) { const k = v[i][0]; if (!want.has(k)) continue;
          rels[k] = { artist: v[i][ix('Artist')], title: v[i][ix('Title')], year: String(v[i][ix('Year')] || '').slice(0, 4), genre: v[i][ix('Genre')], cover: v[i][ix('Cover')], crates: v[i][ix('Crates')], ratings: v[i][ix('Ratings')], avg: v[i][ix('AvgRating')], plays: v[i][ix('Plays')], plays30: v[i][ix('Plays30')] }; }
      }
      const match = (fy.match || []).map(m => { const w = _mWho(email, me, m.id); return { name: w.name || '', friend: !!w.friend, pct: m.pct, shared: m.shared }; });
      return _json({ ok: true, master: true, joined: true, builtAt: st ? st.builtAt : 0, recs: fy.recs || [], match: match, charts: ch, releases: rels });
    }
    return _json({ ok: false, master: true, error: 'Unknown master action' });
  } catch (err) {
    return _json({ ok: false, master: true, error: String(err && err.message || err) });
  }
}
