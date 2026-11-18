// (1.135.142) Recent and saved searches on every device. They were kept in this browser only; now they also go to the Settings tab of your
// sheet (a "Searches" entry, as Match songs' history does) a few seconds after they change, and come back from it with the crate. Each one
// carries when it was last searched or saved, so two devices merge rather than one overwriting the other: the newest 8 recent searches and
// the newest 20 saved ones, and a saved search taken away on one device goes on the others too.
// Needs the backend from 1.135.142 (it says so with searchSync); with an older one they stay on each device, as before.
const SRS_KEY = 'crate_search_sync_v1', SRS_DIRTY = 'crate_search_sync_dirty_v1';
let srsSheet = null, srsTimer = 0;
function srsGet() { try { const o = JSON.parse(localStorage.getItem(SRS_KEY) || '{}') || {}; return { recent: o.recent || {}, saved: o.saved || {} }; } catch (e) { return { recent: {}, saved: {} }; } }
function srsPut(o) { try { localStorage.setItem(SRS_KEY, JSON.stringify(o)); } catch (e) { /* this visit */ } }
// times for what's already in the lists (from before this version): their order kept
function srsSeed(o) {
  const now = Date.now();
  srchLs(SRCH_RECENT_KEY, []).forEach((q, i) => { if (!o.recent[q]) o.recent[q] = now - 1000 - i; });
  srchLs(SRCH_SAVED_KEY, []).forEach((q, i) => { if (!o.saved[q]) o.saved[q] = { t: now - 1000 - i }; });
  return o;
}
function srsLists(o) {                                               // the timed record -> the two lists the search box reads
  const rec = Object.entries(o.recent).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
  const sav = Object.entries(o.saved).filter(([, v]) => v && !v.gone).sort((a, b) => b[1].t - a[1].t).slice(0, 20).map(x => x[0]);
  srchLsSet(SRCH_RECENT_KEY, rec); srchLsSet(SRCH_SAVED_KEY, sav);
  // keep the record small: what's shown, and the "taken away" marks of the last 90 days
  const keepR = new Set(rec), cut = Date.now() - 90 * 864e5;
  Object.keys(o.recent).forEach(q => { if (!keepR.has(q)) delete o.recent[q]; });
  Object.keys(o.saved).forEach(q => { const v = o.saved[q]; if (!v || (v.gone && v.t < cut) || (!v.gone && !sav.includes(q))) delete o.saved[q]; });
  return o;
}
function srsWire(o) {                                                // as sent to the sheet
  return JSON.stringify({ v: 1, recent: Object.entries(o.recent).map(([q, t]) => ({ q, t })), saved: Object.entries(o.saved).map(([q, v]) => Object.assign({ q, t: v.t }, v.gone ? { gone: 1 } : {})) });
}
function srsChanged() {
  try { localStorage.setItem(SRS_DIRTY, '1'); } catch (e) { /* ignore */ }
  if (srsSheet === false) return;
  clearTimeout(srsTimer); srsTimer = setTimeout(srsSend, 3000);
}
function srsSend() {
  if (srsSheet === false || typeof postUpdate !== 'function') return;
  postUpdate({ action: 'saveSearches', searches: srsWire(srsGet()) })
    .then(r => { if (r && r.searchesSaved) { srsSheet = true; try { localStorage.removeItem(SRS_DIRTY); } catch (e) { /* ignore */ } } })
    .catch(() => { /* still marked to send: next time */ });
}
function srsArrived(data) {                                          // the crate's answer from the sheet
  if (!data || data.searchSync !== true) { srsSheet = false; return; }
  srsSheet = true;
  let theirs = {}; try { theirs = data.searches ? JSON.parse(data.searches) : {}; } catch (e) { theirs = {}; }
  const o = srsSeed(srsGet()), before = srsWire(o);
  (Array.isArray(theirs.recent) ? theirs.recent : []).forEach(x => { if (x && x.q && (x.t || 0) > (o.recent[x.q] || 0)) o.recent[x.q] = x.t; });
  (Array.isArray(theirs.saved) ? theirs.saved : []).forEach(x => { if (!x || !x.q) return; const h = o.saved[x.q]; if (!h || (x.t || 0) > (h.t || 0)) o.saved[x.q] = x.gone ? { t: x.t, gone: 1 } : { t: x.t }; });
  srsPut(srsLists(o));
  let dirty = false; try { dirty = localStorage.getItem(SRS_DIRTY) === '1'; } catch (e) { /* ignore */ }
  const mine = srsWire(srsGet()), sent = JSON.stringify({ v: 1, recent: theirs.recent || [], saved: theirs.saved || [] });
  if (dirty || (mine !== sent && mine !== before) || !data.searches) srsChanged();
  if (typeof ssRender === 'function') try { ssRender(); } catch (e) { /* the box redraws when opened */ }
}
(function () {
  const r = srchRemember;
  srchRemember = function (q) { r.apply(this, arguments); q = String(q || '').trim(); if (q.length < 2) return; const o = srsSeed(srsGet()); o.recent[q] = Date.now(); srsPut(srsLists(o)); srsChanged(); };
  const s = srchSave;
  srchSave = function () { const q = el.searchInput.value.trim(); s.apply(this, arguments); if (!q) return; const o = srsSeed(srsGet()); o.saved[q] = { t: Date.now() }; srsPut(srsLists(o)); srsChanged(); };
  const u = srchUnsave;
  srchUnsave = function (q) { const o = srsSeed(srsGet()); u.apply(this, arguments); o.saved[q] = { t: Date.now(), gone: 1 }; srsPut(srsLists(o)); srsChanged(); };
  const a = bmHistArrived;
  bmHistArrived = function (data) { a.apply(this, arguments); try { srsArrived(data); } catch (e) { /* searches stay as they are */ } };
})();
