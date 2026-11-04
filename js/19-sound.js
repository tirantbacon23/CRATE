// CRATE — sound profiles: audio features, the sound map.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// BEGIN sound-core
// ---- Sound analysis: the pure parts (no page, no network), so they can be tested on their own ----
// Features per release come from several SOURCES that know different things. When more than one knows a feature the first in
// SND_SOURCE_ORDER wins: Spotify's and ReccoBeats' numbers come from trained models; "calc" is this file's own signal analysis (honest
// estimates from the audio itself); "tags" is a rough read of Last.fm's crowd tags. Features are kept as given and scaled only to draw.
const SND_FIELDS = [
  { key: 'energy', label: 'Energy', min: 0, max: 1, lo: 'mellow', hi: 'intense' },
  { key: 'danceability', label: 'Danceability', min: 0, max: 1, lo: 'stiff', hi: 'danceable' },
  { key: 'valence', label: 'Mood (sad \u2192 happy)', min: 0, max: 1, lo: 'sombre', hi: 'cheerful' },
  { key: 'tempo', label: 'Tempo (BPM)', min: 50, max: 200, lo: 'slow', hi: 'fast' },
  { key: 'acousticness', label: 'Acousticness', min: 0, max: 1, lo: 'electric', hi: 'acoustic' },
  { key: 'instrumentalness', label: 'Instrumentalness', min: 0, max: 1, lo: 'vocal', hi: 'instrumental' },
  { key: 'speechiness', label: 'Speechiness', min: 0, max: 1, lo: 'sung', hi: 'spoken' },
  { key: 'loudness', label: 'Loudness (dB)', min: -40, max: -3, lo: 'quiet', hi: 'loud' },
  { key: 'brightness', label: 'Brightness', min: 0, max: 1, lo: 'dark', hi: 'bright' },
  { key: 'liveness', label: 'Liveness', min: 0, max: 1, lo: 'studio', hi: 'live' },
  { key: 'dynamics', label: 'Dynamic range', min: 0, max: 1, lo: 'compressed', hi: 'dynamic' },
  { key: 'rhythm', label: 'Rhythmic density', min: 0, max: 1, lo: 'sparse', hi: 'busy' }
];
const SND_FIELD = new Map(SND_FIELDS.map(f => [f.key, f]));
const SND_SOURCE_ORDER = ['spotify', 'recco', 'calc', 'tags'];
const SND_SOURCE_LABELS = { spotify: 'Spotify', recco: 'ReccoBeats', calc: 'Built-in analysis', tags: 'Last.fm tags' };
function sndClamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function sndScale(key, v) { const f = SND_FIELD.get(key); return f && v != null && isFinite(v) ? sndClamp((v - f.min) / (f.max - f.min), 0, 1) : null; }
function sndRound(o) { const r = {}; Object.keys(o || {}).forEach(k => { const v = o[k]; if (v != null && isFinite(v)) r[k] = Math.round(v * 1000) / 1000; }); return r; }
function sndMeanFeatures(list) {
  const sum = {}, cnt = {};
  (list || []).forEach(o => Object.keys(o || {}).forEach(k => { const v = o[k]; if (v == null || !isFinite(v)) return; sum[k] = (sum[k] || 0) + v; cnt[k] = (cnt[k] || 0) + 1; }));
  const out = {}; Object.keys(sum).forEach(k => { out[k] = sum[k] / cnt[k]; }); return out;
}
// sources: { spotify: { f, n }, recco: { f, n }, calc: {...}, tags: {...} } -> { f: {feature: value}, from: {feature: source} }
function sndMergeSources(sources) {
  const f = {}, from = {};
  SND_SOURCE_ORDER.forEach(src => {
    const s = sources && sources[src]; if (!s || !s.f) return;
    Object.keys(s.f).forEach(k => { if (f[k] === undefined && s.f[k] != null && isFinite(s.f[k])) { f[k] = s.f[k]; from[k] = src; } });
  });
  return { f, from };
}

// ---- Last.fm tags -> a rough mood. Each word nudges a dimension (-1 .. +1); the result is the count-weighted average of the tags that have an opinion. ----
const SND_TAG_EFFECTS = {
  'energetic': { e: .8 }, 'high energy': { e: .9 }, 'upbeat': { e: .6, v: .6 }, 'aggressive': { e: .9, v: -.4 }, 'intense': { e: .8 }, 'heavy': { e: .7, v: -.2 }, 'loud': { e: .7 }, 'fast': { e: .6 },
  'party': { e: .7, v: .7, d: .8 }, 'dance': { e: .6, d: .9 }, 'danceable': { d: .9 }, 'groovy': { d: .7, v: .4 }, 'groove': { d: .7 }, 'funky': { d: .8, v: .5 }, 'driving': { e: .6 }, 'hard': { e: .6 },
  'chill': { e: -.6, v: .2 }, 'chillout': { e: -.6, v: .2 }, 'mellow': { e: -.6, v: .1 }, 'relaxing': { e: -.7, v: .3 }, 'calm': { e: -.7 }, 'soft': { e: -.6 }, 'quiet': { e: -.7 }, 'ambient': { e: -.7 },
  'atmospheric': { e: -.3 }, 'dreamy': { e: -.4, v: .2 }, 'sleep': { e: -.9 }, 'lullaby': { e: -.8, v: .2 }, 'slow': { e: -.5 }, 'gentle': { e: -.6 },
  'happy': { v: .8 }, 'cheerful': { v: .8 }, 'uplifting': { v: .8, e: .3 }, 'feel good': { v: .8 }, 'fun': { v: .6 }, 'summer': { v: .5 }, 'joyful': { v: .8 }, 'sunny': { v: .7 },
  'sad': { v: -.8, e: -.3 }, 'melancholy': { v: -.7, e: -.3 }, 'melancholic': { v: -.7, e: -.3 }, 'depressing': { v: -.9 }, 'dark': { v: -.6 }, 'gloomy': { v: -.7 }, 'angry': { v: -.5, e: .8 }, 'somber': { v: -.7, e: -.3 }, 'haunting': { v: -.5 },
  'acoustic': { a: .9 }, 'unplugged': { a: .8 }, 'folk': { a: .5 }, 'singer-songwriter': { a: .6, e: -.3 }, 'electronic': { a: -.7, d: .4 }, 'synth': { a: -.6 }, 'electro': { a: -.6 }, 'synthpop': { a: -.6 },
  // Last.fm's top tags are mostly GENRES and styles rather than moods, so these count too: a rough prior from the genre word, used only when nothing better is known
  'metal': { e: .8, v: -.2 }, 'heavy metal': { e: .85, v: -.1 }, 'thrash metal': { e: .95, v: -.3 }, 'death metal': { e: .95, v: -.5 }, 'black metal': { e: .85, v: -.7 }, 'doom metal': { e: .5, v: -.7 }, 'power metal': { e: .9, v: .2 },
  'punk': { e: .85, v: .1 }, 'punk rock': { e: .85, v: .1 }, 'hardcore': { e: .95, v: -.2 }, 'post-punk': { e: .5, v: -.4 }, 'hard rock': { e: .75 }, 'grunge': { e: .7, v: -.4 }, 'industrial': { e: .75, a: -.7, v: -.4 }, 'noise': { e: .9, v: -.4 },
  'rock': { e: .35 }, 'indie rock': { e: .3 }, 'garage rock': { e: .6 }, 'emo': { e: .45, v: -.4 }, 'goth': { v: -.5, e: -.1 }, 'gothic': { v: -.5 }, 'shoegaze': { e: .1, v: -.1 }, 'post-rock': { e: .0 }, 'slowcore': { e: -.7, v: -.5 },
  'pop': { v: .35, d: .5 }, 'synthwave': { a: -.7, e: .4, d: .6 }, 'disco': { d: .9, v: .7, e: .6 }, 'house': { e: .6, d: .9, a: -.6 }, 'techno': { e: .7, d: .9, a: -.7 }, 'trance': { e: .7, d: .8, a: -.7 }, 'drum and bass': { e: .85, d: .6, a: -.6 }, 'dubstep': { e: .7, d: .6, a: -.6 },
  'breakbeat': { e: .7, d: .7 }, 'garage': { e: .5, d: .6 }, 'edm': { e: .8, d: .9, a: -.7 }, 'idm': { a: -.7 }, 'chiptune': { a: -.8, e: .5 }, 'hip-hop': { d: .6, e: .3 }, 'hip hop': { d: .6, e: .3 }, 'rap': { d: .5, e: .3 }, 'trap': { e: .5, d: .6 },
  'r&b': { d: .6, v: .3 }, 'rnb': { d: .6, v: .3 }, 'soul': { v: .4, d: .5 }, 'funk': { d: .8, v: .5, e: .4 }, 'reggae': { d: .6, v: .6, e: -.1 }, 'ska': { e: .6, v: .6, d: .6 }, 'latin': { d: .8, v: .6 }, 'salsa': { d: .9, v: .8, e: .6 }, 'gospel': { v: .7 },
  'jazz': { a: .5, e: -.2 }, 'blues': { a: .5, v: -.3 }, 'classical': { a: .9, e: -.4 }, 'baroque': { a: .9, e: -.2 }, 'piano': { a: .9, e: -.4 }, 'country': { a: .7, v: .3 }, 'bluegrass': { a: .9, e: .3, v: .5 }, 'lounge': { e: -.5, v: .3 },
  'downtempo': { e: -.5 }, 'trip-hop': { e: -.3, v: -.2 }, 'new age': { e: -.6, v: .2 }, 'lo-fi': { e: -.5 }, 'lofi': { e: -.5 }, 'soundtrack': { e: -.2 }, 'easy listening': { e: -.6, v: .4 }
};
function sndTagsToFeatures(tags) {
  const acc = { e: [0, 0], v: [0, 0], a: [0, 0], d: [0, 0] }, used = [];
  (tags || []).forEach(t => {
    const name = String((t && t.name) || '').toLowerCase().trim(), eff = SND_TAG_EFFECTS[name] || SND_TAG_EFFECTS[name.replace(/-/g, ' ')];
    if (!eff) return;
    const w = Math.max(1, Number(t.count) || 1); used.push(name);
    Object.keys(eff).forEach(d => { acc[d][0] += w * eff[d]; acc[d][1] += w; });
  });
  const f = {}, val = (d) => acc[d][1] ? sndClamp(0.5 + 0.5 * acc[d][0] / acc[d][1], 0, 1) : null;
  const e = val('e'), v = val('v'), a = val('a'), d = val('d');
  if (e !== null) f.energy = e; if (v !== null) f.valence = v; if (a !== null) f.acousticness = a; if (d !== null) f.danceability = d;
  return Object.keys(f).length ? { f, used, top: (tags || []).slice(0, 6).map(t => t.name) } : null;
}

