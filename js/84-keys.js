// (1.135.140) Keyboard shortcuts across CRATE, and ? for the list of them. None of them fire while you type in a box. The player's work
// anywhere; the ones that go somewhere (tabs, Galaxy, the wall…) only when nothing is open over the catalogue. Keys that windows already
// use for themselves (the Galaxy's arrows, the cover wall's + −, Match songs' J K) are theirs while they're open.
const KEYS_LIST = [
  ['Playing', [
    ['Space', 'Play or pause'], ['K', 'Play or pause'],
    ['Shift →', 'Next song'], ['Shift ←', 'Previous song'],
    ['.', 'Forward 5 seconds'], [',', 'Back 5 seconds'],
    ['Shift ↑', 'Volume up'], ['Shift ↓', 'Volume down'], ['M', 'Mute or unmute'],
    ['S', 'Shuffle on or off'], ['R', 'Repeat'],
    ['L', 'Like or unlike the song playing'],
    ['D', 'Open the deck of what’s playing'], ['C', 'Show what’s playing in the catalogue'],
  ]],
  ['Going places', [
    ['/', 'Search'], ['Ctrl K', 'Search, from anywhere'],
    ['1', 'Music'], ['2', 'Diary'], ['3', 'Scrobbles'], ['4', 'Stats'], ['5', 'Artist'],
    ['W', 'Cover wall'], ['G', 'Crate Galaxy'], ['T', 'Taste Engine'], ['A', 'Ask your crate'],
    ['Q', 'Up next'], ['Y', 'Lyrics'], ['V', 'Visualizer'],
    ['?', 'This list'], ['Esc', 'Close what’s open'],
  ]],
  ['In a release’s deck', [
    ['E', 'Edit details'], ['P', 'Play it'], ['Ctrl A', 'Select every song'], ['Esc', 'Back to the crate'],
  ]],
  ['Catalogue', [
    ['Ctrl A', 'Select everything showing'], ['Ctrl+click', 'Pick one more (also in the left list)'], ['Shift+click', 'Pick everything up to it'],
  ]],
  ['Crate Galaxy · influence', [
    ['← →', 'Step along a release’s line'], ['↑ ↓', 'What it drew from most / what drew from it most'], ['Esc', 'Let go of the release'],
  ]],
  ['Cover wall', [['+ −', 'Bigger or smaller covers'], ['T', 'Names on or off'], ['Esc', 'Close']]],
];
function keysTyping(t) { return !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))); }
function keysDeckOpen() { return !!(el.deckOverlay && el.deckOverlay.classList.contains('open')); }
function keysOverlayOpen() {                                          // something over the catalogue: then only the player's keys work
  if (keysDeckOpen()) return true;
  if (typeof gx !== 'undefined' && gx.open) return true;
  if (typeof wall !== 'undefined' && wall.el) return true;
  return !![...document.querySelectorAll('.arrange-overlay, .mood-overlay, .gx-overlay, .del-overlay, .rymq-overlay, .desc-overlay, .keys-overlay, #albumQuickPeek, #thmOverlay, #pdOverlay, #batchMatchOverlay, #songMatchOverlay')].find(n => !n.hidden && n.offsetParent !== null);
}
function keysClick(id) { const b = document.getElementById(id); if (b && !b.disabled) { b.click(); return true; } return false; }
function keysVolume(d) {
  const v = document.getElementById('miniPlayerVolume'); if (!v) return;
  const n = Math.max(0, Math.min(100, (+v.value || 0) + d)); if (d && n > 0) keysVolume.was = null;
  v.value = n; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true }));
  if (typeof flashGlobalToast === 'function') flashGlobalToast(`Volume ${n}`);
}
function keysMute() {
  const v = document.getElementById('miniPlayerVolume'); if (!v) return;
  if (+v.value > 0) { keysVolume.was = +v.value; keysVolume(-100); } else keysVolume(keysVolume.was || 50);
}
function keysSeek(ms) { const t = document.getElementById('miniPlayerSeekTrack'); if (t) t.dispatchEvent(new KeyboardEvent('keydown', { key: ms > 0 ? 'ArrowRight' : 'ArrowLeft', bubbles: false })); }
function keysNow() { return typeof nowPlayingItem !== 'undefined' && nowPlayingItem ? nowPlayingItem : null; }

