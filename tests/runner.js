// A small test runner: CRATE runs in a hidden frame with the fake back end (mock.js, 4,000 made-up releases), and each test calls its
// functions there. Results show on the page and in window.__testResults ({ passed, failed, skipped, failures }) for a script to read.
const SUITES = [];
let CUR = null;
function suite(name, fn) { CUR = { name, tests: [] }; SUITES.push(CUR); fn(); CUR = null; }
function test(name, fn) { CUR.tests.push({ name, fn }); }
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? what + ': ' : ''}expected ${e}\n         got      ${a}`);
}
function ok(cond, what) { if (!cond) throw new Error(what || 'expected true'); }
class Skip extends Error {}
function skip(why) { throw new Skip(why); }

let app = null;                                   // app('name') -> that global in CRATE's frame (function, const or let)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function startApp() {
  const f = document.createElement('iframe');
  f.src = '../index.html?crate-test&n=400';       // (400 releases is plenty here, and quick)
  document.body.appendChild(f);
  for (let i = 0; i < 240; i++) {
    await sleep(250);
    try { const w = f.contentWindow; if (w && w.eval && w.eval('typeof state === "object" && state.raw && state.raw.length > 0')) { app = (expr) => w.eval(expr); return w; } } catch (e) { /* still loading */ }
  }
  throw new Error('CRATE did not finish loading in 60 s');
}
async function runAll() {
  const sum = document.getElementById('sum'), out = document.getElementById('out');
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { sum.textContent = 'The tests run only on this computer (localhost): they sign in with a fake account and would replace your real sign-in. See README.md.'; sum.className = 'bad'; return; }
  const res = window.__testResults = { passed: 0, failed: 0, skipped: 0, failures: [], done: false };
  try { await startApp(); } catch (e) { sum.textContent = String(e.message); sum.className = 'bad'; res.failures.push({ test: 'start', error: e.message }); res.failed++; res.done = true; return; }
  sum.textContent = 'Running…';
  for (const s of SUITES) {
    const h = document.createElement('h2'); h.textContent = s.name; out.appendChild(h);
    for (const t of s.tests) {
      const row = document.createElement('div'), b = document.createElement('b'); b.textContent = t.name; row.appendChild(b);
      try { await t.fn(); row.className = 't ok'; res.passed++; }
      catch (e) {
        if (e instanceof Skip) { row.className = 't skip'; b.textContent += ' — skipped: ' + e.message; res.skipped++; }
        else { row.className = 't bad'; const pre = document.createElement('pre'); pre.textContent = e && e.message || String(e); row.appendChild(pre); res.failed++; res.failures.push({ test: s.name + ' › ' + t.name, error: e && e.message || String(e) }); }
      }
      out.appendChild(row);
    }
  }
  sum.textContent = `${res.passed} passed${res.failed ? `, ${res.failed} failed` : ''}${res.skipped ? `, ${res.skipped} skipped` : ''}`;
  sum.className = res.failed ? 'bad' : 'ok'; res.done = true;
}
