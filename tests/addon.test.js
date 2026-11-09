// Checks of the RYM add-on's reading (crate-rym-addon/core.js): how a tracklist row becomes a track, the Recorded row, and what it keeps.
// The add-on is not part of CRATE's repository: these run when the add-on's folder sits beside CRATE's (as in Documents\Crate), and are skipped otherwise.
let ADDON = null;
async function addon() {
  if (ADDON) return ADDON;
  const r = await fetch('../crate-rym-addon/core.js', { cache: 'no-cache' }).catch(() => null);
  if (!r || !r.ok) skip('the add-on’s folder isn’t beside CRATE’s');
  const w = {}; (new Function('window', 'self', 'globalThis', await r.text()))(w, w, w);
  ADDON = w.CrateRym || Object.values(w).find(v => v && v.trackFromLeaves); if (!ADDON) skip('core.js didn’t load');
  return ADDON;
}

suite('RYM add-on: reading a release page', () => {
  test('a track row: rating, count, position and title, whatever the side (A to P)', async () => {
    const C = await addon(), row = (p) => { const t = C.trackFromLeaves(p); return t && [t.title, t.rating, t.votes || 0, t.durationMs]; };
    eq(row(['3.7', '78', 'A1', 'Down to the Wire', '2:25']), ['Down to the Wire', 3.7, 78, 145000]);
    eq(row(['4.1', '60', 'E1', 'The Needle and the Damage Done', '2:02']), ['The Needle and the Damage Done', 4.1, 60, 122000]);
    eq(row(['4.0', '55', 'F3', 'Like a Hurricane', '8:16']), ['Like a Hurricane', 4, 55, 496000]);
    eq(row(['1', '1979', '4:25']), ['1979', 0, 0, 265000]);
  });
  test('the Recorded row: when it began, and where', async () => {
    const C = await addon(), r = (t) => { const x = C.recordedFromText(t); return [x.date, x.place]; };
    eq(r('June 1973 - August 1973 at Electric Lady Studios, New York City, NY, United States'), ['1973-06', 'Electric Lady Studios, New York City, NY, United States']);
    eq(r('1966 - 1976'), ['1966', '']);
    eq(r('12 March 1977 – 4 April 1977 Sound Techniques, London'), ['1977-03-12', 'Sound Techniques, London']);
    eq(r('1990s'), ['', '']);
    eq(r('May 1980 Mayfair Studios, London'), ['1980-05', 'Mayfair Studios, London']);
  });
  test('what it sends keeps scenes, the recording and song links, and nothing unsafe', async () => {
    const C = await addon(), o = C.cleanRelease({ artist: 'A', title: 'B', type: 'Album', scene: 'Canterbury Scene', recordedDate: '1973-06', recordedPlace: 'Electric Lady', tracks: [{ title: 'x', url: 'https://rateyourmusic.com/song/a/x/' }, { title: 'y', url: 'https://evil.example/' }] });
    eq([o.scene, o.recordedDate, o.recordedPlace, o.tracks[0].url, o.tracks[1].url], ['Canterbury Scene', '1973-06', 'Electric Lady', 'https://rateyourmusic.com/song/a/x/', undefined]);
  });
  test('one cover offered in several sizes and formats is one picture (the biggest jpeg); two covers are none', async () => {
    const C = await addon(), u = (n, f, e) => `https://e.snmc.io/i/${n}/${f}/552e7a34873264a1e764679b04315c23/1975287/Cover.${e}`;
    eq(C.oneRymCover([u(150, 'w', 'webp'), u(75, 'w', 'webp'), u(150, 's', 'jpeg'), u(75, 's', 'jpeg')]), u(150, 's', 'jpeg'));
    eq(C.oneRymCover([u(75, 's', 'jpeg'), 'https://e.snmc.io/i/75/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/2/Other.jpeg']), '');
  });
});

