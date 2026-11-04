// Checks of CRATE's own logic: reading tracklists, what an update from Rate Your Music proposes, scenes as genres, the crate file format, the
// ratings spreadsheet, the update log, and the Processing queue. Each calls the real functions in the running page (app('name')).

suite('Release and changelog', () => {
  test('APP_VERSION matches CURRENT_VERSION in CHANGELOG.txt, and is its newest entry', async () => {
    const text = await fetch('../CHANGELOG.txt', { cache: 'no-cache' }).then(r => r.text());
    const cur = (/CURRENT_VERSION:\s*(\d+\.\d+\.\d+)/.exec(text) || [])[1], v = app('APP_VERSION');
    eq(cur, v, 'CURRENT_VERSION vs APP_VERSION');
    const entries = app('parseUpdateLog')(text);
    ok(entries.length > 300, 'the log has its entries'); eq(entries[0].version, v, 'newest entry');
  });
  test('index.html asks for every script and the styles with ?v=APP_VERSION, so a release loads as one set', async () => {
    const html = await fetch('../index.html', { cache: 'no-cache' }).then(r => r.text()), v = app('APP_VERSION');
    const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
    ok(refs.length >= 30, 'the scripts are listed'); eq(refs.filter(r => !r.endsWith('?v=' + v)), [], 'files without the current ?v=');
  });
  test('the update log reads entries, summary and details', () => {
    const e = app('parseUpdateLog')('  CURRENT_VERSION: 2.0.0\n\n  2.0.0 — 2026-11-04 — First line.\n          more of it\n\n          Details here.\n  1.9.0 — 2026-11-01 — Older.\n');
    eq(e.map(x => [x.version, x.date, x.summary, x.hasDetails]), [['2.0.0', '2026-11-04', 'First line. more of it', true], ['1.9.0', '2026-11-01', 'Older.', false]]);
  });
  test('versions compare as numbers, not text', () => { const c = app('updateLogCompare'); ok(c('1.29.160', '1.29.159') > 0); ok(c('1.10.0', '1.9.9') > 0); eq(c('1.2.0', '1.2'), 0); });
});

suite('Tracklists', () => {
  test('lengths read and written', () => {
    const p = app('tlParseTime'), f = app('tlFormatTime');
    eq([p('3:12'), p('03:12'), p('1:02:03'), p('3.12'), p('')], [192000, 192000, 3723000, 0, 0]);
    eq([f(192000), f(3723000), f(0)], ['3:12', '1:02:03', '']);
  });
  test('the same song whatever the case, accents and bracketed notes', () => {
    const k = app('tlKey'); eq(k('Héroes'), k('heroes')); eq(k('Karma Police (Remastered)'), k('karma police'));
  });
  test('a pasted vinyl list keeps titles, not side positions', () => {
    const r = app('tlParseText')('A1 Down to the Wire 2:25\nA2 Burned 2:14\nE1 The Needle and the Damage Done 2:02\nF3 Like a Hurricane 8:16');
    eq(r.tracks.map(t => [t.title, t.durationMs]), [['Down to the Wire', 145000], ['Burned', 134000], ['The Needle and the Damage Done', 122000], ['Like a Hurricane', 496000]]);
  });
  test('numbers are kept by title when a list is replaced; new songs get the next ones', () => {
    const a = app('tlAssignNumbers')([{ trackNumber: 1, title: 'One' }, { trackNumber: 2, title: 'Two' }, { trackNumber: 3, title: 'Gone' }], [{ title: 'Two' }, { title: 'One' }, { title: 'New' }], 0);
    eq(a.rows.map(r => [r.trackNumber, r.title]), [[2, 'Two'], [1, 'One'], [4, 'New']]); eq([a.matched, a.fresh, a.dropped.map(d => d.title)], [2, 1, ['Gone']]);
  });
  test('a list of mostly numbers is never offered as a tracklist', () => {
    ok(app('rymTracklistLooksWrong')([{ title: '6k' }, { title: '5k' }, { title: '4.2' }, { title: '12' }])); ok(!app('rymTracklistLooksWrong')([{ title: 'One' }, { title: 'Two' }]));
  });
});

