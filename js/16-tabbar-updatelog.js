// CRATE — tab bar, Update log.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Tab bar ----------
   The strip at the very top of the window (modeled on MusicBee's tab row):
   back / forward arrows, the tabs, then a "+". On desktop it is its own
   full-width bar above the header; on a phone it stays the fixed bottom bar it
   always was (it is the same .nav-tabs element — only the desktop styling moved).

   Back / forward are real history, like a browser's: every tab you land on is
   recorded (for an artist tab, which artist), going back and then somewhere new
   discards the "forward" entries, and an artist tab you've since CLOSED is skipped
   rather than reopened. The "+" opens a small finder to open any artist in your
   crate as a new tab — the one kind of tab there is more than one of. */
let tabHistoryNavigating = false;
let tabQuickOpenEl = null;

function tabHistoryEntry() {
  return { tab: state.activeTab, artist: state.activeTab === 'artistInfo' ? state.activeArtistInfoTab : null, genre: state.activeTab === 'genreInfo' ? state.activeGenreTab : null };
}
function tabHistoryEntryValid(e) { return (e.tab !== 'artistInfo' || state.artistInfoTabs.includes(e.artist)) && (e.tab !== 'genreInfo' || state.genreTabs.includes(e.genre)); }
function recordTabHistory() {
  if (tabHistoryNavigating || state.tabHistoryIndex < 0) return;   // index < 0: not seeded yet (still starting up)
  const e = tabHistoryEntry(), h = state.tabHistory, last = h[state.tabHistoryIndex];
  if (last && last.tab === e.tab && last.artist === e.artist && last.genre === e.genre) { updateTabHistoryButtons(); return; }
  h.splice(state.tabHistoryIndex + 1);                // going somewhere new discards "forward", as a browser does
  h.push(e);
  if (h.length > 60) h.shift();
  state.tabHistoryIndex = h.length - 1;
  updateTabHistoryButtons();
}
function tabHistoryHas(delta) {
  for (let i = state.tabHistoryIndex + delta; i >= 0 && i < state.tabHistory.length; i += delta) {
    if (tabHistoryEntryValid(state.tabHistory[i])) return true;
  }
  return false;
}
function updateTabHistoryButtons() {
  if (!el.tabBackBtn) return;
  el.tabBackBtn.disabled = !tabHistoryHas(-1);
  el.tabForwardBtn.disabled = !tabHistoryHas(1);
}
function navigateTabHistory(delta) {
  let i = state.tabHistoryIndex + delta;
  while (i >= 0 && i < state.tabHistory.length && !tabHistoryEntryValid(state.tabHistory[i])) i += delta;   // skip closed artist tabs
  if (i < 0 || i >= state.tabHistory.length) return;
  const e = state.tabHistory[i];
  state.tabHistoryIndex = i;
  tabHistoryNavigating = true;
  try {
    if (e.tab === 'artistInfo') { state.activeArtistInfoTab = e.artist; renderArtistInfoTabButtons(); }
    if (e.tab === 'genreInfo') { state.activeGenreTab = e.genre; renderGenreTabButtons(); }
    switchTab(e.tab);
  } finally { tabHistoryNavigating = false; }
  updateTabHistoryButtons();
}

// ----- "+" : open an artist as a new tab -----
function closeArtistQuickOpen() {
  if (!tabQuickOpenEl) return;
  tabQuickOpenEl.remove(); tabQuickOpenEl = null;
  document.removeEventListener('mousedown', quickOpenOutside, true);
}
function quickOpenOutside(e) {
  // the + button itself is excluded so its own click can toggle the finder closed rather than close-then-reopen it
  if (tabQuickOpenEl && !tabQuickOpenEl.contains(e.target) && !e.target.closest('#tabAddBtn')) closeArtistQuickOpen();
}
function openArtistQuickOpen() {
  if (tabQuickOpenEl) { closeArtistQuickOpen(); return; }
  const counts = new Map();
  state.raw.forEach(r => counts.set(r.artist, (counts.get(r.artist) || 0) + 1));
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const menu = document.createElement('div');
  menu.className = 'tab-quick-open';
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Open artist');
  menu.innerHTML = '<input type="search" class="tab-quick-open-input" placeholder="Open artist…" autocomplete="off" aria-label="Open artist"><div class="tab-quick-open-list" role="listbox"></div>';
  document.body.appendChild(menu);
  tabQuickOpenEl = menu;
  const r = el.tabAddBtn.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 280)) + 'px';
  menu.style.top = (r.bottom + 6) + 'px';
  const input = menu.querySelector('input'), list = menu.querySelector('.tab-quick-open-list');
  let active = 0, shown = [];
  const render = () => {
    const q = input.value.trim().toLowerCase();
    // names that START with what's typed come before ones that merely contain it
    shown = names.filter(n => !q || n.toLowerCase().includes(q))
      .sort((a, b) => (b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q))).slice(0, 12);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length
      ? shown.map((n, i) => `<button type="button" role="option" class="tab-quick-open-item${i === active ? ' active' : ''}" data-artist="${escapeHtml(n)}"><span>${escapeHtml(n)}</span><small>${counts.get(n)} album${counts.get(n) === 1 ? '' : 's'}</small></button>`).join('')
      : `<p class="tab-quick-open-empty">${names.length ? 'No artist matches.' : 'No artists in your crate yet.'}</p>`;
  };
  const open = (name) => { closeArtistQuickOpen(); openArtistInfoTab(name); };
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) open(shown[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); closeArtistQuickOpen(); el.tabAddBtn.focus(); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-artist]'); if (b) open(b.dataset.artist); });
  document.addEventListener('mousedown', quickOpenOutside, true);
  render();
  input.focus();
}