// ---- Signal analysis of raw audio (mono samples in -1..1). Honest estimates, not the trained models of the services above. ----
function sndFFT(re, im) {                    // in place, radix 2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const SND_KRUM_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], SND_KRUM_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function sndCorr(a, b) { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; } return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0; }
function sndAnalyzePCM(x, sr, opts) {
  opts = opts || {};
  const maxSec = opts.maxSeconds || 45;
  let start = 0, len = x.length;
  if (len > maxSec * sr) { start = Math.floor((len - maxSec * sr) / 2); len = Math.floor(maxSec * sr); }          // the middle of a long track
  const dec = sr >= 32000 ? Math.floor(sr / 22050) : 1, fs = sr / dec, n = Math.floor(len / dec);
  if (n < 8192) return null;                                                                                    // too short to say anything
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < dec; k++) s += x[start + i * dec + k]; y[i] = s / dec; }
  let sq = 0; for (let i = 0; i < n; i++) sq += y[i] * y[i];
  const rms = Math.sqrt(sq / n);
  if (!(rms > 1e-5)) return null;                                                                               // silence
  // frames for loudness, brightness and onsets
  const N = 1024, hop = 256, frames = Math.floor((n - N) / hop) + 1, win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const re = new Float64Array(N), im = new Float64Array(N), prev = new Float64Array(N / 2 + 1), flux = new Float64Array(frames), frameDb = [];
  let centSum = 0, centW = 0;
  for (let f = 0; f < frames; f++) {
    const o = f * hop; let e = 0;
    for (let i = 0; i < N; i++) { const s = y[o + i]; e += s * s; re[i] = s * win[i]; im[i] = 0; }
    sndFFT(re, im);
    let num = 0, den = 0, fl = 0;
    for (let k = 0; k <= N / 2; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]); num += k * m; den += m;
      const lm = Math.log(1 + 1000 * m); if (f > 0) { const d = lm - prev[k]; if (d > 0) fl += d; } prev[k] = lm;
    }
    flux[f] = fl;
    const frms = Math.sqrt(e / N);
    if (frms > 1e-4) { frameDb.push(20 * Math.log10(frms)); if (den > 0) { const w = frms; centSum += (num / den) * (fs / N) * w; centW += w; } }
  }
  const centroid = centW ? centSum / centW : 0;
  const brightness = sndClamp((Math.log2(Math.max(centroid, 1)) - Math.log2(300)) / (Math.log2(6000) - Math.log2(300)), 0, 1);
  const loudness = 20 * Math.log10(rms);
  frameDb.sort((a, b) => a - b);
  const dynamics = frameDb.length > 8 ? sndClamp((frameDb[Math.floor(frameDb.length * 0.95)] - frameDb[Math.floor(frameDb.length * 0.10)]) / 30, 0, 1) : 0;
  // onset envelope (flux minus a moving average, half-wave rectified), then its autocorrelation for tempo
  const fr = fs / hop, env = new Float64Array(frames), M = Math.max(3, Math.round(fr * 0.4));
  let fm = 0; for (let f = 0; f < frames; f++) fm += flux[f]; fm /= frames;
  for (let f = 0; f < frames; f++) { let s = 0, c = 0; for (let k = Math.max(0, f - M); k <= Math.min(frames - 1, f + M); k++) { s += flux[k]; c++; } env[f] = Math.max(0, flux[f] - s / c); }
  { const sm = new Float64Array(frames); for (let f = 0; f < frames; f++) sm[f] = 0.25 * env[Math.max(0, f - 1)] + 0.5 * env[f] + 0.25 * env[Math.min(frames - 1, f + 1)]; for (let f = 0; f < frames; f++) env[f] = sm[f]; }   // a little smoothing: a beat that falls between two frames must still line up with the next one
  let emean = 0; for (let f = 0; f < frames; f++) emean += env[f]; emean /= frames;
  let evar = 0; for (let f = 0; f < frames; f++) evar += (env[f] - emean) * (env[f] - emean); const estd = Math.sqrt(evar / frames);
  const lagMin = Math.max(3, Math.floor(fr * 60 / 200)), lagMax = Math.min(frames - 4, Math.ceil(fr * 60 / 50)), acf = new Float64Array(lagMax + 4);
  let acf0 = 0; for (let f = 0; f < frames; f++) acf0 += (env[f] - emean) * (env[f] - emean);
  let tempo = null, periodicity = 0;
  if (acf0 > 0 && lagMax > lagMin + 3) {
    for (let L = lagMin - 2; L <= lagMax + 2; L++) { let s = 0; for (let f = 0; f + L < frames; f++) s += (env[f] - emean) * (env[f + L] - emean); acf[L] = s / acf0; }
    // A beat that falls between two frames spreads its correlation over two neighbouring lags, so each lag is scored with its neighbours (a peak
    // split across two lags counts in full); otherwise a steady 150 BPM pulse scores below its own half tempo, whose lag happens to land on a whole frame.
    const sc = (L) => acf[L - 1] + acf[L] + acf[L + 1];
    let best = -1, bestV = -Infinity;
    for (let L = lagMin; L <= lagMax; L++) { const bpm = 60 * fr / L, w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 112) / 1.0, 2)), v = sc(L) * w; if (sc(L) >= sc(L - 1) && sc(L) >= sc(L + 1) && v > bestV) { bestV = v; best = L; } }
    if (best > 0 && 60 * fr / best < 100) {                    // octave check: a slow pulse whose half-lag peak is almost as strong is really the faster beat (fast music otherwise reads at half speed)
      const half = Math.round(best / 2);
      if (half >= lagMin) { let h = half; for (let L = half - 1; L <= half + 1; L++) if (L >= lagMin && sc(L) > sc(h)) h = L; if (sc(h) >= 0.85 * sc(best) && 60 * fr / h <= 190) best = h; }
    }
    if (best > 0 && sc(best) > 0.06) {
      const a = sc(best - 1), b = sc(best), c = sc(best + 1), den = a - 2 * b + c, shift = den !== 0 ? 0.5 * (a - c) / den : 0;
      tempo = 60 * fr / (best + sndClamp(shift, -0.5, 0.5)); periodicity = sndClamp(sc(best), 0, 1);
    }
  }
  // onsets per second: peaks of the envelope above mean + 1 std, at least 90 ms apart
  const thr = emean + Math.max(estd, 1e-9), gap = Math.max(1, Math.round(fr * 0.09)); let onsets = 0, last = -gap;
  for (let f = 1; f < frames - 1; f++) if (env[f] > thr && env[f] >= env[f - 1] && env[f] >= env[f + 1] && f - last >= gap) { onsets++; last = f; }
  const secs = n / fs, rhythm = sndClamp((onsets / secs) / 8, 0, 1);
  const tempoFit = tempo ? Math.exp(-0.5 * Math.pow((tempo - 118) / 30, 2)) : 0;
  const danceability = sndClamp(0.65 * sndClamp(periodicity * 1.2, 0, 1) + 0.35 * tempoFit, 0, 1);
  const energy = sndClamp(0.4 * sndScale('loudness', loudness) + 0.3 * brightness + 0.3 * rhythm, 0, 1);
  // key: pitch-class energy from longer frames (finer frequency resolution), matched to the 24 Krumhansl-Schmuckler profiles
  const KN = 4096, chroma = new Float64Array(12), kre = new Float64Array(KN), kim = new Float64Array(KN), kwin = new Float32Array(KN);
  for (let i = 0; i < KN; i++) kwin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (KN - 1));
  const lo = Math.ceil(90 * KN / fs), hi = Math.min(KN / 2 - 1, Math.floor(2000 * KN / fs));
  for (let o = 0; o + KN <= n; o += KN) {
    for (let i = 0; i < KN; i++) { kre[i] = y[o + i] * kwin[i]; kim[i] = 0; }
    sndFFT(kre, kim);
    for (let k = lo; k <= hi; k++) { const m = Math.sqrt(kre[k] * kre[k] + kim[k] * kim[k]), midi = 69 + 12 * Math.log2((k * fs / KN) / 440); chroma[((Math.round(midi) % 12) + 12) % 12] += m; }
  }
  let key = null, mode = null, keyStrength = 0;
  { let sum = 0; for (let i = 0; i < 12; i++) sum += chroma[i];
    if (sum > 0) { let bestC = -2; for (let t = 0; t < 12; t++) { const rot = []; for (let i = 0; i < 12; i++) rot.push(chroma[(i + t) % 12]); const cM = sndCorr(rot, SND_KRUM_MAJOR), cm = sndCorr(rot, SND_KRUM_MINOR); if (cM > bestC) { bestC = cM; key = t; mode = 1; } if (cm > bestC) { bestC = cm; key = t; mode = 0; } } keyStrength = bestC; } }
  return { tempo, energy, danceability, brightness, loudness, dynamics, rhythm, key, mode, keyStrength, periodicity, centroid, seconds: secs };
}
function sndFeaturesFromAnalysis(a) {            // the part worth keeping per track
  if (!a) return null;
  const f = { energy: a.energy, danceability: a.danceability, brightness: a.brightness, loudness: a.loudness, dynamics: a.dynamics, rhythm: a.rhythm };
  if (a.tempo) f.tempo = a.tempo; return f;
}

// ---- Layout: PCA by power iteration on sparse rows (rows: [[col, value], ...]); deterministic ----
function sndRng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sndPCA(rows, dim, k) {
  const n = rows.length, mean = new Float64Array(dim), sq = new Float64Array(dim);
  rows.forEach(r => r.forEach(p => { mean[p[0]] += p[1]; sq[p[0]] += p[1] * p[1]; }));
  let total = 0; for (let c = 0; c < dim; c++) { mean[c] /= (n || 1); total += sq[c] / (n || 1) - mean[c] * mean[c]; }
  const comps = [], vals = [], rnd = sndRng(12345);
  for (let j = 0; j < k; j++) {
    let v = new Float64Array(dim); for (let c = 0; c < dim; c++) v[c] = rnd() - 0.5;
    const ortho = (w) => { comps.forEach(p => { let d = 0; for (let c = 0; c < dim; c++) d += w[c] * p[c]; for (let c = 0; c < dim; c++) w[c] -= d * p[c]; }); };
    const norm = (w) => { let s = 0; for (let c = 0; c < dim; c++) s += w[c] * w[c]; s = Math.sqrt(s); if (s > 0) for (let c = 0; c < dim; c++) w[c] /= s; return s; };
    ortho(v); norm(v); let lambda = 0;
    for (let it = 0; it < 300; it++) {
      let mv = 0; for (let c = 0; c < dim; c++) mv += mean[c] * v[c];
      const u = new Float64Array(n); let su = 0;
      for (let i = 0; i < n; i++) { let s = 0; const r = rows[i]; for (let q = 0; q < r.length; q++) s += r[q][1] * v[r[q][0]]; u[i] = s - mv; su += u[i]; }
      const w = new Float64Array(dim);
      for (let i = 0; i < n; i++) { const r = rows[i]; for (let q = 0; q < r.length; q++) w[r[q][0]] += u[i] * r[q][1]; }
      for (let c = 0; c < dim; c++) w[c] = (w[c] - mean[c] * su) / (n || 1);
      ortho(w); lambda = norm(w);
      let d = 0; for (let c = 0; c < dim; c++) d += w[c] * v[c];
      v = w; if (Math.abs(d) > 1 - 1e-10) break;
    }
    let big = 0; for (let c = 1; c < dim; c++) if (Math.abs(v[c]) > Math.abs(v[big])) big = c; if (v[big] < 0) for (let c = 0; c < dim; c++) v[c] = -v[c];
    comps.push(v); vals.push(lambda);
  }
  const coords = rows.map(r => comps.map(p => { let mv = 0; for (let c = 0; c < dim; c++) mv += mean[c] * p[c]; let s = 0; for (let q = 0; q < r.length; q++) s += r[q][1] * p[r[q][0]]; return s - mv; }));
  return { coords, components: comps, explained: vals.map(l => total > 0 ? l / total : 0), mean };
}
// feature table -> standardised sparse rows. items: [{ f: {feature: value} }]. A feature missing for a release counts as that feature's average.
function sndAudioRows(fs, columns) {
  const cols = []; const stats = columns.map(key => { const vals = []; fs.forEach(f => { const v = f && f[key]; if (v != null && isFinite(v)) vals.push(v); }); if (vals.length < 2) return null; const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length); return sd > 1e-9 ? { key, m, sd } : null; });
  stats.forEach(s => { if (s) cols.push(s); });
  const rows = fs.map(f => { const r = []; cols.forEach((s, c) => { const v = f && f[s.key]; if (v != null && isFinite(v)) { const z = (v - s.m) / s.sd; if (z !== 0) r.push([c, z]); } }); return r; });
  return { rows, columns: cols.map(s => s.key), stats: cols };
}
// genre rows: each release's genres in order (first counts most) plus their ancestors in the genre tree (a half as much per step up)
function sndGenreRows(tagLists, ancestorsOf, keyOf) {
  const idx = new Map(), vocab = [], W = [1, 0.6, 0.4, 0.3, 0.2, 0.15];
  const col = (g) => { const k = keyOf(g); if (!idx.has(k)) { idx.set(k, vocab.length); vocab.push(g); } return idx.get(k); };
  const rows = tagLists.map(tags => {
    const acc = new Map();
    (tags || []).filter(g => g && g !== 'Unknown').slice(0, 6).forEach((g, i) => {
      const base = W[i] || 0.1; const add = (c, w) => acc.set(c, (acc.get(c) || 0) + w);
      add(col(g), base); (ancestorsOf(g) || []).slice(0, 4).forEach((a, d) => add(col(a), base * Math.pow(0.5, d + 1)));
    });
    return [...acc.entries()];
  });
  return { rows, vocab };
}
function sndAxisEnds(component, wordFor, top) {          // words for each end of an axis from its loadings; wordFor(col, high) -> text
  const order = [...component.keys()].sort((a, b) => Math.abs(component[b]) - Math.abs(component[a])), pos = [], neg = [];
  order.forEach(c => { if (Math.abs(component[c]) < 1e-6) return; const up = component[c] > 0, wp = wordFor(c, up), wn = wordFor(c, !up); if (pos.length < (top || 3) && wp && !pos.includes(wp)) pos.push(wp); if (neg.length < (top || 3) && wn && !neg.includes(wn)) neg.push(wn); });
  return { pos, neg };
}
// nearest releases. dense: rows of standardised numbers (Euclidean); sparse: genre rows (cosine)
function sndNeighbours(kind, data, i, k) {
  const out = [];
  if (kind === 'dense') {
    const a = data[i]; if (!a) return out;
    for (let j = 0; j < data.length; j++) { if (j === i || !data[j]) continue; let s = 0; for (let c = 0; c < a.length; c++) { const d = a[c] - data[j][c]; s += d * d; } out.push({ index: j, score: 1 / (1 + Math.sqrt(s)) }); }
  } else {
    const norm = (r) => Math.sqrt(r.reduce((s, p) => s + p[1] * p[1], 0)), ra = data[i]; if (!ra || !ra.length) return out;
    const ma = new Map(ra), na = norm(ra);
    for (let j = 0; j < data.length; j++) { if (j === i || !data[j] || !data[j].length) continue; let dot = 0; data[j].forEach(p => { const v = ma.get(p[0]); if (v) dot += v * p[1]; }); const nb = norm(data[j]); if (dot > 0 && nb > 0) out.push({ index: j, score: dot / (na * nb) }); }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, k || 8);
}
// ---- Genre network ----
function sndGenreNetwork(tagLists, parentsOf, keyOf, opts) {
  opts = opts || {}; const maxNodes = opts.maxNodes || 60, per = opts.perRelease || 3, count = new Map(), label = new Map();
  const firsts = tagLists.map(t => { const seen = new Set(), out = []; (t || []).filter(g => g && g !== 'Unknown').slice(0, per).forEach(g => { const k = keyOf(g); if (!seen.has(k)) { seen.add(k); out.push(k); if (!label.has(k)) label.set(k, g); } }); return out; });
  firsts.forEach(ks => ks.forEach(k => count.set(k, (count.get(k) || 0) + 1)));
  const keep = [...count.entries()].sort((a, b) => b[1] - a[1] || String(label.get(a[0])).localeCompare(String(label.get(b[0])))).slice(0, maxNodes).map(e => e[0]), pos = new Map(keep.map((k, i) => [k, i]));
  const ew = new Map(), add = (a, b, w) => { if (a === b) return; const key = a < b ? a + '|' + b : b + '|' + a; ew.set(key, (ew.get(key) || 0) + w); };
  firsts.forEach(ks => { for (let x = 0; x < ks.length; x++) for (let y = x + 1; y < ks.length; y++) if (pos.has(ks[x]) && pos.has(ks[y])) add(pos.get(ks[x]), pos.get(ks[y]), 1); });
  keep.forEach(k => { (parentsOf(label.get(k)) || []).forEach(p => { const pk = keyOf(p); if (pos.has(pk)) add(pos.get(k), pos.get(pk), 0.5); }); });
  const edges = [...ew.entries()].map(([key, w]) => { const [a, b] = key.split('|').map(Number); return [a, b, w]; });
  return { nodes: keep.map(k => ({ key: k, genre: label.get(k), count: count.get(k) })), edges };
}
function sndForceLayout(n, edges, opts) {       // Fruchterman-Reingold, deterministic; returns [[x, y]] in -1..1
  opts = opts || {}; const iters = opts.iterations || 300, rnd = sndRng(opts.seed || 7), W = 2, pos = [];
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / Math.max(1, n), r = 0.6 + 0.2 * rnd(); pos.push([Math.cos(a) * r + (rnd() - 0.5) * 0.05, Math.sin(a) * r + (rnd() - 0.5) * 0.05]); }
  if (n < 2) return pos.map(() => [0, 0]);
  const k = 0.9 * Math.sqrt((W * W) / n), maxW = edges.reduce((m, e) => Math.max(m, e[2]), 1);
  for (let it = 0; it < iters; it++) {
    const t = 0.2 * (1 - it / iters) + 0.002, disp = pos.map(() => [0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], d = Math.sqrt(dx * dx + dy * dy); if (d < 1e-4) { dx = (rnd() - 0.5) * 1e-3; dy = (rnd() - 0.5) * 1e-3; d = 1e-3; } const f = (k * k) / d; disp[i][0] += dx / d * f; disp[i][1] += dy / d * f; disp[j][0] -= dx / d * f; disp[j][1] -= dy / d * f; }
    edges.forEach(e => { const dx = pos[e[0]][0] - pos[e[1]][0], dy = pos[e[0]][1] - pos[e[1]][1], d = Math.sqrt(dx * dx + dy * dy) || 1e-3, f = (d * d / k) * (0.4 + 1.2 * e[2] / maxW); disp[e[0]][0] -= dx / d * f; disp[e[0]][1] -= dy / d * f; disp[e[1]][0] += dx / d * f; disp[e[1]][1] += dy / d * f; });
    for (let i = 0; i < n; i++) { disp[i][0] -= pos[i][0] * 0.3; disp[i][1] -= pos[i][1] * 0.3; const d = Math.sqrt(disp[i][0] * disp[i][0] + disp[i][1] * disp[i][1]) || 1e-9, s = Math.min(d, t); pos[i][0] += disp[i][0] / d * s; pos[i][1] += disp[i][1] / d * s; }
  }
  let mx = 1e-9; pos.forEach(p => { mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1])); });
  return pos.map(p => [p[0] / mx, p[1] / mx]);
}
// END sound-core

