// CRATE — sign in with Google, startApp / enterApp.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Auth gate (Sign in with Google) ----------
   Nothing in this app touches CONFIG.SCRIPT_URL until a Google ID token is on
   hand. The token itself doesn't grant access by being *present* — the real
   check happens server-side in apps-script-backend.gs, which verifies the
   token's signature and checks the signed-in email against an allowlist
   before returning any data or accepting any write. This client-side gate
   just avoids showing a broken/empty app in the meantime and avoids firing
   requests that we already know will be rejected. */

const GOOGLE_ID_TOKEN_KEY = 'crate_google_id_token_v1';
let appEntered = false; // guards against enterApp() running twice (e.g. GIS auto-select + manual click)
let eventsBound = false; // guards bindEvents()/makeResizable() against re-running on re-entry (see init())

function getStoredIdToken() {
  try { return localStorage.getItem(GOOGLE_ID_TOKEN_KEY) || null; }
  catch (e) { return null; }
}
function setStoredIdToken(token) {
  try { localStorage.setItem(GOOGLE_ID_TOKEN_KEY, token); } catch (e) { /* ignore */ }
}
function clearStoredIdToken() {
  try { localStorage.removeItem(GOOGLE_ID_TOKEN_KEY); } catch (e) { /* ignore */ }
}

// Reads the payload of a JWT without verifying its signature — fine here
// because this is purely a client-side UX shortcut (skip straight to the app
// if we already hold a token that isn't obviously expired yet). The backend
// re-verifies the real signature on every request regardless; this never
// substitutes for that check.
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
      '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
    ).join('')));
  } catch (e) { return null; }
}
function isTokenLikelyValid(token) {
  const payload = decodeJwtPayload(token);
  return !!(payload && payload.exp && payload.exp * 1000 > Date.now());
}

function isAuthError(data) {
  return !!(data && data.error === 'unauthorized');
}

// Called whenever the server tells us the token was missing/invalid/expired —
// on first load, mid-session, wherever. Drops back to the sign-in screen.
// (1.121.0) What to tell someone the backend refused: an account that isn't on the allowlist is told so, by name, with what to do;
// anything else is an ended sign-in, as before.
function authRefusedMessage(data) {
  if (data && data.reason === 'not_allowed') {
    const p = decodeJwtPayload(getStoredIdToken() || '') || {}, who = p.email || p.e || 'This Google account';
    return `${who} isn\u2019t allowed into this CRATE yet. Whoever runs it needs to add it to ALLOWED_EMAILS in the Apps Script and deploy a new version (Deploy \u2192 Manage deployments \u2192 \u270e \u2192 New version). Or sign in with another account.`;
  }
  return '';
}
function handleAuthError(message) {
  clearStoredIdToken();
  appEntered = false;
  el.app.hidden = true;
  showAuthGate(message || 'Your session expired — sign in again to continue.');
}

