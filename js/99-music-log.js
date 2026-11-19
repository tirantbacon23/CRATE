// (1.135.192) Watching what goes into the music database: ⚙ › Music database… › Activity.
//   This browser: what CRATE has seen this visit (and what it left out because it sent it in the last two weeks), what's waiting to be sent,
//   and every batch sent (when, how many, from which source, the releases themselves, and whether the backend took it), and each Last.fm
//   fill (which artists, how many releases). Kept for the last 150 events. "Also log to the browser console" writes each one there too.
//   The database: what's waiting in its inbox to be merged (when, who sent it, how many, from where), when it last merged, and what was
//   added, and what changed, in the last 7 days (with where each came from), with a filter.
const MDL_KEY = 'crate_mdb_log_v1', MDL_DEBUG = 'crate_mdb_debug_v1';
const mdl = { seen: {}, queued: {}, skipped: {}, db: null, dbBusy: false, dbErr: '', filter: '', which: 'added' };
const MDL_SRC = { crates: 'crates', lastfm: 'Last.fm', rym: 'RYM', mb: 'MusicBrainz', dg: 'Discogs', search: 'search', scrobbles: 'scrobbles', card: 'card' };
function mdlAll() { try { const a = JSON.parse(localStorage.getItem(MDL_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function mdlDebug() { try { return localStorage.getItem(MDL_DEBUG) === '1'; } catch (e) { return false; } }
function mdlAdd(ev) {
  ev.t = Date.now(); const a = mdlAll(); a.unshift(ev); try { localStorage.setItem(MDL_KEY, JSON.stringify(a.slice(0, 150))); } catch (e) { /* this visit */ }
  if (mdlDebug()) console.info('[CRATE music database]', ev.kind, ev);
  mdlPaintSoon();
}
const mdlSrcCount = (items) => { const o = {}; (items || []).forEach(x => { o[x.src || '?'] = (o[x.src || '?'] || 0) + 1; }); return o; };
(function () {
  // what this CRATE sees, sent or not
  if (typeof mdbSee === 'function') { const base = mdbSee; mdbSee = function (x, src) {
    const before = mdb.q.size, had = x && x.a && x.t ? mdb.q.has(mdbKey(x.a, x.t) + '|' + src) : false; const r = base.apply(this, arguments);
    if (x && x.a && x.t) { mdl.seen[src] = (mdl.seen[src] || 0) + 1; if (mdb.q.size > before && !had) mdl.queued[src] = (mdl.queued[src] || 0) + 1; else mdl.skipped[src] = (mdl.skipped[src] || 0) + 1; }
    return r; }; }
  // what's sent, and what's asked of it
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof postUpdate !== 'function') return; const base = postUpdate;
    postUpdate = async function (payload) {
      const a = payload && payload.action;
      if (a !== 'masterMusicAdd' && a !== 'masterMusicFillPlan') return base.apply(this, arguments);
      try { const r = await base.apply(this, arguments);
        if (a === 'masterMusicAdd') mdlAdd({ kind: 'sent', n: (payload.items || []).length, similar: (payload.similar || []).length, src: mdlSrcCount(payload.items), ok: !!(r && r.ok), err: r && !r.ok ? (r.error || (r.joined === false ? 'not joined' : 'refused')) : '', items: (payload.items || []).slice(0, 60).map(x => ({ a: x.a, t: x.t, src: x.src, y: x.y || '', c: !!x.c, li: x.li || 0, rr: x.rr || 0 })), sim: (payload.similar || []).slice(0, 10).map(x => x.a) });
        else mdlAdd({ kind: 'plan', artists: (r && r.artists) || [], ok: !!(r && r.ok) });
        return r;
      } catch (e) { mdlAdd({ kind: a === 'masterMusicAdd' ? 'sent' : 'plan', n: (payload.items || []).length, src: mdlSrcCount(payload.items), ok: false, err: (e && e.message) || 'no answer', items: (payload.items || []).slice(0, 60).map(x => ({ a: x.a, t: x.t, src: x.src })) }); throw e; }
    };
  });
  if (typeof mdbFill === 'function') { const base = mdbFill; mdbFill = async function (opts) {
    const t0 = Date.now(), r = await base.apply(this, arguments);
    mdlAdd({ kind: 'fill', tag: (opts && opts.tag) || '', ok: !!(r && r.ok), n: (r && r.n) || 0, err: r && !r.ok ? r.why || '' : '', took: Math.round((Date.now() - t0) / 1000) }); return r; }; }
})();

// ----- the Activity tab -----
let mdlT = 0; function mdlPaintSoon() { clearTimeout(mdlT); mdlT = setTimeout(() => { if (mdb.view && mdb.view.tab === 'log') mdbRender(); }, 400); }
function mdlAgo(t) { return typeof mcAgo === 'function' ? mcAgo(t) : new Date(t).toLocaleString(); }
function mdlChips(o) { return Object.keys(o || {}).sort((a, b) => o[b] - o[a]).map(k => `<span class="mdl-chip">${escapeHtml(MDL_SRC[k] || k)} ${o[k]}</span>`).join(''); }
function mdlItemsHtml(items) { return items && items.length ? `<ul class="mdl-items">${items.map(x => `<li><b>${escapeHtml(x.t || '')}</b> <em>${escapeHtml(x.a || '')}${x.y ? ' · ' + escapeHtml(String(x.y).slice(0, 4)) : ''}</em> <span class="mdl-chip">${escapeHtml(MDL_SRC[x.src] || x.src || '')}</span>${x.c ? '<span class="mdl-tag">cover</span>' : ''}${x.li ? `<span class="mdl-tag">${rN(x.li)} listeners</span>` : ''}${x.rr ? `<span class="mdl-tag">RYM ${Number(x.rr).toFixed(2)}</span>` : ''}</li>`).join('')}</ul>` : ''; }
async function mdlLoadDb() {
  if (mdl.dbBusy) return; mdl.dbBusy = true; mdl.dbErr = ''; mdbRender();
  try { const r = await postUpdate({ action: 'masterMusicLog' }); if (!r || r.music !== true || r.ok === false) throw new Error(r && r.error && !/unknown music action/i.test(r.error) ? r.error : 'Your Apps Script still has an older Master.gs, without this report: paste the latest Master.gs into its Master file, then Deploy \u203a Manage deployments \u203a New version.'); mdl.db = r; }
  catch (e) { mdl.dbErr = e.message; }
  mdl.dbBusy = false; mdbRender();
}
function mdlHtml() {
  const ev = mdlAll(), waiting = [...mdb.q.values()], tot = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const db = mdl.db, f = mdl.filter.toLowerCase(), list = db ? (mdl.which === 'added' ? db.added : db.updated) || [] : [], shown = list.filter(x => !f || `${x.a} ${x.t} ${x.g}`.toLowerCase().includes(f));
  const evHtml = ev.slice(0, 60).map(e => {
    const what = e.kind === 'sent' ? `Sent ${e.n} release${e.n === 1 ? '' : 's'}${e.similar ? ` and ${e.similar} similar-artist list${e.similar === 1 ? '' : 's'}` : ''}` : e.kind === 'fill' ? `Last.fm fill${e.tag ? ` of “${escapeHtml(e.tag)}”` : ''}: ${e.n} ${e.tag ? 'releases' : 'artists'}${e.took ? `, ${e.took} s` : ''}` : `Fill plan: ${(e.artists || []).length} artists handed out`;
    const body = e.kind === 'sent' ? mdlItemsHtml(e.items) + (e.sim && e.sim.length ? `<p class="gs-s">Similar artists for: ${escapeHtml(e.sim.join(', '))}</p>` : '') : e.kind === 'plan' ? `<p class="gs-s">${escapeHtml((e.artists || []).join(', ') || 'none')}</p>` : '';
    return `<details class="mdl-ev${e.ok ? '' : ' mdl-bad'}"><summary><span class="mdl-t">${escapeHtml(mdlAgo(e.t))}</span><span class="mdl-what">${what}</span>${mdlChips(e.src)}<span class="mdl-st">${e.ok ? '✓' : '✕ ' + escapeHtml(e.err || 'failed')}</span></summary>${body}</details>`;
  }).join('') || '<p class="gs-s">Nothing sent from this browser yet.</p>';
  return `<div class="mdl">
    <div class="mc-card"><div class="mdl-h"><div class="gs-lbl">This browser</div><label class="mdl-dbg"><input type="checkbox" data-mdl="debug"${mdlDebug() ? ' checked' : ''}> Also log to the browser console</label></div>
      <div class="mdl-nums"><div><b>${tot(mdl.seen)}</b><span>seen this visit</span></div><div><b>${tot(mdl.queued)}</b><span>queued to send</span></div><div><b>${tot(mdl.skipped)}</b><span>left out: sent in the last 2 weeks, or already waiting</span></div><div><b class="mdb-gold">${waiting.length}</b><span>waiting to send now</span></div></div>
      <p class="gs-s mdl-by">Seen, by source: ${mdlChips(mdl.seen) || 'nothing yet'}</p>
      ${waiting.length ? `<details class="mdl-ev"><summary><span class="mdl-what">Waiting to send (it goes about 20 s after the last one is seen)</span>${mdlChips(mdlSrcCount(waiting))}<button type="button" class="gs-btn mdl-now" data-mdl="send">Send now</button></summary>${mdlItemsHtml(waiting.slice(0, 60))}</details>` : ''}
      <div class="gs-lbl mdl-sub">Sent, newest first</div>${evHtml}
      ${ev.length ? '<div class="mc-acts"><button type="button" class="gs-btn" data-mdl="clear">Clear this browser’s log</button></div>' : ''}</div>
    <div class="mc-card"><div class="mdl-h"><div class="gs-lbl">The database</div><button type="button" class="gs-btn" data-mdl="reload"${mdl.dbBusy ? ' disabled' : ''}>${mdl.dbBusy ? 'Reading…' : 'Read again'}</button></div>
      ${mdl.dbErr ? `<p class="pim-err">${escapeHtml(mdl.dbErr)}</p>` : !db ? '<p class="gs-s">Reading…</p>' : `
      <div class="mdl-nums"><div><b>${(db.releases || 0).toLocaleString()}</b><span>releases</span></div><div><b class="mdb-gold">${db.waiting || 0}</b><span>batches waiting to be merged</span></div><div><b>${db.mergedAt ? escapeHtml(mdlAgo(db.mergedAt)) : 'never'}</b><span>last merged</span></div><div><b class="mdb-teal">${db.addedN || 0}</b><span>added in 7 days</span></div></div>
      ${db.waiting ? '<div class="mc-acts"><button type="button" class="gs-btn" data-mdl="merge">Merge them now</button></div>' : ''}
      ${(db.inbox || []).length ? `<div class="gs-lbl mdl-sub">In the inbox, newest first</div>${db.inbox.map(b => `<details class="mdl-ev"><summary><span class="mdl-t">${escapeHtml(mdlAgo(b.at))}</span><span class="mdl-what">${b.you ? 'You' : escapeHtml(b.by || 'a friend')}: ${b.n} release${b.n === 1 ? '' : 's'}${b.similar ? ` · ${b.similar} similar lists` : ''}</span>${mdlChips(b.src)}</summary>${mdlItemsHtml(b.items)}</details>`).join('')}` : ''}
      <div class="mdl-h mdl-sub"><div class="mdl-tabs"><button type="button" class="${mdl.which === 'added' ? 'on' : ''}" data-mdl="added">Added (${db.addedN || 0})</button><button type="button" class="${mdl.which === 'updated' ? 'on' : ''}" data-mdl="updated">Changed (${db.updatedN || 0})</button></div><input type="search" class="mdl-f" data-mdl-filter placeholder="Filter" aria-label="Filter the releases" value="${escapeHtml(mdl.filter)}"></div>
      <div class="mdl-table">${shown.slice(0, 150).map(x => `<div class="mdl-row"><span><b>${escapeHtml(x.t)}</b><em>${escapeHtml(x.a)}${x.y ? ' · ' + escapeHtml(x.y) : ''}${x.g ? ' · ' + escapeHtml(x.g) : ''}</em></span><span>${mdlChips(x.src)}</span><span class="mdl-t">${escapeHtml(mdlAgo(mdl.which === 'added' ? x.added : x.updated))}</span></div>`).join('') || '<p class="gs-s">None in the last 7 days.</p>'}</div>`}</div>
  </div>`;
}
(function () {
  if (typeof mdbRender !== 'function') return;
  const base = mdbRender;
  mdbRender = function () {
    const r = base.apply(this, arguments), ov = document.getElementById('mdbOverlay'); if (!ov || !mdb.view || mdb.view.joinFirst) return r;
    const head = ov.querySelector('.pt-head'); if (!head) return r; const tab = mdb.view.tab || 'overview';
    const nav = document.createElement('div'); nav.className = 'mdl-nav'; nav.setAttribute('role', 'tablist');
    nav.innerHTML = [['overview', 'Overview'], ['log', 'Activity']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-mdl-tab="${k}">${l}</button>`).join('');
    head.insertAdjacentElement('afterend', nav);
    if (tab === 'log') { [...ov.querySelector('.pt-dialog').children].forEach(c => { if (c !== head && c !== nav) c.remove(); }); nav.insertAdjacentHTML('afterend', mdlHtml()); }
    return r;
  };
  document.addEventListener('click', async (e) => {
    const ov = document.getElementById('mdbOverlay'); if (!ov || !ov.contains(e.target)) return;
    const t = e.target.closest('[data-mdl-tab]'); if (t) { mdb.view.tab = t.dataset.mdlTab; if (mdb.view.tab === 'log' && !mdl.db) mdlLoadDb(); mdbRender(); return; }
    const b = e.target.closest('[data-mdl]'); if (!b || b.disabled) return; const k = b.dataset.mdl;
    if (k === 'send') { e.preventDefault(); await mdbFlush(); mdbRender(); }
    else if (k === 'clear') { try { localStorage.removeItem(MDL_KEY); } catch (er) { /* fine */ } mdbRender(); }
    else if (k === 'reload') mdlLoadDb();
    else if (k === 'merge') { b.disabled = true; b.textContent = 'Merging…'; try { await postUpdate({ action: 'masterMusicState', fresh: true }); } catch (er) { /* the log says what's left */ } mdlLoadDb(); }
    else if (k === 'added' || k === 'updated') { mdl.which = k; mdbRender(); }
  });
  document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('[data-mdl="debug"]')) { try { localStorage.setItem(MDL_DEBUG, e.target.checked ? '1' : '0'); } catch (er) { /* fine */ } } });
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('[data-mdl-filter]')) { mdl.filter = e.target.value; const pos = e.target.selectionStart; mdbRender(); const n = document.querySelector('[data-mdl-filter]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* fine */ } } } });
})();
