// CRATE — Friends: add people by friend code, see who's online and what they're playing.
// One part of the page's script, split by feature (see 01-core.js).
//
// THE BACKEND: the same Apps Script as everything else, with Social.gs added (backend/Social.gs in this repo). It keeps who is friends with whom
// and each person's sharing switches in its Script Properties, and what each person is playing in its cache for 10 minutes. Nothing goes in
// anyone's sheet, and friends never see each other's email addresses: people add each other by a friend code (CRT-7K4Q-MB2X).
//
// THE HEARTBEAT (socBeat): while you're signed in, CRATE tells the backend about once a minute that you're here and what you're playing (the
// song, the release, its cover, playing or paused, and where it plays from), and at once when the song changes or you pause. The same request
// brings back your friends: who's playing, who's online, when the others were last seen. Every 25 s while the Friends window is open.
// "What I'm playing" off sends no song; "Appear offline" sends nothing at all and friends see you as offline.
//
// PHASE 1 of the friends sketch (https://claude.ai/artifact/2U7nNXahFHiHRG1vSP5ZvM). The backend already answers socialFriend (a friend's
// crate, ratings and diary, read from their own sheet); the screens for those come next.

const SOC_BEAT_MS = 60000, SOC_BEAT_OPEN_MS = 25000, SOC_PREFS_KEY = 'crate_social_v1';
const soc = { me: null, friends: [], incoming: [], outgoing: [], at: 0, err: '', unsupported: false, busy: false, timer: 0, lastKey: '', lastBeat: 0, note: '' };

function socOpenNow() { const ov = document.getElementById('friendsOverlay'); return !!(ov && !ov.hidden); }
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
  return `<div class="soc-row" data-soc-id="${escapeHtml(f.id)}">${socAvatar(f)}<div class="soc-who"><div class="soc-name">${escapeHtml(f.name)}${src}</div>${line}</div><span class="soc-acts">`
    + (mine ? `<button type="button" class="chip-btn soc-open" data-soc-open="${escapeHtml(pbId(mine))}" title="Open ${escapeHtml(mine.title)} in your crate">In your crate</button>` : '')
    + `<button type="button" class="chip-btn soc-more" data-soc-remove="${escapeHtml(f.id)}" data-soc-name="${escapeHtml(f.name)}" title="Remove ${escapeHtml(f.name)} from your friends">Remove</button></span></div>`;
}

function socRender() {
  const body = document.getElementById('friendsBody'), sub = document.getElementById('friendsSub'); if (!body) return;
  if (soc.unsupported) {
    sub.textContent = 'Not set up yet';
    body.innerHTML = `<div class="soc-empty"><b>Your backend doesn't have friends yet.</b><p>Add <code>Social.gs</code> to the CRATE Apps Script project, add one line to <code>CRATE.gs</code>, and redeploy. The steps are in the changelog under 1.114.0.</p><button type="button" class="chip-btn" data-soc-retry>Try again</button></div>`;
    return;
  }
  if (!soc.me) { sub.textContent = soc.err ? '' : 'Loading…'; body.innerHTML = soc.err ? `<div class="soc-empty"><b>Couldn't load friends.</b><p>${escapeHtml(soc.err)}</p><button type="button" class="chip-btn" data-soc-retry>Try again</button></div>` : '<div class="soc-empty">Loading…</div>'; return; }
  const by = (s) => soc.friends.filter(f => f.status === s);
  const playing = by('playing'), online = by('online'), offline = by('offline').sort((a, b) => (b.seen || 0) - (a.seen || 0));
  sub.textContent = soc.friends.length ? `${soc.friends.length} friend${soc.friends.length === 1 ? '' : 's'} · ${playing.length + online.length} online` : 'No friends yet';
  const grp = (title, list) => list.length ? `<div class="soc-grp">${title} · ${list.length}</div>` + list.map(socFriendRow).join('') : '';
  const me = soc.me, sh = me.share || {};
  const sw = (k, label, help, on) => `<label class="soc-tg"><span>${label}${help ? `<small>${help}</small>` : ''}</span><input type="checkbox" data-soc-share="${k}" ${on ? 'checked' : ''}></label>`;
  body.innerHTML = ''
    + (soc.note ? `<div class="soc-note" role="status">${escapeHtml(soc.note)}</div>` : '')
    + (soc.err ? `<div class="soc-note soc-warn" role="status">${escapeHtml(soc.err)}</div>` : '')
    + (soc.incoming.length ? `<div class="soc-grp">Requests · ${soc.incoming.length}</div>` + soc.incoming.map(p => `<div class="soc-row">${socAvatar(p)}<div class="soc-who"><div class="soc-name">${escapeHtml(p.name)}</div><span class="soc-sub">wants to be friends</span></div><span class="soc-acts"><button type="button" class="chip-btn soc-acc" data-soc-accept="${escapeHtml(p.id)}">Accept</button><button type="button" class="chip-btn" data-soc-ignore="${escapeHtml(p.id)}">Ignore</button></span></div>`).join('') : '')
    + (soc.friends.length ? grp('Listening now', playing) + grp('Online', online) + grp('Offline', offline)
      : `<div class="soc-empty"><b>No friends yet.</b><p>Send a friend your code below, or enter theirs. Friends see each other's online status and what's playing; crates, diaries and ratings come in the next update.</p></div>`)
    + (soc.outgoing.length ? `<div class="soc-grp">Sent · ${soc.outgoing.length}</div>` + soc.outgoing.map(p => `<div class="soc-row">${socAvatar(p)}<div class="soc-who"><div class="soc-name">${escapeHtml(p.name)}</div><span class="soc-sub">hasn't answered yet</span></div><button type="button" class="chip-btn" data-soc-remove="${escapeHtml(p.id)}">Take back</button></div>`).join('') : '')
    + `<div class="soc-sec"><div class="soc-sec-h">Add a friend</div>
        <div class="soc-code-row"><span class="soc-code" id="socMyCode">${escapeHtml(me.code)}</span><button type="button" class="chip-btn" data-soc-copy>Copy</button><button type="button" class="chip-btn" data-soc-newcode title="Make a new code. The old one stops working.">New code</button></div>
        <p class="soc-hint">Your friend code. Send it to a friend, or enter theirs:</p>
        <form class="soc-add" id="socAddForm"><input id="socAddCode" type="text" placeholder="CRT-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Friend's code"><button type="submit" class="chip-btn soc-acc">Send request</button></form>
      </div>`
    + `<div class="soc-sec"><div class="soc-sec-h">What friends can see</div>
        <label class="soc-tg"><span>Your name</span><input id="socName" type="text" value="${escapeHtml(me.name || '')}" maxlength="40" aria-label="Your name, as friends see it"></label>
        ${sw('playing', 'What I\'m playing', '', sh.playing)}
        ${sw('crate', 'My crate', 'Releases, covers, genres', sh.crate)}
        ${sw('ratings', 'My ratings', '', sh.ratings)}
        ${sw('diary', 'My diary', 'Reviews included', sh.diary)}
        <label class="soc-tg"><span>Appear offline<small>You still see your friends</small></span><input type="checkbox" data-soc-off ${me.off ? 'checked' : ''}></label>
      </div>`;
}

