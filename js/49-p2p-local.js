// CRATE — P2P downloads and the Local player (1.98.0).
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
function p2pKeep() { try { return Object.assign({ mode: 'delete', capGb: 2 }, JSON.parse(localStorage.getItem(P2P_KEEP_KEY) || '{}')); } catch (e) { return { mode: 'delete', capGb: 2 }; } }
function p2pSetKeep(p) { try { localStorage.setItem(P2P_KEEP_KEY, JSON.stringify(Object.assign(p2pKeep(), p))); } catch (e) { /* this visit only */ } p2pTidy(); }
const p2pItemByKey = (k) => (state.raw || []).find(r => artKey(r) === k) || null;
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
  if (keep.mode === 'delete') { for (const [rec, s] of all) if (s.played || Date.now() - (s.doneAt || 0) > 24 * 3600000) await p2pDelete(rec, s); }          // unplayed ones go after a day
  else if (keep.mode === 'cap') {
    let total = all.reduce((a, [, s]) => a + (s.size || 0), 0); const cap = Math.max(0.1, Number(keep.capGb) || 2) * 1e9;
    all.sort(([, a], [, b]) => (!!b.played - !!a.played) || (a.playedAt || a.doneAt || 0) - (b.playedAt || b.doneAt || 0));
    for (const [rec, s] of all) { if (total <= cap) break; total -= s.size || 0; await p2pDelete(rec, s); }
  }
  Object.keys(p2pDl).forEach(k => { if (p2pDl[k].songs.every(s => s.st === 'gone' || s.st === 'fail') && !p2pDl[k].songs.some(s => s.st === 'fail' && !p2pDl[k].dismissed)) delete p2pDl[k]; });
  p2pDlSave();
}

