// CRATE — P2P: search Soulseek through the CRATE for P2P add-on (1.96.0), and match what is found against your tracklist (1.97.0).
// One part of the page's script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope.
//
// The add-on talks to slskd, a Soulseek client you run on your own computer, and keeps its address and API key; this page never sees the key.
// A search's results come grouped by folder (one folder, one candidate release). Phase 1 (1.97.0) checks each folder against the release's
// tracklist: which song is which file (by name, or by place and length for files named "Track 01"), how close the lengths are, whether the folder
// names the release, its format, and version words (live, remix…) the release doesn't have. Each folder gets a verdict and the best come first;
// you can Choose one, kept on this device for each release, ready for downloading (phase 2). Opened from a release's right-click menu
// ("Find on P2P…", which searches by itself) or from ⚙ → "P2P search…" for any text.
const p2p = { ready: false, version: '', configured: false, calls: new Map(), seq: 0, cur: null };
const p2pSay = (op, extra) => window.postMessage(Object.assign({ source: 'crate-app', type: 'p2p-call', op }, extra || {}), window.location.origin);
function p2pCall(op, extra, ms) {                                   // -> the add-on's answer, or { ok: false, reason: 'noanswer' }
  return new Promise((resolve) => {
    const callId = 'p' + Date.now().toString(36) + (++p2p.seq), t = setTimeout(() => { p2p.calls.delete(callId); resolve({ ok: false, reason: 'noanswer' }); }, ms || 12000);
    p2p.calls.set(callId, (r) => { clearTimeout(t); p2p.calls.delete(callId); resolve(r || { ok: false, reason: 'noanswer' }); });
    p2pSay(op, Object.assign({ callId }, extra || {}));
  });
}
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== window.location.origin) return; const d = e.data;
  if (!d || d.source !== 'crate-addon') return;
  if (d.type === 'p2p-reply') { const f = p2p.calls.get(d.callId); if (f) f(d.resp); }
  else if (d.type === 'p2p-script') p2pHello();
});
async function p2pHello() {
  const r = await p2pCall('hello', null, 4000);
  if (r.ok) { p2p.ready = true; p2p.version = r.version || ''; p2p.configured = !!r.configured; }
  if (p2p.cur) { p2pRender(); if (p2p.cur.autoPending && p2p.ready && p2p.configured) p2pAutoSearch(); }
}
setTimeout(p2pHello, 900);

function p2pWhy(r) {
  return ({ noanswer: 'The CRATE for P2P add-on didn’t answer. Is it installed and connected to this page (its options page says how)? If you just reloaded the add-on, reload CRATE too.',
    setup: 'The add-on isn’t set up yet: open its options and enter slskd’s address and API key.',
    unreachable: 'The add-on couldn’t reach slskd. Is slskd running on your computer?',
    auth: 'slskd refused the add-on’s API key. Check it in the add-on’s options.',
    denied: 'The add-on is connected to a different CRATE address. Connect this one in its options.',
    unknown: 'That search has gone (the browser was restarted, say). Search again.',
    bad: 'That search text can’t be used: 2 to 200 characters.' })[r && r.reason] || `slskd answered with an error${r && r.status ? ' (' + r.status + ')' : ''}${r && r.detail ? ': ' + r.detail : ''}.`;
}
const p2pSize = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : b ? Math.max(1, Math.round(b / 1e3)) + ' KB' : '';
const p2pLen = (sec) => sec ? formatMs(sec * 1000) : '';

