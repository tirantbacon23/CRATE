// CRATE — layout drag-and-drop (Panels configuration).
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// ---------- Layout drag-and-drop (Panels configuration → layout) ----------
// See LAYOUT_ELEMENTS/state.panelLayout for the data model. Structure
// mirrors MusicBee's own Panels Configuration directly: each panel box
// shows only the elements actually assigned to it (tick to remove,
// "Panel Settings…" per element); "available elements" is a master
// checklist of every element (tick to place, in its first allowed panel;
// untick to remove from wherever it is). Drag still works for reordering
// within a panel and for moving an element to a DIFFERENT one of its own
// allowed panels — checking a box can only ever add to the first, so drag
// is how you reach any other option. Rendered fresh every time the modal
// opens (renderLayoutConfigUI) and after every change.
function layoutPanelRowHtml(key) {
  const def = LAYOUT_ELEMENTS[key];
  return `<div class="layout-panel-row" draggable="true" data-element="${key}">
    <span class="layout-chip-handle" aria-hidden="true">\u283f</span>
    <label class="layout-row-check">
      <input type="checkbox" checked data-element="${key}" class="layout-row-checkbox">
      ${escapeHtml(def.label)}
    </label>
    ${LAYOUT_ELEMENTS_WITH_SETTINGS.has(key) ? `<button type="button" class="config-btn layout-row-configure" data-element="${key}">Panel Settings \u2026</button>` : ''}
  </div>`;
}
function layoutAvailableRowHtml(key, placed) {
  const def = LAYOUT_ELEMENTS[key];
  const panelNames = def.panels.map(p => LAYOUT_PANEL_LABELS[p]).join(', ');
  return `<label class="layout-available-row" draggable="true" data-element="${key}">
    <input type="checkbox" ${placed ? 'checked' : ''} data-element="${key}" class="layout-available-checkbox">
    <span class="layout-available-label">${escapeHtml(def.label)}</span>
    <span class="layout-available-panels">(${escapeHtml(panelNames)})</span>
  </label>`;
}
function renderLayoutConfigUI() {
  if (!el.layoutZoneMain) return;
  const zoneEls = { main: el.layoutZoneMain, right: el.layoutZoneRight, top: el.layoutZoneTop, bottom: el.layoutZoneBottom };
  const placed = new Set();
  ['main', 'right', 'top', 'bottom'].forEach(panel => {
    zoneEls[panel].innerHTML = state.panelLayout[panel].map(key => layoutPanelRowHtml(key)).join('')
      || '<p class="layout-zone-empty">Not displayed \u2014 drag elements here</p>';
    state.panelLayout[panel].forEach(k => placed.add(k));
  });
  el.layoutZoneAvailable.innerHTML = Object.keys(LAYOUT_ELEMENTS)
    .map(key => layoutAvailableRowHtml(key, placed.has(key))).join('');
  el.layoutStackModeStacked.checked = state.panelStackMode !== 'tabs';
  el.layoutStackModeTabs.checked = state.panelStackMode === 'tabs';
}

// Removes an element from wherever it currently lives (a no-op if it isn't
// placed anywhere) — shared by the available-list unchecking it, a panel
// row unchecking it, and (further down) drag-drop's own removal-then-
// reinsert step.
function removeLayoutElement(key) {
  ['main', 'right', 'top', 'bottom'].forEach(p => {
    const idx = state.panelLayout[p].indexOf(key);
    if (idx !== -1) state.panelLayout[p].splice(idx, 1);
  });
}

