'use strict';
/* =========================================================
   GFX weapons：第一人稱武器模型（純程式建模，使用 kit.js 的 GFX.Builder）
   GFX.buildGunModel(kind)   kind: pistol | rifle | shotgun | katana | chainsaw | flamer | tesla | grenade
   GFX.buildThrowModel(kind) kind: molotov | frag
   座標：鏡頭看 -Z，+Y 向上，槍管朝 -Z，握把在原點附近；槍口在 (0, 0.015, muzzle)。
   只依賴全域的 THREE（r128）與 GFX。
   ========================================================= */
(() => {
  const V3 = THREE.Vector3, PI = Math.PI, DEG = PI / 180, BY = 0.015;   // BY：槍膛中心高度

  /* ---------- 色票（sRGB） ---------- */
  const C = {
    steel: 0x7a828c, steelL: 0xb3bac2, steelD: 0x2c3137, blued: 0x363c44, blk: 0x1d2024,
    poly: 0x26292d, polyL: 0x353a40, polyD: 0x141618, bore: 0x060708,
    alu: 0x3a3f46, alu2: 0x34393f, aluD: 0x23272b,
    wood: 0x87562d, woodD: 0x4a2c15, woodL: 0xa5703f,
    brass: 0xd0a63a, brassD: 0x8a6a1a, copper: 0xc9824e, rubber: 0x161719,
    amber: 0xf0a23b, cyan: 0x6fd8ff, white: 0xe9e4d6,
    olive: 0x56633f, oliveD: 0x39432b, orange: 0xe07a2a, orangeD: 0x8f4514, red: 0xb8453a, redD: 0x6e2620,
    tesla: 0x3d4d5e, teslaD: 0x1f2832,
    glove: 0x34362f, gloveD: 0x1c1d1a, gloveK: 0x222320, cuff: 0x26282b, sleeve: 0x4d5641, sleeveD: 0x262b20,
    ito: 0x1e2030, itoD: 0x111219, same: 0xe4dece, iron: 0x2a2a2e
  };

  /* ---------- 幾何工具 ---------- */
  const _a = new V3(), _b = new V3(), _n = new V3(), _c = new V3();
  // 推入一個三角形，依 ref（物體內部的點）自動修正繞序，讓正面朝外
  function tri(P, N, A, B, Cc, nA, nB, nC, ref) {
    _a.subVectors(Cc, B); _b.subVectors(A, B); _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-20) return;
    _c.set((A.x + B.x + Cc.x) / 3 - ref.x, (A.y + B.y + Cc.y) / 3 - ref.y, (A.z + B.z + Cc.z) / 3 - ref.z);
    if (_n.dot(_c) < 0) { let t = B; B = Cc; Cc = t; t = nB; nB = nC; nC = t; }
    P.push(A.x, A.y, A.z, B.x, B.y, B.z, Cc.x, Cc.y, Cc.z);
    if (N) N.push(nA.x, nA.y, nA.z, nB.x, nB.y, nB.z, nC.x, nC.y, nC.z);
  }
  function emit(b, P, N, col, o = {}) {
    if (!P.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (N) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    b.add(g, col, 0, 0, 0, { smooth: !!N, c2: o.c2, glow: o.glow });
  }
  // 把一串截面環（每環點數相同、凸多邊形）縫成實心，可平滑（徑向法線）
  function skin(b, rings, col, o = {}) {
    const n = rings[0].length, last = rings.length - 1, P = [], N = o.smooth ? [] : null;
    const cen = rings.map(r => r.reduce((s, p) => s.add(p), new V3()).divideScalar(r.length));
    const ax = o.centers || cen;
    const nr = (p, i) => N ? new V3().subVectors(p, ax[i]).normalize() : null;
    for (let i = 0; i < last; i++) {
      const ref = new V3().addVectors(cen[i], cen[i + 1]).multiplyScalar(0.5);
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n, A = rings[i][k], B = rings[i][k1], Cc = rings[i + 1][k1], Dd = rings[i + 1][k];
        tri(P, N, A, B, Cc, nr(A, i), nr(B, i), nr(Cc, i + 1), ref);
        tri(P, N, A, Cc, Dd, nr(A, i), nr(Cc, i + 1), nr(Dd, i + 1), ref);
      }
    }
    const cap = (i, j) => { const nn = N ? new V3().subVectors(cen[i], cen[j]).normalize() : null; for (let k = 0; k < n; k++) tri(P, N, cen[i], rings[i][k], rings[i][(k + 1) % n], nn, nn, nn, cen[j]); };
    if (o.cap0 !== false) cap(0, 1);
    if (o.cap1 !== false) cap(last, last - 1);
    emit(b, P, N, col, o);
  }
  const vec = p => p.isVector3 ? p.clone() : new V3(p[0], p[1], p[2]);
  // 沿折線掃出的管子（平行傳輸座標框，接點自然轉彎）；rad 可為陣列；o.sx 把截面壓扁
  function pipe(b, pts, rad, col, o = {}) {
    const P = pts.map(vec), m = P.length, n = o.sides || 6, sx = o.sx || 1;
    const R = Array.isArray(rad) ? rad : P.map(() => rad);
    const T = P.map((p, i) => new V3().subVectors(P[Math.min(i + 1, m - 1)], P[Math.max(i - 1, 0)]).normalize());
    const nrm = o.up ? vec(o.up) : (Math.abs(T[0].y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0));
    const rings = P.map((p, i) => {
      nrm.addScaledVector(T[i], -nrm.dot(T[i])).normalize();
      const bn = new V3().crossVectors(T[i], nrm), ring = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * PI * 2 + (o.rot || 0); ring.push(p.clone().addScaledVector(nrm, Math.cos(a) * R[i] * sx).addScaledVector(bn, Math.sin(a) * R[i])); }
      return ring;
    });
    skin(b, rings, col, Object.assign({}, o, { smooth: !o.flat, centers: P }));
  }
  const curve = (pts, n) => new THREE.CatmullRomCurve3(pts.map(vec)).getPoints(n);
  // 側面輪廓：pts 是 [z, y]，沿 X 擠出寬度 w（總寬就是 w，倒角往輪廓外長）
  function side(b, pts, w, col, x = 0, o = {}) { b.at(x, 0, 0, [0, PI / 2, 0], () => b.prism(pts.map(p => [-p[0], p[1]]), w, col, 0, 0, 0, o)); }
  // 貼花四邊形：中心 c、半邊向量 u/v、朝外法線 nrm
  function quad(b, c, u, v, nrm, col, o) {
    const C0 = vec(c), U = vec(u), W = vec(v), ref = C0.clone().addScaledVector(vec(nrm).normalize(), -0.01);
    const p = [C0.clone().sub(U).sub(W), C0.clone().add(U).sub(W), C0.clone().add(U).add(W), C0.clone().sub(U).add(W)], P = [];
    tri(P, null, p[0], p[1], p[2], null, null, null, ref); tri(P, null, p[0], p[2], p[3], null, null, null, ref);
    emit(b, P, null, col, o);
  }
  // 圓盤貼花（扇形），朝 nrm
  function disc(b, c, nrm, r, seg, col, o) {
    const C0 = vec(c), Nn = vec(nrm).normalize(), X = Math.abs(Nn.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    X.addScaledVector(Nn, -X.dot(Nn)).normalize(); const Y = new V3().crossVectors(Nn, X), ref = C0.clone().addScaledVector(Nn, -0.01), P = [];
    const pt = k => C0.clone().addScaledVector(X, Math.cos(k / seg * PI * 2) * r).addScaledVector(Y, Math.sin(k / seg * PI * 2) * r);
    for (let k = 0; k < seg; k++) tri(P, null, C0, pt(k), pt(k + 1), null, null, null, ref);
    emit(b, P, null, col, o);
  }
  // 由兩個軸向量得到尤拉角（Y 保持不變，X 正交化）
  const _m4 = new THREE.Matrix4(), _eu = new THREE.Euler();
  function basis(X, Y) {
    const y = vec(Y).normalize(), x = vec(X); x.addScaledVector(y, -x.dot(y)).normalize();
    _m4.makeBasis(x, y, new V3().crossVectors(x, y)); _eu.setFromRotationMatrix(_m4); return [_eu.x, _eu.y, _eu.z];
  }
  const oct = (w, h, c, cy = 0) => [[w, cy + h - c], [w - c, cy + h], [-w + c, cy + h], [-w, cy + h - c], [-w, cy - h + c], [-w + c, cy - h], [w - c, cy - h], [w, cy - h + c]];
  const ngon = (r, n, a0, cy = 0) => Array.from({ length: n }, (_, k) => [r * Math.cos(a0 + k * 2 * PI / n), cy + r * Math.sin(a0 + k * 2 * PI / n)]);

  /* ---------- 手（共用） ----------
     標準座標：被握的物體沿本地 Y 軸（食指在 +Y），截面橢圓半徑 ax / az；
     手掌在 +X 側，四指經前方（-Z）繞到 -X，拇指從後方（+Z）繞到 -X。
     m=-1 鏡像成左手。axis：世界中的 +Y 方向；palm：世界中手掌所在方向。
     指節點：[角度°, y] 貼著橢圓，或 [x, y, z] 本地座標。 */
  function digit(b, pts, r) {
    const n = pts.length, R = Array.isArray(r) ? r : pts.map((_, i) => r * (1 - 0.06 * i));
    const d = pts[n - 1].clone().sub(pts[n - 2]).normalize(), rl = R[n - 1];
    pipe(b, pts.concat([pts[n - 1].clone().addScaledVector(d, rl * 0.6), pts[n - 1].clone().addScaledVector(d, rl * 0.95)]), R.concat([rl * 0.8, rl * 0.32]), C.glove, { sides: 6 });
  }
  function arm(b, W, e) {
    const E = vec(e), d = E.clone().sub(W).normalize(), at = s => W.clone().addScaledVector(d, s);
    b.use('matte');
    pipe(b, [at(-0.02), at(0.056)], [0.026, 0.031], C.cuff, { sides: 8 });
    pipe(b, [at(0.02), at(0.036)], 0.0335, C.gloveK, { sides: 8 });
    pipe(b, [at(0.05), at(0.075)], [0.038, 0.041], C.sleeveD, { sides: 8 });
    pipe(b, [at(0.056), at(0.13), E], [0.037, 0.043, 0.052], C.sleeve, { sides: 8, c2: C.sleeveD });
  }
  function hand(b, o) {
    const m = o.m || 1, ax = o.ax, az = o.az, fr = o.fr || 0.0115;
    const Y = vec(o.axis).normalize(), pd = vec(o.palm); pd.addScaledVector(Y, -pd.dot(Y)).normalize();
    const X = pd.multiplyScalar(m), Z = new V3().crossVectors(X, Y);
    const M = new THREE.Matrix4().makeBasis(X, Y, Z); _eu.setFromRotationMatrix(M); const rot = [_eu.x, _eu.y, _eu.z];
    M.setPosition(o.pos[0], o.pos[1], o.pos[2]);
    const sc = y => o.ry ? Math.sqrt(Math.max(0.25, 1 - (y / o.ry) ** 2)) : 1;
    const L = (q, off) => q.length === 3 ? new V3(q[0] * m, q[1], q[2]) : new V3(m * (ax * sc(q[1]) + off) * Math.cos(q[0] * DEG), q[1], -(az * sc(q[1]) + off) * Math.sin(q[0] * DEG));
    const ys = o.fingers.map(f => f.p[0].length === 3 ? f.p[0][1] : f.p[0][1]);
    const top = Math.max(...ys) + fr, bot = Math.min(...ys) - fr, ym = (top + bot) / 2, hs = top - bot;
    let Wl;
    b.at(o.pos[0], o.pos[1], o.pos[2], rot, () => {
      b.use('matte');
      o.fingers.forEach(f => { const r = f.r || fr; digit(b, f.p.map(q => L(q, r * 0.9)), r); });
      const T = o.thumb; digit(b, T.p.map((q, i) => L(q, T.r[i] * 0.9)), T.r);
      // 手背：指節 → 手腕，三個八角截面
      const K = L([o.kn === undefined ? 38 : o.kn, ym], fr + 0.003);
      const wr = o.wrist || [-50, ym - 0.01, 0.022], W = L([wr[0], wr[1]], wr[2]);
      const u = W.clone().sub(K).normalize(), up = new V3(0, 1, 0).addScaledVector(u, -u.y).normalize();
      const nn = new V3().crossVectors(u, up), mid = K.clone().add(W).multiplyScalar(0.5); mid.y = 0;
      if (nn.dot(mid) < 0) nn.negate();
      const ring = (c, t, h, ch) => oct(t / 2, h / 2, ch).map(([a, bb]) => c.clone().addScaledVector(nn, a).addScaledVector(up, bb));
      const M1 = K.clone().lerp(W, 0.5).addScaledVector(nn, 0.004);
      skin(b, [ring(K, 0.024, hs * 0.96, 0.007), ring(M1, 0.032, hs * 0.9, 0.009), ring(W, 0.042, hs * 0.64, 0.014)], C.glove, { c2: C.gloveD });
      // 指節護甲
      const kp = K.clone().lerp(W, 0.24).addScaledVector(nn, 0.0165);
      b.at(kp.x, kp.y, kp.z, basis(u, up), () => {
        b.box(0.028, hs * 0.8, 0.006, C.gloveK);
        ys.forEach(y => b.box(0.012, 0.014, 0.004, C.gloveD, -0.004, y - ym, 0.003));
      });
      Wl = W;
    });
    const Ww = Wl.clone().applyMatrix4(M);
    if (o.arm) arm(b, Ww, o.arm);
    return Ww;
  }
  // 手指配置的捷徑
  const wrap = (y, a = [40, 95, 148, 190]) => ({ p: a.map(t => [t, y]) });

  /* ---------- 共用零件 ---------- */
  // 格紋防滑：在握把兩側貼一格一格的方塊
  function texture(b, cz, cy, a, xw, rows, cols, cell, col) {
    const ax = [0, Math.cos(a), -Math.sin(a)], rw = [0, Math.sin(a), Math.cos(a)];
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      if ((i + j) % 2) continue;
      const s1 = (i - (rows - 1) / 2) * cell, s2 = (j - (cols - 1) / 2) * cell;
      const y = cy + ax[1] * s1 + rw[1] * s2, z = cz + ax[2] * s1 + rw[2] * s2;
      for (const s of [-1, 1]) quad(b, [s * (xw + 0.001), y, z], ax.map(v => v * cell * 0.42), rw.map(v => v * cell * 0.42), [s, 0, 0], col);
    }
  }
  // 步槍式手槍握把＋扳機護弓＋扳機（dz/dy 平移）
  const GRIP = [[-0.002, -0.034], [0.008, -0.066], [0.026, -0.118], [0.032, -0.133], [0.072, -0.130], [0.072, -0.120], [0.052, -0.066], [0.046, -0.034], [0.040, -0.028]];
  const mv = (pts, dz, dy) => pts.map(([z, y]) => [z + dz, y + dy]);
  function pistolGrip(b, dz, dy, gripCol = C.poly, guardFront = -0.080) {
    b.use('matte');
    side(b, mv(GRIP, dz, dy), 0.036, gripCol, 0, { bevel: 0.003, c2: C.polyD });
    texture(b, 0.039 + dz, -0.088 + dy, 0.33, 0.018, 7, 3, 0.0095, C.polyL);
    b.box(0.03, 0.006, 0.044, C.polyD, 0, -0.134 + dy, 0.052 + dz, { r: [-0.06, 0, 0] });   // 底蓋
    b.use('gloss');
    side(b, mv([[guardFront, -0.036], [guardFront, -0.068], [0.006, -0.066], [0.006, -0.036], [-0.002, -0.036], [-0.002, -0.060], [guardFront + 0.008, -0.062], [guardFront + 0.008, -0.036]], dz, dy), 0.014, C.aluD, 0, { bevel: 0.0012 });
    side(b, mv([[-0.034, -0.036], [-0.040, -0.045], [-0.040, -0.053], [-0.036, -0.057], [-0.034, -0.054], [-0.035, -0.046], [-0.029, -0.036]], dz, dy), 0.006, C.steelD, 0, { bevel: 0.0008 });
  }
  function gripHand(b, dz, dy, armE) {
    return hand(b, {
      pos: [0, -0.087 + dy, 0.036 + dz], axis: [0, Math.cos(0.33), -Math.sin(0.33)], palm: [1, 0, 0], ax: 0.018, az: 0.024,
      fingers: [{ p: [[40, 0.052], [0.015, 0.064, -0.047], [0.005, 0.064, -0.059], [0.0, 0.059, -0.055]], r: 0.0105 }, wrap(0.020), wrap(-0.004), Object.assign(wrap(-0.027, [40, 95, 148, 186]), { r: 0.0102 })],
      thumb: { p: [[-55, 0.03], [-105, 0.052], [200, 0.064], [166, 0.07]], r: [0.017, 0.014, 0.0122, 0.011] },
      arm: armE || [0.17 + 0, -0.45, 0.45 + dz]
    });
  }
  // 垂直前握把（左手用）
  function vertGrip(b, z, ytop) {
    b.use('gloss'); b.box(0.026, 0.012, 0.034, C.blk, 0, ytop - 0.004, z);
    b.use('matte');
    side(b, [[z - 0.018, ytop - 0.008], [z - 0.021, ytop - 0.05], [z - 0.017, ytop - 0.104], [z - 0.011, ytop - 0.112], [z + 0.016, ytop - 0.112], [z + 0.021, ytop - 0.104], [z + 0.016, ytop - 0.05], [z + 0.014, ytop - 0.008]], 0.03, C.poly, 0, { bevel: 0.003, c2: C.polyD });
    for (let i = 0; i < 4; i++) b.box(0.0325, 0.003, 0.03, C.polyD, 0, ytop - 0.035 - i * 0.02, z);
  }
  function vertHand(b, z, ytop, armE) {
    const yc = ytop - 0.06;
    return hand(b, {
      m: -1, pos: [0, yc, z], axis: [0, 1, 0], palm: [-1, 0, 0], ax: 0.016, az: 0.02,
      fingers: [wrap(0.036), wrap(0.012), wrap(-0.012), Object.assign(wrap(-0.035, [40, 95, 148, 186]), { r: 0.0102 })],
      thumb: { p: [[-55, 0.03], [-105, 0.045], [200, 0.052], [168, 0.056]], r: [0.017, 0.014, 0.0122, 0.011] },
      arm: armE || [-0.27, -0.5, z + 0.36]
    });
  }
  // 皮卡汀尼導軌（T 形截面＋槽）
  function rail(b, z0, z1, ytop, col = C.aluD, step = 0.0125, w = 0.0125) {
    const len = z0 - z1, zc = (z0 + z1) / 2, yb = ytop - 0.014;
    b.use('gloss');
    b.prism([[-w * 0.68, yb], [w * 0.68, yb], [w * 0.68, ytop - 0.0065], [w, ytop - 0.0045], [w, ytop - 0.0015], [w * 0.84, ytop], [-w * 0.84, ytop], [-w, ytop - 0.0015], [-w, ytop - 0.0045], [-w * 0.68, ytop - 0.0065]], len, col, 0, 0, zc);
    b.use('matte');
    for (let z = z0 - step * 0.6; z > z1 + step * 0.3; z -= step) {
      quad(b, [0, ytop + 0.001, z], [0, 0, 0.0022], [w * 0.84, 0, 0], [0, 1, 0], C.polyD);
      for (const s of [-1, 1]) quad(b, [s * (w + 0.001), ytop - 0.003, z], [0, 0, 0.0022], [0, 0.0015, 0], [s, 0, 0], C.polyD);
    }
  }

  /* ---------- 可動零件 ----------
     動畫要動的部分不併進主 mesh，而是用自己的 Builder 建成子 group，存進 g.userData.parts[name]。
     建模座標仍然是整把槍的座標；pivot 是這個零件的旋轉中心（group.position 會設在 pivot）。
     parent：巢狀零件（例如手上拿的彈殼）掛在哪個零件底下。
     每個零件的 userData.rest 記住靜止姿勢，GFX.weaponAnim 每幀先還原再加位移。 */
  function part(g, name, fn, pivot, parent, visible) {
    const pv = pivot || [0, 0, 0], pp = parent ? parent.userData.pivot : [0, 0, 0];
    const pb = new GFX.Builder();
    pb.at(-pv[0], -pv[1], -pv[2], () => fn(pb));
    const p = pb.group({ shadow: false }); p.name = name;
    p.position.set(pv[0] - pp[0], pv[1] - pp[1], pv[2] - pp[2]);
    p.visible = visible !== false;
    p.userData.pivot = pv;
    p.userData.rest = { p: p.position.clone(), q: p.quaternion.clone(), s: p.scale.clone(), v: p.visible };
    (parent || g).add(p);
    (g.userData.parts || (g.userData.parts = {}))[name] = p;
    return p;
  }

  /* =========================================================
     手槍
     ========================================================= */
  const PISTOL_A = 0.21;    // 握把（彈匣）往後傾的角度
  // 彈匣：沿握把斜插，平常整個藏在握把裡，只露出底板
  function pistolMag(b) {
    b.at(0, -0.07, 0.0096, [-PISTOL_A, 0, 0], () => {
      b.use('gloss'); b.box(0.024, 0.112, 0.03, C.steelD, 0, 0, 0);
      b.box(0.018, 0.006, 0.026, C.blk, 0, 0.055, 0.001);
      b.use('metal'); b.cyl(0.0046, 0.0046, 0.019, C.brass, 0, 0.0602, -0.002, { axis: 'z', seg: 8 });
      b.cyl(0.0046, 0.0024, 0.005, C.copper, 0, 0.0602, -0.0135, { axis: 'z', seg: 8 });
    });
    b.use('matte');
    side(b, [[-0.008, -0.128], [-0.006, -0.141], [0.050, -0.137], [0.051, -0.125]], 0.047, C.polyD, 0, { bevel: 0.0015 });
  }
  // 左手：手心朝上托住彈匣底板（換彈時才出現）
  function cupHand(b, c, down, armE) {
    return hand(b, {
      m: -1, pos: c, axis: [-1, 0, 0], palm: down, ax: 0.011, az: 0.03,
      fingers: [wrap(0.022, [30, 70, 110, 140]), wrap(0.007, [30, 72, 114, 144]), wrap(-0.008, [30, 72, 112, 142]), Object.assign(wrap(-0.022, [30, 70, 108, 136]), { r: 0.0102 })],
      thumb: { p: [[-30, 0.034], [-70, 0.036], [-110, 0.032], [-140, 0.028]], r: [0.017, 0.014, 0.0122, 0.011] },
      wrist: [-20, 0.05, 0.02], arm: armE
    });
  }
  function pistol() {
    const b = new GFX.Builder();
    // 槍口
    b.use('metal'); b.cyl(0.0105, 0.0105, 0.015, C.steelL, 0, BY, -0.2325, { axis: 'z', seg: 12 });
    b.use('matte'); b.cyl(0.0068, 0.0068, 0.002, C.bore, 0, BY, -0.240, { axis: 'z', seg: 10 });
    // 槍身（聚合物）
    side(b, [[0.046, -0.011], [-0.214, -0.011], [-0.214, -0.027], [-0.206, -0.033], [0.034, -0.030], [0.050, -0.016], [0.050, -0.011]], 0.046, C.poly, 0, { bevel: 0.002, c2: C.polyD });
    for (const z of [-0.13, -0.155, -0.18]) b.box(0.04, 0.003, 0.005, C.polyD, 0, -0.0355, z);
    // 握把
    side(b, [[-0.030, -0.030], [-0.026, -0.060], [-0.016, -0.100], [-0.010, -0.131], [-0.004, -0.135], [0.046, -0.130], [0.050, -0.124], [0.038, -0.060], [0.036, -0.034], [0.044, -0.018], [0.030, -0.016]], 0.044, C.poly, 0, { bevel: 0.003, c2: C.polyD });
    texture(b, 0.011, -0.083, 0.21, 0.022, 8, 4, 0.0095, C.polyL);
    // 扳機護弓與扳機
    side(b, [[-0.072, -0.031], [-0.076, -0.055], [-0.068, -0.066], [-0.020, -0.067], [-0.020, -0.060], [-0.062, -0.059], [-0.066, -0.052], [-0.064, -0.031]], 0.012, C.poly, 0, { bevel: 0.0015 });
    b.use('gloss');
    side(b, [[-0.040, -0.031], [-0.047, -0.041], [-0.047, -0.050], [-0.043, -0.055], [-0.041, -0.052], [-0.042, -0.043], [-0.035, -0.031]], 0.007, C.blk, 0, { bevel: 0.001 });
    // 左側：滑套卡榫、分解桿、插銷
    b.box(0.002, 0.005, 0.022, C.steelD, -0.0238, -0.016, -0.062);
    b.box(0.002, 0.004, 0.01, C.steelD, -0.0238, -0.018, -0.094);
    b.use('metal');
    for (const z of [-0.008, -0.05]) b.cyl(0.0022, 0.0022, 0.048, C.steel, 0, -0.024, z, { axis: 'x', seg: 6 });
    hand(b, {
      pos: [0, -0.09, 0.012], axis: [0, Math.cos(0.21), -Math.sin(0.21)], palm: [1, 0, 0], ax: 0.022, az: 0.032,
      fingers: [{ p: [[40, 0.05], [0.017, 0.057, -0.047], [0.006, 0.056, -0.057], [0.0, 0.052, -0.052]], r: 0.0105 }, wrap(0.022), wrap(-0.002), Object.assign(wrap(-0.025, [40, 95, 148, 186]), { r: 0.0102 })],
      thumb: { p: [[-55, 0.028], [-105, 0.05], [200, 0.062], [163, 0.066]], r: [0.017, 0.014, 0.0122, 0.011] },
      arm: [0.16, -0.42, 0.42]
    });
    const g = b.group({ shadow: false });
    // 滑套（開火時後座、換彈最後拉一下）
    part(g, 'slide', b => {
      b.use('gloss');
      b.prism([[-0.024, -0.010], [0.024, -0.010], [0.024, 0.035], [0.016, 0.045], [-0.016, 0.045], [-0.024, 0.035]], 0.262, C.blued, 0, 0, -0.101, { bevel: 0.002, c2: C.steelD });
      b.use('matte');
      for (let i = 0; i < 7; i++) for (const s of [-1, 1]) quad(b, [s * 0.027, 0.013, 0.024 - i * 0.0036], [0, 0.016, 0], [0, 0, 0.0009], [s, 0, 0], C.steelD);
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) quad(b, [s * 0.027, 0.015, -0.168 - i * 0.0036], [0, 0.013, 0], [0, 0, 0.0009], [s, 0, 0], C.steelD);
      quad(b, [0.006, 0.048, -0.035], [0, 0, 0.025], [0.0085, 0, 0], [0, 1, 0], C.bore);        // 拋殼口
      b.use('metal'); b.box(0.012, 0.0024, 0.03, C.steelL, 0.006, 0.048, -0.032);              // 從拋殼口看到的槍管頂
      b.use('matte'); quad(b, [0, 0.017, 0.031], [0.012, 0, 0], [0, 0.016, 0], [0, 0, 1], C.steelD);  // 滑套後蓋
      // 準星與照門
      b.use('gloss');
      b.box(0.0065, 0.008, 0.009, C.blk, 0, 0.051, -0.214);
      b.box(0.034, 0.004, 0.011, C.blk, 0, 0.049, 0.018);
      for (const s of [-1, 1]) b.box(0.0115, 0.0065, 0.011, C.blk, s * 0.0112, 0.0542, 0.018);
      b.use('glow');
      quad(b, [0, 0.0518, -0.2085], [0.0017, 0, 0], [0, 0.0017, 0], [0, 0, 1], C.amber, { glow: 1.5 });
      for (const s of [-1, 1]) quad(b, [s * 0.0112, 0.0545, 0.0245], [0.0014, 0, 0], [0, 0.0014, 0], [0, 0, 1], 0xdfe8d8, { glow: 0.8 });
    });
    // 彈匣與左手共用同一個 pivot（底板下方），一起轉才不會錯開
    const MP = [0, -0.147, 0.025];
    part(g, 'mag', pistolMag, MP);
    // 左手：平常藏起來，換彈時托著新彈匣上來
    const down = [0, -Math.cos(PISTOL_A), Math.sin(PISTOL_A)];
    part(g, 'leftHand', b => cupHand(b, MP, down, [-0.2, -0.46, 0.3]), MP, null, false);
    g.userData.eject = [0.012, 0.05, -0.035];
    return g;
  }

  /* =========================================================
     突擊步槍（AR 系）
     ========================================================= */
  function rifle() {
    const b = new GFX.Builder();
    b.use('gloss');
    // 上機匣
    b.prism([[-0.026, -0.004], [0.026, -0.004], [0.026, 0.028], [0.02, 0.035], [-0.02, 0.035], [-0.026, 0.028]], 0.21, C.alu, 0, 0, -0.065, { bevel: 0.0015, c2: C.aluD });
    b.cyl(0.0075, 0.0075, 0.03, C.aluD, 0.026, 0.024, 0.018, { axis: 'z', seg: 8 });                          // 輔助閉鎖
    b.use('matte'); quad(b, [0.0285, 0.014, -0.035], [0, 0, 0.026], [0, 0.009, 0], [1, 0, 0], C.aluD);        // 防塵蓋
    // 下機匣、彈匣井
    b.use('gloss');
    side(b, [[0.047, -0.003], [-0.168, -0.003], [-0.168, -0.040], [-0.162, -0.070], [-0.084, -0.070], [-0.080, -0.040], [-0.004, -0.037], [0.036, -0.031], [0.048, -0.016]], 0.05, C.alu2, 0, { bevel: 0.002, c2: C.aluD });
    b.box(0.002, 0.016, 0.007, C.aluD, -0.0258, -0.024, -0.088);                // 槍機卡榫
    b.at(-0.026, -0.018, 0.016, [0.5, 0, 0], () => b.box(0.002, 0.005, 0.016, C.steelD));   // 保險
    b.use('glow'); quad(b, [-0.0262, -0.012, 0.03], [0, 0.0012, 0], [0, 0, 0.0012], [-1, 0, 0], C.white, { glow: 0.5 });
    b.use('metal');
    b.cyl(0.0035, 0.0035, 0.052, C.steel, 0, -0.008, 0.036, { axis: 'x', seg: 8 });
    b.cyl(0.0035, 0.0035, 0.052, C.steel, 0, -0.012, -0.152, { axis: 'x', seg: 8 });
    pistolGrip(b, 0, 0);
    // 護木（八角，M-LOK 槽）
    b.use('gloss');
    b.prism(ngon(0.028, 8, PI / 8, BY), 0.30, 0x2e3237, 0, 0, -0.32, { bevel: 0.0015, c2: C.aluD });
    b.cyl(0.0262, 0.0262, 0.006, C.blk, 0, BY, -0.472, { axis: 'z', seg: 8 });
    b.use('matte');
    for (const ang of [PI, PI * 0.75, PI * 1.25, 0, PI * 0.25, -PI * 0.25]) {
      const nx = Math.cos(ang), ny = Math.sin(ang);
      for (const z of [-0.215, -0.275, -0.335, -0.395]) quad(b, [nx * 0.0284, BY + ny * 0.0284, z], [0, 0, 0.015], [-ny * 0.003, nx * 0.003, 0], [nx, ny, 0], C.polyD);
    }
    rail(b, 0.038, -0.462, 0.048);
    // 槍管、消焰器
    b.use('gloss'); b.cyl(0.0095, 0.0095, 0.19, C.blued, 0, BY, -0.563, { axis: 'z', seg: 10 });
    b.cyl(0.0125, 0.0125, 0.045, C.blk, 0, BY, -0.6775, { axis: 'z', seg: 10 });
    b.use('matte');
    for (const a of [90, 54, 126, 18, 162]) { const r = 0.0129, x = Math.cos(a * DEG), y = Math.sin(a * DEG); quad(b, [x * r, BY + y * r, -0.684], [0, 0, 0.011], [-y * 0.0012, x * 0.0012, 0], [x, y, 0], C.bore); }
    b.cyl(0.0062, 0.0062, 0.004, C.bore, 0, BY, -0.6992, { axis: 'z', seg: 10 });
    // 全像瞄具
    b.use('gloss');
    b.box(0.03, 0.012, 0.072, C.blk, 0, 0.054, -0.07);
    for (const s of [-1, 1]) b.box(0.0045, 0.031, 0.05, C.blk, s * 0.0155, 0.0755, -0.078);
    b.box(0.0355, 0.0045, 0.05, C.blk, 0, 0.0915, -0.078);
    b.cyl(0.005, 0.005, 0.006, C.polyL, -0.017, 0.053, -0.05, { axis: 'x', seg: 8 });
    for (const x of [-0.008, 0.008]) b.box(0.006, 0.004, 0.003, C.polyL, x, 0.054, -0.0335);
    b.use('glass'); b.box(0.027, 0.028, 0.0015, 0x9fc8e8, 0, 0.0745, -0.098);
    b.use('glow');
    b.add(new THREE.TorusGeometry(0.0075, 0.0007, 3, 16), 0xff3b2f, 0, 0.0745, -0.0955, { glow: 1.8 });
    b.sph(0.0012, 0xff3b2f, 0, 0.0745, -0.0955, { seg: 6, glow: 2 });
    // 槍托
    b.use('gloss');
    b.cyl(0.0155, 0.0155, 0.2, C.aluD, 0, 0.004, 0.145, { axis: 'z', seg: 10 });
    b.cyl(0.019, 0.019, 0.008, C.steelD, 0, 0.004, 0.052, { axis: 'z', seg: 8 });
    b.use('matte');
    side(b, [[0.12, 0.018], [0.27, 0.026], [0.275, 0.02], [0.278, -0.072], [0.268, -0.078], [0.215, -0.07], [0.17, -0.024], [0.12, -0.016]], 0.044, C.poly, 0, { bevel: 0.004, c2: C.polyD });
    side(b, [[0.272, 0.028], [0.288, 0.027], [0.29, -0.079], [0.274, -0.081]], 0.047, C.rubber, 0, { bevel: 0.002 });
    b.box(0.008, 0.006, 0.03, C.polyD, 0, -0.0215, 0.145);
    for (const s of [-1, 1]) quad(b, [s * 0.0231, -0.03, 0.235], [0, 0, 0.012], [0, 0.005, 0], [s, 0, 0], C.polyD);
    gripHand(b, 0, 0);
    const g = b.group({ shadow: false });
    // 彈匣（微彎）
    part(g, 'mag', b => {
      b.use('matte');
      side(b, [[-0.157, -0.055], [-0.160, -0.10], [-0.168, -0.145], [-0.181, -0.190], [-0.124, -0.198], [-0.112, -0.15], [-0.103, -0.10], [-0.092, -0.055]], 0.03, C.poly, 0, { bevel: 0.002, c2: C.polyD });
      side(b, [[-0.184, -0.186], [-0.188, -0.204], [-0.122, -0.212], [-0.120, -0.194]], 0.034, C.polyD, 0, { bevel: 0.0015 });
      for (let i = 0; i < 3; i++) b.box(0.0345, 0.004, 0.052, C.polyD, 0, -0.158 - i * 0.011, -0.146 - i * 0.003, { r: [-0.16, 0, 0] });
      b.use('metal'); b.cyl(0.0048, 0.0048, 0.024, C.brass, 0, -0.051, -0.128, { axis: 'z', seg: 8 });
    });
    // 拉機柄（換彈最後往後拉）
    part(g, 'charge', b => {
      b.use('gloss'); b.box(0.018, 0.007, 0.014, C.aluD, 0, 0.03, 0.046); b.box(0.036, 0.006, 0.007, C.aluD, 0, 0.03, 0.05);
    });
    // 從拋殼口看到的槍機（每發往後頂一下）
    part(g, 'bolt', b => {
      b.use('metal'); b.box(0.0016, 0.0105, 0.024, C.steel, 0.0287, 0.0145, -0.046);
      b.use('matte'); quad(b, [0.0297, 0.0145, -0.04], [0, 0, 0.005], [0, 0.0028, 0], [1, 0, 0], C.bore);
    });
    // 左手（握護木；換彈時去拿彈匣、拉拉機柄）
    part(g, 'leftHand', b => hand(b, {
      m: -1, pos: [0, BY, -0.37], axis: [0, 0, -1], palm: [-0.5, -0.85, 0], ax: 0.0305, az: 0.0305,
      fingers: [wrap(0.034, [35, 88, 135, 168]), wrap(0.011, [35, 88, 135, 170]), wrap(-0.012, [35, 88, 135, 168]), Object.assign(wrap(-0.034, [35, 88, 132, 162]), { r: 0.0102 })],
      thumb: { p: [[-25, -0.012], [-68, 0.016], [-92, 0.046], [-97, 0.072]], r: [0.017, 0.014, 0.0122, 0.011] },
      wrist: [-35, -0.035, 0.02], arm: [-0.25, -0.48, 0.02]
    }), [0, BY, -0.37]);
    g.userData.eject = [0.03, 0.016, -0.035];
    return g;
  }

  /* =========================================================
     泵動式霰彈槍
     ========================================================= */
  function shotgun() {
    const b = new GFX.Builder();
    b.use('gloss');
    side(b, [[0.044, 0.018], [0.036, 0.035], [0.022, 0.041], [-0.19, 0.041], [-0.19, -0.045], [0.032, -0.045], [0.044, -0.030]], 0.05, C.blued, 0, { bevel: 0.002, c2: C.steelD });
    b.use('matte');
    quad(b, [0, 0.044, -0.075], [0, 0, 0.11], [0.008, 0, 0], [0, 1, 0], C.steelD);              // 防眩條
    quad(b, [0.0262, 0.012, -0.07], [0, 0, 0.036], [0, 0.014, 0], [1, 0, 0], C.bore);          // 拋殼口
    quad(b, [0, -0.048, -0.09], [0, 0, 0.06], [0.015, 0, 0], [0, -1, 0], C.bore);              // 裝填口
    quad(b, [-0.0262, -0.004, -0.08], [0, 0, 0.1], [0, 0.0006, 0], [-1, 0, 0], C.steelD);      // 刻線
    b.use('metal');
    b.box(0.003, 0.016, 0.03, C.steelL, 0.026, 0.012, -0.062);
    for (const z of [-0.02, 0.022]) b.cyl(0.0035, 0.0035, 0.052, C.steel, 0, -0.032, z, { axis: 'x', seg: 8 });
    // 扳機組
    b.use('gloss');
    side(b, [[-0.045, -0.044], [-0.048, -0.062], [-0.038, -0.075], [0.030, -0.074], [0.042, -0.06], [0.044, -0.044], [0.034, -0.044], [0.032, -0.058], [0.026, -0.066], [-0.030, -0.067], [-0.037, -0.06], [-0.035, -0.044]], 0.014, C.blk, 0, { bevel: 0.0015 });
    side(b, [[-0.004, -0.044], [-0.010, -0.053], [-0.009, -0.062], [-0.004, -0.065], [-0.003, -0.061], [-0.005, -0.054], [0.003, -0.044]], 0.006, C.steelD, 0, { bevel: 0.0008 });
    b.cyl(0.004, 0.004, 0.032, C.steelD, 0, -0.049, 0.028, { axis: 'x', seg: 8 });
    b.use('glow'); disc(b, [0.0165, -0.049, 0.028], [1, 0, 0], 0.0028, 8, C.red, { glow: 0.9 });
    // 槍管、通風槽、準星珠
    b.use('gloss');
    b.cyl(0.0135, 0.0135, 0.53, C.blued, 0, BY, -0.455, { axis: 'z', seg: 12 });
    b.cyl(0.0145, 0.0145, 0.012, C.steelD, 0, BY, -0.714, { axis: 'z', seg: 12 });
    b.box(0.007, 0.0035, 0.5, C.steelD, 0, 0.0315, -0.455);
    for (let i = 0; i < 7; i++) b.box(0.004, 0.003, 0.004, C.steelD, 0, 0.0292, -0.23 - i * 0.075);
    b.use('metal'); b.sph(0.0028, C.brass, 0, 0.0358, -0.706, { seg: 8 });
    b.use('matte'); b.cyl(0.0095, 0.0095, 0.003, C.bore, 0, BY, -0.7202, { axis: 'z', seg: 12 });
    // 彈倉管
    b.use('gloss');
    b.cyl(0.0125, 0.0125, 0.465, C.blued, 0, -0.0145, -0.4225, { axis: 'z', seg: 12 });
    b.cyl(0.0135, 0.0128, 0.026, C.steelD, 0, -0.0145, -0.668, { axis: 'z', seg: 12 });
    b.cyl(0.0143, 0.0143, 0.006, C.blk, 0, -0.0145, -0.661, { axis: 'z', seg: 12 });
    b.box(0.014, 0.03, 0.012, C.blued, 0, 0.0, -0.646);
    // 木質槍托（手槍式握把）
    side(b, [[0.040, 0.036], [0.075, 0.027], [0.19, 0.017], [0.306, 0.010], [0.31, -0.10], [0.205, -0.08], [0.135, -0.064], [0.108, -0.064], [0.112, -0.118], [0.106, -0.132], [0.072, -0.131], [0.064, -0.112], [0.050, -0.068], [0.044, -0.045], [0.040, -0.03]], 0.046, C.wood, 0, { bevel: 0.004, c2: C.woodD });
    side(b, [[0.304, 0.014], [0.322, 0.014], [0.328, -0.106], [0.308, -0.106]], 0.048, C.rubber, 0, { bevel: 0.002 });
    side(b, [[0.068, -0.127], [0.068, -0.137], [0.110, -0.138], [0.110, -0.127]], 0.044, C.polyD, 0, { bevel: 0.0015 });
    // 握把方格紋（菱形）
    const ga = 0.33, axv = [0, Math.cos(ga), -Math.sin(ga)], rwv = [0, Math.sin(ga), Math.cos(ga)];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const s1 = (i - 2) * 0.012, s2 = (j - 1) * 0.011 + (i % 2) * 0.0055, y = -0.093 + axv[1] * s1 + rwv[1] * s2, z = 0.084 + axv[2] * s1 + rwv[2] * s2;
      for (const s of [-1, 1]) quad(b, [s * 0.024, y, z], axv.map((v, k) => (v * 0.0055 + rwv[k] * 0.005) / 2), axv.map((v, k) => (v * 0.0055 - rwv[k] * 0.005) / 2), [s, 0, 0], C.woodD);
    }
    b.use('metal'); b.cyl(0.0035, 0.0035, 0.01, C.steel, 0, -0.088, 0.25);
    hand(b, {
      pos: [0, -0.09, 0.082], axis: [0, Math.cos(0.33), -Math.sin(0.33)], palm: [1, 0, 0], ax: 0.023, az: 0.026,
      fingers: [{ p: [[40, 0.052], [0.014, 0.064, -0.055], [0.004, 0.064, -0.068], [0.0, 0.058, -0.064]], r: 0.0105 }, wrap(0.018), wrap(-0.006), Object.assign(wrap(-0.029, [40, 95, 148, 186]), { r: 0.0102 })],
      thumb: { p: [[-55, 0.03], [-105, 0.052], [200, 0.064], [166, 0.07]], r: [0.017, 0.014, 0.0122, 0.011] },
      arm: [0.18, -0.45, 0.48]
    });
    const g = b.group({ shadow: false });
    // 木質護木（泵動）＋連動桿
    part(g, 'pump', b => {
      b.use('metal'); for (const s of [-1, 1]) b.box(0.003, 0.006, 0.13, C.steel, s * 0.014, -0.006, -0.255);
      b.use('matte');
      b.prism([[-0.02, -0.001], [0.02, -0.001], [0.025, -0.008], [0.025, -0.03], [0.018, -0.04], [-0.018, -0.04], [-0.025, -0.03], [-0.025, -0.008]], 0.19, C.wood, 0, 0, -0.41, { bevel: 0.003, c2: C.woodD });
      for (let i = 0; i < 7; i++) {
        const z = -0.335 - i * 0.022;
        for (const s of [-1, 1]) quad(b, [s * 0.029, -0.019, z], [0, 0.011, 0], [0, 0, 0.0016], [s, 0, 0], C.woodD);
        quad(b, [0, -0.0441, z], [0.016, 0, 0], [0, 0, 0.0016], [0, -1, 0], C.woodD);
      }
    });
    const LH = [0, -0.019, -0.41];
    const lh = part(g, 'leftHand', b => hand(b, {
      m: -1, pos: LH, axis: [0, 0, -1], palm: [-0.45, -0.9, 0], ax: 0.031, az: 0.027,
      fingers: [wrap(0.034, [35, 88, 135, 168]), wrap(0.011, [35, 88, 135, 170]), wrap(-0.012, [35, 88, 135, 168]), Object.assign(wrap(-0.034, [35, 88, 132, 162]), { r: 0.0102 })],
      thumb: { p: [[-25, -0.012], [-68, 0.016], [-92, 0.046], [-97, 0.072]], r: [0.017, 0.014, 0.0122, 0.011] },
      wrist: [-35, -0.035, 0.02], arm: [-0.25, -0.5, 0.0]
    }), LH);
    // 裝填時手指捏著的一顆霰彈（沿 Z 軸，跟著左手走）
    const SH = [0, LH[1] + 0.033, LH[2] - 0.004];
    part(g, 'shell', b => shellModel(b, 'shotgun', SH, -1), SH, lh, false);
    g.userData.eject = [0.028, 0.014, -0.07];
    return g;
  }
  // 彈殼／彈藥（給換彈動畫用，也給 feel.js 的拋殼用）；c 中心、dir 彈頭朝 ±Z
  function shellModel(b, kind, c, dir) {
    const x = c[0], y = c[1], z = c[2], d = dir || -1;
    if (kind === 'shotgun') {
      b.use('gloss'); b.cyl(0.0098, 0.0098, 0.05, C.red, x, y, z + d * 0.007, { axis: 'z', seg: 10 });
      b.use('metal'); b.cyl(0.0104, 0.0104, 0.018, C.brass, x, y, z - d * 0.026, { axis: 'z', seg: 10 });
      b.cyl(0.0112, 0.0112, 0.002, C.brassD, x, y, z - d * 0.0345, { axis: 'z', seg: 10 });
    } else if (kind === 'grenade') {
      b.use('metal'); b.cyl(0.0185, 0.0185, 0.03, C.brass, x, y, z - d * 0.01, { axis: 'z', seg: 12 });
      b.cyl(0.0198, 0.0198, 0.003, C.brassD, x, y, z - d * 0.0255, { axis: 'z', seg: 12 });
      b.use('gloss'); b.lathe([[0.0182, 0], [0.0182, 0.012], [0.015, 0.022], [0.008, 0.028], [0, 0.03]], C.olive, x, y, z + d * 0.005, { seg: 12, r: [d * PI / 2, 0, 0] });
    }
  }

  /* =========================================================
     武士刀
     ========================================================= */
  function katana() {
    const b = new GFX.Builder(), HY = -0.003;
    // 柄（鮫皮底＋柄卷），菱形窗露出鮫皮
    b.use('matte');
    b.prism(oct(0.017, 0.021, 0.006, HY), 0.225, C.ito, 0, 0, 0.0175, { c2: C.itoD });
    for (let i = 0; i < 7; i++) {
      const z = 0.112 - i * 0.032;
      for (const s of [-1, 1]) quad(b, [s * 0.018, HY, z], [0, 0.0045, 0.0062], [0, 0.0045, -0.0062], [s, 0, 0], C.same);
      if (i < 6) for (const s of [-1, 1]) quad(b, [0, HY + s * 0.022, z - 0.016], [0.0035, 0, 0.0062], [-0.0035, 0, 0.0062], [0, s, 0], C.same);
    }
    b.use('metal');
    for (const s of [-1, 1]) b.box(0.002, 0.008, 0.016, C.brass, s * 0.0185, HY, -0.016);   // 目貫
    b.prism(oct(0.0175, 0.0215, 0.007, HY), 0.014, C.iron, 0, 0, 0.137, { bevel: 0.002 });   // 柄頭
    b.prism(oct(0.0175, 0.0215, 0.007, HY), 0.012, C.brass, 0, 0, -0.1, { bevel: 0.0015 });   // 緣
    // 鐔與切羽
    for (const z of [-0.1085, -0.1195]) b.cyl(0.024, 0.024, 0.003, C.brassD, 0, HY, z, { axis: 'z', seg: 12, s: [1, 1.15, 1] });
    b.at(0, HY, -0.114, [PI / 2, 0, 0], () => b.lathe([[0.012, -0.0035], [0.039, -0.0035], [0.0425, -0.0045], [0.0438, 0], [0.0425, 0.0045], [0.039, 0.0035], [0.012, 0.0035], [0.012, -0.0035]], C.brass, 0, 0, 0, { seg: 16, s: [1, 1, 1.12] }));
    b.use('matte');
    for (const zf of [-1, 1]) for (const s of [-1, 1]) quad(b, [s * 0.027, HY, -0.114 + zf * 0.0047], [0, 0.009, 0], [0.0035, 0, 0], [0, 0, zf], C.bore);
    // 鎺
    b.use('metal');
    b.prism([[0, -0.021], [0.0068, -0.012], [0.0068, 0.014], [0.004, 0.0188], [-0.004, 0.0188], [-0.0068, 0.014], [-0.0068, -0.012]], 0.03, C.brass, 0, 0, -0.136, { bevel: 0.001 });
    // 刀身：彎曲的截面放樣，分成鎬地、平地、刃三塊
    const ts = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.74, 0.84, 0.9, 0.94, 0.97, 1];
    const up = [], ji = [], ha = [], gl = [];
    ts.forEach((t, i) => {
      const z = -0.125 - 0.815 * t, yc = 0.03 * t * t, h = 0.033 - 0.007 * t;
      const k = t < 0.9 ? 0 : (t - 0.9) / 0.1, yT = yc + h / 2 - 0.003 * k * k, yTip = yc + h / 2 - 0.004;
      const yE = (yc - h / 2) + (yTip - (yc - h / 2)) * Math.pow(k, 0.75);
      const yS = (yT - 0.34 * h) + (yTip - (yT - 0.34 * h)) * k, yM = yT - 0.0025 * (1 - k);
      const ws = (0.0045 - 0.0015 * t) * (1 - k), wm = (0.0031 - 0.001 * t) * (1 - k);
      const hf = 0.38 + 0.07 * Math.sin(i * 1.9);
      const P = (x, y) => new V3(x, y, z);
      const edge = P(0, yE), sR = P(ws, yS), sL = P(-ws, yS), hR = P(ws * hf, yE + (yS - yE) * hf), hL = P(-ws * hf, yE + (yS - yE) * hf);
      up.push([sR, P(wm, yM), P(0, yT), P(-wm, yM), sL]);
      ji.push([hR, sR, sL, hL]);
      ha.push([edge, hR, hL]);
      gl.push([P(0, yE - 0.0006), P(ws * 0.3 + 0.0006 * (1 - k), yE + (yS - yE) * 0.26), P(-ws * 0.3 - 0.0006 * (1 - k), yE + (yS - yE) * 0.26)]);
    });
    b.use('metal');
    skin(b, up, 0x9aa2ab, { cap1: false });
    skin(b, ji, 0xc2cad2, { cap1: false });
    skin(b, ha, 0xe1e7ec, { cap1: false });
    b.use('glow'); skin(b, gl.slice(0, -1), 0xcfe0f0, { glow: 0.6 });
    hand(b, {
      pos: [0, HY, -0.04], axis: [0, 0, -1], palm: [1, 0.25, 0], ax: 0.0175, az: 0.0215,
      fingers: [wrap(0.036, [40, 95, 148, 192]), wrap(0.013), wrap(-0.01), Object.assign(wrap(-0.032, [40, 95, 148, 186]), { r: 0.0102 })],
      thumb: { p: [[-40, 0.0], [-90, 0.02], [-130, 0.036], [-155, 0.046]], r: [0.017, 0.014, 0.0122, 0.011] },
      wrist: [-25, -0.04, 0.02], arm: [0.1, -0.3, 0.42]
    });
    const g = b.group({ shadow: false });
    g.rotation.set(0.35, 0.25, 0.4);
    return g;
  }

  /* =========================================================
     電鋸
     ========================================================= */
  function chainsaw() {
    const b = new GFX.Builder();
    // 引擎外殼
    b.use('gloss');
    side(b, [[0.105, -0.088], [-0.112, -0.088], [-0.128, -0.07], [-0.13, 0.0], [-0.115, 0.035], [-0.07, 0.055], [0.03, 0.06], [0.075, 0.05], [0.105, 0.02]], 0.11, C.orange, 0, { bevel: 0.008, c2: C.orangeD });
    b.box(0.085, 0.02, 0.1, C.orange, 0, 0.074, -0.035, { taper: [0.82, 0.86], c2: C.orangeD });
    b.use('matte');
    side(b, [[0.1, -0.085], [-0.11, -0.085], [-0.12, -0.1], [0.095, -0.102]], 0.1, C.poly, 0, { bevel: 0.004 });
    b.cyl(0.009, 0.009, 0.006, C.poly, 0, 0.086, -0.035, { seg: 8 });
    for (let i = 0; i < 5; i++) quad(b, [0, 0.042 - i * 0.012, -0.1395], [0.03, 0, 0], [0, 0.0022, 0], [0, 0, -1], C.polyD);
    // 啟動器蓋（左側）＋通風槽＋拉繩握把
    b.use('gloss');
    b.cyl(0.05, 0.05, 0.012, C.polyL, -0.067, -0.02, 0.02, { axis: 'x', seg: 14 });
    b.cyl(0.013, 0.013, 0.004, C.poly, -0.074, -0.02, 0.02, { axis: 'x', seg: 10 });
    b.use('matte');
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2, c = Math.cos(a), s = Math.sin(a); quad(b, [-0.0742, -0.02 + s * 0.031, 0.02 + c * 0.031], [0, s * 0.009, c * 0.009], [0, c * 0.0022, -s * 0.0022], [-1, 0, 0], C.polyD); }
    pipe(b, [[-0.05, 0.045, 0.03], [-0.052, 0.07, 0.03]], 0.0018, C.white, { sides: 4 });
    b.use('gloss'); b.cyl(0.0085, 0.0085, 0.045, C.blk, -0.052, 0.075, 0.03, { axis: 'z', seg: 8 });
    // 消音器、離合器蓋、爪齒
    b.use('metal');
    b.box(0.04, 0.032, 0.022, C.steelD, -0.03, -0.064, -0.147);
    b.use('matte');
    for (let i = 0; i < 3; i++) quad(b, [-0.03, -0.054 - i * 0.009, -0.1585], [0.016, 0, 0], [0, 0.0017, 0], [0, 0, -1], C.bore);
    b.use('gloss');
    b.box(0.05, 0.075, 0.06, C.poly, 0.038, -0.035, -0.128);
    b.use('metal'); for (const z of [-0.12, -0.14]) b.cyl(0.006, 0.006, 0.01, C.steelL, 0.065, -0.03, z, { axis: 'x', seg: 6 });
    side(b, [[-0.155, -0.05], [-0.172, -0.058], [-0.155, -0.066], [-0.172, -0.074], [-0.155, -0.082]], 0.006, C.steelD, 0.052);
    // 後握把（橘色迴圈＋橡膠段）、油門
    b.use('gloss');
    pipe(b, curve([[0, 0.04, 0.07], [0, 0.072, 0.105], [0, 0.074, 0.19], [0, 0.055, 0.225], [0, 0.0, 0.232], [0, -0.055, 0.22], [0, -0.075, 0.15], [0, -0.08, 0.1]], 18), 0.013, C.orange, { sides: 7 });
    b.use('matte');
    pipe(b, [[0, 0.0735, 0.112], [0, 0.0742, 0.185]], 0.0148, C.rubber, { sides: 8 });
    side(b, [[0.122, 0.064], [0.125, 0.047], [0.14, 0.043], [0.152, 0.062]], 0.01, C.polyD);
    b.box(0.008, 0.008, 0.016, C.polyD, 0, 0.089, 0.125);
    // 前握把、護手（鏈煞）
    pipe(b, curve([[0.055, -0.07, 0.0], [0.072, 0.0, -0.012], [0.062, 0.078, -0.026], [0.0, 0.11, -0.03], [-0.062, 0.078, -0.035], [-0.084, 0.0, -0.045], [-0.084, -0.06, -0.04], [-0.06, -0.095, -0.02]], 20), 0.011, C.blk, { sides: 7 });
    b.at(0, -0.01, -0.07, [-0.18, 0, 0], () => b.prism([[-0.068, 0.0], [-0.066, 0.075], [-0.04, 0.122], [0.04, 0.122], [0.066, 0.075], [0.068, 0.0], [0.054, 0.0], [0.052, 0.068], [0.032, 0.106], [-0.032, 0.106], [-0.052, 0.068], [-0.054, 0.0]], 0.008, C.poly, 0, 0, 0, { bevel: 0.0015 }));
    // 導板
    const bar = [[-0.05, 0.004], [-0.722, -0.002]];
    for (let k = 1; k < 9; k++) { const a = PI / 2 - k * PI / 9; bar.push([-0.722 - 0.028 * Math.cos(a), -0.03 + 0.028 * Math.sin(a)]); }
    bar.push([-0.722, -0.058], [-0.05, -0.064]);
    b.use('metal');
    side(b, bar, 0.007, 0x9aa1aa, 0.02, { bevel: 0.001 });
    b.cyl(0.004, 0.004, 0.009, C.steelL, 0.02, -0.03, -0.722, { axis: 'x', seg: 8 });
    b.use('matte');
    for (const s of [-1, 1]) quad(b, [0.02 + s * 0.0046, -0.03, -0.36], [0, 0, 0.18], [0, 0.0045, 0], [s, 0, 0], 0x5b6168);
    // 鏈條（獨立物件 userData.chain）
    const bc = new GFX.Builder(), path = [], nrm = [];
    const addP = (z, y, nz, ny) => { path.push(new V3(0.02, y, z)); nrm.push(new V3(0, ny, nz)); };
    const off = 0.0028;
    addP(-0.06, 0.0037 + off, 0, 1); addP(-0.722, -0.0023 + off, 0, 1);
    for (let k = 1; k < 9; k++) { const a = PI / 2 - k * PI / 9; addP(-0.722 - (0.028 + off) * Math.cos(a), -0.03 + (0.028 + off) * Math.sin(a), -Math.cos(a), Math.sin(a)); }
    addP(-0.722, -0.058 - off, 0, -1); addP(-0.06, -0.064 - off, 0, -1);
    bc.use('metal');
    pipe(bc, path, 0.0078, C.steelD, { sides: 4, rot: PI / 4, sx: 0.42, flat: true });
    // 沿路徑每 0.04 放一顆鋸齒，左右交錯
    const segL = []; let tot = 0;
    for (let i = 0; i < path.length - 1; i++) { const l = path[i].distanceTo(path[i + 1]); segL.push(l); tot += l; }
    let side_ = 1;
    for (let s = 0.02; s < tot; s += 0.04) {
      let i = 0, acc = s; while (i < segL.length - 1 && acc > segL[i]) { acc -= segL[i]; i++; }
      const f = acc / segL[i], p = path[i].clone().lerp(path[i + 1], f), nn = nrm[i].clone().lerp(nrm[i + 1], f).normalize();
      p.addScaledVector(nn, 0.0035); p.x += side_ * 0.0028;
      bc.at(p.x, p.y, p.z, basis([1, 0, 0], nn), () => bc.box(0.004, 0.0055, 0.011, C.steelL, 0, 0, 0, { taper: [0.8, 0.55] }));
      side_ = -side_;
    }
    hand(b, {
      pos: [0, 0.074, 0.15], axis: [0, 0, -1], palm: [0.5, 0.85, 0], ax: 0.0148, az: 0.0148,
      fingers: [wrap(0.034, [35, 90, 145, 188]), wrap(0.011, [35, 90, 145, 188]), wrap(-0.012, [35, 90, 145, 186]), Object.assign(wrap(-0.034, [35, 90, 140, 180]), { r: 0.0102 })],
      thumb: { p: [[-45, 0.018], [-95, 0.035], [-145, 0.042], [-175, 0.046]], r: [0.017, 0.014, 0.0122, 0.011] },
      wrist: [-30, -0.04, 0.02], arm: [0.2, -0.36, 0.52]
    });
    hand(b, {
      m: -1, pos: [-0.012, 0.11, -0.03], axis: [1, 0, 0], palm: [0, 0.6, 0.8], ax: 0.0115, az: 0.0115,
      fingers: [wrap(0.034, [35, 90, 145, 190]), wrap(0.011, [35, 90, 145, 190]), wrap(-0.012, [35, 90, 145, 188]), Object.assign(wrap(-0.034, [35, 90, 140, 182]), { r: 0.0102 })],
      thumb: { p: [[-45, 0.018], [-95, 0.035], [-145, 0.042], [-175, 0.046]], r: [0.017, 0.014, 0.0122, 0.011] },
      wrist: [-30, -0.04, 0.02], arm: [-0.3, -0.32, 0.28]
    });
    const g = b.group({ shadow: false }), chain = bc.group({ shadow: false });
    chain.name = 'chain'; g.add(chain); g.userData.chain = chain;
    return g;
  }

  /* =========================================================
     噴火槍
     ========================================================= */
  function flamer() {
    const b = new GFX.Builder();
    b.use('matte');
    side(b, [[0.066, -0.03], [-0.15, -0.03], [-0.16, -0.012], [-0.15, 0.034], [-0.12, 0.044], [0.03, 0.044], [0.058, 0.03], [0.066, 0.0]], 0.054, C.polyL, 0, { bevel: 0.003, c2: C.polyD });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) quad(b, [s * 0.028, 0.02, -0.03 - i * 0.022], [0, 0.012, 0], [0, 0, 0.004], [s, 0, 0], C.polyD);
    // 槍管、隔熱罩、噴嘴
    b.use('metal');
    b.cyl(0.016, 0.016, 0.56, C.steel, 0, BY, -0.43, { axis: 'z', seg: 10 });
    b.use('gloss');
    b.cyl(0.031, 0.031, 0.27, C.steelD, 0, BY, -0.555, { axis: 'z', seg: 12 });
    b.use('metal');
    for (const z of [-0.426, -0.684]) b.cyl(0.0335, 0.0335, 0.012, C.steel, 0, BY, z, { axis: 'z', seg: 12 });
    b.use('matte');
    for (let k = 0; k < 12; k++) {
      const a = (15 + 30 * k) * DEG; if (Math.sin(a) < -0.6) continue;
      const x = Math.cos(a), y = Math.sin(a);
      for (const z of [-0.46, -0.51, -0.56, -0.61, -0.65]) quad(b, [x * 0.031, BY + y * 0.031, z], [0, 0, 0.014], [-y * 0.003, x * 0.003, 0], [x, y, 0], C.bore);
    }
    b.use('metal');
    b.cyl(0.019, 0.0145, 0.09, C.brass, 0, BY, -0.734, { axis: 'z', seg: 12 });
    b.cyl(0.0155, 0.0155, 0.006, C.steelD, 0, BY, -0.776, { axis: 'z', seg: 12 });
    b.use('matte'); b.cyl(0.0075, 0.0075, 0.002, C.bore, 0, BY, -0.7795, { axis: 'z', seg: 10 });
    // 點火器罩＋引火（發光）
    b.use('gloss');
    b.box(0.018, 0.014, 0.06, C.blk, 0, BY - 0.026, -0.74);
    b.use('matte'); for (const s of [-1, 1]) quad(b, [s * 0.0101, BY - 0.026, -0.74], [0, 0, 0.018], [0, 0.003, 0], [s, 0, 0], C.bore);
    // 加壓氣瓶（左）＋壓力錶
    b.use('gloss');
    b.at(-0.05, -0.045, -0.15, [PI / 2, 0, 0], () => b.lathe([[0, -0.08], [0.012, -0.077], [0.019, -0.068], [0.019, 0.068], [0.012, 0.077], [0, 0.08]], 0x6d7884, 0, 0, 0, { seg: 10 }));
    const gn = [-0.55, 0.62, 0.56], gp = [-0.062, -0.024, -0.085];
    b.use('metal'); pipe(b, [[-0.054, -0.03, -0.085], gp], 0.003, C.steel, { sides: 5 });
    b.at(gp[0], gp[1], gp[2], basis([0, 0, -1], gn), () => {
      b.use('metal'); b.cyl(0.0145, 0.0145, 0.009, C.steelL, 0, 0, 0, { seg: 14 });
      b.use('matte'); b.cyl(0.012, 0.012, 0.001, C.white, 0, 0.0047, 0, { seg: 14 });
      b.use('glass'); b.cyl(0.0122, 0.0122, 0.0012, 0xcfe6ff, 0, 0.0072, 0, { seg: 14 });
    });
    // 閥塊與油管
    b.use('metal'); b.box(0.03, 0.026, 0.04, C.steelD, 0, -0.012, -0.185);
    b.use('matte');
    pipe(b, curve([[0, -0.075, -0.27], [0, -0.066, -0.3], [0, -0.03, -0.29], [0, -0.016, -0.205]], 10), 0.0058, C.rubber, { sides: 6 });
    pipe(b, curve([[-0.05, -0.045, -0.228], [-0.045, -0.03, -0.25], [-0.018, -0.01, -0.21]], 8), 0.0048, C.rubber, { sides: 6 });
    b.use('metal'); b.cyl(0.0075, 0.0075, 0.01, C.brass, 0, -0.07, -0.268, { axis: 'z', seg: 8 });
    // 前握把夾具（夾住槍管）、燃料罐托架
    b.use('gloss');
    b.box(0.03, 0.026, 0.03, C.blk, 0, BY - 0.009, -0.37);
    b.box(0.022, 0.012, 0.13, C.polyD, 0, -0.034, -0.15);
    pistolGrip(b, 0.01, 0, C.poly, -0.07);
    vertGrip(b, -0.37, -0.016);
    gripHand(b, 0.01, 0);
    const g = b.group({ shadow: false });
    // 主燃料罐（紅）＋束帶；pivot 在罐子中心軸上，換彈時轉開再換一罐
    part(g, 'tank', b => {
      b.use('gloss');
      b.at(0, -0.078, -0.15, [PI / 2, 0, 0], () => b.lathe([[0, -0.12], [0.022, -0.117], [0.036, -0.105], [0.042, -0.088], [0.042, 0.088], [0.036, 0.105], [0.022, 0.117], [0, 0.12]], C.red, 0, 0, 0, { seg: 12 }));
      for (const z of [-0.075, -0.225]) b.cyl(0.0435, 0.0435, 0.01, C.steelD, 0, -0.078, z, { axis: 'z', seg: 12 });
      b.use('matte'); for (const s of [-1, 1]) quad(b, [s * 0.0432, -0.075, -0.15], [0, 0.014, 0], [0, 0, 0.05], [s, 0, 0], 0xd9cfae);
      b.use('glow'); quad(b, [-0.0434, -0.075, -0.15], [0, 0.004, 0], [0, 0, 0.022], [-1, 0, 0], C.amber, { glow: 0.5 });
    }, [0, -0.078, -0.15]);
    // 引火（發光；開火時閃爍）
    const PL = [0, BY - 0.024, -0.7715];
    part(g, 'pilot', b => {
      b.use('glow');
      b.sph(0.0042, 0xffe08a, 0, BY - 0.024, -0.7715, { seg: 8, glow: 2.4 });
      b.cyl(0.0055, 0.0, 0.016, 0xff7a2a, 0, BY - 0.023, -0.781, { axis: 'z', seg: 8, glow: 2 });
    }, PL);
    // 壓力錶指針：pivot 在錶心，繞錶面法線轉
    part(g, 'needle', b => b.at(gp[0], gp[1], gp[2], basis([0, 0, -1], gn), () => {
      b.use('matte'); b.box(0.0016, 0.001, 0.009, C.red, 0.002, 0.0058, 0.0025, { r: [0, 0.7, 0] });
    }), gp);
    g.userData.parts.needle.userData.axis = new V3(gn[0], gn[1], gn[2]).normalize();
    const LH = [0, -0.016 - 0.06, -0.37];
    part(g, 'leftHand', b => vertHand(b, -0.37, -0.016), LH);
    return g;
  }

  /* =========================================================
     閃電槍
     ========================================================= */
  function tesla() {
    const b = new GFX.Builder();
    b.use('gloss');
    side(b, [[0.07, -0.032], [-0.235, -0.032], [-0.262, -0.012], [-0.262, 0.038], [-0.24, 0.052], [-0.02, 0.056], [0.04, 0.05], [0.072, 0.02]], 0.062, C.tesla, 0, { bevel: 0.004, c2: C.teslaD });
    b.use('matte');
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) quad(b, [s * 0.032, 0.012, -0.07 - i * 0.02], [0, 0.013, 0], [0, 0, 0.0035], [s, 0, 0], C.teslaD);
    b.use('glow');
    for (const s of [-1, 1]) quad(b, [s * 0.032, 0.038, -0.12], [0, 0.0016, 0], [0, 0, 0.08], [s, 0, 0], C.cyan, { glow: 1.3 });
    // 頂部電容管（玻璃＋發光核心）
    for (const x of [-0.016, 0.016]) {
      b.use('glass'); b.cyl(0.011, 0.011, 0.13, 0xbfe9ff, x, 0.072, -0.1, { axis: 'z', seg: 10 });
      b.use('glow'); b.cyl(0.0045, 0.0045, 0.12, C.cyan, x, 0.072, -0.1, { axis: 'z', seg: 6, glow: 1.6 });
      b.use('metal'); for (const z of [-0.03, -0.17]) b.cyl(0.0128, 0.0128, 0.012, C.copper, x, 0.072, z, { axis: 'z', seg: 10 });
      b.use('gloss'); for (const z of [-0.03, -0.17]) b.box(0.012, 0.01, 0.01, C.teslaD, x, 0.062, z);
    }
    b.use('metal'); b.cyl(0.006, 0.006, 0.012, C.steelL, -0.035, 0.03, 0.02, { axis: 'x', seg: 10 });
    // 絕緣子、導桿、線圈
    b.use('gloss');
    b.at(0, BY, -0.262, [-PI / 2, 0, 0], () => b.lathe([[0.008, 0], [0.024, 0.002], [0.024, 0.008], [0.014, 0.011], [0.022, 0.014], [0.022, 0.02], [0.013, 0.023], [0.02, 0.026], [0.02, 0.032], [0.008, 0.035]], C.white, 0, 0, 0, { seg: 10 }));
    b.cyl(0.06, 0.06, 0.008, C.teslaD, 0, BY, -0.268, { axis: 'z', seg: 12 });
    b.use('metal');
    b.cyl(0.0075, 0.0075, 0.29, C.steel, 0, BY, -0.415, { axis: 'z', seg: 8 });
    b.use('matte'); b.cyl(0.015, 0.015, 0.185, C.polyD, 0, BY, -0.3975, { axis: 'z', seg: 10 });
    b.use('metal');
    for (const z of [-0.305, -0.49]) b.cyl(0.024, 0.024, 0.004, C.copper, 0, BY, z, { axis: 'z', seg: 12 });
    const hel = [];
    for (let i = 0; i <= 36; i++) { const a = i / 36 * PI * 2 * 6; hel.push([Math.cos(a) * 0.0185, BY + Math.sin(a) * 0.0185, -0.312 - i / 36 * 0.17]); }
    pipe(b, hel, 0.0034, C.copper, { sides: 4 });
    // 支撐桿、前環、尖叉
    for (const a of [90, 210, 330]) { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); b.cyl(0.003, 0.003, 0.262, C.steelL, c * 0.054, BY + s * 0.054, -0.401, { axis: 'z', seg: 6 }); }
    b.use('gloss');
    b.at(0, BY, -0.532, [PI / 2, 0, 0], () => b.lathe([[0.04, -0.004], [0.058, -0.004], [0.058, 0.004], [0.04, 0.004], [0.04, -0.004]], C.teslaD, 0, 0, 0, { seg: 12 }));
    b.use('metal');
    for (const a of [90, 210, 330]) {
      const c = Math.cos(a * DEG), s = Math.sin(a * DEG), P = r => [c * r[0], BY + s * r[0], r[1]];
      pipe(b, [P([0.05, -0.535]), P([0.046, -0.556]), P([0.026, -0.571]), P([0.017, -0.575])], [0.0036, 0.0032, 0.0027, 0.0022], C.copper, { sides: 5 });
      b.use('glow'); b.sph(0.0038, C.cyan, ...P([0.016, -0.576]), { seg: 6, glow: 2 }); b.use('metal');
    }
    b.use('glow'); b.sph(0.008, 0xbff0ff, 0, BY, -0.572, { seg: 10, glow: 1.8 });
    // 電纜
    b.use('matte');
    for (const s of [-1, 1]) pipe(b, curve([[s * 0.033, 0.02, -0.22], [s * 0.045, 0.024, -0.26], [s * 0.03, 0.03, -0.3]], 6), 0.0035, C.redD, { sides: 5 });
    pistolGrip(b, 0.02, 0, C.poly, -0.06);
    vertGrip(b, -0.2, -0.034);
    gripHand(b, 0.02, 0);
    vertHand(b, -0.2, -0.034);
    const g = b.group({ shadow: false });
    // 旋轉的發光環（userData.spin，繞 Z 軸）
    const bs = new GFX.Builder();
    [-0.06, 0, 0.06].forEach((dz, i) => {
      bs.use('glow'); bs.add(new THREE.TorusGeometry(0.043, 0.003, 3, 16), C.cyan, 0, 0, dz, { glow: 1.4, smooth: true });
      bs.use('gloss');
      for (let k = 0; k < 3; k++) { const a = k * PI * 2 / 3 + i * 0.7; bs.at(Math.cos(a) * 0.043, Math.sin(a) * 0.043, dz, [0, 0, a], () => bs.box(0.009, 0.008, 0.012, C.teslaD)); }
    });
    const spin = bs.group({ shadow: false }); spin.name = 'spin'; spin.position.set(0, BY, -0.40);
    g.add(spin); g.userData.spin = spin;
    return g;
  }

  /* =========================================================
     榴彈發射器（轉輪式）
     ========================================================= */
  function grenade() {
    const b = new GFX.Builder(), CY = -0.03;
    // 槍管
    b.use('gloss');
    b.cyl(0.03, 0.03, 0.36, 0x2b2f34, 0, BY, -0.44, { axis: 'z', seg: 14 });
    b.cyl(0.0325, 0.0325, 0.014, C.steelD, 0, BY, -0.613, { axis: 'z', seg: 14 });
    b.use('matte');
    b.cyl(0.021, 0.021, 0.004, C.bore, 0, BY, -0.6192, { axis: 'z', seg: 14 });
    // 護木（八角，橄欖綠）＋通風槽
    b.use('gloss');
    b.prism(ngon(0.037, 8, PI / 8, BY), 0.23, C.olive, 0, 0, -0.385, { bevel: 0.0015, c2: C.oliveD });
    b.use('matte');
    for (const ang of [PI * 0.75, PI * 1.25, PI * 0.25, -PI * 0.25]) {
      const nx = Math.cos(ang), ny = Math.sin(ang);
      for (const z of [-0.31, -0.35, -0.39, -0.43, -0.47]) quad(b, [nx * 0.0357, BY + ny * 0.0357, z], [0, 0, 0.013], [-ny * 0.005, nx * 0.005, 0], [nx, ny, 0], C.oliveD);
    }
    // 框架：後擋板、前板、頂樑、下樑、轉軸
    b.use('gloss');
    b.cyl(0.07, 0.07, 0.014, C.oliveD, 0, CY, -0.062, { axis: 'z', seg: 18 });
    b.box(0.042, 0.155, 0.016, C.oliveD, 0, -0.0325, -0.259);
    b.box(0.034, 0.014, 0.21, C.oliveD, 0, 0.044, -0.16);
    b.box(0.026, 0.012, 0.22, C.oliveD, 0, CY - 0.074, -0.16);
    b.use('metal'); b.cyl(0.012, 0.012, 0.012, C.steel, 0, CY, -0.27, { axis: 'z', seg: 10 });
    rail(b, 0.0, -0.5, 0.06, C.oliveD);
    // 機匣
    b.use('gloss');
    side(b, [[0.03, -0.04], [-0.056, -0.04], [-0.056, 0.052], [0.0, 0.052], [0.03, 0.03]], 0.05, C.oliveD, 0, { bevel: 0.002, c2: 0x262d1c });
    b.use('metal'); for (const z of [-0.01, -0.04]) b.cyl(0.003, 0.003, 0.054, C.steel, 0, -0.025, z, { axis: 'x', seg: 6 });
    // 立式表尺（葉片）＋準星（琥珀點）
    b.use('gloss');
    b.box(0.024, 0.005, 0.03, C.blk, 0, 0.0625, -0.12);
    b.at(0, 0.065, -0.12, [0.25, 0, 0], () => {
      for (const s of [-1, 1]) b.box(0.003, 0.05, 0.003, C.blk, s * 0.012, 0.025, 0);
      b.box(0.027, 0.003, 0.003, C.blk, 0, 0.05, 0);
      for (const y of [0.016, 0.032]) b.box(0.024, 0.0016, 0.002, C.blk, 0, y, 0);
      b.use('matte'); for (const y of [0.024, 0.04]) quad(b, [0.0102, y, 0.0026], [0.0008, 0, 0], [0, 0.0008, 0], [0, 0, 1], C.white);
      b.use('gloss');
    });
    b.box(0.004, 0.016, 0.004, C.blk, 0, 0.068, -0.488);
    b.use('glow'); quad(b, [0, 0.073, -0.4858], [0.0016, 0, 0], [0, 0.0016, 0], [0, 0, 1], C.amber, { glow: 1.5 });
    // 折疊槍托（骨架）
    b.use('gloss');
    b.box(0.03, 0.05, 0.02, C.blk, 0, -0.004, 0.035);
    pipe(b, [[0, 0.016, 0.03], [0, 0.012, 0.24]], 0.0075, C.blk, { sides: 8 });
    pipe(b, [[0, -0.024, 0.03], [0, -0.062, 0.235]], 0.0075, C.blk, { sides: 8 });
    b.use('matte');
    b.box(0.03, 0.012, 0.08, C.poly, 0, 0.024, 0.16);
    side(b, [[0.232, 0.032], [0.252, 0.032], [0.256, -0.088], [0.236, -0.088]], 0.04, C.rubber, 0, { bevel: 0.003 });
    pistolGrip(b, 0.01, -0.004, C.poly, -0.06);
    vertGrip(b, -0.41, BY - 0.035);
    gripHand(b, 0.01, -0.004);
    const g = b.group({ shadow: false });
    // 轉輪（pivot 在轉輪中心：rotation.z 轉膛室，position 做甩出）
    part(g, 'drum', b => {
      b.use('gloss');
      b.cyl(0.066, 0.066, 0.18, C.olive, 0, CY, -0.16, { axis: 'z', seg: 18 });
      for (let k = 0; k < 6; k++) { const a = k * PI / 3; b.at(Math.cos(a) * 0.0652, CY + Math.sin(a) * 0.0652, -0.16, [0, 0, a], () => b.box(0.004, 0.013, 0.15, C.oliveD)); }
      b.use('matte');
      for (let k = 0; k < 6; k++) {
        const a = PI / 2 + k * PI / 3, p = [Math.cos(a) * 0.045, CY + Math.sin(a) * 0.045];
        for (const [zz, nz] of [[-0.2512, -1], [-0.0688, 1]]) {
          disc(b, [p[0], p[1], zz], [0, 0, nz], 0.019, 10, C.bore);
          disc(b, [p[0], p[1], zz + nz * 0.0012], [0, 0, nz], 0.011, 8, 0xb08a32);
        }
      }
      b.use('metal'); b.cyl(0.014, 0.014, 0.186, C.steel, 0, CY, -0.16, { axis: 'z', seg: 10 });
    }, [0, CY, -0.16]);
    const LH = [0, BY - 0.035 - 0.06, -0.41];
    const lh = part(g, 'leftHand', b => vertHand(b, -0.41, BY - 0.035), LH);
    // 換彈時手上那顆 40mm 榴彈
    const RD = [0.006, LH[1] + 0.062, LH[2] - 0.002];
    part(g, 'round', b => shellModel(b, 'grenade', RD, -1), RD, lh, false);
    return g;
  }

  /* =========================================================
     投擲物
     ========================================================= */
  function molotov() {
    const b = new GFX.Builder(), Z = -0.12;
    // 液體（在玻璃裡）
    b.use('gloss');
    b.lathe([[0, -0.07], [0.036, -0.07], [0.0375, -0.064], [0.0375, 0.028], [0, 0.028]], 0xc28630, 0, 0, Z, { seg: 12 });
    // 標籤（破一角）
    b.use('matte');
    b.add(new THREE.LatheGeometry([new THREE.Vector2(0.0422, -0.045), new THREE.Vector2(0.0422, 0.012)], 12, 0.6, PI * 1.6), 0xd9cfae, 0, 0, Z, { c2: 0x9a8c64 });
    b.add(new THREE.LatheGeometry([new THREE.Vector2(0.0425, -0.034), new THREE.Vector2(0.0425, -0.022)], 12, 0.9, PI * 1.1), C.red, 0, 0, Z, {});
    // 破布：塞進瓶口、翻過瓶唇垂下，頂端燒焦
    pipe(b, curve([[0, 0.09, Z], [0, 0.128, Z], [0.01, 0.137, Z + 0.004], [0.02, 0.124, Z + 0.006], [0.024, 0.098, Z + 0.004], [0.022, 0.08, Z]], 10), [0.008, 0.0085, 0.0075, 0.0068, 0.0064, 0.006, 0.0058, 0.0055, 0.005, 0.0045, 0.004], 0xcfc3a8, { sides: 6, c2: 0x8b7d60 });
    pipe(b, curve([[0, 0.12, Z], [-0.004, 0.14, Z], [0.0, 0.158, Z - 0.002], [-0.003, 0.17, Z]], 6), [0.007, 0.0065, 0.0055, 0.0045, 0.0035, 0.0028, 0.002], 0x3a3026, { sides: 6 });
    // 玻璃瓶
    b.use('glass');
    b.lathe([[0, -0.076], [0.036, -0.076], [0.041, -0.068], [0.041, 0.035], [0.032, 0.056], [0.016, 0.076], [0.013, 0.1], [0.0135, 0.112], [0.0162, 0.115], [0.0162, 0.122], [0.012, 0.124]], 0x4f8a3f, 0, 0, Z, { seg: 14 });
    hand(b, {
      pos: [0, -0.02, Z], axis: [0, 1, 0], palm: [1, 0, 0.25], ax: 0.041, az: 0.041,
      fingers: [wrap(0.032, [35, 80, 125, 160]), wrap(0.008, [35, 80, 125, 162]), wrap(-0.016, [35, 80, 125, 160]), Object.assign(wrap(-0.039, [35, 80, 122, 155]), { r: 0.0102 })],
      thumb: { p: [[-40, 0.02], [-85, 0.035], [-125, 0.045], [-152, 0.05]], r: [0.017, 0.014, 0.0122, 0.011] },
      wrist: [-45, -0.01, 0.02], arm: [0.18, -0.36, 0.32]
    });
    const g = b.group({ shadow: false });
    // 火焰（獨立 mesh，遊戲每幀隨機縮放）；幾何原點在火焰底部
    const fg = new THREE.ConeGeometry(0.021, 0.07, 8, 1, true); fg.translate(0, 0.035, 0);
    const flame = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xd8641f, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    flame.position.set(-0.003, 0.162, Z); flame.renderOrder = 3;
    const cg = new THREE.ConeGeometry(0.01, 0.04, 8, 1, true); cg.translate(0, 0.02, 0);
    const core = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    core.renderOrder = 4; flame.add(core);
    g.add(flame); g.userData.flame = flame;
    g.rotation.set(0.15, 0, -0.25);
    return g;
  }

  function frag() {
    const b = new GFX.Builder(), Z = -0.12, R = 0.042, SY = 1.12;
    b.use('matte');
    b.sph(R - 0.004, 0x2c3420, 0, 0, Z, { seg: 10, s: [1, SY, 1] });
    // 鳳梨格：5 列 × 8 欄的小塊，徑向排列
    for (let i = 0; i < 5; i++) {
      const lat = (-52 + i * 26) * DEG;
      for (let j = 0; j < 8; j++) {
        const lon = (j + 0.5) / 8 * PI * 2, cl = Math.cos(lat);
        const p = new V3(R * cl * Math.cos(lon), R * SY * Math.sin(lat), R * cl * Math.sin(lon));
        const nrm = new V3(cl * Math.cos(lon), Math.sin(lat) / SY, cl * Math.sin(lon)).normalize();
        const east = new V3(-Math.sin(lon), 0, Math.cos(lon));
        const north = new V3().crossVectors(nrm, east);
        p.addScaledVector(nrm, -0.002);
        b.at(p.x, p.y, p.z + Z, basis(east, north), () => b.box(2 * PI * R * cl / 8 * 0.8, R * SY * 26 * DEG * 0.8, 0.008, C.olive, 0, 0, 0, { taper: 1, c2: C.oliveD }));
      }
    }
    // 引信、握片、拉環
    b.use('metal');
    b.cyl(0.012, 0.014, 0.022, C.steel, 0, R * SY + 0.006, Z, { seg: 10 });
    b.cyl(0.008, 0.008, 0.012, C.steelL, 0, R * SY + 0.022, Z, { seg: 8 });
    pipe(b, [[0.0, R * SY + 0.02, Z], [0.016, R * SY + 0.02, Z], [0.036, R * SY - 0.002, Z], [0.047, 0.016, Z], [0.048, -0.012, Z], [0.044, -0.03, Z]], 0.0068, 0x8c939b, { sides: 4, rot: PI / 4, sx: 0.28, up: [1, 0, 0], flat: true });
    b.cyl(0.0018, 0.0018, 0.03, C.steelL, -0.006, R * SY + 0.012, Z, { axis: 'x', seg: 5 });
    b.add(new THREE.TorusGeometry(0.0125, 0.0017, 4, 14), C.brass, -0.03, R * SY + 0.012, Z, { r: [0, 0.5, 0.3], smooth: true });
    b.use('matte'); b.cyl(0.01, 0.01, 0.006, 0x2c3420, 0, -R * SY + 0.002, Z, { seg: 8 });
    hand(b, {
      pos: [0, -0.012, Z], axis: [0, 1, 0], palm: [1, 0, 0.2], ax: 0.043, az: 0.043, ry: 0.06,
      fingers: [wrap(0.03, [30, 78, 122, 158]), wrap(0.008, [30, 78, 122, 160]), wrap(-0.015, [30, 78, 122, 158]), Object.assign(wrap(-0.036, [30, 78, 118, 150]), { r: 0.0102 })],
      thumb: { p: [[-40, 0.02], [-85, 0.033], [-125, 0.04], [-150, 0.043]], r: [0.017, 0.014, 0.0122, 0.011] },
      wrist: [-45, -0.012, 0.022], arm: [0.18, -0.36, 0.32]
    });
    const g = b.group({ shadow: false });
    g.rotation.set(0.1, 0.3, -0.15);
    return g;
  }

  const GUNS = { pistol, rifle, shotgun, katana, chainsaw, flamer, tesla, grenade };
  const THROWS = { molotov, frag };
  // 短槍在共用的握持位置會沉到畫面外：個別往上、往前挪，並告訴遊戲槍口火光要跟著移到哪
  const POSE = { pistol: { p: [-0.02, 0.05, -0.08], flash: [-0.02, 0.07, -0.08] } };
  GFX.buildGunModel = function (kind) {
    const f = GUNS[kind]; if (!f) return new THREE.Group();
    const g = f(), o = POSE[kind]; if (!o) return g;
    const w = new THREE.Group(); g.position.set(o.p[0], o.p[1], o.p[2]); w.add(g);
    Object.assign(w.userData, g.userData, { flashOff: o.flash });
    // 拋殼口位置也要跟著外層的位移（userData.eject 一律是外層 group 的座標）
    if (g.userData.eject) w.userData.eject = g.userData.eject.map((v, i) => v + o.p[i]);
    return w;
  };
  GFX.buildThrowModel = function (kind) { const f = THROWS[kind]; return f ? f() : new THREE.Group(); };

  /* =========================================================
     武器零件動畫
     GFX.weaponAnim(model, kind, s, dt) → 布林值：這一幀要不要拋出彈殼
       s = { reloadK, sinceFire, firing, rate }
       reloadK 0 = 沒在換彈，否則 0→1 是換彈進度；sinceFire 距離上一發幾秒；firing 扳機按住；rate 射速（秒／發）
     每幀都可以呼叫：先把 userData.parts 還原到靜止姿勢，再依 s 算出這一幀的位移（不留狀態）。
     只動零件（模型本地座標）；整把槍的下壓、後座由遊戲處理。
     回傳 true 表示這一幀該叫 GFX.ejectShell（手槍／步槍在開火後第一幀、霰彈槍在泵動往後拉到底時）。
     ========================================================= */
  const cl01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const seg = (k, a, b) => cl01((k - a) / (b - a));
  const ease = t => t * t * (3 - 2 * t);
  const sm = (k, a, b) => ease(seg(k, a, b));
  // 開火後的「往後頂、再回來」曲線：0→1→0，up 是往後那段佔的比例
  const kick = (t, dur, up) => { if (!(t >= 0) || t >= dur) return 0; const u = t / dur; return u < up ? ease(u / up) : 1 - ease((u - up) / (1 - up)); };
  // sinceFire 在這一幀剛好跨過 t0（無狀態的事件偵測）
  const crossed = (t, dt, t0) => t >= t0 && t - (dt || 0.016) < t0;
  const _o = new V3(), _o2 = new V3(), _q = new THREE.Quaternion();
  function restore(P) {
    for (const k in P) { const p = P[k], r = p.userData.rest; p.position.copy(r.p); p.quaternion.copy(r.q); p.scale.copy(r.s); p.visible = r.v; }
  }
  const lerp3 = (out, a, b, t) => out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  // 依關鍵影格（[k, [x,y,z]]，k 遞增）在 k 時間點取位移，段與段之間 smoothstep
  function track(out, keys, k) {
    if (k <= keys[0][0]) return out.set(keys[0][1][0], keys[0][1][1], keys[0][1][2]);
    for (let i = 1; i < keys.length; i++) if (k <= keys[i][0]) return lerp3(out, keys[i - 1][1], keys[i][1], ease(seg(k, keys[i - 1][0], keys[i][0])));
    const l = keys[keys.length - 1][1]; return out.set(l[0], l[1], l[2]);
  }
  const addPos = (p, v) => p.position.add(v);
  /* GFX.weaponAnim 的各武器實作：P = userData.parts，k = 換彈進度（0 = 沒在換彈） */

  const ANIM = {
    pistol(P, s, k, dt) {
      const dn = [0, -Math.cos(PISTOL_A), Math.sin(PISTOL_A)];
      let sl = 0.025 * kick(s.sinceFire, 0.08, 0.25);
      if (k > 0) {
        // 左手：從畫面下方上來 → 彈匣尖對準握把 → 推進去 → 收回
        const LOW = [-0.07, -0.3, 0.13], STAGE = dn.map(v => v * 0.06), Z = [0, 0, 0];
        track(_o, [[0.24, LOW], [0.52, STAGE], [0.63, Z], [0.69, Z], [0.86, LOW]], k);
        P.leftHand.visible = k > 0.24 && k < 0.86;
        addPos(P.leftHand, _o); P.leftHand.rotateX(0.25 * (1 - sm(k, 0.4, 0.63)) * (k < 0.69 ? 1 : 0));
        if (k < 0.28) {
          // 舊彈匣往下掉出去
          const d = sm(k, 0.03, 0.27); _o2.set(dn[0], dn[1], dn[2]).multiplyScalar(0.26 * d * d + 0.02 * d); addPos(P.mag, _o2); P.mag.rotateX(-0.5 * d * d);
          P.mag.visible = k < 0.26;
        } else if (k < 0.63) { addPos(P.mag, _o); P.mag.rotateX(0.25 * (1 - sm(k, 0.4, 0.63))); }
        // 最後拉滑套上膛
        sl = Math.max(sl, 0.03 * (sm(k, 0.74, 0.82) - sm(k, 0.87, 0.9)));
      }
      P.slide.position.z += sl;
      return crossed(s.sinceFire, dt, 0.012);
    },
    rifle(P, s, k, dt) {
      P.bolt.position.z += 0.02 * kick(s.sinceFire, Math.min(0.075, (s.rate || 0.1) * 0.8), 0.3);
      if (k > 0) {
        // 左手關鍵影格（位移，相對握護木的位置）
        const R = [0, 0, 0], MAG = [0.004, -0.186, 0.225], OUT = [-0.03, -0.46, 0.3], UNDER = [0, -0.226, 0.225];
        const CH = [-0.006, 0.03, 0.43], SIDE = [-0.09, -0.04, 0.33], PULL = [-0.006, 0.03, 0.49];
        const keys = [[0, R], [0.12, MAG], [0.17, MAG], [0.32, OUT], [0.4, OUT], [0.56, UNDER], [0.64, MAG], [0.67, MAG], [0.72, SIDE], [0.77, CH], [0.84, PULL], [0.86, PULL], [0.92, SIDE], [1, R]];
        track(_o, keys, k);
        addPos(P.leftHand, _o);
        P.leftHand.rotateX(-0.35 * (sm(k, 0.0, 0.12) - sm(k, 0.64, 0.74)));
        P.leftHand.rotateZ(0.5 * (sm(k, 0.67, 0.77) - sm(k, 0.86, 1)));
        // 彈匣跟著手（抓住之後才動），拿出去的那段藏起來換一個
        if (k > 0.17 && k < 0.64) { _o2.set(_o.x - MAG[0], _o.y - MAG[1], _o.z - MAG[2]); addPos(P.mag, _o2); }
        P.mag.visible = !(k > 0.33 && k < 0.42);
        // 拉機柄：往後拉到底，放開時彈回去
        P.charge.position.z += 0.06 * (sm(k, 0.77, 0.84) - sm(k, 0.86, 0.89));
        if (k > 0.77 && k < 0.89) P.bolt.position.z += 0.02 * (sm(k, 0.77, 0.84) - sm(k, 0.86, 0.89));
      }
      return crossed(s.sinceFire, dt, 0.008);
    },
    shotgun(P, s, k, dt) {
      const r = Math.max(s.rate || 0.85, 0.3), t = s.sinceFire;
      // 開火後泵動：往後拉到底（拋殼）再推回去
      const pump = 0.075 * (sm(t, 0.16 * r, 0.36 * r) - sm(t, 0.42 * r, 0.62 * r));
      P.pump.position.z += pump;
      if (k > 0) {
        // 左手離開護木，到下方裝填口一顆一顆推進去（4 次）
        const PORT = [0, -0.066, 0.31], PUSH = [0, -0.051, 0.27], LOW = [-0.02, -0.14, 0.36], Z = [0, 0, 0];
        const n = 4, a = 0.12, b = 0.88, L = (b - a) / n;
        if (k < a) track(_o, [[0, Z], [a, LOW]], k);
        else if (k >= b) track(_o, [[b, LOW], [1, Z]], k);
        else {
          const p = ((k - a) % L) / L;
          track(_o, [[0, LOW], [0.45, PORT], [0.66, PUSH], [1, LOW]], p);
          P.shell.visible = p < 0.66;
        }
        addPos(P.leftHand, _o);
        P.leftHand.rotateZ(-0.3 * (sm(k, 0, a) - sm(k, b, 1)));
      } else P.leftHand.position.z += pump;
      return crossed(t, dt, 0.36 * r);
    },
    grenade(P, s, k) {
      if (k <= 0) return false;
      // 轉輪往左甩出 → 6 顆一顆一顆塞進後面的膛室（轉輪跟著轉一格）→ 甩回去
      const e = sm(k, 0.02, 0.16) - sm(k, 0.84, 0.96);
      P.drum.position.x -= 0.108 * e; P.drum.position.y -= 0.028 * e;
      P.drum.rotation.z = 0.25 * e;
      const a = 0.2, b = 0.8, n = 6, L = (b - a) / n;
      let spin = 0, p = -1;
      if (k >= a && k < b) { const i = Math.floor((k - a) / L); p = ((k - a) % L) / L; spin = i + sm(p, 0.72, 0.95); }
      else if (k >= b) spin = n;
      P.drum.rotateZ(spin * PI / 3);
      const AT = [-0.112, 0.045, 0.385], IN = [-0.112, 0.045, 0.345], LOW = [-0.14, -0.04, 0.45], Z = [0, 0, 0];
      if (k < a) track(_o, [[0.04, Z], [a, LOW]], k);
      else if (k >= b) track(_o, [[b, LOW], [0.97, Z]], k);
      else { track(_o, [[0, LOW], [0.4, AT], [0.62, IN], [1, LOW]], p); P.round.visible = p < 0.62; }
      addPos(P.leftHand, _o);
      return false;
    },
    flamer(P, s, k) {
      // 開火時引火閃爍、壓力錶指針抖動
      const f = s.firing && k <= 0, j = Math.random();
      const sc = f ? 1 + 0.45 * j : 1 + 0.08 * Math.sin(performance.now() * 0.013) * j;
      P.pilot.scale.set(sc, sc, f ? 1 + 0.9 * j : sc);
      let needle = f ? -0.55 + (Math.random() - 0.5) * 0.35 : (Math.random() - 0.5) * 0.04;
      if (k > 0) {
        // 燃料罐：轉開 → 往下拿掉 → 新罐子上來 → 轉緊；左手一路扶著
        const tw = -1.3 * (sm(k, 0.12, 0.3) - sm(k, 0.62, 0.8));
        const T = [0, -0.074, 0.21], Z = [0, 0, 0];
        track(_o2, [[0.3, Z], [0.42, [-0.04, -0.3, 0.06]], [0.48, [-0.04, -0.3, 0.06]], [0.6, Z]], k);
        P.tank.position.add(_o2); P.tank.rotateZ(tw);
        track(_o, [[0, Z], [0.12, T], [0.8, T], [0.94, Z]], k);
        // 手在罐子正下方 0.072 處，跟著罐子繞中心軸轉（tw 只在手扶著罐子時不為 0）
        _o.x += 0.072 * Math.sin(tw); _o.y += 0.072 * (1 - Math.cos(tw));
        _o.add(_o2); addPos(P.leftHand, _o); P.leftHand.rotateZ(tw);
        needle = -1.2 * (sm(k, 0.25, 0.35) - sm(k, 0.62, 0.85));
      }
      P.needle.quaternion.multiply(_q.setFromAxisAngle(P.needle.userData.axis, needle));
      return false;
    }
  };
  GFX.weaponAnim = function (model, kind, s, dt) {
    const P = model && model.userData.parts, fn = ANIM[kind];
    if (!P) return false;
    restore(P);
    if (!fn) return false;
    const k = s && s.reloadK > 0 && s.reloadK < 1 ? s.reloadK : 0;
    return fn(P, s || {}, k, dt) === true;
  };
  // 彈殼、榴彈的幾何（feel.js 拋殼用同一套外型）
  GFX._shellModel = shellModel;
})();
