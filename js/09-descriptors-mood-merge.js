// CRATE — descriptors, pick by mood, merge duplicates, label browse.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// ================= Descriptors: a lookup grouped by category, and suggestions as you fill the field in =================
// Rate Your Music's descriptors (melancholic, lo-fi, male vocals...) sorted by what they describe. The list is a starting point, not a rule: whatever is in YOUR crate
// that isn't in it lands under "Other (yours)" and is suggested and counted all the same.
const DESC_TAX = [
  { id: 'mood', label: 'Mood & emotion', groups: [
    ['sadness', ['melancholic', 'sad', 'bittersweet', 'depressive', 'gloomy', 'somber'], ['sorrowful', 'mournful', 'blue', 'doleful', 'woeful', 'downcast', 'dejected', 'glum', 'miserable', 'heartbroken']],
    ['longing & nostalgia', ['nostalgic', 'longing', 'yearning', 'sentimental'], ['wistful', 'homesick', 'pining', 'reminiscent', 'yearn', 'sentiment']],
    ['solitude', ['lonely', 'alienating', 'introspective'], ['isolated', 'solitary', 'withdrawn', 'reflective', 'pensive', 'contemplative', 'solitude']],
    ['anger', ['angry', 'aggressive', 'rebellious', 'defiant'], ['furious', 'hostile', 'enraged', 'belligerent', 'wrathful', 'fierce', 'rage', 'bitter', 'militant']],
    ['fear & dread', ['anxious', 'paranoid', 'tense', 'suspenseful', 'ominous', 'menacing', 'eerie', 'haunting', 'disturbing'], ['scary', 'frightening', 'creepy', 'sinister', 'uneasy', 'nervous', 'foreboding', 'spooky', 'unsettling', 'fear', 'terrifying', 'dread']],
    ['darkness', ['dark', 'bleak', 'brooding', 'apocalyptic', 'cold'], ['grim', 'desolate', 'black', 'sombre', 'bleakness', 'doom', 'dismal']],
    ['joy', ['joyful', 'happy', 'euphoric', 'ecstatic', 'carefree', 'uplifting', 'optimistic', 'hopeful', 'triumphant'], ['joyous', 'cheerful', 'elated', 'jubilant', 'glad', 'sunny', 'upbeat', 'merry', 'blissful', 'joy', 'delighted', 'positive']],
    ['humour & play', ['playful', 'humorous', 'whimsical', 'quirky', 'sarcastic'], ['funny', 'witty', 'silly', 'comic', 'jokey', 'tongue-in-cheek', 'zany', 'goofy', 'humour', 'comedic', 'cheeky']],
    ['calm', ['serene', 'peaceful', 'calm', 'relaxing', 'soothing', 'mellow'], ['tranquil', 'placid', 'restful', 'gentle', 'chilled', 'still', 'peace', 'easygoing']],
    ['passion & desire', ['romantic', 'passionate', 'sensual', 'sexual', 'erotic'], ['amorous', 'steamy', 'seductive', 'lustful', 'tender', 'intimate', 'loving', 'desire', 'sultry', 'lust']],
    ['intensity & drama', ['intense', 'epic', 'anthemic', 'energetic', 'cathartic', 'confident'], ['powerful', 'dramatic', 'grand', 'stirring', 'forceful', 'vigorous', 'soaring', 'bombastic', 'fiery', 'cathartic release']],
    ['mystery', ['mysterious'], ['enigmatic', 'puzzling', 'otherworldly', 'magical', 'secretive', 'mystery', 'unknowable']]
  ] },
  { id: 'theme', label: 'Lyrics & theme', groups: [
    ['love & relationships', ['love', 'heartbreak', 'relationships', 'friendship', 'family'], ['romance', 'affection', 'breakup', 'marriage', 'devotion', 'divorce', 'kinship', 'parents']],
    ['loss & death', ['loss', 'death', 'grief'], ['mourning', 'bereavement', 'funeral', 'mortality', 'dying', 'afterlife', 'passing']],
    ['politics & society', ['politics', 'protest', 'anti-war', 'war', 'social commentary', 'conscious', 'feminism', 'identity', 'poverty', 'crime', 'violence'], ['political', 'activism', 'injustice', 'revolution', 'inequality', 'resistance', 'justice', 'society', 'racism', 'class', 'gender', 'poor']],
    ['faith & the unseen', ['religious', 'spirituality', 'occult', 'mythology'], ['religion', 'god', 'prayer', 'faith', 'mystic', 'magic', 'witchcraft', 'folklore', 'spiritual', 'church', 'gospel lyrics', 'legend']],
    ['the mind', ['existential', 'philosophical', 'depression', 'mental illness', 'addiction', 'alienation', 'self-reflection'], ['anxiety', 'therapy', 'psychology', 'despair', 'introspection', 'meaning of life', 'madness', 'insanity']],
    ['vice & indulgence', ['sex', 'drugs', 'alcohol', 'partying'], ['hedonism', 'booze', 'intoxication', 'nightlife', 'debauchery', 'drinking', 'getting high', 'celebration']],
    ['place & journey', ['nature', 'urban', 'city life', 'travel', 'road trip', 'space'], ['wilderness', 'countryside', 'street', 'highway', 'wanderlust', 'cosmos', 'journey', 'city', 'environment', 'wandering']],
    ['youth & time', ['youth', 'coming of age', 'history', 'work', 'money'], ['adolescence', 'growing up', 'school', 'past', 'labor', 'wealth', 'teenage', 'childhood', 'jobs']],
    ['imagination & story', ['surreal', 'fantasy', 'sci-fi', 'storytelling', 'poetic', 'literature', 'satirical', 'absurdist', 'cryptic', 'dystopian', 'conspiracy'], ['dream', 'fable', 'fiction', 'parable', 'allegory', 'narrative', 'future', 'satire', 'abstract', 'weird lyrics', 'tale']]
  ] },
  { id: 'vocals', label: 'Vocals', groups: [
    ['voice type', ['male vocals', 'female vocals', 'mixed vocals', 'androgynous vocals', 'instrumental'], ['baritone', 'soprano', 'alto', 'tenor', 'vocalist', 'singer', 'no vocals', 'wordless', 'bass voice', 'vocal']],
    ['soft & high', ['falsetto', 'breathy', 'whispered', 'crooning'], ['soft voice', 'hushed', 'delicate', 'airy voice', 'tender voice', 'whisper']],
    ['harsh & loud', ['screaming', 'growling', 'raspy', 'shouting', 'nasal'], ['shrieking', 'gravelly', 'guttural', 'hoarse', 'yelling', 'screamo', 'rough voice', 'scream']],
    ['spoken & rhythmic', ['spoken word', 'rapping', 'chanting', 'deadpan', 'monotone'], ['rap', 'mc', 'recitation', 'talking', 'flow', 'poetry reading', 'chant']],
    ['group & trained', ['choir', 'vocal harmonies', 'operatic', 'a cappella', 'throat singing', 'yodeling'], ['chorus', 'gospel choir', 'harmony', 'choral', 'barbershop', 'harmonies', 'opera']],
    ['expressive', ['soulful', 'melodic vocals'], ['emotive', 'bluesy', 'powerful voice', 'smooth voice', 'soul', 'expressive']],
    ['processed', ['auto-tune', 'vocoder'], ['robotic voice', 'vocoded', 'pitch-corrected', 'synthetic voice', 'autotune', 'talkbox']]
  ] },
  { id: 'tempo', label: 'Tempo & rhythm', groups: [
    ['slow', ['slow', 'plodding', 'slow burn', 'relaxed', 'laid-back'], ['sluggish', 'languid', 'unhurried', 'leisurely', 'crawling', 'dragging', 'lethargic', 'slow tempo', 'downtempo']],
    ['middling', ['mid-tempo', 'steady', 'shuffle', 'swing', 'waltz', 'march'], ['moderate', 'medium', 'strolling', 'walking pace', 'medium tempo', 'even']],
    ['fast', ['fast', 'uptempo', 'frenetic', 'driving', 'galloping', 'bouncy'], ['quick', 'rapid', 'speedy', 'breakneck', 'rushing', 'hectic', 'frantic', 'brisk', 'fast tempo', 'racing']],
    ['groove', ['groovy', 'danceable', 'rhythmic', 'syncopated', 'polyrhythmic', 'breakbeat', 'four-on-the-floor', 'tribal'], ['funky', 'dance', 'beat', 'rhythm', 'swinging', 'groove', 'percussive']],
    ['pattern', ['repetitive', 'stuttering', 'pulsing', 'trance-like', 'mechanical', 'building', 'off-kilter', 'odd time signatures'], ['looped', 'irregular', 'motorik', 'escalating', 'crescendo', 'cyclical', 'ostinato', 'uneven']]
  ] },
  { id: 'texture', label: 'Texture & timbre', groups: [
    ['noise & distortion', ['noisy', 'distorted', 'fuzzy', 'harsh', 'abrasive', 'gritty', 'crunchy', 'saturated', 'buzzing', 'wall of sound'], ['loud', 'grungy', 'static', 'fuzz', 'overdriven', 'scratchy', 'rough', 'cacophonous', 'distortion', 'noise rock']],
    ['lo-fi & murk', ['lo-fi', 'hazy', 'murky', 'muddy', 'crackly', 'woozy'], ['tape hiss', 'dusty', 'grainy', 'blurry', 'hissy', 'worn', 'low fidelity', 'dirty', 'smudged']],
    ['dreamy & ethereal', ['dreamy', 'atmospheric', 'ethereal', 'shimmering', 'spacey', 'airy', 'reverb-heavy', 'echoing', 'cavernous', 'spacious'], ['floaty', 'otherworldly sound', 'heavenly', 'cloudy', 'weightless', 'expansive', 'dreamlike', 'angelic', 'reverberant', 'vast']],
    ['rich & warm', ['lush', 'warm', 'rich', 'thick', 'velvety', 'smooth', 'soft', 'glossy'], ['plush', 'full', 'round', 'mellifluous', 'silky', 'creamy', 'gleaming', 'cosy', 'cozy', 'sumptuous']],
    ['sparse & clean', ['sparse', 'minimalistic', 'thin', 'crisp', 'bright', 'sharp', 'polished', 'tinny', 'shrill'], ['bare', 'stripped-down', 'clean', 'clear', 'spartan', 'piercing', 'high-pitched', 'austere', 'brittle', 'stark', 'pristine']],
    ['dense & heavy', ['dense', 'layered', 'heavy', 'claustrophobic', 'droning', 'metallic', 'resonant', 'ringing'], ['crowded', 'massive', 'weighty', 'oppressive', 'cluttered', 'sludgy', 'huge', 'drone']],
    ['organic & synthetic', ['raw', 'organic', 'synthetic', 'jangly', 'glitchy'], ['natural', 'earthy', 'artificial', 'digital', 'robotic sound', 'chiming', 'unpolished', 'machine-made']]
  ] },
  { id: 'instr', label: 'Instruments', groups: [
    ['strings', ['acoustic guitar', 'electric guitar', 'guitar-based', 'slide guitar', 'pedal steel', 'banjo', 'harp', 'sitar', 'violin', 'cello', 'string section', 'strings', 'upright bass'], ['fiddle', 'lute', 'mandolin', 'bass guitar', 'ukulele', 'double bass', 'viola', 'guitar', 'bass']],
    ['keys', ['piano', 'organ', 'synthesizer', 'mellotron', 'accordion', 'harmonica', 'marimba', 'vibraphone', 'theremin'], ['keyboard', 'keys', 'rhodes', 'moog', 'electric piano', 'harpsichord', 'glockenspiel', 'xylophone', 'synth']],
    ['winds & brass', ['flute', 'saxophone', 'trumpet', 'brass', 'horns'], ['clarinet', 'trombone', 'oboe', 'woodwind', 'bagpipes', 'tuba', 'french horn', 'sax']],
    ['rhythm & electronics', ['drum machine', 'percussion', 'bass-heavy', 'sampling', 'turntables', 'orchestral', 'acoustic'], ['drums', 'beatbox', 'congas', '808', 'sampler', 'dj', 'scratching', 'orchestra', 'unplugged']]
  ] },
  { id: 'style', label: 'Style & production', groups: [
    ['adventurous', ['experimental', 'avant-garde', 'eclectic', 'genre-bending', 'improvisational', 'noise', 'maximalist'], ['unconventional', 'innovative', 'weird', 'boundary-pushing', 'freeform', 'abstract sound', 'strange', 'unusual']],
    ['ambitious', ['progressive', 'conceptual', 'technical', 'virtuosic', 'lengthy', 'cinematic'], ['proggy', 'intricate', 'skilled', 'suite', 'soundtrack', 'orchestrated', 'complex', 'elaborate', 'long']],
    ['accessible', ['melodic', 'catchy', 'song-based', 'minimal'], ['hooky', 'tuneful', 'pop', 'singalong', 'memorable', 'simple', 'direct', 'catchiness']],
    ['trippy', ['psychedelic', 'hypnotic', 'ambient', 'soundscapes', 'nocturnal'], ['trippy', 'mind-expanding', 'drifting', 'meditative', 'trance', 'background music', 'acid']],
    ['how it was made', ['live', 'home-recorded', 'sample-based'], ['concert', 'bedroom', 'diy', 'field recording', 'studio', 'collage', 'cut-and-paste', 'live recording']]
  ] },
  { id: 'setting', label: 'Setting & atmosphere', groups: [
    ['seasons & weather', ['summer', 'autumn', 'winter', 'spring', 'rainy'], ['sunny', 'snowy', 'stormy', 'foggy', 'holiday', 'christmas', 'fall', 'rain', 'snow']],
    ['day & night', ['night', 'dawn', 'sunset'], ['midnight', 'twilight', 'morning', 'evening', 'dusk', 'sunrise', 'late night', 'daybreak']],
    ['landscape', ['tropical', 'rural', 'desert', 'oceanic', 'pastoral'], ['beach', 'countryside', 'jungle', 'farm', 'sea', 'island', 'mountain', 'forest', 'ocean', 'seaside']],
    ['sky & beyond', ['cosmic', 'celestial', 'futuristic'], ['stars', 'galaxy', 'space age', 'heavenly bodies', 'astral', 'future']],
    ['era & world', ['industrial', 'retro', 'vintage', 'medieval', 'gothic'], ['factory', 'old-fashioned', 'renaissance', 'victorian', 'ancient', 'steampunk', 'dated', 'period']]
  ] }
];
// the flat view the rest of the code uses (a category and all its descriptors), and the thesaurus view (each shared sense with its descriptors and the words that merely mean it)
const DESC_CATS = DESC_TAX.map(c => ({ id: c.id, label: c.label, groups: c.groups.map(g => ({ head: g[0], words: g[1], syn: g[2] || [] })), words: [].concat(...c.groups.map(g => g[1])) }));
const DESC_CONCEPTS = []; DESC_CATS.forEach(c => c.groups.forEach(g => DESC_CONCEPTS.push({ cat: c.id, head: g.head, words: g.words, syn: g.syn })));
const DESC_ALIAS = { 'melancholy': 'melancholic', 'lofi': 'lo-fi', 'lo fi': 'lo-fi', 'male vocalist': 'male vocals', 'female vocalist': 'female vocals', 'male vocal': 'male vocals', 'female vocal': 'female vocals', 'psychedelia': 'psychedelic', 'noisey': 'noisy', 'dream-like': 'dreamy', 'sci fi': 'sci-fi', 'scifi': 'sci-fi', 'atmosphere': 'atmospheric', 'minimalist': 'minimalistic', 'religion': 'religious', 'political': 'politics', 'spiritual': 'spirituality', 'harmonies': 'vocal harmonies' };
const descKey = (v) => { const k = String(v == null ? '' : v).toLowerCase().replace(/[_\s]+/g, ' ').trim(); return DESC_ALIAS[k] || k; };
let DESC_CONCEPT_OF = null, DESC_WORDS = null;
function descConceptOf(key) { if (!DESC_CONCEPT_OF) { DESC_CONCEPT_OF = new Map(); DESC_CONCEPTS.forEach(c => c.words.forEach(w => { if (!DESC_CONCEPT_OF.has(w)) DESC_CONCEPT_OF.set(w, c); })); } return DESC_CONCEPT_OF.get(key) || null; }
function descGrp(key) { const c = descConceptOf(key); return c ? `${descCatLabel(c.cat)} \u00b7 ${c.head}` : descCatLabel(descCatOf(key)); }
function descSynonymConcepts(q) {                                // the shared senses that a word means or names (not a descriptor itself): "sorrowful" -> sadness
  if (!q || q.length < 3) return [];
  if (!DESC_WORDS) { DESC_WORDS = new Set(); DESC_CONCEPTS.forEach(c => c.words.forEach(w => DESC_WORDS.add(w))); }
  const out = []; DESC_CONCEPTS.forEach(c => { for (const w of c.syn.concat(c.head)) { const k = descKey(w); if (DESC_WORDS.has(k) && k !== q) continue; if (k === q || k.startsWith(q)) { out.push({ c, via: w }); break; } } });
  return out;
}
let DESC_CAT_OF = null;
function descCatOf(key) { if (!DESC_CAT_OF) { DESC_CAT_OF = new Map(); DESC_CATS.forEach(c => c.words.forEach(w => { if (!DESC_CAT_OF.has(w)) DESC_CAT_OF.set(w, c.id); })); } return DESC_CAT_OF.get(key) || 'other'; }
const descCatLabel = (id) => (DESC_CATS.find(c => c.id === id) || { label: 'Other (yours)' }).label;
function parseDescriptors(v) { const seen = new Set(), out = []; String(v == null ? '' : v).split(/[,;\n\u00b7]+/).forEach(t => { const label = t.trim().replace(/\s+/g, ' '); const k = descKey(label); if (label && !seen.has(k)) { seen.add(k); out.push(label); } }); return out; }
function descNormalizeField(v) { return parseDescriptors(v).map(l => descKey(l)).join(', '); }          // what is saved: a clean, de-duplicated, lower-case list in RYM's own spelling where it is known
function descLibrary(items) {                                    // every descriptor in these releases, counted
  const m = new Map();
  (items || []).forEach(r => parseDescriptors(r.rymDescriptors).forEach(l => { const k = descKey(l), e = m.get(k) || { key: k, label: k, count: 0 }; e.count++; m.set(k, e); }));
  return m;
}
function descCandidates(token, have) {                           // suggestions for what is being typed, best first
  const lib = descLibrary(state.raw), q = descKey(token), taken = new Set(have), all = [], known = new Set(), out = [], seen = new Set();
  DESC_CATS.forEach(c => c.words.forEach(w => { if (!known.has(w)) { known.add(w); all.push({ key: w, cat: c.id }); } }));
  lib.forEach(e => { if (!known.has(e.key)) all.push({ key: e.key, cat: descCatOf(e.key) }); });
  const push = (key, sc, grp, via) => { if (taken.has(key) || seen.has(key)) return; seen.add(key); out.push({ key, cat: descCatOf(key), n: (lib.get(key) || {}).count || 0, sc, grp: grp || descGrp(key), via: via || '' }); };
  if (!q && have.length) { const last = have[have.length - 1], con = descConceptOf(last); if (con) con.words.forEach(w => push(w, 2.5, 'Similar to ' + last)); }          // like a thesaurus: the others that mean what you just chose
  all.forEach(a => {
    const n = (lib.get(a.key) || {}).count || 0; let sc = 0;
    if (!q) sc = n ? 1 : 0; else if (a.key.startsWith(q)) sc = 3; else if (a.key.split(/[\s-]+/).some(w => w.startsWith(q))) sc = 2; else if (a.key.includes(q)) sc = 1;
    if (sc) push(a.key, sc);
  });
  if (q && out.length < 3) descSynonymConcepts(q).forEach(h => h.c.words.forEach(w => push(w, 1.5, `${descCatLabel(h.c.cat)} \u00b7 ${h.c.head}`, h.via)));          // not a descriptor: offer the ones that MEAN it
  out.sort((x, y) => y.sc - x.sc || y.n - x.n || x.key.localeCompare(y.key));
  if (!q && !out.length) DESC_CATS.forEach(c => c.words.slice(0, 2).forEach(w => push(w, 1)));          // nothing in your crate yet: a few from each category to start
  return out.slice(0, q ? 10 : 8);
}
const descSug = { input: null, items: [], active: -1 };
function descTokenAt(input) {                                    // the word being typed: between the separators either side of the cursor
  const v = input.value, at = input.selectionStart == null ? v.length : input.selectionStart;
  const start = Math.max(v.lastIndexOf(',', at - 1), v.lastIndexOf(';', at - 1)) + 1; let end = v.slice(at).search(/[,;]/); end = end < 0 ? v.length : at + end;
  return { start, end, text: v.slice(start, end) };
}
function descSuggestHide() { const d = document.getElementById('descSuggest'); if (d) d.hidden = true; descSug.input = null; descSug.items = []; descSug.active = -1; }
function descSuggestShow(input) {
  const d = document.getElementById('descSuggest'); if (!d) return;
  const t = descTokenAt(input), have = parseDescriptors(input.value.slice(0, t.start) + ',' + input.value.slice(t.end)).map(descKey);
  const cands = descCandidates(t.text, have); if (!cands.length) { descSuggestHide(); return; }
  const order = []; cands.forEach(c => { if (!order.includes(c.grp)) order.push(c.grp); });
  const flat = []; let html = '';
  order.forEach(g => { html += `<div class="desc-sug-head">${escapeHtml(g)}</div>`; cands.filter(c => c.grp === g).forEach(c => { html += `<div class="desc-sug" role="option" data-i="${flat.length}"><span>${escapeHtml(c.key)}</span>${c.via ? `<small>\u2248 ${escapeHtml(c.via)}</small>` : c.n ? `<small>${c.n}</small>` : ''}</div>`; flat.push(c); }); });
  descSug.input = input; descSug.items = flat; descSug.active = 0; d.innerHTML = html;
  const r = input.getBoundingClientRect(); d.style.left = r.left + 'px'; d.style.top = (r.bottom + 2) + 'px'; d.style.minWidth = Math.max(220, r.width) + 'px'; d.hidden = false;
  d.querySelector('.desc-sug').classList.add('on');
}
function descSuggestMove(by) {
  const d = document.getElementById('descSuggest'); if (!d || d.hidden || !descSug.items.length) return;
  descSug.active = (descSug.active + by + descSug.items.length) % descSug.items.length;
  d.querySelectorAll('.desc-sug').forEach(e => e.classList.toggle('on', Number(e.dataset.i) === descSug.active));
  const on = d.querySelector('.desc-sug.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
}
function descInsert(input, key) {                                // the word being typed becomes the chosen descriptor, and the cursor moves on to the next
  const t = descTokenAt(input), before = input.value.slice(0, t.start).replace(/\s+$/, ''), after = input.value.slice(t.end).replace(/^[\s,;]+/, '');
  input.value = (before ? before + ' ' : '') + key + ', ' + (after ? after : ''); const pos = ((before ? before.length + 1 : 0) + key.length + 2);
  try { input.setSelectionRange(pos, pos); } catch (e) { /* not a text field */ } input.dispatchEvent(new Event('input', { bubbles: true }));
}
function descAttach(input) {
  if (!input || input.dataset.descBound) return; input.dataset.descBound = '1'; input.setAttribute('autocomplete', 'off');
  const show = () => descSuggestShow(input);
  input.addEventListener('input', show); input.addEventListener('focus', show); input.addEventListener('click', show);
  input.addEventListener('keydown', (e) => {
    const d = document.getElementById('descSuggest'), open = d && !d.hidden && descSug.input === input;
    if (e.key === 'ArrowDown' && open) { e.preventDefault(); descSuggestMove(1); }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); descSuggestMove(-1); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && open && descSug.items[descSug.active] && descTokenAt(input).text.trim()) { e.preventDefault(); descInsert(input, descSug.items[descSug.active].key); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); descSuggestHide(); }
  });
  input.addEventListener('blur', () => setTimeout(descSuggestHide, 150));
}
const descBrowse = { input: null };
function descBrowseRender() {
  const body = document.getElementById('descBrowseBody'), f = descKey((document.getElementById('descBrowseFilter') || {}).value || ''); if (!body) return;
  const lib = descLibrary(state.raw), on = new Set(parseDescriptors(descBrowse.input ? descBrowse.input.value : '').map(descKey)), known = new Set();
  DESC_CATS.forEach(c => c.words.forEach(w => known.add(w)));
  const direct = !f || [...known].some(w => w.includes(f)) || [...lib.keys()].some(w => w.includes(f));
  const hits = !direct ? descSynonymConcepts(f) : [], via = new Map(hits.map(h => [h.c, h.via]));          // nothing is called that: show what MEANS it
  const chip = (w) => { const n = (lib.get(w) || {}).count || 0; return `<button type="button" class="desc-chip${on.has(w) ? ' on' : ''}" data-d="${escapeHtml(w)}" aria-pressed="${on.has(w)}">${escapeHtml(w)}${n ? `<small>${n}</small>` : ''}</button>`; };
  let html = hits.length ? `<p class="desc-meaning">No descriptor is called \u201c${escapeHtml(f)}\u201d; these mean the same.</p>` : '';
  DESC_CATS.forEach(cat => {
    let inner = '';
    cat.groups.forEach(g => {
      const con = DESC_CONCEPTS.find(c => c.cat === cat.id && c.head === g.head), v = via.get(con), ws = g.words.filter(w => !f || (direct ? w.includes(f) : v !== undefined));
      if (ws.length) inner += `<div class="desc-concept"><span class="desc-concept-name">${escapeHtml(g.head)}${v ? ` <em>\u2248 ${escapeHtml(v)}</em>` : ''}</span><div class="desc-chips">${ws.map(chip).join('')}</div></div>`;
    });
    if (inner) html += `<div class="desc-group"><div class="desc-group-head">${escapeHtml(cat.label)}</div>${inner}</div>`;
  });
  const yours = []; lib.forEach(e => { if (!known.has(e.key) && (!f || e.key.includes(f))) yours.push(e.key); });
  if (yours.length) html += `<div class="desc-group"><div class="desc-group-head">Other (yours)</div><div class="desc-chips">${yours.sort().map(chip).join('')}</div></div>`;
  body.innerHTML = html || '<p class="left-empty">No descriptor matches.</p>';
}
function descBrowseOpen(inputId) {
  const input = document.getElementById(inputId), ov = document.getElementById('descBrowseOverlay'); if (!input || !ov) return;
  descBrowse.input = input; const f = document.getElementById('descBrowseFilter'); if (f) f.value = ''; descBrowseRender(); ov.hidden = false; if (f) f.focus();
}
function descBrowseClose() { const ov = document.getElementById('descBrowseOverlay'); if (ov) ov.hidden = true; if (descBrowse.input) { descBrowse.input.value = parseDescriptors(descBrowse.input.value).map(descKey).join(', '); descBrowse.input.dispatchEvent(new Event('input', { bubbles: true })); descSuggestHide(); } descBrowse.input = null; }
(function wireDescriptors() {
  ['addRymDescriptors', 'editRymDescriptors'].forEach(id => descAttach(document.getElementById(id)));
  const sug = document.getElementById('descSuggest');
  if (sug) { sug.addEventListener('mousedown', (e) => { const it = e.target.closest('.desc-sug'); if (!it) return; e.preventDefault(); if (descSug.input) { const c = descSug.items[Number(it.dataset.i)]; if (c) descInsert(descSug.input, c.key); } }); }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-desc-browse]'); if (b) { e.preventDefault(); descBrowseOpen(b.dataset.descBrowse); } });
  const ov = document.getElementById('descBrowseOverlay'); if (!ov) return;
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.id === 'descBrowseDone') { descBrowseClose(); return; }
    const chip = e.target.closest('.desc-chip'); if (!chip || !descBrowse.input) return;
    const k = chip.dataset.d, list = parseDescriptors(descBrowse.input.value).map(descKey), at = list.indexOf(k);
    if (at >= 0) list.splice(at, 1); else list.push(k);
    descBrowse.input.value = list.join(', '); descBrowseRender();
  });
  const f = document.getElementById('descBrowseFilter'); if (f) f.addEventListener('input', descBrowseRender);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov && !ov.hidden) { e.stopPropagation(); descBrowseClose(); } }, true);
})();