// BEGIN sound-data
// ---- Sound analysis: getting the features (everything here touches the page, the network or the browser's storage) ----
// Nothing runs by itself: it all starts from ⚙ → Sound analysis… . Results are kept in this browser only (localStorage), per release.
const SND_STORE_KEY = 'crate_sound_features_v1', SND_OPTS_KEY = 'crate_sound_options_v1', SND_RETRY_MS = 30 * 86400000;
let sndStore = null, sndVersion = 0; const sndMemo = new Map();
function sndLoadStore() {
  if (sndStore) return sndStore;
  try { const o = JSON.parse(localStorage.getItem(SND_STORE_KEY) || 'null'); sndStore = o && o.v === 1 && o.rel && typeof o.rel === 'object' ? o : { v: 1, rel: {} }; } catch (e) { sndStore = { v: 1, rel: {} }; }
  return sndStore;
}
function sndSaveStore() {
  const st = sndLoadStore(); sndVersion++; sndMemo.clear();
  const tryWrite = () => { try { localStorage.setItem(SND_STORE_KEY, JSON.stringify(st)); return true; } catch (e) { return false; } };
  if (tryWrite()) return true;
  const live = new Set((state.raw || []).map(artKey)), keys = Object.keys(st.rel);       // full: first let go of releases that are no longer in the crate, then the oldest quarter
  keys.filter(k => !live.has(k)).forEach(k => { delete st.rel[k]; });
  if (tryWrite()) return true;
  const byAge = Object.keys(st.rel).sort((a, b) => (sndRecTime(st.rel[a]) - sndRecTime(st.rel[b]))); byAge.slice(0, Math.ceil(byAge.length / 4)).forEach(k => { delete st.rel[k]; });
  if (tryWrite()) { flashGlobalToast('Browser storage was full, so the oldest sound data was dropped to make room.'); return true; }
  flashGlobalToast('Couldn\u2019t save the sound data (browser storage is full).'); return false;
}
function sndRecTime(r) { let t = 0; Object.keys((r && r.s) || {}).forEach(k => { t = Math.max(t, r.s[k].t || 0); }); return t; }
function sndRec(item, create) { const st = sndLoadStore(), k = artKey(item); if (!st.rel[k] && create) st.rel[k] = { s: {}, miss: {}, sp: {} }; return st.rel[k] || null; }
function sndMerged(item) { const r = sndRec(item, false); if (!r) return { f: {}, from: {} }; const k = artKey(item); if (!sndMemo.has(k)) sndMemo.set(k, sndMergeSources(r.s)); return sndMemo.get(k); }
function sndSetSource(item, src, f, n, extra) { const r = sndRec(item, true); r.s[src] = Object.assign({ f: sndRound(f), n: n || 1, t: Date.now() }, extra || {}); delete r.miss[src]; sndMemo.delete(artKey(item)); }
function sndSetMiss(item, src) { const r = sndRec(item, true); r.miss[src] = Date.now(); }
function sndRecentMiss(item, src) { const r = sndRec(item, false); return !!(r && r.miss && r.miss[src] && Date.now() - r.miss[src] < SND_RETRY_MS); }
function sndHas(item, src) { const r = sndRec(item, false); return !!(r && r.s && r.s[src] && r.s[src].f && Object.keys(r.s[src].f).length); }
function sndCoverage(items) {
  const by = {}; SND_SOURCE_ORDER.forEach(s => { by[s] = 0; }); let any = 0;
  (items || []).forEach(it => { const r = sndRec(it, false); if (!r) return; let got = false; SND_SOURCE_ORDER.forEach(s => { if (r.s[s] && r.s[s].f && Object.keys(r.s[s].f).length) { by[s]++; got = true; } }); if (got) any++; });
  return { total: (items || []).length, any, by };
}
const SND_DEFAULTS = { spotify: true, recco: true, previews: true, tags: true, essentia: false, tracks: 4, scope: 'missing', paceMs: { previews: 4000, recco: 150, tags: 250 } };
function sndOpts() { let o = {}; try { o = JSON.parse(localStorage.getItem(SND_OPTS_KEY) || '{}') || {}; } catch (e) { o = {}; } return Object.assign({}, SND_DEFAULTS, o, { paceMs: Object.assign({}, SND_DEFAULTS.paceMs, o.paceMs || {}) }); }
function sndSaveOpts(patch) { const o = Object.assign(sndOpts(), patch); try { localStorage.setItem(SND_OPTS_KEY, JSON.stringify(o)); } catch (e) { /* not remembered */ } return o; }
const sndSleep = (ms) => new Promise(r => setTimeout(r, ms));
async function sndFetch(url, init, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 15000);
  try { return await fetch(url, Object.assign({}, init || {}, { signal: ac.signal })); } finally { clearTimeout(t); }
}
function sndPickTracks(tracks, k) {                                                   // k tracks spread across the tracklist (first, middle, last…), preferring any with a Spotify link saved
  const t = (tracks || []).filter(x => x && x.trackName); if (t.length <= k) return t;
  const out = []; for (let i = 0; i < k; i++) out.push(t[Math.round(i * (t.length - 1) / Math.max(1, k - 1))]);
  return [...new Set(out)];
}
const SND_SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
function sndSpotifyIdFromHref(h) { const m = /track[\/:]([A-Za-z0-9]{22})/.exec(String(h || '')); return m ? m[1] : null; }
function sndHasSpotifyCreds() { try { const c = loadSpotifyCreds(); return !!(c && c.clientId && c.clientSecret); } catch (e) { return false; } }
function sndPickService(o) { const f = {}; ['energy', 'danceability', 'valence', 'tempo', 'acousticness', 'instrumentalness', 'speechiness', 'loudness', 'liveness'].forEach(k => { if (typeof o[k] === 'number' && isFinite(o[k])) f[k] = o[k]; }); return f; }

// ----- source: Spotify's own audio features (only works for Developer apps created before 27 Nov 2024) -----
async function sndSpotifyFeatures(ids) {
  let token; try { token = await getSpotifyToken(); } catch (e) { token = null; }
  if (!token) return { status: 'nocreds', map: new Map() };
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    let res; try { res = await sndFetch('https://api.spotify.com/v1/audio-features?ids=' + ids.slice(i, i + 100).join(','), { headers: { Authorization: 'Bearer ' + token } }); } catch (e) { return { status: 'network', map: out }; }
    if (res.status === 401 || res.status === 403) return { status: 'blocked', code: res.status, map: out };
    if (res.status === 429) return { status: 'rate', map: out };
    if (!res.ok) return { status: 'error', code: res.status, map: out };
    const data = await res.json().catch(() => null);
    ((data && data.audio_features) || []).forEach(a => { if (a && a.id) out.set(a.id, sndPickService(a)); });
  }
  return { status: 'ok', map: out };
}
// ----- source: ReccoBeats (free, no key; takes Spotify track ids, up to 40 per call; answers come back in any order, matched by their Spotify link) -----
async function sndReccoBatch(ids, depth) {
  let res; try { res = await sndFetch('https://api.reccobeats.com/v1/audio-features?ids=' + ids.join(','), { headers: { Accept: 'application/json' } }); } catch (e) { return { status: 'network', map: new Map() }; }   // offline, down, or the browser's cross-origin rules said no
  if (res.status === 429) {
    if (depth >= 2) return { status: 'rate', map: new Map() };
    const wait = Math.min(20, Number(res.headers.get('Retry-After')) || 2); await sndSleep(wait * 1000); return sndReccoBatch(ids, depth + 1);
  }
  if (res.status === 400 && ids.length > 1) {                                                              // a limit lower than we assumed: halve the batch
    const h = Math.ceil(ids.length / 2), a = await sndReccoBatch(ids.slice(0, h), depth), b = await sndReccoBatch(ids.slice(h), depth);
    b.map.forEach((v, k) => a.map.set(k, v)); return { status: a.status === 'ok' ? b.status : a.status, map: a.map };
  }
  if (!res.ok) return { status: 'http ' + res.status, map: new Map() };
  const data = await res.json().catch(() => null), out = new Map();
  ((data && data.content) || []).forEach(o => { const id = sndSpotifyIdFromHref(o && o.href) || (o && ids.includes(o.id) ? o.id : null); if (id) out.set(id, sndPickService(o)); });
  return { status: 'ok', map: out };
}
async function sndReccoFeatures(ids) {
  const out = new Map(); let status = 'ok';
  for (let i = 0; i < ids.length; i += 40) { const r = await sndReccoBatch(ids.slice(i, i + 40), 0); r.map.forEach((v, k) => out.set(k, v)); if (r.status !== 'ok') { status = r.status; if (r.status === 'network' || r.status === 'rate') break; } }
  return { status, map: out };
}
async function sndSpotifyIdsFor(item, tracks) {                                          // Spotify track ids for these tracks: a saved link first, then the app's own Spotify matching; remembered per release
  const rec = sndRec(item, true), out = [];
  for (const t of tracks) {
    const k = String(t.trackNumber || t.trackName);
    if (rec.sp[k] === undefined) {
      let id = null;
      const uri = t.spotifyLink ? trackSpotifyUriFromLink(t.spotifyLink) : null, m = uri && /track:([A-Za-z0-9]{22})/.exec(uri);
      if (m) id = m[1]; else { try { id = await spotifyTrackId(item.artist, t.trackName, songContextFor(item, t.trackNumber, t.trackName)); } catch (e) { id = null; } }
      rec.sp[k] = id && SND_SPOTIFY_ID.test(id) ? id : 0;
    }
    if (rec.sp[k]) out.push(rec.sp[k]);
  }
  return out;
}
// ----- source: audio analysed here (iTunes' 30-second previews, or your own files) -----
let sndAudioCtx = null;
function sndCtx() { if (!sndAudioCtx) { const C = window.AudioContext || window.webkitAudioContext; try { sndAudioCtx = new C({ sampleRate: 44100 }); } catch (e) { sndAudioCtx = new C(); } } return sndAudioCtx; }
async function sndDecodeMono(ab) {
  const buf = await new Promise((res, rej) => { const p = sndCtx().decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
  const n = buf.length, ch = buf.numberOfChannels, mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
  return { mono, sr: buf.sampleRate };
}
async function sndAnalyzeBuffer(ab, useEssentia) {
  const { mono, sr } = await sndDecodeMono(ab); await sndSleep(0);
  const a = sndAnalyzePCM(mono, sr); if (!a) return null;
  if (useEssentia) { try { await sndEssentiaImprove(a, mono, sr); } catch (e) { /* keep the built-in numbers */ } }
  return a;
}
async function sndAnalyzeUrls(urls, useEssentia) {                                       // -> { f, n, errors: [...] } from several preview clips
  const fs = [], errors = [];
  for (const u of urls) {
    try { const res = await sndFetch(u, {}, 20000); if (!res.ok) { errors.push('http ' + res.status); continue; } const a = await sndAnalyzeBuffer(await res.arrayBuffer(), useEssentia); if (a) fs.push(sndFeaturesFromAnalysis(a)); else errors.push('silent or too short'); }
    catch (e) { errors.push(e && e.name === 'TypeError' ? 'blocked' : (e && e.name === 'EncodingError' ? 'decode' : String((e && e.message) || e).slice(0, 60))); }
  }
  return { f: fs.length ? sndMeanFeatures(fs) : null, n: fs.length, errors };
}
// ----- source: Last.fm tags -----
async function sndLastfmTags(item) {
  const apiKey = (loadLastfmCreds().apiKey || '').trim(); if (!apiKey) return { status: 'nokey' };
  const call = async (method, extra) => { const res = await sndFetch('https://ws.audioscrobbler.com/2.0/?' + new URLSearchParams(Object.assign({ method, api_key: apiKey, format: 'json', autocorrect: '1' }, extra)), {}, 12000); const d = await res.json().catch(() => null); if (d && d.error) { if (d.error === 10 || d.error === 26) throw new Error('badkey'); return []; } const t = d && d.toptags && d.toptags.tag; return Array.isArray(t) ? t : (t ? [t] : []); };
  try {
    let tags = await call('album.gettoptags', { artist: item.artist, album: item.title });
    if (!tags.length) tags = await call('artist.gettoptags', { artist: item.artist });
    if (!tags.length) return { status: 'notags' };                                              // Last.fm answered and has nothing for this release
    const r = sndTagsToFeatures(tags.map(t => ({ name: t.name, count: Number(t.count) || 0 })));
    return r ? { status: 'ok', f: r.f, top: r.top } : { status: 'none', top: tags.slice(0, 5).map(t => t.name) };       // tags, but none we can read a mood or style from
  } catch (e) { return { status: e && e.message === 'badkey' ? 'badkey' : 'error' }; }                                    // the request itself failed
}
// ----- optional: Essentia.js (loaded from the web only when you switch it on; better tempo, key and danceability) -----
let sndEss = null, sndEssError = '';
const SND_ESSENTIA_URLS = ['https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js', 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.js'];
function sndLoadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('couldn\u2019t load ' + src)); document.head.appendChild(s); }); }
async function sndLoadEssentia() {
  if (sndEss) return sndEss; if (sndEssError) return null;
  try {
    if (!(window.EssentiaWASM && window.Essentia)) for (const u of SND_ESSENTIA_URLS) await sndLoadScript(u);
    const wasm = await window.EssentiaWASM(); sndEss = new window.Essentia(wasm); return sndEss;
  } catch (e) { sndEssError = String((e && e.message) || e); return null; }
}
const SND_PITCH = { 'C': 0, 'B#': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'Fb': 4, 'F': 5, 'E#': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11 };
async function sndEssentiaImprove(a, mono, sr) {                                          // overwrites tempo / danceability / key in `a` with Essentia's when it answers sensibly
  const E = await sndLoadEssentia(); if (!E) return false;
  const seg = mono.length > 45 * sr ? mono.subarray(Math.floor((mono.length - 45 * sr) / 2), Math.floor((mono.length - 45 * sr) / 2) + 45 * sr) : mono, vec = E.arrayToVector(seg);
  try {
    const r = E.RhythmExtractor2013 ? E.RhythmExtractor2013(vec) : null; if (r && r.bpm > 40 && r.bpm < 220) a.tempo = r.bpm;
    const d = E.Danceability ? E.Danceability(vec) : null; if (d && isFinite(d.danceability)) a.danceability = sndClamp(d.danceability / 3, 0, 1);
    const k = E.KeyExtractor ? E.KeyExtractor(vec) : null; if (k && SND_PITCH[k.key] !== undefined) { a.key = SND_PITCH[k.key]; a.mode = k.scale === 'minor' ? 0 : 1; a.keyStrength = k.strength; }
  } finally { try { vec.delete && vec.delete(); } catch (e) { /* ignore */ } }
  return true;
}
// ----- your own music folder -----
let sndLocal = { files: [], matched: new Map(), unmatched: 0 };
const SND_AUDIO_EXT = /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav|aif|aiff)$/i;
function sndGuessesFromPath(path) {                                                          // every plausible (artist, album) reading of a file's location, best first
  const parts = String(path || '').split('/').filter(Boolean); parts.pop();                  // drop the file name
  const clean = (a) => a.replace(/\s*[\(\[]\s*(19|20)\d\d\s*[\)\]]\s*$/, '').replace(/^\s*(19|20)\d\d\s*[-\u2013.]\s+/, '').trim();
  let album = parts.pop() || '', artist = parts.pop() || '';
  if (/^(cd|disc|disk)\s*\d+$/i.test(album)) { album = artist; artist = parts.pop() || ''; }  // Artist/Album/Disc 1/track
  const out = [];
  if (artist && album) out.push({ artist: artist.trim(), album: clean(album) });               // Artist/Album/track
  const m = /^(.+?)\s+[-\u2013]\s+(.+)$/.exec(album);                                          // "Artist - Album (Year)/track", whatever folder it sits in (the folder you picked counts as a parent)
  if (m) out.push({ artist: m[1].trim(), album: clean(m[2]) });
  return out;
}
function sndMatchFiles(files, items) {
  const byKey = new Map(); (items || []).forEach(it => { const k = dupKey(it.artist, it.title); if (k && !byKey.has(k)) byKey.set(k, it); });
  const groups = new Map(), unknown = new Set();
  (files || []).forEach(f => {
    const path = f.webkitRelativePath || f.name; if (!SND_AUDIO_EXT.test(f.name)) return;
    let hit = null; for (const g of sndGuessesFromPath(path)) { const k = dupKey(g.artist, g.album); if (k && byKey.has(k)) { hit = k; break; } }
    if (hit) { if (!groups.has(hit)) groups.set(hit, { item: byKey.get(hit), files: [] }); groups.get(hit).files.push(f); } else unknown.add(path.split('/').slice(0, -1).join('/'));
  });
  groups.forEach(g => g.files.sort((a, b) => String(a.webkitRelativePath || a.name).localeCompare(String(b.webkitRelativePath || b.name), undefined, { numeric: true })));
  return { matched: groups, unmatchedFolders: unknown.size, audioFiles: (files || []).filter(f => SND_AUDIO_EXT.test(f.name)).length };
}
async function sndAnalyzeFiles(files, k, useEssentia) {
  const pick = sndPickTracks(files.map((f, i) => ({ trackName: f.name, f })), k).map(x => x.f), fs = [], errors = [];
  for (const f of pick) { try { const a = await sndAnalyzeBuffer(await f.arrayBuffer(), useEssentia); if (a) fs.push(sndFeaturesFromAnalysis(a)); else errors.push('silent'); } catch (e) { errors.push('decode'); } }
  return { f: fs.length ? sndMeanFeatures(fs) : null, n: fs.length, errors };
}

