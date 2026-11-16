/* CRATE · RYM add-on — (1.22.0) runs on rateyourmusic.com song pages (/song/...). It reads the song's average rating and how many ratings it
   rests on, its genres and descriptors, its credits, and the releases it appears on, and keeps them in this browser for CRATE, which puts them
   on that song in your crate. The lyrics are never read. Nothing is sent anywhere, and nothing on the page is changed. */
(function () {
  'use strict';
  if (window.__crateSongLoaded) return;
  window.__crateSongLoaded = true;
  const C = window.CrateRym, ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const BAD = /related|similar|recommend|review|comment|lyric|chart|list|footer|header|nav|menu/i;
  const inBad = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (BAD.test((e.id || '') + ' ' + String(e.className || ''))) return true; return false; };
  function songPath() { const m = /^\/song\/([^/]+)\/([^/]+)\/?/.exec(location.pathname); return m ? `/song/${m[1]}/${m[2]}` : ''; }
  function read() {
    const p = songPath(); if (!p) return null;
    const docT = (document.title || '').replace(/\s*[-|–—]\s*(?:RYM|Rate Your Music|Sonemic|rateyourmusic\.com).*$/i, '').trim();
    const byM = /^(.*?)\s+by\s+(.+)$/i.exec(docT);
    const h1 = document.querySelector('h1'), artistA = document.querySelector('[class*="song_header" i] a[href^="/artist/"], [class*="header" i] a[href^="/artist/"], a[href^="/artist/"]');
    const title = C.tidyName((h1 && txt(h1)) || (byM ? byM[1] : '') || ''), artist = C.tidyName((artistA && txt(artistA)) || (byM ? byM[2] : '') || '');
    let a = 0, n = 0;
    const avgEl = document.querySelector('[class*="rating_value" i], .avg_rating, [class*="avg_rating" i], [class*="rating_avg" i]');
    const cntEl = document.querySelector('[class*="rating_count" i], .num_ratings, [class*="num_ratings" i], [class*="ratings_count" i]');
    if (avgEl) { const r = C.ratingFromTexts(txt(avgEl), cntEl ? txt(cntEl) : ''); if (r) { a = r.a; n = r.n || 0; } else { const m = /(\d\.\d{1,2})/.exec(txt(avgEl)); if (m) a = Number(m[1]); } }
    if (!n && cntEl) { const m = /([\d,]+)/.exec(txt(cntEl)); if (m) n = Number(m[1].replace(/,/g, '')); }
    const genreLinks = [...document.querySelectorAll('a[href^="/genre/"]')].filter(x => !inBad(x));
    const isSec = (x) => !!x.closest('[class*="secondary" i], [class*="sec_genre" i]');
    const pri = uniq(genreLinks.filter(x => !isSec(x)).map(txt)).slice(0, 6), sec = uniq(genreLinks.filter(isSec).map(txt)).slice(0, 6);
    let desc = uniq([...document.querySelectorAll('a[href*="/descriptor/"]')].filter(x => !inBad(x)).map(txt));
    if (!desc.length) { const d = document.querySelector('[class*="descriptor" i]'); if (d && !inBad(d)) desc = uniq(txt(d).split(/\s*,\s*/)); }
    const credits = C.readCredits ? C.readCredits(document) : [];
    const rels = uniq([...document.querySelectorAll('a[href^="/release/"]')].filter(x => !inBad(x)).map(x => C.rymPath(x.getAttribute('href') || ''))).slice(0, 30);
    if (!title || (!a && !pri.length && !desc.length && !credits.length)) return null;
    return { p, u: location.origin + p + '/', ar: artist.slice(0, 200), ti: title.slice(0, 200), a, n, pri, sec, desc: desc.slice(0, 30).map(x => x.slice(0, 60)), credits, rels, t: Date.now() };
  }
  function run() {
    try {
      ext.storage.local.get(['settings', 'rymSongs'], (got) => {
        const st = got && got.settings || {}; if (st.captureSongs === false) return;
        const e = read(); if (!e) return;
        const r = C.mergeSong(got && got.rymSongs || {}, e, 3000); if (r.changed) ext.storage.local.set({ rymSongs: r.out });
      });
    } catch (err) { /* storage unavailable */ }
  }
  run(); setTimeout(run, 2500); setTimeout(run, 7000);                       // once now, and once after the page has settled
})();
