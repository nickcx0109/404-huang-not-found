'use strict';
/* ---------- 地上的引導線：交易時間指向商店櫃台 ---------- */
class StoreGuide {
  constructor(world) {
    this.field = new FlowField(world); this.field.update(world.counterPos.x, world.counterPos.z);
    const g = new THREE.BoxGeometry(0.16, 0.03, 0.62);
    this.marks = []; for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x5fe3d0, transparent: true, depthWrite: false })); m.visible = false; scene.add(m); this.marks.push(m); }
    this.t = 0; this.active = false; this.cells = []; this.tmp = new V3(); this.tmp2 = new V3();
  }
  setActive(a) { this.active = a; if (!a) this.marks.forEach(m => { m.visible = false; }); }
  update(dt, p) {
    if (!this.active) return;
    this.t -= dt;
    if (this.t <= 0) { this.t = 0.25; this.cells = this.field.path(p.pos.x, p.pos.z); }
    const time = performance.now() / 1000;
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      if (i < 1 || i >= this.cells.length - 1) { m.visible = false; continue; }
      this.field.center(this.cells[i], this.tmp); this.field.center(this.cells[i + 1], this.tmp2);
      m.visible = true; m.position.set(this.tmp.x, 0.03, this.tmp.z); m.rotation.y = Math.atan2(this.tmp2.x - this.tmp.x, this.tmp2.z - this.tmp.z);
      m.material.opacity = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(time * 7 - i * 0.55));
    }
  }
}

