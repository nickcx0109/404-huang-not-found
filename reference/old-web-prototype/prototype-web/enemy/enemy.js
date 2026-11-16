'use strict';
/* =========================================================
   B：敵人與波次（正式版只在 Host 執行）
   ========================================================= */
const S = 'success', F = 'failure', R = 'running';
class BTNode { tick() { return F; } }
class Sequence extends BTNode { constructor(...c) { super(); this.c = c; } tick(e, dt) { for (const n of this.c) { const r = n.tick(e, dt); if (r !== S) return r; } return S; } }
class Selector extends BTNode { constructor(...c) { super(); this.c = c; } tick(e, dt) { for (const n of this.c) { const r = n.tick(e, dt); if (r !== F) return r; } return F; } }
class Condition extends BTNode { constructor(fn) { super(); this.fn = fn; } tick(e) { return this.fn(e) ? S : F; } }
class Action extends BTNode { constructor(fn) { super(); this.fn = fn; } tick(e, dt) { return this.fn(e, dt); } }
class Cooldown extends BTNode {
  constructor(sec, child) { super(); this.sec = sec; this.child = child; this.key = 'cd' + (Cooldown.n = (Cooldown.n || 0) + 1); }
  tick(e, dt) { if (game.time < (e.mem[this.key] || 0)) return F; const r = this.child.tick(e, dt); if (r === S) e.mem[this.key] = game.time + this.sec; return r; }
}
const sel = (...c) => new Selector(...c), seq = (...c) => new Sequence(...c), cond = fn => new Condition(fn), act = fn => new Action(fn), cooldown = (s, c) => new Cooldown(s, c);
class BehaviorTreeBrain { constructor(root) { this.root = root; } tick(e, dt) { this.root.tick(e, dt); } }

class NearestTarget {
  select(e, players) { let best = null, bd = Infinity; for (const p of players) { if (p.downed) continue; const d = (p.pos.x - e.pos.x) ** 2 + (p.pos.z - e.pos.z) ** 2; if (d < bd) { bd = d; best = p; } } return best; }
}

const ENEMY_DEFS = {
  walker: { name: '一般', hp: 100, speed: 2.0, radius: 0.42, scale: 1, score: 100, cash: 15, drop: 0.05, skin: 0x7f9a6b, shirt: 0x4b5363, pants: 0x2f3540 },
  runner: { name: '快速', hp: 55, speed: 3.0, radius: 0.38, scale: 0.92, score: 150, cash: 20, drop: 0.07, skin: 0xa9b893, shirt: 0x8a3a2c, pants: 0x2b2b30 },
  tank: { name: '坦克', hp: 480, speed: 1.35, radius: 0.72, scale: 1.45, score: 500, cash: 75, drop: 0.4, skin: 0x667a58, shirt: 0x2a2e36, pants: 0x1f2228 },
  exploder: { name: '自爆', hp: 60, speed: 2.2, radius: 0.5, scale: 1.08, score: 200, cash: 25, drop: 0.1, skin: 0xa8ad5c, shirt: 0xc0702c, pants: 0x3a3326 }
};
const TIPS = {
  runner: ['快速殭屍', '尖叫並停頓之後會直線衝刺。聽到尖叫就轉身，往側邊閃開'],
  tank: ['坦克', '舉手蓄力、地上出現紅圈時會重擊周圍。集火並保持距離'],
  exploder: ['自爆殭屍', '身體發光後會加速衝過來，靠近就爆炸。在遠處先打掉它']
};

