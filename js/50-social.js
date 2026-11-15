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
  if (d.recStamp && d.recStamp !== soc.recStamp) { soc.recStamp = d.recStamp; socRecsLoad(); }          // (1.123.0) a recommendation came or changed
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
  soc.timer = setTimeout(() => { socBeat().then(() => socFeedLoad()).finally(socSchedule); }, socOpenNow() ? SOC_BEAT_OPEN_MS : SOC_BEAT_MS);
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
// (1.117.0) A cover a friend's data points at is shown only from the image services CRATE itself gets covers from. Any other address
// could be a friend's own server, which would learn when you looked and from where. Otherwise your own copy of that cover is used, if any.
const SOC_IMG_HOSTS = ['mzstatic.com', 'scdn.co', 'spotifycdn.com', 'coverartarchive.org', 'archive.org', 'ytimg.com', 'ggpht.com', 'googleusercontent.com', 'bcbits.com', 'snmc.io', 'sndcdn.com', 'discogs.com', 'fastly.net', 'last.fm', 'lst.fm', 'wikimedia.org', 'dzcdn.net', 'deezer.com', 'tidal.com', 'apple.com'];
function socSafeCover(url) {
  try { const u = new URL(String(url || '')); if (u.protocol !== 'https:') return ''; const h = u.hostname.toLowerCase(); return SOC_IMG_HOSTS.some(d => h === d || h.endsWith('.' + d)) ? u.href : ''; } catch (e) { return ''; }
}
function socCoverFor(url, artist, title) {
  const safe = socSafeCover(url); if (safe) return safe;
  const mine = socMine(artist, title); return mine ? socSafeCover((state.artCache[artKey(mine)] && state.artCache[artKey(mine)].art) || mine.cover) || ((state.artCache[artKey(mine)] && state.artCache[artKey(mine)].art) || mine.cover || '') : '';
}
const SOC_SRC = { spotify: 'Spotify', youtube: 'YouTube', soundcloud: 'SoundCloud', local: 'Soulseek' };

function socFriendRow(f) {
  const np = f.status === 'playing' || f.status === 'online' ? f.np : null, last = f.last;
  let line = '', mine = null;
  if (f.status === 'playing' && np) {
    mine = socMine(np.artist, np.album);
    line = `<div class="soc-np"><span class="soc-eq" aria-hidden="true"><i></i><i></i><i></i></span>`
      + (socCoverFor(np.cover, np.artist, np.album) ? `<img class="soc-cv" src="${escapeHtml(socCoverFor(np.cover, np.artist, np.album))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'soc-cv soc-cv-none'}))">` : '<span class="soc-cv soc-cv-none"></span>')
      + `<span class="soc-np-t"><b>${escapeHtml(np.t || np.album)}</b><span>${escapeHtml(np.artist)}${np.album ? ' · ' + escapeHtml(np.album) : ''}</span></span></div>`;
  } else if (f.status === 'online') {
    line = `<span class="soc-sub">CRATE open${np && np.t ? ' · paused on ' + escapeHtml(np.t) : ''}</span>`;
  } else {
    line = `<span class="soc-sub">${f.seen ? 'Last seen ' + socAgo(f.seen) : 'Offline'}${last && last.album ? ' · ' + escapeHtml(last.album) : ''}</span>`;
  }
  const src = f.status === 'playing' && np && SOC_SRC[np.src] ? `<span class="soc-src">${SOC_SRC[np.src]}</span>` : '';
  return `<div class="soc-row" data-soc-id="${escapeHtml(f.id)}"><button type="button" class="soc-page-btn" data-soc-page="${escapeHtml(f.id)}" title="Open ${escapeHtml(f.name)}'s crate and diary" aria-label="Open ${escapeHtml(f.name)}'s page">${socAvatar(f)}</button><div class="soc-who"><div class="soc-name"><button type="button" class="soc-name-btn" data-soc-page="${escapeHtml(f.id)}" title="Open ${escapeHtml(f.name)}'s crate and diary">${escapeHtml(f.name)}</button>${src}</div>${line}</div><span class="soc-acts">`
    + (mine ? `<button type="button" class="chip-btn soc-open" data-soc-open="${escapeHtml(pbId(mine))}" title="Open ${escapeHtml(mine.title)} in your crate">In your crate</button>` : '')
    + `<button type="button" class="soc-dots" data-soc-menu="${escapeHtml(f.id)}" title="More for ${escapeHtml(f.name)}" aria-label="More for ${escapeHtml(f.name)}" aria-haspopup="menu">\u22ef</button></span></div>`;
}

