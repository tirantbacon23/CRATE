// (1.135.198) Pull details for many releases at once (canvas: CRATE batch pull details). Pick the releases (the ones selected, the view, or
// every release missing something), the details and the sources; each release is asked of the sources Pull details knows (RYM as the
// add-on saw it, MusicBrainz, Discogs, Spotify, iTunes), four releases at a time. Then either the blanks are filled by themselves (nothing
// you have is touched), or one list shows every change, old → new, with where it came from: filled blanks ticked, anything that would
// replace yours left for you to tick, and where the sources disagree, you pick. It keeps going if the window is put away (a corner card).
const BPD_FIELDS = [['type', 'Type'], ['date', 'Release date'], ['label', 'Label'], ['catalog', 'Catalogue number'], ['tracks', 'Tracklist'], ['cover', 'Cover'], ['genre', 'Genres']];
const BPD_REPL = new Set(['type', 'date', 'label', 'catalog']);          // these may offer to replace what you have (only ever ticked by you); the rest only fill blanks
const BPD_SRC = [['rym', 'RYM'], ['mb', 'MusicBrainz'], ['dc', 'Discogs'], ['sp', 'Spotify'], ['it', 'iTunes']];
const BPD_HAS = { rym: 'type date label catalog tracks cover genre', mb: 'type date label catalog tracks cover', dc: 'type date label catalog tracks cover genre', sp: 'type date label tracks cover genre', it: 'type date tracks cover genre' };
const BPD_ORDER = { tracks: ['mb', 'sp', 'it', 'dc', 'rym'], cover: ['mb', 'it', 'sp', 'dc', 'rym'], genre: ['rym', 'dc', 'sp', 'it'] };          // (MusicBrainz's lists have lengths; RYM's don't)
const BPD_COL = { type: 'Type', date: 'ReleaseDate', label: 'Label', catalog: 'Catalog', genre: 'Genre', cover: 'Cover' };
const BPD_KEY = 'crate_bpd_v1', BPD_CAP = 300;
let bpd = null;
const bpdName = (k) => (BPD_SRC.find(s => s[0] === k) || [k, k])[1];
const bpdFieldName = (f) => (BPD_FIELDS.find(x => x[0] === f) || [f, f])[1];
function bpdPrefs() {
  const d = { fields: ['type', 'date', 'label', 'catalog', 'tracks', 'cover'], srcs: BPD_SRC.map(s => s[0]), mode: 'review' };
  try { const p = JSON.parse(localStorage.getItem(BPD_KEY) || '{}'); return { fields: Array.isArray(p.fields) ? p.fields : d.fields, srcs: Array.isArray(p.srcs) && p.srcs.length ? p.srcs : d.srcs, mode: p.mode === 'fill' ? 'fill' : 'review' }; } catch (e) { return d; }
}
function bpdSavePrefs() { try { localStorage.setItem(BPD_KEY, JSON.stringify({ fields: [...bpd.fields], srcs: [...bpd.srcs], mode: bpd.mode })); } catch (e) { /* this visit */ } }
function bpdNow(it, f) {
  if (f === 'tracks') { const n = (it.manualTracks || []).filter(t => t && t.title).length; return n ? `${n} song${n === 1 ? '' : 's'}` : ''; }
  if (f === 'date') return String(it.releaseDate || '').trim();
  if (f === 'catalog') return typeof dgCatKey === 'function' && dgCatKey(it.catalog) ? String(it.catalog).trim() : '';
  return String(it[f] || '').trim();
}
const bpdNorm = (f, v) => f === 'catalog' && typeof dgCatKey === 'function' ? dgCatKey(v) : String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, ' ').trim();
function bpdScopes() {
  const sel = typeof bmSelectedItems === 'function' ? bmSelectedItems() : [], view = (state.filtered || state.raw || []).slice();
  const miss = (state.raw || []).filter(it => [...bpd.fields].some(f => !bpdNow(it, f)));
  return { sel, view, miss };
}
function bpdOpen(items) {
  if (bpd && bpd.step !== 'start' && !bpd.finished) { bpdShow(); return; }          // one run at a time: this brings it back
  const p = bpdPrefs();
  bpd = { step: 'start', fields: new Set(p.fields), srcs: new Set(p.srcs), mode: p.mode, given: items && items.length ? items.slice() : null, scope: '', rows: [], filter: 'all', chain: Promise.resolve(), applying: false };
  const sc = bpdScopes(); bpd.scope = bpd.given ? 'given' : sc.sel.length > 1 ? 'sel' : 'miss';
  bpdShow();
}
function bpdList() { const sc = bpdScopes(); return bpd.scope === 'given' ? bpd.given : bpd.scope === 'sel' ? sc.sel : bpd.scope === 'view' ? sc.view : sc.miss; }
function bpdShow() {
  let ov = document.getElementById('bpdOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'bpdOverlay'; ov.className = 'bpd-overlay'; document.body.appendChild(ov);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) bpdHide(); });
    ov.addEventListener('click', bpdClick); ov.addEventListener('change', bpdChange);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bpd && !ov.hidden) bpdHide(); });
  }
  ov.hidden = false; const m = document.getElementById('bpdMini'); if (m) m.hidden = true; bpdDraw(true);
}
function bpdHide() {                                                  // closing while it runs puts it in the corner
  const ov = document.getElementById('bpdOverlay'); if (ov) ov.hidden = true;
  if (!bpd || bpd.step === 'start' || (bpd.finished && !bpdPendingCount())) { bpd = null; const m = document.getElementById('bpdMini'); if (m) m.remove(); return; }
  bpdMini();
}
function bpdPendingCount() { return bpd ? bpd.rows.filter(r => r.st === 'done' && !r.applied && r.changes.length).length : 0; }
function bpdCounts() {
  const c = { done: 0, changes: 0, same: 0, none: 0, ask: 0, wait: 0, applied: 0, filled: 0 };
  bpd.rows.forEach(r => { if (r.st === 'wait') c.wait++; else if (r.st === 'ask') c.ask++; else { c.done++; if (r.st === 'none') c.none++; else if (!r.changes.length && !r.appliedN) c.same++; else c.changes++; } if (r.appliedN) { c.applied++; c.filled += r.appliedN; } });
  return c;
}
function bpdMini() {
  let m = document.getElementById('bpdMini');
  if (!m) { m = document.createElement('div'); m.id = 'bpdMini'; m.className = 'bpd-mini'; m.setAttribute('role', 'status'); document.body.appendChild(m); m.addEventListener('click', (e) => { if (e.target.closest('[data-bpd-x]')) { if (bpd) bpd.stopped = true; bpd = null; m.remove(); return; } if (e.target.closest('[data-bpd-open]')) bpdShow(); }); }
  if (!bpd) { m.remove(); return; }
  const ov = document.getElementById('bpdOverlay'); m.hidden = !(ov && ov.hidden);
  const c = bpdCounts(), n = bpd.rows.length, pct = n ? Math.round(c.done / n * 100) : 0, pend = bpdPendingCount();
  const html = `<div class="bpd-mini-t"><b>${bpd.finished ? 'Details pulled' : 'Pulling details'}</b><span>${c.done} / ${n}</span>${bpd.finished ? '<button type="button" data-bpd-x aria-label="Dismiss">×</button>' : ''}</div><div class="bpd-bar"><i style="width:${pct}%"></i></div><div class="bpd-mini-s"><span>${bpd.mode === 'fill' ? `${c.filled} filled on ${c.applied}` : `${pend} with changes`}</span><button type="button" data-bpd-open>${bpd.mode === 'review' && pend ? 'Review' : 'Open'}</button></div>`;
  if (m.dataset.h !== html) { m.dataset.h = html; m.innerHTML = html; }
}

