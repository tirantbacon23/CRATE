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
    eq([r.type, r.releaseDate, r.recordedDate, r.location, r.scene], ['Album', '1977-10-28', '', 'Various, LA', 'Laurel Canyon']);
    eq(r.tracks.map(t => [t.title, t.rating, t.votes, t.url]), [['Burned', 3.56, 74, 'https://rateyourmusic.com/song/neil-young/burned/'], ['Mr. Soul', 0, 0, '']]);
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
