// ===== (1.135.117) Themes: ready-made looks, your own accent, and colours taken from a release's cover =====
// ⚙ › Settings › Look… picks one. Every theme is the same eight colours (ground, panels, cards, lines, text, dim text, accent, text on the
// accent), set as CSS variables on the page. The stylesheet still writes some of CRATE's own colours out by hand, so the first time a
// theme other than CRATE is used, those rules are pointed at the variables instead (only the exact CRATE colours, nothing else).
// "From releases" takes the colours from a cover: the one playing (it changes with the music, fading over a second) or one you pin
// (right-click a release › Use as theme). Every pair is checked for contrast and a colour too close is moved until it reads.

const THM_KEY = 'crate_theme_v1';
const THM_BASE = {
  crate:    { name: 'CRATE', sub: 'The dark one CRATE has always had', bg: '#12161C', elev: '#1B212B', card: '#1F2530', line: '#2A313C', text: '#EDE7DC', dim: '#8B93A0', accent: '#D6A24C' },
  black:    { name: 'Black', sub: 'True black, for OLED screens at night', bg: '#000000', elev: '#0C0C0E', card: '#151518', line: '#26262B', text: '#ECE8E1', dim: '#8E929A', accent: '#E8B04A' },
  paper:    { name: 'Paper', sub: 'Light and warm, like a record sleeve', bg: '#F3EEE4', elev: '#FBF8F2', card: '#E8E1D3', line: '#D2C8B6', text: '#2A241C', dim: '#6B6253', accent: '#99560F' },
  night:    { name: 'Night blue', sub: 'Cool and low-glare', bg: '#0F1A22', elev: '#13212B', card: '#1A2A36', line: '#26394A', text: '#E4EEF2', dim: '#8FA6B2', accent: '#5FB3D9' },
  contrast: { name: 'High contrast', sub: 'The most contrast everywhere', bg: '#000000', elev: '#0A0A0A', card: '#161616', line: '#6A6A6A', text: '#FFFFFF', dim: '#D0D0D0', accent: '#FFD400' },
};
const THM_ACCENTS = ['#D6A24C', '#E07A5F', '#7FB069', '#5FA8D3', '#9B7ED9', '#E8A0BF'];
function thmPrefs() { try { return Object.assign({ theme: 'crate', accent: '', sysLight: false, rel: { mode: 'playing', strength: 'tinted', pinned: null, recent: [] } }, JSON.parse(localStorage.getItem(THM_KEY) || '{}') || {}); } catch (e) { return { theme: 'crate', accent: '', sysLight: false, rel: { mode: 'playing', strength: 'tinted', pinned: null, recent: [] } }; } }
function thmSave(p) { try { localStorage.setItem(THM_KEY, JSON.stringify(p)); } catch (e) { /* this visit */ } }