suite('What arrives from the RYM add-on', () => {
  test('song pages: only rateyourmusic.com/song/ addresses', () => {
    const u = app('rymSongUrl');
    eq([u('https://rateyourmusic.com/song/neil-young/burned/'), u('https://rateyourmusic.com/song/a/b/?x=1'), u('https://evil.example/song/a/'), u('javascript:alert(1)'), u(null)], ['https://rateyourmusic.com/song/neil-young/burned/', '', '', '', '']);
  });
  test('releases are cleaned: types, dates, scenes, recorded place, track links', () => {
    const out = app('rymCleanOutbox')([{ id: 'b1', t: 1, kind: 'update', releases: [{ artist: 'Neil Young', title: 'Decade', type: 'Boxset', releaseDate: '1977-10-28', recordedDate: '1966 to 1976', recordedPlace: '  Various,   LA  ', scene: ' Laurel Canyon ', rymLink: 'https://rateyourmusic.com/release/comp/neil-young/decade/',
      tracks: [{ title: 'Burned', rating: 3.56, votes: 74, url: 'https://rateyourmusic.com/song/neil-young/burned/' }, { title: 'Mr. Soul', rating: 0, votes: 80, url: 'https://evil.example/x' }] }] }]);
    const r = out[0].releases[0];
    eq([r.type, r.releaseDate, r.recordedDate, r.location, r.scene, r.rymLink], ['Album', '1977-10-28', '', 'Various, LA', 'Laurel Canyon', 'https://rateyourmusic.com/release/comp/neil-young/decade/']);
    eq(r.tracks.map(t => [t.title, t.rating, t.votes, t.url]), [['Burned', 3.56, 74, 'https://rateyourmusic.com/song/neil-young/burned/'], ['Mr. Soul', 0, 0, '']]);
  });
  test('covers from a list page arrive: RYM pictures kept, apostrophes encoded, anything unsafe dropped', () => {
    const c = (cover) => app('rymCleanOutbox')([{ id: 'b1', t: 1, releases: [{ artist: 'A', title: 'T', cover }] }])[0].releases[0].cover;
    const pic = 'https://e.snmc.io/i/150/s/3fad714090bb479e47bc62d91512a78b/1721505/Wckr%20Spgt%20-%20Dance%20Til%20You%20Stop%2C%20Cover%20art.jpeg';
    eq([c(pic), c("https://e.snmc.io/i/150/s/aa/1/Tomorrow's%20Revue.jpeg"), c('http://e.snmc.io/i/1.jpg'), c('https://x.io/a"b.jpg'), c('javascript:alert(1)'), c(undefined)],
       [pic, 'https://e.snmc.io/i/150/s/aa/1/Tomorrow%27s%20Revue.jpeg', '', '', '', '']);
  });
  test('tracklists seen while browsing keep counts and links, and need two tracks', () => {
    const l = app('rymCleanTracklists')([{ p: '/release/album/a/b', tracks: [{ title: 'One', rating: 4.1, votes: 12, url: 'https://rateyourmusic.com/song/a/one/' }, { title: 'Two' }] }, { p: '/release/album/a/c', tracks: [{ title: 'Alone' }] }]);
    eq(l.length, 1); eq([l[0].tracks[0].votes, l[0].tracks[0].url, l[0].tracks[1].url], [12, 'https://rateyourmusic.com/song/a/one/', '']);
  });
});

