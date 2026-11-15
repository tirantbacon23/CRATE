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
  const between = nav ? nav.getBoundingClientRect().left - brand.getBoundingClientRect().right : (hist ? hist.offsetWidth : 0);
  const w = Math.round(at - top.getBoundingClientRect().left - between);
  if (w < 120) { top.style.removeProperty('--hdr-brand-w'); top.classList.remove('hdr-aligned'); return; }
  top.style.setProperty('--hdr-brand-w', w + 'px'); top.classList.add('hdr-aligned');
  top.classList.remove('hdr-narrow'); top.classList.toggle('hdr-narrow', brand.getBoundingClientRect().width < 230);          // (as laid out: it may have given way)
}
function initHeader() {
  let t = 0; const later = () => { cancelAnimationFrame(t); t = requestAnimationFrame(hdrAlign); };
  window.addEventListener('resize', later);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(later);
    ['leftPanel', 'leftNavPanel', 'panels'].forEach(id => { const e = document.getElementById(id); if (e) ro.observe(e); });
    const h = document.querySelector('.tab-bar-history'); if (h) ro.observe(h);
  }
  setTimeout(hdrAlign, 0); setTimeout(hdrAlign, 1500);
}
initHeader();