// ----- (1.97.0) matching a folder against the release -----
const P2P_PREF_KEY = 'crate_p2p_prefs_v1', P2P_CHOICE_KEY = 'crate_p2p_choice_v1';
function p2pPrefs() { try { return Object.assign({ format: 'lossless', pickBy: 'quality', fFormat: 'any', fMatches: false, fFree: false, fHideLocked: true, sort: 'best' }, JSON.parse(localStorage.getItem(P2P_PREF_KEY) || '{}')); } catch (e) { return { format: 'lossless' }; } }
function p2pSetPrefs(p) { try { localStorage.setItem(P2P_PREF_KEY, JSON.stringify(Object.assign(p2pPrefs(), p))); } catch (e) { /* this visit only */ } }
function p2pYearOf(item) {                                          // the release's year, from its release date ('' when unknown)
  const d = item && item.releaseDate; if (!d) return '';
  const m = /\b(1[89]\d\d|20\d\d)\b/.exec(String(d)); if (m) return m[1];
  const t = new Date(d); return isNaN(t) ? '' : String(t.getUTCFullYear());
}
const p2pClean = (x) => String(x || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ').replace(/[\/\\:;,.!?"“”'’`~*|<>]+/g, ' ').replace(/\s+/g, ' ').trim();
function p2pQueryFor(item, noYear) {                                // "Elliott Smith Either Or 1997": the first artist, the title without "(Deluxe Edition)" or punctuation, and (1.102.0) the year
  const artist = (typeof artistParts === 'function' ? artistParts(item.artist || '')[0] : '') || item.artist || '';
  const y = noYear ? '' : p2pYearOf(item);
  return p2pClean(`${artist} ${String(item.title || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ')} ${y}`);
}
function p2pQueries(item) {                                          // tried in turn while a search finds nothing: with the year, without it, the title alone
  return [...new Set([p2pQueryFor(item), p2pQueryFor(item, true), p2pClean(item.title)])].filter(q => q.length >= 3);
}
function p2pFileTitle(name, artist) {                               // "03 - Elliott Smith - Ballad of Big Nothing.flac" -> "Ballad of Big Nothing"
  let t = String(name || '').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/_/g, ' ').trim();
  t = t.replace(/^\s*(?:\d{1,2}[-.](?=\d))?(?:[A-Za-z]?\d{1,3})(?:\s*[-.)\]]\s*|\s+)(?=\S)/, '');          // "01 ", "01 - ", "01. ", "1-01 ", "A1 ", "(01) "
  t = smStripArtistPrefix(t, artist);                                // "Elliott Smith - Song"
  t = t.replace(/^\s*\d{1,3}\s*[-.]\s+(?=\S)/, '');                   // "Artist - 03 - Song": the number after the artist
  return t.trim() || String(name || '');
}
function p2pNumOf(name) {                                           // the track number a file name starts with: "03 ...", "1-03 ...", "A3 ...", "Track 03", "Trk3", "Piste 03"
  const s = String(name || ''), m = /^\s*(?:\d{1,2}[-.](?=\d))?[A-Za-z]?(\d{1,3})\b/.exec(s) || /^\s*(?:track|trk|tr|song|piste|titel|pista)\s*[-_.#]*\s*(\d{1,3})\b/i.exec(s);
  return m ? +m[1] : 0;
}
function p2pMatchFiles(tracks, files, artist) {                     // -> per track: { file (index or -1), sim, dSec (null: a length unknown) }
  const T = tracks.map(t => ({ name: t.trackName || '', ms: Number(t.trackTimeMillis) || 0 })), F = files.map(f => ({ title: p2pFileTitle(f.name, artist), sec: Number(f.lengthSec) || 0, num: p2pNumOf(f.name) }));
  const pairs = [];
  T.forEach((t, i) => F.forEach((f, j) => {
    const sim = t.name ? smTitleSim(t.name, f.title) : 0, d = t.ms && f.sec ? Math.abs(t.ms / 1000 - f.sec) : null;
    let s = sim;
    if (sim < 0.7 && d !== null && d <= 4 && f.num === i + 1) s = Math.max(s, 0.72);          // "Track 03.flac" in the right place and the right length
    if (d !== null && d > 30) s -= 0.25;                                // the same name, a very different length (a live take, an edit)
    if (s >= 0.6) pairs.push({ i, j, s, sim, d });
  }));
  pairs.sort((a, b) => b.s - a.s);
  const out = T.map(() => ({ file: -1, sim: 0, dSec: null })), usedF = new Set();
  pairs.forEach(p => { if (out[p.i].file >= 0 || usedF.has(p.j)) return; out[p.i] = { file: p.j, sim: p.sim, dSec: p.d }; usedF.add(p.j); });
  return out;
}
function p2pScoreFolder(f, tracks, release, prefs) {                // -> { score, verdict ('sure'|'likely'|'partial'|'other'|'unchecked'), label, notes[], map, extra[], matched, of }
  const fmt = (prefs && prefs.format) || 'lossless', notes = [], artist = (release && release.artist) || '';
  const named = [f.name, /^@@/.test(f.parent || '') ? '' : f.parent].filter(Boolean).join(' ').replace(/\[[^\]]*\]|\((?:19|20)\d\d\)/g, ' ');          // "Either Or (1997) [FLAC]" names "Either Or"
  const titleSim = release && release.title ? Math.max(smTitleSim(release.title, f.name || ''), smTitleSim(release.title, named)) : 0;
  let score = 0;
  // format: what you prefer, and lossy files of low quality
  const lossy = !f.lossless, rate = f.bitRate || 0;
  let fp = 0; if (fmt === 'lossless') fp = f.lossless ? 8 : rate >= 300 ? 3 : 0; else if (fmt === 'mp3') fp = !f.lossless && rate >= 300 ? 8 : f.lossless ? 3 : 0;
  if (lossy && rate && rate < 192) { fp -= 10; notes.push(`Low quality (${rate} kbps)`); }
  // version words the folder has and the release doesn't
  const want = smFlags(release ? release.title || '' : ''), has = smFlags(named), odd = [...has].filter(x => !want.has(x));
  if (odd.length) notes.push(odd.map(x => x[0].toUpperCase() + x.slice(1)).join(', ') + ' in the folder name, not in the release\u2019s title');
  const allLocked = f.locked && f.locked >= f.count;
  if (!tracks || !tracks.length) {                                   // nothing to check against: judge by the name
    score = Math.round(titleSim * 70 + fp - odd.length * 25);
    return { score, verdict: 'unchecked', label: titleSim >= 0.85 ? 'Name matches' : 'Not checked', notes: notes.concat(['No tracklist to check against']), map: [], extra: f.files.map((_, j) => j), matched: 0, of: 0, unavailable: allLocked };
  }
  const map = p2pMatchFiles(tracks, f.files || [], artist), matched = map.filter(m => m.file >= 0).length, of = tracks.length;
  const used = new Set(map.map(m => m.file).filter(j => j >= 0)), extra = (f.files || []).map((_, j) => j).filter(j => !used.has(j));
  const ds = map.filter(m => m.file >= 0 && m.dSec !== null).map(m => m.dSec), worst = ds.length ? Math.max(...ds) : null, avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
  const cover = matched / of;
  score = cover * 60 + (avg === null ? 8 : avg <= 2 ? 20 : avg <= 4 ? 15 : avg <= 8 ? 6 : -10) + Math.min(10, titleSim * 10) + fp - odd.length * 25 - Math.max(0, extra.length - 3) * 2;
  const byName = map.filter(m => m.file >= 0 && m.sim >= 0.7).length;
  const ry = p2pYearOf(release), ys = (String([f.name, f.parent].join(' ')).match(/\b(19[4-9]\d|20[0-4]\d)\b/g) || []);          // (1.102.0) the year a folder names
  if (ry && ys.length) { if (ys.includes(ry)) { score += 4; notes.push(`Year ${ry}`); } else { score -= 3; notes.push(`Year ${ys[0]} (the release is ${ry}): a reissue?`); } }
  if (matched && byName < matched / 2) { score -= 4; notes.push('Files aren\u2019t named: matched by place and length'); }          // "Track 01.flac": likelier right than not, but less sure
  if (matched === of) notes.unshift(`All ${of} songs`); else notes.unshift(`${matched} of ${of} songs`);
  if (worst !== null) notes.push(worst <= 3 ? 'Lengths match' : `Lengths off by up to ${Math.round(worst)} s`);
  if (extra.length) notes.push(`${extra.length} extra file${extra.length === 1 ? '' : 's'}`);
  let verdict = cover === 1 && (worst === null || worst <= 6) && !odd.length && extra.length <= 3 ? 'sure' : cover >= 0.8 && !odd.length ? 'likely' : cover >= 0.4 ? 'partial' : 'other';
  if (verdict === 'sure' && worst === null && titleSim < 0.6) verdict = 'likely';          // names only, and the folder doesn't name the release
  if (odd.length && cover >= 0.4) verdict = 'version';                // the songs are there, but as a live / remix / … version the release isn't
  const vname = odd.length ? odd[0][0].toUpperCase() + odd[0].slice(1) : '';
  const label = { sure: 'Sure match', likely: 'Likely', partial: `Partial: ${matched} of ${of}`, version: `${vname} version`, other: 'Different release' }[verdict];
  return { score: Math.round(score), verdict, label, notes, map, extra, matched, of, unavailable: allLocked };
}
function p2pFiltered(list, prefs, text) {                           // (1.102.0) the filter controls: format, matches only, free slot only, locked hidden, a text filter; then the sort
  const t = String(text || '').trim().toLowerCase();
  let out = (list || []).filter(f => {
    if (prefs.fFormat === 'lossless' && !f.lossless) return false;
    if (prefs.fFormat === 'lossy' && f.lossless) return false;
    if (prefs.fMatches && f.m && !['sure', 'likely', 'unchecked'].includes(f.m.verdict)) return false;
    if (prefs.fFree && !f.freeSlot) return false;
    if (prefs.fHideLocked && f.locked && f.locked >= f.count) return false;
    if (t && ![f.name, f.parent, f.user].join(' ').toLowerCase().includes(t)) return false;
    return true;
  });
  const by = { fast: (a, b) => (b.freeSlot - a.freeSlot) || (a.queue - b.queue) || (b.speed - a.speed), small: (a, b) => (a.totalSize || 0) - (b.totalSize || 0), songs: (a, b) => (b.count - a.count) }[prefs.sort];
  if (by) out = out.slice().sort(by);
  return out;
}
function p2pRank(folders, tracks, release, prefs) {                 // the folders with their match, best first: verdict, then score, then whether you could start now
  const order = { sure: 0, likely: 1, unchecked: 2, partial: 3, version: 4, other: 5 };
  return folders.map(f => Object.assign({}, f, { m: p2pScoreFolder(f, tracks, release, prefs) }))
    .sort((a, b) => (a.m.unavailable - b.m.unavailable) || (order[a.m.verdict] - order[b.m.verdict]) || (b.m.score - a.m.score) || (b.freeSlot - a.freeSlot) || (a.queue - b.queue) || (b.speed - a.speed));
}
function p2pUseSource(item, f, tracks) {                            // (1.101.0) this folder becomes the release's source (remembered, and what P2P plays from)
  p2pChoose(item, f, tracks);
  if (typeof p2pMakeRec === 'function') p2pMakeRec(item, p2pChoiceFor(item));
}
function p2pBestOf(ranked, prefs) {                                  // the source CRATE picks by itself: among sure matches (else likely ones), the best, or (1.105.0, Pick source by: Fastest) the one that can start soonest
  const ok = (v) => (ranked || []).filter(f => f.m && !f.m.unavailable && f.m.verdict === v), tier = ok('sure').length ? ok('sure') : ok('likely');
  if (!tier.length) return null;
  if ((prefs || p2pPrefs()).pickBy === 'speed') return tier.slice().sort((a, b) => (b.freeSlot - a.freeSlot) || (a.queue - b.queue) || (b.speed - a.speed))[0];
  return tier[0];
}
function p2pChoices() { try { return JSON.parse(localStorage.getItem(P2P_CHOICE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function p2pHasSource(item) { return !!(item && (p2pChoiceFor(item) || (typeof p2pDl !== 'undefined' && p2pDl[artKey(item)]))); }
function p2pChoiceFor(item) { return item ? p2pChoices()[artKey(item)] || null : null; }
function p2pChoose(item, f, tracks) {                                       // kept on this device: the folder to download in phase 2 (user, folder, and each song's file)
  const all = p2pChoices(), k = artKey(item);
  if (!f) delete all[k];
  else all[k] = { user: f.user, dir: f.dir, name: f.name, ext: f.ext, lossless: f.lossless, bitRate: f.bitRate, count: f.count, totalSize: f.totalSize, verdict: f.m.verdict, at: Date.now(),
    files: (f.files || []).map(x => ({ name: x.name, path: x.path || '', size: x.size, lengthSec: x.lengthSec })), songs: f.m.map.map(m => m.file), tracks: (tracks || []).map(t => ({ n: t.trackNumber, t: t.trackName })) };          // (1.98.0) which song each file is, for downloading
  try { localStorage.setItem(P2P_CHOICE_KEY, JSON.stringify(all)); } catch (e) { flashGlobalToast('Couldn’t keep that choice on this device (storage is full or blocked).'); }
}

// ----- the dialog -----
function p2pEnsureDom() {
  if (document.getElementById('p2pOverlay')) return;
  const ov = document.createElement('div'); ov.id = 'p2pOverlay'; ov.className = 'arrange-overlay'; ov.hidden = true;
  ov.innerHTML = `<div class="arrange-modal p2p-modal" role="dialog" aria-modal="true" aria-labelledby="p2pTitle">
    <div class="arrange-header"><h2 id="p2pTitle">Find on P2P</h2><button type="button" id="p2pClose" class="modal-x" aria-label="Close">✕</button></div>
    <form id="p2pForm" class="p2p-form"><input id="p2pQuery" type="search" autocomplete="off" spellcheck="false" aria-label="Search Soulseek for"><button type="submit" id="p2pGo" class="chip-btn p2p-go">Search</button><button type="button" id="p2pStop" class="chip-btn" hidden>Stop</button></form>
    <div class="p2p-opts"><label for="p2pFormat">Prefer</label><select id="p2pFormat" class="config-btn"><option value="lossless">Lossless (FLAC)</option><option value="mp3">MP3 320</option><option value="any">Either</option></select><label for="p2pPickBy">Pick source by</label><select id="p2pPickBy" class="config-btn"><option value="quality">Best quality</option><option value="speed">Fastest (starts soonest)</option></select><span id="p2pTracksNote" class="p2p-tracks-note"></span></div>
    <div class="p2p-opts p2p-filters" role="group" aria-label="Filters"><select id="p2pFFormat" class="config-btn" aria-label="Format"><option value="any">Any format</option><option value="lossless">Lossless only</option><option value="lossy">MP3 and other lossy only</option></select><label class="p2p-check"><input type="checkbox" id="p2pFMatches"> Matches only</label><label class="p2p-check"><input type="checkbox" id="p2pFFree"> Free slot only</label><label class="p2p-check"><input type="checkbox" id="p2pFLocked"> Hide locked</label><label for="p2pSort">Sort</label><select id="p2pSort" class="config-btn"><option value="best">Best match</option><option value="fast">Can start soonest</option><option value="small">Smallest</option><option value="songs">Most songs</option></select><input id="p2pFText" type="search" class="p2p-ftext" placeholder="Filter by folder or user" aria-label="Filter by folder or user" autocomplete="off"></div>
    <p id="p2pStatus" class="p2p-status" role="status"></p>
    <div id="p2pChosen" class="p2p-chosen" hidden><span id="p2pChosenText"></span><span class="p2p-chosen-acts"><button type="button" id="p2pForget" class="chip-btn" title="Forget this source: its downloads stop and its files are deleted">Forget</button><button type="button" id="p2pDlPlay" class="chip-btn p2p-dl-play">Download and play</button><button type="button" id="p2pDlOnly" class="chip-btn" title="Download every song now, to keep">Download all</button></span></div>
    <div class="p2p-opts p2p-store"><label for="p2pKeep">After playing</label><select id="p2pKeep" class="config-btn"><option value="delete">Delete the file</option><option value="cap">Keep up to a size</option><option value="keep">Keep everything</option></select><label for="p2pAhead">Download ahead</label><select id="p2pAhead" class="config-btn"><option value="0">Only the song playing</option><option value="1">1 song</option><option value="2">2 songs</option><option value="3">3 songs</option></select><span id="p2pCapWrap" hidden><input id="p2pCap" type="number" min="0.5" max="2000" step="0.5" class="p2p-cap" aria-label="Size limit in GB"> GB</span><span id="p2pFolderLine" class="p2p-folder-line"></span></div>
    <i id="p2pBar" class="p2p-bar" hidden><b></b></i>
    <div id="p2pResults" class="p2p-results"></div>
    <p class="p2p-foot">The best folder is picked as the source for you; Use this instead changes it. Download and play: each song downloads just before it plays, and (by default) is deleted after. Results and downloads come from slskd, through the CRATE for P2P add-on.</p>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) p2pClose(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); p2pClose(); } });
  document.getElementById('p2pClose').addEventListener('click', p2pClose);
  document.getElementById('p2pForm').addEventListener('submit', (e) => { e.preventDefault(); p2pSearch(document.getElementById('p2pQuery').value); });
  document.getElementById('p2pStop').addEventListener('click', p2pStop);
  document.getElementById('p2pFormat').addEventListener('change', (e) => { p2pSetPrefs({ format: e.target.value }); p2pRerank(); });
  const fset = (k, v) => { p2pSetPrefs({ [k]: v }); p2pRender(); };          // (1.102.0) the filters
  document.getElementById('p2pPickBy').addEventListener('change', (e) => { p2pSetPrefs({ pickBy: e.target.value }); });          // (1.105.0) for the next pick
  document.getElementById('p2pFFormat').addEventListener('change', (e) => fset('fFormat', e.target.value));
  document.getElementById('p2pFMatches').addEventListener('change', (e) => fset('fMatches', e.target.checked));
  document.getElementById('p2pFFree').addEventListener('change', (e) => fset('fFree', e.target.checked));
  document.getElementById('p2pFLocked').addEventListener('change', (e) => fset('fHideLocked', e.target.checked));
  document.getElementById('p2pSort').addEventListener('change', (e) => fset('sort', e.target.value));
  document.getElementById('p2pFText').addEventListener('input', (e) => { if (p2p.cur) { p2p.cur.text = e.target.value; p2pRender(); } });
  document.getElementById('p2pKeep').addEventListener('change', (e) => { p2pSetKeep({ mode: e.target.value }); p2pRender(); });          // (1.98.0)
  document.getElementById('p2pAhead').addEventListener('change', (e) => { p2pSetKeep({ ahead: Number(e.target.value) }); });          // (1.100.0)
  document.getElementById('p2pCap').addEventListener('change', (e) => { p2pSetKeep({ capGb: Math.max(0.5, Number(e.target.value) || 2) }); });
  document.getElementById('p2pDlPlay').addEventListener('click', () => { const c = p2p.cur; if (c && c.item) { const ch = p2pChoiceFor(c.item); p2pDownload(c.item, ch, true); p2pClose(); } });
  document.getElementById('p2pForget').addEventListener('click', () => { const c = p2p.cur; if (!c || !c.item) return; p2pChoose(c.item, null); if (typeof p2pForget === 'function') p2pForget(artKey(c.item), true); flashGlobalToast(`Forgot the source for ${c.item.title}.`); p2pRender(); });
  document.getElementById('p2pDlOnly').addEventListener('click', () => { const c = p2p.cur; if (c && c.item) p2pDownload(c.item, p2pChoiceFor(c.item), false); });
  document.getElementById('p2pFolderLine').addEventListener('click', (e) => { if (e.target.closest('[data-p2p-folder-pick]')) p2pDirPick(); else if (e.target.closest('[data-p2p-folder-allow]')) p2pDirAllow(); });
  document.getElementById('p2pResults').addEventListener('click', (e) => {
    const c = p2p.cur; if (!c) return;
    const ch = e.target.closest('[data-p2p-choose]');
    if (ch) { const f = (c.shown || c.ranked)[+ch.dataset.p2pChoose]; if (!f || !c.item) return; const was = p2pChoiceFor(c.item); if (was && was.user === f.user && was.dir === f.dir) return; p2pUseSource(c.item, f, c.tracks); c.autoPicked = false; flashGlobalToast(`Source for ${c.item.title}: ${f.name}, from ${f.user}.`); p2pRender(); return; }          // (1.101.0) Use this instead
    const h = e.target.closest('[data-p2p-folder]'); if (!h) return; const row = h.closest('.p2p-folder'), k = row.dataset.key; row.classList.toggle('open'); h.setAttribute('aria-expanded', row.classList.contains('open'));
    if (row.classList.contains('open')) c.open.add(k); else c.open.delete(k);          // kept open as the list updates
  });
}
function p2pOpen(item) {                                            // item: a release (searches by itself, and checks against its tracklist), or nothing (free search)
  p2pEnsureDom();
  const ov = document.getElementById('p2pOverlay'), q = document.getElementById('p2pQuery');
  p2p.cur = { item: item || null, reqId: '', state: 'idle', folders: [], ranked: [], responses: 0, files: 0, error: '', tracks: null, autoPending: !!item, tries: 0, open: new Set(), text: '', status2: '' };
  q.value = item ? p2pQueryFor(item) : '';
  document.getElementById('p2pTitle').textContent = item ? `${p2pHasSource(item) ? 'P2P source' : 'Find on P2P'}: ${item.title || ''}` : 'P2P search';
  const pf = p2pPrefs(); document.getElementById('p2pFormat').value = pf.format; document.getElementById('p2pPickBy').value = pf.pickBy || 'quality'; document.getElementById('p2pFFormat').value = pf.fFormat; document.getElementById('p2pFMatches').checked = !!pf.fMatches; document.getElementById('p2pFFree').checked = !!pf.fFree; document.getElementById('p2pFLocked').checked = pf.fHideLocked !== false; document.getElementById('p2pSort').value = pf.sort; document.getElementById('p2pFText').value = '';
  ov.hidden = false; p2pRender(); q.focus(); q.select();
  if (item) {
    const c = p2p.cur;
    Promise.resolve(getTracksFor(item)).then(t => { if (p2p.cur !== c) return; c.tracks = (t || []).filter(x => x && x.trackName); p2pRerank(); }).catch(() => { if (p2p.cur === c) { c.tracks = []; p2pRerank(); } });
  }
  if (!p2p.ready) p2pHello(); else if (item && p2p.configured) p2pAutoSearch();
}
function p2pAutoSearch() { const c = p2p.cur; if (!c || !c.autoPending) return; c.autoPending = false; p2pSearch(document.getElementById('p2pQuery').value); }
function p2pClose() { const ov = document.getElementById('p2pOverlay'); if (!ov || ov.hidden) return; p2pStop(); ov.hidden = true; p2p.cur = null; }
function p2pRerank() { const c = p2p.cur; if (!c) return; c.ranked = c.item ? p2pRank(c.folders, c.tracks, c.item, p2pPrefs()) : c.folders.map(f => Object.assign({}, f, { m: null })); p2pAutoPick(c); p2pRender(); }
function p2pAutoPick(c) {                                          // (1.101.0) once the search is done and the tracklist is in, the best folder becomes the source (unless the release has one)
  if (!c || !c.item || c.state !== 'done' || c.tracks === null || p2pChoiceFor(c.item)) return;
  const best = p2pBestOf(p2pFiltered(c.ranked, Object.assign({}, p2pPrefs(), { sort: 'best' }), '')); if (best) { p2pUseSource(c.item, best, c.tracks); c.autoPicked = true; }          // what the filters show is what gets picked
}
async function p2pSearch(text) {
  const c = p2p.cur; if (!c) return;
  if (c.reqId && c.state === 'searching') await p2pStop();
  const reqId = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), q = String(text || '').trim();
  if (!c.status2Keep) c.status2 = ''; c.status2Keep = false;
  Object.assign(c, { reqId, q, state: 'searching', folders: [], ranked: [], responses: 0, files: 0, error: '', started: Date.now() }); c.tries++; p2pRender();
  const r = await p2pCall('search', { reqId, q });
  if (p2p.cur !== c || c.reqId !== reqId) return;
  if (!r.ok) { c.state = 'error'; c.error = p2pWhy(r); p2pRender(); return; }
  const tick = async () => {
    if (p2p.cur !== c || c.reqId !== reqId || c.state !== 'searching') return;
    const p = await p2pCall('poll', { reqId });
    if (p2p.cur !== c || c.reqId !== reqId || c.state !== 'searching') return;
    if (!p.ok) { c.state = 'error'; c.error = p2pWhy(p); p2pRender(); return; }
    Object.assign(c, { responses: p.responses, files: p.files, folders: p.folders || c.folders });
    if (p.done) c.state = 'done';
    p2pRerank();
    p2pAutoPick(c);
    if (!p.done) { setTimeout(tick, 1500); return; }
    if (!c.folders.length && c.item) {                               // nothing at all: the next way of asking (without the year, then the title alone)
      const qs = p2pQueries(c.item), k = qs.findIndex(x => x.toLowerCase() === q.toLowerCase()), alt = k >= 0 ? qs[k + 1] : null;
      if (alt) { document.getElementById('p2pQuery').value = alt; c.status2 = `Nothing for \u201c${q}\u201d, so this is \u201c${alt}\u201d.`; c.status2Keep = true; p2pSearch(alt); }
    }
  };
  setTimeout(tick, 1200);
}
async function p2pSearchFolders(q, maxMs) {                         // (1.99.0) a search without the dialog -> { ok, folders } | { ok: false, reason }
  const reqId = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t0 = Date.now();
  const r = await p2pCall('search', { reqId, q }); if (!r.ok) return r;
  let folders = [];
  while (Date.now() - t0 < (maxMs || 25000)) {
    await new Promise(res => setTimeout(res, 1500));
    const p = await p2pCall('poll', { reqId }); if (!p.ok) return p;
    folders = p.folders || folders; if (p.done) return { ok: true, folders };
  }
  p2pCall('cancel', { reqId }); return { ok: true, folders };
}
async function p2pStop() {
  const c = p2p.cur; if (!c || !c.reqId || c.state !== 'searching') return;
  c.state = 'done'; p2pRender(); await p2pCall('cancel', { reqId: c.reqId });
}
function p2pRender() {
  const c = p2p.cur; if (!c) return;
  const st = document.getElementById('p2pStatus'), bar = document.getElementById('p2pBar'), res = document.getElementById('p2pResults');
  document.getElementById('p2pStop').hidden = c.state !== 'searching'; document.getElementById('p2pGo').disabled = c.state === 'searching';
  bar.hidden = c.state !== 'searching';
  if (c.state === 'searching') bar.firstChild.style.width = Math.min(100, (Date.now() - c.started) / 150).toFixed(1) + '%';          // a search runs about 15 seconds
  document.getElementById('p2pTracksNote').textContent = !c.item ? 'Search for a release (right-click it → Find on P2P…) to check folders against its songs.' : c.tracks === null ? 'Loading the tracklist…' : c.tracks.length ? `Checked against its ${c.tracks.length} songs.` : 'No tracklist for this release: folders are judged by name only.';
  const chosen = p2pChoiceFor(c.item), ce = document.getElementById('p2pChosen');
  ce.hidden = !chosen; if (chosen) document.getElementById('p2pChosenText').textContent = `Source${c.autoPicked ? ' (picked for you)' : ''}: ${chosen.name} (${(chosen.ext || '').toUpperCase()}, ${chosen.count} songs), from ${chosen.user}.`;
  if (chosen) { const rec = typeof p2pDl !== 'undefined' && p2pDl[artKey(c.item)], busy = rec && rec.user === chosen.user && rec.songs.some(s => s.st === 'wait' || s.st === 'down'); document.getElementById('p2pDlOnly').hidden = !!busy; document.getElementById('p2pDlPlay').textContent = busy ? 'Play (downloading)' : 'Download and play'; }
  const keep = typeof p2pKeep === 'function' ? p2pKeep() : { mode: 'delete', capGb: 2 }, ks = document.getElementById('p2pKeep');
  if (document.activeElement !== ks) ks.value = keep.mode; const ah = document.getElementById('p2pAhead'); if (document.activeElement !== ah) ah.value = String(keep.ahead == null ? 1 : keep.ahead); document.getElementById('p2pCapWrap').hidden = keep.mode !== 'cap'; const cap = document.getElementById('p2pCap'); if (document.activeElement !== cap) cap.value = keep.capGb;
  const fl = document.getElementById('p2pFolderLine'), perm = typeof p2pDirPerm !== 'undefined' ? p2pDirPerm : 'none';
  const flHtml = !p2pFolderSupported() ? 'This browser can\u2019t open a folder for CRATE (Chrome or Edge can).' : perm === 'granted' ? `Downloads folder: <b>${escapeHtml(p2pDir ? p2pDir.name : '')}</b> <button type="button" class="link-btn" data-p2p-folder-pick>Change</button>` : perm === 'prompt' ? `Downloads folder: <b>${escapeHtml(p2pDir ? p2pDir.name : '')}</b> <button type="button" class="chip-btn" data-p2p-folder-allow>Allow access</button>` : '<button type="button" class="chip-btn" data-p2p-folder-pick>Choose slskd\u2019s downloads folder</button>';
  if (fl.dataset.html !== flHtml) { fl.dataset.html = flHtml; fl.innerHTML = flHtml; }
  const all = c.ranked.length || !c.folders.length ? c.ranked : c.folders.map(f => Object.assign({}, f, { m: null })), list = c.shown = p2pFiltered(all, p2pPrefs(), c.text), hidden = all.length - list.length, n = all.length, sure = all.filter(f => f.m && f.m.verdict === 'sure').length;
  st.className = 'p2p-status' + (c.state === 'error' ? ' bad' : '');
  st.textContent = c.state === 'error' ? c.error
    : !p2p.ready ? 'Waiting for the CRATE for P2P add-on… (not installed? Its options page says how to connect it to this CRATE.)'
    : !p2p.configured ? 'The add-on isn’t set up yet: open its options and enter slskd’s address and API key.'
    : c.state === 'idle' ? 'Searches Soulseek through your slskd. Takes about 15 seconds.'
    : c.state === 'searching' ? `Searching for “${c.q}”… ${c.responses} user${c.responses === 1 ? '' : 's'} answered so far.`
    : n && !list.length ? `All ${n} folders are hidden by the filters: loosen them to see them.`
    : n ? `${c.status2 ? c.status2 + ' ' : ''}${n} folder${n === 1 ? '' : 's'} with audio, from ${c.responses} user${c.responses === 1 ? '' : 's'}${hidden ? ` (${hidden} hidden by the filters)` : ''}.` + (c.item ? (sure ? ` ${sure} sure match${sure === 1 ? '' : 'es'}, best first.` : ' No sure match: check the closest ones.') : ' Ones you could start on now are first.')
    : 'Nothing found. Try fewer words (the artist and the release’s main title), or check that slskd is logged in to Soulseek.';
  res.innerHTML = list.map((f, i) => {
    const m = f.m, fmt = (f.ext || '?').toUpperCase() + (f.lossless ? (f.files[0] && f.files[0].bitDepth ? ` ${f.files[0].bitDepth}/${Math.round((f.files[0].sampleRate || 44100) / 100) / 10}` : '') : f.bitRate ? ` ${f.bitRate}` : '');
    const avail = f.locked >= f.count ? '' : f.freeSlot ? '<span class="p2p-pill ok">Free slot</span>' : `<span class="p2p-pill">Queue ${f.queue}</span>`;
    const isChosen = chosen && chosen.user === f.user && chosen.dir === f.dir;
    const detail = m && m.map.length
      ? `<ol class="p2p-map">${(c.tracks || []).map((t, k) => { const mm = m.map[k], file = mm && mm.file >= 0 ? f.files[mm.file] : null; return `<li class="${file ? (mm.dSec !== null && mm.dSec > 6 ? 'off' : '') : 'missing'}"><span class="p2p-tn">${k + 1}</span><span>${escapeHtml(t.trackName)}</span><span class="p2p-tl">${t.trackTimeMillis ? formatMs(t.trackTimeMillis) : ''}</span><span class="p2p-arrow">${file ? '→' : ''}</span><span class="p2p-fn">${file ? escapeHtml(file.name) : 'Not in this folder'}</span><span class="p2p-tl">${file ? p2pLen(file.lengthSec) : ''}</span></li>`; }).join('')}</ol>`
        + (m.extra.length ? `<p class="p2p-extra-h">Not in your tracklist</p><ol class="p2p-files">${m.extra.map(j => f.files[j]).filter(Boolean).map(x => `<li><span>${escapeHtml(x.name)}</span><span>${p2pLen(x.lengthSec)}</span><span>${p2pSize(x.size)}</span></li>`).join('')}</ol>` : '')
      : `<ol class="p2p-files">${f.files.map(x => `<li><span>${escapeHtml(x.name)}</span><span>${p2pLen(x.lengthSec)}</span><span>${p2pSize(x.size)}</span></li>`).join('')}</ol>`;
    const key = f.user + '\u0001' + f.dir, open = c.open.has(key), parent = /^@@/.test(f.parent || '') ? '' : f.parent;          // "@@music": the sharer's name for a shared folder, not a real parent
    return `<div class="p2p-folder${m ? ' v-' + m.verdict : ''}${isChosen ? ' chosen' : ''}${open ? ' open' : ''}" data-key="${escapeHtml(key)}">
      <button type="button" class="p2p-folder-head" data-p2p-folder="${i}" aria-expanded="${open}">
        <span class="p2p-name"><b>${escapeHtml(f.name)}</b>${parent ? `<small>${escapeHtml(parent)}</small>` : ''}</span>
        <span class="p2p-meta"><span class="p2p-fmt${f.lossless ? ' lossless' : ''}">${escapeHtml(fmt)}</span><span>${f.count} song${f.count === 1 ? '' : 's'}</span><span>${p2pLen(f.totalSec)}</span><span>${p2pSize(f.totalSize)}</span>${avail}${f.locked ? '<span class="p2p-pill bad" title="This user only shares these with friends">Locked</span>' : ''}</span>
        <span class="p2p-user">${escapeHtml(f.user)}${f.speed ? ` · ${p2pSize(f.speed)}/s` : ''}</span>
        ${m ? `<span class="p2p-verdict"><span class="p2p-v">${escapeHtml(m.label)}</span>${m.notes.map(x => `<span class="p2p-note">${escapeHtml(x)}</span>`).join('')}</span>` : ''}
      </button>
      ${c.item && m && !m.unavailable ? `<button type="button" class="chip-btn p2p-choose" data-p2p-choose="${i}">${isChosen ? 'Source ✓' : 'Use this instead'}</button>` : ''}
      <div class="p2p-detail">${detail}</div>
    </div>`;
  }).join('');
}
setInterval(() => { if (p2p.cur && p2p.cur.state === 'searching') { const b = document.getElementById('p2pBar'); if (b && !b.hidden) b.firstChild.style.width = Math.min(100, (Date.now() - p2p.cur.started) / 150).toFixed(1) + '%'; } }, 500);          // the bar moves between answers
(function p2pWire() {                                               // ⚙ → P2P search…
  const m = document.getElementById('menuActivity'); if (!m) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'menuP2p'; b.textContent = 'P2P search…';
  m.insertAdjacentElement('afterend', b);
  b.addEventListener('click', () => { const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; p2pOpen(null); });
})();
