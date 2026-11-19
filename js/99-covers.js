// (1.135.187) Covers for releases that came without one (from a friend's crate with no cover saved, or the music database): looked up on
// Last.fm, a few at a time, kept in this browser, and given to the music database so everyone gets them. Used by Discover, the radio
// (its window, and the songs it queues, which showed initials in Up next), and the release card. A cover link that doesn't load is looked
// up the same way.
const CV_KEY = 'crate_cv_cache_v1';
const cv = { mem: null, q: [], want: new Set(), busy: 0, items: {} };
const cvK = (a, t) => (typeof rKey === 'function' ? rKey(a, t) : (String(a) + '|' + String(t)).toLowerCase());
function cvAll() { if (!cv.mem) { try { cv.mem = JSON.parse(localStorage.getItem(CV_KEY) || '{}') || {}; } catch (e) { cv.mem = {}; } } return cv.mem; }
function cvSave() { try { const o = cvAll(), ks = Object.keys(o); if (ks.length > 3000) ks.slice(0, ks.length - 2500).forEach(k => delete o[k]); localStorage.setItem(CV_KEY, JSON.stringify(o)); } catch (e) { /* this visit */ } }
function cvGet(a, t) { const v = cvAll()[cvK(a, t)]; return v && v !== '-' ? v : ''; }
// a cover's markup: the image, or a placeholder that fills itself in when the cover is found
function cvHtml(a, t, src, cls) {
  const k = cvK(a, t), url = src || cvGet(a, t);
  if (url) return `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy" data-cvk="${escapeHtml(k)}" data-cva="${escapeHtml(a)}" data-cvt="${escapeHtml(t)}" onerror="cvBroken(this)">`;
  cvWant(a, t); return `<span class="${cls} rd-nocv" data-cvk="${escapeHtml(k)}"></span>`;
}
function cvBroken(img) { const a = img.dataset.cva, t = img.dataset.cvt, k = img.dataset.cvk; const o = cvAll(); if (o[k] === img.getAttribute('src')) { delete o[k]; } const s = document.createElement('span'); s.className = img.className + ' rd-nocv'; s.dataset.cvk = k; img.replaceWith(s); if (a && t) cvWant(a, t, true); }
function cvWant(a, t, force, item) {
  const k = cvK(a, t); if (item && !(cv.items[k] || []).includes(item)) (cv.items[k] = cv.items[k] || []).push(item);
  const have = cvGet(a, t); if (have && item) { cvPut({ a, t, k }, have); return; }          // (1.135.194: cvPut now only redraws what changed)
  if (!a || !t || cv.want.has(k) || (!force && cvAll()[k] === '-')) return; cv.want.add(k); if (item) cv.q.push({ a, t, k }); else cv.q.unshift({ a, t, k }); cvRun();          // (a cover on screen in Discover or the radio goes first)
}
async function cvRun() {
  while (cv.busy < 2 && cv.q.length) {
    const j = cv.q.shift(); cv.busy++;
    (async () => {
      let url = '';
      try { if (typeof stlAlbum === 'function') { const al = await stlAlbum(j.a, j.t); const im = al && Array.isArray(al.image) ? (al.image.find(x => x.size === 'extralarge') || al.image.slice(-1)[0] || {})['#text'] : ''; if (im && !/2a96cbd8b46e442fc41c2b86b821562f/.test(im)) url = im; } } catch (e) { /* none */ }
      cvAll()[j.k] = url || '-'; cvSave();
      if (url) cvPut(j, url);
    })().finally(() => { cv.busy--; cvRun(); });
  }
}
// Up next drawn again only for a cover of something in it, and at most once a second however many arrive
function cvQueueSoon() { if (cv.qT) return; cv.qT = setTimeout(() => { cv.qT = 0; if (typeof renderCrateQueuePanel === 'function') renderCrateQueuePanel(); }, 1000); }
function cvPut(j, url) {
  document.querySelectorAll(`[data-cvk="${CSS.escape(j.k)}"].rd-nocv`).forEach(s => { const img = document.createElement('img'); img.className = s.className.replace(/\s*rd-nocv\b/, ''); img.src = url; img.alt = ''; img.dataset.cvk = j.k; img.dataset.cva = j.a; img.dataset.cvt = j.t; img.setAttribute('onerror', 'cvBroken(this)'); s.replaceWith(img); });
  try { if (typeof radio !== 'undefined') { (radio.pool || []).concat(radio.disc || []).forEach(x => { if (x && cvK(x.a, x.t) === j.k && !x.c) x.c = url; }); } } catch (e) { /* fine */ }
  try { let q = false; (crateQueueList || []).forEach(e => { if (e && e.item && e.item.radio && e.item.cover !== url && cvK(e.item.artist, e.item.title) === j.k) { e.item.cover = url; q = true; } }); if (q) cvQueueSoon(); } catch (e) { /* fine */ }
  try { if (!cv.told) cv.told = new Set(); if (!cv.told.has(j.k) && typeof mdbSee === 'function') { cv.told.add(j.k); mdbSee({ a: j.a, t: j.t, c: url }, 'card'); } } catch (e) { /* fine */ }
  // releases that fell back to an initials tile (the grid, Up next, the deck): the cover goes in their place
  // (1.135.194) only when the cover is new to it: setting it each time (and drawing Up next again, which asked again) went round in a loop,
  // and the covers twitched and the lists jumped
  try { let changed = false; (cv.items[j.k] || []).forEach(it => { const key = artKey(it); if ((state.artCache[key] || {}).art === url) return; state.artCache[key] = { art: url, collectionId: null }; changed = true; if (typeof applyCachedArtFor === 'function') applyCachedArtFor(key); }); delete cv.items[j.k]; if (changed && (crateQueueList || []).some(e => e && e.item && cvK(e.item.artist, e.item.title) === j.k)) cvQueueSoon(); } catch (e) { /* fine */ }
}
// Discover, the radio window and the release card draw their covers through here
(function () {
  if (typeof dvCover === 'function') dvCover = function (x, cls) { return cvHtml(x.a, x.t, x.c, cls); };
  if (typeof rCoverHtml === 'function') rCoverHtml = function (item, cls) { return item ? cvHtml(item.artist, item.title, item.cover, cls) : `<span class="${cls} rd-nocv"></span>`; };
  // a release whose cover couldn't be found anywhere drew its initials: Last.fm is asked too
  if (typeof placeholderArt === 'function') { const base = placeholderArt; placeholderArt = function (item) { try { if (item && item.artist && item.title) { const have = cvGet(item.artist, item.title); if (have) return have; cvWant(item.artist, item.title, false, item); } } catch (e) { /* initials */ } return base.apply(this, arguments); }; }
  if (typeof rItem === 'function') { const base = rItem; rItem = function (x) { const it = base.apply(this, arguments); if (!it.cover) { it.cover = cvGet(x.a, x.t); if (!it.cover) cvWant(x.a, x.t); } return it; }; }
})();
