// ---- Fill blanks: a new release, after its first Rate Your Music update and before Match songs, has what it is still missing filled from the
// sources you put in order (⚙ → RYM ratings → "Fill blanks from other sources"): song lengths (RYM has none), the release date (or a year made
// a full date), the label, the cover. Only blanks are filled; nothing you have is replaced. Each source is asked at most once per release, and
// only when a blank needs it. What none of them had waits for you in Processing → Needs you, where "Pull details" opens the side-by-side window. ----
const AF_DETAILS = [['lengths', 'Song lengths'], ['date', 'Release date'], ['label', 'Label'], ['cover', 'Cover']];
const AF_SOURCES = ['mb', 'sp', 'it', 'dc'];                          // (RYM is the step before; these are the others Pull details knows)
const AF_DEFAULT = { lengths: ['mb', 'sp', 'it'], date: ['mb', 'sp'], label: ['mb', 'dc'], cover: ['mb', 'sp', 'it'] };
const AF_LEFT_KEY = 'crate_fill_left_v1';
const af = { pending: [], running: null, timer: 0, done: new Set() };
const afKey = (it) => mqKey(it.artist, it.title);
const afSrcName = (k) => (PD_SRC.find(s => s[0] === k) || [k, k])[1];
function afOrder() {                                                  // your order for each detail (a detail with no source is never filled)
  const o = state.afOrder && typeof state.afOrder === 'object' ? state.afOrder : {}, out = {};
  AF_DETAILS.forEach(([d]) => { const v = Array.isArray(o[d]) ? o[d].filter(k => AF_SOURCES.includes(k)) : AF_DEFAULT[d]; out[d] = [...new Set(v)]; });
  return out;
}
function afLeftAll() { try { const a = JSON.parse(localStorage.getItem(AF_LEFT_KEY) || '[]'); return Array.isArray(a) ? a.filter(e => e && e.k) : []; } catch (e) { return []; } }
function afLeftSave(a) { try { localStorage.setItem(AF_LEFT_KEY, JSON.stringify(a.slice(-200))); } catch (e) { /* kept for this visit only */ } }
function afLeftDrop(k) { afLeftSave(afLeftAll().filter(e => e.k !== k)); if (typeof jobsRefresh === 'function') jobsRefresh(); }

// ----- the queue: releases just added (the quiet sync's new rows), each waiting for its RYM update first -----
function afQueueAdded(added) {
  if (!state.afOn) return;
  (added || []).forEach(it => { if (it && it.artist && it.title && !af.pending.some(p => p.k === afKey(it))) af.pending.push({ k: afKey(it), at: Date.now() }); });
  afKick(3000);
}
function afPending(it) { const k = afKey(it); return !!state.afOn && (af.pending.some(p => p.k === k) || !!(af.running && af.running.k === k)); }          // Match songs waits for these
function afKick(ms) { clearTimeout(af.timer); af.timer = setTimeout(afNext, ms == null ? 0 : ms); }
async function afNext() {
  af.timer = 0; if (af.running || !af.pending.length) return;
  if (!state.afOn) { af.pending = []; return; }
  const byKey = new Map(); state.raw.forEach(r => { const k = afKey(r); if (!byKey.has(k)) byKey.set(k, r); });
  af.pending = af.pending.filter(p => byKey.has(p.k) || Date.now() - p.at < 120000);          // (one that never reaches the list is let go after two minutes)
  const p = af.pending.find(x => byKey.has(x.k) && !rymAddHolding(byKey.get(x.k)));          // its RYM update first (see rymAddHolding)
  if (!p) { if (af.pending.length) afKick(10000); return; }
  af.pending = af.pending.filter(x => x !== p);
  const item = byKey.get(p.k);
  af.running = { k: p.k, title: item.title };
  if (typeof jobsRefresh === 'function') jobsRefresh();
  try { await afFill(item); } catch (e) { console.warn('Fill blanks failed', item, e); }
  af.running = null; af.done.add(p.k);
  if (typeof jobsRefresh === 'function') jobsRefresh();
  afKick(af.pending.length ? 1500 : 0);
}

