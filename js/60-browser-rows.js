// CRATE — (1.135.30) WHAT THE BROWSER'S ROWS SHOW. ⚙ → Panels configuration → Show Categories (Left Panel) → Panel Settings… opens
// "Music browser rows": a tab for each way of browsing. Albums: the cover's size, line 1, line 2 and line 3 (each up to three fields, joined
// with ·), and a figure on the right (release length, year, rating…), the ! for songs with no link, and dimming what you haven't listened to.
// Artists, Labels and Years: a second line and the figure on the right from what's in each (releases, years, average rating, length, plays).
// Genres and Descriptors: the count on the right or nothing. A preview draws real rows with the browser's own code. Kept in this browser.
// The right-hand figure sits in a column of its own width, right-aligned, so every row lines up.
const BR_KEY = 'crate_browser_rows_v1';
const BR_DEFAULT = {
  album: { l1: ['title'], l2: ['artist'], l3: [], right: '', flag: true, dim: false },
  artist: { l2: [], right: 'count' }, label: { l2: [], right: 'count' }, year: { l2: [], right: 'count' },
  genre: { right: 'count' }, descriptor: { right: 'count' }
};
let brCfg = null;
function brAll() {
  if (!brCfg) { let o = {}; try { o = JSON.parse(localStorage.getItem(BR_KEY) || '{}') || {}; } catch (e) { o = {}; } brCfg = {}; Object.keys(BR_DEFAULT).forEach(m => { brCfg[m] = Object.assign({}, BR_DEFAULT[m], o[m] || {}); }); }
  return brCfg;
}
function brOf(mode) { return brAll()[mode] || BR_DEFAULT.album; }
function brSave() { try { localStorage.setItem(BR_KEY, JSON.stringify(brAll())); } catch (e) { /* this visit only */ } }