// Bound once at init (event delegation — the zone containers stay put even
// though their row children are fully regenerated on every change).
let layoutDraggedKey = null;
function initLayoutDragDrop() {
  const panelZones = [el.layoutZoneMain, el.layoutZoneRight, el.layoutZoneTop, el.layoutZoneBottom, el.layoutZoneAvailable];

  panelZones.forEach(zone => {
    zone.addEventListener('dragstart', (e) => {
      const row = e.target.closest('[draggable="true"]');
      if (!row) return;
      layoutDraggedKey = row.dataset.element;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', layoutDraggedKey); // required for Firefox to fire drop at all
      row.classList.add('dragging');
    });
    zone.addEventListener('dragend', () => {
      panelZones.forEach(z => { z.classList.remove('drag-over', 'drag-rejected'); z.querySelectorAll('.dragging').forEach(c => c.classList.remove('dragging')); });
      layoutDraggedKey = null;
    });
    zone.addEventListener('dragover', (e) => {
      if (!layoutDraggedKey) return;
      const targetPanel = zone.dataset.panel;
      const allowed = targetPanel === 'available' || (LAYOUT_ELEMENTS[layoutDraggedKey] && LAYOUT_ELEMENTS[layoutDraggedKey].panels.includes(targetPanel));
      // Not calling preventDefault() when disallowed is what actually makes
      // the browser refuse the drop outright (shown as a "no entry" cursor)
      // — this enforces each element's own panel restriction (e.g. Genre
      // Description can never land in Right Panel) at the source, rather
      // than silently accepting then rejecting it in the drop handler.
      if (!allowed) { zone.classList.add('drag-rejected'); zone.classList.remove('drag-over'); return; }
      e.preventDefault();
      zone.classList.add('drag-over');
      zone.classList.remove('drag-rejected');
    });
    zone.addEventListener('dragleave', (e) => { if (e.target === zone) zone.classList.remove('drag-over', 'drag-rejected'); });
    zone.addEventListener('drop', (e) => {
      if (!layoutDraggedKey) return;
      const targetPanel = zone.dataset.panel;
      const allowed = targetPanel === 'available' || (LAYOUT_ELEMENTS[layoutDraggedKey] && LAYOUT_ELEMENTS[layoutDraggedKey].panels.includes(targetPanel));
      zone.classList.remove('drag-over', 'drag-rejected');
      if (!allowed) return; // dragover already refused this; belt-and-suspenders
      // Player Controls can never land in Available (see its own
      // row-checkbox guard above for why) — dropping it there is treated
      // the same as a disallowed target rather than letting it disappear.
      if (targetPanel === 'available' && layoutDraggedKey === 'playerControls') {
        flashGlobalToast('Player Controls can\u2019t be removed \u2014 drag it between Top and Bottom instead.');
        layoutDraggedKey = null;
        return;
      }
      e.preventDefault();
      const key = layoutDraggedKey;
      removeLayoutElement(key);
      if (targetPanel !== 'available') {
        // Insertion position from cursor Y relative to the OTHER rows
        // already in this zone (excluding the one being dragged, which is
        // still rendered at its old spot mid-drag) — drop above a row's
        // midpoint inserts before it, below inserts after; dropping on
        // empty space below every row just appends to the end.
        const rows = [...zone.querySelectorAll('[draggable="true"]')].filter(c => c.dataset.element !== key);
        let insertIndex = state.panelLayout[targetPanel].length;
        for (let i = 0; i < rows.length; i++) {
          const rect = rows[i].getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) { insertIndex = i; break; }
        }
        state.panelLayout[targetPanel].splice(insertIndex, 0, key);
      }
      layoutDraggedKey = null;
      savePrefs();
      applyPanelLayout();
      renderLayoutConfigUI();
    });
  });

  // Panel-row checkbox (unchecking removes) + "Panel Settings…" button —
  // event delegation, since rows are fully regenerated on every change.
  [el.layoutZoneMain, el.layoutZoneRight, el.layoutZoneTop, el.layoutZoneBottom].forEach(zone => {
    zone.addEventListener('click', (e) => {
      const configBtn = e.target.closest('.layout-row-configure');
      if (configBtn) { openElementConfig(configBtn.dataset.element); return; }
    });
    zone.addEventListener('change', (e) => {
      const checkbox = e.target.closest('.layout-row-checkbox');
      if (!checkbox || checkbox.checked) return; // only unchecking does anything here — it starts out checked, since being in this list means it's placed
      const key = checkbox.dataset.element;
      // Player Controls can never be fully removed — see LAYOUT_ELEMENTS'
      // own comment on why — only repositioned between its two allowed
      // panels via drag. Unchecking its row here would otherwise do
      // exactly that (land it in Available with nowhere to dock at all),
      // so it's re-checked right back and left alone instead.
      if (key === 'playerControls') { checkbox.checked = true; flashGlobalToast('Player Controls can\u2019t be removed \u2014 drag it between Top and Bottom instead.'); return; }
      removeLayoutElement(key);
      savePrefs();
      applyPanelLayout();
      renderLayoutConfigUI();
    });
  });

  // Available list's master checkbox — checking places the element in its
  // FIRST allowed panel (LAYOUT_ELEMENTS[key].panels[0]); drag is how you
  // reach any other allowed panel instead. Unchecking removes it entirely
  // — except Player Controls, which can only move between Top/Bottom, not
  // disappear outright (see its own row-checkbox guard just above).
  el.layoutZoneAvailable.addEventListener('change', (e) => {
    const checkbox = e.target.closest('.layout-available-checkbox');
    if (!checkbox) return;
    const key = checkbox.dataset.element;
    if (key === 'playerControls' && !checkbox.checked) { checkbox.checked = true; flashGlobalToast('Player Controls can\u2019t be removed \u2014 drag it between Top and Bottom instead.'); return; }
    removeLayoutElement(key);
    if (checkbox.checked) state.panelLayout[LAYOUT_ELEMENTS[key].panels[0]].push(key);
    savePrefs();
    applyPanelLayout();
    renderLayoutConfigUI();
  });

  // Global stacked-vs-tabs toggle.
  [el.layoutStackModeStacked, el.layoutStackModeTabs].forEach(radio => {
    radio.addEventListener('change', () => {
      state.panelStackMode = el.layoutStackModeTabs.checked ? 'tabs' : 'stacked';
      savePrefs();
      applyPanelLayout();
    });
  });
}