// ================= Pick by mood: choose how it should feel, and CRATE finds what in your crate fits =================
// A release "fits a sense" when any of its descriptors is in that shared sense (sadness, calm, slow, dreamy & ethereal...). The more of the senses you pick it fits, and the more of its descriptors
// that do, the higher it ranks; ties go to what you rated highest.
const mood = { open: false, sel: new Set(), all: false, fresh: false, shown: 40, msg: '', last: [] };
const moodKeyOf = (c) => c.cat + ':' + c.head;
function moodIndex() {                                           // for each release with descriptors: which senses they fall in, and which descriptors fall in each
  const out = [];
  state.raw.forEach(r => {
    const keys = parseDescriptors(r.rymDescriptors).map(descKey); if (!keys.length) return;
    const bySense = new Map(); keys.forEach(k => { const c = descConceptOf(k); if (!c) return; const id = moodKeyOf(c); if (!bySense.has(id)) bySense.set(id, []); bySense.get(id).push(k); });
    if (bySense.size) out.push({ item: r, bySense });
  });
  return out;
}
function moodResults() {
  const sel = [...mood.sel], res = [];
  moodIndex().forEach(({ item, bySense }) => {
    if (mood.fresh && hasLoggedListen(item)) return;
    const hit = sel.filter(id => bySense.has(id)); if (!hit.length || (mood.all && hit.length < sel.length)) return;
    const words = []; hit.forEach(id => words.push(...bySense.get(id)));
    res.push({ item, hit: hit.length, words, score: hit.length * 1000 + words.length * 10 });
  });
  res.sort((a, b) => b.score - a.score || (b.item.rating || 0) - (a.item.rating || 0) || (b.item.rymRating || 0) - (a.item.rymRating || 0) || a.item.title.localeCompare(b.item.title));
  return res;
}
function moodFeeling(text) {                                     // a word for a feeling -> the shared sense(s) that mean it: "sorrowful" -> sadness, "melan" -> sadness
  const q = descKey(text); if (!q) return;
  let found = []; const con = descConceptOf(q);
  if (con) found = [con]; else { found = descSynonymConcepts(q).map(h => h.c); if (!found.length && q.length >= 3) found = DESC_CONCEPTS.filter(c => c.words.some(w => w.startsWith(q))); }
  if (!found.length) mood.msg = `Nothing in the thesaurus means \u201c${text.trim()}\u201d. Try another word, or pick from the list.`;
  else { found.slice(0, 3).forEach(c => mood.sel.add(moodKeyOf(c))); mood.msg = `\u201c${text.trim()}\u201d \u2192 ${found.slice(0, 3).map(c => c.head).join(', ')}`; }
}
function moodThumb(item) {
  const url = (state.artCache[artKey(item)] && state.artCache[artKey(item)].art) || item.cover || '';
  const init = (String(item.artist || '?').match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
  return url ? `<img class="mood-img" src="${escapeHtml(url)}" ${rymIsRymImage(url) ? 'referrerpolicy="no-referrer" ' : ''}alt="" loading="lazy" data-init="${escapeHtml(init)}">` : `<div class="mood-ph" aria-hidden="true">${escapeHtml(init)}</div>`;
}
function moodRender() {
  const sensesEl = document.getElementById('moodSenses'), resEl = document.getElementById('moodResults'), msgEl = document.getElementById('moodMsg'); if (!sensesEl || !resEl) return;
  const idx = moodIndex().filter(x => !mood.fresh || !hasLoggedListen(x.item)), counts = new Map();
  idx.forEach(x => x.bySense.forEach((_, id) => counts.set(id, (counts.get(id) || 0) + 1)));
  sensesEl.innerHTML = DESC_CATS.map(cat => `<div class="mood-cat"><div class="mood-cat-name">${escapeHtml(cat.label)}</div><div class="mood-chips">${cat.groups.map(g => { const id = cat.id + ':' + g.head, n = counts.get(id) || 0, on = mood.sel.has(id); return `<button type="button" class="mood-chip${on ? ' on' : ''}${n ? '' : ' none'}" data-s="${escapeHtml(id)}" aria-pressed="${on}">${escapeHtml(g.head)}<small>${n}</small></button>`; }).join('')}</div></div>`).join('');
  msgEl.textContent = mood.msg || '';
  const res = moodResults(); mood.last = res;
  const withD = moodIndex().length, total = state.raw.length;
  if (!mood.sel.size) {
    resEl.innerHTML = `<div class="mood-empty"><b>Pick a sense on the left, or type a feeling above.</b><p>${withD ? `${withD} of your ${total} releases have descriptors to match on. Update more of them from Rate Your Music (update \u21bb) or add descriptors in a release\u2019s details to widen this.` : `None of your ${total} releases has descriptors yet. Update them from Rate Your Music (update \u21bb), or add descriptors in a release\u2019s details, and this will have something to choose from.`}</p></div>`; return;
  }
  const names = [...mood.sel].map(id => { const [c, h] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]; return h; });
  const head = `<div class="mood-rhead"><span>${res.length} release${res.length === 1 ? '' : 's'} fit${res.length === 1 ? 's' : ''}${mood.sel.size > 1 ? (mood.all ? ' all ' + mood.sel.size + ' senses' : ' (best matches first)') : ''}</span><div class="mood-acts"><button type="button" class="mood-btn" data-m="surprise"${res.length ? '' : ' disabled'}>Surprise me</button><button type="button" class="mood-btn" data-m="play"${res.length ? '' : ' disabled'}>Play these</button><button type="button" class="mood-btn" data-m="save"${res.length ? '' : ' disabled'}>Save as playlist\u2026</button></div></div>`;
  const rows = res.slice(0, mood.shown).map((r, i) => `<div class="mood-row" data-i="${i}" role="button" tabindex="0">${moodThumb(r.item)}<div class="mood-name"><b>${escapeHtml(r.item.title)}</b><i>${escapeHtml(r.item.artist)}${r.item.releaseDate ? ' \u00b7 ' + escapeHtml(String(r.item.releaseDate).slice(0, 4)) : ''}</i></div><div class="mood-words">${r.words.map(w => `<span class="mood-w">${escapeHtml(w)}</span>`).join('')}${mood.sel.size > 1 ? `<small>${r.hit} of ${mood.sel.size}</small>` : ''}</div></div>`).join('');
  resEl.innerHTML = head + (res.length ? rows : `<div class="mood-empty"><b>Nothing fits that.</b><p>${mood.all ? 'Try without \u201cmust fit every sense\u201d, or take one of the senses off.' : 'None of your releases has descriptors in that sense yet.'}</p></div>`) + (res.length > mood.shown ? `<button type="button" class="mood-more" data-m="more">Show ${Math.min(40, res.length - mood.shown)} more</button>` : '');
}
function openMoodPicker() { mood.open = true; mood.shown = 40; document.getElementById('moodOverlay').hidden = false; moodRender(); const f = document.getElementById('moodFeel'); if (f) f.focus(); }
function closeMoodPicker() { mood.open = false; const ov = document.getElementById('moodOverlay'); if (ov) ov.hidden = true; }
function moodAct(kind) {
  const res = mood.last; if (!res.length) return;
  if (kind === 'surprise') { const pool = res.slice(0, 10), pick = pool[Math.floor(Math.random() * pool.length)]; closeMoodPicker(); flashGlobalToast(`Playing \u201c${pick.item.title}\u201d \u2014 ${pick.words.slice(0, 4).join(', ')}`); playAlbumReplacingQueue(pick.item); }
  else if (kind === 'play') { const list = res.slice(0, 100).map(r => r.item); for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } closeMoodPicker(); playAlbumsReplacingQueue(list); }
  else if (kind === 'save') {
    const names = [...mood.sel].map(id => id.slice(id.indexOf(':') + 1)).slice(0, 3).join(' + '), items = res.slice(0, 100).map(r => ({ itemType: 'album', row: r.item.row, albumId: r.item.albumId || '', trackNum: '', trackName: '' }));
    closeMoodPicker(); openPlaylistModal('create', null, items); el.playlistNameInput.value = `Mood: ${names}`;
  } else if (kind === 'more') { mood.shown += 40; moodRender(); }
}
(function wireMood() {
  const ov = document.getElementById('moodOverlay'); if (!ov) return;
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('#moodClose')) { closeMoodPicker(); return; }
    const chip = e.target.closest('.mood-chip'); if (chip) { const id = chip.dataset.s; if (mood.sel.has(id)) mood.sel.delete(id); else mood.sel.add(id); mood.msg = ''; mood.shown = 40; moodRender(); return; }
    const act = e.target.closest('[data-m]'); if (act) { moodAct(act.dataset.m); return; }
    if (e.target.closest('#moodClear')) { mood.sel.clear(); mood.msg = ''; moodRender(); return; }
    const row = e.target.closest('.mood-row'); if (row) { const r = mood.last[Number(row.dataset.i)]; if (r) { closeMoodPicker(); openDeck(r.item); } }
  });
  ov.addEventListener('change', (e) => { if (e.target.id === 'moodAll') { mood.all = e.target.checked; moodRender(); } else if (e.target.id === 'moodFresh') { mood.fresh = e.target.checked; moodRender(); } });
  ov.addEventListener('keydown', (e) => {
    if (e.target.id === 'moodFeel' && e.key === 'Enter') { e.preventDefault(); const f = e.target; moodFeeling(f.value); f.value = ''; moodRender(); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('mood-row')) { e.preventDefault(); e.target.click(); }
  });
  ov.addEventListener('error', (e) => { const im = e.target; if (im && im.classList && im.classList.contains('mood-img')) { const ph = document.createElement('div'); ph.className = 'mood-ph'; ph.textContent = im.dataset.init || '?'; im.replaceWith(ph); } }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mood.open) { e.stopPropagation(); closeMoodPicker(); } }, true);
})();

