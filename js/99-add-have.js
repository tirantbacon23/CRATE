// (1.135.186) Add a release: "Already in your crate", as you type (canvas: CRATE adding a release, board A).
// The words in the search box are checked against your crate while you type (and after a pasted link is read): a release of yours whose
// artist and title they match is named above the results, with its year and your rating, Open (its deck) and "Add another edition"
// (which puts the warning away for these words). Words that only match an artist say how many of theirs you have, quietly.
const ahv = { t: 0, dismissed: '' };
const ahvFold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
function ahvFind(q) {
  const words = ahvFold(q).split(' ').filter(w => w.length >= 2 && !/^(the|a|an|and|of|by)$/.test(w)); if (!words.length || /^https?:/i.test(q)) return null;
  const rels = [], byArtist = [];
  (state.raw || []).forEach(it => {
    const a = ahvFold(it.artist), t = ahvFold(it.title), at = ' ' + a + ' ' + t + ' ';
    if (!words.every(w => at.includes(' ' + w) )) return;
    const inTitle = words.filter(w => (' ' + t + ' ').includes(' ' + w)).length;
    if (inTitle) rels.push({ it, score: inTitle + (words.every(w => (' ' + t + ' ').includes(' ' + w)) ? 2 : 0) + ((' ' + t + ' ') === ' ' + words.filter(w => !(' ' + a + ' ').includes(' ' + w)).join(' ') + ' ' ? 3 : 0) });
    else byArtist.push(it);
  });
  rels.sort((x, y) => y.score - x.score);
  return { rels: rels.slice(0, 3).map(r => r.it), more: Math.max(0, rels.length - 3), artist: byArtist };
}
function ahvPaint() {
  const inp = el.addSearchInput; if (!inp) return; let b = document.getElementById('addHaveBanner');
  const q = inp.value.trim(), f = q.length >= 3 && q !== ahv.dismissed ? ahvFind(q) : null;
  if (!f || (!f.rels.length && !f.artist.length)) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'addHaveBanner'; b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite'); const after = document.querySelector('#addOverlay .apx-hint') || inp.closest('.add-search-row'); after.insertAdjacentElement('afterend', b); }
  const yr = (it) => String(it.releaseDate || '').slice(0, 4), rt = (it) => Number(it.rating) ? ` ★ ${it.rating}` : '';
  let html;
  if (f.rels.length) {
    b.className = 'ahv ahv-warn';
    html = `<span class="ahv-i" aria-hidden="true">!</span><div class="ahv-t"><b>Already in your crate:</b> ${f.rels.map(it => `<span class="ahv-rel">${escapeHtml(it.title)} <em>${escapeHtml(it.artist)}${yr(it) ? ' · ' + yr(it) : ''}${rt(it)}</em> <button type="button" data-ahv-open="${escapeHtml(String(it.row))}">Open</button></span>`).join('')}${f.more ? ` <em>and ${f.more} more</em>` : ''}</div><button type="button" class="ahv-again" data-ahv-dismiss>Add another edition</button>`;
  } else {
    b.className = 'ahv ahv-quiet';
    const names = f.artist.slice().sort((x, y) => String(x.releaseDate || '').localeCompare(String(y.releaseDate || ''))).map(it => it.title);
    html = `<div class="ahv-t">You have ${f.artist.length} by ${escapeHtml(f.artist[0].artist)}: ${escapeHtml(names.slice(0, 4).join(', '))}${names.length > 4 ? ` and ${names.length - 4} more` : ''}</div>`;
  }
  if (b.dataset.h !== html) { b.dataset.h = html; b.innerHTML = html; }
}
(function () {
  if (!el.addSearchInput) return;
  el.addSearchInput.addEventListener('input', () => { clearTimeout(ahv.t); ahv.t = setTimeout(ahvPaint, 150); });
  if (typeof doAddSearch === 'function') { const base = doAddSearch; doAddSearch = function () { const r = base.apply(this, arguments); setTimeout(ahvPaint, 0); return r; }; }
  if (typeof openAddModal === 'function') { const base = openAddModal; openAddModal = function () { const r = base.apply(this, arguments); ahv.dismissed = ''; ahvPaint(); return r; }; }
  document.addEventListener('click', (e) => {
    const o = e.target.closest && e.target.closest('[data-ahv-open]'); if (o) { e.preventDefault(); const it = state.raw.find(r => String(r.row) === o.dataset.ahvOpen); if (it) { closeAddModal(); openDeck(it); } return; }
    if (e.target.closest && e.target.closest('[data-ahv-dismiss]')) { ahv.dismissed = el.addSearchInput.value.trim(); ahvPaint(); el.addSearchInput.focus(); }
  });
})();
