// (1.135.162) The master crate, step 1: joining, what you share, and the master crate's state (⚙ › Master crate…). The master crate is one
// catalog pooled every night from the crates of everyone on this CRATE who joins (you and your friends): each release once, with the details
// their crates hold, how many crates have it, the ratings and plays pooled, and for each person what crates like theirs love. It's made by
// the backend (Master.gs); this is its window here. Steps 2 and 3 (in the deck, when adding, and Discover) read from it.
const mc = { st: null, busy: false };
function mcEl() { return document.getElementById('mcOverlay'); }
async function mcCall(action, extra) {
  const r = await postUpdate(Object.assign({ action }, extra || {}));
  if (!r || r.master !== true) { const e = new Error(r && r.error ? r.error : 'Your backend doesn’t have the master crate yet: add Master.gs to its Apps Script project and deploy a new version.'); e.noBackend = true; throw e; }
  return r;
}
function mcAgo(t) { if (!t) return 'not yet'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }
function mcN(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n.toLocaleString(); }
function mcOpen() {
  if (el.layoutMenu) el.layoutMenu.hidden = true;
  let ov = mcEl();
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'mcOverlay'; ov.className = 'pt-overlay mc-overlay'; document.body.appendChild(ov);
    ov.addEventListener('click', mcClick);
    ov.addEventListener('change', (e) => { const k = e.target.dataset.mcShare; if (k) mcSet({ share: { [k]: e.target.checked } }); });
    document.addEventListener('keydown', (e) => { const o = mcEl(); if (e.key === 'Escape' && o && !o.hidden && !mc.busy) { e.stopImmediatePropagation(); o.hidden = true; } }, true);
  }
  ov.hidden = false; mcRender('Reading the master crate…'); mcLoad();
}
async function mcLoad() {
  try { mc.st = await mcCall('masterState'); mcRender(); }
  catch (e) { mc.st = null; mcRender('', e.message); }
}
async function mcSet(body, say) {
  if (mc.busy) return; mc.busy = true; mcRender(say || 'Saving…');
  try { await mcCall('masterShare', body); mc.st = await mcCall('masterState'); mc.busy = false; mcRender(); }
  catch (e) { mc.busy = false; mcRender('', e.message); }
}
async function mcRebuild() {
  if (mc.busy) return; mc.busy = true; mcRender('Building the master crate from everyone’s crates… this takes a minute.');
  try { const r = await mcCall('masterBuild'); mc.busy = false; if (!r.ok) { mcRender('', r.error || 'Couldn’t build it.'); return; } mc.st = await mcCall('masterState'); mcRender(); flashGlobalToast(`Master crate built: ${mcN(r.status && r.status.releases)} releases from ${r.status && r.status.crates} crate${r.status && r.status.crates === 1 ? '' : 's'}.`); }
  catch (e) { mc.busy = false; mcRender('', e.message); }
}
function mcClick(e) {
  const ov = mcEl(); if (e.target === ov || e.target.closest('[data-mc="x"]')) { if (!mc.busy) ov.hidden = true; return; }
  const b = e.target.closest('[data-mc]'); if (!b || b.disabled || mc.busy) return;
  const k = b.dataset.mc;
  if (k === 'join') mcSet({ joined: true, share: { details: true, have: true, ratings: true, plays: true, fill: true } }, 'Joining…').then(() => { if (mc.st && mc.st.joined && !(mc.st.status && mc.st.status.builtAt)) mcRebuild(); });
  else if (k === 'leave') { if (confirm('Leave the master crate? What you share is taken out of it now (it is built again without you), and nothing more is shared until you join again.')) mcSet({ joined: false }, 'Taking your crate out of the master crate…'); }
  else if (k === 'rebuild') mcRebuild();
  else if (k === 'retry') mcOpen();
}
function mcRender(busy, err) {
  const ov = mcEl(); if (!ov) return;
  const s = mc.st, sh = (s && s.share) || {}, st = s && s.status, joined = !!(s && s.joined);
  const sw = (k, b, sub) => `<label class="mc-row"><span><b>${b}</b><span class="gs-s">${sub}</span></span><input type="checkbox" class="mc-sw" data-mc-share="${k}"${sh[k] !== false ? ' checked' : ''}${!joined || mc.busy ? ' disabled' : ''}></label>`;
  const left = `<div class="mc-card"><div class="mc-title">Master crate · what you share</div>
    <p class="gs-s">One catalog made every night from the crates of everyone on this CRATE who joins (you and your friends): each release once, with the details their crates hold, the ratings and plays pooled, and what crates like yours love. Only the people on this CRATE see it.</p>
    ${sw('details', 'Release details', 'genres, descriptors, label, cover, RYM link and rating, tracklists and song links')}
    ${sw('have', 'Which releases you have', 'counts towards “4 of 5 crates have it”')}
    ${sw('ratings', 'Your ratings', 'pooled into the friends’ average; shown by name only to friends you share ratings with')}
    ${sw('plays', 'Your plays', 'from your scrobbles and diary: how many, never when')}
    ${sw('fill', 'Use it when adding', 'fill a new release from friends’ crates before looking it up online')}
    <div class="mc-row"><span><b>Never shared</b><span class="gs-s">notes, reviews, diary text, catalog numbers, when you added things, releases marked “Hide from friends”</span></span><span class="gs-s">always</span></div>
    <div class="mc-acts">${joined ? `<button type="button" class="gs-btn" data-mc="rebuild"${s.rebuildIn > 0 ? ` title="It was built a moment ago: again in ${Math.ceil(s.rebuildIn / 60000)} min"` : ''}>Rebuild now</button><button type="button" class="gs-btn mc-warn" data-mc="leave">Leave, and take my data out</button>` : `<button type="button" class="gs-btn gs-pri" data-mc="join"${s ? '' : ' disabled'}>Join the master crate</button>`}</div></div>`;
  const people = (s && s.people) || [];
  const right = `<div class="mc-card"><div class="mc-title">The master crate now</div>
    <p class="gs-s">${st && st.builtAt ? `Built ${mcAgo(st.builtAt)} · took ${Math.max(1, Math.round((st.took || 0) / 1000))} s · again every night` : 'Not built yet: it is made the first time someone joins, then every night.'}</p>
    <div class="mc-nums">${[[st ? st.crates : '–', 'crates sharing'], [st ? mcN(st.releases) : '–', 'releases'], [st ? mcN(st.shared2) : '–', 'in 2 crates or more'], [st ? mcN(st.ratings) : '–', 'ratings pooled'], [st ? mcN(st.plays) : '–', 'plays pooled']].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <div class="gs-lbl">Crates</div>
    ${people.length ? people.map(p => `<div class="mc-person"><span class="mc-dot${p.me ? ' me' : ''}"></span><span class="mc-pn">${escapeHtml(p.me ? 'You' : p.name || 'A friend')}</span><span class="gs-s">${mcN(p.releases)} releases · ${p.share && p.share.ratings && p.share.plays ? 'ratings and plays' : p.share && p.share.ratings ? 'ratings, no plays' : p.share && p.share.plays ? 'plays, no ratings' : 'details only'}</span></div>`).join('') : '<p class="gs-s">Nobody yet.</p>'}
    <p class="gs-s mc-foot">Releases are matched across crates by artist and title (editions such as “Deluxe” or “Remastered” count as the same release). A friend’s name shows only where they share their ratings with you.</p></div>`;
  ov.innerHTML = `<div class="pt-dialog mc-dialog" role="dialog" aria-modal="true" aria-labelledby="mcTitle"><div class="pt-head"><div><div class="gs-lbl">You and your friends</div><div class="pt-title" id="mcTitle">Master crate</div></div><button type="button" class="mood-x" data-mc="x" aria-label="Close">×</button></div>
    ${err ? `<p class="pim-err" role="alert">${escapeHtml(err)} <button type="button" class="gs-btn" data-mc="retry">Try again</button></p>` : ''}${busy ? `<p class="gs-s" role="status">${escapeHtml(busy)}</p>` : ''}
    <div class="mc-grid">${left}${right}</div></div>`;
}
(function () {
  const g = document.getElementById('menuGalaxy'); if (!g) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'menuMasterCrate'; b.textContent = 'Master crate…'; b.title = 'One catalog pooled from your and your friends’ crates: ratings, plays, recommendations';
  b.addEventListener('click', mcOpen); g.insertAdjacentElement('afterend', b);
})();
