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
    try { _muMerge(true, out.map(r => ({ a: r[1], t: r[2], ty: r[3], y: r[4], g: r[5], d: r[7], l: r[8], c: r[9], rr: r[11], rv: r[12], crates: r[14] }))); } catch (e) { /* the music database waits for the next build */ }
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
  if (String(action).indexOf('masterMusic') === 0) return _music(email, 'music' + String(action).slice('masterMusic'.length), payload);          // (the music database: "masterMusicAdd" -> musicAdd, so the main backend's "master" line routes it here)
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

// =====================================================================================================================================
// THE MUSIC DATABASE (CRATE 1.135.167): one shared catalog of music, far beyond anyone's crate, that CRATE Radio picks from.
//   Music:   one row per release (Key, Artist, Title, Type, Year, Genre, Descriptors, Label, Cover, Listeners, LfPlays, RymRating, RymVotes,
//            Mbid, Sources as JSON { source: times seen }, Crates (how many crates here have it), Added, Updated)
//   Similar: one row per artist: the artists Last.fm calls similar (Key, Name, Json [{ a, m }], At)
//   Inbox:   what CRATE sends (musicAdd) waits here, one JSON per row, and is merged into Music at the nightly build or when the
//            database's page is opened (at most every 10 minutes)
//   Fill:    which artists have had their Last.fm fill and when (musicFillPlan hands each out once a month, so friends never do the same)
// What grows it: the friends' crates (each build), and what each person's CRATE sees as it's used (the artist page's More Releases,
// release cards, online search, the RYM pages they browse with the add-on) and its daily Last.fm fill (top releases and similar artists).
// Only people who have joined the master crate add to it or read it.
const MU_COLS = ['Key', 'Artist', 'Title', 'Type', 'Year', 'Genre', 'Descriptors', 'Label', 'Cover', 'Listeners', 'LfPlays', 'RymRating', 'RymVotes', 'Mbid', 'Sources', 'Crates', 'Added', 'Updated'];
const MU_SRC = ['crates', 'lastfm', 'rym', 'mb', 'dg', 'search', 'scrobbles', 'card'];
const MU_ADD_MAX = 400, MU_MERGE_EVERY_MS = 10 * 60 * 1000, MU_FILL_DAYS = 30;
function _muTab(ss, name, cols) {
  let sh = ss.getSheetByName(name); if (sh) return sh;
  sh = ss.insertSheet(name); sh.getRange(1, 1, 1, cols.length).setValues([cols]); sh.setFrozenRows(1); return sh;
}
const _muS = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 300);
function _muClean(x) {           // one release as CRATE sent it, made safe
  if (!x || typeof x !== 'object') return null;
  const a = _muS(x.a, 200), t = _muS(x.t, 300), k = _mKey(a, t); if (!k) return null;
  const src = MU_SRC.indexOf(String(x.src)) >= 0 ? String(x.src) : 'search';
  const num = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
  return { k: k, a: a, t: t, ty: _muS(x.ty, 30), y: _muS(x.y, 10).slice(0, 10), g: _muS(x.g, 200), d: _muS(x.d, 300), l: _muS(x.l, 120), c: /^https:\/\//.test(String(x.c || '')) ? _muS(x.c, 500) : '',
    li: num(x.li), lp: num(x.lp), rr: Math.min(5, num(x.rr)), rv: num(x.rv), mb: /^[0-9a-f-]{36}$/i.test(String(x.mb || '')) ? String(x.mb) : '', src: src };
}
function _muRead(sh) {           // the Music tab, as a Map key -> row (an array in MU_COLS order)
  const m = new Map(); if (!sh || sh.getLastRow() < 2) return m;
  sh.getRange(2, 1, sh.getLastRow() - 1, MU_COLS.length).getValues().forEach(r => { if (r[0]) m.set(String(r[0]), r); });
  return m;
}
function _muApply(m, x, now) {   // one release into the map: blanks filled, the biggest numbers kept, the source counted
  const C = (n) => MU_COLS.indexOf(n);
  let r = m.get(x.k);
  if (!r) { r = MU_COLS.map(() => ''); r[0] = x.k; r[C('Sources')] = '{}'; r[C('Crates')] = 0; r[C('Added')] = now; m.set(x.k, r); }
  const fill = (col, v) => { if (v && !r[C(col)]) r[C(col)] = v; };
  fill('Artist', x.a); fill('Title', x.t); fill('Type', x.ty); fill('Genre', x.g); fill('Descriptors', x.d); fill('Label', x.l); fill('Cover', x.c); fill('Mbid', x.mb);
  if (x.y && (!r[C('Year')] || String(x.y).slice(0, 4) < String(r[C('Year')]).slice(0, 4))) r[C('Year')] = x.y;          // the earliest year anyone has
  ['Listeners:li', 'LfPlays:lp'].forEach(p => { const [col, f] = p.split(':'); if (x[f] > (Number(r[C(col)]) || 0)) r[C(col)] = x[f]; });
  if (x.rv && x.rv >= (Number(r[C('RymVotes')]) || 0)) { r[C('RymRating')] = x.rr; r[C('RymVotes')] = x.rv; } else if (x.rr && !r[C('RymRating')]) r[C('RymRating')] = x.rr;
  let s = {}; try { s = JSON.parse(String(r[C('Sources')] || '{}')) || {}; } catch (e) { s = {}; } s[x.src] = (s[x.src] || 0) + 1; r[C('Sources')] = JSON.stringify(s);
  r[C('Updated')] = now;
}
function _muMerge(force, crateRows) {          // the inbox (and, from a build, the friends' crates) into Music; the totals worked out again
  const p = _mProps(), last = Number(p.getProperty('MUSIC_MERGED') || 0);
  if (!force && Date.now() - last < MU_MERGE_EVERY_MS) return false;
  const lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return false;
  try {
    const ss = _mSS(), sh = _muTab(ss, 'Music', MU_COLS), inbox = _muTab(ss, 'Inbox', ['Json']), simSh = _muTab(ss, 'Similar', ['Key', 'Name', 'Json', 'At']);
    const m = _muRead(sh), now = Date.now(), C = (n) => MU_COLS.indexOf(n);
    const sims = new Map(); if (simSh.getLastRow() > 1) simSh.getRange(2, 1, simSh.getLastRow() - 1, 4).getValues().forEach(r => { if (r[0]) sims.set(String(r[0]), r); });
    const n = inbox.getLastRow() - 1, rows = n > 0 ? inbox.getRange(2, 1, n, 1).getValues() : [];
    rows.forEach(r => { let o; try { o = JSON.parse(String(r[0])); } catch (e) { return; }
      (o.items || []).forEach(x => { const c = _muClean(x); if (c) _muApply(m, c, o.at || now); });
      (o.similar || []).forEach(s => { const k = _mFold(s.a); if (!k || !Array.isArray(s.s)) return; sims.set(k, [k, _muS(s.a, 200), JSON.stringify(s.s.slice(0, 30).map(z => ({ a: _muS(z.a, 200), m: Math.round((Number(z.m) || 0) * 1000) / 1000 }))), o.at || now]); }); });
    if (crateRows) {            // the friends' crates: each of their releases, and how many crates have it
      m.forEach(r => { r[C('Crates')] = 0; });
      crateRows.forEach(x => { const c = _muClean(Object.assign({ src: 'crates' }, x)); if (!c) return; _muApply(m, c, now); m.get(c.k)[C('Crates')] = x.crates || 1; });
    }
    const out = [...m.values()];
    sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), MU_COLS.length).clearContent();
    if (out.length) sh.getRange(2, 1, out.length, MU_COLS.length).setValues(out);
    if (n > 0) inbox.deleteRows(2, n);
    const simOut = [...sims.values()]; simSh.getRange(2, 1, Math.max(1, simSh.getLastRow() - 1), 4).clearContent(); if (simOut.length) simSh.getRange(2, 1, simOut.length, 4).setValues(simOut);
    // the totals, for the database's page
    const week = now - 7 * 864e5, src = {}, genres = {}, artists = new Set(); let notIn = 0, added7 = 0, rated = 0;
    out.forEach(r => { artists.add(_mFold(r[1])); if (!(Number(r[C('Crates')]) > 0)) notIn++; if (Number(r[C('Added')]) >= week) added7++; if (r[C('RymRating')] || r[C('Listeners')]) rated++;
      let s = {}; try { s = JSON.parse(String(r[C('Sources')] || '{}')); } catch (e) { s = {}; } Object.keys(s).forEach(k => { src[k] = (src[k] || 0) + 1; });
      String(r[C('Genre')] || '').toLowerCase().split(/\s*,\s*/).filter(Boolean).slice(0, 3).forEach(g => { genres[g] = (genres[g] || 0) + 1; }); });
    const recent = out.filter(r => Number(r[C('Added')]) >= week).sort((a, b) => Number(b[C('Added')]) - Number(a[C('Added')])).slice(0, 24).map(r => {
      let s = {}; try { s = JSON.parse(String(r[C('Sources')] || '{}')); } catch (e) { s = {}; } return { a: r[1], t: r[2], y: String(r[C('Year')] || '').slice(0, 4), c: r[C('Cover')], src: Object.keys(s)[0] || '' }; });
    const topGenres = Object.keys(genres).sort((a, b) => genres[b] - genres[a]).slice(0, 400).reduce((o, g) => { o[g] = genres[g]; return o; }, {});
    const st = { at: now, releases: out.length, artists: artists.size, notInCrates: notIn, added7: added7, withNumbers: rated, similar: simOut.length, sources: src, genres: topGenres, recent: recent };
    const stSh = _muTab(ss, 'MusicStatus', ['Json']); stSh.getRange(2, 1).setValue(JSON.stringify(st));
    p.setProperty('MUSIC_MERGED', String(now)); CacheService.getScriptCache().remove('music:status');
    return true;
  } finally { lock.releaseLock(); }
}
function _muStatus() {
  const c = CacheService.getScriptCache(), hit = c.get('music:status'); if (hit) { try { return JSON.parse(hit); } catch (e) { /* read again */ } }
  const id = _mProps().getProperty('MASTER_SS'); if (!id) return null;
  let s = null; try { const sh = SpreadsheetApp.openById(id).getSheetByName('MusicStatus'); s = sh ? JSON.parse(String(sh.getRange(2, 1).getValue() || 'null')) : null; } catch (e) { s = null; }
  if (s) { const t = JSON.stringify(s); if (t.length < 90000) c.put('music:status', t, 600); }
  return s;
}
function _muRowObj(r) { const o = {}; MU_COLS.forEach((c, i) => { o[c] = r[i]; }); let s = {}; try { s = JSON.parse(String(o.Sources || '{}')); } catch (e) { s = {}; } o.Sources = s; return o; }
function _music(email, action, payload) {
  try {
    if (!_mShare(email).joined) return _json({ ok: true, music: true, joined: false });
    if (action === 'musicAdd') {          // what this CRATE has seen: waits in the inbox for the next merge
      const items = Array.isArray(payload.items) ? payload.items.slice(0, MU_ADD_MAX) : [], similar = Array.isArray(payload.similar) ? payload.similar.slice(0, 60) : [];
      if (!items.length && !similar.length) return _json({ ok: true, music: true, queued: 0 });
      const text = JSON.stringify({ at: Date.now(), items: items, similar: similar }); if (text.length > 49000) return _json({ ok: false, music: true, error: 'Too much at once' });
      const lock = LockService.getScriptLock(); lock.waitLock(20000);
      try { _muTab(_mSS(), 'Inbox', ['Json']).appendRow([text]); } finally { lock.releaseLock(); }
      return _json({ ok: true, music: true, queued: items.length });
    }
    if (action === 'musicState') {        // the database's page: merged first when it's been a while
      try { _muMerge(!!payload.fresh); } catch (e) { /* the totals as they were */ }
      return _json({ ok: true, music: true, joined: true, status: _muStatus() });
    }
    if (action === 'musicSearch') {
      const q = _muS(payload.q, 80); if (q.length < 2) return _json({ ok: true, music: true, results: [] });
      const id = _mProps().getProperty('MASTER_SS'), sh = id ? SpreadsheetApp.openById(id).getSheetByName('Music') : null; if (!sh || sh.getLastRow() < 2) return _json({ ok: true, music: true, results: [] });
      const hits = sh.getRange(2, 2, sh.getLastRow() - 1, 2).createTextFinder(q).matchCase(false).findAll().slice(0, 300), rowsSeen = {}, out = [];
      hits.forEach(h => { const row = h.getRow(); if (rowsSeen[row] || out.length >= 60) return; rowsSeen[row] = 1; out.push(_muRowObj(sh.getRange(row, 1, 1, MU_COLS.length).getValues()[0])); });
      out.sort((a, b) => (Number(b.Listeners) || 0) - (Number(a.Listeners) || 0));
      return _json({ ok: true, music: true, results: out });
    }
    if (action === 'musicFillPlan') {     // which artists this CRATE should fill from Last.fm today: loved in the friends' crates, not filled this month
      const ss = _mSS(), fill = _muTab(ss, 'Fill', ['Key', 'Name', 'At']), done = {};
      if (fill.getLastRow() > 1) fill.getRange(2, 1, fill.getLastRow() - 1, 3).getValues().forEach(r => { if (r[0]) done[String(r[0])] = Number(r[2]) || 0; });
      const want = Math.max(1, Math.min(25, Number(payload.n) || 12)), cut = Date.now() - MU_FILL_DAYS * 864e5, score = {}, names = {};
      const rel = ss.getSheetByName('Releases');
      if (rel && rel.getLastRow() > 1) {
        const v = rel.getRange(1, 1, rel.getLastRow(), MASTER_REL_COLS.length).getValues(), h = v[0].map(String), iA = h.indexOf('Artist'), iAvg = h.indexOf('AvgRating'), iP = h.indexOf('Plays'), iC = h.indexOf('Crates');
        for (let i = 1; i < v.length; i++) { const k = _mFold(v[i][iA]); if (!k) continue; names[k] = names[k] || v[i][iA]; score[k] = (score[k] || 0) + (Number(v[i][iAvg]) || 2.5) * (Number(v[i][iC]) || 1) + Math.log(1 + (Number(v[i][iP]) || 0)); }
      }
      (Array.isArray(payload.mine) ? payload.mine.slice(0, 50) : []).forEach(a => { const k = _mFold(a); if (k) { names[k] = names[k] || _muS(a, 200); score[k] = (score[k] || 0) + 20; } });          // (this person's own loved artists first)
      const pick = Object.keys(score).filter(k => !(done[k] >= cut)).sort((a, b) => score[b] - score[a]).slice(0, want);
      if (pick.length) { const now = Date.now(); fill.getRange(fill.getLastRow() + 1, 1, pick.length, 3).setValues(pick.map(k => [k, names[k], now])); }          // handed out: nobody else gets them this month
      return _json({ ok: true, music: true, artists: pick.map(k => names[k]) });
    }
    if (action === 'musicRadio') {          // (1.135.168) CRATE Radio's candidates: releases near the station's genres, artists and years; CRATE does the final pick
      const id = _mProps().getProperty('MASTER_SS'), ss = id ? SpreadsheetApp.openById(id) : null, sh = ss ? ss.getSheetByName('Music') : null;
      if (!sh || sh.getLastRow() < 2) return _json({ ok: true, music: true, items: [], related: {} });
      const fold = (x) => String(x || '').toLowerCase().trim();
      const genres = (Array.isArray(payload.genres) ? payload.genres : []).slice(0, 40).map(g => ({ g: fold(g.g || g), w: Number(g.w) || 1 })).filter(g => g.g);
      const descs = (Array.isArray(payload.descs) ? payload.descs : []).slice(0, 30).map(d => ({ d: fold(d.d || d), w: Number(d.w) || 1 })).filter(d => d.d);
      const seeds = (Array.isArray(payload.artists) ? payload.artists : []).slice(0, 80).map(a => ({ k: _mFold(a.a || a), w: Number(a.w) || 1 })).filter(a => a.k);
      const yFrom = Number(payload.yFrom) || 0, yTo = Number(payload.yTo) || 9999, deep = !!payload.deep, want = Math.max(20, Math.min(500, Number(payload.n) || 300));
      const skip = {}; (Array.isArray(payload.skip) ? payload.skip.slice(0, 8000) : []).forEach(k => { skip[String(k)] = 1; });
      // the artists near the seeds: the seeds themselves, then who Last.fm calls similar to them (and to those, a little)
      const related = {}; seeds.forEach(a => { related[a.k] = Math.max(related[a.k] || 0, a.w); });
      const simSh = ss.getSheetByName('Similar'); const simMap = {};
      if (simSh && simSh.getLastRow() > 1) simSh.getRange(2, 1, simSh.getLastRow() - 1, 3).getValues().forEach(r => { if (r[0]) simMap[String(r[0])] = r[2]; });
      const spread = (k, w, depth) => { let l = []; try { l = JSON.parse(String(simMap[k] || '[]')); } catch (e) { l = []; } l.slice(0, 20).forEach(z => { const kk = _mFold(z.a); if (!kk) return; const ww = w * (Number(z.m) || 0.3) * (depth ? 0.4 : 0.8); if (ww > (related[kk] || 0)) related[kk] = ww; }); };
      seeds.forEach(a => spread(a.k, a.w, 0)); Object.keys(related).slice(0, 200).forEach(k => { if (!seeds.some(a => a.k === k)) spread(k, related[k], 1); });
      const v = sh.getRange(2, 1, sh.getLastRow() - 1, MU_COLS.length).getValues(), I = {}; MU_COLS.forEach((c, i) => { I[c] = i; });
      const out = [];
      v.forEach(r => {
        const key = String(r[I.Key] || ''); if (!key || skip[key]) return;
        const y = Number(String(r[I.Year] || '').slice(0, 4)) || 0; if (y && (y < yFrom || y > yTo)) return; if (!y && (yFrom > 0 || yTo < 9999) && payload.strictYears) return;
        const g = fold(r[I.Genre]), d = fold(r[I.Descriptors]), ak = _mFold(r[I.Artist]);
        let sc = 0, why = [];
        genres.forEach(x => { if (g && g.indexOf(x.g) >= 0) { sc += 2 * x.w; if (why.length < 3) why.push('g:' + x.g); } });
        descs.forEach(x => { if (d && d.indexOf(x.d) >= 0) sc += 1.2 * x.w; });
        if (related[ak]) { sc += 4 * related[ak]; why.push('a'); }
        const li = Number(r[I.Listeners]) || 0, rr = Number(r[I.RymRating]) || 0, rv = Number(r[I.RymVotes]) || 0, cr = Number(r[I.Crates]) || 0;
        if (payload.friends) { if (!cr) return; sc += 1; }          // (the friends' station: only what's in their crates)
        if (!sc) { if (!payload.cold) return; sc = 0.3 + (rr || li || cr ? 0.5 : 0); }          // (1.135.169) a new crate, a time machine, deep cuts: the whole database counts, its best first
        if (rr) sc += (rr - 3) * 1.5 * Math.min(1, rv / 300);
        sc += cr * 0.6;
        sc += deep ? (li ? -Math.log10(1 + li) * 0.5 + 2 : 0.5) : Math.log10(1 + li) * 0.25;
        out.push([sc, r]);
      });
      out.sort((a, b) => b[0] - a[0]);
      return _json({ ok: true, music: true, related: related, items: out.slice(0, want).map(x => { const r = x[1]; return { k: String(r[I.Key]), a: r[I.Artist], t: r[I.Title], ty: r[I.Type], y: String(r[I.Year] || '').slice(0, 4), g: r[I.Genre], d: r[I.Descriptors], l: r[I.Label], c: r[I.Cover], li: Number(r[I.Listeners]) || 0, lp: Number(r[I.LfPlays]) || 0, rr: Number(r[I.RymRating]) || 0, rv: Number(r[I.RymVotes]) || 0, cr: Number(r[I.Crates]) || 0, s: Math.round(x[0] * 100) / 100 }; }) });
    }
    if (action === 'musicLinks') {          // (1.135.168) song links found once, kept for everyone: get (keys) and/or put (links)
      const ss = _mSS(), sh = _muTab(ss, 'Links', ['Key', 'Song', 'Youtube', 'Spotify', 'At']);
      const put = Array.isArray(payload.put) ? payload.put.slice(0, 200) : [];
      if (put.length) {
        const lock = LockService.getScriptLock(); lock.waitLock(20000);
        try { const now = Date.now(); sh.getRange(sh.getLastRow() + 1, 1, put.length, 5).setValues(put.map(x => [_muS(x.k, 400), _muS(x.s, 300), _muS(x.yt, 200), _muS(x.sp, 200), now])); } finally { lock.releaseLock(); }
      }
      const keys = {}; (Array.isArray(payload.keys) ? payload.keys.slice(0, 200) : []).forEach(k => { keys[String(k)] = 1; });
      const links = {};
      if (Object.keys(keys).length && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(r => { const k = String(r[0]); if (!keys[k]) return; (links[k] = links[k] || {})[_mFold(r[1])] = { s: r[1], yt: r[2], sp: r[3] }; });
      return _json({ ok: true, music: true, links: links });
    }
    return _json({ ok: false, music: true, error: 'Unknown music action' });
  } catch (err) { return _json({ ok: false, music: true, error: String(err && err.message || err) }); }
}
