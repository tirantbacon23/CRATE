// CRATE — (1.135.45) THE SEARCH BOX'S PANEL. As you type: your crate on the left and, beside it, releases you don't have yet from the sources Add a
// release uses (63-add-sources.js), each with its cover; refine chips across the top (type, decade, rating, not listened, format) that add or take
// off the same words you could type; the field filters already in the box as chips with ✕. With the box empty: recent searches, saved ones (★) and
// "Jump to" shortcuts. ⌘K / Ctrl+K goes to the box from anywhere.
// Two looks, picked in ⚙ Settings ("Search looks like") or with the switch at the bottom of the panel: Dropdown (the columns above) and Detail panel
// (a big panel: tabs, filters down the side, a grid of covers, then songs and artists). Both filter your crate as you type, as before.
const SRCH_DETAIL_KEY = 'crate_search_detail_v1', SRCH_RECENT_KEY = 'crate_search_recent_v1', SRCH_SAVED_KEY = 'crate_search_saved_v1';
const srchLs = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const srchLsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit */ } };
function srchDetail() { return srchLs(SRCH_DETAIL_KEY, false) === true; }
function srchDetailBtnPaint() { const b = document.getElementById('searchDetailBtn'); if (b) { const on = srchDetail(); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('active', on); b.title = on ? 'Detailed search is on: press for the simple suggestions' : 'Detailed search: covers, filters, songs and artists, releases to add'; } }
function srchDetailSet(on) { srchLsSet(SRCH_DETAIL_KEY, !!on); srchDetailBtnPaint(); document.querySelectorAll('[data-search-look]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.searchLook === 'detail') === !!on))); srch.tab = 'all'; ssUpdate(); }
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
function srchOnlineSearch() {
  const q = srchFreeText(el.searchInput.value); clearTimeout(srch.timer);
  if (q.length < 3) { srch.online = []; srch.onlineState = 'idle'; srch.onlineQ = ''; return; }
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
    const jobs = act.map(k => (k === 'mb' ? mb() : ADD_SRC_FN[k](q)).catch(() => null));
    const lists = await Promise.all(jobs); if (seq !== srch.seq) return;
    const seen = new Set(), out = []; let owned = 0, failed = 0;
    lists.forEach(l => { if (!l) { failed++; return; } l.forEach(r => { const k = dupKey(r.artist, r.title); if (!k || seen.has(k)) return; seen.add(k);
      const v = dupVerdict(dupMatches({ artist: r.artist, title: r.title, catalog: r.catalog || '', releaseDate: r.date || '', descriptor: '' }));
      if (v === 'exact' || v === 'edition') { owned++; if (hide) return; r.owned = true; } out.push(r); }); });
    srch.online = out.slice(0, 24); srch.onlineState = failed === lists.length ? 'error' : 'done';
    srch.onlineNote = srch.onlineState === 'error' ? 'No source answered.' : !out.length ? 'Nothing more found online.' : owned ? `${owned} you have left out` : '';
    ssRender();
  }, 600);
}
function srchAddOnline(r) {
  el.searchInput.blur(); srchRemember(el.searchInput.value);
  if (r.src === 'mb' && r.hit) { openAddModal(); el.addSearchInput.value = srchFreeText(el.searchInput.value); const row = buildReleaseResultRow(r.hit, { drillToPressings: true }); el.addResults.appendChild(row); row.click(); return; }
  openAddModal(); showAddForm({ artist: r.artist, title: r.title, type: r.type, releaseDate: r.date, genre: r.genre || '', label: r.label || '', catalog: r.catalog || '', cover: r.cover || '', link: r.link || '', format: r.format || '' });
}

// ----- what can be moved to with the arrows (ssItems), and the panel -----
function srchSrcName(k) { return ((typeof ADD_SRC !== 'undefined' ? ADD_SRC : []).find(s => s[0] === k) || [])[1] || ''; }
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
function srchOnlineItems() { return srch.online.slice(0, 6).map(r => ({ kind: 'online', col: 'online', r, label: r.title, sub: [r.artist, String(r.date || '').slice(0, 4), r.type && r.type !== 'Album' ? r.type : '', srchSrcName(r.src)].filter(Boolean).join(' · '), cover: r.cover })); }

