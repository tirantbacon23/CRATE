// CRATE — (1.135.44) WHERE "ADD A RELEASE" SEARCHES. MusicBrainz is slow or busy at times, so the search also asks other places at the same time
// and shows each as it answers, in its own section: Apple Music (no account needed), Spotify (when connected in Settings) and Discogs (when its
// token is set). Which ones are used is picked with the chips above the results ("Search:"), kept on this device. A source that doesn't answer
// says so with a Retry for that source alone; the others are unaffected. An album already listed by an earlier section isn't repeated.
// Rate Your Music has no public way to search it, so it isn't here: the add-on's "Send to CRATE" on a RYM page is the way to add from RYM.
const ADD_SRC = [['mb', 'MusicBrainz'], ['it', 'Apple Music'], ['sp', 'Spotify'], ['dg', 'Discogs']];
const ADD_SRC_KEY = 'crate_add_sources_v1';
function addSrcPrefs() { let o = {}; try { o = JSON.parse(localStorage.getItem(ADD_SRC_KEY) || '{}') || {}; } catch (e) { o = {}; } return Object.assign({ mb: true, it: true, sp: true, dg: true }, o); }
function addSrcSet(k, on) { const o = addSrcPrefs(); o[k] = on; try { localStorage.setItem(ADD_SRC_KEY, JSON.stringify(o)); } catch (e) { /* this visit */ } }
function addSrcReady(k) {                                            // '' when it can be used, else why not
  if (k === 'sp') { const c = typeof loadSpotifyCreds === 'function' ? loadSpotifyCreds() : {}; return c && c.clientId && c.clientSecret ? '' : 'Connect Spotify in ⚙ Settings to search it'; }
  if (k === 'dg') return typeof loadDiscogsToken === 'function' && loadDiscogsToken() ? '' : 'Add a Discogs token (⚙ → Discogs) to search it';
  return '';
}
function addSrcActive() { const p = addSrcPrefs(); return ADD_SRC.map(s => s[0]).filter(k => p[k] && !addSrcReady(k)); }