// ----- fields -----
const BR_ALBUM_FIELDS = [
  ['title', 'Title'], ['artist', 'Artist'], ['year', 'Year'], ['date', 'Release date'], ['length', 'Release length'], ['songs', 'Songs'],
  ['genre', 'Genre'], ['genre2', 'Secondary genre'], ['label', 'Label'], ['catalog', 'Catalog #'], ['type', 'Type'], ['rating', 'Your rating'],
  ['rym', 'RYM rating'], ['plays', 'Plays'], ['added', 'Date added'], ['desc', 'Descriptors'], ['region', 'Region']
];
const BR_GROUP_FIELDS = [['count', 'Count'], ['releases', 'Releases'], ['years', 'Years'], ['avg', 'Average rating'], ['length', 'Total length'], ['plays', 'Plays']];
const brMs = (it) => { const tr = typeof csTracksOf === 'function' ? csTracksOf(it) : null; return tr ? tr.reduce((s, t) => s + (t.ms || 0), 0) : 0; };
const brDate = (v) => { const s = String(v || ''); if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s.slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } return s.slice(0, 4); };
const brStars = (r) => { r = Number(r) || 0; if (!r) return ''; const f = Math.floor(r); return '★'.repeat(f) + (r - f >= 0.5 ? '½' : ''); };
function brAlbumVal(k, it) {
  switch (k) {
    case 'title': return it.title || '';
    case 'artist': return it.artist || '';
    case 'year': return String(it.releaseDate || '').slice(0, 4);
    case 'date': return brDate(it.releaseDate);
    case 'length': { const ms = brMs(it); return ms ? formatDuration(ms) : ''; }
    case 'songs': { const tr = typeof csTracksOf === 'function' ? csTracksOf(it) : null; return tr ? tr.length + ' song' + (tr.length === 1 ? '' : 's') : ''; }
    case 'genre': return String(it.genre || '').split(',')[0].trim();
    case 'genre2': return String(it.genre2 || '').split(',')[0].trim();
    case 'label': return it.label || '';
    case 'catalog': return it.catalog || '';
    case 'type': return it.type && it.type !== 'Unknown' ? it.type : '';
    case 'rating': return brStars(it.rating);
    case 'rym': return Number(it.rymRating) > 0 ? Number(it.rymRating).toFixed(2) : '';
    case 'plays': { const n = typeof scrobbleCountFor === 'function' ? scrobbleCountFor(it.artist, it.title) : 0; return n ? n + ' play' + (n === 1 ? '' : 's') : ''; }
    case 'added': return brDate(it.dateAdded);
    case 'desc': return typeof parseDescriptors === 'function' ? parseDescriptors(it.rymDescriptors).slice(0, 3).join(', ') : '';
    case 'region': return it.region || '';
  }
  return '';
}
// what's in each Artist / Label / Year row, from the releases the browser is listing
let brSourceRaw = null, brGroupCache = null;
function brGroupKeysOf(mode, r) {
  if (mode === 'artist') return typeof artistParts === 'function' ? artistParts(r.artist) : [r.artist];
  if (mode === 'label') return typeof labelKeysOf === 'function' ? labelKeysOf(r) : [];
  if (mode === 'year') { const y = dateVal(r.releaseDate) !== -Infinity ? new Date(r.releaseDate).getUTCFullYear() : null; return [y ? String(y) : 'Unknown']; }
  return [];
}
function brGroupItems(mode, key) {
  const src = brSourceRaw || state.raw || [];
  if (!brGroupCache || brGroupCache.src !== src || brGroupCache.n !== src.length || brGroupCache.mode !== mode) {
    const m = new Map(); src.forEach(r => brGroupKeysOf(mode, r).forEach(k => { if (!m.has(k)) m.set(k, []); m.get(k).push(r); }));
    brGroupCache = { src, n: src.length, mode, m };
  }
  return brGroupCache.m.get(key) || [];
}
function brGroupVal(k, mode, entry) {
  if (k === 'count') return String(Math.round((entry.count || 0) * 10) / 10);
  const its = brGroupItems(mode, entry.key);
  if (k === 'releases') return its.length ? its.length + ' release' + (its.length === 1 ? '' : 's') : '';
  if (k === 'years') { const ys = its.map(r => +String(r.releaseDate || '').slice(0, 4)).filter(Boolean); if (!ys.length) return ''; const a = Math.min(...ys), b = Math.max(...ys); return a === b ? String(a) : a + '–' + b; }
  if (k === 'avg') { const rs = its.map(r => Number(r.rating) || 0).filter(Boolean); return rs.length ? '★ ' + (rs.reduce((x, y) => x + y, 0) / rs.length).toFixed(1) : ''; }
  if (k === 'length') { const ms = its.reduce((s, r) => s + brMs(r), 0); if (!ms) return ''; const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000); return h ? `${h} h ${m} min` : `${m} min`; }
  if (k === 'plays') { const n = its.reduce((s, r) => s + (typeof scrobbleCountFor === 'function' ? scrobbleCountFor(r.artist, r.title) : 0), 0); return n ? String(n) : ''; }
  return '';
}
const brLine = (vals) => vals.filter(Boolean).join(' · ');
// ----- the rows (buildLeftRow calls these) -----
function brAlbumRowHtml(entry) {
  const c = brOf('album'), it = entry.item, v = (ks) => brLine((ks || []).map(k => brAlbumVal(k, it)));
  const l1 = v(c.l1) || it.title, l2 = v(c.l2), l3 = v(c.l3), right = c.right ? brAlbumVal(c.right, it) : '';
  return `<img class="left-thumb art" data-key="${entry.artKey}" alt="">
      <div class="left-row-text">
        <p class="left-row-title">${c.flag !== false && typeof linkFlagHtml === 'function' ? linkFlagHtml(it, 'before') : ''}${escapeHtml(l1)}</p>
        ${l2 ? `<p class="left-row-sub">${escapeHtml(l2)}</p>` : ''}${l3 ? `<p class="left-row-sub br-l3">${escapeHtml(l3)}</p>` : ''}
      </div>${c.right ? `<span class="br-right" title="${escapeHtml((BR_ALBUM_FIELDS.find(f => f[0] === c.right) || [])[1] || '')}">${escapeHtml(right)}</span>` : ''}`;
}
function brAlbumDim(it) { return !!brOf('album').dim && typeof hasLoggedListen === 'function' && !hasLoggedListen(it); }
function brGroupLine2(mode, entry) { const c = brOf(mode); return brLine((c.l2 || []).map(k => brGroupVal(k, mode, entry))); }
function brGroupRight(mode, entry) { const c = brOf(mode); return c.right === 'count' || !c.right ? null : brGroupVal(c.right, mode, entry); }          // null: the usual count badge
function brGroupHideCount(mode) { return brOf(mode).right === ''; }

