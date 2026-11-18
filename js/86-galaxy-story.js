// (1.135.141) Crate Galaxy · Influence: a genre's story. Pick a genre (Story in the header, or "Its genre's story" on a release) and its
// story in your crate is told in steps, worked out from the same links as the influence view:
//   where it starts (its first releases here, and the families what they drew from belong to), the turning point (the release more of what
//   came after leans on than any other), where it splits (the genres outside it that its releases passed on to, and how its descriptors
//   moved), the gap and the comeback (the longest stretch with nothing, and what came after it), and where it is now.
// Beside it, its numbers: first year, peak year, releases, artists, how many later releases lean on it and what share are in other genres,
// how old a release usually is when something draws on it, releases a year, its top artists and labels, and its first years against its last.
// Each step plays; "Show on the galaxy" lights only those releases there. Read from your crate alone: likeness and order in time.

const gs = { open: false, genre: '', focus: 0, data: null };
function gsEl(id) { return document.getElementById(id); }

// ----- the genres there are to tell -----
function gsGenres() {
  if (!gx.graph) return [];
  const count = new Map(), name = new Map();
  gx.items.forEach(it => [it.genre, it.genre2].forEach(v => gxSplit(v).forEach(g => { const k = gxNorm(g); if (!name.has(k)) name.set(k, g); })));
  gx.graph.vec.forEach(m => m.forEach((v, x) => { if (x.startsWith('g:')) count.set(x.slice(2), (count.get(x.slice(2)) || 0) + 1); }));
  (state.genreTaxonomy ? Object.keys(state.genreTaxonomy) : []).forEach(g => { const k = gxNorm(g); if (!name.has(k)) name.set(k, g); });
  return [...count].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, name: name.get(k) || gxhNice(k), n }));
}
function gsName(k) { const g = gsGenres().find(x => x.k === k); return g ? g.name : gxhNice(k); }
function gsMembers(k) { const t = 'g:' + k, out = []; gx.graph.vec.forEach((m, i) => { if (m.has(t)) out.push(i); }); return out; }
function gsFirstGenre(i) { const it = gx.items[i]; return gxSplit(it.genre)[0] || gxSplit(it.genre2)[0] || ''; }
function gsTop(map, n) { return [...map].sort((a, b) => b[1] - a[1]).slice(0, n || 3); }
function gsMed(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function gsDescTop(ix, n) { const m = new Map(); ix.forEach(i => parseDescriptors(gx.items[i].rymDescriptors).slice(0, 6).forEach(d => { const k = d.toLowerCase(); m.set(k, (m.get(k) || 0) + 1); })); return gsTop(m, n || 3).map(x => x[0]); }
function gsAvg(ix, f) { const v = ix.map(i => Number(f(gx.items[i])) || 0).filter(x => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }

// ----- the story, worked out -----
function gsBuild(k) {
  const I = gxInfluence(), all = gsMembers(k), mem = new Set(all), dated = all.filter(i => I.yr[i]).sort((a, b) => I.yr[a] - I.yr[b]);
  const d = { k, name: gsName(k), all, dated, steps: [] };
  if (dated.length < 3) return d;
  const year = (i) => Math.floor(I.yr[i]), y0 = year(dated[0]), y1 = year(dated[dated.length - 1]);
  const perYear = new Map(); dated.forEach(i => perYear.set(year(i), (perYear.get(year(i)) || 0) + 1));
  const peak = gsTop(perYear, 1)[0];
  // what it passed on: releases outside it that draw on its releases, and how old a release was when drawn on
  const out = new Set(), ages = [], outGenre = new Map(); let inside = 0;
  dated.forEach(i => I.kids[i].forEach(({ j }) => { ages.push(I.yr[j] - I.yr[i]); if (mem.has(j)) { inside++; return; } if (!out.has(j)) { out.add(j); const g = gsFirstGenre(j); if (g) outGenre.set(g, (outGenre.get(g) || 0) + 1); } }));
  const later = new Set(); dated.forEach(i => I.kids[i].forEach(({ j }) => later.add(j)));
  // where it starts: the first releases, and the families of what they drew from (outside it)
  const firstN = dated.slice(0, Math.max(3, Math.min(6, Math.ceil(dated.length * 0.12)))), fromFam = new Map(); let fromN = 0;
  firstN.forEach(i => I.par[i].forEach(({ j, s }) => { if (mem.has(j)) return; const f = gx.fams.fam[j]; fromFam.set(f, (fromFam.get(f) || 0) + s); fromN += s; }));
  d.steps.push({ kind: 'start', year: y0, tone: '#E8C27A', head: 'Where it starts in your crate', ix: firstN.slice(0, 4),
    text: `${firstN.length === 1 ? 'Its first release here' : `Its first ${firstN.length} releases here`}, ${y0}${year(firstN[firstN.length - 1]) !== y0 ? '–' + year(firstN[firstN.length - 1]) : ''}${fromN ? ', and where what they drew from sits.' : ': like nothing earlier in your crate, a starting point.'}`,
    chips: fromN ? gsTop(fromFam, 4).map(([f, v]) => `drew from ${f} ${Math.round(v / fromN * 100)}%`) : [] });
  // the turning point
  const byCredit = dated.slice().sort((a, b) => I.credit[b] - I.credit[a]), turn = byCredit[0];
  if (turn != null && I.credit[turn] >= 1) d.steps.push({ kind: 'turn', year: year(turn), tone: '#D6A24C', head: 'The turning point', ix: byCredit.slice(0, 3).filter(i => I.credit[i] >= 1),
    text: `The release more of what came after leans on than any other here: ${Math.round(I.credit[turn]).toLocaleString()} later release${Math.round(I.credit[turn]) === 1 ? '' : 's'} in your crate.`, chips: byCredit.slice(1, 3).filter(i => I.credit[i] >= 1).map(i => `then ${gx.items[i].title} ${Math.round(I.credit[i])}`) });
  // where it splits: the genres outside it its releases passed on to, and how its descriptors moved
  const third = Math.max(1, Math.floor(dated.length / 3)), early = gsDescTop(dated.slice(0, third), 2), lateD = gsDescTop(dated.slice(-third), 2);
  const splits = gsTop(outGenre, 4).filter(([g]) => gxNorm(g) !== k);
  if (splits.length) {
    const yrs = []; out.forEach(j => yrs.push(I.yr[j]));
    d.steps.push({ kind: 'split', year: Math.floor(gsMed(yrs)) || year(dated[third]), tone: '#9B7ED9', head: 'Where it goes', ix: splits.slice(0, 3).map(([g]) => [...out].filter(j => gsFirstGenre(j) === g).sort((a, b) => I.credit[b] - I.credit[a])[0]).filter(x => x != null),
      text: `${out.size.toLocaleString()} release${out.size === 1 ? '' : 's'} outside it draw on it, mostly in ${splits.slice(0, 3).map(([g]) => g).join(', ')}.${early.length && lateD.length && early.join() !== lateD.join() ? ` Its descriptors move from “${early.join('”, “')}” to “${lateD.join('”, “')}”.` : ''}`,
      chips: splits.map(([g, n]) => `→ ${g} ${n}`) });
  }
  // the gap, and the comeback
  const yrsU = [...perYear.keys()].sort((a, b) => a - b); let gap = null;
  for (let q = 1; q < yrsU.length; q++) { const g = yrsU[q] - yrsU[q - 1] - 1; if (g >= 5 && (!gap || g > gap.n)) gap = { from: yrsU[q - 1] + 1, to: yrsU[q] - 1, n: g }; }
  if (gap) {
    const after = dated.filter(i => year(i) > gap.to), back = [], reach = [];
    after.forEach(i => I.par[i].forEach(({ j }) => { if (mem.has(j) && year(j) < gap.from) { back.push(i); reach.push(I.yr[i] - I.yr[j]); } }));
    const bset = [...new Set(back)];
    d.steps.push({ kind: 'gap', year: gap.to + 1, tone: '#7FD1B9', head: bset.length ? 'It comes back' : 'A gap', ix: (bset.length ? bset : after).slice(0, 3), gap,
      text: `Nothing in your crate from ${gap.from}–${gap.to} (${gap.n} years). ${after.length} release${after.length === 1 ? '' : 's'} after it${bset.length ? `, ${bset.length} of them drawing straight on the years before the gap, a ${Math.round(gsMed(reach))}-year jump back` : ''}.`, chips: [] });
  }
  // where it is now
  const recent = dated.slice(-Math.min(4, dated.length)).reverse();
  if (y1 > y0 + 2) d.steps.push({ kind: 'now', year: y1, tone: '#5FA8D3', head: 'Where it is now', ix: recent.slice(0, 4),
    text: `Its newest here, ${year(recent[recent.length - 1])}${year(recent[0]) !== year(recent[recent.length - 1]) ? '–' + year(recent[0]) : ''}${lateD.length ? `: ${lateD.map(x => '“' + x + '”').join(', ')}` : ''}.`, chips: [] });
  // the numbers
  const artists = new Map(), labels = new Map();
  all.forEach(i => { const it = gx.items[i]; if (it.artist) artists.set(it.artist, (artists.get(it.artist) || 0) + 1); gxSplit(it.label).slice(0, 1).forEach(l => labels.set(l, (labels.get(l) || 0) + 1)); });
  const firstYrs = dated.filter(i => year(i) < y0 + 5), lastYrs = dated.filter(i => year(i) > y1 - 5);
  const listened = typeof hasLoggedListen === 'function' ? all.filter(i => { try { return hasLoggedListen(gx.items[i]); } catch (e) { return false; } }).length : 0;
  d.n = { y0, y1, peak: peak ? peak[0] : y0, peakN: peak ? peak[1] : 0, total: all.length, dated: dated.length, artists: artists.size, later: later.size, out: out.size,
    outPct: later.size ? Math.round(out.size / later.size * 100) : 0, age: gsMed(ages), perYear, topArtists: gsTop(artists, 4), topLabels: gsTop(labels, 3), listened,
    you: gsAvg(all, it => it.rating), rym: gsAvg(all, it => it.rymRating), fam: gx.fams.fam[dated[0]],
    then: { d: gsDescTop(firstYrs, 3), you: gsAvg(firstYrs, it => it.rating), rym: gsAvg(firstYrs, it => it.rymRating), n: firstYrs.length },
    now: { d: gsDescTop(lastYrs, 3), you: gsAvg(lastYrs, it => it.rating), rym: gsAvg(lastYrs, it => it.rymRating), n: lastYrs.length } };
  d.steps.sort((a, b) => a.year - b.year || 0);
  return d;
}

// ----- drawing it -----
function gsCover(i) { const it = gx.items[i], y = Math.floor(gx.inf.yr[i]) || ''; return `<button type="button" class="gs-cv" data-gs-go="${i}" title="${escapeHtml(it.title)} · ${escapeHtml(it.artist)}${y ? ' · ' + y : ''}: follow its thread"><img src="${escapeHtml(gxCover(it))}" alt="" loading="lazy"><b>${escapeHtml(it.title)}</b><em>${escapeHtml(it.artist)}${y ? ' · ' + y : ''}</em></button>`; }
function gsSpark(n) {
  const W = 336, H = 90, ys = [], max = Math.max(...n.perYear.values(), 1);
  for (let y = n.y0; y <= n.y1; y++) ys.push(n.perYear.get(y) || 0);
  const dx = ys.length > 1 ? W / (ys.length - 1) : W, pts = ys.map((v, q) => `${(q * dx).toFixed(1)} ${(H - 4 - v / max * (H - 12)).toFixed(1)}`);
  const pk = n.peak - n.y0;
  return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(`Releases a year, ${n.y0} to ${n.y1}, peaking in ${n.peak} with ${n.peakN}`)}"><path d="M${pts.join(' L')} L${W} ${H} L0 ${H} Z" fill="rgba(214,162,76,.12)"/><path d="M${pts.join(' L')}" fill="none" stroke="#D6A24C" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${(pk * dx).toFixed(1)}" cy="${(H - 4 - n.peakN / max * (H - 12)).toFixed(1)}" r="3.5" fill="#EDE7DC"/></svg>`;
}
function gsHtml() {
  const d = gs.data, list = gsGenres();
  const pick = `<label class="gs-pick">⌕ <input type="search" id="gsGenre" list="gsGenreList" value="${escapeHtml(d ? d.name : '')}" placeholder="Pick a genre" aria-label="Pick a genre" autocomplete="off"></label><datalist id="gsGenreList">${list.slice(0, 400).map(g => `<option value="${escapeHtml(g.name)}">${g.n}</option>`).join('')}</datalist>`;
  const head = `<div class="gs-top"><div><div class="gs-lbl">Genre story</div><div class="gs-title">${d ? escapeHtml(d.name) + ' in your crate' : 'Pick a genre'}</div></div><span class="gs-fill"></span>${pick}
    ${d && d.dated.length >= 3 ? '<button type="button" class="gs-btn" data-gs="showall">Show on the galaxy</button><button type="button" class="gs-btn gs-pri" data-gs="playall">▶ Play it, in order</button>' : ''}<button type="button" class="gs-btn" data-gs="close" aria-label="Back to the galaxy">✕</button></div>`;
  if (!d) return `${head}<div class="gs-empty">${list.length ? `Pick one of the ${list.length} genres with three or more releases in your crate. ${list.slice(0, 12).map(g => `<button type="button" class="gs-chip" data-gs-genre="${escapeHtml(g.k)}">${escapeHtml(g.name)} <i>${g.n}</i></button>`).join('')}` : 'Reading your crate…'}</div>`;
  if (d.dated.length < 3) return `${head}<div class="gs-empty">Too few dated releases of ${escapeHtml(d.name)} in your crate to tell its story (${d.dated.length}). Try a wider genre: ${list.slice(0, 8).map(g => `<button type="button" class="gs-chip" data-gs-genre="${escapeHtml(g.k)}">${escapeHtml(g.name)} <i>${g.n}</i></button>`).join('')}</div>`;
  const n = d.n, f = (v) => v ? v.toFixed(2) : '–';
  const steps = d.steps.map((s, q) => `<div class="gs-step${q === gs.focus ? ' on' : ''}" data-gs-step="${q}" tabindex="0"><span class="gs-yr">${s.year}</span><span class="gs-rail"><i style="background:${s.tone};box-shadow:0 0 0 4px ${s.tone}2e"></i>${q < d.steps.length - 1 ? '<b></b>' : ''}</span>
    <div class="gs-card"><div class="gs-k" style="color:${s.tone}">${escapeHtml(s.head)}</div><div class="gs-text">${escapeHtml(s.text)}</div>${s.ix.length ? `<div class="gs-covers">${s.ix.map(gsCover).join('')}</div>` : ''}${s.chips.length ? `<div class="gs-chips">${s.chips.map(c => `<span class="gs-chip">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
    <div class="gs-acts">${s.ix.length ? `<button type="button" class="gs-btn" data-gs="play" data-q="${q}">▶ Play these</button><button type="button" class="gs-btn" data-gs="show" data-q="${q}">Show on the galaxy</button>` : ''}${s.gap ? `<a class="gs-btn" href="https://rateyourmusic.com/charts/top/album/${s.gap.from}-${s.gap.to}/g:${encodeURIComponent(gxNorm(d.name).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}/" target="_blank" rel="noopener">Find releases for the gap ↗</a>` : ''}</div></div></div>`).join('');
  const nums = [[n.y0, 'first in your crate'], [n.peak, `its peak year (${n.peakN})`], [n.total.toLocaleString(), 'releases'], [n.artists.toLocaleString(), 'artists'],
    [n.later.toLocaleString(), 'later releases lean on it'], [n.outPct + '%', 'of those in other genres'], [n.age ? Math.round(n.age) + ' y' : '–', 'median age when drawn on'], [n.total ? Math.round(n.listened / n.total * 100) + '%' : '–', 'of it you’ve listened to'],
    [f(n.you), 'your average ★'], [f(n.rym), 'RYM average']];
  const tn = (t, l) => `<div class="gs-s"><b>${l}</b> (${t.n}): ${t.d.length ? t.d.map(x => escapeHtml(x)).join(' · ') : 'no descriptors'}${t.you ? ` · your ★ ${t.you.toFixed(1)}` : ''}${t.rym ? ` · RYM ${t.rym.toFixed(2)}` : ''}</div>`;
  return `${head}<div class="gs-body"><div class="gs-main"><div class="gs-s">Steps worked out from your crate. ← → move between them, Enter plays one; click a cover to follow its thread on the galaxy.</div><div class="gs-steps">${steps}</div></div>
    <aside class="gs-side"><div class="gs-lbl">${escapeHtml(d.name)}, in numbers</div><div class="gs-nums">${nums.map(([v, l]) => `<div><b>${v}</b><span>${escapeHtml(l)}</span></div>`).join('')}</div>
      <div class="gs-lbl">Releases a year</div>${gsSpark(n)}<div class="gs-axis"><span>${n.y0}</span><span>${Math.round((n.y0 + n.y1) / 2)}</span><span>${n.y1}</span></div>
      <div class="gs-lbl">Most releases</div>${n.topArtists.map(([a, c]) => `<div class="gs-row"><span>${escapeHtml(a)}</span><i>${c}</i></div>`).join('')}
      ${n.topLabels.length ? `<div class="gs-lbl">Labels</div>${n.topLabels.map(([a, c]) => `<div class="gs-row"><span>${escapeHtml(a)}</span><i>${c}</i></div>`).join('')}` : ''}
      <div class="gs-lbl">Then and now</div>${tn(n.then, `${n.y0}–${n.y0 + 4}`)}${tn(n.now, `${n.y1 - 4}–${n.y1}`)}
      <div class="gs-s gs-foot">Read from your crate alone: likeness and order in time, not anyone’s account of who heard whom.</div></aside></div>`;
}
function gsRender() { const p = gsEl('gsPanel'); if (!p) return; p.innerHTML = gsHtml(); const on = p.querySelector('.gs-step.on'); if (on && gs.scroll) { on.scrollIntoView({ block: 'nearest' }); gs.scroll = false; } }

// ----- opening, picking -----
function gsDefaultGenre() {
  if (gx.sel >= 0) { const g = gsFirstGenre(gx.sel); if (g) return gxNorm(g); }
  const g = gsGenres()[0]; return g ? g.k : '';
}
function gsOpen(k) {
  if (!gx.open || !gx.graph) return;
  if (gx.mode !== 'time') gxSetMode('time');
  if (!gx.inf) return;
  gs.open = true; gs.focus = 0; const p = gsEl('gsPanel'); if (p) p.hidden = false;
  gsPick(k != null ? k : (gs.genre || gsDefaultGenre()));
  gsTabs();
}
function gsClose() { gs.open = false; const p = gsEl('gsPanel'); if (p) p.hidden = true; gsTabs(); }
function gsPick(k) { gs.genre = k; gs.focus = 0; gs.data = k ? gsBuild(k) : null; gsRender(); }
function gsFromText(v) { const q = gxNorm(v); if (!q) return; const L = gsGenres(), hit = L.find(g => g.k === q) || L.find(g => g.k.startsWith(q)) || L.find(g => g.k.includes(q)); if (hit) gsPick(hit.k); }
function gsLight(ix) { gx.hl = new Set(ix); gsClose(); gxSelect(-1); gxRenderSide(); gxDraw(); }
function gsTabs() { document.querySelectorAll('[data-gx-view]').forEach(b => { const on = (b.dataset.gxView === 'story') === gs.open; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }

// the galaxy lights only the story's releases after "Show on the galaxy", until cleared
(function () {
  const base = gxLit;
  gxLit = function (i) { if (gx.hl && gx.mode === 'time' && !gx.hl.has(i)) return false; return base(i); };
  const bs = gxtSide;
  gxtSide = function () {
    const h = bs.apply(this, arguments);
    if (!gx.hl) return h + (gx.sel >= 0 && gsFirstGenre(gx.sel) ? `<div class="gx-acts"><button type="button" class="chip-btn" data-gs-open="${escapeHtml(gxNorm(gsFirstGenre(gx.sel)))}">${escapeHtml(gsFirstGenre(gx.sel))}: its story</button></div>` : '');
    return `<div class="gs-hl">Showing ${gx.hl.size} release${gx.hl.size === 1 ? '' : 's'} from the ${escapeHtml(gs.data ? gs.data.name : '')} story <button type="button" class="chip-btn" data-gs-clear>Show all</button><button type="button" class="chip-btn" data-gs-open="${escapeHtml(gs.genre)}">Back to the story</button></div>` + h;
  };
  const bm = gxSetMode;
  gxSetMode = function (m) { bm(m); if (gx.mode !== 'time') gsClose(); const t = gsEl('gxViewTabs'); if (t) t.hidden = gx.mode !== 'time'; };
  const bc = closeGalaxy;
  closeGalaxy = function () { gsClose(); return bc.apply(this, arguments); };
})();

// ----- wiring -----
(function () {
  const body = document.querySelector('#gxOverlay .gx-body'), mode = gxEl('gxMode'); if (!body || !mode) return;
  const p = document.createElement('div'); p.id = 'gsPanel'; p.className = 'gs-panel'; p.hidden = true; body.appendChild(p);
  const tabs = document.createElement('span'); tabs.id = 'gxViewTabs'; tabs.className = 'gs-tabs'; tabs.hidden = true;
  tabs.innerHTML = '<button type="button" class="gs-tab on" data-gx-view="thread" aria-pressed="true">Thread</button><button type="button" class="gs-tab" data-gx-view="story" aria-pressed="false">Story</button>';
  mode.insertAdjacentElement('afterend', tabs);
  const ov = gxEl('gxOverlay');
  ov.addEventListener('click', (e) => {
    const v = e.target.closest('[data-gx-view]'); if (v) { if (v.dataset.gxView === 'story') gsOpen(); else gsClose(); return; }
    const o = e.target.closest('[data-gs-open]'); if (o) { gx.hl = null; gsOpen(o.dataset.gsOpen); return; }
    if (e.target.closest('[data-gs-clear]')) { gx.hl = null; gxRenderSide(); gxDraw(); return; }
    if (!e.target.closest('#gsPanel')) return;
    const g = e.target.closest('[data-gs-genre]'); if (g) { gsPick(g.dataset.gsGenre); return; }
    const go = e.target.closest('[data-gs-go]'); if (go) { gx.hl = null; gsClose(); gxSelect(Number(go.dataset.gsGo), true); return; }
    const st = e.target.closest('[data-gs-step]'); if (st && !e.target.closest('button, a')) { gs.focus = +st.dataset.gsStep; gsRender(); }
    const b = e.target.closest('[data-gs]'); if (!b) return; const k = b.dataset.gs, d = gs.data, s = d && d.steps[+b.dataset.q];
    if (k === 'close') gsClose();
    else if (k === 'play' && s) { const list = s.ix.slice().sort((a, c) => gx.inf.yr[a] - gx.inf.yr[c]).map(i => gx.items[i]); flashGlobalToast(`Playing ${list.length} release${list.length === 1 ? '' : 's'}: ${s.head.toLowerCase()}`); playAlbumsReplacingQueue(list); }
    else if (k === 'show' && s) gsLight(s.ix);
    else if (k === 'showall' && d) gsLight(d.all);
    else if (k === 'playall' && d) { const list = d.dated.map(i => gx.items[i]); flashGlobalToast(`Playing ${d.name}, in order: ${list.length} releases, ${d.n.y0} to ${d.n.y1}`); playAlbumsReplacingQueue(list); }
  });
  p.addEventListener('change', (e) => { if (e.target.id === 'gsGenre') gsFromText(e.target.value); });
  p.addEventListener('keydown', (e) => {
    if (e.target.id === 'gsGenre') { if (e.key === 'Enter') { e.preventDefault(); gsFromText(e.target.value); } return; }
    const d = gs.data; if (!d || !d.steps.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { gs.focus = Math.min(d.steps.length - 1, gs.focus + 1); gs.scroll = true; gsRender(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { gs.focus = Math.max(0, gs.focus - 1); gs.scroll = true; gsRender(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Enter' && e.target.closest('[data-gs-step]')) { const b = p.querySelector(`[data-gs="play"][data-q="${gs.focus}"]`); if (b) b.click(); e.preventDefault(); }
    const on = p.querySelector('.gs-step.on'); if (on && /Arrow/.test(e.key)) on.focus();
  });
  // Esc closes the story first (before the galaxy, or the thread's Esc)
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && gs.open && gx.open) { e.preventDefault(); e.stopImmediatePropagation(); gsClose(); } }, true);
  const bo = openGalaxy;
  openGalaxy = function () { bo.apply(this, arguments); const t = gsEl('gxViewTabs'); if (t) t.hidden = gx.mode !== 'time'; gsTabs(); };
})();
