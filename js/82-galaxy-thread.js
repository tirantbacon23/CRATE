// (1.135.138) Crate Galaxy · Influence: follow a thread. Built on js/67-galaxy-time.js.
//  - Why two are linked: hover a star on the picked release's line and the tip says what it shares with the next one along
//    (genres, descriptors, scene, label, the same artist) and how many years apart they are.
//  - Links: a slider in the header keeps only the stronger links, on the drawing and on the line itself.
//  - The years: a bar under the stars. Drag it to any year (later releases hide), play it at 1×, 2× or 4×, loop it. With a
//    release picked, play and loop run over the years of its line.
//  - Keys: ← → step along the line in time, ↑ to what it drew from most, ↓ to what drew from it most, Esc lets go of the release.
//  - The side panel adds its rank in your crate and a short "why" under each release it drew from or passed on to.

// ----- what two releases share -----
const GXH_KIND = { g: 'genre', d: 'descriptor', s: 'scene', l: 'label' };
function gxhNice(t) { return t.replace(/\b([a-z])/g, (m, c) => c.toUpperCase()); }
function gxhShared(i, j, max) {
  const vi = gx.graph && gx.graph.vec[i], vj = gx.graph && gx.graph.vec[j]; if (!vi || !vj) return { parts: [], same: false };
  const out = []; let same = false;
  vi.forEach((v, x) => { const w = vj.get(x); if (!w) return; const k = x.slice(0, 1); if (k === 'y') return; if (k === 'a') { same = true; return; } out.push({ k, t: x.slice(2), w: v * w }); });
  out.sort((a, b) => b.w - a.w);
  return { parts: out.slice(0, max || 5), same };
}
function gxhWhyText(i, j, max) {
  const S = gxhShared(i, j, max), bits = S.parts.map(p => p.k === 'd' ? `“${p.t}”` : gxhNice(p.t));
  if (S.same) bits.unshift('same artist');
  return bits.join(' · ');
}
function gxhScore(a, b) {                                             // the link's strength, whichever way round
  const I = gx.inf; if (!I) return 0; const l = I.par[b].find(p => p.j === a) || I.par[a].find(p => p.j === b); return l ? l.s : 0;
}
// the next release along the line from i toward the picked one (what it passed on to, for an earlier one; what it drew from, for a later one)
function gxhStepToSel(i) {
  const I = gx.inf, sel = gx.sel; if (!I || sel < 0 || !gx.lineage || i === sel) return -1;
  if (gx.anc && gx.anc.has(i)) { const g = gx.anc.get(i), c = I.kids[i].filter(k => gx.anc.has(k.j) && gx.anc.get(k.j) === g - 1).sort((a, b) => b.s - a.s)[0]; return c ? c.j : -1; }
  if (gx.desc && gx.desc.has(i)) { const g = gx.desc.get(i), c = I.par[i].filter(p => gx.desc.has(p.j) && gx.desc.get(p.j) === g - 1).sort((a, b) => b.s - a.s)[0]; return c ? c.j : -1; }
  return -1;
}

// ----- the tip: why this one is on the line -----
(function () {
  const base = gxTip;
  gxTip = function (i, px, py) {
    base(i, px, py);
    if (i < 0 || gx.mode !== 'time' || !gx.inf) return;
    const t = gxEl('gxTip'); if (!t) return;
    const I = gx.inf, y = Math.floor(I.yr[i]) || 0;
    let extra = '';
    const k = gxhStepToSel(i);
    if (k >= 0) {
      const early = I.yr[i] <= I.yr[k], a = early ? i : k, b = early ? k : i, why = gxhWhyText(a, b, 4), dy = Math.round(Math.abs(I.yr[b] - I.yr[a]));
      extra = `<div class="gxh-why"><span class="gxh-k">Why linked</span><span>${escapeHtml(gx.items[a].title)} → ${escapeHtml(gx.items[b].title)}</span><span class="gxh-d">${why ? 'shared: ' + escapeHtml(why) + ' · ' : ''}${dy} year${dy === 1 ? '' : 's'} apart · ${Math.round(gxhScore(a, b) * 100)}</span></div>`;
    } else {
      const c = Math.round(I.credit[i]);
      extra = `<div class="gxh-why"><span class="gxh-d">${c ? `${c.toLocaleString()} later release${c === 1 ? '' : 's'} lean on it` : 'nothing later leans on it'}${I.par[i].length ? ` · drew from ${I.par[i].length}` : ' · a starting point'}${y ? '' : ' · no year'}</span></div>`;
    }
    t.insertAdjacentHTML('beforeend', extra);
    const v = gxView(); t.style.top = Math.min(py + 14, v.h - t.offsetHeight - 8) + 'px';
  };
})();

