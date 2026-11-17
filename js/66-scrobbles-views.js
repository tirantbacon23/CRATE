// CRATE — (1.135.66) THE SCROBBLES VIEW, three ways, switched at its top (and in ⚙ Settings → "Scrobbles looks like"), kept on this device:
//  · Overview: a period (7 days, 30 days, this year, all time), its totals, the top releases as covers, the chart for the period (Releases /
//    Artists / Songs, ranked, with each one's move against the period before), and beside it what you played day by day.
//  · Timeline: a year as a calendar of days (the brighter, the more you played), then each day's listening, release by release, with Play
//    again and Log in diary.
//  · Charts: the ranked chart on its own, for a period, with the days played and the last time.
// Scrobbles are kept one row per release, song and day (from the Last.fm import), so plays are counted per day, not per minute.
const SCV_KEY = 'crate_scrob_view_v1';
function scvPrefs() { try { return Object.assign({ view: 'overview', period: '30', chart: 'releases', year: '' }, JSON.parse(localStorage.getItem(SCV_KEY) || '{}') || {}); } catch (e) { return { view: 'overview', period: '30', chart: 'releases', year: '' }; } }
function scvSet(o) { const p = Object.assign(scvPrefs(), o); try { localStorage.setItem(SCV_KEY, JSON.stringify(p)); } catch (e) { /* this visit */ } document.querySelectorAll('[data-scv-look]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scvLook === p.view))); renderScrobbles(); }
const SCV_PERIODS = [['7', '7 days'], ['30', '30 days'], ['year', 'This year'], ['all', 'All time']];
let scvDaysShown = 30;

// ----- the numbers -----
const scvIso = (d) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
function scvDay(s) { const v = String(s.day || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
function scvRange(period, back) {          // [from, to) as day strings; back = 1 for the period before
  const now = new Date(); now.setHours(12, 0, 0, 0);
  if (period === 'all') return back ? null : ['0000-00-00', '9999-99-99'];
  if (period === 'year') { const y = now.getFullYear() - (back ? 1 : 0); const end = back ? new Date(y, now.getMonth(), now.getDate() + 1) : new Date(y + 1, 0, 1); return [`${y}-01-01`, scvIso(end)]; }
  const n = Number(period) || 30, to = new Date(now); to.setDate(to.getDate() + 1 - n * (back ? 1 : 0)); const from = new Date(to); from.setDate(from.getDate() - n);
  return [scvIso(from), scvIso(to)];
}
function scvRows(range) { if (!range) return []; return (state.scrobbles || []).filter(s => { const d = scvDay(s); return d && d >= range[0] && d < range[1]; }); }
function scvItem(s) { return rawIndex('row', r => String(r.row)).get(String(s.row)) || null; }
function scvChart(rows, kind) {          // -> [{ key, title, artist, plays, days, last, item, track }] best first
  const m = new Map();
  rows.forEach(s => {
    const key = kind === 'artists' ? s.artist : kind === 'songs' ? s.row + '|' + (s.track || '') : String(s.row);
    if (kind === 'songs' && !s.track) return;
    let g = m.get(key); if (!g) { g = { key, title: kind === 'artists' ? s.artist : kind === 'songs' ? s.track : s.title, artist: kind === 'artists' ? '' : s.artist, release: s.title, plays: 0, dayset: new Set(), last: '', item: scvItem(s), track: s.track || '' }; m.set(key, g); }
    g.plays += Number(s.playCount) || 0; const d = scvDay(s); g.dayset.add(d); if (d > g.last) g.last = d;
  });
  return [...m.values()].map(g => Object.assign(g, { days: g.dayset.size })).sort((a, b) => b.plays - a.plays || b.days - a.days);
}
function scvTotals(rows) {
  const t = { plays: 0, days: new Set(), releases: new Set(), artists: new Set(), songs: new Set() };
  rows.forEach(s => { t.plays += Number(s.playCount) || 0; t.days.add(scvDay(s)); t.releases.add(String(s.row)); t.artists.add(s.artist); if (s.track) t.songs.add(s.row + '|' + s.track); });
  return { plays: t.plays, days: t.days.size, releases: t.releases.size, artists: t.artists.size, songs: t.songs.size };
}
function scvWhen(d) {
  if (!d) return ''; const today = scvIso(new Date()), y = new Date(); y.setDate(y.getDate() - 1);
  if (d === today) return 'today'; if (d === scvIso(y)) return 'yesterday';
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
}
const scvCover = (it) => typeof srchItemCover === 'function' ? srchItemCover(it) : ((it && it.cover) || '');
const scvImg = (it, cls) => `<img class="${cls}" src="${escapeHtml(scvCover(it) || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;

// ----- the pieces -----
function scvHead(p) {
  const views = [['overview', 'Overview'], ['timeline', 'Timeline'], ['charts', 'Charts']];
  const per = p.view === 'timeline' ? '' : SCV_PERIODS.map(([k, l]) => `<button type="button" class="scv-chip${p.period === k ? ' on' : ''}" data-scv-period="${k}">${l}</button>`).join('');
  return `<div class="scv-head"><h2 class="scv-title">Scrobbles</h2><div class="scv-views" role="tablist">${views.map(([k, l]) => `<button type="button" role="tab" aria-selected="${p.view === k}" class="scv-view${p.view === k ? ' on' : ''}" data-scv-view="${k}">${l}</button>`).join('')}</div><span class="scv-gap"></span>${per}</div>`;
}
function scvChartHtml(p, rows, limit) {
  const kind = p.chart, list = scvChart(rows, kind).slice(0, limit), prevRange = scvRange(p.period, 1), prev = prevRange ? scvChart(scvRows(prevRange), kind) : null;
  const prevRank = prev ? new Map(prev.map((g, i) => [g.key, i + 1])) : null, max = list.length ? list[0].plays : 1;
  const tabs = [['releases', 'Releases'], ['artists', 'Artists'], ['songs', 'Songs']].map(([k, l]) => `<button type="button" class="scv-tab${kind === k ? ' on' : ''}" data-scv-chart="${k}">${l}</button>`).join('');
  const rowsHtml = list.map((g, i) => {
    const r = i + 1, was = prevRank ? prevRank.get(g.key) : null;
    const mv = !prevRank ? '' : !was ? '<span class="scv-mv new">NEW</span>' : was > r ? `<span class="scv-mv up">▲ ${was - r}</span>` : was < r ? `<span class="scv-mv down">▼ ${r - was}</span>` : '<span class="scv-mv">=</span>';
    const name = kind === 'songs' ? `${escapeHtml(g.title)}<span class="scv-sub2"> · ${escapeHtml(g.release)}</span>` : escapeHtml(g.title);
    return `<div class="scv-tr" data-scv-open="${escapeHtml(String(g.item ? g.item.row : ''))}" data-scv-artist="${kind === 'artists' ? escapeHtml(g.title) : ''}"><span class="scv-rk">${r}</span>${kind === 'artists' ? `<span class="scv-badge">${escapeHtml((g.title || '?').replace(/^the\s+/i, '').slice(0, 2).toUpperCase())}</span>` : scvImg(g.item, 'scv-cv')}<div class="scv-name"><div class="scv-t">${name}</div>${mv}</div><span class="scv-s">${escapeHtml(g.artist)}</span><span class="scv-s">${g.days} day${g.days === 1 ? '' : 's'}</span><span class="scv-s">${escapeHtml(scvWhen(g.last))}</span><div class="scv-pb"><b>${g.plays}</b><span class="scv-bar"><i style="width:${Math.max(3, g.plays / max * 100).toFixed(1)}%"></i></span></div></div>`;
  }).join('');
  return `<div class="scv-tabs">${tabs}</div><div class="scv-table"><div class="scv-th"><span>#</span><span></span><span>${kind === 'artists' ? 'Artist' : kind === 'songs' ? 'Song' : 'Release'}</span><span>${kind === 'artists' ? '' : 'Artist'}</span><span>Days</span><span>Last</span><span>Plays</span></div>${rowsHtml || '<p class="scv-empty">Nothing played in this period.</p>'}</div>`;
}
function scvDaysHtml(rows, maxDays, big) {          // day by day: each release played that day, its songs
  const byDay = new Map(); rows.forEach(s => { const d = scvDay(s); if (!d) return; if (!byDay.has(d)) byDay.set(d, new Map()); const m = byDay.get(d), k = String(s.row); if (!m.has(k)) m.set(k, { item: scvItem(s), title: s.title, artist: s.artist, plays: 0, songs: new Set() }); const g = m.get(k); g.plays += Number(s.playCount) || 0; if (s.track) g.songs.add(s.track); });
  const days = [...byDay.keys()].sort().reverse(), shown = days.slice(0, maxDays);
  const html = shown.map(d => {
    const rel = [...byDay.get(d).values()].sort((a, b) => b.plays - a.plays), plays = rel.reduce((a, g) => a + g.plays, 0);
    const label = scvWhen(d), nice = label === 'today' || label === 'yesterday' ? label[0].toUpperCase() + label.slice(1) : new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return `<div class="scv-day" id="scv-day-${d}"><div class="scv-dayh"><b>${escapeHtml(nice)}</b><span>${plays} play${plays === 1 ? '' : 's'} · ${rel.length} release${rel.length === 1 ? '' : 's'}</span></div>${rel.map(g => {
      const n = g.item && typeof csTracksOf === 'function' ? (csTracksOf(g.item) || []).length : 0, whole = n && g.songs.size >= n;
      const songs = [...g.songs]; const songsTxt = whole ? `${g.songs.size} songs, the whole album` : songs.length ? `${songs.length} song${songs.length === 1 ? '' : 's'} · ${songs.slice(0, 3).join(', ')}${songs.length > 3 ? '…' : ''}` : `${g.plays} play${g.plays === 1 ? '' : 's'}`;
      return `<div class="scv-ses${big ? ' big' : ''}" data-scv-open="${escapeHtml(String(g.item ? g.item.row : ''))}">${scvImg(g.item, big ? 'scv-cv-big' : 'scv-cv')}<div class="scv-name"><div class="scv-t">${escapeHtml(g.title)} <span class="scv-sub2">· ${escapeHtml(g.artist)}</span></div><div class="scv-s">${escapeHtml(songsTxt)}</div></div>${big && g.item ? `<span class="scv-acts"><button type="button" class="scv-act" data-scv-play="${escapeHtml(String(g.item.row))}">▶ Play again</button><button type="button" class="scv-act" data-scv-log="${escapeHtml(String(g.item.row))}">✎ Log in diary</button></span>` : ''}</div>`;
    }).join('')}</div>`;
  }).join('');
  return html + (days.length > shown.length ? `<button type="button" class="scv-more" data-scv-more>Show ${Math.min(30, days.length - shown.length)} more days</button>` : '') + (days.length ? '' : '<p class="scv-empty">Nothing played in this period.</p>');
}

// ----- the three views -----
function scvOverview(p) {
  const rows = scvRows(scvRange(p.period)), t = scvTotals(rows), top = scvChart(rows, 'releases').slice(0, 10), max = top.length ? top[0].plays : 1;
  const stat = (n, l) => `<div class="scv-stat"><b>${Number(n).toLocaleString()}</b><span>${l}</span></div>`;
  const covers = top.map((g, i) => `<div class="scv-cell" data-scv-open="${escapeHtml(String(g.item ? g.item.row : ''))}"><div class="scv-cellcv">${scvImg(g.item, 'scv-cv-fill')}<span class="scv-rkb">${i + 1}</span></div><div class="scv-t">${escapeHtml(g.title)}</div><div class="scv-s">${escapeHtml(g.artist)} · ${g.plays}</div><span class="scv-bar"><i style="width:${(g.plays / max * 100).toFixed(1)}%"></i></span></div>`).join('');
  return `<div class="scv-stats">${stat(t.plays, 'plays')}${stat(t.days, 'days listened')}${stat(t.releases, 'releases')}${stat(t.artists, 'artists')}${stat(t.songs, 'songs')}</div>
    <div class="scv-cols"><div class="scv-main"><div class="scv-lbl">Top releases</div><div class="scv-grid">${covers || '<p class="scv-empty">Nothing played in this period.</p>'}</div><div class="scv-lbl" style="margin-top:22px">Chart</div>${scvChartHtml(p, rows, 50)}</div>
    <div class="scv-side"><div class="scv-lbl">Day by day</div>${scvDaysHtml(rows, Math.min(scvDaysShown, 14), false)}</div></div>`;
}
function scvTimeline(p) {
  const all = state.scrobbles || [], years = [...new Set(all.map(s => scvDay(s).slice(0, 4)).filter(Boolean))].sort().reverse();
  const year = years.includes(p.year) ? p.year : years[0] || String(new Date().getFullYear());
  const rows = all.filter(s => scvDay(s).startsWith(year)), perDay = new Map(); rows.forEach(s => { const d = scvDay(s); perDay.set(d, (perDay.get(d) || 0) + (Number(s.playCount) || 0)); });
  const vals = [...perDay.values()].sort((a, b) => a - b), q = (f) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * f))] : 0, q1 = q(.25), q2 = q(.5), q3 = q(.8);
  const lvl = (n) => !n ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4;
  const start = new Date(Number(year), 0, 1); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));          // from the Monday on or before Jan 1
  let cells = ''; const end = new Date(Number(year), 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const iso = scvIso(d), inYear = iso.startsWith(year), n = perDay.get(iso) || 0; cells += inYear ? `<button type="button" class="scv-cal-d l${lvl(n)}" data-scv-day="${iso}" title="${escapeHtml(new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))}: ${n} play${n === 1 ? '' : 's'}"${n ? '' : ' tabindex="-1"'}></button>` : '<span class="scv-cal-x"></span>'; }
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0], total = rows.reduce((a, s) => a + (Number(s.playCount) || 0), 0);
  return `<div class="scv-tlhead"><span class="scv-s">${year} · ${total.toLocaleString()} plays${busiest ? ` · busiest day ${escapeHtml(scvWhen(busiest[0]))} (${busiest[1]})` : ''}</span><span class="scv-gap"></span>${years.map(y => `<button type="button" class="scv-chip${y === year ? ' on' : ''}" data-scv-year="${y}">${y}</button>`).join('')}</div>
    <div class="scv-cal" role="grid" aria-label="Plays per day in ${year}">${cells}</div>
    <div class="scv-legend"><span>less</span><i class="scv-cal-d l0"></i><i class="scv-cal-d l1"></i><i class="scv-cal-d l2"></i><i class="scv-cal-d l3"></i><i class="scv-cal-d l4"></i><span>more</span></div>
    <div class="scv-tl">${scvDaysHtml(rows, scvDaysShown, true)}</div>`;
}
function scvCharts(p) { return scvChartHtml(p, scvRows(scvRange(p.period)), 100); }

