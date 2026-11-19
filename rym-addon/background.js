/* CRATE · RYM add-on — background. When CRATE asks it to ("Update from Rate Your Music" on a release, or on a selection), this loads the Rate Your Music release pages ONE AT A TIME,
   lets the page read itself (content-release.js does that, exactly as when you press "Update CRATE from this page"), waits a while, and loads the next.
   WHERE (1.20.0): in an invisible frame in the add-on's own hidden page (fetcher.html, an "offscreen document"), so no tab opens. Only when Rate Your Music answers there with a
   check ("Just a moment…"), or the frame can't read the page, is that page opened in a background tab instead, the way every page was before; after a check the rest of the run
   uses tabs too (so Rate Your Music isn't asked twice for each page). A browser without offscreen documents (Firefox), or the "fetchInTabs" setting, uses tabs throughout.
   The frame can show Rate Your Music's page because, for frames in no tab (only the add-on's hidden page has those), a session rule removes the headers that forbid framing.
   It is made to be slow and to stop: a pause of 8-15 seconds between pages (never less than 6 seconds), at most 25 pages in a run (and no limit on how many runs you start in a day), and it STOPS at the first page that asks for a
   check ("Just a moment…", a captcha) or fails, leaving that page in front of you. Nothing is applied to CRATE by this: the pages' details arrive as waiting updates, like any you sent yourself.
   The run's state is kept in storage and every step is idempotent, because a service worker can be stopped at any time; CRATE's page pings it while a run is on, which wakes it. */
'use strict';
try { importScripts('core.js'); } catch (e) { /* not needed: the checks below are self-contained */ }
const ext = chrome;
const MIN_GAP = 6000, MAX_GAP = 60000, DEF_LO = 8000, DEF_HI = 15000, CAP_JOB = 25, LOAD_TIMEOUT = 40000;
const URL_OK = /^https:\/\/(?:www\.)?rateyourmusic\.com\/release\/[a-z0-9_-]+\/[^\/?#]+\/[^\/?#]+\/$/i;
let job = null, timer = 0;
const FRAME_RULE = 4711;                                       // the session rule that lets the hidden page frame Rate Your Music (see frameOn)
const pagePath = (u) => { try { return new URL(String(u || '')).pathname.replace(/\/*$/, '/').toLowerCase(); } catch (e) { return ''; } };
const canFrame = () => !!(ext.offscreen && ext.offscreen.createDocument && ext.declarativeNetRequest && ext.declarativeNetRequest.updateSessionRules);
async function frameOn() {                                     // -> true when the hidden page was only just made (it then asks for its page itself: see 'fetcher-ready')
  await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: [FRAME_RULE], addRules: [{ id: FRAME_RULE, priority: 1,
    action: { type: 'modifyHeaders', responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }, { header: 'content-security-policy', operation: 'remove' }] },
    condition: { requestDomains: ['rateyourmusic.com'], resourceTypes: ['sub_frame'], tabIds: [ext.tabs.TAB_ID_NONE] } }] });
  let has = false; try { has = !!(ext.runtime.getContexts && (await ext.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length); } catch (e) { /* older browser: try to make it */ }
  if (has) return false;
  try { await ext.offscreen.createDocument({ url: 'fetcher.html', reasons: ['DOM_SCRAPING'], justification: 'Reads Rate Your Music release pages for CRATE without opening tabs.' }); return true; }
  catch (e) { if (/single offscreen|already/i.test(String(e && e.message))) return false; throw e; }
}
async function frameSay(type, url) { try { await ext.runtime.sendMessage({ target: 'crate-fetcher', type, url: url || '' }); } catch (e) { /* the hidden page isn't there (yet) */ } }
async function frameOff() {                                    // the run is over: no hidden page, no rule
  try { await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: [FRAME_RULE] }); } catch (e) { /* none */ }
  try { if (ext.offscreen && ext.offscreen.closeDocument) await ext.offscreen.closeDocument(); } catch (e) { /* none open */ }
}
function toTab(it, checked) {                                  // the frame couldn't read this page: it goes to a tab next, after a short pause
  it.inTab = true; if (checked) job.mode = 'tab';
  frameSay('clear'); job.state = 'gap'; job.via = ''; job.nextAt = Date.now() + 1500;
}

