// CRATE — the YouTube video in a floating window of its own.
// One part of the page's script, split by feature (see 01-core.js).
//
// While a song plays from YouTube its video sits in the player bar, the size of a cover. ⧉ beside it (or beside ⛶) floats it: the same video
// becomes a window over the page that you drag by its title bar and size from its corner, and ⤓ puts it back. Nothing is moved in the page:
// a YouTube iframe moved to another place reloads (the song would start again), so the very same box is only drawn somewhere else. Whether it
// floats, where, and how big are remembered, so the next YouTube song floats there too; a song from Spotify or SoundCloud has no video, and the
// window goes away until one from YouTube plays again.

const VF_KEY = 'crate_video_float_v1', VF_BAR = 26;
function vfPrefs() { try { return JSON.parse(localStorage.getItem(VF_KEY) || '{}') || {}; } catch (e) { return {}; } }
function vfSave(patch) { const p = Object.assign(vfPrefs(), patch); try { localStorage.setItem(VF_KEY, JSON.stringify(p)); } catch (e) { /* this visit only */ } return p; }
function vfFloating() { return !!vfPrefs().on; }
function vfPlace() {                                                   // size and place it, inside the window
  const w = el.miniPlayerVideoWrap, p = vfPrefs();
  const W = Math.round(Math.max(220, Math.min(p.w || 420, innerWidth - 16))), H = Math.round(W * 9 / 16) + VF_BAR;
  const x = Math.max(8, Math.min(p.x != null ? p.x : innerWidth - W - 16, innerWidth - W - 8));
  const y = Math.max(8, Math.min(p.y != null ? p.y : innerHeight - H - 96, innerHeight - H - 8));
  Object.assign(w.style, { left: x + 'px', top: y + 'px', width: W + 'px', height: H + 'px' });
}
function vfApply() {
  const w = el.miniPlayerVideoWrap; if (!w) return;
  const on = vfFloating();
  w.classList.toggle('vf-floating', on);
  el.miniPlayer.classList.toggle('vf-on', on);
  if (on) vfPlace(); else Object.assign(w.style, { left: '', top: '', width: '', height: '' });
  const b = document.getElementById('miniPlayerFloatBtn');
  if (b) { b.classList.toggle('active', on); b.title = on ? 'Put the video back in the player' : 'Float the video in its own window'; b.setAttribute('aria-label', b.title); }
  vfTitle();
}
function vfToggle(on) { vfSave({ on: on === undefined ? !vfFloating() : !!on }); vfApply(); }
function vfTitle() { const t = document.getElementById('vfTitle'); if (t) t.textContent = (el.miniPlayerTitle && el.miniPlayerTitle.textContent.trim()) || (currentSpotifyTrack && currentSpotifyTrack.name) || 'YouTube'; }

