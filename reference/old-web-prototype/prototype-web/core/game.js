'use strict';
/* =========================================================
   流程（State）
   ========================================================= */
class GameState { constructor(g) { this.g = g; } enter() {} exit() {} update() {} }
class LobbyState extends GameState {
  enter() {
    const g = this.g; g.inRun = false; g.players = []; g.setStoreOpen(true); ui.show('menu'); ui.refreshBest(); g.guide.setActive(false); g.pickups.clear();
    g.clearEnemies(); for (let i = 0; i < 14; i++) { const e = g.factory.create(pickOne(['walker', 'walker', 'runner', 'tank', 'exploder']), new V3(rand(-40, 40), 0, rand(-40, 40)), {}); e.spawnT = 1; world.collide(e.pos, e.radius); }
  }
  update(dt) {
    const g = this.g, a = g.time * 0.04;
    camera.position.set(Math.cos(a) * 34, 15, Math.sin(a) * 34); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
    for (let i = g.enemies.length - 1; i >= 0; i--) g.enemies[i].update(dt);
  }
}
class PlayingState extends GameState {
  constructor(g, n) { super(g); this.n = n; }
  enter() { ui.show(null); this.g.setStoreOpen(false); this.g.guide.setActive(false); this.g.wave.start(this.n); }
  update(dt) {
    const g = this.g; g.simulate(dt); g.wave.update(dt);
    if (g.player.downed) { if (g.player.downT > 2.8) g.fsm.set(new GameOverState(g)); }
    else if (g.wave.done) g.fsm.set(new WaveBreakState(g, this.n));
  }
}
class WaveBreakState extends GameState {
  constructor(g, n) { super(g); this.n = n; this.t = 45; }
  enter() {
    const g = this.g, p = g.player;
    bus.emit('WaveCleared', { waveNo: this.n });
    if (this.n >= 3 && !store.get('zwp.meta', {}).shotgun) { const m = store.get('zwp.meta', {}); m.shotgun = true; store.set('zwp.meta', m); bus.emit('WeaponUnlocked', { weapon: 'shotgun' }); setTimeout(() => hud.toast('<b>霰彈槍上架了</b>　之後每一局都能在交易站買到', 5), 2600); }
    g.setStoreOpen(true); g.guide.setActive(true); sfx.bell();
    hud.banner(`第 ${this.n} 波清除`, `交易站開門了，跟著地上的線走 · +$${100 + 30 * this.n}`, 2.6);
    if (p.tokens > 0) setTimeout(() => { if (g.fsm.state === this) hud.toast(`<b>你有 ${p.tokens} 枚抽獎幣</b>　商店裡的抽獎機可以抽升級`, 4); }, 2800);
  }
  exit() { this.g.guide.setActive(false); }
  update(dt) {
    const g = this.g; g.simulate(dt);
    if (g.player.downed) return;
    if (input.keys.KeyG && this.t > 3) this.t = 3;
    if (!g.picking) {
      const before = Math.ceil(this.t); this.t -= dt; const now = Math.ceil(this.t);
      if (now !== before && now > 0 && now <= 5) hud.banner(`下一波 ${now}`, now <= 3 ? '商店要關門了' : `第 ${this.n + 1} 波準備中`, 1.1);
      if (this.t <= 0 && g.machine.state !== 'rolling') g.fsm.set(new PlayingState(g, this.n + 1));
    }
  }
}
class GameOverState extends GameState {
  enter() {
    const g = this.g, s = g.score, best = store.get('zwp.best', { wave: 0, score: 0 });
    const isBest = s.wave > best.wave || (s.wave === best.wave && s.score > best.score);
    if (isBest) store.set('zwp.best', { wave: s.wave, score: s.score });
    bus.emit('GameOver', { wave: s.wave, kills: s.kills, score: s.score });
    g.inRun = false; input.down = false; g.picking = false;
    if (document.pointerLockElement) document.exitPointerLock();
    ui.showOver(s, isBest, best);
  }
  update(dt) { this.g.simulate(dt, true); }
}
class GameManager { set(s) { if (this.state) this.state.exit(); this.state = s; s.enter(); } update(dt) { this.state.update(dt); } }

class ScoreKeeper {
  constructor() {
    this.reset();
    bus.on('EnemyKilled', p => { if (!game.inRun) return; if (p.source !== 'self') { this.kills++; if (p.isHeadshot) this.heads++; this.score += Math.round(ENEMY_DEFS[p.type].score * (p.isHeadshot ? 1.5 : 1) * (p.boss ? 4 : 1)); } });
    bus.on('WaveCleared', p => { this.score += 250 * p.waveNo; this.wave = p.waveNo; });
  }
  reset() { this.score = 0; this.kills = 0; this.heads = 0; this.wave = 0; }
}

