// CRATE — (1.135.45) THE SEARCH BOX'S PANEL. As you type: your crate on the left and, beside it, releases you don't have yet from the sources Add a
// release uses (63-add-sources.js), each with its cover; refine chips across the top (type, decade, rating, not listened, format) that add or take
// off the same words you could type; the field filters already in the box as chips with ✕. With the box empty: recent searches, saved ones (★) and
// "Jump to" shortcuts. ⌘K / Ctrl+K goes to the box from anywhere.
// Two looks, picked in ⚙ Settings ("Search looks like") or with the switch at the bottom of the panel: Dropdown (the columns above) and Detail panel
// (a big panel: tabs, filters down the side, a grid of covers, then songs and artists). Both filter your crate as you type, as before.
const SRCH_DETAIL_KEY = 'crate_search_detail_v1', SRCH_RECENT_KEY = 'crate_search_recent_v1', SRCH_SAVED_KEY = 'crate_search_saved_v1';
const srchLs = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const srchLsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit */ } };
// (1.135.52) Three looks, in turn with ⊞: Simple (the suggestions as they always were) → Dropdown (your crate and releases to add online side by
// side, covers, refine chips, recent and saved searches) → Detailed (the big panel) → back to Simple. Also in ⚙ Settings → Search looks like.
const SRCH_LOOK_KEY = 'crate_search_look_v1', SRCH_LOOKS = ['simple', 'drop', 'detail'];
function srchLook() { const v = srchLs(SRCH_LOOK_KEY, null); if (SRCH_LOOKS.includes(v)) return v; return srchLs(SRCH_DETAIL_KEY, false) === true ? 'detail' : 'simple'; }
function srchDetail() { return srchLook() === 'detail'; }
function srchDetailBtnPaint() { const b = document.getElementById('searchDetailBtn'); if (!b) return; const lk = srchLook(), next = SRCH_LOOKS[(SRCH_LOOKS.indexOf(lk) + 1) % 3]; b.setAttribute('aria-pressed', String(lk !== 'simple')); b.classList.toggle('active', lk !== 'simple'); b.classList.toggle('srch-btn-detail', lk === 'detail'); b.title = `Search: ${({ simple: 'simple', drop: 'dropdown with online results', detail: 'detailed panel' })[lk]}. Press for the ${({ simple: 'simple suggestions', drop: 'dropdown with online results', detail: 'detailed panel' })[next]}.`; }
function srchLookSet(v) { if (!SRCH_LOOKS.includes(v)) v = 'simple'; srchLsSet(SRCH_LOOK_KEY, v); srchDetailBtnPaint(); document.querySelectorAll('[data-search-look]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.searchLook === v))); srch.tab = 'all'; ssUpdate(); }
function srchDetailSet(on) { srchLookSet(on ? 'detail' : 'simple'); }
const srch = { online: [], onlineState: 'idle', onlineNote: '', onlineQ: '', seq: 0, timer: 0, tab: 'all' };

// ----- covers -----
const SRCH_BLANK = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjMUIyMTJCIi8+PC9zdmc+';
function srchItemCover(it) { if (!it) return SRCH_BLANK; const c = state.artCache && state.artCache[artKey(it)]; return (c && c.art) || it.cover || (typeof placeholderArt === 'function' ? placeholderArt(it) : SRCH_BLANK); }
function srchItemByAT(artist, title) { return rawIndex('srchAT', r => smFold(r.artist) + '|' + smFold(r.title)).get(smFold(artist) + '|' + smFold(title)) || null; }
const srchImg = (src, cls) => `<img class="${cls || 'srch-cv'}" src="${escapeHtml(src || SRCH_BLANK)}" alt="" loading="lazy" onerror="this.src='${SRCH_BLANK}'">`;
const srchInitials = (n) => String(n || '?').replace(/^the\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();

// ----- the words in the box -----
const SRCH_TOKEN_RE = /(^|\s)(-?)([a-zA-Z]+):("[^"]*"|\S+)/g;
function srchTokens(q) { const out = []; let m; SRCH_TOKEN_RE.lastIndex = 0; while ((m = SRCH_TOKEN_RE.exec(q))) { const f = m[3].toLowerCase(); if (!SEARCH_FIELD_ALIASES[f]) continue; out.push({ at: m.index + m[1].length, len: m[0].length - m[1].length, neg: !!m[2], field: SEARCH_FIELD_ALIASES[f], raw: m[3], value: m[4].replace(/^"|"$/g, '') }); } return out; }
function srchFreeText(q) { return String(q || '').replace(SRCH_TOKEN_RE, ' ').replace(/\s+/g, ' ').trim(); }
function srchSetQuery(q) { const inp = el.searchInput; inp.value = q.replace(/\s+/g, ' ').replace(/^\s/, ''); inp.dispatchEvent(new Event('input')); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); ssUpdate(); }
function srchRemoveToken(i) { const q = el.searchInput.value, t = srchTokens(q)[i]; if (!t) return; srchSetQuery(q.slice(0, t.at) + q.slice(t.at + t.len)); }
// The refine chips: each is a word for the box; on = it's there
const SRCH_REFINE = [
  ['Albums', 'type:album'], ['EPs', 'type:ep'], ['Singles', 'type:single'], ['★ 4+', 'rating:>=4'], ['Not listened', 'listened:no'], ['Vinyl', 'format:vinyl'], ['CD', 'format:cd']
];
const SRCH_DECADES = ['1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020'];
function srchHas(word) { const [f, v] = word.split(':'); return srchTokens(el.searchInput.value).findIndex(t => t.field === SEARCH_FIELD_ALIASES[f] && t.value.toLowerCase() === v.toLowerCase() && !t.neg); }
function srchToggle(word) {
  const i = srchHas(word); if (i >= 0) { srchRemoveToken(i); return; }
  const f = SEARCH_FIELD_ALIASES[word.split(':')[0]], q = el.searchInput.value, ts = srchTokens(q), same = f === 'type' || f === 'year' ? ts.findIndex(t => t.field === f) : -1;          // one type, one decade at a time
  const base = same >= 0 ? q.slice(0, ts[same].at) + q.slice(ts[same].at + ts[same].len) : q;
  srchSetQuery((base.trim() + ' ' + word + ' ').replace(/^\s+/, ''));
}
function srchDecadeNow() { const t = srchTokens(el.searchInput.value).find(x => x.field === 'year' && /^\d{4}-\d{4}$/.test(x.value)); return t ? t.value.slice(0, 4) : ''; }
function srchDecade(d) { const q = el.searchInput.value, ts = srchTokens(q), i = ts.findIndex(t => t.field === 'year'); const base = i >= 0 ? q.slice(0, ts[i].at) + q.slice(ts[i].at + ts[i].len) : q; srchSetQuery(base.trim() + (d ? ` year:${d}-${+d + 9} ` : ' ')); }

// ----- recent and saved -----
function srchRemember(q) { q = String(q || '').trim(); if (q.length < 2) return; const l = srchLs(SRCH_RECENT_KEY, []).filter(x => x !== q); l.unshift(q); srchLsSet(SRCH_RECENT_KEY, l.slice(0, 8)); }
function srchSave() { const q = el.searchInput.value.trim(); if (!q) return; const l = srchLs(SRCH_SAVED_KEY, []).filter(x => x !== q); l.unshift(q); srchLsSet(SRCH_SAVED_KEY, l.slice(0, 20)); flashGlobalToast(`Saved “${q}”: it’s under Saved when the search box is empty.`); ssRender(); }
function srchUnsave(q) { srchLsSet(SRCH_SAVED_KEY, srchLs(SRCH_SAVED_KEY, []).filter(x => x !== q)); ssRender(); }
function srchCount(q) { try { const terms = mergeGenrePhrases(tokenizeSearchQuery(q.toLowerCase())); return state.raw.filter(r => matchesSearchTerms(r, terms)).length; } catch (e) { return 0; } }
const SRCH_JUMPS = [['Recently added', 'recent'], ['Not listened', 'q:listened:no'], ['Rated 4+', 'q:rating:>=4'], ['No RYM rating', 'q:rym:none'], ['Not updated from RYM', 'q:updated:never'], ['Random release', 'random']];
function srchJump(j) {
  if (j === 'recent') { el.searchInput.blur(); if (typeof recentOpen === 'function') setTimeout(recentOpen, 0); return; }
  if (j === 'random') { const l = state.filtered && state.filtered.length ? state.filtered : state.raw; const it = l[Math.floor(Math.random() * l.length)]; el.searchInput.blur(); if (it) openDeck(it); return; }
  srchSetQuery(j.slice(2) + ' ');
}

// ----- online: releases you don't have -----
// (1.135.88) The genres asked for (genre:indie rock, as one phrase) and the plain words, as the crate's own search reads them
function srchParts(raw) {
  let terms = []; try { terms = mergeGenrePhrases(tokenizeSearchQuery(String(raw || '').toLowerCase())); } catch (e) { terms = []; }
  const genres = terms.filter(t => !t.negate && t.value && t.field && SEARCH_FIELD_ALIASES[t.field.toLowerCase()] === 'genre').map(t => t.value.trim()).filter(Boolean);
  const text = terms.filter(t => !t.field && !t.negate && t.value).map(t => t.value).join(' ').trim();
  return { genres, text };
}
// Releases of a genre that aren't in the crate: Last.fm's most played albums with that tag (with your Last.fm key), then MusicBrainz's
// albums tagged with it; the plain words, when there are some, narrow both.
async function srchGenreOnline(genres, text) {
  const out = [], g = genres[0], words = smFold(text).split(' ').filter(Boolean), fits = (r) => !words.length || words.every(w => smFold(r.artist + ' ' + r.title).includes(w));
  const creds = typeof loadLastfmCreds === 'function' ? loadLastfmCreds() : {};
  const lf = creds.apiKey ? (async () => {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=tag.gettopalbums&tag=${encodeURIComponent(g)}&api_key=${encodeURIComponent(creds.apiKey)}&format=json&limit=40`);
    const j = await res.json(); if (j.error) throw new Error(j.message || 'Last.fm');
    return (((j.albums || {}).album) || []).map(a => ({ src: 'lf', title: a.name || '', artist: (a.artist && (a.artist.name || a.artist['#text'])) || '', date: '', type: 'Album', genre: genres.join(', '),
      cover: ((a.image || []).find(i => i.size === 'extralarge') || (a.image || []).slice(-1)[0] || {})['#text'] || '' })).filter(r => r.title && r.artist && fits(r));
  })().catch(() => null) : Promise.resolve(null);
  const mbq = genres.map(x => `tag:"${x.replace(/"/g, '')}"`).join(' AND ') + ' AND primarytype:album' + (text ? ` AND (${text.replace(/[()"]/g, ' ')})` : '');
  const mb = mbFetch(`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(mbq)}&fmt=json&limit=25`, { headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }, timeoutMs: 9000, retryBusy: 1 })
    .then(async res => { if (!res.ok) throw new Error('HTTP ' + res.status); return ((await res.json())['release-groups'] || []).map(h => ({ src: 'mbg', title: h.title || '', artist: (h['artist-credit'] || []).map(a => a.name + (a.joinphrase || '')).join(''), date: h['first-release-date'] || '', type: h['primary-type'] || 'Album', genre: genres.join(', '), cover: h.id ? `https://coverartarchive.org/release-group/${h.id}/front-250` : '' })); })
    .catch(() => null);
  const [a, b] = await Promise.all([lf, mb]);
  if (!a && !b) return null;
  return out.concat(a || [], b || []);
}
function srchOnlineSearch() {
  const parts = srchParts(el.searchInput.value), q = parts.genres.length ? `genre:${parts.genres.join('+')} ${parts.text}`.trim() : srchFreeText(el.searchInput.value); clearTimeout(srch.timer);
  if (!parts.genres.length && q.length < 3) { srch.online = []; srch.onlineState = 'idle'; srch.onlineQ = ''; return; }
  if (q === srch.onlineQ && srch.onlineState !== 'error') return;
  srch.onlineState = 'loading'; const seq = ++srch.seq;
  srch.timer = setTimeout(async () => {
    srch.onlineQ = q;
    const act = typeof addSrcActive === 'function' ? addSrcActive() : ['mb'], hide = typeof addHideOwnedOn === 'function' ? addHideOwnedOn() : true;
    const mb = async () => {
      const res = await mbFetch(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(buildMbSearchQuery(q))}&fmt=json&limit=20&inc=labels`, { headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }, timeoutMs: 9000, retryBusy: 1 });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return ((await res.json()).releases || []).map(h => { const rg = h['release-group'] || {}; return { src: 'mb', hit: h, title: h.title || '', artist: (h['artist-credit'] || []).map(a => a.name + (a.joinphrase || '')).join(''), date: h.date || '', type: rg['primary-type'] || 'Album', catalog: ((h['label-info'] || [])[0] || {})['catalog-number'] || '', cover: rg.id ? `https://coverartarchive.org/release-group/${rg.id}/front-250` : '' }; });
    };
    const jobs = parts.genres.length ? [srchGenreOnline(parts.genres, parts.text)] : act.map(k => (k === 'mb' ? mb() : ADD_SRC_FN[k](q)).catch(() => null));
    const lists = await Promise.all(jobs); if (seq !== srch.seq) return;
    const seen = new Set(), out = []; let owned = 0, failed = 0;
    lists.forEach(l => { if (!l) { failed++; return; } l.forEach(r => { const k = dupKey(r.artist, r.title); if (!k || seen.has(k)) return; seen.add(k);
      const v = dupVerdict(dupMatches({ artist: r.artist, title: r.title, catalog: r.catalog || '', releaseDate: r.date || '', descriptor: '' }));
      if (v === 'exact' || v === 'edition') { owned++; if (hide) return; r.owned = true; } out.push(r); }); });
    srch.online = out.slice(0, 30); srch.onlineState = failed === lists.length ? 'error' : 'done';
    srch.onlineNote = srch.onlineState === 'error' ? 'No source answered.' : !out.length ? 'Nothing more found online.' : owned ? `${owned} you have left out` : '';
    const lfKey = typeof loadLastfmCreds === 'function' ? (loadLastfmCreds() || {}).apiKey : '';
    if (!lfKey && out.length) srch.onlineNote = (srch.onlineNote ? srch.onlineNote + ' · ' : '') + 'Add your Last.fm key (⚙ › Last.fm) to rank these by popularity';
    ssRender();
    if (lfKey && out.length) srchPopRank(seq, lfKey);
  }, 600);
}
function srchAddOnline(r) {
  el.searchInput.blur(); srchRemember(el.searchInput.value);
  if (r.src === 'mb' && r.hit) { openAddModal(); el.addSearchInput.value = srchFreeText(el.searchInput.value); const row = buildReleaseResultRow(r.hit, { drillToPressings: true }); el.addResults.appendChild(row); row.click(); return; }
  openAddModal(); showAddForm({ artist: r.artist, title: r.title, type: r.type, releaseDate: r.date, genre: r.genre || '', label: r.label || '', catalog: r.catalog || '', cover: r.cover || '', link: r.link || '', format: r.format || '' });
}

