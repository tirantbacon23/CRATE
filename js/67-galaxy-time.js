// (1.135.82) Crate Galaxy · Influence over time. The years run left to right and each genre family is a lane (its subgenres bands
// within it). Every release is linked to the few earlier releases in your crate it is most like (genres and their parents,
// descriptors, scene, label, artist: what the map's links are made of, without the decade), and a release's size is how much of
// what came after leans on it, credit passed back along those links. It is read from your crate alone: likeness and order in time,
// not anyone's account of who heard whom, so it says "drew from" and "passed it on to", and the side panel says so.

const GXT_PARENTS = 3, GXT_MIN = 0.15;

function gxtYear(it) {                                                // the year, with the month as a fraction when there is one
  const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(String(it.releaseDate || '')); if (!m) return 0;
  const y = +m[1]; if (y < 1000) return 0; return y + (m[2] ? (Math.min(12, Math.max(1, +m[2])) - 1) / 12 : 0.5);
}
// -> { yr, par: [[{ j, s }]], kids, credit, y0, y1 }
function gxInfluence() {
  if (gx.inf && gx.inf.key === gx.key && gx.inf.n === gx.items.length) return gx.inf;
  const items = gx.items, N = items.length, vec = gx.graph.vec, yr = Float64Array.from(items, gxtYear);
  const post = new Map(); vec.forEach((m, i) => { if (!yr[i]) return; m.forEach((v, x) => { if (x.startsWith('y:')) return; if (!post.has(x)) post.set(x, []); post.get(x).push(i); }); });
  post.forEach(l => l.sort((a, b) => yr[a] - yr[b]));
  const firstAtOrAfter = (l, y) => { let lo = 0, hi = l.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (yr[l[mid]] < y) lo = mid + 1; else hi = mid; } return lo; };
  // likeness on what releases share (genres, descriptors, scene, label), the decade and the artist's own name left out (an artist on one
  // release would only dilute it); the same artist adds a little on top: an earlier album of theirs is where a later one comes from
  const skip = (x) => x.startsWith('y:') || x.startsWith('a:'), nrm = vec.map(m => { let n2 = 0; m.forEach((v, x) => { if (!skip(x)) n2 += v * v; }); return Math.sqrt(n2) || 1; });
  const dot = (i, j) => { let s = 0, same = false; vec[i].forEach((v, x) => { const w = vec[j].get(x); if (!w) return; if (x.startsWith('a:')) same = true; else if (!x.startsWith('y:')) s += v * w; }); return Math.min(1, s / (nrm[i] * nrm[j]) + (same ? 0.2 : 0)); };
  const par = Array.from({ length: N }, () => []), kids = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    if (!yr[i]) continue; const cand = new Set();
    vec[i].forEach((v, x) => { if (x.startsWith('y:')) return; const l = post.get(x); if (!l) return; const end = firstAtOrAfter(l, yr[i]); for (let k = end - 1, c = 0; k >= 0 && c < 60; k--, c++) cand.add(l[k]); });          // the nearest earlier ones on each thing it has
    const sc = []; cand.forEach(j => { const dy = yr[i] - yr[j]; if (dy <= 0) return; const s = dot(i, j) / (1 + dy / 25); if (s >= GXT_MIN) sc.push({ j, s }); });
    sc.sort((a, b) => b.s - a.s); const best = sc.length ? sc[0].s : 0;
    par[i] = sc.filter(x => x.s >= best * 0.5).slice(0, GXT_PARENTS);
    par[i].forEach(({ j, s }) => kids[j].push({ j: i, s }));
  }
  kids.forEach(l => l.sort((a, b) => b.s - a.s));
  // credit: what each release passes back to what it drew from, shared by how much it drew from each (the newest first, so it adds up)
  const credit = new Float64Array(N), byNew = Array.from({ length: N }, (_, i) => i).sort((a, b) => yr[b] - yr[a]);
  byNew.forEach(c => { const ps = par[c]; if (!ps.length) return; const tot = ps.reduce((a, p) => a + p.s, 0); ps.forEach(p => { credit[p.j] += (p.s / tot) * (1 + credit[c]); }); });
  let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < N; i++) if (yr[i]) { y0 = Math.min(y0, yr[i]); y1 = Math.max(y1, yr[i]); }
  if (!isFinite(y0)) { y0 = 1970; y1 = 2020; }
  gx.inf = { key: gx.key, n: N, yr, par, kids, credit, y0: Math.floor(y0), y1: Math.ceil(y1) };
  return gx.inf;
}

