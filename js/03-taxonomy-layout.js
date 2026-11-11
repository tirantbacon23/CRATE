// CRATE — genre taxonomy, panel layout, taxonomy import / export.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ===========================================================
   GENRE TAXONOMY
   ===========================================================
   Lets a genre belong under a broader one — Shoegaze under Alternative
   Rock, itself under Rock — so filtering by "Rock" also surfaces every
   genre beneath it. Per-browser (localStorage), same as Spotify/Discogs/
   YouTube API settings: this is a personal organizing scheme layered on
   top of the shared crate data, not crate data itself, so it doesn't
   round-trip through the Apps Script backend. */
const GENRE_TAXONOMY_KEY = 'crate_genre_taxonomy_v1';

// ---------- Panel layout (drag-and-drop element placement) ----------
// Modeled on MusicBee's own Panels Configuration: a fixed set of "elements"
// can each be assigned to whichever of their allowed panels, and the order
// within a panel's list is the stacking order shown there. Replaces the
// old system of three independent right-panel booleans
// (rightPanelShowQueue/History/TrackInfo) and an unconditional, fixed
// main-panel content — see migrateLegacyPanelLayout() for how an existing
// setup carries over untouched the first time this loads, and
// applyPanelLayout()/renderLayoutConfigUI() for where this actually gets
// used. "panels" on each element is the enforced allow-list — dragging
// Genre Description onto Right Panel, for instance, is rejected outright
// since it isn't in Genre Description's own list.
const LAYOUT_ELEMENTS = {
  musicView: { label: 'Music View', panels: ['main'] },
  genreDesc: { label: 'Genre Description', panels: ['main'] },
  chart: { label: 'Release Chart', panels: ['main'] },
  // The strip under the grid in the MusicBee reference — see renderArtistBioElement().
  artistBio: { label: 'Artist Biography', panels: ['main'] },
  // Now Playing Bar is display-only (art/title/artist, no transport
  // controls) — Main only, since "Bottom" previously meant something
  // confusing here: the docked player itself, conflating a decorative
  // element with the only UI for controlling playback at all (the exact
  // bug fixed last version). That's now its own separate element below.
  nowPlayingBar: { label: 'Now Playing Bar', panels: ['main'] },
  // The actual docked player (play/pause/seek/skip) — Top or Bottom of
  // the screen, never Main (it's not a panel-stacking element, it's a
  // fixed-position dock) and never removable from both at once — see
  // applyPlayerControlsPosition()'s own comment for why its render path
  // deliberately ignores "fully removed" as a possibility.
  playerControls: { label: 'Player Controls', panels: ['top', 'bottom'] },
  queue: { label: 'Up Next (Queue)', panels: ['right'] },
  lastfmHistory: { label: 'Last.fm History', panels: ['right'] },
  trackInfo: { label: 'Track Info', panels: ['right'] }
};
// Elements whose row in the Panels configuration gets a "Panel Settings…"
// button. The others (Genre Description, Release Chart, Player Controls) have
// nothing to configure beyond where they sit, and used to get the button
// anyway: clicking it closed the whole Panels dialog and opened nothing.
const LAYOUT_ELEMENTS_WITH_SETTINGS = new Set(['musicView', 'queue', 'lastfmHistory', 'trackInfo', 'nowPlayingBar', 'playerControls']);          // playerControls (1.95.25): the release bar's click and hover
const LAYOUT_PANEL_LABELS = { main: 'Main Panel', right: 'Right Panel', top: 'Top', bottom: 'Bottom' };


