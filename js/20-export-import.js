// CRATE — Export / Import crate dialogs, duplicate protection when adding.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// ----- choosing what to export: narrow by genre, year(s), artist, type, label, rating, date added, or a search query -----
// Everything filled in must match (AND). The same rules the rest of the app uses are reused: the year read from a release's date as in
// the search box's year:, genre matching through the genre taxonomy as in the left panel, artist names compared the way duplicate
// protection compares them (case, accents and a leading "The" ignored), and the advanced box is the search box's own query language.
const CX_TYPE_ORDER = ['Album', 'EP', 'Single', 'Compilation', 'Live', 'Mixtape'];
function cxItemYear(r) { return dateVal(r.releaseDate) !== -Infinity ? new Date(r.releaseDate).getUTCFullYear() : null; }
function cxItemType(r) { return r.type && r.type !== 'Unknown' ? r.type : 'Unknown'; }
function cxArtistKey(a) { return dupWords(a).replace(/^the /, ''); }
// Terms are separated by commas; a name that contains commas ("Earth, Wind & Fire") goes in double quotes. A box whose WHOLE text is the
// name of an artist in the crate (what picking from the pick-list gives you) is also kept whole, so those never need quoting.
let cxKnownArtistKeys = new Set();
let cxPinned = null;                       // a hand-picked set of releases (rows), e.g. an area selected on the map; narrowed further by the other filters
function cxTerms(str, known) {
  const s = String(str || '').trim(); if (!s) return [];
  if (known && known.has(cxArtistKey(s.replace(/^"(.*)"$/, '$1')))) return [s.replace(/^"(.*)"$/, '$1')];
  const out = []; let cur = '', inQ = false;
  for (const ch of s) { if (ch === '"') { inQ = !inQ; continue; } if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; } cur += ch; }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
