// (1.135.161) Add a release: the earliest release first. The release the search is most likely after (the top result's artist and title)
// is shown at the very top in its own box, "Earliest release · Original · 1982": of all its pressings and editions in the results, the
// one with the earliest date. Worked out again as each source answers (a later one may have an earlier date); the rest stay where they
// were. Picking it fills the form as before.
let aeSeq = -1, aeKey = '';
(function () {
  const bR = buildReleaseResultRow;
  buildReleaseResultRow = function (hit) { const row = bR.apply(this, arguments); try { if (row && hit) row.dataset.date = String(hit.date || '').slice(0, 10); } catch (e) { /* fine */ } return row; };
  if (typeof addSrcRow === 'function') { const bS = addSrcRow; addSrcRow = function (r) { const row = bS.apply(this, arguments); try { if (row && r) row.dataset.date = String(r.date || '').slice(0, 10); } catch (e) { /* fine */ } return row; }; }
})();
function aeRows() { return [...el.addResults.querySelectorAll('.add-result-row[data-dup-key], .add-result-card[data-dup-key]')]; }
function aeRun() {
  if (!el.addResults || el.addOverlay.hidden) return;
  if (aeSeq !== addSearchSeq) { aeSeq = addSearchSeq; aeKey = ''; }
  const box = el.addResults.querySelector('.add-earliest'), inBox = box ? box.querySelector('[data-dup-key]') : null;
  const rows = aeRows().filter(r => !r.hidden || r === inBox);
  if (!aeKey) { const first = rows.find(r => r !== inBox); if (!first) return; aeKey = first.dataset.dupKey; }
  const dated = rows.filter(r => r.dataset.dupKey === aeKey && /^\d{4}/.test(r.dataset.date || ''));
  if (!dated.length) return;
  const best = dated.slice().sort((a, b) => a.dataset.date.slice(0, 4).localeCompare(b.dataset.date.slice(0, 4)) || (b.dataset.date.length - a.dataset.date.length) || a.dataset.date.localeCompare(b.dataset.date))[0];
  if (best === inBox) return;
  let b = box;
  if (!b) { b = document.createElement('div'); b.className = 'add-earliest'; el.addResults.insertBefore(b, el.addResults.firstChild); }
  if (inBox && inBox._aeHome) { inBox._aeHome.insertBefore(inBox, inBox._aeHome.firstChild); }
  best._aeHome = best.parentNode;
  const y = best.dataset.date.slice(0, 4), later = dated.filter(r => r !== best).length;
  b.innerHTML = `<div class="add-earliest-head"><span class="add-earliest-badge">Original · ${escapeHtml(y)}</span><span>Earliest release${later ? ` of ${later + 1} editions found` : ''}</span></div>`;
  b.appendChild(best);
}
(function () {
  if (!el.addResults) return;
  let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(aeRun, 120); }).observe(el.addResults, { childList: true, subtree: true });
})();
