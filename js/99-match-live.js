// (1.135.176) Match songs, seen as it happens (canvas: CRATE matching progress in the deck, boards B and C; A as a setting).
//   The cover popup's tracklist: while a release is being matched, each song's red ! becomes a live dot (✓ linked, half for one service of
//   two, ? to check, spinning while it's searched, dashed while it waits, × nothing found), and a bar under the header says how far it's got
//   (songs done, Spotify and YouTube found, how many to check), with Stop and Open Match songs. The popup's ⚙ has "While matching, show
//   where each song was found": the dot becomes Spotify and YouTube chips with how sure each match is (board A).
//   The covers in the grid say "Matching 6/10" as it goes, "Queued · waits for RYM" before, and "1 to check" after (js/52-cover-jobs.js).
const ML_DETAIL_KEY = 'crate_ml_detail_v1';
function mlDetail() { try { return localStorage.getItem(ML_DETAIL_KEY) === '1'; } catch (e) { return false; } }
function mlKinds() { try { return bmKinds(); } catch (e) { return ['spotify', 'youtube']; } }
function mlRel(item) { if (typeof bm === 'undefined' || !bm || !bm.started || !item) return null; return bm.rels.find(r => r.include && r.row === String(item.row)) || null; }
function mlSong(rel, num, name) {
  if (!rel || !rel.songs) return null; const n = Number(num) || 0, nm = String(name || '').trim().toLowerCase();
  return (n && rel.songs.find(s => s.trackNum === n)) || rel.songs.find(s => String(s.title || s.trackName || '').trim().toLowerCase() === nm) || null;
}
// one song's state across the services being matched: ok | half | look | run | wait | no
function mlState(rel, s) {
  const cells = mlKinds().map(k => ({ k, c: bmCellOf(rel, s, k), lane: rel.st[k] }));
  const found = cells.filter(x => x.c.s === 'kept' || x.c.s === 'confident'), look = cells.filter(x => x.c.s === 'look'), wait = cells.filter(x => x.c.s === 'wait');
  let d;
  if (found.length === cells.length) d = 'ok';
  else if (look.length) d = 'look';
  else if (wait.length) d = found.length ? 'half' : cells.some(x => x.c.s === 'wait' && x.lane === 'work') ? 'run' : 'wait';
  else d = found.length ? 'half' : 'no';
  return { d, cells };
}
function mlCounts(rel) {
  const o = { total: 0, done: 0, look: 0, none: 0, by: {} }; mlKinds().forEach(k => { o.by[k] = 0; });
  (rel.songs || []).forEach(s => { const st = mlState(rel, s); o.total++; if (st.d !== 'run' && st.d !== 'wait') o.done++; if (st.d === 'look') o.look++; if (st.d === 'no') o.none++;
    st.cells.forEach(x => { if (x.c.s === 'kept' || x.c.s === 'confident') o.by[x.k]++; }); });
  return o;
}
const ML_TIP = { ok: 'Linked', half: 'Found on one service so far', look: 'Found, but wants a check: click to pick', run: 'Being searched now', wait: 'Waiting its turn', no: 'Nothing found' };
const ML_SHORT = { spotify: 'SP', youtube: 'YT' };
function mlSongHtml(rel, s, spinIdx) {
  const st = mlState(rel, s); let d = st.d; if (d === 'run' && s.idx !== spinIdx) d = 'wait';
  const attrs = `data-ml-row="${escapeHtml(rel.row)}" data-ml-track="${escapeHtml(String(s.trackNum || ''))}"`;
  if (!mlDetail()) return `<i class="ml-dot ml-${d}" ${attrs} role="img" aria-label="${ML_TIP[d]}" title="${ML_TIP[d]}">${d === 'ok' ? '✓' : d === 'look' ? '?' : d === 'no' ? '×' : ''}</i>`;
  return `<span class="ml-chips" ${attrs}>${st.cells.map(x => {
    const sh = ML_SHORT[x.k] || x.k, sc = x.c.top && x.c.top.score != null ? Math.round(x.c.top.score) : '';
    if (x.c.s === 'kept') return `<i class="ml-c ml-${x.k}" title="Already linked">${sh}</i>`;
    if (x.c.s === 'confident') return `<i class="ml-c ml-${x.k}" title="${sh === 'SP' ? 'Spotify' : 'YouTube'}: ${sc} sure">${sh} ${sc}</i>`;
    if (x.c.s === 'look') return `<i class="ml-c ml-chk" title="Wants a check: click to pick">${sh} ? ${sc}</i>`;
    if (x.c.s === 'wait') return `<i class="ml-c ml-w">${x.lane === 'work' && s.idx === spinIdx ? 'searching…' : 'waiting'}</i>`;
    return `<i class="ml-c ml-n">not on ${sh}</i>`;
  }).join('')}</span>`;
}
function mlPaint() {
  const qp = typeof el !== 'undefined' && el && el.albumQuickPeek; if (!qp || qp.hidden || typeof quickPeekItem === 'undefined' || !quickPeekItem) return;
  const rel = mlRel(quickPeekItem); qp.classList.toggle('ml-on', !!(rel && rel.songs));
  let bar = document.getElementById('mlBar');
  if (!rel || !rel.songs) { if (bar) bar.remove(); qp.querySelectorAll('.ml-dot, .ml-chips').forEach(x => x.remove()); return; }
  // the song being searched: the first one still waiting on a service that's working
  let spinIdx = -1; for (const s of rel.songs) { const st = mlState(rel, s); if (st.d === 'run') { spinIdx = s.idx; break; } }
  qp.querySelectorAll('.album-quick-peek-track:not(.qp-head)').forEach(row => {
    const s = mlSong(rel, row.dataset.trackNum, row.dataset.trackName), name = row.querySelector('.album-quick-peek-track-name'); if (!name) return;
    let m = name.querySelector('.ml-dot, .ml-chips'); if (!s) { if (m) m.remove(); return; }
    const html = mlSongHtml(rel, s, spinIdx); if (m && m.dataset.mlHtml === html) return;
    const tmp = document.createElement('span'); tmp.innerHTML = html; const n = tmp.firstElementChild; n.dataset.mlHtml = html;
    if (m) m.replaceWith(n); else { const t = name.querySelector('.qp-title'); if (t) t.insertAdjacentElement('afterend', n); else name.appendChild(n); }
  });
  const c = mlCounts(rel), running = c.done < c.total && bm.running && !bm.stopped, ks = mlKinds();
  const html = `<div class="ml-head"><span class="ml-pulse${running ? '' : ' off'}"></span><b>${running ? 'Matching songs' : 'Matched'}</b><span class="ml-sub">· ${c.done} of ${c.total}${c.look ? ` · <span class="ml-amber">${c.look} to check</span>` : ''}${!running && c.none ? ` · ${c.none} not found` : ''}</span><span class="ml-sp"></span>${running ? '<button type="button" class="ml-a" data-ml-act="stop">Stop</button>' : ''}<button type="button" class="ml-a" data-ml-act="open" title="Open Match songs">Open</button></div>
    <div class="ml-bars">${ks.map(k => `<span class="ml-k ml-${k}">${k === 'spotify' ? 'Spotify' : 'YouTube'}</span><span class="ml-track"><u class="ml-${k}" style="width:${c.total ? (c.by[k] / c.total * 100).toFixed(1) : 0}%"></u></span><span class="ml-n">${c.by[k]}/${c.total}</span>`).join('')}</div>`;
  if (!bar) { bar = document.createElement('div'); bar.id = 'mlBar'; bar.className = 'ml-bar'; bar.setAttribute('role', 'status'); const tabs = document.getElementById('albumQuickPeekTabs'); if (tabs) tabs.insertAdjacentElement('beforebegin', bar); else return; }
  if (bar.dataset.h !== html) { bar.dataset.h = html; bar.innerHTML = html; }
}
(function () {
  setInterval(() => { try { mlPaint(); } catch (e) { /* next tick */ } }, 700);
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-ml-act]');
    if (a) { e.preventDefault(); if (a.dataset.mlAct === 'stop' && bm) { bm.stopped = true; try { ytAddonCancel(); } catch (er) { /* fine */ } if (typeof bmRender === 'function' && !bm.hidden) bmRender(); }
      else if (a.dataset.mlAct === 'open' && bm && quickPeekItem) { bm.sel = String(quickPeekItem.row); bmShow(); } mlPaint(); return; }
    const d = e.target.closest && e.target.closest('.ml-dot[data-ml-row], .ml-chips[data-ml-row]');
    if (d && bm) { e.preventDefault(); e.stopPropagation(); bm.sel = d.dataset.mlRow; bm.focusTrackNum = Number(d.dataset.mlTrack) || null; bmShow(); }
  }, true);
  // the popup's ⚙: the detailed view (board A)
  if (typeof qptControlsInner === 'function') {
    const base = qptControlsInner;
    qptControlsInner = function () { return base.apply(this, arguments) + `<label class="ml-opt"><input type="checkbox" data-ml-detail${mlDetail() ? ' checked' : ''}> While matching, show where each song was found (Spotify and YouTube, how sure)</label>`; };
  }
  document.addEventListener('change', (e) => { if (e.target && e.target.matches && e.target.matches('[data-ml-detail]')) { try { localStorage.setItem(ML_DETAIL_KEY, e.target.checked ? '1' : '0'); } catch (er) { /* this visit */ } mlPaint(); } });
})();
