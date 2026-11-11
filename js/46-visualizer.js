// CRATE — the visualizer (1.95.19; the add-on's capture 1.95.21).
// One part of the page's script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope.
//
// The music plays inside other sites' players (YouTube, Spotify, Bilibili, SoundCloud), whose sound a page can't read. So the visualizer asks
// the browser to share this tab's own sound with it (Chrome and Edge: the screen-sharing prompt, with this tab and "Also share tab audio"),
// and reads that through the Web Audio API: a real spectrum of what is playing, whichever player it is. The tab's picture is dropped at once;
// only the sound is kept, and only on this device (nothing is recorded or sent anywhere). Sharing lasts until you press Stop listening, close
// the tab, or stop it from the browser's own "sharing this tab" bar; closing the visualizer keeps it, so opening it again needs no prompt.
// (1.95.21) With the CRATE for YouTube add-on 1.5.0 or later, the add-on captures the tab's sound instead (chrome.tabCapture): no prompt and no
// sharing bar. Chrome mutes a captured tab, so then the sound is played back out from here. If Chrome wants the add-on's toolbar button clicked on
// this tab first, the visualizer says so (the button's "Let CRATE hear this tab" starts it), with "Share instead" for the old prompt.
const VIZ_STYLE_KEY = 'crate_viz_style_v1', VIZ_STYLES = ['ring', 'bars', 'wave'], VIZ_STYLE_NAMES = { ring: 'Ring', bars: 'Bars', wave: 'Wave' };
let viz = { stream: null, ctx: null, analyser: null, freq: null, wave: null, raf: 0, open: false, color: [232, 163, 61], art: '', bass: 0, peaks: null };
const vizEl = (id) => document.getElementById(id);
function vizSupported() { return !!(navigator.mediaDevices && (navigator.mediaDevices.getDisplayMedia || (vizAddonOk() && navigator.mediaDevices.getUserMedia)) && (window.AudioContext || window.webkitAudioContext)); }
function vizStyle() { try { const s = localStorage.getItem(VIZ_STYLE_KEY); return VIZ_STYLES.includes(s) ? s : 'ring'; } catch (e) { return 'ring'; } }
function vizSetStyle(s) { try { localStorage.setItem(VIZ_STYLE_KEY, s); } catch (e) { /* this visit only */ } vizPaintChrome(); }

// ----- the bands: the spectrum, log-spaced from about 30 Hz to 16 kHz, so the bass gets as much room as the treble -----
function vizBands(freq, sampleRate, n) {                            // -> n values 0..1
  const out = new Array(n), bins = freq.length, hz = (sampleRate / 2) / bins, lo = Math.log(30), hi = Math.log(16000);
  for (let i = 0; i < n; i++) {
    const fa = Math.exp(lo + (hi - lo) * i / n) / hz, fb = Math.exp(lo + (hi - lo) * (i + 1) / n) / hz;
    if (fb - fa < 1) { const f = (fa + fb) / 2, k = Math.floor(f), w = f - k; out[i] = ((freq[k] || 0) * (1 - w) + (freq[k + 1] || 0) * w) / 255; continue; }          // narrower than one bin (the bass): read between bins, not the same bin again
    let m = 0; for (let k = Math.ceil(fa); k < fb && k < bins; k++) if (freq[k] > m) m = freq[k];
    out[i] = m / 255;
  }
  return out;
}
function vizBassLevel(freq, sampleRate) {                           // 0..1: how much is going on below 150 Hz
  const hz = (sampleRate / 2) / freq.length, top = Math.max(2, Math.floor(150 / hz)); let s = 0;
  for (let k = 1; k < top; k++) s += freq[k]; return s / ((top - 1) * 255);
}

