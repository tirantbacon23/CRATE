// CRATE — Artist tab, playlists and their queue, track grid.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Artist tab: browse an artist's other albums/works ---------- */
// Left side lists the artists already in your crate; picking one fetches
// their full MusicBrainz discography (Albums + EPs) and marks which
// releases you already have logged, so you can spot what's missing.

function renderArtistTab() {
  renderArtistList();
  renderArtistDetail();
}

function renderArtistList() {
  const q = (el.artistSearchInput.value || '').trim().toLowerCase();
  const artists = groupCount(state.raw, r => r.artist).filter(a => !q || a.label.toLowerCase().includes(q));

  if (!artists.length) {
    el.artistList.innerHTML = '<p class="diary-empty" style="padding: 0 14px;">No artists match.</p>';
    return;
  }

  el.artistList.innerHTML = artists.map(a => `
    <div class="artist-list-row${state.artistSelectedName === a.label ? ' active' : ''}" data-artist="${escapeHtml(a.label)}">
      <span class="artist-list-name">${escapeHtml(a.label)}</span>
      <span class="artist-list-count">${a.count}</span>
    </div>
  `).join('');

  [...el.artistList.children].forEach(rowEl => {
    rowEl.addEventListener('click', () => {
      state.artistSelectedName = rowEl.dataset.artist;
      renderArtistList();
      renderArtistDetail();
    });
  });
}

async function renderArtistDetail() {
  const name = state.artistSelectedName;
  if (!name) {
    el.artistDetail.innerHTML = '<p class="artist-placeholder">Pick an artist on the left to see their full discography.</p>';
    return;
  }

  const owned = state.raw.filter(r => r.artist === name);
  const ownedKeys = new Set(owned.map(r => lastfmNormKey(name, r.title)));

  el.artistDetail.innerHTML = `
    <div class="artist-detail-header">
      <h2>${escapeHtml(name)}</h2>
      <p class="artist-detail-sub">${owned.length} album${owned.length === 1 ? '' : 's'} in your crate</p>
      <button type="button" id="artistShowAllToggle" class="config-btn artist-show-all-toggle">${state.artistShowAllTypes ? 'Show Albums & EPs only' : 'Show everything (singles, comps…)'}</button>
    </div>
    <div id="artistWorksList" class="artist-works-list"><p class="tracklist-status">Looking up ${escapeHtml(name)}'s discography on MusicBrainz…</p></div>
  `;
  document.getElementById('artistShowAllToggle')?.addEventListener('click', () => {
    state.artistShowAllTypes = !state.artistShowAllTypes;
    renderArtistDetail();
  });

  const result = await fetchArtistDiscography(name, ownedKeys, state.artistShowAllTypes);
  if (state.artistSelectedName !== name) return; // switched artists while this was in flight

  const list = document.getElementById('artistWorksList');
  if (!list) return;

  // An ambiguous match (several MusicBrainz artists with this exact name) carries no `items` at
  // all, so a bare `items == null` test also matched it and showed "couldn't reach MusicBrainz"
  // with a Retry button — the "which one is this?" picker below it could never appear.
  if (result.items == null && !result.ambiguous) {
    list.innerHTML = '<p class="tracklist-status">Couldn\u2019t reach MusicBrainz right now — try again in a moment.</p><button type="button" id="artistWorksRetryBtn" class="config-btn">Retry</button>';
    document.getElementById('artistWorksRetryBtn')?.addEventListener('click', () => renderArtistDetail());
    return;
  }

  // Multiple different real artists share this exact name and we couldn't
  // tell them apart automatically (e.g. jazz Steve Lacy vs. the singer) —
  // ask once, then remember the answer for next time.
  if (result.ambiguous) {
    list.innerHTML = `<p class="tracklist-status">More than one artist named "${escapeHtml(name)}" has releases on MusicBrainz — which one is this?</p>` +
      result.options.map(opt => {
        const sample = opt.items.slice(0, 3).map(it => it.title).join(', ');
        return `
          <div class="artist-disambig-option">
            <div class="artist-disambig-desc">${escapeHtml(opt.disambiguation || 'No description on MusicBrainz')}</div>
            <div class="artist-disambig-sample">${opt.items.length} release${opt.items.length === 1 ? '' : 's'} — e.g. ${escapeHtml(sample)}${opt.items.length > 3 ? ', …' : ''}</div>
            <button type="button" class="config-btn artist-disambig-pick" data-mbid="${opt.mbid}">Use this one</button>
          </div>`;
      }).join('');
    list.querySelectorAll('.artist-disambig-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = result.options.find(o => o.mbid === btn.dataset.mbid);
        if (!chosen) return;
        saveArtistMbidChoice(name, chosen.mbid);
        const cacheKey = `${name.toLowerCase()}::${state.artistShowAllTypes ? 'all' : 'main'}`;
        state.artistWorksCache[cacheKey] = { items: chosen.items, mbid: chosen.mbid, fetchedAt: Date.now() };
        renderArtistDetail();
      });
    });
    return;
  }

  if (!result.items.length) {
    list.innerHTML = `<p class="tracklist-status">No albums or EPs found on MusicBrainz for this artist.</p><button type="button" id="artistWorksManualAddBtn" class="config-btn">+ Add a release manually</button>`;
    document.getElementById('artistWorksManualAddBtn')?.addEventListener('click', () => {
      openAddModal();
      showAddForm({ artist: name });
    });
    return;
  }

  // If we're only showing this discography because the user (or the
  // owned-title auto-match) picked one of several same-named artists
  // earlier, offer a way to undo that in case it picked wrong.
  const resetLinkHtml = loadArtistMbidChoice(name)
    ? `<button type="button" id="artistResetMatchBtn" class="config-btn artist-reset-match">Not the right ${escapeHtml(name)}? Reset match</button>`
    : '';

  list.innerHTML = resetLinkHtml + result.items.map(w => {
    const isOwned = ownedKeys.has(lastfmNormKey(name, w.title));
    const workItem = { artist: name, title: w.title };
    return `
      <div class="artist-work-row${isOwned ? ' owned' : ''}" data-owned="${isOwned}" data-title="${escapeHtml(w.title)}" title="${isOwned ? 'Already in your crate — click to open' : 'Not logged yet — click to search Spotify'}">
        <span class="artist-work-status">${isOwned ? '●' : '○'}</span>
        <span class="artist-work-title">${escapeHtml(w.title)}</span>
        <span class="artist-work-type">${escapeHtml(w.type)}</span>
        <span class="artist-work-year">${w.year || '—'}</span>
        <span class="artist-work-links">
          <a class="artist-work-link" href="${spotifySearchUrl(workItem)}" target="_blank" rel="noopener" title="Search on Spotify">▶ Spotify</a>
          <a class="artist-work-link" href="${youtubeSearchUrl(workItem)}" target="_blank" rel="noopener" title="Search on YouTube">▶ YouTube</a>
          <a class="artist-work-link" href="https://musicbrainz.org/release-group/${w.id}" target="_blank" rel="noopener" title="View on MusicBrainz">MB ↗</a>
          ${isOwned ? '' : `<button type="button" class="artist-work-link artist-work-add-btn" data-title="${escapeHtml(w.title)}" data-type="${escapeHtml(w.type)}" data-year="${escapeHtml(w.year || '')}" data-rgid="${escapeHtml(w.id || '')}" title="Add to your crate">+ Add</button>`}
        </span>
      </div>`;
  }).join('');

  // Clicking anywhere on a row (but not one of its own action icons/buttons,
  // which handle their own click) opens the best available "page" for that
  // album: the deck if it's already in your crate, otherwise a Spotify
  // search in a new tab.
  list.querySelectorAll('.artist-work-row').forEach(rowEl => {
    rowEl.addEventListener('click', (e) => {
      if (e.target.closest('.artist-work-links')) return; // let that action handle its own click
      const title = rowEl.dataset.title;
      if (rowEl.dataset.owned === 'true') {
        const match = state.raw.find(r => r.artist === name && r.title === title);
        if (match) { switchTab('albums'); openDeck(match); return; }
      }
      window.open(spotifySearchUrl({ artist: name, title }), '_blank', 'noopener,noreferrer');
    });
  });

  // "+ Add" opens the same Add-to-crate modal used elsewhere, but first shows
  // which specific releases (pressings/labels/catalog numbers) MusicBrainz has
  // under this release-group, since a single album can have several — a vinyl
  // on one label, a CD reissue on another, a regional pressing, etc. Picking
  // one prefills the form with that release's label/catalog/region; if none
  // are found (or the lookup fails) it falls back to the basic info already
  // known from the discography row.
  list.querySelectorAll('.artist-work-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openAddModalForReleaseGroup({
        artist: name,
        title: btn.dataset.title,
        type: btn.dataset.type,
        releaseDate: btn.dataset.year || '',
        rgId: btn.dataset.rgid || ''
      });
    });
  });

  document.getElementById('artistResetMatchBtn')?.addEventListener('click', () => {
    clearArtistMbidChoice(name);
    delete state.artistWorksCache[`${name.toLowerCase()}::main`];
    delete state.artistWorksCache[`${name.toLowerCase()}::all`];
    renderArtistDetail();
  });
}

// Same-named artists ("Steve Lacy" the jazz guitarist vs. "Steve Lacy" the
// singer) are common enough on MusicBrainz that picking the first one with
// any releases isn't safe. Once the user (or the owned-title auto-match
// below) resolves one, remember it here so it's not asked again.
const ARTIST_MBID_CHOICES_KEY = 'crate_artist_mbid_choices_v1';
function loadArtistMbidChoice(artistName) {
  try { return (JSON.parse(localStorage.getItem(ARTIST_MBID_CHOICES_KEY) || '{}'))[artistName.toLowerCase()] || null; }
  catch (e) { return null; }
}
function saveArtistMbidChoice(artistName, mbid) {
  try {
    const map = JSON.parse(localStorage.getItem(ARTIST_MBID_CHOICES_KEY) || '{}');
    map[artistName.toLowerCase()] = mbid;
    localStorage.setItem(ARTIST_MBID_CHOICES_KEY, JSON.stringify(map));
  } catch (e) { /* ignore */ }
}
function clearArtistMbidChoice(artistName) {
  try {
    const map = JSON.parse(localStorage.getItem(ARTIST_MBID_CHOICES_KEY) || '{}');
    delete map[artistName.toLowerCase()];
    localStorage.setItem(ARTIST_MBID_CHOICES_KEY, JSON.stringify(map));
  } catch (e) { /* ignore */ }
}

// Fetches one MusicBrainz artist's Album/EP release-groups (title, type,
// first-release year). Returns null on a failed request (vs. [] for a
// real "this artist has nothing"), so callers can tell the two apart.
async function fetchReleaseGroupsForMbid(mbid, headers, includeAll = false) {
  const rgRes = await mbFetch(`https://musicbrainz.org/ws/2/release-group?artist=${mbid}&limit=100&fmt=json`, { headers });
  if (!rgRes.ok) return null;
  const rgData = await rgRes.json();
  return (rgData['release-groups'] || [])
    .filter(rg => {
      const primary = rg['primary-type'];
      const secondary = rg['secondary-types'] || [];
      if (!includeAll) return (primary === 'Album' || primary === 'EP') && secondary.length === 0;
      // "Show everything" mode: also pull in Singles and Compilations
      // (still skipping Broadcasts and anything with no primary type at all).
      if (!primary || primary === 'Broadcast') return false;
      return primary === 'Album' || primary === 'EP' || primary === 'Single' || secondary.includes('Compilation');
    })
    .map(rg => ({
      id: rg.id,
      title: rg.title,
      type: (rg['secondary-types'] || []).includes('Compilation') ? 'Compilation' : rg['primary-type'],
      year: rg['first-release-date'] ? rg['first-release-date'].slice(0, 4) : null
    }));
}

// Fetches an artist's full Album/EP discography from MusicBrainz, for the
// Artist tab. Separate from fetchArtistDiscogCount above (which only needs
// a studio-album *count* for the left-panel badge) — this needs the actual
// title list so it can be cross-checked against your crate title-by-title.
//
// `ownedKeys` (normalized artist+title keys already in the crate for this
// artist name) is used to auto-resolve same-named-artist ambiguity: if
// only one of several candidates has a release matching something you've
// actually logged, that's almost certainly the right one.
async function fetchArtistDiscography(artistName, ownedKeys, includeAll = false) {
  const cacheKey = `${artistName.toLowerCase()}::${includeAll ? 'all' : 'main'}`;
  if (state.artistWorksCache[cacheKey]) return state.artistWorksCache[cacheKey];

  const headers = { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' };
  let result = { items: null, mbid: null };
  const forcedMbid = loadArtistMbidChoice(artistName);

  try {
    if (forcedMbid) {
      const items = await fetchReleaseGroupsForMbid(forcedMbid, headers, includeAll);
      result = items == null ? { items: null } : { items, mbid: forcedMbid };
    } else {
      const searchRes = await mbFetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${artistName}"`)}&fmt=json&limit=8`, { headers });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const allHits = searchData.artists || [];
        const exact = allHits.filter(a => a.name.toLowerCase() === artistName.toLowerCase());
        const candidates = (exact.length ? exact : allHits.slice(0, 1)).slice(0, 5);

        // Fetch every candidate's discography (not just stop at the first
        // non-empty one) so genuinely ambiguous same-named artists can be
        // told apart, rather than silently defaulting to whichever ranks
        // first in MusicBrainz's search order.
        const withItems = [];
        let failedLookups = 0;
        for (let i = 0; i < candidates.length; i++) {
          const items = await fetchReleaseGroupsForMbid(candidates[i].id, headers, includeAll);
          if (items == null) failedLookups++;   // null = the request itself failed (see fetchReleaseGroupsForMbid), unlike [] = a real "no releases"
          if (items && items.length > 0) {
            withItems.push({ mbid: candidates[i].id, disambiguation: candidates[i].disambiguation || '', items });
          }
        }

        if (withItems.length === 0) {
          // Three different situations used to collapse into two answers:
          //  - MusicBrainz answered and has NO artist by this name -> a real, cacheable "not found"
          //    (items: [] with no mbid). It used to come back as items: null, which every caller
          //    shows as "Couldn't reach MusicBrainz — retry", wrong for any artist that simply isn't
          //    on MusicBrainz (common in a personal crate) and it kept retrying them.
          //  - Every release lookup FAILED -> unreachable (items: null, so it is not cached and a
          //    retry really retries). It used to fall into the next case, i.e. a network blip was
          //    reported as "this artist has no releases" AND cached that way for the session.
          //  - Some answered with an empty list -> a genuine empty discography.
          if (!candidates.length) result = { items: [], mbid: null };
          else if (failedLookups === candidates.length) result = { items: null };
          else result = { items: [], mbid: candidates[0].id };
        } else if (withItems.length === 1) {
          result = { items: withItems[0].items, mbid: withItems[0].mbid };
        } else {
          const ownedMatches = withItems.filter(c => c.items.some(it => ownedKeys.has(lastfmNormKey(artistName, it.title))));
          if (ownedMatches.length === 1) {
            result = { items: ownedMatches[0].items, mbid: ownedMatches[0].mbid };
          } else {
            result = { ambiguous: true, options: withItems };
          }
        }
      }
    }
  } catch (e) { /* leave result as { items: null } — UI shows a retry message */ }

  if (result.items) result.items.sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999'));

  // Only cache real outcomes (a match, an ambiguous set, or a confirmed
  // "nothing found"). A failed request (items === null — network hiccup,
  // MusicBrainz rate limit, etc.) is transient, so don't lock the artist
  // into a permanent error state for the rest of the session — let a
  // retry actually retry.
  if (result.items !== null || result.ambiguous) {
    state.artistWorksCache[cacheKey] = { ...result, fetchedAt: Date.now() };
    return state.artistWorksCache[cacheKey];
  }
  return { ...result, fetchedAt: Date.now() };
}

