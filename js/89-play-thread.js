// (1.135.144) Crate Galaxy · Influence: play the thread, and the deck's "Lineage in your crate".
//  - Play the thread: a release's line as a queue, oldest to newest. Back to its roots (what it drew from, up to three steps back), forward to
//    now (what drew from it, two steps on), or both; its best-known song from each release (most Last.fm listeners when known, else your
//    best-rated or liked song, else the first) or each release whole. Play, add to the queue, or save it as a playlist.
//  - While it plays with the Galaxy open on influence, the release playing is ringed and the link on to the next one glows.
//  - The deck: under the songs, what the release drew from and what it passed on to in your crate, its rank, a way to the galaxy, and the
//    button to play its thread. Worked out from your whole crate the first time a deck asks (a moment, then kept until the crate changes).

const pt = { idx: -1, dir: 'roots', mode: 'song', list: [], playing: null, ctx: null };
// ----- the influence links, for any release: the Galaxy's when they cover it, else worked out once for the whole crate -----
let ptCache = null;
function ptCtx(item) {
  if (gx.inf && gx.items && gx.items.length && gx.inf.key === gx.key && gx.items.some(x => x === item)) return { items: gx.items, inf: gx.inf, fams: gx.fams };
  const pool = (state.raw || []).filter(it => it && it.title), keep = gx.onlyShown; gx.onlyShown = false; const key = gxKey(pool); gx.onlyShown = keep;
  if (ptCache && ptCache.key === key) return ptCache;
  const save = { key: gx.key, items: gx.items, graph: gx.graph, inf: gx.inf };
  try {
    const graph = gxBuild(pool, state.genreTaxonomy), fams = gxFamilies(pool, state.genreTaxonomy);
    gx.key = key; gx.items = pool; gx.graph = graph; gx.inf = null;
    const inf = gxInfluence(); ptCache = { key, items: pool, inf, fams };
  } finally { gx.key = save.key; gx.items = save.items; gx.graph = save.graph; gx.inf = save.inf; }
  return ptCache;
}
function ptIndexOf(C, item) { const i = C.items.indexOf(item); if (i >= 0) return i; return C.items.findIndex(x => String(x.row) === String(item.row)); }

// ----- the line -----
function ptLine(C, i, dir) {
  const I = C.inf, pick = new Map([[i, { gen: 0, w: 1, side: 'here' }]]);
  if (dir !== 'forward') { let lvl = [[i, 1]]; for (let g = 1; g <= 3 && lvl.length; g++) { const nx = []; lvl.forEach(([x, w]) => I.par[x].forEach(({ j, s }) => { const v = w * s; const h = pick.get(j); if (!h || (h.side === 'up' && h.w < v)) { pick.set(j, { gen: g, w: v, side: 'up' }); nx.push([j, v]); } })); lvl = nx; } }
  if (dir !== 'roots') { let lvl = [[i, 1]]; for (let g = 1; g <= 2 && lvl.length; g++) { const nx = []; lvl.forEach(([x, w]) => I.kids[x].slice(0, 8).forEach(({ j, s }) => { const v = w * s; const h = pick.get(j); if (!h || (h.side === 'down' && h.w < v)) { pick.set(j, { gen: g, w: v, side: 'down' }); nx.push([j, v]); } })); lvl = nx; } }
  const cap = dir === 'both' ? 9 : 12, take = (side) => [...pick].filter(([, v]) => v.side === side).sort((a, b) => b[1].w - a[1].w).slice(0, cap);
  const rows = [[i, pick.get(i)], ...take('up'), ...take('down')];
  rows.sort((a, b) => (I.yr[a[0]] || 9999) - (I.yr[b[0]] || 9999) || (a[1].side === 'up' ? -1 : 1));
  const ups = rows.filter(r => r[1].side === 'up'), oldest = ups.length ? ups.reduce((m, r) => (r[1].gen > m[1].gen ? r : m)) : null;
  return rows.map(([j, v]) => ({ j, side: v.side, gen: v.gen, w: v.w, root: !!(v.side === 'up' && (!I.par[j].length || (oldest && oldest[0] === j))) }));
}
// ----- a release's best-known song -----
function ptBestSong(item, tracks) {
  const ok = (tracks || []).filter(t => t && t.trackName); if (!ok.length) return null;
  const cache = typeof stlCache === 'function' ? (() => { try { return stlCache(); } catch (e) { return null; } })() : null;
  const norm = typeof stlNorm === 'function' ? stlNorm : (s) => String(s || '').toLowerCase();
  let best = null, bs = -1, why = '';
  ok.forEach((t, k) => {
    const c = cache && cache[norm(item.artist) + '|' + norm(t.trackName)], td = (item.trackData || {})[t.trackNumber] || {};
    const liked = typeof likeIsOn === 'function' ? (() => { try { return likeIsOn(item, Number(t.trackNumber)); } catch (e) { return false; } })() : false;
    const s = c && c.l ? 1e6 + c.l : (Number(td.rating) || 0) * 1000 + (liked ? 500 : 0) - k;
    if (s > bs) { bs = s; best = t; why = c && c.l ? `${typeof stlF === 'function' ? stlF(c.l) : c.l} listeners` : td.rating ? `your ★ ${td.rating}` : liked ? 'you liked it' : 'its first song'; }
  });
  return best ? { t: best, why } : null;
}
async function ptEntries(list, mode, onStep) {
  const items = list.map(r => pt.ctx.items[r.j]);
  if (mode === 'whole') return { items };
  const tracks = [];
  for (let k = 0; k < items.length; k++) {
    let tl = null; try { tl = await getTracksFor(items[k]); } catch (e) { tl = null; }
    const b = ptBestSong(items[k], tl); if (b) tracks.push({ item: items[k], t: b.t, why: b.why });
    if (onStep) onStep(k + 1, items.length);
  }
  return { items, tracks };
}

