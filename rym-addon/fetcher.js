/* CRATE · RYM add-on — the hidden page (fetcher.html). Loads the release page background.js asks for into its frame, where content-release.js reads it as it would in a tab,
   and empties the frame when told. Only Rate Your Music release pages are loaded. */
'use strict';
(function () {
  const ext = chrome, frame = document.getElementById('page');
  const ok = (u) => /^https:\/\/(?:www\.)?rateyourmusic\.com\/release\//i.test(String(u || ''));
  ext.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || msg.target !== 'crate-fetcher') return false;
    if (msg.type === 'load' && ok(msg.url)) frame.src = msg.url;
    else if (msg.type === 'clear') frame.src = 'about:blank';
    reply({ ok: true });
    return false;
  });
  ext.runtime.sendMessage({ type: 'fetcher-ready' }).then((r) => { if (r && ok(r.url)) frame.src = r.url; }).catch(() => { /* no run */ });
})();
