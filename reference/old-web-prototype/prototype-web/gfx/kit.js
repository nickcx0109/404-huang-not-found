'use strict';
/* =========================================================
   GFX kit（v0.5 圖形層的共用工具）
   - 線性色彩工作流：所有 hex 顏色自動由 sRGB 轉線性
   - Builder：把很多基本形狀合併成少數幾個 mesh（依材質分層、頂點著色）
   - 程序貼圖與亂數工具
   只依賴全域的 THREE（r128）。
   ========================================================= */
const GFX = { opts: { shadows: true, post: true } };

/* ---------- 線性色彩：hex / CSS 顏色一律視為 sRGB ---------- */
(() => {
  const P = THREE.Color.prototype, setHex = P.setHex, setStyle = P.setStyle;
  let inStyle = false;
  P.setHex = function (h) { setHex.call(this, h); return inStyle ? this : this.convertSRGBToLinear(); };
  P.setStyle = function (s) { inStyle = true; try { setStyle.call(this, s); } finally { inStyle = false; } return this.convertSRGBToLinear(); };
})();

/* ---------- 可重現的亂數 ---------- */
GFX.rng = seed => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/* ---------- 共用材質（頂點著色，依層區分質感） ---------- */
GFX.mats = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
  gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.08 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.85 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.42, depthWrite: false }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true })
};
GFX.LAYERS = Object.keys(GFX.mats);

/* ---------- Builder ---------- */
{
  const V = THREE.Vector3;
  const _pos = new V(), _scl = new V(), _quat = new THREE.Quaternion(), _eul = new THREE.Euler(), _local = new THREE.Matrix4(), _full = new THREE.Matrix4(), _nm = new THREE.Matrix3();
  const _a = new V(), _b = new V(), _c = new V(), _n = new V(), _ab = new V(), _cb = new V();
  const _c1 = new THREE.Color(), _c2 = new THREE.Color();

  GFX.Builder = class Builder {
    constructor() { this.layers = {}; this.cur = 'matte'; this.stack = [new THREE.Matrix4()]; }
    /** 切換之後加入的形狀要用哪一層材質：matte / gloss / metal / glass / glow */
    use(layer) { if (!GFX.mats[layer]) throw new Error('unknown layer ' + layer); this.cur = layer; return this; }
    /** 在一個區域座標系裡執行 fn（位置 + 尤拉角 + 縮放），用來擺放子組件 */
    at(x, y, z, r, fn, s = 1) {
      if (typeof r === 'function') { fn = r; r = null; }
      _local.compose(_pos.set(x, y, z), _quat.setFromEuler(_eul.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0)), typeof s === 'number' ? _scl.set(s, s, s) : _scl.set(s[0], s[1], s[2]));
      this.stack.push(this.stack[this.stack.length - 1].clone().multiply(_local));
      try { fn(this); } finally { this.stack.pop(); }
      return this;
    }
    /**
     * 加入任意 BufferGeometry。
     * o.r [rx,ry,rz] 旋轉、o.s 縮放（數字或 [x,y,z]）、o.smooth 用原本的平滑法線（預設算平面法線）、
     * o.c2 底部顏色（由下往上漸層到 color，用來做假的環境遮蔽）、o.glow 發光層的亮度倍率
     */
    add(geo, color, x = 0, y = 0, z = 0, o = {}) {
      const L = this.layers[this.cur] || (this.layers[this.cur] = { pos: [], nor: [], col: [] });
      const g = geo.index ? geo.toNonIndexed() : geo, r = o.r, s = o.s === undefined ? 1 : o.s;
      _local.compose(_pos.set(x, y, z), _quat.setFromEuler(_eul.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0)), typeof s === 'number' ? _scl.set(s, s, s) : _scl.set(s[0], s[1], s[2]));
      _full.multiplyMatrices(this.stack[this.stack.length - 1], _local); _nm.getNormalMatrix(_full);
      const P = g.attributes.position, N = g.attributes.normal, n = P.count;
      const k = this.cur === 'glow' ? (o.glow === undefined ? 2.5 : o.glow) : 1;
      _c1.set(color); if (o.c2 !== undefined) _c2.set(o.c2);
      let y0 = 0, y1 = 1;
      if (o.c2 !== undefined) { g.computeBoundingBox(); y0 = g.boundingBox.min.y; y1 = Math.max(g.boundingBox.max.y, y0 + 1e-6); }
      for (let i = 0; i < n; i += 3) {
        _a.fromBufferAttribute(P, i).applyMatrix4(_full); _b.fromBufferAttribute(P, i + 1).applyMatrix4(_full); _c.fromBufferAttribute(P, i + 2).applyMatrix4(_full);
        if (!o.smooth || !N) { _cb.subVectors(_c, _b); _ab.subVectors(_a, _b); _n.crossVectors(_cb, _ab).normalize(); }
        for (let j = 0; j < 3; j++) {
          const v = j === 0 ? _a : j === 1 ? _b : _c; L.pos.push(v.x, v.y, v.z);
          if (o.smooth && N) { _n.fromBufferAttribute(N, i + j).applyMatrix3(_nm).normalize(); }
          L.nor.push(_n.x, _n.y, _n.z);
          if (o.c2 !== undefined) { const t = (P.getY(i + j) - y0) / (y1 - y0); L.col.push((_c2.r + (_c1.r - _c2.r) * t) * k, (_c2.g + (_c1.g - _c2.g) * t) * k, (_c2.b + (_c1.b - _c2.b) * t) * k); }
          else L.col.push(_c1.r * k, _c1.g * k, _c1.b * k);
        }
      }
      if (g !== geo) g.dispose();
      if (!o.keep) geo.dispose();
      return this;
    }
    /** 方塊。o.taper：頂面縮放（數字或 [x,z]），做出梯形 */
    box(w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (o.taper !== undefined) { const t = Array.isArray(o.taper) ? o.taper : [o.taper, o.taper], p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * t[0]); p.setZ(i, p.getZ(i) * t[1]); } }
      return this.add(g, color, x, y, z, o);
    }
    /** 圓柱／圓錐台。o.axis：'y'（預設）、'x'、'z'（頂面 rTop 朝該軸正向）；o.seg 邊數；預設平滑 */
    cyl(rTop, rBot, h, color, x = 0, y = 0, z = 0, o = {}) {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, o.seg || 8, 1, !!o.open);
      if (o.axis === 'z') g.rotateX(Math.PI / 2); else if (o.axis === 'x') g.rotateZ(-Math.PI / 2);
      return this.add(g, color, x, y, z, Object.assign({ smooth: o.flat ? false : true }, o));
    }
    /** 球。o.seg 經線數；o.ico 改用二十面體（數字＝細分次數，平面著色） */
    sph(r, color, x = 0, y = 0, z = 0, o = {}) {
      if (o.ico !== undefined) return this.add(new THREE.IcosahedronGeometry(r, o.ico), color, x, y, z, o);
      const seg = o.seg || 8;
      return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7))), color, x, y, z, Object.assign({ smooth: o.flat ? false : true }, o));
    }
    /** 把 XY 平面上的多邊形輪廓（[[x,y],…]，逆時針）沿 Z 擠出 depth，並置中。o.bevel 倒角大小 */
    prism(pts, depth, color, x = 0, y = 0, z = 0, o = {}) {
      const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
      const bv = o.bevel || 0;
      const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bv * 2, steps: 1, bevelEnabled: bv > 0, bevelSize: bv, bevelThickness: bv, bevelSegments: 1, curveSegments: 4 });
      g.translate(0, 0, -(depth - bv * 2) / 2);
      return this.add(g, color, x, y, z, o);
    }
    /** 車床：[[半徑, y],…] 繞 Y 軸旋轉 */
    lathe(pts, color, x = 0, y = 0, z = 0, o = {}) {
      return this.add(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), o.seg || 10), color, x, y, z, Object.assign({ smooth: true }, o));
    }
    /** 取出某一層合併後的 BufferGeometry */
    geo(layer) {
      const L = this.layers[layer]; if (!L) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(L.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.col, 3));
      g.computeBoundingSphere();
      return g;
    }
    /** 產生 Group：每層一個 mesh。o.shadow=false 不投影也不接收陰影（第一人稱模型用） */
    group(o = {}) {
      const grp = new THREE.Group();
      for (const k of GFX.LAYERS) {
        const g = this.geo(k); if (!g) continue;
        const m = new THREE.Mesh(g, GFX.mats[k]); m.name = k;
        const sh = o.shadow !== false && k !== 'glow' && k !== 'glass';
        m.castShadow = sh; m.receiveShadow = o.shadow !== false && k !== 'glow';
        if (k === 'glass') m.renderOrder = 2;
        grp.add(m);
      }
      return grp;
    }
    tris() { let t = 0; for (const k in this.layers) t += this.layers[k].pos.length / 9; return t; }
  };
}

