// (1.135.167) The music database, step 1 of CRATE Radio: one shared catalog of music, far beyond anyone's crate, kept with the master crate
// (Master.gs). It grows from the friends' crates (each night) and from what this CRATE sees as you use it:
//   the artist page's More Releases (MusicBrainz, Last.fm, Discogs) · release cards (Last.fm's numbers and tags) · online search results ·
//   the RYM pages you browse with the add-on (their ratings) · and a daily Last.fm fill: for artists your crates love (the backend hands
//   them out, so you and your friends never do the same ones), their top releases, their similar artists' top releases, and their tags.
// Only once you've joined the master crate; what's sent is releases and their public numbers, never anything of yours.
// ⚙ › Music database… shows it: its size, where it came from, what came in lately, and how well it covers the genres you love.
const MDB_SENT_KEY = 'crate_mdb_sent_v1', MDB_JOINED_KEY = 'crate_mc_joined_v1', MDB_FILL_KEY = 'crate_mdb_fill_v1';
const mdb = { q: new Map(), sim: [], t: 0, sent: null, busy: false, filling: false };
function mdbJoined() { try { const o = JSON.parse(localStorage.getItem(MDB_JOINED_KEY) || 'null'); return o && o.joined && Date.now() - o.at < 2 * 864e5 ? true : o && !o.joined && Date.now() - o.at < 864e5 ? false : null; } catch (e) { return null; } }
function mdbSetJoined(j) { try { localStorage.setItem(MDB_JOINED_KEY, JSON.stringify({ joined: !!j, at: Date.now() })); } catch (e) { /* asked again */ } }
async function mdbCheckJoined() {
  const j = mdbJoined(); if (j !== null) return j;
  try { const r = await postUpdate({ action: 'masterState' }); if (!r || r.master !== true) { mdbSetJoined(false); return false; } mdbSetJoined(!!r.joined); return !!r.joined; } catch (e) { return false; }
}
function mdbSentSet() { if (!mdb.sent) { try { mdb.sent = JSON.parse(localStorage.getItem(MDB_SENT_KEY) || '{}') || {}; } catch (e) { mdb.sent = {}; } } return mdb.sent; }
function mdbSentSave() { try { const s = mdbSentSet(), keys = Object.keys(s); if (keys.length > 30000) keys.sort((a, b) => s[a] - s[b]).slice(0, keys.length - 25000).forEach(k => { delete s[k]; }); localStorage.setItem(MDB_SENT_KEY, JSON.stringify(s)); } catch (e) { /* sent again later: merged, no harm */ } }
const mdbKey = (a, t) => (typeof smFold === 'function' ? smFold(a) + '|' + smFold(t) : String(a).toLowerCase() + '|' + String(t).toLowerCase());
// one release seen: { a, t, ty, y, g, d, l, c, li, lp, rr, rv, mb }, src: crates | lastfm | rym | mb | dg | search | scrobbles | card
function mdbSee(x, src) {
  if (!x || !x.a || !x.t || mdbJoined() === false) return;
  const k = mdbKey(x.a, x.t) + '|' + src, day = Math.floor(Date.now() / 864e5), s = mdbSentSet();
  if (s[k] && day - s[k] < 14 && !(x.li || x.rr)) return;          // (sent lately: again only with numbers, which may have grown)
  const o = { src }; ['a', 't', 'ty', 'y', 'g', 'd', 'l', 'c', 'li', 'lp', 'rr', 'rv', 'mb'].forEach(f => { if (x[f] != null && x[f] !== '' && x[f] !== 0) o[f] = typeof x[f] === 'number' ? x[f] : String(x[f]).slice(0, 300); });
  mdb.q.set(k, o); s[k] = day;
  clearTimeout(mdb.t); mdb.t = setTimeout(mdbFlush, mdb.q.size >= 300 ? 0 : 20000);
}
function mdbSimilar(artist, list) { if (artist && list && list.length) { mdb.sim.push({ a: artist, s: list.slice(0, 30) }); clearTimeout(mdb.t); mdb.t = setTimeout(mdbFlush, 20000); } }
async function mdbFlush() {
  if (mdb.busy || (!mdb.q.size && !mdb.sim.length)) return;
  if (!(await mdbCheckJoined())) { mdb.q.clear(); mdb.sim = []; return; }
  mdb.busy = true;
  const items = [...mdb.q.values()].slice(0, 380), similar = mdb.sim.splice(0, 50);
  items.forEach(o => mdb.q.delete(mdbKey(o.a, o.t) + '|' + o.src));
  try { const r = await postUpdate({ action: 'masterMusicAdd', items, similar }); if (r && r.joined === false) mdbSetJoined(false); mdbSentSave(); }
  catch (e) { items.forEach(o => mdb.q.set(mdbKey(o.a, o.t) + '|' + o.src, o)); mdb.sim = similar.concat(mdb.sim); }          // (tried again with the next batch)
  finally { mdb.busy = false; if (mdb.q.size || mdb.sim.length) { clearTimeout(mdb.t); mdb.t = setTimeout(mdbFlush, 20000); } }
}

