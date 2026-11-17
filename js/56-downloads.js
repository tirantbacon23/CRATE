// CRATE — Download from Soulseek, and the Downloads view (in the right-hand column, or a floating window).
// One part of the page's script, split by feature (see 01-core.js). It uses the P2P downloads in js/48-p2p.js and js/49-p2p-local.js.
//
// THE BUTTON: "↓ Download" in a release's window and on its right-click menu (the whole release), a small ↓ on each song row (that song,
// fetched ahead of anything else from its sharer), and ↓ next to the song playing in the player (when it isn't already playing from a
// file). The best source is found for you (or the one you picked in Find on P2P). Once a song is on its way, the row's existing progress
// badge takes over from the ↓.
// KEPT OR DELETED as the download setting says ("After playing": delete it once played, keep up to a size, or keep everything): a song or
// release you ask for is kept until it's played (or a day), then follows that setting.
// THE DOWNLOADS VIEW: "↓ Downloads" in Up Next's header bar takes the right-hand column over while it's open ("Up next" goes back),
// or ⧉ floats it as a window you can drag and resize. At the top, whether the add-on and slskd are ready, the total speed and how many
// are downloading, waiting and done; then each release (cover, who it's from, the format, an overall bar) with each song's bar, speed or
// place in the sharer's queue. Filters: Active, Done, Didn't work. Each release's ⋯: Retry, Stop, Change source, Open in my crate, Forget.
// Settings at the foot: After playing, Download ahead, and whether Downloads opens when you download something.

const DLV_KEY = 'crate_dlv_v1';
function dlvPrefs() { try { return Object.assign({ mode: 'dock', tab: 'queue', filter: 'active', autoOpen: true, open: false }, JSON.parse(localStorage.getItem(DLV_KEY) || '{}')); } catch (e) { return { mode: 'dock', tab: 'queue', filter: 'active', autoOpen: true, open: false }; } }
function dlvSave(p) { const v = Object.assign(dlvPrefs(), p); try { localStorage.setItem(DLV_KEY, JSON.stringify(v)); } catch (e) { /* this visit only */ } return v; }
const DL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>';

function dlReady() {
  if (typeof p2p === 'undefined' || !p2p.ready || !p2p.configured) { flashGlobalToast('The CRATE for P2P add-on isn’t ready: open Find on P2P (⚙ → Tools → P2P search…) to see why.'); return false; }
  return true;
}
async function dlFolderOk() {                                      // inside a click: the downloads folder chosen and allowed (it's where songs land)
  if (!p2pFolderSupported()) return true;
  await p2pDirCheck(); if (p2pDirPerm === 'prompt') await p2pDirAllow(); else if (p2pDirPerm === 'none') { flashGlobalToast('Choose slskd’s downloads folder, so CRATE can play and tidy what arrives.'); await p2pDirPick(); }
  return true;
}
// A whole release, for keeping (until played, then as "After playing" says)
async function dlRelease(item) {
  if (!item || !dlReady()) return;
  const key = artKey(item);
  await dlFolderOk();
  if (!p2pDl[key]) { flashGlobalToast(`Looking for ${item.title} on Soulseek…`); if (!(await p2pAutoGet(item, { noPrefer: true })) || !p2pDl[key]) { flashGlobalToast(`Couldn’t find a good copy of ${item.title} on Soulseek. Find on P2P… shows what there is.`); return; } }
  const rec = p2pDl[key]; rec.keepAll = true; rec.logged = false; rec.dismissed = false; rec.dlvHidden = false;
  rec.songs.forEach(s => { if (s.st === 'fail') s.st = 'idle'; s.asked = true; });
  p2pDlSave(); flashGlobalToast(`Downloading ${item.title} (${rec.songs.length} song${rec.songs.length === 1 ? '' : 's'}).`);
  dlvAutoOpen(); await p2pSyncWindow(); p2pTick(); dlvRender();
}
// One song, fetched ahead of anything else from its sharer (kept until played, then as "After playing" says)
function dlSongFailed(item, track) { try { if (!item || typeof p2pDl === 'undefined' || !p2pDl[artKey(item)]) return false; const so = p2pSongFor(item, track); return !!(so && so.st === 'fail'); } catch (e) { return false; } }          // (1.135.48) the menus say Retry
async function dlSong(item, trackNum, trackName) {
  if (!item || !dlReady()) return;
  const key = artKey(item);
  await dlFolderOk();
  if (!p2pDl[key]) { flashGlobalToast(`Looking for ${item.title} on Soulseek…`); if (!(await p2pAutoGet(item, { noPrefer: true })) || !p2pDl[key]) { flashGlobalToast(`Couldn’t find a good copy of ${item.title} on Soulseek.`); return; } }
  const s = p2pSongFor(item, { trackName, trackNumber: trackNum });
  if (!s) { flashGlobalToast(`"${trackName}" isn’t in ${item.title}’s Soulseek folder: Change P2P source… to pick another.`); return; }
  if (s.st === 'done' && s.local) { flashGlobalToast(`"${trackName}" is already downloaded.`); return; }
  if (s.st === 'fail') { await p2pRetrySong(s); return; }          // (1.135.48) Download on a song that failed: tried again
  s.pri = Date.now(); s.asked = true; p2pDl[key].dlvHidden = false; p2pDlSave();
  flashGlobalToast(`Downloading "${trackName}".`);
  dlvAutoOpen(); await p2pSyncWindow(); p2pTick(); p2pPaintRows(); dlvRender();
}