// A modest starting point covering common, widely-known genre
// relationships (not any one site's specific/proprietary taxonomy) —
// exactly as editable and removable as anything added by hand afterward
// via "Genre Taxonomy…". Only seeded on a genuinely first run (see
// loadGenreTaxonomy) — an empty {} the person has actually saved (e.g.
// after removing everything) is respected as-is, not re-seeded.
// Each entry can now have MULTIPLE parents — a genre is often a fusion of
// two others (Glam Punk = Punk Rock + Glam Rock), not always a single
// clean branch. `parents` is always an array from here on; loadGenreTaxonomy
// migrates any legacy single-`parent` string entry (from before this
// supported more than one) into a one-item array automatically.
const DEFAULT_GENRE_TAXONOMY = {
  'alternative rock': { label: 'Alternative Rock', parents: ['Rock'] },
  'shoegaze': { label: 'Shoegaze', parents: ['Alternative Rock'] },
  'post-punk': { label: 'Post-Punk', parents: ['Rock'] },
  'punk rock': { label: 'Punk Rock', parents: ['Rock'] },
  'glam rock': { label: 'Glam Rock', parents: ['Rock'] },
  'glam punk': { label: 'Glam Punk', parents: ['Punk Rock', 'Glam Rock'] },
  'indie rock': { label: 'Indie Rock', parents: ['Rock'] },
  'psychedelic rock': { label: 'Psychedelic Rock', parents: ['Rock'] },
  'progressive rock': { label: 'Progressive Rock', parents: ['Rock'] },
  'metal': { label: 'Metal', parents: ['Rock'] },
  'heavy metal': { label: 'Heavy Metal', parents: ['Metal'] },
  'black metal': { label: 'Black Metal', parents: ['Metal'] },
  'death metal': { label: 'Death Metal', parents: ['Metal'] },
  'doom metal': { label: 'Doom Metal', parents: ['Metal'] },
  'house': { label: 'House', parents: ['Electronic'] },
  'techno': { label: 'Techno', parents: ['Electronic'] },
  'ambient': { label: 'Ambient', parents: ['Electronic'] },
  'idm': { label: 'IDM', parents: ['Electronic'] },
  'drum and bass': { label: 'Drum and Bass', parents: ['Electronic'] },
  'dubstep': { label: 'Dubstep', parents: ['Electronic'] },
  'downtempo': { label: 'Downtempo', parents: ['Electronic'] },
  'trip hop': { label: 'Trip Hop', parents: ['Electronic'] },
  'synth-pop': { label: 'Synth-pop', parents: ['Pop'] },
  'dream pop': { label: 'Dream Pop', parents: ['Pop'] },
  'bebop': { label: 'Bebop', parents: ['Jazz'] },
  'free jazz': { label: 'Free Jazz', parents: ['Jazz'] },
  'fusion': { label: 'Fusion', parents: ['Jazz'] },
  'trap': { label: 'Trap', parents: ['Hip Hop'] },
  'boom bap': { label: 'Boom Bap', parents: ['Hip Hop'] },
  'neo-soul': { label: 'Neo-Soul', parents: ['Soul'] },
  'funk': { label: 'Funk', parents: ['Soul'] },
  'folk rock': { label: 'Folk Rock', parents: ['Folk', 'Rock'] },
};

function genreTaxonomyKey(g) { return (g || '').trim().toLowerCase(); }

function loadGenreTaxonomy() {
  let taxonomy;
  try {
    const raw = localStorage.getItem(GENRE_TAXONOMY_KEY);
    taxonomy = raw === null ? JSON.parse(JSON.stringify(DEFAULT_GENRE_TAXONOMY)) : (JSON.parse(raw) || {}); // null = first run ever — seed defaults
  } catch (e) {
    taxonomy = JSON.parse(JSON.stringify(DEFAULT_GENRE_TAXONOMY));
  }
  // Migrate any pre-multi-parent entry (singular `parent: "X"`, from
  // 1.29.80/81) into the current `parents: ["X"]` array shape.
  Object.values(taxonomy).forEach(entry => {
    if (entry && typeof entry.parent === 'string' && !entry.parents) {
      entry.parents = entry.parent ? [entry.parent] : [];
      delete entry.parent;
    } else if (entry && !Array.isArray(entry.parents)) {
      entry.parents = [];
    }
  });
  return taxonomy;
}
function saveGenreTaxonomy(taxonomy, opts) {
  try { localStorage.setItem(GENRE_TAXONOMY_KEY, JSON.stringify(taxonomy)); }
  catch (e) { /* ignore */ }
  if (!opts || !opts.skipSync) rymWarnTaxonomyBig(taxonomy);
  // Synced to the backend (per-account, not per-browser — see doGet/
  // doPost's own genreTaxonomy/saveGenreTaxonomy handling) unless this
  // call is just refreshing the local cache FROM a value already received
  // from the backend (fetchCatalog's own response handling below) — re-
  // posting that back would just be a wasted round-trip of data that's
  // already there. Fire-and-forget: a taxonomy edit is a small, infrequent
  // action, not worth blocking the UI on the network request, and the
  // localStorage write just above always succeeds regardless of network
  // state, so a sync failure here just means the NEXT edit (or the next
  // fetchCatalog, which re-applies whatever the backend actually holds)
  // is where any inconsistency would show up, not lost data outright.
  if (!opts || !opts.skipSync) {
    taxPostToAccount(taxonomy);          // (records whether the account really got it: a failure used to be only a console message)
  }
}