// ----- each source -> [{ src, title, artist, date, type, label, catalog, genre, cover, link, format }] -----
const addSrcType = (t) => { const s = String(t || '').toLowerCase(); return s === 'single' ? 'Single' : s === 'ep' ? 'EP' : s === 'compilation' ? 'Compilation' : 'Album'; };
async function addSrcItunes(q) {
  const res = await fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=20`, {}, 9000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return ((await res.json()).results || []).map(r => {
    const m = /^(.*?)\s+-\s+(Single|EP)$/i.exec(r.collectionName || '');
    return { src: 'it', title: m ? m[1] : (r.collectionName || ''), artist: r.artistName || '', date: String(r.releaseDate || '').slice(0, 10), type: m ? addSrcType(m[2]) : 'Album', genre: r.primaryGenreName || '', cover: String(r.artworkUrl100 || '').replace(/100x100bb/, '600x600bb'), link: r.collectionViewUrl || '', label: '', catalog: '' };
  });
}
async function addSrcSpotify(q) {
  const token = await getSpotifyToken(); if (!token) throw new Error('not connected');
  const res = await fetchWithTimeout(`https://api.spotify.com/v1/search?type=album&limit=15&q=${encodeURIComponent(q)}`, { headers: { 'Authorization': 'Bearer ' + token } }, 9000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (((await res.json()).albums || {}).items || []).filter(Boolean).map(a => ({ src: 'sp', title: a.name || '', artist: (a.artists || []).map(x => x.name).join(', '), date: a.release_date || '', type: addSrcType(a.album_type), cover: (a.images && a.images[0] && a.images[0].url) || '', link: (a.external_urls && a.external_urls.spotify) || '', genre: '', label: '', catalog: '' }));
}
async function addSrcDiscogs(q) {
  const tok = loadDiscogsToken(); if (!tok) throw new Error('no token');
  const cat = typeof looksLikeCatno === 'function' && looksLikeCatno(q), cm = /(?:^|\s)(?:catalog|catno|cat):("[^"]+"|\S+)/i.exec(q);          // (1.135.99) a catalogue number: Discogs' own catno search
  const qs = cm ? `catno=${encodeURIComponent(cm[1].replace(/"/g, ''))}` : cat ? `catno=${encodeURIComponent(q.trim())}` : `q=${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(`https://api.discogs.com/database/search?type=release&per_page=25&${qs}`, { headers: { 'Authorization': 'Discogs token=' + tok } }, 9000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const seen = new Set();
  return ((await res.json()).results || []).filter(r => { const k = r.master_id || r.id; if (seen.has(k)) return false; seen.add(k); return true; }).map(r => {
    const m = /^(.+?)\s+-\s+(.+)$/.exec(r.title || ''), fm = (r.format || []).map(String);
    const type = fm.some(f => /^single$/i.test(f)) ? 'Single' : fm.some(f => /^EP$/i.test(f)) ? 'EP' : fm.some(f => /compilation/i.test(f)) ? 'Compilation' : 'Album';
    const fmt = fm.includes('Vinyl') ? (fm.some(f => /7"/.test(f)) ? 'Vinyl 7"' : fm.some(f => /10"/.test(f)) ? 'Vinyl 10"' : fm.some(f => /12"/.test(f)) && !fm.includes('LP') ? 'Vinyl 12"' : 'Vinyl LP') : fm.includes('CD') ? 'CD' : fm.includes('Cassette') ? 'Cassette' : '';
    return { src: 'dg', title: m ? m[2] : (r.title || ''), artist: m ? (typeof dgArtist === 'function' ? dgArtist(m[1]) : m[1]) : '', date: String(r.year || ''), type, label: ((r.label || [])[0] || '').replace(/\s*\(\d+\)$/, ''), catalog: r.catno && !/^none$/i.test(r.catno) ? r.catno : '', genre: (r.style || r.genre || []).slice(0, 3).join(', '), cover: r.cover_image || r.thumb || '', link: r.uri ? 'https://www.discogs.com' + r.uri : '', format: fmt };
  });
}
const ADD_SRC_FN = { it: addSrcItunes, sp: addSrcSpotify, dg: addSrcDiscogs };

// One row like MusicBrainz's (same look, same "In your crate" mark), with the source named; picking it fills the form.
function addSrcRow(r) {
  const row = document.createElement('div'); row.className = state.releaseSearchGridView ? 'add-result-card' : 'add-result-row';
  const y = String(r.date || '').slice(0, 4), chip = typeof dupChipHtml === 'function' ? dupChipHtml(r.artist, r.title, r.catalog, r.date) : '';
  const name = (ADD_SRC.find(s => s[0] === r.src) || [])[1] || '';
  const img = `<img src="${escapeHtml(r.cover || '')}" alt="" class="${state.releaseSearchGridView ? 'add-thumb-grid' : 'add-thumb'}" loading="lazy" onerror="this.style.visibility='hidden'">`;
  row.innerHTML = state.releaseSearchGridView
    ? `${img}<p class="add-result-card-title">${escapeHtml(r.title)}${chip}</p><p class="add-result-card-sub">${escapeHtml(r.artist)}${y ? ' · ' + y : ''}</p>`
    : `${img}<div class="add-result-text"><p class="add-result-title">${escapeHtml(r.title)}${r.catalog ? ` <span style="color:var(--text-dim);font-weight:normal;">[${escapeHtml(r.catalog)}]</span>` : ''}${chip}</p><p class="add-result-artist">${escapeHtml(r.artist)}<span class="add-result-year">${y ? ' · ' + y : ''}</span>${r.type && r.type !== 'Album' ? ' · ' + escapeHtml(r.type) : ''}${r.label ? ' · ' + escapeHtml(r.label) : ''}${r.format ? ' · ' + escapeHtml(r.format) : ''}${r.genre ? ' · ' + escapeHtml(r.genre) : ''} <span class="add-src-chip">${escapeHtml(name)}</span></p></div>`;
  row.addEventListener('click', () => showAddForm({ artist: r.artist, title: r.title, type: r.type, releaseDate: r.date, genre: r.genre, label: r.label, catalog: r.catalog, cover: r.cover, link: r.link, format: r.format || '' }));
  return row;
}

