// (1.135.180) After adding: one card from added to ready (canvas: CRATE adding a release, board C).
// Bottom right, above the player: each release added this visit, through Added → Rate Your Music → Tracklist → Matching → Ready, filled in as
// it happens (it reads what's already going on: the RYM queue, the tracklist, Match songs). One release: the steps in a line, with Play
// what's ready, Open, and Add another. Several: a row each, with where it's got to. When everything is ready it says what came of it (songs
// linked, any to check) and hides itself a little later, unless a song wants a check.
const ap = { list: [], hideAt: 0, closed: false };
function apItem(e) { const k = mqKey(e.a, e.t); return (state.raw || []).find(r => mqKey(r.artist, r.title) === k) || null; }
function apSteps(e) {
  const it = apItem(e), st = { added: it ? 'done' : 'now', rym: 'next', tl: 'next', match: 'next', ready: 'next', n: 0, of: 0, look: 0, songs: 0, linked: 0 };
  if (!it) return st;
  const row = String(it.row), running = typeof rymFetchState !== 'undefined' && rymFetchState.active && (jobsState.runRows || []).includes(row), waiting = (jobsState.waiting || []).some(w => (w.rows || []).includes(row));
  const wants = typeof rymUpdateAddedPick === 'function' && rymUpdateAddedPick([it]).length && rymOutState.present;
  st.rym = it.rymUpdated ? 'done' : running ? 'now' : waiting ? 'wait' : wants && Date.now() - e.at < 5 * 60e3 ? 'wait' : 'skip';
  const tl = (state.trackCache && state.trackCache[artKey(it)]) || null, rel = typeof mlRel === 'function' ? mlRel(it) : null;
  st.songs = rel && rel.songs ? rel.songs.length : tl ? tl.filter(t => t && t.trackName).length : 0;
  st.tl = st.songs ? 'done' : st.rym === 'done' || st.rym === 'skip' ? 'now' : 'next';
  const inQueue = typeof mqAll === 'function' && mqAll().some(x => mqKey(x.a, x.t) === mqKey(it.artist, it.title)), pend = typeof bmAuto !== 'undefined' && bmAuto.pending.some(p => p.k === mqKey(it.artist, it.title));
  if (rel && rel.songs) { const c = mlCounts(rel); st.n = c.done; st.of = c.total; st.look = c.look; st.match = c.done < c.total && bm.running && !bm.stopped ? 'now' : 'done'; }
  else if (inQueue || pend) st.match = 'wait';
  else { const ls = typeof bmLinkState === 'function' ? bmLinkState(it) : null; if (ls && ls.length) { st.linked = ls.filter(x => x.sp || x.yt).length; st.of = ls.length; if (!st.songs) { st.songs = ls.length; st.tl = 'done'; } if (st.linked === ls.length || !(typeof smPrefs === 'function' && smPrefs().autoMatchNew)) st.match = 'done'; } }
  if (rel && rel.songs) { const ls = typeof bmLinkState === 'function' ? bmLinkState(it) : null; st.linked = Math.max(st.n - st.look, ls ? ls.filter(x => x.sp || x.yt).length : 0); }
  if (st.match === 'done' && st.rym !== 'now' && st.rym !== 'wait') st.ready = 'done';
  else if (st.match === 'done' || (st.songs && !(typeof smPrefs === 'function' && smPrefs().autoMatchNew) && st.rym !== 'wait' && st.rym !== 'now')) st.ready = 'done';
  return st;
}
function apPill(s) {
  if (s.ready === 'done') return s.look ? [`READY · ${s.look} TO CHECK`, 'look'] : [`READY${s.of ? ` · ${s.linked}/${s.of}` : ''}`, 'ok'];
  if (s.match === 'now') return [`MATCHING ${s.n}/${s.of}`, 'now'];
  if (s.match === 'wait') return [s.rym === 'wait' || s.rym === 'now' ? 'WAITS FOR RYM' : 'MATCH QUEUED', 'wait'];
  if (s.rym === 'now') return ['UPDATING FROM RYM', 'now'];
  if (s.rym === 'wait') return ['WAITS FOR RYM', 'wait'];
  if (s.tl !== 'done') return ['FINDING ITS SONGS', 'now'];
  return ['ADDED', 'wait'];
}
function apPaint() {
  let card = document.getElementById('apCard');
  const list = ap.list.slice(-6); if (!list.length || ap.closed) { if (card) card.remove(); return; }
  const rows = list.map(e => ({ e, it: apItem(e), s: apSteps(e) })), allReady = rows.every(r => r.s.ready === 'done'), anyLook = rows.some(r => r.s.look);
  if (allReady && !anyLook) { if (!ap.hideAt) ap.hideAt = Date.now() + 9000; if (Date.now() > ap.hideAt) { ap.list = []; ap.hideAt = 0; if (card) card.remove(); return; } } else ap.hideAt = 0;
  if (!card) { card = document.createElement('section'); card.id = 'apCard'; card.className = 'ap-card'; card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite'); document.body.appendChild(card); }
  const cv = (it) => it && it.cover ? `<img src="${escapeHtml(it.cover)}" alt="" class="ap-cv">` : '<span class="ap-cv ap-nocv"></span>';
  let html;
  if (rows.length === 1) {
    const { e, it, s } = rows[0], k = escapeHtml(mqKey(e.a, e.t));
    const step = (key, label, sub) => `<div class="ap-st ap-${s[key] === 'skip' ? 'done ap-skip' : s[key]}"><i>${s[key] === 'done' ? '✓' : s[key] === 'skip' ? '–' : ''}</i><span>${label}${sub ? `<br>${sub}` : ''}</span></div>`;
    const pct = [s.added, s.rym, s.tl, s.match, s.ready].filter(x => x === 'done' || x === 'skip').length / 5 * 100 + (s.match === 'now' && s.of ? s.n / s.of * 20 : 0);
    html = `<div class="ap-top">${cv(it)}<div class="ap-t"><b>${escapeHtml(e.t)}${s.ready === 'done' ? ' is ready' : ''}</b><span>${escapeHtml(e.a)} · ${s.ready === 'done' ? `${s.songs || s.of} songs · ${s.linked} linked${s.look ? ` · <em>${s.look} to check</em>` : ''}` : 'added just now'}</span></div><button type="button" class="ap-x" data-ap="x" aria-label="Hide">×</button></div>
      ${s.ready === 'done' ? '' : `<div class="ap-steps">${step('added', 'Added')}${step('rym', 'Rate Your Music', s.rym === 'skip' ? 'skipped' : '')}${step('tl', 'Tracklist', s.songs ? `${s.songs} songs` : '')}${step('match', 'Matching', s.match === 'now' && s.of ? `${s.n}/${s.of}` : s.match === 'wait' ? 'queued' : '')}${step('ready', 'Ready')}</div>
      <div class="ap-bar"><u style="width:${Math.min(100, pct).toFixed(0)}%"></u></div>`}
      <div class="ap-acts"><button type="button" class="${s.ready === 'done' ? 'ap-pri' : ''}" data-ap="play" data-k="${k}">▶ ${s.ready === 'done' ? 'Play' : 'Play what’s ready'}</button>${s.look ? `<button type="button" data-ap="check" data-k="${k}">Check ${s.look} song${s.look === 1 ? '' : 's'}</button>` : `<button type="button" data-ap="open" data-k="${k}">Open</button>`}<span></span><button type="button" data-ap="another">Add another</button></div>`;
  } else {
    const nReady = rows.filter(r => r.s.ready === 'done').length, nMatch = rows.filter(r => r.s.match === 'now').length, nRym = rows.filter(r => r.s.rym === 'wait' || r.s.rym === 'now').length;
    html = `<div class="ap-top"><div class="ap-t"><b>Adding ${rows.length} releases</b><span>${[nReady ? `${nReady} ready` : '', nMatch ? `${nMatch} matching` : '', nRym ? `${nRym} waiting for RYM` : ''].filter(Boolean).join(' · ')}</span></div><button type="button" class="ap-x" data-ap="x" aria-label="Hide">×</button></div>
      ${rows.slice().reverse().map(({ e, it, s }) => { const [p, tone] = apPill(s); return `<button type="button" class="ap-row" data-ap="${s.look ? 'check' : 'open'}" data-k="${escapeHtml(mqKey(e.a, e.t))}">${cv(it)}<span class="ap-rt"><b>${escapeHtml(e.t)}</b><em>${escapeHtml(e.a)}</em></span><span class="ap-pill ap-${tone}">${p}</span></button>`; }).join('')}`;
  }
  if (card.dataset.h !== html) { card.dataset.h = html; card.innerHTML = html; }
}
(function () {
  // what's been added: from the save itself (Add a release, Add several, imports)
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof postUpdate !== 'function') return; const base = postUpdate;
    postUpdate = async function (payload) {
      const r = await base.apply(this, arguments);
      try {
        const add = (a, t) => { if (!a || !t) return; const k = mqKey(a, t); if (ap.list.some(x => mqKey(x.a, x.t) === k)) return; ap.list.push({ a: String(a), t: String(t), at: Date.now() }); ap.closed = false; ap.hideAt = 0; };
        if (payload && payload.action === 'addAlbum') add(payload.Artist, payload.Title);
        else if (payload && payload.action === 'addAlbums' && Array.isArray(payload.albums) && payload.albums.length <= 50) payload.albums.forEach(x => add(x && (x.Artist || x.artist), x && (x.Title || x.title)));
        if (ap.list.length) apPaint();
      } catch (e) { /* no card */ }
      return r;
    };
  });
  setInterval(() => { try { if (ap.list.length) apPaint(); } catch (e) { /* next tick */ } }, 1000);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#apCard [data-ap]'); if (!b) return;
    const k = b.dataset.k, entry = k ? ap.list.find(x => mqKey(x.a, x.t) === k) : null, it = entry ? apItem(entry) : null, a = b.dataset.ap;
    if (a === 'x') { ap.closed = true; apPaint(); return; }
    if (a === 'another') { if (typeof openAddModal === 'function') openAddModal(); return; }
    if (!it) { flashGlobalToast('It’s still being saved: a moment.'); return; }
    if (a === 'play') { if (typeof playAlbumReplacingQueue === 'function') playAlbumReplacingQueue(it); }
    else if (a === 'check') { const rel = typeof mlRel === 'function' ? mlRel(it) : null; if (rel && typeof bmShow === 'function') { bm.sel = rel.row; bmShow(); } else if (typeof openSongMatcher === 'function') openSongMatcher(it, {}); }
    else if (a === 'open') { if (typeof openDeck === 'function') openDeck(it); }
  });
})();