// ---- Staying signed in ----
// Google's sign-in token lasts ONE HOUR, and every request to your sheet carries it; nothing renewed it, so an hour after
// signing in the next save or refresh was refused and you were sent back to the sign-in screen. Now a new token is asked
// for quietly (Google's automatic sign-in: no click when you are still signed in to Google in this browser) about five
// minutes before the old one runs out, and a request the backend refuses as unauthorized is renewed and sent again once.
// The sign-in screen only comes back when Google won't renew it (signed out of Google, or its automatic sign-in paused
// because you closed its prompt recently).
let authRenewing = null, authRenewDone = null, authRenewTimer = 0, authGsiReady = false;
function tokenExpMs(token) { const p = decodeJwtPayload(token || ''); return p && p.exp ? p.exp * 1000 : 0; }
// (1.120.0) STAYING SIGNED IN FOR REAL: after one Google sign-in, the backend gives CRATE its own session ("cs1.…"), kept where the
// Google token was, so every request carries it without any other change. It lasts 14 days and is renewed about once a day while CRATE
// is open (and at each start), so you stay signed in as long as you use CRATE at least every two weeks. Google's hourly token, whose
// quiet renewal Chrome often blocks, is then never needed again. A backend from before 1.120.0 doesn't know sessions: the Google
// token and its renewal carry on as before.
const isCrateSession = (t) => /^cs1\./.test(String(t || ''));
async function sessionFetch(token) {                               // -> true when a session was stored
  if (!token || !CONFIG.SCRIPT_URL) return false;
  try {
    const r = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'session', idToken: token }) });
    const d = await r.json();
    if (d && isCrateSession(d.session)) { setStoredIdToken(d.session); scheduleAuthRenew(); return true; }
  } catch (e) { /* offline, or an older backend: the token in hand is kept */ }
  return false;
}
function sessionAgeMs(t) { const p = decodeJwtPayload(t || ''); return p && p.iat ? Date.now() - p.iat * 1000 : 0; }
function authRenew() {                                              // -> Promise<boolean>: a new token was stored
  if (authRenewing) return authRenewing;
  const cur = getStoredIdToken();
  if (isCrateSession(cur) && tokenExpMs(cur) > Date.now()) {         // (1.120.0) a session renews itself through the backend
    authRenewing = sessionFetch(cur).finally(() => { authRenewing = null; });
    return authRenewing;
  }
  authRenewing = new Promise(resolve => {
    const g = window.google && window.google.accounts && window.google.accounts.id;
    if (!g || !CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.indexOf('PASTE_YOUR') === 0) { resolve(false); return; }
    let timer = 0;
    const done = (ok) => { if (!authRenewDone) return; clearTimeout(timer); authRenewDone = null; resolve(ok); };
    authRenewDone = done;
    timer = setTimeout(() => done(false), 25000);
    try {
      if (!authGsiReady) { g.initialize({ client_id: CONFIG.GOOGLE_CLIENT_ID, callback: handleGoogleCredential, auto_select: true }); authGsiReady = true; }
      g.prompt((n) => { try { if ((n.isNotDisplayed && n.isNotDisplayed()) || (n.isSkippedMoment && n.isSkippedMoment())) done(false); } catch (e) { /* newer Google sign-in gives no reasons: the timeout decides */ } });
    } catch (e) { done(false); }
  }).finally(() => { authRenewing = null; });
  return authRenewing;
}
function scheduleAuthRenew() {                                      // the next quiet renewal: five minutes before the token runs out
  clearTimeout(authRenewTimer);
  const tok = getStoredIdToken(), exp = tokenExpMs(tok); if (!exp) return;
  if (isCrateSession(tok)) { authRenewTimer = setTimeout(() => { authRenew().then(ok => { if (!ok) authRenewTimer = setTimeout(scheduleAuthRenew, 30 * 60000); }); }, Math.max(10000, Math.min(exp - Date.now() - 5 * 60000, 24 * 3600e3 - sessionAgeMs(tok)))); return; }          // (1.120.0) about once a day
  authRenewTimer = setTimeout(() => { authRenew().then(ok => { if (!ok) authRenewTimer = setTimeout(scheduleAuthRenew, 60000); }); }, Math.min(2147483000, Math.max(10000, exp - Date.now() - 5 * 60000)));          // (a timer longer than ~24.8 days fires at once)
}

function showAuthGate(message) {
  el.authGate.hidden = false;
  if (message) {
    el.authGateStatus.textContent = message;
    el.authGateStatus.hidden = false;
  } else {
    el.authGateStatus.hidden = true;
  }
  initGoogleSignIn();
}

function initGoogleSignIn() {
  if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.indexOf('PASTE_YOUR') === 0) {
    el.authGateStatus.textContent = 'Google sign-in isn\u2019t configured yet — set CONFIG.GOOGLE_CLIENT_ID.';
    el.authGateStatus.hidden = false;
    return;
  }
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    // GIS script hasn't finished loading yet — try again shortly rather than
    // failing silently.
    setTimeout(initGoogleSignIn, 200);
    return;
  }
  google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: true
  });
  authGsiReady = true;
  const btnHost = document.getElementById('googleSignInButton');
  btnHost.innerHTML = '';
  google.accounts.id.renderButton(btnHost, { theme: 'outline', size: 'large', shape: 'pill' });
  google.accounts.id.prompt(); // offers One Tap if there's already a Google session in this browser
}

function handleGoogleCredential(response) {
  setStoredIdToken(response.credential);
  if (authRenewDone) authRenewDone(true);                           // a quiet renewal (see authRenew): the app is already open
  scheduleAuthRenew();
  if (appEntered) sessionFetch(response.credential);                // (1.120.0) a renewal: swapped for a CRATE session (a first sign-in is swapped in enterApp)
  enterApp();
}

function enterApp() {
  if (appEntered) return;
  appEntered = true;
  scheduleAuthRenew();
  { const t = getStoredIdToken(); if (t && (!isCrateSession(t) || sessionAgeMs(t) > 20 * 3600e3)) sessionFetch(t); }          // (1.120.0) a Google token becomes a session; a day-old session is renewed
  el.authGate.hidden = true;
  el.app.hidden = false;
  init();
}

function signOut() {
  clearStoredIdToken();
  appEntered = false;
  if (window.google && window.google.accounts && window.google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  el.app.hidden = true;
  showAuthGate();
}

function startApp() {
  const token = getStoredIdToken();
  if (token && isTokenLikelyValid(token)) {
    // Optimistic: skip straight to the app UI. If the backend ends up
    // rejecting this token on the first real request, fetchCatalog's
    // isAuthError check bounces us back to the gate anyway.
    enterApp();
  } else {
    clearStoredIdToken();
    showAuthGate();
  }
}
