'use strict';
/* =========================================================
   GFX world：v0.5 的場景佈置
   碰撞盒、區域位置、商店格局都和 v0.4.5 一樣（玩法不變），
   只換掉看得到的東西：材質、道具模型、燈光、遠景。
   GFX.props 裡沒有的道具會退回成單色方塊，所以 props.js 缺項也能跑。
   ========================================================= */
GFX.buildWorld = (world, api) => {
  const { scene, TextSign, SIGN_FONT } = api, V3 = THREE.Vector3, rnd = GFX.rng(2026), R = (a, b) => a + rnd() * (b - a);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const P = GFX.props || {};

  /* ---------- 工具 ---------- */
  const tints = {};
  const surf = (name, hex) => { if (hex === undefined) return GFX.surface(name); const k = name + hex; if (!tints[k]) { tints[k] = GFX.surface(name).clone(); tints[k].color.setHex(hex); } return tints[k]; };
  const std = (hex, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
  const glowMat = (hex, k = 2) => { const m = new THREE.MeshBasicMaterial({ color: hex }); m.color.multiplyScalar(k); return m; };
  /** 只有碰撞與子彈判定，看不到 */
  const collider = (x, z, w, d, h, store = false) => {
    world.obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, store });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat); m.position.set(x, h / 2, z); m.userData.surf = store ? 'stone' : 'metal'; scene.add(m); world.meshes.push(m); return m;
  };
  /** 看得到的方塊，貼圖依世界尺寸鋪貼 */
  const slab = (x, y, z, w, h, d, mat, o = {}) => {
    const g = new THREE.BoxGeometry(w, h, d); if (mat.map) GFX.boxUV(g, x, y + h / 2, z, o.uv || 4);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y + h / 2, z); m.castShadow = o.cast !== false; m.receiveShadow = true; scene.add(m);
    if (o.hit) world.meshes.push(m); return m;
  };
  const shadowed = g => { g.traverse(m => { if (!m.isMesh) return; const mt = m.material, flat = mt.isMeshBasicMaterial || mt.isShaderMaterial; if (m.castShadow === false && (flat || mt.transparent)) return; m.castShadow = !flat && !mt.transparent; m.receiveShadow = !flat; }); return g; };
  const _bb = new THREE.Box3(), _sz = new V3();
  /** 擺一個道具。w,d,h 是碰撞盒；道具的長邊會自動轉到和碰撞盒一致。solid=false 只擺模型 */
  const place = (name, x, z, w, d, h, color, o = {}) => {
    if (o.solid !== false) collider(x, z, w, d, h);
    let g = null;
    if (P[name]) { try { g = P[name](o.args); } catch (e) { console.warn('prop ' + name, e); } }
    if (!g) { if (o.solid === false && !o.box) return null; g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color || 0x6b6f75)); g.position.y = h / 2; const h2 = new THREE.Group(); h2.add(g); g = h2; }
    else if (o.rot === undefined && w && d && Math.abs(w - d) > 0.3) { _bb.setFromObject(g).getSize(_sz); if ((_sz.x > _sz.z) !== (w > d)) g.rotation.y = Math.PI / 2; if (o.flip) g.rotation.y += Math.PI; }
    if (o.rot !== undefined) g.rotation.y = o.rot;
    g.position.set(x, o.y || 0, z); if (o.scale) g.scale.setScalar(o.scale);
    shadowed(g); scene.add(g); return g;
  };
  const deco = (name, x, z, rot, o = {}) => place(name, x, z, 0, 0, 0, 0, Object.assign({ solid: false, rot: rot === undefined ? R(0, 6.28) : rot }, o));

  /* ---------- 地面 ---------- */
  const plane = (w, d, mat, x, y, z, tile) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + x) / tile, (p.getZ(i) + z) / tile); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m; };
  plane(600, 600, std(0x0d1014, 1), 0, -0.03, 0, 1);
  world.meshes.push(plane(90, 90, surf('asphalt'), 0, 0, 0, 14));
  // 各區的鋪面
  plane(24, 28, surf('grass'), -28, 0.012, -26, 6);
  plane(23, 14, surf('concrete', 0xb9bcc0), 28, 0.012, -27, 5);        // 加油站
  plane(26, 22, surf('concrete', 0x9a9da2), -27, 0.012, 27, 5);        // 公車總站
  plane(21.5, 15.5, surf('concrete', 0xc4c6c8), 0, 0.014, 0, 5);       // 商店外圍的人行道
  { // 人行道的路緣、公園的石邊
    const b = new GFX.Builder(), c = 0x8d9094, c2 = 0x4c4f54;
    b.box(21.9, 0.09, 0.2, c, 0, 0.045, 7.85, { c2 }); b.box(21.9, 0.09, 0.2, c, 0, 0.045, -7.85, { c2 }); b.box(0.2, 0.09, 15.9, c, 10.85, 0.045, 0, { c2 }); b.box(0.2, 0.09, 15.9, c, -10.85, 0.045, 0, { c2 });
    b.box(24.4, 0.14, 0.3, c, -28, 0.07, -12, { c2 }); b.box(0.3, 0.14, 28, c, -16, 0.07, -26, { c2 });
    b.box(23.2, 0.1, 0.2, c, 28, 0.05, -20, { c2 }); b.box(0.2, 0.1, 14, c, 16.5, 0.05, -27, { c2 });
    scene.add(b.group());
  }
  { // 標線：磨損的黃線、停止線、斑馬線、停車格
    const S = 256, tex = GFX.canvasTex(S, (x, s, r) => { x.fillStyle = '#fff'; x.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.5})`; const w = 2 + r() * 14; x.fillRect(r() * s, r() * s, w, 1 + r() * 4); } }, { srgb: false, seed: 4 });
    const yel = new THREE.MeshStandardMaterial({ color: 0xc9a02c, roughness: 0.7, alphaMap: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), wht = yel.clone(); wht.color.setHex(0xc9ccd0);
    const geos = { y: [], w: [] };
    const mark = (x, z, w, d, k = 'y') => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(x, 0.016, z); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 3.1, p.getZ(i) / 3.1); geos[k].push(g); };
    for (let x = -16; x <= 16; x += 3) { mark(x, 12, 1.4, 0.18); mark(x, -12, 1.4, 0.18); }
    for (let z = -9; z <= 9; z += 3) { mark(15, z, 0.18, 1.4); mark(-15, z, 0.18, 1.4); }
    for (let t = 20; t <= 42; t += 3) { mark(t, 0, 1.4, 0.18); mark(-t, 0, 1.4, 0.18); mark(0, t, 0.18, 1.4); mark(0, -t, 0.18, 1.4); }
    for (let i = -3; i <= 3; i++) { mark(i * 0.9, 10.2, 0.5, 2.6, 'w'); mark(i * 0.9 + 5.5, -10.2, 0.5, 2.6, 'w'); }           // 商店前後門的斑馬線
    [[18.2, 0, 0.35, 5], [-18.2, 0, 0.35, 5], [0, 18.2, 5, 0.35], [0, -18.2, 5, 0.35]].forEach(a => mark(a[0], a[1], a[2], a[3], 'w'));   // 停止線
    for (let i = 0; i < 6; i++) mark(-39 + i * 3.4, 37, 0.14, 5, 'w');                                                            // 公車總站停車格
    for (let i = 0; i < 5; i++) mark(18 + i * 2.9, -37.5, 0.12, 4.6, 'w');
    const merge = list => { let n = 0; list.forEach(g => n += g.index.count); const pos = [], nor = [], uv = []; list.forEach(g => { const q = g.toNonIndexed(); pos.push(...q.attributes.position.array); nor.push(...q.attributes.normal.array); uv.push(...q.attributes.uv.array); }); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g; };
    const my = new THREE.Mesh(merge(geos.y), yel), mw = new THREE.Mesh(merge(geos.w), wht); my.receiveShadow = mw.receiveShadow = true; my.renderOrder = mw.renderOrder = 1; scene.add(my, mw);
  }

  /* ---------- 圍牆 ---------- */
  {
    const wm = surf('concrete', 0x7b8087);
    [[0, -45.3, 91.2, 0.6], [0, 45.3, 91.2, 0.6], [-45.3, 0, 0.6, 91.2], [45.3, 0, 0.6, 91.2]].forEach(([x, z, w, d]) => { collider(x, z, w, d, 3.4); slab(x, 0, z, w, 3.4, d, wm, { uv: 5 }); });
    const b = new GFX.Builder(), cap = 0x5d6269, c2 = 0x2c2f34;
    for (let i = -5; i <= 5; i++) { const t = i * 9; b.box(0.9, 3.7, 0.9, cap, t, 1.85, -45.3, { c2 }); b.box(0.9, 3.7, 0.9, cap, t, 1.85, 45.3, { c2 }); b.box(0.9, 3.7, 0.9, cap, -45.3, 1.85, t, { c2 }); b.box(0.9, 3.7, 0.9, cap, 45.3, 1.85, t, { c2 }); }
    b.box(91.6, 0.14, 0.8, cap, 0, 3.47, -45.3); b.box(91.6, 0.14, 0.8, cap, 0, 3.47, 45.3); b.box(0.8, 0.14, 91.6, cap, -45.3, 3.47, 0); b.box(0.8, 0.14, 91.6, cap, 45.3, 3.47, 0);
    // 牆頂的鐵絲網支架
    b.use('metal'); for (let t = -44; t <= 44; t += 3) { [[t, -45.3, 0], [t, 45.3, 0], [-45.3, t, 1], [45.3, t, 1]].forEach(([x, z]) => b.box(0.05, 0.7, 0.05, 0x3a3e45, x, 3.85, z)); }
    for (const y of [3.95, 4.15]) { b.box(91, 0.02, 0.02, 0x565b63, 0, y, -45.3); b.box(91, 0.02, 0.02, 0x565b63, 0, y, 45.3); b.box(0.02, 0.02, 91, 0x565b63, -45.3, y, 0); b.box(0.02, 0.02, 91, 0x565b63, 45.3, y, 0); }
    scene.add(b.group());
  }

  /* ---------- 遠景：亮著零星窗戶的大樓 ---------- */
  {
    const winTex = seed => GFX.canvasTex(256, (x, s, r) => {
      x.fillStyle = '#000'; x.fillRect(0, 0, s, s); const cols = 16, rows = 32, cw = s / cols, rh = s / rows;
      for (let j = 0; j < rows; j++) { const floorLit = r() < 0.12; for (let i = 0; i < cols; i++) { const lit = r() < (floorLit ? 0.6 : 0.1); if (!lit) { if (r() < 0.3) { x.fillStyle = 'rgb(7,9,13)'; x.fillRect(i * cw + 3, j * rh + 2, cw - 6, rh - 4); } continue; } const warm = r(); x.fillStyle = warm < 0.8 ? `rgb(255,${195 + r() * 30 | 0},${140 + r() * 40 | 0})` : 'rgb(200,220,255)'; x.globalAlpha = 0.18 + r() * 0.5; x.fillRect(i * cw + 3, j * rh + 2, cw - 6, rh - 4); x.globalAlpha = 1; } }
    }, { seed });
    const sides = [1, 2, 3].map(s => new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.7, emissive: 0xffffff, emissiveMap: winTex(s * 17), emissiveIntensity: 0.7 }));
    const roof = std(0x0e1217, 0.9), b = new GFX.Builder();
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2 + R(-0.05, 0.05), r = R(60, 112), h = R(12, 30) + (rnd() < 0.3 ? R(14, 34) : 0) + (r - 60) * 0.25, w = R(8, 15), d = R(8, 15), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, p = g.attributes.position, n = g.attributes.normal, ox = rnd(), oy = rnd();
      for (let k = 0; k < uv.count; k++) { const hx = Math.abs(n.getX(k)) > 0.5 ? p.getZ(k) : p.getX(k); uv.setXY(k, hx / 24 + ox, p.getY(k) / 52 + oy); }
      const s = sides[i % 3], m = new THREE.Mesh(g, [s, s, roof, roof, s, s]); m.position.set(x, h / 2 - 0.5, z); m.rotation.y = R(-0.25, 0.25); scene.add(m);
      b.box(w * 0.4, 1.6, d * 0.4, 0x0e1217, x, h + 0.3, z);
      if (h > 38) { b.box(0.25, 5, 0.25, 0x0e1217, x, h + 3, z); b.use('glow').sph(0.38, 0xff2a1a, x, h + 5.6, z, { ico: 0, glow: 5 }); b.use('matte'); }
    }
    const grp = b.group({ shadow: false }); scene.add(grp);
  }

  /* ---------- 便利商店 ---------- */
  {
    const H = 4.5, ext = surf('plaster', 0xaab2bb), base = surf('brick', 0x9c8f88);
    const wall = (x, z, w, d) => { collider(x, z, w, d, H, true); slab(x, 0, z, w, 1.0, d + 0.06, base, { uv: 2.2 }); slab(x, 1.0, z, w, H - 1.0, d, ext, { uv: 5 }); };
    wall(-2.5, -6, 13, 0.5); wall(8, -6, 2, 0.5); wall(-5.25, 6, 7.5, 0.5); wall(5.25, 6, 7.5, 0.5); wall(-9, 0, 0.5, 12.5); wall(9, 0, 0.5, 12.5);
    slab(0, 3, 6, 3, 1.5, 0.5, ext, { hit: true }); slab(5.5, 3, -6, 3, 1.5, 0.5, ext, { hit: true });   // 門楣
    slab(0, H, 0, 18.9, 0.3, 12.9, surf('concrete', 0x555a62), { hit: true });                            // 屋頂
    plane(17.5, 11.5, surf('tile'), 0, 0.03, 0, 2.4);
    const b = new GFX.Builder(), trim = 0x2a2f37;
    // 屋頂女兒牆、門框、遮雨棚
    b.box(19.2, 0.5, 0.25, 0x4b5059, 0, H + 0.55, 6.4, { c2: 0x30343a }); b.box(19.2, 0.5, 0.25, 0x4b5059, 0, H + 0.55, -6.4, { c2: 0x30343a }); b.box(0.25, 0.5, 13, 0x4b5059, 9.4, H + 0.55, 0, { c2: 0x30343a }); b.box(0.25, 0.5, 13, 0x4b5059, -9.4, H + 0.55, 0, { c2: 0x30343a });
    b.use('metal'); [[-1.5, 6], [1.5, 6]].forEach(([x, z]) => b.box(0.12, 3, 0.56, 0x3a3f47, x, 1.5, z)); [[4, -6], [7, -6]].forEach(([x, z]) => b.box(0.12, 3, 0.56, 0x3a3f47, x, 1.5, z));
    b.use('matte'); b.box(18.8, 0.16, 1.5, 0xb5482f, 0, 3.55, 7.0, { r: [0.16, 0, 0], c2: 0x6a2418 }); for (let i = -8; i <= 8; i += 2) b.box(1, 0.17, 1.52, 0xd9d4c6, i, 3.555, 7.0, { r: [0.16, 0, 0] });
    b.box(11.4, 1.7, 0.2, trim, 0, 5.4, 6.3);   // 招牌底板
    // 霓虹燈框（靠 bloom 發光）
    b.use('glow'); const neon = 0xff8a2a; b.box(11.2, 0.05, 0.05, neon, 0, 6.18, 6.42, { glow: 3 }); b.box(11.2, 0.05, 0.05, neon, 0, 4.62, 6.42, { glow: 3 }); b.box(0.05, 1.56, 0.05, neon, -5.6, 5.4, 6.42, { glow: 3 }); b.box(0.05, 1.56, 0.05, neon, 5.6, 5.4, 6.42, { glow: 3 });
    b.box(18.6, 0.05, 0.05, 0x39e6cf, 0, 3.3, 6.3, { glow: 2.2 });
    // 天花板燈板
    [[-4.5, -2.5], [4.5, -2.5], [-4.5, 2.5], [4.5, 2.5], [0, 0]].forEach(([x, z]) => b.box(2.4, 0.05, 0.5, 0xeaf6ff, x, H - 0.03, z, { glow: 2.6 }));
    b.use('matte'); [[-4.5, -2.5], [4.5, -2.5], [-4.5, 2.5], [4.5, 2.5], [0, 0]].forEach(([x, z]) => b.box(2.6, 0.08, 0.7, 0x8d9097, x, H + 0.0 - 0.0, z));
    scene.add(b.group());
    // 櫥窗：從外面看得到裡面透出來的光
    const winTex = GFX.canvasTex(512, (x, s, r) => {
      const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#dff1ff'); g.addColorStop(1, '#8fb6cf'); x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.fillStyle = 'rgba(20,28,36,.85)'; for (let i = 0; i < 4; i++) { const sx = 30 + i * 122; x.fillRect(sx, s * 0.42, 96, s * 0.58); for (let k = 0; k < 3; k++) { for (let q = 0; q < 5; q++) { x.fillStyle = ['#b8453a', '#3d6c8a', '#c9a227', '#5a7a4a', '#d8d4c8'][(r() * 5) | 0]; x.fillRect(sx + 6 + q * 17, s * 0.46 + k * 90, 13, 44 + r() * 20); } x.fillStyle = 'rgba(20,28,36,.85)'; } }
      x.fillStyle = '#12161c'; x.fillRect(0, 0, s, 10); x.fillRect(0, s - 16, s, 16); x.fillRect(0, 0, 8, s); x.fillRect(s - 8, 0, 8, s); x.fillRect(s / 2 - 4, 0, 8, s);
    }, { seed: 9 });
    winTex.wrapS = winTex.wrapT = THREE.ClampToEdgeWrapping;
    const wm = new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.08, metalness: 0.3, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.85 });
    world.windowMat = wm;
    [-5.25, 5.25].forEach(x => { const m = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.9), wm); m.position.set(x, 1.95, 6.262); scene.add(m); });
    // 招牌文字
    const sign = new TextSign(10.4, 1.3, (x, w, h) => { x.fillStyle = '#ffb04a'; x.font = `800 ${h * 0.62}px ${SIGN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = '#ff7a1a'; x.shadowBlur = h * 0.12; x.fillText('ZOMBIE MART  ·  交易站', w / 2, h * 0.54); });
    sign.mesh.position.set(0, 5.4, 6.42); scene.add(sign.mesh); world.signs.push(sign);
    world.openSign = new TextSign(1.8, 0.7, (x, w, h, open) => {
      x.fillStyle = 'rgba(10,12,16,.85)'; x.fillRect(0, 0, w, h);
      x.strokeStyle = open ? '#5fe3d0' : '#dc4a3d'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16);
      x.fillStyle = open ? '#5fe3d0' : '#dc4a3d'; x.font = `800 ${h * 0.55}px ${SIGN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(open ? 'OPEN' : 'CLOSED', w / 2, h * 0.54);
    });
    world.openSign.mesh.position.set(-2.6, 2.6, 6.3); scene.add(world.openSign.mesh); world.signs.push(world.openSign);
    world.traderSign = new TextSign(3.4, 0.8, (x, w, h, open) => { x.fillStyle = open ? '#5fe3d0' : '#59606b'; x.font = `800 ${h * 0.6}px ${SIGN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(open ? 'TRADER · 櫃台' : '休息中', w / 2, h * 0.55); });
    world.traderSign.mesh.position.set(-6, 3.1, -5.7); scene.add(world.traderSign.mesh); world.signs.push(world.traderSign);
    // 內部
    place('counter', -6, -3.6, 4.4, 1.2, 1.1, 0x6b4a2f);
    place('shelf', -4, 1.5, 4.5, 0.8, 1.8, 0x8d9097); place('shelf', 4, 1.5, 4.5, 0.8, 1.8, 0x8d9097); place('shelf', 2.6, -2.2, 3.6, 0.8, 1.8, 0x8d9097, { args: { w: 3.6, seed: 3 } });
    if (P.fridge) { place('fridge', -1.2, -5.35, 2.4, 0.8, 2.1, 0, { rot: 0 }); place('fridge', 1.6, -5.35, 2.4, 0.8, 2.1, 0, { rot: 0 }); }
    if (P.vending) place('vending', 8.3, 3.2, 0.9, 1.1, 1.9, 0, { rot: -Math.PI / 2 });
    world.machinePos = new V3(7.6, 0, -3.6);
    const gacha = place('gacha', 7.6, -3.6, 1.3, 1.3, 2.1, 0x8c2f39, { rot: -Math.PI / 2 });
    world.machineDome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0x000000, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.86 }));
    world.machineDome.position.set(7.6, 2.55, -3.6); scene.add(world.machineDome); world.meshes.push(world.machineDome);
    if (gacha && gacha.userData.dome) { world.machineDome.position.copy(gacha.userData.dome); world.machineDome.position.applyEuler(gacha.rotation).add(gacha.position); }
    const ms = new TextSign(1.1, 0.5, (x, w, h) => { x.fillStyle = '#f0a23b'; x.font = `800 ${h * 0.6}px ${SIGN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('抽獎機', w / 2, h * 0.55); });
    ms.mesh.position.set(6.9, 2.5, -2.4); ms.mesh.rotation.y = -Math.PI / 2; scene.add(ms.mesh); world.signs.push(ms);
    world.storeLight = new THREE.PointLight(0xdff3ff, 1.0, 17, 1.6); world.storeLight.position.set(0, 3.9, 0); scene.add(world.storeLight);
    // 門口灑出來的光
    const spill = new THREE.PointLight(0xffc58a, 0.9, 13, 1.8); spill.position.set(0, 3.0, 8.2); scene.add(spill);
    // 屋頂設備、後巷
    if (P.acUnit) { deco('acUnit', -5, 2, 0.3, { y: H + 0.3 }); deco('acUnit', 4, -2.5, 1.2, { y: H + 0.3 }); }
    place('dumpster', -4.5, -7.3, 2.2, 1.2, 1.3, 0x3f5a3a); deco('trashBags', -2.6, -7.1); deco('trashBags', 9.9, 4.8); deco('pallet', 9.9, -3.5);
    deco('trashCan', 2.6, 6.9, 0); deco('mailbox', -9.9, 6.9, 0); deco('hydrant', 10.2, 7.2, 0);
  }

  /* ---------- 路燈 ---------- */
  const lamps = [];
  const lamp = (x, z, color, intensity, dist, rot = 0) => {
    collider(x, z, 0.25, 0.25, 4.6);
    const g = P.streetLamp ? P.streetLamp({ color }) : null; let hx = x, hz = z, hy = 4.4;
    if (g) { g.position.set(x, 0, z); g.rotation.y = rot; shadowed(g); g.traverse(m => { if (m.isMesh) m.castShadow = false; }); scene.add(g); const an = (GFX.propAnchors || {}).streetLamp; if (an) { const p = new V3().fromArray(an[0]).applyEuler(g.rotation); hx += p.x; hz += p.z; hy = p.y; } }
    else { slab(x, 0, z, 0.25, 4.6, 0.25, std(0x50555c)); slab(x, 4.6, z, 0.6, 0.15, 0.6, glowMat(color, 2.5), { cast: false }); }
    const l = new THREE.PointLight(color, intensity * 1.5, dist * 1.15, 1.7); l.position.set(hx, hy - 0.25, hz); scene.add(l);
    const cone = GFX.lightCone(color, hy, 3.4, 0.5); cone.position.set(hx, hy, hz); scene.add(cone);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 28), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { col: { value: new THREE.Color(color) } }, vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'varying vec2 vU; uniform vec3 col; void main(){ float d = length(vU - 0.5) * 2.0; float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.2) * 0.16; gl_FragColor = vec4(col * a, a); }' }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(hx, 0.03, hz); pool.renderOrder = 2; scene.add(pool);
    lamps.push({ l, cone, pool, base: l.intensity });
  };
  lamp(28, -20, 0xdfe8ff, 0.9, 20, Math.PI); lamp(-22, -22, 0xffb768, 0.8, 18, 0.8); lamp(-20, 20, 0xffb768, 0.8, 18, -0.8); lamp(26, 24, 0xffd08a, 0.8, 18, 2.4);

  /* ---------- 加油站（東北） ---------- */
  {
    [[21.5, -30], [34.5, -30], [21.5, -22], [34.5, -22]].forEach(([x, z]) => collider(x, z, 0.5, 0.5, 4.4));
    if (P.gasCanopy) { const g = P.gasCanopy(); g.position.set(28, 0, -26); shadowed(g); scene.add(g); world.meshes.push(...g.children.filter(m => m.isMesh && !m.material.isMeshBasicMaterial)); }
    else { slab(28, 4.4, -26, 15, 0.5, 10, std(0xd8d4c8)); [[21.5, -30], [34.5, -30], [21.5, -22], [34.5, -22]].forEach(([x, z]) => slab(x, 0, z, 0.5, 4.4, 0.5, std(0x8d9097))); slab(28, 4.38, -26, 12, 0.04, 6, glowMat(0xf2f7ff, 2), { cast: false }); }
    const cl = new THREE.PointLight(0xe8f1ff, 1.3, 20, 1.5); cl.position.set(28, 4.0, -26); scene.add(cl);
    [25, 28, 31].forEach(x => place('gasPump', x, -26, 0.9, 1.8, 1.4, 0xb8453a));
    place('kiosk', 28, -38, 9, 4, 3.2, 0x6c7480);
    place('car', 38, -15, 4.2, 2, 1.4, 0x56677a, { args: { color: 0x56677a, seed: 1 } }); place('pickup', 20, -36, 2, 4.2, 1.4, 0x6e3a3a, { args: { color: 0x7a2f2a, seed: 2 } });
    deco('tires', 33.8, -37.2); deco('barrel', 22.6, -39.2, 0); deco('barrel', 23.5, -39.4, 1); deco('trafficCone', 23.4, -21.2); deco('trafficCone', 33, -30.8); deco('roadSign', 17.2, -19.2, Math.PI / 2); deco('trashCan', 33.2, -35.6, 0);
  }
  /* ---------- 公園（西北） ---------- */
  {
    place('fountain', -28, -26, 4, 4, 0.8, 0x7d8088);
    [[-38, -36], [-20, -36], [-38, -16], [-20, -17], [-33, -42], [-24, -10], [-41, -26], [-16, -28], [-30, -34], [-34, -20]].forEach(([x, z], i) => place('tree', x, z, 0.5, 0.5, 2.2, 0x5a4532, { rot: i * 1.7, args: { seed: i + 1 }, scale: 0.9 + (i % 3) * 0.12 }));
    place('bench', -24, -26, 2.2, 0.6, 0.5, 0x6b4a2f, { rot: -Math.PI / 2 }); place('bench', -32, -26, 2.2, 0.6, 0.5, 0x6b4a2f, { rot: Math.PI / 2 });
    deco('trashCan', -23.6, -24, 0); deco('trashBags', -39.5, -13.4);
  }
  /* ---------- 公車總站（西南） ---------- */
  {
    place('bus', -29, 22, 10, 2.6, 3.1, 0xc9a227, { args: { color: 0xc9a227, seed: 1 } }); place('bus', -29, 30, 10, 2.6, 3.1, 0x3d6c8a, { args: { color: 0x3d6c8a, seed: 2 }, flip: true });
    collider(-19.8, 23.2, 0.2, 0.2, 2.6); collider(-19.8, 28.8, 0.2, 0.2, 2.6);
    if (P.busShelter) { const g = P.busShelter(); g.position.set(-19, 0, 26); _bb.setFromObject(g).getSize(_sz); if (_sz.x > _sz.z) g.rotation.y = Math.PI / 2; shadowed(g); scene.add(g); }
    else { slab(-19, 2.6, 26, 2, 0.2, 6, std(0x8d9097)); slab(-19.8, 0, 23.2, 0.2, 2.6, 0.2, std(0x8d9097)); slab(-19.8, 0, 28.8, 0.2, 2.6, 0.2, std(0x8d9097)); }
    place('van', -36, 38, 4.2, 2, 1.4, 0x6f7a5a, { args: { color: 0x8c9296, seed: 3 } });
    deco('trafficCone', -22.5, 33.2); deco('trafficCone', -23.6, 34.1); deco('roadSign', -16.4, 17.2, 0); deco('trashBags', -41.6, 18);
  }
  /* ---------- 貨櫃場（東南） ---------- */
  {
    [[20, 20, 6.5, 2.5, 0x3d6c8a], [31, 17, 2.5, 6.5, 0x8a4a3c], [24, 30, 6.5, 2.5, 0x5a7a4a], [36, 28, 2.5, 6.5, 0x3d6c8a], [29, 38, 6.5, 2.5, 0x8a4a3c], [40, 40, 2.5, 6.5, 0x5a7a4a]].forEach(([x, z, w, d, c], i) => place('container', x, z, w, d, 2.7, c, { args: { color: c, seed: i + 1 } }));
    const top = place('container', 20, 20, 6.5, 2.5, 2.7, 0x8a4a3c, { solid: false, box: true, y: 2.7, args: { color: 0x8a4a3c, seed: 9 } }); if (top) { top.rotation.y += 0.06; world.meshes.push(...top.children.filter(m => m.isMesh)); }
    place('fence', 12, 32, 10, 0.6, 1.6, 0x6b6f75);
    deco('pallet', 26.5, 22.6); deco('pallet', 33.6, 33.5); deco('barrel', 17.2, 23.2, 0); deco('tires', 38.2, 21.5); deco('barrel', 41.6, 34.6, 2);
  }
  /* ---------- 散佈的掩體 ---------- */
  place('car', -20, -10, 2, 4.2, 1.4, 0x6f7a5a, { args: { color: 0x5c6b4e, seed: 4 } }); place('car', 20, 9, 4.2, 2, 1.4, 0x6e3a3a, { args: { color: 0x7d2c2c, seed: 5 }, flip: true }); place('van', -6, 22, 4.2, 2, 1.4, 0x56677a, { args: { color: 0x3f5670, seed: 6 } });
  place('barrier', 10, -18, 4, 0.6, 1, 0x9a9a92); place('barrier', -12, 19, 4, 0.6, 1, 0x9a9a92);
  [[8, 17], [-17, -3], [17, -6], [-6, -19], [40, 2], [-40, 6], [6, 40], [-8, -40], [36, -8], [-26, 8]].forEach(([x, z], i) => place('crate', x, z, 1.2, 1.2, 1.2, 0x7a5c3a, { rot: (i % 4) * 0.12 - 0.18, args: { seed: i + 1 } }));
  // 路邊的小東西（不擋路）
  [[13.6, 12.6], [-13.4, -12.8], [16.4, -3], [-16.6, 7.5], [3, -16], [-3.4, 15.4]].forEach(([x, z]) => deco('trafficCone', x, z));
  [[44, 12], [-44, -6], [12, 44], [-18, -44], [44, -32]].forEach(([x, z]) => deco('trashBags', x, z));
  deco('hydrant', 16.6, 16.4, 0); deco('hydrant', -16.8, -16.2, 0); deco('roadSign', 16.8, -16.6, -Math.PI / 2); deco('roadSign', -16.6, 16.8, Math.PI / 2);
  // 牆外的電線桿
  [[-47.5, -30], [-47.5, 0], [-47.5, 30], [47.5, -30], [47.5, 0], [47.5, 30]].forEach(([x, z]) => deco('powerPole', x, z, Math.PI / 2));

  /* ---------- 雨與地面霧 ---------- */
  const rain = GFX.rain(); scene.add(rain);
  // 走進商店（有屋頂）時雨要停
  const _cp = new V3(); let rk = 1;
  GFX.tick.push(dt => { api.camera.getWorldPosition(_cp); const inside = Math.abs(_cp.x) < 9 && Math.abs(_cp.z) < 6 && _cp.y < 4.5; rk += ((inside ? 0 : 1) - rk) * Math.min(1, dt * 6); rain.material.uniforms.uK.value = rk; });
  /* ---------- 環境動態：壞掉的路燈、遠方閃電、貼地的霧 ---------- */
  // 兩盞接觸不良的路燈：大部分時間亮著，偶爾連閃幾下
  const bad = [lamps[lamps.length - 4], lamps[1]].filter(Boolean).map(o => ({ o, t: 3 + Math.random() * 6, n: 0, on: true }));
  GFX.tick.push(dt => {
    for (const b of bad) {
      b.t -= dt; if (b.t > 0) continue;
      if (b.n <= 0 && b.on) b.n = 3 + (Math.random() * 6 | 0);   // 開始一串閃爍
      b.on = !b.on; b.n--;
      if (b.n <= 0) { b.on = true; b.t = 5 + Math.random() * 14; } else b.t = b.on ? 0.04 + Math.random() * 0.25 : 0.03 + Math.random() * 0.12;
      const k = b.on ? 1 : 0.06; b.o.l.intensity = b.o.base * k; b.o.cone.visible = b.on; b.o.pool.visible = b.on;
    }
  });
  // 遠方的閃電：每 15～40 秒一次，天空和環境光一起亮兩下
  { let wait = 8 + Math.random() * 10, ft = 9; const hemi = GFX.hemi, hBase = hemi ? hemi.intensity : 1, sky = GFX.sky;
    GFX.tick.push(dt => {
      wait -= dt; ft += dt;
      if (wait <= 0) { wait = 15 + Math.random() * 25; ft = 0; if (sky) { const a = Math.random() * 6.283; sky.material.uniforms.uFdir.value.set(Math.cos(a), Math.sin(a)); } }
      const f = ft > 1.2 ? 0 : Math.max(Math.exp(-ft * 16), ft > 0.16 ? 0.75 * Math.exp(-(ft - 0.16) * 11) : 0, ft > 0.42 ? 0.35 * Math.exp(-(ft - 0.42) * 9) : 0);
      if (sky) sky.material.uniforms.uFlash.value = f;
      if (hemi) hemi.intensity = hBase * (1 + f * 1.3);
    });
  }
  // 貼地的霧：幾片很淡的水平霧片慢慢飄，商店裡沒有
  { const tex = GFX.canvasTex(128, (x, sz, r) => { x.clearRect(0, 0, sz, sz); for (let i = 0; i < 26; i++) { const px = sz * (0.25 + r() * 0.5), py = sz * (0.25 + r() * 0.5), rad = sz * (0.12 + r() * 0.2), g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(255,255,255,0.11)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, sz, sz); } }, { seed: 71 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const fm = new THREE.MeshBasicMaterial({ map: tex, color: 0x8ea0bc, transparent: true, opacity: 0.5, depthWrite: false, fog: false }), fg = new THREE.PlaneGeometry(1, 1), mist = [], r = GFX.rng(404);
    for (let i = 0; i < 18; i++) {
      let x, z; do { x = (r() - 0.5) * 84; z = (r() - 0.5) * 84; } while (Math.abs(x) < 13 && Math.abs(z) < 10);
      const m = new THREE.Mesh(fg, fm); m.rotation.x = -Math.PI / 2; m.rotation.z = r() * 6.283; const sc = 14 + r() * 12; m.scale.set(sc, sc, 1); m.position.set(x, 0.25 + r() * 0.75, z); m.renderOrder = 3; scene.add(m);
      mist.push({ m, x, z, p: r() * 6.283, s: 0.03 + r() * 0.05 });
    }
    GFX.tick.push((dt, t) => { for (const o of mist) { o.m.position.x = o.x + Math.sin(t * o.s + o.p) * 5; o.m.position.z = o.z + Math.cos(t * o.s * 0.8 + o.p) * 4; } });
  }
};