class Enemy {
  constructor(type) {
    this.type = type; this.def = ENEMY_DEFS[type];
    this.pos = new V3(); this.knock = new V3(); this.desired = new V3(); this.mem = {}; this.parts = []; this.yaw = 0; this.phase = Math.random() * 6;
    this.buildMesh();
    this.brain = new BehaviorTreeBrain(this.buildTree());
  }
  buildMesh() {
    const d = this.def, g = new THREE.Group(); g.rotation.order = 'YXZ';
    this.mats = [new THREE.MeshLambertMaterial({ color: d.skin }), new THREE.MeshLambertMaterial({ color: d.shirt }), new THREE.MeshLambertMaterial({ color: d.pants })];
    const [skin, shirt, pants] = this.mats;
    const box = (w, h, dd, m, x, y, z, part, parent = g) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); mesh.position.set(x, y, z); mesh.userData = { enemy: this, part }; parent.add(mesh); this.parts.push(mesh); return mesh; };
    const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };
    this.legL = pivot(-0.15, 0.85, 0); this.legR = pivot(0.15, 0.85, 0);
    box(0.22, 0.85, 0.24, pants, 0, -0.425, 0, 'body', this.legL); box(0.22, 0.85, 0.24, pants, 0, -0.425, 0, 'body', this.legR);
    this.body = box(this.type === 'exploder' ? 0.78 : 0.62, 0.75, this.type === 'exploder' ? 0.55 : 0.36, shirt, 0, 1.25, 0, 'body');
    this.head = box(0.38, 0.38, 0.38, skin, 0, 1.83, 0.04, 'head');
    this.armL = pivot(-0.43, 1.55, 0); this.armR = pivot(0.43, 1.55, 0);
    box(0.18, 0.72, 0.2, skin, 0, -0.33, 0, 'body', this.armL); box(0.18, 0.72, 0.2, skin, 0, -0.33, 0, 'body', this.armR);
    g.visible = false; this.group = g;
  }
  buildTree() { return sel(act(e => e.chase())); }
  reset(pos, opts) {
    this.alive = true; this.active = true; this.boss = !!opts.boss;
    this.baseScale = this.def.scale * (this.boss ? 1.35 : 1); this.group.scale.setScalar(this.baseScale);
    this.radius = this.def.radius * (this.boss ? 1.35 : 1);
    this.maxHp = this.def.hp * (opts.hpMul || 1) * (this.boss ? 3.2 : 1); this.hp = this.maxHp;
    this.pos.copy(pos); this.knock.set(0, 0, 0); this.busy = null; this.burn = 0; this.primed = false; this.exploded = false;
    this.flashT = 0; this.deathT = 0; this.spawnT = 0; this.mem = {}; this.groanT = rand(2, 8);
    this.group.visible = true; this.group.rotation.set(0, 0, 0); this.group.position.set(pos.x, -2, pos.z);
    this.body.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0); this.armL.rotation.set(-1.35, 0, 0); this.armR.rotation.set(-1.35, 0, 0);
    this.setGlow(0, 0, 0);
  }
  setGlow(r, g, b, onlyShirt = false) { this.mats.forEach((m, i) => { if (!onlyShirt || i === 1) m.emissive.setRGB(r, g, b); else m.emissive.setRGB(0, 0, 0); }); }
  get hasLos() { return this.target ? game.flow.los(this.pos.x, this.pos.z, this.target.pos.x, this.target.pos.z) : false; }

  chase() {
    if (!this.target) {
      if (!this.mem.wt || game.time > this.mem.wt) { this.mem.wt = game.time + rand(2, 5); this.mem.wd = new V3(rand(-1, 1), 0, rand(-1, 1)).normalize(); this.mem.ws = Math.random() < 0.4 ? 0 : 0.35; }
      this.desired.copy(this.mem.wd).multiplyScalar(this.mem.ws); return R;
    }
    const t = this.target.pos;
    if (this.dist < 7 && this.hasLos) this.desired.set(t.x - this.pos.x, 0, t.z - this.pos.z).normalize();
    else if (!game.flow.dir(this.pos.x, this.pos.z, this.desired)) this.desired.set(t.x - this.pos.x, 0, t.z - this.pos.z).normalize();
    return R;
  }
  melee(dmg) {
    this.busy = { kind: 'melee', t: 0, dur: 0.42,
      update: (e, dt, t) => { const k = Math.sin(t / 0.42 * Math.PI); e.armL.rotation.x = e.armR.rotation.x = -1.35 - k * 0.55; e.body.rotation.x = k * 0.25; },
      done: e => { e.body.rotation.x = 0; if (e.target && e.dist < e.radius + 1.2) e.target.hurt(dmg, e); } };
    return S;
  }
  stagger() {
    this.busy = { kind: 'stagger', t: 0, dur: 0.24, update: (e, dt, t) => { e.body.rotation.x = -0.35 * Math.sin(t / 0.24 * Math.PI); e.head.rotation.x = -0.4 * Math.sin(t / 0.24 * Math.PI); }, done: e => { e.body.rotation.x = 0; e.head.rotation.x = 0; } };
  }
  canStagger(amount, info) { return info.headshot || amount >= 30; }

  ignite(sec) { if (this.alive) this.burn = Math.max(this.burn, sec); }
  takeDamage(amount, info = {}) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (info.source !== 'burn') {
      this.flashT = 0.07;
      if (info.dir) { const k = (info.knock || 1.4) / (this.type === 'tank' ? 4 : 1); this.knock.x += info.dir.x * k; this.knock.z += info.dir.z * k; }
      if (this.hp > 0 && this.canStagger(amount, info)) this.stagger();
    }
    bus.emit('EnemyHit', { enemy: this, amount, isHeadshot: !!info.headshot, source: info.source });
    if (this.hp <= 0) { this.die(info); return true; }
    return false;
  }
  die(info) {
    const wasBurning = this.burn > 0;
    this.alive = false; this.busy = null; this.burn = 0; this.deathT = 0; this.setGlow(0, 0, 0);
    bus.emit('EnemyKilled', { enemy: this, type: this.type, killerClientId: 0, isHeadshot: !!info.headshot, wasBurning, pos: this.pos.clone(), boss: this.boss, source: info.source });
  }
  updateDeath(dt) {
    this.deathT += dt; const k = Math.min(this.deathT / 0.45, 1);
    this.group.rotation.x = -k * k * Math.PI / 2 * 0.97;
    if (this.deathT > 2.2) this.group.position.y -= dt * 0.8;
    if (this.deathT > 3.4) game.factory.release(this);
  }
  update(dt) {
    if (!this.alive) { this.updateDeath(dt); return; }
    if (this.spawnT < 0.7) { this.spawnT += dt; this.group.position.set(this.pos.x, -2 * (1 - Math.min(this.spawnT / 0.7, 1)), this.pos.z); return; }
    if (this.burn > 0) {
      this.burn -= dt; if (Math.random() < dt * 14) game.fx.burst(new V3(this.pos.x + rand(-0.3, 0.3), rand(0.6, 1.8) * this.baseScale, this.pos.z + rand(-0.3, 0.3)), 1, 'fire', 1.2);
      this.takeDamage(9 * dt, { source: 'burn' }); if (!this.alive) return;
    }
    this.target = game.targetSelector.select(this, game.players);
    this.dist = this.target ? Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z) : Infinity;
    this.desired.set(0, 0, 0);
    this.moveSpeed = this.def.speed * (this.primed ? 2.1 : 1) * (this.boss ? 0.9 : 1);
    if (this.busy) {
      const b = this.busy; b.t += dt; if (b.update) b.update(this, dt, b.t);
      if (this.busy === b && b.t >= b.dur) { this.busy = null; if (b.done) b.done(this); }
    } else this.brain.tick(this, dt);
    if (!this.alive) return;
    const sp = this.moveSpeed;
    this.pos.x += (this.desired.x * sp + this.knock.x) * dt; this.pos.z += (this.desired.z * sp + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-7 * dt));
    for (const o of game.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, min = this.radius + o.radius, d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), push = (min - d) * 0.5; this.pos.x += dx / d * push; this.pos.z += dz / d * push; }
    }
    if (this.target) {
      const dx = this.pos.x - this.target.pos.x, dz = this.pos.z - this.target.pos.z, min = this.radius + 0.38, d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); this.pos.x += dx / d * (min - d); this.pos.z += dz / d * (min - d); }
    }
    world.collide(this.pos, this.radius);
    let ty = this.yaw;
    if (this.desired.lengthSq() > 0.01) ty = Math.atan2(this.desired.x, this.desired.z);
    else if (this.target) ty = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
    let da = ty - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += da * Math.min(1, dt * 8);
    this.group.position.set(this.pos.x, 0, this.pos.z); this.group.rotation.y = this.yaw;
    const moving = this.desired.lengthSq() > 0.01 ? sp * this.desired.length() : 0;
    this.phase += dt * moving * 3.4;
    const sw = Math.sin(this.phase) * Math.min(moving, 1) * 0.65;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    if (!this.busy || this.busy.kind === 'charge') { this.armL.rotation.set(-1.35 + Math.sin(this.phase * 0.5) * 0.08, 0, 0); this.armR.rotation.set(-1.35 - Math.sin(this.phase * 0.5) * 0.08, 0, 0); this.head.rotation.z = 0; }
    this.flashT -= dt;
    if (this.flashT > 0) this.setGlow(0.55, 0.55, 0.55);
    else if (this.primed) { const p = 0.5 + 0.5 * Math.sin(game.time * (this.dist < 4 ? 30 : 16)); this.setGlow(1.0 * p, 0.55 * p, 0.05, true); }
    else if (this.burn > 0) { const p = 0.35 + 0.25 * Math.sin(game.time * 20 + this.phase); this.setGlow(p, p * 0.35, 0); }
    else this.setGlow(0, 0, 0);
    this.groanT -= dt; if (this.groanT <= 0) { this.groanT = rand(4, 10); if (game.inRun && this.dist < 18) sfx.groan(this.pos); }
  }
}

