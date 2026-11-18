// (1.135.139) The deck's RYM rating is part of the heading now, next to your stars: "RYM 3.71 · 12,345 ratings", read as text. Click it to
// change the numbers (the same two boxes as before, in a small box under it; Enter or leaving them saves). The row it had of its own is gone,
// with its "open ↗" link (Open on… › Rate Your Music already does that) and its "update ↻" button (now ⋯ › Update from RYM).
function drymSetup() {
  if (document.getElementById('deckRymStat')) return true;
  const rate = document.querySelector('#deckOverlay .deck-rating-row'), row = document.getElementById('deckRymRow'), inp = document.getElementById('deckRym'), vot = document.getElementById('deckRymVotes');
  if (!rate || !row || !inp || !vot) return false;
  const wrap = document.createElement('span'); wrap.className = 'drym'; wrap.innerHTML = '<button type="button" class="drym-stat" id="deckRymStat" aria-haspopup="true" aria-expanded="false"></button><span class="drym-edit" id="deckRymEdit" hidden><label><span>RYM rating</span></label><label><span>Ratings</span></label><button type="button" class="drym-done">Done</button></span>';
  rate.appendChild(wrap);
  const [l1, l2] = wrap.querySelectorAll('label'); l1.appendChild(inp); l2.appendChild(vot);
  row.hidden = true; const blk = row.closest('.deck-rym-block'); if (blk) blk.classList.add('drym-gone');
  const stat = wrap.querySelector('.drym-stat'), box = wrap.querySelector('.drym-edit');
  const open = (on) => { box.hidden = !on; stat.setAttribute('aria-expanded', String(on)); if (on) setTimeout(() => { inp.focus(); inp.select(); }, 0); };
  stat.addEventListener('click', (e) => { e.stopPropagation(); open(box.hidden); });
  wrap.querySelector('.drym-done').addEventListener('click', (e) => { e.stopPropagation(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); open(false); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); open(false); } });
  document.addEventListener('pointerdown', (e) => { if (!box.hidden && !e.target.closest('.drym')) open(false); });
  return true;
}
function drymPaint(item) {
  const s = document.getElementById('deckRymStat'); if (!s || !item) return;
  const upd = document.getElementById('deckRymUpdate'), more = document.querySelector('#deckMore .deck-drop-menu');          // (the ⋯ menu is made with the deck's look)
  if (upd && more && upd.parentNode !== more) { upd.textContent = '↻ Update from RYM'; upd.className = 'deck-btn drym-upd'; more.appendChild(upd); }
  const r = Number(item.rymRating) || 0, v = Number(item.rymVotes) || 0;
  s.classList.toggle('none', !r);
  s.innerHTML = r ? `<b>RYM</b><span class="drym-n">${r.toFixed(2)}</span>${v ? `<span class="drym-v">${v.toLocaleString()} rating${v === 1 ? '' : 's'}</span>` : ''}` : '<b>RYM</b><span class="drym-v">add rating</span>';
  s.title = r ? 'Rate Your Music rating. Click to change it' : 'No Rate Your Music rating yet. Click to add one';
  const ed = document.getElementById('deckRymEdit'); if (ed && !ed.contains(document.activeElement)) { ed.hidden = true; s.setAttribute('aria-expanded', 'false'); }
}
(function () {
  const base = deckRymPaint;
  deckRymPaint = function (item) { base.apply(this, arguments); if (drymSetup()) drymPaint(item); };
})();