class Game {
  constructor() {
    this.time = 0; this.enemies = []; this.players = []; this.shake = 0; this.inRun = false; this.paused = false; this.picking = false;
    this.locked = false; this.noLock = false; this.seen = new Set(); this.boss = null; this.storeOpen = true; this.tokenBuys = 0; this.focus = null;
    this.fx = new Fx(); this.factory = new ZombieFactory(); this.flow = new FlowField(world); this.targetSelector = new NearestTarget();
    this.wave = new WaveManager(); this.upgrades = new UpgradeSet(); this.loot = new LootTable(UPGRADE_DEFS, RARITY); this.fsm = new GameManager();
    this.raycaster = new THREE.Raycaster(); this.flowT = 0;
    this.shop = new TraderShop(); this.pickups = new PickupManager(); this.guide = new StoreGuide(world);
    this.machine = new GachaMachine(new V3(6.4, 0, -3.6), 2.2);
    this.interactables = [new TraderCounter(world.counterPos, 2.6), this.machine];
  }
  aliveCount() { let n = 0; for (const e of this.enemies) if (e.alive) n++; return n; }
  enemiesNear(pos, r) { return this.enemies.filter(e => e.alive && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < r); }
  clearEnemies() { [...this.enemies].forEach(e => this.factory.release(e)); this.boss = null; }
  addShake(a) { this.shake = Math.max(this.shake, a); }
  setStoreOpen(o) { this.storeOpen = o; world.setStoreOpen(o); }
  newRun() {
    this.upgrades.clear(); this.clearEnemies(); this.pickups.clear(); this.player.reset(); this.score.reset(); this.seen.clear(); this.tokenBuys = 0; this.machine.rolls = 0;
    this.players = [this.player]; this.inRun = true; this.picking = false; this.paused = false; hud.resetRun();
    this.fsm.set(new PlayingState(this, 1));
  }
  openOverlay() { this.picking = true; input.down = false; input.pressed = false; input.keys = {}; if (document.pointerLockElement) document.exitPointerLock(); }
  closeOverlay(def, relock = true) {
    if (def) { this.upgrades.grant(def, this.player); sfx.pick(); }
    this.picking = false; ui.show(null);
    if (relock) this.requestLock();
    else if (!this.noLock) hud.toast('點一下畫面，重新鎖定滑鼠', 3);
  }
  requestLock() {
    if (this.noLock) return;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => this.lockFailed()); } catch (e) { this.lockFailed(); }
  }
  lockFailed() { if (this.noLock) return; this.noLock = true; hud.toast('<b>瀏覽器不允許鎖定滑鼠</b>　改成按住滑鼠拖曳來轉視角', 6); }
  tryInteract() { if (this.focus && !this.picking && !this.player.downed) this.focus.interact(this.player); }
  hitscan(ox, oy, weapon) {
    const origin = camera.getWorldPosition(new V3()), fwd = camera.getWorldDirection(new V3());
    const right = new V3().setFromMatrixColumn(camera.matrixWorld, 0), up = new V3().setFromMatrixColumn(camera.matrixWorld, 1);
    const dir = fwd.addScaledVector(right, ox).addScaledVector(up, oy).normalize();
    const rc = this.raycaster; rc.set(origin, dir); rc.far = 120;
    const targets = world.meshes.slice(); for (const e of this.enemies) if (e.alive) targets.push(...e.parts);
    const h = rc.intersectObjects(targets, false)[0];
    const end = h ? h.point : origin.clone().addScaledVector(dir, 120);
    const muzzle = this.player.view.localToWorld(new V3(0, 0.015, this.player.weapon.muzzle));
    this.fx.tracer(muzzle, end);
    if (h && h.object.userData.enemy) {
      const e = h.object.userData.enemy, head = h.object.userData.part === 'head';
      const ctx = { base: weapon.dmg, mult: 1, headshot: head, enemy: e, weapon };
      const amt = this.player.damageChain.apply(ctx);
      const kill = e.takeDamage(amt, { source: 'bullet', headshot: head, dir: new V3(dir.x, 0, dir.z).normalize(), knock: weapon.knock });
      this.fx.burst(h.point, head ? 9 : 4, 'blood', head ? 4 : 2.5);
      return { head, kill };
    }
    if (h) this.fx.burst(h.point, 3, 'spark', 2.5);
    return null;
  }
  feedback(res) {
    if (!res.hit) return;
    if (res.kill) sfx.kill(); if (res.head) sfx.headshot(); else sfx.hit();
    hud.hitmarker(res.head, res.kill);
  }
  explode(pos, r, playerMax, zMax, src) {
    this.fx.blast(pos, r); this.fx.ring(pos, r, 0xf0a23b, 0.5); this.fx.burst(new V3(pos.x, 1, pos.z), 26, 'fire', 7); sfx.boom(pos);
    const p = this.player;
    if (this.inRun && p && !p.downed) {
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < r) { p.hurt(playerMax * (1 - d / r) + 5, src); p.knock.add(new V3(p.pos.x - pos.x, 0, p.pos.z - pos.z).normalize().multiplyScalar(8)); }
      this.addShake(clamp(1 - d / 18, 0, 1) * 0.6);
    }
    for (const e of [...this.enemies]) {
      if (!e.alive || e === src) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < r) e.takeDamage(zMax * (1 - (d / r) * 0.6), { source: 'explosion', dir: new V3(e.pos.x - pos.x, 0, e.pos.z - pos.z).normalize(), knock: 7 });
    }
  }
  simulate(dt, frozenPlayer = false) {
    const p = this.player;
    if (!frozenPlayer && !this.picking) p.update(dt);
    this.flowT -= dt; if (this.flowT <= 0) { this.flowT = 0.2; this.flow.update(p.pos.x, p.pos.z); }
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; if (e) e.update(dt); }
    this.pickups.update(dt, this.inRun ? p : null);
    this.interactables.forEach(i => i.update(dt));
    this.focus = this.inRun && !p.downed ? this.interactables.find(i => i.inRange(p)) || null : null;
    this.guide.update(dt, p);
    this.shake *= Math.exp(-7 * dt);
    if (this.boss && !this.boss.alive) this.boss = null;
  }
}

