// (1.135.154) Import a playlist from elsewhere: ⤓ in the playlist list's header. Paste a Spotify or YouTube playlist link, or a CSV export
// (Exportify, TuneMyMusic, Soundiiz… which also covers Apple Music, Tidal, Deezer), or a plain list of songs ("Artist - Song", one a line).
// Each song is matched to your crate: its release by artist and title, then the song in that release's tracklist. Songs whose release
// isn't in your crate can bring their release in with them (when the source says which release: Spotify and most CSVs do), or be left
// out. Then it's one new CRATE playlist, in the source's order.
const pim = { songs: [], name: '', src: '', busy: false };
function pimEl() { return document.getElementById('pimOverlay'); }
const pimFold = (s) => (typeof smFold === 'function' ? smFold(s) : String(s || '').toLowerCase()).trim();

// ----- reading the source -----
function pimSpotifyId(t) { const m = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]+)|spotify:playlist:([A-Za-z0-9]+)/.exec(t); return m ? (m[1] || m[2]) : ''; }
function pimYoutubeId(t) { const m = /[?&]list=([A-Za-z0-9_-]+)/.exec(t); return m && /youtu/.test(t) ? m[1] : ''; }
async function pimReadSpotify(id, say) {
  let tok = null; try { tok = typeof getSpotifyUserAccessToken === 'function' ? await getSpotifyUserAccessToken() : null; } catch (e) { tok = null; }
  if (!tok) { try { tok = await getSpotifyToken(); } catch (e) { tok = null; } }
  if (!tok) throw new Error('CRATE isn’t connected to Spotify: add your Spotify app in ⚙ › Spotify API… first.');
  const get = async (u) => { const r = await fetch(u, { headers: { Authorization: 'Bearer ' + tok } }); if (r.status === 404) throw new Error('Spotify can’t find that playlist. Spotify’s own mixes (Discover Weekly, Daily Mix…) can’t be read by apps; a private playlist needs you signed in to Spotify in CRATE.'); if (!r.ok) throw new Error('Spotify answered ' + r.status); return r.json(); };
  const meta = await get(`https://api.spotify.com/v1/playlists/${id}?fields=name,description,tracks.total`);
  const out = []; let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&fields=next,items(track(name,track_number,disc_number,duration_ms,external_urls,artists(name),album(name,album_type,release_date,images,external_urls,artists(name))))`;
  while (url) {
    const d = await get(url);
    (d.items || []).forEach(x => { const t = x && x.track; if (!t || !t.name) return; const al = t.album || {};
      out.push({ song: t.name, artist: (t.artists || []).map(a => a.name).join(', '), mainArtist: ((al.artists || [])[0] || (t.artists || [])[0] || {}).name || '', release: al.name || '', type: al.album_type === 'single' ? 'Single' : al.album_type === 'compilation' ? 'Compilation' : 'Album', date: al.release_date || '', cover: ((al.images || [])[0] || {}).url || '', link: (al.external_urls || {}).spotify || '', num: t.track_number || '', ms: t.duration_ms || 0, songLink: (t.external_urls || {}).spotify || '' }); });
    if (say) say(`Reading Spotify… ${out.length} of ${meta.tracks ? meta.tracks.total : '?'}`);
    url = d.next;
  }
  return { name: meta.name || 'Imported from Spotify', songs: out };
}
async function pimReadYoutube(id) {
  if (typeof smYtReadPlaylist !== 'function') throw new Error('YouTube playlists need Match songs’ YouTube setup (the add-on or an API key).');
  const pl = await smYtReadPlaylist(id, '', '');
  const songs = (pl.tracks || []).map(v => {
    const t = String(v.title || ''), m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(t), ch = String(v.channel || '').replace(/\s*-\s*Topic$/i, '');
    const song = (m ? m[2] : t).replace(/\s*[\[(](official|audio|video|lyrics?|hd|hq|remaster(ed)?|visuali[sz]er)[^\])]*[\])]/gi, '').trim();
    return { song, artist: m ? m[1] : ch, mainArtist: m ? m[1] : ch, release: '', ms: v.durationMs || 0, songLink: 'https://www.youtube.com/watch?v=' + v.id };
  });
  return { name: pl.name || 'Imported from YouTube', songs };
}
function pimCsvRows(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function pimReadText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = lines[0] || '';
  if (/[,;\t]/.test(head) && /(track|song|title|name)/i.test(head) && /artist/i.test(head)) {          // a CSV export
    const rows = pimCsvRows(text), h = rows.shift().map(x => x.trim().toLowerCase());
    const col = (...re) => h.findIndex(x => re.some(r => r.test(x)));
    const cS = col(/^track name$/, /^(track|song)( ?name|title)?$/, /^title$/, /^name$/), cA = col(/^artist name\(s\)$/, /^artist( name)?s?$/, /artist/), cR = col(/^album( name)?$/, /^release( name)?$/, /album/), cD = col(/release date/, /^date$/, /year/), cN = col(/^track number$/, /^track ?#$/, /^#$/), cU = col(/track uri/, /spotify uri/, /^url$/);
    if (cS < 0 || cA < 0) throw new Error('That CSV has no song and artist columns CRATE can find.');
    return { name: '', songs: rows.map(r => ({ song: (r[cS] || '').trim(), artist: (r[cA] || '').trim(), mainArtist: (r[cA] || '').split(/[,;&]| feat\.? /i)[0].trim(), release: cR >= 0 ? (r[cR] || '').trim() : '', date: cD >= 0 ? (r[cD] || '').trim() : '', num: cN >= 0 ? (r[cN] || '').trim() : '', songLink: cU >= 0 && /^spotify:track:/.test(r[cU] || '') ? 'https://open.spotify.com/track/' + r[cU].split(':')[2] : '' })).filter(x => x.song && x.artist) };
  }
  return { name: '', songs: lines.map(l => { l = l.replace(/^\s*\d+[.)]\s*/, '').trim(); let m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(l); if (m) return { artist: m[1], mainArtist: m[1], song: m[2], release: '' }; m = /^(.+?)\s+by\s+(.+)$/i.exec(l); if (m) return { song: m[1], artist: m[2], mainArtist: m[2], release: '' }; return null; }).filter(Boolean) };
}

// ----- matching to your crate -----
function pimArtistOk(itArtist, artist) { const a = typeof smArtistMatch === 'function' ? smArtistMatch(itArtist, artist.split(/\s*,\s*/)) : (pimFold(itArtist) === pimFold(artist) ? 1 : 0); return a === null ? false : a >= 0.75; }
function pimTitleSim(a, b) { return typeof smTitleSim === 'function' ? smTitleSim(a, b) : (pimFold(a) === pimFold(b) ? 1 : 0); }
function pimSongIn(titles, song) { let best = -1, bs = 0; titles.forEach((t, k) => { const s = pimTitleSim(song, t); if (s > bs) { bs = s; best = k; } }); return bs >= 0.86 ? best : -1; }
async function pimMatchOne(s) {
  const raw = state.raw || [];
  let rel = null;
  if (s.release) { let bs = 0; raw.forEach(it => { if (!pimArtistOk(it.artist, s.mainArtist || s.artist)) return; const t = pimTitleSim(s.release, it.title); if (t > bs && t >= 0.85) { bs = t; rel = it; } }); }
  const songIn = async (it) => {
    let titles = trackTitlesFor(it), k = pimSongIn(titles, s.song);
    if (k < 0 && typeof getTracksFor === 'function') { try { const tl = await getTracksFor(it); titles = (tl || []).map(t => t.trackName).filter(Boolean); k = pimSongIn(titles, s.song); if (k >= 0) { const t = tl.find(x => x.trackName === titles[k]); return { name: titles[k], num: t ? t.trackNumber : '' }; } } catch (e) { /* by name then */ } }
    if (k < 0) return null;
    const tl = state.trackCache && state.trackCache[artKey(it)], t = tl && tl.find(x => x.trackName === titles[k]), mt = (it.manualTracks || []).find(x => x.title === titles[k]);
    return { name: titles[k], num: t ? t.trackNumber : mt ? mt.trackNumber : '' };
  };
  if (rel) { const f = await songIn(rel); s.match = { it: rel, name: f ? f.name : s.song, num: f ? f.num : (s.num || ''), sure: !!f }; s.st = f ? 'ok' : 'rel'; return; }
  // no release named (or not in the crate): the song by that artist anywhere in your crate, from the tracklists CRATE already has
  for (const it of raw) { if (!pimArtistOk(it.artist, s.mainArtist || s.artist)) continue; const k = pimSongIn(trackTitlesFor(it), s.song); if (k >= 0) { const f = await songIn(it); s.match = { it, name: f ? f.name : s.song, num: f ? f.num : '', sure: true }; s.st = 'ok'; return; } }
  s.match = null; s.st = s.release ? 'new' : 'none';
}

// ----- the dialog -----
function pimOpen() {
  let ov = pimEl();
  if (!ov) { ov = document.createElement('div'); ov.id = 'pimOverlay'; ov.className = 'pt-overlay pim-overlay'; document.body.appendChild(ov);
    ov.addEventListener('click', pimClick);
    ov.addEventListener('change', (e) => { if (e.target.id === 'pimFile' && e.target.files[0]) { const fr = new FileReader(); fr.onload = () => { document.getElementById('pimText').value = String(fr.result || ''); }; fr.readAsText(e.target.files[0]); } if (e.target.dataset.pimSkip != null) { const s = pim.songs[+e.target.dataset.pimSkip]; if (s) s.skip = !e.target.checked; pimRenderSummary(); } if (e.target.id === 'pimAddNew') { pim.addNew = e.target.checked; pimRenderSummary(); } });
    ov.addEventListener('input', (e) => { if (e.target.id === 'pimName') pim.name = e.target.value; });
    document.addEventListener('keydown', (e) => { const o = pimEl(); if (e.key === 'Escape' && o && !o.hidden && !pim.busy) { e.stopImmediatePropagation(); o.hidden = true; } }, true);
  }
  pim.songs = []; pim.name = ''; pim.addNew = true; ov.hidden = false; pimStep1();
}
function pimStep1(err) {
  pimEl().innerHTML = `<div class="pt-dialog pim-dialog" role="dialog" aria-modal="true" aria-labelledby="pimTitle"><div class="pt-head"><div><div class="gs-lbl">Playlists</div><div class="pt-title" id="pimTitle">Import a playlist</div></div><button type="button" class="mood-x" data-pim="x" aria-label="Close">×</button></div>
    <p class="gs-s">Paste a <b>Spotify</b> or <b>YouTube</b> playlist link, or a <b>CSV export</b> (Exportify for Spotify; TuneMyMusic or Soundiiz for Apple Music, Tidal, Deezer and others), or a list of songs, one a line: <i>Artist - Song</i>.</p>
    <textarea id="pimText" class="pim-text" rows="7" placeholder="https://open.spotify.com/playlist/…" spellcheck="false"></textarea>
    <div class="pim-row"><label class="gs-btn pim-file">Choose a CSV file…<input type="file" id="pimFile" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden></label><span class="gs-fill"></span><button type="button" class="gs-btn gs-pri" data-pim="read">Read it</button></div>
    ${err ? `<p class="pim-err" role="alert">${escapeHtml(err)}</p>` : ''}
    <p class="gs-s">Nothing is saved until you press Create at the end.</p></div>`;
  setTimeout(() => { const t = document.getElementById('pimText'); if (t) t.focus(); }, 30);
}
function pimSay(t) { const n = document.getElementById('pimStatus'); if (n) n.textContent = t; }
async function pimRead() {
  const text = (document.getElementById('pimText').value || '').trim(); if (!text) return;
  pim.busy = true; pimEl().querySelector('.pim-dialog').insertAdjacentHTML('beforeend', '<p class="gs-s" id="pimStatus" role="status">Reading…</p>');
  try {
    const sp = pimSpotifyId(text), yt = !sp && pimYoutubeId(text);
    const got = sp ? await pimReadSpotify(sp, pimSay) : yt ? await pimReadYoutube(yt) : pimReadText(text);
    pim.src = sp ? 'Spotify' : yt ? 'YouTube' : 'your list';
    if (!got.songs.length) throw new Error('No songs found in that.');
    pim.songs = got.songs; pim.name = got.name || 'Imported playlist';
    for (let i = 0; i < pim.songs.length; i++) { await pimMatchOne(pim.songs[i]); if (i % 5 === 0) pimSay(`Matching to your crate… ${i + 1} of ${pim.songs.length}`); }
    pim.busy = false; pimStep2();
  } catch (e) { pim.busy = false; pimStep1(e.message || String(e)); }
}
function pimCounts() {
  const c = { ok: 0, rel: 0, new: 0, none: 0, skip: 0, newRel: new Set() };
  pim.songs.forEach(s => { if (s.skip) { c.skip++; return; } c[s.st]++; if (s.st === 'new') c.newRel.add(pimFold(s.mainArtist) + '|' + pimFold(s.release)); });
  return c;
}
function pimRenderSummary() {
  const c = pimCounts(), n = document.getElementById('pimSummary'), b = document.querySelector('[data-pim="create"]'); if (!n) return;
  const go = c.ok + c.rel + (pim.addNew ? c.new : 0);
  n.innerHTML = `<span class="pim-chip ok">${c.ok} in your crate</span>${c.rel ? `<span class="pim-chip rel">${c.rel} by name (release in your crate, song not in its tracklist)</span>` : ''}${c.new ? `<span class="pim-chip new">${c.new} from ${c.newRel.size} release${c.newRel.size === 1 ? '' : 's'} not in your crate</span>` : ''}${c.none ? `<span class="pim-chip none">${c.none} not found</span>` : ''}${c.skip ? `<span class="pim-chip">${c.skip} left out</span>` : ''}`;
  if (b) { b.textContent = `Create playlist · ${go} song${go === 1 ? '' : 's'}${pim.addNew && c.newRel.size ? ` + add ${c.newRel.size} release${c.newRel.size === 1 ? '' : 's'}` : ''}`; b.disabled = !go; }
}
function pimStep2() {
  const lab = { ok: ['ok', 'in your crate'], rel: ['rel', 'by name'], new: ['new', 'release not in crate'], none: ['none', 'not found'] };
  const rows = pim.songs.map((s, i) => { const [cls, txt] = lab[s.st] || ['none', '']; const it = s.match && s.match.it;
    return `<label class="pim-song${s.skip ? ' off' : ''}"><input type="checkbox" data-pim-skip="${i}"${s.skip || s.st === 'none' ? '' : ' checked'}${s.st === 'none' ? ' disabled' : ''}><span class="pim-n">${i + 1}</span>${it ? `<img src="${escapeHtml(gxCover(it))}" alt="" loading="lazy">` : s.cover ? `<img src="${escapeHtml(s.cover)}" alt="" loading="lazy">` : '<span class="pim-noimg"></span>'}<span class="pim-t"><b>${escapeHtml(s.match ? s.match.name : s.song)}</b><em>${escapeHtml(s.artist)}${(it ? it.title : s.release) ? ' · ' + escapeHtml(it ? it.title : s.release) : ''}</em></span><span class="pim-chip ${cls}">${txt}</span></label>`; }).join('');
  pim.songs.forEach(s => { if (s.st === 'none') s.skip = true; });
  pimEl().innerHTML = `<div class="pt-dialog pim-dialog" role="dialog" aria-modal="true" aria-labelledby="pimTitle"><div class="pt-head"><div><div class="gs-lbl">Import from ${escapeHtml(pim.src)} · ${pim.songs.length} songs</div><div class="pt-title" id="pimTitle">Import a playlist</div></div><button type="button" class="mood-x" data-pim="x" aria-label="Close">×</button></div>
    <label class="pim-name"><span class="gs-lbl">Name</span><input type="text" id="pimName" value="${escapeHtml(pim.name)}"></label>
    <div class="pim-summary" id="pimSummary"></div>
    ${pimCounts().new ? `<label class="pim-check"><input type="checkbox" id="pimAddNew"${pim.addNew ? ' checked' : ''}> Add the releases that aren't in my crate (artist, title, date, cover and link from ${escapeHtml(pim.src)})</label>` : ''}
    <div class="pim-list">${rows}</div>
    <div class="pim-row"><button type="button" class="gs-btn" data-pim="back">← Another</button><span class="gs-fill"></span><button type="button" class="gs-btn gs-pri" data-pim="create">Create playlist</button></div>
    <p class="gs-s" id="pimStatus" role="status"></p></div>`;
  pimRenderSummary();
}
async function pimCreate() {
  const name = (pim.name || '').trim() || 'Imported playlist';
  pim.busy = true; document.querySelectorAll('#pimOverlay button, #pimOverlay input').forEach(n => { n.disabled = true; });
  try {
    // 1. the releases that aren't in the crate yet
    const want = pim.songs.filter(s => !s.skip && s.st === 'new' && pim.addNew);
    if (want.length) {
      const byRel = new Map(); want.forEach(s => { const k = pimFold(s.mainArtist) + '|' + pimFold(s.release); if (!byRel.has(k)) byRel.set(k, s); });
      const list = [...byRel.values()].map(s => ({ action: 'addAlbum', Artist: s.mainArtist || s.artist, Title: s.release, Type: s.type || 'Album', ReleaseDate: s.date || '', Cover: s.cover || '', Link: s.link || '' }));
      for (let i = 0; i < list.length; i += 25) { pimSay(`Adding releases to your crate… ${Math.min(list.length, i + 25)} of ${list.length}`); await postUpdate({ action: 'addAlbums', albums: list.slice(i, i + 25).map(p => { const q = Object.assign({}, p); delete q.action; return q; }) }); }
      pimSay('Reading your crate again…'); await fetchCatalog({ quiet: true });
      for (const s of want) { await pimMatchOne(s); if (s.st === 'rel' || s.st === 'new') { const it = (state.raw || []).find(r => pimArtistOk(r.artist, s.mainArtist || s.artist) && pimTitleSim(s.release, r.title) >= 0.85); if (it) { s.match = { it, name: s.song, num: s.num || '' }; s.st = 'ok'; } } }
    }
    // 2. the playlist, in the source's order
    const items = pim.songs.filter(s => !s.skip && s.match && s.match.it).map(s => ({ itemType: 'track', row: s.match.it.row, albumId: s.match.it.albumId || '', trackNum: s.match.num || '', trackName: s.match.name || s.song }));
    if (!items.length) throw new Error('None of the songs could be matched to your crate.');
    pimSay('Making the playlist…');
    const res = await postUpdate({ action: 'createPlaylist', name, description: `Imported from ${pim.src}, ${new Date().toLocaleDateString()}.` });
    const id = res && res.id; if (!id) throw new Error('Couldn’t make the playlist: try again.');
    for (let i = 0; i < items.length; i += 100) await postUpdate({ action: 'addPlaylistItems', playlistId: id, items: items.slice(i, i + 100) });
    await fetchCatalog({ quiet: true });
    pim.busy = false; pimEl().hidden = true;
    if (typeof switchTab === 'function') switchTab('albums'); if (typeof openPlaylist === 'function') openPlaylist(id);
    flashGlobalToast(`Imported “${name}”: ${items.length} song${items.length === 1 ? '' : 's'}${want.length ? `, ${new Set(want.map(s => pimFold(s.release))).size} releases added to your crate` : ''}`);
  } catch (e) { pim.busy = false; document.querySelectorAll('#pimOverlay button, #pimOverlay input').forEach(n => { n.disabled = false; }); pimSay(e.message || String(e)); }
}
function pimClick(e) {
  const ov = pimEl(); if (pim.busy) return;
  if (e.target === ov || e.target.closest('[data-pim="x"]')) { ov.hidden = true; return; }
  const b = e.target.closest('[data-pim]'); if (!b || b.disabled) return;
  if (b.dataset.pim === 'read') pimRead();
  else if (b.dataset.pim === 'back') pimStep1();
  else if (b.dataset.pim === 'create') pimCreate();
}
(function () {
  const acts = document.querySelector('#playlistsBrowserView .playlist-explorer-actions'); if (!acts) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'importPlaylistBtn'; b.className = 'icon-btn pll-hbtn'; b.title = 'Import a playlist from Spotify, YouTube or a CSV'; b.setAttribute('aria-label', 'Import a playlist');
  b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>';
  b.addEventListener('click', pimOpen); acts.insertBefore(b, acts.firstChild);
})();
