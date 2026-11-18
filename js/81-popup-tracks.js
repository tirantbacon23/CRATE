// ===== (1.135.136) The cover popup's songs: Roomy (two lines a song) or Compact (one line), and which columns, in which order =====
// Roomy (the usual): a song's name, and under it a quieter line with what you've given it (your rating, note, genre, credits…) and a
// thin bar of how it's played on Last.fm against the release's most played song; the numbers in columns at the right that always
// line up. Compact: one line a song, a real table, every other row shaded. Which columns and in which order, and what goes under the
// name, are chosen in the popup's ⚙ and in ⚙ › Panels configuration (the same controls). The songs' rows are made as before; this lays
// them out (one generated stylesheet), so the play button, the like, Heard, downloads and the headings keep working as they did.

const QPT_KEY = 'crate_qp_tracks_v1';
const QPT_COLS = [['num', 'Number', '#', '22px'], ['lf', 'Last.fm plays', 'Plays', '54px'], ['lfl', 'Last.fm listeners', 'Listeners', '62px'], ['you', 'Your plays', 'You', '36px'], ['rym', 'RYM song rating', 'RYM', '40px'], ['links', 'Links saved (S · Y)', 'S·Y', '30px'], ['len', 'Length', 'Len', '42px']];
const QPT_UNDER = [['rating', 'Your rating', '.qp-detail.qp-rating'], ['note', 'Your note', '.qp-detail.qp-note'], ['genre', 'Song genre', '.qp-detail[title="Track genre"]'], ['credits', 'Credits', '.qp-credits-btn'], ['listened', '✓ for the next diary entry', '.qp-detail.qp-listened'], ['lfbar', 'Last.fm bar', '.qpt-bar']];
const QPT_SEL = { play: '.album-quick-peek-track-play', num: '.album-quick-peek-track-num', name: '.album-quick-peek-track-name', heart: '.lk-qp', eye: '.hd-song', rt: '.qp-detail.qp-rating', lf: '.qp-lfp', lfl: '.qpt-lfl', you: '.qpt-you', rym: '.qp-rymbar', links: '.qp-links', len: '.album-quick-peek-track-time', dl: '.p2p-tr' };
const QPT_W = { play: '22px', name: 'minmax(150px,1fr)', rt: '28px', dl: 'auto' };
function qptPrefs() {
  const d = { look: 'roomy', cols: ['num', 'lf', 'you', 'len'], under: ['rating', 'note', 'genre', 'credits', 'listened', 'lfbar'] };
  try { const p = JSON.parse(localStorage.getItem(QPT_KEY) || 'null'); if (p && typeof p === 'object') return { look: p.look === 'compact' ? 'compact' : 'roomy', cols: Array.isArray(p.cols) ? p.cols.filter(k => QPT_COLS.some(c => c[0] === k)) : d.cols, under: Array.isArray(p.under) ? p.under.filter(k => QPT_UNDER.some(u => u[0] === k)) : d.under }; } catch (e) { /* the usual */ }
  return d;
}
function qptSave(p) { try { localStorage.setItem(QPT_KEY, JSON.stringify(p)); } catch (e) { /* this visit */ } qptApply(); }

