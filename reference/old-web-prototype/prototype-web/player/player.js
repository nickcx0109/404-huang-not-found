'use strict';
/* =========================================================
   A：玩家與武器
   ========================================================= */
class HitscanFire {
  fire(weapon, owner) {
    const res = { hit: false, head: false, kill: false };
    for (let i = 0; i < weapon.pellets; i++) {
      const s = weapon.spreadNow(owner);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s;
      const r1 = game.hitscan(Math.cos(a) * r, Math.sin(a) * r, weapon);
      if (r1) { res.hit = true; res.head = res.head || r1.head; res.kill = res.kill || r1.kill; }
    }
    return res;
  }
}

// Template Method：開火流程固定，細節交給子類別
class Weapon {
  constructor(o) { Object.assign(this, { pellets: 1, knock: 1.4, ammoUnit: 0, fireMode: new HitscanFire() }, o); this.ammo = this.mag; this.reserveMax = this.reserve; this.cool = 0; this.reloading = 0; this.heat = 0; }
  refill() { this.ammo = this.mag; this.reserve = this.reserveMax; }
  tryFire(owner) {
    if (this.reloading > 0 || this.cool > 0 || owner.swapT > 0) return false;
    if (this.ammo <= 0) { sfx.empty(); this.startReload(); this.cool = 0.25; return false; }
    this.ammo--; this.cool = this.rate;
    sfx.shot(this.key);
    const res = this.fireMode.fire(this, owner);
    this.applyRecoil(owner);
    game.feedback(res);
    owner.muzzleFlash();
    bus.emit('WeaponFired', { clientId: 0, weapon: this.key });
    if (this.ammo === 0) this.startReload();
    return true;
  }
  spreadNow(owner) { return this.spread * (1 + this.heat) * (owner.moving ? 1.7 : 1) * (owner.onGround ? 1 : 2.2); }
  applyRecoil(owner) {
    const calm = owner.flags.steady && !owner.moving ? 0.4 : 1;
    owner.recoilKick += this.recoil * calm; owner.yaw += rand(-1, 1) * this.recoil * 0.35 * calm;
    owner.gunKick = 1; this.heat = Math.min(this.heat + this.heatPerShot, 2.5);
  }
  startReload() {
    if (this.reloading > 0 || this.ammo === this.mag || this.reserve <= 0) return;
    this.reloading = this.reloadTime; sfx.reload();
  }
  update(dt) {
    this.cool -= dt; this.heat = Math.max(0, this.heat - dt * 3.2);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const take = Math.min(this.mag - this.ammo, this.reserve);
        this.ammo += take; if (this.reserve !== Infinity) this.reserve -= take;
        sfx.reloaded(); bus.emit('Reloaded', { clientId: 0, weapon: this.key });
      }
    }
  }
}
class Pistol extends Weapon { constructor() { super({ key: 'pistol', name: '手槍', dmg: 34, rate: 0.16, mag: 12, reserve: Infinity, reloadTime: 1.1, auto: false, spread: 0.004, heatPerShot: 0.5, recoil: 0.032, muzzle: -0.24 }); } }
class Rifle extends Weapon { constructor() { super({ key: 'rifle', name: '步槍', dmg: 24, rate: 0.095, mag: 30, reserve: 210, reloadTime: 1.7, auto: true, spread: 0.006, heatPerShot: 0.22, recoil: 0.016, muzzle: -0.7, ammoUnit: 0.5 }); } }
class Shotgun extends Weapon { constructor() { super({ key: 'shotgun', name: '霰彈槍', dmg: 15, pellets: 9, knock: 1.1, rate: 0.85, mag: 6, reserve: 36, reloadTime: 2.1, auto: false, spread: 0.065, heatPerShot: 0, recoil: 0.085, muzzle: -0.72, ammoUnit: 3 }); } }

