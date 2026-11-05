// CRATE — link flags, song matching, Match songs, the YouTube add-on, matching while adding.
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
// BEGIN link-flag
// ---- Unlinked-song flags ----
// A release you typed the tracklist of by hand (isManualAlbum) is played from the link saved on each SONG: a Spotify
// link, a YouTube link or a SoundCloud link (saved in the tracklist builder or under "Edit track properties…"). The
// player never guesses for these — a song with no usable link is skipped ("Skipping … no link saved"). So a hand-made
// release with any such song is one that will play with holes in it, and gets a red "!" (the setting in the ⚙ menu
// turns every flag off). A link that is there but can't be played — the player's own parsers reject it, so it is
// skipped just the same — counts as missing. Releases whose tracklist comes from iTunes/MusicBrainz are matched to
// Spotify automatically at play time and have no per-song links to be missing, so they are never flagged.
function songLinkProblem(links) {
  const sp = String((links && links.spotifyLink) || '').trim(), yt = String((links && links.youtubeLink) || '').trim(), sc = String((links && links.soundcloudLink) || '').trim();
  if (!sp && !yt && !sc) return 'none';
  if (trackSpotifyUriFromLink(sp) || (yt && youtubeVideoIdFromUrl(yt)) || /^https?:\/\/\S+$/i.test(sc)) return '';
  return 'invalid';
}
function songLinkGaps(item) {
  if (!isManualAlbum(item)) return null;
  // This runs while every card is drawn, so it must never be able to break drawing: the app's own link lookup throws on
  // an odd tracklist (a null entry from a hand-edited sheet cell, say), and a release that can't be judged is simply
  // not flagged rather than taking the whole grid down with it.
  try {
    const tracks = (item.manualTracks || []).filter(t => t && String(t.title || '').trim());
    const missing = [];
    tracks.forEach((t, i) => {
      const n = t.trackNumber || (i + 1);
      const problem = songLinkProblem(trackLinkOverridesFor(item, n, t.title));
      if (problem) missing.push({ trackNumber: n, title: String(t.title).trim(), problem });
    });
    return missing.length ? { total: tracks.length, missing } : null;
  } catch (e) { return null; }
}
function songLinkGapText(g) {
  const n = g.missing.length, names = g.missing.slice(0, 4).map(m => m.title).join(', ') + (n > 4 ? ` and ${n - 4} more` : '');
  if (n === g.total) return `None of the ${g.total} song${g.total === 1 ? ' has' : 's has'} a usable link \u2014 playing this release skips ${g.total === 1 ? 'it' : 'them all'}.`;
  return `${n} of ${g.total} songs ${n === 1 ? 'has' : 'have'} no usable link \u2014 playing this release skips ${n === 1 ? 'it' : 'them'}. Missing: ${names}.`;
}
// END link-flag

// Where the flags are drawn. The setting only ever hides them (a class on <body>), so turning it on or off is instant
// everywhere and nothing has to be redrawn; the flags are always worked out, because they're cheap.
//   mode: undefined = a corner badge on a cover; 'before' / 'after' = a small inline one next to a title
// The flag always sits in a slot keyed to its release (display: contents, so the slot itself has no box), because
// the flag has to come AND GO: fixing a song's link must clear the "!" on the card, the left-panel row, the tiles and
// the album page without redrawing any of them. refreshLinkFlagsFor does that — it is called wherever a song's
// links can change (updateTrackData, saveManualTracklist); the Edit Album save already redraws everything.
function linkFlagInner(item, mode) {
  const g = songLinkGaps(item);
  if (!g) return '';
  const tip = escapeHtml(songLinkGapText(g));
  return `<span class="link-flag${mode ? ' link-flag-inline' : ''}${mode === 'after' ? ' link-flag-after' : ''}" role="button" tabindex="0" data-match-row="${escapeHtml(String(item.row))}" aria-label="${tip} Press Enter to find links for the songs." title="${tip}">!</span>`;
}
function linkFlagHtml(item, mode) {
  return `<span class="link-flag-slot" data-flag-row="${escapeHtml(String(item.row))}" data-flag-mode="${mode || ''}">${linkFlagInner(item, mode)}</span>`;
}
function refreshLinkFlagsFor(item) {
  if (!item) return;
  document.querySelectorAll(`.link-flag-slot[data-flag-row="${CSS.escape(String(item.row))}"]`).forEach(slot => { slot.innerHTML = linkFlagInner(item, slot.dataset.flagMode || ''); });
}
// One song's own flag in a hand-made release's tracklist — the same test as the release's flag, on the links the
// track object already carries (merged with its saved overrides), so the two can never disagree.
function songFlagHtml(item, t) {
  if (!isManualAlbum(item) || !t) return '';
  const problem = songLinkProblem({ spotifyLink: t.spotifyLink, youtubeLink: t.youtubeLink, soundcloudLink: t.soundcloudLink });
  if (!problem) return '';
  const tip = problem === 'invalid' ? 'This song\u2019s link can\u2019t be played \u2014 playing the release skips it.' : 'This song has no link \u2014 playing the release skips it.';
  return `<span class="link-flag link-flag-inline" role="button" tabindex="0" data-match-row="${escapeHtml(String(item.row))}" data-match-track="${escapeHtml(String(t.trackNumber || ''))}" aria-label="${tip} Press Enter to find a link." title="${tip}">!</span>`;
}
function applyLinkFlagSetting() {
  document.body.classList.toggle('hide-link-flags', !state.flagMissingLinks);
  const b = document.getElementById('menuFlagMissingLinks');
  if (b) b.setAttribute('aria-pressed', state.flagMissingLinks ? 'true' : 'false');
}
function initLinkFlags() {
  applyLinkFlagSetting();
  // A red ! is a button: it opens the Match songs dialog for its release (a song's own ! scrolls to that song). Handled in the
  // CAPTURE phase on the document, and stopped there, so it doesn't also trigger the card / row / title it sits inside.
  const fromFlag = (e) => {
    const f = e.target.closest && e.target.closest('.link-flag[data-match-row]');
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    const item = state.raw.find(r => String(r.row) === f.dataset.matchRow);
    if (item) openSongMatcher(item, { focusTrackNum: f.dataset.matchTrack ? Number(f.dataset.matchTrack) : null });
  };
  document.addEventListener('click', fromFlag, true);
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.link-flag[data-match-row]')) fromFlag(e); }, true);
  if (!el.menuFlagMissingLinks) return;
  el.menuFlagMissingLinks.addEventListener('click', () => {
    state.flagMissingLinks = !state.flagMissingLinks;
    savePrefs();
    applyLinkFlagSetting();
    el.layoutMenu.hidden = true;
    flashGlobalToast(state.flagMissingLinks ? 'Unlinked-song flags on.' : 'Unlinked-song flags off.');
  });
}

