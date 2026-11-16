// CRATE — (1.135.39) A RELEASE'S FORMAT: the copy you have, as on Rate Your Music (Vinyl LP, Vinyl 7", CD, Cassette, Lossless digital…).
// Kept in the sheet's Format column (FormatSrc 'rym' when the RYM add-on filled it in from your RYM collection, so it may refresh it; one you
// set by hand is never replaced). Picked in Edit / Add release from RYM's formats, grouped, or typed in (Other…). Shown as a small tag beside the
// type in the browser rows (a field in Panel Settings), on the release card and in Track info.
const FORMAT_GROUPS = [
  ['Vinyl', ['Vinyl LP', 'Vinyl 12"', 'Vinyl 10"', 'Vinyl 7"']],
  ['Physical', ['CD', 'Cassette']],
  ['Digital', ['Lossless digital', 'Digital (lossy)']]
];
const FORMAT_SHORT = { 'vinyl lp': 'LP', 'vinyl 12"': '12"', 'vinyl 10"': '10"', 'vinyl 7"': '7"', 'cd': 'CD', 'cassette': 'Cassette', 'lossless digital': 'FLAC', 'digital (lossy)': 'MP3', 'digital': 'Digital' };
function formatShort(f) { const s = String(f || '').trim(); return FORMAT_SHORT[s.toLowerCase()] || s; }
function formatOf(it) { return it && it.format ? String(it.format).trim() : ''; }
// A tag for the rows and cards; the full name on hover
function formatTagHtml(it, cls) { const f = formatOf(it); return f ? `<span class="fmt-tag${cls ? ' ' + cls : ''}" title="${escapeHtml(f)}${it.formatSrc === 'rym' ? ' · from your Rate Your Music collection' : ''}">${escapeHtml(cls === 'fmt-long' ? f : formatShort(f))}</span>` : ''; }
function relTagsHtml(it) { const h = typeTagHtml(it) + formatTagHtml(it, 'fmt-long'); return h ? `<span class="rel-tags">${h}</span>` : ''; }          // the card, deck and quick peek
function typeTagHtml(it) { return it && it.type && it.type !== 'Unknown' ? `<span class="rel-type">${escapeHtml(it.type)}</span>` : ''; }

// The Format select in Edit / Add release
function formatFillSelect(sel, value) {
  if (!sel) return;
  const v = String(value || '').trim(), known = FORMAT_GROUPS.some(([, l]) => l.includes(v));
  sel.innerHTML = '<option value="">— none —</option>' + FORMAT_GROUPS.map(([g, l]) => `<optgroup label="${g}">${l.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}</optgroup>`).join('')
    + (v && !known ? `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>` : '') + '<option value="__other">Other… (type your own)</option>';
  sel.value = v; sel.dataset.was = v;
  if (!sel.dataset.fmtWired) {
    sel.dataset.fmtWired = '1';
    sel.addEventListener('change', () => {
      if (sel.value !== '__other') { sel.dataset.was = sel.value; return; }
      const t = (window.prompt('Format', '') || '').trim().slice(0, 60);
      if (t) formatFillSelect(sel, t); else sel.value = sel.dataset.was || '';
    });
  }
}
function formatSelVal(id) { const s = document.getElementById(id); return s && s.value !== '__other' ? s.value.trim() : ''; }
