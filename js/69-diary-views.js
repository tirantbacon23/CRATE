// CRATE — (1.135.87) THE DIARY, four ways (the tabs at its top; kept as before in state.diaryViewMode):
//  · Journal (was Feed): each entry with its cover and day, grouped by month; the entry's own title and note first, tags for a relisten,
//    the full release or which songs. Beside it, a month at a glance: the days you logged, listens, average rating, streak, the genres
//    you logged most, and what you logged on this day in other years.
//  · Calendar: a month with each day's cover (a second listen tucked in its corner, more as "+n"), the year's months shaded by how much
//    you logged, and the day you pick opened beside it. Arrow keys move day by day.
//  · Covers (was Grid): a wall of what you logged, by month, with listens per month for the year shown and its totals.
//  · Songs (was By track): unchanged.
// Filters for all but Songs: 4★ and up, with notes, relistens. Select (to delete) works in Journal and Covers as before.

const dvState = { filter: 'all', month: null, day: null, year: null };
const DV_FILTERS = [['all', 'All'], ['top', '4★ and up'], ['notes', 'With notes'], ['again', 'Relistens']];
const dvKey = (e) => (String(e.artist || '') + '\u0001' + String(e.title || '')).toLowerCase();
const dvDayIso = (e) => { const t = dateVal(e.date); if (t === -Infinity) return ''; const d = new Date(t), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
let dvMonthFmt = null, dvWdFmt = null, dvLongFmt = null;
const dvMonthName = (y, m) => (dvMonthFmt || (dvMonthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }))).format(new Date(y, m, 1));
const dvWd = (iso) => (dvWdFmt || (dvWdFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' }))).format(new Date(iso + 'T12:00:00')).toUpperCase();
const dvLong = (iso) => (dvLongFmt || (dvLongFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))).format(new Date(iso + 'T12:00:00'));

// Every entry with what the views need: its day, its release, whether it's a relisten (the release logged on an earlier day)
function dvEntries() {
  const list = state.diary.map(e => ({ e, iso: dvDayIso(e), t: dateVal(e.date) })).sort((a, b) => a.t - b.t);
  const seen = new Map();
  list.forEach(x => { const k = dvKey(x.e), first = seen.get(k); x.again = !!first && first !== x.iso; if (!first) seen.set(k, x.iso); x.item = matchAlbumForEntry(x.e); });
  return list.reverse();          // newest first
}
function dvPass(x) {
  const f = dvState.filter;
  return f === 'top' ? (Number(x.e.rating) || 0) >= 4 : f === 'notes' ? !!String(x.e.description || '').trim() : f === 'again' ? x.again : true;
}
function dvCover(x, cls) {
  const it = x.item, key = it ? artKey(it) : '';
  if (it && typeof fetchArt === 'function' && !(state.artCache[key] && state.artCache[key].art) && !it.cover && !artFetchInFlight.has(key)) { artFetchInFlight.add(key); fetchArt(it); }
  return `<img class="${cls}${it ? ' art' : ''}"${it ? ` data-key="${escapeHtml(key)}"` : ''} src="${escapeHtml(coverArtForEntry(x.e))}" alt="" loading="lazy">`;
}
const dvStars = (r) => r ? `<span class="dv-stars">${starRatingHtml(r)}</span>` : '';
function dvTags(x) {
  const t = [], tl = diaryEntryTracksLabel(x.e);
  if (x.again) t.push('<span class="dv-tag dv-again">relisten</span>');
  if (x.e.full) t.push('<span class="dv-tag">full release</span>');
  else if (tl) { const n = (x.e.tracks || []).length; t.push(`<span class="dv-tag" title="${escapeHtml(tl)}">${n} song${n === 1 ? '' : 's'}: ${escapeHtml(tl.length > 70 ? tl.slice(0, 68) + '…' : tl)}</span>`); }
  return t.length ? `<div class="dv-tags">${t.join('')}</div>` : '';
}
function dvSub(x) { const it = x.item, y = it && typeof genreYear === 'function' ? genreYear(it) : ''; return [x.e.artist, y, it && it.type && it.type !== 'Unknown' ? it.type : ''].filter(Boolean).map(escapeHtml).join(' · '); }

// ----- the toolbar: tabs, filters -----
function setDiaryViewMode(mode) {
  state.diaryViewMode = mode;
  [['feed', el.diaryViewFeedBtn], ['calendar', document.getElementById('diaryViewCalendarBtn')], ['grid', el.diaryViewGridBtn], ['tracks', el.diaryViewTracksBtn]]
    .forEach(([m, btn]) => btn && btn.classList.toggle('active', m === mode));
  el.diaryTrackGroupToolbar.hidden = mode !== 'tracks';
  const fl = document.getElementById('diaryFilters'); if (fl) fl.hidden = mode === 'tracks';
  el.diarySelectModeBtn.hidden = mode === 'calendar' || mode === 'tracks';
  if ((mode === 'calendar' || mode === 'tracks') && state.diarySelectMode) setDiarySelectMode(false);
  el.app.classList.toggle('app-wide-diary-tracks', state.activeTab === 'diary' && mode === 'tracks');
  if (typeof savePrefs === 'function') savePrefs();
  renderDiary();
}
function dvFiltersPaint() { document.querySelectorAll('[data-diary-filter]').forEach(b => { const on = b.dataset.diaryFilter === dvState.filter; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }); }

function renderDiary() {
  dvWireOnce();
  el.diaryContainer.innerHTML = ''; el.diaryContainer.className = '';
  if (!state.diary.length) { showState('emptyDiary', 'diary'); return; }
  hideState('diary');
  const mode = state.diaryViewMode || 'feed';
  el.diaryWrap.classList.toggle('diary-wrap-wide', mode !== 'feed' && mode !== 'tracks');
  el.diaryWrap.classList.toggle('diary-wrap-journal', mode === 'feed');
  el.diaryWrap.classList.toggle('diary-wrap-tracks', mode === 'tracks');
  { const fl = document.getElementById('diaryFilters'); if (fl) fl.hidden = mode === 'tracks'; } el.diarySelectModeBtn.hidden = mode === 'calendar' || mode === 'tracks';
  dvFiltersPaint();
  if (mode === 'grid') renderDiaryGrid();
  else if (mode === 'calendar') renderDiaryCalendar();
  else if (mode === 'tracks') renderDiaryByTrack();
  else renderDiaryFeed();
  if (typeof applyCachedArt === 'function') applyCachedArt();
}

// ----- Journal -----
function renderDiaryFeed() {
  const all = dvEntries(), list = all.filter(dvPass), sel = state.diarySelectMode;
  const months = new Map(); list.forEach(x => { const k = x.iso ? x.iso.slice(0, 7) : 'undated'; if (!months.has(k)) months.set(k, []); months.get(k).push(x); });
  const firstOf = new Map(); all.slice().reverse().forEach(x => { const k = dvKey(x.e); if (!firstOf.has(k)) firstOf.set(k, x.iso.slice(0, 7)); });
  let rows = '';
  months.forEach((xs, k) => {
    const fresh = k === 'undated' ? 0 : new Set(xs.filter(x => firstOf.get(dvKey(x.e)) === k).map(x => dvKey(x.e))).size;
    rows += `<div class="dv-mh"><b>${k === 'undated' ? 'Undated' : escapeHtml(dvMonthName(+k.slice(0, 4), +k.slice(5, 7) - 1))}</b><span>${xs.length} listen${xs.length === 1 ? '' : 's'}${fresh ? ` · ${fresh} new to the diary` : ''}</span></div>`;
    rows += xs.map(x => { const key = diaryEntryKey(x.e), on = selectedDiaryKeys.has(key);
      return `<div class="dv-row${on ? ' dv-on' : ''}" data-dv-entry="${escapeHtml(key)}">${sel ? `<label class="diary-select-checkbox"><input type="checkbox"${on ? ' checked' : ''} aria-label="Select entry"></label>` : ''}
        <div class="dv-day"><b>${x.iso ? +x.iso.slice(8) : '–'}</b><span>${x.iso ? dvWd(x.iso) : ''}</span></div>
        <button type="button" class="dv-cvbtn" data-dv-open="${escapeHtml(key)}" title="Open the release">${dvCover(x, 'dv-cv')}</button>
        <div class="dv-main">${x.e.entryTitle ? `<div class="dv-et">${escapeHtml(x.e.entryTitle)}</div>` : ''}<div class="dv-t">${escapeHtml(x.e.title)}</div><div class="dv-a">${dvSub(x)}</div>
          ${x.e.description ? `<div class="dv-note">${escapeHtml(x.e.description)}</div>` : ''}${dvTags(x)}</div>
        <div class="dv-r">${dvStars(x.e.rating)}</div></div>`; }).join('');
  });
  el.diaryContainer.className = 'dv-journal' + (sel ? ' diary-select-active' : '');
  el.diaryContainer.innerHTML = `<div class="dv-feed">${rows || '<p class="diary-empty">No entries under this filter.</p>'}</div><aside class="dv-side">${dvSideHtml(all)}</aside>`;
  dvWireEntries(list.length ? list : all);
}
// The month at a glance: the month you're in (or your latest with entries)
function dvSideHtml(all) {
  const now = new Date(), cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mk = all.some(x => x.iso.startsWith(cur)) ? cur : ((all.find(x => x.iso) || {}).iso || cur).slice(0, 7);
  const y = +mk.slice(0, 4), m = +mk.slice(5, 7) - 1, days = new Date(y, m + 1, 0).getDate(), inM = all.filter(x => x.iso.startsWith(mk));
  const per = new Map(); inM.forEach(x => per.set(+x.iso.slice(8), (per.get(+x.iso.slice(8)) || 0) + 1));
  const heat = Array.from({ length: days }, (_, i) => { const n = per.get(i + 1) || 0; return `<i class="l${Math.min(3, n)}" title="${i + 1}: ${n} listen${n === 1 ? '' : 's'}"></i>`; }).join('');
  const rated = inM.filter(x => Number(x.e.rating) > 0), avg = rated.length ? (rated.reduce((a, x) => a + Number(x.e.rating), 0) / rated.length).toFixed(1) : '–';
  const daySet = new Set(all.map(x => x.iso).filter(Boolean)); let streak = 0;
  { const d = new Date(); if (!daySet.has(dvDayIso({ date: d }))) d.setDate(d.getDate() - 1); while (daySet.has(dvDayIso({ date: d }))) { streak++; d.setDate(d.getDate() - 1); } }
  const g = new Map(); inM.forEach(x => { if (!x.item) return; const first = (typeof allGenresForItem === 'function' ? allGenresForItem(x.item) : [x.item.genre]).filter(z => z && z !== 'Unknown')[0]; if (first) g.set(first, (g.get(first) || 0) + 1); });
  const top = [...g].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => `<div class="dv-gl"><span>${escapeHtml(n)}</span><b>${c}</b></div>`).join('');
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, otd = all.filter(x => x.iso && x.iso.slice(5) === md && !x.iso.startsWith(String(now.getFullYear()))).slice(0, 3);
  return `<div class="dv-lbl">${escapeHtml(dvMonthName(y, m))} · each day you logged</div><div class="dv-heat">${heat}</div>
    <div class="dv-stats"><div><b>${inM.length}</b><span>listens</span></div><div><b>${avg}</b><span>avg rating</span></div><div><b>${streak}</b><span>day streak</span></div></div>
    ${top ? `<div class="dv-lbl">Most this month</div><div class="dv-glist">${top}</div>` : ''}
    ${otd.length ? `<div class="dv-lbl">On this day</div>${otd.map(x => `<button type="button" class="dv-otd" data-dv-entry-open="${escapeHtml(diaryEntryKey(x.e))}">${dvCover(x, 'dv-cv-s')}<span><b>${escapeHtml(x.e.title)}</b><span>${escapeHtml(dsDay(x.e.date))}${x.e.rating ? ' · ' : ''}${x.e.rating ? starRatingHtml(x.e.rating) : ''}</span></span></button>`).join('')}` : ''}`;
}

