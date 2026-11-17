// CRATE — (1.135.91) THE STATS TAB, as sketched: Overview · All the numbers · Collection · Insights (and Map, as before).
// Listening comes from the Diary and the Last.fm scrobbles (kept one row per release, song and day: plays have a day, not an hour);
// "hours" are worked out from song lengths CRATE knows (the release's average, else 4 minutes), so they are marked ≈. Each period is
// compared with the one before it (the same length, just before), shown as ▲ / ▼.

const ST = { mode: 'overview', period: 'year', cache: null };
const ST_PERIODS = [['7', '7 days'], ['30', '30 days'], ['year', 'This year'], ['last', 'Last year'], ['all', 'All time']];
const stIso = (d) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const stN = (n, d) => (n == null || !isFinite(n)) ? '–' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d || 0 });
const stPct = (a, b, d) => b ? stN(a / b * 100, d == null ? 0 : d) + '%' : '–';
function stRange(p, back) {          // [from, to) as day strings
  const now = new Date(), y = now.getFullYear(), tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (p === 'all') return back ? null : ['0000-01-01', '9999-12-31'];
  if (p === 'year') return back ? [`${y - 1}-01-01`, stIso(new Date(y - 1, now.getMonth(), now.getDate() + 1))] : [`${y}-01-01`, stIso(tomorrow)];          // (this year so far against last year to the same day)
  if (p === 'last') return back ? [`${y - 2}-01-01`, `${y - 1}-01-01`] : [`${y - 1}-01-01`, `${y}-01-01`];
  const n = Number(p) || 30, a = new Date(now); a.setDate(now.getDate() - n + 1); const a2 = new Date(a); a2.setDate(a.getDate() - n);
  return back ? [stIso(a2), stIso(a)] : [stIso(a), stIso(tomorrow)];
}
const stDayOf = (d) => { const t = dateVal(d); return t === -Infinity ? '' : stIso(new Date(t)); };
const stKey = (a, t) => typeof lastfmNormKey === 'function' ? lastfmNormKey(a, t) : (String(a) + '|' + String(t)).toLowerCase();
function stItem(artist, title) { return rawIndex('stKey', r => stKey(r.artist, r.title)).get(stKey(artist, title)) || null; }
function stFamily(it) {
  const g = (typeof allGenresForItem === 'function' ? allGenresForItem(it) : [it.genre]).filter(x => x && x !== 'Unknown')[0] || '';
  return g ? (typeof gxFamily === 'function' ? gxFamily(g, state.genreTaxonomy) || g : g) : 'Unfiled';
}
function stYearOf(it) { const y = parseInt(String((it && it.releaseDate) || '').slice(0, 4), 10); return y > 1000 ? y : 0; }
function stAvgSongMs(it) {
  if (!it) return 240000; const t = typeof csTracksOf === 'function' ? csTracksOf(it) : null, ms = t ? t.map(x => x.ms).filter(Boolean) : [];
  return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 240000;
}

// ----- one period's listening -----
function stListen(range) {
  const out = { plays: 0, ms: 0, days: new Set(), rel: new Map(), art: new Map(), song: new Map(), wd: Array(7).fill(0), mon: Array(12).fill(0), perDay: new Map(), diary: [], fam: new Map(), dec: new Map() };
  if (!range) return null;
  const inR = (d) => d && d >= range[0] && d < range[1];
  (state.scrobbles || []).forEach(s => {
    const d = String(s.day || '').slice(0, 10); if (!inR(d)) return; const n = Number(s.playCount) || 0; if (!n) return;
    const it = stItem(s.artist, s.title), rk = stKey(s.artist, s.title), ms = n * stAvgSongMs(it);
    out.plays += n; out.ms += ms; out.days.add(d); out.perDay.set(d, (out.perDay.get(d) || 0) + n);
    const dt = new Date(d + 'T12:00:00'); out.wd[(dt.getDay() + 6) % 7] += n; out.mon[dt.getMonth()] += n;
    let r = out.rel.get(rk); if (!r) out.rel.set(rk, r = { title: s.title, artist: s.artist, item: it, plays: 0, ms: 0, days: new Set() }); r.plays += n; r.ms += ms; r.days.add(d);
    let a = out.art.get(s.artist.toLowerCase()); if (!a) out.art.set(s.artist.toLowerCase(), a = { name: s.artist, plays: 0, rel: new Set(), songs: new Set() }); a.plays += n; a.rel.add(rk); if (s.track) a.songs.add(rk + '|' + s.track.toLowerCase());
    if (s.track) { const sk = rk + '|' + s.track.toLowerCase(); let g = out.song.get(sk); if (!g) out.song.set(sk, g = { title: s.track, artist: s.artist, release: s.title, item: it, plays: 0, days: new Set() }); g.plays += n; g.days.add(d); }
    if (it) { const f = stFamily(it); const fe = out.fam.get(f) || { plays: 0, rel: new Set() }; fe.plays += n; fe.rel.add(rk); out.fam.set(f, fe); const y = stYearOf(it); if (y) { const dk = Math.floor(y / 10) * 10; out.dec.set(dk, (out.dec.get(dk) || 0) + n); } }
  });
  (state.diary || []).forEach(e => { const d = stDayOf(e.date); if (!inR(d)) return; out.diary.push(e); out.days.add(d); const rk = stKey(e.artist, e.title); if (!out.rel.has(rk)) out.rel.set(rk, { title: e.title, artist: e.artist, item: stItem(e.artist, e.title), plays: 0, ms: 0, days: new Set([d]) }); });
  // first listens: releases heard in this period and never before it
  const before = new Set(); (state.scrobbles || []).forEach(s => { const d = String(s.day || '').slice(0, 10); if (d && d < range[0]) before.add(stKey(s.artist, s.title)); }); (state.diary || []).forEach(e => { const d = stDayOf(e.date); if (d && d < range[0]) before.add(stKey(e.artist, e.title)); });
  out.first = [...out.rel.keys()].filter(k => !before.has(k)).length;
  // streaks within the period
  const days = [...out.days].sort(); let best = 0, cur = 0, prev = null; days.forEach(d => { const t = new Date(d + 'T12:00:00'); cur = prev && (t - prev) / 864e5 < 1.5 ? cur + 1 : 1; best = Math.max(best, cur); prev = t; });
  out.longest = best;
  const rated = out.diary.filter(e => Number(e.rating) > 0); out.diaryAvg = rated.length ? rated.reduce((a, e) => a + Number(e.rating), 0) / rated.length : null;
  out.fives = out.diary.filter(e => Number(e.rating) >= 5).length; out.rated = rated.length;
  const seen = new Map(); [...(state.diary || [])].sort((a, b) => dateVal(a.date) - dateVal(b.date)).forEach(e => { const k = stKey(e.artist, e.title), d = stDayOf(e.date); if (!seen.has(k)) seen.set(k, d); });
  out.relistens = out.diary.filter(e => seen.get(stKey(e.artist, e.title)) !== stDayOf(e.date)).length;
  out.words = out.diary.reduce((a, e) => a + String(e.description || '').split(/\s+/).filter(Boolean).length, 0);
  out.added = state.raw.filter(r => inR(stDayOf(r.dateAdded))).length;
  return out;
}
function stCrate() {                                                   // the crate itself (not a period)
  const R = state.raw, c = { n: R.length, artists: new Set(), songs: 0, ms: 0, types: new Map(), fmts: new Map(), labels: new Map(), countries: new Map(), genres: new Set(), descs: new Set(), byArtist: new Map(), years: [], rated: 0, ratingSum: 0, rym: 0, rymSum: 0, rymVotes: 0, rymN: 0, tracklists: 0, rymUpdated: 0, covers: 0, liked: 0, songDesc: 0, songRated: 0, sp: 0, yt: 0, songsKnown: 0, longest: null, scenes: new Set(), movements: new Set() };
  const heard = new Set(); (state.scrobbles || []).forEach(s => heard.add(stKey(s.artist, s.title))); (state.diary || []).forEach(e => heard.add(stKey(e.artist, e.title)));
  c.never = [];
  R.forEach(r => {
    c.artists.add(String(r.artist || '').toLowerCase()); c.byArtist.set(r.artist, (c.byArtist.get(r.artist) || 0) + 1);
    c.types.set(r.type || 'Unknown', (c.types.get(r.type || 'Unknown') || 0) + 1);
    const f = typeof formatShort === 'function' && r.format ? formatShort(r.format) : (r.format || ''); c.fmts.set(f || 'Not set', (c.fmts.get(f || 'Not set') || 0) + 1);
    String(r.label || '').split(/\s*[\/,;]\s*/).filter(Boolean).slice(0, 1).forEach(l => c.labels.set(l, (c.labels.get(l) || 0) + 1));
    if (r.region) c.countries.set(r.region, (c.countries.get(r.region) || 0) + 1);
    (typeof allGenresForItem === 'function' ? allGenresForItem(r) : [r.genre]).forEach(g => { if (g && g !== 'Unknown') c.genres.add(g); });
    gxSplitSafe(r.rymDescriptors).forEach(d => c.descs.add(d.toLowerCase())); if (r.scene) c.scenes.add(r.scene); if (r.movement) c.movements.add(r.movement);
    const y = stYearOf(r); if (y) c.years.push(y);
    if (r.rating > 0) { c.rated++; c.ratingSum += r.rating; }
    const rr = Number(r.rymRating) || 0; if (rr) { c.rymN++; c.rymSum += rr; c.rymVotes += Number(r.rymVotes) || 0; }
    if (r.rymUpdated) c.rymUpdated++; if (r.cover || (state.artCache[artKey(r)] || {}).art) c.covers++;
    const t = typeof csTracksOf === 'function' ? csTracksOf(r) : null; if (t && t.length) { c.tracklists++; c.songs += t.length; const ms = t.reduce((a, x) => a + (x.ms || 0), 0); c.ms += ms; if (!c.longest || ms > c.longest.ms) c.longest = { ms, title: r.title }; }
    Object.values(r.trackData || {}).forEach(d => { if (!d) return; if (d.liked) c.liked++; if (Array.isArray(d.desc) && d.desc.length) c.songDesc++; if (Number(d.rating) > 0) c.songRated++; if (d.spotifyLink) c.sp++; if (d.youtubeLink) c.yt++; });
    if (!heard.has(stKey(r.artist, r.title))) c.never.push(r);
  });
  c.years.sort((a, b) => a - b);
  return c;
}
function gxSplitSafe(s) { return String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean); }