function renderAddFieldsChecklist() {
  if (!el.addFieldsChecklist) return;
  el.addFieldsChecklist.innerHTML = Object.entries(ADD_FORM_FIELD_OPTIONS).map(([key, label]) => `
    <label class="add-fields-checklist-item">
      <input type="checkbox" data-add-field-key="${key}" ${state.addFormVisibleFields[key] === false ? '' : 'checked'}>
      ${escapeHtml(label)}
    </label>
  `).join('');
  el.addFieldsChecklist.querySelectorAll('input[data-add-field-key]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.addFormVisibleFields[cb.dataset.addFieldKey] = cb.checked;
      savePrefs();
      applyAddFormFieldVisibility();
    });
  });
}

// Shows/hides each field wrapper in the actual "Add a release" form to
// match state.addFormVisibleFields — every wrapper carries a matching
// data-add-field attribute (see the HTML), so this is purely declarative.
// A hidden field's value is left completely alone (still submitted if it
// somehow has one, e.g. from a search prefill) — this only controls
// whether it's shown for editing, not whether it's part of the release.
function applyAddFormFieldVisibility() {
  document.querySelectorAll('#addForm [data-add-field]').forEach(fieldEl => {
    fieldEl.hidden = state.addFormVisibleFields[fieldEl.dataset.addField] === false;
  });
}

function openAddModal() {
  el.addOverlay.hidden = false;
  el.addSearchInput.value = '';
  el.addResults.innerHTML = '';
  el.addForm.hidden = true;
  addSearchSeq++; // invalidate any in-flight search from a previous open
  hideAddSpotifyMatchBanner(); // also invalidates any in-flight Spotify tracklist lookup from a previous open
  el.addSearchInput.focus();
}
function closeAddModal() { el.addOverlay.hidden = true; addMatchSeq++; lfOnAddClosed(); hideAddSpotifyMatchBanner(); el.addSearchHelpPopover.hidden = true; }

let addSearchSeq = 0; // race-condition guard: only the latest search may render its results

// MusicBrainz returns genre info (when it has any) as a "genres" array, and sometimes
// only as a "tags" array instead — both shaped like [{ name, count }, ...]. Take the
// most-voted few and join them into a single display/prefill string.
function extractGenreFromHit(hit) {
  const list = (Array.isArray(hit.genres) && hit.genres.length) ? hit.genres
             : (Array.isArray(hit.tags) ? hit.tags : []);
  if (!list.length) return '';
  return list
    .slice()
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 3)
    .map(g => g.name)
    .filter(Boolean)
    .join(', ');
}

// Builds one clickable "release" row (thumbnail + title/label/year text) from a
// MusicBrainz release resource. Shared by the free-text Add search (doAddSearch)
// and the artist discography's "+ Add" release picker (openAddModalForReleaseGroup)
// so both list pressings/labels/catalog numbers the same way. Clicking the row
// hands the resolved prefill data to showAddForm. `opts` lets callers supply
// fallbacks (artist/type/releaseDate already known from the discography row) for
// whichever fields this particular MusicBrainz release resource leaves blank.
// Add-album search results: list (default, unchanged) vs a Topster-style
// cover-art grid (buildReleaseResultRow branches on state.releaseSearchGridView
// itself). Doesn't re-run the search — just toggles the CSS class on
// whatever's already in el.addResults and updates the two toggle buttons'
// active state; the NEXT search/pressing-lookup render will use the new
// mode for its own markup (already-rendered rows don't retroactively
// change shape until then).
function setReleaseSearchGridView(gridView) {
  state.releaseSearchGridView = gridView;
  savePrefs();
  el.addResultsListBtn.classList.toggle('active', !gridView);
  el.addResultsGridBtn.classList.toggle('active', gridView);
  el.addResults.classList.toggle('add-results-grid-mode', gridView);
}