// ================= Merge duplicates: find releases that are the same, keep the best of each, and fold them into one =================
// Groups come from the same rules as the add-time duplicate check (dupKey/dupCompare), plus releases that share one Rate Your Music page. Nothing is merged for you: you choose which release to keep, settle each field the
// releases disagree on, and confirm twice. The merge itself happens on the server in ONE step that checks the rows are still what you saw, moves playlist items and diary entries across, and only then deletes. A copy of what is removed is kept
// on this device so it can be put back.
const MG_FIELDS = [
  { p: 'artist', c: 'Artist', l: 'Artist' }, { p: 'title', c: 'Title', l: 'Title' }, { p: 'type', c: 'Type', l: 'Type' }, { p: 'releaseDate', c: 'ReleaseDate', l: 'Release date' }, { p: 'recordedDate', c: 'Recorded', l: 'Recorded' },
  { p: 'genre', c: 'Genre', l: 'Genre' }, { p: 'genre2', c: 'SecondaryGenre', l: 'Secondary genre' }, { p: 'region', c: 'Region', l: 'Region' }, { p: 'location', c: 'Location', l: 'Location' }, { p: 'label', c: 'Label', l: 'Label' },
  { p: 'catalog', c: 'Catalog', l: 'Catalogue no.' }, { p: 'descriptor', c: 'Descriptor', l: 'Edition' }, { p: 'rymDescriptors', c: 'RymDescriptors', l: 'RYM descriptors', kind: 'union' }, { p: 'scene', c: 'Scene', l: 'Scene' }, { p: 'movement', c: 'Movement', l: 'Movement' },
  { p: 'link', c: 'Link', l: 'Link' }, { p: 'rymLink', c: 'RymLink', l: 'RYM link' }, { p: 'cover', c: 'Cover', l: 'Cover' }, { p: 'rating', c: 'Rating', l: 'Your rating', kind: 'num' }, { p: 'review', c: 'Review', l: 'Your review', both: true },
  { p: 'rymRating', c: 'RymRating', l: 'RYM rating', kind: 'bundle' }, { p: 'manualTracks', c: 'ManualTracks', l: 'Tracklist', kind: 'tracks' }, { p: 'trackData', c: 'TrackData', l: 'Links on each song', kind: 'trackdata' },
  { p: 'rymUpdated', c: 'RymUpdated', l: 'First RYM update', kind: 'earliest' }, { p: 'rymUpdateLog', c: 'RymUpdateLog', l: 'RYM update log', kind: 'log' }
];
const MG_LOG_KEY = 'crate_merge_log_v1', MG_IGN_KEY = 'crate_merge_ignore_v1';
const mg = { open: false, groups: [], opened: null, keep: {}, choices: {}, armed: null, armTimer: 0, busy: false, msg: '' };
const mgJson = (k) => { try { const a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const mgLogGet = () => mgJson(MG_LOG_KEY), mgLogSet = (a) => { try { localStorage.setItem(MG_LOG_KEY, JSON.stringify(a.slice(-15))); } catch (e) { /* storage full: not kept */ } };
const mgIgnored = () => new Set(mgJson(MG_IGN_KEY)), mgIgnore = (id) => { const a = [...mgIgnored(), id].slice(-300); try { localStorage.setItem(MG_IGN_KEY, JSON.stringify(a)); } catch (e) { /* not kept */ } };
function mgFindGroups() {
  const items = state.raw, parent = items.map((_, i) => i), find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }, join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const byKey = new Map(), byRym = new Map();
  items.forEach((it, i) => { const k = dupKey(it.artist, it.title); if (k) { if (byKey.has(k)) join(byKey.get(k), i); else byKey.set(k, i); } const rp = rymPathOfUrl(it.rymLink); if (rp) { if (byRym.has(rp)) join(byRym.get(rp), i); else byRym.set(rp, i); } });
  const by = new Map(); items.forEach((it, i) => { const r = find(i); if (!by.has(r)) by.set(r, []); by.get(r).push(it); });
  const out = [], ign = mgIgnored();
  by.forEach(list => {
    if (list.length < 2) return; list.sort((a, b) => a.row - b.row); list = list.slice(0, 11);          // (the server takes one release to keep and up to ten to fold in)
    const k0 = dupKey(list[0].artist, list[0].title); let tier;
    if (list.every(x => dupKey(x.artist, x.title) === k0)) { tier = 'exact'; for (let i = 0; i < list.length && tier === 'exact'; i++) for (let j = i + 1; j < list.length; j++) if (dupCompare(list[i], list[j]).level !== 'exact') { tier = 'edition'; break; } } else tier = 'rym';
    const id = list.map(x => x.albumId || 'r' + x.row).sort().join('|'); if (!ign.has(id)) out.push({ id, tier, items: list });
  });
  const rank = { exact: 0, rym: 1, edition: 2 }; out.sort((a, b) => rank[a.tier] - rank[b.tier] || a.items[0].artist.localeCompare(b.items[0].artist) || a.items[0].title.localeCompare(b.items[0].title));
  return out;
}
function mgStats(it) {
  const ids = it.albumId, pl = state.playlists.reduce((n, p) => n + p.items.filter(x => (x.albumId ? x.albumId === ids : String(x.row) === String(it.row))).length, 0);
  return { plays: state.diary.filter(d => d.artist === it.artist && d.title === it.title).length, pl, tracks: (it.manualTracks || []).length, rating: Number(it.rating) || 0 };
}
function mgStatsText(it) { const s = mgStats(it), a = []; if (s.rating) a.push('\u2605' + s.rating); if (s.tracks) a.push(s.tracks + ' tracks'); if (s.pl) a.push(s.pl + ' in playlists'); if (s.plays) a.push(s.plays + ' listen' + (s.plays === 1 ? '' : 's')); return a.join(' \u00b7 ') || 'nothing attached'; }
function mgRichness(it) { const s = mgStats(it); return (s.rating ? 3 : 0) + Math.min(s.plays, 5) * 2 + Math.min(s.pl, 5) * 2 + (s.tracks ? 2 : 0) + (it.cover ? 1 : 0) + (it.rymLink ? 1 : 0) + (it.label ? .5 : 0) + (it.rymRating ? 1 : 0) + ((it.rymUpdateLog || []).length ? 1 : 0); }
function mgDefaultKeep(g) { let best = 0; g.items.forEach((it, i) => { if (mgRichness(it) > mgRichness(g.items[best])) best = i; }); return best; }          // the one with the most attached to it; a tie goes to the oldest row
function mgGet(it, f) {                                          // one release's value for a field, as a plain string ('' = nothing there)
  const v = it[f.p];
  if (f.kind === 'num' || f.kind === 'bundle') { const n = Number(f.kind === 'bundle' ? it.rymRating : v) || 0; return n > 0 ? String(n) : ''; }
  if (f.kind === 'tracks') return (it.manualTracks || []).length ? JSON.stringify(it.manualTracks.map(t => String((t && t.title) || '').toLowerCase())) : '';
  if (f.kind === 'trackdata') return v && Object.keys(v).length ? JSON.stringify(v) : '';
  if (f.kind === 'log') return Array.isArray(v) && v.length ? JSON.stringify(v) : '';
  const t = String(v == null ? '' : v).trim(); if (f.p === 'type' && t === 'Unknown') return ''; if (f.p === 'catalog' && /^CRT-\d+$/i.test(t)) return ''; return t;
}
function mgShow(it, f) {
  const v = mgGet(it, f); if (!v) return '';
  if (f.kind === 'tracks') return `${it.manualTracks.length} tracks`; if (f.kind === 'trackdata') return `${Object.keys(it.trackData).length} songs with links`; if (f.kind === 'log') return `${it.rymUpdateLog.length} updates`;
  if (f.kind === 'bundle') return `${it.rymRating}${Number(it.rymVotes) ? ' (' + Number(it.rymVotes).toLocaleString() + ' ratings)' : ''}`;
  if (f.p === 'cover') { let h = ''; try { h = new URL(v).hostname.replace(/^www\./, ''); } catch (e) { h = v.slice(0, 30); } return h + (rymPictureSize(v) ? ' ' + rymPictureSize(v) : ''); }
  return v.length > 90 ? v.slice(0, 88) + '\u2026' : v;
}
function mgColumnValues(it, f) {                                 // the sheet columns this field is made of, for this release
  if (f.kind === 'bundle') return { RymRating: Number(it.rymRating) || '', RymVotes: Number(it.rymVotes) || '', RymRank: Number(it.rymRank) || '', RymSrc: it.rymRating ? (it.rymSrc || '') : '' };
  if (f.kind === 'num') return { [f.c]: Number(it[f.p]) || 0 };
  if (f.kind === 'tracks') return { [f.c]: (it.manualTracks || []).length ? JSON.stringify(it.manualTracks) : '' };
  if (f.kind === 'trackdata') return { [f.c]: it.trackData && Object.keys(it.trackData).length ? JSON.stringify(it.trackData) : '' };
  if (f.kind === 'log') return { [f.c]: (it.rymUpdateLog || []).length ? rymLogJson(it.rymUpdateLog) : '' };
  return { [f.c]: mgGet(it, f) };
}
function mgColumns(it) { const o = {}; MG_FIELDS.forEach(f => Object.assign(o, mgColumnValues(it, f))); return o; }
function mgPlan(items, keep, ch) {                               // what the merged release will be: row by row, and the columns to write on the one kept
  const K = items[keep], order = [keep].concat(items.map((_, i) => i).filter(i => i !== keep)), rows = [], fields = {}; let conflicts = 0;
  MG_FIELDS.forEach(f => {
    const vals = items.map(it => mgGet(it, f)), filled = order.filter(i => vals[i] !== ''), row = { f, vals, shown: items.map(it => mgShow(it, f)), conflict: false, from: -1, text: '' }; let merged;
    if (f.kind === 'union') { const seen = new Set(), t = []; order.forEach(i => parseDescriptors(items[i].rymDescriptors).forEach(x => { const k = descKey(x); if (!seen.has(k)) { seen.add(k); t.push(k); } })); merged = { [f.c]: t.join(', ') }; row.text = t.join(', '); }
    else if (f.kind === 'trackdata') { const o = {}; order.slice().reverse().forEach(i => { const td = items[i].trackData || {}; Object.keys(td).forEach(k => { o[k] = Object.assign({}, o[k], td[k]); }); }); const n = Object.keys(o).length; merged = { [f.c]: n ? JSON.stringify(o) : '' }; row.text = n ? `${n} songs with links` : ''; }
    else if (f.kind === 'log') { const seen = new Set(), all = []; order.forEach(i => (items[i].rymUpdateLog || []).forEach(e => { const k = e.t + '|' + e.s; if (!seen.has(k)) { seen.add(k); all.push(e); } })); all.sort((a, b) => a.t - b.t); const l = all.slice(-RYM_LOG_MAX); merged = { [f.c]: l.length ? rymLogJson(l) : '' }; row.text = l.length ? `${l.length} updates` : ''; }
    else if (f.kind === 'earliest') { const d = filled.map(i => vals[i]).sort()[0] || ''; merged = { [f.c]: d }; row.text = d ? new Date(d).toLocaleDateString() : ''; }
    else {
      row.conflict = new Set(filled.map(i => vals[i].toLowerCase())).size > 1; let pick = ch[f.p]; if (pick === 'both' && !f.both) pick = undefined;
      if (pick === 'both') { const parts = []; order.forEach(i => { const v = vals[i]; if (v && !parts.some(x => x.toLowerCase() === v.toLowerCase())) parts.push(v); }); merged = { [f.c]: parts.join('\n\n') }; row.from = 'both'; row.text = 'both'; }
      else { const idx = (typeof pick === 'number' && vals[pick] !== '') ? pick : (filled.length ? filled[0] : keep); row.from = idx; merged = mgColumnValues(items[idx], f); row.text = row.shown[idx]; }
    }
    row.merged = merged; const had = mgColumnValues(K, f);
    Object.keys(merged).forEach(col => { const v = merged[col]; if (v === '' || v == null) return; if (String(had[col]) !== String(v)) fields[col] = v; });          // only what CHANGES the kept release, and never an empty value over one that is there
    if (row.conflict) conflicts++; rows.push(row);
  });
  return { rows, fields, conflicts };
}
function mgThumb(it, big) {
  const url = (state.artCache[artKey(it)] && state.artCache[artKey(it)].art) || it.cover || '', init = (String(it.artist || '?').match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
  return url ? `<img class="mg-img${big ? ' big' : ''}" src="${escapeHtml(url)}" ${rymIsRymImage(url) ? 'referrerpolicy="no-referrer" ' : ''}alt="" loading="lazy" data-init="${escapeHtml(init)}">` : `<div class="mg-ph${big ? ' big' : ''}" aria-hidden="true">${escapeHtml(init)}</div>`;
}
function mgCompareHtml(g, keep) {
  const items = g.items, plan = mgPlan(items, keep, mg.choices[g.id] || {}), gid = escapeHtml(g.id), K = items[keep], losers = items.filter((_, i) => i !== keep);
  const heads = items.map((it, i) => `<th class="${i === keep ? 'keep' : ''}">${mgThumb(it, true)}<label class="mg-keep"><input type="radio" name="mgk-${gid}" data-mg-keep="${i}"${i === keep ? ' checked' : ''}> Keep this one</label><small>${escapeHtml(it.title)}${it.descriptor ? ' [' + escapeHtml(it.descriptor) + ']' : ''}</small><small>${escapeHtml(mgStatsText(it))}</small></th>`).join('');
  const crow = plan.rows.filter(r => r.conflict), both = crow.some(r => r.f.both);
  const cell = (r, i) => `<td><label class="mg-cell${r.from === i ? ' on' : ''}${r.vals[i] === '' ? ' blank' : ''}"><input type="radio" name="mgf-${gid}-${r.f.p}" data-mg-pick="${r.f.p}:${i}"${r.from === i ? ' checked' : ''}${r.vals[i] === '' ? ' disabled' : ''}><span>${r.vals[i] === '' ? '\u2014' : escapeHtml(r.shown[i])}</span></label></td>`;
  const body = crow.map(r => `<tr><th scope="row">${escapeHtml(r.f.l)}</th>${items.map((_, i) => cell(r, i)).join('')}${both ? (r.f.both ? `<td><label class="mg-cell${r.from === 'both' ? ' on' : ''}"><input type="radio" name="mgf-${gid}-${r.f.p}" data-mg-pick="${r.f.p}:both"${r.from === 'both' ? ' checked' : ''}><span>keep both</span></label></td>` : '<td></td>') : ''}</tr>`).join('');
  const same = plan.rows.filter(r => !r.conflict && r.text !== '' && r.text != null).map(r => `<li><b>${escapeHtml(r.f.l)}</b> ${escapeHtml(r.text)}${typeof r.from === 'number' && r.from !== keep && r.from >= 0 ? ' <em>(filled in from another)</em>' : ''}</li>`).join('');
  const ids = new Set(losers.map(l => l.albumId).filter(Boolean)), rowsS = new Set(losers.filter(l => !l.albumId).map(l => String(l.row)));
  const moved = state.playlists.reduce((n, p) => n + p.items.filter(x => (x.albumId ? ids.has(x.albumId) : rowsS.has(String(x.row)))).length, 0);
  const fa = plan.fields.Artist !== undefined ? plan.fields.Artist : K.artist, ft = plan.fields.Title !== undefined ? plan.fields.Title : K.title;
  const follows = losers.reduce((n, l) => n + ((l.artist !== fa || l.title !== ft) ? state.diary.filter(d => d.artist === l.artist && d.title === l.title).length : 0), 0);
  const armed = mg.armed === g.id;
  return `<div class="mg-compare"><table class="mg-table"><thead><tr><th></th>${heads}${both ? '<th></th>' : ''}</tr></thead><tbody>${body || `<tr><td class="mg-none" colspan="${items.length + 1 + (both ? 1 : 0)}">These releases don\u2019t disagree on anything: the merge only fills gaps.</td></tr>`}</tbody></table>
    ${crow.length ? `<p class="mg-hint">${crow.length} field${crow.length === 1 ? '' : 's'} where they differ: pick the one you want (it starts on the release you keep).</p>` : ''}
    <details class="mg-same"><summary>${plan.rows.filter(r => !r.conflict && r.text).length} other fields (nothing to decide)</summary><ul>${same}</ul></details>
    <div class="mg-foot"><span>Keeps \u201c${escapeHtml(K.title)}\u201d and removes ${losers.length} other release${losers.length === 1 ? '' : 's'}${moved ? ` \u00b7 ${moved} playlist item${moved === 1 ? '' : 's'} move${moved === 1 ? 's' : ''} across` : ''}${follows ? ` \u00b7 ${follows} diary entr${follows === 1 ? 'y' : 'ies'} follow${follows === 1 ? 's' : ''}` : ''}</span>
    <button type="button" class="mg-btn ${armed ? 'danger' : 'primary'}" data-mg="merge" data-g="${gid}"${mg.busy ? ' disabled' : ''}>${armed ? 'Really merge? Press again' : `Merge ${items.length} into one`}</button></div></div>`;
}
function mgRender() {
  const body = document.getElementById('mgBody'), sub = document.getElementById('mgSub'); if (!body) return; const keepTop = body.scrollTop;
  sub.textContent = mg.groups.length ? `${mg.groups.length} group${mg.groups.length === 1 ? '' : 's'} of likely duplicates` : 'No duplicates found';
  const TIER = { exact: ['Same album', 'exact'], rym: ['Same Rate Your Music page', 'rym'], edition: ['Different editions?', 'edition'] };
  let h = mg.msg ? `<p class="mg-msg" role="status">${escapeHtml(mg.msg)}</p>` : '';
  if (!mg.groups.length) h += '<div class="mg-empty"><b>No duplicates found.</b><p>Releases count as the same when the artist and title match (ignoring case, accents, \u201cThe\u201d, \u201c&\u201d and bracketed edition notes), or when they share one Rate Your Music page. Ones you marked \u201cnot duplicates\u201d are left out.</p></div>';
  mg.groups.forEach(g => {
    const open = mg.opened === g.id, keep = mg.keep[g.id] != null ? mg.keep[g.id] : mgDefaultKeep(g), t = TIER[g.tier], K = g.items[keep];
    h += `<div class="mg-card${open ? ' open' : ''}"><div class="mg-card-head" data-mg-head="${escapeHtml(g.id)}" role="button" tabindex="0" aria-expanded="${open}"><span class="mg-tier ${t[1]}">${t[0]}</span><span class="mg-covers">${g.items.slice(0, 4).map(it => mgThumb(it)).join('')}</span><span class="mg-name"><b>${escapeHtml(K.title)}</b><i>${escapeHtml(K.artist)} \u00b7 ${g.items.length} releases</i></span><button type="button" class="mg-btn" data-mg="notdup" data-g="${escapeHtml(g.id)}">Not duplicates</button></div>${open ? mgCompareHtml(g, keep) : ''}</div>`;
  });
  const log = mgLogGet().slice().reverse();
  if (log.length) h += `<div class="mg-log"><div class="mg-log-title">Recently merged</div>${log.map(e => `<div class="mg-log-row"><span>${escapeHtml(new Date(e.t).toLocaleDateString())} \u00b7 kept \u201c${escapeHtml(e.keeper.title)}\u201d by ${escapeHtml(e.keeper.artist)}; removed ${e.removed.length}</span>${e.restored ? '<em>put back</em>' : `<button type="button" class="mg-btn" data-mg="restore" data-t="${e.t}"${mg.busy ? ' disabled' : ''}>Put back what was removed</button>`}</div>`).join('')}<p class="mg-hint">Putting back re-adds the removed releases as new ones. Their places in playlists and their diary entries are not restored.</p></div>`;
  body.innerHTML = h; body.scrollTop = keepTop;
}
function openMergeDialog() { mg.open = true; mg.msg = ''; mg.opened = null; mg.groups = mgFindGroups(); document.getElementById('mergeOverlay').hidden = false; mgRender(); }
function closeMergeDialog() { if (mg.busy) return; mg.open = false; mg.armed = null; clearTimeout(mg.armTimer); const ov = document.getElementById('mergeOverlay'); if (ov) ov.hidden = true; }
async function mgMerge(g) {
  const keep = mg.keep[g.id] != null ? mg.keep[g.id] : mgDefaultKeep(g), plan = mgPlan(g.items, keep, mg.choices[g.id] || {}), K = g.items[keep], losers = g.items.filter((_, i) => i !== keep);
  const ref = (it) => ({ row: it.row, id: it.albumId || '', artist: it.artist, title: it.title }), stamp = Date.now();
  mg.busy = true; mg.armed = null; mg.msg = 'Merging\u2026'; mgRender();
  const log = mgLogGet(); log.push({ t: stamp, keeper: { artist: K.artist, title: K.title }, removed: losers.map(mgColumns), restored: false }); mgLogSet(log);          // kept BEFORE anything is deleted, so it exists even if the answer never arrives
  const dropEntry = () => mgLogSet(mgLogGet().filter(e => e.t !== stamp));
  try {
    const r = await postUpdate({ action: 'mergeAlbums', keeper: ref(K), losers: losers.map(ref), fields: plan.fields });
    if (!r || typeof r.merged !== 'number') { dropEntry(); mg.msg = 'Nothing was changed: the backend script doesn\u2019t know how to merge yet. Paste the newest apps-script-backend.gs into your Apps Script and deploy it again.'; }
    else {
      mg.msg = `Merged ${g.items.length} into \u201c${K.title}\u201d${r.repointed ? ` \u00b7 ${r.repointed} playlist item${r.repointed === 1 ? '' : 's'} moved` : ''}${r.removedItems ? ` \u00b7 ${r.removedItems} duplicate playlist place${r.removedItems === 1 ? '' : 's'} dropped` : ''}${r.diaryFixed ? ` \u00b7 ${r.diaryFixed} diary entr${r.diaryFixed === 1 ? 'y' : 'ies'} moved` : ''}.`;
      mg.opened = null; delete mg.keep[g.id]; delete mg.choices[g.id]; await fetchCatalog({ quiet: true }); mg.groups = mgFindGroups();
    }
  } catch (err) {
    const m = String((err && err.message) || err);
    if (/stale/i.test(m)) { dropEntry(); mg.msg = 'Nothing was changed: your crate is no longer what this list was made from (changed in another tab or on another device). Close this and open it again.'; }
    else if (/nothing to merge/i.test(m)) { dropEntry(); mg.msg = 'Nothing was changed: there was nothing to merge.'; }
    else { mg.msg = 'Couldn\u2019t confirm whether the merge happened (' + m.slice(0, 80) + '). Check your crate before trying again; if the removed releases are gone, \u201cPut back what was removed\u201d below has them.'; }
  }
  mg.busy = false; mgRender();
}
async function mgRestore(t) {
  const log = mgLogGet(), e = log.find(x => x.t === t); if (!e || e.restored || mg.busy) return; mg.busy = true; mg.msg = 'Putting them back\u2026'; mgRender();
  try { for (const cols of e.removed) await postUpdate(Object.assign({ action: 'addAlbum' }, cols)); e.restored = true; mgLogSet(log); await fetchCatalog({ quiet: true }); mg.groups = mgFindGroups(); mg.msg = `Put back ${e.removed.length} release${e.removed.length === 1 ? '' : 's'}. Playlist places and diary entries were not restored.`; }
  catch (err) { mg.msg = 'Couldn\u2019t put them back: ' + String((err && err.message) || err).slice(0, 100); }
  mg.busy = false; mgRender();
}
(function wireMerge() {
  const ov = document.getElementById('mergeOverlay'); if (!ov) return;
  const gOf = (id) => mg.groups.find(x => x.id === id);
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('#mgClose')) { closeMergeDialog(); return; }
    const act = e.target.closest('[data-mg]');
    if (act) {
      const k = act.dataset.mg, g = gOf(act.dataset.g);
      if (k === 'notdup' && g) { mgIgnore(g.id); mg.groups = mg.groups.filter(x => x.id !== g.id); if (mg.opened === g.id) mg.opened = null; mg.msg = ''; mgRender(); }
      else if (k === 'merge' && g && !mg.busy) { if (mg.armed === g.id) { clearTimeout(mg.armTimer); mgMerge(g); } else { mg.armed = g.id; clearTimeout(mg.armTimer); mg.armTimer = setTimeout(() => { mg.armed = null; mgRender(); }, 5000); mgRender(); } }
      else if (k === 'restore') mgRestore(Number(act.dataset.t));
      return;
    }
    const head = e.target.closest('[data-mg-head]'); if (head) { const id = head.dataset.mgHead; mg.opened = mg.opened === id ? null : id; mg.armed = null; mgRender(); }
  });
  ov.addEventListener('change', (e) => {
    const card = e.target.closest('.mg-card'); if (!card) return; const id = card.querySelector('[data-mg-head]').dataset.mgHead; mg.armed = null;
    if (e.target.dataset.mgKeep != null) { mg.keep[id] = Number(e.target.dataset.mgKeep); delete mg.choices[id]; mgRender(); }
    else if (e.target.dataset.mgPick) { const [p, v] = e.target.dataset.mgPick.split(':'); (mg.choices[id] = mg.choices[id] || {})[p] = v === 'both' ? 'both' : Number(v); mgRender(); }
  });
  ov.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-mg-head]')) { e.preventDefault(); e.target.click(); } });
  ov.addEventListener('error', (e) => { const im = e.target; if (im && im.classList && im.classList.contains('mg-img')) { const ph = document.createElement('div'); ph.className = im.className.replace('mg-img', 'mg-ph'); ph.textContent = im.dataset.init || '?'; im.replaceWith(ph); } }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mg.open) { e.stopPropagation(); closeMergeDialog(); } }, true);
})();

