// CRATE — Friends: add people by friend code, see who's online and what they're playing.
// One part of the page's script, split by feature (see 01-core.js).
//
// THE BACKEND: the same Apps Script as everything else, with Social.gs added (backend/Social.gs in this repo). It keeps who is friends with whom
// and each person's sharing switches in its Script Properties, and what each person is playing in its cache for 10 minutes. Nothing goes in
// anyone's sheet, and friends never see each other's email addresses: people add each other by a friend code (CRT-7K4Q-MB2X).
//
// THE HEARTBEAT (socBeat): while you're signed in, CRATE tells the backend about once a minute that you're here and what you're playing (the
// song, the release, its cover, playing or paused, and where it plays from), and at once when the song changes or you pause. The same request
// brings back your friends: who's playing, who's online, when the others were last seen. Every 25 s while the Friends panel is open.
// "What I'm playing" off sends no song; "Appear offline" sends nothing at all and friends see you as offline.
//
// PHASE 1 of the friends sketch (https://claude.ai/artifact/2U7nNXahFHiHRG1vSP5ZvM). The backend already answers socialFriend (a friend's
// crate, ratings and diary, read from their own sheet); the screens for those come next.

const SOC_BEAT_MS = 60000, SOC_BEAT_OPEN_MS = 25000, SOC_PREFS_KEY = 'crate_social_v1';
const soc = { setDrawn: false, me: null, friends: [], incoming: [], outgoing: [], at: 0, err: '', unsupported: false, busy: false, timer: 0, lastKey: '', lastBeat: 0, note: '' };

function socOpenNow() { const pn = document.getElementById('friendsPanel'); return !!(pn && !pn.hidden); }
function socMyName() { const p = typeof decodeJwtPayload === 'function' ? decodeJwtPayload(getStoredIdToken() || '') : null; return (p && (p.given_name || p.name)) || ''; }

async function socCall(action, extra) {
  const idToken = typeof pbToken === 'function' ? await pbToken() : getStoredIdToken();
  if (!idToken) throw new Error('Sign in to CRATE first.');
  const r = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, idToken, name: socMyName() }, extra || {})) });
  const d = await r.json();
  if (d && isAuthError(d)) { try { await authRenew(); } catch (e) { /* next time */ } throw new Error('Your sign-in ran out. Try again.'); }
  if (!d || !d.social) { soc.unsupported = true; throw new Error('The backend has no friends yet: add Social.gs to the Apps Script and redeploy it.'); }
  soc.unsupported = false;
  if (d.ok === false) throw new Error(d.error || 'Something went wrong.');
  return d;
}
function socTake(d) {
  if (!d || !d.me) return;
  soc.me = d.me; soc.friends = d.friends || []; soc.incoming = d.incoming || []; soc.outgoing = d.outgoing || []; soc.at = Date.now(); soc.err = '';
  if (d.note) soc.note = d.note;
  socBtnRender(); if (socOpenNow()) socRender();
  if (typeof renderFriendTabButtons === 'function' && (state.friendTabs || []).length) { renderFriendTabButtons(); if (state.activeTab === 'friendInfo' && !document.querySelector('#friendInfoWrap :focus')) renderFriendPage(); }
}

