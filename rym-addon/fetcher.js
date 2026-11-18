/* CRATE · RYM add-on — the hidden page (fetcher.html). Loads the release page background.js asks for into its frame, where content-release.js reads it as it would in a tab,
   and empties the frame when told. Only Rate Your Music release pages (and, from 1.23.0, its search page) are loaded. */
'use strict';
(function () {
  const ext = chrome, frame = document.getElementById('page');
  const ok = (u) => /^https:\/\/(?:www\.)?rateyourmusic\.com\/(?:release\/|search\?)/i.test(String(u || ''));          // (1.23.0) and its search page, to find a release with no link yet
  ext.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || msg.target !== 'crate-fetcher') return false;
    if (msg.type === 'load' && ok(msg.url)) frame.src = msg.url;
    else if (msg.type === 'clear') frame.src = 'about:blank';
    reply({ ok: true });
    return false;
  });
  ext.runtime.sendMessage({ type: 'fetcher-ready' }).then((r) => { if (r && ok(r.url)) frame.src = r.url; }).catch(() => { /* no run */ });
})();