// ----- what can be moved to with the arrows (ssItems), and the panel -----
function srchSrcName(k) { if (k === 'lf') return 'Last.fm'; if (k === 'mbg') return 'MusicBrainz'; return ((typeof ADD_SRC !== 'undefined' ? ADD_SRC : []).find(s => s[0] === k) || [])[1] || ''; }
function srchCrateItems(q) {
  const items = ssSuggest(q).map(s => {
    if (s.kind === 'release') { const it = state.raw.find(r => String(r.row) === String(s.row)); return Object.assign(s, { col: 'crate', it, cover: srchItemCover(it) }); }
    if (s.kind === 'track') { const it = srchItemByAT(s.sub.split(' · ')[0], s.sub.split(' · ').slice(1).join(' · ')); return Object.assign(s, { col: 'crate', it, cover: it ? srchItemCover(it) : '' }); }
    return Object.assign(s, { col: 'crate' });
  });
  // a few of the releases your crate now shows (with covers) when the names matched fewer
  const have = new Set(items.filter(s => s.kind === 'release').map(s => String(s.row)));
  if (q.trim() && have.size < 4) (state.filtered || []).filter(it => !have.has(String(it.row))).slice(0, 4 - have.size).forEach(it => items.push({ kind: 'release', col: 'crate', it, row: it.row, label: it.title, sub: [it.artist, String(it.releaseDate || '').slice(0, 4)].filter(Boolean).join(' \u00b7 '), cover: srchItemCover(it) }));
  return items;
}
function srchOnlineItems() { return srch.online.slice(0, 6).map(r => ({ kind: 'online', col: 'online', r, label: r.title, sub: [r.artist, String(r.date || '').slice(0, 4), r.type && r.type !== 'Album' ? r.type : '', srchPopFmt(r.listeners) || srchSrcName(r.src)].filter(Boolean).join(' · '), cover: r.cover })); }