// (1.125.0) The panel shows one page at a time: the list (Friends / Activity, redrawn with every heartbeat), Add a friend (the person-
// with-a-plus button) or Settings (⚙). Add a friend and Settings are drawn only when they open or a setting changes, so a code or name
// you're typing isn't wiped by the next heartbeat; each has "← Friends" back to the list.
function socPane() { const v = socPos().pane; return v === 'add' || v === 'settings' ? v : 'list'; }
function socRender() {
  const list = document.getElementById('friendsList'), sub = document.getElementById('friendsSub'); if (!list) return;
  const pane = socPane(), box = document.getElementById('friendsSettings');
  list.hidden = pane !== 'list'; if (box) box.hidden = pane === 'list';
  ['friendsAddBtn', 'friendsSetBtn'].forEach(id => { const b = document.getElementById(id); if (b) b.setAttribute('aria-pressed', (id === 'friendsAddBtn' ? pane === 'add' : pane === 'settings') ? 'true' : 'false'); });
  if (pane !== 'list') { if (!soc.setDrawn) socSetRender(); const n = document.getElementById('socPaneNote'); if (n) { n.textContent = soc.err || soc.note || ''; n.hidden = !(soc.err || soc.note); n.classList.toggle('soc-warn', !!soc.err); } }
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
  const unread = socFeedUnread(), view = socPos().view === 'activity' ? 'activity' : 'friends';
  const seg = `<div class="soc-seg" role="tablist" aria-label="Friends or activity"><button type="button" role="tab" data-soc-view="friends" aria-selected="${view === 'friends'}">Friends</button><button type="button" role="tab" data-soc-view="activity" aria-selected="${view === 'activity'}">Activity${unread ? ` <span class="soc-unread">${unread}</span>` : ''}</button></div>`;
  if (view === 'activity') { list.innerHTML = seg + socRecsHtml() + socFeedHtml(); socFeedMarkSeen(); socRecsMarkSeen(); if (!soc.setDrawn) socSetRender(); return; }
  list.innerHTML = seg
    + (soc.note ? `<div class="soc-note" role="status">${escapeHtml(soc.note)}</div>` : '')
    + (soc.err ? `<div class="soc-note soc-warn" role="status">${escapeHtml(soc.err)}</div>` : '')
    + (soc.incoming.length ? `<div class="soc-grp">Requests · ${soc.incoming.length}</div>` + soc.incoming.map(p => `<div class="soc-row">${socAvatar(p)}<div class="soc-who"><div class="soc-name">${escapeHtml(p.name)}</div><span class="soc-sub">wants to be friends</span></div><span class="soc-acts"><button type="button" class="chip-btn soc-acc" data-soc-accept="${escapeHtml(p.id)}">Accept</button><button type="button" class="chip-btn" data-soc-ignore="${escapeHtml(p.id)}">Ignore</button></span></div>`).join('') : '')
    + (soc.friends.length ? grp('Listening now', playing) + grp('Online', online) + grp('Offline', offline)
      : `<div class="soc-empty"><b>No friends yet.</b><p>Send a friend your code, or enter theirs.</p><button type="button" class="chip-btn soc-acc" data-soc-pane="add">Add a friend</button></div>`)
    + (soc.outgoing.length ? `<button type="button" class="soc-sent-link" data-soc-pane="add">${soc.outgoing.length} request${soc.outgoing.length === 1 ? '' : 's'} sent, waiting for an answer</button>` : '');
  if (!soc.setDrawn) socSetRender();
}
function socSetRender() {
  const box = document.getElementById('friendsSettings'), pane = socPane(); if (!box) return;
  if (pane === 'list' || !soc.me) { box.innerHTML = pane === 'list' ? '' : '<div class="soc-empty">Loading…</div>'; soc.setDrawn = false; return; }
  const me = soc.me, sh = me.share || {};
  const head = (t) => `<div class="soc-pane-h"><button type="button" class="soc-back" data-soc-pane="list">← Friends</button><b>${t}</b></div><div class="soc-note" id="socPaneNote" role="status" hidden></div>`;
  if (pane === 'add') {
    box.innerHTML = head('Add a friend') + `<div class="soc-sec">
        <p class="soc-hint">Send a friend your code:</p>
        <div class="soc-code-row"><span class="soc-code" id="socMyCode">${escapeHtml(me.code)}</span><button type="button" class="chip-btn" data-soc-copy>Copy</button></div>
        <p class="soc-hint">Or enter theirs:</p>
        <form class="soc-add" id="socAddForm"><input id="socAddCode" type="text" placeholder="CRT-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Friend's code"><button type="submit" class="chip-btn soc-acc">Send request</button></form>
        <p class="soc-hint">They accept in their own Friends panel. If you both enter each other's code, you're friends at once.</p>
      </div>`
      + (soc.outgoing.length ? `<div class="soc-grp">Sent · ${soc.outgoing.length}</div>` + soc.outgoing.map(p => `<div class="soc-row">${socAvatar(p)}<div class="soc-who"><div class="soc-name">${escapeHtml(p.name)}</div><span class="soc-sub">hasn't answered yet</span></div><span class="soc-acts"><button type="button" class="chip-btn" data-soc-remove="${escapeHtml(p.id)}">Take back</button></span></div>`).join('') : '');
  } else {
    const sw = (k, label, help, v) => `<label class="soc-tg"><span>${label}${help ? `<small>${help}</small>` : ''}</span><input type="checkbox" data-soc-share="${k}" ${v ? 'checked' : ''}></label>`;
    const hidden = (state.raw || []).filter(x => x.friendsHidden).length, custom = Object.keys(me.perFriend || {}).length;
    box.innerHTML = head('Friends settings') + `<div class="soc-sec"><div class="soc-sec-h">You</div>
        <label class="soc-tg"><span>Your name<small>How friends see you</small></span><input id="socName" type="text" value="${escapeHtml(me.name || '')}" maxlength="40" aria-label="Your name, as friends see it"></label>
        <label class="soc-tg"><span>Appear offline<small>Friends see you as offline and nothing you play. You still see them.</small></span><input type="checkbox" data-soc-off ${me.off ? 'checked' : ''}></label>
      </div>
      <div class="soc-sec"><div class="soc-sec-h">What friends can see</div>
        ${sw('playing', 'What I’m playing', '', sh.playing)}
        ${sw('crate', 'My crate', 'Releases, covers, genres', sh.crate)}
        ${sw('ratings', 'My ratings', '', sh.ratings)}
        ${sw('diary', 'My diary', 'Reviews included', sh.diary)}
        <div class="soc-tg soc-tg-static"><span>For one friend<small>Open their page → What they see</small></span><span class="soc-sub">${custom ? custom + ' changed' : 'none changed'}</span></div>
        <div class="soc-tg soc-tg-static"><span>Hidden releases<small>Right-click a release → Hide from friends</small></span><span class="soc-sub">${hidden ? hidden + ' release' + (hidden === 1 ? '' : 's') : 'none'}</span></div>
      </div>
      <div class="soc-sec"><div class="soc-sec-h">Your friend code</div>
        <div class="soc-code-row"><span class="soc-code soc-code-sm">${escapeHtml(me.code)}</span><button type="button" class="chip-btn" data-soc-newcode title="Make a new code. The old one stops working; friends you already have stay friends.">New code</button></div>
        <p class="soc-hint">A new code stops the old one working (say, if it was shared further than you meant). Friends you have stay friends.</p>
      </div>`;
  }
  soc.setDrawn = true;
  const n = document.getElementById('socPaneNote'); if (n) { n.textContent = soc.err || soc.note || ''; n.hidden = !(soc.err || soc.note); n.classList.toggle('soc-warn', !!soc.err); }
}
function socGoPane(pane) { socPosSave({ pane, min: false }); soc.setDrawn = false; soc.note = ''; soc.err = ''; socPlace(); socRender(); if (pane === 'list') socSetRender(); const f = document.querySelector(pane === 'add' ? '#socAddCode' : pane === 'settings' ? '#socName' : '#friendsList .soc-seg button'); if (f && pane !== 'list') f.focus(); }