// ----- where each star goes: years across, a lane per family, a band per subgenre -----
function gxtLayout() {
  const I = gxInfluence(), F = gx.fams, N = gx.items.length, XW = GX_LEN * 2.4, pos = new Float64Array(N * 2);
  const med = (ix) => { const ys = ix.map(i => I.yr[i]).filter(Boolean).sort((a, b) => a - b); return ys.length ? ys[Math.floor(ys.length / 2)] : 9999; };
  const byFam = new Map(); F.fam.forEach((f, i) => { if (!byFam.has(f)) byFam.set(f, []); byFam.get(f).push(i); });
  const fams = [...byFam.keys()].sort((a, b) => med(byFam.get(a)) - med(byFam.get(b)) || byFam.get(b).length - byFam.get(a).length);
  const lanes = []; let top = 0;
  fams.forEach(f => {
    const ix = byFam.get(f), H = GX_LEN * (2.4 + Math.sqrt(ix.length) * 1.35), subs = new Map();
    ix.forEach(i => { const s = (F.sub && F.sub[i]) || f; if (!subs.has(s)) subs.set(s, []); subs.get(s).push(i); });
    const order = [...subs.keys()].sort((a, b) => med(subs.get(a)) - med(subs.get(b))); let by = top + GX_LEN * 0.4; const bands = [];
    order.forEach(s => { const list = subs.get(s), h = (H - GX_LEN * 0.8) * list.length / ix.length; bands.push({ s, y: by, h, n: list.length });
      list.forEach(i => { const r = gxRand(gxHash('t|' + i + '|' + gx.items[i].title)), x = I.yr[i] ? (I.yr[i] - I.y0) * XW + (r() - 0.5) * XW * 0.55 : -5 * XW + (r() - 0.5) * XW * 2.5;
        pos[2 * i] = x; pos[2 * i + 1] = by + (0.12 + r() * 0.76) * h; }); by += h; });
    lanes.push({ f, y: top, h: H, n: ix.length, bands }); top += H + GX_LEN * 0.9;
  });
  gx.tl = { XW, lanes, y0: I.y0, y1: I.y1, height: top };
  return pos;
}
function gxtReady() { return gx.mode === 'time' && !!(gx.inf && gx.tl && gx.timePos && gx.pos === gx.timePos); }

// ----- switching between the map and the timeline -----
function gxSetMode(m) {
  m = m === 'time' ? 'time' : 'map'; if (m === gx.mode && (m === 'map' || gxtReady())) return;
  gxtStop();
  if (m === 'time') { if (gx.mode !== 'time') { gx.mapCam = Object.assign({}, gx.cam); gx.d3Was = gx.d3; } gx.mode = 'time'; gxtEnter(); }
  else { gx.mode = 'map'; gx.d3 = !!gx.d3Was; if (gx.layout) gx.pos = gx.layout.pos; gx.lineage = null; if (gx.mapCam) gx.cam = gx.mapCam; else gxFit(true); }
  const sel = gxEl('gxMode'); if (sel) sel.value = gx.mode;
  ['gxMode3d', 'gxSpin'].forEach(id => { const b = gxEl(id); if (b) b.hidden = gx.mode === 'time' || (id === 'gxSpin' && !gx.d3); });
  const pb = gxEl('gxPlayHist'); if (pb) pb.hidden = gx.mode !== 'time';
  gxRenderSide(); gxDraw();
}
function gxtEnter(keepCam) {                                          // (again after the crate changes, or the galaxy is opened on other releases)
  if (!gx.graph || !gx.fams || !gx.items.length) return;
  gx.d3 = false; if (typeof gxSpin === 'function') gxSpin(false);
  gx.timePos = gxtLayout(); gx.pos = gx.timePos;
  if (gx.sel >= 0) gxtLineage(gx.sel); else gx.lineage = null;
  if (!keepCam) gxFit(true);
}