// ----- the layout: one stylesheet, made again when a choice changes -----
function qptApply() {
  const p = qptPrefs(), roomy = p.look === 'roomy', R = '#albumQuickPeek .album-quick-peek-track';
  const order = ['play'].concat(p.cols.includes('num') ? ['num'] : [], ['name'], !roomy && p.under.includes('rating') ? ['rt'] : [], p.cols.filter(k => k !== 'num'), ['dl']);
  const widths = order.map(k => QPT_W[k] || (QPT_COLS.find(c => c[0] === k) || [])[3] || 'auto');
  const nameCol = order.indexOf('name') + 1;
  let css = `${R} { display: grid !important; grid-template-columns: ${widths.join(' ')}; column-gap: 7px; row-gap: 0; align-items: center; flex-wrap: nowrap !important; position: relative; }\n`;
  // like and Heard: in the song's own space (Roomy: the end of its second line; Compact: over the end of its name, on hover)
  css += `${R} > .lk-qp, ${R} > .hd-song { grid-column: ${nameCol}; grid-row: ${roomy ? 2 : 1}; justify-self: end; margin: 0; order: 0; }\n${R} > .hd-song { margin-right: 24px; }\n`;
  if (!roomy) css += `${R} > .lk-qp, ${R} > .hd-song { background: var(--bg-elevated); border-radius: 4px; }\n${R}:not(:hover) > .lk-qp:not([aria-pressed="true"]), ${R}:not(:hover) > .hd-song:not(.on) { visibility: hidden; }\n`;
  // wide enough for the columns chosen: the song's name keeps at least 150 px
  const px = widths.reduce((a, w) => a + (parseInt(w, 10) || 0), 0) + 150 + 7 * (widths.length - 1) + 34;
  css += `#albumQuickPeek:not(.album-quick-peek-inline):not(.album-quick-peek-sleeve) { width: ${Math.max(380, Math.min(720, px))}px; max-width: calc(100vw - 16px); }\n`;
  order.forEach((k, i) => { css += `${R} > ${QPT_SEL[k]}, ${R} > .album-quick-peek-track-details > ${QPT_SEL[k]} { grid-column: ${i + 1}; grid-row: 1${roomy && k !== 'name' ? ' / span 3' : ''}; order: 0; margin: 0; }\n`; });
  // every column not chosen: hidden
  QPT_COLS.forEach(([k]) => { if (!order.includes(k)) css += `${R} > ${QPT_SEL[k]} { display: none !important; }\n`; });
  if (roomy) {
    css += `${R} > .album-quick-peek-track-details { grid-column: ${nameCol}; grid-row: 2; display: flex; flex-wrap: wrap; gap: 2px 10px; padding: 0; margin: 1px 0 0; max-width: none; order: 0; }\n`;
    css += `${R} > .qpt-bar { grid-column: ${nameCol}; grid-row: 3; }\n`;
    QPT_UNDER.forEach(([k, , sel]) => { if (!p.under.includes(k)) css += `${R} ${sel} { display: none !important; }\n`; });
  } else {
    css += `${R} > .album-quick-peek-track-details { display: contents; }\n${R} > .album-quick-peek-track-details > :not(.qp-rating) { display: none !important; }\n${R} > .qpt-bar { display: none !important; }\n`;
    if (!p.under.includes('rating')) css += `${R} .qp-detail.qp-rating { display: none !important; }\n`;
  }
  css += `${R} > .qp-detail[title^="Your plays"], ${R} .qp-detail[title^="Your plays"] { display: none !important; }\n`;          // (the You column has it)
  css += `${R} > .album-quick-peek-track-credits { grid-column: 1 / -1; grid-row: 4; }\n`;
  let st = document.getElementById('qptStyle'); if (!st) { st = document.createElement('style'); st.id = 'qptStyle'; document.head.appendChild(st); }
  st.textContent = css;
  const qp = el && el.albumQuickPeek; if (qp) { qp.classList.toggle('qpt-roomy', roomy); qp.classList.toggle('qpt-compact', !roomy); }
  if (typeof stlQpHeadPut === 'function') { const h = document.querySelector('#albumQuickPeekTracks .qp-head'); if (h) h.remove(); try { stlQpHeadPut(); } catch (e) { /* next time */ } }
  qptFoot();
  document.querySelectorAll('[data-qpt-panel]').forEach(n => { n.innerHTML = qptControlsInner(); });
}

