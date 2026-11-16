/* CRATE · RYM add-on — runs on rateyourmusic.com genre pages (/genre/<name>/). It reads the description RYM shows for the genre and keeps it in this
   browser, so CRATE can fill in that genre's description. Nothing is sent anywhere, and nothing on the page is changed. */
(function () {
  'use strict';
  if (window.__crateGenreLoaded) return;
  window.__crateGenreLoaded = true;
  const C = window.CrateRym, ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const slug = C.genreSlugFromPath(location.pathname);
  if (!slug) return;                                                                   // a sub-page of a genre, not the genre's own page
  const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  function textWithBreaks(root) {                                                      // the text, with the page's line breaks and paragraphs kept (textContent would run them together)
    let out = '';
    (function walk(n) {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (/^(SCRIPT|STYLE|BUTTON|NOSCRIPT|SVG|FORM|INPUT|SELECT|TEXTAREA)$/i.test(tag)) return;
      if (tag === 'BR') { out += '\n'; return; }
      const block = /^(P|DIV|LI|UL|OL|BLOCKQUOTE|H[1-6]|SECTION|ARTICLE)$/i.test(tag);
      if (block) out += '\n\n';
      n.childNodes.forEach(walk);
      if (block) out += '\n\n';
    })(root);
    return out;
  }
  function findDescription(st) {
    if (st.selGenreDesc) { try { const n = document.querySelector(st.selGenreDesc); if (n) return n; } catch (e) { /* bad selector: fall through */ } }
    let best = null, bestLen = 0;
    document.querySelectorAll('[class*="description" i], [id*="description" i], [class*="genre_info" i], [class*="about" i], [class*="summary" i]').forEach(n => {
      if (/comment|review|nav|menu|footer|header/i.test(String(n.className) + ' ' + n.id)) return;
      if (n.querySelectorAll('a[href*="/release/"]').length > 3 || n.querySelector('.component_discography_item, .disco_release')) return;      // a wrapper that holds the discography, not the description
      const len = txt(n).length; if (len < 60 || len > 12000) return;
      if (len > bestLen || (len === bestLen && best && best.contains(n))) { best = n; bestLen = len; }
    });
    return best;
  }
  function run() {
    ext.storage.local.get(['settings', 'rymGenres'], (got) => {
      const st = (got && got.settings) || {};
      if (st.captureGenres === false) { window.__crateGenre = { status: 'off' }; return; }
      const node = findDescription(st), h1 = document.querySelector('h1');
      const d = node ? C.cleanGenreText(textWithBreaks(node)) : '';
      if (d.length < 20) { window.__crateGenre = { status: 'notfound' }; return; }
      const name = h1 ? txt(h1).replace(/\s+genre$/i, '') : '';
      const r = C.mergeGenre((got && got.rymGenres) || {}, { s: slug, n: name, d, u: location.origin + '/genre/' + slug + '/', t: Date.now() }, 1500);
      window.__crateGenre = { status: r.changed ? 'saved' : 'unchanged', chars: d.length, name: name || C.genreNameFromSlug(slug) };
      if (r.changed) ext.storage.local.set({ rymGenres: r.out });
    });
  }
  run(); setTimeout(run, 2500);                                                       // once now, and once after the page has settled
})();