suite('Update from Rate Your Music: what is proposed', () => {
  const plan = (item, rel, old) => app('rymUpdatePlan')(Object.assign({ trackData: {} }, item), rel, old || [], 0).map(p => [p.key, p.kind, p.checked]);
  test('blank fields are filled and ticked; a different value is offered unticked', () => {
    eq(plan({ label: '' }, { label: 'Reprise' }), [['label', 'fill', true]]);
    eq(plan({ label: 'Warner' }, { label: 'Reprise' }), [['label', 'differs', false]]);
    eq(plan({ label: 'reprise' }, { label: 'Reprise' }), []);
  });
  test('the same scenes in another order are not a difference', () => { eq(plan({ scene: 'Laurel Canyon, Topanga' }, { scene: 'topanga, Laurel Canyon' }), []); });
  test('recorded: filled, refined (a year by its month), or offered when it differs', () => {
    eq(plan({ recordedDate: '' }, { recordedDate: '1973-06' }), [['recordedDate', 'fill', true]]);
    eq(plan({ recordedDate: '1973' }, { recordedDate: '1973-06' }), [['recordedDate', 'refine', true]]);
    eq(plan({ recordedDate: '1973-06-02' }, { recordedDate: '1973-06' }), []);
    eq(plan({ recordedDate: '1971' }, { recordedDate: '1973-06' }), [['recordedDate', 'differs', false]]);
  });
  test('a location is filled only where there is none', () => {
    eq(plan({ location: '' }, { location: 'Electric Lady Studios' }), [['location', 'fill', true]]);
    eq(plan({ location: 'Leeds' }, { location: 'Electric Lady Studios' }), []);
  });
  test('the same tracklist: song links and ratings are filled for tracks without them', () => {
    const old = [{ trackNumber: 1, title: 'One' }, { trackNumber: 2, title: 'Two' }];
    const p = app('rymUpdatePlan')({ trackData: { 2: { rymLink: 'https://mine.example/' } } }, { tracks: [{ title: 'One', rating: 3.9, votes: 120, url: 'https://rateyourmusic.com/song/a/one/' }, { title: 'Two', rating: 0, url: 'https://rateyourmusic.com/song/a/two/' }] }, old, 0);
    const links = p.find(x => x.key === 'trackLinks'), stats = p.find(x => x.key === 'trackStats');
    eq(links.rows.map(r => [r.trackNumber, r.rymLink]), [[1, 'https://rateyourmusic.com/song/a/one/']]);          // track 2 keeps your own link
    eq(stats.rows.map(r => [r.trackNumber, r.rymRating, r.rymVotes]), [[1, 3.9, 120]]);
  });
  test('a saved list titled with side positions (E1, F2) is repaired, ticked', () => {
    const p = app('rymUpdatePlan')({ trackData: {} }, { tracks: [{ title: 'Harvest' }, { title: 'The Needle and the Damage Done' }] }, [{ trackNumber: 1, title: 'Harvest' }, { trackNumber: 2, title: 'E1' }], 0).find(x => x.key === 'tracks');
    eq([p.kind, p.checked], ['fill', true]);
  });
  test('a different tracklist still brings the ratings and song links of the tracks that match', () => {
    const p = app('rymUpdatePlan')({ trackData: {} }, { tracks: [{ title: 'Begin Now!', rating: 3.9, votes: 194, url: 'https://rateyourmusic.com/song/a/begin-now/' }, { title: '½ Way Down', rating: 4.2, votes: 166, url: 'https://rateyourmusic.com/song/a/-way-down/' }, { title: 'Bonus' }] },
      [{ trackNumber: 1, title: 'Begin Now!' }, { trackNumber: 2, title: 'Halfway Down' }], 0);
    eq(p.map(x => [x.key, x.kind, x.checked]), [['tracks', 'differs', false], ['trackLinks', 'fill', true], ['trackStats', 'fill', true]]);
    eq(p.find(x => x.key === 'trackStats').rows.map(r => [r.trackNumber, r.rymRating, r.rymVotes]), [[1, 3.9, 194], [2, 4.2, 166]]);
  });
  test('your own different tracklist is offered, never ticked', () => {
    const p = app('rymUpdatePlan')({ trackData: {} }, { tracks: [{ title: 'Alpha' }, { title: 'Beta' }] }, [{ trackNumber: 1, title: 'Gamma' }, { trackNumber: 2, title: 'Delta' }], 0).find(x => x.key === 'tracks');
    eq([p.kind, p.checked], ['differs', false]);
  });
});

suite('Scenes and movements as genres', () => {
  test('a scene already among the genres is not repeated ("Canterbury" = "Canterbury Scene")', () => {
    eq(app('sceneGenreStr')({ genre: 'Progressive Rock', genre2: 'Canterbury Scene', scene: 'Canterbury, Kosmische', movement: 'Rock in Opposition' }), 'Kosmische, Rock in Opposition');
  });
  test('they count as secondary genres', () => {
    eq(app('combinedGenreStr')({ genre: 'Jazz', genre2: '', scene: 'Canterbury Scene', movement: '' }), 'Jazz, Canterbury Scene');
  });
});

