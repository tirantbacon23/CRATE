// (1.135.155) In the search box, a field that takes words (artist:, genre:, label:, descriptor:, title:, track:, scene:…) gets its quotes
// as you type the colon, the cursor between them: artist:"|". Names with spaces then just work. Typing " just before the closing quote
// steps over it, and Backspace straight after the colon takes both quotes away again. Fields of numbers or yes/no (year:, rating:,
// listened:…) are left as they are. Also in the search panel's own box (js/93).
const SRQ_FIELDS = /(?:^|[\s(])-?(artist|title|album|genre|label|catalog|cat|region|location|track|song|descriptor|descriptors|desc|songdesc|scene|scenes|movement|movements):$/i;
function srqWire(inp, after) {
  if (!inp || inp._srq) return; inp._srq = true;
  inp.addEventListener('beforeinput', (e) => {
    const v = inp.value, a = inp.selectionStart, b = inp.selectionEnd; if (a !== b) return;
    if (e.inputType === 'insertText' && e.data === ':' && SRQ_FIELDS.test(v.slice(0, a) + ':') && v[a] !== '"') {
      e.preventDefault(); inp.value = v.slice(0, a) + ':""' + v.slice(a); inp.setSelectionRange(a + 2, a + 2); if (after) after(); return;
    }
    if (e.inputType === 'insertText' && e.data === '"' && v[a] === '"' && (v.slice(0, a).match(/"/g) || []).length % 2 === 1) { e.preventDefault(); inp.setSelectionRange(a + 1, a + 1); return; }
    if (e.inputType === 'deleteContentBackward' && v.slice(a - 2, a) === ':"' && v[a] === '"') { e.preventDefault(); inp.value = v.slice(0, a - 1) + v.slice(a + 1); inp.setSelectionRange(a - 1, a - 1); if (after) after(); }
  });
}
(function () {
  if (el.searchInput) srqWire(el.searchInput, () => el.searchInput.dispatchEvent(new Event('input', { bubbles: true })));
  // the panel's own box, once it's made
  const t = setInterval(() => { const pi = typeof srchProxyEl !== 'undefined' && srchProxyEl && srchProxyEl.querySelector('input'); if (pi) { clearInterval(t); srqWire(pi, () => pi.dispatchEvent(new Event('input', { bubbles: true }))); } }, 1000);
})();
