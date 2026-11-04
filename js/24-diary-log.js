// CRATE — diary entry detail, diary logging.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Diary entry detail modal (compendium view) ---------- */

let activeDiaryEntry = null;
let diaryEntryDeleteConfirm = false;

function openDiaryEntryModal(entry) {
  activeDiaryEntry = entry;
  diaryEntryDeleteConfirm = false;
  const match = matchAlbumForEntry(entry);

  el.diaryEntryImg.src = coverArtForEntry(entry);
  el.diaryEntryEntryTitle.textContent = entry.entryTitle || '';
  el.diaryEntryEntryTitle.hidden = !entry.entryTitle;
  el.diaryEntryTitle.textContent = entry.title;
  el.diaryEntryArtist.textContent = entry.artist;
  el.diaryEntryDate.textContent = diaryDateLabel(entry);
  el.diaryEntryRating.innerHTML = entry.rating ? starRatingHtml(entry.rating) : '<span class="diary-empty">Unrated</span>';
  el.diaryEntryNote.textContent = entry.description || '';
  el.diaryEntryNote.hidden = !entry.description;

  const tracks = entry.tracks || [];
  if (entry.full) {
    el.diaryEntryTracksWrap.innerHTML = '<p class="diary-entry-tracks-full">\ud83c\udfa7 The whole album, start to finish.</p>';
  } else if (tracks.length) {
    el.diaryEntryTracksWrap.innerHTML = `<ul class="diary-entry-tracks-list">${tracks.map(t => `<li>${escapeHtml(t.name)}</li>`).join('')}</ul>`;
  } else {
    el.diaryEntryTracksWrap.innerHTML = '<p class="diary-empty">No track detail was recorded for this listen.</p>';
  }

  el.diaryEntryOpenAlbumBtn.hidden = !match;
  resetDiaryEntryDeleteBtn();
  el.diaryEntryModal.hidden = false;
}

function closeDiaryEntryModal() {
  el.diaryEntryModal.hidden = true;
  activeDiaryEntry = null;
}

function resetDiaryEntryDeleteBtn() {
  diaryEntryDeleteConfirm = false;
  el.diaryEntryDeleteBtn.textContent = 'Delete entry';
  el.diaryEntryDeleteBtn.classList.remove('confirm');
}

// Deletes an entry directly from the compendium view, where there's no
// per-album `currentDeckDiaryEntries` index to work from -- matches the
// same way deleteLogEntry() does (row/artist/title/date/timestamp).
async function deleteDiaryEntryDirect(entry) {
  if (!diaryEntryDeleteConfirm) {
    diaryEntryDeleteConfirm = true;
    el.diaryEntryDeleteBtn.textContent = 'Click again to confirm';
    el.diaryEntryDeleteBtn.classList.add('confirm');
    return;
  }
  const payload = {
    action: 'deleteListen', row: entry.row, artist: entry.artist, title: entry.title,
    date: entry.date, timestamp: entry.timestamp
  };
  try {
    await postUpdate(payload);
    const idx = state.diary.indexOf(entry);
    if (idx !== -1) state.diary.splice(idx, 1);
    closeDiaryEntryModal();
    renderDiary();
    if (activeItem && activeItem.artist === entry.artist && activeItem.title === entry.title) renderDeckDiaryList(activeItem);
    flashGlobalToast('Entry deleted');
  } catch (err) {
    flashToast(el.diaryEntryToast, 'Couldn\u2019t delete \u2014 try again');
    resetDiaryEntryDeleteBtn();
  }
}

/* ---------- Diary logging (per-album, inside the deck) ---------- */

function renderLogStars(r) {
  logRating = r;
  const btns = paintStarButtons(el.logStars, 5, r);
  btns.forEach(b => b.classList.add('small'));
}

let editingEntryIdx = null;       // index into currentDeckDiaryEntries; null = the form is creating a new entry
let currentDeckDiaryEntries = []; // the sorted entries currently rendered in the deck's diary list
let deleteEntryConfirmIdx = null; // index awaiting a second click to confirm deletion
let deleteEntryConfirmTimeout = null;

