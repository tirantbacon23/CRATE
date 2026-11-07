// ---- Taste Engine: learns how YOU rate from the releases you have rated, and predicts the rest. Each release is described by what it is made
// of (the same things Crate Galaxy uses: genres and their taxonomy parents, descriptors, scene, movement, label, artist, decade) plus its RYM
// rating and how many people rated it. A ridge regression over those (solved by conjugate gradients, so thousands of features cost little)
// gives each a weight: how much it moves your rating. How strongly to hold the weights back is chosen by 5-fold cross-validation, and the
// same held-out predictions say honestly how good the model is (against guessing your average, and against going by the RYM rating alone).
// Sixteen models fitted to resamples of your ratings (a bootstrap) say how SURE each prediction is: "Listen next" can lean on that to find
// discoveries, and "Teach it" asks you to rate the releases it is least sure of, which teach it the most. Nothing is saved but the ratings you give. ----
const TE_LAMBDAS = [0.5, 1, 2, 4, 8, 16, 32, 64, 128];
const TE_FOLDS = 5, TE_BOOT = 16, TE_MIN = 15;
const te = { open: false, tab: 'next', model: null, busy: false, kappa: 0.6, why: new Set(), timer: 0, rated: 0, msg: '' };

// ----- features -----
const teRated = (it) => Number(it.rating) > 0;
function teRaw(it, tax) {                                             // { name: value } — tokens scaled so a first genre is 1
  const out = {}, t = gxTokens(it, tax);
  Object.entries(t).forEach(([k, w]) => { out[k] = w / 3; });
  const r = Number(it.rymRating) || 0, v = Number(it.rymVotes) || 0;
  if (r > 0) out['n:rym'] = r - 3.3; else out['n:norym'] = 1;
  out['n:votes'] = Math.log10(1 + v) / 2 - 1;
  return out;
}
// -> { cols: Map name->index (0 is the intercept), names: [], pen: Float64Array, row(it) -> { c: Int32Array, v: Float64Array } }
function teSpace(items, tax) {
  const support = new Map(), raws = new Map();
  items.forEach(it => { const r = teRaw(it, tax); raws.set(it, r); if (teRated(it)) Object.keys(r).forEach(k => support.set(k, (support.get(k) || 0) + 1)); });
  const names = ['(baseline)'], cols = new Map();
  [...support].filter(([k, n]) => n >= 2 || k.startsWith('n:')).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).forEach(([k]) => { cols.set(k, names.length); names.push(k); });
  const pen = new Float64Array(names.length).fill(1); pen[0] = 1e-6;          // the baseline is not held back
  const row = (it) => {
    const r = raws.get(it) || teRaw(it, tax), c = [0], v = [1];
    Object.entries(r).forEach(([k, x]) => { const j = cols.get(k); if (j != null && x) { c.push(j); v.push(x); } });
    return { c: Int32Array.from(c), v: Float64Array.from(v) };
  };
  return { cols, names, pen, support, row };
}

// ----- ridge regression by conjugate gradients: (XᵀX + λ·P) w = Xᵀy, never forming XᵀX -----
function teFit(X, y, lam, pen, p, w0) {
  const n = X.length, Av = (v, out) => {
    out.fill(0);
    for (let i = 0; i < n; i++) { const r = X[i]; let s = 0; for (let k = 0; k < r.c.length; k++) s += r.v[k] * v[r.c[k]]; for (let k = 0; k < r.c.length; k++) out[r.c[k]] += r.v[k] * s; }
    for (let j = 0; j < p; j++) out[j] += lam * pen[j] * v[j];
    return out;
  };
  const b = new Float64Array(p); for (let i = 0; i < n; i++) { const r = X[i]; for (let k = 0; k < r.c.length; k++) b[r.c[k]] += r.v[k] * y[i]; }
  const w = w0 ? Float64Array.from(w0) : new Float64Array(p), Ap = new Float64Array(p), res = new Float64Array(p);
  Av(w, Ap); for (let j = 0; j < p; j++) res[j] = b[j] - Ap[j];
  const d = Float64Array.from(res); let rr = 0; for (let j = 0; j < p; j++) rr += res[j] * res[j];
  const stop = 1e-10 * Math.max(1, b.reduce((s, x) => s + x * x, 0));
  for (let it = 0; it < 300 && rr > stop; it++) {
    Av(d, Ap); let dAd = 0; for (let j = 0; j < p; j++) dAd += d[j] * Ap[j]; if (!(dAd > 0)) break;
    const a = rr / dAd; let rr2 = 0;
    for (let j = 0; j < p; j++) { w[j] += a * d[j]; res[j] -= a * Ap[j]; rr2 += res[j] * res[j]; }
    const beta = rr2 / rr; rr = rr2; for (let j = 0; j < p; j++) d[j] = res[j] + beta * d[j];
  }
  return w;
}
const tePredRow = (r, w) => { let s = 0; for (let k = 0; k < r.c.length; k++) s += r.v[k] * w[r.c[k]]; return s; };
const teClamp = (x) => Math.max(0.5, Math.min(5, x));
function teCorr(a, b) {
  const n = a.length; if (n < 3) return 0; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return sa && sb ? sab / Math.sqrt(sa * sb) : 0;
}