// BEGIN taxonomy-io
// Export, import and merge of the genre taxonomy ({ "shoegaze": { label, parents: [names], description?, rym?: { text, url, at } } }), so it can travel between browsers and devices.
// Nothing taken from a file is trusted: every entry is rebuilt from the few fields it may have, with their sizes capped, and a merge never leaves a genre as its own ancestor.
const TAX_FORMAT = 'genre-taxonomy', TAX_VERSION = 1, TAX_MAX_GENRES = 5000;
const taxKey = (s) => String(s == null ? '' : s).trim().toLowerCase();
function taxClean(e, key) {                                          // one entry rebuilt from what it may hold; null when it is not an entry
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const k = taxKey(key); if (!k || k.length > 200) return null;
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const parents = [], seen = new Set([k]);
  (Array.isArray(e.parents) ? e.parents : (typeof e.parent === 'string' && e.parent ? [e.parent] : [])).forEach(p => {
    const name = str(p, 200).trim().replace(/\s+/g, ' '), pk = taxKey(name);
    if (name && !seen.has(pk) && parents.length < 30) { seen.add(pk); parents.push(name); }
  });
  const out = { label: str(e.label, 200).trim().replace(/\s+/g, ' ') || String(key).trim(), parents };
  const d = str(e.description, 20000); if (d.trim()) out.description = d;
  if (e.rym && typeof e.rym === 'object' && str(e.rym.text, 20000).trim()) out.rym = { text: str(e.rym.text, 20000), url: str(e.rym.url, 500), at: str(e.rym.at, 40) };
  return out;
}
function taxCleanAll(tax) { const out = {}; Object.keys(tax || {}).forEach(k => { const c = taxClean(tax[k], k); if (c) out[taxKey(k)] = c; }); return out; }
function taxExport(taxonomy, now) {
  const src = taxCleanAll(taxonomy), tax = {}; Object.keys(src).sort().forEach(k => { tax[k] = src[k]; });
  return { crate: TAX_FORMAT, version: TAX_VERSION, exportedAt: new Date(now || Date.now()).toISOString(), genres: Object.keys(tax).length, taxonomy: tax };
}
function taxParse(text) {                                            // { ok, taxonomy, count, dropped } or { ok: false, error }
  let data; try { data = JSON.parse(String(text == null ? '' : text).trim()); } catch (e) { return { ok: false, error: 'That isn\u2019t a genre taxonomy: it could not be read as an exported file.' }; }
  if (data && typeof data === 'object' && data.crate && data.crate !== TAX_FORMAT) return { ok: false, error: 'That file is from CRATE but it isn\u2019t a genre taxonomy.' };
  if (data && typeof data === 'object' && data.crate === TAX_FORMAT && Number(data.version) > TAX_VERSION) return { ok: false, error: 'That file was made by a newer version of CRATE than this one: update the page first.' };
  const raw = data && typeof data === 'object' && data.crate === TAX_FORMAT ? data.taxonomy : data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'There are no genres in it.' };
  const keys = Object.keys(raw), tax = {}; let dropped = Math.max(0, keys.length - TAX_MAX_GENRES);
  keys.slice(0, TAX_MAX_GENRES).forEach(k => { const c = taxClean(raw[k], k); if (c) tax[taxKey(k)] = c; else dropped++; });
  const count = Object.keys(tax).length; if (!count) return { ok: false, error: 'There are no genres in it.' };
  return { ok: true, taxonomy: tax, count, dropped };
}
function taxSame(a, b) {
  const ps = (e) => JSON.stringify((e.parents || []).map(taxKey).sort());
  return a.label === b.label && ps(a) === ps(b) && (a.description || '') === (b.description || '') && ((a.rym && a.rym.text) || '') === ((b.rym && b.rym.text) || '');
}
function taxDiff(mine, theirs) {                                     // keys that are new in theirs, differ, are the same, or are only in mine
  const m = taxCleanAll(mine), t = taxCleanAll(theirs), out = { added: [], changed: [], same: [], mineOnly: [] };
  Object.keys(t).forEach(k => { if (!m[k]) out.added.push(k); else if (taxSame(m[k], t[k])) out.same.push(k); else out.changed.push(k); });
  Object.keys(m).forEach(k => { if (!t[k]) out.mineOnly.push(k); });
  return out;
}
function taxCutCycles(tax) {                                         // removes the parent link that closes any loop (a genre must never be its own ancestor); returns how many it removed
  const colour = {}; let cut = 0;
  const visit = (k) => {
    colour[k] = 1; const e = tax[k];
    if (e) for (let i = e.parents.length - 1; i >= 0; i--) { const pk = taxKey(e.parents[i]); if (!tax[pk]) continue; if (colour[pk] === 1) { e.parents.splice(i, 1); cut++; } else if (!colour[pk]) visit(pk); }
    colour[k] = 2;
  };
  Object.keys(tax).forEach(k => { if (!colour[k]) visit(k); });
  return cut;
}
function taxMerge(mine, theirs, mode) {                              // mode: 'keep' (add what is new, fill what I lack, keep mine otherwise) | 'theirs' (also take theirs where we differ) | 'replace'
  const m = taxCleanAll(mine), t = taxCleanAll(theirs); let out;
  if (mode === 'replace') out = t;
  else {
    out = m;
    Object.keys(t).forEach(k => {
      if (!out[k]) { out[k] = t[k]; return; }
      const mineE = out[k];
      if (mode === 'theirs') { const keepD = mineE.description, keepR = mineE.rym; out[k] = t[k]; if (!out[k].description && keepD) out[k].description = keepD; if (!out[k].rym && keepR) out[k].rym = keepR; }          // (an imported entry without a description never blanks one of mine)
      else { if (!mineE.description && t[k].description) mineE.description = t[k].description; if (!mineE.rym && t[k].rym) mineE.rym = t[k].rym; }
    });
  }
  const cut = taxCutCycles(out);
  return { taxonomy: out, cutLinks: cut };
}
// END taxonomy-io

