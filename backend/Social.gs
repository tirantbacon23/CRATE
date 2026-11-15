/**
 * CRATE — Friends (Social.gs)
 *
 * A second file in the same Apps Script project as apps-script-backend.gs. Apps Script shares every function between a project's files, so
 * this one uses apps-script-backend.gs's helpers (_getUserSpreadsheet, _readSheet, _json) and apps-script-backend.gs sends it every request whose action
 * starts with "social" (one line near the top of doPost; see the setup notes in CHANGELOG.txt, 1.114.0).
 *
 * WHAT IT KEEPS, AND WHERE
 *  - Each person's friends record, in this script's Script Properties (never in anyone's sheet):
 *      SOC_U_<email>  { id, code, name, share: { crate, ratings, diary, playing }, off, friends: [id], inc: [id], out: [id], seen, last }
 *      SOC_ID_<id>    the email that id belongs to
 *      SOC_CODE_<code> the id that friend code belongs to
 *    An id is a random string, so a friend never sees anyone's email address: friends and requests go by id, people add each other by code.
 *  - What each person is playing, in the script's cache for 10 minutes (soc:<id>), sent by their CRATE about once a minute.
 *  - A friend's crate and diary are read straight from THEIR spreadsheet when asked, and only when the two are friends and that
 *    friend shares it. Nothing is copied.
 *  - (1.117.0) The activity feed (socialFeed): friends' diary entries and the releases they added in the last 45 days, newest
 *    first, from the same sheets and with the same rules; kept 5 minutes per person in the cache so the panel can ask often.
 *  - (1.119.0) One release in full (socialRelease), for "Add to my crate": its tracklist, song links and RYM figures too, but never
 *    what's theirs alone (their rating, review, catalog number, when they added it, their song ratings, notes and listens).
 *  - (1.122.0) Each person can turn crate, ratings, diary or what they're playing off for one friend in particular (perFriend), on top
 *    of their switches for everyone; everything above follows it.
 *  - (1.123.0) Recommendations: a release sent to friends lands in a FriendRecs tab in each one's own spreadsheet; when they add it, the
 *    sender hears so. A recommended release is copied in full even if the sender hides it from friends (they chose to send it).
 *  - A release marked "Hide from friends" (its FriendsHidden column) never goes out: not in the crate, the diary or the feed.
 *
 * Only people ALLOWED_EMAILS lets in can use any of this (apps-script-backend.gs checks before a request gets here).
 */

const SOC_ONLINE_MS = 150 * 1000;          // seen in the last 2½ minutes: online
const SOC_CACHE_S = 600;                   // what someone is playing is kept 10 minutes
const SOC_SEEN_EVERY_MS = 4 * 60 * 1000;   // "last seen" is written to the properties at most every 4 minutes (or when the song changes)
const SOC_MAX_FRIENDS = 100;
const SOC_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';      // no 0/O or 1/I to mix up

