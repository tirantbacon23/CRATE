// (1.135.182) Add a release: paste a link, or add several at once (canvas: CRATE adding a release, boards A and D).
// A link in the search box is read instead of searched for: MusicBrainz (the release itself, or a release group's pressings), Spotify
// and Apple Music (their album, filled in whole), Rate Your Music, Bandcamp, Discogs and Last.fm (artist and title from the link, searched,
// and the link kept for the release). Pasting several lines (or a list in "Add several") opens Add several: one release per line
// ("Artist – Title", "Title by Artist", or a link), each looked up on MusicBrainz (its earliest release), ones you already have marked
// and left unticked; Add N adds them all at once, each then gets its RYM update and its songs matched, and the card shows how far each got.
const apx = { pending: null, busy: false, rows: [] };
const apxDeslug = (s) => decodeURIComponent(String(s || '')).replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
function apxIsUrl(s) { return /^(https?:\/\/)?([a-z0-9-]+\.)*(musicbrainz\.org|spotify\.com|music\.apple\.com|itunes\.apple\.com|rateyourmusic\.com|bandcamp\.com|discogs\.com|last\.fm|lastfm\.[a-z.]+)\//i.test(String(s || '').trim()); }
// what a link says: { kind: 'prefill', p } (everything known) | { kind: 'rg', rgId } | { kind: 'mbrel', id } | { kind: 'q', q, keep }
async function apxRead(url) {
  let u; try { u = new URL(/^https?:/i.test(url) ? url : 'https://' + url); } catch (e) { return null; }
  const h = u.hostname.replace(/^www\./, ''), seg = u.pathname.split('/').filter(Boolean);
  if (/musicbrainz\.org$/.test(h)) { const i = seg.findIndex(x => x === 'release' || x === 'release-group'); if (i >= 0 && seg[i + 1]) return seg[i] === 'release' ? { kind: 'mbrel', id: seg[i + 1] } : { kind: 'rg', rgId: seg[i + 1] }; }
  if (/spotify\.com$/.test(h)) {
    const i = seg.indexOf('album'); const id = i >= 0 ? seg[i + 1] : '';
    if (id) {
      try { const tok = typeof getSpotifyToken === 'function' ? await getSpotifyToken() : null;
        if (tok) { const r = await fetch(`https://api.spotify.com/v1/albums/${id}`, { headers: { Authorization: 'Bearer ' + tok } }); if (r.ok) { const a = await r.json();
          return { kind: 'prefill', p: { artist: (a.artists || []).map(x => x.name).join(', '), title: a.name || '', type: a.album_type === 'single' ? (a.total_tracks > 3 ? 'EP' : 'Single') : a.album_type === 'compilation' ? 'Compilation' : 'Album', releaseDate: a.release_date || '', label: a.label || '', cover: ((a.images || [])[0] || {}).url || '', link: `https://open.spotify.com/album/${id}` } }; } } } catch (e) { /* the title from its page then */ }
      try { const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(u.href)}`); if (r.ok) { const o = await r.json(); if (o.title) return { kind: 'q', q: o.title, keep: { link: u.href } }; } } catch (e) { /* not read */ }
    }
  }
  if (/apple\.com$/.test(h)) {
    const id = (seg[seg.length - 1] || '').replace(/^id/, '');
    if (/^\d+$/.test(id)) { try { const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=album`); if (r.ok) { const j = await r.json(), a = (j.results || []).find(x => x.collectionId) || null;
      if (a) return { kind: 'prefill', p: { artist: a.artistName || '', title: String(a.collectionName || '').replace(/\s*-\s*(EP|Single)$/i, ''), type: /- EP$/i.test(a.collectionName || '') ? 'EP' : /- Single$/i.test(a.collectionName || '') ? 'Single' : 'Album', releaseDate: String(a.releaseDate || '').slice(0, 10), genre: a.primaryGenreName || '', cover: String(a.artworkUrl100 || '').replace('100x100', '600x600'), link: u.href } }; } } catch (e) { /* the title from the link then */ } }
    const i = seg.indexOf('album'); if (i >= 0 && seg[i + 1] && !/^\d+$/.test(seg[i + 1])) return { kind: 'q', q: apxDeslug(seg[i + 1]), keep: { link: u.href } };
  }
  if (/rateyourmusic\.com$/.test(h) && seg[0] === 'release' && seg[2] && seg[3]) return { kind: 'q', q: `${apxDeslug(seg[2])} ${apxDeslug(seg[3])}`, keep: { rymLink: `https://rateyourmusic.com/${seg.slice(0, 4).join('/')}/` }, type: { ep: 'EP', single: 'Single', comp: 'Compilation', album: 'Album' }[seg[1]] };
  if (/bandcamp\.com$/.test(h) && seg[0] === 'album' && seg[1]) return { kind: 'q', q: `${apxDeslug(h.replace(/\.bandcamp\.com$/, ''))} ${apxDeslug(seg[1])}`, keep: { link: u.href.split('?')[0] } };
  if (/discogs\.com$/.test(h)) { const i = seg.findIndex(x => x === 'release' || x === 'master'); let slug = i > 0 ? seg[i - 1] : seg[i + 1] || ''; slug = slug.replace(/^\d+-/, ''); if (slug && !/^\d+$/.test(slug)) return { kind: 'q', q: apxDeslug(slug), keep: { link: u.href.split('?')[0] } }; }
  if (/last\.?fm/.test(h) && seg[0] === 'music' && seg[1] && seg[2] && seg[2] !== '_') return { kind: 'q', q: `${apxDeslug(seg[1])} ${apxDeslug(seg[2])}` };
  return null;
}
// a pending link's own address goes into the release picked from its search (its RYM link, or its Link), unless the form already has one
function apxKeepFill() { const k = apx.pending; if (!k) return; const set = (id, v) => { const f = document.getElementById(id); if (f && v && !String(f.value || '').trim()) f.value = v; }; set('addRymLink', k.rymLink); set('addLink', k.link); }
async function apxGo(url) {
  const say = (t) => { el.addResults.innerHTML = `<p class="tracklist-status">${escapeHtml(t)}</p>`; };
  say('Reading the link\u2026'); apx.pending = null;
  const r = await apxRead(url);
  if (!r) { say('That link can\u2019t be read: search by artist and title instead.'); return; }
  if (r.kind === 'rg') { openAddModalForReleaseGroup({ rgId: r.rgId }); return; }
  if (r.kind === 'mbrel') {
    try { const res = await mbFetch(`https://musicbrainz.org/ws/2/release/${r.id}?inc=artist-credits+labels+release-groups+genres+tags&fmt=json`, { headers: { Accept: 'application/json' }, timeoutMs: 9000, retryBusy: 2 }); if (!res.ok) throw new Error('HTTP ' + res.status);
      const hit = await res.json(); el.addResults.innerHTML = ''; const row = buildReleaseResultRow(hit, {}); el.addResults.appendChild(row); row.click(); return; }
    catch (e) { say('MusicBrainz didn\u2019t answer: try again in a moment.'); return; }
  }
  if (r.kind === 'prefill') { apx.pending = { link: r.p.link }; el.addSearchInput.value = `${r.p.artist} ${r.p.title}`.trim(); apx.quiet = true; doAddSearch(); apx.quiet = false; showAddForm(r.p); apxKeepFill(); return; }
  apx.pending = r.keep || null; el.addSearchInput.value = r.q; apx.quiet = true; doAddSearch(); apx.quiet = false;
}
(function () {
  if (typeof doAddSearch === 'function') { const base = doAddSearch; doAddSearch = function () { const v = el.addSearchInput.value.trim(); if (!apx.quiet && apxIsUrl(v)) { apxGo(v); return; } if (!apx.quiet) apx.pending = null; return base.apply(this, arguments); }; }
  if (typeof showAddForm === 'function') { const base = showAddForm; showAddForm = function () { const r = base.apply(this, arguments); setTimeout(apxKeepFill, 0); return r; }; }
  // several lines pasted into the search: Add several
  document.addEventListener('paste', (e) => { if (e.target !== el.addSearchInput) return; const t = (e.clipboardData && e.clipboardData.getData('text')) || ''; if (t.split(/\r?\n/).filter(x => x.trim()).length < 2) return; e.preventDefault(); abOpen(t); });
  // a way in: "or add several at once" under the search box
  const row = el.addSearchInput && el.addSearchInput.closest('.add-search-row');
  if (row) { const a = document.createElement('div'); a.className = 'apx-hint'; a.innerHTML = 'Artist and title, or paste a link (RYM, Spotify, Apple Music, Bandcamp, Discogs, MusicBrainz) \u00b7 <button type="button" data-ab-open>add several at once</button>'; row.insertAdjacentElement('afterend', a);
    a.querySelector('[data-ab-open]').addEventListener('click', () => abOpen(''));
    el.addSearchInput.placeholder = 'Artist and title, or a link\u2026'; }
})();

