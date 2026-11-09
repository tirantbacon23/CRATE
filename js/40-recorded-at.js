// CRATE — where a release was recorded, from MusicBrainz.
// One part of the page's script, split by feature (see 01-core.js). A release with no Location is looked up on MusicBrainz: the place most of its
// songs were "recorded at" (Abbey Road Studios), with its area (St John's Wood), becomes its Location — the field the Map viewer and "Update from
// Rate Your Music" use. A Location you have is never changed. New releases are looked up by themselves a moment after they arrive; ⚙ → "Find where
// releases were recorded…" does the ones you already have, one at a time (MusicBrainz asks for about one request a second), and can be stopped.
const LOC_TRIED_KEY = 'crate_loc_tried_v1';                         // releases already asked about with no answer, so a second run doesn't ask again (for 60 days)
const loc = { queue: [], running: false, stop: false, done: 0, found: 0, total: 0 };
function locTried() { try { return JSON.parse(localStorage.getItem(LOC_TRIED_KEY) || '{}') || {}; } catch (e) { return {}; } }
function locTriedSet(k) { const t = locTried(); t[k] = Date.now(); const ks = Object.keys(t); if (ks.length > 20000) ks.sort((a, b) => t[a] - t[b]).slice(0, ks.length - 20000).forEach(x => delete t[x]); try { localStorage.setItem(LOC_TRIED_KEY, JSON.stringify(t)); } catch (e) { /* asked again next time */ } }
const locKey = (it) => artKey(it);
function locNeeds(it, fresh) { if (!it || !it.artist || !it.title || String(it.location || '').trim()) return false; if (fresh) return true; const t = locTried()[locKey(it)]; return !(t && Date.now() - t < 60 * 864e5); }

