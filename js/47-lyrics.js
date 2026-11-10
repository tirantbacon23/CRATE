// CRATE — lyrics (1.95.20).
// One part of the page's script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope.
//
// The lyrics button in the player opens a panel with the playing song's words, from LRCLIB (lrclib.net: free, open, no key). When LRCLIB has
// them timed, the line being sung is lit and kept in view as the song plays, whichever player it is (a part of a full-release video counts
// from the part's own start), and a click on a line plays from there. Untimed words are shown as they are. The artist, the song's name (and
// its Other title), the album and the length are what is sent, to find the right ones; the best match is used, and "Other versions" lists
// the rest to choose from. What was found is kept on this device for good (a song with none is asked again after 7 days), so is a choice
// you made, and so is an offset: − / + move the words earlier or later for this song (a live take, a video with an intro).
const LY_API = 'https://lrclib.net/api/', LY_NONE_TTL = 7 * 864e5, LY_OFFSET_KEY = 'crate_lyrics_offsets_v1';
let ly = { open: false, key: '', song: null, data: null, lines: null, idx: -1, tick: 0, loading: 0, userScrollAt: 0, cands: null };
const lyEl = (id) => document.getElementById(id);

// ----- reading LRC: "[01:07.97] words", a line may carry several times; [offset:+120] shifts them all -----
function lyParseLrc(text) {
  const out = []; let shift = 0;
  String(text || '').split(/\r?\n/).forEach(raw => {
    const off = /^\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw); if (off) { shift = (+off[1] || 0) / 1000; return; }
    const stamps = []; let rest = raw, m;
    while ((m = /^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/.exec(rest))) { stamps.push(+m[1] * 60 + parseFloat(m[2].replace(':', '.'))); rest = rest.slice(m[0].length); }
    if (!stamps.length) return;
    const words = rest.trim(); stamps.forEach(t => out.push({ t, text: words }));
  });
  out.sort((a, b) => a.t - b.t); if (shift) out.forEach(l => { l.t -= shift; });
  return out;
}
function lyLineAt(lines, sec) {                                     // the index of the line being sung at sec (-1: before the first)
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= sec) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

