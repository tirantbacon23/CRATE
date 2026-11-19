// ===== (1.135.124) What the Up next panel shows for each song, chosen from the panel itself =====
// ⚙ on the Up next bar lists what a song's line can show (artist, album, year, genre, length, ratings…) and, new, how much the song has
// been played: your plays of it (your synced scrobbles), its Last.fm plays and listeners, and your plays of it on Last.fm. Tick or
// untick: the panel changes at once and it's remembered (the same choice ⚙ › Panels configuration makes). The Last.fm numbers are
// looked up for the songs coming up (the next 40), four at a time, kept two days (the store the rest of CRATE uses).

TRACK_COLUMN_LABELS.songPlays = 'Your plays (song)';
const QF_CHOICES = [['artist', 'Artist'], ['title', 'Album'], ['year', 'Release year'], ['genre', 'Genre'], ['trackLength', 'Length'], ['rating', 'Your rating'], ['rymTrackRating', 'Song rating (RYM)'],
  ['songPlays', 'Your plays of the song'], ['lfTrackPlays', 'Last.fm plays of the song'], ['lfTrackListeners', 'Last.fm listeners of the song'], ['lfTrackYours', 'Your Last.fm plays of the song']];
const QF_LF = ['lfTrackPlays', 'lfTrackListeners', 'lfTrackYours'];
let qfLabelled = false;          // (in the one-line view the numbers say what they are: "1.2M plays", "you 14")
const qfBaseVal = trackColumnVal;
trackColumnVal = function (key, item, track) {
  if (key === 'songPlays') { const n = typeof trackScrobbleCountFor === 'function' ? trackScrobbleCountFor(item.artist, item.title, track.trackName) : 0; return n ? (qfLabelled ? `you ${n.toLocaleString()}` : n.toLocaleString()) : ''; }
  const v = qfBaseVal.apply(this, arguments);
  if (!qfLabelled || !v || !QF_LF.includes(key)) return v;
  return key === 'lfTrackPlays' ? `${v} plays` : key === 'lfTrackListeners' ? `${v} listeners` : `you ${v} on Last.fm`;
};
const qfBaseSort = trackSortValue;
trackSortValue = function (row, key) { if (key === 'songPlays') return typeof trackScrobbleCountFor === 'function' ? trackScrobbleCountFor(row.item.artist, row.item.title, row.track.trackName) || 0 : 0; return qfBaseSort.apply(this, arguments); };
const qfBaseThumb = renderQueueThumbnailHtml;
renderQueueThumbnailHtml = function () { qfLabelled = true; try { return qfBaseThumb.apply(this, arguments); } finally { qfLabelled = false; } };
if (typeof renderQueueReleaseTracksHtml === 'function') { const qfBaseRel = renderQueueReleaseTracksHtml; renderQueueReleaseTracksHtml = function () { qfLabelled = true; try { return qfBaseRel.apply(this, arguments); } finally { qfLabelled = false; } }; }          // (1.135.210: there too, "1.2M plays")

// which list the panel's view reads
// (1.135.210) Grouped by release ("releaseTracks"): what belongs to the release (artist, album, year, genre, your rating) goes in its heading,
// the rest on each song's line; the menu edited the one-line view's list there, so nothing it ticked showed
const QF_REL = ['artist', 'title', 'year', 'genre', 'rating'];
const qfGrouped = () => state.queueViewMode === 'releaseTracks';
function qfKey(k) { return state.queueViewMode === 'trackDetail' ? 'queueTrackDetail' : qfGrouped() ? (QF_REL.includes(k) ? 'queueReleaseInfo' : 'queueTrackInfoNested') : 'queue'; }
const qfOf = (key) => (state.fields[key] || []).filter(k => k && k !== 'none');
function qfList() { return qfGrouped() ? qfOf('queueReleaseInfo').concat(qfOf('queueTrackInfoNested')) : qfOf(qfKey()); }
function qfToggle(k, on) {
  const key = qfKey(k); let l = qfOf(key);
  if (on && !l.includes(k)) l.push(k); else if (!on) l = l.filter(x => x !== k);
  state.fields[key] = l; try { savePrefs(); } catch (e) { /* this visit */ }
  renderCrateQueuePanel(); qfFetchSoon();
}
function qfMenu(anchor) {
  document.querySelectorAll('.qf-menu').forEach(m => m.remove());
  const on = new Set(qfList()), m = document.createElement('div'); m.className = 'panel-mode-menu qf-menu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'What Up next shows');
  m.innerHTML = `<div class="menu-section-title">Each song shows</div>${QF_CHOICES.map(([k, l], i) => `${i === 7 ? '<div class="menu-sub-title">How much it’s played</div>' : ''}<label class="qf-row"><input type="checkbox" data-qf="${k}"${on.has(k) ? ' checked' : ''}> ${escapeHtml(l)}</label>`).join('')}
    <p class="qf-note">${state.queueViewMode === 'trackDetail' ? 'Columns of the Track detail view.' : qfGrouped() ? 'Artist, album, year, genre and your rating in each release’s heading; the rest under each song, in the order you tick them.' : 'In the line under each song, in the order you tick them.'}${typeof srchLfKey === 'function' && !srchLfKey() ? ' Last.fm numbers need a Last.fm API key (⚙ › Last.fm).' : ''}</p>`;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(); m.style.position = 'fixed'; m.style.top = (r.bottom + 6) + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - 270, r.right - 260)) + 'px'; m.style.zIndex = 600;
  m.addEventListener('change', (e) => { const c = e.target.closest('[data-qf]'); if (c) qfToggle(c.dataset.qf, c.checked); });
  m.addEventListener('click', (e) => e.stopPropagation());
  setTimeout(() => { const off = (e) => { if (!m.contains(e.target) && e.target !== anchor) { m.remove(); document.removeEventListener('mousedown', off, true); } }; document.addEventListener('mousedown', off, true); }, 0);
}