// ----- the dialog -----
function ptOpen(item) {
  if (!item) return;
  let C; try { C = ptCtx(item); } catch (e) { flashGlobalToast('Couldn’t work out the influence links just now.'); return; }
  const i = ptIndexOf(C, item); if (i < 0) { flashGlobalToast('That release isn’t in your crate.'); return; }
  pt.ctx = C; pt.idx = i; pt.songs = null; pt.tried = null; pt.loading = false;
  let ov = document.getElementById('ptOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'ptOverlay'; ov.className = 'pt-overlay'; document.body.appendChild(ov);
    ov.addEventListener('click', ptClick);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) { e.preventDefault(); e.stopImmediatePropagation(); ov.hidden = true; } }, true);
  }
  ov.hidden = false; ptRender(); ptSongsSoon();
}
function ptRender() {
  const ov = document.getElementById('ptOverlay'); if (!ov) return;
  const C = pt.ctx, I = C.inf, it = C.items[pt.idx], line = ptLine(C, pt.idx, pt.dir); pt.list = line;
  const song = (r) => pt.mode === 'song' && pt.songs ? pt.songs.get(r.j) : null;
  const ms = line.reduce((a, r) => { const s = song(r); return a + (s && s.t.trackTimeMillis ? Number(s.t.trackTimeMillis) : 0); }, 0);
  const lbl = { roots: 'from its roots', forward: 'forward to now', both: 'roots and onward' }[pt.dir];
  const rows = line.map(r => { const x = C.items[r.j], s = song(r), y = Math.floor(I.yr[r.j]) || '–';
    const via = r.side === 'here' ? '<span class="pt-via here">here</span>' : r.root ? '<span class="pt-via">root</span>' : r.side === 'up' ? `<span class="pt-via">drew from ↑${r.gen > 1 ? ' ' + r.gen : ''}</span>` : `<span class="pt-via down">passed on ↓${r.gen > 1 ? ' ' + r.gen : ''}</span>`;
    return `<div class="pt-row${r.side === 'here' ? ' now' : ''}"><span class="pt-yr">${y}</span><img src="${escapeHtml(gxCover(x))}" alt="" loading="lazy"><span class="pt-t"><b>${escapeHtml(pt.mode === 'song' ? (s ? s.t.trackName : pt.tried && pt.tried.has(r.j) ? 'no tracklist: left out' : 'finding its best-known song…') : x.title)}</b><em>${escapeHtml(x.artist)} · ${escapeHtml(x.title)}${s ? ' · ' + escapeHtml(s.why) : ''}</em></span>${via}</div>`; }).join('');
  const n = pt.mode === 'song' && pt.songs && !pt.loading ? line.filter(r => pt.songs.get(r.j)).length : line.length;
  ov.innerHTML = `<div class="pt-dialog" role="dialog" aria-modal="true" aria-labelledby="ptTitle"><div class="pt-head"><div><div class="gs-lbl">Play the thread</div><div class="pt-title" id="ptTitle">${escapeHtml(it.title)}</div><div class="gs-s">${escapeHtml(it.artist)}${I.yr[pt.idx] ? ' · ' + Math.floor(I.yr[pt.idx]) : ''} · its line in your crate, oldest to newest</div></div><button type="button" class="mood-x" data-pt="x" aria-label="Close">×</button></div>
    <div class="pt-opts"><span class="gs-tabs">${[['roots', 'Back to the roots'], ['forward', 'Forward to now'], ['both', 'Both']].map(([k, l]) => `<button type="button" class="gs-tab${pt.dir === k ? ' on' : ''}" data-pt-dir="${k}" aria-pressed="${pt.dir === k}">${l}</button>`).join('')}</span>
      <span class="gs-tabs">${[['song', 'Its best-known song'], ['whole', 'Whole releases']].map(([k, l]) => `<button type="button" class="gs-tab${pt.mode === k ? ' on' : ''}" data-pt-mode="${k}" aria-pressed="${pt.mode === k}">${l}</button>`).join('')}</span></div>
    <div class="pt-list"><div class="pt-bar"><span class="gs-lbl">${escapeHtml(it.title)}, ${lbl} · ${n} ${pt.mode === 'song' ? 'song' : 'release'}${n === 1 ? '' : 's'}${ms ? ` · ${Math.round(ms / 60000)} min` : ''}</span><span class="gs-fill"></span>
      <button type="button" class="gs-btn gs-pri" data-pt="play"${line.length < 2 ? ' disabled' : ''}>▶ Play</button><button type="button" class="gs-btn" data-pt="queue"${line.length < 2 ? ' disabled' : ''}>+ Queue</button><button type="button" class="gs-btn" data-pt="save"${line.length < 2 ? ' disabled' : ''}>Save as playlist</button></div>
      ${line.length < 2 ? `<p class="gs-s pt-none">${pt.dir === 'roots' ? 'Nothing earlier in your crate is like it: it’s a starting point. Try Forward to now.' : pt.dir === 'forward' ? 'Nothing later in your crate leans on it yet. Try Back to the roots.' : 'It has no line in your crate yet.'}</p>` : rows}</div>
    <p class="gs-s">While it plays with the Galaxy open on influence, the release playing is ringed and the link on to the next glows. Read from your crate alone: likeness and order in time.</p></div>`;
}
let ptSongsT = 0;
async function ptSongsSoon() {
  if (pt.mode !== 'song') return; const my = ++ptSongsT, C = pt.ctx, line = ptLine(C, pt.idx, pt.dir), got = pt.songs || new Map(); pt.tried = pt.tried || new Set();
  pt.loading = true; let k = 0;
  for (const r of line) { if (my !== ptSongsT) return; if (pt.tried.has(r.j)) continue; const x = C.items[r.j]; let tl = null; try { tl = await getTracksFor(x); } catch (e) { tl = null; } const b = ptBestSong(x, tl); if (b) got.set(r.j, b); pt.tried.add(r.j); pt.songs = got; if (++k % 4 === 0 && my === ptSongsT) ptRender(); }
  pt.songs = got; pt.loading = false; if (my === ptSongsT) ptRender();
}
async function ptGo(how) {
  const C = pt.ctx, line = pt.list; if (line.length < 2) return;
  const items = line.map(r => C.items[r.j]), it = C.items[pt.idx];
  pt.playing = { rows: items.map(x => String(x.row)), at: Date.now() };
  if (how === 'save') {
    const pl = pt.mode === 'whole' ? items.map(x => ({ itemType: 'album', row: x.row, albumId: x.albumId || '', trackNum: '', trackName: '' }))
      : line.filter(r => pt.songs && pt.songs.get(r.j)).map(r => { const sg = pt.songs.get(r.j), x = C.items[r.j]; return { itemType: 'track', row: x.row, albumId: x.albumId || '', trackNum: sg.t.trackNumber || '', trackName: sg.t.trackName || '' }; });
    if (!pl.length) { flashGlobalToast('Still finding the songs: try again in a moment.'); return; }
    document.getElementById('ptOverlay').hidden = true;
    openPlaylistModal('create', null, pl); if (el.playlistNameInput) el.playlistNameInput.value = `${it.title}: ${{ roots: 'its roots', forward: 'what came after', both: 'its thread' }[pt.dir]}`;
    if (el.playlistDescInput) el.playlistDescInput.value = `${it.artist} – ${it.title}, its line in my crate, oldest to newest (CRATE Galaxy).`;
    return;
  }
  document.getElementById('ptOverlay').hidden = true;
  if (pt.mode === 'whole') { if (how === 'play') { flashGlobalToast(`Playing the thread of “${it.title}”: ${items.length} releases`); playAlbumsReplacingQueue(items); } else { for (const x of items) await queueAlbumTracks(x); flashGlobalToast(`Queued ${items.length} releases`); } return; }
  if (pt.loading || !pt.songs) { flashGlobalToast('Finding each release’s best-known song…'); await ptSongsSoon(); }
  const tr = line.map(r => { const s = pt.songs && pt.songs.get(r.j); return s ? { row: C.items[r.j].row, trackNum: s.t.trackNumber, trackName: s.t.trackName } : null; }).filter(Boolean);
  if (!tr.length) { flashGlobalToast('None of those releases have a tracklist to play.'); return; }
  if (how === 'play') { flashGlobalToast(`Playing the thread of “${it.title}”: ${tr.length} songs, oldest first`); playTracksNow(tr); } else { queueTracksNow(tr); flashGlobalToast(`Queued ${tr.length} songs`); }
}
function ptClick(e) {
  const ov = document.getElementById('ptOverlay');
  if (e.target === ov || e.target.closest('[data-pt="x"]')) { ov.hidden = true; return; }
  const d = e.target.closest('[data-pt-dir]'); if (d) { pt.dir = d.dataset.ptDir; ptRender(); ptSongsSoon(); return; }
  const m = e.target.closest('[data-pt-mode]'); if (m) { pt.mode = m.dataset.ptMode; ptRender(); ptSongsSoon(); return; }
  const b = e.target.closest('[data-pt]'); if (b && !b.disabled) ptGo(b.dataset.pt);
}

