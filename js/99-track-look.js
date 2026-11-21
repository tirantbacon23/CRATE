// (1.135.223) The Songs view, compact (as a music player's library list): the song playing is marked in it. Its look is in css/crate.css
// ("Songs view, compact"). Looked for once a second, and whenever the list is drawn again.
function tlkPaint() {
  const box = document.querySelector('.track-view-table'); if (!box) return;
  const e = typeof crateQueueList !== 'undefined' && crateQueueIndex >= 0 ? crateQueueList[crateQueueIndex] : null;
  const it = (e && e.item) || (typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null), name = e && e.track ? String(e.track.trackName || '') : '';
  const want = it && name ? String(it.row) + '::@' : '';
  box.querySelectorAll('.main-track-row.mt-playing').forEach(r => { if (!want || !r.dataset.trackKey.startsWith(want) || (r.querySelector('.mt-title') || {}).title !== name) r.classList.remove('mt-playing'); });
  if (!want) return;
  box.querySelectorAll(`.main-track-row[data-track-key^="${CSS.escape(String(it.row))}::@"]`).forEach(r => { const t = r.querySelector('.mt-title'); if (t && String(t.title).split(' · ')[0] === name) r.classList.add('mt-playing'); });
}
setInterval(() => { if (!document.hidden) try { tlkPaint(); } catch (e) { /* next second */ } }, 1000);