// ----- Covers -----
function renderDiaryGrid() {
  const all = dvEntries(), years = [...new Set(all.map(x => x.iso.slice(0, 4)).filter(Boolean))].sort().reverse();
  if (dvState.year == null || (dvState.year !== 'all' && !years.includes(dvState.year))) dvState.year = years[0] || 'all';
  const Y = dvState.year, inY = all.filter(x => Y === 'all' || x.iso.startsWith(Y)), list = inY.filter(dvPass), sel = state.diarySelectMode;
  const months = new Map(); list.forEach(x => { const k = x.iso ? x.iso.slice(0, 7) : 'undated'; if (!months.has(k)) months.set(k, []); months.get(k).push(x); });
  const perM = Array(12).fill(0); if (Y !== 'all') inY.forEach(x => { if (x.iso) perM[+x.iso.slice(5, 7) - 1]++; });
  const mx = Math.max(1, ...perM), mn = 'JFMAMJJASOND';
  const bars = Y === 'all' ? '' : `<div class="dv-bars">${perM.map((n, i) => `<button type="button" class="dv-bar" data-dv-jump="${Y}-${String(i + 1).padStart(2, '0')}" title="${escapeHtml(dvMonthName(+Y, i))}: ${n} listen${n === 1 ? '' : 's'}"${n ? '' : ' disabled'}><i style="height:${Math.max(2, Math.round(n / mx * 100))}%"></i><span>${mn[i]}</span></button>`).join('')}</div>`;
  const rated = inY.filter(x => Number(x.e.rating) > 0), avg = rated.length ? (rated.reduce((a, x) => a + Number(x.e.rating), 0) / rated.length).toFixed(1) : '–';
  const head = `<div class="dv-chips">${years.map(y => `<button type="button" class="dv-chip${y === Y ? ' active' : ''}" data-dv-year="${y}">${y}</button>`).join('')}<button type="button" class="dv-chip${Y === 'all' ? ' active' : ''}" data-dv-year="all">All years</button></div>
    <div class="dv-yr">${bars ? `<div class="dv-yrbars"><div class="dv-lbl">Listens each month · click one to jump there</div>${bars}</div>` : '<div class="dv-yrbars"></div>'}
      <div class="dv-yrstats"><div><b>${inY.length}</b><span>listens</span></div><div><b>${new Set(inY.map(x => dvKey(x.e))).size}</b><span>releases</span></div><div><b>${avg}</b><span>avg rating</span></div></div></div>`;
  let wall = '';
  months.forEach((xs, k) => {
    wall += `<div class="dv-mh" id="dv-m-${k}"><b>${k === 'undated' ? 'Undated' : escapeHtml(Y === 'all' ? dvMonthName(+k.slice(0, 4), +k.slice(5, 7) - 1) : dvMonthName(+k.slice(0, 4), +k.slice(5, 7) - 1).replace(/\s*\d{4}$/, ''))}</b><span>${xs.length} listen${xs.length === 1 ? '' : 's'}</span></div>`;
    wall += `<div class="dv-wall">${xs.map(x => { const key = diaryEntryKey(x.e), on = selectedDiaryKeys.has(key);
      return `<div class="dv-tile${on ? ' dv-on' : ''}" data-dv-entry="${escapeHtml(key)}">${sel ? `<label class="diary-select-checkbox diary-select-checkbox-grid"><input type="checkbox"${on ? ' checked' : ''} aria-label="Select entry"></label>` : ''}
        <div class="dv-tcv">${dvCover(x, 'dv-cv-fill')}${x.iso ? `<span class="dv-d">${+x.iso.slice(8)}</span>` : ''}${x.again ? '<span class="dv-ag">again</span>' : ''}${x.e.description ? '<span class="dv-nt" title="Has a note"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2h6M2 5h6M2 8h4" stroke="currentColor" stroke-width="1.2" fill="none"/></svg></span>' : ''}</div>
        <div class="dv-tt" title="${escapeHtml(x.e.entryTitle || x.e.title)}">${escapeHtml(x.e.title)}</div>${dvStars(x.e.rating)}</div>`; }).join('')}</div>`;
  });
  el.diaryContainer.className = 'dv-covers' + (sel ? ' diary-select-active' : '');
  el.diaryContainer.innerHTML = head + (wall || '<p class="diary-empty">No entries under this filter.</p>');
  dvWireEntries(list);
}