// BEGIN label-browse
// The left browser's "Labels" mode: one entry per record label, counted. A release can name more than one label ("Sire / Warner Bros."): it is counted under each. Spelling, capitals,
// accents and punctuation don't make a second label ("Café Records", "Cafe records"); the commonest spelling is shown. Releases with no label are together under "(No label)".
const LABEL_NONE = '~none';
function labelKey(v) { return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function labelParts(v) {                                            // "Sub Pop / Rough Trade" -> ["Sub Pop", "Rough Trade"] (only ' / ' and ';' separate: a comma or an ampersand can be part of a name)
  const seen = new Set(), out = [];
  String(v == null ? '' : v).split(/\s+\/\s+|\s*;\s*/).forEach(t => { const name = t.trim().replace(/\s+/g, ' '), k = labelKey(name); if (k && !seen.has(k)) { seen.add(k); out.push(name); } });
  return out;
}
function labelKeysOf(r) { const k = labelParts(r && r.label).map(labelKey); return k.length ? k : [LABEL_NONE]; }
function labelEntries(items) {                                      // [{ key, label, count, sample }]
  const map = new Map(), caps = (t) => (t.match(/\p{Lu}/gu) || []).length;          // (a tie between spellings goes to the one with more capitals: "Parlophone", not "parlophone")
  items.forEach(r => {
    const parts = labelParts(r.label), list = parts.length ? parts : [null];
    list.forEach(name => {
      const k = name === null ? LABEL_NONE : labelKey(name); let e = map.get(k);
      if (!e) { e = { key: k, spell: new Map(), count: 0, sample: r }; map.set(k, e); }
      e.count++; if (name !== null) e.spell.set(name, (e.spell.get(name) || 0) + 1);
    });
  });
  return [...map.values()].map(e => ({ key: e.key, label: e.key === LABEL_NONE ? '(No label)' : [...e.spell.entries()].sort((a, b) => b[1] - a[1] || caps(b[0]) - caps(a[0]) || a[0].localeCompare(b[0]))[0][0], count: e.count, sample: e.sample }));
}
// END label-browse
function labelDisplayOf(key) { if (key === LABEL_NONE) return 'No label'; for (const r of state.raw) { const n = labelParts(r.label).find(x => labelKey(x) === key); if (n) return n; } return key; }

function buildLeftList() {
  const mode = state.leftMode;
  // Apply the chosen thumbnail size CSS class
  el.leftList.className = 'left-list thumb-' + state.leftThumbSize;
  el.leftList.innerHTML = '';
  
  // Narrow the source list to whatever matches the search box first, so
  // every left-panel mode (albums/artists/genres/years) only surfaces
  // entries that actually belong to the current search results. Playlists
  // aren't narrowed by search — they're your own named lists, not derived
  // from the catalog the search box filters.
  const sourceRaw = searchFilteredRaw();
  if (state.leftNavView === 'playlists' && !sourceRaw.length) {
    el.leftList.innerHTML = `<p class="left-empty">${activePlaylist() ? 'Nothing in this playlist matches the search.' : 'Open a playlist to browse what is in it.'}</p>`;
    return;
  }

  let entries;

if (mode === 'artist') {
    entries = groupCountWithSample(sourceRaw, r => artistCanon(r.artist));          // an alias's releases under its artist (see artistCanon)
  } else if (mode === 'year') {
    entries = groupCountWithSample(sourceRaw, r => {
      const y = dateVal(r.releaseDate) !== -Infinity ? new Date(r.releaseDate).getUTCFullYear() : null;
      return y ? String(y) : 'Unknown';
    });
  } else if (mode === 'label') {
    entries = labelEntries(sourceRaw).map(e => ({ key: e.key, label: e.label, sub: '', count: e.count, sampleKey: artKey(e.sample) }));          // every label among the releases shown here, counted
  } else if (mode === 'descriptor') {
    entries = [...descLibrary(sourceRaw).values()].map(e => ({ key: e.key, label: e.label, count: e.count, cat: descCatOf(e.key) }));          // every descriptor in the releases shown here, counted
  } else if (mode === 'genre') {
    // Hierarchical, aggregated-count tree (see buildGenreTree/Genre
    // Taxonomy above) rather than a flat per-genre count — entries come
    // back already sorted/indented by depth, so the generic sort below is
    // skipped for this mode (sorting by count wouldn't respect the
    // hierarchy, and it's already alphabetized within each level).
    entries = buildGenreTree(sourceRaw, state.genreTaxonomy);
    // "Has children" purely from the DFS pre-order structure buildGenreTree
    // already returns — a shared, generic function (Release Statistics
    // uses it too) with no notion of collapse state, so this stays
    // entirely in the left-panel rendering path instead. A row has
    // children exactly when the NEXT row in the list is one level deeper.
    entries.forEach((row, i) => { row.hasChildren = !!(entries[i + 1] && entries[i + 1].depth > row.depth); });
    entries = filterCollapsedGenreRows(entries);
  } else {
    entries = sourceRaw
      .map(r => ({ key: r.row, artKey: artKey(r), label: r.title, sub: r.artist, count: null, item: r }));
  }

  // --- APPLY SORTING HERE ---
  if (mode === 'genre') {
    // already ordered by buildGenreTree — leave as-is
  } else if (state.leftSort === 'count') {
    // ... rest of your sorting code
    entries.sort((a, b) => {
      const countA = a.count || 0;
      const countB = b.count || 0;
      if (countB !== countA) return countB - countA;
      return a.label.localeCompare(b.label); // fallback to alphabetical
    });
  } else {
    entries.sort((a, b) => a.label.localeCompare(b.label));
  }
  // --------------------------

  // "All ___" dummy entry pinned to the top — clears state.navFilter so the
  // main panel shows everything instead of one artist/genre/album. Same
  // effect as clicking the currently-active row again, just discoverable
  // without already having a filter on. Also exits playlist view (see
  // exitPlaylistView) since this is the regular Albums/Artists/Genres list.
  const allRow = document.createElement('div');
  allRow.className = 'left-row left-row-all';
  allRow.tabIndex = 0;
  if (!state.navFilter && (!state.activePlaylistId || state.leftNavView === 'playlists')) allRow.classList.add('active');
  const allLabel = mode === 'artist' ? 'All Artists' : mode === 'genre' ? 'All Genres' : mode === 'descriptor' ? 'All Descriptors' : mode === 'label' ? 'All Labels' : 'All Albums';
  allRow.innerHTML = `
    <div class="left-row-text"><p class="left-row-title">${allLabel}</p></div>
    <span class="left-row-count">${sourceRaw.length}</span>`;
  allRow.addEventListener('click', () => {
    state.navFilter = null;
    if (state.leftNavView !== 'playlists') exitPlaylistView();
    buildLeftList();
    updateMainLabel();
    applyFiltersSort();
  });
  // Double-click plays everything currently included. The two clicks that
  // make up a double-click already ran the handler above (navFilter
  // cleared, state.filtered recomputed) before this fires, so state.filtered
  // is exactly what the main view is showing: search terms (year:1980,
  // genre:punk, ...), the Listened filter, and the chosen sort order — not
  // just the raw search results the row's own count reflects. Same row for
  // Albums/Artists/Genres modes, so it behaves the same in all three.
  allRow.addEventListener('dblclick', playFilteredReleases);
  el.leftList.appendChild(allRow);

  // "Group by" (state.leftGroupBy) clusters the Albums list under
  // collapsible-looking section headers — Artist/Genre/Year/Decade/Type —
  // same categories and the same groupKeysFor() a release belongs under as
  // the main grid's own "Group by" (see groupItems). Only meaningful for
  // mode === 'album': the Artists/Genres/Years modes already show one row
  // per category, so there's nothing further to cluster there (see the
  // menu's own visibility toggle in updateLeftMenuUI). Buckets the
  // already-sorted `entries` array by key rather than re-deriving from
  // sourceRaw, so rows within each group keep the chosen Name/Count sort.
  if (mode === 'album' && state.leftGroupBy && state.leftGroupBy !== 'none') {
    const groupMap = new Map();
    entries.forEach(entry => {
      const keys = groupKeysFor(entry.item, state.leftGroupBy);
      (keys.length ? keys : ['Unknown']).forEach(k => {
        const gk = k || 'Unknown';
        if (!groupMap.has(gk)) groupMap.set(gk, []);
        groupMap.get(gk).push(entry);
      });
    });
    let groupKeysSorted = Array.from(groupMap.keys());
    const numeric = state.leftGroupBy === 'year' || state.leftGroupBy === 'decade';
    groupKeysSorted.sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return numeric ? b.localeCompare(a) : a.localeCompare(b);
    });
    groupKeysSorted.forEach(gk => {
      const groupEntries = groupMap.get(gk);
      const header = document.createElement('div');
      header.className = 'left-group-header';
      header.textContent = `${gk} · ${groupEntries.length}`;
      el.leftList.appendChild(header);
      groupEntries.forEach(entry => el.leftList.appendChild(buildLeftRow(entry, mode)));
    });
  } else if (mode === 'descriptor') {                            // grouped by what they describe, each group can be folded away
    const byCat = new Map(); entries.forEach(e => { if (!byCat.has(e.cat)) byCat.set(e.cat, []); byCat.get(e.cat).push(e); });
    if (!entries.length) el.leftList.insertAdjacentHTML('beforeend', '<p class="left-empty">No descriptors yet. Add them to a release (RYM descriptors in its details), or update it from Rate Your Music.</p>');
    DESC_CATS.map(c => c.id).concat('other').forEach(cid => {
      const list = byCat.get(cid); if (!list) return; const folded = state.descCollapsed.has(cid), header = document.createElement('div');
      header.className = 'left-group-header desc-cat-head'; header.tabIndex = 0; header.dataset.cat = cid; header.setAttribute('role', 'button'); header.setAttribute('aria-expanded', String(!folded));
      header.textContent = `${folded ? '\u25b8' : '\u25be'} ${descCatLabel(cid)} \u00b7 ${list.length}`;
      const flip = () => { if (state.descCollapsed.has(cid)) state.descCollapsed.delete(cid); else state.descCollapsed.add(cid); buildLeftList(); };
      header.addEventListener('click', flip); header.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
      el.leftList.appendChild(header);
      if (folded) return;
      if (cid === 'other') { list.forEach(entry => el.leftList.appendChild(buildLeftRow(entry, mode))); return; }
      DESC_CONCEPTS.filter(c => c.cat === cid).forEach(con => {          // by shared sense, as a thesaurus would: "sadness", "anger", "joy"...
        const rowsOf = list.filter(e => descConceptOf(e.key) === con); if (!rowsOf.length) return;
        const sub = document.createElement('div'); sub.className = 'desc-concept-head'; sub.textContent = con.head; el.leftList.appendChild(sub);
        rowsOf.forEach(entry => el.leftList.appendChild(buildLeftRow(entry, mode)));
      });
    });
  } else {
    entries.forEach(entry => el.leftList.appendChild(buildLeftRow(entry, mode)));
  }

  applyCachedArt();
  if (mode === 'artist') loadArtistDiscogBadges(entries.map(e => e.label));
  if (mode === 'year') loadYearCoverageBadges(entries.map(e => e.label).filter(y => y !== 'Unknown'));
}