function cleanUrl(u) {                                         // an https Rate Your Music release page, without query or fragment, ending in a slash: or ''
  try { const x = new URL(String(u || '').trim()); const out = x.origin + x.pathname.replace(/\/*$/, '/'); return URL_OK.test(out) ? out : ''; } catch (e) { return ''; }
}
const active = () => !!job && (job.state === 'starting' || job.state === 'loading' || job.state === 'gap');
async function loadJob() { if (!job) { const g = await ext.storage.local.get('fetchJob'); job = g.fetchJob || null; } return job; }
const saveJob = () => ext.storage.local.set({ fetchJob: job });
function progress() {
  if (!job || !job.crateTab) return;
  const cur = job.items[job.i];
  ext.tabs.sendMessage(job.crateTab, { type: 'fetch-progress', notFound: job.notFound || [], finding: !!(cur && cur.search), jobId: job.id, state: job.state, total: job.items.length, done: job.done, ok: job.ok, skipped: job.skipped, reason: job.reason || '', current: cur ? cur.url : '', nextAt: job.nextAt || 0, i: job.i, items: job.items.map(x => x.state) }).catch(() => {});          // (i: the page being read, or next; items: how each page went)
}
const gap = () => Math.round(job.lo + Math.random() * (job.hi - job.lo));
function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, Math.max(50, ms)); }
async function closeTab(id) { if (id) { try { await ext.tabs.remove(id); } catch (e) { /* already closed */ } } }