// ----- Calendar -----
function renderDiaryCalendar() {
  const all = dvEntries(), list = all.filter(dvPass), byDay = new Map();
  list.forEach(x => { if (!x.iso) return; if (!byDay.has(x.iso)) byDay.set(x.iso, []); byDay.get(x.iso).push(x); });
  if (!dvState.month) { const latest = (all.find(x => x.iso) || {}).iso, now = new Date(); dvState.month = latest && latest.slice(0, 7) < `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` ? latest.slice(0, 7) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; }
  const y = +dvState.month.slice(0, 4), m = +dvState.month.slice(5, 7) - 1, days = new Date(y, m + 1, 0).getDate(), lead = (new Date(y, m, 1).getDay() + 6) % 7, today = dvDayIso({ date: new Date() });
  if (!dvState.day || !dvState.day.startsWith(dvState.month)) { const firstLogged = [...byDay.keys()].filter(d => d.startsWith(dvState.month)).sort().pop(); dvState.day = firstLogged || (today.startsWith(dvState.month) ? today : `${dvState.month}-01`); }
  const perM = Array(12).fill(0); all.forEach(x => { if (x.iso && x.iso.startsWith(String(y))) perM[+x.iso.slice(5, 7) - 1]++; }); const mx = Math.max(1, ...perM);
  const months = perM.map((n, i) => { const lv = !n ? 0 : n / mx > 0.66 ? 3 : n / mx > 0.33 ? 2 : 1, k = `${y}-${String(i + 1).padStart(2, '0')}`;
    return `<button type="button" class="dv-mo l${lv}${k === dvState.month ? ' on' : ''}" data-dv-month="${k}" title="${escapeHtml(dvMonthName(y, i))}: ${n} listen${n === 1 ? '' : 's'}">${'JFMAMJJASOND'[i]}</button>`; }).join('');
  let cells = Array.from({ length: lead }, () => '<div class="dv-c out" aria-hidden="true"></div>').join('');
  for (let d = 1; d <= days; d++) {
    const iso = `${dvState.month}-${String(d).padStart(2, '0')}`, xs = byDay.get(iso) || [], a = xs[xs.length - 1], b = xs[xs.length - 2];
    cells += `<button type="button" class="dv-c${iso === today ? ' today' : ''}${iso === dvState.day ? ' sel' : ''}${a ? ' has' : ''}" data-dv-day="${iso}" aria-label="${escapeHtml(dvLong(iso))}: ${xs.length} listen${xs.length === 1 ? '' : 's'}">
      <span class="dv-n">${d}</span>${a ? dvCover(a, 'dv-c-cv') : ''}${b ? `<span class="dv-c-cv2">${dvCover(b, 'dv-cv-fill')}</span>` : ''}${xs.length > 2 ? `<span class="dv-c-more">+${xs.length - 2}</span>` : ''}${a && a.e.rating ? `<span class="dv-c-st">${starRatingHtml(a.e.rating)}</span>` : ''}</button>`;
  }
  const dayXs = (byDay.get(dvState.day) || []).slice().reverse();
  const panel = `<div class="dv-lbl">${escapeHtml(dvLong(dvState.day))}</div>${dayXs.length ? dayXs.map(x => `<div class="dv-pe">
      <div class="dv-pe-top">${dvCover(x, 'dv-cv-m')}<div>${x.e.entryTitle ? `<div class="dv-et">${escapeHtml(x.e.entryTitle)}</div>` : ''}<div class="dv-t">${escapeHtml(x.e.title)}</div><div class="dv-a">${dvSub(x)}</div>${dvStars(x.e.rating)}</div></div>
      ${x.e.description ? `<div class="dv-note">${escapeHtml(x.e.description)}</div>` : ''}${dvTags(x)}
      <div class="dv-acts"><button type="button" class="chip-btn" data-dv-entry-open="${escapeHtml(diaryEntryKey(x.e))}">Edit entry</button>${x.item ? `<button type="button" class="chip-btn" data-dv-open="${escapeHtml(diaryEntryKey(x.e))}">Open release</button><button type="button" class="chip-btn" data-dv-play="${escapeHtml(diaryEntryKey(x.e))}">Play</button>` : ''}</div></div>`).join('') : '<p class="diary-empty">Nothing logged this day.</p>'}`;
  el.diaryContainer.className = 'dv-calendar';
  el.diaryContainer.innerHTML = `<div class="dv-calmain" tabindex="0" aria-label="Diary calendar: arrow keys move day by day">
      <div class="dv-calhead"><button type="button" class="chip-btn" data-dv-step="-1" aria-label="Previous month">‹</button><b>${escapeHtml(dvMonthName(y, m))}</b><button type="button" class="chip-btn" data-dv-step="1" aria-label="Next month">›</button><button type="button" class="chip-btn" data-dv-today>Today</button><span class="dv-gapx"></span><div class="dv-months">${months}</div></div>
      <div class="dv-cal"><div class="dv-dh">MON</div><div class="dv-dh">TUE</div><div class="dv-dh">WED</div><div class="dv-dh">THU</div><div class="dv-dh">FRI</div><div class="dv-dh">SAT</div><div class="dv-dh">SUN</div>${cells}</div></div>
    <aside class="dv-calside">${panel}</aside>`;
  dvWireEntries(list);
}
function dvCalMove(days) { const d = new Date(dvState.day + 'T12:00:00'); d.setDate(d.getDate() + days); dvState.day = dvDayIso({ date: d }); dvState.month = dvState.day.slice(0, 7); renderDiary(); const c = el.diaryContainer.querySelector('.dv-calmain'); if (c) c.focus(); }

