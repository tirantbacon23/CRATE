// (1.135.180) Add a release: the search's editions grouped under their release (canvas: CRATE adding a release, "A in your panel").
// MusicBrainz's search answers with pressings, so one album came back as several rows (a reissue, a Japanese edition, a US one…). Now each
// release is one row: its earliest official pressing, in bold, which a click picks straight away; "N editions ▾" opens every pressing of it
// underneath (all of them, from MusicBrainz, earliest first), any of which a click picks instead. The list view only; the cover grid as before.
const ae = { cache: new Map() };
(function () {
  if (typeof buildReleaseResultRow !== 'function' || typeof doAddSearchMb !== 'function') return;
  const baseRow = buildReleaseResultRow;
  buildReleaseResultRow = function (hit, opts) {
    opts = opts || {};
    // a search hit picks its own pressing (the editions are right under it now), unless the classic flow is wanted
    const quick = opts.drillToPressings && !state.releaseSearchGridView && (typeof qaOn !== 'function' || qaOn());
    const row = baseRow.call(this, hit, quick ? Object.assign({}, opts, { drillToPressings: false }) : opts);
    try { row._aeHit = hit; row.dataset.aeRg = (hit['release-group'] && hit['release-group'].id) || ''; row.dataset.aeDate = hit.date || ''; row.dataset.aeStatus = hit.status || ''; if (quick) row.dataset.aeQuick = '1'; } catch (e) { /* plain row */ }
    return row;
  };
  const baseMb = doAddSearchMb;
  doAddSearchMb = async function (q, mySeq) {
    const r = await baseMb.apply(this, arguments);
    try { if (mySeq === addSearchSeq && !state.releaseSearchGridView) aeGroup(); } catch (e) { console.warn('editions grouping', e); }
    return r;
  };
})();
function aedKey(r) { return typeof pressingDateKey === 'function' ? pressingDateKey(r.date) : (r.date || null); }
function aedLead(hits) {          // the earliest official pressing (one with no status counts as official); undated ones never win
  const dated = hits.filter(h => aedKey(h)), off = dated.filter(h => !h.status || h.status === 'Official'), pool = off.length ? off : dated;
  if (!pool.length) return hits[0];
  return pool.slice().sort((a, b) => aedKey(a).localeCompare(aedKey(b)))[0];
}
function aeGroup() {
  const sec = typeof addSrcSec === 'function' ? addSrcSec('mb') : null, body = sec ? sec.querySelector('.add-src-body') : el.addResults; if (!body) return;
  const rows = [...body.querySelectorAll(':scope > .add-result-row[data-ae-rg]')]; if (!rows.length) return;
  const groups = new Map(); rows.forEach(r => { const k = r.dataset.aeRg || ('x' + Math.random()); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  groups.forEach((rs, rg) => {
    const lead = rs.find(r => r._aeHit === aedLead(rs.map(x => x._aeHit))) || rs[0];
    lead.classList.add('add-result-original', 'ae-lead'); lead.title = 'The earliest official pressing: click to pick it';
    rs[0].insertAdjacentElement('beforebegin', lead);
    const box = document.createElement('div'); box.className = 'ae-more'; box.hidden = true; box.dataset.aeRg = rg;
    rs.filter(r => r !== lead).sort((a, b) => String(aedKey(a._aeHit) || '9').localeCompare(String(aedKey(b._aeHit) || '9'))).forEach(r => { r.classList.add('ae-ed'); box.appendChild(r); });
    lead.insertAdjacentElement('afterend', box);
    if (!rg || rg.startsWith('x')) return;
    const n = rs.length - 1, chip = document.createElement('button'); chip.type = 'button'; chip.className = 'ae-chip'; chip.dataset.aeToggle = rg; chip.setAttribute('aria-expanded', 'false');
    chip.textContent = n ? `${n} more edition${n === 1 ? '' : 's'} ▾` : 'Editions ▾';
    chip.title = 'Every pressing of this release (labels, countries, reissues), earliest first';
    const host = lead.querySelector('.add-result-text, .add-result-info') || lead; host.appendChild(chip);
  });
}
async function aeToggle(chip) {
  const rg = chip.dataset.aeToggle, box = chip.closest('.add-result-row').nextElementSibling; if (!box || !box.classList.contains('ae-more')) return;
  const open = box.hidden; box.hidden = !open; chip.setAttribute('aria-expanded', String(open)); chip.textContent = chip.textContent.replace(/[▾▴]$/, open ? '▴' : '▾');
  if (!open || box.dataset.aeAll) return;
  // all of its pressings, from MusicBrainz (the search only brought some): added under the ones already here, earliest first
  box.dataset.aeAll = '1'; const note = document.createElement('p'); note.className = 'tracklist-status ae-note'; note.textContent = 'Looking up every pressing…'; box.appendChild(note);
  try {
    let rels = ae.cache.get(rg); if (!rels) { rels = await fetchReleasesForReleaseGroup(rg); ae.cache.set(rg, rels); }
    const lead = chip.closest('.add-result-row'), have = new Set([lead, ...box.querySelectorAll('.add-result-row')].map(r => r._aeHit && r._aeHit.id));
    const base = lead._aeHit || {}, art = (base['artist-credit'] || []).map(a => a.name + (a.joinphrase || '')).join('');
    const originals = typeof earliestPressingIds === 'function' ? earliestPressingIds(rels) : new Set();
    rels.filter(h => !have.has(h.id)).sort((a, b) => String(aedKey(a) || '9').localeCompare(String(aedKey(b) || '9'))).forEach(h => {
      const r = buildReleaseResultRow(h, { fallbackArtist: art, fallbackTitle: base.title, originalIssue: originals.has(h.id) }); r.classList.add('ae-ed'); box.appendChild(r);
    });
    note.remove();
    const total = box.querySelectorAll('.add-result-row').length; chip.textContent = `${total} more edition${total === 1 ? '' : 's'} ▴`;
    if (!total) { const p = document.createElement('p'); p.className = 'tracklist-status ae-note'; p.textContent = 'No other pressings on MusicBrainz.'; box.appendChild(p); }
  } catch (e) { note.textContent = 'Couldn’t look up the other pressings just now.'; delete box.dataset.aeAll; }
}
document.addEventListener('click', (e) => { const c = e.target.closest && e.target.closest('[data-ae-toggle]'); if (!c) return; e.preventDefault(); e.stopPropagation(); aeToggle(c); }, true);