// ----- the background run -----
const sndJob = { running: false, stop: false, pause: false, done: 0, total: 0, stats: {}, log: [], startedAt: 0 };
function sndJobReset() { sndJob.stop = false; sndJob.pause = false; sndJob.done = 0; sndJob.total = 0; sndJob.log = []; sndJob.stats = {}; SND_SOURCE_ORDER.forEach(s => { sndJob.stats[s] = { tried: 0, found: 0 }; }); sndJob.startedAt = Date.now(); sndJob.state = {}; }
function sndLog(msg) { sndJob.log.push(msg); if (sndJob.log.length > 40) sndJob.log.shift(); }
async function sndWaitIfPaused() { while (sndJob.pause && !sndJob.stop) await sndSleep(200); }
function sndNeeds(item, src, scope) { return scope === 'all' ? true : !sndHas(item, src) && !sndRecentMiss(item, src); }
async function sndRunGroup(group, opts) {                                                   // Spotify / ReccoBeats for several releases at once (their calls take many ids)
  const st = sndJob.state, want = group.filter(it => (opts.spotify || opts.recco) && !sndHas(it, 'spotify') && (opts.scope === 'all' || (!sndHas(it, 'recco') && !sndRecentMiss(it, 'recco'))));
  if (!want.length || (st.spotify === 'blocked' || !opts.spotify) && (st.recco === 'dead' || !opts.recco)) return;
  const idsBy = new Map(), all = [];
  for (const it of want) { if (sndJob.stop) return; let tracks = []; try { tracks = await getTracksFor(it); } catch (e) { tracks = []; } const ids = await sndSpotifyIdsFor(it, sndPickTracks(tracks, opts.tracks)); idsBy.set(it, ids); ids.forEach(i => all.push(i)); }
  const uniq = [...new Set(all)];
  if (!uniq.length) {
    if (!sndHasSpotifyCreds()) { if (!st.noIds) { st.noIds = true; sndLog('ReccoBeats looks songs up by Spotify id, and no Spotify Client ID/Secret is set (\u2699 \u2192 Spotify API\u2026), so it was skipped. Previews, your files and tags still run.'); } return; }       // not asked, so not a miss
    want.forEach(it => { sndSetMiss(it, 'recco'); sndJob.stats.recco.tried++; }); return;
  }
  let got = new Map(), src = null;
  if (opts.spotify && st.spotify !== 'blocked') { const r = await sndSpotifyFeatures(uniq); if (r.status === 'blocked') { st.spotify = 'blocked'; sndLog('Spotify refused audio features (your app was created after 27 Nov 2024); using ReccoBeats.'); } else if (r.status === 'ok' && r.map.size) { got = r.map; src = 'spotify'; } else if (r.status === 'nocreds') st.spotify = 'blocked'; }
  if (!got.size && opts.recco && st.recco !== 'dead') { const r = await sndReccoFeatures(uniq); if (r.status === 'network') { st.recco = 'dead'; sndLog('ReccoBeats couldn\u2019t be reached (offline, down, or blocked by the browser).'); } else if (r.status === 'rate') { st.recco = 'dead'; sndLog('ReccoBeats is rate-limiting us; stopped using it for this run.'); } got = r.map; src = 'recco'; }
  want.forEach(it => {
    const fs = (idsBy.get(it) || []).map(id => got.get(id)).filter(Boolean), s = src || 'recco'; sndJob.stats[s].tried++;
    if (fs.length) { sndSetSource(it, s, sndMeanFeatures(fs), fs.length); sndJob.stats[s].found++; } else if (s === 'recco' && st.recco !== 'dead') sndSetMiss(it, 'recco');
  });
  await sndSleep(opts.paceMs.recco);
}
async function sndRunRelease(item, opts, scope) {                                            // the sources that work one release at a time
  const st = sndJob.state;
  const local = sndLocal.matched.get(dupKey(item.artist, item.title));
  if (local && local.files.length && sndNeeds(item, 'calc', scope) || local && scope === 'all') {
    sndJob.stats.calc.tried++; const r = await sndAnalyzeFiles(local.files, opts.tracks, opts.essentia);
    if (r.f) { sndSetSource(item, 'calc', r.f, r.n, { via: 'files' }); sndJob.stats.calc.found++; } else sndSetMiss(item, 'calc');
  } else if (opts.previews && st.previews !== 'dead' && sndNeeds(item, 'calc', scope) && !sndHas(item, 'spotify') && !sndHas(item, 'recco')) {      // previews are the fallback: only for what Spotify/ReccoBeats didn't cover (Apple limits searches to about 20 a minute)
    let tracks = []; try { tracks = await getTracksFor(item); } catch (e) { tracks = []; }
    const urls = sndPickTracks(tracks.filter(t => t.previewUrl), Math.min(3, opts.tracks)).map(t => t.previewUrl);
    if (urls.length) {
      sndJob.stats.calc.tried++; const r = await sndAnalyzeUrls(urls, opts.essentia);
      if (r.f) { sndSetSource(item, 'calc', r.f, r.n, { via: 'previews' }); sndJob.stats.calc.found++; }
      else { sndSetMiss(item, 'calc'); if (r.errors.length && r.errors.every(e => e === 'blocked')) { st.blockedN = (st.blockedN || 0) + 1; if (st.blockedN >= 3) { st.previews = 'dead'; sndLog('The browser won\u2019t let the page read Apple\u2019s previews (cross-origin rules); stopped trying them. Your own files still work.'); } } }
    } else sndSetMiss(item, 'calc');
    await sndSleep(opts.paceMs.previews);
  }
  if (opts.tags && st.tags !== 'dead' && sndNeeds(item, 'tags', scope)) {
    sndJob.stats.tags.tried++; const r = await sndLastfmTags(item);
    if (r.status === 'ok') { sndSetSource(item, 'tags', r.f, 1, { top: r.top }); sndJob.stats.tags.found++; }
    else if (r.status === 'nokey' || r.status === 'badkey') { st.tags = 'dead'; sndLog(r.status === 'nokey' ? 'No Last.fm API key is set, so tags were skipped.' : 'Last.fm rejected the API key; tags were skipped.'); }
    else if (r.status !== 'error') sndSetMiss(item, 'tags');                                    // a failed request isn't "no tags": try again next time
    await sndSleep(opts.paceMs.tags);
  }
}
async function sndRun(items, onProgress) {
  if (sndJob.running) return; sndJobReset(); sndJob.running = true; const opts = sndOpts();
  const todo = items.filter(it => it && it.artist && it.title); sndJob.total = todo.length;
  const tick = () => { try { onProgress && onProgress(); } catch (e) { /* UI gone */ } };
  try {
    for (let i = 0; i < todo.length && !sndJob.stop; i += 8) {
      await sndWaitIfPaused(); if (sndJob.stop) break;
      const group = todo.slice(i, i + 8);
      try { await sndRunGroup(group, opts); } catch (e) { console.warn('sound group failed', e); }
      for (const it of group) { if (sndJob.stop) break; await sndWaitIfPaused(); try { await sndRunRelease(it, opts, opts.scope); } catch (e) { console.warn('sound release failed', it, e); } sndJob.done++; if (sndJob.done % 4 === 0) { sndSaveStore(); tick(); } }
      sndSaveStore(); tick();
    }
  } finally { sndSaveStore(); sndJob.running = false; sndLog(sndJob.stop ? 'Stopped.' : 'Finished.'); tick(); }
}
// ----- test the sources on a handful of releases before committing to a long run -----
async function sndProbe(items, say) {
  const out = {}, sample = []; const pool = (items || []).filter(it => it.artist && it.title); for (let i = 0; i < Math.min(6, pool.length); i++) sample.push(pool[Math.floor(i * (pool.length - 1) / Math.max(1, Math.min(6, pool.length) - 1))]);
  const opts = sndOpts(); say = say || (() => {});
  const tracksOf = new Map(); for (const it of sample) { try { tracksOf.set(it, await getTracksFor(it)); } catch (e) { tracksOf.set(it, []); } }
  // Spotify ids for the sample (used by both Spotify and ReccoBeats checks)
  let ids = []; for (const it of sample) { try { ids = ids.concat(await sndSpotifyIdsFor(it, sndPickTracks(tracksOf.get(it), 2))); } catch (e) { /* none */ } }
  ids = [...new Set(ids)].slice(0, 12);
  // 1 · Spotify
  say('Spotify audio features\u2026');
  if (!ids.length) out.spotify = { ok: false, text: 'Couldn\u2019t test: no Spotify ids could be found for the sample (add your Spotify Client ID and Secret in \u2699 \u2192 Spotify API\u2026).' };
  else { const r = await sndSpotifyFeatures(ids.slice(0, 3)); out.spotify = r.status === 'ok' ? { ok: r.map.size > 0, text: r.map.size ? `Works: ${r.map.size} of ${Math.min(3, ids.length)} test songs came back with features.` : 'Reachable but returned nothing for the test songs.' } : r.status === 'blocked' ? { ok: false, text: `Spotify refused (error ${r.code}). Audio features are closed to Developer apps created after 27 Nov 2024; ReccoBeats covers this instead.` } : r.status === 'nocreds' ? { ok: false, text: 'No Spotify Client ID/Secret set.' } : { ok: false, text: 'Spotify couldn\u2019t be reached (' + r.status + ').' }; }
  // 2 · ReccoBeats
  say('ReccoBeats\u2026');
  const testIds = ids.length ? ids : ['11dFghVXANMlKmJXsNCbNl'], rr = await sndReccoFeatures(testIds.slice(0, 12));
  out.recco = rr.status === 'ok' ? { ok: rr.map.size > 0, text: rr.map.size ? `Works: features for ${rr.map.size} of ${Math.min(12, testIds.length)} test songs${ids.length ? '' : ' (a sample song, since no Spotify ids were available)'}.` : 'Reachable, but it knew none of the test songs.' }
    : rr.status === 'network' ? { ok: false, text: 'Couldn\u2019t reach ReccoBeats: offline, the service is down, or the browser blocked the request (cross-origin rules).' } : rr.status === 'rate' ? { ok: false, text: 'ReccoBeats is rate-limiting right now; try again in a minute.' } : { ok: false, text: 'ReccoBeats answered with an error (' + rr.status + ').' };
  // 3 · previews
  say('Reading an iTunes preview\u2026');
  let pv = null; for (const it of sample) { const t = (tracksOf.get(it) || []).find(x => x.previewUrl); if (t) { pv = t; break; } }
  if (!pv) out.previews = { ok: false, text: 'None of the sample releases has an iTunes preview (they need an iTunes match to have a tracklist).' };
  else { const t0 = Date.now(), r = await sndAnalyzeUrls([pv.previewUrl], opts.essentia); out.previews = r.f ? { ok: true, text: `Works: analysed a 30-second preview in ${((Date.now() - t0) / 1000).toFixed(1)} s (tempo ${r.f.tempo ? Math.round(r.f.tempo) + ' BPM' : 'n/a'}).` } : r.errors[0] === 'blocked' ? { ok: false, text: 'Apple\u2019s server doesn\u2019t allow the page to read previews (cross-origin rules). Use your own files below instead.' } : { ok: false, text: 'Couldn\u2019t analyse the preview (' + (r.errors[0] || 'unknown') + ').' }; }
  // 4 · Last.fm
  say('Last.fm tags\u2026');
  if (!(loadLastfmCreds().apiKey || '').trim()) out.tags = { ok: false, text: 'No Last.fm API key set (\u2699 \u2192 Last.fm\u2026).' };
  else {
    let ok = 0, notags = 0, errs = 0, bad = false; const seen = [];
    for (const it of sample.slice(0, 3)) { const r = await sndLastfmTags(it); if (r.status === 'ok') ok++; else if (r.status === 'none') seen.push(...(r.top || [])); else if (r.status === 'notags') notags++; else if (r.status === 'badkey') { bad = true; break; } else errs++; }
    const eg = [...new Set(seen)].slice(0, 5).join(', ');
    out.tags = bad ? { ok: false, text: 'Last.fm rejected the API key.' }
      : ok ? { ok: true, text: `Works: a mood or style could be read from the tags of ${ok} of ${Math.min(3, sample.length)} test releases.` }
      : seen.length ? { ok: false, text: `Last.fm answered with tags (${eg}), but none say anything about mood or style that can be used. This is the lowest-priority source, so it's fine to leave on.` }
      : notags ? { ok: false, text: 'Last.fm answered, but has no tags for these releases.' }
      : { ok: false, text: 'Couldn\u2019t reach Last.fm (offline, or the browser blocked the request).' };
  }
  // 5 · your folder, 6 · Essentia
  out.files = sndLocal.files.length ? { ok: sndLocal.matched.size > 0, text: `${sndLocal.audioFiles || 0} audio files, ${sndLocal.matched.size} releases matched to your crate.` } : { ok: null, text: 'No folder chosen.' };
  if (opts.essentia) { say('Essentia.js\u2026'); const e = await sndLoadEssentia(); out.essentia = e ? { ok: true, text: 'Loaded.' } : { ok: false, text: 'Couldn\u2019t load (' + sndEssError + '); the built-in analysis is used instead.' }; } else out.essentia = { ok: null, text: 'Off.' };
  return out;
}
// END sound-data

