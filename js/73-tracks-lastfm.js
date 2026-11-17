// ===== (1.135.116) Last.fm listens in the Tracks view: columns, a pull for the songs shown, and sorting by them =====
// Five columns (right-click a column header to add one): the song's Last.fm plays and listeners, your plays of it on Last.fm, and the
// release's Last.fm plays and listeners. The bar over the table pulls them for the songs shown (track.getInfo for each song,
// album.getInfo for each release, four at a time; kept in this browser, songs two days, releases a month: the same store the search
// and the cover popup use, so what one looked up the others show). A column sorts like any other, most first on the first click.

Object.assign(TRACK_COLUMN_LABELS, { lfTrackPlays: 'Last.fm plays', lfTrackListeners: 'Last.fm listeners', lfTrackYours: 'Your Last.fm plays', lfRelPlays: 'Release plays (Last.fm)', lfRelListeners: 'Release listeners (Last.fm)' });
const TLF_KEYS = ['lfTrackPlays', 'lfTrackListeners', 'lfTrackYours', 'lfRelPlays', 'lfRelListeners'];
const tlfSongKey = (item, name) => stlNorm(item.artist) + '|' + stlNorm(name);
function tlfSong(item, track) { const c = stlCache()[tlfSongKey(item, track.trackName || '')]; return c && c.p != null ? c : null; }
function tlfRel(item) { const c = srchPopAll()[srchPopK(item)]; return c && c.n != null ? c : null; }
function tlfNum(key, item, track) {          // the number, or null when not looked up yet
  if (key === 'lfRelPlays' || key === 'lfRelListeners') { const c = tlfRel(item); return c ? (key === 'lfRelPlays' ? (c.p != null ? c.p : null) : c.n) : null; }
  const c = tlfSong(item, track); if (!c) return null;
  if (key === 'lfTrackYours') return c.u != null ? c.u : null;
  return key === 'lfTrackPlays' ? c.p : c.l;
}
const tlfBaseVal = trackColumnVal;
trackColumnVal = function (key, item, track) {
  if (TLF_KEYS.includes(key)) { const n = tlfNum(key, item, track); return n == null ? '' : n < 1e4 || numsExact() ? n.toLocaleString() : stlF(n); }
  return tlfBaseVal.apply(this, arguments);
};
const tlfBaseSort = trackSortValue;
trackSortValue = function (row, key) {
  if (TLF_KEYS.includes(key)) { const n = tlfNum(key, row.item, row.track); return n == null ? -1 : n; }          // (not looked up: below every number)
  return tlfBaseSort.apply(this, arguments);
};
// most first on the first click of one of these (a number column sorted smallest first is rarely what's wanted)
document.addEventListener('click', (e) => {
  const h = e.target.closest && e.target.closest('#trackTableHeader .ttc-head'); if (!h || e.target.closest('.ttc-resize-handle')) return;
  const k = h.dataset.sortKey; if (TLF_KEYS.includes(k) && state.trackSort.key !== k) state.trackSort = { key: k, dir: 'asc' };          // (the header's own click turns it to "desc")
}, true);

