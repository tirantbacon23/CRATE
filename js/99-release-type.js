// (1.135.189) A release's type from each source, as CRATE's own types (Album, EP, Single, Compilation, Live, Mixtape).
// MusicBrainz: its main type (Album, EP, Single, Broadcast, Other) and its extra ones (Live, Compilation, Mixtape/Street, DJ-mix…), which used
// to be left out, so a live album or a compilation came in as an Album. Discogs: its format notes (Single, EP, Compilation, Mixtape), and
// "Live" in its title notes. Spotify: album / single (4 songs or more: an EP) / compilation. iTunes: " - EP" and " - Single" in the name.
// Rate Your Music: the type in the page's address (/release/album|ep|single|comp|mixtape|djmix/…).
function mbReleaseType(rg, fallback) {
  rg = rg || {}; const p = String(rg['primary-type'] || ''), sec = (rg['secondary-types'] || []).map(String);
  if (sec.includes('Live')) return 'Live';
  if (sec.includes('Compilation')) return 'Compilation';
  if (sec.some(s => /mixtape|dj-mix/i.test(s))) return 'Mixtape';
  if (p === 'EP') return 'EP'; if (p === 'Single') return 'Single'; if (p === 'Album' || p === 'Broadcast' || p === 'Other') return 'Album';
  return fallback || 'Album';
}
function dgReleaseType(formats, title) {          // formats: Discogs format strings or [{ name, descriptions }]
  const fm = [].concat(...(formats || []).map(f => typeof f === 'string' ? [f] : [f && f.name].concat((f && f.descriptions) || [], f && f.text ? [f.text] : []))).filter(Boolean).map(String);
  if (fm.some(f => /mixtape/i.test(f))) return 'Mixtape';
  if (fm.some(f => /compilation/i.test(f))) return 'Compilation';
  if (fm.some(f => /^EP$/i.test(f))) return 'EP';
  if (fm.some(f => /^single$/i.test(f) || /^(7"|maxi-single)$/i.test(f))) return 'Single';
  if (fm.some(f => /^live$/i.test(f)) || /\blive (at|in|from)\b/i.test(String(title || ''))) return 'Live';
  return 'Album';
}
function spReleaseType(a) { const t = String((a && a.album_type) || ''), n = Number(a && a.total_tracks) || 0; return t === 'compilation' ? 'Compilation' : t === 'single' ? (n >= 4 ? 'EP' : 'Single') : 'Album'; }
function itReleaseType(name) { return /\s-\s*EP$/i.test(String(name || '')) ? 'EP' : /\s-\s*Single$/i.test(String(name || '')) ? 'Single' : 'Album'; }
function rymUrlType(url) { const m = /rateyourmusic\.com\/release\/([a-z]+)\//i.exec(String(url || '')); return m ? ({ album: 'Album', ep: 'EP', single: 'Single', comp: 'Compilation', mixtape: 'Mixtape', djmix: 'Mixtape' }[m[1].toLowerCase()] || '') : ''; }