// ----- the extra cells on each row: Last.fm listeners, your plays, the bar under the name -----
function qptCellsHtml(item, t) {
  const name = t.trackName || '', s = typeof stlQpSong === 'function' ? stlQpSong(item, name) : null, d = typeof stl !== 'undefined' ? stl.data.get('c:' + item.row) : null;
  const max = d && d.songs && d.songs.length ? Math.max(1, ...d.songs.map(x => x.p || 0)) : 1;
  const you = typeof trackScrobbleCountFor === 'function' ? trackScrobbleCountFor(item.artist, item.title, name) : 0;
  return `<span class="qpt-lfl" data-qpt>${s && s.l != null ? stlF(s.l) : ''}</span><span class="qpt-you${you ? ' has' : ''}">${you || '–'}</span><span class="qpt-bar" data-qpt><i style="width:${s && s.p ? Math.max(2, Math.round(s.p / max * 100)) : 0}%"></i></span>`;
}
if (typeof quickPeekTrackRowHtml === 'function') {
  const qptBaseRow = quickPeekTrackRowHtml;
  quickPeekTrackRowHtml = function (item, t) { const h = qptBaseRow.apply(this, arguments); if (!item || !t) return h; return h.replace('<span class="album-quick-peek-track-time">', qptCellsHtml(item, t) + '<span class="album-quick-peek-track-time">'); };
}
if (typeof stlQpTracksPaint === 'function') {          // Last.fm's numbers arriving: the new cells too
  const qptBasePaint = stlQpTracksPaint;
  stlQpTracksPaint = function (key) {
    const r = qptBasePaint.apply(this, arguments);
    try {
      if (typeof quickPeekItem === 'undefined' || !quickPeekItem || 'c:' + quickPeekItem.row !== key) return r;
      const d = stl.data.get(key), max = d && d.songs.length ? Math.max(1, ...d.songs.map(x => x.p || 0)) : 1;
      el.albumQuickPeekTracks.querySelectorAll('.album-quick-peek-track:not(.qp-head)').forEach(row => { const s = stlQpSong(quickPeekItem, row.dataset.trackName || ''); const l = row.querySelector('.qpt-lfl'), b = row.querySelector('.qpt-bar i'); if (l) l.textContent = s && s.l != null ? stlF(s.l) : ''; if (b) b.style.width = (s && s.p ? Math.max(2, Math.round(s.p / max * 100)) : 0) + '%'; });
      qptFoot();
    } catch (e) { /* next time */ }
    return r;
  };
}
// the totals under the songs
function qptFoot() {
  const box = el && el.albumQuickPeekTracks; if (!box || typeof quickPeekItem === 'undefined' || !quickPeekItem) return;
  const rows = [...box.querySelectorAll('.album-quick-peek-track:not(.qp-head)')]; let f = box.querySelector(':scope > .qpt-foot');
  if (!rows.length) { if (f) f.remove(); return; }
  const it = quickPeekItem, tr = (state.trackCache[artKey(it)] || []), ms = tr.reduce((a, t) => a + (t.trackTimeMillis || 0), 0);
  const d = typeof stl !== 'undefined' ? stl.data.get('c:' + it.row) : null, lf = d && d.songs ? d.songs.reduce((a, s) => a + (s.p || 0), 0) : 0;
  const you = rows.reduce((a, r) => a + (typeof trackScrobbleCountFor === 'function' ? trackScrobbleCountFor(it.artist, it.title, r.dataset.trackName || '') : 0), 0);
  const html = `<span>${rows.length} song${rows.length === 1 ? '' : 's'}${ms ? ' · ' + formatDuration(ms) : ''}</span>${lf ? `<span>${stlF(lf)} plays on Last.fm</span>` : ''}${you ? `<span class="qpt-foot-you">you ${you.toLocaleString()}</span>` : ''}`;
  if (!f) { f = document.createElement('div'); f.className = 'qpt-foot'; box.appendChild(f); }
  if (f.innerHTML !== html) f.innerHTML = html;
  if (f !== box.lastElementChild) box.appendChild(f);
}
(function qptWatch() { const go = () => { const box = el && el.albumQuickPeekTracks; if (!box) return setTimeout(go, 500); let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(qptFoot, 60); }).observe(box, { childList: true }); qptApply(); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); })();

