(function () {
  'use strict'; const ext = chrome, $ = (id) => document.getElementById(id);
  const activeTab = async () => (await ext.tabs.query({ active: true, currentWindow: true }))[0];
  (async () => {                                                        // on your CRATE page: the visualizer's button instead of Diagnose (1.5.0)
    const tab = await activeTab(), o = ((await ext.storage.local.get('settings')).settings || {}).connectedOrigin;
    let onCrate = false; try { onCrate = !!(tab && o && new URL(tab.url || '').origin === o); } catch (e) { /* no address */ }
    $('crate').hidden = !onCrate; $('yt').hidden = onCrate;
  })();
  $('hear').addEventListener('click', async () => {
    const m = $('hearMsg'), say = (t, bad) => { m.hidden = false; m.textContent = t; m.className = 'msg' + (bad ? ' bad' : ''); };
    try {
      const tab = await activeTab();
      const streamId = await ext.tabCapture.getMediaStreamId({ targetTabId: tab.id });          // opening this popup on the tab is what lets the add-on capture it
      const r = await ext.runtime.sendMessage({ type: 'yt-audio-popup', tabId: tab.id, streamId });          // the add-on's hidden page listens, and plays the sound
      if (!r || !r.ok) { say('Couldn\u2019t start listening: ' + ((r && (r.detail || r.reason)) || 'no answer'), true); return; }
      ext.tabs.sendMessage(tab.id, { type: 'yt-audio-id' }, () => {
        if (ext.runtime.lastError) { say('CRATE didn’t answer. Reload the CRATE page and try again.', true); return; }
        say('Done: the visualizer is listening.'); setTimeout(() => window.close(), 900);
      });
    } catch (e) { const t = String((e && e.message) || e); say(/active stream/i.test(t) ? 'CRATE is already hearing this tab.' : 'Couldn’t capture this tab: ' + t, !/active stream/i.test(t)); }
  });
  $('diag').addEventListener('click', async () => {
    const out = $('out'); out.hidden = false; out.textContent = 'Reading…';
    try {
      const tab = await activeTab();
      if (!tab || !/^https:\/\/www\.youtube\.com\/(results|playlist|watch)/.test(tab.url || '')) { out.textContent = 'Open a YouTube search results page, a playlist page or a video first.'; return; }
      ext.tabs.sendMessage(tab.id, { type: 'yt-diagnose' }, (r) => { if (ext.runtime.lastError || !r) { out.textContent = 'The page didn’t answer. Reload it and try again.'; return; } out.textContent = JSON.stringify(r, null, 1); $('copy').hidden = false; });
    } catch (e) { out.textContent = 'Couldn’t read the page: ' + (e && e.message || e); }
  });
  $('copy').addEventListener('click', () => { navigator.clipboard.writeText($('out').textContent).then(() => { $('copy').textContent = 'Copied'; }); });
})();
