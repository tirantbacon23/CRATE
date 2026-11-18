// (1.135.171) Discover, redesigned (canvas: CRATE Discover redesign, boards A and B): two views of the same picks.
//   Shelves: today's pick (big, with why it's for you in plain sentences and Last.fm's own words about it), then shelves whose headings
//            are the reasons: "Because you rate X ★ 5", friends' crates, deep cuts, your most played year, your top descriptor.
//   Chart:   a numbered chart with the numbers in columns (RYM, listeners, friends, fit) and each release's move since last week.
// The picks are Discover's (js/99-radio.js: the music database's releases near your taste, not in your crate).
const DV_VIEW_KEY = 'crate_disc_view_v1', DV_CHART_KEY = 'crate_disc_chart_v1';
const dv = { open: new Set(), filter: 'all', wiki: new Map(), why: new Map(), n: 50 };
function dvView() { try { return localStorage.getItem(DV_VIEW_KEY) === 'chart' ? 'chart' : 'shelves'; } catch (e) { return 'shelves'; } }
function dvWeek(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return { y: d.getUTCFullYear(), w: Math.ceil(((d - y0) / 864e5 + 1) / 7) }; }
const dvItem = (x) => ({ artist: x.a, title: x.t, genre: x.g || '', rymDescriptors: x.d || '' });
const dvGenre1 = (x) => rCap(rSplit(x.g)[0] || '');

