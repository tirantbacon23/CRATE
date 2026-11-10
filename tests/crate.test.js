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
  test('Japanese titles match their YouTube videos', () => {
    const sim = app('smTitleSim');
    eq(sim('夜に駆ける', '夜に駆ける'), 1);
    eq(sim('夜に駆ける', 'YOASOBI「夜に駆ける」Official Music Video'), 1);
    eq(sim('Yoru ni Kakeru (夜に駆ける)', 'YOASOBI「夜に駆ける」 Official Music Video'), 1);
    eq(sim('ただ君に晴れ', 'ヨルシカ - ただ君に晴れ (MUSIC VIDEO)'), 1);
    eq(sim('Lemon', '米津玄師 MV「Lemon」'), 1);
    eq(sim('ハルジオン', '【MV】ハルジオン'), 1);
    eq(sim('Ｌｅｍｏｎ', 'Lemon'), 1);
    ok(sim('夜に駆ける', '群青') < 0.5);
    ok(sim('Live Forever', 'Blur - Song 2') < 0.5);
  });
  test('Japanese artists and versions', () => {
    const am = app('smArtistMatch'), fl = (t) => [...app('smFlags')(t)];
    eq(am('米津玄師', ['米津玄師']), 1); eq(am('Kenshi Yonezu (米津玄師)', ['米津玄師']), 1);
    eq(am('Yorushika', ['ヨルシカ - Topic']), null);           // another script: can't tell, so neither for nor against
    eq(am('311', ['311']), 1); eq(am('The Beatles', ['Beatles - Topic']), 1); eq(am('Oasis', ['Blur']), 0);
    eq(fl('夜に駆ける 歌ってみた'), ['cover']); eq(fl('夜に駆ける ライブ'), ['live']); eq(fl('夜に駆ける'), []);
    const s = { title: '夜に駆ける', artist: 'YOASOBI', durationMs: 261000 };
    eq(app('smScore')(s, { title: 'YOASOBI「夜に駆ける」 Official Music Video', channel: 'Ayase / YOASOBI', durationMs: 262000 }).band, 'confident');
  });
});

suite('Discogs', () => {
  test('a looser search only accepts this release', () => {
    const fit = (t) => app('discogsResultFit')({ title: t }, 'Tatsu Yamashita', 'It\u2019s a Poppin\u2019 Time').ok;
    ok(fit("Tatsuro Yamashita - It's A Poppin' Time"));                  // the artist a few letters apart, curly vs straight apostrophes
    ok(fit("山下達郎 - It's A Poppin' Time"));                              // the artist in another script: the title decides
    ok(fit("Tatsuro Yamashita* - It's A Poppin' Time"));
    ok(!fit("Tatsuro Yamashita - Big Wave"));
    ok(!fit("Mariya Takeuchi - It's A Poppin' Time"));                   // another artist with the same title
    ok(app('discogsResultFit')({ title: 'Oasis - Definitely Maybe' }, 'Oasis', 'Definitely Maybe').ok);
  });
  test('catalogue numbers: the same however written; CRATE\u2019s own are not one', () => {
    const k = app('dgCatKey');
    eq(k('RAL-8501'), k('ral 8501')); eq(k('RAL\u20108501'), 'RAL8501'); eq(k('CRT-007'), ''); eq(k('none'), ''); eq(k(''), '');
    eq(app('pdDgDate')('1986-00-00'), '1986'); eq(app('pdDgDate')('1986-09-00'), '1986-09'); eq(app('pdDgDate')('1986-09-03'), '1986-09-03');
    eq(app('pdDgChoiceText')({ id: 1, year: '1986', country: 'Japan', format: ['Vinyl', 'LP', 'Album'], label: ['Air Records (2)'], catno: 'RAL-8501' }), '1986 · Japan · Vinyl LP · Air Records RAL-8501');
  });
});