// ----- the list -----
function keysHelp() {
  let ov = document.getElementById('keysOverlay');
  if (ov) { ov.hidden = !ov.hidden; return; }
  ov = document.createElement('div'); ov.id = 'keysOverlay'; ov.className = 'keys-overlay';
  ov.innerHTML = `<div class="keys-dialog" role="dialog" aria-modal="true" aria-labelledby="keysTitle"><div class="keys-head"><h2 id="keysTitle">Keyboard shortcuts</h2><span class="keys-sub">None of them fire while you type in a box. Press ? again to close.</span><button type="button" class="mood-x" data-keys-x aria-label="Close">×</button></div>
    <div class="keys-body">${KEYS_LIST.map(([h, rows]) => `<section><h3>${escapeHtml(h)}</h3>${rows.map(([k, d]) => `<div class="keys-row"><span class="keys-k">${k.split(' ').map(x => `<kbd>${escapeHtml(x)}</kbd>`).join('')}</span><span>${escapeHtml(d)}</span></div>`).join('')}</section>`).join('')}</div></div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-keys-x]')) ov.hidden = true; });
  document.body.appendChild(ov);
}
document.addEventListener('keydown', (e) => {
  const ov = document.getElementById('keysOverlay');
  if (ov && !ov.hidden && (e.key === 'Escape' || e.key === '?')) { e.preventDefault(); e.stopImmediatePropagation(); ov.hidden = true; }
}, true);

// ----- the keys -----
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
  if (keysTyping(e.target)) return;
  const k = e.key, low = k.length === 1 ? k.toLowerCase() : k, over = keysOverlayOpen(), deck = keysDeckOpen();
  const inGx = typeof gx !== 'undefined' && gx.open, inWall = typeof wall !== 'undefined' && wall.el;
  const inMatch = !!document.querySelector('#batchMatchOverlay:not([hidden])');
  const go = (fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
  if (k === '?') return go(keysHelp);
  // the player
  const onCtl = e.target && e.target.closest && e.target.closest('button, a, [role="button"], summary, label, [tabindex]');
  if (!inMatch && ((k === ' ' && !onCtl) || low === 'k')) return go(() => keysClick('miniPlayerPlayPause'));
  if (e.shiftKey && k === 'ArrowRight' && !inGx) return go(() => keysClick('miniPlayerNext'));
  if (e.shiftKey && k === 'ArrowLeft' && !inGx) return go(() => keysClick('miniPlayerPrev'));
  if (e.shiftKey && k === 'ArrowUp') return go(() => keysVolume(5));
  if (e.shiftKey && k === 'ArrowDown') return go(() => keysVolume(-5));
  if (k === '.' || k === '>') return go(() => keysSeek(5000));
  if (k === ',' || k === '<') return go(() => keysSeek(-5000));
  if (inMatch || inWall) return;                                      // (their own letters)
  if (low === 'm') return go(keysMute);
  if (low === 's' && !inGx) return go(() => keysClick('miniPlayerShuffle'));
  if (low === 'r' && !inGx) return go(() => keysClick('miniPlayerLoop'));
  if (low === 'q') return go(() => keysClick('miniPlayerQueueBtn'));
  if (low === 'y') return go(() => keysClick('miniPlayerLyricsBtn'));
  if (low === 'v') return go(() => keysClick('miniPlayerVizBtn'));
  if (deck) {
    if (low === 'e') return go(() => keysClick('deckEditBtn'));
    if (low === 'p') return go(() => keysClick('deckPlayBtn'));
  }
  if (low === 'd' && keysNow() && !inGx) return go(() => openDeck(keysNow()));
  if (over) return;
  if (low === 'c' && keysNow() && typeof showInCatalogue === 'function') return go(() => showInCatalogue(keysNow()));
  if (k === '/') return go(() => { const s = el.searchInput; if (state.activeTab !== 'albums' && typeof switchTab === 'function') switchTab('albums'); if (s) { s.focus(); s.select(); } });
  const tabs = { 1: 'tabAlbums', 2: 'tabDiary', 3: 'tabScrobbles', 4: 'tabStats', 5: 'tabArtist' };
  if (tabs[k]) return go(() => keysClick(tabs[k]));
  if (low === 'w' && typeof wallOpen === 'function') return go(wallOpen);
  if (low === 'g' && typeof openGalaxy === 'function') return go(openGalaxy);
  if (low === 't' && typeof openTaste === 'function') return go(openTaste);
  if (low === 'a' && typeof openAsk === 'function') return go(() => openAsk());
});
