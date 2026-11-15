// CRATE — a friend's page: their crate and their diary, in a tab of its own (like a genre tab), next to yours.
// One part of the page's script, split by feature (see 01-core.js).
//
// OPENING: a friend's name in the Friends panel (or Open on their row) opens a tab named after them. Several friends can be open at once;
// each tab closes with its ×, and back / forward know about them.
// WHERE THE DATA COMES FROM: the backend's socialFriend reads it from the friend's own sheet when asked, and only what they share (crate,
// ratings, diary). Kept here for this visit; ⟳ asks again. Nothing of theirs is ever written to your sheet unless you add a release.
// CRATE: their releases as covers, with their rating, and "In mine" on the ones you have too. Filters: everything, not in my crate, in
// both, 4½ stars and up; a search; sorted by their rating, when added, artist or year. A click opens a small menu: open it in your crate
// (when you have it), add it to your crate (when you don't), or open its Spotify / Rate Your Music page.
// DIARY: their entries, newest first, grouped by month, with their rating and what they wrote.
//
// PHASE 2 of the friends sketch (https://claude.ai/artifact/2U7nNXahFHiHRG1vSP5ZvM).

state.friendTabs = state.friendTabs || [];            // friend ids, in the order opened (this visit only, like genre tabs)
state.activeFriendTab = state.activeFriendTab || null;
const fpData = {};                                    // id -> { at, loading, err, name, share, crate: [...], diary: [...] }
const fpUi = {};                                      // id -> { view, filter, sort, q, shown, dshown }
const FP_PAGE = 120, FP_DPAGE = 60;

function fpUiOf(id) { return fpUi[id] || (fpUi[id] = { view: 'crate', filter: 'all', sort: 'rating', q: '', shown: FP_PAGE, dshown: FP_DPAGE }); }
function fpFriend(id) { return (soc.friends || []).find(f => f.id === id) || null; }
function fpName(id) { const f = fpFriend(id), d = fpData[id]; return (f && f.name) || (d && d.name) || 'Friend'; }
const fpKey = (artist, title) => pbFold(artist) + '\u0001' + pbFold(title);
function fpMineMap() {
  if (fpMineMap.raw === state.raw && fpMineMap.map) return fpMineMap.map;
  const m = new Map(); (state.raw || []).forEach(x => { const k = fpKey(x.artist, x.title); if (!m.has(k)) m.set(k, x); });
  fpMineMap.raw = state.raw; fpMineMap.map = m; return m;
}

// ----- tabs -----
function renderFriendTabButtons() {
  const box = document.getElementById('friendTabsContainer'); if (!box) return;
  box.innerHTML = state.friendTabs.map(id => `
    <button type="button" class="nav-tab friend-tab-btn${id === state.activeFriendTab && state.activeTab === 'friendInfo' ? ' active' : ''}" data-friend="${escapeHtml(id)}" title="${escapeHtml(fpName(id))}'s crate">
      <span class="friend-tab-dot soc-${(fpFriend(id) || {}).status || 'offline'}" aria-hidden="true"></span>
      <span class="friend-tab-label">${escapeHtml(fpName(id))}</span>
      <span class="friend-tab-close" data-friend="${escapeHtml(id)}" title="Close" aria-label="Close ${escapeHtml(fpName(id))}'s tab">×</span>
    </button>`).join('');
  if (typeof updateTabHistoryButtons === 'function') updateTabHistoryButtons();
}
function openFriendTab(id, view) {
  if (!id) return;
  if (!state.friendTabs.includes(id)) state.friendTabs.push(id);
  state.activeFriendTab = id;
  if (view) fpUiOf(id).view = view;
  renderFriendTabButtons();
  if (typeof isMobileDrawerLayout === 'function' && isMobileDrawerLayout() && typeof setMobileDrawer === 'function') setMobileDrawer(null);
  switchTab('friendInfo');
  if (!fpData[id] || (!fpData[id].loading && Date.now() - fpData[id].at > 10 * 60000)) fpLoad(id);
}
function closeFriendTab(id) {
  const idx = state.friendTabs.indexOf(id); if (idx === -1) return;
  state.friendTabs.splice(idx, 1);
  const wasShowing = state.activeTab === 'friendInfo' && state.activeFriendTab === id;
  if (state.activeFriendTab === id) state.activeFriendTab = state.friendTabs[Math.max(0, idx - 1)] || null;
  renderFriendTabButtons();
  if (wasShowing) switchTab(state.activeFriendTab ? 'friendInfo' : 'albums');
}

