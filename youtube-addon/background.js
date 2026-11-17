/* CRATE for YouTube · background.js — answers CRATE's questions about YouTube ("which videos match this song?", "which playlist is this album?", "what is in this playlist?") by reading YouTube's own pages.
   It is built to be small and to stop:
   - A FEW pages at once (Options → Speed, "Pages at once": 1 to 4, 3 unless you change it; it was one at a time until 1.3.0). The page is requested DIRECTLY by this script (no tab opens: the answer is in the HTML YouTube
     sends back); the starts are spaced by 1.5 to 3 seconds divided by the number at once (never under 0.3). Only Options sets the number: no web page, CRATE included, can raise it.
     If a page can't be read that way it is opened in a background tab that is closed again, ONE at a time and with nothing else running, with the old pause of 9 to 15 seconds (never under 8);
   - an answer is REMEMBERED (3 days for a search, 7 for a playlist) so the same question never costs a second page;
   - NO daily limit (it was 250 a day until 1.2.0): what ends a long run is the stop below, and the pause between pages. A queue of at most 60 questions;
   - only YouTube search and playlist addresses are ever opened (core.js checks every address and every question again);
   - it STOPS at the first page that asks for a cookie answer or says "unusual traffic" or can't be understood, leaves that page open in front of you, and waits for you to Continue or Cancel
     (pages already being read when that happens still bring back their answers).
   No account is used or needed. This is automated reading of a site whose terms only allow its API; keep it to what you need. The state is kept in storage and every step is safe to repeat, because a service
   worker can be stopped at any time; CRATE's page pings it while something is waiting, which wakes it. */