// ----- listening: this tab's sound, through the CRATE for YouTube add-on (1.5.0 or later: no prompt, no "Sharing this tab" bar), else the browser's share prompt -----
const vizVerAtLeast = (v, min) => { const a = String(v || '').split('.').map(Number), b = min.split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d > 0; } return true; };
const vizAddonOk = () => typeof ytAddon !== 'undefined' && ytAddon.ready && vizVerAtLeast(ytAddon.version, '1.5.0');
const vizCanShare = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
let vizAddonWait = null;
function vizAskAddon() {                                            // -> { ok, streamId } | { ok: false, reason }: 'invoke' (the toolbar button has to be clicked on this tab first), 'busy', 'noanswer'...
  return new Promise((resolve) => {
    if (vizAddonWait) vizAddonWait({ ok: false, reason: 'replaced' });
    const t = setTimeout(() => { vizAddonWait = null; resolve({ ok: false, reason: 'noanswer' }); }, 4000);
    vizAddonWait = (r) => { clearTimeout(t); vizAddonWait = null; resolve(r); };
    ytAddonSay('yt-audio');
  });
}
window.addEventListener('message', (e) => {                         // the add-on's answer, or a stream sent from its toolbar button ("Let CRATE hear this tab")
  if (e.source !== window || e.origin !== window.location.origin) return; const d = e.data;
  if (!d || d.source !== 'crate-addon' || d.type !== 'yt-audio') return;
  if (vizAddonWait && !d.fromPopup) { vizAddonWait(d); return; }
  if (d.fromPopup && d.ok && d.streamId && !viz.stream) vizFromStreamId(d.streamId).then(ok => { if (ok && !viz.open) openVisualizer(); });
});
async function vizFromStreamId(id) {                                // the tab's sound, captured by the add-on. Chrome mutes a tab while it is captured, so CRATE plays it back out itself
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id } }, video: false }); }
  catch (e) { vizSay('The add-on couldn’t hand over this tab’s sound: ' + ((e && e.message) || e)); return false; }
  return vizAttach(stream, true);
}
async function vizAttach(stream, playBack) {
  const audio = stream.getAudioTracks();
  if (!audio.length) { stream.getTracks().forEach(t => t.stop()); vizSay('That was shared without its sound. Press Listen again, choose this tab, and turn on “Also share tab audio”.'); return false; }
  const AC = window.AudioContext || window.webkitAudioContext;
  viz.ctx = viz.ctx || new AC();
  try { await viz.ctx.resume(); } catch (e) { /* it starts on the next gesture */ }
  if (playBack && viz.ctx.state !== 'running') { stream.getTracks().forEach(t => t.stop()); vizSay('Press Listen to start (the browser wants a click on this page first).'); return false; }          // else the tab would go silent
  const src = viz.ctx.createMediaStreamSource(new MediaStream(audio)), an = viz.ctx.createAnalyser();
  an.fftSize = 4096; an.smoothingTimeConstant = 0.78; an.minDecibels = -90; an.maxDecibels = -18;
  src.connect(an);
  if (playBack) src.connect(viz.ctx.destination);                    // the add-on's capture: the tab is muted meanwhile, so the sound goes out from here. (Shared through the prompt: never to the speakers, the tab already plays it)
  viz.stream = stream; viz.src = src; viz.analyser = an; viz.freq = new Uint8Array(an.frequencyBinCount); viz.wave = new Uint8Array(an.fftSize); viz.viaAddon = !!playBack; viz.offerShare = false;
  audio[0].addEventListener('ended', () => vizStop(true));           // stopped from the browser's own bar, or the capture ended
  vizSay(''); vizPaintChrome(); return true;
}
async function vizListen(opts) {
  if (viz.stream) return true;
  if (!vizSupported()) { vizSay('This browser can’t share a tab’s sound. Chrome or Edge on a computer can.'); return false; }
  if (vizAddonOk() && !(opts && opts.share)) {
    const r = await vizAskAddon(); if (viz.stream) return true;          // (the toolbar button may have started it meanwhile)
    if (r.ok && r.streamId) { if (await vizFromStreamId(r.streamId)) return true; }
    else if (r.reason === 'invoke' || r.reason === 'busy') {
      viz.offerShare = vizCanShare(); vizPaintChrome();
      vizSay(r.reason === 'busy' ? 'This tab’s sound is already being captured. Close what is capturing it, or press Share instead.' : 'Click the CRATE for YouTube button in the browser’s toolbar and press “Let CRATE hear this tab” (no sharing bar), or press Share instead.');
      return false;
    }
    if (!vizCanShare()) return false;                                // any other answer: the share prompt, as before
  }
  if (!vizCanShare()) { vizSay('This browser can’t share a tab’s sound. Chrome or Edge on a computer can.'); return false; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
      preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', systemAudio: 'include'
    });
  } catch (e) { vizSay(e && e.name === 'NotAllowedError' ? 'Not shared. Press Listen and choose this tab, with “Also share tab audio” on.' : 'Couldn’t share the tab’s sound: ' + ((e && e.message) || e)); return false; }
  stream.getVideoTracks().forEach(t => t.stop());                    // only the sound is wanted
  return vizAttach(stream, false);
}
function vizStop(byBrowser) {
  if (viz.stream) viz.stream.getTracks().forEach(t => t.stop());
  try { if (viz.src) viz.src.disconnect(); } catch (e) { /* gone */ }
  viz.stream = null; viz.src = null; viz.viaAddon = false; viz.analyser = null; viz.freq = null; viz.wave = null;
  vizPaintChrome(); if (viz.open) vizSay(byBrowser ? 'Sharing stopped. Press Listen to start again.' : '');
}