suite('Crate files and exports', () => {
  test('a release from a file is checked: bad dates dropped with a warning, RYM track data kept', () => {
    const r = app('cxNormalizeRelease')({ artist: 'A', title: 'B', releaseDate: 'sometime', recordedDate: '1973-06', location: 'Leeds', tracks: [{ title: 'One', rating: 4.2, votes: 10, url: 'https://rateyourmusic.com/song/a/one/' }, { title: '' }] }, 0);
    eq([r.releaseDate, r.recorded, r.location, r.invalid], ['', '1973-06', 'Leeds', false]);
    ok(r.warnings.some(w => /release date/.test(w)), 'a warning about the date'); ok(r.warnings.some(w => /without a title/.test(w)), 'a warning about the untitled track');
    eq([r.tracks[0].rymRating, r.tracks[0].rymVotes, r.tracks[0].rymLink], [4.2, 10, 'https://rateyourmusic.com/song/a/one/']);
  });
  test('what an import writes follows the link choices; per-song data goes in after the release exists', () => {
    const rel = app('cxNormalizeRelease')({ artist: 'A', title: 'B', tracks: [{ title: 'One', rating: 4.2, url: 'https://rateyourmusic.com/song/a/one/', soundcloud: 'https://soundcloud.com/a/one' }] }, 0);
    const opts = app('cxDefaultOpts')(); opts.links.other = false;
    const s = app('cxShape')(rel, opts);
    eq(s.tracks[0].rymLink, undefined, 'no RYM link when "Other" links are off');
    eq(app('cxSoundcloudUpdates')(s), { 1: { soundcloudLink: 'https://soundcloud.com/a/one', rymRating: 4.2, rymFrom: 'rym' } });
  });
  test('the ratings spreadsheet: a heading row, and nothing a spreadsheet would run as a formula', () => {
    const csv = app('cxRatingsCsv')([{ artist: '=HYPERLINK("x")', title: 'Title, with comma', releaseDate: '1977', type: 'Album', rymRating: 4.38, rymVotes: 2636, trackData: {} }]);
    ok(csv.startsWith('﻿Row,Artist,Release'), 'starts with the mark and the headings');
    ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'the formula is quoted and defused'); ok(csv.includes('"Title, with comma"'), 'a comma is quoted');
  });
});

suite('Processing queue', () => {
  test('releases queued while an update runs wait in runs of 25, without repeats', () => {
    const js = app('jobsState'), was = js.waiting.slice();
    try {
      js.waiting = []; const items = app('state').raw.slice(0, 60);
      app('jobsQueueRym')(items, true); app('jobsQueueRym')(items.slice(0, 10), true);
      eq(js.waiting.map(w => w.rows.length), [25, 25, 10]);
    } finally { js.waiting = was; }
  });
});

suite('Matching songs to Spotify and YouTube', () => {
  test('"½ Way Down" is the same song as "Halfway Down"', () => {
    eq(app('smTitleSim')('½ Way Down', 'Halfway Down'), 1); eq(app('tlKey')('½ Way Down'), 'half way down');
    eq(app('trackNormKey')('½ Way Down'), app('trackNormKey')('Halfway Down'));
  });
  test('different songs stay different', () => { ok(app('smTitleSim')('Way Down', 'Halfway Down') < 0.85); ok(app('trackNormKey')('Halfway Down') !== app('trackNormKey')('Way Down')); });
});