/* ---------- Playlists (sidebar section + main panel) ---------- */
// Playlists live inside the Albums tab, in their own persistent section of
// the left panel (below the Albums/Artists/Genres list, see
// #playlistSidebarList / renderPlaylistSidebar()) — not a Category toggle,
// so it stays visible no matter which of Albums/Artists/Genres is active.
// Picking one sets state.activePlaylistId, and renderGrid() renders its
// ordered items into the main panel instead of the normal album grid — see
// renderPlaylistMainPanel(). Synced via the Playlists/PlaylistItems sheets
// on the backend (see apps-script-backend.gs). Each item is either a whole
// album (type: 'album', identified by its crate `row`) or a single track
// off one (type: 'track', same `row` plus trackNum/trackName) — see
// state.playlists, built in fetchCatalog().

let playlistModalMode = 'create'; // 'create' | 'rename'
let playlistModalEditingId = null;
let pendingPlaylistAddItems = null; // items to add once a brand-new playlist is created from the "+ New playlist…" flow
let playlistDeleteConfirmTimeout = null;
let folderModalMode = 'create'; // 'create' | 'rename'
let folderModalEditingId = null;
let playlistSidebarDragId = null; // playlist id currently being dragged in the Explorer tree

// Resolves a playlist item back to its live crate album — preferring the
// stable albumId (see apps-script-backend.gs's AlbumId column) when the
// item has one, since that's immune to the actual root cause below. Falls
// back to the legacy row-based lookup for any item saved before that
// backend change. String() on both sides of the row fallback is
// deliberate, not decoration — see loadTracksForPlaylistGroups just below
// and the TrackName note further up: PlaylistItems' Row column can
// round-trip from the sheet as either a real number or a numeric string
// depending on how it was written, while state.raw's own row (r._row) is
// whatever fetchCatalog set it to. A bare === between the two silently
// failed (or — worse, on a crate with recycled/duplicate row numbers —
// silently matched the WRONG album) whenever the two sides didn't happen
// to already be the same type. That type-coercion fix closed HALF of what
// caused a playlist to intermittently show one album's tracklist next to a
// different album's title/artist; the other half — two DIFFERENT albums
// genuinely sharing the same row number after enough sheet edits — can't
// be fixed by coercion at all, since there's nothing wrong to coerce; the
// row lookup is just inherently ambiguous. albumId is the actual fix for
// that half. Every other row-comparison in this file doing this same
// lookup (loadTracksForPlaylistGroups, removeAlbumFromActivePlaylist,
// activePlaylistItemIdsForTracks, the mini player's data-row lookups,
// etc.) still only has the row-based fallback — albumId doesn't help them
// unless/until they're updated to check it too.
function playlistAlbumFor(playlistItem) {
  if (playlistItem.albumId) {
    const byId = state.raw.find(r => r.albumId && r.albumId === playlistItem.albumId);
    if (byId) return byId;
    // Has an albumId but nothing in the crate matches it — the album was
    // genuinely deleted, not a lookup failure. Don't fall through to the
    // row-based guess below; row 12560's original type-coercion fix
    // treated "no album" and "wrong album" as the same failure, but they
    // aren't — falling back here would risk resurrecting the exact
    // wrong-album bug this field exists to prevent.
    return null;
  }
  return state.raw.find(r => String(r.row) === String(playlistItem.row)) || null;
}
function playlistItemArtUrl(album) {
  if (!album) return placeholderArt({ artist: '', title: '' });
  return album.cover || state.artCache[artKey(album)]?.art || placeholderArt(album);
}

// Picks a playlist (from the sidebar) and shows it in the main panel.
// Playlists live alongside the Albums/Artists/Genres browser rather than
// replacing it — state.leftMode / state.navFilter are untouched, so
// whatever category was showing is still there when you leave the playlist.
function openPlaylist(id) {
  if (state.activePlaylistId !== id) state.navFilter = null;          // a different playlist starts with nothing picked on the left
  state.activePlaylistId = id;
  setLeftNavView('playlists'); // opening a playlist always swaps the browser column to the playlist list
  updateMainLabel();
  renderGrid();
}

// Leaves playlist view without touching navFilter/leftMode/leftNavView —
// used when the person switches back into the regular Albums/Artists/
// Genres list while a playlist happened to be open.
function exitPlaylistView() {
  if (!state.activePlaylistId) return;
  state.activePlaylistId = null;
  renderPlaylistSidebar();
}

// Swaps the thumbnail-browser column (#leftPanel) between the Albums/
// Artists/Genres browser (#musicBrowserView) and the flat playlist list
// (#playlistsBrowserView), per the Music/Playlists buttons in the far-left
// #leftNavPanel rail. Switching to "Music" also exits playlist view
// (closing whatever playlist was open), same as clicking back into Albums/
// Artists/Genres always did.
// The left panel is shared by the Music tab (its album/artist/genre browser, or the Playlist Explorer) and the
// Artist Information tab (an artist list in the very same column — same position, width, resizer, thumbnail size
// and row styling). Which of its three views shows follows the active tab; the rail's Music/Playlist Explorer
// highlight only applies on the Music tab (neither is "current" on the artist page).
function syncLeftPanelViews() {
  const onArtistPage = state.activeTab === 'artistInfo', onGenrePage = state.activeTab === 'genreInfo', onSidePage = onArtistPage || onGenrePage;
  if (el.panels) { el.panels.classList.toggle('artist-info-mode', onArtistPage); el.panels.classList.toggle('genre-info-mode', onGenrePage); }
  if (el.artistBrowserView) el.artistBrowserView.hidden = !onArtistPage;
  if (el.genreBrowserView) el.genreBrowserView.hidden = !onGenrePage;
  if (el.musicBrowserView) el.musicBrowserView.hidden = onSidePage;          // the Albums / Artists / Genres browser stays beside a playlist too (listing what is in it)
  if (el.playlistsBrowserView) el.playlistsBrowserView.hidden = onSidePage || state.leftNavView !== 'playlists';
  [[el.navMusicBtn, 'music'], [el.navPlaylistsBtn, 'playlists']].forEach(([btn, view]) => {
    if (!btn) return;
    const on = !onSidePage && state.leftNavView === view;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-current', on ? 'page' : 'false');
  });
  applyLeftNavWidth();
}
function setLeftNavView(view) {
  state.leftNavView = view;
  syncLeftPanelViews();

  if (view === 'music') {
    if (state.activePlaylistId) state.navFilter = null;          // what was picked while looking inside a playlist doesn't follow you out of it
    exitPlaylistView();
    buildLeftList();
    updateMainLabel();
    applyFiltersSort();
  } else {
    renderPlaylistSidebar();
  }
}

// Renders the Playlist Explorer tree in #playlistsBrowserView: folders
// (collapsible, each holding the playlists filed under it) followed by any
// unfiled playlists at the top level. Playlist rows are draggable onto a
// folder row (or back onto empty space / an unfiled row to un-file them);
// right-clicking either kind of row opens a small context menu.
function playlistRowHtml(p) {
  return `
    <div class="left-row playlist-sidebar-row ${p.id === state.activePlaylistId ? 'active' : ''}" data-id="${escapeHtml(p.id)}" draggable="true" tabindex="0">
      <div class="left-row-text"><p class="left-row-title">${escapeHtml(p.name)}</p></div>
      <span class="left-row-count">${p.items.length}</span>
    </div>
  `;
}

function renderPlaylistSidebar() {
  if (state.leftNavView === 'playlists') buildLeftList();          // (the browser beside it lists what is in the open playlist, which this call may just have changed)
  if (!el.playlistSidebarList) return;
  if (!state.playlists.length && !state.playlistFolders.length) {
    el.playlistSidebarList.innerHTML = '<p class="playlist-empty">No playlists yet.</p>';
    return;
  }

  const byFolder = {};
  const topLevel = [];
  state.playlists.forEach(p => {
    if (p.folderId && state.playlistFolders.some(f => f.id === p.folderId)) {
      (byFolder[p.folderId] || (byFolder[p.folderId] = [])).push(p);
    } else {
      topLevel.push(p);
    }
  });

  const folderHtml = state.playlistFolders.map(f => {
    const collapsed = state.playlistFoldersCollapsed.includes(f.id);
    const kids = byFolder[f.id] || [];
    return `
      <div class="playlist-folder" data-folder-id="${escapeHtml(f.id)}">
        <div class="left-row playlist-folder-row" data-folder-id="${escapeHtml(f.id)}" tabindex="0">
          <span class="playlist-folder-caret ${collapsed ? 'collapsed' : ''}">▾</span>
          <span class="playlist-folder-icon">📁</span>
          <div class="left-row-text"><p class="left-row-title">${escapeHtml(f.name)}</p></div>
          <span class="left-row-count">${kids.length}</span>
        </div>
        <div class="playlist-folder-children" ${collapsed ? 'hidden' : ''}>
          ${kids.map(playlistRowHtml).join('') || '<p class="playlist-empty playlist-folder-empty">Drop a playlist here</p>'}
        </div>
      </div>
    `;
  }).join('');

  el.playlistSidebarList.innerHTML = folderHtml + topLevel.map(playlistRowHtml).join('');

  // Folder rows: click toggles collapse, right-click opens the folder menu,
  // and each is a drop target for filing a dragged playlist into it.
  el.playlistSidebarList.querySelectorAll('.playlist-folder-row').forEach(rowEl => {
    const folder = state.playlistFolders.find(f => f.id === rowEl.dataset.folderId);
    if (!folder) return;
    rowEl.addEventListener('click', () => toggleFolderCollapsed(folder.id));
    rowEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openFolderRowContextMenu(folder, e.clientX, e.clientY);
    });
    rowEl.addEventListener('dragover', (e) => { e.preventDefault(); rowEl.classList.add('drag-over'); });
    rowEl.addEventListener('dragleave', () => rowEl.classList.remove('drag-over'));
    rowEl.addEventListener('drop', (e) => {
      e.preventDefault();
      rowEl.classList.remove('drag-over');
      const playlistId = e.dataTransfer.getData('text/plain');
      const playlist = state.playlists.find(p => p.id === playlistId);
      if (playlist && playlist.folderId !== folder.id) movePlaylistToFolder(playlist, folder.id);
    });
  });

  // Playlist rows: click opens it, double-click plays it straight away,
  // drag files it into a folder, right-click opens Rename/Move to
  // folder/Delete.
  el.playlistSidebarList.querySelectorAll('.playlist-sidebar-row').forEach(rowEl => {
    const playlist = state.playlists.find(p => p.id === rowEl.dataset.id);
    if (!playlist) return;
    rowEl.addEventListener('click', () => openPlaylist(playlist.id));
    rowEl.addEventListener('dblclick', () => { openPlaylist(playlist.id); playPlaylistFromStart(playlist); });
    rowEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openPlaylistRowContextMenu(playlist, e.clientX, e.clientY);
    });
    rowEl.addEventListener('dragstart', (e) => {
      playlistSidebarDragId = playlist.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', playlist.id); } catch (err) {}
    });
    rowEl.addEventListener('dragend', () => { playlistSidebarDragId = null; });
  });
}

// Toggles a folder's collapsed state and persists it (see
// state.playlistFoldersCollapsed / savePrefs()).
function toggleFolderCollapsed(folderId) {
  const idx = state.playlistFoldersCollapsed.indexOf(folderId);
  if (idx === -1) state.playlistFoldersCollapsed.push(folderId);
  else state.playlistFoldersCollapsed.splice(idx, 1);
  savePrefs();
  renderPlaylistSidebar();
}

// Files (or un-files, if folderId is null) a playlist and persists the
// change — folders are client-side only, so this just updates
// state.playlistFolderMap / prefs, no backend call.
function movePlaylistToFolder(playlist, folderId) {
  playlist.folderId = folderId || null;
  if (folderId) state.playlistFolderMap[playlist.id] = folderId;
  else delete state.playlistFolderMap[playlist.id];
  savePrefs();
  renderPlaylistSidebar();
}