// (1.125.0) A friend's ⋯ menu in the list: their page, what they see, remove (asks once more).
function socRowMenuClose() { const m = document.getElementById('socRowMenu'); if (m) m.remove(); document.removeEventListener('mousedown', socRowMenuOutside, true); }
function socRowMenuOutside(e) { if (!e.target.closest('#socRowMenu')) socRowMenuClose(); }
function socRowMenuOpen(btn, id) {
  socRowMenuClose();
  const f = (soc.friends || []).find(x => x.id === id); if (!f) return;
  const m = document.createElement('div'); m.id = 'socRowMenu'; m.className = 'fp-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="fp-menu-h"><b>${escapeHtml(f.name)}</b></div><button type="button" role="menuitem" data-srm="page">Open their page</button><button type="button" role="menuitem" data-srm="sees">What they see…</button><button type="button" role="menuitem" class="soc-danger-item" data-srm="remove">Remove from friends</button>`;
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px'; m.style.top = (r.bottom + m.offsetHeight + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - m.offsetHeight - 4)) + 'px';
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-srm]'); if (!b) return;
    if (b.dataset.srm === 'page') { socRowMenuClose(); if (typeof openFriendTab === 'function') openFriendTab(id); }
    else if (b.dataset.srm === 'sees') { socRowMenuClose(); if (typeof openFriendTab === 'function') { openFriendTab(id); setTimeout(() => { const s = document.querySelector('#friendInfoWrap [data-fp="sees"]'); if (s && typeof fpSeesOpen === 'function') fpSeesOpen(s, id); }, 50); } }
    else if (b.dataset.srm === 'remove') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = `Remove ${f.name}? Click again`; return; }
      socRowMenuClose(); socDo('socialRemove', { id }, `${f.name} is no longer a friend.`.replace(/\.\.$/, '.'));
    }
  });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { socRowMenuClose(); btn.focus(); } });
  setTimeout(() => document.addEventListener('mousedown', socRowMenuOutside, true), 0);
  const first = m.querySelector('button'); if (first) first.focus();
}