/* ---------- Update log ----------
   The log lives in CHANGELOG.txt beside the page (until 1.78.0 it was the comment at the top of index.html), one entry
   per release, newest first, and this reads it back, so there is no second copy to keep in step. What it needs from
   it (also stated in its header): each entry starts with a line
       "  X.Y.Z — YYYY-MM-DD — summary…"
   and runs until the next such line; the first paragraph is the summary shown in the list, the rest is the
   "Details". The page is fetched with cache: 'no-cache' (a cheap conditional request when nothing changed), which
   also means a deploy made since this page loaded shows up here — hence the "newer version" hint.
   Everything is inserted as TEXT: the entries talk about HTML and contain < and & freely. */
const UPDATE_LOG_SEEN_KEY = 'crate_updatelog_seen_v1';
let updateLogEntries = null;      // parsed, newest first; null until loaded
let updateLogError = '';          // '' | 'file' | 'fetch'
let updateLogSeen = null;         // the newest version already seen BEFORE this opening (for the NEW badges)
let updateLogLoading = null;

function updateLogCompare(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
function parseUpdateLog(html) {          // CHANGELOG.txt as it is, or a page with the log in its first comment (how it used to be kept)
  let a = html.indexOf('<!--'), b = html.indexOf('-->', a + 4);
  if (a < 0 || b < 0) { a = -4; b = html.length; }
  const header = /^  (\d+\.\d+\.\d+) \u2014 (\d{4}-\d{2}-\d{2}) \u2014 (.*)$/;
  const entries = [];
  let cur = null;
  html.slice(a + 4, b).split('\n').forEach(line => {
    const m = header.exec(line);
    if (m) { cur = { version: m[1], date: m[2], lines: [m[3]] }; entries.push(cur); return; }
    if (!cur) return;                                       // the maintenance instructions above the first entry
    if (/^\s*={5,}\s*$/.test(line)) return;                 // the banner rules
    if (/^\s*\d+\.\d+(\.\d+)?\s*$/.test(line)) return;      // stray bare version numbers left over from old edits
    cur.lines.push(line.replace(/^ {1,10}/, ''));           // drop the entry indent, keep any deeper (bulleted) indent
  });
  const seen = new Set();
  return entries.filter(e => !seen.has(e.version) && seen.add(e.version)).map(e => {
    const text = e.lines.join('\n').replace(/\s+$/, '');
    const firstPara = text.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
    let summary = firstPara;
    if (summary.length > 260) summary = summary.slice(0, 260).replace(/\s+\S*$/, '') + '\u2026';
    return { version: e.version, date: e.date, text, summary, hasDetails: text.replace(/\s+/g, ' ').trim().length > summary.length && text.replace(/\s+/g, ' ').trim() !== summary };
  }).sort((x, y) => updateLogCompare(y.version, x.version));   // by version, not file order (1.29.159 once sat above 1.29.160)
}
function loadUpdateLogEntries() {
  if (updateLogLoading) return updateLogLoading;
  updateLogError = '';
  if (location.protocol === 'file:') { updateLogError = 'file'; return Promise.resolve(null); }
  updateLogLoading = fetch(new URL('CHANGELOG.txt', location.href).href, { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(html => { const parsed = parseUpdateLog(html); if (!parsed.length) throw new Error('no entries found'); updateLogEntries = parsed; return parsed; })
    .catch(err => { console.warn('update log load failed', err); updateLogError = 'fetch'; updateLogEntries = null; return null; })
    .finally(() => { updateLogLoading = null; });
  return updateLogLoading;
}
function fmtUpdateDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function fmtUpdateMonth(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function renderUpdateLog() {
  const list = el.updateLogList;
  list.textContent = '';
  el.updateLogNote.hidden = true;
  if (!updateLogEntries) {
    el.updateLogSummary.textContent = '';
    const box = document.createElement('div');
    box.className = 'ai-note';
    const p = document.createElement('p');
    p.textContent = updateLogError === 'file'
      ? 'The update log is read from the live page, so it isn\u2019t available when this file is opened straight from disk. Open the site instead.'
      : 'Couldn\u2019t load the update log \u2014 check your connection and try again.';
    box.appendChild(p);
    if (updateLogError !== 'file') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'config-btn'; b.dataset.updateLogRetry = '1'; b.textContent = 'Retry';
      box.appendChild(b);
    }
    list.appendChild(box);
    return;
  }
  const q = (el.updateLogSearch.value || '').trim().toLowerCase();
  const matches = updateLogEntries.map(e => {
    if (!q) return { e, inDetails: false };
    const inHead = (e.version + ' ' + e.date + ' ' + e.summary).toLowerCase().includes(q);
    const inText = inHead || e.text.toLowerCase().includes(q);
    return inText ? { e, inDetails: !inHead } : null;
  }).filter(Boolean);
  const latest = updateLogEntries[0], oldest = updateLogEntries[updateLogEntries.length - 1];
  el.updateLogSummary.textContent = q
    ? `${matches.length} of ${updateLogEntries.length} updates match`
    : `${updateLogEntries.length} updates \u00b7 v${oldest.version} (${fmtUpdateDate(oldest.date)}) to v${latest.version} (${fmtUpdateDate(latest.date)})`;
  if (updateLogCompare(latest.version, APP_VERSION) > 0) {
    el.updateLogNote.textContent = '';
    el.updateLogNote.append(`A newer version (v${latest.version}) is on the site \u2014 you\u2019re running v${APP_VERSION}. `);
    const rb = document.createElement('button');
    rb.type = 'button'; rb.className = 'ai-link-btn'; rb.dataset.updateLogReload = '1'; rb.textContent = 'Reload to update';
    el.updateLogNote.appendChild(rb);
    el.updateLogNote.hidden = false;
  }
  if (!matches.length) { const p = document.createElement('p'); p.className = 'ai-empty'; p.textContent = 'No updates match \u201c' + el.updateLogSearch.value.trim() + '\u201d.'; list.appendChild(p); return; }
  let month = '';
  const frag = document.createDocumentFragment();
  matches.forEach(({ e, inDetails }) => {
    const m = fmtUpdateMonth(e.date);
    if (m !== month) { month = m; const h = document.createElement('h3'); h.className = 'update-month'; h.textContent = m; frag.appendChild(h); }
    const art = document.createElement('article');
    art.className = 'update-entry'; art.dataset.version = e.version;
    const head = document.createElement('div'); head.className = 'update-entry-head';
    const ver = document.createElement('span'); ver.className = 'update-ver'; ver.textContent = 'v' + e.version; head.appendChild(ver);
    const date = document.createElement('span'); date.className = 'update-date'; date.textContent = fmtUpdateDate(e.date); head.appendChild(date);
    if (e.version === APP_VERSION) { const t = document.createElement('span'); t.className = 'update-tag update-tag-current'; t.textContent = 'Current'; head.appendChild(t); }
    if (updateLogSeen && updateLogCompare(e.version, updateLogSeen) > 0) { const t = document.createElement('span'); t.className = 'update-tag update-tag-new'; t.textContent = 'New'; head.appendChild(t); }
    art.appendChild(head);
    const sum = document.createElement('p'); sum.className = 'update-summary'; sum.textContent = e.summary; art.appendChild(sum);
    if (e.hasDetails) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'update-more'; btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'Details';
      art.appendChild(btn);
      if (inDetails) setUpdateEntryOpen(art, true);       // the search hit is down in the details, so show them
    }
    frag.appendChild(art);
  });
  list.appendChild(frag);
  el.updateLogToggleAll.hidden = !matches.some(({ e }) => e.hasDetails);
  el.updateLogToggleAll.textContent = 'Expand all';
}
// The entries are hard-wrapped at ~80 columns in the file, which reads as ragged half-lines on a narrow screen.
// Join the wrapped lines of ordinary paragraphs back into one line (the browser then wraps to the width). Only
// PLAIN lines are joined — flush-left, not starting a bullet/number, and without an aligned run of spaces —
// so bullets, indented blocks and column-aligned tables are left exactly as written.
function reflowUpdateText(text) {
  const out = []; let prevPlain = false;
  text.split('\n').forEach(line => {
    const plain = line.trim() !== '' && !/^\s/.test(line) && !/\S {2,}\S/.test(line) && !/^(?:\d+[.)]|[-\u2022*])\s/.test(line);
    if (plain && prevPlain) out[out.length - 1] += ' ' + line.trim();
    else out.push(line);
    prevPlain = plain;
  });
  return out.join('\n');
}
function setUpdateEntryOpen(art, open) {
  const e = updateLogEntries.find(x => x.version === art.dataset.version);
  const btn = art.querySelector('.update-more');
  if (!e || !btn) return;
  let pre = art.querySelector('.update-details');
  if (open && !pre) { pre = document.createElement('pre'); pre.className = 'update-details'; pre.textContent = reflowUpdateText(e.text); art.insertBefore(pre, btn); }   // built the first time it's opened: 230+ long entries aren't all needed up front
  if (pre) pre.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.textContent = open ? 'Hide details' : 'Details';
}
async function openUpdateLog() {
  el.layoutMenu.hidden = true;
  el.updateLogOverlay.hidden = false;
  el.updateLogSearch.value = '';
  let seen = null;
  try { seen = localStorage.getItem(UPDATE_LOG_SEEN_KEY); } catch (err) { /* private mode: no NEW badges */ }
  updateLogSeen = seen;                                    // fixed for this opening; stored below so the NEXT one starts fresh
  el.updateLogSummary.textContent = 'Loading\u2026';
  el.updateLogList.textContent = '';
  el.updateLogNote.hidden = true;
  await loadUpdateLogEntries();
  if (el.updateLogOverlay.hidden) return;                  // closed while it was loading
  renderUpdateLog();
  const newest = updateLogEntries && updateLogEntries[0] ? updateLogEntries[0].version : APP_VERSION;
  try { localStorage.setItem(UPDATE_LOG_SEEN_KEY, newest); } catch (err) { /* ignore */ }
  el.updateLogSearch.focus();
}
function closeUpdateLog() { if (el.updateLogOverlay) el.updateLogOverlay.hidden = true; }
function initUpdateLog() {
  if (!el.updateLogOverlay) return;
  el.menuUpdateLog.addEventListener('click', openUpdateLog);
  // Installing CRATE as an app (manifest.webmanifest + icons/ beside this page): Chrome and Edge then offer "Install CRATE", and
  // it opens in its own window with a Start-menu entry and a taskbar icon. It is still this page at this address, so sign-in,
  // Spotify, YouTube and both add-ons work as before, and it updates whenever the page does. Hidden inside the installed app.
  (function wireInstallApp() {
    const btn = document.getElementById('menuInstallApp'); if (!btn) return;
    let deferred = null;
    const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    btn.hidden = standalone();
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = standalone(); });
    window.addEventListener('appinstalled', () => { deferred = null; btn.hidden = true; flashGlobalToast('CRATE is installed: open it from the Start menu or the taskbar.'); });
    btn.addEventListener('click', async () => {
      el.layoutMenu.hidden = true;
      if (!deferred) { flashGlobalToast('To install CRATE, use the install icon at the right of the address bar in Chrome or Edge (or the browser\u2019s menu \u2192 Install CRATE). If you already installed it, open it from the Start menu.'); return; }
      deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r && r.outcome === 'accepted') btn.hidden = true;
    });
  })();
  el.menuAppVersion.addEventListener('click', openUpdateLog);
  el.menuAppVersion.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUpdateLog(); } });
  el.updateLogClose.addEventListener('click', closeUpdateLog);
  el.updateLogOverlay.addEventListener('mousedown', (e) => { if (e.target === el.updateLogOverlay) closeUpdateLog(); });   // the backdrop
  el.updateLogSearch.addEventListener('input', debounce(renderUpdateLog, 150));
  el.updateLogToggleAll.addEventListener('click', () => {
    const open = el.updateLogToggleAll.textContent === 'Expand all';
    el.updateLogList.querySelectorAll('.update-entry').forEach(a => { if (a.querySelector('.update-more')) setUpdateEntryOpen(a, open); });
    el.updateLogToggleAll.textContent = open ? 'Collapse all' : 'Expand all';
  });
  el.updateLogList.addEventListener('click', (e) => {
    const more = e.target.closest('.update-more');
    if (more) { const art = more.closest('.update-entry'); setUpdateEntryOpen(art, more.getAttribute('aria-expanded') !== 'true'); return; }
    if (e.target.closest('[data-update-log-retry]')) { el.updateLogSummary.textContent = 'Loading\u2026'; loadUpdateLogEntries().then(renderUpdateLog); }
  });
  el.updateLogNote.addEventListener('click', (e) => { if (e.target.closest('[data-update-log-reload]')) location.reload(); });
}