function srchItems() { const q = el.searchInput.value, lk = srchLook(); return lk === 'detail' ? srchDetailItems(q) : lk === 'drop' ? srchCrateItems(q).concat(srchOnlineItems()) : ssSuggest(q); }          // (simple: the suggestions as they always were)
function ssUpdate() { if (srchLook() !== 'simple') srchOnlineSearch(); ssActive = -1; ssRender(); }
// (1.135.46) The simple list, as before 1.135.42: what in your crate matches what's typed, by kind. At its foot, the switch to the detailed panel.
function srchSimpleHtml() {
  const kindName = { field: 'Field', artist: 'Artist', release: 'Release', track: 'Track', genre: 'Genre', descriptor: 'Descriptor', songdesc: 'Descriptor', label: 'Label', type: 'Type', title: 'Release' };
  return ssItems.map((s, i) => `<div class="ss-item ss-k-${s.kind}${i === ssActive ? ' on' : ''}" id="ss-${i}" role="option" aria-selected="${i === ssActive}" data-ss="${i}"><span class="ss-kind">${kindName[s.kind] || ''}</span><span class="ss-label">${escapeHtml(s.label)}</span><span class="ss-sub">${escapeHtml(String(s.sub || ''))}</span></div>`).join('')
    + `<div class="srch-simple-foot"><button type="button" class="srch-link" data-srch-look="drop" title="Your crate and releases to add from online, with covers, refine chips, recent and saved searches">\u2922 More search</button>${srchSongsBtn()}</div>`;
}

