// ---- "Pull details…" (a release's menu): the release as Rate Your Music (what the add-on saw), MusicBrainz, Spotify, iTunes and Discogs have it,
// side by side with what is in your crate, and you choose, detail by detail and song by song, which is used: RYM has no song lengths, so the
// lengths come from MusicBrainz. A first version, to see whether it helps: nothing changes until Apply, and only what you picked differently
// from your crate is written. Each source is asked once, all at the same time; one that has nothing (or isn't set up) just says so. ----
const PD_SRC = [['crate', 'Your crate'], ['rym', 'RYM'], ['mb', 'MusicBrainz'], ['sp', 'Spotify'], ['it', 'iTunes'], ['dc', 'Discogs']];
const PD_FIELDS = [['cover', 'Cover'], ['date', 'Release date'], ['label', 'Label'], ['genre', 'Genres'], ['tracks', 'Tracklist']];
const PD_TL_SRC = { rym: 'rym', mb: 'musicbrainz', sp: 'spotify', it: 'itunes' };          // what each source is called in a saved song's "where it came from"
let pd = null;
const pdNorm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s*[([].*?[)\]]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const pdMs = (v) => { const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(String(v || '').trim()); return m ? ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 : 0; };          // "3:58" -> 238000 (Discogs)
const pdTracks = (list) => (list || []).filter(t => t && t.title).map(t => ({ title: String(t.title).trim(), durationMs: Math.max(0, Math.round(Number(t.durationMs) || 0)), section: t.section || '' }));

