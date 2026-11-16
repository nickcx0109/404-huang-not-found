'use strict';
/* =========================================================
   GFX feel：命中回饋與拋殼（全部用物件池，不在每發子彈時配置幾何或材質）
   GFX.feelInit(scene, camera?)              開場呼叫一次（camera 可省略，會在第一次繪製時自動抓）
   GFX.impact(point, normal, kind, dir?)     子彈打到表面：彈孔貼花＋火花／碎屑＋小煙塵
       point / normal：世界座標的 THREE.Vector3（normal 可為 null → 視為朝上）
       kind：'stone'（預設，柏油／水泥／磚）| 'metal' | 'wood' | 'glass' | 'flesh'（不做事，遊戲有自己的血）
       dir：可省略，子彈飛行方向；有給的話碎屑會往反射方向噴
   GFX.impactHit(hit, kind, dir?)            同上，直接吃 Raycaster 的結果（自動把 face.normal 轉成世界座標）
   GFX.shell(worldPos, rightDir, upDir, kind)  拋出一顆彈殼：'pistol' | 'rifle' | 'shotgun'
   GFX.ejectShell(model, kind)               依武器模型的 userData.eject（拋殼口）與模型方向自動算位置與方向
   每幀的更新掛在 GFX.tick（render.js 會呼叫）；Draw call：貼花 1、火花 1、碎屑 1、煙塵 1、彈殼 4。
   只依賴全域的 THREE（r128）與 GFX（kit.js）。
   ========================================================= */
