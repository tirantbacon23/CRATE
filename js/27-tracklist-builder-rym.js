// CRATE — tracklist builder, RYM add-on inbox and updates, the update queue, Processing.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Tracklist builder (Add/Edit forms) ----------
   A small, dependency-free row editor for manually typing in an album's
   tracklist plus an optional YouTube link per track — used when an album
   has no iTunes/MusicBrainz match to auto-fetch a tracklist from. Shared
   between #addTracksRows and #editTracksRows via the container param.
   Saved as manualTracks: [{trackNumber, title, youtubeLink}] — see
   collectTracklistBuilderRows() / renderTracklistBuilderRows() and the
   ManualTracks column comment in fetchCatalog().
   (A per-row checkbox + "Select all"/"Delete selected" batch-delete UI
   was tried here in 1.29.3 and pulled back out in 1.29.6 — it made this
   already-dense form feel too cluttered. Batch-deleting several tracks at
   once is still available from the release's own Tracks view: select
   multiple rows there and right-click → Remove from tracklist.) */
// BEGIN tl-ui
// ---- the tracklist editor (Add form, Edit form, and the deck's "+ Add track"): rows you can paste, drag, insert, time, and give headings to ----
// Saved (manualTracks): [{ trackNumber, title, youtubeLink, spotifyLink, durationMs?, section?, s, at? }]. s = where the list came from (typed, pasted, spotify,
// musicbrainz, itunes, lookup); at = the date it was last saved here. Every field after spotifyLink is optional, so older lists still read.
function tlC(side) { return side === 'add' ? el.addTracksRows : el.editTracksRows; }
function tlTools(side) { return document.getElementById(side + 'TlTools'); }
function tlMinNext(item) { return item && item.trackData ? Math.max(0, ...Object.keys(item.trackData).map(Number).filter(n => isFinite(n))) : 0; }
function tlSideMinNext(side) { return side === 'edit' && activeItem ? tlMinNext(activeItem) : 0; }
function tlTrackRows(c) { return [...c.querySelectorAll('.tracklist-builder-row')]; }
function tlStatus(side, html) { const b = tlTools(side); if (!b) return; const s = b.querySelector('.tl-status'); s.hidden = !html; s.innerHTML = html || ''; }
function tlRefreshRowLinks(row) { if (!row) return; const has = !!(row.querySelector('.tracklist-builder-yt').value.trim() || row.querySelector('.tracklist-builder-sp').value.trim()); row.querySelector('.tracklist-builder-links-toggle').classList.toggle('has-links', has); }
function tlExpandLinks(row, open) { if (!row) return; const box = row.querySelector('.tracklist-builder-links'), t = row.querySelector('.tracklist-builder-links-toggle'); box.hidden = !open; t.setAttribute('aria-expanded', open ? 'true' : 'false'); }
function tlPersist(rows, defaultSource) {                         // what is written to the sheet: only what has a value, each track tagged with where it came from, the first with the date
  const today = new Date().toISOString().slice(0, 10);
  return (rows || []).map((t, i) => {
    const o = { trackNumber: t.trackNumber, title: t.title, youtubeLink: t.youtubeLink || '', spotifyLink: t.spotifyLink || '' };
    if (t.durationMs > 0) o.durationMs = Math.round(t.durationMs);
    if (t.section) o.section = t.section;
    o.s = t.s || defaultSource || 'typed'; if (i === 0) o.at = today;
    return o;
  });
}
function tracklistBuilderRowHtml(track, idx) {
  const t = track || {}, ms = t.durationMs || 0;
  return `
    <div class="tracklist-builder-row" data-idx="${idx}" data-track-number="${t.trackNumber ?? ''}" data-duration-ms="${ms || ''}" data-source="${escapeHtml(t.s || '')}" data-rym-rating="${t.rymRating ? escapeHtml(String(t.rymRating)) : ''}" data-rym-votes="${t.rymVotes ? escapeHtml(String(t.rymVotes)) : ''}">
      <span class="tracklist-builder-handle" draggable="true" title="Drag to move this track" aria-hidden="true">\u2807</span>
      <span class="tracklist-builder-num">${idx + 1}</span>
      <input type="text" class="tracklist-builder-title" placeholder="Track title" value="${escapeHtml(t.title || '')}">
      <input type="text" class="tracklist-builder-time" inputmode="numeric" placeholder="0:00" aria-label="Length, minutes and seconds" value="${escapeHtml(tlFormatTime(ms))}">
      <span class="tracklist-builder-tools">
        <button type="button" class="tracklist-builder-up" aria-label="Move up" title="Move up">\u2191</button>
        <button type="button" class="tracklist-builder-down" aria-label="Move down" title="Move down">\u2193</button>
        <button type="button" class="tracklist-builder-links-toggle${(t.youtubeLink || t.spotifyLink) ? ' has-links' : ''}" aria-expanded="false" title="YouTube and Spotify links for this track">Links</button>
        <button type="button" class="tracklist-builder-insert" aria-label="Insert a track below" title="Insert a track below">+</button>
        <button type="button" class="tracklist-builder-remove" aria-label="Remove track" title="Remove track">\u2715</button>
      </span>
      <div class="tracklist-builder-links" hidden>
        <div class="tracklist-builder-link-group">
          <input type="text" class="tracklist-builder-yt" placeholder="YouTube link (optional)" value="${escapeHtml(t.youtubeLink || '')}">
          <button type="button" class="tracklist-builder-match-btn" data-match-kind="youtube" title="Find a YouTube match for this track" aria-label="Find a YouTube match for this track">Match</button>
        </div>
        <div class="tracklist-builder-link-group">
          <input type="text" class="tracklist-builder-sp" placeholder="Spotify link (optional)" value="${escapeHtml(t.spotifyLink || '')}">
          <button type="button" class="tracklist-builder-match-btn" data-match-kind="spotify" title="Find a Spotify match for this track" aria-label="Find a Spotify match for this track">Match</button>
        </div>
      </div>
      <div class="tracklist-builder-match-panel" hidden></div>
    </div>
  `;
}
function tracklistBuilderSectionHtml(label) {
  return `
    <div class="tracklist-builder-section">
      <span class="tracklist-builder-handle" draggable="true" title="Drag to move this heading" aria-hidden="true">\u2807</span>
      <input type="text" class="tracklist-builder-section-title" placeholder="Heading: Disc 2, Side B, Bonus tracks…" aria-label="Heading" value="${escapeHtml(label || '')}">
      <span class="tracklist-builder-tools">
        <button type="button" class="tracklist-builder-up" aria-label="Move heading up" title="Move up">\u2191</button>
        <button type="button" class="tracklist-builder-down" aria-label="Move heading down" title="Move down">\u2193</button>
        <button type="button" class="tracklist-builder-section-remove" aria-label="Remove heading" title="Remove heading">\u2715</button>
      </span>
    </div>
  `;
}
function renderTracklistBuilderRows(container, tracks) {
  const list = (tracks && tracks.length) ? tracks : [{}]; // always start with at least one blank row
  let html = '', section = '', pos = 0;
  list.forEach(t => {
    const sec = (t && t.section) || '';
    if (sec !== section) { html += tracklistBuilderSectionHtml(sec); section = sec; }                 // a heading wherever the section changes
    html += tracklistBuilderRowHtml(t, pos++);
  });
  container.innerHTML = html;
}
function renumberTracklistBuilderRows(container) {                // the visible 1, 2, 3 is the POSITION (a track's number, its identity, is kept apart in data-track-number)
  tlTrackRows(container).forEach((row, i) => { row.dataset.idx = i; row.querySelector('.tracklist-builder-num').textContent = i + 1; });
}
function addTracklistBuilderRow(container, afterNode, track) {
  const html = tracklistBuilderRowHtml(track || {}, tlTrackRows(container).length);
  if (afterNode) afterNode.insertAdjacentHTML('afterend', html); else container.insertAdjacentHTML('beforeend', html);
  renumberTracklistBuilderRows(container);
  return afterNode ? afterNode.nextElementSibling : container.lastElementChild;
}
// A row carried over from an existing tracklist keeps its original track number (data-track-number), so any rating/note/genre/link saved against it
// via trackData stays attached to the right track however rows are added, removed or reordered. A brand-new row gets the next number nobody has used:
// past every number in the rows and (opts.minNext) every number the album still holds data for, so it can never inherit a deleted track's data.
function collectTracklistBuilderRows(container, opts) {
  const rows = []; let section = '';
  [...container.children].forEach(node => {
    if (node.classList.contains('tracklist-builder-section')) { section = node.querySelector('.tracklist-builder-section-title').value.trim(); return; }
    if (!node.classList.contains('tracklist-builder-row')) return;
    const title = node.querySelector('.tracklist-builder-title').value.trim(); if (!title) return;   // drop rows nobody filled in
    rows.push({ trackNumber: node.dataset.trackNumber ? Number(node.dataset.trackNumber) : null, title, youtubeLink: node.querySelector('.tracklist-builder-yt').value.trim(), spotifyLink: node.querySelector('.tracklist-builder-sp').value.trim(),
      durationMs: Number(node.dataset.durationMs) || 0, section, s: node.dataset.source || '', rymRating: Number(node.dataset.rymRating) || 0, rymVotes: Number(node.dataset.rymVotes) || 0 });
  });
  let nextNum = Math.max((opts && opts.minNext) || 0, ...rows.map(t => t.trackNumber || 0), 0) + 1;
  return rows.map(t => t.trackNumber ? t : { ...t, trackNumber: nextNum++ });
}
function tlFillRow(row, t) {
  row.querySelector('.tracklist-builder-title').value = t.title || ''; row.dataset.durationMs = t.durationMs || ''; row.querySelector('.tracklist-builder-time').value = tlFormatTime(t.durationMs); row.dataset.source = t.s || ''; row.dataset.rymRating = t.rymRating || ''; row.dataset.rymVotes = t.rymVotes || '';
}
function tlInsertParsed(c, row, text) {                          // text pasted straight into a title box: one row each, from this row on
  const parsed = tlParseText(text); if (!parsed.tracks.length) return false;
  let after = row;
  parsed.tracks.forEach((t, i) => {
    const tr = Object.assign({}, t, { s: 'pasted' });
    if (i === 0 && !row.querySelector('.tracklist-builder-title').value.trim()) tlFillRow(row, tr);
    else { after.insertAdjacentHTML('afterend', tracklistBuilderRowHtml(tr, 0)); after = after.nextElementSibling; }
  });
  renumberTracklistBuilderRows(c); after.querySelector('.tracklist-builder-title').focus(); return true;
}
function wireTracklistBuilderContainer(container, getArtist) {
  container.addEventListener('click', (e) => {
    const node = e.target.closest('.tracklist-builder-row, .tracklist-builder-section');
    const removeBtn = e.target.closest('.tracklist-builder-remove');
    if (removeBtn) {
      if (tlTrackRows(container).length <= 1) { // keep at least one row so the section never looks broken/empty
        node.querySelectorAll('input').forEach(i => i.value = ''); node.dataset.durationMs = ''; tlRefreshRowLinks(node); return;
      }
      node.remove(); renumberTracklistBuilderRows(container); return;
    }
    if (e.target.closest('.tracklist-builder-section-remove')) { node.remove(); renumberTracklistBuilderRows(container); return; }
    if (e.target.closest('.tracklist-builder-up')) { const p = node.previousElementSibling; if (p) container.insertBefore(node, p); renumberTracklistBuilderRows(container); return; }
    if (e.target.closest('.tracklist-builder-down')) { const n = node.nextElementSibling; if (n) container.insertBefore(n, node); renumberTracklistBuilderRows(container); return; }
    if (e.target.closest('.tracklist-builder-insert')) { addTracklistBuilderRow(container, node).querySelector('.tracklist-builder-title').focus(); return; }
    if (e.target.closest('.tracklist-builder-links-toggle')) { tlExpandLinks(node, node.querySelector('.tracklist-builder-links').hidden); return; }
    const matchBtn = e.target.closest('.tracklist-builder-match-btn');
    if (matchBtn) { handleTracklistMatchBtnClick(matchBtn, getArtist || (() => '')); return; }
  });
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('.tracklist-builder-title, .tracklist-builder-time, .tracklist-builder-yt, .tracklist-builder-sp')) return;
    e.preventDefault();
    const rows = tlTrackRows(container), i = rows.indexOf(e.target.closest('.tracklist-builder-row'));
    if (i === rows.length - 1) addTracklistBuilderRow(container).querySelector('.tracklist-builder-title').focus();      // Enter in the last row starts the next: typing a list never needs the mouse
    else rows[i + 1].querySelector('.tracklist-builder-title').focus();
  });
  container.addEventListener('change', (e) => {
    if (!e.target.matches('.tracklist-builder-time')) return;
    const row = e.target.closest('.tracklist-builder-row'), v = e.target.value.trim(), ms = tlParseTime(v);
    if (!v) row.dataset.durationMs = ''; else if (ms) row.dataset.durationMs = ms; else e.target.value = tlFormatTime(Number(row.dataset.durationMs) || 0);     // not a time (m:ss): put back what was there
    if (ms) e.target.value = tlFormatTime(ms);
  });
  container.addEventListener('input', (e) => { if (e.target.matches('.tracklist-builder-yt, .tracklist-builder-sp')) tlRefreshRowLinks(e.target.closest('.tracklist-builder-row')); });
  container.addEventListener('paste', (e) => {                    // several lines pasted into a title box become several rows
    if (!e.target.matches('.tracklist-builder-title')) return;
    const text = ((e.clipboardData || window.clipboardData).getData('text') || '');
    if (!/\n/.test(text.trim())) return;
    if (tlInsertParsed(container, e.target.closest('.tracklist-builder-row'), text)) e.preventDefault();
  });
  let dragged = null;                                              // reordering: grab the handle, the row follows the pointer
  container.addEventListener('dragstart', (e) => {
    const h = e.target.closest ? e.target.closest('.tracklist-builder-handle') : null; if (!h) return;
    dragged = h.parentElement; dragged.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'tracklist-row');
    try { e.dataTransfer.setDragImage(dragged, 12, 12); } catch (err) { /* no drag image */ }
  });
  container.addEventListener('dragover', (e) => {
    if (!dragged) return; e.preventDefault();
    const over = e.target.closest('.tracklist-builder-row, .tracklist-builder-section'); if (!over || over === dragged) return;
    const r = over.getBoundingClientRect(); container.insertBefore(dragged, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
  });
  container.addEventListener('drop', (e) => { if (dragged) e.preventDefault(); });
  container.addEventListener('dragend', () => { if (dragged) { dragged.classList.remove('dragging'); dragged = null; renumberTracklistBuilderRows(container); } });
}
// ---- paste a list / fill from a source / headings ----
function tlToolsHtml() {
  return `
    <div class="tl-tools-bar">
      <span class="tl-fill-label">Fill from</span>
      <button type="button" class="chip-btn" data-tl-fill="spotify">Spotify</button>
      <button type="button" class="chip-btn" data-tl-fill="musicbrainz">MusicBrainz</button>
      <button type="button" class="chip-btn" data-tl-fill="itunes">iTunes</button>
      <button type="button" class="chip-btn" data-tl-fill="rym" title="The tracklist the browser add-on saved from this release\u2019s page on Rate Your Music">RYM</button>
      <button type="button" class="chip-btn" data-tl-heading="1" title="Add a heading such as Disc 2, Side B or Bonus tracks">+ Heading</button>
    </div>
    <details class="tl-paste">
      <summary>Paste a list\u2026</summary>
      <textarea class="tl-paste-text" rows="6" aria-label="Paste a tracklist" placeholder="1. Opening track  3:12&#10;2. Second song  4:40&#10;Disc 2&#10;1. Another disc opener  2:58"></textarea>
      <div class="tl-preview" aria-live="polite"></div>
      <div class="tl-paste-actions"><button type="button" class="chip-btn" data-tl-paste="replace">Use this list</button><button type="button" class="chip-btn" data-tl-paste="append">Add to the end</button></div>
    </details>
    <div class="tb-match-status tl-status" hidden role="status" aria-live="polite"></div>`;
}
function tlInitTools(side) {
  const box = tlTools(side); if (!box) return; box.innerHTML = tlToolsHtml();
  box.addEventListener('click', (e) => {
    const f = e.target.closest('[data-tl-fill]'); if (f) { tlFetchSource(side, f.dataset.tlFill); return; }
    const p = e.target.closest('[data-tl-paste]'); if (p) { tlPasteApply(side, p.dataset.tlPaste); return; }
    if (e.target.closest('[data-tl-use]')) { const pend = tlPending[side]; if (pend) { tlPending[side] = null; tlApplyTracks(side, pend.tracks, pend.kind, 'replace'); } return; }
    if (e.target.closest('[data-tl-dismiss]')) { tlPending[side] = null; tlStatus(side, ''); return; }
    if (e.target.closest('[data-tl-heading]')) { const c = tlC(side); c.insertAdjacentHTML('beforeend', tracklistBuilderSectionHtml('')); c.lastElementChild.querySelector('input').focus(); }
  });
  box.querySelector('.tl-paste-text').addEventListener('input', () => tlPastePreview(side));
}
function tlResetTools(side) {
  const box = tlTools(side); if (!box || !box.querySelector('.tl-paste-text')) return;
  box.querySelector('.tl-paste-text').value = ''; box.querySelector('.tl-preview').textContent = ''; box.querySelector('.tl-paste').open = false; tlPending[side] = null; tlSeq[side]++; tlStatus(side, '');
}
function tlPastePreview(side) {
  const box = tlTools(side), r = tlParseText(box.querySelector('.tl-paste-text').value), out = box.querySelector('.tl-preview');
  if (!r.tracks.length) { out.textContent = box.querySelector('.tl-paste-text').value.trim() ? 'No tracks found in that text.' : ''; return; }
  const bits = [`${r.tracks.length} track${r.tracks.length === 1 ? '' : 's'}`]; if (r.notes.sections) bits.push(`${r.notes.sections} heading${r.notes.sections === 1 ? '' : 's'}`); if (r.notes.withTimes) bits.push(`${r.notes.withTimes} with times`);
  out.textContent = bits.join(' \u00b7 ') + ': ' + r.tracks.slice(0, 3).map(t => t.title).join(', ') + (r.tracks.length > 3 ? '\u2026' : '');
}
function tlPasteApply(side, mode) {
  const box = tlTools(side), r = tlParseText(box.querySelector('.tl-paste-text').value);
  if (!r.tracks.length) { tlStatus(side, 'There are no tracks in that text to use.'); return; }
  tlApplyTracks(side, r.tracks, 'pasted', mode);
  box.querySelector('.tl-paste-text').value = ''; box.querySelector('.tl-preview').textContent = ''; box.querySelector('.tl-paste').open = false;
}
// Puts a list into the editor. Replacing keeps the number (and links) of any track whose title matches one already in the list, so its ratings and notes stay with it.
function tlApplyTracks(side, tracks, kind, mode) {
  const c = tlC(side), minNext = tlSideMinNext(side), current = collectTracklistBuilderRows(c, { minNext });
  const tagged = tracks.map(t => Object.assign({}, t, { s: kind }));
  let rows, note = '', label = TL_SOURCE_TEXT[kind] || kind;
  if (mode === 'append') { const a = tlAssignNumbers([], tagged, Math.max(minNext, ...current.map(r => r.trackNumber || 0))); rows = current.concat(a.rows); note = `Added ${tagged.length} track${tagged.length === 1 ? '' : 's'} to the end.`; }
  else {
    const a = tlAssignNumbers(current, tagged, minNext); rows = a.rows;
    const item = side === 'edit' ? activeItem : null, had = (n) => { const d = item && item.trackData && item.trackData[n]; return !!(d && (d.rating || d.note || d.listened || d.genre || d.rymRating)); };
    const lost = a.dropped.filter(r => had(r.trackNumber));
    note = `Using the list ${label}: ${rows.length} track${rows.length === 1 ? '' : 's'}.` + (a.matched ? ` ${a.matched} of them were already here, so their ratings, notes and links stay.` : '') + (lost.length ? ` ${lost.length} track${lost.length === 1 ? '' : 's'} that had ratings or notes ${lost.length === 1 ? 'is' : 'are'} not in the new list (${lost.slice(0, 3).map(r => r.title).join(', ')}${lost.length > 3 ? '\u2026' : ''}): their data stays saved but is no longer shown.` : '');
  }
  const ratedRows = rows.filter(r => r.rymRating > 0).length;
  if (ratedRows) note += side === 'edit' ? ` Rate Your Music\u2019s ratings for ${ratedRows} of the tracks are added when you save (only where a track has none of its own yet).` : ` Rate Your Music rates ${ratedRows} of the tracks: add them from Edit once the album is saved.`;
  renderTracklistBuilderRows(c, rows); tlStatus(side, escapeHtml(note));
}
async function tlItunesTracks(artist, title) {
  try {
    const hit = await findItunesAlbum({ artist, title }, (u) => fetchWithTimeout(u)); if (!hit || !hit.collectionId) return [];
    const data = await (await fetchWithTimeout(`https://itunes.apple.com/lookup?id=${hit.collectionId}&entity=song&limit=200`)).json();
    return (data.results || []).filter(r => r.wrapperType === 'track').sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0))
      .map(r => ({ title: r.trackName, durationMs: r.trackTimeMillis || 0, section: (r.discCount || 1) > 1 ? 'Disc ' + (r.discNumber || 1) : '' }));
  } catch (e) { return []; }
}
async function tlFetchSource(side, kind) {
  const f = (n) => (document.getElementById(side + n) || { value: '' }).value.trim(), artist = f('Artist'), title = f('Title'), link = f('Link'), label = TL_SOURCE_TEXT[kind].replace(/^from /, '');
  if (!artist || !title) { tlStatus(side, 'Fill in the artist and title first.'); return; }
  if (kind === 'rym') { tlFetchRym(side, artist, title); return; }
  const seq = ++tlSeq[side]; tlPending[side] = null; tlStatus(side, `Looking on ${escapeHtml(label)}\u2026`);
  let tracks = [];
  try {
    if (kind === 'spotify') { const m = await spotifyFindAlbumTracklist(artist, title); tracks = m ? m.tracks : []; }
    else if (kind === 'musicbrainz') {
      const id = (link.match(/musicbrainz\.org\/release\/([a-f0-9-]+)/i) || [])[1];
      if (!id) { tlStatus(side, 'MusicBrainz needs the exact release: paste its musicbrainz.org/release/\u2026 address into Link first.'); return; }
      tracks = await mbFetchTracklistForRelease(id);
    } else tracks = await tlItunesTracks(artist, title);
  } catch (e) { tracks = []; }
  if (seq !== tlSeq[side]) return;                                  // asked for something else meanwhile
  if (!tracks.length) { tlStatus(side, `${escapeHtml(label)} has no tracklist for this release${kind === 'spotify' ? ' (or Spotify isn\u2019t connected)' : ''}.`); return; }
  tlPending[side] = { kind, tracks: tracks.map(t => ({ title: t.title, durationMs: t.durationMs || 0, spotifyLink: t.spotifyLink || '', section: t.section || '' })) };
  const total = tlFormatTime(tracks.reduce((s, t) => s + (t.durationMs || 0), 0));
  tlStatus(side, `${escapeHtml(label)} has ${tracks.length} track${tracks.length === 1 ? '' : 's'}${total ? ' \u00b7 ' + total : ''}. <button type="button" class="chip-btn" data-tl-use>Use this list</button> <button type="button" class="chip-btn" data-tl-dismiss>Dismiss</button>`);
}
// ---- RYM as a tracklist source: asking the add-on for what it saw on the release's RateYourMusic page ----
function rymAskTracklists(ms) {                                  // -> the add-on's tracklists, or null if it didn't answer in time (not installed, not connected, or too old)
  return new Promise((resolve) => {
    const w = { resolve, timer: setTimeout(() => { const i = rymTlWaiters.indexOf(w); if (i >= 0) rymTlWaiters.splice(i, 1); resolve(null); }, ms || 2500) };
    rymTlWaiters.push(w);
    try { window.postMessage({ source: 'crate-app', type: 'request-rym-tracklists' }, window.location.origin); } catch (e) { /* no add-on */ }
  });
}
function rymTracklistsArrived(list) { rymTlWaiters.splice(0).forEach(w => { clearTimeout(w.timer); w.resolve(list); }); }
function rymTracklistLooksWrong(tracks) {                        // titles that are mostly numbers are ratings or counts read as titles: never offer such a list
  const t = Array.isArray(tracks) ? tracks : []; if (t.length < 2) return false;
  return t.filter(x => /^\d{1,3}(?:[.,]\d{1,2})?$/.test(String(x && x.title || '').trim())).length / t.length >= 0.5;
}
function rymSongUrl(x) {                                       // a track's own Rate Your Music page (https://rateyourmusic.com/song/…/), or ''
  const u = typeof x === 'string' ? x.trim() : '';
  return u.length <= 300 && /^https:\/\/(www\.)?rateyourmusic\.com\/song\/[^\s"'<>?#]+$/.test(u) ? u : '';
}
function rymCleanTracklists(list) {                              // whatever arrives is untrusted: only text and numbers, bounded
  const str = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';
  return (Array.isArray(list) ? list : []).slice(0, 400).map(e => ({ p: str(e && e.p, 200), ar: str(e && e.ar, 200), ti: str(e && e.ti, 200), ty: str(e && e.ty, 30), u: str(e && e.u, 300), t: Number(e && e.t) || 0,
    tracks: (Array.isArray(e && e.tracks) ? e.tracks : []).slice(0, 200).map(t => ({ title: str(t && t.title, 200).trim(), durationMs: Math.max(0, Math.round(Number(t && t.durationMs) || 0)), section: str(t && t.section, 40).trim(), rating: rymNum(t && t.rating), votes: rymNum(t && t.rating) ? rymVotesNum(t && t.votes) : 0, url: rymSongUrl(t && t.url) })).filter(t => t.title) })).filter(e => e.p && e.tracks.length >= 2).map(e => Object.assign(e, { wrong: rymTracklistLooksWrong(e.tracks) }));
}
function tlRymPick(list, probe) {                                // the add-on's tracklist for THIS release: by its saved RYM address, else artist + title + type (the rules the ratings use); the newest if several
  const idx = rymBuildIndex([probe], dupKey); let best = null;
  (list || []).forEach(e => { const m = rymMatchEntry(idx, { p: e.p, ar: e.ar, ti: e.ti, ty: e.ty }); if (m && m.item && (!best || (e.t || 0) >= (best.t || 0))) best = e; });
  return best;
}
async function tlFetchRym(side, artist, title) {
  const seq = ++tlSeq[side]; tlPending[side] = null; tlStatus(side, 'Asking the add-on what it saw on Rate Your Music\u2026');
  const list = await rymAskTracklists();
  if (seq !== tlSeq[side]) return;                               // asked for something else meanwhile
  if (list === null) { tlStatus(side, 'No answer from the add-on. It has to be installed, connected to this CRATE, and version 1.6 or newer.'); return; }
  const f = (n) => ((document.getElementById(side + n) || {}).value || '').trim(), rymLink = f('RymLink');
  const hit = tlRymPick(list, { artist, title, type: f('Type'), releaseDate: '', rymLink });
  if (!hit) {
    const href = rymLink || rymSearchUrl({ artist, title });
    tlStatus(side, `The add-on hasn\u2019t seen this release\u2019s page on Rate Your Music yet. <a href="${escapeHtml(href)}" target="_blank" rel="noopener">Open it there \u2197</a>, then press RYM again.`); return;
  }
  if (hit.wrong) { tlStatus(side, 'The add-on saved a tracklist for this release that looks wrong (its titles are numbers, most likely ratings). Update the add-on, open the release\u2019s page on Rate Your Music again, then press RYM again.'); return; }
  tlPending[side] = { kind: 'rym', tracks: hit.tracks.map(t => ({ title: t.title, durationMs: t.durationMs, section: t.section, rymRating: t.rating || 0, rymVotes: t.votes || 0, rymLink: t.url || '' })) };
  const total = tlFormatTime(hit.tracks.reduce((s, t) => s + (t.durationMs || 0), 0)), rated = hit.tracks.filter(t => t.rating).length, when = hit.t ? rymDateText(new Date(hit.t).toISOString()) : '';
  tlStatus(side, `Rate Your Music has ${hit.tracks.length} track${hit.tracks.length === 1 ? '' : 's'}${total ? ' \u00b7 ' + total : ''}${rated ? `, with ratings for ${rated}` : ''}${when ? ' (saved ' + escapeHtml(when) + ')' : ''}. <button type="button" class="chip-btn" data-tl-use>Use this list</button> <button type="button" class="chip-btn" data-tl-dismiss>Dismiss</button>`);
}
// RYM's own rating of a track fills in where the track has none (never over one you typed); then the deck's bold-the-best applies to it as it does to typed ones
async function tlApplyTrackRatings(item, rows, quiet) {
  const todo = (rows || []).filter(r => r.trackNumber && (r.rymRating > 0 || rymSongUrl(r.rymLink)));
  if (!todo.length || !item) return 0;
  item.trackData = item.trackData || {}; let n = 0, v = 0, l = 0;
  todo.forEach(r => {
    const td = item.trackData[r.trackNumber] || (item.trackData[r.trackNumber] = {}), votes = rymVotesNum(r.rymVotes), link = rymSongUrl(r.rymLink);
    if (link && !String(td.rymLink || '').trim()) { td.rymLink = link; l++; }          // the track's own RYM page, where it has none
    if (!(r.rymRating > 0)) return;
    const fresh = rymNum(r.rymRating), old = Number(td.rymRating) || 0;
    // Replaced when it came from Rate Your Music before (rymFrom), or when it is a rounded reading of this one: add-ons before 1.12.7 read the
    // track rows' "4.4 | 6k", so 4.4 from 6,000 stayed for good once 4.37 from 6,380 could be read. A different rating you typed is never replaced.
    const rounded = Math.abs(old * 10 - Math.round(old * 10)) < 1e-6 && Math.abs(old - fresh) <= 0.051;
    if (!(old > 0)) { td.rymRating = fresh; if (votes) td.rymVotes = votes; td.rymFrom = 'rym'; n++; }
    else if ((td.rymFrom === 'rym' || rounded) && (Math.abs(old - fresh) >= 0.005 || (votes && td.rymVotes !== votes))) { td.rymRating = fresh; if (votes) td.rymVotes = votes; td.rymFrom = 'rym'; v++; }
    else if (votes && Math.abs(old - fresh) < 0.005 && td.rymVotes !== votes) { td.rymVotes = votes; v++; }          // the same rating: how many it rests on is a fact that is kept up to date
  });
  if (!n && !v && !l) return 0;
  try { await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData) }); if (!quiet) flashGlobalToast(n + v ? `Added Rate Your Music ratings to ${n + v} track${n + v === 1 ? '' : 's'}${l ? ` and links to ${l}` : ''}.` : `Added Rate Your Music links to ${l} track${l === 1 ? '' : 's'}.`); return n + v + l; }
  catch (err) { if (!quiet) flashGlobalToast('Couldn\u2019t save the track ratings \u2014 try again.'); return 0; }
}
// ---- releases sent from RateYourMusic pages by the browser add-on ("Send to CRATE") ----
// They wait in the add-on until asked for; here they are shown in a bar and reviewed through the same import review a crate file uses
// (new / already in your crate / repeated, ticking, progress, Cancel, Retry). Nothing is added until you press Add there.
// A small progress bar for work that carries on while you use CRATE. While the import dialog is showing its own progress the bar stays hidden (unless asked for).
function bgStatus(text, pct, opts) {
  const bar = document.getElementById('bgStatus'); if (!bar) return; opts = opts || {};
  const ov = document.getElementById('cxImportOverlay');
  if (!opts.always && ov && !ov.hidden) { bar.hidden = true; return; }
  bar.hidden = false; document.getElementById('bgStatusText').textContent = text; document.getElementById('bgStatusFill').style.width = (pct == null ? 100 : Math.max(0, Math.min(100, pct))) + '%';
  document.getElementById('bgStatusCancel').hidden = !opts.cancel; document.getElementById('bgStatusView').hidden = !opts.view; document.getElementById('bgStatusClose').hidden = !opts.close;
}
// ---- "Update from Rate Your Music": the add-on opens the release pages ONE AT A TIME in a background tab, reads each as "Update CRATE from this page" does, and closes it. The add-on paces it (8-15 seconds between
// pages), caps it (25 a run) and stops at the first page that asks for a check. Nothing is changed here by it: the pages' details arrive as waiting updates, to Review or "Apply all". ----
const rymFetchState = { active: false, total: 0, ackTimer: 0 };
function rymUpdateUrl(item) { const p = rymPathOfUrl(item && item.rymLink); return p ? 'https://rateyourmusic.com' + p + '/' : ''; }
function rymFetchWhy(reason, r) {
  return ({ busy: 'An update from Rate Your Music is already running.', nothing: 'None of those has a usable Rate Your Music link.', daily: `An older version of the add-on is installed and keeps to 120 pages a day (version 1.12.1 removes that limit); ${(r && r.left) || 0} ${(r && r.left) === 1 ? 'is' : 'are'} left today.`,
    challenge: 'Rate Your Music asked for a check on the page it opened. That page is in front of you: pass it, then try again a little later.', timeout: 'a page didn\u2019t finish loading in time.', unreadable: 'a page couldn\u2019t be read.',
    closed: 'you closed the page while it was being read.', noanswer: 'The add-on didn\u2019t answer. Update it to 1.10 or later and check it is connected to this page.' })[reason] || `something went wrong (${reason || 'unknown'}).`;
}
function rymFetchUpdates(items, opts) {
  opts = opts || {}; items = (items || []).filter(Boolean); const todo = items.filter(it => rymUpdateUrl(it)), noLink = items.length - todo.length;
  if (!todo.length) { flashGlobalToast(items.length === 1 ? 'This release has no Rate Your Music link to open. Add one in Edit, or open its page on RYM and use \u201cUpdate CRATE from this page\u201d.' : 'None of those has a Rate Your Music link to open.'); return; }
  if (rymFetchState.active) { jobsQueueRym(todo); return; }          // one is running: this one waits its turn (Processing)
  const use = todo.slice(0, 25), over = todo.length - use.length;
  if (use.length > 1 && !opts.queued) {
    const mins = Math.max(1, Math.round(use.length * 14.5 / 60));
    if (!confirm(`Open ${use.length} Rate Your Music pages, one at a time, each in a background tab that closes itself, and read them?\n\nIt takes about ${mins} minute${mins === 1 ? '' : 's'}: there is a pause of 8 to 15 seconds between pages, on purpose, so Rate Your Music isn\u2019t hit quickly. If it asks for a check, the run stops and shows you that page.\n\nNothing in CRATE changes until you press Apply.${noLink ? `\n\n${noLink} without a Rate Your Music link ${noLink === 1 ? 'is' : 'are'} skipped.` : ''}${over ? `\n\nThe other ${over} wait in the queue and run after this, 25 at a time (\u2699 \u2192 Processing shows them).` : ''}`)) return;
  }
  const qOpen = rymQ.open; if (state.rymQueueMode) { rymQBegin(use); if (opts.queued && !qOpen) { rymQ.open = false; rymQRender(); } }          // (a queued run starts quietly: its dialog doesn't jump in front of you)
  jobsState.runRows = use.map(it => String(it.row)); if (over) jobsQueueRym(todo.slice(25), true);
  window.postMessage({ source: 'crate-app', type: 'rym-fetch-start', items: use.map(it => ({ id: it.row, url: rymUpdateUrl(it) })) }, window.location.origin);
  clearTimeout(rymFetchState.ackTimer); rymFetchState.ackTimer = setTimeout(() => { if (!rymFetchState.active) { flashGlobalToast(rymFetchWhy('noanswer')); if (state.rymQueueMode) rymQAbort(); } }, 3000);
}
function rymFetchCancel() { window.postMessage({ source: 'crate-app', type: 'rym-fetch-cancel' }, window.location.origin); }
function rymFetchContinue() { window.postMessage({ source: 'crate-app', type: 'rym-fetch-continue' }, window.location.origin); }
function rymFetchProgress(d) {
  if (state.rymQueueMode && rymQ.runEntries.length) { rymQProgress(d); return; }
  const n = d.total || 0, plural = n === 1 ? '' : 's';
  if (d.state === 'starting' || d.state === 'loading' || d.state === 'gap') {
    rymFetchState.active = true; rymFetchState.total = n; bgStatus(`Reading Rate Your Music pages \u2014 ${d.done} of ${n}${d.state === 'gap' ? ' (pausing between pages)' : ''}`, n ? d.done / n * 100 : 0, { always: true, cancel: true }); return;
  }
  rymFetchState.active = false;
  if (d.state === 'done') { bgStatus(`Read ${d.ok} of ${n} page${plural}${d.skipped ? ` (${d.skipped} no longer on Rate Your Music)` : ''}. Apply all, or Review, in the bar.`, 100, { always: true, close: true }); flashGlobalToast(`Read ${d.ok} Rate Your Music page${d.ok === 1 ? '' : 's'}: press \u201cApply all\u201d (or Review) in the bar to put the updates in.`); }
  else if (d.state === 'cancelled') bgStatus(`Stopped: read ${d.ok} of ${n} page${plural}. What was read is waiting in the bar.`, 100, { always: true, close: true });
  else if (d.state === 'stopped') { const why = rymFetchWhy(d.reason); bgStatus(`Stopped after ${d.ok} of ${n}: ${why}`, 100, { always: true, close: true }); flashGlobalToast(`Stopped after reading ${d.ok} of ${n}: ${why}`); }
}
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const d = e.data; if (!d || d.source !== 'crate-addon') return;
  if (d.type === 'rym-fetch-ack' && d.for === 'rym-fetch-start') {
    clearTimeout(rymFetchState.ackTimer); const r = d.resp || {};
    if (r.ok) { rymFetchState.active = true; rymFetchState.total = r.accepted || 0; if (!state.rymQueueMode) bgStatus(`Reading Rate Your Music pages \u2014 0 of ${r.accepted}`, 0, { always: true, cancel: true }); } else { flashGlobalToast(rymFetchWhy(r.reason, r)); if (state.rymQueueMode) rymQAbort(); }
  } else if (d.type === 'rym-fetch-ack' && d.for === 'rym-fetch-continue') {
    const r = d.resp || {}; if (r.ok) { rymFetchState.active = true; if (rymQ.run) rymQ.run.state = 'starting'; rymQRender(); } else flashGlobalToast('There is nothing to continue: start the update again.');
  } else if (d.type === 'rym-fetch-progress') { rymFetchProgress(d); jobsRymProgress(d); }
});
// ================= The update queue: one dialog for every "Update from Rate Your Music" (one release or many) =================
// As each page is read its details arrive as an update. In the queue they are APPLIED AT ONCE where that is safe (a blank filled, a better cover, a fuller tracklist: the "fill" and "refine" changes), and what
// DIFFERS from what you have is left, unticked, for you. Nothing here ever overwrites a value of yours by itself.
const rymQ = { open: false, entries: [], runEntries: [], run: null, seen: new Set(), chain: Promise.resolve(), expanded: new Set(), ticks: new Map(), timer: 0 };
const rymQEsc = (v) => escapeHtml(String(v == null ? '' : v));
function rymQKey(item) { return rymPathOfUrl(item && item.rymLink) || ('row' + (item && item.row)); }
function rymQEntryFor(item, create) {
  const key = rymQKey(item); let e = rymQ.entries.find(x => x.key === key);
  if (!e && create) { e = { key, row: item.row, state: 'queued', applied: [], rest: [], note: '', batchId: '', cover0: item.cover || '', cover1: '', coverMissed: false }; rymQ.entries.push(e); }
  if (e) { e.row = item.row; e.title = item.title; e.artist = item.artist; e.meta = [String(item.releaseDate || item.year || '').slice(0, 4), item.type].filter(Boolean).join(' \u00b7 '); }
  return e;
}
function rymQBatchHasRest(id) { return rymQ.entries.some(e => e.batchId === id && e.rest.length); }
function rymQChip(p) { return p.key === 'tracks' ? `tracklist ${p.proposed}` : p.key === 'cover' ? 'cover \u2191' : p.key === 'genre2' ? 'secondary genre' : p.key === 'rymLink' ? 'RYM link' : p.key === 'catalog' ? 'cat. no.' : p.key === 'rymDescriptors' ? 'descriptors' : p.key === 'date' ? 'date' : String(p.label || p.key).toLowerCase(); }
function rymQBegin(use) {                                       // a run is starting: its releases are queued, and the dialog is in front
  const keep = rymQ.entries.filter(e => e.rest.length && !use.some(it => rymQKey(it) === e.key));          // differences still waiting from before stay in the list
  rymQ.entries = []; rymQ.runEntries = use.map(it => rymQEntryFor(it, true)); keep.forEach(e => { rymQ.entries.push(e); });
  rymQ.run = { state: 'starting', total: use.length, done: 0, ok: 0, skipped: 0, reason: '', nextAt: 0, i: 0 }; rymQ.open = true; rymQ.expanded.clear(); rymQRender();
}
function rymQAbort() { rymQ.entries = rymQ.entries.filter(e => !rymQ.runEntries.includes(e) || e.state !== 'queued'); rymQ.runEntries = []; rymQ.run = null; rymQ.open = false; rymQRender(); }
function rymQOpen() { rymQ.open = true; rymQRender(); }
function rymQHide() { rymQ.open = false; rymQRender(); rymQMirror(); }
function rymQMirror() {                                         // the dialog is hidden but a run is going: the small bar at the bottom shows it
  if (rymQ.open || !rymQ.run || !rymFetchState.active) return;
  bgStatus(`Updating from Rate Your Music \u2014 ${rymQ.run.done} of ${rymQ.run.total}`, rymQ.run.total ? rymQ.run.done / rymQ.run.total * 100 : 0, { always: true, cancel: true, view: true });
}
function rymQProgress(d) {
  const run = rymQ.run = Object.assign(rymQ.run || {}, { state: d.state, total: d.total, done: d.done, ok: d.ok, skipped: d.skipped, reason: d.reason || '', nextAt: d.nextAt || 0, i: d.i || 0 });
  rymFetchState.active = d.state === 'starting' || d.state === 'loading' || d.state === 'gap';
  const E = rymQ.runEntries, open = ['queued', 'reading', 'waiting', 'check', 'error'];
  if (Array.isArray(d.items)) d.items.forEach((st, i) => { const e = E[i]; if (!e) return; if (st === 'missing') { e.state = 'skipped'; e.note = 'no longer on Rate Your Music'; } else if (st === 'ok' && open.includes(e.state)) e.state = 'read'; });
  E.forEach((e, i) => { if (i >= (d.i || 0) && ['reading', 'waiting', 'check', 'error'].includes(e.state)) e.state = 'queued'; });
  const cur = E[d.i || 0];
  if (cur && open.includes(cur.state)) {
    if (d.state === 'loading') cur.state = 'reading'; else if (d.state === 'gap') cur.state = 'waiting';
    else if (d.state === 'stopped') { cur.state = d.reason === 'challenge' ? 'check' : 'error'; cur.note = rymFetchWhy(d.reason); }
  }
  if (d.state === 'cancelled') E.forEach(e => { if (open.includes(e.state)) { e.state = 'skipped'; e.note = 'not read: stopped'; } });
  clearInterval(rymQ.timer); if (d.state === 'gap' && rymQ.open) rymQ.timer = setInterval(() => { if (!rymQ.open || !rymQ.run || rymQ.run.state !== 'gap') clearInterval(rymQ.timer); else rymQRender(); }, 1000);
  rymQRender();
  if (!rymQ.open) { if (rymFetchState.active) rymQMirror(); else { const c = rymQCounts(); bgStatus(`Rate Your Music update finished: ${c.updated} updated${c.review ? `, ${c.review} need a look` : ''}.`, 100, { always: true, close: true, view: true }); } }
}
function rymQIngestAll() {                                      // every update that has arrived and not yet been taken is read, matched to your release and applied
  if (!state.rymQueueMode) return;
  const ups = rymOutState.batches.filter(b => b.kind === 'update' && !rymQ.seen.has(b.id)); if (!ups.length) return;
  ups.forEach(b => rymQ.seen.add(b.id));
  rymQ.chain = rymQ.chain.then(async () => { for (const b of ups) { try { await rymQIngest(b); } catch (e) { rymQ.seen.delete(b.id); } rymQRender(); } renderRymInbox(); });
}
async function rymQIngest(b) {
  const rel = b.releases && b.releases[0]; if (!rel) { rymBatchDone([b.id]); return; }
  const pathKey = rymPathOfUrl(rel.rymLink) || rymPathOfUrl(b.source && b.source.url);
  const hit = rymMatchEntry(rymBuildIndex(state.raw, dupKey), { p: rel.rymLink, ar: rel.artist, ti: rel.title, ty: rel.type, y: String(rel.releaseDate || '').slice(0, 4) });
  if (!hit || !hit.item) {
    const e = rymQ.entries.find(x => x.key === pathKey);
    if (hit && hit.ambiguous) { if (e) { e.state = 'error'; e.note = 'more than one release of yours matches'; } return; }          // stays waiting: it can't be decided here
    if (e) { e.state = 'skipped'; e.note = 'not in your crate'; } rymBatchDone([b.id]); return;
  }
  const item = hit.item, e = rymQEntryFor(item, true), before = item.cover || ''; e.batchId = b.id; if (e.cover0 === undefined) e.cover0 = before;
  if (rel.tracks && rel.tracks.length >= 2) { try { await getTracksFor(item); } catch (er) { /* nothing to compare with */ } }
  const plan = rymUpdatePlan(item, rel, currentTracklistAsManualRows(item), tlMinNext(item)), picks = plan.filter(p => p.checked), rest = plan.filter(p => !p.checked);
  let wr = { coverMissed: false }; if (picks.length) wr = await rymWritePicks(item, picks, true, 'queue');
  const made = picks.filter(p => p.key !== 'cover' || !wr.coverMissed);
  e.applied = made.map(rymQChip); e.rest = rest; e.coverMissed = !!wr.coverMissed; e.cover1 = item.cover || ''; e.note = '';
  e.state = rest.length ? 'review' : made.length ? 'applied' : 'same';
  if (!made.length && !item.rymUpdated) { try { await rymMarkUpdated(item); } catch (er) { /* the flag is set next time */ } }          // read, and nothing needed changing: it has still had its first update
  rest.forEach(p => { const k = e.key + '|' + p.key; if (!rymQ.ticks.has(k)) rymQ.ticks.set(k, !!state.rymTickDiffs); });          // (ticked from the start unless you turned that off: nothing is applied until you press Apply)
  if (!rest.length) rymBatchDone([b.id]);
  if (made.length) rymRefreshViews();
  if (!rymQ.open && !rymFetchState.active) flashGlobalToast(`Updated \u201c${item.title}\u201d from Rate Your Music: ${made.length ? made.map(rymQChip).join(', ') : 'nothing new'}${rest.length ? `; ${rest.length} difference${rest.length === 1 ? '' : 's'} left for you in Review` : ''}${wr.coverMissed ? '; the cover couldn\u2019t be loaded from here' : ''}.`);
}
function rymQCounts() {
  const c = { total: rymQ.entries.length, updated: 0, review: 0, same: 0, left: 0, skipped: 0 };
  rymQ.entries.forEach(e => { if (e.state === 'applied') c.updated++; else if (e.state === 'review') c.review++; else if (e.state === 'same') c.same++; else if (e.state === 'skipped') c.skipped++; else c.left++; });
  return c;
}
function rymQTicked() { const out = []; rymQ.entries.forEach(e => e.rest.forEach(p => { if (rymQ.ticks.get(e.key + '|' + p.key)) out.push({ e, p }); })); return out; }
async function rymQApplyTicked() {
  if (rymQ.applying) return;                                      // already working through them: a second press must not start a second run over the same releases
  const chosen = rymQTicked(); if (!chosen.length) return; let n = 0, miss = 0, failed = 0, gone = 0;
  const byEntry = new Map(); chosen.forEach(({ e, p }) => { if (!byEntry.has(e)) byEntry.set(e, []); byEntry.get(e).push(p); });
  rymQ.applying = { done: 0, total: byEntry.size }; rymQRender();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  try {
    for (const [e, rows] of byEntry) {
      const item = state.raw.find(x => x.row === e.row);
      if (!item) { e.note = 'no longer in your crate'; gone++; rymQ.applying.done++; continue; }
      e.applying = true; rymQRender();
      let wr = null;
      for (let attempt = 0; attempt < 3 && !wr; attempt++) {         // a save that fails once (a busy sheet, a dropped connection) is tried again before it is given up on
        try { wr = await rymWritePicks(item, rows, true, 'review'); }
        catch (err) { if (/unauthorized/i.test(String((err && err.message) || ''))) break; if (attempt < 2) await sleep(600 * (attempt + 1)); }
      }
      e.applying = false;
      if (wr) {                                                     // saved: what was ticked is applied, and the rest of this release (if any) stays for you
        const made = rows.filter(p => p.key !== 'cover' || !wr.coverMissed);
        e.applied = e.applied.concat(made.map(rymQChip)); e.rest = e.rest.filter(p => !rows.includes(p)); n += made.length; e.note = ''; if (wr.coverMissed) { miss++; e.coverMissed = true; }
        rows.forEach(p => rymQ.ticks.delete(e.key + '|' + p.key)); e.cover1 = item.cover || '';
        if (!e.rest.length) { e.state = 'applied'; if (e.batchId) rymBatchDone([e.batchId]); }
      } else { e.note = 'couldn\u2019t be saved: try again'; failed++; }          // it stays ticked: pressing Apply again tries just the ones that failed
      rymQ.applying.done++; rymQRender();
    }
  } finally { rymQ.applying = null; }
  rymRefreshViews(); renderRymInbox(); rymQRender();
  flashGlobalToast(`Applied ${n} change${n === 1 ? '' : 's'}${miss ? `; ${miss} cover${miss === 1 ? '' : 's'} couldn\u2019t be loaded from here` : ''}${failed ? `; ${failed} release${failed === 1 ? '' : 's'} couldn\u2019t be saved and ${failed === 1 ? 'is' : 'are'} still ticked: press Apply to try again` : ''}${gone ? `; ${gone} ${gone === 1 ? 'is' : 'are'} no longer in your crate` : ''}.`);
}
function rymQDismissRest() {                                    // "leave them as they are": the differences are dropped and the updates are let go
  const ids = []; rymQ.entries.forEach(e => { if (e.rest.length) { e.rest.forEach(p => rymQ.ticks.delete(e.key + '|' + p.key)); e.rest = []; e.state = e.applied.length ? 'applied' : 'same'; e.note = 'differences left as they are'; if (e.batchId) ids.push(e.batchId); } });
  if (ids.length) rymBatchDone(ids); rymQRender();
}
const RYMQ_ICON = {
  ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7FC2B2" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  live: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D6A24C" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B93A0" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
  queue: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B93A0" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>',
  skip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B93A0" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
  warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E3AE4A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B93A0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};