// the Last.fm numbers for the songs coming up
let qfRunning = false;
function qfFetchSoon() { clearTimeout(qfFetchSoon.t); qfFetchSoon.t = setTimeout(qfFetch, 600); }
async function qfFetch() {
  if (qfRunning || typeof srchLfKey !== 'function' || !srchLfKey() || !qfList().some(k => QF_LF.includes(k))) return;
  const list = typeof crateQueueList !== 'undefined' ? crateQueueList || [] : [], start = Math.max(0, typeof crateQueueIndex === 'number' ? crateQueueIndex : 0);
  const all = stlCache(), now = Date.now(), seen = new Set(), user = stlUser();
  const need = list.slice(start, start + 41).filter(e => { if (!e || !e.item || !e.track || !e.track.trackName) return false; const k = tlfSongKey(e.item, e.track.trackName); if (seen.has(k)) return false; seen.add(k); const c = all[k]; return !(c && c.p != null && now - c.t < 2 * 864e5) && !(qfFailed.get(k) > now - 10 * 60e3); });
  if (!need.length) return;
  qfRunning = true; let i = 0, got = 0;
  const one = async () => { while (i < need.length) { const e = need[i++], k = tlfSongKey(e.item, e.track.trackName);
    try { const p = { method: 'track.getinfo', artist: e.item.artist, track: e.track.trackName, autocorrect: '1' }; if (user) p.username = user;
      const t = await srchLf(p).then(x => x.track || {}).catch(er => { if (er && er.lfCode === 6) return {}; throw er; });
      all[k] = { l: Number(t.listeners) || 0, p: Number(t.playcount) || 0, u: t.userplaycount != null ? Number(t.userplaycount) || 0 : null, t: now }; got++;
    } catch (er) { qfFailed.set(k, Date.now()); srchLfFail(er); } } };
  try { await Promise.all([one(), one(), one(), one()]); } finally { qfRunning = false; }
  stlCacheSave(); if (got) renderCrateQueuePanel();
}
const qfFailed = new Map();          // (a song Last.fm didn't answer for: not asked again for 10 minutes)
const qfBaseRender = renderCrateQueuePanel;
renderCrateQueuePanel = function () { const r = qfBaseRender.apply(this, arguments); try { if (qfList().some(k => QF_LF.includes(k))) qfFetchSoon(); } catch (e) { /* as it was */ } return r; };

// ⚙ on the Up next bar
(function qfInit() {
  const go = () => {
    const clr = document.getElementById('crateQueueClearBtn'); if (!clr) return setTimeout(go, 500); if (document.getElementById('crateQueueFieldsBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'crateQueueFieldsBtn'; b.className = 'chip-btn qf-btn'; b.textContent = '⚙'; b.title = 'Choose what each song shows'; b.setAttribute('aria-label', 'Choose what each song in Up next shows');
    clr.after(b); b.addEventListener('click', (e) => { e.stopPropagation(); if (document.querySelector('.qf-menu')) { document.querySelectorAll('.qf-menu').forEach(m => m.remove()); return; } qfMenu(b); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
