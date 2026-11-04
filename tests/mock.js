// Tests only (see README.md): a fake sign-in token, back end, iTunes, Spotify and YouTube, so CRATE runs with 4,000 made-up releases and never
// touches your real crate. index.html loads this only with ?crate-test in the address, and only on localhost / 127.0.0.1.
(function () {
  window.__ltl = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__ltl.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask" }); } catch (e) {}
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  localStorage.setItem('crate_spotify_creds_v1', JSON.stringify({ clientId: 'x', clientSecret: 'y' })); localStorage.setItem('crate_youtube_api_key_v1', 'k');
  localStorage.setItem('crate_google_id_token_v1', b64({ alg: 'none' }) + '.' + b64({ exp: 4102444800, email: 'test@example.test' }) + '.x');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const genres = ['Rock', 'Shoegaze', 'Post-Punk', 'Indie Rock', 'Noise Rock', 'Jazz', 'Ambient', 'Hip Hop', 'Electronic', 'Folk'];
  const N = +(new URLSearchParams(location.search).get('n') || 4000);
  const rows = [];
  for (let i = 0; i < N; i++) {
    const g = rnd() < 0.55 ? genres[Math.floor(rnd() * 5)] : genres[5 + Math.floor(rnd() * 5)];
    const manual = rnd() < 0.7;
    const nt = 6 + Math.floor(rnd() * 10);
    rows.push({ _row: i + 2, AlbumId: 'a' + i, Artist: 'Artist ' + (i % 900), Title: 'Album ' + i, Type: 'Album',
      ReleaseDate: String(1965 + Math.floor(rnd() * 60)), Genre: g, SecondaryGenre: genres[Math.floor(rnd() * 10)],
      Rating: Math.floor(rnd() * 10) / 2, DateAdded: '2026-01-01', Cover: rnd() < 0.85 ? location.origin + '/tests/c.png?' + i : '',
      ManualTracks: manual ? JSON.stringify(Array.from({ length: nt }, (_, k) => ({ trackNumber: k + 1, title: 'Song ' + k + ' of ' + i, youtubeLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }))) : '' });
  }
  window.__mockStats = { itunes: 0 };
  const realFetch = window.fetch.bind(window);
  const json = (o, ms) => new Promise(r => setTimeout(() => r(new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } })), ms || 0));
  window.fetch = function (url, opts) {
    const u = String(url && url.url || url);
    if (u.includes('script.google.com')) {
      if (opts && opts.method === 'POST') return json({ ok: true, success: true }, 50);
      return json({ rows, diary: [], scrobbles: [], playlists: [], rym: true }, 200);
    }
    if (u.includes('itunes.apple.com/search')) {
      window.__mockStats.itunes++;
      const m = /Artist%20(\d+)%20Album%20(\d+)/.exec(u) || /Album%20(\d+)/.exec(u);
      const i = m ? +(m[2] || m[1]) : 0, r = rows[i] || rows[0];
      return json({ results: [{ wrapperType: 'collection', collectionType: 'Album', collectionId: 1e6 + i, collectionName: r.Title, artistName: r.Artist, trackCount: 10 }] }, 150);
    }
    if (u.includes('itunes.apple.com/lookup')) {
      window.__mockStats.itunes++;
      const id = +(/id=(\d+)/.exec(u) || [0, 0])[1];
      return json({ results: Array.from({ length: 10 }, (_, k) => ({ wrapperType: 'track', trackNumber: k + 1, discNumber: 1, trackName: 'iSong ' + k + ' of ' + (id - 1e6), trackTimeMillis: 200000 })) }, 150);
    }
    // fake Spotify (token, album search, albums, track search, several tracks) and YouTube (API + oEmbed), test harness only
    if (u.includes('accounts.spotify.com/api/token')) return json({ access_token: 'fake', expires_in: 3600, token_type: 'Bearer' }, 30);
    if (u.includes('api.spotify.com')) {
      window.__mockStats.spotify = (window.__mockStats.spotify || 0) + 1;
      const rowOf = (i) => rows[i] || rows[0], titles = (r, i) => (r.ManualTracks ? JSON.parse(r.ManualTracks).map(t => t.title) : Array.from({ length: 10 }, (_, k) => 'iSong ' + k + ' of ' + i));
      if (u.includes('/v1/search') && u.includes('type=album')) { const q = decodeURIComponent((u.split('q=')[1] || '').replace(/\+/g, ' ')); const m = /Album (\d+)/.exec(q); const i = m ? +m[1] : 0; return json({ albums: { items: [{ id: 'alb' + i, name: 'Album ' + i, artists: [{ name: rowOf(i).Artist }] }, { id: 'alb' + i + 'r', name: 'Album ' + i + ' (Remastered)', artists: [{ name: rowOf(i).Artist }] }] } }, 120); }
      if (u.includes('/v1/search') && u.includes('type=track')) return json({ tracks: { items: [] } }, 120);
      if (u.includes('/v1/tracks?')) { const ids = decodeURIComponent(/ids=([^&]+)/.exec(u)[1]).split(','); return json({ tracks: ids.map(id => /dead/.test(id) ? null : /relink/.test(id) ? { id: id.replace('relink', 'fresh'), name: 'Relinked', linked_from: { id }, is_playable: true, artists: [] } : { id, name: 'ok', is_playable: true, artists: [] }) }, 120); }
      const m = /albums\/(alb(\d+)(r?))/.exec(u); if (m) { const i = +m[2], r = rowOf(i), ts = titles(r, i); return json({ id: m[1], name: r.Title + (m[3] ? ' (Remastered)' : ''), external_urls: { spotify: 'https://open.spotify.com/album/' + m[1] }, tracks: { items: (m[3] ? ts.concat(['Bonus Demo']) : ts).map((t, k) => ({ id: m[1] + 't' + k, name: t, artists: [{ name: r.Artist }], duration_ms: 200000 })), next: null } }, 150); }
      return json({}, 50);
    }
    if (u.includes('googleapis.com/youtube')) {
      if (u.includes('/search')) { const q = decodeURIComponent((/q=([^&]+)/.exec(u) || [0, ''])[1].replace(/\+/g, ' ')); const m = /Album (\d+)/.exec(q); const i = m ? +m[1] : 0; return json({ items: m ? [{ id: { playlistId: 'PLfake' + String(i).padStart(10, '0') }, snippet: { title: 'Album ' + i, channelTitle: (rows[i] || rows[0]).Artist + ' - Topic' } }] : [] }, 120); }
      if (u.includes('/playlistItems')) { const id = /playlistId=([^&]+)/.exec(u)[1], i = +id.slice(6), r = rows[i] || rows[0], ts = r.ManualTracks ? JSON.parse(r.ManualTracks).map(t => t.title) : Array.from({ length: 10 }, (_, k) => 'iSong ' + k + ' of ' + i); return json({ items: ts.map((t, k) => ({ snippet: { title: t, resourceId: { videoId: ('v' + i + 'x' + k + 'aaaaaaaaaa').slice(0, 11) }, videoOwnerChannelTitle: r.Artist + ' - Topic' } })) }, 120); }
      if (u.includes('/videos')) { const ids = decodeURIComponent(/id=([^&]+)/.exec(u)[1]).split(','); return json({ items: ids.filter(id => !/^dead/.test(id)).map(id => ({ id, contentDetails: { duration: 'PT3M20S', regionRestriction: /^block/.test(id) ? { blocked: ['AU', 'US'] } : undefined }, status: { embeddable: true }, snippet: { channelTitle: 'Topic', title: 'x' } })) }, 80); }
    }
    if (u.includes('youtube.com/oembed')) return Promise.resolve(new Response('{}', { status: /dead/.test(u) ? 404 : 200 }));
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u) || u.startsWith('/') || !/^https?:/.test(u)) return realFetch(url, opts);
    return Promise.reject(new TypeError('blocked in test harness: ' + u.slice(0, 80)));
  };
})();