function buildReleaseResultRow(hit, opts = {}) {
  const gridView = state.releaseSearchGridView;
  const row = document.createElement('div');
  row.className = gridView ? 'add-result-card' : 'add-result-row';
  if (opts.originalIssue) { row.classList.add('add-result-original'); row.title = 'Earliest official pressing'; }   // see earliestPressingIds

  const year = hit.date ? new Date(hit.date).getUTCFullYear() : '';
  const artistName = hit['artist-credit'] ? hit['artist-credit'].map(a => a.name + (a.joinphrase || '')).join('') : (opts.fallbackArtist || 'Unknown Artist');
  // A release can carry more than one label/catalog-number pair (e.g. a
  // joint release on two labels, or a reissue that kept the original cat#
  // alongside a new one) — show every catalog number MusicBrainz has for
  // this release, not just the first, so whichever one you searched by is
  // actually visible in the list instead of silently getting dropped.
  const labelInfoList = Array.isArray(hit['label-info']) ? hit['label-info'] : [];
  const catNos = labelInfoList.map(li => li['catalog-number']).filter(Boolean);
  const catNo = catNos.join(', '); // shown in the row so every cat# on this release is visible
  const catNoForPrefill = catNos[0] || ''; // just the first, for the single-value Catalog No. field
  const labelNames = [...new Set(labelInfoList.map(li => li.label && li.label.name).filter(Boolean))];
  const labelName = labelNames.join(' / ');
  const catStr = catNo ? ` [${catNo}]` : '';
  const genreStr = extractGenreFromHit(hit);
  // Same language-then-country preference as the prefill below, so what you see in the
  // results list matches what lands in the form if you pick it.
  const regionStr = (hit['text-representation'] && hit['text-representation'].language) ? hit['text-representation'].language.toUpperCase() : (hit.country || '');

  const mbid = hit.id;
  const rgId = hit['release-group'] ? hit['release-group'].id : mbid;

  const fallbackImg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjMUIyMTJCIi8+PC9zdmc+";

  // Grid mode (⚙-style toggle above the results, see setReleaseSearchGridView)
  // is a cover-art-forward pick-by-eye layout, closer to Topster's "Add
  // Items" grid — big thumbnail, minimal text underneath, no label/catalog/
  // region detail (that's still all in prefillData and lands in the form
  // once picked, same as list mode — grid mode just doesn't show it up
  // front). List mode (default) is unchanged.
  if (gridView) {
    row.innerHTML = `
      <img src="${fallbackImg}" alt="" class="add-thumb-grid" style="transition: opacity 0.2s ease;">
      <p class="add-result-card-title">${escapeHtml(hit.title || '')}${dupChipHtml(artistName, hit.title || '', catNoForPrefill, hit.date || '')}</p>
      <p class="add-result-card-sub">${escapeHtml(artistName)}${year ? ' \u00b7 ' + year : ''}</p>
    `;
  } else {
    row.innerHTML = `
      <img src="${fallbackImg}" alt="" class="add-thumb" style="transition: opacity 0.2s ease;">
      <div class="add-result-text">
        <p class="add-result-title">${escapeHtml(hit.title || '')} <span style="color:var(--text-dim);font-weight:normal;">${escapeHtml(catStr)}</span>${dupChipHtml(artistName, hit.title || '', catNoForPrefill, hit.date || '')}</p>
        <p class="add-result-artist">${escapeHtml(artistName)}<span class="add-result-year">${year ? ' · ' + year : ''}</span>${labelName ? ' · ' + escapeHtml(labelName) : ''}${genreStr ? ' · ' + escapeHtml(genreStr) : ''}${regionStr ? ' · ' + escapeHtml(regionStr) : ''}</p>
      </div>`;
  }

  const prefillData = {
    artist: artistName,
    title: hit.title || (opts.fallbackTitle || ''),
    type: hit['release-group']?.['primary-type'] === 'Album' ? 'Album' : (hit['release-group']?.['primary-type'] || opts.fallbackType || 'Album'),
    releaseDate: hit.date ? hit.date.slice(0, 10) : (opts.fallbackReleaseDate || ''),
    genre: genreStr,
    label: labelName,
    catalog: catNoForPrefill,
    // MusicBrainz exposes both the release's text/language and its country —
    // prefer the language of the packaging/liner text when it's known, since
    // that's the more useful "this one's in Japanese" signal; fall back to
    // the release country otherwise. Either way it's just a starting point —
    // the user can edit it in the form.
    region: regionStr,
    link: `https://musicbrainz.org/release/${mbid}`,
    cover: '' // Leaves blank initially so iTunes can fallback if CAA fails entirely
  };

  row.addEventListener('click', () => {
    // From a general free-text search, one query can't reliably surface every
    // pressing of an album (MusicBrainz's relevance ranking may only return
    // one or two hits for it among unrelated matches) — so drill into a
    // proper release-group-scoped lookup instead of trusting this single hit.
    if (opts.drillToPressings && rgId) {
      openPressingPickerForResult(rgId, prefillData);
    } else {
      showAddForm(prefillData);
    }
  });

  // Fetch the CAA JSON in the background to find the exact image URL
  resolveCoverArt(mbid, rgId).then(artUrls => {
    if (artUrls) {
      const imgEl = row.querySelector('img');
      imgEl.style.opacity = '0';
      setTimeout(() => {
        imgEl.src = artUrls.thumb;
        imgEl.style.opacity = '1';
      }, 150);
      prefillData.cover = artUrls.large; // Injects the resolved URL before you hit Save!
    }
  }).catch(() => {});   // cover art is a best-effort extra on a result row — never worth an unhandled rejection

  // 1.29.1 — This specific *release* resource frequently has no `date` of
  // its own (only the release-group's first-release-date is reliably
  // present on MusicBrainz) — that's why Release date "doesn't always get
  // added" when adding an album: hit.date is blank, opts.fallbackReleaseDate
  // is usually blank too (doAddSearch's free-text results don't pass one),
  // and prefillData.releaseDate above ends up '' with nothing left to fall
  // back on. Same background-fill pattern as the cover art fetch just above
  // — look up the release-group's first-release-date and inject it into
  // prefillData (and the visible year in the row) once it resolves, rather
  // than leaving the date silently blank.
  if (!prefillData.releaseDate && rgId) {
    resolveReleaseGroupFirstDate(rgId).then(date => {
      if (!date) return;
      prefillData.releaseDate = date;
      const yearSpan = row.querySelector('.add-result-year');
      if (yearSpan && !yearSpan.textContent) yearSpan.textContent = ' · ' + new Date(date).getUTCFullYear();
    }).catch(() => {});   // same: a best-effort fill
  }

  return row;
}