function srchItems() { const q = el.searchInput.value; return srchDetail() ? srchDetailItems(q) : ssSuggest(q); }          // (1.135.46) simple: the suggestions as they always were
function ssUpdate() { if (srchDetail()) srchOnlineSearch(); ssActive = -1; ssRender(); }
// (1.135.46) The simple list, as before 1.135.42: what in your crate matches what's typed, by kind. At its foot, the switch to the detailed panel.
function srchSimpleHtml() {
  const kindName = { field: 'Field', artist: 'Artist', release: 'Release', track: 'Track', genre: 'Genre', descriptor: 'Descriptor', songdesc: 'Descriptor', label: 'Label', type: 'Type', title: 'Release' };
  return ssItems.map((s, i) => `<div class="ss-item ss-k-${s.kind}${i === ssActive ? ' on' : ''}" id="ss-${i}" role="option" aria-selected="${i === ssActive}" data-ss="${i}"><span class="ss-kind">${kindName[s.kind] || ''}</span><span class="ss-label">${escapeHtml(s.label)}</span><span class="ss-sub">${escapeHtml(String(s.sub || ''))}</span></div>`).join('')
    + `<div class="srch-simple-foot"><button type="button" class="srch-link" data-srch-look="detail" title="Covers, filters, songs and artists, and releases to add from online">\u2922 Detailed search</button></div>`;
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
function srchFootHtml() {
  const q = el.searchInput.value.trim(), det = srchDetail();
  return `<div class="srch-foot"><span>↑↓ move</span><span>⏎ open</span><span>Esc close</span>${q ? `<button type="button" class="srch-link" data-srch-save>★ Save this search</button>` : ''}<button type="button" class="srch-link srch-look" data-srch-look="${det ? 'drop' : 'detail'}">${det ? '⤡ Simple search' : '⤢ Detailed search'}</button></div>`;
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
  if (!srchFreeText(el.searchInput.value) || srchFreeText(el.searchInput.value).length < 3) return 'Type an artist or album to look online.';
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
    <div class="srch-col srch-col-online"><div class="srch-lbl">Not in your crate yet · online</div>${online.join('')}<div class="srch-note">${escapeHtml(srchOnlineStatus())}</div>${free.length >= 2 ? `<button type="button" class="srch-link" data-srch-all="${escapeHtml(free)}">More online results in Add a release →</button>` : ''}</div>
  </div>` + srchFootHtml();
}

// ----- the detail panel -----
const SRCH_TABS = [['all', 'Everything'], ['crate', 'My crate'], ['add', 'To add'], ['songs', 'Songs'], ['artists', 'Artists']];
function srchDetailItems(q) {
  const items = [], tab = srch.tab, has = q.trim();
  if (!has) return items;
  if (tab === 'all' || tab === 'crate') (state.filtered || []).slice(0, tab === 'crate' ? 48 : 18).forEach(it => items.push({ kind: 'release', col: 'grid', it, label: it.title, sub: it.artist, row: it.row, cover: srchItemCover(it) }));
  if (tab === 'all' || tab === 'add') srch.online.slice(0, tab === 'add' ? 24 : 12).forEach(r => items.push({ kind: 'online', col: 'grid', r, label: r.title, sub: r.artist, cover: r.cover, add: true }));
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
    main = `<div class="srch-lbl">Releases · ${nC} in your crate${srch.tab !== 'crate' ? ` · ${srch.onlineState === 'loading' ? 'looking online…' : nA + ' to add'}` : ''}</div>
      <div class="srch-grid">${grid.join('') || `<div class="srch-note">${escapeHtml(srchOnlineStatus() || 'Nothing here.')}</div>`}</div>
      ${songs.length ? `<div class="srch-lbl">Songs</div>${songs.join('')}` : ''}${artists.length ? `<div class="srch-lbl">Artists</div>${artists.join('')}` : ''}`;
  }
  return `<div class="srch-dhead">${tabs}</div><div class="srch-dbody">${side}<div class="srch-main">${main}</div></div>` + srchFootHtml();
}

function ssRender() {
  const box = document.getElementById('searchSuggest'), inp = el.searchInput; if (!box || !inp) return;
  if (document.activeElement !== inp && !box.contains(document.activeElement)) { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); return; }
  const det = srchDetail();
  ssItems = srchItems(); if (ssActive >= ssItems.length) ssActive = -1;          // (made again each time: online results and the crate's filtering arrive after the typing)
  if (!det && !ssItems.length) { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); return; }          // simple: nothing to suggest, nothing shown
  box.classList.toggle('srch-detail', det);
  box.classList.toggle('srch-simple', !det);
  box.innerHTML = det ? srchDetailHtml() : srchSimpleHtml();
  box.hidden = false; inp.setAttribute('aria-expanded', 'true');
  if (ssActive >= 0) inp.setAttribute('aria-activedescendant', 'ss-' + ssActive); else inp.removeAttribute('aria-activedescendant');
}
function ssPick(i) {
  const s = ssItems[i], inp = el.searchInput; if (!s) return;
  srchRemember(inp.value);
  if (s.kind === 'online') { srchAddOnline(s.r); return; }
  if (s.kind === 'release') { const it = s.it || state.raw.find(r => String(r.row) === String(s.row)); inp.blur(); if (it) openDeck(it); return; }
  if (s.kind === 'track' && s.it && typeof showSongInCatalogue === 'function') { inp.blur(); showSongInCatalogue(s.it, s.label); return; }
  inp.value = inp.value.slice(0, s.from) + s.insert; inp.setSelectionRange(inp.value.length, inp.value.length);
  inp.dispatchEvent(new Event('input')); inp.focus();
  ssUpdate();
}
function srchClick(e) {
  const t = e.target, inp = el.searchInput, g = (sel) => t.closest(sel);
  let b;
  if ((b = g('[data-srch-untok]'))) return srchRemoveToken(+b.dataset.srchUntok);
  if ((b = g('[data-srch-chip]')) && b.tagName !== 'SELECT') { if (b.tagName === 'INPUT') e.preventDefault(); return srchToggle(b.dataset.srchChip); }
  if ((b = g('[data-srch-unsave]'))) return srchUnsave(b.dataset.srchUnsave);
  if ((b = g('[data-srch-q]'))) return srchSetQuery(b.dataset.srchQ + ' ');
  if ((b = g('[data-srch-jump]'))) return srchJump(b.dataset.srchJump);
  if ((b = g('[data-srch-save]'))) return srchSave();
  if ((b = g('[data-srch-look]'))) return srchDetailSet(b.dataset.srchLook === 'detail');
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
  if (db) { srchDetailBtnPaint(); db.addEventListener('mousedown', (e) => e.preventDefault()); db.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); srchDetailSet(!srchDetail()); inp.focus(); ssUpdate(); }); }
  // ⚙ Settings → Search looks like
  document.querySelectorAll('[data-search-look]').forEach(b => { b.setAttribute('aria-pressed', String((b.dataset.searchLook === 'detail') === srchDetail())); b.addEventListener('click', (ev) => { ev.stopPropagation(); srchDetailSet(b.dataset.searchLook === 'detail'); }); });
}
