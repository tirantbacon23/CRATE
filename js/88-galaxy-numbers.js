// (1.135.143) Crate Galaxy · Influence: the numbers. A third view beside Thread and Story, all worked out from the influence links:
//  - each family's pull, year by year: of the links each year's releases draw along, the share going back to each family (hover for a year)
//  - most influential: releases, artists or labels, by how many later releases in your crate lean on them
//  - bridges (releases whose followers are mostly in other families), lines started, orphans (nothing earlier they draw on: gaps to
//    fill), dead ends (subgenres that stop), and you against the crate (influential here, but you've logged no listen and have no plays)
//  - a row of totals: links, strength, starting points, the longest line, how old a release is when drawn on, how often a link crosses families
// Click a release to follow its thread; a family or subgenre to read its story.

const gn = { open: false, board: 'rel', data: null, key: '' };
function gnEl(id) { return document.getElementById(id); }

function gnBuild() {
  const I = gxInfluence(), N = gx.items.length, F = gx.fams, yr = I.yr, year = (i) => Math.floor(yr[i]);
  const dated = []; for (let i = 0; i < N; i++) if (yr[i]) dated.push(i);
  dated.sort((a, b) => yr[a] - yr[b]);
  // the families' pull, year by year (three-year window)
  const famTot = new Map(); let linkN = 0, linkS = 0, cross = 0; const ages = [];
  dated.forEach(i => I.par[i].forEach(({ j, s }) => { famTot.set(F.fam[j], (famTot.get(F.fam[j]) || 0) + s); linkN++; linkS += s; ages.push(yr[i] - yr[j]); if (F.fam[j] !== F.fam[i]) cross++; }));
  const fams = [...famTot].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]), y0 = I.y0, y1 = I.y1;
  const raw = new Map(); dated.forEach(i => { const y = year(i); I.par[i].forEach(({ j, s }) => { const f = fams.includes(F.fam[j]) ? F.fam[j] : '·other'; const m = raw.get(y) || new Map(); m.set(f, (m.get(f) || 0) + s); raw.set(y, m); }); });
  const series = []; for (let y = y0; y <= y1; y++) { const m = new Map(); let tot = 0; for (let w = y - 1; w <= y + 1; w++) { const r = raw.get(w); if (r) r.forEach((v, f) => { m.set(f, (m.get(f) || 0) + v); tot += v; }); } series.push({ y, tot, share: [...fams, '·other'].map(f => tot ? (m.get(f) || 0) / tot : 0) }); }
  // leaderboards
  const relTop = Array.from({ length: N }, (_, i) => i).filter(i => I.credit[i] >= 1).sort((a, b) => I.credit[b] - I.credit[a]).slice(0, 12);
  const reachFams = (i) => { const s = new Set(); I.kids[i].forEach(({ j }) => s.add(F.fam[j])); return s.size; };
  const sumBy = (keyOf) => { const m = new Map(); for (let i = 0; i < N; i++) { if (I.credit[i] <= 0) continue; keyOf(i).forEach(k => { if (!k) return; const v = m.get(k) || { c: 0, n: 0, best: i }; v.c += I.credit[i]; v.n++; if (I.credit[i] > I.credit[v.best]) v.best = i; m.set(k, v); }); } return [...m].sort((a, b) => b[1].c - a[1].c).slice(0, 12); };
  const artTop = sumBy(i => [gx.items[i].artist]), labTop = sumBy(i => gxSplit(gx.items[i].label).slice(0, 1));
  // bridges: four or more followers, most in other families
  const bridges = []; for (let i = 0; i < N; i++) { const ks = I.kids[i]; if (ks.length < 4) continue; const other = ks.filter(({ j }) => F.fam[j] !== F.fam[i]); if (other.length / ks.length < 0.5) continue; const to = new Map(); other.forEach(({ j }) => to.set(F.fam[j], (to.get(F.fam[j]) || 0) + 1)); bridges.push({ i, pct: other.length / ks.length, to: [...to].sort((a, b) => b[1] - a[1])[0][0], n: ks.length }); }
  bridges.sort((a, b) => b.pct * Math.sqrt(b.n) - a.pct * Math.sqrt(a.n));
  // lines started: per subgenre (5+ dated), its earliest release that later ones in it lean on
  const bySub = new Map(); dated.forEach(i => { const s = (F.sub && F.sub[i]) || F.fam[i]; if (!bySub.has(s)) bySub.set(s, []); bySub.get(s).push(i); });
  const started = [], deadEnds = [];
  bySub.forEach((ix, s) => {
    if (ix.length < 5) return; const mem = new Set(ix);
    const first = ix.find(i => I.kids[i].some(({ j }) => mem.has(j))); if (first != null) { const after = ix.filter(i => yr[i] > yr[first]).length; if (after >= 4) started.push({ i: first, s, after }); }
    const last = year(ix[ix.length - 1]); if (last <= y1 - 8) deadEnds.push({ s, last, n: ix.length, lean: ix.reduce((a, i) => a + I.credit[i], 0) });
  });
  started.sort((a, b) => b.after - a.after); deadEnds.sort((a, b) => b.lean - a.lean);
  // orphans: dated, not among the first years, nothing earlier they draw on
  const orphans = dated.filter(i => !I.par[i].length && yr[i] > y0 + 3).sort((a, b) => I.credit[b] - I.credit[a] || yr[b] - yr[a]).slice(0, 8);
  // you against the crate: influential, no listen logged, no plays
  const listened = (it) => { try { return typeof hasLoggedListen === 'function' && hasLoggedListen(it); } catch (e) { return false; } };
  const plays = (it) => { try { return typeof scrobbleCountFor === 'function' ? Number(scrobbleCountFor(it.artist, it.title)) || 0 : 0; } catch (e) { return 0; } };
  const unheard = Array.from({ length: N }, (_, i) => i).filter(i => I.credit[i] >= 2).sort((a, b) => I.credit[b] - I.credit[a]).filter(i => !listened(gx.items[i]) && !plays(gx.items[i])).slice(0, 8);
  // depth: the longest line of drew-from links
  const depth = new Int32Array(N), via = new Int32Array(N).fill(-1); let deep = -1;
  dated.forEach(i => { I.par[i].forEach(({ j }) => { if (depth[j] + 1 > depth[i]) { depth[i] = depth[j] + 1; via[i] = j; } }); if (deep < 0 || depth[i] > depth[deep]) deep = i; });
  const line = []; for (let i = deep; i >= 0 && line.length < 80; i = via[i]) line.push(i);
  const starts = dated.filter(i => !I.par[i].length).length;
  const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return { y0, y1, fams, series, relTop, artTop, labTop, bridges: bridges.slice(0, 6), started: started.slice(0, 6), deadEnds: deadEnds.slice(0, 6), orphans, unheard, line: line.reverse(),
    tot: { links: linkN, avgS: linkN ? linkS / linkN : 0, starts, startsPct: dated.length ? starts / dated.length : 0, deep: line.length, age: med(ages), cross: linkN ? cross / linkN : 0, dated: dated.length, undated: N - dated.length, perRel: dated.length ? linkN / dated.length : 0 } };
}