// ----- rank in the crate -----
function gxhRank(i) {
  const I = gx.inf; if (!I) return 0;
  if (!I.rank) { const ord = Array.from({ length: I.credit.length }, (_, k) => k).sort((a, b) => I.credit[b] - I.credit[a]); I.rank = new Int32Array(I.credit.length); ord.forEach((k, r) => { I.rank[k] = r + 1; }); }
  return I.credit[i] >= 1 ? I.rank[i] : 0;
}

// ----- the side panel, for a picked release -----
(function () {
  const base = gxtSide;
  gxtSide = function () {
    const I = gx.inf; if (!I || gx.sel < 0 || !gx.lineage) return base();
    const i = gx.sel, it = gx.items[i], y = gxYear(it), lm = gx.linkMin || 0, playing = !!gx.playT;
    const ps = I.par[i].filter(p => p.s >= lm), ks = I.kids[i].filter(k => k.s >= lm), later = [...gx.desc.keys()].filter(x => x !== i), earlier = [...gx.anc.keys()].filter(x => x !== i);
    const d = later.length, rank = gxhRank(i), span = d ? Math.floor(Math.max(...later.map(x => I.yr[x]))) : 0, first = earlier.length ? Math.floor(Math.min(...earlier.map(x => I.yr[x]))) : 0;
    const famsReached = new Map(); later.forEach(x => { const f = gx.fams.fam[x]; famsReached.set(f, (famsReached.get(f) || 0) + 1); });
    const own = gx.fams.fam[i], other = later.filter(x => gx.fams.fam[x] !== own).length;
    const fr = [...famsReached].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => `<span class="gxt-fam" style="color:hsl(${gxHue(f)},70%,74%)">${escapeHtml(f)} ${n}</span>`).join(' ');
    const row = (j, s, early) => { const why = early ? gxhWhyText(j, i, 3) : gxhWhyText(i, j, 3), yy = Math.floor(I.yr[j]) || '';
      return `<button type="button" class="gx-row" data-gx-go="${j}"><img src="${escapeHtml(gxCover(gx.items[j]))}" alt="" loading="lazy"><span><b>${escapeHtml(gx.items[j].title)}</b><i>${escapeHtml(gx.items[j].artist)}${yy ? ' · ' + yy : ''}</i>${why ? `<i class="gxh-rw">${escapeHtml(why)}</i>` : ''}</span><em class="gx-sim" title="How strong the link is">${Math.round(s * 100)}</em></button>`; };
    const nums = [
      [d.toLocaleString(), 'later releases lean on it'],
      [rank ? '#' + rank : '–', 'in your crate'],
      [earlier.length.toLocaleString(), 'on its line before it'],
      [d ? Math.round(other / d * 100) + '%' : '–', 'of what followed in other families'],
      [first || '–', 'its line starts'],
      [span || '–', 'its line reaches'],
    ];
    return `<div class="gx-card"><img src="${escapeHtml(gxCover(it))}" alt=""><div><b>${escapeHtml(it.title)}</b><i>${escapeHtml(it.artist)}${y ? ' · ' + y : ''}</i><em>${escapeHtml([it.genre, it.genre2].filter(Boolean).join(' · '))}</em></div></div>
      <div class="gx-acts"><button type="button" class="chip-btn" data-gx="open">Open</button><button type="button" class="chip-btn" data-gx="play">Play</button>${d || earlier.length ? `<button type="button" class="chip-btn gx-primary" data-gx="tplaysel">${playing ? 'Stop' : '▶ Watch its line'}</button>` : ''}</div>
      <div class="gxh-nums">${nums.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>
      ${fr ? `<div class="gxt-fams">${fr}</div>` : ''}
      <div class="gx-h">Drew from · ${ps.length}</div>${ps.length ? ps.map(p => row(p.j, p.s, true)).join('') : '<p class="gx-dim">Nothing earlier in your crate is like it: a starting point here.</p>'}
      <div class="gx-h gxt-on">Passed it on to · ${ks.length}${ks.length > 10 ? ' (top 10)' : ''}</div>${ks.length ? ks.slice(0, 10).map(k => row(k.j, k.s, false)).join('') : '<p class="gx-dim">Nothing yet.</p>'}
      <p class="gx-dim gxh-keys">← → step along its line · ↑ what it drew from most · ↓ what drew from it most · Esc lets go</p>`;
  };
})();