suite('RYM add-on: track positions', () => {
  test('a row keeps its position as the page writes it ("A", "B2", "3"), never a rating’s vote count', async () => {
    const C = await addon(), pos = (p) => (C.trackFromLeaves(p) || {}).pos || '';
    eq([pos(['A', 'Mi vida rosa', '4.0', '1']), pos(['3.7', '78', 'B2', 'Down to the Wire', '2:25']), pos(['4.0', '11', '3', 'Our Secret', 'lyrics', '2:51']), pos(['Untitled', '2:00'])], ['A', 'B2', '3', '']);
    eq(C.cleanRelease({ artist: 'A', title: 'B', type: 'Single', tracks: [{ title: 'x', pos: 'A' }, { title: 'y', pos: '<b>' }] }).tracks.map(t => t.pos || ''), ['A', '']);
  });
});

suite('RYM add-on: bold songs', () => {
  test('a song drawn heavier than the others is bold; a release drawn all one way marks none', async () => {
    const C = await addon(), b = (ws) => C.markBold(ws.map((w, i) => ({ title: 't' + i, w }))).map(t => !!t.bold);
    eq([b([400, 700, 400, 700]), b([700, 700]), b([400, 400]), b([0, 0])], [[false, true, false, true], [false, false], [false, false], [false, false]]);
    eq(C.markBold([{ title: 'a', w: 700 }, { title: 'b', w: 400 }]).map(t => 'w' in t), [false, false]);
    eq(C.cleanTracks([{ title: 'a', bold: true }, { title: 'b', bold: 'yes' }]).map(t => !!t.bold), [true, false]);
  });
});

suite('RYM add-on: bold releases', () => {
  test('a list drawing some titles heavier marks each 1 or 0; one drawn all one way marks none; the mark is kept with the rating', async () => {
    const C = await addon(), m = (ws) => C.boldMarks(ws.map((w, i) => ({ p: '/release/album/x/' + i + '/', a: 3, w })));
    eq(m([700, 400]).map(e => [e.b, 'w' in e]), [[1, false], [0, false]]);
    eq(m([700, 700]).map(e => 'b' in e), [false, false]);
    const one = C.mergeRatings({}, [{ p: '/r/1/', a: 3.5, n: 10, b: 1, t: 1 }]).out;
    eq(one['/r/1/'].b, 1);
    const same = C.mergeRatings(one, [{ p: '/r/1/', a: 3.5, n: 10, b: 0, t: 2 }]).out;          // same figures: only the mark changes
    eq(same['/r/1/'].b, 0);
    const moved = C.mergeRatings(same, [{ p: '/r/1/', a: 3.6, n: 12, t: 3 }]).out;          // a release page tells no mark: the one known stays
    eq([moved['/r/1/'].a, moved['/r/1/'].b], [3.6, 0]);
  });
});

suite('RYM add-on: genre and chart progress', () => {
  test('a list and its page number from the address (a chart’s year is not a page)', async () => {
    const C = await addon(), lp = (p) => { const x = C.listPage(p); return x && [x.key, x.page, x.kind]; };
    eq(lp('/genre/indie-rock/'), ['/genre/indie-rock/', 1, 'genre']);
    eq(lp('/genre/Indie-Rock/3/'), ['/genre/indie-rock/', 3, 'genre']);
    eq(lp('/charts/top/album/all-time/g:indie-rock/2/'), ['/charts/top/album/all-time/g:indie-rock/', 2, 'chart']);
    eq(lp('/charts/top/album/1986/'), ['/charts/top/album/1986/', 1, 'chart']);
    eq([lp('/artist/yes/'), lp('/release/album/yes/fragile/')], [null, null]);
    eq([C.listPageUrl('/genre/indie-rock/', 1), C.listPageUrl('/genre/indie-rock/', 4)], ['https://rateyourmusic.com/genre/indie-rock/', 'https://rateyourmusic.com/genre/indie-rock/4/']);
  });
  test('pages opened, done by having them all, sending or saying so; one you unmark stays unmarked', async () => {
    const C = await addon(), k = '/genre/indie-rock/';
    let s = {};
    s = C.recordPage(s, { key: k, page: 1, kind: 'genre', label: 'Indie Rock', owned: 40, edition: 0, total: 40, t: 1 }).out;
    s = C.recordPage(s, { key: k, page: 2, kind: 'genre', owned: 12, edition: 1, total: 40, t: 2 }).out;
    s = C.recordPage(s, { key: k, page: 3, kind: 'genre', owned: null, total: 40, t: 3 }).out;          // CRATE not connected: opened, nothing counted
    eq(C.listProgress(s[k]), { checked: [1, 2, 3], done: [1], open: [2, 3], next: 2 });
    eq(C.recordPage(s, { key: k, page: 2, kind: 'genre', owned: 12, edition: 1, total: 40, t: 4 }).changed, false);          // the same again, soon after: nothing to write
    s = C.markPage(s, k, 2, true, 'sent').out;
    eq([C.listProgress(s[k]).next, s[k].pages[2].h, s[k].label], [3, 'sent', 'Indie Rock']);
    s = C.markPage(s, k, 1, false).out;
    s = C.recordPage(s, { key: k, page: 1, kind: 'genre', owned: 40, edition: 0, total: 40, t: 999999 }).out;
    eq([s[k].pages[1].d, C.listProgress(s[k]).next], [0, 1]);
    eq(C.pageRanges([1, 2, 3, 5, 8, 9]), '1–3, 5, 8–9');
  });
});

