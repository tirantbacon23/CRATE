// CRATE — "Play from": every source, or one only (Spotify, YouTube or SoundCloud).
// One part of the page's script, split by feature (see 01-core.js). The choice itself, and what it does to playing, is in
// 15-shuffle-artist-info.js (playSource / playCrateQueueIndex) and 12-player-menus.js (playTrackNow / playAlbumNow); this is where you set it:
// a button on the player (it reads "YT only" and so on when one source is chosen) and ⚙ → "Play from…".

// (1.135.123) Each choice as an icon (the button read "YT only", "Spotify only"… in text, wider than the other buttons)
const PS_ICONS = {
  '': '<path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  spotify: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 9.6c3.2-1 6.6-.7 9.3.8M8 12.6c2.6-.7 5.3-.5 7.5.7M8.6 15.4c2-.5 4-.3 5.7.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>',
  soundcloud: '<path d="M7.5 17.5h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.4-1.6A3.6 3.6 0 0 0 7.5 17.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3.5 12v5M5.5 10.5v7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  p2p: '<circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6.5" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="17.5" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.7 10.7l6.6-3M8.7 13.3l6.6 3" stroke="currentColor" stroke-width="1.6"/>',
};
const psIcon = (v, size) => `<svg viewBox="0 0 24 24" width="${size || 16}" height="${size || 16}" aria-hidden="true">${PS_ICONS[v] || PS_ICONS['']}</svg>`;
function playSourceMenu(anchor) {
  closeNowPlayingAddMenu();
  const cur = playSource(), menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu ps-menu';
  const opt = (v, label, sub) => `<button type="button" data-ps="${v}" class="${cur === v ? 'active-option' : ''}"><span class="ps-dot">${cur === v ? '●' : '○'}</span><span class="ps-ico">${psIcon(v, 18)}</span><span><b>${label}</b><small>${sub}</small></span></button>`;
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
  const v = playSource();
  b.innerHTML = psIcon(v, 16) + (v ? '<i class="ps-pip" aria-hidden="true"></i>' : '');          // (a dot: one source chosen)
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
