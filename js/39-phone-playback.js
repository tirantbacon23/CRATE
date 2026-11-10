/* ---------- Playing on a phone: Spotify through the Spotify app, and the lock screen ----------
   SPOTIFY: the Web Playback SDK (CRATE's own in-browser "CRATE" Spotify device) runs on computers only; Spotify doesn't support
   it in phone browsers, so on a phone a release never started (CRATE waited for a device that never came). There, CRATE sends
   playback to a Spotify Connect device instead, by default the Spotify app on the phone itself, through the Web API. The music
   then comes from the Spotify app, so it keeps playing with the phone locked, with Spotify's own lock-screen controls.
   On a phone `spotifyPlayer` is a stand-in (makePhoneSpotifyPlayer) with the SDK player's methods (pause, seek, nextTrack, …)
   done through the Web API, so every existing `if (spotifyPlayer)` path (the player's buttons, the seek bar, stopping Spotify
   when YouTube starts …) works unchanged; spotifyDeviceId holds the chosen device (resolvePhoneSpotifyDevice). Which device:
   the one last picked in "Play Spotify on…" (Quick actions), else this phone's Spotify app, else whatever Spotify device is
   active. The Spotify app has to have been opened recently for Spotify to list it (phoneSpotifyNoDevice says so).
   LOCK SCREEN (Media Session): the song, artist, album and cover, play/pause and previous/next, taken from the player bar. iOS
   pauses YouTube and SoundCloud (embedded video/widgets) when the phone locks; this can't stop that, but it names what's
   playing and gives the lock screen working buttons. */

function isPhonePlayback() {
  return !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
}

const PHONE_SPOTIFY_DEVICE_KEY = 'crate_phone_spotify_device_v1';          // { id, name } of the device picked in "Play Spotify on…"
function loadPhoneSpotifyDevice() { try { return JSON.parse(localStorage.getItem(PHONE_SPOTIFY_DEVICE_KEY) || 'null'); } catch (e) { return null; } }
function savePhoneSpotifyDevice(d) { try { localStorage.setItem(PHONE_SPOTIFY_DEVICE_KEY, JSON.stringify({ id: d.id, name: d.name || '' })); } catch (e) { /* private mode: picked again next time */ } }

