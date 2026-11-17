// ===== (1.135.122) A cursor of CRATE's own (⚙ › Look › Cursor) =====
// System (the computer's), Stylus (a record player's needle, its point where you click), Arrow (an arrow in the theme's accent) or Ring
// (a turntable's centre). Each has a second look over things you can click. They're drawn in the theme's accent, with a dark edge so
// they show on light and dark alike, and drawn again when the theme changes. Text boxes keep the text cursor.
// The stylesheet's "pointer" (and "default") cursors are pointed at variables once, the first time one is chosen.

const CUR_KEY = 'crate_cursor_v1';
const CUR_NAMES = [['system', 'System'], ['stylus', 'Stylus'], ['arrow', 'Arrow'], ['ring', 'Ring']];
function curPref() { try { const v = localStorage.getItem(CUR_KEY); return CUR_NAMES.some(c => c[0] === v) ? v : 'system'; } catch (e) { return 'system'; } }
function curAccent() { const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : '#D6A24C'; }
function curSvg(kind, hand, acc) {
  const k = '#0B0D10', svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
  if (kind === 'stylus') return [svg(`<path d="M3 3 L12 12" stroke="${k}" stroke-width="4" stroke-linecap="round"/><path d="M3 3 L12 12" stroke="#F4F1EA" stroke-width="1.6" stroke-linecap="round"/>`
    + `<path d="M10.5 13.5 L13.5 10.5 L21.5 18.5 L18.5 21.5 Z" fill="${acc}" stroke="${k}" stroke-width="1.4" stroke-linejoin="round"/><path d="M20 20 L29 29" stroke="${k}" stroke-width="4.5" stroke-linecap="round"/><path d="M20 20 L29 29" stroke="${acc}" stroke-width="2.2" stroke-linecap="round"/>`
    + (hand ? `<circle cx="3.5" cy="3.5" r="3" fill="none" stroke="${acc}" stroke-width="1.6"/>` : '')), 2, 2];
  if (kind === 'arrow') return [svg(`<path d="M4 3 L4 23 L9.5 18 L13 26.5 L16.6 25 L13.2 16.8 L20.5 16.8 Z" fill="${hand ? '#F4F1EA' : acc}" stroke="${k}" stroke-width="1.6" stroke-linejoin="round"/>`
    + (hand ? `<path d="M4 3 L4 23 L9.5 18 L13 26.5 L16.6 25 L13.2 16.8 L20.5 16.8 Z" fill="none" stroke="${acc}" stroke-width="1" stroke-linejoin="round" transform="translate(0.8 0.8) scale(.95)"/>` : '')), 4, 3];
  // ring
  return [svg(`<circle cx="16" cy="16" r="${hand ? 9.5 : 7.5}" fill="${hand ? acc + '55' : 'none'}" stroke="${k}" stroke-width="4"/><circle cx="16" cy="16" r="${hand ? 9.5 : 7.5}" fill="none" stroke="${acc}" stroke-width="2.2"/><circle cx="16" cy="16" r="2.2" fill="${acc}" stroke="${k}" stroke-width="1"/>`), 16, 16];
}
const curUrl = ([s, x, y], fallback) => `url("data:image/svg+xml,${encodeURIComponent(s)}") ${x} ${y}, ${fallback}`;
let curRewired = false;
function curRewire() {          // the stylesheet's own pointer / default cursors, pointed at the variables (once)
  if (curRewired) return; curRewired = true;
  const fix = (rules) => { for (const r of rules) { if (r.cssRules && r.cssRules.length) fix(r.cssRules); const st = r.style; if (!st) continue; const v = st.getPropertyValue('cursor'); if (v === 'pointer') st.setProperty('cursor', 'var(--cur-hand, pointer)', st.getPropertyPriority('cursor')); else if (v === 'default') st.setProperty('cursor', 'var(--cur-arrow, default)', st.getPropertyPriority('cursor')); } };
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } if (rules) fix(rules); }
}
function curApply() {
  const kind = curPref(), root = document.documentElement;
  if (kind === 'system') { root.classList.remove('cur-on'); root.style.removeProperty('--cur-arrow'); root.style.removeProperty('--cur-hand'); return; }
  curRewire();
  const acc = curAccent();
  root.style.setProperty('--cur-arrow', curUrl(curSvg(kind, false, acc), 'default'));
  root.style.setProperty('--cur-hand', curUrl(curSvg(kind, true, acc), 'pointer'));
  root.classList.add('cur-on');
}
function curSet(kind) { try { localStorage.setItem(CUR_KEY, kind); } catch (e) { /* this visit */ } curApply(); }
// drawn again in the new accent whenever the theme changes
if (typeof thmSet === 'function') { const curBaseThmSet = thmSet; thmSet = function () { const r = curBaseThmSet.apply(this, arguments); try { if (curPref() !== 'system') curApply(); } catch (e) { /* as it was */ } return r; }; }
// ⚙ › Look: a Cursor row
if (typeof thmPanelHtml === 'function') {
  const curBasePanel = thmPanelHtml;
  thmPanelHtml = function () {
    const h = curBasePanel.apply(this, arguments), cur = curPref(), acc = curAccent();
    const prev = (k) => k === 'system' ? '<span class="cur-sys" aria-hidden="true">↖</span>' : `<img src="data:image/svg+xml,${encodeURIComponent(curSvg(k, false, acc)[0])}" alt="" width="24" height="24">`;
    const row = `<div class="thm-row"><span class="thm-lbl">Cursor</span>${CUR_NAMES.map(([k, l]) => `<button type="button" class="thm-seg cur-opt${cur === k ? ' on' : ''}" data-cur="${k}" aria-pressed="${cur === k}">${prev(k)}${l}</button>`).join('')}</div>`;
    const at = h.lastIndexOf('<p class="thm-note">Kept in this browser.'); return at < 0 ? h + row : h.slice(0, at) + row + h.slice(at);
  };
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#thmOverlay [data-cur]'); if (!b) return; e.stopPropagation(); curSet(b.dataset.cur); if (typeof thmPaint === 'function') thmPaint(); }, true);
}
try { if (curPref() !== 'system') curApply(); } catch (e) { /* the computer's cursor */ }
