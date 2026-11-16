/* CRATE · RYM add-on — (1.22.0) runs on rateyourmusic.com song pages (/song/...). It reads the song's average rating and how many ratings it
   rests on, its genres and descriptors, its credits, and the releases it appears on, and keeps them in this browser for CRATE, which puts them
   on that song in your crate. The lyrics are never read. Nothing is sent anywhere, and nothing on the page is changed. */
(function () {
  'use strict';
  if (window.__crateSongLoaded) return;
  window.__crateSongLoaded = true;
  const C = window.CrateRym, ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const BAD = /related|similar|recommend|review|comment|lyric|chart|list|footer|header|nav|menu/i;
  const inBad = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (BAD.test((e.id || '') + ' ' + String(e.className || ''))) return true; return false; };
  function songPath() { const m = /^\/song\/([^/]+)\/([^/]+)\/?/.exec(location.pathname); return m ? `/song/${m[1]}/${m[2]}` : ''; }
  // (1.22.1) The page's structured data first (the hidden summary many sites give: name, artist, rating, genre, album), then its layout.
  function fromLd() {
    const out = {}; const all = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { const j = JSON.parse(s.textContent || 'null'); (Array.isArray(j) ? j : [j]).forEach(x => { if (x && x['@graph']) all.push(...x['@graph']); else if (x) all.push(x); }); } catch (e) { /* not JSON */ } });
    const rec = all.find(x => /MusicRecording|MusicComposition/i.test(String(x['@type'] || ''))) || null; if (!rec) return out;
    const name = (v) => typeof v === 'string' ? v : v && (v.name || (Array.isArray(v) ? v.map(name).filter(Boolean).join(' & ') : '')) || '';
    out.ti = name(rec.name); out.ar = name(rec.byArtist);
    const ag = rec.aggregateRating; if (ag) { out.a = Number(ag.ratingValue) || 0; out.n = Number(ag.ratingCount || ag.reviewCount) || 0; }
    const g = rec.genre; out.pri = (Array.isArray(g) ? g : g ? [g] : []).map(String);
    const alb = rec.inAlbum; out.rels = (Array.isArray(alb) ? alb : alb ? [alb] : []).map(x => C.rymPath(String(x && (x['@id'] || x.url) || ''))).filter(Boolean);
    return out;
  }
  let lastMiss = [];
  function read() {
    const p = songPath(); if (!p) return null;
    const ld = fromLd();
    const docT = (document.title || '').replace(/\s*[-|–—]\s*(?:RYM|Rate Your Music|Sonemic|rateyourmusic\.com).*$/i, '').trim();
    const byM = /^(.*?)\s+by\s+(.+)$/i.exec(docT);
    const h1 = document.querySelector('h1'), artistA = document.querySelector('[class*="song_header" i] a[href^="/artist/"], [class*="header" i] a[href^="/artist/"], a[href^="/artist/"]');
    const title = C.tidyName((h1 && txt(h1)) || (byM ? byM[1] : '') || ''), artist = C.tidyName((artistA && txt(artistA)) || (byM ? byM[2] : '') || '');
    let a = 0, n = 0;
    const avgEl = document.querySelector('[class*="rating_value" i], .avg_rating, [class*="avg_rating" i], [class*="rating_avg" i]');
    const cntEl = document.querySelector('[class*="rating_count" i], .num_ratings, [class*="num_ratings" i], [class*="ratings_count" i]');
    if (avgEl) { const r = C.ratingFromTexts(txt(avgEl), cntEl ? txt(cntEl) : ''); if (r) { a = r.a; n = r.n || 0; } else { const m = /(\d\.\d{1,2})/.exec(txt(avgEl)); if (m) a = Number(m[1]); } }
    if (!n && cntEl) { const m = /([\d,]+)/.exec(txt(cntEl)); if (m) n = Number(m[1].replace(/,/g, '')); }
    const genreLinks = [...document.querySelectorAll('a[href^="/genre/"]')].filter(x => !inBad(x));
    const isSec = (x) => !!x.closest('[class*="secondary" i], [class*="sec_genre" i]');
    const pri = uniq(genreLinks.filter(x => !isSec(x)).map(txt)).slice(0, 6), sec = uniq(genreLinks.filter(isSec).map(txt)).slice(0, 6);
    let desc = uniq([...document.querySelectorAll('a[href*="/descriptor/"]')].filter(x => !inBad(x)).map(txt));
    if (!desc.length) { const d = document.querySelector('[class*="descriptor" i]'); if (d && !inBad(d)) desc = uniq(txt(d).split(/\s*,\s*/)); }
    const credits = C.readCredits ? C.readCredits(document) : [];
    const rels = uniq([...document.querySelectorAll('a[href^="/release/"]')].filter(x => !inBad(x)).map(x => C.rymPath(x.getAttribute('href') || ''))).slice(0, 30);
    const T = title || C.tidyName(ld.ti || ''), AR = artist || C.tidyName(ld.ar || '');
    if (!a && ld.a) { a = ld.a; n = ld.n || n; }
    const PRI = pri.length ? pri : (ld.pri || []).slice(0, 6), RELS = uniq(rels.concat(ld.rels || [])).slice(0, 30);
    lastMiss = [!T && 'title', !a && 'rating', !PRI.length && 'genres', !desc.length && 'descriptors', !credits.length && 'credits', !RELS.length && 'its releases'].filter(Boolean);
    if (!T || (!a && !PRI.length && !desc.length && !credits.length)) return null;
    return { p, u: location.origin + p + '/', ar: AR.slice(0, 200), ti: T.slice(0, 200), a, n, pri: PRI, sec, desc: desc.slice(0, 30).map(x => x.slice(0, 60)), credits, rels: RELS, t: Date.now() };
  }
  // (1.22.1) A small note at the bottom right: what CRATE read from this page (or what it couldn't find), and whether the song's release is
  // in your crate, so you can see it worked. It goes away after a while; a click hides it.
  function pill(e, idx) {
    let el = document.getElementById('crate-song-pill');
    if (!el) {
      if (!document.getElementById('crate-song-style')) { const s = document.createElement('style'); s.id = 'crate-song-style'; s.textContent = '#crate-song-pill{position:fixed;right:14px;bottom:14px;z-index:2147483000;max-width:420px;font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;background:#12161c;color:#ede7dc;border:1px solid #2a313c;border-radius:10px;padding:9px 12px;box-shadow:0 8px 24px rgba(0,0,0,.4);cursor:pointer}#crate-song-pill b{color:#d6a24c}#crate-song-pill i{font-style:normal;color:#8b93a0}'; document.head.appendChild(s); }
      el = document.createElement('div'); el.id = 'crate-song-pill'; el.title = 'Hide'; el.addEventListener('click', () => el.remove()); document.body.appendChild(el);
    }
    el.textContent = '';
    const b = (t) => { const x = document.createElement('b'); x.textContent = t; return x; }, i = (t) => { const x = document.createElement('i'); x.textContent = t; return x; }, br = () => el.appendChild(document.createElement('br'));
    if (!e) { el.append(b('CRATE: '), document.createTextNode('couldn\u2019t read this song page')); br(); el.append(i('Not found: ' + (lastMiss.join(', ') || 'anything'))); return; }
    const got = [e.a ? `\u2605 ${e.a.toFixed(2)}${e.n ? ` (${e.n.toLocaleString()})` : ''}` : '', e.pri.length ? `${e.pri.length} genre${e.pri.length === 1 ? '' : 's'}` : '', e.desc.length ? `${e.desc.length} descriptor${e.desc.length === 1 ? '' : 's'}` : '', e.credits.length ? `${e.credits.length} credit${e.credits.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' \u00b7 ');
    el.append(b('CRATE \u2713 '), document.createTextNode(`${e.ti}: ${got}`)); br();
    let rel = '';
    if (idx && idx.items && e.rels.length) { const m = C.makeMatcher(idx.items); for (const rp of e.rels) { const r = m.match({ href: rp, title: '', artist: '', year: '', type: C.rymType(rp) }); if (r && r.status === 'owned' && r.item) { rel = r.item.t; break; } } }
    el.append(i(rel ? `In your crate on ${rel}: it goes there when CRATE is open.` : (e.rels.length ? 'None of its releases is in your crate (yet): kept for when it is.' : 'Its releases weren\u2019t found on the page: CRATE matches it by artist and title.')));
    if (lastMiss.length) { br(); el.append(i('Not on this page: ' + lastMiss.join(', '))); }
    clearTimeout(pill.t); pill.t = setTimeout(() => { const x = document.getElementById('crate-song-pill'); if (x) x.remove(); }, 15000);
  }
  function run(final) {
    try {
      ext.storage.local.get(['settings', 'rymSongs', 'crateIndex'], (got) => {
        const st = got && got.settings || {}; if (st.captureSongs === false) return;
        const e = read();
        if (e || final) { if (st.showPill !== false) pill(e, got && got.crateIndex); }
        if (!e) return;
        const r = C.mergeSong(got && got.rymSongs || {}, e, 3000); if (r.changed) ext.storage.local.set({ rymSongs: r.out });
      });
    } catch (err) { /* storage unavailable */ }
  }
  run(false); setTimeout(() => run(false), 2500); setTimeout(() => run(true), 7000);          // (the last one says so if nothing could be read)                       // once now, and once after the page has settled
})();