/* ---------- 程序貼圖 ---------- */
/** 用 canvas 畫貼圖。draw(ctx, size, rnd)。o.repeat [u,v]、o.srgb（顏色貼圖設 true）、o.seed */
GFX.canvasTex = (size, draw, o = {}) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size, GFX.rng(o.seed || 7));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.anisotropy = 8; if (o.srgb !== false) t.encoding = THREE.sRGBEncoding;
  return t;
};
/** 可無縫拼接的 value noise（多層疊加），回傳 Float32Array(size*size)，值域約 0..1 */
GFX.noise = (size, cells, octaves = 4, seed = 1) => {
  const out = new Float32Array(size * size); let amp = 1, tot = 0, n = cells;
  for (let oc = 0; oc < octaves; oc++, n *= 2, amp *= 0.5) {
    const rnd = GFX.rng(seed * 131 + oc * 977), g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd();
    const f = n / size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x * f, fy = y * f, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[y0 * n + x0], b = g[y0 * n + x1], c = g[y1 * n + x0], d = g[y1 * n + x1];
      out[y * size + x] += (a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy) * amp;
    }
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
};
/** 由高度陣列（size*size，0..1）算出法線貼圖 */
GFX.normalFromHeight = (h, size, strength = 2, o = {}) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const x2 = c.getContext('2d'), img = x2.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + (x + size - 1) % size], r = h[y * size + (x + 1) % size], u = h[((y + size - 1) % size) * size + x], dn = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1; const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
    const i = (y * size + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  x2.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]); t.anisotropy = 8;
  return t;
};
