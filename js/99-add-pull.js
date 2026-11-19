// (1.135.212) Add a release: its details pulled as soon as it is picked, before you add it. MusicBrainz, Discogs, Spotify and iTunes are
// asked at once (the same lookups as Pull details), and what the form still has blank is filled in as they answer: label, catalogue
// number, the release type (1.135.214: Album, EP, Single, Compilation, Live, Mixtape), the full release date (a year made a date in that year), cover, genre, and the tracklist. Only blanks: anything you typed, or
// that came with the release you picked, stays. A better source answering later takes over from a weaker one, unless you changed it.
// The summary says what is being asked and where each detail came from; after adding, "Fill blanks from other sources" still fills
// anything none of them had (and RYM's update brings its genres and ratings).
const APL_TYPES = ['Album', 'EP', 'Single', 'Compilation', 'Live', 'Mixtape'];
const APL_ORDER = { type: ['mb', 'dc', 'sp', 'it'], label: ['mb', 'dc', 'sp'], catalog: ['mb', 'dc'], date: ['mb', 'sp', 'dc', 'it'], cover: ['mb', 'it', 'sp', 'dc'], genre: ['dc', 'it'], tracks: ['mb', 'sp', 'it', 'dc'] };
const APL_NAME = { mb: 'MusicBrainz', dc: 'Discogs', sp: 'Spotify', it: 'iTunes' };
const apl = { seq: 0, st: {}, got: {}, filled: {}, timer: 0, key: '' };
const aplF = (id) => document.getElementById(id);
function aplDate() { const y = (aplF('addReleaseYear') || {}).value || '', m = (aplF('addReleaseMonth') || {}).value || '', d = (aplF('addReleaseDay') || {}).value || ''; return [y, m && String(m).padStart(2, '0'), d && String(d).padStart(2, '0')].filter(Boolean).join('-'); }
function aplNow(f) {
  if (f === 'date') return aplDate();
  if (f === 'type') { const v = (el.addType || {}).value || ''; return apl.typeGiven || apl.typeTouched || apl.filled.type ? v : (v === 'Album' ? '' : v); }          // (1.135.214) Album, the form's default, counts as not known yet
  if (f === 'tracks') return typeof collectTracklistBuilderRows === 'function' && el.addTracksRows ? collectTracklistBuilderRows(el.addTracksRows).filter(t => t && t.title).length : 0;
  const n = aplF({ label: 'addLabel', catalog: 'addCatalog', cover: 'addCover', genre: 'addGenre' }[f]); return n ? String(n.value || '').trim() : '';
}
function aplSet(f, v, k) {
  if (f === 'date') setReleaseDateFields('add', v);
  else if (f === 'type') { el.addType.value = v; }
  else if (f === 'tracks') renderTracklistBuilderRows(el.addTracksRows, v.map(t => ({ title: t.title, durationMs: t.durationMs || 0, section: t.section || '', s: PD_TL_SRC[k] || 'lookup' })));
  else { const n = aplF({ label: 'addLabel', catalog: 'addCatalog', cover: 'addCover', genre: 'addGenre' }[f]); if (n) { n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); } }
  apl.filled[f] = { k, mark: f === 'tracks' ? v.length : f === 'date' ? aplDate() : f === 'type' ? el.addType.value : String(v) };
}
function aplMine(f) { const x = apl.filled[f]; return !!x && String(aplNow(f)) === String(x.mark); }          // still what was pulled (you haven't changed it)
function aplApply() {
  ['type', 'label', 'catalog', 'date', 'cover', 'genre', 'tracks'].forEach(f => {
    if (f === 'type' && (apl.typeGiven || apl.typeTouched)) return;          // the release you picked said what it is, or you chose
    const now = aplNow(f), mine = aplMine(f), rank = (k) => APL_ORDER[f].indexOf(k);
    if (now && !mine && !(f === 'date' && /^\d{4}$/.test(String(now)))) return;          // yours, or the release's own: kept (a bare year may become a full date)
    for (const k of APL_ORDER[f]) {
      const d = apl.got[k]; if (!d || d.err) { if (apl.st[k] === 'ask') break; continue; }          // (a better source still answering: wait for it)
      let v = d[f]; if (f === 'tracks') { if (!(v && v.length)) continue; } else { v = String(v || '').trim(); if (!v) continue; }
      if (f === 'catalog' && typeof dgCatKey === 'function' && !dgCatKey(v)) continue;
      if (f === 'type') { v = APL_TYPES.find(t => t.toLowerCase() === v.toLowerCase()) || (/^comp/i.test(v) ? 'Compilation' : ''); if (!v) continue; }
      if (f === 'date') { const have = mine ? '' : String(now || ''); if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(v) || (have && !(v.startsWith(have) && v.length > have.length))) continue; }
      if (mine && rank(apl.filled[f].k) <= rank(k)) break;          // already from this source, or a better one
      aplSet(f, v, k); break;
    }
  });
}
async function aplRun() {
  const artist = (el.addArtist.value || '').trim(), title = (el.addTitle.value || '').trim(); if (!artist || !title || el.addForm.hidden) return;
  const key = artist.toLowerCase() + '|' + title.toLowerCase(); if (key === apl.key) return;
  const me = ++apl.seq; Object.assign(apl, { key, st: {}, got: {}, filled: {} });
  const item = { artist, title, catalog: aplNow('catalog'), link: (aplF('addLink') || {}).value || '', releaseDate: aplDate() };
  const fns = { mb: typeof pdFromMb === 'function' && pdFromMb, dc: typeof pdFromDiscogs === 'function' && pdFromDiscogs, sp: typeof pdFromSpotify === 'function' && pdFromSpotify, it: typeof pdFromItunes === 'function' && pdFromItunes };
  const ks = Object.keys(fns).filter(k => fns[k]); ks.forEach(k => { apl.st[k] = 'ask'; }); aplPaint();
  await Promise.all(ks.map(async k => {
    let d; try { const pr = Promise.resolve().then(() => fns[k](item)); pr.catch(() => {}); d = await Promise.race([pr, new Promise(r => setTimeout(() => r({ err: 'took too long' }), 15000))]); } catch (e) { d = { err: String((e && e.message) || e) }; }          // (1.135.220: a lookup that loses the race and fails later is caught, not an "Unhandled rejection")
    if (me !== apl.seq || el.addOverlay.hidden) return;
    apl.got[k] = d || { err: 'nothing' }; apl.st[k] = d && !d.err ? 'ok' : 'none';
    aplApply(); if (typeof qaPaint === 'function') qaPaint(); aplPaint();
  }));
}
function aplPaint() {          // a line in the summary: what is being asked, and what came from where
  const c = document.getElementById('qaCard'); if (!c) return; let n = c.querySelector('.apl-line');
  const ks = Object.keys(apl.st); if (!ks.length) { if (n) n.remove(); return; }
  const by = {}; Object.entries(apl.filled).forEach(([f, x]) => { if (aplMine(f)) (by[x.k] = by[x.k] || []).push({ type: 'type', label: 'label', catalog: 'cat. no.', date: 'date', cover: 'cover', genre: 'genre', tracks: 'tracklist' }[f]); });
  const busy = ks.some(k => apl.st[k] === 'ask');
  const html = `<span class="apl-h">${busy ? '<i class="apl-spin" aria-hidden="true"></i>Pulling details' : 'Details pulled'}</span>${ks.map(k => `<span class="apl-s apl-${apl.st[k]}" title="${apl.st[k] === 'none' && apl.got[k] && apl.got[k].err ? escapeHtml(String(apl.got[k].err)) : ''}">${APL_NAME[k]} ${apl.st[k] === 'ask' ? '…' : apl.st[k] === 'ok' ? '✓' : '–'}${by[k] ? ` <em>${by[k].join(', ')}</em>` : ''}</span>`).join('')}`;
  if (!n) { n = document.createElement('div'); n.className = 'apl-line'; n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); }
  const rows = c.querySelector('.qa-rows'); if (rows && n.parentNode !== rows) rows.insertAdjacentElement('afterbegin', n);
  if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
}
(function () {
  if (typeof showAddForm === 'function') { const base = showAddForm; showAddForm = function (prefill) { const ty = prefill && String(prefill.type || ''); apl.typeGiven = !!ty && ty !== 'Album' && APL_TYPES.includes(ty); apl.typeTouched = false; const r = base.apply(this, arguments); apl.key = ''; clearTimeout(apl.timer); apl.timer = setTimeout(aplRun, 250); return r; }; }
  if (el.addType) el.addType.addEventListener('change', () => { apl.typeTouched = true; });          // (you chose it: kept)
  if (typeof qaPaint === 'function') { const base = qaPaint; qaPaint = function () { const r = base.apply(this, arguments); try { aplPaint(); } catch (e) { /* as it was */ } return r; }; }
  ['openAddModal', 'closeAddModal'].forEach(n => { if (typeof window[n] !== 'function') return; const base = window[n]; window[n] = function () { apl.seq++; apl.key = ''; apl.st = {}; return base.apply(this, arguments); }; });
})();
