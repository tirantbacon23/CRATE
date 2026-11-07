// ---- Crate Galaxy: the whole crate as a map of stars. Each release is placed near the releases it has most in common with — its genres
// (and their parents in your Genre Taxonomy), RYM descriptors, scene, movement, label, artist and decade, each weighted by how rare it is in
// your crate — so sounds gather into regions of their own. A "wormhole" is the smoothest chain of releases from one star to another: many
// small steps rather than a few big ones, which you can play in order as one queue. Nothing here is saved to the sheet. ----
const GX_W = { g1: 3, g2: 2, gp: 1, d: 0.9, s: 2, l: 1.4, a: 2.6, y: 0.7 };          // how much each kind of thing in common counts
const GX_K = 8;                                                       // neighbours kept per star
const GX_LEN = 30;                                                    // the layout's unit length
const gx = { open: false, items: [], graph: null, pos: null, cam: { x: 0, y: 0, z: 1 }, hover: -1, sel: -1, from: -1, to: -1, path: [], color: 'family', decade: '', onlyShown: false, find: '',
  layoutTimer: 0, settling: 0, key: '', cache: new Map(), anim: 0, stars: null, drag: null, pointers: new Map(), pulse: 0 };

// ----- the graph -----
const gxNorm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const gxSplit = (s) => String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
function gxHash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function gxRand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gxParents(tax, genre) {
  if (!tax || typeof getGenreParents !== 'function') return [];
  try { return (getGenreParents(tax, genre) || []).filter(Boolean); } catch (e) { return []; }
}
function gxFamily(genre, tax) {                                       // the top of a genre's first line of parents in your taxonomy (the genre itself when it has none)
  let g = String(genre || '').trim(); if (!g) return '';
  const seen = new Set([gxNorm(g)]);
  for (let i = 0; i < 12; i++) { const p = gxParents(tax, g)[0]; if (!p || seen.has(gxNorm(p))) break; seen.add(gxNorm(p)); g = p; }
  return g;
}
function gxTokens(item, tax) {                                        // what a release is made of: { token: weight }
  const t = {}, put = (k, w) => { if (k && !k.endsWith(':')) t[k] = Math.max(t[k] || 0, w); };
  const g1 = gxSplit(item.genre), g2 = gxSplit(item.genre2);
  g1.forEach((g, i) => put('g:' + gxNorm(g), i === 0 ? GX_W.g1 : GX_W.g2));
  g2.forEach(g => put('g:' + gxNorm(g), GX_W.g2));
  [...g1, ...g2].forEach(g => {                                       // its parents, fainter each level up
    let lvl = [g], w = GX_W.gp; const seen = new Set([gxNorm(g)]);
    for (let d = 0; d < 4 && lvl.length; d++) { const next = []; lvl.forEach(x => gxParents(tax, x).forEach(p => { const k = gxNorm(p); if (!seen.has(k)) { seen.add(k); next.push(p); put('g:' + k, w); } })); lvl = next; w /= 2; }
  });
  gxSplit(item.rymDescriptors).forEach(d => put('d:' + gxNorm(d), GX_W.d));
  [item.scene, item.movement].forEach(s => gxSplit(s).forEach(x => put('s:' + gxNorm(x), GX_W.s)));
  gxSplit(item.label).slice(0, 2).forEach(l => put('l:' + gxNorm(l), GX_W.l));
  if (item.artist) put('a:' + gxNorm(item.artist), GX_W.a);
  const y = parseInt(String(item.releaseDate || '').slice(0, 4), 10); if (y > 1000) put('y:' + Math.floor(y / 10) * 10, GX_W.y);
  return t;
}
// -> { vec: [Map token->weight, unit length], nbr: [[{ j, s }]] (best first, both ways), edges: count }
function gxBuild(items, tax, k) {
  k = k || GX_K; const N = items.length, raw = items.map(it => gxTokens(it, tax)), df = new Map();
  raw.forEach(t => Object.keys(t).forEach(x => df.set(x, (df.get(x) || 0) + 1)));
  const vec = raw.map(t => {                                          // rare things in common count for more (tf-idf), and every star has length 1
    const m = new Map(); let n2 = 0;
    Object.entries(t).forEach(([x, w]) => { const v = w * Math.log(1 + N / df.get(x)); m.set(x, v); n2 += v * v; });
    const n = Math.sqrt(n2) || 1; m.forEach((v, x) => m.set(x, v / n)); return m;
  });
  const post = new Map(), cap = Math.max(40, Math.ceil(N * 0.12));    // a token on much of the crate (a decade, "Rock") is looked up by only a sample of it
  vec.forEach((m, i) => m.forEach((v, x) => { if (!post.has(x)) post.set(x, []); post.get(x).push(i); }));
  const cos = (i, j) => { let s = 0; const m = vec[i], a = m.size <= vec[j].size ? m : vec[j], b = a === m ? vec[j] : m; a.forEach((v, x) => { const w = b.get(x); if (w) s += v * w; }); return s; };
  const best = vec.map((m, i) => {
    const near = new Set(), wide = new Set();
    m.forEach((v, x) => { const l = post.get(x); if (l.length <= cap) l.forEach(j => { if (j !== i) near.add(j); }); else { const step = Math.max(1, Math.floor(l.length / 24)); for (let o = (i * 7) % step, c = 0; o < l.length && c < 24; o += step, c++) if (l[o] !== i) wide.add(l[o]); } });
    const score = (set) => { const out = []; set.forEach(j => { const s = cos(i, j); if (s > 0.02) out.push({ j, s }); }); return out.sort((p, q) => q.s - p.s || p.j - q.j); };
    const a = score(near).slice(0, k - 2), have = new Set(a.map(x => x.j));          // the closest, and two from further afield that still share something,
    return a.concat(score(wide).filter(x => !have.has(x.j)).slice(0, Math.max(2, k - a.length)));          // so small groups (one artist's albums) aren't islands with no way out
  });
  const nb = best.map(() => new Map()), link = (i, j, s) => { nb[i].set(j, Math.max(nb[i].get(j) || 0, s)); nb[j].set(i, Math.max(nb[j].get(i) || 0, s)); };
  best.forEach((l, i) => l.forEach(({ j, s }) => link(i, j, s)));
  // Whatever is still cut off is joined to the biggest group by its closest member there (a long, faint link when they share nothing at all).
  const comp = new Int32Array(N).fill(-1), groups = [];
  for (let s0 = 0; s0 < N; s0++) { if (comp[s0] >= 0) continue; const g = [s0]; comp[s0] = groups.length; for (let q = 0; q < g.length; q++) nb[g[q]].forEach((v, j) => { if (comp[j] < 0) { comp[j] = groups.length; g.push(j); } }); groups.push(g); }
  if (groups.length > 1) {
    const main = groups.reduce((a, b) => (b.length > a.length ? b : a)), stride = Math.max(1, Math.floor(main.length / 400));
    groups.forEach(g => {
      if (g === main) return; let bi = g[0], bj = main[0], bs = -1;
      g.slice(0, 6).forEach(i => { const seen = new Set(); vec[i].forEach((v, x) => post.get(x).forEach(j => { if (comp[j] === comp[main[0]] && !seen.has(j) && seen.size < 600) { seen.add(j); const s = cos(i, j); if (s > bs) { bs = s; bi = i; bj = j; } } })); if (bs < 0) for (let o = 0; o < main.length; o += stride) { const s = cos(i, main[o]); if (s > bs) { bs = s; bi = i; bj = main[o]; } } });
      link(bi, bj, Math.max(0.01, bs));
    });
  }
  let edges = 0; const nbr = nb.map(m => { edges += m.size; return [...m].map(([j, s]) => ({ j, s })).sort((p, q) => q.s - p.s); });
  return { vec, nbr, edges: edges / 2, pieces: groups.length };
}
// The smoothest chain from a to b: each step costs more the less the two releases share, so many close steps beat one leap. -> [indices] or []
function gxPath(graph, a, b) {
  const N = graph.nbr.length; if (a < 0 || b < 0 || a >= N || b >= N) return []; if (a === b) return [a];
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = [];
  const push = (d, i) => { heap.push([d, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  dist[a] = 0; push(0, a);
  while (heap.length) {
    const [d, i] = pop(); if (d > dist[i]) continue; if (i === b) break;
    graph.nbr[i].forEach(({ j, s }) => { const nd = d + (1 - s) * (1 - s) + 0.02; if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(nd, j); } });
  }
  if (prev[b] < 0) return [];
  const out = []; for (let i = b; i >= 0; i = prev[i]) { out.push(i); if (i === a) break; }
  return out.reverse();
}

// ----- the layout: each family of genres starts round its own point on a ring, then links pull and crowding pushes until it settles -----
function gxFamilies(items, tax) {
  const fam = items.map(it => gxFamily(gxSplit(it.genre)[0] || gxSplit(it.genre2)[0] || '', tax) || 'Unfiled');
  const count = new Map(); fam.forEach(f => count.set(f, (count.get(f) || 0) + 1));
  const order = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(x => x[0]);
  return { fam, order, count };
}
function gxLayoutInit(items, fams) {
  const N = items.length, R = GX_LEN * Math.sqrt(N) * 1.25, anchor = new Map(), big = fams.order.slice(0, 28);
  big.forEach((f, i) => { const a = (i / big.length) * Math.PI * 2, r = R * (0.55 + 0.45 * ((i % 3) / 2)); anchor.set(f, [Math.cos(a) * r, Math.sin(a) * r]); });
  const pos = new Float64Array(N * 2), vel = new Float64Array(N * 2);
  items.forEach((it, i) => {
    const rnd = gxRand(gxHash(it.artist + '|' + it.title + '|' + it.row)), f = fams.fam[i];
    let c = anchor.get(f); if (!c) { const h = gxRand(gxHash(f)); c = [(h() - 0.5) * R * 1.6, (h() - 0.5) * R * 1.6]; }
    const spread = GX_LEN * Math.sqrt(fams.count.get(f) || 1) * 0.7, ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * spread;
    pos[2 * i] = c[0] + Math.cos(ang) * rr; pos[2 * i + 1] = c[1] + Math.sin(ang) * rr;
  });
  const idx = new Map(fams.order.map((f, i) => [f, i])), fam = Int32Array.from(fams.fam, f => idx.get(f)), nf = fams.order.length, ax = new Float64Array(nf), ay = new Float64Array(nf);
  fams.order.forEach((f, q) => { let c = anchor.get(f); if (!c) { const h = gxRand(gxHash(f)); c = [(h() - 0.5) * R * 1.6, (h() - 0.5) * R * 1.6]; } ax[q] = c[0]; ay[q] = c[1]; });
  return { pos, vel, fam, nf, ax, ay, iter: 0, total: Math.min(340, 150 + Math.round(N / 16)) };
}
function gxLayoutStep(L, graph, steps) {                              // a few rounds of the simulation; returns true once it has settled
  const pos = L.pos, vel = L.vel, N = pos.length / 2, R = GX_LEN * 0.95, cell = R, fam = L.fam;
  for (let s = 0; s < steps && L.iter < L.total; s++, L.iter++) {
    const heat = 1 - L.iter / L.total, f = new Float64Array(N * 2), grid = new Map();
    const key = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
    for (let i = 0; i < N; i++) { const k = key(Math.floor(pos[2 * i] / cell), Math.floor(pos[2 * i + 1] / cell)); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(i); }
    for (let i = 0; i < N; i++) {                                     // crowding: stars closer than R push apart
      const x = pos[2 * i], y = pos[2 * i + 1], cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const c = grid.get(key(cx + dx, cy + dy)); if (!c) continue;
        for (const j of c) { if (j <= i) continue; let ex = x - pos[2 * j], ey = y - pos[2 * j + 1], d2 = ex * ex + ey * ey; if (d2 >= R * R) continue; if (d2 < 1e-6) { ex = (gxHash(i + ':' + j) % 7) - 3 || 1; ey = 1; d2 = ex * ex + 1; }
          const d = Math.sqrt(d2), p = (R - d) / d * 0.3; f[2 * i] += ex * p; f[2 * i + 1] += ey * p; f[2 * j] -= ex * p; f[2 * j + 1] -= ey * p; }
      }
    }
    graph.nbr.forEach((l, i) => l.forEach(({ j, s }) => {              // links: closer the more two releases share
      if (j <= i) return; const ex = pos[2 * j] - pos[2 * i], ey = pos[2 * j + 1] - pos[2 * i + 1], d = Math.sqrt(ex * ex + ey * ey) || 1, rest = GX_LEN * (1.25 - s * 0.6), p = Math.max(-GX_LEN, Math.min(GX_LEN * 2.5, d - rest)) / d * 0.1 * (0.3 + s);
      f[2 * i] += ex * p; f[2 * i + 1] += ey * p; f[2 * j] -= ex * p; f[2 * j + 1] -= ey * p;
    }));
    if (fam) for (let i = 0; i < N; i++) {                             // each family is held round its own point, so sounds form islands; a release that
      const q = fam[i], w = 0.016; f[2 * i] += (L.ax[q] - pos[2 * i]) * w; f[2 * i + 1] += (L.ay[q] - pos[2 * i + 1]) * w;          // bridges two is pulled out between them
    }
    const lim = GX_LEN * (0.15 + 1.2 * heat);
    for (let i = 0; i < N; i++) for (let a = 0; a < 2; a++) {
      const k = 2 * i + a; f[k] -= pos[k] * 0.0002;                   // a faint pull to the middle, so islands don't drift off
      vel[k] = (vel[k] + f[k]) * 0.55; vel[k] = Math.max(-lim, Math.min(lim, vel[k])); pos[k] += vel[k];
    }
  }
  return L.iter >= L.total;
}

// ----- colours -----
function gxHue(name) { return gxHash(gxNorm(name)) % 360; }
function gxYear(it) { const y = parseInt(String(it.releaseDate || '').slice(0, 4), 10); return y > 1000 ? y : 0; }
function gxColor(i) {
  const it = gx.items[i];
  if (gx.color === 'decade') { const y = gxYear(it); if (!y) return 'hsl(220,8%,45%)'; const t = Math.max(0, Math.min(1, (y - 1950) / 75)); return `hsl(${Math.round(260 - t * 230)},70%,${58 + t * 6}%)`; }
  if (gx.color === 'rating' || gx.color === 'rym') { const r = gx.color === 'rating' ? Number(it.rating) || 0 : Number(it.rymRating) || 0; if (!r) return 'hsl(220,8%,38%)'; const t = Math.max(0, Math.min(1, (r - (gx.color === 'rym' ? 2.5 : 1)) / (gx.color === 'rym' ? 1.8 : 4))); return `hsl(${Math.round(210 - t * 172)},${55 + t * 30}%,${44 + t * 18}%)`; }
  return `hsl(${gxHue(gx.fams.fam[i])},62%,62%)`;
}

// ----- opening, and which releases -----
function gxPool() { return (gx.onlyShown ? state.filtered : state.raw).filter(it => it && it.title); }
function gxEl(id) { return document.getElementById(id); }
function openGalaxy() {
  gx.open = true; gxEl('gxOverlay').hidden = false;
  const pool = gxPool(), key = (gx.onlyShown ? 'f:' : 'a:') + pool.length + ':' + pool.slice(0, 50).map(x => x.row).join(',') + ':' + Object.keys(state.genreTaxonomy || {}).length;
  if (key !== gx.key) {
    gx.key = key; gx.items = pool; gx.hover = gx.sel = gx.from = gx.to = -1; gx.path = [];
    const hit = gx.cache.get(key);
    if (hit) Object.assign(gx, hit);
    else {
      gxSetStatus(`Reading ${pool.length.toLocaleString()} releases…`);
      setTimeout(() => {                                              // let the window open before the heavy part
        gx.fams = gxFamilies(pool, state.genreTaxonomy); gx.graph = gxBuild(pool, state.genreTaxonomy); gx.layout = gxLayoutInit(pool, gx.fams); gx.pos = gx.layout.pos;
        gxFit(); gxSettle();
      }, 30);
    }
  }
  gxResize(); gxRenderSide(); gxDraw();
  setTimeout(() => { const f = gxEl('gxFind'); if (f) f.focus(); }, 60);
}
function closeGalaxy() { gx.open = false; clearTimeout(gx.layoutTimer); cancelAnimationFrame(gx.anim); gx.anim = 0; const ov = gxEl('gxOverlay'); if (ov) ov.hidden = true; gxTip(-1); }
function gxSettle() {                                                 // runs the layout a little at a time, drawing as it goes: you watch the galaxy form
  clearTimeout(gx.layoutTimer);
  const L = gx.layout; if (!L) return;
  const t0 = performance.now(); let done = false;
  while (!done && performance.now() - t0 < 14) done = gxLayoutStep(L, gx.graph, 2);
  gxSetStatus(done ? '' : `Forming the galaxy… ${Math.round(L.iter / L.total * 100)}%`);
  if (L.iter < 40 || L.iter % 30 < 3) gxFit(true);
  gxDraw(); gxRenderSide();
  if (!done && gx.open) gx.layoutTimer = setTimeout(gxSettle, 0);
  if (done) { gxFit(true); gxLabels(); gx.cache.set(gx.key, { fams: gx.fams, graph: gx.graph, layout: gx.layout, pos: gx.pos, labels: gx.labels }); gxDraw(); }
}
function gxSetStatus(t) { const s = gxEl('gxStatus'); if (s) { s.textContent = t; s.hidden = !t; } }

// ----- the camera -----
function gxView() { const c = gxEl('gxCanvas'); return c ? { w: c.clientWidth || 1, h: c.clientHeight || 1 } : { w: 1, h: 1 }; }
function gxToScreen(i) { const v = gxView(); return [(gx.pos[2 * i] - gx.cam.x) * gx.cam.z + v.w / 2, (gx.pos[2 * i + 1] - gx.cam.y) * gx.cam.z + v.h / 2]; }
function gxToWorld(sx, sy) { const v = gxView(); return [(sx - v.w / 2) / gx.cam.z + gx.cam.x, (sy - v.h / 2) / gx.cam.z + gx.cam.y]; }
function gxFit(quiet) {
  if (!gx.pos || !gx.pos.length) return; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < gx.pos.length; i += 2) { x0 = Math.min(x0, gx.pos[i]); x1 = Math.max(x1, gx.pos[i]); y0 = Math.min(y0, gx.pos[i + 1]); y1 = Math.max(y1, gx.pos[i + 1]); }
  const v = gxView(), z = Math.min(v.w / ((x1 - x0) || 1), v.h / ((y1 - y0) || 1)) * 0.88;
  const to = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.max(0.02, Math.min(6, z)) };
  if (quiet) gx.cam = to; else gxFly(to);
}
function gxFly(to, ms) {                                              // eases the camera there
  const from = Object.assign({}, gx.cam), t0 = performance.now(), dur = ms || 650;
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, lz = Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * e;
    gx.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: Math.exp(lz) }; gxDraw();
    if (t < 1 && gx.open) setTimeout(step, 16);
  };
  step();
}
function gxFlyTo(i, z) { if (i < 0 || !gx.pos) return; gxFly({ x: gx.pos[2 * i], y: gx.pos[2 * i + 1], z: Math.max(gx.cam.z, z || 2.2) }); }
function gxResize() {
  const c = gxEl('gxCanvas'); if (!c) return; const d = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
}

