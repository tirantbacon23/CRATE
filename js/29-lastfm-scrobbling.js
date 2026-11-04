// CRATE — Last.fm scrobbling.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// ---------- Last.fm scrobbling (YouTube-sourced plays only) ----------
// Last.fm's own Spotify integration already scrobbles Spotify plays
// automatically, entirely external to CRATE — nothing this app does or
// needs to do. There's no equivalent for YouTube: Last.fm has no way to
// see what plays inside an embedded YouTube video, so without this,
// anything played via a YouTube link in CRATE never reaches a Last.fm
// profile at all. This submits real scrobbles (track.scrobble) for that
// specific gap — see onYtPlayerStateChange's own hook into it.
//
// Auth is Last.fm's classic "desktop" flow (auth.getToken -> user
// approves on last.fm's own site, no redirect needed -> auth.getSession
// exchanges the now-authorized token for a permanent session key), same
// shape as Spotify's Client Credentials setup already in this file, and
// carries the identical trust tradeoff: the Shared Secret has to live in
// browser JS to compute each request's signature, which is not best
// practice for a multi-tenant public app, but is consistent with the risk
// posture this personal-use app already accepts for Spotify.
//
// Every write call (auth.getSession, track.updateNowPlaying,
// track.scrobble) must be signed: every parameter except `format` and
// `callback`, sorted alphabetically by key, concatenated as key+value with
// no separators, the Shared Secret appended at the end, MD5'd, hex-encoded
// — Last.fm's api_sig scheme. MD5 has no browser-native implementation
// (unlike SHA-*, which Web Crypto provides), so a standard, widely-used
// public-domain JS MD5 is inlined below rather than pulling in a library.
function md5(input) {
  function rotateLeft(n, s) { return (n << s) | (n >>> (32 - s)); }
  function addUnsigned(x, y) {
    const x4 = (x & 0x40000000), y4 = (y & 0x40000000), x8 = (x & 0x80000000), y8 = (y & 0x80000000);
    const result = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF);
    if (x4 & y4) return result ^ 0x80000000 ^ x8 ^ y8;
    if (x4 | y4) {
      if (result & 0x40000000) return result ^ 0xC0000000 ^ x8 ^ y8;
      return result ^ 0x40000000 ^ x8 ^ y8;
    }
    return result ^ x8 ^ y8;
  }
  function F(x, y, z) { return (x & y) | (~x & z); }
  function G(x, y, z) { return (x & z) | (y & ~z); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | ~z); }
  function FF(a,b,c,d,x,s,ac){ a=addUnsigned(a,addUnsigned(addUnsigned(F(b,c,d),x),ac)); return addUnsigned(rotateLeft(a,s),b); }
  function GG(a,b,c,d,x,s,ac){ a=addUnsigned(a,addUnsigned(addUnsigned(G(b,c,d),x),ac)); return addUnsigned(rotateLeft(a,s),b); }
  function HH(a,b,c,d,x,s,ac){ a=addUnsigned(a,addUnsigned(addUnsigned(H(b,c,d),x),ac)); return addUnsigned(rotateLeft(a,s),b); }
  function II(a,b,c,d,x,s,ac){ a=addUnsigned(a,addUnsigned(addUnsigned(I(b,c,d),x),ac)); return addUnsigned(rotateLeft(a,s),b); }
  function convertToWordArray(str) {
    let wordCount;
    const messageLength = str.length;
    const numberOfWordsTemp1 = messageLength + 8;
    const numberOfWordsTemp2 = (numberOfWordsTemp1 - (numberOfWordsTemp1 % 64)) / 64;
    const numberOfWords = (numberOfWordsTemp2 + 1) * 16;
    const wordArray = new Array(numberOfWords - 1);
    let bytePosition = 0, byteCount = 0;
    while (byteCount < messageLength) {
      wordCount = (byteCount - (byteCount % 4)) / 4;
      bytePosition = (byteCount % 4) * 8;
      wordArray[wordCount] = (wordArray[wordCount] || 0) | (str.charCodeAt(byteCount) << bytePosition);
      byteCount++;
    }
    wordCount = (byteCount - (byteCount % 4)) / 4;
    bytePosition = (byteCount % 4) * 8;
    wordArray[wordCount] = (wordArray[wordCount] || 0) | (0x80 << bytePosition);
    wordArray[numberOfWords - 2] = messageLength << 3;
    wordArray[numberOfWords - 1] = messageLength >>> 29;
    return wordArray;
  }
  function wordToHex(value) {
    let hex = '', byte, count;
    for (count = 0; count <= 3; count++) {
      byte = (value >>> (count * 8)) & 255;
      hex += ('0' + byte.toString(16)).slice(-2);
    }
    return hex;
  }
  const str = unescape(encodeURIComponent(input)); // UTF-8 encode
  const x = convertToWordArray(str);
  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  const S11=7,S12=12,S13=17,S14=22,S21=5,S22=9,S23=14,S24=20,S31=4,S32=11,S33=16,S34=23,S41=6,S42=10,S43=15,S44=21;
  for (let k = 0; k < x.length; k += 16) {
    const AA=a, BB=b, CC=c, DD=d;
    a=FF(a,b,c,d,x[k+0],S11,0xD76AA478); d=FF(d,a,b,c,x[k+1],S12,0xE8C7B756); c=FF(c,d,a,b,x[k+2],S13,0x242070DB); b=FF(b,c,d,a,x[k+3],S14,0xC1BDCEEE);
    a=FF(a,b,c,d,x[k+4],S11,0xF57C0FAF); d=FF(d,a,b,c,x[k+5],S12,0x4787C62A); c=FF(c,d,a,b,x[k+6],S13,0xA8304613); b=FF(b,c,d,a,x[k+7],S14,0xFD469501);
    a=FF(a,b,c,d,x[k+8],S11,0x698098D8); d=FF(d,a,b,c,x[k+9],S12,0x8B44F7AF); c=FF(c,d,a,b,x[k+10],S13,0xFFFF5BB1); b=FF(b,c,d,a,x[k+11],S14,0x895CD7BE);
    a=FF(a,b,c,d,x[k+12],S11,0x6B901122); d=FF(d,a,b,c,x[k+13],S12,0xFD987193); c=FF(c,d,a,b,x[k+14],S13,0xA679438E); b=FF(b,c,d,a,x[k+15],S14,0x49B40821);
    a=GG(a,b,c,d,x[k+1],S21,0xF61E2562); d=GG(d,a,b,c,x[k+6],S22,0xC040B340); c=GG(c,d,a,b,x[k+11],S23,0x265E5A51); b=GG(b,c,d,a,x[k+0],S24,0xE9B6C7AA);
    a=GG(a,b,c,d,x[k+5],S21,0xD62F105D); d=GG(d,a,b,c,x[k+10],S22,0x02441453); c=GG(c,d,a,b,x[k+15],S23,0xD8A1E681); b=GG(b,c,d,a,x[k+4],S24,0xE7D3FBC8);
    a=GG(a,b,c,d,x[k+9],S21,0x21E1CDE6); d=GG(d,a,b,c,x[k+14],S22,0xC33707D6); c=GG(c,d,a,b,x[k+3],S23,0xF4D50D87); b=GG(b,c,d,a,x[k+8],S24,0x455A14ED);
    a=GG(a,b,c,d,x[k+13],S21,0xA9E3E905); d=GG(d,a,b,c,x[k+2],S22,0xFCEFA3F8); c=GG(c,d,a,b,x[k+7],S23,0x676F02D9); b=GG(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
    a=HH(a,b,c,d,x[k+5],S31,0xFFFA3942); d=HH(d,a,b,c,x[k+8],S32,0x8771F681); c=HH(c,d,a,b,x[k+11],S33,0x6D9D6122); b=HH(b,c,d,a,x[k+14],S34,0xFDE5380C);
    a=HH(a,b,c,d,x[k+1],S31,0xA4BEEA44); d=HH(d,a,b,c,x[k+4],S32,0x4BDECFA9); c=HH(c,d,a,b,x[k+7],S33,0xF6BB4B60); b=HH(b,c,d,a,x[k+10],S34,0xBEBFBC70);
    a=HH(a,b,c,d,x[k+13],S31,0x289B7EC6); d=HH(d,a,b,c,x[k+0],S32,0xEAA127FA); c=HH(c,d,a,b,x[k+3],S33,0xD4EF3085); b=HH(b,c,d,a,x[k+6],S34,0x04881D05);
    a=HH(a,b,c,d,x[k+9],S31,0xD9D4D039); d=HH(d,a,b,c,x[k+12],S32,0xE6DB99E5); c=HH(c,d,a,b,x[k+15],S33,0x1FA27CF8); b=HH(b,c,d,a,x[k+2],S34,0xC4AC5665);
    a=II(a,b,c,d,x[k+0],S41,0xF4292244); d=II(d,a,b,c,x[k+7],S42,0x432AFF97); c=II(c,d,a,b,x[k+14],S43,0xAB9423A7); b=II(b,c,d,a,x[k+5],S44,0xFC93A039);
    a=II(a,b,c,d,x[k+12],S41,0x655B59C3); d=II(d,a,b,c,x[k+3],S42,0x8F0CCC92); c=II(c,d,a,b,x[k+10],S43,0xFFEFF47D); b=II(b,c,d,a,x[k+1],S44,0x85845DD1);
    a=II(a,b,c,d,x[k+8],S41,0x6FA87E4F); d=II(d,a,b,c,x[k+15],S42,0xFE2CE6E0); c=II(c,d,a,b,x[k+6],S43,0xA3014314); b=II(b,c,d,a,x[k+13],S44,0x4E0811A1);
    a=II(a,b,c,d,x[k+4],S41,0xF7537E82); d=II(d,a,b,c,x[k+11],S42,0xBD3AF235); c=II(c,d,a,b,x[k+2],S43,0x2AD7D2BB); b=II(b,c,d,a,x[k+9],S44,0xEB86D391);
    a=addUnsigned(a,AA); b=addUnsigned(b,BB); c=addUnsigned(c,CC); d=addUnsigned(d,DD);
  }
  return (wordToHex(a)+wordToHex(b)+wordToHex(c)+wordToHex(d)).toLowerCase();
}