function cxQuoteTerm(t) { return String(t).includes(',') ? `"${t}"` : String(t); }
function cxReadFilters() {
  const v = (id) => cxEl(id).value.trim(), ch = (id) => cxEl(id).checked;
  let yf = parseInt(v('cxFYearFrom'), 10), yt = parseInt(v('cxFYearTo'), 10), swapped = false;
  yf = Number.isFinite(yf) ? yf : null; yt = Number.isFinite(yt) ? yt : null;
  if (yf !== null && yt !== null && yf > yt) { const t = yf; yf = yt; yt = t; swapped = true; }
  const typeBoxes = [...cxEl('cxFTypes').querySelectorAll('input')], checked = typeBoxes.filter(b => b.checked).map(b => b.value);
  return { genres: cxTerms(v('cxFGenre')), genreSub: ch('cxFGenreSub'), genreFirst: ch('cxFGenreFirst'), genreRole: v('cxFGenreRole') || 'any', yearFrom: yf, yearTo: yt, yearsSwapped: swapped,
    artists: cxTerms(v('cxFArtist'), cxKnownArtistKeys), artistPart: ch('cxFArtistPart'), types: typeBoxes.length && checked.length !== typeBoxes.length ? checked : null,
    labels: cxTerms(v('cxFLabel')), ratingMin: Number(v('cxFRating')) || 0, addedFrom: v('cxFAddedFrom'), addedTo: v('cxFAddedTo'), query: v('cxFQuery') };
}
// One entry per filter that is actually in use: { label, test(release) } — also used to show what each filter leaves on its own.
function cxFilterTests(f) {
  const T = [];
  if (cxPinned) T.push({ label: 'Selection', test: (r) => cxPinned.has(r.row) });
  if (f.genres.length) T.push({ label: 'Genre', test: (r) => {
    let tags = genreTagsForRole(r, f.genreRole); if (f.genreFirst) tags = tags.slice(0, 1);
    return tags.some(tag => f.genres.some(g => f.genreSub ? genreMatchesFilter(state.genreTaxonomy, tag, g) : genreTaxonomyKey(tag) === genreTaxonomyKey(g)));
  } });
  if (f.yearFrom !== null || f.yearTo !== null) T.push({ label: 'Years', test: (r) => { const y = cxItemYear(r); return y !== null && (f.yearFrom === null || y >= f.yearFrom) && (f.yearTo === null || y <= f.yearTo); } });
  if (f.artists.length) { const keys = f.artists.map(cxArtistKey).filter(Boolean); T.push({ label: 'Artist', test: (r) => { const a = cxArtistKey(r.artist); return keys.some(k => a === k || (f.artistPart && a.includes(k))); } }); }
  if (f.types) T.push({ label: 'Type', test: (r) => f.types.includes(cxItemType(r)) });
  if (f.labels.length) { const ls = f.labels.map(x => x.toLowerCase()); T.push({ label: 'Label', test: (r) => { const l = String(r.label || '').toLowerCase(); return ls.some(x => l.includes(x)); } }); }
  if (f.ratingMin > 0) T.push({ label: 'Rating', test: (r) => (r.rating || 0) >= f.ratingMin });
  if (f.addedFrom || f.addedTo) {
    const from = f.addedFrom ? dateVal(f.addedFrom) : null, to = f.addedTo ? dateVal(f.addedTo) + 86400000 : null;     // "on or before" includes that whole day
    T.push({ label: 'Added', test: (r) => { const t = dateVal(r.dateAdded); return t !== -Infinity && (from === null || t >= from) && (to === null || t < to); } });
  }
  if (f.query) { const terms = mergeGenrePhrases(tokenizeSearchQuery(f.query.toLowerCase())); if (terms.length) T.push({ label: 'Query', test: (r) => matchesSearchTerms(r, terms) }); }
  return T;
}
function cxDescribeFilters(f) {          // recorded in the file (the importer ignores it) so you can tell later how it was made
  const d = {};
  if (cxPinned) d.selection = `${cxPinned.size} releases picked on the map`;
  if (f.genres.length) { d.genre = f.genres.join(', '); d.includeSubGenres = f.genreSub; if (f.genreFirst) d.firstGenreOnly = true; if (f.genreRole === 'primary' || f.genreRole === 'secondary') d.genreCountsWhen = GENRE_ROLE_TEXT[f.genreRole]; }
  if (f.yearFrom !== null) d.yearFrom = f.yearFrom; if (f.yearTo !== null) d.yearTo = f.yearTo;
  if (f.artists.length) { d.artist = f.artists.map(cxQuoteTerm).join(', '); if (f.artistPart) d.partialArtistNames = true; }
  if (f.types) d.types = f.types; if (f.labels.length) d.label = f.labels.join(', '); if (f.ratingMin) d.ratingAtLeast = f.ratingMin;
  if (f.addedFrom) d.addedOnOrAfter = f.addedFrom; if (f.addedTo) d.addedOnOrBefore = f.addedTo; if (f.query) d.query = f.query;
  return d;
}
function cxFilterSlug(f) {                // a readable bit for the file name: crate-export-funk-rock-1970-1979-2026-10-20.json
  const bits = [];
  if (cxPinned) bits.push('map selection');
  if (f.genres.length) bits.push(f.genres.slice(0, 2).join(' '));
  if (f.yearFrom !== null || f.yearTo !== null) bits.push(f.yearFrom !== null && f.yearFrom === f.yearTo ? String(f.yearFrom) : `${f.yearFrom === null ? '' : f.yearFrom}-${f.yearTo === null ? '' : f.yearTo}`);
  if (f.artists.length) bits.push(f.artists.slice(0, 2).join(' '));
  if (!bits.length && cxFilterTests(f).length) bits.push('filtered');
  const slug = bits.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  return slug ? '-' + slug : '';
}
function cxFiltersInit() {
  cxPinned = null;               // fresh each time the dialog opens, so a filtered subset is never exported by accident; the pick-lists come from the whole crate
  ['cxFGenre', 'cxFYearFrom', 'cxFYearTo', 'cxFArtist', 'cxFLabel', 'cxFAddedFrom', 'cxFAddedTo', 'cxFQuery'].forEach(id => { cxEl(id).value = ''; });
  cxEl('cxFRating').value = '0'; cxEl('cxFGenreSub').checked = true; cxEl('cxFGenreFirst').checked = false; cxEl('cxFGenreRole').value = 'any'; cxEl('cxFArtistPart').checked = false;
  const gc = new Map(), ac = new Set(), tc = new Map(), dc = new Map();
  cxKnownArtistKeys = new Set(state.raw.map(r => cxArtistKey(r.artist)).filter(Boolean));
  cxEl('cxPresetNote').hidden = true; cxEl('cxPresetSaveRow').hidden = true; cxPresetMsg('');
  state.raw.forEach(r => {
    getGenreList(combinedGenreStr(r)).forEach(g => { if (g !== 'Unknown') gc.set(g, (gc.get(g) || 0) + 1); });
    if (r.artist) ac.add(r.artist);
    const t = cxItemType(r); tc.set(t, (tc.get(t) || 0) + 1);
    const y = cxItemYear(r); if (y !== null) { const dec = Math.floor(y / 10) * 10; dc.set(dec, (dc.get(dec) || 0) + 1); }
  });
  const opt = (v) => { const o = document.createElement('option'); o.value = v; return o; };
  const gl = cxEl('cxGenreList'), al = cxEl('cxArtistList'); gl.innerHTML = ''; al.innerHTML = '';
  [...gc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 600).forEach(([g]) => gl.appendChild(opt(g)));
  [...ac].sort((a, b) => a.localeCompare(b)).slice(0, 3000).forEach(a => al.appendChild(opt(a)));
  const types = cxEl('cxFTypes'); types.innerHTML = '';
  [...tc.keys()].sort((a, b) => { const ia = CX_TYPE_ORDER.indexOf(a), ib = CX_TYPE_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); }).forEach(t => {
    const l = document.createElement('label'); l.className = 'cx-chip'; const i = document.createElement('input'); i.type = 'checkbox'; i.value = t; i.checked = true;
    l.append(i, document.createTextNode(` ${t} (${tc.get(t).toLocaleString()})`)); types.appendChild(l);
  });
  const decs = cxEl('cxDecades'); decs.innerHTML = '';
  [...dc.keys()].sort((a, b) => a - b).forEach(d => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ai-link-btn cx-decade'; b.dataset.cxDecade = String(d); b.textContent = `${d}s`; b.title = `${dc.get(d).toLocaleString()} release${dc.get(d) === 1 ? '' : 's'}`; decs.appendChild(b);
  });
  cxRenderPresets('');
}
// ----- saved filter presets (this browser only): a name for a combination of the export filters, e.g. "70s prog" -----
const CX_PRESETS_KEY = 'crate_export_filter_presets_v1', CX_PRESET_MAX = 30;
function cxLoadPresets() {
  try { const a = JSON.parse(localStorage.getItem(CX_PRESETS_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x.name === 'string' && x.name && x.f && typeof x.f === 'object').slice(-CX_PRESET_MAX) : []; }
  catch (e) { return []; }                       // damaged storage: start with none rather than break the dialog
}
function cxStorePresets(list) { try { localStorage.setItem(CX_PRESETS_KEY, JSON.stringify(list.slice(-CX_PRESET_MAX))); } catch (e) { /* not remembered */ } }
function cxFormState() {                         // exactly what is in the boxes, so applying a preset restores what was typed
  const v = (id) => cxEl(id).value, ch = (id) => cxEl(id).checked, boxes = [...cxEl('cxFTypes').querySelectorAll('input')], on = boxes.filter(b => b.checked).map(b => b.value);
  return { genre: v('cxFGenre'), genreSub: ch('cxFGenreSub'), genreFirst: ch('cxFGenreFirst'), genreRole: v('cxFGenreRole') || 'any', yearFrom: v('cxFYearFrom'), yearTo: v('cxFYearTo'), artist: v('cxFArtist'), artistPart: ch('cxFArtistPart'),
    types: boxes.length && on.length !== boxes.length ? on : null, label: v('cxFLabel'), rating: v('cxFRating'), addedFrom: v('cxFAddedFrom'), addedTo: v('cxFAddedTo'), query: v('cxFQuery') };
}
// (a filter saved before the genre-role choice existed has no genreRole, and counts both lists, as it always did)
function cxApplyFormState(f) {
  const set = (id, val) => { cxEl(id).value = val == null ? '' : String(val); }, chk = (id, val) => { cxEl(id).checked = !!val; };
  set('cxFGenre', f.genre); chk('cxFGenreSub', f.genreSub !== false); chk('cxFGenreFirst', f.genreFirst); cxEl('cxFGenreRole').value = ['primary', 'secondary'].includes(f.genreRole) ? f.genreRole : 'any'; set('cxFYearFrom', f.yearFrom); set('cxFYearTo', f.yearTo);
  set('cxFArtist', f.artist); chk('cxFArtistPart', f.artistPart); set('cxFLabel', f.label); cxEl('cxFRating').value = String(f.rating || '0'); set('cxFAddedFrom', f.addedFrom); set('cxFAddedTo', f.addedTo); set('cxFQuery', f.query);
  cxEl('cxFTypes').querySelectorAll('input').forEach(b => { b.checked = !Array.isArray(f.types) || f.types.includes(b.value); });     // a type the crate no longer has is simply not offered
}
function cxRenderPresets(selected) {
  const list = cxLoadPresets(), sel = cxEl('cxPresetSel'); sel.innerHTML = '';
  const first = document.createElement('option'); first.value = ''; first.textContent = list.length ? 'Choose\u2026' : 'None saved yet'; sel.appendChild(first);
  list.forEach(x => { const o = document.createElement('option'); o.value = x.name; o.textContent = x.name; sel.appendChild(o); });
  sel.disabled = !list.length; sel.value = selected && list.some(x => x.name === selected) ? selected : '';
  cxEl('cxPresetDelBtn').disabled = !sel.value; cxEl('cxPresetDelBtn').textContent = 'Delete'; delete cxEl('cxPresetDelBtn').dataset.armed;
}
function cxPresetMsg(text, bad) { const m = cxEl('cxPresetMsg'); m.textContent = text; m.style.color = bad ? 'var(--bad, #E5734A)' : ''; }
function cxPresetSave() {
  const name = cxEl('cxPresetName').value.trim().replace(/\s+/g, ' ');
  if (!name) { cxPresetMsg('Give it a name first.', true); cxEl('cxPresetName').focus(); return; }
  if (!cxFilterTests(cxReadFilters()).filter(t => t.label !== 'Selection').length) { cxPresetMsg('Fill in at least one filter first.', true); return; }
  const list = cxLoadPresets().filter(x => x.name.toLowerCase() !== name.toLowerCase()), existed = cxLoadPresets().length !== list.length;
  list.push({ name, f: cxFormState() }); cxStorePresets(list);
  cxEl('cxPresetSaveRow').hidden = true; cxPresetMsg(''); cxRenderPresets(name);
  flashGlobalToast(existed ? `Updated the saved filters \u201c${name}\u201d.` : `Saved the filters as \u201c${name}\u201d.`);
}
// ----- export -----
function openCxExport(preset) {
  cxSetBoxes('cxExp', cxLoadOpts());
  cxEl('cxScopeAllN').textContent = `(${state.raw.length.toLocaleString()})`; cxEl('cxScopeViewN').textContent = `(${(state.filtered || state.raw).length.toLocaleString()})`;
  cxEl('cxScopeAll').checked = true;
  cxFiltersInit();
  // Opened from a Genre or Artist page ("Export these…"): fill the filters in so the file holds what that page lists. (The menu passes its click event
  // here, hence the check for a real preset.) Everything stays editable: narrow it further, or clear it.
  if (preset && preset.kind) {
    if (preset.kind === 'genre') {
      cxEl('cxFGenre').value = preset.genre; cxEl('cxFGenreSub').checked = preset.includeSub !== false;
      if (preset.year) { cxEl('cxFYearFrom').value = String(preset.year); cxEl('cxFYearTo').value = String(preset.year); }
    } else if (preset.kind === 'artist') cxEl('cxFArtist').value = cxQuoteTerm(preset.artist);
    else if (preset.kind === 'rows') cxPinned = new Set(preset.rows);
    const note = cxEl('cxPresetNote');
    note.textContent = preset.kind === 'rows' ? `Filled in from ${preset.label}. Narrow it further below, or Clear all to start over.` : preset.kind === 'genre'
      ? `Filled in from the ${preset.genre} page${preset.includeSub === false ? ' (without sub-genres)' : ' (with sub-genres)'}${preset.year ? ` and the year ${preset.year} you picked` : ''}. Change anything below.`
      : `Filled in from the ${preset.artist} page. Change anything below.`;
    note.hidden = false; cxEl('cxNarrow').open = true;
  }
  el.layoutMenu.hidden = true;
  cxEl('cxExportOverlay').hidden = false;
  if (!cxEl('cxExportOverlay').dataset.bound) cxExportBind();
  cxExportRefresh();
}
let cxExportItems = [];          // the releases the Export dialog lists right now (cxExportRefresh), for "Ratings as CSV"
function closeCxExport() { const ov = cxEl('cxExportOverlay'); if (ov && !ov.hidden) ov.hidden = true; }
function cxExportRefresh() {
  const o = cxGetBoxes('cxExp'); cxSaveOpts(o);
  const base = cxEl('cxScopeView').checked ? (state.filtered || state.raw) : state.raw;
  const f = cxReadFilters(), tests = cxFilterTests(f), items = tests.length ? base.filter(r => tests.every(t => t.test(r))) : base;
  cxExportItems = items;
  let obj = cxBuildExport(items, o);
  if (tests.length) { const out = {}; Object.keys(obj).forEach(k => { if (k === 'releases') out.filter = cxDescribeFilters(f); out[k] = obj[k]; }); obj = out; }     // the note goes before the (long) list
  cxExportText = JSON.stringify(obj, null, 2);
  const kb = cxExportText.length / 1024, counts = cxCounts(obj.releases);
  cxEl('cxExportSummary').textContent = `${cxFmtCounts(counts, tests.length ? `${items.length.toLocaleString()} of ${base.length.toLocaleString()} releases match` : '')} \u00b7 ${kb < 100 ? kb.toFixed(1) : Math.round(kb)} KB`;
  // what each filter would leave ON ITS OWN, so an empty result explains itself ("Genre 14 \u00b7 Years 0")
  const each = cxEl('cxFEach'), noDate = base.filter(r => cxItemYear(r) === null).length;
  each.textContent = !tests.length ? '' : (items.length ? 'Each on its own: ' : 'Nothing matches all of these. Each on its own: ') + tests.map(t => `${t.label} ${base.filter(t.test).length.toLocaleString()}`).join(' \u00b7 ')
    + (f.yearsSwapped ? ' \u00b7 (years were the other way round, so I swapped them)' : '') + ((f.yearFrom !== null || f.yearTo !== null) && noDate ? ` \u00b7 ${cxN(noDate, 'release')} with no date left out of the years` : '');
  cxEl('cxExportPreview').textContent = JSON.stringify(Object.assign({}, obj, { releases: obj.releases.slice(0, 2) }), null, 2) + (obj.releases.length > 2 ? `\n\u2026 and ${obj.releases.length - 2} more release${obj.releases.length - 2 === 1 ? '' : 's'}` : '');
  const list = cxEl('cxExportList'); list.innerHTML = '';
  items.slice(0, 200).forEach(r => { const d = document.createElement('div'); const y = cxItemYear(r); d.textContent = `${r.artist || '(no artist)'} \u2014 ${r.title || '(no title)'}${y !== null ? ' (' + y + ')' : ''}`; list.appendChild(d); });
  if (items.length > 200) { const d = document.createElement('div'); d.className = 'sm-dim'; d.textContent = `\u2026 and ${(items.length - 200).toLocaleString()} more`; list.appendChild(d); }
  cxEl('cxListSummary').textContent = `Which releases will be exported (${items.length.toLocaleString()})`;
  cxEl('cxDecades').querySelectorAll('.cx-decade').forEach(b => { const d = Number(b.dataset.cxDecade); b.classList.toggle('active', f.yearFrom === d && f.yearTo === d + 9); });
  cxEl('cxExportDownload').disabled = cxEl('cxExportCopy').disabled = cxEl('cxExportCsv').disabled = !obj.releases.length;
  const savable = tests.filter(t => t.label !== 'Selection').length; cxEl('cxPresetSaveBtn').disabled = !savable; cxEl('cxPresetSaveBtn').title = savable ? 'Remember this combination of filters under a name' : 'Fill in at least one filter first';
}
function cxDownload(filename, text, type) {
  const blob = new Blob([text], { type: type || 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
async function cxCopy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through to the old way */ }
  try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
function cxExportBind() {
  const ov = cxEl('cxExportOverlay'); ov.dataset.bound = '1';
  cxEl('cxExportClose').addEventListener('click', closeCxExport);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeCxExport(); });
  ov.addEventListener('keydown', (e) => { if (e.target.id === 'cxPresetName') { if (e.key === 'Enter') { e.preventDefault(); cxPresetSave(); } else if (e.key === 'Escape') { e.stopPropagation(); cxEl('cxPresetSaveRow').hidden = true; cxPresetMsg(''); } } });
  ov.addEventListener('change', (e) => {
    if (e.target.id === 'cxPresetSel') {
      const x = cxLoadPresets().find(q => q.name === e.target.value);
      if (x) { cxApplyFormState(x.f); const n = cxEl('cxPresetNote'); n.textContent = `Applied your saved filters \u201c${x.name}\u201d. Change anything below.`; n.hidden = false; }
      cxEl('cxPresetDelBtn').disabled = !x; cxEl('cxPresetDelBtn').textContent = 'Delete'; delete cxEl('cxPresetDelBtn').dataset.armed;
    } else if (e.target.closest('#cxNarrow') && !e.target.closest('.cx-preset-row, .cx-preset-save')) { cxEl('cxPresetSel').value = ''; cxEl('cxPresetDelBtn').disabled = true; }
    if (e.target.closest('input, select')) cxExportRefresh();
  });
  let cxFilterTimer = null;
  ov.addEventListener('input', (e) => { if (e.target.closest('#cxNarrow') && !e.target.closest('.cx-preset-save') && e.target.matches('input[type=text], input[type=number], input[type=date]')) { cxEl('cxPresetSel').value = ''; cxEl('cxPresetDelBtn').disabled = true; clearTimeout(cxFilterTimer); cxFilterTimer = setTimeout(cxExportRefresh, 150); } });   // live while you type
  ov.addEventListener('click', (e) => {
    const d = e.target.closest('[data-cx-decade]');
    if (d) { const start = Number(d.dataset.cxDecade), on = cxEl('cxFYearFrom').value === String(start) && cxEl('cxFYearTo').value === String(start + 9); cxEl('cxFYearFrom').value = on ? '' : String(start); cxEl('cxFYearTo').value = on ? '' : String(start + 9); cxExportRefresh(); return; }
    if (e.target.closest('#cxFClear')) { cxFiltersInit(); cxExportRefresh(); return; }
    if (e.target.closest('#cxPresetSaveBtn')) { cxEl('cxPresetSaveRow').hidden = false; cxPresetMsg(''); cxEl('cxPresetName').value = ''; cxEl('cxPresetName').focus(); return; }
    if (e.target.closest('#cxPresetCancel')) { cxEl('cxPresetSaveRow').hidden = true; cxPresetMsg(''); return; }
    if (e.target.closest('#cxPresetOk')) { cxPresetSave(); return; }
    const del = e.target.closest('#cxPresetDelBtn');
    if (del && !del.disabled) {                                    // two clicks, so one slip never loses a saved set
      if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'Click again to delete'; setTimeout(() => { if (del.dataset.armed) { delete del.dataset.armed; del.textContent = 'Delete'; } }, 3000); return; }
      const name = cxEl('cxPresetSel').value; cxStorePresets(cxLoadPresets().filter(q => q.name !== name)); cxRenderPresets(''); flashGlobalToast(`Deleted the saved filters \u201c${name}\u201d.`);
    }
  });
  ov.addEventListener('click', (e) => { const b = e.target.closest('[data-cx-preset]'); if (!b) return; const l = cxPresetLinks(b.dataset.cxPreset); CX_KINDS.forEach(k => { cxEl('cxExp' + CX_LINK_IDS[k]).checked = l[k]; }); cxExportRefresh(); });
  cxEl('cxExportDownload').addEventListener('click', () => {
    const name = `crate-export${cxFilterSlug(cxReadFilters())}-${new Date().toISOString().slice(0, 10)}.json`;
    cxDownload(name, cxExportText); flashGlobalToast(`Exported ${cxN(JSON.parse(cxExportText).releases.length, 'release')} to ${name}.`);
  });
  cxEl('cxExportCsv').addEventListener('click', () => {
    const name = `crate-rym-ratings${cxFilterSlug(cxReadFilters())}-${new Date().toISOString().slice(0, 10)}.csv`, rated = cxExportItems.filter(it => Number(it.rymRating) > 0).length;
    cxDownload(name, cxRatingsCsv(cxExportItems), 'text/csv;charset=utf-8');
    flashGlobalToast(`Saved ${cxN(cxExportItems.length, 'release')} (${rated.toLocaleString()} with a RYM rating) and their rated tracks to ${name}.`);
  });
  cxEl('cxExportCopy').addEventListener('click', async () => { flashGlobalToast(await cxCopy(cxExportText) ? 'Copied the export to the clipboard.' : 'Couldn\u2019t copy \u2014 use Download instead.'); });
}
// ----- import -----
function openCxImport() {
  cxImp = { releases: null, meta: null, selected: new Set(), filter: 'all', view: cxLoadView(), running: false, cancel: false, added: [], failed: [] };
  cxEl('cxImpText').value = ''; cxEl('cxImpFile').value = ''; cxEl('cxImpError').hidden = true; cxEl('cxImpSource').hidden = true;
  cxSetBoxes('cxImp', cxLoadOpts());
  el.layoutMenu.hidden = true;
  cxImpShow('cxImpPick'); cxEl('cxImportOverlay').hidden = false;
  if (!cxEl('cxImportOverlay').dataset.bound) cxImportBind();
}
function closeCxImport() {
  const ov = cxEl('cxImportOverlay'); if (!ov || ov.hidden) return;
  if (cxImp && cxImp.running) { cxImp.cancel = true; return; }          // while adding, closing means "stop after the one in progress"
  ov.hidden = true; cxImp = null; bgStatusHide();
}

