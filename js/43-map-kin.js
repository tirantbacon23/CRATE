// CRATE — the Map, with what Crate Galaxy knows: which records are kin.
// One part of the page's script, split by feature (see 01-core.js). Builds on the Map (23-timeline-map.js), and on Galaxy's way of telling how
// alike two releases are (gxBuild / gxPath in 36-galaxy.js: genres and their parents, descriptors, scene, label, artist, decade, rare things
// counting for more) — not on how Galaxy looks.
//
// THE WEB: faint arcs between places whose records are alike, thicker the more they share, coloured by why: the same artist, the same people
// (a band and its members, from the artists' Members), the same label, the same scene, or only the sound (genres and descriptors).
// A PLACE: pins are sized by how many releases are there. Click one for its card: its records, what they mostly are, and the places its kin
// are at (the web lights up just for it). A RELEASE in the card: lines to its closest relatives anywhere in the world; its artist's trail,
// place to place in the order they were made; "Journey from here", then "…to here" on another: the smoothest chain of alike records from one
// to the other, drawn across the map and playable.
// WHERE: "Recorded at" (Location), "Where from" (Region) or both. TIME: ▶ beside the time scrubber plays through the years.

const MK_KEY = 'crate_map_kin_v1';
const MK_REASONS = [['sound', 'Sound', '#8fa6c8'], ['artist', 'Same artist', '#9a90ff'], ['people', 'Same people', '#ff8a5c'], ['label', 'Same label', '#3ccf9a'], ['scene', 'Same scene', '#ff6fa8']];
const MK_COLOR = Object.fromEntries(MK_REASONS.map(r => [r[0], r[2]]));
const mk = { groups: [], ll: new Map(), items: [], placeOf: [], graph: null, key: '', webLayer: null, focusLayer: null, sel: null, from: null, playing: 0 };
function mkPrefs() { let p = {}; try { p = JSON.parse(localStorage.getItem(MK_KEY) || '{}') || {}; } catch (e) { p = {}; } return Object.assign({ where: 'rec', web: true, off: [] }, p); }
function mkSave(patch) { const p = Object.assign(mkPrefs(), patch); try { localStorage.setItem(MK_KEY, JSON.stringify(p)); } catch (e) { /* this visit only */ } return p; }
const mkFold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---- where each release is ----
function mkPlacesOf(item) {
  const where = mkPrefs().where, out = [];
  const rec = String(item.location || '').trim(), from = String(item.region || '').split(/\s*[;\/]\s*/)[0].trim();
  if ((where === 'rec' || where === 'both') && rec) out.push(rec);
  if ((where === 'from' || where === 'both') && from && from.toLowerCase() !== rec.toLowerCase()) out.push(from);
  return out;
}
buildMapGroups = function () {                                          // (replaces the Map's own: the same, with Where from as well)
  const groups = new Map();
  state.raw.forEach(item => {
    if (!mapCategoryFilter(item)) return;
    if (state.mapTimeEnabled) { const idx = itemReleasePeriodIndex(item); if (idx == null || idx > state.mapTimeIndex) return; }
    mkPlacesOf(item).forEach(loc => { const key = loc.toLowerCase(); if (!groups.has(key)) groups.set(key, { label: loc, key, items: [] }); groups.get(key).items.push(item); });
  });
  const sortFn = mapSortComparator();
  groups.forEach(g => g.items.sort(sortFn));
  return [...groups.values()];
};

// ---- colour by genre family (Galaxy's families) ----
const mkSymOrig = mapGroupSymbologyValue;
mapGroupSymbologyValue = function (group) {
  if (state.mapColorBy !== 'family') return mkSymOrig(group);
  const fams = [...new Set(group.items.map(it => gxFamily(gxSplit(it.genre)[0] || gxSplit(it.genre2)[0] || '', state.genreTaxonomy) || 'Unfiled'))];
  if (fams.length === 1) return fams[0];
  const count = new Map(); group.items.forEach(it => { const f = gxFamily(gxSplit(it.genre)[0] || '', state.genreTaxonomy) || 'Unfiled'; count.set(f, (count.get(f) || 0) + 1); });
  const top = [...count].sort((a, b) => b[1] - a[1]);
  return top[0][1] >= group.items.length * 0.6 ? top[0][0] : null;          // mostly one family: that one; else mixed
};

