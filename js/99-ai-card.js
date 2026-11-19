// (1.135.183) The artist page: a release you already have opens its Last.fm card (its songs with their listeners and plays, your plays,
// when you last played it), the same one releases not in your crate open, with Play all and Open the deck on it. A double-click on a
// cover still plays it. In the card that pops up (here, and from search's cover view), its buttons now do what they say: Play all, a
// song's ▶, and Open the deck.
(function () {
  const body = document.getElementById('aiBody'); if (!body || typeof stlOpenCard !== 'function') return;
  let timer = 0;
  const card = (it) => stlOpenCard({ key: 'c:' + it.row, artist: it.artist, title: it.title, it, r: null, cover: typeof srchItemCover === 'function' ? srchItemCover(it) : (it.cover || '') });
  body.addEventListener('click', (e) => {
    if (e.target.closest('a') || e.target.closest('[data-ai-action]')) return;
    const artist = state.activeArtistInfoTab; if (!artist) return;
    const rg = e.target.closest('.ai-rg');
    if (rg) {          // More Releases: one you have
      const it = aiOwned(artist).find(r => lastfmNormKey(artist, r.title) === lastfmNormKey(artist, rg.dataset.title)); if (!it) return;
      e.stopImmediatePropagation(); card(it); return;
    }
    const tile = e.target.closest('.ai-album');
    if (tile && tile.dataset.row !== undefined) {          // In your crate: wait out a double-click (which plays it) first, as before
      e.stopImmediatePropagation(); clearTimeout(timer);
      timer = setTimeout(() => { const it = state.raw.find(r => String(r.row) === tile.dataset.row); if (it) card(it); }, 260);
    }
  }, true);
  body.addEventListener('dblclick', () => clearTimeout(timer), true);
  // the popped-up card's buttons (search's dropdown has its own)
  document.addEventListener('click', (e) => {
    const ov = e.target.closest && e.target.closest('.stl-pop-ov'); if (!ov || typeof stlPop === 'undefined' || !stlPop) return;
    const sj = stlPop.subj, it = sj && sj.it; if (!it) return;
    const b = e.target.closest('[data-stl-deck], [data-stl-playall], [data-stl-play]'); if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (b.matches('[data-stl-deck]')) { stlCloseCard(); openDeck(it); }
    else if (b.matches('[data-stl-playall]')) { if (typeof playAlbumNow === 'function') playAlbumNow(it); }
    else { const d = stl.data.get(sj.key), s = d && d.songs[+b.dataset.stlPlay]; if (s && typeof playTrackNow === 'function') playTrackNow(it, s.name, s.n); }
  }, true);
})();
