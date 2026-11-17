// (1.135.85) Crate Galaxy · Physics. With it on, the galaxy keeps moving as a live simulation: every link is a spring (tighter the
// more two releases share), crowded stars push apart, each family is held loosely round its own place. Grab a star and pull it: what
// it shares the most with comes along, and when you let go it is thrown and settles back. Works in 2D and 3D (the map view; the
// timeline keeps its years). It rests when nothing is moving, so it costs nothing while the galaxy is still.

function gxPhysSet(on) {
  gx.phys = on == null ? !gx.phys : !!on;
  try { localStorage.setItem('crate_gx_phys_v1', gx.phys ? '1' : '0'); } catch (e) { /* this visit */ }
  const b = gxEl('gxPhysBtn'); if (b) { b.setAttribute('aria-pressed', String(gx.phys)); b.classList.toggle('on', gx.phys); }
  if (gx.phys) gxPhysWake(); else { cancelAnimationFrame(gx.physT); gx.physT = 0; gx.grab = null; }
  gxRenderSide();
}
function gxPhysOk() { return gx.phys && gx.open && gx.mode !== 'time' && gx.pos && gx.graph && gx.layout && gx.layout.iter >= gx.layout.total && gx.pos === gx.layout.pos; }
function gxPhysWake() {                                                // runs until everything has come to rest (and nothing is held)
  gx.physQuiet = 0; if (gx.physT || !gxPhysOk()) return;
  let frame = 0;
  const tick = () => {
    gx.physT = 0; if (!gxPhysOk()) return;
    const N = gx.items.length, heavy = N > 3500;
    const e = (heavy && frame % 2) ? gx.physE || 0 : gxPhysStep(); frame++;
    if (frame % 30 === 0) gxLabels();
    gxDraw();
    if (e < 0.02 * N && !gx.grab) gx.physQuiet++; else gx.physQuiet = 0;
    if (gx.physQuiet < 40) gx.physT = requestAnimationFrame(tick); else gxLabels();
  };
  gx.physT = requestAnimationFrame(tick);
}
// one step; -> the motion left (sum of speeds squared, in link lengths)
function gxPhysStep() {
  const N = gx.items.length, P = gx.pos, d3 = gx.d3, Z = d3 ? (gxZBuild(), gx.posZ) : null, R = GX_LEN * 0.95, L = gx.layout;
  if (!gx.pv || gx.pv.length !== N * 3) gx.pv = new Float64Array(N * 3);
  const V = gx.pv, f = new Float64Array(N * 3), z = (i) => (Z ? Z[i] : 0);
  // crowding: stars closer than R push apart (looked up in a grid, so it stays quick)
  const cell = R, grid = new Map(), key = (a, b) => (a + 32768) * 65536 + (b + 32768);
  for (let i = 0; i < N; i++) { const k = key(Math.floor(P[2 * i] / cell), Math.floor(P[2 * i + 1] / cell)); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(i); }
  for (let i = 0; i < N; i++) {
    const x = P[2 * i], y = P[2 * i + 1], zi = z(i), cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const c = grid.get(key(cx + dx, cy + dy)); if (!c) continue;
      for (const j of c) { if (j <= i) continue; const ex = x - P[2 * j], ey = y - P[2 * j + 1], ez = zi - z(j), d2 = ex * ex + ey * ey + ez * ez; if (d2 >= R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), p = (R - d) / d * 0.22; f[3 * i] += ex * p; f[3 * i + 1] += ey * p; f[3 * i + 2] += ez * p; f[3 * j] -= ex * p; f[3 * j + 1] -= ey * p; f[3 * j + 2] -= ez * p; } }
  }
  // links: springs, shorter and stiffer the more two releases share
  gx.graph.nbr.forEach((l, i) => l.forEach(({ j, s }) => {
    if (j <= i) return; const ex = P[2 * j] - P[2 * i], ey = P[2 * j + 1] - P[2 * i + 1], ez = z(j) - z(i), d = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
    const rest = GX_LEN * (1.25 - s * 0.6), p = Math.max(-GX_LEN, Math.min(GX_LEN * 2.5, d - rest)) / d * 0.11 * (0.3 + s);
    f[3 * i] += ex * p; f[3 * i + 1] += ey * p; f[3 * i + 2] += ez * p; f[3 * j] -= ex * p; f[3 * j + 1] -= ey * p; f[3 * j + 2] -= ez * p;
  }));
  // families held loosely round their places, and a faint pull to the middle
  const famZ = gx.famZ || new Map();
  for (let i = 0; i < N; i++) {
    if (L.fam) { const q = L.fam[i]; f[3 * i] += (L.ax[q] - P[2 * i]) * 0.0025; f[3 * i + 1] += (L.ay[q] - P[2 * i + 1]) * 0.0025; }
    if (Z) f[3 * i + 2] += ((famZ.get(gx.fams.fam[i]) || 0) - Z[i]) * 0.0025;
    f[3 * i] -= P[2 * i] * 0.0002; f[3 * i + 1] -= P[2 * i + 1] * 0.0002; if (Z) f[3 * i + 2] -= Z[i] * 0.0002;
  }
  // move: damped, never faster than a link a step; a held star goes where the pointer is
  const lim = GX_LEN, g = gx.grab; let e = 0;
  for (let i = 0; i < N; i++) {
    if (g && g.i === i && g.to) { const nx = g.to[0], ny = g.to[1], nz = g.to[2];
      V[3 * i] = nx - P[2 * i]; V[3 * i + 1] = ny - P[2 * i + 1]; V[3 * i + 2] = Z ? nz - Z[i] : 0;          // (its speed, kept for the throw)
      P[2 * i] = nx; P[2 * i + 1] = ny; if (Z) Z[i] = nz; continue; }
    for (let a = 0; a < 3; a++) { if (a === 2 && !Z) continue; const k = 3 * i + a; V[k] = Math.max(-lim, Math.min(lim, (V[k] + f[k]) * 0.82)); e += V[k] * V[k]; }
    P[2 * i] += V[3 * i]; P[2 * i + 1] += V[3 * i + 1]; if (Z) Z[i] += V[3 * i + 2];
  }
  gx.physE = e / (GX_LEN * GX_LEN); return gx.physE;
}

// ----- holding a star -----
function gxPhysGrab(i, px, py) { if (!gxPhysOk() || i < 0) return false; gx.grab = { i, px, py, moved: false, to: null }; gxPhysWake(); return true; }
function gxPhysMove(px, py) {                                          // the pointer, as a place in the galaxy at the held star's depth
  const g = gx.grab; if (!g) return; if (Math.abs(px - g.px) + Math.abs(py - g.py) > 3) g.moved = true;
  const i = g.i;
  if (!gx.d3) { const [wx, wy] = gxToWorld(px, py); g.to = [wx, wy, 0]; }
  else {
    const [sx, sy, k] = gxToScreen(i); if (!k) return; const dx = px - sx, dy = py - sy, s = 1 / (gx.cam.z * k);
    const cy = Math.cos(gx.rot.yaw), sy_ = Math.sin(gx.rot.yaw), cp = Math.cos(gx.rot.pitch), sp = Math.sin(gx.rot.pitch);
    g.to = [gx.pos[2 * i] + (dx * cy - dy * sy_ * sp) * s, gx.pos[2 * i + 1] + dy * cp * s, gx.posZ[i] + (-dx * sy_ - dy * cy * sp) * s];
  }
  gxPhysWake();
}
function gxPhysRelease() { const g = gx.grab; gx.grab = null; if (g) gxPhysWake(); return g; }          // (let go: it keeps the speed it had, a throw)