// ----- drawing -----
function stDelta(a, b, opt) {
  opt = opt || {}; if (b == null || a == null || !isFinite(a) || !isFinite(b)) return '';
  const d = a - b; if (Math.abs(d) < 1e-9) return '<em class="st-n">=</em>';
  const txt = opt.pct && b ? `${d > 0 ? '+' : '−'}${stN(Math.abs(d / b * 100))}%` : `${d > 0 ? '+' : '−'}${stN(Math.abs(d), opt.d)}`;
  return `<em class="${(opt.lowGood ? d < 0 : d > 0) ? 'st-up' : 'st-dn'}">${d > 0 ? '▲' : '▼'} ${txt.replace(/^[+−]/, '')}</em>`;
}
const stK = (v, label, delta, title) => `<div class="st-k"${title ? ` title="${escapeHtml(title)}"` : ''}><b>${v}</b><span>${escapeHtml(label)}</span>${delta || ''}</div>`;
const stOpen = (it) => it ? ` data-st-open="${escapeHtml(String(it.row))}"` : '';
function stHead() {
  const m = ST.mode, tabs = [['overview', 'Overview'], ['numbers', 'All the numbers'], ['collection', 'Collection'], ['insights', 'Insights'], ['map', 'Map']];
  const per = m === 'overview' || m === 'numbers' ? ST_PERIODS.map(([k, l]) => `<button type="button" class="st-chip${ST.period === k ? ' on' : ''}" data-st-period="${k}">${l}</button>`).join('') + `<span class="st-src">${ST.period === 'all' ? 'Diary + Last.fm' : `against the ${ST.period === 'year' ? 'same days last year' : 'period before'}`}</span>` : '';
  return `<div class="st-head"><div class="st-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${m === k}" class="st-tab${m === k ? ' on' : ''}" data-st-mode="${k}">${l}</button>`).join('')}</div><span class="st-gap"></span>${per}</div>`;
}
function stTable(cols, rows, empty) {
  return `<table class="st-t"><thead><tr>${cols.map((c, i) => `<th${i < 2 ? ' class="st-l"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${cols.length}" class="st-empty">${empty || 'Nothing yet.'}</td></tr>`}</tbody></table>`;
}
function stBars(vals, labels, hi) { const mx = Math.max(1, ...vals); return `<div class="st-bars">${vals.map((v, i) => `<div title="${escapeHtml(String(labels[i]))}: ${stN(v)}"><i class="${hi && hi(i) ? 'hi' : ''}" style="height:${Math.max(v ? 3 : 0, Math.round(v / mx * 100))}%"></i></div>`).join('')}</div>`; }

function stOverview() {
  const r = stRange(ST.period), cur = stListen(r), prev = stListen(stRange(ST.period, 1)), C = stCrate();
  const P = (f) => prev ? f(prev) : null, dl = (a, f, o) => stDelta(a, P(f), o);
  const hours = cur.ms / 36e5, nDays = r[1] === '9999-12-31' ? Math.max(1, cur.days.size) : Math.max(1, Math.round((new Date(Math.min(Date.parse(r[1]), Date.now())) - Date.parse(r[0])) / 864e5));
  const heardPct = C.n ? [...cur.rel.keys()].filter(k => stItem(...k.split('|'))).length : 0;
  const crateHeard = (() => { const h = new Set(); (state.scrobbles || []).forEach(s => h.add(stKey(s.artist, s.title))); (state.diary || []).forEach(e => h.add(stKey(e.artist, e.title))); return state.raw.filter(x => h.has(stKey(x.artist, x.title))).length; })();
  const yrs = [...cur.rel.values()].map(x => stYearOf(x.item)).filter(Boolean).sort((a, b) => a - b), avgY = yrs.length ? yrs.reduce((a, b) => a + b, 0) / yrs.length : null;
  const relLens = [...cur.rel.values()].map(x => x.item && typeof csTracksOf === 'function' ? (csTracksOf(x.item) || []).reduce((a, t) => a + (t.ms || 0), 0) : 0).filter(Boolean);
  const avgLen = relLens.length ? relLens.reduce((a, b) => a + b, 0) / relLens.length : 0, mmss = (ms) => ms ? `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}` : '–';
  const kpis = [
    stK(stN(cur.plays), 'plays', dl(cur.plays, x => x.plays, { pct: 1 })), stK(stN(hours, 1), 'hours played ≈', dl(hours, x => x.ms / 36e5, { pct: 1 }), 'from song lengths CRATE knows'),
    stK(stN(cur.plays / nDays, 1), 'plays a day', dl(cur.plays / nDays, x => x.plays / nDays, { d: 1 })), stK(stN(cur.days.size), 'days listened', dl(cur.days.size, x => x.days.size)),
    stK(stN(cur.longest), 'longest streak', dl(cur.longest, x => x.longest)), stK(stN(cur.rel.size), 'releases heard', dl(cur.rel.size, x => x.rel.size)),
    stK(stN(cur.song.size), 'songs heard', dl(cur.song.size, x => x.song.size)), stK(stN(cur.art.size), 'artists heard', dl(cur.art.size, x => x.art.size)),
    stK(stN(cur.first), 'first listens', dl(cur.first, x => x.first)), stK(stPct(crateHeard, C.n), 'of the crate ever heard'),
    stK(stN(cur.added), 'added to the crate', dl(cur.added, x => x.added)), stK(stN(cur.diary.length), 'diary entries', dl(cur.diary.length, x => x.diary.length)),
    stK(cur.diaryAvg == null ? '–' : stN(cur.diaryAvg, 1), 'avg rating given', cur.diaryAvg == null ? '' : dl(cur.diaryAvg, x => x.diaryAvg, { d: 1 })), stK(stN(cur.fives), '5★ given', dl(cur.fives, x => x.fives)),
    stK(stN(cur.relistens), 'relistens', dl(cur.relistens, x => x.relistens)), stK(stN(cur.words), 'words in notes', dl(cur.words, x => x.words)),
    stK(avgY ? Math.round(avgY) : '–', 'avg release year'), stK(mmss(avgLen), 'avg release length'),
    stK(stN(C.liked), 'songs liked'), stK(stN(cur.fam.size), 'genre families heard', dl(cur.fam.size, x => x.fam.size))
  ].join('');
  // plays over time: by day (up to a month), by week (up to a year and a bit), else by month
  const span = Math.round((Date.parse(r[1] === '9999-12-31' ? stIso(new Date(Date.now() + 864e5)) : r[1]) - Date.parse(r[0] === '0000-01-01' ? ([...cur.days].sort()[0] || stIso(new Date())) : r[0])) / 864e5);
  const step = span <= 35 ? 1 : span <= 430 ? 7 : 30, buckets = new Map(); cur.perDay.forEach((n, d) => { const t = Math.floor(Date.parse(d) / (864e5 * step)); buckets.set(t, (buckets.get(t) || 0) + n); });
  const ks = [...buckets.keys()].sort((a, b) => a - b), from = ks[0], to = ks[ks.length - 1], vals = [], labs = [];
  for (let k = from; k <= to && vals.length < 400; k++) { vals.push(buckets.get(k) || 0); labs.push(stIso(new Date(k * 864e5 * step))); }
  const pk = vals.length ? Math.max(...vals) : 0, pkAt = labs[vals.indexOf(pk)], avg = vals.length ? cur.plays / vals.length : 0;
  const wdN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], wdMax = Math.max(...cur.wd), monN = 'JFMAMJJASOND'.split('');
  const prevRank = prev ? new Map([...prev.rel.entries()].sort((a, b) => b[1].plays - a[1].plays).map(([k], i) => [k, i + 1])) : null;
  const rel = [...cur.rel.entries()].sort((a, b) => b[1].plays - a[1].plays || b[1].days.size - a[1].days.size).slice(0, 15).map(([k, g], i) => { const w = prevRank ? prevRank.get(k) : null, mv = !prevRank ? '' : !w ? '<span class="st-up">NEW</span>' : w > i + 1 ? `<span class="st-up">▲${w - i - 1}</span>` : w < i + 1 ? `<span class="st-dn">▼${i + 1 - w}</span>` : '=';
    return `<tr${stOpen(g.item)}><td>${i + 1}</td><td>${escapeHtml(g.title)}<small>${escapeHtml(g.artist)}</small></td><td>${stN(g.plays)}</td><td>${stN(g.ms / 36e5, 1)}</td><td>${g.days.size}</td><td>${mv}</td></tr>`; });
  const art = [...cur.art.values()].sort((a, b) => b.plays - a.plays).slice(0, 8).map((a, i) => `<tr data-st-artist="${escapeHtml(a.name)}"><td>${i + 1}</td><td>${escapeHtml(a.name)}</td><td>${stN(a.plays)}</td><td>${a.rel.size}</td><td>${a.songs.size}</td><td>${stPct(a.plays, cur.plays, 1)}</td></tr>`);
  const songs = [...cur.song.values()].sort((a, b) => b.plays - a.plays).slice(0, 6).map((s, i) => `<tr${stOpen(s.item)}><td>${i + 1}</td><td>${escapeHtml(s.title)}<small>${escapeHtml(s.artist)}</small></td><td>${stN(s.plays)}</td><td>${s.days.size}</td></tr>`);
  const famTot = [...cur.fam.values()].reduce((a, f) => a + f.plays, 0), prevFamTot = prev ? [...prev.fam.values()].reduce((a, f) => a + f.plays, 0) : 0;
  const famRows = [...cur.fam.entries()].sort((a, b) => b[1].plays - a[1].plays).slice(0, 7).map(([f, e], i) => {
    const ratedIt = [...e.rel].map(k => (cur.rel.get(k) || {}).item).filter(x => x && x.rating > 0), avgR = ratedIt.length ? ratedIt.reduce((a, x) => a + x.rating, 0) / ratedIt.length : null;
    const share = famTot ? e.plays / famTot * 100 : 0, pe = prev && prev.fam.get(f), pshare = prev && prevFamTot ? ((pe ? pe.plays : 0) / prevFamTot * 100) : null;
    return `<tr data-st-q="genre:&quot;${escapeHtml(f)}&quot;"><td>${i + 1}</td><td>${escapeHtml(f)}</td><td>${stN(e.plays)}</td><td>${stN(share, 1)}</td><td>${e.rel.size}</td><td>${avgR == null ? '–' : stN(avgR, 1)}</td><td>${pshare == null ? '' : `<span class="${share >= pshare ? 'st-up' : 'st-dn'}">${share >= pshare ? '+' : '−'}${stN(Math.abs(share - pshare), 1)}</span>`}</td></tr>`; });
  const decTot = [...cur.dec.values()].reduce((a, b) => a + b, 0), own = new Map(); state.raw.forEach(x => { const y = stYearOf(x); if (y) { const d = Math.floor(y / 10) * 10; own.set(d, (own.get(d) || 0) + 1); } }); const ownTot = [...own.values()].reduce((a, b) => a + b, 0);
  const decRows = [...new Set([...cur.dec.keys(), ...own.keys()])].sort().map(d => `<tr data-st-q="year:${d}-${d + 9}"><td></td><td>${d}s</td><td>${stN(cur.dec.get(d) || 0)}</td><td>${stPct(cur.dec.get(d) || 0, decTot, 1)}</td><td>${stPct(own.get(d) || 0, ownTot, 1)}</td></tr>`);
  return `<div class="st-kpis">${kpis}</div>
  <div class="st-grid3">
    <div class="st-col">
      <div class="st-card"><div class="st-ch"><span class="st-lbl">Plays each ${step === 1 ? 'day' : step === 7 ? 'week' : 'month'}</span><span class="st-gap"></span><span class="st-s">avg ${stN(avg)} · peak ${stN(pk)}${pkAt ? ` (${escapeHtml(pkAt)})` : ''}</span></div>${vals.length ? stBars(vals, labs) : '<p class="st-empty">No plays in this period.</p>'}</div>
      <div class="st-two"><div class="st-card"><div class="st-ch"><span class="st-lbl">By weekday</span><span class="st-gap"></span><span class="st-s">${cur.plays ? `${wdN[cur.wd.indexOf(wdMax)]} ${stPct(wdMax, cur.plays)}` : ''}</span></div>${stBars(cur.wd, wdN, (i) => cur.wd[i] === wdMax && wdMax > 0)}<div class="st-xl">${wdN.map(x => `<span>${x[0]}</span>`).join('')}</div></div>
        <div class="st-card"><div class="st-ch"><span class="st-lbl">By month</span></div>${stBars(cur.mon, monN)}<div class="st-xl">${monN.map(x => `<span>${x}</span>`).join('')}</div></div></div>
      <div class="st-card"><div class="st-ch"><span class="st-lbl">Genre families · share of plays</span></div>${stTable(['#', 'Family', 'Plays', '%', 'Releases', 'Avg ★', prev ? 'vs before' : ''], famRows)}</div>
    </div>
    <div class="st-col"><div class="st-card st-grow"><div class="st-ch"><span class="st-lbl">Top releases</span></div>${stTable(['#', 'Release', 'Plays', 'Hrs≈', 'Days', prev ? 'Rank' : ''], rel, 'No plays in this period.')}</div></div>
    <div class="st-col">
      <div class="st-card"><div class="st-ch"><span class="st-lbl">Top artists</span></div>${stTable(['#', 'Artist', 'Plays', 'Rel.', 'Songs', '%'], art)}</div>
      <div class="st-card"><div class="st-ch"><span class="st-lbl">Top songs</span></div>${stTable(['#', 'Song', 'Plays', 'Days'], songs)}</div>
      <div class="st-card st-grow"><div class="st-ch"><span class="st-lbl">Release decades · plays</span></div>${stTable(['', 'Decade', 'Plays', '%', 'Owned %'], decRows)}</div>
    </div>
  </div>`;
}

function stNumbers() {
  const r = stRange(ST.period), cur = stListen(r), prev = stListen(stRange(ST.period, 1)), C = stCrate(), P = (f) => prev ? f(prev) : null;
  const row = (label, v, delta, note) => `<div class="st-r"><span>${escapeHtml(label)}</span><b>${v}</b><em class="${delta ? '' : 'st-n'}">${delta || escapeHtml(note || '')}</em></div>`;
  const dd = (a, f, o) => stDelta(a, P(f), o).replace(/<\/?em[^>]*>/g, '').trim() ? stDelta(a, P(f), o) : '';
  const deltaTxt = (a, f, o) => { const h = stDelta(a, P(f), o); return h ? h.replace(/^<em class="([^"]+)">/, '<span class="$1">').replace(/<\/em>$/, '</span>') : ''; };
  const sec = (t, rows) => `<div class="st-sec"><h3>${t}</h3>${rows.join('')}</div>`;
  const busiest = [...cur.perDay.entries()].sort((a, b) => b[1] - a[1])[0], monMax = Math.max(...cur.mon), wdMax = Math.max(...cur.wd), wdN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekend = cur.wd[5] + cur.wd[6], relPlays = [...cur.rel.values()].map(x => x.plays), topArt = [...cur.art.values()].sort((a, b) => b.plays - a.plays).slice(0, 10).reduce((a, x) => a + x.plays, 0);
  const songOnce = [...cur.song.values()].filter(s => s.plays === 1).length, mostSong = [...cur.song.values()].sort((a, b) => b.plays - a.plays)[0];
  const curStreak = (() => { const all = new Set(); (state.scrobbles || []).forEach(s => all.add(String(s.day || '').slice(0, 10))); (state.diary || []).forEach(e => all.add(stDayOf(e.date))); let n = 0; const d = new Date(); if (!all.has(stIso(d))) d.setDate(d.getDate() - 1); while (all.has(stIso(d))) { n++; d.setDate(d.getDate() - 1); } return n; })();
  const mostLogged = (() => { const m = new Map(); cur.diary.forEach(e => { const k = e.artist + ' — ' + e.title; m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1])[0]; })();
  const types = (k) => C.types.get(k) || 0, fm = (re) => [...C.fmts.entries()].filter(([k]) => re.test(k)).reduce((a, [, n]) => a + n, 0);
  const topArtist = [...C.byArtist.entries()].sort((a, b) => b[1] - a[1])[0], topLabel = [...C.labels.entries()].sort((a, b) => b[1] - a[1])[0], topCountry = [...C.countries.entries()].sort((a, b) => b[1] - a[1])[0];
  const med = C.years.length ? C.years[Math.floor(C.years.length / 2)] : null;
  const rymBoth = state.raw.filter(x => x.rating > 0 && Number(x.rymRating) > 0), youAvg = rymBoth.length ? rymBoth.reduce((a, x) => a + x.rating, 0) / rymBoth.length : null, rymAvg = rymBoth.length ? rymBoth.reduce((a, x) => a + Number(x.rymRating), 0) / rymBoth.length : null;
  const byG = new Map(); state.raw.forEach(x => { if (!(x.rating > 0)) return; (typeof allGenresForItem === 'function' ? allGenresForItem(x) : [x.genre]).slice(0, 2).forEach(g => { if (!g || g === 'Unknown') return; const e = byG.get(g) || [0, 0]; e[0] += x.rating; e[1]++; byG.set(g, e); }); });
  const gAvg = [...byG.entries()].filter(([, e]) => e[1] >= 10).map(([g, e]) => [g, e[0] / e[1]]).sort((a, b) => b[1] - a[1]);
  const byD = new Map(); state.raw.forEach(x => { if (!(x.rating > 0)) return; const y = stYearOf(x); if (!y) return; const d = Math.floor(y / 10) * 10, e = byD.get(d) || [0, 0]; e[0] += x.rating; e[1]++; byD.set(d, e); });
  const dAvg = [...byD.entries()].filter(([, e]) => e[1] >= 5).map(([d, e]) => [d, e[0] / e[1]]).sort((a, b) => b[1] - a[1])[0];
  const rymTop = state.raw.filter(x => Number(x.rymRating) > 0).sort((a, b) => Number(b.rymRating) - Number(a.rymRating))[0];
  const addedByMonth = new Map(); state.raw.forEach(x => { const d = stDayOf(x.dateAdded); if (d) addedByMonth.set(d.slice(0, 7), (addedByMonth.get(d.slice(0, 7)) || 0) + 1); });
  const bigMonth = [...addedByMonth.entries()].sort((a, b) => b[1] - a[1])[0], months = addedByMonth.size;
  const st = (n) => stN(n);
  return `<div class="st-cols4">
    <div class="st-col">${sec('Listening', [row('Plays', st(cur.plays), deltaTxt(cur.plays, x => x.plays, { pct: 1 })), row('Hours played ≈', stN(cur.ms / 36e5, 1), deltaTxt(cur.ms / 36e5, x => x.ms / 36e5, { pct: 1 })), row('Plays a day listened', stN(cur.days.size ? cur.plays / cur.days.size : 0, 1), deltaTxt(cur.days.size ? cur.plays / cur.days.size : 0, x => x.days.size ? x.plays / x.days.size : 0, { d: 1 })),
        row('Days listened', st(cur.days.size), deltaTxt(cur.days.size, x => x.days.size)), row('Longest streak', st(cur.longest) + ' d', deltaTxt(cur.longest, x => x.longest)), row('Current streak', curStreak + ' d'),
        row('Busiest day', busiest ? st(busiest[1]) : '–', '', busiest ? busiest[0] : ''), row('Busiest month', monMax ? st(monMax) : '–', '', monMax ? new Date(2000, cur.mon.indexOf(monMax), 1).toLocaleDateString(undefined, { month: 'short' }) : ''),
        row('Busiest weekday', wdMax ? stPct(wdMax, cur.plays) : '–', '', wdMax ? wdN[cur.wd.indexOf(wdMax)] : ''), row('Weekend share', stPct(weekend, cur.plays), deltaTxt(cur.plays ? weekend / cur.plays * 100 : 0, x => x.plays ? (x.wd[5] + x.wd[6]) / x.plays * 100 : 0, { d: 1 }))])}
      ${sec('Variety', [row('Releases heard', st(cur.rel.size), deltaTxt(cur.rel.size, x => x.rel.size)), row('Artists heard', st(cur.art.size), deltaTxt(cur.art.size, x => x.art.size)), row('Songs heard', st(cur.song.size), deltaTxt(cur.song.size, x => x.song.size)),
        row('First listens', st(cur.first), deltaTxt(cur.first, x => x.first)), row('Genre families heard', st(cur.fam.size), deltaTxt(cur.fam.size, x => x.fam.size)), row('Plays from top 10 artists', stPct(topArt, cur.plays)),
        row('One-play releases', st(relPlays.filter(n => n === 1).length)), row('Releases played 10+ times', st(relPlays.filter(n => n >= 10).length))])}</div>
    <div class="st-col">${sec('Your crate', [row('Releases', st(C.n), ''), row('Albums · EPs · singles', `${st(types('Album'))} · ${st(types('EP'))} · ${st(types('Single'))}`), row('Live · compilations', `${st(types('Live'))} · ${st(types('Compilation'))}`), row('Artists', st(C.artists.size)),
        row('Songs', st(C.songs), '', C.tracklists < C.n ? `in ${st(C.tracklists)} tracklists` : ''), row('Total running time', C.ms && typeof csLen === 'function' ? csLen(C.ms) : '–'), row('Avg release length', C.ms && C.tracklists && typeof csLen === 'function' ? csLen(C.ms / C.tracklists) : '–'),
        row('Longest release', C.longest && C.longest.ms && typeof csLen === 'function' ? csLen(C.longest.ms) : '–', '', C.longest && C.longest.ms ? C.longest.title : ''), row('Oldest · newest', C.years.length ? `${C.years[0]} · ${C.years[C.years.length - 1]}` : '–'), row('Median release year', med || '–'),
        row('Labels · countries', `${st(C.labels.size)} · ${st(C.countries.size)}`), row('Genres · descriptors', `${st(C.genres.size)} · ${st(C.descs.size)}`), row('Most from one artist', topArtist ? st(topArtist[1]) : '–', '', topArtist ? topArtist[0] : ''),
        row('Most from one label', topLabel ? st(topLabel[1]) : '–', '', topLabel ? topLabel[0] : ''), row('Vinyl · CD · digital', `${st(fm(/vinyl|lp|7"|10"|12"/i))} · ${st(fm(/cd/i))} · ${st(fm(/digital|flac|mp3|lossless/i))}`)])}
      ${sec('Growing', [row('Added in this period', st(cur.added), deltaTxt(cur.added, x => x.added)), row('Added a month (avg)', months ? stN(state.raw.filter(x => stDayOf(x.dateAdded)).length / months, 1) : '–'), row('Biggest month', bigMonth ? st(bigMonth[1]) : '–', '', bigMonth ? bigMonth[0] : ''), row('Never listened to', st(C.never.length), '', stPct(C.never.length, C.n))])}</div>
    <div class="st-col">${sec('Ratings', [row('Releases you rated', st(C.rated), '', stPct(C.rated, C.n)), row('Your average', C.rated ? stN(C.ratingSum / C.rated, 2) : '–'), row('RYM average (same releases)', rymAvg == null ? '–' : stN(rymAvg, 2)), row('You against RYM', youAvg == null ? '–' : `${youAvg >= rymAvg ? '+' : '−'}${stN(Math.abs(youAvg - rymAvg), 2)}`),
        row('5★ · 4½ · 4★', `${st(state.raw.filter(x => x.rating >= 5).length)} · ${st(state.raw.filter(x => x.rating === 4.5).length)} · ${st(state.raw.filter(x => x.rating === 4).length)}`), row('Under 2★', st(state.raw.filter(x => x.rating > 0 && x.rating < 2).length)),
        row('Highest-rated genre (10+)', gAvg[0] ? stN(gAvg[0][1], 2) : '–', '', gAvg[0] ? gAvg[0][0] : ''), row('Lowest-rated genre (10+)', gAvg.length ? stN(gAvg[gAvg.length - 1][1], 2) : '–', '', gAvg.length ? gAvg[gAvg.length - 1][0] : ''),
        row('Highest-rated decade', dAvg ? stN(dAvg[1], 2) : '–', '', dAvg ? dAvg[0] + 's' : ''), row('Songs rated', st(C.songRated)), row('RYM: highest in crate', rymTop ? stN(Number(rymTop.rymRating), 2) : '–', '', rymTop ? rymTop.title : ''), row('RYM: avg votes a release', C.rymN ? st(Math.round(C.rymVotes / C.rymN)) : '–')])}
      ${sec('Diary', [row('Entries', st(cur.diary.length), deltaTxt(cur.diary.length, x => x.diary.length)), row('With notes · words', `${st(cur.diary.filter(e => String(e.description || '').trim()).length)} · ${st(cur.words)}`, deltaTxt(cur.words, x => x.words)), row('Relistens', st(cur.relistens), '', stPct(cur.relistens, cur.diary.length)),
        row('Average rating given', cur.diaryAvg == null ? '–' : stN(cur.diaryAvg, 2), cur.diaryAvg == null ? '' : deltaTxt(cur.diaryAvg, x => x.diaryAvg, { d: 2 })), row('Full releases · songs only', `${st(cur.diary.filter(e => e.full).length)} · ${st(cur.diary.filter(e => !e.full && (e.tracks || []).length).length)}`), row('Most-logged release', mostLogged ? st(mostLogged[1]) : '–', '', mostLogged ? mostLogged[0] : '')])}</div>
    <div class="st-col">${sec('Songs', [row('Songs liked', st(C.liked)), row('Songs with descriptors', st(C.songDesc)), row('Most-played song', mostSong ? st(mostSong.plays) : '–', '', mostSong ? mostSong.title : ''), row('Songs played once', st(songOnce), '', stPct(songOnce, cur.song.size)),
        row('Avg song length', C.songs && C.ms ? `${Math.floor(C.ms / C.songs / 60000)}:${String(Math.round(C.ms / C.songs / 1000) % 60).padStart(2, '0')}` : '–'), row('Linked: Spotify · YouTube', C.songs ? `${stPct(C.sp, C.songs)} · ${stPct(C.yt, C.songs)}` : '–')])}
      ${sec('Places', [row('Countries', st(C.countries.size)), row('Most from one country', topCountry ? st(topCountry[1]) : '–', '', topCountry ? topCountry[0] : ''), row('Scenes · movements', `${st(C.scenes.size)} · ${st(C.movements.size)}`)])}
      ${sec('The crate, done', [row('Tracklists', stPct(C.tracklists, C.n)), row('Updated from RYM', stPct(C.rymUpdated, C.n)), row('Covers found', stPct(C.covers, C.n)), row('Never rated', st(C.n - C.rated))])}</div>
  </div>`;
}

function stCollection() {
  const C = stCrate(), R = state.raw;
  const added = new Map(); R.forEach(x => { const d = stDayOf(x.dateAdded); if (d) added.set(d.slice(0, 7), (added.get(d.slice(0, 7)) || 0) + 1); });
  const ms = [...added.keys()].sort(), first = ms[0], months = [];
  if (first) { const d = new Date(first + '-01T12:00:00'), end = new Date(); while (d <= end && months.length < 240) { months.push(stIso(d).slice(0, 7)); d.setMonth(d.getMonth() + 1); } }
  const vals = months.map(m => added.get(m) || 0), undated = R.filter(x => !stDayOf(x.dateAdded)).length; let run = undated; const cum = vals.map(v => (run += v));
  const W = 800, H = 110, mx = Math.max(1, ...vals), bw = months.length ? W / months.length : W, cmax = Math.max(1, cum[cum.length - 1] || 1);
  const svg = months.length ? `<svg class="st-growth" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Releases added each month, and the total"><g>${vals.map((v, i) => `<rect x="${i * bw + 1}" y="${H - v / mx * (H - 6)}" width="${Math.max(1, bw - 2)}" height="${v / mx * (H - 6)}"><title>${months[i]}: ${v}</title></rect>`).join('')}</g><polyline points="${cum.map((c, i) => `${i * bw + bw / 2},${H - c / cmax * (H - 4)}`).join(' ')}"></polyline></svg>
    <div class="st-xl st-xl-spread"><span>${months[0] || ''}</span><span>${months[Math.floor(months.length / 2)] || ''}</span><span>${months[months.length - 1] || ''}</span></div>` : '<p class="st-empty">No dates added yet.</p>';
  const fams = new Map(); R.forEach(x => { const f = stFamily(x), y = stYearOf(x); if (!y) return; const d = Math.floor(y / 10) * 10; if (!fams.has(f)) fams.set(f, new Map()); const m = fams.get(f); m.set(d, (m.get(d) || 0) + 1); });
  const decs = [...new Set([].concat(...[...fams.values()].map(m => [...m.keys()])))].sort((a, b) => a - b), famList = [...fams.entries()].map(([f, m]) => [f, m, [...m.values()].reduce((a, b) => a + b, 0)]).sort((a, b) => b[2] - a[2]).slice(0, 10);
  const hmax = Math.max(1, ...famList.map(([, m]) => Math.max(...m.values())));
  const heat = famList.length ? `<div class="st-hm" style="grid-template-columns:120px repeat(${decs.length},minmax(0,1fr)) 54px"><span></span>${decs.map(d => `<span class="st-hh">${String(d).slice(2)}s</span>`).join('')}<span class="st-hh">all</span>${famList.map(([f, m, tot]) => `<span class="st-hf" title="${escapeHtml(f)}">${escapeHtml(f)}</span>${decs.map(d => { const n = m.get(d) || 0, l = !n ? 0 : Math.min(4, 1 + Math.floor(n / hmax * 3.999)); return `<button type="button" class="st-hc l${l}"${n ? ` data-st-q="genre:&quot;${escapeHtml(f)}&quot; year:${d}-${d + 9}"` : ' disabled'} title="${escapeHtml(f)}, ${d}s: ${n}">${n || ''}</button>`; }).join('')}<span class="st-ht">${stN(tot)}</span>`).join('')}</div>` : '<p class="st-empty">No dated releases yet.</p>';
  const fm = [...C.fmts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8), fmMax = Math.max(1, ...fm.map(x => x[1]));
  const fmRows = fm.map(([k, n]) => `<div class="st-fm"><span>${escapeHtml(k)}</span><span class="st-bar"><i style="width:${n / fmMax * 100}%"${k === 'Not set' ? ' class="dim"' : ''}></i></span><b>${stN(n)}</b><em>${stPct(n, C.n)}</em></div>`).join('');
  const meter = (l, n, q) => `<button type="button" class="st-meter"${q ? ` data-st-q="${escapeHtml(q)}"` : ''}><span>${l}</span><span class="st-bar"><i style="width:${C.n ? n / C.n * 100 : 0}%"></i></span><b>${stPct(n, C.n)}</b><em>${stN(C.n - n)} to go</em></button>`;
  const never = C.never.slice().sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded))).slice(0, 8);
  const ty = [...C.types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `<tr data-st-q="type:${escapeHtml(k.toLowerCase())}"><td></td><td>${escapeHtml(k)}</td><td>${stN(n)}</td><td>${stPct(n, C.n, 1)}</td></tr>`);
  const lab = [...C.labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n], i) => `<tr data-st-q="label:&quot;${escapeHtml(k)}&quot;"><td>${i + 1}</td><td>${escapeHtml(k)}</td><td>${stN(n)}</td><td>${stPct(n, C.n, 1)}</td></tr>`);
  const avg = C.rated ? C.ratingSum / C.rated : null, rymAvg = C.rymN ? C.rymSum / C.rymN : null;
  return `<div class="st-kpis st-kpis6">${stK(stN(C.n), 'releases')}${stK(stN(C.artists.size), 'artists')}${stK(stN(C.songs), 'songs known')}${stK(C.ms && typeof csLen === 'function' ? csLen(C.ms) : '–', 'to play it all')}${stK(avg == null ? '–' : stN(avg, 2), `your avg rating${rymAvg ? ` · RYM ${stN(rymAvg, 2)}` : ''}`)}${stK(stN(C.never.length), 'never listened to')}</div>
  <div class="st-grid2">
    <div class="st-col">
      <div class="st-card"><div class="st-ch"><span class="st-lbl">The crate growing</span><span class="st-s">releases added each month · the line: the total${undated ? ` (${stN(undated)} with no date added counted from the start)` : ''}</span></div>${svg}</div>
      <div class="st-card st-grow"><div class="st-ch"><span class="st-lbl">What you own · genre family by decade</span><span class="st-gap"></span><span class="st-s">click a square to see those releases</span></div>${heat}</div>
    </div>
    <div class="st-col">
      <div class="st-card"><div class="st-ch"><span class="st-lbl">The copy you have</span></div>${fmRows}</div>
      <div class="st-two"><div class="st-card"><div class="st-ch"><span class="st-lbl">Types</span></div>${stTable(['', 'Type', 'N', '%'], ty)}</div><div class="st-card"><div class="st-ch"><span class="st-lbl">Labels</span></div>${stTable(['#', 'Label', 'N', '%'], lab)}</div></div>
      <div class="st-card"><div class="st-ch"><span class="st-lbl">How complete it is</span></div>${meter('Tracklists', C.tracklists)}${meter('Updated from RYM', C.rymUpdated, 'updated:never')}${meter('Rated by you', C.rated, 'rating:0')}${meter('Covers found', C.covers)}</div>
      <div class="st-card st-grow"><div class="st-ch"><span class="st-lbl">Waiting to be heard · ${stN(C.never.length)}</span><span class="st-gap"></span>${C.never.length ? '<button type="button" class="chip-btn" data-st-random>Play one at random</button>' : ''}</div>
        <div class="st-never">${never.map(x => `<button type="button" class="st-nv" data-st-open="${escapeHtml(String(x.row))}"><img class="art" data-key="${escapeHtml(artKey(x))}" src="${escapeHtml(typeof srchItemCover === 'function' ? srchItemCover(x) : (x.cover || ''))}" alt="" loading="lazy"><b>${escapeHtml(x.title)}</b><span>${escapeHtml(x.artist)}</span></button>`).join('') || '<p class="st-empty">You have heard everything in your crate.</p>'}</div></div>
    </div>
  </div>`;
}

function stInsights() {
  const R = state.raw, cards = [];
  const card = (lbl, big, note, q, open) => `<div class="st-card st-ins"><span class="st-lbl">${escapeHtml(lbl)}</span><b>${big}</b><p>${note}</p>${q ? `<button type="button" class="st-link" data-st-q="${escapeHtml(q)}">See them</button>` : ''}${open ? `<button type="button" class="st-link" data-st-open="${escapeHtml(String(open.row))}">Open it</button>` : ''}</div>`;
  const byG = new Map(); R.forEach(x => { if (!(x.rating > 0)) return; const g = (typeof allGenresForItem === 'function' ? allGenresForItem(x) : [x.genre]).filter(z => z && z !== 'Unknown')[0]; if (!g) return; const e = byG.get(g) || [0, 0]; e[0] += x.rating; e[1]++; byG.set(g, e); });
  const gl = [...byG.entries()].filter(([, e]) => e[1] >= 5).map(([g, e]) => [g, e[0] / e[1], e[1]]).sort((a, b) => b[1] - a[1]);
  if (gl.length) cards.push(card('Rated highest', `You rate <em>${escapeHtml(gl[0][0])}</em> highest: ${stN(gl[0][1], 2)} on average`, `over ${gl[0][2]} releases.${gl[1] ? ` ${escapeHtml(gl[1][0])} comes next at ${stN(gl[1][1], 2)}.` : ''}`, `genre:"${gl[0][0]}"`));
  const both = R.filter(x => x.rating > 0 && Number(x.rymRating) > 0);
  if (both.length >= 3) {
    const diff = both.reduce((a, x) => a + x.rating - Number(x.rymRating), 0) / both.length, big = both.slice().sort((a, b) => Math.abs(b.rating - b.rymRating) - Math.abs(a.rating - a.rymRating))[0];
    const byDec = new Map(); both.forEach(x => { const y = stYearOf(x); if (!y) return; const d = Math.floor(y / 10) * 10, e = byDec.get(d) || [0, 0]; e[0] += x.rating - Number(x.rymRating); e[1]++; byDec.set(d, e); });
    const dm = [...byDec.entries()].filter(([, e]) => e[1] >= 3).map(([d, e]) => [d, e[0] / e[1]]).sort((a, b) => (diff >= 0 ? b[1] - a[1] : a[1] - b[1]))[0];
    cards.push(card(diff >= 0 ? 'Kinder than RYM' : 'Harder than RYM', `You rate <em>${stN(Math.abs(diff), 2)} ${diff >= 0 ? 'higher' : 'lower'}</em> than RYM${dm ? `, most of all on ${dm[0]}s releases` : ''}`, `over ${both.length} releases you've both rated. Your biggest gap: ${escapeHtml(big.title)}, ${big.rating}★ against RYM's ${stN(Number(big.rymRating), 2)}.`, '', big));
  }
  const plays = new Map(); let tot = 0; (state.scrobbles || []).forEach(s => { const it = stItem(s.artist, s.title), y = stYearOf(it); if (!y) return; const d = Math.floor(y / 10) * 10, n = Number(s.playCount) || 0; plays.set(d, (plays.get(d) || 0) + n); tot += n; });
  const own = new Map(); let otot = 0; R.forEach(x => { const y = stYearOf(x); if (!y) return; const d = Math.floor(y / 10) * 10; own.set(d, (own.get(d) || 0) + 1); otot++; });
  const topDec = [...plays.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDec && tot) cards.push(card('Your decade', `Most of what you play came out in the <em>${topDec[0]}s</em>`, `${stPct(topDec[1], tot)} of your plays, though ${stPct(own.get(topDec[0]) || 0, otot)} of what you own is from then.`, `year:${topDec[0]}-${topDec[0] + 9}`));
  const now = new Date(), cutoff = stIso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())), am = new Map();
  (state.scrobbles || []).forEach(s => { const d = String(s.day || '').slice(0, 10); if (d < cutoff) return; const k = s.artist; if (!am.has(k)) am.set(k, new Set()); am.get(k).add(d.slice(0, 7)); });
  const back = [...am.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  if (back) cards.push(card('Coming back to', `<em>${escapeHtml(back[0])}</em> is the artist you return to most`, `played in ${back[1].size} of the last 12 months.`, `artist:"${back[0]}"`));
  const unrated = R.filter(x => !(x.rating > 0)).length, unheard = stCrate().never.length;
  cards.push(card('Still to do', `<em>${stN(unheard)}</em> releases you've never played, <em>${stN(unrated)}</em> never rated`, `${stPct(unheard, R.length)} and ${stPct(unrated, R.length)} of the crate.`, 'rating:0'));
  const fav = R.filter(x => x.rating >= 4.5 && !(state.scrobbles || []).some(s => String(s.day || '').slice(0, 4) === String(now.getFullYear()) && stKey(s.artist, s.title) === stKey(x.artist, x.title))).length;
  if (fav) cards.push(card('Due a revisit', `<em>${stN(fav)}</em> of your 4½★ and up haven't been played this year`, 'the ones you love most, gone quiet.', 'rating:>=4.5'));
  // drift: share of plays by family, year by year
  const yf = new Map(); (state.scrobbles || []).forEach(s => { const y = String(s.day || '').slice(0, 4), it = stItem(s.artist, s.title); if (!/^\d{4}$/.test(y) || !it) return; const f = stFamily(it), n = Number(s.playCount) || 0; if (!yf.has(y)) yf.set(y, new Map()); const m = yf.get(y); m.set(f, (m.get(f) || 0) + n); });
  const years = [...yf.keys()].sort().slice(-8), famTot = new Map(); years.forEach(y => yf.get(y).forEach((n, f) => famTot.set(f, (famTot.get(f) || 0) + n)));
  const fams = [...famTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]), hue = (f) => typeof gxHue === 'function' ? gxHue(f) : 200;
  const drift = years.length ? `<div class="st-drift">${years.map(y => { const m = yf.get(y), t = [...m.values()].reduce((a, b) => a + b, 0) || 1; const other = t - fams.reduce((a, f) => a + (m.get(f) || 0), 0);
      return `<div class="st-dcol"><div class="st-dstack">${fams.map(f => `<i style="height:${(m.get(f) || 0) / t * 100}%;background:hsl(${hue(f)},55%,58%)" title="${escapeHtml(f)} ${y}: ${stPct(m.get(f) || 0, t, 1)}"></i>`).join('')}<i style="height:${other / t * 100}%;background:#3A4250" title="Other ${y}: ${stPct(other, t, 1)}"></i></div><span>${y}</span></div>`; }).join('')}</div>
    <div class="st-legend">${fams.map(f => `<span><i style="background:hsl(${hue(f)},55%,58%)"></i>${escapeHtml(f)}</span>`).join('')}<span><i style="background:#3A4250"></i>Other</span></div>` : '<p class="st-empty">Import Last.fm scrobbles to see this.</p>';
  // your rating against RYM's
  const dots = both.slice(0, 600).map(x => { const rx = (Number(x.rymRating) - 0.5) / 4.5 * 100, ry = 100 - (x.rating - 0.5) / 4.5 * 100, up = x.rating >= Number(x.rymRating);
    return `<button type="button" class="st-dot${up ? '' : ' lo'}" style="left:${Math.max(0, Math.min(100, rx))}%;top:${Math.max(0, Math.min(100, ry))}%" data-st-open="${escapeHtml(String(x.row))}" title="${escapeHtml(x.title)}: you ${x.rating}, RYM ${stN(Number(x.rymRating), 2)}"></button>`; }).join('');
  return `<div class="st-ins-row">${cards.join('')}</div>
  <div class="st-grid2">
    <div class="st-card st-grow"><div class="st-ch"><span class="st-lbl">How your listening has drifted</span><span class="st-s">share of plays by genre family, year by year</span></div>${drift}</div>
    <div class="st-card st-grow"><div class="st-ch"><span class="st-lbl">Your rating against RYM's</span><span class="st-s">gold: you liked it more · blue: less · click a dot</span></div>${both.length ? `<div class="st-scatter"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="100" x2="100" y2="0"></line></svg>${dots}<span class="st-ax st-ay">yours</span><span class="st-ax st-axx">RYM</span></div>` : '<p class="st-empty">Rate releases that have a RYM rating to see this.</p>'}</div>
  </div>`;
}

