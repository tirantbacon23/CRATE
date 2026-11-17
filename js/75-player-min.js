// ===== (1.135.120) The floating player, minimal: a slim card =====
// The floating (detached) player can be the full one or a slim card: the cover, the song and artist, play/pause and next, and a thin
// line along its foot for where the song is. Previous, and the buttons to go back to the full player or dock it, show when the mouse is
// over it; it's dragged from anywhere on it. ◫ on the full floating player's bar switches to it; it's remembered.

const PMIN_KEY = 'crate_player_min_v1';
function pminOn() { try { return localStorage.getItem(PMIN_KEY) === '1'; } catch (e) { return false; } }
function pminSet(on) {
  try { localStorage.setItem(PMIN_KEY, on ? '1' : '0'); } catch (e) { /* this visit */ }
  pminApply();
  if (typeof fitDetachedPlayer === 'function') setTimeout(fitDetachedPlayer, 30);          // (its size changed: kept on screen)
}
function pminApply() {
  const p = el && el.miniPlayer; if (!p) return;
  const on = pminOn() && p.classList.contains('detached');
  p.classList.toggle('mp-min', on);
  const b = document.getElementById('pminBtn'); if (b) { b.hidden = !p.classList.contains('detached'); }
}
(function pminInit() {
  const go = () => {
    const p = el && el.miniPlayer, h = el && el.miniPlayerDragHandle; if (!p || !h) return setTimeout(go, 400);
    if (document.getElementById('pminBtn')) return;
    // ◫ on the full floating player's bar
    const b = document.createElement('button'); b.type = 'button'; b.id = 'pminBtn'; b.className = 'mini-player-dock-btn pmin-btn'; b.textContent = '◫'; b.title = 'Minimal player'; b.setAttribute('aria-label', 'Switch to the minimal player');
    const dock = document.getElementById('miniPlayerDockBtn'); if (dock) dock.before(b); else h.appendChild(b);
    b.addEventListener('mousedown', (e) => e.stopPropagation()); b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    b.addEventListener('click', (e) => { e.stopPropagation(); pminSet(true); });
    // the minimal card's own buttons, shown when the mouse is over it
    const t = document.createElement('div'); t.className = 'pmin-tools';
    t.innerHTML = '<button type="button" data-pmin="full" title="Full player" aria-label="Switch to the full player">⤢</button><button type="button" data-pmin="dock" title="Dock player" aria-label="Dock player">⇩</button>';
    p.appendChild(t);
    t.addEventListener('mousedown', (e) => e.stopPropagation());
    t.addEventListener('click', (e) => { const k = e.target.closest('[data-pmin]'); if (!k) return; e.stopPropagation(); if (k.dataset.pmin === 'full') pminSet(false); else if (dock) dock.click(); });
    // dragged from anywhere on the card (not from its buttons, the slider or the song's name)
    p.addEventListener('mousedown', (e) => {
      if (!p.classList.contains('mp-min') || e.button > 0 || e.target.closest('button, input, a, .mini-player-title, .mini-player-artist, .pmin-tools, .mini-player-video-wrap')) return;
      h.dispatchEvent(new MouseEvent('mousedown', { bubbles: false, cancelable: true, clientX: e.clientX, clientY: e.clientY })); e.preventDefault();          // (not bubbling: it would come back here)
    });
    new MutationObserver(pminApply).observe(p, { attributes: true, attributeFilter: ['class'] });          // detached or docked
    pminApply();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