// ----- the whole model: cross-validated λ, honest scores, a bootstrap for how sure, weights to explain -----
function teTrain(items, tax, opts) {
  opts = opts || {};
  const rated = items.filter(teRated); if (rated.length < (opts.min || TE_MIN)) return { tooFew: true, rated: rated.length };
  const S = teSpace(items, tax), p = S.names.length, X = rated.map(S.row), y = Float64Array.from(rated, it => Number(it.rating));
  const fold = rated.map(it => gxHash('f' + it.row + '|' + it.artist + '|' + it.title) % TE_FOLDS);
  const lambdas = opts.lambdas || TE_LAMBDAS; let best = null;
  lambdas.forEach(lam => {
    const oof = new Float64Array(rated.length), oMean = new Float64Array(rated.length), oRym = new Float64Array(rated.length); let w0 = null;
    for (let f = 0; f < TE_FOLDS; f++) {
      const tr = [], te_ = []; fold.forEach((q, i) => (q === f ? te_ : tr).push(i)); if (!te_.length || tr.length < 3) continue;
      const w = teFit(tr.map(i => X[i]), Float64Array.from(tr, i => y[i]), lam, S.pen, p, w0); w0 = w;
      const mean = tr.reduce((s, i) => s + y[i], 0) / tr.length;
      const withR = tr.filter(i => Number(rated[i].rymRating) > 0), rx = withR.map(i => Number(rated[i].rymRating)), ry = withR.map(i => y[i]);          // the RYM-only guess: a straight line through your ratings against RYM's
      let ra = mean, rb = 0; if (rx.length >= 3) { const mx = rx.reduce((s, x) => s + x, 0) / rx.length, my = ry.reduce((s, x) => s + x, 0) / ry.length; let sxy = 0, sxx = 0; rx.forEach((x, k) => { sxy += (x - mx) * (ry[k] - my); sxx += (x - mx) ** 2; }); rb = sxx ? sxy / sxx : 0; ra = my - rb * mx; }
      te_.forEach(i => { oof[i] = teClamp(tePredRow(X[i], w)); oMean[i] = mean; const r = Number(rated[i].rymRating); oRym[i] = r > 0 ? teClamp(ra + rb * r) : mean; });
    }
    const mae = (a) => a.reduce((s, x, i) => s + Math.abs(x - y[i]), 0) / y.length;
    const cand = { lam, oof, mae: mae(oof), maeMean: mae(oMean), maeRym: mae(oRym), corr: teCorr(oof, y) };
    if (!best || cand.mae < best.mae - 1e-9) best = cand;
  });
  const w = teFit(X, y, best.lam, S.pen, p);
  const rnd = gxRand(gxHash('boot' + rated.length)), boots = [];
  for (let b = 0; b < (opts.boot || TE_BOOT); b++) {
    const idx = Array.from({ length: rated.length }, () => Math.floor(rnd() * rated.length));
    boots.push(teFit(idx.map(i => X[i]), Float64Array.from(idx, i => y[i]), best.lam, S.pen, p, w));
  }
  const pred = new Map();                                             // every release: { mean, sd, full }
  items.forEach(it => {
    const r = S.row(it), full = tePredRow(r, w), bs = boots.map(bw => tePredRow(r, bw)), m = bs.length ? bs.reduce((s, x) => s + x, 0) / bs.length : full;
    const sd = bs.length > 1 ? Math.sqrt(bs.reduce((s, x) => s + (x - m) ** 2, 0) / (bs.length - 1)) : 0;
    pred.set(it, { mean: teClamp(full), sd, row: r });
  });
  return { S, w, lam: best.lam, cv: best, rated, y, pred, boots: boots.length, mean: y.reduce((s, x) => s + x, 0) / y.length };
}
// What moved one prediction: each feature's weight times its value, biggest first (the baseline left out)
function teWhy(model, it, n) {
  const p = model.pred.get(it); if (!p) return [];
  const out = []; for (let k = 0; k < p.row.c.length; k++) { const j = p.row.c[k]; if (j === 0) continue; const x = model.w[j] * p.row.v[k]; if (Math.abs(x) >= 0.01) out.push({ name: model.S.names[j], x }); }
  return out.sort((a, b) => Math.abs(b.x) - Math.abs(a.x)).slice(0, n || 5);
}
function teLabel(name) {                                              // 'g:shoegaze' -> ['Genre', 'Shoegaze']
  const kind = { g: 'Genre', d: 'Descriptor', s: 'Scene', l: 'Label', a: 'Artist', y: 'Decade' }[name[0]];
  if (name === 'n:rym') return ['RYM', 'RYM rating']; if (name === 'n:norym') return ['RYM', 'No RYM rating']; if (name === 'n:votes') return ['RYM', 'How many rated it on RYM'];
  const v = name.slice(2); return [kind || '', name[0] === 'y' ? v + 's' : v.replace(/\b\w/g, c => c.toUpperCase())];
}
// The picks: by predicted rating, plus a share of how unsure it is (κ: 0 safe, higher adventurous), each one less like those already picked
function tePicks(model, pool, kappa, n, mu) {
  const cand = pool.map(it => { const p = model.pred.get(it); return { it, p, s: p.mean + kappa * p.sd }; }).sort((a, b) => b.s - a.s).slice(0, Math.max(n * 8, 60));
  const unit = (r) => { let s = 0; for (let k = 1; k < r.v.length; k++) s += r.v[k] * r.v[k]; return Math.sqrt(s) || 1; };
  const sim = (a, b) => { const m = new Map(); for (let k = 1; k < a.c.length; k++) m.set(a.c[k], a.v[k]); let s = 0; for (let k = 1; k < b.c.length; k++) { const x = m.get(b.c[k]); if (x) s += x * b.v[k]; } return s / (unit(a) * unit(b)); };
  const out = [], muv = mu == null ? 0.9 : mu;
  while (out.length < n && cand.length) {
    let bi = 0, bs = -Infinity;
    cand.forEach((c, i) => { const near = out.reduce((m, o) => Math.max(m, sim(c.p.row, o.p.row)), 0), v = c.s - muv * near; if (v > bs) { bs = v; bi = i; } });
    out.push(cand.splice(bi, 1)[0]);
  }
  return out;
}

