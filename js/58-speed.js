// CRATE — (1.135.3) SPEED CHECK. ⚙ → Settings → Speed check… turns it on (this browser only) and reloads. While it's on, CRATE times its
// own work on the device itself, which is the only way to see what makes it slow on a particular phone:
//  - every one of CRATE's functions: how often it ran and how long it took, its own time apart from what it called (self time);
//  - each tap: from lifting the finger to the screen being able to change, and what ran in between;
//  - stalls: moments the page couldn't respond for 150 ms or more, and what was running;
//  - the start: when the page's files had arrived, when the crate first showed, when the sheet answered.
// A ⏱ button (bottom left) opens the report: Copy puts it on the clipboard to paste into a message. Turn off ends it and reloads.
// Off (the normal case) this file does nothing at all.
const SPEED_KEY = 'crate_speed_v1';
function speedOn() { try { return localStorage.getItem(SPEED_KEY) === '1'; } catch (e) { return false; } }
function speedSet(on) { try { if (on) localStorage.setItem(SPEED_KEY, '1'); else localStorage.removeItem(SPEED_KEY); } catch (e) { /* private window */ } location.reload(); }

const speed = { t0: performance.now(), stats: new Map(), stack: [], calls: [], taps: [], stalls: [], marks: {}, tap: null };
(function speedInit() {
  if (!speedOn()) return;
  const now = () => performance.now();
  speed.marks.scriptsLoaded = Math.round(speed.t0);
  // Tiny helpers called tens of thousands of times: timing them would cost more than they do.
  const SKIP = new Set(['escapeHtml', 'artKey', 'pbFold', 'cssEscape', 'formatMs', 'formatDuration', 'speedOn', 'speedSet', 'speedInit', 'speedReport', 'speedPanel', 'socInitials', 'socHue', 'dateVal', 'labelKey', 'genreTaxonomyKey', 'normKey', 'rymNum', 'rymVotesNum']);
  const wrapped = new WeakMap();
  const wrap = (name, fn) => {
    const w = function () {
      const st = { name, child: 0 }, s = now(); speed.stack.push(st);
      try { return new.target ? Reflect.construct(fn, arguments, new.target) : fn.apply(this, arguments); }
      finally {
        const d = now() - s; speed.stack.pop();
        const parent = speed.stack[speed.stack.length - 1]; if (parent) parent.child += d;
        let r = speed.stats.get(name); if (!r) { r = { n: 0, self: 0, max: 0 }; speed.stats.set(name, r); }
        r.n++; r.self += d - st.child; if (d > r.max) r.max = d;
        if (!parent && d >= 4) { speed.calls.push({ name, s, e: s + d }); if (speed.calls.length > 4000) speed.calls.splice(0, 1000); }
        if (speed.tap && !parent) speed.tap.ran[name] = (speed.tap.ran[name] || 0) + d;
      }
    };
    wrapped.set(w, fn);
    try { Object.defineProperty(w, 'name', { value: name }); } catch (e) { /* fine */ }
    return w;
  };
  let n = 0;
  Object.keys(window).forEach(k => {
    if (SKIP.has(k)) return;
    let fn; try { fn = window[k]; } catch (e) { return; }
    if (typeof fn !== 'function' || fn.prototype && Object.getOwnPropertyNames(fn.prototype).length > 1) return;
    let src = ''; try { src = Function.prototype.toString.call(fn); } catch (e) { return; }
    if (/\[native code\]/.test(src) || /^class\b/.test(src) || Object.keys(fn).length) return;
    try { window[k] = wrap(k, fn); n++; } catch (e) { /* read-only */ }
  });
  speed.marks.wrapped = n;
  // A listener added with the plain function before this ran, taken off later by name (now the timed copy): take off either.
  const rm = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener = function (type, fn, opts) { rm.call(this, type, fn, opts); const o = fn && wrapped.get(fn); if (o) rm.call(this, type, o, opts); };
  // Firsts: the crate on screen, the sheet's answer.
  const first = (name, mark) => { const f = window[name]; if (typeof f !== 'function') return; window[name] = function () { const r = f.apply(this, arguments); const done = () => { if (!speed.marks[mark]) speed.marks[mark] = Math.round(now()); }; if (r && typeof r.then === 'function') r.then(done, done); else done(); return r; }; };
  first('renderGrid', 'firstGrid'); first('fetchCatalogOnce', 'firstCatalog');
  // Taps: lifting the finger → the next moment the screen can change.
  const describe = (t) => { let e = t && t.nodeType === 1 ? t : t && t.parentElement; for (let i = 0; e && i < 4; i++, e = e.parentElement) { if (e.id) return '#' + e.id; if (e.matches && e.matches('button, a, [role="button"], .card, .left-row, .nav-tab, .tr, tr')) return (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + (e.textContent ? ' "' + e.textContent.trim().slice(0, 24) + '"' : ''); } return t && t.tagName ? t.tagName.toLowerCase() : '?'; };
  document.addEventListener('pointerup', (e) => {
    if (e.target && e.target.closest && e.target.closest('#speedPanel, #speedBtn')) return;
    const tap = { at: now(), what: describe(e.target), ran: {} }; speed.tap = tap;
    requestAnimationFrame(() => setTimeout(() => { tap.ms = Math.round(now() - tap.at); if (speed.tap === tap) speed.tap = null; speed.taps.push(tap); if (speed.taps.length > 300) speed.taps.shift(); }, 0));
  }, true);
  // Stalls: a 50 ms tick that came late.
  let last = now();
  setInterval(() => { const t = now(), gap = t - last - 50; last = t; if (gap >= 150) { const s = t - gap - 50, ran = {}; speed.calls.forEach(c => { if (c.e > s && c.s < t) ran[c.name] = (ran[c.name] || 0) + Math.min(c.e, t) - Math.max(c.s, s); }); speed.stalls.push({ at: Math.round(s), ms: Math.round(gap), ran }); if (speed.stalls.length > 300) speed.stalls.shift(); } }, 50);
  window.addEventListener('load', () => setTimeout(() => { speedButton(); }, 500));
})();

function speedTop(obj, k) { return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k || 4).map(([n, v]) => `${n} ${Math.round(v)}`).join(', '); }
function speedReport() {
  const m = speed.marks, res = performance.getEntriesByType('resource').filter(r => /\.js|\.css/.test(r.name));
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const lines = [];
  lines.push(`CRATE speed check · ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'} · ${new Date().toISOString().slice(0, 16)} · up ${Math.round(performance.now() / 1000)} s`);
  lines.push(`Device: ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 140)} · screen ${screen.width}×${screen.height} · ${navigator.hardwareConcurrency || '?'} cores`);
  lines.push(`Crate: ${(state.raw || []).length} releases · ${(state.diary || []).length} diary · ${(state.scrobbles || []).length} scrobbles · ${(state.playlists || []).length} playlists · ${document.getElementsByTagName('*').length} elements on the page`);
  lines.push(`Start (ms): page answered ${Math.round(nav.responseEnd || 0)} · files ${res.length} (${Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024)} KB over the network, last at ${Math.round(Math.max(0, ...res.map(r => r.responseEnd)))}) · scripts ran ${m.scriptsLoaded} · crate on screen ${m.firstGrid || '-'} · sheet answered ${m.firstCatalog || '-'} · ${m.wrapped} functions timed`);
  const st = [...speed.stats].sort((a, b) => b[1].self - a[1].self).slice(0, 30);
  lines.push('', 'Most time (own time, ms · calls · slowest single call):');
  st.forEach(([n, r]) => lines.push(`  ${Math.round(r.self).toString().padStart(6)}  ${n} · ${r.n} · ${Math.round(r.max)}`));
  const taps = speed.taps.slice().sort((a, b) => b.ms - a.ms);
  const avg = taps.length ? Math.round(taps.reduce((s, t) => s + t.ms, 0) / taps.length) : 0;
  lines.push('', `Taps: ${taps.length}, average ${avg} ms, ${taps.filter(t => t.ms > 200).length} over 200 ms. Slowest:`);
  taps.slice(0, 15).forEach(t => lines.push(`  ${String(t.ms).padStart(5)} ms  ${t.what}${Object.keys(t.ran).length ? '  ← ' + speedTop(t.ran) : ''}`));
  const stalls = speed.stalls.slice().sort((a, b) => b.ms - a.ms);
  lines.push('', `Stalls (page stuck ≥150 ms): ${stalls.length}, ${Math.round(stalls.reduce((s, x) => s + x.ms, 0))} ms in all. Longest:`);
  stalls.slice(0, 15).forEach(x => lines.push(`  ${String(x.ms).padStart(5)} ms at ${Math.round(x.at / 1000)} s${Object.keys(x.ran).length ? '  ← ' + speedTop(x.ran) : '  (the browser itself: drawing, laying out, or loading)'}`));
  return lines.join('\n');
}
function speedButton() {
  if (document.getElementById('speedBtn')) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'speedBtn'; b.className = 'speed-btn'; b.title = 'Speed check: the report'; b.textContent = '⏱';
  b.addEventListener('click', speedPanel); document.body.appendChild(b);
}
function speedPanel() {
  let pn = document.getElementById('speedPanel');
  if (pn) { pn.remove(); return; }
  pn = document.createElement('div'); pn.id = 'speedPanel'; pn.className = 'speed-panel'; pn.setAttribute('role', 'dialog'); pn.setAttribute('aria-label', 'Speed check');
  pn.innerHTML = `<div class="speed-head"><b>Speed check</b><span class="speed-sub">Use CRATE as usual for a few minutes, then Copy and paste it to Claude.</span></div>
    <pre class="speed-pre"></pre>
    <div class="speed-acts"><button type="button" class="chip-btn soc-acc" data-sp="copy">Copy</button><button type="button" class="chip-btn" data-sp="reset">Start over</button><button type="button" class="chip-btn" data-sp="off">Turn off</button><button type="button" class="chip-btn" data-sp="close">Close</button></div>`;
  document.body.appendChild(pn);
  const pre = pn.querySelector('.speed-pre'); pre.textContent = speedReport();
  pn.addEventListener('click', (e) => {
    const k = e.target.closest('[data-sp]'); if (!k) return; const a = k.dataset.sp;
    if (a === 'close') pn.remove();
    else if (a === 'off') speedSet(false);
    else if (a === 'reset') { speed.stats.clear(); speed.taps.length = 0; speed.stalls.length = 0; speed.calls.length = 0; pre.textContent = speedReport(); }
    else if (a === 'copy') {
      const txt = speedReport(); pre.textContent = txt;
      const ok = () => { k.textContent = 'Copied'; setTimeout(() => { if (k.isConnected) k.textContent = 'Copy'; }, 1500); };
      try { navigator.clipboard.writeText(txt).then(ok, () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); k.textContent = 'Selected: copy it'; }); }
      catch (er) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
  });
}
// The menu item: Speed check… (on: the report; off: turn it on).
(function speedMenu() {
  const b = document.getElementById('menuSpeedCheck'); if (!b) return;
  b.textContent = speedOn() ? 'Speed check: on (show the report)' : 'Speed check…';
  b.addEventListener('click', () => {
    const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true;
    if (speedOn()) { speedButton(); speedPanel(); return; }
    if (confirm('Speed check times what CRATE does on this device, to find what makes it slow. It reloads CRATE now. Then use it as usual for a few minutes and tap ⏱ (bottom left) for the report. Turn it on?')) speedSet(true);
  });
})();
