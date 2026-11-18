// CRATE — what's being worked on, shown on the covers themselves.
// One part of the page's script, split by feature (see 01-core.js).
//
// While Processing runs an Update from Rate Your Music or Match songs, each release's cover in the Music panel (grid and covers views)
// says so: "Updating" or "Matching" with a moving bar along its foot while it's being worked on (Matching also shows how far, as it goes
// through Spotify and YouTube), and a quieter "Queued" while it waits its turn (a later RYM run, the match queue, or later in this run).
// Nothing is drawn when nothing runs. Checked once a second while something runs, every few seconds otherwise; a cover drawn again (a
// scroll, a filter) gets its label back on the next check.

const CJ_TICK = 1000, CJ_IDLE = 3000;
let cjTimer = 0, cjShown = new Map();             // row -> the key of what its label shows, so an unchanged label isn't redrawn

// row (as text) -> { kind: 'rym' | 'match', phase: 'work' | 'wait', pct (0–100, or null) }
function cjStates() {
  const out = new Map(), put = (row, s) => { row = String(row); const had = out.get(row); if (!had || (had.phase === 'wait' && s.phase === 'work')) out.set(row, s); };
  try {                                                                                     // Update from Rate Your Music
    const q = state.rymQueueMode && rymQ.run && /starting|loading|gap/.test(rymQ.run.state || '') ? rymQ.run : null;
    if (q) rymQ.runEntries.forEach(e => { if (e.state === 'reading') put(e.row, { kind: 'rym', phase: 'work', pct: null }); else if (e.state === 'queued' || e.state === 'waiting') put(e.row, { kind: 'rym', phase: 'wait', pct: null }); });
    else if (rymFetchState.active && (jobsState.runRows || []).length) {
      const r = jobsState.rymLast || {}, i = r.i != null ? r.i : (r.done || 0);
      jobsState.runRows.forEach((row, k) => { if (k === i) put(row, { kind: 'rym', phase: 'work', pct: null }); else if (k > i) put(row, { kind: 'rym', phase: 'wait', pct: null }); });
    }
    (jobsState.waiting || []).forEach(w => (w.rows || []).forEach(row => put(row, { kind: 'rym', phase: 'wait', pct: null })));
  } catch (e) { /* the RYM part isn't there */ }
  try {                                                                                     // Match songs
    if (typeof bm !== 'undefined' && bm && bm.started && bm.running) {
      const ks = bmKinds();
      bm.rels.forEach(r => {
        if (!r.include || !r.st) return;
        const sts = ks.map(k => r.st[k]), left = sts.filter(s => s === 'wait' || s === 'work').length;
        if (!left) return;
        let pct = ks.length ? (ks.length - left) / ks.length * 100 : 0, n = 0, of = 0;
        if (r.songs && typeof mlCounts === 'function') { const c = mlCounts(r); n = c.done; of = c.total; if (of) pct = n / of * 100; }          // (1.135.176) songs done, not services
        put(r.row, { kind: 'match', phase: sts.includes('work') && !bm.paused ? 'work' : 'wait', pct: sts.includes('work') ? pct : null, n, of });
      });
    }
    if (typeof bm !== 'undefined' && bm && bm.started && !bm.running && typeof mlCounts === 'function') bm.rels.forEach(r => { if (!r.include || !r.songs) return; const c = mlCounts(r); if (c.look) put(r.row, { kind: 'match', phase: 'check', pct: null, n: c.look }); });          // (afterwards: songs that want a check)
    if (!(typeof bm !== 'undefined' && bm && bm.started && bm.scope === 'queue') && typeof mqItems === 'function') mqItems().forEach(it => put(it.row, { kind: 'match', phase: 'wait', pct: null, rym: typeof rymAddHolding === 'function' && rymAddHolding(it) }));
  } catch (e) { /* the matcher isn't there */ }
  return out;
}

