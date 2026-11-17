(function () {
  'use strict';
  const ext = chrome, $ = (id) => document.getElementById(id);
  const get = (k) => ext.storage.local.get(k), set = (o) => ext.storage.local.set(o), msg = (id, t, cls) => { const e = $(id); e.textContent = t; e.className = 'msg' + (cls ? ' ' + cls : ''); };
  let settings = {};
  const save = async (patch) => { settings = Object.assign({}, settings, patch); await set({ settings }); };
  async function refresh() {
    const g = await get(['settings', 'ytState', 'ytLog', 'ytCache']); settings = g.settings || {};
    $('crateUrl').value = settings.crateUrl || $('crateUrl').value; $('viaTabs').checked = settings.noFetch === true; $('parallel').value = String(Math.min(4, Math.max(1, Number(settings.parallel) || 3))); $('disconnect').hidden = !settings.connectedOrigin;
    let line = settings.connectedOrigin ? 'Connected to ' + settings.connectedOrigin + '.' : 'Not connected to a CRATE yet.';
    try { if (settings.connectedOrigin) { const granted = await ext.permissions.contains({ origins: [settings.connectedOrigin + '/*'] }); if (!granted) line += ' (the browser permission for it is missing: connect again)'; } } catch (e) { /* ignore */ }
    $('statusLine').textContent = line;
    const st = g.ytState || {}, n = ((g.ytLog || []).filter(t => t > Date.now() - 86400000)).length, cached = Object.keys(g.ytCache || {}).length, waiting = (st.queue || []).length + (st.running || []).length + (st.cur ? 1 : 0);
    $('activityLine').textContent = `${n} page${n === 1 ? '' : 's'} read in the last 24 hours (no daily limit) \u00b7 ${cached} answer${cached === 1 ? '' : 's'} remembered \u00b7 ${waiting} question${waiting === 1 ? '' : 's'} waiting${st.state === 'stopped' ? ` \u00b7 STOPPED (${st.reason || 'a page needs you'}): pass what is open in the YouTube tab, then Continue` : ''}.`;
    $('continue').hidden = st.state !== 'stopped'; $('cancel').hidden = !(waiting || st.state === 'stopped');
  }
  async function connect() {
    let u; try { u = new URL($('crateUrl').value.trim()); } catch (e) { msg('connectMsg', 'Enter the full address of your CRATE, e.g. https://yourname.github.io/crate/', 'bad'); return; }
    if (!/^https?:$/.test(u.protocol)) { msg('connectMsg', 'The address must start with https:// (or http:// for a local copy).', 'bad'); return; }
    const origin = u.origin, granted = await ext.permissions.request({ origins: [origin + '/*'] });          // the first await: it has to run inside the click
    if (!granted) { msg('connectMsg', 'Permission wasn\u2019t granted, so nothing was connected.', 'bad'); return; }
    try { await ext.scripting.unregisterContentScripts({ ids: ['crate-yt-sync'] }); } catch (e) { /* not registered yet */ }
    try { await ext.scripting.registerContentScripts([{ id: 'crate-yt-sync', matches: [origin + '/*'], js: ['content-crate.js'], runAt: 'document_idle', persistAcrossSessions: true }]); } catch (e) { msg('connectMsg', 'Couldn\u2019t register the connection: ' + (e && e.message || e), 'bad'); return; }
    await save({ crateUrl: u.href, connectedOrigin: origin });
    try { const tabs = await ext.tabs.query({ url: origin + '/*' }); for (const t of tabs) await ext.scripting.executeScript({ target: { tabId: t.id }, files: ['content-crate.js'] }); } catch (e) { /* tab not reachable: fine */ }
    msg('connectMsg', 'Connected. Reload your CRATE tab if it was already open.', 'ok'); refresh();
  }
  async function disconnect() {
    const origin = settings.connectedOrigin;
    try { await ext.scripting.unregisterContentScripts({ ids: ['crate-yt-sync'] }); } catch (e) { /* nothing registered */ }
    try { if (origin) await ext.permissions.remove({ origins: [origin + '/*'] }); } catch (e) { /* ignore */ }
    await save({ connectedOrigin: '' }); msg('connectMsg', 'Disconnected.', 'ok'); refresh();
  }
  $('connect').addEventListener('click', connect); $('disconnect').addEventListener('click', disconnect);
  $('continue').addEventListener('click', async () => { await ext.runtime.sendMessage({ type: 'yt-continue' }); msg('actMsg', 'Carrying on.', 'ok'); setTimeout(refresh, 600); });
  $('cancel').addEventListener('click', async () => { const r = await ext.runtime.sendMessage({ type: 'yt-cancel' }); msg('actMsg', `Cancelled ${r && r.cancelled || 0}.`, 'ok'); refresh(); });
  $('forget').addEventListener('click', async () => { await ext.storage.local.remove(['ytCache', 'ytResults']); msg('actMsg', 'Forgotten.', 'ok'); refresh(); });
  refresh(); setInterval(refresh, 4000);
  $('viaTabs').addEventListener('change', () => save({ noFetch: $('viaTabs').checked }));
  $('parallel').addEventListener('change', () => save({ parallel: Number($('parallel').value) }));
})();