// The sections of the results: one per source in use, each filled as it answers. MusicBrainz's rows come from doAddSearch (its own builder).
function addSrcSections() {
  const act = addSrcActive();
  el.addResults.innerHTML = act.map(k => `<div class="add-src-sec" data-src="${k}"><div class="add-src-head"><span>${escapeHtml(ADD_SRC.find(s => s[0] === k)[1])}</span><span class="add-src-state">Searching…</span></div><div class="add-src-body"></div></div>`).join('')
    + (act.length ? '' : '<p class="tracklist-status">No sources picked: choose one above.</p>');
  return act;
}
function addSrcSec(k) { return el.addResults.querySelector(`.add-src-sec[data-src="${k}"]`); }
function addSrcSay(k, text, retry) {
  const sec = addSrcSec(k); if (!sec) return; const st = sec.querySelector('.add-src-state'); st.textContent = text;
  if (retry) { const b = document.createElement('button'); b.type = 'button'; b.className = 'add-src-retry'; b.textContent = 'Retry'; b.addEventListener('click', (e) => { e.stopPropagation(); retry(); }); st.append(' ', b); }
}
// Albums already shown (artist + title), so a later source doesn't list them again
function addSrcSeenKeys() { const s = new Set(); el.addResults.querySelectorAll('[data-dup-key]').forEach(r => s.add(r.dataset.dupKey)); return s; }
async function addSrcRun(k, q, mySeq) {
  addSrcSay(k, 'Searching…');
  try {
    const list = await ADD_SRC_FN[k](q); if (mySeq !== addSearchSeq) return;
    const sec = addSrcSec(k); if (!sec) return; const body = sec.querySelector('.add-src-body'); body.innerHTML = '';
    const seen = addSrcSeenKeys(); let shown = 0, dup = 0;
    list.forEach(r => { const key = dupKey(r.artist, r.title); if (key && seen.has(key)) { dup++; return; } if (key) seen.add(key); const row = addSrcRow(r); if (key) row.dataset.dupKey = key; body.appendChild(row); shown++; });
    addSrcSay(k, shown ? `${shown} found${dup ? ` · ${dup} already listed above` : ''}` : list.length ? 'only ones already listed above' : 'nothing found');
    if (typeof addHideOwnedApply === 'function') addHideOwnedApply();
  } catch (e) {
    if (mySeq !== addSearchSeq) return;
    addSrcSay(k, `didn’t answer (${(e && e.name === 'AbortError') ? 'timed out' : (e && e.message) || 'error'})`, () => addSrcRun(k, q, addSearchSeq));
  }
}
// The "Search:" chips above the results
function addSrcChipsRender() {
  let bar = document.getElementById('addSrcBar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'addSrcBar'; bar.className = 'add-src-bar'; const tb = document.querySelector('#addOverlay .add-results-toolbar'); if (!tb) return; tb.parentNode.insertBefore(bar, tb);
    bar.addEventListener('click', (e) => { const b = e.target.closest('[data-add-src]'); if (!b || b.disabled) return; addSrcSet(b.dataset.addSrc, b.getAttribute('aria-pressed') !== 'true'); addSrcChipsRender(); if (el.addSearchInput.value.trim().length >= 2) doAddSearch(); }); }
  const p = addSrcPrefs();
  bar.innerHTML = '<span class="add-src-lbl">Search:</span>' + ADD_SRC.map(([k, n]) => { const why = addSrcReady(k); return `<button type="button" class="add-src-toggle" data-add-src="${k}" aria-pressed="${!!p[k] && !why}"${why ? ` disabled title="${escapeHtml(why)}"` : ''}>${escapeHtml(n)}</button>`; }).join('');
}