// What I'm playing, as friends will see it (null when nothing is in the player).
function socNowPlaying() {
  try {
    if (!el.miniPlayer || el.miniPlayer.hidden) return null;
    const t = typeof pbNowName === 'function' ? pbNowName() : '';
    const inQueue = crateQueueList.length && crateQueueIndex >= 0 && crateQueueIndex < crateQueueList.length;
    const item = inQueue ? crateQueueList[crateQueueIndex].item : (typeof nowPlayingItem !== 'undefined' ? nowPlayingItem : null);
    if (!t && !item) return null;
    const cover = item ? ((state.artCache[artKey(item)] && state.artCache[artKey(item)].art) || item.cover || '') : '';
    const year = item && item.releaseDate ? String(item.releaseDate).slice(0, 4) : '';
    return { t: t || '', artist: item ? item.artist : '', album: item ? item.title : '', cover: /^https:\/\//.test(cover) ? cover : '', year, playing: typeof pbPlaying === 'function' ? pbPlaying() : false, src: activePlayerEngine || 'spotify' };
  } catch (e) { return null; }
}

async function socBeat() {
  if (soc.busy || !getStoredIdToken()) return;
  if (soc.unsupported && Date.now() - soc.lastBeat < 10 * 60000) return;            // an old backend: ask again now and then, not every minute
  soc.busy = true; soc.lastBeat = Date.now();
  try { socTake(await socCall('socialState', { beat: true, np: socNowPlaying() })); }
  catch (e) { soc.err = e.message || String(e); if (socOpenNow()) socRender(); socBtnRender(); }
  finally { soc.busy = false; }
}
function socSchedule() {
  clearTimeout(soc.timer);
  soc.timer = setTimeout(() => { socBeat().finally(socSchedule); }, socOpenNow() ? SOC_BEAT_OPEN_MS : SOC_BEAT_MS);
}
// A new song, a pause or a play is told at once (at most every 8 s), without waiting for the next beat.
function socWatch() {
  const np = socNowPlaying(), key = np ? [np.t, np.album, np.playing].join('|') : '';
  if (key !== soc.lastKey) { soc.lastKey = key; if (soc.at && Date.now() - soc.lastBeat > 8000) socBeat(); }
}

function socAgo(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  if (s < 2 * 86400) return 'yesterday';
  return Math.round(s / 86400) + ' days ago';
}
function socInitials(n) { const w = String(n || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : (w[0][1] || ''))).toUpperCase(); }
function socHue(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function socAvatar(f, cls) { return `<span class="soc-av ${cls || (f.status ? '' : 'soc-nodot')} soc-${f.status || 'offline'}" style="--soc-h:${socHue(f.id)}" aria-hidden="true">${escapeHtml(socInitials(f.name))}</span>`; }
// The release a friend is playing, if it's in my crate too.
function socMine(artist, album) {
  if (!artist || !album) return null;
  const a = pbFold(artist), t = pbFold(album);
  return (state.raw || []).find(x => pbFold(x.title) === t && pbFold(x.artist) === a) || null;
}
const SOC_SRC = { spotify: 'Spotify', youtube: 'YouTube', soundcloud: 'SoundCloud', local: 'Soulseek' };

function socFriendRow(f) {
  const np = f.status === 'playing' || f.status === 'online' ? f.np : null, last = f.last;
  let line = '', mine = null;
  if (f.status === 'playing' && np) {
    mine = socMine(np.artist, np.album);
    line = `<div class="soc-np"><span class="soc-eq" aria-hidden="true"><i></i><i></i><i></i></span>`
      + (np.cover ? `<img class="soc-cv" src="${escapeHtml(np.cover)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'soc-cv soc-cv-none'}))">` : '<span class="soc-cv soc-cv-none"></span>')
      + `<span class="soc-np-t"><b>${escapeHtml(np.t || np.album)}</b><span>${escapeHtml(np.artist)}${np.album ? ' · ' + escapeHtml(np.album) : ''}</span></span></div>`;
  } else if (f.status === 'online') {
    line = `<span class="soc-sub">CRATE open${np && np.t ? ' · paused on ' + escapeHtml(np.t) : ''}</span>`;
  } else {
    line = `<span class="soc-sub">${f.seen ? 'Last seen ' + socAgo(f.seen) : 'Offline'}${last && last.album ? ' · ' + escapeHtml(last.album) : ''}</span>`;
  }
  const src = f.status === 'playing' && np && SOC_SRC[np.src] ? `<span class="soc-src">${SOC_SRC[np.src]}</span>` : '';
  return `<div class="soc-row" data-soc-id="${escapeHtml(f.id)}"><button type="button" class="soc-page-btn" data-soc-page="${escapeHtml(f.id)}" title="Open ${escapeHtml(f.name)}'s crate and diary" aria-label="Open ${escapeHtml(f.name)}'s page">${socAvatar(f)}</button><div class="soc-who"><div class="soc-name"><button type="button" class="soc-name-btn" data-soc-page="${escapeHtml(f.id)}" title="Open ${escapeHtml(f.name)}'s crate and diary">${escapeHtml(f.name)}</button>${src}</div>${line}</div><span class="soc-acts">`
    + (mine ? `<button type="button" class="chip-btn soc-open" data-soc-open="${escapeHtml(pbId(mine))}" title="Open ${escapeHtml(mine.title)} in your crate">In your crate</button>` : '')
    + `<button type="button" class="chip-btn soc-more" data-soc-remove="${escapeHtml(f.id)}" data-soc-name="${escapeHtml(f.name)}" title="Remove ${escapeHtml(f.name)} from your friends">Remove</button></span></div>`;
}

// The panel has two parts: the list (redrawn with every heartbeat) and, behind the ⚙ button, Add a friend and What friends can see (drawn
// only when it opens or a setting changes, so a code you're typing isn't wiped by the next heartbeat).
function socRender() {
  const list = document.getElementById('friendsList'), sub = document.getElementById('friendsSub'); if (!list) return;
  const hdr = document.getElementById('friendsMinInfo');
  if (soc.unsupported) {
    sub.textContent = 'Not set up yet'; if (hdr) hdr.textContent = '';
    list.innerHTML = `<div class="soc-empty"><b>Your backend doesn't have friends yet.</b><p>Replace <code>apps-script-backend.gs</code> in your Apps Script project with the new one (it has the friends part), then redeploy: Deploy → Manage deployments → ✎ → New version. The steps are in the changelog under 1.114.1.</p><button type="button" class="chip-btn" data-soc-retry>Try again</button></div>`;
    socSetRender(); return;
  }
  if (!soc.me) { sub.textContent = soc.err ? '' : 'Loading…'; list.innerHTML = soc.err ? `<div class="soc-empty"><b>Couldn't load friends.</b><p>${escapeHtml(soc.err)}</p><button type="button" class="chip-btn" data-soc-retry>Try again</button></div>` : '<div class="soc-empty">Loading…</div>'; socSetRender(); return; }
  const by = (st) => soc.friends.filter(f => f.status === st);
  const playing = by('playing'), online = by('online'), offline = by('offline').sort((a, b) => (b.seen || 0) - (a.seen || 0));
  sub.textContent = soc.friends.length ? `${playing.length + online.length} of ${soc.friends.length} online` : 'No friends yet';
  if (hdr) hdr.textContent = playing.length ? `${playing.length} listening` : '';
  const grp = (title, l) => l.length ? `<div class="soc-grp">${title} · ${l.length}</div>` + l.map(socFriendRow).join('') : '';
  list.innerHTML = ''
    + (soc.note ? `<div class="soc-note" role="status">${escapeHtml(soc.note)}</div>` : '')
    + (soc.err ? `<div class="soc-note soc-warn" role="status">${escapeHtml(soc.err)}</div>` : '')
    + (soc.incoming.length ? `<div class="soc-grp">Requests · ${soc.incoming.length}</div>` + soc.incoming.map(p => `<div class="soc-row">${socAvatar(p)}<div class="soc-who"><div class="soc-name">${escapeHtml(p.name)}</div><span class="soc-sub">wants to be friends</span></div><span class="soc-acts"><button type="button" class="chip-btn soc-acc" data-soc-accept="${escapeHtml(p.id)}">Accept</button><button type="button" class="chip-btn" data-soc-ignore="${escapeHtml(p.id)}">Ignore</button></span></div>`).join('') : '')
    + (soc.friends.length ? grp('Listening now', playing) + grp('Online', online) + grp('Offline', offline)
      : `<div class="soc-empty"><b>No friends yet.</b><p>Send a friend your code, or enter theirs, under <b>⚙ Add a friend</b>.</p><button type="button" class="chip-btn soc-acc" data-soc-settings>Add a friend</button></div>`)
    + (soc.outgoing.length ? `<div class="soc-grp">Sent · ${soc.outgoing.length}</div>` + soc.outgoing.map(p => `<div class="soc-row">${socAvatar(p)}<div class="soc-who"><div class="soc-name">${escapeHtml(p.name)}</div><span class="soc-sub">hasn't answered yet</span></div><span class="soc-acts"><button type="button" class="chip-btn" data-soc-remove="${escapeHtml(p.id)}">Take back</button></span></div>`).join('') : '');
  if (!soc.setDrawn) socSetRender();
}
function socSetRender() {
  const box = document.getElementById('friendsSettings'), on = !!socPos().settings; if (!box) return;
  box.hidden = !on; document.getElementById('friendsSetBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
  if (!on || !soc.me) { box.innerHTML = ''; soc.setDrawn = false; return; }
  const me = soc.me, sh = me.share || {};
  const sw = (k, label, help, v) => `<label class="soc-tg"><span>${label}${help ? `<small>${help}</small>` : ''}</span><input type="checkbox" data-soc-share="${k}" ${v ? 'checked' : ''}></label>`;
  box.innerHTML = `<div class="soc-sec"><div class="soc-sec-h">Add a friend</div>
        <div class="soc-code-row"><span class="soc-code" id="socMyCode">${escapeHtml(me.code)}</span><button type="button" class="chip-btn" data-soc-copy>Copy</button><button type="button" class="chip-btn" data-soc-newcode title="Make a new code. The old one stops working.">New code</button></div>
        <p class="soc-hint">Your friend code. Send it to a friend, or enter theirs:</p>
        <form class="soc-add" id="socAddForm"><input id="socAddCode" type="text" placeholder="CRT-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Friend's code"><button type="submit" class="chip-btn soc-acc">Send</button></form>
      </div>
      <div class="soc-sec"><div class="soc-sec-h">What friends can see</div>
        <label class="soc-tg"><span>Your name</span><input id="socName" type="text" value="${escapeHtml(me.name || '')}" maxlength="40" aria-label="Your name, as friends see it"></label>
        ${sw('playing', 'What I\'m playing', '', sh.playing)}
        ${sw('crate', 'My crate', 'Releases, covers, genres', sh.crate)}
        ${sw('ratings', 'My ratings', '', sh.ratings)}
        ${sw('diary', 'My diary', 'Reviews included', sh.diary)}
        <label class="soc-tg"><span>Appear offline<small>You still see your friends</small></span><input type="checkbox" data-soc-off ${me.off ? 'checked' : ''}></label>
      </div>`;
  soc.setDrawn = true;
}

// The header button: a people icon, a green count of friends playing now, a dot for requests waiting.
function socBtnRender() {
  const b = document.getElementById('friendsBtn'); if (!b) return;
  const n = soc.friends.filter(f => f.status === 'playing').length, on = soc.friends.filter(f => f.status !== 'offline').length;
  const cnt = document.getElementById('friendsBtnCount'), req = document.getElementById('friendsBtnReq');
  if (cnt) { cnt.hidden = !n; cnt.textContent = String(n); }
  if (req) req.hidden = !soc.incoming.length;
  b.classList.toggle('soc-live', n > 0);
  b.setAttribute('aria-pressed', socOpenNow() ? 'true' : 'false');
  b.title = 'Friends' + (soc.friends.length ? ` · ${n} listening, ${on} online` : '') + (soc.incoming.length ? ` · ${soc.incoming.length} request${soc.incoming.length === 1 ? '' : 's'}` : '');
}

// THE PANEL: it floats over CRATE without blocking it. Drag it by its header, resize it from its corner, fold it down to the header (–).
// Where it is, its size, whether it's folded and whether it's open are kept in this browser, so it comes back where you left it.
function socPos() { try { return JSON.parse(localStorage.getItem(SOC_PREFS_KEY) || '{}') || {}; } catch (e) { return {}; } }
function socPosSave(patch) { const v = Object.assign(socPos(), patch); try { localStorage.setItem(SOC_PREFS_KEY, JSON.stringify(v)); } catch (e) { /* this visit only */ } return v; }
function socPhone() { return window.innerWidth < 640; }
function socPlace() {
  const pn = document.getElementById('friendsPanel'); if (!pn || pn.hidden) return;
  const v = socPos();
  pn.classList.toggle('soc-min', !!v.min);
  if (socPhone()) { pn.style.left = pn.style.top = pn.style.width = pn.style.height = ''; return; }          // a sheet along the bottom (CSS)
  if (v.w) pn.style.width = Math.max(280, Math.min(v.w, innerWidth - 16)) + 'px';
  pn.style.height = v.min ? '' : (v.h ? Math.max(220, Math.min(v.h, innerHeight - 16)) + 'px' : '');
  const r = pn.getBoundingClientRect();
  const x = v.x == null ? innerWidth - r.width - 24 : v.x, y = v.y == null ? 110 : v.y;
  pn.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  pn.style.top = Math.max(8, Math.min(y, innerHeight - 48)) + 'px';
  socFit(pn);
}
function socFit(pn) { if (!socPhone()) pn.style.maxHeight = Math.max(120, innerHeight - parseFloat(pn.style.top || 110) - 8) + 'px'; else pn.style.maxHeight = ''; }      // never past the bottom of the screen
function socDragInit(pn) {
  const head = document.getElementById('friendsHead');
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || socPhone()) return;
    const r = pn.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId); pn.classList.add('soc-dragging'); e.preventDefault();
    const move = (ev) => {
      pn.style.left = Math.max(8, Math.min(ev.clientX - dx, innerWidth - r.width - 8)) + 'px';
      pn.style.top = Math.max(8, Math.min(ev.clientY - dy, innerHeight - 48)) + 'px'; socFit(pn);
    };
    const up = () => {
      head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up);
      pn.classList.remove('soc-dragging'); socPosSave({ x: parseFloat(pn.style.left), y: parseFloat(pn.style.top) });
    };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
  });
  head.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) socMinToggle(); });
  // its size, after you drag the corner (CSS resize)
  if (window.ResizeObserver) {
    let t = 0;
    new ResizeObserver(() => {
      if (pn.hidden || socPhone() || pn.classList.contains('soc-min')) return;
      clearTimeout(t); t = setTimeout(() => { const r = pn.getBoundingClientRect(); if (r.width && r.height) socPosSave({ w: Math.round(r.width), h: pn.style.height || pn.dataset.sized ? Math.round(r.height) : undefined }); }, 300);
    }).observe(pn);
    pn.addEventListener('pointerdown', (e) => { const r = pn.getBoundingClientRect(); if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) pn.dataset.sized = '1'; });
  }
  window.addEventListener('resize', socPlace);
}
function socMinToggle() { socPosSave({ min: !socPos().min }); socPlace(); }

