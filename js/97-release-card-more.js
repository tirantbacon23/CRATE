// (1.135.159) The release card (a release from the artist page's More Releases, or found online) shows more: Last.fm's tags for it, its
// "About" text (a few lines, Read more for the rest), where it ranks among the artist's releases by Last.fm plays and its share of them,
// songs played and the most played, and links to look it up elsewhere (Last.fm, MusicBrainz, Rate Your Music, Discogs, YouTube, Spotify).
const stlAlbMem = new Map();
const stlMoreOpen = new Set();
(function () {
  const base = stlAlbum;
  stlAlbum = async function (artist, title, user) { const a = await base.apply(this, arguments); if (a) stlAlbMem.set(stlNorm(artist) + '|' + stlNorm(title), a); return a; };
})();
function stlMoreTags(alb) {
  const t = alb && alb.tags && alb.tags.tag, arr = Array.isArray(t) ? t : t ? [t] : [];
  const junk = typeof AI_NOT_GENRE !== 'undefined' ? AI_NOT_GENRE : /^(seen live|albums? i own)$/i;
  return arr.map(x => String(x.name || '').trim()).filter(x => x && !junk.test(x)).slice(0, 8);
}
function stlMoreWiki(alb) {
  const w = alb && alb.wiki; if (!w) return null;
  const clean = (h) => String(h || '').replace(/<a [^>]*>Read more on Last\.fm<\/a>\.?/i, '').replace(/User-contributed text is available[\s\S]*$/i, '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
  const s = clean(w.summary), c = clean(w.content);
  return s || c ? { s: s || c.slice(0, 400), c: c && c.length > s.length + 40 ? c : '', when: String(w.published || '').replace(/,?\s*\d{1,2}:\d{2}$/, '') } : null;
}
function stlMoreRank(subj) {          // among the artist's releases on the artist page, by Last.fm plays
  if (typeof aiMoreItems === 'undefined' || !aiMoreItems.length) return null;
  const k = stlNorm(subj.title), withP = aiMoreItems.filter(w => w.plays > 0); if (withP.length < 2) return null;
  const me = withP.find(w => stlNorm(w.title) === k); if (!me) return null;
  const sorted = withP.slice().sort((a, b) => b.plays - a.plays), tot = withP.reduce((a, w) => a + w.plays, 0);
  return { rank: sorted.indexOf(me) + 1, of: sorted.length, share: tot ? me.plays / tot : 0 };
}
function stlMoreHtml(subj) {
  const d = stl.data.get(subj.key); if (!d) return '';
  const alb = stlAlbMem.get(stlNorm(subj.artist) + '|' + stlNorm(subj.title)), tags = stlMoreTags(alb), wiki = stlMoreWiki(alb), rk = stlMoreRank(subj);
  const S = d.songs || [], played = S.filter(s => (s.p || 0) > 0), totP = S.reduce((a, s) => a + (s.p || 0), 0), top = played.slice().sort((a, b) => (b.p || 0) - (a.p || 0))[0];
  const facts = [];
  if (rk) facts.push([`#${rk.rank}`, `of ${rk.of} releases, by plays`], [Math.round(rk.share * 100) + '%', 'of the artist’s plays']);
  if (S.length && d.state === 'done' && totP) facts.push([`${played.length}/${S.length}`, 'songs with plays'], [stlF(Math.round(totP / Math.max(1, played.length))), 'plays a song, on average']);
  const r = subj.r || {}, mbid = (alb && alb.mbid) || '', id = r.src === 'mbg' && r.id ? r.id : (r.rg || ''), q = encodeURIComponent(subj.artist + ' ' + subj.title);
  const links = [
    alb && alb.url ? ['Last.fm', alb.url] : null,
    id ? ['MusicBrainz', 'https://musicbrainz.org/release-group/' + id] : mbid ? ['MusicBrainz', 'https://musicbrainz.org/release/' + mbid] : ['MusicBrainz', 'https://musicbrainz.org/search?type=release_group&query=' + q],
    ['Rate Your Music', typeof rymSearchUrl === 'function' ? rymSearchUrl({ artist: subj.artist, title: subj.title }) : 'https://rateyourmusic.com/search?searchtype=l&searchterm=' + q],
    ['Discogs', 'https://www.discogs.com/search/?type=all&q=' + q],
    ['YouTube', 'https://www.youtube.com/results?search_query=' + encodeURIComponent(subj.artist + ' ' + subj.title + ' full album')],
    ['Spotify', 'https://open.spotify.com/search/' + q]
  ].filter(Boolean);
  if (!tags.length && !wiki && !facts.length && d.state !== 'done') return `<div class="stl-more"><div class="stl-note">Reading Last.fm…</div></div>`;
  const open = stlMoreOpen.has(subj.key);
  return `<div class="stl-more">
    ${tags.length ? `<div class="stl-more-tags">${tags.map(t => `<span class="stl-more-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    ${facts.length ? `<div class="stl-more-facts">${facts.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''}
    ${wiki ? `<div class="stl-more-about"><span class="stl-more-h">About${wiki.when ? ` <em>· Last.fm, ${escapeHtml(wiki.when)}</em>` : ''}</span><p class="${open ? 'open' : ''}">${escapeHtml(open && wiki.c ? wiki.c : wiki.s)}</p>${wiki.c ? `<button type="button" class="stl-more-btn" data-stl-more-wiki>${open ? 'Less' : 'Read more'}</button>` : ''}</div>` : ''}
    <div class="stl-more-links"><span class="stl-more-h">Look it up</span>${links.map(([n, u]) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(n)} ↗</a>`).join('')}</div>
  </div>`;
}
(function () {
  const base = stlPanelHtml;
  stlPanelHtml = function (subj, mode) {
    const h = base.apply(this, arguments); if (mode !== 'c') return h;
    const i = h.indexOf('<div class="stl-tbl">'); const more = stlMoreHtml(subj);
    return i < 0 ? h + more : h.slice(0, i) + more + h.slice(i);
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-stl-more-wiki]'); if (!b || typeof stlPop === 'undefined' || !stlPop) return;
    e.preventDefault(); const k = stlPop.subj.key; if (stlMoreOpen.has(k)) stlMoreOpen.delete(k); else stlMoreOpen.add(k); stlPaint(k);
  }, true);
})();