suite('Bilibili full-release videos', () => {
  test('a Bilibili link is a video, never a YouTube id', () => {
    const id = app('youtubeVideoIdFromUrl');
    eq(id('https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333.788'), 'bili:BV1GJ411x7h7');
    eq(id('https://www.bilibili.com/video/BV1GJ411x7h7?p=3&t=95'), 'bili:BV1GJ411x7h7~3');
    eq(id('bilibili.com/video/BV1GJ411x7h7'), 'bili:BV1GJ411x7h7');
    eq(id('https://www.bilibili.com/en/video/BV11L411T7tY/'), 'bili:BV11L411T7tY');          // the English site
    eq(app('youtubeLinkWithSegment')('https://www.bilibili.com/en/video/BV11L411T7tY/', 60, 120), 'https://www.bilibili.com/video/BV11L411T7tY?t=60&end=120');
    ok(app('TG_LINK_RE').youtube.test('https://www.bilibili.com/en/video/BV11L411T7tY/'));
    eq(id('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    eq(id('https://www.bilibili.com/read/cv123'), '');
    ok(app('isBiliId')('bili:BV1GJ411x7h7')); ok(!app('isBiliId')('dQw4w9WgXcQ'));
  });
  test('a song inside it keeps its part, start and end', () => {
    const w = app('youtubeLinkWithSegment'), seg = app('youtubeSegmentFromUrl');
    eq(w('https://www.bilibili.com/video/BV1GJ411x7h7', 95, 301), 'https://www.bilibili.com/video/BV1GJ411x7h7?t=95&end=301');
    eq(w('https://www.bilibili.com/video/BV1GJ411x7h7?p=2', 0, 240), 'https://www.bilibili.com/video/BV1GJ411x7h7?p=2&end=240');
    eq(w('https://www.bilibili.com/video/BV1GJ411x7h7', 0, 0), 'https://www.bilibili.com/video/BV1GJ411x7h7');
    eq(seg('https://www.bilibili.com/video/BV1GJ411x7h7?p=2&t=95&end=301'), { start: 95, end: 301 });
    eq(w('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 5, 9), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5&end=9');          // YouTube links are written as before
    eq(app('videoPageUrl')('bili:BV1GJ411x7h7~2'), 'https://www.bilibili.com/video/BV1GJ411x7h7?p=2');
  });
  test('the stand-in player reports its clock and pauses where it was', () => {
    const shim = app('biliShim'), b = app('bili');
    const was = Object.assign({}, b); b.playing = false; b.base = 120; b.bvid = '';
    try {
      eq(Math.round(shim.getCurrentTime()), 120); eq(shim.getPlayerState(), 2);
      shim.seekTo(200); eq(Math.round(shim.getCurrentTime()), 200);
      b.playing = true; b.base = 200; b.at = Date.now() - 5000; ok(Math.abs(shim.getCurrentTime() - 205) < 0.5); eq(shim.getPlayerState(), 1);
      b.bvid = 'BV1GJ411x7h7'; b.p = 1;
      ok(app('biliContinues')({ videoId: 'bili:BV1GJ411x7h7', start: 206 }));          // the next song follows on: no reload
      ok(!app('biliContinues')({ videoId: 'bili:BV1GJ411x7h7', start: 400 }));
      ok(!app('biliContinues')({ videoId: 'bili:BV1GJ411x7h7~2', start: 206 }));
    } finally { b.playing = false; Object.assign(b, was, { playing: false }); }
  });
  test('a start moved with "Later songs move too" takes the later songs along', async () => {
    const it = app('state').raw.find(r => (r.manualTracks || []).length >= 3); if (!it) { skip('no release with a tracklist'); return; }
    await app('fvOpen')(it, 'https://www.bilibili.com/video/BV1GJ411x7h7');
    try {
      const fv = app('fv'); fv.rows.forEach((r, k) => { r.start = app('ytFormatTime')(k * 60); r.end = app('ytFormatTime')(k * 60 + 60); });
      fv.rows[2].start = ''; fv.rows[2].end = '';                   // a song with no times stays without them
      eq(app('fvShiftFrom')(1, 6) > 0, true);
      eq([fv.rows[0].start, fv.rows[0].end, fv.rows[1].start, fv.rows[1].end, fv.rows[2].start, fv.rows[3].start], ['0:00', '1:00', '1:00', '2:06', '', '3:06']);
      app('fvShiftFrom')(3, -500); eq([fv.rows[3].start, fv.rows[3].end], ['3:06', '0:00']);    // the song's own start is yours to set; nothing goes before the video's start
    } finally { app('fvClose')(); }
  });
  test('a Bilibili song on its own ends after its length; the track editor takes its link', () => {
    const seg = app('ytSegOf'), B = 'https://www.bilibili.com/video/BV1GJ411x7h7';
    eq(seg(B, 245000), { start: 0, end: 245 });
    eq(seg(B + '?t=4', 245000), { start: 4, end: 249 });                       // a lead-in skipped with ?t= still gets the whole song
    eq(seg(B + '?t=60&end=300', 245000), { start: 60, end: 300 });             // a part of a full-release video keeps its own end
    eq(seg(B), {});                                                             // no length: it plays on, as before
    eq(seg('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 245000), {});         // YouTube's player says when a video ends by itself
    const re = app('TG_LINK_RE').youtube;
    ok(re.test(B + '?p=2')); ok(re.test('https://www.youtube.com/watch?v=dQw4w9WgXcQ')); ok(!re.test('https://www.bilibili.com/read/cv123'));
  });
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

suite('Song RYM columns', () => {
  test('once: Tracks columns showing the release’s RYM rating become the song’s rating and its count; afterwards your choice stays', () => {
    const st = app('state'), KEY = app('PREF_KEY'), was = app(`localStorage.getItem(${JSON.stringify(app('PREF_KEY'))})`), cols = (st.fields.tracks || []).slice();
    const load = (p) => { app(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(p))})`); app('loadPrefs')(); return st.fields.tracks.slice(); };
    try {
      eq(load({ fields: { tracks: ['artist', 'rymRating', 'genre', 'releaseDate', 'rymRating'] } }), ['artist', 'rymTrackRating', 'genre', 'releaseDate', 'rymTrackVotes']);
      eq(load({ songRymCols: true, fields: { tracks: ['artist', 'rymRating'] } }), ['artist', 'rymRating']);
    } finally {
      if (was === null) app(`localStorage.removeItem(${JSON.stringify(KEY)})`); else app(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(was)})`);
      st.fields.tracks = cols;
    }
  });
});

suite('Tracks columns', () => {
  test('the Track name column takes what is left, so resizing changes one column; too wide scrolls instead of squeezing; the menu offers the song’s RYM rating and count', () => {
    const st = app('state'), gc = app('el').gridContainer, cols = (st.fields.tracks || []).slice(), widths = st.trackColWidths;
    Object.defineProperty(gc, 'clientWidth', { configurable: true, get: () => 1000 });
    try {
      st.fields.tracks = ['artist', 'genre']; st.trackColWidths = {};
      const a = app('trackColWidthsShown')();                     // # 40, artist 120, genre 120, plays 64; row overhead 12*4 + 20
      st.trackColWidths = { artist: 300 };
      const b = app('trackColWidthsShown')();
      st.trackColWidths = { artist: 900 };                        // too wide even with a narrow name column: nothing is squeezed, the table scrolls
      const c = app('trackColWidthsShown')();
      eq([a, b, c], [[40, 588, 120, 120, 64], [40, 408, 300, 120, 64], [40, 120, 900, 120, 64]]);
      st.trackColWidths = { name: 500 };                          // a name column dragged wider than the room left keeps that width
      eq(app('trackColWidthsShown')()[1], 588); st.trackColWidths = { name: 700 }; eq(app('trackColWidthsShown')()[1], 700);
      app('openTrackColumnMenu')(null, 2, 0, 0, true);
      const m = app('document').querySelector('.track-col-menu');
      eq(['rymTrackRating', 'rymTrackVotes'].map(k => !!m.querySelector(`[data-field-val="${k}"]`)), [true, true]);
      app('closeTrackColumnMenu')();
    } finally { delete gc.clientWidth; st.fields.tracks = cols; st.trackColWidths = widths; }
  });
});

suite('Match songs: the artist in a video title', () => {
  test('a fan upload titled "Artist - Song" counts as the artist, so an exact title and length is confident', () => {
    const f = app('smScore'), song = { title: 'Deep Hole Ends', artist: 'The Telescopes', durationMs: 301000 };
    const fan = f(song, { id: 'x', title: 'The Telescopes - Deep Hole Ends', channel: 'martian1138', durationMs: 300000 }, {});
    const other = f(song, { id: 'y', title: 'Someone Else - Deep Hole Ends', channel: 'martian1138', durationMs: 300000 }, {});
    eq([fan.band, other.band === 'confident'], ['confident', false]);
  });
});

suite('Track numbers', () => {
  test('a song is shown by its place in the list, with the release’s own position beside it when that says more', () => {
    const f = app('trackNumHtml'), plain = (h) => h.replace(/<[^>]+>/g, '|');
    eq([plain(f({ trackNumber: 3, pos: 'A' }, 0)), plain(f({ trackNumber: 4, pos: 'B' }, 1)), plain(f({ trackNumber: 7, pos: '2' }, 1)), plain(f({ trackNumber: 9 }, 4)), f({ trackNumber: 5 }, -1)],
       ['1|A|', '2|B|', '2', '5', '5']);
  });
  test('Rate Your Music’s positions are kept with a saved tracklist', () => {
    eq(app('tlPersist')([{ trackNumber: 3, title: 'Mi vida rosa', pos: 'A' }, { trackNumber: 4, title: 'Mi vida rosa', pos: 'B' }], 'rym').map(t => t.pos), ['A', 'B']);
  });
});

suite('Sync while saving', () => {
  test('a quiet sync waits for the sheet’s writes to finish before it is done again', async () => {
    const w = app('catalogWrites'), start = app('catalogWriteStart'), end = app('catalogWriteEnd'), settled = app('catalogWritesSettled');
    const was = [w.started, w.inFlight];
    start(); start(); let done = false; const p = settled().then(() => { done = true; });
    end(); await new Promise(r => setTimeout(r, 0)); const mid = done;
    end(); await p;
    eq([w.started - was[0], w.inFlight, mid, done], [2, was[1], false, true]);
  });
});

suite('Releases sent from RYM, added by themselves', () => {
  test('a batch the automatic import has taken isn’t shown as waiting for review', () => {
    const st = app('state'), out = app('rymOutState'), tried = app('rymAutoTried'), was = [st.rymAutoImport, out.batches, out.dismissed];
    try {
      out.dismissed = ''; out.batches = [{ id: 'bTest', kind: 'list', source: { title: 'A chart' }, releases: [{ artist: 'X', title: 'Y' }] }];
      st.rymAutoImport = true; tried.add('bTest'); app('renderRymInbox')();
      const hiddenWhenAuto = app('document').getElementById('rymInbox').hidden;
      tried.delete('bTest'); app('renderRymInbox')();
      const shownWhenNot = !app('document').getElementById('rymInbox').hidden;
      eq([hiddenWhenAuto, shownWhenNot], [true, true]);
    } finally { [st.rymAutoImport, out.batches, out.dismissed] = was; tried.delete('bTest'); app('renderRymInbox')(); }
  });
});

suite('Fill blanks from other sources', () => {
  test('only blanks are filled, in your order; a year becomes a full date in that year; what no source had is left for you', async () => {
    const st = app('state'), fetchers = app('PD_FETCH'), keep = Object.assign({}, fetchers), was = [st.afOrder, app(`localStorage.getItem('crate_fill_left_v1')`)];
    const it = st.raw.find(x => !x.manualTracks || !x.manualTracks.length), saved = { label: it.label, releaseDate: it.releaseDate, cover: it.cover, mt: it.manualTracks, hm: it.hasManualTracklist };
    const asked = [];
    try {
      it.label = ''; it.releaseDate = '1990'; it.cover = 'https://example.com/have.jpg';
      it.manualTracks = [{ trackNumber: 1, title: 'Mi vida rosa' }, { trackNumber: 2, title: 'Otra' }]; it.hasManualTracklist = true; delete st.trackCache[app('artKey')(it)];
      st.afOrder = { lengths: ['sp', 'mb'], date: ['mb'], label: ['dc', 'mb'], cover: ['mb'] };
      fetchers.mb = async () => { asked.push('mb'); return { date: '1990-05-14', label: 'Hispavox', cover: 'https://example.com/mb.jpg', tracks: [{ title: 'Mi vida rosa', durationMs: 201000 }, { title: 'Otra', durationMs: 0 }] }; };
      fetchers.sp = async () => { asked.push('sp'); return { err: 'Spotify isn’t connected' }; };
      fetchers.dc = async () => { asked.push('dc'); return { err: 'Not found' }; };
      const r = await app('afFill')(it);
      eq([it.releaseDate, it.label, it.cover, it.manualTracks.map(t => t.durationMs || 0), r.missing, [...new Set(asked)].sort()],
         ['1990-05-14', 'Hispavox', 'https://example.com/have.jpg', [201000, 0], ['1 song length'], ['dc', 'mb', 'sp']]);
      eq(app('afLeftAll')().some(e => e.title === it.title), true);
    } finally {
      Object.assign(fetchers, keep); st.afOrder = was[0];
      Object.assign(it, { label: saved.label, releaseDate: saved.releaseDate, cover: saved.cover, manualTracks: saved.mt, hasManualTracklist: saved.hm });
      if (was[1] === null) app(`localStorage.removeItem('crate_fill_left_v1')`); else app(`localStorage.setItem('crate_fill_left_v1', ${JSON.stringify(was[1])})`);
    }
  });
  test('Match songs waits for a release still to be filled', () => {
    const st = app('state'), af = app('af'), it = st.raw[0], was = [st.afOn, af.pending.slice()];
    try { st.afOn = true; af.pending.push({ k: app('afKey')(it), at: Date.now() }); const held = app('afPending')(it); af.pending.length = 0; eq([held, app('afPending')(it)], [true, false]); }
    finally { st.afOn = was[0]; af.pending.splice(0, af.pending.length, ...was[1]); }
  });
});

suite('Match songs and a tracklist still to come from RYM', () => {
  test('a release whose first RYM update is still to come waits for its tracklist instead of being "No tracklist"', () => {
    const st = app('state'), out = app('rymOutState'), q = app('bmTlQ'), it = st.raw[0], was = [out.present, it.rymUpdated, it.rymLink];
    try {
      out.present = true; it.rymUpdated = ''; it.rymLink = 'https://rateyourmusic.com/release/single/los-romeos/mi-vida-rosa/';
      const waits = app('bmTlFromRym')(it);
      it.rymUpdated = '2026-11-05T00:00:00Z'; const after = app('bmTlFromRym')(it);
      out.present = false; it.rymUpdated = ''; const noAddon = app('bmTlFromRym')(it);
      eq([waits, after, noAddon], [true, false, false]);
    } finally { clearTimeout(q.timer); q.items.length = 0; [out.present, it.rymUpdated, it.rymLink] = was; }
  });
});

suite('Match releases with no song links', () => {
  test('a release counts when none of its songs has a link from the services ticked, wherever the link is kept', () => {
    const f = app('bmNoLinks'), yt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', sp = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
    const none = { manualTracks: [{ title: 'a' }], trackData: { 1: { rating: 4 } } };
    const ytOnSong = { manualTracks: [{ title: 'a', youtubeLink: yt }] }, spInData = { trackData: { 2: { spotifyLink: sp } } };
    eq([f(none, ['spotify', 'youtube']), f(ytOnSong, ['spotify', 'youtube']), f(ytOnSong, ['spotify']), f(spInData, ['youtube']), f(spInData, ['spotify'])], [true, false, true, true, false]);
  });
});

suite('Match songs: narrowing the releases down', () => {
  test('type, years, date added, tracklist, ratings and words each leave out what does not fit', () => {
    const pass = app('bmRfPass'), f0 = app('bmRf0'), f = (o) => Object.assign(f0(), o);
    const now = new Date().toISOString(), old = '2019-01-01T00:00:00Z';
    const a = { artist: 'Slowdive', title: 'Souvlaki', type: 'Album', releaseDate: '1993-05-17', genre: 'Shoegaze', dateAdded: now, rating: 4.5, rymRating: 3.9, manualTracks: [{ title: 'x' }] };
    const b = { artist: 'Ride', title: 'Twisterella', type: 'EP', releaseDate: '1992', genre: 'Dream Pop', dateAdded: old, rating: 0, rymRating: 3.2 };
    const both = (o) => [pass(a, f(o)), pass(b, f(o))];
    eq(both({}), [true, true]);
    eq(both({ types: ['EP'] }), [false, true]);
    eq(both({ from: '1993' }), [true, false]);
    eq(both({ to: '1992' }), [false, true]);
    eq(both({ added: '30' }), [true, false]);
    eq(both({ added: 'old' }), [false, true]);
    eq(both({ rated: 'yes' }), [true, false]);
    eq(both({ rym: '3.5' }), [true, false]);
    eq(both({ text: 'dream ride' }), [false, true]);
    eq(both({ text: 'SHOEGAZE' }), [true, false]);
  });
});

suite('Stats bar', () => {
  test('counts releases, artists, songs and their length, years and ratings; says what is missing', () => {
    const fig = app('csFigures'), line = app('csLine');
    const a = { artist: 'Slowdive', title: 'Souvlaki', releaseDate: '1993-05-17', rating: 4, rymRating: 3.8, hasManualTracklist: true, manualTracks: [{ title: 'a', trackNumber: 1, durationMs: 60 * 60000 }, { title: 'b', trackNumber: 2, durationMs: 0 }] };
    const b = { artist: 'slowdive ', title: 'Pygmalion', releaseDate: '1995', rating: 0, rymRating: 3.6, hasManualTracklist: true, manualTracks: [{ title: 'c', trackNumber: 1, durationMs: 30 * 60000 }] };
    const c = { artist: 'Ride', title: 'Nowhere', releaseDate: '1990', rating: 5, rymRating: 0, link: 'https://example.com/no-tracklist-' + Math.random() };
    const f = fig([a, b, c]);
    eq([f.n, f.artists, f.songs, f.ms, f.withTl, f.noLen, f.y0, f.y1, f.rated, f.ratingSum, f.rym], [3, 2, 3, 90 * 60000, 2, 1, 1990, 1995, 2, 9, 2]);
    const t = line(f, true).replace(/<[^>]+>/g, '');
    eq(t, '3 releases · 2 artists · 3 songs (from 2 with a tracklist) · 1 h 30 min + 1 song with no length · 1990–1995 · your rating 4.5 avg (2 rated) · RYM 3.70 avg');
  });
});

suite('Match songs: YouTube song by song', () => {
  test('follows the add-on as YouTube runs until you tick or untick it yourself', () => {
    const on = app('bmYtSongsOn'), viaAddon = app('ytUseAddon')();
    eq([on({ ytSongs: false }), on({ ytSongs: true }), on({ ytSongs: false, ytSongsSet: true }), on({ ytSongs: true, ytSongsSet: true })], [viaAddon, viaAddon, false, true]);
  });
});

suite('Bold songs (RYM)', () => {
  test('a list that marks some songs bold sets and clears the mark; one that marks none changes nothing', async () => {
    const apply = app('tlApplyTrackRatings'), isBold = app('rymTrackIsBold');
    const item = { row: 999999, artist: 'King Crimson', title: 'Red', trackData: { 2: { rymBold: true }, 3: { rating: 4 } } };
    const marks = () => [1, 2, 3].map(n => isBold(item, { trackNumber: n }));
    await apply(item, [{ trackNumber: 1, rymRating: 0, rymBold: false }, { trackNumber: 2, rymRating: 0, rymBold: false }, { trackNumber: 3, rymRating: 0, rymBold: false }], true);
    eq(marks(), [false, true, false]);          // no song bold in the list: nothing is cleared
    await apply(item, [{ trackNumber: 1, rymRating: 0, rymBold: true }, { trackNumber: 2, rymRating: 0, rymBold: false }, { trackNumber: 3, rymRating: 0, rymBold: false }], true);
    eq(marks(), [true, false, false]);
    eq(item.trackData[3].rating, 4);
    await apply(item, [{ trackNumber: 1, rymRating: 0, rymBold: false, rymBoldKnown: true }], true);
    eq(marks(), [false, false, false]);
    eq([app('trackColumnVal')('rymTrackBold', { trackData: { 5: { rymBold: true } } }, { trackNumber: 5 }), app('trackColumnVal')('rymTrackBold', { trackData: {} }, { trackNumber: 5 })], ['Bold', '']);
  });
});

suite('Bold releases (RYM)', () => {
  test('a list page’s bold mark is taken (an older sighting can fill it in); it outranks the rank guess, which stands where no page told', () => {
    const plan = app('rymPlan'), index = app('rymBuildIndex'), isBold = app('rymReleaseIsBold'), S = app('state');
    const a = { row: 2, artist: 'A', title: 'One', rymLink: 'https://rateyourmusic.com/release/album/a/one/', rymRank: 50 };
    const b = { row: 3, artist: 'B', title: 'Two', rymLink: 'https://rateyourmusic.com/release/album/b/two/', rymBoldMark: true };
    const c = { row: 4, artist: 'C', title: 'Three', rymLink: 'https://rateyourmusic.com/release/album/c/three/' };
    const ix = index([a, b, c], (x, y) => x + '|' + y), path = (it) => '/release/album/' + it.rymLink.split('/album/')[1];
    const out = plan(ix, [{ p: path(a), a: 3.5, b: 0, t: 2 }, { p: path(b), a: 3.9, b: 1, t: 2 }, { p: path(c), a: 3.1, t: 5 }, { p: path(c), a: 3.0, b: 1, t: 1 }], 10);
    eq(out.bolds.map(x => [x.item.title, x.bold]), [['One', false], ['Three', true]]);          // Two already has it
    const was = [S.rymBold, S.rymBoldRank]; S.rymBold = true; S.rymBoldRank = 7500;
    try {
      const d = { rymRank: 50 }, e = { rymRank: 50, rymBoldMark: false }, f = { rymRank: 90000, rymBoldMark: true }, g = { rymRank: 90000 };
      eq([d, e, f, g].map(isBold), [true, false, true, false]);
      S.rymBold = false; eq(isBold(f), false);
    } finally { S.rymBold = was[0]; S.rymBoldRank = was[1]; }
  });
});

suite('How far through the release', () => {
  const T = (n, name, s, link) => ({ trackNumber: n, trackName: name, trackTimeMillis: s * 1000, youtubeLink: link || '' });
  test('the songs before it plus where this one is, out of the whole', () => {
    const f = app('releaseProgress'), tracks = [T(1, 'Sparkle', 300), T(2, 'Love Talkin’', 240), T(3, 'Ride on Time', 360)];
    const p = f(tracks, 'Love Talkin’', 60000);
    eq([p.index, p.count, p.elapsedMs, p.totalMs], [1, 3, 360000, 900000]);
    eq(p.cuts.map(c => +c.toFixed(3)), [0.333, 0.6]);
    eq(f(tracks, 'Ride On Time - 2002 Remaster', 0).index, 2);                 // a streaming service's name for it
    eq(f(tracks, 'Something Else', 0), null);                                  // not one of the release's songs
    eq(f([T(1, 'A', 0), T(2, 'B', 100)], 'B', 5000).elapsedMs, null);          // a length before it unknown
  });
  test('a full-release video played whole: the song by its saved times', () => {
    const f = app('releaseProgressInVideo'), v = 'https://www.youtube.com/watch?v=abcdefghijk';
    const tracks = [T(1, 'A', 100, v + '&t=10&end=110'), T(2, 'B', 100, v + '&t=110&end=210'), T(3, 'C', 100, v + '&t=212&end=312')];
    const p = f(tracks, 'abcdefghijk', 150);
    eq([p.index, p.count, p.elapsedMs, p.totalMs], [1, 3, 140000, 302000]);
    eq(f(tracks, 'zzzzzzzzzzz', 150), null);
  });
});

suite('Full-release video: times from song lengths', () => {
  test('songs back to back after the intro; one after a song with no length is not placed', () => {
    const f = app('ytTimesFromLengths');
    eq(f([180, 200, 95], 0), [{ start: 0, end: 180 }, { start: 180, end: 380 }, { start: 380, end: 475 }]);
    eq(f([180, 200], 12), [{ start: 12, end: 192 }, { start: 192, end: 392 }]);
    eq(f([180, 0, 95], 5), [{ start: 5, end: 185 }, null, null]);
  });
  test('the timeline: one handle where a song ends as the next begins; dragging moves both, and with the switch on the later songs too', () => {
    const H = app('fvTlHandles'), M = app('fvTlMove');
    const secs = [{ start: 10, end: 100 }, { start: 100, end: 200 }, { start: 205, end: 300 }];
    eq(H(secs).map(h => h.key), ['s:0', 'b:0', 'e:1', 's:2', 'e:2']);
    eq(M(secs, 'b:0', 5, false), [{ start: 10, end: 105 }, { start: 105, end: 200 }, { start: 205, end: 300 }]);
    eq(M(secs, 'b:0', 5, true), [{ start: 10, end: 105 }, { start: 105, end: 205 }, { start: 210, end: 305 }]);
    eq(M(secs, 's:2', -3, false)[2], { start: 202, end: 300 });
    eq(M(secs, 's:0', -50, false)[0], { start: 0, end: 100 });                  // not below 0:00
    eq(M(secs, 'b:0', 500, false)[1], { start: 199, end: 200 });               // song 2 keeps at least a second
    eq(M([{ start: 0, end: NaN }], 's:0', 4, true)[0].start, 4);               // an end not set stays unset
  });
  test('a video a little longer than the songs: the difference is spread and the last song ends with the video', () => {
    const f = app('ytTimesFromLengths');
    const got = f([1700, 1700, 1700], 0, 5133);                      // 1:25:00 of songs in a 1:25:33 video
    eq(got[0].start, 0); eq(got[2].end, 5133); eq(got[1].start, got[0].end); ok(got[1].start > 1700 && got[1].start < 1733);
    eq(f([100, 100], 10, 214), [{ start: 10, end: 112 }, { start: 112, end: 214 }]);          // after an intro: the room is the video less the intro
    eq(f([180, 200], 0, 900), [{ start: 0, end: 180 }, { start: 180, end: 380 }]);           // far longer (other songs, a second disc): back to back
    eq(f([180, 0], 0, 181), [{ start: 0, end: 180 }, null]);                                // a length missing: back to back
  });
});

suite('Search: a release’s songs under a search', () => {
  test('words the release itself has don’t narrow its songs; a track: term or a word only songs have does', () => {
    const S = app('state'), f = app('filterTracksBySearch'), was = S.query;
    const item = { artist: 'The Jesus and Mary Chain', title: 'I.C.A. 29.12.84', releaseDate: '1985', genre: 'Noise Pop' };
    const tracks = ['Vegetable Man', 'Taste of Cindy', 'Never Understand', 'Just Like Honey'].map((n, i) => ({ trackNumber: i + 1, trackName: n }));
    const names = (q) => { S.query = q; return f(item, tracks).map(t => t.trackName); };
    try {
      eq(names('artist:the jesus and m').length, 4);
      eq(names('jesus honey'), ['Just Like Honey']);
      eq(names('track:cindy'), ['Taste of Cindy']);
      eq(names('nothing-like-this').length, 4);          // nothing matches: the whole list rather than none
    } finally { S.query = was; }
  });
});

suite('Unlinked-song flags and a full-release video', () => {
  test('a release with a full-release video has no red flags; one without still does', () => {
    const gaps = app('songLinkGaps'), full = app('releaseFullVideoId'), V = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const mk = (o) => Object.assign({ row: 999998, artist: 'A', title: 'B', hasManualTracklist: true, trackData: {}, manualTracks: [{ trackNumber: 1, title: 'One', youtubeLink: '' }, { trackNumber: 2, title: 'Two', youtubeLink: '' }, { trackNumber: 3, title: 'Three', youtubeLink: '' }] }, o);
    const none = mk({}), ownLink = mk({ link: V }), timed = mk({ trackData: { 2: { youtubeLink: V + '&t=200&end=400' } } }), oneSong = mk({ trackData: { 2: { youtubeLink: V } } });
    eq([!!gaps(none), !!gaps(ownLink), !!gaps(timed), !!gaps(oneSong)], [true, false, false, true]);
    eq([full(ownLink), full(timed), full(oneSong)], ['dQw4w9WgXcQ', 'dQw4w9WgXcQ', '']);
  });
});

suite('Genres: Scenes & Movements', () => {
  test('one group however it is spelled, holding only Scenes and Movements', () => {
    const S = app('state'), tree = app('buildGenreTree');
    const tax = { 'dunedin sound': { label: 'Dunedin Sound', parents: ['Scenes & Movements'] }, 'the sound of young scotland': { label: 'The Sound of Young Scotland', parents: ['Scenes & Movements'] } };
    const rels = [{ row: 't1', artist: 'The Clean', title: 'X', genre: 'Jangle Pop, Dunedin Sound' }, { row: 't2', artist: 'Orange Juice', title: 'Y', genre: 'Jangle Pop', scene: 'The Sound of Young Scotland' }, { row: 't3', artist: 'Z', title: 'Z', genre: 'Indie Pop', movement: 'C86' }];
    const was = S.raw; S.raw = was.concat(rels); app('sceneKeysCache = null; sceneKnownCache = null; sceneGroupCache = null');          // (worked out at most every two seconds: start afresh)
    let rows; try { rows = tree(rels, tax).filter(r => /scene|movement|dunedin|scotland|c86/i.test(r.label)).map(r => r.depth + ' ' + r.label); } finally { S.raw = was; app('sceneKeysCache = null; sceneKnownCache = null'); }
    eq(rows.filter(r => /^\d+ Scenes (&|and) Movements$/.test(r)), ['0 Scenes & Movements']);
    eq(rows.filter(r => /Dunedin|Scotland|C86/.test(r)), ['2 C86', '2 Dunedin Sound', '2 The Sound of Young Scotland']);
  });
});

suite('Full-release video: finding the video', () => {
  test('a full-album upload of about the right length ranks above a song video and a longer rip', () => {
    const f = app('fvScoreVideo'), item = { artist: 'The Jesus and Mary Chain', title: 'Psychocandy' }, total = 493000;
    const full = f(item, total, { title: 'The Jesus And Mary Chain – Psychocandy (Full Album)', channel: 'Fan', durationMs: 505000 });
    const rip = f(item, total, { title: 'Psychocandy vinyl rip', channel: 'Vinyl', durationMs: 640000 });
    const song = f(item, total, { title: 'The Jesus and Mary Chain - Just Like Honey', channel: 'JAMC', durationMs: 190000 });
    ok(full.score > rip.score && rip.score > song.score);
    eq([full.diffMs, f(item, 0, { title: 'x', durationMs: 5000 }).diffMs], [12000, 0]);
  });
  test('a reaction, a cover, a slowed or live version scores far lower (unless the release is one); the artist’s Topic channel and the year count for it', () => {
    const f = app('fvScoreVideo'), item = { artist: 'Slowdive', title: 'Souvlaki', releaseDate: '1993-05-17' }, total = 2400000, at = (title, channel) => f(item, total, { title, channel: channel || 'Fan', durationMs: 2600000 }).score;
    const plain = at('Slowdive - Souvlaki (Full Album)');
    ok(at('Slowdive - Souvlaki (Full Album) REACTION') < plain - 25); ok(at('Slowdive - Souvlaki full album slowed + reverb') < plain - 25); ok(at('Slowdive - Souvlaki (Full Album) live 1994') < plain - 20);
    ok(at('Slowdive - Souvlaki (Full Album)', 'Slowdive - Topic') > plain); ok(at('Slowdive - Souvlaki (1993) Full Album') > plain);
    const liveItem = { artist: 'Slowdive', title: 'Live at Brixton' };
    eq(f(liveItem, total, { title: 'Slowdive - Live at Brixton (Full Album)', durationMs: 2400000 }).score >= 90, true);
  });
});

suite('Full-release video: timing the songs', () => {
  const titles = ['Alison', 'Machine Gun', '40 Days', 'Sing'], lens = [230, 265, 194, 289];
  const T = (info) => app('ytTimingFrom')(titles, lens, info);
  test('the video’s chapters time each song, the last ending where the video does; an extra intro chapter is passed over', () => {
    const t = T({ durationMs: 1010000, chapters: [{ start: 0, title: 'Intro' }, { start: 12, title: '1. Alison' }, { start: 245, title: 'Machine Gun' }, { start: 512, title: '40 Days' }, { start: 708, title: 'Sing' }] });
    eq([t.how, t.placed, t.named, t.agree], ['chapters', 4, 4, true]);
    eq(t.times, [{ start: 12, end: 245 }, { start: 245, end: 512 }, { start: 512, end: 708 }, { start: 708, end: 1010 }]);
  });
  test('else the times in the description; chapters of something else (too few songs in them) are not used', () => {
    const t = T({ durationMs: 1000000, chapters: [{ start: 0, title: 'Part one' }, { start: 400, title: 'Part two' }, { start: 800, title: 'Part three' }], description: 'Tracklist:\n00:00 Alison\n03:50 Machine Gun\n08:15 40 Days\n11:29 Sing\nThanks for listening' });
    eq([t.how, t.placed, t.agree], ['description', 4, true]);
    eq(t.times.map(x => x.start), [0, 230, 495, 689]); eq(t.times[3].end, 1000);
  });
  test('no chapters: song lengths stretched to the video’s length when within 4%, else back to back', () => {
    const sum = lens.reduce((a, b) => a + b, 0);
    const s = T({ durationMs: Math.round(sum * 1.02) * 1000 });
    eq([s.how, s.times[0].start, s.times[3].end], ['scaled', 0, Math.round(sum * 1.02)]); ok(s.times[1].start > 230);
    const b = T({ durationMs: (sum + 200) * 1000 });
    eq([b.how, b.times[1].start, b.agree], ['lengths', 230, false]);
    eq(T(null).how, 'lengths');
  });
  test('chapters that name the songs make a video sure even when its length is off; candidates say how they were timed', () => {
    const sure = app('ytFullVideoConfident'), t = T({ durationMs: 1010000, chapters: [{ start: 0, title: 'Alison' }, { start: 230, title: 'Machine Gun' }, { start: 495, title: '40 Days' }, { start: 689, title: 'Sing' }] });
    eq([sure({ score: 62, titleFit: 1, durationMs: 1010000, diffMs: 32000, timing: t }, 978000), sure({ score: 62, titleFit: 1, durationMs: 1010000, diffMs: 32000 }, 978000)], [true, false]);
    const songs = titles.map((title, idx) => ({ idx, title, durationMs: lens[idx] * 1000 }));
    const out = app('bmFullVideoCands')(songs, { id: 'ccccccccccc', title: 'Souvlaki', score: 62, diffMs: 32000, timing: t }, true);
    eq([out[3][0].link, out[3][0].reasons[1]], ['https://www.youtube.com/watch?v=ccccccccccc&t=689&end=1010', 'timed by the video’s chapters']);
  });
});

suite('Match songs: a full-release video', () => {
  test('each song gets its part of the video, back to back from its length; confident only when the length fits', () => {
    const cands = app('bmFullVideoCands'), sure = app('ytFullVideoConfident');
    const songs = [{ idx: 0, durationMs: 183000 }, { idx: 1, durationMs: 136000 }, { idx: 2, durationMs: 174000 }];
    const out = cands(songs, { id: 'bbbbbbbbbbb', title: 'Psychocandy (Full Album)', channel: 'Fan', score: 90, diffMs: 4000 }, true);
    eq([0, 1, 2].map(i => out[i][0].link), ['https://www.youtube.com/watch?v=bbbbbbbbbbb&end=183', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=183&end=319', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=319&end=493']);
    eq([out[1][0].band, out[1][0].source], ['confident', 'fullvideo']);
    eq([sure({ score: 90, durationMs: 497000, diffMs: 4000 }, 493000), sure({ score: 90, durationMs: 600000, diffMs: 107000 }, 493000), sure({ score: 60, durationMs: 493000, diffMs: 0 }, 493000)], [true, false, false]);
  });
});

suite('Crate Galaxy', () => {
  const mk = (row, artist, title, genre, extra) => Object.assign({ row, artist, title, genre, genre2: '', releaseDate: '1990', rymDescriptors: '', scene: '', movement: '', label: '' }, extra || {});
  test('a family is the top of a genre’s parents (a loop in the taxonomy stops); a release’s tokens include its parents, fainter', () => {
    const fam = app('gxFamily'), tok = app('gxTokens');
    const tax = { shoegaze: { label: 'Shoegaze', parents: ['Dream Pop'] }, 'dream pop': { label: 'Dream Pop', parents: ['Pop'] }, pop: { label: 'Pop', parents: [] }, a: { label: 'A', parents: ['B'] }, b: { label: 'B', parents: ['A'] } };
    eq([fam('Shoegaze', tax), fam('Pop', tax), fam('Nothing', tax), fam('', tax)], ['Pop', 'Pop', 'Nothing', '']);
    eq(['A', 'B'].includes(fam('A', tax)), true);
    const t = tok(mk(2, 'My Bloody Valentine', 'Loveless', 'Shoegaze', { rymDescriptors: 'noisy, dense', label: 'Creation' }), tax);
    eq([t['g:shoegaze'] > t['g:dream pop'], t['g:dream pop'] > t['g:pop'], !!t['d:noisy'], !!t['l:creation'], !!t['y:1990'], !!t['a:my bloody valentine']], [true, true, true, true, true, true]);
  });
  test('no group is left an island: one artist’s albums that share only common genres still link out, so a wormhole always exists', () => {
    const build = app('gxBuild'), path = app('gxPath'), items = [];
    for (let a = 0; a < 60; a++) for (let t = 0; t < 3; t++) items.push(mk(items.length + 2, 'Artist ' + a, 'T' + t, ['Rock', 'Jazz', 'Folk'][a % 3], { genre2: ['Pop', 'Rock', 'Jazz'][(a + t) % 3] }));
    const g = build(items, {});
    const comp = new Set([0]); for (const q = [0]; q.length;) g.nbr[q.pop()].forEach(({ j }) => { if (!comp.has(j)) { comp.add(j); q.push(j); } });
    eq(comp.size, items.length);
    eq(path(g, 0, items.length - 1).length > 1, true);
  });
  test('neighbours share the most, rare things count for more; a wormhole steps through what joins two far releases', () => {
    const build = app('gxBuild'), path = app('gxPath');
    const items = [
      mk(2, 'A', 'a1', 'Shoegaze', { rymDescriptors: 'noisy' }), mk(3, 'B', 'b1', 'Shoegaze', { rymDescriptors: 'noisy' }),
      mk(4, 'C', 'c1', 'Shoegaze, Ambient'), mk(5, 'D', 'd1', 'Ambient', { rymDescriptors: 'calm' }), mk(6, 'E', 'e1', 'Ambient', { rymDescriptors: 'calm' }),
      mk(7, 'F', 'f1', 'Polka', { releaseDate: '1950' })
    ];
    const g = build(items, {}, 4);
    eq(g.nbr[0][0].j, 1);                                             // a1's closest is b1: same genre and descriptor
    eq([g.nbr[5].length, g.nbr[5][0].s <= 0.01, g.pieces > 1], [1, true, true]);          // polka from the fifties shares nothing: one faint link joins it to the rest
    eq(g.nbr.every((l, i) => l.every(({ j }) => g.nbr[j].some(x => x.j === i))), true);          // links go both ways
    const p = path(g, 0, 4);
    eq([p[0], p[p.length - 1], p.includes(2)], [0, 4, true]);          // through the shoegaze-and-ambient one
    eq([path(g, 0, 5).pop(), path(g, 3, 3), path(g, 0, 99)], [5, [3], []]);
  });
  test('the layout settles with releases that share more closer together than ones that share nothing', () => {
    const build = app('gxBuild'), fams = app('gxFamilies'), init = app('gxLayoutInit'), step = app('gxLayoutStep');
    const items = []; for (let i = 0; i < 40; i++) items.push(mk(i + 2, 'Art' + i, 'T' + i, i < 20 ? 'Techno' : 'Bluegrass', { rymDescriptors: i < 20 ? 'hypnotic' : 'acoustic' }));
    const g = build(items, {}), F = fams(items, {}), L = init(items, F);
    let n = 0; while (!step(L, g, 20) && n++ < 100);
    eq(L.iter, L.total);
    const d = (a, b) => Math.hypot(L.pos[2 * a] - L.pos[2 * b], L.pos[2 * a + 1] - L.pos[2 * b + 1]);
    let same = 0, diff = 0, ns = 0, nd = 0; for (let a = 0; a < 40; a++) for (let b = a + 1; b < 40; b++) { if ((a < 20) === (b < 20)) { same += d(a, b); ns++; } else { diff += d(a, b); nd++; } }
    eq(same / ns < diff / nd * 0.7, true);
    eq([...L.pos].every(Number.isFinite), true);
  });
});

suite('Taste Engine', () => {
  test('conjugate gradients solve the ridge exactly (a small case worked by hand)', () => {
    const fit = app('teFit'), row = (c, v) => ({ c: Int32Array.from(c), v: Float64Array.from(v) });
    // X = [[1,1],[1,0],[1,2]], y = [3,1,5], λ = 1 on the second column only: (XᵀX + diag(0,1)) w = Xᵀy -> [[3,3],[3,6]] w = [9,13] -> w = [5/3, 4/3]
    const w = fit([row([0, 1], [1, 1]), row([0], [1]), row([0, 1], [1, 2])], Float64Array.from([3, 1, 5]), 1, Float64Array.from([0, 1]), 2);
    eq([w[0].toFixed(6), w[1].toFixed(6)], [(5 / 3).toFixed(6), (4 / 3).toFixed(6)]);
  });
  test('it finds a taste it was given: loves one genre, dislikes another, beats guessing the average, and is least sure of what it never saw', () => {
    const train = app('teTrain'), why = app('teWhy'), picks = app('tePicks'), r = app('gxRand')(11), items = [];
    const genres = ['Shoegaze', 'Polka', 'Jazz', 'Techno', 'Folk'], base = { Shoegaze: 4.6, Polka: 1.4, Jazz: 3, Techno: 3, Folk: 3 };
    for (let i = 0; i < 150; i++) { const g = genres[i % 5]; items.push({ row: i + 2, artist: 'A' + (i % 37), title: 'T' + i, genre: g, genre2: '', releaseDate: String(1970 + (i % 40)), rymRating: 0, rymVotes: 0, rating: Math.max(1, Math.min(5, Math.round(base[g] + (r() - 0.5)))) }); }
    const unseen = { row: 999, artist: 'Z', title: 'Zz', genre: 'Gamelan', genre2: '', releaseDate: '1960', rymRating: 0, rymVotes: 0, rating: 0 };
    const shoe = { row: 998, artist: 'Y', title: 'Yy', genre: 'Shoegaze', genre2: '', releaseDate: '1991', rymRating: 0, rymVotes: 0, rating: 0 };
    const m = train(items.concat([unseen, shoe]), {}, { boot: 10 });
    const W = (n) => m.w[m.S.cols.get(n)];
    eq([W('g:shoegaze') > 0.8, W('g:polka') < -0.8], [true, true]);
    eq(m.cv.mae < m.cv.maeMean * 0.6, true);
    eq(m.pred.get(shoe).mean > 4, true);
    eq(why(m, shoe, 1)[0].name, 'g:shoegaze');
    eq(m.pred.get(unseen).sd >= 0, true);
    const p = picks(m, [unseen, shoe], 0, 2); eq(p[0].it, shoe);
  });
  test('too few ratings: it says so instead of guessing', () => {
    const m = app('teTrain')([{ row: 2, artist: 'a', title: 'b', genre: 'Rock', rating: 4 }], {});
    eq([m.tooFew, m.rated], [true, 1]);
  });
});

suite('Ask your crate', () => {
  const tax = { shoegaze: { label: 'Shoegaze', parents: ['Alternative Rock'] }, 'dream pop': { label: 'Dream Pop', parents: ['Alternative Rock'] }, 'alternative rock': { label: 'Alternative Rock', parents: ['Rock'] }, rock: { label: 'Rock', parents: [] }, 'post-punk': { label: 'Post-Punk', parents: ['Rock'] }, 'hard bop': { label: 'Hard Bop', parents: ['Jazz'] }, jazz: { label: 'Jazz', parents: [] } };
  const R = (row, artist, title, o) => Object.assign({ row, artist, title, type: 'Album', genre: '', genre2: '', releaseDate: '', label: '', rymDescriptors: '', region: '', location: '', rating: 0, rymRating: 0, rymVotes: 0, dateAdded: '', scene: '', movement: '' }, o);
  const items = [
    R(2, 'My Bloody Valentine', 'Loveless', { genre: 'Shoegaze', releaseDate: '1991-11-04', label: 'Creation', rating: 5, rymRating: 4.1, rymVotes: 60000, region: 'Ireland', rymDescriptors: 'noisy, dense, ethereal', dateAdded: '2024-02-01' }),
    R(3, 'Slowdive', 'Souvlaki', { genre: 'Shoegaze, Dream Pop', releaseDate: '1993-05-17', label: 'Creation', rating: 4, rymRating: 3.9, rymVotes: 30000, region: 'United Kingdom', location: 'Reading, England', dateAdded: '2026-10-20' }),
    R(4, 'Lush', 'Spooky', { genre: 'Dream Pop', releaseDate: '1992', label: '4AD', rating: 3, rymRating: 3.4, rymVotes: 4000, region: 'United Kingdom', dateAdded: '2025-06-01' }),
    R(5, 'Joy Division', 'Closer', { genre: 'Post-Punk', releaseDate: '1980-07-18', label: 'Factory', rating: 4.5, rymRating: 4.0, rymVotes: 50000, region: 'United Kingdom', rymDescriptors: 'dark, melancholic', dateAdded: '2023-01-01' }),
    R(6, 'Art Blakey', 'Moanin’', { genre: 'Hard Bop', releaseDate: '1959', label: 'Blue Note', rating: 0, rymRating: 3.95, rymVotes: 12000, region: 'United States', dateAdded: '2026-11-01' }),
    R(7, 'Cornelius', 'Fantasma', { genre: 'Shibuya-kei', releaseDate: '1997', label: 'Trattoria', rating: 0, rymRating: 3.7, rymVotes: 8000, region: 'Japan', dateAdded: '2026-09-01' }),
    R(8, 'Slowdive', 'Morningrise', { genre: 'Shoegaze', releaseDate: '1991', label: 'Creation', rating: 0, rymRating: 3.6, rymVotes: 400, region: 'United Kingdom', type: 'EP', dateAdded: '2026-08-01' })
  ];
  const plays = [{ artist: 'My Bloody Valentine', title: 'Loveless', n: 12, date: '2026-10-30' }, { artist: 'Slowdive', title: 'Souvlaki', n: 2, date: '2024-03-01' }, { artist: 'Joy Division', title: 'Closer', n: 1, date: '2026-01-10' }];
  let ctx; const ask = (t) => { ctx = ctx || app('aqContext')(items, tax, plays, new Date('2026-11-07T12:00:00Z')); const q = app('aqParse')(t, ctx); return { q, t: app('aqRun')(items, q, ctx).map(x => x.title).sort() }; };
  const got = (t) => ask(t).t;
  test('genres take in everything under them; descriptors, labels, places, artists and titles are known by name', () => {
    eq(got('shoegaze'), ['Loveless', 'Morningrise', 'Souvlaki']);
    eq(got('alternative rock'), ['Loveless', 'Morningrise', 'Souvlaki', 'Spooky']);
    eq(got('rock not shoegaze'), ['Closer', 'Spooky']);
    eq(got('shoegaze or post-punk'), ['Closer', 'Loveless', 'Morningrise', 'Souvlaki']);
    eq(got('melancholic'), ['Closer']);
    eq(got('on creation'), ['Loveless', 'Morningrise', 'Souvlaki']);
    eq(got('dream pop not on Creation'), ['Spooky']);
    eq(got('from japan'), ['Fantasma']); eq(got('japanese'), ['Fantasma']);
    eq(got('british post punk'), ['Closer']);
    eq(got('by slowdive'), ['Morningrise', 'Souvlaki']);
    eq(got('slowdive'), ['Morningrise', 'Souvlaki']);
    eq(got('loveless'), ['Loveless']);
  });
  test('years and decades: "90s", "early 90s", "1990-1992", between, before, since, "from the 50s", "1990s"', () => {
    eq(got('90s'), ['Fantasma', 'Loveless', 'Morningrise', 'Souvlaki', 'Spooky']);
    eq(got('early 90s'), ['Loveless', 'Morningrise', 'Souvlaki', 'Spooky']);
    eq(got('late 90s'), ['Fantasma']);
    eq(got('1990-1992'), ['Loveless', 'Morningrise', 'Spooky']);
    eq(got('released between 1991 and 1992'), ['Loveless', 'Morningrise', 'Spooky']);
    eq(got('before 1981'), ['Closer', 'Moanin’']);
    eq(got('since 1993'), ['Fantasma', 'Souvlaki']);
    eq(got('from the 50s'), ['Moanin’']);
    eq(got('1990s shoegaze'), ['Loveless', 'Morningrise', 'Souvlaki']);
  });
  test('your ratings and RYM’s: 4+, above, stars, unrated, favourites, on rym, obscure, a range', () => {
    eq(got('rated 4+'), ['Closer', 'Loveless', 'Souvlaki']);
    eq(got('i rated above 4'), ['Closer', 'Loveless']);
    eq(got('5 stars'), ['Loveless']);
    eq(got('unrated'), ['Fantasma', 'Moanin’', 'Morningrise']);
    eq(got('not rated'), ['Fantasma', 'Moanin’', 'Morningrise']);
    eq(got('favourites'), ['Closer', 'Loveless']);
    eq(got('rated 3.95+ on rym'), ['Closer', 'Loveless', 'Moanin’']);
    eq(got('rym 3.9 or more'), ['Closer', 'Loveless', 'Moanin’', 'Souvlaki']);
    eq(got('obscure shoegaze'), ['Morningrise']);
    eq(got('rated 3-4'), ['Souvlaki', 'Spooky']);
  });
  test('plays and when added: not played in a year, never played, more than 5 times, this year, the last 3 months', () => {
    eq(got("haven't played in a year"), ['Fantasma', 'Moanin’', 'Morningrise', 'Souvlaki', 'Spooky']);
    eq(got('never played'), ['Fantasma', 'Moanin’', 'Morningrise', 'Spooky']);
    eq(got('played more than 5 times'), ['Loveless']);
    eq(got('played this year'), ['Closer', 'Loveless']);
    eq(got('not played since 2025'), ['Fantasma', 'Moanin’', 'Morningrise', 'Souvlaki', 'Spooky']);
    eq(got('added this year'), ['Fantasma', 'Moanin’', 'Morningrise', 'Souvlaki']);
    eq(got('added in the last 3 months'), ['Fantasma', 'Moanin’', 'Souvlaki']);
    eq(got('added before 2024'), ['Closer']);
  });
  test('the whole sentence at once, types, sorting and counts; what it couldn’t read is said, with the nearest word', () => {
    eq(got("90s shoegaze I rated 4+ and haven't played in a year, not on Creation"), []);
    eq(got("90s shoegaze I rated 4+ and haven't played in a year"), ['Souvlaki']);
    eq(got('eps'), ['Morningrise']); eq(got('shoegaze albums'), ['Loveless', 'Souvlaki']);
    const best = ask('best 2'); eq(app('aqRun')(items, best.q, ctx).map(x => x.title), ['Loveless', 'Closer']);
    const old = ask('oldest first'); eq(app('aqRun')(items, old.q, ctx)[0].title, 'Moanin’');
    const typo = ask('shoegase'); eq([typo.t.length, typo.q.unknown[0].word, typo.q.unknown[0].sugg.label, typo.q.unknown[0].applied], [3, 'shoegase', 'Shoegaze', true]);
    const lost = ask('shoegaze zxqv'); eq([lost.t.length, lost.q.unknown[0].word, lost.q.chips], [0, 'zxqv', ['Shoegaze']]);
    eq(ask('rock not shoegaze').q.chips, ['Rock (and 4 under it)', 'Not: Shoegaze']);
    eq(app('aqComplete')('slow', ctx)[0].label, 'Slowdive');
    eq(app('aqComplete')('by co', ctx).map(x => x.kind).every(k => k === 'artist'), true);
  });
});

suite('Genre page: progress on Rate Your Music', () => {
  test('a genre finds its RYM genre page and its charts; what the add-on sends is cleaned', () => {
    const clean = app('rymCleanPages'), find = app('rymPagesForGenre'), prog = app('rymListProgress'), ranges = app('rymPageRanges');
    const all = clean({
      '/genre/post-punk/': { label: 'Post-Punk', s: 5, pages: { 1: { d: 1, h: 'sent' }, 2: { d: 1 }, 3: { d: 0 }, 5: { d: 1 } } },
      '/charts/top/album/1980s/g:post-punk/': { label: 'x', s: 9, pages: { 1: { d: 1 } } },
      '/genre/shoegaze/': { label: 'Shoegaze', pages: { 1: { d: 1 } } },
      'javascript:alert(1)': { pages: { 1: { d: 1 } } },
      '/genre/rock/': { pages: { 0: { d: 1 }, x: {}, 2: { d: 1, h: '<b>' } } } });
    eq(Object.keys(all).sort(), ['/charts/top/album/1980s/g:post-punk/', '/genre/post-punk/', '/genre/rock/', '/genre/shoegaze/']);
    eq(all['/genre/rock/'].pages, { 2: { d: 1, h: '', o: 0, e: 0, n: 0, f: 0, s: 0 } });
    const lists = find('Post-Punk', all);
    eq(lists.map(l => l.k), ['/genre/post-punk/', '/charts/top/album/1980s/g:post-punk/']);
    eq(prog(lists[0]), { done: [1, 2, 5], open: [3], next: 3 });
    eq([ranges([1, 2, 5]), app('rymGenreSlug')('Rock & Roll'), app('rymChartName')('/charts/top/album/1980s/g:post-punk/')], ['1–2, 5', 'rock-and-roll', 'Top · album · 1980s']);
  });
});

suite('Genre page: top on Rate Your Music', () => {
  test('top rated weighs in how many rated it; most popular is by how many rated it; unrated left out', () => {
    const top = app('giRymTop'), mk = (t, r, v) => ({ title: t, rymRating: r, rymVotes: v });
    const items = [mk('few', 4.4, 3), mk('loved', 4.12, 2400), mk('big', 3.7, 54000), mk('solid', 4.05, 9200), mk('none', 0, 0), mk('meh', 3.2, 200)];
    eq(top(items, 'rated', 3).map(r => r.title), ['loved', 'solid', 'few']);
    eq(top(items, 'popular', 3).map(r => r.title), ['big', 'solid', 'loved']);
    eq(top(items, 'rated', 10).length, 5);
  });
});

suite('Full-release video: outtakes and editions', () => {
  test('studio takes, demos and outtakes count against a video, unless the release is one; the edition preference can match', () => {
    const f = app('fvScoreVideo'), item = { artist: 'The Beatles', title: 'Beatles for Sale' };
    const plain = f(item, 557000, { title: 'The Beatles - Beatles for Sale (Full Album)', durationMs: 557000 }).score;
    const takes = f(item, 557000, { title: 'The Beatles - Beatles for Sale (takes 1-9)', durationMs: 557000 }).score;
    const demos = f(item, 557000, { title: 'The Beatles - Beatles for Sale demos', durationMs: 557000 }).score;
    const own = f({ artist: 'The Beatles', title: 'Beatles for Sale Demos' }, 557000, { title: 'The Beatles - Beatles for Sale Demos', durationMs: 557000 }).score;
    ok(takes < plain - 30 && demos < plain - 30 && own >= 75);
    const S = app('state'); app('smPrefsSave')({ edition: 'remaster' });
    try { eq([app('smEditionNudge')('Beatles for Sale (Remastered)'), app('smEditionNudge')('Beatles for Sale')], [3, 0]); }
    finally { app('smPrefsSave')({ edition: 'any' }); }
  });
});

suite('Genre page: recently added', () => {
  test('the newest in your crate first; ones with no date added last', () => {
    const s = app('giSortItems'), mk = (t, d, r) => ({ title: t, dateAdded: d, releaseDate: r || '1990' });
    eq(s([mk('a', '2026-01-03'), mk('b', ''), mk('c', '2026-11-07'), mk('d', '2025-05-01')], 'added').map(x => x.title), ['c', 'a', 'd', 'b']);
  });
});

suite('Match songs: ticking a whole full-release video', () => {
  test('one click ticks every song’s part of the video (and unticks them); a song already linked is left out', () => {
    const tickAll = app('bmFullVideoTickAll'), parts = app('bmFullVideoParts'), cands = app('bmFullVideoCands');
    const songs = [{ idx: 0, title: 'A', durationMs: 180000, youtubeLink: '' }, { idx: 1, title: 'B', durationMs: 200000, youtubeLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, { idx: 2, title: 'C', durationMs: 100000, youtubeLink: '' }];
    const byIdx = cands(songs, { id: 'fullvideo02', title: 'X', channel: 'Fan', score: 70, diffMs: 60000, durationMs: 540000 }, false);
    const rel = { songs, item: { artist: 'A', title: 'X' }, youtube: { status: 'done', byIdx, fullVideo: { id: 'fullvideo02' } }, pick: { spotify: {}, youtube: {} }, touched: { spotify: {}, youtube: {} }, broken: { spotify: {}, youtube: {} } };
    eq(parts(rel).map(p => [p.idx, p.on]), [[0, false], [2, false]]);
    tickAll(rel); eq(Object.keys(rel.pick.youtube).sort(), ['0', '2']);
    tickAll(rel); eq(Object.keys(rel.pick.youtube), []);
  });
});

suite('Artist aliases', () => {
  test('an alias groups under its artist; chains resolve; what arrives is cleaned', () => {
    const clean = app('artistAliasesClean');
    const map = clean({ a: { alias: 'Zappa', to: 'Frank Zappa' }, b: { alias: 'The Mothers', to: 'Zappa' }, c: { alias: 'Self', to: 'self' }, d: { alias: '', to: 'X' }, e: 'junk' });
    eq(Object.values(map).map(e => [e.alias, e.to]).sort(), [['The Mothers', 'Frank Zappa'], ['Zappa', 'Frank Zappa']]);
    const was = app('artistAliasMap'); app('artistAliasMap = ' + JSON.stringify(map));
    try {
      eq([app('artistCanon')('zappa'), app('artistCanon')('The Mothers'), app('artistCanon')('Beck')], ['Frank Zappa', 'Frank Zappa', 'Beck']);
      eq([app('sameArtist')('Zappa', 'Frank Zappa'), app('sameArtist')('Zappa', 'Beck')], [true, false]);
      eq(app('artistAliasesOf')('Zappa'), ['The Mothers', 'Zappa']);
      const S = app('state'), q = S.query; S.query = 'artist:frank zappa';
      try { eq(app('searchTokenMatches')({ artist: 'Zappa', title: 'Hot Rats' }, app('getSearchTerms')()[0]), true); } finally { S.query = q; }
    } finally { app('artistAliasMap = ' + JSON.stringify(was)); }
  });
});

suite('RYM tracklists: lettered parts of a track', () => {
  test('"a) Part 1" with no position of its own, under a track that has one, folds into it', () => {
    const fold = app('rymFoldParts'), t = (pos, title, s) => Object.assign({ title, durationMs: s * 1000 }, pos ? { pos } : {});
    const out = fold([t('A3', 'Twenty Small Cigars', 137), t('A4', 'The Nancy & Mary Music', 0), t('', 'a) Part 1', 162), t('', 'b) Part 2', 251), t('', 'c) Part 3', 157), t('B1', 'Tell Me You Love Me', 163)]);
    eq(out.map(x => [x.pos, x.title, x.durationMs / 1000]), [['A3', 'Twenty Small Cigars', 137], ['A4', 'The Nancy & Mary Music', 570], ['B1', 'Tell Me You Love Me', 163]]);
    eq(fold([t('', 'a) Intro', 60), t('', 'b) Song', 200)]).length, 2);          // no positions anywhere: left as songs
  });
});

suite('Artist aliases: the main name', () => {
  test('making an alias the main name turns the old main name, and every other alias, into lesser names of it', () => {
    const was = app('artistAliasMap'), save = app('artistAliasesSave');
    app('artistAliasesSave = () => {}; artistAliasMap = ' + JSON.stringify({ 'frank zappa': { alias: 'Frank Zappa', to: 'Zappa' }, 'the mothers': { alias: 'The Mothers', to: 'Zappa' } }));
    try {
      eq(app('artistAliasMakeMain')('Frank Zappa'), 'Frank Zappa');
      eq([app('artistCanon')('Zappa'), app('artistCanon')('The Mothers'), app('artistCanon')('Frank Zappa')], ['Frank Zappa', 'Frank Zappa', 'Frank Zappa']);
      eq(app('artistAliasesOf')('Frank Zappa'), ['The Mothers', 'Zappa']);
    } finally { app('artistAliasMap = ' + JSON.stringify(was)); window.__s = save; app('artistAliasesSave = parent.__s'); }
  });
});

suite('Artist types and members', () => {
  test('a band lists its members; a member’s page knows its bands, through aliases too; what arrives is cleaned', () => {
    const clean = app('artistDetailsClean');
    const map = clean({ a: { name: 'The Beatles', type: 'Band', members: [{ name: 'John Lennon', role: 'vocals, guitar' }, { name: 'john lennon' }, { name: 'The Beatles' }, { name: '' }] }, b: { name: 'Plastic Ono Band', type: 'Nonsense', members: [{ name: 'Lennon' }] }, c: { name: 'Empty' } });
    eq(Object.keys(map).sort(), ['plastic ono band', 'the beatles']);
    eq(map['the beatles'].members, [{ name: 'John Lennon', role: 'vocals, guitar' }]);
    eq(map['plastic ono band'].type, '');
    const was = [app('artistDetailsMap'), app('artistAliasMap')];
    app('artistDetailsMap = ' + JSON.stringify(map) + '; artistAliasMap = ' + JSON.stringify({ lennon: { alias: 'Lennon', to: 'John Lennon' } }));
    try { eq(app('artistMemberOf')('John Lennon'), [{ band: 'Plastic Ono Band', role: '' }, { band: 'The Beatles', role: 'vocals, guitar' }]); }
    finally { app('artistDetailsMap = ' + JSON.stringify(was[0]) + '; artistAliasMap = ' + JSON.stringify(was[1])); }
  });
});

suite('Artists from Rate Your Music', () => {
  test('what the add-on sends about artist pages is cleaned', () => {
    const got = app('rymCleanArtists')([{ p: '/artist/frank-zappa', name: 'Frank Zappa', born: '1940', memberOf: ['A', 7, ''], aka: 'nope', members: [{ name: 'X', role: 'y' }, { role: 'no name' }] }, { p: 'javascript:alert(1)', name: 'Bad' }, { p: '/artist/x' }]);
    eq(got.length, 1); eq([got[0].born, got[0].memberOf, got[0].aka, got[0].members], ['1940', ['A'], [], [{ name: 'X', role: 'y' }]]);
  });
});

suite('Artists: a shared credit is several artists', () => {
  test('a full name and a "The …" band split, as do names that are each in the crate; one-word-and-band names and duos stay whole; your choice wins', () => {
    const S = app('state'), was = [S.raw, app('artistDetailsMap'), app('artistAliasMap')];
    S.raw = ['Don Shinn and The Soul Agents', 'Paul Simon & Art Garfunkel', 'Paul Simon', 'Art Garfunkel', 'Echo & the Bunnymen', 'Simon & Garfunkel', 'Earth, Wind & Fire'].map((a, i) => ({ row: 'x' + i, artist: a, title: 'T' + i }));
    app('artistDetailsMap = {}; artistAliasMap = {}; artistPartsCache = null; artistDetailsSave = () => { artistPartsCache = null; }');
    try {
      const parts = (n) => app('artistParts')(n).join(' | ');
      eq(['Don Shinn and The Soul Agents', 'Paul Simon & Art Garfunkel', 'Echo & the Bunnymen', 'Simon & Garfunkel', 'Earth, Wind & Fire'].map(parts), ['Don Shinn | The Soul Agents', 'Paul Simon | Art Garfunkel', 'Echo & the Bunnymen', 'Simon & Garfunkel', 'Earth, Wind & Fire']);
      eq([app('creditedTo')('Don Shinn and The Soul Agents', 'The Soul Agents'), app('creditedTo')('Don Shinn and The Soul Agents', 'Echo')], [true, false]);
      app('artistDetailsMap = artistDetailsClean(' + JSON.stringify({ a: { name: 'Don Shinn and The Soul Agents', keep: true }, b: { name: 'Echo & the Bunnymen', split: ['Echo', 'The Bunnymen'] } }) + '); artistPartsCache = null');          // (stored as the app stores it)
      eq([parts('Don Shinn and The Soul Agents'), parts('Echo & the Bunnymen')], ['Don Shinn and The Soul Agents', 'Echo | The Bunnymen']);
    } finally { S.raw = was[0]; app('artistDetailsMap = ' + JSON.stringify(was[1]) + '; artistAliasMap = ' + JSON.stringify(was[2]) + '; artistPartsCache = null'); }
  });
});

suite('Genre page: RYM row by primary or secondary genre', () => {
  test('primary only drops a release whose genre (or sub-genre) is only among its secondary genres', () => {
    const S = app('state'), was = JSON.stringify(S.genreTaxonomy);
    S.genreTaxonomy['free improvisation'] = { label: 'Free Improvisation', parents: ['Experimental'] };
    try {
      const items = [{ title: 'Red', genre: 'Progressive Rock', genre2: 'Free Improvisation' }, { title: 'Lot 74', genre: 'Free Improvisation', genre2: '' }, { title: '20 Jazz Funk Greats', genre: 'Experimental, Industrial', genre2: '' }];
      const pick = app('giRymItems'), t = (l) => l.map(r => r.title);
      eq(t(pick('Experimental', true, items, 'primary')), ['Lot 74', '20 Jazz Funk Greats']);
      eq(t(pick('Experimental', false, items, 'primary')), ['20 Jazz Funk Greats']);
      eq(t(pick('Experimental', true, items, 'any')), ['Red', 'Lot 74', '20 Jazz Funk Greats']);
    } finally { S.genreTaxonomy = JSON.parse(was); }
  });
});

suite('Where a release was recorded (MusicBrainz)', () => {
  test('the place most songs were recorded at, with its area; a second one with a third of the songs; pressing plants ignored', () => {
    const f = app('locFromMbRelease'), at = (name, area) => ({ type: 'recorded at', place: { name, area: area ? { name: area } : undefined } }), song = (...r) => ({ recording: { relations: r } });
    eq(f({ relations: [{ type: 'manufactured at', place: { name: 'EMI MFG.' } }], media: [{ tracks: [song(at('Abbey Road Studios', "St John's Wood")), song(at('Abbey Road Studios', "St John's Wood"))] }] }), "Abbey Road Studios, St John's Wood");
    eq(f({ media: [{ tracks: [song(at('A')), song(at('A')), song(at('A')), song(at('B', 'London'))] }] }), 'A; B, London');
    eq(f({ media: [{ tracks: [song(at('A')), song(at('A')), song(at('A')), song(at('A')), song(at('B'))] }] }), 'A');
    eq(f({ media: [] }), '');
  });
});

suite('Search suggestions', () => {
  test('artists, releases, genres and fields offered for what is typed; a field’s values after "genre:"', () => {
    const S = app('state'), was = S.raw;
    S.raw = [{ row: 's1', artist: 'Frank Zappa', title: 'Hot Rats', genre: 'Jazz-Rock', label: 'Bizarre' }, { row: 's2', artist: 'Talk Talk', title: 'Laughing Stock', genre: 'Post-Rock', label: 'Verve' }];
    app('ssIndex = null');
    try {
      const sug = (q) => app('ssSuggest')(q).map(s => s.kind + ':' + s.label);
      eq(sug('zap'), ['artist:Frank Zappa']);
      eq(sug('hot r'), ['release:Hot Rats']);
      eq(sug('genre:post'), ['genre:Post-Rock']);
      eq(sug('gen').includes('field:genre:'), true);
      eq(app('ssSuggest')('zap')[0].insert, 'artist:"Frank Zappa" ');
    } finally { S.raw = was; app('ssIndex = null'); }
  });
});

suite('Search: track titles', () => {
  test('songs of a saved tracklist and of one looked up this visit are searched and suggested', () => {
    const S = app('state'), was = S.raw, key = app('artKey');
    const a = { row: 't1', artist: 'Frank Zappa', title: 'Zoot Allures', manualTracks: [{ trackNumber: 1, title: 'Black Napkins' }] }, b = { row: 't2', artist: 'Talk Talk', title: 'Laughing Stock', manualTracks: [] };
    S.raw = [a, b]; S.trackCache[key(b)] = [{ trackNumber: 1, trackName: 'Ascension Day' }]; app('ssIndex = null');
    try {
      eq([app('trackTitlesFor')(a), app('trackTitlesFor')(b)], [['Black Napkins'], ['Ascension Day']]);
      eq(app('ssSuggest')('ascen').filter(s => s.kind === 'track').map(s => [s.label, s.insert]), [['Ascension Day', 'track:"Ascension Day" ']]);
    } finally { S.raw = was; delete S.trackCache[key(b)]; app('ssIndex = null'); }
  });
});
