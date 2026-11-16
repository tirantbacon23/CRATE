// CRATE — liked songs: a heart on every song, and a Liked songs page.
// One part of the page's script, split by feature (see 01-core.js).
//
// LIKING: a heart beside the song in the player and in Track info, and on every song row (a release's tracklist, the Tracks view, a
// release's songs in the browser). Click it, or press L for the song playing. A song is liked with its release: the per-song data
// (TrackData) that already holds its links and your song rating gets { liked: <ISO date>, likedName: <the song's name> }, so it needs no
// backend change and travels with the release when it's edited or merged.
// THE PAGE: "♥ Liked songs" at the top of Playlists (and ⚙ → Tools) opens a tab: every liked song, newest first, with Play and Shuffle,
// sorting by when you liked it, artist, release or song, a search, and filters by genre and decade. A click on a song plays the list
// from there.
// FRIENDS: with "My liked songs" on (Friends settings), friends see them on your page (a Liked tab).
//
// The hearts are added by one routine that looks at what's on screen (as the P2P badges are), so every song list gets them without each
// list's own code having to know.

const LIKE_SVG = (on) => `<svg viewBox="0 0 24 24" ${on ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2"'} aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2 0 3.6 1.1 4.4 2.7.8-1.6 2.4-2.7 4.4-2.7 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>`;
const likedUi = { sort: 'new', q: '', genre: '', decade: '' };

function likeItemByRow(row) { row = String(row); return (typeof activeItem !== 'undefined' && activeItem && String(activeItem.row) === row) ? activeItem : (state.raw || []).find(r => String(r.row) === row) || null; }
function likeIsOn(item, num) { const e = item && item.trackData && item.trackData[num]; return !!(e && e.liked); }
function likeTrackName(item, num) {
  const e = item && item.trackData && item.trackData[num]; if (e && e.likedName) return e.likedName;
  const t = (state.trackCache[artKey(item)] || []).find(x => Number(x.trackNumber) === Number(num)); return (t && t.trackName) || (e && e.name) || `Track ${num}`;
}
async function likeSet(item, num, name, on) {
  if (!item || !num) return;
  if (!item.trackData) item.trackData = {};
  const e = item.trackData[num] || (item.trackData[num] = {});
  if (on) { e.liked = new Date().toISOString(); e.likedName = String(name || likeTrackName(item, num)).slice(0, 300); }
  else { delete e.liked; delete e.likedName; if (!Object.keys(e).length) delete item.trackData[num]; }
  likePaint(true); if (state.activeTab === 'liked') renderLikedPage();
  try { await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData) }); }
  catch (err) {                                                   // put it back as it was, and say so
    if (on) { delete e.liked; delete e.likedName; } else { e.liked = new Date().toISOString(); e.likedName = String(name || ''); }
    likePaint(true); if (typeof flashGlobalToast === 'function') flashGlobalToast('Couldn’t save the like. Try again.');
  }
}
function likeToggle(item, num, name) { likeSet(item, num, name, !likeIsOn(item, num)); }
function likeBtnHtml(item, num, name, cls) {
  const on = likeIsOn(item, num), nm = escapeHtml(name || '');
  return `<button type="button" class="lk-heart ${cls || ''}" data-lk-row="${escapeHtml(String(item.row))}" data-lk-num="${escapeHtml(String(num))}" data-lk-name="${nm}" aria-pressed="${on}" aria-label="${on ? 'Unlike' : 'Like'} ${nm}" title="${on ? 'Liked: click to unlike' : 'Like this song'}">${LIKE_SVG(on)}</button>`;
}

// The song playing: its release, its number and name (null when nothing is in the player)
function likeNow() {
  if (!el.miniPlayer || el.miniPlayer.hidden) return null;
  const inQ = crateQueueList.length && crateQueueIndex >= 0 && crateQueueIndex < crateQueueList.length, e = inQ ? crateQueueList[crateQueueIndex] : null;
  const item = e ? e.item : (typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null); if (!item) return null;
  const name = (e && e.track && e.track.trackName) || (typeof pbNowName === 'function' ? pbNowName() : '');
  let num = e && e.track && e.track.trackNumber;
  if (!num && name) { const t = (state.trackCache[artKey(item)] || []).find(x => pbFold(x.trackName) === pbFold(name)); num = t && t.trackNumber; }
  return num ? { item, num: Number(num), name } : null;
}

