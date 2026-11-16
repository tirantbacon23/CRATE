/* CRATE · RYM add-on — content-tips.js, run as each RateYourMusic page starts loading (before the page's own scripts).
   RYM writes a rating's exact figures in the element's title ("4.56 from 4,733 ratings") and shows the rounded ones on screen ("4.6 | 5k").
   When the page has loaded, its tooltip plugin (tipTip: $(".has_tip").tipTip()) takes those titles and REMOVES them from the page,
   keeping them inside its own script, so by the time the add-on reads the page they are gone. This copies each such title onto its element
   as data-crate-tip first; the readers (CrateRym.exactIn) find it there. Nothing on the page is changed except that one added attribute. */
(function () {
  'use strict';
  if (window.__crateTipsLoaded) return;
  window.__crateTipsLoaded = true;
  const RATINGS = /\bfrom\s+\d[\d.,   ]*\s+ratings?\b/i;
  const keep = (el, text) => { if (el && el.nodeType === 1 && text && text.length < 300 && RATINGS.test(text) && !el.hasAttribute('data-crate-tip')) el.setAttribute('data-crate-tip', text); };
  const scan = (root) => { if (!root || root.nodeType !== 1) return; keep(root, root.getAttribute('title')); root.querySelectorAll('[title]').forEach(e => keep(e, e.getAttribute('title'))); };
  // As the page is parsed: every element added with a title; and if a title is removed before that was seen, its old value.
  const mo = new MutationObserver((recs) => {
    recs.forEach(r => {
      if (r.type === 'childList') r.addedNodes.forEach(scan);
      else if (r.type === 'attributes' && r.attributeName === 'title') keep(r.target, r.target.getAttribute('title') || r.oldValue);
    });
  });
  mo.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'], attributeOldValue: true });
  scan(document.documentElement);
  // Watching the whole page costs a little while it changes; once it has settled, stop.
  window.addEventListener('load', () => setTimeout(() => mo.disconnect(), 15000), { once: true });
})();