// ----- one release -----
function afLenFrom(tracks, song, i, n) {                              // a source's length for one of your songs: by title, else by place when both lists are as long
  if (!tracks || !tracks.length) return 0;
  const want = pdNorm(song.title), hit = tracks.find(t => pdNorm(t.title) === want) || (tracks.length === n ? tracks[i] : null);
  return hit ? hit.durationMs || 0 : 0;
}
function afDateFits(have, got) { return !!got && (!have || (/^\d{4}$/.test(have) && String(got).startsWith(have) && String(got).length > 4)); }          // a blank, or a year made a full date in that same year
async function afFill(item) {
  const order = afOrder(), cache = {};
  const ask = (k) => cache[k] || (cache[k] = PD_FETCH[k](item).then(d => d || {}, e => ({ err: String((e && e.message) || e) })));
  try { await getTracksFor(item); } catch (e) { /* no tracklist to fill */ }
  const manual = isManualAlbum(item), rows = currentTracklistAsManualRows(item).filter(r => r.title);
  const want = {
    lengths: manual && order.lengths.length ? rows.map((r, i) => (r.durationMs > 0 ? -1 : i)).filter(i => i >= 0) : [],
    date: order.date.length && (!item.releaseDate || /^\d{4}$/.test(String(item.releaseDate))),
    label: order.label.length && !String(item.label || '').trim(),
    cover: order.cover.length && !String(item.cover || '').trim()
  };
  const payload = { action: 'editAlbum', row: item.row }, got = [];
  for (const d of ['date', 'label', 'cover']) {
    if (!want[d]) continue;
    for (const k of order[d]) {
      const s = await ask(k), v = s && !s.err ? String(s[d] || '').trim() : '';
      if (!v) continue;
      if (d === 'date' && !afDateFits(String(item.releaseDate || ''), v)) continue;
      if (d === 'cover' && !(await cxProbe(v))) continue;          // saved only if it loads from here
      payload[{ date: 'ReleaseDate', label: 'Label', cover: 'Cover' }[d]] = v; got.push(`${d === 'date' ? 'release date' : d} from ${afSrcName(k)}`); want[d] = false; break;
    }
  }
  let lens = 0; const by = {};
  if (want.lengths.length) {
    const left = new Set(want.lengths);
    for (const k of order.lengths) {
      if (!left.size) break;
      const s = await ask(k); if (!s || s.err || !(s.tracks || []).length) continue;
      [...left].forEach(i => { const ms = afLenFrom(s.tracks, rows[i], i, rows.length); if (ms > 0) { rows[i].durationMs = ms; left.delete(i); lens++; by[afSrcName(k)] = (by[afSrcName(k)] || 0) + 1; } });
    }
    want.lengths = [...left];
    if (lens) got.push(`${lens} song length${lens === 1 ? '' : 's'} (${Object.entries(by).map(([s, n]) => `${n} from ${s}`).join(', ')})`);
  }
  if (Object.keys(payload).length > 2) {
    await postUpdate(payload);
    if (payload.ReleaseDate) item.releaseDate = payload.ReleaseDate; if (payload.Label) item.label = payload.Label; if (payload.Cover) item.cover = payload.Cover;
  }
  if (lens) await saveManualTracklist(item, rows, true);
  if (got.length) { rymRefreshViews(); scheduleCatalogSync(); jobsDone('fill', `Filled blanks of “${item.title}”: ${got.join(', ')}`, { k: afKey(item) }); }
  // what none of your sources had: for you, in Processing
  const missing = [];
  if (!rows.length && order.lengths.length) missing.push('a tracklist');
  if (want.lengths.length) missing.push(`${want.lengths.length} song length${want.lengths.length === 1 ? '' : 's'}`);
  if (want.date) missing.push('the release date'); if (want.label) missing.push('the label'); if (want.cover) missing.push('the cover');
  const k = afKey(item), list = afLeftAll().filter(e => e.k !== k);
  if (missing.length) list.push({ k, row: String(item.row), artist: item.artist, title: item.title, missing, t: Date.now() });
  afLeftSave(list);
  return { got, missing };
}