function buildGunModel(kind) {
  const g = new THREE.Group();
  const b = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); g.add(m); return m; };
  if (kind === 'pistol') { b(0.06, 0.08, 0.26, 0x4a4f58, 0, 0, -0.1); b(0.055, 0.14, 0.07, 0x23262c, 0, -0.1, -0.01).rotation.x = 0.2; b(0.012, 0.02, 0.02, 0xf0a23b, 0, 0.05, -0.21); }
  if (kind === 'rifle') { b(0.07, 0.1, 0.5, 0x2a2d33, 0, 0, -0.2); b(0.03, 0.03, 0.26, 0x4a4f58, 0, 0.01, -0.57); b(0.05, 0.17, 0.08, 0x4a4f58, 0, -0.13, -0.17).rotation.x = -0.25; b(0.06, 0.09, 0.22, 0x2a2d33, 0, -0.01, 0.14); b(0.05, 0.13, 0.06, 0x23262c, 0, -0.1, -0.02); b(0.02, 0.03, 0.06, 0xf0a23b, 0, 0.07, -0.18); }
  if (kind === 'shotgun') { b(0.08, 0.1, 0.42, 0x2a2d33, 0, 0, -0.15); b(0.05, 0.05, 0.52, 0x4a4f58, 0, 0.025, -0.46); b(0.07, 0.06, 0.18, 0x6b4a2f, 0, -0.04, -0.42); b(0.065, 0.1, 0.24, 0x6b4a2f, 0, -0.03, 0.15); b(0.012, 0.02, 0.02, 0xf0a23b, 0, 0.06, -0.7); }
  return g;
}

