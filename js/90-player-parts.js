// (1.135.149) What the player shows is yours to choose: ⚙ in the floating player's header, or ⚙ Settings › Player shows…. Each part can be
// turned off (cover, artist, release, like, download, song and release progress, shuffle, repeat, previous/next, volume, and each tool
// button). It applies to the player docked and floating. A hidden video keeps playing (it is only shrunk out of sight), and keyboard
// shortcuts still work for anything hidden.
const PP_KEY = 'crate_player_parts_v1';
const PP_PARTS = [
  ['Song', [
    ['art', 'Cover / video', '#miniPlayerArt'],
    ['artist', 'Artist', '#miniPlayerArtist'],
    ['album', 'Release', '#miniPlayerAlbum'],
    ['extra', 'Extra line', '#miniPlayerExtra'],
    ['like', 'Like', '#miniPlayer .mini-player-track .lk-heart'],
    ['dl', 'Download', '#miniPlayer .mini-player-track .dl-btn'],
  ]],
  ['Progress', [
    ['seek', 'Song progress', '#miniPlayer .mini-player-progress-row'],
    ['release', 'Release progress', '#miniPlayerRelease'],
  ]],
  ['Controls', [
    ['shuffle', 'Shuffle', '#miniPlayerShuffle'],
    ['loop', 'Repeat', '#miniPlayerLoop'],
    ['skip', 'Previous and next', '#miniPlayerPrev, #miniPlayerNext'],
    ['volume', 'Volume', '#miniPlayer .mini-player-volume'],
  ]],
  ['Tools', [
    ['float', 'Float the video', '#miniPlayerFloatBtn'],
    ['fullscreen', 'Fullscreen video', '#miniPlayerFullscreenBtn'],
    ['lyrics', 'Lyrics', '#miniPlayerLyricsBtn'],
    ['viz', 'Visualizer', '#miniPlayerVizBtn'],
    ['queue', 'Up next', '#miniPlayerQueueBtn'],
    ['devices', 'Your devices', '#miniPlayerDevicesBtn, #miniPlayerDeviceBtn'],
    ['source', 'Play from', '#miniPlayerSourceBtn'],
  ]],
];
function ppGet() { try { return JSON.parse(localStorage.getItem(PP_KEY) || '{}') || {}; } catch (e) { return {}; } }
function ppSet(k, on) { const p = ppGet(); if (on) delete p[k]; else p[k] = 0; try { localStorage.setItem(PP_KEY, JSON.stringify(p)); } catch (e) { /* this visit */ } ppApply(); }
function ppApply() {
  const off = ppGet(); let css = '';
  PP_PARTS.forEach(([, rows]) => rows.forEach(([k, , sel]) => { if (off[k] === 0) css += `${sel} { display: none !important; }\n`; }));
  // the video can't be display:none (it would stop): shrunk out of sight instead
  if (off.art === 0) css += '#miniPlayerVideoWrap { position: absolute !important; width: 1px !important; height: 1px !important; opacity: 0 !important; pointer-events: none !important; overflow: hidden !important; }\n';
  let st = document.getElementById('ppStyle'); if (!st) { st = document.createElement('style'); st.id = 'ppStyle'; document.head.appendChild(st); }
  st.textContent = css;
  document.querySelectorAll('[data-pp]').forEach(b => b.setAttribute('aria-pressed', String(off[b.dataset.pp] !== 0)));
}
function ppMenuHtml() {
  const off = ppGet();
  return `<div class="pp-head"><b>Player shows</b><button type="button" class="pp-reset" data-pp-reset>Show all</button></div>${PP_PARTS.map(([h, rows]) => `<div class="pp-h">${h}</div>${rows.map(([k, l]) => `<button type="button" class="pp-row" data-pp="${k}" aria-pressed="${off[k] !== 0}"><span class="pp-box" aria-hidden="true">✓</span>${escapeHtml(l)}</button>`).join('')}`).join('')}`;
}
function ppOpen(anchor) {
  let m = document.getElementById('ppMenu');
  if (m && !m.hidden) { m.hidden = true; return; }
  if (!m) {
    m = document.createElement('div'); m.id = 'ppMenu'; m.className = 'pp-menu'; m.setAttribute('role', 'menu'); document.body.appendChild(m);
    m.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-pp]'); if (b) { ppSet(b.dataset.pp, b.getAttribute('aria-pressed') !== 'true'); return; }
      if (e.target.closest('[data-pp-reset]')) { try { localStorage.removeItem(PP_KEY); } catch (x) { /* fine */ } ppApply(); }
    });
    document.addEventListener('pointerdown', (e) => { if (!m.hidden && !m.contains(e.target) && !e.target.closest('[data-pp-open]')) m.hidden = true; }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) { e.stopPropagation(); m.hidden = true; } }, true);
  }
  m.innerHTML = ppMenuHtml(); m.hidden = false;
  const r = anchor.getBoundingClientRect(), w = 230, h = m.offsetHeight || 480;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
}
(function () {
  ppApply();
  // ⚙ in the floating player's header
  const dock = document.getElementById('miniPlayerDockBtn');
  if (dock) { const b = document.createElement('button'); b.type = 'button'; b.className = 'mini-player-dock-btn'; b.dataset.ppOpen = '1'; b.textContent = '⚙'; b.title = 'What the player shows'; b.setAttribute('aria-label', 'Choose what the player shows'); dock.insertAdjacentElement('beforebegin', b); }
  // and in ⚙ Settings, after the album view's settings
  const after = [...document.querySelectorAll('.menu-sub-title')].find(n => /Album view header/.test(n.textContent));
  if (after) { let n = after.nextElementSibling; while (n && n.nextElementSibling && !n.nextElementSibling.classList.contains('menu-sub-title')) n = n.nextElementSibling;
    const sub = document.createElement('div'); sub.className = 'menu-sub-title'; sub.textContent = 'Player';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'menu-toggle-btn'; b.dataset.ppOpen = '1'; b.innerHTML = '<span class="menu-check" aria-hidden="true"></span>Player shows…'; b.title = 'Turn parts of the player on or off';
    (n || after).insertAdjacentElement('afterend', sub); sub.insertAdjacentElement('afterend', b); }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-pp-open]'); if (!b) return; e.preventDefault(); e.stopPropagation(); ppOpen(b); }, true);
})();