function resetLogForm() {
  editingEntryIdx = null;
  el.logForm.hidden = true;
  el.logSaveBtn.textContent = 'Save entry';
}

async function saveLogEntry() {
  if (!activeItem) return;
  if (editingEntryIdx !== null) { await updateLogEntry(); return; }
  const selectedTracks = getSelectedTracksForItem(activeItem);
  const isFull = currentTracklistTracks.length > 0 && selectedTracks.length === currentTracklistTracks.length;
  const payload = {
    action: 'logListen', row: activeItem.row, artist: activeItem.artist, title: activeItem.title,
    date: el.logDate.value, rating: logRating, entryTitle: el.logEntryTitle.value, description: el.logDescription.value,
    tracks: JSON.stringify(selectedTracks), full: isFull
  };
  try {
    await postUpdate(payload);
    state.diary.push({ 
      date: payload.date, 
      timestamp: new Date().toISOString(), // Added this line
      artist: payload.artist, 
      title: payload.title, 
      row: payload.row, 
      rating: payload.rating, 
      entryTitle: payload.entryTitle,
      description: payload.description,
      tracks: selectedTracks,
      full: isFull
    });
    el.logForm.hidden = true;
    renderDeckDiaryList(activeItem);
    flashToast(el.deckToast, isFull ? 'Full album logged to diary' : selectedTracks.length ? `Logged ${selectedTracks.length} track${selectedTracks.length === 1 ? '' : 's'} to diary` : 'Logged to diary');
    // Selection is "spent" once it's saved to an entry — clear the
    // checkmarks so the next listen (partial or full) starts at zero.
    if (selectedTracks.length) await clearTrackSelection(activeItem);
  } catch (err) {
    flashToast(el.deckToast, 'Couldn\u2019t save — try again');
  }
}

function openEditEntry(idx) {
  const entry = currentDeckDiaryEntries[idx];
  if (!entry) return;
  editingEntryIdx = idx;
  el.logForm.hidden = false;
  el.logDate.value = dateVal(entry.date) !== -Infinity ? new Date(entry.date).toISOString().slice(0, 10) : '';
  renderLogStars(entry.rating || 0);
  el.logEntryTitle.value = entry.entryTitle || '';
  el.logDescription.value = entry.description || '';
  el.logSaveBtn.textContent = 'Update entry';
  el.logDate.focus();
  // Editing only touches date/rating/note — the tracks an entry covers are
  // fixed at save time, so show them read-only and lock the shortcuts.
  const tracks = entry.tracks || [];
  el.logTrackSummary.textContent = entry.full
    ? 'Full album listen \u2014 tracks aren\u2019t editable, only date/rating/note.'
    : tracks.length
      ? `Tracks logged: ${tracks.map(t => t.name).join(', ')} \u2014 not editable here.`
      : 'No tracks were recorded for this entry.';
  el.logSelectAllBtn.disabled = true;
  el.logClearSelectionBtn.disabled = true;
}

async function updateLogEntry() {
  const entry = currentDeckDiaryEntries[editingEntryIdx];
  if (!entry || !activeItem) { resetLogForm(); return; }
  // NOTE: this sends an 'editListen' action — the backend (Apps Script) needs
  // a matching handler that locates the row via row/artist/title/originalDate/
  // originalTimestamp and overwrites its Date/Rating/Title/Description. Without
  // that, this updates CRATE locally but won't persist past a refresh.
  const payload = {
    action: 'editListen', row: activeItem.row, artist: activeItem.artist, title: activeItem.title,
    originalDate: entry.date, originalTimestamp: entry.timestamp,
    date: el.logDate.value, rating: logRating, entryTitle: el.logEntryTitle.value, description: el.logDescription.value
  };
  try {
    await postUpdate(payload);
    entry.date = payload.date;
    entry.rating = payload.rating;
    entry.entryTitle = payload.entryTitle;
    entry.description = payload.description;
    resetLogForm();
    renderDeckDiaryList(activeItem);
    flashToast(el.deckToast, 'Entry updated');
  } catch (err) {
    flashToast(el.deckToast, 'Couldn\u2019t save — try again');
  }
}