// ---- A tab in a window of its own: ⧉ at the end of the tab bar (the tab you are on), or a tab's right-click / middle-click. The new window is CRATE
// itself, opened on that tab (#popout=… in its address, read once the crate has loaded): same sign-in, same crate, its own place on your screen.
const POP_HASH = '#popout=';
const POP_TABS = { tabAlbums: 'albums', tabDiary: 'diary', tabScrobbles: 'scrobbles', tabStats: 'stats', tabArtist: 'artist' };
function popTabDesc(btn) {                                            // the tab a button stands for, or null
  if (!btn) return null;
  if (POP_TABS[btn.id]) return { tab: POP_TABS[btn.id] };
  if (btn.classList.contains('artist-info-tab-btn') && btn.dataset.artist) return { artist: btn.dataset.artist };
  if (btn.classList.contains('genre-tab-btn') && btn.dataset.genre) return { genre: btn.dataset.genre };
  return null;
}
function popActiveDesc() {
  if (state.activeTab === 'artistInfo' && state.activeArtistInfoTab) return { artist: state.activeArtistInfoTab };
  if (state.activeTab === 'genreInfo' && state.activeGenreTab) return { genre: state.activeGenreTab };
  return { tab: state.activeTab || 'albums' };
}
function popName(d) { return d.artist || d.genre || ({ albums: 'Music', diary: 'Diary', scrobbles: 'Scrobbles', stats: 'Stats', artist: 'Artist' }[d.tab] || 'CRATE'); }
function popOutTab(d) {
  if (!d) return;
  const url = location.href.split('#')[0] + POP_HASH + encodeURIComponent(JSON.stringify(d));
  const w = window.open(url, '_blank', 'popup=yes,width=1280,height=860');
  if (!w) flashGlobalToast('Your browser stopped the new window: allow pop-ups for this site, then try again.');
}
function popApplyFromAddress() {                                      // in the new window: go to the tab it was opened for, once the crate is in
  if (!location.hash.startsWith(POP_HASH)) return;
  let d = null; try { d = JSON.parse(decodeURIComponent(location.hash.slice(POP_HASH.length))); } catch (e) { d = null; }
  history.replaceState(null, '', location.href.split('#')[0]);          // (a reload is then an ordinary CRATE window)
  if (!d || typeof d !== 'object') return;
  const t0 = Date.now(), go = () => {
    if (!state.catalogFetchedAt && Date.now() - t0 < 30000) { setTimeout(go, 250); return; }
    if (typeof d.artist === 'string' && d.artist) openArtistInfoTab(d.artist.slice(0, 200));
    else if (typeof d.genre === 'string' && d.genre) openGenreTab(d.genre.slice(0, 200));
    else if (Object.values(POP_TABS).includes(d.tab)) switchTab(d.tab);
    document.title = `${popName(d)} \u2014 CRATE`;
  };
  go();
}
(function wirePopout() {
  const bar = document.getElementById('tabBar'); if (!bar) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'tabPopoutBtn'; btn.className = 'tab-bar-btn tab-bar-popout'; btn.title = 'Open this tab in a new window'; btn.setAttribute('aria-label', 'Open this tab in a new window'); btn.textContent = '\u29c9';
  bar.appendChild(btn);
  btn.addEventListener('click', () => popOutTab(popActiveDesc()));
  bar.addEventListener('auxclick', (e) => { if (e.button !== 1) return; const d = popTabDesc(e.target.closest('.nav-tab')); if (d) { e.preventDefault(); popOutTab(d); } });          // middle-click, as in a browser
  bar.addEventListener('mousedown', (e) => { if (e.button === 1 && e.target.closest('.nav-tab')) e.preventDefault(); });          // (no auto-scroll cursor)
  bar.addEventListener('contextmenu', (e) => {
    const tab = e.target.closest('.nav-tab'), d = popTabDesc(tab); if (!d) return;
    e.preventDefault(); closeNowPlayingAddMenu();
    const menu = document.createElement('div'); menu.className = 'panel-mode-menu now-playing-add-menu';
    menu.innerHTML = `<div class="menu-section-title">${escapeHtml(popName(d))}</div><button type="button" data-pop>Open in new window \u29c9</button>`;
    document.body.appendChild(menu); positionFloatingMenu(menu, e.clientX, e.clientY);
    menu.addEventListener('click', (ev) => { if (ev.target.closest('[data-pop]')) { closeNowPlayingAddMenu(); popOutTab(d); } });
    nowPlayingAddMenuEl = menu; setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);          // (closes like the other menus)
  });
  popApplyFromAddress();
})();