function socOpen() { const pn = document.getElementById('friendsPanel'); if (!pn) return; pn.hidden = false; socPosSave({ open: true }); soc.note = ''; socPlace(); socRender(); socBtnRender(); socBeat(); socSchedule(); }
function socClose() { const pn = document.getElementById('friendsPanel'); if (pn) pn.hidden = true; socPosSave({ open: false }); soc.note = ''; socBtnRender(); socSchedule(); }
function socToggle() { if (socOpenNow()) { if (socPos().min) socMinToggle(); else socClose(); } else socOpen(); }

async function socDo(action, extra, okNote) {
  try { const d = await socCall(action, extra); soc.note = d.note || okNote || ''; socTake(d); if (/socialSettings|socialNewCode/.test(action)) socSetRender(); }
  catch (e) { soc.note = ''; soc.err = e.message || String(e); socRender(); }
}

function initSocial() {
  const pn = document.getElementById('friendsPanel'), btn = document.getElementById('friendsBtn'); if (!pn || !btn) return;
  btn.addEventListener('click', socToggle);
  document.getElementById('friendsClose').addEventListener('click', socClose);
  document.getElementById('friendsMin').addEventListener('click', socMinToggle);
  document.getElementById('friendsSetBtn').addEventListener('click', () => { const on = !socPos().settings; socPosSave({ settings: on, min: false }); socPlace(); socSetRender(); if (on) { const x = document.getElementById('friendsSettings'); x.scrollIntoView({ block: 'nearest' }); } });
  pn.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.matches('input')) socClose(); });
  socDragInit(pn);
  pn.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !pn.querySelector('.friends-body').contains(b)) return;
    soc.err = '';
    if (b.hasAttribute('data-soc-retry')) { soc.unsupported = false; soc.lastBeat = 0; socBeat(); }
    else if (b.hasAttribute('data-soc-settings')) { socPosSave({ settings: true }); socSetRender(); document.getElementById('friendsSettings').scrollIntoView({ block: 'nearest' }); }
    else if (b.dataset.socAccept) socDo('socialAnswer', { id: b.dataset.socAccept, accept: true });
    else if (b.dataset.socIgnore) socDo('socialAnswer', { id: b.dataset.socIgnore, accept: false });
    else if (b.dataset.socRemove) {
      if (b.dataset.socName && b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Remove ' + b.dataset.socName + '?'; b.classList.add('soc-danger'); setTimeout(() => { if (b.isConnected) { b.dataset.confirm = ''; b.textContent = 'Remove'; b.classList.remove('soc-danger'); } }, 4000); return; }
      socDo('socialRemove', { id: b.dataset.socRemove }, b.dataset.socName ? b.dataset.socName + ' is no longer a friend.' : 'Request taken back.');
    }
    else if (b.hasAttribute('data-soc-newcode')) socDo('socialNewCode', {}, 'New code made. The old one no longer works.');
    else if (b.hasAttribute('data-soc-copy')) {
      const code = soc.me ? soc.me.code : '';
      const done = () => { b.textContent = 'Copied'; setTimeout(() => { if (b.isConnected) b.textContent = 'Copy'; }, 1500); };
      try { navigator.clipboard.writeText(code).then(done, () => { const r = document.createRange(); r.selectNodeContents(document.getElementById('socMyCode')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }); } catch (er) { /* select it by hand */ }
    }
    else if (b.dataset.socPage) { if (typeof openFriendTab === 'function') openFriendTab(b.dataset.socPage); }
    else if (b.dataset.socOpen) { const it = pbItemOf(b.dataset.socOpen); if (it) openDeck(it); }          // the panel stays where it is
  });
  pn.addEventListener('submit', (e) => {
    if (e.target.id !== 'socAddForm') return; e.preventDefault();
    const v = document.getElementById('socAddCode').value.trim(); if (!v) return;
    socDo('socialAdd', { code: v }).then(() => { if (!soc.err) { const x = document.getElementById('socAddCode'); if (x) x.value = ''; } });
  });
  pn.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.socShare) socDo('socialSettings', { share: { [t.dataset.socShare]: t.checked } });
    else if (t.hasAttribute('data-soc-off')) socDo('socialSettings', { off: t.checked }, t.checked ? 'Friends now see you as offline.' : 'Friends can see you again.');
    else if (t.id === 'socName' && t.value.trim()) socDo('socialSettings', { name: t.value.trim() }, 'Name saved.');
  });
  setInterval(socWatch, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - soc.lastBeat > 20000) socBeat(); });
  if (socPos().open && !(typeof CRATE_POPOUT_WINDOW !== 'undefined' && CRATE_POPOUT_WINDOW)) socOpen();          // open last time: open again, where it was
  setTimeout(() => { socBeat(); socSchedule(); }, 4000);              // after the crate has started loading
}
initSocial();
