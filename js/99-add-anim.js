// (1.135.208) Adding a release, seen: when Add to crate is pressed and the add goes through, its cover lifts off the summary and arcs
// into your crate (the release's own card when it is on screen, else the "All Releases" count), the count pulses, and when its card
// appears in the grid it lands with a gold ring and a NEW tag for a few seconds. Nothing moves with "reduce motion" set: the card
// is only marked.
const aan = { pend: null, arrive: [] };
const aanCalm = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const aanKey = (a, t) => String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, '') + '|' + String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function aanFrom() {          // where the cover is now: the quick summary's cover, else the form's, else the window's middle
  const cands = ['#qaCard .qa-cv', '#addCoverPreview img', '#addOverlay .add-cover-preview img', '#addOverlay .add-modal'];
  for (const s of cands) { const n = document.querySelector(s); if (n && n.offsetWidth) { const r = n.getBoundingClientRect(); if (r.width > 0) return s.endsWith('.add-modal') ? { left: r.left + r.width / 2 - 60, top: r.top + r.height / 2 - 60, width: 120, height: 120 } : r; } }
  return { left: innerWidth / 2 - 60, top: innerHeight / 2 - 60, width: 120, height: 120 };
}
function aanEls(k) { const it = (state.raw || []).find(r => aanKey(r.artist, r.title) === k); if (!it) return []; const r = CSS.escape(String(it.row)); return [...document.querySelectorAll(`[data-album-row="${r}"], [data-aan-left="${r}"]`)]; }          // its grid card, its row in the left list
function aanTarget(k) {
  const els = aanEls(k), seen = (n) => { const r = n.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < innerHeight; };
  const card = els.find(n => n.classList.contains('card') && seen(n)) || els.find(seen);          // its card in the grid, else its row in the list
  if (card) { const art = card.querySelector('.left-thumb, img, .card-art, .art'), ar = art && art.getBoundingClientRect(); return { r: ar && ar.width ? ar : card.getBoundingClientRect(), card }; }          // (onto its cover)
  const cnt = document.querySelector('.left-row-all .left-row-count') || document.getElementById('catStats');
  if (cnt && cnt.offsetWidth) return { r: cnt.getBoundingClientRect(), count: cnt };
  return { r: { left: 40, top: innerHeight - 40, width: 24, height: 24 } };
}
function aanFly(p) {
  if (aanCalm()) return;
  const from = p.rect, tg = aanTarget(p.k), to = tg.r;
  const ghost = document.createElement('div'); ghost.className = 'aan-ghost'; ghost.setAttribute('aria-hidden', 'true');
  ghost.innerHTML = p.cover ? `<img src="${escapeHtml(p.cover)}" alt="" referrerpolicy="no-referrer">` : `<span>${escapeHtml(String(p.title || '?').slice(0, 2).toUpperCase())}</span>`;
  Object.assign(ghost.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
  document.body.appendChild(ghost);
  const fx = from.left + from.width / 2, fy = from.top + from.height / 2, tx = to.left + to.width / 2, ty = to.top + to.height / 2;
  const dx = tx - fx, dy = ty - fy, lift = Math.min(160, 60 + Math.abs(dx) * 0.15), endS = tg.card ? Math.max(0.12, Math.min(to.width, to.height) / from.width) : 0.18;
  const anim = ghost.animate([
    { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
    { transform: `translate(0,-14px) scale(1.08) rotate(-3deg)`, opacity: 1, offset: 0.14 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(1 + endS) / 2}) rotate(4deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(${endS}) rotate(0deg)`, opacity: tg.card ? 0.9 : 0.15, offset: 1 }
  ], { duration: 900, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
  // a short trail of sparks behind it
  for (let i = 0; i < 6; i++) setTimeout(() => {
    const s = document.createElement('i'); s.className = 'aan-spark'; s.setAttribute('aria-hidden', 'true');
    const g = ghost.getBoundingClientRect(); Object.assign(s.style, { left: (g.left + g.width / 2) + 'px', top: (g.top + g.height / 2) + 'px' }); document.body.appendChild(s);
    s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9 }, { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 40}px), calc(-50% + ${10 + Math.random() * 30}px)) scale(0.2)`, opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => s.remove();
  }, 120 + i * 90);
  anim.onfinish = () => {
    ghost.remove();
    aanEls(p.k).forEach(aanLand); if (!tg.card && tg.count) aanBump(tg.count);
  };
}
function aanBump(n) {
  n.classList.remove('aan-bump'); void n.offsetWidth; n.classList.add('aan-bump');
  setTimeout(() => n.classList.remove('aan-bump'), 900);
}
function aanLand(card) {
  if (!card || card.classList.contains('aan-new') || card.dataset.aanSeen) return; card.dataset.aanSeen = '1';
  card.classList.add('aan-new'); if (!aanCalm()) card.classList.add('aan-pop');
  let tag = card.querySelector('.aan-tag'); if (!tag) { tag = document.createElement('span'); tag.className = 'aan-tag'; tag.textContent = 'NEW'; card.appendChild(tag); }
  setTimeout(() => card.classList.remove('aan-pop'), 900);
  setTimeout(() => { card.classList.remove('aan-new'); const t = card.querySelector('.aan-tag'); if (t) t.remove(); }, 6000);
}
// the new card, once the grid shows it (the catalogue is read again a moment after the add): marked when it appears
function aanWatch() {
  if (!aan.arrive.length) return;
  aan.arrive = aan.arrive.filter(a => Date.now() - a.at < 30000);
  aan.arrive.forEach(a => { if (!a.flown) return; aanEls(a.k).forEach(n => { if (!n.dataset.aanSeen) aanLand(n); }); });          // (a card drawn again, or scrolled to, is marked too)
}
(function () {
  if (typeof saveNewAlbum !== 'function') return;
  const base = saveNewAlbum;
  saveNewAlbum = async function () {
    const artist = (el.addArtist && el.addArtist.value || '').trim(), title = (el.addTitle && el.addTitle.value || '').trim();
    const cover = (document.getElementById('addCover') || {}).value || '';
    aan.pend = artist && title ? { k: aanKey(artist, title), artist, title, cover: String(cover).trim(), rect: aanFrom(), at: Date.now() } : null;
    try { return await base.apply(this, arguments); } finally { aan.pend = null; }
  };
  // the add went through when the window closes during the save: that is when it flies
  if (typeof closeAddModal === 'function') {
    const baseClose = closeAddModal;
    closeAddModal = function () {
      const p = aan.pend; const r = baseClose.apply(this, arguments);
      if (p && Date.now() - p.at < 60000) { aan.pend = null; const a = { k: p.k, at: Date.now() }; aan.arrive.push(a); requestAnimationFrame(() => { aanFly(p); setTimeout(() => { a.flown = true; aanWatch(); }, aanCalm() ? 0 : 900); }); }
      return r;
    };
  }
  // the left list's release rows say which release they are (to light the new one up there too)
  if (typeof buildLeftRow === 'function') { const bl = buildLeftRow; buildLeftRow = function (entry, mode) { const row = bl.apply(this, arguments); try { if (mode === 'album' && entry && entry.item && row) row.dataset.aanLeft = String(entry.item.row); } catch (e) { /* fine */ } return row; }; }
  new MutationObserver(() => { if (aan.arrive.length) { clearTimeout(aan.t); aan.t = setTimeout(aanWatch, 120); } }).observe(document.body, { childList: true, subtree: true });
})();