// The header button: a people icon, a green count of friends playing now, a dot for requests waiting.
function socBtnRender() {
  const b = document.getElementById('friendsBtn'); if (!b) return;
  const n = soc.friends.filter(f => f.status === 'playing').length, on = soc.friends.filter(f => f.status !== 'offline').length;
  const cnt = document.getElementById('friendsBtnCount'), req = document.getElementById('friendsBtnReq');
  if (cnt) { cnt.hidden = !n; cnt.textContent = String(n); }
  if (req) req.hidden = !soc.incoming.length;
  b.classList.toggle('soc-live', n > 0);
  b.title = 'Friends' + (soc.friends.length ? ` · ${n} listening, ${on} online` : '') + (soc.incoming.length ? ` · ${soc.incoming.length} request${soc.incoming.length === 1 ? '' : 's'}` : '');
}

function socOpen() { const ov = document.getElementById('friendsOverlay'); if (!ov) return; ov.hidden = false; soc.note = ''; socRender(); socBeat(); socSchedule(); }
function socClose() { const ov = document.getElementById('friendsOverlay'); if (ov) ov.hidden = true; soc.note = ''; socSchedule(); }

async function socDo(action, extra, okNote) {
  try { const d = await socCall(action, extra); soc.note = d.note || okNote || ''; socTake(d); }
  catch (e) { soc.note = ''; soc.err = e.message || String(e); socRender(); }
}

function initSocial() {
  const ov = document.getElementById('friendsOverlay'), btn = document.getElementById('friendsBtn'); if (!ov || !btn) return;
  btn.addEventListener('click', socOpen);
  document.getElementById('friendsClose').addEventListener('click', socClose);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) socClose(); });
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') socClose(); });
  const body = document.getElementById('friendsBody');
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    soc.err = '';
    if (b.hasAttribute('data-soc-retry')) { soc.unsupported = false; soc.lastBeat = 0; socBeat(); }
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
    else if (b.dataset.socOpen) { const it = pbItemOf(b.dataset.socOpen); if (it) { socClose(); openDeck(it); } }
  });
  body.addEventListener('submit', (e) => {
    if (e.target.id !== 'socAddForm') return; e.preventDefault();
    const v = document.getElementById('socAddCode').value.trim(); if (!v) return;
    socDo('socialAdd', { code: v });
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.socShare) socDo('socialSettings', { share: { [t.dataset.socShare]: t.checked } });
    else if (t.hasAttribute('data-soc-off')) socDo('socialSettings', { off: t.checked }, t.checked ? 'Friends now see you as offline.' : 'Friends can see you again.');
    else if (t.id === 'socName' && t.value.trim()) socDo('socialSettings', { name: t.value.trim() }, 'Name saved.');
  });
  setInterval(socWatch, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - soc.lastBeat > 20000) socBeat(); });
  setTimeout(() => { socBeat(); socSchedule(); }, 4000);              // after the crate has started loading
}
initSocial();
