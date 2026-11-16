(function () {
  'use strict';
  const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome, $ = (id) => document.getElementById(id);
  const DEFAULTS = { dimOwned: false, hideOwned: false, flagEditions: true };
  let settings = Object.assign({}, DEFAULTS), lastReport = '';
  function ago(ts) { if (!ts) return ''; const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; }
  ext.storage.local.get(['crateIndex', 'settings', 'crateStatus'], (got) => {
    settings = Object.assign({}, DEFAULTS, got.settings || {});
    ['dimOwned', 'hideOwned', 'flagEditions'].forEach(k => { $(k).checked = !!settings[k]; });
    const ix = got.crateIndex;
    if (ix && ix.items) { const w = ix.items.filter(i => i.r).length; $('statusLine').textContent = `${ix.items.length.toLocaleString()} releases in your crate`; $('statusDetail').textContent = `${ix.source === 'file' ? 'From a file' : 'From CRATE'}${ix.updatedAt ? ' \u00b7 ' + ago(ix.updatedAt) : ''} \u00b7 ${w.toLocaleString()} with a RYM link`; }
    else if (settings.connectedOrigin) { $('statusLine').textContent = got.crateStatus && got.crateStatus.sharingOff ? 'Sharing is off in CRATE' : 'Connected, waiting for CRATE'; $('statusDetail').textContent = 'No data has arrived yet. Open your CRATE (version 1.29.201 or newer), or open Options \u2192 Connection check.'; }
    else { $('statusLine').textContent = 'Not connected yet'; $('statusDetail').textContent = 'Open Options to connect your CRATE or import a file.'; }
  });
  ['dimOwned', 'hideOwned', 'flagEditions'].forEach(k => $(k).addEventListener('change', () => { settings[k] = $(k).checked; ext.storage.local.set({ settings }); }));
  $('options').addEventListener('click', () => { if (ext.runtime.openOptionsPage) ext.runtime.openOptionsPage(); window.close && window.close(); });
  $('diagnose').addEventListener('click', () => {
    $('diagMsg').textContent = 'Looking\u2026'; $('diagMsg').className = 'msg';
    ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) { $('diagMsg').textContent = 'No active tab.'; $('diagMsg').className = 'msg bad'; return; }
      ext.tabs.sendMessage(tab.id, { type: 'crate-rym-diagnose' }, (r) => {
        if (!r) { $('diagMsg').textContent = 'Nothing answered. Open a RateYourMusic artist or release page first (and reload it once after installing or updating).'; $('diagMsg').className = 'msg bad'; return; }
        if (r.kind === 'release') {
          $('diagMsg').textContent = r.error ? 'Something went wrong reading this page: ' + r.error : r.tracksRead ? `${r.tracksRead} track${r.tracksRead === 1 ? '' : 's'} read on this release page${r.alreadyKept ? ' and kept for CRATE' : ' (not kept yet: reload the page, or check Options \u2192 Tracklists is on)'}.` : 'No tracklist found on this page. Copy the report below and send it: it shows the page\u2019s tracklist markup.';
          $('diagMsg').className = r.tracksRead && !r.error ? 'msg ok' : 'msg bad'; lastReport = JSON.stringify(r, null, 2); $('diagOut').textContent = lastReport; $('diagOut').hidden = false; $('copy').hidden = false; return;
        }
        $('diagMsg').textContent = `${r.covers ? `${r.covers.withCover} of ${r.covers.rows} with a cover \u00b7 ` : ''}${r.total} discography item${r.total === 1 ? '' : 's'} found \u00b7 ${r.owned} in your crate \u00b7 ${r.edition} other edition${r.edition === 1 ? '' : 's'}${r.usedFallback ? ' \u00b7 used the fallback finder' : ''}`; $('diagMsg').className = 'msg ' + (r.total ? 'ok' : 'bad');
        lastReport = JSON.stringify(r, null, 2); $('diagOut').textContent = lastReport; $('diagOut').hidden = false; $('copy').hidden = false;
      });
    });
  });
  $('copy').addEventListener('click', () => { try { navigator.clipboard.writeText(lastReport); $('copy').textContent = 'Copied'; } catch (e) { /* ignore */ } });
})();
