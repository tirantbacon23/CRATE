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
  return { crate: on(s.crate), ratings: on(s.ratings), diary: on(s.diary), playing: on(s.playing) };
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
function _socView(fid, cache, now) {
  const femail = _socEmailOf(fid); if (!femail) return null;
  const f = _socGet(femail); if (!f) return null;
  const v = { id: fid, name: f.name || 'Friend', status: 'offline', np: null, seen: 0, last: null,
              share: { crate: !!f.share.crate, ratings: !!f.share.ratings, diary: !!f.share.diary } };
  if (f.off) return v;                                                  // "Appear offline": nothing about them at all
  let live = null; try { live = JSON.parse(cache.get('soc:' + fid) || 'null'); } catch (e) { live = null; }
  if (live && now - live.at < SOC_ONLINE_MS) {
    v.status = live.np && live.np.playing && f.share.playing ? 'playing' : 'online';
    if (f.share.playing && live.np) v.np = live.np;
    v.seen = live.at;
  } else {
    v.seen = Math.max(f.seen || 0, live ? live.at : 0);
  }
  if (f.share.playing) v.last = (live && live.np) || f.last || null;
  return v;
}

function _socState(email, u) {
  const cache = CacheService.getScriptCache(), now = Date.now();
  const people = (ids) => (ids || []).map(id => { const e = _socEmailOf(id), x = e && _socGet(e); return x ? { id: id, name: x.name || 'Someone' } : null; }).filter(Boolean);
  return {
    ok: true, social: true, now: now,
    me: { id: u.id, code: u.code, name: u.name, share: u.share, off: !!u.off },
    friends: (u.friends || []).map(id => _socView(id, cache, now)).filter(Boolean),
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
  const ss = _getUserSpreadsheet(femail), out = { ok: true, social: true, id: fid, name: f.name, share: { crate: !!f.share.crate, ratings: !!f.share.ratings, diary: !!f.share.diary } };
  const hidden = {};
  const want = (k) => !what || what === 'all' || what === k;
  if (f.share.crate && (want('crate') || want('diary'))) {
    const log = ss.getSheetByName(SHEET_NAME), rows = log ? _readSheet(log) : [];
    const crate = [];
    rows.forEach(r => {
      if (_socHidden(r)) { hidden[String(r.Artist).trim() + '\u0001' + String(r.Title).trim()] = true; return; }
      if (!want('crate')) return;
      const o = {}; SOC_CRATE_COLS.forEach(c => { if (r[c] !== '' && r[c] != null) o[c] = r[c]; });
      if (f.share.ratings && r.Rating !== '' && r.Rating != null) o.Rating = r.Rating;
      crate.push(o);
    });
    if (want('crate')) out.crate = crate;
  }
  if (f.share.diary && want('diary')) {
    const d = ss.getSheetByName('Diary'), rows = d ? _readSheet(d) : [];
    out.diary = rows.filter(r => !hidden[String(r.Artist).trim() + '\u0001' + String(r.Title).trim()]).map(r => {
      const o = { Date: r.Date, Artist: r.Artist, Title: r.Title, EntryTitle: r.EntryTitle, Description: r.Description, Full: r.Full, Timestamp: r.Timestamp };
      if (f.share.ratings) o.Rating = r.Rating;
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
    if (!f || (f.friends || []).indexOf(u.id) === -1 || (!f.share.crate && !f.share.diary)) return;
    let ss; try { ss = _getUserSpreadsheet(femail); } catch (e) { return; }
    const log = ss.getSheetByName(SHEET_NAME), rows = log ? _readSheet(log) : [], hidden = {}, covers = {};
    rows.forEach(r => { if (_socHidden(r)) hidden[k(r)] = true; else if (r.Cover) covers[k(r)] = https(r.Cover); });
    if (f.share.crate) rows.forEach(r => {
      if (_socHidden(r)) return;
      const at = Date.parse(r.DateAdded) || 0; if (at < since) return;
      items.push({ fid: fid, kind: 'added', at: at, artist: s(r.Artist, 200), title: s(r.Title, 200), year: s(r.ReleaseDate, 4), cover: https(r.Cover), rating: f.share.ratings ? Number(r.Rating) || 0 : 0 });
    });
    if (f.share.diary) {
      const d = ss.getSheetByName('Diary');
      (d ? _readSheet(d) : []).forEach(e => {
        if (hidden[k(e)]) return;
        const at = Date.parse(e.Timestamp) || Date.parse(e.Date) || 0; if (at < since) return;
        items.push({ fid: fid, kind: 'diary', at: at, date: s(e.Date, 10), artist: s(e.Artist, 200), title: s(e.Title, 200), cover: covers[k(e)] || '',
                     rating: f.share.ratings ? Number(e.Rating) || 0 : 0, entryTitle: s(e.EntryTitle, 200), text: s(e.Description, 280),
                     full: e.Full === true || e.Full === 'TRUE' || e.Full === 1 || e.Full === '1' });
      });
    }
  });
  items.sort((a, b) => b.at - a.at);
  const out = { ok: true, social: true, items: items.slice(0, SOC_FEED_MAX), at: Date.now() };
  try { cache.put(key, JSON.stringify(out), SOC_FEED_CACHE_S); } catch (e) { /* too big to keep: built again next time */ }
  return out;
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

    if (action === 'socialFriend') {
      const u = _socEnsure(email);
      return _json(_socFriendData(email, u, String(payload.id || ''), String(payload.what || 'all')));
    }

    return _json({ ok: false, social: true, error: 'Unknown action: ' + action });
  } catch (err) {
    return _json({ ok: false, social: true, error: String(err && err.message || err) });
  }
}