// ----- the ↓ on song rows and in the player -----
function dlPaint() {
  if (typeof p2pDl === 'undefined') return;
  document.querySelectorAll('.track-row[data-track-key], .main-track-row[data-track-key], .track-row-wrap[data-track-key]').forEach(row => {
    const s = likeRowSong(row); if (!s) return;
    const rec = p2pDl[artKey(s.item)], so = rec ? p2pSongFor(s.item, { trackNumber: s.num, trackName: s.name }) : null;
    const busy = !!(so && (p2pActive(so) || (so.st === 'done' && so.local)));
    let b = row.querySelector('.dl-btn');
    // (1.135.10) A song on its way or downloaded keeps its ↓'s place, only hidden (its progress badge shows it now): taking the button
    // away moved everything after it on that row, so the rows' play buttons and names didn't line up.
    if (b) { b.classList.toggle('dl-busy', busy); b.tabIndex = busy ? -1 : 0; return; }
    const at = row.querySelector('.lk-heart') || row.querySelector('.track-name, .mt-title'); if (!at) return;
    const html = `<button type="button" class="dl-btn${busy ? ' dl-busy' : ''}"${busy ? ' tabindex="-1"' : ''} data-dl-row="${escapeHtml(String(s.item.row))}" data-dl-num="${s.num}" data-dl-name="${escapeHtml(s.name)}" title="Download from Soulseek" aria-label="Download ${escapeHtml(s.name)} from Soulseek">${DL_SVG}</button>`;
    if (at.classList.contains('lk-heart')) at.insertAdjacentHTML('afterend', html); else at.insertAdjacentHTML('beforeend', html);
  });
  // (1.130.3) Up Next's songs: a ↓ right after the song's name (where its download bar appears once it's on its way)
  document.querySelectorAll('#crateQueuePanelBody [data-queue-index]').forEach(row => {
    const e = crateQueueList[Number(row.dataset.queueIndex)]; if (!e || !e.item || !e.track) return;
    const rec = p2pDl[artKey(e.item)], so = rec ? p2pSongFor(e.item, e.track) : null;
    const busy = !!(so && (p2pActive(so) || (so.st === 'done' && so.local))) || !!row.querySelector(':scope > .p2p-tr');
    let b = row.querySelector('.dl-btn');
    if (busy) { if (b) b.remove(); return; }
    if (b) return;
    const title = row.querySelector('.queue-track-title'); if (!title) return;
    title.insertAdjacentHTML('beforeend', `<button type="button" class="dl-btn dl-q" data-dl-row="${escapeHtml(String(e.item.row))}" data-dl-num="${escapeHtml(String(e.track.trackNumber || ''))}" data-dl-name="${escapeHtml(e.track.trackName || '')}" title="Download from Soulseek" aria-label="Download ${escapeHtml(e.track.trackName || '')} from Soulseek">${DL_SVG}</button>`);
  });
  // the player: the song playing, when it isn't from a file already
  const host = document.getElementById('miniPlayerTitle'); if (!host) return;
  if (typeof likeTitleRow === 'function' && likeNow && likeNow()) likeTitleRow(host);
  let pb = host.parentElement.querySelector(':scope > .dl-btn.dl-player');
  const now = typeof likeNow === 'function' ? likeNow() : null, local = typeof activePlayerEngine !== 'undefined' && activePlayerEngine === 'local';
  if (!now || local) { if (pb) pb.hidden = true; return; }
  if (!pb) { const after = host.parentElement.querySelector(':scope > .lk-heart.lk-player') || host; after.insertAdjacentHTML('afterend', `<button type="button" class="dl-btn dl-player" title="Download this song from Soulseek" aria-label="Download this song from Soulseek">${DL_SVG}</button>`); pb = host.parentElement.querySelector(':scope > .dl-btn.dl-player'); }
  const rec = p2pDl[artKey(now.item)], so = rec ? p2pSongFor(now.item, { trackNumber: now.num, trackName: now.name }) : null;
  pb.hidden = !!(so && (p2pActive(so) || (so.st === 'done' && so.local)));
  pb.dataset.dlRow = String(now.item.row); pb.dataset.dlNum = String(now.num); pb.dataset.dlName = now.name || '';
}
// "↓ Download" in a release's window: says where it's up to
function dlDeckPaint() {
  const b = document.getElementById('deckDownloadBtn'); if (!b) return;
  const it = typeof activeItem !== 'undefined' ? activeItem : null; if (!it) return;
  const rec = p2pDl[artKey(it)], songs = rec ? rec.songs.filter(s => s.asked || rec.keepAll) : [];
  const done = songs.filter(s => s.st === 'done' && s.local).length, active = songs.filter(p2pActive).length, fail = songs.filter(s => s.st === 'fail').length;
  b.textContent = !songs.length ? '↓ Download' : active ? `↓ Downloading ${done} of ${songs.length}` : fail ? `↓ ${fail} didn’t download: retry` : done === songs.length ? '✓ Downloaded' : '↓ Download';
  b.classList.toggle('dl-going', !!active); b.classList.toggle('dl-done', !active && !fail && songs.length > 0 && done === songs.length);
}

