// (1.135.153) The search panel always has a box to type in. It hangs from the search box in the top bar; when that box is covered (the
// player docked along the top of the window sits over it) or out of sight, a box of its own appears across the top of the panel. It is
// the same search: what you type, ↑ ↓, Enter and Esc all go to the real box, and what's in the real box shows in it.
let srchProxyEl = null;
function srchProxyIs(n) { return !!(srchProxyEl && n && n === srchProxyEl.querySelector('input')); }
function srchRealHidden() {
  const inp = el.searchInput; if (!inp) return false;
  const r = inp.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight) return true;
  const x = r.left + Math.min(r.width / 2, 40), y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
  return !!hit && hit !== inp && !inp.contains(hit) && !(hit.closest && hit.closest('#searchWrap, .search-wrap') && hit.closest('#searchWrap, .search-wrap').contains(inp));
}
function srchProxySync() {
  const box = document.getElementById('searchSuggest'); if (!box || !srchProxyEl) return;
  const open = !box.hidden, show = open && srchRealHidden();
  srchProxyEl.hidden = !show; box.classList.toggle('srch-has-proxy', show);
  if (!show) return;
  const r = box.getBoundingClientRect();
  Object.assign(srchProxyEl.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' });
  const pi = srchProxyEl.querySelector('input');
  if (document.activeElement !== pi && pi.value !== el.searchInput.value) pi.value = el.searchInput.value;
  if (document.activeElement === el.searchInput) { const at = el.searchInput.selectionStart; pi.focus(); try { pi.setSelectionRange(at, at); } catch (e) { /* fine */ } }
}
function srchProxyInit() {
  const inp = el.searchInput, box = document.getElementById('searchSuggest'); if (!inp || !box || srchProxyEl) return;
  srchProxyEl = document.createElement('div'); srchProxyEl.className = 'srch-proxy'; srchProxyEl.hidden = true;
  srchProxyEl.innerHTML = `<span class="srch-proxy-ico" aria-hidden="true">⌕</span><input type="search" autocomplete="off" spellcheck="false" aria-label="Search your crate, and online" placeholder="${escapeHtml(inp.placeholder || 'Search artist, title, or catalogue')}"><kbd>Esc</kbd>`;
  document.body.appendChild(srchProxyEl);
  const pi = srchProxyEl.querySelector('input');
  pi.addEventListener('input', () => { inp.value = pi.value; inp.dispatchEvent(new Event('input', { bubbles: true })); });
  pi.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
      const ev = new KeyboardEvent('keydown', { key: e.key, code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, bubbles: true, cancelable: true });
      inp.dispatchEvent(ev); if (ev.defaultPrevented || e.key !== 'Tab') e.preventDefault();
      if (e.key === 'Escape') { pi.blur(); setTimeout(() => { if (typeof ssRender === 'function') ssRender(); srchProxySync(); }, 0); }
    }
  });
  pi.addEventListener('blur', () => setTimeout(() => { if (typeof ssRender === 'function') ssRender(); srchProxySync(); }, 160));
  // whatever closes the search by taking the focus from the real box closes it from this one too
  const realBlur = inp.blur.bind(inp); inp.blur = function () { realBlur(); if (document.activeElement === pi) pi.blur(); };
  inp.addEventListener('input', () => { if (document.activeElement !== pi) pi.value = inp.value; });
  new MutationObserver(() => requestAnimationFrame(srchProxySync)).observe(box, { attributes: true, attributeFilter: ['hidden', 'class'] });
  window.addEventListener('resize', srchProxySync);
}
// the panel is made the first time search opens: set up then
(function () { const base = ssRender; ssRender = function () { const r = base.apply(this, arguments); try { srchProxyInit(); srchProxySync(); } catch (e) { /* the top bar's box still works */ } return r; }; })();