// The header button: a people icon, a green count of friends playing now, a dot for requests waiting.
function socBtnRender() {
  const b = document.getElementById('friendsBtn'); if (!b) return;
  const n = soc.friends.filter(f => f.status === 'playing').length, on = soc.friends.filter(f => f.status !== 'offline').length;
  const cnt = document.getElementById('friendsBtnCount'), req = document.getElementById('friendsBtnReq');
  if (cnt) { cnt.hidden = !n; cnt.textContent = String(n); }
  if (req) { req.hidden = !soc.incoming.length && !socFeedUnread(); req.classList.toggle('soc-req-feed', !soc.incoming.length); }
  b.classList.toggle('soc-live', n > 0);
  b.setAttribute('aria-pressed', socOpenNow() ? 'true' : 'false');
  b.title = 'Friends' + (soc.friends.length ? ` · ${n} listening, ${on} online` : '') + (soc.incoming.length ? ` · ${soc.incoming.length} request${soc.incoming.length === 1 ? '' : 's'}` : '') + (socFeedUnread() ? ` · ${socFeedUnread()} new in Activity` : '');
}

// ---- (1.117.0) ACTIVITY: what friends logged in their diaries and added to their crates lately (the backend's socialFeed, kept there
// 5 minutes). Asked for when the panel opens, then every 5 minutes while it's open and every 15 otherwise. "New" is anything since
// you last looked at Activity (kept in this browser). Several releases one friend added the same day are one line.
const SOC_FEED_OPEN_MS = 5 * 60000, SOC_FEED_MS = 15 * 60000;
function socFeedSeenAt() { return Number(socPos().feedSeen) || 0; }
function socFeedUnread() { const seen = socFeedSeenAt(); return (soc.feed && seen ? soc.feed.items.filter(i => i.at > seen).length : 0) + (soc.recs || []).filter(r => r.status === 'new').length; }
function socFeedMarkSeen() { if (soc.feed && soc.feed.items.length) { const top = soc.feed.items[0].at; if (top > socFeedSeenAt()) { socPosSave({ feedSeen: top }); socBtnRender(); } } }
async function socFeedLoad(force) {
  if (soc.feedBusy || soc.unsupported || !soc.me || !(soc.friends || []).length) return;
  if (!force && soc.feed && Date.now() - soc.feed.got < (socOpenNow() ? SOC_FEED_OPEN_MS : SOC_FEED_MS)) return;
  soc.feedBusy = true;
  try {
    const d = await socCall('socialFeed', force ? { fresh: true } : {});
    soc.feed = { items: Array.isArray(d.items) ? d.items : [], got: Date.now() };
    if (!socFeedSeenAt() && soc.feed.items.length) socPosSave({ feedSeen: soc.feed.items[0].at });          // the first time: nothing counts as new
    socBtnRender(); if (socOpenNow() && socPos().view === 'activity') socRender();
  } catch (e) { soc.feedErr = e.message || String(e); }
  finally { soc.feedBusy = false; }
}
function socFeedGroups() {
  const out = [];
  (soc.feed ? soc.feed.items : []).forEach(it => {
    const last = out[out.length - 1], day = new Date(it.at).toDateString();
    if (it.kind === 'added' && last && last.kind === 'added' && last.fid === it.fid && last.day === day) { last.more.push(it); return; }
    out.push(Object.assign({ day, more: [] }, it));
  });
  return out;
}
function socFeedHtml() {
  if (!soc.feed) { socFeedLoad(); return '<div class="soc-empty">Loading…</div>'; }
  const groups = socFeedGroups(), seen = Number(socPos().feedSeenShown) || socFeedSeenAt();
  if (!groups.length) return `<div class="soc-empty"><b>Nothing new lately.</b><p>Friends' diary entries and the releases they add show up here (the last 45 days), if they share their diary and crate.</p></div>`;
  return groups.map(g => {
    const f = (soc.friends || []).find(x => x.id === g.fid) || { id: g.fid, name: 'A friend' }, name = escapeHtml(f.name);
    const cover = socCoverFor(g.cover, g.artist, g.title), mine = socMine(g.artist, g.title);
    const rel = `<b>${escapeHtml(g.title)}</b> <span class="soc-feed-by">${escapeHtml(g.artist)}</span>`;
    let what;
    if (g.kind === 'diary') what = `<span class="soc-feed-who">${name}</span> logged ${rel}${g.rating ? ` <span class="soc-feed-stars">${starString(g.rating)}</span>` : ''}${g.text ? `<span class="soc-feed-q">“${escapeHtml(g.text.length > 140 ? g.text.slice(0, 140) + '…' : g.text)}”</span>` : ''}`;
    else if (g.more.length) what = `<span class="soc-feed-who">${name}</span> added ${g.more.length + 1} releases, including ${rel} and <b>${escapeHtml(g.more[0].title)}</b>`;
    else what = `<span class="soc-feed-who">${name}</span> added ${rel}${g.rating ? ` <span class="soc-feed-stars">${starString(g.rating)}</span>` : ''}`;
    return `<button type="button" class="soc-feed-row${g.at > seen ? ' soc-feed-new' : ''}" data-soc-feed="${escapeHtml(g.fid)}" data-soc-feed-kind="${g.kind}" title="Open ${name}'s ${g.kind === 'diary' ? 'diary' : 'crate'}">
        ${socAvatar(Object.assign({}, f, { status: '' }), 'soc-feed-av')}
        <span class="soc-feed-t">${what}<span class="soc-feed-when">${socAgo(g.at)}${mine ? ' · in your crate' : ''}</span></span>
        ${cover ? `<img class="soc-feed-cv" src="${escapeHtml(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<span class="soc-feed-cv soc-cv-none"></span>'}
      </button>`;
  }).join('');
}

// ---- (1.123.0) RECOMMENDATIONS. Right-click a release → Recommend to a friend…: choose friends, add a note, Send. Theirs arrive at the top
// of Activity ("Sam recommends…"), counted as new until you've looked; Add to my crate copies the release in full (tracklist, song links,
// RYM figures), and the sender then sees that you added it. Dismiss takes one away. The backend keeps them in a FriendRecs tab in each
// person's own sheet; the heartbeat says when there's something new, so they're only read then.
async function socRecsLoad() {
  try { const d = await socCall('socialRecs'); soc.recs = d.recs || []; socBtnRender(); if (socOpenNow() && socPos().view === 'activity') socRender(); }
  catch (e) { /* next time the stamp moves */ }
}
function socRecsMarkSeen() {
  if (!(soc.recs || []).some(r => r.status === 'new') || soc.recSeenBusy) return;
  soc.recSeenBusy = true;
  socCall('socialRecSet', { ids: 'allNew', status: 'seen' }).then(d => { soc.recs = d.recs || soc.recs; soc.recStamp = d.recStamp || soc.recStamp; socBtnRender(); }).catch(() => {}).finally(() => { soc.recSeenBusy = false; });
}
function socRecsHtml() {
  const recs = soc.recs || []; if (!recs.length) return '';
  const fr = (id, name) => (soc.friends || []).find(x => x.id === id) || { id, name: name || 'A friend' };
  const cards = recs.filter(r => r.kind === 'rec' && r.status !== 'added').map(r => {
    const f = fr(r.fromId, r.fromName), mine = socMine(r.artist, r.title), cover = socCoverFor(r.cover, r.artist, r.title);
    return `<div class="soc-rec${r.status === 'new' ? ' soc-feed-new' : ''}" data-rec="${escapeHtml(r.id)}">
        ${cover ? `<img class="soc-rec-cv" src="${escapeHtml(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<span class="soc-rec-cv soc-cv-none"></span>'}
        <div class="soc-rec-t"><span class="soc-rec-who">${escapeHtml(f.name)} recommends</span><b>${escapeHtml(r.title)}</b><span class="soc-feed-by">${escapeHtml(r.artist)}${r.year ? ' · ' + escapeHtml(r.year) : ''}</span>
          ${r.note ? `<span class="soc-feed-q">“${escapeHtml(r.note)}”</span>` : ''}<span class="soc-feed-when">${socAgo(r.at)}</span>
          <span class="soc-rec-acts">${mine ? `<button type="button" class="chip-btn" data-rec-open="${escapeHtml(pbId(mine))}" data-rec-id="${escapeHtml(r.id)}">In your crate: open</button>` : `<button type="button" class="chip-btn soc-acc" data-rec-add="${escapeHtml(r.id)}">Add to my crate</button>`}<button type="button" class="chip-btn" data-rec-dismiss="${escapeHtml(r.id)}">Dismiss</button></span></div></div>`;
  }).join('');
  const added = recs.filter(r => r.kind === 'added').slice(0, 10).map(r => { const f = fr(r.fromId, r.fromName);
    return `<div class="soc-feed-row soc-rec-added${r.status === 'new' ? ' soc-feed-new' : ''}">${socAvatar(Object.assign({}, f, { status: '' }), 'soc-feed-av')}<span class="soc-feed-t"><span class="soc-feed-who">${escapeHtml(f.name)}</span> added <b>${escapeHtml(r.title)}</b> <span class="soc-feed-by">${escapeHtml(r.artist)}</span>, which you recommended<span class="soc-feed-when">${socAgo(r.at)}</span></span><button type="button" class="soc-rec-x" data-rec-dismiss="${escapeHtml(r.id)}" title="Clear" aria-label="Clear">×</button></div>`; }).join('');
  return (cards ? `<div class="soc-grp">Recommended to you</div>${cards}` : '') + added + (cards || added ? '<div class="soc-grp">Lately</div>' : '');
}
async function socRecAct(id, status) {
  try { const d = await socCall('socialRecSet', { ids: [id], status }); soc.recs = d.recs || soc.recs; soc.recStamp = d.recStamp || soc.recStamp; socBtnRender(); socRender(); }
  catch (e) { soc.err = e.message || String(e); socRender(); }
}
async function socRecAdd(id, btn) {
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const r = await socCall('socialRecRelease', { id }), cols = Object.assign({ Type: 'Album' }, r.release || {});
    await postUpdate(Object.assign({}, cols, { action: 'addAlbum' }));
    if (typeof scheduleCatalogSync === 'function') scheduleCatalogSync(300);
    if (typeof flashGlobalToast === 'function') flashGlobalToast(`Added ${cols.Title || 'it'} to your crate${r.partial ? ' (basic details: the sender no longer has it)' : ''}.`);
    await socRecAct(id, 'added');
  } catch (e) { btn.disabled = false; btn.textContent = 'Couldn’t add it: try again'; }
}
// The Recommend window: which friends, a note, Send.
function socRecommendClose() { const m = document.getElementById('socRecDlg'); if (m) m.remove(); document.removeEventListener('mousedown', socRecommendOutside, true); }
function socRecommendOutside(e) { if (!e.target.closest('#socRecDlg')) socRecommendClose(); }
function socRecommendOpen(item) {
  socRecommendClose();
  const friends = (soc.friends || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const m = document.createElement('div'); m.id = 'socRecDlg'; m.className = 'soc-rec-dlg'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-labelledby', 'socRecDlgT');
  m.innerHTML = `<div class="soc-rec-dlg-h"><h3 id="socRecDlgT">Recommend</h3><button type="button" class="friends-hbtn" data-rd="close" aria-label="Close">×</button></div>
    <div class="soc-rec-dlg-rel"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.artist)}</span></div>
    ${friends.length ? `<div class="soc-rec-dlg-to" role="group" aria-label="Friends">${friends.map(f => `<label class="soc-rec-dlg-f">${socAvatar(Object.assign({}, f, { status: f.status }), 'soc-feed-av')}<span>${escapeHtml(f.name)}</span><input type="checkbox" value="${escapeHtml(f.id)}" ${friends.length === 1 ? 'checked' : ''}></label>`).join('')}</div>
      <textarea id="socRecNote" maxlength="280" rows="3" placeholder="Why they should hear it (optional)"></textarea>
      <div class="soc-rec-dlg-foot"><span id="socRecMsg" class="soc-sub" role="status"></span><button type="button" class="chip-btn soc-acc" data-rd="send">Send</button></div>`
    : `<p class="soc-hint">Add a friend first (Friends panel → the person-with-a-plus button).</p>`}`;
  document.body.appendChild(m);
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rd]'); if (!b) return;
    if (b.dataset.rd === 'close') return socRecommendClose();
    const to = [...m.querySelectorAll('.soc-rec-dlg-to input:checked')].map(x => x.value), msg = m.querySelector('#socRecMsg');
    if (!to.length) { msg.textContent = 'Choose a friend.'; return; }
    b.disabled = true; msg.textContent = 'Sending…';
    try {
      const d = await socCall('socialRecommend', { to, albumId: item.albumId || '', artist: item.artist, title: item.title, note: m.querySelector('#socRecNote').value });
      const names = to.map(id => (friends.find(f => f.id === id) || {}).name).filter(Boolean);
      if (typeof flashGlobalToast === 'function') flashGlobalToast(`Recommended ${item.title} to ${names.length > 2 ? names.length + ' friends' : names.join(' and ')}.`.replace(/\.\.$/, '.'));
      socRecommendClose();
    } catch (er) { b.disabled = false; msg.textContent = er.message || 'Couldn’t send it. Try again.'; }
  });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') socRecommendClose(); });
  setTimeout(() => document.addEventListener('mousedown', socRecommendOutside, true), 0);
  const first = m.querySelector('input[type="checkbox"]:not(:checked)') || m.querySelector('#socRecNote'); if (first) first.focus();
}