function cjLabel(s) {
  if (s.kind === 'rym') return s.phase === 'work' ? 'Updating' : 'Queued · RYM';
  if (s.phase === 'check') return `${s.n} to check`;
  if (s.phase === 'work') return s.of ? `Matching ${s.n}/${s.of}` : 'Matching';
  return s.rym ? 'Queued · waits for RYM' : 'Queued · match';
}
function cjClear(card) {
  card.classList.remove('cj-work', 'cj-wait');
  const t = card.querySelector(':scope > .cj-tag'); if (t) t.remove();
  if (card.dataset.cjTitle !== undefined) { if (card.dataset.cjTitle) card.title = card.dataset.cjTitle; else card.removeAttribute('title'); delete card.dataset.cjTitle; }
}
function cjPaint() {
  const states = cjStates(), grid = document.getElementById('gridWrap');
  if (grid) {
    // labels to take off: rows that no longer have one, or whose card was drawn again without it
    grid.querySelectorAll('.cj-badge').forEach(b => { const card = b.closest('[data-album-row]'); if (!card || !states.has(card.dataset.albumRow) || card.classList.contains('card-shell') || !b.parentElement.classList.contains('art-wrap')) { b.remove(); if (card) cjClear(card); } });
    states.forEach((s, row) => {
      // (1.126.0) only a cover that's drawn: an off-screen placeholder (card-shell) has no artwork to sit on, so its label floated loose
      // over the grid. It gets its label once it's drawn, on the next check.
      const card = grid.querySelector(`.card[data-album-row="${CSS.escape(row)}"]:not(.card-shell)`); if (!card) return;
      const wrap = card.querySelector('.art-wrap'); if (!wrap) return;
      let b = wrap.querySelector(':scope > .cj-badge');
      const key = [s.kind, s.phase, s.pct == null ? '' : Math.round(s.pct), s.n || '', s.of || '', s.rym ? 1 : ''].join('|');
      if (b && b.dataset.k === key) return;
      if (!b) { b = document.createElement('div'); b.className = 'cj-badge'; b.setAttribute('aria-hidden', 'true'); wrap.appendChild(b); }
      b.dataset.k = key; b.className = `cj-badge cj-${s.kind} cj-${s.phase}`;
      card.classList.toggle('cj-work', s.phase === 'work'); card.classList.toggle('cj-wait', s.phase === 'wait');
      // (1.124.1) the cover's own hover text is kept and given back afterwards; the label goes after it (never a bare " — Updating")
      if (card.dataset.cjTitle === undefined) card.dataset.cjTitle = card.getAttribute('title') || '';
      card.title = (card.dataset.cjTitle ? card.dataset.cjTitle + ' \u2014 ' : '') + cjLabel(s);
      // (1.124.1) in list view the cover is 48 px: the label goes at the end of the row instead (the cover keeps its bar)
      let tag = card.querySelector(':scope > .cj-tag');
      if (!tag) { tag = document.createElement('span'); tag.className = 'cj-tag'; tag.setAttribute('aria-hidden', 'true'); card.appendChild(tag); }
      tag.className = `cj-tag cj-${s.kind} cj-${s.phase}`; tag.textContent = cjLabel(s) + (s.phase === 'work' && s.pct != null && !s.of ? ` ${Math.round(s.pct)}%` : '');
      b.innerHTML = `<span class="cj-pill">${s.phase === 'work' ? '<i class="cj-spin"></i>' : ''}${cjLabel(s)}</span>`
        + (s.phase === 'work' ? `<span class="cj-bar${s.pct == null ? ' cj-indef' : ''}"><b style="width:${s.pct == null ? 35 : Math.max(6, s.pct)}%"></b></span>` : '');
    });
  }
  cjShown = states;
  clearTimeout(cjTimer); cjTimer = setTimeout(cjPaint, states.size ? CJ_TICK : CJ_IDLE);
}
setTimeout(cjPaint, 2000);