async function tick() {                                        // decides what is due; safe to call at any time and as often as you like
  await loadJob(); if (!active()) return;
  const now = Date.now();
  if (job.state === 'loading') {
    if (now > job.deadline) { if (job.via === 'frame') { toTab(job.items[job.i], false); await saveJob(); progress(); schedule(1500); } else await stop('timeout', false); }
    else schedule(Math.min(job.deadline - now + 100, 5000));
    return;
  }
  if (now < job.nextAt) { schedule(job.nextAt - now); return; }
  await openNext();
}
async function openNext() {
  if (job.i >= job.items.length) { job.state = 'done'; await saveJob(); progress(); frameOff(); return; }
  const it = job.items[job.i]; job.state = 'loading'; job.deadline = Date.now() + LOAD_TIMEOUT;
  if (job.mode === 'frame' && !it.inTab) {
    try {
      job.via = 'frame'; job.tabId = 0; await saveJob();
      const fresh = await frameOn(); if (!fresh) await frameSay('load', it.url);           // (a page just made asks for its page itself)
      progress(); schedule(5000); return;
    } catch (e) { job.mode = 'tab'; }                          // no hidden page in this browser: tabs, as before
  }
  job.via = 'tab';
  const tab = await ext.tabs.create({ url: it.url, active: false }); job.tabId = tab.id; await saveJob(); progress(); schedule(5000);
}
async function stop(reason, close) {                           // a failure ends the whole run: the next page is NOT tried
  job.state = 'stopped'; job.reason = reason; const id = job.tabId; job.tabId = 0; frameOff();
  if (id) {
    if (close) await closeTab(id);
    else { job.heldTab = id; try { await ext.tabs.update(id, { active: true }); const t = await ext.tabs.get(id); if (t && t.windowId) await ext.windows.update(t.windowId, { focused: true }); } catch (e) { /* gone */ } }     // a check to pass: put the page in front of you and leave it
  }
  await saveJob(); progress();
}
async function onDone(sender, msg) {
  await loadJob(); if (!job || job.state !== 'loading') return;
  const it = job.items[job.i], tabId = sender && sender.tab ? sender.tab.id : 0;
  const fromFrame = !tabId && job.via === 'frame' && pagePath(sender && sender.url) === pagePath(it.url);
  if (!fromFrame && (job.via !== 'tab' || !tabId || job.tabId !== tabId)) return;
  if (fromFrame) {
    frameSay('clear');
    if (!(msg && (msg.ok || msg.reason === 'missing'))) { toTab(it, !!(msg && msg.reason === 'challenge')); await saveJob(); progress(); schedule(1500); return; }   // a check, or unreadable here: this page in a tab
  }
  if (msg && msg.ok) { it.state = 'ok'; job.ok++; }
  else if (msg && msg.reason === 'missing' && it.alts && it.alts.length) {          // (1.27.0) no such page under this type: the next type, then the search
    it.url = it.alts.shift(); it.state = 'wait'; it.inTab = false; job.tabId = 0; job.via = ''; if (tabId) await closeTab(tabId);
    job.state = 'gap'; job.nextAt = Date.now() + Math.min(gap(), 4000); await saveJob(); progress(); schedule(job.nextAt - Date.now()); return;
  }
  else if (msg && msg.reason === 'missing' && it.fallback) {          // (1.25.0) the guessed page doesn't exist: RYM's search for it next, in its place
    const q = it.fallback; it.fallback = null; it.search = q; it.url = searchUrl(q); it.state = 'wait'; it.inTab = false; job.tabId = 0; job.via = ''; if (tabId) await closeTab(tabId);
    job.state = 'gap'; job.nextAt = Date.now() + Math.min(gap(), 4000); await saveJob(); progress(); schedule(job.nextAt - Date.now()); return;
  }
  else if (msg && msg.reason === 'missing') { it.state = 'missing'; job.skipped++; }               // a page that no longer exists is not a reason to stop
  else { await stop((msg && msg.reason) || 'unreadable', false); return; }                  // anything unexpected: the page is left OPEN and in front, so you can see what it is (it may be a check this doesn't recognise)
  job.done++; job.i++; job.tabId = 0; job.via = ''; if (tabId) await closeTab(tabId);
  if (job.i >= job.items.length) { job.state = 'done'; frameOff(); } else { job.state = 'gap'; job.nextAt = Date.now() + gap(); }
  await saveJob(); progress(); if (active()) schedule(job.nextAt - Date.now());
}
// ----- (1.23.0) finding a release that has no Rate Your Music link yet: its search page is read first, the best match picked, then its page -----
function searchUrl(q) { return 'https://rateyourmusic.com/search?searchtype=l&searchterm=' + encodeURIComponent((q.artist + ' ' + q.title).trim()); }
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim();
function pick(q, list) {
  const qa = fold(q.artist), qt = fold(q.title), qty = String(q.type || '').toLowerCase(); let best = null, bs = 0, tie = false;
  (list || []).forEach(r => {
    const as = Math.max(0, ...(r.artists || []).map(a => { const f = fold(a); return f === qa ? 2 : f && qa && (f.includes(qa) || qa.includes(f)) ? 1 : 0; }));
    const ft = fold(r.title), ts = ft === qt ? 3 : ft && qt && (ft.includes(qt) || qt.includes(ft)) ? 1.5 : 0;
    if (!ts || (r.artists && r.artists.length && !as)) return;
    const s = ts + as + (qty && r.type === qty ? 0.5 : 0) + (q.year && r.year === q.year ? 0.5 : 0);
    if (s > bs) { bs = s; best = r; tie = false; } else if (s === bs && best && r.href !== best.href) tie = true;
  });
  return bs >= 3 && !tie ? best : null;          // (1.26.0) two equally good answers (artists who share a name, and the same title): skipped, not guessed
}
async function onFound(sender, msg) {
  await loadJob(); if (!job || job.state !== 'loading') return;
  const it = job.items[job.i]; if (!it || !it.search) return;
  const tabId = sender && sender.tab ? sender.tab.id : 0, fromFrame = !tabId && job.via === 'frame' && pagePath(sender && sender.url) === pagePath(it.url);
  if (!fromFrame && (job.via !== 'tab' || !tabId || job.tabId !== tabId)) return;
  if (fromFrame) frameSay('clear');
  if (!(msg && msg.ok)) { if (fromFrame) { toTab(it, !!(msg && msg.reason === 'challenge')); await saveJob(); progress(); schedule(1500); return; } await stop((msg && msg.reason) || 'unreadable', false); return; }
  if (tabId) await closeTab(tabId);
  const r = pick(it.search, msg.results), url = r ? cleanUrl('https://rateyourmusic.com' + r.href) : '';
  job.tabId = 0; job.via = '';
  if (url) { it.url = url; it.found = it.search; it.search = null; it.inTab = false; job.state = 'gap'; job.nextAt = Date.now() + gap(); }          // its page next, after the usual pause
  else { it.state = 'notfound'; job.skipped++; job.done++; job.i++; (job.notFound = job.notFound || []).push(it.id); if (job.i >= job.items.length) { job.state = 'done'; frameOff(); } else { job.state = 'gap'; job.nextAt = Date.now() + gap(); } }
  await saveJob(); progress(); if (active()) schedule(job.nextAt - Date.now());
}
async function start(sender, msg) {
  await loadJob(); if (active()) return { ok: false, reason: 'busy' };
  const g = await ext.storage.local.get('settings'), st = g.settings || {}; ext.storage.local.remove('fetchLog');          // (an older version kept a day-by-day count here for a daily limit there no longer is)
  const items = [], seen = new Set();
  for (const x of (Array.isArray(msg.items) ? msg.items : [])) {
    let url = cleanUrl(x && x.url), search = null;
    // (1.25.0) a guessed address with its search behind it: the guess is read first, and if RYM has no such page, its search
    let fallback = null; if (url && x && x.search && x.search.artist && x.search.title) fallback = { artist: String(x.search.artist), title: String(x.search.title), type: String(x.search.type || ''), year: String(x.search.year || '') };
    if (!url && x && x.search && x.search.artist && x.search.title) { search = { artist: String(x.search.artist), title: String(x.search.title), type: String(x.search.type || ''), year: String(x.search.year || '') }; url = searchUrl(search); }          // (1.23.0) no link yet: found first
    if (!url || seen.has(url)) continue; seen.add(url); const alts = url && Array.isArray(x && x.alts) ? x.alts.slice(0, 4).map(cleanUrl).filter(u => u && u !== url) : [];          // (1.27.0) the same release under other types
    items.push({ id: String((x && x.id) || ''), url, alts, search, fallback, state: 'wait' }); if (items.length >= CAP_JOB) break;
  }
  if (!items.length) return { ok: false, reason: 'nothing' };
  let lo = Number(msg.opts && msg.opts.gapMin) || DEF_LO, hi = Number(msg.opts && msg.opts.gapMax) || DEF_HI;
  if (st.fetchFast !== true) { lo = Math.max(MIN_GAP, Math.min(lo, MAX_GAP)); hi = Math.max(lo, Math.min(hi, MAX_GAP)); } else { lo = Math.max(0, lo); hi = Math.max(lo, hi); }       // the floor is only lifted by a setting no page can set
  job = { id: 'f' + Date.now(), crateTab: sender && sender.tab ? sender.tab.id : 0, items, i: 0, ok: 0, skipped: 0, done: 0, state: 'starting', nextAt: Date.now(), tabId: 0, deadline: 0, lo, hi, reason: '',
    mode: canFrame() && st.fetchInTabs !== true ? 'frame' : 'tab', via: '' };          // mode: 'frame' (no tabs, see the top) or 'tab'
  await saveJob(); progress(); schedule(0);
  return { ok: true, accepted: items.length, lo, hi, cap: CAP_JOB, finds: true };
}
async function resume() {                                     // carry on after a stop (a check passed, a page that was slow): the page that failed is tried again, then the rest
  await loadJob(); if (!job || job.state !== 'stopped' || !['challenge', 'timeout', 'unreadable', 'closed'].includes(job.reason)) return { ok: false, reason: 'nothing' };
  if (job.heldTab) { await closeTab(job.heldTab); job.heldTab = 0; }
  job.state = 'starting'; job.reason = ''; job.nextAt = Date.now() + (job.i > 0 ? gap() : 0); job.tabId = 0; await saveJob(); progress(); schedule(Math.max(0, job.nextAt - Date.now()));
  return { ok: true, resumed: job.items.length - job.i };
}
async function cancel() {
  await loadJob(); if (!job || !active()) return { ok: true, was: job ? job.state : 'none' };
  const id = job.tabId; job.state = 'cancelled'; job.tabId = 0; clearTimeout(timer); await closeTab(id); frameOff(); await saveJob(); progress(); return { ok: true, was: 'cancelled' };
}