suite('RYM add-on: release details with a tracklist', () => {
  test('the label, date, genres and cover are kept with the tracklist, and CRATE takes them in as plain text', async () => {
    const C = await addon(), tr = [{ title: 'Some Candy Talking' }, { title: 'Psycho Candy' }, { title: 'Hit' }], p = '/release/ep/the-jesus-and-mary-chain/some-candy-talking/';
    let s = C.mergeTracklist({}, { p, ar: 'the jesus and mary chain', ti: 'some candy talking', ty: 'ep', t: 1, tracks: tr }).out;
    eq(s[p].d, undefined);
    const r = C.mergeTracklist(s, { p, t: 2, tracks: tr, d: { label: 'Blanco y Negro', catalog: 'NEG 19', date: '1986-07-14', genre: 'Noise Pop', cover: 'javascript:alert(1)' } });
    eq([r.changed, r.out[p].d], [true, { label: 'Blanco y Negro', catalog: 'NEG 19', date: '1986-07-14', genre: 'Noise Pop', cover: '' }]);
    const got = app('rymCleanTracklists')([Object.assign({}, r.out[p], { d: { label: 'Blanco y Negro', date: 'soon', cover: 'https://e.snmc.io/i/600/x.jpg', extra: 1 } })]);
    eq(got[0].d, { label: 'Blanco y Negro', catalog: '', date: '', genre: '', cover: 'https://e.snmc.io/i/600/x.jpg' });
  });
});

suite('RYM add-on: an artist’s page', () => {
  test('the facts beside the name: born, died, members with roles, member of, also known as', async () => {
    const C = await addon();
    eq(C.splitNameList('John Lennon (vocals, guitar, 1960-70), Paul McCartney (bass), George Harrison'), [{ name: 'John Lennon', role: 'vocals, guitar, 1960-70' }, { name: 'Paul McCartney', role: 'bass' }, { name: 'George Harrison', role: '' }]);
    const e = C.artistFromFields([{ label: 'Born', text: '21 December 1940, Baltimore, MD, United States' }, { label: 'Member of', text: 'The Mothers of Invention, Plastic Ono Band' }, { label: 'Also Known As', text: 'Zappa' }, { label: 'Notes', text: 'x' }], 'Frank Zappa', '/artist/frank-zappa');
    eq([e.born, e.memberOf, e.aka, e.notes], ['21 December 1940, Baltimore, MD, United States', ['The Mothers of Invention', 'Plastic Ono Band'], ['Zappa'], undefined]);
    eq(C.artistFromFields([{ label: 'Genres', text: 'Rock' }], 'X', '/artist/x'), null);          // nothing about the artist itself: not kept
  });
});
