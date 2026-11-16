'use strict';
/* =========================================================
   GFX.props: environment prop library (stylised low-poly, abandoned town at night)
   - Every builder: GFX.props.name(opts) -> THREE.Group, origin = footprint centre on the ground, +Y up, metres.
   - Long axis along X unless noted; "front" of furniture-type props (vending, fridge, gacha, acUnit, kiosk...) faces +Z.
   - Only depends on the globals THREE (r128) and GFX (kit.js). Variation comes from opts.seed via GFX.rng.
   - GFX.propAnchors lists where the real light sources should go (local coordinates).
   ========================================================= */
(() => {
  const PI = Math.PI, HP = PI / 2;

  /* ---------- colour helpers (sRGB hex ints; kit converts to linear) ---------- */
  const ch = (c, s) => (c >> s) & 255;
  const cl = v => Math.max(0, Math.min(255, Math.round(v)));
  const mix = (a, c, t) => (cl(ch(a, 16) + (ch(c, 16) - ch(a, 16)) * t) << 16) | (cl(ch(a, 8) + (ch(c, 8) - ch(a, 8)) * t) << 8) | cl(ch(a, 0) + (ch(c, 0) - ch(a, 0)) * t);
  const dk = (c, k) => mix(0, c, k);          // k = 1 unchanged, 0 black
  const lt = (c, k) => mix(c, 0xffffff, k);   // k = 0 unchanged, 1 white

  const P = {
    concrete: 0x9a9a92, rust: 0x8a4a3c, teal: 0x3d6c8a, olive: 0x5a7a4a, olive2: 0x6f7a5a, mustard: 0xc9a227,
    brick: 0xb8453a, wood: 0x6b4a2f, steel: 0x8d9097, dark: 0x23262c, dirt: 0x4a4036, tyre: 0x1c1d20,
    glass: 0x8ea4b4, black: 0x141619, cream: 0xd8d4c8, rubber: 0x1b1d21,
    sodium: 0xffb768, cool: 0xdfe8ff, cyan: 0x5fe3d0, amber: 0xf0a23b
  };

  /* ---------- seeded random ---------- */
  const rnd = (opts, def) => {
    const g = GFX.rng(opts && opts.seed !== undefined ? opts.seed : def);
    const f = () => g();
    f.r = (a, b) => a + (b - a) * g();
    f.i = (a, b) => a + Math.min(b - a, Math.floor((b - a + 1) * g()));
    f.pick = a => a[Math.min(a.length - 1, Math.floor(g() * a.length))];
    f.chance = p => g() < p;
    return f;
  };
  const opt = (o, k, d) => (o && o[k] !== undefined ? o[k] : d);

  /* ---------- geometry helpers ---------- */
  const arc = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
  const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const scalePts = (pts, k) => { let cx = 0, cy = 0; pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length; return pts.map(p => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]); };

  /** local frame on the XY segment p->q (at depth z): local x along the segment, local y = left normal */
  function frame(b, p, q, z, fn) {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    b.at((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, z, [0, 0, Math.atan2(dy, dx)], () => fn(Math.hypot(dx, dy)));
  }
  /** box lying along segment p->q in the XY plane; th = thickness along the left normal, d = depth along Z, off = centre offset along the normal */
  function slab(b, p, q, th, d, col, z = 0, off = 0, o = {}) { frame(b, p, q, z, L => b.box(L, th, d, col, 0, off, 0, o)); }
  /** rectangular picture-frame (4 bars) in the XY plane */
  function ring(b, w, h, t, d, col, x, y, z, o = {}) {
    b.box(w, t, d, col, x, y + h / 2 - t / 2, z, o); b.box(w, t, d, col, x, y - h / 2 + t / 2, z, o);
    b.box(t, h - 2 * t, d, col, x - w / 2 + t / 2, y, z, o); b.box(t, h - 2 * t, d, col, x + w / 2 - t / 2, y, z, o);
  }
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _u = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
  /** cylinder from 3D point p (radius r0) to q (radius r1) */
  function rod(b, p, q, r0, r1, col, o = {}) {
    _d.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]); const L = _d.length(); if (L < 1e-5) return; _d.multiplyScalar(1 / L);
    _q.setFromUnitVectors(_u, _d); _e.setFromQuaternion(_q, 'XYZ');
    b.cyl(r1, r0, L, col, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, Object.assign({ seg: 6 }, o, { r: [_e.x, _e.y, _e.z] }));
  }
  /** chain of rods through pts (hoses, arms, branches); segments overlap slightly to hide joints */
  function path(b, pts, r0, r1, col, o = {}) {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[i + 1], ra = r0 + (r1 - r0) * i / n, rc = r0 + (r1 - r0) * (i + 1) / n;
      let e = c;
      if (i < n - 1) { const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], l = Math.hypot(dx, dy, dz) || 1, k = rc * 0.7 / l; e = [c[0] + dx * k, c[1] + dy * k, c[2] + dz * k]; }
      rod(b, a, e, ra, rc, col, o);
    }
  }
  /** jittered icosahedron (faceted blob) */
  function blob(r, R, amt, detail = 1) {
    const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, m = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = Math.round(p.getX(i) * 1000) + ',' + Math.round(p.getY(i) * 1000) + ',' + Math.round(p.getZ(i) * 1000);
      if (!m.has(key)) m.set(key, 1 + (R() - 0.5) * amt);
      const k = m.get(key); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    return g;
  }
  /** car-type wheel; axle along Z. flat = deflated tyre */
  function wheel(b, x, z, r, w, flat, rim) {
    const cy = flat ? r * 0.8 : r;
    b.use('matte');
    b.at(x, cy, z, null, () => {
      b.cyl(r, r, w, P.tyre, 0, 0, 0, { axis: 'z', seg: 14 });
      b.cyl(r * 0.88, r * 0.88, w + 0.016, 0x2a2b2f, 0, 0, 0, { axis: 'z', seg: 14 });
    }, flat ? [1.1, 0.8, 1.06] : 1);
    b.use('metal');
    b.cyl(r * 0.6, r * 0.6, w + 0.03, rim, x, cy, z, { axis: 'z', seg: 10 });
    b.cyl(r * 0.2, r * 0.25, w + 0.06, dk(rim, 0.65), x, cy, z, { axis: 'z', seg: 6 });
    b.use('matte');
  }
  /** star of crack lines in the local XZ plane (y = surface normal) */
  function cracks(b, R, n, len, col) {
    for (let i = 0; i < n; i++) { const a = R() * PI * 2, l = len * R.r(0.35, 1); b.box(l, 0.004, 0.006, col, Math.cos(a) * l / 2, 0, Math.sin(a) * l / 2, { r: [0, -a, 0] }); }
    b.box(0.05, 0.004, 0.05, col, 0, 0, 0, { r: [0, 0.4, 0] });
  }
  /** rust / grime patches on a side face at |z| = face (both sides chosen randomly) */
  function sidePatches(b, R, n, face, x0, x1, y0, y1, col, avoid) {
    for (let i = 0; i < n; i++) {
      const x = R.r(x0, x1), y = R.r(y0, y1); if (avoid && avoid(x, y)) continue;
      const s = R() < 0.5 ? -1 : 1;
      b.box(R.r(0.08, 0.32), R.r(0.04, 0.14), 0.006, col, x, y, s * (face + 0.004), { c2: dk(col, 0.7) });
    }
  }
  /** dent: darker patch + a pale scratch, on side face at z = s*face */
  function dent(b, x, y, face, s, col) {
    b.box(0.36, 0.17, 0.006, dk(col, 0.64), x, y, s * (face + 0.004), { c2: dk(col, 0.82) });
    b.box(0.3, 0.008, 0.008, lt(col, 0.45), x + 0.03, y + 0.03, s * (face + 0.01), { r: [0, 0, 0.18] });
    b.box(0.18, 0.006, 0.008, lt(col, 0.45), x - 0.05, y - 0.04, s * (face + 0.01), { r: [0, 0, -0.1] });
  }
  /** licence plate on a face pointing along +X (dir = 1) or -X (dir = -1) */
  function plate(b, x, y, dir) {
    b.box(0.012, 0.11, 0.34, 0xcac3a5, x, y, 0);
    b.box(0.006, 0.045, 0.25, 0x2b2e33, x + dir * 0.009, y, 0);
  }
  /** glass shards along a window sill (in the side plane at z) */
  function shards(b, R, x0, x1, y, z) {
    b.use('glass');
    for (let i = 0; i < 4; i++) { const x = R.r(x0, x1), w = R.r(0.04, 0.1); b.prism([[0, 0], [w, 0], [R.r(0, w), R.r(0.04, 0.12)]], 0.008, P.glass, x, y, z); }
    b.use('matte');
  }
  /** rear-view mirror pointing out along s*Z */
  function mirror(b, x, y, z, s, col, big) {
    const h = big ? 0.24 : 0.11, w = big ? 0.12 : 0.15;
    b.box(0.06, 0.04, 0.1, P.rubber, x, y - 0.02, s * (z - 0.05));
    b.box(0.09, h, w, col, x, y + (big ? -0.05 : 0.02), s * (z + w / 2 - 0.02), { taper: [0.9, 0.95] });
    b.box(0.006, h - 0.03, w - 0.03, 0x3a4652, x - 0.048, y + (big ? -0.05 : 0.02), s * (z + w / 2 - 0.02));
  }

  const CAR_COLS = [0x56677a, 0x6e3a3a, 0x6f7a5a, 0x8d9097, 0x3d4f63, 0x9c8f72, 0x4a5560, 0x7a5a3a];
  const crackC = 0xc4ced6;

  GFX.props = {
    /* =================================================== vehicles */
    car(opts = {}) {
      const R = rnd(opts, 101), b = new GFX.Builder();
      const col = opt(opts, 'color', R.pick(CAR_COLS)), wreck = opt(opts, 'wreck', true);
      const grime = mix(col, P.dirt, 0.6), dust = mix(col, 0xa39b88, 0.35);
      const W = 1.74, hw = W / 2, BV = 0.035;
      const prof = [[-2.02, 0.32], [-1.74, 0.25], ...arc(-1.3, 0.34, 0.44, PI, 0, 6), [-0.86, 0.25], [0.86, 0.25], ...arc(1.3, 0.34, 0.44, PI, 0, 6),
        [1.74, 0.25], [2.02, 0.32], [2.05, 0.5], [2.0, 0.72], [1.86, 0.79], [0.8, 0.9], [-1.5, 0.93], [-1.94, 0.9], [-2.04, 0.74], [-2.05, 0.5]];
      b.use('matte').prism(prof, W, col, 0, 0, 0, { bevel: BV, c2: grime });
      // greenhouse: dark core + glass + body-coloured pillars and roof
      const A0 = [0.88, 0.9], A1 = [0.1, 1.35], C1 = [-0.85, 1.36], C0 = [-1.58, 0.9];
      b.prism([C0, A0, A1, C1], 1.44, 0x15181c);
      const hoodOpen = wreck && R.chance(0.55), missing = wreck ? R.i(0, 3) : -1;
      b.use('glass');
      const ws0 = lerp2(A1, A0, 0.04), ws1 = lerp2(A1, A0, 0.93);
      slab(b, ws0, ws1, 0.016, 1.34, P.glass, 0, 0.012);
      slab(b, lerp2(C0, C1, 0.08), lerp2(C0, C1, 0.95), 0.016, 1.3, P.glass, 0, 0.012);
      const panes = [[[-0.33, 0.97], [0.66, 0.97], [0.09, 1.31], [-0.33, 1.31]], [[-1.3, 0.97], [-0.41, 0.97], [-0.41, 1.31], [-0.86, 1.31]]];
      [-1, 1].forEach((s, si) => panes.forEach((pp, pi) => {
        if (si * 2 + pi === missing) { shards(b, R, pp[0][0] + 0.05, pp[1][0] - 0.12, 0.97, s * 0.727); return; }
        b.use('glass').prism(pp, 0.01, P.glass, 0, 0, s * 0.727);
      }));
      b.use('matte');
      for (const s of [-1, 1]) {
        slab(b, A1, A0, 0.05, 0.07, col, s * 0.695, 0.02);
        slab(b, C0, C1, 0.06, 0.07, col, s * 0.695, 0.024);
        b.box(0.1, 0.44, 0.03, col, -0.37, 1.13, s * 0.728);
        b.box(2.25, 0.03, 0.03, P.rubber, -0.345, 0.958, s * 0.735);
        // seams, handles, rocker
        b.box(0.012, 0.5, 0.006, 0x1a1c20, 0.74, 0.67, s * 0.873);
        b.box(0.012, 0.62, 0.006, 0x1a1c20, -0.37, 0.62, s * 0.873);
        b.box(0.012, 0.14, 0.006, 0x1a1c20, -1.38, 0.86, s * 0.873);
        b.use('metal').box(0.13, 0.025, 0.02, P.steel, 0.42, 0.8, s * 0.878).box(0.13, 0.025, 0.02, P.steel, -0.7, 0.8, s * 0.878).use('matte');
        b.box(1.66, 0.06, 0.02, P.rubber, 0, 0.29, s * 0.872);
        mirror(b, 0.72, 0.99, 0.87, s, col, false);
        // lights
        b.use('gloss');
        b.box(0.06, 0.1, 0.32, wreck && s < 0 && R.chance(0.5) ? 0x2a2e33 : 0xc9d2d8, 2.05, 0.65, s * 0.58);
        b.box(0.05, 0.06, 0.1, 0xb8742a, 2.04, 0.62, s * 0.8);
        b.box(0.06, 0.12, 0.34, 0x7a1c1c, -2.05, 0.78, s * 0.56);
        b.use('matte');
      }
      // roof (dusty top)
      b.box(0.99, 0.05, 1.5, dust, -0.375, 1.37, 0, { taper: [0.97, 0.95], c2: col });
      // hood (ajar on some wrecks)
      const H0 = [0.8, 0.935], H1 = [1.86, 0.825], ha = Math.atan2(H1[1] - H0[1], H1[0] - H0[0]), hl = Math.hypot(H1[0] - H0[0], H1[1] - H0[1]);
      if (hoodOpen) slab(b, H0, H1, 0.006, 1.5, 0x0f1012, 0, 0.004);
      b.at(H0[0], H0[1], 0, [0, 0, ha + (hoodOpen ? 0.11 : 0)], () => {
        b.box(hl, 0.03, 1.62, dust, hl / 2, 0.02, 0, { c2: col });
        b.box(0.03, 0.012, 1.0, dk(col, 0.7), hl * 0.5, 0.04, 0);
      });
      // front / rear
      b.box(0.16, 0.2, 1.8, 0x2a2c31, 2.06, 0.4, 0, { c2: 0x18191c });
      b.box(0.16, 0.2, 1.8, 0x2a2c31, -2.06, 0.4, 0, { c2: 0x18191c });
      b.box(0.05, 0.13, 0.8, 0x15171a, 2.07, 0.6, 0);
      for (let i = 0; i < 3; i++) b.box(0.056, 0.012, 0.76, 0x3a3d42, 2.07, 0.56 + i * 0.04, 0);
      plate(b, 2.146, 0.4, 1); plate(b, -2.146, 0.4, -1);
      b.use('metal').cyl(0.03, 0.03, 0.18, 0x3a3c40, -2.08, 0.24, 0.5, { axis: 'x', seg: 6 }).use('matte');
      // wheels
      const flat = wreck ? R.i(0, 3) : -1;
      [[1.3, 1], [1.3, -1], [-1.3, 1], [-1.3, -1]].forEach(([x, s], i) => wheel(b, x, s * 0.76, 0.34, 0.22, i === flat, 0x7d8188));
      // wear
      const inArch = x => Math.abs(Math.abs(x) - 1.3) < 0.52;
      sidePatches(b, R, wreck ? 7 : 2, hw, -1.9, 1.9, 0.3, 0.55, P.rust, x => inArch(x));
      if (wreck) {
        if (!hoodOpen) dent(b, R.r(-0.9, 0.3), R.r(0.5, 0.7), hw, R.chance(0.5) ? 1 : -1, col);
        frame(b, ws1, ws0, 0, L => b.at(R.r(-0.15, 0.25) * L, -0.024, R.r(-0.4, 0.4), null, () => cracks(b, R, 7, 0.4, crackC)));
      }
      return b.group();
    },

    van(opts = {}) {
      const R = rnd(opts, 202), b = new GFX.Builder();
      const col = opt(opts, 'color', R.pick([0xb9b5aa, 0x56677a, 0x6f7a5a, 0x8d9097, 0x9c8f72])), wreck = opt(opts, 'wreck', true);
      const grime = mix(col, P.dirt, 0.55), W = 1.8, hw = W / 2, BV = 0.035;
      const prof = [[-2.03, 0.32], [-1.8, 0.26], ...arc(-1.35, 0.36, 0.45, PI, 0, 6), [-0.9, 0.26], [0.9, 0.26], ...arc(1.35, 0.36, 0.45, PI, 0, 6),
        [1.8, 0.26], [2.02, 0.32], [2.06, 0.55], [2.0, 0.85], [1.62, 0.98], [1.0, 1.6], [0.8, 1.8], [-1.98, 1.82], [-2.04, 1.75], [-2.05, 0.4]];
      b.use('matte').prism(prof, W, col, 0, 0, 0, { bevel: BV, c2: grime });
      // windshield
      const WA = [1.0, 1.6], WB = [1.62, 0.98];
      slab(b, lerp2(WA, WB, 0.07), lerp2(WA, WB, 0.93), 0.01, 1.62, 0x15181c, 0, BV + 0.006);
      b.use('glass'); slab(b, lerp2(WA, WB, 0.1), lerp2(WA, WB, 0.9), 0.012, 1.56, P.glass, 0, BV + 0.02); b.use('matte');
      const pane = [[0.5, 1.1], [1.42, 1.1], [0.97, 1.55], [0.5, 1.55]], missing = wreck && R.chance(0.6) ? (R.chance(0.5) ? 1 : -1) : 0;
      for (const s of [-1, 1]) {
        b.prism(scalePts(pane, 1.07), 0.008, 0x15181c, 0, 0, s * (hw + 0.004));
        if (s === missing) shards(b, R, 0.55, 1.2, 1.1, s * (hw + 0.012));
        else b.use('glass').prism(pane, 0.008, P.glass, 0, 0, s * (hw + 0.014)).use('matte');
        // door seams, handles
        b.box(0.012, 0.55, 0.006, 0x1a1c20, 1.56, 0.68, s * (hw + 0.003));
        b.box(0.012, 1.32, 0.006, 0x1a1c20, 0.4, 0.98, s * (hw + 0.003));
        b.use('metal').box(0.14, 0.03, 0.02, P.steel, 0.55, 1.0, s * (hw + 0.008)).use('matte');
        mirror(b, 1.2, 1.36, hw, s, P.rubber, true);
        b.box(3.9, 0.07, 0.02, P.rubber, -0.05, 0.3, s * (hw + 0.006));
        // faded livery stripe + logo disc
        b.box(2.2, 0.14, 0.006, mix(col, P.mustard, 0.45), -0.85, 1.12, s * (hw + 0.004));
        b.cyl(0.2, 0.2, 0.006, mix(col, P.teal, 0.5), -0.9, 1.42, s * (hw + 0.004), { axis: 'z', seg: 12 });
        // lights
        b.use('gloss');
        b.box(0.06, 0.12, 0.36, wreck && s > 0 && R.chance(0.4) ? 0x2a2e33 : 0xc9d2d8, 2.06, 0.72, s * 0.6);
        b.box(0.05, 0.07, 0.1, 0xb8742a, 2.05, 0.68, s * 0.82);
        b.use('matte');
      }
      // sliding door on +Z
      b.box(0.012, 1.36, 0.006, 0x1a1c20, 0.3, 1.0, hw + 0.003);
      b.box(0.012, 1.36, 0.006, 0x1a1c20, -0.95, 1.0, hw + 0.003);
      b.box(2.0, 0.03, 0.025, P.rubber, -0.95, 1.64, hw + 0.012);
      b.use('metal').box(0.14, 0.03, 0.02, P.steel, 0.15, 1.0, hw + 0.008).use('matte');
      // rear doors
      const RA = [-2.05, 0.4], RB = [-2.04, 1.75];
      slab(b, lerp2(RA, RB, 0.03), lerp2(RA, RB, 0.97), 0.012, 0.012, 0x1a1c20, 0, BV + 0.004);
      for (const s of [-1, 1]) {
        slab(b, [-2.044, 1.3], [-2.041, 1.65], 0.01, 0.6, 0x15181c, s * 0.42, BV + 0.006);
        b.use('glass'); slab(b, [-2.044, 1.32], [-2.041, 1.63], 0.01, 0.55, P.glass, s * 0.42, BV + 0.016); b.use('gloss');
        slab(b, [-2.049, 0.55], [-2.046, 0.98], 0.03, 0.12, 0x7a1c1c, s * 0.8, BV + 0.012); b.use('matte');
        b.use('metal').box(0.03, 0.03, 0.14, P.steel, -2.1, 1.05, s * 0.12).use('matte');
      }
      // bumpers, grille, plates
      b.box(0.18, 0.2, 1.84, 0x2a2c31, 2.07, 0.38, 0, { c2: 0x18191c });
      b.box(0.18, 0.2, 1.84, 0x2a2c31, -2.07, 0.38, 0, { c2: 0x18191c });
      b.box(0.05, 0.16, 0.8, 0x15171a, 2.08, 0.66, 0);
      for (let i = 0; i < 3; i++) b.box(0.056, 0.014, 0.76, 0x3a3d42, 2.08, 0.61 + i * 0.05, 0);
      plate(b, 2.166, 0.38, 1); plate(b, -2.166, 0.38, -1);
      // roof: rails + vent
      for (const s of [-1, 1]) b.box(3.2, 0.035, 0.04, P.rubber, -0.5, 1.875, s * 0.72);
      for (let i = 0; i < 4; i++) b.box(0.04, 0.03, 1.48, P.rubber, -1.9 + i * 0.95, 1.89, 0);
      b.box(0.45, 0.07, 0.45, dk(col, 0.85), -0.3, 1.875, 0, { taper: 0.8 });
      // wheels
      const flat = wreck ? R.i(0, 3) : -1;
      [[1.35, 1], [1.35, -1], [-1.35, 1], [-1.35, -1]].forEach(([x, s], i) => wheel(b, x, s * 0.79, 0.35, 0.22, i === flat, 0x7d8188));
      const inArch = x => Math.abs(Math.abs(x) - 1.35) < 0.53;
      sidePatches(b, R, wreck ? 9 : 3, hw, -1.95, 1.9, 0.32, 0.7, P.rust, x => inArch(x));
      if (wreck) {
        dent(b, R.r(-1.5, -0.2), R.r(0.6, 1.3), hw, R.chance(0.5) ? 1 : -1, col);
        frame(b, lerp2(WB, WA, 0.1), lerp2(WB, WA, 0.9), 0, L => b.at(R.r(-0.2, 0.2) * L, -(BV + 0.03), R.r(-0.45, 0.45), null, () => cracks(b, R, 7, 0.4, crackC)));
      }
      return b.group();
    },

    pickup(opts = {}) {
      const R = rnd(opts, 303), b = new GFX.Builder();
      const col = opt(opts, 'color', R.pick([0x6e3a3a, 0x3d4f63, 0x6f7a5a, 0x8d9097, 0x9c8f72])), wreck = opt(opts, 'wreck', true);
      const grime = mix(col, P.dirt, 0.6), dust = mix(col, 0xa39b88, 0.35), W = 1.78, hw = W / 2, BV = 0.035;
      const prof = [[-2.03, 0.35], [-1.78, 0.28], ...arc(-1.32, 0.37, 0.45, PI, 0, 6), [-0.87, 0.28], [0.87, 0.28], ...arc(1.32, 0.37, 0.45, PI, 0, 6),
        [1.77, 0.28], [2.02, 0.35], [2.06, 0.6], [2.01, 0.88], [1.86, 0.98], [0.82, 1.02], [-0.56, 1.04], [-0.56, 0.66], [-2.05, 0.66], [-2.06, 0.5]];
      b.use('matte').prism(prof, W, col, 0, 0, 0, { bevel: BV, c2: grime });
      // cab
      const A0 = [0.86, 1.0], A1 = [0.3, 1.44], K0 = [-0.58, 1.0], K1 = [-0.54, 1.45];
      b.prism([K0, A0, A1, K1], 1.46, 0x15181c);
      b.use('glass');
      const ws0 = lerp2(A1, A0, 0.05), ws1 = lerp2(A1, A0, 0.92);
      slab(b, ws0, ws1, 0.016, 1.36, P.glass, 0, 0.012);
      slab(b, lerp2(K0, K1, 0.15), lerp2(K0, K1, 0.88), 0.012, 1.0, P.glass, 0, 0.01);
      const pane = [[-0.46, 1.07], [0.7, 1.07], [0.28, 1.4], [-0.46, 1.4]], missing = wreck && R.chance(0.5) ? (R.chance(0.5) ? 1 : -1) : 0;
      b.use('matte');
      for (const s of [-1, 1]) {
        if (s === missing) shards(b, R, -0.4, 0.4, 1.07, s * 0.737);
        else b.use('glass').prism(pane, 0.01, P.glass, 0, 0, s * 0.737).use('matte');
        slab(b, A1, A0, 0.05, 0.07, col, s * 0.705, 0.02);
        b.box(0.07, 0.46, 0.05, col, -0.52, 1.22, s * 0.72);
        b.box(0.03, 0.34, 0.03, P.rubber, 0.42, 1.235, s * 0.74);
        b.box(1.42, 0.03, 0.03, P.rubber, 0.12, 1.055, s * 0.742);
        b.box(0.012, 0.6, 0.006, 0x1a1c20, 0.76, 0.72, s * (hw + 0.003));
        b.box(0.012, 0.7, 0.006, 0x1a1c20, -0.5, 0.66, s * (hw + 0.003));
        b.use('metal').box(0.13, 0.025, 0.02, P.steel, -0.3, 0.9, s * (hw + 0.008)).use('matte');
        b.box(0.75, 0.06, 0.02, P.rubber, 0, 0.32, s * (hw + 0.002));
        mirror(b, 0.74, 1.08, hw, s, P.rubber, false);
        // bed walls
        b.box(1.47, 0.36, 0.07, col, -1.33, 0.875, s * 0.855, { c2: grime });
        b.box(1.5, 0.03, 0.09, P.rubber, -1.33, 1.07, s * 0.85);
        b.box(0.86, 0.18, 0.2, col, -1.32, 0.8, s * 0.71);
        b.use('gloss');
        b.box(0.06, 0.1, 0.32, wreck && s > 0 && R.chance(0.4) ? 0x2a2e33 : 0xc9d2d8, 2.06, 0.78, s * 0.6);
        b.box(0.03, 0.22, 0.07, 0x7a1c1c, -2.075, 0.85, s * 0.85);
        b.use('matte');
      }
      b.box(0.86, 0.05, 1.5, dust, -0.12, 1.465, 0, { taper: [0.96, 0.95], c2: col });
      // bed: tailgate, floor with ribs
      b.box(0.07, 0.36, 1.64, col, -2.05, 0.875, 0, { c2: grime });
      b.box(0.02, 0.05, 0.3, P.rubber, -2.09, 0.98, 0);
      b.box(1.42, 0.02, 1.62, 0x2a2b2e, -1.33, 0.705, 0);
      for (let i = 0; i < 7; i++) b.box(1.42, 0.012, 0.04, 0x34363a, -1.33, 0.72, -0.6 + i * 0.2);
      // front
      b.box(0.16, 0.22, 1.82, 0x3a3c40, 2.07, 0.42, 0, { c2: 0x18191c });
      b.box(0.16, 0.2, 1.82, 0x2a2c31, -2.08, 0.42, 0, { c2: 0x18191c });
      b.box(0.05, 0.18, 0.9, 0x15171a, 2.08, 0.72, 0);
      for (let i = 0; i < 3; i++) b.box(0.056, 0.014, 0.86, 0x3a3d42, 2.08, 0.66 + i * 0.055, 0);
      plate(b, 2.156, 0.42, 1); plate(b, -2.166, 0.42, -1);
      // cargo
      const top = 0.715;
      b.box(0.52, 0.44, 0.5, 0x7a5c3a, -1.65, top + 0.22, 0.4, { r: [0, R.r(-0.3, 0.3), 0], c2: dk(0x7a5c3a, 0.6) });
      b.box(0.54, 0.03, 0.08, 0x5a4229, -1.65, top + 0.3, 0.4, { r: [0, 0, 0.3] });
      if (R.chance(0.6)) { b.use('gloss'); b.cyl(0.26, 0.26, 0.82, R.pick([P.teal, P.brick, P.olive]), -1.05, top + 0.26, -0.3, { axis: 'z', seg: 12, c2: P.rust }); b.use('matte'); }
      else b.add(blob(0.42, R, 0.25), 0x4a5440, -1.1, top + 0.18, -0.25, { s: [1.2, 0.45, 1.3], c2: 0x2a3026 });
      if (R.chance(0.7)) { b.lathe([[0.2, 0.03], [0.25, 0], [0.33, 0], [0.35, 0.05], [0.35, 0.15], [0.33, 0.2], [0.25, 0.2], [0.2, 0.17], [0.2, 0.03]], P.tyre, -0.95, top, 0.45, { seg: 12 }); }
      // wheels & wear
      const flat = wreck ? R.i(0, 3) : -1;
      [[1.32, 1], [1.32, -1], [-1.32, 1], [-1.32, -1]].forEach(([x, s], i) => wheel(b, x, s * 0.78, 0.35, 0.22, i === flat, 0x6a6e75));
      sidePatches(b, R, wreck ? 7 : 2, hw, -1.95, 1.9, 0.34, 0.6, P.rust, x => Math.abs(Math.abs(x) - 1.32) < 0.53);
      if (wreck) frame(b, ws1, ws0, 0, L => b.at(R.r(-0.2, 0.2) * L, -0.024, R.r(-0.4, 0.4), null, () => cracks(b, R, 6, 0.35, crackC)));
      return b.group();
    },

    bus(opts = {}) {
      const R = rnd(opts, 404), b = new GFX.Builder();
      const col = opt(opts, 'color', R.pick([P.mustard, P.teal, P.brick, P.olive2])), wreck = opt(opts, 'wreck', true);
      const grime = mix(col, P.dirt, 0.5), W = 2.5, hw = W / 2, BV = 0.05;
      const prof = [[-4.95, 0.4], [-4.85, 0.32], [-3.37, 0.32], ...arc(-2.75, 0.5, 0.62, PI, 0, 7), [-2.13, 0.32], [2.63, 0.32], ...arc(3.25, 0.5, 0.62, PI, 0, 7),
        [3.87, 0.32], [4.85, 0.32], [4.95, 0.42], [4.98, 2.72], [4.88, 2.88], [-4.84, 2.88], [-4.96, 2.74]];
      b.use('matte').prism(prof, W, col, 0, 0, 0, { bevel: BV, c2: grime });
      const dark = 0x14171b, frameC = 0x24272c;
      const doors = [[4.36, 0.84], [0.6, 1.2]];
      for (const s of [-1, 1]) {
        const z = s * hw;
        b.box(9.3, 0.98, 0.012, dark, -0.05, 2.0, s * (hw + 0.006));
        b.box(9.7, 0.1, 0.012, mix(col, P.cream, 0.55), 0, 1.4, s * (hw + 0.006));
        b.box(9.7, 0.12, 0.012, frameC, 0, 0.42, s * (hw + 0.006));
        const bays = s > 0 ? [[-4.7, -3.55], [-3.55, -2.4], [-2.4, -1.2], [-1.2, -0.05], [1.25, 2.5], [2.5, 3.88]]
          : [-4.7, -3.54, -2.38, -1.22, -0.06, 1.1, 2.26, 3.42, 4.6].slice(0, -1).map((x, i, a) => [x, i + 1 < a.length ? a[i + 1] : 4.6]);
        bays.forEach(([x0, x1]) => {
          if (!(wreck && R.chance(0.14))) b.use('glass').box(x1 - x0 - 0.02, 0.92, 0.008, P.glass, (x0 + x1) / 2, 2.0, s * (hw + 0.016)).use('matte');
          else b.box(0.3, 0.02, 0.01, 0x3a4652, (x0 + x1) / 2, 1.53, s * (hw + 0.016));
          b.box(0.1, 0.98, 0.012, col, x0, 2.0, s * (hw + 0.022));
        });
        b.box(0.1, 0.98, 0.012, col, s > 0 ? 3.88 : 4.6, 2.0, s * (hw + 0.022));
        b.box(9.4, 0.05, 0.02, col, -0.05, 2.52, s * (hw + 0.012));
        b.box(9.4, 0.05, 0.02, col, -0.05, 1.49, s * (hw + 0.012));
        // mirrors on stalks
        b.box(0.14, 0.03, 0.03, P.rubber, 5.05, 2.45, s * 1.24);
        b.box(0.03, 0.32, 0.03, P.rubber, 5.11, 2.3, s * 1.27);
        b.box(0.06, 0.34, 0.16, P.rubber, 5.11, 2.02, s * 1.26);
        b.box(0.006, 0.3, 0.13, 0x3a4652, 5.077, 2.02, s * 1.26);
        b.use('gloss').box(0.08, 0.06, 0.012, 0xb8742a, 4.6, 0.62, s * (hw + 0.006)).use('matte');
      }
      // doors (+Z side)
      doors.forEach(([xm, dw]) => {
        b.box(dw, 2.2, 0.024, frameC, xm, 1.47, hw + 0.016);
        b.use('glass');
        for (const k of [-1, 1]) b.box(dw / 2 - 0.07, 1.95, 0.008, P.glass, xm + k * dw / 4, 1.5, hw + 0.034);
        b.use('matte');
        for (const k of [-1, 1]) b.box(dw / 2 - 0.07, 0.42, 0.01, 0x2e3238, xm + k * dw / 4, 0.68, hw + 0.04);
        b.box(0.03, 2.05, 0.012, P.rubber, xm, 1.47, hw + 0.034);
        b.box(dw + 0.1, 0.06, 0.06, frameC, xm, 2.6, hw + 0.03);
      });
      // front face
      const F0 = [4.95, 0.42], F1 = [4.98, 2.72], ft = y => (2.72 - y) / 2.3;
      slab(b, lerp2(F1, F0, ft(2.42)), lerp2(F1, F0, ft(1.25)), 0.012, 2.3, dark, 0, BV + 0.006);
      b.use('glass'); slab(b, lerp2(F1, F0, ft(2.4)), lerp2(F1, F0, ft(1.28)), 0.012, 2.24, P.glass, 0, BV + 0.018); b.use('matte');
      slab(b, lerp2(F1, F0, ft(2.42)), lerp2(F1, F0, ft(1.25)), 0.02, 0.06, col, 0, BV + 0.03);
      slab(b, lerp2(F1, F0, ft(2.7)), lerp2(F1, F0, ft(2.46)), 0.012, 1.95, dark, 0, BV + 0.006);
      b.use('glow'); slab(b, lerp2(F1, F0, ft(2.66)), lerp2(F1, F0, ft(2.5)), 0.008, 1.6, P.amber, 0, BV + 0.014, { glow: 0.55 }); b.use('matte');
      for (let i = 0; i < 7; i++) { const z = -0.7 + i * 0.23 + R.r(-0.03, 0.03); slab(b, lerp2(F1, F0, ft(2.65)), lerp2(F1, F0, ft(2.51)), 0.006, R.r(0.02, 0.06), 0x2a1d10, z, BV + 0.021); }
      for (const s of [-1, 1]) {
        b.use('gloss'); slab(b, lerp2(F1, F0, ft(0.84)), lerp2(F1, F0, ft(0.66)), 0.03, 0.34, 0xc9d2d8, s * 0.88, BV + 0.012);
        slab(b, lerp2(F1, F0, ft(0.84)), lerp2(F1, F0, ft(0.7)), 0.03, 0.1, 0xb8742a, s * 1.12, BV + 0.012); b.use('matte');
        // rear
        b.use('gloss'); slab(b, [-4.951, 0.7], [-4.954, 1.3], 0.03, 0.14, 0x7a1c1c, s * 1.05, -(BV + 0.012)); b.use('matte');
      }
      slab(b, lerp2(F1, F0, ft(0.98)), lerp2(F1, F0, ft(0.52)), 0.012, 1.2, 0x1a1c20, 0, BV + 0.006);
      b.box(0.16, 0.32, 2.46, 0x2a2c31, 5.02, 0.44, 0, { c2: 0x18191c });
      b.box(0.16, 0.32, 2.46, 0x2a2c31, -5.02, 0.44, 0, { c2: 0x18191c });
      plate(b, 5.106, 0.45, 1); plate(b, -5.106, 0.45, -1);
      // rear window + engine louvres
      slab(b, [-4.958, 1.85], [-4.962, 2.55], 0.012, 2.0, dark, 0, -(BV + 0.006));
      b.use('glass'); slab(b, [-4.958, 1.88], [-4.962, 2.52], 0.012, 1.94, P.glass, 0, -(BV + 0.018)); b.use('matte');
      for (let i = 0; i < 6; i++) slab(b, [-4.951, 0.7 + i * 0.1], [-4.952, 0.75 + i * 0.1], 0.03, 1.5, 0x1a1c20, 0, -(BV + 0.012));
      // roof units
      b.box(2.4, 0.16, 1.6, 0xb9b6ad, -1.2, 3.01, 0, { taper: 0.92, c2: 0x7a776f });
      for (const x of [-1.8, -0.6]) { b.cyl(0.26, 0.26, 0.02, 0x2a2c30, x, 3.095, 0, { seg: 12 }); b.box(0.5, 0.012, 0.04, 0x55585e, x, 3.105, 0); }
      b.box(0.72, 0.06, 0.72, dk(col, 0.8), 2.1, 2.95, 0, { taper: 0.85 });
      b.box(8.6, 0.03, 0.05, dk(col, 0.7), -0.2, 2.935, 0.95);
      b.box(8.6, 0.03, 0.05, dk(col, 0.7), -0.2, 2.935, -0.95);
      // wheels & wear
      const flat = wreck ? R.i(0, 3) : -1;
      [[3.25, 1], [3.25, -1], [-2.75, 1], [-2.75, -1]].forEach(([x, s], i) => wheel(b, x, s * 1.11, 0.5, 0.3, i === flat, 0x8d9097));
      sidePatches(b, R, wreck ? 14 : 4, hw + 0.006, -4.8, 4.8, 0.55, 1.3, P.rust, x => Math.abs(x - 3.25) < 0.72 || Math.abs(x + 2.75) < 0.72 || Math.abs(x - 0.6) < 0.7 || x > 3.9);
      if (wreck) dent(b, R.r(-4.3, -3.5), R.r(0.8, 1.2), hw + 0.006, -1, col);
      return b.group();
    },

    /* =================================================== industrial */
    container(opts = {}) {
      const R = rnd(opts, 505), b = new GFX.Builder();
      const col = opt(opts, 'color', R.pick([P.teal, P.rust, P.olive, 0x9c8f72, 0x6e3a3a]));
      const L = 6.5, W = 2.5, H = 2.7, hl = L / 2, hw = W / 2;
      const frameC = dk(col, 0.7), grime = mix(col, P.dirt, 0.5), castC = 0x34363a, mark = mix(P.cream, col, 0.15);
      b.use('matte');
      // corner posts + castings
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.box(0.16, H - 0.26, 0.16, frameC, sx * (hl - 0.08), H / 2, sz * (hw - 0.08), { c2: dk(frameC, 0.7) });
        for (const y of [0.065, H - 0.065]) {
          b.box(0.18, 0.13, 0.18, castC, sx * (hl - 0.09), y, sz * (hw - 0.09));
          b.box(0.006, 0.05, 0.09, 0x0d0e10, sx * (hl + 0.003), y, sz * (hw - 0.09));
          b.box(0.09, 0.05, 0.006, 0x0d0e10, sx * (hl - 0.09), y, sz * (hw + 0.003));
        }
      }
      // rails
      for (const sz of [-1, 1]) {
        b.box(L - 0.36, 0.15, 0.12, frameC, 0, 0.075, sz * (hw - 0.06), { c2: P.rust });
        b.box(L - 0.36, 0.13, 0.12, frameC, 0, H - 0.065, sz * (hw - 0.06));
      }
      for (const sx of [-1, 1]) {
        b.box(0.12, 0.15, W - 0.36, frameC, sx * (hl - 0.06), 0.075, 0, { c2: P.rust });
        b.box(0.12, 0.13, W - 0.36, frameC, sx * (hl - 0.06), H - 0.065, 0);
      }
      // corrugated sides
      const pitch = 0.28, n = Math.floor((L - 0.5) / pitch), ribX = [];
      for (let i = 0; i < n; i++) ribX.push(-((n - 1) / 2) * pitch + i * pitch);
      const ribFace = hw - 0.005;
      for (const sz of [-1, 1]) {
        b.box(L - 0.32, H - 0.28, 0.03, dk(col, 0.85), 0, H / 2, sz * (hw - 0.05), { c2: grime });
        ribX.forEach(x => b.box(0.14, H - 0.3, 0.03, col, x, H / 2, sz * (hw - 0.02), { c2: grime }));
        // stencil marks (printed across the ribs)
        const k0 = sz > 0 ? 1 : n - 6;
        [2.3, 2.16, 2.02].forEach((y, row) => { for (let k = k0; k < k0 + (row === 0 ? 5 : 4); k++) if (R() > 0.12) b.box(0.1, R.r(0.06, 0.1), 0.006, mark, ribX[k], y, sz * (ribFace + 0.003)); });
        // faded logo panel
        const l0 = Math.floor(n / 2) + (sz > 0 ? 1 : -4);
        for (let k = l0; k < l0 + 4; k++) b.box(0.12, 0.9, 0.006, mix(col, P.cream, 0.28), ribX[k], 1.25, sz * (ribFace + 0.003), { c2: mix(col, P.cream, 0.12) });
        // rust streaks from the top rail
        for (let i = 0; i < 6; i++) { const k = R.i(0, n - 1), len = R.r(0.3, 1.3); b.box(R.r(0.05, 0.1), len, 0.006, P.rust, ribX[k] + R.r(-0.02, 0.02), H - 0.14 - len / 2, sz * (ribFace + 0.006), { c2: col }); }
        for (let i = 0; i < 3; i++) { const k = R.i(0, n - 1), len = R.r(0.2, 0.5); b.box(0.12, len, 0.006, P.rust, ribX[k], 0.16 + len / 2, sz * (ribFace + 0.006), { c2: dk(P.rust, 0.7) }); }
      }
      // front end (+X): corrugated wall
      b.box(0.03, H - 0.28, W - 0.32, dk(col, 0.85), hl - 0.05, H / 2, 0, { c2: grime });
      for (let i = 0; i < 8; i++) b.box(0.03, H - 0.3, 0.14, col, hl - 0.02, H / 2, -0.98 + i * 0.28, { c2: grime });
      // door end (-X)
      const doorC = dk(col, 0.92), dx = -(hl - 0.04);
      for (const sz of [-1, 1]) {
        const zc = sz * (W - 0.32) / 4;
        b.box(0.04, H - 0.28, (W - 0.32) / 2 - 0.01, doorC, dx, H / 2, zc, { c2: grime });
        for (let k = -1; k <= 1; k++) b.box(0.015, 1.6, 0.12, doorC, dx - 0.0275, 1.1, zc + k * 0.3, { c2: grime });
        for (const y of [0.5, 1.35, 2.2]) b.box(0.05, 0.15, 0.08, castC, -(hl + 0.0), y, sz * 1.1);
        // lock rods
        for (const zr of [sz * 0.22, sz * 0.82]) {
          b.use('metal').cyl(0.022, 0.022, 2.32, 0x6a6e75, -(hl + 0.01), H / 2, zr, { seg: 6 }).use('matte');
          for (const y of [0.32, 2.38]) b.box(0.05, 0.06, 0.08, castC, -(hl - 0.005), y, zr);
          b.use('metal').box(0.04, 0.04, 0.32, 0x6a6e75, -(hl + 0.03), 1.25, zr - sz * 0.13).use('matte');
          b.box(0.03, 0.08, 0.05, castC, -(hl + 0.0), 1.25, zr - sz * 0.27);
        }
      }
      b.box(0.012, H - 0.3, 0.02, 0x0d0e10, dx - 0.02, H / 2, 0);
      // door marking block (owner code)
      for (let i = 0; i < 7; i++) if (R() > 0.1) b.box(0.006, R.r(0.07, 0.1), 0.07, mark, dx - 0.024, 2.32, 0.16 + i * 0.1);
      for (let i = 0; i < 4; i++) b.box(0.006, 0.06, 0.06, mark, dx - 0.024, 2.17, 0.16 + i * 0.09);
      // roof
      b.box(L - 0.32, 0.04, W - 0.32, col, 0, H - 0.06, 0, { c2: dk(col, 0.8) });
      for (let i = 0; i < 9; i++) b.box(0.1, 0.012, W - 0.36, dk(col, 0.92), -2.8 + i * 0.7, H - 0.034, 0);
      return b.group();
    },

    barrier(opts = {}) {
      const R = rnd(opts, 606), b = new GFX.Builder(), L = opt(opts, 'l', 4.0), col = opt(opts, 'color', P.concrete);
      const prof = [[-0.28, 0.02], [0.28, 0.02], [0.28, 0.1], [0.14, 0.29], [0.09, 0.97], [-0.09, 0.97], [-0.14, 0.29], [-0.28, 0.1]];
      const stain = mix(col, P.dirt, 0.55);
      b.at(0, 0, 0, [0, HP, 0], () => {
        b.use('matte').prism(prof, L - 0.02, col, 0, 0, 0, { bevel: 0.02, c2: stain });
        // hazard band on both upper faces
        for (const s of [-1, 1]) {
          const p = [s * 0.09, 0.97], q = [s * 0.14, 0.29], pp = s > 0 ? p : q, qq = s > 0 ? q : p;
          frame(b, pp, qq, 0, Lf => {
            // segment param: local x runs from top (s>0) - pick positions by world y
            const yToX = y => { const t = (y - pp[1]) / (qq[1] - pp[1]); return (t - 0.5) * Lf; };
            const xa = yToX(0.86), xb = yToX(0.6), xm = (xa + xb) / 2, bw = Math.abs(xb - xa);
            b.box(bw, 0.006, L - 0.16, 0x1d1e20, xm, 0.024, 0);
            const n = Math.floor((L - 0.4) / 0.36);
            b.at(xm, 0.03, 0, [HP, 0, 0], () => {
              for (let i = 0; i < n; i++) {
                const z0 = -(n - 1) * 0.18 + i * 0.36 - 0.07, w = 0.15, sl = 0.13 * (s > 0 === xb > xa ? 1 : -1);
                b.prism([[-bw / 2, z0], [bw / 2, z0 + sl], [bw / 2, z0 + sl + w], [-bw / 2, z0 + w]].map(([u, v]) => [u, v]), 0.006, mix(P.amber, P.concrete, 0.25), 0, 0, 0);
              }
            });
          });
        }
        // chips & stains on the vertical faces
        for (let i = 0; i < 6; i++) {
          const s = R() < 0.5 ? -1 : 1, z = R.r(-L / 2 + 0.2, L / 2 - 0.2), y = R.r(0.35, 0.9);
          const xf = 0.14 - (y - 0.29) * (0.05 / 0.68);
          frame(b, s > 0 ? [s * 0.09, 0.97] : [s * 0.14, 0.29], s > 0 ? [s * 0.14, 0.29] : [s * 0.09, 0.97], 0, () => {});
          b.box(0.02, R.r(0.04, 0.12), R.r(0.06, 0.2), dk(col, 0.72), s * (xf + 0.018), y, z, { r: [0, 0, s * 0.073] });
        }
      });
      // lifting slot / drain notch
      b.box(0.36, 0.1, 0.62, 0x1a1b1d, 0, 0.07, 0);
      b.box(0.36, 0.006, 0.6, dk(col, 0.6), 0, 0.123, 0);
      // top dust
      b.box(L - 0.06, 0.006, 0.17, lt(col, 0.12), 0, 0.993, 0);
      return b.group();
    },

    fence(opts = {}) {
      const R = rnd(opts, 707), b = new GFX.Builder(), L = opt(opts, 'l', 10), hl = L / 2;
      const nb = Math.max(1, Math.round(L / 2.5)), bw = L / nb;
      b.use('matte');
      for (let i = 0; i <= nb; i++) {
        const x = -hl + i * bw, xx = Math.max(-hl + 0.05, Math.min(hl - 0.05, x));
        b.box(0.32, 0.22, 0.5, P.concrete, Math.max(-hl + 0.16, Math.min(hl - 0.16, x)), 0.11, 0, { taper: [0.8, 0.8], c2: mix(P.concrete, P.dirt, 0.5) });
        b.use('metal').box(0.08, 1.6, 0.08, 0x5a5e64, xx, 0.8, -0.05, { c2: P.rust }).use('matte');
        b.box(0.1, 0.03, 0.1, 0x3a3d42, xx, 1.6 - 0.015, -0.05);
      }
      b.use('metal');
      b.box(L - 0.04, 0.05, 0.04, 0x5a5e64, 0, 0.32, -0.065);
      b.box(L - 0.04, 0.05, 0.04, 0x5a5e64, 0, 1.42, -0.065);
      b.use('matte');
      const sheetCols = [0x7d8288, 0x6f757c, P.rust, 0x8a8f93, 0x6b5a4a];
      for (let i = 0; i < nb; i++) {
        const cx = -hl + (i + 0.5) * bw, c = R.pick(sheetCols), h = R.r(1.32, 1.46), tilt = R.r(-0.04, 0.05), lean = R.r(-0.02, 0.02);
        const rustBottom = mix(c, P.rust, 0.8);
        b.at(cx, 0.14, 0.0, [tilt, lean, 0], () => {
          b.box(bw - 0.12, h, 0.012, dk(c, 0.85), 0, h / 2, 0, { c2: rustBottom });
          const nr = Math.floor((bw - 0.16) / 0.13);
          for (let k = 0; k < nr; k++) b.box(0.055, h, 0.05, c, -((nr - 1) / 2) * 0.13 + k * 0.13, h / 2, 0, { c2: rustBottom });
          // bolts on rails
          for (const y of [0.18, 1.28]) for (let k = 0; k < 3; k++) b.box(0.03, 0.03, 0.06, 0x3a3d42, -bw / 3 + k * bw / 3, y, 0.0);
          // a few rust streaks
          for (let k = 0; k < 2; k++) { const len = R.r(0.25, 0.7); b.box(0.04, len, 0.006, P.rust, R.r(-bw / 2 + 0.2, bw / 2 - 0.2), h - len / 2 - 0.02, 0.029, { c2: c }); }
        });
      }
      return b.group();
    },

    crate(opts = {}) {
      const R = rnd(opts, 808), b = new GFX.Builder(), base = opt(opts, 'color', 0x7a5c3a);
      const dark = dk(base, 0.45), edge = dk(base, 0.78);
      b.use('matte').box(1.12, 1.12, 1.12, dark, 0, 0.6, 0);
      // frame battens
      for (const a of [-1, 1]) for (const c of [-1, 1]) {
        b.box(1.2, 0.1, 0.1, edge, 0, a > 0 ? 1.15 : 0.05, c * 0.55, { c2: dk(edge, 0.75) });
        b.box(0.1, 0.1, 1.0, edge, c * 0.55, a > 0 ? 1.15 : 0.05, 0, { c2: dk(edge, 0.75) });
        b.box(0.1, 1.0, 0.1, edge, a * 0.55, 0.6, c * 0.55, { c2: dk(edge, 0.7) });
      }
      const missingFace = R.i(0, 4), missingPlank = R.i(0, 2);
      const face = (fi) => {
        for (let i = 0; i < 3; i++) {
          if (fi === missingFace && i === missingPlank) continue;
          const c = mix(base, R.pick([0x8a6a45, 0x6b4a2f, 0x9a7a52]), R.r(0.2, 0.6));
          b.box(1.0, 0.31, 0.04, c, 0, -0.34 + i * 0.34, 0.58, { c2: dk(c, 0.8) });
        }
        const flip = R.chance(0.5) ? 1 : -1;
        slab(b, [-0.47 * flip, -0.47], [0.47 * flip, 0.47], 0.11, 0.035, edge, 0.618, 0, { c2: dk(edge, 0.8) });
        b.box(0.18 + R.r(0, 0.1), 0.06, 0.004, 0x1d1e20, R.r(-0.2, 0.2), R.r(0.15, 0.3), 0.6 + 0.004);
      };
      for (let k = 0; k < 4; k++) b.at(0, 0.6, 0, [0, k * HP, 0], () => face(k));
      b.at(0, 0.6, 0, [-HP, 0, 0], () => face(4));
      return b.group();
    },

    barrel(opts = {}) {
      const R = rnd(opts, 909), b = new GFX.Builder(), col = opt(opts, 'color', R.pick([P.teal, P.brick, P.olive, 0x2f4f6f, P.mustard]));
      const prof = [[0, 0.004], [0.27, 0.0], [0.29, 0.02], [0.29, 0.27], [0.3, 0.29], [0.29, 0.31], [0.29, 0.58], [0.3, 0.6], [0.29, 0.62], [0.29, 0.875], [0.3, 0.885], [0.29, 0.9], [0.275, 0.89], [0.27, 0.875], [0, 0.875]];
      b.use('gloss').lathe(prof, col, 0, 0, 0, { seg: 16, c2: mix(col, P.rust, 0.85), r: [0, R() * 6, 0] });
      b.use('metal');
      b.cyl(0.04, 0.04, 0.02, 0x6a6e75, 0.15, 0.885, 0.05, { seg: 6 });
      b.cyl(0.025, 0.025, 0.02, 0x6a6e75, -0.16, 0.885, -0.04, { seg: 6 });
      b.use('matte');
      // label & rust drips
      const la = R() * PI * 2;
      b.box(0.22, 0.16, 0.008, mix(P.cream, col, 0.2), Math.sin(la) * 0.292, 0.44, Math.cos(la) * 0.292, { r: [0, la, 0] });
      b.box(0.14, 0.03, 0.008, dk(col, 0.4), Math.sin(la) * 0.296, 0.47, Math.cos(la) * 0.296, { r: [0, la, 0] });
      for (let i = 0; i < 5; i++) {
        const a = R() * PI * 2, h = R.r(0.08, 0.25), y = R.chance(0.5) ? 0.89 - h / 2 - 0.02 : 0.31 + h / 2;
        b.box(R.r(0.03, 0.07), h, 0.008, P.rust, Math.sin(a) * 0.293, y, Math.cos(a) * 0.293, { r: [0, a, 0], c2: dk(P.rust, 0.8) });
      }
      return b.group();
    },

    dumpster(opts = {}) {
      const R = rnd(opts, 1010), b = new GFX.Builder(), col = opt(opts, 'color', R.pick([0x3f5a46, 0x2f4f6f, 0x6e3a3a, 0x5a6066]));
      const grime = mix(col, P.dirt, 0.55);
      // side profile (z, y), extruded along X
      const prof = [[-0.5, 0.12], [0.42, 0.12], [0.56, 1.16], [-0.56, 1.2]];
      b.use('matte').at(0, 0, 0, [0, -HP, 0], () => b.prism(prof, 1.84, col, 0, 0, 0, { bevel: 0.025, c2: grime }));
      // rim lip
      b.box(1.92, 0.06, 0.06, dk(col, 0.8), 0, 1.17, 0.57);
      b.box(1.92, 0.06, 0.06, dk(col, 0.8), 0, 1.21, -0.57);
      // vertical ribs front & back
      for (const x of [-0.6, 0, 0.6]) {
        slab(b, [0.44, 0.14], [0.57, 1.12], 0.04, 0.08, dk(col, 0.88), x, 0.03, { c2: grime });
      }
      b.at(0, 0, 0, [0, PI, 0], () => { for (const x of [-0.6, 0, 0.6]) slab(b, [0.52, 0.14], [0.585, 1.16], 0.04, 0.08, dk(col, 0.88), x, 0.03, { c2: grime }); });
      // side lift pockets
      for (const s of [-1, 1]) {
        b.box(0.08, 0.14, 0.7, 0x2a2c30, s * 0.955, 0.75, 0);
        b.box(0.07, 0.1, 0.62, 0x0f1012, s * 0.968, 0.75, 0);
        // casters
        for (const z of [-0.36, 0.34]) {
          b.box(0.12, 0.05, 0.12, 0x2a2c30, s * 0.78, 0.115, z);
          b.box(0.03, 0.06, 0.1, 0x3a3d42, s * 0.78 + 0.04, 0.07, z);
          b.cyl(0.055, 0.055, 0.05, P.tyre, s * 0.78, 0.055, z, { axis: 'x', seg: 8 });
        }
      }
      // lids (one slightly ajar)
      const lidA = Math.atan2(1.16 - 1.2, 1.12), open = R.i(0, 1);
      for (const s of [-1, 1]) {
        const ang = lidA - ((s > 0) === (open === 1) ? 0.1 : 0);
        b.at(s * 0.47, 1.22, -0.56, [ang, 0, 0], () => {
          b.box(0.92, 0.05, 1.18, mix(col, 0x23262c, 0.5), 0, 0.02, 0.59, { c2: dk(col, 0.6) });
          for (const x of [-0.3, 0, 0.3]) b.box(0.05, 0.02, 1.1, dk(col, 0.5), x, 0.05, 0.59);
          b.box(0.25, 0.04, 0.04, 0x2a2c30, 0, 0.04, 1.15);
        });
      }
      // hinges
      for (const x of [-0.8, -0.15, 0.15, 0.8]) b.use('metal').cyl(0.03, 0.03, 0.1, 0x4a4d52, x, 1.215, -0.6, { axis: 'x', seg: 6 }).use('matte');
      // wear
      for (let i = 0; i < 6; i++) { const s = R() < 0.5 ? -1 : 1; b.box(0.006, R.r(0.05, 0.2), R.r(0.1, 0.3), P.rust, s * 0.947, R.r(0.2, 1.0), R.r(-0.4, 0.4), { c2: dk(P.rust, 0.7) }); }
      b.box(0.006, 0.3, 0.44, mix(P.cream, col, 0.3), 0.947, 0.75, 0.0 + 0.45 > 0.45 ? 0 : 0);
      return b.group();
    },

    pallet(opts = {}) {
      const R = rnd(opts, 1111), b = new GFX.Builder(), base = opt(opts, 'color', 0x9a7a52);
      const wc = () => mix(base, R.pick([0x6b4a2f, 0xa88a60, 0x7a6448]), R.r(0.1, 0.5));
      // bottom boards
      for (const z of [-0.43, 0, 0.43]) b.box(1.2, 0.022, 0.14, wc(), 0, 0.011, z);
      // blocks
      for (const x of [-0.53, 0, 0.53]) for (const z of [-0.43, 0, 0.43]) b.box(0.13, 0.08, 0.14, dk(wc(), 0.85), x, 0.062, z);
      // stringer boards
      for (const x of [-0.53, 0, 0.53]) b.box(0.14, 0.022, 1.0, wc(), x, 0.113, 0);
      // top deck
      const n = 7, gap = (1.0 - n * 0.11) / (n - 1);
      for (let i = 0; i < n; i++) {
        if (R.chance(0.08) && i > 0 && i < n - 1) continue;
        const z = -0.5 + 0.055 + i * (0.11 + gap), c = wc();
        b.box(1.2, 0.022, 0.11, c, 0, 0.135 + i * 0.0004, z, { r: [0, 0, R.r(-0.008, 0.008)] });
      }
      return b.group();
    },

    tires(opts = {}) {
      const R = rnd(opts, 1212), b = new GFX.Builder();
      const prof = [[0.2, 0.03], [0.25, 0], [0.33, 0], [0.35, 0.05], [0.35, 0.15], [0.33, 0.2], [0.25, 0.2], [0.2, 0.17], [0.2, 0.03]];
      for (let i = 0; i < 3; i++) {
        const x = R.r(-0.02, 0.02), z = R.r(-0.02, 0.02), tilt = i === 2 ? R.r(-0.06, 0.06) : 0;
        b.at(x, i * 0.2, z, [tilt, R() * 3, 0], () => {
          b.lathe(prof, P.tyre, 0, 0, 0, { seg: 14 });
          for (let k = 0; k < 7; k++) { const a = k / 7 * PI * 2; b.box(0.02, 0.15, 0.06, 0x2a2b2f, Math.sin(a) * 0.346, 0.1, Math.cos(a) * 0.346, { r: [0, a + HP, 0] }); }
        });
      }
      return b.group();
    },

    /* =================================================== gas station */
    gasPump(opts = {}) {
      const R = rnd(opts, 1313), b = new GFX.Builder(), col = opt(opts, 'color', P.brick);
      b.use('matte');
      // island
      b.box(0.88, 0.16, 1.78, P.concrete, 0, 0.08, 0, { c2: mix(P.concrete, P.dirt, 0.6) });
      b.box(0.9, 0.05, 1.8, mix(P.mustard, P.concrete, 0.3), 0, 0.115, 0);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.box(0.12, 0.052, 0.006, 0x1d1e20, -0.3 + i * 0.3, 0.115, s * 0.903);
      // crash bollards
      for (const s of [-1, 1]) {
        b.cyl(0.055, 0.06, 0.8, P.mustard, 0, 0.56, s * 0.76, { seg: 8, c2: dk(P.mustard, 0.6) });
        for (const y of [0.45, 0.75]) b.cyl(0.062, 0.062, 0.06, 0x1d1e20, 0, y, s * 0.76, { seg: 8 });
      }
      // pump body
      b.box(0.52, 0.12, 1.0, 0x2a2d32, 0, 0.22, 0);
      b.box(0.46, 1.06, 0.92, P.cream, 0, 0.81, 0, { c2: mix(P.cream, P.dirt, 0.6) });
      b.box(0.52, 0.48, 0.98, col, 0, 1.58, 0, { c2: dk(col, 0.75) });
      b.box(0.44, 0.16, 0.9, dk(col, 0.8), 0, 1.9, 0, { taper: [0.9, 0.95] });
      b.box(0.48, 0.04, 0.96, 0x2a2d32, 0, 1.34, 0);
      for (const s of [-1, 1]) {
        const x = s * 0.26;
        // display
        b.box(0.012, 0.28, 0.58, 0x15171a, s * 0.266, 1.6, -0.08);
        b.use('glow');
        b.box(0.008, 0.1, 0.4, 0x8fe8c8, s * 0.274, 1.68, -0.08, { glow: 0.7 });
        b.box(0.008, 0.04, 0.18, P.amber, s * 0.274, 1.56, -0.16, { glow: 0.6 });
        b.box(0.008, 0.04, 0.18, P.amber, s * 0.274, 1.5, -0.16, { glow: 0.45 });
        b.use('matte');
        for (let i = 0; i < 3; i++) b.box(0.012, 0.035, 0.05, [0x5a7a4a, P.mustard, P.brick][i], s * 0.268, 1.5 + i * 0.05, 0.12);
        b.box(0.012, 0.14, 0.1, 0x2a2d32, s * 0.268, 1.55, 0.3);
        // logo on crown, ad panel on body
        b.box(0.008, 0.08, 0.4, P.cream, s * 0.208, 1.9, 0);
        b.box(0.008, 0.46, 0.62, P.teal, s * 0.234, 0.86, 0, { c2: dk(P.teal, 0.6) });
        b.box(0.01, 0.1, 0.4, mix(P.cream, P.teal, 0.3), s * 0.238, 0.98, 0);
        // holster + nozzle
        const zs = s * 0.3;
        b.box(0.08, 0.2, 0.14, 0x2a2d32, s * 0.27, 1.05, zs);
        b.box(0.07, 0.17, 0.06, P.rubber, s * 0.33, 1.12, zs);
        b.box(0.1, 0.06, 0.08, 0x2a2d32, s * 0.33, 1.2, zs);
        b.use('metal').cyl(0.012, 0.016, 0.16, 0x8d9097, s * 0.3, 1.02, zs, { seg: 6 }).use('matte');
        // hose loop
        path(b, [[s * 0.26, 1.36, s * 0.42], [s * 0.35, 1.08, s * 0.5], [s * 0.4, 0.66, s * 0.48], [s * 0.38, 0.44, s * 0.36], [s * 0.36, 0.62, s * 0.2], [s * 0.34, 1.0, s * 0.18], [s * 0.33, 1.12, zs - s * 0.06]], 0.022, 0.022, P.rubber, { seg: 6 });
        void x;
      }
      return b.group();
    },

    gasCanopy(opts = {}) {
      const R = rnd(opts, 1414), b = new GFX.Builder(), red = opt(opts, 'stripe', 0xc0473b), slabC = 0xd8d4c8;
      void R;
      b.use('matte');
      b.box(15, 0.5, 10, slabC, 0, 4.65, 0, { c2: dk(slabC, 0.8) });
      b.box(14.4, 0.04, 9.4, 0xb9b6ad, 0, 4.38, 0);
      // fascia stripe & trims
      for (const s of [-1, 1]) {
        b.box(15.02, 0.2, 0.012, red, 0, 4.62, s * 5.006);
        b.box(0.012, 0.2, 10.02, red, s * 7.506, 4.62, 0);
        b.box(15.04, 0.04, 0.03, 0x2a2d32, 0, 4.41, s * 5.0);
        b.box(0.03, 0.04, 10.04, 0x2a2d32, s * 7.5, 4.41, 0);
        b.box(15.06, 0.05, 0.06, lt(slabC, 0.2), 0, 4.89, s * 5.0);
        b.box(0.06, 0.05, 10.06, lt(slabC, 0.2), s * 7.5, 4.89, 0);
      }
      // grime streaks on fascia
      for (let i = 0; i < 10; i++) { const s = R() < 0.5 ? -1 : 1, len = R.r(0.1, 0.25); b.box(R.r(0.1, 0.4), len, 0.006, dk(slabC, 0.6), R.r(-7, 7), 4.9 - 0.06 - len / 2, s * 5.004, { c2: slabC }); }
      // underside light panels (glow)
      for (const x of [-4.5, 0, 4.5]) for (const z of [-2.2, 2.2]) {
        b.box(1.7, 0.02, 0.6, 0x3a3d42, x, 4.35, z);
        b.use('glow').box(1.6, 0.02, 0.5, P.cool, x, 4.332, z, { glow: 1.3 }).use('matte');
      }
      // columns
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * 6.5, z = sz * 4;
        b.use('metal').box(0.5, 4.0, 0.5, P.steel, x, 2.4, z, { c2: dk(P.steel, 0.6) }).use('matte');
        b.box(0.7, 0.4, 0.7, P.concrete, x, 0.2, z, { c2: mix(P.concrete, P.dirt, 0.6) });
        b.box(0.71, 0.08, 0.71, P.mustard, x, 0.3, z);
        for (let k = 0; k < 4; k++) b.box(0.08, 0.081, 0.716, 0x1d1e20, x - 0.24 + k * 0.16, 0.3, z);
        b.box(0.6, 0.12, 0.6, 0x5a5e64, x, 4.34, z);
      }
      return b.group();
    },

    kiosk(opts = {}) {
      const R = rnd(opts, 1515), b = new GFX.Builder(), wall = opt(opts, 'color', 0x6c7480);
      const wallD = mix(wall, P.dirt, 0.55), trim = dk(wall, 0.7), F = 1.9;
      b.use('matte');
      b.box(8.8, 3.0, 3.8, wall, 0, 1.5, 0, { c2: wallD });
      b.box(8.9, 0.3, 3.9, dk(P.concrete, 0.75), 0, 0.15, 0, { c2: dk(P.concrete, 0.5) });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.24, 3.0, 0.24, trim, sx * 4.38, 1.5, sz * 1.88, { c2: dk(trim, 0.7) });
      // roof + parapet
      b.box(9.0, 0.1, 4.0, 0x3a3d42, 0, 3.05, 0);
      b.box(9.0, 0.1, 0.15, lt(trim, 0.15), 0, 3.15, 1.925);
      b.box(9.0, 0.1, 0.15, lt(trim, 0.15), 0, 3.15, -1.925);
      b.box(0.15, 0.1, 3.7, lt(trim, 0.15), 4.425, 3.15, 0);
      b.box(0.15, 0.1, 3.7, lt(trim, 0.15), -4.425, 3.15, 0);
      b.box(0.4, 0.12, 0.4, 0x5a5e64, -2.5, 3.16, -0.6, { taper: 0.8 });
      // door
      b.box(0.94, 2.04, 0.01, 0x101215, 2.85, 1.33, F + 0.005);
      b.use('glass').box(0.9, 2.0, 0.01, P.glass, 2.85, 1.33, F + 0.03).use('matte');
      ring(b, 1.08, 2.14, 0.08, 0.05, 0x3a3d42, 2.85, 1.35, F + 0.025);
      b.box(0.1, 1.9, 0.05, 0x3a3d42, 2.85, 1.33, F + 0.025);
      b.use('metal').box(0.35, 0.035, 0.04, P.steel, 2.6, 1.1, F + 0.06).box(0.35, 0.035, 0.04, P.steel, 3.1, 1.1, F + 0.06).use('matte');
      b.box(0.26, 0.16, 0.006, P.cream, 2.6, 1.6, F + 0.039);
      b.box(1.3, 0.1, 0.3, P.concrete, 2.85, 0.31, F + 0.12);
      // boarded window
      const wx = -2.4;
      b.box(2.8, 0.06, 0.14, P.concrete, wx, 0.92, F + 0.05);
      b.box(2.5, 1.25, 0.01, 0x0f1114, wx, 1.6, F + 0.005);
      ring(b, 2.6, 1.35, 0.07, 0.05, 0x3a3d42, wx, 1.6, F + 0.025);
      for (let i = 0; i < 5; i++) {
        const c = mix(P.wood, R.pick([0x8a6a45, 0x5a3f28, 0x9a8a72]), R.r(0.2, 0.6));
        b.box(R.r(2.5, 2.8), R.r(0.17, 0.22), 0.025, c, wx + R.r(-0.06, 0.06), 1.05 + i * 0.27, F + 0.064 + (i % 2) * 0.008, { r: [0, 0, R.r(-0.06, 0.06)], c2: dk(c, 0.8) });
      }
      b.box(2.6, 0.18, 0.025, mix(P.wood, 0x8a6a45, 0.4), wx, 1.6, F + 0.095, { r: [0, 0, 0.42] });
      // shutter window
      const sxm = 0.55;
      b.box(2.24, 0.26, 0.2, 0x5a5f66, sxm, 2.33, F + 0.1);
      for (const k of [-1, 1]) b.box(0.06, 1.3, 0.08, 0x4a4f56, sxm + k * 1.05, 1.55, F + 0.04);
      b.box(2.04, 1.26, 0.02, 0x7d8288, sxm, 1.57, F + 0.02, { c2: mix(0x7d8288, P.rust, 0.6) });
      for (let i = 0; i < 12; i++) b.box(2.04, 0.03, 0.02, 0x8d9297, sxm, 0.99 + i * 0.105, F + 0.035);
      b.box(2.06, 0.06, 0.05, 0x3a3d42, sxm, 0.96, F + 0.04);
      b.box(2.4, 0.06, 0.14, P.concrete, sxm, 0.92, F + 0.05);
      // sign (partly dead letters)
      b.box(3.6, 0.45, 0.1, 0x22272f, 1.6, 2.78, F + 0.06);
      for (let i = 0; i < 7; i++) {
        const lit = R() > 0.3, x = 1.6 - 1.26 + i * 0.42;
        if (lit) b.use('glow').box(0.26, 0.24, 0.01, P.amber, x, 2.78, F + 0.115, { glow: 0.9 }).use('matte');
        else b.box(0.26, 0.24, 0.01, 0x5a4220, x, 2.78, F + 0.115);
      }
      // grime streaks on facade
      [[-4.0, -3.8], [-0.9, -0.6], [1.75, 2.25], [3.45, 4.05]].forEach(([a, c]) => { const len = R.r(0.4, 1.2); b.box(R.r(0.08, 0.2), len, 0.006, dk(wall, 0.55), R.r(a, c), 3.0 - len / 2, F + 0.003, { c2: wall }); });
      // side AC unit, downpipe, meter box, back door
      b.box(0.5, 0.9, 0.9, 0xb9b6ad, 4.62, 1.3, -0.6, { c2: 0x7a776f });
      b.cyl(0.3, 0.3, 0.01, 0x2a2c30, 4.875, 1.35, -0.6, { axis: 'x', seg: 12 });
      b.use('metal').cyl(0.05, 0.05, 2.9, 0x5a5e64, 4.47, 1.55, 1.68, { seg: 6 }).use('matte');
      b.box(0.1, 0.6, 0.4, 0x5a5e64, -4.45, 1.4, 0.8);
      ring(b, 1.0, 2.1, 0.07, 0.05, 0x3a3d42, 3.0, 1.33, -F - 0.025);
      b.box(0.86, 1.96, 0.02, 0x5a5f66, 3.0, 1.31, -F - 0.012, { c2: mix(0x5a5f66, P.rust, 0.6) });
      return b.group();
    },

    /* =================================================== street furniture */
    streetLamp(opts = {}) {
      const R = rnd(opts, 1616), b = new GFX.Builder(), glow = opt(opts, 'color', P.sodium), pole = 0x50555c;
      void R;
      b.use('matte').box(0.32, 0.3, 0.32, dk(P.concrete, 0.7), 0, 0.15, 0, { taper: 0.82, c2: dk(P.concrete, 0.45) });
      b.use('metal');
      b.cyl(0.12, 0.14, 0.55, pole, 0, 0.55, 0, { seg: 8, c2: dk(pole, 0.6) });
      b.cyl(0.1, 0.12, 0.06, dk(pole, 0.8), 0, 0.85, 0, { seg: 8 });
      b.cyl(0.065, 0.09, 3.5, pole, 0, 2.6, 0, { seg: 8 });
      b.box(0.004, 0.18, 0.08, dk(pole, 0.7), 0.122, 0.5, 0);
      // arm curving over to +Z
      const pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([0, 4.32 + 0.28 * Math.sin(t * HP), 0.86 * (1 - Math.cos(t * HP))]); }
      path(b, [[0, 4.3, 0], ...pts.slice(1)], 0.06, 0.04, pole, { seg: 6 });
      b.cyl(0.07, 0.065, 0.1, pole, 0, 4.35, 0, { seg: 8 });
      // lamp head (cobra)
      b.at(0, 4.6, 0.92, null, () => {
        b.box(0.34, 0.12, 0.62, 0x5a5f66, 0, 0, 0, { taper: [0.7, 0.85] });
        b.box(0.3, 0.04, 0.56, dk(pole, 0.8), 0, -0.075, 0);
        b.use('glow').box(0.22, 0.02, 0.4, glow, 0, -0.1, 0.02, { glow: 2.2 }).use('matte');
      });
      // flyer / sticker band on pole
      b.box(0.15, 0.22, 0.006, mix(P.cream, P.mustard, 0.3), 0, 1.6, 0.078, { r: [-0.01, 0, 0] });
      return b.group();
    },

    bench(opts = {}) {
      const R = rnd(opts, 1717), b = new GFX.Builder(), wood = opt(opts, 'color', P.wood), iron = 0x2a2d32;
      b.use('metal');
      for (const x of [-0.92, 0.92]) b.at(x, 0, 0, [0, -HP, 0], () => {
        slab(b, [0.22, 0], [0.2, 0.44], 0.05, 0.06, iron);
        slab(b, [-0.24, 0], [-0.2, 0.44], 0.05, 0.06, iron);
        slab(b, [-0.2, 0.42], [-0.29, 0.9], 0.05, 0.06, iron);
        slab(b, [-0.25, 0.42], [0.26, 0.42], 0.05, 0.06, iron);
        slab(b, [-0.24, 0.64], [0.26, 0.64], 0.04, 0.07, iron);
        slab(b, [0.22, 0.43], [0.22, 0.64], 0.04, 0.06, iron);
        b.box(0.12, 0.025, 0.1, iron, 0.22, 0.012, 0); b.box(0.12, 0.025, 0.1, iron, -0.24, 0.012, 0);
      });
      b.use('matte');
      const wc = () => mix(wood, R.pick([0x8a6a45, 0x5a3f28, 0x7a5a3a]), R.r(0.15, 0.45));
      const broken = R.i(0, 6);
      [0.2, 0.08, -0.04, -0.16].forEach((z, i) => {
        const c = wc();
        if (i === broken) { b.box(1.2, 0.035, 0.1, c, -0.5, 0.462, z, { c2: dk(c, 0.75) }); b.box(0.6, 0.035, 0.1, c, 0.8, 0.462, z, { r: [0, 0, -0.04], c2: dk(c, 0.75) }); }
        else b.box(2.2, 0.035, 0.1, c, 0, 0.462, z, { c2: dk(c, 0.75) });
      });
      const th = Math.atan2(-0.09, 0.48);
      [0.3, 0.58, 0.86].forEach((t, i) => {
        const y = 0.42 + 0.48 * t, z = -0.2 - 0.09 * t, c = wc();
        if (i + 4 === broken) return;
        b.box(2.2, 0.1, 0.03, c, 0, y - Math.sin(th) * 0.035, z + Math.cos(th) * 0.035, { r: [th, 0, 0], c2: dk(c, 0.75) });
      });
      return b.group();
    },

    busShelter(opts = {}) {
      const R = rnd(opts, 1818), b = new GFX.Builder(), metal = opt(opts, 'color', 0x5a5f66);
      b.use('matte');
      b.box(2.0, 0.16, 6.0, metal, 0, 2.68, 0, { c2: dk(metal, 0.6) });
      b.box(2.04, 0.06, 6.04, lt(metal, 0.15), 0, 2.79, 0);
      b.box(0.02, 0.1, 5.9, P.mustard, 1.006, 2.68, 0);
      b.use('metal');
      for (const z of [-2.8, 2.8]) b.box(0.2, 2.6, 0.2, metal, -0.8, 1.3, z, { c2: dk(metal, 0.6) });
      b.box(0.08, 2.6, 0.08, metal, -0.8, 1.3, 0);
      for (const y of [0.12, 2.5]) b.box(0.08, 0.06, 5.4, metal, -0.8, y, 0);
      b.use('glass');
      b.box(0.02, 2.32, 2.66, P.glass, -0.8, 1.31, -1.38);
      const crackedPanel = R.chance(0.6);
      if (!crackedPanel || R.chance(0.5)) b.box(0.02, 2.32, 2.66, P.glass, -0.8, 1.31, 1.38);
      b.box(1.0, 2.32, 0.02, P.glass, -0.25, 1.31, 2.8);
      b.use('metal');
      b.box(1.06, 0.06, 0.06, metal, -0.27, 0.12, 2.8); b.box(1.06, 0.06, 0.06, metal, -0.27, 2.5, 2.8);
      b.box(0.06, 2.6, 0.06, metal, 0.23, 1.3, 2.8);
      b.use('matte');
      if (crackedPanel) b.at(-0.785, 1.4, 1.2, [0, 0, HP], () => cracks(b, R, 9, 0.7, crackC));
      // bench
      b.box(0.36, 0.05, 3.0, 0x6b4a2f, -0.55, 0.46, -0.2, { c2: dk(P.wood, 0.7) });
      for (const z of [-1.5, -0.2, 1.1]) { b.box(0.05, 0.44, 0.05, metal, -0.45, 0.22, z); b.box(0.3, 0.04, 0.05, metal, -0.6, 0.42, z); }
      // ad lightbox at -Z end
      b.box(0.9, 1.8, 0.14, 0x2a2d32, -0.3, 1.3, -2.8);
      b.use('glow').box(0.78, 1.64, 0.006, 0xbfd2e8, -0.3, 1.32, -2.8 + 0.073, { glow: 0.6 }).use('matte');
      b.box(0.6, 0.9, 0.006, mix(P.brick, 0x2a2d32, 0.3), -0.3, 1.45, -2.8 + 0.078);
      b.box(0.5, 0.16, 0.006, P.cream, -0.3, 0.75, -2.8 + 0.078);
      // route sign on roof edge
      b.box(0.06, 0.06, 0.06, metal, 0.9, 2.85, 0);
      b.box(0.05, 0.36, 1.2, 0x22272f, 0.95, 3.06, 0);
      b.box(0.006, 0.28, 0.32, P.mustard, 0.978, 3.06, -0.38);
      for (let i = 0; i < 4; i++) b.box(0.006, 0.12, 0.1, P.cream, 0.978, 3.06, 0.0 + i * 0.14);
      return b.group();
    },

    fountain(opts = {}) {
      const R = rnd(opts, 1919), b = new GFX.Builder(), stone = opt(opts, 'color', 0x8a8a82);
      const k = 1 / Math.cos(PI / 8), A = a => a * k, rot = [0, PI / 8, 0], stoneD = mix(stone, P.dirt, 0.55);
      b.use('matte').lathe([[0, 0], [A(2.0), 0], [A(2.0), 0.12], [A(1.93), 0.16], [A(1.93), 0.62], [A(2.0), 0.66], [A(2.0), 0.8], [A(1.74), 0.8], [A(1.74), 0.7], [A(1.7), 0.3], [0, 0.3]],
        stone, 0, 0, 0, { seg: 8, smooth: false, r: rot, c2: stoneD });
      b.use('gloss').cyl(A(1.7), A(1.7), 0.01, 0x1d3340, 0, 0.305, 0, { seg: 8, r: rot, flat: true });
      b.use('glass').cyl(A(1.735), A(1.735), 0.02, P.teal, 0, 0.62, 0, { seg: 8, r: rot, flat: true });
      // centre pillar + upper bowl
      b.use('matte').lathe([[0, 0.3], [0.42, 0.3], [0.42, 0.45], [0.3, 0.5], [0.22, 0.6], [0.18, 1.0], [0.24, 1.08], [0.7, 1.18], [0.72, 1.26], [0.6, 1.3], [0.2, 1.3], [0.12, 1.4], [0.12, 1.6], [0.18, 1.65], [0.1, 1.72], [0, 1.74]],
        stone, 0, 0, 0, { seg: 8, smooth: false, r: rot, c2: stoneD });
      b.use('glass').cyl(0.6, 0.6, 0.02, P.teal, 0, 1.27, 0, { seg: 8, r: rot, flat: true });
      b.use('matte');
      // moss / stains on rim, leaves on water
      for (let i = 0; i < 8; i++) { const a = R() * PI * 2, r = R.r(1.78, 1.95); b.box(R.r(0.15, 0.4), 0.006, R.r(0.08, 0.14), mix(0x4a5a3a, stone, 0.3), Math.sin(a) * r, 0.803, Math.cos(a) * r, { r: [0, a + HP, 0] }); }
      for (let i = 0; i < 6; i++) { const a = R() * PI * 2, r = R.r(0.6, 1.5); b.box(R.r(0.08, 0.14), 0.006, R.r(0.05, 0.09), R.pick([0x6b5a2f, 0x4a5a3a, 0x7a4a2a]), Math.sin(a) * r, 0.634, Math.cos(a) * r, { r: [0, R() * 3, 0] }); }
      return b.group();
    },

    tree(opts = {}) {
      const R = rnd(opts, 2020), b = new GFX.Builder(), dead = !!opt(opts, 'dead', false);
      const bark = dead ? 0x4d453c : 0x5a4532, barkD = dk(bark, 0.55);
      const lx = R.r(-0.25, 0.25), lz = R.r(-0.25, 0.25), top = dead ? R.r(4.2, 4.7) : R.r(3.0, 3.4);
      const T0 = [0, 0, 0], T1 = [lx * 0.3, top * 0.45, lz * 0.3], T2 = [lx, top, lz];
      const at = t => t < 0.45 ? T0.map((v, i) => v + (T1[i] - v) * t / 0.45) : T1.map((v, i) => v + (T2[i] - v) * (t - 0.45) / 0.55);
      b.use('matte');
      rod(b, T0, T1, 0.22, 0.165, bark, { seg: 7, flat: true, c2: barkD });
      rod(b, T1, T2, 0.17, 0.08, bark, { seg: 7, flat: true });
      b.cyl(0.2, 0.31, 0.34, bark, 0, 0.17, 0, { seg: 7, flat: true, c2: barkD });
      for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + R.r(-0.3, 0.3); b.box(0.12, 0.16, 0.28, barkD, Math.cos(a) * 0.24, 0.06, Math.sin(a) * 0.24, { r: [0, -a + HP, 0], taper: [0.5, 0.3] }); }
      const nb = dead ? 5 : 3, ends = [];
      for (let i = 0; i < nb; i++) {
        const a = i / nb * PI * 2 + R.r(-0.4, 0.4), t = R.r(0.55, 0.85), s = at(t), up = dead ? R.r(0.7, 1.4) : R.r(0.55, 0.95), len = dead ? R.r(1.0, 1.6) : R.r(1.0, 1.5);
        const l = Math.hypot(1, up), e = [s[0] + Math.cos(a) / l * len, s[1] + up / l * len, s[2] + Math.sin(a) / l * len];
        const m = [(s[0] + e[0]) / 2 + Math.cos(a) * 0.12, (s[1] + e[1]) / 2 + 0.12, (s[2] + e[2]) / 2 + Math.sin(a) * 0.12];
        path(b, [s, m, e], 0.085, 0.035, bark, { seg: 5, flat: true });
        ends.push([e, a]);
        if (dead) for (let k = 0; k < 2; k++) {
          const a2 = a + R.r(-0.9, 0.9), u2 = R.r(0.4, 1.2), l2 = R.r(0.4, 0.8), q = Math.hypot(1, u2);
          rod(b, e, [e[0] + Math.cos(a2) / q * l2, e[1] + u2 / q * l2, e[2] + Math.sin(a2) / q * l2], 0.035, 0.015, bark, { seg: 4, flat: true });
        }
      }
      if (dead) {
        for (let k = 0; k < 3; k++) { const a2 = R() * PI * 2, l2 = R.r(0.5, 0.9); rod(b, T2, [T2[0] + Math.cos(a2) * 0.35 * l2, T2[1] + l2, T2[2] + Math.sin(a2) * 0.35 * l2], 0.06, 0.02, bark, { seg: 4, flat: true }); }
        return b.group();
      }
      const greens = [0x3f5a3a, 0x4a6440, 0x37503a, 0x52683e];
      const clump = (x, y, z, r) => { const g = mix(R.pick(greens), 0x6f7a5a, R.r(0, 0.3)); b.add(blob(r, R, 0.28), g, x, y, z, { s: [1, R.r(0.75, 0.9), 1], r: [0, R() * 3, 0], c2: dk(g, 0.45) }); };
      clump(T2[0], T2[1] + 0.85, T2[2], R.r(1.25, 1.45));
      ends.forEach(([e, a]) => clump(e[0] + Math.cos(a) * 0.15, e[1] + 0.3, e[2] + Math.sin(a) * 0.15, R.r(0.85, 1.1)));
      if (R.chance(0.6)) { const a = R() * PI * 2; clump(T2[0] + Math.cos(a) * 0.7, T2[1] + 0.2, T2[2] + Math.sin(a) * 0.7, R.r(0.8, 1.0)); }
      return b.group();
    },

    hydrant(opts = {}) {
      const R = rnd(opts, 2121), b = new GFX.Builder(), col = opt(opts, 'color', P.brick);
      void R;
      b.use('gloss').lathe([[0, 0], [0.17, 0], [0.17, 0.05], [0.12, 0.07], [0.11, 0.09], [0.11, 0.52], [0.14, 0.54], [0.14, 0.58], [0.12, 0.6], [0.1, 0.68], [0.05, 0.72], [0, 0.73]],
        col, 0, 0, 0, { seg: 10, c2: mix(col, P.rust, 0.85) });
      b.cyl(0.03, 0.035, 0.06, dk(col, 0.7), 0, 0.75, 0, { seg: 5, flat: true });
      for (const s of [-1, 1]) {
        b.cyl(0.045, 0.045, 0.1, col, s * 0.14, 0.42, 0, { axis: 'x', seg: 8 });
        b.cyl(0.055, 0.055, 0.03, dk(col, 0.75), s * 0.2, 0.42, 0, { axis: 'x', seg: 6, flat: true });
      }
      b.cyl(0.065, 0.065, 0.1, col, 0, 0.36, 0.14, { axis: 'z', seg: 8 });
      b.cyl(0.075, 0.075, 0.035, dk(col, 0.75), 0, 0.36, 0.2, { axis: 'z', seg: 6, flat: true });
      b.use('metal');
      for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; b.cyl(0.012, 0.012, 0.03, 0x6a6e75, Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, { seg: 5 }); }
      b.use('matte');
      b.box(0.08, 0.006, 0.06, P.cream, 0.0, 0.70, 0.07, { r: [0.5, 0, 0] });
      return b.group();
    },

    trashCan(opts = {}) {
      const R = rnd(opts, 2222), b = new GFX.Builder(), col = opt(opts, 'color', R.pick([0x7d8288, 0x3f5a46, 0x2f4f6f]));
      b.use('metal').lathe([[0, 0.01], [0.24, 0.0], [0.25, 0.02], [0.26, 0.24], [0.27, 0.26], [0.265, 0.28], [0.27, 0.5], [0.28, 0.52], [0.275, 0.54], [0.28, 0.82], [0.29, 0.84], [0.285, 0.86], [0.27, 0.85], [0, 0.85]],
        col, 0, 0, 0, { seg: 12, c2: mix(col, P.rust, 0.7) });
      const tilt = R.chance(0.4) ? R.r(0.08, 0.2) : 0;
      b.at(0, 0.86, tilt ? 0.06 : 0, [tilt, 0, 0], () => {
        b.lathe([[0.295, 0], [0.3, 0.02], [0.24, 0.07], [0.1, 0.1], [0, 0.105]], dk(col, 0.9), 0, 0, 0, { seg: 12 });
        b.box(0.18, 0.04, 0.03, dk(col, 0.7), 0, 0.125, 0);
      });
      for (const s of [-1, 1]) b.box(0.03, 0.04, 0.12, dk(col, 0.7), s * 0.29, 0.75, 0);
      b.use('matte');
      if (tilt) b.add(blob(0.18, R, 0.4), 0x23282a, 0, 0.88, 0.02, { s: [1, 0.6, 1] });
      return b.group();
    },

    mailbox(opts = {}) {
      const R = rnd(opts, 2323), b = new GFX.Builder(), col = opt(opts, 'color', 0x2f4f6f);
      void R;
      const prof = [[-0.24, 0.32], [0.24, 0.32], [0.24, 0.98], ...arc(0, 0.98, 0.24, 0, PI, 6).slice(1)];
      b.use('gloss').prism(prof, 0.46, col, 0, 0, 0, { bevel: 0.015, c2: dk(col, 0.6) });
      b.use('matte');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 0.33, 0.05, dk(col, 0.6), sx * 0.2, 0.165, sz * 0.19);
      b.box(0.44, 0.03, 0.44, dk(col, 0.5), 0, 0.33, 0);
      // pull door
      b.at(0, 0.98, 0.246, [-0.15, 0, 0], () => { b.box(0.36, 0.2, 0.02, dk(col, 0.9), 0, 0.04, 0); b.box(0.16, 0.025, 0.03, 0x6a6e75, 0, 0.12, 0.012); });
      b.box(0.3, 0.3, 0.006, dk(col, 0.82), 0, 0.62, 0.248);
      b.box(0.22, 0.1, 0.006, P.cream, 0, 0.74, 0.251);
      b.box(0.1, 0.06, 0.006, mix(P.brick, P.cream, 0.3), 0.1, 0.5, 0.251);
      for (const s of [-1, 1]) b.box(0.006, 0.18, 0.24, dk(col, 0.82), s * 0.248, 0.7, 0);
      return b.group();
    },

    trafficCone(opts = {}) {
      const R = rnd(opts, 2424), b = new GFX.Builder(), col = opt(opts, 'color', 0xd2622b);
      const fallen = !!opt(opts, 'fallen', false);
      const build = () => {
        b.use('matte').box(0.4, 0.04, 0.4, dk(col, 0.45), 0, 0.02, 0, { taper: 0.9 });
        const r = y => 0.15 - 0.125 * (y - 0.04) / 0.62;
        b.cyl(0.025, 0.15, 0.62, col, 0, 0.35, 0, { seg: 12, c2: mix(col, P.dirt, 0.5) });
        b.use('gloss');
        b.cyl(r(0.5) + 0.004, r(0.42) + 0.004, 0.08, 0xd8dcd8, 0, 0.46, 0, { seg: 12 });
        b.cyl(r(0.3) + 0.004, r(0.24) + 0.004, 0.06, 0xd8dcd8, 0, 0.27, 0, { seg: 12 });
        b.use('matte');
      };
      if (fallen) b.at(0, 0.2, 0, [0, R() * 3, HP * 0.95], build); else build();
      return b.group();
    },

    trashBags(opts = {}) {
      const R = rnd(opts, 2525), b = new GFX.Builder(), n = R.i(3, 4);
      const spots = [[-0.3, -0.18], [0.28, -0.2], [0.0, 0.25], [-0.05, -0.05]];
      b.use('gloss');
      for (let i = 0; i < n; i++) {
        const r = R.r(0.28, 0.36), c = R.pick([0x23282a, 0x2c3a2f, 0x1e2226, 0x3a3f45]), [x, z] = spots[i], sy = R.r(0.75, 0.95), y = i === 3 ? 0.36 : r * sy * 0.95;
        b.add(blob(r, R, 0.35), c, x, y, z, { s: [1, sy, R.r(0.85, 1.05)], r: [0, R() * 3, 0], c2: dk(c, 0.6) });
        b.cyl(0.03, 0.05, 0.1, c, x, y + r * sy * 0.95, z, { seg: 5, flat: true });
        b.cyl(0.05, 0.02, 0.06, c, x + 0.02, y + r * sy * 0.95 + 0.07, z, { seg: 5, flat: true, r: [0.4, 0, 0.3] });
      }
      b.use('matte');
      b.box(0.14, 0.06, 0.1, mix(P.cream, P.dirt, 0.3), 0.45, 0.03, 0.22, { r: [0, 0.6, 0] });
      return b.group();
    },

    roadSign(opts = {}) {
      const R = rnd(opts, 2626), b = new GFX.Builder(), type = opt(opts, 'type', R.pick(['stop', 'warn', 'speed']));
      const lean = R.r(-0.06, 0.06), twist = R.r(-0.25, 0.25);
      b.use('matte').box(0.2, 0.06, 0.2, dk(P.concrete, 0.6), 0, 0.03, 0);
      b.at(0, 0, 0, [lean, 0, lean * 0.5], () => {
        b.use('metal').cyl(0.03, 0.03, 2.5, 0x7d8288, 0, 1.25, 0, { seg: 6, c2: P.rust });
        b.at(0, 2.15, 0.04, [0, twist, 0], () => {
          for (const y of [-0.15, 0.15]) b.box(0.08, 0.04, 0.05, 0x5a5e64, 0, y, -0.02);
          b.use('matte');
          if (type === 'stop') {
            b.cyl(0.4, 0.4, 0.015, 0xd8d4c8, 0, 0, 0.01, { axis: 'z', seg: 8, r: [0, 0, PI / 8], flat: true });
            b.cyl(0.36, 0.36, 0.008, 0xa3302a, 0, 0, 0.02, { axis: 'z', seg: 8, r: [0, 0, PI / 8], flat: true });
            for (let i = 0; i < 4; i++) b.box(0.1, 0.16, 0.006, 0xd8d4c8, -0.24 + i * 0.16, 0, 0.026);
            b.cyl(0.4, 0.4, 0.006, 0x7d8288, 0, 0, 0.0, { axis: 'z', seg: 8, r: [0, 0, PI / 8], flat: true });
          } else if (type === 'warn') {
            b.box(0.56, 0.56, 0.015, 0x1d1e20, 0, 0, 0.01, { r: [0, 0, PI / 4] });
            b.box(0.5, 0.5, 0.008, P.mustard, 0, 0, 0.02, { r: [0, 0, PI / 4] });
            b.box(0.06, 0.2, 0.006, 0x1d1e20, 0, 0.05, 0.026); b.box(0.06, 0.06, 0.006, 0x1d1e20, 0, -0.14, 0.026);
          } else {
            b.box(0.5, 0.64, 0.015, 0x1d1e20, 0, 0, 0.01);
            b.box(0.46, 0.6, 0.008, 0xd8d4c8, 0, 0, 0.02);
            b.box(0.34, 0.06, 0.006, 0x1d1e20, 0, 0.2, 0.026);
            for (const x of [-0.08, 0.08]) { b.box(0.12, 0.2, 0.006, 0x1d1e20, x, -0.06, 0.026); b.box(0.06, 0.12, 0.007, 0xd8d4c8, x, -0.06, 0.028); }
          }
          // bullet holes, grime
          for (let i = 0; i < 4; i++) b.box(0.025, 0.025, 0.006, 0x111214, R.r(-0.2, 0.2), R.r(-0.2, 0.2), 0.03);
          b.box(0.3, 0.12, 0.006, dk(P.dirt, 0.8), R.r(-0.1, 0.1), -0.2, 0.031, { c2: P.dirt });
        });
      });
      return b.group();
    },

    powerPole(opts = {}) {
      const R = rnd(opts, 2727), b = new GFX.Builder(), wood = 0x5a4a3a;
      b.use('matte').cyl(0.12, 0.17, 8.0, wood, 0, 4.0, 0, { seg: 7, flat: true, c2: dk(wood, 0.55) });
      b.cyl(0.13, 0.13, 0.04, 0x3a3d42, 0, 8.0, 0, { seg: 7 });
      // crossarm + braces
      b.box(2.2, 0.1, 0.1, dk(wood, 0.9), 0, 7.45, 0.14);
      for (const s of [-1, 1]) slab(b, [0, 6.95], [s * 0.65, 7.4], 0.04, 0.03, 0x5a5e64, 0.11, 0);
      b.use('gloss');
      for (const x of [-0.95, -0.35, 0.95]) {
        b.lathe([[0, 0], [0.04, 0], [0.07, 0.03], [0.04, 0.06], [0.07, 0.09], [0.04, 0.12], [0.06, 0.15], [0.02, 0.18], [0, 0.18]], 0x6f9a8a, x, 7.5, 0.14, { seg: 8 });
      }
      b.use('matte');
      // transformer
      b.use('metal');
      b.cyl(0.24, 0.24, 0.7, 0x7d8288, 0, 6.2, 0.42, { seg: 10, c2: dk(0x7d8288, 0.7) });
      b.cyl(0.26, 0.24, 0.06, 0x6a6e75, 0, 6.58, 0.42, { seg: 10 });
      b.box(0.06, 0.5, 0.2, 0x5a5e64, 0, 6.2, 0.2);
      b.use('gloss').lathe([[0, 0], [0.03, 0], [0.04, 0.04], [0.025, 0.08], [0, 0.09]], 0x6f9a8a, 0.1, 6.61, 0.42, { seg: 6 }).use('matte');
      // climbing steps
      b.use('metal');
      for (let i = 0; i < 10; i++) { const y = 2.4 + i * 0.4, s = i % 2 ? 1 : -1; b.cyl(0.012, 0.012, 0.22, 0x6a6e75, s * 0.2, y, 0, { axis: 'x', seg: 5 }); }
      b.use('matte');
      // staples / posters
      for (let i = 0; i < 3; i++) { const a = R() * PI * 2, y = R.r(1.3, 2.0); b.box(R.r(0.14, 0.22), R.r(0.2, 0.28), 0.006, R.pick([P.cream, mix(P.cream, P.mustard, 0.4), 0xa8a397]), Math.sin(a) * 0.158, y, Math.cos(a) * 0.158, { r: [0, a, 0] }); }
      // wire stubs (short sagging ends)
      for (const x of [-0.95, -0.35, 0.95]) path(b, [[x, 7.66, 0.14], [x, 7.6, 0.5], [x, 7.62, 0.9]], 0.008, 0.008, 0x1a1b1d, { seg: 4 });
      for (const x of [-0.95, -0.35, 0.95]) path(b, [[x, 7.66, 0.14], [x, 7.6, -0.22], [x, 7.62, -0.6]], 0.008, 0.008, 0x1a1b1d, { seg: 4 });
      return b.group();
    },

    acUnit(opts = {}) {
      const R = rnd(opts, 2828), b = new GFX.Builder(), col = opt(opts, 'color', 0xb9b6ad);
      b.use('matte');
      for (const x of [-0.42, 0.42]) b.box(0.08, 0.06, 0.5, 0x3a3d42, x, 0.03, 0);
      b.box(1.0, 0.72, 0.48, col, 0, 0.42, 0, { c2: mix(col, P.dirt, 0.6) });
      b.box(1.0, 0.03, 0.48, lt(col, 0.1), 0, 0.795, 0);
      // fan
      b.cyl(0.27, 0.27, 0.006, 0x15171a, 0.2, 0.44, 0.243, { axis: 'z', seg: 16 });
      b.cyl(0.07, 0.07, 0.03, 0x3a3d42, 0.2, 0.44, 0.235, { axis: 'z', seg: 8 });
      for (let i = 0; i < 3; i++) b.box(0.22, 0.07, 0.01, 0x4a4d52, 0.2 + Math.cos(i * 2.09) * 0.12, 0.44 + Math.sin(i * 2.09) * 0.12, 0.235, { r: [0.3, 0, i * 2.09] });
      b.use('metal');
      for (const r of [0.27, 0.18, 0.09]) b.add(new THREE.TorusGeometry(r, 0.006, 3, 16), 0x6a6e75, 0.2, 0.44, 0.25);
      b.box(0.54, 0.012, 0.012, 0x6a6e75, 0.2, 0.44, 0.252); b.box(0.012, 0.54, 0.012, 0x6a6e75, 0.2, 0.44, 0.252);
      b.use('matte');
      // louvres
      for (let i = 0; i < 9; i++) b.box(0.32, 0.02, 0.02, dk(col, 0.6), -0.27, 0.16 + i * 0.065, 0.245, { r: [0.5, 0, 0] });
      // pipes out of the side
      b.use('metal');
      path(b, [[-0.5, 0.25, -0.1], [-0.58, 0.25, -0.1], [-0.6, 0.05, -0.1]], 0.025, 0.025, 0x2a2c30, { seg: 6 });
      path(b, [[-0.5, 0.33, -0.0], [-0.56, 0.33, -0.0], [-0.58, 0.05, 0.0]], 0.012, 0.012, 0xa86a3a, { seg: 5 });
      b.use('matte');
      b.box(0.006, 0.2, 0.12, P.cream, 0.503, 0.6, 0.0);
      for (let i = 0; i < 3; i++) { const len = R.r(0.1, 0.3); b.box(R.r(0.03, 0.06), len, 0.006, P.rust, R.r(-0.45, 0.45), 0.78 - len / 2, -0.243, { c2: col }); }
      return b.group();
    },

    vending(opts = {}) {
      const R = rnd(opts, 2929), b = new GFX.Builder(), col = opt(opts, 'color', R.pick([P.brick, P.teal, 0x2f4f6f]));
      const D = 0.39;
      b.use('matte');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 0.04, 0.08, 0x2a2d32, sx * 0.42, 0.02, sz * 0.32);
      b.box(1.0, 1.86, 0.78, col, 0, 0.97, 0, { c2: mix(col, P.dirt, 0.55) });
      b.box(1.0, 0.1, 0.78, dk(col, 0.7), 0, 1.85, 0);
      // window
      const wx = -0.12, wy = 1.27;
      b.use('glow').box(0.6, 1.05, 0.01, 0xcfe4ff, wx, wy, D + 0.006, { glow: 0.42 }).use('matte');
      const pcols = [P.brick, P.teal, P.mustard, P.olive, P.cream, 0x8a4a3c, 0x2f4f6f];
      for (let r = 0; r < 5; r++) {
        const y = wy - 0.45 + r * 0.21;
        b.box(0.6, 0.012, 0.06, 0x3a3d42, wx, y - 0.005, D + 0.04);
        for (let i = 0; i < 6; i++) if (R() > 0.15) { const c = R.pick(pcols); b.box(0.07, 0.13, 0.05, c, wx - 0.25 + i * 0.1, y + 0.067, D + 0.04, { c2: dk(c, 0.6) }); }
      }
      b.use('glass').box(0.62, 1.07, 0.008, P.glass, wx, wy, D + 0.075).use('matte');
      ring(b, 0.7, 1.15, 0.05, 0.08, dk(col, 0.6), wx, wy, D + 0.04);
      b.box(0.012, 1.0, 0.008, 0x3a3d42, wx, wy, D + 0.083);
      // selection panel
      b.box(0.2, 0.62, 0.03, 0x22252a, 0.36, 1.4, D + 0.015);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) b.box(0.05, 0.04, 0.01, 0x4a4d52, 0.32 + c * 0.08, 1.28 + r * 0.06, D + 0.033);
      b.use('glow').box(0.14, 0.05, 0.008, P.cyan, 0.36, 1.62, D + 0.033, { glow: 0.7 }).use('matte');
      b.box(0.04, 0.08, 0.012, 0x0d0e10, 0.33, 1.16, D + 0.034);
      b.box(0.1, 0.03, 0.012, 0x0d0e10, 0.39, 1.06, D + 0.034);
      // delivery bin
      b.box(0.62, 0.24, 0.02, 0x0f1012, wx, 0.36, D + 0.01);
      b.box(0.6, 0.12, 0.02, 0x3a3d42, wx, 0.42, D + 0.03, { r: [-0.25, 0, 0] });
      // brand stripe & stickers
      b.box(1.0, 0.12, 0.006, lt(col, 0.3), 0, 1.92 - 0.12, D + 0.004);
      b.box(0.24, 0.5, 0.006, mix(col, P.cream, 0.35), 0.36, 0.7, D + 0.004);
      for (const s of [-1, 1]) b.box(0.006, 0.5, 0.5, mix(col, P.cream, 0.25), s * 0.503, 1.3, 0);
      if (R.chance(0.7)) dent(b, 0.3, 0.5, D, 1, col);
      return b.group();
    },

    /* =================================================== store interior */
    shelf(opts = {}) {
      const R = rnd(opts, 3030), b = new GFX.Builder(), w = opt(opts, 'w', 4.5), hw = w / 2;
      const frameC = 0x8d9097, deck = 0xa9adb2;
      b.use('matte');
      b.box(w - 0.02, 0.12, 0.76, 0x2a2d32, 0, 0.06, 0);
      b.box(w - 0.04, 1.68, 0.04, 0x9ea2a8, 0, 0.96, 0, { c2: 0x6f7378 });
      for (const s of [-1, 1]) b.box(0.03, 1.8, 0.8, frameC, s * (hw - 0.015), 0.9, 0, { c2: dk(frameC, 0.6) });
      const nUp = Math.max(1, Math.round(w / 1.2));
      for (let i = 1; i < nUp; i++) b.box(0.04, 1.68, 0.06, dk(frameC, 0.8), -hw + i * w / nUp, 0.96, 0);
      b.box(w, 0.04, 0.1, dk(frameC, 0.8), 0, 1.78, 0);
      const levels = [0.12, 0.5, 0.88, 1.26], tops = [0.12, 0.5125, 0.8925, 1.2725];
      const pcols = [0xb8453a, 0x3d6c8a, 0xc9a227, 0x5a7a4a, 0x8a4a3c, 0xd8d4c8, 0x6f7a5a, 0x6e5a7a, 0x9a6a3a, 0x4a5560, 0xa89a7c];
      for (const s of [-1, 1]) {
        levels.forEach((y, li) => {
          if (li > 0) {
            b.box(w - 0.06, 0.025, 0.36, deck, 0, y, s * 0.2);
            b.box(w - 0.06, 0.045, 0.008, P.cream, 0, y - 0.005, s * 0.384);
          }
          const y0 = tops[li], maxH = li < 3 ? 0.32 : 0.36;
          let x = -hw + 0.06;
          while (x < hw - 0.1) {
            if (R() < 0.14) { x += R.r(0.12, 0.45); continue; }
            const t = R(), c = R.pick(pcols), fall = R() < 0.07;
            if (t < 0.5) {
              const bw = R.r(0.08, 0.2), bh = R.r(0.1, maxH - 0.04), bd = R.r(0.14, 0.3), n = R.i(1, 3);
              if (x + bw * n > hw - 0.06) break;
              if (fall) { b.box(bh, bw, bd, c, x + bh / 2, y0 + bw / 2, s * (0.37 - bd / 2), { c2: dk(c, 0.75) }); x += bh + 0.02; continue; }
              for (let k = 0; k < n; k++) {
                b.box(bw - 0.008, bh, bd, c, x + bw * (k + 0.5), y0 + bh / 2, s * (0.37 - bd / 2), { c2: dk(c, 0.75) });
                b.box(bw - 0.012, bh * 0.3, 0.006, lt(c, 0.35), x + bw * (k + 0.5), y0 + bh * 0.6, s * (0.37 + 0.003));
              }
              x += bw * n + 0.015;
            } else if (t < 0.78) {
              const n = R.i(2, 5), r = 0.034, h = 0.11, stack = maxH > 0.26 && R.chance(0.4);
              if (x + n * 0.072 > hw - 0.06) break;
              if (fall) { b.cyl(r, r, h, c, x + 0.06, y0 + r, s * 0.3, { axis: 'z', seg: 6, r: [0, R.r(0.3, 1.2), 0] }); x += 0.14; continue; }
              for (let k = 0; k < n; k++) for (let j = 0; j < (stack ? 2 : 1); j++) b.cyl(r, r, h, c, x + 0.036 + k * 0.072, y0 + h / 2 + j * h, s * 0.33, { seg: 6, c2: dk(c, 0.7) });
              x += n * 0.072 + 0.015;
            } else {
              const n = R.i(2, 4), r = 0.035, h = Math.min(maxH - 0.1, R.r(0.16, 0.22));
              if (x + n * 0.08 > hw - 0.06) break;
              b.use('gloss');
              if (fall) { b.cyl(r, r, h, c, x + h / 2, y0 + r, s * 0.32, { axis: 'x', seg: 6 }); b.use('matte'); x += h + 0.03; continue; }
              for (let k = 0; k < n; k++) {
                const bx = x + 0.04 + k * 0.08;
                b.cyl(r, r, h, c, bx, y0 + h / 2, s * 0.33, { seg: 6, c2: dk(c, 0.7) });
                b.cyl(0.013, r * 0.8, 0.06, c, bx, y0 + h + 0.03, s * 0.33, { seg: 5 });
              }
              b.use('matte');
              x += n * 0.08 + 0.015;
            }
          }
        });
      }
      // items fallen on the floor
      const nf = R.i(0, 2);
      for (let i = 0; i < nf; i++) { const s = R() < 0.5 ? -1 : 1, c = R.pick(pcols); b.box(R.r(0.12, 0.25), R.r(0.06, 0.1), R.r(0.14, 0.22), c, R.r(-hw + 0.3, hw - 0.3), 0.04, s * R.r(0.44, 0.5), { r: [0, R() * 3, 0], c2: dk(c, 0.7) }); }
      return b.group();
    },

    counter(opts = {}) {
      const R = rnd(opts, 3131), b = new GFX.Builder(), wood = opt(opts, 'color', P.wood);
      b.use('matte');
      b.box(4.3, 0.1, 1.1, 0x1d1f23, 0, 0.05, 0);
      b.box(4.36, 0.94, 1.14, dk(wood, 0.85), 0, 0.57, 0, { c2: dk(wood, 0.55) });
      b.box(4.6, 0.06, 1.3, 0xd8d4c8, 0, 1.07, 0, { c2: 0xb9b5aa });
      b.box(4.62, 0.02, 1.32, 0x6a6e75, 0, 1.035, 0);
      // front (+Z) wood panels
      for (let i = 0; i < 4; i++) {
        const x = -1.62 + i * 1.08, c = mix(wood, 0x8a6a45, R.r(0.15, 0.4));
        b.box(0.96, 0.7, 0.02, c, x, 0.58, 0.58, { c2: dk(c, 0.75) });
        for (let k = 0; k < 4; k++) b.box(0.006, 0.66, 0.006, dk(c, 0.75), x - 0.36 + k * 0.24, 0.58, 0.593);
      }
      b.box(4.36, 0.08, 0.03, dk(wood, 0.7), 0, 0.98, 0.585);
      // back: cubbies
      b.box(4.2, 0.03, 0.4, dk(wood, 0.7), 0, 0.55, -0.4);
      for (let i = 0; i < 6; i++) if (R() > 0.3) { const c = R.pick([P.brick, P.teal, P.cream, P.mustard]); b.box(R.r(0.2, 0.4), R.r(0.1, 0.25), 0.25, c, -1.8 + i * 0.72, 0.565 + 0.06, -0.42, { c2: dk(c, 0.7) }); }
      b.box(4.2, 0.6, 0.006, 0x14161a, 0, 0.55, -0.573);
      // cash register (faces the cashier at -Z)
      const T = 1.1;
      b.at(-1.0, T, -0.15, null, () => {
        b.box(0.44, 0.12, 0.42, 0x3a3d42, 0, 0.06, 0);
        b.box(0.38, 0.006, 0.006, 0x15171a, 0, 0.05, -0.213);
        b.box(0.36, 0.08, 0.22, 0x2a2d32, 0, 0.15, -0.06, { taper: [1, 0.5] });
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) b.box(0.04, 0.012, 0.035, P.cream, -0.09 + c * 0.06, 0.16 + r * 0.02, -0.12 + r * 0.05);
        b.box(0.04, 0.22, 0.04, 0x2a2d32, 0, 0.23, 0.12);
        b.at(0, 0.36, 0.12, [-0.35, 0, 0], () => {
          b.box(0.3, 0.2, 0.04, 0x22252a, 0, 0, 0);
          b.use('glow').box(0.25, 0.15, 0.006, P.cyan, 0, 0, -0.023, { glow: 0.45 }).use('matte');
        });
        b.box(0.12, 0.06, 0.006, 0x22252a, 0, 0.32, 0.143);
        b.use('glow').box(0.1, 0.04, 0.004, 0x8fe8a8, 0, 0.32, 0.147, { glow: 0.5 }).use('matte');
      });
      // card terminal
      b.box(0.1, 0.03, 0.16, 0x22252a, -0.4, T + 0.015, 0.2, { r: [0, 0.3, 0] });
      // display rack (+Z side, at the right end)
      b.at(1.55, T, 0.1, null, () => {
        b.use('metal');
        for (const s of [-1, 1]) slab(b, [0.0, 0.0], [-0.08, 0.45], 0.02, 0.4, 0x5a5e64, s * 0.3);
        b.use('matte');
        for (const s of [-1, 1]) b.box(0.03, 0.46, 0.4, 0x4a4d52, s * 0.3, 0.23, 0, { taper: [1, 0.4] });
        for (let t = 0; t < 3; t++) {
          const y = 0.05 + t * 0.14, z = 0.12 - t * 0.09;
          b.box(0.58, 0.012, 0.16, 0x5a5e64, 0, y, z, { r: [-0.2, 0, 0] });
          for (let i = 0; i < 6; i++) if (R() > 0.2) { const c = R.pick([P.brick, P.mustard, P.teal, P.olive, P.cream]); b.box(0.07, 0.1, 0.03, c, -0.24 + i * 0.095, y + 0.06, z + 0.02, { r: [-0.2, 0, 0] }); }
        }
      });
      // wear on top
      b.box(0.5, 0.006, 0.3, dk(0xd8d4c8, 0.75), R.r(-1.5, 1.5), 1.103, R.r(-0.3, 0.3), { c2: 0xd8d4c8 });
      return b.group();
    },

    fridge(opts = {}) {
      const R = rnd(opts, 3232), b = new GFX.Builder(), col = opt(opts, 'color', 0x3a3e45);
      const Z = 0.35;
      b.use('matte');
      b.box(2.4, 2.0, 0.05, col, 0, 1.0, -0.325);
      for (const s of [-1, 1]) b.box(0.06, 2.0, 0.7, col, s * 1.17, 1.0, 0, { c2: dk(col, 0.6) });
      b.box(2.4, 0.3, 0.7, col, 0, 1.85, 0);
      b.box(2.4, 0.3, 0.7, dk(col, 0.8), 0, 0.15, 0);
      for (let i = 0; i < 6; i++) b.box(2.2, 0.02, 0.006, 0x15171a, 0, 0.06 + i * 0.04, Z + 0.003);
      // header sign
      b.box(2.2, 0.18, 0.006, 0x15171a, 0, 1.86, Z + 0.003);
      b.use('glow').box(1.2, 0.08, 0.006, P.cyan, 0, 1.86, Z + 0.008, { glow: 0.9 }).use('matte');
      // interior
      b.use('glow').box(2.28, 1.4, 0.008, 0x9fb8d8, 0, 1.0, -0.296, { glow: 0.42 }).use('matte');
      b.box(2.28, 0.01, 0.62, 0x6a6e75, 0, 0.305, 0.02);
      const pcols = [P.brick, P.teal, P.mustard, P.olive, 0xd8d4c8, 0x2f4f6f, 0x8a4a3c];
      [0.31, 0.66, 1.01, 1.36].forEach((y, li) => {
        if (li > 0) b.box(2.28, 0.015, 0.56, 0x8d9097, 0, y, -0.01);
        for (let d = 0; d < 3; d++) {
          const x0 = -0.78 + d * 0.78;
          for (let i = 0; i < 5; i++) {
            if (R() < 0.18) continue;
            const x = x0 - 0.28 + i * 0.14, c = R.pick(pcols), yy = y + 0.008;
            if (R() < 0.6) {
              b.use('gloss').cyl(0.032, 0.035, 0.19, c, x, yy + 0.095, 0.1, { seg: 6, c2: dk(c, 0.7) });
              b.box(0.022, 0.06, 0.022, c, x, yy + 0.22, 0.1);
              b.use('matte');
            } else b.box(0.065, 0.12, 0.065, c, x, yy + 0.06, 0.1, { c2: dk(c, 0.7) });
          }
        }
      });
      // doors
      for (let d = 0; d < 3; d++) {
        const x = -0.78 + d * 0.78, open = d === 2 && R.chance(0.4);
        b.at(x + 0.37, 1.0, Z + 0.02, [0, open ? 0.35 : 0, 0], () => {
          ring(b, 0.76, 1.4, 0.05, 0.04, 0x2a2d32, -0.37, 0, 0);
          b.use('glass').box(0.68, 1.32, 0.012, P.glass, -0.37, 0, 0.0).use('matte');
          b.use('metal').box(0.025, 0.6, 0.04, P.steel, -0.67, 0.05, 0.04).use('matte');
        });
      }
      for (const x of [-0.39, 0.39]) b.box(0.04, 1.4, 0.03, 0x2a2d32, x, 1.0, Z + 0.0);
      return b.group();
    },

    gacha(opts = {}) {
      const R = rnd(opts, 3333), b = new GFX.Builder(), col = opt(opts, 'color', 0x8c2f39), gold = 0xc9a227;
      void R;
      b.use('matte');
      b.box(1.3, 0.12, 1.3, 0x22252a, 0, 0.06, 0);
      b.box(1.2, 1.38, 1.2, col, 0, 0.81, 0, { c2: dk(col, 0.6) });
      b.box(1.24, 0.06, 1.24, gold, 0, 1.53, 0);
      b.box(1.16, 0.5, 1.16, col, 0, 1.81, 0, { taper: 0.94, c2: dk(col, 0.8) });
      b.use('metal').box(1.3, 0.06, 1.3, gold, 0, 2.07, 0).use('matte');
      // corner trims
      b.use('metal');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 1.38, 0.05, gold, sx * 0.6, 0.81, sz * 0.6);
      b.use('matte');
      // front (+Z): label panel, coin plate, crank, chute
      const F = 0.6;
      b.box(0.9, 0.36, 0.01, 0xd8cdb0, 0, 1.8, 0.585 * 0.94 + 0.01);
      for (let i = 0; i < 5; i++) b.box(0.1, 0.1, 0.006, [P.amber, P.teal, P.brick, P.olive, P.cyan][i], -0.32 + i * 0.16, 1.8, 0.585 * 0.94 + 0.018, { r: [0, 0, PI / 4] });
      b.use('metal').box(0.5, 0.5, 0.03, 0x8d9097, 0, 1.12, F + 0.015).use('matte');
      b.box(0.02, 0.1, 0.01, 0x0d0e10, -0.12, 1.24, F + 0.034);
      b.use('glow').box(0.07, 0.13, 0.004, P.amber, -0.12, 1.24, F + 0.031, { glow: 0.7 }).use('matte');
      b.box(0.02, 0.1, 0.012, 0x0d0e10, -0.12, 1.24, F + 0.036);
      b.use('metal');
      b.cyl(0.11, 0.11, 0.04, 0xb9bcc0, 0.08, 1.05, F + 0.05, { axis: 'z', seg: 12 });
      b.box(0.24, 0.05, 0.04, 0xb9bcc0, 0.08, 1.05, F + 0.09, { r: [0, 0, 0.5] });
      b.cyl(0.03, 0.03, 0.08, 0x2a2d32, 0.08 + Math.cos(0.5) * 0.1, 1.05 + Math.sin(0.5) * 0.1, F + 0.13, { axis: 'z', seg: 6 });
      b.use('matte');
      b.box(0.36, 0.24, 0.01, 0x0d0e10, 0, 0.46, F + 0.005);
      ring(b, 0.44, 0.32, 0.04, 0.04, gold, 0, 0.46, F + 0.02);
      b.use('metal').box(0.34, 0.14, 0.012, 0x8d9097, 0, 0.5, F + 0.03, { r: [0.35, 0, 0] }).use('matte');
      // side decor: stars + bulbs
      for (const s of [-1, 1]) {
        b.box(0.006, 0.7, 0.7, dk(col, 0.82), s * 0.603, 0.85, 0);
        for (let i = 0; i < 3; i++) b.box(0.006, 0.12, 0.12, gold, s * 0.607, 0.6 + i * 0.25, -0.15 + i * 0.15, { r: [PI / 4, 0, 0] });
      }
      b.use('glow');
      for (let i = 0; i < 5; i++) b.sph(0.025, 0xffd08a, -0.4 + i * 0.2, 2.0, F + 0.03 - 0.03, { seg: 6, glow: 1.2 });
      b.use('matte');
      return b.group();
    }
  };

  /* Where real light sources belong (prop-local coordinates). */
  GFX.propAnchors = {
    streetLamp: [[0, 4.47, 0.94]],
    gasCanopy: [[-4.5, 4.3, -2.2], [0, 4.3, -2.2], [4.5, 4.3, -2.2], [-4.5, 4.3, 2.2], [0, 4.3, 2.2], [4.5, 4.3, 2.2]],
    vending: [[-0.12, 1.27, 0.6]],
    fridge: [[0, 1.0, 0.1]],
    gasPump: [[0.32, 1.62, -0.08], [-0.32, 1.62, -0.08]],
    kiosk: [[1.6, 2.78, 2.2]],
    busShelter: [[-0.3, 1.32, -2.6]]
  };
})();