// ----- the pull -----
const tlf = { running: false, stop: false, done: 0, total: 0, failed: 0, at: 0 };
function tlfRowsShown() { const b = document.getElementById('trackTableBody'); return (b && b._rows) || state.flatTrackRows || []; }
function tlfActive() { return activeTrackColumns().some(k => TLF_KEYS.includes(k)); }
function tlfMissing(rows) {
  const songs = [], rels = new Map(), seen = new Set(), now = Date.now(), all = stlCache(), pop = srchPopAll();
  rows.forEach(r => {
    const k = tlfSongKey(r.item, r.track.trackName || ''); if (!r.track.trackName || seen.has(k)) return; seen.add(k);
    const c = all[k]; if (!(c && c.p != null && now - c.t < 2 * 864e5)) songs.push(r);
    const rk = srchPopK(r.item), rc = pop[rk]; if (!rels.has(rk) && !(rc && rc.p != null && now - rc.t < 30 * 864e5)) rels.set(rk, r.item);
  });
  return { songs, rels: [...rels.values()] };
}
async function tlfPull() {
  if (tlf.running) return; if (!srchLfKey()) { flashGlobalToast('Save a Last.fm API key first (⚙ › Last.fm).'); return; }
  const { songs, rels } = tlfMissing(tlfRowsShown()); if (!songs.length && !rels.length) { flashGlobalToast('Every song shown already has its Last.fm numbers.'); return; }
  Object.assign(tlf, { running: true, stop: false, done: 0, total: songs.length + rels.length, failed: 0 }); tlfStrip();
  const user = stlUser(), all = stlCache(), pop = srchPopAll(), now = Date.now();
  const jobs = rels.map(it => ({ rel: it })).concat(songs.map(r => ({ song: r })));
  let i = 0, lastPaint = Date.now(), lastSave = Date.now();
  const one = async () => { while (i < jobs.length && !tlf.stop) { const j = jobs[i++];
    try {
      if (j.rel) { const a = await srchLf({ method: 'album.getinfo', artist: j.rel.artist, album: j.rel.title, autocorrect: '1' }).catch(e => { if (e && e.lfCode === 6) return { album: { listeners: 0, playcount: 0 } }; throw e; });
        pop[srchPopK(j.rel)] = { n: Number((a.album || {}).listeners) || 0, p: Number((a.album || {}).playcount) || 0, t: now }; }
      else { const r = j.song, p = { method: 'track.getinfo', artist: r.item.artist, track: r.track.trackName, autocorrect: '1' }; if (user) p.username = user;
        const t = await srchLf(p).then(x => x.track || {}).catch(e => { if (e && e.lfCode === 6) return {}; throw e; });
        all[tlfSongKey(r.item, r.track.trackName)] = { l: Number(t.listeners) || 0, p: Number(t.playcount) || 0, u: t.userplaycount != null ? Number(t.userplaycount) || 0 : null, t: now }; }
    } catch (e) { tlf.failed++; srchLfFail(e); if (tlf.failed > 25 && tlf.failed > tlf.done) tlf.stop = true; }          // (Last.fm refusing everything: stopped, not hammered)
    tlf.done++;
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); stlCacheSave(); srchPopSave(); }
    if (Date.now() - lastPaint > 1500) { lastPaint = Date.now(); tlfRepaint(); }
  } };
  await Promise.all([one(), one(), one(), one()]);
  stlCacheSave(); srchPopSave();
  const stopped = tlf.stop; tlf.running = false; tlfRepaint();
  flashGlobalToast(tlf.failed && tlf.failed >= tlf.done ? `Last.fm didn't answer (${srchLfErr || 'no answer'}).` : `Last.fm: ${stopped ? 'stopped after' : 'looked up'} ${tlf.done.toLocaleString()} of ${tlf.total.toLocaleString()}${tlf.failed ? ` (${tlf.failed} didn't answer)` : ''}.`);
}
function tlfRepaint() { if (state.mainViewMode === 'tracks' || state.mainViewMode === 'albumTracks') { try { renderFlatTrackTable(); } catch (e) { /* next time */ } } tlfStrip(); }
// the bar over the table
function tlfStrip() {
  const head = document.getElementById('trackTableHeader'); let s = document.getElementById('tlfStrip');
  const show = head && (state.mainViewMode === 'tracks' || state.mainViewMode === 'albumTracks') && !state.activePlaylistId;
  if (!show) { if (s) s.remove(); return; }
  if (!s || s.nextElementSibling !== head) { if (s) s.remove(); s = document.createElement('div'); s.id = 'tlfStrip'; s.className = 'tlf-strip'; head.parentNode.insertBefore(s, head); }
  const rows = tlfRowsShown(), miss = tlfMissing(rows), songsShown = new Set(rows.map(r => tlfSongKey(r.item, r.track.trackName || ''))).size, have = songsShown - miss.songs.length;
  const add = tlfActive() ? '' : `<button type="button" class="tlf-btn" data-tlf="cols">+ Last.fm columns</button>`;
  s.innerHTML = tlf.running
    ? `<span class="tlf-lbl">Last.fm</span><span>Looking up ${tlf.done.toLocaleString()} of ${tlf.total.toLocaleString()}…</span><span class="tlf-bar"><i style="width:${tlf.total ? Math.round(tlf.done / tlf.total * 100) : 0}%"></i></span><button type="button" class="tlf-btn" data-tlf="stop">Stop</button>`
    : `<span class="tlf-lbl">Last.fm</span><span>${have.toLocaleString()} of ${songsShown.toLocaleString()} songs shown have their listens</span>${miss.songs.length || miss.rels.length ? `<button type="button" class="tlf-btn tlf-pri" data-tlf="pull">Pull listens for ${(miss.songs.length).toLocaleString()} song${miss.songs.length === 1 ? '' : 's'}${miss.rels.length ? ` and ${miss.rels.length.toLocaleString()} release${miss.rels.length === 1 ? '' : 's'}` : ''}</button>` : ''}${add}${miss.songs.length > 1500 ? '<span class="tlf-dim">(about ' + Math.ceil(miss.songs.length / 8 / 60) + ' min: narrow the view to pull fewer)</span>' : ''}`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-tlf]'); if (!b) return;
  const a = b.dataset.tlf;
  if (a === 'pull') tlfPull();
  else if (a === 'stop') { tlf.stop = true; }
  else if (a === 'cols') {          // the song's plays and listeners, before Plays (yours)
    const cols = (state.fields.tracks || []).filter(v => v && v !== 'none'); ['lfTrackPlays', 'lfTrackListeners'].forEach(k => { if (!cols.includes(k)) cols.push(k); });
    state.fields.tracks = cols; try { savePrefs(); } catch (err) { /* this visit */ }
    const oh = document.getElementById('trackTableHeader'); if (oh) oh.replaceWith(buildTrackTableHeader()); renderFlatTrackTable();
  }
});
const tlfBaseRender = renderFlatTrackTable;
renderFlatTrackTable = function () { const r = tlfBaseRender.apply(this, arguments); try { tlfStrip(); } catch (e) { /* no bar */ } return r; };