// ----- data -----
async function fpLoad(id) {
  const d = fpData[id] || (fpData[id] = { at: 0 });
  d.loading = true; d.err = ''; if (state.activeTab === 'friendInfo' && state.activeFriendTab === id) renderFriendPage();
  try {
    const r = await socCall('socialFriend', { id, what: 'all' });
    d.name = r.name; d.share = r.share || {};
    d.crate = (r.crate || []).map(x => ({
      albumId: x.AlbumId || '', artist: String(x.Artist || '').trim(), title: String(x.Title || '').trim(), type: x.Type || '',
      year: x.ReleaseDate != null ? String(x.ReleaseDate).slice(0, 4) : '', releaseDate: x.ReleaseDate != null ? String(x.ReleaseDate) : '',
      genre: x.Genre || '', genre2: x.SecondaryGenre || '', label: x.Label || '', region: x.Region || '', descriptor: x.Descriptor || '',
      cover: /^https:\/\//.test(String(x.Cover || '')) ? String(x.Cover) : '', link: String(x.Link || ''), rymLink: String(x.RymLink || ''),
      rating: Number(x.Rating) || 0, rymRating: Number(x.RymRating) || 0, added: x.DateAdded ? Date.parse(x.DateAdded) || 0 : 0
    })).filter(x => x.artist || x.title);
    d.diary = (r.diary || []).map(e => ({
      date: e.Date ? String(e.Date) : '', ts: e.Timestamp ? Date.parse(e.Timestamp) || 0 : 0, artist: String(e.Artist || '').trim(), title: String(e.Title || '').trim(),
      rating: Number(e.Rating) || 0, entryTitle: String(e.EntryTitle || ''), text: String(e.Description || ''), full: e.Full === true || e.Full === 'TRUE' || e.Full === 1 || e.Full === '1'
    })).filter(e => e.artist || e.title).sort((a, b) => (Date.parse(b.date) || b.ts) - (Date.parse(a.date) || a.ts) || b.ts - a.ts);
    d.at = Date.now();
  } catch (e) { d.err = e.message || String(e); }
  d.loading = false;
  renderFriendTabButtons();
  if (state.activeTab === 'friendInfo' && state.activeFriendTab === id) renderFriendPage();
}

