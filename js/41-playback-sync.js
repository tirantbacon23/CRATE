// CRATE — carrying on where you were: after a refresh, and on your other devices.
// One part of the page's script, split by feature (see 01-core.js).
//
// WHAT'S PLAYING, AS A SNAPSHOT (pbSnapshot / pbResume): the release, the song, where in it, whether it was playing, and the queue around it.
// The same snapshot is kept in this browser (a refresh carries on with it) and, with "Sync playback across devices" on, sent through your
// backend's cache to your other devices (Apps Script's CacheService: kept 6 hours, never written to the sheet).
//
// REFRESH: what was playing starts again where it was, once the crate is in (the first CRATE window only, never a pop-out). A browser may not
// let a page start sound by itself; then, and when it was paused, a pill offers "Carry on" (one click).
//
// OTHER DEVICES (like a speaker group, one plays at a time): when this device starts playing, your other devices with sync on pause and show
// "Playing on <this device>"; on any of them "Play here" carries on from the same song and moment there (and this one pauses). "Play along
// here" makes a device follow instead: it plays whatever your other devices play, at the same spot, and never takes over from them.
//
// WHERE YOU WERE (placeSave / placeRestore): the tab you were on, your open artist and genre tabs, an open playlist, the search and what was
// picked on the left, and how far down you'd scrolled, so a refresh lands you there again.

const PB_LOCAL_KEY = 'crate_playback_v1', PB_SET_KEY = 'crate_pbsync_v1', PLACE_KEY = 'crate_place_v1';
const PB_KEEP_MS = 12 * 3600e3;                                       // a refresh carries on with what was playing up to 12 hours ago
const pbFold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const pbId = (it) => (it && (it.albumId || (it.row != null ? 'r' + it.row : ''))) || '';
function pbItemOf(id) { if (!id) return null; return (state.raw || []).find(x => x.albumId === id || 'r' + x.row === id) || null; }
let pbQueueMovedAt = 0, pbQueueSeen = '', pbItemSeen = null, pbItemMovedAt = 0;
// (1.94.2) The song playing now, whatever plays it. Only Spotify's player sets currentSpotifyTrack: while a song played from YouTube (or
// SoundCloud) it still held the last Spotify song, so nothing was sent at all (its artist wasn't the release's), or the wrong song was.
function pbSpotifyEngine() { return !activePlayerEngine || activePlayerEngine === 'spotify'; }
function pbNowName() {
  if (pbSpotifyEngine()) return (currentSpotifyTrack && currentSpotifyTrack.name) || '';
  const shown = el.miniPlayerTitle ? el.miniPlayerTitle.textContent.trim() : '';
  if (shown) return shown;
  const e = crateQueueIndex >= 0 && crateQueueList[crateQueueIndex];
  return (e && e.track && e.track.trackName) || '';
}
function pbNamesMatch(a, b) { a = pbFold(a); b = pbFold(b); return !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a)); }
function pbPlaying() { return !!(el.miniPlayer && !el.miniPlayer.hidden && el.miniPlayerPlayPause && el.miniPlayerPlayPause.title === 'Pause'); }

