// ===== (1.135.115) Choosing what the cover view's popup shows =====
// ⚙ at the end of the popup's tabs opens a list of everything in it: tick or untick, it changes at once and is remembered in this
// browser. Each part hidden is a class on the popup (qp-off-<key>) that the stylesheet below hides, so nothing is drawn differently.

const QPC_KEY = 'crate_qp_show_v1';
const QPC_PARTS = [
  ['Top', [
    ['genres', 'Genres', '.qp-facts .qp-line.qp-dim'],
    ['ratings', 'Your rating and RYM', '.qp-facts .qp-line:not(.qp-dim)'],
    ['actions', 'Play, Shuffle, Queue… buttons', '#albumQuickPeekActions > :not(.qp-cover)'],
    ['linkcount', 'Songs with links (S · Y)', '#albumQuickPeekCover'],
  ]],
  ['Tabs', [
    ['tab-about', 'About', '[data-qp-tab="about"]'],
    ['tab-listens', 'Listens', '[data-qp-tab="listens"]'],
    ['foot', 'Totals under the songs', '.qpt-foot'],
  ]],
  ['Listens tab', [
    ['l-mine', 'Your plays (diary and scrobbles)', '#albumQuickPeekListens > :not(.qp-lf)'],
    ['l-lastfm', 'On Last.fm', '#albumQuickPeekListens > .qp-lf'],
  ]],
];
function qpcOff() { try { const v = JSON.parse(localStorage.getItem(QPC_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch (e) { return new Set(); } }
function qpcSave(set) { try { localStorage.setItem(QPC_KEY, JSON.stringify([...set])); } catch (e) { /* this visit */ } }
function qpcIsOff(k) { return qpcOff().has(k); }
// the rules: one per part, written once
(function qpcStyle() {
  const css = QPC_PARTS.flatMap(([, ps]) => ps).map(([k, , sel]) => sel.split(',').map(x => `#albumQuickPeek.qp-off-${k} ${x.trim()}`).join(', ') + ' { display: none !important; }').join('\n');
  const st = document.createElement('style'); st.id = 'qpcStyle'; st.textContent = css; document.head.appendChild(st);
})();
function qpcApply() {
  const p = el && el.albumQuickPeek; if (!p) return;
  const off = qpcOff();
  QPC_PARTS.flatMap(([, ps]) => ps).forEach(([k]) => p.classList.toggle('qp-off-' + k, off.has(k)));
  const on = p.querySelector('.qp-tab.on'), tab = on && on.dataset.qpTab;          // the tab showing was hidden: back to Tracks
  if ((tab === 'about' && off.has('tab-about')) || (tab === 'listens' && off.has('tab-listens'))) qpSetTab('tracks');
}
function qpcPanelHtml() {
  const off = qpcOff();
  return `<div class="qpc-head"><b>Show in this popup</b><button type="button" class="qpc-link" data-qpc="all">Show everything</button><button type="button" class="qpc-x" data-qpc="close" aria-label="Close">✕</button></div>
    ${typeof qptControlsHtml === 'function' ? qptControlsHtml() : ''}
    <div class="qpc-groups">${QPC_PARTS.map(([g, ps]) => `<fieldset class="qpc-group"><legend>${escapeHtml(g)}</legend>${ps.map(([k, l]) => `<label class="qpc-row"><input type="checkbox" data-qpc-part="${k}"${off.has(k) ? '' : ' checked'}> ${escapeHtml(l)}</label>`).join('')}</fieldset>`).join('')}</div>`;
}
function qpcToggle(open) {
  const p = el.albumQuickPeek; if (!p) return;
  let panel = document.getElementById('qpCustom');
  if (!panel) { panel = document.createElement('div'); panel.id = 'qpCustom'; panel.className = 'qp-custom'; panel.hidden = true; const tabs = el.albumQuickPeekTabs; tabs.parentNode.insertBefore(panel, tabs.nextSibling); }
  const show = open == null ? panel.hidden : open;
  panel.hidden = !show; if (show) panel.innerHTML = qpcPanelHtml();
  const b = document.getElementById('qpCustomBtn'); if (b) b.setAttribute('aria-expanded', String(show));
}
function qpcInit() {
  const p = el && el.albumQuickPeek, tabs = el && el.albumQuickPeekTabs; if (!p || !tabs || document.getElementById('qpCustomBtn')) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'qpCustomBtn'; b.className = 'qp-tab qp-custom-btn'; b.textContent = '⚙'; b.title = 'Choose what this popup shows'; b.setAttribute('aria-label', 'Choose what this popup shows'); b.setAttribute('aria-expanded', 'false');
  tabs.appendChild(b);
  // its own clicks, before the popup's (which would read ⚙ as a tab)
  p.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#qpCustomBtn')) { e.stopPropagation(); e.preventDefault(); qpcToggle(); return; }
    const a = t.closest('[data-qpc]'); if (a) { e.stopPropagation(); e.preventDefault(); if (a.dataset.qpc === 'close') qpcToggle(false); else if (a.dataset.qpc === 'all') { qpcSave(new Set()); qpcApply(); qpcToggle(true); } return; }
    if (t.closest('#qpCustom')) e.stopPropagation();
  }, true);
  p.addEventListener('change', (e) => {
    const c = e.target.closest('[data-qpc-part]'); if (!c) return;
    const off = qpcOff(); if (c.checked) off.delete(c.dataset.qpcPart); else off.add(c.dataset.qpcPart); qpcSave(off); qpcApply();
  });
  qpcApply();
}
const qpcBaseOpen = openAlbumQuickPeek;
openAlbumQuickPeek = function () { const r = qpcBaseOpen.apply(this, arguments); try { qpcInit(); qpcApply(); if (document.getElementById('qpCustom')) qpcToggle(false); } catch (e) { /* the popup as it was */ } return r; };
// Last.fm's numbers aren't looked up for the popup when both places that show them are hidden
if (typeof stlWant === 'function') {
  const qpcBaseWant = stlWant;
  stlWant = function (subj) { if (subj && subj.key && String(subj.key).startsWith('c:') && typeof quickPeekItem !== 'undefined' && quickPeekItem && 'c:' + quickPeekItem.row === subj.key && !document.querySelector('#searchSuggest:not([hidden])') && qpcIsOff('lf') && (qpcIsOff('l-lastfm') || qpcIsOff('tab-listens'))) return; return qpcBaseWant.apply(this, arguments); };
}