// BEGIN sound-ui
// ---- Sound analysis dialog (⚙ → Sound analysis…) ----
function sndEl(id) { return document.getElementById(id); }
let sndProbeResult = null;
function openSoundDialog() { sndRenderDialog(); el.layoutMenu.hidden = true; sndEl('sndOverlay').hidden = false; }
function closeSoundDialog() { const ov = sndEl('sndOverlay'); if (ov && !ov.hidden) ov.hidden = true; }
function sndScopeItems(opts) { return opts.scope === 'view' ? (state.filtered || []).slice() : (state.raw || []).slice(); }
function sndRenderDialog() {
  const o = sndOpts();
  ['spotify', 'recco', 'previews', 'tags', 'essentia'].forEach(k => { sndEl('sndOpt_' + k).checked = !!o[k]; });
  sndEl('sndTracks').value = String(o.tracks); sndEl('sndScope').value = o.scope;
  sndPaintCoverage(); sndPaintFolder(); sndPaintProbe(); sndPaintProgress();
}
function sndPaintCoverage() {
  const c = sndCoverage(state.raw), bits = SND_SOURCE_ORDER.filter(s => c.by[s]).map(s => `${SND_SOURCE_LABELS[s]} ${c.by[s].toLocaleString()}`);
  sndEl('sndCoverage').textContent = c.total ? `${c.any.toLocaleString()} of ${c.total.toLocaleString()} releases have sound data${bits.length ? ' \u00b7 ' + bits.join(' \u00b7 ') : ''}.` : 'Your crate is empty.';
}
function sndPaintFolder() {
  const t = sndEl('sndFolderStatus');
  t.textContent = sndLocal.files.length ? `${(sndLocal.audioFiles || 0).toLocaleString()} audio files \u00b7 ${sndLocal.matched.size.toLocaleString()} releases matched to your crate${sndLocal.unmatched ? ` \u00b7 ${sndLocal.unmatched} folders matched nothing` : ''}` : 'No folder chosen. Files are read on this device and never uploaded.';
}
function sndPaintProbe() {
  const box = sndEl('sndProbeList'); box.innerHTML = '';
  if (!sndProbeResult) return;
  const names = { spotify: 'Spotify audio features', recco: 'ReccoBeats', previews: 'iTunes previews', tags: 'Last.fm tags', files: 'Your music folder', essentia: 'Essentia.js' };
  Object.keys(names).forEach(k => { const r = sndProbeResult[k]; if (!r) return; const li = document.createElement('li'); li.className = r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'dim'; const b = document.createElement('b'); b.textContent = (r.ok === true ? '\u2713 ' : r.ok === false ? '\u2717 ' : '\u2022 ') + names[k]; li.append(b, document.createTextNode(' \u2014 ' + r.text)); box.appendChild(li); });
}
function sndPaintProgress() {
  const j = sndJob, pct = j.total ? Math.round(100 * j.done / j.total) : 0;
  sndEl('sndBar').style.width = pct + '%'; sndEl('sndBarWrap').setAttribute('aria-valuenow', String(pct));
  const per = SND_SOURCE_ORDER.filter(s => j.stats[s] && j.stats[s].tried).map(s => `${SND_SOURCE_LABELS[s]} ${j.stats[s].found}/${j.stats[s].tried}`).join(' \u00b7 ');
  let eta = ''; if (j.running && j.done > 3) { const sec = (Date.now() - j.startedAt) / j.done * (j.total - j.done) / 1000; eta = sec < 90 ? ' \u00b7 about a minute left' : ` \u00b7 about ${Math.round(sec / 60)} min left`; }
  sndEl('sndProgressText').textContent = j.total ? `${j.done.toLocaleString()} of ${j.total.toLocaleString()} releases${per ? ' \u00b7 ' + per : ''}${j.running ? (j.pause ? ' \u00b7 paused' : eta) : ''}` : '';
  sndEl('sndStart').disabled = j.running; sndEl('sndPause').disabled = !j.running; sndEl('sndStop').disabled = !j.running; sndEl('sndPause').textContent = j.pause ? 'Resume' : 'Pause';
  const log = sndEl('sndLog'); log.textContent = j.log.join('\n'); log.hidden = !j.log.length; sndPaintCoverage();
  if (typeof sndMapOnData === 'function') sndMapOnData();
}
function initSoundAnalysis() {
  const ov = sndEl('sndOverlay'); if (!ov) return;
  sndMapEl('statsModeMap').addEventListener('click', () => setStatsMode('map'));
  sndEl('menuSoundAnalysis').addEventListener('click', openSoundDialog);
  sndEl('sndClose').addEventListener('click', closeSoundDialog);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeSoundDialog(); });
  ['spotify', 'recco', 'previews', 'tags', 'essentia'].forEach(k => sndEl('sndOpt_' + k).addEventListener('change', (e) => { sndSaveOpts({ [k]: e.target.checked }); }));
  sndEl('sndTracks').addEventListener('change', (e) => sndSaveOpts({ tracks: Number(e.target.value) || 4 }));
  sndEl('sndScope').addEventListener('change', (e) => sndSaveOpts({ scope: e.target.value }));
  sndEl('sndPickFolder').addEventListener('click', () => sndEl('sndFolder').click());
  sndEl('sndFolder').addEventListener('change', (e) => {
    sndLocal.files = [...e.target.files]; const m = sndMatchFiles(sndLocal.files, state.raw); sndLocal.matched = m.matched; sndLocal.unmatched = m.unmatchedFolders; sndLocal.audioFiles = m.audioFiles; sndPaintFolder();
  });
  sndEl('sndProbe').addEventListener('click', async () => {
    const b = sndEl('sndProbe'); b.disabled = true; const say = (t) => { sndEl('sndProbeNote').textContent = t; };
    try { sndProbeResult = await sndProbe(state.raw, say); } catch (err) { sndProbeResult = { spotify: { ok: false, text: 'The test itself failed: ' + (err && err.message || err) } }; }
    sndEl('sndProbeNote').textContent = ''; b.disabled = false; sndPaintProbe();
  });
  sndEl('sndStart').addEventListener('click', () => {
    const o = sndOpts(); const items = sndScopeItems(o);
    if (!items.length) { flashGlobalToast('Nothing to analyse in that selection.'); return; }
    sndRun(items, sndPaintProgress); sndPaintProgress();
  });
  sndEl('sndPause').addEventListener('click', () => { sndJob.pause = !sndJob.pause; sndPaintProgress(); });
  sndEl('sndStop').addEventListener('click', () => { sndJob.stop = true; sndJob.pause = false; sndPaintProgress(); });
  const forget = sndEl('sndForget');
  forget.addEventListener('click', () => {
    if (!forget.dataset.armed) { forget.dataset.armed = '1'; forget.textContent = 'Click again to forget everything'; setTimeout(() => { delete forget.dataset.armed; forget.textContent = 'Forget all sound data'; }, 3000); return; }
    delete forget.dataset.armed; forget.textContent = 'Forget all sound data'; sndStore = { v: 1, rel: {} }; sndSaveStore(); sndProbeResult = null; sndRenderDialog(); flashGlobalToast('Sound data forgotten.');
  });
}
// END sound-ui

// BEGIN sound-map
// ---- The map (Stats → Map): every release a dot, placed by how it sounds, by its genres, or by any two things you choose ----
const SND_MAP_PREFS_KEY = 'crate_map_prefs_v1';
const SND_MAP_VIEWS = {
  sound: { label: 'Sound map: similar-sounding releases sit together', x: 'sound1', y: 'sound2' },
  genre: { label: 'Genre map: similar genres sit together', x: 'genre1', y: 'genre2' },
  mood: { label: 'Mood: sad to happy across, mellow to intense up', x: 'valence', y: 'energy' },
  tempoenergy: { label: 'Tempo across, energy up', x: 'tempo', y: 'energy' },
  yearenergy: { label: 'Year across, energy up', x: 'year', y: 'energy' },
  yeartempo: { label: 'Year across, tempo up', x: 'year', y: 'tempo' },
  yearsound: { label: 'Year across, sound up (first sound axis)', x: 'year', y: 'sound1' },
  yeargenre: { label: 'Year across, genre up (first genre axis)', x: 'year', y: 'genre1' },
  custom: { label: 'Choose the two axes myself\u2026', x: null, y: null }
};
const sndMap = { type: 'map', view: 'sound', x: 'year', y: 'energy', color: 'decade', size: 'same', find: '', points: [], axisX: null, axisY: null, excluded: 0, why: '',
  cam: { cx: 0.5, cy: 0.5, k: 1 }, hover: -1, sel: -1, selSet: new Set(), near: [], rect: null, selectMode: false, cache: null, net: null, screen: [], plot: { l: 0, t: 0, w: 0, h: 0 }, raf: 0, ptr: new Map(), moved: 0, pinch: 0 };