// ---- the snapshot ----
function pbSnapshot() {
  const nowName = pbNowName();
  if (!el.miniPlayer || el.miniPlayer.hidden || !nowName) return null;
  const inQueue = crateQueueList.length && crateQueueIndex >= 0 && crateQueueIndex < crateQueueList.length;
  const item = inQueue ? crateQueueList[crateQueueIndex].item : nowPlayingItem;
  if (!item) return null;
  // (1.93.9) Between two songs the release can already be the new one while the player still shows the old song (its name, its moment):
  // sent then, another device played the wrong song from the wrong place. A song whose artists aren't the release's isn't sent.
  const arts = pbSpotifyEngine() && currentSpotifyTrack ? currentSpotifyTrack.artists : null;          // (a YouTube or SoundCloud song has no artists to check)
  if (pbItemSeen !== item) { pbItemSeen = item; pbItemMovedAt = Date.now(); }
  if (Date.now() - Math.max(pbItemMovedAt, pbQueueMovedAt) < 6000 && Array.isArray(arts) && arts.length && typeof artistsRoughlyMatch === 'function' && !artistsRoughlyMatch(item.artist, arts)) return null;          // (1.94.3) only just after a change: Spotify can name an artist its own way
  if (inQueue && pbFold(crateQueueList[crateQueueIndex].track && crateQueueList[crateQueueIndex].track.trackName) && !pbNamesMatch(crateQueueList[crateQueueIndex].track.trackName, nowName) && Date.now() - pbQueueMovedAt < 6000) return null;
  let q = null, i = -1;
  if (inQueue) {
    const from = Math.max(0, crateQueueIndex - 50), to = Math.min(crateQueueList.length, crateQueueIndex + 350);          // the songs around it (a queue of thousands isn't carried whole)
    q = crateQueueList.slice(from, to).map(e => ({ r: pbId(e.item), n: (e.track && e.track.trackNumber) || 0, t: (e.track && e.track.trackName) || '' }));
    i = crateQueueIndex - from;
  }
  return { v: 1, eng: activePlayerEngine || 'spotify', r: pbId(item), artist: item.artist || '', album: item.title || '', t: nowName, pos: Math.round(getEstimatedPosition() || 0), ts: Math.round(pbSrvNow()), dur: Math.round(getCurrentDurationMs() || 0), playing: pbPlaying(), vol: pbVolume(), q, i };
}
// (1.93.8) The volume goes with it: the player's slider is the volume of whatever is playing (Spotify, YouTube or SoundCloud), so it is read
// from there and set there, as if you had moved it. "Same volume on every device" (on unless you turn it off) says whether a device takes it.
function pbVolume() { const v = el.miniPlayerVolume ? Number(el.miniPlayerVolume.value) : NaN; return isFinite(v) ? Math.round(v) : null; }
function pbApplyVol(v) {
  if (pbSet().vol === false || typeof v !== 'number' || !isFinite(v) || !el.miniPlayerVolume) return;
  v = Math.max(0, Math.min(100, Math.round(v)));
  if (Math.abs(Number(el.miniPlayerVolume.value) - v) < 1) return;
  el.miniPlayerVolume.value = String(v); el.miniPlayerVolume.dispatchEvent(new Event('input', { bubbles: true }));
}
function pbTrackFor(it, n, t) {                                         // the queue entry's track: the real one if its tracklist is in, else what the snapshot says
  const list = state.trackCache[artKey(it)] || [];
  const hit = list.find(x => (n && x.trackNumber === n && pbFold(x.trackName) === pbFold(t))) || list.find(x => pbFold(x.trackName) === pbFold(t));
  return hit || Object.assign({ trackNumber: n, trackName: t }, trackLinkOverridesFor(it, n, t));
}
function pbSeekMs(ms) {
  ms = Math.max(0, Math.round(ms));
  try {
    if (activePlayerEngine === 'youtube') { if (ytPlayer && ytPlayer.seekTo) ytSeekInSegment(ms / 1000); }
    else if (activePlayerEngine === 'soundcloud') { if (scWidget && scWidget.seekTo) { scWidget.seekTo(ms); scPosition = ms; } }
    else if (spotifyPlayer && spotifyLastState) { spotifyPlayer.seek(ms).catch(() => {}); spotifyLastState = Object.assign({}, spotifyLastState, { position: ms }); spotifyLastStateAt = Date.now(); }
  } catch (e) { /* the player isn't ready: it starts from the top */ }
}
let pbResumeSeq = 0;
// Plays the snapshot's song from its moment, with its queue. -> true once it is playing, false if it couldn't (or the browser wouldn't start sound).
async function pbResume(s, opts) {
  opts = opts || {};
  const seq = ++pbResumeSeq;
  let entries = [], index = 0;
  if (Array.isArray(s.q) && s.q.length) {
    s.q.forEach((e, k) => { const it = pbItemOf(e.r); if (!it) { if (k < s.i) index--; return; } entries.push({ item: it, track: pbTrackFor(it, e.n, e.t) }); });
    index = Math.max(0, Math.min(entries.length - 1, (s.i || 0) + index));
  }
  if (!entries.length) {
    const it = pbItemOf(s.r); if (!it) { if (!opts.quiet) flashGlobalToast(`“${s.album || 'That release'}” isn’t in this crate.`); return false; }
    const tracks = await getTracksFor(it);
    if (seq !== pbResumeSeq) return false;
    if (!tracks || !tracks.length) { if (!opts.quiet) flashGlobalToast('No tracklist found for that release.'); return false; }
    entries = tracks.map(t => ({ item: it, track: t }));
    index = Math.max(0, tracks.findIndex(t => pbFold(t.trackName) === pbFold(s.t)));
  }
  const want = pbFold(entries[index].track.trackName || s.t);
  const myId = ++crateQueueId;
  crateQueueList = entries; crateQueueIndex = -1; ytPlayingForCrateQueue = false;
  renderCrateQueuePanel();
  playCrateQueueIndex(myId, index);
  // Wait for it to be going, then go to its moment. (1.93.7) "Going" is the queue having reached that entry and playing: the name the player
  // shows can differ from the tracklist's (Spotify's "Pts. 1-5" for "Parts I–V"), and waiting for the names to agree meant it never jumped
  // to the moment at all. The sender's own name (s.t) counts as well as the tracklist's, and after 1.5 s of that entry playing any name does.
  const t0 = Date.now(), sent = pbFold(s.t), wait = opts.wait || 20000;
  let goingSince = 0;
  while (Date.now() - t0 < wait) {
    await new Promise(r => setTimeout(r, 300));
    if (seq !== pbResumeSeq || myId !== crateQueueId) return false;
    const now = pbFold(pbNowName());
    const named = !!now && [want, sent].some(w => w && (now === w || now.startsWith(w) || w.startsWith(now)));
    const going = pbPlaying() && crateQueueIndex === index;
    goingSince = going ? (goingSince || Date.now()) : 0;
    if (going && (named || Date.now() - goingSince > 1500)) {
      // From another device that is still playing (opts.live), the time this took counts too: it carried on there meanwhile.
      const base = (s.pos || 0) + (opts.elapsed || 0), live = !!opts.live && s.playing !== false;
      const target = () => base + (live ? Date.now() - t0 : 0);
      if (target() > 2500 && (!s.dur || target() < s.dur - 3000)) await pbSeekSure(target, seq);
      if (opts.live || opts.vol) pbApplyVol(s.vol);                   // the other device's volume too
      if (s.playing === false && pbPlaying()) el.miniPlayerPlayPause.click();          // it was paused there: paused here too
      return true;
    }
  }
  return false;
}
// A jump made the moment a song starts can be lost (Spotify's player often ignores one then and carries on from 0:00), so it is checked a
// moment later and made again, up to four times. target() is where it should be NOW (the time spent here counts).
async function pbSeekSure(target, seq) {
  for (let k = 0; k < 4; k++) {
    pbSeekMs(target());
    await new Promise(r => setTimeout(r, 1300));
    if (seq !== pbResumeSeq) return false;
    if (Math.abs((getEstimatedPosition() || 0) - target()) < 4000) return true;
  }
  return false;
}