// ----- the years bar -----
gx.speed = 1; gx.loop = false;
function gxhSpan() {                                                  // the years play and loop run over
  const I = gx.inf; if (!I) return [1970, 2020];
  if (gx.sel >= 0 && gx.lineage && gx.lineage.size > 1) { let a = Infinity, b = -Infinity; gx.lineage.forEach(x => { if (I.yr[x]) { a = Math.min(a, I.yr[x]); b = Math.max(b, I.yr[x]); } }); if (isFinite(a)) return [Math.floor(a) - 0.5, Math.ceil(b) + 0.5]; }
  return [I.y0 - 1, I.y1 + 1];
}
gxtPlay = function (fromSel) {
  if (gx.playT) { cancelAnimationFrame(gx.playT); gx.playT = 0; gxRenderSide(); gxhScrubPaint(); return; }          // pause, keeping the year
  const I = gx.inf; if (!I) return;
  gx.playFromSel = !!fromSel && gx.sel >= 0;
  const [a, b] = gxhSpan();
  if (gx.playYear == null || gx.playYear >= b - 0.05 || gx.playYear < a) gx.playYear = a;
  let last = performance.now();
  const tick = (t) => {
    if (!gx.open || gx.mode !== 'time') { gxtStop(); return; }
    const dt = Math.min(80, t - last); last = t;
    gx.playYear += dt / 1000 * 2.6 * gx.speed;                         // about 2.6 years a second at 1×
    const [a2, b2] = gxhSpan();
    if (gx.playYear >= b2) { if (gx.loop) gx.playYear = a2; else { gx.playYear = b2; gx.playT = 0; gxRenderSide(); gxDraw(); return; } }
    gxDraw(); gx.playT = requestAnimationFrame(tick);
  };
  gx.playT = requestAnimationFrame(tick); gxRenderSide(); gxhScrubPaint();
};
function gxhScrubHtml() {
  return `<button type="button" class="gxh-b" data-gxh="play" aria-label="Play the years">▶</button>
    <button type="button" class="gxh-b" data-gxh="speed" title="Speed">1×</button>
    <button type="button" class="gxh-b" data-gxh="loop" aria-pressed="false" title="Play the years over and over">Loop</button>
    <div class="gxh-track" data-gxh="track" role="slider" tabindex="0" aria-label="Year"><div class="gxh-span"></div><div class="gxh-fill"></div><div class="gxh-knob"></div><div class="gxh-ticks"></div></div>
    <span class="gxh-year"></span><button type="button" class="gxh-b" data-gxh="all" title="Show every year again">All years</button>`;
}
function gxhScrubPaint() {
  const bar = gxEl('gxScrub'); if (!bar) return;
  const show = gx.open && gx.mode === 'time' && !!gx.inf; bar.hidden = !show; if (!show) return;
  if (!bar.firstChild) bar.innerHTML = gxhScrubHtml();
  const I = gx.inf, a = I.y0 - 1, b = I.y1 + 1, pct = (y) => Math.max(0, Math.min(100, (y - a) / (b - a) * 100));
  const y = gx.playYear, [s0, s1] = gxhSpan();
  bar.querySelector('[data-gxh="play"]').textContent = gx.playT ? '❚❚' : '▶';
  bar.querySelector('[data-gxh="speed"]').textContent = gx.speed + '×';
  const lp = bar.querySelector('[data-gxh="loop"]'); lp.setAttribute('aria-pressed', String(gx.loop)); lp.classList.toggle('on', gx.loop);
  lp.textContent = gx.loop ? `Loop ${Math.ceil(s0)}–${Math.floor(s1)}` : 'Loop';
  const sp = bar.querySelector('.gxh-span'); sp.style.left = pct(s0) + '%'; sp.style.width = (pct(s1) - pct(s0)) + '%';
  const k = bar.querySelector('.gxh-knob'), f = bar.querySelector('.gxh-fill'), at = y == null ? 100 : pct(y);
  k.style.left = at + '%'; f.style.width = at + '%'; k.hidden = y == null;
  bar.querySelector('.gxh-year').textContent = y == null ? 'All years' : String(Math.floor(y));
  bar.querySelector('[data-gxh="all"]').hidden = y == null;
  const tk = bar.querySelector('.gxh-ticks'), key = a + ':' + b;
  if (tk.dataset.k !== key) { tk.dataset.k = key; const st = b - a > 40 ? 10 : 5; let h = ''; for (let q = Math.ceil(a / st) * st; q <= b; q += st) h += `<span style="left:${pct(q)}%">${q}</span>`; tk.innerHTML = h; }
  const tr = bar.querySelector('.gxh-track'); tr.setAttribute('aria-valuemin', a); tr.setAttribute('aria-valuemax', b); tr.setAttribute('aria-valuenow', y == null ? b : Math.floor(y));
}
function gxhScrubTo(clientX) {
  const tr = document.querySelector('#gxScrub .gxh-track'); if (!tr || !gx.inf) return;
  const r = tr.getBoundingClientRect(), I = gx.inf, a = I.y0 - 1, b = I.y1 + 1, k = Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
  if (gx.playT) { cancelAnimationFrame(gx.playT); gx.playT = 0; }
  gx.playYear = a + (b - a) * k; gxDraw(); gxRenderSide();
}
(function () {
  const stage = document.querySelector('#gxOverlay .gx-stage'); if (!stage) return;
  const bar = document.createElement('div'); bar.id = 'gxScrub'; bar.className = 'gxh-scrub'; bar.hidden = true; stage.appendChild(bar);
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gxh]'); if (!b) return; const k = b.dataset.gxh;
    if (k === 'play') gxtPlay(gx.sel >= 0);
    else if (k === 'speed') gx.speed = gx.speed === 1 ? 2 : gx.speed === 2 ? 4 : gx.speed === 4 ? 0.5 : 1;
    else if (k === 'loop') gx.loop = !gx.loop;
    else if (k === 'all') { gxtStop(); gxRenderSide(); gxDraw(); }
    gxhScrubPaint();
  });
  let drag = false;
  bar.addEventListener('pointerdown', (e) => { if (!e.target.closest('.gxh-track')) return; drag = true; try { e.target.closest('.gxh-track').setPointerCapture(e.pointerId); } catch (x) { /* fine */ } gxhScrubTo(e.clientX); e.preventDefault(); });
  bar.addEventListener('pointermove', (e) => { if (drag) gxhScrubTo(e.clientX); });
  const up = () => { drag = false; }; bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  bar.addEventListener('keydown', (e) => {
    if (!e.target.closest('.gxh-track') || !gx.inf) return;
    const st = e.shiftKey ? 10 : 1; let y = gx.playYear == null ? gx.inf.y1 + 1 : gx.playYear;
    if (e.key === 'ArrowLeft') y -= st; else if (e.key === 'ArrowRight') y += st; else if (e.key === 'Home') y = gx.inf.y0 - 1; else if (e.key === 'End') y = gx.inf.y1 + 1; else return;
    e.preventDefault(); e.stopPropagation(); gx.playYear = Math.max(gx.inf.y0 - 1, Math.min(gx.inf.y1 + 1, y)); gxDraw(); gxRenderSide();
  });
})();
(function () { const base = gxDraw; gxDraw = function () { base.apply(this, arguments); gxhScrubPaint(); }; })();