// ----- clicks (one handler for the container, wired once) -----
let dvList = [];
function dvWireEntries(list) { dvList = list; }
function dvFind(key) { return state.diary.find(e => diaryEntryKey(e) === key) || null; }
function dvWireOnce() {
  {
    const c = el.diaryContainer; if (!c || c.dataset.dvWired) return; c.dataset.dvWired = '1';
    c.addEventListener('click', (e) => {
      const g = (s) => e.target.closest(s); let b;
      if ((b = g('[data-dv-year]'))) { dvState.year = b.dataset.dvYear; renderDiary(); return; }
      if ((b = g('[data-dv-jump]'))) { const t = document.getElementById('dv-m-' + b.dataset.dvJump); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      if ((b = g('[data-dv-month]'))) { dvState.month = b.dataset.dvMonth; dvState.day = null; renderDiary(); return; }
      if ((b = g('[data-dv-step]'))) { const d = new Date(+dvState.month.slice(0, 4), +dvState.month.slice(5, 7) - 1 + Number(b.dataset.dvStep), 1); dvState.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; dvState.day = null; renderDiary(); return; }
      if (g('[data-dv-today]')) { const t = dvDayIso({ date: new Date() }); dvState.month = t.slice(0, 7); dvState.day = t; renderDiary(); return; }
      if ((b = g('[data-dv-day]'))) { dvState.day = b.dataset.dvDay; renderDiary(); const m = el.diaryContainer.querySelector('.dv-calmain'); if (m) m.focus(); return; }
      if ((b = g('[data-dv-play]'))) { const en = dvFind(b.dataset.dvPlay), it = en && matchAlbumForEntry(en); if (it && typeof playAlbumNow === 'function') playAlbumNow(it); return; }
      if ((b = g('[data-dv-open]')) && !state.diarySelectMode) { e.stopPropagation(); const en = dvFind(b.dataset.dvOpen), it = en && matchAlbumForEntry(en); if (it) { switchTab('albums'); openDeck(it); } else if (en) openDiaryEntryModal(en); return; }
      if ((b = g('[data-dv-entry-open]'))) { const en = dvFind(b.dataset.dvEntryOpen); if (en) openDiaryEntryModal(en); return; }
      if ((b = g('[data-dv-entry]'))) {
        const en = dvFind(b.dataset.dvEntry); if (!en) return;
        if (g('.diary-select-checkbox')) { if (e.target.tagName === 'INPUT') { e.stopPropagation(); toggleDiarySelection(en); } return; }
        if (e.shiftKey && typeof selectDiaryRange === 'function') { e.preventDefault(); const sorted = dvList.map(x => x.e), i = sorted.indexOf(en); if (i >= 0) selectDiaryRange(sorted, i); return; }
        if (state.diarySelectMode) { toggleDiarySelection(en); return; }
        openDiaryEntryModal(en);
      }
    });
    c.addEventListener('keydown', (e) => {
      if ((state.diaryViewMode || 'feed') !== 'calendar' || !e.target.closest('.dv-calmain')) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!step) return;
      e.preventDefault(); dvCalMove(step);
    });
    const cal = document.getElementById('diaryViewCalendarBtn'); if (cal) cal.addEventListener('click', () => setDiaryViewMode('calendar'));
    document.querySelectorAll('[data-diary-filter]').forEach(b => b.addEventListener('click', () => { dvState.filter = b.dataset.diaryFilter; renderDiary(); }));
  }
}
