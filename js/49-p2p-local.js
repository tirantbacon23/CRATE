// CRATE — P2P downloads and the Local player (1.98.0; rolling downloads 1.100.0).
// One part of the page's script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope.
//
// A folder chosen in Find on P2P (js/48-p2p.js) is downloaded through the CRATE for P2P add-on (0.2.0), which asks slskd for its songs in
// tracklist order. slskd saves each song into its downloads folder ("<downloads>\<the sharer's folder name>\<file>") once the whole file has
// arrived. CRATE reads that folder directly, with Chrome's folder access (you choose the folder once and allow it), so:
//  - "Download and play" starts the release at once: each song plays from your disk the moment it lands, while the rest download, and a song
//    that hasn't arrived yet is waited for (its progress shows in the player);
//  - afterwards, by default, each file is DELETED once it has been played, so nothing piles up on the disk ("After playing", in Find on P2P:
//    Delete the file / Keep up to a size / Keep everything);
//  - downloads show in Processing (category P2P): progress, songs that failed (Retry, or find another folder), and a folder that needs allowing.
// What has been downloaded is recorded on this device only (it's where the files are). The Local player is a plain <audio> element.
const P2P_DL_KEY = 'crate_p2p_dl_v1', P2P_KEEP_KEY = 'crate_p2p_keep_v1', P2P_LOCAL_VOL_KEY = 'crate_local_player_v1';
const p2pDl = (() => { try { const o = JSON.parse(localStorage.getItem(P2P_DL_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
function p2pDlSave() { try { localStorage.setItem(P2P_DL_KEY, JSON.stringify(p2pDl)); } catch (e) { /* storage full or blocked: kept for this visit */ } }
function p2pKeep() { try { return Object.assign({ mode: 'delete', capGb: 2, ahead: 1 }, JSON.parse(localStorage.getItem(P2P_KEEP_KEY) || '{}')); } catch (e) { return { mode: 'delete', capGb: 2, ahead: 1 }; } }
function p2pSetKeep(p) { try { localStorage.setItem(P2P_KEEP_KEY, JSON.stringify(Object.assign(p2pKeep(), p))); } catch (e) { /* this visit only */ } p2pTidy(); }
const p2pItemRefs = new Map();                                       // the releases P2P has been asked about this visit, by key
const p2pItemByKey = (k) => p2pItemRefs.get(k) || (state.raw || []).find(r => artKey(r) === k) || null;
const p2pActive = (s) => s.st === 'wait' || s.st === 'down';

// ----- slskd's downloads folder, through Chrome's folder access (kept in IndexedDB, asked again only when Chrome forgets) -----
let p2pDbP = null, p2pDir = null, p2pDirPerm = 'none';
function p2pDb() { return p2pDbP || (p2pDbP = new Promise((res, rej) => { try { const r = indexedDB.open('crate-p2p', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } })); }
async function p2pKvGet(k) { const db = await p2pDb(); return new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
async function p2pKvSet(k, v) { const db = await p2pDb(); return new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); }); }
const p2pFolderSupported = () => typeof window.showDirectoryPicker === 'function';
async function p2pDirCheck() {                                     // -> 'granted' | 'prompt' (allow it again) | 'none' (not chosen)
  try { if (!p2pDir) p2pDir = (await p2pKvGet('dlDir')) || null; } catch (e) { p2pDir = null; }
  try { p2pDirPerm = p2pDir ? await p2pDir.queryPermission({ mode: 'readwrite' }) : 'none'; } catch (e) { p2pDirPerm = 'none'; }
  if (p2pDirPerm === 'denied') p2pDirPerm = 'prompt';
  return p2pDirPerm;
}
async function p2pDirPick() {                                       // inside a click
  if (!p2pFolderSupported()) { flashGlobalToast('This browser can’t open a folder for CRATE. Chrome or Edge on a computer can.'); return false; }
  try { const d = await window.showDirectoryPicker({ id: 'crate-slskd-downloads', mode: 'readwrite' }); p2pDir = d; await p2pKvSet('dlDir', d); }
  catch (e) { return false; }                                       // cancelled
  await p2pDirCheck(); p2pRefreshUi(); p2pTick(); return p2pDirPerm === 'granted';
}
async function p2pDirAllow() {                                      // inside a click: Chrome asks again once in a while ("Allow on every visit" stops that)
  if (!p2pDir) await p2pDirCheck();
  if (!p2pDir) return p2pDirPick();
  try { p2pDirPerm = await p2pDir.requestPermission({ mode: 'readwrite' }); } catch (e) { p2pDirPerm = 'prompt'; }
  p2pRefreshUi(); p2pTick(); return p2pDirPerm === 'granted';
}
const P2P_BAD = /[<>:"\/\\|?*\u0000-\u001f]/g;
async function p2pLocate(path, size) {                               // the finished file in the downloads folder -> { dir, file } or null
  if (!p2pDir || p2pDirPerm !== 'granted') return null;
  const segs = String(path || '').split(/[\\/]+/).filter(Boolean), name = segs.pop() || '', folder = segs.pop() || '';
  const san = (x) => x.replace(P2P_BAD, '_').replace(/[. ]+$/, ''), base = name.replace(/\.[^.]+$/, ''), ext = (/\.[^.]+$/.exec(name) || [''])[0].toLowerCase();
  const names = [...new Set([name, san(name)])];
  const inDir = async (dh, dn) => {
    for (const n of names) { try { const f = await (await dh.getFileHandle(n)).getFile(); if (!size || f.size === size) return { dir: dn, file: n }; } catch (e) { /* not this name */ } }
    try { for await (const [n, h] of dh.entries()) if (h.kind === 'file' && n.toLowerCase().endsWith(ext) && (n.startsWith(base) || n.startsWith(san(base)))) { const f = await h.getFile(); if (!size || f.size === size) return { dir: dn, file: n }; } } catch (e) { /* unreadable */ }          // a copy slskd renamed ("Song_1234.flac")
    return null;
  };
  for (const dn of [...new Set([folder, san(folder)])].filter(Boolean)) { try { const r = await inDir(await p2pDir.getDirectoryHandle(dn), dn); if (r) return r; } catch (e) { /* no such folder */ } }
  try { const r = await inDir(p2pDir, ''); if (r) return r; } catch (e) { /* none */ }          // slskd set to put files straight into the folder
  return null;
}
async function p2pLocalFile(s) {                                     // the song's File, or null (gone, or no access)
  if (!s || !s.local || !p2pDir || p2pDirPerm !== 'granted') return null;
  try { const dh = s.local.dir ? await p2pDir.getDirectoryHandle(s.local.dir) : p2pDir; return await (await dh.getFileHandle(s.local.file)).getFile(); } catch (e) { return null; }
}
async function p2pDelete(rec, s) {                                   // the file goes; the record says so
  if (s.local && p2pDir && p2pDirPerm === 'granted') {
    try { const dh = s.local.dir ? await p2pDir.getDirectoryHandle(s.local.dir) : p2pDir; await dh.removeEntry(s.local.file); } catch (e) { /* already gone */ }
    if (s.local.dir) { try { await p2pDir.removeEntry(s.local.dir); } catch (e) { /* not empty yet */ } }
  }
  s.local = null; s.st = 'gone';
  if (s.id) p2pCall('dlremove', { user: rec.user, id: s.id });          // tidy slskd's list too
}
async function p2pTidy() {                                          // "After playing": delete played files, or the oldest beyond the size limit
  if (p2pDirPerm !== 'granted') return;
  const keep = p2pKeep(), cur = p2pLocalCur && p2pAudio && !p2pAudio.ended ? p2pLocalCur.s : null;          // the song playing (or paused) stays; one that has ended can go
  const all = []; Object.values(p2pDl).forEach(rec => rec.songs.forEach(s => { if (s.st === 'done' && s.local && s !== cur) all.push([rec, s]); }));
  if (keep.mode === 'delete') {                                      // played ones go; so do ones skipped past (outside the window, a few seconds after they arrived), which can be fetched again; a release fetched whole keeps its unplayed songs a day
    const want = p2pWanted();
    for (const [rec, s] of all) if (s.played || (!rec.keepAll && !want.has(s) && Date.now() - (s.doneAt || 0) > 8000) || Date.now() - (s.doneAt || 0) > 24 * 3600000) await p2pDelete(rec, s);
  }
  else if (keep.mode === 'cap') {
    let total = all.reduce((a, [, s]) => a + (s.size || 0), 0); const cap = Math.max(0.1, Number(keep.capGb) || 2) * 1e9;
    all.sort(([, a], [, b]) => (!!b.played - !!a.played) || (a.playedAt || a.doneAt || 0) - (b.playedAt || b.doneAt || 0));
    for (const [rec, s] of all) { if (total <= cap) break; total -= s.size || 0; await p2pDelete(rec, s); }
  }
  p2pDlSave();
}

// ----- downloading -----
// (1.100.0) Downloads roll: a release's chosen folder is remembered (all its songs, each 'idle' until wanted), and only the songs the queue is
// about to play are fetched: the one playing and the next "Ahead" (1 unless you change it). Songs that fall out of that window (you skipped,
// stopped, or played something else) are cancelled after a short grace; played ones are deleted as "After playing" says. "Download all" fetches
// the whole release, for keeping. A release you chose to play from P2P ("prefer") plays from it every time, fetching songs again as needed.
const p2pIdle = (s) => s.st === 'idle' || s.st === 'gone';
function p2pMakeRec(item, choice) {                                  // the release's remembered folder: every song it has, nothing requested yet
  const key = artKey(item), old = p2pDl[key]; p2pItemRefs.set(key, item);
  if (old && old.user === choice.user && old.dir === choice.dir) return old;
  const wasPreferred = !!(old && old.prefer);
  if (old) p2pForget(key, true);
  const tracks = choice.tracks || [], songs = [];
  (choice.songs || []).forEach((fi, k) => { const f = fi >= 0 && choice.files[fi]; if (f && f.path) songs.push({ k, tn: tracks[k] ? tracks[k].n : k + 1, name: tracks[k] ? tracks[k].t : f.name, path: f.path, size: f.size || 0, st: 'idle', pct: 0 }); });
  if (!songs.length) return null;
  const rec = p2pDl[key] = { key, artist: item.artist || '', title: item.title || '', user: choice.user, dir: choice.dir, folder: choice.name, at: Date.now(), songs, prefer: wasPreferred, keepAll: false };          // a release played from P2P keeps playing from it with its new source
  p2pDlSave(); return rec;
}
async function p2pRequest(rec, songs) {                              // ask slskd for these songs (idle, gone, or failed ones being retried)
  songs = songs.filter(s => p2pIdle(s) || s.st === 'fail'); if (!songs.length) return true;
  songs.forEach(s => { s.st = 'wait'; s.pct = 0; s.err = ''; s.id = ''; s.local = null; s.played = false; s.unwanted = 0; });          // claimed at once, so a second call can't ask twice
  p2pDlSave();
  const r = await p2pCall('download', { user: rec.user, files: songs.map(s => ({ path: s.path, size: s.size })) }, 30000);
  if (!r.ok) { songs.forEach(s => { s.st = 'fail'; s.err = p2pWhy(r); }); p2pDlSave(); jobsRefresh(); return false; }
  const failed = new Set(r.failed || []); songs.forEach(s => { if (failed.has(s.path)) { s.st = 'fail'; s.err = 'slskd couldn’t queue it'; } });
  p2pDlSave(); jobsRefresh(); return true;
}
function p2pAhead() { return Math.max(0, Math.min(5, Math.round(Number(p2pKeep().ahead) || 1))); }
function p2pWanted() {                                               // the songs that should be here or on their way: the queue's window, and releases fetched whole
  const want = new Set();
  if (isPlayingCrateQueue()) for (let j = crateQueueIndex; j <= Math.min(crateQueueList.length - 1, crateQueueIndex + p2pAhead()); j++) {
    const e = crateQueueList[j], rec = e && e.item && p2pDl[artKey(e.item)], so = rec && p2pSongFor(e.item, e.track);
    if (so && (rec.prefer || !p2pIdle(so) || j === crateQueueIndex)) want.add(so);
  }
  Object.values(p2pDl).forEach(rec => { if (rec.keepAll) rec.songs.forEach(so => { if (so.st !== 'fail' && !(so.st === 'gone' && so.played)) want.add(so); }); });
  return want;
}
let p2pSyncing = false;
async function p2pSyncWindow() {                                     // fetch what the window wants; let go of what it no longer does
  if (p2pSyncing || !p2p.ready) return; p2pSyncing = true;
  try {
    const want = p2pWanted(), now = Date.now();
    for (const rec of Object.values(p2pDl)) {
      const ask = rec.songs.filter(so => want.has(so) && p2pIdle(so) && (rec.prefer || rec.keepAll));
      if (ask.length) await p2pRequest(rec, ask);
      for (const so of rec.songs) {
        if (!p2pActive(so) || want.has(so) || rec.keepAll) { so.unwanted = 0; continue; }
        if (!so.unwanted) { so.unwanted = now; continue; }
        if (now - so.unwanted > 5000) { if (so.id) await p2pCall('dlremove', { user: rec.user, id: so.id }); so.st = 'idle'; so.id = ''; so.pct = 0; so.unwanted = 0; }          // skipped past it: no longer fetched
      }
    }
    p2pDlSave();
  } finally { p2pSyncing = false; }
}
async function p2pDownload(item, choice, play, quiet) {              // inside a click (it may ask for the folder first); quiet: started by CRATE itself, so no asking
  if (!item || !choice) return;
  if (quiet) await p2pDirCheck();
  else if (p2pFolderSupported()) { await p2pDirCheck(); if (p2pDirPerm === 'prompt') await p2pDirAllow(); else if (p2pDirPerm === 'none') { flashGlobalToast('Choose slskd’s downloads folder, so CRATE can play and tidy what arrives.'); await p2pDirPick(); } }
  const rec = p2pMakeRec(item, choice);
  if (!rec) { flashGlobalToast('That folder has no songs from this release’s tracklist to download.'); return; }
  rec.prefer = true;
  if (!play) { rec.keepAll = true; p2pDlSave(); await p2pSyncWindow(); p2pTick(); if (!quiet) flashGlobalToast(`Downloading all of ${item.title} (${rec.songs.length} songs).`); return; }
  p2pDlSave();
  if (!quiet) flashGlobalToast(`Playing ${item.title} from Soulseek: each song downloads just before it plays.`);
  playAlbumReplacingQueue(item);
}
// ----- (1.107.0) a sharer who refuses you ("Verification required", banned, not shared…): remembered a week, never picked again, and the
// release switches to the next-best folder from someone else by itself (a new, paced search), the song carrying on from there -----
const P2P_REFUSE_KEY = 'crate_p2p_refused_v1', P2P_REFUSAL = /reject|verif|ban|denied|not shared|too many|blocked|forbidden|file not|queue full|unavailable/i;
const p2pRefused = (() => { try { return JSON.parse(localStorage.getItem(P2P_REFUSE_KEY) || '{}') || {}; } catch (e) { return {}; } })();
function p2pRefuses(user) { const r = user && p2pRefused[user]; return r && Date.now() - r.at < 7 * 86400000 ? r : null; }
function p2pNoteRefusal(user, why) { p2pRefused[user] = { at: Date.now(), why: String(why || '').slice(0, 120) }; try { localStorage.setItem(P2P_REFUSE_KEY, JSON.stringify(p2pRefused)); } catch (e) { /* this visit */ } }
const p2pSwitching = new Set();
async function p2pSwitchSource(key) {                                // -> true when the release now has a source from someone else
  if (p2pSwitching.has(key)) return false;
  const item = p2pItemByKey(key), old = p2pDl[key]; if (!item || !old) return false;
  p2pSwitching.add(key); jobsRefresh();
  try {
    const tracks = ((await Promise.resolve(getTracksFor(item)).catch(() => [])) || []).filter(t => t && t.trackName);
    let folders = [];
    for (const q of p2pQueries(item)) { const r = await p2pSearchFolders(q); if (!r.ok) return false; folders = r.folders.filter(f => !p2pRefuses(f.user)); if (folders.length) break; }
    const best = p2pBestOf(p2pRank(folders, tracks, item, p2pPrefs()));
    if (!best) { flashGlobalToast(`${old.user} refused ${item.title}, and no one else has a good copy right now.`); return false; }
    p2pChoose(item, best, tracks); p2pMakeRec(item, p2pChoiceFor(item));
    flashGlobalToast(`${old.user} refused (${(p2pRefuses(old.user) || {}).why || 'refused'}): switched ${item.title} to ${best.user}.`);
    if (typeof jobsDone === 'function') jobsDone('p2p', `Switched ${item.title} to ${best.name}, from ${best.user} (${old.user} refused)`, { k: key });
    p2pSyncWindow(); return true;
  } finally { p2pSwitching.delete(key); jobsRefresh(); }
}
async function p2pForget(key, quiet) {                               // the folder for this release is forgotten: downloads stop, files go
  const rec = p2pDl[key]; if (!rec) return;
  for (const so of rec.songs) { if (p2pActive(so) && so.id) await p2pCall('dlremove', { user: rec.user, id: so.id }); if (so.local && !(p2pLocalCur && p2pLocalCur.s === so)) await p2pDelete(rec, so); }
  delete p2pDl[key]; p2pDlSave(); jobsRefresh(); if (!quiet) flashGlobalToast(`Forgot the folder for ${rec.title}.`);
}
async function p2pCancel(key) {
  const rec = p2pDl[key]; if (!rec) return;
  rec.keepAll = false;
  for (const s of rec.songs) if (p2pActive(s)) { if (s.id) await p2pCall('dlremove', { user: rec.user, id: s.id }); s.st = 'idle'; s.id = ''; s.pct = 0; }
  p2pDlSave(); p2pTidy(); jobsRefresh(); flashGlobalToast(`Stopped downloading ${rec.title}.`);
}
async function p2pRetry(key) {
  const rec = p2pDl[key]; if (!rec) return; const again = rec.songs.filter(s => s.st === 'fail'); if (!again.length) return;
  for (const s of again) if (s.id) await p2pCall('dlremove', { user: rec.user, id: s.id });
  rec.dismissed = false; await p2pRequest(rec, again); p2pTick();
}
let p2pTicking = false, p2pTidiedOnce = false;
async function p2pTick() {                                          // every 2 s while something is on its way: slskd's progress, and finished files found on disk
  if (p2pTicking) return; p2pTicking = true;
  try {
    await p2pDirCheck();
    if (p2pDirPerm === 'granted' && !p2pTidiedOnce) { p2pTidiedOnce = true; await p2pTidy(); }
    if (p2p.ready) await p2pSyncWindow();
    const recs = Object.values(p2pDl).filter(rec => rec.songs.some(s => p2pActive(s) || (s.st === 'done' && !s.local)));
    if (!recs.length || !p2p.ready) return;
    for (const user of [...new Set(recs.map(r => r.user))]) {
      const r = await p2pCall('dlstatus', { user }); if (!r.ok) continue;
      const by = new Map((r.transfers || []).map(t => [t.path, t]));
      for (const rec of recs.filter(x => x.user === user)) for (const s of rec.songs) {
        const t = by.get(s.path);
        if (t && p2pActive(s)) {
          s.id = t.id; s.pct = t.pct; s.speed = t.speed; s.place = t.place;
          if (/Succeeded/i.test(t.state)) { s.st = 'done'; s.doneAt = Date.now(); s.pct = 100; }
          else if (/Completed/i.test(t.state)) { s.st = 'fail'; s.err = (t.error || t.state.replace(/^Completed,\s*/, '')).slice(0, 160); if (P2P_REFUSAL.test(s.err + ' ' + t.state)) { p2pNoteRefusal(rec.user, s.err); if (rec.prefer || rec.keepAll) p2pSwitchSource(rec.key); } }          // (1.107.0) refused: someone else
          else s.st = /InProgress|Initializing/i.test(t.state) ? 'down' : 'wait';
        }
        if (s.st === 'done' && !s.local) { const loc = await p2pLocate(s.path, s.size); if (loc) s.local = loc; }
      }
      for (const rec of recs.filter(x => x.user === user)) if (rec.keepAll && !rec.logged && rec.songs.every(s => !p2pActive(s))) {          // (a whole release fetched for keeping)
        rec.logged = true; const ok = rec.songs.filter(s => s.st === 'done' || s.st === 'gone').length;
        if (typeof jobsDone === 'function') jobsDone('p2p', `Downloaded ${rec.title}: ${ok} of ${rec.songs.length} songs`, { k: rec.key });
      }
    }
    p2pDlSave(); p2pTidy();
  } finally { p2pTicking = false; p2pRefreshUi(); }
}
setInterval(() => { if (!document.hidden || Object.values(p2pDl).some(r => r.songs.some(p2pActive))) p2pTick(); }, 2000);

// ----- Processing (category P2P) -----
function p2pJobs(run, need) {
  p2pSwitching.forEach(k => { const r = p2pDl[k]; run.push({ cat: 'p2p', icon: 'search', title: `Finding another sharer for ${r ? r.title : 'a release'}`, sub: r ? `${r.user} refused` : '', pct: null, detail: r && p2pRefuses(r.user) ? p2pRefuses(r.user).why : '' }); });
  if (p2pNewQ.length && p2pNewOn()) run.push({ cat: 'p2p', icon: 'search', title: 'Finding new releases on Soulseek', sub: `${p2pNewQ.length} waiting`, pct: null, detail: p2pNewState.now ? `Searching for ${p2pNewState.now}` : `${p2pNewQ.filter(e => e.tries).length ? 'some wait for their tracklist; ' : ''}one every 2 minutes, remembering the best folder for each (nothing is downloaded)`, acts: [{ icon: 'x', label: 'Stop', fn: () => { p2pNewQ.length = 0; p2pNewSave(); jobsRefresh(); } }] });
  p2pAutoFlight.forEach(f => run.push({ cat: 'p2p', icon: 'search', title: `Looking for ${f.title} on Soulseek`, sub: f.artist, pct: null, detail: 'A song of it has no link Spotify or YouTube can play: a sure match will be downloaded and played' }));
  Object.entries(p2pAutoMissed).forEach(([k, m]) => { if (Date.now() - m.at > 6 * 3600000 || m.dismissed) return; need.push({ cat: 'p2p', icon: 'search', title: `${m.title}: no good match on Soulseek`, detail: m.isNew ? `Added to your crate: ${m.why}.` : `${m.why}. Its songs without a link were skipped.`, acts: [{ label: 'Pick a folder', fn: () => { const it = p2pItemByKey(k); if (it) p2pOpen(it); }, opens: true, primary: true }, { label: 'Dismiss', fn: () => { m.dismissed = true; } }] }); });
  const recs = Object.values(p2pDl);
  recs.forEach(rec => {
    const n = rec.songs.length, active = rec.songs.filter(p2pActive), done = rec.songs.filter(s => s.st === 'done' || s.st === 'gone').length, failed = rec.songs.filter(s => s.st === 'fail');
    if (active.length) {
      const pct = rec.songs.reduce((a, s) => a + (s.st === 'done' || s.st === 'gone' ? 100 : s.st === 'fail' ? 0 : s.pct || 0), 0) / n, now = active.find(s => s.st === 'down'), w = active.find(s => s.st === 'wait');
      run.push({ cat: 'p2p', icon: 'note', title: `Downloading ${rec.title}`, sub: rec.artist, pct,
        detail: [`${done} of ${n} songs`, now ? `song ${now.tn} ${Math.round(now.pct || 0)}%${now.speed ? ' · ' + p2pSize(now.speed) + '/s' : ''}` : w && w.place ? `waiting in ${rec.user}’s queue (place ${w.place})` : `from ${rec.user}`].join(' · '),
        acts: [{ icon: 'x', label: 'Stop downloading', fn: () => p2pCancel(rec.key) }] });
    }
    if (failed.length && !rec.dismissed) need.push({ cat: 'p2p', icon: 'warn', tone: 'warn', title: `${failed.length} song${failed.length === 1 ? '' : 's'} of ${rec.title} didn’t download`, detail: `${failed.slice(0, 3).map(s => s.name).join(', ')}${failed.length > 3 ? '…' : ''} · ${failed[0].err || 'the transfer failed'}`,
      acts: [{ label: 'Retry', fn: () => p2pRetry(rec.key), primary: true }, { label: 'Find another folder', fn: () => { const it = p2pItemByKey(rec.key); if (it) p2pOpen(it); }, opens: true }, { label: 'Dismiss', fn: () => { rec.dismissed = true; p2pDlSave(); p2pTidy(); } }] });
  });
  if (p2pDirPerm !== 'granted' && recs.some(rec => rec.songs.some(s => s.st === 'done' && !s.local) || rec.songs.some(p2pActive)))
    need.push({ cat: 'p2p', icon: 'warn', tone: 'warn', title: p2pDir ? 'Allow CRATE to open slskd’s downloads folder again' : 'Choose slskd’s downloads folder',
      detail: 'So CRATE can play what arrives, and delete it after playing. Chrome asks again once in a while; "Allow on every visit" stops that.', acts: [{ label: p2pDir ? 'Allow' : 'Choose folder', fn: () => { p2pDir ? p2pDirAllow() : p2pDirPick(); }, primary: true }] });
}

// ----- the queue: a release with downloaded (or downloading) songs plays them from disk -----
function p2pSongFor(item, track) {
  const rec = item && p2pDl[artKey(item)]; if (!rec || !track) return null;
  const name = track.trackName || '', num = String(track.trackNumber || '');
  return rec.songs.find(s => String(s.tn) === num && s.name === name) || rec.songs.find(s => s.name === name) || null;
}
function p2pWouldTake(item, track) {                                // the same test p2pQueueTake makes, without starting anything
  const rec = item && p2pDl[artKey(item)], s = p2pSongFor(item, track);
  return !!(s && s.st !== 'fail' && !(p2pIdle(s) && !rec.prefer) && !(s.st === 'done' && !s.local && p2pDirPerm !== 'granted'));
}
function p2pQueueTake(myId, index, item, track) {                   // called by playCrateQueueIndex: true when this song is ours to play (now, or once it lands)
  const rec = item && p2pDl[artKey(item)], rec0 = rec, s = p2pSongFor(item, track); if (item) p2pItemRefs.set(artKey(item), item);
  if (!s || s.st === 'fail') return false;                           // not in the folder, or it failed: the usual sources play it
  if (p2pIdle(s) && !rec.prefer) return false;                        // a release not played from P2P: its own links
  if (s.st === 'done' && !s.local && p2pDirPerm !== 'granted') return false;          // here, but CRATE can't open the folder: play it another way
  let told = false;
  p2pSyncWindow();                                                    // this song, and the next ones, on their way
  let s0 = s;
  const go = async () => {
    if (myId !== crateQueueId || crateQueueIndex !== index) return;
    const key = artKey(item), now = p2pSongFor(item, track); if (now && now !== s0) s0 = now;          // (1.107.0) the release switched source: its song there
    const s = s0, rec = p2pDl[key] || rec0;
    if (s.st === 'fail' && p2pSwitching.has(key)) { p2pShowWaiting(item, track, s); el.miniPlayerTimeCurrent.textContent = 'finding another sharer\u2026'; setTimeout(go, 800); return; }
    if (s.st === 'done' && s.local) { const f = await p2pLocalFile(s); if (myId !== crateQueueId || crateQueueIndex !== index) return; if (f) { p2pLocalPlay(f, item, track, rec, s); p2pSyncWindow(); return; } s.local = null; s.st = 'idle'; p2pSyncWindow(); }
    if (s.st === 'fail') { flashGlobalToast(`"${track.trackName}" didn’t download: playing on.`); playCrateQueueIndex(myId, index + 1); return; }
    if (p2pIdle(s)) p2pSyncWindow();
    p2pShowWaiting(item, track, s); if (!told) { told = true; flashGlobalToast(`Waiting for "${track.trackName}" to arrive…`); }
    setTimeout(go, 800);
  };
  go(); return true;
}
function p2pShowWaiting(item, track, s) {                           // the player shows the song, with how far its download has got
  if (activePlayerEngine !== 'local' || (p2pLocalCur && p2pLocalCur.s !== s)) { stopOtherEngines('local'); p2pLocalStop(); setMasterPlayerEngine('local'); }
  p2pMiniPlayerFor(item, track);
  const t = s.st === 'down' ? `↓ ${Math.round(s.pct || 0)}%` : s.place ? `queue ${s.place}` : '↓ waiting';
  if (el.miniPlayerTimeCurrent.textContent !== t) el.miniPlayerTimeCurrent.textContent = t;
  setMiniPlayerPlayPauseIcon(true);
}

// ----- (1.103.0) what the file is: read from its first bytes (format, sample rate, bit depth, channels, encoding), shown in Track Info -----
function p2pParseAudioHeader(b, size, durSec) {                     // b: the file's first bytes (Uint8Array) -> { format, rate, bits, channels, mode, kbps, vbr } (what could be read)
  const out = {}, str = (o, n) => String.fromCharCode(...b.subarray(o, o + n)), u32le = (o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0, u16le = (o) => b[o] | b[o + 1] << 8;
  if (b.length >= 26 && str(0, 4) === 'fLaC') {                     // FLAC: STREAMINFO, the first metadata block
    const o = 18; out.format = 'FLAC'; out.rate = (b[o] << 12) | (b[o + 1] << 4) | (b[o + 2] >> 4); out.channels = ((b[o + 2] >> 1) & 7) + 1; out.bits = (((b[o + 2] & 1) << 4) | (b[o + 3] >> 4)) + 1;
    const samples = (b[o + 3] & 15) * 4294967296 + ((b[o + 4] << 24 | b[o + 5] << 16 | b[o + 6] << 8 | b[o + 7]) >>> 0); if (!durSec && samples && out.rate) durSec = samples / out.rate;
  } else if (b.length >= 12 && str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE') {          // WAV: the fmt chunk
    for (let o = 12; o + 8 < b.length;) { const id = str(o, 4), len = u32le(o + 4); if (id === 'fmt ') { out.format = u16le(o + 8) === 3 ? 'WAV (float)' : 'WAV'; out.channels = u16le(o + 10); out.rate = u32le(o + 12); out.bits = u16le(o + 22); break; } o += 8 + len + (len & 1); }
  } else if (b.length >= 4 && str(0, 4) === 'OggS') {               // Ogg: Vorbis or Opus, from the first packet
    const v = b.findIndex((x, i) => x === 1 && str(i + 1, 6) === 'vorbis'), op = (() => { for (let i = 0; i < Math.min(b.length - 8, 400); i++) if (str(i, 8) === 'OpusHead') return i; return -1; })();
    if (v >= 0) { out.format = 'Ogg Vorbis'; out.channels = b[v + 11]; out.rate = u32le(v + 12); }
    else if (op >= 0) { out.format = 'Opus'; out.channels = b[op + 9]; out.rate = 48000; }
  } else {                                                           // MP3: past an ID3 tag, the first frame's header
    let o = 0; if (b.length > 10 && str(0, 3) === 'ID3') o = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
    for (; o + 4 < b.length; o++) if (b[o] === 255 && (b[o + 1] & 0xE0) === 0xE0 && ((b[o + 1] >> 1) & 3) === 1 && ((b[o + 2] >> 4) & 15) !== 15 && ((b[o + 2] >> 2) & 3) !== 3) break;          // a Layer III frame
    if (o + 4 < b.length) {
      const ver = (b[o + 1] >> 3) & 3, mpeg1 = ver === 3, bi = (b[o + 2] >> 4) & 15, si = (b[o + 2] >> 2) & 3, mode = (b[o + 3] >> 6) & 3;
      const rates = mpeg1 ? [44100, 48000, 32000] : ver === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000], kb = mpeg1 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
      out.format = 'MP3'; out.rate = rates[si]; out.channels = mode === 3 ? 1 : 2; out.mode = ['Stereo', 'Joint stereo', 'Dual channel', 'Mono'][mode];
      const side = mpeg1 ? (mode === 3 ? 17 : 32) : (mode === 3 ? 9 : 17), tag = str(o + 4 + side, 4);
      if (tag === 'Xing' || tag === 'VBRI') out.vbr = true; else if (tag !== 'Info' && kb[bi]) out.kbps = kb[bi];
    }
  }
  if (!out.kbps && size && durSec) out.kbps = Math.round(size * 8 / durSec / 1000);          // lossless or VBR: the average
  if (out.channels && !out.mode) out.mode = out.channels === 1 ? 'Mono' : out.channels === 2 ? 'Stereo' : `${out.channels} channels`;
  return out;
}
function p2pQualityText(info, ext) {                                  // "FLAC · 16-bit / 44.1 kHz · Stereo · 905 kbps"
  if (!info) return '';
  const fmt = info.format || String(ext || '').toUpperCase(), khz = info.rate ? `${(info.rate / 1000).toFixed(info.rate % 1000 ? 1 : 0)} kHz` : '';
  return [fmt, info.bits && khz ? `${info.bits}-bit / ${khz}` : khz, info.mode, info.kbps ? `${info.vbr ? 'VBR ~' : ''}${info.kbps} kbps` : info.vbr ? 'VBR' : ''].filter(Boolean).join(' · ');
}
async function p2pFileInfo(file, durSec) {
  try { const b = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()); return p2pParseAudioHeader(b, file.size, durSec); } catch (e) { return null; }
}
function p2pQualityPaint() {                                         // the line above Track Info's cover, while a file plays
  if (!el.trackInfoArtWrap) return;
  let q = document.getElementById('trackInfoQuality');
  if (!q) { q = document.createElement('p'); q.id = 'trackInfoQuality'; q.className = 'track-info-quality'; el.trackInfoArtWrap.insertAdjacentElement('beforebegin', q); }
  const cur = activePlayerEngine === 'local' && p2pLocalCur, text = cur && cur.info ? p2pQualityText(cur.info, cur.ext) : '';
  q.hidden = !text; if (text) { q.innerHTML = `<span class="tiq-tag">File</span>${escapeHtml(text)}`; q.title = `Playing from a file on this computer${cur.rec ? `, from ${cur.rec.user} on Soulseek` : ''}`; }
}

// ----- the Local player -----
let p2pAudio = null, p2pLocalCur = null, p2pLocalPaused = true;
function p2pLocalVol() { try { const v = JSON.parse(localStorage.getItem(P2P_LOCAL_VOL_KEY) || '{}').volume; return Number.isFinite(v) ? v : 70; } catch (e) { return 70; } }
function p2pAudioEl() {
  if (p2pAudio) return p2pAudio;
  const a = p2pAudio = new Audio(); a.preload = 'auto';
  a.addEventListener('play', () => { p2pLocalPaused = false; if (activePlayerEngine === 'local') setMiniPlayerPlayPauseIcon(false); });
  a.addEventListener('pause', () => { p2pLocalPaused = true; if (activePlayerEngine === 'local') setMiniPlayerPlayPauseIcon(true); });
  a.addEventListener('ended', p2pLocalEnded);
  a.addEventListener('error', () => { if (!p2pLocalCur) return; flashGlobalToast(`Couldn’t play "${p2pLocalCur.track.trackName}" from the file: playing on.`); if (isPlayingCrateQueue()) playCrateQueueIndex(crateQueueId, crateQueueIndex + 1); });
  return a;
}
function p2pMiniPlayerFor(item, track) {
  el.miniPlayer.hidden = false;
  if (!el.miniPlayer.classList.contains('detached')) document.body.classList.add('has-mini-player');
  el.miniPlayerTitle.textContent = track.trackName || ''; el.miniPlayerTitle.title = track.trackName || '';
  el.miniPlayerArt.src = item ? (item.cover || state.artCache[artKey(item)]?.art || placeholderArt(item)) : NO_ART_FALLBACK;
  refreshMiniPlayerMeta();
}
function p2pLocalPlay(file, item, track, rec, s) {
  stopOtherEngines('local'); setMasterPlayerEngine('local');
  const a = p2pAudioEl();
  if (p2pLocalCur && p2pLocalCur.url) URL.revokeObjectURL(p2pLocalCur.url);
  const url = URL.createObjectURL(file);
  p2pLocalCur = { item, track, rec, s, url, trackName: track.trackName || '', ext: (/\.([A-Za-z0-9]{1,5})$/.exec(file.name || (s && s.path) || '') || [])[1] || '' };
  p2pMiniPlayerFor(item, track);
  const me = p2pLocalCur; p2pQualityPaint();
  p2pFileInfo(file, 0).then(info => { if (p2pLocalCur !== me) return; me.info = info; p2pQualityPaint(); });          // (1.103.0) the file's format and quality
  a.addEventListener('loadedmetadata', () => { if (p2pLocalCur !== me || !me.info || !isFinite(a.duration)) return; if (!me.info.kbps || me.info.vbr || /FLAC|WAV|Opus|Vorbis/.test(me.info.format || '')) { me.info.kbps = Math.round(file.size * 8 / a.duration / 1000); p2pQualityPaint(); } }, { once: true });
  a.src = url; a.volume = Math.max(0, Math.min(1, p2pLocalVol() / 100));
  a.play().then(() => { if (typeof vizLocalStarted === 'function') vizLocalStarted(); }).catch(() => { setMiniPlayerPlayPauseIcon(true); flashGlobalToast('Press Play to start.'); });          // (1.103.0) the meter listens to the file directly
}
function p2pLocalStop() { if (p2pAudio) { try { p2pAudio.pause(); } catch (e) { /* none */ } } if (p2pLocalCur && p2pLocalCur.url) URL.revokeObjectURL(p2pLocalCur.url); p2pLocalCur = null; p2pQualityPaint(); }
function p2pLocalToggle() { if (!p2pAudio || !p2pLocalCur) return; if (p2pAudio.paused) p2pAudio.play().catch(() => {}); else p2pAudio.pause(); }
function p2pLocalSeek(ms) { if (p2pAudio && p2pLocalCur) { try { p2pAudio.currentTime = Math.max(0, ms / 1000); } catch (e) { /* not ready */ } } }
const p2pLocalPos = () => p2pAudio && p2pLocalCur ? (p2pAudio.currentTime || 0) * 1000 : 0;
const p2pLocalDur = () => p2pAudio && p2pLocalCur && isFinite(p2pAudio.duration) ? p2pAudio.duration * 1000 : 0;
function p2pLocalSetVolume(v) { try { localStorage.setItem(P2P_LOCAL_VOL_KEY, JSON.stringify({ volume: v })); } catch (e) { /* this visit */ } if (p2pAudio) p2pAudio.volume = Math.max(0, Math.min(1, v / 100)); }
function p2pLocalEnded() {
  const cur = p2pLocalCur; if (!cur) return;
  if (state.loop === 'song') { p2pAudio.currentTime = 0; p2pAudio.play().catch(() => {}); return; }
  cur.s.played = true; cur.s.playedAt = Date.now(); p2pDlSave();
  setMiniPlayerPlayPauseIcon(true);
  if (isPlayingCrateQueue()) playCrateQueueIndex(crateQueueId, crateQueueAfterEnd(crateQueueIndex));
  setTimeout(p2pTidy, 500);                                          // (after the next song has started: the one that just ended can go)
}

// ----- (1.99.0) when nothing else can play a song: find the release on Soulseek, download it, and play the song as it arrives -----
// Playing (the queue, or one song) reaches a song with no YouTube or SoundCloud link that Spotify doesn't have either. Instead of skipping
// it, CRATE searches Soulseek for the release, and if a folder is a Sure match it chooses it, downloads it (the whole release, so the next
// songs are ready too) and plays the song once it lands. No sure match: the song is skipped as before, and Processing offers to pick a folder.
// Player Controls → Panel Settings… turns it off.
const P2P_AUTO_KEY = 'crate_p2p_auto_v1', p2pAutoFlight = new Map(), p2pAutoMissed = {};
function p2pAutoOn() { try { return localStorage.getItem(P2P_AUTO_KEY) !== '0'; } catch (e) { return true; } }
function p2pSetAuto(on) { try { localStorage.setItem(P2P_AUTO_KEY, on ? '1' : '0'); } catch (e) { /* this visit only */ } }
function p2pAutoGet(item) {                                         // -> Promise<boolean>: the release is now downloading (or already was)
  const key = artKey(item);
  if (p2pDl[key]) { p2pDl[key].prefer = true; p2pDlSave(); return Promise.resolve(true); }          // its folder is remembered: no search
  const chosen = p2pChoiceFor(item); if (chosen && p2pMakeRec(item, chosen)) { p2pDl[key].prefer = true; p2pDlSave(); return Promise.resolve(true); }
  if (p2pAutoFlight.has(key)) return p2pAutoFlight.get(key).pr;
  const pr = (async () => {
    const tracks = ((await Promise.resolve(getTracksFor(item)).catch(() => [])) || []).filter(t => t && t.trackName);
    const qs = p2pQueries(item);          // (1.102.0) with the year, then without it, then the title alone
    let folders = [];
    for (const q of qs) { const r = await p2pSearchFolders(q); if (!r.ok) { p2pAutoMissed[key] = { at: Date.now(), why: p2pWhy(r), title: item.title }; return false; } folders = r.folders; if (folders.length) break; }
    const best = p2pBestOf(p2pRank(folders, tracks, item, p2pPrefs()));          // (1.101.0) a sure match, else a likely one
    if (!best) { p2pAutoMissed[key] = { at: Date.now(), why: folders.length ? `${folders.length} folder${folders.length === 1 ? '' : 's'} found, none a good match` : 'nothing found', title: item.title }; return false; }
    p2pChoose(item, best, tracks); const rec = p2pMakeRec(item, p2pChoiceFor(item)); if (rec) { rec.prefer = true; p2pDlSave(); }
    return !!rec;
  })();
  p2pAutoFlight.set(key, { pr, title: item.title || '', artist: item.artist || '' }); jobsRefresh();
  pr.finally(() => { p2pAutoFlight.delete(key); jobsRefresh(); });
  return pr;
}
function p2pAutoTake(myId, index, item, track, opts) {               // called where playback would skip a song (or, Play from Soulseek, before anything): true when CRATE looks for it there
  if ((!p2pAutoOn() && !(opts && opts.force)) || !p2p.ready || !p2p.configured || !item || !track || !track.trackName) return false;
  const miss = p2pAutoMissed[artKey(item)]; if (miss && Date.now() - miss.at < 15 * 60000) return false;          // looked a moment ago and found nothing sure
  const rec0 = p2pDl[artKey(item)]; if (rec0) { rec0.prefer = true; p2pDlSave(); }
  if (p2pSwitching.has(artKey(item))) { const s = p2pSongFor(item, track); if (s) { s.st = 'idle'; } }          // (1.107.0) switching sharers: this song comes from the new one
  if (p2pQueueTake(myId, index, item, track)) return true;          // its folder is remembered: fetched (or here) without searching
  stopOtherEngines('local'); p2pLocalStop(); setMasterPlayerEngine('local'); p2pMiniPlayerFor(item, track);
  el.miniPlayerTimeCurrent.textContent = 'searching P2P\u2026'; setMiniPlayerPlayPauseIcon(true);
  flashGlobalToast(opts && opts.force ? `Looking for ${item.title} on Soulseek\u2026` : `"${track.trackName}" isn\u2019t on Spotify or YouTube: looking for ${item.title} on Soulseek\u2026`);
  p2pAutoGet(item).then(ok => {
    if (myId !== crateQueueId || crateQueueIndex !== index) return;
    if (ok && p2pQueueTake(myId, index, item, track)) return;
    const m = p2pAutoMissed[artKey(item)];
    if (opts && opts.onMiss) { flashGlobalToast(`"${track.trackName}" isn\u2019t on Soulseek${m ? ' (' + m.why + ')' : ''}: playing it from your other sources.`); opts.onMiss(); return; }
    flashGlobalToast(`Skipping "${track.trackName}" \u2014 not on Soulseek either${m ? ' (' + m.why + ')' : ''}.`);
    mqAdd([item], 'skipped', track.trackName); playCrateQueueIndex(myId, index + 1);
  });
  return true;
}
function p2pPlayOneOrFalse(item, trackName, trackNum) {             // one song, started from its row or menu, that nothing else can play
  const myId = ++crateQueueId;
  crateQueueList = [{ item, track: Object.assign({ trackName, trackNumber: trackNum }, trackLinkOverridesFor(item, trackNum, trackName)) }]; crateQueueIndex = 0; renderCrateQueuePanel();
  if (p2pAutoTake(myId, 0, item, crateQueueList[0].track)) return true;
  crateQueueList = []; crateQueueIndex = -1; renderCrateQueuePanel(); return false;
}
// ----- (1.104.0) a release just added: found on Soulseek in the background, and its best folder remembered as its source -----
// Nothing is downloaded: the first time it plays from P2P it starts at once, without a search. One search at a time, 2 minutes apart (1.106.0); a release
// whose tracklist hasn't arrived yet (a new one waits for its RYM update) is tried again later, up to 3 times. A sure (else likely) match is
// remembered; none: Processing lists it with Pick a folder. Processing's settings menu switches it off ("Find new releases on Soulseek").
const P2P_NEW_KEY = 'crate_p2p_new_v1', P2P_NEWQ_KEY = 'crate_p2p_newq_v1';
const p2pNewQ = (() => { try { const l = JSON.parse(localStorage.getItem(P2P_NEWQ_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } })();
const p2pNewState = { running: false, now: '', timer: 0 };
function p2pNewOn() { try { return localStorage.getItem(P2P_NEW_KEY) !== '0'; } catch (e) { return true; } }
function p2pSetNew(on) { try { localStorage.setItem(P2P_NEW_KEY, on ? '1' : '0'); } catch (e) { /* this visit */ } if (on) p2pNewSchedule(3000); }
function p2pNewSave() { try { localStorage.setItem(P2P_NEWQ_KEY, JSON.stringify(p2pNewQ.slice(-500))); } catch (e) { /* this visit */ } }
function p2pNewSchedule(ms) { clearTimeout(p2pNewState.timer); p2pNewState.timer = setTimeout(p2pNewRun, ms); }
function p2pNewQueue(list) {                                          // (from the save step) releases just added
  if (!p2pNewOn()) return;
  (list || []).forEach(x => { if (!x || !x.artist || !x.title) return; const k = mqKey(String(x.artist), String(x.title)); if (!p2pNewQ.some(e => e.k === k)) p2pNewQ.push({ k, artist: String(x.artist), title: String(x.title), due: Date.now() + 8000, tries: 0 }); });
  p2pNewSave(); p2pNewSchedule(8000); jobsRefresh();
}
async function p2pNewRun() {
  if (p2pNewState.running || !p2pNewQ.length || !p2pNewOn()) return;
  if (!p2p.ready || !p2p.configured || (typeof cxImp !== 'undefined' && cxImp && cxImp.running)) { p2pNewSchedule(60000); return; }          // the add-on isn't here, or an import is still adding: later
  const now = Date.now(), e = p2pNewQ.find(x => x.due <= now);
  if (!e) { p2pNewSchedule(Math.max(5000, Math.min(...p2pNewQ.map(x => x.due)) - now)); return; }
  p2pNewState.running = true; p2pNewState.now = e.title; jobsRefresh();
  try {
    const item = (state.raw || []).find(r => mqKey(r.artist, r.title) === e.k);
    const drop = () => { const i = p2pNewQ.indexOf(e); if (i >= 0) p2pNewQ.splice(i, 1); };
    const later = (ms) => { e.tries++; e.due = Date.now() + ms; if (e.tries > 3) drop(); };
    if (!item) { later(10 * 60000); return; }                         // not in the list yet
    if (p2pHasSource(item)) { drop(); return; }                       // already has one
    const tracks = ((await Promise.resolve(getTracksFor(item)).catch(() => [])) || []).filter(t => t && t.trackName);
    if (!tracks.length) { later(20 * 60000); return; }                // no tracklist yet (its RYM update brings one): later
    let folders = [], failed = null;
    for (const q of p2pQueries(item)) { const r = await p2pSearchFolders(q); if (!r.ok) { failed = r; break; } folders = r.folders; if (folders.length) break; }
    if (failed) { later(30 * 60000); return; }
    const best = p2pBestOf(p2pRank(folders, tracks, item, p2pPrefs()));
    if (best) { p2pChoose(item, best, tracks); p2pMakeRec(item, p2pChoiceFor(item)); if (typeof jobsDone === 'function') jobsDone('p2p', `Found ${item.title} on Soulseek: ${best.name} (${(best.ext || '').toUpperCase()}), from ${best.user}`, { k: artKey(item) }); }
    else p2pAutoMissed[artKey(item)] = { at: Date.now(), why: folders.length ? `${folders.length} folder${folders.length === 1 ? '' : 's'} found, none a good match` : 'nothing found', title: item.title, isNew: true };
    drop();
  } finally {
    p2pNewSave(); p2pNewState.running = false; p2pNewState.now = ''; jobsRefresh();
    if (p2pNewQ.length) p2pNewSchedule(120000);                       // the next one, 2 minutes on (1.106.0: was 20 s), so Soulseek isn't searched too often
  }
}
setTimeout(() => { if (p2pNewQ.length) p2pNewSchedule(15000); }, 0);
// ----- (1.105.0) each song's download, shown on its row: Up Next and the album page -----
// A bar and a word beside every song of a release played from P2P: its place in the sharer's queue, how far it has got, ready, playing, played.
function p2pRowState(s) {                                            // -> [class, text, pct] or null (nothing to show)
  if (!s) return null;
  if (p2pLocalCur && p2pLocalCur.s === s) return ['play', 'playing', 100];
  if (s.st === 'down') return ['down', `${Math.round(s.pct || 0)}%`, s.pct || 0];
  if (s.st === 'wait') return ['wait', s.place ? `queue ${s.place}` : 'waiting', 0];
  if (s.st === 'done') return ['done', 'ready', 100];
  if (s.st === 'fail') return ['fail', 'failed', 0];
  if (s.st === 'gone' && s.played) return ['gone', 'played', 100];
  return null;
}
function p2pRowBadge(row, s) {
  const st = p2pRowState(s); let b = row.querySelector(':scope > .p2p-tr');
  if (!st) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'p2p-tr'; b.innerHTML = '<i><b></b></i><span></span>'; row.appendChild(b); }
  b.dataset.st = st[0]; b.firstChild.firstChild.style.width = Math.max(st[0] === 'wait' ? 0 : 4, Math.min(100, st[2])).toFixed(1) + '%'; b.lastChild.textContent = st[1];
  b.title = `Soulseek (${s.name}): ${st[1] === 'ready' ? 'downloaded, ready to play' : st[1]}`;
}
const p2pRowItems = new Map();
function p2pPaintRows() {
  const recs = Object.keys(p2pDl); if (!recs.length) return;
  document.querySelectorAll('#crateQueuePanelBody [data-queue-index]').forEach(row => { const e = crateQueueList[Number(row.dataset.queueIndex)]; if (e && e.item && p2pDl[artKey(e.item)]) p2pRowBadge(row, p2pSongFor(e.item, e.track)); });
  document.querySelectorAll('.track-row[data-track-key]').forEach(row => {
    const m = /^(.*)::@(\d+)$/.exec(row.dataset.trackKey || ''); if (!m) return;
    let it = p2pRowItems.get(m[1]); if (it === undefined) { it = (state.raw || []).find(r => String(r.row) === m[1]) || null; p2pRowItems.set(m[1], it); }
    if (!it || !p2pDl[artKey(it)]) return;
    const t = (state.trackCache[artKey(it)] || [])[Number(m[2])]; if (t) p2pRowBadge(row, p2pSongFor(it, t));
  });
}
setInterval(() => { if (!document.hidden) { if (p2pRowItems.size > 2000) p2pRowItems.clear(); p2pPaintRows(); } }, 700);
function p2pRefreshUi() { if (typeof jobsRefresh === 'function') jobsRefresh(); if (p2p.cur && typeof p2pRender === 'function') p2pRender(); }
p2pDirCheck().then(() => p2pTick());