class Walker extends Enemy {
  buildTree() { return sel(seq(cond(e => e.dist < 1.6), cooldown(1.1, act(e => e.melee(12)))), act(e => e.chase())); }
}
class Runner extends Enemy {
  buildTree() {
    return sel(
      seq(cond(e => e.dist < 1.5), cooldown(0.8, act(e => e.melee(9)))),
      seq(cond(e => e.dist > 4.5 && e.dist < 13), cooldown(4.5, act(e => e.charge()))),
      act(e => e.chase()));
  }
  charge() {
    if (!this.hasLos) return F;
    sfx.scream(this.pos);
    this.busy = { kind: 'scream', t: 0, dur: 0.8,
      update: (e, dt, t) => { e.head.rotation.x = -0.6; e.head.rotation.z = Math.sin(t * 60) * 0.12; e.armL.rotation.set(-0.5, 0, -0.7); e.armR.rotation.set(-0.5, 0, 0.7); },
      done: e => {
        e.head.rotation.set(0, 0, 0); e.armL.rotation.set(-1.35, 0, 0); e.armR.rotation.set(-1.35, 0, 0);
        if (!e.target) return;
        const dir = new V3(e.target.pos.x - e.pos.x, 0, e.target.pos.z - e.pos.z).normalize();
        e.busy = { kind: 'charge', t: 0, dur: 1.3, hit: false,
          update: (z) => { z.desired.copy(dir); z.moveSpeed = 9; z.body.rotation.x = 0.35;
            if (!z.busy.hit && z.target && z.dist < z.radius + 0.95) { z.busy.hit = true; z.target.hurt(16, z); z.target.knock.addScaledVector(dir, 7); } },
          done: z => { z.body.rotation.x = 0; } };
      } };
    return S;
  }
}
class Tank extends Enemy {
  constructor(t) { super(t); this.tele = new THREE.Mesh(new THREE.RingGeometry(0.05, 1, 48), new THREE.MeshBasicMaterial({ color: 0xdc4a3d, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); this.tele.rotation.x = -Math.PI / 2; this.tele.visible = false; scene.add(this.tele); }
  canStagger() { return false; }
  get slamR() { return this.boss ? 3.5 : 2.8; }
  buildTree() { return sel(seq(cond(e => e.dist < (e.boss ? 3.1 : 2.5)), cooldown(2.0, act(e => e.slam()))), act(e => e.chase())); }
  slam() {
    sfx.windup(this.pos);
    this.busy = { kind: 'slam', t: 0, dur: this.boss ? 1.15 : 1.0,
      update: (e, dt, t) => { const k = t / e.busy.dur; e.armL.rotation.x = e.armR.rotation.x = -1.35 - k * 1.75; e.body.rotation.x = -k * 0.2; e.tele.visible = true; e.tele.position.set(e.pos.x, 0.05, e.pos.z); e.tele.scale.setScalar(e.slamR * (0.4 + 0.6 * k)); e.tele.material.opacity = 0.2 + k * 0.5; },
      done: e => {
        e.tele.visible = false; e.armL.rotation.x = e.armR.rotation.x = -0.4; e.body.rotation.x = 0.3;
        game.fx.ring(e.pos, e.slamR, 0xdc4a3d, 0.4); game.fx.burst(new V3(e.pos.x, 0.2, e.pos.z), 14, 'dust', 4); sfx.slam(e.pos);
        if (game.player) game.addShake(clamp(1 - Math.hypot(game.player.pos.x - e.pos.x, game.player.pos.z - e.pos.z) / 14, 0, 1) * 0.5);
        if (e.target && e.dist < e.slamR) { e.target.hurt(e.boss ? 40 : 30, e); const d = new V3(e.target.pos.x - e.pos.x, 0, e.target.pos.z - e.pos.z).normalize(); e.target.knock.addScaledVector(d, 9); }
        e.busy = { kind: 'recover', t: 0, dur: 0.55, update: (z, dt, t) => { const k = t / 0.55; z.armL.rotation.x = z.armR.rotation.x = -0.4 - k * 0.95; z.body.rotation.x = 0.3 * (1 - k); } };
      } };
    return S;
  }
  die(info) { this.tele.visible = false; super.die(info); }
  reset(p, o) { super.reset(p, o); this.tele.visible = false; }
}
class Exploder extends Enemy {
  buildTree() {
    return sel(
      seq(cond(e => e.dist < 1.9), act(e => e.detonate())),
      seq(cond(e => e.dist < 7.5), act(e => { if (!e.primed) { e.primed = true; sfx.hiss(e.pos); } return F; })),
      act(e => e.chase()));
  }
  canStagger(amount, info) { return (!this.busy || this.busy.kind !== 'detonate') && super.canStagger(amount, info); }
  detonate() {
    this.busy = { kind: 'detonate', t: 0, dur: 0.4, update: (e, dt, t) => { e.group.scale.setScalar(e.baseScale * (1 + t * 0.7)); e.setGlow(1, 0.7, 0.2); }, done: e => e.die({ source: 'self' }) };
    return S;
  }
  die(info) {
    if (!this.exploded) { this.exploded = true; super.die(info); this.group.visible = false; this.deathT = 3.3; game.explode(this.pos.clone(), this.boss ? 5 : 4.2, 42, 140, this); return; }
    super.die(info);
  }
  updateDeath(dt) { this.deathT += dt; if (this.deathT > 3.4) game.factory.release(this); }
}

class ZombieFactory {
  constructor() {
    this.classes = { walker: Walker, runner: Runner, tank: Tank, exploder: Exploder };
    this.pools = {};
    for (const k in this.classes) this.pools[k] = new ObjectPool(() => { const e = new this.classes[k](k); scene.add(e.group); return e; });
  }
  create(type, pos, opts = {}) { const e = this.pools[type].get(); e.reset(pos, opts); game.enemies.push(e); return e; }
  release(e) {
    if (!e.active) return; e.active = false; e.alive = false; e.group.visible = false; if (e.tele) e.tele.visible = false;
    const i = game.enemies.indexOf(e); if (i >= 0) game.enemies.splice(i, 1);
    this.pools[e.type].release(e);
  }
}

class WaveManager {
  start(n) {
    this.n = n; this.type = n % 5 === 0 ? 'boss' : n % 3 === 0 ? 'special' : 'normal';
    this.queue = this.compose(n); this.total = this.queue.length; this.spawnT = 1.2;
    this.maxAlive = Math.min(8 + n * 2, 30); this.interval = Math.max(0.3, 1.0 - n * 0.06);
    bus.emit('WaveStarted', { waveNo: n, type: this.type });
  }
  compose(n) {
    const q = [];
    if (n === 1) { for (let i = 0; i < 10; i++) q.push(['walker']); return q; }
    if (this.type === 'special') { const c = 8 + n * 3; for (let i = 0; i < c; i++) q.push([Math.random() < 0.7 ? 'runner' : 'walker']); return q; }
    const c = (this.type === 'boss' ? 6 + n * 2 : 7 + n * 3);
    for (let i = 0; i < c; i++) {
      const r = Math.random();
      q.push([n >= 4 && r < 0.08 ? 'tank' : n >= 3 && r < 0.22 ? 'exploder' : n >= 2 && r < 0.42 ? 'runner' : 'walker']);
    }
    if (n === 4) q.splice(3, 0, ['tank']);
    if (n === 3 && !q.some(x => x[0] === 'exploder')) q.splice(2, 0, ['exploder']);
    if (this.type === 'boss') q.splice(Math.floor(q.length / 3), 0, ['tank', { boss: true }]);
    return q;
  }
  pickSpawn() {
    const p = game.player.pos, fx = -Math.sin(game.player.yaw), fz = -Math.cos(game.player.yaw);
    const ok = s => { const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz); return d > 16 && d < 55 && (dx * fx + dz * fz) / d < 0.35; };
    let c = world.spawns.filter(ok); if (!c.length) c = world.spawns.filter(s => s.distanceTo(p) > 14); if (!c.length) c = world.spawns;
    const s = pickOne(c); return new V3(s.x + rand(-1, 1), 0, s.z + rand(-1, 1));
  }
  update(dt) {
    if (!this.queue.length) return;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && game.aliveCount() < this.maxAlive) {
      this.spawnT = this.interval;
      const [type, extra] = this.queue.shift();
      const e = game.factory.create(type, this.pickSpawn(), Object.assign({ hpMul: 1 + 0.07 * (this.n - 1) }, extra));
      if (e.boss) game.boss = e;
      if (TIPS[type] && !game.seen.has(type)) { game.seen.add(type); hud.toast(`<b>新威脅：${TIPS[type][0]}</b>　${TIPS[type][1]}`, 6); }
    }
  }
  get remaining() { return this.queue.length + game.aliveCount(); }
  get done() { return this.queue.length === 0 && game.aliveCount() === 0; }
}