// ----- one release's line: what it drew from, and everything after it that leans on it -----
function gxtLineage(i) {
  if (i < 0 || !gx.inf) { gx.lineage = null; return; }
  const I = gx.inf, anc = new Map([[i, 0]]), desc = new Map([[i, 0]]);
  let lvl = [i]; for (let g = 1; g <= 4 && lvl.length; g++) { const next = []; lvl.forEach(x => I.par[x].forEach(({ j }) => { if (!anc.has(j)) { anc.set(j, g); next.push(j); } })); lvl = next; }
  lvl = [i]; for (let g = 1; lvl.length && g < 60; g++) { const next = []; lvl.forEach(x => I.kids[x].forEach(({ j }) => { if (!desc.has(j)) { desc.set(j, g); next.push(j); } })); lvl = next; }
  gx.lineage = new Set([...anc.keys(), ...desc.keys()]); gx.anc = anc; gx.desc = desc;
}
function gxtHidden(i) { return gx.playYear != null && (!gx.inf.yr[i] || gx.inf.yr[i] > gx.playYear); }
function gxtRadius(i) { return 1.6 + Math.min(6, Math.sqrt(gx.inf.credit[i]) * 0.85); }

// ----- playing history: the years go by, and each release lights up as it comes, with the lines to what it drew from -----
function gxtPlay(fromSel) {
  if (gx.playT) { gxtStop(); gxRenderSide(); gxDraw(); return; }
  const I = gx.inf; if (!I) return;
  const start = fromSel && gx.sel >= 0 && I.yr[gx.sel] ? Math.floor(I.yr[gx.sel]) - 0.5 : I.y0 - 1, end = I.y1 + 1, dur = Math.max(7000, Math.min(32000, (end - start) * 380));
  gx.playFromSel = !!fromSel; const t0 = performance.now();
  const tick = (t) => { if (!gx.open || gx.mode !== 'time') { gxtStop(); return; } const k = Math.min(1, (t - t0) / dur); gx.playYear = start + (end - start) * k; gxDraw();
    if (k < 1) gx.playT = requestAnimationFrame(tick); else { gx.playT = 0; gx.playYear = null; gxRenderSide(); gxDraw(); } };
  gx.playYear = start; gx.playT = requestAnimationFrame(tick); gxRenderSide();
}
function gxtStop() { if (gx.playT) cancelAnimationFrame(gx.playT); gx.playT = 0; gx.playYear = null; }