function rymQStatus(e) {
  if (e.applying) return ['live', 'Applying\u2026', 'saving to your sheet'];
  if (e.state === 'review' && e.note) return ['warn', /saved/.test(e.note) ? 'Not saved' : 'Not applied', /saved/.test(e.note) ? 'press Apply to try again' : e.note];          // a release that could not be saved says so on its row, not only when opened
  const run = rymQ.run, secs = run && run.nextAt ? Math.max(0, Math.round((run.nextAt - Date.now()) / 1000)) : 0, n = (e.applied.length), r = e.rest.length;
  switch (e.state) {
    case 'queued': return ['queue', 'Queued', ''];
    case 'reading': return ['live', 'Reading\u2026', 'page open in the background'];
    case 'waiting': return ['pause', secs ? `Next in ${secs} s` : 'Next up', 'pausing between pages'];
    case 'read': return ['ok', 'Read', 'applying\u2026'];
    case 'applied': return ['ok', 'Updated', `${n} change${n === 1 ? '' : 's'} applied`];
    case 'review': return ['warn', 'Needs a look', `${r} difference${r === 1 ? '' : 's'}${n ? ` \u00b7 ${n} applied` : ''}`];
    case 'same': return ['ok', 'Up to date', e.note || 'nothing new'];
    case 'skipped': return ['skip', 'Skipped', e.note || ''];
    case 'check': return ['warn', 'Check needed', 'open in your browser'];
    default: return ['warn', 'Couldn\u2019t be read', e.note || ''];
  }
}
function rymQThumb(url, e, cls) {
  const init = (String(e.artist || '?').match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
  return url ? `<img class="rymq-img ${cls || ''}" src="${rymQEsc(url)}" ${rymIsRymImage(url) ? 'referrerpolicy="no-referrer" ' : ''}alt="" loading="lazy" data-q-init="${rymQEsc(init)}">` : `<div class="rymq-ph ${cls || ''}" aria-hidden="true">${rymQEsc(init)}</div>`;
}
function rymQCoverCell(e) {
  const changed = e.cover1 && e.cover1 !== e.cover0, a = rymPictureSize(e.cover0), b = rymPictureSize(e.cover1);
  return `<div class="rymq-cov"><div class="rymq-covrow">${rymQThumb(e.cover0, e)}${changed ? RYMQ_ICON.arrow + rymQThumb(e.cover1, e, 'big') : ''}</div>${changed ? `<div class="rymq-cap">${e.cover0 ? (a || 'smaller') : 'none'} \u2192 ${b || 'new'}</div>` : ''}</div>`;
}
function rymQRowHtml(e) {
  const [kind, text, sub] = rymQStatus(e), open = rymQ.expanded.has(e.key), has = e.rest.length > 0;
  const all = has && e.rest.every(p => rymQ.ticks.get(e.key + '|' + p.key)), some = has && e.rest.some(p => rymQ.ticks.get(e.key + '|' + p.key));
  const chips = e.applied.map(c => `<span class="rymq-chip">${rymQEsc(c)}</span>`).concat(e.rest.map(p => `<span class="rymq-chip diff">${rymQEsc(String(p.label || p.key).toLowerCase())} differs</span>`), e.coverMissed ? ['<span class="rymq-chip diff">cover couldn\u2019t be loaded</span>'] : []).join('');
  const dim = ['same', 'skipped', 'queued'].includes(e.state);
  let detail = '';
  if (open) {
    const changed = e.cover1 && e.cover1 !== e.cover0;
    detail = `<div class="rymq-detail">`
      + (changed ? `<div class="rymq-dlabel">Cover</div><div class="rymq-covrow" style="gap:14px">${rymQThumb(e.cover0, e, 'mid')}<span class="rymq-cap">${e.cover0 ? `${rymQEsc(rymImageHost(e.cover0) || 'your cover')}<br>${rymPictureSize(e.cover0) ? rymPictureSize(e.cover0) + ' px' : 'size unknown'}` : 'no cover yet'}</span>${RYMQ_ICON.arrow}${rymQThumb(e.cover1, e, 'huge')}<span class="rymq-cap" style="color:#7FC2B2">${rymQEsc(rymImageHost(e.cover1))}<br>${rymPictureSize(e.cover1) || '?'} px \u00b7 from the release page</span></div>` : '')
      + (e.applied.length ? `<div class="rymq-dlabel">Applied automatically</div><div class="rymq-chips">${e.applied.map(c => `<span class="rymq-chip">${rymQEsc(c)}</span>`).join('')}</div>` : '')
      + (has ? `<div class="rymq-dlabel">Differs from what you have \u2014 ${state.rymTickDiffs ? 'ticked: untick what you want to keep' : 'tick to apply'}</div>${e.rest.map(p => `<label class="rymq-field"><input type="checkbox" class="rymq-cb" data-q-tick="${rymQEsc(e.key + '|' + p.key)}" ${rymQ.ticks.get(e.key + '|' + p.key) ? 'checked="checked" ' : ''}aria-label="Apply ${rymQEsc(p.label)}"><span class="rymq-fl">${rymQEsc(p.label)}</span><span class="rymq-cur">${rymQEsc(p.current || 'blank')}</span>${RYMQ_ICON.arrow}<span>${rymQEsc(p.proposed)}</span></label>`).join('')}` : '')
      + (e.coverMissed ? `<div class="rymq-note">The cover couldn\u2019t be loaded from here, so it was left as it was. The picture host may be refusing requests from this page.</div>` : '')
      + (!e.applied.length && !has && !e.coverMissed ? `<div class="rymq-cap" style="padding:8px 0">${rymQEsc(e.note || 'Nothing new on the release page.')}</div>` : '')
      + (e.note && (has || e.applied.length) ? `<div class="rymq-note" role="alert">${rymQEsc(e.note)}</div>` : '')          // (a release that couldn\u2019t be saved still has its differences: it says so)
      + `</div>`;
  }
  return `<div class="rymq-item"><div class="rymq-row${dim ? ' dim' : ''}" data-q-row="${rymQEsc(e.key)}" role="button" tabindex="0" aria-expanded="${open}">`
    + `<div>${has ? `<input type="checkbox" class="rymq-cb" data-q-all="${rymQEsc(e.key)}" ${all ? 'checked="checked" ' : ''}aria-label="Apply the differences for ${rymQEsc(e.title)}" ${some && !all ? 'data-partial="1" ' : ''}>` : ''}</div>`
    + rymQCoverCell(e)
    + `<div class="rymq-name"><b>${rymQEsc(e.title)}</b><i>${rymQEsc(e.artist)}${e.meta ? ' \u00b7 ' + rymQEsc(e.meta) : ''}</i></div>`
    + `<div class="rymq-st ${kind}"><div>${RYMQ_ICON[kind] || ''}<span>${rymQEsc(text)}</span></div>${sub ? `<small>${rymQEsc(sub)}</small>` : ''}</div>`
    + `<div class="rymq-chips">${chips}</div></div>${detail}</div>`;
}
function rymQRender() {
  const ov = document.getElementById('rymQOverlay'), dlg = document.getElementById('rymQDialog'); if (!ov || !dlg) return;
  ov.hidden = !rymQ.open; if (!rymQ.open) return;
  const list0 = dlg.querySelector('.rymq-list'), keep = list0 ? list0.scrollTop : 0, run = rymQ.run, c = rymQCounts(), active = rymFetchState.active;
  const secs = run && run.nextAt ? Math.max(0, Math.round((run.nextAt - Date.now()) / 1000)) : 0;
  const sub = run ? `${run.total} release${run.total === 1 ? '' : 's'} \u00b7 ${c.updated} updated${c.review ? ` \u00b7 ${c.review} need a look` : ''}${c.left ? ` \u00b7 ${c.left} left` : ''}` : `${c.total} release${c.total === 1 ? '' : 's'} \u00b7 ${c.updated} updated \u00b7 ${c.review} need a look`;
  let prog = '';
  if (run) {
    const pct = run.total ? Math.round(run.done / run.total * 100) : 0;
    const line = run.state === 'starting' ? 'Starting\u2026' : run.state === 'loading' ? `Reading page ${Math.min(run.done + 1, run.total)} of ${run.total}` : run.state === 'gap' ? `Read ${run.done} of ${run.total} \u00b7 pausing ${secs} s before the next page, on purpose` : run.state === 'done' ? `Finished: ${run.ok} read${run.skipped ? `, ${run.skipped} skipped` : ''}. Nothing was changed except what is listed.` : run.state === 'cancelled' ? `Stopped: ${run.ok} read.` : `Stopped after ${run.ok} of ${run.total}.`;
    prog = `<div class="rymq-progress"><div class="rymq-track"><b style="width:${run.state === 'done' ? 100 : pct}%"></b></div><div class="rymq-pline"><span>${rymQEsc(line)}</span>${active ? '<button type="button" class="rymq-btn" data-q-act="cancel">Cancel</button>' : ''}</div></div>`;
  }
  let banner = '';
  if (run && run.state === 'stopped') {
    const left = run.total - run.done, can = ['challenge', 'timeout', 'unreadable', 'closed'].includes(run.reason);
    banner = `<div class="rymq-banner" role="alert"><div style="display:flex;gap:10px;align-items:flex-start">${RYMQ_ICON.warn}<div><b>${run.reason === 'challenge' ? `Rate Your Music asked for a check on page ${run.done + 1}` : `The update stopped on page ${run.done + 1}`}</b><span>${run.reason === 'challenge' ? 'That page is open in front of you. Pass the check there, then continue. What was already read is kept.' : rymQEsc(rymFetchWhy(run.reason))}</span></div></div><div style="display:flex;gap:8px;flex:none"><button type="button" class="rymq-btn" data-q-act="stop">Stop here</button>${can && left > 0 ? `<button type="button" class="rymq-btn primary" data-q-act="continue">Continue with the other ${left}</button>` : ''}</div></div>`;
  }
  const ticked = rymQTicked().length, foot = `${c.updated} updated automatically${c.review ? ` \u00b7 ${c.review} need a look` : ''}${c.same ? ` \u00b7 ${c.same} already up to date` : ''}${c.skipped ? ` \u00b7 ${c.skipped} skipped` : ''}`;
  dlg.innerHTML = `<div class="rymq-head"><div><div class="rymq-title" id="rymQTitle">UPDATE FROM RATE YOUR MUSIC</div><div class="rymq-sub">${rymQEsc(sub)}</div></div><div class="rymq-head-btns">${active ? '<button type="button" class="rymq-btn" data-q-act="hide">Keep working</button>' : ''}<button type="button" class="rymq-x" data-q-act="hide" aria-label="Close">\u00d7</button></div></div>`
    + prog + banner
    + `<div class="rymq-cols"><div></div><div>Cover: yours \u2192 RYM</div><div>Release</div><div>Status</div><div>What changed</div></div>`
    + `<div class="rymq-list">${rymQ.entries.length ? rymQ.entries.map(rymQRowHtml).join('') : '<div class="rymq-cap" style="padding:24px">Nothing in the queue.</div>'}</div>`
    + `<div class="rymq-foot"><span>${rymQEsc(foot)}</span><div>${c.review ? '<button type="button" class="rymq-btn" data-q-act="dismiss">Leave the differences as they are</button>' : ''}<button type="button" class="rymq-btn primary" data-q-act="apply" ${ticked && !rymQ.applying ? '' : 'disabled="disabled"'}>${rymQ.applying ? `Applying ${rymQ.applying.done} of ${rymQ.applying.total}\u2026` : ticked ? `Apply ${ticked} ticked` : 'Apply ticked'}</button></div></div>`;
  dlg.querySelectorAll('input[data-partial]').forEach(i => { i.indeterminate = true; });
  const list1 = dlg.querySelector('.rymq-list'); if (list1) list1.scrollTop = keep;
}
(function wireRymQueue() {
  const ov = document.getElementById('rymQOverlay'); if (!ov) return;
  ov.addEventListener('click', (e) => {
    if (e.target === ov) { rymQHide(); return; }
    const act = e.target.closest('[data-q-act]');
    if (act) {
      const a = act.dataset.qAct;
      if (a === 'hide') rymQHide(); else if (a === 'cancel') rymFetchCancel(); else if (a === 'continue') rymFetchContinue();
      else if (a === 'stop') { rymFetchCancel(); if (rymQ.run) { rymQ.run.state = 'cancelled'; rymFetchState.active = false; rymQ.runEntries.forEach(x => { if (['queued', 'waiting', 'reading', 'check', 'error'].includes(x.state)) { x.state = 'skipped'; x.note = 'not read: stopped'; } }); } rymQRender(); }
      else if (a === 'apply') rymQApplyTicked(); else if (a === 'dismiss') rymQDismissRest();
      return;
    }
    const tick = e.target.closest('[data-q-tick]'); if (tick) { rymQ.ticks.set(tick.dataset.qTick, tick.checked); rymQRender(); return; }
    const all = e.target.closest('[data-q-all]'); if (all) { const en = rymQ.entries.find(x => x.key === all.dataset.qAll); if (en) en.rest.forEach(p => rymQ.ticks.set(en.key + '|' + p.key, all.checked)); rymQRender(); return; }
    if (e.target.closest('label.rymq-field')) return;
    const row = e.target.closest('[data-q-row]'); if (row) { const k = row.dataset.qRow; if (rymQ.expanded.has(k)) rymQ.expanded.delete(k); else rymQ.expanded.add(k); rymQRender(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && rymQ.open) rymQHide(); });          // (wherever the focus is)
  ov.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-q-row]')) { e.preventDefault(); e.target.click(); } });
  ov.addEventListener('error', (e) => { const im = e.target; if (im && im.classList && im.classList.contains('rymq-img')) { const ph = document.createElement('div'); ph.className = im.className.replace('rymq-img', 'rymq-ph'); ph.textContent = im.dataset.qInit || '?'; im.replaceWith(ph); } }, true);
})();
function bgStatusHide() { const bar = document.getElementById('bgStatus'); if (bar) bar.hidden = true; }
function rymAskOutbox(ms) {                                      // -> the batches waiting in the add-on, or null if it didn't answer in time (not installed, not connected, or older than 1.7)
  return new Promise((resolve) => {
    const w = { resolve, timer: setTimeout(() => { const i = rymOutWaiters.indexOf(w); if (i >= 0) rymOutWaiters.splice(i, 1); resolve(null); }, ms || 2500) };
    rymOutWaiters.push(w);
    try { window.postMessage({ source: 'crate-app', type: 'request-rym-outbox' }, window.location.origin); } catch (e) { /* no add-on */ }
  });
}
function rymGenreStr(v) {                                      // a list of genres from the add-on: each once, at most 30, no name cut short. It used to be cut at 200 characters, which lost the tail of a long list (and could slice a name in half)
  const seen = new Set(), out = [];
  String(v == null ? '' : v).split(',').forEach(g => { const t = g.replace(/\s+/g, ' ').trim().slice(0, 80), k = t.toLowerCase(); if (t && !/\bscene$/i.test(t) && !seen.has(k) && out.length < 30) { seen.add(k); out.push(t); } });          // (a scene such as "Laurel Canyon Scene" is not a genre: an add-on older than 1.12.4 sent them in the Genre list)
  return out.join(', ');
}
function rymCleanCover(u) {                                     // a picture address from the add-on: https only, nothing that could break out of an attribute; an apostrophe (RYM leaves them raw: "Tomorrow's%20Revue") is encoded, not a reason to drop the cover
  const v = (typeof u === 'string' ? u.slice(0, 500) : '').trim().replace(/'/g, '%27');
  return /^https:\/\/[^\s"'<>]+$/.test(v) ? v : '';
}
function rymCleanOutbox(list) {                                  // untrusted: only text and numbers, bounded, and only types CRATE has
  const str = (x, n) => typeof x === 'string' ? x.slice(0, n) : '', TYPES = ['Album', 'EP', 'Single', 'Compilation', 'Live', 'Mixtape'];
  return (Array.isArray(list) ? list : []).slice(0, 60).map(b => ({
    id: str(b && b.id, 40), t: Number(b && b.t) || 0, kind: b && b.kind === 'release' ? 'release' : b && b.kind === 'update' ? 'update' : 'list', genre: str(b && b.genre, 100).trim(),
    source: { url: str(b && b.source && b.source.url, 300), title: str(b && b.source && b.source.title, 200).trim() },
    releases: (Array.isArray(b && b.releases) ? b.releases : []).slice(0, 600).map(r => ({
      artist: rymTidyName(str(r && r.artist, 200).trim()), title: rymTidyName(str(r && r.title, 200).trim()), type: TYPES.includes(r && r.type) ? r.type : 'Album', releaseDate: /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/.test(r && r.releaseDate) ? r.releaseDate : '',
      genre: rymGenreStr(r && r.genre), secondaryGenre: rymGenreStr(r && r.secondaryGenre), label: str(r && r.label, 200).trim(), catalog: /^CRT-\d+$/i.test(str(r && r.catalog, 100).trim()) ? '' : str(r && r.catalog, 100).trim(), rymDescriptors: str(r && r.descriptor, 500).trim(), scene: str(r && r.scene, 300).trim(), movement: str(r && r.movement, 300).trim(), recordedDate: /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(str(r && r.recordedDate, 10)) ? str(r && r.recordedDate, 10) : '', location: str(r && r.recordedPlace, 200).replace(/\s+/g, ' ').trim(),          // (an import reads these two as Recorded and Location)
      rymLink: /^https:\/\/rateyourmusic\.com\/release\//.test(str(r && r.rymLink, 300)) ? str(r.rymLink, 300) : '', cover: rymCleanCover(r && r.cover),          // (these two once sat inside the comment above, so every batch arrived without them)
      tracks: (Array.isArray(r && r.tracks) ? r.tracks : []).slice(0, 200).map((t, i) => ({ n: i + 1, title: str(t && t.title, 200).trim(), durationMs: Math.max(0, Math.round(Number(t && t.durationMs) || 0)), section: str(t && t.section, 40).trim(), s: 'rym', rating: rymNum(t && t.rating), votes: rymNum(t && t.rating) ? rymVotesNum(t && t.votes) : 0, url: rymSongUrl(t && t.url) })).filter(t => t.title), rymRating: rymNum(r && r.rymRating), rymVotes: Math.max(0, Math.round(Number(r && r.rymVotes) || 0)) })).filter(r => r.artist && r.title).slice(0, 300) })).filter(b => b.id && b.releases.length);
}
function rymOutboxArrived(batches) {
  rymOutState.batches = batches; rymOutState.present = true; renderRymInbox(); rymQIngestAll();
  rymOutWaiters.splice(0).forEach(w => { clearTimeout(w.timer); w.resolve(batches); });
}
async function rymCheckOutbox() {                                // quietly: when the add-on says hello, and when you come back to this tab
  const now = Date.now();
  if (now - rymOutState.last < 1500) { if (!rymOutState.timer) rymOutState.timer = setTimeout(() => { rymOutState.timer = 0; rymCheckOutbox(); }, 1600); return; }      // too soon after the last ask: ask a moment later, not never
  rymOutState.last = now;
  await rymAskOutbox();
}
function renderRymInbox() {
  const bar = document.getElementById('rymInbox'); if (!bar) return;
  const bs = state.rymQueueMode ? rymOutState.batches.filter(b => b.kind !== 'update' || rymQBatchHasRest(b.id)) : rymOutState.batches, key = bs.map(b => b.id).join(',');          // (in the queue, only an update with something LEFT to decide is waiting: the rest is applied as it arrives)
  if (!bs.length || rymOutState.dismissed === key) { bar.hidden = true; bar.innerHTML = ''; return; }
  const n = bs.reduce((s, b) => s + b.releases.length, 0), first = bs[0];
  const ups = bs.filter(b => b.kind === 'update').length;
  const what = first.kind === 'update' ? (state.rymQueueMode ? `<b>${ups}</b> update${ups === 1 ? '' : 's'} ${ups === 1 ? 'has' : 'have'} differences from your crate left for you to decide` : `details for <b>${escapeHtml(first.source.title || 'a release')}</b> are waiting to update your crate`) : `<b>${n}</b> release${n === 1 ? '' : 's'} waiting${first.source.title ? ' from ' + escapeHtml(first.source.title) : ''}`;
  bar.innerHTML = `<span>Rate Your Music: ${what}${bs.length > 1 ? ` and ${bs.length - 1} more page${bs.length > 2 ? 's' : ''}` : ''}.</span> <button type="button" class="chip-btn" data-rym-review>Review</button>${ups > 1 && !state.rymQueueMode ? ` <button type="button" class="chip-btn" data-rym-applyall title="Apply what is new in all ${ups} updates (blanks filled, dates made more precise, tracklists added). Anything that differs from what you have is left for you to review.">Apply all ${ups}</button>` : ''} <button type="button" class="chip-btn" data-rym-later>Not now</button> <button type="button" class="chip-btn" data-rym-discard title="Throw away what was sent from Rate Your Music">Discard</button>`;
  bar.hidden = false;
}
// ================= Processing: one place for everything CRATE is doing in the background =================
// What is running (a Rate Your Music update, adding releases, Match songs, the Last.fm sync, the new-release check), what needs you (a check RYM asked for,
// updates to review, releases sent from RYM, matches to keep), what waits its turn (Rate Your Music updates, one after another and never two at once, in the
// order you drag them into; the match queue; the syncs and when they next run), and what finished today. Each job keeps its own dialog: this panel reads
// their state, pauses or stops them, and opens them. Collapsed, it is the strip at the bottom (jobsStrip).
const JOBS_DONE_KEY = 'crate_jobs_done_v1', JOBS_RYM_GAP = 15000, JOBS_LF_EVERY = 6 * 3600000, JOBS_LF_AT_KEY = 'crate_lastfm_bgsync_at', JOBS_LF_ON_KEY = 'crate_lastfm_every6h';          // (15 s between queued updates: the add-on's own pace between pages)
const JOBS_CATS = [['all', 'All'], ['need', 'Needs you'], ['rym', 'RYM'], ['match', 'Match songs'], ['add', 'Adding'], ['sync', 'Syncs']];
const JOBS_ICON = {
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  warn: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  list: '<path d="M4 6h1M4 12h1M4 18h1"/><path d="M9 6h11M9 12h11M9 18h11"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wave: '<path d="M3 12h3l2-6 4 12 3-9 2 3h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  sliders: '<path d="M6 4v16M12 4v16M18 4v16"/><path d="M4 9h4M10 15h4M16 7h4"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 4v16l13-8L7 4z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
};
function jobsIco(n) { return `<svg class="job-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${JOBS_ICON[n] || ''}</svg>`; }
function jobsPl(n, w, ws) { return `${Number(n || 0).toLocaleString()} ${n === 1 ? w : (ws || w + 's')}`; }
function jobsIn(ms) { const m = Math.round(ms / 60000); return ms <= 0 ? 'due now' : m < 1 ? 'in under a minute' : m < 90 ? `in ${m} min` : `in ${Math.round(m / 60)} h`; }
function jobsDoneLoad() { try { const l = JSON.parse(localStorage.getItem(JOBS_DONE_KEY) || '[]'); return Array.isArray(l) ? l.filter(e => e && typeof e.t === 'number' && typeof e.text === 'string') : []; } catch (e) { return []; } }
function jobsDone(kind, text) {                                   // a finished job, for "Done today" (kept a week, at most 200)
  const week = Date.now() - 7 * 86400000, l = jobsDoneLoad().filter(e => e.t >= week).concat([{ t: Date.now(), kind, text: String(text).slice(0, 300) }]).slice(-200);
  try { localStorage.setItem(JOBS_DONE_KEY, JSON.stringify(l)); } catch (e) { /* private window: today's list just isn't kept */ }
  jobsRefresh();
}
function jobsLfEvery() { try { return localStorage.getItem(JOBS_LF_ON_KEY) !== '0'; } catch (e) { return true; } }
// ---- Rate Your Music updates wait their turn ----
function jobsQueueRym(items, quiet, front) {
  const have = new Set(jobsState.waiting.flatMap(w => w.rows).concat(rymFetchState.active && !front ? jobsState.runRows : [])), rows = items.map(it => String(it.row)).filter(r => !have.has(r)), add = [];
  for (let i = 0; i < rows.length; i += 25) add.push({ id: 'w' + Date.now() + '-' + i, kind: 'rym', rows: rows.slice(i, i + 25), t: Date.now() });          // (25 a run, as the add-on takes them)
  if (front) jobsState.waiting.unshift(...add); else jobsState.waiting.push(...add);
  if (!quiet) flashGlobalToast(rows.length ? `Queued ${jobsPl(rows.length, 'release')}: the update starts by itself when the one running now finishes. Click to see the queue.` : 'Those are already waiting in the queue.', { onClick: jobsOpen });
  jobsRefresh();
}
function jobsStartNextRym() {
  clearTimeout(jobsState.nextTimer); jobsState.nextTimer = 0; jobsState.nextAt = 0;
  if (rymFetchState.active || !jobsState.waiting.length) return;
  const w = jobsState.waiting.shift(), items = w.rows.map(r => state.raw.find(x => String(x.row) === r)).filter(Boolean);
  if (items.length) rymFetchUpdates(items, { queued: true }); else jobsStartNextRym();
  jobsRefresh();
}
function jobsRymNow() {                                           // the running update as it stands: how far, which release, when the next page opens
  const last = jobsState.rymLast || {}, q = state.rymQueueMode && rymQ.run ? rymQ.run : null, r = q || last;
  const total = r.total || rymFetchState.total || jobsState.runRows.length || 0, done = r.done || 0, i = r.i != null ? r.i : done;
  const it = q ? (rymQ.runEntries[i] || null) : state.raw.find(x => String(x.row) === jobsState.runRows[i]) || null;
  return { total, done, state: r.state || last.state || '', nextAt: r.nextAt || last.nextAt || 0, name: it ? `${it.artist} \u2014 ${it.title}` : '' };
}
function jobsPauseRym() {                                         // RYM's runs can only be stopped: what hasn't been read goes back to the front of the queue, held
  if (!rymFetchState.active) return;
  const rest = jobsState.runRows.slice(jobsRymNow().done), items = rest.map(r => state.raw.find(x => String(x.row) === r)).filter(Boolean);
  jobsState.pausing = true; rymFetchCancel();
  if (items.length) { jobsQueueRym(items, true, true); if (jobsState.waiting[0]) jobsState.waiting[0].paused = true; }
}
function jobsPauseAll() {
  jobsState.held = true; clearTimeout(jobsState.nextTimer); jobsState.nextTimer = 0; jobsState.nextAt = 0;
  jobsPauseRym(); if (bm && bm.started && bm.running) { bm.paused = true; bmRedraw(); }
  jobsRefresh();
}
function jobsResumeAll() {
  jobsState.held = false; if (jobsState.waiting[0]) jobsState.waiting[0].paused = false;
  if (bm && bm.paused) { bm.paused = false; bmRedraw(); }
  if (!rymFetchState.active && jobsState.waiting.length) jobsStartNextRym();
  jobsRefresh();
}
function jobsRymProgress(d) {                                     // every progress message of a Rate Your Music run
  jobsState.rymLast = d;
  if (d.state === 'starting' || d.state === 'loading' || d.state === 'gap') { jobsState.rymLogged = false; jobsRefresh(); return; }
  if (!jobsState.rymLogged) {
    jobsState.rymLogged = true; const paused = jobsState.pausing && d.state === 'cancelled'; jobsState.pausing = false;
    jobsDone('rym', `Rate Your Music update: read ${d.ok || 0} of ${jobsPl(d.total || 0, 'page')}${d.skipped ? ` (${d.skipped} no longer there)` : ''}${paused ? ', paused (the rest wait in the queue)' : d.state === 'cancelled' ? ', stopped by you' : d.state === 'stopped' ? `, stopped: ${rymFetchWhy(d.reason)}` : ''}`);
  }
  if (d.state === 'done' && jobsState.waiting.length && !jobsState.held && !jobsState.waiting[0].paused) { clearTimeout(jobsState.nextTimer); jobsState.nextAt = Date.now() + JOBS_RYM_GAP; jobsState.nextTimer = setTimeout(jobsStartNextRym, JOBS_RYM_GAP); }          // a stop (a check, you) holds the queue
  jobsRefresh();
}
// ---- what there is ----
function jobsCollect() {
  const run = [], need = [], wait = [], el$ = (id) => document.getElementById(id), last = jobsState.rymLast, now = Date.now();
  if (rymFetchState.active) {
    const r = jobsRymNow(), secs = r.state === 'gap' && r.nextAt > now ? Math.round((r.nextAt - now) / 1000) : 0;
    run.push({ cat: 'rym', icon: 'sync', title: 'Update from Rate Your Music', sub: jobsPl(r.total, 'release'), pct: r.total ? r.done / r.total * 100 : 0,
      detail: [`${r.done} of ${r.total}`, r.name, secs ? `next page in ${secs} s` : r.state === 'gap' ? 'pausing between pages' : r.state === 'loading' ? 'reading' : ''].filter(Boolean).join(' \u00b7 '),
      acts: [{ icon: 'pause', label: 'Pause', fn: jobsPauseRym }, { icon: 'x', label: 'Stop', fn: rymFetchCancel }, state.rymQueueMode && rymQ.entries.length ? { label: 'Details', fn: rymQOpen, opens: true } : null] });
  } else if (last && last.state === 'stopped' && last.reason === 'challenge') {
    need.push({ cat: 'rym', icon: 'warn', tone: 'warn', title: 'RYM asked for a check', detail: 'Pass it on the page the add-on opened. The queue\u2019s RYM jobs are held until you continue.', acts: [{ label: 'Continue', fn: rymFetchContinue, primary: true }, { label: 'Dismiss', fn: () => { jobsState.rymLast = null; } }] });
  }
  if (state.rymQueueMode) {
    const c = rymQCounts();
    if (c.review) {
      const kinds = [...new Set(rymQ.entries.flatMap(e => e.rest.map(p => p.key === 'trackStats' ? 'track ratings' : p.key === 'trackLinks' ? 'track links' : p.key === 'tracks' ? 'tracklists' : String(p.label || p.key).toLowerCase())))].slice(0, 4);
      need.push({ cat: 'rym', icon: 'list', title: `${jobsPl(c.review, 'update')} ready to review`, detail: `${kinds.length ? kinds.join(', ').replace(/^./, x => x.toUpperCase()) + ' \u00b7 ' : ''}from the RYM run`,
        acts: [{ label: 'Review', fn: rymQOpen, opens: true }, rymQTicked().length ? { label: 'Apply all', fn: rymQApplyTicked, primary: true } : null] });
    }
  }
  const bs = rymOutState.batches || [], adds = bs.filter(b => b.kind !== 'update'), ups = state.rymQueueMode ? [] : bs.filter(b => b.kind === 'update');
  if (adds.length) { const n = adds.reduce((x, b) => x + b.releases.length, 0); need.push({ cat: 'add', icon: 'plus', title: `Add ${jobsPl(n, 'release')} sent from RYM`, detail: adds.slice(0, 3).map(b => b.source.title || 'a page').join(' \u00b7 ') + (adds.length > 3 ? ` and ${adds.length - 3} more` : ''), acts: [{ label: 'Review', fn: () => openRymBatch(adds[0]), opens: true, primary: true }] }); }
  if (ups.length) need.push({ cat: 'rym', icon: 'list', title: `${jobsPl(ups.length, 'update')} from RYM to review`, detail: ups.slice(0, 3).map(b => b.source.title || 'a release').join(' \u00b7 '), acts: [{ label: 'Review', fn: () => openRymBatch(ups[0]), opens: true }, ups.length > 1 ? { label: 'Apply all', fn: rymUpdateAllWaiting, primary: true } : null] });
  if (typeof cxImp !== 'undefined' && cxImp && cxImp.running) {
    const bar = el$('cxImpBar'), t = el$('cxImpProgText');
    run.push({ cat: 'add', icon: 'plus', title: 'Adding releases', detail: t ? t.textContent : '', pct: bar ? parseFloat(bar.style.width) || 0 : 0, acts: [{ label: 'Show', fn: () => { const ov = el$('cxImportOverlay'); if (ov) ov.hidden = false; bgStatusHide(); }, opens: true }, { icon: 'x', label: 'Stop', fn: () => { cxImp.cancel = true; } }] });
  }
  if (bm && bm.started) {
    const rels = bm.rels.filter(r => r.include), ks = bmKinds(), t = bmPickTotals();
    const laneDone = (k) => rels.filter(r => r.st && r.st[k] !== 'wait' && r.st[k] !== 'work').length, cells = rels.length * ks.length, done = ks.reduce((x, k) => x + laneDone(k), 0);
    if (bm.running) run.push({ cat: 'match', icon: 'note', title: bm.auto ? 'Match songs (new releases)' : 'Match songs', sub: `${jobsPl(rels.length, 'release')} \u00b7 ${ks.map(bmName).join(', ')}`, pct: cells ? done / cells * 100 : 0,
      detail: (bm.paused ? 'Paused \u00b7 ' : '') + ks.map(k => `${bmName(k)} ${laneDone(k)} of ${rels.length}`).join(' \u00b7 ') + (t.n ? ` \u00b7 ${t.n} ticked` : ''),
      acts: [bm.paused ? { icon: 'play', label: 'Resume', fn: () => { bm.paused = false; bmRedraw(); } } : { icon: 'pause', label: 'Pause', fn: () => { bm.paused = true; bmRedraw(); } }, { label: 'Show', fn: bmShow, opens: true }] });
    else if (t.n) need.push({ cat: 'match', icon: 'note', title: 'Matches to keep', detail: `${jobsPl(t.n, 'song link')} ticked in Match songs (${jobsPl(rels.length, 'release')}): choose what to keep.`, acts: [{ label: 'Show', fn: bmShow, opens: true, primary: true }] });
  }
  if (lastfmBackgroundSyncRunning) run.push({ cat: 'sync', icon: 'wave', title: 'Last.fm listens sync', sub: 'background', detail: 'Logging the plays since the last sync' });
  if (newReleaseScanInFlight) { const sc = jobsState.scan; run.push({ cat: 'sync', icon: 'search', title: 'Looking for new releases', detail: sc ? `${sc.done} of ${jobsPl(sc.total, 'artist')}` : 'From the artists in your crate', pct: sc && sc.total ? sc.done / sc.total * 100 : null }); }
  jobsState.waiting.forEach((w, i) => {
    const right = jobsState.held ? 'held' : w.paused ? 'paused' : i === 0 && jobsState.nextAt > now ? `in ${Math.max(1, Math.round((jobsState.nextAt - now) / 1000))} s` : i === 0 && rymFetchState.active ? 'next' : i === 0 ? 'ready' : `after ${i}`;
    const names = w.rows.slice(0, 2).map(r => { const it = state.raw.find(x => String(x.row) === r); return it ? it.title : ''; }).filter(Boolean).join(', ');
    wait.push({ cat: 'rym', icon: 'sync', drag: i, title: 'Update from Rate Your Music', sub: jobsPl(w.rows.length, 'release'), detail: names + (w.rows.length > 2 ? '\u2026' : ''), right,
      acts: [i === 0 && !rymFetchState.active ? { icon: 'play', label: 'Start now', fn: () => { jobsState.held = false; w.paused = false; jobsStartNextRym(); } } : null, { icon: 'x', label: 'Remove', fn: () => { const k = jobsState.waiting.indexOf(w); if (k >= 0) jobsState.waiting.splice(k, 1); if (!jobsState.waiting.length) { clearTimeout(jobsState.nextTimer); jobsState.nextAt = 0; } } }] });
  });
  const mq = mqAll().length;
  if (mq && !(bm && bm.started && bm.scope === 'queue')) wait.push({ cat: 'match', icon: 'note', title: 'Match songs', sub: `${jobsPl(mq, 'release')} in the match queue`, right: 'when you start it', acts: [{ icon: 'play', label: 'Start', fn: () => bmOpen({ queue: true }), opens: true }] });
  const lf = loadLastfmCreds();
  if (lf.username && lf.apiKey && localStorage.getItem(LASTFM_SYNC_KEY + ':' + lf.username) && !lastfmBackgroundSyncRunning) {
    const at = Number(localStorage.getItem(JOBS_LF_AT_KEY) || 0);
    wait.push({ cat: 'sync', icon: 'wave', title: 'Last.fm listens sync', sub: 'background', right: jobsLfEvery() ? (at ? jobsIn(at + JOBS_LF_EVERY - now) : 'every 6 h') : 'when CRATE opens', acts: [{ icon: 'play', label: 'Sync now', fn: maybeRunBackgroundLastfmSync }] });
  }
  if ((loadSpotifyCreds() || {}).clientId && !newReleaseScanInFlight) {
    const at = Number(localStorage.getItem(NEW_RELEASES_LAST_SCAN_KEY) || 0);
    wait.push({ cat: 'sync', icon: 'search', title: 'Look for new releases', sub: 'background', right: at ? jobsIn(Math.max(0, newReleaseNextAutoAt() - now)) : 'daily' });
  }
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const done = jobsDoneLoad().filter(e => e.t >= day0.getTime()).reverse();
  return { run, need, wait, done };
}
// ---- the panel ----
function jobsOpen() { const ov = document.getElementById('jobsOverlay'); if (!ov) return; ov.hidden = false; jobsRender(); jobsStripRender(); clearInterval(jobsState.timer); jobsState.timer = setInterval(() => { if (!jobsState.dragging) jobsRender(); }, 1000); }
function jobsClose() { const ov = document.getElementById('jobsOverlay'); if (ov) ov.hidden = true; clearInterval(jobsState.timer); jobsState.timer = 0; jobsState.menu = false; jobsStripRender(); }
function jobsRefresh() { jobsStripRender(); const ov = document.getElementById('jobsOverlay'); if (ov && !ov.hidden && !jobsState.dragging) jobsRender(); }
function jobsSummary(c) {
  const parts = [c.run.length ? `${c.run.length} running` : '', c.wait.filter(j => j.drag != null).length ? `${c.wait.filter(j => j.drag != null).length} waiting` : '', c.need.length ? `${c.need.length} need${c.need.length === 1 ? 's' : ''} you` : ''].filter(Boolean);
  return parts.length ? parts.join(' \u00b7 ') : 'Nothing running';
}
function jobsBadge(c) { const b = document.getElementById('activityBadge'); if (!b) return; const n = c.run.length + c.need.length; b.textContent = String(n); b.hidden = !n; }
function jobsStripRender() {                                       // collapsed: one strip at the bottom for all of it (the separate RYM and Match songs strips step aside)
  const st = document.getElementById('jobsStrip'); if (!st) return; let c;
  try { c = jobsCollect(); } catch (e) { return; }                  // (while the page is still starting, some jobs aren't there yet)
  jobsBadge(c);
  const ov = document.getElementById('jobsOverlay'), on = !!(c.run.length || c.need.length) && !!(ov && ov.hidden);
  st.hidden = !on; document.body.classList.toggle('jobs-strip-on', on || !!(ov && !ov.hidden)); if (!on) return;          // (the old strips also step aside while the panel is open)
  const bits = c.run.map(j => j.cat === 'rym' ? `RYM ${j.detail.split(' \u00b7 ')[0]}` : j.cat === 'match' ? `Matching ${Math.round(j.pct || 0)}%` : j.cat === 'add' ? 'Adding releases' : j.title);
  if (c.need.length) bits.push(`${c.need.length} need${c.need.length === 1 ? 's' : ''} you`);
  const pct = c.run.find(j => typeof j.pct === 'number');
  st.innerHTML = `${jobsIco('layers')}<span class="jobs-strip-t"><b>Processing</b> ${escapeHtml(bits.join(' \u00b7 '))}</span>${pct ? `<i class="job-bar jobs-strip-bar"><b style="width:${Math.max(2, Math.min(100, pct.pct))}%"></b></i>` : ''}<button type="button" class="jobs-link" data-jobs-open>Open</button>`;
}
function jobsRender() {
  const body = document.getElementById('jobsBody'); if (!body) return;
  const c = jobsCollect(), acts = jobsState.acts = [], f = jobsState.filter || 'all';
  const keep = (j, sec) => f === 'all' || (f === 'need' ? sec === 'need' : j.cat === f);
  const btn = (a) => { if (!a) return ''; acts.push(a); const i = acts.length - 1; return a.icon && !a.text ? `<button type="button" class="job-btn job-ibtn" data-job-act="${i}" title="${escapeHtml(a.label)}" aria-label="${escapeHtml(a.label)}">${jobsIco(a.icon)}</button>` : `<button type="button" class="job-btn${a.primary ? ' job-primary' : ''}" data-job-act="${i}">${escapeHtml(a.label)}</button>`; };
  const row = (j) => `<div class="job-row${j.tone ? ' job-' + j.tone : ''}"${j.drag != null ? ` draggable="true" data-job-drag="${j.drag}"` : ''}>${j.drag != null ? `<span class="job-grip" title="Drag to reorder">${jobsIco('grip')}</span>` : ''}${jobsIco(j.icon)}`
    + `<div class="job-main"><div class="job-t"><b>${escapeHtml(j.title)}</b>${j.sub ? `<span class="job-sub"> \u00b7 ${escapeHtml(j.sub)}</span>` : ''}</div>`
    + `${j.pct !== undefined ? `<i class="job-bar"><b style="width:${j.pct == null ? 100 : Math.max(2, Math.min(100, j.pct))}%"${j.pct == null ? ' class="job-indef"' : ''}></b></i>` : ''}${j.detail ? `<div class="job-d">${escapeHtml(j.detail)}</div>` : ''}</div>`
    + `${j.right ? `<span class="job-right">${escapeHtml(j.right)}</span>` : ''}<div class="job-acts">${(j.acts || []).map(btn).join('')}</div></div>`;
  const sec = (key, title, list, empty) => { const l = list.filter(j => keep(j, key)); if (!l.length && f !== 'all') return ''; return `<section class="job-sec job-sec-${key}"><h3>${title}</h3>${l.length ? l.map(row).join('') : `<p class="job-empty">${empty}</p>`}</section>`; };
  const all = c.run.concat(c.need, c.wait), count = (k) => k === 'all' ? all.length : k === 'need' ? c.need.length : all.filter(j => j.cat === k).length;
  const tm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const cat = (k) => ({ rym: 'rym', match: 'match', import: 'add', scan: 'sync', lastfm: 'sync' })[k] || 'other';
  const done = c.done.filter(e => f === 'all' || cat(e.kind) === f), lastRym = c.done.find(e => e.kind === 'rym'), lastMatch = c.done.find(e => e.kind === 'match');
  const doneRow = (e) => `<div class="job-row job-done-row">${jobsIco('check')}<div class="job-main"><div class="job-t">${escapeHtml(e.text)}</div><div class="job-d">${tm(e.t)}</div></div><div class="job-acts">${btn(e === lastRym && state.rymQueueMode && rymQ.entries.length && !rymFetchState.active ? { label: 'Details', fn: rymQOpen, opens: true } : e === lastMatch && bm && bm.started && !bm.running ? { label: 'Details', fn: bmShow, opens: true } : null)}</div></div>`;
  document.getElementById('jobsSum').textContent = `${jobsSummary(c)} \u00b7 paced so RYM and Spotify stay happy`;
  const pa = document.getElementById('jobsPauseAll'), paused = jobsState.held || !!(bm && bm.paused);
  pa.innerHTML = `${jobsIco(paused ? 'play' : 'pause')}<span>${paused ? 'Resume all' : 'Pause all'}</span>`; pa.disabled = !paused && !c.run.length && !c.wait.some(j => j.drag != null);
  document.getElementById('jobsChips').innerHTML = JOBS_CATS.map(([k, l]) => { const n = count(k); return `<button type="button" class="job-chip${f === k ? ' on' : ''}" data-job-filter="${k}"${n || k === 'all' ? '' : ' disabled'}>${l}${(k === 'all' || k === 'need') && n ? ' ' + n : ''}</button>`; }).join('');
  body.innerHTML = sec('run', 'Running', c.run, 'Nothing is running.') + sec('need', 'Needs you', c.need, 'Nothing is waiting for you.') + sec('wait', 'Waiting \u00b7 drag to reorder', c.wait, 'Nothing is queued. A Rate Your Music update started while another is running waits here, and starts by itself.')
    + (done.length || f === 'all' ? `<section class="job-sec"><h3>Done today</h3>${done.length ? done.map(doneRow).join('') : '<p class="job-empty">Nothing yet today.</p>'}</section>` : '');
  const m = document.getElementById('jobsMenu'); m.hidden = !jobsState.menu;
  if (jobsState.menu) { const p = smPrefs(); m.innerHTML = [['autoMatchNew', 'Match new releases by themselves', !!p.autoMatchNew], ['rymQueueMode', 'Apply safe Rate Your Music changes as they arrive; review the rest', !!state.rymQueueMode], ['lfEvery', 'Sync Last.fm every 6 hours while CRATE is open', jobsLfEvery()]].map(([k, l, v]) => `<label class="job-opt"><input type="checkbox" data-job-opt="${k}"${v ? ' checked' : ''}> <span>${l}</span></label>`).join('') + '<p class="job-empty">Queued Rate Your Music updates start 15 s apart, and read one page at a time with a pause between pages.</p>'; }
  jobsBadge(c);
}
function initJobs() {
  const ov = document.getElementById('jobsOverlay'); if (!ov) return;
  document.getElementById('jobsClose').addEventListener('click', jobsClose);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) jobsClose(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (jobsState.menu) { jobsState.menu = false; jobsRender(); } else jobsClose(); } });
  document.getElementById('jobsPauseAll').addEventListener('click', () => { if (jobsState.held || (bm && bm.paused)) jobsResumeAll(); else jobsPauseAll(); });
  document.getElementById('jobsMenuBtn').addEventListener('click', () => { jobsState.menu = !jobsState.menu; jobsRender(); });
  document.getElementById('jobsMenu').addEventListener('change', (e) => {
    const k = e.target.dataset.jobOpt, v = e.target.checked;
    if (k === 'autoMatchNew') smPrefsSave({ autoMatchNew: v }); else if (k === 'rymQueueMode') { state.rymQueueMode = v; savePrefs(); const x = document.getElementById('rymQueueMode'); if (x) x.checked = v; } else if (k === 'lfEvery') { try { localStorage.setItem(JOBS_LF_ON_KEY, v ? '1' : '0'); } catch (er) { /* kept for this visit */ } }
  });
  document.getElementById('jobsChips').addEventListener('click', (e) => { const b = e.target.closest('[data-job-filter]'); if (!b) return; jobsState.filter = b.dataset.jobFilter; jobsRender(); });
  const body = document.getElementById('jobsBody');
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-job-act]'); if (!b) return; const a = (jobsState.acts || [])[Number(b.dataset.jobAct)]; if (!a) return;
    if (a.opens) jobsClose();          // it opens that job's own dialog
    try { a.fn(); } catch (err) { console.warn('Processing action failed:', err); }
    jobsRefresh();
  });
  // Waiting: drag a Rate Your Music update up or down to change what runs next
  body.addEventListener('dragstart', (e) => { const r = e.target.closest('[data-job-drag]'); if (!r) return; jobsState.dragging = Number(r.dataset.jobDrag); r.classList.add('job-dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.dataset.jobDrag); } catch (er) { /* old browser */ } });
  body.addEventListener('dragover', (e) => { const r = e.target.closest('[data-job-drag]'); if (r && jobsState.dragging != null) { e.preventDefault(); body.querySelectorAll('.job-drop').forEach(x => x.classList.remove('job-drop')); r.classList.add('job-drop'); } });
  body.addEventListener('drop', (e) => {
    const r = e.target.closest('[data-job-drag]'), from = jobsState.dragging; if (!r || from == null) return; e.preventDefault();
    const to = Number(r.dataset.jobDrag), w = jobsState.waiting; if (to !== from && w[from]) { const [x] = w.splice(from, 1); w.splice(to, 0, x); }
  });
  body.addEventListener('dragend', () => { jobsState.dragging = null; jobsRender(); });
  const strip = document.getElementById('jobsStrip'); if (strip) strip.addEventListener('click', jobsOpen);
  const m = document.getElementById('menuActivity'); if (m) m.addEventListener('click', () => { const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; jobsOpen(); });
  setInterval(() => { if (!document.hidden) jobsStripRender(); }, 1000);
  setInterval(() => {                                               // the syncs, while CRATE stays open: Last.fm every 6 hours (unless switched off), the new-release check when it is due
    if (document.hidden) return;
    const at = Number(localStorage.getItem(JOBS_LF_AT_KEY) || 0);
    if (jobsLfEvery() && at && Date.now() - at >= JOBS_LF_EVERY) maybeRunBackgroundLastfmSync();
    maybeAutoScanNewReleases();
  }, 5 * 60000);
}
function rymBatchDone(ids) {                                     // taken (or thrown away): the add-on forgets them, and so does the bar
  const gone = new Set(ids);
  rymOutState.batches = rymOutState.batches.filter(b => !gone.has(b.id)); renderRymInbox();
  try { window.postMessage({ source: 'crate-app', type: 'rym-outbox-done', ids: [...gone] }, window.location.origin); } catch (e) { /* no add-on */ }
}
// BEGIN rym-update
// A name that picked up the page's own wording ("Ulver (Album, Trip Hop): Reviews, Ratings, Credits, Song list" from a release page's title) -> "Ulver". Any other name comes back as it was.
// A Rate Your Music picture's address says its size ("https://e.snmc.io/i/300/s/…"): the candidates to try, largest first, ending with the address itself. Whether a size exists is found by trying it.
function rymPictureSize(u) { const m = /\/i\/(\d{2,4})\//.exec(String(u || '')); return m ? Number(m[1]) : 0; }
// Rate Your Music serves pictures from two hosts: the older e.snmc.io (what its lists and genre pages show, small) and the current cdn.sonemic.net (what a release page shows). Of two pictures of one release,
// the cdn.sonemic.net one replaces an e.snmc.io one (never with a SMALLER size); within one host the larger size wins. A cover from anywhere else (Spotify, iTunes…) is not RYM's and is never judged here.
function rymImageHost(u) { try { return new URL(String(u || '')).hostname.toLowerCase(); } catch (e) { return ''; } }
function rymIsRymImage(u) { const h = rymImageHost(u); return h === 'e.snmc.io' || h === 'cdn.sonemic.net' || /\.(snmc\.io|sonemic\.net)$/.test(h); }
function rymCoverBetter(a, b) {                                   // is picture a worth keeping instead of picture b?
  const ha = rymImageHost(a) === 'cdn.sonemic.net' ? 1 : 0, hb = rymImageHost(b) === 'cdn.sonemic.net' ? 1 : 0, sa = rymPictureSize(a), sb = rymPictureSize(b);
  return ha !== hb ? (ha > hb && sa >= sb) : sa > sb;
}
function rymCoverCandidates(u) {
  const s = String(u == null ? '' : u).trim(); if (!s) return [];
  const m = /^(https:\/\/[^\/]+\/i\/)(\d{2,4})(\/.*)$/.exec(s), out = [];
  if (m) [1200, 800, 600, 500].forEach(n => { if (n > Number(m[2])) out.push(m[1] + n + m[3]); });
  out.push(s); return out;
}
function rymTidyName(s) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!/Reviews,?\s*Ratings/i.test(t)) return t;
  return t.replace(/\s*[-\u2013\u2014|]\s*Rate Your Music\s*$/i, '').replace(/(?:\s*:\s*|\s[-\u2013\u2014|]\s*)Reviews,?\s*Ratings.*$/i, '').replace(/\s*\([^()]*\)\s*$/, '').trim() || t;
}
// ---- "Update from this page": what a Rate Your Music page could add to a release you already have ----
// One proposal per field: your value, RYM's value, and a kind: 'fill' (yours is blank), 'refine' (RYM's agrees but is more precise: a full date for a year, lengths for a
// list that has none) or 'differs' (they disagree: offered but never ticked for you). Nothing is proposed where they already agree, or where yours is already the more precise.
function rymUpdatePlan(item, rel, oldRows, minNext) {
  const out = [], lc = (s) => String(s || '').trim().toLowerCase();
  const add = (key, label, current, proposed, kind, extra) => out.push(Object.assign({ key, label, current, proposed, kind, checked: kind !== 'differs' }, extra || {}));
  const ca = String(item.artist || '').trim(), ta = rymTidyName(ca);
  if (ta && ta !== ca) add('artist', 'Artist name', ca, ta, 'refine');
  else if (ca && rel.artist && ca.toLowerCase() !== String(rel.artist).trim().toLowerCase() && ca.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') === String(rel.artist).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')) add('artist', 'Artist name', ca, String(rel.artist).trim(), 'refine');          // the same artists, written with different separators ("Swirlies / & Dropdead" for "Swirlies / Dropdead"): offered, ticked; a different CASE is left alone         // the saved artist picked up the page's wording: offered first, ticked
  const cd = String(item.releaseDate || '').trim(), nd = String(rel.releaseDate || '').trim();
  if (nd && nd !== cd) {
    if (!cd) add('date', 'Release date', '', nd, 'fill');
    else if (nd.length > cd.length && nd.startsWith(cd)) add('date', 'Release date', cd, nd, 'refine');
    else if (!(cd.length > nd.length && cd.startsWith(nd))) add('date', 'Release date', cd, nd, 'differs');
  }
  [['genre', 'Genre', item.genre, rel.genre], ['genre2', 'Secondary genre', item.genre2, rel.secondaryGenre]].forEach(([key, label, cur, nw]) => {
    const c = String(cur || '').trim(), n = String(nw || '').trim(); if (!n) return;
    const set = (s) => s.split(',').map(lc).filter(Boolean).sort().join('|');
    if (!c) add(key, label, '', n, 'fill');
    else if (set(c) !== set(n)) {
      const cp = c.split(',').map(lc).filter(Boolean), np = n.split(',').map(lc).filter(Boolean);
      add(key, label, c, n, (cp.length === 4 && np.length > 4 && cp.every((g, i) => g === np[i])) ? 'refine' : 'differs');          // yours is exactly the FIRST FOUR of RYM's longer list: what the add-on used to keep (it cut every list to four), so the rest is offered ticked; any other difference is still never ticked for you
    }
  });
  [['label', 'Label', item.label, rel.label], ['catalog', 'Catalogue number', /^CRT-\d+$/i.test(String(item.catalog || '').trim()) ? '' : item.catalog, rel.catalog], ['rymDescriptors', 'RYM descriptors', item.rymDescriptors, rel.rymDescriptors], ['scene', 'Scene', item.scene, rel.scene], ['movement', 'Movement', item.movement, rel.movement]].forEach(([key, label, cur, nw]) => {
    const c = String(cur || '').trim(), n = String(nw || '').trim(); if (!n) return;        // (an automatic CRT-007 number says nothing, so it counts as blank)
    const set = (x) => x.split(',').map(lc).filter(Boolean).sort().join('|');          // (the same names in another order are the same scenes)
    if (!c) add(key, label, '', n, 'fill'); else if (lc(c) !== lc(n) && !((key === 'scene' || key === 'movement') && set(c) === set(n))) add(key, label, c, n, 'differs');
  });
  { const c = String(item.recordedDate || '').trim(), n = String(rel.recordedDate || '').trim();          // when it was recorded (when it began): a year you have is refined by RYM's month or day of that year
    if (n) { if (!c) add('recordedDate', 'Recorded', '', n, 'fill'); else if (n.length > c.length && n.startsWith(c)) add('recordedDate', 'Recorded', c, n, 'refine'); else if (!c.startsWith(n) && c !== n) add('recordedDate', 'Recorded', c, n, 'differs'); } }
  { const n = String(rel.location || '').trim(); if (n && !String(item.location || '').trim()) add('location', 'Location (where it was recorded)', '', n, 'fill'); }          // only where you have none: yours may be where the band formed, or a venue
  const cc = String(item.cover || '').trim(), nc = String(rel.cover || '').trim();
  if (nc) {
    if (!cc) add('cover', 'Cover', '', 'Rate Your Music\u2019s picture', 'fill', { url: nc });
    else if (rymIsRymImage(cc) && rymIsRymImage(nc) && rymCoverBetter(nc, cc)) add('cover', 'Cover', rymImageHost(cc) === 'e.snmc.io' ? 'a smaller picture from a Rate Your Music list' : 'a smaller picture', 'the one from the release page', 'refine', { url: nc });       // only RYM's own picture is replaced by RYM's better one; a cover from anywhere else is left alone
  }
  const cl = String(item.rymLink || '').trim(), nl = String(rel.rymLink || '').trim();
  if (nl) { if (!cl) add('rymLink', 'RYM link', '', nl, 'fill'); else if (rymPathOfUrl(cl) !== rymPathOfUrl(nl)) add('rymLink', 'RYM link', cl, nl, 'differs'); }
  const nt = (rel.tracks || []).filter(t => t && t.title);
  if (nt.length >= 2) {
    const old = (oldRows || []).filter(r => r && r.title);
    const asg = tlAssignNumbers(old, nt.map(t => ({ title: t.title, durationMs: t.durationMs || 0, section: t.section || '', s: 'rym', rymRating: t.rating || 0, rymVotes: t.votes || 0, rymLink: t.url || '' })), minNext);
    const ok = old.map(r => tlKey(r.title)).join('|'), nk = nt.map(t => tlKey(t.title)).join('|');
    let kind = null;
    const numTitles = old.length >= 3 && old.filter(r => /^\d{1,3}(?:[.,]\d{1,2})?[kKmM]?$/.test(String(r.title).trim())).length / old.length >= 0.5;          // most titles are numbers ("6k", "5k": a count read as a title by add-on 1.12.0/1.12.1): not a tracklist of yours
    const broken = numTitles || (old.length >= 3 && new Set(old.map(r => tlKey(r.title))).size === 1);          // three or more tracks all with the same title (four called "Dropdead") is a wrong list, not one of yours: it counts as blank
    if (!old.length) kind = 'fill';
    else if (broken && (numTitles || nt.length > old.length)) kind = 'fill';
    else if (old.some(r => /^[A-Pa-p]\d{1,2}$/.test(String(r.title).trim())) && !nt.some(t => /^[A-Pa-p]\d{1,2}$/.test(String(t.title).trim()))) kind = 'fill';          // titles that are side positions ("E1": add-ons before 1.14.1 knew only sides A-D): repaired by a list with real titles
    else if (ok !== nk) kind = 'differs';
    else if (nt.some((t, i) => t.durationMs > 0 && !(old[i].durationMs > 0))) kind = 'refine';
    if (kind) add('tracks', 'Tracklist', old.length ? `${old.length} track${old.length === 1 ? '' : 's'}` : '', `${nt.length} tracks`, kind, { rows: asg.rows, matched: asg.matched, fresh: asg.fresh, dropped: asg.dropped.map(d => d.title) });
  }
  if (!out.some(p => p.key === 'tracks' && p.kind !== 'differs')) {          // the tracklist isn't being replaced (or RYM's differs, offered unticked), but RYM's rating and song page of each track with the same title can still be filled in
    const rated = (rel.tracks || []).filter(t => t && t.title && (t.rating > 0 || t.url)), old2 = (oldRows || []).filter(r => r && r.title && r.trackNumber);
    if (rated.length && old2.length && (rel.tracks || []).filter(t => t && t.title).length >= 2) {          // (a list of fewer than two tracks isn't trusted as a tracklist, so not as a source of ratings either)
      const used = new Set(), rows2 = [], links = []; let kept = 0;
      rated.forEach(t => {
        const k = tlKey(t.title).replace(/ /g, ''), o = old2.find(x => !used.has(x.trackNumber) && tlKey(x.title).replace(/ /g, '') === k); if (!o) return; used.add(o.trackNumber);          // (spacing aside: "Half Way Down" = "Halfway Down")
        const td = (item.trackData || {})[o.trackNumber] || {}, v = rymVotesNum(t.votes);
        if (t.url && !String(td.rymLink || '').trim()) links.push({ trackNumber: o.trackNumber, rymRating: 0, rymLink: t.url });          // its song page, where the track has no RYM link
        if (!(t.rating > 0)) return;
        if (!(td.rymRating > 0)) rows2.push({ trackNumber: o.trackNumber, rymRating: t.rating, rymVotes: v });
        else if ((Math.abs(td.rymRating - t.rating) >= 0.005 && ((Math.abs(td.rymRating * 10 - Math.round(td.rymRating * 10)) < 1e-6 && Math.abs(td.rymRating - t.rating) <= 0.051) || td.rymFrom === 'rym')) || (v && Math.abs(td.rymRating - t.rating) < 0.005 && td.rymVotes !== v)) { rows2.push({ trackNumber: o.trackNumber, rymRating: t.rating, rymVotes: v || td.rymVotes || 0 }); kept++; }          // the exact figures (4.56 from 4,733 ratings, add-on 1.12.6) where the rounded ones (4.6, 5k) were saved, or a count that changed
      });
      if (links.length) add('trackLinks', 'RYM track links', '', `${links.length} track${links.length === 1 ? '' : 's'}’${links.length === 1 ? 's' : ''} own Rate Your Music page${links.length === 1 ? '' : 's'}`, 'fill', { rows: links });
      if (rows2.length) add('trackStats', 'RYM track ratings', kept ? `${kept} already rated (rounded, or an older count)` : '', `${rows2.length} track${rows2.length === 1 ? '' : 's'} with how many people rated them`, kept === rows2.length ? 'refine' : 'fill', { rows: rows2 });
    }
  }
  return out;
}
// END rym-update
let rymUpd = null;
function rymUpdateClose() { const ov = document.getElementById('rymUpdateOverlay'); if (ov) ov.hidden = true; rymUpd = null; }
async function openRymUpdate(batch) {
  const rel = batch && batch.releases && batch.releases[0]; if (!rel) return;
  const $ = (id) => document.getElementById(id), ov = $('rymUpdateOverlay'), body = $('rymUpdBody'), apply = $('rymUpdApply');
  ov.hidden = false; apply.hidden = true; apply.disabled = false; $('rymUpdMsg').textContent = ''; $('rymUpdSub').textContent = `${rel.artist} \u2014 ${rel.title}`; body.innerHTML = '<p class="sm-dim">Looking for it in your crate\u2026</p>';
  const hit = rymMatchEntry(rymBuildIndex(state.raw, dupKey), { p: rel.rymLink, ar: rel.artist, ti: rel.title, ty: rel.type, y: String(rel.releaseDate || '').slice(0, 4) });
  if (!hit || !hit.item) {
    body.innerHTML = `<p>${hit && hit.ambiguous ? 'More than one release in your crate could be this one, so nothing was changed. Use Edit on the one you mean.' : 'This release isn\u2019t in your crate (any more).'}</p>` + (hit && hit.ambiguous ? '' : '<p><button type="button" class="config-btn" id="rymUpdAddInstead">Add it instead\u2026</button></p>');
    const b = $('rymUpdAddInstead'); if (b) b.onclick = () => { rymUpdateClose(); openRymImport(Object.assign({}, batch, { kind: 'release' })); };
    return;
  }
  const item = hit.item;
  if (rel.tracks && rel.tracks.length >= 2) { try { await getTracksFor(item); } catch (e) { /* nothing to compare with */ } }      // its tracklist has to be loaded, or a looked-up one would look like none
  if (ov.hidden) return;                                                                      // closed while it loaded
  const plan = rymUpdatePlan(item, rel, currentTracklistAsManualRows(item), tlMinNext(item));
  rymUpd = { batch, item, plan };
  const note = { fill: 'fills a blank', refine: 'adds precision', differs: 'differs from yours' };
  body.innerHTML = plan.length
    ? '<p class="sm-dim">Tick what to apply. Nothing is changed until you press Apply.</p>' + plan.map(p => `<label class="rym-upd-row"><input type="checkbox" data-upd="${p.key}"${p.checked ? ' checked' : ''}> <b>${escapeHtml(p.label)}</b> <span class="rym-upd-cur">${escapeHtml(p.current || 'blank')}</span> \u2192 <span class="rym-upd-new">${escapeHtml(p.proposed)}</span> <em class="rym-upd-note">${note[p.kind]}</em>${p.key === 'tracks' && p.kind !== 'fill' ? `<span class="rym-upd-sub">${p.matched} match by title and keep their ratings and notes${p.fresh ? ` \u00b7 ${p.fresh} new` : ''}${p.dropped.length ? ` \u00b7 ${p.dropped.length} of yours ${p.dropped.length === 1 ? 'isn\u2019t' : 'aren\u2019t'} on Rate Your Music\u2019s list and would go: ${escapeHtml(p.dropped.slice(0, 3).join(', '))}${p.dropped.length > 3 ? '\u2026' : ''}` : ''}</span>` : ''}</label>`).join('')
    : '<p>Nothing new on that page: what Rate Your Music shows matches what is already in your crate.</p>';
  apply.hidden = !plan.length;
}
async function rymWritePicks(item, picks, quiet, src) {            // write exactly the chosen fields of a release (and its tracklist), nothing else: shared by the review and the batch
  const map = { label: ['Label', 'label'], catalog: ['Catalog', 'catalog'], rymDescriptors: ['RymDescriptors', 'rymDescriptors'], scene: ['Scene', 'scene'], movement: ['Movement', 'movement'], recordedDate: ['Recorded', 'recordedDate'], location: ['Location', 'location'], artist: ['Artist', 'artist'], date: ['ReleaseDate', 'releaseDate'], genre: ['Genre', 'genre'], genre2: ['SecondaryGenre', 'genre2'], rymLink: ['RymLink', 'rymLink'] }, payload = { action: 'editAlbum', row: item.row };
  picks.forEach(p => { if (map[p.key]) payload[map[p.key][0]] = p.proposed; });          // only what was ticked: the backend leaves every other field as it is
  const cv = picks.find(p => p.key === 'cover'); let coverUrl = '', coverMissed = false;
  if (cv) { coverUrl = await rymBestCover(cv.url); if (coverUrl) payload.Cover = coverUrl; else coverMissed = true; }          // saved only if it loads from here (the largest size that does): the deck shows a saved cover as it is
  const madeRows = picks.filter(p => p.key !== 'cover' || !coverMissed); let nextLog = null, firstAt = '';          // what was really changed goes in the log (a cover that could not be loaded was not)
  if (madeRows.length) { nextLog = rymParseLog(item.rymUpdateLog).concat([rymLogEntry(madeRows, src)]).slice(-RYM_LOG_MAX); payload.RymUpdateLog = rymLogJson(nextLog); if (!item.rymUpdated) { firstAt = new Date().toISOString(); payload.RymUpdated = firstAt; } }
  if (Object.keys(payload).length > 2) { await postUpdate(payload); picks.forEach(p => { if (map[p.key]) item[map[p.key][1]] = p.proposed; }); if (coverUrl) item.cover = coverUrl; if (nextLog) { item.rymUpdateLog = nextLog; if (firstAt) item.rymUpdated = firstAt; rymLogLocalSet(item); } }
  const tr = picks.find(p => p.key === 'tracks');
  if (tr) { await saveManualTracklist(item, tr.rows, quiet); await tlApplyTrackRatings(item, tr.rows); }
  const ts = picks.find(p => p.key === 'trackStats'), tk = picks.find(p => p.key === 'trackLinks');
  if (ts || tk) await tlApplyTrackRatings(item, [].concat(ts ? ts.rows : [], tk ? tk.rows : []), true);          // numbers kept by title; RYM's track ratings where a track has none, or where the saved one is RYM's own (or a rounded reading of it)
  return { coverMissed };
}
async function rymBestCover(url) {                                  // the largest size of this picture that really loads from here, or '' if none does (all sizes asked at once: a host that refuses costs one wait, not five)
  const cands = rymCoverCandidates(url), ok = await Promise.all(cands.map(c => cxProbe(c))), i = ok.findIndex(Boolean);
  return i < 0 ? '' : cands[i];
}
async function rymApplyUpdate() {
  const st = rymUpd; if (!st) return;
  const $ = (id) => document.getElementById(id), chosen = new Set([...document.querySelectorAll('#rymUpdBody [data-upd]:checked')].map(c => c.dataset.upd));
  if (!chosen.size) { $('rymUpdMsg').textContent = 'Nothing is ticked.'; return; }
  const item = st.item, picks = st.plan.filter(p => chosen.has(p.key)); $('rymUpdApply').disabled = true; $('rymUpdMsg').textContent = 'Updating\u2026';
  try {
    const wr = await rymWritePicks(item, picks, undefined, 'review');
    rymBatchDone([st.batch.id]);
    flashGlobalToast(`Updated \u201c${item.title}\u201d from Rate Your Music: ${picks.filter(p => p.key !== 'cover' || !wr.coverMissed).map(p => p.label.toLowerCase()).join(', ')}.${wr.coverMissed ? ' The cover couldn’t be loaded from here, so it was left as it was.' : ''}`);
    rymUpdateClose();
    try { await fetchCatalog({ quiet: true }); } catch (e) { /* the sheet is updated; the list refreshes next time */ }
  } catch (e) { $('rymUpdMsg').textContent = 'Couldn\u2019t update \u2014 try again.'; $('rymUpdApply').disabled = false; }
}
// "Apply all": every waiting update, at once, with only what is NEW ticked (a blank filled, a date made more precise, a tracklist where there is none). Anything that DIFFERS from what you
// have is never applied here: that release keeps waiting so you can review it on its own.
async function rymUpdateAllWaiting() {
  const ups = rymOutState.batches.filter(b => b.kind === 'update'); if (!ups.length) return;
  const r = { updated: 0, fields: 0, same: 0, missing: 0, review: 0, failed: 0, coverMissed: 0 }, done = [];
  flashGlobalToast(`Updating ${ups.length} release${ups.length === 1 ? '' : 's'} from Rate Your Music\u2026`);
  for (const [bi, b] of ups.entries()) {
    bgStatus(`Updating from Rate Your Music \u2014 ${bi + 1} of ${ups.length}`, bi / ups.length * 100, { always: true });
    const rel = b.releases && b.releases[0]; if (!rel) { done.push(b.id); continue; }
    try {
      const hit = rymMatchEntry(rymBuildIndex(state.raw, dupKey), { p: rel.rymLink, ar: rel.artist, ti: rel.title, ty: rel.type, y: String(rel.releaseDate || '').slice(0, 4) });
      if (!hit || !hit.item) { if (hit && hit.ambiguous) r.review++; else { r.missing++; done.push(b.id); } continue; }
      const item = hit.item;
      if (rel.tracks && rel.tracks.length >= 2) { try { await getTracksFor(item); } catch (e) { /* nothing to compare with */ } }
      const plan = rymUpdatePlan(item, rel, currentTracklistAsManualRows(item), tlMinNext(item)), picks = plan.filter(p => p.checked);
      if (picks.length) { const wr = await rymWritePicks(item, picks, true, 'together'); const made = picks.length - (wr.coverMissed ? 1 : 0); if (wr.coverMissed) r.coverMissed++; if (made) { r.updated++; r.fields += made; } } else if (!plan.length) r.same++;
      if (plan.length > picks.length) r.review++; else done.push(b.id);
    } catch (e) { r.failed++; }                                           // it stays waiting: try again
  }
  if (done.length) rymBatchDone(done);
  bgStatusHide();
  try { await fetchCatalog({ quiet: true }); } catch (e) { /* the sheet is updated; the list refreshes next time */ }
  const parts = [`Updated ${r.updated} release${r.updated === 1 ? '' : 's'}${r.updated ? ` (${r.fields} change${r.fields === 1 ? '' : 's'})` : ''}`];
  if (r.same) parts.push(`${r.same} already up to date`); if (r.missing) parts.push(`${r.missing} not in your crate`);
  if (r.review) parts.push(`${r.review} ${r.review === 1 ? 'has' : 'have'} differences left for you to review`); if (r.failed) parts.push(`${r.failed} couldn\u2019t be updated \u2014 try again`); if (r.coverMissed) parts.push(`${r.coverMissed} cover${r.coverMissed === 1 ? '' : 's'} couldn\u2019t be loaded from here and ${r.coverMissed === 1 ? 'was' : 'were'} left as ${r.coverMissed === 1 ? 'it was' : 'they were'}`);
  flashGlobalToast(parts.join('; ') + '.');
}
// "Fill tracklists from Rate Your Music": releases with no saved tracklist, for which the add-on has seen the tracklist on Rate Your Music while you browsed
function rymUpdateNever() {                                      // every release with a Rate Your Music link that has never had its first update, 25 at a time
  el.layoutMenu.hidden = true;
  const never = state.raw.filter(it => !it.rymUpdated && rymUpdateUrl(it)), noLink = state.raw.filter(it => !it.rymUpdated && !rymUpdateUrl(it)).length;
  if (!never.length) { flashGlobalToast(noLink ? `Every release with a Rate Your Music link has had its first update (${noLink} have no link to open).` : 'Every release has had its first update from Rate Your Music.'); return; }
  const use = never.slice(0, 25);
  flashGlobalToast(`${never.length} release${never.length === 1 ? '' : 's'} with a Rate Your Music link ${never.length === 1 ? 'has' : 'have'} not had a first update yet${noLink ? ` (and ${noLink} ${noLink === 1 ? 'has' : 'have'} no link to open)` : ''}${never.length > use.length ? `: starting with ${use.length}; run it again for the rest` : ''}.`);
  rymFetchUpdates(use);
}
async function rymFillTracklists() {
  el.layoutMenu.hidden = true;
  const list = await rymAskTracklists();
  if (list === null) { flashGlobalToast('No answer from the add-on. It has to be installed, connected to this CRATE, and version 1.6 or newer.'); return; }
  const good = list.filter(e => !e.wrong), cands = [];
  state.raw.forEach(it => { if (isManualAlbum(it)) return; const e = tlRymPick(good, { artist: it.artist, title: it.title, type: it.type, releaseDate: it.releaseDate, rymLink: it.rymLink }); if (e) cands.push({ it, e }); });
  if (!cands.length) { flashGlobalToast('Nothing to fill: none of the releases without a saved tracklist is one the add-on has seen on Rate Your Music. Open their release pages there (it saves the tracklist as you browse), then try again.'); return; }
  const sample = cands.slice(0, 4).map(c => `${c.it.artist} \u2014 ${c.it.title} (${c.e.tracks.length} tracks)`).join('\n');
  if (!confirm(`${cands.length} release${cands.length === 1 ? '' : 's'} in your crate ${cands.length === 1 ? 'has' : 'have'} no saved tracklist, and the add-on has seen ${cands.length === 1 ? 'its' : 'their'} tracklist${cands.length === 1 ? '' : 's'} on Rate Your Music.\n\nFill ${cands.length === 1 ? 'it' : 'them'} from there?\n\n${sample}${cands.length > 4 ? '\n\u2026' : ''}\n\nThey switch from the automatic lookup to the saved list (with lengths and headings); nothing else about them changes.`)) return;
  flashGlobalToast(`Filling ${cands.length} tracklist${cands.length === 1 ? '' : 's'}\u2026`);
  let ok = 0, failed = 0;
  for (const c of cands) {
    try { const rows = tlAssignNumbers([], c.e.tracks.map(t => ({ title: t.title, durationMs: t.durationMs || 0, section: t.section || '', s: 'rym', rymRating: t.rating || 0, rymVotes: t.votes || 0, rymLink: t.url || '' })), tlMinNext(c.it)).rows; await saveManualTracklist(c.it, rows, true); await tlApplyTrackRatings(c.it, rows); ok++; }
    catch (e) { failed++; }
  }
  try { await fetchCatalog({ quiet: true }); } catch (e) { /* the sheet is updated; the list refreshes next time */ }
  flashGlobalToast(`Filled ${ok} tracklist${ok === 1 ? '' : 's'}${failed ? `; ${failed} couldn\u2019t be saved \u2014 try again` : ''}.`);
}
// Everything waiting that ADDS releases, as ONE batch: 15 sent from one page and 15 from the next are one review of 30, not two. A release on more than one page (same RYM address, else the same artist and
// title) is listed once, with the blanks of one filled from the other. Oldest page first, so the review reads in the order you sent them.
function rymMergeBatches(batches) {
  const list = (batches || []).filter(b => b && b.kind !== 'update' && b.releases && b.releases.length); if (!list.length) return null;
  const seen = new Map(), out = []; let dupes = 0;
  list.slice().reverse().forEach(b => b.releases.forEach(r => {
    const k = rymPathOfUrl(r.rymLink) || ('t:' + dupKey(r.artist, r.title)), first = seen.get(k);
    if (!first) { const c = Object.assign({}, r); seen.set(k, c); out.push(c); return; }
    dupes++;
    Object.keys(r).forEach(f => { if (f === 'tracks') { if ((!first.tracks || !first.tracks.length) && r.tracks && r.tracks.length) first.tracks = r.tracks; } else if (f === 'cover') { if (r.cover && (!first.cover || (rymIsRymImage(first.cover) && rymIsRymImage(r.cover) && rymCoverBetter(r.cover, first.cover)))) first.cover = r.cover; } else if (!String(first[f] == null ? '' : first[f]).trim() && String(r[f] == null ? '' : r[f]).trim()) first[f] = r[f]; });          // (the release page's cdn.sonemic.net picture beats the genre page's small e.snmc.io one, whichever came first)
  }));
  const names = list.slice().reverse().map(b => b.source && b.source.title).filter(Boolean);
  return { id: list[0].id, ids: list.map(b => b.id), kind: 'list', genre: list.length === 1 ? list[0].genre : '', source: { url: '', title: list.length === 1 ? (names[0] || '') : `${list.length} pages (${names.slice(0, 3).join('; ')}${names.length > 3 ? '; \u2026' : ''})` }, releases: out, dupes };
}
function openRymBatch(batch) {
  if (!batch) return;
  const merged = rymMergeBatches(rymOutState.batches);
  if (merged) openRymImport(merged);                                    // anything that adds releases: ONE review of all of it
  else if (batch.kind === 'update') { if (state.rymQueueMode) rymQOpen(); else openRymUpdate(batch); }          // updates: the queue (or, if you turned it off, one screen each)
  else openRymImport(batch);
}
function openRymImport(batch) {
  if (!batch) return;
  openCxImport();
  cxImpRead(JSON.stringify({ format: CX_FORMAT, version: CX_VERSION, releases: batch.releases.map(r => Object.assign({}, r, { tracks: r.tracks && r.tracks.length >= 2 ? r.tracks : [] })) }));
  if (cxImp) { cxImp.rym = { ids: batch.ids || [batch.id] }; const src = cxEl('cxImpSource'); src.textContent = `From Rate Your Music: ${batch.source.title || 'a page you sent'}${batch.genre ? ' \u00b7 genre ' + batch.genre : ''}.${batch.dupes ? ` ${batch.dupes} release${batch.dupes === 1 ? ' was' : 's were'} on more than one page and ${batch.dupes === 1 ? 'is' : 'are'} listed once.` : ''} Nothing is added until you press Add.`; src.hidden = false; }
}
async function rymImportFromMenu() {
  el.layoutMenu.hidden = true;
  const list = await rymAskOutbox();
  if (list === null) { flashGlobalToast('No answer from the add-on. It has to be installed, connected to this CRATE, and version 1.7 or newer.'); return; }
  if (!list.length) { flashGlobalToast('Nothing is waiting from Rate Your Music. On one of its release, genre, artist or chart pages, press \u201cSend to CRATE\u201d.'); return; }
  openRymBatch(list[0]);
}
async function rymTidyNames() {                                     // ⚙ → "Tidy artist names…": releases whose saved artist picked up a Rate Your Music page's wording
  el.layoutMenu.hidden = true;
  const bad = state.raw.filter(it => rymTidyName(it.artist) !== String(it.artist || '').trim());
  if (!bad.length) { flashGlobalToast('No artist names to tidy: none of them has the \u201c(Album, \u2026): Reviews, Ratings\u2026\u201d text from a Rate Your Music page.'); return; }
  const sample = bad.slice(0, 3).map(it => `\u201c${it.artist}\u201d \u2192 \u201c${rymTidyName(it.artist)}\u201d`).join('\n');
  if (!confirm(`${bad.length} release${bad.length === 1 ? '' : 's'} in your crate ${bad.length === 1 ? 'has' : 'have'} an artist name that includes text copied from a Rate Your Music page.\n\nTidy ${bad.length === 1 ? 'it' : 'them'}?\n\n${sample}${bad.length > 3 ? '\n\u2026' : ''}\n\nOnly the artist name is changed.`)) return;
  flashGlobalToast(`Tidying ${bad.length} artist name${bad.length === 1 ? '' : 's'}\u2026`);
  let ok = 0, failed = 0;
  for (const it of bad) { try { await postUpdate({ action: 'editAlbum', row: it.row, Artist: rymTidyName(it.artist) }); ok++; } catch (e) { failed++; } }          // one field each: the backend leaves everything else as it is
  try { await fetchCatalog({ quiet: true }); } catch (e) { /* the sheet is updated; the list refreshes next time */ }
  flashGlobalToast(`Tidied ${ok} artist name${ok === 1 ? '' : 's'}${failed ? `; ${failed} couldn\u2019t be changed \u2014 try again` : ''}.`);
}
function tlSourceLine(item) {                                       // under the deck's tracklist: where this list came from
  if (!item || !isManualAlbum(item)) return '';
  const text = tlSourceText(item.manualTracks); if (!text) return '';
  const at = (item.manualTracks.find(t => t && t.at) || {}).at;
  return `<p class="tracklist-source">Tracklist ${escapeHtml(text)}${at ? ' \u00b7 saved ' + escapeHtml(rymDateText(at)) : ''}</p>`;
}
function tlAddTrackFromDeck(item) {                                 // the deck's "+ Add track": the same editor as Edit, with the current list loaded and a new row ready
  if (!item) return; openEditModal();
  if (!isManualAlbum(item)) loadCurrentTracklistIntoBuilder();
  const row = addTracklistBuilderRow(el.editTracksRows), input = row.querySelector('.tracklist-builder-title');
  setTimeout(() => { row.scrollIntoView({ block: 'center' }); input.focus(); }, 60);
}
// END tl-ui

