// CRATE — descriptors for songs: the same descriptors as releases (melancholic, sparse, slow burn…), on single songs.
// One part of the page's script, split by feature (see 01-core.js).
//
// SHOWN: small chips under a song's name in a release's tracklist, the browser's songs and the Tracks view (the first three, then "+2"),
// and under the song playing in Track info, coloured by category (mood, texture, tempo…). A song starts with none; "+" adds some.
// EDITING: a click on a song's chips (or its "+") opens the editor: type to find one, with suggestions from the same categories releases
// use, from the release's own descriptors, and from those you've used on songs before. Enter or a click adds one; × or Backspace takes
// one off. Saved as you go.
// SAVED with the song in its release's per-song data (desc: ['melancholic', …], RYM's own spelling where known), like a like or a song
// rating: no backend change, and never copied from a friend's release.
// SEARCH: desc:melancholic finds the songs (and their releases) with it; liked:yes the liked ones (in any search box, and the Tracks view).

const SD_MAX_SHOWN = 3;
function sdGet(item, num) { const e = item && item.trackData && item.trackData[num]; return e && Array.isArray(e.desc) ? e.desc : []; }
async function sdSet(item, num, list, name) {
  if (!item || !num) return;
  const clean = []; (list || []).forEach(d => { const k = descKey(d); if (k && !clean.includes(k)) clean.push(k); });
  if (!item.trackData) item.trackData = {};
  const e = item.trackData[num] || (item.trackData[num] = {});
  if (clean.length) { e.desc = clean.slice(0, 20); if (!e.name && name) e.name = String(name).slice(0, 300); } else { delete e.desc; if (!Object.keys(e).length) delete item.trackData[num]; }
  sdPaint(true);
  try { await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData) }); }
  catch (err) { if (typeof flashGlobalToast === 'function') flashGlobalToast('Couldn’t save the song’s descriptors. Try again.'); }
}
function sdChipsHtml(item, num, name, cls) {
  const list = sdGet(item, num), shown = list.slice(0, SD_MAX_SHOWN), more = list.length - shown.length;
  const label = list.length ? `Descriptors of ${name}: ${list.join(', ')}. Click to change` : `Describe ${name}`;
  return `<span class="sd-chips ${cls || ''}${list.length ? '' : ' sd-empty'}" role="button" tabindex="0" data-sd-row="${escapeHtml(String(item.row))}" data-sd-num="${escapeHtml(String(num))}" data-sd-name="${escapeHtml(name || '')}" data-sd-sig="${escapeHtml(list.join(','))}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">`
    + shown.map(d => `<span class="sd-chip sd-cat-${descCatOf(d)}">${escapeHtml(d)}</span>`).join('') + (more > 0 ? `<span class="sd-chip sd-more">+${more}</span>` : '') + `<span class="sd-add" aria-hidden="true">${list.length ? '' : '+ describe'}</span></span>`;
}
function sdPaint(all) {
  document.querySelectorAll('.track-row[data-track-key], .main-track-row[data-track-key], .track-row-wrap[data-track-key]').forEach(row => {
    const s = likeRowSong(row); if (!s) return;
    let c = row.querySelector('.sd-chips'); const sig = sdGet(s.item, s.num).join(',');
    if (c && c.dataset.sdSig === sig && !all) return;
    if (c && c.dataset.sdSig === sig) return;
    const html = sdChipsHtml(s.item, s.num, s.name, row.classList.contains('track-row-wrap') ? '' : 'sd-compact');
    if (c) { c.outerHTML = html; return; }
    const at = row.querySelector('.track-name, .trk-title, .mt-title'); if (!at) return;
    at.insertAdjacentHTML(row.classList.contains('track-row-wrap') ? 'afterend' : 'beforeend', html);          // (in the browser and the Tracks view: inside the name, so the row's columns stay as they are)
  });
  // Track info: the song playing
  const host = document.getElementById('trackInfoTitle'); if (!host) return;
  const now = likeNow(); let c = host.parentElement.querySelector(':scope > .sd-chips.sd-info');
  if (!now) { if (c) c.remove(); return; }
  const sig = sdGet(now.item, now.num).join(',') + '|' + now.item.row + ':' + now.num;
  if (c && c.dataset.sdInfo === sig) return;
  const html = sdChipsHtml(now.item, now.num, now.name, 'sd-info');
  if (c) c.outerHTML = html; else { const after = host.parentElement.querySelector(':scope > .lk-heart.lk-info') || host; after.insertAdjacentHTML('afterend', html); }
  c = host.parentElement.querySelector(':scope > .sd-chips.sd-info'); if (c) c.dataset.sdInfo = sig;
}