function sndMapEl(id) { return document.getElementById(id); }
function sndMapLoadPrefs() { try { const p = JSON.parse(localStorage.getItem(SND_MAP_PREFS_KEY) || '{}'); ['type', 'view', 'x', 'y', 'color', 'size'].forEach(k => { if (typeof p[k] === 'string') sndMap[k] = p[k]; }); if (!SND_MAP_VIEWS[sndMap.view]) sndMap.view = 'sound'; if (sndMap.type !== 'network') sndMap.type = 'map'; } catch (e) { /* defaults */ } }
function sndMapSavePrefs() { try { localStorage.setItem(SND_MAP_PREFS_KEY, JSON.stringify({ type: sndMap.type, view: sndMap.view, x: sndMap.x, y: sndMap.y, color: sndMap.color, size: sndMap.size })); } catch (e) { /* not remembered */ } }
function sndYearOf(r) { const ms = dateVal(r.releaseDate); return ms === -Infinity ? null : new Date(ms).getUTCFullYear(); }
function sndPercentileScale(vals) {                                    // unit scale that ignores the extreme 2% each end, so one odd release can't squash the rest
  const v = vals.filter(x => x != null && isFinite(x)).sort((a, b) => a - b); if (!v.length) return { lo: 0, hi: 1 };
  let lo = v[Math.floor(v.length * 0.02)], hi = v[Math.min(v.length - 1, Math.ceil(v.length * 0.98) - 1)]; if (hi - lo < 1e-9) { lo = v[0]; hi = v[v.length - 1]; } if (hi - lo < 1e-9) { lo -= 1; hi += 1; } return { lo, hi };
}
function sndMapCache() {
  const c = sndMap.cache;
  if (c && c.raw === state.raw && c.ver === sndVersion && c.len === state.raw.length) return c;
  const items = state.raw || [], merged = items.map(sndMerged);
  sndMap.cache = { raw: state.raw, ver: sndVersion, len: items.length, items, merged, fs: merged.map(m => m.f), audio: null, genre: null, plays: null };
  return sndMap.cache;
}
function sndMapAudio(c) {
  if (c.audio) return c.audio;
  const cols = SND_FIELDS.map(f => f.key), ok = c.fs.map(f => Object.keys(f || {}).filter(k => cols.includes(k)).length >= 2), table = sndAudioRows(c.fs.map((f, i) => ok[i] ? f : null), cols);
  const idx = []; ok.forEach((u, i) => { if (u) idx.push(i); });
  const pca = table.columns.length >= 2 && idx.length >= 3 ? sndPCA(idx.map(i => table.rows[i]), table.columns.length, 2) : null;
  const dense = new Array(c.items.length).fill(null); idx.forEach(i => { const v = new Array(table.columns.length).fill(0); table.rows[i].forEach(p => { v[p[0]] = p[1]; }); dense[i] = v; });
  c.audio = { table, idx, pca, dense, usable: idx.length }; return c.audio;
}
function sndMapGenre(c) {
  if (c.genre) return c.genre;
  const lists = c.items.map(r => getGenreList(combinedGenreStr(r))), g = sndGenreRows(lists, gn => getGenreAncestors(state.genreTaxonomy, gn), genreTaxonomyKey);
  const idx = []; g.rows.forEach((r, i) => { if (r.length) idx.push(i); });
  const pca = idx.length >= 3 && g.vocab.length >= 2 ? sndPCA(idx.map(i => g.rows[i]), g.vocab.length, 2) : null;
  c.genre = { rows: g.rows, vocab: g.vocab, idx, pca, usable: idx.length }; return c.genre;
}
function sndMapPlays(c) { if (!c.plays) { try { c.plays = genrePlayMap(); } catch (e) { c.plays = new Map(); } } return c.plays; }
// An axis: { id, label, values[], lo, hi, ends, fmt, jitter }. values are raw numbers (or null for "unknown"); lo..hi is what spans 0..1 on screen.
function sndMapAxis(id, c) {
  const n = c.items.length;
  if (id === 'year') { const v = c.items.map(sndYearOf), ys = v.filter(x => x != null); const lo = ys.length ? Math.min(...ys) - 1 : 1960, hi = ys.length ? Math.max(...ys) + 1 : 2025; return { id, label: 'Release year', values: v, lo, hi, fmt: (x) => String(Math.round(x)), kind: 'year', jitter: 0.35 }; }
  if (SND_FIELD.has(id)) { const f = SND_FIELD.get(id); return { id, label: f.label, values: c.fs.map(x => (x && x[id] != null) ? x[id] : null), lo: f.min, hi: f.max, fmt: (x) => id === 'tempo' ? String(Math.round(x)) : id === 'loudness' ? Math.round(x) + ' dB' : x.toFixed(1), kind: 'feature', ends: { neg: [f.lo], pos: [f.hi] } }; }
  const m = /^(sound|genre)([12])$/.exec(id); if (!m) return null;
  const k = Number(m[2]) - 1, d = m[1] === 'sound' ? sndMapAudio(c) : sndMapGenre(c); if (!d.pca) return { id, label: m[1] === 'sound' ? 'Sound axis ' + (k + 1) : 'Genre axis ' + (k + 1), values: new Array(n).fill(null), lo: 0, hi: 1, fmt: () => '', kind: 'pc', empty: true, ends: { neg: [], pos: [] } };
  const raw = new Array(n).fill(null); d.idx.forEach((i, j) => { raw[i] = d.pca.coords[j][k]; });
  const sc = sndPercentileScale(raw), comp = d.pca.components[k];
  const ends = m[1] === 'sound' ? sndAxisEnds(comp, (col, high) => { const f = SND_FIELD.get(d.table.columns[col]); return f ? (high ? f.hi : f.lo) : null; }, 2) : sndAxisEnds(comp, (col, high) => high ? d.vocab[col] : null, 3);
  return { id, label: (m[1] === 'sound' ? 'Sound axis ' : 'Genre axis ') + (k + 1) + ` \u00b7 ${Math.round(100 * d.pca.explained[k])}%`, tip: `${Math.round(100 * d.pca.explained[k])}% of the differences between your releases run along this axis`, values: raw, lo: sc.lo, hi: sc.hi, fmt: () => '', kind: 'pc', jitter: m[1] === 'genre' ? 0.012 : 0, ends };
}
function sndMapColors(c, mode, pts) {
  const legend = []; let fn;
  if (mode === 'rating') { fn = (it) => { const r = Number(it.rating) || 0; return r ? `hsl(42, 75%, ${28 + r * 8}%)` : 'hsl(215, 14%, 42%)'; }; legend.push({ label: 'Unrated', color: 'hsl(215, 14%, 42%)' }, { label: '1\u2605', color: 'hsl(42, 75%, 36%)' }, { label: '3\u2605', color: 'hsl(42, 75%, 52%)' }, { label: '5\u2605', color: 'hsl(42, 75%, 68%)' }); }
  else if (mode === 'type') { const col = { Album: '#D6A24C', EP: '#6FBF8E', Single: '#6FA8DC', Compilation: '#C78BE0', Live: '#E5734A', Mixtape: '#E0C05C', Unknown: '#7d8695' }; fn = (it) => col[it.type] || col.Unknown; Object.keys(col).forEach(k => { if (pts.some(p => (p.item.type || 'Unknown') === k || (k === 'Unknown' && !col[p.item.type]))) legend.push({ label: k, color: col[k] }); }); }
  else if (mode === 'source') { const col = { spotify: '#6FBF8E', recco: '#6FA8DC', calc: '#D6A24C', tags: '#C78BE0', none: '#6b7482' }; const of = (i) => { const m = c.merged[i].from; return m.energy || m.tempo || m.valence || Object.values(m)[0] || 'none'; }; fn = (it, i) => col[of(i)]; SND_SOURCE_ORDER.concat('none').forEach(s => { if (pts.some(p => of(p.i) === s)) legend.push({ label: s === 'none' ? 'No sound data' : SND_SOURCE_LABELS[s], color: col[s] }); }); }
  else if (mode === 'family') {
    const fam = new Map(), famOf = (it) => { const g = getGenreList(combinedGenreStr(it))[0]; if (!g || g === 'Unknown') return 'Unknown'; const a = getGenreAncestors(state.genreTaxonomy, g); return a.length ? a[a.length - 1] : g; };
    const count = new Map(); pts.forEach(p => { const f = famOf(p.item); fam.set(p.i, f); count.set(f, (count.get(f) || 0) + 1); });
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(e => e[0]), hue = (f) => { let h = 0; for (const ch of f) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
    fn = (it, i) => top.includes(fam.get(i)) ? `hsl(${hue(fam.get(i))}, 60%, 58%)` : 'hsl(215, 10%, 50%)'; top.forEach(f => legend.push({ label: f, color: `hsl(${hue(f)}, 60%, 58%)` })); if (count.size > top.length) legend.push({ label: 'Other', color: 'hsl(215, 10%, 50%)' });
  } else {                                                          // decade: cool (old) to warm (recent)
    const decs = [...new Set(pts.map(p => { const y = sndYearOf(p.item); return y == null ? null : Math.floor(y / 10) * 10; }).filter(d => d != null))].sort((a, b) => a - b);
    const col = (d) => { const t = decs.length > 1 ? decs.indexOf(d) / (decs.length - 1) : 0.5; return `hsl(${Math.round(225 - 205 * t)}, 70%, 60%)`; };
    fn = (it) => { const y = sndYearOf(it); return y == null ? 'hsl(215, 10%, 50%)' : col(Math.floor(y / 10) * 10); }; decs.forEach(d => legend.push({ label: d + 's', color: col(d) })); if (pts.some(p => sndYearOf(p.item) == null)) legend.push({ label: 'Undated', color: 'hsl(215, 10%, 50%)' });
  }
  return { fn, legend };
}
function sndMapBuildPoints() {
  const c = sndMapCache(), v = SND_MAP_VIEWS[sndMap.view], xid = v.x || sndMap.x, yid = v.y || sndMap.y;
  const ax = sndMapAxis(xid, c), ay = sndMapAxis(yid, c); sndMap.axisX = ax; sndMap.axisY = ay;
  const plays = sndMap.size === 'plays' ? sndMapPlays(c) : null, pts = [];
  [ax, ay].forEach(a => {                                           // a year axis spans the years of the releases actually plotted, not of the whole crate
    if (!a || a.kind !== 'year') return; const other = a === ax ? ay : ax, ys = [];
    c.items.forEach((it, i) => { if (a.values[i] != null && other && other.values[i] != null) ys.push(a.values[i]); });
    if (ys.length) { a.lo = Math.min(...ys) - 1; a.hi = Math.max(...ys) + 1; }
  });
  c.items.forEach((it, i) => {
    let x = ax && ax.values[i], y = ay && ay.values[i]; if (x == null || y == null) return;
    let ux = (x - ax.lo) / (ax.hi - ax.lo), uy = (y - ay.lo) / (ay.hi - ay.lo);
    if (ax.jitter || ay.jitter) { const r = sndRng(i * 2654435761 >>> 0); ux += ax.kind === 'year' ? (r() - 0.5) * 2 * ax.jitter / (ax.hi - ax.lo) : (r() - 0.5) * 2 * (ax.jitter || 0); uy += ay.kind === 'year' ? (r() - 0.5) * 2 * ay.jitter / (ay.hi - ay.lo) : (r() - 0.5) * 2 * (ay.jitter || 0); }
    const rating = Number(it.rating) || 0, p = plays ? (plays.get(lastfmNormKey(it.artist, it.title)) || 0) : 0;
    const r = sndMap.size === 'rating' ? 3 + rating : sndMap.size === 'plays' ? 3 + Math.min(6, Math.log2(1 + p) * 1.5) : 4.5;
    pts.push({ i, item: it, x: sndClamp(ux, -0.1, 1.1), y: sndClamp(uy, -0.1, 1.1), r });
  });
  const col = sndMapColors(c, sndMap.color, pts); pts.forEach(p => { p.color = col.fn(p.item, p.i); }); sndMap.legend = col.legend;
  sndMap.points = pts; sndMap.excluded = c.items.length - pts.length;
  const needSound = [xid, yid].some(id => /^sound/.test(id) || SND_FIELD.has(id)), needGenre = [xid, yid].some(id => /^genre/.test(id));
  sndMap.why = needSound ? 'have no sound data yet' : needGenre ? 'have no genre' : 'have no date';
  sndMap.sel = -1; sndMap.selSet = new Set(); sndMap.near = []; sndMap.hover = -1;
}
// ---- drawing ----
function sndFitLabel(g, base, ends, arrows, maxW) {                  // "Sound axis 1 · 76%   ← electric · intense | acoustic · mellow →", shortened until it fits the room it has
  const mk = (n) => base + (ends && (ends.neg.length || ends.pos.length) ? `   ${arrows[0]} ${ends.neg.slice(0, n).join(' \u00b7 ')}  |  ${ends.pos.slice(0, n).join(' \u00b7 ')} ${arrows[1]}` : '');
  for (const n of [3, 2, 1]) { const t = mk(n); if (g.measureText(t).width <= maxW) return t; }
  let t = mk(1); while (t.length > 4 && g.measureText(t + '\u2026').width > maxW) t = t.slice(0, -1); return t + '\u2026';
}
function sndMapCam() { return sndMap.cam; }
function sndMapToScreen(x, y) { const P = sndMap.plot, k = sndMap.cam.k * 0.9; return [P.l + P.w * (0.5 + (x - sndMap.cam.cx) * k), P.t + P.h * (0.5 - (y - sndMap.cam.cy) * k)]; }
function sndMapFromScreen(sx, sy) { const P = sndMap.plot, k = sndMap.cam.k * 0.9; return [((sx - P.l) / P.w - 0.5) / k + sndMap.cam.cx, (0.5 - (sy - P.t) / P.h) / k + sndMap.cam.cy]; }
function sndMapDirty() { if (sndMap.raf) return; sndMap.raf = requestAnimationFrame(() => { sndMap.raf = 0; sndMapDraw(); }); }
function sndMapSize(canvas) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  return { w, h, dpr };
}
function sndMapDraw() {
  const canvas = sndMapEl('smapCanvas'); if (!canvas || !canvas.clientWidth) return;
  const { w, h, dpr } = sndMapSize(canvas), g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement), dim = (cs.getPropertyValue('--text-dim') || '#9aa3b2').trim(), line = (cs.getPropertyValue('--line') || '#2b3340').trim(), text = (cs.getPropertyValue('--text') || '#E8E4DA').trim(), accent = (cs.getPropertyValue('--accent') || '#D6A24C').trim();
  sndMap.plot = { l: sndMap.type === 'network' ? 8 : 52, t: 10, w: w - (sndMap.type === 'network' ? 16 : 66), h: h - (sndMap.type === 'network' ? 20 : 62) };
  if (sndMap.type === 'network') return sndMapDrawNet(g, w, h, { dim, line, text, accent });
  const P = sndMap.plot, ax = sndMap.axisX, ay = sndMap.axisY; g.font = '11px system-ui, sans-serif'; g.textBaseline = 'middle';
  // grid and tick labels
  g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = dim;
  const tickValues = (axis, vertical) => {
    const [a, b] = vertical ? [sndMapFromScreen(0, P.t + P.h)[1], sndMapFromScreen(0, P.t)[1]] : [sndMapFromScreen(P.l, 0)[0], sndMapFromScreen(P.l + P.w, 0)[0]], out = [];
    if (axis.kind === 'year') { const span = (axis.hi - axis.lo) * (b - a), step = span > 60 ? 20 : span > 30 ? 10 : span > 12 ? 5 : span > 6 ? 2 : 1; for (let y = Math.ceil((axis.lo + a * (axis.hi - axis.lo)) / step) * step; y <= axis.lo + b * (axis.hi - axis.lo); y += step) out.push({ u: (y - axis.lo) / (axis.hi - axis.lo), label: String(y) }); }
    else for (let i = 0; i <= 4; i++) { const u = i / 4; out.push({ u, label: axis.kind === 'feature' ? axis.fmt(axis.lo + u * (axis.hi - axis.lo)) : '' }); }
    return out;
  };
  if (ax) tickValues(ax, false).forEach(t => { const sx = sndMapToScreen(t.u, 0)[0]; if (sx < P.l - 1 || sx > P.l + P.w + 1) return; g.beginPath(); g.moveTo(sx, P.t); g.lineTo(sx, P.t + P.h); g.stroke(); if (t.label) { g.textAlign = 'center'; g.fillText(t.label, sx, P.t + P.h + 12); } });
  if (ay) tickValues(ay, true).forEach(t => { const sy = sndMapToScreen(0, t.u)[1]; if (sy < P.t - 1 || sy > P.t + P.h + 1) return; g.beginPath(); g.moveTo(P.l, sy); g.lineTo(P.l + P.w, sy); g.stroke(); if (t.label) { g.textAlign = 'right'; g.fillText(t.label, P.l - 6, sy); } });
  g.strokeRect(P.l, P.t, P.w, P.h);
  // axis names
  g.fillStyle = text; g.textAlign = 'center';
  if (ax) g.fillText(sndFitLabel(g, ax.label, ax.kind === 'pc' ? ax.ends : null, ['\u2190', '\u2192'], P.w - 8), P.l + P.w / 2, P.t + P.h + 32);
  if (ay) { g.save(); g.translate(12, P.t + P.h / 2); g.rotate(-Math.PI / 2); g.fillText(sndFitLabel(g, ay.label, ay.kind === 'pc' ? ay.ends : null, ['\u2193', '\u2191'], P.h - 8), 0, 0); g.restore(); }
  // dots
  g.save(); g.beginPath(); g.rect(P.l, P.t, P.w, P.h); g.clip();
  const q = sndMap.find.trim().toLowerCase(), hasFind = q.length > 0, nearSet = new Set(sndMap.near.map(n => n.pi)), selSet = sndMap.selSet;
  sndMap.screen = new Array(sndMap.points.length);
  sndMap.points.forEach((p, pi) => {
    const [sx, sy] = sndMapToScreen(p.x, p.y); sndMap.screen[pi] = [sx, sy];
    if (sx < P.l - 12 || sx > P.l + P.w + 12 || sy < P.t - 12 || sy > P.t + P.h + 12) return;
    const hit = !hasFind || (p.item.artist + ' ' + p.item.title + ' ' + (p.item.genre || '') + ' ' + (p.item.genre2 || '')).toLowerCase().includes(q); p.hit = hit;
    g.globalAlpha = hit ? 0.88 : 0.12; g.fillStyle = p.color; g.beginPath(); g.arc(sx, sy, p.r * Math.min(1.8, Math.max(0.7, Math.sqrt(sndMap.cam.k))), 0, 6.2832); g.fill();
  });
  g.globalAlpha = 1; g.lineWidth = 2;
  sndMap.points.forEach((p, pi) => {
    const s = sndMap.screen[pi]; if (!s) return; const r = p.r * Math.min(1.8, Math.max(0.7, Math.sqrt(sndMap.cam.k)));
    if (selSet.has(pi) || pi === sndMap.sel) { g.strokeStyle = accent; g.beginPath(); g.arc(s[0], s[1], r + 3, 0, 6.2832); g.stroke(); }
    else if (nearSet.has(pi)) { g.strokeStyle = '#6FBF8E'; g.beginPath(); g.arc(s[0], s[1], r + 2.5, 0, 6.2832); g.stroke(); }
    else if (pi === sndMap.hover) { g.strokeStyle = text; g.beginPath(); g.arc(s[0], s[1], r + 2.5, 0, 6.2832); g.stroke(); }
  });
  if (sndMap.sel >= 0 && sndMap.near.length) { g.strokeStyle = 'rgba(111,191,142,0.35)'; g.lineWidth = 1; const a = sndMap.screen[sndMap.sel]; sndMap.near.forEach(n => { const b = sndMap.screen[n.pi]; if (a && b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } }); }
  if (sndMap.rect) { const r = sndMap.rect; g.fillStyle = 'rgba(214,162,76,0.12)'; g.strokeStyle = accent; g.lineWidth = 1; g.fillRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0)); g.strokeRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0)); }
  g.restore();
  if (!sndMap.points.length) { g.fillStyle = dim; g.textAlign = 'center'; g.font = '14px system-ui, sans-serif'; g.fillText('Nothing to plot for this view yet.', w / 2, h / 2 - 8); g.font = '12px system-ui, sans-serif'; g.fillText(sndMap.why.includes('sound') ? 'Releases need sound data: use Analyse sound\u2026 above.' : 'Releases need ' + sndMap.why.replace('have no ', 'a ') + '.', w / 2, h / 2 + 12); }
}
// ---- the genre network ----
function sndMapNetwork() {
  const c = sndMapCache(); if (sndMap.net && sndMap.net.raw === c.raw && sndMap.net.tax === state.genreTaxonomy && sndMap.net.len === c.len) return sndMap.net;
  const lists = c.items.map(r => getGenreList(combinedGenreStr(r))), net = sndGenreNetwork(lists, gn => getGenreParents(state.genreTaxonomy, gn), genreTaxonomyKey, { maxNodes: 60, perRelease: 3 });
  const pos = sndForceLayout(net.nodes.length, net.edges, { iterations: 300 }), famOf = (g) => { const a = getGenreAncestors(state.genreTaxonomy, g); return a.length ? a[a.length - 1] : g; };
  net.nodes.forEach((n, i) => { n.x = pos[i][0]; n.y = pos[i][1]; n.family = famOf(n.genre); }); sndMap.net = Object.assign(net, { raw: c.raw, tax: state.genreTaxonomy, len: c.len });
  return sndMap.net;
}
function sndNetHue(f) { let h = 0; for (const ch of String(f)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; }
function sndMapDrawNet(g, w, h, th) {
  const net = sndMapNetwork(), P = sndMap.plot; g.font = '11px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const toS = (n) => { const k = sndMap.cam.k * 0.86; return [P.l + P.w * (0.5 + (n.x / 2 - (sndMap.cam.cx - 0.5)) * k), P.t + P.h * (0.5 - (-n.y / 2 + (sndMap.cam.cy - 0.5)) * k)]; };
  sndMap.screen = net.nodes.map(toS); const maxC = net.nodes.reduce((m, n) => Math.max(m, n.count), 1), maxW = net.edges.reduce((m, e) => Math.max(m, e[2]), 1);
  g.save(); g.beginPath(); g.rect(P.l, P.t, P.w, P.h); g.clip();
  const hov = sndMap.hover, link = new Set(); if (hov >= 0) net.edges.forEach(e => { if (e[0] === hov) link.add(e[1]); if (e[1] === hov) link.add(e[0]); });
  net.edges.forEach(e => { const a = sndMap.screen[e[0]], b = sndMap.screen[e[1]], on = hov >= 0 && (e[0] === hov || e[1] === hov); g.strokeStyle = on ? th.accent : th.line; g.globalAlpha = hov >= 0 && !on ? 0.25 : 0.4 + 0.5 * e[2] / maxW; g.lineWidth = 0.6 + 2.4 * e[2] / maxW; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
  g.globalAlpha = 1; const zoom = Math.min(1.8, Math.max(0.7, Math.sqrt(sndMap.cam.k)));
  net.nodes.forEach((n, i) => { const s = sndMap.screen[i], r = (5 + 14 * Math.sqrt(n.count / maxC)) * zoom; n.r = r; g.fillStyle = `hsl(${sndNetHue(n.family)}, 60%, 58%)`; g.globalAlpha = hov >= 0 && i !== hov && !link.has(i) ? 0.35 : 0.92; g.beginPath(); g.arc(s[0], s[1], r, 0, 6.2832); g.fill(); if (i === hov) { g.strokeStyle = th.text; g.lineWidth = 2; g.globalAlpha = 1; g.stroke(); } });
  g.globalAlpha = 1; g.fillStyle = th.text;
  net.nodes.forEach((n, i) => { if (n.count >= Math.max(2, maxC * 0.25) || i === hov || link.has(i) || sndMap.cam.k > 1.8) { const s = sndMap.screen[i]; g.fillText(n.genre, s[0], s[1] + n.r + 9); } });
  g.restore(); if (!net.nodes.length) { g.fillStyle = th.dim; g.font = '14px system-ui, sans-serif'; g.fillText('No genres to show yet.', w / 2, h / 2); }
}
// ---- hit testing, selection, neighbours ----
function sndMapHit(sx, sy) {
  let best = -1, bd = Infinity; const lim = sndMap.type === 'network' ? 0 : 3;
  if (sndMap.type === 'network') { const net = sndMapNetwork(); net.nodes.forEach((n, i) => { const s = sndMap.screen[i]; if (!s) return; const d = Math.hypot(s[0] - sx, s[1] - sy); if (d <= (n.r || 8) + 2 && d < bd) { bd = d; best = i; } }); return best; }
  sndMap.points.forEach((p, pi) => { const s = sndMap.screen[pi]; if (!s) return; const d = Math.hypot(s[0] - sx, s[1] - sy); if (d <= p.r * Math.min(1.8, Math.max(0.7, Math.sqrt(sndMap.cam.k))) + lim && d < bd) { bd = d; best = pi; } });
  return best;
}
function sndMapScreen(pi) { return sndMap.screen[pi] || null; }
function sndMapNeighboursFor(pi) {
  const c = sndMapCache(), p = sndMap.points[pi]; if (!p) return { kind: '', list: [] };
  const a = sndMapAudio(c); let out = [], kind = 'genre';
  if (a.dense[p.i]) { out = sndNeighbours('dense', a.dense, p.i, 8); kind = 'sound'; }
  if (!out.length) { const gd = sndMapGenre(c); out = sndNeighbours('sparse', gd.rows, p.i, 8); kind = 'genre'; }
  const byItem = new Map(sndMap.points.map((q, i) => [q.i, i])), list = out.map(o => ({ pi: byItem.get(o.index), i: o.index, score: o.score })).filter(o => o.pi !== undefined);
  return { kind, list };
}
function sndMapSelect(pi, additive) {
  if (pi < 0 || !sndMap.points[pi]) { sndMap.sel = -1; sndMap.selSet = new Set(); sndMap.near = []; }
  else { sndMap.sel = pi; sndMap.selSet = new Set(); const nb = sndMapNeighboursFor(pi); sndMap.near = nb.list; sndMap.nearKind = nb.kind; }
  sndMapPaintSide(); sndMapDirty();
}
function sndMapSelectRect(r) {
  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1), set = new Set();
  sndMap.points.forEach((p, pi) => { const s = sndMap.screen[pi]; if (s && s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1) set.add(pi); });
  sndMap.selSet = set; sndMap.sel = -1; sndMap.near = []; sndMapPaintSide(); sndMapDirty();
}
function sndMapSelectedItems() { return sndMap.selSet.size ? [...sndMap.selSet].map(pi => sndMap.points[pi].item) : sndMap.sel >= 0 ? [sndMap.points[sndMap.sel].item] : []; }
// ---- the side panel ----
function sndMapFeatureLines(i) { const m = sndMapCache().merged[i], out = []; SND_FIELDS.forEach(f => { if (m.f[f.key] != null) out.push({ f, v: m.f[f.key], src: m.from[f.key] }); }); return out; }
function sndMapPaintSide() {
  const box = sndMapEl('smapSide'); if (!box) return; box.innerHTML = '';
  const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; box.appendChild(e); return e; };
  const btn = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls || 'ai-link-btn'; b.textContent = label; b.addEventListener('click', fn); return b; };
  if (sndMap.type === 'network') { add('p', 'sm-dim', 'Each circle is a genre, sized by how many releases you have in it. Lines join genres that share releases, and each genre to the one it falls under. Click a genre to open its page.'); return; }
  if (sndMap.selSet.size) {
    const items = sndMapSelectedItems(); add('h3', 'smap-side-title', `${items.length.toLocaleString()} release${items.length === 1 ? '' : 's'} selected`);
    const ul = add('ul', 'smap-list'); items.slice(0, 10).forEach(it => { const li = document.createElement('li'); li.textContent = `${it.artist} \u2014 ${it.title}`; ul.appendChild(li); }); if (items.length > 10) add('p', 'sm-dim', `\u2026 and ${items.length - 10} more`);
    const row = add('div', 'smap-actions');
    row.append(btn('Play', () => playAlbumsReplacingQueue(items), 'config-btn'), btn('Add to queue', async () => { for (const it of items) await queueAlbumTracks(it); flashGlobalToast(`Queued ${items.length} releases.`); }), btn('Export\u2026', () => openCxExport({ kind: 'rows', rows: items.map(r => r.row), label: `${items.length} releases you selected on the map` })), btn('Clear', () => sndMapSelect(-1)));
    return;
  }
  if (sndMap.sel >= 0) {
    const p = sndMap.points[sndMap.sel], it = p.item; add('h3', 'smap-side-title', it.title); add('p', 'sm-dim', `${it.artist}${sndYearOf(it) ? ' \u00b7 ' + sndYearOf(it) : ''}${it.type && it.type !== 'Unknown' ? ' \u00b7 ' + it.type : ''}`);
    const genres = getGenreList(combinedGenreStr(it)).filter(g => g !== 'Unknown'); if (genres.length) add('p', 'sm-dim', genres.join(', '));
    const lines = sndMapFeatureLines(p.i);
    if (lines.length) { const dl = add('dl', 'smap-feat'); lines.forEach(l => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = l.f.label.replace(/ \(.*\)$/, ''); dd.textContent = (l.f.key === 'tempo' ? Math.round(l.v) + ' BPM' : l.f.key === 'loudness' ? Math.round(l.v) + ' dB' : l.v.toFixed(2)) + ` \u00b7 ${SND_SOURCE_LABELS[l.src]}`; dl.append(dt, dd); }); } else add('p', 'sm-dim', 'No sound data yet for this release.');
    const row = add('div', 'smap-actions'); row.append(btn('Open album', () => openDeck(it), 'config-btn'), btn('Play', () => playAlbumReplacingQueue(it)), btn('Clear', () => sndMapSelect(-1)));
    if (sndMap.near.length) { add('h4', 'smap-side-sub', sndMap.nearKind === 'sound' ? 'Sounds most like' : 'Genres most like'); const ul = add('ul', 'smap-list smap-near'); sndMap.near.forEach(n => { const q = sndMapCache().items[n.i], li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.className = 'smap-near-btn'; b.textContent = `${q.artist} \u2014 ${q.title}`; const sp = document.createElement('span'); sp.className = 'sm-dim'; sp.textContent = ` ${Math.round(n.score * 100)}%`; b.appendChild(sp); b.addEventListener('click', () => { sndMapSelect(n.pi); }); li.appendChild(b); ul.appendChild(li); }); }
    return;
  }
  add('p', 'sm-dim', 'Click a dot to see what it is and what sounds most like it. Drag to move around, scroll or pinch to zoom, and Shift-drag (or the \u25ad button) to select an area to play, queue or export.');
}
function sndMapPaintLegend() {
  const lg = sndMapEl('smapLegend'); if (!lg) return; lg.innerHTML = '';
  if (sndMap.type === 'network') return;
  (sndMap.legend || []).forEach(l => { const s = document.createElement('span'); s.className = 'smap-leg'; const d = document.createElement('i'); d.style.background = l.color; s.append(d, document.createTextNode(' ' + l.label)); lg.appendChild(s); });
}
function sndMapPaintCoverage() {
  const t = sndMapEl('smapCoverage'); if (!t) return; const c = sndMapCache(), cov = sndCoverage(state.raw);
  if (sndMap.type === 'network') { const n = sndMapNetwork(); t.textContent = `${n.nodes.length} genres shown (the most common ones).`; return; }
  const a = sndMapAudio(c), g = sndMapGenre(c), v = SND_MAP_VIEWS[sndMap.view], uses = [v.x || sndMap.x, v.y || sndMap.y];
  const sound = uses.some(id => /^sound/.test(id) || SND_FIELD.has(id)), genre = uses.some(id => /^genre/.test(id));
  t.textContent = `${sndMap.points.length.toLocaleString()} of ${c.items.length.toLocaleString()} releases plotted` + (sndMap.excluded ? ` (${sndMap.excluded.toLocaleString()} ${sndMap.why})` : '') + (sound ? ` \u00b7 ${cov.any.toLocaleString()} have sound data` : '') + (genre && !sound ? '' : '') + '.';
}
let sndMapReady = false;                                                   // the map is set up the first time it is shown, not at startup (it costs nothing for anyone who never opens it)
function sndMapRender() {
  const wrap = sndMapEl('statsMapWrap'); if (!wrap || wrap.hidden) return;
  if (!sndMapReady) { sndMapReady = true; sndMapInit(); }
  if (sndMap.type === 'network') { sndMapNetwork(); sndMap.points = []; } else sndMapBuildPoints();
  sndMapEl('smapAxes').hidden = !(sndMap.type === 'map' && sndMap.view === 'custom');
  sndMapPaintLegend(); sndMapPaintCoverage(); sndMapPaintSide(); sndMapDirty();
}
function sndMapOnData() { sndMap.cache = null; const w = sndMapEl('statsMapWrap'); if (w && !w.hidden) sndMapRender(); }
function sndMapResetCam() { sndMap.cam = { cx: 0.5, cy: 0.5, k: 1 }; sndMapDirty(); }
function sndMapZoomAt(sx, sy, f) {
  const before = sndMapFromScreen(sx, sy), k = sndClamp(sndMap.cam.k * f, 0.4, 40); sndMap.cam.k = k;
  const after = sndMapFromScreen(sx, sy); sndMap.cam.cx += before[0] - after[0]; sndMap.cam.cy += before[1] - after[1]; sndMapDirty();
}
function sndMapTip(pi, sx, sy) {
  const tip = sndMapEl('smapTip'); if (pi < 0) { tip.hidden = true; return; }
  let a = '', b = '';
  if (sndMap.type === 'network') { const n = sndMapNetwork().nodes[pi]; a = n.genre; b = `${n.count} release${n.count === 1 ? '' : 's'}`; }
  else { const p = sndMap.points[pi], it = p.item, y = sndYearOf(it); a = `${it.artist} \u2014 ${it.title}`; b = [y, ...[sndMap.axisX, sndMap.axisY].filter(x => x && x.kind === 'feature').map(x => `${x.label.replace(/ \(.*\)$/, '')} ${x.fmt(x.values[p.i])}`)].filter(Boolean).join(' \u00b7 '); }
  tip.textContent = ''; const s1 = document.createElement('b'); s1.textContent = a; tip.appendChild(s1); if (b) { const s2 = document.createElement('div'); s2.textContent = b; tip.appendChild(s2); }
  tip.hidden = false; const W = sndMapEl('smapStage').clientWidth; tip.style.left = Math.min(Math.max(4, sx + 12), W - tip.offsetWidth - 4) + 'px'; tip.style.top = Math.max(4, sy - tip.offsetHeight - 10) + 'px';
}
// ---- wiring ----
function sndMapInit() {
  const canvas = sndMapEl('smapCanvas'); if (!canvas) return;
  sndMapLoadPrefs();
  const fill = (id, opts, val) => { const s = sndMapEl(id); s.innerHTML = ''; opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); }); s.value = val; };
  fill('smapView', Object.keys(SND_MAP_VIEWS).map(k => [k, SND_MAP_VIEWS[k].label]), sndMap.view);
  const axisOpts = [['year', 'Release year']].concat(SND_FIELDS.map(f => [f.key, f.label]), [['sound1', 'Sound axis 1'], ['sound2', 'Sound axis 2'], ['genre1', 'Genre axis 1'], ['genre2', 'Genre axis 2']]);
  fill('smapX', axisOpts, sndMap.x); fill('smapY', axisOpts, sndMap.y);
  fill('smapColor', [['decade', 'Decade'], ['rating', 'Your rating'], ['type', 'Type'], ['family', 'Genre family'], ['source', 'Where the sound data came from']], sndMap.color);
  fill('smapSize', [['same', 'All the same'], ['rating', 'Your rating'], ['plays', 'Plays']], sndMap.size);
  [['smapView', 'view'], ['smapX', 'x'], ['smapY', 'y'], ['smapColor', 'color'], ['smapSize', 'size']].forEach(([id, key]) => sndMapEl(id).addEventListener('change', (e) => { sndMap[key] = e.target.value; sndMapSavePrefs(); sndMapResetCam(); sndMapRender(); }));
  sndMapEl('smapFind').addEventListener('input', (e) => { sndMap.find = e.target.value; sndMapDirty(); });
  document.querySelectorAll('[data-smaptype]').forEach(b => b.addEventListener('click', () => { sndMap.type = b.dataset.smaptype; document.querySelectorAll('[data-smaptype]').forEach(x => x.classList.toggle('active', x === b)); ['smapView', 'smapColor', 'smapSize'].forEach(id => { sndMapEl(id).closest('label').hidden = sndMap.type === 'network'; }); sndMap.hover = -1; sndMapSavePrefs(); sndMapResetCam(); sndMapRender(); }));
  document.querySelectorAll('[data-smaptype]').forEach(x => x.classList.toggle('active', x.dataset.smaptype === sndMap.type)); ['smapView', 'smapColor', 'smapSize'].forEach(id => { sndMapEl(id).closest('label').hidden = sndMap.type === 'network'; });
  sndMapEl('smapAnalyse').addEventListener('click', openSoundDialog);
  const center = () => [sndMap.plot.l + sndMap.plot.w / 2, sndMap.plot.t + sndMap.plot.h / 2];
  sndMapEl('smapZoomIn').addEventListener('click', () => { const c = center(); sndMapZoomAt(c[0], c[1], 1.5); });
  sndMapEl('smapZoomOut').addEventListener('click', () => { const c = center(); sndMapZoomAt(c[0], c[1], 1 / 1.5); });
  sndMapEl('smapReset').addEventListener('click', sndMapResetCam);
  sndMapEl('smapSelectMode').addEventListener('click', (e) => { sndMap.selectMode = !sndMap.selectMode; e.currentTarget.setAttribute('aria-pressed', String(sndMap.selectMode)); e.currentTarget.classList.toggle('active', sndMap.selectMode); });
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); sndMap.ptr.set(e.pointerId, pos(e)); sndMap.moved = 0;
    if (sndMap.ptr.size === 2) { const [a, b] = [...sndMap.ptr.values()]; sndMap.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); sndMap.rect = null; return; }
    const [x, y] = pos(e); sndMap.down = { x, y, shift: e.shiftKey || sndMap.selectMode, cx: sndMap.cam.cx, cy: sndMap.cam.cy };
    if (sndMap.down.shift && sndMap.type === 'map') sndMap.rect = { x0: x, y0: y, x1: x, y1: y };
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e);
    if (sndMap.ptr.has(e.pointerId)) {
      sndMap.ptr.set(e.pointerId, [x, y]);
      if (sndMap.ptr.size === 2) { const [a, b] = [...sndMap.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (sndMap.pinch > 0 && d > 0) sndMapZoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / sndMap.pinch); sndMap.pinch = d; sndMap.moved = 99; return; }
      const dn = sndMap.down; if (dn) {
        sndMap.moved = Math.max(sndMap.moved, Math.hypot(x - dn.x, y - dn.y));
        if (sndMap.rect) { sndMap.rect.x1 = x; sndMap.rect.y1 = y; sndMapDirty(); }
        else if (sndMap.moved > 4) { const P = sndMap.plot, k = sndMap.cam.k * 0.9; sndMap.cam.cx = dn.cx - (x - dn.x) / (P.w * k); sndMap.cam.cy = dn.cy + (y - dn.y) / (P.h * k); sndMapDirty(); sndMapTip(-1); }
      }
      return;
    }
    const h = sndMapHit(x, y); if (h !== sndMap.hover) { sndMap.hover = h; sndMapDirty(); } sndMapTip(h, x, y); canvas.style.cursor = h >= 0 ? 'pointer' : 'grab';
  });
  const end = (e) => {
    const [x, y] = pos(e); sndMap.ptr.delete(e.pointerId); if (sndMap.ptr.size < 2) sndMap.pinch = 0;
    const dn = sndMap.down; if (!dn || sndMap.ptr.size) return; sndMap.down = null;
    if (sndMap.rect) { const r = sndMap.rect; sndMap.rect = null; if (Math.hypot(r.x1 - r.x0, r.y1 - r.y0) > 4) { sndMapSelectRect(r); return; } }
    if (sndMap.moved <= 4) { const h = sndMapHit(x, y); if (sndMap.type === 'network') { if (h >= 0) openGenreTab(sndMapNetwork().nodes[h].genre); } else sndMapSelect(h); }
    sndMapDirty();
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', (e) => { sndMap.ptr.delete(e.pointerId); sndMap.down = null; sndMap.rect = null; sndMap.pinch = 0; sndMapDirty(); });
  canvas.addEventListener('pointerleave', () => { sndMap.hover = -1; sndMapTip(-1); sndMapDirty(); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = pos(e), dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; sndMapZoomAt(x, y, sndClamp(Math.exp(-dy * 0.0022), 0.6, 1.6)); }, { passive: false });   // by how far you scrolled, so a trackpad swipe and a mouse-wheel notch both feel right
  canvas.addEventListener('dblclick', (e) => { const [x, y] = pos(e); sndMapZoomAt(x, y, 1.8); });
  canvas.addEventListener('keydown', (e) => { const c = center(); if (e.key === '+' || e.key === '=') sndMapZoomAt(c[0], c[1], 1.3); else if (e.key === '-') sndMapZoomAt(c[0], c[1], 1 / 1.3); else if (e.key === '0') sndMapResetCam(); else if (e.key === 'Escape') sndMapSelect(-1); });
  if (window.ResizeObserver) new ResizeObserver(() => sndMapDirty()).observe(sndMapEl('smapStage')); else window.addEventListener('resize', sndMapDirty);
}
// END sound-map