function renderScrobbles() {
  el.scrobblesContainer.innerHTML = '';
  if (!state.scrobbles.length) { showState('emptyScrobbles', 'scrobbles'); return; }
  hideState('scrobbles');
  const p = scvPrefs(), box = document.createElement('div'); box.className = 'scv scv-' + p.view;
  box.innerHTML = scvHead(p) + (p.view === 'timeline' ? scvTimeline(p) : p.view === 'charts' ? scvCharts(p) : scvOverview(p));
  el.scrobblesContainer.appendChild(box);
  if (typeof applyCachedArt === 'function') applyCachedArt();
  if (!el.scrobblesContainer.dataset.scvWired) {
    el.scrobblesContainer.dataset.scvWired = '1';
    el.scrobblesContainer.addEventListener('click', (e) => {
      const g = (s) => e.target.closest(s); let b;
      if ((b = g('[data-scv-view]'))) { scvDaysShown = 30; return scvSet({ view: b.dataset.scvView }); }
      if ((b = g('[data-scv-period]'))) return scvSet({ period: b.dataset.scvPeriod });
      if ((b = g('[data-scv-chart]'))) return scvSet({ chart: b.dataset.scvChart });
      if ((b = g('[data-scv-year]'))) { scvDaysShown = 30; return scvSet({ year: b.dataset.scvYear }); }
      if (g('[data-scv-more]')) { scvDaysShown += 30; return renderScrobbles(); }
      if ((b = g('[data-scv-day]'))) { const id = 'scv-day-' + b.dataset.scvDay; let t = document.getElementById(id); if (!t) { scvDaysShown = 400; renderScrobbles(); t = document.getElementById(id); } if (t) { t.scrollIntoView({ block: 'start' }); t.classList.add('scv-flash'); setTimeout(() => t.classList.remove('scv-flash'), 1600); } return; }
      const it = (row) => rawIndex('row', r => String(r.row)).get(String(row));
      if ((b = g('[data-scv-play]'))) { const x = it(b.dataset.scvPlay); if (x) playAlbumNow(x); return; }
      if ((b = g('[data-scv-log]'))) { const x = it(b.dataset.scvLog); if (x) { switchTab('albums'); openDeck(x); setTimeout(() => { if (el.logForm.hidden) el.logListenBtn.click(); if (typeof deckRevealLog === 'function') deckRevealLog(); }, 50); } return; }
      if ((b = g('[data-scv-open]'))) { if (b.dataset.scvArtist) { switchTab('albums'); filterByArtist(b.dataset.scvArtist); return; } const x = it(b.dataset.scvOpen); if (x) { switchTab('albums'); openDeck(x); } }
    });
  }
}
// ⚙ Settings → Scrobbles looks like
(function scvWire() {
  const go = () => { const p = scvPrefs(); document.querySelectorAll('[data-scv-look]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.scvLook === p.view)); b.addEventListener('click', (e) => { e.stopPropagation(); scvSet({ view: b.dataset.scvLook }); }); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