// ---- Genre taxonomy: back it up, move it to another browser, and know whether it is saved to your account ----
const TAX_SYNC_KEY = 'crate_tax_sync_v1', TAX_PREV_KEY = 'crate_genre_taxonomy_prev_v1';
let taxPostSeq = 0, taxFailToasted = false, taxPlan = null;           // taxPlan: the import being looked at
const taxEl = (id) => document.getElementById(id);
function taxSyncState() { try { return JSON.parse(localStorage.getItem(TAX_SYNC_KEY) || '{}') || {}; } catch (e) { return {}; } }
function taxSyncSet(patch) { try { localStorage.setItem(TAX_SYNC_KEY, JSON.stringify(Object.assign(taxSyncState(), patch))); } catch (e) { /* not kept */ } taxStatusRender(); }
function taxIsDefault(tax) { const d = taxDiff(DEFAULT_GENRE_TAXONOMY, tax); return !d.added.length && !d.changed.length && !d.mineOnly.length; }
function taxPrev() { try { const p = JSON.parse(localStorage.getItem(TAX_PREV_KEY) || 'null'); return p && p.taxonomy ? p : null; } catch (e) { return null; } }
function taxPostToAccount(taxonomy) {                                  // saves to the account and records whether it worked (only the latest save counts)
  const seq = ++taxPostSeq; taxSyncSet({ dirty: true });
  return postUpdate({ action: 'saveGenreTaxonomy', taxonomy: JSON.stringify(taxonomy) })
    .then(() => { if (seq === taxPostSeq) taxSyncSet({ dirty: false, lastOkAt: Date.now(), lastErr: '', seeded: true }); return true; })
    .catch(e => {
      taxSyncSet({ lastErr: String((e && e.message) || e).slice(0, 200), lastErrAt: Date.now() });
      if (!taxFailToasted) { taxFailToasted = true; flashGlobalToast('Couldn\u2019t save the genre taxonomy to your account. It is kept on this device: open \u2699 \u2192 Genre Taxonomy to export it, or to try again.'); }
      console.warn('Genre taxonomy sync failed', e); return false;
    });
}
function taxStatusText() {
  const tax = state.genreTaxonomy || {}, n = Object.keys(tax).length; let size = 0; try { size = JSON.stringify(tax).length; } catch (e) { size = 0; }
  const st = taxSyncState(), kb = Math.max(1, Math.round(size / 1024)), when = (t) => t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  let line;
  if (size > 45000 && !state.backendTaxChunks) line = `It is too long for your spreadsheet script to store: update apps-script-backend.gs (see the update log). Until then it is kept on this device only: export it to carry it elsewhere.`;
  else if (st.dirty && st.lastErr) line = `NOT saved to your account: the last try failed (${st.lastErr}${st.lastErrAt ? ', ' + when(st.lastErrAt) : ''}). It is kept on this device. Press \u201cSave to my account now\u201d to try again.`;
  else if (st.dirty) line = 'Changes not saved to your account yet.';
  else if (st.lastOkAt) line = `Saved to your account on ${when(st.lastOkAt)}: every browser you sign in on gets this copy.`;
  else line = 'Not saved to your account from this browser yet.';
  return `${n} genre${n === 1 ? '' : 's'} \u00b7 ${kb} KB. ${line}`;
}
function taxStatusRender() { const e = taxEl('taxSyncStatus'); if (e) e.textContent = taxStatusText(); const u = taxEl('taxUndoBtn'); if (u) u.hidden = !taxPrev(); }
function taxExportFile() {
  const env = taxExport(state.genreTaxonomy), text = JSON.stringify(env, null, 1), d = new Date(), pad = (n) => String(n).padStart(2, '0');
  const name = `crate-genre-taxonomy-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  flashGlobalToast(`Exported ${env.genres} genre${env.genres === 1 ? '' : 's'} to ${name}.`);
}
async function taxCopyText() {
  const text = JSON.stringify(taxExport(state.genreTaxonomy));
  try { await navigator.clipboard.writeText(text); flashGlobalToast('Copied the taxonomy as text: paste it into Import on the other device.'); }
  catch (e) { window.prompt('Copy this text (Ctrl+C), then paste it into Import on the other device:', text); }
}
function taxRefreshViews() { if (state.leftMode === 'genre') buildLeftList(); if (state.navFilter && state.navFilter.mode === 'genre') applyFiltersSort(); if (!el.genreTaxonomyOverlay.hidden) renderGenreTaxonomyEditor(); taxStatusRender(); }
function taxImportOpen() { taxPlan = null; taxEl('taxImportText').value = ''; taxEl('taxImportMsg').textContent = ''; taxEl('taxImportPlan').hidden = true; taxEl('taxImportOverlay').hidden = false; }
function taxImportRead(text) {
  const r = taxParse(text), msg = taxEl('taxImportMsg'), box = taxEl('taxImportPlan');
  if (!r.ok) { taxPlan = null; box.hidden = true; msg.textContent = r.error; msg.classList.add('bm-warn'); return; }
  msg.classList.remove('bm-warn'); taxPlan = { incoming: r.taxonomy, mode: 'keep' };
  msg.textContent = `Read ${r.count} genre${r.count === 1 ? '' : 's'}${r.dropped ? ` (${r.dropped} unusable entr${r.dropped === 1 ? 'y' : 'ies'} skipped)` : ''}.`;
  taxPlanRender();
}
function taxPlanRender() {
  const box = taxEl('taxImportPlan'); if (!taxPlan) { box.hidden = true; return; }
  const mine = state.genreTaxonomy, d = taxDiff(mine, taxPlan.incoming), m = taxPlan.mode, res = taxMerge(mine, taxPlan.incoming, m), after = Object.keys(res.taxonomy).length;
  const changed = m === 'theirs' ? d.changed.length : 0, removed = m === 'replace' ? d.mineOnly.length : 0;
  const opt = (v, t, sub) => `<label class="bm-opt${m === v ? ' on' : ''}"><input type="radio" name="taxMode" value="${v}"${m === v ? ' checked' : ''}><span class="bm-opt-t">${t}<small>${sub}</small></span></label>`;
  box.innerHTML = `<p class="arrange-hint"><b>Compared with yours:</b> ${d.added.length} new \u00b7 ${d.changed.length} different \u00b7 ${d.same.length} the same \u00b7 ${d.mineOnly.length} only yours.</p>`
    + `<div class="bm-opts">${opt('keep', 'Add what\u2019s new, keep mine where we differ', 'Genres you don\u2019t have are added and a missing description is filled in. Nothing of yours is changed.')}${opt('theirs', 'Add what\u2019s new, and use the imported version where we differ', 'Where a genre has other parents or another description, the imported one is used (a description of yours is never blanked).')}${opt('replace', 'Replace my whole taxonomy with this one', 'Genres only you have are removed.')}</div>`
    + `<p class="arrange-hint" id="taxPlanEffect" role="status">After this: ${after} genre${after === 1 ? '' : 's'} (${d.added.length} added${changed ? `, ${changed} changed` : ''}${removed ? `, ${removed} removed` : ''}${res.cutLinks ? `; ${res.cutLinks} parent link${res.cutLinks === 1 ? '' : 's'} left out so that no genre ends up under itself` : ''}). Your current taxonomy is kept first, so this can be undone.</p>`
    + `<div class="log-form-actions"><button type="button" id="taxImportApply" class="config-btn">Import</button></div>`;
  box.hidden = false;
}
function taxImportApply() {
  if (!taxPlan) return; const m = taxPlan.mode, res = taxMerge(state.genreTaxonomy, taxPlan.incoming, m), d = taxDiff(state.genreTaxonomy, taxPlan.incoming);
  if (m === 'replace' && d.mineOnly.length && !confirm(`Replace your whole taxonomy? ${d.mineOnly.length} genre${d.mineOnly.length === 1 ? '' : 's'} that only you have will be removed (you can undo this).`)) return;
  let kept = true; try { localStorage.setItem(TAX_PREV_KEY, JSON.stringify({ at: Date.now(), taxonomy: taxCleanAll(state.genreTaxonomy) })); } catch (e) { kept = false; }
  state.genreTaxonomy = res.taxonomy; saveGenreTaxonomy(state.genreTaxonomy);
  taxEl('taxImportOverlay').hidden = true; taxPlan = null; taxRefreshViews();
  flashGlobalToast(`Imported: the taxonomy now has ${Object.keys(res.taxonomy).length} genres${kept ? ' (Genre Taxonomy \u2192 Undo the last import puts it back)' : ' (an undo copy could not be kept)'}.`);
}
function taxUndoImport() {
  const prev = taxPrev(); if (!prev) { flashGlobalToast('There is no import to undo.'); return; }
  if (!confirm('Put back the genre taxonomy you had before the last import?')) return;
  state.genreTaxonomy = taxCleanAll(prev.taxonomy); try { localStorage.removeItem(TAX_PREV_KEY); } catch (e) { /* fine */ }
  saveGenreTaxonomy(state.genreTaxonomy); taxRefreshViews(); flashGlobalToast('Put back the taxonomy from before the import.');
}
async function taxSyncNow() { const ok = await taxPostToAccount(state.genreTaxonomy); flashGlobalToast(ok ? 'Saved the genre taxonomy to your account.' : 'Couldn\u2019t save it to your account: the note under the buttons says why.'); }
(function wireTaxonomyIo() {
  const ov = taxEl('taxImportOverlay'); if (!ov) return;
  taxEl('taxExportBtn').addEventListener('click', taxExportFile); taxEl('taxCopyBtn').addEventListener('click', taxCopyText); taxEl('taxImportBtn').addEventListener('click', taxImportOpen);
  taxEl('taxSyncBtn').addEventListener('click', taxSyncNow); taxEl('taxUndoBtn').addEventListener('click', taxUndoImport);
  taxEl('taxImportClose').addEventListener('click', () => { ov.hidden = true; taxPlan = null; });
  taxEl('taxImportPick').addEventListener('click', () => taxEl('taxImportFile').click());
  taxEl('taxImportFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; f.text().then(t => { taxEl('taxImportText').value = t.length > 200000 ? '' : t; taxImportRead(t); }); e.target.value = ''; });
  taxEl('taxImportRead').addEventListener('click', () => taxImportRead(taxEl('taxImportText').value));
  taxEl('taxImportPlan').addEventListener('change', (e) => { if (e.target.name === 'taxMode' && taxPlan) { taxPlan.mode = e.target.value; taxPlanRender(); } });
  taxEl('taxImportPlan').addEventListener('click', (e) => { if (e.target.id === 'taxImportApply') taxImportApply(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ov.hidden = true; taxPlan = null; } });
})();