// ----- the Downloads view -----
function dlvRecs() { return Object.values(typeof p2pDl === 'undefined' ? {} : p2pDl).filter(r => !r.dlvHidden && r.songs.some(s => p2pActive(s) || s.st === 'fail' || s.asked || (s.st === 'done' && s.local) || r.keepAll)); }
function dlvSongsOf(rec) { return rec.songs.filter(s => rec.keepAll || s.asked || p2pActive(s) || s.st === 'fail' || (s.st === 'done' && s.local)); }
function dlvKind(rec) { const ss = dlvSongsOf(rec); if (ss.some(p2pActive) || p2pSwitching.has(rec.key)) return 'active'; if (ss.some(s => s.st === 'fail')) return 'fail'; return 'done'; }
const dlvMB = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(0.1, b / 1e6).toFixed(1) + ' MB';
const dlvSpeed = (bps) => bps ? (bps >= 1e6 ? (bps / 1e6).toFixed(1) + ' MB/s' : Math.round(bps / 1e3) + ' KB/s') : '';
const dlvOrd = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
function dlvSongLine(rec, s) {
  let st = '', bar = s.pct || 0, cls = '';
  if (s.st === 'down') st = `${Math.round(s.pct || 0)}%${s.speed ? ' · ' + dlvSpeed(s.speed) : ''}`;
  else if (s.st === 'wait') { st = s.place > 0 ? `waiting · ${dlvOrd(s.place)} in queue` : 'waiting'; bar = 0; }
  else if (s.st === 'done' && s.local) { st = '✓ on your disk'; bar = 100; cls = 'done'; }
  else if (s.st === 'done') { st = 'saving…'; bar = 100; cls = 'done'; }
  else if (s.st === 'gone') { st = s.played ? 'played, then deleted' : 'deleted'; bar = 100; cls = 'gone'; }
  else if (s.st === 'fail') { st = 'didn’t work' + (s.err ? ': ' + s.err : ''); bar = 100; cls = 'fail'; }
  else st = rec.keepAll ? 'not started' : 'not asked for';
  const idx = rec.songs.indexOf(s), again = s.st === 'fail' || (s.st === 'done' && !s.local && s.missingAt) ? `<button type="button" class="dlv-retry" data-dlv="retrysong" data-key="${escapeHtml(rec.key)}" data-i="${idx}" title="Try this song again">\u21bb Retry</button>` : '';          // (1.135.48)
  return `<div class="dlv-song"><span class="dlv-sn">${escapeHtml(String(s.tn || ''))} · ${escapeHtml(s.name || '')}</span><span class="dlv-st ${cls}" title="${escapeHtml(st)}">${escapeHtml(st)}</span>${again}<span class="dlv-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, bar)).toFixed(1)}%"></i></span></div>`;
}
function dlvHtml() {
  const pr = dlvPrefs(), recs = dlvRecs(), ready = typeof p2p !== 'undefined' && p2p.ready && p2p.configured;
  const allSongs = recs.flatMap(dlvSongsOf), down = allSongs.filter(s => s.st === 'down').length, wait = allSongs.filter(s => s.st === 'wait').length, done = allSongs.filter(s => s.st === 'done' && s.local).length;
  const speed = allSongs.reduce((a, s) => a + (s.st === 'down' ? Number(s.speed) || 0 : 0), 0);
  const kinds = { active: recs.filter(r => dlvKind(r) === 'active'), done: recs.filter(r => dlvKind(r) === 'done'), fail: recs.filter(r => dlvKind(r) === 'fail') };
  const shown = kinds[pr.filter] || kinds.active;
  const chip = (v, t, n) => `<button type="button" class="chip-btn fp-chip${pr.filter === v ? ' active' : ''}" data-dlv="filter" data-v="${v}" aria-pressed="${pr.filter === v}">${t}${n ? ' · ' + n : ''}</button>`;
  const folder = typeof p2pDirPerm === 'undefined' ? 'none' : p2pDirPerm;
  const status = !ready ? `<span class="dlv-bad">● The CRATE for P2P add-on isn’t ready</span><button type="button" class="chip-btn" data-dlv="setup">Find on P2P…</button>`
    : `<span class="dlv-ok">● slskd connected</span><span class="dlv-dim">${dlvSpeed(speed) || 'idle'}</span>`;
  const cover = (rec) => { const it = p2pItemByKey(rec.key); const art = it ? ((state.artCache[artKey(it)] && state.artCache[artKey(it)].art) || it.cover || '') : ''; return art ? `<img class="dlv-cv" src="${escapeHtml(art)}" alt="" loading="lazy">` : '<span class="dlv-cv fp-noimg"></span>'; };
  const groups = shown.map(rec => {
    const ss = dlvSongsOf(rec), n = ss.length, got = ss.filter(s => (s.st === 'done' && s.local) || s.st === 'gone').length;
    const pct = n ? ss.reduce((a, s) => a + ((s.st === 'done' || s.st === 'gone') ? 100 : s.st === 'down' ? (s.pct || 0) : 0), 0) / n : 0;
    const ext = ((/\.([a-z0-9]{2,5})$/i.exec((ss[0] || {}).path || '') || [])[1] || '').toUpperCase(), size = ss.reduce((a, s) => a + (s.size || 0), 0);
    const kind = dlvKind(rec), switching = p2pSwitching.has(rec.key);
    return `<div class="dlv-grp" data-key="${escapeHtml(rec.key)}">
      <div class="dlv-gh">${cover(rec)}<span class="dlv-gt"><b>${escapeHtml(rec.title)}</b><span>${escapeHtml(rec.artist)}</span><span class="dlv-dim">${[ext, size ? dlvMB(size) : '', 'from ' + rec.user].filter(Boolean).map(escapeHtml).join(' · ')}</span></span>
        <button type="button" class="soc-dots" data-dlv="menu" data-key="${escapeHtml(rec.key)}" aria-label="More for ${escapeHtml(rec.title)}" aria-haspopup="menu">⋯</button></div>
      <div class="dlv-gsum"><span>${switching ? 'Finding another sharer…' : kind === 'fail' ? `${ss.filter(s => s.st === 'fail').length} didn’t work` : `${got} of ${n} song${n === 1 ? '' : 's'}`}</span>${kind === 'fail' ? `<button type="button" class="chip-btn" data-dlv="retry" data-key="${escapeHtml(rec.key)}">Retry</button>` : ''}</div>
      <span class="dlv-bar dlv-gbar ${kind === 'done' ? 'done' : kind === 'fail' ? 'fail' : ''}"><i style="width:${pct.toFixed(1)}%"></i></span>
      <div class="dlv-songs">${ss.map(s => dlvSongLine(rec, s)).join('')}</div></div>`;
  }).join('');
  const keep = p2pKeep();
  const empty = pr.filter === 'active' ? `<div class="soc-empty"><b>Nothing downloading.</b><p>Use ↓ Download on a release, the ↓ on a song, or the ↓ in the player.</p></div>` : pr.filter === 'done' ? '<div class="soc-empty">Nothing downloaded yet.</div>' : '<div class="soc-empty">Nothing went wrong.</div>';
  return `<div class="dlv-sum"><div class="dlv-row">${status}</div>
      <div class="dlv-row"><span>${down} downloading · ${wait} waiting · ${done} on disk</span><span class="dlv-dim">${folder === 'granted' ? 'Folder: ' + escapeHtml((p2pDir && p2pDir.name) || 'chosen') : folder === 'prompt' ? '<button type="button" class="chip-btn" data-dlv="allow">Allow the folder</button>' : '<button type="button" class="chip-btn" data-dlv="pick">Choose the folder</button>'}</span></div>
      <div class="dlv-row dlv-chips">${chip('active', 'Active', kinds.active.length)}${chip('done', 'Done', kinds.done.length)}${chip('fail', 'Didn’t work', kinds.fail.length)}</div></div>
    <div class="dlv-list">${groups || empty}</div>
    <div class="dlv-foot">
      <label class="dlv-set">After playing <select id="dlvKeep" class="fp-sort" aria-label="After playing"><option value="delete"${keep.mode === 'delete' ? ' selected' : ''}>Delete the file</option><option value="cap"${keep.mode === 'cap' ? ' selected' : ''}>Keep up to ${escapeHtml(String(keep.capGb || 2))} GB</option><option value="keep"${keep.mode === 'keep' ? ' selected' : ''}>Keep everything</option></select></label>
      <label class="dlv-set">Ahead <select id="dlvAhead" class="fp-sort" aria-label="Download ahead">${[0, 1, 2, 3].map(n => `<option value="${n}"${p2pAhead() === n ? ' selected' : ''}>${n} song${n === 1 ? '' : 's'}</option>`).join('')}</select></label>
      <label class="dlv-set dlv-chk"><input type="checkbox" id="dlvAuto" ${pr.autoOpen ? 'checked' : ''}> Open when I download</label>
      ${kinds.done.length ? '<button type="button" class="chip-btn" data-dlv="clear">Clear done</button>' : ''}</div>`;
}
function dlvCount() { return dlvRecs().filter(r => dlvKind(r) === 'active').length; }
function dlvRender() {
  const pr = dlvPrefs(), n = dlvCount();
  const tabN = document.getElementById('dlvTabCount'); if (tabN) { tabN.hidden = !n; tabN.textContent = String(n); }
  const rp = document.getElementById('rightPanel'), dockOn = pr.tab === 'downloads' && pr.mode === 'dock';
  if (rp) rp.classList.toggle('dlv-on', dockOn);
  const fl = document.getElementById('dlvFloat'); if (fl) fl.hidden = !(pr.mode === 'float' && pr.open);
  const target = dockOn ? document.getElementById('dlvDockBody') : (pr.mode === 'float' && pr.open ? document.getElementById('dlvFloatBody') : null);
  if (!target) return;
  if (target.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;          // (don't redraw under an open dropdown)
  const list = target.querySelector('.dlv-list'), top = list ? list.scrollTop : 0;
  target.innerHTML = dlvHtml();
  const l2 = target.querySelector('.dlv-list'); if (l2) l2.scrollTop = top;
}
function dlvOpen(mode) {                                            // mode: 'dock' (the right-hand column) or 'float'
  const m = mode || dlvPrefs().mode;
  dlvSave({ mode: m, tab: m === 'dock' ? 'downloads' : dlvPrefs().tab, open: true });
  if (m === 'float') dlvPlace();
  dlvRender();
}
function dlvAutoOpen() { const pr = dlvPrefs(); if (!pr.autoOpen) return; if (pr.mode === 'float') { if (!pr.open) dlvOpen('float'); } else if (pr.tab !== 'downloads') dlvOpen('dock'); }
function dlvPlace() {
  const pn = document.getElementById('dlvFloat'); if (!pn) return; const v = dlvPrefs();
  if (v.w) pn.style.width = Math.max(300, Math.min(v.w, innerWidth - 16)) + 'px';
  if (v.h) pn.style.height = Math.max(240, Math.min(v.h, innerHeight - 16)) + 'px';
  const w = pn.offsetWidth || 360; pn.style.left = Math.max(8, Math.min(v.x == null ? innerWidth - w - 24 : v.x, innerWidth - w - 8)) + 'px'; pn.style.top = Math.max(8, Math.min(v.y == null ? 140 : v.y, innerHeight - 60)) + 'px';
}
function dlvMenuClose() { const m = document.getElementById('dlvMenu'); if (m) m.remove(); document.removeEventListener('mousedown', dlvMenuOutside, true); }
function dlvMenuOutside(e) { if (!e.target.closest('#dlvMenu')) dlvMenuClose(); }
function dlvMenuOpen(btn, key) {
  dlvMenuClose(); const rec = p2pDl[key]; if (!rec) return; const item = p2pItemByKey(key), kind = dlvKind(rec);
  const m = document.createElement('div'); m.id = 'dlvMenu'; m.className = 'fp-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="fp-menu-h"><b>${escapeHtml(rec.title)}</b><span>from ${escapeHtml(rec.user)}</span></div>`
    + (kind === 'fail' ? '<button type="button" role="menuitem" data-dm="retry">Retry</button>' : '')
    + (kind === 'active' ? '<button type="button" role="menuitem" data-dm="stop">Stop downloading</button>' : `<button type="button" role="menuitem" data-dm="all">Download every song</button>`)
    + (item ? '<button type="button" role="menuitem" data-dm="source">Change source…</button><button type="button" role="menuitem" data-dm="open">Open in my crate</button>' : '')
    + (kind === 'done' ? '<button type="button" role="menuitem" data-dm="hide">Clear from this list</button>' : '')
    + '<button type="button" role="menuitem" class="soc-danger-item" data-dm="forget">Forget (stop, and delete its files)</button>';
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px'; m.style.top = (r.bottom + m.offsetHeight + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - m.offsetHeight - 4)) + 'px';
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dm]'); if (!b) return; const a = b.dataset.dm;
    if (a === 'forget' && b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Forget it? Its files are deleted: click again'; return; }
    dlvMenuClose();
    if (a === 'retry') await p2pRetry(key);
    else if (a === 'stop') await p2pCancel(key);
    else if (a === 'all' && item) await dlRelease(item);
    else if (a === 'source' && item) p2pOpen(item);
    else if (a === 'open' && item) openDeck(item);
    else if (a === 'hide') { rec.dlvHidden = true; p2pDlSave(); }
    else if (a === 'forget') await p2pForget(key);
    dlvRender();
  });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { dlvMenuClose(); btn.focus(); } });
  setTimeout(() => document.addEventListener('mousedown', dlvMenuOutside, true), 0);
  const first = m.querySelector('button'); if (first) first.focus();
}
function dlvWire(root) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dlv]'); if (!b) return; const a = b.dataset.dlv;
    if (a === 'filter') { dlvSave({ filter: b.dataset.v }); dlvRender(); }
    else if (a === 'menu') dlvMenuOpen(b, b.dataset.key);
    else if (a === 'retry') { await p2pRetry(b.dataset.key); dlvRender(); }
    else if (a === 'retrysong') { const rec = p2pDl[b.dataset.key], so = rec && rec.songs[Number(b.dataset.i)]; if (so) await p2pRetrySong(so); }
    else if (a === 'clear') { dlvRecs().filter(r => dlvKind(r) === 'done').forEach(r => { r.dlvHidden = true; }); p2pDlSave(); dlvRender(); }
    else if (a === 'allow') { await p2pDirAllow(); dlvRender(); }
    else if (a === 'pick') { await p2pDirPick(); dlvRender(); }
    else if (a === 'setup') p2pOpen(null);
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'dlvKeep') { p2pSetKeep({ mode: t.value }); t.blur(); dlvRender(); }
    else if (t.id === 'dlvAhead') { p2pSetKeep({ ahead: Number(t.value) }); t.blur(); p2pSyncWindow(); dlvRender(); }
    else if (t.id === 'dlvAuto') dlvSave({ autoOpen: t.checked });
  });
}
function dlvDragInit(pn) {
  const head = pn.querySelector('.dlv-fhead');
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const r = pn.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; head.setPointerCapture(e.pointerId); e.preventDefault();
    const move = (ev) => { pn.style.left = Math.max(8, Math.min(ev.clientX - dx, innerWidth - r.width - 8)) + 'px'; pn.style.top = Math.max(8, Math.min(ev.clientY - dy, innerHeight - 48)) + 'px'; };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); dlvSave({ x: parseFloat(pn.style.left), y: parseFloat(pn.style.top) }); };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
  });
  if (window.ResizeObserver) { let t = 0; new ResizeObserver(() => { if (pn.hidden) return; clearTimeout(t); t = setTimeout(() => { const r = pn.getBoundingClientRect(); if (r.width && pn.style.height) dlvSave({ w: Math.round(r.width), h: Math.round(r.height) }); }, 300); }).observe(pn); }
  window.addEventListener('resize', () => { if (!pn.hidden) dlvPlace(); });
}

