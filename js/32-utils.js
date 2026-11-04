// CRATE — small shared helpers (escapeHtml…).
// One part of the page’s script, split by feature. index.html loads these in order as plain (classic) scripts, so they share one global scope
// exactly as when they were one <script>: a later file’s functions exist only once it has loaded, so the app starts in 99-boot.js, after all of them.
/* ---------- Utils ---------- */

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function cssEscape(str) {
  return str.replace(/["\\]/g, '\\$&');
}
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function makeFloatingDraggable(modalEl, handleEl) {
  let isDragging = false, startX, startY, initialX, initialY;

  handleEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return; // Ignore clicks on the close button
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = modalEl.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    document.body.style.userSelect = 'none'; // Prevent text selection while dragging
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    modalEl.style.left = initialX + dx + 'px';
    modalEl.style.top = initialY + dy + 'px';
    modalEl.style.right = 'auto'; // Release anchor
    modalEl.style.bottom = 'auto'; // Release anchor
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
    }
  });
}

async function resolveCoverArt(mbid, rgId) {
  try {
    // 1. Try Release JSON
    let urls = await getCaaJsonUrls(`https://coverartarchive.org/release/${mbid}`);
    if (urls) return urls;
    
    // 2. Try Release Group JSON fallback
    if (rgId && rgId !== mbid) {
      urls = await getCaaJsonUrls(`https://coverartarchive.org/release-group/${rgId}`);
      if (urls) return urls;
    }
  } catch(e) {}
  return null;
}

// 1.29.1 — Looks up a release-group's first-release-date, for when the
// specific *release* buildReleaseResultRow is showing has no date of its
// own (common on MusicBrainz — see the comment where this is called).
// A plain lookup (no inc= needed) returns first-release-date directly.
// Routed through mbFetch like every other MusicBrainz call, so it shares
// the app-wide rate-limit queue/retry instead of risking a 429 of its own.
async function resolveReleaseGroupFirstDate(rgId) {
  try {
    const res = await mbFetch(`https://musicbrainz.org/ws/2/release-group/${rgId}?fmt=json`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CRATEMusicLog/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data['first-release-date'] || null;
  } catch (e) {
    return null;
  }
}

async function getCaaJsonUrls(endpoint) {
  try {
    const res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.images && data.images.length > 0) {
      // Find one explicitly tagged Front, otherwise just take the first image uploaded!
      const front = data.images.find(i => i.front) || data.images[0];
      return {
        thumb: front.thumbnails ? (front.thumbnails['250'] || front.image) : front.image,
        large: front.thumbnails ? (front.thumbnails['500'] || front.thumbnails['1200'] || front.image) : front.image
      };
    }
  } catch (e) {}
  return null;
}