// ----- the controls (the popup's ⚙, and ⚙ › Panels configuration) -----
function qptControlsInner() {
  const p = qptPrefs(), shown = p.cols.map(k => QPT_COLS.find(c => c[0] === k)).filter(Boolean), hidden = QPT_COLS.filter(c => !p.cols.includes(c[0]));
  const colRow = (c, on, i, n) => `<div class="qpt-col${on ? '' : ' off'}"><label><input type="checkbox" data-qpt-col="${c[0]}"${on ? ' checked' : ''}> ${escapeHtml(c[1])}</label>${on ? `<span class="qpt-mv"><button type="button" data-qpt-up="${c[0]}"${i === 0 ? ' disabled' : ''} aria-label="Move ${escapeHtml(c[1])} left">▲</button><button type="button" data-qpt-down="${c[0]}"${i === n - 1 ? ' disabled' : ''} aria-label="Move ${escapeHtml(c[1])} right">▼</button></span>` : ''}</div>`;
  return `<div class="qpt-row"><span class="qpc-lbl">Songs look</span><span class="qpt-seg"><button type="button" data-qpt-look="roomy" aria-pressed="${p.look === 'roomy'}" class="${p.look === 'roomy' ? 'on' : ''}">Roomy · two lines</button><button type="button" data-qpt-look="compact" aria-pressed="${p.look === 'compact'}" class="${p.look === 'compact' ? 'on' : ''}">Compact · one line</button></span></div>
    <div class="qpt-grid"><fieldset class="qpc-group"><legend>Song columns · ▲▼ to order</legend>${shown.map((c, i) => colRow(c, true, i, shown.length)).join('')}${hidden.map(c => colRow(c, false)).join('')}</fieldset>
    <fieldset class="qpc-group"><legend>${p.look === 'roomy' ? 'Under each song' : 'Beside the name (Compact)'}</legend>${QPT_UNDER.filter(u => p.look === 'roomy' || u[0] === 'rating').map(([k, l]) => `<label class="qpc-row"><input type="checkbox" data-qpt-under="${k}"${p.under.includes(k) ? ' checked' : ''}> ${escapeHtml(l)}</label>`).join('')}${p.look === 'compact' ? '<p class="qpc-note">Notes, genre and credits show on hover in Compact.</p>' : ''}</fieldset></div>
    <button type="button" class="qpt-reset" data-qpt-reset>Reset to CRATE’s usual</button>`;
}
function qptControlsHtml() { return `<div class="qpt-panel" data-qpt-panel>${qptControlsInner()}</div>`; }
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('[data-qpt-look], [data-qpt-up], [data-qpt-down], [data-qpt-reset]'); if (!t) return;
  e.stopPropagation(); e.preventDefault(); const p = qptPrefs();
  if (t.dataset.qptLook) p.look = t.dataset.qptLook;
  else if (t.dataset.qptReset !== undefined) { try { localStorage.removeItem(QPT_KEY); } catch (er) { /* fine */ } qptApply(); return; }
  else { const k = t.dataset.qptUp || t.dataset.qptDown, i = p.cols.indexOf(k), j = t.dataset.qptUp ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= p.cols.length) return; [p.cols[i], p.cols[j]] = [p.cols[j], p.cols[i]]; }
  qptSave(p);
}, true);
document.addEventListener('change', (e) => {
  const c = e.target.closest && e.target.closest('[data-qpt-col], [data-qpt-under]'); if (!c) return;
  e.stopPropagation(); const p = qptPrefs();
  if (c.dataset.qptCol) { const k = c.dataset.qptCol; p.cols = c.checked ? p.cols.filter(x => x !== k).concat(k) : p.cols.filter(x => x !== k); }
  else { const k = c.dataset.qptUnder; p.under = c.checked ? p.under.filter(x => x !== k).concat(k) : p.under.filter(x => x !== k); }
  qptSave(p);
}, true);
// ⚙ › Panels configuration: a "Cover popup" group, after "Clicking an album cover opens"
(function qptConfig() {
  const go = () => { const sel = document.getElementById('albumQuickPeekStyleSelect'); if (!sel) return setTimeout(go, 500); if (document.getElementById('qptConfigGroup')) return;
    const grp = sel.closest('.pane-config-group'); if (!grp) return;
    const g = document.createElement('div'); g.className = 'pane-config-group qpt-config'; g.id = 'qptConfigGroup';
    g.innerHTML = `<div class="arrange-row"><b>Cover popup</b><span class="qpc-note" style="margin-left:8px">what its songs show (the same as ⚙ on the popup’s tabs)</span></div>${qptControlsHtml()}`;
    grp.after(g);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
