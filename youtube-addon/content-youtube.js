/* CRATE for YouTube · content-youtube.js — runs on YouTube search, playlist and video pages. It does NOTHING on a page you opened yourself. When the background opened the page for CRATE (it says so, by tab),
   this reads what the page says (core.js knows the shapes) and reports it, or reports why it couldn't: a cookie question, an "unusual traffic" page, or a page it doesn't understand. */
(function () {
  'use strict';
  const ext = chrome, Y = globalThis.CrateYt; if (!ext || !ext.runtime || !Y) return;
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  function pageData(name) { const nm = name || 'ytInitialData'; for (const sc of document.scripts) { const t = sc.textContent; if (t && t.indexOf(nm) >= 0) { const d = Y.extractInitialData(t, nm); if (d) return d; } } return null; }
  function domVideos() {                                                 // the page as drawn, for when the data can't be read
    const out = [];
    document.querySelectorAll('ytd-video-renderer').forEach(r => {
      const a = r.querySelector('a#video-title[href*="/watch?v="]'); if (!a) return; const m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(a.getAttribute('href') || ''); if (!m) return;
      const ch = r.querySelector('ytd-channel-name a, #channel-name a'), dur = r.querySelector('ytd-thumbnail-overlay-time-status-renderer, .badge-shape-wiz__text');
      out.push({ id: m[1], title: clean(a.getAttribute('title') || a.textContent), channel: clean(ch && ch.textContent), durationMs: Y.durationMs(clean(dur && dur.textContent)), official: false });
    });
    return out.slice(0, 25);
  }
  function domPlaylists() {
    const out = [], seen = new Set();
    document.querySelectorAll('a[href*="list="]').forEach(a => { const m = /[?&]list=([A-Za-z0-9_-]{13,64})/.exec(a.getAttribute('href') || ''); if (!m || /^RD/.test(m[1]) || seen.has(m[1])) return; const t = clean(a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent); if (!t) return; seen.add(m[1]); out.push({ id: m[1], title: t, channel: '', count: 0 }); });
    return out.slice(0, 15);
  }
  const fromDom = (op) => op.kind === 'search-video' ? domVideos() : op.kind === 'search-playlist' ? domPlaylists() : [];
  function read(op) {
    if (op.kind === 'video') { const items = Y.videoInfoFrom(pageData(), pageData('ytInitialPlayerResponse')); return { found: items.length > 0, items }; }          // a video's own page (1.4.0)
    const data = pageData();
    if (data) { const items = op.kind === 'playlist' ? Y.playlistVideosFrom(data) : op.kind === 'search-playlist' ? Y.playlistsFrom(data) : Y.videosFrom(data); return { found: true, items: items.length ? items : fromDom(op) }; }
    const dom = fromDom(op); return { found: dom.length > 0, items: dom };
  }
  const bodyText = () => (document.body && document.body.innerText || '').slice(0, 800);
  const done = (res) => { try { ext.runtime.sendMessage(Object.assign({ type: 'yt-done' }, res)); } catch (e) { /* the run is over */ } };
  function run(op) {
    const t0 = Date.now();
    const step = () => {
      const has = !!pageData() || (op.kind === 'video' && !!pageData('ytInitialPlayerResponse'));          // a real page is never taken for a check page because of a word in a title
      const reason = Y.pageReason({ url: location.href, title: has ? '' : document.title, text: has ? '' : bodyText() });
      if (reason) { done({ ok: false, reason }); return; }
      const r = read(op); if (r.found) { done({ ok: true, items: r.items }); return; }
      if (Date.now() - t0 > 12000) { done({ ok: false, reason: 'unreadable' }); return; }
      setTimeout(step, 600);
    };
    step();
  }
  let asked = 0;
  function ask() { try { ext.runtime.sendMessage({ type: 'yt-tab?' }, (resp) => { if (ext.runtime.lastError) return; if (resp && resp.job && resp.op) run(resp.op); else if (++asked < 3) setTimeout(ask, 900); }); } catch (e) { /* no background */ } }
  ask();
  ext.runtime.onMessage.addListener((msg, sender, reply) => {            // the popup's "Diagnose this page"
    if (!msg || msg.type !== 'yt-diagnose') return false;
    const data = pageData(), ops = ['search-video', 'search-playlist', 'playlist'];
    reply({ url: location.href, title: document.title, hasData: !!data, reason: Y.pageReason({ url: location.href, title: data ? '' : document.title, text: data ? '' : bodyText() }), topKeys: data ? Object.keys(data).slice(0, 14) : [],
      videos: data ? Y.videosFrom(data).slice(0, 3) : [], playlists: data ? Y.playlistsFrom(data).slice(0, 3) : [], playlistVideos: data ? Y.playlistVideosFrom(data).length : 0,
      dom: { videoRenderers: document.querySelectorAll('ytd-video-renderer').length, lockups: document.querySelectorAll('yt-lockup-view-model').length, watchLinks: document.querySelectorAll('a[href*="/watch?v="]').length, listLinks: document.querySelectorAll('a[href*="list="]').length },
      domVideos: domVideos().slice(0, 2), bodyHead: bodyText().slice(0, 160), ops,
      lockupSample: (() => { let f = null; if (data) Y.walk(data, (o, key) => { if (!f && key === 'lockupViewModel') f = o; }); return f ? JSON.stringify(f).slice(0, 1500) : ''; })() });          // (1.5.3) one result as YouTube wrote it, so a change can be read off and fixed
    return false;
  });
})();
