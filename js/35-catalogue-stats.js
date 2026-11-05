// ---- The stats bar under the Music browser: what is showing (or what you selected in the grid) at a glance: how many releases and artists,
// how many songs and how long they last, the years they span, your average rating and Rate Your Music's. With part of the catalogue showing
// (a search, an artist picked on the left), the whole catalogue's own figures follow, dimmer. Songs and lengths count only the tracklists
// CRATE has (typed or saved ones, and those looked up this visit), and say so when some are missing. ----
function csTracksOf(it) {
  if (isManualAlbum(it)) return it.manualTracks.map(t => ({ ms: Number(t.durationMs) || 0 }));
  const c = state.trackCache[artKey(it)];
  return Array.isArray(c) && c.length ? c.map(t => ({ ms: Number(t.trackTimeMillis) || 0 })) : null;
}
function csFigures(list) {
  const f = { n: list.length, artists: 0, songs: 0, ms: 0, withTl: 0, noLen: 0, y0: 0, y1: 0, rated: 0, ratingSum: 0, rym: 0, rymSum: 0 }, artists = new Set();
  list.forEach(it => {
    if (it.artist) artists.add(String(it.artist).trim().toLowerCase());
    const tr = csTracksOf(it);
    if (tr) { f.withTl++; f.songs += tr.length; tr.forEach(t => { if (t.ms > 0) f.ms += t.ms; else f.noLen++; }); }
    const m = String(it.releaseDate || '').match(/^(\d{4})/), y = m ? +m[1] : 0;
    if (y) { f.y0 = f.y0 ? Math.min(f.y0, y) : y; f.y1 = Math.max(f.y1, y); }
    if (Number(it.rating) > 0) { f.rated++; f.ratingSum += Number(it.rating); }
    if (Number(it.rymRating) > 0) { f.rym++; f.rymSum += Number(it.rymRating); }
  });
  f.artists = artists.size;
  return f;
}
function csLen(ms) {                                                  // 3 d 4 h · 5 h 12 min · 42 min
  const min = Math.round(ms / 60000), d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}
const csPl = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : (many || one + 's')}`;
function csLine(f, full) {
  const parts = [csPl(f.n, 'release'), csPl(f.artists, 'artist')];
  if (f.withTl) {
    const part = f.withTl < f.n;
    parts.push(`${csPl(f.songs, 'song')}${part ? `<span class="cs-dim" title="Counted from the ${csPl(f.withTl, 'release')} whose tracklist CRATE has"> (from ${f.withTl.toLocaleString()} with a tracklist)</span>` : ''}`);
    if (f.ms) parts.push(`${csLen(f.ms)}${f.noLen ? `<span class="cs-dim"> + ${csPl(f.noLen, 'song')} with no length</span>` : ''}`);
    else if (f.songs) parts.push('<span class="cs-dim">no song lengths yet</span>');
  }
  if (full) {
    if (f.y0) parts.push(f.y0 === f.y1 ? String(f.y0) : `${f.y0}–${f.y1}`);
    if (f.rated) parts.push(`your rating ${(f.ratingSum / f.rated).toFixed(1)} avg (${f.rated.toLocaleString()} rated)`);
    if (f.rym) parts.push(`RYM ${(f.rymSum / f.rym).toFixed(2)} avg`);
  }
  return parts.join(' · ');
}
let csRaf = 0;
function catStatsSoon() { if (!csRaf) csRaf = setTimeout(() => { csRaf = 0; catStatsRender(); }, 60); }          // (many changes at once draw it once)
function catStatsRender() {
  const bar = document.getElementById('catStats'); if (!bar) return;
  const on = state.activeTab === 'albums' && (state.raw || []).length > 0; bar.hidden = !on; if (!on) return;
  const sel = state.raw.filter(r => state.selectedAlbums.has(String(r.row))), shown = state.filtered || [];
  const scope = sel.length ? { label: `${sel.length.toLocaleString()} selected`, list: sel } : shown.length === state.raw.length ? { label: 'Catalogue', list: shown } : { label: 'Showing', list: shown };
  const whole = scope.list === shown && shown.length === state.raw.length;
  bar.innerHTML = `<span class="cs-scope">${scope.label}</span><span class="cs-figs">${csLine(csFigures(scope.list), true)}</span>${whole ? '' : `<span class="cs-cat cs-dim"><span class="cs-scope">Catalogue</span> ${csLine(csFigures(state.raw), false)}</span>`}`;
}
