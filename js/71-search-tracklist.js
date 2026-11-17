// ===== (1.135.104) Tracklists in the search, with each song's numbers =====
// Every release the search shows (in your crate or not yet) can show its songs, each with its Last.fm listeners and plays, and your own plays:
//  · Simple look: ▸ on a release opens its songs right under it (→ / ← with the keyboard).
//  · Drop look: a panel beside the list for the release you're on (mouse or arrows), with its cover and headline numbers.
//    On a narrow window it falls back to the ▸ of the simple look.
//  · Detail look: a click on a release opens it as a card beside the grid with every number per song (a second click, or Enter, opens it).
// Songs come from your crate's tracklist when you have the release, else Last.fm, else MusicBrainz / iTunes. The numbers per song are
// Last.fm's track.getInfo (one lookup a song, four at a time, kept in this browser for two days); "yours" is Last.fm's count for your
// username, or your synced scrobbles when that's more.

const STL_CACHE_KEY = 'crate_search_tl_v1', STL_SORT_KEY = 'crate_search_tl_sort_v1';
const stl = { data: new Map(), ids: new Map(), byId: new Map(), n: 0, open: new Set(), all: new Set(), selKey: '', timers: {}, sort: srchLs(STL_SORT_KEY, 'album') };
let stlMem = null;
function stlCache() { if (!stlMem) stlMem = srchLs(STL_CACHE_KEY, {}) || {}; return stlMem; }
function stlCacheSave() { const a = stlCache(), ks = Object.keys(a); if (ks.length > 5000) ks.slice(0, ks.length - 5000).forEach(k => delete a[k]); srchLsSet(STL_CACHE_KEY, a); }
function stlId(key) { let v = stl.ids.get(key); if (!v) { v = 'stl' + (++stl.n); stl.ids.set(key, v); stl.byId.set(v, key); } return v; }
const stlNorm = (s) => String(s || '').toLowerCase().replace(/[([][^)\]]*[)\]]/g, '').replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9À-￿]+/g, ' ').trim();
const stlRelKey = (a, t) => typeof lastfmNormKey === 'function' ? lastfmNormKey(a, t) : stlNorm(a) + '|' + stlNorm(t);
function stlUser() { try { return typeof loadLastfmCreds === 'function' ? String((loadLastfmCreds() || {}).username || '').trim() : ''; } catch (e) { return ''; } }
function stlWide() { return srchLook() === 'drop' && window.innerWidth >= 1180; }

// ----- what a search row is about -----
function stlSubj(s) {
  if (!s) return null;
  if (s.kind === 'online' && s.r) { const own = s.r.owned ? srchItemByAT(s.r.artist, s.r.title) : null; if (own) return { key: 'c:' + own.row, artist: own.artist, title: own.title, it: own, r: s.r, cover: srchItemCover(own) }; return { key: 'o:' + srchPopK(s.r), artist: s.r.artist, title: s.r.title, it: null, r: s.r, cover: s.r.cover || '' }; }
  let it = s.it || null;
  if (!it && s.kind === 'release') it = state.raw.find(r => String(r.row) === String(s.row)) || null;
  if (!it && s.kind === 'track' && s.sub) { const p = String(s.sub).split(' · '); it = srchItemByAT(p[0], p.slice(1).join(' · ')); }
  if (!it || (s.kind !== 'release' && s.kind !== 'track')) return null;
  return { key: 'c:' + it.row, artist: it.artist, title: it.title, it, r: null, cover: srchItemCover(it), hl: s.kind === 'track' ? s.label : '' };
}

// ----- looking it up -----
function stlWant(subj, delay, slot) {
  if (!subj) return;
  const d = stl.data.get(subj.key);
  if (d) { d.subj = Object.assign({}, d.subj, subj); if (d.state !== 'err') return; }
  const go = () => { const x = stl.data.get(subj.key); if (x && x.state !== 'err') return; stl.data.set(subj.key, { state: 'loading', songs: [], rel: {}, subj }); stlPaint(subj.key); stlLoad(subj.key); };
  if (!delay) return go();
  clearTimeout(stl.timers[slot || 'x']); stl.timers[slot || 'x'] = setTimeout(go, delay);
}
function stlLocal(artist, title) {
  const songs = new Map(), rel = { plays: 0, last: '' }, k = stlRelKey(artist, title);
  let all = []; try { all = typeof scvAll === 'function' ? scvAll() : (state.scrobbles || []); } catch (e) { all = state.scrobbles || []; }
  all.forEach(s => {
    if (stlRelKey(s.artist, s.title) !== k) return;
    const n = Number(s.playCount) || 0, d = String(s.day || '').slice(0, 10); rel.plays += n; if (d > rel.last) rel.last = d;
    if (!s.track) return; const tk = stlNorm(s.track); let g = songs.get(tk); if (!g) { g = { plays: 0, last: '' }; songs.set(tk, g); } g.plays += n; if (d > g.last) g.last = d;
  });
  return { songs, rel };
}
async function stlAlbum(artist, title, user) {
  if (!srchLfKey()) return null;
  try { const p = { method: 'album.getinfo', artist, album: title, autocorrect: '1' }; if (user) p.username = user; const j = await srchLf(p); return (j && j.album) || null; }
  catch (e) { if (!(e && e.lfCode === 6)) srchLfFail(e); return null; }
}
async function stlLoad(key) {
  const d = stl.data.get(key); if (!d) return; const subj = d.subj, user = stlUser();
  try {
    const crateP = subj.it && typeof getTracksFor === 'function' ? getTracksFor(subj.it).catch(() => null) : Promise.resolve(null);
    const [ct, alb] = await Promise.all([crateP, stlAlbum(subj.artist, subj.title, user)]);
    let list = (ct || []).filter(t => t && t.trackName).map((t, i) => ({ n: Number(t.trackNumber) || i + 1, name: t.trackName, ms: Number(t.trackTimeMillis) || 0 })), src = 'your crate';
    if (!list.length && alb && alb.tracks) { const t = alb.tracks.track, arr = Array.isArray(t) ? t : t ? [t] : []; list = arr.filter(x => x && x.name).map((x, i) => ({ n: Number((x['@attr'] || {}).rank) || i + 1, name: x.name, ms: (Number(x.duration) || 0) * 1000 })); src = 'Last.fm'; }
    if (!list.length && !subj.it && typeof getTracksFor === 'function') {
      try { const r = subj.r || {}, t = await getTracksFor({ artist: subj.artist, title: subj.title, releaseDate: r.date || '', link: r.link || '' }); list = (t || []).filter(x => x && x.trackName).map((x, i) => ({ n: Number(x.trackNumber) || i + 1, name: x.trackName, ms: Number(x.trackTimeMillis) || 0 })); src = 'MusicBrainz / iTunes'; } catch (e) { /* none */ }
    }
    const loc = stlLocal(subj.artist, subj.title), td = (subj.it && subj.it.trackData) || {};
    d.songs = list.map(x => { const lk = loc.songs.get(stlNorm(x.name)) || {}, e = td[x.n] || {}; return { n: x.n, name: x.name, ms: x.ms, l: null, p: null, u: null, loc: lk.plays || 0, last: lk.last || '', rating: Number(e.rating) || 0, liked: !!e.liked }; });
    d.rel = { l: alb ? Number(alb.listeners) || 0 : null, p: alb ? Number(alb.playcount) || 0 : null, u: alb && alb.userplaycount != null ? Number(alb.userplaycount) || 0 : null, loc: loc.rel.plays, last: loc.rel.last, url: (alb && alb.url) || '' };
    if (!subj.cover && alb && Array.isArray(alb.image)) { const im = (alb.image.find(x => x.size === 'extralarge') || alb.image.slice(-1)[0] || {})['#text']; if (im) d.subj.cover = im; }
    d.src = list.length ? src : ''; d.state = list.length && srchLfKey() ? 'nums' : 'done'; stlPaint(key);
    if (d.state === 'nums') await stlTrackNums(subj.artist, d.songs, user, key);
    d.state = 'done'; stlPaint(key);
  } catch (e) { d.state = 'err'; d.err = String((e && e.message) || e); stlPaint(key); }
}
async function stlTrackNums(artist, songs, user, key) {
  const all = stlCache(), now = Date.now(), need = [], ck = (s) => stlNorm(artist) + '|' + stlNorm(s.name);
  songs.forEach(s => { const c = all[ck(s)]; if (c && now - c.t < 2 * 864e5 && (!user || c.u != null)) { s.l = c.l; s.p = c.p; s.u = c.u; } else need.push(s); });
  if (need.length < songs.length) stlPaint(key);
  let i = 0, painted = 0;
  const one = async () => { while (i < need.length && i < 60) { const s = need[i++];
    try { const p = { method: 'track.getinfo', artist, track: s.name, autocorrect: '1' }; if (user) p.username = user; const j = await srchLf(p), t = j && j.track; s.l = t ? Number(t.listeners) || 0 : 0; s.p = t ? Number(t.playcount) || 0 : 0; s.u = t && t.userplaycount != null ? Number(t.userplaycount) || 0 : null; }
    catch (e) { if (e && e.lfCode === 6) { s.l = 0; s.p = 0; } else { srchLfFail(e); s.l = s.l == null ? undefined : s.l; continue; } }
    all[ck(s)] = { l: s.l, p: s.p, u: s.u, t: now };
    if (Date.now() - painted > 250) { painted = Date.now(); stlPaint(key); } } };
  await Promise.all([one(), one(), one(), one()]);
  stlCacheSave();
}

