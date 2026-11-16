'use strict';
/* =========================================================
   GFX zombie：分節骨架的殭屍模型與程序動畫
   - 每種殭屍 3 套外觀，幾何體共用；每隻只多一個材質（受擊發亮用）
   - 骨架：hips → 大腿 → 小腿；hips → 軀幹 → 頭／上臂 → 前臂
   - 遊戲邏輯照舊只轉 legL/legR/armL/armR/body/head，
     膝蓋、手肘、重心起伏、個體差異、倒地動畫都在這裡補上
   ========================================================= */
{
  const SPECS = {
    walker: { h: 1.0, chestW: 0.46, chestD: 0.25, waistW: 0.36, hipW: 0.36, armR: 0.058, armL1: 0.30, armL2: 0.29, legR: 0.082, headS: 1.0, hunch: 0.24, neck: 0.07 },
    runner: { h: 0.98, chestW: 0.40, chestD: 0.21, waistW: 0.28, hipW: 0.30, armR: 0.046, armL1: 0.33, armL2: 0.34, legR: 0.066, headS: 0.95, hunch: 0.42, neck: 0.08 },
    tank: { h: 1.0, chestW: 0.74, chestD: 0.44, waistW: 0.54, hipW: 0.50, armR: 0.115, armL1: 0.34, armL2: 0.36, legR: 0.125, headS: 0.92, hunch: 0.30, neck: 0.03 },
    exploder: { h: 0.98, chestW: 0.50, chestD: 0.30, waistW: 0.62, hipW: 0.44, armR: 0.055, armL1: 0.28, armL2: 0.27, legR: 0.078, headS: 1.0, hunch: 0.12, neck: 0.05 }
  };
  // 每種三套外觀：[膚色, 上衣, 褲子, 頭髮, 鞋]
  const LOOKS = {
    walker: [[0x7f9a6b, 0x4b5363, 0x2f3540, 0x2a221c, 0x1f1f22], [0x8a9b78, 0x8a8f8c, 0x3a3f4e, 0x4a3a2a, 0x2a2420], [0x74906a, 0x5f4a3c, 0x2b3038, 0x15140f, 0x1b1b1e]],
    runner: [[0xa9b893, 0x8a3a2c, 0x2b2b30, 0x3a2a20, 0x1f1f22], [0xb0b59a, 0x3f4f5f, 0x26262b, 0x1a1512, 0x2b2b30], [0xa3ad8c, 0x6f6a55, 0x30302c, 0x4d3f30, 0x1f1f22]],
    tank: [[0x667a58, 0x2a2e36, 0x1f2228, 0x1a1a1a, 0x16161a], [0x5f7460, 0x3a2f2a, 0x22252b, 0x1a1a1a, 0x16161a], [0x6d7a52, 0x30343c, 0x1c1f24, 0x1a1a1a, 0x16161a]],
    exploder: [[0xa8ad5c, 0xc0702c, 0x3a3326, 0x2a221c, 0x1f1f22], [0xb3b060, 0xa85f30, 0x34302a, 0x3a2f24, 0x1f1f22], [0x9fa857, 0xb97a34, 0x3f3829, 0x15140f, 0x1f1f22]]
  };
  const BLOOD = 0x5a0f0f, GORE = 0x7a1a16, BONE = 0xcfc8b4, MOUTH = 0x1a0606;
  const shade = (hex, k) => { const r = Math.min(255, ((hex >> 16) & 255) * k) | 0, g = Math.min(255, ((hex >> 8) & 255) * k) | 0, b = Math.min(255, (hex & 255) * k) | 0; return (r << 16) | (g << 8) | b; };
  const HIP_Y = 0.90, L1 = 0.44, L2 = 0.42;

  /* ---------- 幾何體（每種 × 每套外觀 只建一次） ---------- */
  const cache = {};
  function buildSet(type, v) {
    const key = type + v; if (cache[key]) return cache[key];
    const S = SPECS[type], [skin, shirt, pants, hair, shoe] = LOOKS[type][v], rnd = GFX.rng(type.length * 97 + v * 31 + 5), B = () => new GFX.Builder();
    const skinD = shade(skin, 0.72), shirtD = shade(shirt, 0.62), pantsD = shade(pants, 0.65);
    const out = {}, tank = type === 'tank', runner = type === 'runner', expl = type === 'exploder';
    // 骨盆
    let b = B(); b.box(S.hipW, 0.22, S.chestD * 0.92, pants, 0, -0.03, 0, { taper: [0.92, 0.95], c2: pantsD });
    b.box(S.hipW * 1.02, 0.045, S.chestD * 0.96, 0x1c1a18, 0, 0.07, 0);
    out.hips = b.geo('matte');
    // 軀幹（原點在腰）
    b = B();
    const torsoTop = 0.58, cw = S.chestW, cd = S.chestD;
    if (expl) {
      b.sph(S.waistW * 0.5, shirt, 0, 0.20, 0.05, { seg: 9, s: [1, 0.86, 0.95], c2: shirtD });
      b.box(cw, 0.24, cd, shirt, 0, 0.46, -0.01, { taper: [0.82, 0.8], c2: shirtD });
      // 衣服被撐破露出的肚皮
      b.sph(S.waistW * 0.4, skin, 0, 0.17, 0.115, { seg: 8, s: [0.95, 0.8, 0.8], c2: skinD });
    } else {
      // 八邊形的橢圓柱：腰 → 胸 → 肩，比方塊圓但仍是低面數的切面感
      const sz = 1.08 * cd / cw;
      b.cyl(cw * 0.5, S.waistW * 0.5, 0.30, shirt, 0, 0.15, 0, { seg: 8, flat: true, s: [1, 1, sz], c2: shirtD });
      b.cyl(cw * 0.40, cw * 0.5, 0.28, shirt, 0, 0.44, 0.005, { seg: 8, flat: true, s: [1, 1, sz], c2: shade(shirt, 0.8) });
      b.box(cw * 0.5, 0.05, cd * 0.5, shade(shirt, 0.85), 0, 0.565, -cd * 0.12, { taper: 0.7 });   // 駝起的上背
      // 破爛的衣襬
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + rnd(); b.box(0.06 + rnd() * 0.04, 0.07 + rnd() * 0.08, 0.012, shirtD, Math.sin(a) * S.waistW * 0.5, -0.03, Math.cos(a) * S.waistW * 0.5 * sz, { taper: 0.25, r: [Math.PI, -a, 0] }); }
    }
    b.sph(S.armR * 1.55, shirt, -cw * 0.5, 0.50, 0, { seg: 6, flat: true }); b.sph(S.armR * 1.55, shirt, cw * 0.5, 0.50, 0, { seg: 6, flat: true });
    b.cyl(0.055 + S.neck * 0.3, 0.07 + S.neck * 0.3, 0.1, skin, 0, torsoTop + 0.03, 0.015, { seg: 6, c2: skinD });
    b.box(cw * 0.5, 0.035, 0.03, shade(shirt, 0.55), 0, torsoTop - 0.005, cd * 0.3);   // 領口
    if (tank) {
      // 背上的骨刺與隆起的肩膀
      b.sph(0.2, skin, -cw * 0.42, 0.52, -0.02, { ico: 0, s: [1, 0.8, 1], c2: skinD }); b.sph(0.2, skin, cw * 0.42, 0.52, -0.02, { ico: 0, s: [1, 0.8, 1], c2: skinD });
      for (let i = 0; i < 5; i++) b.box(0.06, 0.16 + rnd() * 0.1, 0.06, BONE, (i - 2) * 0.13, 0.52 + rnd() * 0.06, -cd * 0.42, { taper: 0.15, r: [-0.55, 0, (i - 2) * 0.16], c2: 0x8a8272 });
      b.box(cw * 0.7, 0.09, 0.02, 0x15171b, 0, 0.3, cd * 0.48, { r: [0.1, 0, 0.5] }); b.box(cw * 0.7, 0.09, 0.02, 0x15171b, 0, 0.3, cd * 0.48, { r: [0.1, 0, -0.5] });   // 交叉皮帶
    } else if (!expl) {
      if (v === 1 && type === 'walker') b.box(0.05, 0.3, 0.012, 0x6a1f24, 0.01, 0.38, cd * 0.555, { taper: [1.6, 1], r: [0.12, 0, 0.05] });   // 領帶
      // 傷口與血漬
      b.box(0.09 + rnd() * 0.04, 0.08, 0.02, GORE, (rnd() - 0.5) * cw * 0.25, 0.3 + rnd() * 0.15, cd * 0.515, { r: [0.1, 0, rnd() - 0.5] });
      b.box(0.14, 0.15, 0.02, BLOOD, (rnd() - 0.5) * cw * 0.2, 0.18 + rnd() * 0.1, cd * 0.51, { r: [0, 0, rnd() - 0.5] });
      if (runner) for (let i = 0; i < 3; i++) { b.box(cw * 0.3, 0.016, 0.03, BONE, -cw * 0.16, 0.3 + i * 0.05, cd * 0.51, { r: [0.1, 0, 0.12] }); }   // 露出的肋骨
    }
    b.box(0.1, 0.012, 0.1, GORE, 0, torsoTop + 0.082, 0.015);   // 斷頸（頭被打掉才看得到）
    out.body = b.geo('matte');
    if (expl) { b = B().use('glow'); const r2 = GFX.rng(v * 13 + 3); for (let i = 0; i < 9; i++) { const a = (r2() - 0.5) * 2.4, y = 0.08 + r2() * 0.3, rr = 0.045 + r2() * 0.05; b.sph(rr, 0xffffff, Math.sin(a) * S.waistW * 0.47, y, 0.05 + Math.cos(a) * S.waistW * 0.44, { ico: 1, glow: 1 }); } out.sacs = b.geo('glow'); }
    // 頭（原點在脖子頂端）
    b = B(); const hs = S.headS;
    b.at(0, 0, 0, null, bb => {
      bb.sph(0.118, skin, 0, 0.165, 0.005, { seg: 8, flat: true, s: [0.92, 1, 1.02], c2: skinD });   // 顱骨
      bb.box(0.165, 0.085, 0.17, skin, 0, 0.04, 0.03, { taper: [1.14, 1.06], r: [0.1, 0, 0.05], c2: skinD });   // 歪掉的下顎
      bb.box(0.045, 0.03, 0.035, skinD, -0.074, 0.105, 0.088); bb.box(0.045, 0.03, 0.035, skinD, 0.074, 0.105, 0.088);   // 顴骨
      bb.box(0.21, 0.035, 0.05, skinD, 0, 0.165, 0.105);   // 眉骨
      bb.box(0.05, 0.03, 0.02, MOUTH, -0.05, 0.14, 0.117); bb.box(0.05, 0.03, 0.02, MOUTH, 0.05, 0.14, 0.117);   // 眼窩
      bb.box(0.035, 0.06, 0.04, skinD, 0, 0.105, 0.125, { taper: 0.6 });   // 鼻
      bb.box(0.11, 0.045, 0.02, MOUTH, 0, 0.04, 0.122); bb.box(0.09, 0.012, 0.012, BONE, 0, 0.058, 0.128); bb.box(0.08, 0.012, 0.012, BONE, 0, 0.024, 0.126);   // 嘴與牙
      bb.box(0.13, 0.05, 0.012, BLOOD, 0.01, 0.0, 0.118, { r: [0.2, 0, 0.1] });   // 嘴邊的血
      bb.box(0.03, 0.07, 0.04, skinD, -0.105, 0.12, 0); bb.box(0.03, 0.07, 0.04, skinD, 0.105, 0.12, 0);   // 耳
      const cap = (col, len, tilt) => bb.add(new THREE.SphereGeometry(0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI * len), col, 0, 0.165, 0.002, { s: [0.94, 1.02, 1.04], r: [tilt, 0, 0] });
      if (tank) cap(0x23262c, 0.36, -0.1);
      else if (v === 0) cap(hair, 0.42, -0.3);
      else if (v === 1) { cap(hair, 0.4, -0.45); bb.box(0.19, 0.15, 0.04, hair, 0, 0.14, -0.108, { taper: 1.15 }); }
      else { bb.box(0.07, 0.02, 0.14, hair, -0.045, 0.272, -0.03, { r: [0, 0, 0.3] }); bb.box(0.07, 0.03, 0.08, GORE, 0.04, 0.268, 0.03, { r: [0.2, 0, -0.3] }); }   // 禿頭帶傷
    }, hs);
    out.head = b.geo('matte');
    b = B().use('glow'); const eye = runner ? 0xff3a22 : expl ? 0xffc23a : tank ? 0xff5a2a : 0xd8e06a;
    b.box(0.028 * hs, 0.018 * hs, 0.01, eye, -0.05 * hs, 0.14 * hs, 0.122 * hs, { glow: runner || tank ? 3.2 : 2.2 }); b.box(0.028 * hs, 0.018 * hs, 0.01, eye, 0.05 * hs, 0.14 * hs, 0.122 * hs, { glow: runner || tank ? 3.2 : 2.2 });
    out.eyes = b.geo('glow');
    // 手臂：上臂（原點在肩）＋前臂（原點在肘）
    const sleeve = runner ? skin : shirt, aR = S.armR;
    for (const side of ['L', 'R']) {
      const torn = side === 'L' ? v !== 2 : v === 2;   // 一邊袖子破掉
      b = B(); b.cyl(aR * 1.15, aR * 0.95, S.armL1, torn ? skin : sleeve, 0, -S.armL1 / 2, 0, { seg: 6, c2: torn ? skinD : shirtD });
      if (torn && !runner) b.cyl(aR * 1.3, aR * 1.22, 0.07, shirt, 0, -0.035, 0, { seg: 6 });
      out['arm' + side] = b.geo('matte');
      b = B(); b.cyl(aR * (tank ? 1.35 : 0.95), aR * (tank ? 1.15 : 0.7), S.armL2, skin, 0, -S.armL2 / 2, 0, { seg: 6, c2: skinD });
      const hw = tank ? 0.16 : 0.075, hy = -S.armL2 - (tank ? 0.07 : 0.045);
      b.box(hw, tank ? 0.15 : 0.09, tank ? 0.15 : 0.04, skin, 0, hy, 0.005, { taper: [1.1, 1], c2: skinD });
      if (!tank) for (let f = 0; f < 3; f++) b.box(0.018, 0.075, 0.02, skinD, (f - 1) * 0.026, hy - 0.075, 0.018, { taper: 0.5, r: [-0.5, 0, 0] });   // 彎曲的手指
      else for (let f = 0; f < 3; f++) b.box(0.035, 0.02, 0.03, BONE, (f - 1) * 0.05, hy - 0.05, 0.07);   // 指節
      if (rnd() < 0.6) b.box(aR * 1.5, 0.08, aR * 1.5, BLOOD, 0, -S.armL2 * 0.8, 0);
      out['fore' + side] = b.geo('matte');
      // 腿：大腿（原點在髖）＋小腿與腳（原點在膝）
      b = B(); b.cyl(S.legR * 1.1, S.legR * 0.88, L1, pants, 0, -L1 / 2, 0, { seg: 6, c2: pantsD });
      out['leg' + side] = b.geo('matte');
      b = B(); const rip = (side === 'R') === (v === 0) && !tank;
      b.cyl(S.legR * 0.86, S.legR * 0.62, L2 * (rip ? 0.55 : 1), pants, 0, -L2 * (rip ? 0.275 : 0.5), 0, { seg: 6, c2: pantsD });
      if (rip) b.cyl(S.legR * 0.6, S.legR * 0.5, L2 * 0.47, skin, 0, -L2 * 0.77, 0, { seg: 6, c2: skinD });
      b.box(S.legR * 1.5, 0.075, S.legR * 3.0, shoe, 0, -L2 - 0.015, S.legR * 0.75, { taper: [0.85, 0.8] });
      out['shin' + side] = b.geo('matte');
    }
    return cache[key] = out;
  }

  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitGeo = {};
  const hg = (w, h, d) => { const k = w + '_' + h + '_' + d; return hitGeo[k] || (hitGeo[k] = new THREE.BoxGeometry(w, h, d)); };
  const eyeMat = GFX.mats.glow;

  /** 建立骨架與 mesh，並把遊戲邏輯會用到的欄位掛到 enemy 上 */
  GFX.zombieBuild = (enemy, type, variant) => {
    const S = SPECS[type], v = variant === undefined ? (Math.random() * 3) | 0 : variant, G = buildSet(type, v);
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const mats = [mat];
    const node = (parent, x, y, z) => { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); return n; };
    const mesh = (parent, geo, m = mat) => { const o = new THREE.Mesh(geo, m); o.castShadow = m === mat; o.receiveShadow = m === mat; parent.add(o); return o; };
    const hit = (parent, w, h, d, x, y, z, part) => { const o = new THREE.Mesh(hg(w, h, d), hitMat); o.position.set(x, y, z); o.userData = { enemy, part }; parent.add(o); enemy.parts.push(o); return o; };
    const root = node(g, 0, 0, 0); root.scale.setScalar(1.05 * S.h);
    const hips = node(root, 0, HIP_Y, 0); mesh(hips, G.hips);
    const legL = node(hips, -S.hipW * 0.29, -0.06, 0), legR = node(hips, S.hipW * 0.29, -0.06, 0);
    mesh(legL, G.legL); mesh(legR, G.legR);
    const kneeL = node(legL, 0, -L1, 0), kneeR = node(legR, 0, -L1, 0); mesh(kneeL, G.shinL); mesh(kneeR, G.shinR);
    const body = node(hips, 0, 0.05, 0), spine = node(body, 0, 0, 0); mesh(spine, G.body);
    const head = node(spine, 0, 0.66, 0.015), skull = node(head, 0, 0, 0); mesh(skull, G.head); mesh(skull, G.eyes, eyeMat);
    const armL = node(spine, -S.chestW * 0.5 - S.armR * 0.5, 0.5, 0), armR = node(spine, S.chestW * 0.5 + S.armR * 0.5, 0.5, 0);
    const upL = node(armL, 0, 0, 0), upR = node(armR, 0, 0, 0); mesh(upL, G.armL); mesh(upR, G.armR);
    const elbowL = node(upL, 0, -S.armL1, 0), elbowR = node(upR, 0, -S.armL1, 0); mesh(elbowL, G.foreL); mesh(elbowR, G.foreR);
    if (G.sacs) { const sm = new THREE.MeshStandardMaterial({ color: 0xd9a23a, roughness: 0.35, emissive: 0x000000, emissiveIntensity: 2.4 }); const o = new THREE.Mesh(G.sacs, sm); spine.add(o); mats.push(sm); }
    // 命中判定用的隱形方塊，跟著骨頭動
    const k = type === 'tank' ? 1.5 : type === 'exploder' ? 1.25 : 1;
    hit(skull, 0.32, 0.34, 0.32, 0, 0.14, 0.01, 'head');
    hit(spine, (S.chestW + 0.12) * 1, 0.72, Math.max(S.chestD + 0.1, 0.34) * (type === 'exploder' ? 1.5 : 1), 0, 0.28, 0, 'body');
    hit(legL, 0.2 * k, 0.9, 0.22 * k, 0, -0.43, 0, 'body'); hit(legR, 0.2 * k, 0.9, 0.22 * k, 0, -0.43, 0, 'body');
    hit(upL, 0.16 * k, 0.66, 0.18 * k, 0, -0.3, 0, 'body'); hit(upR, 0.16 * k, 0.66, 0.18 * k, 0, -0.3, 0, 'body');
    g.visible = false;
    Object.assign(enemy, { group: g, legL, legR, armL, armR, body, head, mats });
    enemy.rig = { S, root, hips, spine, skull, kneeL, kneeR, upL, upR, elbowL, elbowR, type, v, death: null, q: {} };
    return g;
  };

  /** 每次從物件池取出時重設，並擲出這一隻的個體差異 */
  GFX.zombieReset = e => {
    const r = e.rig, S = r.S, rn = Math.random;
    r.death = null; r.t = rn() * 10;
    r.hips.position.set(0, HIP_Y, 0); r.hips.rotation.set(0, 0, 0); r.root.rotation.set(0, 0, 0); r.root.position.set(0, 0, 0);
    r.kneeL.rotation.set(0, 0, 0); r.kneeR.rotation.set(0, 0, 0); e.legL.rotation.set(0, 0, 0); e.legR.rotation.set(0, 0, 0);
    r.q = {
      hunch: S.hunch * (0.7 + rn() * 0.6), tilt: (rn() - 0.5) * 0.5, turn: (rn() - 0.5) * 0.35, limp: rn() < 0.35 ? 0.35 + rn() * 0.4 : 0, limpSide: rn() < 0.5 ? 1 : -1,
      dropL: rn() < 0.3 ? 0.5 + rn() * 0.5 : rn() * 0.18, dropR: rn() < 0.3 ? 0.5 + rn() * 0.5 : rn() * 0.18, splay: 0.05 + rn() * 0.16, elbow: 0.25 + rn() * 0.5, sway: 0.7 + rn() * 0.7, size: 0.96 + rn() * 0.09
    };
    if (r.type === 'tank') { r.q.dropL = r.q.dropR = 0.35; r.q.limp = 0; r.q.tilt *= 0.3; }
    r.root.scale.setScalar(1.05 * S.h * r.q.size);
    r.spine.rotation.set(r.q.hunch, 0, 0); r.skull.rotation.set(-r.q.hunch * 0.75, r.q.turn, r.q.tilt);
    r.upL.rotation.set(r.q.dropL, 0, -r.q.splay); r.upR.rotation.set(r.q.dropR, 0, r.q.splay);
    r.elbowL.rotation.set(-r.q.elbow, 0, 0); r.elbowR.rotation.set(-r.q.elbow * 0.8, 0, 0);
  };

  /** 活著的時候每幀呼叫（在遊戲邏輯設完 legL/armL… 之後）：補上膝蓋、重心、搖晃 */
  GFX.zombiePose = (e, dt, moving) => {
    const r = e.rig, q = r.q, ph = e.phase, amp = Math.min(moving, 1.6), s = Math.sin(ph), c = Math.cos(ph);
    r.t += dt;
    // 跛腳：其中一條腿擺幅變小、拖著走
    if (q.limp) { const leg = q.limpSide > 0 ? e.legL : e.legR; leg.rotation.x *= 1 - q.limp; }
    // 膝蓋：腿往後收時彎曲，往前踩時伸直
    const run = e.busy && e.busy.kind === 'charge' ? 1.5 : 1;
    r.kneeL.rotation.x = 0.12 + Math.max(0, -c) * 0.95 * Math.min(amp, 1) * run + Math.max(0, -e.legL.rotation.x) * 0.25;
    r.kneeR.rotation.x = 0.12 + Math.max(0, c) * 0.95 * Math.min(amp, 1) * run + Math.max(0, -e.legR.rotation.x) * 0.25;
    // 重心：每一步下沉一次，左右搖
    const idle = Math.sin(r.t * 1.3) * 0.5 + Math.sin(r.t * 2.1) * 0.3;
    r.hips.position.y = HIP_Y - 0.02 - Math.abs(s) * 0.035 * Math.min(amp, 1) - (q.limp ? Math.max(0, s * q.limpSide) * 0.05 * q.limp : 0);
    r.hips.rotation.z = s * 0.07 * q.sway * Math.min(amp, 1) + idle * 0.02;
    r.hips.rotation.y = s * 0.12 * Math.min(amp, 1);
    r.spine.rotation.z = -s * 0.09 * q.sway * Math.min(amp, 1) + idle * 0.03;
    r.spine.rotation.y = -s * 0.16 * Math.min(amp, 1);
    r.spine.rotation.x = q.hunch + Math.abs(s) * 0.04 * amp + idle * 0.02;
    r.skull.rotation.x = -q.hunch * 0.75 + Math.sin(r.t * 0.9) * 0.08; r.skull.rotation.z = q.tilt + Math.sin(r.t * 0.7 + 1) * 0.07;
    r.elbowL.rotation.x = -q.elbow + s * 0.12; r.elbowR.rotation.x = -q.elbow * 0.8 - s * 0.12;
  };

  /** 被擊殺時決定倒法：往後倒、往前撲、原地跪倒 */
  GFX.zombieDie = (e, info) => {
    const r = e.rig, hs = info && info.headshot, roll = Math.random();
    r.death = { kind: info && info.source === 'explosion' ? 'back' : hs ? (roll < 0.6 ? 'back' : 'crumple') : roll < 0.4 ? 'back' : roll < 0.7 ? 'front' : 'crumple', twist: (Math.random() - 0.5) * 1.1, side: Math.random() < 0.5 ? 1 : -1 };
  };
  const ease = k => 1 - Math.pow(1 - k, 3);
  const toward = (obj, x, y, z, a) => { obj.rotation.x += (x - obj.rotation.x) * a; obj.rotation.y += (y - obj.rotation.y) * a; obj.rotation.z += (z - obj.rotation.z) * a; };
  /** 倒地動畫。t 是死亡後經過的秒數 */
  GFX.zombieDeath = (e, dt, t) => {
    const r = e.rig, d = r.death || (r.death = { kind: 'back', twist: 0, side: 1 }), a = 1 - Math.exp(-11 * dt), g = e.group;
    const k = Math.min(t / 0.5, 1), kk = k * k, bounce = t > 0.5 && t < 0.75 ? Math.sin((t - 0.5) / 0.25 * Math.PI) * 0.035 : 0;
    if (d.kind === 'back') {
      g.rotation.x = -(kk * Math.PI / 2 * 0.96) + bounce; g.rotation.z = d.twist * 0.25 * k;
      toward(e.armL, -2.6, 0, -0.9, a); toward(e.armR, -2.2, 0, 0.7, a); toward(r.elbowL, -0.5, 0, 0, a); toward(r.elbowR, -0.9, 0, 0, a);
      toward(e.legL, -0.25 * d.side, 0, -0.18, a); toward(e.legR, 0.35 * d.side, 0, 0.22, a); toward(r.kneeL, 0.5, 0, 0, a); toward(r.kneeR, 0.15, 0, 0, a);
      toward(e.head, -0.5, d.twist, 0, a); toward(e.body, -0.15, 0, 0, a); toward(r.spine, 0, 0, d.twist * 0.2, a);
    } else if (d.kind === 'front') {
      g.rotation.x = kk * Math.PI / 2 * 0.95 - bounce; g.rotation.z = d.twist * 0.2 * k;
      toward(e.armL, -2.9, 0, -0.5, a); toward(e.armR, -0.4, 0, 0.9, a); toward(r.elbowL, -0.3, 0, 0, a); toward(r.elbowR, -1.2, 0, 0, a);
      toward(e.legL, 0.1, 0, -0.15, a); toward(e.legR, -0.3 * d.side, 0, 0.2, a); toward(r.kneeL, 0.1, 0, 0, a); toward(r.kneeR, 0.9, 0, 0, a);
      toward(e.head, 0.2, d.twist * 1.2, 0, a); toward(e.body, 0.1, 0, 0, a); toward(r.spine, 0.05, 0, 0, a);
    } else {
      // 跪倒：膝蓋先軟掉，身體往前折，最後整個側倒
      const k1 = ease(Math.min(t / 0.38, 1)), k2 = ease(Math.min(Math.max(t - 0.3, 0) / 0.45, 1));
      r.hips.position.y = HIP_Y - k1 * 0.5 - k2 * 0.14; r.hips.position.z = -k1 * 0.12;
      toward(e.legL, -1.15 * k1 - 0.3 * k2, 0, -0.1, a * 1.4); toward(e.legR, -1.0 * k1 - 0.4 * k2, 0, 0.14, a * 1.4);
      toward(r.kneeL, 2.25 * k1, 0, 0, a * 1.4); toward(r.kneeR, 2.1 * k1, 0, 0, a * 1.4);
      toward(e.body, 0.35 * k1 + 0.9 * k2, 0, 0, a); toward(r.spine, 0.3, 0, d.twist * 0.3, a); toward(e.head, 0.7, d.twist, 0, a);
      toward(e.armL, 0.2, 0, -0.35, a); toward(e.armR, 0.35, 0, 0.3, a); toward(r.elbowL, -0.2, 0, 0, a); toward(r.elbowR, -0.4, 0, 0, a);
      g.rotation.z = d.side * k2 * 1.25; r.root.position.y = -k2 * 0.05;
    }
  };

  /* ---------- 檢視器用 ---------- */
  const previews = [];
  GFX.zombiePreview = type => {
    const holder = new THREE.Group();
    for (let v = 0; v < 3; v++) {
      const e = { parts: [], phase: v * 2, busy: null, type }; GFX.zombieBuild(e, type, v); e.group.visible = true; e.group.position.x = (v - 1) * 1.3; GFX.zombieReset(e);
      const sc = type === 'tank' ? 1.45 : type === 'runner' ? 0.92 : type === 'exploder' ? 1.08 : 1; e.group.scale.setScalar(sc); holder.add(e.group); previews.push(e);
    }
    return holder;
  };
  GFX.zombieTick = dt => {
    const dead = new URLSearchParams(location.search).get('dead');
    for (const e of previews) {
      if (dead) { e.dt = (e.dt || 0) + dt; if (!e.rig.death) GFX.zombieDie(e, {}); if (dead !== '1') e.rig.death.kind = dead; GFX.zombieDeath(e, dt, e.dt); if (e.dt > 3) { e.dt = 0; e.group.rotation.set(0, 0, 0); GFX.zombieReset(e); e.armL.rotation.set(-1.35, 0, 0); e.armR.rotation.set(-1.35, 0, 0); e.body.rotation.set(0, 0, 0); e.head.rotation.set(0, 0, 0); } continue; }
      const sp = e.type === 'runner' ? 3 : e.type === 'tank' ? 1.35 : 2; e.phase += dt * sp * 3.4;
      const sw = Math.sin(e.phase) * Math.min(sp, 1) * 0.65; e.legL.rotation.x = sw; e.legR.rotation.x = -sw;
      e.armL.rotation.set(-1.35 + Math.sin(e.phase * 0.5) * 0.08, 0, 0); e.armR.rotation.set(-1.35 - Math.sin(e.phase * 0.5) * 0.08, 0, 0);
      GFX.zombiePose(e, dt, sp);
    }
  };
}
