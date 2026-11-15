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
function likedShown() {
  const q = pbFold(likedUi.q); let list = likedAll();
  if (q) list = list.filter(x => pbFold([x.name, x.item.artist, x.item.title].join(' ')).includes(q));
  if (likedUi.genre) list = list.filter(x => genreTagsForRole(x.item, 'any').some(g => genreMatchesFilter(state.genreTaxonomy || {}, g, likedUi.genre)));
  if (likedUi.decade) list = list.filter(x => String(x.item.releaseDate || '').slice(0, 3) + '0s' === likedUi.decade);
  const by = { new: (a, b) => b.at - a.at, artist: (a, b) => a.item.artist.localeCompare(b.item.artist) || a.item.title.localeCompare(b.item.title) || a.num - b.num, release: (a, b) => a.item.title.localeCompare(b.item.title) || a.num - b.num, song: (a, b) => a.name.localeCompare(b.name) }[likedUi.sort];
  return list.sort(by);
}
function likedPlay(list, from, shuffle) {
  let l = list.slice(from || 0); if (shuffle) l = l.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  if (!l.length) return;
  playTracksNow(l.map(x => ({ row: x.item.row, trackNum: x.num, trackName: x.name })));
}
function renderLikedPage() {
  const wrap = document.getElementById('likedWrap'); if (!wrap) return;
  const all = likedAll(), list = likedShown(), rels = new Set(all.map(x => x.item.row));
  const genres = [...new Set(all.flatMap(x => genreTagsForRole(x.item, 'any')))].filter(g => g && g !== 'Unknown').sort();
  const decades = [...new Set(all.map(x => String(x.item.releaseDate || '').slice(0, 3)).filter(d => /^\d{3}$/.test(d)).map(d => d + '0s'))].sort().reverse();
  const chip = (v, t) => `<button type="button" class="chip-btn fp-chip${likedUi.sort === v ? ' active' : ''}" data-lkp="sort" data-v="${v}" aria-pressed="${likedUi.sort === v}">${t}</button>`;
  const cover = (it) => { const art = (state.artCache[artKey(it)] && state.artCache[artKey(it)].art) || it.cover || ''; return art ? `<img class="lkp-cv" src="${escapeHtml(art)}" alt="" loading="lazy">` : '<span class="lkp-cv fp-noimg"></span>'; };
  const now = likeNow(), keepTop = wrap.dataset.drawn ? wrap.scrollTop : 0, focusQ = document.activeElement && document.activeElement.id === 'lkpSearch';
  wrap.innerHTML = `<div class="fp-scroll">
    <div class="lkp-head"><div class="lkp-art">${LIKE_SVG(true)}</div>
      <div class="fp-who"><h2 class="fp-name">Liked songs</h2><span class="fp-status">${all.length.toLocaleString()} song${all.length === 1 ? '' : 's'} · from ${rels.size.toLocaleString()} release${rels.size === 1 ? '' : 's'}</span></div>
      <button type="button" class="chip-btn soc-acc" data-lkp="play"${list.length ? '' : ' disabled'}>▶ Play</button><button type="button" class="chip-btn" data-lkp="shuffle"${list.length ? '' : ' disabled'}>Shuffle</button></div>
    ${all.length ? `<div class="fp-tools">${chip('new', 'Newest first')}${chip('artist', 'Artist')}${chip('release', 'Release')}${chip('song', 'Song')}
      <select id="lkpGenre" class="fp-sort" aria-label="Genre"><option value="">Any genre</option>${genres.map(g => `<option${likedUi.genre === g ? ' selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select>
      <select id="lkpDecade" class="fp-sort" aria-label="Decade"><option value="">Any decade</option>${decades.map(d => `<option${likedUi.decade === d ? ' selected' : ''}>${d}</option>`).join('')}</select>
      <input id="lkpSearch" class="fp-search" type="search" placeholder="Search liked songs" value="${escapeHtml(likedUi.q)}" aria-label="Search liked songs" autocomplete="off"></div>
      <div class="lkp-list">${list.length ? list.map((x, i) => `<div class="lkp-row${now && now.item === x.item && now.num === x.num ? ' playing' : ''}" data-lkp="row" data-i="${i}" tabindex="0" role="button" aria-label="Play ${escapeHtml(x.name)}">
        ${cover(x.item)}<span class="lkp-t"><b>${escapeHtml(x.name)}</b><span>${escapeHtml(x.item.artist)} · ${escapeHtml(x.item.title)}</span></span>
        <span class="lkp-when">${socAgo ? socAgo(x.at) : ''}</span>${likeBtnHtml(x.item, x.num, x.name, 'lk-row')}</div>`).join('') : '<div class="soc-empty">Nothing matches.</div>'}</div>`
    : `<div class="soc-empty"><b>No liked songs yet.</b><p>Click the heart next to a song, in the player, in Track info or in any tracklist, or press L while it plays.</p></div>`}
  </div>`;
  likedShown.last = list; wrap.dataset.drawn = '1'; wrap.scrollTop = keepTop;
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
  // the Playlists list gets its Liked songs row each time it's drawn
  if (typeof renderPlaylistSidebar === 'function') { const orig = renderPlaylistSidebar; renderPlaylistSidebar = function () { const r = orig.apply(this, arguments); try { likedSidebarRow(); } catch (e) { /* the list still works */ } return r; }; }
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
      if (k === 'sort') { likedUi.sort = b.dataset.v; renderLikedPage(); }
      else if (k === 'play') likedPlay(likedShown(), 0, false);
      else if (k === 'shuffle') likedPlay(likedShown(), 0, true);
      else if (k === 'row') likedPlay(likedShown.last || [], +b.dataset.i, false);
    });
    wrap.addEventListener('keydown', (e) => { const r = e.target.closest('.lkp-row'); if (r && e.key === 'Enter') likedPlay(likedShown.last || [], +r.dataset.i, false); });
    let qT = 0; wrap.addEventListener('input', (e) => { if (e.target.id !== 'lkpSearch') return; clearTimeout(qT); qT = setTimeout(() => { likedUi.q = e.target.value; renderLikedPage(); }, 200); });
    wrap.addEventListener('change', (e) => { if (e.target.id === 'lkpGenre') { likedUi.genre = e.target.value; renderLikedPage(); } else if (e.target.id === 'lkpDecade') { likedUi.decade = e.target.value; renderLikedPage(); } });
  }
  const tab = document.getElementById('tabLiked');
  if (tab) tab.addEventListener('click', (e) => { if (e.target.closest('.lk-tab-close')) { e.stopPropagation(); closeLikedTab(); return; } openLikedTab(); });
  const mb = document.getElementById('menuLiked'); if (mb) mb.addEventListener('click', () => { const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; openLikedTab(); });
  // new rows on screen get their hearts as they appear; the player's follows the song
  let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => likePaint(false), 120); }).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden) likePaint(false); }, 1500);
  setTimeout(() => { likePaint(true); likedSidebarRow(); }, 3000);
}
initLiked();
