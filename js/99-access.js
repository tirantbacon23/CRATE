// (1.135.225) Asking to use CRATE. Someone whose Google account isn't let in sees, on the sign-in screen, a short form (their name, a
// message) to ask whoever runs it; asking again later shows where their request stands. The people who run it (ADMIN_EMAILS in the Apps
// Script) are told in CRATE when someone has asked, and answer in ⚙ › Access requests: approving lets that account in at once (no
// editing ALLOWED_EMAILS, no new deployment). Needs the Code.gs of 1.135.225.
const acc = { token: '', email: '', name: '', admin: false, list: [], extra: [], told: 0 };
const accEsc = (s) => escapeHtml(String(s == null ? '' : s));
function accPost(body) {
  return fetch(CONFIG.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({}, body, { idToken: acc.token })) }).then(r => r.json());
}
// ----- someone not let in: the form on the sign-in screen -----
function accFormPaint(st) {
  const box = document.querySelector('#authGate .auth-gate-box'); if (!box || !acc.token) return;
  let f = document.getElementById('accForm'); if (!f) { f = document.createElement('div'); f.id = 'accForm'; f.className = 'acc-form'; box.appendChild(f); }
  const when = st && st.at ? new Date(st.at).toLocaleDateString() : '';
  if (st && st.status === 'pending') { f.innerHTML = `<p class="acc-ok"><b>Request sent${when ? ' on ' + accEsc(when) : ''}.</b> You’ll get in once it’s approved: come back and sign in again then.</p><p class="acc-sub">Signed in as ${accEsc(acc.email)}.</p>`; return; }
  if (st && st.status === 'declined') { f.innerHTML = `<p class="acc-no">Your request${when ? ' from ' + accEsc(when) : ''} wasn’t approved.</p><p class="acc-sub">Signed in as ${accEsc(acc.email)}.</p>`; return; }
  if (st && st.status === 'approved') { f.innerHTML = `<p class="acc-ok"><b>You’ve been let in.</b> Sign in again to open CRATE.</p>`; return; }
  f.innerHTML = `<form class="acc-ask" novalidate>
      <h2>Ask to use CRATE</h2>
      <p class="acc-sub">Signed in as ${accEsc(acc.email)}. Whoever runs this CRATE sees your request, and can let you in.</p>
      <label>Your name <input type="text" name="name" maxlength="60" value="${accEsc(acc.name)}" autocomplete="name" required></label>
      <label>A message <span class="acc-opt">(optional)</span> <textarea name="note" rows="3" maxlength="300" placeholder="Who you are, how you know them…"></textarea></label>
      <button type="submit" class="acc-go">Ask for access</button>
      <p class="acc-err" role="alert" hidden></p>
    </form>`;
  f.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault(); const fm = ev.target, b = fm.querySelector('.acc-go'), er = fm.querySelector('.acc-err');
    const name = fm.name.value.trim(); if (!name) { er.textContent = 'Say your name, so they know who’s asking.'; er.hidden = false; return; }
    b.disabled = true; b.textContent = 'Sending…'; er.hidden = true;
    try { const r = await accPost({ action: 'accessRequest', name, note: fm.note.value }); if (!r || !r.access) throw new Error(r && r.error === 'unauthorized' ? 'This CRATE’s backend doesn’t take requests yet (it needs the Code.gs of 1.135.225), or your sign-in ran out: sign in again.' : (r && r.error) || 'No answer'); accFormPaint(r); }
    catch (e) { b.disabled = false; b.textContent = 'Ask for access'; er.textContent = 'Couldn’t send it: ' + String(e.message || e); er.hidden = false; }
  });
}
(function () {
  if (typeof authRefusedMessage === 'function') {
    const base = authRefusedMessage;
    authRefusedMessage = function (data) {
      if (data && data.reason === 'not_allowed') { const t = getStoredIdToken() || '', p = decodeJwtPayload(t) || {}; if (t && String(t).indexOf('cs1.') !== 0) { acc.token = t; acc.email = p.email || ''; acc.name = p.name || p.given_name || ''; } }
      const m = base.apply(this, arguments);
      return data && data.reason === 'not_allowed' && acc.token ? `${acc.email || 'This Google account'} isn’t let into this CRATE yet.` : m;
    };
  }
  if (typeof showAuthGate === 'function') {
    const base = showAuthGate;
    showAuthGate = function () {
      const r = base.apply(this, arguments);
      const f = document.getElementById('accForm'); if (f && !acc.token) f.remove();
      if (acc.token) { accFormPaint(null); accPost({ action: 'accessRequest', check: true }).then(st => { if (st && st.access && st.status !== 'none') accFormPaint(st); }, () => { /* the form stays */ }); }
      return r;
    };
  }
})();

