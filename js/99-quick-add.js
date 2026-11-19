// (1.135.178) Add a release, the quicker way (trial; canvas: CRATE adding a release, "A in your panel, one picked").
// Once a release is picked from the search, the long form folds away behind a summary: its cover, title, artist, type, year, label and
// catalogue, its genres and tracklist (each with Edit, which opens the full form at that field), your rating, and what happens by itself
// afterwards (its Rate Your Music update, then its songs matched). Add to crate, or Add and add another (the search comes back with the
// same words). Enter adds. "All fields" opens the whole form as before; ⚙ › Add a release: the classic layout switches the trial off.
const QA_KEY = 'crate_quick_add_v1';
function qaOn() { try { return localStorage.getItem(QA_KEY) !== '0'; } catch (e) { return true; } }
const qa = { open: false, again: null, timer: 0 };
const qaV = (id) => { const e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
function qaDate() { const y = qaV('addReleaseYear'), m = qaV('addReleaseMonth'), d = qaV('addReleaseDay'); return [y, m && m.padStart(2, '0'), d && d.padStart(2, '0')].filter(Boolean).join('-'); }
function qaTracks() {
  const rows = document.querySelectorAll('#addTracksRows .tb-row, #addTracksRows [data-tb-row], #addTracksRows > div');
  const n = [...rows].filter(r => { const i = r.querySelector('input'); return i && String(i.value || '').trim(); }).length;
  const mb = document.getElementById('addMusicBrainzMatchBanner'), sp = document.getElementById('addSpotifyMatchBanner');
  return { n, mb: mb && !mb.hidden ? (document.getElementById('addMusicBrainzMatchText') || {}).textContent || 'Found on MusicBrainz' : '', sp: sp && !sp.hidden ? (document.getElementById('addSpotifyMatchText') || {}).textContent || 'Found on Spotify' : '' };
}
function qaPaint() {
  const form = el.addForm; if (!form || form.hidden || !qaOn()) { const c = document.getElementById('qaCard'); if (c) c.remove(); if (form) form.classList.remove('qa-on', 'qa-open'); el.addOverlay.classList.remove('qa-picked'); return; }
  form.classList.add('qa-on'); form.classList.toggle('qa-open', qa.open);
  el.addOverlay.classList.add('qa-picked');          // (the search and its results fold away: "Back to results" brings them back)
  let c = document.getElementById('qaCard');
  if (!c) { c = document.createElement('div'); c.id = 'qaCard'; c.className = 'qa-card'; const dup = document.getElementById('addDupBanner'); (dup || form.firstChild).insertAdjacentElement(dup ? 'afterend' : 'beforebegin', c); }
  const cover = qaV('addCover'), title = qaV('addTitle'), artist = qaV('addArtist'), type = qaV('addType'), fmt = qaV('addFormat'), date = qaDate(), label = qaV('addLabel'), cat = qaV('addCatalog');
  const g1 = qaV('addGenre'), g2 = qaV('addGenre2'), loc = qaV('addLocation') || qaV('addRegion'), rr = qaV('addRymRating'), tr = qaTracks();
  const rymOn = !!state.rymUpdateOnAdd, matchOn = typeof smPrefs === 'function' && !!smPrefs().autoMatchNew;
  const row = (k, label, val, hint) => `<div class="qa-kv"><span>${label}</span><span>${val ? escapeHtml(val) : `<em>${hint || 'none yet'}</em>`}</span><button type="button" data-qa-edit="${k}">Edit</button></div>`;
  const q = el.addSearchInput.value.trim(), nRes = el.addResults.querySelectorAll('.add-result-row:not([hidden]), .add-result-card:not([hidden])').length;
  const html = `${q || nRes ? `<button type="button" class="qa-back" data-qa-back>\u2190 Back to results${q ? ` for \u201c${escapeHtml(q)}\u201d` : ''}${nRes ? ` \u00b7 ${nRes}` : ''}</button>` : ''}<div class="qa-top">${cover ? `<img src="${escapeHtml(cover)}" alt="" class="qa-cv">` : '<span class="qa-cv qa-nocv"></span>'}<div class="qa-t">
      <div class="qa-title">${escapeHtml(title || 'Untitled')}</div><div class="qa-art"><b>${escapeHtml(artist || 'Unknown artist')}</b> <span>${[type, date].filter(Boolean).map(escapeHtml).join(' · ')}</span></div>
      <div class="qa-sub">${[label, cat, fmt].filter(Boolean).map(escapeHtml).join(' · ') || '<em>no label or catalogue number</em>'}</div></div></div>
    <div class="qa-rows">
      ${row('addGenre', 'Genre', [g1, g2].filter(Boolean).join(' · '), rymOn ? 'from RYM, after its update' : 'none yet')}
      ${row('addTracksRows', 'Tracklist', tr.n ? `${tr.n} song${tr.n === 1 ? '' : 's'}` : '', tr.mb || tr.sp ? '' : 'found after adding')}
      ${tr.n ? '' : tr.mb ? `<div class="qa-found">${escapeHtml(tr.mb)} <button type="button" data-qa-use="mb">Use it</button></div>` : tr.sp ? `<div class="qa-found">${escapeHtml(tr.sp)} <button type="button" data-qa-use="sp">Use it</button></div>` : ''}
      ${row('addLocation', 'From', loc)}
      ${row('addRymRating', 'RYM', rr ? `${rr}${qaV('addRymVotes') ? ' from ' + qaV('addRymVotes') + ' ratings' : ''}` : '', rymOn ? 'after its update' : 'none yet')}
      <button type="button" class="qa-all" data-qa-all aria-expanded="${qa.open}">${qa.open ? 'Fold the form away ▴' : 'All fields (label, catalogue, recorded, scene, links, tracklist…) ▾'}</button>
    </div>
    <div class="qa-then"><span class="qa-lbl">Then, by itself</span>
      <label><input type="checkbox" data-qa-then="rym"${rymOn ? ' checked' : ''}> Update from Rate Your Music</label>
      <label><input type="checkbox" data-qa-then="match"${matchOn ? ' checked' : ''}> Match songs on Spotify and YouTube</label></div>
    <div class="qa-acts"><button type="button" class="qa-add" data-qa-add>Add to crate</button><button type="button" class="qa-again" data-qa-add="again">Add, and add another</button></div>`;
  if (c.dataset.h !== html) { c.dataset.h = html; c.innerHTML = html; }
}
(function () {
  if (typeof showAddForm === 'function') { const base = showAddForm; showAddForm = function () { const r = base.apply(this, arguments); qa.open = false; qaPaint(); clearInterval(qa.timer); qa.timer = setInterval(() => { if (el.addOverlay.hidden) { clearInterval(qa.timer); return; } qaPaint(); }, 800); return r; }; }
  if (typeof closeAddModal === 'function') { const base = closeAddModal; closeAddModal = function () { const r = base.apply(this, arguments); clearInterval(qa.timer); const q = qa.again; qa.again = null; if (q != null && typeof openAddModalSearch === 'function') setTimeout(() => openAddModalSearch(q), 350); return r; }; }
  document.addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('#qaCard'); if (!card) return;
    if (e.target.closest('[data-qa-back]')) { el.addForm.hidden = true; qaPaint(); el.addSearchInput.focus(); return; }
    const ed = e.target.closest('[data-qa-edit]'), all = e.target.closest('[data-qa-all]'), use = e.target.closest('[data-qa-use]'), add = e.target.closest('[data-qa-add]');
    if (ed || all) { qa.open = all ? !qa.open : true; qaPaint(); if (ed) { const f = document.getElementById(ed.dataset.qaEdit); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (f.focus) setTimeout(() => f.focus(), 250); } } return; }
    if (use) { const b = document.getElementById(use.dataset.qaUse === 'mb' ? 'addMusicBrainzMatchAddBtn' : 'addSpotifyMatchAddBtn'); if (b) b.click(); setTimeout(qaPaint, 300); return; }
    if (add) { if (add.dataset.qaAdd === 'again') qa.again = el.addSearchInput.value || ''; el.addSaveBtn.click(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target.closest && e.target.closest('[data-qa-then]'); if (!t) return;
    if (t.dataset.qaThen === 'rym') { state.rymUpdateOnAdd = t.checked; try { savePrefs(); } catch (er) { /* this visit */ } }
    else if (typeof smPrefsSave === 'function') smPrefsSave({ autoMatchNew: t.checked });
  });
  // Enter adds (from the summary, or any one-line field of the form), unless a list or a suggestion is open
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !qaOn() || !el.addForm || el.addForm.hidden || el.addOverlay.hidden) return;
    const t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.id === 'addSearchInput' || (t.closest && t.closest('#addTracksRows, .desc-suggest, [role="listbox"]')))) return;
    if (t && t.tagName === 'INPUT' && !el.addForm.contains(t)) return;
    e.preventDefault(); el.addSaveBtn.click();
  });
  // ⚙ › Add a release: the classic layout
  const after = document.getElementById('menuRadio') || document.getElementById('menuMusicDb'); if (after) {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'menuQuickAdd'; b.setAttribute('aria-pressed', String(qaOn()));
    const paint = () => { b.textContent = qaOn() ? 'Add a release: quick (trial) ✓' : 'Add a release: classic form'; b.setAttribute('aria-pressed', String(qaOn())); };
    b.title = 'Quick: a summary of the picked release with Add; Classic: the whole form'; paint();
    b.addEventListener('click', () => { try { localStorage.setItem(QA_KEY, qaOn() ? '0' : '1'); } catch (e) { /* fine */ } paint(); qaPaint(); });
    after.insertAdjacentElement('afterend', b);
  }
})();