// ---- pins: sized by how many are there; a click opens the place's card ----
addMapMarker = function (group, resolved) {
  const color = mapColorForGroup(group) || '#c9a24a', n = group.items.length;
  const r = Math.round(5 + Math.min(14, Math.sqrt(n) * 2.6));
  const m = L.circleMarker([resolved.lat, resolved.lon], { radius: r, color: '#0b0e14', weight: 1.5, fillColor: color, fillOpacity: 0.88 }).addTo(leafletMarkerLayer);
  m.bindTooltip(`${escapeHtml(group.label)} · ${n} release${n === 1 ? '' : 's'}`, { direction: 'top', offset: [0, -r] });
  m.on('click', () => mkOpenPlace(group.key));
  group.ll = [resolved.lat, resolved.lon]; group.marker = m;
  mk.ll.set(group.key, group.ll);
};

// ---- kinship: Galaxy's similarity, between the releases on the map ----
function mkBuild() {
  const seen = new Set(), items = [], placeOf = [];
  mk.groups.forEach(g => { if (!g.ll) return; g.items.forEach(it => { if (seen.has(it)) return; seen.add(it); items.push(it); placeOf.push(g.key); }); });
  const key = items.map(it => it.row).join(',') + '|' + mkPrefs().where;
  if (key !== mk.key) { mk.key = key; mk.items = items; mk.placeOf = placeOf; mk.graph = items.length > 1 ? gxBuild(items, state.genreTaxonomy, 8) : null; }
  mk.index = new Map(mk.items.map((it, i) => [it, i]));
}
function mkPeople(artist) {                                             // the artist, its members, and the bands it is in, as folded names
  const s = new Set([mkFold(artistCanon(artist))]);
  try { (artistDetailsOf(artist).members || []).forEach(m => s.add(mkFold(artistCanon(m.name)))); artistMemberOf(artist).forEach(b => s.add(mkFold(artistCanon(b.band)))); } catch (e) { /* no details */ }
  return s;
}
const mkSplit = (v) => String(v || '').split(/\s*[,;\/]\s*/).map(mkFold).filter(Boolean);
function mkWhy(a, b) {                                                  // the strongest reason two releases are kin, and the thing they share
  if (typeof sameArtist === 'function' ? sameArtist(a.artist, b.artist) : mkFold(a.artist) === mkFold(b.artist)) return { why: 'artist', what: a.artist };
  const pa = mkPeople(a.artist), pb = mkPeople(b.artist), shared = [...pa].find(x => pb.has(x));
  if (shared) return { why: 'people', what: shared };
  const la = mkSplit(a.label), lb = new Set(mkSplit(b.label)), l = la.find(x => lb.has(x)); if (l) return { why: 'label', what: String(a.label || '').split(/\s*[,;\/]\s*/).find(x => mkFold(x) === l) || l };
  const sa = mkSplit(`${a.scene || ''};${a.movement || ''}`), sb = new Set(mkSplit(`${b.scene || ''};${b.movement || ''}`)), sc = sa.find(x => sb.has(x)); if (sc) return { why: 'scene', what: sc };
  const ga = gxSplit(a.genre), gb = new Set(gxSplit(b.genre).concat(gxSplit(b.genre2)).map(mkFold)), g = ga.find(x => gb.has(mkFold(x)));
  return { why: 'sound', what: g || '' };
}
// Place-to-place: every pair of kin releases at two different places adds to that pair of places.
function mkPlaceLinks(onlyPlace) {
  const links = new Map(), off = new Set(mkPrefs().off);
  if (!mk.graph) return [];
  mk.graph.nbr.forEach((list, i) => list.forEach(({ j, s }) => {
    if (j <= i && !onlyPlace) return;
    const pi = mk.placeOf[i], pj = mk.placeOf[j]; if (pi === pj) return;
    if (onlyPlace && pi !== onlyPlace) return;
    const w = mkWhy(mk.items[i], mk.items[j]); if (off.has(w.why)) return;
    const k = pi < pj ? pi + '\u0001' + pj : pj + '\u0001' + pi;
    const e = links.get(k) || { a: pi, b: pj, w: 0, n: 0, why: {}, pairs: [] };
    e.w += s; e.n++; e.why[w.why] = (e.why[w.why] || 0) + s; if (e.pairs.length < 6) e.pairs.push({ i, j, s, w });
    links.set(k, e);
  }));
  return [...links.values()].map(e => Object.assign(e, { top: Object.entries(e.why).sort((x, y) => y[1] - x[1])[0][0] })).sort((x, y) => y.w - x.w);
}
function mkArc(a, b, bend) {                                             // a gentle curve between two points (the short way round the world)
  let [y1, x1] = a, [y2, x2] = b; if (x2 - x1 > 180) x2 -= 360; else if (x1 - x2 > 180) x2 += 360;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, k = bend == null ? 0.18 : bend;
  const cx = mx - dy * k, cy = my + dx * k, pts = [];
  for (let t = 0; t <= 1.0001; t += 1 / 24) { const u = 1 - t; pts.push([u * u * y1 + 2 * u * t * cy + t * t * y2, u * u * x1 + 2 * u * t * cx + t * t * x2]); }
  return pts;
}
function mkDrawWeb() {
  if (!leafletMapInstance) return;
  if (mk.webLayer) mk.webLayer.clearLayers(); else mk.webLayer = L.layerGroup().addTo(leafletMapInstance);
  if (!mkPrefs().web || mk.sel) return;
  const links = mkPlaceLinks().slice(0, 90); if (!links.length) return;
  const max = links[0].w;
  links.forEach(e => {
    const A = mk.ll.get(e.a), B = mk.ll.get(e.b); if (!A || !B) return;
    const t = e.w / max;
    L.polyline(mkArc(A, B), { color: MK_COLOR[e.top], weight: 0.8 + t * 3.2, opacity: 0.18 + t * 0.5, interactive: false }).addTo(mk.webLayer);
  });
}
function mkClearFocus() { if (mk.focusLayer) mk.focusLayer.clearLayers(); else if (leafletMapInstance) mk.focusLayer = L.layerGroup().addTo(leafletMapInstance); }

