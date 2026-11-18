/* CRATE · RYM add-on — a Rate Your Music search page (1.23.0). Only when CRATE's "Update from Rate Your Music" is finding a release that has
   no RYM link yet (the background asks the page, as it does a release page): the search results are read (each release's address, title,
   artists, year and type) and sent to the background, which picks the one that matches and reads its page next. Nothing else is done here. */
(function () {
  'use strict';
  const ext = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;
  const txt = (n) => String((n && n.textContent) || '').replace(/\s+/g, ' ').trim();
  function results() {
    const out = [], seen = new Set();
    document.querySelectorAll('a[href*="/release/"]').forEach(a => {
      let href = a.getAttribute('href') || ''; try { href = new URL(href, location.origin).pathname; } catch (e) { return; }
      const m = /^\/release\/([a-z0-9_-]+)\/([^\/]+)\/([^\/]+)\/?$/i.exec(href); if (!m || seen.has(href)) return;
      const title = txt(a); if (!title) return; seen.add(href);
      const row = a.closest('tr, li, .infobox, .page_search_results > div') || a.parentElement || a;
      const artists = [...row.querySelectorAll('a[href*="/artist/"]')].map(txt).filter(Boolean);
      const y = /\b(19\d{2}|20\d{2})\b/.exec(txt(row));
      out.push({ href: href.replace(/\/*$/, '/'), title, artists, year: y ? y[1] : '', type: m[1].toLowerCase() });
    });
    return out.slice(0, 40);
  }
  function report(ok, reason, res) { try { ext.runtime.sendMessage({ type: 'fetch-found', ok, reason: reason || '', results: res || [] }); } catch (e) { /* the run is over */ } }
  function look(t0) {
    const head = ((document.title || '') + ' ' + ((document.body && document.body.innerText) || '').slice(0, 200));
    const res = results();
    if (/just a moment|attention required|verify you are human|are you human|captcha|access denied|checking your browser/i.test(head) && !res.length) { report(false, 'challenge'); return; }
    if (res.length && Date.now() - t0 > 1500) { report(true, '', res); return; }
    if (Date.now() - t0 > 20000) { report(true, '', res); return; }          // (no results: the background says not found)
    setTimeout(() => look(t0), 400);
  }
  let asked = 0;
  function ask() { try { ext.runtime.sendMessage({ type: 'fetch-tab?' }, (resp) => { if (ext.runtime.lastError) return; if (resp && resp.fetch) look(Date.now()); else if (++asked < 3) setTimeout(ask, 900); }); } catch (e) { /* no background */ } }
  ask();
})();
