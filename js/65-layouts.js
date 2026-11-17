// CRATE — (1.135.51) TWO LOOKS FOR THE ALBUM VIEW AND FOR EDIT DETAILS, picked in ⚙ Settings ("Album view looks like", "Edit details looks like").
// Album view (the deck): A "Column": cover and details side by side, one row of main actions, the links under "Open on…" and the rarer actions
// under ⋯, compact songs. B "Tabs": the same in a header band, then tabs (Songs, Details, Diary, Notes) so one thing shows at a time.
// Edit details: A "Sections": the fields under headings, two to a row, Songs and More folded until opened. B "One at a time": a list of the
// sections down the side, one shown, a count of changes on each and at the foot. The fields are the same elements either way (moved once into
// their sections), so everything that fills and saves them works as before.
const LAYOUT_KEY = 'crate_layouts_v1';
function layoutPrefs() { try { return Object.assign({ deck: 'a', edit: 'a' }, JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') || {}); } catch (e) { return { deck: 'a', edit: 'a' }; } }
function layoutSet(k, v) { const p = layoutPrefs(); p[k] = v; try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(p)); } catch (e) { /* this visit */ } layoutMenuPaint(); if (k === 'deck') deckLayoutApply(); else editLayoutApply(); }
function layoutMenuPaint() { const p = layoutPrefs(); document.querySelectorAll('[data-layout-deck]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layoutDeck === p.deck))); document.querySelectorAll('[data-layout-edit]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layoutEdit === p.edit))); }