// YouTube's picker only works once an API key is configured (\u2699 \u2192
// YouTube API\u2026) — without one, its button falls back to the original
// "open a real YouTube search tab" behavior. Spotify always opens the
// inline picker (Spotify's search needs no per-user key — see
// getSpotifyToken). Only one row's picker is open at a time.
function handleTracklistMatchBtnClick(btn, getArtist) {
  const kind = btn.dataset.matchKind;
  const row = btn.closest('.tracklist-builder-row');
  const container = row.parentElement;
  const title = row.querySelector('.tracklist-builder-title').value.trim();
  if (!title) { flashGlobalToast('Type a track title first.'); return; }
  const artist = (getArtist() || '').trim();

  if (kind === 'youtube' && !loadYoutubeApiKey()) {
    window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(artist + ' ' + title), '_blank');
    return;
  }

  const panel = row.querySelector('.tracklist-builder-match-panel');
  const alreadyOpenHere = !panel.hidden && panel.dataset.openKind === kind;
  closeAllTracklistMatchPanels(container);
  if (alreadyOpenHere) return; // clicking the same row's open button again just closes it

  panel.hidden = false;
  panel.dataset.openKind = kind;
  loadTracklistRowMatches(panel, row, kind, artist, title);
}

function closeAllTracklistMatchPanels(container) {
  container.querySelectorAll('.tracklist-builder-match-panel').forEach(p => { p.hidden = true; p.innerHTML = ''; delete p.dataset.openKind; });
}