// ----- colour arithmetic -----
const thmHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
function thmRgb(hex) { const h = String(hex).replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function thmHsl(hex) { let [r, g, b] = thmRgb(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
function thmFromHsl(h, s, l) { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return thmHex(l * 255, l * 255, l * 255); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return thmHex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255); }
function thmLum(hex) { return thmRgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0); }
function thmRatio(a, b) { const x = thmLum(a), y = thmLum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
function thmReadable(fg, bg, target) {          // fg moved lighter or darker (away from bg) until it reads against bg
  if (thmRatio(fg, bg) >= target) return fg;
  const [h, s, l0] = thmHsl(fg), up = thmLum(bg) < .3;
  for (let l = l0; up ? l <= 1 : l >= 0; l += up ? .02 : -.02) { const c = thmFromHsl(h, s, Math.max(0, Math.min(1, l))); if (thmRatio(c, bg) >= target) return c; }
  return up ? '#FFFFFF' : '#000000';
}
function thmFinish(p) {          // the colours checked against each other; the text on an accent button picked to read on it
  const q = Object.assign({}, p);
  q.text = thmReadable(q.text, q.bg, 7); q.dim = thmReadable(q.dim, q.bg, 4.5); q.accent = thmReadable(q.accent, q.bg, 4.5);
  q.onAccent = thmRatio('#12161C', q.accent) >= thmRatio('#FFFFFF', q.accent) ? '#12161C' : '#FFFFFF';
  return q;
}

// ----- colours from a cover -----
function thmCoverColours(url) {          // -> Promise<[{ hex, n, s, l }]> the cover's main colours, most used first
  return new Promise((res) => {
    if (!url) return res(null);
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { try {
      const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 40, 40);
      const d = x.getImageData(0, 0, 40, 40).data, bins = new Map();
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4); const b = bins.get(k) || { r: 0, g: 0, b: 0, n: 0 }; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; b.n++; bins.set(k, b); }
      const cols = [...bins.values()].map(b => { const hex = thmHex(b.r / b.n, b.g / b.n, b.b / b.n), [h, s, l] = thmHsl(hex); return { hex, n: b.n, h, s, l }; }).sort((a, b) => b.n - a.n);
      const out = []; cols.forEach(c => { if (out.length < 6 && !out.some(o => Math.abs(o.h - c.h) < .06 && Math.abs(o.l - c.l) < .18 && Math.abs(o.s - c.s) < .3)) out.push(c); });
      res(out.length ? out : null);
    } catch (e) { res(null); } };          // (a cover whose server doesn't allow reading its pixels: none)
    img.onerror = () => res(null);
    img.src = url;
  });
}
function thmFromCover(cols, strength, base) {          // the eight colours, from the cover's colours
  base = base || THM_BASE.crate;
  if (!cols || !cols.length) return thmFinish(base);
  const main = cols.slice().sort((a, b) => b.n * (0.4 + b.s) - a.n * (0.4 + a.s))[0];
  const vivid = cols.slice().sort((a, b) => (b.s * (1 - Math.abs(b.l - .55))) * Math.sqrt(b.n) - (a.s * (1 - Math.abs(a.l - .55))) * Math.sqrt(a.n))[0];
  const grey = cols.every(c => c.s < .12);
  const accent = grey ? base.accent : vivid.hex;
  if (strength === 'accent') return thmFinish(Object.assign({}, base, { accent }));
  const h = main.h, s = grey ? 0 : Math.min(main.s, strength === 'full' ? .55 : .32);
  const L = strength === 'full' ? [.15, .2, .23, .3] : [.085, .125, .15, .22];
  return thmFinish({ bg: thmFromHsl(h, s, L[0]), elev: thmFromHsl(h, s, L[1]), card: thmFromHsl(h, s, L[2]), line: thmFromHsl(h, s * .9, L[3]), text: thmFromHsl(h, Math.min(s, .25), .93), dim: thmFromHsl(h, Math.min(s, .18), .66), accent });
}

// ----- the stylesheet's own written-out colours, pointed at the variables (once) -----
let thmRewired = false;
function thmRewire() {
  if (thmRewired) return; thmRewired = true;
  const BG = { 'rgb(18, 22, 28)': 'var(--bg)', 'rgb(27, 33, 43)': 'var(--bg-elevated)', 'rgb(31, 37, 48)': 'var(--bg-card)', 'rgb(22, 27, 34)': 'var(--bg-elevated)', 'rgb(42, 49, 60)': 'var(--line)', 'rgb(214, 162, 76)': 'var(--accent)', 'rgb(237, 231, 220)': 'var(--text)', 'rgb(139, 147, 160)': 'var(--text-dim)' };
  const FG = Object.assign({}, BG, { 'rgb(18, 22, 28)': 'var(--on-accent)' });          // dark text (on gold buttons): what reads on the accent
  const props = ['color', 'background-color', 'background', 'background-image', 'border-color', 'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'outline', 'outline-color', 'box-shadow', 'fill', 'stroke', 'caret-color', 'text-decoration-color'];
  const fix = (rules) => { for (const r of rules) {
    if (r.cssRules && r.cssRules.length && !r.style) { fix(r.cssRules); continue; }
    if (r.cssRules && r.cssRules.length) fix(r.cssRules);
    const st = r.style; if (!st) continue;
    for (const pr of props) { const v = st.getPropertyValue(pr); if (!v || !/rgb\(/.test(v)) continue; const map = pr === 'color' || pr === 'fill' ? FG : BG; let nv = v; Object.keys(map).forEach(k => { if (nv.includes(k)) nv = nv.split(k).join(map[k]); }); if (nv !== v) st.setProperty(pr, nv, st.getPropertyPriority(pr)); }
  } };
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } if (rules) fix(rules); }          // (another site's stylesheet can't be read: skipped)
}
function thmSet(p, fade) {
  const r = document.documentElement.style, c = thmFinish(p);
  if (fade) { document.documentElement.classList.add('thm-fade'); clearTimeout(thmSet.t); thmSet.t = setTimeout(() => document.documentElement.classList.remove('thm-fade'), 1100); }
  r.setProperty('--bg', c.bg); r.setProperty('--bg-elevated', c.elev); r.setProperty('--bg-card', c.card); r.setProperty('--line', c.line);
  r.setProperty('--text', c.text); r.setProperty('--text-dim', c.dim); r.setProperty('--accent', c.accent); r.setProperty('--on-accent', c.onAccent);
  document.documentElement.dataset.thmLight = thmLum(c.bg) > .4 ? '1' : '';
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', c.bg);
  thmNow = c;
}
let thmNow = null;