suite('New releases', () => {
  test('the background check runs once a calendar day: after one today, the next is from midnight', () => {
    const ls = app('localStorage'), keys = [app('NEW_RELEASES_LAST_SCAN_KEY'), app('NEW_RELEASES_AUTO_TRIED_KEY')], was = keys.map(k => ls.getItem(k));
    try {
      keys.forEach(k => ls.removeItem(k)); eq(app('newReleaseNextAutoAt')(), 0, 'never checked: due now');
      const morning = new Date(); morning.setHours(9, 0, 0, 0); ls.setItem(keys[1], String(morning.getTime()));
      const midnight = new Date(morning); midnight.setHours(24, 0, 0, 0); eq(app('newReleaseNextAutoAt')(), midnight.getTime(), 'tried this morning');
      const late = new Date(morning); late.setHours(23, 50, 0, 0); ls.setItem(keys[0], String(late.getTime())); eq(app('newReleaseNextAutoAt')(), midnight.getTime(), 'checked late tonight: still from midnight');
    } finally { keys.forEach((k, i) => was[i] == null ? ls.removeItem(k) : ls.setItem(k, was[i])); }
  });
});

suite('Deleting releases', () => {
  test('several are deleted from the bottom row up, so no row moves before its turn', async () => {
    const sent = [], items = [{ row: 12 }, { row: 40 }, { row: 7 }, { row: 0 }];
    const r = await app('deleteAlbumRows')(items, async (p) => { sent.push([p.action, p.row]); });
    eq(sent, [['deleteAlbum', 40], ['deleteAlbum', 12], ['deleteAlbum', 7]]); eq([r.done.length, r.failed.length], [3, 0]);
  });
  test('one that fails doesn’t stop the rest; signed out stops it', async () => {
    const r = await app('deleteAlbumRows')([{ row: 3 }, { row: 9 }, { row: 5 }], async (p) => { if (p.row === 9) throw new Error('busy'); });
    eq([r.done.map(x => x.row), r.failed.map(x => x.row)], [[5, 3], [9]]);
    const s = await app('deleteAlbumRows')([{ row: 3 }, { row: 9 }], async () => { throw new Error('Unauthorized'); });
    eq([s.done.length, s.failed.length], [0, 1]);
  });
});

suite('Syncing the crate quietly', () => {
  const rel = (o) => Object.assign({ albumId: '', artist: 'A', title: 'T', releaseDate: '1987', type: 'Single', row: 2, rating: 0 }, o);
  test('nothing new: the same objects, and nothing to redraw', () => {
    const rec = app('catalogReconcile'), a = rec([], [rel({ albumId: 'x1' }), rel({ albumId: 'x2', row: 3 })]).raw;
    const b = rec(a, [rel({ albumId: 'x1' }), rel({ albumId: 'x2', row: 3 })]);
    eq([b.changed, b.raw[0] === a[0], b.raw[1] === a[1]], [false, true, true]);
  });
  test('a change is written into the same object; added and removed ones are told apart', () => {
    const rec = app('catalogReconcile'), a = rec([], [rel({ albumId: 'x1' }), rel({ albumId: 'x2', row: 3 })]).raw;
    const b = rec(a, [rel({ albumId: 'x1', rating: 4 }), rel({ albumId: 'x3', row: 3, title: 'New' })]);
    eq([b.changed, b.modified, b.raw[0] === a[0], a[0].rating, b.added.map(x => x.title), b.removed.map(x => x.albumId)], [true, 1, true, 4, ['New'], ['x2']]);
  });
  test('without an id, a release is known by artist, title, date and type, whatever its row', () => {
    const rec = app('catalogReconcile'), a = rec([], [rel({ row: 5 })]).raw, b = rec(a, [rel({ row: 4 })]);
    eq([b.raw[0] === a[0], b.added.length, a[0].row], [true, 0, 4]);
  });
  test('deleting here: the release goes, and every row below it moves up one', () => {
    const st = app('state'), was = st.raw;
    try {
      const x = { row: 2 }, y = { row: 3 }, z = { row: 7 }; st.raw = [x, y, z];
      app('catalogRemoveLocal')(y); eq(st.raw.map(r => r.row), [2, 6]);
    } finally { st.raw = was; }
  });
});