/* Playlist row context menu — Rename/Edit, Move to folder ▸, Delete. Reuses
   the same floating-menu pattern as the album/track context menus
   (.now-playing-add-menu). */
function openPlaylistRowContextMenu(playlist, x, y) {
  closeNowPlayingAddMenu();
  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu';
  menu.innerHTML = `
    <div class="menu-section-title">${escapeHtml(playlist.name)}</div>
    <button type="button" data-action="rename">Rename / Edit</button>
    <button type="button" data-action="move" class="playlist-ctx-move">Move to folder ▸</button>
    <div class="menu-divider"></div>
    <button type="button" data-action="delete" class="danger-item">Delete playlist</button>
  `;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);

  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    closeNowPlayingAddMenu();
    openPlaylistModal('rename', playlist);
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    closeNowPlayingAddMenu();
    if (confirm(`Delete "${playlist.name}"? This can\u2019t be undone.`)) deletePlaylistDirect(playlist);
  });
  const moveBtn = menu.querySelector('.playlist-ctx-move');
  moveBtn.addEventListener('mouseenter', () => openMoveToFolderSubmenu(moveBtn, playlist));
  moveBtn.addEventListener('click', (e) => { e.stopPropagation(); openMoveToFolderSubmenu(moveBtn, playlist); });

  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}

