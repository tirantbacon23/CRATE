// CRATE — start. Every other file has loaded by now, so each function and constant the start-up path reaches exists.
// (When the script was one file, startApp() ran partway down it and relied on hoisting; split, it has to come last.)
startApp();
// (1.135.29) Right-click does something only where CRATE has a menu for it: anywhere else the browser's own menu (Back, Reload, Inspect…)
// no longer opens. Kept: text you can type in (paste), text you've selected (copy), and real links (open in a new tab). Added once
// everything else is wired, so every one of CRATE's own right-click menus has had its turn first.
window.addEventListener('load', () => {
  document.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return;                                   // one of CRATE's menus took it
    const t = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement; if (!t) return;
    if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const a = t.closest('a[href]'); if (a && !/^#|^javascript:/i.test(a.getAttribute('href') || '#')) return;
    const sel = window.getSelection && window.getSelection(); if (sel && !sel.isCollapsed && String(sel).trim()) return;
    e.preventDefault();
  });
}, { once: true });