// One call to /v1/me/player…; null when not connected or the request itself failed.
async function spotifyPlayerApi(method, path, body) {
  const token = await getSpotifyUserAccessToken();
  if (!token) return null;
  try {
    return await fetch('https://api.spotify.com/v1/me/player' + path, {
      method, headers: Object.assign({ 'Authorization': 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { console.warn('Spotify ' + path + ' failed', e); return null; }
}
const spotifyApiOk = (r) => !!r && (r.ok || r.status === 204);

// Picks the device phone playback goes to and keeps it in spotifyDeviceId. force: look again even if one is set (after a 404).
async function resolvePhoneSpotifyDevice(force) {
  if (!force && spotifyDeviceId) return spotifyDeviceId;
  const res = await spotifyPlayerApi('GET', '/devices');
  if (!res || !res.ok) return null;
  let list = [];
  try { list = ((await res.json()).devices || []).filter(d => d.id && !d.is_restricted); } catch (e) { /* none */ }
  const saved = loadPhoneSpotifyDevice();
  const pick = (saved && (list.find(d => d.id === saved.id) || (saved.name && list.find(d => d.name === saved.name))))
    || list.find(d => d.type === 'Smartphone' && d.is_active) || list.find(d => d.type === 'Smartphone')
    || list.find(d => d.is_active) || list[0] || null;
  spotifyDeviceId = pick ? pick.id : null;
  return spotifyDeviceId;
}

function phoneSpotifyNoDevice() {
  flashGlobalToast('Spotify plays through the Spotify app on a phone: open it (play and pause any song), come back and press play again. Tap to open Spotify.',
    { duration: 9000, onClick: () => { location.href = 'spotify:'; } });
}

// The stand-in for the SDK player on a phone (see the top of this file).
function makePhoneSpotifyPlayer() {
  const refreshSoon = () => setTimeout(refreshNowPlayingFromWebApi, 700);          // the 6-second poll would get there too; this makes the bar follow at once
  const isPlaying = () => !!spotifyLastState && !spotifyLastState.paused;
  const setPaused = (paused) => { if (spotifyLastState) { spotifyLastState = Object.assign({}, spotifyLastState, { paused }); spotifyLastStateAt = Date.now(); } setMiniPlayerPlayPauseIcon(paused); };
  const send = async (method, path) => { const r = await spotifyPlayerApi(method, path); if (!spotifyApiOk(r) && r && r.status === 404) phoneSpotifyNoDevice(); return spotifyApiOk(r); };
  return {
    phone: true,
    connect() {}, disconnect() {}, addListener() {},
    setVolume() { return Promise.resolve(); },                                       // the phone's own volume buttons
    async togglePlay() { const wasPlaying = isPlaying(); if (await send('PUT', wasPlaying ? '/pause' : '/play')) setPaused(wasPlaying); refreshSoon(); },
    async pause() { if (!isPlaying()) return; if (await send('PUT', '/pause')) setPaused(true); },   // also how YouTube starting stops Spotify: only when Spotify is actually playing
    async resume() { if (await send('PUT', '/play')) setPaused(false); refreshSoon(); },
    async nextTrack() { await send('POST', '/next'); refreshSoon(); },
    async previousTrack() { await send('POST', '/previous'); refreshSoon(); },
    async seek(ms) { await send('PUT', '/seek?position_ms=' + Math.max(0, Math.round(ms))); }
  };
}

// "Play Spotify on…" (Quick actions, phone only): the device list as a sheet. #devicePanel lives inside the player bar, which
// is hidden until something plays, so on a phone it moves to the page once and is shown above the tab bar.
function openPhoneDevicePicker() {
  const p = el.devicePanel; if (!p) return;
  if (p.parentElement !== document.body) { document.body.appendChild(p); p.classList.add('device-sheet'); }
  if (el.queuePanel) el.queuePanel.hidden = true;
  p.hidden = false;
  refreshDevicePanel();
}

(function wirePhonePlayback() {
  const btn = document.getElementById('qaDeviceBtn');
  if (btn) {
    const paint = () => { btn.hidden = !(isPhonePlayback() && loadSpotifyUserTokens()); };
    paint();
    if (el.qaOverlay) new MutationObserver(paint).observe(el.qaOverlay, { attributes: true, attributeFilter: ['class'] });   // checked each time Quick actions opens
    btn.addEventListener('click', () => { closeQuickActions(); openPhoneDevicePicker(); });
  }
})();

// ---- "Play in the YouTube app" (Quick actions, phone only) ----
// iOS pauses YouTube in a web page when the phone locks; the YouTube app keeps playing (with YouTube Premium). This hands the
// release to the app: one video (a full-release video, a single) is its plain watch link, from where the first song starts;
// several (a video per song) are a watch_videos list of them in order, which YouTube turns into a playlist. It is a real link
// the person taps (#qaYoutubeAppBtn), not a script opening it, since iOS only gives a tapped link to an app.
async function youtubeAppLinkFor(item) {
  let tracks = [];
  try { tracks = (await getTracksFor(item)) || []; } catch (e) { return ''; }
  const ids = [];
  let firstStart = 0;
  tracks.forEach(t => {
    const id = t.youtubeLink && youtubeVideoIdFromUrl(t.youtubeLink);
    if (!id || isBiliId(id) || ids.includes(id)) return;          // (a Bilibili video can't go to the YouTube app)
    if (!ids.length) firstStart = (youtubeSegmentFromUrl(t.youtubeLink) || {}).start || 0;
    ids.push(id);
  });
  if (!ids.length) return '';
  if (ids.length === 1) return 'https://www.youtube.com/watch?v=' + ids[0] + (firstStart ? '&t=' + firstStart + 's' : '');
  return 'https://www.youtube.com/watch_videos?video_ids=' + ids.slice(0, 50).join(',');          // (YouTube takes up to 50)
}
(function wireYoutubeAppLink() {
  const a = document.getElementById('qaYoutubeAppBtn'); if (!a || !el.qaOverlay) return;
  let forItem = null;
  const paint = () => {
    if (!el.qaOverlay.classList.contains('open')) return;
    const item = quickActionsItem;
    if (item === forItem && a.getAttribute('href')) return;
    forItem = item; a.hidden = true; a.removeAttribute('href');
    if (!item || !isPhonePlayback()) return;
    youtubeAppLinkFor(item).then(url => { if (forItem === item && url) { a.href = url; a.hidden = false; } });
  };
  new MutationObserver(paint).observe(el.qaOverlay, { attributes: true, attributeFilter: ['class'] });
  a.addEventListener('click', () => {
    if (activePlayerEngine === 'youtube' && ytPlayer && ytPlayer.pauseVideo) { try { ytPlayer.pauseVideo(); } catch (e) { /* not ready */ } }   // the app plays it now, not CRATE
    phoneTapToStartDone();
    setTimeout(closeQuickActions, 300);
  });
})();

// ---- YouTube and SoundCloud on a phone: one tap on their own player ----
// A phone lets a page start sound only in answer to a tap. CRATE starts a YouTube video or SoundCloud track after looking it up,
// a moment after the tap, so the phone can refuse: the video loads but never starts (and the bar showed it as playing). What
// always works is a tap on YouTube's (or SoundCloud's) own player, and after that first one the same player may start the
// following songs by itself. So when one hasn't started 3.5 seconds after CRATE asked, the player is shown large above the bar
// with "Tap the video to start it", and goes back to its place once it plays. (The iframes are only restyled, never moved:
// moving an iframe reloads it.)
let tapStartTimer = 0;
function phoneTapToStartWatch(engine) {
  if (!isPhonePlayback()) return;
  clearTimeout(tapStartTimer);
  phoneTapToStartDone();
  tapStartTimer = setTimeout(() => {
    if (activePlayerEngine !== engine) return;
    if (engine === 'youtube') {
      let st = -1; try { st = ytPlayer && ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1; } catch (e) { /* not ready */ }
      if (st !== 1 && st !== 3) phoneTapToStartShow('youtube');          // 1 playing, 3 buffering
    } else if (engine === 'soundcloud' && scWidget) {
      try { scWidget.isPaused((paused) => { if (paused && activePlayerEngine === 'soundcloud') phoneTapToStartShow('soundcloud'); }); } catch (e) { /* not ready */ }
    }
  }, 3500);
}
function phoneTapToStartShow(engine) {
  let hint = document.getElementById('tapToStartHint');
  if (!hint) {
    hint = document.createElement('div'); hint.id = 'tapToStartHint'; hint.className = 'tap-to-start-hint'; hint.setAttribute('role', 'status');
    hint.innerHTML = '<p></p><button type="button" class="modal-x" aria-label="Close">✕</button>';
    hint.querySelector('button').addEventListener('click', phoneTapToStartDone);
    document.body.appendChild(hint);
  }
  hint.querySelector('p').textContent = engine === 'youtube'
    ? 'Tap the video to start it. Your phone needs one tap on YouTube’s own player; after that, the next songs start by themselves.'
    : 'Tap the play button below to start it. Your phone needs one tap on SoundCloud’s own player; after that, the next songs start by themselves.';
  hint.hidden = false;
  document.body.classList.add('tap-to-start', 'tap-to-start-' + engine);
  if (engine === 'youtube') setYtPlayPauseUI(true); else setScPlayPauseUI(true);          // the bar said it was playing; it isn't yet
}
function phoneTapToStartDone() {
  clearTimeout(tapStartTimer);
  document.body.classList.remove('tap-to-start', 'tap-to-start-youtube', 'tap-to-start-soundcloud');
  const hint = document.getElementById('tapToStartHint'); if (hint) hint.hidden = true;
}

// ---- Lock screen / Control Center (Media Session) ----
(function wireMediaSession() {
  if (!('mediaSession' in navigator) || !el.miniPlayer) return;
  const ms = navigator.mediaSession;
  let lastKey = '';
  const text = (e) => (e && e.textContent || '').trim();
  const paint = () => {
    const title = text(el.miniPlayerTitle);
    const showing = !el.miniPlayer.hidden && !!title && title !== '\u2014';                  // (— is the bar's placeholder before a song is known)
    const playing = showing && el.miniPlayerPlayPause.title === 'Pause';
    try { ms.playbackState = showing ? (playing ? 'playing' : 'paused') : 'none'; } catch (e) { /* older browsers */ }
    const art = el.miniPlayerArt && el.miniPlayerArt.currentSrc || (el.miniPlayerArt && el.miniPlayerArt.src) || '';
    const key = showing ? [title, text(el.miniPlayerArtist), text(el.miniPlayerAlbum), art].join('\u0001') : '';
    if (key === lastKey) return;                                                        // the bar's clock ticks every second: only a new song or cover is news
    lastKey = key;
    if (!showing) { ms.metadata = null; return; }
    try {
      ms.metadata = new MediaMetadata({
        title, artist: text(el.miniPlayerArtist), album: text(el.miniPlayerAlbum),
        artwork: art && !art.startsWith('data:') ? [{ src: art, sizes: '512x512' }] : [{ src: 'icons/crate-512.png', sizes: '512x512', type: 'image/png' }]
      });
    } catch (e) { /* MediaMetadata missing */ }
  };
  new MutationObserver(paint).observe(el.miniPlayer, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'title', 'hidden'] });
  const on = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (e) { /* this action isn't supported here */ } };
  on('play', () => { if (el.miniPlayerPlayPause.title === 'Play') el.miniPlayerPlayPause.click(); });
  on('pause', () => { if (el.miniPlayerPlayPause.title === 'Pause') el.miniPlayerPlayPause.click(); });
  on('previoustrack', () => masterPlayerStepTrack(-1));
  on('nexttrack', () => masterPlayerStepTrack(1));
  paint();
})();

// ---- In the CRATE iPhone app (ios/): the lock screen is the app's ----
// The app shows what's playing on the lock screen from what this reports, and passes the lock screen's buttons back to
// window.crateRemote. In a browser there is no window.webkit.messageHandlers.crate, and nothing is sent.
window.crateRemote = function (action) {
  const pp = el.miniPlayerPlayPause; if (!pp) return;
  if (action === 'play') { if (pp.title === 'Play') pp.click(); }
  else if (action === 'pause') { if (pp.title === 'Pause') pp.click(); }
  else if (action === 'toggle') pp.click();
  else if (action === 'next') masterPlayerStepTrack(1);
  else if (action === 'previous') masterPlayerStepTrack(-1);
};
(function wireNativeApp() {
  const app = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.crate;
  if (!app || !el.miniPlayer) return;
  const text = (e) => (e && e.textContent || '').trim();
  let lastKey = '';
  const send = () => {
    const title = text(el.miniPlayerTitle);
    const showing = !el.miniPlayer.hidden && !!title && title !== '—';
    const playing = showing && el.miniPlayerPlayPause.title === 'Pause';
    const artist = text(el.miniPlayerArtist), album = text(el.miniPlayerAlbum);
    const src = el.miniPlayerArt && (el.miniPlayerArt.currentSrc || el.miniPlayerArt.src) || '';
    const art = src.startsWith('data:') ? '' : src;
    const key = showing ? [title, artist, album, art, playing].join('\u0001') : '';
    if (key === lastKey) return;                                    // a new song, cover, or play / pause: the clock ticking isn't news
    lastKey = key;
    let duration = 0, position = 0;
    try { duration = (getCurrentDurationMs() || 0) / 1000; position = (getEstimatedPosition() || 0) / 1000; } catch (e) { /* not known yet */ }
    try { app.postMessage({ type: 'nowPlaying', title: showing ? title : '', artist, album, art, playing, duration, position }); } catch (e) { /* the app went away */ }
  };
  new MutationObserver(send).observe(el.miniPlayer, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'title', 'hidden'] });
  send();
})();