// ---- a pill at the bottom: "Carry on" after a refresh, "Playing on <device>" from another device ----
let pbPillState = null;                                                // { kind: 'local' | 'remote', s, dev, at }
function pbPillShow(p) { pbPillState = p; pbPillRender(); }
function pbPillHide() { pbPillState = null; pbPillRender(); }
function pbPillRender() {
  let pill = document.getElementById('pbPill');
  const p = pbPillState;
  if (!p) { if (pill) pill.hidden = true; return; }
  if (!pill) {
    pill = document.createElement('div'); pill.id = 'pbPill'; pill.className = 'pb-pill'; pill.setAttribute('role', 'status'); document.body.appendChild(pill);
    pill.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pb]'); if (!b || !pbPillState) return;
      const q = pbPillState;
      if (b.dataset.pb === 'x') { if (q.kind === 'local') pbLocalClear(); pbPillHide(); return; }
      if (b.dataset.pb === 'devices') { pbDevicesMenu(b); return; }
      if (b.dataset.pb === 'play') {
        pbPillHide();
        const s = Object.assign({}, q.s, { playing: true });
        flashGlobalToast(`Carrying on with “${s.t}”…`);
        pbResume(s, { live: q.kind === 'remote' && !!q.s.playing, elapsed: q.kind === 'remote' && q.s.playing ? Date.now() - q.seenAt + (q.age || 0) : 0 }).then(ok => { if (!ok && !pbPlaying()) { flashGlobalToast('Couldn’t start it here.'); pbPillShow(q); } });
      }
    });
  }
  const s = p.s, what = `${escapeHtml(s.t)}<span class="pb-pill-sub"> · ${escapeHtml(s.artist)}</span>`;
  const head = p.kind === 'remote' ? `${s.playing ? 'Playing' : 'Paused'} on ${escapeHtml(p.dev || 'another device')}` : 'Where you were';
  pill.innerHTML = `<span class="pb-pill-ico" aria-hidden="true">${p.kind === 'remote' ? '⇄' : '↻'}</span><span class="pb-pill-t"><b>${head}</b> ${what}</span>`
    + `<button type="button" class="chip-btn pb-pill-go" data-pb="play">${p.kind === 'remote' ? 'Play here' : 'Carry on'} ▶</button>`
    + (p.kind === 'remote' ? '<button type="button" class="pb-pill-btn" data-pb="devices" title="Devices" aria-label="Devices">⚙</button>' : '')
    + '<button type="button" class="pb-pill-btn" data-pb="x" title="Hide" aria-label="Hide">×</button>';
  pill.hidden = false;
}

// ---- this browser: carry on after a refresh ----
function pbLocalSave() {
  if (typeof CRATE_POPOUT_WINDOW !== 'undefined' && CRATE_POPOUT_WINDOW) return;          // (a pop-out doesn't play)
  const s = pbSnapshot(); if (!s) return;
  try { localStorage.setItem(PB_LOCAL_KEY, JSON.stringify({ at: Date.now(), s })); } catch (e) { /* not kept */ }
}
function pbLocalLoad() { try { const v = JSON.parse(localStorage.getItem(PB_LOCAL_KEY) || 'null'); return v && v.s && Date.now() - v.at < PB_KEEP_MS ? v : null; } catch (e) { return null; } }
function pbLocalClear() { try { localStorage.removeItem(PB_LOCAL_KEY); } catch (e) { /* fine */ } }
async function pbLocalResumeOnLoad() {
  const v = pbLocalLoad(); if (!v || pbPlaying()) return;
  const sync = pbSet();
  if (sync.on && pbRemote && pbRemote.dev !== sync.id && pbRemote.s && (pbRemote.s.playing || (pbRemote.s.since || 0) > v.at)) {          // another device is playing (or played since): that shows instead
    pbPillShow({ kind: 'remote', s: pbRemote.s, dev: pbRemote.devName, age: pbRemote.age, seenAt: pbRemote.seenAt });
    return;
  }
  if (!v.s.playing) { pbPillShow({ kind: 'local', s: v.s }); return; }
  const s = Object.assign({}, v.s);
  pbPillShow({ kind: 'local', s });                                    // "Carry on", in case the browser won't start sound by itself
  const ok = await pbResume(s, { quiet: true, wait: 12000 });
  if (ok && pbPillState && pbPillState.kind === 'local') pbPillHide();
}