// "Move to folder ▸" submenu off the playlist context menu: existing
// folders, "No folder", and "+ New folder…".
let playlistMoveSubmenuEl = null;
function closePlaylistMoveSubmenu() {
  if (playlistMoveSubmenuEl) { playlistMoveSubmenuEl.remove(); playlistMoveSubmenuEl = null; }
}
function openMoveToFolderSubmenu(anchorEl, playlist) {
  closePlaylistMoveSubmenu();

  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu album-search-submenu playlist-move-submenu';
  const folderButtons = state.playlistFolders.map(f =>
    `<button type="button" data-folder-id="${escapeHtml(f.id)}">${f.id === playlist.folderId ? '✓ ' : ''}${escapeHtml(f.name)}</button>`
  ).join('');
  menu.innerHTML = `
    ${folderButtons}
    ${state.playlistFolders.length ? '<div class="menu-divider"></div>' : ''}
    <button type="button" data-folder-id="__none__">${!playlist.folderId ? '✓ ' : ''}No folder</button>
    <div class="menu-divider"></div>
    <button type="button" data-folder-id="__new__">+ New folder\u2026</button>
  `;
  document.body.appendChild(menu);
  playlistMoveSubmenuEl = menu;
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${rect.right + 2}px`;
  menu.style.top = `${rect.top}px`;
  requestAnimationFrame(() => {
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) menu.style.left = `${Math.max(4, rect.left - menuRect.width - 2)}px`;
    if (menuRect.bottom > window.innerHeight) menu.style.top = `${Math.max(4, window.innerHeight - menuRect.height - 4)}px`;
  });

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-folder-id]');
    if (!btn) return;
    const fid = btn.dataset.folderId;
    closeNowPlayingAddMenu();
    closePlaylistMoveSubmenu();
    if (fid === '__new__') {
      openFolderModal('create', null, playlist);
    } else if (fid === '__none__') {
      movePlaylistToFolder(playlist, null);
    } else {
      movePlaylistToFolder(playlist, fid);
    }
  });
}

/* Folder row context menu — Rename folder, Delete folder (un-files its
   playlists rather than deleting them). */
function openFolderRowContextMenu(folder, x, y) {
  closeNowPlayingAddMenu();
  const menu = document.createElement('div');
  menu.className = 'panel-mode-menu now-playing-add-menu';
  menu.innerHTML = `
    <div class="menu-section-title">${escapeHtml(folder.name)}</div>
    <button type="button" data-action="rename">Rename folder</button>
    <div class="menu-divider"></div>
    <button type="button" data-action="delete" class="danger-item">Delete folder</button>
  `;
  document.body.appendChild(menu);
  positionFloatingMenu(menu, x, y);

  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    closeNowPlayingAddMenu();
    openFolderModal('rename', folder);
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    closeNowPlayingAddMenu();
    if (confirm(`Delete folder "${folder.name}"? Its playlists won\u2019t be deleted \u2014 just un-filed.`)) deleteFolderDirect(folder);
  });

  nowPlayingAddMenuEl = menu;
  setTimeout(() => document.addEventListener('click', closeNowPlayingAddMenuOnOutsideClick), 0);
}

function deleteFolderDirect(folder) {
  state.playlists.forEach(p => { if (p.folderId === folder.id) p.folderId = null; });
  Object.keys(state.playlistFolderMap).forEach(pid => {
    if (state.playlistFolderMap[pid] === folder.id) delete state.playlistFolderMap[pid];
  });
  state.playlistFolders = state.playlistFolders.filter(f => f.id !== folder.id);
  const ci = state.playlistFoldersCollapsed.indexOf(folder.id);
  if (ci !== -1) state.playlistFoldersCollapsed.splice(ci, 1);
  savePrefs();
  renderPlaylistSidebar();
}

/* Create/rename-folder modal — same simple overlay pattern as the playlist
   modal, but fully client-side (no postUpdate/backend call: folders live
   only in localStorage, see state.playlistFolders). */
function openFolderModal(mode, folder, pendingPlaylist) {
  folderModalMode = mode;
  folderModalEditingId = folder ? folder.id : null;
  pendingFolderMovePlaylist = pendingPlaylist || null;
  el.folderModalHeading.textContent = mode === 'rename' ? 'Rename folder' : 'New folder';
  el.folderNameInput.value = folder ? folder.name : '';
  el.folderModalToast.textContent = '';
  el.folderModalOverlay.hidden = false;
  setTimeout(() => el.folderNameInput.focus(), 0);
}
function closeFolderModal() {
  el.folderModalOverlay.hidden = true;
  pendingFolderMovePlaylist = null;
}
function saveFolderModalClick() {
  const name = el.folderNameInput.value.trim();
  if (!name) { el.folderModalToast.textContent = 'Give it a name first'; return; }

  if (folderModalMode === 'rename' && folderModalEditingId) {
    const folder = state.playlistFolders.find(f => f.id === folderModalEditingId);
    if (folder) folder.name = name;
  } else {
    const folder = { id: 'folder_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name };
    state.playlistFolders.push(folder);
    if (pendingFolderMovePlaylist) movePlaylistToFolder(pendingFolderMovePlaylist, folder.id);
  }
  savePrefs();
  closeFolderModal();
  renderPlaylistSidebar();
}
let pendingFolderMovePlaylist = null; // playlist to file into a brand-new folder once it's created

// Renders the currently-open playlist into the main panel (el.gridContainer)
// — called from renderGrid() when state.activePlaylistId is set. With no
// playlist picked yet, shows a simple placeholder. The header (name, edit/
// delete) is always the same; the body underneath switches layout per
// state.playlistViewMode — see renderPlaylistBody().
function renderPlaylistMainPanel() {
  el.viewbar.hidden = false; el.viewbar.classList.add('in-playlist');          // the same bar as Music (size, Sort & filter); the grid/list switch is the library's own, a playlist has its views in the title menu
  el.stateMsg.hidden = true;

  const real = state.playlists.find(p => p.id === state.activePlaylistId);
  if (!real) {
    el.gridContainer.classList.remove('covers-only');
    el.gridContainer.innerHTML = '<p class="playlist-placeholder">Pick a playlist on the left, or create a new one.</p>';
    return;
  }
  const playlist = playlistViewOf(real);                       // what is shown: narrowed, sorted (renaming and deleting below act on the real one)
  const count = playlist.narrowed ? `${playlist.items.length} of ${playlist.total}` : String(playlist.total);
  const sortNote = playlist.sortKey !== 'playlist' ? ` \u00b7 sorted: ${PLAYLIST_SORT_LABELS[playlist.sortKey] || playlist.sortKey}` : '';

  el.gridContainer.innerHTML = `
    <div class="playlist-detail-header">
      <div>
        <h2>${escapeHtml(real.name)}</h2>
        ${real.description ? `<p class="playlist-detail-desc">${escapeHtml(real.description)}</p>` : ''}
        <p class="playlist-detail-meta">${count} item${playlist.total === 1 ? '' : 's'}${escapeHtml(sortNote)}</p>
      </div>
      <div class="playlist-detail-actions">
        <button type="button" id="playlistPlayBtn" class="config-btn" ${playlist.items.length ? '' : 'disabled'}>\u25b6 Play</button>
        <button type="button" id="playlistRenameBtn" class="config-btn">Edit</button>
        <button type="button" id="playlistDeleteBtn" class="remove-btn">Delete playlist</button>
      </div>
    </div>
    <div id="playlistBody" class="playlist-body"></div>
  `;

  document.getElementById('playlistPlayBtn').addEventListener('click', () => playPlaylistFromStart(playlist));          // plays what is shown, in the order shown
  document.getElementById('playlistRenameBtn').addEventListener('click', () => openPlaylistModal('rename', real));
  document.getElementById('playlistDeleteBtn').addEventListener('click', (e) => onPlaylistDeleteClick(e.currentTarget, real));

  renderPlaylistBody(playlist);
}

// Swaps in whichever layout state.playlistViewMode currently points at,
// mirroring the library's Tracks/Album and Tracks/Album covers/Artists
// options (see the view dropdown) but scoped to just this playlist's items.
function renderPlaylistBody(playlist) {
  const body = document.getElementById('playlistBody');
  if (!body) return;
  // Same safety as renderGrid() — an inline-style quick peek could be
  // sitting inside this exact container right now.
  closeAlbumQuickPeek();
  const mode = state.playlistViewMode;
  el.gridContainer.classList.toggle('covers-only', mode === 'covers');
  if (!playlist.items.length && playlist.total) { body.innerHTML = '<p class="playlist-empty">Nothing in this playlist matches what is picked on the left, in the search box or in Sort &amp; filter.</p>'; return; }

  if (mode === 'tracks') { renderPlaylistTracksView(playlist, body); return; }
  if (mode === 'albumTracks') { renderPlaylistAlbumTracksView(playlist, body); return; }
  if (mode === 'covers') { renderPlaylistCoversView(playlist, body); return; }
  if (mode === 'artists') { renderPlaylistArtistsView(playlist, body); return; }
  renderPlaylistListView(playlist, body);
}

// Default view: the playlist's own ordered, drag-to-reorder item list —
// this is exactly what renderPlaylistMainPanel() used to always show.
function renderPlaylistListView(playlist, body) {
  const itemsHtml = playlist.items.length ? playlistListRows(playlist).map((rw) => {
    if (rw.head !== undefined) return `<div class="playlist-group-head lvl${rw.lvl}">${escapeHtml(rw.head)}</div>`;
    const it = rw.it, idx = rw.idx;
    const album = playlistAlbumFor(it);
    const art = playlistItemArtUrl(album);
    const albumTitle = album ? album.title : '(album removed from crate)';
    const artist = album ? album.artist : '';
    return `
      <div class="playlist-item-row" draggable="${playlist.reorderable ? 'true' : 'false'}" data-idx="${idx}" data-id="${escapeHtml(it.id)}">
        <span class="playlist-item-drag" ${playlist.reorderable ? 'title="Drag to reorder"' : 'style="visibility:hidden"'} aria-hidden="true">\u2637</span>
        <img class="playlist-item-art" src="${art}" alt="">
        <div class="playlist-item-info">
          <span class="playlist-item-title">${it.type === 'track' ? escapeHtml(it.trackName || 'Track') : escapeHtml(albumTitle)}</span>
          <span class="playlist-item-sub">${it.type === 'track' ? escapeHtml(albumTitle) + ' \u2014 ' + escapeHtml(artist) : escapeHtml(artist)}</span>
        </div>
        ${it.type === 'track' ? '<span class="playlist-item-type-badge">TRACK</span>' : ''}
        <button type="button" class="playlist-item-view-btn" title="View album" aria-label="View album">\u2197</button>
        <button type="button" class="playlist-item-remove-btn" title="Remove from playlist" aria-label="Remove from playlist">\u2715</button>
      </div>
    `;
  }).join('') : '<p class="playlist-empty">Nothing here yet \u2014 right-click an album or track and choose \u201cAdd to playlist\u201d.</p>';

  body.innerHTML = `${!playlist.reorderable && playlist.total > 1 ? '<p class="playlist-order-note">This is a filtered, sorted or grouped view. To drag items into a new order, choose Sort &amp; filter \u2192 Playlist order and clear the filters and grouping.</p>' : ''}<div id="playlistItemsList" class="playlist-items-list">${itemsHtml}</div>`;

  const listEl = document.getElementById('playlistItemsList');
  if (!listEl) return;

  listEl.addEventListener('click', (e) => {
    const rowEl = e.target.closest('.playlist-item-row');
    if (!rowEl) return;
    const idx = parseInt(rowEl.dataset.idx, 10);
    const it = playlist.items[idx];
    if (!it) return;
    if (e.target.closest('.playlist-item-remove-btn')) { removePlaylistItem(playlist, it.id); return; }
    if (e.target.closest('.playlist-item-view-btn')) {
      const album = playlistAlbumFor(it);
      if (album) openDeck(album);
      return;
    }
  });

  if (playlist.reorderable) setupPlaylistItemDrag(listEl, playlist);
}

// "Tracks" view: reuses the library's own flat Tracks table wholesale —
// same buildTrackTableHeader()/renderFlatTrackTable() as renderTrackView(),
// so it gets identical sortable/resizable/reorderable/customizable columns,
// identical click-to-select and double-click-to-play-on-Spotify row
// behavior, and clicking a row never opens the album deck (see
// handleTrackRowClick / trackHeaderColumns — none of that is playlist- or
// library-specific). The only playlist-specific part is building the row
// list: standalone track items need no lookup (they already know their own
// trackNum/trackName), whole albums get their tracklist fetched via
// getTracksFor() same as the library. Shares state.flatTrackRows/
// state.trackSort/state.fields.tracks/state.trackColWidths with the library
// view — safe since only one of the two is ever on screen at a time — so
// column choices, widths and sort persist the same way in both places.
function renderPlaylistTracksView(playlist, body) {
  if (!playlist.items || !playlist.items.length) {
    body.innerHTML = '<p class="playlist-empty">Nothing here yet \u2014 right-click an album or track and choose \u201cAdd to playlist\u201d.</p>';
    return;
  }
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'track-view track-view-table';
  wrap.appendChild(buildTrackTableHeader());
  const tbody = document.createElement('div');
  tbody.id = 'trackTableBody';
  tbody.innerHTML = '<p class="tracklist-status">Loading tracks\u2026</p>';
  wrap.appendChild(tbody);
  body.appendChild(wrap);
  loadPlaylistFlatTrackTable(playlist);
}

// Builds this playlist's flattened track rows (fetching any album
// tracklists it needs first) and hands them to the shared
// state.flatTrackRows / renderFlatTrackTable() pipeline — the same one
// loadFlatTrackTable() feeds for the library's Tracks view. Guarded so a
// slow fetch can't stomp on the table after the person has switched away
// (closed the playlist, opened a different one, or picked another view).
let playlistFlatTrackLoadToken = 0;
function loadPlaylistFlatTrackTable(playlist) {
  const token = ++playlistFlatTrackLoadToken;

  function stale() {
    return token !== playlistFlatTrackLoadToken ||
      state.activePlaylistId !== playlist.id ||
      state.playlistViewMode !== 'tracks';
  }

  // Every 1.26.2/1.26.3 fix below assumed playlist.items itself was a clean
  // array of well-formed {type, row, ...} entries and only worried about the
  // async getTracksFor() lookups rejecting — but a stray null/undefined
  // *entry* (e.g. left behind by an add/remove race) throws synchronously
  // the moment .filter()/.map() or playlistAlbumFor() touches it, before any
  // of those .catch()es even exist yet. That throw had nowhere to go, so it
  // just aborted the function after "Loading tracks…" was already on
  // screen, leaving that one playlist stuck forever while every other
  // playlist (with no bad entry) loaded fine. albums-list computation and
  // settle() row-building are now both wrapped and skip/no-op on a bad
  // entry instead of throwing, and either failure now surfaces a status
  // message instead of leaving the loading state in place indefinitely.
  function showError() {
    if (stale()) return;
    const body = document.getElementById('trackTableBody');
    if (body) body.innerHTML = '<p class="tracklist-status">Couldn\u2019t load tracks for this playlist \u2014 one of its entries looks corrupted. Try removing and re-adding the affected album or track.</p>';
  }

  let albums;
  try {
    albums = [...new Map(
      (playlist.items || []).filter(it => it && it.type !== 'track')
        .map(it => playlistAlbumFor(it))
        .filter(Boolean)
        .map(a => [a.row, a])
    ).values()];
  } catch (e) {
    console.warn('loadPlaylistFlatTrackTable: failed to compute album list', playlist, e);
    showError();
    return;
  }

  function settle() {
    if (stale()) return;
    try {
      const rows = [];
      (playlist.items || []).forEach((it, idx) => {
        if (!it) return; // corrupted entry — skip rather than throw
        const album = playlistAlbumFor(it) || { row: it.row, artist: '', title: '(album removed from crate)' };
        if (it.type === 'track') {
          rows.push({ item: album, track: { trackNumber: it.trackNum, trackName: it.trackName, trackTimeMillis: null, ...trackLinkOverridesFor(album, it.trackNum, it.trackName) }, idx });
          return;
        }
        const tracks = state.trackCache[artKey(album)] || [];
        tracks.forEach((t, ti) => rows.push({ item: album, track: t, idx: ti }));
      });
      state.flatTrackRows = rows;
      renderFlatTrackTable();
    } catch (e) {
      console.warn('loadPlaylistFlatTrackTable: failed to build rows', playlist, e);
      showError();
    }
  }

  if (!albums.length) { settle(); return; }
  let remaining = albums.length;
  albums.forEach(album => {
    // withHardTimeout (see loadFlatTrackTable above) covers the case this
    // .catch() alone can't: a lookup that never resolves OR rejects (a
    // hung fetch), which would otherwise leave `remaining` stuck above
    // zero and this playlist's Tracks view stuck on "Loading tracks…"
    // forever, same failure mode as the library's own Tracks view.
    withHardTimeout(getTracksFor(album), 20000, []).catch(e => {
      // A failed lookup shouldn't leave the table stuck on "Loading
      // tracks…" forever — fall through with no tracks for this album
      // so the counter below still advances.
      console.warn('Playlist tracklist lookup failed', album, e);
      return [];
    }).then(() => {
      if (stale()) return;
      remaining--;
      if (remaining === 0) settle();
    });
  });
}

/* ---------- Playlist "▶ Play" queue ----------
   A single ordered queue that hands playback off between the app's two
   independent playback engines — the Spotify Web Playback SDK (normal
   tracks) and the floating YouTube player (manual-album tracks with no
   reliable Spotify match, see isManualAlbum()) — neither of which knows
   the other exists. This layer just watches each engine's own "did the
   current track end" signal and, when it fires for whatever this queue is
   currently on, advances to the next entry and plays it on whichever
   engine that entry needs, so a playlist mixing real Spotify tracks and
   YouTube-only ones plays straight through in order.

   Caveat: the Spotify Web Playback SDK has no explicit "track ended"
   event, only discrete player_state_changed snapshots (see
   onSpotifyPlayerStateChanged), so "ended" there is inferred as "went
   from playing to paused while the previous snapshot's position was
   within CRATE_QUEUE_END_THRESHOLD_MS of the track's duration". That's
   a heuristic — the same one most third-party Spotify Connect clients
   use in the absence of a real ended event — not a guarantee. */
const CRATE_QUEUE_END_THRESHOLD_MS = 2500; // was 1500 — a little extra room for event/poll delivery latency now that the comparison itself (see maybeAdvanceCrateQueueOnEnd) is accurate instead of comparing against a stale stored position
let crateQueueId = 0;              // bumped on every new "Play" run (or reset), so stale lookups/advances no-op
let crateQueueList = [];           // ordered [{ item, track }]
let crateQueueIndex = -1;
let crateQueueStalledIndex = -1;   // the queue entry Spotify wouldn't start, so Play retries it — see startCrateQueueSpotify
let crateQueuePending = null;      // releases of a big "play everything" not loaded into the queue yet — see playAlbumsReplacingQueue
let crateQueueExpectedSpotifyTrackId = null; // the Spotify track ID this queue is currently waiting to hear "ended" for
let ytPlayingForCrateQueue = false;          // true while the floating YT player is standing in for the current queue entry, see playCrateTrackOnYoutube

function isPlayingCrateQueue() {
  return crateQueueIndex >= 0 && crateQueueIndex < crateQueueList.length;
}

// Looks up the YouTube/Spotify link for a *standalone* track playlist item
// — these only store trackNum/trackName (see state.playlists), so the link
// itself lives on the owning manual album's manualTracks and has to be
// matched by track number, falling back to title for tracks with no number.
function manualYoutubeLinkFor(album, trackNum, trackName) {
  if (!isManualAlbum(album)) return '';
  const m = album.manualTracks.find(t => (trackNum !== undefined && trackNum !== '' && t.trackNumber === trackNum) || t.title === trackName);
  return (m && m.youtubeLink) || '';
}
function manualSpotifyLinkFor(album, trackNum, trackName) {
  if (!isManualAlbum(album)) return '';
  const m = album.manualTracks.find(t => (trackNum !== undefined && trackNum !== '' && t.trackNumber === trackNum) || t.title === trackName);
  return (m && m.spotifyLink) || '';
}

// Resolves the saved link overrides for one track — see "Edit track
// properties…" (openTrackPropertiesModal). trackData (keyed by track
// number, same JSON blob rating/note/genre/listened already live in) always
// wins; both links additionally fall back to a manually-tracklisted album's
// own manualTracks entry (the tracklist builder's YouTube/Spotify columns)
// so a link typed in there shows up here too without needing to be
// re-entered via "Edit track properties…". name/lengthMs have no such
// manualTracks fallback (those are edited directly in the tracklist
// builder itself for a manual album) — they only ever come from trackData.
function trackLinkOverridesFor(item, trackNum, trackName) {
  const tData = (item && item.trackData && item.trackData[trackNum]) || {};
  const youtubeLink = tData.youtubeLink || manualYoutubeLinkFor(item, trackNum, trackName);
  const spotifyLink = tData.spotifyLink || manualSpotifyLinkFor(item, trackNum, trackName);
  return {
    youtubeLink, spotifyLink, name: tData.name || '', lengthMs: tData.lengthMs || 0,
    album: tData.album || '', rymLink: tData.rymLink || '', date: tData.date || '',
    artist: tData.artist || '', albumArtist: tData.albumArtist || '',
    soundcloudLink: tData.soundcloudLink || '',
    rymRating: rymNum(tData.rymRating),
    rymVotes: rymVotesNum(tData.rymVotes)
  };
}

// Layers trackLinkOverridesFor() onto every track in an already-built
// tracklist array (mutates in place) — used right before a tracklist is
// cached/rendered (getTracksFor, loadTracklist's manual branch) so every
// track-rendering view (deck, "Album and Tracks", flat Tracks table) shows
// and plays the same saved link/name/length/album/date/artist without each
// having to resolve it itself. IMPORTANT: everything here is looked up by
// t.trackNumber, which is read BEFORE t.trackName is overwritten below, so
// a rename never breaks the trackData lookup for that same track on a
// later pass. rymLink/album/date/artist/albumArtist are carried onto the
// track object as t.rymLink/t.albumName/t.trackDate/t.trackArtist/
// t.albumArtist for whatever wants to read them (the track context menu's
// "View on RateYourMusic ↗" action, for one) — none of the existing
// track-rendering views print most of these per-track yet, so setting them
// here is the plumbing; a display surface for them can follow once there's
// a specific view that wants one.
function mergeTrackLinkOverrides(item, tracks) {
  (tracks || []).forEach(t => {
    const ov = trackLinkOverridesFor(item, t.trackNumber || 0, t.trackName);
    t.youtubeLink = ov.youtubeLink;
    if (ov.spotifyLink) t.spotifyLink = ov.spotifyLink;
    else delete t.spotifyLink;
    if (ov.name) t.trackName = ov.name;
    if (ov.lengthMs) t.trackTimeMillis = ov.lengthMs;
    if (ov.album) t.albumName = ov.album;
    if (ov.rymLink) t.rymLink = ov.rymLink;
    if (ov.date) t.trackDate = ov.date;
    if (ov.artist) t.trackArtist = ov.artist;
    if (ov.albumArtist) t.albumArtist = ov.albumArtist;
    if (ov.soundcloudLink) t.soundcloudLink = ov.soundcloudLink;
    if (ov.rymRating) { t.rymRating = ov.rymRating; if (ov.rymVotes) t.rymVotes = ov.rymVotes; else delete t.rymVotes; } else { delete t.rymRating; delete t.rymVotes; }
  });
  return tracks;
}

// Turns a saved Spotify link override into a playable spotify:track:ID URI
// — accepts either a plain open.spotify.com track URL (reusing spotifyUri()
// below) or a raw spotify:track:ID URI typed directly. Returns null for
// anything else (empty, an album link, garbage) so callers can cleanly fall
// through to their next option.
function trackSpotifyUriFromLink(link) {
  if (!link) return null;
  const trimmed = link.trim();
  if (/^spotify:track:[a-zA-Z0-9]+$/i.test(trimmed)) return trimmed;
  return spotifyUri(trimmed);
}

// Snapshots whatever tracklist is currently showing for an album (its own
// manualTracks, or the auto-fetched iTunes/MusicBrainz result — either way,
// with any saved link overrides already resolved) into tracklist-builder
// row shape, original track numbers included. This is the shared starting
// point for every "add/remove a track" entry point below — the Edit
// modal's "⤓ Load current tracklist" button, and the quick "Remove from
// tracklist"/"+ Add track" actions — so converting an auto-looked-up album
// always starts from what's actually showing rather than an empty list.
function currentTracklistAsManualRows(item) {
  const tracks = (activeItem === item ? currentTracklistTracks : state.trackCache[artKey(item)]) || [];
  return tracks.map(t => {
    const links = trackLinkOverridesFor(item, t.trackNumber || 0, t.trackName);
    return { trackNumber: t.trackNumber || 0, title: t.trackName || '', youtubeLink: links.youtubeLink, spotifyLink: links.spotifyLink, durationMs: t.trackTimeMillis || 0, section: t.section || '', pos: t.pos || '', s: t.s || '' };
  });
}

// Persists a new manualTracks list for an album — the single write path
// behind the quick "Remove from tracklist"/"+ Add track" actions (the Edit
// modal's own Save button goes through collectTracklistBuilderRows/
// saveEditAlbum instead, but ends up writing the same ManualTracks field).
// Once this runs the album is a manually-maintained tracklist from then on
// (isManualAlbum) — seeded from currentTracklistAsManualRows so an
// auto-looked-up album converts with everything it already had intact,
// just missing the one track removed/plus the one just added. Rows that
// came from an existing tracklist keep their original track number (same
// reasoning as collectTracklistBuilderRows) so trackData saved against
// them — rating/note/genre/other saved links — stays attached correctly;
// a brand-new row gets the next number free after every number in use.
async function saveManualTracklist(item, rows, quiet) {
  let nextNum = Math.max(tlMinNext(item), ...rows.map(t => t.trackNumber || 0), 0) + 1;       // past every number the album still holds data for, so a new track can't inherit a removed one's
  const manualTracks = tlPersist(rows
    .filter(t => t.title && t.title.trim())
    .map(t => ({
      trackNumber: t.trackNumber || nextNum++,
      title: t.title.trim(),
      youtubeLink: (t.youtubeLink || '').trim(),
      spotifyLink: (t.spotifyLink || '').trim(),
      durationMs: t.durationMs || 0, section: t.section || '', pos: trackPosOf(t), s: t.s || ''
    })), 'lookup');
  // editAlbum, not a bare update: the backend's no-action branch only knows rating, review, trackData and the RYM rating, so a tracklist sent without an action was answered "ok" and NEVER WRITTEN to the sheet
  // (it showed until the next reload, then vanished). editAlbum writes just the fields it is given.
  await postUpdate({ action: 'editAlbum', row: item.row, ManualTracks: JSON.stringify(manualTracks) });
  item.manualTracks = manualTracks;
  item.hasManualTracklist = true;
  delete state.trackCache[artKey(item)];
  refreshLinkFlagsFor(item);   // songs were added/removed: the release may now have (or no longer have) unlinked ones
  if (activeItem === item) await loadTracklist(item);
  if (!quiet) flashGlobalToast('Tracklist updated');
}

// BEGIN track-grid
// The track editor: every track of a release in one grid. These are its rules, kept apart from the screen so they can be tested on their own.
// A row is { id, trackNumber (0 = new), side, title, length ("3:12"), ms (the length it was loaded with), spotify, youtube, soundcloud, genre, rating (0-5, halves), listened, note, rymRating, rymVotes, s (where the track came from) }.
// WHAT A SAVE WRITES (tgPlan): a track's own links, genre, rating, listened and note live in the release's track data, keyed by track number; its title, length, side and place in the order live in the tracklist you maintain yourself.
// Two traps are handled here: a link saved in the track data OVERRIDES the tracklist's own (and an empty one falls through to it), so a link is cleared in both places; and a title or length typed over an old override has to remove that override.
const TG_FIELDS = ['side', 'title', 'length', 'spotify', 'youtube', 'soundcloud', 'genre', 'rating', 'listened', 'note'], TG_LINK_FIELDS = ['spotify', 'youtube', 'soundcloud'], TG_STRUCT_FIELDS = ['side', 'title', 'length'];
const TG_LINK_RE = { spotify: /^(?:https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/[A-Za-z0-9]+|spotify:track:[A-Za-z0-9]+)/i, youtube: /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/\S+/i, soundcloud: /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/\S+/i };
const TG_LINK_NAME = { spotify: 'a Spotify track link', youtube: 'a YouTube link', soundcloud: 'a SoundCloud link' };
let tgSeq = 0; const tgId = () => 'r' + (++tgSeq);
function tgBlank(over) { return Object.assign({ id: tgId(), trackNumber: 0, side: '', title: '', length: '', ms: 0, spotify: '', youtube: '', soundcloud: '', genre: '', rating: 0, listened: false, note: '', rymRating: 0, rymVotes: 0, s: 'typed' }, over || {}); }
function tgRowsFrom(tracks, trackData) {                              // the release's tracks as they are shown (overrides already applied) + the per-track data
  return (tracks || []).map(t => { const td = (trackData && trackData[t.trackNumber]) || {}, ms = Number(t.trackTimeMillis) || 0;
    return tgBlank({ trackNumber: t.trackNumber || 0, pos: trackPosOf(t), side: t.section || '', title: t.trackName || '', length: ms ? tlFormatTime(ms) : '', ms, spotify: t.spotifyLink || '', youtube: t.youtubeLink || '', soundcloud: t.soundcloudLink || '', genre: td.genre || '', rating: Number(td.rating) || 0, listened: !!td.listened, note: td.note || '', rymRating: Number(t.rymRating) || 0, rymVotes: Number(t.rymVotes) || 0, s: t.s || '' }); });
}
const tgClone = (rows) => rows.map(r => Object.assign({}, r));
function tgHasData(r) { return !!(String(r.title).trim() || String(r.side).trim() || String(r.length).trim() || TG_LINK_FIELDS.some(f => String(r[f]).trim()) || String(r.genre).trim() || String(r.note).trim() || Number(r.rating) > 0 || r.listened); }
function tgProblems(rows) {                                           // [{ id, field, msg }]: what stops a save
  const out = [];
  rows.forEach(r => {
    if (!String(r.title).trim() && tgHasData(r)) out.push({ id: r.id, field: 'title', msg: 'needs a title (or remove the track)' });
    const L = String(r.length).trim(); if (L && !tlParseTime(L)) out.push({ id: r.id, field: 'length', msg: `\u201c${L}\u201d isn\u2019t a time (like 3:12)` });
    TG_LINK_FIELDS.forEach(f => { const v = String(r[f]).trim(); if (v && !TG_LINK_RE[f].test(v)) out.push({ id: r.id, field: f, msg: `isn\u2019t ${TG_LINK_NAME[f]}` }); });
    const q = Number(r.rating); if (!(q >= 0 && q <= 5 && Math.round(q * 2) === q * 2)) out.push({ id: r.id, field: 'rating', msg: 'a rating is 0 to 5, in halves' });
  });
  return out;
}
function tgDiff(orig, rows) {
  const o = new Map(orig.map(r => [r.id, r])), inRows = new Set(rows.map(r => r.id)), cells = [], added = [], removed = [];
  rows.forEach(r => { const b = o.get(r.id); if (!b) { if (tgHasData(r)) added.push(r.id); return; } TG_FIELDS.forEach(f => { if (String(r[f]) !== String(b[f])) cells.push({ id: r.id, field: f }); }); });
  orig.forEach(b => { if (!inRows.has(b.id)) removed.push(b.id); });
  const kept = rows.filter(r => o.has(r.id)).map(r => r.id).join(), was = orig.filter(b => inRows.has(b.id)).map(b => b.id).join(), reordered = kept !== was;
  return { cells, added, removed, reordered, structural: cells.some(c => TG_STRUCT_FIELDS.includes(c.field)) || added.length > 0 || removed.length > 0 || reordered, linksChanged: cells.some(c => TG_LINK_FIELDS.includes(c.field)), count: cells.length + added.length + removed.length + (reordered ? 1 : 0) };
}
function tgPlan(rows, orig, ctx) {                                    // ctx: { isManual, trackData, minNext } -> what to write
  const d = tgDiff(orig, rows), o = new Map(orig.map(r => [r.id, r])), keep = rows.filter(r => String(r.title).trim()), need = d.structural || (!!ctx.isManual && d.linksChanged);
  let next = Math.max(Number(ctx.minNext) || 0, ...rows.map(r => r.trackNumber || 0), ...orig.map(r => r.trackNumber || 0), 0) + 1;
  const numbered = keep.map(r => Object.assign({}, r, { trackNumber: r.trackNumber || next++ })), td = JSON.parse(JSON.stringify(ctx.trackData || {}));
  const keptNumbers = new Set(numbered.map(r => r.trackNumber)), removedNumbers = orig.filter(b => b.trackNumber && !keptNumbers.has(b.trackNumber)).map(b => b.trackNumber);
  removedNumbers.forEach(n => { delete td[n]; });
  numbered.forEach(r => {
    const b = o.get(r.id), n = r.trackNumber, ent = td[n] || {}, changed = (f) => !b || String(r[f]) !== String(b[f]), put = (key, val, has) => { if (has) ent[key] = val; else delete ent[key]; };
    if (changed('genre')) put('genre', String(r.genre).trim(), !!String(r.genre).trim());
    if (changed('rating')) put('rating', Number(r.rating), Number(r.rating) > 0);
    if (changed('listened')) put('listened', true, !!r.listened);
    if (changed('note')) put('note', String(r.note).trim(), !!String(r.note).trim());
    if (changed('spotify')) put('spotifyLink', String(r.spotify).trim(), !!String(r.spotify).trim());
    if (changed('youtube')) put('youtubeLink', String(r.youtube).trim(), !!String(r.youtube).trim());
    if (changed('soundcloud')) put('soundcloudLink', String(r.soundcloud).trim(), !!String(r.soundcloud).trim());
    if (b && changed('title')) delete ent.name;                       // an old override of the title must not win over what was typed now
    if (b && changed('length')) delete ent.lengthMs;
    if (Object.values(ent).some(v => v)) td[n] = ent; else delete td[n];
  });
  const manualRows = need ? numbered.map(r => { const b = o.get(r.id); return { trackNumber: r.trackNumber, title: String(r.title).trim(), youtubeLink: String(r.youtube).trim(), spotifyLink: String(r.spotify).trim(), durationMs: (b && String(b.length) === String(r.length)) ? (b.ms || 0) : (tlParseTime(String(r.length).trim()) || 0), section: String(r.side).trim(), pos: r.pos || '', s: r.s || '' }; }) : null;
  const tdChanged = JSON.stringify(td) !== JSON.stringify(ctx.trackData || {});
  return { diff: d, needManual: need, convert: need && !ctx.isManual, manualRows, trackData: tdChanged ? td : null, removedNumbers, numbers: new Map(numbered.map(r => [r.id, r.trackNumber])) };
}
function tgFindReplace(rows, find, repl) {                            // in every title; case does not matter; { rows, count, examples: [[before, after]] }
  const f = String(find == null ? '' : find); if (!f) return { rows: tgClone(rows), count: 0, examples: [] };
  const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ex = []; let count = 0;
  const out = rows.map(r => { const t = String(r.title); if (!re.test(t)) { re.lastIndex = 0; return Object.assign({}, r); } re.lastIndex = 0; const nt = t.replace(re, repl == null ? '' : String(repl)).replace(/\s+/g, ' ').trim(); count++; if (ex.length < 3) ex.push([t, nt]); return Object.assign({}, r, { title: nt }); });
  return { rows: out, count, examples: ex };
}
function tgSetMany(rows, ids, field, value) { const s = new Set(ids); return rows.map(r => s.has(r.id) ? Object.assign({}, r, { [field]: value }) : Object.assign({}, r)); }
function tgFill(rows, ids, field) {                                   // every selected row gets the value of the first selected row
  const s = new Set(ids), first = rows.find(r => s.has(r.id)); if (!first) return tgClone(rows);
  return rows.map(r => s.has(r.id) ? Object.assign({}, r, { [field]: first[field] }) : Object.assign({}, r));
}
function tgMoveRows(rows, ids, dir) {                                 // the selected rows one place up (-1) or down (1), keeping their order; a block at the edge stays
  const s = new Set(ids), a = tgClone(rows);
  if (dir < 0) { for (let i = 1; i < a.length; i++) if (s.has(a[i].id) && !s.has(a[i - 1].id)) { const t = a[i - 1]; a[i - 1] = a[i]; a[i] = t; } }
  else { for (let i = a.length - 2; i >= 0; i--) if (s.has(a[i].id) && !s.has(a[i + 1].id)) { const t = a[i + 1]; a[i + 1] = a[i]; a[i] = t; } }
  return a;
}
function tgMoveTo(rows, id, toIndex) { const from = rows.findIndex(r => r.id === id); if (from < 0) return tgClone(rows); const a = tgClone(rows), [x] = a.splice(from, 1); a.splice(Math.max(0, Math.min(a.length, toIndex)), 0, x); return a; }
function tgDeleteRows(rows, ids) { const s = new Set(ids); return rows.filter(r => !s.has(r.id)).map(r => Object.assign({}, r)); }
function tgPasteLines(rows, startIdx, field, text) {                  // a column of text pasted into a cell fills down from it (new rows are added at the end when it runs out)
  const lines = String(text == null ? '' : text).replace(/\r/g, '').split('\n'); while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const a = tgClone(rows);
  lines.forEach((line, i) => {
    const k = startIdx + i; if (k >= a.length) a.push(tgBlank());
    const v = line.trim(); a[k][field] = field === 'rating' ? (Number(v) >= 0 && Number(v) <= 5 ? Math.round(Number(v) * 2) / 2 : 0) : field === 'listened' ? /^(true|yes|y|x|1|\u2713)$/i.test(v) : v;
  });
  return { rows: a, count: lines.length };
}
function tgPasteTracklist(rows, parsed, mode, selIdx) {              // parsed: [{ title, durationMs, section }] -> { rows, matched, added, removed }
  const a = tgClone(rows), P = parsed || [];
  const apply = (r, p) => { r.title = p.title; if (p.durationMs) { r.length = tlFormatTime(p.durationMs); } if (p.section) r.side = p.section; };
  if (mode === 'after') {
    const at = selIdx >= 0 && selIdx < a.length ? selIdx + 1 : a.length, fresh = P.map(p => { const r = tgBlank({ s: 'pasted' }); apply(r, p); return r; });
    a.splice(at, 0, ...fresh); return { rows: a, matched: 0, added: fresh.length, removed: 0 };
  }
  const used = new Set(); let matched = 0, added = 0;
  const find = (p) => { const k = tlKey(p.title); if (!k) return null; return a.find(r => !used.has(r.id) && tlKey(r.title) === k) || null; };
  if (mode === 'replace') {
    const out = P.map(p => { const hit = find(p); if (hit) { used.add(hit.id); matched++; apply(hit, p); return hit; } added++; const r = tgBlank({ s: 'pasted' }); apply(r, p); return r; });
    return { rows: out, matched, added, removed: a.filter(r => !used.has(r.id)).length };
  }
  let last = -1;                                                       // 'update': matching tracks are corrected where they are, the others are added after the one before them, and nothing is removed
  P.forEach(p => {
    const hit = find(p);
    if (hit) { used.add(hit.id); matched++; apply(hit, p); last = a.indexOf(hit); return; }
    added++; const r = tgBlank({ s: 'pasted' }); apply(r, p); a.splice(last + 1, 0, r); used.add(r.id); last = last + 1;
  });
  return { rows: a, matched, added, removed: 0 };
}
// END track-grid

// ---- Track editor: the screen (the rules are in the track-grid block above) ----
const TG_COLS_KEY = 'crate_tg_cols_v1';
const TG_COLS = [
  { id: 'side', label: 'Side', w: '70px', mono: true }, { id: 'title', label: 'Title', w: 'minmax(220px, 1.6fr)' }, { id: 'length', label: 'Length', w: '84px', mono: true },
  { id: 'spotify', label: 'Spotify', w: '190px', link: true }, { id: 'youtube', label: 'YouTube', w: '190px', link: true }, { id: 'soundcloud', label: 'SoundCloud', w: '170px', link: true },
  { id: 'genre', label: 'Genre', w: '150px' }, { id: 'rating', label: 'My rating', w: '104px', kind: 'rating' }, { id: 'rym', label: 'RYM rating \u00b7 count', w: '140px', kind: 'ro' },
  { id: 'listened', label: 'Listened', w: '84px', kind: 'check' }, { id: 'note', label: 'Note', w: '220px' }];
const TG_DEFAULT_COLS = ['side', 'title', 'length', 'spotify', 'youtube', 'genre', 'rating', 'listened', 'note'];
let tg = null;                                                        // the editor in hand (null when closed)
const tgEl = (id) => document.getElementById(id);
function tgCols() { let saved = null; try { saved = JSON.parse(localStorage.getItem(TG_COLS_KEY) || 'null'); } catch (e) { saved = null; } const set = new Set(Array.isArray(saved) ? saved : TG_DEFAULT_COLS); set.add('title'); return TG_COLS.filter(c => set.has(c.id)); }
const tgOrigMap = () => new Map(tg.orig.map(r => [r.id, r]));
const tgPlanNow = () => tgPlan(tg.rows, tg.orig, { isManual: isManualAlbum(tg.item), trackData: tg.item.trackData || {}, minNext: tlMinNext(tg.item) });
async function tgOpen(item) {
  if (!item) return;
  let tracks = []; try { tracks = (await getTracksFor(item)) || []; } catch (e) { tracks = []; }
  const rows = tgRowsFrom(tracks, item.trackData || {});
  tg = { item, orig: tgClone(rows), rows: tgClone(rows), sel: new Set(), anchor: null, past: [], future: [], last: JSON.stringify(rows), busy: false, q: '', menu: false, bulk: { genre: '', rating: '' }, fr: { find: '', repl: '' }, drag: null, waitMatcher: false, paste: null };
  tgEl('trackGridOverlay').hidden = false; tgRender();
  const first = tgEl('tgModal').querySelector('[data-tg="cell"][data-f="title"]'); if (first) first.focus();
}
function tgPush() { tg.past.push(tg.last); if (tg.past.length > 100) tg.past.shift(); tg.future = []; tg.last = JSON.stringify(tg.rows); }
function tgPrune() { const ids = new Set(tg.rows.map(r => r.id)); [...tg.sel].forEach(i => { if (!ids.has(i)) tg.sel.delete(i); }); }
function tgUndo() { if (!tg || !tg.past.length) return; tg.future.push(JSON.stringify(tg.rows)); tg.rows = JSON.parse(tg.past.pop()); tg.last = JSON.stringify(tg.rows); tgPrune(); tgRender(); }
function tgRedo() { if (!tg || !tg.future.length) return; tg.past.push(JSON.stringify(tg.rows)); tg.rows = JSON.parse(tg.future.pop()); tg.last = JSON.stringify(tg.rows); tgPrune(); tgRender(); }
function tgClose(force) {
  if (!tg) { tgEl('trackGridOverlay').hidden = true; return; }
  if (!force) { const n = tgPlanNow().diff.count; if (n > 0 && !confirm(`Discard ${n} unsaved change${n === 1 ? '' : 's'} to the tracks?`)) return; }
  tgEl('trackGridOverlay').hidden = true; tgEl('tgPasteOverlay').hidden = true; tg = null;
}
const tgStars = (v) => Number(v) > 0 ? '\u2605'.repeat(Math.floor(v)) + (v % 1 ? '\u00bd' : '') : '';
function tgCellHtml(r, i, c, om, pmap) {
  const o = om.get(r.id), f = c.id, msg = pmap.get(r.id + '|' + f), dirty = c.kind === 'ro' ? false : (o ? String(r[f]) !== String(o[f]) : (tgHasData(r) && String(r[f]) !== '' && String(r[f]) !== '0' && r[f] !== false));
  const lab = `${c.label}, track ${i + 1}`, da = `data-tg="cell" data-id="${r.id}" data-f="${f}"`;
  if (c.kind === 'check') return `<label class="tg-cell tg-center${dirty ? ' dirty' : ''}"><input type="checkbox" ${da}${r.listened ? ' checked' : ''} aria-label="${lab}"></label>`;
  if (c.kind === 'ro') return `<div class="tg-cell"><span class="tg-ro">${r.rymRating ? Number(r.rymRating).toFixed(2) + ' \u00b7 ' + Number(r.rymVotes || 0).toLocaleString() : '\u2014'}</span></div>`;
  if (c.kind === 'rating') { const opts = ['<option value="0">\u2014</option>'].concat([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => `<option value="${v}"${Number(r.rating) === v ? ' selected' : ''}>${v} \u2605</option>`)).join(''); return `<div class="tg-cell"><select class="tg-in tg-sel${dirty ? ' dirty' : ''}${msg ? ' bad' : ''}" ${da} aria-label="${lab}">${opts}</select></div>`; }
  const ok = c.link && String(r[f]).trim() && !msg;
  return `<div class="tg-cell"><input type="text" class="tg-in${c.mono ? ' mono' : ''}${dirty ? ' dirty' : ''}${msg ? ' bad' : ''}${ok ? ' ok' : ''}" ${da} value="${escapeHtml(r[f])}"${msg ? ` title="${escapeHtml(msg)}" aria-invalid="true"` : ''} aria-label="${lab}"${c.link ? ' placeholder="paste a link"' : ''} autocomplete="off" spellcheck="false"></div>`;
}
function tgRowHtml(r, i, cols, om, pmap) {
  const o = om.get(r.id), anyDirty = o ? TG_FIELDS.some(f => String(r[f]) !== String(o[f])) : tgHasData(r), sel = tg.sel.has(r.id);
  return `<div class="tg-row${sel ? ' sel' : ''}" data-id="${r.id}"><label class="tg-chk"><input type="checkbox" data-tg="sel" data-id="${r.id}"${sel ? ' checked' : ''} aria-label="Select track ${i + 1}"></label>`
    + `<span class="tg-grip" data-tg="grip" data-id="${r.id}" draggable="true" title="Drag to reorder (or Alt+\u2191 / Alt+\u2193)" aria-hidden="true">\u2807</span><span class="tg-num">${anyDirty ? '<i class="tg-dot" title="Changed"></i>' : ''}${i + 1}</span>`
    + cols.map(c => tgCellHtml(r, i, c, om, pmap)).join('') + '</div>';
}
function tgPanelHtml() {
  const n = tg.sel.size; if (!n) return '';
  const sel = tg.rows.filter(r => tg.sel.has(r.id)), names = sel.slice(0, 3).map(r => r.title || 'untitled').join(', ') + (n > 3 ? ` and ${n - 3} more` : '');
  const ratingOpts = ['<option value="">Leave as it is</option>'].concat([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => `<option value="${v}"${String(tg.bulk.rating) === String(v) ? ' selected' : ''}>${v === 0 ? 'No rating' : v + ' \u2605'}</option>`)).join('');
  return `<aside class="tg-panel" aria-label="Change the selected tracks"><div class="tg-panel-h"><div><b>${n} track${n === 1 ? '' : 's'} selected</b><div class="bm-dim tg-names">${escapeHtml(names)}</div></div><button type="button" class="chip-btn" data-tg="clearsel">Clear</button></div>`
    + `<div class="tg-sec"><div class="bm-label">Set for ${n === 1 ? 'this track' : 'all ' + n}</div><div class="tg-two"><label class="tg-f">Genre<input type="text" data-tg="bulk-genre" value="${escapeHtml(tg.bulk.genre)}" placeholder="Leave as it is" autocomplete="off"></label><label class="tg-f">My rating<select data-tg="bulk-rating">${ratingOpts}</select></label></div>`
    + `<div class="tg-btns"><button type="button" class="config-btn" data-tg="bulk-apply">Apply to ${n} track${n === 1 ? '' : 's'}</button><button type="button" class="chip-btn" data-tg="bulk-listen">Mark listened</button><button type="button" class="chip-btn" data-tg="bulk-unlisten">Clear listened</button></div></div>`
    + `<div class="tg-sec"><div class="bm-label">Order and removal</div><div class="tg-btns"><button type="button" class="chip-btn" data-tg="move-up">Move up</button><button type="button" class="chip-btn" data-tg="move-down">Move down</button><button type="button" class="chip-btn" data-tg="delete">Delete ${n}</button></div></div>`
    + `<div class="tg-sec"><div class="bm-label">Links</div><div class="tg-btns"><button type="button" class="chip-btn" data-tg="clear-spotify">Clear Spotify</button><button type="button" class="chip-btn" data-tg="clear-youtube">Clear YouTube</button><button type="button" class="chip-btn" data-tg="clear-soundcloud">Clear SoundCloud</button></div></div>`
    + `<div class="tg-sec"><div class="bm-label">Find and replace in every title</div><div class="tg-two"><label class="tg-f">Find<input type="text" data-tg="fr-find" value="${escapeHtml(tg.fr.find)}" autocomplete="off"></label><label class="tg-f">Replace with<input type="text" data-tg="fr-repl" value="${escapeHtml(tg.fr.repl)}" placeholder="nothing" autocomplete="off"></label></div><div id="tgFrPreview" class="tg-fr"></div><button type="button" class="chip-btn" data-tg="fr-apply" id="tgFrApply">Replace</button></div></aside>`;
}
function tgFrRender() {
  const box = tgEl('tgFrPreview'), btn = tgEl('tgFrApply'); if (!box || !tg) return;
  const r = tgFindReplace(tg.rows, tg.fr.find, tg.fr.repl);
  box.innerHTML = !tg.fr.find ? '' : r.count ? r.examples.map(([a, b]) => `<div><s>${escapeHtml(a)}</s> \u2192 ${escapeHtml(b)}</div>`).join('') + `<div class="bm-m tg-amber">${r.count} title${r.count === 1 ? '' : 's'} will change</div>` : '<div class="bm-dim">No title contains that.</div>';
  btn.textContent = r.count ? `Replace in ${r.count} title${r.count === 1 ? '' : 's'}` : 'Replace'; btn.disabled = !r.count;
}
function tgFootRender() {
  const foot = tgEl('tgFoot'); if (!foot || !tg) return;
  const plan = tgPlanNow(), probs = tgProblems(tg.rows), n = plan.diff.count, idxOf = (id) => tg.rows.findIndex(r => r.id === id) + 1;
  const bits = [n ? `<span class="tg-amber"><i class="tg-dot"></i>${n} change${n === 1 ? '' : 's'} not saved</span>` : '<span class="bm-dim">No changes yet</span>'];
  if (probs.length) bits.push(`<span class="tg-bad" role="alert">${probs.length} problem${probs.length === 1 ? '' : 's'}: track ${idxOf(probs[0].id)}, ${escapeHtml(probs[0].msg)}</span>`);
  const note = plan.convert ? '<div class="bm-dim">Saving a change to titles, lengths, sides or order makes this a tracklist you keep yourself: it stops picking up automatic lookups.</div>' : '<div class="bm-dim">Tab and Enter move between cells \u00b7 Ctrl+V pastes a column \u00b7 Ctrl+D fills down \u00b7 drag \u2807 (or Alt+\u2191 \u2193) to reorder</div>';
  const can = n > 0 && !probs.length && !tg.busy, label = tg.busy ? 'Saving\u2026' : probs.length ? `Fix ${probs.length} problem${probs.length === 1 ? '' : 's'} to save` : n ? `Save ${n} change${n === 1 ? '' : 's'}` : 'Save changes';
  foot.innerHTML = `<div><div class="tg-status">${bits.join('')}</div>${note}</div><span class="tg-foot-btns"><button type="button" class="chip-btn" data-tg="cancel">Cancel</button><button type="button" class="${can ? 'config-btn' : 'chip-btn'}" data-tg="save"${can ? '' : ' disabled'}>${label}</button></span>`;
}
function tgRender() {
  const ov = tgEl('trackGridOverlay'); if (!tg || ov.hidden) return;
  const modal = tgEl('tgModal'), cols = tgCols(), om = tgOrigMap(), pmap = new Map(tgProblems(tg.rows).map(p => [p.id + '|' + p.field, p.msg]));
  const gridEl = modal.querySelector('.tg-grid'), keep = gridEl ? { x: gridEl.scrollLeft, y: gridEl.scrollTop } : null, ae = document.activeElement, act = ae && modal.contains(ae) && ae.dataset && ae.dataset.id && ae.dataset.f ? { id: ae.dataset.id, f: ae.dataset.f } : null;
  const widthPx = 40 + 28 + 52 + cols.reduce((a, c) => a + (parseInt((c.w.match(/\d+/) || [100])[0], 10) || 100), 0), G = '40px 28px 52px ' + cols.map(c => c.w).join(' ');
  const head = `<div class="tg-row tg-th" style="grid-template-columns: ${G}"><label class="tg-chk"><input type="checkbox" data-tg="selall" aria-label="Select every track"${tg.rows.length && tg.rows.every(r => tg.sel.has(r.id)) ? ' checked' : ''}></label><span></span><span class="bm-label tg-pad">#</span>${cols.map(c => `<span class="bm-label tg-pad">${escapeHtml(c.label)}</span>`).join('')}</div>`;
  const body = tg.rows.length ? tg.rows.map((r, i) => tgRowHtml(r, i, cols, om, pmap).replace('class="tg-row', `style="grid-template-columns: ${G}" class="tg-row`)).join('') : `<div class="tg-empty"><p>This release has no tracks yet.</p><p class="bm-dim">Add a track, or paste a tracklist from a website or booklet.</p><button type="button" class="config-btn" data-tg="paste">Paste a tracklist\u2026</button></div>`;
  const menu = tg.menu ? `<div class="tg-menu" role="menu"><div class="bm-label">Columns</div>${TG_COLS.map(c => `<label class="tg-mi"><input type="checkbox" data-tg="col" data-col="${c.id}"${cols.some(x => x.id === c.id) ? ' checked' : ''}${c.id === 'title' ? ' disabled' : ''}> ${escapeHtml(c.label)}</label>`).join('')}</div>` : '';
  const it = tg.item;
  modal.innerHTML = `<div class="arrange-header"><div><h2>Edit tracks</h2><p class="sm-sub">${escapeHtml(it.title)} \u00b7 ${escapeHtml(it.artist)} \u00b7 ${tg.rows.length} track${tg.rows.length === 1 ? '' : 's'}. Everything about each track in one grid; nothing is saved until you press Save.</p></div><button type="button" class="modal-x" data-tg="cancel" aria-label="Close">\u2715</button></div>`
    + `<div class="tg-tool"><div class="tg-tool-l"><button type="button" class="chip-btn" data-tg="add">+ Add track</button><button type="button" class="chip-btn" data-tg="paste">Paste tracklist\u2026</button><button type="button" class="chip-btn" data-tg="match">Match links\u2026</button></div>`
    + `<div class="tg-tool-r"><input type="text" id="tgFind" data-tg="find" value="${escapeHtml(tg.q)}" placeholder="Find in titles\u2026" aria-label="Find in titles" autocomplete="off"><span class="tg-menu-wrap"><button type="button" class="chip-btn" data-tg="cols" aria-expanded="${tg.menu}">Columns \u25be</button>${menu}</span><button type="button" class="chip-btn" data-tg="undo" aria-label="Undo"${tg.past.length ? '' : ' disabled'}>\u21b6 Undo</button><button type="button" class="chip-btn" data-tg="redo" aria-label="Redo"${tg.future.length ? '' : ' disabled'}>\u21b7 Redo</button></div></div>`
    + `<div class="tg-main"><div class="tg-grid"><div class="tg-inner" style="min-width: ${widthPx}px">${head}${body}</div></div>${tgPanelHtml()}</div><div class="tg-foot" id="tgFoot"></div>`;
  const g2 = modal.querySelector('.tg-grid'); if (keep && g2) { g2.scrollLeft = keep.x; g2.scrollTop = keep.y; }
  if (act) { const e2 = modal.querySelector(`[data-tg="cell"][data-id="${act.id}"][data-f="${act.f}"]`); if (e2) e2.focus(); }
  tgApplyFilter(); tgFootRender(); tgFrRender();
}
function tgApplyFilter() { const q = tg ? tg.q.trim().toLowerCase() : ''; tgEl('tgModal').querySelectorAll('.tg-grid .tg-row[data-id]:not(.tg-th)').forEach(el => { const r = tg.rows.find(x => x.id === el.dataset.id); el.hidden = !!q && !(r && String(r.title).toLowerCase().includes(q)); }); }
function tgCellEdited(el) {                                           // a cell was typed in, ticked or chosen: the model follows, and only what depends on it is redrawn
  const r = tg.rows.find(x => x.id === el.dataset.id); if (!r) return; const f = el.dataset.f;
  r[f] = f === 'listened' ? el.checked : f === 'rating' ? Number(el.value) : el.value;
  const om = tgOrigMap(), o = om.get(r.id), dirty = o ? String(r[f]) !== String(o[f]) : tgHasData(r);
  el.classList.toggle('dirty', dirty); const lab = el.closest('label.tg-cell'); if (lab) lab.classList.toggle('dirty', dirty);
  const bad = tgProblems([r]).find(p => p.field === f); el.classList.toggle('bad', !!bad); if (bad) { el.title = bad.msg; el.setAttribute('aria-invalid', 'true'); } else { el.removeAttribute('title'); el.removeAttribute('aria-invalid'); }
  const c = TG_COLS.find(x => x.id === f); if (c && c.link) el.classList.toggle('ok', !!String(r[f]).trim() && !bad);
  const row = el.closest('.tg-row'), num = row && row.querySelector('.tg-num'), any = o ? TG_FIELDS.some(k => String(r[k]) !== String(o[k])) : tgHasData(r);
  if (num) { const dot = num.querySelector('.tg-dot'); if (any && !dot) num.insertAdjacentHTML('afterbegin', '<i class="tg-dot" title="Changed"></i>'); else if (!any && dot) dot.remove(); }
  tgFootRender(); tgFrRender();
}
function tgCloseMenu() { if (!tg || !tg.menu) return; tg.menu = false; const m = tgEl('tgModal'), x = m.querySelector('.tg-menu'); if (x) x.remove(); const b = m.querySelector('[data-tg="cols"]'); if (b) b.setAttribute('aria-expanded', 'false'); }
function tgToolRender() { const m = tgEl('tgModal'), u = m.querySelector('[data-tg="undo"]'), r = m.querySelector('[data-tg="redo"]'); if (u && tg) u.disabled = !tg.past.length; if (r && tg) r.disabled = !tg.future.length; }
function tgFocusCell(id, f) { const e = tgEl('tgModal').querySelector(`[data-tg="cell"][data-id="${id}"][data-f="${f}"]`); if (e) { e.focus(); if (e.select && e.type === 'text') e.select(); } }
function tgVisibleIds() { return [...tgEl('tgModal').querySelectorAll('.tg-grid .tg-row[data-id]:not(.tg-th)')].filter(e => !e.hidden).map(e => e.dataset.id); }
async function tgSave() {
  if (!tg || tg.busy) return;
  const probs = tgProblems(tg.rows); if (probs.length) { flashGlobalToast(`Fix ${probs.length} problem${probs.length === 1 ? '' : 's'} first: ${probs[0].msg}.`); return; }
  const item = tg.item, plan = tgPlanNow(); if (!plan.diff.count) { tgClose(true); return; }
  if (plan.convert && !confirm('Saving these changes makes this tracklist one you keep yourself: it will stop picking up automatic tracklist lookups. Go ahead?')) return;
  tg.busy = true; tgFootRender();
  let manual = null; const payload = { action: 'editAlbum', row: item.row };
  if (plan.needManual) { manual = tlPersist(plan.manualRows, 'lookup'); payload.ManualTracks = JSON.stringify(manual); }
  if (plan.trackData) payload.TrackData = JSON.stringify(plan.trackData);
  try { if (!plan.needManual) { if (!plan.trackData) { tgClose(true); return; } await postUpdate({ row: item.row, trackData: JSON.stringify(plan.trackData) }); } else await postUpdate(payload); }          // ONE request: the tracklist and the track data are saved together or not at all
  catch (err) { tg.busy = false; tgFootRender(); flashGlobalToast('Couldn\u2019t save the tracks: nothing was changed. Try again.'); return; }
  if (manual) { item.manualTracks = manual; item.hasManualTracklist = true; }
  if (plan.trackData) item.trackData = plan.trackData;
  delete state.trackCache[artKey(item)]; refreshLinkFlagsFor(item);
  try { if (activeItem === item) await loadTracklist(item); } catch (e) { /* the deck refreshes next time */ }
  if (state.mainViewMode === 'tracks' || state.mainViewMode === 'albumTracks') applyFiltersSort();
  const n = plan.diff.count; tgClose(true); flashGlobalToast(`Saved ${n} change${n === 1 ? '' : 's'} to the tracks.`);
}
function tgMatch() { if (!tg) return; tg.waitMatcher = true; tgEl('trackGridOverlay').hidden = true; openSongMatcher(tg.item); }
function tgAfterMatcher() {                                           // the song matcher was opened from here and has closed: links it saved appear, except in cells you have edited yourself
  if (!tg || !tg.waitMatcher) return; tg.waitMatcher = false; tgEl('trackGridOverlay').hidden = false;
  const om = tgOrigMap();
  tg.rows.forEach(r => { if (!r.trackNumber) return; const ov = trackLinkOverridesFor(tg.item, r.trackNumber, r.title), b = om.get(r.id); [['spotify', 'spotifyLink'], ['youtube', 'youtubeLink'], ['soundcloud', 'soundcloudLink']].forEach(([f, k]) => { const v = ov[k] || ''; if (b && String(r[f]) === String(b[f])) { r[f] = v; b[f] = v; } }); });
  tg.last = JSON.stringify(tg.rows); tgRender();
}
// ----- pasting a tracklist -----
function tgPasteOpen() { if (!tg) return; tg.paste = { text: '', mode: 'update' }; tgEl('tgPasteOverlay').hidden = false; tgPasteRender(); const t = tgEl('tgPasteText'); if (t) t.focus(); }
function tgPasteRender() {
  const box = tgEl('tgPasteModal'); if (!tg || !tg.paste) return; const P = tg.paste, parsed = tlParseText(P.text), n = parsed.tracks.length;
  const selIdx = tg.rows.findIndex(r => tg.sel.has(r.id)), res = n ? tgPasteTracklist(tg.rows, parsed.tracks, P.mode, selIdx) : null;
  const opt = (v, t, sub) => `<label class="bm-opt${P.mode === v ? ' on' : ''}"><input type="radio" name="tgMode" value="${v}" data-tg="pmode"${P.mode === v ? ' checked' : ''}><span class="bm-opt-t">${t}<small>${sub}</small></span></label>`;
  const prev = parsed.tracks.slice(0, 6).map(t => `<div class="tg-prow"><span class="bm-m">${escapeHtml(t.section || '')}</span><span>${escapeHtml(t.title)}</span><span class="bm-m">${t.durationMs ? tlFormatTime(t.durationMs) : ''}</span></div>`).join('');
  const sel = selIdx >= 0 ? tg.rows[selIdx].title || 'the selected track' : '';
  box.innerHTML = `<div class="arrange-header"><div><h2>Paste a tracklist</h2><p class="sm-sub">From a website, a booklet or a spreadsheet. Nothing changes until you press Apply.</p></div><button type="button" class="modal-x" data-tg="pcancel" aria-label="Close">\u2715</button></div>`
    + `<div class="arrange-body"><label class="tg-f">Pasted text<textarea id="tgPasteText" rows="7" data-tg="ptext" placeholder="A1  Drive My Car  2:28&#10;A2  Norwegian Wood  2:05&#10;\u2026" spellcheck="false">${escapeHtml(P.text)}</textarea></label>`
    + `<p class="bm-dim" role="status">${n ? `${n} track${n === 1 ? '' : 's'} read${parsed.notes.withTimes ? ` \u00b7 ${parsed.notes.withTimes} with lengths` : ''}${parsed.notes.sections ? ` \u00b7 sides found` : ''}${parsed.notes.skipped ? ` \u00b7 ${parsed.notes.skipped} line${parsed.notes.skipped === 1 ? '' : 's'} skipped` : ''}.` : 'Paste the list above; the lines are read as you type.'}</p>${n ? `<div class="tg-prev">${prev}${n > 6 ? `<div class="bm-dim">and ${n - 6} more</div>` : ''}</div>` : ''}`
    + `<div class="bm-opts">${opt('update', 'Update my tracks by title', 'Keeps each track\u2019s links, ratings, notes and ticks. Matching titles are corrected; new ones are added in order; nothing is removed.')}${opt('after', selIdx >= 0 ? `Add after \u201c${escapeHtml(sel)}\u201d` : 'Add at the end', 'For a bonus disc or missing tracks pasted from elsewhere.')}${opt('replace', 'Replace the whole tracklist', 'Tracks that match by title still keep their links and ratings; the rest are removed.')}</div>`
    + `<p class="tg-result" role="status">${res ? `${res.matched} match your tracks by title \u00b7 ${res.added} new${res.removed ? ` \u00b7 ${res.removed} removed` : ''}` : ''}</p></div>`
    + `<div class="tg-foot"><span class="bm-dim">You can undo it in the editor.</span><span class="tg-foot-btns"><button type="button" class="chip-btn" data-tg="pcancel">Cancel</button><button type="button" class="config-btn" data-tg="papply"${n ? '' : ' disabled'}>${n ? `Apply to ${n} track${n === 1 ? '' : 's'}` : 'Apply'}</button></span></div>`;
}
function tgPasteApply() {
  if (!tg || !tg.paste) return; const parsed = tlParseText(tg.paste.text); if (!parsed.tracks.length) return;
  const selIdx = tg.rows.findIndex(r => tg.sel.has(r.id)), res = tgPasteTracklist(tg.rows, parsed.tracks, tg.paste.mode, selIdx);
  if (tg.paste.mode === 'replace' && res.removed && !confirm(`Replace the whole tracklist? ${res.removed} track${res.removed === 1 ? '' : 's'} that aren\u2019t in the pasted list will be removed (you can undo this).`)) return;
  tg.rows = res.rows; tgPrune(); tgPush(); tgEl('tgPasteOverlay').hidden = true; tg.paste = null; tgRender();
  flashGlobalToast(`Pasted: ${res.matched} matched, ${res.added} added${res.removed ? `, ${res.removed} removed` : ''}.`);
}
// ----- events -----
function tgClick(e) {
  if (!tg) return; if (tg.menu && !e.target.closest('.tg-menu-wrap')) tgCloseMenu();          // a click anywhere else closes the Columns menu, and still does what it was aimed at
  const t = e.target.closest('[data-tg]'); if (!t) return;
  const a = t.dataset.tg, sel = [...tg.sel];
  if (['cell', 'bulk-genre', 'bulk-rating', 'fr-find', 'fr-repl', 'find', 'ptext', 'grip'].includes(a)) return;
  if (a === 'cancel') tgClose(); else if (a === 'save') tgSave(); else if (a === 'undo') tgUndo(); else if (a === 'redo') tgRedo();
  else if (a === 'add') { const r = tgBlank(); tg.rows.push(r); tgPush(); tgRender(); tgFocusCell(r.id, 'title'); const g = tgEl('tgModal').querySelector('.tg-grid'); if (g) g.scrollTop = g.scrollHeight; }
  else if (a === 'paste') tgPasteOpen(); else if (a === 'match') tgMatch();
  else if (a === 'cols') { if (tg.menu) tgCloseMenu(); else { tg.menu = true; tgRender(); } }
  else if (a === 'col') { const set = new Set(tgCols().map(c => c.id)); if (t.checked) set.add(t.dataset.col); else set.delete(t.dataset.col); try { localStorage.setItem(TG_COLS_KEY, JSON.stringify([...set])); } catch (x) { /* kept for this visit only */ } tgRender(); const keepFocus = tgEl('tgModal').querySelector(`[data-col="${t.dataset.col}"]`); if (keepFocus) keepFocus.focus(); }
  else if (a === 'sel') { const id = t.dataset.id, vis = tgVisibleIds();
    if (e.shiftKey && tg.anchor && vis.includes(tg.anchor) && vis.includes(id)) { const i = vis.indexOf(tg.anchor), j = vis.indexOf(id); vis.slice(Math.min(i, j), Math.max(i, j) + 1).forEach(x => tg.sel.add(x)); }
    else { if (t.checked) tg.sel.add(id); else tg.sel.delete(id); tg.anchor = id; }
    tgRender(); }
  else if (a === 'selall') { if (t.checked) tgVisibleIds().forEach(x => tg.sel.add(x)); else tg.sel.clear(); tgRender(); }
  else if (a === 'clearsel') { tg.sel.clear(); tgRender(); }
  else if (a === 'bulk-apply') { let rows = tg.rows, did = false; if (tg.bulk.genre !== '') { rows = tgSetMany(rows, sel, 'genre', tg.bulk.genre.trim()); did = true; } if (tg.bulk.rating !== '') { rows = tgSetMany(rows, sel, 'rating', Number(tg.bulk.rating)); did = true; } if (did) { tg.rows = rows; tg.bulk = { genre: '', rating: '' }; tgPush(); tgRender(); } }
  else if (a === 'bulk-listen' || a === 'bulk-unlisten') { tg.rows = tgSetMany(tg.rows, sel, 'listened', a === 'bulk-listen'); tgPush(); tgRender(); }
  else if (a.startsWith('clear-')) { tg.rows = tgSetMany(tg.rows, sel, a.slice(6), ''); tgPush(); tgRender(); }
  else if (a === 'fr-apply') { const r = tgFindReplace(tg.rows, tg.fr.find, tg.fr.repl); if (r.count) { tg.rows = r.rows; tg.fr = { find: '', repl: '' }; tgPush(); tgRender(); } }
  else if (a === 'move-up' || a === 'move-down') { tg.rows = tgMoveRows(tg.rows, sel, a === 'move-up' ? -1 : 1); tgPush(); tgRender(); }
  else if (a === 'delete') { tg.rows = tgDeleteRows(tg.rows, sel); tg.sel.clear(); tgPush(); tgRender(); }
  else if (a === 'pcancel') { tgEl('tgPasteOverlay').hidden = true; tg.paste = null; } else if (a === 'papply') tgPasteApply();
}
function tgInput(e) {
  if (!tg) return; const t = e.target, a = t.dataset && t.dataset.tg; if (!a) return;
  if (a === 'cell' && t.type !== 'checkbox' && t.tagName !== 'SELECT') tgCellEdited(t);
  else if (a === 'find') { tg.q = t.value; tgApplyFilter(); }
  else if (a === 'bulk-genre') tg.bulk.genre = t.value; else if (a === 'fr-find') { tg.fr.find = t.value; tgFrRender(); } else if (a === 'fr-repl') { tg.fr.repl = t.value; tgFrRender(); }
  else if (a === 'ptext') { tg.paste.text = t.value; const pos = t.selectionStart; tgPasteRender(); const n = tgEl('tgPasteText'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* fine */ } } }
}
function tgChange(e) {
  if (!tg) return; const t = e.target, a = t.dataset && t.dataset.tg; if (!a) return;
  if (a === 'cell') { if (t.type === 'checkbox' || t.tagName === 'SELECT') tgCellEdited(t); tgPush(); tgToolRender(); }          // no redraw here: leaving a cell with Tab must carry on into the next one
  else if (a === 'bulk-rating') { tg.bulk.rating = t.value; } else if (a === 'pmode') { tg.paste.mode = t.value; tgPasteRender(); }
}
function tgKey(e) {
  if (!tg) return; const t = e.target;
  if (e.key === 'Escape') return;                                     // (handled for the whole page below, so it works wherever the cursor is)
  if (!(t.dataset && t.dataset.tg === 'cell')) return; const id = t.dataset.id, f = t.dataset.f, ids = tgVisibleIds(), i = ids.indexOf(id);
  if ((e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey && !(t.tagName === 'SELECT')) { e.preventDefault(); const j = i + (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1); if (ids[j]) tgFocusCell(ids[j], f); return; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); tg.rows = tgMoveRows(tg.rows, [id], e.key === 'ArrowUp' ? -1 : 1); tgPush(); tgRender(); tgFocusCell(id, f); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {                       // fill down: the selected tracks take this column's value from the first of them; with none selected, from the track above
    e.preventDefault(); const sel = [...tg.sel];
    if (sel.length > 1) tg.rows = tgFill(tg.rows, sel, f); else { const k = tg.rows.findIndex(r => r.id === id); if (k > 0) tg.rows = tgSetMany(tg.rows, [id], f, tg.rows[k - 1][f]); }
    tgPush(); tgRender(); tgFocusCell(id, f);
  }
}
function tgPaste(e) {
  if (!tg) return; const t = e.target; if (!(t.dataset && t.dataset.tg === 'cell') || t.tagName === 'SELECT' || t.type === 'checkbox') return;
  const text = (e.clipboardData || window.clipboardData).getData('text'); if (!/\n[^\n]/.test(String(text).replace(/\r/g, '').replace(/\n+$/, '\n') + 'x') && !/[^\n]\r?\n[^\r\n]/.test(text)) return;          // one line: the ordinary paste
  e.preventDefault(); const k = tg.rows.findIndex(r => r.id === t.dataset.id), res = tgPasteLines(tg.rows, k, t.dataset.f, text); tg.rows = res.rows; tgPush(); tgRender(); flashGlobalToast(`Pasted ${res.count} lines down the ${(TG_COLS.find(c => c.id === t.dataset.f) || {}).label || 'column'} column.`);
}
(function wireTrackGrid() {
  const ov = tgEl('trackGridOverlay'), po = tgEl('tgPasteOverlay'); if (!ov) return;
  [ov, po].forEach(o => { o.addEventListener('click', tgClick); o.addEventListener('input', tgInput); o.addEventListener('change', tgChange); o.addEventListener('keydown', tgKey); });
  ov.addEventListener('paste', tgPaste);
  ov.addEventListener('dragstart', (e) => { const g = e.target.closest && e.target.closest('[data-tg="grip"]'); if (!g || !tg) return; tg.drag = g.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', g.dataset.id); } catch (x) { /* fine */ } });
  ov.addEventListener('dragover', (e) => { if (!tg || !tg.drag) return; const row = e.target.closest('.tg-row[data-id]'); if (!row) return; e.preventDefault(); ov.querySelectorAll('.tg-row.over').forEach(x => x.classList.remove('over')); row.classList.add('over'); });
  ov.addEventListener('drop', (e) => { if (!tg || !tg.drag) return; const row = e.target.closest('.tg-row[data-id]'); if (!row) return; e.preventDefault(); const to = tg.rows.findIndex(r => r.id === row.dataset.id); tg.rows = tgMoveTo(tg.rows, tg.drag, to); tg.drag = null; tgPush(); tgRender(); });
  ov.addEventListener('dragend', () => { if (tg) tg.drag = null; ov.querySelectorAll('.tg-row.over').forEach(x => x.classList.remove('over')); });
  document.addEventListener('keydown', (e) => {                        // Escape: the paste box first, then the Columns menu, then the editor itself
    if (e.key !== 'Escape' || !tg || tgEl('trackGridOverlay').hidden) return;
    e.preventDefault(); e.stopPropagation();
    if (!tgEl('tgPasteOverlay').hidden) { tgEl('tgPasteOverlay').hidden = true; tg.paste = null; } else if (tg.menu) tgCloseMenu(); else tgClose();
  }, true);
  const btn = tgEl('deckTrackGridBtn'); if (btn) btn.addEventListener('click', () => { if (activeItem) tgOpen(activeItem); });
})();

// "⤓ Load current tracklist" in the Edit modal — swaps the builder's
// default single blank row for the album's actual current tracklist (see
// currentTracklistAsManualRows), so fixing one wrong/missing track doesn't
// mean retyping the whole album by hand. Only wired up for Edit (not Add,
// which has no existing album/tracklist yet to load).
function loadCurrentTracklistIntoBuilder() {
  if (!activeItem) return;
  renderTracklistBuilderRows(el.editTracksRows, currentTracklistAsManualRows(activeItem).map(r => Object.assign({}, r, { s: r.s || 'lookup' })));
}

// "Remove from tracklist" — a track context-menu action available on any
// album (not just already-manual ones). Confirms first since, like the
// existing playlist/folder delete confirmations, this switches the album
// to a manually-maintained tracklist as a side effect.
async function quickRemoveTrackFromTracklist(item, trackNum, trackName) {
  const numTrackNum = trackNum === '' || trackNum === undefined ? null : Number(trackNum);
  if (!confirm(`Remove "${trackName || 'this track'}" from the tracklist? This switches the album to a manually-maintained tracklist \u2014 it\u2019ll stop picking up future automatic tracklist lookups.`)) return;
  const rows = currentTracklistAsManualRows(item).filter(t => !(numTrackNum !== null ? t.trackNumber === numTrackNum : t.title === trackName));
  await saveManualTracklist(item, rows);
}

// Batch version of quickRemoveTrackFromTracklist above, for a multi-track
// selection in a track context menu (flat Tracks table, "Album and
// Tracks" view, or an album's own tracklist). A selection in the flat
// Tracks table can span more than one album, so this groups by album row
// (same pattern as addTracksToEntry above) and rewrites each affected
// album's tracklist exactly once, even if several of its tracks were
// selected together.
async function quickRemoveTracksFromTracklist(trackPlaylistItems) {
  if (!trackPlaylistItems || !trackPlaylistItems.length) return;
  const byRow = new Map();
  for (const t of trackPlaylistItems) {
    if (!byRow.has(t.row)) byRow.set(t.row, []);
    byRow.get(t.row).push(t);
  }
  const albumCount = byRow.size;
  const trackCount = trackPlaylistItems.length;
  const albumWord = albumCount === 1 ? 'the tracklist' : `${albumCount} albums' tracklists`;
  const albumSubject = albumCount === 1 ? 'the album' : 'those albums';
  if (!confirm(`Remove ${trackCount} track${trackCount === 1 ? '' : 's'} from ${albumWord}? This switches ${albumSubject} to a manually-maintained tracklist \u2014 they\u2019ll stop picking up future automatic tracklist lookups.`)) return;

  let removed = 0;
  for (const [row, tracks] of byRow) {
    const owner = (activeItem && activeItem.row === row) ? activeItem : state.raw.find(r => r.row === row);
    if (!owner) continue;
    const toRemove = tracks.map(t => ({
      trackNum: (t.trackNum === '' || t.trackNum === undefined) ? null : Number(t.trackNum),
      trackName: t.trackName
    }));
    const before = currentTracklistAsManualRows(owner);
    const after = before.filter(existing => !toRemove.some(r => (r.trackNum !== null ? existing.trackNumber === r.trackNum : existing.title === r.trackName)));
    removed += before.length - after.length;
    await saveManualTracklist(owner, after);
  }
  flashGlobalToast(`Removed ${removed} track${removed === 1 ? '' : 's'} from ${albumCount === 1 ? 'tracklist' : 'tracklists'}`);
}

async function playPlaylistFromStart(playlist) {
  if (!playlist.items.length) { flashGlobalToast('Nothing to play \u2014 this playlist is empty.'); return; }
  const myId = ++crateQueueId;
  flashGlobalToast(`Loading "${playlist.name}"\u2026`);

  const albums = [...new Map(
    playlist.items.filter(it => it.type !== 'track')
      .map(it => playlistAlbumFor(it))
      .filter(Boolean)
      .map(a => [a.row, a])
  ).values()];
  // getTracksFor() is now guaranteed to resolve (see its own try/catches
  // around mergeTrackLinkOverrides), but this await used to have nothing
  // guarding it at all: one rejection here threw out of this async
  // function with no caller listening for it, leaving the "Loading…"
  // toast on screen forever with the queue never starting. Keep this
  // try/catch as a backstop even so — belt and suspenders.
  try {
    await Promise.all(albums.map(a => getTracksFor(a)));
  } catch (e) {
    console.warn('Playlist play: one or more tracklist lookups failed', e);
  }
  if (myId !== crateQueueId) return; // a different "Play" run (or reset) started while tracklists were loading

  const list = [];
  playlist.items.forEach(it => {
    const album = playlistAlbumFor(it);
    if (!album) return; // album removed from the crate since being added to this playlist
    if (it.type === 'track') {
      list.push({ item: album, track: { trackNumber: it.trackNum, trackName: it.trackName, ...trackLinkOverridesFor(album, it.trackNum, it.trackName) } });
      return;
    }
    (state.trackCache[artKey(album)] || []).forEach(t => list.push({ item: album, track: t }));
  });

  if (!list.length) { flashGlobalToast('Nothing playable in this playlist.'); return; }

  crateQueueList = list;
  crateQueueIndex = -1;
  playCrateQueueIndex(myId, 0);
}
