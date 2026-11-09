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
function locQueue(items, fresh) { let n = 0; items.forEach(it => { if (locNeeds(it, fresh) && !loc.queue.includes(it)) { loc.queue.push(it); n++; } }); loc.total += n; if (n) locRun(); return n; }
function locQueueAdded(added) { if (state.locAuto === false) return; locQueue((added || []).filter(Boolean), true); }          // new releases, by themselves
async function locRun() {
  if (loc.running) return; loc.running = true; loc.stop = false; locStrip();
  try {
    while (loc.queue.length && !loc.stop) {
      const it = loc.queue.shift();
      if (String(it.location || '').trim()) { loc.done++; continue; }          // (you gave it one meanwhile)
      let place = null; try { place = await locLookup(it); } catch (e) { place = null; }
      if (place) {
        try { await postUpdate({ action: 'editAlbum', row: it.row, Location: place }); it.location = place; loc.found++; } catch (e) { /* tried again next run */ }
      } else if (place === '') locTriedSet(locKey(it));
      loc.done++; locStrip();
    }
  } finally {
    loc.running = false;
    if (loc.total) flashGlobalToast(loc.stop ? `Stopped: found where ${loc.found} of ${loc.done} release${loc.done === 1 ? ' was' : 's were'} recorded.` : `Found where ${loc.found} of ${loc.done} release${loc.done === 1 ? ' was' : 's were'} recorded.`);
    loc.queue = []; loc.done = loc.found = loc.total = 0; loc.stop = false; locStrip();
  }
}
function locStrip() {                                                 // the progress, at the bottom, while a run of more than a couple is going
  let s = document.getElementById('locStrip');
  if (!loc.running || loc.total < 3) { if (s) s.hidden = true; return; }
  if (!s) { s = document.createElement('div'); s.id = 'locStrip'; s.className = 'loc-strip'; s.setAttribute('role', 'status'); document.body.appendChild(s); s.addEventListener('click', (e) => { if (e.target.closest('[data-loc-stop]')) { loc.stop = true; locStrip(); } }); }
  s.hidden = false;
  s.innerHTML = `<span>Finding where releases were recorded · ${loc.done} of ${loc.total}${loc.found ? ` · ${loc.found} found` : ''}${loc.stop ? ' · stopping…' : ''}</span><button type="button" class="chip-btn" data-loc-stop${loc.stop ? ' disabled' : ''}>Stop</button>`;
}
function locStartAll() {
  el.layoutMenu.hidden = true;
  if (loc.running) { flashGlobalToast('Already finding where releases were recorded.'); return; }
  const todo = (state.raw || []).filter(it => locNeeds(it, false));
  if (!todo.length) { flashGlobalToast('Every release has a Location, or MusicBrainz didn’t know one when it was last asked.'); return; }
  const mins = Math.max(1, Math.round(todo.length * 2.2 / 60));
  if (!confirm(`Look up where ${todo.length.toLocaleString()} release${todo.length === 1 ? ' was' : 's were'} recorded on MusicBrainz?\n\nOnly releases with no Location are looked up, and a Location you have is never changed. It takes about ${mins} minute${mins === 1 ? '' : 's'} (MusicBrainz asks for about one request a second); you can keep using CRATE, and stop it at any time.`)) return;
  locQueue(todo, false);
}
(function wireRecordedAt() {
  const b = document.getElementById('menuRecordedAt'); if (b) b.addEventListener('click', locStartAll);
})();
