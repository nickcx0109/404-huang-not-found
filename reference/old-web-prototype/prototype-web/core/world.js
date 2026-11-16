'use strict';
/* =========================================================
   Three.js 場景
   ========================================================= */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const SKY = 0x232b36;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 22, 80);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 260);
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xa9bbd2, 0x3b3228, 0.85));
const sun = new THREE.DirectionalLight(0xffc48a, 0.7); sun.position.set(-30, 26, -18); scene.add(sun);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const matCache = new Map();
const lam = hex => { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex })); return matCache.get(hex); };
const basic = hex => new THREE.MeshBasicMaterial({ color: hex });

// 用 canvas 畫字的招牌
class TextSign {
  constructor(w, h, draw) {
    this.c = document.createElement('canvas'); this.c.width = 512; this.c.height = Math.round(512 * h / w);
    this.tex = new THREE.CanvasTexture(this.c); this.draw = draw;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.redraw();
  }
  redraw(arg) { this.arg = arg === undefined ? this.arg : arg; const x = this.c.getContext('2d'); x.clearRect(0, 0, this.c.width, this.c.height); this.draw(x, this.c.width, this.c.height, this.arg); this.tex.needsUpdate = true; }
}
const SIGN_FONT = '"Big Shoulders Display","Noto Sans TC","Arial Narrow",sans-serif';

