// CRATE — (1.135.33) CREDITS AND SONG DETAILS FROM RATE YOUR MUSIC (the CRATE for RateYourMusic add-on 1.22.0 or later reads them).
// A release page's credits: each person's roles, and the tracks a role is on. Roles with tracks go on those songs ("Name — guitar, vocals",
// the songs' Credits, shown under each song in the release view); roles without go on the release (trackData.release.credits, shown under
// the tracklist). A song page (rateyourmusic.com/song/…, when you view it): its RYM rating and how many ratings, its genre, its descriptors
// and its credits go on that song in your crate, found by the releases the page lists, else by artist and song title.
// What you typed always stays: credits, a genre and descriptors are filled in only where there are none, or where they came from RYM before
// (creditsSrc / descSrc 'rym'); the RYM rating and rating count are RYM's own and are brought up to date. What arrives before the release
// or song is in your crate (or before its tracklist is known) is kept on this device and put on it once it is.
const RYMD_CREDITS_KEY = 'crate_rym_credits_v1', RYMD_SONGS_KEY = 'crate_rym_songs_v1', RYMD_DONE_KEY = 'crate_rym_songs_done_v1';
const rymdStr = (x, n) => typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '';
function rymCleanCredits(list) {                                   // untrusted: text only, bounded
  return (Array.isArray(list) ? list : []).slice(0, 200).map(c => ({ name: rymdStr(c && c.name, 120), roles: (Array.isArray(c && c.roles) ? c.roles : []).slice(0, 20).map(r => ({ role: rymdStr(r && r.role, 80), tracks: rymdStr(r && r.tracks, 60).replace(/[^\w,\-–& ]/g, '') })).filter(r => r.role) })).filter(c => c.name && c.roles.length);
}
function rymCleanSongs(list) {
  const path = (x) => { const s = rymdStr(x, 300); return /^\/(song|release)\/[\w\-.~%/]+$/i.test(s) ? s.replace(/\/+$/, '') : ''; };
  return (Array.isArray(list) ? list : []).slice(0, 3000).map(e => ({
    p: path(e && e.p), ar: rymdStr(e && e.ar, 200), ti: rymdStr(e && e.ti, 200), a: Math.max(0, Math.min(5, Number(e && e.a) || 0)), n: Math.max(0, Math.round(Number(e && e.n) || 0)),
    pri: (Array.isArray(e && e.pri) ? e.pri : []).slice(0, 6).map(g => rymdStr(g, 80)).filter(Boolean), sec: (Array.isArray(e && e.sec) ? e.sec : []).slice(0, 6).map(g => rymdStr(g, 80)).filter(Boolean),
    desc: (Array.isArray(e && e.desc) ? e.desc : []).slice(0, 30).map(g => rymdStr(g, 60)).filter(Boolean), credits: rymCleanCredits(e && e.credits),
    rels: (Array.isArray(e && e.rels) ? e.rels : []).slice(0, 30).map(path).filter(Boolean), t: Number(e && e.t) || 0
  })).filter(e => e.p && e.ti);
}
const rymdLoad = (k) => { try { const o = JSON.parse(localStorage.getItem(k) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const rymdSave = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* this visit only */ } };
const rymdPathOf = (url) => { try { return new URL(url).pathname.replace(/\/+$/, ''); } catch (e) { return ''; } };
// the songs a credit's "tracks" name: "1-3, 5", "A1, B2", "A1-A3"
function rymdTrackNums(item, spec) {
  const tracks = rymdTracks(item); if (!tracks || !spec) return [];
  const out = new Set(), byPos = new Map(); tracks.forEach((t, i) => { const pos = String(t.pos || '').toUpperCase(); if (pos) byPos.set(pos, Number(t.trackNumber) || i + 1); });
  String(spec).split(/\s*[,&]\s*/).forEach(tok => {
    const m = /^([A-Z]?)(\d+)[a-z]?\s*[-–]\s*([A-Z]?)(\d+)[a-z]?$/i.exec(tok), one = /^([A-Z]?)(\d+)[a-z]?$/i.exec(tok);
    const put = (L, n) => { if (L) { const v = byPos.get(L.toUpperCase() + n); if (v) out.add(v); } else if (n >= 1 && n <= tracks.length) out.add(Number(tracks[n - 1].trackNumber) || n); };
    if (m) { for (let n = Number(m[2]); n <= Number(m[4]) && n - Number(m[2]) < 60; n++) put(m[1] || m[3], n); } else if (one) put(one[1], Number(one[2]));
  });
  return [...out];
}
function rymdTracks(item) { return isManualAlbum(item) ? item.manualTracks.map((t, i) => ({ trackNumber: i + 1, trackName: t.title, pos: t.pos })) : (state.trackCache[artKey(item)] || null); }
const rymdLines = (map) => [...map.entries()].map(([name, roles]) => `${name} — ${[...roles].join(', ')}`).join('\n');
function rymdSet(item, num, patch) {                              // the song's own entry, made if it has none
  item.trackData = item.trackData || {}; const e = item.trackData[num] || (item.trackData[num] = {}); let changed = false;
  Object.keys(patch).forEach(k => { if (patch[k] !== undefined && JSON.stringify(e[k]) !== JSON.stringify(patch[k])) { e[k] = patch[k]; changed = true; } });
  return changed;
}
const rymdMine = (e, field, src) => !!(e && e[field] && (Array.isArray(e[field]) ? e[field].length : String(e[field]).trim()) && e[src] !== 'rym');          // something you typed: left alone
function rymdApplyCredits(item, credits) {                         // -> whether anything changed
  const tracks = rymdTracks(item); if (!tracks) return null;        // no tracklist yet: later
  const per = new Map(), whole = new Map();
  credits.forEach(c => c.roles.forEach(r => {
    const nums = r.tracks ? rymdTrackNums(item, r.tracks) : [];
    if (!nums.length) { if (!whole.has(c.name)) whole.set(c.name, new Set()); whole.get(c.name).add(r.role); return; }
    nums.forEach(n => { if (!per.has(n)) per.set(n, new Map()); const m = per.get(n); if (!m.has(c.name)) m.set(c.name, new Set()); m.get(c.name).add(r.role); });
  }));
  let changed = false;
  per.forEach((m, n) => { const e = (item.trackData || {})[n]; if (rymdMine(e, 'credits', 'creditsSrc')) return; if (rymdSet(item, n, { credits: rymdLines(m), creditsSrc: 'rym' })) changed = true; });
  if (whole.size) { const e = (item.trackData || {}).release; if (!rymdMine(e, 'credits', 'creditsSrc') && rymdSet(item, 'release', { credits: rymdLines(whole), creditsSrc: 'rym' })) changed = true; }
  return changed;
}
async function rymdSaveTrackData(item) { try { await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData || {}) }); } catch (e) { /* kept on the item for this visit; tried again next time */ } }
// ----- release credits: kept until the release (and its tracklist) is in the crate -----
function rymCreditsArrived(batches) {
  const pend = rymdLoad(RYMD_CREDITS_KEY); let n = 0;
  (batches || []).forEach(b => (b.releases || []).forEach(r => { if (!r.credits || !r.credits.length) return; const k = rymdPathOf(r.rymLink) || ('at:' + dupKey(r.artist, r.title)); pend[k] = { ar: r.artist, ti: r.title, credits: r.credits, t: b.t || Date.now() }; n++; }));
  if (n) { rymdSave(RYMD_CREDITS_KEY, pend); rymdApplyPending(); }
}
let rymdBusy = false;
async function rymdApplyPending() {
  if (rymdBusy || !(state.raw || []).length) return; rymdBusy = true;
  try {
    const pend = rymdLoad(RYMD_CREDITS_KEY), byPath = rawIndex('rymPath', r => rymdPathOf(r.rymLink || '') || '\u0000'), byAt = rawIndex('dupAt', r => dupKey(r.artist, r.title)), touched = new Set(); let left = false;
    for (const k of Object.keys(pend)) {
      const e = pend[k], item = k.startsWith('at:') ? byAt.get(k.slice(3)) : (byPath.get(k) || byAt.get(dupKey(e.ar, e.ti)));
      if (!item) { if (Date.now() - (e.t || 0) > 30 * 864e5) delete pend[k]; else left = true; continue; }
      if (!rymdTracks(item) && typeof getTracksFor === 'function') { try { await getTracksFor(item); } catch (er) { /* later */ } }
      const ch = rymdApplyCredits(item, e.credits); if (ch === null) { left = true; continue; }
      if (ch) touched.add(item); delete pend[k];
    }
    rymdSave(RYMD_CREDITS_KEY, pend);
    for (const it of touched) await rymdSaveTrackData(it);
    if (touched.size) { if (typeof activeItem !== 'undefined' && activeItem && touched.has(activeItem) && typeof currentTracklistTracks !== 'undefined') { try { renderTracklistBody(activeItem, currentTracklistTracks); } catch (er) { /* drawn next time */ } } flashGlobalToast(`Credits from Rate Your Music added to ${touched.size} release${touched.size === 1 ? '' : 's'}.`); }
    void left;
  } finally { rymdBusy = false; }
  rymdApplySongs();
}
// ----- song pages -----
function rymSongsArrived(list) { const all = rymdLoad(RYMD_SONGS_KEY); list.forEach(s => { all[s.p] = s; }); const ks = Object.keys(all); if (ks.length > 3000) ks.sort((a, b) => (all[a].t || 0) - (all[b].t || 0)).slice(0, ks.length - 3000).forEach(k => delete all[k]); rymdSave(RYMD_SONGS_KEY, all); rymdApplySongs(); }
let rymdSongBusy = false;
async function rymdApplySongs() {
  if (rymdSongBusy || !(state.raw || []).length) return; rymdSongBusy = true;
  try {
    const all = rymdLoad(RYMD_SONGS_KEY), done = rymdLoad(RYMD_DONE_KEY), sig = (s) => JSON.stringify([s.a, s.n, s.pri, s.desc, s.credits]).length + ':' + (s.t || 0);
    const byPath = rawIndex('rymPath', r => rymdPathOf(r.rymLink || '') || '\u0000'), fold = (x) => pbFold(String(x || '')), touched = new Set();
    for (const p of Object.keys(all)) {
      const s = all[p]; if (done[p] === sig(s)) continue;
      let cands = s.rels.map(r => byPath.get(r)).filter(Boolean);
      if (!cands.length && s.ar) cands = (state.raw || []).filter(r => fold(r.artist) === fold(s.ar));
      let hit = null;
      for (const item of cands.slice(0, 30)) {
        let tracks = rymdTracks(item);
        if (!tracks && s.rels.length && typeof getTracksFor === 'function') { try { await getTracksFor(item); } catch (er) { /* later */ } tracks = rymdTracks(item); }
        if (!tracks) continue;
        const want = trackNormKey(s.ti), i = tracks.findIndex(t => trackNormKey(t.trackName) === want); if (i < 0) continue;
        hit = { item, num: Number(tracks[i].trackNumber) || i + 1 }; break;
      }
      if (!hit) continue;
      const e = (hit.item.trackData || {})[hit.num] || {}, patch = {};
      if (s.a) { patch.rymRating = Number(s.a.toFixed(2)); if (s.n) patch.rymVotes = s.n; }
      if (s.pri.length && !String(e.genre || '').trim()) patch.genre = s.pri.join(', ');
      if (s.desc.length && !rymdMine(e, 'desc', 'descSrc')) { patch.desc = [...new Set(s.desc.map(descKey).filter(Boolean))]; patch.descSrc = 'rym'; }
      if (s.credits.length && !rymdMine(e, 'credits', 'creditsSrc')) { const m = new Map(); s.credits.forEach(c => { m.set(c.name, new Set(c.roles.map(r => r.role))); }); patch.credits = rymdLines(m); patch.creditsSrc = 'rym'; }
      if (rymdSet(hit.item, hit.num, patch)) touched.add(hit.item);
      done[p] = sig(s);
    }
    rymdSave(RYMD_DONE_KEY, done);
    for (const it of touched) await rymdSaveTrackData(it);
    if (touched.size) { if (typeof likePaint === 'function') likePaint(true); flashGlobalToast(`Song details from Rate Your Music added to ${touched.size} release${touched.size === 1 ? '' : 's'}.`); }
  } finally { rymdSongBusy = false; }
}
function rymdRequestSongs() { try { window.postMessage({ source: 'crate-app', type: 'request-rym-songs' }, window.location.origin); } catch (e) { /* no add-on */ } }
// The release's own credits (roles on no particular song), under its tracklist
function rymdReleaseCreditsHtml(item) {
  const c = item && item.trackData && item.trackData.release && item.trackData.release.credits; if (!c) return '';
  const list = typeof parseTrackCredits === 'function' ? parseTrackCredits(c) : [];
  if (!list.length) return '';
  return `<details class="tl-release-credits"><summary>Release credits <span>${list.length}</span></summary><div class="tl-release-credits-list">${list.map(x => `<p class="track-credit-entry"><span class="track-credit-name">${escapeHtml(x.name)}</span>${x.role ? `<span class="track-credit-role">${escapeHtml(x.role)}</span>` : ''}</p>`).join('')}</div></details>`;
}
setTimeout(() => { rymdRequestSongs(); rymdApplyPending(); }, 8000);          // once the crate has loaded
setInterval(() => { if (!document.hidden) rymdApplyPending(); }, 60000);      // what waited for its release or tracklist