async function loadTracklistRowMatches(panel, row, kind, artist, title) {
  const targetInput = row.querySelector(kind === 'spotify' ? '.tracklist-builder-sp' : '.tracklist-builder-yt');
  const label = kind === 'spotify' ? 'Spotify' : 'YouTube';
  const manualSearchUrl = kind === 'spotify'
    ? `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`;
  // Always present, results or not — an unusual/short artist name (an
  // abbreviation, a common word, etc.) can make the API's own relevance
  // ranking return confidently wrong results rather than nothing at all,
  // which "no matches found" wouldn't cover. This is a fast way out
  // without closing the panel and hunting for a way to search manually.
  const manualSearchLinkHtml = `<a href="${escapeHtml(manualSearchUrl)}" target="_blank" rel="noopener" class="tracklist-builder-hint tracklist-builder-match-manual-link">None of these right? Search ${label} yourself \u2197</a>`;
  panel.innerHTML = `<p class="tracklist-builder-hint">Looking up matches on ${label}\u2026</p>`;
  const raw = kind === 'spotify' ? await spotifyTrackCandidatesLive(artist, title) : await youtubeSearchCandidates(artist, title);
  if (panel.hidden || panel.dataset.openKind !== kind) return; // closed, or switched to the other platform, while this was in flight
  if (!raw.length) { panel.innerHTML = `<p class="tracklist-builder-hint">No ${label} matches found.</p>${manualSearchLinkHtml}`; return; }
  const candidates = toMatchCandidates(kind, raw);
  const currentId = kind === 'spotify'
    ? (() => { const uri = trackSpotifyUriFromLink(targetInput.value.trim()); return uri && uri.startsWith('spotify:track:') ? uri.slice('spotify:track:'.length) : null; })()
    : (targetInput.value.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/) || [])[1] || null;
  renderMatchCandidateList(panel, candidates, currentId, kind, targetInput, () => {
    // Collapse the panel the moment a pick is made, rather than leaving a
    // (possibly long) results list sitting open — see the comment on
    // renderMatchCandidateList's onAfterUse param.
    panel.hidden = true;
    panel.innerHTML = '';
    delete panel.dataset.openKind;
    flashGlobalToast(`${label} link set \u2014 click Match again to change it.`);
  });
  panel.insertAdjacentHTML('beforeend', manualSearchLinkHtml);
}