// The place a release's songs were recorded at, from MusicBrainz's release (its recordings' "recorded at" places, and the release's own):
// the one most of them name, with its area; a second place that has at least a third of the songs too is added after it. '' when MusicBrainz names none.
function locFromMbRelease(d) {
  const count = new Map(), add = (r) => { if (!r || r.type !== 'recorded at' || !r.place || !r.place.name) return; const area = r.place.area && r.place.area.name ? r.place.area.name : ''; const name = area && !r.place.name.includes(area) ? `${r.place.name}, ${area}` : r.place.name; count.set(name, (count.get(name) || 0) + 1); };
  (d && d.relations || []).forEach(add);
  (d && d.media || []).forEach(m => (m.tracks || []).forEach(t => ((t.recording && t.recording.relations) || []).forEach(add)));
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]); if (!top.length) return '';
  return top[1] && top[1][1] >= top[0][1] / 3 ? `${top[0][0]}; ${top[1][0]}` : top[0][0];
}
async function locLookup(it) {                                        // -> the place, or '' (none known), or null (couldn't ask)
  const mbid = (String(it.link || '').match(/musicbrainz\.org\/release\/([a-f0-9-]{36})/i) || [])[1] || await lookupMbReleaseId(it.artist, it.title);
  if (!mbid) return '';
  const res = await mbFetch(`https://musicbrainz.org/ws/2/release/${mbid}?inc=place-rels+recordings+recording-level-rels&fmt=json`, { headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' } });
  if (!res.ok) return res.status === 404 ? '' : null;
  return locFromMbRelease(await res.json());
}
// (1.93.4) The queue is shown in ⚙ → Processing (its own tab, "Recorded at"): the release being looked up, the ones waiting (each can be looked up
// next or taken out), pause and stop, and what each run found under Done today. A release's own menu has "Find where it was recorded": it goes to
// the front of the queue, is asked even if MusicBrainz didn't know last time, and one with a Location is replaced only if you say so.
function locQueue(items, fresh) { let n = 0; items.forEach(it => { if (locNeeds(it, fresh) && !loc.queue.some(q => q.it === it)) { loc.queue.push({ it }); n++; } }); loc.total += n; if (n) locRun(); jobsRefreshSoon(); return n; }
function locQueueAdded(added) { if (state.locAuto === false) return; locQueue((added || []).filter(Boolean), true); }          // new releases, by themselves
function jobsRefreshSoon() { if (typeof jobsRefresh === 'function') try { jobsRefresh(); } catch (e) { /* the panel isn't there yet */ } }
function locFind(items) {                                             // asked for, from a release's menu: these first, whatever was tried before
  const list = (items || []).filter(it => it && it.artist && it.title);
  const has = list.filter(it => String(it.location || '').trim());
  let replace = false;
  if (has.length) replace = confirm(has.length === 1 && list.length === 1
    ? `"${has[0].title}" already has a Location: ${has[0].location}\n\nLook it up on MusicBrainz anyway, and replace it if MusicBrainz knows where it was recorded?`
    : `${has.length} of these already have a Location.\n\nOK: look those up too, and replace a Location when MusicBrainz knows where it was recorded.\nCancel: only look up the ${list.length - has.length} with no Location.`);
  const todo = list.filter(it => replace || !String(it.location || '').trim());
  if (!todo.length) return;
  let n = 0;
  todo.slice().reverse().forEach(it => { const i = loc.queue.findIndex(q => q.it === it); if (i >= 0) loc.queue.splice(i, 1); else n++; loc.queue.unshift({ it, asked: true, replace: replace && !!String(it.location || '').trim() }); });
  loc.total += n; loc.asked = (loc.asked || 0) + todo.length;
  flashGlobalToast(todo.length === 1 ? `Looking up where "${todo[0].title}" was recorded…` : `Looking up where ${todo.length} releases were recorded (Processing shows the queue).`);
  locRun(); jobsRefreshSoon();
}
async function locRun() {
  if (loc.running) return; loc.running = true; loc.stop = false; loc.paused = false; jobsRefreshSoon();
  const one = loc.total === 1;
  try {
    while (loc.queue.length && !loc.stop) {
      if (loc.paused) { await new Promise(r => setTimeout(r, 400)); continue; }
      const q = loc.queue.shift(), it = q.it; loc.now = it; jobsRefreshSoon();
      if (String(it.location || '').trim() && !q.replace) { loc.done++; continue; }          // (you gave it one meanwhile)
      let place = null; try { place = await locLookup(it); } catch (e) { place = null; }
      if (place && place !== it.location) {
        try { await postUpdate({ action: 'editAlbum', row: it.row, Location: place }); it.location = place; loc.found++; } catch (e) { place = null; }
      } else if (place === '') locTriedSet(locKey(it));
      if (q.asked && !one) { /* told at the end */ } else if (q.asked) flashGlobalToast(place ? `Recorded at: ${place}` : place === '' ? `MusicBrainz doesn\u2019t say where "${it.title}" was recorded.` : `Couldn\u2019t reach MusicBrainz for "${it.title}"; try again in a moment.`);
      loc.done++; loc.now = null; jobsRefreshSoon();
    }
  } finally {
    const text = `Where releases were recorded: found ${loc.found} of ${loc.done}${loc.stop ? ', stopped by you' : ''}`;
    if (loc.done && !(one && loc.asked)) { if (typeof jobsDone === 'function') jobsDone('loc', text); if (loc.total > 1) flashGlobalToast(text.replace(/^Where releases were recorded: found/, 'Found where') + '.'); }
    else if (loc.done && loc.found && typeof jobsDone === 'function') jobsDone('loc', text);
    if (loc.stop) loc.queue = [];
    loc.running = false; loc.now = null; loc.done = loc.found = loc.asked = 0; loc.total = loc.queue.length; loc.stop = loc.paused = false; jobsRefreshSoon();
    if (loc.queue.length) locRun();
  }
}
function locJobs(run, need, wait) {                                   // for ⚙ → Processing
  if (loc.running) run.push({ cat: 'loc', icon: 'search', title: 'Finding where releases were recorded', sub: 'MusicBrainz', pct: loc.total ? loc.done / loc.total * 100 : null,
    detail: [`${loc.done} of ${loc.total}`, loc.found ? `${loc.found} found` : '', loc.paused ? 'paused' : loc.now ? `${loc.now.artist} \u2013 ${loc.now.title}` : '', loc.stop ? 'stopping\u2026' : ''].filter(Boolean).join(' \u00b7 '),
    acts: [loc.paused ? { icon: 'play', label: 'Resume', fn: () => { loc.paused = false; } } : { icon: 'pause', label: 'Pause', fn: () => { loc.paused = true; } }, { icon: 'x', label: 'Stop', fn: () => { loc.stop = true; loc.paused = false; } }] });
  if (!loc.queue.length) return;
  const tab = typeof jobsState !== 'undefined' && jobsState.filter === 'loc', shown = tab ? loc.queue.slice(0, 200) : [];
  shown.forEach((q, i) => wait.push({ cat: 'loc', icon: 'search', title: q.it.title, sub: q.it.artist, right: i === 0 ? 'next' : `after ${i}`,
    detail: q.replace ? `replaces: ${q.it.location}` : q.asked ? 'asked for' : '',
    acts: [i ? { icon: 'play', label: 'Look up next', fn: () => { const k = loc.queue.indexOf(q); if (k > 0) { loc.queue.splice(k, 1); loc.queue.unshift(q); } } } : null,
      { icon: 'x', label: 'Take out of the queue', fn: () => { const k = loc.queue.indexOf(q); if (k >= 0) { loc.queue.splice(k, 1); loc.total--; } } }] }));
  if (tab && loc.queue.length > shown.length) wait.push({ cat: 'loc', icon: 'search', title: `and ${loc.queue.length - shown.length} more`, sub: 'recorded-at lookups' });
  if (!tab) wait.push({ cat: 'loc', icon: 'search', title: 'Where releases were recorded', sub: `${loc.queue.length} release${loc.queue.length === 1 ? '' : 's'} waiting`,
    detail: loc.queue.slice(0, 3).map(q => q.it.title).join(', ') + (loc.queue.length > 3 ? '\u2026' : ''), right: loc.running ? (loc.paused ? 'paused' : 'one a second') : 'next',
    acts: [{ label: 'Show the queue', fn: () => { jobsState.filter = 'loc'; } }, { icon: 'x', label: 'Empty the queue', fn: () => { loc.total -= loc.queue.length; loc.queue = []; } }] });
}
function locStartAll() {
  el.layoutMenu.hidden = true;
  const todo = (state.raw || []).filter(it => locNeeds(it, false) && !loc.queue.some(q => q.it === it));
  if (!todo.length) { flashGlobalToast('Every release has a Location, or MusicBrainz didn’t know one when it was last asked.'); return; }
  const mins = Math.max(1, Math.round(todo.length * 2.2 / 60));
  if (!confirm(`Look up where ${todo.length.toLocaleString()} release${todo.length === 1 ? ' was' : 's were'} recorded on MusicBrainz?\n\nOnly releases with no Location are looked up, and a Location you have is never changed. It takes about ${mins} minute${mins === 1 ? '' : 's'} (MusicBrainz asks for about one request a second); you can keep using CRATE; ⚙ → Processing shows the queue, and can pause or stop it.`)) return;
  locQueue(todo, false);
}
(function wireRecordedAt() {
  const b = document.getElementById('menuRecordedAt'); if (b) b.addEventListener('click', locStartAll);
})();