function onDiaryDeleteClick(idx) {
  if (deleteEntryConfirmIdx === idx) {
    clearTimeout(deleteEntryConfirmTimeout);
    deleteEntryConfirmIdx = null;
    deleteLogEntry(idx);
    return;
  }
  deleteEntryConfirmIdx = idx;
  clearTimeout(deleteEntryConfirmTimeout);
  deleteEntryConfirmTimeout = setTimeout(() => {
    deleteEntryConfirmIdx = null;
    renderDeckDiaryList(activeItem);
  }, 2500);
  renderDeckDiaryList(activeItem);
}

async function deleteLogEntry(idx) {
  const entry = currentDeckDiaryEntries[idx];
  if (!entry || !activeItem) return;
  // NOTE: this sends a 'deleteListen' action — the backend needs a matching
  // handler that locates the row via row/artist/title/date/timestamp and
  // removes that diary row. Without that, this deletes locally but the entry
  // will reappear on the next refresh.
  const payload = {
    action: 'deleteListen', row: activeItem.row, artist: activeItem.artist, title: activeItem.title,
    date: entry.date, timestamp: entry.timestamp
  };
  try {
    await postUpdate(payload);
    const realIdx = state.diary.indexOf(entry);
    if (realIdx !== -1) state.diary.splice(realIdx, 1);
    if (editingEntryIdx === idx) resetLogForm();
    renderDeckDiaryList(activeItem);
    flashToast(el.deckToast, 'Entry deleted');
  } catch (err) {
    flashToast(el.deckToast, 'Couldn\u2019t delete — try again');
  }
}

function renderDeckDiaryList(item) {
  const entries = state.diary
    .filter(d => d.artist === item.artist && d.title === item.title)
    .sort((a, b) => dateVal(b.date) - dateVal(a.date));
  currentDeckDiaryEntries = entries;

  if (!entries.length) {
    el.deckDiaryList.innerHTML = '<p class="diary-empty">No listens logged yet.</p>';
    return;
  }

  el.deckDiaryList.innerHTML = entries.map((e, idx) => {
    const hasDate = dateVal(e.date) !== -Infinity;
    let d = hasDate
      ? new Date(e.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Undated';

    if (dateVal(e.timestamp) !== -Infinity) {
      d += ` at ${new Date(e.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    }

    const confirming = deleteEntryConfirmIdx === idx;

    const tracks = e.tracks || [];
    let tracksHtml = '';
    if (e.full) {
      tracksHtml = '<span class="dd-tracks dd-tracks-full">Full album</span>';
    } else if (tracks.length) {
      tracksHtml = `<span class="dd-tracks">${tracks.map(t => escapeHtml(t.name)).join(' \u00b7 ')}</span>`;
    }

    return `<div class="deck-diary-entry" data-idx="${idx}" tabindex="0" role="button" aria-label="Open this diary entry">
      ${e.entryTitle ? `<div class="dd-title">${escapeHtml(e.entryTitle)}</div>` : ''}
      <div class="dd-meta-row">
        <span class="dd-date">${d}</span>
        ${e.rating ? `<span class="dd-rating">${starRatingHtml(e.rating)}</span>` : ''}
        ${tracksHtml}
        <span class="dd-actions">
          <button type="button" class="dd-action-btn dd-edit-btn" title="Edit entry" aria-label="Edit entry">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button type="button" class="dd-action-btn dd-delete-btn${confirming ? ' confirm' : ''}" title="${confirming ? 'Click again to delete' : 'Delete entry'}" aria-label="Delete entry">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
          </button>
        </span>
      </div>
    </div>`;
  }).join('');
}

// Clicking a diary row in the album menu takes you to the Diary tab with
// that entry's detail modal already open, rather than showing the note
// inline (it's too easy for a long note to blow out the album menu layout).
function openDeckDiaryEntryInDiaryTab(idx) {
  const entry = currentDeckDiaryEntries[idx];
  if (!entry) return;
  closeDeck();
  switchTab('diary');
  openDiaryEntryModal(entry);
}