// ----- the album view -----
let deckLayoutReady = false, deckTab = 'songs';
function deckDrop(id, label, title, ids) {          // a button with a little menu of the given elements (moved into it; their own handlers stay)
  const wrap = document.createElement('div'); wrap.className = 'deck-drop'; wrap.id = id;
  wrap.innerHTML = `<button type="button" class="deck-btn deck-drop-btn" aria-haspopup="true" aria-expanded="false" title="${title}">${label}</button><div class="deck-drop-menu" role="menu" hidden></div>`;
  const menu = wrap.lastElementChild; ids.forEach(i => { const n = document.getElementById(i); if (n) menu.appendChild(n); });
  const btn = wrap.firstElementChild;
  btn.addEventListener('click', (e) => { e.stopPropagation(); const open = menu.hidden; document.querySelectorAll('.deck-drop-menu').forEach(m => { m.hidden = true; }); menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  menu.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  return wrap;
}
function deckLayoutInit() {
  if (deckLayoutReady) return; const deck = document.querySelector('#deckOverlay .deck'), bar = document.getElementById('deckActionsBar'); if (!deck || !bar) return;
  deckLayoutReady = true;
  // (1.135.54) the cover column holds only the cover: your stars go under the title, and the RYM line with its history goes in a row of its
  // own under the header (they made the cover's column wide, which pushed the title far to the right)
  const heading = deck.querySelector('.deck-heading'), rating = deck.querySelector('.deck-rating-row'), header = deck.querySelector('.deck-header');
  if (heading && rating) { const added = document.getElementById('deckAdded'); heading.insertBefore(rating, added || null); }
  const rymBox = document.createElement('div'); rymBox.className = 'deck-rym-block';
  ['deckRymRow', 'deckRymLog', 'deckRymHist'].forEach(i => { const n = document.getElementById(i); if (n) rymBox.appendChild(n); });
  if (header) header.insertAdjacentElement('afterend', rymBox);
  bar.appendChild(Object.assign(document.createElement('span'), { className: 'deck-bar-gap' }));
  bar.appendChild(deckDrop('deckOpenOn', '↗ Open on…', 'Listen link, Spotify, SoundCloud, Rate Your Music', ['deckLink', 'deckSpotifyLink', 'deckSoundcloudLink', 'deckRymLink']));
  bar.appendChild(deckDrop('deckMore', '⋯', 'More: edit details, edit tracks, full-release video', ['deckEditBtn', 'deckTrackGridBtn', 'deckFullVideoBtn', 'deckPlaylistRemoveBtn']));
  document.addEventListener('click', (e) => { if (!e.target.closest('.deck-drop')) document.querySelectorAll('.deck-drop-menu').forEach(m => { m.hidden = true; }); });
  // tabs (Tabs look): the body's sections, and a Details section made here
  const body = deck.querySelector('.deck-body'), secs = [...body.querySelectorAll(':scope > .deck-section')];
  const tagOf = (s) => s.querySelector('#deckTracklist') ? 'songs' : s.querySelector('#deckDiaryList') ? 'diary' : s.querySelector('#deckReview') ? 'notes' : s.classList.contains('deck-danger') ? 'details' : 'songs';
  secs.forEach(s => { s.dataset.deckTab = tagOf(s); });
  const det = document.createElement('section'); det.className = 'deck-section deck-details'; det.dataset.deckTab = 'details'; det.innerHTML = '<div id="deckDetailsBody" class="deck-kv"></div>';
  const danger = body.querySelector('.deck-danger'); body.insertBefore(det, danger || null);
  const tabs = document.createElement('div'); tabs.className = 'deck-tabs'; tabs.setAttribute('role', 'tablist');
  tabs.innerHTML = [['songs', 'Songs'], ['details', 'Details'], ['diary', 'Diary'], ['notes', 'Notes']].map(([k, l]) => `<button type="button" role="tab" data-deck-tab-btn="${k}">${l}</button>`).join('');
  body.parentNode.insertBefore(tabs, body);
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-deck-tab-btn]'); if (b) deckTabShow(b.dataset.deckTabBtn); });
}
function deckTabShow(t) {
  deckTab = t; const deck = document.querySelector('#deckOverlay .deck'); if (!deck) return;
  deck.querySelectorAll('[data-deck-tab-btn]').forEach(b => { const on = b.dataset.deckTabBtn === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  deck.querySelectorAll('.deck-body > .deck-section').forEach(s => s.classList.toggle('deck-tab-off', s.dataset.deckTab !== t));
}
function deckLayoutApply() {
  deckLayoutInit(); const deck = document.querySelector('#deckOverlay .deck'); if (!deck) return;
  const b = layoutPrefs().deck === 'b'; deck.classList.toggle('deck-look-a', !b); deck.classList.toggle('deck-look-b', b);
  if (b) deckTabShow(deckTab || 'songs'); else deck.querySelectorAll('.deck-tab-off').forEach(s => s.classList.remove('deck-tab-off'));
}
// What the Details tab lists, for the release open
function deckDetailsPaint(item) {
  const box = document.getElementById('deckDetailsBody'); if (!box || !item) return;
  const rows = [
    ['Released', typeof formatReleaseDate === 'function' ? formatReleaseDate(item) : item.releaseDate],
    ['Recorded', typeof formatRecordedDate === 'function' ? formatRecordedDate(item) : ''],
    ['Type', item.type && item.type !== 'Unknown' ? item.type : ''], ['Format', item.format || ''],
    ['Label', [item.label, item.catalog && !/^CRT-\d+$/i.test(item.catalog) ? item.catalog : ''].filter(Boolean).join(' · ')],
    ['Genres', typeof genreDisplayStr === 'function' ? genreDisplayStr(item) : item.genre],
    ['Descriptors', item.rymDescriptors || ''], ['Edition', item.descriptor || ''], ['Region', item.region || ''], ['Location', item.location || ''],
    ['Scene', item.scene || ''], ['Movement', item.movement || ''],
    ['RYM', item.rymRating ? `${Number(item.rymRating).toFixed(2)}${item.rymVotes ? ' · ' + Number(item.rymVotes).toLocaleString() + ' ratings' : ''}` : ''],
    ['Added', dateVal(item.dateAdded) !== -Infinity ? new Date(item.dateAdded).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '']
  ].filter(r => r[1]);
  box.innerHTML = rows.map(([k, v]) => `<span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span>`).join('');
}
function deckLayoutOnOpen(item) { deckTab = 'songs'; deckLayoutApply(); deckDetailsPaint(item); }          // (1.135.61: the figures column on the right is gone again)

// ----- Edit details -----
const ED_SECS = [
  ['release', 'The release', '', [['editArtist'], ['editTitle'], ['editType'], ['editFormat'], ['editReleaseYear', 1], ['editRecordedYear', 1]]],
  ['sound', 'Sound', 'genres and descriptors', [['editGenre'], ['editGenreDiscogsStatus', 1], ['editGenre2'], ['editRymDescriptors', 1]]],
  ['label', 'Label and place', '', [['editLabel'], ['editCatalog'], ['editRegion'], ['editLocation']]],
  ['links', 'Links', 'and Rate Your Music', [['editRymLink', 1], ['editLink'], ['editRymRating']]],
  ['songs', 'Songs', 'tracklist', [['editTracksRows', 1]]],
  ['more', 'More', 'edition, scene, movement, cover', [['editDescriptor'], ['editScene'], ['editMovement'], ['editCover', 1]]]
];
let edReady = false, edSnap = new Map(), edSec = 'release', edOpenFold = new Set();
function edFieldOf(id) { const n = document.getElementById(id); if (!n) return null; return n.closest('.add-field') || (n.tagName === 'P' ? n : n.parentElement); }
function editLayoutInit() {
  if (edReady) return; const form = document.querySelector('#editOverlay .add-form'); if (!form) return; edReady = true;
  const foot = form.querySelector('.log-form-actions'), toast = document.getElementById('editToast');
  const nav = document.createElement('div'); nav.className = 'ed-nav'; nav.setAttribute('role', 'tablist');
  const main = document.createElement('div'); main.className = 'ed-main';
  ED_SECS.forEach(([k, name, sub, fields]) => {
    const sec = document.createElement('div'); sec.className = 'ed-sec'; sec.dataset.sec = k;
    sec.innerHTML = `<button type="button" class="ed-sec-h" data-ed-fold="${k}"><span>${name}</span>${sub ? `<i>${sub}</i>` : ''}<b class="ed-n" hidden></b><span class="ed-caret" aria-hidden="true">▸</span></button><div class="ed-grid"></div>`;
    const grid = sec.lastElementChild;
    fields.forEach(([id, wide]) => { const f = edFieldOf(id); if (f && !main.contains(f)) { if (wide) f.classList.add('ed-wide'); grid.appendChild(f); } });
    main.appendChild(sec);
    nav.insertAdjacentHTML('beforeend', `<button type="button" role="tab" data-ed-sec="${k}">${name}<b class="ed-n" hidden></b></button>`);
  });
  // anything not placed (a field added later) goes under More, before the foot
  [...form.children].forEach(c => { if (c !== foot && c !== toast && !c.classList.contains('ed-wrap')) main.querySelector('[data-sec="more"] .ed-grid').appendChild(c); });
  const wrap = document.createElement('div'); wrap.className = 'ed-wrap'; wrap.append(nav, main);
  form.insertBefore(wrap, foot || null);
  if (foot) foot.insertAdjacentHTML('afterbegin', '<span class="ed-count" id="edCount"></span>');
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-ed-sec]'); if (b) edShow(b.dataset.edSec); });
  main.addEventListener('click', (e) => { const b = e.target.closest('[data-ed-fold]'); if (!b || layoutPrefs().edit === 'b') return; const k = b.dataset.edFold; if (edOpenFold.has(k)) edOpenFold.delete(k); else edOpenFold.add(k); editLayoutApply(); });
  form.addEventListener('input', edCountPaint); form.addEventListener('change', edCountPaint);
}
function edShow(k) { edSec = k; editLayoutApply(); }
function editLayoutApply() {
  editLayoutInit(); const form = document.querySelector('#editOverlay .add-form'); if (!form) return;
  const b = layoutPrefs().edit === 'b'; form.classList.toggle('ed-look-a', !b); form.classList.toggle('ed-look-b', b);
  form.querySelectorAll('.ed-sec').forEach(s => { const k = s.dataset.sec; s.classList.toggle('ed-off', b && k !== edSec); s.classList.toggle('ed-folded', !b && (k === 'songs' || k === 'more') && !edOpenFold.has(k)); });
  form.querySelectorAll('[data-ed-sec]').forEach(x => { const on = x.dataset.edSec === edSec; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
}
const edVal = (n) => n.type === 'checkbox' ? String(n.checked) : String(n.value);
function edCountPaint() {
  const form = document.querySelector('#editOverlay .add-form'); if (!form) return; let total = 0;
  form.querySelectorAll('.ed-sec').forEach(s => {
    let n = 0; s.querySelectorAll('input, select, textarea').forEach(i => { if (i.id && edSnap.has(i.id) && edSnap.get(i.id) !== edVal(i)) n++; });
    if (s.dataset.sec === 'songs' && edSnap.get('__tracks') !== (document.getElementById('editTracksRows') || {}).innerText) n = Math.max(n, 1);
    total += n; const k = s.dataset.sec;
    form.querySelectorAll(`[data-ed-sec="${k}"] .ed-n, .ed-sec[data-sec="${k}"] .ed-n`).forEach(x => { x.hidden = !n; x.textContent = String(n); });
  });
  const c = document.getElementById('edCount'); if (c) c.textContent = total ? `${total} change${total === 1 ? '' : 's'}` : '';
}
function editLayoutOnOpen() {
  editLayoutInit(); edSec = 'release'; edOpenFold.clear(); editLayoutApply();
  setTimeout(() => {          // after the form is filled (and its tracklist loaded)
    edSnap = new Map(); document.querySelectorAll('#editOverlay .add-form input, #editOverlay .add-form select, #editOverlay .add-form textarea').forEach(i => { if (i.id) edSnap.set(i.id, edVal(i)); });
    edSnap.set('__tracks', (document.getElementById('editTracksRows') || {}).innerText); edCountPaint();
  }, 400);
}

// ⚙ Settings
(function layoutWire() {
  const go = () => {
    document.querySelectorAll('[data-layout-deck]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); layoutSet('deck', b.dataset.layoutDeck); }));
    document.querySelectorAll('[data-layout-edit]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); layoutSet('edit', b.dataset.layoutEdit); }));
    layoutMenuPaint(); deckLayoutApply(); editLayoutApply();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