// ----- drawing -----
const GN_COLORS = (f) => f === '·other' ? '#5D6573' : `hsl(${gxHue(f)},55%,60%)`;
function gnChart(d) {
  const W = 1000, H = 190, S = d.series, n = S.length; if (n < 2) return '<p class="gs-s">Too few dated releases for this.</p>';
  const keys = [...d.fams, '·other'], x = (q) => (q / (n - 1) * W).toFixed(1);
  const base = new Float64Array(n); let paths = '';
  keys.forEach((f, k) => {
    const top = S.map((s, q) => base[q] + s.share[k]);
    const up = top.map((v, q) => `${x(q)} ${(H - v * H).toFixed(1)}`), down = [...base].map((v, q) => `${x(q)} ${(H - v * H).toFixed(1)}`).reverse();
    paths += `<path d="M${up.join(' L')} L${down.join(' L')} Z" fill="${GN_COLORS(f)}" opacity="${f === '·other' ? 0.45 : 0.85}"><title>${escapeHtml(f === '·other' ? 'Other families' : f)}</title></path>`;
    top.forEach((v, q) => { base[q] = v; });
  });
  const ticks = []; const st = d.y1 - d.y0 > 40 ? 10 : 5; for (let y = Math.ceil(d.y0 / st) * st; y <= d.y1; y += st) ticks.push(`<span style="left:${((y - d.y0) / (d.y1 - d.y0) * 100).toFixed(2)}%">${y}</span>`);
  return `<div class="gn-chart" data-gn-chart><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Each genre family's share of the links releases draw along, year by year, ${d.y0} to ${d.y1}">${paths}</svg><div class="gn-hair" hidden></div><div class="gn-read" hidden></div></div><div class="gn-ticks">${ticks.join('')}</div>
    <div class="gn-legend">${keys.map(f => f === '·other' ? '<span><i style="background:#5D6573"></i>Other</span>' : `<button type="button" data-gs-open="${escapeHtml(gxNorm(f))}" title="Read ${escapeHtml(f)}'s story"><i style="background:${GN_COLORS(f)}"></i>${escapeHtml(f)}</button>`).join('')}</div>`;
}
function gnRel(i, extra, sub) { const it = gx.items[i], y = Math.floor(gx.inf.yr[i]) || ''; return `<button type="button" class="gn-r" data-gn-go="${i}"><img src="${escapeHtml(gxCover(it))}" alt="" loading="lazy"><span><b>${escapeHtml(it.title)}</b><em>${escapeHtml(sub || [it.artist, y].filter(Boolean).join(' · '))}</em></span>${extra || ''}</button>`; }
function gnBoard(d) {
  const I = gx.inf, bar = (v, max) => `<span class="gn-bar"><u style="width:${Math.max(3, v / max * 100).toFixed(1)}%"></u></span>`;
  if (gn.board === 'rel') { const max = d.relTop.length ? I.credit[d.relTop[0]] : 1; return d.relTop.map((i, k) => { const r = new Set(I.kids[i].map(({ j }) => gx.fams.fam[j])).size; return gnRel(i, `${bar(I.credit[i], max)}<span class="gn-v">${Math.round(I.credit[i])}</span>`, `${k + 1}. ${gx.items[i].artist} · ${Math.floor(I.yr[i]) || 'no year'}${r > 1 ? ` · reaches ${r} families` : ''}`); }).join('') || '<p class="gs-s">Too few dated releases to tell yet.</p>'; }
  const L = gn.board === 'art' ? d.artTop : d.labTop, max = L.length ? L[0][1].c : 1;
  return L.map(([k, v], q) => gnRel(v.best, `${bar(v.c, max)}<span class="gn-v">${Math.round(v.c)}</span>`, `${q + 1}. ${k} · ${v.n} release${v.n === 1 ? '' : 's'} leaned on`)).join('') || '<p class="gs-s">Nothing yet.</p>';
}
function gnHtml() {
  const d = gn.data; if (!d) return '<div class="gs-empty">Reading your crate…</div>';
  const t = d.tot, pc = (v) => Math.round(v * 100) + '%';
  const nums = [[t.links.toLocaleString(), 'influence links'], [t.perRel.toFixed(1), 'links per release'], [Math.round(t.avgS * 100), 'average link strength'], [pc(t.cross), 'of links cross families'],
    [t.starts.toLocaleString(), `starting points (${pc(t.startsPct)})`], [t.deep, 'releases in the longest line'], [t.age ? Math.round(t.age) + ' y' : '–', 'median age when drawn on'], [t.undated.toLocaleString(), 'with no year (left out)']];
  const mini = (rows) => rows.join('') || '<p class="gs-s">None.</p>';
  const lineTxt = d.line.length > 1 ? `${escapeHtml(gx.items[d.line[0]].title)} (${Math.floor(gx.inf.yr[d.line[0]])}) to ${escapeHtml(gx.items[d.line[d.line.length - 1]].title)} (${Math.floor(gx.inf.yr[d.line[d.line.length - 1]])})` : '';
  return `<div class="gs-top"><div><div class="gs-lbl">Influence</div><div class="gs-title">The numbers</div></div><span class="gs-fill"></span><span class="gs-s">Click a release to follow its thread, a family to read its story</span><button type="button" class="gs-btn" data-gn="close" aria-label="Back to the galaxy">✕</button></div>
  <div class="gn-body">
    <div class="gn-nums">${nums.map(([v, l]) => `<div><b>${v}</b><span>${escapeHtml(l)}</span></div>`).join('')}</div>
    <div class="gs-card"><div class="gn-h"><span class="gs-lbl">Each family's pull, year by year</span><span class="gs-s">of the links each year's releases draw along, the share going back to each family (3-year average)</span></div>${gnChart(d)}</div>
    <div class="gn-grid">
      <div class="gs-card"><div class="gn-h"><span class="gs-lbl">Most influential</span><span class="gs-fill"></span>${[['rel', 'Releases'], ['art', 'Artists'], ['lab', 'Labels']].map(([k, l]) => `<button type="button" class="gs-tab${gn.board === k ? ' on' : ''}" data-gn-board="${k}" aria-pressed="${gn.board === k}">${l}</button>`).join('')}</div>${gnBoard(d)}<p class="gs-s">The number: how many later releases in your crate lean on it, directly or through others.</p></div>
      <div class="gs-card"><span class="gs-lbl">Bridges between families</span><p class="gs-s">Four or more followers, most of them in other families.</p>${mini(d.bridges.map(b => gnRel(b.i, `<span class="gn-v">${Math.round(b.pct * 100)}%</span>`, `${gx.fams.fam[b.i]} → ${b.to} · ${b.n} followers`)))}
        <span class="gs-lbl">Started a line</span><p class="gs-s">The first release in a subgenre that later ones in it lean on.</p>${mini(d.started.map(x => gnRel(x.i, `<span class="gn-v">${x.after} after</span>`, `→ ${x.s} · ${Math.floor(gx.inf.yr[x.i])}`)))}
        ${d.line.length > 2 ? `<span class="gs-lbl">The longest line</span><p class="gs-s">${d.line.length} releases, ${lineTxt}.</p><div class="gs-acts"><button type="button" class="gs-btn" data-gn="playline">▶ Play it</button><button type="button" class="gs-btn" data-gn="showline">Show on the galaxy</button></div>` : ''}</div>
      <div class="gs-card"><span class="gs-lbl">Orphans</span><p class="gs-s">Nothing earlier in your crate they draw on: gaps worth filling.</p>${mini(d.orphans.map(i => gnRel(i, `<span class="gn-v">0 before</span>`, `${gx.fams.fam[i]} · ${Math.floor(gx.inf.yr[i])}`)))}
        <span class="gs-lbl">Dead ends</span><p class="gs-s">Subgenres with nothing in your crate for 8 years or more: where to dig next.</p>${mini(d.deadEnds.map(x => `<button type="button" class="gn-m" data-gs-open="${escapeHtml(gxNorm(x.s))}"><span>${escapeHtml(x.s)} · last in ${x.last}</span><i>${x.n} releases</i></button>`))}
        <span class="gs-lbl">You vs the crate</span><p class="gs-s">Influential here, but no listen logged and no plays.</p>${mini(d.unheard.map(i => gnRel(i, `<span class="gn-v">${Math.round(gx.inf.credit[i])}</span>`)))}</div>
    </div>
    <p class="gs-s gs-foot">Read from your crate alone: likeness and order in time, not anyone’s account of who heard whom.</p>
  </div>`;
}
function gnRender() { const p = gnEl('gnPanel'); if (p) p.innerHTML = gnHtml(); }
function gnOpen() {
  if (!gx.open || !gx.graph) return;
  if (gx.mode !== 'time') gxSetMode('time'); if (!gx.inf) return;
  if (typeof gsClose === 'function') gsClose();
  gn.open = true; const p = gnEl('gnPanel'); if (p) p.hidden = false;
  if (!gn.data || gn.key !== gx.key + ':' + gx.items.length) { gn.data = gnBuild(); gn.key = gx.key + ':' + gx.items.length; }
  gnRender(); gsTabs();
}
function gnClose() { if (!gn.open) return; gn.open = false; const p = gnEl('gnPanel'); if (p) p.hidden = true; gsTabs(); }