function srchRowHtml(s, i) {
  const on = i === ssActive ? ' on' : '';
  let lead = '';
  if (s.kind === 'artist') lead = `<span class="srch-badge">${escapeHtml(srchInitials(s.label))}</span>`;
  else if (s.kind === 'release' || s.kind === 'track' || s.kind === 'online') lead = srchImg(s.cover);
  else lead = `<span class="srch-glyph">${{ genre: '#', descriptor: '◇', label: '⌂', field: ':', type: '□' }[s.kind] || '•'}</span>`;
  const kind = { field: 'Field', artist: 'Artist', release: '', track: 'Song', genre: 'Genre', descriptor: 'Descriptor', label: 'Label', type: 'Type' }[s.kind];
  const tail = s.kind === 'online' ? `<span class="srch-add">${s.r.owned ? '✓ have' : '+ Add'}</span>` : s.kind === 'release' && s.it && s.it.format ? `<span class="srch-tag">${escapeHtml(formatShort(s.it.format))}</span>` : '';
  return `<div class="srch-row ss-k-${s.kind}${on}" id="ss-${i}" role="option" aria-selected="${!!on}" data-ss="${i}">${lead}<div class="srch-txt"><div class="srch-t">${escapeHtml(s.label)}</div><div class="srch-s">${kind ? `<span class="srch-kind">${kind}</span>` : ''}${escapeHtml(String(s.sub || ''))}</div></div>${tail}</div>`;
}
function srchChipsHtml() {
  const q = el.searchInput.value, ts = srchTokens(q), dec = srchDecadeNow();
  const active = ts.length ? `<div class="srch-active">${ts.map((t, i) => `<span class="srch-tok"><b>${t.neg ? 'NOT ' : ''}${escapeHtml(t.field.toUpperCase())}</b>${escapeHtml(t.value)}<button type="button" data-srch-untok="${i}" aria-label="Remove ${escapeHtml(t.field)} ${escapeHtml(t.value)}">✕</button></span>`).join('')}</div>` : '';
  const refine = `<div class="srch-refine"><span class="srch-lbl">Refine</span>${SRCH_REFINE.map(([l, w]) => `<button type="button" class="srch-chip${srchHas(w) >= 0 ? ' on' : ''}" data-srch-chip="${escapeHtml(w)}">${escapeHtml(l)}</button>`).join('')}<select class="srch-chip srch-dec${dec ? ' on' : ''}" data-srch-decade aria-label="Decade"><option value="">Decade</option>${SRCH_DECADES.map(d => `<option value="${d}"${d === dec ? ' selected' : ''}>${d}s</option>`).join('')}</select></div>`;
  return active + refine;
}
function srchSongsBtn() { const on = searchSongsOnly(); return `<button type="button" class="srch-link srch-songs${on ? ' on' : ''}" data-search-songs aria-pressed="${on}" title="Look for the words in song titles only, not whole releases">\u266a Songs only${on ? ': on' : ''}</button>`; }
function srchFootHtml() {
  const q = el.searchInput.value.trim(), det = srchDetail();
  return `<div class="srch-foot"><span>↑↓ move</span><span>⏎ open</span><span>Esc close</span>${srchSongsBtn()}${q ? `<button type="button" class="srch-link" data-srch-save>★ Save this search</button>` : ''}<button type="button" class="srch-link srch-look" data-srch-look="${det ? 'simple' : 'detail'}">${det ? '⤡ Simple search' : '⤢ Detailed search'}</button></div>`;
}
function srchEmptyHtml() {
  const rec = srchLs(SRCH_RECENT_KEY, []), sav = srchLs(SRCH_SAVED_KEY, []);
  const line = (q, kind) => `<div class="srch-row srch-q" data-srch-q="${escapeHtml(q)}"><span class="srch-glyph">${kind === 'saved' ? '★' : '↺'}</span><div class="srch-txt"><div class="srch-t">${escapeHtml(q)}</div>${kind === 'saved' ? `<div class="srch-s">${srchCount(q)} releases</div>` : ''}</div>${kind === 'saved' ? `<button type="button" class="srch-x" data-srch-unsave="${escapeHtml(q)}" aria-label="Remove saved search">✕</button>` : ''}</div>`;
  return `<div class="srch-empty">
    ${rec.length ? `<div class="srch-sec"><div class="srch-lbl">Recent</div>${rec.map(q => line(q, 'recent')).join('')}</div>` : ''}
    ${sav.length ? `<div class="srch-sec"><div class="srch-lbl">Saved</div>${sav.map(q => line(q, 'saved')).join('')}</div>` : ''}
    <div class="srch-sec"><div class="srch-lbl">Jump to</div><div class="srch-jumps">${SRCH_JUMPS.map(([l, j]) => `<button type="button" class="srch-chip" data-srch-jump="${escapeHtml(j)}">${escapeHtml(l)}</button>`).join('')}</div></div>
    <div class="srch-hint">Search your crate, and online for releases to add. Type a field to narrow it: genre:, year:, descriptor:, format:…</div>
  </div>`;
}
function srchOnlineStatus() {
  const pp = srchParts(el.searchInput.value);
  if (!pp.genres.length && (!srchFreeText(el.searchInput.value) || srchFreeText(el.searchInput.value).length < 3)) return 'Type an artist or album to look online.';
  if (pp.genres.length && srch.onlineState === 'done' && !srch.onlineNote) return `Releases tagged ${pp.genres.join(' + ')}${typeof loadLastfmCreds === 'function' && (loadLastfmCreds() || {}).apiKey ? ', most played on Last.fm first' : ''}.`;
  if (srch.onlineState === 'loading') return 'Looking…';
  if (srch.onlineState === 'error') return 'No source answered.';
  return srch.onlineNote;
}
function srchDropdownHtml() {
  const q = el.searchInput.value, crate = [], online = [];
  ssItems.forEach((s, i) => (s.col === 'online' ? online : crate).push(srchRowHtml(s, i)));
  const n = state.filtered ? state.filtered.length : 0, free = srchFreeText(q);
  return srchChipsHtml() + `<div class="srch-cols">
    <div class="srch-col"><div class="srch-lbl">In your crate${q.trim() ? ` · ${n}` : ''}</div>${crate.join('') || `<div class="srch-note">${q.trim() ? 'No names match; the crate shows what fits.' : ''}</div>`}${q.trim() && n ? `<button type="button" class="srch-link" data-srch-close>Show all ${n} in the crate →</button>` : ''}</div>
    <div class="srch-col srch-col-online"><div class="srch-lbl">Not in your crate yet · online <button type="button" class="srch-popsort" data-srch-pop title="Order the releases found online">${srchPopSortOn() ? 'Popular first' : 'Best match'}</button></div>${online.join('')}<div class="srch-note">${escapeHtml(srchOnlineStatus())}</div>${free.length >= 2 ? `<button type="button" class="srch-link" data-srch-all="${escapeHtml(free)}">More online results in Add a release →</button>` : ''}</div>
  </div>` + srchFootHtml();
}

