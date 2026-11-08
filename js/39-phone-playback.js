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