// ----- drawing: under the stars (lanes, years, the lines of influence) and over them (the year passing) -----
function gxtUnder(ctx, v, sx, sy, on) {
  const T = gx.tl, I = gx.inf, z = gx.cam.z, P = (x, y) => gxProj(x, y, 0, v), xa = (T.y0 - 8) * 0, x0 = -7 * T.XW, x1 = (T.y1 - T.y0 + 1.5) * T.XW;
  // lanes, faint bands for their subgenres
  T.lanes.forEach((L, k) => {
    const a = P(x0, L.y), b = P(x1, L.y + L.h); if (b[1] < 0 || a[1] > v.h) return;
    ctx.fillStyle = `hsla(${gxHue(L.f)},40%,50%,${k % 2 ? 0.05 : 0.08})`; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    if (z * GX_LEN > 9) L.bands.forEach((B, q) => { if (!q) return; const p = P(x0, B.y); ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(a[0], p[1], b[0] - a[0], 1); });
  });
  // the years: a line each decade (each year when close), named along the bottom
  const step = z * T.XW > 26 ? 1 : z * T.XW > 6 ? 5 : 10, first = Math.ceil(T.y0 / step) * step;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = "11px 'IBM Plex Mono', monospace";
  for (let y = first; y <= T.y1 + 1; y += step) { const p = P((y - T.y0) * T.XW, 0); if (p[0] < -20 || p[0] > v.w + 20) continue; const dec = y % 10 === 0;
    ctx.fillStyle = `rgba(200,210,235,${dec ? 0.1 : 0.05})`; ctx.fillRect(p[0], 0, 1, v.h); ctx.fillStyle = `rgba(200,210,235,${dec ? 0.7 : 0.4})`; ctx.fillText(dec || step === 1 ? String(y) : `'${String(y).slice(2)}`, p[0], v.h - 6); }
  const nu = P(-5 * T.XW, 0); if (nu[0] > -40 && nu[0] < v.w) { ctx.fillStyle = 'rgba(200,210,235,0.45)'; ctx.fillText('no year', nu[0], v.h - 6); }
  // the lines: from what a release drew from, to it (curving forward in time)
  const N = gx.items.length, sel = gx.sel >= 0 && gx.lineage, many = N > 2500, now = gx.playYear;
  ctx.lineWidth = 1;
  for (let i = 0; i < N; i++) {
    const ps = I.par[i]; if (!ps.length || (now != null && gxtHidden(i))) continue;
    (many ? ps.slice(0, 1) : ps).forEach(({ j, s }) => {
      if (!on(i) && !on(j)) return;
      let col;
      if (sel) { const inA = gx.anc.has(i) && gx.anc.has(j), inD = gx.desc.has(i) && gx.desc.has(j); if (!inA && !inD) { if (gx.playFromSel) return; col = 'rgba(170,185,215,0.025)'; } else col = inA ? `rgba(240,194,106,${0.35 + s * 0.6})` : `rgba(127,209,185,${0.3 + s * 0.6})`; }
      else { const fresh = now != null && now - I.yr[i] < 1.5; col = `hsla(${gxHue(gx.fams.fam[j])},60%,66%,${fresh ? 0.55 : Math.min(0.22, 0.04 + s * 0.22)})`; }
      ctx.strokeStyle = col; ctx.lineWidth = sel && col[3] === 'a' && col.indexOf('0.025') < 0 ? 1.2 + s * 1.5 : 1;
      const mx = (sx[i] + sx[j]) / 2; ctx.beginPath(); ctx.moveTo(sx[j], sy[j]); ctx.bezierCurveTo(mx, sy[j], mx, sy[i], sx[i], sy[i]); ctx.stroke();
    });
  }
}
function gxtOver(ctx, v, sx, sy) {
  const T = gx.tl, z = gx.cam.z, P = (x, y) => gxProj(x, y, 0, v);
  // each lane's name, kept at the left edge as you move along
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  T.lanes.forEach(L => { const a = P(0, L.y), b = P(0, L.y + L.h), h = b[1] - a[1]; if (b[1] < 0 || a[1] > v.h || h < 12) return;
    const fs = Math.max(11, Math.min(20, h * 0.22)); ctx.font = `${fs}px 'Bebas Neue', Inter, sans-serif`; ctx.fillStyle = `hsla(${gxHue(L.f)},70%,76%,0.9)`; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText(L.f.toUpperCase(), 10, Math.max(14, Math.min(v.h - 24, a[1] + fs * 0.8)));
    if (z * GX_LEN > 12 && h > 60) { ctx.font = "10px 'IBM Plex Mono', monospace"; L.bands.forEach(B => { const p = P(0, B.y + B.h / 2), bh = B.h * z; if (bh < 13 || B.s === L.f) return; ctx.fillStyle = gxSubColor(B.s, 0.75); ctx.fillText(B.s, 12, p[1]); }); }
    ctx.shadowBlur = 0; });
  // the year passing
  if (gx.playYear != null) {
    const p = P((gx.playYear - T.y0) * T.XW, 0); ctx.fillStyle = 'rgba(240,194,106,0.85)'; ctx.fillRect(p[0], 0, 2, v.h);
    ctx.font = "400 30px 'Bebas Neue', Inter, sans-serif"; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.shadowColor = '#000'; ctx.shadowBlur = 8; ctx.fillText(String(Math.floor(gx.playYear)), Math.min(p[0] + 8, v.w - 70), 10); ctx.shadowBlur = 0;
  }
}