// ----- the detail panel -----
const SRCH_TABS = [['all', 'Everything'], ['crate', 'My crate'], ['add', 'To add'], ['songs', 'Songs'], ['artists', 'Artists']];
function srchDetailItems(q) {
  const items = [], tab = srch.tab, has = q.trim();
  if (!has) return items;
  if (tab === 'all' || tab === 'crate') (state.filtered || []).slice(0, tab === 'crate' ? 48 : 18).forEach(it => items.push({ kind: 'release', col: 'grid', it, label: it.title, sub: it.artist, row: it.row, cover: srchItemCover(it) }));
  if (tab === 'all' || tab === 'add') srch.online.slice(0, tab === 'add' ? 30 : 12).forEach(r => items.push({ kind: 'online', col: 'grid', r, label: r.title, sub: [r.artist, srchPopFmt(r.listeners)].filter(Boolean).join(' · '), cover: r.cover, add: true }));
  const sug = srchCrateItems(q);
  if (tab === 'all' || tab === 'songs') sug.filter(s => s.kind === 'track').forEach(s => items.push(Object.assign({}, s, { col: 'songs' })));
  if (tab === 'all' || tab === 'artists') sug.filter(s => s.kind === 'artist').forEach(s => items.push(Object.assign({}, s, { col: 'artists' })));
  return items;
}
function srchDetailHtml() {
  const q = el.searchInput.value, dec = srchDecadeNow(), ts = srchTokens(q);
  const tick = (l, w) => `<label class="srch-tick"><input type="checkbox" data-srch-chip="${escapeHtml(w)}"${srchHas(w) >= 0 ? ' checked' : ''}> ${escapeHtml(l)}</label>`;
  const side = `<div class="srch-side">
    <div class="srch-lbl">Type</div>${tick('Album', 'type:album')}${tick('EP', 'type:ep')}${tick('Single', 'type:single')}
    <div class="srch-lbl">Decade</div><select class="srch-chip srch-dec${dec ? ' on' : ''}" data-srch-decade aria-label="Decade"><option value="">Any</option>${SRCH_DECADES.map(d => `<option value="${d}"${d === dec ? ' selected' : ''}>${d}s</option>`).join('')}</select>
    <div class="srch-lbl">In my crate</div>${tick('Not listened', 'listened:no')}${tick('Rated 4+', 'rating:>=4')}
    <div class="srch-lbl">Format</div>${tick('Vinyl', 'format:vinyl')}${tick('CD', 'format:cd')}${tick('Digital', 'format:digital')}
    ${ts.length ? `<div class="srch-lbl">In the box</div><div class="srch-active">${ts.map((t, i) => `<span class="srch-tok"><b>${escapeHtml(t.field.toUpperCase())}</b>${escapeHtml(t.value)}<button type="button" data-srch-untok="${i}" aria-label="Remove">✕</button></span>`).join('')}</div>` : ''}
    <div class="srch-hint">Ticks put the same words in the box you could type.</div></div>`;
  const tabs = `<div class="srch-tabs" role="tablist">${SRCH_TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${srch.tab === k}" class="srch-tab${srch.tab === k ? ' on' : ''}" data-srch-tab="${k}">${l}</button>`).join('')}</div>`;
  let main;
  if (!q.trim()) main = srchEmptyHtml();
  else {
    const grid = [], songs = [], artists = [];
    ssItems.forEach((s, i) => {
      if (s.col === 'grid') grid.push(`<div class="srch-cell${i === ssActive ? ' on' : ''}" id="ss-${i}" role="option" data-ss="${i}"><div class="srch-cell-cv">${srchImg(s.cover, 'srch-cv-big')}${s.add ? `<span class="srch-cell-tag new">${s.r.owned ? '✓' : '+ Add'}</span>` : s.it && s.it.format ? `<span class="srch-cell-tag">${escapeHtml(formatShort(s.it.format))}</span>` : ''}</div><div class="srch-t">${escapeHtml(s.label)}</div><div class="srch-s">${escapeHtml(s.sub || '')}${s.add ? ' · ' + escapeHtml(srchSrcName(s.r.src)) : s.it && s.it.rating ? ' · ' + '★'.repeat(Math.round(s.it.rating)) : ''}</div></div>`);
      else (s.col === 'songs' ? songs : artists).push(srchRowHtml(s, i));
    });
    const nC = (state.filtered || []).length, nA = srch.online.length;
    main = `<div class="srch-lbl">Releases · ${nC} in your crate${srch.tab !== 'crate' ? ` · ${srch.onlineState === 'loading' ? 'looking online…' : nA + ' to add'}` : ''}${srch.tab !== 'crate' && nA ? ` <button type="button" class="srch-popsort" data-srch-pop title="Order the releases found online">${srchPopSortOn() ? 'Popular first' : 'Best match'}</button>` : ''}</div>
      <div class="srch-grid">${grid.join('') || `<div class="srch-note">${escapeHtml(srchOnlineStatus() || 'Nothing here.')}</div>`}</div>
      ${songs.length ? `<div class="srch-lbl">Songs</div>${songs.join('')}` : ''}${artists.length ? `<div class="srch-lbl">Artists</div>${artists.join('')}` : ''}`;
  }
  return `<div class="srch-dhead">${tabs}</div><div class="srch-dbody">${side}<div class="srch-main">${main}</div></div>` + srchFootHtml();
}

function ssRender() {
  const box = document.getElementById('searchSuggest'), inp = el.searchInput; if (!box || !inp) return;
  const behind = srch.keep && el.deckOverlay && el.deckOverlay.classList.contains('open');
  box.classList.toggle('srch-behind', !!behind);
  if (!behind && document.activeElement !== inp && !box.contains(document.activeElement)) { srch.keep = false; box.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); return; }
  const lk = srchLook(), det = lk === 'detail';
  ssItems = srchItems(); if (ssActive >= ssItems.length) ssActive = -1;          // (made again each time: online results and the crate's filtering arrive after the typing)
  if (lk === 'simple' && !ssItems.length) { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); return; }          // simple: nothing to suggest, nothing shown
  box.classList.toggle('srch-detail', det);
  box.classList.toggle('srch-simple', lk === 'simple');
  box.innerHTML = det ? srchDetailHtml() : lk === 'drop' ? (inp.value.trim() ? srchDropdownHtml() : srchChipsHtml() + srchEmptyHtml() + srchFootHtml()) : srchSimpleHtml();
  box.hidden = false; inp.setAttribute('aria-expanded', 'true');
  if (ssActive >= 0) inp.setAttribute('aria-activedescendant', 'ss-' + ssActive); else inp.removeAttribute('aria-activedescendant');
}
function ssPick(i) {
  const s = ssItems[i], inp = el.searchInput; if (!s) return;
  srchRemember(inp.value);
  if (s.kind === 'online') { srchAddOnline(s.r); return; }
  if (s.kind === 'release') { const it = s.it || state.raw.find(r => String(r.row) === String(s.row)); if (it) { srch.keep = true; inp.blur(); openDeck(it); ssRender(); } else inp.blur(); return; }          // (1.135.59) the search stays open behind the release
  if (s.kind === 'track' && s.it && typeof showSongInCatalogue === 'function') { inp.blur(); showSongInCatalogue(s.it, s.label); return; }
  inp.value = inp.value.slice(0, s.from) + s.insert; inp.setSelectionRange(inp.value.length, inp.value.length);
  inp.dispatchEvent(new Event('input')); inp.focus();
  ssUpdate();
}
function srchClick(e) {
  const t = e.target, inp = el.searchInput, g = (sel) => t.closest(sel);
  let b;
  if ((b = g('[data-srch-untok]'))) return srchRemoveToken(+b.dataset.srchUntok);
  if (g('[data-srch-pop]')) { srchLsSet(SRCH_POP_SORT_KEY, srchPopSortOn() ? 'match' : 'pop'); srchPopSort(); ssRender(); return; }
  if ((b = g('[data-srch-chip]')) && b.tagName !== 'SELECT') { if (b.tagName === 'INPUT') e.preventDefault(); return srchToggle(b.dataset.srchChip); }
  if ((b = g('[data-srch-unsave]'))) return srchUnsave(b.dataset.srchUnsave);
  if ((b = g('[data-srch-q]'))) return srchSetQuery(b.dataset.srchQ + ' ');
  if ((b = g('[data-srch-jump]'))) return srchJump(b.dataset.srchJump);
  if ((b = g('[data-srch-save]'))) return srchSave();
  if ((b = g('[data-srch-look]'))) return srchLookSet(b.dataset.srchLook);
  if ((b = g('[data-search-songs]'))) return searchSongsOnlySet(!searchSongsOnly());
  if ((b = g('[data-srch-tab]'))) { srch.tab = b.dataset.srchTab; return ssUpdate(); }
  if ((b = g('[data-srch-all]'))) { srchRemember(inp.value); inp.blur(); return openAddModalSearch(b.dataset.srchAll); }
  if (g('[data-srch-close]')) { srchRemember(inp.value); return inp.blur(); }
  if ((b = g('[data-ss]'))) return ssPick(+b.dataset.ss);
}
function initSearchSuggest() {
  const inp = el.searchInput, wrap = el.searchWrap; if (!inp || !wrap || document.getElementById('searchSuggest')) return;
  const box = document.createElement('div'); box.id = 'searchSuggest'; box.className = 'search-suggest'; box.setAttribute('role', 'listbox'); box.hidden = true; wrap.appendChild(box);
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-controls', 'searchSuggest'); inp.setAttribute('aria-expanded', 'false');
  inp.addEventListener('input', debounce(ssUpdate, 200));          // (after the crate's own filtering, 150 ms)
  srchMirrorInit(inp);          // (1.135.90) the operators drawn as pills behind the text
  inp.addEventListener('focus', ssUpdate);
  inp.addEventListener('blur', () => { setTimeout(ssRender, 150); if (inp.value.trim().length >= 2) srchRemember(inp.value); });
  inp.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    const n = ssItems.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) { e.preventDefault(); ssActive = e.key === 'ArrowDown' ? (ssActive + 1 >= n ? -1 : ssActive + 1) : (ssActive <= -1 ? n - 1 : ssActive - 1); ssRender(); const on = box.querySelector('#ss-' + ssActive); if (on) on.scrollIntoView({ block: 'nearest' }); return; }          // (past the last: back to what you typed)
    if (e.key === 'Enter' && ssActive >= 0) { e.preventDefault(); e.stopImmediatePropagation(); ssPick(ssActive); return; }
    if (e.key === 'Enter') { srchRemember(inp.value); return; }
    if (e.key === 'Escape') { e.preventDefault(); inp.blur(); }
  }, true);
  box.addEventListener('mousedown', (e) => { if (!e.target.closest('select')) e.preventDefault(); });          // keeps the box focused, so the click lands (a decade list needs its own focus)
  box.addEventListener('click', srchClick);
  box.addEventListener('change', (e) => { const s = e.target.closest('[data-srch-decade]'); if (s) srchDecade(s.value); });
  // ⌘K / Ctrl+K: to the search box from anywhere (not while typing elsewhere)
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (state.activeTab !== 'albums' && typeof switchTab === 'function') switchTab('albums'); inp.focus(); inp.select(); } });
  // (1.135.48) ⊞ in the box: detailed search on or off (lights up when on), straight into it
  const db = document.getElementById('searchDetailBtn');
  if (db) { srchDetailBtnPaint(); db.addEventListener('mousedown', (e) => e.preventDefault()); db.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); srchLookSet(SRCH_LOOKS[(SRCH_LOOKS.indexOf(srchLook()) + 1) % 3]); inp.focus(); ssUpdate(); }); }
  if (searchSongsOnly()) { inp.placeholder = 'Search song titles\u2026'; wrap.classList.add('search-songs-only'); }
  // (1.135.51) ♪ in the box, always there: releases or song titles
  const sbt = document.getElementById('searchSongsBtn');
  if (sbt) { sbt.setAttribute('aria-pressed', String(searchSongsOnly())); sbt.classList.toggle('active', searchSongsOnly()); sbt.addEventListener('mousedown', (e) => e.preventDefault()); sbt.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); searchSongsOnlySet(!searchSongsOnly()); inp.focus(); }); }
  document.querySelectorAll('#layoutMenu [data-search-songs]').forEach(b => { b.setAttribute('aria-pressed', String(searchSongsOnly())); b.addEventListener('click', (ev) => { ev.stopPropagation(); searchSongsOnlySet(!searchSongsOnly()); }); });
  // ⚙ Settings → Search looks like
  document.querySelectorAll('[data-search-look]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.searchLook === srchLook())); b.addEventListener('click', (ev) => { ev.stopPropagation(); srchLookSet(b.dataset.searchLook); }); });
}
// (1.135.59) A release opened from the search: the search waits behind it, and is back (with what you typed) when you close the release.
function srchAfterDeckClose() { if (!srch.keep) return; srch.keep = false; const inp = el.searchInput; if (inp) { inp.focus({ preventScroll: true }); ssRender(); } }

// ----- (1.135.90) Search operators drawn as pills: genre:indie rock, year:1980-1989, -format:cd… -----
// A copy of the text sits exactly behind the box (same font, padding and scroll), with each operator in a pill and its field name in the
// accent; the box's own text turns see-through while there are operators, so what you type, select and edit is the real text, as before.
function srchMirrorInit(inp) {
  if (!inp || inp.dataset.mirror) return; inp.dataset.mirror = '1';
  const m = document.createElement('div'); m.className = 'search-mirror'; m.setAttribute('aria-hidden', 'true');
  const clip = document.createElement('div'); clip.className = 'search-mirror-clip'; m.appendChild(clip);
  const tx = document.createElement('div'); tx.className = 'search-mirror-tx'; clip.appendChild(tx);
  inp.parentNode.insertBefore(m, inp);
  const paint = () => srchMirrorPaint(inp, m, tx);
  ['input', 'focus', 'blur', 'scroll', 'keyup', 'select', 'mouseup'].forEach(ev => inp.addEventListener(ev, () => requestAnimationFrame(paint)));
  window.addEventListener('resize', () => requestAnimationFrame(paint));
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => requestAnimationFrame(paint)).observe(inp);
  inp.addEventListener('transitionend', paint);
  paint(); setTimeout(paint, 400);
}
// Where each operator is in the text: [start, end, negated, field, valueStart]; a genre runs on over the words the search reads as part of it
function srchOpSpans(q) {
  const out = []; let m, merged = []; SRCH_TOKEN_RE.lastIndex = 0;
  try { merged = mergeGenrePhrases(tokenizeSearchQuery(String(q).toLowerCase())).filter(t => t.field && SEARCH_FIELD_ALIASES[t.field.toLowerCase()] === 'genre').map(t => String(t.value || '')); } catch (e) { merged = []; }
  let gi = 0;
  while ((m = SRCH_TOKEN_RE.exec(q))) {
    const f = m[3].toLowerCase(), canon = SEARCH_FIELD_ALIASES[f]; if (!canon) continue;
    const start = m.index + m[1].length, vs = start + m[2].length + m[3].length + 1; let end = vs + m[4].length;
    if (canon === 'genre' && !m[4].startsWith('"')) { const v = merged[gi++] || ''; if (v.length > m[4].length && q.slice(vs, vs + v.length).toLowerCase() === v) { end = vs + v.length; SRCH_TOKEN_RE.lastIndex = end; } }
    out.push([start, end, !!m[2], m[3], vs]);
  }
  return out;
}
function srchMirrorPaint(inp, m, tx) {
  const q = inp.value || '', spans = q ? srchOpSpans(q) : [], on = spans.length > 0 && inp.offsetWidth > 60 && getComputedStyle(inp).opacity !== '0';
  inp.classList.toggle('search-has-ops', on); m.hidden = !on; if (!on) return;
  const cs = getComputedStyle(inp);
  Object.assign(m.style, { left: inp.offsetLeft + 'px', top: inp.offsetTop + 'px', width: inp.offsetWidth + 'px', height: inp.offsetHeight + 'px', font: cs.font, letterSpacing: cs.letterSpacing });
  Object.assign(m.firstChild.style, { left: (parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)) + 'px', right: (parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth)) + 'px' });          // (the text area only: not under the buttons)
  let h = '', at = 0;
  spans.forEach(([a, b, neg, f, vs]) => { h += escapeHtml(q.slice(at, a)); h += `<span class="sm-op${neg ? ' sm-neg' : ''}"><span class="sm-f">${escapeHtml(q.slice(a, vs))}</span>${escapeHtml(q.slice(vs, b))}</span>`; at = b; });
  h += escapeHtml(q.slice(at));
  if (tx.innerHTML !== h) tx.innerHTML = h;
  tx.style.transform = `translateX(${-inp.scrollLeft}px)`;
}

// ----- (1.135.92) The releases found online, most listened-to first: each one's Last.fm listener count (album.getInfo, for the first
// 30 found, four at a time; kept in this browser for a month), then sorted by it unless you chose "Best match". -----
const SRCH_POP_KEY = 'crate_search_pop_v1', SRCH_POP_SORT_KEY = 'crate_search_pop_sort_v1';
let srchPopMem = null;
function srchPopAll() { if (!srchPopMem) { srchPopMem = srchLs(SRCH_POP_KEY, {}) || {}; } return srchPopMem; }
function srchPopSave() { const a = srchPopAll(), ks = Object.keys(a); if (ks.length > 3000) ks.slice(0, ks.length - 3000).forEach(k => delete a[k]); srchLsSet(SRCH_POP_KEY, a); }
function srchPopSortOn() { return srchLs(SRCH_POP_SORT_KEY, 'pop') !== 'match'; }
const srchPopK = (r) => (typeof dupKey === 'function' ? dupKey(r.artist, r.title) : (r.artist + '|' + r.title).toLowerCase());
function srchPopSort() {
  if (!srchPopSortOn()) { srch.online.sort((a, b) => (a._at || 0) - (b._at || 0)); return; }
  srch.online.forEach((r, i) => { if (r._at == null) r._at = i; });
  srch.online.sort((a, b) => (b.listeners || -1) - (a.listeners || -1) || a._at - b._at);
}
async function srchPopRank(seq, key) {
  const all = srchPopAll(), now = Date.now(), list = srch.online; list.forEach((r, i) => { r._at = i; });
  const need = list.filter(r => { const c = all[srchPopK(r)]; if (c && now - c.t < 30 * 864e5) { r.listeners = c.n; return false; } return true; });
  if (!need.length) { srchPopSort(); ssRender(); return; }
  let i = 0; const one = async () => { while (i < need.length) { const r = need[i++]; if (seq !== srch.seq) return;
    try { const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=album.getinfo&artist=${encodeURIComponent(r.artist)}&album=${encodeURIComponent(r.title)}&autocorrect=1&api_key=${encodeURIComponent(key)}&format=json`);
      const j = await res.json(), n = j && j.album ? Number(j.album.listeners) || 0 : 0; r.listeners = n; all[srchPopK(r)] = { n, t: now };
      if (!r.cover && j && j.album && Array.isArray(j.album.image)) { const im = (j.album.image.find(x => x.size === 'extralarge') || j.album.image.slice(-1)[0] || {})['#text']; if (im) r.cover = im; }
    } catch (e) { /* unknown: stays where it was found */ } } };
  await Promise.all([one(), one(), one(), one()]); if (seq !== srch.seq) return;
  srchPopSave(); srchPopSort(); ssRender();
}
function srchPopFmt(n) { return !n ? '' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm listeners' : n >= 1e3 ? Math.round(n / 1e3) + 'k listeners' : n + ' listeners'; }
