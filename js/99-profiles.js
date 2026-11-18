// (1.135.165) Profiles: more than one crate. "Main" is the crate you've always had; each profile you make is a crate of its own (its own
// releases, diary, scrobbles, playlists and settings, in a spreadsheet of its own). The switcher sits under CRATE at the top left (and in
// ⚙ › Profiles…): pick one and CRATE opens it. Every read and save carries the profile you're on (Profiles.gs on the backend); your
// preferences on this device, Friends and the master crate stay with Main.
const PROFILE_KEY = 'crate_profile_v1';
function crateProfileRec() { try { const o = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); return o && o.id && o.id !== 'main' ? o : null; } catch (e) { return null; } }
function crateProfile() { const o = crateProfileRec(); return o ? o.id : ''; }
function crateProfileQS() { const id = crateProfile(); return id ? '&profile=' + encodeURIComponent(id) : ''; }
function profSwitch(id, name) {
  try { if (!id || id === 'main') localStorage.removeItem(PROFILE_KEY); else localStorage.setItem(PROFILE_KEY, JSON.stringify({ id, name: name || '' })); } catch (e) { flashGlobalToast('This browser won’t keep the choice of profile.'); return; }
  try { if (typeof pbLocalSave === 'function') pbLocalSave(); } catch (e) { /* fine */ }
  location.reload();
}
(function () {
  const base = postUpdate;
  postUpdate = function (payload, retried) { const id = crateProfile(); return base.call(this, id && payload && !payload.profile ? Object.assign({}, payload, { profile: id }) : payload, retried); };
})();
const prof = { list: null, main: 'Main', busy: false };
async function profLoad() {
  const r = await postUpdate({ action: 'profiles' });
  if (!r || r.profiles !== true) throw new Error(r && r.error ? r.error : 'Your backend doesn’t have profiles yet: add Profiles.gs to its Apps Script project and deploy a new version.');
  prof.list = r.list || []; prof.main = r.main || 'Main';
  const cur = crateProfileRec();
  if (cur && !prof.list.some(p => p.id === cur.id)) { flashGlobalToast(`The profile “${cur.name || cur.id}” is gone: back to ${prof.main}.`); profSwitch('main'); return r; }
  if (cur) { const p = prof.list.find(x => x.id === cur.id); if (p && p.name !== cur.name) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ id: p.id, name: p.name })); } catch (e) { /* fine */ } } }
  profChip();
  return r;
}
function profName() { const c = crateProfileRec(); return c ? (c.name || 'Profile') : prof.main; }
function profChip() { const b = document.getElementById('profChip'); if (!b) return; b.querySelector('.prof-name').textContent = profName(); b.classList.toggle('alt', !!crateProfile()); b.title = `Profile: ${profName()}. Switch to another crate, or make a new one`; }
function profMenuHtml(err) {
  const cur = crateProfile() || 'main', row = (id, name) => `<button type="button" class="prof-row${cur === id ? ' on' : ''}" data-prof-go="${escapeHtml(id)}" data-prof-name="${escapeHtml(name)}"><span class="prof-check" aria-hidden="true">${cur === id ? '✓' : ''}</span><span class="prof-rn">${escapeHtml(name)}</span>${cur === id ? '<span class="prof-tag">open</span>' : ''}</button>`;
  return `<div class="prof-h">Profiles</div>${err ? `<p class="pim-err">${escapeHtml(err)}</p>` : prof.list == null ? '<p class="gs-s">Reading your profiles…</p>' : row('main', prof.main) + prof.list.map(p => row(p.id, p.name)).join('')}
    <div class="prof-acts"><button type="button" class="prof-act" data-prof="new">+ New profile…</button>${prof.list != null ? `<button type="button" class="prof-act" data-prof="rename">Rename “${escapeHtml(profName())}”…</button>${crateProfile() ? `<button type="button" class="prof-act warn" data-prof="delete">Remove “${escapeHtml(profName())}”…</button>` : ''}` : ''}</div>
    <p class="gs-s prof-note">Each profile is a crate of its own: its releases, diary, scrobbles, playlists and settings. Friends and the master crate see ${escapeHtml(prof.main)}.</p>`;
}
function profMenu(anchor) {
  let m = document.getElementById('profMenu');
  if (m && !m.hidden) { m.hidden = true; return; }
  if (!m) {
    m = document.createElement('div'); m.id = 'profMenu'; m.className = 'pp-menu prof-menu'; m.setAttribute('role', 'menu'); document.body.appendChild(m);
    m.addEventListener('click', profClick);
    document.addEventListener('pointerdown', (e) => { if (!m.hidden && !m.contains(e.target) && !e.target.closest('#profChip, #menuProfiles')) m.hidden = true; }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) { e.stopPropagation(); m.hidden = true; } }, true);
  }
  const place = () => { const r = anchor.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(window.innerWidth - 280, r.left)) + 'px'; m.style.top = (r.bottom + 6) + 'px'; };
  m.innerHTML = profMenuHtml(); m.hidden = false; place();
  profLoad().then(() => { if (!m.hidden) { m.innerHTML = profMenuHtml(); place(); } }).catch(e => { if (!m.hidden) m.innerHTML = profMenuHtml(e.message); });
}
async function profClick(e) {
  const m = document.getElementById('profMenu'), g = e.target.closest('[data-prof-go]');
  if (g) { const id = g.dataset.profGo; if (id === (crateProfile() || 'main')) { m.hidden = true; return; } m.innerHTML = `<p class="gs-s">Opening “${escapeHtml(g.dataset.profName)}”…</p>`; profSwitch(id, g.dataset.profName); return; }
  const b = e.target.closest('[data-prof]'); if (!b || prof.busy) return;
  const k = b.dataset.prof;
  try {
    prof.busy = true;
    if (k === 'new') {
      const name = (prompt('Name the new profile (a crate of its own):', '') || '').trim(); if (!name) return;
      const copy = confirm(`Start “${name}” with your settings from “${profName()}” (genre taxonomy, artist details and aliases)?\n\nOK copies them; Cancel starts it empty. Releases, diary and playlists are never copied.`);
      const r = await postUpdate({ action: 'profileCreate', name, copySettings: copy, from: crateProfile() || '' });
      if (!r || !r.ok) throw new Error((r && r.error) || 'Couldn’t make it');
      if (confirm(`“${name}” is ready. Open it now?`)) { profSwitch(r.created, name); return; }
      prof.list = r.list; m.innerHTML = profMenuHtml();
    } else if (k === 'rename') {
      const name = (prompt('New name:', profName()) || '').trim(); if (!name) return;
      const r = await postUpdate({ action: 'profileRename', id: crateProfile() || 'main', name });
      if (!r || !r.ok) throw new Error((r && r.error) || 'Couldn’t rename it');
      prof.list = r.list; prof.main = r.main; if (crateProfile()) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ id: crateProfile(), name })); } catch (x) { /* fine */ } } profChip(); m.innerHTML = profMenuHtml();
    } else if (k === 'delete') {
      const name = profName();
      if (!confirm(`Remove the profile “${name}”?\n\nIt comes off your list and CRATE goes back to ${prof.main}. Its spreadsheet stays in your Google Drive (renamed “(removed)”), so nothing in it is lost.`)) return;
      const r = await postUpdate({ action: 'profileDelete', id: crateProfile() });
      if (!r || !r.ok) throw new Error((r && r.error) || 'Couldn’t remove it');
      profSwitch('main');
    }
  } catch (err) { m.innerHTML = profMenuHtml(err.message); }
  finally { prof.busy = false; }
}
(function () {
  const brand = document.querySelector('.brand');
  if (brand) {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'profChip'; b.className = 'prof-chip'; b.setAttribute('aria-haspopup', 'true');
    b.innerHTML = '<span class="prof-name"></span><span class="prof-caret" aria-hidden="true">▾</span>';
    b.addEventListener('click', (e) => { e.stopPropagation(); profMenu(b); });
    const tag = brand.querySelector('.tagline'); if (tag) tag.insertAdjacentElement('afterend', b); else brand.appendChild(b);
  }
  const g = document.getElementById('menuMasterCrate') || document.getElementById('menuGalaxy');
  if (g) { const m = document.createElement('button'); m.type = 'button'; m.id = 'menuProfiles'; m.textContent = 'Profiles…'; m.addEventListener('click', (e) => { e.stopPropagation(); if (el.layoutMenu) el.layoutMenu.hidden = true; profMenu(document.getElementById('profChip') || m); }); g.insertAdjacentElement('afterend', m); }
  profChip();
  if (crateProfile()) setTimeout(() => { profLoad().catch(() => { /* checked when the menu opens */ }); }, 6000);          // (a profile removed on another device: back to Main)
  if (crateProfile()) document.documentElement.classList.add('crate-alt-profile');
})();