// Browses MusicBrainz for every *release* (specific pressing — vinyl/CD/label/
// catalog-number/country) that belongs to a given release-group (the "album" as
// listed in the Artist tab's discography). inc=labels is what makes label-info
// (label name + catalog number) show up on each hit; inc=genres+tags matches
// what doAddSearch already asks for so the row rendering has the same fields
// to work with either way.
async function fetchReleasesForReleaseGroup(rgId) {
  const res = await mbFetch(`https://musicbrainz.org/ws/2/release?release-group=${rgId}&inc=labels+genres+tags&fmt=json&limit=100`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'CRATEMusicLog/1.0'
    }
  });
  if (!res.ok) throw new Error(`MusicBrainz release lookup failed: ${res.status}`);
  const data = await res.json();
  return data.releases || [];
}

// Opens the Add-album modal for a discography entry and, if we have a
// release-group id for it, looks up and lists the specific releases
// MusicBrainz has under that release-group — different labels, catalog
// numbers, countries, reissues — so the right pressing can be picked instead
// of always landing on whichever one a generic text search happens to surface
// first. Falls back straight to the form (with the basic info already known
// from the discography row) if there's no id to look up, the lookup comes
// back empty, or it fails outright.
function openAddModalForReleaseGroup(basic) {
  el.addOverlay.hidden = false;
  el.addForm.hidden = true;
  el.addSearchInput.value = '';
  el.addResults.innerHTML = '';
  addSearchSeq++; // invalidate any in-flight search/lookup from a previous open
  const mySeq = addSearchSeq;

  if (!basic.rgId) {
    showAddForm(basic);
    return;
  }

  el.addResults.innerHTML = '<p class="tracklist-status">Looking up available pressings…</p>';

  fetchReleasesForReleaseGroup(basic.rgId).then(releases => {
    if (mySeq !== addSearchSeq) return; // superseded by a newer open/search — drop this stale response
    renderReleasePickerResults(releases, basic);
  }).catch(err => {
    if (mySeq !== addSearchSeq) return;
    console.error('MusicBrainz release-group lookup failed:', err);
    el.addResults.innerHTML = '<p class="tracklist-status">Couldn\u2019t look up pressings — using the info already on hand.</p>';
    showAddForm(basic);
  });
}