// ---- other devices ----
function pbSet() {
  let v = {}; try { v = JSON.parse(localStorage.getItem(PB_SET_KEY) || '{}') || {}; } catch (e) { v = {}; }
  if (v.follow && v.strict === undefined) v.strict = true;              // (1.94.5) "Play along" became strict sync
  if (!v.id) { v.id = Math.random().toString(36).slice(2, 10); try { localStorage.setItem(PB_SET_KEY, JSON.stringify(v)); } catch (e) { /* this visit only */ } }
  if (!v.name) { const ua = navigator.userAgent || ''; v.name = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet') : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /CrOS/.test(ua) ? 'Chromebook' : 'This device'; }
  return v;
}
function pbSetSave(patch) { const v = Object.assign(pbSet(), patch); try { localStorage.setItem(PB_SET_KEY, JSON.stringify(v)); } catch (e) { /* this visit only */ } pbSyncSchedule(0); return v; }
let pbBackend = null;                                                  // null not asked yet, true has playSync, false an older backend
// (1.94.5) THE SHARED CLOCK: how far this computer's clock is from the backend's, from the quickest answers (half the round trip either way),
// so "at 1:05.3, at this moment" means the same moment on every device. A direct link between two devices (45-direct-link.js) measures the
// other device's clock to a few milliseconds and turns its moments into this clock.
let pbOff = 0, pbOffRtt = Infinity, pbOffAt = 0;
function pbClockSample(t0, t1, serverNow) { const rtt = t1 - t0; if (!(serverNow > 0)) return; if (rtt <= pbOffRtt * 1.25 || Date.now() - pbOffAt > 90000) { pbOff = serverNow - (t0 + t1) / 2; pbOffRtt = rtt; pbOffAt = Date.now(); } }
function pbSrvNow() { return Date.now() + pbOff; }
let pbRemote = null, pbRemoteAt = 0, pbMyPostAt = 0, pbLastKey = '', pbLastPostLocal = 0, pbLastPos = 0, pbLastPosAt = 0, pbOwner = '', pbPollTimer = 0, pbPolling = false;
async function pbToken() {
  let t = getStoredIdToken(); if (!t) return '';
  const exp = tokenExpMs(t); if (exp && exp < Date.now() + 30000) { try { await authRenew(); } catch (e) { /* tried */ } t = getStoredIdToken(); }
  return t || '';
}
async function pbPost(s) {
  if (pbBackend !== true) return;
  const set = pbSet(), idToken = await pbToken(); if (!idToken) return;
  const full = Object.assign({}, s, { dev: set.id, devName: set.name, since: pbKeySince, mid: s.mid || Math.random().toString(36).slice(2, 10) });
  const state = JSON.stringify(full);
  pbOwner = set.id; pbStrictRef = null; pbSeenMid = full.mid;          // (1.94.5) leading from the moment it says so, not when the backend answers
  if (typeof dlSend === 'function') dlSend(full);                     // a direct link first (strict sync): there in a moment
  try {
    const t0 = Date.now(), r = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'playSync', state, idToken }) });
    const d = await r.json();
    if (d && d.playSync && d.now) { pbClockSample(t0, Date.now(), d.now); pbMyPostAt = d.now; pbOwner = set.id; pbLastSent = { t: s.t, at: Date.now() }; }
  } catch (e) { /* tried again with the next change */ }
}
async function pbPoll() {
  if (pbPolling) return; pbPolling = true;
  try {
    const idToken = await pbToken(); if (!idToken) return;
    const me = pbSet();
    const t0 = Date.now(), r = await fetch(CONFIG.SCRIPT_URL + `?what=play&dev=${encodeURIComponent(me.id)}&strict=${me.strict ? 1 : 0}&name=${encodeURIComponent(me.name)}&id_token=` + encodeURIComponent(idToken)), d = await r.json();
    const t1 = Date.now();
    if (d && isAuthError(d)) { try { await authRenew(); } catch (e) { /* next time */ } return; }
    if (!d || !d.playSync) { if (d && Array.isArray(d.rows)) pbBackend = false; return; }          // an older backend (it answered with the whole crate)
    pbBackend = true; pbLastPollOk = Date.now(); pbClockSample(t0, t1, d.now); pbSigBackend = !!d.sig;
    if (typeof dlFromBackend === 'function') { try { dlFromBackend(d.devs || null, d.signals || null); } catch (er) { console.warn('direct link', er); } }
    if (!d.play) return;
    let e; try { e = JSON.parse(d.play); } catch (er) { return; }
    let s; try { s = JSON.parse(e.s); } catch (er) { return; }
    if (!s || typeof s !== 'object' || typeof s.t !== 'string') return;
    const age = Math.max(0, (d.now - e.at) + (Date.now() - t0) / 2);
    pbRemoteGot({ s, at: e.at, dev: s.dev, devName: s.devName, age, seenAt: Date.now(), via: 'backend' });
  } catch (e) { /* offline: next time */ } finally { pbPolling = false; }
}
let pbSeenMid = '', pbStrictRef = null, pbApplyingUntil = 0, pbLastCorrect = 0;
// (1.94.5) Which of this computer's CRATE windows strict sync acts in: the one playing (it marks itself every second while it plays, and when
// its player is touched); if none has lately, the first CRATE window. Never a pop-out. Two windows on one computer must not both follow.
const PB_WIN = Math.random().toString(36).slice(2, 10), PB_ACTIVE_KEY = 'crate_pb_active_v1';
function pbActiveMark() { try { localStorage.setItem(PB_ACTIVE_KEY, JSON.stringify({ w: PB_WIN, at: Date.now() })); } catch (e) { /* this window only */ } }
function pbIsActiveWindow() {
  if (typeof CRATE_POPOUT_WINDOW !== 'undefined' && CRATE_POPOUT_WINDOW) return false;
  let r = null; try { r = JSON.parse(localStorage.getItem(PB_ACTIVE_KEY) || 'null'); } catch (e) { r = null; }
  if (r && r.w && Date.now() - r.at < 20000) return r.w === PB_WIN;
  return typeof crateIsMain !== 'function' || crateIsMain();
}
function pbRemoteGot(rm) {
  const set = pbSet();
  if (rm.s && rm.s.mid && rm.s.mid === pbSeenMid) { if (rm.via === 'link' && pbStrictRef && pbStrictRef.s.mid === rm.s.mid) pbStrictRef = rm; return; }          // (1.94.5) the same message twice (the link, then the backend)
  if (rm.at <= pbRemoteAt) return; pbRemoteAt = rm.at;
  if (rm.s && rm.s.mid) pbSeenMid = rm.s.mid;
  pbRemote = rm; pbOwner = rm.dev;
  if (rm.dev === set.id) return;                                        // my own
  if (rm.at < pbMyPostAt) return;                                       // older than what I said since
  const s = rm.s;
  if (set.strict && (s.eng || 'spotify') === 'spotify' && s.playing) {          // (1.93.9) Spotify plays on one device per account: playing along would stop the other one
    if (pbPlaying() && activePlayerEngine === 'spotify') { pbHandoffPause = true; el.miniPlayerPlayPause.click(); }
    if (!pbFollowSpotifyTold) { pbFollowSpotifyTold = true; flashGlobalToast('Spotify plays on one device at a time, so this one can\u2019t play along with a Spotify song: it shows what\u2019s playing instead.'); }
    pbPillShow({ kind: 'remote', s, dev: rm.devName, age: rm.age, seenAt: rm.seenAt });
    return;
  }
  if (set.strict) { if (pbIsActiveWindow()) pbStrictApply(rm); return; }          // strict sync: do what it does, at its moment (in the window that plays)
  // One plays at a time — but only when the other device STARTS something (or changes song). (1.94.1) It also says "still playing" every 25 s,
  // and a device that wrongly thought it was playing (its player showing ⏸ with nothing coming out) paused this one with every reminder. So a
  // reminder already seen does nothing, and nor does a song that has been playing there since before this device started its own.
  const actKey = `${rm.dev}|${s.r}|${s.t}|${s.since || ''}`;
  const startedBeforeMine = s.since && pbPlaying() && pbKeySince && s.since < pbKeySince - 2000;
  if (s.playing && pbPlaying() && actKey !== pbActedKey && !startedBeforeMine) { pbActedKey = actKey; pbHandoffPause = true; el.miniPlayerPlayPause.click(); flashGlobalToast(`Now playing on ${rm.devName || 'another device'}.`); }
  else if (s.playing) pbActedKey = actKey;
  if (pbPillState && pbPillState.kind === 'local' && !s.playing) return;          // (your own "Carry on" stays, unless another device is playing now)
  pbPillShow({ kind: 'remote', s, dev: rm.devName, age: rm.age, seenAt: rm.seenAt });
}
function pbItemOfSame(a, b) { return a.r === b.r; }
// ---- STRICT SYNC (1.94.5): both devices play, kept at the same moment. Whatever either does (a song, play, pause, a jump, the volume)
// the other does; the one that didn't do it checks its place against the other's every second and jumps back into line when it is more
// than PB_STRICT_TOL out. What a device does because the other did it is never sent back.
const PB_STRICT_TOL = 300, PB_SEEK_LEAD = 120;                           // ms out of line before it jumps; how far ahead a jump aims (a jump takes a moment)
function pbStrictTarget(rm) { const s = rm.s; return (s.pos || 0) + (s.playing ? Math.max(0, pbSrvNow() - (s.ts || rm.at)) : 0); }
function pbStrictApply(rm) {
  const s = rm.s;
  pbPillHide();
  // (only what is DONE here because of it is kept from being sent back: a "still playing" changes nothing here, and must not make this
  // device deaf to a jump you make on it for the next moments)
  const doing = () => { pbApplyingUntil = Math.max(pbApplyingUntil, Date.now() + 2500); };
  const mine = pbSnapshot();
  if (!s.playing) {                                                      // paused there: paused here, at its moment
    pbStrictRef = null;
    if (pbPlaying()) { doing(); el.miniPlayerPlayPause.click(); }
    if (mine && mine.r === s.r && pbNamesMatch(mine.t, s.t) && Math.abs((mine.pos || 0) - (s.pos || 0)) > 1500) { doing(); pbSeekMs(s.pos || 0); }
    return;
  }
  pbStrictRef = rm;
  if (!mine || mine.r !== s.r || !pbNamesMatch(mine.t, s.t)) {          // another song: that one, from its moment now
    pbApplyingUntil = Date.now() + 25000;
    pbResume(s, { quiet: true, live: true, vol: true, elapsed: Math.max(0, pbSrvNow() - (s.ts || rm.at)) }).finally(() => { pbApplyingUntil = Date.now() + 2000; pbLastCorrect = 0; });
    return;
  }
  if (!pbPlaying()) { doing(); el.miniPlayerPlayPause.click(); }
  if (pbSet().vol !== false && typeof s.vol === 'number' && Math.abs(Number(el.miniPlayerVolume && el.miniPlayerVolume.value) - s.vol) >= 1) { doing(); pbApplyVol(s.vol); }
  pbStrictKeep(false);
}
function pbStrictKeep(now) {                                            // back into line if it has drifted (every second, and on each message)
  const ref = pbStrictRef, set = pbSet();
  if (!ref || !set.on || !set.strict || !pbPlaying() || Date.now() - ref.seenAt > 30000) return;
  const mine = pbSnapshot(); if (!mine || mine.r !== ref.s.r || !pbNamesMatch(mine.t, ref.s.t)) return;
  const tgt = pbStrictTarget(ref), off = (getEstimatedPosition() || 0) - tgt;
  pbDrift = Math.round(off);
  if (Math.abs(off) <= PB_STRICT_TOL || (!now && Date.now() - pbLastCorrect < 2500)) return;
  if (ref.s.dur && tgt > ref.s.dur - 2500) return;                       // (not in its last seconds: the next song will line up)
  pbLastCorrect = Date.now(); pbApplyingUntil = Date.now() + 1500;
  pbSeekMs(tgt + PB_SEEK_LEAD);
}
let pbDrift = null;
let pbHandoffPause = false, pbFollowSpotifyTold = false;
let pbPrevKey = '', pbKeySince = 0, pbSinceKey = '', pbActedKey = '';
function pbWatch() {                                                    // (1.94.5) what changed here goes first; then, if nothing did, keep in line with the device leading
  const sent = pbWatchSend(), set = pbSet();
  if (!sent && set.on && set.strict && pbOwner && pbOwner !== set.id && pbIsActiveWindow()) pbStrictKeep(false);
}
function pbWatchSend() {                                                // every second: tell the other devices when what's playing here changes -> true when it told them
  const set = pbSet();
  const qk = `${crateQueueId}|${crateQueueIndex}`; if (qk !== pbQueueSeen) { pbQueueSeen = qk; pbQueueMovedAt = Date.now(); }
  const s = pbSnapshot();
  if (pbPlaying()) pbActiveMark();
  if (s) { const sk = `${s.r}|${s.t}|${s.playing}`; if (sk !== pbSinceKey) { pbSinceKey = sk; pbKeySince = Date.now(); } }          // (1.94.1) since when this song has been playing (or paused) here
  if (pbPillState && pbPillState.kind === 'remote' && pbPlaying()) pbPillHide();          // playing here now
  if (!set.on || pbBackend !== true || !s) { if (s) pbLastKey = `${s.r}|${s.t}|${s.playing}|${s.vol}`; return; }
  const key = `${s.r}|${s.t}|${s.playing}|${s.vol}`, now = Date.now();
  if (now < pbApplyingUntil) { pbLastKey = key; pbPrevKey = key; pbLastPos = s.pos; pbLastPosAt = now; return; }          // done because the other device did it: not news
  const expect = pbLastPos + (s.playing ? now - pbLastPosAt : 0), jumped = Math.abs(s.pos - expect) > (set.strict ? 2500 : 6000);          // (a jump you made: in strict sync, 2.5 s is enough to tell)
  pbLastPos = s.pos; pbLastPosAt = now;
  const stable = key === pbPrevKey; pbPrevKey = key;                   // (1.93.9) the same for a second: not a moment between two songs
  if (!stable && !(set.strict && s.playing !== undefined && key.split('|').slice(0, 2).join('|') === pbLastKey.split('|').slice(0, 2).join('|'))) return;          // (strict: a pause or play of the same song goes at once)
  const changed = key !== pbLastKey;
  if (!s.playing && (pbHandoffPause || (!set.strict && pbOwner !== set.id))) { pbHandoffPause = false; pbLastKey = key; return; }          // paused because another device took over (or it isn't mine to speak for)
  const leading = set.strict && pbOwner === set.id, beat = leading ? 3000 : 25000;
  if (leading && s.playing && typeof dlBeat === 'function') dlBeat(s);  // leading in strict sync: where it is, down the direct link, every second
  const mineToTell = !pbOwner || pbOwner === set.id;                   // (1.94.5) only the device leading says "still playing" (one that never had, said it at once, took the lead, and the two took turns)
  if ((changed || jumped || (s.playing && mineToTell && now - pbLastPostLocal > beat)) && now - pbLastPostLocal > (set.strict ? 400 : 1500)) {
    pbLastKey = key; pbLastPostLocal = now;
    if (s.playing || set.strict) { pbPost(s); return true; }
    // A pause: Spotify plays on one device per account, so another device starting a Spotify song pauses this one by itself. Asked first
    // whether another device has spoken since; then this pause isn't mine to tell (it would say "paused" over the one now playing).
    pbPoll().then(() => { if (pbOwner === set.id || !pbOwner) pbPost(s); });
    return true;
  }
}
function pbSyncSchedule(ms) {
  clearTimeout(pbPollTimer);
  const set = pbSet(); if (!set.on) return;
  pbPollTimer = setTimeout(async () => { await pbPoll(); pbSyncSchedule(set.strict ? (document.hidden ? 3000 : 1000) : (document.hidden ? 20000 : 4000)); }, ms);
}