(function wireFloatingVideo() {
  const w = el.miniPlayerVideoWrap, fs = el.miniPlayerFullscreenBtn; if (!w) return;
  const bar = document.createElement('div'); bar.className = 'vf-bar';
  bar.innerHTML = '<span class="vf-title" id="vfTitle">YouTube</span><button type="button" class="vf-btn" data-vf="full" title="Fullscreen" aria-label="Fullscreen">⛶</button><button type="button" class="vf-btn" data-vf="dock" title="Put the video back in the player" aria-label="Put the video back in the player">⤓</button>';
  const grip = document.createElement('div'); grip.className = 'vf-resize'; grip.title = 'Drag to resize';
  // (1.94.3) Controls of its own, over the video, only while the mouse is over it (in fullscreen: for a moment after it moves). YouTube's
  // player is made without its own (they came up by themselves whenever a song started, over the picture).
  const ctl = document.createElement('div'); ctl.className = 'vf-ctl';
  ctl.innerHTML = '<button type="button" class="vf-cbtn" data-vfc="play" aria-label="Play or pause">\u23f8</button><span class="vf-time" data-vfc-t>0:00</span><div class="vf-seek" data-vfc="seek"><i data-vfc-fill></i></div><span class="vf-time" data-vfc-d>0:00</span><button type="button" class="vf-cbtn" data-vfc="full" aria-label="Fullscreen">\u26f6</button>';
  w.appendChild(bar); w.appendChild(ctl); w.appendChild(grip);
  const fmt = (ms) => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const paintCtl = () => {
    if (!(vfFloating() || document.fullscreenElement === w)) return;
    const pos = getEstimatedPosition() || 0, dur = getCurrentDurationMs() || 0;
    ctl.querySelector('[data-vfc-t]').textContent = fmt(pos); ctl.querySelector('[data-vfc-d]').textContent = fmt(dur);
    ctl.querySelector('[data-vfc-fill]').style.width = (dur ? Math.min(100, pos / dur * 100) : 0) + '%';
    ctl.querySelector('[data-vfc="play"]').textContent = el.miniPlayerPlayPause && el.miniPlayerPlayPause.title === 'Pause' ? '\u23f8' : '\u25b6';
  };
  setInterval(() => { if (w.matches(':hover') || w.classList.contains('vf-awake')) paintCtl(); }, 400);
  w.addEventListener('mouseenter', paintCtl);
  let awakeT = 0;
  w.addEventListener('mousemove', () => { if (document.fullscreenElement !== w) return; w.classList.add('vf-awake'); clearTimeout(awakeT); awakeT = setTimeout(() => w.classList.remove('vf-awake'), 2200); });
  ctl.addEventListener('click', (e) => {
    e.stopPropagation();
    const k = e.target.closest('[data-vfc]'); if (!k) return;
    if (k.dataset.vfc === 'play') { if (el.miniPlayerPlayPause) el.miniPlayerPlayPause.click(); setTimeout(paintCtl, 150); }
    else if (k.dataset.vfc === 'full') { if (typeof toggleYtFullscreen === 'function') toggleYtFullscreen(); }
    else if (k.dataset.vfc === 'seek') {
      const r = k.getBoundingClientRect(), ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), dur = getCurrentDurationMs() || 0;
      if (dur && ytPlayer && ytPlayer.seekTo) { try { ytSeekInSegment(ratio * dur / 1000); } catch (er) { /* not ready */ } setTimeout(paintCtl, 200); }
    }
  });
  if (fs) {                                                            // ⧉ beside ⛶ in the player bar, shown with it (YouTube only)
    const b = document.createElement('button'); b.type = 'button'; b.id = 'miniPlayerFloatBtn'; b.className = 'mini-player-btn'; b.textContent = '⧉'; b.hidden = fs.hidden;
    b.addEventListener('click', (e) => { e.stopPropagation(); vfToggle(); });
    fs.parentNode.insertBefore(b, fs);
    new MutationObserver(() => { b.hidden = fs.hidden; }).observe(fs, { attributes: true, attributeFilter: ['hidden'] });
  }
  bar.addEventListener('click', (e) => {
    const k = e.target.closest('[data-vf]'); if (!k) return;
    e.stopPropagation();
    if (k.dataset.vf === 'dock') vfToggle(false); else if (typeof toggleYtFullscreen === 'function') toggleYtFullscreen();
  });
  // Drag by the title bar, size from the corner. The video's iframe would take the pointer as it passes over it, so it is ignored meanwhile.
  function drag(e, mode) {
    if (!vfFloating() || e.button > 0 || e.target.closest('.vf-btn')) return;
    e.preventDefault();
    const r = w.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    w.classList.add('vf-dragging');
    const move = (ev) => {
      if (mode === 'move') { w.style.left = Math.max(8 - r.width + 60, Math.min(innerWidth - 60, r.left + ev.clientX - sx)) + 'px'; w.style.top = Math.max(0, Math.min(innerHeight - VF_BAR, r.top + ev.clientY - sy)) + 'px'; }
      else { const W = Math.max(220, Math.min(innerWidth - r.left - 4, r.width + ev.clientX - sx)); w.style.width = W + 'px'; w.style.height = (Math.round(W * 9 / 16) + VF_BAR) + 'px'; }
    };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      w.classList.remove('vf-dragging');
      const n = w.getBoundingClientRect(); vfSave({ x: Math.round(n.left), y: Math.round(n.top), w: Math.round(n.width) }); vfPlace();          // (kept, and put back inside the window)
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
  bar.addEventListener('pointerdown', (e) => drag(e, 'move'));
  grip.addEventListener('pointerdown', (e) => drag(e, 'size'));
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.vf-btn')) vfToggle(false); });          // a double-click on the bar docks it too
  window.addEventListener('resize', () => { if (vfFloating()) vfPlace(); });
  new MutationObserver(vfTitle).observe(el.miniPlayerTitle, { childList: true, characterData: true, subtree: true });          // its bar names the song
  vfApply();
})();
