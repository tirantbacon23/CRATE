// (1.135.166) The master crate, step 2: in a release's deck, and when adding one.
//  - The deck: a FRIENDS ★ chip beside the RYM rating, and "In the master crate" above the songs: how many crates have it, the friends'
//    average (without you) and how yours compares, plays across crates and its place this month, who has it (named where they share
//    their ratings with you), and what crates with it also love. Only once you've joined.
//  - Add a release: with "Use it when adding" on, a release your friends have is filled from their crates (genres, descriptors, label,
//    date, cover, RYM link and rating, its songs with their links), only where the form is still empty, with a note saying so.
const mcd = { mem: new Map(), off: 0 };
async function mcdGet(artist, title) {
  if (!artist || !title || Date.now() < mcd.off) return null;
  const k = (artist + '|' + title).toLowerCase(), hit = mcd.mem.get(k);
  if (hit && Date.now() - hit.t < 10 * 60e3) return hit.v;
  let r = null;
  try { r = await postUpdate({ action: 'masterRelease', artist, title }); } catch (e) { return null; }
  if (!r || r.master !== true) { mcd.off = Date.now() + 30 * 60e3; return null; }          // (no master crate on this backend: not asked again for a while)
  if (r.joined === false) { mcd.off = Date.now() + 5 * 60e3; return null; }
  mcd.mem.set(k, { t: Date.now(), v: r }); return r;
}
const mcdStars = (v) => v ? Number(v).toFixed(1).replace(/\.0$/, '') : '–';
function mcdStripHtml(item, r) {
  const R = r.release, o = R.others || {}, people = r.people || [], mine = Number(item.rating) || 0;
  const diff = mine && o.n ? mine - o.avg : null, total = R.totalCrates || 0;
  const k = (v, l, cls) => `<div class="mcd-k"><b${cls ? ` class="${cls}"` : ''}>${v}</b><span>${l}</span></div>`;
  const named = people.filter(p => !p.me && !p.anon), anon = people.filter(p => p.anon).length;
  const who = named.map(p => `<div class="mcd-who"><span class="mc-dot"></span><span class="mcd-wn">${escapeHtml(p.name || 'A friend')}</span><span class="mcd-wr">${p.r ? '★ ' + mcdStars(p.r) : '<span class="gs-s">not rated</span>'}</span><span class="gs-s">${p.p ? Number(p.p).toLocaleString() + ' plays' : ''}</span></div>`).join('')
    + (anon ? `<div class="mcd-who"><span class="mc-dot anon"></span><span class="gs-s mcd-anon">${anon} more friend${anon === 1 ? ' who doesn’t' : 's who don’t'} share their ratings with you</span></div>` : '');
  const also = (R.also || []).map(a => { const ours = (state.raw || []).find(x => typeof dupKey === 'function' && dupKey(x.artist, x.title) === dupKey(a.artist, a.title));
    return `<button type="button" class="pt-mini" ${ours ? `data-mcd-open="${escapeHtml(String(ours.row))}"` : `data-mcd-find="${escapeHtml(a.artist + ' ' + a.title)}"`} title="${escapeHtml(a.title)} · ${escapeHtml(a.artist)}${ours ? ' (in your crate)' : ' (not in your crate: find it)'}">${(ours && typeof gxCover === 'function') || a.cover ? `<img src="${escapeHtml(ours && typeof gxCover === 'function' ? gxCover(ours) : a.cover)}" alt="" loading="lazy">` : '<span class="mcd-nocv"></span>'}<b>${escapeHtml(a.title)}</b><em class="mcd-ae">${a.n} of them${a.avg ? ' · ★ ' + mcdStars(a.avg) : ''}${ours ? ' · yours' : ''}</em></button>`; }).join('');
  return `<div class="pt-strip-h"><span class="gs-lbl mcd-lbl">In the master crate</span><span class="gs-s">${R.crates} of ${total || R.crates} crate${(total || R.crates) === 1 ? '' : 's'} ${R.crates === 1 ? 'has' : 'have'} it</span><span class="gs-fill"></span><button type="button" class="gs-btn" data-mcd-settings>Master crate…</button></div>
    <div class="mcd-nums">${k(o.n ? mcdStars(o.avg) : '–', o.n ? `friends’ average, ${o.n} rating${o.n === 1 ? '' : 's'}` : 'no friend has rated it', 'mcd-teal')}${k(Number(R.plays || 0).toLocaleString(), 'plays across crates')}${k(R.rank30 ? '#' + R.rank30 : '–', R.rank30 ? 'most played this month' : 'not played this month')}${k(diff == null ? '–' : (diff > 0 ? '+' : '') + diff.toFixed(1), diff == null ? 'you vs them: rate it to see' : diff > 0 ? 'you rate it above them' : diff < 0 ? 'you rate it below them' : 'you agree')}${k(R.date ? String(R.date).slice(0, 4) : '–', 'released')}</div>
    <div class="mcd-cols"><div><div class="gs-lbl">Who has it</div>${who || '<p class="gs-s">Only you, so far.</p>'}</div>${also ? `<div><div class="gs-lbl">Crates with this also love</div><div class="pt-minis">${also}</div></div>` : ''}</div>`;
}
async function mcdPaint(item) {
  const old = document.getElementById('mcdStrip'), chip = document.getElementById('mcdChip');
  if (!item) return;
  const r = await mcdGet(item.artist, item.title);
  if (typeof activeItem !== 'undefined' && activeItem !== item) return;          // (moved on to another release meanwhile)
  if (!r || !r.found || !r.release || !r.release.crates) { if (old) old.remove(); if (chip) chip.remove(); return; }
  const R = r.release, o = R.others || {};
  // the chip, beside the RYM rating
  const rate = document.querySelector('#deckOverlay .deck-rating-row');
  if (rate) { let c = document.getElementById('mcdChip'); if (!c) { c = document.createElement('span'); c.id = 'mcdChip'; c.className = 'mcd-chip'; rate.appendChild(c); }
    c.textContent = o.n ? `FRIENDS ★ ${mcdStars(o.avg)}` : `${o.crates} FRIEND${o.crates === 1 ? '' : 'S'} HAVE IT`; c.title = o.n ? `Your friends’ average on CRATE: ${mcdStars(o.avg)} from ${o.n} rating${o.n === 1 ? '' : 's'}` : 'In friends’ crates, unrated'; c.hidden = !o.crates; }
  // the strip, above the songs
  const tl = document.getElementById('deckTracklist'); if (!tl) return;
  let s = old;
  if (!s) {
    s = document.createElement('div'); s.id = 'mcdStrip'; s.className = 'pt-strip mcd-strip deck-section'; s.dataset.deckTab = 'songs';
    const sec = tl.closest('.deck-section') || tl; sec.parentNode.insertBefore(s, sec);
    s.addEventListener('click', (e) => {
      const o2 = e.target.closest('[data-mcd-open]'); if (o2) { const x = state.raw.find(r2 => String(r2.row) === o2.dataset.mcdOpen); if (x) openDeck(x); return; }
      const f = e.target.closest('[data-mcd-find]'); if (f) { if (typeof openAddModalSearch === 'function') openAddModalSearch(f.dataset.mcdFind); return; }
      if (e.target.closest('[data-mcd-settings]') && typeof mcOpen === 'function') mcOpen();
    });
  }
  s.innerHTML = mcdStripHtml(item, r);
}
(function () {
  const base = openDeck;
  openDeck = function (item) { const out = base.apply(this, arguments); const s = document.getElementById('mcdStrip'), c = document.getElementById('mcdChip'); if (s) s.remove(); if (c) c.remove(); mcdPaint(item).catch(() => { /* the deck works without it */ }); return out; };
})();

