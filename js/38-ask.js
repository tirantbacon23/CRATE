// ---- Ask your crate: search in plain English. "90s shoegaze I rated 4+ and haven't played in a year, not on Creation" becomes exact filters,
// shown back as chips so you can see what it understood. No AI service: a hand-written grammar and a lexicon built from your own crate
// (genres with everything under them in your Genre Taxonomy, descriptors, scenes, movements, labels, artists, places, titles).
// How it reads: the words are split into tokens; at each place the grammar tries its phrases (ratings, years and decades, when added, plays,
// "by", "on", "from", types, sorting and counts), then the longest name from the lexicon; "not", "no", "except", "without" turn the next
// condition round; "or" and "," join conditions of one kind ("shoegaze or dream pop"); everything else must all hold. A word it can't place
// becomes a title or artist search if anything in the crate has it, or a "did you mean" from the nearest known word. ----
const AQ_HIST_KEY = 'crate_ask_history_v1';
const aq = { open: false, text: '', res: null, sugg: [], si: -1, ctx: null, ctxFor: null, timer: 0, shown: 60 };

// ----- words -----
function aqNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/&/g, ' and ').replace(/[‐-―]/g, '-'); }
function aqToks(s) {                                                  // "rated 4+, '90s post-punk" -> ['rated','4','+',',','90s','post','punk']
  const out = [], re = /"([^"]*)"|'?((?:1[89]|20)?\d0s)\b|(\d+(?:\.\d+)?)|([a-z0-9]+(?:'[a-z]+)?)|(\+|,)/g; let m; const t = aqNorm(s).replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2');          // "1990-1995" is a range
  while ((m = re.exec(t))) out.push(m[1] != null ? { q: m[1] } : (m[2] || m[3] || m[4] || m[5]));
  return out;
}
const aqKey = (s) => aqToks(s).filter(x => typeof x === 'string' && x !== ',' && x !== '+').join(' ');
const AQ_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, a: 1, an: 1, half: 0.5, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
const AQ_DECW = { twenties: 1920, thirties: 1930, forties: 1940, fifties: 1950, sixties: 1960, seventies: 1970, eighties: 1980, nineties: 1990, noughties: 2000, aughts: 2000, tens: 2010 };
const AQ_FILL = new Set("show me find give get list all any some the a an of my i i'm im that which who what are is was were be been have has had with in for to releases release records record music stuff things please only just ones one also really like want would i'd id do does did there here them they it its s can could you something anything everything good great nice cool vinyl go listen listening time hey ok okay let's lets".split(' '));
const AQ_DEMONYM = { japanese: 'japan', british: 'uk', english: 'england', scottish: 'scotland', irish: 'ireland', welsh: 'wales', american: 'us', canadian: 'canada', french: 'france', german: 'germany', swedish: 'sweden', norwegian: 'norway', danish: 'denmark', finnish: 'finland', icelandic: 'iceland', dutch: 'netherlands', belgian: 'belgium', italian: 'italy', spanish: 'spain', portuguese: 'portugal', brazilian: 'brazil', mexican: 'mexico', argentinian: 'argentina', australian: 'australia', 'new zealand': 'new zealand', korean: 'korea', chinese: 'china', russian: 'russia', polish: 'poland', czech: 'czech', hungarian: 'hungary', greek: 'greece', turkish: 'turkey', malian: 'mali', nigerian: 'nigeria', ghanaian: 'ghana', ethiopian: 'ethiopia', south: null };
const AQ_PLACE_ALIAS = { us: ['united states', 'usa', 'us', 'america'], uk: ['united kingdom', 'uk', 'england', 'scotland', 'wales', 'northern ireland', 'britain'], usa: ['united states', 'usa', 'us'], america: ['united states', 'usa', 'us'] };
const AQ_TYPES = [['albums', 'album'], ['album', 'album'], ['lps', 'album'], ['lp', 'album'], ['eps', 'ep'], ['ep', 'ep'], ['singles', 'single'], ['single', 'single'], ['live', 'live'], ['compilations', 'compilation'], ['compilation', 'compilation'], ['comps', 'compilation'], ['mixtapes', 'mixtape'], ['mixtape', 'mixtape'], ['bootlegs', 'bootleg'], ['dj mixes', 'dj mix'], ['soundtracks', 'soundtrack'], ['soundtrack', 'soundtrack'], ['videos', 'video']];

// ----- what the crate knows: names to match, genres with what sits under them, and plays -----
function aqContext(items, tax, plays, now) {
  const lex = new Map(), add = (kind, label, n) => { const k = aqKey(label); if (!k) return; const id = kind + ':' + k; const e = lex.get(id); if (e) e.n += n || 1; else lex.set(id, { kind, key: k, words: k.split(' '), label: String(label).trim(), n: n || 1 }); };
  const split = (s) => String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
  const anc = new Map();                                              // genre key -> itself and every parent above it
  const ancOf = (g) => { const k = aqKey(g); if (anc.has(k)) return anc.get(k); const set = new Set([k]); anc.set(k, set); let lvl = [g];
    for (let d = 0; d < 8 && lvl.length; d++) { const next = []; lvl.forEach(x => (typeof gxParents === 'function' ? gxParents(tax, x) : []).forEach(p => { const pk = aqKey(p); if (!set.has(pk)) { set.add(pk); next.push(p); } })); lvl = next; }
    return set; };
  Object.values(tax || {}).forEach(e => { if (e && e.label) { add('genre', e.label, 0); ancOf(e.label); } });
  const gset = new Map(), placeOf = new Map();
  items.forEach(it => {
    const gs = new Set(); [...split(it.genre), ...split(it.genre2), ...split(it.scene), ...split(it.movement)].forEach(g => { add('genre', g); ancOf(g).forEach(k => gs.add(k)); }); gset.set(it, gs);
    split(it.rymDescriptors).forEach(d => add('desc', d));
    split(it.label).forEach(l => add('label', l));
    if (it.artist) add('artist', it.artist);
    const pl = aqNorm([it.region, it.location].filter(Boolean).join(', ')); placeOf.set(it, pl); split(it.region).concat(split(it.location)).forEach(p => add('place', p));
  });
  const under = new Map();                                            // genre key -> how many genres sit under it
  anc.forEach((set, k) => set.forEach(a => { if (a !== k) under.set(a, (under.get(a) || 0) + 1); }));
  const trie = new Map();                                             // first word -> entries starting with it, longest first
  lex.forEach(e => { const l = trie.get(e.words[0]) || []; l.push(e); trie.set(e.words[0], l); });
  trie.forEach(l => l.sort((a, b) => b.words.length - a.words.length || b.n - a.n));
  const play = new Map(), pk = (a, t) => (typeof lastfmNormKey === 'function' ? lastfmNormKey(a, t) : aqKey(a) + '|' + aqKey(t));
  (plays || []).forEach(p => { const k = pk(p.artist, p.title), e = play.get(k) || { n: 0, last: '' }; e.n += p.n || 1; if (p.date && p.date > e.last) e.last = p.date; play.set(k, e); });
  return { lex, trie, gset, under, placeOf, play, playOf: (it) => play.get(pk(it.artist, it.title)) || { n: 0, last: '' }, now: now || new Date(), items };
}
function aqPlaysFromState() {
  const out = [];
  (state.scrobbles || []).forEach(s => out.push({ artist: s.artist, title: s.title, n: s.playCount || 1, date: String(s.day || '').slice(0, 10) }));
  (state.diary || []).forEach(d => out.push({ artist: d.artist, title: d.title, n: 1, date: String(d.date || '').slice(0, 10) }));
  return out;
}