// ----- the people who run it: requests, told and answered -----
async function accLoad(quiet) {
  let r; try { r = await postUpdate({ action: 'accessList' }); } catch (e) { return; }          // (not one of ADMIN_EMAILS, or an older backend: nothing to show)
  if (!r || !r.admin) return;
  acc.admin = true; acc.list = r.requests || []; acc.extra = r.extra || []; accMenu();
  const pend = acc.list.filter(x => x.status === 'pending');
  if (!quiet && pend.length && pend.length !== acc.told) { acc.told = pend.length; flashGlobalToast(`${pend.length === 1 ? `${pend[0].name} asked` : `${pend.length} people asked`} to use CRATE: ⚙ › Access requests.`, { duration: 9000 }); }
  accPaint();
}
function accMenu() {
  if (document.getElementById('menuAccess')) { accMenuLabel(); return; }
  const after = document.getElementById('menuBatchPull') || document.getElementById('menuQuickAdd') || document.getElementById('menuRadio'); if (!after) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'menuAccess'; b.addEventListener('click', accOpen); after.insertAdjacentElement('afterend', b); accMenuLabel();
}
function accMenuLabel() { const b = document.getElementById('menuAccess'); if (!b) return; const n = acc.list.filter(x => x.status === 'pending').length; b.textContent = `Access requests${n ? ` (${n} waiting)` : '…'}`; }
function accOpen() {
  let ov = document.getElementById('accOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'accOverlay'; ov.className = 'bpd-overlay'; document.body.appendChild(ov);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) ov.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) ov.hidden = true; });
    ov.addEventListener('click', async (e) => {
      if (e.target.closest('[data-acc-close]')) { ov.hidden = true; return; }
      const b = e.target.closest('[data-acc]'); if (!b) return;
      b.disabled = true;
      try { const r = await postUpdate({ action: 'accessAnswer', email: b.dataset.email, answer: b.dataset.acc }); acc.list = r.requests || acc.list; acc.extra = r.extra || acc.extra; accMenuLabel(); accPaint(); flashGlobalToast(b.dataset.acc === 'approve' ? `${b.dataset.email} can use CRATE now: they sign in again.` : b.dataset.acc === 'remove' ? `${b.dataset.email} is no longer let in.` : 'Declined.'); }
      catch (er) { b.disabled = false; flashGlobalToast('Couldn’t save that: ' + String(er.message || er)); }
    });
  }
  ov.hidden = false; accPaint(); accLoad(true);
}
function accPaint() {
  const ov = document.getElementById('accOverlay'); if (!ov || ov.hidden) return;
  const ago = (t) => { const d = Math.round((Date.now() - t) / 864e5); return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  const row = (x) => `<div class="acc-row"><div class="acc-who"><b>${accEsc(x.name)}</b> <span class="bpd-mut">${accEsc(x.email)} · ${ago(x.at)}</span>${x.note ? `<p class="acc-note">“${accEsc(x.note)}”</p>` : ''}</div>
    <div class="acc-acts">${x.status === 'pending' ? `<button type="button" class="bpd-btn bpd-go" data-acc="approve" data-email="${accEsc(x.email)}">Approve</button><button type="button" class="bpd-btn" data-acc="decline" data-email="${accEsc(x.email)}">Decline</button>`
      : x.status === 'approved' ? `<span class="bpd-teal">let in</span>${acc.extra.includes(x.email) ? `<button type="button" class="bpd-btn bpd-plain" data-acc="remove" data-email="${accEsc(x.email)}">Remove</button>` : ''}`
      : `<span class="bpd-mut">declined</span><button type="button" class="bpd-btn bpd-plain" data-acc="approve" data-email="${accEsc(x.email)}">Approve after all</button>`}</div></div>`;
  const pend = acc.list.filter(x => x.status === 'pending'), rest = acc.list.filter(x => x.status !== 'pending');
  ov.innerHTML = `<div class="bpd-dialog acc-dialog" role="dialog" aria-modal="true" aria-labelledby="accTitle">
    <div class="bpd-top"><div><h2 id="accTitle">Access requests</h2><p class="bpd-mut">People who signed in with Google and asked to use this CRATE. Approving lets them in straight away; each gets a crate of their own.</p></div><button type="button" class="bpd-x" data-acc-close aria-label="Close">×</button></div>
    <div class="bpd-list acc-list">
      <div class="bpd-sec bpd-pad"><span class="bpd-lbl">WAITING (${pend.length})</span>${pend.length ? pend.map(row).join('') : '<p class="bpd-mut bpd-small">No one is waiting.</p>'}</div>
      ${rest.length ? `<div class="bpd-sec bpd-pad"><span class="bpd-lbl">ANSWERED</span>${rest.map(row).join('')}</div>` : ''}
    </div>
    <div class="bpd-foot"><span class="bpd-mut bpd-small">Accounts in ALLOWED_EMAILS (in the Apps Script) are always let in, and aren’t listed here.</span><span class="bpd-grow"></span><button type="button" class="bpd-btn bpd-go" data-acc-close>Done</button></div>
  </div>`;
}
// asked once CRATE is open (and every half hour while it stays open)
(function () {
  let tries = 0; const go = () => { if (el && el.app && !el.app.hidden && typeof appEntered !== 'undefined' && appEntered) { accLoad(false); setInterval(() => { if (!document.hidden) accLoad(false); }, 30 * 60000); return; } if (++tries < 120) setTimeout(go, 3000); };
  setTimeout(go, 6000);
})();