// ----- the overlay -----
function vizEnsureDom() {
  if (vizEl('vizOverlay')) return;
  const o = document.createElement('div'); o.id = 'vizOverlay'; o.className = 'viz-overlay'; o.hidden = true; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Visualizer');
  o.innerHTML = `<canvas id="vizCanvas" class="viz-canvas"></canvas>
    <div class="viz-center"><img id="vizArt" class="viz-art" alt=""><div id="vizTitle" class="viz-title"></div><div id="vizSub" class="viz-sub"></div></div><div id="vizLyric" class="viz-lyric"></div>
    <div class="viz-bar">
      <button type="button" class="chip-btn" id="vizListen" title="Share this tab's sound with the visualizer (choose this tab, with &ldquo;Also share tab audio&rdquo; on)">Listen</button>
      <button type="button" class="chip-btn" id="vizShare" title="Share this tab's sound through the browser's prompt instead of the add-on" hidden>Share instead</button>
      <button type="button" class="chip-btn" id="vizStyle" title="Ring, bars or wave">Ring</button>
      <button type="button" class="chip-btn" id="vizStopBtn" title="Stop sharing this tab's sound">Stop listening</button>
      <button type="button" class="chip-btn" id="vizClose" title="Close (Esc)" aria-label="Close the visualizer">✕</button>
    </div>
    <div id="vizMsg" class="viz-msg" hidden></div>`;
  document.body.appendChild(o);
  vizEl('vizListen').addEventListener('click', () => vizListen());
  vizEl('vizShare').addEventListener('click', () => vizListen({ share: true }));
  vizEl('vizStopBtn').addEventListener('click', () => vizStop(false));
  vizEl('vizStyle').addEventListener('click', () => { const s = vizStyle(); vizSetStyle(VIZ_STYLES[(VIZ_STYLES.indexOf(s) + 1) % VIZ_STYLES.length]); });
  vizEl('vizClose').addEventListener('click', closeVisualizer);
  o.addEventListener('dblclick', (e) => { if (e.target.closest('.viz-bar')) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else o.requestFullscreen && o.requestFullscreen().catch(() => {}); });
}
function vizSay(t) { const m = vizEl('vizMsg'); if (!m) return; m.textContent = t || ''; m.hidden = !t; }
function vizPaintChrome() {
  if (!vizEl('vizOverlay')) return;
  vizEl('vizListen').hidden = !!viz.stream; vizEl('vizShare').hidden = !!viz.stream || !viz.offerShare; vizEl('vizStopBtn').hidden = !viz.stream; vizEl('vizStyle').textContent = VIZ_STYLE_NAMES[vizStyle()];
  const b = el.miniPlayerVizBtn; if (b) b.classList.toggle('active', !!viz.stream);
}
function vizNowPlaying() {                                          // the cover, song and artist the player shows
  const art = (el.miniPlayerArt && el.miniPlayerArt.src) || '', title = (el.miniPlayerTitle && el.miniPlayerTitle.textContent) || '', artist = (el.miniPlayerArtist && el.miniPlayerArtist.textContent) || '';
  return { art: art && !/^data:image\/svg/.test(art) ? (typeof coverZoomHiRes === 'function' ? coverZoomHiRes(art) : art) : '', title: title === '—' ? '' : title, artist };
}
function vizTint(url) {                                             // the cover's colour, for the bars (the accent when the picture can't be read)
  if (!url || url === viz.tintFor) return; viz.tintFor = url;
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16); const d = x.getImageData(0, 0, 16, 16).data; let best = null, bs = -1;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, s = sat * (mx / 255); if (s > bs) { bs = s; best = [r, g, b]; } }
    if (best && bs > 0.12) { const k = 235 / Math.max(...best); viz.color = best.map(v => Math.min(255, Math.round(v * k))); } } catch (e) { /* a cover from a site that doesn't allow reading it */ } };
  img.src = url;
}
function openVisualizer() {
  vizEnsureDom(); const o = vizEl('vizOverlay'); o.hidden = false; viz.open = true; vizPaintChrome(); vizRefreshInfo();
  if (!viz.stream) { if (vizSupported()) { vizSay(vizAddonOk() ? 'Asking the CRATE for YouTube add-on for this tab’s sound…' : 'Press Listen, choose this tab, and turn on “Also share tab audio”. Only the sound is used, on this device.'); vizListen(); } else vizSay('This browser can’t share a tab’s sound. Chrome or Edge on a computer can.'); }
  vizResize(); cancelAnimationFrame(viz.raf); viz.raf = requestAnimationFrame(vizFrame);
}
function closeVisualizer() {
  const o = vizEl('vizOverlay'); if (!o || o.hidden) return false;
  o.hidden = true; viz.open = false; cancelAnimationFrame(viz.raf); if (document.fullscreenElement === o) document.exitFullscreen().catch(() => {}); return true;
}
function vizRefreshInfo() {
  const n = vizNowPlaying(), img = vizEl('vizArt');
  if (n.art !== viz.art) { viz.art = n.art; img.hidden = !n.art; if (n.art) img.src = n.art; vizTint(n.art); }
  vizEl('vizTitle').textContent = n.title; vizEl('vizSub').textContent = n.artist;
}
function vizResize() { const c = vizEl('vizCanvas'); if (!c) return; const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr); viz.dpr = dpr; }
window.addEventListener('resize', () => { if (viz.open) vizResize(); });