// ----- the page -----
function fpCover(x, cls) {
  const mine = fpMineMap().get(fpKey(x.artist, x.title));
  const art = socSafeCover(x.cover) || (mine && ((state.artCache[artKey(mine)] && state.artCache[artKey(mine)].art) || mine.cover)) || '';          // (1.117.0) only from known image services
  return art ? `<img class="${cls}" src="${escapeHtml(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('fp-noimg');this.removeAttribute('src')">` : `<span class="${cls} fp-noimg"></span>`;
}
function fpFiltered(id) {
  const d = fpData[id], ui = fpUiOf(id), mine = fpMineMap(), q = pbFold(ui.q);
  let list = (d.crate || []).filter(x => {
    const have = mine.has(fpKey(x.artist, x.title));
    if (ui.filter === 'notMine' && have) return false;
    if (ui.filter === 'both' && !have) return false;
    if (ui.filter === 'top' && !(x.rating >= 4.5)) return false;
    if (q && !pbFold([x.artist, x.title, x.genre, x.genre2, x.label, x.year].join(' ')).includes(q)) return false;
    return true;
  });
  const by = { rating: (a, b) => b.rating - a.rating || b.added - a.added, added: (a, b) => b.added - a.added, artist: (a, b) => a.artist.localeCompare(b.artist) || a.year.localeCompare(b.year), year: (a, b) => b.year.localeCompare(a.year) || a.artist.localeCompare(b.artist) }[ui.sort] || null;
  if (by) list = list.slice().sort(by);
  return list;
}
function renderFriendPage() {
  const wrap = document.getElementById('friendInfoWrap'); if (!wrap) return;
  const id = state.activeFriendTab;
  if (!id) { wrap.innerHTML = '<div class="soc-empty">Open a friend from the Friends panel.</div>'; return; }
  const d = fpData[id] || {}, f = fpFriend(id), ui = fpUiOf(id), name = fpName(id);
  // header: who, what they're doing, numbers
  let status = '';
  if (f && f.status === 'playing' && f.np) status = `<span class="soc-eq" aria-hidden="true"><i></i><i></i><i></i></span> Playing <b>${escapeHtml(f.np.t || f.np.album)}</b> · ${escapeHtml(f.np.artist)}`;
  else if (f && f.status === 'online') status = 'CRATE open';
  else if (f) status = f.seen ? 'Last seen ' + socAgo(f.seen) : 'Offline';
  else status = 'No longer a friend';
  const crate = d.crate || [], mine = fpMineMap();
  const both = crate.filter(x => mine.has(fpKey(x.artist, x.title))).length, rated = crate.filter(x => x.rating > 0);
  const yr = String(new Date().getFullYear()), diaryYear = (d.diary || []).filter(e => e.date.slice(0, 4) === yr).length;
  const avg = rated.length ? (rated.reduce((s, x) => s + x.rating, 0) / rated.length) : 0;
  const stat = (v, l) => `<div class="fp-stat"><b>${v}</b><span>${l}</span></div>`;
  const sh = d.share || (f && f.share) || {};
  const head = `<div class="fp-head">
      ${socAvatar(f || { id, name, status: 'offline' }, 'fp-av')}
      <div class="fp-who"><h2 class="fp-name">${escapeHtml(name)}</h2><span class="fp-status">${status}</span></div>
      ${f ? `<button type="button" class="chip-btn" data-fp="sees" aria-haspopup="true" title="Choose what ${escapeHtml(name)} can see of yours">What ${escapeHtml(name)} sees ▾</button>` : ''}
      <button type="button" class="chip-btn" data-fp="reload" title="Load ${escapeHtml(name)}'s crate and diary again"${d.loading ? ' disabled' : ''}>${d.loading ? 'Loading…' : '⟳ Refresh'}</button>
    </div>
    ${d.crate ? `<div class="fp-stats">${stat(crate.length.toLocaleString(), 'Releases')}${sh.ratings ? stat(rated.length.toLocaleString(), 'Rated') + stat(avg ? avg.toFixed(1) : '–', 'Avg rating') : ''}${sh.diary ? stat(diaryYear, 'Diary · ' + yr) : ''}${stat(both.toLocaleString(), 'In your crate too')}${stat(crate.length ? Math.round(both / crate.length * 100) + '%' : '–', 'Shared with you')}</div>` : ''}
    <div class="fp-views" role="tablist" aria-label="${escapeHtml(name)}'s page">
      <button type="button" role="tab" class="fp-view" data-fp="view" data-v="crate" aria-selected="${ui.view === 'crate'}">Crate${d.crate ? ` <span>${crate.length}</span>` : ''}</button>
      <button type="button" role="tab" class="fp-view" data-fp="view" data-v="diary" aria-selected="${ui.view === 'diary'}">Diary${d.diary ? ` <span>${d.diary.length}</span>` : ''}</button>
      <button type="button" role="tab" class="fp-view" data-fp="view" data-v="ratings" aria-selected="${ui.view === 'ratings'}">Ratings</button>
    </div>`;
  let body = '';
  if (d.err) body = `<div class="soc-empty"><b>Couldn't load ${escapeHtml(name)}'s page.</b><p>${escapeHtml(d.err)}</p><button type="button" class="chip-btn" data-fp="reload">Try again</button></div>`;
  else if (!d.at) body = '<div class="soc-empty">Loading…</div>';
  else if (ui.view === 'crate') body = sh.crate === false && !crate.length ? `<div class="soc-empty"><b>${escapeHtml(name)} doesn't share their crate.</b><p>They can switch on "My crate" under What friends can see in their Friends panel.</p></div>` : fpCrateHtml(id);
  else if (ui.view === 'ratings') body = fpRatingsHtml(id);
  else body = !d.diary ? `<div class="soc-empty"><b>${escapeHtml(name)} doesn't share their diary.</b><p>They can switch on "My diary" under What friends can see in their Friends panel.</p></div>` : fpDiaryHtml(id);
  const keep = wrap.dataset.fid === id + ':' + ui.view ? wrap.scrollTop : 0;          // (1.120.0) the page itself scrolls
  const focusQ = document.activeElement && document.activeElement.id === 'fpSearch';
  wrap.dataset.fid = id + ':' + ui.view;
  wrap.innerHTML = `<div class="fp-scroll">${head}<div class="fp-body">${body}</div></div>`;
  wrap.scrollTop = keep;
  if (focusQ) { const s = document.getElementById('fpSearch'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
}
function fpCrateHtml(id) {
  const ui = fpUiOf(id), list = fpFiltered(id), mine = fpMineMap(), sh = (fpData[id].share || {});
  const chip = (v, t) => `<button type="button" class="chip-btn fp-chip${ui.filter === v ? ' active' : ''}" data-fp="filter" data-v="${v}" aria-pressed="${ui.filter === v}">${t}</button>`;
  const tools = `<div class="fp-tools">${chip('all', 'All')}${chip('notMine', 'Not in my crate')}${chip('both', 'In both')}${sh.ratings ? chip('top', '4½★ and up') : ''}
      <input id="fpSearch" class="fp-search" type="search" placeholder="Search their crate" value="${escapeHtml(ui.q)}" aria-label="Search their crate" autocomplete="off">
      <select id="fpSort" class="fp-sort" aria-label="Sort">${[['rating', 'Their rating'], ['added', 'Recently added'], ['artist', 'Artist'], ['year', 'Year']].filter(o => o[0] !== 'rating' || sh.ratings).map(o => `<option value="${o[0]}"${ui.sort === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
  if (!list.length) return tools + '<div class="soc-empty">Nothing matches.</div>';
  const shown = list.slice(0, ui.shown);
  const tiles = shown.map((x, i) => {
    const have = mine.get(fpKey(x.artist, x.title));
    return `<button type="button" class="fp-tile" data-fp="tile" data-i="${i}" title="${escapeHtml(x.artist + ' — ' + x.title)}">
        <span class="fp-cv-wrap">${fpCover(x, 'fp-cv')}${x.rating ? `<span class="fp-rt">★${x.rating % 1 ? x.rating.toFixed(1) : x.rating}</span>` : ''}${have ? '<span class="fp-mine">IN MINE</span>' : ''}</span>
        <span class="fp-t">${escapeHtml(x.title)}</span><span class="fp-a">${escapeHtml(x.artist)}${x.year ? ' · ' + escapeHtml(x.year) : ''}</span></button>`;
  }).join('');
  fpCrateHtml.last = { id, list: shown };
  return tools + `<div class="fp-count">${list.length.toLocaleString()} release${list.length === 1 ? '' : 's'}</div><div class="fp-grid">${tiles}</div>`
    + (list.length > shown.length ? `<div class="fp-more"><button type="button" class="chip-btn" data-fp="more">Show more (${(list.length - shown.length).toLocaleString()} left)</button></div>` : '');
}
function fpDiaryHtml(id) {
  const d = fpData[id], ui = fpUiOf(id), list = d.diary.slice(0, ui.dshown);
  if (!list.length) return `<div class="soc-empty">${escapeHtml(fpName(id))} hasn't logged anything yet.</div>`;
  const byKey = new Map((d.crate || []).map(x => [fpKey(x.artist, x.title), x]));
  let month = '', out = '';
  list.forEach(e => {
    const dt = e.date ? new Date(e.date.length <= 10 ? e.date + 'T12:00:00' : e.date) : null, ok = dt && !isNaN(dt);
    const m = ok ? dt.toLocaleString(undefined, { month: 'long', year: 'numeric' }) : 'Undated';
    if (m !== month) { month = m; out += `<div class="fp-month">${escapeHtml(m)}</div>`; }
    const x = byKey.get(fpKey(e.artist, e.title)) || { artist: e.artist, title: e.title, cover: '' };
    const have = fpMineMap().get(fpKey(e.artist, e.title));
    out += `<div class="fp-entry">
        <div class="fp-day">${ok ? `<b>${dt.getDate()}</b>${escapeHtml(dt.toLocaleString(undefined, { weekday: 'short' }))}` : '–'}</div>
        ${fpCover(x, 'fp-dcv')}
        <div class="fp-etext"><div class="fp-etitle"><b>${escapeHtml(e.title)}</b> <span>${escapeHtml(e.artist)}</span>${e.full ? ' <span class="fp-tag">Full listen</span>' : ''}${have ? ` <button type="button" class="chip-btn fp-open-mine" data-fp="openmine" data-id="${escapeHtml(pbId(have))}">In your crate</button>` : ''}</div>
          ${e.rating ? `<div class="fp-erate">${starRatingHtml(e.rating)}</div>` : ''}
          ${e.entryTitle ? `<div class="fp-ehead">${escapeHtml(e.entryTitle)}</div>` : ''}
          ${e.text ? `<div class="fp-ebody">${escapeHtml(e.text).replace(/\n/g, '<br>')}</div>` : ''}</div></div>`;
  });
  return `<div class="fp-diary">${out}</div>` + (d.diary.length > list.length ? `<div class="fp-more"><button type="button" class="chip-btn" data-fp="dmore">Show more (${(d.diary.length - list.length).toLocaleString()} left)</button></div>` : '');
}

// ----- a release's menu -----
function fpMenuClose() { const m = document.getElementById('fpMenu'); if (m) m.remove(); document.removeEventListener('mousedown', fpMenuOutside, true); }
function fpMenuOutside(e) { if (!e.target.closest('#fpMenu')) fpMenuClose(); }
function fpMenuOpen(tile, x) {
  fpMenuClose();
  const have = fpMineMap().get(fpKey(x.artist, x.title)), r = tile.getBoundingClientRect();
  const m = document.createElement('div'); m.id = 'fpMenu'; m.className = 'fp-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="fp-menu-h"><b>${escapeHtml(x.title)}</b><span>${escapeHtml(x.artist)}${x.year ? ' · ' + escapeHtml(x.year) : ''}${x.genre ? ' · ' + escapeHtml(x.genre) : ''}</span></div>`
    + (have ? `<button type="button" role="menuitem" data-fpm="open">Open in my crate</button><button type="button" role="menuitem" data-fpm="fill" title="Copies what yours is missing (tracklist, song links, RYM rating, genres, links…). Never changes what you already have.">Fill in missing details from ${escapeHtml(fpName(state.activeFriendTab))}</button>` : `<button type="button" role="menuitem" data-fpm="add">Add to my crate</button>`)
    + (/^https:\/\/open\.spotify\.com\//.test(x.link) ? `<a role="menuitem" href="${escapeHtml(x.link)}" target="_blank" rel="noopener">Open in Spotify</a>` : '')
    + (/^https:\/\/(www\.)?rateyourmusic\.com\//.test(x.rymLink) ? `<a role="menuitem" href="${escapeHtml(x.rymLink)}" target="_blank" rel="noopener">Open on Rate Your Music</a>` : '');
  document.body.appendChild(m);
  const mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - mw - 8)) + 'px';
  m.style.top = (r.bottom + mh + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - mh - 4)) + 'px';
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fpm]'); if (!b) { if (e.target.closest('a')) fpMenuClose(); return; }
    if (b.dataset.fpm === 'open') { fpMenuClose(); openDeck(have); }
    else if (b.dataset.fpm === 'fill') {
      b.disabled = true; b.textContent = 'Filling in…';
      try { const n = await fpFillFrom(state.activeFriendTab, x, have); b.textContent = n ? `Filled in ${n} detail${n === 1 ? '' : 's'}` : 'Nothing was missing'; setTimeout(fpMenuClose, 1800); }
      catch (er) { b.disabled = false; b.textContent = er && er.message && !/fetch/i.test(er.message) ? er.message : 'Couldn\u2019t fill it in: try again'; }
    }
    else if (b.dataset.fpm === 'add') {
      b.disabled = true; b.textContent = 'Adding…';
      try {
        // (1.119.0) everything worth copying, from the backend: the tracklist, the song links, the RYM figures and the rest (never their
        // rating, review or song notes). A backend from before 1.119.0 can't: then the details shown on their page, as before.
        let cols = null, partial = false;
        try { const r = await socCall('socialRelease', { id: state.activeFriendTab, albumId: x.albumId, artist: x.artist, title: x.title }); cols = r.release || null; }
        catch (er) { if (/no longer in their crate|don.t share/i.test(er.message || '')) throw er; partial = true; }
        if (!cols) cols = { Artist: x.artist, Title: x.title, Type: x.type || 'Album', ReleaseDate: x.releaseDate, Genre: x.genre, SecondaryGenre: x.genre2, Label: x.label, Region: x.region, Cover: x.cover, Link: x.link, RymLink: x.rymLink, RymRating: x.rymRating || '' };
        if (!cols.Type) cols.Type = 'Album';
        await postUpdate(Object.assign({}, cols, { action: 'addAlbum' }));
        b.textContent = partial ? 'Added (basic details only: update the backend for tracklists and links)' : 'Added to your crate'; if (typeof scheduleCatalogSync === 'function') scheduleCatalogSync(300);
        setTimeout(fpMenuClose, 1200);
      } catch (er) { b.disabled = false; b.textContent = 'Couldn’t add it: try again'; }
    }
  });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fpMenuClose(); tile.focus(); } });
  setTimeout(() => document.addEventListener('mousedown', fpMenuOutside, true), 0);
  const first = m.querySelector('button, a'); if (first) first.focus();
}