function _socProps() { return PropertiesService.getScriptProperties(); }
function _socGet(email) { try { return JSON.parse(_socProps().getProperty('SOC_U_' + email) || 'null'); } catch (e) { return null; } }
function _socPut(email, u) { _socProps().setProperty('SOC_U_' + email, JSON.stringify(u)); }
function _socEmailOf(id) { return id ? _socProps().getProperty('SOC_ID_' + id) : null; }
function _socNewCode() {
  const p = _socProps();
  for (let n = 0; n < 20; n++) {
    let c = '';
    for (let i = 0; i < 8; i++) c += SOC_CODE_CHARS.charAt(Math.floor(Math.random() * SOC_CODE_CHARS.length));
    c = 'CRT-' + c.slice(0, 4) + '-' + c.slice(4);
    if (!p.getProperty('SOC_CODE_' + c)) return c;
  }
  throw new Error('Could not make a friend code');
}
function _socCleanCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^CRT/, '');
  return c.length === 8 ? 'CRT-' + c.slice(0, 4) + '-' + c.slice(4) : '';
}
function _socCleanName(s) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40); }
function _socShare(s) {
  s = s && typeof s === 'object' ? s : {};
  const on = (v) => v !== false && v !== 0 && v !== '0';
  return { crate: on(s.crate), ratings: on(s.ratings), diary: on(s.diary), playing: on(s.playing), liked: s.liked === true || s.liked === 1 };          // (1.128.0) liked songs: off until switched on
}
// A person's record, made the first time they use friends (a new id and code).
function _socEnsure(email, name) {
  let u = _socGet(email);
  if (u && u.id) {
    if (!u.name && name) { u.name = _socCleanName(name); _socPut(email, u); }
    return u;
  }
  const p = _socProps();
  u = { id: Utilities.getUuid().replace(/-/g, '').slice(0, 16), code: _socNewCode(), name: _socCleanName(name) || email.split('@')[0],
        share: _socShare(null), off: false, friends: [], inc: [], out: [], seen: 0, last: null };
  p.setProperty('SOC_ID_' + u.id, email);
  p.setProperty('SOC_CODE_' + u.code, u.id);
  _socPut(email, u);
  return u;
}
// (1.122.0) What a friend shares with ONE person: their switches for everyone, less any they've turned off for that person alone
// (perFriend: { id: { crate: false, … } }; only "off" is stored).
function _socShareFor(f, viewerId) {
  const base = _socShare(f && f.share), off = (f && f.perFriend && f.perFriend[viewerId]) || {};
  return { crate: base.crate && off.crate !== false, ratings: base.ratings && off.ratings !== false, diary: base.diary && off.diary !== false, playing: base.playing && off.playing !== false, liked: base.liked && off.liked !== false };
}
function _socWithLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Busy, try again');
  try { return fn(); } finally { lock.releaseLock(); }
}
function _socDrop(list, id) { return (list || []).filter(x => x !== id); }
function _socAddTo(list, id) { list = (list || []).filter(x => x !== id); list.push(id); return list; }

// What someone playing looks like to a friend: only these fields, never anything else the page sent.
function _socNp(np) {
  if (!np || typeof np !== 'object') return null;
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const out = { t: s(np.t, 200), artist: s(np.artist, 200), album: s(np.album, 200), cover: /^https:\/\//.test(String(np.cover || '')) ? s(np.cover, 600) : '',
                playing: !!np.playing, src: s(np.src, 20), year: s(np.year, 4) };
  return out.t || out.album ? out : null;
}

// How a friend looks in my list: name, whether they're online, what they're playing (if they share it), when they were last seen.
function _socView(fid, cache, now, viewerId) {
  const femail = _socEmailOf(fid); if (!femail) return null;
  const f = _socGet(femail); if (!f) return null;
  const fsh = _socShareFor(f, viewerId);
  const v = { id: fid, name: f.name || 'Friend', status: 'offline', np: null, seen: 0, last: null,
              share: { crate: !!fsh.crate, ratings: !!fsh.ratings, diary: !!fsh.diary, liked: !!fsh.liked } };
  if (f.off) return v;                                                  // "Appear offline": nothing about them at all
  let live = null; try { live = JSON.parse(cache.get('soc:' + fid) || 'null'); } catch (e) { live = null; }
  if (live && now - live.at < SOC_ONLINE_MS) {
    v.status = live.np && live.np.playing && fsh.playing ? 'playing' : 'online';
    if (fsh.playing && live.np) v.np = live.np;
    v.seen = live.at;
  } else {
    v.seen = Math.max(f.seen || 0, live ? live.at : 0);
  }
  if (fsh.playing) v.last = (live && live.np) || f.last || null;
  return v;
}