function showAddForm(prefill) {
  refreshGenreAutocompleteList();
  el.addForm.hidden = false;
  el.addArtist.value = prefill.artist || '';
  el.addTitle.value = prefill.title || '';
  const validTypes = ['Album', 'EP', 'Single', 'Compilation', 'Live', 'Mixtape'];
  el.addType.value = validTypes.includes(prefill.type) ? prefill.type : 'Album';
  setReleaseDateFields('add', prefill.releaseDate || '');
  setRecordedDateFields('add', prefill.recordedDate || '');
  el.addGenre.value = prefill.genre || '';
  el.addGenre2.value = prefill.genre2 || '';
  el.addRegion.value = prefill.region || '';
  el.addLocation.value = prefill.location || '';
  el.addLabel.value = prefill.label || '';
  el.addCatalog.value = prefill.catalog || ''; // 👈 ADD THIS
  el.addLink.value = prefill.link || '';
  el.addRymLink.value = prefill.rymLink || '';
  rymEl('addRymRating').value = ''; rymEl('addRymVotes').value = '';
  el.addCover.value = prefill.cover || '';
  el.addToast.textContent = '';
  addMatchSeq++; addMatchLast = null; addMatchLastSig = ''; addMatchStatus('');      // a different release: nothing from the last one may carry over
  renderTracklistBuilderRows(el.addTracksRows, prefill.manualTracks || []);
  tlResetTools('add');
  if ((prefill.manualTracks || []).length && state.autoMatchOnAdd) autoMatchAddForm();
  addDupState = { verdict: 'none', matches: [], confirmed: false, sig: '' }; addDupRefresh();      // is this already in the crate?
  hideAddSpotifyMatchBanner();
  hideAddMusicBrainzMatchBanner();
  // MusicBrainz is only offered once Spotify's own lookup has finished and
  // came up empty — see maybeOfferAddMusicBrainzTracklist — so the two
  // banners never compete over the same tracklist-builder rows.
  maybeOfferAddSpotifyTracklist(prefill).then(() => maybeOfferAddMusicBrainzTracklist(prefill));
}