// ----- which colours, now -----
const thmSysLight = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
function thmBaseOf(p) { const t = p.sysLight && thmSysLight() ? 'paper' : (THM_BASE[p.theme] ? p.theme : 'crate'); const b = Object.assign({}, THM_BASE[t]); if (p.accent) b.accent = p.accent; return b; }
let thmPlayingKey = '', thmPlayingCols = null;
async function thmApply(fade) {
  const p = thmPrefs();
  if (p.theme !== 'release') { if (p.theme !== 'crate' || p.accent || p.sysLight) thmRewire(); thmSet(thmBaseOf(Object.assign({}, p)), fade); return; }
  thmRewire();
  const base = thmBaseOf(Object.assign({}, p, { theme: 'crate', accent: '' }));
  if (p.rel.mode === 'pinned' && p.rel.pinned && p.rel.pinned.cols) { thmSet(thmFromCover(p.rel.pinned.cols, p.rel.strength, base), fade); return; }
  // following what's playing
  const it = typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null;
  if (!it) { thmPlayingKey = ''; thmSet(base, fade); return; }
  const k = String(it.row) + '|' + it.title;
  if (k !== thmPlayingKey) { thmPlayingKey = k; thmPlayingCols = await thmCoverColours(srchItemCover(it)); if (thmPlayingKey !== k) return; }
  thmSet(thmFromCover(thmPlayingCols, p.rel.strength, base), fade);
}
// what's playing changes: looked at every second and a half (cheap: one comparison)
setInterval(() => { try { const p = thmPrefs(); if (p.theme !== 'release' || p.rel.mode !== 'playing') return; const it = typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null, k = it ? String(it.row) + '|' + it.title : ''; if (k !== thmPlayingKey) thmApply(true); } catch (e) { /* next time */ } }, 1500);
if (window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (thmPrefs().sysLight) thmApply(true); }); } catch (e) { /* older browsers */ } }

// ----- pinning a release -----
async function thmPin(item) {
  const cols = await thmCoverColours(srchItemCover(item));
  if (!cols) { flashGlobalToast('Couldn’t read this cover’s colours (its site doesn’t allow it). Try another release.'); return; }
  const p = thmPrefs(), pin = { row: String(item.row), artist: item.artist, title: item.title, cover: srchItemCover(item), cols: cols.map(c => ({ hex: c.hex, n: c.n, h: c.h, s: c.s, l: c.l })) };
  p.theme = 'release'; p.rel.mode = 'pinned'; p.rel.pinned = pin;
  p.rel.recent = [pin].concat((p.rel.recent || []).filter(x => x.row !== pin.row)).slice(0, 6);
  thmSave(p); await thmApply(true);
  flashGlobalToast(`Theme: the colours of “${item.title}”. ⚙ › Look to change them.`, { onClick: thmOpen });
}
const thmBaseCardMenu = openAlbumCardContextMenu;
openAlbumCardContextMenu = function (item) {
  const r = thmBaseCardMenu.apply(this, arguments);
  try {
    const menus = document.querySelectorAll('.album-card-menu'), m = menus[menus.length - 1];
    if (m && item && !(state.selectedAlbums.size > 1 && state.selectedAlbums.has(String(item.row)))) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'thm-menu-btn'; b.innerHTML = '<span class="thm-dot" aria-hidden="true"></span>Use as theme';
      b.addEventListener('click', (e) => { e.stopPropagation(); if (typeof closeNowPlayingAddMenu === 'function') closeNowPlayingAddMenu(); thmPin(item); });
      const anchor = m.querySelector('[data-card-action="rym"]'); if (anchor) anchor.after(b); else m.appendChild(b);
    }
  } catch (e) { /* the menu as it was */ }
  return r;
};