function groupCount(items, keyFn) {
  const map = new Map();
  items.forEach(item => {
    const k = keyFn(item);
    map.set(k, (map.get(k) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, label: key, sub: '', count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function groupCountWithSample(items, keyFn) {
  const map = new Map();
  items.forEach(item => {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, { count: 0, sample: item });
    map.get(k).count++;
  });
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, label: key, sub: '', count: v.count, sampleKey: artKey(v.sample) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// --- Shared MusicBrainz request gate ---
// Every MusicBrainz call in the app (left-panel artist/year badges, the
// Artist tab's discography, and the Add-album pressing lookups) used to
// pace itself independently with its own setTimeout(1100ms) between its
// own requests. That's fine in isolation, but these run concurrently —
// e.g. the left panel's artist badges keep fetching in the background
// while you're looking at the Artist tab — so two independently-paced
// streams could still collide and blow past MusicBrainz's actual ~1 req/
// sec limit, causing a 429 that only showed up as "click Retry a few
// times until one attempt doesn't collide with the other stream."
//
// Routing every call through mbFetch() instead of a bare fetch() fixes
// that at the source: ALL MusicBrainz requests, from every feature, share
// one queue and one clock, so they can never overlap. It also retries a
// 429 automatically (honoring Retry-After when MusicBrainz sends one, or
// backing off if not) instead of surfacing it to the user as a dead end —
// so a rate-limit hit resolves itself instead of needing manual retries.
let mbQueueTail = Promise.resolve();
let mbLastRequestAt = 0;
const MB_MIN_INTERVAL_MS = 1100;
const MB_MAX_RETRIES = 3;

// Wraps fetch() with a hard timeout via AbortController. Plain fetch() has
// no default timeout — if a request just never gets a response (dead
// connection, server hang, etc.) the returned promise sits pending
// forever. That's fatal here specifically because mbFetch chains every
// MusicBrainz request onto one shared queue (mbQueueTail): a single
// never-settling request doesn't just fail its own caller, it permanently
// jams every other MusicBrainz lookup queued behind it, from any feature,
// for the rest of the session. Same risk applies to the iTunes fetches in
// getTracksFor, which feed loadFlatTrackTable()'s "wait for every item to
// settle" loop — one hung fetch there freezes the whole Tracks table on
// "Loading tracks…" forever, even though every other album loaded fine.
// Rejecting after a timeout turns a silent hang into an ordinary caught
// error, which all the existing try/catch blocks around these calls
// already handle.
function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const mergedOpts = Object.assign({}, opts, { signal: controller.signal });
  return fetch(url, mergedOpts).finally(() => clearTimeout(timer));
}

// Escapes MusicBrainz/Lucene's reserved query-syntax characters so a bare,
// unquoted search term is treated as literal text instead of query syntax.
// Without this, ordinary punctuation in real artist/album names — hyphens
// (Jay-Z), colons, parentheses ("(Deluxe Edition)"), ampersands (Florence +
// the Machine), slashes (AC/DC), exclamation marks (Panic! At The Disco) —
// gets parsed as Lucene operators (grouping, boosting, exclusion, etc.),
// which at best mangles the results and at worst is malformed enough that
// MusicBrainz rejects the whole query with an HTTP 400 — which doAddSearch()
// below wasn't even checking for, so `await res.json()` on that error
// response threw a JSON-parse error straight into the catch block. The
// visible symptom was a search that "fails straight away" for almost any
// real-world artist/album name, since most of them contain at least one of
// these characters somewhere.
function escapeLuceneTerm(str) {
  return String(str).replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&');
}

function mbFetch(url, opts, attempt = 0) {
  const run = async () => {
    const wait = Math.max(0, mbLastRequestAt + MB_MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    mbLastRequestAt = Date.now();
    return fetchWithTimeout(url, opts);
  };
  // Chain onto the shared queue so this request waits for whatever else is
  // already pending, regardless of which feature queued it. The .catch on
  // the tail keeps one failed request from permanently jamming the queue.
  const queued = mbQueueTail.then(run, run);
  mbQueueTail = queued.catch(() => {});

  return queued.then(async (res) => {
    if (res.status === 429 && attempt < MB_MAX_RETRIES) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : MB_MIN_INTERVAL_MS * Math.pow(2, attempt + 1); // back off a bit more each retry
      await new Promise(r => setTimeout(r, retryAfterMs));
      return mbFetch(url, opts, attempt + 1);
    }
    return res;
  });
}