suite('New releases: added, then updated from Rate Your Music, then matched', () => {
  const rel = (o) => Object.assign({ artist: 'Wckr Spgt', title: 'Dance Til You Stop', row: 9, rymLink: 'https://rateyourmusic.com/release/album/wckr-spgt/dance-til-you-stop/', rymUpdated: '' }, o);
  test('only new releases with a RYM link that have never been updated, and only with the setting on', () => {
    const st = app('state'), was = st.rymUpdateOnAdd, pick = app('rymUpdateAddedPick');
    try {
      st.rymUpdateOnAdd = true;
      eq(pick([rel(), rel({ rymLink: '' }), rel({ rymUpdated: '2026-01-01' })]).length, 1);
      st.rymUpdateOnAdd = false; eq(pick([rel()]).length, 0);
    } finally { st.rymUpdateOnAdd = was; }
  });
  test('matching waits for the RYM update, and goes ahead once it is done or nothing is running', () => {
    const st = app('state'), out = app('rymOutState'), fs = app('rymFetchState'), held = app('rymAddHolding'), was = [st.rymUpdateOnAdd, out.present, fs.active];
    try {
      st.rymUpdateOnAdd = true; out.present = true; fs.active = true; const t0 = Date.now();
      const a = rel({ title: 'Hold test ' + t0 });
      eq([held(a, t0), held(a, t0 + 600000)], [true, true], 'while RYM is running');
      eq(held(rel({ title: 'Hold test ' + t0, rymUpdated: 'now' }), t0 + 600001), false, 'updated');
      const b = rel({ title: 'Idle test ' + t0 }); fs.active = false;
      eq([held(b, t0 + 600002), held(b, t0 + 700000), held(b, t0 + 700001)], [true, false, false], 'nothing running for 90 s: freed, and stays freed');
      out.present = false; eq(held(rel({ title: 'No addon ' + t0 }), t0), false, 'no add-on');
    } finally { st.rymUpdateOnAdd = was[0]; out.present = was[1]; fs.active = was[2]; }
  });
});

suite('Rate Your Music without the reviews', () => {
  test('"Apply differences too": a date that differs is applied, with nothing left to review; off, it waits', async () => {
    const st = app('state'), q = app('rymQ'), it = st.raw[7], was = [st.rymAutoApply, it.rymLink, it.releaseDate];
    const mk = (id) => app('rymCleanOutbox')([{ id, t: 1, kind: 'update', source: { url: it.rymLink, title: 'x' }, releases: [{ artist: it.artist, title: it.title, type: it.type, releaseDate: '1991-05-01', rymLink: it.rymLink }] }])[0];
    const run = async (auto, id) => { st.rymAutoApply = auto; it.releaseDate = '1990-01-01'; q.entries = q.entries.filter(e => e.row !== it.row); await app('rymQIngest')(mk(id)); const e = q.entries.find(e => e.row === it.row); return [e.state, e.rest.length, it.releaseDate]; };
    try {
      it.rymLink = 'https://rateyourmusic.com/release/album/x/auto-apply-test/';
      eq(await run(false, 'ta1'), ['review', 1, '1990-01-01']);
      eq(await run(true, 'ta2'), ['applied', 0, '1991-05-01']);
    } finally { st.rymAutoApply = was[0]; it.rymLink = was[1]; it.releaseDate = was[2]; }
  });
});

suite('Dropping an export on the page', () => {
  test('a .json export opens the import at its review, with the new releases ticked', async () => {
    const st = app('state'), ex = st.raw[0], CX_FORMAT = app('CX_FORMAT'), CX_VERSION = app('CX_VERSION');
    const json = JSON.stringify({ format: CX_FORMAT, version: CX_VERSION, releases: [{ artist: 'Zz Dropped', title: 'Dropped Album', type: 'Album', releaseDate: '2021' }, { artist: ex.artist, title: ex.title, type: ex.type, releaseDate: ex.releaseDate }] });
    try {
      await app('cxImportDropped')(new File([json], 'crate-export.json', { type: 'application/json' }));
      const imp = app('cxImp');
      eq([imp.releases.map(r => r.status), imp.selected.size], [['new', 'duplicate'], 1]);
    } finally { app('closeCxImport')(); }
  });
  test('a file that is not an export is refused, and nothing opens', async () => {
    await app('cxImportDropped')(new File(['x'], 'photo.png', { type: 'image/png' }));
    ok(app("document.getElementById('cxImportOverlay').hidden"), 'the import stayed closed');
  });
});