// ---- (1.117.0) HIDE FROM FRIENDS: right-click a release (or several) → Hide from friends. It's saved on the release (a FriendsHidden
// column) and the backend leaves it out of everything friends see: your crate, your diary entries for it, and the activity feed.
async function socSetHidden(items, hide) {
  const list = (items || []).filter(x => x && !!x.friendsHidden !== !!hide); if (!list.length) return;
  let done = 0;
  for (const it of list) {
    try { await postUpdate({ action: 'editAlbum', row: it.row, FriendsHidden: hide ? true : '' }); it.friendsHidden = !!hide; done++; }
    catch (e) { console.warn('Hide from friends', e); }
  }
  const msg = done === list.length ? (hide ? `Hidden from friends: ${done === 1 ? list[0].title : done + ' releases'}.` : `Friends can see ${done === 1 ? list[0].title : done + ' releases'} again.`) : `Saved ${done} of ${list.length}. Try the rest again.`;
  if (typeof flashGlobalToast === 'function') flashGlobalToast(msg);
  if (socOpenNow() && socPane() === 'settings') { soc.setDrawn = false; socSetRender(); }
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

function socOpen() { const pn = document.getElementById('friendsPanel'); if (!pn) return; pn.hidden = false; socPosSave({ open: true, feedSeenShown: socFeedSeenAt() }); soc.note = ''; socPlace(); socRender(); socBtnRender(); socBeat().then(() => socFeedLoad()); socSchedule(); }
function socClose() { const pn = document.getElementById('friendsPanel'); if (pn) pn.hidden = true; socPosSave({ open: false }); soc.note = ''; socBtnRender(); socSchedule(); }
function socToggle() { if (socOpenNow()) { if (socPos().min) socMinToggle(); else socClose(); } else socOpen(); }

async function socDo(action, extra, okNote) {
  try { const d = await socCall(action, extra); soc.note = d.note || okNote || ''; socTake(d); if (/socialSettings|socialNewCode|socialRemove|socialAdd/.test(action) && socPane() !== 'list') { soc.setDrawn = false; socSetRender(); } }
  catch (e) { soc.note = ''; soc.err = e.message || String(e); socRender(); }
}

function initSocial() {
  const pn = document.getElementById('friendsPanel'), btn = document.getElementById('friendsBtn'); if (!pn || !btn) return;
  btn.addEventListener('click', socToggle);
  document.getElementById('friendsClose').addEventListener('click', socClose);
  document.getElementById('friendsMin').addEventListener('click', socMinToggle);
  document.getElementById('friendsAddBtn').addEventListener('click', () => socGoPane(socPane() === 'add' ? 'list' : 'add'));
  document.getElementById('friendsSetBtn').addEventListener('click', () => socGoPane(socPane() === 'settings' ? 'list' : 'settings'));
  { const mb = document.getElementById('menuFriendsSettings'); if (mb) mb.addEventListener('click', () => { const lm = document.getElementById('layoutMenu'); if (lm) lm.hidden = true; if (!socOpenNow()) socOpen(); socGoPane('settings'); }); }
  pn.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.matches('input')) socClose(); });
  socDragInit(pn);
  pn.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !pn.querySelector('.friends-body').contains(b)) return;
    soc.err = '';
    if (b.hasAttribute('data-soc-retry')) { soc.unsupported = false; soc.lastBeat = 0; socBeat(); }
    else if (b.dataset.socPane) socGoPane(b.dataset.socPane);
    else if (b.dataset.socMenu) socRowMenuOpen(b, b.dataset.socMenu);
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
    else if (b.dataset.socView) { socPosSave({ view: b.dataset.socView }); if (b.dataset.socView === 'activity') { socPosSave({ feedSeenShown: socFeedSeenAt() }); socFeedLoad(); } socRender(); }
    else if (b.dataset.recAdd) socRecAdd(b.dataset.recAdd, b);
    else if (b.dataset.recDismiss) socRecAct(b.dataset.recDismiss, 'dismissed');
    else if (b.dataset.recOpen) { const it = pbItemOf(b.dataset.recOpen); if (it) openDeck(it); }
    else if (b.dataset.socFeed) { if (typeof openFriendTab === 'function') openFriendTab(b.dataset.socFeed, b.dataset.socFeedKind === 'diary' ? 'diary' : 'crate'); }
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