function initDownloads() {
  // the right-hand column: "Up next | Downloads" at its top, and the Downloads list (it takes the column over while it's open)
  // (1.130.2) No row of its own (it took height from the column, and Track info's cover is the first to shrink): a "↓ Downloads" button in
  // Up Next's own header opens it, and the Downloads view has a header of its own with "Up next" to go back and ⧉ to float it.
  const rp = document.getElementById('rightPanel'), qbar = document.querySelector('#rightPanelQueueSection .panel-bar');
  if (rp && !document.getElementById('dlvDock')) {
    if (qbar) { const clr = document.getElementById('crateQueueClearBtn'); const html = `<button type="button" class="chip-btn dlv-open-btn" data-dlv-tab="downloads" title="Downloads from Soulseek">↓ Downloads <span id="dlvTabCount" class="soc-unread" hidden></span></button>`; if (clr) clr.insertAdjacentHTML('beforebegin', html); else qbar.insertAdjacentHTML('beforeend', html); }
    rp.insertAdjacentHTML('afterbegin', `<div id="dlvDock" class="right-panel-section dlv-dock"><div class="panel-bar"><span class="panel-label">Downloads</span><button type="button" class="chip-btn" data-dlv-tab="queue">Up next</button><button type="button" class="friends-hbtn dlv-pop" data-dlv-pop title="Float Downloads as a window" aria-label="Float Downloads as a window">⧉</button></div><div id="dlvDockBody" class="dlv-body"></div></div>`);
    rp.addEventListener('click', (e) => {
      const t = e.target.closest('[data-dlv-tab]'); if (t && rp.contains(t)) { if (t.dataset.dlvTab === 'downloads') dlvOpen('dock'); else { dlvSave({ tab: 'queue' }); dlvRender(); } return; }
      if (e.target.closest('[data-dlv-pop]')) { dlvSave({ tab: 'queue' }); dlvOpen('float'); }
    });
    dlvWire(document.getElementById('dlvDockBody'));
  }
  // the floating window
  if (!document.getElementById('dlvFloat')) {
    document.body.insertAdjacentHTML('beforeend', `<aside id="dlvFloat" class="friends-panel dlv-float" role="dialog" aria-label="Downloads" hidden><div class="friends-head dlv-fhead"><div class="friends-head-t"><h2>Downloads</h2></div>
      <button type="button" class="friends-hbtn" data-dlv-dock title="Put Downloads back in the right-hand column" aria-label="Dock Downloads">⇥</button><button type="button" class="friends-hbtn" data-dlv-close aria-label="Close Downloads">✕</button></div><div id="dlvFloatBody" class="dlv-body friends-body"></div></aside>`);
    const fl = document.getElementById('dlvFloat');
    fl.addEventListener('click', (e) => { if (e.target.closest('[data-dlv-close]')) { dlvSave({ open: false }); dlvRender(); } else if (e.target.closest('[data-dlv-dock]')) { dlvSave({ mode: 'dock', open: false }); dlvOpen('dock'); } });
    fl.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.matches('select, input')) { dlvSave({ open: false }); dlvRender(); } });
    dlvWire(document.getElementById('dlvFloatBody')); dlvDragInit(fl);
  }
  // the buttons
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.dl-btn'); if (!b) return; e.preventDefault(); e.stopPropagation();
    const it = likeItemByRow(b.dataset.dlRow); if (it) dlSong(it, Number(b.dataset.dlNum), b.dataset.dlName);
  }, true);
  const deckBtn = document.getElementById('deckDownloadBtn');
  if (deckBtn) deckBtn.addEventListener('click', () => { const it = typeof activeItem !== 'undefined' ? activeItem : null; if (!it) return; const rec = p2pDl[artKey(it)]; if (rec && rec.songs.some(s => s.st === 'fail') && !rec.songs.some(p2pActive)) p2pRetry(artKey(it)).then(dlvRender); else dlRelease(it); });
  const mb = document.getElementById('menuDownloads'); if (mb) mb.addEventListener('click', () => { const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; dlvOpen(); });
  // keep it current
  let t = 0; new MutationObserver((recs) => { if (!pageGotElements(recs)) return; clearTimeout(t); t = setTimeout(dlPaint, 160); }).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (document.hidden) return; dlPaint(); dlDeckPaint(); dlvRender(); }, 1000);
  if (dlvPrefs().mode === 'float' && dlvPrefs().open) dlvPlace();
  setTimeout(() => { dlPaint(); dlvRender(); }, 2500);
}
initDownloads();