// The tracklist currently on offer in addSpotifyMatchBanner — populated by
// maybeOfferAddSpotifyTracklist, consumed by the banner's "Add tracks"
// button, cleared the moment the banner's dismissed/hidden/superseded.
let pendingAddSpotifyTracklist = null;
// Bumped every time the Add form moves on to a different release (a new
// showAddForm call, or the modal closing) so a slow in-flight Spotify
// lookup from a release the user has already navigated away from can't
// pop the banner back up after the fact.
let addSpotifyMatchSeq = 0;

function hideAddSpotifyMatchBanner() {
  addSpotifyMatchSeq++;
  pendingAddSpotifyTracklist = null;
  if (el.addSpotifyMatchBanner) el.addSpotifyMatchBanner.hidden = true;
}

// Looks up this artist/title on Spotify in the background right after the
// Add form is shown and, if a match with a real tracklist turns up, offers
// to fill the tracklist builder with it via addSpotifyMatchBanner. This is
// what makes a freshly-added album's tracks searchable right away — a
// tracklist that only ever comes from the lazy MusicBrainz auto-lookup
// (see loadTracklist) is never written to manualTracks, and combinedSearchText
// (1.29.44) can only search track titles that are. Skipped when the form
// already has a tracklist (nothing to offer), or artist/title aren't both
// known yet (e.g. "Enter it manually" from a bare query has no artist).
async function maybeOfferAddSpotifyTracklist(prefill) {
  if ((prefill.manualTracks || []).length) return;
  const artist = (prefill.artist || '').trim();
  const title = (prefill.title || '').trim();
  if (!artist || !title) return;

  const mySeq = ++addSpotifyMatchSeq;
  const match = await spotifyFindAlbumTracklist(artist, title);
  if (mySeq !== addSpotifyMatchSeq) return; // form moved on to a different release, or closed, while this was in flight
  if (!match) return;
  if (collectTracklistBuilderRows(el.addTracksRows).length) return; // user already typed something in while we were looking

  pendingAddSpotifyTracklist = match.tracks;
  el.addSpotifyMatchText.textContent = `Found a matching tracklist on Spotify (${match.tracks.length} track${match.tracks.length === 1 ? '' : 's'}) — add it to this release?`;
  el.addSpotifyMatchBanner.hidden = false;
}