// What the sync is doing, in a line (the devices menu): whether the backend answers, when it last heard, what it last sent.
let pbLastPollOk = 0, pbLastSent = null, pbSigBackend = false;
function pbStatusLine() {
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`; };
  const parts = [];
  parts.push(pbBackend === true ? (pbLastPollOk ? `Backend answered ${ago(pbLastPollOk)}` : 'Backend ready') : pbBackend === false ? 'Backend needs updating' : 'Asking the backend\u2026');
  if (pbRemote) parts.push(`last heard: ${escapeHtml(pbRemote.devName || 'a device')}${pbRemote.dev === pbSet().id ? ' (this one)' : ''}, ${pbRemote.s.playing ? 'playing' : 'paused'} \u201c${escapeHtml(pbRemote.s.t)}\u201d`);
  if (pbLastSent) parts.push(`this device sent \u201c${escapeHtml(pbLastSent.t)}\u201d ${ago(pbLastSent.at)}`);
  else parts.push('this device hasn\u2019t sent anything yet');
  if (pbSet().strict) parts.push(`strict sync${typeof dlStatus === 'function' ? ' \u00b7 ' + dlStatus() : ''}${pbDrift != null && pbOwner !== pbSet().id ? ` \u00b7 ${Math.abs(pbDrift)} ms ${pbDrift > 0 ? 'ahead' : 'behind'}` : ''}`);
  if (pbSet().on && pbBackend === true && !pbSigBackend) parts.push('redeploy the backend for the direct link');
  return parts.join(' \u00b7 ');
}
// ---- the devices menu (⇄ on the player, and ⚙ → Playback on your devices…) ----
function pbDevicesMenu(anchor, x, y) {
  closeNowPlayingAddMenu();
  const set = pbSet(), menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu pb-menu';
  const other = pbRemote && pbRemote.dev !== set.id ? pbRemote : null;
  menu.innerHTML = `<div class="menu-section-title">Playback on your devices</div>`
    + `<label class="pb-opt"><input type="checkbox" data-pb-opt="on"${set.on ? ' checked' : ''}> <span>Sync playback across your devices<br><small>One plays at a time: start something here and your other devices pause; “Play here” on any of them carries on from the same moment.</small></span></label>`
    + `<label class="pb-opt"><input type="checkbox" data-pb-opt="strict"${set.strict ? ' checked' : ''}${set.on ? '' : ' disabled'}> <span>Strict sync: play together<br><small>Turn on on each device that should play. They play at the same moment, kept in line; whatever you do on one (a song, pause, a jump, the volume) the other does. Two devices connect directly when they can, for no delay. Not with Spotify songs (Spotify plays on one device per account): use Play from → YouTube only.</small></span></label>`
    + `<label class="pb-opt"><input type="checkbox" data-pb-opt="vol"${set.vol === false ? '' : ' checked'}${set.on ? '' : ' disabled'}> <span>Same volume on every device<br><small>Moving the volume here moves it on the device you hand over to (and on one playing along).</small></span></label>`
    + `<label class="pb-opt pb-name">This device is called <input type="text" data-pb-name maxlength="40" value="${escapeHtml(set.name)}"></label>`
    + (set.on && pbBackend === false ? '<p class="pb-note">Your backend doesn’t know about playback sync yet: paste the new apps-script-backend.gs into Apps Script and deploy it (Deploy → Manage deployments → Edit → New version).</p>' : '')
    + (set.on && other ? `<p class="pb-note">${other.s.playing ? 'Playing' : 'Last played'} on ${escapeHtml(other.devName || 'another device')}: ${escapeHtml(other.s.t)} · ${escapeHtml(other.s.artist)}</p><button type="button" data-pb-here>Play it here ▶</button>` : '')
    + (set.on && pbBackend === true && !other ? '<p class="pb-note">Nothing from your other devices yet. Turn this on there too.</p>' : '')
    + (set.on ? `<p class="pb-note pb-status">${pbStatusLine()}</p>` : '');
  document.body.appendChild(menu);
  if (anchor) { const r = anchor.getBoundingClientRect(); positionFloatingMenu(menu, r.left, r.top - 8); } else positionFloatingMenu(menu, x || innerWidth / 2 - 160, y || 120);
  menu.addEventListener('click', (e) => e.stopPropagation());
  menu.addEventListener('change', (e) => {
    const k = e.target.dataset.pbOpt;
    if (k === 'on') { pbSetSave({ on: e.target.checked }); if (!e.target.checked) pbPillHide(); else pbPoll().then(() => { if (menu.isConnected) pbDevicesMenu(anchor, x, y); }); }
    if (k === 'strict') { pbSetSave({ strict: e.target.checked, follow: false }); if (!e.target.checked && typeof dlCloseAll === 'function') dlCloseAll(); }
    if (k === 'vol') pbSetSave({ vol: e.target.checked });
    if (e.target.dataset.pbName !== undefined) pbSetSave({ name: (e.target.value || '').trim().slice(0, 40) || pbSet().name });
    menu.querySelectorAll('[data-pb-opt="strict"], [data-pb-opt="vol"]').forEach(f => { f.disabled = !pbSet().on; });
  });
  const here = menu.querySelector('[data-pb-here]');
  if (here) here.addEventListener('click', () => { closeNowPlayingAddMenu(); const o = pbRemote; pbPillHide(); pbResume(Object.assign({}, o.s, { playing: true }), { live: !!o.s.playing, elapsed: o.s.playing ? Date.now() - o.seenAt + (o.age || 0) : 0 }); });
  nowPlayingAddMenuEl = menu; setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}

// ---- where you were ----
function placeSave() {
  if ((typeof CRATE_POPOUT_WINDOW !== 'undefined' && CRATE_POPOUT_WINDOW) || !state.catalogFetchedAt || (typeof crateIsMain === 'function' && !crateIsMain())) return;
  const grid = document.getElementById('gridWrap'), tv = document.querySelector('.track-view-table');
  const p = { at: Date.now(), tab: state.activeTab, artists: (state.artistInfoTabs || []).slice(0, 30), artist: state.activeArtistInfoTab || null, genres: (state.genreTabs || []).slice(0, 30), genre: state.activeGenreTab || null,
    playlist: state.activePlaylistId || null, q: el.searchInput ? el.searchInput.value.slice(0, 500) : '', nav: state.navFilter && typeof state.navFilter.mode === 'string' ? { mode: state.navFilter.mode, value: state.navFilter.value } : null,
    scroll: grid ? grid.scrollTop : 0, tscroll: tv ? tv.scrollTop : 0 };
  try { localStorage.setItem(PLACE_KEY, JSON.stringify(p)); } catch (e) { /* not kept */ }
}
function placeRestore() {
  let p; try { p = JSON.parse(localStorage.getItem(PLACE_KEY) || 'null'); } catch (e) { p = null; }
  if (!p || Date.now() - p.at > 14 * 864e5) return;
  try {
    (p.genres || []).forEach(g => { if (typeof g === 'string' && !state.genreTabs.includes(g)) state.genreTabs.push(g); });
    if (typeof renderGenreTabButtons === 'function') renderGenreTabButtons();
    (p.artists || []).forEach(a => { if (typeof a === 'string' && !state.artistInfoTabs.includes(a)) state.artistInfoTabs.push(a); });
    if (typeof renderArtistInfoTabButtons === 'function') renderArtistInfoTabButtons();
    if (p.genre && state.genreTabs.includes(p.genre)) state.activeGenreTab = p.genre;
    if (p.artist && state.artistInfoTabs.includes(p.artist)) state.activeArtistInfoTab = p.artist;
    if (p.q || p.nav) {
      el.searchInput.value = String(p.q || ''); state.query = el.searchInput.value.trim().toLowerCase();
      if (el.searchWrap) el.searchWrap.classList.toggle('mobile-search-has-value', !!state.query);
      if (p.nav && typeof p.nav.mode === 'string') state.navFilter = { mode: p.nav.mode, value: p.nav.value };
      buildLeftList(); updateMainLabel(); applyFiltersSort();
    }
    if (p.playlist && (state.playlists || []).some(pl => String(pl.id) === String(p.playlist))) openPlaylist((state.playlists.find(pl => String(pl.id) === String(p.playlist)) || {}).id);
    if (p.tab === 'artistInfo' && state.activeArtistInfoTab) openArtistInfoTab(state.activeArtistInfoTab);
    else if (p.tab === 'genreInfo' && state.activeGenreTab) openGenreTab(state.activeGenreTab);
    else if (['albums', 'diary', 'scrobbles', 'stats', 'artist'].includes(p.tab) && p.tab !== state.activeTab) switchTab(p.tab);
    if (p.scroll || p.tscroll) setTimeout(() => { const grid = document.getElementById('gridWrap'), tv = document.querySelector('.track-view-table'); if (grid && p.scroll) grid.scrollTop = p.scroll; if (tv && p.tscroll) tv.scrollTop = p.tscroll; }, 700);
  } catch (e) { console.warn('Couldn’t go back to where you were', e); }
}

(function wirePlaybackSync() {
  if (!el.miniPlayer) return;
  const q = document.getElementById('miniPlayerQueueBtn');
  if (q) {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'miniPlayerDevicesBtn'; b.className = 'mini-player-btn'; b.title = 'Playback on your devices'; b.setAttribute('aria-label', 'Playback on your devices'); b.textContent = '⇄';
    b.addEventListener('click', (e) => { e.stopPropagation(); pbDevicesMenu(b); });
    q.parentNode.insertBefore(b, q);
  }
  el.miniPlayer.addEventListener('pointerdown', () => pbActiveMark(), true);          // the player you touch is the one that plays
  const lm = document.getElementById('menuAsk');
  if (lm) {
    const m = document.createElement('button'); m.type = 'button'; m.id = 'menuPlaybackDevices'; m.textContent = 'Playback on your devices…';
    m.addEventListener('click', (e) => { e.stopPropagation(); el.layoutMenu.hidden = true; pbDevicesMenu(null); });
    lm.parentNode.insertBefore(m, lm);
  }
  let pbWatchAt = 0;          // (1.94.5) four times a second in strict sync (a pause there is on the other device a moment later), else once a second
  setInterval(() => { const st = pbSet(); if (!(st.on && st.strict) && Date.now() - pbWatchAt < 950) return; pbWatchAt = Date.now(); try { pbWatch(); } catch (e) { /* next time */ } }, 250);
  setInterval(() => { try { if (pbPlaying() || !el.miniPlayer.hidden) pbLocalSave(); placeSave(); } catch (e) { /* next time */ } }, 3000);
  window.addEventListener('pagehide', () => { try { pbLocalSave(); placeSave(); } catch (e) { /* closing */ } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pbSet().on) pbSyncSchedule(0); });
  if (typeof CRATE_POPOUT_WINDOW !== 'undefined' && CRATE_POPOUT_WINDOW) return;          // a pop-out window: none of the rest
  if (/[?&]crate-test/.test(location.search)) return;          // the test page (made-up crate): never carries on with a song, nor goes back to a place
  (function whenIn() {
    if (!state.catalogFetchedAt) { setTimeout(whenIn, 400); return; }
    setTimeout(async () => {
      // (1.94.3) Playback sync runs in every CRATE window (not a pop-out): with CRATE open twice on a computer, only the first did, and the
      // window you played in (if it wasn't that one) never told anyone, nor heard. Going back to where you were, and carrying on after a
      // refresh, stay the first window's.
      const main = typeof crateIsMain !== 'function' || crateIsMain();
      if (main) placeRestore();
      if (pbSet().on) { await pbPoll(); pbSyncSchedule(4000); }
      if (main) pbLocalResumeOnLoad();
    }, 1200);
  })();
})();