// ----- the side panel in this view -----
function gxtSide() {
  const I = gx.inf; if (!I) return '<p class="gx-dim">Reading your crate…</p>';
  const N = gx.items.length, playing = !!gx.playT, row = (i, extra) => gxRow(i, extra), reach = (i) => Math.round(I.credit[i]);
  if (gx.sel >= 0 && gx.lineage) {
    const it = gx.items[gx.sel], y = gxYear(it), ps = I.par[gx.sel], ks = I.kids[gx.sel], d = gx.desc.size - 1;
    const later = [...gx.desc.keys()].filter(x => x !== gx.sel), span = later.length ? Math.max(...later.map(x => I.yr[x])) : 0;
    const famsReached = new Map(); later.forEach(x => { const f = gx.fams.fam[x]; famsReached.set(f, (famsReached.get(f) || 0) + 1); });
    const fr = [...famsReached].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => `<span class="gxt-fam" style="color:hsl(${gxHue(f)},70%,74%)">${escapeHtml(f)} ${n}</span>`).join(' ');
    return `<div class="gx-card"><img src="${escapeHtml(gxCover(it))}" alt=""><div><b>${escapeHtml(it.title)}</b><i>${escapeHtml(it.artist)}${y ? ' · ' + y : ''}</i><em>${escapeHtml([it.genre, it.genre2].filter(Boolean).join(' · '))}</em></div></div>
      <div class="gx-acts"><button type="button" class="chip-btn" data-gx="open">Open</button><button type="button" class="chip-btn" data-gx="play">Play</button>${d ? `<button type="button" class="chip-btn gx-primary" data-gx="tplaysel">${playing ? 'Stop' : '▶ Play its influence'}</button>` : ''}</div>
      <div class="gxt-stats">${d ? `<b>${d.toLocaleString()}</b> later release${d === 1 ? '' : 's'} in your crate lean on it${span ? `, up to ${Math.floor(span)}` : ''}${fr ? `<div class="gxt-fams">${fr}</div>` : ''}` : 'Nothing later in your crate leans on it.'}</div>
      <div class="gx-h">Drew from</div>${ps.length ? ps.map(({ j, s }) => row(j, `<em class="gx-sim">${Math.round(s * 100)}</em>`)).join('') : '<p class="gx-dim">Nothing earlier in your crate is like it: a starting point here.</p>'}
      <div class="gx-h gxt-on">Passed it on to</div>${ks.length ? ks.slice(0, 10).map(({ j, s }) => row(j, `<em class="gx-sim">${Math.round(s * 100)}</em>`)).join('') + (ks.length > 10 ? `<p class="gx-dim">and ${ks.length - 10} more</p>` : '') : '<p class="gx-dim">Nothing yet.</p>'}`;
  }
  const top = Array.from({ length: N }, (_, i) => i).filter(i => I.credit[i] >= 1).sort((a, b) => I.credit[b] - I.credit[a]).slice(0, 12);
  const roots = top.filter(i => !I.par[i].length).slice(0, 6);
  return `<p class="gx-dim">Years run left to right, a lane for each genre family (its subgenres in bands, oldest first). Each release is joined to the earlier releases in your crate it is most like, and the bigger a star, the more of what came after leans on it.</p>
    <p class="gx-dim">It is read from your crate alone, from what releases share and when they came out, not from who heard whom. Click a star to see its line; scroll to zoom into the years.</p>
    <div class="gx-acts"><button type="button" class="chip-btn gx-primary" data-gx="tplay">${playing ? 'Stop' : '▶ Play history'}</button></div>
    <div class="gx-h">Most influential in your crate</div>${top.length ? top.map(i => row(i, `<em class="gx-sim" title="later releases leaning on it">${reach(i)}</em>`)).join('') : '<p class="gx-dim">Too few dated releases to tell yet.</p>'}
    ${roots.length ? `<div class="gx-h">Starting points</div><p class="gx-dim">Influential, and like nothing before them in your crate.</p>${roots.map(i => row(i, `<em class="gx-sim">${reach(i)}</em>`)).join('')}` : ''}`;
}