(() => {
  const V3 = THREE.Vector3;
  const N_DECAL = 96, N_SPARK = 128, N_CHIP = 128, N_PUFF = 32, N_SHELL = 48;
  const DECAL_LIFE = 20, SHELL_REST = 4, G = 9.8;
  const _p = new V3(), _n = new V3(), _v = new V3(), _s = new V3(), _a = new V3(), _b = new V3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _nm = new THREE.Matrix3();
  const UP = new V3(0, 1, 0), ZA = new V3(0, 0, 1), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const rnd = (a, b) => a + Math.random() * (b - a);
  let scene = null, cam = null, ready = false;

  /* ---------- 每個實例各自的透明度（InstancedMesh 沒有內建，注入一個 aFade 屬性） ---------- */
  function fadeMat(mat) {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float aFade;\nvarying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFade = aFade;');
      sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= vFade;');
    };
    mat.customProgramCacheKey = () => 'gfx-fade';
    return mat;
  }
  function inst(geo, mat, n, fade) {
    let fa = null;
    if (fade) { fa = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); fa.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aFade', fa); }
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO);
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    m.userData.fade = fa;
    return m;
  }
  function colors(m, n) { _c.setRGB(1, 1, 1); for (let i = 0; i < n; i++) m.setColorAt(i, _c); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }

  /* ---------- 程序貼圖：彈孔、煙塵 ---------- */
  function holeTex() {
    return GFX.canvasTex(128, (x, S, r) => {
      const c = S / 2;
      x.clearRect(0, 0, S, S);
      // 外圈燻黑
      let g = x.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(20,18,16,0.55)'); g.addColorStop(0.55, 'rgba(20,18,16,0.25)'); g.addColorStop(1, 'rgba(20,18,16,0)');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      // 崩落的淺色缺口（不規則多邊形）
      x.beginPath();
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, rr = c * (0.3 + r() * 0.16); x.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); }
      x.closePath(); x.fillStyle = 'rgba(196,190,180,0.9)'; x.fill();
      // 內圈陰影
      x.beginPath();
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, rr = c * (0.19 + r() * 0.07); x.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); }
      x.closePath(); x.fillStyle = 'rgba(70,64,58,1)'; x.fill();
      // 裂紋
      x.strokeStyle = 'rgba(40,36,32,0.8)'; x.lineWidth = 1.3;
      for (let i = 0; i < 6; i++) { const a = r() * Math.PI * 2, l = c * (0.3 + r() * 0.35); x.beginPath(); x.moveTo(c + Math.cos(a) * c * 0.2, c + Math.sin(a) * c * 0.2); x.lineTo(c + Math.cos(a + (r() - 0.5) * 0.4) * l, c + Math.sin(a + (r() - 0.5) * 0.4) * l); x.stroke(); }
      // 洞（深色中心）
      g = x.createRadialGradient(c, c, 0, c, c, c * 0.17);
      g.addColorStop(0, 'rgba(4,4,4,1)'); g.addColorStop(0.7, 'rgba(10,9,8,1)'); g.addColorStop(1, 'rgba(30,27,24,0.95)');
      x.fillStyle = g; x.beginPath(); x.arc(c, c, c * 0.17, 0, Math.PI * 2); x.fill();
    }, { seed: 31 });
  }
  function puffTex() {
    const t = GFX.canvasTex(64, (x, S, r) => {
      const c = S / 2; x.clearRect(0, 0, S, S);
      for (let i = 0; i < 7; i++) {
        const px = c + (r() - 0.5) * S * 0.3, py = c + (r() - 0.5) * S * 0.3, rr = S * (0.18 + r() * 0.14);
        const g = x.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, S, S);
      }
    }, { seed: 5 });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  /* ---------- 各種材質的外觀參數 ---------- */
  // dec：彈孔色調；chip：碎屑顏色（sRGB hex）；sparks/chips：數量範圍；puff：煙塵顏色與大小
  const KIND = {
    stone: { dec: [0.85, 0.82, 0.78], size: [0.06, 0.085], chip: [0x8a8580, 0x5d5a56], chips: [4, 7], sparks: [0, 0], puff: [0.42, 0.4, 0.37], puffS: 0.26 },
    metal: { dec: [0.9, 0.93, 0.98], size: [0.05, 0.065], chip: [0x3d4248, 0x2a2e33], chips: [0, 2], sparks: [5, 8], puff: [0.3, 0.3, 0.3], puffS: 0.16 },
    wood:  { dec: [0.62, 0.45, 0.3], size: [0.06, 0.08], chip: [0xa8794a, 0x6e4a28], chips: [4, 7], sparks: [0, 0], puff: [0.4, 0.33, 0.25], puffS: 0.2, long: true },
    glass: { dec: [1.0, 1.0, 1.0], size: [0.1, 0.14], chip: [0xd8e6ee, 0x9fb8c6], chips: [5, 8], sparks: [0, 0], puff: [0.5, 0.52, 0.55], puffS: 0.12, shiny: true }
  };
  const lin = hex => new THREE.Color(hex);   // kit.js 已經讓 setHex 轉線性
  for (const k in KIND) KIND[k].chipL = KIND[k].chip.map(lin);

  /* ---------- 池子 ---------- */
  let decals, sparks, chips, puffs;
  const D = [], SP = [], CH = [], PF = [];
  let dI = 0, sI = 0, cI = 0, pI = 0;
  const SHELLS = {};   // kind → { meshes:[], list:[], i }

  function makeShellGeos(kind) {
    const b = new GFX.Builder();
    if (kind === 'pistol') {          // 9mm：短黃銅
      b.use('metal');
      b.cyl(0.0048, 0.0048, 0.019, 0xd0a63a, 0, 0, 0, { axis: 'z', seg: 8 });
      b.cyl(0.0051, 0.0051, 0.0015, 0x8a6a1a, 0, 0, 0.0095, { axis: 'z', seg: 8 });
    } else if (kind === 'rifle') {    // 5.56：長、有瓶頸
      b.use('metal');
      b.at(0, 0, 0, [-Math.PI / 2, 0, 0], () => b.lathe([[0.0052, -0.0225], [0.0048, -0.0215], [0.0048, -0.0205], [0.0053, -0.0195], [0.0051, 0.008], [0.0034, 0.013], [0.0031, 0.0225], [0, 0.0225]], 0xc99a32, 0, 0, 0, { seg: 8 }));
    } else {                          // 12 號：紅色塑膠＋黃銅底
      b.use('gloss'); b.cyl(0.0098, 0.0098, 0.05, 0xb8453a, 0, 0, -0.007, { axis: 'z', seg: 10 });
      b.use('matte'); b.cyl(0.0092, 0.0092, 0.0015, 0x6e2620, 0, 0, -0.0328, { axis: 'z', seg: 10 });
      b.use('metal'); b.cyl(0.0104, 0.0104, 0.018, 0xd0a63a, 0, 0, 0.026, { axis: 'z', seg: 10 });
      b.cyl(0.0112, 0.0112, 0.002, 0x8a6a1a, 0, 0, 0.0345, { axis: 'z', seg: 10 });
    }
    const out = [];
    for (const L of GFX.LAYERS) { const g = b.geo(L); if (g) out.push([g, GFX.mats[L]]); }
    return out;
  }
  const SHELL_R = { pistol: 0.0051, rifle: 0.0053, shotgun: 0.0112 };

  GFX.feelInit = (sc, camera) => {
    if (ready) { if (sc && sc !== scene) { [decals, sparks, chips, puffs].forEach(m => sc.add(m)); for (const k in SHELLS) SHELLS[k].meshes.forEach(m => sc.add(m)); scene = sc; } if (camera) cam = camera; return; }
    scene = sc; cam = camera || null; ready = true;
    // 彈孔
    const dm = fadeMat(new THREE.MeshStandardMaterial({ map: holeTex(), transparent: true, depthWrite: false, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    decals = inst(new THREE.PlaneGeometry(1, 1), dm, N_DECAL, true); colors(decals, N_DECAL); decals.renderOrder = 1; decals.name = 'feel-decals';
    for (let i = 0; i < N_DECAL; i++) D.push({ age: -1, life: DECAL_LIFE });
    // 火花（加色混合；instanceColor 直接給 HDR 亮度，乘上淡出）
    sparks = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), N_SPARK, false);
    colors(sparks, N_SPARK); sparks.renderOrder = 4; sparks.name = 'feel-sparks';
    for (let i = 0; i < N_SPARK; i++) SP.push({ age: -1, life: 0, p: new V3(), v: new V3() });
    // 碎屑（受光的小方塊）
    chips = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }), N_CHIP, false);
    colors(chips, N_CHIP); chips.name = 'feel-chips';
    for (let i = 0; i < N_CHIP; i++) CH.push({ age: -1, life: 0, p: new V3(), v: new V3(), q: new THREE.Quaternion(), ax: new V3(), w: 0, s: new V3() });
    // 煙塵（面向鏡頭的四邊形）
    const pt = puffTex();
    puffs = inst(new THREE.PlaneGeometry(1, 1), fadeMat(new THREE.MeshStandardMaterial({ map: pt, transparent: true, depthWrite: false, roughness: 1, metalness: 0 })), N_PUFF, true);
    colors(puffs, N_PUFF); puffs.renderOrder = 3; puffs.name = 'feel-puffs';
    puffs.onBeforeRender = (r, s, c) => { if (c && c.isCamera && !camera) cam = c; };
    for (let i = 0; i < N_PUFF; i++) PF.push({ age: -1, life: 0, p: new V3(), v: new V3(), s0: 0, s1: 0, roll: 0 });
    [decals, sparks, chips, puffs].forEach(m => scene.add(m));
    // 彈殼：每種一組 InstancedMesh（每個材質層一個）
    for (const k of ['pistol', 'rifle', 'shotgun']) {
      const meshes = makeShellGeos(k).map(([g, mt]) => { const m = inst(g, mt, N_SHELL, false); m.name = 'feel-shell-' + k; scene.add(m); return m; });
      const list = []; for (let i = 0; i < N_SHELL; i++) list.push({ age: -1, p: new V3(), v: new V3(), q: new THREE.Quaternion(), ax: new V3(), w: 0, rest: -1, bounces: 0 });
      SHELLS[k] = { meshes, list, i: 0, r: SHELL_R[k] };
    }
    if (!GFX.tick) GFX.tick = [];
    GFX.tick.push(update);
  };

  /* ---------- 命中 ---------- */
  // 在 base 方向附近的圓錐裡隨機取一個方向
  function cone(out, base, spread) { out.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(spread).add(base).normalize(); return out; }

  GFX.impact = (point, normal, kind, dir) => {
    if (!ready || !point) return;
    kind = kind || 'stone'; if (kind === 'flesh') return;
    const K = KIND[kind] || KIND.stone;
    _n.copy(normal || UP); if (_n.lengthSq() < 1e-8) _n.copy(UP); _n.normalize();
    // 噴出的主方向：法線，若知道子彈方向就混一點反射方向
    _b.copy(_n);
    if (dir) { _a.copy(dir).normalize(); _a.addScaledVector(_n, -2 * _a.dot(_n)); _b.multiplyScalar(0.6).addScaledVector(_a, 0.4).normalize(); }

    // 彈孔貼花
    {
      const i = dI; dI = (dI + 1) % N_DECAL; const d = D[i]; d.age = 0;
      const sz = rnd(K.size[0], K.size[1]) * 2.3;   // 貼圖裡洞本身只佔中間一小塊，放大到遠一點也看得出來
      _q.setFromUnitVectors(ZA, _n).multiply(_q2.setFromAxisAngle(ZA, Math.random() * Math.PI * 2));
      _p.copy(point).addScaledVector(_n, 0.0015);
      _m.compose(_p, _q, _s.set(sz, sz, sz)); decals.setMatrixAt(i, _m);
      const t = 0.92 + Math.random() * 0.12; _c.setRGB(K.dec[0] * t, K.dec[1] * t, K.dec[2] * t); decals.setColorAt(i, _c);
      decals.userData.fade.setX(i, 1);
      decals.instanceMatrix.needsUpdate = true; decals.instanceColor.needsUpdate = true; decals.userData.fade.needsUpdate = true;
    }
    // 火花
    const ns = Math.round(rnd(K.sparks[0], K.sparks[1] + 0.49));
    for (let j = 0; j < ns; j++) {
      const e = SP[sI]; sI = (sI + 1) % N_SPARK;
      e.age = 0; e.life = rnd(0.12, 0.32); e.p.copy(point).addScaledVector(_n, 0.01);
      cone(e.v, _b, 0.75).multiplyScalar(rnd(3, 7.5)); e.hot = rnd(0.75, 1.1);
    }
    // 碎屑
    const nc = Math.round(rnd(K.chips[0], K.chips[1] + 0.49));
    for (let j = 0; j < nc; j++) {
      const e = CH[cI]; e.idx = cI; cI = (cI + 1) % N_CHIP;
      e.age = 0; e.life = rnd(0.45, 0.85); e.p.copy(point).addScaledVector(_n, 0.01);
      cone(e.v, _b, 0.9).multiplyScalar(rnd(1.4, 3.4));
      e.q.setFromAxisAngle(cone(_a, UP, 3), Math.random() * 6.3); e.ax.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); e.w = rnd(10, 30);
      const s = rnd(0.005, 0.012); if (K.long) e.s.set(s * 0.6, s * 0.6, s * rnd(2.5, 4)); else if (K.shiny) e.s.set(s * 1.4, s * 0.3, s * 1.1); else e.s.set(s, s * rnd(0.6, 1), s * rnd(0.7, 1.2));
      _c.copy(K.chipL[0]).lerp(K.chipL[1], Math.random()); if (K.shiny) _c.multiplyScalar(1.4);
      chips.setColorAt(e.idx, _c); chips.instanceColor.needsUpdate = true;
    }
    // 煙塵
    {
      const e = PF[pI]; e.idx = pI; pI = (pI + 1) % N_PUFF;
      e.age = 0; e.life = rnd(0.22, 0.3); e.p.copy(point).addScaledVector(_n, 0.03); e.v.copy(_b).multiplyScalar(rnd(0.3, 0.6));
      e.s0 = K.puffS * 0.25; e.s1 = K.puffS * rnd(0.9, 1.2); e.roll = Math.random() * 6.3;
      _c.setRGB(K.puff[0], K.puff[1], K.puff[2]); puffs.setColorAt(e.idx, _c); puffs.instanceColor.needsUpdate = true;
    }
  };
  // 直接吃 Raycaster 的 intersection（face.normal 是物件座標，這裡轉成世界座標）
  // lift：命中的是看不見的碰撞方塊時，把效果沿法線往外推到看得見的表面上
  const _hp = new V3();
  GFX.impactHit = (hit, kind, dir, lift) => {
    if (!hit) return;
    if (hit.face && hit.object) { _nm.getNormalMatrix(hit.object.matrixWorld); _v.copy(hit.face.normal).applyMatrix3(_nm).normalize(); if (dir && _v.dot(dir) > 0) _v.negate(); GFX.impact(lift ? _hp.copy(hit.point).addScaledVector(_v, lift) : hit.point, _v, kind, dir); }
    else GFX.impact(hit.point, null, kind, dir);
  };

  /* ---------- 拋殼 ---------- */
  GFX.shell = (worldPos, rightDir, upDir, kind) => {
    if (!ready || !worldPos) return;
    const S = SHELLS[kind]; if (!S) return;
    const e = S.list[S.i]; e.idx = S.i; S.i = (S.i + 1) % N_SHELL;
    const R = rightDir ? _a.copy(rightDir).normalize() : _a.set(1, 0, 0), U = _b.copy(upDir || UP).normalize();
    e.age = 0; e.rest = -1; e.bounces = 0; e.p.copy(worldPos);
    const sg = kind === 'shotgun';
    e.v.copy(R).multiplyScalar(rnd(sg ? 1.3 : 1.7, sg ? 1.9 : 2.6)).addScaledVector(U, rnd(sg ? 0.9 : 1.3, sg ? 1.4 : 2.1));
    _v.crossVectors(R, U).multiplyScalar(rnd(0.1, 0.5)); e.v.add(_v);     // 稍微往後
    e.v.x += rnd(-0.2, 0.2); e.v.y += rnd(-0.2, 0.2); e.v.z += rnd(-0.2, 0.2);
    // 初始朝向：彈殼軸（本地 Z）沿槍管
    _v.crossVectors(R, U).normalize(); _m.makeBasis(R, _s.crossVectors(_v, R), _v); e.q.setFromRotationMatrix(_m);
    e.ax.set(rnd(-0.3, 0.3), rnd(0.6, 1), rnd(-0.3, 0.3)); e.ax.copy(_v.copy(e.ax).applyQuaternion(e.q).normalize()); e.w = rnd(14, 28) * (sg ? 0.6 : 1);
  };
  // 拋殼口位置（模型本地座標）→ 世界座標；右方與上方取模型 matrixWorld 的 X、Y 軸
  {
    const R = new V3(), U = new V3();
    GFX.ejectShell = (model, kind) => {
      const ej = model && model.userData.eject; if (!ej || !ready) return;
      _p.set(ej[0], ej[1], ej[2]); model.localToWorld(_p);
      const me = model.matrixWorld.elements;
      R.set(me[0], me[1], me[2]).normalize(); U.set(me[4], me[5], me[6]).normalize();
      GFX.shell(_p, R, U, kind);
    };
  }

  /* ---------- 每幀更新 ---------- */
  function update(dt) {
    if (!ready) return;
    dt = Math.min(dt, 0.05);
    // 彈孔：最後一秒淡出
    {
      const fa = decals.userData.fade; let dirty = false, mDirty = false;
      for (let i = 0; i < N_DECAL; i++) {
        const d = D[i]; if (d.age < 0) continue;
        d.age += dt; const left = d.life - d.age;
        if (left <= 0) { d.age = -1; decals.setMatrixAt(i, ZERO); fa.setX(i, 0); dirty = mDirty = true; }
        else if (left < 1) { fa.setX(i, left); dirty = true; }
      }
      if (dirty) fa.needsUpdate = true; if (mDirty) decals.instanceMatrix.needsUpdate = true;
    }
    // 火花：拉長成沿速度方向的細條，越來越暗
    {
      let any = false;
      for (let i = 0; i < N_SPARK; i++) {
        const e = SP[i]; if (e.age < 0) continue; any = true;
        e.age += dt;
        if (e.age >= e.life) { e.age = -1; sparks.setMatrixAt(i, ZERO); continue; }
        e.v.y -= G * dt; e.v.multiplyScalar(Math.exp(-2.5 * dt)); e.p.addScaledVector(e.v, dt);
        if (e.p.y < 0) { e.p.y = 0; e.v.y = Math.abs(e.v.y) * 0.3; }
        const sp = e.v.length(), t = e.age / e.life, k = (1 - t) * e.hot;
        _q.setFromUnitVectors(ZA, _v.copy(e.v).divideScalar(sp || 1));
        _m.compose(e.p, _q, _s.set(0.0045, 0.0045, Math.min(0.09, Math.max(0.015, sp * 0.016))));
        sparks.setMatrixAt(i, _m);
        _c.setRGB(2.2 * k, (1.5 - 0.7 * t) * k, (0.65 - 0.5 * t) * k); sparks.setColorAt(i, _c);
      }
      if (any) { sparks.instanceMatrix.needsUpdate = true; sparks.instanceColor.needsUpdate = true; }
    }
    // 碎屑：重力、落地彈一下、最後縮小消失
    {
      let any = false;
      for (let i = 0; i < N_CHIP; i++) {
        const e = CH[i]; if (e.age < 0) continue; any = true;
        e.age += dt;
        if (e.age >= e.life) { e.age = -1; chips.setMatrixAt(i, ZERO); continue; }
        e.v.y -= G * dt; e.p.addScaledVector(e.v, dt);
        if (e.p.y < 0.003) { e.p.y = 0.003; if (e.v.y < 0) e.v.y *= -0.3; e.v.x *= 0.5; e.v.z *= 0.5; e.w *= 0.5; }
        e.q.multiply(_q.setFromAxisAngle(e.ax, e.w * dt));
        const sh = Math.min(1, (e.life - e.age) / 0.15);
        _m.compose(e.p, e.q, _s.copy(e.s).multiplyScalar(sh)); chips.setMatrixAt(i, _m);
      }
      if (any) chips.instanceMatrix.needsUpdate = true;
    }
    // 煙塵：面向鏡頭，變大變淡
    {
      let any = false; const fa = puffs.userData.fade;
      if (cam) cam.getWorldQuaternion(_q2); else _q2.identity();
      for (let i = 0; i < N_PUFF; i++) {
        const e = PF[i]; if (e.age < 0) continue; any = true;
        e.age += dt;
        if (e.age >= e.life) { e.age = -1; puffs.setMatrixAt(i, ZERO); fa.setX(i, 0); continue; }
        const t = e.age / e.life, sz = e.s0 + (e.s1 - e.s0) * (1 - (1 - t) * (1 - t));
        e.p.addScaledVector(e.v, dt); e.v.multiplyScalar(Math.exp(-4 * dt));
        _q.setFromAxisAngle(ZA, e.roll + t * 0.6).premultiply(_q2);
        _m.compose(e.p, _q, _s.set(sz, sz, sz)); puffs.setMatrixAt(i, _m);
        fa.setX(i, 0.8 * (1 - t) * (1 - t) * Math.min(1, t * 12));
      }
      if (any) { puffs.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; }
    }
    // 彈殼：飛、轉、在 y=0 彈一兩下，躺 4 秒後縮小回收
    for (const k in SHELLS) {
      const S = SHELLS[k]; let any = false;
      for (let i = 0; i < N_SHELL; i++) {
        const e = S.list[i]; if (e.age < 0) continue; any = true;
        e.age += dt;
        if (e.rest < 0) {
          e.v.y -= G * dt; e.p.addScaledVector(e.v, dt);
          e.q.premultiply(_q.setFromAxisAngle(e.ax, e.w * dt));
          if (e.p.y < S.r) {
            e.p.y = S.r;
            if (e.v.y < -0.6 && e.bounces < 2) {
              e.bounces++; e.v.y = -e.v.y * 0.32; e.v.x *= 0.55; e.v.z *= 0.55; e.w *= 0.6;
              e.ax.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
            } else {
              // 停下來：讓彈殼躺平（軸投影到水平面）
              e.rest = 0; e.v.set(0, 0, 0);
              _v.set(0, 0, 1).applyQuaternion(e.q); _v.y = 0; if (_v.lengthSq() < 1e-6) _v.set(1, 0, 0); _v.normalize();
              e.q.setFromUnitVectors(ZA, _v).premultiply(_q.setFromAxisAngle(_v, Math.random() * 6.3));
            }
          }
          if (e.age > 6) e.rest = Math.max(e.rest, 0);   // 掉進看不到的地方也要回收
        } else e.rest += dt;
        let sc = 1;
        if (e.rest >= SHELL_REST) { sc = 1 - (e.rest - SHELL_REST) / 0.5; if (sc <= 0) { e.age = -1; for (const m of S.meshes) m.setMatrixAt(i, ZERO); continue; } }
        _m.compose(e.p, e.q, _s.set(sc, sc, sc));
        for (const m of S.meshes) m.setMatrixAt(i, _m);
      }
      if (any) for (const m of S.meshes) m.instanceMatrix.needsUpdate = true;
    }
  }
})();