// ----- facts about your crate the reasons lean on -----
function dvFacts() {
  if (dv.facts && dv.factsN === state.raw.length) return dv.facts;
  const raw = state.raw || [], years = {};
  raw.forEach(it => { const y = String(it.releaseDate || '').slice(0, 4); if (/^\d{4}$/.test(y)) years[y] = (years[y] || 0) + 1 + rPlays(it) * 0.2; });
  const topYear = Object.keys(years).sort((a, b) => years[b] - years[a])[0] || '';
  // anchors: your best-rated releases, each from a different main genre
  const seen = new Set(), anchors = [];
  raw.filter(it => (Number(it.rating) || 0) >= 4.5 && rSplit(it.genre).length).sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || rPlays(b) - rPlays(a))
    .forEach(it => { const g = rSplit(it.genre)[0]; if (anchors.length < 2 && !seen.has(g)) { seen.add(g); anchors.push(it); } });
  const t = rTaste();
  dv.facts = { topYear, anchors, topDesc: (t.d[0] || {}).k || '', genreRank: new Map(t.g.map((g, i) => [g.k, i + 1])) }; dv.factsN = raw.length;
  return dv.facts;
}
function dvNear(x, it) {          // a database release, and one of yours: how close (shared genres and descriptors, and the artist)
  const g = new Set(rSplit(it.genre).concat(rSplit(it.genre2))), d = new Set(rSplit(it.rymDescriptors));
  let s = 0; rSplit(x.g).forEach(k => { if (g.has(k)) s += 2; }); rSplit(x.d).forEach(k => { if (d.has(k)) s += 1; }); if (rFold(x.a) === rFold(it.artist)) s += 3;
  return s;
}
// one line on why it's here (the chart), and a few sentences (today's pick)
function dvWhy(x) {
  if (dv.whyAt !== radio.discAt) { dv.why.clear(); dv.whyAt = radio.discAt; }
  if (dv.why.has(x.k)) return dv.why.get(x.k);
  const f = dvFacts(), parts = [], like = rLikeYours(dvItem(x))[0];
  if (like) parts.push(`Close to ${like.title}${like.rating ? ` (★ ${like.rating})` : ''}`);
  if (x.cr >= 2) parts.push(`in ${x.cr} of your friends’ crates`); else if (x.cr === 1) parts.push('in a friend’s crate');
  if (parts.length < 2 && x.li && x.li < 50000 && x.rr >= 3.6) parts.push(`deep cut: ${rN(x.li)} listeners`);
  if (parts.length < 2 && f.topYear && String(x.y) === f.topYear) parts.push(`from ${f.topYear}, your most played year`);
  if (parts.length < 2 && f.topDesc && rSplit(x.d).includes(f.topDesc)) parts.push(`“${f.topDesc}”, your top descriptor`);
  if (parts.length < 2) { const g = rSplit(x.g).find(k => f.genreRank.has(k)); if (g) parts.push(`${rCap(g)}, your #${f.genreRank.get(g)} genre`); }
  if (!parts.length) parts.push(x.rr ? `Rated ${Number(x.rr).toFixed(2)} on RYM` : 'Seen by you and your friends');
  const s = parts.slice(0, 2).join('; '); const out = s.charAt(0).toUpperCase() + s.slice(1);
  dv.why.set(x.k, out); return out;
}
function dvProse(x) {
  const f = dvFacts(), it = dvItem(x), like = rLikeYours(it), out = [];
  if (like[0]) out.push(`You rate <b>${escapeHtml(like[0].title)}</b>${like[0].rating ? ` ★ ${escapeHtml(String(like[0].rating))}` : ''}${like[1] ? ` and <b>${escapeHtml(like[1].title)}</b>${like[1].rating ? ` ★ ${escapeHtml(String(like[1].rating))}` : ''}` : ''}; this sits right beside ${like[1] ? 'them' : 'it'}.`);
  const mine = (state.raw || []).filter(r => rFold(r.artist) === rFold(x.a)).length;
  if (mine) out.push(`You already have ${mine === 1 ? 'one' : mine} of ${escapeHtml(x.a)}’s releases.`);
  else if (radio.related[rFold(x.a)]) out.push(`Last.fm puts ${escapeHtml(x.a)} close to artists you play.`);
  const g = rSplit(x.g).find(k => f.genreRank.has(k)); if (g) out.push(`It’s ${escapeHtml(rCap(g))}, your #${f.genreRank.get(g)} genre.`);
  if (x.cr) out.push(x.cr === 1 ? 'One of your friends keeps it in their crate.' : `${x.cr} of your friends keep it in their crates.`);
  if (!out.length) out.push('Your crate is new, so this is the best of the database: what your friends keep, and what’s rated and played most.');
  return out.join(' ');
}
async function dvLoadWiki(x) {          // Last.fm's own write-up of the release, its first two sentences
  if (dv.wiki.has(x.k)) return; dv.wiki.set(x.k, null);
  try { const a = typeof stlAlbum === 'function' ? await stlAlbum(x.a, x.t) : null; let s = String((a && a.wiki && (a.wiki.summary || a.wiki.content)) || '');
    s = s.replace(/<a [^>]*>Read more on Last\.fm<\/a>\.?/i, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const sent = s.match(/[^.!?]+[.!?]+(\s|$)/g) || []; dv.wiki.set(x.k, sent.slice(0, 2).join('').trim().slice(0, 360)); }
  catch (e) { dv.wiki.set(x.k, ''); }
  rPaint();
}

// ----- the chart's weekly moves -----
function dvMoves(list) {
  const now = dvWeek(new Date()), wk = now.y * 100 + now.w; let s = {}; try { s = JSON.parse(localStorage.getItem(DV_CHART_KEY) || '{}') || {}; } catch (e) { s = {}; }
  if (s.week !== wk) { s = { week: wk, prev: s.ranks || null, prevWeek: s.week || 0, ranks: {} }; }
  list.slice(0, 200).forEach((x, i) => { if (!s.ranks[x.k]) s.ranks[x.k] = i + 1; });
  try { localStorage.setItem(DV_CHART_KEY, JSON.stringify(s)); } catch (e) { /* this visit */ }
  const owned = rOwned(); const addedFrom = s.prev ? Object.keys(s.prev).filter(k => owned.has(k)).length : 0;
  return { week: now.w, prev: s.prev, addedFrom };
}
function dvMoveHtml(x, i, mv) {
  if (!mv.prev) return '<span class="dv-mv">—</span>';
  const p = mv.prev[x.k]; if (!p) return '<span class="dv-mv dv-new">NEW</span>';
  const d = p - (i + 1); return d > 0 ? `<span class="dv-mv" title="Up ${d} since last week">▲${d}</span>` : d < 0 ? `<span class="dv-mv" title="Down ${-d} since last week">▼${-d}</span>` : '<span class="dv-mv" title="Same place as last week">=</span>';
}

// ----- the two views -----
function dvCover(x, cls) { return x.c ? `<img class="${cls}" src="${escapeHtml(x.c)}" alt="" loading="lazy">` : `<span class="${cls} rd-nocv"></span>`; }
function dvTile(x, small) { return `<button type="button" class="dv-t" data-dv-open="${escapeHtml(x.k)}">${dvCover(x, 'dv-tc')}<b>${escapeHtml(x.t)}</b><em>${escapeHtml(x.a)}${x.y ? ' · ' + escapeHtml(x.y) : ''}</em><small>${escapeHtml(small)}</small></button>`; }
const dvNums = (x) => [x.rr ? `RYM ${Number(x.rr).toFixed(2)}` : '', x.li ? rN(x.li) : ''].filter(Boolean).join(' · ');
function dvShelves(l) {
  const f = dvFacts(), used = new Set(), shelves = [];
  const take = (xs) => { const fresh = xs.filter(x => !used.has(x.k)), rest = xs.filter(x => used.has(x.k)); return fresh.concat(rest); };
  f.anchors.forEach(it => {
    const xs = l.map(x => ({ x, s: dvNear(x, it) })).filter(o => o.s >= 2).sort((a, b) => b.s - a.s || (b.x.m || 0) - (a.x.m || 0)).map(o => o.x);
    if (xs.length >= 3) shelves.push({ id: 'a:' + rKey(it.artist, it.title), h: `Because you rate ${it.title} ★ ${it.rating}`, sub: [rSplit(it.genre).slice(0, 2).map(rCap).join(', '), rSplit(it.rymDescriptors).slice(0, 2).join(', ')].filter(Boolean).join(' · '), xs: take(xs), line: dvNums });
  });
  const fr = l.filter(x => x.cr).sort((a, b) => b.cr - a.cr || (b.m || 0) - (a.m || 0));
  if (fr.length >= 3) shelves.push({ id: 'friends', h: 'Your friends keep these', sub: 'in their crates, not in yours', xs: take(fr), line: (x) => `in ${x.cr} crate${x.cr === 1 ? '' : 's'}${x.rr ? ' · RYM ' + Number(x.rr).toFixed(2) : ''}` });
  const deep = l.filter(x => x.li && x.li < 50000 && (x.rr >= 3.7 || (!x.rr && x.cr)));
  if (deep.length >= 3) shelves.push({ id: 'deep', h: 'Under 50K listeners, rated highly', sub: 'loved, but little known', xs: take(deep), line: (x) => `${rN(x.li)} listeners${x.rr ? ' · RYM ' + Number(x.rr).toFixed(2) : ''}` });
  if (f.topYear) { const yr = l.filter(x => String(x.y) === f.topYear), dec = f.topYear.slice(0, 3); const xs = yr.length >= 3 ? yr : l.filter(x => String(x.y).slice(0, 3) === dec);
    if (xs.length >= 3) shelves.push({ id: 'year', h: yr.length >= 3 ? `From ${f.topYear}, your most played year` : `From the ${dec}0s, around your most played year`, sub: '', xs: take(xs), line: dvNums }); }
  if (f.topDesc) { const xs = l.filter(x => rSplit(x.d).includes(f.topDesc)); if (xs.length >= 3) shelves.push({ id: 'desc', h: `Like “${f.topDesc}”, your top descriptor`, sub: '', xs: take(xs), line: (x) => dvGenre1(x) || dvNums(x) }); }
  const best = l.filter(x => x.rr).sort((a, b) => b.rr - a.rr);
  if (shelves.length < 3 && best.length >= 3) shelves.push({ id: 'best', h: 'Rated highest on RYM', sub: 'from what you and your friends have seen', xs: take(best), line: (x) => `RYM ${Number(x.rr).toFixed(2)}${x.rv ? ' · ' + rN(x.rv) + ' ratings' : ''}` });
  shelves.forEach(s => s.xs.slice(0, 7).forEach(x => used.add(x.k)));
  return shelves;
}
function dvShelvesHtml(l) {
  const cands = l.slice(0, 12).filter(x => x.c).slice(0, 6), lead = cands.length ? cands[Math.floor(Date.now() / 864e5) % cands.length] : l[0]; if (!lead) return '';          // (a different one of the top few each day)
  if (!dv.wiki.has(lead.k)) dvLoadWiki(lead);
  const wiki = dv.wiki.get(lead.k);
  const leadHtml = `<section class="dv-lead" aria-label="Today’s pick">${dvCover(lead, 'dv-lcv')}<div class="dv-lt">
    <div class="gs-lbl dv-gold">Today’s pick</div><button type="button" class="dv-ltitle" data-dv-open="${escapeHtml(lead.k)}">${escapeHtml(lead.t)}</button>
    <div class="dv-lart"><b>${escapeHtml(lead.a)}</b> <span>${[lead.y, lead.l, rSplit(lead.g).slice(0, 2).map(rCap).join(', ')].filter(Boolean).map(escapeHtml).join(' · ')}</span></div>
    <p class="dv-prose">${dvProse(lead)}</p>${wiki ? `<p class="dv-wiki">“${escapeHtml(wiki)}” <span>Last.fm</span></p>` : ''}
    <div class="dv-lnums">${lead.rr ? `<span><b>${Number(lead.rr).toFixed(2)}</b> RYM${lead.rv ? ' · ' + Number(lead.rv).toLocaleString() : ''}</span>` : ''}${lead.li ? `<span><b>${rN(lead.li)}</b> listeners</span>` : ''}${lead.cr ? `<span><b>${lead.cr}</b> friend${lead.cr === 1 ? '’s crate' : 's’ crates'}</span>` : ''}${lead.m != null ? `<span><b>${lead.m}</b> fit</span>` : ''}</div>
    <div class="rd-acts"><button type="button" class="gs-btn gs-pri" data-dv-act="play" data-k="${escapeHtml(lead.k)}">▶ Play it</button><button type="button" class="gs-btn" data-dv-act="station" data-k="${escapeHtml(lead.k)}">Start a station from it</button><button type="button" class="gs-btn" data-dv-act="add" data-k="${escapeHtml(lead.k)}">+ Add to crate</button><button type="button" class="gs-btn dv-dim" data-dv-act="no" data-k="${escapeHtml(lead.k)}">Not for me</button></div></div></section>`;
  const rest = l.filter(x => x.k !== lead.k);
  return leadHtml + dvShelves(rest).map(s => { const open = dv.open.has(s.id), xs = open ? s.xs.slice(0, 35) : s.xs.slice(0, 7);
    return `<section class="dv-shelf" aria-label="${escapeHtml(s.h)}"><div class="dv-sh"><b>${escapeHtml(s.h)}</b>${s.sub ? `<span>${escapeHtml(s.sub)}</span>` : ''}${s.xs.length > 7 ? `<button type="button" class="dv-all" data-dv-shelf="${escapeHtml(s.id)}" aria-expanded="${open}">${open ? 'Fewer' : `See all ${s.xs.length}`}</button>` : ''}</div>
      <div class="dv-row">${xs.map(x => dvTile(x, s.line(x))).join('')}</div></section>`; }).join('');
}
function dvChartHtml(l) {
  const mv = dvMoves(l), f = dvFacts();
  const decs = {}; l.slice(0, 60).forEach(x => { const d = String(x.y).slice(0, 3); if (/^\d{3}$/.test(d)) decs[d] = (decs[d] || 0) + 1; });
  const dec = Object.keys(decs).sort((a, b) => decs[b] - decs[a])[0];
  const gs = {}; l.slice(0, 80).forEach(x => { const g = rSplit(x.g)[0]; if (g) gs[g] = (gs[g] || 0) + 1; });
  const tg = Object.keys(gs).sort((a, b) => gs[b] - gs[a]).slice(0, 2);
  const filters = [['all', 'Everything', () => true], ['friends', 'In friends’ crates', x => x.cr > 0], ['deep', 'Under 50K listeners', x => x.li && x.li < 50000]]
    .concat(dec ? [['dec', dec + '0s', x => String(x.y).slice(0, 3) === dec]] : []).concat(tg.map(g => ['g:' + g, rCap(g), x => rSplit(x.g).includes(g)]));
  const fl = filters.find(z => z[0] === dv.filter) || filters[0];
  const ranked = l.map((x, i) => ({ x, i })).filter(o => fl[2](o.x)), shown = ranked.slice(0, dv.n);
  const newN = mv.prev ? l.slice(0, 50).filter(x => !mv.prev[x.k]).length : 0, fit = l[0] && l[0].m != null;
  return `<div class="dv-chead"><div><div class="gs-lbl">CRATE · week ${mv.week}</div><div class="dv-ctitle">Your chart of things you haven’t heard</div></div>
    <div class="dv-cnums"><div><b>${l.length.toLocaleString()}</b><span>near your taste, not in your crate</span></div>${mv.prev ? `<div><b>${newN}</b><span>new in the top 50 this week</span></div><div><b>${mv.addedFrom}</b><span>added to your crate from last week’s</span></div>` : '<div><b>1st</b><span>week: moves show from next week</span></div>'}</div></div>
    <nav class="dv-filters" aria-label="Chart filters">${filters.map(([k, label]) => `<button type="button" class="dv-f${fl[0] === k ? ' on' : ''}" data-dv-filter="${escapeHtml(k)}" aria-pressed="${fl[0] === k}">${escapeHtml(label)}</button>`).join('')}</nav>
    <div class="dv-table" role="table" aria-label="Discover chart"><div class="dv-hd${fit ? '' : ' nofit'}" role="row"><span class="n" role="columnheader">#</span><span role="columnheader"></span><span role="columnheader">Release</span><span role="columnheader">Why it’s here</span><span class="n" role="columnheader">RYM</span><span class="n" role="columnheader">Listeners</span><span class="n" role="columnheader">Friends</span>${fit ? '<span class="n" role="columnheader">Fit</span>' : ''}<span role="columnheader"><span class="sr">Move</span></span></div>
    ${shown.map(({ x, i }) => `<button type="button" class="dv-r${i < 3 ? ' top' : ''}${fit ? '' : ' nofit'}" role="row" data-dv-open="${escapeHtml(x.k)}"><span class="dv-rk">${String(i + 1).padStart(2, '0')}</span>${dvCover(x, 'dv-rc')}<span class="dv-tt"><b>${escapeHtml(x.t)}</b><em>${escapeHtml(x.a)}${x.y ? ' · ' + escapeHtml(x.y) : ''}</em></span><span class="dv-why">${escapeHtml(dvWhy(x))}</span><span class="dv-num">${x.rr ? Number(x.rr).toFixed(2) : '—'}<small>${x.rv ? rN(x.rv) : ''}</small></span><span class="dv-num">${x.li ? rN(x.li) : '—'}</span><span class="dv-num">${x.cr || 0}</span>${fit ? `<span class="dv-num">${x.m}</span>` : ''}${dvMoveHtml(x, i, mv)}</button>`).join('')}</div>
    ${ranked.length > dv.n ? `<div class="rd-go"><button type="button" class="gs-btn" data-dv-more>Show more (${(ranked.length - dv.n).toLocaleString()})</button></div>` : ''}
    <p class="gs-s">Click a row for its card.${fit ? ' Fit is out of 100: how close it sits to your ratings, plays, genres and descriptors, and its RYM rating.' : ''} ▲▼ is the move since last week.</p>`;
}
rDiscoverHtml = function () {
  const seed = rSeedHtml();
  if (radio.discLoading && !radio.disc) return seed + '<p class="gs-s">Reading the music database for you…</p>';
  const l = radio.disc || []; if (!l.length) return seed + '<p class="gs-s">Nothing yet: the music database fills as you and your friends use CRATE (⚙ › Music database…).</p>';
  const v = dvView();
  return `${seed}<div class="dv-views" role="tablist" aria-label="Discover view"><button type="button" role="tab" class="dv-v${v === 'shelves' ? ' on' : ''}" aria-selected="${v === 'shelves'}" data-dv-view="shelves">Shelves</button><button type="button" role="tab" class="dv-v${v === 'chart' ? ' on' : ''}" aria-selected="${v === 'chart'}" data-dv-view="chart">Chart</button><span class="gs-s">picked from ${l.length.toLocaleString()} releases you and your friends have seen</span></div>
    ${v === 'chart' ? dvChartHtml(l) : dvShelvesHtml(l)}`;
};
document.addEventListener('click', (e) => {
  const ov = document.getElementById('radioOv'); if (!ov || !ov.contains(e.target)) return;
  const find = (k) => (radio.disc || []).find(x => x.k === k);
  const v = e.target.closest('[data-dv-view]'); if (v) { try { localStorage.setItem(DV_VIEW_KEY, v.dataset.dvView); } catch (err) { /* this visit */ } rPaint(); return; }
  const o = e.target.closest('[data-dv-open]'); if (o) { const x = find(o.dataset.dvOpen); if (x) rfOpen(x); return; }
  const sh = e.target.closest('[data-dv-shelf]'); if (sh) { const id = sh.dataset.dvShelf; if (dv.open.has(id)) dv.open.delete(id); else dv.open.add(id); rPaint(); return; }
  const fb = e.target.closest('[data-dv-filter]'); if (fb) { dv.filter = fb.dataset.dvFilter; dv.n = 50; rPaint(); return; }
  if (e.target.closest('[data-dv-more]')) { dv.n += 50; rPaint(); return; }
  const a = e.target.closest('[data-dv-act]'); if (!a) return; const x = find(a.dataset.k); if (!x) return; const item = rItem(x);
  if (a.dataset.dvAct === 'play') { radio.on = false; rBtnPaint(); ov.hidden = true; playAlbumReplacingQueue(item); }
  else if (a.dataset.dvAct === 'station') radioStart(Object.assign({}, radio.draft || {}, { kind: 'release', artist: x.a, title: x.t, genre: x.g, value: '' }));
  else if (a.dataset.dvAct === 'add') { ov.hidden = true; rAdd(item); }
  else if (a.dataset.dvAct === 'no') { rNotForMe(x); radio.disc = radio.disc.filter(d => d.k !== x.k); rPaint(); }
});