// ----- drawing -----
function vizFrame(t) {
  if (!viz.open) return;
  viz.raf = requestAnimationFrame(vizFrame);
  if (!viz.lastInfo || t - viz.lastInfo > 1000) { viz.lastInfo = t; vizRefreshInfo(); }
  if (!viz.lastLy || t - viz.lastLy > 200) { viz.lastLy = t; const line = typeof lyricsCurrentLine === 'function' ? lyricsCurrentLine() : '', e = vizEl('vizLyric'); if (e && e.textContent !== line) e.textContent = line; }          // (1.95.20) the line being sung, when the lyrics panel has them
  const c = vizEl('vizCanvas'), x = c.getContext('2d'), W = c.width, H = c.height, dpr = viz.dpr || 1; if (!W || !H) return;
  x.clearRect(0, 0, W, H);
  const [r, g, b] = viz.color, col = (a) => `rgba(${r},${g},${b},${a})`;
  let bands = null, bass = 0;
  if (viz.analyser) { viz.analyser.getByteFrequencyData(viz.freq); bands = vizBands(viz.freq, viz.ctx.sampleRate, 96); bass = vizBassLevel(viz.freq, viz.ctx.sampleRate); }
  else { bands = new Array(96).fill(0).map((_, i) => 0.04 + 0.03 * Math.sin(t / 900 + i / 6)); }          // waiting: a slow idle shimmer
  viz.bass = viz.bass * 0.8 + bass * 0.2;
  const glow = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);          // the room, lit by the bass
  glow.addColorStop(0, col(0.10 + viz.bass * 0.35)); glow.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = glow; x.fillRect(0, 0, W, H);
  const art = vizEl('vizArt'); if (art) art.style.transform = `scale(${(1 + viz.bass * 0.06).toFixed(3)})`;
  const style = vizStyle();
  if (style === 'ring') {
    const R = (art && !art.hidden && art.clientWidth ? art.clientWidth / 2 * dpr * (1 + viz.bass * 0.06) : Math.min(W, H) * 0.18), n = bands.length, len = Math.min(W, H) * 0.22;
    x.lineCap = 'round'; x.lineWidth = Math.max(2, (2 * Math.PI * R / (n * 2)) * 0.55);
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + side * (Math.PI * (i + 0.5) / n), v = bands[i], l = 4 * dpr + v * v * len;
      x.strokeStyle = col(0.35 + v * 0.65); x.beginPath(); x.moveTo(W / 2 + Math.cos(a) * (R + 6 * dpr), H / 2 + Math.sin(a) * (R + 6 * dpr)); x.lineTo(W / 2 + Math.cos(a) * (R + 6 * dpr + l), H / 2 + Math.sin(a) * (R + 6 * dpr + l)); x.stroke();
    }
  } else if (style === 'bars') {
    const n = bands.length, gap = 2 * dpr, bw = (W - gap * (n + 1)) / n, maxH = H * 0.42;
    viz.peaks = viz.peaks && viz.peaks.length === n ? viz.peaks : new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const v = bands[i], h = Math.max(2 * dpr, v * v * maxH), px = gap + i * (bw + gap);
      const grd = x.createLinearGradient(0, H, 0, H - maxH); grd.addColorStop(0, col(0.9)); grd.addColorStop(1, col(0.35));
      x.fillStyle = grd; x.fillRect(px, H - h, bw, h);
      viz.peaks[i] = Math.max(viz.peaks[i] - 0.6 * dpr, h); x.fillStyle = col(0.9); x.fillRect(px, H - viz.peaks[i] - 3 * dpr, bw, 2 * dpr);
    }
  } else {
    if (viz.analyser) viz.analyser.getByteTimeDomainData(viz.wave);
    const w = viz.wave, n = w ? w.length : 0, mid = H / 2, amp = H * 0.32;
    x.lineWidth = 2.5 * dpr; x.strokeStyle = col(0.9); x.shadowColor = col(0.8); x.shadowBlur = 12 * dpr; x.beginPath();
    if (n) for (let i = 0; i < n; i++) { const px = i / (n - 1) * W, py = mid + ((w[i] - 128) / 128) * amp; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    else { x.moveTo(0, mid); x.lineTo(W, mid); }
    x.stroke(); x.shadowBlur = 0;
  }
}

// ----- the player's button, and Esc -----
(function vizWire() {
  const b = el.miniPlayerVizBtn; if (!b) return;
  b.addEventListener('click', () => { if (viz.open) closeVisualizer(); else openVisualizer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && viz.open && !document.fullscreenElement && closeVisualizer()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
})();