// ----- what this CRATE sees -----
(function () {
  // the artist page's More Releases
  if (typeof aiMoreMerge === 'function') {
    const base = aiMoreMerge;
    aiMoreMerge = function (artist) {
      const list = base.apply(this, arguments);
      try { (list || []).forEach(w => mdbSee({ a: (w.r && w.r.artist) || artist, t: w.title, ty: w.type, y: w.year, g: w.genre, c: w.cover, lp: w.plays }, w.srcs && w.srcs[0] === 'MusicBrainz' ? 'mb' : w.srcs && w.srcs[0] === 'Discogs' ? 'dg' : 'lastfm')); } catch (e) { /* fine */ }
      return list;
    };
  }
  // release cards and search tracklists: Last.fm's album.getInfo
  if (typeof stlAlbum === 'function') {
    const base = stlAlbum;
    stlAlbum = async function (artist, title) {
      const a = await base.apply(this, arguments);
      try { if (a) { const tags = ((a.tags && a.tags.tag) ? (Array.isArray(a.tags.tag) ? a.tags.tag : [a.tags.tag]) : []).map(t => t.name).filter(n => n && !(typeof AI_NOT_GENRE !== 'undefined' && AI_NOT_GENRE.test(n))).slice(0, 3);
        mdbSee({ a: artist, t: title, g: tags.join(', '), c: Array.isArray(a.image) ? ((a.image.find(x => x.size === 'extralarge') || {})['#text'] || '') : '', li: Number(a.listeners) || 0, lp: Number(a.playcount) || 0, mb: a.mbid || '' }, 'card'); } } catch (e) { /* fine */ }
      return a;
    };
  }
  // online search results
  if (typeof srchPopSort === 'function') {
    const base = srchPopSort;
    srchPopSort = function () {
      const r = base.apply(this, arguments);
      try { ((typeof srch !== 'undefined' && srch.online) || []).forEach(o => mdbSee({ a: o.artist, t: o.title, ty: o.type, y: o.date, g: o.genre, l: o.label, c: o.cover, li: o.listeners || 0 }, 'search')); } catch (e) { /* fine */ }
      return r;
    };
  }
  // the RYM pages browsed with the add-on: their ratings
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const d = e.data; if (!d || d.source !== 'crate-addon' || d.type !== 'rym-ratings' || !Array.isArray(d.ratings)) return;
    d.ratings.slice(0, 3000).forEach(x => { if (x && x.ar && x.ti) mdbSee({ a: x.ar, t: x.ti, ty: x.ty, y: x.y, rr: Number(x.a) || 0, rv: Number(x.n) || 0 }, 'rym'); });
  });
})();