// ----- drawing -----
function gxLit(i) {                                                   // dimmed by the decade picked or the words typed
  const it = gx.items[i];
  if (gx.decade) { const y = gxYear(it); if (!y || String(Math.floor(y / 10) * 10) !== gx.decade) return false; }
  if (gx.find) { const q = gx.find; if (!(gxNorm(it.title).includes(q) || gxNorm(it.artist).includes(q) || gxNorm(it.genre).includes(q) || gxNorm(it.genre2).includes(q))) return false; }
  return true;
}
function gxRadius(i) { const it = gx.items[i], v = Number(it.rymVotes) || 0; return 1.5 + Math.min(3.2, Math.log10(1 + v) * 0.9) + ((Number(it.rating) || 0) >= 4.5 ? 0.8 : 0); }
function gxLabels() {                                                 // a name for each big family, at the middle of its stars
  const sum = new Map();
  gx.fams.fam.forEach((f, i) => { const s = sum.get(f) || { x: 0, y: 0, n: 0 }; s.x += gx.pos[2 * i]; s.y += gx.pos[2 * i + 1]; s.n++; sum.set(f, s); });
  gx.labels = gx.fams.order.slice(0, 18).filter(f => sum.get(f).n >= Math.max(3, gx.items.length * 0.008)).map(f => { const s = sum.get(f); return { f, x: s.x / s.n, y: s.y / s.n, n: s.n }; });
}
function gxDraw() {
  if (!gx.open) return; const c = gxEl('gxCanvas'); if (!c) return; gxResize();
  const ctx = c.getContext('2d'), d = window.devicePixelRatio || 1, v = gxView(), z = gx.cam.z;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const bg = ctx.createRadialGradient(v.w * 0.5, v.h * 0.45, 0, v.w * 0.5, v.h * 0.5, Math.max(v.w, v.h) * 0.75); bg.addColorStop(0, '#161C27'); bg.addColorStop(1, '#07090D');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, v.w, v.h);
  if (!gx.stars) { const r = gxRand(7); gx.stars = Array.from({ length: 260 }, () => [r(), r(), r() * 0.9 + 0.2, r()]); }
  gx.stars.forEach(([x, y, s, k]) => { const px = ((x * v.w * 1.3 - gx.cam.x * 0.03 * k) % v.w + v.w) % v.w, py = ((y * v.h * 1.3 - gx.cam.y * 0.03 * k) % v.h + v.h) % v.h; ctx.fillStyle = `rgba(200,210,235,${0.08 + k * 0.18})`; ctx.fillRect(px, py, s, s); });
  if (!gx.pos || !gx.graph) return;
  const N = gx.items.length, sx = new Float32Array(N), sy = new Float32Array(N), lit = new Uint8Array(N), m = 40;
  for (let i = 0; i < N; i++) { const p = gxToScreen(i); sx[i] = p[0]; sy[i] = p[1]; lit[i] = gxLit(i) ? 1 : 0; }
  const on = (i) => sx[i] > -m && sx[i] < v.w + m && sy[i] > -m && sy[i] < v.h + m;
  // links: faint, and only once you are close enough to tell them apart
  const focus = gx.sel >= 0 ? gx.sel : gx.hover;
  if (z * GX_LEN > 14) {
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(170,185,215,${Math.min(0.13, (z * GX_LEN - 14) / 300)})`; ctx.beginPath();
    gx.graph.nbr.forEach((l, i) => { if (!on(i)) return; l.forEach(({ j }) => { if (j > i) { ctx.moveTo(sx[i], sy[i]); ctx.lineTo(sx[j], sy[j]); } }); }); ctx.stroke();
  }
  if (focus >= 0) { gx.graph.nbr[focus].forEach(({ j, s }) => { ctx.strokeStyle = `rgba(240,194,106,${0.15 + s * 0.6})`; ctx.lineWidth = 0.6 + s * 2; ctx.beginPath(); ctx.moveTo(sx[focus], sy[focus]); ctx.lineTo(sx[j], sy[j]); ctx.stroke(); }); }
  // stars
  const sc = Math.max(0.55, Math.min(2.4, Math.sqrt(z) * 1.1)), bold = typeof rymReleaseIsBold === 'function';
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
    if (lit[i] !== pass || !on(i)) continue;                          // the dimmed ones first, so the lit ones sit on top
    const r = gxRadius(i) * sc; ctx.globalAlpha = pass ? 0.95 : 0.13; ctx.fillStyle = gxColor(i);
    if (r < 1.6) ctx.fillRect(sx[i] - r, sy[i] - r, r * 2, r * 2); else { ctx.beginPath(); ctx.arc(sx[i], sy[i], r, 0, Math.PI * 2); ctx.fill(); }
    if (pass && bold && rymReleaseIsBold(gx.items[i])) { ctx.globalAlpha = 0.55; ctx.strokeStyle = '#F0C26A'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx[i], sy[i], r + 2.2, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  // the wormhole: a glowing line with a light running along it
  if (gx.path.length > 1) {
    ctx.save(); ctx.shadowColor = '#F0C26A'; ctx.shadowBlur = 14; ctx.strokeStyle = 'rgba(240,194,106,0.9)'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath(); gx.path.forEach((i, k) => (k ? ctx.lineTo(sx[i], sy[i]) : ctx.moveTo(sx[i], sy[i]))); ctx.stroke();
    const t = (performance.now() % 4000) / 4000 * (gx.path.length - 1), k = Math.floor(t), f = t - k, a = gx.path[k], b = gx.path[Math.min(k + 1, gx.path.length - 1)];
    ctx.fillStyle = '#FFF4D6'; ctx.shadowBlur = 22; ctx.beginPath(); ctx.arc(sx[a] + (sx[b] - sx[a]) * f, sy[a] + (sy[b] - sy[a]) * f, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    gx.path.forEach((i, k) => { ctx.fillStyle = '#12161C'; ctx.strokeStyle = '#F0C26A'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx[i], sy[i], k === 0 || k === gx.path.length - 1 ? 6 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    if (!gx.anim) { const loop = () => { gx.anim = 0; if (gx.open && gx.path.length > 1) { gxDraw(); } }; gx.anim = requestAnimationFrame(loop); }
  }
  [gx.from, gx.to].forEach((i, k) => { if (i < 0 || gx.path.length > 1) return; ctx.strokeStyle = k ? '#7FD1B9' : '#F0C26A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx[i], sy[i], 8, 0, Math.PI * 2); ctx.stroke(); });
  [gx.sel, gx.hover].forEach((i, k) => { if (i < 0) return; ctx.strokeStyle = k ? 'rgba(255,255,255,0.6)' : '#FFFFFF'; ctx.lineWidth = k ? 1 : 2; ctx.beginPath(); ctx.arc(sx[i], sy[i], gxRadius(i) * sc + 4, 0, Math.PI * 2); ctx.stroke(); });
  // names: the families from afar; release titles once you are close
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (gx.labels && z * GX_LEN < 60) gx.labels.forEach(L => {
    const x = (L.x - gx.cam.x) * z + v.w / 2, y = (L.y - gx.cam.y) * z + v.h / 2, fs = Math.max(11, Math.min(22, 9 + Math.sqrt(L.n) * 0.9));
    ctx.font = `${fs}px 'Bebas Neue', Inter, sans-serif`; ctx.fillStyle = gx.color === 'family' ? `hsla(${gxHue(L.f)},70%,78%,0.85)` : 'rgba(237,231,220,0.75)';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText(L.f.toUpperCase(), x, y); ctx.shadowBlur = 0;
  });
  if (z * GX_LEN > 70) {
    ctx.font = "11px Inter, sans-serif"; ctx.fillStyle = 'rgba(237,231,220,0.8)'; let n = 0;
    for (let i = 0; i < N && n < 140; i++) { if (!lit[i] || sx[i] < 0 || sx[i] > v.w || sy[i] < 0 || sy[i] > v.h) continue; ctx.fillText(gx.items[i].title.length > 26 ? gx.items[i].title.slice(0, 25) + '…' : gx.items[i].title, sx[i], sy[i] + gxRadius(i) * sc + 9); n++; }
  }
}

// ----- finding the star under the pointer -----
function gxNearest(px, py, maxPx) {
  if (!gx.pos) return -1; let best = -1, bd = (maxPx || 14) ** 2;
  for (let i = 0; i < gx.items.length; i++) { const [x, y] = gxToScreen(i), d = (x - px) ** 2 + (y - py) ** 2; if (d < bd && (gxLit(i) || !gx.find)) { bd = d; best = i; } }
  return best;
}
function gxTip(i, px, py) {
  const t = gxEl('gxTip'); if (!t) return;
  if (i < 0) { t.hidden = true; return; }
  const it = gx.items[i], y = gxYear(it);
  t.innerHTML = `<b>${escapeHtml(it.title)}</b><span>${escapeHtml(it.artist)}${y ? ' · ' + y : ''}</span><em>${escapeHtml([it.genre, it.genre2].filter(Boolean).join(' · ') || 'No genre')}</em>`;
  t.hidden = false; const v = gxView(); t.style.left = Math.min(px + 14, v.w - 240) + 'px'; t.style.top = Math.min(py + 14, v.h - 70) + 'px';
}

// ----- the side panel: the star you picked, and the wormhole -----
function gxCover(it) { return it.cover || (state.artCache[artKey(it)] || {}).art || placeholderArt(it); }
function gxRow(i, extra) { const it = gx.items[i]; return `<button type="button" class="gx-row" data-gx-go="${i}"><img src="${escapeHtml(gxCover(it))}" alt="" loading="lazy"><span><b>${escapeHtml(it.title)}</b><i>${escapeHtml(it.artist)}</i></span>${extra || ''}</button>`; }
function gxRenderSide() {
  const side = gxEl('gxSide'), sub = gxEl('gxSub'); if (!side) return;
  if (sub) sub.textContent = gx.graph ? `${gx.items.length.toLocaleString()} releases · ${Math.round(gx.graph.edges).toLocaleString()} links${gx.fams ? ` · ${gx.fams.order.length} families` : ''}` : 'Reading your crate…';
  let h = '';
  if (gx.sel >= 0) {
    const it = gx.items[gx.sel], y = gxYear(it), nb = gx.graph.nbr[gx.sel].slice(0, 7);
    h += `<div class="gx-card"><img src="${escapeHtml(gxCover(it))}" alt=""><div><b>${escapeHtml(it.title)}</b><i>${escapeHtml(it.artist)}${y ? ' · ' + y : ''}</i><em>${escapeHtml([it.genre, it.genre2].filter(Boolean).join(' · '))}</em></div></div>
      <div class="gx-acts"><button type="button" class="chip-btn" data-gx="open">Open</button><button type="button" class="chip-btn" data-gx="play">Play</button><button type="button" class="chip-btn" data-gx="from">Wormhole from here</button><button type="button" class="chip-btn" data-gx="to"${gx.from < 0 || gx.from === gx.sel ? ' disabled' : ''}>…to here</button></div>
      <div class="gx-h">Nearest stars</div>${nb.map(({ j, s }) => gxRow(j, `<em class="gx-sim">${Math.round(s * 100)}%</em>`)).join('') || '<p class="gx-dim">Nothing close: this one is out on its own.</p>'}`;
  } else h += `<p class="gx-dim">Every release is a star, placed near what it shares the most with: genres and their parents in your taxonomy, descriptors, scene, label, artist and decade. Rare things in common pull harder than common ones.</p><p class="gx-dim">Click a star to see its neighbours. Pick two to open a <b>wormhole</b>: the smoothest chain of releases from one to the other, to play in order.</p><p class="gx-dim">Drag to move, scroll or pinch to zoom.</p>`;
  if (gx.from >= 0) {
    h += `<div class="gx-h gx-wh">Wormhole</div>`;
    if (gx.path.length > 1) h += `<p class="gx-dim">${gx.path.length} releases, ${gx.path.length - 1} steps.</p><div class="gx-acts"><button type="button" class="chip-btn gx-primary" data-gx="playpath">Play the wormhole</button><button type="button" class="chip-btn" data-gx="clear">Clear</button></div>${gx.path.map((i, k) => gxRow(i, `<em class="gx-sim">${k + 1}</em>`)).join('')}`;
    else if (gx.to >= 0) h += `<p class="gx-dim">No chain joins these two: they share nothing, even through other releases.</p><div class="gx-acts"><button type="button" class="chip-btn" data-gx="clear">Clear</button></div>`;
    else h += `<p class="gx-dim">From <b>${escapeHtml(gx.items[gx.from].title)}</b>. Now pick another star and choose "…to here".</p><div class="gx-acts"><button type="button" class="chip-btn" data-gx="clear">Clear</button></div>`;
  }
  side.innerHTML = h;
}
function gxSelect(i, fly) { gx.sel = i; gxRenderSide(); if (fly && i >= 0) gxFlyTo(i); else gxDraw(); }
function gxAct(kind) {
  const it = gx.items[gx.sel];
  if (kind === 'open' && it) { closeGalaxy(); openDeck(it); }
  else if (kind === 'play' && it) { flashGlobalToast(`Playing “${it.title}”`); playAlbumReplacingQueue(it); }
  else if (kind === 'from' && gx.sel >= 0) { gx.from = gx.sel; gx.to = -1; gx.path = []; gxRenderSide(); gxDraw(); }
  else if (kind === 'to' && gx.sel >= 0 && gx.from >= 0) {
    gx.to = gx.sel; gx.path = gxPath(gx.graph, gx.from, gx.to); gxRenderSide();
    if (gx.path.length > 1) {                                         // frame the whole chain
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; gx.path.forEach(i => { x0 = Math.min(x0, gx.pos[2 * i]); x1 = Math.max(x1, gx.pos[2 * i]); y0 = Math.min(y0, gx.pos[2 * i + 1]); y1 = Math.max(y1, gx.pos[2 * i + 1]); });
      const v = gxView(); gxFly({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.max(0.05, Math.min(4, Math.min(v.w / ((x1 - x0) || 1), v.h / ((y1 - y0) || 1)) * 0.7)) }, 900);
    } else gxDraw();
  }
  else if (kind === 'playpath' && gx.path.length > 1) { const list = gx.path.map(i => gx.items[i]); flashGlobalToast(`Playing the wormhole: ${list.length} releases, from “${list[0].title}” to “${list[list.length - 1].title}”`); playAlbumsReplacingQueue(list); }
  else if (kind === 'clear') { gx.from = gx.to = -1; gx.path = []; gxRenderSide(); gxDraw(); }
  else if (kind === 'fit') gxFit();
  else if (kind === 'random' && gx.items.length) { const pool = gx.items.map((x, i) => i).filter(gxLit); const i = pool[Math.floor(Math.random() * pool.length)]; if (i != null) gxSelect(i, true); }
}
function gxFindGo() {                                                 // Enter in the search box: fly to the best match
  if (!gx.find || !gx.pos) return; let best = -1, bs = -1;
  gx.items.forEach((it, i) => { const t = gxNorm(it.title), a = gxNorm(it.artist); const s = t === gx.find ? 5 : a === gx.find ? 4 : t.startsWith(gx.find) ? 3 : a.startsWith(gx.find) ? 2 : gxLit(i) ? 1 : 0; if (s > bs) { bs = s; best = i; } });
  if (best >= 0 && bs > 0) gxSelect(best, true);
}

// ----- wiring -----
(function wireGalaxy() {
  const ov = gxEl('gxOverlay'), c = gxEl('gxCanvas'); if (!ov || !c) return;
  const menu = gxEl('menuGalaxy'); if (menu) menu.addEventListener('click', () => { el.layoutMenu.hidden = true; openGalaxy(); });
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('#gxClose')) { closeGalaxy(); return; }
    const go = e.target.closest('[data-gx-go]'); if (go) { gxSelect(Number(go.dataset.gxGo), true); return; }
    const a = e.target.closest('[data-gx]'); if (a && !a.disabled) gxAct(a.dataset.gx);
  });
  ov.addEventListener('input', (e) => { if (e.target.id === 'gxFind') { gx.find = gxNorm(e.target.value); gxDraw(); } });
  ov.addEventListener('keydown', (e) => { if (e.target.id === 'gxFind' && e.key === 'Enter') { e.preventDefault(); gxFindGo(); } });
  ov.addEventListener('change', (e) => {
    if (e.target.id === 'gxColor') { gx.color = e.target.value; gxDraw(); }
    else if (e.target.id === 'gxDecade') { gx.decade = e.target.value; gxDraw(); }
    else if (e.target.id === 'gxOnlyShown') { gx.onlyShown = e.target.checked; gx.key = ''; openGalaxy(); }
  });
  const pt = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); gx.pointers.set(e.pointerId, pt(e)); if (gx.pointers.size === 1) { const [x, y] = pt(e); gx.drag = { x, y, cx: gx.cam.x, cy: gx.cam.y, moved: false }; } else gx.drag = null; });
  c.addEventListener('pointermove', (e) => {
    const p = pt(e);
    if (gx.pointers.size === 2 && gx.pointers.has(e.pointerId)) {    // pinch
      const [a, b] = [...gx.pointers.values()], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); gx.pointers.set(e.pointerId, p);
      const [a2, b2] = [...gx.pointers.values()], d1 = Math.hypot(a2[0] - b2[0], a2[1] - b2[1]); if (d0 > 0) gxZoomAt((a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2, d1 / d0); return;
    }
    if (gx.pointers.has(e.pointerId)) gx.pointers.set(e.pointerId, p);
    if (gx.drag) { const dx = p[0] - gx.drag.x, dy = p[1] - gx.drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) gx.drag.moved = true; gx.cam.x = gx.drag.cx - dx / gx.cam.z; gx.cam.y = gx.drag.cy - dy / gx.cam.z; gxTip(-1); gxDraw(); return; }
    const i = gxNearest(p[0], p[1]); if (i !== gx.hover) { gx.hover = i; gxDraw(); } gxTip(i, p[0], p[1]); c.style.cursor = i >= 0 ? 'pointer' : 'grab';
  });
  const up = (e) => { const d = gx.drag; gx.pointers.delete(e.pointerId); gx.drag = null; if (d && !d.moved && e.type === 'pointerup') { const [x, y] = pt(e); gxSelect(gxNearest(x, y)); } };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('pointerleave', () => { if (!gx.drag) { gx.hover = -1; gxTip(-1); gxDraw(); } });
  c.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = pt(e); gxZoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  c.addEventListener('dblclick', (e) => { const [x, y] = pt(e), i = gxNearest(x, y); if (i >= 0) { gxSelect(i); gxAct('open'); } });
  window.addEventListener('resize', () => { if (gx.open) gxDraw(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && gx.open) { e.stopPropagation(); closeGalaxy(); } }, true);
})();
function gxZoomAt(px, py, f) { const [wx, wy] = gxToWorld(px, py); gx.cam.z = Math.max(0.02, Math.min(12, gx.cam.z * f)); const [wx2, wy2] = gxToWorld(px, py); gx.cam.x += wx - wx2; gx.cam.y += wy - wy2; gxDraw(); }