// ----- the galaxy follows along -----
(function () {
  const base = gxDraw;
  gxDraw = function () {
    base.apply(this, arguments);
    if (!gx.open || gx.mode !== 'time' || !pt.playing || !gx.pos) return;
    const now = typeof nowPlayingItem !== 'undefined' && nowPlayingItem; if (!now) return;
    const at = pt.playing.rows.indexOf(String(now.row)); if (at < 0) return;
    const ix = (row) => gx.items.findIndex(x => String(x.row) === row), a = ix(pt.playing.rows[at]), b = at + 1 < pt.playing.rows.length ? ix(pt.playing.rows[at + 1]) : -1;
    const c = gxEl('gxCanvas'); if (!c || a < 0) return; const ctx = c.getContext('2d'), d = window.devicePixelRatio || 1; ctx.setTransform(d, 0, 0, d, 0, 0);
    const pa = gxToScreen(a); ctx.save(); ctx.shadowColor = '#F0C26A'; ctx.shadowBlur = 16;
    if (b >= 0) { const pb = gxToScreen(b), mx = (pa[0] + pb[0]) / 2; ctx.strokeStyle = 'rgba(240,194,106,0.9)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.bezierCurveTo(mx, pa[1], mx, pb[1], pb[0], pb[1]); ctx.stroke(); }
    const r = 9 + Math.sin(performance.now() / 300) * 2; ctx.strokeStyle = '#FFF4D6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pa[0], pa[1], r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    if (!gx.ptAnim) gx.ptAnim = requestAnimationFrame(() => { gx.ptAnim = 0; if (gx.open && pt.playing) gxDraw(); });
  };
  // the button in the Galaxy's side panel
  const bs = gxtSide;
  gxtSide = function () {
    const h = bs.apply(this, arguments); if (gx.sel < 0 || !gx.lineage) return h;
    return h.replace('<div class="gx-acts">', '<div class="gx-acts"><button type="button" class="chip-btn gx-primary" data-pt-open>▶ Play the thread</button>');
  };
  const ov = gxEl('gxOverlay'); if (ov) ov.addEventListener('click', (e) => { if (e.target.closest('[data-pt-open]') && gx.sel >= 0) ptOpen(gx.items[gx.sel]); });
})();

// ----- the deck: Lineage in your crate -----
function ptStripHtml(item) {
  let C; try { C = ptCtx(item); } catch (e) { return ''; }
  const i = ptIndexOf(C, item); if (i < 0) return '';
  const I = C.inf, ps = I.par[i], ks = I.kids[i], d = Math.round(I.credit[i]);
  if (!ps.length && !ks.length) return `<div class="pt-strip-h"><span class="gs-lbl">Lineage in your crate</span><span class="gs-s">nothing in your crate is like it before or after: a release on its own here</span></div>`;
  if (!I.rank) { const ord = Array.from({ length: I.credit.length }, (_, k) => k).sort((a, b) => I.credit[b] - I.credit[a]); I.rank = new Int32Array(I.credit.length); ord.forEach((k, r) => { I.rank[k] = r + 1; }); }
  const mini = (j, s) => { const x = C.items[j]; return `<button type="button" class="pt-mini" data-pt-deck="${escapeHtml(String(x.row))}" title="${escapeHtml(x.title)} · ${escapeHtml(x.artist)}"><img src="${escapeHtml(gxCover(x))}" alt="" loading="lazy"><b>${escapeHtml(x.title)}</b><em>${Math.floor(I.yr[j]) || '–'} · ${Math.round(s * 100)}</em></button>`; };
  return `<div class="pt-strip-h"><span class="gs-lbl">Lineage in your crate</span><span class="gs-s">${d >= 1 ? `rank #${I.rank[i]} · ` : ''}${d ? `${d.toLocaleString()} later release${d === 1 ? '' : 's'} lean on it` : 'nothing later leans on it yet'}</span><span class="gs-fill"></span><button type="button" class="gs-btn" data-pt-galaxy>⤢ On the galaxy</button><button type="button" class="gs-btn gs-pri" data-pt-play>▶ Play the thread</button></div>
    <div class="pt-strip-b">${ps.length ? `<div><span class="gs-lbl pt-up">Drew from</span><div class="pt-minis">${ps.map(p => mini(p.j, p.s)).join('')}</div></div>` : ''}${ps.length && ks.length ? '<span class="pt-sep"></span>' : ''}${ks.length ? `<div><span class="gs-lbl pt-down">Passed on to · ${ks.length}</span><div class="pt-minis">${ks.slice(0, 6).map(k => mini(k.j, k.s)).join('')}</div></div>` : ''}</div>`;
}
// (1.135.146) only with ⚙ Settings › Album view header › Lineage in your crate turned on (off unless you turn it on)
const PT_DECK_KEY = 'crate_deck_lineage_v1';
function ptDeckOn() { try { return localStorage.getItem(PT_DECK_KEY) === '1'; } catch (e) { return false; } }
function ptDeckPaintBtn() { document.querySelectorAll('[data-deck-lineage]').forEach(b => b.setAttribute('aria-pressed', String(ptDeckOn()))); }
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-deck-lineage]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  try { localStorage.setItem(PT_DECK_KEY, ptDeckOn() ? '0' : '1'); } catch (x) { /* this visit */ }
  ptDeckPaintBtn(); flashGlobalToast(ptDeckOn() ? 'Lineage in your crate shows in the release view' : 'Lineage in your crate hidden from the release view');
  if (typeof activeItem !== 'undefined' && activeItem && el.deckOverlay && el.deckOverlay.classList.contains('open')) ptStripPaint(activeItem);
}, true);
ptDeckPaintBtn();
function ptStripPaint(item) {
  if (!ptDeckOn()) { const old = document.getElementById('ptStrip'); if (old) old.remove(); return; }          // (removed, not hidden: the Tabs look shows and hides sections itself)
  const tl = document.getElementById('deckTracklist'); if (!tl || !item) return;
  let s = document.getElementById('ptStrip');
  if (!s) {
    s = document.createElement('div'); s.id = 'ptStrip'; s.className = 'pt-strip deck-section'; s.dataset.deckTab = 'songs';
    const sec = tl.closest('.deck-section') || tl; sec.insertAdjacentElement('afterend', s);
    s.addEventListener('click', (e) => {
      const it = activeItem; if (!it) return;
      const g = e.target.closest('[data-pt-deck]'); if (g) { const x = state.raw.find(r => String(r.row) === g.dataset.ptDeck); if (x) openDeck(x); return; }
      if (e.target.closest('[data-pt-play]')) { ptOpen(it); return; }
      if (e.target.closest('[data-pt-galaxy]')) { try { closeDeck(); } catch (x) { /* fine */ } openGalaxy(); setTimeout(() => { gxSetMode('time'); const k = gx.items.findIndex(x => String(x.row) === String(it.row)); if (k >= 0) gxSelect(k, true); }, 120); }
    });
  }
  s.dataset.row = String(item.row);
  if (ptCache || (gx.inf && gx.items.includes(item))) { s.innerHTML = ptStripHtml(item); return; }
  s.innerHTML = '<div class="pt-strip-h"><span class="gs-lbl">Lineage in your crate</span><span class="gs-s">reading your crate…</span></div>';
  setTimeout(() => { if (activeItem !== item || s.dataset.row !== String(item.row)) return; s.innerHTML = ptStripHtml(item); }, 60);
}
(function () {
  const base = openDeck;
  openDeck = function (item) { const r = base.apply(this, arguments); try { ptStripPaint(item); } catch (e) { /* the deck works without it */ } return r; };
})();