// ----- remembering: what LRCLIB gave for a song, and your offset for it -----
let lyMem = new Map(), lyDbP = null;
function lyDb() { return lyDbP || (lyDbP = new Promise((res, rej) => { try { const r = indexedDB.open('crate-lyrics', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } })); }
async function lyCacheGet(key) {
  if (lyMem.has(key)) return lyMem.get(key);
  try { const db = await lyDb(); const v = await new Promise((res) => { const q = db.transaction('kv', 'readonly').objectStore('kv').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); if (v) lyMem.set(key, v); return v; } catch (e) { return null; }
}
function lyCachePut(key, v) { lyMem.set(key, v); lyDb().then(db => { db.transaction('kv', 'readwrite').objectStore('kv').put(v, key); }).catch(() => {}); }
function lyOffsets() { try { const o = JSON.parse(localStorage.getItem(LY_OFFSET_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function lyOffset(key) { return Number(lyOffsets()[key]) || 0; }
function lySetOffset(key, v) { const o = lyOffsets(); if (Math.abs(v) < 0.05) delete o[key]; else o[key] = Math.round(v * 10) / 10; try { localStorage.setItem(LY_OFFSET_KEY, JSON.stringify(o)); } catch (e) { /* this visit only */ } }

// ----- what is playing -----
function lyNorm(s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(); }
function lyCleanTitle(t) { return String(t || '').replace(/\s*[\(\[][^)\]]*(remaster|mono|stereo|version|mix|edit|live|demo|bonus|take)[^)\]]*[\)\]]/ig, '').replace(/\s+-\s+(\d{4}\s+)?remaster(ed)?.*$/i, '').trim(); }
function lyNowSong() {
  const title = typeof currentPlayingTrackName === 'function' ? currentPlayingTrackName() : '';
  if (!title) return null;
  const it = typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null;
  let artist = (el.miniPlayerArtist && el.miniPlayerArtist.textContent || '').trim() || (it && it.artist) || '';
  let alt = '', durSec = Math.round((typeof getCurrentDurationMs === 'function' ? getCurrentDurationMs() : 0) / 1000) || 0;
  try { if (it && typeof releaseProgressTracksFor === 'function') { const tr = releaseProgressTracksFor(it), list = (tr || []).filter(t => t && t.trackNumber), i = list.length ? releaseTrackIndex(list, title) : -1; if (i >= 0) { alt = list[i].altTitle || ''; if (!durSec && list[i].trackTimeMillis) durSec = Math.round(list[i].trackTimeMillis / 1000); } } } catch (e) { /* as it is */ }
  return { title, artist, alt, album: it ? it.title || '' : '', durSec, key: lyNorm(artist) + '|' + lyNorm(lyCleanTitle(title)) };
}

// ----- finding them on LRCLIB -----
async function lyApi(path) {
  const r = await fetch(LY_API + path, { headers: { 'Lrclib-Client': 'CRATE (https://github.com/tirantbacon23/CRATE)' } });
  if (r.status === 404) return null; if (!r.ok) throw new Error('LRCLIB ' + r.status); return r.json();
}
function lyScore(song, x) {                                         // how well an LRCLIB entry fits the song (0..100), or -1 when it is another song
  const names = [song.title, lyCleanTitle(song.title), song.alt].filter(Boolean);
  const tsim = (a, b) => typeof smTitleSim === 'function' ? smTitleSim(a, b) : (lyNorm(a) === lyNorm(b) ? 1 : 0);
  const ts = Math.max(...names.map(n => Math.max(tsim(n, x.trackName || ''), tsim(lyCleanTitle(n), lyCleanTitle(x.trackName || '')))));
  if (ts < 0.7) return -1;
  const am = typeof smArtistMatch === 'function' ? smArtistMatch(song.artist, [x.artistName || '']) : (lyNorm(song.artist) === lyNorm(x.artistName) ? 1 : 0);
  const d = song.durSec && x.duration ? Math.abs(song.durSec - x.duration) : null;
  return Math.round(ts * 45 + (am === null ? 10 : am * 25) + (d === null ? 8 : d <= 3 ? 15 : d <= 10 ? 10 : d <= 30 ? 4 : 0) + (x.syncedLyrics ? 10 : x.plainLyrics ? 3 : 0) + (x.instrumental ? 2 : 0));
}
async function lyFind(song) {                                      // -> { best, cands }
  const seen = new Map(), add = (list) => (list || []).forEach(x => { if (x && x.id && !seen.has(x.id)) seen.set(x.id, x); });
  const qs = new URLSearchParams({ artist_name: song.artist, track_name: lyCleanTitle(song.title) }); if (song.album) qs.set('album_name', song.album); if (song.durSec) qs.set('duration', String(song.durSec));
  try { const g = await lyApi('get?' + qs.toString()); if (g) add([g]); } catch (e) { /* the searches below */ }
  const searches = [`${song.artist} ${lyCleanTitle(song.title)}`]; if (song.alt) searches.push(`${song.artist} ${song.alt}`);
  for (const q of searches) { try { add(await lyApi('search?q=' + encodeURIComponent(q))); } catch (e) { if (!seen.size) throw e; } }
  if (![...seen.values()].some(x => lyScore(song, x) >= 60)) {         // by the name alone (an artist written another way)
    for (const n of [lyCleanTitle(song.title), song.alt].filter(Boolean)) { try { add(await lyApi('search?track_name=' + encodeURIComponent(n))); } catch (e) { /* what there is */ } }
  }
  const cands = [...seen.values()].map(x => ({ x, s: lyScore(song, x) })).filter(c => c.s >= 0).sort((a, b) => b.s - a.s).slice(0, 12).map(c => lyPick(c.x, c.s));
  return { best: cands.find(c => c.score >= 55) || null, cands };
}
function lyPick(x, score) { return { id: x.id, trackName: x.trackName || '', artistName: x.artistName || '', albumName: x.albumName || '', duration: x.duration || 0, synced: x.syncedLyrics || '', plain: x.plainLyrics || '', instrumental: !!x.instrumental, score: score || 0 }; }

// ----- the panel -----
function lyEnsureDom() {
  if (lyEl('lyricsPanel')) return;
  const p = document.createElement('aside'); p.id = 'lyricsPanel'; p.className = 'lyrics-panel'; p.hidden = true; p.setAttribute('aria-label', 'Lyrics');
  p.innerHTML = `<div class="lyrics-head"><div class="lyrics-ht"><div id="lyricsSong" class="lyrics-song"></div><div id="lyricsWho" class="lyrics-who"></div></div>
      <button type="button" class="chip-btn" id="lyricsClose" aria-label="Close lyrics" title="Close (Esc)">✕</button></div>
    <div class="lyrics-tools"><span id="lyricsSrc" class="lyrics-src"></span>
      <span class="lyrics-off" id="lyricsOffBox"><button type="button" class="chip-btn" id="lyricsEarlier" title="The words come too late: show them earlier">−</button><span id="lyricsOff" title="How far the words are moved for this song">0.0 s</span><button type="button" class="chip-btn" id="lyricsLater" title="The words come too early: show them later">+</button></span>
      <button type="button" class="chip-btn" id="lyricsOthers" title="Other matches LRCLIB has for this song">Other versions</button></div>
    <div id="lyricsPick" class="lyrics-pick" hidden></div>
    <div id="lyricsBody" class="lyrics-body" tabindex="0"></div>`;
  document.body.appendChild(p);
  lyEl('lyricsClose').addEventListener('click', closeLyrics);
  lyEl('lyricsEarlier').addEventListener('click', () => lyNudge(-0.5));
  lyEl('lyricsLater').addEventListener('click', () => lyNudge(0.5));
  lyEl('lyricsOthers').addEventListener('click', lyToggleOthers);
  const body = lyEl('lyricsBody');
  ['wheel', 'touchmove'].forEach(ev => body.addEventListener(ev, () => { ly.userScrollAt = Date.now(); }, { passive: true }));
  body.addEventListener('click', (e) => { const l = e.target.closest('[data-ly]'); if (!l || !ly.lines) return; lySeek(ly.lines[+l.dataset.ly].t + lyOffset(ly.key)); ly.userScrollAt = 0; });
  lyEl('lyricsPick').addEventListener('click', (e) => { const b = e.target.closest('[data-ly-pick]'); if (!b || !ly.cands) return; const c = ly.cands[+b.dataset.lyPick]; if (!c) return; lyCachePut(ly.key, { at: Date.now(), chosen: true, best: c, cands: ly.cands }); lyShow(c); lyEl('lyricsPick').hidden = true; });
}
function lyNudge(d) { if (!ly.key) return; lySetOffset(ly.key, lyOffset(ly.key) + d); lyPaintOffset(); ly.idx = -2; }
function lyPaintOffset() { const v = ly.key ? lyOffset(ly.key) : 0; lyEl('lyricsOff').textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + ' s'; }
function lyToggleOthers() {
  const box = lyEl('lyricsPick'); if (!box.hidden) { box.hidden = true; return; }
  const c = ly.cands || []; const cur = ly.data && ly.data.id;
  box.innerHTML = c.length ? c.map((x, i) => `<button type="button" class="lyrics-pick-row${x.id === cur ? ' on' : ''}" data-ly-pick="${i}"><span class="lyrics-pick-t">${escapeHtml(x.trackName)}</span><span class="lyrics-pick-m">${escapeHtml(x.artistName)}${x.albumName ? ' · ' + escapeHtml(x.albumName) : ''}${x.duration ? ' · ' + formatMs(x.duration * 1000) : ''} · ${x.synced ? 'timed' : x.instrumental ? 'instrumental' : 'not timed'}</span></button>`).join('') : '<div class="lyrics-src">LRCLIB has nothing else for this song.</div>';
  box.hidden = false;
}
function lyShow(d) {                                                // d: one LRCLIB entry (lyPick), or null
  ly.data = d; ly.lines = d && d.synced ? lyParseLrc(d.synced) : null; ly.idx = -2;
  const body = lyEl('lyricsBody');
  lyEl('lyricsOffBox').hidden = !ly.lines;
  if (!d) { lyEl('lyricsSrc').textContent = 'No lyrics found on LRCLIB.'; body.innerHTML = `<div class="lyrics-empty">LRCLIB has no words for this song${ly.cands && ly.cands.length ? ' that look right. Try Other versions' : ''}.</div>`; return; }
  if (d.instrumental && !d.synced && !d.plain) { lyEl('lyricsSrc').textContent = 'LRCLIB'; body.innerHTML = '<div class="lyrics-empty">Instrumental</div>'; return; }
  lyEl('lyricsSrc').textContent = (ly.lines ? 'Timed lyrics' : 'Not timed') + ' · LRCLIB';
  body.innerHTML = ly.lines ? ly.lines.map((l, i) => `<div class="lyrics-line${l.text ? '' : ' gap'}" data-ly="${i}">${l.text ? escapeHtml(l.text) : '♪'}</div>`).join('') + '<div class="lyrics-pad"></div>'
    : `<div class="lyrics-plain">${escapeHtml(d.plain || '')}</div>`;
  body.scrollTop = 0; lyPaintOffset();
}
async function lyLoad(song) {
  const seq = ++ly.loading; ly.key = song.key; ly.song = song; ly.cands = null; ly.data = null; ly.lines = null;
  lyEl('lyricsSong').textContent = song.title; lyEl('lyricsWho').textContent = song.artist; lyEl('lyricsPick').hidden = true; lyEl('lyricsOffBox').hidden = true;
  lyEl('lyricsSrc').textContent = 'Looking on LRCLIB…'; lyEl('lyricsBody').innerHTML = '';
  let hit = await lyCacheGet(song.key);
  if (hit && !hit.best && !hit.chosen && Date.now() - (hit.at || 0) > LY_NONE_TTL) hit = null;          // none found a while ago: ask again
  if (!hit) {
    try { const r = await lyFind(song); hit = { at: Date.now(), best: r.best, cands: r.cands }; lyCachePut(song.key, hit); }
    catch (e) { if (seq !== ly.loading) return; lyEl('lyricsSrc').textContent = 'Couldn’t reach LRCLIB: ' + ((e && e.message) || e); return; }
  }
  if (seq !== ly.loading) return;
  ly.cands = hit.cands || []; lyShow(hit.best);
}
function lySeek(sec) {                                              // the song (its part, in a full-release video) from sec
  const ms = Math.max(0, Math.round(sec * 1000));
  try {
    if (activePlayerEngine === 'youtube') { if (ytPlayer && ytPlayer.seekTo) ytSeekInSegment(ms / 1000); }
    else if (activePlayerEngine === 'soundcloud') { if (scWidget && scWidget.seekTo) { scWidget.seekTo(ms); scPosition = ms; } }
    else if (spotifyPlayer && spotifyLastState) { spotifyPlayer.seek(ms).catch(() => {}); spotifyLastState = { ...spotifyLastState, position: ms }; spotifyLastStateAt = Date.now(); }
  } catch (e) { /* not ready */ }
}
function lyFollow() {                                               // the line being sung: lit, and kept in view
  if (!ly.lines || !ly.lines.length) return;
  const sec = (typeof getEstimatedPosition === 'function' ? getEstimatedPosition() : 0) / 1000 - lyOffset(ly.key) + 0.15;
  const i = lyLineAt(ly.lines, sec); if (i === ly.idx) return; ly.idx = i;
  const body = lyEl('lyricsBody'); body.querySelectorAll('.lyrics-line.on').forEach(n => n.classList.remove('on'));
  const cur = i >= 0 ? body.querySelector(`[data-ly="${i}"]`) : null; if (!cur) return; cur.classList.add('on');
  if (Date.now() - ly.userScrollAt > 4000) body.scrollTo({ top: cur.offsetTop - body.clientHeight * 0.38, behavior: 'smooth' });
}
function lyricsCurrentLine() {                                      // the line being sung now, for the visualizer ('' when there is none)
  if (!ly.lines || !ly.key) return '';
  const song = lyNowSong(); if (!song || song.key !== ly.key) return '';
  const i = lyLineAt(ly.lines, (getEstimatedPosition() / 1000) - lyOffset(ly.key) + 0.15); return i >= 0 ? ly.lines[i].text : '';
}
function lyFit() {                                                // clear of the player when it is docked along the bottom
  const p = lyEl('lyricsPanel'), m = el.miniPlayer; if (!p) return; let b = 16;
  if (m && !m.hidden) { const r = m.getBoundingClientRect(); if (r.width > innerWidth * 0.6 && r.bottom >= innerHeight - 4 && r.top > innerHeight * 0.5) b = Math.round(innerHeight - r.top + 10); }
  if (p.style.bottom !== b + 'px') p.style.bottom = b + 'px';
}
function lyTick() {
  if (!ly.open) return;
  lyFit();
  const song = lyNowSong();
  if (!song) { if (ly.key) { ly.key = ''; ly.loading++; lyEl('lyricsSong').textContent = ''; lyEl('lyricsWho').textContent = ''; lyEl('lyricsSrc').textContent = ''; lyEl('lyricsOffBox').hidden = true; lyEl('lyricsBody').innerHTML = '<div class="lyrics-empty">Play a song to see its words.</div>'; } return; }
  if (song.key !== ly.key) { lyLoad(song); return; }
  lyFollow();
}
function openLyrics() {
  lyEnsureDom(); lyEl('lyricsPanel').hidden = false; ly.open = true; ly.key = ''; if (el.miniPlayerLyricsBtn) el.miniPlayerLyricsBtn.classList.add('active');
  lyTick(); clearInterval(ly.tick); ly.tick = setInterval(lyTick, 200);
}
function closeLyrics() {
  const p = lyEl('lyricsPanel'); if (!p || p.hidden) return false;
  p.hidden = true; ly.open = false; clearInterval(ly.tick); if (el.miniPlayerLyricsBtn) el.miniPlayerLyricsBtn.classList.remove('active'); return true;
}
(function lyWire() {
  const b = el.miniPlayerLyricsBtn; if (!b) return;
  b.addEventListener('click', () => { if (ly.open) closeLyrics(); else openLyrics(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ly.open && !(typeof viz !== 'undefined' && viz.open) && closeLyrics()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
})();