// ----- (1.122.0) RATINGS: how your taste and theirs compare -----
// Taste match comes from the releases you've both rated: 100% when every rating is the same, 50% when they're a star apart on average,
// 0% at two stars or more. The chart shows how each of you spreads your ratings (as a share of everything each has rated, so a big
// crate and a small one compare fairly). Then where you disagree most, what you both love, and their favourites you don't have yet.
function fpRatingsData(id) {
  const d = fpData[id], mine = fpMineMap(), crate = d.crate || [];
  const theirs = crate.filter(x => x.rating > 0), myRated = (state.raw || []).filter(x => x.rating > 0);
  const both = [];
  theirs.forEach(x => { const m = mine.get(fpKey(x.artist, x.title)); if (m && m.rating > 0) both.push({ x, m, them: x.rating, me: m.rating, diff: x.rating - m.rating }); });
  const mad = both.length ? both.reduce((a, p) => a + Math.abs(p.diff), 0) / both.length : 0;
  const near = both.length ? both.filter(p => Math.abs(p.diff) <= 0.5).length / both.length : 0;
  const buckets = []; for (let v = 0.5; v <= 5.001; v += 0.5) buckets.push(Math.round(v * 2) / 2);
  const share = (list) => { const n = list.length || 1, c = {}; list.forEach(x => { const b = Math.min(5, Math.max(0.5, Math.round(x.rating * 2) / 2)); c[b] = (c[b] || 0) + 1; }); return buckets.map(b => ({ b, n: c[b] || 0, pct: (c[b] || 0) / n * 100 })); };
  const avg = (list) => list.length ? list.reduce((a, x) => a + x.rating, 0) / list.length : 0;
  return {
    theirs, myRated, both, mad, near, match: both.length ? Math.max(0, Math.min(100, Math.round(100 * (1 - mad / 2)))) : null,
    histThem: share(theirs), histMe: share(myRated), avgThem: avg(theirs), avgMe: avg(myRated),
    apart: both.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || (b.them + b.me) - (a.them + a.me)).filter(p => Math.abs(p.diff) >= 1).slice(0, 8),
    loved: both.filter(p => p.them >= 4.5 && p.me >= 4.5).sort((a, b) => (b.them + b.me) - (a.them + a.me)).slice(0, 8),
    recs: theirs.filter(x => x.rating >= 4.5 && !mine.has(fpKey(x.artist, x.title))).sort((a, b) => b.rating - a.rating || b.rymRating - a.rymRating).slice(0, 12)
  };
}
const fpStar = (v) => '★' + (v % 1 ? v.toFixed(1) : v);
function fpRatingsHtml(id) {
  const d = fpData[id], name = escapeHtml(fpName(id)), sh = d.share || {};
  if (!sh.ratings) return `<div class="soc-empty"><b>${name} doesn't share their ratings with you.</b><p>They can switch on "My ratings" in their Friends panel.</p></div>`;
  const r = fpRatingsData(id);
  if (!r.theirs.length) return `<div class="soc-empty">${name} hasn't rated anything yet.</div>`;
  const tile = (v, l, sub) => `<div class="fp-stat"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const tiles = `<div class="fp-rstats">${r.both.length >= 5 ? tile(r.match + '%', 'Taste match', `${r.mad.toFixed(1)} stars apart on average`) : tile('–', 'Taste match', `rate ${5 - r.both.length} more in common to see it`)}${tile(r.both.length.toLocaleString(), 'Rated by both')}${r.both.length ? tile(Math.round(r.near * 100) + '%', 'Within half a star') : ''}${tile(r.avgThem ? r.avgThem.toFixed(2) : '–', name + "'s average")}${tile(r.avgMe ? r.avgMe.toFixed(2) : '–', 'Your average')}</div>`;
  // the chart: share of each person's ratings at each step, side by side
  const max = Math.max(1, ...r.histThem.map(h => h.pct), ...r.histMe.map(h => h.pct));
  const cols = r.histThem.map((h, i) => { const m = r.histMe[i];
    return `<div class="fp-hcol" data-tip="${escapeHtml(`${fpStar(h.b)} · ${fpName(id)} ${Math.round(h.pct)}% (${h.n}) · You ${Math.round(m.pct)}% (${m.n})`)}" tabindex="0" aria-label="${escapeHtml(`${fpStar(h.b)}: ${fpName(id)} ${Math.round(h.pct)} percent, you ${Math.round(m.pct)} percent`)}">
      <div class="fp-hbars"><i class="fp-hb fp-hb-them" style="height:${h.pct / max * 100}%"></i><i class="fp-hb fp-hb-me" style="height:${m.pct / max * 100}%"></i></div>
      <span class="fp-hx">${h.b % 1 ? '' : fpStar(h.b)}</span></div>`; }).join('');
  const chart = `<div class="fp-chart"><div class="fp-chart-h"><h3>How you each rate</h3><span class="fp-legend"><i class="fp-hb-them"></i>${name}</span><span class="fp-legend"><i class="fp-hb-me"></i>You</span></div>
    <div class="fp-hist" role="img" aria-label="Share of each person's ratings at each step, from half a star to five">${cols}</div><div class="fp-tip" hidden></div>
    <p class="fp-note">Each bar is the share of everything that person has rated (${name}: ${r.theirs.length.toLocaleString()}, you: ${r.myRated.length.toLocaleString()}).</p></div>`;
  const row = (p) => `<button type="button" class="fp-rrow" data-fp="openmine" data-id="${escapeHtml(pbId(p.m))}" title="Open it in your crate">${fpCover(p.x, 'fp-rcv')}<span class="fp-rt-t"><b>${escapeHtml(p.x.title)}</b><span>${escapeHtml(p.x.artist)}</span></span>
      <span class="fp-rvs"><span>${name} <b>${fpStar(p.them)}</b></span><span>You <b>${fpStar(p.me)}</b></span>${p.diff ? `<em class="${p.diff > 0 ? 'fp-up' : 'fp-dn'}">${p.diff > 0 ? '+' : '−'}${Math.abs(p.diff) % 1 ? Math.abs(p.diff).toFixed(1) : Math.abs(p.diff)}</em>` : ''}</span></button>`;
  const lists = `<div class="fp-rlists">
      <section><h3>Where you disagree most</h3>${r.apart.length ? r.apart.map(row).join('') : '<p class="fp-note">No release you both rated is a star or more apart.</p>'}</section>
      <section><h3>You both love</h3>${r.loved.length ? r.loved.map(row).join('') : '<p class="fp-note">Nothing you\u2019ve both given 4½ stars or more yet.</p>'}</section></div>`;
  fpRatingsHtml.recs = r.recs;
  const recs = `<section class="fp-recs"><h3>${name}'s favourites you don't have</h3>${r.recs.length ? `<div class="fp-grid">${r.recs.map((x, i) => `<button type="button" class="fp-tile" data-fp="rtile" data-i="${i}" title="${escapeHtml(x.artist + ' — ' + x.title)}"><span class="fp-cv-wrap">${fpCover(x, 'fp-cv')}<span class="fp-rt">${fpStar(x.rating)}</span></span><span class="fp-t">${escapeHtml(x.title)}</span><span class="fp-a">${escapeHtml(x.artist)}${x.year ? ' · ' + escapeHtml(x.year) : ''}</span></button>`).join('')}</div>` : `<p class="fp-note">You have every release ${name} rates 4½ stars or more.</p>`}</section>`;
  return tiles + chart + lists + recs;
}

// ----- (1.122.0) WHAT THIS FRIEND SEES: your switches for everyone, narrowed for this friend alone -----
function fpSeesOpen(btn, id) {
  fpMenuClose();
  const me = soc.me || {}, base = me.share || {}, off = (me.perFriend || {})[id] || {}, name = escapeHtml(fpName(id));
  const row = (k, label) => { const all = !!base[k], on = all && off[k] !== false;
    return `<label class="fp-sees-row${all ? '' : ' fp-sees-off'}"><input type="checkbox" data-fps="${k}" ${on ? 'checked' : ''} ${all ? '' : 'disabled'}><span>${label}${all ? '' : '<small>Off for everyone (Friends panel settings)</small>'}</span></label>`; };
  const m = document.createElement('div'); m.id = 'fpMenu'; m.className = 'fp-menu fp-sees'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', `What ${fpName(id)} sees`);
  m.innerHTML = `<div class="fp-menu-h"><b>What ${name} sees</b><span>Applies to ${name} only. Your switches for everyone are in the Friends panel.</span></div>${row('playing', 'What I’m playing')}${row('crate', 'My crate')}${row('ratings', 'My ratings')}${row('diary', 'My diary')}`;
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px'; m.style.top = (r.bottom + 4) + 'px';
  m.addEventListener('change', async (e) => { const k = e.target.dataset.fps; if (!k) return; e.target.disabled = true; await socDo('socialSettings', { forFriend: { id, share: { [k]: e.target.checked } } }); e.target.disabled = false; });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fpMenuClose(); btn.focus(); } });
  setTimeout(() => document.addEventListener('mousedown', fpMenuOutside, true), 0);
  const first = m.querySelector('input:not([disabled])'); if (first) first.focus();
}

// (1.119.0) "Fill in missing details\": a release you both have gets from the friend's copy only what yours lacks. Release fields that are
// empty on yours; their tracklist if you never set one; their RYM figures if yours has none; and, song by song, links, other titles,
// lengths, credits, genres and RYM figures yours doesn't have. Nothing you already have is changed, and nothing of theirs alone comes.
const FP_FILL_COLS = [['Type', 'type'], ['ReleaseDate', 'releaseDate'], ['Recorded', 'recordedDate'], ['Genre', 'genre'], ['SecondaryGenre', 'genre2'], ['Label', 'label'], ['Region', 'region'], ['Location', 'location'], ['Descriptor', 'descriptor'], ['RymDescriptors', 'rymDescriptors'], ['Scene', 'scene'], ['Movement', 'movement'], ['Link', 'link'], ['RymLink', 'rymLink'], ['Cover', 'cover']];
async function fpFillFrom(fid, x, mine) {
  const r = await socCall('socialRelease', { id: fid, albumId: x.albumId, artist: x.artist, title: x.title }), c = r.release || {};
  const patch = {}; let n = 0;
  FP_FILL_COLS.forEach(([col, f]) => { const v = c[col]; if (v !== undefined && v !== '' && v !== null && !(mine[f] && String(mine[f]).trim() && !(f === 'type' && mine[f] === 'Unknown'))) { patch[col] = v; n++; } });
  if (c.RymRating && !mine.rymRating) { patch.RymRating = c.RymRating; if (c.RymVotes) patch.RymVotes = c.RymVotes; patch.RymSrc = c.RymSrc === 'a' ? 'a' : 'm'; n++; }
  if (c.ManualTracks && !mine.hasManualTracklist) { patch.ManualTracks = c.ManualTracks; n++; }
  if (Object.keys(patch).length) await postUpdate(Object.assign({ action: 'editAlbum', row: mine.row }, patch));
  if (c.TrackData) {
    let theirs = {}; try { theirs = JSON.parse(String(c.TrackData)) || {}; } catch (e) { theirs = {}; }
    const merged = JSON.parse(JSON.stringify(mine.trackData || {})); let added = 0;
    Object.keys(theirs).forEach(num => { const t = theirs[num] || {}; Object.keys(t).forEach(k => { if (['rating', 'note', 'listened'].includes(k)) return; if (!merged[num]) merged[num] = {}; if (merged[num][k] === undefined || merged[num][k] === '' || merged[num][k] === null) { merged[num][k] = t[k]; added++; } }); });
    if (added) { await postUpdate({ row: mine.row, trackData: JSON.stringify(merged) }); mine.trackData = merged; n += added; }
  }
  if (n && typeof scheduleCatalogSync === 'function') scheduleCatalogSync(300);
  return n;
}

function initFriendPage() {
  const box = document.getElementById('friendTabsContainer'), wrap = document.getElementById('friendInfoWrap'); if (!box || !wrap) return;
  box.addEventListener('click', (e) => {
    const close = e.target.closest('.friend-tab-close');
    if (close) { e.stopPropagation(); closeFriendTab(close.dataset.friend); return; }
    const tab = e.target.closest('.friend-tab-btn'); if (tab) openFriendTab(tab.dataset.friend);
  });
  box.addEventListener('auxclick', (e) => { const tab = e.target.closest('.friend-tab-btn'); if (tab && e.button === 1) { e.preventDefault(); closeFriendTab(tab.dataset.friend); } });
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fp]'); if (!b) return;
    const id = state.activeFriendTab, ui = fpUiOf(id), k = b.dataset.fp;
    if (k === 'reload') fpLoad(id);
    else if (k === 'view') { ui.view = b.dataset.v; renderFriendPage(); }
    else if (k === 'filter') { ui.filter = b.dataset.v; ui.shown = FP_PAGE; renderFriendPage(); }
    else if (k === 'more') { ui.shown += FP_PAGE * 2; renderFriendPage(); }
    else if (k === 'dmore') { ui.dshown += FP_DPAGE * 2; renderFriendPage(); }
    else if (k === 'openmine') { const it = pbItemOf(b.dataset.id); if (it) openDeck(it); }
    else if (k === 'sees') fpSeesOpen(b, id);
    else if (k === 'rtile') { const x = (fpRatingsHtml.recs || [])[+b.dataset.i]; if (x) fpMenuOpen(b, x); }
    else if (k === 'tile') { const L = fpCrateHtml.last; const x = L && L.id === id && L.list[+b.dataset.i]; if (x) fpMenuOpen(b, x); }
  });
  const tipAt = (col) => { const tip = wrap.querySelector('.fp-tip'); if (!tip) return; if (!col) { tip.hidden = true; return; } tip.textContent = col.dataset.tip; tip.hidden = false; const cr = col.getBoundingClientRect(), pr = tip.parentElement.getBoundingClientRect(); tip.style.left = Math.max(0, Math.min(cr.left - pr.left + cr.width / 2 - tip.offsetWidth / 2, pr.width - tip.offsetWidth)) + 'px'; tip.style.top = (cr.top - pr.top - tip.offsetHeight - 6) + 'px'; };
  wrap.addEventListener('mouseover', (e) => tipAt(e.target.closest('.fp-hcol')));
  wrap.addEventListener('mouseleave', () => tipAt(null));
  wrap.addEventListener('focusin', (e) => tipAt(e.target.closest('.fp-hcol')));
  wrap.addEventListener('focusout', () => tipAt(null));
  let qT = 0;
  wrap.addEventListener('input', (e) => { if (e.target.id !== 'fpSearch') return; const ui = fpUiOf(state.activeFriendTab); clearTimeout(qT); qT = setTimeout(() => { ui.q = e.target.value; ui.shown = FP_PAGE; renderFriendPage(); }, 200); });
  wrap.addEventListener('change', (e) => { if (e.target.id !== 'fpSort') return; const ui = fpUiOf(state.activeFriendTab); ui.sort = e.target.value; ui.shown = FP_PAGE; renderFriendPage(); });
}
initFriendPage();
