// CRATE — Export to Obsidian.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// BEGIN obsidian-export
// "Export to Obsidian": the crate as a folder of Markdown notes (releases, artists, genres, labels) that link to each other with Obsidian [[links]], so the graph, backlinks and property views work.
// The RELATIONSHIPS are properties, typed by their name: a release has artist, genres, secondary_genres and labels; a genre has parent (from your genre taxonomy); an artist has genres. Plain facts (year,
// ratings, descriptors, links) are properties too. Every note name is unique across the whole export, so a link never points at the wrong note (an artist called "Pop" and the genre "Pop" become
// "Pop" and "Pop (genre)"). One-way: nothing here reads a vault, and running it again makes the same notes afresh.
const obsKey = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
const obsText = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u2028\u2029]/g, ' ');
const obsOne = (s) => obsText(s).replace(/\s+/g, ' ').trim();
const obsYq = (s) => JSON.stringify(obsText(s));                                      // a YAML double-quoted string (a JSON string is one)
function obsFileName(s, max) {                                                          // a name that is safe as a file and as the target of a [[link]]
  let t = obsText(s).replace(/[\/\\]/g, '-').replace(/:/g, ' -').replace(/[*?"<>|#^\[\]]/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[.\s]+/, '').slice(0, max || 110).replace(/[.\s]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t)) t += ' _';
  return t || 'Untitled';
}
function obsNamer() {                                                                   // every name once, whatever its kind, case aside
  const byId = new Map(), taken = new Set();
  const name = (kind, key, base) => {
    const id = kind + '|' + key; if (byId.has(id)) return byId.get(id);
    const plain = obsFileName(base, 100); let n = plain;
    if (taken.has(n.toLowerCase())) n = kind === 'release' ? plain + ' (2)' : plain + ' (' + kind + ')';
    for (let i = kind === 'release' ? 3 : 2; taken.has(n.toLowerCase()); i++) n = kind === 'release' ? plain + ' (' + i + ')' : plain + ' (' + kind + ' ' + i + ')';
    taken.add(n.toLowerCase()); byId.set(id, n); return n;
  };
  name.reserve = (n) => taken.add(String(n).toLowerCase());
  return name;
}
const obsLink = (name, shown) => { const d = shown == null ? '' : obsOne(shown).replace(/[\[\]|]/g, ''); return d && d !== name ? `[[${name}|${d}]]` : `[[${name}]]`; };
const obsStars = (v) => { const n = Number(v) || 0; return n > 0 ? '\u2605'.repeat(Math.floor(n)) + (n % 1 ? '\u00bd' : '') : ''; };
const obsCell = (s) => obsText(s).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const obsList = (s) => { const seen = new Set(), out = []; String(s == null ? '' : s).split(/[,;]/).forEach(t => { const v = obsOne(t), k = obsKey(v); if (v && !seen.has(k)) { seen.add(k); out.push(v); } }); return out; };
const obsHttp = (u) => /^https?:\/\/\S+$/i.test(String(u == null ? '' : u).trim()) ? String(u).trim() : '';
const obsYearOf = (d) => (String(d == null ? '' : d).match(/^(\d{4})/) || ['', ''])[1];
function obsProps(pairs) {                                                              // [[key, value]] -> a YAML block; blank values and empty lists are left out
  const lines = ['---'];
  pairs.forEach(([k, v]) => {
    if (Array.isArray(v)) { if (v.length) { lines.push(k + ':'); v.forEach(x => lines.push('  - ' + x)); } }
    else if (v !== '' && v != null && v !== false) lines.push(k + ': ' + v);
  });
  lines.push('---'); return lines.join('\n') + '\n';
}
function obsBuild(input) {                                                              // { releases: [{ artist, title, ..., tracks: [] }], taxonomy, options: { tracks, reviews }, now } -> { files: [{ path, text }], counts }
  const opts = Object.assign({ tracks: true, reviews: true }, input && input.options || {}), tax = (input && input.taxonomy) || {}, when = new Date(input && input.now || Date.now()), day = when.toISOString().slice(0, 10);
  const releases = [], skipped = []; (input && input.releases || []).forEach(r => { const artist = obsOne(r.artist), title = obsOne(r.title); if (artist && title) releases.push({ r, artist, title }); else skipped.push(r); });
  const name = obsNamer(); name.reserve('CRATE');
  // ---- genres: the taxonomy first (its parents and descriptions), then any a release uses that the taxonomy does not know ----
  const G = new Map(), ensureG = (label) => { const k = obsKey(label); if (!k) return null; let g = G.get(k); if (!g) { g = { key: k, label: obsOne(label), parents: [], description: '', rymText: '', rymUrl: '', spell: new Map(), rels: [], children: [] }; G.set(k, g); } return g; };
  Object.keys(tax).forEach(k => { const e = tax[k] || {}, g = ensureG(e.label || k); if (!g) return; g.label = obsOne(e.label || k); g.description = String(e.description || '').trim(); if (e.rym && e.rym.text) { g.rymText = String(e.rym.text).trim(); g.rymUrl = obsHttp(e.rym.url); } (Array.isArray(e.parents) ? e.parents : []).forEach(p => { const pg = ensureG(p); if (pg && pg !== g && !g.parents.includes(pg.key)) g.parents.push(pg.key); }); });
  const caps = (t) => (t.match(/[A-Z]/g) || []).length, A = new Map(), L = new Map();
  releases.forEach(x => {
    const r = x.r; x.year = obsYearOf(r.releaseDate); x.date = /^\d{4}-\d{2}-\d{2}$/.test(String(r.releaseDate || '').trim()) ? String(r.releaseDate).trim() : '';
    x.genres = obsList(r.genre).map(n => { const g = ensureG(n); g.spell.set(n, (g.spell.get(n) || 0) + 1); return g.key; });
    x.secondary = obsList(r.genre2).map(n => { const g = ensureG(n); g.spell.set(n, (g.spell.get(n) || 0) + 1); return g.key; }).filter(k => !x.genres.includes(k));
    const ak = obsKey(x.artist); let a = A.get(ak); if (!a) { a = { key: ak, name: x.artist, rels: [], genres: new Map() }; A.set(ak, a); } a.rels.push(x); x.a = a;
    x.labels = labelParts(r.label).map(n => { const k = labelKey(n); let l = L.get(k); if (!l) { l = { key: k, spell: new Map(), rels: [] }; L.set(k, l); } l.spell.set(n, (l.spell.get(n) || 0) + 1); l.rels.push(x); return l; });
  });
  G.forEach(g => { if (g.spell.size && !tax[g.key] && !Object.values(tax).some(e => obsKey(e && e.label) === g.key)) g.label = [...g.spell.entries()].sort((p, q) => q[1] - p[1] || caps(q[0]) - caps(p[0]) || p[0].localeCompare(q[0]))[0][0]; });
  L.forEach(l => { l.label = [...l.spell.entries()].sort((p, q) => q[1] - p[1] || caps(q[0]) - caps(p[0]) || p[0].localeCompare(q[0]))[0][0]; });
  // ---- names (genres first, then labels, artists, releases: when two things want a name the earlier keeps it) ----
  const bySort = (arr, f) => arr.slice().sort((p, q) => f(p).localeCompare(f(q)) || (f(p) < f(q) ? -1 : f(p) > f(q) ? 1 : 0));
  bySort([...G.values()], g => g.label).forEach(g => { g.name = name('genre', g.key, g.label); });
  bySort([...L.values()], l => l.label).forEach(l => { l.name = name('label', l.key, l.label); });
  bySort([...A.values()], a => a.name).forEach(a => { a.file = name('artist', a.key, a.name); });
  bySort(releases, x => x.artist + ' - ' + x.title + ' ' + x.year).forEach((x, i) => { x.file = name('release', x.artist.toLowerCase() + '|' + x.title.toLowerCase() + '|' + x.year + '|' + i, x.artist + ' - ' + x.title + (x.year ? ' (' + x.year + ')' : '')); });
  const gLink = (k) => { const g = G.get(k); return obsLink(g.name, g.label); }, relLine = (x) => '- ' + obsLink(x.file, x.title) + (x.year ? ' (' + x.year + ')' : ''), byYear = (a, b) => (a.year || '9999').localeCompare(b.year || '9999') || a.title.localeCompare(b.title);
  G.forEach(g => g.parents.forEach(pk => { const p = G.get(pk); if (p && !p.children.includes(g.key)) p.children.push(g.key); }));
  releases.forEach(x => { new Set(x.genres.concat(x.secondary)).forEach(k => G.get(k).rels.push(x)); x.genres.forEach(k => x.a.genres.set(k, (x.a.genres.get(k) || 0) + 1)); });
  const files = [];
  // ---- releases ----
  releases.forEach(x => {
    const r = x.r, rating = Number(r.rating) > 0 ? Number(r.rating) : '', rymR = Number(r.rymRating) > 0 ? Number(r.rymRating) : '', votes = Number(r.rymVotes) > 0 ? Math.round(Number(r.rymVotes)) : '', added = (String(r.dateAdded || '').match(/^\d{4}-\d{2}-\d{2}/) || [''])[0], desc = obsList(r.rymDescriptors);
    const head = obsProps([['type', 'release'], ['artist', obsYq(obsLink(x.a.file, x.a.name))], ['title', obsYq(x.title)], ['year', x.year ? Number(x.year) : ''], ['released', x.date], ['format', r.type ? obsYq(obsOne(r.type)) : ''],
      ['genres', x.genres.map(k => obsYq(gLink(k)))], ['secondary_genres', x.secondary.map(k => obsYq(gLink(k)))], ['labels', x.labels.map(l => obsYq(obsLink(l.name, l.label)))], ['catalog', obsOne(r.catalog) && !/^CRT-\d+$/i.test(obsOne(r.catalog)) ? obsYq(obsOne(r.catalog)) : '']          /* (an automatic CRT-007 number says nothing, so it is left out) */,
      ['rating', rating], ['rym_rating', rymR], ['rym_ratings', votes], ['rym_rank', Number(r.rymRank) > 0 ? Math.round(Number(r.rymRank)) : ''], ['descriptors', desc.map(obsYq)],
      ['region', obsOne(r.region) ? obsYq(obsOne(r.region)) : ''], ['location', obsOne(r.location) ? obsYq(obsOne(r.location)) : ''], ['recorded', obsOne(r.recordedDate) ? obsYq(obsOne(r.recordedDate)) : ''],
      ['rym', obsHttp(r.rymLink) ? obsYq(obsHttp(r.rymLink)) : ''], ['link', obsHttp(r.link) ? obsYq(obsHttp(r.link)) : ''], ['cover', obsHttp(r.cover) ? obsYq(obsHttp(r.cover)) : ''], ['added', added], ['tags', ['crate/release']]]);
    let body = `\n# ${x.title}\n\n${obsLink(x.a.file, x.a.name)}${x.year ? ' \u00b7 ' + x.year : ''}${r.type ? ' \u00b7 ' + obsOne(r.type) : ''}\n`;
    if (obsHttp(r.cover)) body += `\n![cover](${obsHttp(r.cover)})\n`;
    if (opts.reviews && String(r.review || '').trim()) body += `\n## My review\n\n${String(r.review).trim()}\n`;
    const tr = opts.tracks && Array.isArray(r.tracks) ? r.tracks.filter(t => t && obsOne(t.title)) : [];
    if (tr.length) {
      const side = tr.some(t => obsOne(t.side)), note = tr.some(t => obsOne(t.note)), cols = ['#'].concat(side ? ['Side'] : [], ['Title', 'Length', 'My rating', 'RYM'], note ? ['Note'] : [], ['Links']);
      body += `\n## Tracklist\n\n| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n`;
      tr.forEach((t, i) => { const links = [['YouTube', t.youtube], ['Spotify', t.spotify], ['SoundCloud', t.soundcloud]].filter(p => obsHttp(p[1])).map(p => `[${p[0]}](${obsHttp(p[1])})`).join(' \u00b7 ');
        const cells = [String(i + 1)].concat(side ? [obsCell(t.side)] : [], [obsCell(t.title), obsCell(t.length), obsStars(t.rating) + (t.listened && !t.rating ? '\u2713' : ''), Number(t.rymRating) > 0 ? Number(t.rymRating).toFixed(2) + (Number(t.rymVotes) > 0 ? ' (' + Math.round(Number(t.rymVotes)).toLocaleString('en-US') + ')' : '') : ''], note ? [obsCell(t.note)] : [], [links]);
        body += `| ${cells.join(' | ')} |\n`; });
    }
    files.push({ path: `CRATE/Releases/${x.file}.md`, text: head + body });
  });
  // ---- artists ----
  A.forEach(a => {
    // level genres keep the order the releases give them in (RYM lists the most important genre first)
    const gs = [...a.genres.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12).map(e => obsYq(gLink(e[0])));
    files.push({ path: `CRATE/Artists/${a.file}.md`, text: obsProps([['type', 'artist'], ['name', obsYq(a.name)], ['releases', a.rels.length], ['genres', gs], ['tags', ['crate/artist']]]) + `\n# ${a.name}\n\n## Releases\n\n${a.rels.slice().sort(byYear).map(relLine).join('\n')}\n` });
  });
  // ---- genres ----
  G.forEach(g => {
    const rs = g.rels.slice().sort(byYear);
    let body = `\n# ${g.label}\n`;
    if (g.description) body += `\n${g.description}\n`;
    if (g.rymText) body += `\n${g.rymText.split(/\r?\n/).map(l => '> ' + l).join('\n')}\n>\n> ${g.rymUrl ? '[From Rate Your Music](' + g.rymUrl + ')' : 'From Rate Your Music'}\n`;
    if (g.children.length) body += `\n## Sub-genres\n\n${g.children.map(k => '- ' + gLink(k)).sort().join('\n')}\n`;
    if (rs.length) body += `\n## Releases\n\n${rs.map(relLine).join('\n')}\n`;
    files.push({ path: `CRATE/Genres/${g.name}.md`, text: obsProps([['type', 'genre'], ['name', obsYq(g.label)], ['parent', g.parents.map(k => obsYq(gLink(k)))], ['releases', rs.length], ['rym', g.rymUrl ? obsYq(g.rymUrl) : ''], ['tags', ['crate/genre']]]) + body });
  });
  // ---- labels ----
  L.forEach(l => { files.push({ path: `CRATE/Labels/${l.name}.md`, text: obsProps([['type', 'label'], ['name', obsYq(l.label)], ['releases', l.rels.length], ['tags', ['crate/label']]]) + `\n# ${l.label}\n\n## Releases\n\n${l.rels.slice().sort(byYear).map(relLine).join('\n')}\n` }); });
  const counts = { releases: releases.length, artists: A.size, genres: G.size, labels: L.size, skipped: skipped.length };
  files.push({ path: 'CRATE/CRATE.md', text: obsProps([['type', 'index'], ['exported', day], ['tags', ['crate/index']]]) + `\n# CRATE\n\nExported from CRATE on ${day}: ${counts.releases.toLocaleString('en-US')} releases, ${counts.artists.toLocaleString('en-US')} artists, ${counts.genres.toLocaleString('en-US')} genres, ${counts.labels.toLocaleString('en-US')} labels.\n\n- **Releases** (\`Releases/\`): one note per release, with its properties, your review and its tracklist.\n- **Artists**, **Genres** and **Labels**: one note each, listing their releases. A genre note also names its parent genre, from your genre taxonomy.\n\nThe links between notes are properties (\`artist\`, \`genres\`, \`labels\`, \`parent\`), so they show in the graph and can be sorted and filtered in a Base. Exporting again makes these notes afresh: write your own notes elsewhere in the vault and link to these.\n` });
  files.sort((p, q) => p.path.localeCompare(q.path));
  return { files, counts };
}
// ---- a ZIP file with nothing compressed (browsers have no ZIP writer of their own) ----
const OBS_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function zipCrc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = OBS_CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files, when) {                                      // [{ path, data: Uint8Array }] -> Uint8Array
  const enc = new TextEncoder(), d = when instanceof Date ? when : new Date(), dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dosDate = ((((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate())) & 0xFFFF;
  const parts = [], central = []; let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.path), crc = zipCrc32(f.data), size = f.data.length, lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name); offset += 30 + name.length + size;
  });
  const cdSize = central.reduce((a, p) => a + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = parts.concat(central, [new Uint8Array(end.buffer)]), out = new Uint8Array(all.reduce((a, p) => a + p.length, 0)); let o = 0; all.forEach(p => { out.set(p, o); o += p.length; }); return out;
}
// END obsidian-export