suite('Pull details', () => {
  const setup = async (srcs) => {
    const F = app('PD_FETCH'), keep = Object.assign({}, F), it = { row: 77777, artist: 'A', title: 'T', releaseDate: '1999', label: '', genre: 'Rock', cover: '' };
    const mine = [{ trackNumber: 1, title: 'One', durationMs: 0, youtubeLink: 'https://youtu.be/aaaaaaaaaaa', spotifyLink: '' }, { trackNumber: 2, title: 'Two', durationMs: 0, youtubeLink: '', spotifyLink: '' }];
    F.crate = async () => ({ date: '1999', label: '', genre: 'Rock', cover: '', tracks: mine, rows: mine });
    ['rym', 'mb', 'sp', 'it', 'dc'].forEach(k => { F[k] = async () => srcs[k] || { err: 'Not found' }; });
    app('pdOpen')(it); await sleep(300);
    return () => { Object.assign(F, keep); app('pdClose')(); };
  };
  test('blanks are filled from the first source that has them; what you have is kept', async () => {
    const done = await setup({ rym: { tracks: [{ title: 'One', durationMs: 0 }, { title: 'Two', durationMs: 0 }] }, mb: { date: '1999-10-12', label: 'Shrimper', tracks: [{ title: 'One', durationMs: 181000 }, { title: 'Two', durationMs: 199000 }] } });
    try {
      const c = app('pdChanges')();
      eq([Object.keys(c.fields), c.rows && c.rows.map(r => [r.title, r.durationMs, r.youtubeLink])], [['label'], [['One', 181000, 'https://youtu.be/aaaaaaaaaaa'], ['Two', 199000, '']]]);
    } finally { done(); }
  });
  test('another source’s tracklist keeps the links and numbers of songs you already had', async () => {
    const done = await setup({ mb: { tracks: [{ title: 'One', durationMs: 181000 }, { title: 'Two', durationMs: 199000 }, { title: 'Three', durationMs: 120000 }] } });
    try {
      app("document.querySelector('[data-pd-pick=\"tracks\"][data-pd-src=\"mb\"]').click()");
      const c = app('pdChanges')();
      eq(c.rows.map(r => [r.title, r.trackNumber || 0, r.youtubeLink || '']), [['One', 1, 'https://youtu.be/aaaaaaaaaaa'], ['Two', 2, ''], ['Three', 0, '']]);
    } finally { done(); }
  });
});

suite('The scripts themselves', () => {
  test('every script of the page parses (a comment that swallows code would stop a whole file)', async () => {
    const bad = [];
    for (const src of app("[...document.scripts].map(s => s.src).filter(s => s.includes('/js/'))")) {
      const text = await (await fetch(src, { cache: 'no-store' })).text();
      try { new Function(text); } catch (e) { bad.push(src.split('/').pop() + ': ' + e.message); }
    }
    eq(bad, []);
  });
});

suite('Rate Your Music not answering for a moment', () => {
  test('a page that timed out is tried again by itself, later each time; a check is never retried', () => {
    const js = app('jobsState'), p = app('jobsRymProgress'), clear = app('rymRetryClear'), was = [js.held, js.rymLast, js.retries, js.retryOk];
    try {
      js.held = false; js.retries = 0; js.retryOk = 0;
      p({ state: 'stopped', reason: 'timeout', ok: 2, done: 2, total: 5 });
      const first = [js.retries, Math.round((js.retryAt - Date.now()) / 60000)];
      p({ state: 'stopped', reason: 'timeout', ok: 2, done: 2, total: 5 });
      const second = [js.retries, Math.round((js.retryAt - Date.now()) / 60000)];
      p({ state: 'loading', ok: 3, done: 3, total: 5 });
      const answering = [js.retries, js.retryAt];
      p({ state: 'stopped', reason: 'challenge', ok: 3, done: 3, total: 5 });
      eq([first, second, answering, js.retryAt], [[1, 1], [2, 2], [0, 0], 0]);
    } finally { clear(); [js.held, js.rymLast, js.retries, js.retryOk] = was; }
  });
});