// The tracklist currently on offer in addMusicBrainzMatchBanner — same
// role as pendingAddSpotifyTracklist above.
let pendingAddMusicBrainzTracklist = null;
let addMusicBrainzMatchSeq = 0;

function hideAddMusicBrainzMatchBanner() {
  addMusicBrainzMatchSeq++;
  pendingAddMusicBrainzTracklist = null;
  if (el.addMusicBrainzMatchBanner) el.addMusicBrainzMatchBanner.hidden = true;
}

// Fetches the full tracklist for one specific MusicBrainz release (by
// MBID), in the {trackNumber, title} shape the tracklist builder expects
// (same shape spotifyFindAlbumTracklist returns) — same recordings lookup
// + continuous-numbering-across-media logic getTracksFor's own MusicBrainz
// fallback uses (see the ATTEMPT 2 comment there), kept as its own
// function since that one lives deep in the playback path and this needs
// to run standalone, before the album is even saved.
async function mbFetchTracklistForRelease(mbid) {
  if (!mbid) return [];
  try {
    const mbRes = await mbFetch(`https://musicbrainz.org/ws/2/release/${mbid}?inc=recordings&fmt=json`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }
    });
    if (!mbRes.ok) return [];
    const mbData = await mbRes.json();
    const tracks = [];
    let trackCounter = 1;
    (mbData.media || []).forEach(media => {
      (media.tracks || []).forEach(t => {
        tracks.push({ trackNumber: trackCounter, title: t.title || (t.recording && t.recording.title) || 'Unknown Track', durationMs: t.length || (t.recording && t.recording.length) || 0 });
        trackCounter++;
      });
    });
    return tracks;
  } catch (e) {
    console.warn('MusicBrainz release tracklist fetch failed', e);
    return [];
  }
}