/* ---------- 局內升級 ---------- */
class Upgrade {
  constructor(def) { this.def = def; this.subs = []; }
  apply(p) { this.player = p; this.onApply(p); }
  remove() { this.subs.forEach(off => off()); this.subs = []; this.onRemove(this.player); }
  on(type, fn) { this.subs.push(bus.on(type, fn)); }
  onApply() {} onRemove() {}
}
class ModifierUpgrade extends Upgrade {
  onApply(p) { p.damageChain.add(this); }
  onRemove(p) { p.damageChain.remove(this); }
}
class Incendiary extends Upgrade { onApply() { this.on('EnemyHit', e => { if (e.source === 'bullet') e.enemy.ignite(3); }); } }
class Wildfire extends Upgrade { onApply() { this.on('EnemyKilled', e => { if (e.wasBurning) { game.enemiesNear(e.pos, 4).forEach(z => z.ignite(4)); game.fx.ring(e.pos, 4, 0xff7a2a, 0.35); } }); } }
class Pyromaniac extends ModifierUpgrade { constructor(d) { super(d); this.priority = 20; } modify(c) { if (c.enemy.burn > 0) c.mult *= 1.4; } }
class Marksman extends ModifierUpgrade { constructor(d) { super(d); this.priority = 10; } modify(c) { if (c.headshot) c.mult *= 1.75; } }
class PrecisionResupply extends Upgrade { onApply(p) { this.on('EnemyKilled', e => { if (e.isHeadshot && e.source === 'bullet') { const w = p.weapon; w.ammo = Math.min(w.mag, w.ammo + Math.ceil(w.mag * 0.25)); } }); } }
class Steady extends Upgrade { onApply(p) { p.flags.steady = true; } onRemove(p) { p.flags.steady = false; } }
class ReloadShock extends Upgrade {
  onApply(p) { this.on('Reloaded', () => { game.fx.ring(p.pos, 4.5, 0x82b5dc, 0.4); game.enemiesNear(p.pos, 4.5).forEach(z => { const d = new V3(z.pos.x - p.pos.x, 0, z.pos.z - p.pos.z).normalize(); z.takeDamage(15, { source: 'shock', dir: d, knock: 9 }); }); }); }
}
class Adrenaline extends Upgrade { onApply(p) { this.on('EnemyKilled', () => { p.speedBoost = 2; }); } }
class ThickSkin extends Upgrade { onApply(p) { p.maxHp += 30; p.hp += 30; } onRemove(p) { p.maxHp -= 30; p.hp = Math.min(p.hp, p.maxHp); } }
class HollowPoint extends ModifierUpgrade { constructor(d) { super(d); this.priority = 30; } modify(c) { if (c.enemy.hp > c.enemy.maxHp * 0.7) c.mult *= 1.3; } }
class Greed extends Upgrade { onApply(p) { this.on('EnemyKilled', e => { if (e.isHeadshot && e.source === 'bullet') p.money += 10; }); } }