// ----- the daily Last.fm fill -----
const mdbSleep = (ms) => new Promise(r => setTimeout(r, ms));
async function mdbLf(params) { await mdbSleep(450); return srchLf(params); }          // (about two requests a second: well under Last.fm's limit)
async function mdbFillArtist(name) {
  let tags = []; try { const j = await mdbLf({ method: 'artist.gettoptags', artist: name, autocorrect: '1' }); tags = (((j.toptags || {}).tag) || []).map(t => t.name).filter(n => n && !(typeof AI_NOT_GENRE !== 'undefined' && AI_NOT_GENRE.test(n))).slice(0, 3); } catch (e) { /* none */ }
  try { const j = await mdbLf({ method: 'artist.gettopalbums', artist: name, autocorrect: '1', limit: '8' });
    (((j.topalbums || {}).album) || []).filter(x => x && x.name && x.name !== '(null)').forEach(x => mdbSee({ a: (x.artist && x.artist.name) || name, t: x.name, g: tags.join(', '), lp: Number(x.playcount) || 0, c: ((x.image || []).find(i => i.size === 'extralarge') || {})['#text'] || '', mb: x.mbid || '' }, 'lastfm')); } catch (e) { /* next */ }
}
async function mdbFill(opts) {
  opts = opts || {};
  if (mdb.filling || typeof srchLf !== 'function' || !srchLfKey()) return { ok: false, why: 'Last.fm isn’t connected (⚙ › Last.fm)' };
  if (!(await mdbCheckJoined())) return { ok: false, why: 'Join the master crate first' };
  mdb.filling = true; let n = 0;
  try {
    if (opts.tag) {          // "fill the thin genres": Last.fm's top releases for a genre
      for (let page = 1; page <= 2; page++) { const j = await mdbLf({ method: 'tag.gettopalbums', tag: opts.tag, limit: '50', page: String(page) });
        (((j.albums || {}).album) || []).forEach(x => { if (x && x.name && x.artist) { mdbSee({ a: x.artist.name, t: x.name, g: opts.tag, c: ((x.image || []).find(i => i.size === 'extralarge') || {})['#text'] || '', mb: x.mbid || '' }, 'lastfm'); n++; } }); }
    } else {
      const mine = (state.raw || []).filter(r => (Number(r.rating) || 0) >= 4).map(r => r.artist).filter((a, i, l) => a && l.indexOf(a) === i).slice(0, 40);
      const plan = await postUpdate({ action: 'masterMusicFillPlan', n: opts.n || 10, mine });
      const seeds = (plan && plan.artists) || [];
      for (const a of seeds) {
        if (opts.say) opts.say(`Filling from Last.fm: ${a} (${seeds.indexOf(a) + 1} of ${seeds.length})`);
        await mdbFillArtist(a); n++;
        try { const j = await mdbLf({ method: 'artist.getsimilar', artist: a, autocorrect: '1', limit: '8' });
          const sim = (((j.similarartists || {}).artist) || []).map(s => ({ a: s.name, m: Number(s.match) || 0 })).filter(s => s.a);
          mdbSimilar(a, sim);
          for (const s of sim.slice(0, 5)) { await mdbFillArtist(s.a); n++; }
        } catch (e) { /* next */ }
      }
    }
    try { localStorage.setItem(MDB_FILL_KEY, String(Date.now())); } catch (e) { /* fine */ }
    mdbFlush();
    return { ok: true, n };
  } finally { mdb.filling = false; }
}
(function () {          // once a day, a minute after CRATE opens, in the background
  setTimeout(() => { let last = 0; try { last = Number(localStorage.getItem(MDB_FILL_KEY) || 0); } catch (e) { /* fine */ }
    if (Date.now() - last > 20 * 3600e3 && !/[?&]crate-test\b/.test(location.search)) mdbFill().catch(() => { /* tomorrow */ }); }, 60000);
  window.addEventListener('pagehide', () => { if (mdb.q.size) mdbFlush(); });
})();

