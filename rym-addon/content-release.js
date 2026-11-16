/* CRATE · RYM add-on — runs on rateyourmusic.com release pages (/release/...). It reads the average rating and how many ratings it is based on
   and keeps them in this browser, so CRATE can show them next to your own. Nothing is sent anywhere, and nothing on the page is changed. */
(function () {
  'use strict';
  if (window.__crateRelLoaded) return;
  window.__crateRelLoaded = true;
  const C = window.CrateRym, ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  function read(settings) {
    const p = C.rymPath(location.pathname); if (!p) return null;
    let r = null;
    if (settings && settings.selRating) { try { const n = document.querySelector(settings.selRating), m = n && /(\d\.\d{2})/.exec(txt(n)), c = document.querySelector('.num_ratings, [class*="num_ratings" i]'); if (m) r = C.ratingFromTexts(m[1], c ? txt(c) : ''); } catch (e) { /* bad selector */ } }
    if (!r) { const a = document.querySelector('.avg_rating, [class*="avg_rating" i]'), c = document.querySelector('.num_ratings, [class*="num_ratings" i]'); if (a) r = C.ratingFromTexts(txt(a), c ? txt(c) : ''); }
    if (!r) return null;
    { const box = document.querySelector('.avg_rating, [class*="avg_rating" i]'), ex = box ? C.exactIn(box.closest('tr, td, div') || box, 60) : null; if (ex && Math.abs(ex.a - r.a) <= 0.051 && ex.n) { r = { a: ex.a, n: ex.n, u: 0 }; } }          // exact figures behind a rounded or shortened display
    const names = C.rymNames(p), infoEl = document.querySelector('table.album_info') || document.querySelector('.album_info');
    return { p, a: r.a, n: r.n, u: r.u || 0, ar: names.ar, ti: names.ti, ty: C.rymType(p), y: '', k: infoEl ? C.overallRank(pieces(infoEl).join(' ')) : 0, t: Date.now() };          // k: the overall rank ("#1,475 overall"), for CRATE's bold
  }
  // ---- the tracklist ----
  const leaves = (el) => { const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT); let n = w.nextNode(); while (n) { if (!n.children.length) { const t = txt(n); if (t) out.push(t); else { const s = Number(n.getAttribute('data-inseconds')); if (s > 0) out.push(C.tlFormatTime(Math.round(s * 1000))); } } n = w.nextNode(); } return out; };      // (a length kept only in a data-inseconds attribute counts too)
  function textWithBreaks(root) {
    let out = '';
    (function walk(n) {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|BUTTON|NOSCRIPT|SVG|FORM|INPUT|SELECT|TEXTAREA)$/i.test(n.tagName)) return;
      if (n.tagName === 'BR') { out += '\n'; return; }
      if (/credit/i.test(n.id + ' ' + String(n.className)) || (!n.children.length && /^(?:lyrics|show track credits|hide track credits)$/i.test(txt(n)))) return;       // credits and the lyrics button are not part of a title
      const block = /^(P|DIV|LI|UL|OL|TR|TABLE|BLOCKQUOTE|H[1-6]|SECTION|ARTICLE)$/i.test(n.tagName);
      if (block) out += '\n'; n.childNodes.forEach(walk); if (block) out += '\n'; else if (n.children.length === 0) out += ' ';       // (inline pieces side by side must not run together)
    })(root);
    return out;
  }
  const NOT_TRACKS = /related|similar|recommend|review|comment|credits_all|nav|menu|footer|header|discography|also_like/i;
  const BAD_AREA = /related|similar|recommend|also_like|discography|other_releases|\breviews?\b|comment|credits_all/i;       // a list of lengths inside one of these is not this release's tracklist
  const inBadArea = (el) => { for (let n = el, i = 0; n && n.nodeType === 1 && n !== document.body && i < 12; n = n.parentElement, i++) if (BAD_AREA.test(n.id + ' ' + n.className)) return true; return false; };
  const NUM_LEAD = /^(?:[A-H]{1,2}|[A-Pa-p]\d{1,2}|\d{1,3}(?:-\d{1,3})?)[.)]?$/;          // a track number: 3, 03., 3), A1, 1-04, or a side on its own (A, AA)
  const CREDITS = /credit/i;
  let LENIENT = false;                                                     // the second reading of a page ignores class names that mention "credit" (they can sit on a title too)
  const credBad = (n) => !LENIENT && CREDITS.test(n.id + ' ' + String(n.className));
  const isHidden = (n) => { try { const cs = getComputedStyle(n); return cs.display === 'none' || cs.visibility === 'hidden'; } catch (e) { return false; } };
  // The visible pieces of text in an element, in page order: text sitting beside child elements counts (a title with its length in a child span), and
  // credits, hidden parts, buttons and pictures do not.
  // The text of a row's title element as ONE piece, without the lyrics button, credits, hidden parts or the length. A split release's row is an artist link and a song link side by side
  // ("Dropdead" + " - Suck"): as separate pieces the second looked like a sub-item and the song was lost.
  function titleText(root) {
    let out = '';
    (function w(n) {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|BUTTON|SELECT|TEXTAREA|INPUT|IMG)$/i.test(n.tagName)) return;
      if (n !== root && (credBad(n) || isHidden(n) || /tracklist_duration/.test(String(n.className)))) return;
      if (!n.children.length && C.tlIsNoise(txt(n))) return;
      n.childNodes.forEach(w);
    })(root);
    return out.replace(/\s+/g, ' ').trim();
  }
  // How heavy a row's title is drawn (400 normal, 700 bold): the song link, else the title element; a <b> or <strong> around it counts as bold.
  function titleWeight(row) {
    const el = row.querySelector('a[href*="/song/"]') || row.querySelector('[class*="tracklist_title"]'); if (!el) return 0;
    if (el.closest('b, strong') && row.contains(el.closest('b, strong'))) return 700;
    let w = 0; try { w = parseInt(getComputedStyle(el).fontWeight, 10) || 0; } catch (e) { /* not drawn */ }
    const inner = el.querySelector('b, strong'); if (inner && txt(inner) === txt(el)) w = Math.max(w, 700);
    return w;
  }
  const durationPieces = (root) => [...root.querySelectorAll('[class*="tracklist_duration"]')].map(d => { const t = txt(d); if (t) return t; const s = Number(d.getAttribute('data-inseconds')); return s > 0 ? C.tlFormatTime(Math.round(s * 1000)) : ''; }).filter(Boolean);
  function pieces(el) {
    const out = [];
    (function walk(n) {
      if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) out.push(t); return; }
      if (n.nodeType !== 1) return;
      if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|BUTTON|SELECT|TEXTAREA|INPUT|IMG)$/i.test(n.tagName)) return;
      if (n !== el && (credBad(n) || isHidden(n))) return;
      if (n !== el && /(?:^|\s)tracklist_title(?:\s|$)/.test(String(n.className))) { const t = titleText(n); if (t) out.push(t); durationPieces(n).forEach(d => out.push(d)); return; }
      if (!n.children.length) { const t = txt(n); if (t) out.push(t); else { const s = Number(n.getAttribute('data-inseconds')); if (s > 0) out.push(C.tlFormatTime(Math.round(s * 1000))); } return; }
      n.childNodes.forEach(walk);
    })(el);
    return out;
  }
  // Read the tracklist; if the first reading finds fewer than two tracks, or titles that are really numbers (ratings), read it again ignoring "credit" class names, and if that is
  // no better save nothing at all rather than something wrong.
  function readTracklist(st, dbg) {
    LENIENT = false;
    let out = readTracklistOnce(st, dbg);
    if (out.length < 2 || C.tracklistLooksWrong(out)) {
      LENIENT = true; const d2 = dbg ? {} : null; const alt = readTracklistOnce(st, d2); LENIENT = false;
      if (alt.length >= 2 && !C.tracklistLooksWrong(alt)) { out = alt; if (dbg) { Object.assign(dbg, d2); dbg.lenient = true; } }
      else if (C.tracklistLooksWrong(out)) out = [];
    }
    if (dbg) dbg.looksWrong = C.tracklistLooksWrong(out);
    return out;
  }
  function readTracklistOnce(st, dbg) {
    const cache = new Map(), P = (e) => { let p = cache.get(e); if (!p) { p = pieces(e); cache.set(e, p); } return p; };
    const isTime = (t) => C.tlParseTime(t) > 0;
    // a row: it carries a length, or starts with a track number and has a title after it; but not a whole block of rows (more than three lengths)
    // a row: a length, or a track number (first, or just after a rating and its vote count) together with a title; but not a whole block of rows (more than three lengths)
    const numberedRow = (p) => p.length >= 2 && (NUM_LEAD.test(p[0]) || (p.length >= 3 && p.slice(0, 4).some(t => NUM_LEAD.test(t)) && p.some(t => (/\p{L}/u.test(t) && !NUM_LEAD.test(t)) || /^\d{4,6}$/.test(t))));          // (a title of 4+ digits, "1490", can't be a number or a rating)
    const rowLike = (k) => { const p = P(k), nt = p.filter(isTime).length; return nt <= 3 && (nt > 0 || numberedRow(p)); };
    let rowEls = [], scope = null, how = '';
    if (st && st.selTracks) { try { rowEls = [...document.querySelectorAll(st.selTracks)]; how = 'your selector'; scope = rowEls.length ? rowEls[0].parentElement : null; } catch (e) { /* bad selector: look for it ourselves */ } }
    // 1. the page's own heading: "Track listing". The rows are the repeating group of row-like children in the smallest area around it that has one.
    if (!rowEls.length) {
      const heads = [...document.querySelectorAll('body *')].filter(e => !e.children.length && /^(?:track ?listing|track ?list|tracklist)$/i.test(txt(e)) && !inBadArea(e)).slice(0, 6);
      for (const h of heads) {
        for (let a = h.parentElement, i = 0; a && a !== document.body && i < 8 && !rowEls.length; a = a.parentElement, i++) {
          let best = null;
          [a, ...a.querySelectorAll('*')].slice(0, 2500).forEach(x => { if (x.tagName === 'SCRIPT' || credBad(x) || isHidden(x)) return; const q = [...x.children].filter(rowLike); if (q.length >= 2 && (!best || q.length >= best.q.length)) best = { x, q }; });      // (on a tie the later, deeper one wins: a list inside the wrapper that merely holds it)
          if (best) {                                                            // more than one group of the same kind beside it (a list per disc)? take them all
            let rows = best.q, parent = best.x;
            const sibs = best.x.parentElement ? [...best.x.parentElement.children].filter(s => s !== best.x && s.tagName === best.x.tagName && !credBad(s) && [...s.children].filter(rowLike).length >= 2) : [];
            if (sibs.length) { parent = best.x.parentElement; rows = [best.x, ...sibs].sort((u, v) => (u.compareDocumentPosition(v) & 4) ? -1 : 1).flatMap(g => [...g.children].filter(rowLike)); }
            rowEls = rows; scope = parent; how = 'the "Track listing" heading'; if (dbg) dbg.container = { tag: best.x.tagName, id: best.x.id, cls: String(best.x.className).slice(0, 80), rows: best.q.length };
          }
        }
        if (rowEls.length) break;
      }
    }
    // 2. list items, table rows and "track…" blocks in a tracklist-looking area, grouped by the area they sit in; the biggest group is the tracklist
    if (!rowEls.length) {
      const cands = [...document.querySelectorAll('li, tr, div[class*="track" i]')].filter(r => !NOT_TRACKS.test(r.id + ' ' + r.className) && !inBadArea(r)).slice(0, 2000);
      const qualifies = (r) => { if (P(r).some(isTime)) return true; return numberedRow(P(r)) && !!r.closest('[id*="track" i], [class*="track" i]'); };
      const q = cands.filter(qualifies), all = q.filter(r => !q.some(o => o !== r && r.contains(o)));
      if (dbg) { dbg.candidates = cands.length; dbg.qualifying = q.length; }
      const groups = new Map();
      all.forEach(r => { let a = (r.parentElement && r.parentElement.closest('[id*="track" i], [class*="track" i]')) || r.closest('table, ul, ol') || r.parentElement; if (a && NOT_TRACKS.test(a.id + ' ' + a.className)) return; if (!groups.has(a)) groups.set(a, []); groups.get(a).push(r); });
      let best = null; groups.forEach((rows, a) => { if (!best || rows.length > best.rows.length) best = { a, rows }; });
      if (dbg) dbg.groups = [...groups].map(([a, rows]) => ({ tag: a && a.tagName, id: a && a.id, cls: a && String(a.className).slice(0, 80), rows: rows.length })).sort((x, y) => y.rows - x.rows).slice(0, 5);
      if (best && best.rows.length >= 2) { rowEls = best.rows; scope = best.a; how = 'list items and rows'; }
    }
    // 3. last resort, only for plain text with line breaks and nothing else (no lists, tables or blocks, which is where credits and buttons would come in)
    const tracks = []; let section = '', skipExtras = false;
    const take = (row) => {
      const got = C.tracksFromRow(P(row)), ex = got.length === 1 ? C.exactIn(row) : null;          // "4.6 | 5k" on screen, "4.56 from 4,733 ratings" behind it
      if (ex && (!got[0].rating || Math.abs(got[0].rating - ex.a) <= 0.051)) { got[0].rating = ex.a; if (ex.n) got[0].votes = ex.n; }
      if (got.length === 1) { const a = row.querySelector('a[href*="/song/"]'), h = a && a.getAttribute('href'); if (h) { try { const u = new URL(h, location.origin); if (/^\/song\//.test(u.pathname)) got[0].url = u.origin + u.pathname.replace(/\/?$/, '/'); } catch (e) { /* not a link */ } } }          // the song's own RYM page, for CRATE's per-track RYM link
      if (got.length === 1) got[0].w = titleWeight(row);
      got.forEach(t => { if (!skipExtras) tracks.push(Object.assign(t, section ? { section } : {})); });
    };
    if (rowEls.length && scope) {                                                  // in page order, noting the headings (Disc 2, Side B, Enhanced Content…) that stand between rows
      const set = new Set(rowEls);
      (function walk(n) {
        if (set.has(n)) { take(n); return; }
        if (n.nodeType === 1 && (credBad(n) || isHidden(n))) return;
        if (!n.children.length) { const t = txt(n); if (t && C.isExtrasHeader(t)) { skipExtras = true; section = ''; } else if (t && C.tlIsHeader(t)) { skipExtras = false; section = t.replace(/\s*:\s*$/, '').replace(/^./, (c) => c.toUpperCase()); } return; }
        [...n.children].forEach(walk);
      })(scope);
    } else if (rowEls.length) rowEls.forEach(take);
    let clean = C.markBold(C.foldSubTracks(tracks).filter(t => !C.isExtraTitle(t.title)));
    if (clean.length < 2) {
      clean = [];
      const plain = (e) => [...e.querySelectorAll('*')].every(c => /^(BR|A|SPAN|B|I|EM|STRONG)$/.test(c.tagName));
      const times = (e) => (textWithBreaks(e).match(/\b\d{1,2}:[0-5]\d\b/g) || []).length;
      const numbered = (e) => textWithBreaks(e).split('\n').filter(l => /^\s*(?:\d{1,3}|[A-Pa-p]\d{1,2})[.)]?\s+\S/.test(l)).length;
      const score = (e) => times(e) + (numbered(e) >= 3 ? numbered(e) : 0);
      const areas = [...document.querySelectorAll('[id*="track" i], [class*="track" i]')].filter(e => !NOT_TRACKS.test(e.id + ' ' + e.className) && !inBadArea(e) && plain(e) && score(e) >= 2).sort((a, b) => score(b) - score(a) || txt(a).length - txt(b).length);
      if (areas.length) { const r = C.tlParseText(textWithBreaks(areas[0])); r.tracks.forEach(t => clean.push({ title: t.title, durationMs: t.durationMs, section: t.section || undefined })); scope = areas[0]; how = 'plain text'; if (dbg) dbg.textFallback = true; }
    }
    if (dbg) { dbg.strategy = how; dbg.rows = rowEls.length; dbg.scope = scope ? { tag: scope.tagName, id: scope.id, cls: String(scope.className).slice(0, 80) } : null; dbg.sampleRows = rowEls.slice(0, 2).map(r => r.outerHTML.slice(0, 600)); dbg.sampleRowPieces = rowEls.slice(0, 3).map(r => P(r));
      // the exact figures: what the first row holds, and what asking RYM's tooltip for it gave
      dbg.addonVersion = ext.runtime.getManifest ? ext.runtime.getManifest().version : '';
      dbg.tipsKeeperRan = !!window.__crateTipsLoaded;
      const r0 = rowEls[0], t0 = r0 && (r0.matches('.has_tip') ? r0 : r0.querySelector('.has_tip'));
      dbg.exactProbe = !r0 ? null : { hasTip: !!t0, title: t0 ? t0.getAttribute('title') : null, kept: t0 ? t0.getAttribute('data-crate-tip') : null, exact: C.exactIn(r0), tooltip: C.exactFromTip ? C.exactFromTip.last || null : null }; }
    return C.cleanTracks(clean);
  }
  // ---- the add-on popup's "Diagnose" on a release page: what was found, and the markup it was looking at, so a page that isn't read right can be understood ----
  function diagnose(st, stored) {
    const dbg = {}, tracks = readTracklist(st, dbg), p = C.rymPath(location.pathname);
    const areas = [...document.querySelectorAll('[id*="track" i], [class*="track" i]')].filter(e => !(e.parentElement && e.parentElement.closest('[id*="track" i], [class*="track" i]'))).slice(0, 3).map(e => ({ tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 80), html: e.outerHTML.slice(0, 900) }));      // the OUTERMOST tracklist-looking containers, with their markup
    const infoEl = document.querySelector('table.album_info, [class*="album_info" i], [class*="release_info" i]'), peek = readRelease(st) || {};
    return Object.assign({ coverCandidates: [...document.querySelectorAll('img')].filter(im => /^cover art/i.test(im.getAttribute('alt') || '') || /coverart/i.test(String(im.className) + ' ' + String(im.parentElement && im.parentElement.className))).slice(0, 8).map(im => ({ alt: (im.getAttribute('alt') || '').slice(0, 100), src: (im.getAttribute('src') || im.getAttribute('data-src') || '').slice(0, 160), parent: String(im.parentElement && im.parentElement.className).slice(0, 60), badArea: inBadArea(im) })), issueLines: [...document.querySelectorAll('.issue_label, [class*="issue_label" i]')].slice(0, 3).map(e => e.outerHTML.slice(0, 400)), readBack: { artist: peek.artist, title: peek.title, releaseDate: peek.releaseDate, genre: peek.genre, secondaryGenre: peek.secondaryGenre, label: peek.label, catalog: peek.catalog, descriptor: peek.descriptor, cover: peek.cover }, infoHeadings: uniq([...document.querySelectorAll('th, dt, .info_hdr, [class*="info_hdr" i]')].map(txt)).slice(0, 24), infoHtml: infoEl ? infoEl.outerHTML.slice(0, 2400) : '', kind: 'release', url: location.href, docTitle: document.title, release: p, selTracks: st.selTracks || '', captureTracklists: st.captureTracklists !== false, tracksRead: tracks.length, tracks: tracks.slice(0, 12), alreadyKept: !!(stored && stored[p]), trackAreas: areas }, dbg);
  }
  ext.runtime.onMessage && ext.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg || msg.type !== 'crate-rym-diagnose') return;
    ext.storage.local.get(['settings', 'rymTracklists'], (got) => { try { send(diagnose(got && got.settings || {}, got && got.rymTracklists || {})); } catch (e) { send({ kind: 'release', error: String(e && e.message || e), tracksRead: 0 }); } });
    return true;
  });
  // ---- one release, to send to CRATE ----
  const uniq = (list) => [...new Set(list.filter(Boolean))];
  // The value beside a heading in the release's info table ("Label", "Catalog #", "Descriptors"): the element after the heading (or after the heading's own cell), its links if it has any, else its text.
  function infoValue(headRe, linkSel) {
    // only in the release's own info table (then its info area): a page also has "Catalog" in YOUR cataloguing box (In collection, On wishlist…), which is not the release's catalogue number
    const scope = document.querySelector('table.album_info') || document.querySelector('.album_info') || document.body;
    const heads = [...scope.querySelectorAll('th, td, dt, div, span, b, strong, label, p')].filter(e => !e.children.length && headRe.test(txt(e)) && !inBadArea(e) && !e.closest('[class*="my_catalog" i], [id*="my_catalog" i], [class*="catalog_box" i]')).slice(0, 8);
    for (const h of heads) {
      for (const cell of [h.nextElementSibling, h.parentElement && h.parentElement !== document.body ? h.parentElement.nextElementSibling : null]) {
        if (!cell || cell.contains(h)) continue;
        const links = linkSel ? uniq([...cell.querySelectorAll(linkSel)].map(txt)) : [];
        const text = links.length ? links.join(', ') : uniq(pieces(cell)).join(', ');          // (pieces, not leaves: a value that is just text in its cell has no element inside it)
        if (text && text.length <= 600 && !headRe.test(text)) return text;
      }
    }
    return '';
  }
  // The picture whose own text names THIS release ("Cover art for Sandblasted by Swervedriver"): the strongest sign there is, whatever the surrounding boxes are called, and it cannot pick up
  // another release's thumbnail that happens to share a class name. Several can carry such text on a page (other issues, related releases): the one that mentions this title and artist.
  function coverByAlt(hint) {
    if (!hint || !hint.title) return '';
    const T = String(hint.title).toLowerCase(), A = String(hint.artist || '').toLowerCase(); let best = '', bestScore = 0;
    for (const im of document.querySelectorAll('img[alt]')) {
      const alt = (im.getAttribute('alt') || '').toLowerCase(); if (!/^cover art\b/.test(alt) || !alt.includes(T)) continue;
      const score = 1 + (A && alt.includes(A) ? 2 : 0) + (inBadArea(im) ? 0 : 1);
      const u = C.bestImageUrl({ currentSrc: im.currentSrc || '', src: im.getAttribute('src') || '', dataSrc: im.getAttribute('data-src') || '', dataOriginal: im.getAttribute('data-original') || '', dataLazy: im.getAttribute('data-lazy-src') || '', srcset: im.getAttribute('srcset') || '', dataSrcset: im.getAttribute('data-srcset') || '' }, location.href);
      if (u && score > bestScore) { best = u; bestScore = score; }
    }
    return best;
  }
  // The release's label and catalogue number as the page's issue line gives them: <span class="issue_label" title="Homestead / HMS 166-2"><a class="label" href="/label/…">Homestead</a> / HMS 166-2</span>.
  // The first visible one (a page can list several issues). The catalogue number is what follows the last label link, else what follows the last " / " of the line's own title.
  function readIssueLabel() {
    const el = [...document.querySelectorAll('.issue_label, [class*="issue_label" i]')].find(e => !isHidden(e) && !e.querySelector('.issue_label, [class*="issue_label" i]'));
    if (!el) return { label: '', catalog: '' };
    const links = [...el.querySelectorAll('a[href*="/label/"]')], names = uniq(links.map(txt)), kids = [...el.childNodes];
    let last = -1; kids.forEach((n, i) => { if (links.some(a => a === n || (n.nodeType === 1 && n.contains(a)))) last = i; });
    let catalog = kids.slice(last + 1).map(n => n.textContent || '').join(' ').replace(/\s+/g, ' ').trim().replace(/^[\/,;\u2013\u2014-]\s*/, '').trim();
    const ttl = String(el.getAttribute('title') || '').trim();
    if (!catalog && ttl.lastIndexOf(' / ') > 0) { const c = ttl.slice(ttl.lastIndexOf(' / ') + 3).trim(); if (c && !names.includes(c)) catalog = c; }
    let label = names.join(', ');
    if (!links.length) {                                                                // no label link: the line is plain text, "Label / Catalogue number": split at the last " / "
      const full = (ttl || kids.map(n => n.textContent || '').join(' ')).replace(/\s+/g, ' ').trim(), i = full.lastIndexOf(' / ');
      label = i > 0 ? full.slice(0, i).trim() : full; catalog = i > 0 ? full.slice(i + 3).trim() : '';
    }
    return { label: label.slice(0, 200), catalog: catalog.slice(0, 100) };
  }
  function readCover(st, hint) {                                                        // the picture RYM shows for this release (a selector in the options wins), else the one whose text names this release, else the page's share image
    const imgCands = (im) => { const a = (n) => im.getAttribute(n) || ''; return { currentSrc: im.currentSrc || '', src: a('src'), dataSrc: a('data-src'), dataOriginal: a('data-original'), dataLazy: a('data-lazy-src'), srcset: a('srcset'), dataSrcset: a('data-srcset') }; };
    let sels = []; if (st && st.selCover) sels.push(st.selCover);
    if (!sels.length) { const byAlt = coverByAlt(hint); if (byAlt) return byAlt; }
    sels = sels.concat(['img.coverart_img', '[class*="coverart" i] img', 'img[class*="coverart" i]', '[id*="coverart" i] img', '[class*="album_art" i] img', '[id*="cover" i] img']);
    for (const sel of sels) { let list = []; try { list = [...document.querySelectorAll(sel)]; } catch (e) { continue; } for (const im of list) { if (inBadArea(im)) continue; const u = C.bestImageUrl(imgCands(im), location.href); if (u) return u; } }
    const og = document.querySelector('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]');
    return og ? C.bestImageUrl({ src: og.getAttribute('content') || '' }, location.href) : '';
  }
  function readCoverBest(st, hint) {                                                          // the cover element's picture and the page's share image are often the same picture in two sizes: the larger one
    const own = readCover(st, hint), og = document.querySelector('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]'), shared = og ? C.bestImageUrl({ src: og.getAttribute('content') || '' }, location.href) : '';
    return C.biggestCover([own, shared]);
  }
  // The release's scenes and movements, for CRATE's Scene and Movement fields (the same places sceneRow keeps out of the genres): links in a row of the
  // info table headed Scene(s) / Movement(s), links to a /scene/ or /movement/ page, and a genre-list name ending in "Scene" (Laurel Canyon Scene).
  function readScenes(genreNames) {
    const out = { scene: [], movement: [] }, kindOfHead = (t) => /^\s*scenes?\b/i.test(t) ? 'scene' : /^\s*movements?\b/i.test(t) ? 'movement' : '';
    const scope = document.querySelector('table.album_info') || document.querySelector('.album_info') || document.querySelector('[class*="album_info" i]');
    if (scope) {
      scope.querySelectorAll('th, .info_hdr, [class*="hdr" i]').forEach(h => {
        const kind = kindOfHead(txt(h)); if (!kind || txt(h).length > 20) return;
        const row = h.closest('tr') || h.parentElement, cell = row && row !== h ? row : h.nextElementSibling;
        if (!cell) return;
        const links = [...cell.querySelectorAll('a')].filter(a => !h.contains(a)).map(txt).filter(Boolean);
        const names = links.length ? links : txt(cell).replace(txt(h), '').split(',').map(x => x.trim()).filter(Boolean);
        out[kind].push(...names);
      });
    }
    document.querySelectorAll('a[href]').forEach(a => {
      const m = /^\/(scene|movement)s?\//i.exec(a.getAttribute('href') || ''); if (!m || inBadArea(a)) return;
      if (scope && !scope.contains(a) && !a.closest('[class*="genre" i]')) return;            // the release's own, not a "scenes" box elsewhere on the page
      out[m[1].toLowerCase()].push(txt(a));
    });
    (genreNames || []).forEach(g => { if (/\bscene$/i.test(g)) out.scene.push(g); });
    const join = (l) => { const seen = new Set(); return l.map(x => x.replace(/\s+/g, ' ').trim().slice(0, 80)).filter(x => { const k = x.toLowerCase().replace(/\s+(scene|movement)$/, ''); if (x.length < 2 || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6).join(', '); };          // "Canterbury" and "Canterbury Scene" are one scene: the first kept
    return { scene: join(out.scene), movement: join(out.movement) };
  }
  function readRecorded() {                                      // the text of the release's "Recorded" row, whole ("June 1973 - August 1973 at Electric Lady Studios, ..."), or ''
    const scope = document.querySelector('table.album_info') || document.querySelector('.album_info') || document.querySelector('[class*="album_info" i]'); if (!scope) return '';
    for (const h of scope.querySelectorAll('th, .info_hdr, [class*="hdr" i]')) {
      if (!/^\s*recorded\s*:?\s*$/i.test(txt(h))) continue;
      const row = h.closest('tr'), cell = row ? [...row.children].find(c => c !== h && !c.contains(h)) : h.nextElementSibling;
      const t = cell ? txt(cell) : ''; if (t && t.length <= 400) return t;
    }
    return '';
  }
  function readRelease(st) {
    const p = C.rymPath(location.pathname); if (!p) return null;
    const names = C.rymNames(p), dt = C.parseReleaseDocTitle(document.title);
    let artists = []; try { if (st && st.selReleaseArtist) artists = [...document.querySelectorAll(st.selReleaseArtist)].map(txt); } catch (e) { /* bad selector */ }
    const artist = C.tidyName((artists.filter(Boolean).join(' & ')) || dt.artist || C.titleCase(names.ar)), title = C.tidyName(dt.title || C.titleCase(names.ti));
    const area = [...document.querySelectorAll('.album_info, .section_main_info, table.album_info, [class*="album_info" i]')].map(e => pieces(e).join(' ')).join(' ') || pieces(document.body).join(' ').slice(0, 6000);      // the pieces joined with spaces: a table's label and value are neighbouring cells with nothing between them
    const sceneRow = (a) => { if (/^\/(scene|movement)s?\//i.test(a.getAttribute('href') || '')) return true; const row = a.closest('tr, li, div'), h = row && row.querySelector('th, .info_hdr, [class*="hdr" i], [class*="label" i]'); return !!(h && /^\s*(scenes?|movements?)\b/i.test(txt(h))); };
    const gl = (sel) => uniq([...document.querySelectorAll(sel)].filter(a => !inBadArea(a) && !sceneRow(a)).map(txt));
    let pri = gl('.release_pri_genres a, [class*="pri_genre" i] a'), sec = gl('.release_sec_genres a, [class*="sec_genre" i] a');
    if (!pri.length) pri = gl('.album_info a[href^="/genre/"], table.album_info a[href^="/genre/"], [class*="album_info" i] a[href^="/genre/"]').filter(g => !sec.includes(g)).slice(0, C.MAX_GENRES);
    if (!pri.length && dt.genres.length) pri = dt.genres.slice(0, C.MAX_GENRES);                 // the page title's bracket lists the primary genres: used when the page's own genre links aren't found
    const tracks = readTracklist(st), issue = readIssueLabel(), o = { artist, title, type: C.crateType(C.rymType(p)), releaseDate: C.releaseDateFromText(area), genre: C.genreJoin(pri), secondaryGenre: C.genreJoin(sec), rymLink: location.origin + p + '/', cover: readCoverBest(st, { title: dt.title || title, artist: dt.artist || artist }),
      label: infoValue(/^labels?\s*:?$/i, 'a[href*="/label/"]') || issue.label, catalog: infoValue(/^(?:catalog(?:ue)?|cat\.?)\s*(?:#|no\.?|number)?\s*:?$/i, null) || issue.catalog, descriptor: infoValue(/^descriptors?\s*:?$/i, 'a[href*="/descriptor/"]') };
    if (tracks.length >= 2) o.tracks = tracks;
    { const cr = C.readCredits ? C.readCredits(document) : []; if (cr.length) o.credits = cr; }          // (1.22.0) the release's credits, for CRATE
    { const sm = readScenes(pri.concat(sec)); if (sm.scene) o.scene = sm.scene; if (sm.movement) o.movement = sm.movement; }
    { const rec = C.recordedFromText(readRecorded()); if (rec.date) o.recordedDate = rec.date; if (rec.place) o.recordedPlace = rec.place; }          // when and where it was recorded, if the page says
    return o.type ? o : null;                                      // a video or the like: not something CRATE keeps
  }
  // What this page's release is in your crate (from the index CRATE shared), kept live: when the index changes, so does the button.
  const SEND = { st: {}, idx: null };
  function matchHere() {
    const rel = readRelease(SEND.st); if (!rel) return { rel: null, status: 'none' };
    if (!SEND.idx || !SEND.idx.items || !SEND.idx.items.length) return { rel, status: 'unknown' };
    const m = C.makeMatcher(SEND.idx.items).match({ href: location.pathname, title: rel.title, artist: rel.artist, year: String(rel.releaseDate || '').slice(0, 4), type: C.rymType(location.pathname) }, { byTitle: SEND.st.matchByTitle !== false, editions: SEND.st.flagEditions !== false, types: SEND.st.matchTypes !== false, guard: false });
    return { rel, status: m.status || 'none', item: m.item || null };
  }
  function sendRelease(kind) {                                     // kind: 'release' (add it) or 'update' (bring this page's details to the one you have)
    return new Promise((resolve) => {
      ext.storage.local.get(['settings', 'rymOutbox'], (got) => {
        const st = got && got.settings || {}, rel = readRelease(st); if (!rel) { resolve(null); return; }
        if (kind === 'update') { const r0 = read(st); if (r0 && r0.a) { rel.rymRating = r0.a; if (r0.n) rel.rymVotes = r0.n; } }
        const r = C.addBatch(got && got.rymOutbox || [], { id: 'b' + Date.now(), t: Date.now(), kind, source: { url: rel.rymLink, title: `${rel.artist} \u2014 ${rel.title}` }, genre: '', releases: [rel] }, 60);          // (a run of updates can leave up to 25 waiting)
        ext.storage.local.set({ rymOutbox: r.out }, () => resolve({ rel, crateUrl: st.crateUrl || '' }));
      });
    });
  }
  function renderSendPill() {
    let pill = document.getElementById('crate-send-pill');
    if (SEND.st.showSendButton === false || SEND.st.showPill === false || !C.rymPath(location.pathname)) { if (pill) pill.remove(); return; }
    if (!document.getElementById('crate-send-style')) { const s = document.createElement('style'); s.id = 'crate-send-style'; s.textContent = '#crate-send-pill{position:fixed;right:14px;bottom:14px;z-index:2147483000;font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;background:#1B212B;color:#E8E4DA;border:1px solid #3a4352;border-radius:16px;padding:6px 12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}#crate-send-pill b{color:#D6A24C;font-weight:600}#crate-send-pill a{color:#D6A24C;margin-left:6px}#crate-send-pill[data-mode=update]{border-color:#6FBF8E}'; (document.head || document.documentElement).appendChild(s); }
    if (!pill) {
      pill = document.createElement('div'); pill.id = 'crate-send-pill'; pill.setAttribute('role', 'button'); pill.tabIndex = 0;
      const go = async () => {
        if (pill.dataset.busy) return; pill.dataset.busy = '1'; const mode = pill.dataset.mode === 'update' ? 'update' : 'release';
        const r = await sendRelease(mode); delete pill.dataset.busy; pill.innerHTML = '';
        if (!r) pill.textContent = 'CRATE: nothing it can add on this page';
        else { pill.append(document.createTextNode(mode === 'update' ? 'Update sent to CRATE \u2713' : 'Sent to CRATE \u2713')); if (r.crateUrl) { const a = document.createElement('a'); a.href = r.crateUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open CRATE'; a.addEventListener('click', e => e.stopPropagation()); pill.appendChild(a); } }
        pill.dataset.flash = '1'; setTimeout(() => { delete pill.dataset.flash; renderSendPill(); }, 6000);
      };
      pill.addEventListener('click', go); pill.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      document.body.appendChild(pill);
    }
    if (pill.dataset.busy || pill.dataset.flash) return;              // don't redraw over "Sent ✓"
    const h = matchHere(); pill.dataset.mode = h.status === 'owned' ? 'update' : 'send'; pill.innerHTML = ''; pill.removeAttribute('title');
    const strong = (t) => { const b = document.createElement('b'); b.textContent = t; return b; };
    if (h.status === 'owned') { pill.append(document.createTextNode('\u2713 In your CRATE \u00b7 '), strong('Update CRATE from this page')); if (h.item) pill.title = `Already in your crate: ${h.item.a} \u2014 ${h.item.t}${h.item.y ? ` (${h.item.y})` : ''}. Sends this page\u2019s details so CRATE can offer to fill in what is missing.`; }
    else { if (h.status === 'edition') { pill.append(document.createTextNode('\u2248 Another edition in your CRATE \u00b7 ')); if (h.item) pill.title = `You have another edition: ${h.item.a} \u2014 ${h.item.t}${h.item.y ? ` (${h.item.y})` : ''}`; } pill.append(strong('Send to CRATE')); }
  }
  ext.storage.onChanged && ext.storage.onChanged.addListener((ch, area) => {                    // the crate changed (a release added or deleted), or a setting: the button follows
    if (area && area !== 'local') return;
    if (ch.crateIndex) SEND.idx = ch.crateIndex.newValue || null;
    if (ch.settings) SEND.st = ch.settings.newValue || {};
    if (ch.crateIndex || ch.settings) renderSendPill();
  });
  function run() {
    try {
      ext.storage.local.get(['settings', 'rymRatings', 'rymTracklists', 'crateIndex'], (got) => {
        const st = got && got.settings || {}; SEND.st = st; SEND.idx = got && got.crateIndex || null; renderSendPill();
        if (st.captureRatings !== false) { const e = read(st); if (e) { const r = C.mergeRatings(got && got.rymRatings || {}, [e], 20000); if (r.changed) ext.storage.local.set({ rymRatings: r.out }); } }
        if (st.captureTracklists !== false) {                                           // the tracklist, for CRATE's tracklist editor
          const p = C.rymPath(location.pathname), tracks = p ? readTracklist(st) : [];
          if (p && tracks.length >= 2) { const names = C.rymNames(p), rel = readRelease(st), d = rel ? { label: rel.label || '', catalog: rel.catalog || '', date: rel.releaseDate || '', genre: rel.genre || '', cover: rel.cover || '' } : null;          // the release's details too, for CRATE's Pull details
            const r = C.mergeTracklist(got && got.rymTracklists || {}, { p, ar: names.ar, ti: names.ti, ty: C.rymType(p), u: location.origin + p + '/', t: Date.now(), tracks, d }, 300); if (r.changed) ext.storage.local.set({ rymTracklists: r.out }); }
          else if (p && got && got.rymTracklists && got.rymTracklists[p] && C.tracklistLooksWrong(got.rymTracklists[p].tracks)) {         // an older version kept a wrong copy (ratings read as titles) and this page can't be read better: forget it
            const o = Object.assign({}, got.rymTracklists); delete o[p]; ext.storage.local.set({ rymTracklists: o });
          }
        }
      });
    } catch (err) { /* storage unavailable */ }
  }
  run(); setTimeout(run, 2500); setTimeout(run, 7000);                       // once now, and once after the page has settled
  // Opened by an "Update from Rate Your Music" run (background.js says so by tab): wait for the page to settle, read it as "Update CRATE from this page" does, and say how it went.
  // A page asking for a check ("Just a moment…", a captcha) is reported as such and not retried; a page that no longer exists is reported as missing.
  function reportFetch(ok, reason, r) { try { ext.runtime.sendMessage({ type: 'fetch-done', ok, reason: reason || '', title: r && r.rel ? r.rel.title : '' }); } catch (e) { /* the run is over */ } }
  function fetchWhenReady() {
    ext.storage.local.get(['settings'], (got) => {
      const fast = !!(got && got.settings && got.settings.fetchFast), t0 = Date.now(), SETTLE = fast ? 500 : 2500, MAX = 25000;
      const look = () => {
        const head = ((document.title || '') + ' ' + ((document.body && document.body.innerText) || '').slice(0, 200));
        const hasInfo = !!document.querySelector('table.album_info, .album_info, .avg_rating');
        if (/just a moment|attention required|verify you are human|are you human|captcha|access denied|checking your browser/i.test(head) && !hasInfo) { reportFetch(false, 'challenge'); return; }
        if (/page not found|\b404\b|no such release|does not exist/i.test(document.title || '') && !hasInfo) { reportFetch(false, 'missing'); return; }
        if (hasInfo && Date.now() - t0 >= SETTLE) { sendRelease('update').then(r => reportFetch(!!r, r ? '' : 'unreadable', r)); return; }
        if (Date.now() - t0 > MAX) { reportFetch(false, hasInfo ? 'unreadable' : 'unreadable'); return; }
        setTimeout(look, 400);
      };
      look();
    });
  }
  let askedFetch = 0;
  function askFetch() { try { ext.runtime.sendMessage({ type: 'fetch-tab?' }, (resp) => { if (ext.runtime.lastError) return; if (resp && resp.fetch) fetchWhenReady(); else if (++askedFetch < 3) setTimeout(askFetch, 900); }); } catch (e) { /* no background */ } }
  askFetch();
})();
