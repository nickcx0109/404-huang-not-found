'use strict';
/* =========================================================
   C：經濟、商店與互動
   ========================================================= */
// Observer：擊殺與清波發錢
class Economy {
  constructor() {
    bus.on('EnemyKilled', p => { if (!game.inRun || p.source === 'self') return; const c = Math.round(ENEMY_DEFS[p.type].cash * (p.isHeadshot ? 1.5 : 1) * (p.boss ? 5 : 1)); game.player.money += c; });
    bus.on('WaveCleared', p => { if (game.inRun) game.player.money += 100 + 30 * p.waveNo; });
  }
}
// Observer：擊殺後依機率掉落抽獎幣
class TokenDropper {
  constructor() {
    bus.on('EnemyKilled', p => {
      if (!game.inRun) return;
      const n = p.boss ? 2 : Math.random() < ENEMY_DEFS[p.type].drop ? 1 : 0;
      for (let i = 0; i < n; i++) game.pickups.spawn(p.pos.clone().add(new V3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))));
    });
  }
}
class PickupManager {
  constructor() {
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 20), mat = new THREE.MeshLambertMaterial({ color: 0xffc94a, emissive: 0x7a4a00 });
    this.items = [];
    this.pool = new ObjectPool(() => { const m = new THREE.Mesh(geo, mat.clone()); m.rotation.x = Math.PI / 2; scene.add(m); return { m, pos: new V3(), life: 0 }; }, o => { o.m.visible = true; }, o => { o.m.visible = false; });
  }
  spawn(pos) { const o = this.pool.get(); o.pos.copy(pos); o.life = 30; o.t = Math.random() * 6; this.items.push(o); }
  clear() { this.items.forEach(o => this.pool.release(o)); this.items = []; }
  update(dt, p) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const o = this.items[i]; o.life -= dt; o.t += dt;
      o.m.position.set(o.pos.x, 0.7 + Math.sin(o.t * 3) * 0.12, o.pos.z); o.m.rotation.z = o.t * 3;
      o.m.visible = o.life > 5 || Math.sin(o.t * 18) > 0;
      if (p && !p.downed && Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z) < 1.6) {
        p.tokens++; sfx.coin(); game.fx.burst(new V3(o.pos.x, 0.8, o.pos.z), 8, 'coin', 2.5); hud.bumpTokens();
        bus.emit('TokenCollected', { clientId: 0, total: p.tokens });
        this.pool.release(o); this.items.splice(i, 1); continue;
      }
      if (o.life <= 0) { this.pool.release(o); this.items.splice(i, 1); }
    }
  }
}

// Command：每個商品自己知道能不能買、買了會發生什麼
class ShopItem {
  constructor(o) { Object.assign(this, o); }
  price() { return this.cost; }
  check(p) { return null; }
  state(p) { const why = this.check(p); if (why) return { ok: false, why }; if (p.money < this.price(p)) return { ok: false, why: '錢不夠' }; return { ok: true }; }
  execute(p) {}
}
class WeaponItem extends ShopItem {
  check(p) { if (p.owned[this.slot]) return '已擁有'; if (this.metaKey && !store.get('zwp.meta', {})[this.metaKey]) return '撐過第 3 波後上架'; return null; }
  execute(p) { p.owned[this.slot] = true; p.weapons[this.slot].refill(); p.switchTo(this.slot); }
}
class AmmoItem extends ShopItem {
  price(p) { return p.weapons.reduce((s, w, i) => s + (p.owned[i] && w.reserve !== Infinity ? Math.ceil((w.reserveMax - w.reserve) * w.ammoUnit) : 0), 0); }
  check(p) { return this.price(p) <= 0 ? (p.owned[1] || p.owned[2] ? '彈藥已滿' : '手槍彈藥無限') : null; }
  execute(p) { p.weapons.forEach((w, i) => { if (p.owned[i] && w.reserve !== Infinity) w.reserve = w.reserveMax; }); }
}
class ArmorItem extends ShopItem { check(p) { return p.armor >= 100 ? '護甲已滿' : null; } execute(p) { p.armor = Math.min(100, p.armor + 50); } }
class MedkitItem extends ShopItem { check(p) { return p.hp >= p.maxHp ? '生命已滿' : null; } execute(p) { p.heal(50); } }
class TokenItem extends ShopItem { price() { return this.cost + 100 * game.tokenBuys; } execute(p) { p.tokens++; game.tokenBuys++; hud.bumpTokens(); } }

