/**
 * CRATE — profiles (Profiles.gs)
 *
 * Another file in the same Apps Script project as apps-script-backend.gs (beside Social.gs and Master.gs). A person can keep more than one
 * crate: "Main" (the spreadsheet they've always had) and any profiles they make, each a spreadsheet of its own with its own releases,
 * diary, scrobbles, playlists and settings. CRATE sends the profile it is on with every request (?profile= on a read, "profile" in a
 * save), and apps-script-backend.gs's _getUserSpreadsheet opens that profile's spreadsheet (through _profileSpreadsheet below).
 *
 * WHAT IT KEEPS
 *   PROFILES_<email>          [{ id, name, at }]: the person's profiles besides Main (Main is always there and is never in this list)
 *   PROFILES_MAIN_<email>     what they call Main, when they've renamed it
 *   CRATE_PSS_<email>#<id>    each profile's spreadsheet id (a prefix of its own, so nothing that lists people by CRATE_SS_ sees profiles)
 * Friends and the master crate always read Main.
 * Removing a profile takes it off the list; its spreadsheet stays in Drive (renamed "(removed)"), so nothing is lost by mistake.
 */

const PROFILE_MAX = 12;
function _profProps() { return PropertiesService.getScriptProperties(); }
function _profList(email) { try { const l = JSON.parse(_profProps().getProperty('PROFILES_' + email) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function _profPut(email, list) { _profProps().setProperty('PROFILES_' + email, JSON.stringify(list)); }
function _profClean(s) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40); }
function _profValid(email, id) { id = String(id || ''); return !!id && id !== 'main' && _profList(email).some(p => p.id === id) ? id : ''; }
// The spreadsheet of one profile (called by _getUserSpreadsheet); null means Main.
function _profileSpreadsheet(email, profile) {
  const id = _profValid(email, profile); if (!id) return null;
  const p = _profProps(), key = 'CRATE_PSS_' + email + '#' + id, sid = p.getProperty(key);
  if (sid) { try { return SpreadsheetApp.openById(sid); } catch (e) { /* made again below */ } }
  const name = (_profList(email).find(x => x.id === id) || {}).name || id;
  const ss = SpreadsheetApp.create('CRATE — ' + email + ' — ' + name); p.setProperty(key, ss.getId());
  try { ss.addEditor(email); } catch (e) { /* works through CRATE either way */ }
  return ss;
}
function _profState(email) {
  return { ok: true, profiles: true, main: _profProps().getProperty('PROFILES_MAIN_' + email) || 'Main', list: _profList(email).map(p => ({ id: p.id, name: p.name, at: p.at })) };
}
function _profiles(email, action, payload) {
  try {
    if (action === 'profiles') return _json(_profState(email));
    if (action === 'profileCreate') {
      const name = _profClean(payload.name); if (!name) return _json({ ok: false, profiles: true, error: 'Give the profile a name' });
      const list = _profList(email); if (list.length >= PROFILE_MAX) return _json({ ok: false, profiles: true, error: 'That is the most profiles one person can have (' + PROFILE_MAX + ')' });
      const id = 'p' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
      list.push({ id: id, name: name, at: Date.now() }); _profPut(email, list);
      const ss = _profileSpreadsheet(email, id);
      if (payload.copySettings) {          // the genre taxonomy, artist details and aliases and the like, from the profile it was made from
        try {
          const from = _getUserSpreadsheet(email, payload.from || ''), sh = from.getSheetByName('Settings');
          if (sh) { const c = sh.copyTo(ss); const old = ss.getSheetByName('Settings'); if (old && old.getSheetId() !== c.getSheetId()) ss.deleteSheet(old); c.setName('Settings'); }
        } catch (e) { /* made without them */ }
      }
      return _json(Object.assign(_profState(email), { created: id }));
    }
    if (action === 'profileRename') {
      const name = _profClean(payload.name); if (!name) return _json({ ok: false, profiles: true, error: 'Give the profile a name' });
      if (payload.id === 'main') { _profProps().setProperty('PROFILES_MAIN_' + email, name); return _json(_profState(email)); }
      const list = _profList(email), p = list.find(x => x.id === payload.id); if (!p) return _json({ ok: false, profiles: true, error: 'No such profile' });
      p.name = name; _profPut(email, list);
      try { const sid = _profProps().getProperty('CRATE_PSS_' + email + '#' + p.id); if (sid) SpreadsheetApp.openById(sid).rename('CRATE — ' + email + ' — ' + name); } catch (e) { /* the file keeps its name */ }
      return _json(_profState(email));
    }
    if (action === 'profileDelete') {
      const list = _profList(email), p = list.find(x => x.id === payload.id); if (!p) return _json({ ok: false, profiles: true, error: 'No such profile' });
      _profPut(email, list.filter(x => x.id !== p.id));
      try { const sid = _profProps().getProperty('CRATE_PSS_' + email + '#' + p.id); if (sid) SpreadsheetApp.openById(sid).rename('CRATE — ' + email + ' — ' + p.name + ' (removed)'); } catch (e) { /* left as it is */ }
      return _json(_profState(email));
    }
    return _json({ ok: false, profiles: true, error: 'Unknown profile action' });
  } catch (err) { return _json({ ok: false, profiles: true, error: String(err && err.message || err) }); }
}