// Which pressings of a release are its ORIGINAL issue — the earliest OFFICIAL ones — so the picker can set
// them in bold (the list is deliberately most-recent-first, which leaves the original at the bottom of a
// long one). Returns a Set of release ids, empty whenever bold wouldn't tell anything apart:
//  - MusicBrainz dates are partial ('1970', '1970-03', '1970-03-12'); a missing month/day counts as the
//    start of the period so they sort chronologically ('1970' ties with '1970-01-01').
//  - Only Official pressings are candidates when there are any (a bootleg or promo that predates the real
//    release isn't the original issue); a release with no status counts as official. If NOTHING is
//    official (a list of bootlegs) the dated ones compete instead.
//  - Pressings with no date can't be compared, so they never win — and fewer than two dated ones means
//    "earliest" would be a claim about nothing, so none is marked.
//  - Pressings tied for the earliest date are ALL marked (a simultaneous UK/US release has no single
//    original) — unless every candidate ties, when marking all of them says nothing either.
function pressingDateKey(d) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || ''));
  return m ? `${m[1]}-${m[2] || '01'}-${m[3] || '01'}` : null;
}
function earliestPressingIds(releases) {
  const dated = (releases || []).map(r => ({ id: r.id, status: r.status, key: pressingDateKey(r.date) })).filter(x => x.key);
  const official = dated.filter(x => !x.status || x.status === 'Official');
  const pool = official.length ? official : dated;
  if (pool.length < 2) return new Set();
  const first = pool.reduce((m, x) => (x.key < m ? x.key : m), pool[0].key);
  const earliest = pool.filter(x => x.key === first);
  return earliest.length === pool.length ? new Set() : new Set(earliest.map(x => x.id));
}

// Renders the list of specific releases (one row per label/pressing) found
// under a release-group, each clickable via buildReleaseResultRow. Always
// ends with a fallback link so there's always a way through even when
// MusicBrainz doesn't have per-release detail for this particular album.
function renderReleasePickerResults(releases, basic) {
  el.addResults.classList.toggle('add-results-grid-mode', state.releaseSearchGridView);
  el.addResults.innerHTML = '';

  if (!releases.length) {
    el.addResults.innerHTML = '<p class="tracklist-status">No specific pressings found on MusicBrainz for this release.</p>';
  } else {
    // Most-recent-first tends to surface the widely-available pressing/reissue
    // before obscure regional ones, without hiding any of them.
    const originals = earliestPressingIds(releases);
    if (originals.size) {
      const key = document.createElement('p');
      key.className = 'tracklist-status add-pressing-key';
      key.textContent = originals.size === 1 ? 'Bold: the earliest official pressing' : 'Bold: the earliest official pressings';
      el.addResults.appendChild(key);
    }
    releases.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(hit => {
      el.addResults.appendChild(buildReleaseResultRow(hit, {
        fallbackArtist: basic.artist,
        fallbackTitle: basic.title,
        fallbackType: basic.type,
        fallbackReleaseDate: basic.releaseDate,
        originalIssue: originals.has(hit.id)
      }));
    });
  }

  const manualBtn = document.createElement('button');
  manualBtn.type = 'button';
  manualBtn.className = 'add-manual-link';
  manualBtn.textContent = releases.length ? "None of these? Use basic info instead" : 'Use basic info from discography';
  manualBtn.addEventListener('click', () => showAddForm(basic));
  el.addResults.appendChild(manualBtn);
}