// ----- Processing: the one filling now, and what is left for you -----
// Processing has a tab of its own for this step ("Pull details"): there each release with blanks left is a row of its own, and each one filled
// today (under Done today) can be opened to see or change what was taken.
const afItemOf = (k) => state.raw.find(x => afKey(x) === k) || null;
function afOpenFor(k) { const it = afItemOf(k); if (it) pdOpen(it); }
function afDoneAct(e) { return e.k && afItemOf(e.k) ? { label: 'Pull details', fn: () => afOpenFor(e.k), opens: true } : null; }
function afJobs(run, need, wait) {
  if (af.running) run.push({ cat: 'fill', icon: 'layers', title: 'Filling blanks', sub: 'from other sources', detail: af.running.title });
  if (state.afOn) {
    const byKey = new Map(state.raw.map(x => [afKey(x), x]));
    af.pending.forEach(p => { const it = byKey.get(p.k); if (it) wait.push({ cat: 'fill', icon: 'layers', title: it.title, sub: it.artist, right: rymAddHolding(it) ? 'after its RYM update' : 'next', acts: [{ label: 'Pull details now', fn: () => pdOpen(it), opens: true }] }); });
  }
  const left = afLeftAll().filter(e => afItemOf(e.k));
  if (left.length && jobsState.filter === 'fill') {                  // the tab: one row per release
    left.forEach(e => need.push({ cat: 'fill', icon: 'layers', title: e.title, sub: e.artist, detail: 'No source had ' + e.missing.join(', '),
      acts: [{ label: 'Pull details', fn: () => { afLeftDrop(e.k); afOpenFor(e.k); }, opens: true, primary: true }, { label: 'Skip', fn: () => afLeftDrop(e.k) }] }));
  } else if (left.length) {
    const first = left[0], it = state.raw.find(x => afKey(x) === first.k);
    need.push({ cat: 'fill', icon: 'layers', title: `${jobsPl(left.length, 'release')} with blanks no source filled`, detail: `${first.title}: ${first.missing.join(', ')}${left.length > 1 ? ` · and ${left.length - 1} more` : ''}`,
      acts: [it ? { label: 'Pull details', fn: () => { afLeftDrop(first.k); pdOpen(it); }, opens: true, primary: true } : null, { label: 'Skip', fn: () => afLeftDrop(first.k) }, left.length > 1 ? { label: 'Skip all', fn: () => { afLeftSave([]); jobsRefresh(); } } : null].filter(Boolean) });
  }
}

// ----- the setting (⚙ → RYM ratings) -----
function afRenderSettings() {
  const box = document.getElementById('afOrderBox'), on = document.getElementById('afOn'); if (!box || !on) return;
  on.checked = !!state.afOn; box.classList.toggle('af-off', !state.afOn);
  const order = afOrder(), opt = (sel) => `<option value="">—</option>` + AF_SOURCES.map(k => `<option value="${k}"${sel === k ? ' selected' : ''}>${escapeHtml(afSrcName(k))}</option>`).join('');
  box.innerHTML = AF_DETAILS.map(([d, n]) => `<div class="af-row"><span class="af-l">${n}</span>${[0, 1, 2].map(i => `${i ? '<span class="af-then">then</span>' : ''}<select data-af-d="${d}" data-af-i="${i}" aria-label="${n}: source ${i + 1}">${opt(order[d][i])}</select>`).join('')}</div>`).join('');
}
function initFillBlanks() {
  const on = document.getElementById('afOn'), box = document.getElementById('afOrderBox'); if (!on || !box) return;
  on.addEventListener('change', () => { state.afOn = on.checked; savePrefs(); afRenderSettings(); });
  box.addEventListener('change', (e) => {
    const s = e.target.closest('select[data-af-d]'); if (!s) return;
    const d = s.dataset.afD, picks = [...box.querySelectorAll(`select[data-af-d="${d}"]`)].map(x => x.value).filter(Boolean);
    state.afOrder = Object.assign({}, afOrder(), { [d]: [...new Set(picks)] }); savePrefs(); afRenderSettings();
  });
  afRenderSettings();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFillBlanks); else initFillBlanks();