const SCHOOL = { 火焰: 'var(--blood)', 精準: 'var(--cold)', 通用: 'var(--ink)', 生存: 'var(--moss)' };
const RARITY = {
  common: { name: '普通', weight: 60, color: 'var(--dim)' },
  rare: { name: '稀有', weight: 30, color: 'var(--cold)' },
  legendary: { name: '傳說', weight: 10, color: 'var(--hazard)' }
};
const UPGRADE_DEFS = [
  { id: 'incendiary', name: '燃燒彈', school: '火焰', kind: '事件觸發', rarity: 'rare', cls: Incendiary, desc: '子彈命中會讓殭屍燃燒 3 秒，持續受到傷害。' },
  { id: 'wildfire', name: '火勢蔓延', school: '火焰', kind: '事件觸發', rarity: 'legendary', cls: Wildfire, desc: '燃燒中的殭屍死亡時，點燃周圍 4 公尺內的殭屍。' },
  { id: 'pyromaniac', name: '縱火狂', school: '火焰', kind: '被動修正', rarity: 'rare', cls: Pyromaniac, desc: '對燃燒中的目標傷害 +40%。' },
  { id: 'marksman', name: '神射手', school: '精準', kind: '被動修正', rarity: 'legendary', cls: Marksman, desc: '爆頭傷害再乘以 1.75 倍。' },
  { id: 'resupply', name: '精準補給', school: '精準', kind: '事件觸發', rarity: 'rare', cls: PrecisionResupply, desc: '爆頭擊殺時，回填目前武器 25% 彈匣。' },
  { id: 'steady', name: '冷靜', school: '精準', kind: '被動修正', rarity: 'common', cls: Steady, desc: '站定不動時，後座力降低 60%。' },
  { id: 'hollow', name: '空尖彈', school: '精準', kind: '被動修正', rarity: 'common', cls: HollowPoint, desc: '對血量 70% 以上的目標傷害 +30%。' },
  { id: 'shock', name: '換彈衝擊', school: '通用', kind: '事件觸發', rarity: 'rare', cls: ReloadShock, desc: '換彈完成時擊退 4.5 公尺內的殭屍並造成傷害。' },
  { id: 'greed', name: '賞金獵人', school: '通用', kind: '事件觸發', rarity: 'common', cls: Greed, desc: '每次爆頭擊殺多拿 $10。' },
  { id: 'adrenaline', name: '腎上腺素', school: '生存', kind: '事件觸發', rarity: 'common', cls: Adrenaline, desc: '每次擊殺後 2 秒內移動速度 +30%。' },
  { id: 'thickskin', name: '厚皮', school: '生存', kind: '被動修正', rarity: 'common', cls: ThickSkin, desc: '最大生命 +30，並立刻回復 30。' }
];
const UpgradeFactory = { create(def) { return new def.cls(def); } };

// Strategy：依稀有度權重抽出 k 個不重複的項目
class LootTable {
  constructor(defs, rarity) { this.defs = defs; this.rarity = rarity; }
  draw(k, excludeIds) {
    const pool = this.defs.filter(d => !excludeIds.has(d.id)), out = [];
    while (out.length < k && pool.length) {
      const tiers = Object.keys(this.rarity).filter(r => pool.some(d => d.rarity === r));
      let roll = Math.random() * tiers.reduce((s, r) => s + this.rarity[r].weight, 0), tier = tiers[0];
      for (const r of tiers) { roll -= this.rarity[r].weight; if (roll <= 0) { tier = r; break; } }
      const cands = pool.filter(d => d.rarity === tier), d = pickOne(cands);
      out.push(d); pool.splice(pool.indexOf(d), 1);
    }
    return out;
  }
}
class UpgradeSet {
  constructor() { this.items = []; }
  ownedIds() { return new Set(this.items.map(u => u.def.id)); }
  grant(def, player) { const u = UpgradeFactory.create(def); u.apply(player); this.items.push(u); bus.emit('UpgradePicked', { clientId: 0, upgradeId: def.id, name: def.name }); }
  clear() { this.items.forEach(u => u.remove()); this.items = []; }
}