// ----- the Links slider in the header -----
(function () {
  const mode = gxEl('gxMode'); if (!mode) return;
  const w = document.createElement('label'); w.className = 'gxh-links'; w.id = 'gxLinksWrap'; w.hidden = true;
  w.title = 'Keep only the stronger links: on the drawing, and on the line of the release you pick';
  w.innerHTML = '<span>Links</span><input type="range" id="gxLinks" min="0" max="100" value="0" aria-label="How strong a link must be to show"><span id="gxLinksN">all</span>';
  mode.insertAdjacentElement('afterend', w);
  w.querySelector('input').addEventListener('input', (e) => {
    const v = +e.target.value; gx.linkMin = v ? 0.15 + v / 100 * 0.55 : 0;
    gxEl('gxLinksN').textContent = v ? (v > 70 ? 'strongest only' : 'stronger') : 'all';
    if (gx.sel >= 0 && gx.mode === 'time') gxtLineage(gx.sel);
    gxRenderSide(); gxDraw();
  });
})();
(function () {
  const base = gxSetMode;
  gxSetMode = function (m) { base(m); const w = gxEl('gxLinksWrap'); if (w) w.hidden = gx.mode !== 'time'; gxhScrubPaint(); };
  const baseOpen = openGalaxy;
  openGalaxy = function () { baseOpen.apply(this, arguments); const w = gxEl('gxLinksWrap'); if (w) w.hidden = gx.mode !== 'time'; gxhScrubPaint(); };
})();

