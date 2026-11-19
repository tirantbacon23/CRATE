// (1.135.168) CRATE Radio, step 2 and 3: plays beyond your crate, from the music database (js/99-music-db.js, Master.gs's musicRadio).
//   Stations: your taste, a genre, an artist, a release, a descriptor, friends' favourites, deep cuts, a time machine. Each has
//   "How new" (how much comes from beyond your crate), "How far" (close / nearby / adventurous), years, and one song / a few / whole releases.
//   The database hands back releases near the station (its genres, its artists and the artists Last.fm calls similar to them); CRATE picks
//   from those with your taste and what you've done this session (Like, Skip, Not for me), and mixes in your own releases.
//   Songs play through the usual queue: a link someone found before (kept in the database for everyone), else YouTube through the add-on
//   when that's your source, else Spotify's search.
//   The radio window: Now playing (why this, up next, this session's numbers), Stations, and Discover (the database's best for you).
//   A release from the database opens its own card: numbers, why it's for you, its songs with their Last.fm listeners.
const RADIO_ST_KEY = 'crate_radio_stations_v1', RADIO_NO_KEY = 'crate_radio_no_v1', RADIO_LIKE_KEY = 'crate_radio_likes_v1', RADIO_PLAYED_KEY = 'crate_radio_played_v1', RADIO_LAST_KEY = 'crate_radio_last_v1';
const RADIO_KINDS = [
  ['taste', 'Your taste', 'everything your ratings, plays and likes say about you'],
  ['genre', 'A genre', 'e.g. Post-Punk, and what sits around it'],
  ['artist', 'An artist', 'them, and who Last.fm says sounds like them'],
  ['release', 'A release', 'its sound: the one playing, or any you name'],
  ['desc', 'A descriptor', 'e.g. “nocturnal”, “lush”, “angular”'],
  ['friends', 'Friends’ favourites', 'what’s in your friends’ crates, through your ears'],
  ['deep', 'Deep cuts', 'loved but little known: few listeners, high ratings'],
  ['time', 'Time machine', 'a year or a decade, from the database and your crate']
];
const radio = { on: false, st: null, qid: 0, pool: [], related: {}, mine: [], busy: false, boost: { g: {}, a: {} }, sess: { played: 0, newLiked: 0, added: 0, newPlayed: 0 }, tab: 'stations', draft: null, recentA: [], topTr: new Map(), links: new Map() };
const rLs = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const rLsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit */ } };
function rFold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/\s*[([][^)\]]*(deluxe|remaster|edition|expanded|anniversary|bonus|version|reissue)[^)\]]*[)\]]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim(); }
function rKey(a, t) { const x = rFold(a), y = rFold(t); return x && y ? x + '|' + y : ''; }
const rGN = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();          // (1.135.174) genres compared as words: "post punk" = "Post-Punk"
const rSplit = (s) => String(s || '').split(/\s*[,;]\s*/).map(x => x.trim().toLowerCase()).filter(Boolean);
const rCap = (s) => String(s || '').replace(/(^|[\s-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
function rN(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n.toLocaleString(); }
function rPlays(it) { try { return typeof scrobbleCountFor === 'function' ? Number(scrobbleCountFor(it.artist, it.title)) || 0 : 0; } catch (e) { return 0; } }
function rOwned() { if (!radio.owned || radio.ownedN !== state.raw.length) { radio.owned = new Map(); (state.raw || []).forEach(it => { const k = rKey(it.artist, it.title); if (k) radio.owned.set(k, it); }); radio.ownedN = state.raw.length; } return radio.owned; }

// ----- your taste, as weights -----
function rTaste() {
  if (radio.taste && radio.tasteN === state.raw.length) return radio.taste;
  return rTasteBuild();
}
// (1.135.169) With little or nothing in your crate, the radio still has a taste to start from: the genres and artists you pick
// ("Tell it what you like"), and what you Like and Add on the radio. They count for less as your crate grows.
const RADIO_SEED_KEY = 'crate_radio_seed_v1';
function rSeedGet() { const s = rLs(RADIO_SEED_KEY, {}); return { g: Array.isArray(s.g) ? s.g : [], a: Array.isArray(s.a) ? s.a : [] }; }
function rSeedSet(s) { rLsSet(RADIO_SEED_KEY, s); radio.taste = null; radio.disc = null; }
function rCold() { const t = rTaste(); return (radio.crateWeight || 0) < 20; }          // (a crate this small says little about you yet)
function rTasteBuild() {
  const g = {}, d = {}, a = {}, add = (m, k, w) => { if (k) m[k] = (m[k] || 0) + w; };
  (state.raw || []).forEach(it => {
    const rt = Number(it.rating) || 0, w = (rt ? rt - 2.5 : 0.4) + Math.log(1 + rPlays(it)) * 0.35; if (w <= 0) return;
    rSplit(it.genre).forEach((x, i) => add(g, x, w * (i ? 0.7 : 1))); rSplit(it.genre2).forEach(x => add(g, x, w * 0.5));
    rSplit(it.rymDescriptors).slice(0, 6).forEach(x => add(d, x, w * 0.5)); add(a, it.artist, w);
  });
  let cw = 0; Object.keys(a).forEach(k => { cw += a[k]; }); radio.crateWeight = cw;
  const mx = Math.max(3, ...Object.values(g)), seed = rSeedGet();
  seed.g.forEach(x => add(g, String(x).toLowerCase(), mx * 0.7)); seed.a.forEach(x => add(a, x, Math.max(3, ...Object.values(a)) * 0.7));
  rLs(RADIO_LIKE_KEY, []).slice(0, 200).forEach(l => { rSplit(l.g).forEach((x, i) => add(g, x, mx * (i ? 0.15 : 0.3))); add(a, l.a, mx * 0.3); });
  const top = (m, n) => { const ks = Object.keys(m).sort((x, y) => m[y] - m[x]).slice(0, n), mx = ks.length ? m[ks[0]] : 1; return ks.map(k => ({ k, w: Math.round(m[k] / mx * 100) / 100 })); };
  radio.taste = { g: top(g, 30), d: top(d, 30), a: top(a, 80) }; radio.tasteN = state.raw.length;
  return radio.taste;
}
// what a station asks the database for
function rSeeds(st) {
  const t = rTaste(), out = { genres: [], descs: [], artists: [] };
  const fromItems = (its, w) => { const g = {}, d = {}; its.forEach(it => { rSplit(it.genre).concat(rSplit(it.genre2)).forEach(x => { g[x] = (g[x] || 0) + 1; }); rSplit(it.rymDescriptors).slice(0, 6).forEach(x => { d[x] = (d[x] || 0) + 1; }); });
    Object.keys(g).sort((x, y) => g[y] - g[x]).slice(0, 6).forEach(x => out.genres.push({ g: x, w })); Object.keys(d).sort((x, y) => d[y] - d[x]).slice(0, 8).forEach(x => out.descs.push({ d: x, w: w * 0.8 })); };
  const v = String(st.value || '').trim(), vl = v.toLowerCase();
  if (st.kind === 'genre') { const gn = rGN(v); out.genres.push({ g: gn, w: 1 }); (state.raw || []).filter(it => rSplit(it.genre).concat(rSplit(it.genre2)).some(x => rGN(x) === gn) && (Number(it.rating) || 0) >= 4).slice(0, 30).forEach(it => out.artists.push({ a: it.artist, w: 0.5 })); }
  else if (st.kind === 'artist') { out.artists.push({ a: v, w: 1 }); fromItems((state.raw || []).filter(it => rFold(it.artist) === rFold(v)), 0.4); }
  else if (st.kind === 'release') { const it = rOwned().get(rKey(st.artist, st.title)) || (typeof nowPlayingItem !== 'undefined' && nowPlayingItem && rKey(nowPlayingItem.artist, nowPlayingItem.title) === rKey(st.artist, st.title) ? nowPlayingItem : null); out.artists.push({ a: st.artist, w: 0.8 }); if (it) fromItems([it], 1); else { rSplit(st.genre).forEach((x, i) => out.genres.push({ g: x, w: 1 })); rSplit(st.descs).slice(0, 8).forEach(x => out.descs.push({ d: x, w: 0.8 })); }
    if (st.similar && out.genres[0]) out.genres[0].w *= 1.5; out.descs.forEach(d => { d.w *= 1.6; }); }          // (1.135.193: mood and texture count more; 1.135.202: its main genre most)          // (1.135.193: mood and texture count more)
  else if (st.kind === 'desc') { out.descs.push({ d: rGN(v), w: 1.5 }); fromItems((state.raw || []).filter(it => rSplit(it.rymDescriptors).some(x => rGN(x) === rGN(v))).slice(0, 40), 0.5); }
  else { t.g.forEach(x => out.genres.push({ g: x.k, w: x.w })); t.d.forEach(x => out.descs.push({ d: x.k, w: x.w * 0.6 })); t.a.slice(0, 60).forEach(x => out.artists.push({ a: x.k, w: x.w })); }
  return out;
}
function rYears(st) { if (st.kind === 'time' && st.value) { const y = Number(String(st.value).slice(0, 4)) || 0; return /0s$/.test(st.value) ? [y, y + 9] : [y, y]; } return [Number(st.yFrom) || 0, Number(st.yTo) || 9999]; }

// ----- the pool: the database's candidates, and your own releases -----
async function rLoadPool(st) {
  const seeds = rSeeds(st), [yFrom, yTo] = rYears(st);
  const skip = [...rOwned().keys()].concat(Object.keys(rLs(RADIO_NO_KEY, {}))).slice(0, 8000);
  const r = await postUpdate({ action: 'masterMusicRadio', genres: seeds.genres, descs: seeds.descs, artists: seeds.artists, yFrom, yTo, strictYears: st.kind === 'time', deep: st.kind === 'deep', cold: (rCold() && (st.kind === 'taste' || st.kind === 'friends')) || st.kind === 'time' || st.kind === 'deep', needGenre: st.kind === 'genre' || st.kind === 'desc', needMatch: (st.far || 'near') !== 'far', friends: st.kind === 'friends', skip, n: 400 });
  if (!r || r.music !== true) throw new Error(r && r.error ? r.error : 'Your backend doesn’t have CRATE Radio yet: paste the new Master.gs and deploy a new version.');
  if (r.joined === false) throw new Error('Join the master crate first (⚙ › Master crate…): the radio plays from its music database.');
  const no = rLs(RADIO_NO_KEY, {}), owned = rOwned();
  // (1.135.191) yours however its title is written ("Chrometrails" / "Chrome Trails"), and never the release playing when the radio started
  const tight = (k) => String(k || '').replace(/[^a-z0-9|]+/g, ''), ownedT = new Set([...owned.keys()].map(tight)), startK = radio.startKey ? tight(radio.startKey) : '';
  radio.pool = (r.items || []).filter(x => x && x.k && !no[x.k] && !owned.has(x.k) && !ownedT.has(tight(x.k)) && tight(x.k) !== startK); radio.related = r.related || {}; radio.seeds = seeds;
  if (st.similar) {          // (1.135.202) "similar to what's playing": its genres first, then its mood and texture; a release of none of its genres only from an artist close to it
    const sg = new Set(seeds.genres.map(x => rGN(x.g))), strict = radio.pool.filter(x => rSplit(x.g).some(g => sg.has(rGN(g))) || (radio.related[rFold(x.a)] || 0) >= 0.6);
    radio.simThin = strict.length < 30; if (strict.length >= 12) radio.pool = strict;
  }
  // your own releases near the station
  const gs = {}; seeds.genres.forEach(x => { gs[x.g] = x.w; }); const ds = {}; seeds.descs.forEach(x => { ds[x.d] = x.w; }); const as = {}; seeds.artists.forEach(x => { as[rFold(x.a)] = x.w; });
  const played = rLs(RADIO_PLAYED_KEY, {}), wk = Date.now() - 7 * 864e5;
  radio.mine = (state.raw || []).map(it => {
    const y = Number(String(it.releaseDate || '').slice(0, 4)) || 0; if (y && (y < yFrom || y > yTo)) return null; if (!y && st.kind === 'time') return null;
    let s = 0; rSplit(it.genre).concat(rSplit(it.genre2)).forEach(x => { s += (gs[x] || gs[rGN(x)] || 0) * 2; }); rSplit(it.rymDescriptors).forEach(x => { s += ds[x] || ds[rGN(x)] || 0; }); s += (as[rFold(it.artist)] || 0) * 3;
    if ((st.kind === 'genre' || st.kind === 'desc') && !(rSplit(it.genre).concat(rSplit(it.genre2), rSplit(it.rymDescriptors)).some(x => seeds.genres.concat(seeds.descs).some(z => rGN(x) === (z.g || z.d))))) return null;          // (yours, on a genre station: only ones of that genre)
    const hitGA = rSplit(it.genre).concat(rSplit(it.genre2)).some(x => gs[x] || gs[rGN(x)]) || as[rFold(it.artist)];
    if ((st.far || 'near') !== 'far' && !hitGA) return null;          // (1.135.191) close and nearby: a shared genre or the artist, not a descriptor alone
    if (!s) return null; const k = rKey(it.artist, it.title); if (k === radio.startKey) return null; if ((played[k] || 0) > wk) s *= 0.2;
    s += ((Number(it.rating) || 3) - 3) * 1.2; return { it, s, k };
  }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 120);
}
function rScore(x) {          // a database release, for this station now: its fit, its quality, what this session taught it, and a little chance
  const far = (radio.st && radio.st.far) || 'near', jit = far === 'close' ? 0.08 : far === 'far' ? 0.7 : 0.2;
  const max = radio.pool.length ? radio.pool[0].s || 1 : 1; let s = (x.s || 0) / max;
  const rel = radio.related[rFold(x.a)] || 0; if (far === 'close') s += rel * 0.5; if (far === 'far' && rel >= 0.99) s -= 0.3;
  rSplit(x.g).forEach(g => { s += (radio.boost.g[g] || 0) * 0.15; }); s += (radio.boost.a[rFold(x.a)] || 0) * 0.3;
  if (radio.st && radio.st.similar && radio.seeds) {
    const sg = radio.seeds.genres.map(z => rGN(z.g)), sd = new Set(radio.seeds.descs.map(z => rGN(z.d))), xg = rSplit(x.g).map(rGN);
    xg.forEach((g, i) => { const j = sg.indexOf(g); if (j >= 0) s += (j === 0 ? 0.6 : 0.3) * (i === 0 ? 1 : 0.6); });
    s += Math.min(0.6, rSplit(x.d).filter(d => sd.has(rGN(d))).length * 0.12);
  }
  if (radio.recentA.includes(rFold(x.a))) s -= 2;
  return s + Math.random() * jit;
}
function rPickNew() { let best = null, bs = -1e9; radio.pool.forEach(x => { if (x.used) return; const s = rScore(x); if (s > bs) { bs = s; best = x; } }); if (best) best.used = true; return best; }
function rPickMine() {
  const far = (radio.st && radio.st.far) || 'near', top = radio.mine.filter(m => !m.used && !radio.recentA.includes(rFold(m.it.artist))).slice(0, far === 'close' || (radio.st && radio.st.similar) ? 12 : far === 'far' ? 80 : 25);
  if (!top.length) return null; const m = top[Math.floor(Math.random() * top.length)]; m.used = true; return m;
}
// a release from the database as an item the player knows
function rItem(x) { return { artist: x.a, title: x.t, type: x.ty || 'Album', releaseDate: x.y || '', genre: x.g || '', rymDescriptors: x.d || '', label: x.l || '', cover: x.c || '', id: 'radio:' + x.k, radio: true, radioKey: x.k }; }

// ----- songs -----
async function rTopTracks(artist) {          // Last.fm's most-listened songs by an artist: which songs of a release to play, and their listeners
  const k = rFold(artist); if (radio.topTr.has(k)) return radio.topTr.get(k);
  const m = new Map();
  try { if (typeof srchLfKey === 'function' && srchLfKey()) { const j = await srchLf({ method: 'artist.gettoptracks', artist, autocorrect: '1', limit: '100' }); (((j.toptracks || {}).track) || []).forEach(t => { if (t && t.name) m.set(rFold(t.name), { l: Number(t.listeners) || 0, p: Number(t.playcount) || 0 }); }); } } catch (e) { /* first songs then */ }
  radio.topTr.set(k, m); return m;
}
async function rLinksFor(keys) {          // song links found before, kept in the database for everyone
  const want = keys.filter(k => !radio.links.has(k)); if (want.length) { try { const r = await postUpdate({ action: 'masterMusicLinks', keys: want }); want.forEach(k => radio.links.set(k, (r && r.links && r.links[k]) || {})); } catch (e) { want.forEach(k => radio.links.set(k, {})); } }
  const o = {}; keys.forEach(k => { o[k] = radio.links.get(k) || {}; }); return o;
}
// (1.135.196) A release from the database: its tracklist and cover from Last.fm's album info, one quick call (the usual iTunes and MusicBrainz
// lookups, MusicBrainz at one a second, made the radio slow and often found nothing), kept where the deck and Up next look for them; the
// usual lookup only when Last.fm has no tracklist, and not waited on for ever.
const rWait = (ms) => new Promise(r => setTimeout(() => r(null), ms));
async function rRadioTracks(item) {
  const key = artKey(item); if (state.trackCache[key] && state.trackCache[key].length) return state.trackCache[key];
  let al = null; try { if (typeof stlAlbum === 'function') al = await Promise.race([stlAlbum(item.artist, item.title), rWait(7000)]); } catch (e) { al = null; }
  if (al) {
    const im = Array.isArray(al.image) ? ((al.image.find(x => x.size === 'extralarge') || al.image.slice(-1)[0] || {})['#text'] || '') : '';
    if (im && !/2a96cbd8b46e442fc41c2b86b821562f/.test(im) && !item.cover) { item.cover = im; state.artCache[key] = { art: im, collectionId: null }; try { cvAll()[cvK(item.artist, item.title)] = im; cvSave(); } catch (e) { /* fine */ } }
    let tr = al.tracks && al.tracks.track; tr = Array.isArray(tr) ? tr : tr ? [tr] : [];
    const tl = tr.filter(t => t && t.name).map((t, i) => ({ trackName: String(t.name), trackNumber: Number(t['@attr'] && t['@attr'].rank) || i + 1, trackTimeMillis: (Number(t.duration) || 0) * 1000 || null }));
    if (tl.length) { state.trackCache[key] = tl; return tl; }
  }
  if (item.cover && !(state.artCache[key] && state.artCache[key].art)) state.artCache[key] = { art: item.cover, collectionId: null };
  try { return await Promise.race([getTracksFor(item), rWait(15000)]); } catch (e) { return null; }
}
function rSpotifyCanPlay() { try { return !!(typeof loadSpotifyCreds === 'function' && (loadSpotifyCreds() || {}).clientId && typeof loadSpotifyUserTokens === 'function' && loadSpotifyUserTokens()); } catch (e) { return false; } }
async function rSongs(item, mode) {
  let tl = null; try { tl = item.radio ? await rRadioTracks(item) : await getTracksFor(item); } catch (e) { tl = null; }
  const ok = (tl || []).filter(t => t && t.trackName); if (!ok.length) return [];
  if (mode === 'whole') return ok;
  const top = await rTopTracks(item.artist), n = mode === 'few' ? 3 : 1;
  const ranked = ok.map((t, i) => ({ t, l: (top.get(rFold(t.trackName)) || {}).l || 0, i })).sort((a, b) => b.l - a.l || a.i - b.i).slice(0, n);
  if (!ranked[0].l && !item.radio && typeof ptBestSong === 'function') { const b = ptBestSong(item, ok); if (b) return [b.t]; }
  return ranked.sort((a, b) => a.i - b.i).map(x => x.t);
}
async function rEntries(pick) {          // one pick → queue entries (a song, a few, or the whole release)
  const mode = (radio.st && radio.st.play) || 'one', item = pick.x ? rItem(pick.x) : pick.it;
  const songs = await rSongs(item, mode); if (!songs.length) return [];
  const key = pick.x ? pick.x.k : rKey(item.artist, item.title);
  const known = pick.x ? (await rLinksFor([key]))[key] : {};
  const out = [];
  for (const t of songs) {
    const track = Object.assign({}, t, typeof trackLinkOverridesFor === 'function' && !item.radio ? trackLinkOverridesFor(item, t.trackNumber, t.trackName) : {});
    if (item.radio) {
      const k = known[rFold(t.trackName)];
      if (k && (k.yt || k.sp)) { if (k.yt) track.youtubeLink = k.yt; if (k.sp) track.spotifyLink = k.sp; track.radioLinkSrc = 'shared'; }
      // (1.135.196) found on YouTube when that's your source, or when Spotify can't play here (it was left to Spotify's search, which then
      // couldn't play it: nothing played)
      else if (typeof youtubeSearchCandidates === 'function' && ((typeof playSource === 'function' && playSource() === 'youtube') || !rSpotifyCanPlay()) && ((typeof ytUseAddon === 'function' && ytUseAddon()) || (typeof loadYoutubeApiKey === 'function' && loadYoutubeApiKey()))) {
        try { const c = await youtubeSearchCandidates(item.artist, t.trackName); if (c && c[0]) { track.youtubeLink = 'https://www.youtube.com/watch?v=' + c[0].id; track.radioLinkSrc = 'found';
          postUpdate({ action: 'masterMusicLinks', put: [{ k: key, s: t.trackName, yt: track.youtubeLink, sp: '' }] }).catch(() => { /* found again next time */ });
          (radio.links.get(key) || {})[rFold(t.trackName)] = { s: t.trackName, yt: track.youtubeLink }; } } catch (e) { /* Spotify's search then */ }
      }
    }
    out.push({ item, track, radio: { kind: pick.x ? 'new' : 'mine', x: pick.x || null, key, why: rWhy(pick.x || null, item) } });
  }
  return out;
}

// ----- why this -----
function rLikeYours(item) {          // your releases closest to it: shared genres and descriptors, your best rated first
  const g = new Set(rSplit(item.genre).concat(rSplit(item.genre2))), d = new Set(rSplit(item.rymDescriptors)), self = rKey(item.artist, item.title);
  return (state.raw || []).map(it => { if (rKey(it.artist, it.title) === self || (it.rating && Number(it.rating) < 3.5)) return null; let s = 0; rSplit(it.genre).concat(rSplit(it.genre2)).forEach(x => { if (g.has(x)) s += 2; }); rSplit(it.rymDescriptors).forEach(x => { if (d.has(x)) s += 1; }); if (rFold(it.artist) === rFold(item.artist)) s += 1; return s ? { it, s: s + (Number(it.rating) || 0) * 0.4 } : null; })
    .filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 2).map(o => o.it);
}
function rWhy(x, item) {
  const out = [], t = rTaste(), like = rLikeYours(item);
  if (like.length) out.push(['Like yours', 'close to ' + like.map(it => `${it.title}${it.rating ? ` (★ ${it.rating})` : ''}`).join(' and ')]);
  const tg = new Map(t.g.map((g, i) => [g.k, i])), gs = rSplit(item.genre).concat(rSplit(item.genre2)).filter(g => tg.has(g)), ds = rSplit(item.rymDescriptors).filter(d => t.d.some(z => z.k === d)).slice(0, 3);
  if (gs.length || ds.length) out.push(['Sound', [gs.map(rCap).join(', '), ds.map(d => `“${d}”`).join(', ')].filter(Boolean).join(', ') + (gs.length ? `: ${gs.length > 1 ? 'among' : ''} your ${gs.map(g => '#' + (tg.get(g) + 1)).join(', ')} genre${gs.length > 1 ? 's' : ''}` : '')]);
  const ak = rFold(item.artist), mine = (state.raw || []).filter(it => rFold(it.artist) === ak).length;
  if (mine) out.push(['Artist', mine === 1 ? 'one of their releases is in your crate' : `${mine} of their releases are in your crate`]);
  else if (radio.related[ak]) out.push(['Last.fm', `${item.artist} is similar to artists you play (${Math.round(radio.related[ak] * 100)}% close)`]);
  if (x && rCold() && !gs.length && !radio.related[ak]) out.push(['Start', 'your crate is new, so it starts from the best of the database: what your friends keep, and what\u2019s rated and played most']);
  if (x && x.cr) out.push(['Friends', `in ${x.cr} of your friends’ crates`]);
  if (x && (x.rr || x.li)) out.push(['Quality', [x.rr ? `RYM ${Number(x.rr).toFixed(2)}${x.rv ? ` from ${Number(x.rv).toLocaleString()} ratings` : ''}` : '', x.li ? `${rN(x.li)} listeners on Last.fm` : ''].filter(Boolean).join(' · ')]);
  else if (!x && item.rating) out.push(['Yours', `you rate it ★ ${item.rating}${rPlays(item) ? ` · ${rPlays(item)} plays` : ''}`]);
  return out;
}
function rMatch(x) {          // how well a database release fits your taste, 0–100
  const t = rTaste(), gw = {}; t.g.forEach(g => { gw[g.k] = g.w; }); const dw = {}; t.d.forEach(d => { dw[d.k] = d.w; });
  const g = Math.min(1, rSplit(x.g).reduce((s, k) => s + (gw[k] || 0), 0)), d = Math.min(1, rSplit(x.d).reduce((s, k) => s + (dw[k] || 0), 0) * 0.7), a = Math.min(1, (radio.related[rFold(x.a)] || 0) * 1.2);
  const q = x.rr ? Math.max(0, Math.min(1, (x.rr - 3) / 1)) : 0.4;
  return Math.round(Math.min(99, (g * 0.45 + d * 0.15 + a * 0.25 + q * 0.15) * 100));
}

// ----- the radio in the queue -----
async function rNext() {          // the next pick: from beyond your crate "How new" of the time, else one of yours
  const newPct = radio.st && radio.st.newPct != null ? radio.st.newPct : 65;
  let pick = null;
  if (Math.random() * 100 < newPct) { const x = rPickNew(); if (x) pick = { x }; }
  if (!pick) { const m = rPickMine(); if (m) pick = { it: m.it }; }
  if (!pick) { const x = rPickNew(); if (x) pick = { x }; }
  if (!pick) return null;
  radio.recentA.push(rFold(pick.x ? pick.x.a : pick.it.artist)); if (radio.recentA.length > 8) radio.recentA.shift();
  return pick;
}
const RADIO_AHEAD = 10;
async function rTopUp(min) {
  if (!radio.on || radio.busy) return; if (crateQueueId !== radio.qid) { rStopped(); return; }
  radio.busy = true;
  try {
    // (1.135.194) several releases at once: their song links asked for in one call, and their tracklists and top songs looked up side by
    // side (one after another, each waited for the last: a few seconds a song)
    let tries = 0;
    while (radio.on && crateQueueId === radio.qid && tries++ < 8) {
      // (1.135.200) counted in releases, not songs: ten releases lined up ahead (a station playing whole releases had only one or two)
      const ahead = new Set(crateQueueList.slice(Math.max(0, crateQueueIndex) + 1).map(e => e && e.item ? rKey(e.item.artist, e.item.title) : '')).size, need = (min || RADIO_AHEAD) - ahead; if (need <= 0) break;
      const picks = []; for (let i = 0; i < Math.min(need + 1, 6); i++) { const p = await rNext(); if (!p) break; picks.push(p); }
      if (!picks.length) break;
      const keys = picks.filter(p => p.x).map(p => p.x.k); if (keys.length) await rLinksFor(keys);
      const ents = await Promise.all(picks.map(p => rEntries(p).catch(() => [])));
      if (crateQueueId !== radio.qid) break;
      const add = [].concat(...ents); if (add.length) { crateQueueList.push(...add); renderCrateQueuePanel(); rPaint(); }
    }
  } finally { radio.busy = false; }
}
async function radioStart(st, keep) {          // keep (1.135.193): { mode: 'current' } the song playing carries on, the radio follows it; { mode: 'end', index } the queue ran out
  st = Object.assign({ kind: 'taste', newPct: 65, far: 'near', play: 'one' }, st || {});
  radio.st = st; radio.boost = { g: {}, a: {} }; radio.recentA = []; radio.sess = { played: 0, newLiked: 0, added: 0, newPlayed: 0 };
  const playing = typeof nowPlayingItem !== 'undefined' && nowPlayingItem ? nowPlayingItem : null;          // (1.135.191) the release playing when it starts: not played again, its artist not straight after
  radio.startKey = playing ? rKey(playing.artist, playing.title) : (st.kind === 'release' ? rKey(st.artist, st.title) : '');
  if (playing) radio.recentA.push(rFold(playing.artist)); else if (st.kind === 'release' && st.artist) radio.recentA.push(rFold(st.artist));
  rLsSet(RADIO_LAST_KEY, st);
  radio.tab = 'now'; radio.say = 'Tuning in…'; radio.err = ''; rPaint();
  try { await rLoadPool(st); } catch (e) { radio.say = ''; radio.err = e.message; radio.tab = 'stations'; rPaint(); if (keep) flashGlobalToast('Radio: ' + e.message); return false; }
  // (1.135.174) a genre, descriptor or artist the database barely knows yet: more from Last.fm first, merged, then picked again
  const simTag = st.similar && radio.simThin && !(radio.filled || (radio.filled = new Set())).has(rGN(rSplit(st.genre)[0])) ? rSplit(st.genre)[0] : ''; if (simTag) radio.filled.add(rGN(simTag));          // (1.135.202) similar to a release whose genre the database barely has: more of that genre first
  if (((['genre', 'desc', 'artist'].includes(st.kind) && st.value && radio.pool.length < 40) || simTag) && typeof mdbFill === 'function' && typeof srchLfKey === 'function' && srchLfKey()) {
    radio.say = `Only ${radio.pool.length} release${radio.pool.length === 1 ? '' : 's'} for \u201c${simTag || st.value}\u201d in the music database so far: fetching more from Last.fm\u2026`; rPaint();
    try {
      if (st.kind === 'artist') { await mdbFillArtist(st.value); const j = await srchLf({ method: 'artist.getsimilar', artist: st.value, autocorrect: '1', limit: '10' }); const sim = (((j.similarartists || {}).artist) || []).map(x => ({ a: x.name, m: Number(x.match) || 0 })).filter(x => x.a); mdbSimilar(st.value, sim); for (const x of sim.slice(0, 6)) await mdbFillArtist(x.a); }
      else await mdbFill({ tag: simTag || st.value });
      await mdbFlush(); await postUpdate({ action: 'masterMusicState', fresh: true });
      await rLoadPool(st);
    } catch (e) { /* plays what there is */ }
    radio.say = 'Tuning in\u2026'; rPaint();
  }
  if (!radio.pool.length && !radio.mine.length) { radio.say = ''; radio.err = ['genre', 'desc', 'artist'].includes(st.kind) ? `Nothing for \u201c${st.value}\u201d in the music database yet${typeof srchLfKey === 'function' && srchLfKey() ? ', and Last.fm had nothing to add: check the spelling' : ': save a Last.fm key (\u2699 \u203a Last.fm) and it fetches some'}.` : 'Nothing near that station in the music database yet: try a wider one, or fill the database (⚙ › Music database…).'; radio.tab = 'stations'; rPaint(); return; }
  if (keep && crateQueueList.length && (keep.mode === 'end' || (crateQueueIndex >= 0 && crateQueueList[crateQueueIndex]))) {
    // (1.135.193) the song playing carries on (or the queue that just ran out stays as it was): similar songs are lined up after it
    radio.on = true; radio.qid = crateQueueId; if (keep.mode === 'current') { crateQueueList.splice(crateQueueIndex + 1); renderCrateQueuePanel(); }
    let next = []; for (let i = 0; i < 3 && !next.length; i++) { const ps = []; for (let k = 0; k < 2; k++) { const p = await rNext(); if (p) ps.push(p); } if (!ps.length) break; const ks = ps.filter(p => p.x).map(p => p.x.k); if (ks.length) await rLinksFor(ks); next = [].concat(...(await Promise.all(ps.map(p => rEntries(p).catch(() => []))))); }
    if (!next.length || crateQueueId !== radio.qid) { radio.on = false; radio.say = ''; rBtnPaint(); if (!next.length) flashGlobalToast('Radio: nothing similar found in the music database yet.'); return false; }
    crateQueueList.push(...next); renderCrateQueuePanel(); radio.say = ''; rPaint(); rBtnPaint();
    if (keep.mode === 'end') rPlayAt(radio.qid, keep.index);
    rTopUp(); return true;
  }
  radio.on = true; radio.qid = ++crateQueueId; crateQueueList = []; crateQueueIndex = -1; renderCrateQueuePanel();
  let first = []; for (let i = 0; i < 3 && !first.length; i++) { const ps = []; for (let k = 0; k < 2; k++) { const p = await rNext(); if (p) ps.push(p); } if (!ps.length) break; const ks = ps.filter(p => p.x).map(p => p.x.k); if (ks.length) await rLinksFor(ks); first = [].concat(...(await Promise.all(ps.map(p => rEntries(p).catch(() => []))))); }
  if (!first.length || crateQueueId !== radio.qid) { radio.on = false; radio.say = ''; radio.err = 'Couldn’t find songs to play for that station.'; rPaint(); return false; }
  crateQueueList.push(...first); radio.say = ''; rPaint(); rBtnPaint();
  playCrateQueueIndex(radio.qid, 0);
  rTopUp(); return true;
}
// (1.135.193) A station from one release, straight away: its genres, its descriptors (mood and texture: weighed more here), its artist and
// the artists like them; the How new, How far and Play settings you used last.
const RADIO_AUTO_KEY = 'crate_radio_auto_v1';
function rAutoOn() { try { return localStorage.getItem(RADIO_AUTO_KEY) === '1'; } catch (e) { return false; } }
function rAutoSet(on) { try { localStorage.setItem(RADIO_AUTO_KEY, on ? '1' : '0'); } catch (e) { /* this visit */ } }
async function radioFromItem(it, keep) {
  if (!it || !it.artist || !it.title) return false;
  const last = rLs(RADIO_LAST_KEY, {});
  const st = { kind: 'release', artist: it.artist, title: it.title, genre: [it.genre, it.genre2].filter(Boolean).join(', '), descs: it.rymDescriptors || '', value: '', newPct: last.newPct != null ? last.newPct : 65, far: last.far === 'close' ? 'close' : 'near',          /* (1.135.202: similar music stays near) */ play: last.play || 'one', yFrom: 0, yTo: 9999, similar: true };
  return radioStart(st, keep);
}
function radioStop() { radio.on = false; rBtnPaint(); rPaint(); try { if (typeof playerPlayingNow === 'function' && playerPlayingNow()) el.miniPlayerPlayPause.click(); } catch (e) { /* fine */ } }
function rStopped() { if (!radio.on) return; radio.on = false; rBtnPaint(); rPaint(); }
function rCur() {
  const e = radio.on && crateQueueId === radio.qid && crateQueueIndex >= 0 ? crateQueueList[crateQueueIndex] : null;
  // (1.135.199) a song in the station's queue that the radio didn't pick (the one playing when it started, or one you added) is one of yours
  if (e && e.item && !e.radio) e.radio = { kind: 'mine', x: null, key: rKey(e.item.artist, e.item.title), why: [] };
  return e && e.item && e.track ? e : null;
}
(function () {
  const base = playCrateQueueIndex;
  playCrateQueueIndex = function (myId, index) {
    if (radio.on && myId !== radio.qid) rStopped();
    const out = base.apply(this, arguments);
    if (radio.on && myId === radio.qid) {
      const e = crateQueueList[crateQueueIndex];
      if (e && e.radio && !e.radioCounted) { e.radioCounted = true; radio.sess.played++; if (e.radio.kind === 'new') radio.sess.newPlayed++; const p = rLs(RADIO_PLAYED_KEY, {}); p[e.radio.key] = Date.now(); const ks = Object.keys(p); if (ks.length > 3000) ks.sort((a, b) => p[a] - p[b]).slice(0, 500).forEach(k => delete p[k]); rLsSet(RADIO_PLAYED_KEY, p);
        const n = rLs('crate_radio_times_v1', {}); n[e.radio.key] = (n[e.radio.key] || 0) + 1; rLsSet('crate_radio_times_v1', n); }
      setTimeout(() => { rTopUp(); rPaint(); }, 50);
    }
    return out;
  };
})();
// (1.135.191) a setting changed while playing: the songs lined up but not reached yet are dropped and picked again (the ones queued before
// still followed the old mix: 100% new, and the next two were still yours)
function rRequeue() {
  if (!radio.on || crateQueueId !== radio.qid) return;
  for (let i = crateQueueList.length - 1; i > crateQueueIndex; i--) { const e = crateQueueList[i]; if (e && e.radio && !e.radioCounted) { const back = e.radio.kind === 'new' ? radio.pool.find(x => x.k === e.radio.key) : radio.mine.find(m => m.k === e.radio.key); if (back) back.used = false; crateQueueList.splice(i, 1); } }
  renderCrateQueuePanel(); rTopUp(); rPaint();
}
function rSkip() { if (!radio.on || crateQueueId !== radio.qid) return; playCrateQueueIndex(radio.qid, crateQueueIndex + 1); }
function rLearn(e, w) { if (!e || !e.item) return; rSplit(e.item.genre).forEach(g => { radio.boost.g[g] = (radio.boost.g[g] || 0) + w; }); const a = rFold(e.item.artist); radio.boost.a[a] = (radio.boost.a[a] || 0) + w; }
function rLike() { const e = rCur(); if (!e || e.radioLiked) return; e.radioLiked = true; rLearn(e, 1); if (e.radio.kind === 'new') radio.sess.newLiked++;
  const l = rLs(RADIO_LIKE_KEY, []); l.unshift({ k: e.radio.key, a: e.item.artist, t: e.item.title, g: e.item.genre || '', s: e.track.trackName, at: Date.now() }); rLsSet(RADIO_LIKE_KEY, l.slice(0, 500)); radio.taste = null; rPaint(); flashGlobalToast(`Liked: more like ${e.item.artist} on this station.`); }
function rNotForMe(x) {
  const e = x ? null : rCur(), k = x ? x.k : e && e.radio.key; if (!k) return;
  const no = rLs(RADIO_NO_KEY, {}); no[k] = Date.now(); rLsSet(RADIO_NO_KEY, no);
  radio.pool = radio.pool.filter(p => p.k !== k);
  if (e) { rLearn(e, -1); for (let i = crateQueueList.length - 1; i > crateQueueIndex; i--) if (crateQueueList[i].radio && crateQueueList[i].radio.key === k) crateQueueList.splice(i, 1); rSkip(); }
  flashGlobalToast('Not for you: it won’t come up again.');
}
function rAdd(item) {
  if (!item) return; radio.sess.added++;
  // (1.135.201) Add a release opened first: the form was filled in behind a closed window, so nothing could be added
  if (typeof openAddModal === 'function') openAddModal();
  const ty = String(item.type || '').trim(), type = ty ? ty.charAt(0).toUpperCase() + ty.slice(1).toLowerCase() : '';
  showAddForm({ artist: item.artist, title: item.title, type: type === 'Ep' ? 'EP' : type, releaseDate: String(item.releaseDate || ''), cover: item.cover || '', genre: rSplit(item.genre).slice(0, 1).map(rCap).join('') });
  rPaint();
}

// ----- the radio window -----
function radioOpen(tab) {
  if (el.layoutMenu) el.layoutMenu.hidden = true;
  let ov = document.getElementById('radioOv');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'radioOv'; ov.className = 'pt-overlay rd-overlay'; document.body.appendChild(ov);
    ov.addEventListener('click', rClick); ov.addEventListener('input', rInput); ov.addEventListener('change', rInput);
    ov.addEventListener('keydown', (e) => { const t = e.target; if (e.key !== 'Enter' || !t.matches('[data-rd-seed-artist]')) return; e.preventDefault(); const v = t.value.trim(); if (!v) return;
      const seed = rSeedGet(); if (!seed.a.some(a => rFold(a) === rFold(v))) seed.a.push(v); rSeedSet(seed); rSeedChanged(); setTimeout(() => { const n = document.querySelector('#radioOv [data-rd-seed-artist]'); if (n) n.focus(); }, 0); });
    document.addEventListener('keydown', (e) => { const o = document.getElementById('radioOv'); if (e.key === 'Escape' && o && !o.hidden && !document.getElementById('rfOv')) { e.stopImmediatePropagation(); o.hidden = true; } }, true);
  }
  radio.tab = tab || (radio.on ? 'now' : radio.tab === 'now' ? 'stations' : radio.tab || 'stations');
  if (!radio.draft) radio.draft = Object.assign({ kind: 'taste', value: '', newPct: 65, far: 'near', play: 'one', yFrom: 0, yTo: 0 }, rLs(RADIO_LAST_KEY, {}));
  // (1.135.191) something playing and no station chosen this visit: it starts from what's playing (the release card, filled in)
  if (!radio.on && !radio.kindChosen && typeof nowPlayingItem !== 'undefined' && nowPlayingItem && !nowPlayingItem.radio) { radio.draft.kind = 'release'; radio.draft.value = `${nowPlayingItem.artist} \u2013 ${nowPlayingItem.title}`; }
  ov.hidden = false; rPaint();
  if (radio.tab === 'discover') rDiscoverLoad();
}
function rPaint() {
  const ov = document.getElementById('radioOv'); if (!ov || ov.hidden) return;
  const tabs = [['now', 'Now playing'], ['stations', 'Stations'], ['discover', 'Discover']];
  const head = `<div class="pt-head rd-head"><div><div class="gs-lbl rd-teal">CRATE Radio${radio.on && radio.st ? ' · station: ' + escapeHtml(rStName(radio.st)) : ''}</div><div class="pt-title">${radio.tab === 'stations' ? 'Start a station' : radio.tab === 'discover' ? 'Discover' : radio.on ? 'Playing beyond your crate' : 'The radio is off'}</div></div>
    <div class="gs-tabs rd-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="gs-tab${radio.tab === k ? ' on' : ''}" aria-selected="${radio.tab === k}" data-rd-tab="${k}">${l}</button>`).join('')}</div>
    ${radio.on ? '<button type="button" class="gs-btn" data-rd="stop">Stop radio</button>' : ''}<button type="button" class="mood-x" data-rd="x" aria-label="Close">×</button></div>`;
  const msg = `${radio.err ? `<p class="pim-err" role="alert">${escapeHtml(radio.err)}</p>` : ''}${radio.say ? `<p class="gs-s" role="status">${escapeHtml(radio.say)}</p>` : ''}`;
  ov.innerHTML = `<div class="pt-dialog rd-dialog" role="dialog" aria-modal="true" aria-label="CRATE Radio">${head}${msg}${radio.tab === 'stations' ? rStationsHtml() : radio.tab === 'discover' ? rDiscoverHtml() : rNowHtml()}</div>`;
}
function rStName(st) { const k = RADIO_KINDS.find(x => x[0] === st.kind); return st.name || (k ? k[1] : 'Your taste') + (st.value ? ': ' + st.value : st.kind === 'release' && st.title ? ': ' + st.title : ''); }
function rCoverHtml(item, cls) { const c = item && item.cover; return c ? `<img class="${cls}" src="${escapeHtml(c)}" alt="" loading="lazy">` : `<span class="${cls} rd-nocv"></span>`; }
function rNowHtml() {
  const e = rCur();
  if (!e) return `<div class="rd-empty"><p class="gs-s">${radio.on ? 'Lining up the first song…' : 'Pick a station to start: it plays from your friends’ shared music database, mixed with your own releases.'}</p>${radio.on ? '' : '<button type="button" class="gs-btn gs-pri" data-rd-tab="stations">Pick a station</button>'}</div>`;
  const it = e.item, isNew = e.radio.kind === 'new', x = e.radio.x || {}, src = e.track.youtubeLink ? 'YouTube' + (e.track.radioLinkSrc === 'shared' ? ' · a friend’s link' : '') : e.track.spotifyLink ? 'Spotify' : 'Spotify search';
  const up = crateQueueList.slice(crateQueueIndex + 1, crateQueueIndex + 8);
  const newPct = radio.st && radio.st.newPct != null ? radio.st.newPct : 65;
  return `<div class="rd-now"><div class="rd-main">
    <div class="rd-np">${rCoverHtml(it, 'rd-cv')}<div class="rd-np-t">
      <div class="rd-chips"><span class="rd-chip ${isNew ? 'rd-new' : 'rd-mine'}">${isNew ? 'NOT IN YOUR CRATE' : 'YOURS'}</span><span class="rd-chip">${escapeHtml(src)}</span>${isNew && x.cr ? `<span class="rd-chip">${x.cr} FRIEND${x.cr > 1 ? 'S' : ''}</span>` : ''}</div>
      <button type="button" class="rd-big" data-rd="card" title="Open its card">${escapeHtml(it.title)}</button>
      <div class="rd-art">${escapeHtml(it.artist)} <span>${[String(it.releaseDate || '').slice(0, 4), rSplit(it.genre).slice(0, 2).map(rCap).join(', ')].filter(Boolean).map(s => '· ' + escapeHtml(s)).join(' ')}</span></div>
      <div class="rd-song">Now: <b>${escapeHtml(e.track.trackName || '')}</b></div>
      <div class="rd-acts"><button type="button" class="gs-btn rd-tealbtn${e.radioLiked ? ' on' : ''}" data-rd="like" aria-pressed="${!!e.radioLiked}">♥ ${e.radioLiked ? 'Liked' : 'Like'}</button><button type="button" class="gs-btn" data-rd="skip">Skip</button><button type="button" class="gs-btn" data-rd="no">Not for me</button>${isNew ? '<button type="button" class="gs-btn gs-pri" data-rd="add">+ Add to crate</button>' : ''}</div>
      <div class="rd-why"><div class="gs-lbl">Why this</div>${e.radio.why.map(([k, v]) => `<div class="rd-wl"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join('') || '<p class="gs-s">One of your own.</p>'}</div>
    </div></div>
    ${state.raw.length ? '' : '<!--'}<div class="rd-slider"><span class="gs-lbl">Familiar</span><input type="range" min="0" max="100" step="5" value="${newPct}" data-rd-new aria-label="How much is new"><span class="gs-lbl rd-teal">New</span><span class="gs-s rd-sl-say">${newPct}% new: ${newPct >= 50 ? `about ${Math.round(newPct / 10)} in every 10 songs come from beyond your crate` : `mostly yours, ${newPct}% from beyond`}</span></div>${state.raw.length ? '' : '-->'}
  </div><aside class="rd-side"><div class="gs-lbl">Up next on the radio</div>
    ${up.map((u, i) => `<div class="rd-q" data-rd-q="${crateQueueIndex + 1 + i}"><span class="rd-qn">${i + 1}</span>${rCoverHtml(u.item, 'rd-qcv')}<span><b>${escapeHtml(u.track.trackName || '')}</b><em>${escapeHtml(u.item.artist)} · ${escapeHtml(u.item.title)}</em></span><span class="rd-chip ${u.radio && u.radio.kind === 'new' ? 'rd-new' : 'rd-mine'}">${u.radio && u.radio.kind === 'new' ? 'NEW' : 'YOURS'}</span></div>`).join('') || '<p class="gs-s">Finding the next ones…</p>'}
    <div class="gs-lbl rd-sess-l">This session</div>
    <div class="rd-sess"><div><b>${radio.sess.played}</b><span>played</span></div><div><b>${radio.sess.newPlayed}</b><span>from beyond</span></div><div><b class="rd-teal">${radio.sess.newLiked}</b><span>new ones liked</span></div><div><b class="rd-gold">${radio.sess.added}</b><span>added to crate</span></div></div>
    <p class="gs-s rd-foot">Each Like, Skip and Not for me teaches it. ${(radio.pool || []).filter(x => !x.used).length.toLocaleString()} releases left in this station’s pick.</p>
  </aside></div>`;
}
function rStationsHtml() {
  const d = radio.draft, saved = rLs(RADIO_ST_KEY, []);
  const needs = { genre: ['Genre', 'e.g. Post-Punk', 'genres'], artist: ['Artist', 'e.g. Talk Talk', 'artists'], release: ['Release', 'the one playing, or Artist – Title', ''], desc: ['Descriptor', 'e.g. nocturnal', 'descs'], time: ['Year or decade', 'e.g. 1994 or 1980s', ''] }[d.kind];
  if (d.kind === 'genre' && !radio.dbGenres) rDbGenres();
  const lists = { genres: [...new Set(rTaste().g.map(x => rCap(x.k)).concat((radio.dbGenres || []).slice(0, 300).map(x => rCap(x.k))))], artists: rTaste().a.slice(0, 60).map(x => x.k), descs: rTaste().d.map(x => x.k) };
  const seg = (k, opts) => `<div class="rd-seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${d[k] === v}" class="${d[k] === v ? 'on' : ''}" data-rd-set="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="rd-st">${rSeedHtml()}
    ${saved.length ? `<div class="rd-saved"><span class="gs-lbl">Saved</span>${saved.map((s, i) => `<span class="rd-sv"><button type="button" data-rd-saved="${i}">▶ ${escapeHtml(rStName(s))}</button><button type="button" data-rd-unsave="${i}" aria-label="Forget ${escapeHtml(rStName(s))}">×</button></span>`).join('')}</div>` : ''}
    <div class="rd-kinds">${RADIO_KINDS.map(([k, l, s]) => `<button type="button" class="rd-kind${d.kind === k ? ' on' : ''}" data-rd-kind="${k}" aria-pressed="${d.kind === k}"><b>${l}</b><span>${s}</span></button>`).join('')}</div>
    <div class="rd-opts">
      ${needs ? `<div class="rd-row"><div><b>${needs[0]}</b></div><div><input type="text" class="rd-in" data-rd-value value="${escapeHtml(d.value || (d.kind === 'release' && nowPlayingItem ? nowPlayingItem.artist + ' – ' + nowPlayingItem.title : ''))}" placeholder="${escapeHtml(needs[1])}" list="rdList" aria-label="${needs[0]}"><datalist id="rdList">${(lists[needs[2]] || []).map(v => `<option value="${escapeHtml(v)}">`).join('')}</datalist></div></div>` : ''}
      <div class="rd-row"><div><b>How new</b><span class="gs-s">beyond your crate</span></div><div class="rd-sl"><span class="gs-lbl">Familiar</span><input type="range" min="0" max="100" step="5" value="${d.newPct}" data-rd-set-range="newPct" aria-label="How much is new"><span class="gs-lbl rd-teal">New</span><span class="gs-s rd-w">${d.newPct}% new</span></div></div>
      <div class="rd-row"><div><b>How far</b><span class="gs-s">from what you know</span></div>${seg('far', [['close', 'Close'], ['near', 'Nearby'], ['far', 'Adventurous']])}</div>
      ${d.kind === 'time' ? '' : `<div class="rd-row"><div><b>Years</b></div><div class="rd-sl"><input type="number" class="rd-in rd-yr" data-rd-set-num="yFrom" value="${d.yFrom || ''}" placeholder="from" aria-label="From year" min="1900" max="2030"><span class="gs-s">to</span><input type="number" class="rd-in rd-yr" data-rd-set-num="yTo" value="${d.yTo || ''}" placeholder="to" aria-label="To year" min="1900" max="2030"><span class="gs-s">${d.yFrom || d.yTo ? '' : 'any year'}</span></div></div>`}
      <div class="rd-row"><div><b>Play</b></div>${seg('play', [['one', 'One song a release'], ['few', 'A few songs'], ['whole', 'Whole releases']])}</div>
      <div class="rd-row"><div><b>When the queue ends</b><span class="gs-s">any queue, not only the radio</span></div><label class="rd-auto"><input type="checkbox" data-rd-auto${rAutoOn() ? ' checked' : ''}> Keep playing similar music (genre, mood, texture) from the music database, instead of stopping</label></div>
      <div class="rd-row"><div><b>Skip</b></div><div class="gs-s">releases you’ve marked Not for me (${Object.keys(rLs(RADIO_NO_KEY, {})).length.toLocaleString()}) · what the radio played in the last week · everything in your crate counts as yours</div></div>
    </div>
    <div class="rd-go"><button type="button" class="gs-btn gs-pri rd-gobtn" data-rd="start">▶ Start radio</button><button type="button" class="gs-btn" data-rd="save">Save as a station</button><span class="gs-s">Saved stations sit at the top here and in the player’s radio button, one click to start.</span></div>
  </div>`;
}
function rDraftStation() {
  const d = Object.assign({}, radio.draft);
  if (d.kind === 'release') { const v = String(d.value || '').trim(); const m = v.split(/\s+[–—-]\s+/); if (m.length >= 2) { d.artist = m[0]; d.title = m.slice(1).join(' - '); } else if (nowPlayingItem) { d.artist = nowPlayingItem.artist; d.title = nowPlayingItem.title; d.genre = nowPlayingItem.genre; } d.value = ''; }
  d.yFrom = Number(d.yFrom) || 0; d.yTo = Number(d.yTo) || 0; if (!d.yTo) d.yTo = 9999;
  return d;
}
function rInput(e) {
  const t = e.target, d = radio.draft;
  if (t.matches('[data-rd-value]')) d.value = t.value;
  else if (t.matches('[data-rd-set-num]')) d[t.dataset.rdSetNum] = Number(t.value) || 0;
  else if (t.matches('[data-rd-set-range]')) { d[t.dataset.rdSetRange] = Number(t.value); const w = t.closest('.rd-sl').querySelector('.rd-w'); if (w) w.textContent = t.value + '% new'; }
  else if (t.matches('[data-rd-new]') && radio.st) { radio.st.newPct = Number(t.value); const s = t.closest('.rd-slider').querySelector('.rd-sl-say'); if (s) s.textContent = t.value + '% new'; if (e.type === 'change') { rLsSet(RADIO_LAST_KEY, radio.st); rRequeue(); } }
}
async function rClick(e) {
  const ov = document.getElementById('radioOv'); if (e.target === ov || e.target.closest('[data-rd="x"]')) { ov.hidden = true; return; }
  const tb = e.target.closest('[data-rd-tab]'); if (tb) { radio.tab = tb.dataset.rdTab; radio.err = ''; rPaint(); if (radio.tab === 'discover') rDiscoverLoad(); return; }
  const sg = e.target.closest('[data-rd-seedg]'); if (sg) { const seed = rSeedGet(), g = sg.dataset.rdSeedg, i = seed.g.map(x => String(x).toLowerCase()).indexOf(g); if (i >= 0) seed.g.splice(i, 1); else seed.g.push(g); rSeedSet(seed); rSeedChanged(); return; }
  const sx = e.target.closest('[data-rd-seeda-x]'); if (sx) { const seed = rSeedGet(); seed.a.splice(Number(sx.dataset.rdSeedaX), 1); rSeedSet(seed); rSeedChanged(); return; }
  const kd = e.target.closest('[data-rd-kind]'); if (kd) { radio.kindChosen = true; radio.draft.kind = kd.dataset.rdKind; radio.draft.value = kd.dataset.rdKind === 'release' && typeof nowPlayingItem !== 'undefined' && nowPlayingItem ? `${nowPlayingItem.artist} \u2013 ${nowPlayingItem.title}` : ''; rPaint(); return; }
  const sb = e.target.closest('[data-rd-set]'); if (sb) { radio.draft[sb.dataset.rdSet] = sb.dataset.v; rPaint(); return; }
  const sv = e.target.closest('[data-rd-saved]'); if (sv) { radioStart(rLs(RADIO_ST_KEY, [])[Number(sv.dataset.rdSaved)]); return; }
  const us = e.target.closest('[data-rd-unsave]'); if (us) { const l = rLs(RADIO_ST_KEY, []); l.splice(Number(us.dataset.rdUnsave), 1); rLsSet(RADIO_ST_KEY, l); rPaint(); return; }
  const q = e.target.closest('[data-rd-q]'); if (q) { if (radio.on && crateQueueId === radio.qid) playCrateQueueIndex(radio.qid, Number(q.dataset.rdQ)); return; }
  const dc = e.target.closest('[data-rd-disc]'); if (dc) { const x = (radio.disc || [])[Number(dc.dataset.rdDisc)]; if (x) rfOpen(x); return; }
  const b = e.target.closest('[data-rd]'); if (!b) return; const k = b.dataset.rd;
  if (k === 'stop') radioStop();
  else if (k === 'start') { const st = rDraftStation(); if (['genre', 'artist', 'desc', 'time'].includes(st.kind) && !st.value) { radio.err = 'Name the ' + (RADIO_KINDS.find(x => x[0] === st.kind) || [0, 'station'])[1].replace(/^An? /, '').toLowerCase() + ' first.'; rPaint(); return; } radioStart(st); }
  else if (k === 'save') { const st = rDraftStation(); const l = rLs(RADIO_ST_KEY, []); l.unshift(st); rLsSet(RADIO_ST_KEY, l.slice(0, 12)); rPaint(); rBtnPaint(); flashGlobalToast(`Saved “${rStName(st)}”.`); }
  else if (k === 'like') rLike();
  else if (k === 'skip') rSkip();
  else if (k === 'no') rNotForMe();
  else if (k === 'add') { const c = rCur(); if (c) { document.getElementById('radioOv').hidden = true; rAdd(c.item); } }
  else if (k === 'card') { const c = rCur(); if (c) { if (c.radio.x) rfOpen(c.radio.x); else { document.getElementById('radioOv').hidden = true; openDeck(c.item); } } }
  else if (k === 'disc-more') { radio.discN = (radio.discN || 24) + 24; rPaint(); }
}

// ----- "Tell it what you like": for a new crate, a few genres and artists to start from -----
async function rDbGenres() {
  if (radio.dbGenres) return radio.dbGenres;
  radio.dbGenres = [];
  try { const r = await postUpdate({ action: 'masterMusicState' }); const g = (r && r.status && r.status.genres) || {}; radio.dbGenres = Object.keys(g).sort((x, y) => g[y] - g[x]).map(k => ({ k, n: g[k] })); }
  catch (e) { radio.dbGenres = []; }
  radio.dbGenresDone = true; rPaint(); return radio.dbGenres;
}
function rSeedHtml() {
  if (!rCold()) return '';
  const seed = rSeedGet(), on = new Set(seed.g.map(x => String(x).toLowerCase()));
  if (!radio.dbGenres) rDbGenres();
  const gl = (radio.dbGenres || []).slice(0, 40);
  seed.g.forEach(x => { if (!gl.some(z => z.k === String(x).toLowerCase())) gl.unshift({ k: String(x).toLowerCase(), n: 0 }); });
  return `<div class="rd-seed"><div class="rd-seed-h"><div><div class="gs-lbl rd-teal">Your crate is ${state.raw.length ? 'still small' : 'empty'}</div><b>Tell it what you like</b></div><span class="gs-s">Pick genres and artists to start from. Everything you Like and Add on the radio teaches it too, and your crate takes over as it grows.${seed.g.length || seed.a.length ? '' : ' With nothing picked, it plays the best of the database: what your friends keep, and what’s rated and played most.'}</span></div>
    <div class="rd-seed-g">${gl.length ? gl.map(g => `<button type="button" class="rd-gchip${on.has(g.k) ? ' on' : ''}" data-rd-seedg="${escapeHtml(g.k)}" aria-pressed="${on.has(g.k)}">${escapeHtml(rCap(g.k))}${g.n ? `<i>${rN(g.n)}</i>` : ''}</button>`).join('') : `<span class="gs-s">${radio.dbGenresDone ? 'No genres in the database yet: add artists instead.' : 'Reading the database’s genres…'}</span>`}</div>
    <div class="rd-seed-a"><input type="text" class="rd-in" data-rd-seed-artist placeholder="Add an artist you like, then Enter" aria-label="Add an artist you like">${seed.a.map((a, i) => `<span class="rd-sv"><button type="button" disabled>${escapeHtml(a)}</button><button type="button" data-rd-seeda-x="${i}" aria-label="Remove ${escapeHtml(a)}">×</button></span>`).join('')}</div></div>`;
}
let rSeedT = 0;
function rSeedChanged() { radio.disc = null; rPaint(); clearTimeout(rSeedT); rSeedT = setTimeout(() => { if (radio.tab === 'discover') rDiscoverLoad(true); }, 700); }

// ----- Discover: the database's best for you, not in your crate -----
async function rDiscoverLoad(force) {
  if (radio.discLoading || (radio.disc && !force && Date.now() - radio.discAt < 10 * 60e3)) { rPaint(); return; }
  radio.discLoading = true; radio.err = ''; rPaint();
  try {
    const keep = { pool: radio.pool, related: radio.related, mine: radio.mine, seeds: radio.seeds };
    await rLoadPool({ kind: 'taste' });
    const blank = rCold() && !rSeedGet().g.length && !rSeedGet().a.length;          // (nothing to match against yet: the database's own order, its best first)
    const list = radio.pool.map(x => Object.assign({}, x, { m: blank ? null : rMatch(x) })); radio.discRelated = radio.related;
    if (radio.on) Object.assign(radio, keep); else radio.pool = [];
    radio.disc = blank ? list : list.sort((a, b) => b.m - a.m || (b.rr || 0) - (a.rr || 0)); radio.discAt = Date.now();
  } catch (e) { radio.err = e.message; }
  radio.discLoading = false; rPaint();
}
function rDiscoverHtml() {
  const seed = rSeedHtml();
  if (radio.discLoading && !radio.disc) return seed + '<p class="gs-s">Reading the music database for you…</p>';
  const l = radio.disc || []; if (!l.length) return seed + '<p class="gs-s">Nothing yet: the music database fills as you and your friends use CRATE (⚙ › Music database…).</p>';
  const n = radio.discN || 24, avg = l[0].m == null ? null : Math.round(l.slice(0, 50).reduce((s, x) => s + x.m, 0) / Math.min(50, l.length));
  return `${seed}<div class="rd-dnums"><div><b>${l.length.toLocaleString()}</b><span>${rCold() && !rSeedGet().g.length && !rSeedGet().a.length ? 'of the database’s best' : 'releases near your taste'}, not in your crate</span></div>${avg == null ? '' : `<div><b class="rd-teal">${avg}%</b><span>average match, top 50</span></div>`}<div><b>${l.filter(x => x.cr).length.toLocaleString()}</b><span>in friends’ crates</span></div><div><b>${l.filter(x => x.rr >= 3.7).length.toLocaleString()}</b><span>rated 3.7+ on RYM</span></div></div>
  <div class="rd-grid">${l.slice(0, n).map((x, i) => `<button type="button" class="rd-dc" data-rd-disc="${i}">${x.c ? `<img src="${escapeHtml(x.c)}" alt="" loading="lazy">` : '<span class="rd-nocv"></span>'}<b>${escapeHtml(x.t)}</b><em>${escapeHtml(x.a)}${x.y ? ' · ' + escapeHtml(x.y) : ''}</em><span class="rd-dm">${x.m != null ? `<i class="rd-teal">${x.m}%</i> · ` : ''}${x.rr ? `RYM ${Number(x.rr).toFixed(2)}` : ''}${x.li ? ` · ${rN(x.li)}` : ''}${x.cr ? ` · ${x.cr}★` : ''}</span></button>`).join('')}</div>
  ${l.length > n ? '<div class="rd-go"><button type="button" class="gs-btn" data-rd="disc-more">Show more</button></div>' : ''}`;
}

// ----- a release from the database: its card -----
async function rfOpen(x) {
  let ov = document.getElementById('rfOv'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'rfOv'; ov.className = 'pt-overlay rf-overlay'; document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
  const key = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } }; document.addEventListener('keydown', key, true);
  if (!radio.related || !Object.keys(radio.related).length) radio.related = radio.discRelated || {};
  const item = rItem(x), owned = rOwned().has(x.k), times = rLs('crate_radio_times_v1', {})[x.k] || 0, m = x.m != null ? x.m : rMatch(x);
  const paint = (songs, note) => {
    const mx = Math.max(1, ...(songs || []).map(s => s.l || 0));
    ov.innerHTML = `<div class="pt-dialog rf-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(x.t)}">
      <div class="rf-top">${rCoverHtml(item, 'rf-cv')}<div class="rf-t"><div class="gs-lbl rd-teal">From the music database · ${owned ? 'in your crate' : 'not in your crate'}</div>
        <div class="rf-title">${escapeHtml(x.t)}</div><div class="rf-art">${escapeHtml(x.a)} <span>${[x.y, x.l, rSplit(x.g).slice(0, 3).map(rCap).join(', ')].filter(Boolean).map(s => '· ' + escapeHtml(s)).join(' ')}</span></div>
        ${x.d ? `<div class="gs-s">${rSplit(x.d).slice(0, 6).map(d => `“${escapeHtml(d)}”`).join(', ')}</div>` : ''}
        <div class="rd-acts"><button type="button" class="gs-btn gs-pri" data-rf="play">▶ Play</button><button type="button" class="gs-btn" data-rf="station">Start a station from it</button>${owned ? '' : '<button type="button" class="gs-btn" data-rf="add">+ Add to crate</button><button type="button" class="gs-btn" data-rf="no">Not for me</button>'}</div></div>
        <button type="button" class="mood-x" data-rf="x" aria-label="Close">×</button></div>
      <div class="rf-nums">${[[m + '%', 'like your taste', 'teal'], [x.rr ? Number(x.rr).toFixed(2) : '—', x.rr ? `RYM, ${Number(x.rv || 0).toLocaleString()} ratings` : 'no RYM rating yet'], [x.li ? rN(x.li) : '—', 'Last.fm listeners'], [String(x.cr || 0), `friend${x.cr === 1 ? '’s crate' : 's’ crates'}`], [songs ? `${songs.filter(s => s.src).length}/${songs.length}` : '…', 'songs with a link'], [String(times), `time${times === 1 ? '' : 's'} the radio played it`]].map(([n, l, c]) => `<div><b${c ? ` class="rd-${c}"` : ''}>${escapeHtml(n)}</b><span>${escapeHtml(l)}</span></div>`).join('')}</div>
      <div class="rf-body"><div><div class="gs-lbl">Why it’s for you</div>${rWhy(x, item).map(([k, v]) => `<div class="rd-wl"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join('') || '<p class="gs-s">Near your station.</p>'}</div>
        <div><div class="gs-lbl">Songs · Last.fm listeners</div>${songs ? songs.map((s, i) => `<div class="rf-song"><span class="rd-qn">${i + 1}</span><span class="rf-sn">${escapeHtml(s.t.trackName)}</span><span class="mdb-bar"><u style="width:${Math.max(2, (s.l || 0) / mx * 100).toFixed(1)}%"></u></span><span class="gs-s">${s.l ? rN(s.l) : '—'}</span><span class="rf-src${s.src ? ' on' : ''}">${s.src || '—'}</span></div>`).join('') || '<p class="gs-s">No tracklist found.</p>' : `<p class="gs-s">${escapeHtml(note || 'Finding its songs…')}</p>`}
        ${songs && songs.length ? '<p class="gs-s">YT / SP: where it plays from. Links found once are kept in the database for everyone; the rest play through Spotify’s search.</p>' : ''}</div></div></div>`;
  };
  paint(null);
  ov.addEventListener('click', async (e) => {
    if (e.target === ov || e.target.closest('[data-rf="x"]')) { close(); return; }
    const b = e.target.closest('[data-rf]'); if (!b) return; const k = b.dataset.rf;
    if (k === 'play') { close(); radio.on = false; rBtnPaint(); playAlbumReplacingQueue(item); }
    else if (k === 'station') { close(); radioOpen('now'); radioStart(Object.assign({}, radio.draft || {}, { kind: 'release', artist: x.a, title: x.t, genre: x.g, value: '' })); }
    else if (k === 'add') { close(); const o = document.getElementById('radioOv'); if (o) o.hidden = true; rAdd(item); }
    else if (k === 'no') { rNotForMe(x); if (radio.disc) radio.disc = radio.disc.filter(d => d.k !== x.k); close(); rPaint(); }
  });
  let tl = null; try { tl = await getTracksFor(item); } catch (e) { tl = null; }
  const ok = (tl || []).filter(t => t && t.trackName);
  const [top, links] = await Promise.all([rTopTracks(x.a), rLinksFor([x.k]).then(o => o[x.k] || {})]);
  if (!document.body.contains(ov)) return;
  paint(ok.map(t => { const lk = links[rFold(t.trackName)] || {}; return { t, l: (top.get(rFold(t.trackName)) || {}).l || 0, src: lk.yt ? 'YT' : lk.sp ? 'SP' : (t.youtubeLink ? 'YT' : t.spotifyLink ? 'SP' : '') }; }), 'No tracklist found.');
}

// ----- the player's radio button, ⚙ › CRATE Radio…, and the database's search results open the card -----
function rPlayAt(id, i) { return playCrateQueueIndex(id, i); }
function rBtnPaint() { ['miniPlayerRadioBtn', 'radioTopBtn'].forEach(id => { const b = document.getElementById(id); if (b) { b.classList.toggle('on', radio.on); b.setAttribute('aria-pressed', String(radio.on)); b.title = radio.on ? 'CRATE Radio: ' + rStName(radio.st) + ' (Shift R)' : 'CRATE Radio and Discover (Shift R)'; } }); }
(function () {
  const q = document.getElementById('miniPlayerQueueBtn');
  if (q) { const b = document.createElement('button'); b.id = 'miniPlayerRadioBtn'; b.className = 'mini-player-btn rd-pbtn'; b.type = 'button'; b.setAttribute('aria-label', 'CRATE Radio'); b.setAttribute('aria-pressed', 'false'); b.title = 'CRATE Radio';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/></svg>';
    // (1.135.193) with a song playing: a station from it, the song carrying on and similar songs lined up after it (again: the window)
    b.addEventListener('click', async () => {
      const it = typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null;
      if (radio.on || !it || it.radio || b.dataset.busy) { radioOpen(radio.on ? 'now' : undefined); return; }
      b.dataset.busy = '1'; b.classList.add('rd-tuning'); flashGlobalToast(`Radio: finding songs like \u201c${it.title}\u201d\u2026`);
      const ok = await radioFromItem(it, { mode: 'current' }); delete b.dataset.busy; b.classList.remove('rd-tuning');
      if (ok) flashGlobalToast(`Radio: songs like \u201c${it.title}\u201d are up next. Click to see them.`, { onClick: () => radioOpen('now') });
    });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); radioOpen(); });
    b.title = 'CRATE Radio: songs like this one, up next (right-click: the radio window)';
    q.parentNode.insertBefore(b, q); }
  // (1.135.172) and one in the top bar, beside Friends: the player only shows once something plays, so a new crate had no way in but the ⚙ menu
  const fb = document.getElementById('friendsBtn');
  if (fb) { const t = document.createElement('button'); t.type = 'button'; t.id = 'radioTopBtn'; t.className = 'icon-btn rd-pbtn'; t.setAttribute('aria-label', 'CRATE Radio and Discover'); t.setAttribute('aria-pressed', 'false'); t.title = 'CRATE Radio and Discover (Shift R)';
    t.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/></svg>';
    t.addEventListener('click', () => radioOpen(radio.on ? 'now' : (state.raw || []).length ? undefined : 'discover')); fb.insertAdjacentElement('afterend', t); }
  const after = document.getElementById('menuMusicDb') || document.getElementById('menuMasterCrate'); if (after) { const m = document.createElement('button'); m.type = 'button'; m.id = 'menuRadio'; m.textContent = 'CRATE Radio…'; m.title = 'Play beyond your crate, from the music database'; m.addEventListener('click', () => radioOpen()); after.insertAdjacentElement('beforebegin', m); }
  // (1.135.196) Up next and Track Info, for a release from the database: its card, not the catalogue it isn't in
  document.addEventListener('click', (e) => {
    const go = e.target.closest && e.target.closest('[data-go-key], #trackInfoTitle'); if (!go) return;
    const k = go.dataset && go.dataset.goKey, e2 = (crateQueueList || []).find(x => x && x.item && x.item.radio && (k ? artKey(x.item) === k : x.item === nowPlayingItem));
    if (!e2 && !(go.id === 'trackInfoTitle' && nowPlayingItem && nowPlayingItem.radio)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const x = e2 && e2.radio && e2.radio.x; if (x) rfOpen(x); else radioOpen('now');
  }, true);
  // the player's title and release, for a release from the database: its card (it isn't in the catalogue to go to)
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#miniPlayerTitle, #miniPlayerAlbum'); if (!t || !nowPlayingItem || !nowPlayingItem.radio) return;
    e.preventDefault(); e.stopImmediatePropagation(); const c = rCur(); if (c && c.radio.x) rfOpen(c.radio.x); else radioOpen('now');
  }, true);
  // the music database page's search results open the card too
  document.addEventListener('click', (e) => {
    const r = e.target.closest && e.target.closest('#mdbOverlay .mdb-r[data-mdb-i]'); if (!r || !mdb.view || !mdb.view.res) return;
    const o = mdb.view.res[Number(r.dataset.mdbI)]; if (!o) return;
    rfOpen({ k: o.Key, a: o.Artist, t: o.Title, ty: o.Type, y: String(o.Year || '').slice(0, 4), g: o.Genre, d: o.Descriptors, l: o.Label, c: o.Cover, li: Number(o.Listeners) || 0, rr: Number(o.RymRating) || 0, rv: Number(o.RymVotes) || 0, cr: Number(o.Crates) || 0 });
  });
  window.addEventListener('keydown', (e) => {          // Shift+R: the radio window
    if (e.key !== 'R' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return; const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); e.stopImmediatePropagation(); const o = document.getElementById('radioOv'); if (o && !o.hidden) o.hidden = true; else radioOpen();
  }, true);
  if (typeof KEYS_LIST !== 'undefined' && Array.isArray(KEYS_LIST)) { try { KEYS_LIST[0][1].push(['Shift R', 'CRATE Radio']); } catch (e) { /* listed or not */ } }
})();

// (1.135.193) "When the queue ends, keep playing similar music": instead of stopping, a station from the last release that played (its
// genres, mood, texture, artist), lined up after it. Not while a release is set to loop, nor while the rest of a big "play everything" is
// still to load. Turned on in the radio window's Stations, or ⚙ › CRATE Radio: keep playing.
(function () {
  const base = playCrateQueueIndex;
  playCrateQueueIndex = function (myId, index) {
    try {
      if (rAutoOn() && !radio.on && !radio.autoBusy && myId === crateQueueId && index >= crateQueueList.length && crateQueueList.length && !state.loop
        && !(typeof crateQueuePendingCount === 'function' && crateQueuePendingCount())) {
        const last = crateQueueList[crateQueueList.length - 1]; const it = last && last.item;
        if (it && it.artist && it.title) {
          radio.autoBusy = true; flashGlobalToast(`The queue ran out: radio from \u201c${it.title}\u201d\u2026`);
          radioFromItem(it, { mode: 'end', index }).then(ok => { if (!ok && myId === crateQueueId) base.call(this, myId, index); }).finally(() => { radio.autoBusy = false; });
          return;
        }
      }
    } catch (e) { /* stops as before */ }
    return base.apply(this, arguments);
  };
  // the switch: ⚙ menu, beside CRATE Radio…
  const m = document.getElementById('menuRadio'); if (m) {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'menuRadioAuto';
    const paint = () => { b.textContent = rAutoOn() ? 'When the queue ends: similar music \u2713' : 'When the queue ends: stop'; b.setAttribute('aria-pressed', String(rAutoOn())); };
    b.title = 'Keep playing songs like the last one, from the music database, instead of stopping'; paint();
    b.addEventListener('click', () => { rAutoSet(!rAutoOn()); paint(); rPaint(); }); m.insertAdjacentElement('afterend', b);
  }
  document.addEventListener('change', (e) => { if (e.target && e.target.matches && e.target.matches('[data-rd-auto]')) { rAutoSet(e.target.checked); const b = document.getElementById('menuRadioAuto'); if (b) b.textContent = rAutoOn() ? 'When the queue ends: similar music \u2713' : 'When the queue ends: stop'; } });
})();
