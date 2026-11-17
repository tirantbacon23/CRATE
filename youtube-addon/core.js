/* CRATE for YouTube · core.js — what YouTube's own pages say, and what the add-on is allowed to ask for. Plain functions: no network, no page. (Tested on their own.)
   YouTube puts the data of a results page in the page itself, as JSON ("ytInitialData"). It is not a public interface and its shape changes now and then, so every reader here looks for the
   shape it knows first and then for a looser one, and the popup's Diagnose shows what was found, so a page that stops being understood can be repaired from what it reports. */
(function (root) {
  'use strict';
  const VID = /^[A-Za-z0-9_-]{11}$/, LISTID = /^[A-Za-z0-9_-]{13,64}$/;
  const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  function durationMs(t) {                                          // "3:45" -> 225000, "1:02:03" -> 3723000; anything else 0
    const s = String(t == null ? '' : t).trim(); if (!/^\d{1,2}(:\d{2}){1,2}$/.test(s)) return 0;
    const p = s.split(':').map(Number); return (p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) * 1000;
  }
  function text(x) {                                                // YouTube writes text as "abc", {simpleText}, {runs:[{text}]} or {content}
    if (x == null) return ''; if (typeof x === 'string') return x; if (typeof x.simpleText === 'string') return x.simpleText;
    if (Array.isArray(x.runs)) return x.runs.map(r => (r && r.text) || '').join(''); if (typeof x.content === 'string') return x.content; return '';
  }
  function walk(node, fn, key, depth) {
    depth = depth || 0; if (!node || typeof node !== 'object' || depth > 80) return;
    if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) walk(node[i], fn, key, depth + 1); return; }
    fn(node, key); for (const k of Object.keys(node)) walk(node[k], fn, k, depth + 1);
  }
  function overlayDuration(o) { let ms = 0; walk(o.thumbnailOverlays, (n) => { if (!ms && n.thumbnailOverlayTimeStatusRenderer) ms = durationMs(text(n.thumbnailOverlayTimeStatusRenderer.text)); }); return ms; }
  function videoOf(o) {
    if (typeof o.videoId !== 'string' || !VID.test(o.videoId)) return null;
    const title = clean(text(o.title)); if (!title) return null;
    const ms = durationMs(text(o.lengthText)) || overlayDuration(o) || (Number(o.lengthSeconds) > 0 ? Number(o.lengthSeconds) * 1000 : 0);
    const badges = JSON.stringify(o.ownerBadges || []);
    return { id: o.videoId, title, channel: clean(text(o.ownerText) || text(o.longBylineText) || text(o.shortBylineText)), durationMs: ms, official: /OFFICIAL_ARTIST|VERIFIED_ARTIST/.test(badges) };
  }
  // (1.5.3) YouTube's newer layout: a result is a "lockupViewModel" (contentId = the video's id, the title in metadata.lockupMetadataViewModel,
  // the channel in its first metadata row, the length as a badge on the thumbnail) instead of a "videoRenderer". Both are read.
  function lockupVideoOf(o) {
    if (!o || typeof o.contentId !== 'string' || !VID.test(o.contentId)) return null;
    const ct = String(o.contentType || ''); if (ct && !/VIDEO/.test(ct)) return null;
    const md = (o.metadata && o.metadata.lockupMetadataViewModel) || {}, title = clean(text(md.title)); if (!title) return null;
    const rows = (md.metadata && md.metadata.contentMetadataViewModel && md.metadata.contentMetadataViewModel.metadataRows) || [];
    const channel = rows.length ? clean((rows[0].metadataParts || []).map(p => text(p.text)).filter(Boolean)[0] || '') : '';
    let ms = 0; walk(o.contentImage, (n) => { if (ms) return; const t = typeof n.text === 'string' ? n.text : (n.text && typeof n.text.content === 'string' ? n.text.content : ''); if (t) ms = durationMs(t); });
    const badges = JSON.stringify(md);
    return { id: o.contentId, title, channel, durationMs: ms, official: /OFFICIAL_ARTIST|VERIFIED_ARTIST|CHECK_CIRCLE_FILLED|AUDIO_BADGE/.test(badges) };
  }
  function videosFrom(data) {                                       // a video search: the results, in the order YouTube gave them
    const strict = [], loose = [], seen = new Set(), seenL = new Set();
    walk(data, (o, key) => {
      if (key === 'lockupViewModel') { const lv = lockupVideoOf(o); if (lv && !seen.has(lv.id)) { seen.add(lv.id); strict.push(lv); } return; }
      const v = videoOf(o); if (!v) return;
      if (key === 'videoRenderer') { if (!seen.has(v.id)) { seen.add(v.id); strict.push(v); } }
      else if (!['childVideoRenderer', 'playlistVideoRenderer', 'compactVideoRenderer', 'gridVideoRenderer'].includes(key) && (v.durationMs || v.channel) && !seenL.has(v.id)) { seenL.add(v.id); loose.push(v); }
    });
    return (strict.length ? strict : loose).slice(0, 25);
  }
  const countOf = (x) => { const m = /(\d[\d,]*)\s*(?:videos?|songs?|tracks?)/i.exec(String(x || '')); return m ? Number(m[1].replace(/,/g, '')) : 0; };
  function playlistsFrom(data) {                                    // a playlist search (an album is usually a playlist): id, title, channel, how many videos
    const out = [], seen = new Set();
    const add = (id, title, channel, count) => { if (typeof id !== 'string' || !LISTID.test(id) || /^RD/.test(id) || seen.has(id) || !clean(title)) return; seen.add(id); out.push({ id, title: clean(title), channel: clean(channel), count: count || 0 }); };
    walk(data, (o, key) => {
      if (key === 'playlistRenderer' && typeof o.playlistId === 'string') add(o.playlistId, text(o.title), text(o.longBylineText) || text(o.shortBylineText), Number(o.videoCount) || countOf(text(o.videoCountText)));
      else if (key === 'lockupViewModel' && typeof o.contentId === 'string' && (/PLAYLIST/.test(String(o.contentType || '')) || /^(PL|OLAK5uy_)/.test(o.contentId))) {
        const md = (o.metadata && o.metadata.lockupMetadataViewModel) || {}, strings = [];
        walk(md, (m) => { if (typeof m.content === 'string') strings.push(m.content); }); walk(o.contentImage, (m) => { if (typeof m.text === 'string') strings.push(m.text); else if (m.text && typeof m.text.content === 'string') strings.push(m.text.content); });
        const rows = (md.metadata && md.metadata.contentMetadataViewModel && md.metadata.contentMetadataViewModel.metadataRows) || [];
        const ch = rows.length ? ((rows[0].metadataParts || []).map(p => text(p.text)).filter(Boolean)[0] || '') : '';
        add(o.contentId, text(md.title), ch, strings.map(countOf).find(Boolean) || 0);
      }
    });
    return out.slice(0, 15);
  }
  function playlistVideosFrom(data) {                               // the videos of one playlist page, in playlist order
    const out = [], seen = new Set();
    walk(data, (o, key) => {
      if (key !== 'playlistVideoRenderer' || typeof o.videoId !== 'string' || !VID.test(o.videoId)) return;
      const title = clean(text(o.title)); if (!title || /^\[?(deleted|private) video\]?$/i.test(title) || seen.has(o.videoId)) return; seen.add(o.videoId);
      out.push({ id: o.videoId, title, channel: clean(text(o.shortBylineText) || text(o.longBylineText)), durationMs: durationMs(text(o.lengthText)) || (Number(o.lengthSeconds) > 0 ? Number(o.lengthSeconds) * 1000 : 0), index: out.length + 1 });
    });
    if (!out.length) walk(data, (o, key) => {          // (1.5.3) a playlist page in the newer layout: its videos as lockups, in order
      if (key !== 'lockupViewModel') return; const v = lockupVideoOf(o); if (!v || seen.has(v.id) || /^\[?(deleted|private) video\]?$/i.test(v.title)) return; seen.add(v.id);
      out.push({ id: v.id, title: v.title, channel: v.channel, durationMs: v.durationMs, index: out.length + 1 });
    });
    return out.slice(0, 100);
  }
  function balanced(s, i) {                                         // the JSON object that starts at s[i] === "{" (braces inside strings don't count)
    let depth = 0, inStr = false, esc = false;
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return s.slice(i, k + 1); }
    }
    return '';
  }
  function extractInitialData(src, name) {                                // the page's data object out of a script's text ("var ytInitialData = {…};" or window["ytInitialData"] = {…};), or null
    const s = String(src || ''), nm = name || 'ytInitialData'; let at = s.indexOf(nm);          // name: 'ytInitialPlayerResponse' for a video page's player data
    while (at >= 0) {
      const b = s.indexOf('{', at); if (b < 0) return null;
      if (/^[\s"'\]=]*$/.test(s.slice(at + nm.length, b))) { const j = balanced(s, b); if (j) { try { return JSON.parse(j); } catch (e) { /* try the next mention */ } } }
      at = s.indexOf(nm, at + 1);
    }
    return null;
  }
  function videoInfoFrom(data, player) {                            // a video's own page (1.4.0): its title, channel, length, description and chapters, for a full-release video's song times
    const d = (player && player.videoDetails) || {}, id = typeof d.videoId === 'string' && VID.test(d.videoId) ? d.videoId : '';
    let title = clean(d.title), channel = clean(d.author), description = typeof d.shortDescription === 'string' ? d.shortDescription : '';
    if (data && (!title || !description)) walk(data, (o, key) => {
      if (key === 'videoPrimaryInfoRenderer' && !title) title = clean(text(o.title));
      if (key === 'videoSecondaryInfoRenderer' && !description) description = text(o.attributedDescription) || text(o.description) || '';
    });
    const chapters = [], seen = new Set();
    if (data) walk(data, (o, key) => {                              // the chapters YouTube shows under the video: their titles and where they start
      if (key !== 'chapterRenderer') return;
      const t = clean(text(o.title)), ms = Number(o.timeRangeStartMillis);
      if (t && Number.isFinite(ms) && ms >= 0 && !seen.has(ms)) { seen.add(ms); chapters.push({ start: Math.round(ms / 1000), title: t }); }
    });
    chapters.sort((a, b) => a.start - b.start);
    const ms = Number(d.lengthSeconds) > 0 ? Number(d.lengthSeconds) * 1000 : 0;
    if (!id && !title) return [];
    return [{ id, title, channel, durationMs: ms, description: String(description).slice(0, 8000), chapters: chapters.slice(0, 200) }];
  }
  function pageReason(info) {                                       // '' for an ordinary page; 'consent' (the cookie question) or 'check' (unusual traffic, a captcha)
    let host = '', path = ''; try { const u = new URL(info.url); host = u.hostname; path = u.pathname; } catch (e) { /* no address */ }
    const t = String(info.title || '') + ' ' + String(info.text || '');
    if (/(^|\.)consent\.(youtube|google)\.com$/.test(host) || /before you continue to youtube/i.test(t)) return 'consent';
    if (/^\/sorry\b/.test(path) || /unusual traffic|are you a robot|verify (that )?you('| a)re (not a )?(robot|human)|captcha/i.test(t)) return 'check';
    return '';
  }
  const queryOk = (q) => { const s = clean(q); return s.length >= 1 && s.length <= 200 ? s : ''; };
  function searchUrl(q, kind) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(clean(q)).replace(/%20/g, '+') + (kind === 'playlist' ? '&sp=EgIQAw%253D%253D' : '&sp=EgIQAQ%253D%253D'); }
  const playlistUrl = (id) => 'https://www.youtube.com/playlist?list=' + id;
  const videoUrl = (id) => 'https://www.youtube.com/watch?v=' + id;
  const urlOk = (u) => /^https:\/\/www\.youtube\.com\/(?:results\?search_query=[A-Za-z0-9%+._~!*'()-]{1,700}(?:&sp=[A-Za-z0-9%]{1,40})?|playlist\?list=[A-Za-z0-9_-]{13,64}|watch\?v=[A-Za-z0-9_-]{11})$/.test(String(u || ''));
  function validOp(op) {                                            // what CRATE may ask for, cleaned; null if it is anything else
    if (!op || typeof op !== 'object') return null;
    if (op.kind === 'search-video' || op.kind === 'search-playlist') { const q = queryOk(op.q); return q ? { kind: op.kind, q } : null; }
    if (op.kind === 'playlist') return typeof op.id === 'string' && LISTID.test(op.id) && !/^RD/.test(op.id) ? { kind: 'playlist', id: op.id } : null;
    if (op.kind === 'video') return typeof op.id === 'string' && VID.test(op.id) ? { kind: 'video', id: op.id } : null;
    return null;
  }
  const cacheKey = (op) => op.kind + '|' + (op.kind === 'playlist' || op.kind === 'video' ? op.id : op.q.toLowerCase());
  const api = { durationMs, text, walk, videosFrom, playlistsFrom, playlistVideosFrom, videoInfoFrom, extractInitialData, pageReason, queryOk, searchUrl, playlistUrl, videoUrl, urlOk, validOp, cacheKey, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CrateYt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
