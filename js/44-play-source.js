// CRATE — "Play from": every source, or one only (Spotify, YouTube or SoundCloud).
// One part of the page's script, split by feature (see 01-core.js). The choice itself, and what it does to playing, is in
// 15-shuffle-artist-info.js (playSource / playCrateQueueIndex) and 12-player-menus.js (playTrackNow / playAlbumNow); this is where you set it:
// a button on the player (it reads "YT only" and so on when one source is chosen) and ⚙ → "Play from…".

function playSourceMenu(anchor) {
  closeNowPlayingAddMenu();
  const cur = playSource(), menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu ps-menu';
  const opt = (v, label, sub) => `<button type="button" data-ps="${v}" class="${cur === v ? 'active-option' : ''}"><span class="ps-dot">${cur === v ? '●' : '○'}</span><span><b>${label}</b><small>${sub}</small></span></button>`;
  menu.innerHTML = `<div class="menu-section-title">Play from</div>`
    + opt('', 'Any source', 'A song’s own link (Spotify, YouTube or SoundCloud), else a Spotify search')
    + opt('spotify', 'Spotify only', 'YouTube and SoundCloud links are passed over')
    + opt('youtube', 'YouTube only', 'Songs without a YouTube link are skipped (and go to Match songs)')
    + opt('soundcloud', 'SoundCloud only', 'Songs without a SoundCloud link are skipped (and go to Match songs)')
    + opt('p2p', 'Soulseek (P2P) first', 'Every song from Soulseek, through the CRATE for P2P add-on; one it can\u2019t find plays from your other sources');
  document.body.appendChild(menu);
  if (anchor) { const r = anchor.getBoundingClientRect(); positionFloatingMenu(menu, r.left, r.top - 8); } else positionFloatingMenu(menu, innerWidth / 2 - 150, 120);
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-ps]'); if (!b) return;
    try { localStorage.setItem(PLAY_SOURCE_KEY, b.dataset.ps); } catch (er) { /* this visit only */ }
    closeNowPlayingAddMenu(); playSourcePaint();
    flashGlobalToast(b.dataset.ps === 'p2p' ? 'Playing from Soulseek first, from the next song.' : b.dataset.ps ? `Playing from ${PLAY_SOURCE_NAMES[b.dataset.ps]} only, from the next song.` : 'Playing from any source, from the next song.');
  });
  nowPlayingAddMenuEl = menu; setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}
function playSourcePaint() {
  const b = document.getElementById('miniPlayerSourceBtn'); if (!b) return;
  const v = playSource(), short = { '': '', spotify: 'Spotify only', youtube: 'YT only', soundcloud: 'SC only', p2p: 'P2P' }[v];
  b.textContent = short || '≡';
  b.classList.toggle('ps-on', !!v);
  b.title = v === 'p2p' ? 'Playing from Soulseek first (click to change)' : v ? `Playing from ${PLAY_SOURCE_NAMES[v]} only (click to change)` : 'Play from: any source (click to choose one)';
  b.setAttribute('aria-label', b.title);
}
(function wirePlaySource() {
  const q = document.getElementById('miniPlayerQueueBtn');
  if (q) {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'miniPlayerSourceBtn'; b.className = 'mini-player-btn ps-btn';
    b.addEventListener('click', (e) => { e.stopPropagation(); playSourceMenu(b); });
    q.parentNode.insertBefore(b, q);
  }
  const ask = document.getElementById('menuAsk');
  if (ask) {
    const m = document.createElement('button'); m.type = 'button'; m.id = 'menuPlaySource'; m.textContent = 'Play from…';
    m.addEventListener('click', (e) => { e.stopPropagation(); el.layoutMenu.hidden = true; playSourceMenu(null); });
    ask.parentNode.insertBefore(m, ask);
  }
  playSourcePaint();
})();