class Player {
  constructor() {
    this.pos = new V3(); this.vel = new V3(); this.knock = new V3();
    this.view = new THREE.Group(); this.view.position.set(0.24, -0.22, -0.36); camera.add(this.view);
    this.models = { pistol: buildGunModel('pistol'), rifle: buildGunModel('rifle'), shotgun: buildGunModel('shotgun') };
    Object.values(this.models).forEach(m => { m.visible = false; this.view.add(m); });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.flash.visible = false; this.view.add(this.flash);
    this.light = new THREE.PointLight(0xffc070, 0, 9); this.light.position.set(0.2, -0.1, -0.9); camera.add(this.light);
    this.reset();
  }
  reset() {
    this.pos.set(0, 0, 15); this.vel.set(0, 0, 0); this.knock.set(0, 0, 0); this.y = 0; this.vy = 0; this.onGround = true;
    this.yaw = 0; this.pitch = 0; this.recoilKick = 0; this.gunKick = 0; this.bob = 0; this.swapT = 0; this.flashT = 0;
    this.maxHp = 100; this.hp = 100; this.armor = 0; this.downed = false; this.downT = 0; this.hurtFlash = 0; this.speedBoost = 0; this.moving = false;
    this.money = 250; this.tokens = 1;
    this.flags = {}; this.damageChain = new DamageChain();
    this.weapons = [new Pistol(), new Rifle(), new Shotgun()];
    this.owned = [true, false, false];
    this.cur = 0; this.showModel();
  }
  get weapon() { return this.weapons[this.cur]; }
  showModel() { Object.entries(this.models).forEach(([k, m]) => { m.visible = k === this.weapon.key; }); this.flash.position.set(0, 0.015, this.weapon.muzzle - 0.04); }
  switchTo(i) {
    if (i === this.cur || i < 0 || i >= this.weapons.length || !this.owned[i] || this.downed) return;
    this.weapon.reloading = 0; this.cur = i; this.swapT = 0.28; this.showModel();
  }
  cycle(dir) { let i = this.cur; for (let n = 0; n < 3; n++) { i = (i + dir + 3) % 3; if (this.owned[i]) { this.switchTo(i); return; } } }
  look(dx, dy) { const k = SENS.base * settings.sens; this.yaw -= dx * k; this.pitch = clamp(this.pitch - dy * k, -1.45, 1.45); }
  muzzleFlash() { this.flashT = 0.05; this.flash.rotation.z = Math.random() * Math.PI; }
  hurt(amount, src) {
    if (this.downed || !game.inRun) return;
    const absorb = Math.min(this.armor, amount * 0.75); this.armor -= absorb;
    this.hp = Math.max(0, this.hp - (amount - absorb)); this.hurtFlash = 1;
    game.addShake(0.1 + amount / 160); sfx.hurt();
    bus.emit('PlayerDamaged', { clientId: 0, amount, hpLeft: this.hp });
    if (this.hp <= 0) { this.downed = true; this.downT = 0; bus.emit('PlayerDowned', { clientId: 0 }); hud.banner('倒地', '正式版會由隊友按住互動鍵把你救起來，單人預覽就到這裡', 2.6); }
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  update(dt) {
    const w = this.weapon;
    if (this.downed) {
      this.downT += dt; const k = Math.min(this.downT / 0.8, 1);
      camera.position.set(this.pos.x, 1.6 - 1.15 * k, this.pos.z); camera.rotation.set(this.pitch * (1 - k) + 0.25 * k, this.yaw, 0.35 * k);
      this.view.position.y = -0.22 - 0.5 * k; camera.updateMatrixWorld(); return;
    }
    const f = (input.keys.KeyW ? 1 : 0) - (input.keys.KeyS ? 1 : 0), s = (input.keys.KeyD ? 1 : 0) - (input.keys.KeyA ? 1 : 0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s; const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    this.speedBoost = Math.max(0, this.speedBoost - dt);
    const sprint = input.keys.ShiftLeft || input.keys.ShiftRight;
    const speed = (sprint && f > 0 ? 7.6 : 5.0) * (this.speedBoost > 0 ? 1.3 : 1);
    const acc = 1 - Math.exp(-(this.onGround ? 14 : 3) * dt);
    this.vel.x += (wx * speed - this.vel.x) * acc; this.vel.z += (wz * speed - this.vel.z) * acc;
    this.pos.x += (this.vel.x + this.knock.x) * dt; this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    if (input.keys.Space && this.onGround) { this.vy = 7.2; this.onGround = false; }
    this.vy -= 22 * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    world.collide(this.pos, 0.4);
    const hs = Math.hypot(this.vel.x, this.vel.z); this.moving = hs > 0.8;
    if (this.onGround) this.bob += hs * dt * 1.9;
    this.swapT = Math.max(0, this.swapT - dt);
    w.update(dt);
    if (input.pressed || (input.down && w.auto)) w.tryFire(this);
    input.pressed = false;
    if (input.keys.KeyR) w.startReload();
    this.recoilKick *= Math.exp(-9 * dt); this.gunKick *= Math.exp(-16 * dt); this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
    const bobY = Math.sin(this.bob * 2) * 0.04 * Math.min(hs / 5, 1), bobX = Math.cos(this.bob) * 0.03 * Math.min(hs / 5, 1);
    const sh = game.shake * (REDUCED ? 0.15 : 1);
    camera.position.set(this.pos.x + rand(-sh, sh) * 0.3, 1.6 + this.y + bobY + rand(-sh, sh) * 0.3, this.pos.z + rand(-sh, sh) * 0.3);
    camera.rotation.set(this.pitch + this.recoilKick, this.yaw, rand(-sh, sh) * 0.04);
    const reloadDip = w.reloading > 0 ? Math.sin(Math.PI * (1 - w.reloading / w.reloadTime)) : 0;
    this.view.position.set(0.24 + bobX * 0.5, -0.22 + bobY * 0.5 - reloadDip * 0.12 - this.swapT * 0.9, -0.36 + this.gunKick * 0.07);
    this.view.rotation.set(this.gunKick * 0.12 - reloadDip * 0.6, 0, reloadDip * 0.35);
    this.flashT -= dt; this.flash.visible = this.flashT > 0; this.light.intensity = this.flashT > 0 ? 2.2 : 0;
    camera.updateMatrixWorld();
  }
}

/* ---------- 傷害修正鏈（責任鏈） ---------- */
class HeadshotRule { constructor() { this.priority = 0; } modify(c) { if (c.headshot) c.mult *= 2; } }
class DamageChain {
  constructor() { this.mods = [new HeadshotRule()]; }
  add(m) { this.mods.push(m); this.mods.sort((a, b) => a.priority - b.priority); }
  remove(m) { this.mods = this.mods.filter(x => x !== m); }
  apply(ctx) { for (const m of this.mods) m.modify(ctx); return ctx.base * ctx.mult; }
}