// Looks up every release under a release-group and shows the pressing picker,
// used when a general-search result is clicked (see drillToPressings in
// buildReleaseResultRow) — the free-text search that found this one hit isn't
// scoped to its release-group, so it can't be trusted to have surfaced every
// pressing/label on its own; this re-queries MusicBrainz properly scoped to
// the release-group so it does.
async function openPressingPickerForResult(rgId, basic) {
  el.addResults.innerHTML = '<p class="tracklist-status">Looking up available pressings…</p>';
  addSearchSeq++; // invalidate any in-flight search/lookup from before this click
  const mySeq = addSearchSeq;
  try {
    const releases = await fetchReleasesForReleaseGroup(rgId);
    if (mySeq !== addSearchSeq) return; // superseded by a newer open/search/click
    renderReleasePickerResults(releases, basic);
  } catch (err) {
    if (mySeq !== addSearchSeq) return;
    console.error('MusicBrainz release-group lookup failed:', err);
    el.addResults.innerHTML = '<p class="tracklist-status">Couldn\u2019t look up pressings — using the info already on hand.</p>';
    showAddForm(basic);
  }
}

// Opens the Add-album modal for "add as Album" off a currently-playing Spotify
// track (mini player's now-playing menu). We only have Spotify's artist/album
// names to go on here — no MusicBrainz release-group id like the Artist tab's
// discography rows already have — so first resolve one with a quick release
// search, then hand off to the same fetchReleasesForReleaseGroup + release-
// picker flow openAddModalForReleaseGroup uses, so the different pressings
// (and therefore labels/catalog numbers) for this album can be picked from
// instead of landing on a form with the label left blank.
async function openAddModalForTrackAlbum(track) {
  const basic = crateAlbumPrefillFromTrack(track);
  el.addOverlay.hidden = false;
  el.addForm.hidden = true;
  el.addSearchInput.value = '';
  el.addResults.innerHTML = '<p class="tracklist-status">Looking up available pressings…</p>';
  addSearchSeq++; // invalidate any in-flight search/lookup from a previous open
  const mySeq = addSearchSeq;

  if (!basic.artist || !basic.title) {
    showAddForm(basic);
    return;
  }

  try {
    const cleanArtist = basic.artist.replace(/["\\]/g, '');
    const cleanTitle = basic.title.replace(/["\\]/g, '');
    const termUrl = encodeURIComponent(`artist:"${cleanArtist}" AND release:"${cleanTitle}"`);
    const res = await mbFetch(`https://musicbrainz.org/ws/2/release/?query=${termUrl}&fmt=json&limit=1`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }
    });
    if (mySeq !== addSearchSeq) return; // superseded by a newer open/search
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const top = (data.releases || [])[0];
    const rgId = top && top['release-group'] ? top['release-group'].id : null;

    if (!rgId) {
      el.addResults.innerHTML = '<p class="tracklist-status">No specific pressings found on MusicBrainz for this release.</p>';
      showAddForm(basic);
      return;
    }

    const releases = await fetchReleasesForReleaseGroup(rgId);
    if (mySeq !== addSearchSeq) return;
    renderReleasePickerResults(releases, basic);
  } catch (err) {
    if (mySeq !== addSearchSeq) return;
    console.error('MusicBrainz lookup failed for now-playing track album:', err);
    el.addResults.innerHTML = '<p class="tracklist-status">Couldn\u2019t look up pressings — using the info already on hand.</p>';
    showAddForm(basic);
  }
}

// Field-aware query builder for the "Add Album" MusicBrainz search
// (doAddSearch/#addSearchInput) — a sibling to the crate's own internal
// advanced search (tokenizeSearchQuery et al.), reusing the exact same
// field:value / -word / "quoted phrase" syntax, but translated into real
// MusicBrainz Lucene field names instead of Crate's own record shape.
const MB_ADD_SEARCH_FIELD_ALIASES = {
  artist: 'artist',
  title: 'release', album: 'release', release: 'release',
  year: 'date', date: 'date',
  catalog: 'catno', catno: 'catno', cat: 'catno',
  label: 'label',
  format: 'format',
  country: 'country',
  type: 'primarytype', primarytype: 'primarytype',
  barcode: 'barcode',
  status: 'status'
};

function mbQuoteIfNeeded(v) {
  return /\s/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function buildMbSearchQuery(q) {
  const tokens = tokenizeSearchQuery(q);
  const clauses = [];
  const freeWords = [];

  tokens.forEach(t => {
    const mbField = t.field && MB_ADD_SEARCH_FIELD_ALIASES[t.field.toLowerCase()];
    if (mbField) {
      let clause;
      if (mbField === 'date') {
        // Supports the same "2020-2022" range shorthand as the crate's own
        // search, turned into a real Lucene date range MB understands.
        const range = t.value.match(/^(\d{4})-(\d{4})$/);
        clause = range ? `date:[${range[1]}-01-01 TO ${range[2]}-12-31]` : `date:${t.value}`;
      } else {
        clause = `${mbField}:${mbQuoteIfNeeded(t.value)}`;
      }
      clauses.push(t.negate ? `NOT ${clause}` : clause);
      return;
    }
    // No recognized field prefix. A bare 4-digit year still gets pulled out
    // into its own date: clause automatically (the original fix this
    // replaces) — MB's default search field for /release is the release
    // title, which essentially never contains a literal year, so leaving
    // it as plain text mostly just fails to match anything.
    if (!t.field && !t.negate && /^(19|20)\d{2}$/.test(t.value)) {
      clauses.push(`date:${t.value}`);
      return;
    }
    // Genuinely unrecognized "field:" prefix (typo, or not a real field) —
    // fold the whole thing back into free text literally rather than
    // silently dropping it.
    const word = t.field ? `${t.field}:${t.value}` : t.value;
    freeWords.push((t.negate ? 'NOT ' : '') + escapeLuceneTerm(word));
  });

  if (freeWords.length) clauses.push(`(${freeWords.join(' AND ')})`);
  return clauses.join(' AND ');
}

async function doAddSearch() {
  const q = el.addSearchInput.value.trim();
  if (!q) return;
  const mySeq = ++addSearchSeq;
  el.addResults.innerHTML = '<p class="tracklist-status">Searching MusicBrainz…</p>';
  el.addForm.hidden = true;

  try {
    // The catno clause deliberately still searches the FULL original query
    // (untouched by any field-extraction above) rather than the parsed
    // clauses — a catalog number can itself contain a 4-digit run (e.g.
    // "CRT-2022") or look like a field prefix, and this OR-fallback exists
    // specifically so a bare catalog number typed with no "catno:" prefix
    // at all still matches.
    const catnoSafe = q.replace(/["\\]/g, '\\$&');
    const mainClause = buildMbSearchQuery(q);
    const termUrl = encodeURIComponent(`(${mainClause}) OR catno:"${catnoSafe}"`);

    // MusicBrainz API (Requires a User-Agent to avoid getting blocked)
    // inc=labels+genres+tags: labels is what makes label-info (label name +
    // catalog number) come back on each hit — without it every row here
    // would show a blank catalog number regardless of what you searched by,
    // since buildReleaseResultRow has nothing to read it from. genres+tags
    // is so we can show/prefill genre without a separate lookup per result.
    const res = await mbFetch(`https://musicbrainz.org/ws/2/release/?query=${termUrl}&fmt=json&limit=12&inc=labels+genres+tags`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CRATEMusicLog/1.0'
      }
    });
    // Surface a bad/malformed-query response as a real error instead of
    // letting res.json() throw a confusing JSON-parse error on whatever
    // MusicBrainz's error body actually looks like.
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    if (mySeq !== addSearchSeq) return; // a newer keystroke already kicked off another search — drop this stale response
    const hits = data.releases || [];

    el.addResults.classList.toggle('add-results-grid-mode', state.releaseSearchGridView);
    el.addResults.innerHTML = '';
    if (!hits.length) {
      el.addResults.innerHTML = '<p class="tracklist-status">No matches found.</p>';
    } else {
      hits.forEach(hit => el.addResults.appendChild(buildReleaseResultRow(hit, { drillToPressings: true })));
    }

    const manualBtn = document.createElement('button');
    manualBtn.type = 'button';
    manualBtn.className = 'add-manual-link';
    manualBtn.textContent = hits.length ? "Can't find it? Enter manually" : 'Enter it manually';
    manualBtn.addEventListener('click', () => showAddForm({ title: q }));
    el.addResults.appendChild(manualBtn);

  } catch (err) {
    if (mySeq !== addSearchSeq) return; // superseded by a newer search — don't clobber its results
    console.error("MusicBrainz Error:", err);
    el.addResults.innerHTML = '<p class="tracklist-status">Search failed — try again, or enter it manually below.</p>';
    const manualBtn = document.createElement('button');
    manualBtn.type = 'button';
    manualBtn.className = 'add-manual-link';
    manualBtn.textContent = 'Enter it manually';
    manualBtn.addEventListener('click', () => showAddForm({ title: q }));
    el.addResults.appendChild(manualBtn);
  }
}