// ----- downloading -----
async function p2pDownload(item, choice, play, quiet) {              // inside a click (it may ask for the folder first); quiet: started by CRATE itself, so no asking
  if (!item || !choice) return;
  if (quiet) await p2pDirCheck();
  else if (p2pFolderSupported()) { await p2pDirCheck(); if (p2pDirPerm === 'prompt') await p2pDirAllow(); else if (p2pDirPerm === 'none') { flashGlobalToast('Choose slskd’s downloads folder, so CRATE can play and tidy what arrives.'); await p2pDirPick(); } }
  const tracks = choice.tracks || [], songs = [];
  (choice.songs || []).forEach((fi, k) => { const f = fi >= 0 && choice.files[fi]; if (f && f.path) songs.push({ k, tn: tracks[k] ? tracks[k].n : k + 1, name: tracks[k] ? tracks[k].t : f.name, path: f.path, size: f.size || 0, st: 'wait', pct: 0 }); });
  if (!songs.length) { flashGlobalToast('That folder has no songs from this release’s tracklist to download.'); return; }
  const key = artKey(item), old = p2pDl[key];
  if (old && old.user === choice.user && old.songs.some(p2pActive)) { if (play) playAlbumReplacingQueue(item); return; }          // already on its way
  const r = await p2pCall('download', { user: choice.user, files: songs.map(s => ({ path: s.path, size: s.size })) }, 30000);
  if (!r.ok) { flashGlobalToast('Couldn’t start the download: ' + p2pWhy(r)); return; }
  const failed = new Set(r.failed || []); songs.forEach(s => { if (failed.has(s.path)) { s.st = 'fail'; s.err = 'slskd couldn’t queue it'; } });
  p2pDl[key] = { key, artist: item.artist || '', title: item.title || '', user: choice.user, folder: choice.name, at: Date.now(), songs };
  p2pDlSave(); p2pRefreshUi(); p2pTick();
  if (!quiet) flashGlobalToast(play ? `Downloading ${item.title}: it starts playing as soon as song ${songs[0].tn} arrives.` : `Downloading ${item.title} (${songs.length} songs).`);
  if (play) playAlbumReplacingQueue(item);
}
async function p2pCancel(key) {
  const rec = p2pDl[key]; if (!rec) return;
  for (const s of rec.songs) if (p2pActive(s)) { if (s.id) await p2pCall('dlremove', { user: rec.user, id: s.id }); s.st = 'gone'; }
  p2pDlSave(); p2pTidy(); jobsRefresh(); flashGlobalToast(`Stopped downloading ${rec.title}.`);
}
async function p2pRetry(key) {
  const rec = p2pDl[key]; if (!rec) return; const again = rec.songs.filter(s => s.st === 'fail'); if (!again.length) return;
  for (const s of again) if (s.id) await p2pCall('dlremove', { user: rec.user, id: s.id });
  const r = await p2pCall('download', { user: rec.user, files: again.map(s => ({ path: s.path, size: s.size })) }, 30000);
  if (!r.ok) { flashGlobalToast('Couldn’t retry: ' + p2pWhy(r)); return; }
  again.forEach(s => { s.st = 'wait'; s.pct = 0; s.err = ''; s.id = ''; }); rec.dismissed = false; p2pDlSave(); jobsRefresh(); p2pTick();
}
let p2pTicking = false, p2pTidiedOnce = false;
async function p2pTick() {                                          // every 2 s while something is on its way: slskd's progress, and finished files found on disk
  if (p2pTicking) return; p2pTicking = true;
  try {
    await p2pDirCheck();
    if (p2pDirPerm === 'granted' && !p2pTidiedOnce) { p2pTidiedOnce = true; await p2pTidy(); }
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
          else if (/Completed/i.test(t.state)) { s.st = 'fail'; s.err = (t.error || t.state.replace(/^Completed,\s*/, '')).slice(0, 160); }
          else s.st = /InProgress|Initializing/i.test(t.state) ? 'down' : 'wait';
        }
        if (s.st === 'done' && !s.local) { const loc = await p2pLocate(s.path, s.size); if (loc) s.local = loc; }
      }
      for (const rec of recs.filter(x => x.user === user)) if (!rec.logged && rec.songs.every(s => !p2pActive(s))) {
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
  p2pAutoFlight.forEach(f => run.push({ cat: 'p2p', icon: 'search', title: `Looking for ${f.title} on Soulseek`, sub: f.artist, pct: null, detail: 'A song of it has no link Spotify or YouTube can play: a sure match will be downloaded and played' }));
  Object.entries(p2pAutoMissed).forEach(([k, m]) => { if (Date.now() - m.at > 6 * 3600000 || m.dismissed) return; need.push({ cat: 'p2p', icon: 'search', title: `${m.title}: no sure match on Soulseek`, detail: `${m.why}. Its songs without a link were skipped.`, acts: [{ label: 'Pick a folder', fn: () => { const it = p2pItemByKey(k); if (it) p2pOpen(it); }, opens: true, primary: true }, { label: 'Dismiss', fn: () => { m.dismissed = true; } }] }); });
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
function p2pQueueTake(myId, index, item, track) {                   // called by playCrateQueueIndex: true when this song is ours to play (now, or once it lands)
  const rec = item && p2pDl[artKey(item)], s = p2pSongFor(item, track);
  if (!s || s.st === 'gone' || s.st === 'fail') return false;          // not downloaded (or it failed): the usual sources play it
  if (s.st === 'done' && !s.local && p2pDirPerm !== 'granted') return false;          // here, but CRATE can't open the folder: play it another way
  let told = false;
  const go = async () => {
    if (myId !== crateQueueId || crateQueueIndex !== index) return;
    if (s.st === 'done' && s.local) { const f = await p2pLocalFile(s); if (myId !== crateQueueId || crateQueueIndex !== index) return; if (f) { p2pLocalPlay(f, item, track, rec, s); return; } s.local = null; }
    if (s.st === 'fail' || s.st === 'gone') { flashGlobalToast(`"${track.trackName}" didn’t download: playing on.`); playCrateQueueIndex(myId, index + 1); return; }
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
  p2pLocalCur = { item, track, rec, s, url, trackName: track.trackName || '' };
  p2pMiniPlayerFor(item, track);
  a.src = url; a.volume = Math.max(0, Math.min(1, p2pLocalVol() / 100));
  a.play().catch(() => { setMiniPlayerPlayPauseIcon(true); flashGlobalToast('Press Play to start.'); });
}
function p2pLocalStop() { if (p2pAudio) { try { p2pAudio.pause(); } catch (e) { /* none */ } } if (p2pLocalCur && p2pLocalCur.url) URL.revokeObjectURL(p2pLocalCur.url); p2pLocalCur = null; }
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
  if (p2pDl[key] && p2pDl[key].songs.some(s => s.st !== 'gone' && s.st !== 'fail')) return Promise.resolve(true);
  if (p2pAutoFlight.has(key)) return p2pAutoFlight.get(key).pr;
  const pr = (async () => {
    const tracks = ((await Promise.resolve(getTracksFor(item)).catch(() => [])) || []).filter(t => t && t.trackName);
    const qs = [p2pQueryFor(item), String(item.title || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ').replace(/[\/\\:;,.!?"“”'’`~*|<>]+/g, ' ').replace(/\s+/g, ' ').trim()];
    let folders = [];
    for (const q of [...new Set(qs)].filter(x => x.length >= 3)) { const r = await p2pSearchFolders(q); if (!r.ok) { p2pAutoMissed[key] = { at: Date.now(), why: p2pWhy(r), title: item.title }; return false; } folders = r.folders; if (folders.length) break; }
    const best = p2pRank(folders, tracks, item, p2pPrefs()).find(f => !f.m.unavailable && f.m.verdict === 'sure');
    if (!best) { p2pAutoMissed[key] = { at: Date.now(), why: folders.length ? `${folders.length} folder${folders.length === 1 ? '' : 's'} found, none a sure match` : 'nothing found', title: item.title }; return false; }
    p2pChoose(item, best, tracks); await p2pDownload(item, p2pChoiceFor(item), false, true);
    return !!p2pDl[key];
  })();
  p2pAutoFlight.set(key, { pr, title: item.title || '', artist: item.artist || '' }); jobsRefresh();
  pr.finally(() => { p2pAutoFlight.delete(key); jobsRefresh(); });
  return pr;
}
function p2pAutoTake(myId, index, item, track) {                     // called where playback would skip a song: true when CRATE looks for it on Soulseek instead
  if (!p2pAutoOn() || !p2p.ready || !p2p.configured || !item || !track || !track.trackName) return false;
  const miss = p2pAutoMissed[artKey(item)]; if (miss && Date.now() - miss.at < 15 * 60000) return false;          // looked a moment ago and found nothing sure
  if (p2pQueueTake(myId, index, item, track)) return true;          // already downloaded, or on its way
  stopOtherEngines('local'); p2pLocalStop(); setMasterPlayerEngine('local'); p2pMiniPlayerFor(item, track);
  el.miniPlayerTimeCurrent.textContent = 'searching P2P\u2026'; setMiniPlayerPlayPauseIcon(true);
  flashGlobalToast(`"${track.trackName}" isn\u2019t on Spotify or YouTube: looking for ${item.title} on Soulseek\u2026`);
  p2pAutoGet(item).then(ok => {
    if (myId !== crateQueueId || crateQueueIndex !== index) return;
    if (ok && p2pQueueTake(myId, index, item, track)) return;
    const m = p2pAutoMissed[artKey(item)];
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
function p2pRefreshUi() { if (typeof jobsRefresh === 'function') jobsRefresh(); if (p2p.cur && typeof p2pRender === 'function') p2pRender(); }
p2pDirCheck().then(() => p2pTick());