// ----- dates -----
const aqDay = (d) => d.toISOString().slice(0, 10);
const aqYearOf = (it) => { const y = parseInt(String(it.releaseDate || '').slice(0, 4), 10); return y > 1000 ? y : 0; };
const aqAdded = (it) => String(it.dateAdded || '').slice(0, 10);
function aqAgo(now, days) { return aqDay(new Date(now.getTime() - days * 864e5)); }

// ----- the parser -----
// -> { groups: [{ neg, kind, any: [{ kind, text, test(it) }] }], sort, limit, unknown: [{ word, sugg }], chips: [text] }
function aqParse(text, ctx) {
  const T = aqToks(text), now = ctx.now, Y = now.getFullYear();
  const w = (i) => (typeof T[i] === 'string' ? T[i] : null), is = (i, ...ws) => ws.includes(w(i));
  const seq = (i, s) => { const p = s.split(' '); for (let k = 0; k < p.length; k++) { const alts = p[k].split('|'); if (!alts.includes(w(i + k))) return 0; } return p.length; };
  const num = (i) => { const x = w(i); if (x == null) return null; if (/^\d+(\.\d+)?$/.test(x)) return Number(x); return x in AQ_NUM ? AQ_NUM[x] : null; };
  const groups = [], unknown = []; let neg = false, orNext = false, sort = null, limit = 0;
  const push = (c) => {
    const last = groups[groups.length - 1];
    if (orNext && last && last.kind === c.kind && last.neg === neg) last.any.push(c); else groups.push({ neg, kind: c.kind, any: [c] });
    neg = false; orNext = false;
  };
  const yr = (a, b, text) => ({ kind: 'year', text, test: (it) => { const y = aqYearOf(it); return !!y && y >= a && y <= b; } });
  // a decade or year at i -> { a, b, len, text }
  const span = (i) => {
    let pre = null, j = i; if (is(j, 'early', 'mid', 'late')) { pre = w(j); j++; if (is(j, 'the')) j++; }
    const x = w(j); let d = null;
    if (x && /^\d0s$/.test(x)) { const n = parseInt(x, 10); d = n <= 29 ? 2000 + n : 1900 + n; }
    else if (x && /^(1[0-9]|20)\d0s$/.test(x)) d = parseInt(x, 10);
    else if (x && x in AQ_DECW) d = AQ_DECW[x];
    if (d != null) { const [a, b] = pre === 'early' ? [d, d + 3] : pre === 'mid' ? [d + 3, d + 6] : pre === 'late' ? [d + 6, d + 9] : [d, d + 9]; return { a, b, len: j - i + 1, text: `${pre ? pre[0].toUpperCase() + pre.slice(1) + ' ' : ''}${d}s` }; }
    if (!pre && x && /^(1[89]\d\d|20\d\d)$/.test(x)) return { a: +x, b: +x, len: 1, text: x };
    if (!pre && seq(j, 'this year')) return { a: Y, b: Y, len: 2, text: String(Y) };
    if (!pre && seq(j, 'last year')) return { a: Y - 1, b: Y - 1, len: 2, text: String(Y - 1) };
    return null;
  };
  // a length of time at i -> { days, len, text }
  const dur = (i) => {
    let n = num(i), j = i + 1; if (n == null) { n = 1; j = i; }
    if (is(i, 'a', 'an') && is(i + 1, 'couple')) { n = 2; j = i + 2; if (is(j, 'of')) j++; } else if (is(i, 'a') && is(i + 1, 'few')) { n = 3; j = i + 2; }
    const u = w(j), per = { day: 1, days: 1, week: 7, weeks: 7, fortnight: 14, month: 30.44, months: 30.44, year: 365.25, years: 365.25, decade: 3652.5, decades: 3652.5 }[u];
    if (per) return { days: n * per, len: j - i + 1, text: `${n === 0.5 ? 'half a' : n} ${n === 1 ? u.replace(/s$/, '') : u.endsWith('s') ? u : u + 's'}` };
    if (seq(i, 'a while')) return { days: 180, len: 2, text: 'a while (6 months)' }; if (seq(i, 'ages') || seq(i, 'a long time')) return { days: 730, len: is(i, 'ages') ? 1 : 3, text: 'a long time (2 years)' };
    return null;
  };
  // a point or stretch of time for "added"/"played" -> { from, to (YYYY-MM-DD), len, text }
  const when = (i) => {
    if (seq(i, 'today')) return { from: aqDay(now), to: '9999', len: 1, text: 'today' };
    if (seq(i, 'this week')) return { from: aqAgo(now, 7), to: '9999', len: 2, text: 'this week' };
    if (seq(i, 'this month')) return { from: aqDay(new Date(Y, now.getMonth(), 1)), to: '9999', len: 2, text: 'this month' };
    if (seq(i, 'last month')) return { from: aqDay(new Date(Y, now.getMonth() - 1, 1)), to: aqDay(new Date(Y, now.getMonth(), 0)), len: 2, text: 'last month' };
    if (seq(i, 'recently') || seq(i, 'lately')) return { from: aqAgo(now, 60), to: '9999', len: 1, text: 'in the last 2 months' };
    let j = i; if (seq(j, 'in|over|during|within the last|past')) j += 3; else if (seq(j, 'the last|past')) j += 2; else if (seq(j, 'in|over|within the')) j = -1; else if (is(j, 'in', 'within', 'during')) j++;
    if (j > 0 && j !== i) { const d = dur(j); if (d) return { from: aqAgo(now, d.days), to: '9999', len: j - i + d.len, text: `in the last ${d.text}` }; }
    let k = i; if (is(k, 'in', 'during')) k++; if (is(k, 'the') && span(k + 1)) k++; const s = span(k);
    if (s) return { from: `${s.a}-01-01`, to: `${s.b}-12-31`, len: k - i + s.len, text: `in ${s.text}` };
    const d = dur(i); if (d && is(i + d.len, 'ago')) return { from: aqAgo(now, d.days + 15), to: aqAgo(now, Math.max(0, d.days - 15)), len: d.len + 1, text: `${d.text} ago` };
    return null;
  };
  const cmpText = (op, v, unit) => `${op === '>=' ? '' : op === '<=' ? 'at most ' : op === '>' ? 'over ' : op === '<' ? 'under ' : ''}${v}${unit}${op === '>=' ? ' or more' : ''}`;
  // "4+", "4 or more", "above 4", "at least 4", "below 3", "3 to 4", "3-4", "4" -> { op, a, b?, len }
  const amount = (i) => {
    if (is(i, 'above', 'over', 'more', 'greater', 'higher')) { let j = i + 1; if (is(j, 'than')) j++; const n = num(j); if (n != null) return { op: '>', a: n, len: j - i + 1 }; }
    if (seq(i, 'at least') || seq(i, 'no less than')) { const j = i + (is(i, 'at') ? 2 : 3), n = num(j); if (n != null) return { op: '>=', a: n, len: j - i + 1 }; }
    if (seq(i, 'at most') || seq(i, 'no more than')) { const j = i + (is(i, 'at') ? 2 : 3), n = num(j); if (n != null) return { op: '<=', a: n, len: j - i + 1 }; }
    if (is(i, 'below', 'under', 'less', 'lower', 'beneath', 'fewer')) { let j = i + 1; if (is(j, 'than')) j++; const n = num(j); if (n != null) return { op: '<', a: n, len: j - i + 1 }; }
    const n = num(i); if (n == null || is(i, 'a', 'an')) return null;
    if (w(i + 1) === '+') return { op: '>=', a: n, len: 2 };
    if (seq(i + 1, 'or more|higher|above|better|up') || seq(i + 1, 'and up|above|over|higher')) return { op: '>=', a: n, len: 3 };
    if (seq(i + 1, 'or less|lower|below|worse')) return { op: '<=', a: n, len: 3 };
    if (is(i + 1, 'to', 'and') && num(i + 2) != null) return { op: 'in', a: n, b: num(i + 2), len: 3 };
    return { op: '=', a: n, len: 1 };
  };
  const cmp = (x, m) => m.op === '>=' ? x >= m.a : m.op === '>' ? x > m.a : m.op === '<=' ? x <= m.a : m.op === '<' ? x < m.a : m.op === 'in' ? x >= Math.min(m.a, m.b) && x <= Math.max(m.a, m.b) : Math.abs(x - m.a) < 0.26;
  const mText = (m, unit) => m.op === 'in' ? `${m.a}–${m.b}${unit}` : cmpText(m.op, m.a, unit);
  const rymCond = (m) => ({ kind: 'rym', text: `RYM ${mText(m, '')}`, test: (it) => { const r = Number(it.rymRating) || 0; return r > 0 && cmp(r, m); } });
  const mineCond = (m) => ({ kind: 'rating', text: `Your rating ${mText(m, '★')}`, test: (it) => { const r = Number(it.rating) || 0; return r > 0 && cmp(r, m); } });
  const onRym = (j) => seq(j, 'on rym') ? 2 : seq(j, 'on rate your music') ? 4 : seq(j, 'by rym') ? 2 : 0;
  const lexAt = (i, kinds) => {                                       // the longest name from the crate starting at i
    for (const e of ctx.trie.get(w(i)) || []) { if (kinds && !kinds.includes(e.kind)) continue; if (e.words.every((x, k) => w(i + k) === x)) return e; }
    return null;
  };
  const lexCond = (e) => {
    if (e.kind === 'genre') { const u = ctx.under.get(e.key) || 0; return { kind: 'genre', text: `${e.label}${u ? ` (and ${u} under it)` : ''}`, test: (it) => (ctx.gset.get(it) || new Set()).has(e.key) }; }
    if (e.kind === 'desc') return { kind: 'desc', text: `Feels ${e.label.toLowerCase()}`, test: (it) => String(it.rymDescriptors || '').split(/[,;]/).some(d => aqKey(d) === e.key) };
    if (e.kind === 'label') return { kind: 'label', text: `On ${e.label}`, test: (it) => String(it.label || '').split(/[,;]/).some(d => aqKey(d) === e.key) };
    if (e.kind === 'artist') return { kind: 'artist', text: `By ${e.label}`, test: (it) => aqKey(it.artist) === e.key };
    return placeCond(e.key, e.label);
  };
  const placeCond = (key, label) => { const alts = AQ_PLACE_ALIAS[key] || [key]; return { kind: 'place', text: `From ${label}`, test: (it) => { const p = ' ' + aqKey(ctx.placeOf.get(it) || '') + ' '; return alts.some(a => p.includes(' ' + a + ' ')); } }; };
  const textCond = (q) => { const k = aqKey(q); return { kind: 'text', text: `“${q}” in the title or artist`, test: (it) => (' ' + aqKey(it.title) + ' ' + aqKey(it.artist) + ' ').includes(' ' + k + ' ') }; };
  const SORTS = [['best', 'rating', 'Best first'], ['top', 'rating', 'Best first'], ['highest rated', 'rating', 'Best first'], ['newest', 'new', 'Newest first'], ['latest', 'new', 'Newest first'], ['oldest', 'old', 'Oldest first'], ['earliest', 'old', 'Oldest first'], ['most popular', 'popular', 'Most rated on RYM first'], ['most obscure', 'obscure', 'Least known first'], ['random', 'random', 'In random order'], ['shuffled', 'random', 'In random order'], ['shuffle', 'random', 'In random order'], ['most played', 'played', 'Most played first'], ['least played', 'leastplayed', 'Least played first'], ['recently added', 'added', 'Newest additions first'], ['newest additions', 'added', 'Newest additions first']];
  const chips = [];
  for (let i = 0; i < T.length;) {
    const x = T[i];
    if (x && typeof x === 'object') { if (x.q.trim()) push(textCond(x.q.trim())); i++; continue; }
    if (x === ',' || x === 'or' || seq(i, 'as well as')) { orNext = groups.length > 0; i += x === 'as' ? 3 : 1; continue; }
    if (x === '+') { i++; continue; }
    let n;
    // ---- plays (before plain "not", which they include) ----
    if ((n = seq(i, "haven't|havent|hasnt|hasn't|didnt|didn't|not|never played|heard|listened|spun")) || (n = seq(i, 'have|has|did not|never played|heard|listened|spun')) || (n = seq(i, 'not been played|heard')) || (n = seq(i, 'unplayed|unheard')) || (n = seq(i, 'never played|heard|listened'))) {
      let j = i + n; if (is(j, 'to')) j++; if (is(j, 'it', 'them')) j++;
      const sinceAt = is(j, 'since') ? j + 1 : -1, inAt = is(j, 'in', 'for', 'within') ? j : -1;
      let cond = null;
      if (sinceAt > 0) { const s = span(sinceAt); const d = s ? null : dur(sinceAt); if (s) { const cut = `${s.a}-01-01`; cond = { text: `Not played since ${s.text}`, cut, len: j - i + 1 + s.len }; } else if (d) { cond = { text: `Not played for ${d.text}`, cut: aqAgo(now, d.days), len: j - i + 1 + d.len }; } }
      else if (inAt > 0) { let k = inAt + 1; if (is(k, 'the') && (is(k + 1, 'last', 'past'))) k += 2; else if (is(k, 'over')) k++; const d = dur(k); if (d) cond = { text: `Not played for ${d.text}`, cut: aqAgo(now, d.days), len: k - i + d.len }; }
      if (cond) { const cut = cond.cut; push({ kind: 'played', text: cond.text + ' (or never)', test: (it) => { const p = ctx.playOf(it); return !p.n || (p.last && p.last < cut); } }); i += cond.len; }
      else { push({ kind: 'played', text: 'Never played', test: (it) => !ctx.playOf(it).n }); i = j; }
      continue;
    }
    if ((n = seq(i, 'played|heard|listened|spun'))) {
      let j = i + n; if (is(j, 'to')) j++; if (is(j, 'it', 'them')) j++;
      { const m = amount(j); if (m && is(j + m.len, 'times', 'time', 'x')) { push({ kind: 'played', text: `Played ${mText(m, ' times')}`, test: (it) => cmp(ctx.playOf(it).n, m) }); i = j + m.len + 1; continue; } }
      if (seq(j, 'a lot') || seq(j, 'often') || seq(j, 'loads')) { push({ kind: 'played', text: 'Played 5 times or more', test: (it) => ctx.playOf(it).n >= 5 }); i = j + (is(j, 'a') ? 2 : 1); continue; }
      if (seq(j, 'once')) { push({ kind: 'played', text: 'Played once', test: (it) => ctx.playOf(it).n === 1 }); i = j + 1; continue; }
      const t = when(j); if (t) { push({ kind: 'played', text: `Played ${t.text}`, test: (it) => { const p = ctx.playOf(it); return !!p.last && p.last >= t.from && p.last <= t.to; } }); i = j + t.len; continue; }
      if (is(j, 'before')) { const s = span(j + 1); if (s) { push({ kind: 'played', text: `Played, but not since ${s.text}`, test: (it) => { const p = ctx.playOf(it); return !!p.last && p.last < `${s.a}-01-01`; } }); i = j + 1 + s.len; continue; } }
      push({ kind: 'played', text: 'Played at least once', test: (it) => ctx.playOf(it).n > 0 }); i = j; continue;
    }
    // ---- negation ----
    if ((n = seq(i, 'but not')) || (n = seq(i, 'not|no|except|excluding|without|minus|non|nothing|exclude|apart'))) { if (is(i, 'apart') && is(i + 1, 'from')) n = 2; neg = !neg; orNext = false; i += n; continue; }
    // ---- your rating ----
    if ((n = seq(i, 'unrated')) || (n = seq(i, "haven't|havent|not|never rated")) || (n = seq(i, 'no rating')) || (n = seq(i, 'without a rating'))) { push({ kind: 'rating', text: 'Not rated by you', test: (it) => !(Number(it.rating) > 0) }); i += n; continue; }
    if ((n = seq(i, 'favourites|favorites|favourite|favorite|faves|loved'))) { push({ kind: 'rating', text: 'Your rating 4.5★ or more', test: (it) => Number(it.rating) >= 4.5 }); i += n; continue; }
    if ((n = seq(i, 'i rated|gave')) || (n = seq(i, 'rated|rating|scored')) || (n = seq(i, 'i gave'))) {
      let j = i + n; if (is(j, 'it', 'them', 'as', 'at')) j++;
      const m = amount(j);
      if (m) { let k = j + m.len; if (is(k, 'stars', 'star', 'out')) { k++; if (seq(k, 'of 5') || seq(k, 'of five')) k += 2; } const r = onRym(k); push(r ? rymCond(m) : mineCond(m)); i = k + r; continue; }
      if (seq(j, 'highly|well') || seq(j, 'high')) { const r = onRym(j + 1); push(r ? rymCond({ op: '>=', a: 3.7 }) : mineCond({ op: '>=', a: 4 })); i = j + 1 + r; continue; }
      if (seq(j, 'badly|poorly|low')) { const r = onRym(j + 1); push(r ? rymCond({ op: '<', a: 3 }) : mineCond({ op: '<=', a: 2 })); i = j + 1 + r; continue; }
      const r = onRym(j); if (r) { push({ kind: 'rym', text: 'Has a RYM rating', test: (it) => Number(it.rymRating) > 0 }); i = j + r; continue; }
      push({ kind: 'rating', text: 'Rated by you', test: (it) => Number(it.rating) > 0 }); i = j; continue;
    }
    if (num(i) != null && !is(i, 'a', 'an') && is(i + 1, 'star', 'stars') || (num(i) != null && w(i + 1) === '+' && is(i + 2, 'star', 'stars'))) { const m = amount(i); const k = i + m.len + 1; const r = onRym(k); push(r ? rymCond(m) : mineCond(m)); i = k + r; continue; }
    // ---- RYM ----
    if ((n = seq(i, 'rym|rateyourmusic')) || (n = seq(i, 'rate your music'))) {
      let j = i + n; if (is(j, 'rating', 'score', 'average')) j++; if (is(j, 'of', 'is')) j++;
      const m = amount(j); if (m && m.a <= 5) { push(rymCond(m)); i = j + m.len; continue; }
      if (is(j, 'bold')) { push({ kind: 'rym', text: 'Bold on RYM', test: (it) => typeof rymReleaseIsBold === 'function' && rymReleaseIsBold(it) }); i = j + 1; continue; }
      i = j; continue;
    }
    if ((n = seq(i, 'acclaimed|classics|essential|canonical')) || (n = seq(i, 'critically acclaimed'))) { push(rymCond({ op: '>=', a: 3.7 })); i += n; continue; }
    if ((n = seq(i, 'bold'))) { push({ kind: 'rym', text: 'Bold on RYM', test: (it) => typeof rymReleaseIsBold === 'function' && rymReleaseIsBold(it) }); i += n; continue; }
    if ((n = seq(i, 'obscure|underground|overlooked|underrated|unknown')) || (n = seq(i, 'deep cuts')) || (n = seq(i, 'hidden gems'))) { push({ kind: 'votes', text: 'Under 500 ratings on RYM', test: (it) => (Number(it.rymVotes) || 0) < 500 }); i += n; continue; }
    if ((n = seq(i, 'popular|famous|well known|mainstream'))) { if (is(i, 'well')) n = 2; push({ kind: 'votes', text: '5,000 ratings or more on RYM', test: (it) => (Number(it.rymVotes) || 0) >= 5000 }); i += n; continue; }
    // ---- sorting and how many ----
    if ((n = seq(i, 'top|best|first'))  && num(i + 1) != null && !is(i + 1, 'a', 'an')) { limit = num(i + 1); if (!is(i, 'first')) sort = sort || ['rating', 'Best first']; i += 2; continue; }
    if (num(i) != null && !is(i, 'a', 'an') && is(i + 1, 'random')) { limit = num(i); sort = ['random', 'In random order']; i += 2; continue; }
    if ((n = seq(i, 'limit|only')) && num(i + 1) != null) { limit = num(i + 1); i += 2; continue; }
    { let hit = null; for (const [p, k, t] of SORTS) { const m = seq(i, p.split(' ').join(' ')); if (m && (!hit || m > hit[0])) hit = [m, k, t]; } if (hit && !(hit[1] === 'rating' && lexAt(i, ['genre', 'desc', 'artist', 'label']))) { if (hit[1] === 'added') push({ kind: 'added', text: 'Added in the last 2 months', test: (it) => aqAdded(it) >= aqAgo(now, 60) }); sort = [hit[1], hit[2]]; i += hit[0]; if (is(i, 'first')) i++; continue; } }
    if ((n = seq(i, 'sorted|ordered|order|sort by'))) { i += n; if (is(i, 'by')) i++; continue; }
    // ---- when added ----
    if ((n = seq(i, 'added|bought|got|acquired|saved'))) {
      let j = i + n; if (is(j, 'to')) j += 1; if (is(j, 'the', 'my') && is(j + 1, 'crate')) j += 2;
      if (is(j, 'before', 'after', 'since')) { const op = w(j), s = span(j + 1); if (s) { const from = op === 'before' ? '' : op === 'after' ? `${s.b + 1}-01-01` : `${s.a}-01-01`, to = op === 'before' ? `${s.a}-01-01` : '9999'; push({ kind: 'added', text: `Added ${op} ${s.text}`, test: (it) => { const a = aqAdded(it); return !!a && a >= from && a < to; } }); i = j + 1 + s.len; continue; } }
      const t = when(j); if (t) { push({ kind: 'added', text: `Added ${t.text}`, test: (it) => { const a = aqAdded(it); return !!a && a >= t.from && a <= t.to; } }); i = j + t.len; continue; }
      i = j; continue;
    }
    if ((n = seq(i, 'new|newly')) && is(i + 1, 'additions', 'arrivals', 'added')) { push({ kind: 'added', text: 'Added in the last month', test: (it) => aqAdded(it) >= aqAgo(now, 31) }); sort = sort || ['added', 'Newest additions first']; i += 2; continue; }
    // ---- release years ----
    if (is(i, 'between', 'from') && span(i + 1)) { const a = span(i + 1), k = i + 1 + a.len; if (is(k, 'and', 'to', 'through', 'till', 'until') && span(k + 1)) { const b = span(k + 1); push(yr(Math.min(a.a, b.a), Math.max(a.b, b.b), `Released ${Math.min(a.a, b.a)}–${Math.max(a.b, b.b)}`)); i = k + 1 + b.len; continue; } }
    if ((n = seq(i, 'before|pre|until|till')) && span(i + 1)) { const s = span(i + 1); push(yr(0, s.a - 1, `Released before ${s.text}`)); i += 1 + s.len; continue; }
    if ((n = seq(i, 'after|post')) && span(i + 1)) { const s = span(i + 1); push(yr(s.b + 1, 9999, `Released after ${s.text}`)); i += 1 + s.len; continue; }
    if ((n = seq(i, 'since')) && span(i + 1)) { const s = span(i + 1); push(yr(s.a, 9999, `Released since ${s.text}`)); i += 1 + s.len; continue; }
    if ((n = seq(i, 'released|recorded|out|made|from|in|during|of')) && (span(i + 1) || (is(i + 1, 'the') && span(i + 2)))) { const k = i + 1 + (is(i + 1, 'the') ? 1 : 0), s = span(k); if (is(k + s.len, 'and', 'to', 'through') && span(k + s.len + 1)) { const b = span(k + s.len + 1); push(yr(s.a, b.b, `Released ${s.a}–${b.b}`)); i = k + s.len + 1 + b.len; } else { push(yr(s.a, s.b, `Released in ${s.text}`)); i = k + s.len; } continue; }
    if (is(i, 'the') && span(i + 1)) { const s = span(i + 1); push(yr(s.a, s.b, `Released in ${s.text}`)); i += 1 + s.len; continue; }
    { const s = span(i); if (s) { let k = i + s.len; if (is(k, 'to', 'through', 'till', 'until') && span(k + 1)) { const b = span(k + 1); push(yr(s.a, b.b, `Released ${s.a}–${b.b}`)); i = k + 1 + b.len; } else { push(yr(s.a, s.b, `Released in ${s.text}`)); i = k; } continue; } }
    if ((n = seq(i, 'released|recorded|came')) ) { i += n; if (is(i, 'out')) i++; continue; }
    // ---- by / on / from ----
    if ((n = seq(i, 'by|artist|artists'))) {
      let j = i + n; if (is(j, 'the') && !lexAt(j, ['artist'])) j++;
      const e = lexAt(j, ['artist']); if (e) { push(lexCond(e)); i = j + e.words.length; continue; }
      let k = j, words = []; while (k < T.length && w(k) && w(k) !== ',' && w(k) !== '+' && !AQ_FILL.has(w(k)) && !['on', 'from', 'not', 'rated', 'or', 'and', 'in', 'before', 'after', 'since'].includes(w(k)) && words.length < 5) { words.push(w(k)); k++; }
      if (words.length) { const q = words.join(' '); push({ kind: 'artist', text: `Artist name has “${q}”`, test: (it) => aqKey(it.artist).includes(q) }); i = k; continue; }
      i = j; continue;
    }
    if ((n = seq(i, 'on|label|labels|imprint')) || (n = seq(i, 'released on'))) {
      let j = i + n; if (is(j, 'the')) j++; if (is(j, 'label')) j++;
      const e = lexAt(j, ['label']); if (e) { push(lexCond(e)); i = j + e.words.length; if (is(i, 'label', 'records')) i++; continue; }
      if (!onRym(i) && w(j) && !AQ_FILL.has(w(j)) && !span(j) && !lexAt(j, ['genre', 'desc'])) {          // a label the crate doesn't have by that name: its words, searched in labels
        let k = j, words = []; while (k < T.length && w(k) && w(k) !== ',' && w(k) !== '+' && !AQ_FILL.has(w(k)) && !['from', 'not', 'rated', 'or', 'and', 'by', 'before', 'after', 'since', 'label', 'records', 'newest', 'oldest', 'best', 'top', 'random'].includes(w(k)) && words.length < 4) { words.push(w(k)); k++; }
        if (words.length) { const q2 = words.join(' '); push({ kind: 'label', text: `Label has “${q2}”`, test: (it) => (' ' + aqKey(it.label) + ' ').includes(' ' + q2 + ' ') }); i = k; if (is(i, 'label', 'records')) i++; continue; }
      }
      if (is(i, 'on')) { i++; continue; }
    }
    if ((n = seq(i, 'from|in|out of'))) {
      let j = i + n; if (is(j, 'the')) j++;
      const e = lexAt(j, ['place']) || (w(j) in AQ_PLACE_ALIAS ? { kind: 'place', key: w(j), words: [w(j)], label: w(j).toUpperCase() } : null);
      if (e) { push(e.kind === 'place' && AQ_PLACE_ALIAS[e.key] ? placeCond(e.key, e.label) : lexCond(e)); i = j + e.words.length; continue; }
    }
    if (w(i) && AQ_DEMONYM[w(i)]) { const key = AQ_DEMONYM[w(i)]; push(placeCond(key, key.replace(/\b\w/g, c => c.toUpperCase()))); i++; continue; }
    // ---- types (only when nothing in the crate is called that) ----
    { const t = AQ_TYPES.find(([p]) => seq(i, p)); if (t && !lexAt(i, ['genre'])) { const tw = t[0].split(' ').length, typ = t[1]; push({ kind: 'type', text: typ.replace(/^\w/, c => c.toUpperCase()) + 's', test: (it) => aqKey(it.type).includes(typ) }); i += tw; continue; } }
    // ---- anything the crate has a name for: longest first; a genre or descriptor before an artist with the same name ----
    if ((n = seq(i, 'genre|genres|style|tagged|descriptor|descriptors|feels|feeling|sounds|sounding|mood'))) { i += n; if (is(i, 'like')) i++; continue; }
    { const e = lexAt(i, ['genre', 'desc']) || lexAt(i, ['artist', 'label', 'place']);
      if (e && (e.kind !== 'artist' && e.kind !== 'label' && e.kind !== 'place' || e.words.length > 1 || !AQ_FILL.has(e.key))) { push(lexCond(e)); i += e.words.length; continue; } }
    if (AQ_FILL.has(x) || x === 'and' || x === 'but' || x === 'from' || x === 'than' || x === 'with') { i++; continue; }
    // ---- a word it can't place: a run of them is searched in titles and artists; otherwise a "did you mean" ----
    let k = i; while (k < T.length && typeof T[k] === 'string' && !AQ_FILL.has(T[k]) && T[k] !== ',' && T[k] !== '+' && !['or', 'and', 'not', 'by', 'on', 'from', 'rated', 'played'].includes(T[k]) && !lexAt(k)) k++;
    const run = T.slice(i, Math.max(k, i + 1)).join(' ');
    if (ctx.items.some(it => (' ' + aqKey(it.title) + ' ' + aqKey(it.artist) + ' ').includes(' ' + run + ' '))) { push(textCond(run)); i = Math.max(k, i + 1); continue; }
    const sg = aqSuggest(x, ctx, true);                                // a near miss of a name in the crate is read as that name, and said so;
    if (sg && sg.e.kind !== 'word' && (sg.d <= 1 || (sg.d === 2 && x.length >= 8))) { push(lexCond(sg.e)); unknown.push({ word: x, sugg: sg.e, applied: true }); i++; continue; }
    if (neg) { push({ kind: 'text', text: `“${x}” (nothing in your crate has it)`, test: () => false }); i++; continue; }          // leaving out what isn't there leaves out nothing
    unknown.push({ word: x, sugg: sg && sg.e }); groups.push({ neg: false, kind: 'unknown', any: [{ kind: 'unknown', text: '', test: () => false }], hide: true }); neg = false; orNext = false; i++;          // anything else matches nothing, rather than being quietly left out
  }
  groups.forEach(g => { if (!g.hide) chips.push((g.neg ? 'Not: ' : '') + g.any.map(c => c.text).join(' or ')); });
  if (sort) chips.push(sort[1]); if (limit) chips.push(`Only ${limit}`);
  return { groups, sort: sort && sort[0], limit, unknown, chips };
}
// the nearest known word, by edit distance (letters swapped count once)
function aqDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) { let lo = Infinity; for (let j = 1; j <= b.length; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); lo = Math.min(lo, d[i][j]); } if (lo > max) return max + 1; }
  return d[a.length][b.length];
}
function aqSuggest(word, ctx, withDist) {
  if (!word || word.length < 3) return null; const max = word.length <= 5 ? 1 : 2; let best = null;
  ctx.lex.forEach(e => { const cand = e.words.length === 1 ? e.key : e.words[0]; const d = aqDist(word, cand, max); if (d <= max && (!best || d < best.d || (d === best.d && e.n > best.e.n))) best = { d, e }; });
  ['rated', 'played', 'added', 'released', 'unrated', 'unplayed', 'favourites', 'obscure', 'popular', 'newest', 'oldest', 'random', 'albums', 'singles', 'acclaimed', 'between', 'before', 'after', 'since', 'without', 'except'].forEach(k => { const d = aqDist(word, k, max); if (d <= max && (!best || d < best.d)) best = { d, e: { key: k, label: k, kind: 'word' } }; });
  return best ? (withDist ? best : best.e) : null;
}
// run a parsed question
function aqRun(items, q, ctx) {
  let out = items.filter(it => q.groups.every(g => g.any.some(c => c.test(it)) !== g.neg));
  const by = {
    rating: (a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (Number(b.rymRating) || 0) - (Number(a.rymRating) || 0),
    new: (a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')), old: (a, b) => (aqYearOf(a) || 9999) - (aqYearOf(b) || 9999) || String(a.releaseDate || '').localeCompare(String(b.releaseDate || '')),
    popular: (a, b) => (Number(b.rymVotes) || 0) - (Number(a.rymVotes) || 0), obscure: (a, b) => (Number(a.rymVotes) || 0) - (Number(b.rymVotes) || 0),
    played: (a, b) => ctx.playOf(b).n - ctx.playOf(a).n, leastplayed: (a, b) => ctx.playOf(a).n - ctx.playOf(b).n, added: (a, b) => aqAdded(b).localeCompare(aqAdded(a))
  };
  if (q.sort === 'random') { const r = gxRand(gxHash(String(Date.now()))); out = out.map(x => [r(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]); }
  else out.sort(by[q.sort || 'rating']);
  return q.limit ? out.slice(0, q.limit) : out;
}

// ----- suggestions while you type: what the last word could become -----
const AQ_PHRASES = ['rated 4+', 'rated 4.5 or more', 'unrated', 'favourites', "haven't played in a year", 'never played', 'played this month', 'played more than 10 times', 'added this year', 'added in the last 3 months', 'recently added', 'from the 90s', 'early 80s', 'late 90s', 'between 1975 and 1985', 'before 1970', 'since 2015', 'rym 3.8+', 'rated highly on rym', 'acclaimed', 'obscure', 'popular', 'bold on rym', 'best 20', '10 random', 'newest first', 'oldest first', 'most played', 'albums', 'eps', 'singles', 'live', 'compilations', 'not on ', 'by ', 'on ', 'from ', 'except '];
function aqComplete(text, ctx) {
  const m = /([^\s,]*)$/.exec(aqNorm(text)), part = m ? m[1] : ''; if (!part || part.length < 2) return [];
  const before = aqToks(text.slice(0, text.length - part.length)).filter(x => typeof x === 'string'), prev = before[before.length - 1];
  const kinds = prev === 'by' ? ['artist'] : prev === 'on' || prev === 'label' ? ['label'] : prev === 'from' && !/^\d/.test(part) ? ['place', 'genre'] : null, out = [];
  ctx.lex.forEach(e => { if (kinds && !kinds.includes(e.kind)) return; if (e.key.startsWith(part) || (e.words.length > 1 && e.words.some(x => x.startsWith(part)) && part.length >= 3)) out.push({ label: e.label, kind: e.kind, n: e.n + (e.key.startsWith(part) ? 1e6 : 0), put: e.label }); });
  if (!kinds) AQ_PHRASES.forEach(p => { if (p.startsWith(part) && p !== part) out.push({ label: p.trim(), kind: 'phrase', n: 2e6, put: p }); });
  const seen = new Set(); return out.sort((a, b) => b.n - a.n).filter(x => { const k = x.kind + x.label.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

// ----- the window -----
const AQ_EXAMPLES = ["90s shoegaze I rated 4+ and haven't played in a year", 'acclaimed jazz from the 60s, not on Blue Note', 'favourites added this year', 'obscure post-punk or new wave from the UK', '10 random unplayed albums', 'early 70s progressive rock rym 3.7+ best 20', 'japanese ambient or electronic', 'singles rated 5 stars'];
function aqEl(id) { return document.getElementById(id); }
function aqCtx() {
  const key = [state.raw.length, (state.scrobbles || []).length, (state.diary || []).length, Object.keys(state.genreTaxonomy || {}).length].join(':');
  if (aq.ctxFor !== key || !aq.ctx) { aq.ctx = aqContext(state.raw.filter(x => x && x.title), state.genreTaxonomy, aqPlaysFromState(), new Date()); aq.ctxFor = key; }
  return aq.ctx;
}
function aqHist() { try { const a = JSON.parse(localStorage.getItem(AQ_HIST_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 8) : []; } catch (e) { return []; } }
function aqHistAdd(t) { try { const a = [t, ...aqHist().filter(x => x !== t)].slice(0, 8); localStorage.setItem(AQ_HIST_KEY, JSON.stringify(a)); } catch (e) { /* not kept */ } }
function openAsk(text) { aq.open = true; aqEl('aqOverlay').hidden = false; const f = aqEl('aqInput'); if (text != null) f.value = text; aq.text = f.value; aqSearch(); setTimeout(() => f.focus(), 30); }
function closeAsk() { aq.open = false; const ov = aqEl('aqOverlay'); if (ov) ov.hidden = true; }
function aqSearch() {
  const t = aq.text.trim(); aq.shown = 60;
  if (!t) { aq.res = null; aqRender(); return; }
  const ctx = aqCtx(), q = aqParse(t, ctx); aq.res = { q, list: aqRun(ctx.items, q, ctx) }; aqRender();
}
function aqRender() {
  const box = aqEl('aqResults'), chips = aqEl('aqChips'); if (!box) return;
  if (!aq.res) {
    chips.innerHTML = ''; const h = aqHist();
    box.innerHTML = `<p class="te-dim te-pad">Ask for releases the way you'd say it. It understands genres (and everything under them in your taxonomy), descriptors, labels, artists, places, years and decades, your ratings and RYM's, when you added and played things, "not", "or", and how to sort.</p><div class="gx-h">Try</div>${AQ_EXAMPLES.map(x => `<button type="button" class="aq-ex" data-aq-ex="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join('')}${h.length ? `<div class="gx-h">Recent</div>${h.map(x => `<button type="button" class="aq-ex" data-aq-ex="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join('')}` : ''}`;
    return;
  }
  const { q, list } = aq.res, ctx = aqCtx();
  chips.innerHTML = q.chips.map(c => `<span class="aq-chip${c.startsWith('Not:') ? ' aq-neg' : ''}">${escapeHtml(c)}</span>`).join('') + q.unknown.map(u => u.applied ? `<span class="aq-chip aq-unk">Read “${escapeHtml(u.word)}” as ${escapeHtml(u.sugg.label)}</span>` : `<span class="aq-chip aq-unk">Didn't understand “${escapeHtml(u.word)}”${u.sugg ? ` — <button type="button" data-aq-fix="${escapeHtml(u.word)}" data-aq-to="${escapeHtml(u.sugg.label)}">${escapeHtml(u.sugg.label)}?</button>` : ': nothing matches it'}</span>`).join('');
  const rows = list.slice(0, aq.shown).map(it => { const p = ctx.playOf(it), y = aqYearOf(it); return `<button type="button" class="aq-row" data-aq-open="${escapeHtml(artKey(it))}"><img src="${escapeHtml(gxCover(it))}" alt="" loading="lazy"><span class="aq-main"><b>${escapeHtml(it.title)}</b><i>${escapeHtml(it.artist)}${y ? ' · ' + y : ''}${it.label ? ' · ' + escapeHtml(String(it.label).split(/[,;]/)[0]) : ''}</i><em>${escapeHtml([it.genre, it.genre2].filter(Boolean).join(' · '))}</em></span><span class="aq-nums">${Number(it.rating) > 0 ? `<b>${Number(it.rating)}★</b>` : '<span class="aq-dim">unrated</span>'}${Number(it.rymRating) > 0 ? `<span>RYM ${Number(it.rymRating).toFixed(2)}</span>` : ''}<span>${p.n ? `${p.n} play${p.n === 1 ? '' : 's'}${p.last ? ' · ' + p.last : ''}` : 'never played'}</span></span></button>`; }).join('');
  box.innerHTML = `<div class="aq-bar"><b>${list.length.toLocaleString()}</b> release${list.length === 1 ? '' : 's'}${list.length ? `<span class="aq-acts"><button type="button" class="chip-btn" data-aq="play">Play all</button><button type="button" class="chip-btn" data-aq="shuffle">Shuffle</button><button type="button" class="chip-btn" data-aq="save">Save as playlist</button></span>` : ''}</div>${rows || '<p class="te-dim te-pad">Nothing in your crate fits all of that. Remove a condition, or check the chips above for anything it read differently from what you meant.</p>'}${list.length > aq.shown ? `<button type="button" class="chip-btn aq-more" data-aq="more">Show more (${(list.length - aq.shown).toLocaleString()} left)</button>` : ''}`;
}
function aqRenderSugg() {
  const s = aqEl('aqSugg'); if (!s) return;
  if (!aq.sugg.length) { s.hidden = true; return; }
  s.hidden = false; s.innerHTML = aq.sugg.map((x, i) => `<button type="button" class="aq-s${i === aq.si ? ' on' : ''}" data-aq-s="${i}"><b>${escapeHtml(x.label)}</b><em>${{ genre: 'genre', desc: 'descriptor', label: 'label', artist: 'artist', place: 'place', phrase: '' }[x.kind] || ''}</em></button>`).join('');
}
function aqAccept(i) {
  const x = aq.sugg[i], f = aqEl('aqInput'); if (!x || !f) return;
  f.value = f.value.replace(/[^\s,]*$/, '') + x.put + (x.put.endsWith(' ') ? '' : ' '); aq.text = f.value; aq.sugg = []; aq.si = -1; aqRenderSugg(); aqSearch(); f.focus();
}
(function wireAsk() {
  const ov = aqEl('aqOverlay'), f = aqEl('aqInput'); if (!ov || !f) return;
  const menu = aqEl('menuAsk'); if (menu) menu.addEventListener('click', () => { el.layoutMenu.hidden = true; openAsk(); });
  f.addEventListener('input', () => {
    aq.text = f.value; clearTimeout(aq.timer); aq.timer = setTimeout(aqSearch, 140);
    aq.sugg = aqComplete(f.value, aqCtx()); aq.si = -1; aqRenderSugg();
  });
  f.addEventListener('keydown', (e) => {
    if (aq.sugg.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); aq.si = (aq.si + (e.key === 'ArrowDown' ? 1 : -1) + aq.sugg.length) % aq.sugg.length; aqRenderSugg(); return; }
    if (aq.sugg.length && (e.key === 'Tab' || (e.key === 'Enter' && aq.si >= 0))) { e.preventDefault(); aqAccept(aq.si >= 0 ? aq.si : 0); return; }
    if (e.key === 'Enter') { e.preventDefault(); aq.sugg = []; aqRenderSugg(); clearTimeout(aq.timer); aqSearch(); if (aq.text.trim()) aqHistAdd(aq.text.trim()); }
    if (e.key === 'Escape' && aq.sugg.length) { e.stopPropagation(); aq.sugg = []; aqRenderSugg(); }
  });
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('#aqClose')) { closeAsk(); return; }
    const s = e.target.closest('[data-aq-s]'); if (s) { aqAccept(Number(s.dataset.aqS)); return; }
    const ex = e.target.closest('[data-aq-ex]'); if (ex) { f.value = ex.dataset.aqEx; aq.text = f.value; aqHistAdd(aq.text); aqSearch(); return; }
    const fix = e.target.closest('[data-aq-fix]'); if (fix) { const re = new RegExp('\\b' + fix.dataset.aqFix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'); f.value = f.value.replace(re, fix.dataset.aqTo); aq.text = f.value; aqSearch(); return; }
    const op = e.target.closest('[data-aq-open]'); if (op) { const it = state.raw.find(x => artKey(x) === op.dataset.aqOpen); if (it) { closeAsk(); openDeck(it); } return; }
    const a = e.target.closest('[data-aq]'); if (!a || !aq.res) return;
    const list = aq.res.list;
    if (a.dataset.aq === 'more') { aq.shown += 60; aqRender(); }
    else if (a.dataset.aq === 'play') { aqHistAdd(aq.text.trim()); flashGlobalToast(`Playing ${list.length} release${list.length === 1 ? '' : 's'}`); playAlbumsReplacingQueue(list.slice(0, 200)); }
    else if (a.dataset.aq === 'shuffle') { const l = list.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } flashGlobalToast(`Shuffling ${l.length} release${l.length === 1 ? '' : 's'}`); playAlbumsReplacingQueue(l.slice(0, 200)); }
    else if (a.dataset.aq === 'save') { aqHistAdd(aq.text.trim()); const name = aq.text.trim().slice(0, 60), items = list.slice(0, 500).map(it => ({ itemType: 'album', row: it.row, albumId: it.albumId || '', trackNum: '', trackName: '' })); closeAsk(); openPlaylistModal('create', null, items); el.playlistNameInput.value = name.charAt(0).toUpperCase() + name.slice(1); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aq.open) { e.stopPropagation(); closeAsk(); } }, true);
})();
