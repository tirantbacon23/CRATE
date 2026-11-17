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
  const yr = String((it ? it.releaseDate : r.date) || '').slice(0, 4), lab = it ? it.label : r.label, cat = it ? (/^CRT-\d+$/.test(it.catalog || '') ? '' : it.catalog) : r.catalog;
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
  document.querySelectorAll(`#searchSuggest [data-stl="${id}"]`).forEach(n => { n.innerHTML = n.dataset.stlMode === 'a' ? stlAHtml(key) : stlPanelHtml(d.subj, n.dataset.stlMode); });
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
