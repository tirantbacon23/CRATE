/* CRATE · RYM add-on — runs on YOUR CRATE page (only after you connect it in the options). CRATE offers a compact list of your releases
   (artist, title, year, edition, catalogue number, RYM link — nothing else) to this window; this stores it in the browser so the
   RateYourMusic pages can recognise what you already have. Nothing leaves your browser.
   It also records, for the options page's Connection check, whether it is running here and whether CRATE answered. */
(function () {
  'use strict';
  const C = window.CrateRym, ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const ask = () => window.postMessage({ source: 'crate-addon', type: 'request-index' }, location.origin);
  if (window.__crateBridgeLoaded) { ask(); return; }                       // injected again (the options page's "sync now"): just ask again
  window.__crateBridgeLoaded = true;
  const bridge = () => { const de = document.documentElement; return (de && de.getAttribute('data-crate-bridge')) || ''; };       // null-safe: this can run before the page has started building       // set by CRATE 1.29.202+; absent on an older CRATE or on a page that isn't CRATE
  const t0 = Date.now();
  let cur = { origin: location.origin, listening: t0, answeredAt: 0, silentAt: 0, sharingOff: false, bridge: bridge() };
  function flush(patch, extra) { Object.assign(cur, patch); ext.storage.local.set(Object.assign({ crateStatus: Object.assign({}, cur) }, extra || {})); }
  function fingerprint(items) { let h = 0; const s = JSON.stringify(items); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return items.length + ':' + h; }
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;                // only the page itself, never another frame or site
    const d = e.data;
    if (!d || d.source !== 'crate-app') return;
    if (d.type === 'request-rym-ratings') {                                           // CRATE asks for the ratings seen on RateYourMusic pages
      ext.storage.local.get(['rymRatings'], (got) => { const o = (got && got.rymRatings) || {}; window.postMessage({ source: 'crate-addon', type: 'rym-ratings', ratings: Object.keys(o).map(p => Object.assign({ p }, o[p])) }, location.origin); });
      return;
    }
    if (d.type === 'request-rym-outbox') {                                            // CRATE asks for the releases you sent from RateYourMusic pages
      ext.storage.local.get(['rymOutbox'], (got) => { window.postMessage({ source: 'crate-addon', type: 'rym-outbox', batches: (got && got.rymOutbox) || [] }, location.origin); });
      return;
    }
    if (d.type === 'rym-outbox-done' && Array.isArray(d.ids)) {                       // CRATE has taken them: they are cleared here
      ext.storage.local.get(['rymOutbox'], (got) => { const r = C.removeBatches(got && got.rymOutbox || [], d.ids.filter(x => typeof x === 'string').slice(0, 50)); if (r.changed) ext.storage.local.set({ rymOutbox: r.out }); });
      return;
    }
    if (d.type === 'request-rym-tracklists') {                                        // CRATE asks for the tracklists seen on RateYourMusic release pages
      ext.storage.local.get(['rymTracklists'], (got) => { const o = (got && got.rymTracklists) || {}; window.postMessage({ source: 'crate-addon', type: 'rym-tracklists', tracklists: Object.keys(o).map(k => o[k]) }, location.origin); });
      return;
    }
    if (d.type === 'request-rym-pages') {                                             // CRATE asks which genre and chart pages you have checked on RateYourMusic (see listPage in core.js)
      ext.storage.local.get(['rymPages'], (got) => { window.postMessage({ source: 'crate-addon', type: 'rym-pages', pages: (got && got.rymPages) || {} }, location.origin); });
      return;
    }
    if (d.type === 'request-rym-artists') {                                           // CRATE asks for the artist pages seen on RateYourMusic (born, members, member of, also known as…)
      ext.storage.local.get(['rymArtists'], (got) => { const o = (got && got.rymArtists) || {}; window.postMessage({ source: 'crate-addon', type: 'rym-artists', artists: Object.keys(o).map(k => o[k]) }, location.origin); });
      return;
    }
    if (d.type === 'request-rym-songs') {                                             // (1.22.0) CRATE asks for the song pages seen on RateYourMusic (rating, genres, descriptors, credits)
      ext.storage.local.get(['rymSongs'], (got) => { const o = (got && got.rymSongs) || {}; window.postMessage({ source: 'crate-addon', type: 'rym-songs', songs: Object.keys(o).map(k => o[k]) }, location.origin); });
      return;
    }
    if (d.type === 'request-rym-genres') {                                            // CRATE asks for the genre descriptions seen on RateYourMusic pages
      ext.storage.local.get(['rymGenres'], (got) => { const o = (got && got.rymGenres) || {}; window.postMessage({ source: 'crate-addon', type: 'rym-genres', genres: Object.keys(o).map(k => o[k]) }, location.origin); });
      return;
    }
    if (d.type === 'rym-fetch-start' || d.type === 'rym-fetch-cancel' || d.type === 'rym-fetch-status' || d.type === 'rym-fetch-continue') {          // "Update from Rate Your Music": the background opens the pages, one at a time
      const kind = d.type === 'rym-fetch-start' ? 'fetch-start' : d.type === 'rym-fetch-cancel' ? 'fetch-cancel' : d.type === 'rym-fetch-continue' ? 'fetch-continue' : 'fetch-status';
      try { ext.runtime.sendMessage({ type: kind, items: Array.isArray(d.items) ? d.items.slice(0, 100).map(x => ({ id: String(x && x.id || ''), url: String(x && x.url || ''), search: x && x.search && typeof x.search === 'object' ? { artist: String(x.search.artist || '').slice(0, 200), title: String(x.search.title || '').slice(0, 300), type: String(x.search.type || '').slice(0, 40), year: String(x.search.year || '').slice(0, 4) } : null })) : [], opts: d.opts && typeof d.opts === 'object' ? { gapMin: Number(d.opts.gapMin) || 0, gapMax: Number(d.opts.gapMax) || 0 } : {} }, (resp) => { void ext.runtime.lastError; window.postMessage({ source: 'crate-addon', type: 'rym-fetch-ack', for: d.type, resp: resp || { ok: false, reason: 'noanswer' } }, location.origin); }); } catch (e) { window.postMessage({ source: 'crate-addon', type: 'rym-fetch-ack', for: d.type, resp: { ok: false, reason: 'noanswer' } }, location.origin); }
      return;
    }
    if (d.type === 'disabled') { flush({ answeredAt: Date.now(), sharingOff: true, bridge: bridge() }); return; }
    if (d.type !== 'index' || !Array.isArray(d.items)) return;
    const items = C.fromCrateItems(d.items), fp = fingerprint(items), now = Date.now();
    ext.storage.local.get(['crateIndex'], (got) => {
      const same = got && got.crateIndex && got.crateIndex.fp === fp && got.crateIndex.source === 'crate';
      if (same) { flush({ answeredAt: now, sharingOff: false, bridge: bridge() }); return; }       // unchanged: don't rewrite the data and wake every open RYM tab
      flush({ answeredAt: now, sharingOff: false, bridge: bridge() }, { crateIndex: { source: 'crate', fp, updatedAt: now, appVersion: d.appVersion || '', origin: location.origin, count: items.length, items } });
    });
  });
  ext.storage.onChanged && ext.storage.onChanged.addListener((ch, area) => {            // something was sent from a RateYourMusic page: tell CRATE now, without waiting to be asked
    if (area && area !== 'local') return;
    if (ch.rymOutbox) window.postMessage({ source: 'crate-addon', type: 'rym-outbox', batches: ch.rymOutbox.newValue || [] }, location.origin);
    if (ch.rymArtists) { const o = ch.rymArtists.newValue || {}; window.postMessage({ source: 'crate-addon', type: 'rym-artists', artists: Object.keys(o).map(k => o[k]) }, location.origin); }
    if (ch.rymSongs) { const o = ch.rymSongs.newValue || {}; window.postMessage({ source: 'crate-addon', type: 'rym-songs', songs: Object.keys(o).map(k => o[k]) }, location.origin); }          // (1.22.0) a song page just read
    if (ch.rymPages) window.postMessage({ source: 'crate-addon', type: 'rym-pages', pages: ch.rymPages.newValue || {} }, location.origin);          // a page checked (or marked done) in another tab
  });
  let fetchLive = false;                                                              // a run is on: ping the background now and then (it may have been put to sleep), and pass its progress to CRATE
  ext.runtime.onMessage && ext.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'fetch-progress') return;
    fetchLive = msg.state === 'starting' || msg.state === 'loading' || msg.state === 'gap';
    window.postMessage({ source: 'crate-addon', type: 'rym-fetch-progress', jobId: msg.jobId, state: msg.state, total: msg.total, done: msg.done, ok: msg.ok, skipped: msg.skipped, reason: msg.reason, current: msg.current, nextAt: msg.nextAt, i: msg.i, items: Array.isArray(msg.items) ? msg.items.slice(0, 100).map(x => String(x).slice(0, 12)) : [], notFound: Array.isArray(msg.notFound) ? msg.notFound.slice(0, 100).map(x => String(x).slice(0, 12)) : [], finding: !!msg.finding }, location.origin);
  });
  setInterval(() => { if (fetchLive) { try { ext.runtime.sendMessage({ type: 'fetch-ping' }, () => { void ext.runtime.lastError; }); } catch (e) { /* not reachable */ } } }, 8000);
  flush({});                                                                          // "the script is running on your CRATE page"
  ask();                                                                              // in case CRATE finished loading before this script did
  setTimeout(() => { if (!(cur.answeredAt >= cur.listening && cur.answeredAt > 0)) flush({ silentAt: Date.now(), bridge: bridge() }); }, 3000);   // nothing came back: say so
})();