// ----- numbers, as shown -----
const stlF = (n) => n == null || isNaN(n) ? '–' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
const stlLen = (ms) => { if (!ms) return ''; const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const stlAgo = (d) => { if (!d) return '–'; const t = Date.parse(d + 'T12:00:00'); if (isNaN(t)) return '–'; const days = Math.max(0, Math.round((Date.now() - t) / 864e5)); return days < 1 ? 'today' : days < 14 ? days + ' d' : days < 60 ? Math.round(days / 7) + ' w' : days < 730 ? Math.round(days / 30) + ' mo' : Math.round(days / 365) + ' y'; };
const stlYou = (s) => Math.max(s.u || 0, s.loc || 0);
const stlWait = (v, d) => v === null && d.state === 'nums' ? '<span class="stl-dim">·</span>' : stlF(v === undefined ? null : v);
function stlSum(d) {
  const S = d.songs, totP = S.reduce((a, s) => a + (s.p || 0), 0), top = S.reduce((b, s, i) => (s.p || 0) > (S[b] ? S[b].p || 0 : 0) ? i : b, -1);
  const you = S.reduce((a, s) => a + stlYou(s), 0), full = S.length ? Math.min(...S.map(stlYou)) : 0, ms = S.reduce((a, s) => a + (s.ms || 0), 0);
  const last = S.reduce((a, s) => s.last > a ? s.last : a, d.rel.last || '');
  return { totP, top, you: Math.max(you, d.rel.u || 0, d.rel.loc || 0), full, ms, last, maxL: Math.max(1, ...S.map(s => s.l || 0)) };
}

// ----- the songs table: 'a' in the list, 'b' the preview panel, 'c' the detail card -----
function stlTableHtml(key, d, mode) {
  const S = d.songs, subj = d.subj;
  if (!S.length) return `<div class="stl-note">${d.state === 'loading' ? 'Finding the songs…' : d.state === 'err' ? 'Couldn’t look it up: ' + escapeHtml(d.err || '') : 'No tracklist found for this one.'}</div>`;
  const sm = stlSum(d), hl = stlNorm(subj.hl || ''), playable = !!subj.it;
  let rows = S.map((s, i) => ({ s, i }));
  if (mode === 'c' && stl.sort !== 'album') { const f = { listeners: x => x.s.l || 0, plays: x => x.s.p || 0, yours: x => stlYou(x.s) }[stl.sort] || (() => 0); rows.sort((a, b) => f(b) - f(a) || a.i - b.i); }
  const cap = mode === 'a' && !stl.all.has(key) && rows.length > 12 ? 12 : rows.length;
  const lb = (s) => `<div class="stl-lb"><div class="stl-bar"><i style="width:${s.l ? Math.max(2, Math.round(s.l / sm.maxL * 100)) : 0}%"></i></div><span class="stl-m">${stlWait(s.l, d)}</span></div>`;
  const you = (s) => { const v = stlYou(s); return `<span class="stl-m${v ? ' stl-you' : ' stl-dim'}">${s.u === null && !s.loc && d.state === 'nums' ? '·' : v ? stlF(v) : '–'}</span>`; };
  const nm = (s, i) => `<span class="stl-nm" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}${s.liked ? ' <span class="stl-you" aria-label="liked">♥</span>' : ''}${i === sm.top && mode !== 'b' && S.length > 1 ? ' <span class="stl-dim">· most played</span>' : ''}</span>`;
  const cls = (s, i) => `stl-tr${i === sm.top && S.length > 1 ? ' top' : ''}${hl && stlNorm(s.name) === hl ? ' hl' : ''}`;
  const play = (i) => playable ? ` data-stl-play="${i}" title="Play it"` : '';
  let head, body;
  if (mode === 'a') {
    head = `<div class="stl-h"><span></span><span>Song</span><span class="stl-m">Len</span><span>Listeners</span><span class="stl-m">Plays</span><span class="stl-m">Yours</span></div>`;
    body = rows.slice(0, cap).map(({ s, i }) => `<div class="${cls(s, i)}"${play(i)}><span class="stl-n">${s.n}</span>${nm(s, i)}<span class="stl-m stl-dim">${stlLen(s.ms)}</span>${lb(s)}<span class="stl-m">${stlWait(s.p, d)}</span>${you(s)}</div>`).join('');
  } else if (mode === 'b') {
    head = `<div class="stl-h"><span></span><span>Song</span><span class="stl-m">Len</span><span class="stl-m">Listeners</span><span class="stl-m">Plays</span><span class="stl-m">You</span></div>`;
    body = rows.map(({ s, i }) => `<div class="${cls(s, i)}"${play(i)}><span class="stl-n">${s.n}</span>${nm(s, i)}<span class="stl-m stl-dim">${stlLen(s.ms)}</span><span class="stl-m">${stlWait(s.l, d)}</span><span class="stl-m">${stlWait(s.p, d)}</span>${you(s)}<div class="stl-thin"><i style="width:${s.l ? Math.max(2, Math.round(s.l / sm.maxL * 100)) : 0}%"></i></div></div>`).join('');
  } else {
    head = `<div class="stl-h"><span></span><span></span><span>Song</span><span class="stl-m">Len</span><span>Listeners</span><span class="stl-m">Plays</span><span class="stl-m" title="Plays per listener">Each</span><span class="stl-m" title="The song's part of all the release's plays">Share</span><span class="stl-m">You</span><span class="stl-m" title="When you last played it (your synced scrobbles)">Last</span><span class="stl-m" title="Your rating">★</span></div>`;
    body = rows.map(({ s, i }) => `<div class="${cls(s, i)}"><span>${playable ? `<button type="button" class="stl-pl" data-stl-play="${i}" aria-label="Play ${escapeHtml(s.name)}">▶</button>` : ''}</span><span class="stl-n">${s.n}</span>${nm(s, i)}<span class="stl-m stl-dim">${stlLen(s.ms)}</span>${lb(s)}<span class="stl-m">${stlWait(s.p, d)}</span><span class="stl-m stl-dim">${s.l && s.p ? (s.p / s.l).toFixed(1) : '–'}</span><span class="stl-m stl-dim">${s.p && sm.totP ? Math.round(s.p / sm.totP * 100) + '%' : '–'}</span>${you(s)}<span class="stl-m stl-dim">${stlAgo(s.last)}</span><span class="stl-m${s.rating >= 4.5 ? ' stl-acc' : ''}">${s.rating ? String(s.rating).replace(/\.0$/, '') : '–'}</span></div>`).join('');
  }
  const more = cap < rows.length ? `<button type="button" class="stl-more" data-stl-all="${stlId(key)}">Show all ${rows.length} songs ↓</button>` : '';
  return head + body + more;
}
function stlFootHtml(d, mode) {
  if (!d.songs.length) return '';
  const sm = stlSum(d), bits = [];
  if (mode === 'a') { if (sm.totP) bits.push(`${stlF(sm.totP)} plays in all`); if (sm.you) bits.push(`<span class="stl-you">you ${stlF(sm.you)}</span>`); }
  bits.push(`Songs from ${escapeHtml(d.src || '?')}${srchLfKey() ? ' · numbers from Last.fm' : ' · save a Last.fm key for the numbers'}`);
  if (d.state === 'nums') bits.push('looking up each song…');
  if (mode === 'c') bits.push(`<span class="stl-sorts">Sort ${[['album', 'Album order'], ['listeners', 'Listeners'], ['plays', 'Plays'], ['yours', 'Yours']].map(([k, l]) => `<button type="button" class="${stl.sort === k ? 'on' : ''}" data-stl-sort="${k}">${l}</button>`).join('')}</span>`);
  return `<div class="stl-foot">${bits.map(b => `<span>${b}</span>`).join('')}</div>`;
}
function stlAHtml(key) {
  const d = stl.data.get(key); if (!d) return '<div class="stl-note">Finding the songs…</div>';
  return stlTableHtml(key, d, 'a') + stlFootHtml(d, 'a');
}
function stlPanelHtml(subj, mode) {
  const d = stl.data.get(subj.key) || { state: 'loading', songs: [], rel: {}, subj }, sb = d.subj || subj, it = sb.it, r = sb.r || {};
  const yr = stlDate(it ? it.releaseDate : r.date), lab = it ? it.label : r.label, cat = it ? (/^CRT-\d+$/.test(it.catalog || '') ? '' : it.catalog) : r.catalog;
  const sm = d.songs.length ? stlSum(d) : null, rel = d.rel || {};
  const L = rel.l != null ? rel.l : null, P = rel.p != null ? rel.p : null;
  const k = (lbl, v, sub, you) => `<div class="stl-k"><span>${lbl}</span><b${you ? ' class="stl-you"' : ''}>${v}</b>${mode === 'c' ? `<em>${sub || '&nbsp;'}</em>` : ''}</div>`;
  const songsLen = sm ? `${d.songs.length}${sm.ms ? ' · ' + stlLen(sm.ms) : ''}` : '–';
  const kp = mode === 'b'
    ? [k('Listeners', stlF(L)), k('Plays', stlF(P)), k('Plays each', L && P ? (P / L).toFixed(1) : '–'), k('Songs · length', songsLen), k('Yours', sm ? stlF(sm.you) : stlF(rel.u != null ? rel.u : rel.loc), '', true)]
    : [k('Listeners', stlF(L), 'Last.fm'), k('Plays', stlF(P), 'Last.fm'), k('Plays each', L && P ? (P / L).toFixed(1) : '–', 'per listener'), k('Top song share', sm && sm.top >= 0 && sm.totP ? Math.round((d.songs[sm.top].p || 0) / sm.totP * 100) + '%' : '–', sm && sm.top >= 0 ? escapeHtml(d.songs[sm.top].name) : ''),
       k('Your plays', sm ? stlF(sm.you) : stlF(rel.u != null ? rel.u : rel.loc), 'songs, all time', true), k('Full listens', sm && d.songs.length ? stlF(sm.full) : '–', 'every song played', true), k('Last played', sm ? stlAgo(sm.last) : stlAgo(rel.last), sm && sm.last ? 'ago' : ''), k('Songs · length', songsLen, it && it.rymRating ? 'RYM ★ ' + it.rymRating : '')];
  const acts = [it ? `<button type="button" class="stl-btn pri" data-stl-playall>Play${mode === 'c' ? ' all' : ''}</button><button type="button" class="stl-btn" data-stl-deck>Open the deck</button>` : `<button type="button" class="stl-btn pri" data-stl-add>+ Add to crate</button>`,
    rel.url ? `<a class="stl-btn" href="${escapeHtml(rel.url)}" target="_blank" rel="noopener">Last.fm ↗</a>` : ''].join('');
  const tag = it ? `<div class="stl-tag">In your crate${it.dateAdded ? ' · added ' + escapeHtml(String(it.dateAdded).slice(0, 10)) : ''}</div>` : `<div class="stl-tag stl-new">Not in your crate yet${r.src ? ' · ' + escapeHtml(srchSrcName(r.src)) : ''}</div>`;
  return `${mode === 'c' ? '<button type="button" class="stl-x" data-stl-close aria-label="Close the card">✕</button>' : ''}<div class="stl-ph">${srchImg(sb.cover, 'stl-cv')}<div style="min-width:0">${tag}<div class="stl-pt">${escapeHtml(sb.title)}</div><div class="stl-ps">${escapeHtml([sb.artist, yr, lab, cat].filter(Boolean).join(' · '))}</div><div class="stl-acts">${acts}</div></div></div>
    <div class="stl-kpis">${kp.join('')}</div><div class="stl-tbl">${stlTableHtml(subj.key, d, mode)}</div>${stlFootHtml(d, mode)}`;
}
// Repaint every place showing this release (the rest of the dropdown stays as it is)
function stlPaint(key) {
  const id = stlId(key), d = stl.data.get(key); if (!d) return;
  document.querySelectorAll(`[data-stl="${id}"]`).forEach(n => { n.innerHTML = n.dataset.stlMode === 'a' ? stlAHtml(key) : n.dataset.stlMode === 'q' ? stlQpHtml(key) : stlPanelHtml(d.subj, n.dataset.stlMode); });
}

// ----- A: ▸ in the list -----
function stlTogHtml(subj) { const on = stl.open.has(subj.key); return `<button type="button" class="stl-tog${on ? ' on' : ''}" data-stl-tog="${stlId(subj.key)}" aria-expanded="${on}" aria-label="${on ? 'Hide' : 'Show'} the songs of ${escapeHtml(subj.title)}" title="${on ? 'Hide' : 'Show'} the songs (→ / ←)">${on ? '▾' : '▸'}</button>`; }
function stlExpHtml(subj) { if (!stl.open.has(subj.key)) return ''; stlWant(subj, 0); const id = stlId(subj.key); return `<div class="stl-a" data-stl="${id}" data-stl-mode="a">${stlAHtml(subj.key)}</div>`; }
function stlToggleKey(key, on) {
  if (on == null) on = !stl.open.has(key);
  if (on) stl.open.add(key); else stl.open.delete(key);
  const d = stl.data.get(key); if (on && d && d.state === 'err') stl.data.delete(key);
  ssRender();
}

// The simple look (as 64-search-ui.js's, with ▸ on releases and their songs under them)
srchSimpleHtml = function () {
  const kindName = { field: 'Field', artist: 'Artist', release: 'Release', track: 'Track', genre: 'Genre', descriptor: 'Descriptor', songdesc: 'Descriptor', label: 'Label', type: 'Type', title: 'Release', online: '+ Add' };
  const look = srchSimpleOnline(el.searchInput.value) ? (srch.onlineState === 'loading' ? '<div class="ss-online-note">Looking online…</div>' : !ssItems.some(x => x.kind === 'online') && srch.onlineState === 'done' ? `<div class="ss-online-note">${escapeHtml(srch.onlineNote || 'Nothing found online either.')}</div>` : '') : '';
  return ssItems.map((s, i) => { const sj = s.kind === 'release' || s.kind === 'online' ? stlSubj(s) : null;
    return `<div class="ss-item ss-k-${s.kind}${i === ssActive ? ' on' : ''}${sj ? ' stl-t' : ''}" id="ss-${i}" role="option" aria-selected="${i === ssActive}" data-ss="${i}"><span class="ss-kind">${kindName[s.kind] || ''}</span><span class="ss-label">${escapeHtml(s.label)}</span><span class="ss-sub">${escapeHtml(String(s.sub || ''))}</span>${sj ? stlTogHtml(sj) : ''}</div>${sj ? stlExpHtml(sj) : ''}`; }).join('')
    + look + `<div class="srch-simple-foot"><button type="button" class="srch-link" data-srch-look="drop" title="Your crate and releases to add from online, with covers, refine chips, recent and saved searches">⤢ More search</button>${srchSongsBtn()}</div>`;
};
// The drop look's rows on a narrow window: the same ▸
const stlBaseRow = srchRowHtml;
srchRowHtml = function (s, i) {
  const h = stlBaseRow(s, i);
  if (srchLook() !== 'drop' || stlWide() || (s.kind !== 'release' && s.kind !== 'online')) return h;
  const sj = stlSubj(s); if (!sj) return h;
  return h.slice(0, -6) + stlTogHtml(sj) + '</div>' + stlExpHtml(sj);
};

// ----- B: the panel beside the drop look -----
function stlPvIndex() {
  const ok = (i) => i >= 0 && ssItems[i] && (ssItems[i].kind === 'release' || ssItems[i].kind === 'online' || ssItems[i].kind === 'track') && stlSubj(ssItems[i]);
  if (ok(ssActive)) return ssActive;
  for (let i = 0; i < ssItems.length; i++) if ((ssItems[i].kind === 'release' || ssItems[i].kind === 'online') && ok(i)) return i;
  return -1;
}
function stlPvHtml() {
  const i = stlPvIndex(), sj = i >= 0 ? stlSubj(ssItems[i]) : null;
  if (!sj) return { id: '', html: '<div class="stl-note">Move over a release to see its songs and how much each is played.</div>' };
  if (!stl.data.has(sj.key)) stlWant(sj, 220, 'b');
  return { id: stlId(sj.key), html: stlPanelHtml(sj, 'b') };
}
const stlBaseDrop = srchDropdownHtml;
srchDropdownHtml = function () {
  const h = stlBaseDrop(); if (!stlWide()) return h;
  const pv = stlPvHtml();
  return `<div class="stl-split"><div class="stl-left">${h}</div><aside class="stl-pv" data-stl="${pv.id}" data-stl-mode="b" aria-live="polite">${pv.html}</aside></div>`;
};
function stlPvRefresh() {
  const box = document.getElementById('searchSuggest'), a = box && box.querySelector('.stl-pv'); if (!a) return;
  const pv = stlPvHtml(); if (a.dataset.stl === pv.id && pv.id) return;
  a.dataset.stl = pv.id; a.innerHTML = pv.html;
}

// ----- C: the card in the detail look -----
function stlCardSubj() {
  const s = ssActive >= 0 ? ssItems[ssActive] : null, a = s && s.col === 'grid' ? stlSubj(s) : null;
  if (a) return a;
  if (!stl.selKey) return null;
  const hit = ssItems.find(x => x.col === 'grid' && (stlSubj(x) || {}).key === stl.selKey);
  if (hit) return stlSubj(hit);
  const d = stl.data.get(stl.selKey); return d ? d.subj : null;
}
const stlBaseDetail = srchDetailHtml;
srchDetailHtml = function () {
  let h = stlBaseDetail();
  const sj = el.searchInput.value.trim() ? stlCardSubj() : null; if (!sj) return h;
  stl.selKey = sj.key; stlWant(sj, ssActive >= 0 && stl.kbd ? 220 : 0, 'c');
  ssItems.forEach((x, i) => { if (x.col === 'grid' && (stlSubj(x) || {}).key === sj.key) h = h.replace(`class="srch-cell" id="ss-${i}"`, `class="srch-cell stl-sel" id="ss-${i}"`).replace(`class="srch-cell on" id="ss-${i}"`, `class="srch-cell on stl-sel" id="ss-${i}"`); });
  const at = h.lastIndexOf('</div><div class="srch-foot">'); if (at < 0) return h;
  return h.slice(0, at).replace('<div class="srch-dbody">', '<div class="srch-dbody stl-on">') + `<section class="stl-card" data-stl="${stlId(sj.key)}" data-stl-mode="c" aria-label="${escapeHtml(sj.title)}: songs">${stlPanelHtml(sj, 'c')}</section>` + h.slice(at);
};

// ----- clicks, keys and the mouse -----
const stlBaseRender = ssRender;
ssRender = function () {
  stlBaseRender.apply(this, arguments);
  const box = document.getElementById('searchSuggest'); if (!box) return;
  box.classList.toggle('stl-wide', stlWide() && !!el.searchInput.value.trim());
  box.classList.toggle('stl-wide-a', srchLook() !== 'detail' && !stlWide() && !!box.querySelector('.stl-a'));          // songs open under a row: room for their names
};
function stlSubjOfId(id) { const key = stl.byId.get(id), d = key && stl.data.get(key); return d ? d.subj : null; }
function stlClick(e) {
  const t = e.target, g = (sel) => t.closest(sel); let b;
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if ((b = g('[data-stl-tog]'))) { stop(); return stlToggleKey(stl.byId.get(b.dataset.stlTog)); }
  if ((b = g('[data-stl-all]'))) { stop(); stl.all.add(stl.byId.get(b.dataset.stlAll)); return ssRender(); }
  if ((b = g('[data-stl-sort]'))) { stop(); stl.sort = b.dataset.stlSort; srchLsSet(STL_SORT_KEY, stl.sort); return stl.selKey && stlPaint(stl.selKey); }
  if (g('[data-stl-close]')) { stop(); stl.selKey = ''; ssActive = -1; return ssRender(); }
  const host = g('[data-stl]'), sj = host ? stlSubjOfId(host.dataset.stl) : null;
  if (sj && (b = g('[data-stl-play]'))) { stop(); const d = stl.data.get(sj.key), s = d && d.songs[+b.dataset.stlPlay]; if (s && sj.it && typeof playTrackNow === 'function') playTrackNow(sj.it, s.name, s.n); return; }
  if (sj && g('[data-stl-playall]')) { stop(); if (sj.it && typeof playAlbumNow === 'function') playAlbumNow(sj.it); return; }
  if (sj && g('[data-stl-deck]')) { stop(); if (sj.it) { srchRemember(el.searchInput.value); srch.keep = true; el.searchInput.blur(); openDeck(sj.it); ssRender(); } return; }
  if (sj && g('[data-stl-add]')) { stop(); if (sj.r) srchAddOnline(sj.r); return; }
  if (host && g('a[href]')) { e.stopImmediatePropagation(); return; }
  if (host) { stop(); return; }          // (anywhere else in the songs: nothing, rather than opening the release)
  // detail look: the first click on a release shows its card; a second one (or Enter) opens it
  const cell = g('.srch-cell[data-ss]');
  if (cell && srchLook() === 'detail') { const i = +cell.dataset.ss, c = stlSubj(ssItems[i]); if (c && stl.selKey !== c.key) { stop(); stl.selKey = c.key; stl.kbd = false; ssActive = i; ssRender(); } }
}
function stlKey(e) {
  const box = document.getElementById('searchSuggest'), inp = el.searchInput; if (!box || box.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { stl.kbd = true; if (stlWide()) requestAnimationFrame(stlPvRefresh); return; }
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const lk = srchLook(); if (ssActive < 0 || lk === 'detail' || (lk === 'drop' && stlWide())) return;
  const s = ssItems[ssActive]; if (!s || (s.kind !== 'release' && s.kind !== 'online')) return;
  const sj = stlSubj(s); if (!sj) return;
  const open = stl.open.has(sj.key);
  if (e.key === 'ArrowRight' && !open && inp.selectionStart === inp.value.length) { e.preventDefault(); stlToggleKey(sj.key, true); }
  else if (e.key === 'ArrowLeft' && open) { e.preventDefault(); stlToggleKey(sj.key, false); }
}
function stlHover(e) {
  if (!stlWide()) return;
  const row = e.target.closest('#searchSuggest [data-ss]'); if (!row) return;
  const i = +row.dataset.ss; if (i === ssActive) return;
  const s = ssItems[i]; if (!s || !(s.kind === 'release' || s.kind === 'online' || s.kind === 'track') || !stlSubj(s)) return;
  const box = document.getElementById('searchSuggest');
  box.querySelectorAll('[data-ss].on').forEach(n => { n.classList.remove('on'); n.setAttribute('aria-selected', 'false'); });
  row.classList.add('on'); row.setAttribute('aria-selected', 'true'); ssActive = i; el.searchInput.setAttribute('aria-activedescendant', 'ss-' + i); stl.kbd = false;
  stlPvRefresh();
}
const stlBaseInit = initSearchSuggest;
initSearchSuggest = function () {
  stlBaseInit.apply(this, arguments);
  const box = document.getElementById('searchSuggest'), inp = el.searchInput; if (!box || !inp || box.dataset.stlInit) return;
  box.dataset.stlInit = '1';
  box.addEventListener('click', stlClick, true);
  box.addEventListener('mouseover', stlHover);
  inp.addEventListener('keydown', stlKey, true);
};

// ----- (1.135.108) Release dates on every release the search shows: "14 Mar 1991", "Mar 1991" or "1991", whichever is known -----
const STL_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function stlDate(d) {
  const m = String(d || '').trim().match(/^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?/); if (!m) return '';
  const mo = m[2] ? +m[2] : 0, dy = m[3] ? +m[3] : 0;
  return (mo >= 1 && mo <= 12 ? (dy >= 1 && dy <= 31 ? dy + ' ' : '') + STL_MON[mo - 1] + ' ' : '') + m[1];
}
let stlDateSub = function (s) {
  if (!s) return;
  if (s.kind === 'release') {
    const it = s.it || state.raw.find(r => String(r.row) === String(s.row)); if (!it) return;
    const d = stlDate(it.releaseDate); if (d) s.sub = [it.artist, d].filter(Boolean).join(' · ');
  } else if (s.kind === 'online' && s.r) {
    const r = s.r, d = stlDate(r.date);
    s.sub = [r.artist, d, s.col !== 'grid' && r.type && r.type !== 'Album' ? r.type : '', srchPopFmt(r.listeners, r) || (s.col !== 'grid' ? srchSrcName(r.src) : '')].filter(Boolean).join(' · ');
  }
};
const stlBaseItems = srchItems;
srchItems = function () { const a = stlBaseItems.apply(this, arguments); try { a.forEach(x => stlDateSub(x)); } catch (e) { /* as they were */ } return a; };

// ----- (1.135.109) Sort the releases the search shows: best match, Last.fm listeners or plays, your plays, newest, oldest, A–Z -----
// One choice for your crate's releases and the ones found online (in the detailed grid, all of them together). Listeners and plays
// come from Last.fm's album.getInfo, the same lookup "Popular first" made (kept a month); your plays from your scrobbles.
const STL_SORTSEL_KEY = 'crate_search_sort_v1';
const STL_SORTS = [['match', 'Best match'], ['listeners', 'Listeners'], ['plays', 'Plays'], ['yours', 'Your plays'], ['new', 'Newest'], ['old', 'Oldest'], ['az', 'A–Z']];
function stlSortKey() { const v = srchLs(STL_SORTSEL_KEY, null); if (STL_SORTS.some(s => s[0] === v)) return v; return srchPopSortOn() ? 'listeners' : 'match'; }
let stlYoursMap = null, stlYoursOf = null, stlYoursN = -1;
function stlYoursOfName(a, t) {
  const l = state.scrobbles || [];
  if (stlYoursOf !== l || stlYoursN !== l.length) { stlYoursMap = new Map(); l.forEach(s => { const k = stlRelKey(s.artist, s.title); stlYoursMap.set(k, (stlYoursMap.get(k) || 0) + (Number(s.playCount) || 0)); }); stlYoursOf = l; stlYoursN = l.length; }
  return stlYoursMap.get(stlRelKey(a, t)) || 0;
}
function stlVal(k, x) {          // x: { it } (crate) or { r } (online)
  const it = x.it, r = x.r, c = srchPopAll()[srchPopK(it || r)] || {};
  if (k === 'listeners') return (r && r.listeners) || c.n || 0;
  if (k === 'plays') return (r && r.playcount) || c.p || 0;
  if (k === 'yours') return it ? stlYoursOfName(it.artist, it.title) : stlYoursOfName(r.artist, r.title);
  if (k === 'new' || k === 'old') return String((it ? it.releaseDate : r.date) || '').slice(0, 10);
  if (k === 'az') return String((it || r).title || '').toLowerCase();
  return null;
}
function stlCmp(k, a, b) {
  const A = stlVal(k, a), B = stlVal(k, b);
  if (k === 'az') return A.localeCompare(B);
  if (k === 'new' || k === 'old') { if (!A !== !B) return A ? -1 : 1; return k === 'new' ? B.localeCompare(A) : A.localeCompare(B); }          // (no date: last)
  return (B || 0) - (A || 0);
}
srchPopSort = function () {
  srch.online.forEach((r, i) => { if (r._at == null) r._at = i; });
  const k = stlSortKey(), cat = (a, b) => (b.catExact ? 1 : 0) - (a.catExact ? 1 : 0);
  if (k === 'match') { srch.online.sort((a, b) => cat(a, b) || (a._at || 0) - (b._at || 0)); return; }
  if (k === 'listeners') { const byL = srch.online.some(r => r.listeners), pop = (r) => (r.editions || 0) * 400 + (r.have || 0);
    srch.online.sort((a, b) => cat(a, b) || (byL ? ((b.listeners || -1) - (a.listeners || -1) || pop(b) - pop(a)) : pop(b) - pop(a)) || a._at - b._at); return; }
  srch.online.sort((a, b) => cat(a, b) || stlCmp(k, { r: a }, { r: b }) || a._at - b._at);
};
// album.getInfo for the releases found online (as before) and, sorting by listeners or plays, your crate's shown releases too: both numbers kept
srchPopRank = async function (seq, key) {
  const all = srchPopAll(), now = Date.now(), list = srch.online, k = stlSortKey(); list.forEach((r, i) => { r._at = i; });
  const need = list.filter(r => { const c = all[srchPopK(r)]; if (c && now - c.t < 30 * 864e5 && (k !== 'plays' || c.p != null)) { r.listeners = c.n; if (c.p != null) r.playcount = c.p; return false; } return !stlPopCooling(r); });
  if (!need.length) { srchPopSort(); stlRenderSoon(); return; }
  const r0 = await stlPopFetch(need.map(r => ({ r })), seq);
  if (seq !== srch.seq) return;
  if (r0.failed && !r0.ok) srch.onlineNote = `Last.fm didn't answer (${srchLfErr}): not ranked by listeners`; else if (r0.ok) srchLfErr = '';
  srchPopSort(); stlRenderSoon();
};
// (1.135.111) A lookup that failed isn't asked again for 10 minutes. Before, a failure left nothing behind, so the search drew itself
// again, asked again, failed again… without end: the menu was redrawn so often that clicks on it never landed.
const stlPopFailed = new Map();
const stlPopCooling = (o) => { const t = stlPopFailed.get(srchPopK(o)); return !!t && Date.now() - t < 10 * 60e3; };
async function stlPopFetch(xs, seq) {          // xs: [{ r } | { it }]; fills the cache (and r.listeners / r.playcount)
  const all = srchPopAll(), now = Date.now(); let i = 0, ok = 0, failed = 0;
  const one = async () => { while (i < xs.length) { const x = xs[i++], o = x.r || x.it; if (seq != null && seq !== srch.seq) return;
    try { const j = await srchLf({ method: 'album.getinfo', artist: o.artist, album: o.title, autocorrect: '1' }), al = j && j.album, n = al ? Number(al.listeners) || 0 : 0, p = al ? Number(al.playcount) || 0 : 0;
      all[srchPopK(o)] = { n, p, t: now }; ok++; if (x.r) { x.r.listeners = n; x.r.playcount = p; if (!x.r.cover && al && Array.isArray(al.image)) { const im = (al.image.find(z => z.size === 'extralarge') || al.image.slice(-1)[0] || {})['#text']; if (im) x.r.cover = im; } }
    } catch (e) { if (e && e.lfCode === 6) { all[srchPopK(o)] = { n: 0, p: 0, t: now }; ok++; } else { failed++; stlPopFailed.set(srchPopK(o), Date.now()); srchLfFail(e); } } } };
  await Promise.all([one(), one(), one(), one()]); srchPopSave();
  return { ok, failed };
}
let stlCrateFetching = false;
function stlCrateNums(its) {          // your crate's releases shown, sorted by listeners or plays: their numbers looked up once
  const k = stlSortKey(); if ((k !== 'listeners' && k !== 'plays') || stlCrateFetching || !srchLfKey()) return;
  const all = srchPopAll(), now = Date.now(), need = its.filter(it => { const c = all[srchPopK(it)]; return !(c && now - c.t < 30 * 864e5 && c.p != null) && !stlPopCooling(it); }).slice(0, 40);
  if (!need.length) return;
  stlCrateFetching = true; stlPopFetch(need.map(it => ({ it }))).then((r) => { stlCrateFetching = false; if (r && r.ok) stlRenderSoon(); }).catch(() => { stlCrateFetching = false; });
}
// the crate's releases, sorted, before the detailed grid takes its first 18 / 48
srchDetailItems = function (q) {
  const items = [], tab = srch.tab, has = q.trim(), k = stlSortKey();
  if (!has) return items;
  const crate = (state.filtered || []).slice();
  if (k !== 'match') { crate.sort((a, b) => stlCmp(k, { it: a }, { it: b })); }
  const grid = [];
  if (tab === 'all' || tab === 'crate') crate.slice(0, tab === 'crate' ? 48 : 18).forEach(it => grid.push({ kind: 'release', col: 'grid', it, label: it.title, sub: it.artist, row: it.row, cover: srchItemCover(it) }));
  if (tab === 'all' || tab === 'add') srch.online.slice(0, tab === 'add' ? 30 : 12).forEach(r => grid.push({ kind: 'online', col: 'grid', r, label: r.title, sub: [r.artist, srchPopFmt(r.listeners, r)].filter(Boolean).join(' · '), cover: r.cover, add: true }));
  if (k !== 'match' && tab === 'all') grid.sort((a, b) => stlCmp(k, a, b));          // (sorted: your crate's and the ones to add together)
  items.push(...grid);
  stlCrateNums(grid.filter(x => x.it).map(x => x.it));
  const sug = srchCrateItems(q);
  if (tab === 'all' || tab === 'songs') sug.filter(s => s.kind === 'track').forEach(s => items.push(Object.assign({}, s, { col: 'songs' })));
  if (tab === 'all' || tab === 'artists') sug.filter(s => s.kind === 'artist').forEach(s => items.push(Object.assign({}, s, { col: 'artists' })));
  return items;
};
// the drop and simple lists: the releases among your crate's suggestions sorted (artists, genres… stay on top), the online ones already are
const stlBaseItems2 = srchItems;
srchItems = function () {
  const a = stlBaseItems2.apply(this, arguments), k = stlSortKey(), lk = srchLook();
  if (lk === 'detail') return a;
  const isRel = (s) => s.kind === 'release' && (s.it || (s.it = state.raw.find(r => String(r.row) === String(s.row))));
  const rels = a.filter(s => s.col !== 'online' && isRel(s));
  if (k !== 'match' && rels.length > 1) { const sorted = rels.slice().sort((x, y) => stlCmp(k, x, y)); let j = 0; for (let i = 0; i < a.length; i++) if (a[i].col !== 'online' && isRel(a[i])) a[i] = sorted[j++]; }
  stlCrateNums(rels.map(s => s.it));
  return a;
};
// the number it's sorted by, on each release
const stlNumFmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
const stlBaseDateSub = stlDateSub;
stlDateSub = function (s) {
  stlBaseDateSub(s);
  const k = stlSortKey(); if ((k !== 'plays' && k !== 'yours' && k !== 'listeners') || !s || (s.kind !== 'release' && s.kind !== 'online')) return;
  const x = s.kind === 'online' ? { r: s.r } : { it: s.it || state.raw.find(r => String(r.row) === String(s.row)) }; if (!x.r && !x.it) return;
  const v = stlVal(k, x); if (!v) return;
  const tag = k === 'plays' ? `${stlNumFmt(v)} plays` : k === 'yours' ? `you ${stlNumFmt(v)}` : `${stlNumFmt(v)} listeners`;
  if (!String(s.sub || '').includes(tag)) s.sub = [String(s.sub || '').replace(/ · [\d.]+[mk]? listeners$/, ''), tag].filter(Boolean).join(' · ');
};
// the menu, where "Popular first" was (and above the crate column)
function stlSortSelHtml() { const k = stlSortKey(); return `<label class="stl-sortsel"><span>Sort</span><select data-stl-sortsel aria-label="Sort releases">${STL_SORTS.map(([v, l]) => `<option value="${v}"${v === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`; }
const STL_POP_RE = /<button type="button" class="srch-popsort" data-srch-pop[^>]*>[^<]*<\/button>/g;
const stlBaseDrop2 = srchDropdownHtml;
srchDropdownHtml = function () { const h = stlBaseDrop2.apply(this, arguments).replace(STL_POP_RE, ''); return h.replace('<div class="srch-cols">', `<div class="stl-sortbar">${stlSortSelHtml()}</div><div class="srch-cols">`); };
const stlBaseDetail2 = srchDetailHtml;
srchDetailHtml = function () { const h = stlBaseDetail2.apply(this, arguments).replace(STL_POP_RE, ''); return el.searchInput.value.trim() ? h.replace('<div class="srch-grid">', `<div class="stl-sortbar">${stlSortSelHtml()}</div><div class="srch-grid">`) : h; };
const stlBaseSimple = srchSimpleHtml;
srchSimpleHtml = function () { const h = stlBaseSimple.apply(this, arguments); return ssItems.filter(s => s.kind === 'release' || s.kind === 'online').length > 1 ? h.replace('<div class="srch-simple-foot">', `<div class="srch-simple-foot"><div class="stl-sortbar stl-sortbar-s">${stlSortSelHtml()}</div>`) : h; };
function stlSortChange(e) {
  const sel = e.target.closest('[data-stl-sortsel]'); if (!sel) return;
  srchLsSet(STL_SORTSEL_KEY, sel.value); srchLsSet(SRCH_POP_SORT_KEY, sel.value === 'match' ? 'match' : 'pop');
  srchPopSort(); if (sel.value === 'plays' || sel.value === 'listeners') { const seq = srch.seq; if (srchLfKey() && srch.online.length) srchPopRank(seq); }
  ssRender(); el.searchInput.focus({ preventScroll: true });
}
const stlBaseInit2 = initSearchSuggest;
initSearchSuggest = function () { stlBaseInit2.apply(this, arguments); const box = document.getElementById('searchSuggest'); if (box && !box.dataset.stlSort) { box.dataset.stlSort = '1'; box.addEventListener('change', stlSortChange); } };


// ----- (1.135.109) The same card on its own, over the page: a release on the artist page's More albums that isn't in your crate -----
// subj: { artist, title, r: { artist, title, date, type, src, cover }, cover, add: fn }
let stlPop = null;
function stlOpenCard(subj) {
  stlCloseCard();
  subj = Object.assign({ key: 'o:' + srchPopK(subj), it: null }, subj);
  const ov = document.createElement('div'); ov.className = 'stl-pop-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', subj.title + ': songs');
  ov.innerHTML = `<section class="stl-card stl-pop" data-stl="${stlId(subj.key)}" data-stl-mode="c"></section>`;
  document.body.appendChild(ov); stlPop = { ov, subj };
  stlWant(subj, 0); const d = stl.data.get(subj.key); if (d) d.subj = Object.assign({}, d.subj, subj);
  ov.querySelector('.stl-pop').innerHTML = stlPanelHtml(subj, 'c');
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) stlCloseCard(); });
  ov.addEventListener('click', (e) => {
    const g = (q) => e.target.closest(q);
    if (g('[data-stl-close]')) { e.preventDefault(); stlCloseCard(); return; }
    if (g('[data-stl-add]')) { e.preventDefault(); const f = subj.add; stlCloseCard(); if (f) f(); else if (subj.r) srchAddOnline(subj.r); return; }
    const b = g('[data-stl-sort]'); if (b) { stl.sort = b.dataset.stlSort; srchLsSet(STL_SORT_KEY, stl.sort); stlPaint(subj.key); }
  });
  stlPop.key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stlCloseCard(); } };
  document.addEventListener('keydown', stlPop.key, true);
  const x = ov.querySelector('[data-stl-close]'); if (x) x.focus();
}
function stlCloseCard() { if (!stlPop) return; document.removeEventListener('keydown', stlPop.key, true); stlPop.ov.remove(); stlPop = null; }

// ----- (1.135.110) Release dates for the releases found online that came without one (Last.fm gives none): MusicBrainz is asked for
// each (its release group's first release date), one at a time, for the first 24 shown; kept in this browser for 90 days -----
const STL_DATES_KEY = 'crate_search_dates_v1';
let stlDatesMem = null, stlDatesRun = 0;
function stlDates() { if (!stlDatesMem) stlDatesMem = srchLs(STL_DATES_KEY, {}) || {}; return stlDatesMem; }
function stlDatesApply() { const all = stlDates(); let n = 0; srch.online.forEach(r => { if (r.date) return; const c = all[srchPopK(r)]; if (c && c.d) { r.date = c.d; n++; } }); return n; }
function stlDatesSoon() { clearTimeout(stlDatesSoon.t); stlDatesSoon.t = setTimeout(stlDatesFill, 400); }
async function stlDatesFill() { stlDatesFill.busy = true; try { await stlDatesFillRun(); } finally { stlDatesFill.busy = false; } }
async function stlDatesFillRun() {
  const seq = srch.seq, run = ++stlDatesRun, all = stlDates(), now = Date.now();
  stlDatesApply();
  const need = srch.online.slice(0, 24).filter(r => !r.date && !stlDateCooling(r) && !(all[srchPopK(r)] && now - all[srchPopK(r)].t < 90 * 864e5));
  let last = 0;
  for (const r of need) {
    if (seq !== srch.seq || run !== stlDatesRun) return;
    let d = '';
    try {
      const q = `releasegroup:"${String(r.title).replace(/"/g, '')}" AND artist:"${String(r.artist).replace(/"/g, '')}"`;
      const res = await mbFetch(`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=5`, { headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }, timeoutMs: 9000, retryBusy: 1 });
      if (!res.ok) { stlPopFailed.set('d:' + srchPopK(r), Date.now()); continue; }          // (not kept: asked again in 10 minutes)
      const t = stlNorm(r.title), hits = ((await res.json())['release-groups'] || []).filter(h => h['first-release-date']);
      const h = hits.find(x => stlNorm(x.title) === t) || hits.find(x => { const y = stlNorm(x.title); return y && (y.startsWith(t) || t.startsWith(y)); });
      d = h ? h['first-release-date'] : '';
    } catch (e) { stlPopFailed.set('d:' + srchPopK(r), Date.now()); continue; }
    all[srchPopK(r)] = { d, t: now }; if (d) r.date = d;
    if (Date.now() - last > 700) { last = Date.now(); if (stlSortKey() === 'new' || stlSortKey() === 'old') srchPopSort(); stlRenderSoon(); }
  }
  const ks = Object.keys(all); if (ks.length > 4000) ks.slice(0, ks.length - 4000).forEach(k => delete all[k]);
  srchLsSet(STL_DATES_KEY, all);
  if (seq === srch.seq && run === stlDatesRun) { if (stlSortKey() === 'new' || stlSortKey() === 'old') srchPopSort(); stlRenderSoon(); }
}
const stlBasePopSort = srchPopSort;
const stlDateCooling = (r) => { const t = stlPopFailed.get('d:' + srchPopK(r)); return !!t && Date.now() - t < 10 * 60e3; };
function stlDatesNeeded() { const all = stlDates(), now = Date.now(); return srch.online.slice(0, 24).some(r => !r.date && !stlDateCooling(r) && !(all[srchPopK(r)] && now - all[srchPopK(r)].t < 90 * 864e5)); }
srchPopSort = function () { if (srch.online.some(r => !r.date)) { stlDatesApply(); if (stlDatesNeeded() && !stlDatesFill.busy) stlDatesSoon(); } return stlBasePopSort.apply(this, arguments); };


// (1.135.111) Redraws from lookups finishing in the background wait while the mouse is down on the menu (a redraw between press and
// release swallowed the click) and come at most every 250 ms.
let stlMouseDown = false, stlRenderT = 0;
function stlRenderSoon() { clearTimeout(stlRenderT); stlRenderT = setTimeout(() => { if (stlMouseDown) return stlRenderSoon(); ssRender(); }, 250); }
document.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('#searchSuggest')) stlMouseDown = true; }, true);
document.addEventListener('mouseup', () => { setTimeout(() => { stlMouseDown = false; }, 0); }, true);


// ----- (1.135.112) The cover view's popup › Listens: Last.fm's numbers for the release and each song (listeners, plays, yours) -----
// Looked up when the Listens tab is shown (the same lookups as the search's songs, kept two days), under your own plays.
function stlQpHtml(key) {
  const d = stl.data.get(key);
  const head = '<div class="qp-lf-head"><span class="qp-dim">On Last.fm</span></div>';
  if (!srchLfKey()) return head + '<p class="tracklist-status">Save a Last.fm API key (⚙ › Last.fm) to see how much this is played there.</p>';
  if (!d || (d.state === 'loading' && !d.songs.length)) return head + '<p class="tracklist-status">Looking it up on Last.fm…</p>';
  const rel = d.rel || {}, sm = d.songs.length ? stlSum(d) : null, L = rel.l, P = rel.p;
  const k = (lbl, v, you) => `<div class="stl-k"><span>${lbl}</span><b${you ? ' class="stl-you"' : ''}>${v}</b></div>`;
  const yours = rel.u != null ? rel.u : sm ? sm.you : rel.loc;
  const kp = `<div class="stl-kpis qp-lf-kpis">${k('Listeners', stlF(L))}${k('Plays', stlF(P))}${k('Plays each', L && P ? (P / L).toFixed(1) : '–')}${k('Yours', stlF(yours), true)}</div>`;
  const top = sm && sm.top >= 0 && sm.totP ? `<div class="qp-about-row"><span class="qp-dim">Most played song</span><span>${escapeHtml(d.songs[sm.top].name)} · ${Math.round((d.songs[sm.top].p || 0) / sm.totP * 100)}% of its plays</span></div>` : '';
  const link = rel.url ? ` <a class="qp-dim qp-lf-link" href="${escapeHtml(rel.url)}" target="_blank" rel="noopener">Last.fm ↗</a>` : '';
  return head.replace('</div>', link + '</div>') + kp + top + `<div class="stl-a qp-lf-tbl">${stlTableHtml(key, d, 'a')}${stlFootHtml(d, 'a')}</div>`;
}
function stlQpMount(item, load) {
  const box = el.albumQuickPeekListens; if (!box || !item) return;
  const subj = { key: 'c:' + item.row, artist: item.artist, title: item.title, it: item, r: null, cover: srchItemCover(item) };
  let host = box.querySelector('.qp-lf'); if (!host) { host = document.createElement('div'); host.className = 'qp-lf'; box.appendChild(host); }
  host.dataset.stl = stlId(subj.key); host.dataset.stlMode = 'q';
  if ((load || !box.hidden) && srchLfKey()) stlWant(subj, 0);
  const d = stl.data.get(subj.key); if (d) d.subj = Object.assign({}, d.subj, subj);
  host.innerHTML = stlQpHtml(subj.key);
  if (!box.dataset.stlWired) { box.dataset.stlWired = '1';
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-stl-play]'), m = e.target.closest('[data-stl-all]'); if (!b && !m) return;
      e.stopPropagation(); const key = stl.byId.get((e.target.closest('[data-stl]') || {}).dataset.stl || ''); if (!key) return;
      if (m) { stl.all.add(key); stlPaint(key); return; }
      const dd = stl.data.get(key), s = dd && dd.songs[+b.dataset.stlPlay]; if (s && dd.subj.it && typeof playTrackNow === 'function') playTrackNow(dd.subj.it, s.name, s.n);
    }); }
}
const stlBaseQp = openAlbumQuickPeek;
openAlbumQuickPeek = function (item) { const r = stlBaseQp.apply(this, arguments); try { stlQpMount(item); } catch (e) { /* the popup as before */ } return r; };
const stlBaseQpTab = qpSetTab;
qpSetTab = function (tab) { stlBaseQpTab.apply(this, arguments); try { if (tab === 'listens' && typeof quickPeekItem !== 'undefined' && quickPeekItem) stlQpMount(quickPeekItem, true); } catch (e) { /* as before */ } };