// ----- ⚙ › Music database… -----
const MDB_SRC_NAMES = { crates: 'Friends’ crates', lastfm: 'Last.fm', rym: 'RYM pages and charts', mb: 'MusicBrainz discographies', dg: 'Discogs', search: 'Searches', scrobbles: 'Scrobbles outside crates', card: 'Release cards' };
function mdbN(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n.toLocaleString(); }
function mdbOpen() {
  if (el.layoutMenu) el.layoutMenu.hidden = true;
  let ov = document.getElementById('mdbOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'mdbOverlay'; ov.className = 'pt-overlay mc-overlay'; document.body.appendChild(ov);
    ov.addEventListener('click', mdbClick);
    ov.addEventListener('keydown', (e) => { if (e.target.id === 'mdbQ' && e.key === 'Enter') { e.preventDefault(); mdbSearch(e.target.value); } });
    document.addEventListener('keydown', (e) => { const o = document.getElementById('mdbOverlay'); if (e.key === 'Escape' && o && !o.hidden) { e.stopImmediatePropagation(); o.hidden = true; } }, true);
  }
  ov.hidden = false; mdb.view = { st: null, res: null, say: 'Reading the music database…' }; mdbRender(); mdbLoad();
}
async function mdbLoad(fresh) {
  try {
    const r = await postUpdate({ action: 'masterMusicState', fresh: !!fresh });
    if (!r || r.music !== true) throw new Error(r && r.error ? r.error : 'Your backend doesn’t have the music database yet: paste the new Master.gs and deploy a new version.');
    if (r.joined === false) { mdbSetJoined(false); mdb.view = { joinFirst: true }; mdbRender(); return; }
    mdbSetJoined(true); mdb.view.st = r.status; mdb.view.say = ''; mdbRender();
  } catch (e) { mdb.view.say = ''; mdb.view.err = e.message; mdbRender(); }
}
async function mdbSearch(q) {
  q = String(q || '').trim(); if (q.length < 2) return;
  mdb.view.res = null; mdb.view.q = q; mdb.view.searching = true; mdbRender();
  try { const r = await postUpdate({ action: 'masterMusicSearch', q }); mdb.view.res = (r && r.results) || []; } catch (e) { mdb.view.res = []; }
  mdb.view.searching = false; mdbRender();
}
function mdbCoverage(st) {          // the genres your crate leans on, and how many releases the database holds in each
  const mine = {}; (state.raw || []).forEach(r => String(r.genre || '').split(/\s*,\s*/).filter(Boolean).slice(0, 2).forEach(g => { const k = g.toLowerCase(); mine[k] = (mine[k] || 0) + ((Number(r.rating) || 3) >= 4 ? 2 : 1); }));
  const db = (st && st.genres) || {}, top = Object.keys(mine).sort((a, b) => mine[b] - mine[a]).slice(0, 8);
  const max = Math.max(1, ...top.map(g => db[g] || 0));
  return top.map(g => ({ g, n: db[g] || 0, pct: Math.round((db[g] || 0) / max * 100) }));
}
function mdbRender() {
  const ov = document.getElementById('mdbOverlay'); if (!ov) return;
  const v = mdb.view || {}, st = v.st;
  const head = `<div class="pt-head"><div><div class="gs-lbl">Shared by you and your friends</div><div class="pt-title">The music database</div></div><label class="mdb-q">⌕ <input type="search" id="mdbQ" placeholder="${st ? 'Search ' + mdbN(st.releases) + ' releases' : 'Search'}" aria-label="Search the music database" value="${escapeHtml(v.q || '')}"></label><button type="button" class="mood-x" data-mdb="x" aria-label="Close">×</button></div>`;
  if (v.joinFirst) { ov.innerHTML = `<div class="pt-dialog mc-dialog">${head}<p class="gs-s">The music database is part of the master crate: join it first (⚙ › Master crate…), then it grows from your friends’ crates and what CRATE sees as you use it.</p><div class="mc-acts"><button type="button" class="gs-btn gs-pri" data-mdb="master">Open the master crate</button></div></div>`; return; }
  const src = st && st.sources ? Object.keys(st.sources).sort((a, b) => st.sources[b] - st.sources[a]) : [], smax = src.length ? Math.max(...src.map(k => st.sources[k])) : 1;
  const cov = mdbCoverage(st);
  const results = v.res ? `<div class="mc-card"><div class="gs-lbl">${v.res.length ? `Found ${v.res.length} for “${escapeHtml(v.q)}”` : `Nothing for “${escapeHtml(v.q)}” yet`}</div>${v.res.slice(0, 30).map(r => `<div class="mdb-r">${r.Cover ? `<img src="${escapeHtml(r.Cover)}" alt="" loading="lazy">` : '<span class="mcd-nocv mdb-cv"></span>'}<span><b>${escapeHtml(r.Title)}</b><em>${escapeHtml(r.Artist)}${r.Year ? ' · ' + escapeHtml(String(r.Year).slice(0, 4)) : ''}${r.Genre ? ' · ' + escapeHtml(r.Genre) : ''}</em></span><span class="mdb-tag">${Number(r.Crates) > 0 ? `${r.Crates} crate${r.Crates == 1 ? '' : 's'}` : r.Listeners ? mdbN(r.Listeners) + ' listeners' : r.RymRating ? 'RYM ' + Number(r.RymRating).toFixed(2) : Object.keys(r.Sources || {}).map(k => MDB_SRC_NAMES[k] || k)[0] || ''}</span></div>`).join('')}</div>` : v.searching ? '<p class="gs-s">Searching…</p>' : '';
  ov.innerHTML = `<div class="pt-dialog mc-dialog mdb-dialog" role="dialog" aria-modal="true" aria-label="The music database">${head}
    ${v.err ? `<p class="pim-err" role="alert">${escapeHtml(v.err)}</p>` : ''}${v.say ? `<p class="gs-s" role="status">${escapeHtml(v.say)}</p>` : ''}
    ${st ? `<div class="mdb-nums">${[[(Number(st.releases) || 0).toLocaleString(), 'releases'], [(Number(st.artists) || 0).toLocaleString(), 'artists'], [(Number(st.notInCrates) || 0).toLocaleString(), 'not in anyone’s crate', 'gold'], [(Number(st.withNumbers) || 0).toLocaleString(), 'with ratings or listeners'], [(Number(st.similar) || 0).toLocaleString(), 'artists with similar artists'], ['+' + (Number(st.added7) || 0).toLocaleString(), 'this week', 'teal']].map(([n, l, c]) => `<div><b${c ? ` class="mdb-${c}"` : ''}>${n}</b><span>${l}</span></div>`).join('')}</div>` : ''}
    ${results}
    ${st ? `<div class="mdb-grid">
      <div class="mc-card"><div class="gs-lbl">Where it came from</div>${src.map(k => `<div class="mdb-src"><span>${escapeHtml(MDB_SRC_NAMES[k] || k)}</span><span class="mdb-bar"><u style="width:${Math.max(2, st.sources[k] / smax * 100).toFixed(1)}%"></u></span><span class="gs-s">${mdbN(st.sources[k])}</span></div>`).join('') || '<p class="gs-s">Nothing yet.</p>'}
        <p class="gs-s mc-foot">It grows as you use CRATE (More Releases, release cards, searches, the RYM pages you browse), from your friends’ crates every night, and from a daily Last.fm fill${(() => { let t = 0; try { t = Number(localStorage.getItem(MDB_FILL_KEY) || 0); } catch (e) { /* fine */ } return t ? ` (this CRATE’s last: ${mcAgo(t)})` : ''; })()}.</p></div>
      <div class="mc-card"><div class="gs-lbl">Added lately</div>${(st.recent || []).slice(0, 9).map(r => `<div class="mdb-r">${r.c ? `<img src="${escapeHtml(r.c)}" alt="" loading="lazy">` : '<span class="mcd-nocv mdb-cv"></span>'}<span><b>${escapeHtml(r.t)}</b><em>${escapeHtml(r.a)}${r.y ? ' · ' + escapeHtml(r.y) : ''}</em></span><span class="mdb-tag">${escapeHtml(MDB_SRC_NAMES[r.src] || r.src || '')}</span></div>`).join('') || '<p class="gs-s">Nothing this week yet.</p>'}</div>
      <div class="mc-card"><div class="gs-lbl">How well it knows your taste</div>${cov.map(c => `<div class="mdb-src"><span>${escapeHtml(c.g.replace(/\b([a-z])/g, (m, x) => x.toUpperCase()))}</span><span class="mdb-bar"><u style="width:${Math.max(2, c.pct)}%"></u></span><span class="gs-s">${mdbN(c.n)}</span></div>`).join('')}
        <p class="gs-s">Releases it holds in each genre your crate leans on: the thin ones are where the radio will have least to pick from.</p>
        <div class="mc-acts"><button type="button" class="gs-btn" data-mdb="thin"${mdb.filling ? ' disabled' : ''}>Fill the thin genres now</button><button type="button" class="gs-btn" data-mdb="fill"${mdb.filling ? ' disabled' : ''}>Fill from Last.fm now</button><button type="button" class="gs-btn" data-mdb="refresh">Merge what’s waiting</button></div></div>
    </div>` : ''}</div>`;
}
async function mdbClick(e) {
  const ov = document.getElementById('mdbOverlay'); if (e.target === ov || e.target.closest('[data-mdb="x"]')) { ov.hidden = true; return; }
  const b = e.target.closest('[data-mdb]'); if (!b || b.disabled) return; const k = b.dataset.mdb;
  const say = (t) => { mdb.view.say = t; mdbRender(); };
  if (k === 'master') { ov.hidden = true; if (typeof mcOpen === 'function') mcOpen(); }
  else if (k === 'refresh') { say('Merging what’s waiting…'); await mdbFlush(); mdbLoad(true); }
  else if (k === 'fill') { say('Filling from Last.fm…'); const r = await mdbFill({ n: 6, say }); say(r.ok ? `Filled from ${r.n} artists: it shows here once merged (“Merge what’s waiting”).` : r.why); }
  else if (k === 'thin') {
    const cov = mdbCoverage(mdb.view.st).sort((a, b) => a.n - b.n).slice(0, 3); let n = 0;
    for (const c of cov) { say(`Filling “${c.g}” from Last.fm…`); const r = await mdbFill({ tag: c.g }); if (!r.ok) { say(r.why); return; } n += r.n; }
    say(`Added up to ${n} releases in ${cov.map(c => c.g).join(', ')}. Press “Merge what’s waiting” to see them counted.`);
  }
}
(function () {
  const after = document.getElementById('menuMasterCrate') || document.getElementById('menuGalaxy'); if (!after) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'menuMusicDb'; b.textContent = 'Music database…'; b.title = 'The shared catalog CRATE Radio will pick from';
  b.addEventListener('click', mdbOpen); after.insertAdjacentElement('afterend', b);
  // remember whether you've joined, from the master crate's own answers
  if (typeof mcCall === 'function') { const base = mcCall; mcCall = async function (action) { const r = await base.apply(this, arguments); try { if (r && action === 'masterState') mdbSetJoined(!!r.joined); if (r && action === 'masterShare' && r.share) mdbSetJoined(!!r.share.joined); } catch (e) { /* fine */ } return r; }; }
})();