/* ---------- 地圖：90 × 90 公尺，五個區域 ---------- */
class World {
  constructor() {
    this.half = 45; this.obstacles = []; this.meshes = []; this.signs = [];
    this.spawns = [[-43, -43], [0, -43], [43, -43], [-43, 0], [43, 0], [-43, 43], [0, 43], [43, 43], [-20, -43], [20, 43], [-43, 20], [43, -20]].map(([x, z]) => new V3(x, 0, z));
    this.zones = [
      { name: '便利商店', x: -9, z: -6, w: 18, d: 12 },
      { name: '加油站', x: 18, z: -40, w: 22, d: 26 },
      { name: '公園', x: -40, z: -40, w: 24, d: 28 },
      { name: '公車總站', x: -40, z: 16, w: 26, d: 22 },
      { name: '貨櫃場', x: 16, z: 14, w: 26, d: 28 }
    ];
    this.counterPos = new V3(-6, 0, -1.8);
    this.build();
  }
  box(x, z, w, d, h, color, { solid = true, y = 0, mat = null } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || lam(color));
    m.position.set(x, y + h / 2, z); scene.add(m);
    if (solid) this.obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, store: false });
    if (solid || y > 0) this.meshes.push(m);
    return m;
  }
  tree(x, z) {
    this.box(x, z, 0.5, 0.5, 2.2, 0x5a4532);
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.5, 2.1), 0), lam(pickOne([0x3f5a3a, 0x4a6440, 0x37503a])));
    c.position.set(x, 3.4, z); c.rotation.set(rand(0, 3), rand(0, 3), 0); scene.add(c); this.meshes.push(c);
  }
  lamp(x, z, color, intensity, dist) {
    this.box(x, z, 0.25, 0.25, 4.6, 0x50555c);
    this.box(x, z, 0.6, 0.6, 0.15, 0, { solid: false, y: 4.6, mat: basic(color) });
    const l = new THREE.PointLight(color, intensity, dist); l.position.set(x, 4.3, z); scene.add(l);
  }
  build() {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), lam(0x1d2128)); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; scene.add(outer);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), lam(0x2c3036)); ground.rotation.x = -Math.PI / 2; scene.add(ground); this.meshes.push(ground);
    const paint = lam(0xb59a45);
    // 環繞商店的環形道路與十字主幹道標線
    for (let x = -16; x <= 16; x += 3) { this.box(x, 12, 1.4, 0.18, 0.02, 0, { solid: false, mat: paint }); this.box(x, -12, 1.4, 0.18, 0.02, 0, { solid: false, mat: paint }); }
    for (let z = -9; z <= 9; z += 3) { this.box(15, z, 0.18, 1.4, 0.02, 0, { solid: false, mat: paint }); this.box(-15, z, 0.18, 1.4, 0.02, 0, { solid: false, mat: paint }); }
    for (let t = 20; t <= 42; t += 3) { [[t, 0], [-t, 0]].forEach(([x, z]) => this.box(x, z, 1.4, 0.18, 0.02, 0, { solid: false, mat: paint })); [[0, t], [0, -t]].forEach(([x, z]) => this.box(x, z, 0.18, 1.4, 0.02, 0, { solid: false, mat: paint })); }
    // 圍牆
    const wall = 0x3a4049;
    this.box(0, -45.3, 91.2, 0.6, 3.4, wall); this.box(0, 45.3, 91.2, 0.6, 3.4, wall);
    this.box(-45.3, 0, 0.6, 91.2, 3.4, wall); this.box(45.3, 0, 0.6, 91.2, 3.4, wall);

    this.buildStore();

    // 加油站（東北）
    this.box(28, -26, 15, 10, 0.5, 0xd8d4c8, { solid: false, y: 4.4 });
    this.box(28, -20.97, 15, 0.06, 0.5, 0, { solid: false, y: 4.4, mat: basic(0xdc4a3d) });
    [[21.5, -30], [34.5, -30], [21.5, -22], [34.5, -22]].forEach(([x, z]) => this.box(x, z, 0.5, 0.5, 4.4, 0x8d9097));
    [25, 28, 31].forEach(x => this.box(x, -26, 0.9, 1.8, 1.4, 0xb8453a));
    this.box(28, -38, 9, 4, 3.2, 0x6c7480); this.box(38, -15, 4.2, 2, 1.4, 0x56677a); this.box(20, -36, 2, 4.2, 1.4, 0x6e3a3a);
    // 公園（西北）：開闊、可以繞圈的空地
    this.box(-28, -26, 4, 4, 0.8, 0x7d8088);
    this.box(-28, -26, 3.2, 3.2, 0.05, 0, { solid: false, y: 0.8, mat: lam(0x3d6c8a) });
    [[-38, -36], [-20, -36], [-38, -16], [-20, -17], [-33, -42], [-24, -10], [-41, -26], [-16, -28], [-30, -34], [-34, -20]].forEach(([x, z]) => this.tree(x, z));
    this.box(-24, -26, 2.2, 0.6, 0.5, 0x6b4a2f); this.box(-32, -26, 2.2, 0.6, 0.5, 0x6b4a2f);
    // 公車總站（西南）
    this.box(-29, 22, 10, 2.6, 3.1, 0xc9a227); this.box(-29, 22, 9.2, 2.64, 0.8, 0x1f2630, { solid: false, y: 1.7 });
    this.box(-29, 30, 10, 2.6, 3.1, 0x3d6c8a); this.box(-29, 30, 9.2, 2.64, 0.8, 0x1f2630, { solid: false, y: 1.7 });
    this.box(-19, 26, 2, 6, 0.2, 0x8d9097, { solid: false, y: 2.6 }); this.box(-19.8, 23.2, 0.2, 0.2, 2.6, 0x8d9097); this.box(-19.8, 28.8, 0.2, 0.2, 2.6, 0x8d9097);
    this.box(-36, 38, 4.2, 2, 1.4, 0x6f7a5a);
    // 貨櫃場（東南）：窄道與瓶頸
    [[20, 20, 6.5, 2.5, 0x3d6c8a], [31, 17, 2.5, 6.5, 0x8a4a3c], [24, 30, 6.5, 2.5, 0x5a7a4a], [36, 28, 2.5, 6.5, 0x3d6c8a], [29, 38, 6.5, 2.5, 0x8a4a3c], [40, 40, 2.5, 6.5, 0x5a7a4a]].forEach(([x, z, w, d, c]) => this.box(x, z, w, d, 2.7, c));
    this.box(20, 20, 6.5, 2.5, 2.7, 0x8a4a3c, { solid: false, y: 2.7 });
    this.box(12, 32, 10, 0.6, 1.6, 0x6b6f75);
    // 散佈的掩體
    this.box(-20, -10, 2, 4.2, 1.4, 0x6f7a5a); this.box(20, 9, 4.2, 2, 1.4, 0x6e3a3a); this.box(-6, 22, 4.2, 2, 1.4, 0x56677a);
    this.box(10, -18, 4, 0.6, 1, 0x9a9a92); this.box(-12, 19, 4, 0.6, 1, 0x9a9a92);
    [[8, 17], [-17, -3], [17, -6], [-6, -19], [40, 2], [-40, 6], [6, 40], [-8, -40], [36, -8], [-26, 8]].forEach(([x, z]) => this.box(x, z, 1.2, 1.2, 1.2, 0x7a5c3a));
    // 燈光
    this.lamp(28, -20, 0xdfe8ff, 0.9, 20); this.lamp(-22, -22, 0xffb768, 0.8, 18); this.lamp(-20, 20, 0xffb768, 0.8, 18); this.lamp(26, 24, 0xffd08a, 0.8, 18);
    // 遠景剪影
    for (let i = 0; i < 34; i++) {
      const a = i / 34 * Math.PI * 2 + rand(-0.05, 0.05), r = rand(58, 80), h = rand(8, 26), w = rand(6, 12);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lam(0x262d37)); m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); scene.add(m);
    }
  }
  buildStore() {
    // 18 × 12 公尺的可進入建築：南面正門、北面後門
    const W = 0x5a616c, H = 4.5;
    const wall = (x, z, w, d) => { const m = this.box(x, z, w, d, H, W); this.obstacles[this.obstacles.length - 1].store = true; return m; };
    wall(-2.5, -6, 13, 0.5); wall(8, -6, 2, 0.5);
    wall(-5.25, 6, 7.5, 0.5); wall(5.25, 6, 7.5, 0.5);
    wall(-9, 0, 0.5, 12.5); wall(9, 0, 0.5, 12.5);
    this.box(0, 6, 3, 0.5, 1.5, W, { solid: false, y: 3 }); this.box(5.5, -6, 3, 0.5, 1.5, W, { solid: false, y: 3 });
    this.box(0, 0, 18.5, 12.5, 0.3, 0x474d57, { solid: false, y: H });
    this.box(0, 0, 17.5, 11.5, 0.02, 0, { solid: false, mat: lam(0x6d7377) });
    [[-5.25], [5.25]].forEach(([x]) => this.box(x, 6.27, 5.5, 0.06, 1.6, 0x1c2430, { solid: false, y: 0.9 }));
    // 招牌
    this.box(0, 6.2, 11, 0.3, 1.5, 0x22272f, { solid: false, y: 4.6 });
    const sign = new TextSign(10.4, 1.3, (x, w, h) => {
      x.fillStyle = '#f0a23b'; x.font = `800 ${h * 0.62}px ${SIGN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ZOMBIE MART  ·  交易站', w / 2, h * 0.54);
    });
    sign.mesh.position.set(0, 5.35, 6.37); scene.add(sign.mesh); this.signs.push(sign);
    this.openSign = new TextSign(1.8, 0.7, (x, w, h, open) => {
      x.fillStyle = 'rgba(10,12,16,.85)'; x.fillRect(0, 0, w, h);
      x.strokeStyle = open ? '#5fe3d0' : '#dc4a3d'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16);
      x.fillStyle = open ? '#5fe3d0' : '#dc4a3d'; x.font = `800 ${h * 0.55}px ${SIGN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(open ? 'OPEN' : 'CLOSED', w / 2, h * 0.54);
    });
    this.openSign.mesh.position.set(-2.6, 2.6, 6.3); scene.add(this.openSign.mesh); this.signs.push(this.openSign);
    // 內部：櫃台、貨架、抽獎機
    this.box(-6, -3.6, 4.4, 1.2, 1.1, 0x6b4a2f);
    this.box(-6, -3.6, 4.6, 1.3, 0.08, 0xd8d4c8, { solid: false, y: 1.1 });
    this.traderSign = new TextSign(3.4, 0.8, (x, w, h, open) => {
      x.fillStyle = open ? '#5fe3d0' : '#59606b'; x.font = `800 ${h * 0.6}px ${SIGN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(open ? 'TRADER · 櫃台' : '休息中', w / 2, h * 0.55);
    });
    this.traderSign.mesh.position.set(-6, 3.1, -5.7); scene.add(this.traderSign.mesh); this.signs.push(this.traderSign);
    this.box(-4, 1.5, 4.5, 0.8, 1.8, 0x8d9097); this.box(4, 1.5, 4.5, 0.8, 1.8, 0x8d9097); this.box(2.6, -2.2, 3.6, 0.8, 1.8, 0x8d9097);
    [[-4, 1.5], [4, 1.5], [2.6, -2.2]].forEach(([x, z]) => { for (let i = 0; i < 3; i++) this.box(x + rand(-1.5, 1.5), z, rand(0.4, 0.9), 0.5, 0.35, pickOne([0xb8453a, 0x3d6c8a, 0xc9a227, 0x5a7a4a]), { solid: false, y: 0.5 + i * 0.55 }); });
    this.machinePos = new V3(7.6, 0, -3.6);
    const mb = this.box(7.6, -3.6, 1.3, 1.3, 2.1, 0x8c2f39);
    this.machineDome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), new THREE.MeshLambertMaterial({ color: 0xffe0a0, emissive: 0x000000 }));
    this.machineDome.position.set(7.6, 2.55, -3.6); scene.add(this.machineDome); this.meshes.push(this.machineDome);
    const ms = new TextSign(1.1, 0.5, (x, w, h) => { x.fillStyle = '#f0a23b'; x.font = `800 ${h * 0.6}px ${SIGN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('抽獎機', w / 2, h * 0.55); });
    ms.mesh.position.set(6.93, 1.6, -3.6); ms.mesh.rotation.y = -Math.PI / 2; scene.add(ms.mesh); this.signs.push(ms);
    this.storeLight = new THREE.PointLight(0xdff3ff, 1.0, 17); this.storeLight.position.set(0, 3.9, 0); scene.add(this.storeLight);
  }
  setStoreOpen(open) { this.openSign.redraw(open); this.traderSign.redraw(open); this.storeLight.color.setHex(open ? 0xdff3ff : 0x8a96a8); this.storeLight.intensity = open ? 1.1 : 0.55; }
  collide(p, r) {
    for (const o of this.obstacles) {
      const cx = clamp(p.x, o.minX, o.maxX), cz = clamp(p.z, o.minZ, o.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      else {
        const l = p.x - o.minX, ri = o.maxX - p.x, t = p.z - o.minZ, b = o.maxZ - p.z, m = Math.min(l, ri, t, b);
        if (m === l) p.x = o.minX - r; else if (m === ri) p.x = o.maxX + r; else if (m === t) p.z = o.minZ - r; else p.z = o.maxZ + r;
      }
    }
    p.x = clamp(p.x, -this.half + r, this.half - r); p.z = clamp(p.z, -this.half + r, this.half - r);
  }
  zoneAt(x, z) { const zn = this.zones.find(q => x >= q.x && x <= q.x + q.w && z >= q.z && z <= q.z + q.d); return zn ? zn.name : '街區'; }
}

