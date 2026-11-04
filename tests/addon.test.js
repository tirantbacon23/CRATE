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