// ----- each source: { cover, date, label, genre, tracks } (what it has), or { err } -----
async function pdFromCrate(item) {
  try { await getTracksFor(item); } catch (e) { /* the list you have may be empty */ }
  const rows = currentTracklistAsManualRows(item);
  return { cover: item.cover || '', date: item.releaseDate || '', label: item.label || '', genre: item.genre || '', tracks: rows.filter(t => t.title), rows };
}
async function pdFromRym(item) {
  const list = await rymAskTracklists(3000);
  if (list === null) return { err: 'The add-on didn’t answer' };
  const e = tlRymPick(list, item), tracks = e && !rymTracklistLooksWrong(e.tracks) ? pdTracks(e.tracks) : [];
  return tracks.length ? { tracks } : { err: 'Not seen yet: open its RYM page once' };
}
async function pdFromMb(item) {
  const id = (String(item.link || '').match(/musicbrainz\.org\/release\/([a-f0-9-]{36})/i) || [])[1] || await lookupMbReleaseId(item.artist, item.title);
  if (!id) return { err: 'Not found' };
  const res = await mbFetch(`https://musicbrainz.org/ws/2/release/${id}?inc=recordings+labels&fmt=json`, { headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' } });
  if (!res.ok) return { err: 'MusicBrainz answered ' + res.status };
  const d = await res.json(), media = d.media || [], tracks = [];
  media.forEach((m, mi) => (m.tracks || []).forEach(t => tracks.push({ title: t.title || (t.recording && t.recording.title) || '', durationMs: t.length || (t.recording && t.recording.length) || 0, section: media.length > 1 ? 'Disc ' + (mi + 1) : '' })));
  const li = (d['label-info'] || []).find(x => x && x.label && x.label.name);
  return { date: d.date || '', label: li ? li.label.name : '', cover: d['cover-art-archive'] && d['cover-art-archive'].front ? `https://coverartarchive.org/release/${id}/front-500` : '', tracks: pdTracks(tracks) };
}
async function pdFromSpotify(item) {
  const token = await getSpotifyToken(); if (!token) return { err: 'Spotify isn’t connected' };
  const clean = String(item.title).replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim();
  let { hit } = await spotifyAlbumSearchRaw(token, `album:${clean} artist:${item.artist}`);
  if (!hit) ({ hit } = await spotifyAlbumSearchRaw(token, `${item.artist} ${clean}`));
  if (!hit || !spotifyResultArtistMatches(hit, item.artist)) return { err: 'Not found' };
  const head = { headers: { 'Authorization': 'Bearer ' + token } }, res = await fetch(`https://api.spotify.com/v1/albums/${hit.id}`, head);
  if (!res.ok) return { err: 'Spotify answered ' + res.status };
  const a = await res.json(); let items = (a.tracks && a.tracks.items) || [], next = a.tracks && a.tracks.next;
  while (next && items.length < 400) { const r = await fetch(next, head); if (!r.ok) break; const j = await r.json(); items = items.concat(j.items || []); next = j.next; }
  const discs = new Set(items.map(t => t.disc_number || 1)).size;
  return { date: a.release_date || '', label: a.label || '', genre: (a.genres || []).join(', '), cover: (a.images && a.images[0] && a.images[0].url) || '',
    tracks: pdTracks(items.map(t => ({ title: t.name, durationMs: t.duration_ms, section: discs > 1 ? 'Disc ' + (t.disc_number || 1) : '' }))) };
}
async function pdFromItunes(item) {
  const hit = await findItunesAlbum(item, (u) => fetchWithTimeout(u)); if (!hit || !hit.collectionId) return { err: 'Not found' };
  return { date: String(hit.releaseDate || '').slice(0, 10), genre: hit.primaryGenreName || '', cover: String(hit.artworkUrl100 || '').replace(/100x100bb/, '600x600bb'), tracks: pdTracks(await tlItunesTracks(item.artist, item.title)) };
}
async function pdFromDiscogs(item) {
  const token = loadDiscogsToken(); if (!token) return { err: 'Add a token in ⚙ → Discogs API…' };
  const head = { headers: { 'Accept': 'application/json', 'Authorization': `Discogs token=${token}` } };
  const s = await fetch(`https://api.discogs.com/database/search?type=release&artist=${encodeURIComponent(item.artist)}&release_title=${encodeURIComponent(item.title)}&per_page=5`, head);
  if (!s.ok) return { err: s.status === 429 ? 'Discogs says slow down: try again in a minute' : 'Discogs answered ' + s.status };
  const hit = ((await s.json()).results || [])[0]; if (!hit) return { err: 'Not found' };
  let tracks = [];
  try { const r = await fetch(`https://api.discogs.com/releases/${hit.id}`, head); if (r.ok) tracks = ((await r.json()).tracklist || []).filter(t => !t.type_ || t.type_ === 'track').map(t => ({ title: t.title, durationMs: pdMs(t.duration) })); } catch (e) { /* the rest still counts */ }
  return { date: hit.year ? String(hit.year) : '', label: (hit.label || [])[0] || '', genre: [...new Set([].concat(hit.genre || [], hit.style || []))].join(', '), cover: hit.cover_image && !/spacer\.gif/.test(hit.cover_image) ? hit.cover_image : '', tracks: pdTracks(tracks) };
}
const PD_FETCH = { crate: pdFromCrate, rym: pdFromRym, mb: pdFromMb, sp: pdFromSpotify, it: pdFromItunes, dc: pdFromDiscogs };

// ----- the choices -----
function pdVal(k, f) { const d = pd.data[k]; if (!d || d.err || d.loading) return null; const v = d[f]; return f === 'tracks' ? (v && v.length ? v : null) : (v ? String(v) : null); }
function pdBase() { return pdVal(pd.pick.tracks, 'tracks') || pdVal('crate', 'tracks') || []; }
function pdLen(k, song, i, n) {                                          // a source's length for one song of the list in use: by title, else by place when both lists are as long
  const tr = pdVal(k, 'tracks'); if (!tr) return 0;
  const want = pdNorm(song.title), hit = tr.find(t => pdNorm(t.title) === want) || (tr.length === n ? tr[i] : null);
  return hit ? hit.durationMs || 0 : 0;
}
function pdDefaults() {                                                  // what you have, else the first source that has it (RYM first); a choice you made stays
  const order = PD_SRC.map(s => s[0]);
  PD_FIELDS.forEach(([f]) => { if (pd.touched.has(f)) return; pd.pick[f] = order.find(k => pdVal(k, f)) || 'crate'; });
  const base = pdBase();
  base.forEach((s, i) => { const key = 'len' + i; if (pd.touched.has(key)) return; pd.pick[key] = order.find(k => pdLen(k, s, i, base.length) > 0) || ''; });
}
function pdOpen(item) {
  if (!item) return;
  pd = { item, data: {}, pick: {}, touched: new Set(), busy: false };
  let ov = document.getElementById('pdOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'pdOverlay'; ov.className = 'del-overlay pd-overlay'; document.body.appendChild(ov);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) pdClose(); });
    ov.addEventListener('click', pdClick);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pd && !document.getElementById('pdOverlay').hidden) pdClose(); });
  }
  ov.hidden = false; PD_SRC.forEach(([k]) => { pd.data[k] = { loading: true }; });
  pdDraw();
  PD_SRC.forEach(([k]) => {
    const me = pd;
    PD_FETCH[k](item).then(d => d, e => ({ err: 'Couldn’t ask: ' + String((e && e.message) || e).slice(0, 80) })).then(d => { if (pd !== me) return; pd.data[k] = d || { err: 'Nothing' }; pdDefaults(); pdDraw(); });
  });
}
function pdClose() { const ov = document.getElementById('pdOverlay'); if (ov) ov.hidden = true; pd = null; }
function pdCell(k, f, html, on) { return html == null ? '<div class="pd-cell pd-none">not there</div>' : `<button type="button" class="pd-cell${on ? ' on' : ''}" data-pd-pick="${f}" data-pd-src="${k}"><span class="pd-dot"></span><span class="pd-v">${html}</span></button>`; }
function pdShow(k, f) {
  const v = pdVal(k, f); if (v == null) return null;
  if (f === 'cover') return `<img src="${escapeHtml(v)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  if (f === 'tracks') { const t = tlFormatTime(v.reduce((s, x) => s + (x.durationMs || 0), 0)); return `${v.length} song${v.length === 1 ? '' : 's'}${t ? ' · ' + t : ''}`; }
  return escapeHtml(v);
}
function pdDraw() {
  const ov = document.getElementById('pdOverlay'); if (!ov || !pd) return;
  const it = pd.item, cols = `grid-template-columns: 112px repeat(${PD_SRC.length}, minmax(96px, 1fr))`;
  const head = PD_SRC.map(([k, n]) => { const d = pd.data[k]; return `<div class="pd-hd"><div class="pd-hn"><span>${n}</span>${k !== 'crate' && !d.loading && !d.err ? `<button type="button" class="pd-all" data-pd-all="${k}">use all</button>` : ''}</div><div class="pd-hs${d.err ? ' pd-err' : ''}">${d.loading ? 'Looking…' : d.err ? escapeHtml(d.err) : k === 'crate' ? 'what you have now' : 'found'}</div></div>`; }).join('');
  const rel = PD_FIELDS.map(([f, n]) => `<div class="pd-row" style="${cols}"><div class="pd-l">${n}</div>${PD_SRC.map(([k]) => pd.data[k].loading ? '<div class="pd-cell pd-none">…</div>' : pdCell(k, f, pdShow(k, f), pd.pick[f] === k)).join('')}</div>`).join('');
  const base = pdBase();
  const songs = base.map((s, i) => `<div class="pd-row" style="${cols}"><div class="pd-l" title="${escapeHtml(s.title)}">${i + 1}. ${escapeHtml(s.title)}</div>${PD_SRC.map(([k]) => { if (pd.data[k].loading) return '<div class="pd-cell pd-none">…</div>'; const ms = pdLen(k, s, i, base.length); return pdCell(k, 'len' + i, ms ? tlFormatTime(ms) : null, pd.pick['len' + i] === k); }).join('')}</div>`).join('');
  const ch = pdChanges();
  ov.innerHTML = `<div class="pd-dialog" role="dialog" aria-modal="true" aria-labelledby="pdTitle">
    <div class="pd-top"><div><div class="pd-title" id="pdTitle">Pull details</div><div class="pd-sub">${escapeHtml(it.artist)} — ${escapeHtml(it.title)} · click what you want used for each detail</div></div><button type="button" class="pd-x" data-pd-close aria-label="Close">×</button></div>
    <div class="pd-body"><div class="pd-grid">
      <div class="pd-row pd-heads" style="${cols}"><div></div>${head}</div>
      <div class="pd-sec">Release</div>${rel}
      <div class="pd-sec">Songs · lengths${pd.pick.tracks && pd.pick.tracks !== 'crate' && pdVal(pd.pick.tracks, 'tracks') ? ` <span class="pd-note">(the tracklist from ${escapeHtml(PD_SRC.find(s => s[0] === pd.pick.tracks)[1])})</span>` : ''}</div>
      ${songs || '<div class="pd-empty">No songs yet: pick a tracklist above.</div>'}
    </div></div>
    <div class="pd-foot"><span class="pd-sum">${escapeHtml(ch.text)}</span><span class="pd-btns"><button type="button" class="chip-btn" data-pd-close>Cancel</button><button type="button" class="config-btn pd-go" data-pd-apply ${pd.busy ? 'disabled' : ''}>${pd.busy ? 'Applying…' : ch.n ? `Apply ${ch.n} change${ch.n === 1 ? '' : 's'}` : 'Nothing to change'}</button></span></div>
  </div>`;
}
function pdClick(e) {
  if (!pd) return;
  const b = e.target.closest('[data-pd-pick],[data-pd-all],[data-pd-close],[data-pd-apply]'); if (!b) return;
  if (b.hasAttribute('data-pd-close')) { pdClose(); return; }
  if (b.hasAttribute('data-pd-apply')) { pdApply(); return; }
  // "use all": everything that source has, except the tracklist when you already have one (the songs you have stay yours: only their lengths are taken)
  if (b.dataset.pdAll) { const k = b.dataset.pdAll; PD_FIELDS.forEach(([f]) => { if (pdVal(k, f) && !(f === 'tracks' && pdVal('crate', 'tracks'))) { pd.pick[f] = k; pd.touched.add(f); } }); pdDefaults(); const base = pdBase(); base.forEach((s, i) => { if (pdLen(k, s, i, base.length)) { pd.pick['len' + i] = k; pd.touched.add('len' + i); } }); pdDraw(); return; }
  const f = b.dataset.pdPick; pd.pick[f] = b.dataset.pdSrc; pd.touched.add(f);
  if (f === 'tracks') { [...pd.touched].filter(x => /^len\d/.test(x)).forEach(x => pd.touched.delete(x)); pdDefaults(); }          // another list: its songs' lengths are chosen afresh
  pdDraw();
}
function pdChanges() {                                                    // what Apply would write: only what differs from your crate
  const out = { fields: {}, rows: null, parts: [], n: 0, text: '' }; if (!pd) return out;
  const crate = pd.data.crate || {}, nameOf = (k) => (PD_SRC.find(s => s[0] === k) || [k, k])[1];
  [['cover', 'Cover', 'cover'], ['date', 'ReleaseDate', 'release date'], ['label', 'Label', 'label'], ['genre', 'Genre', 'genres']].forEach(([f, col, word]) => {
    const k = pd.pick[f], v = k && k !== 'crate' ? pdVal(k, f) : null;
    if (v != null && v !== String(crate[f] || '')) { out.fields[f] = { col, v, k }; out.parts.push(`${word} from ${nameOf(k)}`); out.n++; }
  });
  const base = pdBase(), fromCrate = pd.pick.tracks === 'crate' || !pdVal(pd.pick.tracks, 'tracks');
  let lens = 0; const by = {}, mine = new Map((crate.tracks || []).map(t => [pdNorm(t.title), t]));
  const rows = base.map((s, i) => {
    const k = pd.pick['len' + i], ms = k ? pdLen(k, s, i, base.length) : 0, now = s.durationMs || 0, had = mine.get(pdNorm(s.title));
    const r = fromCrate ? Object.assign({}, crate.tracks[i]) : { title: s.title, section: s.section || '', s: PD_TL_SRC[pd.pick.tracks] || 'lookup' };
    if (!fromCrate && had) Object.assign(r, { trackNumber: had.trackNumber, youtubeLink: had.youtubeLink, spotifyLink: had.spotifyLink });          // a song you already had keeps its links and its number (and so its ratings)
    r.durationMs = ms || now; if (ms && ms !== now) { lens++; by[nameOf(k)] = (by[nameOf(k)] || 0) + 1; }
    return r;
  });
  if (!fromCrate) { out.rows = rows; out.parts.push(`the tracklist from ${nameOf(pd.pick.tracks)}`); out.n++; }
  else if (lens) { out.rows = rows; out.n += lens; }
  if (lens) out.parts.push(`${lens} song length${lens === 1 ? '' : 's'} (${Object.entries(by).map(([s, n]) => `${n} from ${s}`).join(', ')})`);
  out.text = out.parts.length ? 'Will change: ' + out.parts.join(' · ') : 'Everything picked is what you have now.';
  return out;
}
async function pdApply() {
  if (!pd || pd.busy) return;
  const ch = pdChanges(), item = pd.item; if (!ch.n) { pdClose(); return; }
  pd.busy = true; pdDraw();
  try {
    const payload = { action: 'editAlbum', row: item.row }; let coverMissed = false;
    for (const [f, c] of Object.entries(ch.fields)) {
      if (f === 'cover' && !(await cxProbe(c.v))) { coverMissed = true; continue; }          // saved only if it loads from here (the deck shows a saved cover as it is)
      payload[c.col] = c.v;
    }
    if (Object.keys(payload).length > 2) {
      await postUpdate(payload);
      if (payload.Cover) item.cover = payload.Cover; if (payload.ReleaseDate) item.releaseDate = payload.ReleaseDate; if (payload.Label) item.label = payload.Label; if (payload.Genre) item.genre = payload.Genre;
    }
    if (ch.rows) await saveManualTracklist(item, ch.rows, true);
    pdClose(); rymRefreshViews(); scheduleCatalogSync();
    flashGlobalToast(`Updated “${item.title}”: ${ch.parts.join(', ')}.${coverMissed ? ' The cover couldn’t be loaded from here, so it was left as it was.' : ''}`);
  } catch (e) {
    if (pd) { pd.busy = false; pdDraw(); }
    flashGlobalToast('Couldn’t save: ' + String((e && e.message) || e));
  }
}