// ----- Add several -----
function abParse(line) {
  const s = String(line || '').trim().replace(/^\s*(\d+[.)]|[-*•])\s+/, ''); if (!s) return null;
  if (apxIsUrl(s)) return { line: s, url: s };
  let m = s.split(/\s+[\u2013\u2014-]\s+|\t/); if (m.length >= 2) return { line: s, artist: m[0].trim(), title: m.slice(1).join(' - ').trim() };
  m = s.match(/^(.+?)\s+by\s+(.+)$/i); if (m) return { line: s, artist: m[2].trim(), title: m[1].trim() };
  return { line: s, q: s };
}
async function abFind(x) {          // a line → the release on MusicBrainz (its release group: first release date, type), or why not
  let keep = {};
  if (x.url) { const r = await apxRead(x.url); if (!r) return { st: 'none', why: 'link not readable' };
    if (r.kind === 'prefill') return { st: 'ok', p: r.p };
    if (r.kind === 'q') { x.q = r.q; keep = r.keep || {}; } else if (r.kind === 'rg') x.rgId = r.rgId; else if (r.kind === 'mbrel') x.relId = r.id; }
  const esc = (v) => String(v || '').replace(/["\\]/g, '\\$&');
  const query = x.rgId ? `rgid:${x.rgId}` : x.artist ? `artist:"${esc(x.artist)}" AND releasegroup:"${esc(x.title)}"` : esc(x.q || x.line);
  try {
    const res = await mbFetch(`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=5`, { headers: { Accept: 'application/json' }, timeoutMs: 9000, retryBusy: 2 });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json(), g = (j['release-groups'] || []).filter(r => (r.score || 0) >= 70).sort((a, b) => (b.score || 0) - (a.score || 0) || (a['primary-type'] === 'Album' ? -1 : 1))[0];
    if (!g) return { st: 'none', why: 'not found on MusicBrainz' };
    const artist = (g['artist-credit'] || []).map(a => a.name + (a.joinphrase || '')).join('') || x.artist || '';
    return { st: 'ok', p: Object.assign({ artist, title: g.title, type: g['primary-type'] === 'Album' || !g['primary-type'] ? 'Album' : g['primary-type'], releaseDate: g['first-release-date'] || '', cover: `https://coverartarchive.org/release-group/${g.id}/front-250`, link: `https://musicbrainz.org/release-group/${g.id}`, genre: ((g.tags || []).sort((a, b) => (b.count || 0) - (a.count || 0))[0] || {}).name || '' }, keep.rymLink ? { rymLink: keep.rymLink } : {}, keep.link ? { link: keep.link } : {}) };
  } catch (e) { return { st: 'err', why: 'MusicBrainz didn\u2019t answer' }; }
}
function abOwned(p) { try { const v = dupVerdict(dupMatches({ artist: p.artist, title: p.title, descriptor: '', catalog: '', releaseDate: p.releaseDate || '' })); return v === 'exact' || v === 'edition'; } catch (e) { return false; } }
function abOpen(text) {
  let ov = document.getElementById('abOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'abOverlay'; ov.className = 'pt-overlay ab-overlay'; document.body.appendChild(ov);
    ov.innerHTML = `<div class="pt-dialog ab-dialog" role="dialog" aria-modal="true" aria-labelledby="abTitle"><div class="ab-left"><div class="ab-head"><h2 id="abTitle">Add several</h2></div>
      <label for="abText" class="gs-s">One per line: Artist \u2013 Title, Title by Artist, or a link (RYM, Spotify, Apple Music, Bandcamp, Discogs, MusicBrainz).</label>
      <textarea id="abText" spellcheck="false" placeholder="Pere Ubu \u2013 Dub Housing&#10;Wire \u2013 Pink Flag&#10;https://rateyourmusic.com/release/album/\u2026"></textarea>
      <div class="ab-go"><button type="button" class="gs-btn" data-ab="look">Look them up</button><span class="gs-s" id="abCount"></span></div></div>
      <div class="ab-right"><div class="ab-rhead"><b id="abSum">Nothing looked up yet</b><button type="button" class="mood-x" data-ab="x" aria-label="Close">\u00d7</button></div><div id="abList" class="ab-list"></div>
      <div class="ab-add"><button type="button" class="gs-btn gs-pri" data-ab="add" disabled>Add</button><span class="gs-s">each gets its RYM update, then its songs matched</span></div></div></div>`;
    ov.addEventListener('click', abClick); ov.addEventListener('change', (e) => { if (e.target.matches('[data-ab-i]')) { const r = apx.rows[Number(e.target.dataset.abI)]; if (r) r.on = e.target.checked; abPaint(); } });
    ov.querySelector('#abText').addEventListener('input', () => abCount());
    document.addEventListener('keydown', (e) => { const o = document.getElementById('abOverlay'); if (e.key === 'Escape' && o && !o.hidden && !apx.busy) { e.stopImmediatePropagation(); o.hidden = true; } }, true);
  }
  ov.hidden = false; if (text) { ov.querySelector('#abText').value = text; abCount(); abLook(); } else { abCount(); setTimeout(() => ov.querySelector('#abText').focus(), 0); }
}
function abCount() { const n = document.getElementById('abText').value.split(/\r?\n/).filter(x => x.trim()).length; document.getElementById('abCount').textContent = n ? `${n} line${n === 1 ? '' : 's'}` : ''; }
async function abLook() {
  if (apx.busy) return; const lines = document.getElementById('abText').value.split(/\r?\n/).map(abParse).filter(Boolean).slice(0, 60); if (!lines.length) return;
  apx.busy = true; apx.rows = lines.map(x => ({ x, st: 'look', on: false })); abPaint();
  for (const r of apx.rows) {
    const f = await abFind(r.x); Object.assign(r, f); if (r.st === 'ok') { r.have = abOwned(r.p); r.on = !r.have; }
    abPaint();
  }
  apx.busy = false; abPaint();
}
function abPaint() {
  const list = document.getElementById('abList'); if (!list) return;
  const ok = apx.rows.filter(r => r.st === 'ok'), on = apx.rows.filter(r => r.on && r.st === 'ok'), have = ok.filter(r => r.have).length, none = apx.rows.filter(r => r.st === 'none' || r.st === 'err').length, looking = apx.rows.filter(r => r.st === 'look').length;
  document.getElementById('abSum').textContent = apx.rows.length ? `${on.length} to add${have ? ` \u00b7 ${have} you have` : ''}${none ? ` \u00b7 ${none} not found` : ''}${looking ? ` \u00b7 looking up ${looking}\u2026` : ''}` : 'Nothing looked up yet';
  list.innerHTML = apx.rows.map((r, i) => {
    if (r.st === 'look') return `<div class="ab-row ab-dim"><span></span><span class="ab-cv"></span><span><b>${escapeHtml(r.x.line)}</b><em>looking up\u2026</em></span><span></span></div>`;
    if (r.st !== 'ok') return `<div class="ab-row ab-dim"><span></span><span class="ab-cv"></span><span><b>${escapeHtml(r.x.line)}</b><em>${escapeHtml(r.why || 'not found')}</em></span><button type="button" class="ab-find" data-ab="find" data-i="${i}">Search it</button></div>`;
    const p = r.p; return `<label class="ab-row${r.have ? ' ab-have' : ''}"><input type="checkbox" data-ab-i="${i}"${r.on ? ' checked' : ''} aria-label="${escapeHtml(p.title)}"><img class="ab-cv" src="${escapeHtml(p.cover || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span><b>${escapeHtml(p.title)}</b><em>${escapeHtml(p.artist)}${p.releaseDate ? ' \u00b7 ' + escapeHtml(String(p.releaseDate).slice(0, 4)) : ''}${p.type ? ' \u00b7 ' + escapeHtml(p.type) : ''}</em></span>${r.have ? '<span class="ab-pill">HAVE IT</span>' : '<span></span>'}</label>`;
  }).join('');
  const b = document.querySelector('#abOverlay [data-ab="add"]'); b.disabled = !on.length || apx.busy; b.textContent = `Add ${on.length || ''} release${on.length === 1 ? '' : 's'}`.replace('  ', ' ');
}
async function abClick(e) {
  const ov = document.getElementById('abOverlay'); if (e.target === ov || e.target.closest('[data-ab="x"]')) { if (!apx.busy) ov.hidden = true; return; }
  const b = e.target.closest('[data-ab]'); if (!b || b.disabled) return; const k = b.dataset.ab;
  if (k === 'look') abLook();
  else if (k === 'find') { const r = apx.rows[Number(b.dataset.i)]; ov.hidden = true; openAddModalSearch(r.x.artist ? `${r.x.artist} ${r.x.title}` : (r.x.q || r.x.line)); }
  else if (k === 'add') {
    const want = apx.rows.filter(r => r.on && r.st === 'ok'); if (!want.length) return;
    apx.busy = true; b.disabled = true; b.textContent = 'Adding\u2026';
    try {
      const list = want.map(r => ({ Artist: r.p.artist, Title: r.p.title, Type: r.p.type || 'Album', ReleaseDate: r.p.releaseDate || '', Genre: r.p.genre ? r.p.genre.replace(/\b([a-z])/g, (m, c) => c.toUpperCase()) : '', Label: r.p.label || '', Cover: r.p.cover || '', Link: r.p.link || '', RymLink: r.p.rymLink || '' }));
      for (let i = 0; i < list.length; i += 25) await postUpdate({ action: 'addAlbums', albums: list.slice(i, i + 25) });
      ov.hidden = true; if (typeof closeAddModal === 'function' && !el.addOverlay.hidden) closeAddModal();
      flashGlobalToast(`Added ${list.length} release${list.length === 1 ? '' : 's'}: each gets its RYM update, then its songs matched.`);
      try { await fetchCatalog({ quiet: true }); } catch (er) { /* it arrives at the next refresh */ }
      apx.rows = []; document.getElementById('abText').value = '';
    } catch (er) { flashGlobalToast('Couldn\u2019t add them: ' + (er && er.message ? er.message : 'try again')); }
    apx.busy = false; abPaint();
  }
}