// ----- asking -----
function bpdRym(it) {
  if (!bpd.rymList) return { err: 'The add-on didn’t answer' };
  const e = typeof tlRymPick === 'function' ? tlRymPick(bpd.rymList, it) : null, tracks = e && !rymTracklistLooksWrong(e.tracks) ? pdTracks(e.tracks) : [], d = (e && e.d) || {};
  if (!tracks.length && !d.label && !d.date && !d.genre && !d.cover) return { err: 'unseen' };
  return { tracks, type: typeof rymUrlType === 'function' ? rymUrlType(rymUpdateUrl(it) || it.rymLink) : '', label: d.label || '', catalog: d.catalog || '', date: d.date || '', genre: d.genre || '', cover: d.cover || '' };
}
function bpdWanted(it) { return [...bpd.fields].filter(f => !bpdNow(it, f) || (bpd.mode === 'review' && BPD_REPL.has(f))); }
async function bpdOne(r, me) {
  const want = bpdWanted(r.it); r.st = 'ask'; r.src = {}; bpdDraw();
  if (!want.length) { r.st = 'done'; r.changes = []; return; }
  const ks = [...bpd.srcs].filter(k => want.some(f => BPD_HAS[k].includes(f)));
  const ask = { rym: async (it) => bpdRym(it), mb: pdFromMb, dc: (it) => pdFromDiscogs(it), sp: pdFromSpotify, it: pdFromItunes };
  await Promise.all(ks.map(async k => {
    r.src[k] = 'ask'; let d;
    try { d = await ask[k](r.it); } catch (e) { d = { err: String((e && e.message) || e).slice(0, 80) }; }
    if (bpd !== me) return; r.got[k] = d || { err: 'Nothing' }; r.src[k] = d && !d.err ? 'ok' : d && d.err === 'unseen' ? 'unseen' : 'none'; bpdDraw();
  }));
  if (bpd !== me) return;
  r.changes = bpdChanges(r, want); r.st = ks.some(k => r.src[k] === 'ok') ? 'done' : 'none'; if (r.st === 'none') r.changes = [];
  if (bpd.mode === 'fill') { const blanks = r.changes.filter(c => !c.replace); if (blanks.length) bpd.chain = bpd.chain.then(() => bpdApplyRow(r, blanks)); }
}
function bpdChanges(r, want) {
  const out = [], it = r.it;
  want.forEach(f => {
    const now = bpdNow(it, f), order = BPD_ORDER[f] || BPD_SRC.map(s => s[0]), vals = [];
    order.forEach(k => {
      const d = r.got[k]; if (!d || d.err) return; let v = d[f];
      if (f === 'tracks') { if (!(v && v.length)) return; } else { v = String(v || '').trim(); if (!v) return; }
      const key = f === 'tracks' ? 't' : bpdNorm(f, v); if (!key) return;
      const hit = vals.find(x => x.key === key || (f === 'date' && (x.key.startsWith(key) || key.startsWith(x.key))));
      if (hit) { hit.ks.push(k); if (f === 'date' && String(v).length > String(hit.v).length) { hit.v = v; hit.key = key; } }
      else vals.push({ key, v, ks: [k] });
    });
    if (!vals.length) return;
    if (now && f !== 'tracks') {
      const n = bpdNorm(f, now);
      if (vals.some(x => x.key === n || (f === 'date' && n.startsWith(x.key) && !vals.some(y => y.key.startsWith(n) && y.key !== n)))) return;          // a source already agrees with you (your date as precise or more)
    }
    out.push({ f, now, alts: vals, pick: 0, replace: !!now, on: !now });
  });
  return out;
}
async function bpdRun() {
  const me = bpd, list = bpdList().slice(0, BPD_CAP);
  bpd.step = 'run'; bpd.started = Date.now(); bpd.rows = list.map(it => ({ it, st: 'wait', got: {}, src: {}, changes: [] })); bpdSavePrefs(); bpdDraw(true);
  if (bpd.srcs.has('rym')) { bpd.rymList = await rymAskTracklists(3000); if (bpd !== me) return; }
  let i = 0; const worker = async () => { while (bpd === me && !bpd.stopped && i < bpd.rows.length) { const r = bpd.rows[i++]; await bpdOne(r, me); bpdDraw(); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (bpd !== me) return; await bpd.chain; if (bpd !== me) return;
  bpd.finished = true; bpd.rows.forEach(r => { if (r.st === 'ask' || r.st === 'wait') r.st = 'stopped'; });
  if (bpd.mode === 'fill') { rymRefreshViews(); scheduleCatalogSync(); bpd.step = 'done'; }
  else if (bpd.step === 'run') bpd.step = 'review';
  const ov = document.getElementById('bpdOverlay'); if (ov && ov.hidden) flashGlobalToast(bpd.mode === 'fill' ? `Pull details: ${bpdCounts().filled} blanks filled on ${bpdCounts().applied} releases.` : `Pull details: ${bpdPendingCount()} releases have changes to review.`);
  bpdDraw(true);
}

// ----- applying -----
async function bpdApplyRow(r, chs) {
  const it = r.it, payload = { action: 'editAlbum', row: it.row }; let tracks = null, tk = '', n = 0;
  for (const c of chs) {
    const a = c.alts[c.pick] || c.alts[0], v = a.v;
    if (c.f === 'tracks') { tracks = v; tk = a.ks[0]; continue; }
    if (c.f === 'cover' && !(await cxProbe(v))) continue;          // (only a cover that loads from here is saved)
    payload[BPD_COL[c.f]] = v; n++;
  }
  try {
    if (n) {
      await postUpdate(payload);
      if (payload.Cover) it.cover = payload.Cover; if (payload.ReleaseDate) it.releaseDate = payload.ReleaseDate; if (payload.Label) it.label = payload.Label; if (payload.Catalog) it.catalog = payload.Catalog; if (payload.Genre) it.genre = payload.Genre; if (payload.Type) it.type = payload.Type;
    }
    if (tracks) { await saveManualTracklist(it, tracks.map(t => ({ title: t.title, durationMs: t.durationMs || 0, section: t.section || '', s: PD_TL_SRC[tk] || 'lookup' })), true); n++; }
    r.applied = true; r.appliedN = (r.appliedN || 0) + n; r.changes = r.changes.filter(c => !chs.includes(c));
  } catch (e) { r.err = 'Couldn’t save: ' + String((e && e.message) || e).slice(0, 80); }
  bpdDraw();
}
async function bpdApply(onlyBlanks) {
  if (!bpd || bpd.applying) return; bpd.applying = true; bpdDraw();
  const todo = bpd.rows.filter(r => r.st === 'done' && r.changes.length).map(r => [r, r.changes.filter(c => onlyBlanks ? !c.replace : c.on)]).filter(x => x[1].length);
  bpd.applyN = 0; bpd.applyOf = todo.length;
  for (const [r, chs] of todo) { if (!bpd) return; await bpdApplyRow(r, chs); bpd.applyN++; bpdDraw(); }
  if (!bpd) return; bpd.applying = false; rymRefreshViews(); scheduleCatalogSync();
  const c = bpdCounts(); flashGlobalToast(`Updated ${todo.length} release${todo.length === 1 ? '' : 's'}: ${c.filled} detail${c.filled === 1 ? '' : 's'} written.`);
  if (bpd.finished && !bpdPendingCount()) bpd.step = 'done';
  bpdDraw(true);
}

// ----- drawing -----
let bpdDrawT = 0;
function bpdDraw(now) {
  if (!now) { if (!bpdDrawT) bpdDrawT = setTimeout(() => { bpdDrawT = 0; bpdDraw(true); }, 120); return; }
  bpdMini();
  const ov = document.getElementById('bpdOverlay'); if (!ov || ov.hidden || !bpd) return;
  const list = ov.querySelector('.bpd-list'), top = list ? list.scrollTop : 0;
  const html = bpd.step === 'start' ? bpdStartHtml() : bpd.step === 'run' ? bpdRunHtml() : bpd.step === 'review' ? bpdReviewHtml() : bpdDoneHtml();
  if (ov.dataset.h === html) return; ov.dataset.h = html; ov.innerHTML = html;
  const l2 = ov.querySelector('.bpd-list'); if (l2) l2.scrollTop = top;
}
const bpdEsc = (s) => escapeHtml(String(s == null ? '' : s));
const bpdCv = (it) => { const u = it.cover || (state.artCache && (state.artCache[artKey(it)] || {}).art) || ''; return u ? `<img class="bpd-cv" src="${bpdEsc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="bpd-cv"></span>'; };
const bpdYr = (it) => String(it.releaseDate || '').slice(0, 4);
function bpdMins(n) {
  const mb = bpd.srcs.has('mb') ? n * 2.2 : 0, other = n * 1.6 / 4, s = Math.max(mb, other);
  return s < 60 ? 'under a minute' : `about ${Math.round(s / 60)} min`;
}
function bpdStartHtml() {
  const sc = bpdScopes(), list = bpdList(), n = Math.min(list.length, BPD_CAP);
  const scope = (k, label, items, sub) => `<label class="bpd-scope${bpd.scope === k ? ' on' : ''}"><span class="bpd-scope-h"><input type="radio" name="bpdScope" value="${k}"${bpd.scope === k ? ' checked' : ''}${items.length ? '' : ' disabled'}> ${label}</span><b>${items.length.toLocaleString()}</b><span class="bpd-mut">${sub}</span></label>`;
  const blank = (f) => list.slice(0, BPD_CAP).filter(it => !bpdNow(it, f)).length;
  const fields = BPD_FIELDS.map(([f, label]) => `<label class="bpd-field"><input type="checkbox" data-bpd-field="${f}"${bpd.fields.has(f) ? ' checked' : ''}> ${label}${BPD_REPL.has(f) ? '' : ' <span class="bpd-mut bpd-small">blanks only</span>'}<span class="bpd-grow"></span><span class="bpd-num${bpd.fields.has(f) ? ' on' : ''}">${blank(f)}</span></label>`).join('');
  const srcs = BPD_SRC.map(([k, label], i) => `<button type="button" class="bpd-src${bpd.srcs.has(k) ? ' on' : ''}" data-bpd-src="${k}" aria-pressed="${bpd.srcs.has(k)}">${i + 1} ${label}</button>`).join('');
  const viewSub = (state.filtered && state.raw && state.filtered.length < state.raw.length) ? 'what the grid shows now' : 'your whole crate';
  return `<div class="bpd-dialog bpd-start" role="dialog" aria-modal="true" aria-labelledby="bpdTitle">
    <div class="bpd-top"><div><h2 id="bpdTitle">Pull details</h2><p class="bpd-mut">Ask the sources about many releases at once, then choose what to keep.</p></div><button type="button" class="bpd-x" data-bpd-close aria-label="Close">×</button></div>
    <div class="bpd-body">
      <div class="bpd-sec"><span class="bpd-lbl">RELEASES</span><div class="bpd-scopes">
        ${bpd.given ? scope('given', 'These', bpd.given, 'the ones you picked') : scope('sel', 'Selected', sc.sel, sc.sel.length ? 'selected in the grid' : 'ctrl-click releases to select')}
        ${scope('view', 'This view', sc.view, viewSub)}
        ${scope('miss', 'Missing something', sc.miss, 'a ticked detail is blank')}
      </div>${list.length > BPD_CAP ? `<p class="bpd-mut bpd-small">The first ${BPD_CAP} are asked this time; run it again for the rest.</p>` : ''}</div>
      <div class="bpd-sec"><div class="bpd-row-b"><span class="bpd-lbl">DETAILS TO PULL</span><span class="bpd-mut bpd-small bpd-mono">blank now, of ${n.toLocaleString()}</span></div><div class="bpd-fields">${fields}</div></div>
      <div class="bpd-sec"><span class="bpd-lbl">SOURCES, IN ORDER OF TRUST</span><div class="bpd-srcs">${srcs}</div>
        <p class="bpd-mut bpd-small">RYM is what the add-on has already seen (no pages are opened); the releases it hasn't seen can have their RYM pages read afterwards. Tracklists and covers prefer MusicBrainz, which has lengths.</p></div>
      <div class="bpd-sec"><span class="bpd-lbl">WHEN IT’S FOUND</span><div class="bpd-modes">
        <label class="bpd-mode${bpd.mode === 'fill' ? ' on' : ''}"><input type="radio" name="bpdMode" value="fill"${bpd.mode === 'fill' ? ' checked' : ''}><span><b>Fill blanks by itself</b><span class="bpd-mut">Only empty details are written. Nothing you have is touched. No review.</span></span></label>
        <label class="bpd-mode${bpd.mode === 'review' ? ' on' : ''}"><input type="radio" name="bpdMode" value="review"${bpd.mode === 'review' ? ' checked' : ''}><span><b>Let me review</b><span class="bpd-mut">One list of every change, old → new, ticked per detail.</span></span></label>
      </div></div>
    </div>
    <div class="bpd-foot"><span class="bpd-mut bpd-mono bpd-small">${n.toLocaleString()} release${n === 1 ? '' : 's'} · ${bpd.fields.size} detail${bpd.fields.size === 1 ? '' : 's'} · ${n ? bpdMins(n) : '—'}</span><span class="bpd-grow"></span><button type="button" class="bpd-btn" data-bpd-close>Cancel</button><button type="button" class="bpd-btn bpd-go" data-bpd-run${n && bpd.fields.size && bpd.srcs.size ? '' : ' disabled'}>Pull details</button></div>
  </div>`;
}
function bpdRowStatus(r) {
  if (r.st === 'wait') return '<span class="bpd-mut">waiting</span>';
  if (r.st === 'ask') return `<span class="bpd-gold">asking…</span><span class="bpd-srcline">${Object.entries(r.src).map(([k, s]) => `${bpdName(k).replace('MusicBrainz', 'MB')} ${s === 'ask' ? '…' : s === 'ok' ? '✓' : '–'}`).join(' · ')}</span>`;
  if (r.st === 'none') return '<span class="bpd-mut">not found anywhere</span>';
  if (r.st === 'stopped') return '<span class="bpd-mut">stopped</span>';
  if (r.err) return `<span class="bpd-gold">${bpdEsc(r.err)}</span>`;
  if (r.appliedN) return `<span class="bpd-teal">✓ ${r.appliedN} filled</span>`;
  if (!r.changes.length) return '<span class="bpd-mut">nothing new</span>';
  return `<span class="bpd-teal">+ ${r.changes.map(c => bpdFieldName(c.f).toLowerCase().replace('catalogue number', 'cat no.').replace('release date', 'date') + (c.f === 'tracks' ? ` (${c.alts[0].v.length})` : '')).join(', ')}</span>`;
}
function bpdRunHtml() {
  const c = bpdCounts(), n = bpd.rows.length, pend = bpdPendingCount();
  const active = bpd.rows.filter(r => r.st === 'ask'), recent = bpd.rows.filter(r => r.st !== 'wait' && r.st !== 'ask').slice(-8).reverse(), waiting = bpd.rows.filter(r => r.st === 'wait');
  const left = c.wait + c.ask, el = (Date.now() - bpd.started) / 1000, per = c.done ? el / c.done : 0, eta = per && left ? Math.max(1, Math.round(per * left / 60)) : 0;
  const row = (r, cls) => `<div class="bpd-prow ${cls || ''}">${bpdCv(r.it)}<span class="bpd-who"><b>${bpdEsc(r.it.title)}</b><span class="bpd-mut">${bpdEsc(r.it.artist)}</span></span><span class="bpd-pst">${bpdRowStatus(r)}</span></div>`;
  const unseen = bpd.rows.filter(r => r.src.rym === 'unseen').length;
  return `<div class="bpd-dialog bpd-run" role="dialog" aria-modal="true" aria-labelledby="bpdTitle">
    <div class="bpd-top"><div class="bpd-row-b bpd-grow"><h2 id="bpdTitle">Pulling details</h2><span class="bpd-gold bpd-mono">${c.done} / ${n}</span></div><button type="button" class="bpd-x" data-bpd-close aria-label="Put away (it keeps going)" title="Put away: it keeps going">–</button></div>
    <div class="bpd-sec bpd-pad"><div class="bpd-bar"><i style="width:${n ? c.done / n * 100 : 0}%"></i><i class="bpd-bar-ask" style="width:${n ? c.ask / n * 100 : 0}%"></i></div>
      <div class="bpd-stats"><div><b class="bpd-teal">${bpd.mode === 'fill' ? c.filled : c.changes}</b><span>${bpd.mode === 'fill' ? 'blanks filled' : 'found changes'}</span></div><div><b>${c.same}</b><span>nothing new</span></div><div><b>${c.none}</b><span>not found</span></div><div><b class="bpd-gold">${c.ask}</b><span>asking now</span></div><div><b class="bpd-mut">${c.wait}</b><span>waiting</span></div></div></div>
    <div class="bpd-plist">${active.map(r => row(r, 'bpd-now')).join('')}${recent.map(r => row(r)).join('')}${waiting.slice(0, 3).map(r => row(r, 'bpd-dim')).join('')}
      <div class="bpd-more bpd-mono">${waiting.length > 3 ? `+ ${waiting.length - 3} more waiting` : ''}${eta ? ` · ~${eta} min left` : ''}${unseen ? ` · ${unseen} not seen on RYM yet` : ''}</div></div>
    <div class="bpd-foot">${bpd.mode === 'review' ? `<button type="button" class="bpd-btn bpd-go" data-bpd-review${pend ? '' : ' disabled'}>Review ${pend} so far</button>` : `<span class="bpd-mut bpd-small">Blanks are written as each release is found.</span>`}<span class="bpd-grow"></span><button type="button" class="bpd-btn bpd-plain" data-bpd-stop>Stop</button></div>
  </div>`;
}
function bpdChangeHtml(r, ri, c, ci, first) {
  const a = c.alts[c.pick] || c.alts[0], id = `${ri}:${ci}`;
  const show = (f, v) => f === 'tracks' ? (() => { const t = v.reduce((s, x) => s + (x.durationMs || 0), 0); return `<span title="${bpdEsc(v.map((x, i) => `${i + 1}. ${x.title}`).join('\n'))}">${v.length} song${v.length === 1 ? '' : 's'}${t ? ' · ' + tlFormatTime(t) : ''}</span>`; })() : f === 'cover' ? `<img class="bpd-newcv" src="${bpdEsc(v)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : bpdEsc(v);
  const pulled = c.alts.length > 1 && c.f !== 'tracks' && c.f !== 'cover'
    ? `<span class="bpd-alts">${c.alts.map((x, i) => `<label><input type="radio" name="bpdAlt${ri}_${ci}" data-bpd-alt="${id}" value="${i}"${i === c.pick ? ' checked' : ''}> ${bpdEsc(x.v)} <span class="bpd-mut bpd-mono bpd-small">${x.ks.map(bpdName).join(', ')}</span></label>`).join('')}</span>`
    : `<span class="${c.replace ? 'bpd-gold' : 'bpd-teal'}">${show(c.f, a.v)}${c.replace ? ' <span class="bpd-tag">REPLACES</span>' : ''}</span>`;
  const from = c.alts.length > 1 && c.f !== 'tracks' && c.f !== 'cover' ? '<span class="bpd-gold">disagree</span>' : `<span class="${a.ks[0] === 'rym' ? 'bpd-gold' : ''}">${a.ks.map(bpdName).join(', ')}</span>`;
  const relCell = first ? `<input type="checkbox" data-bpd-rel="${ri}" aria-label="All of ${bpdEsc(r.it.title)}"${r.changes.every(x => x.on) ? ' checked' : ''}><span class="bpd-who-r">${bpdCv(r.it)}<span class="bpd-who"><b>${bpdEsc(r.it.title)}</b><span class="bpd-mut">${bpdEsc(r.it.artist)}${bpdYr(r.it) ? ' · ' + bpdYr(r.it) : ''}</span></span></span>` : '<span></span><span></span>';
  return `<div class="bpd-rrow">${relCell}<label class="bpd-f"><input type="checkbox" data-bpd-tick="${id}"${c.on ? ' checked' : ''}> ${bpdFieldName(c.f)}</label><span class="${c.now ? '' : 'bpd-mut bpd-it'}">${c.now ? bpdEsc(c.now) : c.f === 'tracks' || c.f === 'cover' ? 'none' : 'blank'}</span>${pulled}<span class="bpd-mono bpd-small">${from}</span></div>`;
}
function bpdReviewHtml() {
  const c = bpdCounts(), rows = bpd.rows.map((r, ri) => [r, ri]).filter(([r]) => r.st === 'done' && r.changes.length);
  const all = rows.flatMap(([r]) => r.changes), blanks = all.filter(x => !x.replace).length, repl = all.length - blanks, dis = all.filter(x => x.alts.length > 1 && x.f !== 'tracks' && x.f !== 'cover').length;
  const ticked = all.filter(x => x.on).length, tickedRel = rows.filter(([r]) => r.changes.some(x => x.on)).length;
  const show = (r) => bpd.filter === 'repl' ? r.changes.some(x => x.replace) : bpd.filter === 'dis' ? r.changes.some(x => x.alts.length > 1 && x.f !== 'tracks' && x.f !== 'cover') : true;
  const body = rows.filter(([r]) => show(r)).map(([r, ri]) => `<div class="bpd-rel">${r.changes.map((x, ci) => bpdChangeHtml(r, ri, x, ci, ci === 0)).join('')}</div>`).join('');
  const none = bpd.rows.filter(r => r.st === 'none'), unseen = bpd.rows.filter(r => r.src.rym === 'unseen');
  const chip = (k, label) => `<button type="button" class="bpd-chip${bpd.filter === k ? ' on' : ''}" data-bpd-filter="${k}" aria-pressed="${bpd.filter === k}">${label}</button>`;
  return `<div class="bpd-dialog bpd-review" role="dialog" aria-modal="true" aria-labelledby="bpdTitle">
    <div class="bpd-top bpd-wrap"><h2 id="bpdTitle">Review changes</h2>
      <div class="bpd-heads bpd-mono"><span><b>${rows.length}</b> releases with changes</span><span><b class="bpd-teal">${blanks}</b> blanks filled</span><span><b class="bpd-gold">${repl}</b> would replace yours</span><span><b>${c.same}</b> already up to date</span>${c.applied ? `<span><b class="bpd-teal">${c.applied}</b> done</span>` : ''}${bpd.finished ? '' : `<span class="bpd-gold">still asking: ${c.done} / ${bpd.rows.length}</span>`}</div>
      <span class="bpd-grow"></span><div class="bpd-chips" role="group" aria-label="Show">${chip('all', 'All')}${chip('repl', `Replacing only (${repl})`)}${chip('dis', `Sources disagree (${dis})`)}</div><button type="button" class="bpd-x" data-bpd-close aria-label="Put away">×</button></div>
    <div class="bpd-rrow bpd-rhead bpd-mono"><span></span><span>RELEASE</span><span>DETAIL</span><span>NOW</span><span>PULLED</span><span>FROM</span></div>
    <div class="bpd-list">${body || `<p class="bpd-empty">${rows.length ? 'Nothing here with this filter.' : bpd.finished ? 'No changes to review.' : 'Nothing found yet…'}</p>`}
      ${none.length ? `<div class="bpd-none"><span class="bpd-lbl">NOT FOUND ANYWHERE (${none.length})</span>${none.slice(0, 30).map(r => `<button type="button" class="bpd-link" data-bpd-one="${bpd.rows.indexOf(r)}">${bpdEsc(r.it.title)} <span class="bpd-mut">${bpdEsc(r.it.artist)}</span></button>`).join('')}<p class="bpd-mut bpd-small">Each opens Pull details for that release, where a link can be pasted.</p></div>` : ''}
      ${unseen.length && bpd.finished ? `<div class="bpd-none"><span class="bpd-lbl">NOT SEEN ON RYM YET (${unseen.length})</span><p class="bpd-mut bpd-small">Their RYM pages can be read through the add-on, one at a time (about 15 s each); the update has its own Apply.</p><button type="button" class="bpd-btn" data-bpd-rymread>Read ${unseen.length} RYM page${unseen.length === 1 ? '' : 's'}</button></div>` : ''}
    </div>
    <div class="bpd-foot"><span class="bpd-mut bpd-mono bpd-small">${bpd.applying ? `applying ${bpd.applyN} / ${bpd.applyOf}…` : `ticked: ${ticked} change${ticked === 1 ? '' : 's'} on ${tickedRel} release${tickedRel === 1 ? '' : 's'} · replacing yours stays unticked unless you tick it`}</span><span class="bpd-grow"></span>
      <button type="button" class="bpd-btn" data-bpd-blanks${blanks && !bpd.applying ? '' : ' disabled'}>Fill blanks only (${blanks})</button><button type="button" class="bpd-btn bpd-go" data-bpd-apply${ticked && !bpd.applying ? '' : ' disabled'}>Apply ticked (${ticked})</button></div>
  </div>`;
}
function bpdDoneHtml() {
  const c = bpdCounts(), none = bpd.rows.filter(r => r.st === 'none'), unseen = bpd.rows.filter(r => r.src.rym === 'unseen'), errs = bpd.rows.filter(r => r.err);
  return `<div class="bpd-dialog bpd-done" role="dialog" aria-modal="true" aria-labelledby="bpdTitle">
    <div class="bpd-top"><h2 id="bpdTitle">Details pulled</h2><button type="button" class="bpd-x" data-bpd-close aria-label="Close">×</button></div>
    <div class="bpd-sec bpd-pad"><div class="bpd-stats"><div><b class="bpd-teal">${c.filled}</b><span>details written</span></div><div><b>${c.applied}</b><span>releases updated</span></div><div><b>${c.same}</b><span>nothing new</span></div><div><b>${c.none}</b><span>not found</span></div><div><b>${bpd.rows.length}</b><span>asked</span></div></div></div>
    <div class="bpd-list">
      ${errs.length ? `<div class="bpd-none"><span class="bpd-lbl">COULDN’T SAVE (${errs.length})</span>${errs.map(r => `<span>${bpdEsc(r.it.title)} <span class="bpd-mut">${bpdEsc(r.err)}</span></span>`).join('')}</div>` : ''}
      ${none.length ? `<div class="bpd-none"><span class="bpd-lbl">NOT FOUND ANYWHERE (${none.length})</span>${none.slice(0, 30).map(r => `<button type="button" class="bpd-link" data-bpd-one="${bpd.rows.indexOf(r)}">${bpdEsc(r.it.title)} <span class="bpd-mut">${bpdEsc(r.it.artist)}</span></button>`).join('')}</div>` : ''}
      ${unseen.length ? `<div class="bpd-none"><span class="bpd-lbl">NOT SEEN ON RYM YET (${unseen.length})</span><p class="bpd-mut bpd-small">Their RYM pages can be read through the add-on, one at a time (about 15 s each).</p><button type="button" class="bpd-btn" data-bpd-rymread>Read ${unseen.length} RYM page${unseen.length === 1 ? '' : 's'}</button></div>` : ''}
      ${!none.length && !unseen.length && !errs.length ? '<p class="bpd-empty">All done.</p>' : ''}
    </div>
    <div class="bpd-foot"><span class="bpd-grow"></span><button type="button" class="bpd-btn bpd-go" data-bpd-close>Done</button></div>
  </div>`;
}

// ----- clicks -----
function bpdClick(e) {
  if (!bpd) return; const t = e.target.closest('button,[data-bpd-src]'); if (!t) return;
  if (t.hasAttribute('data-bpd-close')) { bpdHide(); return; }
  if (t.dataset.bpdSrc) { const k = t.dataset.bpdSrc; if (bpd.srcs.has(k)) bpd.srcs.delete(k); else bpd.srcs.add(k); bpdDraw(true); return; }
  if (t.hasAttribute('data-bpd-run')) { bpdRun(); return; }
  if (t.hasAttribute('data-bpd-review')) { bpd.step = 'review'; bpdDraw(true); return; }
  if (t.hasAttribute('data-bpd-stop')) { bpd.stopped = true; t.disabled = true; t.textContent = 'Stopping…'; return; }
  if (t.dataset.bpdFilter) { bpd.filter = t.dataset.bpdFilter; bpdDraw(true); return; }
  if (t.hasAttribute('data-bpd-apply')) { bpdApply(false); return; }
  if (t.hasAttribute('data-bpd-blanks')) { bpdApply(true); return; }
  if (t.dataset.bpdOne) { const r = bpd.rows[+t.dataset.bpdOne]; if (r) { bpdHide(); pdOpen(r.it); } return; }
  if (t.hasAttribute('data-bpd-rymread')) { const its = bpd.rows.filter(r => r.src.rym === 'unseen').map(r => r.it); bpd.rows.forEach(r => { if (r.src.rym === 'unseen') r.src.rym = 'sent'; }); bpdHide(); rymFetchUpdates(its); return; }
}
function bpdChange(e) {
  if (!bpd) return; const t = e.target;
  if (t.name === 'bpdScope') { bpd.scope = t.value; bpdDraw(true); return; }
  if (t.name === 'bpdMode') { bpd.mode = t.value; bpdDraw(true); return; }
  if (t.dataset.bpdField) { if (t.checked) bpd.fields.add(t.dataset.bpdField); else bpd.fields.delete(t.dataset.bpdField); bpdDraw(true); return; }
  const at = (s) => { const [ri, ci] = s.split(':').map(Number), r = bpd.rows[ri]; return r ? [r, r.changes[ci]] : [null, null]; };
  if (t.dataset.bpdTick) { const [, c] = at(t.dataset.bpdTick); if (c) c.on = t.checked; bpdDraw(true); return; }
  if (t.dataset.bpdAlt) { const [, c] = at(t.dataset.bpdAlt); if (c) { c.pick = +t.value; c.on = true; } bpdDraw(true); return; }
  if (t.dataset.bpdRel) { const r = bpd.rows[+t.dataset.bpdRel]; if (r) r.changes.forEach(c => { c.on = t.checked; }); bpdDraw(true); }
}

// ----- where it opens: the selection bar, a release's menu with several selected (js/12), and ⚙ -----
(function () {
  const bar = document.getElementById('albumSelBar'), match = document.getElementById('albumSelMatch');
  if (bar && match) { const b = document.createElement('button'); b.type = 'button'; b.id = 'albumSelPull'; b.className = 'chip-btn'; b.textContent = 'Pull details…'; b.addEventListener('click', () => bpdOpen(bmSelectedItems())); match.insertAdjacentElement('afterend', b); }
  const after = document.getElementById('menuQuickAdd') || document.getElementById('menuRadio') || document.getElementById('menuMusicDb');
  if (after) { const b = document.createElement('button'); b.type = 'button'; b.id = 'menuBatchPull'; b.textContent = 'Pull details for many releases…'; b.title = 'Fill in type, date, label, catalogue number, tracklist and cover for many releases at once'; b.addEventListener('click', () => bpdOpen()); after.insertAdjacentElement('afterend', b); }
})();
