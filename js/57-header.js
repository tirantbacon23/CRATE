// CRATE — the one-row header on desktop (1.131.0): CRATE, ← →, the tabs, then the search and buttons, in one row lined up with the panels.
// One part of the page's script, split by feature (see 01-core.js).
//
// LINED UP: CRATE (and "a listening log") take the width of the left side (the far-left strip and the browser column), so ← → end
// where they end and the tabs start right above the music. As the columns are dragged wider or narrower, shown or hidden, the header
// follows. With no left column showing (or on a phone, which keeps its own header), CRATE just takes the room it needs.
// On a narrower window CRATE's side gives way before the buttons are pushed off, and "a listening log" goes first.

function hdrAlign() {
  const top = document.querySelector('.topbar'), brand = top && top.querySelector('.brand'), hist = document.querySelector('.tab-bar-history');
  if (!top || !brand) return;
  if (window.matchMedia('(max-width: 900px)').matches) { top.style.removeProperty('--hdr-brand-w'); top.classList.remove('hdr-aligned'); return; }
  const vis = (e) => e && e.offsetParent !== null && e.getBoundingClientRect().width > 0;
  const lp = document.getElementById('leftPanel'), ln = document.getElementById('leftNavPanel');
  const edge = vis(lp) ? lp : (vis(ln) ? ln : null);
  if (!edge) { top.style.removeProperty('--hdr-brand-w'); top.classList.remove('hdr-aligned'); return; }
  // the first tab's name starts where the music column's own heading does (its 20px inset, less the tab's 14px)
  const main = ['mainPanel', 'artistInfoWrap', 'genreInfoWrap', 'friendInfoWrap', 'likedWrap'].map(id => document.getElementById(id)).find(vis);
  const at = main && main.getBoundingClientRect().left > edge.getBoundingClientRect().left ? main.getBoundingClientRect().left + 6 : edge.getBoundingClientRect().right;
  const nav = document.querySelector('.topbar .tab-bar .nav-tabs');            // (what sits between CRATE's side and the first tab: ← → and their gaps)
  const bar = document.getElementById('tabBar'), sl = bar ? bar.scrollLeft : 0;          // (1.135.25) where the first tab would be unscrolled
  const between = nav ? nav.getBoundingClientRect().left + sl - brand.getBoundingClientRect().right : (hist ? hist.offsetWidth : 0);
  const w = Math.round(at - top.getBoundingClientRect().left - between);
  if (w < 120) { top.style.removeProperty('--hdr-brand-w'); top.classList.remove('hdr-aligned'); return; }
  // (1.135.25) More tabs than fit beside a widened CRATE: no lining up, so the tabs get that room (and scroll for the rest)
  const ctl = document.getElementById('topbarControls'), room = top.getBoundingClientRect().width - w - (ctl ? ctl.offsetWidth : 0) - 24;
  if (bar && bar.scrollWidth > room) { top.style.removeProperty('--hdr-brand-w'); top.classList.remove('hdr-aligned'); top.classList.toggle('hdr-narrow', brand.getBoundingClientRect().width < 230); return; }
  top.style.setProperty('--hdr-brand-w', w + 'px'); top.classList.add('hdr-aligned');
  top.classList.remove('hdr-narrow'); top.classList.toggle('hdr-narrow', brand.getBoundingClientRect().width < 230);          // (as laid out: it may have given way)
}
// A player docked at the top: how tall it really is, so the page (header first) starts right under it.
function hdrPlayerTop() {
  const mp = document.getElementById('miniPlayer'), b = document.body;
  if (mp && b.classList.contains('mp-docked-top') && !mp.hidden) { const h = Math.ceil(mp.getBoundingClientRect().bottom); if (h > 0) b.style.setProperty('--mp-top-h', h + 'px'); }
  else b.style.removeProperty('--mp-top-h');
}
function initHeader() {
  let t = 0; const later = () => { cancelAnimationFrame(t); t = requestAnimationFrame(() => { hdrPlayerTop(); hdrAlign(); }); };
  window.addEventListener('resize', later);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(later);
    ['leftPanel', 'leftNavPanel', 'panels'].forEach(id => { const e = document.getElementById(id); if (e) ro.observe(e); });
    const h = document.querySelector('.tab-bar-history'); if (h) ro.observe(h);
    const mp = document.getElementById('miniPlayer'); if (mp) ro.observe(mp);
  }
  new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['class'] });          // (docked at the top, or not)
  setTimeout(later, 0); setTimeout(later, 1500);
}
initHeader();

// (1.135.25) The tab bar scrolls sideways when its tabs don't fit: a mouse wheel scrolls it too, and the tab you're on is brought into view.
(function tabBarScroll() {
  const bar = document.getElementById('tabBar'); if (!bar) return;
  bar.addEventListener('wheel', (e) => { if (bar.scrollWidth <= bar.clientWidth + 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; bar.scrollLeft += e.deltaY; e.preventDefault(); }, { passive: false });
  const show = () => { const a = bar.querySelector('.nav-tab.active'); if (!a || bar.scrollWidth <= bar.clientWidth + 1) return; const br = bar.getBoundingClientRect(), r = a.getBoundingClientRect(); if (r.left < br.left) bar.scrollLeft -= br.left - r.left + 24; else if (r.right > br.right) bar.scrollLeft += r.right - br.right + 24; };
  new MutationObserver(() => requestAnimationFrame(show)).observe(bar, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => requestAnimationFrame(show)).observe(bar);          // (the bar narrows as tabs open: bring the tab in once it has)
})();