// ----- keys: walk the line -----
function gxhStep(dir) {
  const I = gx.inf, i = gx.sel; if (!I || i < 0 || !gx.lineage) return false;
  let to = -1;
  if (dir === 'up') { const p = I.par[i].filter(q => q.s >= (gx.linkMin || 0))[0]; to = p ? p.j : -1; }
  else if (dir === 'down') { const k = I.kids[i].filter(q => q.s >= (gx.linkMin || 0))[0]; to = k ? k.j : -1; }
  else {
    const line = [...gx.lineage].filter(x => I.yr[x]).sort((a, b) => I.yr[a] - I.yr[b] || a - b), at = line.indexOf(i);
    if (at >= 0) to = line[at + (dir === 'next' ? 1 : -1)]; if (to == null) to = -1;
  }
  if (to < 0) return true;
  // keep the line of the release first picked while stepping along it (← →); ↑ ↓ pick the new one's own line
  if (dir === 'next' || dir === 'prev') { const keep = { line: gx.lineage, anc: gx.anc, desc: gx.desc }; gx.sel = to; gx.lineage = keep.line; gx.anc = keep.anc; gx.desc = keep.desc; gxRenderSide(); gxFlyTo(to, gx.cam.z); }
  else gxSelect(to, true);
  return true;
}
window.addEventListener('keydown', (e) => {
  if (!gx.open || gx.mode !== 'time') return;
  const tag = (e.target && e.target.tagName) || '';
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) && e.key !== 'Escape') return;
  if (e.target && e.target.closest && e.target.closest('.gxh-track')) return;
  if (e.key === 'Escape' && gx.sel >= 0) { e.preventDefault(); e.stopImmediatePropagation(); if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) e.target.blur(); gxSelect(-1); return; }
  const map = { ArrowLeft: 'prev', ArrowRight: 'next', ArrowUp: 'up', ArrowDown: 'down' }, d = map[e.key];
  if (d && gxhStep(d)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
// picking a release keeps the year the bar was left on (only playing stops)
(function () { const base = gxSelect; gxSelect = function (i, fly) { const y = gx.playT ? null : gx.playYear; base(i, fly); if (y != null && gx.mode === 'time') { gx.playYear = y; gxDraw(); } }; })();
