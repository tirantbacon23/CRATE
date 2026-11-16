/* CRATE · RYM add-on — runs on rateyourmusic.com artist pages. Looks at each discography item and flags the ones already in your CRATE.
   Everything happens in your browser: nothing is sent anywhere. It only ADDS a badge, a coloured edge and (if you choose) dims/hides;
   it never changes RYM's own text or links. */
(function () {
  'use strict';
  if (window.__crateRymLoaded) return;
  window.__crateRymLoaded = true;
  const C = window.CrateRym, ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const DEFAULTS = { dimOwned: false, hideOwned: false, flagEditions: true, matchByTitle: true, matchTypes: true, showPill: true, showSendButton: true, captureRatings: true, captureGenres: true, selGenreDesc: '', selRating: '', selItem: '', selLink: '', selYear: '', crateUrl: '' };
  const ITEM_SELECTORS = '.component_discography_item, .disco_release';        // the class you named first; RYM's older markup second
  const S = { index: null, status: {}, settings: Object.assign({}, DEFAULTS), matcher: null, report: null, usedFallback: false, results: [], pages: {} };
  let observer = null, timer = null, panelOpen = false;

  const css = `
  .crate-badge{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:1px 9px;border-radius:10px;font:600 11px/1.7 system-ui,-apple-system,Segoe UI,sans-serif;white-space:nowrap;vertical-align:middle;text-decoration:none!important;cursor:pointer;border:0}
  .crate-badge-owned{color:#0b2a14!important;background:#6FBF8E}
  .crate-badge-edition{color:#2a1d05!important;background:#E0B25C}
  .crate-owned{box-shadow:inset 3px 0 0 #6FBF8E}
  .crate-edition{box-shadow:inset 3px 0 0 #E0B25C}
  .crate-dim{opacity:.45;transition:opacity .15s}.crate-dim:hover{opacity:1}
  .crate-hide{display:none!important}
  #crate-rym-pill{position:fixed;right:14px;bottom:14px;z-index:2147483000;font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;background:#1B212B;color:#E8E4DA;border:1px solid #3a4352;border-radius:18px;padding:6px 13px;box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer}
  #crate-rym-pill b{color:#D6A24C;font-weight:600}
  #crate-rym-panel{position:fixed;right:14px;bottom:54px;z-index:2147483000;width:270px;font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#1B212B;color:#E8E4DA;border:1px solid #3a4352;border-radius:10px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
  #crate-rym-panel label{display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer}
  #crate-rym-panel a{color:#D6A24C}#crate-rym-panel .crate-small{color:#9aa3b2;font-size:11px;margin-top:6px}#crate-send-list{display:block;width:100%;margin-top:8px;padding:6px 10px;font:600 12px system-ui,-apple-system,Segoe UI,sans-serif;color:#0b0e13;background:#D6A24C;border:0;border-radius:8px;cursor:pointer}`;

  function pageKind() { return /^\/genre\//.test(location.pathname) ? 'genre' : /^\/artist\//.test(location.pathname) ? 'artist' : /^\/charts\//.test(location.pathname) ? 'chart' : ''; }
  function txt(el) { return (el && el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function pageArtist() {
    const m = /^\/artist\/([^\/?#]+)/.exec(location.pathname);
    const slugFromUrl = m ? decodeURIComponent(m[1]) : '';
    const hdr = document.querySelector('.artist_name_hdr, h1.artist_name_hdr, .artist_info_main .artist_name_hdr, h1 .artist_name');
    let name = hdr ? txt(hdr).replace(/\s*\([^)]*\)\s*$/, '') : '';
    if (!name) { const t = (document.title || '').split(/\s[|\u2013\u2014-]\s/)[0]; name = txt({ textContent: t }); }
    if (!name && slugFromUrl) name = slugFromUrl.replace(/-\d+$/, '').replace(/-/g, ' ');
    return { name, slug: slugFromUrl };
  }
  function findItems() {
    const st = S.settings; S.usedFallback = false;
    const sel = st.selItem || ITEM_SELECTORS;
    let els = [];
    try { els = [...document.querySelectorAll(sel)]; } catch (e) { els = []; }
    if (els.length) return els;
    if (st.selItem) return [];                                                         // an override you set is used as given
    // Unknown markup: every release link inside anything called "disco…", each taken with its closest row-like container.
    const seen = new Set(), out = [];
    document.querySelectorAll('[id*="disco" i] a[href*="/release/"], [class*="disco" i] a[href*="/release/"]').forEach(a => {
      if (!C.rymPath(a.getAttribute('href'))) return;
      const box = a.closest('li, tr, article, div'); if (box && !seen.has(box)) { seen.add(box); out.push(box); }
    });
    S.usedFallback = out.length > 0;
    if (!out.length && (pageKind() === 'genre' || pageKind() === 'chart')) {          // a list page whose rows have no "disco" in their names: every release link, each with the smallest row around it that names one release
      const rows = new Set();
      document.querySelectorAll('a[href*="/release/"]').forEach(a => {
        if (!C.rymPath(a.getAttribute('href')) || !txt(a) || a.closest('nav, header, footer, [id^="crate-"], [class*="related" i], [class*="sidebar" i], [id*="related" i]')) return;
        let n = a.parentElement, best = a;
        for (let i = 0; n && n !== document.body && i < 7; i++, n = n.parentElement) {
          const paths = new Set([...n.querySelectorAll('a[href*="/release/"]')].map(x => C.rymPath(x.getAttribute('href'))).filter(Boolean));
          if (paths.size > 1) break;
          best = n; if (n.querySelector('a[href*="/artist/"]')) break;
        }
        rows.add(best);
      });
      rows.forEach(r => out.push(r)); S.usedFallback = out.length > 0;
    }
    return out;
  }
  function pickLink(el) {
    const st = S.settings;
    if (st.selLink) { try { const l = el.querySelector(st.selLink); if (l) return l; } catch (e) { /* bad selector: fall through */ } }
    const links = [...el.querySelectorAll('a[href*="/release/"]')];
    return links.find(a => C.rymPath(a.getAttribute('href')) && txt(a)) || links.find(a => txt(a)) || links[0] || null;
  }
  // How heavy a release's title is drawn on a list page (400 normal, 700 bold): RYM prints some in bold. A <b> or <strong> around it counts as bold.
  function titleWeight(link) {
    if (!link) return 0; if (link.closest('b, strong')) return 700;
    let w = 0; try { w = parseInt(getComputedStyle(link).fontWeight, 10) || 0; } catch (e) { /* not drawn */ }
    const inner = link.querySelector('b, strong'); if (inner && txt(inner) === txt(link)) w = Math.max(w, 700);
    return w;
  }
  function readItem(el) {
    const link = pickLink(el), href = link ? link.getAttribute('href') || '' : '';
    let title = txt(link);
    if (!title) title = txt(el.querySelector('.album, .release, .disco_info a'));
    let yr = '';
    if (S.settings.selYear) { try { yr = C.yearFromText(txt(el.querySelector(S.settings.selYear)), '') || ''; } catch (e) { /* ignore */ } }
    if (!yr) {                                                                          // a line like "1986 | Single": the year at the start of a short text, then a separator (so a rating count that looks like a year isn't mistaken for it)
      for (const n of el.querySelectorAll('div, span, td, p, li')) { if (n.children.length > 4) continue; const t = txt(n), m = /^(1[89]\d\d|20\d\d)\s*[|\u00b7\u2022\u2502\u00a6]\s*\S/.exec(t); if (m && t.length < 60) { yr = m[1]; break; } }
    }
    if (!yr) yr = C.yearFromText(txt(el), title);
    return { link, href, title, year: yr, type: C.rymType(href) || C.typeFromText(txt(el)) };      // the type is in the release address; the "1986 | Single" line is the fallback
  }
  function itemArtists(el, href) {                                                     // genre pages: every row names its own artist (the bold line); the release address carries it too
    const names = [...el.querySelectorAll('a[href*="/artist/"]')].map(a => txt(a)).filter(Boolean);
    const p = C.rymPath(href), fromUrl = p ? p.split('/')[3].replace(/-/g, ' ') : '';
    return [...new Set(names.concat(fromUrl ? [fromUrl] : []))];
  }
  // ---- the average rating shown on each row (shared with CRATE so it can show it next to your own) ----
  function leafTexts(el) { const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT); let n = w.nextNode(); while (n) { if (!n.children.length) { const t = txt(n); if (t) out.push(t); } n = w.nextNode(); } return out; }
  function readRating(el) {
    const st = S.settings;
    { const ex = C.exactIn(el, 200); if (ex) return { a: ex.a, n: ex.n, u: 0 }; }          // the row's hover text: "3.65 from 6,123 ratings" is exact where "3.65 | 6k" is not
    if (st.selRating) {                                                                  // a selector you named: used as given for the average; the count is the figure right after it
      try { const n = el.querySelector(st.selRating), m = n && /(\d\.\d{2})/.exec(txt(n)); if (m) { const lr = C.ratingFromLeaves(leafTexts(el)), same = lr && lr.a === Number(m[1]); return { a: Number(m[1]), n: same ? lr.n : 0, u: same ? lr.u || 0 : 0 }; } } catch (e) { /* bad selector: fall through */ }
    }
    const a = el.querySelector('[class*="avg_rating" i], [class*="avg-rating" i], [class*="average_rating" i]');
    if (a) { const c = el.querySelector('[class*="num_ratings" i], [class*="rating_count" i], [class*="ratings_count" i], [class*="disco_ratings" i]'), r = C.ratingFromTexts(txt(a), c ? txt(c) : ''); if (r) return r; }
    return C.ratingFromLeaves(leafTexts(el));                                            // otherwise: the first d.dd figure on the row, and the whole number after it
  }
  function storeRatings(entries) {
    if (!entries.length) return;
    try { ext.storage.local.get(['rymRatings'], got => { const r = C.mergeRatings(got && got.rymRatings || {}, entries, 20000); if (r.changed) ext.storage.local.set({ rymRatings: r.out }); }); } catch (e) { /* storage unavailable: nothing kept */ }
  }
  function clearFlags() {
    document.querySelectorAll('.crate-badge').forEach(b => b.remove());
    document.querySelectorAll('[data-crate-status]').forEach(e => { e.removeAttribute('data-crate-status'); e.classList.remove('crate-owned', 'crate-edition', 'crate-dim', 'crate-hide'); });
  }
  function describe(m) { const i = m.item; return `${i.a} \u2014 ${i.t}${i.y ? ` (${i.y})` : ''}${i.d ? ` \u00b7 ${i.d}` : ''}`; }
  function scan() {
    if (!document.getElementById('crate-rym-style')) { const s = document.createElement('style'); s.id = 'crate-rym-style'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
    if (observer) observer.disconnect();
    clearFlags();
    const st = S.settings, kind = pageKind(), artist = kind === 'artist' ? pageArtist() : { name: '', slug: '' }, items = findItems(); S.kind = kind;
    const res = { owned: 0, edition: 0, none: 0, total: items.length, withLink: 0, sample: [] }, caught = [], rowsOut = [], seenRows = new Set();
    items.forEach(el => {
      const q = readItem(el); if (q.link) res.withLink++;
      if (q.link) {                                                                       // what could be sent to CRATE from this row
        const p2 = C.rymPath(q.href);
        if (p2 && !seenRows.has(p2)) { seenRows.add(p2); const rw = { href: q.href, artist: kind === 'artist' ? artist.name : artistNames(el), title: q.title, year: q.year, type: q.type, genres: genreLinks(el), cover: coverOfRow(el, q.link) }; Object.defineProperty(rw, 'el', { value: el }); Object.defineProperty(rw, 'link', { value: q.link }); rowsOut.push(rw); }
      }
      if (st.captureRatings !== false) {                                                // the rating on the row (whether or not you own the release, and whether or not CRATE is connected)
        const rr = readRating(el), pth = C.rymPath(q.href);
        if (rr && pth) caught.push({ p: pth, a: rr.a, n: rr.n, u: rr.u || 0, ar: kind === 'artist' ? artist.name : (itemArtists(el, q.href)[0] || ''), ti: q.title, ty: q.type, y: q.year, t: Date.now(), w: titleWeight(q.link) });
      }
      let m = { status: 'none' };
      if (S.matcher) {
        const names = kind === 'artist' ? [artist.name] : itemArtists(el, q.href), rank = { owned: 2, edition: 1, none: 0 };
        for (const nm of (names.length ? names : [''])) {                              // a collaboration lists several artists: the best match among them counts
          const r = S.matcher.match({ href: q.href, title: q.title, artist: nm, year: q.year, type: q.type }, { byTitle: st.matchByTitle, editions: st.flagEditions, types: st.matchTypes !== false, guard: kind === 'artist' });
          if (rank[r.status] > rank[m.status] || (r.status === 'none' && !m.note && r.note)) m = r;           // (a rejected same-title row keeps its explanation for the diagnostic report)
          if (m.status === 'owned') break;
        }
      }
      if (res.sample.length < 4) res.sample.push({ title: q.title, href: q.href, year: q.year, type: q.type, status: m.status, how: m.how || '', note: m.note || '' });
      res[m.status]++;
      if (m.status === 'none') return;
      el.setAttribute('data-crate-status', m.status);
      el.classList.add(m.status === 'owned' ? 'crate-owned' : 'crate-edition');
      if (m.status === 'owned' && st.dimOwned) el.classList.add('crate-dim');
      if (m.status === 'owned' && st.hideOwned) el.classList.add('crate-hide');
      const owned = m.status === 'owned';
      const how = m.how === 'rym-link' ? 'matched by your saved RYM link' : q.type && m.item.ty && st.matchTypes !== false ? 'matched by title and release type' : 'matched by title';
      const label = owned ? `Already in your CRATE: ${describe(m)} (${how})` : `You have another edition in your CRATE: ${describe(m)} (${how}; the year differs)`;
      const b = document.createElement(st.crateUrl ? 'a' : 'span');
      b.className = 'crate-badge ' + (owned ? 'crate-badge-owned' : 'crate-badge-edition');
      b.textContent = owned ? '\u2713 In your crate' : '\u2248 Another edition in your crate';
      b.setAttribute('title', label); b.setAttribute('aria-label', label);
      if (st.crateUrl) { b.setAttribute('href', st.crateUrl); b.setAttribute('target', '_blank'); b.setAttribute('rel', 'noopener'); }
      b.addEventListener('click', e => e.stopPropagation());
      (q.link ? q.link : el).insertAdjacentElement(q.link ? 'afterend' : 'beforeend', b);
    });
    res.rated = caught.length; storeRatings(C.boldMarks(caught)); S.rows = rowsOut;
    S.results = res; S.report = Object.assign({ url: location.href, pageKind: kind, pageArtist: artist, itemSelector: st.selItem || ITEM_SELECTORS, usedFallback: S.usedFallback, indexSize: S.matcher ? S.matcher.size : 0, indexWithRym: S.matcher ? S.matcher.withRym : 0 }, res);
    trackPage(res); if (kind === 'artist') keepArtistInfo(); renderPill(); watch();
  }
  // ---- an artist's page: the facts beside the name, for CRATE's artist page (see artistFromFields in core.js) ----
  let lastArtistInfo = '';
  function readArtistFields() {                                    // each heading RYM puts beside an artist ("Born", "Members"…) with the text after it
    const out = [], seen = new Set();
    document.querySelectorAll('.info_hdr, [class*="info_hdr" i], .artist_info dt, .artist_info th').forEach(h => {
      const label = txt(h); if (!label || label.length > 30 || seen.has(label.toLowerCase())) return;
      let v = h.nextElementSibling; if (!v && h.parentElement) v = h.parentElement.nextElementSibling;
      const text = v ? txt(v) : ''; if (!text) return;
      seen.add(label.toLowerCase()); out.push({ label, text: text.slice(0, 4000) });
    });
    return out;
  }
  function keepArtistInfo() {
    if (S.settings.captureGenres === false) return;                // (the same switch as genre descriptions: facts RYM shows, kept for CRATE)
    const m = /^\/artist\/([^\/?#]+)/.exec(location.pathname); if (!m) return;
    const e = C.artistFromFields(readArtistFields(), pageArtist().name, '/artist/' + m[1].toLowerCase()); if (!e) return;
    const key = JSON.stringify(Object.assign({}, e, { t: 0 })); if (key === lastArtistInfo) return; lastArtistInfo = key;
    try { ext.storage.local.get(['rymArtists'], got => { const r = C.mergeArtist(got && got.rymArtists || {}, e, 3000); if (r.changed) ext.storage.local.set({ rymArtists: r.out }); }); } catch (err) { /* not kept */ }
  }
  // ---- which pages of this genre or chart you have checked (see listPage in core.js) ----
  function thisList() { return pageKind() === 'genre' || pageKind() === 'chart' ? C.listPage(location.pathname) : null; }
  function listLabel() { return pageGenreCtx() || (document.title || '').split(/\s[-–—|]\s/)[0].slice(0, 120); }
  function savePages(r) { if (!r.changed) return; S.pages = r.out; try { ext.storage.local.set({ rymPages: r.out }); } catch (e) { /* not kept */ } }
  function trackPage(res) {                                                          // a page with releases on it counts as checked; what you have of it is noted once CRATE is connected
    const lp = thisList(); if (!lp || !res.total) return;
    const connected = S.matcher && S.matcher.size > 0;
    savePages(C.recordPage(S.pages, { key: lp.key, page: lp.page, kind: lp.kind, label: listLabel(), owned: connected ? res.owned : null, edition: res.edition, total: res.total }));
  }
  function markThisPage(done, how) { const lp = thisList(); if (!lp) return; if (!S.pages[lp.key]) trackPage(S.results); savePages(C.markPage(S.pages, lp.key, lp.page, done, how)); renderPill(); }
  // ---- sending what is on the page to CRATE (only when you press the button) ----
  function imgCands(img) { const a = (n) => img.getAttribute(n) || ''; return { currentSrc: img.currentSrc || '', src: a('src'), dataSrc: a('data-src'), dataOriginal: a('data-original'), dataLazy: a('data-lazy-src'), srcset: a('srcset'), dataSrcset: a('data-srcset') }; }
  const RYM_PIC = /^https:\/\/(?:[\w-]+\.)?(?:snmc\.io|sonemic\.net)\/(?:i|lk)\//i;          // RYM's own cover pictures (e.snmc.io/i/..., cdn.sonemic.net/i/...)
  function bgUrl(e) { const m = /url\(["']?([^"')]+)["']?\)/.exec((e.getAttribute('style') || '') + ' ' + (e.getAttribute('data-bg') || '') + ' ' + (e.getAttribute('data-background-image') || '')); return m ? m[1] : (e.getAttribute('data-bg') || ''); }
  function picsIn(scope) {                                                             // every picture address in a part of the row: <img> (and its lazy-load and srcset addresses), <picture><source>, background pictures
    const out = [];
    scope.querySelectorAll('img').forEach(im => { const u = C.bestImageUrl(imgCands(im), location.href); if (u) out.push(u); });
    scope.querySelectorAll('picture source, img[srcset], img[data-srcset]').forEach(s => (String(s.getAttribute('srcset') || '') + ',' + String(s.getAttribute('data-srcset') || '')).split(',').forEach(part => { const x = part.trim().split(/\s+/)[0]; const u = x ? C.bestImageUrl({ src: x }, location.href) : ''; if (u) out.push(u); }));
    [scope, ...scope.querySelectorAll('[style*="url("], [data-bg], [data-background-image]')].forEach(e => { const b = bgUrl(e); if (b) { const u = C.bestImageUrl({ src: b }, location.href); if (u) out.push(u); } });
    return [...new Set(out)];
  }
  function pickCover(scope, link) {                                                   // the picture in the release link; else RYM's own cover picture (when there is just one); else the only picture
    const inLink = link ? picsIn(link) : []; if (inLink.length) return C.oneRymCover(inLink) || inLink[0];
    const all = picsIn(scope), rym = all.filter(u => RYM_PIC.test(u));
    const one = C.oneRymCover(rym); if (one) return one;                                // the same cover in several sizes and formats (a <picture>'s sources) is one picture
    return all.length === 1 ? all[0] : '';                                              // several pictures and none of them clearly the cover (an artist photo and a cover?): none, rather than maybe the wrong one
  }
  function coverScopes(el) {                                                           // the row, then the blocks around it that are still about this one release: on a genre or chart page the row read
    const own = new Set([...el.querySelectorAll('a[href*="/release/"]')].map(a => C.rymPath(a.getAttribute('href'))).filter(Boolean)), out = [el];          // is the title-and-artist column, and the cover sits in the column beside it
    for (let n = el.parentElement, i = 0; n && n !== document.body && i < 4; n = n.parentElement, i++) {
      const paths = new Set([...n.querySelectorAll('a[href*="/release/"]')].map(a => C.rymPath(a.getAttribute('href'))).filter(Boolean));
      if ([...paths].some(p => !own.has(p))) break;                                      // it takes in another release: too far
      out.push(n);
    }
    return out;
  }
  function coverOfRow(el, link) {
    for (const sc of coverScopes(el)) { const u = pickCover(sc, link && sc.contains(link) ? link : null); if (u) return u; }
    return '';
  }
  function artistNames(el) {                                                           // the artists in a row, joined the way the page joins them: "A / B" for a split, "A, B", else "A & B"
    const seen = new Set(), links = [];
    el.querySelectorAll('a[href*="/artist/"]').forEach(a => { const t = txt(a), h = a.getAttribute('href'); if (t && !seen.has(h)) { seen.add(h); links.push(a); } });
    const L = links.slice(0, 3); if (!L.length) return '';
    let out = txt(L[0]);
    for (let k = 1; k < L.length; k++) {
      let sep = ''; for (let n = L[k - 1].nextSibling; n && n !== L[k]; n = n.nextSibling) sep += n.textContent || '';
      sep = sep.replace(/\s+/g, ' ').trim();
      out += (sep === '/' ? ' / ' : sep === ',' ? ', ' : ' & ') + txt(L[k]);
    }
    return out;
  }
  function genreLinks(el) { return [...new Set([...el.querySelectorAll('a[href*="/genre/"]')].map(a => txt(a)).filter(Boolean))].slice(0, 4); }
  function pageGenreCtx() {                                                            // the genre this page is about: a genre page's heading, or the g: part of a chart address
    if (pageKind() === 'genre') { const h = document.querySelector('h1'), t = h ? txt(h) : ''; return t && t.length < 60 ? t : C.titleCase(C.genreNameFromSlug(C.genreSlugFromPath(location.pathname))); }
    if (pageKind() === 'chart') { const m = /\/g:([^\/]+)/.exec(location.pathname); return m ? C.titleCase(C.genreNameFromSlug(decodeURIComponent(m[1]))) : ''; }
    return '';
  }
  function sendList(msgEl) {
    const genre = pageGenreCtx(), kind = pageKind(), rows = S.rows || [];
    rows.forEach(r => { if (!r.cover && r.el && r.el.isConnected) { try { r.cover = coverOfRow(r.el, r.link && r.link.isConnected ? r.link : null); } catch (e) { /* the row changed */ } } });
    const releases = rows.map(r => C.rowToRelease(r, { genre })).filter(Boolean), skipped = rows.length - releases.length;
    const label = kind === 'artist' ? `${pageArtist().name} (discography)` : kind === 'genre' ? `${genre} (genre page)` : (document.title || 'chart').split(/\s[-\u2013\u2014|]\s/)[0].slice(0, 120);
    ext.storage.local.get(['rymOutbox'], got => {
      const r = C.addBatch(got && got.rymOutbox || [], { id: 'b' + Date.now(), t: Date.now(), kind: 'list', source: { url: location.origin + location.pathname, title: label }, genre, releases }, 60);
      if (!r.changed) { S.sentMsg = { text: 'Nothing here that CRATE can add.' }; renderPill(); return; }
      ext.storage.local.set({ rymOutbox: r.out }, () => { markThisPage(true, 'sent'); S.sentMsg = { text: `Sent ${releases.length} release${releases.length === 1 ? '' : 's'} to CRATE${skipped ? ` (${skipped} left out: videos, or no usable address)` : ''}.`, open: S.settings.crateUrl || '' }; renderPill(); });
    });
  }
  function renderPill() {
    let pill = document.getElementById('crate-rym-pill'), panel = document.getElementById('crate-rym-panel');
    if (!S.settings.showPill || !pageKind()) { if (pill) pill.remove(); if (panel) panel.remove(); return; }
    if (!pill) { pill = document.createElement('div'); pill.id = 'crate-rym-pill'; pill.setAttribute('role', 'button'); pill.tabIndex = 0;
      pill.addEventListener('click', () => { panelOpen = !panelOpen; renderPill(); });
      pill.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); panelOpen = !panelOpen; renderPill(); } });
      document.body.appendChild(pill); }
    const r = S.results, connected = S.matcher && S.matcher.size > 0;
    pill.innerHTML = '';
    const lead = document.createElement('span'); lead.textContent = 'CRATE \u00b7 ';
    const rest = document.createElement('span');
    if (!connected) rest.textContent = S.crateEmpty ? 'your crate is empty' : S.status && S.status.sharingOff && S.settings.connectedOrigin ? 'sharing is off in CRATE' : S.settings.connectedOrigin ? 'connected \u2014 waiting for your CRATE' : 'not connected \u2014 set up';
    else if (!r.total) rest.textContent = 'no discography items found here';
    else { const b = document.createElement('b'); b.textContent = `${r.owned} of ${r.total}`; rest.appendChild(b); rest.appendChild(document.createTextNode(`${S.kind === 'genre' ? ' on this page' : ''} in your crate${r.edition ? ` \u00b7 ${r.edition} other edition${r.edition === 1 ? '' : 's'}` : ''}`)); }
    const lp = thisList(), L = lp && S.pages[lp.key], pg = L && L.pages[lp.page];
    if (lp) rest.appendChild(document.createTextNode(` · page ${lp.page}${pg && pg.d ? ' ✓' : ''}`));
    pill.append(lead, rest);
    if (!panelOpen) { if (panel) panel.remove(); return; }
    if (!panel) { panel = document.createElement('div'); panel.id = 'crate-rym-panel'; document.body.appendChild(panel); }
    const opts = ext.runtime.getURL ? ext.runtime.getURL('options.html') : '#';
    panel.innerHTML = '';
    const mk = (key, label) => { const l = document.createElement('label'), i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!S.settings[key]; i.addEventListener('change', () => save({ [key]: i.checked })); l.append(i, document.createTextNode(label)); return l; };
    panel.append(mk('dimOwned', 'Dim releases already in my crate'), mk('hideOwned', 'Hide releases already in my crate'), mk('flagEditions', 'Flag other editions (a different year)'));
    if (lp && L) panel.appendChild(progressBlock(lp, L));
    if (S.rows && S.rows.length && S.settings.showSendButton !== false) {
      const sendable = S.rows.filter(rw => C.rowToRelease(rw, {})).length;                      // what will really be sent: a video, say, is not
      if (sendable) { const send = document.createElement('button'); send.type = 'button'; send.id = 'crate-send-list'; send.textContent = `Send ${sendable} release${sendable === 1 ? '' : 's'} to CRATE`;
        send.addEventListener('click', () => sendList()); panel.appendChild(send); }
      if (S.sentMsg) { const m = document.createElement('div'); m.className = 'crate-small'; m.id = 'crate-send-msg'; m.textContent = S.sentMsg.text; if (S.sentMsg.open) { const a = document.createElement('a'); a.href = S.sentMsg.open; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' Open CRATE'; m.appendChild(a); } panel.appendChild(m); }
    }
    const info = document.createElement('div'); info.className = 'crate-small';
    const origin = S.settings.connectedOrigin;
    info.textContent = connected ? `${S.matcher.size} releases from ${S.index && S.index.source === 'file' ? 'an imported file' : 'CRATE'} \u00b7 ${S.matcher.withRym} with a saved RYM link`
      : origin && S.status && S.status.sharingOff ? 'Your CRATE says sharing is switched off: \u2699 \u2192 Share my crate with the RYM add-on.'
      : origin ? `Connected to ${origin}, but no data has arrived yet. Open your CRATE in a tab (it must be version 1.29.201 or newer, so upload the latest index.html if you host it yourself). The Connection check in the options shows what's wrong.`
      : 'No crate data yet.';
    const a = document.createElement('a'); a.href = opts; a.target = '_blank'; a.rel = 'noopener'; a.textContent = connected ? 'Options' : origin ? 'Connection check' : 'Set up the add-on';
    info.append(document.createTextNode(' \u00b7 '), a); panel.appendChild(info);
    if (window.__crateGenre && S.kind === 'genre') { const g = window.__crateGenre, d = document.createElement('div'); d.className = 'crate-small'; d.textContent = g.status === 'saved' ? `Saved this genre's description (${g.chars.toLocaleString()} characters) for CRATE.` : g.status === 'unchanged' ? `This genre's description is already saved for CRATE (${g.chars.toLocaleString()} characters).` : g.status === 'off' ? 'Saving genre descriptions is switched off in the add-on\u2019s options.' : 'Couldn\u2019t find the genre description on this page (the add-on\u2019s options have a selector for it).'; panel.appendChild(d); }
    if (S.settings.captureRatings !== false && r.total) { const d = document.createElement('div'); d.className = 'crate-small'; d.textContent = r.rated ? `Read ${r.rated} RYM rating${r.rated === 1 ? '' : 's'} on this page to share with CRATE.` : 'No RYM ratings found on this page (the add-on reads the average shown on each item).'; panel.appendChild(d); }
    if (r.total === 0 && connected) { const d = document.createElement('div'); d.className = 'crate-small'; d.textContent = 'Nothing matched RYM\u2019s item markup here. Open the add-on popup and choose \u201cDiagnose this page\u201d.'; panel.appendChild(d); }
  }
  function progressBlock(lp, L) {                                                    // this list's progress: which pages are checked and done, this page's state, and the next page to check
    const box = document.createElement('div'); box.id = 'crate-progress'; box.className = 'crate-small';
    const pr = C.listProgress(L), pg = L.pages[lp.page] || {}, day = (t) => t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    const line = (t) => { const d = document.createElement('div'); d.textContent = t; box.appendChild(d); return d; };
    line(`Page ${lp.page}: ${pg.d ? `done${pg.h === 'sent' ? ' (sent to CRATE)' : pg.h === 'all' ? ' (all in your crate)' : ''}` : 'checked, not done'}${pg.f ? ` · first opened ${day(pg.f)}` : ''}`);
    line(`Done: ${pr.done.length ? C.pageRanges(pr.done) : 'none yet'}${pr.open.length ? ` · opened, not done: ${C.pageRanges(pr.open)}` : ''}`);
    const row = document.createElement('div'), b = document.createElement('button'); b.type = 'button'; b.id = 'crate-mark-done';
    b.style.cssText = 'margin:6px 8px 0 0;padding:3px 9px;font:600 11px system-ui,sans-serif;color:#E8E4DA;background:none;border:1px solid #3a4352;border-radius:8px;cursor:pointer';
    b.textContent = pg.d ? 'Not done after all' : 'Mark this page done'; b.addEventListener('click', () => markThisPage(!pg.d, 'you')); row.appendChild(b);
    if (pr.next !== lp.page) { const a = document.createElement('a'); a.href = C.listPageUrl(lp.key, pr.next); a.textContent = `Next to check: page ${pr.next} →`; row.appendChild(a); }
    box.appendChild(row); return box;
  }
  function save(patch) { Object.assign(S.settings, patch); try { ext.storage.local.set({ settings: S.settings }); } catch (e) { /* not saved */ } rebuild(); }
  function rebuild() { S.matcher = S.index && S.index.items ? C.makeMatcher(S.index.items) : null; S.crateEmpty = !!(S.index && Array.isArray(S.index.items) && S.index.items.length === 0); scan(); }
  function watch() {
    if (!observer) observer = new MutationObserver(muts => {
      if (muts.every(m => [...m.addedNodes, ...m.removedNodes].every(n => n.nodeType !== 1 || /^crate-|^crate-rym/.test((n.className && String(n.className)) + (n.id || ''))))) return;     // our own changes
      clearTimeout(timer); timer = setTimeout(scan, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function load() {
    ext.storage.local.get(['crateIndex', 'settings', 'crateStatus', 'rymPages'], got => {
      S.pages = got && got.rymPages || {}; S.status = got && got.crateStatus || {}; S.index = got && got.crateIndex || null; S.settings = Object.assign({}, DEFAULTS, got && got.settings || {});
      rebuild();
    });
  }
  ext.storage.onChanged && ext.storage.onChanged.addListener((ch, area) => { if (area && area !== 'local') return; if (ch.crateIndex || ch.settings) load(); else { if (ch.crateStatus) S.status = ch.crateStatus.newValue || {}; if (ch.rymPages) S.pages = ch.rymPages.newValue || {}; if (ch.crateStatus || ch.rymPages) renderPill(); } });          // (pages: another tab, or Options forgetting them)
  ext.runtime.onMessage && ext.runtime.onMessage.addListener((msg, sender, send) => { if (msg && msg.type === 'crate-rym-diagnose') { scan(); const rows = (S.rows || []).slice(0, 8); let first = null; try { const e = rows[0] && rows[0].el, sc = e ? coverScopes(e) : []; first = sc.length ? { scopes: sc.length, html: sc[sc.length - 1].outerHTML.slice(0, 2500) } : null; } catch (e) { /* the row changed */ } send(Object.assign({}, S.report, { addonVersion: ext.runtime.getManifest ? ext.runtime.getManifest().version : '', covers: { rows: (S.rows || []).length, withCover: (S.rows || []).filter(r => r.cover || (r.el && r.el.isConnected && coverOfRow(r.el, r.link))).length, sample: rows.map(r => ({ title: r.title, cover: r.cover || (r.el && r.el.isConnected ? coverOfRow(r.el, r.link) : '') })), firstRow: first } })); } });
  window.__crateRym = { scan: () => scan(), state: S };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