// ----- the window -----
function teEl(id) { return document.getElementById(id); }
function openTaste() { te.open = true; teEl('teOverlay').hidden = false; teRender(); if (!te.model || te.rated !== state.raw.filter(teRated).length) teRetrain(0); }
function closeTaste() { te.open = false; const ov = teEl('teOverlay'); if (ov) ov.hidden = true; }
function teRetrain(ms) {
  clearTimeout(te.timer); te.busy = true; teRender();
  te.timer = setTimeout(() => {
    const t0 = performance.now();
    try { te.model = teTrain(state.raw.filter(x => x && x.title), state.genreTaxonomy); } catch (e) { console.warn('Taste Engine failed', e); te.model = { error: String(e && e.message || e) }; }
    te.ms = Math.round(performance.now() - t0); te.rated = state.raw.filter(teRated).length; te.busy = false; teRender();
  }, ms == null ? 400 : ms);
}
const teStars = (x) => `<span class="te-pred" title="${x.toFixed(2)} of 5">${x.toFixed(1)}<i>★</i></span>`;
function teItemRow(it, extra, opts) {
  const m = te.model, p = m.pred.get(it), k = artKey(it), y = gxYear(it), open = te.why.has(k);
  const why = open ? `<div class="te-why">${teWhy(m, it, 6).map(w => { const [kind, name] = teLabel(w.name); return `<span class="${w.x > 0 ? 'te-up' : 'te-down'}">${w.x > 0 ? '+' : '−'}${Math.abs(w.x).toFixed(2)} <b>${escapeHtml(name)}</b> <em>${kind}</em></span>`; }).join('') || '<span class="te-dim">Nothing it knows of moves this one: it is your average.</span>'}</div>` : '';
  return `<div class="te-row" data-te-key="${escapeHtml(k)}"><img src="${escapeHtml(gxCover(it))}" alt="" loading="lazy"><div class="te-main"><button type="button" class="te-name" data-te-open="${escapeHtml(k)}"><b>${escapeHtml(it.title)}</b><i>${escapeHtml(it.artist)}${y ? ' · ' + y : ''}</i></button>${why}</div>
    <div class="te-side">${extra || ''}${opts && opts.noPred ? '' : `${teStars(p.mean)}<span class="te-sd" title="How unsure it is (±)">±${p.sd.toFixed(2)}</span>`}<button type="button" class="chip-btn bm-sm" data-te-why="${escapeHtml(k)}">${open ? 'Hide' : 'Why'}</button>${opts && opts.rate ? `<span class="te-rate" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-te-rate="${n}" data-te-k="${escapeHtml(k)}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</span>` : ''}</div></div>`;
}
function teCalib(m) {                                                 // held-out predictions against what you gave
  const W = 260, H = 200, pad = 26, sx = (x) => pad + (x - 0.5) / 4.5 * (W - pad - 8), sy = (v) => H - pad - (v - 0.5) / 4.5 * (H - pad - 8), r = gxRand(3);
  const dots = m.rated.map((it, i) => `<circle cx="${sx(m.cv.oof[i]).toFixed(1)}" cy="${(sy(m.y[i]) + (r() - 0.5) * 8).toFixed(1)}" r="2.2"/>`).join('');
  const ax = [1, 2, 3, 4, 5].map(v => `<text x="${sx(v)}" y="${H - 8}">${v}</text><text x="10" y="${sy(v) + 3}">${v}</text>`).join('');
  return `<svg class="te-calib" viewBox="0 0 ${W} ${H}" role="img" aria-label="Predicted against your rating"><line x1="${sx(0.5)}" y1="${sy(0.5)}" x2="${sx(5)}" y2="${sy(5)}"/>${dots}${ax}</svg>`;
}
function teRender() {
  const body = teEl('teBody'), sub = teEl('teSub'); if (!body || !te.open) return;
  document.querySelectorAll('[data-te-tab]').forEach(b => b.classList.toggle('active', b.dataset.teTab === te.tab));
  const m = te.model;
  if (te.busy && !m) { body.innerHTML = '<p class="te-dim te-pad">Learning your taste…</p>'; if (sub) sub.textContent = ''; return; }
  if (!m) { body.innerHTML = ''; return; }
  if (m.error) { body.innerHTML = `<p class="te-dim te-pad">Something went wrong: ${escapeHtml(m.error)}</p>`; return; }
  if (m.tooFew) { body.innerHTML = `<p class="te-dim te-pad">Rate at least ${TE_MIN} releases (you have ${m.rated}) and it can start to learn what you like.</p>`; if (sub) sub.textContent = ''; return; }
  if (sub) sub.textContent = `Learned from ${m.rated.length.toLocaleString()} ratings · ${(m.S.names.length - 1).toLocaleString()} things it weighs · typically ${m.cv.mae.toFixed(2)}★ off${te.busy ? ' · relearning…' : ''}`;
  const pool = state.raw.filter(it => it && it.title && !teRated(it));
  let h = m.cv.mae >= m.cv.maeMean * 0.98 ? `<p class="te-warn">It hasn’t found a pattern in your ratings yet: on releases it hadn’t seen, it did no better than guessing your average (${m.cv.maeMean.toFixed(2)}★ off). Take its picks as a shuffle, and rate more (Teach it) so it has more to go on.</p>` : '';
  if (te.tab === 'next') {
    const picks = tePicks(m, pool, te.kappa, 30);
    h += `<div class="te-bar"><label>Safe <input type="range" id="teKappa" min="0" max="2" step="0.1" value="${te.kappa}"> Adventurous</label><span class="te-dim">${te.kappa < 0.3 ? 'What it is surest you will love.' : te.kappa < 1.1 ? 'Likely loves, with some it is less sure of.' : 'Long shots: what it knows least about, and might be wrong about either way.'}</span><button type="button" class="chip-btn" data-te="play">Play these</button></div>`;
    h += picks.length ? picks.map(c => teItemRow(c.it)).join('') : '<p class="te-dim te-pad">Every release is rated. Nothing left to suggest.</p>';
  } else if (te.tab === 'teach') {
    const unsure = pool.map(it => ({ it, p: m.pred.get(it) })).sort((a, b) => b.p.sd - a.p.sd).slice(0, 60);          // one per artist, so it asks about twelve different things
    const pick = []; const seenA = new Set(); unsure.forEach(c => { if (pick.length < 12 && !seenA.has(c.it.artist)) { seenA.add(c.it.artist); pick.push(c); } });
    h += `<p class="te-dim te-pad">The releases it is least sure about. Each rating you give here teaches it the most it can learn from one, and it learns again straight away.${te.msg ? ` <b class="te-msg">${escapeHtml(te.msg)}</b>` : ''}</p>`;
    h += pick.map(c => teItemRow(c.it, '', { rate: true })).join('') || '<p class="te-dim te-pad">Nothing left to rate.</p>';
  } else if (te.tab === 'taste') {
    const sup = m.S.support, ws = [];
    m.S.names.forEach((n, j) => { if (j > 0 && !n.startsWith('n:') && (sup.get(n) || 0) >= 3) ws.push({ n, w: m.w[j], s: sup.get(n) }); });
    const mx = Math.max(0.01, ...ws.map(x => Math.abs(x.w)));
    const bars = (l, cls) => l.map(x => { const [kind, name] = teLabel(x.n); return `<div class="te-wrow"><span class="te-wname"><b>${escapeHtml(name)}</b><em>${kind} · ${x.s} rated</em></span><span class="te-wbar"><i class="${cls}" style="width:${(Math.abs(x.w) / mx * 100).toFixed(1)}%"></i></span><span class="te-wval">${x.w > 0 ? '+' : '−'}${Math.abs(x.w).toFixed(2)}</span></div>`; }).join('') || '<p class="te-dim">Nothing much.</p>';
    const rymW = m.w[m.S.cols.get('n:rym')] || 0;
    h += `<p class="te-dim te-pad">What moves your rating, all else being equal: each one's pull in stars. Your average is ${m.mean.toFixed(2)}★. A point higher on RYM moves you ${rymW >= 0 ? '+' : '−'}${Math.abs(rymW).toFixed(2)}★${Math.abs(rymW) < 0.15 ? ': you hardly go by the crowd' : rymW > 0.6 ? ': you agree with the crowd a lot' : ''}.</p>`;
    [['gs', 'Genres & scenes'], ['d', 'Descriptors'], ['l', 'Labels'], ['a', 'Artists'], ['y', 'Decades']].forEach(([k, title]) => {
      const l = ws.filter(x => k.includes(x.n[0])); if (!l.length) return;
      const up = l.filter(x => x.w > 0.02).sort((a, b) => b.w - a.w).slice(0, 6), dn = l.filter(x => x.w < -0.02).sort((a, b) => a.w - b.w).slice(0, 6); if (!up.length && !dn.length) return;
      h += `<div class="gx-h te-kind">${title}</div><div class="te-cols"><div>${bars(up, 'te-up')}</div><div>${bars(dn, 'te-down')}</div></div>`;
    });
  } else if (te.tab === 'surprise') {
    const res = m.rated.map((it, i) => ({ it, d: m.y[i] - m.cv.oof[i], pr: m.cv.oof[i] }));
    const up = res.filter(r => r.d > 0).sort((a, b) => b.d - a.d).slice(0, 10), dn = res.filter(r => r.d < 0).sort((a, b) => a.d - b.d).slice(0, 10);
    const row = (r) => teItemRow(r.it, `<span class="te-dim te-gap">guessed ${r.pr.toFixed(1)}, you gave ${Number(r.it.rating)}</span>`, { noPred: true });
    h += `<p class="te-dim te-pad">Where you surprised it: these were held out while it learned, so it had to guess them. They are where your taste is your own.</p><div class="gx-h te-pad">You liked more than it would guess</div>${up.map(row).join('')}<div class="gx-h te-pad">You liked less than it would guess</div>${dn.map(row).join('')}`;
  } else if (te.tab === 'how') {
    const pct = (a, b) => Math.round((1 - a / b) * 100);
    h += `<div class="te-how"><div><p class="te-dim">Every number here comes from releases held out while it learned (5-fold cross-validation), so it is how it does on releases it has not seen.</p>
      <table class="te-tbl"><tr><td>Typically off by</td><td><b>${m.cv.mae.toFixed(2)}★</b></td></tr><tr><td>Guessing your average every time</td><td>${m.cv.maeMean.toFixed(2)}★ <em>(${pct(m.cv.mae, m.cv.maeMean)}% better)</em></td></tr><tr><td>Going by the RYM rating alone</td><td>${m.cv.maeRym.toFixed(2)}★ <em>(${pct(m.cv.mae, m.cv.maeRym)}% ${m.cv.mae <= m.cv.maeRym ? 'better' : 'worse'})</em></td></tr><tr><td>How well it ranks (correlation)</td><td>${m.cv.corr.toFixed(2)}</td></tr><tr><td>Held back by (λ, chosen by the same test)</td><td>${m.lam}</td></tr><tr><td>Models in the bootstrap</td><td>${m.boots}</td></tr><tr><td>Learned in</td><td>${te.ms || 0} ms</td></tr></table></div>
      <div><div class="gx-h">Its guess (across) against your rating (up)</div>${teCalib(m)}<p class="te-dim">On the line is a perfect guess. A cloud flatter than the line means it plays safe towards your average.</p></div></div>`;
  }
  body.innerHTML = h;
}
async function teRate(k, n) {
  const it = state.raw.find(x => artKey(x) === k); if (!it) return;
  const was = te.model && te.model.pred.get(it); it.rating = n;
  te.msg = was ? `“${it.title}”: it guessed ${was.mean.toFixed(1)}, you gave ${n}.` : '';
  try { await postUpdate({ row: it.row, rating: n }); } catch (e) { te.msg = 'Couldn’t save that rating — try again.'; it.rating = 0; }
  if (typeof rymRefreshViews === 'function') rymRefreshViews();
  teRetrain(150);
}
(function wireTaste() {
  const ov = teEl('teOverlay'); if (!ov) return;
  const menu = teEl('menuTaste'); if (menu) menu.addEventListener('click', () => { el.layoutMenu.hidden = true; openTaste(); });
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('#teClose')) { closeTaste(); return; }
    const tab = e.target.closest('[data-te-tab]'); if (tab) { te.tab = tab.dataset.teTab; teRender(); return; }
    const why = e.target.closest('[data-te-why]'); if (why) { const k = why.dataset.teWhy; if (te.why.has(k)) te.why.delete(k); else te.why.add(k); teRender(); return; }
    const rate = e.target.closest('[data-te-rate]'); if (rate) { teRate(rate.dataset.teK, Number(rate.dataset.teRate)); return; }
    const op = e.target.closest('[data-te-open]'); if (op) { const it = state.raw.find(x => artKey(x) === op.dataset.teOpen); if (it) { closeTaste(); openDeck(it); } return; }
    const a = e.target.closest('[data-te]');
    if (a && a.dataset.te === 'play' && te.model && te.model.pred) { const list = tePicks(te.model, state.raw.filter(it => it && it.title && !teRated(it)), te.kappa, 30).map(c => c.it); if (list.length) { flashGlobalToast(`Playing ${list.length} picks from the Taste Engine`); playAlbumsReplacingQueue(list); } }
  });
  ov.addEventListener('input', (e) => { if (e.target.id === 'teKappa') { te.kappa = Number(e.target.value); clearTimeout(te.kt); te.kt = setTimeout(() => { const f = document.activeElement === e.target; teRender(); if (f) { const k = teEl('teKappa'); if (k) k.focus(); } }, 120); } });
  ov.addEventListener('mouseover', (e) => { const r = e.target.closest('.te-rate button'); if (!r) return; const n = Number(r.dataset.teRate); r.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.teRate) <= n)); });
  ov.addEventListener('mouseout', (e) => { const g = e.target.closest('.te-rate'); if (g && !g.contains(e.relatedTarget)) g.querySelectorAll('button').forEach(b => b.classList.remove('on')); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && te.open) { e.stopPropagation(); closeTaste(); } }, true);
})();
