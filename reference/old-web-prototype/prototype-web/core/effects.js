'use strict';
/* ---------- 特效（全部走 ObjectPool） ---------- */
class Fx {
  constructor() {
    const g = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this.mats = { blood: lam(0x8e1c1c), spark: basic(0xffd27a), fire: basic(0xff7a2a), dust: lam(0x8a8f96), coin: basic(0xffc94a) };
    this.parts = []; this.lines = []; this.rings = []; this.blasts = [];
    this.partPool = new ObjectPool(() => { const m = new THREE.Mesh(g, this.mats.blood); scene.add(m); return { m, v: new V3(), life: 0 }; }, p => { p.m.visible = true; }, p => { p.m.visible = false; });
    this.linePool = new ObjectPool(() => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]), new THREE.LineBasicMaterial({ color: 0xffe3a6, transparent: true }));
      l.frustumCulled = false; scene.add(l); return { l, life: 0 };
    }, o => { o.l.visible = true; }, o => { o.l.visible = false; });
    const rg = new THREE.RingGeometry(0.9, 1, 48);
    this.ringPool = new ObjectPool(() => { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; scene.add(m); return { m, life: 0, dur: 1, r: 1 }; }, o => { o.m.visible = true; }, o => { o.m.visible = false; });
    const sg = new THREE.SphereGeometry(1, 16, 12);
    this.blastPool = new ObjectPool(() => { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, depthWrite: false })); scene.add(m); return { m, life: 0, r: 1 }; }, o => { o.m.visible = true; }, o => { o.m.visible = false; });
  }
  burst(pos, n, kind = 'blood', speed = 3) {
    for (let i = 0; i < n; i++) {
      const p = this.partPool.get(); p.m.material = this.mats[kind]; p.m.position.copy(pos);
      p.v.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(speed); p.life = rand(0.35, 0.7); this.parts.push(p);
    }
  }
  tracer(a, b) {
    const o = this.linePool.get(), pa = o.l.geometry.attributes.position;
    pa.setXYZ(0, a.x, a.y, a.z); pa.setXYZ(1, b.x, b.y, b.z); pa.needsUpdate = true; o.l.material.opacity = 0.9; o.life = 0.06; this.lines.push(o);
  }
  ring(pos, r, color, dur = 0.45) { const o = this.ringPool.get(); o.m.material.color.setHex(color); o.m.position.set(pos.x, 0.06, pos.z); o.r = r; o.dur = dur; o.life = dur; this.rings.push(o); }
  blast(pos, r) { const o = this.blastPool.get(); o.m.position.set(pos.x, 1, pos.z); o.r = r; o.life = 0.45; this.blasts.push(o); }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt; p.v.y -= 14 * dt; p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.03) { p.m.position.y = 0.03; p.v.set(0, 0, 0); }
      if (p.life <= 0) { this.partPool.release(p); this.parts.splice(i, 1); }
    }
    for (let i = this.lines.length - 1; i >= 0; i--) { const o = this.lines[i]; o.life -= dt; o.l.material.opacity = Math.max(0, o.life / 0.06) * 0.9; if (o.life <= 0) { this.linePool.release(o); this.lines.splice(i, 1); } }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const o = this.rings[i]; o.life -= dt; const k = 1 - o.life / o.dur;
      o.m.scale.setScalar(o.r * (0.25 + 0.75 * k)); o.m.material.opacity = (1 - k) * 0.85;
      if (o.life <= 0) { this.ringPool.release(o); this.rings.splice(i, 1); }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const o = this.blasts[i]; o.life -= dt; const k = 1 - o.life / 0.45;
      o.m.scale.setScalar(o.r * (0.3 + 0.7 * Math.sqrt(k))); o.m.material.opacity = (1 - k) * 0.75;
      if (o.life <= 0) { this.blastPool.release(o); this.blasts.splice(i, 1); }
    }
  }
}