// (1.130.1) The player's and Track info's title sit in a column (title, artist, album…): the buttons beside the song's name go in one row
// with the title, or each became a line of its own. The title keeps its own element, so the player still writes its text into it.
function likeTitleRow(host) {
  if (host.parentElement && host.parentElement.classList.contains('lk-title-row')) return host.parentElement;
  const row = document.createElement(host.tagName === 'P' ? 'div' : 'span'); row.className = 'lk-title-row';
  host.parentElement.insertBefore(row, host); row.appendChild(host); return row;
}

// ----- the hearts on screen -----
function likeRowSong(row) {
  const key = row.dataset.trackKey || '';
  let m = /^(.*)::@(\d+)$/.exec(key);
  if (m) { const it = likeItemByRow(m[1]); if (!it) return null; const t = (state.trackCache[artKey(it)] || [])[Number(m[2])]; return t && t.trackNumber ? { item: it, num: Number(t.trackNumber), name: t.trackName || '' } : null; }
  m = /^(.*)::(\d+)$/.exec(key);
  if (m) { const it = likeItemByRow(m[1]); if (!it) return null; const nm = row.querySelector('.track-name'); return { item: it, num: Number(m[2]), name: nm ? nm.textContent.trim() : '' }; }
  return null;
}
function likeSync(btn, on) { if (btn.getAttribute('aria-pressed') === String(on)) return; btn.setAttribute('aria-pressed', String(on)); btn.innerHTML = LIKE_SVG(on); const nm = btn.dataset.lkName || ''; btn.setAttribute('aria-label', (on ? 'Unlike ' : 'Like ') + nm); btn.title = on ? 'Liked: click to unlike' : 'Like this song'; }
function likePaint(all) {
  // song rows: a heart where the row has room for one
  document.querySelectorAll('.track-row[data-track-key], .main-track-row[data-track-key], .track-row-wrap[data-track-key]').forEach(row => {
    let b = row.querySelector('.lk-heart');
    if (b && !all) return;
    const s = likeRowSong(row); if (!s) return;
    if (b) { likeSync(b, likeIsOn(s.item, s.num)); return; }
    const html = likeBtnHtml(s.item, s.num, s.name, 'lk-row');
    if (row.classList.contains('track-row-wrap')) { const at = row.querySelector('.track-interactive'); if (at) at.insertAdjacentHTML('afterbegin', html); }
    else if (row.classList.contains('main-track-row')) { const at = row.querySelector('.mt-title'); if (at) at.insertAdjacentHTML('afterbegin', html); }
    else { const at = row.querySelector('.track-name'); if (at) at.insertAdjacentHTML('beforeend', html); }          // (1.129.0) inside the name: these rows are a fixed grid, and an extra cell wrapped the song's length onto a line of its own
  });
  // the player and Track info: the song playing
  const now = likeNow();
  [['miniPlayerTitle', 'lk-player'], ['trackInfoTitle', 'lk-info']].forEach(([id, cls]) => {
    const host = document.getElementById(id); if (!host) return;
    if (now) likeTitleRow(host);
    let b = host.parentElement.querySelector(':scope > .lk-heart.' + cls);
    if (!now) { if (b) b.hidden = true; return; }
    if (!b) { host.insertAdjacentHTML('afterend', likeBtnHtml(now.item, now.num, now.name, cls)); b = host.parentElement.querySelector(':scope > .lk-heart.' + cls); }
    b.hidden = false; b.dataset.lkRow = String(now.item.row); b.dataset.lkNum = String(now.num); b.dataset.lkName = now.name || '';
    likeSync(b, likeIsOn(now.item, now.num));
  });
}