// three views now: Thread, Story, Numbers
gsTabs = function () { const v = gn.open ? 'numbers' : gs.open ? 'story' : 'thread'; document.querySelectorAll('[data-gx-view]').forEach(b => { const on = b.dataset.gxView === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); };
(function () {
  const bo = gsOpen; gsOpen = function () { gnClose(); return bo.apply(this, arguments); };
  const bc = closeGalaxy; closeGalaxy = function () { gnClose(); return bc.apply(this, arguments); };
  const bm = gxSetMode; gxSetMode = function (m) { bm(m); if (gx.mode !== 'time') gnClose(); };
  const body = document.querySelector('#gxOverlay .gx-body'), tabs = document.getElementById('gxViewTabs'); if (!body || !tabs) return;
  tabs.insertAdjacentHTML('beforeend', '<button type="button" class="gs-tab" data-gx-view="numbers" aria-pressed="false">Numbers</button>');
  const p = document.createElement('div'); p.id = 'gnPanel'; p.className = 'gs-panel gn-panel'; p.hidden = true; body.appendChild(p);
  // the tab clicks: Numbers opens here; Thread and Story (handled in js/86) close it first
  tabs.addEventListener('click', (e) => { const v = e.target.closest('[data-gx-view]'); if (!v) return; if (v.dataset.gxView === 'numbers') { e.stopPropagation(); gnOpen(); } else gnClose(); }, true);
  p.addEventListener('click', (e) => {
    const go = e.target.closest('[data-gn-go]'); if (go) { gx.hl = null; gnClose(); gxSelect(Number(go.dataset.gnGo), true); return; }
    if (e.target.closest('[data-gs-open]')) { gnClose(); return; }          // (js/86 opens the story)
    const bd = e.target.closest('[data-gn-board]'); if (bd) { gn.board = bd.dataset.gnBoard; gnRender(); return; }
    const b = e.target.closest('[data-gn]'); if (!b) return; const k = b.dataset.gn, d = gn.data;
    if (k === 'close') gnClose();
    else if (k === 'playline' && d) { const list = d.line.map(i => gx.items[i]); flashGlobalToast(`Playing the longest line: ${list.length} releases`); playAlbumsReplacingQueue(list); }
    else if (k === 'showline' && d) { gx.hl = new Set(d.line); gx.hlName = 'the longest line'; gnClose(); gxSelect(-1); gxRenderSide(); gxDraw(); }
  });
  // hover the chart: that year's shares
  p.addEventListener('mousemove', (e) => {
    const c = e.target.closest('[data-gn-chart]'); if (!c || !gn.data) { p.querySelectorAll('.gn-hair, .gn-read').forEach(n => { n.hidden = true; }); return; }
    const r = c.getBoundingClientRect(), k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), S = gn.data.series, q = Math.round(k * (S.length - 1)), s = S[q];
    const hair = c.querySelector('.gn-hair'), read = c.querySelector('.gn-read'), keys = [...gn.data.fams, 'Other'];
    hair.hidden = false; hair.style.left = (q / (S.length - 1) * 100) + '%';
    read.hidden = false; read.style.left = Math.min(r.width - 190, Math.max(0, e.clientX - r.left + 12)) + 'px';
    read.innerHTML = `<b>${s.y}</b>${s.tot ? keys.map((f, i) => [f, i]).reverse().map(([f, i]) => s.share[i] >= 0.01 ? `<span><i style="background:${GN_COLORS(f === 'Other' ? '·other' : f)}"></i>${escapeHtml(f)} <em>${Math.round(s.share[i] * 100)}%</em></span>` : '').join('') : '<span>no links this year</span>'}`;
  });
  p.addEventListener('mouseleave', () => { p.querySelectorAll('.gn-hair, .gn-read').forEach(n => { n.hidden = true; }); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && gn.open && gx.open) { e.preventDefault(); e.stopImmediatePropagation(); gnClose(); } }, true);
})();