// ----- Add a release, filled from the master crate -----
let mcdAddSeq = 0;
async function mcdFillAdd(prefill) {
  const my = ++mcdAddSeq, artist = (prefill && prefill.artist) || el.addArtist.value, title = (prefill && prefill.title) || el.addTitle.value;
  const ban = document.getElementById('mcdAddBanner'); if (ban) ban.remove();
  if (!artist || !title) return;
  const r = await mcdGet(artist, title);
  if (my !== mcdAddSeq || el.addForm.hidden || el.addArtist.value !== artist || el.addTitle.value !== title) return;          // (another release meanwhile)
  if (!r || !r.found || !r.release || r.fill === false) return;
  const R = r.release, got = [], mark = (inp) => { if (inp) { inp.classList.add('mcd-filled'); inp.addEventListener('input', () => inp.classList.remove('mcd-filled'), { once: true }); } };
  const fill = (inp, v, label) => { if (!inp || !v || String(inp.value || '').trim()) return; inp.value = v; mark(inp); got.push(label); };
  fill(el.addGenre, R.genre, 'genre'); fill(el.addGenre2, R.genre2, 'secondary genre'); fill(el.addLabel, R.label, 'label'); fill(el.addRymLink, R.rymLink, 'RYM link'); fill(el.addCover, R.cover, 'cover');
  fill(document.getElementById('addRymDescriptors'), R.descriptors, 'descriptors');
  const rr = typeof rymEl === 'function' ? rymEl('addRymRating') : null; if (rr && !rr.value && R.rymRating) { rr.value = R.rymRating; mark(rr); const rv = rymEl('addRymVotes'); if (rv && R.rymVotes) rv.value = R.rymVotes; got.push('RYM rating'); }
  if (R.date && typeof setReleaseDateFields === 'function') { const y = el.addReleaseYear; if (!y || !String(y.value || '').trim()) { setReleaseDateFields('add', String(R.date)); got.push('date'); } }
  const tr = R.tracks || [], hasRows = el.addTracksRows && el.addTracksRows.querySelector('input') && [...el.addTracksRows.querySelectorAll('input')].some(i => i.value.trim());
  if (tr.length && !hasRows && typeof renderTracklistBuilderRows === 'function') {
    renderTracklistBuilderRows(el.addTracksRows, tr.map((t, i) => ({ trackNumber: t.n || i + 1, title: t.title, youtubeLink: t.yt || '', spotifyLink: t.sp || '', durationMs: t.ms || 0 })));
    const links = tr.filter(t => t.sp || t.yt).length; got.push(`${tr.length} songs${links ? ` (${links} with links)` : ''}`);
  }
  if (!got.length) return;
  const b = document.createElement('div'); b.id = 'mcdAddBanner'; b.className = 'mcd-add-banner'; b.setAttribute('role', 'status');
  const n = (R.others && R.others.crates) || R.crates || 0;
  b.innerHTML = `${R.cover ? `<img src="${escapeHtml(R.cover)}" alt="">` : ''}<div><b>Filled from the master crate</b><span class="gs-s">${n} friend${n === 1 ? ' has' : 's have'} ${escapeHtml(R.title)}: ${escapeHtml(got.join(', '))} came from their crates, so nothing needs looking up. Edited fields lose their green mark; what’s filled is yours to change.</span></div>`;
  el.addForm.insertBefore(b, el.addForm.firstChild);
}
(function () {
  if (typeof showAddForm !== 'function') return;
  const base = showAddForm;
  showAddForm = function (prefill) { const out = base.apply(this, arguments); mcdFillAdd(prefill).catch(() => { /* filled as before */ }); return out; };
})();