// ----- the Liked songs page -----
function likedAll() {
  const out = [];
  (state.raw || []).forEach(it => { const td = it.trackData || {}; Object.keys(td).forEach(k => { const e = td[k]; if (e && e.liked) out.push({ item: it, num: Number(k), name: e.likedName || likeTrackName(it, k), at: Date.parse(e.liked) || 0 }); }); });
  return out;
}
function likedSongInfo(x) {
  const t = (state.trackCache[artKey(x.item)] || []).find(y => Number(y.trackNumber) === x.num), e = (x.item.trackData || {})[x.num] || {};
  const m = !t && Array.isArray(x.item.manualTracks) ? x.item.manualTracks.find(y => Number(y.trackNumber) === x.num) : null;          // (a typed-in tracklist)
  return { ms: (t && t.trackTimeMillis) || (m && m.durationMs) || 0, rating: Number(e.rating) || 0, desc: Array.isArray(e.desc) ? e.desc : [] };
}
// (1.132.0) sort by any column (click its heading; again to reverse), and list or covers, kept in this browser
const LIKED_PREFS_KEY = 'crate_liked_v1';
try { Object.assign(likedUi, JSON.parse(localStorage.getItem(LIKED_PREFS_KEY) || '{}')); } catch (e) { /* defaults */ }
if (!likedUi.view) likedUi.view = 'list'; if (!likedUi.dir) likedUi.dir = 1;
if (likedUi.sort === 'new') { likedUi.sort = 'liked'; likedUi.dir = -1; }
// (1.134.0) Browsing: the same browser column as the Music view and playlists (#leftPanel: Albums, Artists, Genres, Labels, Descriptors…),
// listing the releases you've liked songs from; what's picked there, the search box and the other filters narrow the songs, by the same rules.
function likedReleases() { const seen = new Set(), out = []; likedAll().forEach(x => { if (!seen.has(x.item)) { seen.add(x.item); out.push(x.item); } }); return out; }
function likedPrefsSave() { try { localStorage.setItem(LIKED_PREFS_KEY, JSON.stringify({ sort: likedUi.sort, dir: likedUi.dir, view: likedUi.view })); } catch (e) { /* this visit only */ } }
function likedShown() {
  const q = pbFold(likedUi.q); let list = likedAll();
  const terms = typeof getSearchTerms === 'function' ? getSearchTerms() : [];
  if (typeof albumPassesBrowse === 'function') list = list.filter(x => albumPassesBrowse(x.item, terms));
  if (q) list = list.filter(x => pbFold([x.name, x.item.artist, x.item.title, ((x.item.trackData || {})[x.num] || {}).desc ? x.item.trackData[x.num].desc.join(' ') : ''].join(' ')).includes(q));
  list.forEach(x => { x.info = likedSongInfo(x); });
  const txt = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const by = {
    liked: (a, b) => a.at - b.at,
    song: (a, b) => txt(a.name, b.name),
    artist: (a, b) => txt(a.item.artist, b.item.artist) || txt(a.item.title, b.item.title) || a.num - b.num,
    release: (a, b) => txt(a.item.title, b.item.title) || a.num - b.num,
    rating: (a, b) => a.info.rating - b.info.rating,
    time: (a, b) => a.info.ms - b.info.ms,
  }[likedUi.sort] || ((a, b) => a.at - b.at);
  const d = likedUi.dir < 0 ? -1 : 1;
  return list.sort((a, b) => d * by(a, b) || b.at - a.at);
}
function likedPlay(list, from, shuffle) {
  let l = list.slice(from || 0); if (shuffle) l = list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  if (!l.length) return;
  playTracksNow(l.map(x => ({ row: x.item.row, trackNum: x.num, trackName: x.name })));
}
function likedStars(r) { if (!r) return ''; const full = Math.floor(r), half = r - full >= 0.5; return '★'.repeat(full) + (half ? '½' : ''); }
function likedCover(it, cls) { const c = state.artCache[artKey(it)], art = (c && c.art) || it.cover || ''; return art ? `<img class="${cls}" src="${escapeHtml(art)}" alt="" loading="lazy">` : `<span class="${cls} fp-noimg"></span>`; }
function likedListHtml(list, now) {
  const col = (k, t, cls) => { const on = likedUi.sort === k; return `<th class="${cls || ''}" scope="col" aria-sort="${on ? (likedUi.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button type="button" class="lkp-sort${on ? ' on' : ''}" data-lkp="sort" data-v="${k}">${t}${on ? (likedUi.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`; };
  return `<table class="lkp-tbl"><thead><tr><th class="lkp-n" scope="col">#</th>${col('song', 'Title')}${col('artist', 'Artist', 'lkp-c-ar')}${col('release', 'Release', 'lkp-c-rel')}<th class="lkp-c-desc" scope="col">Descriptors</th>${col('rating', 'Rating', 'lkp-c-rt')}${col('liked', 'Liked', 'lkp-c-when')}${col('time', 'Time', 'lkp-c-tm')}</tr></thead><tbody>`
    + list.map((x, i) => `<tr class="lkp-tr${now && now.item === x.item && now.num === x.num ? ' playing' : ''}" data-lkp="row" data-i="${i}" tabindex="0" aria-label="Play ${escapeHtml(x.name)}">
      <td class="lkp-n">${i + 1}</td>
      <td><span class="lkp-tt">${likedCover(x.item, 'lkp-cv')}<span class="lkp-t"><b>${escapeHtml(x.name)}</b><span class="lkp-sub">${escapeHtml(x.item.artist)} · ${escapeHtml(x.item.title)}</span></span>${likeBtnHtml(x.item, x.num, x.name, 'lk-row')}</span></td>
      <td class="lkp-c-ar">${escapeHtml(x.item.artist)}</td><td class="lkp-c-rel"><button type="button" class="lkp-link" data-lkp="rel" data-row="${escapeHtml(String(x.item.row))}">${escapeHtml(x.item.title)}</button></td>
      <td class="lkp-c-desc">${escapeHtml(x.info.desc.slice(0, 3).join(', '))}</td><td class="lkp-c-rt">${likedStars(x.info.rating)}</td>
      <td class="lkp-c-when">${typeof socAgo === 'function' && x.at ? socAgo(x.at) : ''}</td><td class="lkp-c-tm">${x.info.ms ? formatDuration(x.info.ms) : ''}</td></tr>`).join('')
    + '</tbody></table>';
}
function likedCoversHtml(list, now) {
  const groups = new Map(); list.forEach((x, i) => { const k = String(x.item.row); if (!groups.has(k)) groups.set(k, { item: x.item, songs: [] }); groups.get(k).songs.push({ x, i }); });
  return `<div class="lkp-grid">${[...groups.values()].map(g => `<div class="lkp-card">
    <button type="button" class="lkp-card-cv" data-lkp="rel" data-row="${escapeHtml(String(g.item.row))}" aria-label="Open ${escapeHtml(g.item.title)}">${likedCover(g.item, 'lkp-card-img')}<span class="lkp-badge"><b>♥</b> ${g.songs.length}</span></button>
    <div class="lkp-card-nm">${escapeHtml(g.item.title)}</div><div class="lkp-card-ar">${escapeHtml(g.item.artist)}</div>
    ${g.songs.slice(0, 4).map(({ x, i }) => `<button type="button" class="lkp-card-song${now && now.item === x.item && now.num === x.num ? ' playing' : ''}" data-lkp="row" data-i="${i}"><span class="lk-tab-ico" aria-hidden="true">♥</span>${escapeHtml(x.name)}</button>`).join('')}
    ${g.songs.length > 4 ? `<button type="button" class="lkp-card-more" data-lkp="rel" data-row="${escapeHtml(String(g.item.row))}">+${g.songs.length - 4} more</button>` : ''}
  </div>`).join('')}</div>`;
}
// (1.132.1) Song lengths come from the releases' tracklists: any not loaded yet are loaded (once each), then the page is drawn again.
const likedAsked = new Set();
function likedLoadTracks(all) {
  if (typeof getTracksFor !== 'function') return;
  const need = [...new Map(all.map(x => [artKey(x.item), x.item])).entries()].filter(([k]) => !state.trackCache[k] && !likedAsked.has(k));
  if (!need.length) return;
  need.forEach(([k]) => likedAsked.add(k));
  Promise.all(need.map(([, it]) => Promise.resolve(getTracksFor(it)).catch(() => null))).then(() => { if (state.activeTab === 'liked') renderLikedPage(); });
}
function likedFilterLabel() {
  const f = state.navFilter; if (!f) return '';
  if (f.mode === 'album') { const r = (state.raw || []).find(x => x.row === f.value); return r ? r.title : ''; }
  return f.mode === 'label' && typeof labelDisplayOf === 'function' ? labelDisplayOf(f.value) : String(f.value);
}
function renderLikedPage() {
  const wrap = document.getElementById('likedWrap'); if (!wrap) return;
  const all = likedAll(), list = likedShown(), rels = new Set(all.map(x => x.item.row));
  const ms = all.reduce((s, x) => s + likedSongInfo(x).ms, 0), hrs = Math.floor(ms / 3600000), mins = Math.round((ms % 3600000) / 60000);
  const now = likeNow(), keepTop = wrap.dataset.drawn ? ((wrap.querySelector('.lkp-page') || {}).scrollTop || 0) : 0, focusQ = document.activeElement && document.activeElement.id === 'lkpSearch';
  const vbtn = (v, t, ico) => `<button type="button" class="lkp-vbtn${likedUi.view === v ? ' on' : ''}" data-lkp="view" data-v="${v}" aria-pressed="${likedUi.view === v}" title="${t}" aria-label="${t}">${ico}</button>`;
  wrap.innerHTML = `<div class="lkp-page">
    <div class="lkp-head"><div class="lkp-art">${LIKE_SVG(true)}</div>
      <div class="lkp-who"><h2 class="lkp-title">Liked songs</h2><span class="lkp-meta">${list.length !== all.length ? `${state.navFilter ? escapeHtml(likedFilterLabel()) + ' · ' : ''}${list.length.toLocaleString()} of ` : ''}${all.length.toLocaleString()} song${all.length === 1 ? '' : 's'} · ${rels.size.toLocaleString()} release${rels.size === 1 ? '' : 's'}${ms ? ` · ${hrs ? hrs + ' h ' : ''}${mins} m` : ''}</span></div>
      ${all.length ? `<div class="lkp-tools">
        <input id="lkpSearch" class="lkp-search" type="search" placeholder="Find in liked songs" value="${escapeHtml(likedUi.q)}" aria-label="Find in liked songs" autocomplete="off">
        <div class="lkp-views" role="group" aria-label="Show as">${vbtn('list', 'List', '☰')}${vbtn('covers', 'Covers', '▦')}</div>
        <button type="button" class="chip-btn" data-lkp="shuffle"${list.length ? '' : ' disabled'}>Shuffle</button>
        <button type="button" class="chip-btn soc-acc" data-lkp="play"${list.length ? '' : ' disabled'}>▶ Play all</button></div>` : ''}</div>
    ${all.length ? (list.length ? (likedUi.view === 'covers' ? likedCoversHtml(list, now) : likedListHtml(list, now)) : '<div class="soc-empty">Nothing matches.</div>')
      : `<div class="soc-empty"><b>No liked songs yet.</b><p>Click the heart next to a song, in the player, in Track info or in any tracklist, or press L while it plays.</p></div>`}
  </div>`;
  likedShown.last = list; wrap.dataset.drawn = '1'; const pg = wrap.querySelector('.lkp-page'); if (pg) pg.scrollTop = keepTop;

  likedLoadTracks(all);
  if (focusQ) { const s = document.getElementById('lkpSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}
function openLikedTab() {
  const b = document.getElementById('tabLiked'); if (b) b.hidden = false;
  if (typeof isMobileDrawerLayout === 'function' && isMobileDrawerLayout() && typeof setMobileDrawer === 'function') setMobileDrawer(null);
  switchTab('liked');
}
function closeLikedTab() { const b = document.getElementById('tabLiked'); if (b) b.hidden = true; if (state.activeTab === 'liked') switchTab('albums'); }

// "♥ Liked songs" at the top of the Playlists list
function likedSidebarRow() {
  const list = el.playlistSidebarList; if (!list) return;
  const n = likedAll().length;
  let row = list.querySelector('.lk-side-row');
  if (!row) { list.insertAdjacentHTML('afterbegin', `<div class="left-row lk-side-row" tabindex="0" role="button"><span class="lk-side-ico">${LIKE_SVG(true)}</span><div class="left-row-text"><p class="left-row-title">Liked songs</p></div><span class="left-row-count"></span></div>`); row = list.querySelector('.lk-side-row'); row.addEventListener('click', openLikedTab); row.addEventListener('keydown', (e) => { if (e.key === 'Enter') openLikedTab(); }); }
  row.querySelector('.left-row-count').textContent = n ? String(n) : '';
  const empty = list.querySelector(':scope > .playlist-empty'); if (empty) empty.hidden = true;
}

function initLiked() {
  if (typeof applyFiltersSort === 'function') { const af = applyFiltersSort; applyFiltersSort = function () { const r = af.apply(this, arguments); if (state.activeTab === 'liked') renderLikedPage(); return r; }; }
  // (1.130.3) Liked songs has its own button in the far-left strip, under Playlists.
  // (1.132.0) And it's pinned at the top of the Playlist Explorer again (opening the same page), drawn with the list each time.
  if (typeof renderPlaylistSidebar === 'function') { const draw = renderPlaylistSidebar; renderPlaylistSidebar = function () { const r = draw.apply(this, arguments); try { likedSidebarRow(); } catch (e) { /* the list still works */ } return r; }; setTimeout(() => { try { likedSidebarRow(); } catch (e) { /* later */ } }, 2500); }
  // Music or Playlists in the far-left strip, from the Liked songs page: back to the music
  document.addEventListener('click', (e) => { if (state.activeTab === 'liked' && e.target.closest('#navMusicBtn, #navPlaylistsBtn')) switchTab('albums'); }, true);
  const nav = document.getElementById('navLikedBtn'); if (nav) nav.addEventListener('click', openLikedTab);
  const navPlace = () => { const n = document.getElementById('navLikedBtn'), pl = document.getElementById('navPlaylistsBtn'); if (n && pl && pl.nextElementSibling !== n) pl.after(n); };          // (CRATE moves the playlists list in under that button when it starts: Liked songs stays right under the button, above the list)
  navPlace(); setInterval(navPlace, 2000);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.lk-heart'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const it = likeItemByRow(b.dataset.lkRow); if (it) likeToggle(it, Number(b.dataset.lkNum), b.dataset.lkName);
  }, true);
  document.addEventListener('keydown', (e) => {                 // L: like or unlike what's playing
    if (e.key !== 'l' && e.key !== 'L') return; if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const now = likeNow(); if (!now) return;
    e.preventDefault(); const on = !likeIsOn(now.item, now.num); likeSet(now.item, now.num, now.name, on);
    if (typeof flashGlobalToast === 'function') flashGlobalToast(on ? `Liked ${now.name}.` : `Unliked ${now.name}.`);
  });
  const wrap = document.getElementById('likedWrap');
  if (wrap) {
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lkp]'); if (!b || e.target.closest('.lk-heart')) return;
      const k = b.dataset.lkp;
      if (k === 'sort') { const v = b.dataset.v; if (likedUi.sort === v) likedUi.dir = -likedUi.dir; else { likedUi.sort = v; likedUi.dir = (v === 'liked' || v === 'rating') ? -1 : 1; } likedPrefsSave(); renderLikedPage(); }
      else if (k === 'view') { likedUi.view = b.dataset.v; likedPrefsSave(); renderLikedPage(); }
      else if (k === 'rel') { const it = likeItemByRow(b.dataset.row); if (it && typeof openDeck === 'function') openDeck(it); }
      else if (k === 'play') likedPlay(likedShown(), 0, false);
      else if (k === 'shuffle') likedPlay(likedShown(), 0, true);
      else if (k === 'row') likedPlay(likedShown.last || [], +b.dataset.i, false);
    });
    wrap.addEventListener('keydown', (e) => { const r = e.target.closest('.lkp-tr'); if (r && e.key === 'Enter') likedPlay(likedShown.last || [], +r.dataset.i, false); });
    let qT = 0; wrap.addEventListener('input', (e) => { if (e.target.id !== 'lkpSearch') return; clearTimeout(qT); qT = setTimeout(() => { likedUi.q = e.target.value; renderLikedPage(); }, 200); });
  }
  const tab = document.getElementById('tabLiked');
  if (tab) tab.addEventListener('click', (e) => { if (e.target.closest('.lk-tab-close')) { e.stopPropagation(); closeLikedTab(); return; } openLikedTab(); });
  const mb = document.getElementById('menuLiked'); if (mb) mb.addEventListener('click', () => { const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; openLikedTab(); });
  // new rows on screen get their hearts as they appear; the player's follows the song
  let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => likePaint(false), 120); }).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden) likePaint(false); }, 1500);
  setTimeout(() => { likePaint(true); }, 3000);
}
initLiked();