class TraderShop {
  constructor() {
    this.items = [
      new WeaponItem({ id: 'rifle', name: '步槍', desc: '全自動，30 發彈匣，附 210 發備彈', cost: 450, slot: 1 }),
      new WeaponItem({ id: 'shotgun', name: '霰彈槍', desc: '近距離 9 顆彈丸，附 36 發備彈', cost: 700, slot: 2, metaKey: 'shotgun' }),
      new AmmoItem({ id: 'ammo', name: '補滿彈藥', desc: '已擁有槍枝的備彈全部補滿，價格依缺少的量計算', cost: 0 }),
      new ArmorItem({ id: 'armor', name: '護甲 +50', desc: '吸收 75% 傷害直到耗盡，上限 100', cost: 250 }),
      new MedkitItem({ id: 'medkit', name: '急救包', desc: '立刻回復 50 生命', cost: 150 }),
      new TokenItem({ id: 'token', name: '抽獎幣', desc: '投進抽獎機抽升級，每買一枚漲 $100', cost: 400 })
    ];
  }
  buy(item, p) {
    const st = item.state(p); if (!st.ok) { sfx.deny(); return false; }
    const price = item.price(p); p.money -= price; item.execute(p); sfx.buy();
    bus.emit('ItemPurchased', { clientId: 0, item: item.id, price });
    return true;
  }
}

// 互動介面：靠近時顯示提示，按 E 呼叫 interact
class Interactable {
  constructor(pos, radius) { this.pos = pos; this.radius = radius; }
  inRange(p) { return Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < this.radius; }
  prompt() { return ''; }
  interact() {}
  update() {}
}
class TraderCounter extends Interactable {
  prompt() { return game.storeOpen ? ['', '<kbd>E</kbd>打開交易站'] : ['off', '櫃台在波次之間才營業']; }
  interact() { if (!game.storeOpen) { sfx.deny(); return; } game.openOverlay(); ui.showShop(); }
}
class GachaMachine extends Interactable {
  constructor(pos, radius) { super(pos, radius); this.state = 'idle'; this.t = 0; this.rolls = 0; }
  prompt(p) {
    if (this.state === 'rolling') return ['', '抽獎中…'];
    if (!game.storeOpen) return ['off', '抽獎機在波次之間才能用'];
    if (p.tokens <= 0) return ['off', '沒有抽獎幣。打怪會掉，也可以在櫃台買'];
    return ['', `<kbd>E</kbd>投入抽獎幣（持有 ${p.tokens}）`];
  }
  interact(p) {
    if (this.state !== 'idle' || !game.storeOpen) { sfx.deny(); return; }
    if (p.tokens <= 0) { sfx.deny(); hud.toast('<b>沒有抽獎幣</b>　打殭屍有機率掉落，坦克和 Boss 掉得最多；也可以在櫃台買', 4); return; }
    const opts = game.loot.draw(3, game.upgrades.ownedIds());
    if (!opts.length) { hud.toast('<b>所有升級都拿到了</b>　抽獎幣先留著', 3); return; }
    p.tokens--; this.state = 'rolling'; this.t = 0; this.opts = opts; this.rolls++;
    bus.emit('GachaRolled', { clientId: 0, results: opts.map(o => o.id) });
  }
  update(dt) {
    const dome = world.machineDome.material;
    if (this.state === 'rolling') {
      this.t += dt; const step = Math.floor(this.t * 14);
      if (step !== this.lastStep) { this.lastStep = step; sfx.tick(step); dome.emissive.setHex([0xff4040, 0xffc040, 0x40ffd0, 0x4080ff][step % 4]); }
      if (this.t > 1.3) {
        this.state = 'idle'; const best = this.opts.some(o => o.rarity === 'legendary') ? 'legendary' : this.opts.some(o => o.rarity === 'rare') ? 'rare' : 'common';
        sfx.jackpot(best); game.fx.burst(new V3(this.pos.x + 0.8, 2.6, this.pos.z), 16, 'coin', 3);
        game.openOverlay(); ui.showPick(this.rolls, this.opts, def => game.closeOverlay(def));
      }
    } else {
      const k = game.storeOpen ? 0.35 + 0.25 * Math.sin(game.time * 3) : 0.05;
      dome.emissive.setRGB(k, k * 0.75, k * 0.3);
    }
  }
}