// ---- the card ----
function mkCardEl() {
  let c = document.getElementById('mapKinCard');
  if (!c) {
    c = document.createElement('div'); c.id = 'mapKinCard'; c.className = 'mk-card'; c.hidden = true;
    const wrap = el.mapContainer.parentNode; wrap.appendChild(c);
    c.addEventListener('click', mkCardClick);
    ['mousedown', 'wheel', 'dblclick', 'touchstart'].forEach(t => c.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
  }
  return c;
}
function mkCover(it) { return it.cover || (state.artCache[artKey(it)] || {}).art || placeholderArt(it); }
function mkRow(it, extra) {
  return `<button type="button" class="mk-row" data-mk-rel="${escapeHtml(String(it.row))}"><img src="${escapeHtml(mkCover(it))}" alt=""><span class="mk-row-t"><b>${escapeHtml(it.title)}</b><span>${escapeHtml(it.artist)}${extra ? ' · ' + escapeHtml(extra) : ''}</span></span></button>`;
}
function mkItemByRow(r) { return mk.items.find(x => String(x.row) === String(r)) || (state.raw || []).find(x => String(x.row) === String(r)); }
function mkGroup(key) { return mk.groups.find(g => g.key === key); }
function mkOpenPlace(key) {
  const g = mkGroup(key); if (!g) return;
  mk.sel = { place: key }; mkDrawWeb(); mkClearFocus();
  const links = mkPlaceLinks(key).slice(0, 12), max = links[0] ? links[0].w : 1;
  links.forEach(e => { const B = mk.ll.get(e.b); if (!B) return; L.polyline(mkArc(g.ll, B), { color: MK_COLOR[e.top], weight: 1.4 + 3.4 * e.w / max, opacity: 0.85 }).addTo(mk.focusLayer); });
  const ys = g.items.map(gxYear).filter(Boolean).sort((a, b) => a - b), fams = new Map();
  g.items.forEach(it => gxSplit(it.genre).slice(0, 1).forEach(x => fams.set(x, (fams.get(x) || 0) + 1)));
  const mostly = [...fams].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  const kin = links.map(e => { const o = mkGroup(e.b), why = MK_REASONS.find(r => r[0] === e.top); const p = e.pairs[0]; const what = p && p.w.what ? ` (${p.w.what})` : '';
    return `<button type="button" class="mk-kin" data-mk-place="${escapeHtml(e.b)}"><i style="background:${MK_COLOR[e.top]}"></i><span><b>${escapeHtml(o ? o.label : e.b)}</b><span>${escapeHtml(why ? why[1].toLowerCase() : '')}${escapeHtml(what)} · ${e.n} link${e.n === 1 ? '' : 's'}</span></span></button>`; }).join('');
  mkCardEl().innerHTML = `<div class="mk-head"><div><div class="mk-title">${escapeHtml(g.label)}</div><div class="mk-sub">${g.items.length} release${g.items.length === 1 ? '' : 's'}${ys.length ? ` · ${ys[0]}${ys[ys.length - 1] !== ys[0] ? '–' + ys[ys.length - 1] : ''}` : ''}${mostly.length ? ' · mostly ' + escapeHtml(mostly.join(', ')) : ''}</div></div><button type="button" class="mk-x" data-mk="close" aria-label="Close">×</button></div>`
    + `<div class="mk-acts"><button type="button" class="chip-btn" data-mk="playPlace">▶ Play all</button></div>`
    + `<div class="mk-list mk-rels">${g.items.slice(0, 60).map(it => mkRow(it, gxYear(it) || '')).join('')}${g.items.length > 60 ? `<p class="mk-note">and ${g.items.length - 60} more</p>` : ''}</div>`
    + (kin ? `<div class="mk-h">Kin elsewhere</div><div class="mk-list">${kin}</div>` : '<p class="mk-note">Nothing on the map is much like what was made here.</p>');
  mkCardEl().hidden = false;
}
function mkOpenRelease(it) {
  const i = mk.index.get(it); if (i == null || !mk.graph) return;
  const here = mk.placeOf[i], g = mkGroup(here);
  mk.sel = { rel: i }; mkDrawWeb(); mkClearFocus();
  const rel = mk.graph.nbr[i].slice(0, 10).map(({ j, s }) => ({ j, s, w: mkWhy(it, mk.items[j]) }));
  rel.forEach(r => { const B = mk.ll.get(mk.placeOf[r.j]); if (B && g && mk.placeOf[r.j] !== here) L.polyline(mkArc(g.ll, B), { color: MK_COLOR[r.w.why], weight: 1 + r.s * 4, opacity: 0.85 }).addTo(mk.focusLayer); });
  if (g) L.circleMarker(g.ll, { radius: 18, color: '#e8c35a', weight: 2, fill: false, interactive: false }).addTo(mk.focusLayer);
  const from = mk.from != null && mk.from !== i ? mk.items[mk.from] : null;
  mkCardEl().innerHTML = `<div class="mk-head"><div class="mk-relhead"><img src="${escapeHtml(mkCover(it))}" alt=""><div><div class="mk-title">${escapeHtml(it.title)}</div><div class="mk-sub">${escapeHtml(it.artist)}${gxYear(it) ? ' · ' + gxYear(it) : ''} · ${escapeHtml(g ? g.label : '')}</div></div></div><button type="button" class="mk-x" data-mk="close" aria-label="Close">×</button></div>`
    + `<div class="mk-acts"><button type="button" class="chip-btn" data-mk="play">▶ Play</button><button type="button" class="chip-btn" data-mk="trail">${escapeHtml(artistCanon(it.artist))}’s trail</button>`
    + (from ? `<button type="button" class="chip-btn mk-go" data-mk="journeyTo">Journey from “${escapeHtml(from.title)}” to here</button>` : `<button type="button" class="chip-btn" data-mk="journeyFrom">Journey from here…</button>`)
    + `<button type="button" class="chip-btn" data-mk="catalogue">Show in catalogue</button><button type="button" class="chip-btn" data-mk="back">← ${escapeHtml(g ? g.label : 'Place')}</button></div>`
    + `<div class="mk-h">Closest relatives</div><div class="mk-list">${rel.map(r => { const o = mk.items[r.j], pl = mkGroup(mk.placeOf[r.j]); return mkRow(o, `${pl ? pl.label : ''}${r.w.what && r.w.why !== 'artist' ? ' · ' + r.w.what : ''}`).replace('<button type="button" class="mk-row"', `<button type="button" class="mk-row" style="border-left:3px solid ${MK_COLOR[r.w.why]}"`); }).join('') || '<p class="mk-note">None on the map.</p>'}</div>`;
  mkCardEl().hidden = false;
  mk.cur = i;
}
function mkTrail(it) {                                                 // the artist's releases on the map, in the order they were made
  const who = artistCanon(it.artist), list = mk.items.map((x, i) => ({ x, i })).filter(o => sameArtist(o.x.artist, who) && mk.ll.get(mk.placeOf[o.i])).sort((a, b) => (gxYear(a.x) || 9999) - (gxYear(b.x) || 9999) || String(a.x.releaseDate || '').localeCompare(String(b.x.releaseDate || '')));
  mkClearFocus(); mk.sel = { trail: who }; mkDrawWeb();
  const pts = list.map(o => mk.ll.get(mk.placeOf[o.i]));
  for (let k = 1; k < pts.length; k++) if (mk.placeOf[list[k].i] !== mk.placeOf[list[k - 1].i]) L.polyline(mkArc(pts[k - 1], pts[k], 0.12), { color: MK_COLOR.artist, weight: 2.6, opacity: 0.9 }).addTo(mk.focusLayer);
  const stops = []; list.forEach(o => { const p = mk.placeOf[o.i]; if (!stops.length || stops[stops.length - 1].p !== p) stops.push({ p, items: [o.x] }); else stops[stops.length - 1].items.push(o.x); });
  stops.forEach((s, k) => L.marker(mk.ll.get(s.p), { icon: L.divIcon({ className: 'mk-num', html: `<span>${k + 1}</span>`, iconSize: [20, 20] }), interactive: false }).addTo(mk.focusLayer));
  mkCardEl().innerHTML = `<div class="mk-head"><div><div class="mk-title">${escapeHtml(who)}’s trail</div><div class="mk-sub">${list.length} release${list.length === 1 ? '' : 's'} · ${stops.length} stop${stops.length === 1 ? '' : 's'}</div></div><button type="button" class="mk-x" data-mk="close" aria-label="Close">×</button></div>`
    + `<div class="mk-acts"><button type="button" class="chip-btn" data-mk="playTrail">▶ Play in order</button><button type="button" class="chip-btn" data-mk="backRel">← ${escapeHtml(it.title)}</button></div>`
    + `<div class="mk-list">${stops.map((s, k) => `<div class="mk-stop"><span class="mk-stopn">${k + 1}</span><b>${escapeHtml((mkGroup(s.p) || {}).label || s.p)}</b></div>` + s.items.map(x => mkRow(x, gxYear(x) || '')).join('')).join('')}</div>`;
  mk.trailItems = list.map(o => o.x); mk.cur = mk.index.get(it);
}
function mkJourney(a, b) {
  const path = gxPath(mk.graph, a, b); if (!path.length) { flashGlobalToast('No way between those two on the map.'); return; }
  mkClearFocus(); mk.sel = { journey: true }; mkDrawWeb();
  for (let k = 1; k < path.length; k++) { const A = mk.ll.get(mk.placeOf[path[k - 1]]), B = mk.ll.get(mk.placeOf[path[k]]); if (A && B && A !== B) L.polyline(mkArc(A, B, 0.14), { color: '#e8c35a', weight: 3, opacity: 0.9 }).addTo(mk.focusLayer); }
  path.forEach((i, k) => { const ll = mk.ll.get(mk.placeOf[i]); if (ll) L.marker(ll, { icon: L.divIcon({ className: 'mk-num mk-num-j', html: `<span>${k + 1}</span>`, iconSize: [20, 20] }), interactive: false }).addTo(mk.focusLayer); });
  mk.journey = path.map(i => mk.items[i]); mk.from = null;
  mkCardEl().innerHTML = `<div class="mk-head"><div><div class="mk-title">Journey</div><div class="mk-sub">${escapeHtml(mk.items[a].title)} → ${escapeHtml(mk.items[b].title)} · ${path.length} records</div></div><button type="button" class="mk-x" data-mk="close" aria-label="Close">×</button></div>`
    + `<div class="mk-acts"><button type="button" class="chip-btn" data-mk="playJourney">▶ Play the journey</button></div>`
    + `<div class="mk-list">${path.map((i, k) => `<div class="mk-stop"><span class="mk-stopn">${k + 1}</span><span>${escapeHtml((mkGroup(mk.placeOf[i]) || {}).label || '')}</span></div>` + mkRow(mk.items[i], k ? mkWhy(mk.items[path[k - 1]], mk.items[i]).what : '')).join('')}</div>`;
}
function mkCardClick(e) {
  const r = e.target.closest('[data-mk-rel]'); if (r) { const it = mkItemByRow(r.dataset.mkRel); if (it) { mkOpenRelease(it); const g = mkGroup(mk.placeOf[mk.index.get(it)]); if (g && g.ll) leafletMapInstance.panTo(g.ll); } return; }
  const p = e.target.closest('[data-mk-place]'); if (p) { mkOpenPlace(p.dataset.mkPlace); const g = mkGroup(p.dataset.mkPlace); if (g && g.ll) leafletMapInstance.panTo(g.ll); return; }
  const b = e.target.closest('[data-mk]'); if (!b) return;
  const k = b.dataset.mk, it = mk.cur != null ? mk.items[mk.cur] : null;
  if (k === 'close') { mkCloseCard(); return; }
  if (k === 'playPlace' && mk.sel && mk.sel.place) { const g = mkGroup(mk.sel.place); if (g) playAlbumsReplacingQueue(g.items.slice()); return; }
  if (!it) return;
  if (k === 'play') playAlbumReplacingQueue(it);
  else if (k === 'trail') mkTrail(it);
  else if (k === 'playTrail' && mk.trailItems) playAlbumsReplacingQueue(mk.trailItems.slice());
  else if (k === 'backRel') mkOpenRelease(it);
  else if (k === 'back') mkOpenPlace(mk.placeOf[mk.cur]);
  else if (k === 'journeyFrom') { mk.from = mk.cur; flashGlobalToast(`Journey from “${it.title}”: now open the release it should end at.`); mkOpenRelease(it); }
  else if (k === 'journeyTo' && mk.from != null) mkJourney(mk.from, mk.cur);
  else if (k === 'playJourney' && mk.journey) playAlbumsReplacingQueue(mk.journey.slice());
  else if (k === 'catalogue') { closeMapModal(); showInCatalogue(it); }
}
function mkCloseCard() { const c = document.getElementById('mapKinCard'); if (c) c.hidden = true; mk.sel = null; mkClearFocus(); mkDrawWeb(); }

// ---- after every drawing of the map: the kinship, and the web ----
const mkRenderOrig = renderMap;
renderMap = async function () {
  const token = mapLoadToken + 1;
  await mkRenderOrig.apply(this, arguments);
  if (mapLoadToken !== token) return;                                   // a newer drawing took over
  mk.groups = buildMapGroups().map(g => { const ll = mk.ll.get(g.key); return Object.assign(g, ll ? { ll } : {}); });
  try { mkBuild(); } catch (e) { console.warn('Map kinship failed', e); mk.graph = null; }
  mkClearFocus(); mkDrawWeb(); mkToolbar();
  const c = document.getElementById('mapKinCard'); if (c && !c.hidden && mk.sel && mk.sel.place && mkGroup(mk.sel.place)) mkOpenPlace(mk.sel.place); else if (c) { c.hidden = true; mk.sel = null; }
};

// ---- the toolbar: where, the web and its reasons; ▶ through time ----
function mkToolbar() {
  const p = mkPrefs(), bar = document.getElementById('mkBar'); if (!bar) return;
  bar.querySelectorAll('[data-mk-where]').forEach(b => b.classList.toggle('active', b.dataset.mkWhere === p.where));
  bar.querySelector('[data-mk-web]').classList.toggle('active', !!p.web);
  bar.querySelectorAll('[data-mk-why]').forEach(b => b.classList.toggle('off', p.off.includes(b.dataset.mkWhy)));
}
function mkTimePlay() {
  const btn = document.getElementById('mkTimePlay');
  if (mk.playing) { clearInterval(mk.playing); mk.playing = 0; if (btn) btn.textContent = '▶'; return; }
  if (!state.mapTimeEnabled) toggleMapTimeMode();
  if (!state.mapTimeEnabled) return;
  if (Number(el.mapTimeSlider.value) >= Number(el.mapTimeSlider.max)) setMapTimeIndex(Number(el.mapTimeSlider.min) || 0);
  if (btn) btn.textContent = '⏸';
  mk.playing = setInterval(() => {
    if (el.mapOverlay.hidden || Number(el.mapTimeSlider.value) >= Number(el.mapTimeSlider.max)) { clearInterval(mk.playing); mk.playing = 0; if (btn) btn.textContent = '▶'; return; }
    mapTimeStep(1);
  }, 900);
}
(function wireMapKin() {
  const tb = document.querySelector('#mapMain .map-toolbar'); if (!tb) return;
  const sel = el.mapColorBySelect; if (sel && !sel.querySelector('option[value="family"]')) { const o = document.createElement('option'); o.value = 'family'; o.textContent = 'Genre family'; sel.insertBefore(o, sel.children[1] || null); }
  const bar = document.createElement('div'); bar.id = 'mkBar'; bar.className = 'mk-bar';
  bar.innerHTML = `<span class="mk-seg"><button type="button" data-mk-where="rec">Recorded at</button><button type="button" data-mk-where="from">Where from</button><button type="button" data-mk-where="both">Both</button></span>`
    + `<button type="button" class="chip-btn mk-webbtn" data-mk-web title="Faint lines between places whose records are alike">Kinship web</button>`
    + MK_REASONS.map(r => `<button type="button" class="mk-why" data-mk-why="${r[0]}" title="Show or hide links for this reason"><i style="background:${r[2]}"></i>${r[1]}</button>`).join('');
  tb.parentNode.insertBefore(bar, tb.nextSibling);
  bar.addEventListener('click', (e) => {
    const w = e.target.closest('[data-mk-where]'), web = e.target.closest('[data-mk-web]'), why = e.target.closest('[data-mk-why]');
    if (w) { mkSave({ where: w.dataset.mkWhere }); mk.ll = new Map(); mkCloseCard(); renderMap(); return; }
    if (web) { mkSave({ web: !mkPrefs().web }); mkToolbar(); mkDrawWeb(); return; }
    if (why) { const off = new Set(mkPrefs().off); if (off.has(why.dataset.mkWhy)) off.delete(why.dataset.mkWhy); else off.add(why.dataset.mkWhy); mkSave({ off: [...off] }); mkToolbar(); mkDrawWeb(); if (mk.sel && mk.sel.place) mkOpenPlace(mk.sel.place); }
  });
  const next = document.getElementById('mapTimeNext');
  const tt = document.querySelector('.map-time-toolbar');
  if (tt) { const b = document.createElement('button'); b.type = 'button'; b.id = 'mkTimePlay'; b.className = 'chip-btn mk-timeplay'; b.title = 'Play through time'; b.setAttribute('aria-label', 'Play through time'); b.textContent = '▶'; b.addEventListener('click', mkTimePlay); tt.insertBefore(b, tt.firstChild); }
  if (sel && !localStorage.getItem(MK_KEY)) { state.mapColorBy = 'family'; }          // the first time: coloured by genre family
  mkToolbar();
})();