'use strict';
importScripts('core.js');
const ext = chrome, Y = globalThis.CrateYt;
const MIN_GAP = 8000, DEF_LO = 9000, DEF_HI = 15000, FETCH_MIN = 1000, FETCH_LO = 1500, FETCH_HI = 3000, PAR_MIN_GAP = 300, PAR_DEFAULT = 3, PAR_MAX = 4, FETCH_TIMEOUT = 15000, LOAD_TIMEOUT = 40000, DAY = 86400000, QMAX = 60, RES_MAX = 80, CACHE_MAX = 600, TTL = { 'search-video': 3 * DAY, 'search-playlist': 3 * DAY, playlist: 7 * DAY, video: 7 * DAY };
let S = null, timer = 0;
const inFlight = new Set();                                             // reqIds being asked directly by THIS run of the worker (S.running outlives a stopped worker; this doesn't)
const VERSION = ext.runtime.getManifest().version;
async function load() { if (!S) { const g = await ext.storage.local.get('ytState'); S = g.ytState || { queue: [], cur: null, state: 'idle', nextAt: 0, reason: '', heldTab: 0, crateTab: 0 }; } if (!Array.isArray(S.running)) S.running = []; return S; }
const save = () => ext.storage.local.set({ ytState: S });
const settings = async () => (await ext.storage.local.get('settings')).settings || {};
let lock = Promise.resolve();                                           // the read-change-write steps on storage take turns, now that several answers can arrive at once
const locked = (fn) => { const p = lock.then(fn); lock = p.catch(() => {}); return p; };
function push(msg) { if (S && S.crateTab) ext.tabs.sendMessage(S.crateTab, msg).catch(() => {}); }
const waitingCount = () => S.queue.length + S.running.length + (S.cur ? 1 : 0);
const statePush = () => push({ type: 'yt-state', state: S.state, reason: S.reason, queue: waitingCount(), nextAt: S.nextAt || 0 });
function setState() { if (S.state !== 'stopped') S.state = S.cur || S.running.length ? 'loading' : S.queue.length ? 'gap' : 'idle'; }
const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(tick, Math.max(50, ms)); };
async function closeTab(id) { if (id) { try { await ext.tabs.remove(id); } catch (e) { /* already closed */ } } }
async function today() { const g = await ext.storage.local.get('ytLog'); return (g.ytLog || []).filter(t => t > Date.now() - DAY).length; }
const logPage = () => locked(async () => { const g = await ext.storage.local.get('ytLog'), log = (g.ytLog || []).filter(t => t > Date.now() - DAY); log.push(Date.now()); await ext.storage.local.set({ ytLog: log }); });
const useFetch = async () => (await settings()).noFetch !== true && (((S && S.directMiss) || 0) < 2 || Date.now() - ((S && S.directMissAt) || 0) > DAY);          // direct reading switches itself off for a day once it has twice found nothing where a real page found something
async function parallel() {                                             // pages asked at once: only when asking directly
  if (!(await useFetch())) return 1;
  const n = Number((await settings()).parallel);
  return Math.min(PAR_MAX, Math.max(1, Number.isFinite(n) && n > 0 ? Math.round(n) : PAR_DEFAULT));
}
async function gap(mode) {                                           // 'fetch': the page was requested directly (quick); anything else: a tab was opened (slow)
  const s = await settings(), direct = mode === 'fetch';
  const lo = s.fast ? (Number(s.gapMin) || 200) : direct ? Math.max(FETCH_MIN, FETCH_LO) : Math.max(MIN_GAP, DEF_LO), hi = s.fast ? (Number(s.gapMax) || 400) : direct ? FETCH_HI : DEF_HI;
  const ms = Math.round(lo + Math.random() * (hi - lo));
  if (!direct) return ms;
  const par = await parallel();
  return par > 1 ? Math.max(PAR_MIN_GAP, Math.round(ms / par)) : ms;   // several at once: the starts are spread, not stopped
}
const putResult = (reqId, res) => locked(async () => {
  const g = await ext.storage.local.get('ytResults'), r = g.ytResults || {}; r[reqId] = Object.assign({ at: Date.now() }, res);
  const ks = Object.keys(r); if (ks.length > RES_MAX) ks.sort((a, b) => r[a].at - r[b].at).slice(0, ks.length - RES_MAX).forEach(k => delete r[k]);
  await ext.storage.local.set({ ytResults: r }); push(Object.assign({ type: 'yt-result', reqId }, res));
});
async function cacheGet(op) { const g = await ext.storage.local.get('ytCache'), c = (g.ytCache || {})[Y.cacheKey(op)]; return c && Array.isArray(c.items) && c.items.length && Date.now() - c.at < TTL[op.kind] ? c.items : null; }          // an empty answer is never served from memory (1.1.0 remembered them, wrongly, for days)
const cachePut = (op, items) => locked(async () => {
  if (!Array.isArray(items) || !items.length) return;                  // nothing found is not remembered: it may be a page that couldn't be read, and asking again is cheap
  const g = await ext.storage.local.get('ytCache'), c = g.ytCache || {}; c[Y.cacheKey(op)] = { at: Date.now(), items };
  const ks = Object.keys(c); if (ks.length > CACHE_MAX) ks.sort((a, b) => c[a].at - c[b].at).slice(0, ks.length - CACHE_MAX).forEach(k => delete c[k]);
  await ext.storage.local.set({ ytCache: c });
});
const urlFor = (op) => op.kind === 'playlist' ? Y.playlistUrl(op.id) : op.kind === 'video' ? Y.videoUrl(op.id) : Y.searchUrl(op.q, op.kind === 'search-playlist' ? 'playlist' : 'video');
async function tick() {                                                 // decides what is due; safe to call at any time, as often as you like
  await load(); const now = Date.now();
  const lost = S.running.filter(j => !inFlight.has(j.reqId));           // asked directly by a worker that was stopped since: ask again
  if (lost.length) { S.running = S.running.filter(j => inFlight.has(j.reqId)); S.queue.unshift(...lost.map(j => ({ reqId: j.reqId, op: j.op }))); }
  if (S.state === 'stopped') { await save(); return; }
  if (S.cur) {                                                          // a page open in a tab (one at a time, with nothing else running)
    if (now > S.cur.deadline) await stop('timeout'); else { await save(); schedule(3000); }
    return;
  }
  const par = await parallel(), direct = await useFetch();
  for (;;) {
    const g = await gap('fetch');                                       // worked out first: from here to startFetch nothing waits, so two ticks running at once can't both start a page
    if (!S.queue.length || S.running.length >= par || S.cur || S.state === 'stopped') break;
    if (Date.now() < S.nextAt) { schedule(S.nextAt - Date.now()); break; }
    const job = S.queue[0];
    if (job.needsTab || !direct) {                                      // a real page: only when nothing else is being asked
      if (S.running.length) break;
      S.queue.shift(); await openTab(job); return;
    }
    S.queue.shift(); S.nextAt = Date.now() + g; startFetch(job);
  }
  if (S.queue.length && S.running.length < par && Date.now() < S.nextAt) schedule(S.nextAt - Date.now());
  setState(); await save(); statePush();
}
function startFetch(job) {                                              // one page asked directly; its answer comes back while others are asked
  const url = urlFor(job.op);
  if (!Y.urlOk(url)) { putResult(job.reqId, { ok: false, reason: 'bad' }); return; }
  S.running.push({ reqId: job.reqId, op: job.op }); inFlight.add(job.reqId); logPage();
  (async () => {
    let r; try { r = await fetchRead(url, job.op); } catch (e) { r = { fallback: true }; }
    inFlight.delete(job.reqId); await load();
    const i = S.running.findIndex(j => j.reqId === job.reqId);
    if (i < 0) return;                                                  // cancelled while it was being asked
    S.running.splice(i, 1);
    if (await parallel() === 1) S.nextAt = Math.max(S.nextAt, Date.now() + await gap('fetch'));          // one at a time: the pause runs from the end of a page, as before 1.3.0
    if (r.ok) { await cachePut(job.op, r.items); await putResult(job.reqId, { ok: true, items: r.items }); }
    else if (r.reason) {                                                 // show the page that asked, in front of you, to pass
      if (S.cur || S.state === 'stopped') S.queue.unshift({ reqId: job.reqId, op: job.op });
      else { const tab = await ext.tabs.create({ url, active: false }); S.cur = { reqId: job.reqId, op: job.op, tabId: tab.id }; await stop(r.reason); return; }
    }
    else S.queue.unshift({ reqId: job.reqId, op: job.op, needsTab: true });   // couldn't be read directly: a real page will do it
    setState(); await save(); statePush(); schedule(50);
  })();
}
async function openTab(job) {
  const url = urlFor(job.op);
  if (!Y.urlOk(url)) { await putResult(job.reqId, { ok: false, reason: 'bad' }); schedule(50); return; }
  S.cur = { reqId: job.reqId, op: job.op, tabId: 0, deadline: Date.now() + LOAD_TIMEOUT, fellBack: !!job.needsTab }; setState(); await save(); statePush();
  await logPage();
  const tab = await ext.tabs.create({ url, active: false }); S.cur.tabId = tab.id; await save(); schedule(3000);
}
async function fetchRead(url, op) {                                    // the page requested directly. { ok, items } | { reason } (a cookie question, a check) | { fallback: true } (couldn't be read this way)
  let res, html;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
    try { res = await fetch(url, { credentials: 'include', redirect: 'follow', signal: ctl.signal }); html = await res.text(); } finally { clearTimeout(t); }
  } catch (e) { return { fallback: true }; }
  if (res.status === 429 || res.status === 403) return { reason: 'check' };
  const data = Y.extractInitialData(html), player = op.kind === 'video' ? Y.extractInitialData(html, 'ytInitialPlayerResponse') : null, title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
  const has = !!(data || player);
  const text = has ? '' : html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').slice(0, 800);
  const reason = Y.pageReason({ url: res.url || url, title: has ? '' : title, text });
  if (reason) return { reason };
  if (!has) return { fallback: true };                                 // not the data we expect: let a real page try
  const items = op.kind === 'video' ? Y.videoInfoFrom(data, player) : op.kind === 'playlist' ? Y.playlistVideosFrom(data) : op.kind === 'search-playlist' ? Y.playlistsFrom(data) : Y.videosFrom(data);
  if (!items.length) return { fallback: true };                         // the data was there but nothing was read from it: a real page (which also reads what is on screen) decides whether there really is nothing
  return { ok: true, items: items.slice(0, 100) };
}
async function stop(reason) {                                           // the question that hit the problem goes back to the front of the queue; nothing after it is started
  const cur = S.cur; S.state = 'stopped'; S.reason = reason; S.cur = null;
  if (cur) { S.queue.unshift({ reqId: cur.reqId, op: cur.op }); S.heldTab = cur.tabId; try { await ext.tabs.update(cur.tabId, { active: true }); const t = await ext.tabs.get(cur.tabId); if (t && t.windowId) await ext.windows.update(t.windowId, { focused: true }); } catch (e) { /* gone */ } }
  await save(); statePush();
}
async function onDone(tabId, msg) {
  await load(); if (!S.cur || S.cur.tabId !== tabId || S.state === 'stopped') return;
  if (!msg || !msg.ok) { await stop((msg && msg.reason) || 'unreadable'); return; }
  const cur = S.cur, items = Array.isArray(msg.items) ? msg.items.slice(0, 100) : [];
  if (cur.fellBack && items.length) { S.directMiss = (S.directMiss || 0) + 1; S.directMissAt = Date.now(); }          // a real page found what the direct reading didn't
  await cachePut(cur.op, items); await putResult(cur.reqId, { ok: true, items });
  S.cur = null; await closeTab(tabId);
  S.nextAt = Date.now() + await gap('tab'); setState(); await save(); statePush(); if (S.queue.length) schedule(S.nextAt - Date.now());
}
async function request(sender, msg) {
  await load(); const op = Y.validOp(msg.op), reqId = String(msg.reqId || '').slice(0, 40);
  if (!op || !reqId) return { ok: false, reason: 'bad' };
  if (sender.tab) S.crateTab = sender.tab.id;
  const hit = await cacheGet(op); if (hit) { await putResult(reqId, { ok: true, items: hit, cached: true }); await save(); return { ok: true, cached: true }; }
  const waiting = waitingCount();
  if (waiting >= QMAX) return { ok: false, reason: 'busy' };
  S.queue.push({ reqId, op }); await save(); statePush(); schedule(50); return { ok: true, queued: waiting + 1 };
}
async function resume() {                                               // after a stop: close the page that was left open and try that question again, then the rest
  await load(); if (S.state !== 'stopped') return { ok: false, reason: 'nothing' };
  if (S.heldTab) { await closeTab(S.heldTab); S.heldTab = 0; }
  S.state = 'gap'; S.reason = ''; S.nextAt = Date.now() + Math.min(await gap(await useFetch() ? 'fetch' : 'tab'), 3000); setState(); await save(); statePush(); schedule(S.nextAt - Date.now()); return { ok: true, resumed: S.queue.length };
}
async function cancel() {
  await load(); const all = (S.cur ? [S.cur] : []).concat(S.running, S.queue);
  for (const j of all) await putResult(j.reqId, { ok: false, reason: 'cancelled' });
  if (S.cur) await closeTab(S.cur.tabId); if (S.heldTab) await closeTab(S.heldTab);
  S.queue = []; S.running = []; S.cur = null; S.heldTab = 0; S.state = 'idle'; S.reason = ''; clearTimeout(timer); await save(); statePush(); return { ok: true, cancelled: all.length };
}
async function isCrateTab(tab, url) {                                  // the tab is your connected CRATE page (the only page that may ask to hear itself)
  const o = (await settings()).connectedOrigin; if (!o || !tab) return false;
  try { return new URL(url || tab.url || '').origin === o; } catch (e) { return false; }
}
const OFF = 'offscreen.html';
async function offscreenUp() { try { if (ext.offscreen.hasDocument) return await ext.offscreen.hasDocument(); const c = await ext.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }); return c.length > 0; } catch (e) { return false; } }
const toOffscreen = (type, extra) => ext.runtime.sendMessage(Object.assign({ target: 'crate-offscreen', type }, extra || {})).catch(() => null);
async function audioStart(tabId, streamId) {                             // (1.5.1) the capture lives in the add-on's hidden page, which plays the sound out (Chrome mutes a captured tab, and anything played inside it)
  if (!(await offscreenUp())) await ext.offscreen.createDocument({ url: OFF, reasons: ['USER_MEDIA'], justification: 'Plays the CRATE tab\'s sound while it is captured for CRATE\'s visualizer.' });
  const r = await toOffscreen('start', { streamId, tabId });
  return r && r.ok ? { ok: true } : { ok: false, reason: (r && r.reason) || 'failed', detail: r && r.detail };
}
async function audioStop() { if (await offscreenUp()) { await toOffscreen('stop'); try { await ext.offscreen.closeDocument(); } catch (e) { /* already closed */ } } return { ok: true }; }
async function audioFor(tab, url) {                                     // (1.5.0) the CRATE tab asks to hear itself. { ok } | { ok: false, reason }
  if (!ext.tabCapture || !ext.tabCapture.getMediaStreamId || !ext.offscreen) return { ok: false, reason: 'unsupported' };
  if (!(await isCrateTab(tab, url))) return { ok: false, reason: 'notcrate' };
  if (await offscreenUp()) { const st = await toOffscreen('status'); if (st && st.tabId === tab.id) return { ok: true }; }          // already listening to it (CRATE was reloaded, say)
  try { const streamId = await ext.tabCapture.getMediaStreamId({ targetTabId: tab.id }); if (!streamId) return { ok: false, reason: 'failed' }; return await audioStart(tab.id, streamId); }
  catch (e) {
    const m = String((e && e.message) || e);
    return { ok: false, reason: /active stream/i.test(m) ? 'busy' : /invoked|activeTab|permission/i.test(m) ? 'invoke' : 'failed', detail: m.slice(0, 200) };
  }
}
ext.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg.type !== 'string') return false;
  if (msg.type === 'yt-audio') { audioFor(sender.tab, sender.url).then(reply); return true; }
  if (msg.target === 'crate-offscreen') return false;                    // for the hidden page, not for here
  if (msg.type === 'yt-audio-stop') { (async () => reply(await isCrateTab(sender.tab, sender.url) ? await audioStop() : { ok: false }))(); return true; }
  if (msg.type === 'yt-audio-popup') {                                   // the toolbar button's "Let CRATE hear this tab": the popup made the stream id (that click is what Chrome may want)
    (async () => { let tab = null; try { tab = await ext.tabs.get(Number(msg.tabId)); } catch (e) { /* gone */ }
      if (!sender.url || !sender.url.startsWith(ext.runtime.getURL('popup.html')) || !(await isCrateTab(tab))) { reply({ ok: false, reason: 'notcrate' }); return; }
      reply(await audioStart(tab.id, String(msg.streamId || ''))); })();
    return true;
  }
  (async () => {
    await load();
    if (msg.type === 'yt-hello') reply({ ok: true, version: VERSION, state: S.state, today: await today(), cap: 0, direct: await useFetch(), parallel: await parallel() });          // cap 0 = no daily limit (CRATE shows just the count)
    else if (msg.type === 'yt-request') reply(await request(sender, msg));
    else if (msg.type === 'yt-get') { const g = await ext.storage.local.get('ytResults'); reply({ ok: true, result: (g.ytResults || {})[String(msg.reqId || '')] || null }); }
    else if (msg.type === 'yt-cancel') reply(await cancel());
    else if (msg.type === 'yt-continue') reply(await resume());
    else if (msg.type === 'yt-ping') { await tick(); statePush(); reply({ ok: true }); }
    else if (msg.type === 'yt-tab?') reply({ job: !!(S.cur && sender.tab && S.cur.tabId === sender.tab.id && S.state !== 'stopped'), op: S.cur ? S.cur.op : null });
    else if (msg.type === 'yt-done') { await onDone(sender.tab && sender.tab.id, msg); reply({ ok: true }); }
    else reply({ ok: false });
  })();
  return true;
});
ext.commands && ext.commands.onCommand.addListener(async (cmd, tab) => {          // (1.5.1) the shortcut (Alt+Shift+V unless you change it): the same as the toolbar button's "Let CRATE hear this tab"
  if (cmd !== 'crate-listen' || !tab || !(await isCrateTab(tab))) return;
  try { const streamId = await ext.tabCapture.getMediaStreamId({ targetTabId: tab.id }); const r = await audioStart(tab.id, streamId); if (r.ok) ext.tabs.sendMessage(tab.id, { type: 'yt-audio-id' }).catch(() => {}); }
  catch (e) { /* already listening, or not allowed: the visualizer says what to do */ }
});
ext.tabs.onRemoved.addListener(async (tabId) => { await load(); if (S.cur && S.cur.tabId === tabId && S.state !== 'stopped') await stop('closed'); });          // you closed the page while it was being read
ext.runtime.onStartup && ext.runtime.onStartup.addListener(() => { tick(); });
tick();