// ----- ⚙ › Look -----
function thmMiniHtml(c) {
  return `<div class="thm-mini" style="background:${c.bg}"><div class="thm-mini-side" style="background:${c.elev}"><i style="background:${c.accent};width:70%"></i><i style="background:${c.line}"></i><i style="background:${c.line}"></i></div><div class="thm-mini-main">${[0, 1, 2, 3, 4, 5].map(() => `<i style="background:${c.card}"></i>`).join('')}</div><span class="thm-mini-t" style="color:${c.text}">Aa</span></div>`;
}
function thmPanelHtml() {
  const p = thmPrefs(), cur = p.theme;
  const cards = Object.entries(THM_BASE).map(([k, t]) => { const c = thmFinish(Object.assign({}, t, p.accent ? { accent: p.accent } : {})); return `<button type="button" class="thm-card${cur === k ? ' on' : ''}" data-thm="${k}" aria-pressed="${cur === k}">${thmMiniHtml(c)}<span class="thm-cap"><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.sub)}</span></span></button>`; }).join('')
    + `<button type="button" class="thm-card thm-card-rel${cur === 'release' ? ' on' : ''}" data-thm="release" aria-pressed="${cur === 'release'}"><div class="thm-mini" style="background:linear-gradient(135deg,#3B1F1A,#1B2430 60%,#2B2A16)"></div><span class="thm-cap"><b>From releases</b><span>The colours of what’s playing, or of one you pin</span></span></button>`;
  const acc = `<div class="thm-row"><span class="thm-lbl">Accent</span>${['', ...THM_ACCENTS].map(a => `<button type="button" class="thm-sw${(p.accent || '') === a ? ' on' : ''}" data-thm-accent="${a}" style="background:${a || 'conic-gradient(#D6A24C 0 50%, #2A313C 0)'}" title="${a ? a : 'The theme’s own'}" aria-label="${a ? 'Accent ' + a : 'The theme’s own accent'}"></button>`).join('')}<label class="thm-pick">or any colour <input type="color" data-thm-accent-pick value="${p.accent || '#D6A24C'}"></label></div>
    <label class="thm-row thm-chk"><input type="checkbox" data-thm-sys${p.sysLight ? ' checked' : ''}> Use Paper when my computer is set to light mode</label>`;
  let rel = '';
  if (cur === 'release') {
    const pin = p.rel.pinned, st = p.rel.strength;
    const strength = `<div class="thm-row"><span class="thm-lbl">How strongly</span>${[['accent', 'Accent only'], ['tinted', 'Tinted'], ['full', 'Full colour']].map(([k, l]) => `<button type="button" class="thm-seg${st === k ? ' on' : ''}" data-thm-strength="${k}">${l}</button>`).join('')}</div>`;
    const mode = `<div class="thm-row"><span class="thm-lbl">Colours of</span><button type="button" class="thm-seg${p.rel.mode === 'playing' ? ' on' : ''}" data-thm-mode="playing">What’s playing</button><button type="button" class="thm-seg${p.rel.mode === 'pinned' ? ' on' : ''}" data-thm-mode="pinned"${pin ? '' : ' disabled title="Right-click a release › Use as theme first"'}>${pin ? escapeHtml(pin.title) : 'A pinned release'}</button></div>`;
    const cols = p.rel.mode === 'pinned' && pin ? pin.cols : thmPlayingCols;
    const chips = cols && cols.length ? `<div class="thm-row"><span class="thm-lbl">Found on the cover</span>${cols.map(c => `<button type="button" class="thm-chip" data-thm-chip="${c.hex}" style="background:${c.hex}" title="Use ${c.hex} as the accent" aria-label="Use ${c.hex} as the accent"></button>`).join('')}<span class="thm-note">click one for the accent</span></div>` : `<p class="thm-note">${p.rel.mode === 'playing' ? 'Play something: its cover’s colours appear here.' : ''}</p>`;
    const c = thmNow || thmFinish(THM_BASE.crate);
    const roles = `<div class="thm-roles">${[['Ground', c.bg], ['Panels', c.elev], ['Accent', c.accent], ['Text', c.text]].map(([l, h]) => `<span class="thm-role"><i style="background:${h}"></i>${l}</span>`).join('')}<span class="thm-note">text ${thmRatio(c.text, c.bg).toFixed(1)} : 1 · accent ${thmRatio(c.accent, c.bg).toFixed(1)} : 1 against the ground</span></div>`;
    const recent = (p.rel.recent || []).length ? `<div class="thm-row"><span class="thm-lbl">Pinned before</span>${p.rel.recent.map(x => `<button type="button" class="thm-recent${pin && pin.row === x.row && p.rel.mode === 'pinned' ? ' on' : ''}" data-thm-recent="${escapeHtml(x.row)}" title="${escapeHtml(x.title + ' · ' + x.artist)}"><img src="${escapeHtml(x.cover || '')}" alt="" loading="lazy">${escapeHtml(x.title)}</button>`).join('')}</div>` : '';
    rel = `<div class="thm-rel">${mode}${strength}${chips}${roles}${recent}<p class="thm-note">Right-click any release › Use as theme to pin its colours.</p></div>`;
  }
  return `<div class="arrange-header"><h2>Look</h2><button type="button" class="modal-x" data-thm-close aria-label="Close">✕</button></div>
    <div class="thm-body"><div class="thm-lbl">Theme</div><div class="thm-cards">${cards}</div>${rel}${acc}
    <p class="thm-note">Kept in this browser. Covers, ratings and charts keep their own colours.</p></div>`;
}
function thmOpen() {
  let ov = document.getElementById('thmOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'thmOverlay'; ov.className = 'arrange-overlay thm-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Look');
    ov.innerHTML = '<div class="arrange-modal thm-modal"></div>'; document.body.appendChild(ov);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) thmClose(); });
    ov.addEventListener('click', thmClick);
    ov.addEventListener('input', (e) => { const c = e.target.closest('[data-thm-accent-pick]'); if (c) { const p = thmPrefs(); p.accent = c.value.toUpperCase(); thmSave(p); thmApply(false); } });
    ov.addEventListener('change', (e) => { if (e.target.closest('[data-thm-accent-pick]')) thmPaint(); const s = e.target.closest('[data-thm-sys]'); if (s) { const p = thmPrefs(); p.sysLight = s.checked; thmSave(p); thmApply(true).then(thmPaint); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('thmOverlay') && !document.getElementById('thmOverlay').hidden) thmClose(); });
  }
  ov.hidden = false; thmPaint();
}
function thmClose() { const ov = document.getElementById('thmOverlay'); if (ov) ov.hidden = true; }
function thmPaint() { const m = document.querySelector('#thmOverlay .thm-modal'); if (m) m.innerHTML = thmPanelHtml(); }
async function thmClick(e) {
  const g = (s) => e.target.closest(s); let b;
  const save = async (f) => { const p = thmPrefs(); f(p); thmSave(p); await thmApply(true); thmPaint(); };
  if (g('[data-thm-close]')) return thmClose();
  if ((b = g('[data-thm]'))) return save(p => { p.theme = b.dataset.thm; });
  if ((b = g('[data-thm-accent]'))) return save(p => { p.accent = b.dataset.thmAccent; });
  if ((b = g('[data-thm-strength]'))) return save(p => { p.rel.strength = b.dataset.thmStrength; });
  if ((b = g('[data-thm-mode]'))) return save(p => { p.rel.mode = b.dataset.thmMode; });
  if ((b = g('[data-thm-chip]'))) return save(p => { p.accent = b.dataset.thmChip; });
  if ((b = g('[data-thm-recent]'))) return save(p => { const x = (p.rel.recent || []).find(r => r.row === b.dataset.thmRecent); if (x) { p.rel.pinned = x; p.rel.mode = 'pinned'; } });
}
// a chosen accent wins over the cover's, in "From releases" too
const thmBaseFromCover = thmFromCover;
thmFromCover = function (cols, strength, base) { const out = thmBaseFromCover(cols, strength, base), p = thmPrefs(); if (p.theme === 'release' && p.accent) return thmFinish(Object.assign({}, out, { accent: p.accent })); return out; };

// ⚙ › Settings › Look…
(function thmMenu() {
  const go = () => { const a = document.getElementById('menuArrangePanels'); if (!a) return setTimeout(go, 500); if (document.getElementById('menuLook')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'menuLook'; b.textContent = 'Look…'; b.title = 'Themes: ready-made looks, your own accent, or the colours of a release'; a.before(b);
    b.addEventListener('click', (e) => { e.stopPropagation(); const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; thmOpen(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
// at start: the theme you chose, before anything else is drawn in it
try { const p0 = thmPrefs(); if (p0.theme !== 'crate' || p0.accent || p0.sysLight) thmApply(false); } catch (e) { /* CRATE's own colours */ }