// ----- the editor -----
const sdEd = { item: null, num: 0, name: '', list: [], timer: 0 };
function sdUsedCounts() { const m = new Map(); (state.raw || []).forEach(it => Object.values(it.trackData || {}).forEach(e => (e && Array.isArray(e.desc) ? e.desc : []).forEach(d => m.set(d, (m.get(d) || 0) + 1)))); return m; }
function sdEdClose() { const m = document.getElementById('sdEd'); if (m) m.remove(); document.removeEventListener('mousedown', sdEdOutside, true); if (sdEd.timer) { clearTimeout(sdEd.timer); sdEd.timer = 0; sdSet(sdEd.item, sdEd.num, sdEd.list, sdEd.name); } }
function sdEdOutside(e) { if (!e.target.closest('#sdEd')) sdEdClose(); }
function sdEdSave() { clearTimeout(sdEd.timer); sdEd.timer = setTimeout(() => { sdEd.timer = 0; sdSet(sdEd.item, sdEd.num, sdEd.list, sdEd.name); }, 500); }
function sdEdRender(keepFocus) {
  const m = document.getElementById('sdEd'); if (!m) return;
  const inp = m.querySelector('#sdEdIn'), q = inp ? inp.value : '';
  const chips = sdEd.list.map((d, i) => `<span class="sd-chip sd-cat-${descCatOf(d)}">${escapeHtml(d)}<button type="button" class="sd-x" data-sd-x="${i}" aria-label="Remove ${escapeHtml(d)}">×</button></span>`).join('');
  const have = sdEd.list.slice();
  const matches = q.trim() ? descCandidates(q, have).slice(0, 8) : [];
  const fromRel = parseDescriptors(sdEd.item.rymDescriptors).map(descKey).filter(k => !have.includes(k)).slice(0, 10);
  const used = [...sdUsedCounts()].filter(([k]) => !have.includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  const sug = (title, keys) => keys.length ? `<div class="sd-sugg-row"><span>${title}</span><div class="sd-sugg">${keys.map(k => `<button type="button" class="sd-chip sd-cat-${descCatOf(k)}" data-sd-add="${escapeHtml(k)}">${escapeHtml(k)}</button>`).join('')}</div></div>` : '';
  m.querySelector('.sd-ed-chips').innerHTML = chips;
  m.querySelector('.sd-ed-sugg').innerHTML = (q.trim() ? sug('Matches', matches.map(x => x.key)) + (matches.length ? '' : `<p class="sd-hint">Enter adds "${escapeHtml(q.trim())}" as your own.</p>`) : '')
    + sug('The release', fromRel) + sug('You use', used)
    + (!q.trim() && !fromRel.length && !used.length ? '<p class="sd-hint">Type to find descriptors: mood, texture, tempo, instruments…</p>' : '');
  if (keepFocus && inp) inp.focus();
}
function sdEdOpen(anchor, item, num, name) {
  sdEdClose();
  Object.assign(sdEd, { item, num: Number(num), name: name || likeTrackName(item, num), list: sdGet(item, num).slice(), timer: 0 });
  const m = document.createElement('div'); m.id = 'sdEd'; m.className = 'sd-ed'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', `Descriptors for ${sdEd.name}`);
  m.innerHTML = `<div class="sd-ed-h"><b>Describe “${escapeHtml(sdEd.name)}”</b><button type="button" class="friends-hbtn" data-sd-close aria-label="Done">×</button></div>
    <div class="sd-ed-box"><span class="sd-ed-chips"></span><input id="sdEdIn" type="text" placeholder="Add a descriptor" autocomplete="off" spellcheck="false" aria-label="Add a descriptor"></div>
    <div class="sd-ed-sugg"></div><div class="sd-ed-foot"><span class="sd-hint">${escapeHtml(item.artist)} · ${escapeHtml(item.title)}</span><button type="button" class="chip-btn soc-acc" data-sd-close>Done</button></div>`;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  m.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
  sdEdRender(true);
  const add = (k) => { k = descKey(k); if (!k || sdEd.list.includes(k)) return; sdEd.list.push(k); const i = m.querySelector('#sdEdIn'); i.value = ''; sdEdRender(true); sdEdSave(); };
  m.addEventListener('click', (e) => {
    const x = e.target.closest('[data-sd-x]'); if (x) { sdEd.list.splice(+x.dataset.sdX, 1); sdEdRender(true); sdEdSave(); return; }
    const a = e.target.closest('[data-sd-add]'); if (a) { add(a.dataset.sdAdd); return; }
    if (e.target.closest('[data-sd-close]')) sdEdClose();
  });
  const inp = m.querySelector('#sdEdIn');
  inp.addEventListener('input', () => sdEdRender(true));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const q = inp.value.trim(); if (!q) { if (e.key === 'Enter') sdEdClose(); return; } const best = descCandidates(q, sdEd.list)[0]; add(best && best.sc >= 3 ? best.key : q); }
    else if (e.key === 'Backspace' && !inp.value && sdEd.list.length) { sdEd.list.pop(); sdEdRender(true); sdEdSave(); }
    else if (e.key === 'Escape') { e.stopPropagation(); sdEdClose(); }
  });
  setTimeout(() => document.addEventListener('mousedown', sdEdOutside, true), 0);
}

function initSongDesc() {
  const open = (c) => { const it = likeItemByRow(c.dataset.sdRow); if (it) sdEdOpen(c, it, c.dataset.sdNum, c.dataset.sdName); };
  document.addEventListener('click', (e) => { const c = e.target.closest('.sd-chips'); if (!c) return; e.preventDefault(); e.stopPropagation(); open(c); }, true);
  document.addEventListener('keydown', (e) => { const c = e.target.closest && e.target.closest('.sd-chips'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(c); } });
  let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => sdPaint(false), 140); }).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden) sdPaint(false); }, 1600);
  setTimeout(() => sdPaint(true), 3200);
}
initSongDesc();