function _socState(email, u) {
  const cache = CacheService.getScriptCache(), now = Date.now();
  const people = (ids) => (ids || []).map(id => { const e = _socEmailOf(id), x = e && _socGet(e); return x ? { id: id, name: x.name || 'Someone' } : null; }).filter(Boolean);
  return {
    ok: true, social: true, now: now, recStamp: Number(_socProps().getProperty('SOC_RECSTAMP_' + email) || 0),
    me: { id: u.id, code: u.code, name: u.name, share: u.share, off: !!u.off, perFriend: u.perFriend || {} },
    friends: (u.friends || []).map(id => _socView(id, cache, now, u.id)).filter(Boolean),
    incoming: people(u.inc),
    outgoing: people(u.out)
  };
}

// A friend's crate and diary, read from their own spreadsheet. Only the columns below go out, and only what they share.
function _socHidden(r) { const v = r && r.FriendsHidden; return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1'; }
const SOC_CRATE_COLS = ['AlbumId', 'Artist', 'Title', 'Type', 'ReleaseDate', 'Genre', 'SecondaryGenre', 'Region', 'Label', 'Descriptor', 'Cover', 'Link', 'RymLink', 'RymRating', 'RymVotes', 'DateAdded'];
function _socFriendData(email, u, fid, what) {
  if ((u.friends || []).indexOf(fid) === -1) return { ok: false, social: true, error: 'Not friends' };
  const femail = _socEmailOf(fid), f = femail && _socGet(femail);
  if (!f || (f.friends || []).indexOf(u.id) === -1) return { ok: false, social: true, error: 'Not friends' };
  const fsh = _socShareFor(f, u.id);
  const ss = _getUserSpreadsheet(femail), out = { ok: true, social: true, id: fid, name: f.name, share: { crate: !!fsh.crate, ratings: !!fsh.ratings, diary: !!fsh.diary, liked: !!fsh.liked } };
  const hidden = {};
  const want = (k) => !what || what === 'all' || what === k;
  if (fsh.crate && (want('crate') || want('diary'))) {
    const log = ss.getSheetByName(SHEET_NAME), rows = log ? _readSheet(log) : [];
    const crate = [];
    rows.forEach(r => {
      if (_socHidden(r)) { hidden[String(r.Artist).trim() + '\u0001' + String(r.Title).trim()] = true; return; }
      if (!want('crate')) return;
      const o = {}; SOC_CRATE_COLS.forEach(c => { if (r[c] !== '' && r[c] != null) o[c] = r[c]; });
      if (fsh.ratings && r.Rating !== '' && r.Rating != null) o.Rating = r.Rating;
      crate.push(o);
    });
    if (want('crate')) out.crate = crate;
  }
  if (fsh.liked && (want('liked') || !what || what === 'all')) {          // (1.128.0) their liked songs, from each release's TrackData (never a hidden release)
    const log = ss.getSheetByName(SHEET_NAME), rows = log ? _readSheet(log) : [], liked = [];
    rows.forEach(r => {
      if (_socHidden(r) || !r.TrackData) return;
      let td; try { td = JSON.parse(String(r.TrackData)); } catch (e) { return; }
      Object.keys(td || {}).forEach(n => { const e = td[n]; if (e && e.liked) liked.push({ Artist: r.Artist, Title: r.Title, Num: Number(n), Name: String(e.likedName || e.name || ('Track ' + n)).slice(0, 300), At: e.liked, Cover: /^https:\/\//.test(String(r.Cover || '')) ? r.Cover : '' }); });
    });
    out.liked = liked.slice(0, 2000);
  }
  if (fsh.diary && want('diary')) {
    const d = ss.getSheetByName('Diary'), rows = d ? _readSheet(d) : [];
    out.diary = rows.filter(r => !hidden[String(r.Artist).trim() + '\u0001' + String(r.Title).trim()]).map(r => {
      const o = { Date: r.Date, Artist: r.Artist, Title: r.Title, EntryTitle: r.EntryTitle, Description: r.Description, Full: r.Full, Timestamp: r.Timestamp };
      if (fsh.ratings) o.Rating = r.Rating;
      return o;
    });
  }
  return out;
}

// The activity feed: what each friend logged in their diary and added to their crate lately, newest first. Only what they share,
// never a release they hide. Friend names aren't in it (the page has them, by id). Kept 5 minutes per person.
const SOC_FEED_DAYS = 45, SOC_FEED_MAX = 150, SOC_FEED_CACHE_S = 300;
function _socFeed(email, u, fresh) {
  const cache = CacheService.getScriptCache(), key = 'socfeed:' + u.id;
  if (!fresh) { try { const hit = cache.get(key); if (hit) return JSON.parse(hit); } catch (e) { /* build it */ } }
  const since = Date.now() - SOC_FEED_DAYS * 864e5, items = [], k = (r) => String(r.Artist).trim() + '\u0001' + String(r.Title).trim();
  const s = (v, n) => String(v == null ? '' : v).slice(0, n), https = (v) => /^https:\/\//.test(String(v || '')) ? s(v, 600) : '';
  (u.friends || []).forEach(fid => {
    const femail = _socEmailOf(fid), f = femail && _socGet(femail);
    const fsh = _socShareFor(f, u.id);
    if (!f || (f.friends || []).indexOf(u.id) === -1 || (!fsh.crate && !fsh.diary)) return;
    let ss; try { ss = _getUserSpreadsheet(femail); } catch (e) { return; }
    const log = ss.getSheetByName(SHEET_NAME), rows = log ? _readSheet(log) : [], hidden = {}, covers = {};
    rows.forEach(r => { if (_socHidden(r)) hidden[k(r)] = true; else if (r.Cover) covers[k(r)] = https(r.Cover); });
    if (fsh.crate) rows.forEach(r => {
      if (_socHidden(r)) return;
      const at = Date.parse(r.DateAdded) || 0; if (at < since) return;
      items.push({ fid: fid, kind: 'added', at: at, artist: s(r.Artist, 200), title: s(r.Title, 200), year: s(r.ReleaseDate, 4), cover: https(r.Cover), rating: fsh.ratings ? Number(r.Rating) || 0 : 0 });
    });
    if (fsh.diary) {
      const d = ss.getSheetByName('Diary');
      (d ? _readSheet(d) : []).forEach(e => {
        if (hidden[k(e)]) return;
        const at = Date.parse(e.Timestamp) || Date.parse(e.Date) || 0; if (at < since) return;
        items.push({ fid: fid, kind: 'diary', at: at, date: s(e.Date, 10), artist: s(e.Artist, 200), title: s(e.Title, 200), cover: covers[k(e)] || '',
                     rating: fsh.ratings ? Number(e.Rating) || 0 : 0, entryTitle: s(e.EntryTitle, 200), text: s(e.Description, 280),
                     full: e.Full === true || e.Full === 'TRUE' || e.Full === 1 || e.Full === '1' });
      });
    }
  });
  items.sort((a, b) => b.at - a.at);
  const out = { ok: true, social: true, items: items.slice(0, SOC_FEED_MAX), at: Date.now() };
  try { cache.put(key, JSON.stringify(out), SOC_FEED_CACHE_S); } catch (e) { /* too big to keep: built again next time */ }
  return out;
}

// One of a friend's releases with everything worth copying into your own crate. Found by its AlbumId (or artist and title).
// Left out: what's theirs alone. In TrackData (per song), their rating, note and "listened" are taken off; links, other titles,
// lengths, credits, genres and RYM figures stay.
const SOC_RELEASE_SKIP = { AlbumId: 1, DateAdded: 1, Rating: 1, Review: 1, FriendsHidden: 1, Catalog: 1, RymUpdated: 1, RymUpdateLog: 1, _row: 1 };
const SOC_TRACK_PERSONAL = ['rating', 'note', 'listened', 'liked', 'likedName', 'desc'];          // (1.128.0) a like and your song descriptors are yours too
function _socRelease(email, u, fid, albumId, artist, title) {
  if ((u.friends || []).indexOf(fid) === -1) return { ok: false, social: true, error: 'Not friends' };
  const femail = _socEmailOf(fid), f = femail && _socGet(femail);
  if (!f || (f.friends || []).indexOf(u.id) === -1) return { ok: false, social: true, error: 'Not friends' };
  const fsh = _socShareFor(f, u.id);
  if (!fsh.crate) return { ok: false, social: true, error: 'They don\'t share their crate.' };
  const out = _socCopyOf(femail, albumId, artist, title, false);
  if (!out) return { ok: false, social: true, error: 'That release is no longer in their crate.' };
  return { ok: true, social: true, release: out };
}
// A release from someone's Log, ready to copy: found by AlbumId (or artist and title), without what's theirs alone. null if it's not
// there (or hidden from friends, unless allowHidden: a release they recommended themselves).
function _socFindRow(rows, albumId, artist, title) {
  const id = String(albumId || '').trim(), a = String(artist || '').trim(), t = String(title || '').trim();
  return (id && rows.find(x => String(x.AlbumId).trim() === id)) || rows.find(x => String(x.Artist).trim() === a && String(x.Title).trim() === t) || null;
}
function _socCopyOf(ownerEmail, albumId, artist, title, allowHidden) {
  const log = _getUserSpreadsheet(ownerEmail).getSheetByName(SHEET_NAME), rows = log ? _readSheet(log) : [];
  const r = _socFindRow(rows, albumId, artist, title);
  if (!r || (!allowHidden && _socHidden(r))) return null;
  const out = {};
  Object.keys(r).forEach(k => { if (!SOC_RELEASE_SKIP[k] && r[k] !== '' && r[k] != null) out[k] = r[k]; });
  if (out.TrackData) {
    try {
      const td = JSON.parse(String(out.TrackData)), clean = {};
      Object.keys(td || {}).forEach(n => { const e = Object.assign({}, td[n]); SOC_TRACK_PERSONAL.forEach(x => delete e[x]); if (Object.keys(e).length) clean[n] = e; });
      if (Object.keys(clean).length) out.TrackData = JSON.stringify(clean); else delete out.TrackData;
    } catch (e) { delete out.TrackData; }
  }
  return out;
}

// ---- (1.123.0) RECOMMENDATIONS: "you should hear this". A recommendation goes into a FriendRecs tab in the RECIPIENT's own spreadsheet
// (so there's no size limit and it's theirs), and a small stamp in the Script Properties (SOC_RECSTAMP_<email>) tells their CRATE
// something changed, so it reads the tab only then. When they add one to their crate, the sender gets an "added" line in theirs.
const SOC_REC_COLS = ['Id', 'At', 'Kind', 'FromId', 'FromName', 'Artist', 'Title', 'Year', 'Cover', 'Note', 'SenderAlbumId', 'Status'];
const SOC_REC_MAX_TO = 20, SOC_REC_KEEP = 80;
function _socRecSheet(email) {
  const ss = _getUserSpreadsheet(email); let sh = ss.getSheetByName('FriendRecs');
  if (!sh) { sh = ss.insertSheet('FriendRecs'); sh.getRange(1, 1, 1, SOC_REC_COLS.length).setValues([SOC_REC_COLS]); }
  return sh;
}
function _socRecStamp(email) { _socProps().setProperty('SOC_RECSTAMP_' + email, String(Date.now())); }
function _socRecAppend(email, rec) {
  const sh = _socRecSheet(email), hm = _ensureColumns(sh, SOC_REC_COLS);
  _writeNewRows(sh, hm, [hm.headers.map(h => rec[h] !== undefined ? rec[h] : '')], ['Year', 'Title', 'Artist', 'Note']);
  _socRecStamp(email);
}
function _socRecRows(email) { const sh = _socRecSheet(email); return { sh: sh, rows: _readSheet(sh) }; }
function _socRecommend(email, u, payload) {
  const to = (Array.isArray(payload.to) ? payload.to : []).map(String).filter((x, i, a) => a.indexOf(x) === i && (u.friends || []).indexOf(x) !== -1).slice(0, SOC_REC_MAX_TO);
  if (!to.length) return { ok: false, social: true, error: 'Choose a friend to recommend it to.' };
  const log = _getUserSpreadsheet(email).getSheetByName(SHEET_NAME), r = _socFindRow(log ? _readSheet(log) : [], payload.albumId, payload.artist, payload.title);
  if (!r) return { ok: false, social: true, error: 'That release isn\'t in your crate any more.' };
  const s = (v, n) => String(v == null ? '' : v).slice(0, n), cover = /^https:\/\//.test(String(r.Cover || '')) ? s(r.Cover, 600) : '';
  const note = String(payload.note || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 280);
  let sent = 0;
  to.forEach(fid => {
    const femail = _socEmailOf(fid), f = femail && _socGet(femail);
    if (!f || (f.friends || []).indexOf(u.id) === -1) return;
    _socRecAppend(femail, { Id: Utilities.getUuid().replace(/-/g, '').slice(0, 16), At: new Date(), Kind: 'rec', FromId: u.id, FromName: u.name, Artist: s(r.Artist, 200), Title: s(r.Title, 200), Year: s(r.ReleaseDate, 4), Cover: cover, Note: note, SenderAlbumId: s(r.AlbumId, 64), Status: 'new' });
    sent++;
  });
  return sent ? { ok: true, social: true, sent: sent } : { ok: false, social: true, error: 'Couldn\'t send it: are you still friends?' };
}
function _socRecList(email) {
  const rows = _socRecRows(email).rows.filter(x => x.Status !== 'dismissed').slice(-SOC_REC_KEEP).reverse();
  return rows.map(x => ({ id: String(x.Id), at: Date.parse(x.At) || 0, kind: String(x.Kind || 'rec'), fromId: String(x.FromId || ''), fromName: String(x.FromName || ''), artist: String(x.Artist || ''), title: String(x.Title || ''),
                          year: String(x.Year || ''), cover: String(x.Cover || ''), note: String(x.Note || ''), status: String(x.Status || 'new') }));
}
// Mark some (ids) or all new ones seen; or one added / dismissed. Added tells the sender.
function _socRecSet(email, u, ids, status) {
  const ok = { seen: 1, added: 1, dismissed: 1 }; if (!ok[status]) return { ok: false, social: true, error: 'Unknown status' };
  const { sh, rows } = _socRecRows(email), hm = _headerMap(sh), col = hm.map.Status; let n = 0;
  rows.forEach(x => {
    const hit = ids === 'allNew' ? x.Status === 'new' : ids.indexOf(String(x.Id)) !== -1; if (!hit) return;
    if (status === 'seen' && x.Status !== 'new') return;
    sh.getRange(x._row, col).setValue(status); n++;
    if (status === 'added' && x.Kind === 'rec') {
      const semail = _socEmailOf(String(x.FromId)), sf = semail && _socGet(semail);
      if (sf && (sf.friends || []).indexOf(u.id) !== -1) _socRecAppend(semail, { Id: Utilities.getUuid().replace(/-/g, '').slice(0, 16), At: new Date(), Kind: 'added', FromId: u.id, FromName: u.name, Artist: x.Artist, Title: x.Title, Year: x.Year, Cover: x.Cover, Note: '', SenderAlbumId: '', Status: 'new' });
    }
  });
  if (n) _socRecStamp(email);
  return { ok: true, social: true, changed: n, recs: _socRecList(email), recStamp: Number(_socProps().getProperty('SOC_RECSTAMP_' + email) || 0) };
}
// A recommended release in full, for Add to my crate: from the sender's sheet, even if they hide it from friends (they chose to send it).
function _socRecRelease(email, u, id) {
  const x = _socRecRows(email).rows.find(r => String(r.Id) === String(id) && r.Kind === 'rec');
  if (!x) return { ok: false, social: true, error: 'That recommendation is gone.' };
  const semail = _socEmailOf(String(x.FromId)), sf = semail && _socGet(semail);
  const full = sf && (sf.friends || []).indexOf(u.id) !== -1 ? _socCopyOf(semail, x.SenderAlbumId, x.Artist, x.Title, true) : null;
  return { ok: true, social: true, release: full || { Artist: x.Artist, Title: x.Title, ReleaseDate: x.Year, Cover: x.Cover }, partial: !full };
}

// Every "social…" action comes here from doPost.
function _social(email, action, payload) {
  try {
    if (action === 'socialState') {
      let u = _socEnsure(email, payload.name);
      if (payload.beat) {
        const now = Date.now(), np = u.off || !u.share.playing ? null : _socNp(payload.np);
        CacheService.getScriptCache().put('soc:' + u.id, JSON.stringify({ at: now, np: np }), SOC_CACHE_S);
        const songChanged = np && (!u.last || u.last.t !== np.t || u.last.album !== np.album);
        if (now - (u.seen || 0) > SOC_SEEN_EVERY_MS || songChanged) {
          _socWithLock(() => { u = _socGet(email) || u; u.seen = now; if (np) u.last = { t: np.t, artist: np.artist, album: np.album, cover: np.cover, year: np.year, at: now }; _socPut(email, u); });
        }
      }
      return _json(_socState(email, u));
    }

    if (action === 'socialAdd') {
      const code = _socCleanCode(payload.code);
      if (!code) return _json({ ok: false, social: true, error: 'That isn\'t a friend code. Codes look like CRT-7K4Q-MB2X.' });
      return _json(_socWithLock(() => {
        const u = _socEnsure(email, payload.name);
        const fid = _socProps().getProperty('SOC_CODE_' + code), femail = _socEmailOf(fid);
        if (!fid || !femail) return { ok: false, social: true, error: 'No one has that code. Ask your friend for theirs again: a code changes when they make a new one.' };
        if (fid === u.id) return { ok: false, social: true, error: 'That\'s your own code.' };
        if ((u.friends || []).indexOf(fid) !== -1) return Object.assign(_socState(email, u), { note: 'You\'re already friends.' });
        if ((u.friends || []).length >= SOC_MAX_FRIENDS) return { ok: false, social: true, error: 'You have ' + SOC_MAX_FRIENDS + ' friends, the most there can be.' };
        const f = _socGet(femail);
        if ((u.inc || []).indexOf(fid) !== -1) {                    // they asked me already: adding their code accepts
          u.inc = _socDrop(u.inc, fid); u.out = _socDrop(u.out, fid); u.friends = _socAddTo(u.friends, fid);
          f.out = _socDrop(f.out, u.id); f.inc = _socDrop(f.inc, u.id); f.friends = _socAddTo(f.friends, u.id);
          _socPut(email, u); _socPut(femail, f);
          return Object.assign(_socState(email, u), { note: 'You and ' + f.name + ' are now friends.' });
        }
        u.out = _socAddTo(u.out, fid); f.inc = _socAddTo(f.inc, u.id);
        _socPut(email, u); _socPut(femail, f);
        return Object.assign(_socState(email, u), { note: 'Request sent to ' + f.name + '.' });
      }));
    }

    if (action === 'socialAnswer') {
      return _json(_socWithLock(() => {
        const u = _socEnsure(email), fid = String(payload.id || ''), femail = _socEmailOf(fid);
        if (!femail || (u.inc || []).indexOf(fid) === -1) return Object.assign(_socState(email, u), { note: 'That request is gone.' });
        const f = _socGet(femail);
        u.inc = _socDrop(u.inc, fid); f.out = _socDrop(f.out, u.id);
        if (payload.accept) { u.friends = _socAddTo(u.friends, fid); f.friends = _socAddTo(f.friends, u.id); u.out = _socDrop(u.out, fid); f.inc = _socDrop(f.inc, u.id); }
        _socPut(email, u); _socPut(femail, f);
        return Object.assign(_socState(email, u), { note: payload.accept ? 'You and ' + f.name + ' are now friends.' : 'Request ignored.' });
      }));
    }

    if (action === 'socialRemove') {                                // unfriend, or take back a request I sent
      return _json(_socWithLock(() => {
        const u = _socEnsure(email), fid = String(payload.id || ''), femail = _socEmailOf(fid);
        u.friends = _socDrop(u.friends, fid); u.out = _socDrop(u.out, fid); u.inc = _socDrop(u.inc, fid);
        if (u.perFriend && u.perFriend[fid]) { u.perFriend = Object.assign({}, u.perFriend); delete u.perFriend[fid]; }
        if (femail) { const f = _socGet(femail); if (f) { f.friends = _socDrop(f.friends, u.id); f.inc = _socDrop(f.inc, u.id); f.out = _socDrop(f.out, u.id); _socPut(femail, f); } }
        _socPut(email, u);
        return _socState(email, u);
      }));
    }

    if (action === 'socialSettings') {
      return _json(_socWithLock(() => {
        const u = _socEnsure(email);
        if (payload.name !== undefined) { const n = _socCleanName(payload.name); if (n) u.name = n; }
        if (payload.share !== undefined) u.share = _socShare(Object.assign({}, u.share, payload.share));
        if (payload.off !== undefined) u.off = !!payload.off;
        if (payload.forFriend && typeof payload.forFriend === 'object' && (u.friends || []).indexOf(String(payload.forFriend.id)) !== -1) {          // (1.122.0) what one friend sees
          const fid = String(payload.forFriend.id), pf = Object.assign({}, (u.perFriend || {})[fid]), sh = payload.forFriend.share || {};
          ['crate', 'ratings', 'diary', 'playing', 'liked'].forEach(k => { if (sh[k] === false) pf[k] = false; else if (sh[k] === true) delete pf[k]; });
          u.perFriend = Object.assign({}, u.perFriend); if (Object.keys(pf).length) u.perFriend[fid] = pf; else delete u.perFriend[fid];
          try { CacheService.getScriptCache().remove('socfeed:' + fid); } catch (e) { /* it runs out in 5 minutes anyway */ }
        }
        if (u.off || !u.share.playing) CacheService.getScriptCache().put('soc:' + u.id, JSON.stringify({ at: u.off ? 0 : Date.now(), np: null }), SOC_CACHE_S);
        _socPut(email, u);
        return _socState(email, u);
      }));
    }

    if (action === 'socialNewCode') {                               // the old code stops working (a request already sent with it still stands)
      return _json(_socWithLock(() => {
        const u = _socEnsure(email), p = _socProps();
        p.deleteProperty('SOC_CODE_' + u.code);
        u.code = _socNewCode(); p.setProperty('SOC_CODE_' + u.code, u.id);
        _socPut(email, u);
        return _socState(email, u);
      }));
    }

    if (action === 'socialFeed') {
      const u = _socEnsure(email);
      return _json(_socFeed(email, u, !!payload.fresh));
    }

    if (action === 'socialRecommend') return _json(_socRecommend(email, _socEnsure(email), payload));
    if (action === 'socialRecs') return _json({ ok: true, social: true, recs: _socRecList(email), recStamp: Number(_socProps().getProperty('SOC_RECSTAMP_' + email) || 0) });
    if (action === 'socialRecSet') return _json(_socWithLock(() => _socRecSet(email, _socEnsure(email), payload.ids === 'allNew' ? 'allNew' : (Array.isArray(payload.ids) ? payload.ids.map(String) : []), String(payload.status || ''))));
    if (action === 'socialRecRelease') return _json(_socRecRelease(email, _socEnsure(email), payload.id));

    if (action === 'socialRelease') {
      const u = _socEnsure(email);
      return _json(_socRelease(email, u, String(payload.id || ''), payload.albumId, payload.artist, payload.title));
    }

    if (action === 'socialFriend') {
      const u = _socEnsure(email);
      return _json(_socFriendData(email, u, String(payload.id || ''), String(payload.what || 'all')));
    }

    return _json({ ok: false, social: true, error: 'Unknown action: ' + action });
  } catch (err) {
    return _json({ ok: false, social: true, error: String(err && err.message || err) });
  }
}