// ----- covers in the review -----
// Where a release's cover comes from, in order: the address in the file, then (when the file links a MusicBrainz release) the Cover
// Art Archive's front image, then an iTunes lookup that must match artist and title. Each candidate is TRIED before it is used, so a
// dead address falls through to the next. Nothing is looked up until a row scrolls into view, at most four at a time, and each answer
// is remembered. When nothing works the release gets an initials tile. The address is only ever put on an <img> from code (never
// pasted into the page's HTML), because it comes from a file you didn't write. "Text only" loads no images at all.
const CX_VIEW_KEY = 'crate_import_view_v1';
const cxCoverCache = new Map(), cxCoverInflight = new Map(), cxCoverWait = [];
let cxCoverBusy = 0, cxCoverObs = null;
function cxLoadView() { try { const v = localStorage.getItem(CX_VIEW_KEY); return v === 'grid' || v === 'off' ? v : 'list'; } catch (e) { return 'list'; } }
function cxCoverKey(r) { return dupKey(r.artist, r.title) + '|' + (r.cover || '') + '|' + (r.link || ''); }
// Rate Your Music's picture hosts may refuse a request that says it comes from another website (a referrer), yet serve the same picture to someone who opens it directly. So any <img>'s src set to a
// Rate Your Music address is requested without one (this covers the cards, the deck, and the cover check below).
(function () {
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src'); if (!d || !d.set) return;
  Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { try { if (rymIsRymImage(v)) this.referrerPolicy = 'no-referrer'; } catch (e) { /* not an address */ } d.set.call(this, v); } });
})();
function cxProbe(url) { return new Promise(res => { let done = false; const end = (ok) => { if (!done) { done = true; clearTimeout(t); res(ok); } }; const im = new Image(), t = setTimeout(() => end(false), 6000); im.onload = () => end(true); im.onerror = () => end(false); im.src = url; }); }       // (a picture that never answers must not hold up a whole import)
function cxResolveCover(r) {
  const key = cxCoverKey(r);
  if (cxCoverCache.has(key)) return Promise.resolve(cxCoverCache.get(key));
  if (cxCoverInflight.has(key)) return cxCoverInflight.get(key);
  const job = (async () => {
    const tries = [];
    if (r.cover) tries.push(r.cover);
    const mb = /musicbrainz\.org\/release\/([0-9a-f-]{36})/i.exec(r.link || '');
    if (mb) tries.push(`https://coverartarchive.org/release/${mb[1]}/front-250`);
    let found = '';
    for (const u of tries) { if (await cxProbe(u)) { found = u; break; } }
    if (!found && r.artist && r.title) {
      try { const hit = await findItunesAlbum({ artist: r.artist, title: r.title }); if (hit && hit.artworkUrl100) found = String(hit.artworkUrl100).replace('100x100', '300x300'); } catch (e) { /* no luck: the tile stays */ }
    }
    cxCoverCache.set(key, found); cxCoverInflight.delete(key); return found;
  })();
  cxCoverInflight.set(key, job);
  return job;
}
function cxCoverQueue(r) {                    // at most 4 lookups at once
  return new Promise(res => { cxCoverWait.push(() => cxResolveCover(r).then(res, () => res(''))); cxCoverPump(); });
}
function cxCoverPump() { while (cxCoverBusy < 4 && cxCoverWait.length) { const j = cxCoverWait.shift(); cxCoverBusy++; j().finally(() => { cxCoverBusy--; cxCoverPump(); }); } }
function cxCoverImgHtml(r, cls) {             // what shows first: the answer if it's already known, else the tile
  const known = cxCoverCache.get(cxCoverKey(r));
  return `<img class="${cls}" alt="" data-cxcover="${r.idx}" decoding="async" src="${known ? escapeHtml(known) : placeholderArt({ artist: r.artist || '?', title: r.title || '' })}">`;
}
function cxCoverObserve() {
  if (cxCoverObs) { cxCoverObs.disconnect(); cxCoverObs = null; }
  const st = cxImp; if (!st || !st.releases || st.view === 'off' || typeof IntersectionObserver === 'undefined') return;
  const imgs = [...cxEl('cxImpList').querySelectorAll('img[data-cxcover]')].filter(im => { const r = st.releases[Number(im.dataset.cxcover)]; return r && !r.invalid && !cxCoverCache.has(cxCoverKey(r)); });
  if (!imgs.length) return;
  cxCoverObs = new IntersectionObserver((entries) => entries.forEach(en => {
    if (!en.isIntersecting) return;
    cxCoverObs.unobserve(en.target);
    const img = en.target, r = st.releases[Number(img.dataset.cxcover)];
    cxCoverQueue(r).then(url => { if (url && img.isConnected) img.src = url; });
  }), { root: cxEl('cxImpList'), rootMargin: '200px' });
  imgs.forEach(im => cxCoverObs.observe(im));
}
function cxImpShow(section) { ['cxImpPick', 'cxImpReview', 'cxImpProgress'].forEach(id => { cxEl(id).hidden = id !== section; }); }
function cxImpRead(text) {
  const r = cxParseImport(text);
  if (!r.ok) { cxEl('cxImpError').textContent = r.error; cxEl('cxImpError').hidden = false; return; }
  cxClassify(r.releases, dupIndex(), dupKey);
  Object.assign(cxImp, { releases: r.releases, meta: r.meta, filter: 'all', selected: new Set(r.releases.filter(x => x.status === 'new').map(x => x.idx)) });
  cxEl('cxImpError').hidden = true; cxImpShow('cxImpReview'); cxImpRender();
}
function cxStatusShort(r) {           // the same status in a word or two, for the cards (the full wording is the chip's tooltip)
  if (r.status === 'new') return 'New';
  if (r.status === 'invalid') return 'Problem';
  return r.dupLevel === 'edition' ? 'Edition?' : r.status === 'duplicate' ? 'Owned' : 'Repeat';
}
function cxStatus(r) {
  const ed = r.dupLevel === 'edition';
  if (r.status === 'new') return ['New', 'cx-chip-new'];
  if (r.status === 'duplicate') return [ed ? 'Another edition in your crate' : 'Already in your crate', ed ? 'cx-chip-ed' : 'cx-chip-dupe'];
  if (r.status === 'repeat') return [ed ? 'Another edition in this file' : 'Repeated in this file', ed ? 'cx-chip-ed' : 'cx-chip-dupe'];
  return ['Can\u2019t import', 'cx-chip-bad'];
}
function cxImpRender() {
  const st = cxImp; if (!st || !st.releases) return;
  const opts = cxGetBoxes('cxImp'), rels = st.releases;
  const by = { new: 0, duplicate: 0, repeat: 0, invalid: 0 }; rels.forEach(r => { by[r.status]++; });
  const chosen = rels.filter(r => st.selected.has(r.idx)), shaped = chosen.map(r => cxShape(r, opts)), c = cxCounts(shaped);
  const when = st.meta && st.meta.exportedAt ? ` (exported ${new Date(st.meta.exportedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })})` : '';
  cxEl('cxImpSummary').innerHTML = `The file has <b>${cxN(rels.length, 'release')}</b>${when}: <b>${by.new}</b> new, ${by.duplicate} already in your crate${by.repeat ? `, ${by.repeat} repeated in the file` : ''}${by.invalid ? `, ${by.invalid} that can\u2019t be imported` : ''}.<br>Selected to add: <b>${cxFmtCounts(c)}</b>`;
  const tabs = [['all', `All ${rels.length}`], ['new', `New ${by.new}`], ['dupe', `Already in your crate ${by.duplicate + by.repeat}`], ['bad', `Problems ${by.invalid}`]];
  cxEl('cxImpTabs').innerHTML = tabs.map(([k, t]) => `<button type="button" class="gi-seg-btn${st.filter === k ? ' active' : ''}" data-cxtab="${k}" aria-pressed="${st.filter === k}">${t}</button>`).join('');
  const show = rels.filter(r => st.filter === 'all' || (st.filter === 'new' && r.status === 'new') || (st.filter === 'dupe' && (r.status === 'duplicate' || r.status === 'repeat')) || (st.filter === 'bad' && r.status === 'invalid'));
  cxEl('cxImpViews').querySelectorAll('[data-cxview]').forEach(b => { const on = b.dataset.cxview === st.view; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  cxEl('cxImpList').classList.toggle('cx-grid', st.view === 'grid');
  cxEl('cxImpList').innerHTML = show.map(r => {
    const rc = cxCounts([cxShape(r, opts)]), on = st.selected.has(r.idx), [label, cls] = cxStatus(r), off = r.invalid || r.dupLevel === 'exact';
    const L = rc.links, bits = [r.type, (r.releaseDate || '').slice(0, 4), r.genre].filter(Boolean);
    const links = [L.spotify && `${L.spotify} Spotify`, L.youtube && `${L.youtube} YouTube`, L.soundcloud && `${L.soundcloud} SoundCloud`, L.other && `${L.other} other`].filter(Boolean);
    const notes = r.problems.concat(r.dupLevel === 'edition' ? [`Looks like a different edition: ${(r.dupDiffs || []).join('; ')}`] : [], r.warnings);
    const name = `${r.artist || '(no artist)'} \u2014 ${r.title || '(no title)'}`;
    if (st.view === 'grid') {
      return `<label class="cx-card${on ? ' picked' : ''}${off ? ' off' : ''}" data-idx="${r.idx}" title="${escapeHtml(name + (notes.length ? ' \u2014 ' + notes.join('; ') : ''))}"><input type="checkbox" data-cx="pick"${on ? ' checked' : ''}${off ? ' disabled' : ''} aria-label="Select ${escapeHtml(name)}">${cxCoverImgHtml(r, 'cx-card-img')}<span class="cx-chip ${cls}" title="${label}">${cxStatusShort(r)}</span><span class="cx-card-title">${escapeHtml(r.title || '(no title)')}</span><span class="cx-card-sub">${escapeHtml(r.artist || '(no artist)')}${r.releaseDate ? ' \u00b7 ' + escapeHtml(r.releaseDate.slice(0, 4)) : ''}</span>${notes.length ? '<span class="cx-card-warn" aria-hidden="true">\u26a0</span>' : ''}</label>`;
    }
    return `<div class="lfr-row${st.view === 'list' ? ' cx-row' : ''}${on ? ' picked' : ''}" data-idx="${r.idx}"><label class="lfr-check"><input type="checkbox" data-cx="pick"${on ? ' checked' : ''}${off ? ' disabled' : ''} aria-label="Select ${escapeHtml(name)}"></label>
      ${st.view === 'list' ? cxCoverImgHtml(r, 'cx-thumb') : ''}
      <div class="lfr-main"><span class="lfr-title">${escapeHtml(r.artist || '(no artist)')} \u2014 ${escapeHtml(r.title || '(no title)')}</span>
      <span class="lfr-meta">${escapeHtml(bits.join(' \u00b7 ') || 'no details')}${rc.tracks ? ` \u00b7 ${cxN(rc.tracks, 'song')}` : ''}${links.length ? ` \u00b7 ${links.join(', ')}` : ''}</span>
      ${notes.length ? `<span class="lfr-tracks cx-notes" title="${escapeHtml(notes.join('; '))}">${escapeHtml(notes[0])}${notes.length > 1 ? ` (+${notes.length - 1} more)` : ''}</span>` : ''}</div>
      <span class="cx-chip ${cls}">${label}</span></div>`;
  }).join('') || '<p class="sm-dim" style="padding:12px 4px">Nothing in this view.</p>';
  cxEl('cxImpGo').textContent = chosen.length ? `Add ${cxN(chosen.length, 'release')}\u2026` : 'Add selected\u2026'; cxEl('cxImpGo').disabled = !chosen.length;
  cxCoverObserve();
}
async function cxImpRun(list) {                // list: [{ idx, shaped }]
  const st = cxImp; st.running = true; st.cancel = false; st.added = []; st.failed = []; st.coverOk = 0; st.coverMiss = 0;
  cxImpShow('cxImpProgress'); cxEl('cxImpResult').hidden = true; cxEl('cxImpCancel').hidden = false; cxEl('cxImpCancel').disabled = false; cxEl('cxImpBg').hidden = false; bgStatusHide();
  const total = list.length, say = (text, pct) => { cxEl('cxImpProgText').textContent = text; cxEl('cxImpBar').style.width = `${Math.round(pct)}%`; bgStatus(text, pct, { cancel: true }); };
  // 1. Rate Your Music covers are checked together, six at a time, before anything is written: one slow picture no longer holds up every release behind it, and a cover is saved only if it
  //    really loads from here (the deck shows a saved cover as it is, with no fallback), in the largest size that does.
  if (st.rym) {
    const pending = list.filter(it => it.shaped.cover), all = pending.length; let checked = 0;
    const worker = async () => {
      while (pending.length && !st.cancel) {
        const it = pending.shift(), good = await rymBestCover(it.shaped.cover); checked++;
        if (good) { st.coverOk++; if (good !== it.shaped.cover) it.shaped = Object.assign({}, it.shaped, { cover: good }); } else { it.shaped = Object.assign({}, it.shaped, { cover: '' }); st.coverMiss++; }
        say(`Checking covers \u2014 ${checked} of ${all}`, all ? checked / all * 15 : 0);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }
  // 2. The rows go in groups of 25 in ONE request each (one write for the group, instead of a full round trip per release). A script that doesn't know the group request answers "Missing row
  //    number" before writing anything: then, and from then on, they go one at a time as before. A request that FAILS midway is not repeated one by one (it may have been written).
  let useBatch = state.backendAddMany !== false, i = 0;
  const unauthorized = (e) => /unauthorized/i.test(String((e && e.message) || e));
  while (i < total) {
    if (st.cancel) break;
    const pct = 15 + i / total * 85;
    if (useBatch) {
      const group = list.slice(i, i + 25);
      say(`Adding ${i + 1}\u2013${i + group.length} of ${total}`, pct);
      try {
        const res = await postUpdate({ action: 'addAlbums', albums: group.map(it => { const p = cxAddPayload(it.shaped); delete p.action; return p; }) });
        if (res && Array.isArray(res.albumIds) && res.albumIds.length === group.length) { group.forEach((it, k) => st.added.push({ idx: it.idx, albumId: res.albumIds[k] || '', shaped: it.shaped })); state.backendAddMany = true; i += group.length; continue; }
        state.backendAddMany = false; useBatch = false;                                   // an answer that isn't a group answer: an older script
      } catch (e) {
        if (/Missing row number/i.test(String((e && e.message) || e))) { state.backendAddMany = false; useBatch = false; }       // an older script (nothing was written)
        else { group.forEach(it => st.failed.push({ idx: it.idx, shaped: it.shaped, error: String((e && e.message) || e) })); i += group.length; if (unauthorized(e)) break; continue; }
      }
    }
    const it = list[i]; say(`Adding ${i + 1} of ${total} \u2014 ${it.shaped.artist} \u2014 ${it.shaped.title}`, pct);
    try { const res = await postUpdate(cxAddPayload(it.shaped)); st.added.push({ idx: it.idx, albumId: (res && res.albumId) || '', shaped: it.shaped }); }
    catch (e) { st.failed.push({ idx: it.idx, shaped: it.shaped, error: String((e && e.message) || e) }); if (unauthorized(e)) break; }
    i++;
  }
  const notTried = total - st.added.length - st.failed.length;
  cxEl('cxImpBar').style.width = '100%'; cxEl('cxImpProgText').textContent = 'Finishing\u2026'; cxEl('cxImpCancel').hidden = true; cxEl('cxImpBg').hidden = true; bgStatus('Finishing\u2026', 100, {});
  try { await fetchCatalog(); } catch (e) { console.warn('refresh after import failed', e); }
  // SoundCloud links live with the per-song data, which needs the release to exist: attach them now.
  let scFailed = 0;
  for (const a of st.added) {
    const upd = cxSoundcloudUpdates(a.shaped); if (!a.albumId || !Object.keys(upd).length) continue;
    const item = state.raw.find(r => r.albumId === a.albumId);
    try { if (item) await saveSongLinks(item, upd); else scFailed++; } catch (e) { scFailed++; }
  }
  st.running = false;
  const lines = [`<b>${cxN(st.added.length, 'release')}</b> added${notTried ? `, ${notTried} not attempted (stopped)` : ''}${st.failed.length ? `, <b>${st.failed.length}</b> failed` : ''}.`];
  if (st.rym && (st.coverOk || st.coverMiss)) lines.push(`Covers from Rate Your Music: <b>${st.coverOk}</b> saved${st.coverMiss ? `, ${st.coverMiss} couldn\u2019t be loaded from here, so CRATE will look for ${st.coverMiss === 1 ? 'that one' : 'those'} itself` : ''}.`);
  jobsDone('import', `Added ${cxN(st.added.length, 'release')}${notTried ? `, ${notTried} not attempted (stopped)` : ''}${st.failed.length ? `, ${st.failed.length} failed` : ''}`);
  if (st.skipped && st.skipped.length) lines.push(`${cxN(st.skipped.length, 'release')} skipped \u2014 already in your crate: ${st.skipped.map(r => escapeHtml(r.artist + ' \u2014 ' + r.title)).join(', ')}.`);
  if (scFailed) lines.push(`${cxN(scFailed, 'release')} added, but their SoundCloud song links couldn\u2019t be attached.`);
  if (st.failed.length) lines.push(`<ul class="cx-fails">${st.failed.map(f => `<li>${escapeHtml(f.shaped.artist)} \u2014 ${escapeHtml(f.shaped.title)}: ${escapeHtml(f.error)}</li>`).join('')}</ul>`);
  cxEl('cxImpProgText').textContent = st.failed.length || notTried ? 'Import finished with problems' : 'Import finished';
  cxEl('cxImpResult').innerHTML = lines.join('<br>'); cxEl('cxImpResult').hidden = false;
  cxEl('cxImpRetry').hidden = !st.failed.length;
  if (st.rym && st.added.length && !st.failed.length && !notTried) rymBatchDone(st.rym.ids);       // everything went through: the add-on can forget it (if anything failed or was stopped it stays, and the added ones show as already here)
  if (st.added.length) flashGlobalToast(`Imported ${cxN(st.added.length, 'release')}.`);
  if (cxEl('cxImportOverlay').hidden) bgStatus(`${cxN(st.added.length, 'release')} added${st.failed.length ? `, ${st.failed.length} failed` : ''}${notTried ? `, ${notTried} not attempted` : ''}`, 100, { view: true, close: true, always: true });          // finished while you were elsewhere
}
function cxImportBind() {
  const ov = cxEl('cxImportOverlay'); ov.dataset.bound = '1';
  cxEl('cxImportClose').addEventListener('click', closeCxImport);
  cxEl('cxImpBg').addEventListener('click', () => { cxEl('cxImportOverlay').hidden = true; if (cxImp && cxImp.running) bgStatus(cxEl('cxImpProgText').textContent, parseFloat(cxEl('cxImpBar').style.width) || 0, { cancel: true }); });          // hide the dialog, not stop the run
  ov.addEventListener('mousedown', (e) => { if (e.target === ov && !(cxImp && cxImp.running)) closeCxImport(); });
  cxEl('cxImpChoose').addEventListener('click', () => cxEl('cxImpFile').click());
  cxEl('cxImpFile').addEventListener('change', async () => { const f = cxEl('cxImpFile').files[0]; if (f) cxImpRead(await f.text()); });
  cxEl('cxImpRead').addEventListener('click', () => { const t = cxEl('cxImpText').value.trim(); if (t) cxImpRead(t); else { cxEl('cxImpError').textContent = 'Choose a file, or paste the export here first.'; cxEl('cxImpError').hidden = false; } });
  cxEl('cxImpBack').addEventListener('click', () => { cxImpShow('cxImpPick'); });
  cxEl('cxImpSelNew').addEventListener('click', () => { cxImp.selected = new Set(cxImp.releases.filter(r => r.status === 'new').map(r => r.idx)); cxImpRender(); });
  cxEl('cxImpSelNone').addEventListener('click', () => { cxImp.selected = new Set(); cxImpRender(); });
  cxEl('cxImpGo').addEventListener('click', async () => {
    const btn = cxEl('cxImpGo'), label = btn.textContent, o = cxGetBoxes('cxImp'); btn.disabled = true;
    if (Date.now() - (state.catalogFetchedAt || 0) > DUP_FRESH_MS) { btn.textContent = 'Checking your crate\u2026'; try { await fetchCatalog(); } catch (e) { console.warn('refresh before import failed', e); } }
    const go = [], skipped = [];
    cxImp.releases.filter(r => cxImp.selected.has(r.idx)).forEach(r => { if (dupVerdict(dupMatches(r)) === 'exact') skipped.push(r); else go.push({ idx: r.idx, shaped: cxShape(r, o) }); });   // it may have been added since the review (another tab, another device)
    btn.textContent = label; cxImp.skipped = skipped;
    if (!go.length) { flashGlobalToast('Everything selected is already in your crate \u2014 nothing to add.'); cxImpRender(); return; }
    cxImpRun(go);
  });
  cxEl('cxImpCancel').addEventListener('click', () => { cxImp.cancel = true; cxEl('cxImpCancel').disabled = true; cxEl('cxImpProgText').textContent = 'Stopping after this one\u2026'; });
  cxEl('cxImpRetry').addEventListener('click', () => { const f = cxImp.failed.map(x => ({ idx: x.idx, shaped: x.shaped })); cxEl('cxImpRetry').hidden = true; cxImpRun(f); });
  cxEl('cxImpDone').addEventListener('click', () => { ov.hidden = true; cxImp = null; });
  ov.addEventListener('change', (e) => {
    if (!cxImp || !cxImp.releases) return;
    const pick = e.target.closest('[data-cx="pick"]');
    if (pick) { const idx = Number(pick.closest('[data-idx]').dataset.idx); if (pick.checked) cxImp.selected.add(idx); else cxImp.selected.delete(idx); }
    cxImpRender();                           // a link / tracklist / cover box changed, or a pick: the totals and rows follow
  });
  ov.addEventListener('click', (e) => {
    const p = e.target.closest('[data-cx-preset]');
    if (p) { const l = cxPresetLinks(p.dataset.cxPreset); CX_KINDS.forEach(k => { cxEl('cxImp' + CX_LINK_IDS[k]).checked = l[k]; }); if (cxImp && cxImp.releases) cxImpRender(); return; }
    const t = e.target.closest('[data-cxtab]'); if (t && cxImp) { cxImp.filter = t.dataset.cxtab; cxImpRender(); return; }
    const v = e.target.closest('[data-cxview]'); if (v && cxImp) { cxImp.view = v.dataset.cxview; try { localStorage.setItem(CX_VIEW_KEY, cxImp.view); } catch (err) { /* not remembered */ } cxImpRender(); }
  });
}
function initCrateExchange() {
  cxEl('menuExportCrate').addEventListener('click', openCxExport);
  cxEl('menuImportCrate').addEventListener('click', openCxImport);
  cxEl('menuImportRym').addEventListener('click', rymImportFromMenu);
  cxEl('menuTidyNames').addEventListener('click', rymTidyNames);
  cxEl('menuFillTracklists').addEventListener('click', rymFillTracklists);
  cxEl('menuUpdateNever').addEventListener('click', rymUpdateNever);
  cxEl('menuPickMood').addEventListener('click', () => { el.layoutMenu.hidden = true; openMoodPicker(); });
  cxEl('menuMergeDupes').addEventListener('click', () => { el.layoutMenu.hidden = true; openMergeDialog(); });
}

/* ---------- Duplicate protection when adding ----------
   Adding a release that is already in the crate is caught in three places. As you fill in the Add form a banner says so: an EXACT
   duplicate (same album, same edition) can't be added at all, and a probable different edition (a descriptor, bracketed note,
   catalogue number or year that differs) needs an explicit "yes, add this as a separate edition". Search results are marked
   "In your crate" before you pick. And Save checks again on its own — first refreshing the crate if the app's copy is more than two
   minutes old, so a release added from another device is still caught. Importing follows the same rule. */
const DUP_FRESH_MS = 120000;
let dupIdxRaw = null, dupIdx = null, addDupState = { verdict: 'none', matches: [], confirmed: false, sig: '' };
function dupIndex() {
  if (dupIdx && dupIdxRaw === state.raw) return dupIdx;
  dupIdxRaw = state.raw; dupIdx = new Map();
  state.raw.forEach(it => { const k = dupKey(it.artist, it.title); if (!k) return; if (!dupIdx.has(k)) dupIdx.set(k, []); dupIdx.get(k).push(it); });
  return dupIdx;
}
function dupMatches(cand) {            // cand: { artist, title, descriptor, catalog, releaseDate } -> what you own that is the same album, exact matches first
  const k = dupKey(cand.artist, cand.title); if (!k) return [];
  return (dupIndex().get(k) || []).map(item => Object.assign({ item }, dupCompare(cand, item))).sort((a, b) => (a.level === 'exact' ? 0 : 1) - (b.level === 'exact' ? 0 : 1));
}
function dupLabel(it) { const y = String(it.releaseDate || '').slice(0, 4); return `${it.artist} \u2014 ${it.title}${y ? ` (${y})` : ''}${it.descriptor ? ` \u00b7 ${it.descriptor}` : ''}`; }
function dupChipHtml(artist, title, catalog, date) {      // for a search result: it is one specific pressing
  const v = dupVerdict(dupMatches({ artist, title, catalog, releaseDate: date, descriptor: '' }));
  if (v === 'exact') return ' <span class="add-result-owned" title="This release is already in your crate">In your crate</span>';
  if (v === 'edition') return ' <span class="add-result-owned edition" title="You have this album, but a different edition of it">Another edition in your crate</span>';
  return '';
}
function addDupCandidate() { return { artist: el.addArtist.value.trim(), title: el.addTitle.value.trim(), descriptor: el.addDescriptor.value.trim(), catalog: el.addCatalog.value.trim(), releaseDate: getReleaseDateFields('add') }; }
function addDupApplyButton() {
  const blocked = addDupState.verdict === 'exact' || (addDupState.verdict === 'edition' && !addDupState.confirmed);
  el.addSaveBtn.disabled = blocked;
  el.addSaveBtn.title = blocked ? (addDupState.verdict === 'exact' ? 'Already in your crate' : 'Tick the box above to add this as a separate edition') : '';
}
function addDupRefresh() {
  const bar = document.getElementById('addDupBanner'), c = addDupCandidate();
  const matches = c.artist && c.title ? dupMatches(c) : [], verdict = dupVerdict(matches);
  const sig = verdict + '|' + matches.map(m => m.item.row).join(',');
  if (sig !== addDupState.sig) addDupState.confirmed = false;               // a different situation: an earlier "yes" doesn't carry over
  Object.assign(addDupState, { sig, verdict, matches });
  if (verdict === 'none') { bar.hidden = true; bar.innerHTML = ''; }
  else {
    const best = matches[0], open = `<div class="add-dup-actions"><button type="button" class="ai-link-btn" data-dup="open" data-row="${escapeHtml(String(best.item.row))}">Open ${verdict === 'exact' ? 'it' : 'yours'}</button></div>`;
    bar.innerHTML = verdict === 'exact'
      ? `<div class="add-dup add-dup-exact"><b>Already in your crate</b> \u2014 ${escapeHtml(dupLabel(best.item))}. Adding it again would create a duplicate, so it can\u2019t be added.${open}</div>`
      : `<div class="add-dup add-dup-edition"><b>You already have this album</b> \u2014 ${escapeHtml(dupLabel(best.item))}. This looks like a different edition: ${escapeHtml(best.diffs.join('; '))}. Add it only if you want both.<label class="add-dup-confirm"><input type="checkbox" id="addDupConfirm"${addDupState.confirmed ? ' checked' : ''}> Yes, add this as a separate edition</label>${open}</div>`;
    bar.hidden = false;
  }
  addDupApplyButton();
}
async function addDupGuard() {         // true = fine to save. Authoritative: it doesn't trust what the banner last showed.
  if (Date.now() - (state.catalogFetchedAt || 0) > DUP_FRESH_MS) {
    const label = el.addSaveBtn.textContent; el.addSaveBtn.disabled = true; el.addSaveBtn.textContent = 'Checking your crate\u2026';
    try { await fetchCatalog(); } catch (e) { console.warn('refresh before duplicate check failed', e); }
    el.addSaveBtn.textContent = label;
  }
  addDupRefresh();
  if (addDupState.verdict === 'exact') { flashToast(el.addToast, 'Already in your crate \u2014 not added'); return false; }
  if (addDupState.verdict === 'edition' && !addDupState.confirmed) { flashToast(el.addToast, 'You already have another edition \u2014 tick the box to add this one too'); return false; }
  return true;
}
function initDupGuard() {
  const form = document.getElementById('addForm'), bar = document.getElementById('addDupBanner'); let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(addDupRefresh, 200); };
  form.addEventListener('input', later); form.addEventListener('change', later);
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-dup="open"]'); if (!b) return; const item = state.raw.find(r => String(r.row) === b.dataset.row); if (item) { closeAddModal(); openDeck(item); } });
  bar.addEventListener('change', (e) => { if (e.target.id === 'addDupConfirm') { addDupState.confirmed = e.target.checked; addDupApplyButton(); } });
}
