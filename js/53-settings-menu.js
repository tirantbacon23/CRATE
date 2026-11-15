// CRATE — the ⚙ menu, tidied: five sections that open one at a time (Tools, Tidy up your crate, Settings, Connections, Import and
// export), a search box over all of them, and the "match songs straight away" switch.
// One part of the page's script, split by feature (see 01-core.js).
//
// SECTIONS: a click on a section's title opens it and closes the others; the one you had open last opens again next time (kept in this
// browser). FIND: typing shows every item, in every section, whose name has those words; Enter runs the first one; Escape clears it.
// Every item keeps its own id and does what it always did: only where it sits changed.
//
// MATCH SONGS AS SOON AS A RELEASE IS ADDED (Settings → Matching songs): the Match songs preference "Match new releases by themselves",
// brought out where you'd look for it. On, any release that arrives (by hand, from the RYM add-on, an import, a friend, a recommendation)
// has its songs matched in the background straight away, without opening Match songs; switching it on, and each start of CRATE, also
// matches what's waiting in the match queue. Off, new releases wait in the match queue for Match songs → Start, as before.

const MENU_OPEN_KEY = 'crate_menu_open_v1';
function menuAccOpen(key) {
  document.querySelectorAll('#layoutMenu .menu-acc').forEach(a => {
    const on = a.dataset.acc === key, h = a.querySelector('.menu-acc-h'), body = a.querySelector('.menu-acc-body');
    h.setAttribute('aria-expanded', on ? 'true' : 'false'); body.hidden = !on; a.classList.toggle('open', on);
  });
  try { localStorage.setItem(MENU_OPEN_KEY, key || ''); } catch (e) { /* this visit only */ }
}
function menuFind(q) {
  q = String(q || '').trim().toLowerCase();
  const accs = [...document.querySelectorAll('#layoutMenu .menu-acc')];
  if (!q) {                                                          // back to sections
    accs.forEach(a => { a.hidden = false; a.querySelectorAll('.menu-acc-body > *').forEach(x => { x.hidden = x.dataset.menuHidden === '1'; }); });
    let open = ''; try { open = localStorage.getItem(MENU_OPEN_KEY) || ''; } catch (e) { open = ''; }
    menuAccOpen(open || 'tools'); return;
  }
  const words = q.split(/\s+/);
  accs.forEach(a => {
    let any = false;
    a.querySelectorAll('.menu-acc-body > *').forEach(x => {
      if (x.dataset.menuHidden === undefined) x.dataset.menuHidden = x.hidden ? '1' : '0';          // (an item hidden for its own reasons, e.g. Install, stays hidden)
      if (x.dataset.menuHidden === '1') return;
      const txt = (x.textContent + ' ' + (x.title || '')).toLowerCase(), hit = x.tagName === 'BUTTON' && words.every(w => txt.includes(w));
      x.hidden = !hit; if (hit) any = true;
    });
    a.hidden = !any; a.querySelector('.menu-acc-body').hidden = !any; a.querySelector('.menu-acc-h').setAttribute('aria-expanded', any ? 'true' : 'false'); a.classList.toggle('open', any);
  });
}
function menuMatchNowPaint() { const b = document.getElementById('menuMatchNow'); if (b && typeof smPrefs === 'function') b.setAttribute('aria-pressed', smPrefs().autoMatchNew ? 'true' : 'false'); }
// What's waiting in the match queue, matched now (when switched on, and at each start once the crate is in).
function menuMatchWaiting() {
  if (typeof smPrefs !== 'function' || !smPrefs().autoMatchNew || typeof mqAll !== 'function' || typeof bmAutoQueue !== 'function') return 0;
  const waiting = mqAll(); if (!waiting.length) return 0;
  bmAutoQueue(waiting.map(e => ({ artist: e.a, title: e.t }))); return waiting.length;
}
// "Playback on your devices…" and "Play from…" are made by their own parts of CRATE once it starts; they're settings, so they're moved
// under Settings → Playback (each time the menu opens, in case they were made after the last time).
function menuPlaybackPlace() {
  const t = document.getElementById('menuPlaybackTitle'); if (!t) return;
  let at = t; ['menuPlaySource', 'menuPlaybackDevices'].forEach(id => { const b = document.getElementById(id); if (b && b.previousElementSibling !== at) at.insertAdjacentElement('afterend', b); if (b) at = b; });
  t.hidden = !document.getElementById('menuPlaySource') && !document.getElementById('menuPlaybackDevices');
}
function initSettingsMenu() {
  const menu = document.getElementById('layoutMenu'); if (!menu) return;
  menu.addEventListener('click', (e) => { const h = e.target.closest('[data-acc-h]'); if (!h) return; e.stopPropagation(); const a = h.closest('.menu-acc'); menuAccOpen(a.classList.contains('open') && !document.getElementById('menuFind').value ? '' : h.dataset.accH); });
  const find = document.getElementById('menuFind');
  if (find) {
    find.addEventListener('input', () => menuFind(find.value));
    find.addEventListener('click', (e) => e.stopPropagation());
    find.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = [...menu.querySelectorAll('.menu-acc-body > button')].find(b => !b.hidden && b.offsetParent); if (first) { e.preventDefault(); first.click(); } }
      else if (e.key === 'Escape' && find.value) { e.stopPropagation(); find.value = ''; menuFind(''); }
    });
  }
  // each time the menu opens: no leftover search, the last section open
  const btn = document.getElementById('layoutBtn');
  if (btn) btn.addEventListener('click', () => setTimeout(() => { if (menu.hidden) return; menuPlaybackPlace(); if (find && find.value) { find.value = ''; } menuFind(''); menuMatchNowPaint(); }, 0));
  const mn = document.getElementById('menuMatchNow');
  if (mn) mn.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !smPrefs().autoMatchNew; smPrefsSave({ autoMatchNew: on }); menuMatchNowPaint();
    const n = on ? menuMatchWaiting() : 0;
    if (typeof flashGlobalToast === 'function') flashGlobalToast(on ? `New releases have their songs matched straight away${n ? `; matching the ${n} waiting in the queue now` : ''}.` : 'New releases wait in the match queue for Match songs → Start.');
    if (typeof jobsRefresh === 'function') jobsRefresh();
  });
  menuPlaybackPlace(); menuMatchNowPaint(); menuFind('');
  // at start: once the crate is in, what's waiting in the match queue is matched (when the switch is on)
  let tries = 0; const kick = () => { if ((state.raw || []).length) { menuMatchWaiting(); return; } if (++tries < 40) setTimeout(kick, 3000); };
  setTimeout(kick, 8000);
}
initSettingsMenu();