// ----- the tab -----
function renderStats() {
  const wrap = el.statsWrap; if (!wrap) return;
  let box = document.getElementById('statsNew');
  if (!box) { box = document.createElement('div'); box.id = 'statsNew'; box.className = 'st'; wrap.insertBefore(box, wrap.firstChild); stWire(box); }
  const tg = wrap.querySelector('.stats-mode-toggle'); if (tg) tg.hidden = true;
  if (state.statsMode === 'map' || ST.mode === 'map') { ST.mode = 'map'; state.statsMode = 'map'; }
  const isMap = ST.mode === 'map';
  el.statsListeningWrap.hidden = true; el.statsCollectionWrap.hidden = true; sndMapEl('statsMapWrap').hidden = !isMap;
  wrap.classList.toggle('stats-wide', true);
  box.innerHTML = stHead() + (isMap ? '' : `<div class="st-body">${ST.mode === 'numbers' ? stNumbers() : ST.mode === 'collection' ? stCollection() : ST.mode === 'insights' ? stInsights() : stOverview()}</div>`);
  if (isMap) sndMapRender();
  if (typeof applyCachedArt === 'function') applyCachedArt();
}
function setStatsMode(mode) { ST.mode = ['overview', 'numbers', 'collection', 'insights', 'map'].includes(mode) ? mode : 'overview'; state.statsMode = ST.mode === 'map' ? 'map' : 'listening'; try { localStorage.setItem('crate_stats_v1', JSON.stringify({ mode: ST.mode, period: ST.period })); } catch (e) { /* this visit */ } renderStats(); }
try { const s = JSON.parse(localStorage.getItem('crate_stats_v1') || '{}') || {}; if (s.mode) ST.mode = s.mode; if (s.period) ST.period = s.period; } catch (e) { /* defaults */ }
function stWire(box) {
  box.addEventListener('click', (e) => {
    const g = (s) => e.target.closest(s); let b;
    if ((b = g('[data-st-mode]'))) { setStatsMode(b.dataset.stMode); return; }
    if ((b = g('[data-st-period]'))) { ST.period = b.dataset.stPeriod; setStatsMode(ST.mode); return; }
    if (g('[data-st-random]')) { const l = stCrate().never; const x = l[Math.floor(Math.random() * l.length)]; if (x && typeof playAlbumNow === 'function') { playAlbumNow(x); flashGlobalToast(`Playing “${x.title}”`); } return; }
    if ((b = g('[data-st-open]'))) { const x = rawIndex('row', r => String(r.row)).get(b.dataset.stOpen); if (x) { switchTab('albums'); openDeck(x); } return; }
    if ((b = g('[data-st-artist]'))) { switchTab('albums'); if (typeof filterByArtist === 'function') filterByArtist(b.dataset.stArtist); return; }
    if ((b = g('[data-st-q]'))) { switchTab('albums'); el.searchInput.value = b.dataset.stQ; el.searchInput.dispatchEvent(new Event('input', { bubbles: true })); return; }
  });
}