// Mirrors maybeOfferAddSpotifyTracklist above, but sourced from the exact
// MusicBrainz release the person already picked (prefill.link, set by
// renderReleasePickerResults when a specific pressing is chosen) rather
// than a fresh guess-based search — this is the literal release+pressing
// they selected, so its tracklist is that release's actual tracklist, not
// a fuzzy match. Only runs once the Spotify offer has finished and found
// nothing, so a release that's on both doesn't show two competing banners.
async function maybeOfferAddMusicBrainzTracklist(prefill) {
  if ((prefill.manualTracks || []).length) return;
  if (pendingAddSpotifyTracklist) return; // Spotify already has an offer up
  const mbidMatch = (prefill.link || '').match(/musicbrainz\.org\/release\/([a-f0-9-]+)/);
  if (!mbidMatch) return; // no specific pressing was picked — nothing to fetch by ID

  const mySeq = ++addMusicBrainzMatchSeq;
  const tracks = await mbFetchTracklistForRelease(mbidMatch[1]);
  if (mySeq !== addMusicBrainzMatchSeq) return; // form moved on, or closed, while this was in flight
  if (!tracks.length) return;
  if (collectTracklistBuilderRows(el.addTracksRows).length) return; // user already typed something in
  if (pendingAddSpotifyTracklist) return; // Spotify's own lookup won the race while this was in flight

  pendingAddMusicBrainzTracklist = tracks;
  el.addMusicBrainzMatchText.textContent = `Found this release\u2019s tracklist on MusicBrainz (${tracks.length} track${tracks.length === 1 ? '' : 's'}) — add it to this release?`;
  el.addMusicBrainzMatchBanner.hidden = false;
}

async function saveNewAlbum() {
  const artist = el.addArtist.value.trim();
  const title = el.addTitle.value.trim();
  if (!artist || !title) { flashToast(el.addToast, 'Artist and title are required'); return; }
  if (!(await addDupGuard())) return;      // already in the crate? (see "Duplicate protection when adding")

  let manualTracks = collectTracklistBuilderRows(el.addTracksRows);
  // A last pass for songs that were typed in (or changed) and haven't been matched yet. It can never get in the way of saving:
  // it only runs when something has changed since the last run, it is capped at 25 seconds, and any failure just saves what
  // is in the form.
  if (manualTracks.length && state.autoMatchOnAdd && manualTracks.some(t => !t.spotifyLink) && addFormSignature() !== addMatchLastSig) {
    const label = el.addSaveBtn.textContent; el.addSaveBtn.disabled = true; el.addSaveBtn.textContent = 'Matching songs\u2026';
    try { await Promise.race([autoMatchAddForm(), new Promise(res => setTimeout(res, 25000))]); } catch (e) { console.warn('match before save failed', e); }
    el.addSaveBtn.textContent = label; addDupRefresh();
    manualTracks = collectTracklistBuilderRows(el.addTracksRows);
  }

  const payload = {
    action: 'addAlbum', Artist: artist, Title: title, Type: el.addType.value,
    ReleaseDate: getReleaseDateFields('add'), Recorded: getRecordedDateFields('add'), Genre: el.addGenre.value.trim(), 
    SecondaryGenre: el.addGenre2.value.trim(),
    Region: el.addRegion.value.trim(),
    Location: el.addLocation.value.trim(), // 👈 Map viewer — REQUIRES BACKEND COLUMN, see 1.29.14 log entry
    Label: el.addLabel.value.trim(), Catalog: el.addCatalog.value.trim(), // 👈 ADD CATALOG
    Descriptor: el.addDescriptor.value.trim(),
    RymDescriptors: descNormalizeField((document.getElementById('addRymDescriptors') || {}).value),
    Scene: el.addScene.value.trim(),
    Movement: el.addMovement.value.trim(),
    Link: el.addLink.value.trim(), RymLink: el.addRymLink.value.trim(), Cover: el.addCover.value.trim(),
    RymRating: rymNum(rymEl('addRymRating').value) || '', RymVotes: rymNum(rymEl('addRymRating').value) ? (rymVotesNum(rymEl('addRymVotes').value) || '') : '', RymSrc: rymNum(rymEl('addRymRating').value) ? 'm' : ''
  };
  // Only write ManualTracks when the tracklist builder actually has rows in
  // it — e.g. picking a release from a MusicBrainz/Spotify search never
  // fills these in (the real tracklist comes later from the iTunes/
  // MusicBrainz auto-lookup once the album's saved and opened), so writing
  // "[]" here would mark a brand-new album manual-with-zero-tracks (see
  // isManualAlbum/hasManualTracklist) and permanently block that
  // auto-lookup from ever showing anything. Omitting the field entirely
  // leaves the new row's ManualTracks cell untouched/blank instead.
  if (manualTracks.length) payload.ManualTracks = JSON.stringify(tlPersist(manualTracks, 'typed'));
  try {
    const addRes = await postUpdate(payload);
    rymAfterAdd(payload, addRes);
    { const linked = manualTracks.filter(t => t.spotifyLink).length; flashToast(el.addToast, state.autoMatchOnAdd && linked ? `Added to your crate \u00b7 ${linked} of ${manualTracks.length} songs linked on Spotify` : 'Added to your crate'); }
    setTimeout(async () => { if (lfAddQueue) lfAddQueue.advancing = true; closeAddModal(); await fetchCatalog({ quiet: true }); await lfAfterAdd(); }, 700);    // lfAfterAdd: log this album's stored Last.fm plays, and open the next album of a Last.fm review
  } catch (err) {
    // err.message now carries the backend's own error text when this was
    // a generic (non-auth) failure — see postUpdate's own comment — rather
    // than a flat "try again" that gives no hint whether this is a real,
    // recurring problem (e.g. a spreadsheet access issue) or a one-off
    // network blip.
    flashToast(el.addToast, err && err.message && err.message !== 'unauthorized' ? `Couldn\u2019t save: ${err.message}` : 'Couldn\u2019t save — try again');
  }
}