ext.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg.type !== 'string') return false;
  (async () => {
    if (msg.type === 'fetch-start') reply(await start(sender, msg));
    else if (msg.type === 'fetch-cancel') reply(await cancel());
    else if (msg.type === 'fetch-continue') reply(await resume());
    else if (msg.type === 'fetch-status') { await loadJob(); reply(job ? { ok: true, state: job.state, done: job.done, total: job.items.length, reason: job.reason } : { ok: true, state: 'none' }); }
    else if (msg.type === 'fetch-ping') { await tick(); reply({ ok: true }); }
    else if (msg.type === 'fetch-tab?') {                       // a release page asks whether it is one this run is reading: in its tab, or in the hidden page's frame (no tab)
      await loadJob(); const it = job && job.state === 'loading' ? job.items[job.i] : null;
      reply({ fetch: !!it && ((job.via === 'tab' && !!sender.tab && job.tabId === sender.tab.id) || (job.via === 'frame' && !sender.tab && pagePath(sender.url) === pagePath(it.url))) });
    }
    else if (msg.type === 'fetch-done') { await onDone(sender, msg); reply({ ok: true }); }
    else if (msg.type === 'fetch-found') { await onFound(sender, msg); reply({ ok: true }); }
    else if (msg.type === 'fetcher-ready') { await loadJob(); const it = job && job.state === 'loading' && job.via === 'frame' ? job.items[job.i] : null; reply({ url: it ? it.url : '' }); }   // the hidden page, just made: which page to load
    else reply({ ok: false });
  })();
  return true;                                                  // answered asynchronously
});
ext.runtime.onStartup && ext.runtime.onStartup.addListener(() => { tick(); });
ext.tabs.onRemoved.addListener(async (tabId) => {              // you closed the page yourself while it was being read: that is a cancel, not a failure to retry
  await loadJob(); if (job && job.state === 'loading' && job.tabId === tabId) { job.tabId = 0; await stop('closed', false); }
});
tick();