// BEGIN song-match
// ---- Matching a release's songs to Spotify / YouTube: the judgement (pure, so it can be tested on its own) ----
// A candidate (a Spotify track, a YouTube video) is scored 0-100 against a song of the release:
//   title similarity (up to 55) + artist (15) + length (+/-20 — the best single clue to "the same recording") +
//   album (10), minus a penalty for VERSION words the song itself doesn't ask for (live, remix, demo, acoustic,
//   karaoke, cover, slowed/8D...). Where the match is made against a candidate ALBUM's track list, a matching
//   track position adds a little. Then: >= 85 "confident", >= 65 "likely", else "weak" — and a candidate whose
//   title isn't a near-exact match can never be "confident", however well it does on the rest.
const SM_FLAGS = [
  ['live', /\b(live|in concert|unplugged|bbc session|peel session)\b/],
  ['remix', /\b(remix|remixed|rework|re ?edit|dub mix|club mix|extended mix|radio edit)\b/],
  ['acoustic', /\b(acoustic|stripped)\b/],
  ['instrumental', /\b(instrumental|karaoke|backing track|minus one)\b/],
  ['demo', /\b(demo|rough mix|alternate take|alt take|outtake|early version)\b/],
  ['cover', /\b(cover|tribute|made famous by|in the style of|originally performed)\b/],
  ['altered', /\b(slowed|sped up|speed up|nightcore|8d|reverb|bass boosted|reversed)\b/],
  ['reaction', /\b(reaction|tutorial|lesson|how to play|review)\b/]
];
function smFold(s) { return foldFractions(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and '); }
function smFlags(title) {
  const t = smFold(title).replace(/[^a-z0-9\s]/g, ' ');
  return new Set(SM_FLAGS.filter(([, re]) => re.test(t)).map(([n]) => n));
}
// The words that identify the SONG: brackets and trailing " - Remastered 2011" / " - Live at ..." tails are removed
// (the version words are judged separately, by smFlags, on the untouched title).
function smCore(title) {
  let t = smFold(title);
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ').replace(/\s+[-\u2013\u2014]\s+.*$/, ' ').replace(/\b(feat|ft|featuring)\b\.?\s.*$/, ' ');
  return t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function smLev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function smSim(a, b) {                  // 0..1 between two already-normalised strings
  if (!a || !b) return 0; if (a === b) return 1;
  const ta = a.split(' '), tb = b.split(' '), setB = new Set(tb);
  const common = ta.filter(w => setB.has(w)).length, dice = 2 * common / (ta.length + tb.length);
  const lev = 1 - smLev(a, b) / Math.max(a.length, b.length);
  return Math.max(dice, lev);
}
function smTitleSim(want, got) {        // the song's words, falling back on the whole untouched title (a dash can be part of a real name)
  const a = smCore(want), b = smCore(got);
  const whole = smSim(smFold(want).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(), smFold(got).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim());
  if (a && a.replace(/ /g, '') === b.replace(/ /g, '')) return 1;          // the same letters, spaced differently ("Half Way Down" / "Halfway Down")
  return Math.max(smSim(a, b), whole * 0.97);
}
function smChannelArtist(channel) { return smFold(channel).replace(/\s*-\s*topic$/, '').replace(/\s*(vevo|official|music)$/, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
// YouTube titles are mostly "Artist - Song (Official Audio)". smCore drops a trailing " - ..." as an edition tail, which on
// that shape would delete the song and keep the artist — so a leading "<the artist> - " is removed first.
function smStripArtistPrefix(title, artist) {
  const m = /^(.+?)\s+[-\u2013\u2014]\s+(.+)$/.exec(String(title || ''));
  if (!m) return title;
  const am = smArtistMatch(artist, [m[1]]);
  return am !== null && am >= 0.75 ? m[2] : title;
}
function smArtistMatch(want, got) {     // 1 same, .75 one contains the other, 0 different; null when there is nothing to compare
  const w = smFold(want).replace(/^the /, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const names = (Array.isArray(got) ? got : [got]).map(g => smChannelArtist(g).replace(/^the /, '')).filter(Boolean);
  if (!w || !names.length) return null;
  if (names.some(n => n === w)) return 1;
  if (names.some(n => n.includes(w) || w.includes(n))) return 0.75;
  return 0;
}
function smDurationPoints(wantMs, gotMs, tol) {   // null when either length is unknown; tol stretches (loose) or narrows (strict) the bands
  if (!wantMs || !gotMs) return null;
  const d = Math.abs(wantMs - gotMs) / 1000 / (tol || 1);
  return d <= 2 ? 20 : d <= 4 ? 16 : d <= 7 ? 10 : d <= 12 ? 0 : d <= 25 ? -10 : -20;
}
function smIsoDuration(iso) {           // YouTube's "PT1H2M3S" -> milliseconds
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(iso || ''));
  if (!m) return 0;
  return Math.round((((+m[1] || 0) * 24 + (+m[2] || 0)) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 1000);
}
// Your matching preferences (Match songs → Preferences), kept on this device. smScore and smBand read them, so a change
// applies to every match worked out after it.
const smNet = { spotify: 0, spotify429: 0, youtube: 0, ytApi: 0 };          // requests made since the page opened, for the matcher's analytics (counted where they are made)
const SM_PREFS_KEY = 'crate_match_prefs_v1';
const SM_PREFS_DEFAULT = { confident: 85, lenTol: 'normal', edition: 'any', versionPenalty: true, topicBonus: true, channels: {}, rejected: [], remindCheck: true, queueNew: true, autoMatchNew: true, lastCheck: 0 };
let smPrefsCache = null;
function smPrefs() {
  if (smPrefsCache) return smPrefsCache;
  let o = {}; try { o = JSON.parse(localStorage.getItem(SM_PREFS_KEY) || '{}') || {}; } catch (e) { o = {}; }
  smPrefsCache = Object.assign({}, SM_PREFS_DEFAULT, o, { channels: Object.assign({}, o.channels || {}), rejected: Array.isArray(o.rejected) ? o.rejected : [] });
  smPrefsCache.confident = Math.min(98, Math.max(60, Number(smPrefsCache.confident) || 85));
  return smPrefsCache;
}
function smPrefsSave(patch) {
  smPrefsCache = Object.assign({}, smPrefs(), patch || {});
  if (smPrefsCache.rejected.length > 500) smPrefsCache.rejected = smPrefsCache.rejected.slice(-500);
  try { localStorage.setItem(SM_PREFS_KEY, JSON.stringify(smPrefsCache)); } catch (e) { /* kept for this visit only */ }
}
const smArtistKey = (a) => smFold(a).replace(/^the /, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
function smBand(score) { const c = smPrefs().confident; return score >= c ? 'confident' : score >= 65 ? 'likely' : 'weak'; }
// song: {title, artist, durationMs, album, trackNumber}   cand: {title, artists|channel, durationMs, album, index, blocked}
// Also returns `parts`: what each clue added or took away ({ label, points }), for the "Why this score" breakdown.
function smScore(song, cand, opts) {
  opts = opts || {};
  const pf = opts.prefs || smPrefs();
  const reasons = [], parts = [];
  const add = (label, points) => { parts.push({ label, points: Math.round(points) }); return points; };
  const ts = smTitleSim(song.title, smStripArtistPrefix(cand.title, song.artist));
  let score = add('title', Math.pow(ts, 1.5) * 55);
  reasons.push(ts >= 0.95 ? 'same title' : ts >= 0.75 ? 'similar title' : 'different title');
  let am = smArtistMatch(song.artist, cand.artists || cand.channel);
  // A fan's upload ("martian1138") names the artist in its title, "The Telescopes - Deep Hole Ends": that counts as the artist too.
  const tm = cand.channel && /^(.+?)\s+[-\u2013\u2014]\s+.+$/.exec(String(cand.title || '')), tam = tm ? smArtistMatch(song.artist, [tm[1]]) : null;
  if (tam !== null && (am === null || tam > am)) am = tam;
  if (am === null) score += add('artist (unknown)', 8); else { score += add('artist', am * 15); reasons.push(am === 1 ? 'same artist' : am > 0 ? 'artist partly matches' : 'different artist'); }
  const tol = pf.lenTol === 'strict' ? 0.6 : pf.lenTol === 'loose' ? 1.8 : 1;
  const dp = smDurationPoints(song.durationMs, cand.durationMs, tol);
  if (dp === null) score += add('length (unknown)', 10); else { score += add('length', dp); reasons.push(dp >= 16 ? 'same length' : dp >= 10 ? 'length within a few seconds' : dp >= 0 ? 'length a little off' : 'length is quite different'); }
  if (song.album && cand.album) { const as = smSim(smCore(song.album), smCore(cand.album)); if (as >= 0.9) { score += add('same album', 10); reasons.push('same album'); } else if (as >= 0.6) score += add('similar album', 5); }
  if (opts.position && song.trackNumber && cand.index && song.trackNumber === cand.index) { score += add('same position', 8); reasons.push('same position'); }
  const want = smFlags(song.title), got = smFlags(cand.title);
  const extra = [...got].filter(f => !want.has(f));
  if (extra.length) { if (pf.versionPenalty) score += add(`${extra.join('/')} version`, -Math.min(45, extra.length * 30)); reasons.push('looks like a ' + extra.join('/') + ' version'); }
  if (cand.channel) {
    const ca = smChannelArtist(cand.channel).replace(/^the /, ''), wa = smArtistKey(song.artist);   // both sides stripped of a leading "The" the same way
    if (/ - topic$/i.test(cand.channel) && ca === wa) { if (pf.topicBonus) score += add('Topic channel', 8); reasons.push('the artist\u2019s Topic channel'); }
    else if (ca && wa && ca === wa) { score += add('artist\u2019s channel', 5); reasons.push('the artist\u2019s own channel'); }
    const fav = pf.channels[wa];
    if (fav && smFold(fav) === smFold(cand.channel)) { score += add('channel you chose before', 6); reasons.push('a channel you chose for this artist'); }
  }
  if (/\blyrics?\b/i.test(cand.title || '')) score += add('lyric video', -4);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const capAt = pf.confident - 5;
  if (ts < 0.85 && score > capAt) { parts.push({ label: 'title not near-exact: capped', points: capAt - score }); score = capAt; }                // not a near-exact title: never "confident"
  const rawScore = score;                                      // what it would score if it could be played
  if (cand.blocked) { if (score > 20) parts.push({ label: 'can\u2019t play in the app', points: 20 - score }); score = Math.min(score, 20); reasons.push('can\u2019t be played in the app'); }
  return { score, band: smBand(score), reasons, parts, titleSim: ts, rawScore };
}
// Matches songs to one candidate album's/playlist's track list (cands in order, index 1-based): every pairing is scored, then
// the best pairs are taken one-to-one — a candidate is never given to two songs. Pairs scoring under `min` stay unmatched.
function smAssign(songs, cands, opts) {
  opts = opts || {}; const min = opts.min == null ? 50 : opts.min;
  const pairs = [];
  songs.forEach((s, si) => cands.forEach((c, ci) => { const r = smScore(s, c, { position: true }); if (r.rawScore >= min) pairs.push({ si, ci, r }); }));   // a video that can't be embedded is still SHOWN (weak, with the reason) rather than reported as "no match"
  pairs.sort((a, b) => b.r.score - a.r.score || Math.abs(a.si - a.ci) - Math.abs(b.si - b.ci));
  const bySong = new Map(), usedC = new Set();
  pairs.forEach(p => { if (!bySong.has(p.si) && !usedC.has(p.ci)) { bySong.set(p.si, { cand: cands[p.ci], ...p.r }); usedC.add(p.ci); } });
  return bySong;
}
// How well a whole candidate album/playlist explains the release: the average assigned score over ALL the songs (an
// unmatched song counts 0). Among equals the candidate with the closer track count wins (standard over deluxe).
function smAlbumFit(songs, cands) {
  const a = smAssign(songs, cands);
  const total = [...a.values()].reduce((s, m) => s + m.score, 0);
  return { fit: songs.length ? total / songs.length : 0, matched: a.size, assign: a, countGap: Math.abs(cands.length - songs.length) };
}
// Your edition preference (Preferences) nudges the choice: a few points for, or against, a remastered/deluxe/expanded edition.
function smEditionNudge(name) {
  const pf = smPrefs(), re = /(remaster(ed)?|deluxe|expanded|anniversary|special edition|bonus)/i;
  return pf.edition === 'original' ? (re.test(name || '') ? -3 : 0) : pf.edition === 'remaster' ? (re.test(name || '') ? 3 : 0) : 0;
}
function smBestAlbum(songs, albums) {   // albums: [{id, name, tracks:[...]}] -> the best fit (or null)
  let best = null;
  albums.forEach(al => { const f = smAlbumFit(songs, al.tracks || []); f.fit += smEditionNudge(al.name); const cur = { album: al, ...f }; if (!best || cur.fit > best.fit + 0.5 || (Math.abs(cur.fit - best.fit) <= 0.5 && cur.countGap < best.countGap)) best = cur; });
  return best;
}
// Orders candidates best-first for ONE song, keeping the given order among equals (so Spotify's own relevance still decides ties).
function smRank(song, cands) {
  return cands.map((c, i) => ({ c, i, r: smScore(song, c, {}) })).sort((a, b) => b.r.score - a.r.score || a.i - b.i).map(x => x.c);
}
// END song-match

// BEGIN batch-match
// Match songs for many releases. The song matcher's own lookups (smSpotifyForRelease, smYoutubeForRelease) are run for each release of a selection, both services at once,
// and a screen lets you choose which matches are kept. These helpers decide what a song's cell says, what is ticked, and what will be written.
function bmBandLabel(band) { return band === 'confident' ? 'Confident' : band === 'likely' ? 'Likely' : 'Weak'; }
function bmDiffText(songMs, candMs) {                                // how much longer or shorter a candidate is than the song you have
  if (!songMs || !candMs) return '';
  const d = Math.round((candMs - songMs) / 1000), a = Math.abs(d);
  if (a <= 1) return 'same length';
  return (d > 0 ? '+' : '\u2212') + (a >= 60 ? Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0') : a + ' s');
}
function bmCell(has, res, idx) {                                     // what one song says for one service: kept | wait | error | none | confident | look
  if (has) return { s: 'kept', cands: [] };                          // a link you already have is never replaced
  if (!res || res.status === 'loading') return { s: 'wait', cands: [] };
  if (res.status !== 'done') return { s: 'error', cands: [] };
  const c = (res.byIdx && res.byIdx[idx]) || [];
  if (!c.length) return { s: res.searching ? 'wait' : 'none', cands: [] };
  return { s: c[0].band === 'confident' ? 'confident' : 'look', cands: c, top: c[0] };
}
function bmDefaultPick(cell) { return cell.s === 'confident' ? cell.top.id : ''; }          // only a confident match is ticked for you
function bmSongMatches(statuses, filter) {                          // does a song (its status for each shown service) belong under a filter chip
  if (filter === 'confident' || filter === 'look' || filter === 'none') return statuses.includes(filter);
  if (filter === 'kept') return statuses.includes('kept');
  return true;
}
function bmEstimate(o) {                                             // o: { releases, spotify, youtube, viaAddon, ytSongs, used, cap, spPar, ytPar } (spPar/ytPar: how many at once, 1 if left out)
  const spPar = Math.max(1, o.spPar || 1), ytPar = Math.max(1, o.ytPar || 1);
  const out = { spotifySec: o.spotify ? Math.round(Math.max(o.releases * 4 / spPar, o.releases * 0.6)) : 0, ytPages: 0, ytSec: 0, ytTotal: 0, over: false };          // several at once: never under ~0.6 s a release, the spacing of Spotify's requests
  if (o.youtube) { out.ytPages = o.releases * 2 + (o.ytSongs ? Math.round(o.releases * 1.5) : 0); out.ytSec = Math.round(out.ytPages * 2.5 / ytPar); out.ytTotal = (o.used || 0) + out.ytPages; out.over = !!(o.viaAddon && o.cap && out.ytTotal > o.cap); }
  return out;
}
function bmDur(sec) { const n = Math.max(1, sec); return n < 90 ? n + (n === 1 ? ' second' : ' seconds') : Math.round(n / 60) + ' minutes'; }
function bmUpdates(songs, pick, res, linkOf) {                      // what is ticked -> { updates: { trackNum: { spotifyLink?, youtubeLink? } }, n }
  const updates = {}; let n = 0;
  ['spotify', 'youtube'].forEach(kind => songs.forEach(s => {
    const id = pick[kind] && pick[kind][s.idx]; if (!id) return;
    const list = (res[kind] && res[kind].byIdx && res[kind].byIdx[s.idx]) || [], c = list.find(x => x.id === id); if (!c) return;
    (updates[s.trackNum] = updates[s.trackNum] || {})[kind === 'spotify' ? 'spotifyLink' : 'youtubeLink'] = linkOf(kind, c); n++;
  }));
  return { updates, n };
}
// END batch-match

// ---- Match songs: one window for one release or many ----
// Tabs: Start (health check and what to match), Queue (every release in the run), Release (one release's songs, its
// editions and playlists, why each score, keyboard), Check links (saved links that stopped working), Analytics (this run,
// or the whole crate) and History (every batch, each undoable). A run is saved on this device (IndexedDB) as it goes, so
// a reload or a crash doesn't lose it. The lookups and the scoring are the song matcher's own (smSpotifyForRelease,
// smYoutubeForRelease, smScore). The old single-release dialog remains only for a release still being added (its Save
// writes into the Add form's boxes): every other "Match songs" opens this.
let bm = null;                                                      // the run in hand (null when there is none)
const bmEl = (id) => document.getElementById(id);
const BM_LOG_KEY = 'crate_bm_log_v1', BM_HIST_KEY = 'crate_match_history_v1', BM_HIST_MAX = 30, MQ_KEY = 'crate_match_queue_v1', MQ_MAX = 500;
let bmRaf = 0;
function bmRedraw() { if (!bm || bmRaf) return; bmRaf = requestAnimationFrame(() => { bmRaf = 0; bmRender(); bmStripRender(); bmPersistSoon(); }); }
const bmKinds = () => ['spotify', 'youtube'].filter(k => bm.svc[k]);
const bmShownKinds = () => bmKinds().filter(k => bm.show[k]);
const bmName = (k) => k === 'spotify' ? 'Spotify' : 'YouTube';
const bmInitials = (t) => { const w = String(t || '').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : (w[0] || '')[1] || '')).toUpperCase(); };
const bmPl = (n, w, ws) => `${n.toLocaleString('en-US')} ${n === 1 ? w : (ws || w + 's')}`;
function bmSelectedItems() { return state.raw.filter(r => state.selectedAlbums.has(String(r.row))); }
function updateAlbumSelBar() {
  const bar = bmEl('albumSelBar'); if (!bar) return; const n = bmSelectedItems().length;
  const ov = bmEl('batchMatchOverlay'); bar.hidden = n < 2 || !!(ov && !ov.hidden); if (n >= 2) bmEl('albumSelCount').textContent = `${n} selected`;          // (not over the match window)
}
// A song "has" a link of a kind unless a link check found it broken: then it is matched again like a song without one.
function relHas(rel, s, kind) { return smHas(s, kind) && !(rel.broken && rel.broken[kind] && rel.broken[kind][s.idx]); }
const bmCellOf = (rel, s, kind) => bmCell(relHas(rel, s, kind), rel[kind], s.idx);
const bmMk = (it) => ({ row: String(it.row), item: it, songs: null, songsP: null, spotify: null, youtube: null, pick: { spotify: {}, youtube: {} }, touched: { spotify: {}, youtube: {} }, include: true,
  st: { spotify: 'wait', youtube: 'wait' }, err: {}, applied: 0, broken: { spotify: {}, youtube: {} }, checked: { spotify: 0, youtube: 0 } });

// ----- the standing match queue: releases waiting to be matched (added from menus, the player's skips, new releases) -----
function mqAll() { try { const a = JSON.parse(localStorage.getItem(MQ_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function mqSave(a) { try { localStorage.setItem(MQ_KEY, JSON.stringify(a.slice(-MQ_MAX))); } catch (e) { /* kept for this visit only */ } }
const mqKey = (artist, title) => ytCacheNorm(artist) + '|' + ytCacheNorm(title);
function mqAdd(items, why, song) {                                  // items: releases, or { artist, title }
  const a = mqAll(), have = new Set(a.map(e => mqKey(e.a, e.t))); let n = 0;
  (items || []).forEach(it => { if (!it || !it.artist || !it.title) return; const k = mqKey(it.artist, it.title); if (have.has(k)) { const e = a.find(x => mqKey(x.a, x.t) === k); if (song && e && !(e.songs || []).includes(song)) (e.songs = e.songs || []).push(song); return; } have.add(k); a.push({ a: it.artist, t: it.title, why: why || 'added', songs: song ? [song] : [], at: Date.now() }); n++; });
  mqSave(a); if (bm) bmRedraw(); return n;
}
function mqItems() {
  const byKey = new Map(); state.raw.forEach(r => { const k = mqKey(r.artist, r.title); if (!byKey.has(k)) byKey.set(k, r); });
  return mqAll().map(e => byKey.get(mqKey(e.a, e.t))).filter(Boolean);
}
function mqRemove(items) { const ks = new Set(items.map(it => mqKey(it.artist, it.title))); mqSave(mqAll().filter(e => !ks.has(mqKey(e.a, e.t)))); }
function mqWhyCounts() { const c = { skipped: 0, added: 0, menu: 0 }; mqAll().forEach(e => { c[e.why] = (c[e.why] || 0) + 1; }); return c; }

// ----- the run, saved on this device as it goes -----
const bmDb = (() => { let p = null; return () => p || (p = new Promise((res, rej) => { try { const r = indexedDB.open('crate-match', 1); r.onupgradeneeded = () => r.result.createObjectStore('runs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } })); })();
function bmIdb(mode, fn) { return bmDb().then(db => new Promise((res, rej) => { const tx = db.transaction('runs', mode), req = fn(tx.objectStore('runs')); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); })); }
const bmRunGet = () => bmIdb('readonly', st => st.get('current')).catch(() => null);
const bmRunPut = (v) => bmIdb('readwrite', st => st.put(v, 'current')).catch(() => {});
const bmRunDel = () => bmIdb('readwrite', st => st.delete('current')).catch(() => {});
let bmPersistT = 0;
function bmPersistSoon() { if (!bm || !bm.started) return; clearTimeout(bmPersistT); bmPersistT = setTimeout(() => { if (bm && bm.started) bmRunPut(bmSerialize()); }, 1500); }
function bmSerialize() {
  const keep = (r) => r && r.status ? Object.assign({}, r, { searching: undefined }) : null;
  return { v: 1, t: Date.now(), label: bm.label, svc: bm.svc, show: bm.show, ytSongs: bm.ytSongs, mode: bm.mode, songsMode: bm.songsMode, one: bm.one, sel: bm.sel, t0: bm.t0, net0: bm.net0,
    rels: bm.rels.map(r => ({ row: r.row, artist: r.item.artist, title: r.item.title, songs: r.songs, spotify: keep(r.spotify), youtube: keep(r.youtube), pick: r.pick, touched: r.touched, include: r.include,
      st: { spotify: r.st.spotify === 'work' ? 'wait' : r.st.spotify, youtube: r.st.youtube === 'work' ? 'wait' : r.st.youtube }, err: r.err, applied: r.applied, broken: r.broken, checked: r.checked })) };
}
function bmRestore(saved) {
  const find = (x) => state.raw.find(r => String(r.row) === String(x.row) && r.artist === x.artist && r.title === x.title) || state.raw.find(r => r.artist === x.artist && r.title === x.title);
  const rels = [];
  (saved.rels || []).forEach(x => { const it = find(x); if (!it) return; const r = Object.assign(bmMk(it), x, { row: String(it.row), item: it }); r.songsP = r.songs ? Promise.resolve(r.songs) : null; r.touched = r.touched || { spotify: {}, youtube: {} }; rels.push(r); });
  return rels;
}
async function bmSavedSummary() {
  const s = await bmRunGet(); if (!s || !Array.isArray(s.rels) || !s.rels.length) return null;
  const waiting = s.rels.filter(r => r.include && (r.st.spotify === 'wait' || r.st.youtube === 'wait')).length, picks = s.rels.reduce((a, r) => a + Object.keys(r.pick.spotify || {}).length + Object.keys(r.pick.youtube || {}).length, 0);
  return { saved: s, n: s.rels.length, waiting, picks, t: s.t, label: s.label || '' };
}

// ----- history: every Apply, each undoable on its own -----
function bmHistAll() { try { const a = JSON.parse(localStorage.getItem(BM_HIST_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function bmHistSave(a) {
  a = a.slice(-BM_HIST_MAX);
  for (let tries = 0; tries < 4; tries++) { try { localStorage.setItem(BM_HIST_KEY, JSON.stringify(a)); return; } catch (e) { if (a.length <= 1) return; a = a.slice(Math.ceil(a.length / 2)); } }
}
function bmHistStart(label, kind) { const h = { id: 'h' + Date.now().toString(36), t: Date.now(), label, kind: kind || 'batch', entries: [], n: 0, undone: false }; const a = bmHistAll(); a.push(h); bmHistSave(a); return h.id; }
function bmHistPush(id, entry) { const a = bmHistAll(), h = a.find(x => x.id === id); if (!h) return; h.entries.push(entry); h.n += entry.n; h.t = Date.now(); bmHistSave(a); }
async function bmHistUndo(id) {
  const a = bmHistAll(), h = id ? a.find(x => x.id === id) : a.slice().reverse().find(x => !x.undone && x.n);
  if (!h) { flashGlobalToast('There is no song match to undo.'); return; }
  if (!confirm(`Put back the ${bmPl(h.n, 'link')} “${h.label}” changed, in ${bmPl(h.entries.length, 'release')}?`)) return;
  let done = 0, lost = 0;
  for (const e of h.entries.slice().reverse()) {
    const item = state.raw.find(r => String(r.row) === String(e.row) && r.artist === e.artist && r.title === e.title) || state.raw.find(r => r.artist === e.artist && r.title === e.title);
    if (!item) { lost++; continue; }
    if (await saveSongLinks(item, e.prev)) done++;
    const rel = bm && bm.rels.find(r => r.item === item);
    if (rel) { rel.songsP = null; rel.songs = null; bmSongs(rel).then(() => bmRedraw()); }
  }
  h.undone = true; bmHistSave(a.map(x => x.id === h.id ? h : x));
  flashGlobalToast(`Put back ${bmPl(done, 'release')}${lost ? ` (${lost} could not be found)` : ''}.`); if (bm) bmRedraw();
}
async function bmUndoLast() { await bmHistUndo(null); }
// The undo log of versions before 1.62.0 (last batch only) becomes the first history entry.
(function bmHistMigrate() {
  try { const old = JSON.parse(localStorage.getItem(BM_LOG_KEY) || 'null'); if (!old || !Array.isArray(old.entries) || !old.entries.length) return;
    const a = bmHistAll(); a.unshift({ id: 'hold', t: old.t || Date.now(), label: 'Batch match (before 1.62.0)', kind: 'batch', undone: false, entries: old.entries.map(e => Object.assign({ n: Object.values(e.prev || {}).reduce((x, u) => x + Object.keys(u).length, 0) }, e)), n: 0 });
    a[0].n = a[0].entries.reduce((x, e) => x + e.n, 0); bmHistSave(a); localStorage.removeItem(BM_LOG_KEY); } catch (e) { /* nothing to carry over */ }
})();

// ----- what a release's songs look like before anything is looked up -----
function bmKnownTracks(item) {                                      // the tracklist when it is already on hand (manual, or fetched earlier), else null
  if (isManualAlbum(item)) return (item.manualTracks || []).map((t, i) => ({ num: t.trackNumber || i + 1, title: t.title || '' }));
  const c = state.trackCache[artKey(item)]; return c ? c.map((t, i) => ({ num: t.trackNumber || i + 1, title: t.trackName || '' })) : null;
}
function bmLinkState(item) {                                        // [{ sp, yt }] per song, or null when the tracklist isn't on hand
  const tr = bmKnownTracks(item); if (!tr) return null;
  return tr.filter(t => t.title).map(t => { const ov = trackLinkOverridesFor(item, t.num, t.title); return { sp: !!trackSpotifyUriFromLink(ov.spotifyLink), yt: !!youtubeVideoIdFromUrl(ov.youtubeLink) }; });
}
// No song of the release has a link from the services in `kinds` (on its saved songs or in its song data): read without the tracklist, so
// it can be asked of the whole crate at once ("Every release with no song linked yet").
function bmNoLinks(item, kinds) {
  const has = (sp, yt) => kinds.some(k => k === 'spotify' ? !!trackSpotifyUriFromLink(sp) : !!youtubeVideoIdFromUrl(yt));
  return !(item.manualTracks || []).some(t => t && has(t.spotifyLink, t.youtubeLink)) && !Object.values(item.trackData || {}).some(e => e && has(e.spotifyLink, e.youtubeLink));
}
function bmFullyLinked(item, kinds) { const ls = bmLinkState(item); return !!(ls && ls.length && ls.every(x => kinds.every(k => k === 'spotify' ? x.sp : x.yt))); }

// ----- opening -----
// opts: { ticked: [items], view: [items], genre: { name, items }, queue: true, one: item, focusTrackNum }
function bmOpen(opts) {
  opts = opts || {};
  if (bm && bm.started) { if (opts.one) { bmAddOne(opts.one, opts.focusTrackNum); return; } bmShow(); return; }
  const ticked = opts.ticked && opts.ticked.length ? opts.ticked : null;
  bm = { view: 'start', started: false, hidden: false, one: !!opts.one,
    sets: { ticked, view: opts.view || [], genre: opts.genre || null },
    scope: opts.nolinks ? 'nolinks' : opts.queue ? 'queue' : opts.genre ? 'genre' : ticked ? 'ticked' : 'view',
    songsMode: opts.check ? 'check' : 'gaps', skipLinked: true, rels: [], svc: { spotify: true, youtube: ytUseAddon() || !!loadYoutubeApiKey() }, show: { spotify: true, youtube: true },
    ytSongs: ytUseAddon(), mode: 'review', filter: 'all', qfilter: 'all', qsearch: '', qsort: 'look', qsel: new Set(), sel: '', focus: null, open: null, why: null, pasteFor: null, diffOpen: false, anaScope: 'run',
    par: bmParLoad(), paused: false, stopped: false, running: false, lanes: { spotify: { s: 'idle', msg: '' }, youtube: { s: 'idle', msg: '' } }, saved: 0, chain: Promise.resolve(), histId: null,
    health: { spotify: 'checking', test: 'idle' }, savedRun: null, label: '' };
  ytAddonHello(); bmEl('batchMatchOverlay').hidden = false; updateAlbumSelBar(); bmRender();
  bmHealthRun(false);
  if (opts.one) { bmStartOne(opts.one, opts.focusTrackNum); return; }
  bmSavedSummary().then(s => { if (bm && !bm.started) { bm.savedRun = s; bmRender(); } });
}
function bmStartOne(item, focusTrackNum) {                          // one release: no Start screen, straight to its songs
  bm.sets.ticked = [item]; bm.scope = 'ticked'; bm.skipLinked = false; bm.songsMode = 'all';
  bm.svc = { spotify: true, youtube: ytUseAddon() || !!loadYoutubeApiKey() };
  bm.ytDefer = !ytUseAddon();                                       // the API route costs quota: YouTube waits for "Find on YouTube"
  bmStart();
  if (focusTrackNum != null) bm.focusTrackNum = focusTrackNum;
}
function bmAddOne(item, focusTrackNum) {                            // "Match songs" on a release while a run is open: it joins the run
  let rel = bm.rels.find(r => r.item === item);
  if (!rel) { rel = bmMk(item); bmKinds().forEach(k => { rel.st[k] = 'wait'; }); ['spotify', 'youtube'].filter(k => !bm.svc[k]).forEach(k => { rel.st[k] = 'skip'; rel.err[k] = 'Not run'; }); bm.rels.unshift(rel); bmKickLanes(); }
  bm.sel = rel.row; bm.view = 'rel'; bm.focus = null; if (focusTrackNum != null) bm.focusTrackNum = focusTrackNum; bmShow();
}
function bmShow() {
  if (!bm) return; bm.hidden = false; bmEl('batchMatchOverlay').hidden = false; updateAlbumSelBar();
  const rel = bm.rels.find(r => r.row === bm.sel);                   // links may have changed elsewhere meanwhile (the full-release video editor, the track grid)
  if (rel && rel.songs) smBuildSongs(rel.item).then(songs => { if (!bm || !songs.length) return; rel.songs.forEach(s => { const n = songs.find(x => x.idx === s.idx); if (n) { s.spotifyLink = n.spotifyLink; s.youtubeLink = n.youtubeLink; } }); bmRedraw(); });
  bmRender(); bmStripRender();
}
function bmHide() { if (!bm) return; bm.hidden = true; bmEl('batchMatchOverlay').hidden = true; updateAlbumSelBar(); bmStripRender(); }
function bmPickTotals() {
  const t = { n: 0, spotify: 0, youtube: 0, releases: 0 };
  if (!bm) return t;
  bm.rels.forEach(r => { if (!r.include) return; let any = 0; ['spotify', 'youtube'].forEach(k => { const c = Object.values(r.pick[k]).filter(Boolean).length; t[k] += c; any += c; }); t.n += any; if (any) t.releases++; });
  return t;
}
function bmClose(force) {
  if (!bm) { bmEl('batchMatchOverlay').hidden = true; updateAlbumSelBar(); return; }
  if (bm.started && bm.running && !force) { bmHide(); return; }                      // still working: closing the window is "keep working"
  const t = bmPickTotals();
  if (!force && bm.started && t.n > 0 && !confirm(`Discard ${bmPl(t.n, 'match', 'matches')} you haven’t applied?`)) return;
  if (bm.running) { bm.stopped = true; ytAddonCancel(); }
  const wasStarted = bm.started;
  bm = null; spotifyApiParallel = 1; bmEl('batchMatchOverlay').hidden = true; updateAlbumSelBar(); bmStripRender();
  if (wasStarted) bmRunDel();
  if (typeof tgAfterMatcher === 'function') tgAfterMatcher();
}

// ----- the health check: is each service really answering? -----
const BM_TEST_QUERIES = ['Radiohead Karma Police', 'Fleetwood Mac Dreams', 'Talking Heads Once in a Lifetime', 'Kate Bush Running Up That Hill', 'The Cure Just Like Heaven', 'Joy Division Atmosphere', 'Pixies Where Is My Mind', 'Portishead Glory Box', 'Massive Attack Teardrop', 'Cocteau Twins Heaven or Las Vegas', 'New Order Ceremony', 'The Smiths There Is a Light That Never Goes Out'];
async function bmHealthRun(force) {
  if (!bm) return; const h = bm.health;
  h.spotify = 'checking'; bmRedraw();
  try { h.spotify = (await getSpotifyToken()) ? 'ok' : 'off'; } catch (e) { h.spotify = 'off'; }
  h.key = !!loadYoutubeApiKey(); h.addon = ytAddon.ready; h.addonVersion = ytAddon.version; h.parallel = ytAddon.parallel;
  if (ytUseAddon() && (force || h.test === 'idle')) {                // one YouTube search, read by the add-on: does it still understand YouTube's pages?
    h.test = 'running'; bmRedraw();
    try { const r = await withHardTimeout(ytAddonRequest({ kind: 'search-video', q: BM_TEST_QUERIES[Math.floor(Math.random() * BM_TEST_QUERIES.length)] }), 60000, null); h.test = r === null ? 'err:it took too long to answer' : r.length ? 'ok:' + r.length : 'zero'; }
    catch (e) { h.test = 'err:' + ytAddonErrText(e); }
  }
  bmRedraw();
}
const bmHealthBad = () => !!(bm && (bm.health.spotify === 'off' && bm.svc.spotify || bm.health.test === 'zero' || /^err:/.test(bm.health.test || '')));

// ----- what gets matched -----
function bmScopeItems() {
  const s = bm.sets, src = bm.scope === 'ticked' ? (s.ticked || []) : bm.scope === 'genre' ? ((s.genre && s.genre.items) || []) : bm.scope === 'queue' ? mqItems() : bm.scope === 'nolinks' ? bmNoLinksItems() : (s.view || []);
  if (!bm.skipLinked || bm.songsMode === 'check') return { items: src, skipped: 0 };
  const kinds = bmKinds(); if (!kinds.length) return { items: src, skipped: 0 };
  const items = src.filter(it => !bmFullyLinked(it, kinds));
  return { items, skipped: src.length - items.length };
}
function bmNoLinksItems() { const kinds = bmKinds().length ? bmKinds() : ['spotify', 'youtube']; return (state.raw || []).filter(it => it && it.artist && it.title && bmNoLinks(it, kinds)); }
function bmStart() {
  if (!bmKinds().length) { flashGlobalToast('Tick Spotify, YouTube or both.'); return; }
  const { items } = bmScopeItems();
  if (!items.length) { flashGlobalToast(bm.skipLinked ? 'Every one of those releases is already fully linked.' : 'There are no releases to match.'); return; }
  bm.rels = items.map(bmMk); bm.started = true; bm.running = true; bm.stopped = false; bm.paused = false;
  bm.view = bm.one ? 'rel' : bm.songsMode === 'check' ? 'links' : 'queue'; bm.sel = bm.rels[0].row; bm.t0 = Date.now(); bm.net0 = Object.assign({}, smNet);
  bm.label = bm.one ? items[0].title : bm.songsMode === 'check' ? `Link check · ${bmPl(items.length, 'release')}` : bm.scope === 'genre' && bm.sets.genre ? `${bm.sets.genre.name} · ${bmPl(items.length, 'release')}` : bm.scope === 'queue' ? `Match queue · ${bmPl(items.length, 'release')}` : bm.scope === 'nolinks' ? `No links yet · ${bmPl(items.length, 'release')}` : bmPl(items.length, 'release');
  if (bm.scope === 'queue') mqRemove(items);                          // they are in this run now (which is saved), not waiting any more
  ['spotify', 'youtube'].forEach(k => { if (!bm.svc[k]) { bm.lanes[k] = { s: 'off', msg: '' }; bm.rels.forEach(r => { r.st[k] = 'skip'; r.err[k] = 'Not run'; }); } });
  if (bm.ytDefer && bm.svc.youtube) bm.rels.forEach(r => { r.st.youtube = 'skip'; r.err.youtube = 'Not run'; });
  bmRender(); bmStripRender(); bmPersistSoon();
  bmKinds().forEach(k => { bmRunLane(k); });
}
function bmKickLanes() {                                            // releases are waiting again (added, re-run): start any lane that has stopped working
  if (!bm || !bm.started) return; bm.running = true; bm.stopped = false;
  bmKinds().forEach(k => { const l = bm.lanes[k]; if (l.s !== 'work' && bm.rels.some(r => r.include && r.st[k] === 'wait')) bmRunLane(k); });
}
// ----- new releases are matched by themselves (Match songs → Preferences → "Match new releases by themselves") -----
// A release just added (the Add form, Rate Your Music, an import) goes into a Match songs run in the background, in "save confident matches as they come" mode:
// what is confident is saved, and the rest waits in the run for you (Processing → Needs you). Spotify only if it is set up; YouTube only through the add-on (the API route costs quota).
const bmAuto = { pending: [], timer: 0, tries: 0 };
function bmAutoQueue(list) {
  (list || []).forEach(x => { const k = mqKey(x.artist, x.title); if (!bmAuto.pending.some(e => e.k === k)) bmAuto.pending.push({ k }); });
  bmAuto.tries = 0; clearTimeout(bmAuto.timer); bmAuto.timer = setTimeout(bmAutoRun, 5000);          // (a few seconds: an import adds one after another, and a new release reaches the list after its save)
}
function bmAutoRun() {
  bmAuto.timer = 0; if (!bmAuto.pending.length) return;
  const later = (ms) => { if (++bmAuto.tries <= 40) bmAuto.timer = setTimeout(bmAutoRun, ms); else bmAuto.pending = []; };          // (given up after a while: they are still in the match queue)
  if ((typeof cxImp !== 'undefined' && cxImp && cxImp.running) || (bm && !bm.started)) { later(15000); return; }          // an import still adding, or Match songs open at its start: afterwards
  const byKey = new Map(); state.raw.forEach(r => { const k = mqKey(r.artist, r.title); if (!byKey.has(k)) byKey.set(k, r); });
  const all = bmAuto.pending.map(e => byKey.get(e.k)).filter(Boolean);
  if (all.length < bmAuto.pending.length && bmAuto.tries < 3) { later(10000); return; }          // the rest may not have reached the list yet
  const held = new Set(all.filter(it => rymAddHolding(it) || afPending(it)).map(it => mqKey(it.artist, it.title))), found = all.filter(it => !held.has(mqKey(it.artist, it.title)));          // (still to be updated from Rate Your Music, or its blanks filled: matched after that)
  bmAuto.pending = bmAuto.pending.filter(e => !byKey.has(e.k) || held.has(e.k));
  const svc = { spotify: !!(loadSpotifyCreds() || {}).clientId, youtube: ytUseAddon() }, kinds = ['spotify', 'youtube'].filter(k => svc[k]);
  if (!kinds.length) { bmAuto.pending = []; return; }          // nothing to match with: they wait in the match queue as before
  const items = found.filter(it => !bmFullyLinked(it, kinds) && !(bm && bm.rels.some(r => r.item === it)));
  if (items.length) {
    mqRemove(items);                                                // in a run now, not waiting in the queue
    if (bm && bm.started) {                                         // a run is open: they join it
      items.forEach(it => { const rel = bmMk(it); bmKinds().forEach(k => { rel.st[k] = 'wait'; }); ['spotify', 'youtube'].filter(k => !bm.svc[k]).forEach(k => { rel.st[k] = 'skip'; rel.err[k] = 'Not run'; }); bm.rels.push(rel); });
      bmKickLanes(); bmRedraw();
    } else {
      bmOpen({ ticked: items }); bmEl('batchMatchOverlay').hidden = true;          // (never shown: it runs behind whatever you are doing)
      Object.assign(bm, { scope: 'ticked', songsMode: 'gaps', skipLinked: true, mode: 'auto', svc, auto: true });
      bmHide(); bmStart(); if (bm && !bm.hidden) bmHide();          // (hidden first: a lane with nothing to do can finish before bmStart returns)
      if (bm && bm.started) bm.label = `New releases \u00b7 ${bmPl(items.length, 'release')}`;
    }
    jobsRefresh();
  }
  if (held.size) { clearTimeout(bmAuto.timer); bmAuto.timer = setTimeout(bmAutoRun, 15000); }          // (waiting for RYM is not a failed try)
  else if (bmAuto.pending.length) later(20000);
}
// ----- the lanes: each service works through the releases at its own pace -----
function bmSongs(rel) { return rel.songsP || (rel.songsP = smBuildSongs(rel.item).then(s => { rel.songs = s; return s; })); }
function bmSetPicks(rel, kind) {                                    // what is ticked for you: confident matches (in a link check, only for links found broken)
  if (!rel.songs) return;
  rel.songs.forEach(s => {
    if (rel.touched[kind] && rel.touched[kind][s.idx]) return;
    if (bm && bm.songsMode === 'check' && !(rel.broken[kind] && rel.broken[kind][s.idx])) return;
    const id = bmDefaultPick(bmCellOf(rel, s, kind)); if (id) rel.pick[kind][s.idx] = id; else delete rel.pick[kind][s.idx];
  });
}
function bmFilterRejected(res, kind) {                              // candidates you said never to offer again are dropped
  const rej = new Set(smPrefs().rejected); if (!res || !res.byIdx || !rej.size) return res;
  Object.keys(res.byIdx).forEach(i => { res.byIdx[i] = res.byIdx[i].filter(c => !rej.has(kind + ':' + c.id)); if (!res.byIdx[i].length) delete res.byIdx[i]; });
  return res;
}
async function bmSearchRest(rel) {                                  // YouTube, song by song, for what the playlist didn't have
  if (!rel.youtube || rel.youtube.status !== 'done') rel.youtube = Object.assign({ status: 'done', byIdx: {} }, rel.youtube && rel.youtube.status === 'done' ? rel.youtube : {});
  const idxs = rel.songs.filter(s => !relHas(rel, s, 'youtube') && !((rel.youtube.byIdx[s.idx] || []).length)).map(s => s.idx).slice(0, 40);
  if (!idxs.length) return;
  rel.youtube.searching = true; bmRedraw();
  try { await smYoutubeSearchSongs(rel.item, rel.songs, idxs, (idx, top) => { if (top.length) rel.youtube.byIdx[idx] = top; bmFilterRejected(rel.youtube, 'youtube'); bmSetPicks(rel, 'youtube'); bmRedraw(); }); }
  finally { delete rel.youtube.searching; bmRedraw(); }
}
// How many releases each service works on at once, chosen on the Start screen and remembered on this device.
// Spotify's requests then run that many at once too (spotifyApiParallel). For YouTube through the add-on, how many
// PAGES it reads at once is the add-on's own setting (its Options); this is how many releases keep it supplied.
const BM_PAR_KEY = 'crate_bm_parallel_v1', BM_PAR_DEFAULT = { spotify: 4, youtube: 3 }, BM_PAR_CHOICES = [1, 2, 3, 4, 6, 8];
function bmParLoad() {
  try { const o = JSON.parse(localStorage.getItem(BM_PAR_KEY) || '{}'); return { spotify: BM_PAR_CHOICES.includes(o.spotify) ? o.spotify : BM_PAR_DEFAULT.spotify, youtube: BM_PAR_CHOICES.includes(o.youtube) ? o.youtube : BM_PAR_DEFAULT.youtube }; }
  catch (e) { return Object.assign({}, BM_PAR_DEFAULT); }
}
function bmParSave(par) { try { localStorage.setItem(BM_PAR_KEY, JSON.stringify(par)); } catch (e) { /* kept for this visit only */ } }

// ----- checking saved links -----
function bmMarket() { const m = /[-_]([A-Za-z]{2})$/.exec(navigator.language || ''); return m ? m[1].toUpperCase() : 'US'; }
// Saved links that no longer work: { idx: { reason, newId? } }. Spotify: removed, not playable in your country, or
// replaced by a new id (relinked: the same song). YouTube: deleted or private, not playable in an embedded player, or
// blocked in your country (with an API key: 1 unit for 50 videos; without one, YouTube's public oEmbed answer).
async function bmCheckLinks(kind, songs) {
  const out = {}, market = bmMarket();
  if (kind === 'spotify') {
    const getJson = await smSpotifyGetter(); if (!getJson) throw new Error('Spotify isn’t connected');
    const ids = [...new Set(songs.map(s => smLinkId(s, 'spotify')).filter(Boolean))];
    const info = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const d = await getJson(`https://api.spotify.com/v1/tracks?ids=${ids.slice(i, i + 50).join(',')}&market=${market}`);
      (d.tracks || []).forEach((t, j) => info.set(ids[i + j], t));
    }
    songs.forEach(s => {
      const id = smLinkId(s, 'spotify'); if (!id) return; const t = info.get(id);
      if (!t) out[s.idx] = { reason: 'Removed from Spotify' };
      else if (t.linked_from && t.linked_from.id === id && t.id && t.id !== id) out[s.idx] = { reason: 'Spotify replaced it (same song, new id)', newId: t.id, title: t.name, durationMs: t.duration_ms || 0, artists: (t.artists || []).map(a => a.name), album: (t.album && t.album.name) || '' };
      else if (t.is_playable === false) out[s.idx] = { reason: `Not playable in ${market}` };
    });
    return out;
  }
  const ids = [...new Set(songs.map(s => youtubeVideoIdFromUrl(s.youtubeLink)).filter(Boolean))], bad = new Map();
  if (loadYoutubeApiKey()) {
    for (let i = 0; i < ids.length; i += 50) {
      const d = await smYtApi('videos', { part: 'status,contentDetails,snippet', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, 1);
      const seen = new Map((d.items || []).map(v => [v.id, v]));
      ids.slice(i, i + 50).forEach(id => {
        const v = seen.get(id); if (!v) { bad.set(id, 'Deleted or private'); return; }
        if (v.snippet) ytInfoSet(id, v.snippet.title, v.snippet.channelTitle);          // (the same request: no extra quota)
        const rr = v.contentDetails && v.contentDetails.regionRestriction;
        if (v.status && v.status.embeddable === false) bad.set(id, 'Can’t play inside CRATE (embedding is off)');
        else if (rr && ((rr.blocked || []).includes(market) || (rr.allowed && !rr.allowed.includes(market)))) bad.set(id, `Blocked in ${market}`);
      });
    }
  } else {
    for (const id of ids) {
      let res; try { res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { credentials: 'omit' }); smNet.ytApi++; }
      catch (e) { throw new Error('YouTube links can’t be checked from here without a YouTube API key (⚙ → YouTube API…)'); }
      if (res.status === 401 || res.status === 403) bad.set(id, 'Can’t play inside CRATE (embedding is off)');
      else if (!res.ok) bad.set(id, 'Deleted or private');
      else { try { const j = await res.json(); ytInfoSet(id, j.title, j.author_name); } catch (e) { /* works; no title */ } }
    }
  }
  songs.forEach(s => { const id = youtubeVideoIdFromUrl(s.youtubeLink); if (id && bad.has(id)) out[s.idx] = { reason: bad.get(id) }; });
  return out;
}

// A release with no tracklist yet that will get one from its first Rate Your Music update (just added from RYM, its update still to come) isn't
// "No tracklist": it waits for that update (queued here if it isn't already), and is matched by itself once the tracklist is saved (bmTracklistArrived).
const BM_TL_WAIT = 'Waiting for its tracklist from RYM', bmTlQ = { items: [], timer: 0 };
function bmTlFromRym(item) {
  if (!item || item.rymUpdated || !rymUpdateUrl(item) || !rymOutState.present) return false;
  if (!bmTlQ.items.includes(item)) bmTlQ.items.push(item);
  clearTimeout(bmTlQ.timer); bmTlQ.timer = setTimeout(() => { const l = bmTlQ.items.splice(0); if (l.length) rymFetchUpdates(l, { queued: true }); }, 1500);          // (together: one run for all of them)
  return true;
}
function bmTracklistArrived(item) {                                  // saveManualTracklist calls this: a release waiting for its tracklist is matched now
  if (!bm || !bm.started) return;
  const rels = bm.rels.filter(r => r.item === item || String(r.row) === String(item.row));
  let again = false;
  rels.forEach(rel => ['spotify', 'youtube'].forEach(k => { if (rel.err[k] === BM_TL_WAIT) { rel.st[k] = 'wait'; delete rel.err[k]; rel.songs = null; rel.songsP = null; again = true; } }));
  if (again) { bmKickLanes(); bmRedraw(); }
}
async function bmRunLane(kind) {
  const b = bm, lane = b.lanes[kind], run = lane.run = (lane.run || 0) + 1;
  lane.s = 'work'; lane.msg = ''; lane.halt = false;
  const par = Math.max(1, (b.par && b.par[kind]) || 1);
  if (kind === 'spotify') spotifyApiParallel = par;
  const live = () => bm === b && lane.run === run && !lane.halt;
  const halt = (msg) => { lane.halt = true; lane.s = 'stopped'; lane.msg = msg; };
  // `par` workers take the next waiting release each, until none is left: several releases are worked on at once,
  // and they finish in whatever order their lookups come back.
  async function worker() {
    for (;;) {
      if (!live()) return;
      while (b.paused && !b.stopped && live()) await new Promise(r => setTimeout(r, 250));
      if (!live()) return;
      if (b.stopped) { halt('Stopped.'); return; }
      if (kind === 'youtube' && ytUseAddon() && ytAddon.cap && ytAddon.today >= ytAddon.cap - 1) { halt(`The add-on’s limit of ${ytAddon.cap} YouTube pages a day is used up. The rest wait: press Resume tomorrow.`); return; }
      const rel = b.rels.find(r => r.include && r.st[kind] === 'wait');
      if (!rel) return;
      rel.st[kind] = 'work'; delete rel.err[kind]; bmRedraw();
      try {
        const songs = await bmSongs(rel);
        if (bm !== b) return;
        if (!songs.length) { rel.st[kind] = 'skip'; rel.err[kind] = bmTlFromRym(rel.item) ? BM_TL_WAIT : 'No tracklist'; bmRedraw(); continue; }
        let relinkOnly = false;
        if (b.songsMode === 'check') {
          const linked = songs.filter(s => smHas(s, kind));
          if (!linked.length) { rel.st[kind] = 'skip'; rel.err[kind] = 'No links to check'; bmRedraw(); continue; }
          rel.broken[kind] = await bmCheckLinks(kind, linked); rel.checked[kind] = linked.length;
          if (bm !== b) return;
          const broken = Object.keys(rel.broken[kind]);
          if (!broken.length) { rel[kind] = { status: 'done', byIdx: {} }; rel.st[kind] = 'done'; bmRedraw(); continue; }
          relinkOnly = broken.every(i => rel.broken[kind][i].newId);
        } else if (b.songsMode === 'gaps' && songs.every(s => smHas(s, kind))) { rel.st[kind] = 'skip'; rel.err[kind] = 'All linked'; bmRedraw(); continue; }
        const r = relinkOnly ? { status: 'done', byIdx: {} } : kind === 'spotify' ? await smSpotifyForRelease(rel.item, songs) : await smYoutubeForRelease(rel.item, songs);
        if (bm !== b) return;
        if (r.status === 'nocreds' || r.status === 'nokey') {
          rel.st[kind] = 'wait';
          halt(kind === 'spotify' ? 'Spotify isn’t connected yet: connect it first (⚙ → Spotify API…), then press Resume.' : 'YouTube isn’t set up: install the CRATE for YouTube add-on or add an API key (⚙ → YouTube API…), then press Resume.');
          return;
        }
        Object.entries(rel.broken[kind] || {}).forEach(([i, br]) => {        // Spotify's own replacement for a relinked track is the answer, whatever a search found
          if (!br.newId) return; const s = songs.find(x => String(x.idx) === String(i)); if (!s) return;
          const c = { id: br.newId, title: br.title || s.title, artists: br.artists || [], durationMs: br.durationMs || 0, album: br.album || '', source: 'relinked', score: 100, band: 'confident', reasons: ['Spotify’s own replacement for this track'], parts: [{ label: 'Spotify’s replacement', points: 100 }] };
          r.byIdx[s.idx] = [c, ...((r.byIdx[s.idx] || []).filter(x => x.id !== c.id))];
        });
        rel[kind] = bmFilterRejected(r, kind); rel.st[kind] = 'done';
        if (r.status === 'done') {
          bmSetPicks(rel, kind);
          if (kind === 'youtube' && b.ytSongs && b.songsMode !== 'check') { try { await bmSearchRest(rel); } catch (e) { rel.err.youtube = ytAddonErrText(e); if (/daily|quota/i.test(String(e && e.message))) throw e; } bmSetPicks(rel, 'youtube'); }
          if (b.mode === 'auto') bmApplyRel(rel, kind);
        }
      } catch (e) {
        if (bm !== b) return;
        const msg = kind === 'youtube' ? ytAddonErrText(e) : String((e && e.message) || e);
        rel.st[kind] = 'error'; rel.err[kind] = msg;
        if (/session expired|daily|quota/i.test(String((e && e.message) || e))) { rel.st[kind] = 'wait'; halt(msg); return; }
      }
      bmRedraw();
      if (kind === 'spotify' && par === 1) await new Promise(r => setTimeout(r, 120));
    }
  }
  await Promise.all(Array.from({ length: par }, worker));
  if (lane.run !== run) return;                                         // resumed since: that run carries on
  if (kind === 'spotify') spotifyApiParallel = 1;
  if (bm === b && lane.s === 'work') lane.s = 'done';
  if (bm === b) { bmRedraw(); bmCheckDone(); }
}
function bmCheckDone() {
  if (!bm || !bm.running || !bmKinds().every(k => bm.lanes[k].s !== 'work')) return;
  bm.running = false;
  if (bm.auto) {                                                    // new releases matched in the background: once the confident matches are saved (they queue on bm.chain)...
    const b = bm; bmRedraw();
    b.chain.then(() => {
      if (bm !== b || b.running) return;                            // (more joined it meanwhile: this is said when they are done)
      const left = bmPickTotals().n, n = b.saved, r = b.rels.length;
      jobsDone('match', `New releases matched: ${bmPl(r, 'release')}${n ? `, ${bmPl(n, 'link')} saved` : ''}${left ? `, ${left} to look at` : ''}`);
      const tlWait = b.rels.some(r => Object.values(r.err || {}).includes(BM_TL_WAIT));          // (some still wait for their tracklist: the run stays, they are matched when it comes)
      if (b.hidden && !left && !tlWait) { bmClose(true); flashGlobalToast(n ? `Matched ${bmPl(r, 'new release')}: saved ${bmPl(n, 'song link')}.` : `Matched ${bmPl(r, 'new release')}: nothing confident enough to save.`); }          // ...nothing left for you: it closes itself
      else if (b.hidden) flashGlobalToast(`Matched ${bmPl(r, 'new release')}: saved ${bmPl(n, 'song link')}; ${bmPl(left, 'match', 'matches')} need a look. Click to see them.`, { onClick: bmShow });
      jobsRefresh();
    });
    return;
  }
  jobsDone('match', `Matching songs finished: ${bmPl(bm.rels.length, 'release')}${bm.saved ? `, ${bmPl(bm.saved, 'link')} saved` : ''}`);
  if (bm.songsMode === 'check' && bmKinds().every(k => bm.lanes[k].s === 'done')) smPrefsSave({ lastCheck: Date.now() });
  if (bm.hidden) flashGlobalToast('Matching songs has finished: open it to choose what to keep.', { onClick: bmShow });
  bmRedraw();
}
function bmResumeLane(kind) { if (!bm || bm.lanes[kind].s !== 'stopped') return; bm.stopped = false; bm.running = true; bmRunLane(kind); bmRender(); }
function bmRerun(rels, kinds) {                                      // look these up again from scratch (picks you made for them are dropped)
  (kinds || bmKinds()).forEach(k => rels.forEach(r => { r.st[k] = 'wait'; r[k] = null; r.pick[k] = {}; r.touched[k] = {}; r.broken[k] = {}; delete r.err[k]; }));
  rels.forEach(r => { r.include = true; r.songsP = null; r.songs = null; });
  bmKickLanes(); bmRedraw();
}
function bmRunKindFor(rel, kind) {                                   // a service that wasn't part of the run, for one release ("Find on YouTube")
  if (!bm.svc[kind]) { bm.svc[kind] = true; bm.show[kind] = true; bm.lanes[kind] = { s: 'idle', msg: '' }; bm.rels.forEach(r => { if (r !== rel) { r.st[kind] = 'skip'; r.err[kind] = 'Not run'; } }); }
  rel.st[kind] = 'wait'; delete rel.err[kind]; bmKickLanes(); bmRedraw();
}

// ----- choosing another edition, playlist, or a link of your own -----
function bmUseEdition(rel, kind, id) {
  const r = rel[kind]; if (!r || !rel.songs) return;
  if (kind === 'spotify') {
    const al = (r.editions || []).find(e => e.id === id); if (!al) return;
    r.byIdx = smSpotifyByEdition(rel.songs, r.editions, al, r.byIdx); r.albumName = al.name; r.albumUrl = al.url; r.albumId = al.id; r.fit = al.fit;
  } else {
    const pl = (r.lists || []).find(e => e.id === id); if (!pl) return;
    r.byIdx = smYoutubeByList(rel.songs, r.lists, pl); r.playlistTitle = pl.name; r.playlistChannel = pl.channel; r.playlistId = pl.id; r.playlistUrl = 'https://www.youtube.com/playlist?list=' + pl.id; r.fit = pl.fit; r.none = false;
  }
  bmFilterRejected(r, kind); rel.pick[kind] = {}; rel.touched[kind] = {}; bmSetPicks(rel, kind); bmRedraw();
}
async function bmPasteSource(rel, kind, text) {                      // an album (Spotify) or playlist (YouTube) link you paste becomes the source
  const v = String(text || '').trim();
  try {
    if (kind === 'spotify') {
      const m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/([A-Za-z0-9]+)|spotify:album:([A-Za-z0-9]+)/.exec(v); if (!m) { flashGlobalToast('That isn’t a Spotify album link.'); return; }
      const getJson = await smSpotifyGetter(); if (!getJson) { flashGlobalToast('Spotify isn’t connected.'); return; }
      const al = await smSpotifyReadAlbum(getJson, m[1] || m[2], true);
      const f = smAlbumFit(rel.songs, al.tracks); al.fit = Math.round(f.fit); al.matched = f.matched;
      rel.spotify = rel.spotify && rel.spotify.status === 'done' ? rel.spotify : { status: 'done', byIdx: {}, editions: [] };
      rel.spotify.editions = [al, ...(rel.spotify.editions || []).filter(e => e.id !== al.id)];
      rel.st.spotify = 'done'; bmUseEdition(rel, 'spotify', al.id);
    } else {
      const m = /[?&]list=([A-Za-z0-9_-]{13,64})/.exec(v); if (!m) { flashGlobalToast('That isn’t a YouTube playlist link.'); return; }
      const pl = await smYtReadPlaylist(m[1], 'Your playlist', '');
      const f = smAlbumFit(rel.songs, pl.tracks); pl.fit = Math.round(f.fit); pl.matched = f.matched;
      rel.youtube = rel.youtube && rel.youtube.status === 'done' ? rel.youtube : { status: 'done', byIdx: {}, lists: [] };
      rel.youtube.lists = [pl, ...(rel.youtube.lists || []).filter(e => e.id !== pl.id)];
      rel.st.youtube = 'done'; bmUseEdition(rel, 'youtube', pl.id);
    }
    bm.pasteFor = null; bmRedraw();
  } catch (e) { flashGlobalToast(kind === 'youtube' ? ytAddonErrText(e) : String((e && e.message) || e)); }
}
function bmPasteSong(rel, idx, kind, text) {                         // a song link you paste is used for that song
  const v = String(text || '').trim();
  const id = kind === 'spotify' ? (() => { const u = trackSpotifyUriFromLink(v); return u && u.startsWith('spotify:track:') ? u.slice('spotify:track:'.length) : null; })() : youtubeVideoIdFromUrl(v);
  if (!id) { flashGlobalToast(kind === 'spotify' ? 'That isn’t a Spotify track link.' : 'That isn’t a YouTube video link.'); return; }
  rel[kind] = rel[kind] && rel[kind].status === 'done' ? rel[kind] : { status: 'done', byIdx: {} }; if (rel.st[kind] !== 'done') rel.st[kind] = 'done';
  const c = { id, title: 'Your link', channel: '', artists: [], durationMs: 0, score: 100, band: 'confident', reasons: ['a link you pasted'], parts: [{ label: 'pasted by you', points: 100 }], source: 'pasted', link: kind === 'youtube' ? v : smCandLink(kind, { id }) };
  rel[kind].byIdx[idx] = [c, ...((rel[kind].byIdx[idx] || []).filter(x => x.id !== id))];
  bmSetPick(rel, idx, kind, id, true); bm.open = null; bmRedraw();
}
function bmReject(rel, idx, kind, id) {                              // "Never offer this": remembered, and the next candidate takes its place
  smPrefsSave({ rejected: [...smPrefs().rejected, kind + ':' + id] });
  const r = rel[kind]; if (r && r.byIdx[idx]) { r.byIdx[idx] = r.byIdx[idx].filter(c => c.id !== id); if (!r.byIdx[idx].length) delete r.byIdx[idx]; }
  if (rel.pick[kind][idx] === id) delete rel.pick[kind][idx];
  bm.why = null; bmRedraw();
}
function bmSetPick(rel, idx, kind, id, byYou) {
  if (id) rel.pick[kind][idx] = id; else delete rel.pick[kind][idx];
  if (byYou) {
    rel.touched[kind][idx] = true;
    const cands = (rel[kind] && rel[kind].byIdx[idx]) || [], c = cands.find(x => x.id === id);
    if (kind === 'youtube' && c && c.channel && cands[0] && cands[0].id !== id) { const ch = Object.assign({}, smPrefs().channels); ch[smArtistKey(rel.item.artist)] = c.channel; smPrefsSave({ channels: ch }); }   // you chose another channel for this artist: preferred from now on
  }
}

// ----- applying what is ticked, and taking it back -----
function bmApplyRel(rel, onlyKind, histLabel) {
  const b = bm;
  b.chain = b.chain.then(async () => {
    if (!rel.songs) return;
    const pick = onlyKind ? { [onlyKind]: rel.pick[onlyKind] } : rel.pick;
    const { updates, n } = bmUpdates(rel.songs, pick, { spotify: rel.spotify, youtube: rel.youtube }, (kind, c) => c.link || smCandLink(kind, c));
    if (!n) return;
    const prev = {}; Object.keys(updates).forEach(num => { const td = (rel.item.trackData || {})[num] || {}; prev[num] = {}; Object.keys(updates[num]).forEach(f => { prev[num][f] = td[f] || ''; }); });
    const ok = await saveSongLinks(rel.item, updates);
    if (!ok) return;
    rel.songs.forEach(s => { const u = updates[s.trackNum]; if (u) { if (u.spotifyLink) s.spotifyLink = u.spotifyLink; if (u.youtubeLink) s.youtubeLink = u.youtubeLink; } });
    ['spotify', 'youtube'].forEach(k => { if (!onlyKind || onlyKind === k) { rel.pick[k] = {}; rel.broken[k] = {}; } });
    if (!b.histId) b.histId = bmHistStart(histLabel || b.label || 'Match songs', b.songsMode === 'check' ? 'check' : (b.one || histLabel) ? 'release' : 'batch');
    bmHistPush(b.histId, { row: rel.row, artist: rel.item.artist, title: rel.item.title, prev, n });
    rel.applied += n; b.saved += n; bmRedraw();
  }).catch(() => { /* a failed save has already said so */ });
  return b.chain;
}
async function bmApply(rels, label) {
  if (!bm) return; rels = rels || bm.rels.filter(r => r.include);
  const n0 = rels.reduce((a, r) => a + Object.keys(r.pick.spotify).length + Object.keys(r.pick.youtube).length, 0); if (!n0) return;
  const before = bm.saved; bm.applying = true; bm.histId = null; bmRender();
  for (const rel of rels) await bmApplyRel(rel, null, label);
  bm.histId = null; bm.applying = false; bm.diffOpen = false;
  const n = bm.saved - before; flashGlobalToast(`Saved ${bmPl(n, 'link')}.`); bmRender(); bmStripRender();
}
function bmAfterMatcher() { }                                       // the old dialog's hand-back (it is no longer opened from here)
// ----- what each release and song looks like now -----
const bmChip = (cls, t) => `<span class="bm-chip bm-${cls}">${t}</span>`;
function bmRelPicks(rel) { return Object.keys(rel.pick.spotify).length + Object.keys(rel.pick.youtube).length; }
function bmNeedCount(rel) {                                         // songs (per service) still waiting for your decision
  let n = 0; if (!rel.songs) return 0;
  bmShownKinds().forEach(k => { if (rel.st[k] !== 'done') return; rel.songs.forEach(s => {
    if (bm.songsMode === 'check' && !(rel.broken[k] && rel.broken[k][s.idx])) return;
    const c = bmCellOf(rel, s, k), t = rel.touched[k] && rel.touched[k][s.idx];
    if ((c.s === 'look' && !rel.pick[k][s.idx] && !t) || (c.s === 'none' && !t)) n++;
  }); });
  return n;
}
function bmAlign(rel, kind) {                                       // your tracklist against the chosen edition / playlist
  const r = rel[kind]; if (!r || r.status !== 'done' || !rel.songs) return null;
  const chosen = kind === 'spotify' ? (r.editions || []).find(e => e.id === r.albumId) : (r.lists || []).find(e => e.id === r.playlistId);
  if (!chosen) return null;
  const used = new Set(rel.songs.map(s => { const c = (r.byIdx[s.idx] || [])[0]; return c && (c.source === 'album' || c.source === 'playlist') ? c.id : null; }).filter(Boolean));
  return { count: chosen.tracks.length, extras: chosen.tracks.filter(t => !used.has(t.id)), missing: rel.songs.filter(s => { const c = (r.byIdx[s.idx] || [])[0]; return !(c && (c.source === 'album' || c.source === 'playlist')); }), name: chosen.name };
}
function bmRelStatus(rel) {
  const kinds = bmShownKinds();
  if (!rel.include) return { key: 'skip', label: 'Skipped', tone: 'wait' };
  if (kinds.some(k => rel.st[k] === 'work')) return { key: 'work', label: 'Working', tone: 'work' };
  if (kinds.every(k => rel.st[k] === 'wait' || (rel.st[k] === 'skip' && rel.err[k] === 'Not run'))) { const pos = bm.rels.filter(r => r.include && kinds.some(k => r.st[k] === 'wait')).indexOf(rel) + 1; return { key: 'wait', label: pos ? `Queued #${pos}` : 'Queued', tone: 'wait' }; }
  if (kinds.some(k => rel.err[k] === BM_TL_WAIT)) return { key: 'wait', label: 'Tracklist from RYM first', tone: 'wait' };
  if (kinds.some(k => rel.err[k] === 'No tracklist')) return { key: 'problem', label: 'No tracklist', tone: 'look' };
  if (kinds.some(k => rel.st[k] === 'error')) return { key: 'problem', label: 'Problem', tone: 'look' };
  const need = bmNeedCount(rel);
  if (!need && kinds.some(k => rel.st[k] === 'wait')) return { key: 'wait', label: 'Queued', tone: 'wait' };          // one service is done, another hasn't reached it yet
  if (need && kinds.some(k => { const a = bmAlign(rel, k); return a && a.count !== (rel.songs || []).length && a.missing.length; })) return { key: 'problem', label: 'Tracklist differs', tone: 'look' };
  if (need) return { key: 'look', label: `${need} to check`, tone: 'look' };
  if (bmRelPicks(rel)) return { key: 'ready', label: 'Ready', tone: 'ok' };
  if (rel.applied) return { key: 'done', label: 'Applied', tone: 'ok' };
  if (kinds.every(k => rel.st[k] === 'skip')) return { key: 'done', label: rel.err[kinds[0]] || 'Nothing to do', tone: 'wait' };
  return { key: 'done', label: 'Nothing to add', tone: 'wait' };
}
function bmBarHtml(rel, kind) {                                     // green: matched, linked or ticked · amber: needs a look · red: no match
  const st = rel.st[kind];
  if (st === 'wait') return `<span class="bm-m">queued</span>`;
  if (st === 'work') return `<div class="bm-bar bm-bar-work"><i></i></div>`;
  if (st === 'skip') return `<span class="bm-m">${escapeHtml(rel.err[kind] || '—')}</span>`;
  if (st === 'error') return `<span class="bm-m bm-warnc">error</span>`;
  const songs = rel.songs || []; if (!songs.length) return '';
  let g = 0, a = 0, n = 0; songs.forEach(s => { const c = bmCellOf(rel, s, kind); if (c.s === 'kept' || c.s === 'confident' || rel.pick[kind][s.idx]) g++; else if (c.s === 'look') a++; else if (c.s === 'none') n++; });
  const p = (x) => (x / songs.length * 100).toFixed(1);
  return `<div class="bm-bar bm-bar3"><i class="ok" style="width:${p(g)}%"></i><i class="look" style="width:${p(a)}%"></i><i class="none" style="width:${p(n)}%"></i></div><span class="bm-m">${g}/${songs.length}${a ? ` · ${a} look` : ''}${n ? ` · ${n} none` : ''}</span>`;
}
function bmMissReason(rel, s, kind) {                               // why a song has nothing ticked (for the analytics and the export)
  const c = bmCellOf(rel, s, kind);
  if (c.s === 'kept' || rel.pick[kind][s.idx]) return null;
  if (rel.st[kind] !== 'done') return rel.err[kind] || 'not looked up yet';
  if (!c.top) { const al = bmAlign(rel, kind); return al && al.count !== rel.songs.length ? 'tracklist differs' : `not found on ${bmName(kind)}`; }
  const extra = [...smFlags(c.top.title)].filter(f => !smFlags(s.title).has(f));
  if (extra.some(f => f === 'live' || f === 'remix')) return 'live or remix only';
  if (s.durationMs && c.top.durationMs && Math.abs(s.durationMs - c.top.durationMs) >= 20000) return 'length off by 20 s or more';
  if (rel.touched[kind] && rel.touched[kind][s.idx]) return 'you left it unticked';
  return c.top.band === 'weak' ? 'weak title match' : 'needs a look';
}

// ----- drawing: the parts every view shares -----
function bmTabsHtml() {
  const tabs = bm.started ? [['queue', 'Queue'], ['rel', 'Release'], ['links', 'Check links'], ['ana', 'Analytics'], ['hist', 'History'], ['prefs', 'Preferences']] : [['start', 'Start'], ['ana', 'Analytics'], ['hist', 'History'], ['prefs', 'Preferences']];
  return `<div class="bm-tabs" role="tablist">${tabs.map(([v, l]) => `<button type="button" role="tab" class="bm-tab${bm.view === v ? ' on' : ''}" aria-selected="${bm.view === v}" data-bm="tab" data-v="${v}">${l}</button>`).join('')}</div>`;
}
function bmLaneHtml(kind) {
  const l = bm.lanes[kind]; if (!l || l.s === 'off') return '';
  const rels = bm.rels.filter(r => r.include), total = rels.length, done = rels.filter(r => r.st[kind] !== 'wait' && r.st[kind] !== 'work').length, pct = total ? Math.round(done / total * 100) : 0;
  const ytStopped = kind === 'youtube' && ytAddon.state === 'stopped' && l.s === 'work';
  const slow = kind === 'spotify' && l.s === 'work' && spotifyRateLimitedUntil - Date.now() > 1500 ? Math.ceil((spotifyRateLimitedUntil - Date.now()) / 1000) : 0;
  let chip = { idle: ['wait', 'Waiting'], work: ['work', bm.paused ? 'Paused' : 'Working'], done: ['ok', 'Done'], stopped: ['look', 'Stopped'] }[l.s] || ['wait', ''];
  if (ytStopped) chip = ['look', 'YouTube needs you']; else if (slow) chip = ['look', 'Slowed down'];
  const el_ = (Date.now() - (bm.t0 || Date.now())) / 1000, left = done && l.s === 'work' ? Math.round(el_ / done * (total - done)) : 0;
  const par = kind === 'spotify' ? `${bm.par.spotify} at once` : ytUseAddon() ? `${Math.min(bm.par.youtube, ytAddon.parallel || 1) > 1 ? `${ytAddon.parallel} pages at once` : 'one page at a time'}` : `${bm.par.youtube} at once`;
  const msg = ytStopped ? `<div class="bm-lane-msg" role="alert">${escapeHtml(ytAddonWhy(ytAddon.reason))} <button type="button" class="chip-btn" data-bm="yt-continue">Continue</button></div>`
    : slow ? `<div class="bm-lane-msg">Spotify asked CRATE to slow down: it carries on in ${slow} s.</div>`
    : l.msg ? `<div class="bm-lane-msg" role="alert">${escapeHtml(l.msg)} ${l.s === 'stopped' ? `<button type="button" class="chip-btn" data-bm="lane-resume" data-kind="${kind}">Resume</button>` : ''}</div>` : '';
  return `<div class="bm-lane"><div class="bm-lane-top"><b>${bmName(kind)}</b><span class="bm-m">${par}</span>${bmChip(chip[0], chip[1])}</div><div class="bm-bar"><i style="width:${pct}%"></i></div><div class="bm-lane-meta"><span class="bm-m">${done} of ${bmPl(total, 'release')}</span><span class="bm-m">${left ? `about ${bmDur(left)} left` : ''}</span></div>${msg}</div>`;
}
function bmFootHtml() {
  const t = bmPickTotals(), a = [t.spotify ? `${t.spotify} Spotify` : '', t.youtube ? `${t.youtube} YouTube` : ''].filter(Boolean).join(' and ');
  let look = 0, none = 0, kept = 0; bm.rels.forEach(r => { if (!r.include || !r.songs) return; bmShownKinds().forEach(k => { r.songs.forEach(s => { if (relHas(r, s, k)) { kept++; return; } if (r.st[k] !== 'done' || r.pick[k][s.idx]) return; const c = bmCellOf(r, s, k); { if (c.s === 'look') look++; else if (c.s === 'none') none++; } }); }); });
  const diff = bm.diffOpen && t.n ? bmDiffHtml() : '';
  return `${diff}<div class="bm-foot"><div><b>${t.n ? `Will add ${bmPl(t.n, 'link')} (${a}) to ${bmPl(t.releases, 'release')}` : 'Nothing ticked yet'}</b><div class="bm-dim">${look} need a look · ${none} no match · ${kept} already linked and kept${bm.saved ? ` · ${bm.saved} saved so far` : ''}${t.n ? ` · <button type="button" class="bm-linkbtn" data-bm="diff-toggle">${bm.diffOpen ? 'hide changes' : 'see changes'}</button>` : ''}</div></div>
    <span class="bm-foot-r">${bmHistAll().some(h => !h.undone && h.n) ? '<button type="button" class="chip-btn" data-bm="undo-last">Undo last</button>' : ''}<button type="button" class="config-btn" data-bm="apply"${t.n && !bm.applying ? '' : ' disabled'}>${bm.applying ? 'Saving…' : `Apply ${bmPl(t.n, 'link')}`}</button></span></div>`;
}
function bmDiffHtml() {
  const rows = [];
  bm.rels.forEach(r => { if (!r.include || !r.songs || !bmRelPicks(r)) return;
    const lines = [];
    r.songs.forEach(s => ['spotify', 'youtube'].forEach(k => { const id = r.pick[k][s.idx]; if (!id) return; const c = ((r[k] && r[k].byIdx[s.idx]) || []).find(x => x.id === id); if (!c) return;
      const old = k === 'spotify' ? s.spotifyLink : s.youtubeLink;
      lines.push(`<li><span class="bm-m">${s.trackNum}</span> ${escapeHtml(s.title)} · ${bmName(k)}: ${old ? `<s class="bm-dim">${escapeHtml(old.replace(/^https?:\/\/(www\.)?/, '').slice(0, 42))}</s> → ` : '<span class="bm-dim">new</span> '}${escapeHtml(c.title)}${c.score != null ? ` <span class="bm-m">(${c.score})</span>` : ''}</li>`); }));
    rows.push(`<div class="bm-diff-rel"><b>${escapeHtml(r.item.title)}</b> <span class="bm-dim">${escapeHtml(r.item.artist)}</span><ul>${lines.join('')}</ul></div>`);
  });
  return `<div class="bm-diff" data-scroll="diff">${rows.join('')}</div>`;
}
function bmStripRender() {
  const s = bmEl('bmStrip'); if (!s) return; if (!bm || !bm.started || !bm.hidden) { s.hidden = true; return; }
  const lane = (k) => { const l = bm.lanes[k]; if (!l || l.s === 'off') return ''; const rels = bm.rels.filter(r => r.include), total = rels.length, done = rels.filter(r => r.st[k] !== 'wait' && r.st[k] !== 'work').length, stopped = (k === 'youtube' && ytAddon.state === 'stopped' && l.s === 'work') || l.s === 'stopped';
    return `<div class="bm-sl"><div class="bm-sl-t"><b>${bmName(k)}</b><span class="bm-m">${done} of ${total}${stopped ? ' · waiting for you' : l.s === 'done' ? ' · done' : ''}</span></div><div class="bm-bar${stopped ? ' warn' : ''}"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div></div>`; };
  const t = bmPickTotals();
  s.innerHTML = `<div class="bm-sh"><b>${bm.running ? 'Matching songs' : 'Matching finished'}</b><span class="bm-m">${bmPl(bm.rels.length, 'release')}${t.n ? ` · ${t.n} ticked` : ''}</span></div>${bmKinds().map(lane).join('')}<button type="button" class="chip-btn" data-bm="show-dialog">${bm.running ? 'Open' : 'Review'}</button>`; s.hidden = false;
}

// ----- Start -----
function bmAgo(t) { const s = Math.round((Date.now() - t) / 1000); return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; }
function bmHealthHtml() {
  const h = bm.health, ok = '<span class="bm-hi ok" aria-hidden="true">✓</span>', bad = '<span class="bm-hi bad" aria-hidden="true">!</span>', wait = '<span class="bm-hi" aria-hidden="true">…</span>';
  const row = (icon, text, right) => `<div class="bm-hrow">${icon}<span class="bm-ht">${text}</span>${right || ''}</div>`;
  const sp = h.spotify === 'checking' ? row(wait, 'Checking Spotify…') : h.spotify === 'ok' ? row(ok, 'Spotify connected') : row(bad, 'Spotify isn’t connected', '<button type="button" class="chip-btn" data-bm="setup-spotify">Set up…</button>');
  const yt = ytUseAddon() ? row(ok, `YouTube add-on ${escapeHtml(ytAddon.version)} connected`, `<span class="bm-m">${ytAddon.parallel > 1 ? `${ytAddon.parallel} pages at once` : 'one page at a time'}</span>`)
    : loadYoutubeApiKey() ? row(ok, 'YouTube: using your API key (no add-on)', `<span class="bm-m">${smYtQuotaUsed().toLocaleString()} of 10,000 units used today</span>`)
    : row(bad, 'YouTube isn’t set up: install the CRATE for YouTube add-on, or add an API key', '<button type="button" class="chip-btn" data-bm="setup-youtube">Set up…</button>');
  let test = '';
  if (ytUseAddon()) {
    const t = h.test || 'idle', retry = '<button type="button" class="chip-btn" data-bm="health-retry">Retry</button>';
    test = t === 'running' ? row(wait, 'Reading a test YouTube search…') : /^ok:/.test(t) ? row(ok, `Test search read ${t.slice(3)} videos`, retry)
      : t === 'zero' ? row(bad, 'Test search read 0 videos: YouTube may have changed its page. Open any YouTube search, use the add-on’s toolbar button (Diagnose this page) and send what it shows.', retry)
      : /^err:/.test(t) ? row(bad, `Test search failed: ${escapeHtml(t.slice(4))}`, retry) : '';
  }
  return `<div class="bm-health">${sp}${yt}${test}</div>`;
}
function bmStartHtml() {
  if (!bm.svcTouched && ytUseAddon()) bm.svc.youtube = true;           // the add-on answered after the window opened
  const sets = bm.sets, viaAddon = ytUseAddon(), ytOk = viaAddon || !!loadYoutubeApiKey(), mq = mqAll().length;
  const { items, skipped } = bmScopeItems(), n = items.length;
  const radio = (name, val, on, title, right, disabled) => `<label class="bm-opt${on ? ' on' : ''}${disabled ? ' off' : ''}"><input type="radio" name="${name}" value="${val}"${on ? ' checked' : ''}${disabled ? ' disabled' : ''} data-bm="setup"><span class="bm-opt-t">${title}</span>${right != null ? `<span class="bm-m">${right}</span>` : ''}</label>`;
  const check = (id, on, title, right, disabled) => `<label class="bm-opt${on ? ' on' : ''}${disabled ? ' off' : ''}"><input type="checkbox" id="${id}"${on ? ' checked' : ''}${disabled ? ' disabled' : ''} data-bm="setup"><span class="bm-opt-t">${title}</span>${right != null ? `<span class="bm-m">${right}</span>` : ''}</label>`;
  const scope = (sets.ticked ? radio('bmScope', 'ticked', bm.scope === 'ticked', sets.ticked.length === 1 ? `This release: ${escapeHtml(sets.ticked[0].title)}` : 'The releases you selected', sets.ticked.length) : '')
    + radio('bmScope', 'view', bm.scope === 'view', 'Everything in the current view', sets.view.length)
    + (sets.genre ? radio('bmScope', 'genre', bm.scope === 'genre', `Genre: ${escapeHtml(sets.genre.name)}`, sets.genre.items.length) : '')
    + (mq ? radio('bmScope', 'queue', bm.scope === 'queue', 'The match queue', mq) : '')
    + radio('bmScope', 'nolinks', bm.scope === 'nolinks', `Every release with no song linked yet${bmKinds().length === 1 ? ` on ${bmName(bmKinds()[0])}` : ''}`, bmNoLinksItems().length)
    + check('bmSkipLinked', bm.skipLinked && bm.songsMode !== 'check', 'Skip releases that are already fully linked', skipped ? `−${skipped}` : '', bm.songsMode === 'check');
  const songs = radio('bmSongsMode', 'gaps', bm.songsMode === 'gaps', 'Only songs that have no link yet') + radio('bmSongsMode', 'all', bm.songsMode === 'all', 'All songs (links you have are kept)') + radio('bmSongsMode', 'check', bm.songsMode === 'check', 'Check my saved links, and find replacements for broken ones');
  const par = (k) => `<select name="bmPar" data-kind="${k}" data-bm="setup" aria-label="${bmName(k)}: releases at once">${BM_PAR_CHOICES.map(v => `<option value="${v}"${bm.par[k] === v ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  const svc = check('bmSvcSpotify', bm.svc.spotify, 'Spotify', null) + check('bmSvcYoutube', bm.svc.youtube && ytOk, 'YouTube', ytOk ? null : 'not set up', !ytOk)
    + (viaAddon && bm.songsMode !== 'check' ? check('bmYtSongs', bm.ytSongs, 'Also search YouTube song by song for what a playlist misses', 'about one page each') : '');
  const est = bmEstimate({ releases: n, spotify: bm.svc.spotify, youtube: bm.svc.youtube && ytOk, viaAddon, ytSongs: bm.ytSongs && viaAddon, used: ytAddon.today || 0, cap: ytAddon.cap || 0, spPar: bm.par.spotify, ytPar: viaAddon ? Math.min(ytAddon.parallel || 1, bm.par.youtube) : bm.par.youtube });
  const secs = Math.max(est.spotifySec, est.ytSec), noTl = items.filter(it => isManualAlbum(it) && !(it.manualTracks || []).length).length;
  const saved = bm.savedRun ? `<div class="bm-saved"><span><b>You have a saved run:</b> ${bm.savedRun.label && bm.savedRun.label !== bmPl(bm.savedRun.n, 'release') ? `${escapeHtml(bm.savedRun.label)} · ` : ''}${bmPl(bm.savedRun.n, 'release')}${bm.savedRun.picks ? ` · ${bmPl(bm.savedRun.picks, 'match', 'matches')} not applied yet` : ''}${bm.savedRun.waiting ? ` · ${bm.savedRun.waiting} still to look up` : ''} · saved ${bmAgo(bm.savedRun.t)}</span><span><button type="button" class="chip-btn" data-bm="discard-saved">Discard</button> <button type="button" class="config-btn" data-bm="resume-saved">Resume it</button></span></div>` : '';
  return `<div class="bm-body bm-start" data-scroll="start">${saved}
    <section><div class="bm-label">Health check</div>${bmHealthHtml()}</section>
    <div class="bm-grid2"><section><div class="bm-label">Which releases</div><div class="bm-opts">${scope}</div></section><section><div class="bm-label">Which songs</div><div class="bm-opts">${songs}</div></section></div>
    <div class="bm-grid2"><section><div class="bm-label">Services</div><div class="bm-opts">${svc}</div></section>
      <section><div class="bm-label">How</div><div class="bm-opts"><div class="bm-opt"><span class="bm-opt-t">Releases at once</span><span class="bm-sub">Spotify ${par('spotify')} YouTube ${par('youtube')}</span></div>
        ${radio('bmMode', 'review', bm.mode === 'review', 'Let me review everything before it is saved')}${radio('bmMode', 'auto', bm.mode === 'auto', 'Save confident matches as they come; I review the rest')}</div>
        <p class="bm-dim">More at once is faster. If Spotify asks CRATE to slow down, everything waits as long as it asks; more YouTube pages at once makes a YouTube check likelier.</p></section></div>
  </div>
  <div class="bm-foot"><span class="bm-dim">${n ? `About ${bmDur(secs || 2)} for ${bmPl(n, 'release')}` : 'Nothing to match with these choices'}${noTl ? ` · ${noTl} ${noTl === 1 ? 'has' : 'have'} no tracklist yet` : ''} · the run is saved as it goes: it survives a reload</span><span class="bm-foot-r"><button type="button" class="chip-btn" data-bm="cancel">Cancel</button><button type="button" class="config-btn" data-bm="start"${n ? '' : ' disabled'}>${bm.songsMode === 'check' ? 'Check' : 'Start matching'} ${bmPl(n, 'release')}</button></span></div>`;
}

// ----- Queue -----
function bmQueueRows() {
  const q = smFold(bm.qsearch || '').trim();
  let rows = bm.rels.map((r, i) => ({ r, i, s: bmRelStatus(r) }));
  if (bm.qfilter !== 'all') rows = rows.filter(x => bm.qfilter === 'look' ? x.s.key === 'look' : bm.qfilter === 'problem' ? x.s.key === 'problem' : bm.qfilter === 'ready' ? x.s.key === 'ready' : bm.qfilter === 'done' ? (x.s.key === 'done' || x.s.key === 'skip') : true);
  if (q) rows = rows.filter(x => smFold(x.r.item.artist + ' ' + x.r.item.title).includes(q));
  const rank = { problem: 0, look: 1, ready: 2, work: 3, wait: 4, done: 5, skip: 6 };
  if (bm.qsort === 'look') rows.sort((a, b) => rank[a.s.key] - rank[b.s.key] || a.i - b.i);
  else if (bm.qsort === 'az') rows.sort((a, b) => a.r.item.artist.localeCompare(b.r.item.artist) || a.r.item.title.localeCompare(b.r.item.title));
  return rows;
}
function bmQueueHtml() {
  const all = bm.rels.map(bmRelStatus), cnt = (k) => all.filter(s => k === 'done' ? (s.key === 'done' || s.key === 'skip') : s.key === k).length;
  const chip = (f, l, n) => `<button type="button" class="bm-fchip${bm.qfilter === f ? ' on' : ''}" data-bm="qfilter" data-f="${f}">${l} ${n}</button>`;
  const rows = bmQueueRows(), shown = bmShownKinds(), sel = bm.qsel;
  const allOn = rows.length > 0 && rows.every(x => sel.has(x.r.row));
  const body = rows.map(({ r, s }) => `<tr class="bm-qrow${r.row === bm.sel ? ' on' : ''}" data-bm="open-rel" data-row="${escapeHtml(r.row)}"><td class="bm-tick"><input type="checkbox" data-bm="qsel" data-row="${escapeHtml(r.row)}"${sel.has(r.row) ? ' checked' : ''} aria-label="Select ${escapeHtml(r.item.title)}"></td>
    <td><div class="bm-t">${escapeHtml(r.item.title)}</div><div class="bm-dim">${escapeHtml(r.item.artist)}${r.songs ? ` · ${r.songs.length} songs` : ''}</div></td>${shown.map(k => `<td class="bm-qbar">${bmBarHtml(r, k)}</td>`).join('')}<td>${bmChip(s.tone, escapeHtml(s.label))}</td></tr>`).join('');
  const mq = mqAll().length, why = mqWhyCounts();
  const later = mq ? `<div class="bm-later bm-dim">Waiting in the match queue: ${[why.skipped ? `${bmPl(why.skipped, 'release')} with songs the player skipped` : '', why.added ? `${bmPl(why.added, 'new release')}` : '', why.menu ? `${bmPl(why.menu, 'release')} you added` : ''].filter(Boolean).join(' · ')} <button type="button" class="chip-btn" data-bm="mq-add">Add them to this run</button></div>` : '';
  return `<div class="bm-tool"><div class="bm-fchips">${chip('all', 'All', bm.rels.length)}${chip('look', 'Needs a look', cnt('look'))}${chip('problem', 'Problems', cnt('problem'))}${chip('ready', 'Ready', cnt('ready'))}${chip('done', 'Done', cnt('done'))}</div>
    <div class="bm-tool-r"><input type="search" class="bm-search" placeholder="Find a release" value="${escapeHtml(bm.qsearch || '')}" data-keep="qsearch" data-bm="qsearch" aria-label="Find a release"><select data-bm="qsort" aria-label="Sort"><option value="look"${bm.qsort === 'look' ? ' selected' : ''}>Needs a look first</option><option value="added"${bm.qsort === 'added' ? ' selected' : ''}>As added</option><option value="az"${bm.qsort === 'az' ? ' selected' : ''}>Artist A–Z</option></select></div></div>
  <div class="bm-body" data-scroll="queue"><table class="bm-qtable"><thead><tr><th class="bm-tick"><input type="checkbox" data-bm="qsel-all"${allOn ? ' checked' : ''} aria-label="Select every release shown"></th><th>Release</th>${shown.map(k => `<th>${bmName(k)}</th>`).join('')}<th>Status</th></tr></thead><tbody>${body || `<tr><td colspan="${3 + shown.length}" class="bm-pad bm-dim">No releases under this filter.</td></tr>`}</tbody></table>${later}</div>
  <div class="bm-bulk"><span class="bm-m">${sel.size ? `${sel.size} selected` : 'Select releases for these:'}</span><button type="button" class="chip-btn" data-bm="bulk-tick">Tick confident</button><button type="button" class="chip-btn" data-bm="bulk-rerun">Re-run</button><button type="button" class="chip-btn" data-bm="bulk-skip">Skip</button><button type="button" class="chip-btn" data-bm="bulk-include">Include</button><button type="button" class="chip-btn" data-bm="bulk-top">Move to top</button><span class="bm-sp"></span><button type="button" class="chip-btn" data-bm="export-csv">Export unmatched (CSV)</button></div>`;
}
// ----- Release -----
function bmSelRel() { return bm.rels.find(r => r.row === bm.sel) || bm.rels[0] || null; }
function bmRelSongsShown(rel) {
  const shown = bmShownKinds();
  return (rel.songs || []).filter(s => bmSongMatches(shown.map(k => bmCellOf(rel, s, k).s), bm.filter));
}
function bmCandSub(kind, c, s) { return [kind === 'spotify' ? (c.artists || []).join(', ') : (c.channel || ''), smLen(c.durationMs), bmDiffText(s.durationMs, c.durationMs)].filter(Boolean).join(' · '); }
// A saved YouTube link's own title and channel, so a "Kept" song says WHICH video it is (not just "Your link"). YouTube's oEmbed answers
// without a key and costs no quota; three at a time, each video asked once a session, and what it says is remembered in this browser.
const YT_INFO_KEY = 'crate_yt_info_v1', ytInfoAsked = new Set(), ytInfoQ = []; let ytInfo = null, ytInfoBusy = 0;
function ytInfoAll() { if (!ytInfo) { try { ytInfo = JSON.parse(localStorage.getItem(YT_INFO_KEY) || '{}') || {}; } catch (e) { ytInfo = {}; } } return ytInfo; }
function ytInfoSet(id, title, channel) {
  if (!id || !title) return; const a = ytInfoAll(); delete a[id]; a[id] = { t: String(title).slice(0, 200), c: String(channel || '').slice(0, 100) };
  const keys = Object.keys(a); if (keys.length > 5000) keys.slice(0, keys.length - 5000).forEach(k => delete a[k]);          // (the oldest go first)
  try { localStorage.setItem(YT_INFO_KEY, JSON.stringify(a)); } catch (e) { /* private window: asked again next time */ }
}
function ytInfoOf(link) { const id = youtubeVideoIdFromUrl(link); if (!id) return null; const v = ytInfoAll()[id]; if (v) return v; if (!ytInfoAsked.has(id)) { ytInfoAsked.add(id); ytInfoQ.push(id); ytInfoPump(); } return null; }
function ytInfoPump() {
  while (ytInfoBusy < 3 && ytInfoQ.length) {
    const id = ytInfoQ.shift(); ytInfoBusy++;
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { credentials: 'omit' })
      .then(r => r.ok ? r.json() : null).then(j => { if (j && j.title) { ytInfoSet(id, j.title, j.author_name); bmRedraw(); } }).catch(() => { /* stays "Your link" */ })
      .finally(() => { ytInfoBusy--; ytInfoPump(); });
  }
}
function bmScorePill(rel, s, kind, c) {
  if (c.score == null) return '';
  const tone = c.band === 'confident' ? 'ok' : c.band === 'likely' ? 'work' : 'look';
  return `<button type="button" class="bm-score bm-${tone}" data-bm="why" data-row="${escapeHtml(rel.row)}" data-idx="${s.idx}" data-kind="${kind}" data-id="${escapeHtml(c.id)}" title="Why this score">${c.score}</button>`;
}
function bmCellHtml(rel, s, kind) { return `<div class="bm-cellw" data-k="${bmName(kind)}">${bmCellInner(rel, s, kind)}</div>`; }          // labelled with its service, for the narrow layout
function bmCellInner(rel, s, kind) {
  const c = bmCellOf(rel, s, kind), da = `data-row="${escapeHtml(rel.row)}" data-idx="${s.idx}" data-kind="${kind}"`;
  const br = rel.broken[kind] && rel.broken[kind][s.idx], brNote = br ? `<div class="bm-m bm-warnc">${escapeHtml(br.reason)}</div>` : '';
  if (c.s === 'kept') { const yi = kind === 'youtube' ? ytInfoOf(s.youtubeLink) : null; return `<div class="bm-cell"><span class="bm-ts"></span><div class="bm-ct"><div class="bm-t${yi ? '' : ' bm-dim'}"${yi ? ` title="${escapeHtml(yi.t)}"` : ''}>${yi ? escapeHtml(yi.t) : 'Your link'}</div><div class="bm-m">${yi && yi.c ? escapeHtml(yi.c) + ' \u00b7 ' : ''}kept${bm.songsMode === 'check' && rel.checked[kind] ? ' · checked: works' : ''}</div></div>${bmChip('have', 'Kept')}</div>`; }
  if (c.s === 'wait') return `<div class="bm-cell"><span class="bm-ts"></span><div class="bm-ct bm-dim">${rel.st[kind] === 'skip' ? escapeHtml(rel.err[kind] || 'Not run') : rel.st[kind] === 'work' ? 'Looking…' : 'Queued'}${brNote}</div></div>`;
  if (c.s === 'error') return `<div class="bm-cell"><span class="bm-ts"></span><div class="bm-ct bm-warnc">${escapeHtml(rel.err[kind] || 'Could not look this up')}</div></div>`;
  if (c.s === 'none') return `<div class="bm-cell"><span class="bm-ts"></span><div class="bm-ct"><div class="bm-dim">No match</div>${brNote}</div>${kind === 'youtube' ? `<button type="button" class="chip-btn bm-sm" data-bm="yt-song" ${da}>Search</button>` : ''}<button type="button" class="chip-btn bm-sm" data-bm="choose" ${da}>Paste</button></div>`;
  const pickId = rel.pick[kind][s.idx], ch = c.cands.find(x => x.id === pickId) || c.top, ticked = !!pickId;
  const focus = bm.focus && bm.focus.idx === s.idx && bm.focus.kind === kind;
  const open = bm.open && bm.open.row === rel.row && bm.open.idx === s.idx && bm.open.kind === kind;
  return `<div class="bm-cell${focus ? ' focus' : ''}"><label class="bm-tick"><input type="checkbox" data-bm="tick" ${da}${ticked ? ' checked' : ''} aria-label="Use this ${bmName(kind)} match for ${escapeHtml(s.title)}"></label><div class="bm-ct"><div class="bm-t" title="${escapeHtml(ch.title)}">${escapeHtml(ch.title)}</div><div class="bm-m">${escapeHtml(bmCandSub(kind, ch, s))}</div>${brNote}</div>${bmScorePill(rel, s, kind, ch)}<button type="button" class="chip-btn bm-sm" data-bm="choose" ${da}>${open ? 'Done' : c.cands.length > 1 ? `${c.cands.length - 1} more` : 'Other'}</button></div>`;
}
function bmDrawerHtml(rel, s, kind) {
  const c = bmCellOf(rel, s, kind), name = `bmp-${rel.row}-${s.idx}-${kind}`, pickId = rel.pick[kind][s.idx], da = `data-row="${escapeHtml(rel.row)}" data-idx="${s.idx}" data-kind="${kind}"`;
  const opts = c.cands.slice(0, 5).map((x, i) => `<div class="bm-opt${pickId === x.id ? ' on' : ''}"><input type="radio" name="${name}" value="${escapeHtml(x.id)}" data-bm="pick" ${da}${pickId === x.id ? ' checked' : ''} aria-label="${escapeHtml(x.title)}"><span class="bm-opt-t"><span class="bm-m">${i + 1}</span> ${escapeHtml(x.title)}<small>${escapeHtml(bmCandSub(kind, x, s))}</small></span>${bmScorePill(rel, s, kind, x)}<button type="button" class="chip-btn bm-sm" data-bm="preview" ${da} data-id="${escapeHtml(x.id)}" aria-label="Play ${escapeHtml(x.title)}">▶</button></div>`).join('');
  return `<div class="bm-drawer"><div class="bm-dim">${bmName(kind)}: pick the right one for “${escapeHtml(s.title)}”, or neither.</div>${opts}<label class="bm-opt${!pickId ? ' on' : ''}"><input type="radio" name="${name}" value="" data-bm="pick" ${da}${!pickId ? ' checked' : ''}><span class="bm-opt-t">Neither: leave this song without a ${bmName(kind)} link</span></label>
    <div class="bm-paste"><input type="text" placeholder="Or paste a ${kind === 'spotify' ? 'Spotify track' : 'YouTube video'} link" data-keep="paste-song-${escapeHtml(rel.row)}-${s.idx}-${kind}" aria-label="Paste a link for ${escapeHtml(s.title)}"><button type="button" class="chip-btn" data-bm="paste-song" ${da}>Use</button></div></div>`;
}
function bmWhyHtml(rel, s, kind) {
  const w = bm.why; const c = ((rel[kind] && rel[kind].byIdx[s.idx]) || []).find(x => x.id === w.id); if (!c) return '';
  const parts = (c.parts || []).map(p => `<span class="bm-part${p.points < 0 ? ' neg' : ''}">${escapeHtml(p.label)} <b>${p.points > 0 ? '+' : p.points < 0 ? '−' : ''}${Math.abs(p.points)}</b></span>`).join('') || `<span class="bm-dim">${escapeHtml((c.reasons || []).join(', '))}</span>`;
  const other = kind === 'spotify' ? 'youtube' : 'spotify', oc = rel[other] && rel[other].byIdx && rel[other].byIdx[s.idx] && (rel[other].byIdx[s.idx].find(x => x.id === rel.pick[other][s.idx]) || rel[other].byIdx[s.idx][0]);
  const oLink = other === 'spotify' ? s.spotifyLink : s.youtubeLink;
  const da = `data-row="${escapeHtml(rel.row)}" data-idx="${s.idx}" data-kind="${kind}" data-id="${escapeHtml(c.id)}"`;
  return `<div class="bm-why"><div class="bm-why-h"><b>Why ${c.score} · ${escapeHtml(c.title)} · ${bmName(kind)}</b><span class="bm-foot-r"><button type="button" class="chip-btn bm-sm" data-bm="preview" ${da}>▶ Play this</button>${oc || oLink ? `<button type="button" class="chip-btn bm-sm" data-bm="compare" ${da}>▶ Compare with ${bmName(other)}</button>` : ''}${c.source !== 'pasted' && c.source !== 'relinked' ? `<button type="button" class="chip-btn bm-sm" data-bm="reject" ${da}>Never offer this</button>` : ''}<button type="button" class="chip-btn bm-sm" data-bm="why-close">Close</button></span></div><div class="bm-parts">${parts}</div><div class="bm-m">Confident from ${smPrefs().confident} (Preferences) · ${escapeHtml((c.reasons || []).join(', '))}</div></div>`;
}
function bmSourcePanel(rel, kind) {
  const r = rel[kind], st = rel.st[kind], n = (rel.songs || []).length;
  let title = '…', meta = '', ctl = '';
  if (st === 'skip' && rel.err[kind] === 'Not run') { title = 'Not looked up'; ctl = `<button type="button" class="chip-btn" data-bm="run-kind" data-kind="${kind}">Find on ${bmName(kind)}</button>`; }
  else if (st === 'skip') title = escapeHtml(rel.err[kind] || 'Skipped');
  else if (st === 'wait') title = 'Queued';
  else if (st === 'work') title = 'Looking…';
  else if (st === 'error') { title = `<span class="bm-warnc">${escapeHtml(rel.err[kind] || 'Could not look this up')}</span>`; ctl = `<button type="button" class="chip-btn" data-bm="retry-kind" data-kind="${kind}">Retry</button>`; }
  else if (r) {
    const list = kind === 'spotify' ? (r.editions || []) : (r.lists || []), cur = kind === 'spotify' ? r.albumId : r.playlistId;
    if (kind === 'spotify') { title = r.albumName ? escapeHtml(r.albumName) : 'No edition fits: songs were searched one by one'; meta = r.albumName ? `fits ${(list.find(e => e.id === cur) || {}).matched || 0} of ${n}${r.searched ? ` · ${r.searched} found by searching` : ''}` : ''; }
    else { title = r.playlistTitle ? escapeHtml(r.playlistTitle) : 'No playlist fits this tracklist'; meta = r.playlistTitle ? `${escapeHtml(r.playlistChannel || '')} · fits ${(list.find(e => e.id === cur) || {}).matched || 0} of ${n}` : ''; }
    const opts = list.slice().sort((a, b) => (b.fit || 0) - (a.fit || 0)).map(e => `<option value="ed:${escapeHtml(e.id)}"${e.id === cur ? ' selected' : ''}>${escapeHtml(e.name)}${kind === 'youtube' && e.channel ? ` (${escapeHtml(e.channel)})` : ''} · fits ${e.matched || 0} of ${n}</option>`).join('');
    const extra = kind === 'spotify' ? '<option value="paste">Paste an album link…</option>' : '<option value="songs">Search song by song for the rest</option><option value="fv">Full-release video…</option><option value="paste">Paste a playlist link…</option>';
    ctl = `<select data-bm="src" data-kind="${kind}" aria-label="${bmName(kind)} source">${cur ? '' : '<option value="" selected>Change…</option>'}${opts}${extra}</select>`;
  }
  const paste = bm.pasteFor === kind ? `<div class="bm-paste"><input type="text" placeholder="${kind === 'spotify' ? 'https://open.spotify.com/album/…' : 'https://www.youtube.com/playlist?list=…'}" data-keep="paste-src-${kind}" aria-label="Paste a ${kind === 'spotify' ? 'Spotify album' : 'YouTube playlist'} link"><button type="button" class="chip-btn" data-bm="paste-src" data-kind="${kind}">Use</button><button type="button" class="chip-btn" data-bm="paste-src-cancel">Cancel</button></div>` : '';
  return `<div class="bm-panel"><div class="bm-label">${bmName(kind)}</div><div class="bm-panel-row"><div class="bm-ct"><div class="bm-panel-t">${title}</div><div class="bm-m">${meta}</div></div>${ctl}</div>${paste}</div>`;
}
function bmAlignHtml(rel) {
  if (!rel.songs || !rel.songs.length) return '';
  const bits = bmShownKinds().map(k => { const a = bmAlign(rel, k); if (!a) return ''; const ex = a.extras.slice(0, 2).map(t => `“${escapeHtml(t.title)}”`).join(', ');
    return `${bmName(k)} ${a.count}${a.extras.length ? ` (${a.extras.length} extra${ex ? `: ${ex}${a.extras.length > 2 ? '…' : ''}` : ''})` : ''}${a.missing.length ? `, ${a.missing.length} of yours not on it` : ''}`; }).filter(Boolean);
  if (!bits.length) return '';
  const off = bmShownKinds().some(k => { const a = bmAlign(rel, k); return a && (a.count !== rel.songs.length || a.missing.length); });
  return `<div class="bm-align${off ? ' off' : ''}"><span class="bm-label">Tracklist</span> yours ${rel.songs.length} · ${bits.join(' · ')}${off ? ' <button type="button" class="bm-linkbtn" data-bm="rel-edit">edit your tracklist</button>' : ''}</div>`;
}
function bmRelHtml() {
  const rel = bmSelRel(); if (!rel) return '<div class="bm-body bm-pad bm-dim">No release.</div>';
  const it = rel.item, shown = bmShownKinds(), i = bm.rels.indexOf(rel), n = bmRelPicks(rel);
  if (bm.focusTrackNum != null && rel.songs) { const s = rel.songs.find(x => x.trackNum === bm.focusTrackNum); if (s) bm.focus = { idx: s.idx, kind: shown[0] }; bm.focusTrackNum = null; }
  if (rel.songs && rel.songs.length && (!bm.focus || !rel.songs.some(s => s.idx === bm.focus.idx))) bm.focus = { idx: rel.songs[0].idx, kind: shown[0] };
  const year = genreYear(it);
  const head = `<div class="bm-rel-head"><button type="button" class="chip-btn bm-sm" data-bm="nav" data-d="-1"${i > 0 ? '' : ' disabled'} aria-label="Previous release">‹</button><span class="bm-tile bm-big">${escapeHtml(bmInitials(it.title))}</span><div class="bm-ct"><div class="bm-rt">${escapeHtml(it.title)}</div><div class="bm-dim">${escapeHtml(it.artist)}${year ? ` · ${year}` : ''} · ${rel.songs ? bmPl(rel.songs.length, 'song') : '…'} · ${i + 1} of ${bm.rels.length}</div></div><button type="button" class="chip-btn bm-sm" data-bm="nav" data-d="1"${i < bm.rels.length - 1 ? '' : ' disabled'} aria-label="Next release">›</button>
    <span class="bm-foot-r bm-right"><button type="button" class="chip-btn" data-bm="rel-rerun">Re-run</button><button type="button" class="chip-btn" data-bm="rel-skip">${rel.include ? 'Skip' : 'Include'}</button><button type="button" class="chip-btn" data-bm="rel-edit">Edit tracks…</button><button type="button" class="config-btn" data-bm="rel-apply"${n ? '' : ' disabled'}>Apply ${bmPl(n, 'link')}</button></span></div>`;
  const keys = `<div class="bm-keys bm-m"><kbd>J</kbd><kbd>K</kbd> song · <kbd>H</kbd><kbd>L</kbd> service · <kbd>1</kbd>–<kbd>5</kbd> pick · <kbd>X</kbd> none · <kbd>Space</kbd> play · <kbd>W</kbd> why · <kbd>A</kbd> apply · <kbd>N</kbd> next to check · <kbd>[</kbd><kbd>]</kbd> release</div>`;
  if (!rel.songs && (shown.some(k => rel.st[k] === 'work' || rel.st[k] === 'wait'))) return `${head}<div class="bm-body bm-pad bm-dim">Waiting for this release…</div>`;
  if (rel.songs && !rel.songs.length) return `${head}<div class="bm-body bm-pad"><p>This release has no tracklist yet, so there is nothing to match.</p><button type="button" class="config-btn" data-bm="rel-edit">Add its tracks…</button></div>`;
  const panels = `<div class="bm-panels">${shown.map(k => bmSourcePanel(rel, k)).join('')}</div>`;
  const songs = bmRelSongsShown(rel), cs = (k) => (rel.songs || []).filter(s => bmCellOf(rel, s, k).cands.length);
  const colOn = (k) => { const l = cs(k); return l.length > 0 && l.every(s => rel.pick[k][s.idx]); }, allOn = shown.some(k => cs(k).length) && shown.every(k => !cs(k).length || colOn(k));
  const chipf = (f, label) => `<button type="button" class="bm-fchip${bm.filter === f ? ' on' : ''}" data-bm="filter" data-f="${f}">${label}</button>`;
  const ytRest = shown.includes('youtube') && rel.st.youtube === 'done' && rel.songs.some(s => !relHas(rel, s, 'youtube') && !((rel.youtube.byIdx || {})[s.idx] || []).length);
  const tools = `<div class="bm-tool bm-tool-rel"><div class="bm-fchips">${chipf('all', 'All')}${chipf('confident', 'Confident')}${chipf('look', 'Needs a look')}${chipf('none', 'No match')}${chipf('kept', 'Linked')}</div>
    <div class="bm-tool-r"><button type="button" class="chip-btn" data-bm="rule-accept">Accept all above</button><select data-bm="accept-min" aria-label="Accept all above this score">${[60, 65, 70, 75, 80].map(v => `<option${(bm.acceptMin || 75) === v ? ' selected' : ''}>${v}</option>`).join('')}</select><button type="button" class="chip-btn" data-bm="rule-unlive">Untick live and remixes</button><button type="button" class="chip-btn" data-bm="rule-untick">Untick all</button>${ytRest ? `<button type="button" class="chip-btn" data-bm="yt-rest"${rel.youtube.searching ? ' disabled' : ''}>${rel.youtube.searching ? 'Searching YouTube…' : 'Search YouTube for the rest'}</button>` : ''}</div></div>`;
  const W = shown.length;
  const th = `<div class="bm-row bm-th bm-c${W}"><label class="bm-tick"><input type="checkbox" data-bm="tick-song-all"${allOn ? ' checked' : ''} aria-label="Tick every song"></label><span class="bm-label">#</span><span class="bm-label">Your song</span>${shown.map(k => `<span class="bm-label bm-colh"><label class="bm-tick"><input type="checkbox" data-bm="tick-col" data-kind="${k}"${colOn(k) ? ' checked' : ''} aria-label="Tick every ${bmName(k)} match"></label>${bmName(k)}</span>`).join('')}</div>`;
  const rows = songs.map(s => {
    const drawers = shown.filter(k => bm.open && bm.open.row === rel.row && bm.open.idx === s.idx && bm.open.kind === k).map(k => bmDrawerHtml(rel, s, k)).join('');
    const why = bm.why && bm.why.row === rel.row && bm.why.idx === s.idx && shown.includes(bm.why.kind) ? bmWhyHtml(rel, s, bm.why.kind) : '';
    const sticks = shown.filter(k => bmCellOf(rel, s, k).cands.length).map(k => !!rel.pick[k][s.idx]);
    return `<div class="bm-song${bm.focus && bm.focus.idx === s.idx ? ' focus' : ''}" data-idx="${s.idx}"><div class="bm-row bm-c${W}"><label class="bm-tick"><input type="checkbox" data-bm="tick-song" data-row="${escapeHtml(rel.row)}" data-idx="${s.idx}"${sticks.length && sticks.every(Boolean) ? ' checked' : ''}${sticks.length ? '' : ' disabled'} aria-label="Match ${escapeHtml(s.title)}"></label><span class="bm-m">${s.trackNum}</span><div class="bm-ct"><div class="bm-t">${escapeHtml(s.title)}</div><div class="bm-m">${escapeHtml(smLen(s.durationMs) || 'no length')}</div></div>${shown.map(k => bmCellHtml(rel, s, k)).join('')}</div>${drawers}${why}</div>`;
  }).join('');
  const empty = !rel.songs ? '<div class="bm-dim bm-pad">Waiting for this release…</div>' : !songs.length ? '<div class="bm-dim bm-pad">No songs under this filter.</div>' : '';
  return `${head}${keys}${panels}${bmAlignHtml(rel)}${tools}<div class="bm-body" data-scroll="songs">${th}${rows}${empty}</div>`;
}
// ----- Check links -----
function bmLinksHtml() {
  const rows = []; let checked = 0, broken = 0;
  bm.rels.forEach(r => { ['spotify', 'youtube'].forEach(k => { checked += r.checked[k] || 0; Object.entries(r.broken[k] || {}).forEach(([i, br]) => { broken++; const s = (r.songs || []).find(x => String(x.idx) === String(i)); if (s) rows.push({ r, s, k, br }); }); }); });
  if (bm.songsMode !== 'check' && !rows.length) return `<div class="bm-body bm-pad"><p>This run matches songs; it doesn’t check the links you already have.</p><p class="bm-dim">A link check asks Spotify and YouTube whether each saved link still plays (deleted, private, blocked in ${bmMarket()}, or a Spotify track replaced by a new id) and finds a replacement for any that don’t. Nothing is replaced until you apply it.</p><button type="button" class="config-btn" data-bm="links-check">Check the links of these ${bmPl(bm.rels.length, 'release')}</button></div>`;
  const body = rows.map(({ r, s, k, br }) => {
    const c = bmCellOf(r, s, k), pickId = r.pick[k][s.idx], ch = c.cands.find(x => x.id === pickId) || c.top, da = `data-row="${escapeHtml(r.row)}" data-idx="${s.idx}" data-kind="${k}"`;
    const old = (k === 'spotify' ? s.spotifyLink : s.youtubeLink) || '';
    const rep = r.st[k] === 'work' ? '<span class="bm-dim">Looking…</span>' : ch ? `<span class="bm-t">${escapeHtml(ch.title)}</span> ${bmScorePill(r, s, k, ch)}` : `<span class="bm-dim">No replacement found</span>${k === 'youtube' ? ` <button type="button" class="chip-btn bm-sm" data-bm="yt-song" ${da}>Search</button>` : ''}`;
    return `<tr><td class="bm-tick"><input type="checkbox" data-bm="tick" ${da}${pickId ? ' checked' : ''}${ch ? '' : ' disabled'} aria-label="Replace the link for ${escapeHtml(s.title)}"></td><td><div class="bm-t">${escapeHtml(s.title)}</div><div class="bm-dim">${escapeHtml(r.item.artist)} · ${escapeHtml(r.item.title)}</div></td><td>${bmChip('look', escapeHtml(br.reason))}</td><td class="bm-m">${bmName(k)} · ${escapeHtml(old.replace(/^https?:\/\/(www\.|open\.)?/, '').slice(0, 30))}</td><td>${rep} <button type="button" class="bm-linkbtn" data-bm="open-rel" data-row="${escapeHtml(r.row)}">open</button></td></tr>`;
  }).join('');
  const working = bm.rels.some(r => ['spotify', 'youtube'].some(k => r.st[k] === 'work' || (r.include && r.st[k] === 'wait')));
  return `<div class="bm-tool"><span class="bm-m">Checked ${bmPl(checked, 'saved link')}${working ? ' so far' : ''} in ${bmPl(bm.rels.length, 'release')} · ${bmChip(broken ? 'look' : 'ok', `${broken} broken`)}</span><span class="bm-m">Market: ${bmMarket()}</span></div>
    <div class="bm-body" data-scroll="links"><table class="bm-qtable"><thead><tr><th class="bm-tick"></th><th>Song</th><th>Problem</th><th>Saved link</th><th>Replacement</th></tr></thead><tbody>${body || `<tr><td colspan="5" class="bm-pad bm-dim">${working ? 'Checking…' : 'Every saved link that was checked still works.'}</td></tr>`}</tbody></table></div>`;
}

// ----- Analytics -----
function bmCrateCoverage() {                                       // over the releases whose tracklist CRATE has on hand
  const tot = { songs: 0, sp: 0, yt: 0, neither: 0, rels: 0 }, by = { genre: new Map(), decade: new Map() };
  state.raw.forEach(it => { const ls = bmLinkState(it); if (!ls || !ls.length) return; tot.rels++;
    const g = (getGenreList(it.genre)[0] || 'No genre'), y = genreYear(it), d = y ? `${Math.floor(y / 10) * 10}s` : null;
    ls.forEach(x => { tot.songs++; if (x.sp) tot.sp++; if (x.yt) tot.yt++; if (!x.sp && !x.yt) tot.neither++;
      [[by.genre, g], [by.decade, d]].forEach(([m, k]) => { if (!k) return; const e = m.get(k) || { n: 0, ok: 0 }; e.n++; if (x.sp || x.yt) e.ok++; m.set(k, e); }); }); });
  const weakest = (m) => [...m.entries()].filter(([, e]) => e.n >= 15).map(([k, e]) => ({ k, p: e.ok / e.n, n: e.n })).sort((a, b) => a.p - b.p).slice(0, 3);
  return { tot, weakGenre: weakest(by.genre), weakDecade: weakest(by.decade) };
}
function bmAnaHtml() {
  const scope = bm.started ? bm.anaScope : 'crate';
  const toggle = bm.started ? `<div class="bm-fchips"><button type="button" class="bm-fchip${scope === 'run' ? ' on' : ''}" data-bm="ana-scope" data-s="run">This run</button><button type="button" class="bm-fchip${scope === 'crate' ? ' on' : ''}" data-bm="ana-scope" data-s="crate">Whole crate</button></div>` : '';
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const bar = (parts) => `<div class="bm-bar bm-bar3">${parts.map(([cls, w]) => `<i class="${cls}" style="width:${w.toFixed(1)}%"></i>`).join('')}</div>`;
  if (scope === 'crate') {
    const c = bmCrateCoverage(), t = c.tot;
    const weak = (list) => list.map(x => `${escapeHtml(x.k)} ${Math.round(x.p * 100)}%`).join(' · ') || '—';
    return `<div class="bm-tool">${toggle}<span class="bm-m">${bmPl(t.songs, 'song')} in ${bmPl(t.rels, 'release')} whose tracklist CRATE has on hand (the rest count once their tracklist has been loaded)</span></div>
      <div class="bm-body bm-ana" data-scroll="ana"><div class="bm-metrics"><div class="bm-k"><span class="bm-m">Spotify link</span><b>${pct(t.sp, t.songs)}</b></div><div class="bm-k"><span class="bm-m">YouTube link</span><b>${pct(t.yt, t.songs)}</b></div><div class="bm-k"><span class="bm-m">Can’t play</span><b>${t.neither.toLocaleString('en-US')}</b></div><div class="bm-k"><span class="bm-m">Songs counted</span><b>${t.songs.toLocaleString('en-US')}</b></div></div>
        <div class="bm-grid2"><section><div class="bm-label">Songs with a link</div><div class="bm-m">Spotify ${pct(t.sp, t.songs)}</div>${bar([['ok', t.songs ? t.sp / t.songs * 100 : 0]])}<div class="bm-m">YouTube ${pct(t.yt, t.songs)}</div>${bar([['ok', t.songs ? t.yt / t.songs * 100 : 0]])}<div class="bm-m">Neither ${pct(t.neither, t.songs)}</div>${bar([['none', t.songs ? t.neither / t.songs * 100 : 0]])}</section>
        <section><div class="bm-label">Least playable</div><p class="bm-dim">Genres: ${weak(c.weakGenre)}</p><p class="bm-dim">Decades: ${weak(c.weakDecade)}</p>${t.neither ? `<button type="button" class="chip-btn" data-bm="match-unplayable">Match the releases with unplayable songs</button>` : ''}</section></div></div>`;
  }
  // this run
  const shown = bmShownKinds(), bins = new Array(10).fill(0), by = {}, reasons = new Map();
  let cells = 0, matched = 0, found = 0, confident = 0;
  shown.forEach(k => { by[k] = { ok: 0, look: 0, none: 0, n: 0 }; });
  bm.rels.forEach(r => { if (!r.songs) return; shown.forEach(k => { if (r.st[k] !== 'done') return; r.songs.forEach(s => {
    const c = bmCellOf(r, s, k); cells++; by[k].n++;
    if (c.s === 'kept' || r.pick[k][s.idx]) matched++;
    if (c.top) { found++; bins[Math.min(9, Math.floor(c.top.score / 10))]++; if (c.top.band === 'confident') confident++; }
    if (c.s === 'kept' || c.s === 'confident' || r.pick[k][s.idx]) by[k].ok++; else if (c.s === 'look') by[k].look++; else if (c.s === 'none') by[k].none++;
    const why = bmMissReason(r, s, k); if (why) reasons.set(why, (reasons.get(why) || 0) + 1);
  }); }); });
  const net0 = bm.net0 || {}, req = (smNet.spotify - (net0.spotify || 0)) + (smNet.youtube - (net0.youtube || 0)) + (smNet.ytApi - (net0.ytApi || 0)), slow = smNet.spotify429 - (net0.spotify429 || 0);
  const max = Math.max(1, ...bins), thr = smPrefs().confident;
  const hist = bins.map((v, i) => `<div class="bm-hbar ${i * 10 >= thr ? 'ok' : i * 10 + 9 >= 65 ? 'look' : 'none'}" style="height:${Math.max(2, v / max * 100)}%" title="${i * 10}–${i * 10 + 9}: ${v}"></div>`).join('');
  const doneRels = bm.rels.filter(r => shown.every(k => r.st[k] !== 'wait' && r.st[k] !== 'work')).length, mins = Math.max(0.1, (Date.now() - (bm.t0 || Date.now())) / 60000);
  return `<div class="bm-tool">${toggle}<span class="bm-m">${(doneRels / mins).toFixed(1)} releases a minute · ${doneRels} of ${bm.rels.length} looked up</span></div>
    <div class="bm-body bm-ana" data-scroll="ana"><div class="bm-metrics"><div class="bm-k"><span class="bm-m">Songs matched</span><b>${matched} / ${cells}</b></div><div class="bm-k"><span class="bm-m">Confident</span><b>${pct(confident, found)}</b></div><div class="bm-k"><span class="bm-m">Requests</span><b>${req.toLocaleString('en-US')}</b></div><div class="bm-k"><span class="bm-m">Slow-downs</span><b>${slow}</b></div></div>
    <div class="bm-grid2"><section><div class="bm-label">Best score, every song</div><div class="bm-hist">${hist}</div><div class="bm-hist-x bm-m"><span>0</span><span>50</span><span>100</span></div>
      <div class="bm-sub">Confident from <input type="range" min="60" max="98" step="1" value="${thr}" data-bm="thresh" aria-label="Confident from"> <b class="bm-m" data-thresh-out>${thr}</b> <button type="button" class="chip-btn bm-sm" data-bm="thresh-retick">Re-tick with this</button></div></section>
    <section><div class="bm-label">By service</div>${shown.map(k => { const b = by[k]; return `<div class="bm-m">${bmName(k)} · ${b.ok} matched · ${b.look} look · ${b.none} none</div>${bar([['ok', b.n ? b.ok / b.n * 100 : 0], ['look', b.n ? b.look / b.n * 100 : 0], ['none', b.n ? b.none / b.n * 100 : 0]])}`; }).join('')}
      <div class="bm-label" style="margin-top:12px">Why songs weren’t matched</div><p class="bm-dim">${[...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${escapeHtml(k)} ${v}`).join(' · ') || 'Nothing missing so far.'}</p></section></div></div>`;
}

// ----- History -----
function bmHistHtml() {
  const a = bmHistAll().slice().reverse();
  if (!a.length) return '<div class="bm-body bm-pad bm-dim">Nothing has been applied yet. Each time you apply links they appear here, and each can be undone on its own.</div>';
  const rows = a.map(h => `<tr><td class="bm-m">${new Date(h.t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td><td><button type="button" class="bm-linkbtn" data-bm="hist-toggle" data-id="${escapeHtml(h.id)}">${escapeHtml(h.label)}</button><div class="bm-dim">${h.kind === 'check' ? 'Link check' : h.kind === 'release' ? 'One release' : 'Batch'} · ${bmPl(h.entries.length, 'release')}</div>${bm.histOpen === h.id ? `<ul class="bm-hlist">${h.entries.map(e => `<li>${escapeHtml(e.title)} <span class="bm-dim">${escapeHtml(e.artist)} · ${bmPl(e.n, 'link')}</span></li>`).join('')}</ul>` : ''}</td><td class="bm-m">${h.n}</td><td>${h.undone ? bmChip('wait', 'Undone') : h.n ? `<button type="button" class="chip-btn bm-sm" data-bm="hist-undo" data-id="${escapeHtml(h.id)}">Undo</button>` : ''}</td></tr>`).join('');
  return `<div class="bm-body" data-scroll="hist"><table class="bm-qtable"><thead><tr><th>When</th><th>What</th><th>Links</th><th></th></tr></thead><tbody>${rows}</tbody></table><p class="bm-dim bm-pad">Each entry keeps the links it replaced, so undoing it puts exactly those back. The last ${BM_HIST_MAX} are kept, on this device.</p></div>`;
}

// ----- Preferences -----
function bmPrefsHtml() {
  const p = smPrefs(), sel = (id, cur, opts) => `<select data-bm="pref" data-k="${id}">${opts.map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const chk = (k, l, sub) => `<label class="bm-opt${p[k] ? ' on' : ''}"><input type="checkbox" data-bm="pref" data-k="${k}"${p[k] ? ' checked' : ''}><span class="bm-opt-t">${l}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
  const ch = Object.entries(p.channels || {});
  return `<div class="bm-body bm-start" data-scroll="prefs"><div class="bm-grid2"><section><div class="bm-label">Scoring</div><div class="bm-opts">
      <div class="bm-opt"><span class="bm-opt-t">Confident from<small>A match this good is ticked for you. Lower ticks more; higher asks you about more.</small></span><input type="range" min="60" max="98" step="1" value="${p.confident}" data-bm="pref" data-k="confident" aria-label="Confident from"><b class="bm-m" data-thresh-out>${p.confident}</b></div>
      <div class="bm-opt"><span class="bm-opt-t">Length tolerance<small>How far a recording’s length may be from yours before it counts against it.</small></span>${sel('lenTol', p.lenTol, [['strict', 'Strict'], ['normal', 'Normal'], ['loose', 'Loose']])}</div>
      <div class="bm-opt"><span class="bm-opt-t">Edition<small>Between equally good editions of an album.</small></span>${sel('edition', p.edition, [['any', 'No preference'], ['original', 'Prefer the original'], ['remaster', 'Prefer remastered or deluxe']])}</div>
      ${chk('versionPenalty', 'Mark down live, remix, cover, sped-up and similar versions', 'unless your song’s own title says it is one')}${chk('topicBonus', 'Prefer the artist’s “- Topic” channel on YouTube')}</div></section>
    <section><div class="bm-label">Queue and reminders</div><div class="bm-opts">${chk('autoMatchNew', 'Match new releases by themselves', 'in the background, as they are added: confident matches are saved, the rest wait here for you (Processing shows them)')}${chk('queueNew', 'Put new releases in the match queue', 'whatever adds them: the Add form, Rate Your Music, an import')}${chk('remindCheck', 'Remind me to check my saved links once a month', p.lastCheck ? `last checked ${bmAgo(p.lastCheck)}` : 'not checked yet')}</div>
      <div class="bm-label" style="margin-top:16px">What CRATE has learned</div><div class="bm-opts">
      <div class="bm-opt"><span class="bm-opt-t">${bmPl(p.rejected.length, 'candidate')} you said never to offer again</span>${p.rejected.length ? '<button type="button" class="chip-btn bm-sm" data-bm="forget-rejected">Forget them</button>' : ''}</div>
      ${ch.length ? ch.map(([a, c]) => `<div class="bm-opt"><span class="bm-opt-t">${escapeHtml(a)}<small>prefers the YouTube channel “${escapeHtml(c)}”</small></span><button type="button" class="chip-btn bm-sm" data-bm="forget-channel" data-k="${escapeHtml(a)}">Forget</button></div>`).join('') : '<p class="bm-dim">When you choose a different YouTube channel for an artist, it is preferred for that artist from then on.</p>'}</div></section></div></div>`;
}

// ----- drawing the window -----
function bmRender() {
  const ov = bmEl('batchMatchOverlay'); if (!bm || !ov || ov.hidden) return;
  const modal = bmEl('bmModal'), keep = {};
  modal.querySelectorAll('[data-scroll]').forEach(e => { keep[e.dataset.scroll] = e.scrollTop; });
  const act = document.activeElement, keepKey = act && modal.contains(act) && act.dataset ? act.dataset.keep : null, keepVal = keepKey ? act.value : '', keepSel = keepKey && typeof act.selectionStart === 'number' ? [act.selectionStart, act.selectionEnd] : null;
  const pasteVals = {}; modal.querySelectorAll('[data-keep]').forEach(e => { pasteVals[e.dataset.keep] = e.value; });
  const ctl = bm.started && bm.running ? `<button type="button" class="chip-btn" data-bm="${bm.paused ? 'resume' : 'pause'}">${bm.paused ? 'Resume' : 'Pause'}</button><button type="button" class="chip-btn" data-bm="stop">Stop</button>` : '';
  const sub = bm.started ? `${escapeHtml(bm.label)} · ${bmKinds().map(bmName).join(' and ')} · ${bm.songsMode === 'check' ? 'checking saved links' : bm.mode === 'auto' ? 'confident matches are saved as they come' : 'nothing is saved until you apply it'} · saved as it goes` : 'Find Spotify and YouTube links for your songs: one release or many.';
  const head = `<div class="arrange-header"><div><h2 id="bmTitle">Match songs</h2><p class="sm-sub">${sub}</p></div><div class="bm-hbtns">${ctl}${bm.started ? '<button type="button" class="chip-btn" data-bm="hide">Keep working</button>' : ''}<button type="button" class="modal-x" data-bm="close" aria-label="Close">✕</button></div></div>`;
  const warn = bm.started && bmHealthBad() ? `<div class="bm-warnbar" role="alert">${bm.health.spotify === 'off' && bm.svc.spotify ? 'Spotify isn’t connected. ' : ''}${bm.health.test === 'zero' ? 'A test YouTube search read 0 videos: YouTube may have changed its page, so YouTube matches may be missing. ' : /^err:/.test(bm.health.test || '') ? `The YouTube test search failed: ${escapeHtml(bm.health.test.slice(4))} ` : ''}<button type="button" class="bm-linkbtn" data-bm="health-retry">Check again</button></div>` : '';
  const lanes = bm.started && (['queue', 'links', 'ana'].includes(bm.view) || (bm.view === 'rel' && bm.running)) ? `<div class="bm-lanes">${bmKinds().map(bmLaneHtml).join('')}</div>` : '';
  const body = bm.view === 'start' ? bmStartHtml() : bm.view === 'queue' ? bmQueueHtml() : bm.view === 'rel' ? bmRelHtml() : bm.view === 'links' ? bmLinksHtml() : bm.view === 'ana' ? bmAnaHtml() : bm.view === 'hist' ? bmHistHtml() : bmPrefsHtml();
  const foot = bm.started && ['queue', 'rel', 'links'].includes(bm.view) ? bmFootHtml() : '';
  modal.innerHTML = head + warn + bmTabsHtml() + lanes + body + foot;
  modal.querySelectorAll('[data-scroll]').forEach(e => { if (keep[e.dataset.scroll] != null) e.scrollTop = keep[e.dataset.scroll]; });
  modal.querySelectorAll('[data-keep]').forEach(e => { if (pasteVals[e.dataset.keep] != null && e.dataset.keep !== 'qsearch') e.value = pasteVals[e.dataset.keep]; });
  if (keepKey) { const n = modal.querySelector(`[data-keep="${CSS.escape(keepKey)}"]`); if (n) { n.value = keepVal; n.focus(); if (keepSel) { try { n.setSelectionRange(keepSel[0], keepSel[1]); } catch (e) { /* not a text box */ } } } }
  if (bm.scrollFocus) { bm.scrollFocus = false; const f = modal.querySelector('.bm-song.focus'); if (f) f.scrollIntoView({ block: 'nearest' }); }
  if (bm.started && bm.running && !bm.ticker) bm.ticker = setInterval(() => { if (!bm || !bm.running) { if (bm) { clearInterval(bm.ticker); bm.ticker = 0; } return; } if (!bm.hidden && (bm.view === 'queue' || bm.view === 'ana') && !(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.keep)) bmRedraw(); }, 1000);
}

// ----- exporting what is still unmatched -----
function bmExportCsv() {
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`, lines = [['Artist', 'Release', 'Track', 'Song', 'Service', 'Why'].map(q).join(',')];
  bm.rels.forEach(r => { if (!r.songs) return; bmShownKinds().forEach(k => r.songs.forEach(s => { const why = bmMissReason(r, s, k); if (why) lines.push([r.item.artist, r.item.title, s.trackNum, s.title, bmName(k), why].map(q).join(',')); })); });
  if (lines.length === 1) { flashGlobalToast('Every song in this run is matched or linked: nothing to export.'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' })); a.download = `crate-unmatched-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  flashGlobalToast(`Exported ${bmPl(lines.length - 1, 'unmatched song')}.`);
}

// ----- playing a candidate -----
function bmPreview(rel, s, kind, id) {
  const c = ((rel[kind] && rel[kind].byIdx[s.idx]) || []).find(x => x.id === id) || { id };
  if (kind === 'spotify') showMiniPlayer(`spotify:track:${id}`, beginPlayIntent());
  else openYoutubePlayer(c.link || `https://www.youtube.com/watch?v=${id}`, s.title, [], rel.item);
}
function bmCompare(rel, s, kind) {                                  // the same song on the other service: the ticked match, the best one, or the link you have
  const other = kind === 'spotify' ? 'youtube' : 'spotify', list = (rel[other] && rel[other].byIdx && rel[other].byIdx[s.idx]) || [];
  const c = list.find(x => x.id === rel.pick[other][s.idx]) || list[0];
  if (c) { bmPreview(rel, s, other, c.id); return; }
  const id = smLinkId(s, other); if (id) { if (other === 'spotify') showMiniPlayer(`spotify:track:${id}`, beginPlayIntent()); else openYoutubePlayer(s.youtubeLink, s.title, [], rel.item); }
}

// ----- clicks, changes and keys -----
function bmTickFor(rel, idx, kind, on) { const s = rel.songs.find(x => x.idx === idx), c = bmCellOf(rel, s, kind); if (c.cands.length) bmSetPick(rel, idx, kind, on ? (rel.pick[kind][idx] || c.top.id) : '', true); }
function bmQselRels() { return bm.rels.filter(r => bm.qsel.has(r.row)); }
function bmGoRel(rel) { if (!rel) return; bm.sel = rel.row; bm.view = 'rel'; bm.focus = null; bm.open = null; bm.why = null; bm.pasteFor = null; bm.scrollFocus = true; bmRender(); }
async function bmResumeSaved() {
  const s = bm.savedRun && bm.savedRun.saved; if (!s) return;
  const rels = bmRestore(s); if (!rels.length) { flashGlobalToast('None of the saved run’s releases are in your crate any more.'); bmRunDel(); bm.savedRun = null; bmRender(); return; }
  Object.assign(bm, { started: true, running: true, rels, label: s.label || bmPl(rels.length, 'release'), svc: s.svc || bm.svc, show: s.show || bm.show, ytSongs: !!s.ytSongs, mode: s.mode || 'review', songsMode: s.songsMode || 'gaps', one: !!s.one, sel: s.sel || rels[0].row, t0: Date.now(), net0: Object.assign({}, smNet), view: s.one ? 'rel' : 'queue', savedRun: null });
  ['spotify', 'youtube'].forEach(k => { bm.lanes[k] = bm.svc[k] ? { s: 'idle', msg: '' } : { s: 'off', msg: '' }; });
  bmKickLanes(); bmKinds().forEach(k => { if (bm.lanes[k].s === 'idle') bm.lanes[k].s = 'done'; }); if (!bmKinds().some(k => bm.lanes[k].s === 'work')) bm.running = false; bmRender();
}
function bmClick(e) {
  const t = e.target.closest('[data-bm]'); if (!t || !bm) return; const a = t.dataset.bm, relOf = () => bm.rels.find(r => r.row === t.dataset.row) || bmSelRel();
  if (['setup', 'tick', 'tick-song', 'tick-col', 'tick-song-all', 'inc', 'show', 'pick', 'qsel', 'qsel-all', 'qsort', 'src', 'accept-min', 'thresh', 'pref', 'qsearch'].includes(a)) return;           // inputs: handled on 'change'
  const idx = t.dataset.idx != null ? +t.dataset.idx : null, kind = t.dataset.kind;
  if (a === 'tab') { bm.view = t.dataset.v; if (bm.view === 'rel') bm.scrollFocus = true; bmRender(); }
  else if (a === 'hide') bmHide(); else if (a === 'close') bmClose(); else if (a === 'cancel') bmClose(true); else if (a === 'start') bmStart(); else if (a === 'show-dialog') bmShow();
  else if (a === 'pause') { bm.paused = true; bmRender(); } else if (a === 'resume') { bm.paused = false; bmRender(); }
  else if (a === 'stop') { bm.stopped = true; ytAddonCancel(); bmRender(); }
  else if (a === 'yt-continue') ytAddonContinue(); else if (a === 'lane-resume') bmResumeLane(kind);
  else if (a === 'resume-saved') bmResumeSaved(); else if (a === 'discard-saved') { if (confirm('Discard the saved run? Links already applied stay.')) { bmRunDel(); bm.savedRun = null; bmRender(); } }
  else if (a === 'health-retry') bmHealthRun(true);
  else if (a === 'setup-spotify') { bmHide(); el.menuSpotifyApi.click(); } else if (a === 'setup-youtube') { bmHide(); el.menuYoutubeApi.click(); }
  else if (a === 'qfilter') { bm.qfilter = t.dataset.f; bmRender(); }
  else if (a === 'open-rel') { if (e.target.closest('input,label,button:not([data-bm="open-rel"])')) return; bmGoRel(relOf()); }
  else if (a === 'bulk-tick') { const rs = bm.qsel.size ? bmQselRels() : bm.rels; rs.forEach(r => bmShownKinds().forEach(k => bmSetPicks(r, k))); bmRender(); }
  else if (a === 'bulk-rerun') { const rs = bmQselRels(); if (!rs.length) { flashGlobalToast('Select the releases to look up again first.'); return; } bmRerun(rs); }
  else if (a === 'bulk-skip' || a === 'bulk-include') { const rs = bmQselRels(); if (!rs.length) { flashGlobalToast('Select releases first.'); return; } rs.forEach(r => { r.include = a === 'bulk-include'; }); if (a === 'bulk-include') bmKickLanes(); bmRedraw(); }
  else if (a === 'bulk-top') { const rs = bmQselRels(); if (!rs.length) { flashGlobalToast('Select releases first.'); return; } bm.rels = rs.concat(bm.rels.filter(r => !bm.qsel.has(r.row))); bm.qsort = 'added'; bmRedraw(); }
  else if (a === 'export-csv') bmExportCsv();
  else if (a === 'mq-add') { const items = mqItems().filter(it => !bm.rels.some(r => r.item === it)); items.forEach(it => { const r = bmMk(it); ['spotify', 'youtube'].filter(k => !bm.svc[k]).forEach(k => { r.st[k] = 'skip'; r.err[k] = 'Not run'; }); bm.rels.push(r); }); mqRemove(mqItems()); bmKickLanes(); flashGlobalToast(`Added ${bmPl(items.length, 'release')} to this run.`); bmRedraw(); }
  else if (a === 'nav') { const i = bm.rels.indexOf(bmSelRel()) + Number(t.dataset.d); if (bm.rels[i]) bmGoRel(bm.rels[i]); }
  else if (a === 'rel-rerun') bmRerun([bmSelRel()]);
  else if (a === 'rel-skip') { const r = bmSelRel(); r.include = !r.include; if (r.include) bmKickLanes(); bmRedraw(); }
  else if (a === 'rel-edit') { const r = bmSelRel(); bmHide(); tgOpen(r.item); }
  else if (a === 'rel-apply') { const r = bmSelRel(); bmApply([r], r.item.title); }
  else if (a === 'run-kind') bmRunKindFor(bmSelRel(), kind);
  else if (a === 'retry-kind') bmRerun([bmSelRel()], [kind]);
  else if (a === 'paste-src') { const inp = bmEl('bmModal').querySelector(`[data-keep="paste-src-${kind}"]`); bmPasteSource(bmSelRel(), kind, inp && inp.value); }
  else if (a === 'paste-src-cancel') { bm.pasteFor = null; bmRender(); }
  else if (a === 'filter') { bm.filter = t.dataset.f; bmRender(); }
  else if (a === 'rule-accept') { const r = bmSelRel(), min = bm.acceptMin || 75; bmShownKinds().forEach(k => (r.songs || []).forEach(s => { const c = bmCellOf(r, s, k); if (c.top && c.top.score >= min && c.s !== 'kept') bmSetPick(r, s.idx, k, r.pick[k][s.idx] || c.top.id, true); })); bmRender(); }
  else if (a === 'rule-unlive') { const r = bmSelRel(); let n = 0; bmShownKinds().forEach(k => (r.songs || []).forEach(s => { const id = r.pick[k][s.idx]; if (!id) return; const c = (r[k].byIdx[s.idx] || []).find(x => x.id === id); const extra = c ? [...smFlags(c.title)].filter(f => !smFlags(s.title).has(f)) : []; if (extra.length) { bmSetPick(r, s.idx, k, '', true); n++; } })); flashGlobalToast(n ? `Unticked ${bmPl(n, 'version')} your titles don’t name.` : 'Nothing ticked looks like a live version or a remix.'); bmRender(); }
  else if (a === 'rule-untick') { const r = bmSelRel(); bmShownKinds().forEach(k => (r.songs || []).forEach(s => { if (r.pick[k][s.idx]) bmSetPick(r, s.idx, k, '', true); })); bmRender(); }
  else if (a === 'yt-rest') bmSearchRest(bmSelRel());
  else if (a === 'choose') { const r = relOf(), o = bm.open; bm.open = o && o.row === r.row && o.idx === idx && o.kind === kind ? null : { row: r.row, idx, kind }; bm.focus = { idx, kind }; bmRender(); }
  else if (a === 'why') { const r = relOf(), w = bm.why; bm.why = w && w.row === r.row && w.idx === idx && w.kind === kind && w.id === t.dataset.id ? null : { row: r.row, idx, kind, id: t.dataset.id }; bm.focus = { idx, kind }; if (bm.view !== 'rel') { bm.sel = r.row; bm.view = 'rel'; bm.scrollFocus = true; } bmRender(); }
  else if (a === 'why-close') { bm.why = null; bmRender(); }
  else if (a === 'preview') { const r = relOf(); bmPreview(r, r.songs.find(s => s.idx === idx), kind, t.dataset.id); }
  else if (a === 'compare') { const r = relOf(); bmCompare(r, r.songs.find(s => s.idx === idx), kind); }
  else if (a === 'reject') { const r = relOf(); bmReject(r, idx, kind, t.dataset.id); }
  else if (a === 'paste-song') { const r = relOf(), inp = bmEl('bmModal').querySelector(`[data-keep="paste-song-${CSS.escape(r.row)}-${idx}-${kind}"]`); bmPasteSong(r, idx, kind, inp && inp.value); }
  else if (a === 'yt-song') {
    const r = relOf(); if (!r) return;
    if (!ytUseAddon() && !confirm('Searching YouTube for one song costs 100 of today’s quota units. Go ahead?')) return;
    t.disabled = true; t.textContent = 'Searching…';
    if (!r.youtube || r.youtube.status !== 'done') { r.youtube = { status: 'done', byIdx: {} }; r.st.youtube = 'done'; }
    smYoutubeSearchSongs(r.item, r.songs, [idx]).then(added => { if (added[idx]) { r.youtube.byIdx[idx] = added[idx]; bmFilterRejected(r.youtube, 'youtube'); bmSetPicks(r, 'youtube'); } else flashGlobalToast('Nothing on YouTube looks like that song.'); bmRedraw(); }).catch(err => { flashGlobalToast(ytAddonErrText(err)); bmRedraw(); });
  }
  else if (a === 'links-check') { bm.songsMode = 'check'; bm.label = `Link check · ${bmPl(bm.rels.length, 'release')}`; bmRerun(bm.rels); bm.view = 'links'; bmRender(); }
  else if (a === 'ana-scope') { bm.anaScope = t.dataset.s; bmRender(); }
  else if (a === 'thresh-retick') { bm.rels.forEach(r => bmKinds().forEach(k => bmSetPicks(r, k))); flashGlobalToast('Ticked again with the new threshold (songs you chose yourself are left as they are).'); bmRender(); }
  else if (a === 'match-unplayable') { const items = state.raw.filter(it => { const ls = bmLinkState(it); return ls && ls.some(x => !x.sp && !x.yt); }); bmClose(true); bmOpen({ ticked: items, view: items }); }
  else if (a === 'hist-undo') bmHistUndo(t.dataset.id).then(() => bmRender());
  else if (a === 'hist-toggle') { bm.histOpen = bm.histOpen === t.dataset.id ? null : t.dataset.id; bmRender(); }
  else if (a === 'forget-rejected') { smPrefsSave({ rejected: [] }); bmRender(); }
  else if (a === 'forget-channel') { const ch = Object.assign({}, smPrefs().channels); delete ch[t.dataset.k]; smPrefsSave({ channels: ch }); bmRender(); }
  else if (a === 'diff-toggle') { bm.diffOpen = !bm.diffOpen; bmRender(); }
  else if (a === 'apply') bmApply(); else if (a === 'undo-last') bmUndoLast();
}
function bmRebandAll() { bm.rels.forEach(r => ['spotify', 'youtube'].forEach(k => { const res = r[k]; if (!res || !res.byIdx) return; Object.values(res.byIdx).forEach(list => list.forEach(c => { if (c.score != null && c.source !== 'pasted' && c.source !== 'relinked') c.band = smBand(c.score); })); })); }
function bmChange(e) {
  const t = e.target.closest('[data-bm]'); if (!t || !bm) return; const a = t.dataset.bm, relOf = () => bm.rels.find(r => r.row === t.dataset.row) || bmSelRel();
  if (a === 'setup') {
    if (t.name === 'bmScope') bm.scope = t.value; else if (t.name === 'bmSongsMode') bm.songsMode = t.value; else if (t.name === 'bmMode') bm.mode = t.value;
    else if (t.id === 'bmSkipLinked') bm.skipLinked = t.checked; else if (t.id === 'bmYtSongs') bm.ytSongs = t.checked;
    else if (t.id === 'bmSvcSpotify') bm.svc.spotify = t.checked; else if (t.id === 'bmSvcYoutube') { bm.svc.youtube = t.checked; bm.svcTouched = true; }
    else if (t.name === 'bmPar') { bm.par[t.dataset.kind] = Number(t.value) || 1; bmParSave(bm.par); }
    bmRender(); return;
  }
  if (a === 'qsel') { if (t.checked) bm.qsel.add(t.dataset.row); else bm.qsel.delete(t.dataset.row); }
  else if (a === 'qsel-all') { bmQueueRows().forEach(x => { if (t.checked) bm.qsel.add(x.r.row); else bm.qsel.delete(x.r.row); }); }
  else if (a === 'qsort') bm.qsort = t.value;
  else if (a === 'accept-min') { bm.acceptMin = Number(t.value) || 75; return; }
  else if (a === 'src') {
    const r = bmSelRel(), k = t.dataset.kind, v = t.value;
    if (v.startsWith('ed:')) bmUseEdition(r, k, v.slice(3));
    else if (v === 'paste') { bm.pasteFor = k; bmRender(); const inp = bmEl('bmModal').querySelector(`[data-keep="paste-src-${k}"]`); if (inp) inp.focus(); return; }
    else if (v === 'songs') bmSearchRest(r);
    else if (v === 'fv') { bmHide(); fvOpen(r.item); return; }
  }
  else if (a === 'show') { bm.show[t.dataset.kind] = t.checked; if (!bmShownKinds().length) bm.show[t.dataset.kind] = true; }
  else if (a === 'tick') { const r = relOf(); bmTickFor(r, +t.dataset.idx, t.dataset.kind, t.checked); }
  else if (a === 'pick') { const r = relOf(); bmSetPick(r, +t.dataset.idx, t.dataset.kind, t.value, true); }
  else if (a === 'tick-song') { const r = relOf(), idx = +t.dataset.idx; bmShownKinds().forEach(k => bmTickFor(r, idx, k, t.checked)); }
  else if (a === 'tick-col') { const r = bmSelRel(), k = t.dataset.kind; (r.songs || []).forEach(s => bmTickFor(r, s.idx, k, t.checked)); }
  else if (a === 'tick-song-all') { const r = bmSelRel(); (r.songs || []).forEach(s => bmShownKinds().forEach(k => bmTickFor(r, s.idx, k, t.checked))); }
  else if (a === 'thresh') { smPrefsSave({ confident: Number(t.value) }); bmRebandAll(); }
  else if (a === 'pref') { const k = t.dataset.k, v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value; smPrefsSave({ [k]: v }); if (k === 'confident') bmRebandAll(); }
  bmRender(); bmStripRender();
}
function bmInput(e) {
  const t = e.target; if (!bm) return;
  if (t.dataset.bm === 'qsearch') { bm.qsearch = t.value; bmRender(); }
  else if (t.dataset.bm === 'thresh' || (t.dataset.bm === 'pref' && t.type === 'range')) { const o = t.parentElement.querySelector('[data-thresh-out]'); if (o) o.textContent = t.value; }
}
function bmKey(e) {
  if (!bm) return;
  if (e.key === 'Escape') { e.preventDefault(); if (bm.open || bm.why || bm.pasteFor) { bm.open = null; bm.why = null; bm.pasteFor = null; bmRender(); } else if (!bm.started) bmClose(true); else bmHide(); return; }
  if (bm.view !== 'rel' || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input,select,textarea'))) return;
  const rel = bmSelRel(); if (!rel || !rel.songs || !rel.songs.length) return;
  const songs = bmRelSongsShown(rel), shown = bmShownKinds(), f = bm.focus || { idx: songs[0] && songs[0].idx, kind: shown[0] };
  const at = Math.max(0, songs.findIndex(s => s.idx === f.idx)), s = songs[at], k = e.key.toLowerCase(), done = () => { e.preventDefault(); bm.scrollFocus = true; bmRender(); };
  if (k === 'j' || e.key === 'ArrowDown') { const n = songs[Math.min(songs.length - 1, at + 1)]; if (n) bm.focus = { idx: n.idx, kind: f.kind }; bm.why = null; done(); }
  else if (k === 'k' || e.key === 'ArrowUp') { const n = songs[Math.max(0, at - 1)]; if (n) bm.focus = { idx: n.idx, kind: f.kind }; bm.why = null; done(); }
  else if (k === 'h' || e.key === 'ArrowLeft' || k === 'l' || e.key === 'ArrowRight') { const i = shown.indexOf(f.kind) + (k === 'h' || e.key === 'ArrowLeft' ? -1 : 1); if (shown[i]) bm.focus = { idx: f.idx, kind: shown[i] }; done(); }
  else if (/^[1-5]$/.test(k) && s) { const c = bmCellOf(rel, s, f.kind); const x = c.cands[Number(k) - 1]; if (x) bmSetPick(rel, s.idx, f.kind, x.id, true); done(); }
  else if (k === 'x' && s) { bmSetPick(rel, s.idx, f.kind, '', true); done(); }
  else if (e.key === ' ' && s) { e.preventDefault(); const c = bmCellOf(rel, s, f.kind), id = rel.pick[f.kind][s.idx] || (c.top && c.top.id); if (id) bmPreview(rel, s, f.kind, id); }
  else if ((k === 'w' || e.key === 'Enter') && s) { const c = bmCellOf(rel, s, f.kind), id = rel.pick[f.kind][s.idx] || (c.top && c.top.id); bm.why = id && !(bm.why && bm.why.idx === s.idx && bm.why.kind === f.kind) ? { row: rel.row, idx: s.idx, kind: f.kind, id } : null; done(); }
  else if (k === 'a') { e.preventDefault(); if (bmRelPicks(rel)) bmApply([rel], rel.item.title); }
  else if (k === 'n') { const i = bm.rels.indexOf(rel), next = bm.rels.slice(i + 1).concat(bm.rels.slice(0, i)).find(r => bmRelStatus(r).key === 'look' || bmRelStatus(r).key === 'problem'); if (next) bmGoRel(next); else flashGlobalToast('No other release needs a look.'); e.preventDefault(); }
  else if (e.key === '[' || e.key === ']') { const i = bm.rels.indexOf(rel) + (e.key === ']' ? 1 : -1); if (bm.rels[i]) bmGoRel(bm.rels[i]); e.preventDefault(); }
}
(function wireBatchMatch() {
  const ov = bmEl('batchMatchOverlay'), strip = bmEl('bmStrip'); if (!ov) return;
  ov.addEventListener('click', bmClick); ov.addEventListener('change', bmChange); ov.addEventListener('input', bmInput); ov.addEventListener('keydown', bmKey); if (strip) strip.addEventListener('click', bmClick);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov && bm) { if (!bm.started) bmClose(true); else bmHide(); } });
  const mm = bmEl('menuBatchMatch'), mu = bmEl('menuBatchUndo'), sm = bmEl('albumSelMatch'), sc = bmEl('albumSelClear');
  const open = () => { const sel = bmSelectedItems(); bmOpen({ ticked: sel.length ? sel : null, view: (state.filtered || []).slice() }); };
  const nl = bmEl('menuMatchNoLinks'); if (nl) nl.addEventListener('click', () => { el.layoutMenu.hidden = true; bmOpen({ nolinks: true, view: (state.filtered || []).slice() }); });
  if (mm) mm.addEventListener('click', open); if (mu) mu.addEventListener('click', bmUndoLast); if (sm) sm.addEventListener('click', open);
  if (sc) sc.addEventListener('click', () => { state.selectedAlbums.clear(); document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected')); updateAlbumSelBar(); });
  // Once the crate has loaded: an interrupted run, and the monthly link-check reminder.
  let tries = 0;
  const later = () => {
    if (!state.raw.length) { if (++tries < 30) setTimeout(later, 4000); return; }
    bmSavedSummary().then(s => {
      if (s && s.waiting && !bm) { flashGlobalToast(`Your song matching run (${s.label || bmPl(s.n, 'release')}) was interrupted. Click to carry on.`, { onClick: () => { bmOpen({ view: (state.filtered || []).slice() }); bmSavedSummary().then(x => { if (bm && x) { bm.savedRun = x; bmResumeSaved(); } }); } }); return; }
      const p = smPrefs(); if (p.remindCheck && p.lastCheck && Date.now() - p.lastCheck > 30 * 864e5 && !bm) flashGlobalToast('It has been a month since your saved links were checked. Click to check them.', { onClick: () => bmOpen({ view: state.raw.slice(), check: true }) });
    });
  };
  setTimeout(later, 6000);
})();


/* ---------- Match songs ----------
   One dialog for a whole release instead of one song at a time. Spotify is matched ALBUM-first: the edition of the
   album that best explains your tracklist is found (up to four candidate editions are read in full), then songs are
   paired to its tracks by title, length and position — so a live take or a cover with the same title can't beat the
   real track, and a release's songs all come from one coherent edition. Songs that edition doesn't explain are
   searched for one by one (free). YouTube is matched PLAYLIST-first: the album's playlist (usually the artist's
   auto-generated "Topic" one) is read in a single go, which costs about 100 of the day's 10,000 quota units for the
   whole album instead of 100 per song; searching songs one by one is offered separately, with the cost stated.
   Every candidate carries a score and the reasons for it (see the song-match block). Nothing is saved until you press
   Save, and then it's one update. Links already saved are never replaced unless you pick a different one. */
const SM_YT_QUOTA_KEY = 'crate_youtube_quota_v1', SM_YT_DAILY = 10000;
function smPacificDay() { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); } catch (e) { return new Date().toISOString().slice(0, 10); } }   // YouTube's quota resets at midnight Pacific
function smYtQuotaUsed() { try { const q = JSON.parse(localStorage.getItem(SM_YT_QUOTA_KEY) || '{}'); return q.day === smPacificDay() ? (q.used || 0) : 0; } catch (e) { return 0; } }
function smYtQuotaAdd(n) { try { localStorage.setItem(SM_YT_QUOTA_KEY, JSON.stringify({ day: smPacificDay(), used: smYtQuotaUsed() + n })); } catch (e) { /* just not counted */ } }
// ---- Remembering YouTube lookups (the API route): what was looked up once is not paid for again ----
// An album's playlist lookup costs about 100 of the 10,000 daily units, a song's own search 100 more. They are kept on this device for 14 days (7 when nothing was found); an error or a quota refusal is never kept.
const YT_CACHE_KEY = 'crate_yt_cache_v1', YT_CACHE_MAX = 200, YT_REL_TTL = 14 * 864e5, YT_NONE_TTL = 7 * 864e5;
const ytCacheNorm = (v) => String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
function ytCacheAll() { try { const o = JSON.parse(localStorage.getItem(YT_CACHE_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
function ytCacheGet(key) { const e = ytCacheAll()[key]; return e && e.x > Date.now() && e.v ? e : null; }          // { t: when it was looked up, x: kept until, v: the answer }
function ytCachePut(key, v, ttl) {
  const o = ytCacheAll(), now = Date.now(); o[key] = { t: now, x: now + ttl, v };
  Object.keys(o).forEach(k => { if (!(o[k].x > now)) delete o[k]; });
  const ks = Object.keys(o); if (ks.length > YT_CACHE_MAX) ks.sort((a, b) => o[a].t - o[b].t).slice(0, ks.length - YT_CACHE_MAX).forEach(k => delete o[k]);
  for (let tries = 0; tries < 4; tries++) {
    try { localStorage.setItem(YT_CACHE_KEY, JSON.stringify(o)); return; }
    catch (e) { const old = Object.keys(o).sort((a, b) => o[a].t - o[b].t); if (old.length <= 1) return; old.slice(0, Math.ceil(old.length / 2)).forEach(k => delete o[k]); }          // the browser's storage is full: the oldest half goes
  }
}
function ytCacheCount() { const o = ytCacheAll(), now = Date.now(); return Object.keys(o).filter(k => o[k].x > now).length; }
function ytCacheClear() { try { localStorage.removeItem(YT_CACHE_KEY); } catch (e) { /* nothing to clear */ } }
function smRelKey(item) { return 'rel|' + ytCacheNorm(item.artist) + '|' + ytCacheNorm(String(item.title || '').replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim()); }
function ytPaintQuotaLine() {
  const e = document.getElementById('ytQuotaLine'); if (!e) return; const used = smYtQuotaUsed(), n = ytCacheCount();
  e.textContent = `Today CRATE has used about ${used.toLocaleString()} of YouTube\u2019s 10,000 daily units (it resets at midnight Pacific; searches made outside CRATE with the same key aren\u2019t counted). ${n} album and song lookup${n === 1 ? ' is' : 's are'} remembered, so looking ${n === 1 ? 'it' : 'them'} up again costs nothing.`;
}
let smState = null;
let smLoadSeq = 0;

async function smBuildSongs(item) {
  const tracks = (await getTracksFor(item)) || [];
  return tracks.map((t, i) => ({ idx: i, trackNum: t.trackNumber || (i + 1), trackNumber: i + 1, title: t.trackName || '', artist: item.artist, album: item.title,
    durationMs: t.trackTimeMillis || 0, spotifyLink: t.spotifyLink || '', youtubeLink: t.youtubeLink || '' })).filter(s => s.title);
}
function smTopCands(song, cands, min, limit) {
  return cands.map(c => Object.assign({}, c, smScore(song, c, {}))).filter(c => c.score >= min).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ----- Spotify -----
async function smSpotifyGetter() {                                   // a JSON reader with the app's Spotify token, or null when Spotify isn't set up
  const token = await getSpotifyToken();
  if (!token) return null;
  return async (url) => {
    const res = await spotifyApiFetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.status === 401) { spotifyToken = null; throw new Error('Spotify\u2019s session expired \u2014 try again'); }
    if (!res.ok) throw new Error('Spotify answered ' + res.status);
    return res.json();
  };
}
async function smSpotifyReadAlbum(getJson, id, mine) {               // one album, every track (in pages of 50)
  const d = await getJson(`https://api.spotify.com/v1/albums/${id}`);
  let items = (d.tracks && d.tracks.items) || [], next = d.tracks && d.tracks.next;
  while (next) { const page = await getJson(next); items = items.concat(page.items || []); next = page.next; }
  return { id: d.id, name: d.name, url: (d.external_urls && d.external_urls.spotify) || '', mine: !!mine,
    tracks: items.map((t, i) => ({ id: t.id, title: t.name, artists: (t.artists || []).map(a => a.name), durationMs: t.duration_ms || 0, album: d.name, index: i + 1 })) };
}
// The candidates for each song, given the edition chosen (the best fit, or one you picked): its tracks paired to your
// songs, plus up to three alternatives from the other editions. Songs it doesn't explain keep what a search found.
function smSpotifyByEdition(songs, editions, chosen, prev) {
  const byIdx = {}, all = editions.reduce((acc, al) => acc.concat(al.tracks), []);
  const f = chosen ? smAlbumFit(songs, chosen.tracks) : null;
  songs.forEach(s => {
    const m = f && f.assign.get(s.idx);
    if (m) {
      const others = smTopCands(s, all, 50, 6).filter(c => c.id !== m.cand.id).slice(0, 3);
      byIdx[s.idx] = [Object.assign({}, m.cand, { score: m.score, band: m.band, reasons: m.reasons, parts: m.parts, source: 'album' }), ...others.map(c => Object.assign(c, { source: 'edition' }))];
    } else if (prev && prev[s.idx] && prev[s.idx][0] && prev[s.idx][0].source === 'search') byIdx[s.idx] = prev[s.idx];
  });
  return byIdx;
}
async function smSpotifyForRelease(item, songs) {
  const getJson = await smSpotifyGetter();
  if (!getJson) return { status: 'nocreds' };
  const clean = item.title.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim();
  const found = new Map();
  const own = String(item.link || '').match(/open\.spotify\.com\/album\/([A-Za-z0-9]+)/);
  if (own) found.set(own[1], { id: own[1], mine: true, nameSim: 1 });          // the edition you linked yourself is always considered
  for (const q of [`album:${clean} artist:${item.artist}`, `${item.artist} ${clean}`]) {
    const d = await getJson(`https://api.spotify.com/v1/search?type=album&limit=10&q=${encodeURIComponent(q)}`);
    ((d.albums && d.albums.items) || []).filter(a => spotifyResultArtistMatches(a, item.artist)).forEach(a => { if (!found.has(a.id)) found.set(a.id, { id: a.id, nameSim: smSim(smCore(a.name), smCore(item.title)) }); });
    if (found.size >= 4) break;
  }
  const albums = [];
  for (const meta of [...found.values()].sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.nameSim - a.nameSim).slice(0, 4)) {
    try { albums.push(await smSpotifyReadAlbum(getJson, meta.id, meta.mine)); }
    catch (e) { if (/session/.test(e.message)) throw e; console.warn('Spotify album read failed', e); }
  }
  albums.forEach(al => { const f = smAlbumFit(songs, al.tracks); al.fit = Math.round(f.fit); al.matched = f.matched; });
  const best = smBestAlbum(songs, albums);
  const useAlbum = best && best.fit >= 55;
  const byIdx = smSpotifyByEdition(songs, albums, useAlbum ? best.album : null, null);
  // songs the album didn't explain (or no album at all): a search for each, scored the same way
  for (const s of songs) {
    if (byIdx[s.idx]) continue;
    let items = [];
    for (const q of [`track:${s.title} artist:${item.artist}`, `${item.artist} ${s.title}`]) {
      try {
        const d = await getJson(`https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(q)}`);
        items = (d.tracks && d.tracks.items) || [];
      } catch (e) { if (/session/.test(e.message)) throw e; items = []; }
      if (items.length) break;
    }
    const cands = items.map(t => ({ id: t.id, title: t.name, artists: (t.artists || []).map(a => a.name), durationMs: t.duration_ms || 0, album: (t.album && t.album.name) || '', index: 0 }));
    const top = smTopCands(s, cands, 35, 4).map(c => Object.assign(c, { source: 'search' }));
    if (top.length) byIdx[s.idx] = top;
  }
  return { status: 'done', albumName: useAlbum ? best.album.name : '', albumUrl: useAlbum ? best.album.url : '', albumId: useAlbum ? best.album.id : '', fit: useAlbum ? best.fit : 0, byIdx, editions: albums,
    searched: songs.filter(s => byIdx[s.idx] && byIdx[s.idx][0].source === 'search').length };
}

// ----- The "CRATE for YouTube" add-on: asks YouTube's own pages instead of its API (no quota, no key). It answers three questions: a video search, a playlist search, a playlist's videos. -----
const ytAddon = { ready: false, version: '', state: 'idle', reason: '', queue: 0, nextAt: 0, today: 0, cap: 0, parallel: 1, pending: new Map(), seq: 0, poll: 0 };
const ytPagesNote = () => ytAddon.cap ? `${ytAddon.today} of ${ytAddon.cap} pages used today` : `${ytAddon.today} page${ytAddon.today === 1 ? '' : 's'} read in the last 24 hours (no daily limit)`;          // an add-on older than 1.2.0 still has a limit of 250 a day and says so; 1.2.0 and later say cap 0
const ytAddonSay = (type, extra) => window.postMessage(Object.assign({ source: 'crate-app', type }, extra || {}), window.location.origin);
function ytUseAddon() { let off = false; try { off = localStorage.getItem('crate_yt_use_addon') === '0'; } catch (e) { /* default: on */ } return !!(ytAddon.ready && !off); }
function ytAddonWhy(reason) {
  return ({ consent: 'YouTube is asking its cookie question. That page is open in front of you: answer it once, then press Continue.', check: 'YouTube says it has noticed unusual traffic. That page is open in front of you: pass the check there, then press Continue, or Cancel and wait a while.',
    unreadable: 'the add-on couldn\u2019t understand a YouTube page (YouTube may have changed it). Open that page and use the add-on\u2019s Diagnose button, and send me what it shows.', timeout: 'a YouTube page took too long to load.', closed: 'the YouTube page was closed while it was being read.',
    daily: 'the add-on\u2019s limit of 250 YouTube pages a day is used up.', busy: 'too many questions are waiting in the add-on.', noanswer: 'the add-on didn\u2019t answer. Is it installed and connected to this page?', cancelled: 'it was cancelled.', bad: 'that question wasn\u2019t valid.' })[reason] || `something went wrong (${reason || 'unknown'}).`;
}
function ytAddonErrText(e) { const m = /^addon: (.*)$/.exec(String((e && e.message) || e)); return m ? ytAddonWhy(m[1]) : String((e && e.message) || e); }
function ytAddonRequest(op) {                                       // resolves with the items, or rejects with Error('addon: <reason>')
  return new Promise((resolve, reject) => {
    const reqId = 'r' + Date.now().toString(36) + (++ytAddon.seq), pr = { resolve, reject, accepted: false, timer: 0 };
    pr.arm = (ms) => { clearTimeout(pr.timer); pr.timer = setTimeout(() => { ytAddon.pending.delete(reqId); reject(new Error('addon: noanswer')); }, ms); };
    pr.arm(5000); ytAddon.pending.set(reqId, pr); ytAddonSay('yt-request', { reqId, op }); smNet.youtube++;
    if (!ytAddon.poll) ytAddon.poll = setInterval(() => {            // while something waits: ask for a result that may have been missed, and wake the add-on's background
      if (!ytAddon.pending.size) { clearInterval(ytAddon.poll); ytAddon.poll = 0; return; }
      ytAddon.pending.forEach((q, id) => { if (q.accepted) ytAddonSay('yt-get', { reqId: id }); }); ytAddonSay('yt-hello');
    }, 10000);
  });
}
const ytAddonContinue = () => ytAddonSay('yt-continue'), ytAddonCancel = () => ytAddonSay('yt-cancel'), ytAddonHello = () => ytAddonSay('yt-hello');
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const d = e.data; if (!d || d.source !== 'crate-addon' || typeof d.type !== 'string' || d.type.slice(0, 3) !== 'yt-') return;
  const redraw = () => { if (typeof smState !== 'undefined' && smState) smRender(); if (typeof bmRedraw === 'function') bmRedraw(); };
  if (d.type === 'yt-script') ytAddonHello();
  else if (d.type === 'yt-ready') { ytAddon.ready = !!d.ok; ytAddon.version = d.version || ''; if (d.state) ytAddon.state = d.state; ytAddon.today = d.today || 0; ytAddon.cap = d.cap || 0; ytAddon.parallel = Math.max(1, Number(d.parallel) || 1); redraw(); }
  else if (d.type === 'yt-accepted') {
    const pr = ytAddon.pending.get(d.reqId); if (!pr) return; const r = d.resp || {};
    if (!r.ok) { ytAddon.pending.delete(d.reqId); clearTimeout(pr.timer); pr.reject(new Error('addon: ' + (r.reason || 'noanswer'))); } else { pr.accepted = true; pr.arm(150000); }
  } else if (d.type === 'yt-result') {
    if (d.pending) return; const pr = ytAddon.pending.get(d.reqId); if (!pr) return; ytAddon.pending.delete(d.reqId); clearTimeout(pr.timer);
    if (d.ok) pr.resolve(d.items || []); else pr.reject(new Error('addon: ' + (d.reason || 'failed')));
  } else if (d.type === 'yt-state') {
    ytAddon.state = d.state; ytAddon.reason = d.reason || ''; ytAddon.queue = d.queue || 0; ytAddon.nextAt = d.nextAt || 0;
    ytAddon.pending.forEach(pr => { if (pr.accepted) pr.arm(d.state === 'stopped' ? 1800000 : 150000); });          // waiting for YOU is not a reason to give up for half an hour
    redraw();
  }
});
setTimeout(ytAddonHello, 800); setTimeout(ytAddonHello, 3500);
function ytAddonPaintDialog() {
  const cb = document.getElementById('ytUseAddon'), line = document.getElementById('ytAddonLine'); if (!cb || !line) return;
  let off = false; try { off = localStorage.getItem('crate_yt_use_addon') === '0'; } catch (e) { /* on */ }
  cb.checked = !off; ytAddonHello();
  line.textContent = ytAddon.ready ? `Found: version ${ytAddon.version}, ${ytPagesNote()}.${off ? ' (Switched off here: the API is used.)' : ''}` : 'Not found: install it and connect it to this page (it says how in its options).';
  setTimeout(() => { if (line.isConnected && ytAddon.ready) line.textContent = `Found: version ${ytAddon.version}, ${ytPagesNote()}.${off ? ' (Switched off here: the API is used.)' : ''}`; }, 700);
}
(function wireYtAddonSwitch() {
  const cb = document.getElementById('ytUseAddon'), menu = document.getElementById('menuYoutubeApi');
  if (cb) cb.addEventListener('change', () => { try { localStorage.setItem('crate_yt_use_addon', cb.checked ? '1' : '0'); } catch (e) { /* not kept */ } ytAddonPaintDialog(); if (typeof smState !== 'undefined' && smState) smRender(); });
  if (menu) menu.addEventListener('click', ytAddonPaintDialog);
})();
function ytAddonIdleHtml() {
  return `<div class="sm-status"><span>This looks for the album\u2019s playlist on YouTube and matches every song in one go, through the CRATE for YouTube add-on: no quota and no key. It reads YouTube\u2019s pages one at a time in the background, a couple of seconds apart, so it takes a few seconds (${ytPagesNote()}).</span><button type="button" class="config-btn" data-sm="run-youtube">Find on YouTube</button></div>`;
}
function ytAddonLoadingHtml() {
  if (ytAddon.state === 'stopped') return `<div class="sm-status" role="alert"><span>${escapeHtml(ytAddonWhy(ytAddon.reason))}</span><button type="button" class="config-btn" data-sm="yt-continue">Continue</button><button type="button" class="ai-link-btn" data-sm="yt-cancel">Cancel</button></div>`;
  const secs = ytAddon.nextAt ? Math.max(0, Math.round((ytAddon.nextAt - Date.now()) / 1000)) : 0;
  return `<div class="sm-status" role="status" aria-live="polite"><span>Looking on YouTube through the add-on\u2026${ytAddon.queue > 1 ? ` ${ytAddon.queue} pages to read` : ''}${ytAddon.state === 'gap' && secs ? `, pausing ${secs} s before the next one (on purpose)` : ''}</span><div class="gi-mb-bar"><i></i></div></div>`;
}
async function smYtPlaylistSearchViaAddon(q) {                       // the add-on's answer in the shape the API gives, so the matcher's own ranking runs unchanged
  const r = await ytAddonRequest({ kind: 'search-playlist', q });
  return { items: r.map(pl => ({ id: { playlistId: pl.id }, snippet: { title: pl.title, channelTitle: pl.channel } })) };
}
async function smYtApi(path, params, cost) {
  const key = loadYoutubeApiKey();
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams(Object.assign({}, params, { key })).toString()}`); smNet.ytApi++;
  if (!res.ok) {
    let reason = '';
    try { const e = await res.json(); reason = (e.error && e.error.errors && e.error.errors[0] && e.error.errors[0].reason) || (e.error && e.error.message) || ''; } catch (e) { /* no body */ }
    if (res.status === 403 && /quota/i.test(reason)) throw new Error('quota');
    if (res.status === 400 || res.status === 403) throw new Error('key: ' + (reason || res.status));
    throw new Error('YouTube answered ' + res.status);
  }
  smYtQuotaAdd(cost);
  return res.json();
}
async function smYtDetails(ids) {         // length, whether it can be embedded (the app plays YouTube in an embedded player), channel
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const d = await smYtApi('videos', { part: 'contentDetails,status,snippet', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, 1);
    (d.items || []).forEach(v => out.set(v.id, { durationMs: smIsoDuration(v.contentDetails && v.contentDetails.duration), blocked: !!(v.status && v.status.embeddable === false), channel: (v.snippet && v.snippet.channelTitle) || '', title: (v.snippet && v.snippet.title) || '' }));
  }
  return out;
}
async function smYtReadPlaylist(id, title, channel) {                // one playlist's videos: through the add-on (no quota) or the API (1 unit a page)
  if (ytUseAddon()) {
    const pv = await ytAddonRequest({ kind: 'playlist', id });
    return { id, name: title || '', channel: channel || '', tracks: pv.map(v => ({ id: v.id, title: v.title, channel: v.channel || channel || '', durationMs: v.durationMs || 0, blocked: false, index: v.index })) };
  }
  let vids = [], page = '', pages = 0;
  do {
    const d = await smYtApi('playlistItems', Object.assign({ part: 'snippet', maxResults: 50, playlistId: id }, page ? { pageToken: page } : {}), 1);
    vids = vids.concat((d.items || []).filter(it => it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId && !/^(deleted|private) video$/i.test(it.snippet.title || '')));
    page = d.nextPageToken || ''; pages++;
  } while (page && pages < 4);
  const details = await smYtDetails(vids.map(v => v.snippet.resourceId.videoId));
  return { id, name: title || '', channel: channel || '', tracks: vids.map((v, i) => {
    const vid = v.snippet.resourceId.videoId, dt = details.get(vid) || {};
    return { id: vid, title: v.snippet.title, channel: dt.channel || v.snippet.videoOwnerChannelTitle || channel || '', durationMs: dt.durationMs || 0, blocked: !!dt.blocked, index: i + 1 };
  }) };
}
function smYoutubeByList(songs, lists, chosen) {                    // like smSpotifyByEdition, for playlists
  const byIdx = {}, all = lists.reduce((acc, p) => acc.concat(p.tracks), []);
  if (!chosen) return byIdx;
  const f = smAlbumFit(songs, chosen.tracks);
  songs.forEach(s => {
    const m = f.assign.get(s.idx); if (!m) return;
    const others = smTopCands(s, all, 50, 6).filter(c => c.id !== m.cand.id).slice(0, 3);
    byIdx[s.idx] = [Object.assign({}, m.cand, { score: m.score, band: m.band, reasons: m.reasons, parts: m.parts, source: 'playlist' }), ...others.map(c => Object.assign(c, { source: 'playlist' }))];
  });
  return byIdx;
}
async function smYoutubeForRelease(item, songs) {
  const viaAddon = ytUseAddon();
  if (!viaAddon && !loadYoutubeApiKey()) return { status: 'nokey' };
  const clean = item.title.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim();
  const relKey = smRelKey(item), cached = viaAddon ? null : ytCacheGet(relKey);          // the API route remembers an album it has looked up (the add-on keeps its own memory)
  const playlists = cached ? cached.v.playlists : [];
  if (!cached) {
    const found = viaAddon ? await smYtPlaylistSearchViaAddon(`${item.artist} ${clean}`) : await smYtApi('search', { part: 'snippet', type: 'playlist', maxResults: 5, q: `${item.artist} ${clean}` }, 100);
    const stripAlbum = (t) => String(t || '').replace(/^album\s*[-\u2013:]\s*/i, '');
    const lists = (found.items || []).filter(it => it.id && it.id.playlistId && it.snippet).map(it => ({
      id: it.id.playlistId, title: it.snippet.title, channel: it.snippet.channelTitle,
      rank: smSim(smCore(stripAlbum(it.snippet.title)), smCore(item.title)) + (/ - topic$/i.test(it.snippet.channelTitle || '') ? 0.1 : 0) + (smArtistMatch(item.artist, it.snippet.channelTitle) === 1 ? 0.05 : 0)
    })).filter(l => l.rank >= 0.6).sort((a, b) => b.rank - a.rank).slice(0, 2);
    for (const l of lists) playlists.push(await smYtReadPlaylist(l.id, l.title, l.channel));
    if (!viaAddon) ytCachePut(relKey, { playlists }, playlists.length ? YT_REL_TTL : YT_NONE_TTL);
  }
  playlists.forEach(pl => { const f = smAlbumFit(songs, pl.tracks); pl.fit = Math.round(f.fit); pl.matched = f.matched; });
  const best = smBestAlbum(songs, playlists);
  if (best && best.fit >= 55) {
    return { status: 'done', remembered: cached ? cached.t : 0, playlistTitle: best.album.name, playlistChannel: best.album.channel, playlistId: best.album.id, playlistUrl: 'https://www.youtube.com/playlist?list=' + best.album.id, fit: best.fit,
      byIdx: smYoutubeByList(songs, playlists, best.album), lists: playlists };
  }
  return { status: 'done', remembered: cached ? cached.t : 0, playlistTitle: '', byIdx: {}, none: true, lists: playlists };
}
async function smYoutubeSearchSongs(item, songs, idxs, onStep) {     // 100 quota units each: only ever on request
  const added = {};
  for (const idx of idxs) {
    const s = songs.find(x => x.idx === idx); if (!s) continue;
    let cands; const qk = 'song|' + ytCacheNorm(`${item.artist} ${s.title}`), hit = ytUseAddon() ? null : ytCacheGet(qk);
    if (hit) cands = hit.v.cands;                                    // looked up before: nothing to pay
    else if (ytUseAddon()) {                                              // a video search through the add-on: the results already carry their lengths, so no second call
      const r = await ytAddonRequest({ kind: 'search-video', q: `${item.artist} ${s.title}` });
      cands = r.slice(0, 8).map(v => ({ id: v.id, title: v.title, channel: v.channel, durationMs: v.durationMs || 0, blocked: false, index: 0 }));
    } else {
      const d = await smYtApi('search', { part: 'snippet', type: 'video', maxResults: 5, q: `${item.artist} ${s.title}` }, 100);
      const ids = (d.items || []).filter(it => it.id && it.id.videoId).map(it => it.id.videoId);
      const details = ids.length ? await smYtDetails(ids) : new Map();
      cands = ids.map(id => { const dt = details.get(id) || {}; return { id, title: dt.title || '', channel: dt.channel || '', durationMs: dt.durationMs || 0, blocked: !!dt.blocked, index: 0 }; });
      ytCachePut(qk, { cands }, cands.length ? YT_REL_TTL : YT_NONE_TTL);
    }
    const top = smTopCands(s, cands, 35, 4).map(c => Object.assign(c, { source: 'search' }));
    if (top.length) added[idx] = top;
    if (onStep) onStep(idx, top);
  }
  return added;
}

// ----- the dialog -----
function smHas(song, kind) { return kind === 'spotify' ? !!trackSpotifyUriFromLink(song.spotifyLink) : !!youtubeVideoIdFromUrl(song.youtubeLink); }
function smLinkId(song, kind) {
  if (kind === 'spotify') { const u = trackSpotifyUriFromLink(song.spotifyLink); return u && u.startsWith('spotify:track:') ? u.slice('spotify:track:'.length) : null; }
  return youtubeVideoIdFromUrl(song.youtubeLink) || null;
}
function smCandLink(kind, c) { return kind === 'spotify' ? `https://open.spotify.com/track/${c.id}` : `https://www.youtube.com/watch?v=${c.id}`; }
function smDefaultPicks(kind) {            // confident matches are ticked for songs that have no usable link of that kind yet; a link you already have is never replaced by default
  const st = smState, res = st[kind], picks = {};
  st.songs.forEach(s => { const best = res.byIdx && res.byIdx[s.idx] && res.byIdx[s.idx][0]; if (best && best.band === 'confident' && !smHas(s, kind)) picks[s.idx] = best.id; });
  return picks;
}
async function openSongMatcher(item, opts) {
  opts = opts || {};
  closeNowPlayingAddMenu();
  if (!opts.draft && !opts.songs) { bmOpen({ one: item, focusTrackNum: opts.focusTrackNum }); return; }          // a saved release: the Match songs window (see bmOpen)
  const mySeq = ++smLoadSeq;
  const songs = opts.songs || await smBuildSongs(item);     // a release being ADDED supplies its own songs (draft mode)
  if (mySeq !== smLoadSeq) return;
  if (!songs.length) { flashGlobalToast('This release has no tracklist yet \u2014 add one first.'); return; }
  smState = { item, songs, platform: opts.platform || 'spotify', open: null, saved: 0, touched: false, draft: !!opts.draft, onSave: opts.onSave || null,
    spotify: { status: 'idle', byIdx: {} }, youtube: { status: 'idle', byIdx: {} }, pick: { spotify: {}, youtube: {} }, custom: { spotify: {}, youtube: {} } };
  el.songMatchOverlay.hidden = false;
  smRender();
  if (!el.songMatchOverlay.dataset.bound) smBind();
  const pre = opts.prefetched || {};                          // answers already fetched for these songs (the Add form's own run) are reused, not asked for again
  if (pre.youtube && pre.youtube.status === 'done') { smState.youtube = pre.youtube; smState.pick.youtube = smDefaultPicks('youtube'); }
  if (pre.spotify && pre.spotify.status === 'done') { smState.spotify = pre.spotify; smState.pick.spotify = smDefaultPicks('spotify'); smRender(); }
  else smRunSpotify();                                           // free, so it starts at once; YouTube costs quota and waits for a click
  if (opts.focusTrackNum != null) setTimeout(() => { const row = el.songMatchList.querySelector(`.sm-row[data-track="${opts.focusTrackNum}"]`); if (row) row.scrollIntoView({ block: 'center' }); }, 60);
}
function closeSongMatcher(force) {
  if (!el.songMatchOverlay || el.songMatchOverlay.hidden) return;
  const n = smState && smState.touched ? smPickCount() : 0;   // the confident matches are ticked FOR you; only a selection you changed yourself is worth a warning
  if (!force && n > 0 && !confirm(`Discard ${n} unsaved match${n === 1 ? '' : 'es'}?`)) return;
  el.songMatchOverlay.hidden = true; smLoadSeq++; smState = null;
  if (typeof bmAfterMatcher === 'function') bmAfterMatcher();
  if (typeof tgAfterMatcher === 'function') tgAfterMatcher();
}
async function smRunSpotify() {
  const st = smState; if (!st) return;
  st.spotify = { status: 'loading', byIdx: {} }; smRender();
  try {
    const r = await smSpotifyForRelease(st.item, st.songs);
    if (smState !== st) return;
    st.spotify = r;
    if (r.status === 'done') st.pick.spotify = smDefaultPicks('spotify');
  } catch (e) { if (smState !== st) return; st.spotify = { status: 'error', error: String((e && e.message) || e), byIdx: {} }; }
  smRender();
}
async function smRunYoutube() {
  const st = smState; if (!st) return;
  st.youtube = { status: 'loading', byIdx: {} }; smRender();
  try {
    const r = await smYoutubeForRelease(st.item, st.songs);
    if (smState !== st) return;
    st.youtube = r;
    if (r.status === 'done') st.pick.youtube = smDefaultPicks('youtube');
  } catch (e) { if (smState !== st) return; st.youtube = { status: /^quota$/.test(e.message) ? 'quota' : 'error', error: ytAddonErrText(e), byIdx: {} }; }
  smRender();
}
async function smSearchYoutubeRemaining() {
  const st = smState; if (!st) return;
  const idxs = st.songs.filter(s => !(st.youtube.byIdx[s.idx] && st.youtube.byIdx[s.idx].length)).map(s => s.idx);
  if (!idxs.length) return;
  st.youtube.searching = { done: 0, total: idxs.length }; smRender();
  try {
    await smYoutubeSearchSongs(st.item, st.songs, idxs, (idx, top) => {
      if (smState !== st) return;
      if (top.length) { st.youtube.byIdx[idx] = top; if (top[0].band === 'confident' && !smHas(st.songs.find(s => s.idx === idx), 'youtube')) st.pick.youtube[idx] = top[0].id; }
      st.youtube.searching.done++; smRender();
    });
  } catch (e) { if (smState === st) st.youtube.searchError = /^quota$/.test(e.message) ? 'YouTube\u2019s daily quota is used up \u2014 it resets at midnight Pacific time.' : ytAddonErrText(e); }
  if (smState === st) { delete st.youtube.searching; smRender(); }
}
function smPickCounts() { const st = smState; return st ? { spotify: st.songs.filter(s => st.pick.spotify[s.idx]).length, youtube: st.songs.filter(s => st.pick.youtube[s.idx]).length } : { spotify: 0, youtube: 0 }; }
function smPickCount() { const c = smPickCounts(); return c.spotify + c.youtube; }
function smLen(ms) { return ms ? formatDuration(ms) : ''; }
function smBandCounts(kind) {
  const st = smState, c = { confident: 0, likely: 0, weak: 0, none: 0 };
  st.songs.forEach(s => { const b = st[kind].byIdx && st[kind].byIdx[s.idx] && st[kind].byIdx[s.idx][0]; c[b ? b.band : 'none']++; });
  return c;
}
function smStatusHtml(kind) {
  const st = smState, r = st[kind], c = r.status === 'done' ? smBandCounts(kind) : null;
  const label = kind === 'spotify' ? 'Spotify' : 'YouTube';
  if (r.status === 'loading' || r.status === 'idle') {
    if (kind === 'youtube' && r.status === 'idle') {
      if (ytUseAddon()) return ytAddonIdleHtml();
      if (!loadYoutubeApiKey()) return `<div class="sm-status"><span>Matching on YouTube needs a free API key.</span><button type="button" class="config-btn" data-sm="setup-youtube">Set up YouTube API\u2026</button></div>`;
      const known = smState && smState.item ? ytCacheGet(smRelKey(smState.item)) : null;
      return `<div class="sm-status"><span>This looks for the album\u2019s playlist on YouTube and matches every song in one go \u2014 ${known ? `this album was looked up on ${new Date(known.t).toLocaleDateString()} and is remembered, so it costs nothing now` : 'about 100 of YouTube\u2019s 10,000 daily quota units'} (${smYtQuotaUsed().toLocaleString()} used today by this app).</span><button type="button" class="config-btn" data-sm="run-youtube">Find on YouTube</button></div>`;
    }
    if (kind === 'youtube' && ytUseAddon() && r.status === 'loading') return ytAddonLoadingHtml();
    return `<div class="sm-status" role="status" aria-live="polite"><span>Looking on ${label}\u2026</span><div class="gi-mb-bar"><i></i></div></div>`;
  }
  if (r.status === 'nocreds') return `<div class="sm-status"><span>Matching on Spotify needs a free Client ID and Secret.</span><button type="button" class="config-btn" data-sm="setup-spotify">Set up Spotify API\u2026</button></div>`;
  if (r.status === 'quota') return `<div class="sm-status" role="status"><span>YouTube\u2019s daily quota is used up \u2014 it resets at midnight Pacific time.</span></div>`;
  if (r.status === 'error') return `<div class="sm-status" role="status"><span>${label} couldn\u2019t be read: ${escapeHtml(r.error)}.</span><button type="button" class="ai-link-btn" data-sm="retry-${kind}">Retry</button></div>`;
  // done
  const found = st.songs.length - c.none;
  let src;
  if (kind === 'spotify') src = r.albumName ? `Matched against the album <a href="${escapeHtml(r.albumUrl)}" target="_blank" rel="noopener">\u201c${escapeHtml(r.albumName)}\u201d \u2197</a>${r.searched ? ` and searched for ${r.searched} song${r.searched === 1 ? '' : 's'} it doesn\u2019t explain` : ''}.` : 'No album on Spotify fits this tracklist, so each song was searched for on its own.';
  else src = r.playlistTitle ? `Matched against the playlist <a href="${escapeHtml(r.playlistUrl)}" target="_blank" rel="noopener">\u201c${escapeHtml(r.playlistTitle)}\u201d \u2197</a> (${escapeHtml(r.playlistChannel || '')}).` : 'No album playlist on YouTube fits this tracklist.';
  const left = st.songs.filter(s => !(r.byIdx[s.idx] && r.byIdx[s.idx].length)).length;
  let extra = '';
  if (kind === 'youtube' && left && !r.searching) extra = `<button type="button" class="config-btn" data-sm="search-youtube">Search individually for ${left} song${left === 1 ? '' : 's'} (${ytUseAddon() ? `through the add-on: no quota, about ${Math.max(1, Math.round(left * 12 / 60))} min` : `about ${(left * 100).toLocaleString()} quota units; ${smYtQuotaUsed().toLocaleString()} used today`})</button>`;
  if (r.searching) extra = `<span role="status" aria-live="polite">Searching\u2026 ${r.searching.done} of ${r.searching.total}</span>`;
  if (r.searchError) extra += `<span class="sm-warn">${escapeHtml(r.searchError)}</span>`;
  return `<div class="sm-status"><span>${src} <b>${found}</b> of ${st.songs.length} songs matched: ${c.confident} confident, ${c.likely} likely, ${c.weak} weak.</span>${extra}</div>`;
}
function smRowHtml(s, kind) {
  const st = smState, r = st[kind], cands = (r.byIdx && r.byIdx[s.idx]) || [], best = cands[0];
  const has = smHas(s, kind), curId = smLinkId(s, kind), picked = st.pick[kind][s.idx], custom = st.custom[kind][s.idx];
  const chosen = picked ? (cands.find(c => c.id === picked) || (custom && custom.id === picked ? custom : null)) : null;
  const shown = chosen || best;
  let match;
  if (r.status !== 'done') match = '<span class="sm-dim">\u2026</span>';
  else if (!shown) match = '<span class="sm-dim">No match found.</span>';
  else {
    const sub = [Array.isArray(shown.artists) ? shown.artists.join(', ') : shown.channel, shown.album, smLen(shown.durationMs)].filter(Boolean).join(' \u00b7 ');
    match = `<button type="button" class="sm-play" data-sm="preview" data-id="${escapeHtml(shown.id)}" aria-label="Preview ${escapeHtml(shown.title)}">\u25b6</button>
      <span class="sm-cand"><span class="sm-cand-title">${escapeHtml(shown.title)}</span><span class="sm-cand-sub">${escapeHtml(sub)}</span></span>
      ${shown.score != null ? `<span class="sm-score sm-${shown.band}" title="${escapeHtml((shown.reasons || []).join(', '))}">${shown.score}</span>` : '<span class="sm-score sm-custom" title="A link you pasted">link</span>'}`;
  }
  const have = has ? (curId && shown && shown.id === curId ? '<span class="sm-have sm-same">linked \u2713 same</span>' : '<span class="sm-have">linked</span>') : '';
  const checkbox = shown && r.status === 'done' ? `<input type="checkbox" class="sm-pick" data-sm="pick" ${picked && shown.id === picked ? 'checked' : ''} aria-label="Use this match for ${escapeHtml(s.title)}"${curId && shown.id === curId ? ' disabled' : ''}>` : '<input type="checkbox" class="sm-pick" disabled aria-hidden="true">';
  const more = r.status === 'done' ? `<button type="button" class="ai-link-btn sm-more-btn" data-sm="more" aria-expanded="${st.open === s.idx}">${cands.length > 1 ? 'Others' : 'Other\u2026'}</button>` : '';
  let moreBlock = '';
  if (st.open === s.idx && r.status === 'done') {
    moreBlock = `<div class="sm-others">${cands.map(c => `<label class="sm-alt"><input type="radio" name="sm-alt-${s.idx}" data-sm="alt" data-id="${escapeHtml(c.id)}"${picked === c.id ? ' checked' : ''}><span class="sm-cand"><span class="sm-cand-title">${escapeHtml(c.title)}</span><span class="sm-cand-sub">${escapeHtml([Array.isArray(c.artists) ? c.artists.join(', ') : c.channel, c.album, smLen(c.durationMs)].filter(Boolean).join(' \u00b7 '))}</span></span><span class="sm-score sm-${c.band}" title="${escapeHtml((c.reasons || []).join(', '))}">${c.score}</span><button type="button" class="sm-play" data-sm="preview" data-id="${escapeHtml(c.id)}" aria-label="Preview ${escapeHtml(c.title)}">\u25b6</button></label>`).join('') || '<p class="sm-dim">No candidates.</p>'}
      <div class="sm-paste"><input type="text" class="sm-paste-input" data-sm="paste" placeholder="Or paste a ${kind === 'spotify' ? 'Spotify track' : 'YouTube'} link…" aria-label="Paste a link for ${escapeHtml(s.title)}"><button type="button" class="ai-link-btn" data-sm="paste-use">Use</button></div></div>`;
  }
  return `<div class="sm-row${picked ? ' picked' : ''}" data-idx="${s.idx}" data-track="${s.trackNum}"><div class="sm-check">${checkbox}</div>
    <div class="sm-song"><span class="sm-num">${s.trackNum}</span><span class="sm-title">${escapeHtml(s.title)}</span><span class="sm-len">${escapeHtml(smLen(s.durationMs))}</span>${have}</div>
    <div class="sm-match">${match}${more}</div>${moreBlock}</div>`;
}
function smRender() {
  const st = smState; if (!st || el.songMatchOverlay.hidden) return;
  el.songMatchTitle.textContent = 'Match songs \u2014 ' + st.item.title;
  el.songMatchSub.textContent = st.item.artist + ' \u00b7 ' + st.songs.length + ' song' + (st.songs.length === 1 ? '' : 's');
  el.songMatchTabs.querySelectorAll('[data-sm-platform]').forEach(b => { const on = b.dataset.smPlatform === st.platform; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  const k = st.platform;
  el.songMatchStatus.innerHTML = smStatusHtml(k);
  const scroll = el.songMatchList.scrollTop;
  el.songMatchList.innerHTML = st.songs.map(s => smRowHtml(s, k)).join('');
  el.songMatchList.scrollTop = scroll;
  const n = smPickCount(), pc = smPickCounts();
  // Save writes the ticks of BOTH tabs at once, so when both have some the button says so (you may only have been looking at one)
  el.songMatchSave.textContent = !n ? 'Save' : (pc.spotify && pc.youtube) ? `Save ${pc.spotify} Spotify + ${pc.youtube} YouTube links` : `Save ${n} link${n === 1 ? '' : 's'}`;
  el.songMatchSave.disabled = !n;
  const conf = st.songs.filter(s => st[k].byIdx && st[k].byIdx[s.idx] && st[k].byIdx[s.idx][0] && st[k].byIdx[s.idx][0].band === 'confident' && !smHas(s, k) && st.pick[k][s.idx] !== st[k].byIdx[s.idx][0].id).length;
  el.songMatchSelectConf.hidden = !conf; el.songMatchSelectConf.textContent = `Tick ${conf} more confident match${conf === 1 ? '' : 'es'}`;
  el.songMatchSaved.textContent = st.saved ? `Saved ${st.saved} link${st.saved === 1 ? '' : 's'} so far.` : '';
}
async function saveSongLinks(item, updatesByNum) {       // one update for any number of songs (updateTrackData would post once per song)
  item.trackData = item.trackData || {};
  Object.entries(updatesByNum).forEach(([num, upd]) => { item.trackData[num] = Object.assign(item.trackData[num] || {}, upd); });
  refreshLinkFlagsFor(item);
  try { await postUpdate({ row: item.row, trackData: JSON.stringify(item.trackData) }); }
  catch (err) { flashGlobalToast('Couldn\u2019t save the links \u2014 try again.'); return false; }
  if (currentTracklistTracks.length) mergeTrackLinkOverrides(item, currentTracklistTracks);
  const cached = state.trackCache[artKey(item)];
  if (cached && cached !== currentTracklistTracks) mergeTrackLinkOverrides(item, cached);
  if (activeItem === item) renderTracklistBody(item, currentTracklistTracks);
  return true;
}
async function smSave() {
  const st = smState; if (!st) return;
  const updates = {};
  ['spotify', 'youtube'].forEach(kind => st.songs.forEach(s => {
    const id = st.pick[kind][s.idx]; if (!id) return;
    const c = ((st[kind].byIdx[s.idx] || []).find(x => x.id === id)) || (st.custom[kind][s.idx] && st.custom[kind][s.idx].id === id ? st.custom[kind][s.idx] : null);
    if (!c) return;
    (updates[s.trackNum] = updates[s.trackNum] || {})[kind === 'spotify' ? 'spotifyLink' : 'youtubeLink'] = c.link || smCandLink(kind, c);
  }));
  const n = Object.values(updates).reduce((a, u) => a + Object.keys(u).length, 0);
  if (!n) return;
  el.songMatchSave.disabled = true;
  const ok = st.onSave ? await st.onSave(updates) : await saveSongLinks(st.item, updates);      // a draft writes into the Add form's boxes, not to the backend
  if (!ok || smState !== st) { if (smState === st) smRender(); return; }
  st.songs.forEach(s => { const u = updates[s.trackNum]; if (u) { if (u.spotifyLink) s.spotifyLink = u.spotifyLink; if (u.youtubeLink) s.youtubeLink = u.youtubeLink; } });
  st.pick = { spotify: {}, youtube: {} }; st.saved += n; st.touched = false;
  flashGlobalToast(`Saved ${n} link${n === 1 ? '' : 's'}.`);
  smRender();
}
function smBind() {
  const ov = el.songMatchOverlay; ov.dataset.bound = '1';
  el.songMatchClose.addEventListener('click', () => closeSongMatcher());
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeSongMatcher(); });
  el.songMatchSave.addEventListener('click', smSave);
  el.songMatchSelectConf.addEventListener('click', () => {
    const st = smState, k = st.platform;
    st.touched = true;
    st.songs.forEach(s => { const b = st[k].byIdx && st[k].byIdx[s.idx] && st[k].byIdx[s.idx][0]; if (b && b.band === 'confident' && !smHas(s, k)) st.pick[k][s.idx] = b.id; });
    smRender();
  });
  el.songMatchTabs.addEventListener('click', (e) => { const b = e.target.closest('[data-sm-platform]'); if (b && smState) { smState.platform = b.dataset.smPlatform; smState.open = null; smRender(); } });
  ov.addEventListener('click', (e) => {
    const st = smState; if (!st) return;
    const t = e.target.closest('[data-sm]'); if (!t) return;
    const a = t.dataset.sm, k = st.platform, row = t.closest('.sm-row'), idx = row ? Number(row.dataset.idx) : null;
    if (a === 'run-youtube' || a === 'retry-youtube') smRunYoutube();
    else if (a === 'retry-spotify') smRunSpotify();
    else if (a === 'search-youtube') smSearchYoutubeRemaining();
    else if (a === 'yt-continue') ytAddonContinue();
    else if (a === 'yt-cancel') ytAddonCancel();
    else if (a === 'setup-spotify') { closeSongMatcher(); el.menuSpotifyApi.click(); }
    else if (a === 'setup-youtube') { closeSongMatcher(); el.menuYoutubeApi.click(); }
    else if (a === 'more') { st.open = st.open === idx ? null : idx; smRender(); }
    else if (a === 'preview') {
      const id = t.dataset.id;
      if (k === 'spotify') showMiniPlayer(`spotify:track:${id}`, beginPlayIntent());
      else openYoutubePlayer(`https://www.youtube.com/watch?v=${id}`, (st.songs[idx] || {}).title || '', [], st.draft ? undefined : st.item);   // [] = just this video (not some other open album's YouTube queue)
    }
    else if (a === 'paste-use') {
      const input = row.querySelector('.sm-paste-input'), v = input.value.trim();
      const ok = k === 'spotify' ? (() => { const u = trackSpotifyUriFromLink(v); return u && u.startsWith('spotify:track:') ? u.slice('spotify:track:'.length) : null; })() : youtubeVideoIdFromUrl(v);
      if (!ok) { flashGlobalToast(k === 'spotify' ? 'That isn\u2019t a Spotify track link.' : 'That isn\u2019t a YouTube video link.'); return; }
      st.touched = true;
      st.custom[k][idx] = { id: ok, title: v, link: k === 'spotify' ? `https://open.spotify.com/track/${ok}` : `https://www.youtube.com/watch?v=${ok}`, source: 'pasted' };
      st.pick[k][idx] = ok; smRender();
    }
  });
  ov.addEventListener('change', (e) => {
    const st = smState; if (!st) return;
    const t = e.target.closest('[data-sm]'); if (!t) return;
    const k = st.platform, row = t.closest('.sm-row'), idx = Number(row.dataset.idx);
    st.touched = true;
    if (t.dataset.sm === 'pick') {
      const best = (st[k].byIdx[idx] || [])[0], cur = st.pick[k][idx];
      if (t.checked) st.pick[k][idx] = cur || (best && best.id); else delete st.pick[k][idx];
      smRender();
    } else if (t.dataset.sm === 'alt') { st.pick[k][idx] = t.dataset.id; smRender(); }
  });
}

/* ---------- Matching songs while a release is being added ----------
   The Add form's tracklist builder has a row per song with Spotify and YouTube link boxes, but nothing filled them in
   except one-song-at-a-time buttons. Now, as soon as songs are in the form (you accept a Spotify/MusicBrainz tracklist,
   the form opens with one, or — as a last pass — when you press Add to crate), the Match songs engine runs on them:
   confident matches are written into the empty link boxes with a score badge, likely-but-unsure ones get an amber "?"
   to review, and a status line says what happened. Links you typed are never overwritten, nothing is filled into a row
   whose title you changed meanwhile, and a late answer for a release you've moved on from is dropped. The same review
   dialog as for saved releases opens on the unsaved one ("draft" mode: its Save writes into these boxes, not to the
   backend). Spotify is free and automatic; YouTube costs API quota, so it runs only when the setting says so. */
let addMatchSeq = 0;           // bumped whenever the form moves on to another release (or closes) so a late result can't fill the wrong rows
let addMatchRun = null;        // the run in flight, so Save can wait for it instead of starting a second
let addMatchLast = null;       // the last finished run's songs and results, reused by the review dialog
let addMatchLastSig = '';      // what that run was for, so Save doesn't repeat it when nothing has changed

function addFormSongs() {
  const out = [];
  [...el.addTracksRows.querySelectorAll('.tracklist-builder-row')].forEach(rowEl => {
    const title = rowEl.querySelector('.tracklist-builder-title').value.trim();
    if (!title) return;
    const k = out.length;
    out.push({ idx: k, trackNum: k + 1, trackNumber: k + 1, title, artist: el.addArtist.value.trim(), album: el.addTitle.value.trim(),
      durationMs: Number(rowEl.dataset.durationMs) || 0,
      spotifyLink: rowEl.querySelector('.tracklist-builder-sp').value.trim(), youtubeLink: rowEl.querySelector('.tracklist-builder-yt').value.trim(), rowEl });
  });
  return out;
}
function addFormDraftItem() { return { row: 'draft', artist: el.addArtist.value.trim(), title: el.addTitle.value.trim(), link: el.addLink.value.trim(), cover: el.addCover.value.trim(), trackData: {}, manualTracks: [] }; }
function addFormSignature() { return JSON.stringify([el.addArtist.value.trim(), el.addTitle.value.trim(), addFormSongs().map(s => s.title)]); }
function addMatchStatus(html, busy) {
  if (!el.addMatchStatus) return;
  el.addMatchStatus.hidden = !html;
  el.addMatchStatus.innerHTML = html ? `<span>${html}</span>${busy ? '<div class="gi-mb-bar"><i></i></div>' : ''}` : '';
}
function addFormSetLink(rowEl, kind, link, badgeText, band, tip) {
  const input = rowEl.querySelector(kind === 'spotify' ? '.tracklist-builder-sp' : '.tracklist-builder-yt');
  input.value = link; input.classList.add('tb-matched');
  const group = input.closest('.tracklist-builder-link-group');
  let badge = group.querySelector('.tb-score');
  if (!badge) { badge = document.createElement('span'); group.insertBefore(badge, input.nextSibling); }
  badge.className = 'tb-score sm-' + band; badge.textContent = badgeText; badge.title = tip; badge.removeAttribute('data-suggest');
  tlRefreshRowLinks(rowEl);
}
function addFormApply(result, kind) {
  const r = result[kind];
  if (!r || r.status !== 'done') return { filled: 0, suggested: 0 };
  let filled = 0, suggested = 0;
  result.songs.forEach(s => {
    const rowEl = s.rowEl;
    if (!rowEl.isConnected || rowEl.querySelector('.tracklist-builder-title').value.trim() !== s.title) return;     // the row's title changed since this run began
    const input = rowEl.querySelector(kind === 'spotify' ? '.tracklist-builder-sp' : '.tracklist-builder-yt');
    if (input.value.trim()) return;                                                                                   // never overwrite a link that is there
    const best = (r.byIdx[s.idx] || [])[0];
    if (!best) return;
    const tip = `Matched automatically (${best.score}): ${(best.reasons || []).join(', ')}`;
    if (best.band === 'confident') { addFormSetLink(rowEl, kind, best.link || smCandLink(kind, best), String(best.score), 'confident', tip); filled++; }
    else if (best.band === 'likely') {
      const group = input.closest('.tracklist-builder-link-group');
      let badge = group.querySelector('.tb-score');
      if (!badge) { badge = document.createElement('span'); group.insertBefore(badge, input.nextSibling); }
      badge.className = 'tb-score sm-likely'; badge.textContent = '?'; badge.setAttribute('data-suggest', String(s.trackNum)); tlExpandLinks(rowEl, true);
      badge.title = `A likely match was found (${best.score}) but it isn't certain \u2014 click to review it.`; suggested++;
    }
  });
  return { filled, suggested };
}
function addMatchSummary(result) {
  const bits = [];
  const part = (kind, label) => {
    const r = result[kind]; if (!r) return;
    if (r.status === 'done') {
      const f = result.counts[kind];
      bits.push(`${f.filled} of ${result.songs.length} songs linked on ${label}` + (f.suggested ? ` (${f.suggested} more to review)` : ''));
    } else if (r.status === 'nocreds' || r.status === 'nokey') bits.push(`${label} isn\u2019t set up`);
    else if (r.error) bits.push(`${label} couldn\u2019t be read: ${escapeHtml(r.error)}`);
  };
  part('spotify', 'Spotify'); part('youtube', 'YouTube');
  result.errors.forEach(e => bits.push(escapeHtml(e)));
  return (bits.join(' \u00b7 ') || 'No songs to match.') + ' <button type="button" class="ai-link-btn" data-am="review">Review\u2026</button>';
}
async function autoMatchAddForm(opts) {
  opts = opts || {};
  if (addMatchRun) return addMatchRun;
  const seq = addMatchSeq;
  addMatchRun = (async () => {
    const songs = addFormSongs();
    if (!songs.length) { addMatchStatus(''); return null; }
    const creds = loadSpotifyCreds(), spotifyOn = !!(creds.clientId && creds.clientSecret);
    const ytOn = (opts.youtube !== undefined ? opts.youtube : state.autoMatchYoutube) && !!loadYoutubeApiKey();
    const result = { songs, spotify: null, youtube: null, counts: { spotify: { filled: 0, suggested: 0 }, youtube: { filled: 0, suggested: 0 } }, errors: [] };
    if (!spotifyOn && !ytOn) { addMatchStatus('Songs weren\u2019t matched: Spotify isn\u2019t set up (\u2699 \u203a Spotify API\u2026).'); addMatchLastSig = addFormSignature(); return result; }
    const draft = addFormDraftItem();
    if (spotifyOn) {
      addMatchStatus('Matching songs on Spotify\u2026', true);
      try { result.spotify = await smSpotifyForRelease(draft, songs); } catch (e) { result.spotify = { status: 'error', error: String((e && e.message) || e) }; }
      if (seq !== addMatchSeq) return null;
      result.counts.spotify = addFormApply(result, 'spotify');
    }
    if (ytOn) {
      addMatchStatus('Matching songs on YouTube\u2026', true);
      try { result.youtube = await smYoutubeForRelease(draft, songs); } catch (e) { result.youtube = { status: /^quota$/.test(e.message) ? 'quota' : 'error', error: /^quota$/.test(e.message) ? 'the daily quota is used up' : String((e && e.message) || e) }; }
      if (seq !== addMatchSeq) return null;
      result.counts.youtube = addFormApply(result, 'youtube');
    }
    addMatchLast = result; addMatchLastSig = addFormSignature();
    addMatchStatus(addMatchSummary(result));
    return result;
  })().finally(() => { addMatchRun = null; });
  return addMatchRun;
}
function addFormApplyDialogPicks(updates) {      // the review dialog's Save, for an unsaved release: into the boxes, nowhere else
  const st = smState;
  Object.entries(updates).forEach(([num, upd]) => {
    const s = st && st.songs.find(x => String(x.trackNum) === num);
    if (!s || !s.rowEl.isConnected) return;
    if (upd.spotifyLink) addFormSetLink(s.rowEl, 'spotify', upd.spotifyLink, 'chosen', 'custom', 'Chosen in Match songs');
    if (upd.youtubeLink) addFormSetLink(s.rowEl, 'youtube', upd.youtubeLink, 'chosen', 'custom', 'Chosen in Match songs');
  });
  return true;
}
function addFormReview(focusTrackNum) {
  const songs = addFormSongs();
  if (!songs.length) { flashToast(el.addToast, 'Add some songs to the tracklist first'); return; }
  const last = addMatchLast && addMatchLast.songs.length === songs.length && addMatchLast.songs.every((s, i) => s.title === songs[i].title) ? addMatchLast : null;   // reuse the answers when the list hasn't changed
  openSongMatcher(addFormDraftItem(), { songs, draft: true, onSave: addFormApplyDialogPicks, focusTrackNum, prefetched: last && { spotify: last.spotify, youtube: last.youtube } });
}
function applyAutoMatchSettings() {
  [['menuAutoMatchAdd', 'autoMatchOnAdd'], ['menuAutoMatchYt', 'autoMatchYoutube']].forEach(([id, key]) => { if (el[id]) el[id].setAttribute('aria-pressed', state[key] ? 'true' : 'false'); });
}
function initAddMatch() {
  applyAutoMatchSettings();
  [['menuAutoMatchAdd', 'autoMatchOnAdd', 'Matching songs when adding a release'], ['menuAutoMatchYt', 'autoMatchYoutube', 'Matching on YouTube when adding']].forEach(([id, key, label]) => {
    if (!el[id]) return;
    el[id].addEventListener('click', () => { state[key] = !state[key]; savePrefs(); applyAutoMatchSettings(); el.layoutMenu.hidden = true; flashGlobalToast(`${label}: ${state[key] ? 'on' : 'off'}.`); });
  });
  if (!el.addTracksMatchBtn) return;
  el.addTracksMatchBtn.addEventListener('click', () => addFormReview());
  el.addMatchStatus.addEventListener('click', (e) => { if (e.target.closest('[data-am="review"]')) addFormReview(); });
  el.addTracksRows.addEventListener('click', (e) => { const b = e.target.closest('.tb-score[data-suggest]'); if (b) addFormReview(Number(b.dataset.suggest)); });
  el.addTracksRows.addEventListener('input', (e) => {        // typing over a matched link makes it yours again: the match markers go
    const input = e.target.closest('.tracklist-builder-sp, .tracklist-builder-yt');
    if (!input || !input.classList.contains('tb-matched')) return;
    input.classList.remove('tb-matched');
    const badge = input.closest('.tracklist-builder-link-group').querySelector('.tb-score'); if (badge) badge.remove();
  });
}