function loadLastfmScrobbleCreds() {
  try { return JSON.parse(localStorage.getItem(LASTFM_SCROBBLE_CREDS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveLastfmScrobbleCreds(apiKey, sharedSecret) {
  try { localStorage.setItem(LASTFM_SCROBBLE_CREDS_KEY, JSON.stringify({ apiKey, sharedSecret })); }
  catch (e) { /* localStorage unavailable — safe to ignore */ }
}
function loadLastfmScrobbleSession() {
  try { return JSON.parse(localStorage.getItem(LASTFM_SCROBBLE_SESSION_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveLastfmScrobbleSession(sessionKey, username) {
  try { localStorage.setItem(LASTFM_SCROBBLE_SESSION_KEY, JSON.stringify({ sessionKey, username })); }
  catch (e) { /* localStorage unavailable — safe to ignore */ }
}
function clearLastfmScrobbleSession() {
  try { localStorage.removeItem(LASTFM_SCROBBLE_SESSION_KEY); } catch (e) { /* ignore */ }
}

// Last.fm's api_sig scheme: every param except format/callback, sorted by
// key, concatenated as key+value with no separators, secret appended, MD5'd.
function lastfmApiSig(params, secret) {
  const keys = Object.keys(params).filter(k => k !== 'format' && k !== 'callback').sort();
  let base = '';
  keys.forEach(k => { base += k + params[k]; });
  base += secret;
  return md5(base);
}

// Generic signed Last.fm API call. GET for read methods, POST (form-
// encoded) for write methods (auth.getSession, track.scrobble,
// track.updateNowPlaying) per Last.fm's own requirement that state-
// changing calls must be POST.
async function lastfmApiCall(method, params, isPost) {
  const { apiKey, sharedSecret } = loadLastfmScrobbleCreds();
  if (!apiKey || !sharedSecret) return null;
  const allParams = Object.assign({ method, api_key: apiKey }, params);
  if (isPost && !/^auth\./.test(method)) { const sk = loadLastfmScrobbleSession().sessionKey; if (sk) allParams.sk = sk; }          // writing to an account (a scrobble, "now playing") must carry that account's session key, and be signed WITH it
  allParams.api_sig = lastfmApiSig(allParams, sharedSecret);
  allParams.format = 'json';
  const qs = new URLSearchParams(allParams).toString();
  const url = 'https://ws.audioscrobbler.com/2.0/' + (isPost ? '' : '?' + qs);
  try {
    const res = await fetch(url, isPost ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: qs
    } : undefined);
    const data = await res.json();
    if (data.error) { console.warn('Last.fm API error', data.error, data.message); return null; }
    return data;
  } catch (e) {
    console.warn('Last.fm API request failed', e);
    return null;
  }
}

// Step 1 of connecting an account — get an unauthorized token and send the
// person to Last.fm's own site to approve it (no redirect/callback needed,
// same "desktop app" flow every Last.fm scrobbler uses).
async function connectLastfmScrobbleAccount() {
  const { apiKey } = loadLastfmScrobbleCreds();
  if (!apiKey) { flashGlobalToast('Save your API Key/Shared Secret first.'); return; }
  const data = await lastfmApiCall('auth.getToken', {}, false);
  if (!data || !data.token) { el.lastfmScrobbleConnectStatus.hidden = false; el.lastfmScrobbleConnectStatus.textContent = 'Could not get a token from Last.fm — check your API Key/Secret.'; return; }
  try { localStorage.setItem(LASTFM_PENDING_TOKEN_KEY, JSON.stringify({ token: data.token, requestedAt: Date.now() })); } catch (e) { /* ignore */ }
  window.open(`https://www.last.fm/api/auth/?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(data.token)}`, '_blank', 'noopener,noreferrer');
  el.lastfmScrobbleFinishBtn.hidden = false;
  el.lastfmScrobbleConnectStatus.hidden = false;
  el.lastfmScrobbleConnectStatus.textContent = 'Approve access on the Last.fm tab that just opened, then come back and click "I\u2019ve approved it".';
}

// Step 2 — exchange the now-authorized token for a permanent session key.
// Last.fm's token is only valid for a limited window from when it was
// requested (auth.getToken), so a stale pending token just prompts to
// reconnect rather than failing silently.
async function finishLastfmScrobbleConnect() {
  let pending;
  try { pending = JSON.parse(localStorage.getItem(LASTFM_PENDING_TOKEN_KEY) || '{}'); } catch (e) { pending = {}; }
  if (!pending.token) { flashGlobalToast('Click "Connect Last.fm account" first.'); return; }
  const data = await lastfmApiCall('auth.getSession', { token: pending.token }, true);
  if (!data || !data.session) {
    el.lastfmScrobbleConnectStatus.hidden = false;
    el.lastfmScrobbleConnectStatus.textContent = 'Not approved yet (or the token expired) — approve it on Last.fm, then try again.';
    return;
  }
  saveLastfmScrobbleSession(data.session.key, data.session.name);
  try { localStorage.removeItem(LASTFM_PENDING_TOKEN_KEY); } catch (e) { /* ignore */ }
  renderLastfmScrobbleModalState();
  flashGlobalToast(`Connected to Last.fm as ${data.session.name}.`);
}

function disconnectLastfmScrobbleAccount() {
  clearLastfmScrobbleSession();
  renderLastfmScrobbleModalState();
}

function renderLastfmScrobbleModalState() {
  const creds = loadLastfmScrobbleCreds();
  const session = loadLastfmScrobbleSession();
  el.lastfmScrobbleApiKey.value = creds.apiKey || '';
  el.lastfmScrobbleSecret.value = creds.sharedSecret || '';
  const connected = !!session.sessionKey;
  el.lastfmScrobbleConnectBtn.hidden = connected;
  el.lastfmScrobbleFinishBtn.hidden = true;
  el.lastfmScrobbleDisconnectBtn.hidden = !connected;
  el.lastfmScrobbleConnectHint.textContent = connected
    ? `Connected as ${session.username} — YouTube plays will scrobble to this account.`
    : 'Save your API Key/Secret above first, then connect the specific Last.fm account to scrobble to.';
}

// ---- Actually submitting scrobbles for YouTube playback ----
// Last.fm's rule: a track counts once it has really PLAYED for half its length or 4 minutes, whichever is less, and it must be longer than 30 seconds.
// Every time a YouTube track STARTS (a new one, the next one, or the same one again: playYtQueueIndex) a fresh record is begun. Time is counted only while it is actually playing (not paused or buffering).
// The scrobble is sent the moment the rule is met (a timer), stamped with when the track STARTED, so skipping ahead, stopping or closing afterwards loses nothing; when a track ends, is skipped or is closed
// before that, it is checked once more and then dropped.
let ytScrobble = null;   // { videoId, artist, track, album, startedAt (ms, first PLAYING), playedMs, resumedAt (ms; 0 = not playing now), duration (s), sent, tries, timer }
const YT_SCROBBLE_NO_NAME = ['', 'now playing', 'untitled track'];       // stand-in names CRATE shows when it has no real track name: never sent to Last.fm
function ytScrobbleEligible(durationSec, elapsedSec) {
  if (!durationSec || durationSec < 30) return false;
  return elapsedSec >= Math.min(240, durationSec / 2);
}
function ytScrobbleUsable(r) { return !!(r && r.artist && !YT_SCROBBLE_NO_NAME.includes(String(r.track || '').trim().toLowerCase()) && loadLastfmScrobbleSession().sessionKey); }
function ytScrobbleBegin(q) {                                    // a track is starting
  const it = nowPlayingItem;
  ytScrobble = { start: q.start || 0, end: q.end || 0, videoId: q.videoId, artist: (it && it.artist) || '', track: String(q.trackName || '').trim(), album: it ? it.title : '', startedAt: 0, playedMs: 0, resumedAt: 0, duration: 0, sent: false, tries: 0, timer: 0 };
}
function ytScrobblePlayedMs(r) { return r.playedMs + (r.resumedAt ? Date.now() - r.resumedAt : 0); }
function ytScrobbleResume() {                                    // the player says PLAYING (start, resume after a pause, after a seek)
  const r = ytScrobble; if (!r || r.sent) return;
  try { const d = (ytPlayer && ytPlayer.getDuration && ytPlayer.getDuration()) || 0; r.duration = (r.start || r.end) ? (Math.max(0, (r.end || d) - r.start) || r.duration) : (d || r.duration); } catch (e) { /* keep what we had */ }          // a track in a full-release video is as long as its part, not the whole video
  if (!r.startedAt) { r.startedAt = Date.now(); ytScrobbleNowPlaying(r); }
  if (!r.resumedAt) r.resumedAt = Date.now();
  ytScrobbleSchedule(r);
}
function ytScrobblePause() {                                     // paused, buffering or ended: the time so far is kept, the clock stops
  const r = ytScrobble; if (!r) return;
  if (r.resumedAt) { r.playedMs += Date.now() - r.resumedAt; r.resumedAt = 0; }
  clearTimeout(r.timer); r.timer = 0;
}
function ytScrobbleSchedule(r) {                                 // when the rule will be met if it keeps playing
  clearTimeout(r.timer); r.timer = 0;
  if (r.sent || !r.duration || r.duration < 30) return;
  const need = Math.min(240, r.duration / 2) * 1000 - ytScrobblePlayedMs(r);
  r.timer = setTimeout(() => { if (ytScrobble === r) ytScrobbleSubmit(r); }, Math.max(0, need) + 50);
}
function ytScrobbleFlush() { const r = ytScrobble; if (!r) return; ytScrobblePause(); ytScrobbleSubmit(r); }          // the track ended, was skipped or was closed: counts only if the rule was met
async function ytScrobbleSubmit(r) {
  if (r.sent || !r.startedAt) return;
  if (!ytScrobbleEligible(r.duration, ytScrobblePlayedMs(r) / 1000 + 0.25)) return;
  r.sent = true;                                                  // it has qualified: from here it is sent once, or (with no connected account, or no real name or artist) dropped, never held back for later
  if (!ytScrobbleUsable(r)) return;
  const res = await lastfmApiCall('track.scrobble', { artist: r.artist, track: r.track, timestamp: Math.floor(r.startedAt / 1000), album: r.album || '' }, true);
  if (res) return;
  r.sent = false; r.tries++;                                      // Last.fm didn't take it (a hiccup, or the connection has lapsed): twice more, then say so
  if (r.tries < 3) setTimeout(() => ytScrobbleSubmit(r), 5000 * r.tries);
  else { r.sent = true; flashGlobalToast(`Last.fm didn\u2019t accept the scrobble of \u201c${r.track}\u201d. If this keeps happening, reconnect your Last.fm account in the settings.`); }
}
function ytScrobbleNowPlaying(r) {
  if (!ytScrobbleUsable(r)) return;
  lastfmApiCall('track.updateNowPlaying', { artist: r.artist, track: r.track, album: r.album || '' }, true);
}

function loadSpotifyCreds() {
  try { return JSON.parse(localStorage.getItem(SPOTIFY_CREDS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveSpotifyCreds(clientId, clientSecret) {
  try { localStorage.setItem(SPOTIFY_CREDS_KEY, JSON.stringify({ clientId, clientSecret })); }
  catch (e) { /* localStorage unavailable — safe to ignore */ }
}

async function getSpotifyToken() {
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 5000) return spotifyToken.value;

  const { clientId, clientSecret } = loadSpotifyCreds();
  if (!clientId || !clientSecret) return null; // not configured at all — expected, not an error, no toast

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
      },
      body: 'grant_type=client_credentials'
    });
    if (!res.ok) {
      console.warn('Spotify token request failed', res.status);
      flashGlobalToast(`Couldn\u2019t get a Spotify search token (error ${res.status}) \u2014 check your Client ID/Secret in \u2699 \u2192 Spotify API\u2026`);
      return null;
    }
    const data = await res.json();
    if (!data.access_token) { flashGlobalToast('Spotify didn\u2019t return a usable token — try again.'); return null; }
    spotifyToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    return spotifyToken.value;
  } catch (e) {
    // Previously silent (console.warn only) here too — this is the OTHER
    // half of spotifyTrackSearchRaw's own note on Spotify's recurring
    // CORS fragility: if THIS request (the token exchange itself) is what
    // gets blocked, every downstream track search bails out immediately
    // via spotifyTrackCandidatesLive's `if (!token) return [];` with zero
    // indication it was ever a token problem rather than a genuine
    // no-results search.
    console.warn('Spotify token request failed', e);
    flashGlobalToast('Couldn\u2019t reach Spotify to get a search token at all \u2014 check the browser console for the exact error.');
    return null;
  }
}
