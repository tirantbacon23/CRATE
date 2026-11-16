(function () {
  'use strict';
  const C = window.CrateRym, ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = { dimOwned: false, hideOwned: false, flagEditions: true, matchByTitle: true, matchTypes: true, showPill: true, captureRatings: true, captureGenres: true, captureTracklists: true, showSendButton: true, fetchInTabs: false, selCover: '', selReleaseArtist: '', selTracks: '', selGenreDesc: '', selRating: '', selItem: '', selLink: '', selYear: '', crateUrl: '', connectedOrigin: '' };
  let settings = Object.assign({}, DEFAULTS);
  const get = (keys) => new Promise(res => ext.storage.local.get(keys, res));
  const set = (obj) => new Promise(res => ext.storage.local.set(obj, res));
  function msg(id, text, kind) { const e = $(id); e.textContent = text; e.className = 'msg' + (kind ? ' ' + kind : ''); }
  function ago(ts) { if (!ts) return ''; const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; }
  async function refresh() {
    const got = await get(['crateIndex', 'settings', 'crateStatus', 'rymRatings', 'rymGenres', 'rymTracklists', 'rymOutbox', 'rymPages']);
    settings = Object.assign({}, DEFAULTS, got.settings || {});
    ['dimOwned', 'hideOwned', 'flagEditions', 'matchByTitle', 'matchTypes', 'showPill', 'captureRatings', 'captureGenres', 'captureTracklists', 'showSendButton', 'fetchInTabs'].forEach(k => { $(k).checked = !!settings[k]; });
    { const ob = got.rymOutbox || [], n = ob.reduce((s, b) => s + ((b.releases || []).length), 0); $('outboxLine').textContent = n ? `${n.toLocaleString()} release${n === 1 ? '' : 's'} waiting for CRATE, from ${ob.length} page${ob.length === 1 ? '' : 's'} (${ob.slice(0, 3).map(b => b.source && b.source.title || 'a page').join('; ')}).` : 'Nothing is waiting.'; }
    ['selItem', 'selLink', 'selYear', 'selRating', 'selGenreDesc', 'selTracks', 'selReleaseArtist', 'selCover'].forEach(k => { $(k).value = settings[k] || ''; });
    { const ts = Object.values(got.rymTracklists || {}), n = ts.length; $('tracklistsLine').textContent = n ? `${n.toLocaleString()} tracklist${n === 1 ? '' : 's'} collected so far (latest: ${ts.sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 3).map(x => x.ti).join(', ')}).` : 'None collected yet. Open a release page on RateYourMusic.'; }
    { const gs = Object.values(got.rymGenres || {}), n = gs.length; $('genresLine').textContent = n ? `${n.toLocaleString()} genre description${n === 1 ? '' : 's'} collected so far (latest: ${gs.sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 3).map(g => g.n).join(', ')}).` : 'None collected yet. Open a genre page on RateYourMusic (for example rateyourmusic.com/genre/progressive-rock/).'; }
    {                                                                                   // one line per genre or chart, the one opened last first
      const ls = Object.values(got.rymPages || {}).sort((a, b) => (b.s || 0) - (a.s || 0)), ul = $('pagesList'); ul.innerHTML = '';
      if (!ls.length) { const li = document.createElement('li'); li.textContent = 'Nothing yet. Open a genre page on RateYourMusic (rateyourmusic.com/genre/indie-rock/, then /2/, /3/…).'; ul.appendChild(li); }
      ls.forEach(L => {
        const pr = C.listProgress(L), li = document.createElement('li'), a = document.createElement('a');
        a.href = C.listPageUrl(L.k, pr.next); a.target = '_blank'; a.rel = 'noopener'; a.textContent = `next: page ${pr.next}`;
        li.append(document.createTextNode(`${L.label || L.k} (${L.kind}) · done: ${pr.done.length ? C.pageRanges(pr.done) : 'none'}${pr.open.length ? ` · opened, not done: ${C.pageRanges(pr.open)}` : ''} · ${ago(L.s)} · `), a);
        ul.appendChild(li);
      });
    }
    { const n = Object.keys(got.rymRatings || {}).length; $('ratingsLine').textContent = n ? `${n.toLocaleString()} release rating${n === 1 ? '' : 's'} collected so far.` : 'None collected yet. Browse artist pages, genre pages or release pages on RateYourMusic.'; }
    $('crateUrl').value = settings.crateUrl || $('crateUrl').value;
    const ix = got.crateIndex, connected = !!settings.connectedOrigin;
    $('disconnect').hidden = !connected; $('connect').textContent = connected ? 'Reconnect' : 'Connect';
    $('openCrate').hidden = !settings.crateUrl; if (settings.crateUrl) $('openCrate').href = settings.crateUrl;
    if (ix && ix.items) {
      const withRym = ix.items.filter(i => i.r).length, withTypes = ix.items.filter(i => i.ty).length;
      $('statusLine').textContent = `${ix.items.length.toLocaleString()} release${ix.items.length === 1 ? '' : 's'} in your crate data`;
      $('statusDetail').textContent = `${ix.source === 'file' ? 'Imported from a file' : 'From CRATE'}${ix.updatedAt ? ' \u00b7 ' + ago(ix.updatedAt) : ''} \u00b7 ${withRym.toLocaleString()} with a saved RYM link${withRym === 0 ? ' (matching will use titles only)' : ''}${withTypes === 0 ? ' \u00b7 no release types recorded, so an album, its single and its video with the same title can\u2019t be told apart (update CRATE to 1.29.203 or newer, or import a fresh export file)' : ''}`;
    } else {
      $('statusLine').textContent = 'No crate data yet';
      $('statusDetail').textContent = got.crateStatus && got.crateStatus.sharingOff ? 'CRATE is open, but sharing is switched off there (\u2699 \u2192 Share my crate with the RYM add-on).' : 'Connect to your CRATE below, or import an export file.';
    }
  }
  async function save(patch) { settings = Object.assign({}, settings, patch); await set({ settings }); }
  async function connect() {
    let u; try { u = new URL($('crateUrl').value.trim()); } catch (e) { msg('connectMsg', 'Enter the full address of your CRATE, e.g. https://yourname.github.io/crate/', 'bad'); return; }
    if (!/^https?:$/.test(u.protocol)) { msg('connectMsg', 'The address must start with https:// (or http:// for a local copy).', 'bad'); return; }
    const origin = u.origin;
    const granted = await ext.permissions.request({ origins: [origin + '/*'] });       // the first await: it has to run inside the click
    if (!granted) { msg('connectMsg', 'Permission wasn\u2019t granted, so nothing was connected.', 'bad'); return; }
    try { await ext.scripting.unregisterContentScripts({ ids: ['crate-sync'] }); } catch (e) { /* not registered yet */ }
    try { await ext.scripting.registerContentScripts([{ id: 'crate-sync', matches: [origin + '/*'], js: ['core.js', 'content-crate.js'], runAt: 'document_idle', persistAcrossSessions: true }]); }
    catch (e) { msg('connectMsg', 'Couldn\u2019t register the connection: ' + (e && e.message || e), 'bad'); return; }
    await save({ crateUrl: u.href, connectedOrigin: origin });
    let synced = 0;
    try { const tabs = await ext.tabs.query({ url: origin + '/*' }); for (const t of tabs) { await ext.scripting.executeScript({ target: { tabId: t.id }, files: ['core.js', 'content-crate.js'] }); synced++; } } catch (e) { /* tab not reachable: fine */ }
    msg('connectMsg', synced ? 'Connected, and your open CRATE tab was asked for your list. See the Connection check below.' : 'Connected. Open your CRATE in a tab and it will sync by itself. See the Connection check below.', 'ok');
    refresh(); runCheck(false);
  }
  async function disconnect() {
    const origin = settings.connectedOrigin;
    try { await ext.scripting.unregisterContentScripts({ ids: ['crate-sync'] }); } catch (e) { /* nothing registered */ }
    try { if (origin) await ext.permissions.remove({ origins: [origin + '/*'] }); } catch (e) { /* ignore */ }
    await save({ connectedOrigin: '' }); msg('connectMsg', 'Disconnected. Your crate data stays until you forget it below.', 'ok'); refresh();
  }
  async function importFile(file) {
    const text = await file.text(), r = C.fromExportJson(text);
    if (!r.ok) { msg('fileMsg', r.error, 'bad'); return; }
    if (!r.items.length) { msg('fileMsg', 'That file has no usable releases in it.', 'bad'); return; }
    await set({ crateIndex: { source: 'file', fileName: file.name, updatedAt: Date.now(), count: r.items.length, items: r.items } });
    msg('fileMsg', `Imported ${r.items.length.toLocaleString()} releases (${r.withRym.toLocaleString()} with a saved RYM link).${r.withRym === 0 ? ' None has a RYM link saved, so matching will use artist and title only.' : ''}`, 'ok'); refresh();
  }
  async function runCheck(sync) {
    const list = $('checkList'); list.innerHTML = '';
    const add = (ok, text, hint) => { const li = document.createElement('li'); li.className = ok === true ? 'ok' : ok === false ? 'bad' : 'dim'; li.appendChild(document.createTextNode((ok === true ? '\u2713 ' : ok === false ? '\u2717 ' : '\u2022 ') + text)); if (hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = hint; li.appendChild(h); } list.appendChild(li); };
    const g0 = await get(['settings']), st = Object.assign({}, DEFAULTS, g0.settings || {}), origin = st.connectedOrigin;
    if (!origin) { add(false, 'Not connected yet', 'Enter your CRATE\u2019s address above and press Connect (or import a file below).'); return; }
    let granted = false; try { granted = await ext.permissions.contains({ origins: [origin + '/*'] }); } catch (e) { /* treated as not granted */ }
    add(granted, granted ? `The browser has allowed this add-on on ${origin}` : `The browser has not allowed this add-on on ${origin}`, granted ? '' : 'Press Reconnect and allow it.');
    let reg = []; try { reg = await ext.scripting.getRegisteredContentScripts({ ids: ['crate-sync'] }); } catch (e) { /* none */ }
    add(reg.length > 0, reg.length ? 'The receiving script is set up for that address' : 'The receiving script is not set up', reg.length ? '' : 'Press Reconnect.');
    let tabs = []; try { tabs = await ext.tabs.query({ url: origin + '/*' }); } catch (e) { /* none */ }
    if (!tabs.length) add(false, `No tab is open at ${origin}`, `Open your CRATE in a tab. Its address must begin with exactly ${origin} (the same https://, the same www or no www, the same domain you entered above), then press Check and sync now.`);
    else add(true, `${tabs.length} tab${tabs.length === 1 ? ' is' : 's are'} open at ${origin}`);
    if (sync && tabs.length) {
      for (const t of tabs) { try { await ext.scripting.executeScript({ target: { tabId: t.id }, files: ['core.js', 'content-crate.js'] }); } catch (e) { /* tab not reachable */ } }
      await new Promise(r => setTimeout(r, 3600));                                 // the script gives CRATE a few seconds to answer
    }
    const g = await get(['crateStatus', 'crateIndex']), cs = g.crateStatus || {}, ix = g.crateIndex, reached = !!(cs.listening && cs.origin === origin);
    if (tabs.length) add(reached, reached ? 'The add-on\u2019s script is running on your CRATE page' : 'The add-on\u2019s script has not run on your CRATE page', reached ? '' : 'Reload your CRATE tab, then press Check and sync now.');
    if (tabs.length && reached) {
      const answered = cs.answeredAt > 0 && cs.answeredAt >= cs.listening;
      if (answered && cs.sharingOff) add(false, 'Your CRATE answered, but sharing is switched off', 'In CRATE: \u2699 \u2192 Share my crate with the RYM add-on.');
      else if (answered) { add(true, `Your CRATE answered${ix && ix.appVersion ? ' (version ' + ix.appVersion + ')' : ''} and shared ${ix && ix.items ? ix.items.length.toLocaleString() : 0} releases`); if (ix && ix.items && ix.items.length && !ix.items.some(i => i.ty)) add(false, 'Your CRATE did not say what type each release is (album, single, EP…)', 'Without that, an album and its single with the same title look identical. Update CRATE to 1.29.203 or newer, reload it, then press Check and sync now.'); }
      else if (!cs.bridge) add(false, 'Your CRATE page did not answer, and it has no add-on support', 'It is older than version 1.29.201 (or this page is not CRATE). Upload the newest index.html to wherever you host CRATE, then reload it with Ctrl+F5 (Cmd+Shift+R on a Mac), then press Check and sync now.');
      else if (cs.silentAt) add(false, 'Your CRATE page supports the add-on but did not answer', 'Reload it, and check that \u2699 \u2192 Share my crate with the RYM add-on is on.');
      else add(null, 'Waiting for your CRATE to answer\u2026', 'Press Check and sync now in a few seconds.');
    }
  }
  $('syncNow').addEventListener('click', async () => { $('syncNow').disabled = true; $('syncNow').textContent = 'Checking\u2026'; try { await runCheck(true); } finally { $('syncNow').disabled = false; $('syncNow').textContent = 'Check and sync now'; refresh(); } });
  $('connect').addEventListener('click', connect);
  $('disconnect').addEventListener('click', disconnect);
  $('file').addEventListener('change', () => { const f = $('file').files[0]; if (f) importFile(f); });
  ['dimOwned', 'hideOwned', 'flagEditions', 'matchByTitle', 'matchTypes', 'showPill', 'captureRatings', 'captureGenres', 'captureTracklists', 'showSendButton', 'fetchInTabs'].forEach(k => $(k).addEventListener('change', () => save({ [k]: $(k).checked })));
  ['selItem', 'selLink', 'selYear', 'selRating', 'selGenreDesc', 'selTracks', 'selReleaseArtist', 'selCover'].forEach(k => $(k).addEventListener('change', () => save({ [k]: $(k).value.trim() })));
  $('resetSel').addEventListener('click', async () => { await save({ selItem: '', selLink: '', selYear: '', selRating: '', selGenreDesc: '', selTracks: '', selReleaseArtist: '', selCover: '' }); refresh(); });
  $('clearOutbox').addEventListener('click', async () => { await new Promise(res => ext.storage.local.remove(['rymOutbox'], res)); msg('outboxMsg', 'Discarded.', 'ok'); refresh(); });
  $('forgetTracklists').addEventListener('click', async () => { await new Promise(res => ext.storage.local.remove(['rymTracklists'], res)); msg('tracklistsMsg', 'Forgotten.', 'ok'); refresh(); });
  $('forgetPages').addEventListener('click', async () => { if (!confirm('Forget which genre and chart pages you have checked?')) return; await new Promise(res => ext.storage.local.remove(['rymPages'], res)); msg('pagesMsg', 'Forgotten.', 'ok'); refresh(); });
  $('forgetGenres').addEventListener('click', async () => { await new Promise(res => ext.storage.local.remove(['rymGenres'], res)); msg('genresMsg', 'Forgotten.', 'ok'); refresh(); });
  $('forgetRatings').addEventListener('click', async () => { await new Promise(res => ext.storage.local.remove(['rymRatings'], res)); msg('ratingsMsg', 'Forgotten.', 'ok'); refresh(); });
  $('clear').addEventListener('click', async () => { await new Promise(res => ext.storage.local.remove(['crateIndex', 'crateStatus'], res)); msg('clearMsg', 'Forgotten.', 'ok'); refresh(); });
  refresh(); runCheck(false);
})();
