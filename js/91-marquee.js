// (1.135.151) The player's lines that don't fit (the song, artist, release, extra line) scroll sideways, a marquee: still for a moment, then
// along at an easy reading pace, round again seamlessly. They stop while the pointer is over them, and don't move at all with "reduce
// motion" on (they keep their "…" then). Whatever else fills those lines keeps doing so: each change is measured again.
const MRQ_IDS = ['miniPlayerTitle', 'miniPlayerArtist', 'miniPlayerAlbum', 'miniPlayerExtra'];
const mrqReduce = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const mrqObs = new Map();
let mrqBusy = false;
function mrqCheck(n, force) {
  if (!n || mrqBusy) return;
  const wrapped = n.firstElementChild && n.firstElementChild.classList.contains('mq') && n.childNodes.length === 1;
  if (wrapped && !force) return;          // already scrolling, and nothing new in it
  mrqBusy = true;
  try {
    const html = wrapped ? n.dataset.mqHtml : n.innerHTML;
    if (wrapped) n.innerHTML = html;
    n.classList.remove('mq-on'); n.style.removeProperty('--mq-w'); n.style.removeProperty('--mq-s');
    if (mrqReduce() || !n.offsetParent || !html) return;
    if (n.scrollWidth <= n.clientWidth + 2) return;
    n.dataset.mqHtml = html;
    n.innerHTML = `<span class="mq"><span class="mq-t">${html}</span><span class="mq-t" aria-hidden="true">${html}</span></span>`;
    n.classList.add('mq-on');
    const one = n.querySelector('.mq-t'), w = one ? one.offsetWidth + 36 : 0;          // (36: the gap before it comes round again)
    n.style.setProperty('--mq-w', w + 'px'); n.style.setProperty('--mq-s', Math.max(6, w / 32 + 2.5).toFixed(1) + 's');
  } finally { const o = mrqObs.get(n.id); if (o) o.takeRecords(); mrqBusy = false; }          // (its own changes aren't news)
}
let mrqT = 0;
function mrqAll() { cancelAnimationFrame(mrqT); mrqT = requestAnimationFrame(() => MRQ_IDS.forEach(id => mrqCheck(document.getElementById(id), true))); }
(function () {
  MRQ_IDS.forEach(id => {
    const n = document.getElementById(id); if (!n) return;
    const o = new MutationObserver(() => { if (!mrqBusy) { cancelAnimationFrame(n._mqT); n._mqT = requestAnimationFrame(() => mrqCheck(n)); } });
    o.observe(n, { childList: true, characterData: true, subtree: true }); mrqObs.set(id, o);
  });
  const p = document.getElementById('miniPlayer');
  if (p && typeof ResizeObserver !== 'undefined') { let lastW = 0; new ResizeObserver(() => { const w = p.clientWidth; if (Math.abs(w - lastW) > 2) { lastW = w; mrqAll(); } }).observe(p); }
  if (p) new MutationObserver(mrqAll).observe(p, { attributes: true, attributeFilter: ['class', 'hidden'] });
  window.addEventListener('resize', mrqAll);
  mrqAll();
})();