// ----- the settings window -----
const BR_TABS = [['album', 'Albums'], ['artist', 'Artists'], ['label', 'Labels'], ['year', 'Years'], ['genre', 'Genres'], ['descriptor', 'Descriptors']];
let brTab = 'album';
function brSel(name, cur, opts, blank) {
  return `<select class="br-sel" data-br="${name}">${blank ? `<option value=""${cur ? '' : ' selected'}>${blank}</option>` : ''}${opts.map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`;
}
function brLineSlots(name, list, opts, max) {
  const vals = (list || []).slice(0, max); while (vals.length < max) vals.push('');
  return vals.map((v, i) => (i ? '<span class="br-dot" aria-hidden="true">·</span>' : '') + brSel(`${name}:${i}`, v, opts, '—')).join('');
}
function brPreviewEntries(mode) {
  const raw = state.raw || [];
  if (mode === 'album') return (state.filtered && state.filtered.length ? state.filtered : raw).slice(0, 6).map(r => ({ key: r.row, artKey: artKey(r), label: r.title, sub: r.artist, count: null, item: r }));
  if (mode === 'artist') return groupCountWithSample(raw, r => artistParts(r.artist)).sort((a, b) => b.count - a.count).slice(0, 6);
  if (mode === 'year') return groupCountWithSample(raw, r => { const y = dateVal(r.releaseDate) !== -Infinity ? new Date(r.releaseDate).getUTCFullYear() : null; return y ? String(y) : 'Unknown'; }).sort((a, b) => b.label.localeCompare(a.label)).slice(0, 6);
  if (mode === 'label') return labelEntries(raw).map(e => ({ key: e.key, label: e.label, sub: '', count: e.count, sampleKey: artKey(e.sample) })).sort((a, b) => b.count - a.count).slice(0, 6);
  if (mode === 'genre') return buildGenreTree(raw, state.genreTaxonomy).filter(r => r.depth === 0).sort((a, b) => b.count - a.count).slice(0, 6).map(r => Object.assign({}, r, { depth: 0 }));
  return [...descLibrary(raw).values()].sort((a, b) => b.count - a.count).slice(0, 6).map(e => ({ key: e.key, label: e.label, count: e.count, cat: descCatOf(e.key) }));
}
function brRender() {
  const m = document.getElementById('browserRowsModal'); if (!m) return;
  const c = brOf(brTab), tabs = BR_TABS.map(([k, l]) => `<button type="button" class="br-tab${k === brTab ? ' on' : ''}" data-br-tab="${k}" role="tab" aria-selected="${k === brTab}">${l}</button>`).join('');
  const row = (label, ctl, hint) => `<div class="br-row"><span class="br-lbl">${label}</span><div class="br-ctl">${ctl}</div>${hint ? `<span class="br-hint">${hint}</span>` : ''}</div>`;
  let form = '';
  if (brTab === 'album' || brTab === 'artist') {
    const sizes = [['none', 'Off'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
    form += row(brTab === 'artist' ? 'Picture' : 'Cover', `<span class="br-seg">${sizes.map(([v, l]) => `<button type="button" class="${(state.leftThumbSize || 'medium') === v ? 'on' : ''}" data-br-thumb="${v}">${l}</button>`).join('')}</span>`, 'the same for every way of browsing');
  }
  if (brTab === 'album') {
    form += row('Line 1', brLineSlots('l1', c.l1, BR_ALBUM_FIELDS, 3));
    form += row('Line 2', brLineSlots('l2', c.l2, BR_ALBUM_FIELDS, 3));
    form += row('Line 3', brLineSlots('l3', c.l3, BR_ALBUM_FIELDS, 3));
    form += row('On the right', brSel('right', c.right, BR_ALBUM_FIELDS, 'Nothing'));
    form += `<div class="br-sep"></div>`;
    form += row('', `<label class="br-ck"><input type="checkbox" data-br-ck="flag"${c.flag !== false ? ' checked' : ''}> The ! for releases with songs that have no link</label>`);
    form += row('', `<label class="br-ck"><input type="checkbox" data-br-ck="dim"${c.dim ? ' checked' : ''}> Dim releases you haven’t listened to</label>`);
  } else if (brTab === 'artist' || brTab === 'label' || brTab === 'year') {
    const opts = BR_GROUP_FIELDS.filter(f => f[0] !== 'count');
    form += row('Line 2', brLineSlots('l2', c.l2, opts, 3));
    form += row('On the right', brSel('right', c.right, BR_GROUP_FIELDS, 'Nothing'), c.right === 'count' && brTab !== 'label' ? 'the count shows how much of the discography you have, once it’s known' : '');
  } else {
    form += row('On the right', brSel('right', c.right, [['count', 'Count']], 'Nothing'));
  }
  const prev = document.createElement('div'); prev.className = 'left-list br-preview-list thumb-' + (state.leftThumbSize || 'medium');
  brPreviewEntries(brTab).forEach(en => { const r = buildLeftRow(en, brTab); r.tabIndex = -1; r.removeAttribute('tabindex'); prev.appendChild(r); });
  m.querySelector('.br-tabs').innerHTML = tabs;
  m.querySelector('.br-form').innerHTML = form;
  const pv = m.querySelector('.br-preview'); pv.innerHTML = ''; pv.appendChild(prev);
  if (!prev.children.length) pv.innerHTML = '<p class="br-hint">Nothing to show yet.</p>';
  if (typeof applyCachedArt === 'function') applyCachedArt();
}
function brChanged() { brSave(); brGroupCache = null; if (typeof buildLeftList === 'function') buildLeftList(); brRender(); }
function openBrowserRowsSettings() {
  let m = document.getElementById('browserRowsModal');
  if (!m) {
    m = document.createElement('div'); m.id = 'browserRowsModal'; m.className = 'floating-modal br-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-labelledby', 'brTitle');
    m.innerHTML = `<div class="arrange-header"><h2 id="brTitle">Music browser rows</h2><button type="button" class="modal-x" data-br-close aria-label="Close">✕</button></div>
      <p class="br-intro">What each row in the browser column shows. Each way of browsing keeps its own.</p>
      <div class="br-tabs" role="tablist"></div>
      <div class="br-body"><div class="br-form"></div><div class="br-side"><div class="br-side-h">Preview</div><div class="br-preview"></div></div></div>
      <div class="br-foot"><button type="button" class="config-btn" data-br-reset>Reset this tab</button><button type="button" class="config-btn br-done" data-br-close>Done</button></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-br-close')) { m.hidden = true; return; }
      if (t.dataset.brTab) { brTab = t.dataset.brTab; brRender(); return; }
      if (t.dataset.brThumb) { state.leftThumbSize = t.dataset.brThumb; if (typeof savePrefs === 'function') savePrefs(); brChanged(); return; }
      if (t.hasAttribute('data-br-reset')) { brAll()[brTab] = Object.assign({}, BR_DEFAULT[brTab]); brChanged(); }
    });
    m.addEventListener('change', (e) => {
      const t = e.target, c = brOf(brTab);
      if (t.dataset.brCk) { c[t.dataset.brCk] = t.checked; brChanged(); return; }
      const name = t.dataset.br; if (!name) return;
      if (name === 'right') { c.right = t.value; brChanged(); return; }
      const [line, i] = name.split(':'), arr = (c[line] || []).slice(); while (arr.length <= +i) arr.push('');
      arr[+i] = t.value; c[line] = arr.filter(Boolean); brChanged();
    });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); m.hidden = true; } });
  }
  m.hidden = false; brRender();
  const f = m.querySelector('.br-tab.on'); if (f) f.focus();
}
(function wireBrowserRows() {
  const row = document.getElementById('toggleLeftPanel'), label = row && row.closest('label');
  if (!label || document.getElementById('browserRowsBtn')) return;
  const wrap = document.createElement('div'); wrap.className = 'arrange-row br-arrange-row';
  label.parentNode.insertBefore(wrap, label); wrap.appendChild(label); label.classList.remove('arrange-row'); label.classList.add('br-arrange-label');
  const b = document.createElement('button'); b.type = 'button'; b.id = 'browserRowsBtn'; b.className = 'config-btn layout-row-configure'; b.textContent = 'Panel Settings …'; b.title = 'What each row in the browser column shows';
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openBrowserRowsSettings(); });
  wrap.appendChild(b);
})();
