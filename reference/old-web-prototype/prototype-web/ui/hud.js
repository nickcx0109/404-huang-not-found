'use strict';
/* ---------- HUD 與畫面 ---------- */
const LOGGED = {
  WaveStarted: p => ['k-wave', `(${p.waveNo}, ${p.type})`],
  WaveCleared: p => ['k-wave', `(${p.waveNo})`],
  EnemyKilled: p => ['k-kill', `(${p.type}${p.boss ? '·boss' : ''}, killer=0, headshot=${p.isHeadshot}${p.source === 'self' ? ', self' : ''})`],
  PlayerDamaged: p => ['k-hurt', `(0, ${p.amount.toFixed(0)}, hpLeft=${p.hpLeft.toFixed(0)})`],
  PlayerDowned: () => ['k-hurt', '(0)'],
  Reloaded: p => ['', `(0, ${p.weapon})`],
  UpgradePicked: p => ['k-up', `(0, ${p.upgradeId})`],
  WeaponUnlocked: p => ['k-up', `(${p.weapon})`],
  TokenCollected: p => ['k-shop', `(0, total=${p.total})`],
  ItemPurchased: p => ['k-shop', `(0, ${p.item}, $${p.price})`],
  GachaRolled: p => ['k-shop', `(0, [${p.results.join(', ')}])`],
  GameOver: p => ['k-hurt', `(wave=${p.wave}, kills=${p.kills})`]
};
class Minimap {
  constructor(el) {
    this.el = el; this.ctx = el.getContext('2d'); this.S = el.width; this.k = this.S / (world.half * 2); this.t = 0;
    this.bg = document.createElement('canvas'); this.bg.width = this.bg.height = this.S;
    const x = this.bg.getContext('2d'), k = this.k, h = world.half;
    x.fillStyle = 'rgba(44,48,54,.9)'; x.fillRect(0, 0, this.S, this.S);
    x.fillStyle = 'rgba(152,160,170,.55)';
    world.obstacles.forEach(o => { if (o.maxX - o.minX > 80 || o.maxZ - o.minZ > 80) return; x.fillStyle = o.store ? 'rgba(95,227,208,.9)' : 'rgba(152,160,170,.5)'; x.fillRect((o.minX + h) * k, (o.minZ + h) * k, Math.max(2, (o.maxX - o.minX) * k), Math.max(2, (o.maxZ - o.minZ) * k)); });
    x.font = `600 ${Math.round(this.S * 0.04)}px "Noto Sans TC",sans-serif`; x.fillStyle = 'rgba(236,231,219,.55)'; x.textAlign = 'center';
    world.zones.slice(1).forEach(z => x.fillText(z.name, (z.x + z.w / 2 + h) * k, (z.z + z.d / 2 + h) * k));
  }
  draw(dt) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.08;
    const x = this.ctx, k = this.k, h = world.half, p = game.player;
    x.clearRect(0, 0, this.S, this.S); x.drawImage(this.bg, 0, 0);
    if (game.storeOpen) { x.strokeStyle = 'rgba(95,227,208,' + (0.5 + 0.5 * Math.sin(game.time * 5)) + ')'; x.lineWidth = 3; x.strokeRect((-9 + h) * k - 3, (-6 + h) * k - 3, 18 * k + 6, 12 * k + 6); }
    x.fillStyle = '#ffc94a'; game.pickups.items.forEach(o => { x.beginPath(); x.arc((o.pos.x + h) * k, (o.pos.z + h) * k, 3.5, 0, 7); x.fill(); });
    game.enemies.forEach(e => { if (!e.alive) return; x.fillStyle = e.type === 'tank' ? '#ff6a5a' : '#dc4a3d'; x.beginPath(); x.arc((e.pos.x + h) * k, (e.pos.z + h) * k, e.type === 'tank' ? 4.5 : 3, 0, 7); x.fill(); });
    const px = (p.pos.x + h) * k, pz = (p.pos.z + h) * k, a = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw));
    x.save(); x.translate(px, pz); x.rotate(a); x.fillStyle = '#ece7db'; x.beginPath(); x.moveTo(9, 0); x.lineTo(-6, 6); x.lineTo(-3, 0); x.lineTo(-6, -6); x.closePath(); x.fill(); x.restore();
  }
}
class Hud {
  constructor() {
    const ids = ['score', 'kills', 'heads', 'money', 'tokens', 'tokenNum', 'waveNo', 'waveType', 'waveLine', 'remain', 'storeDir', 'storeArrow', 'storeDist', 'bossbar', 'bossFill', 'hpNum', 'hpFill', 'hpRow', 'armorRow', 'armorFill', 'mag', 'res', 'reloadFill', 'slots', 'ups', 'cross', 'hitm', 'prompt', 'banner', 'bTitle', 'bSub', 'toast', 'vig', 'log', 'logLines', 'shopTime', 'shopMoney'];
    this.el = {}; ids.forEach(i => { this.el[i] = $('#' + i); });
    this.cache = {}; this.lines = []; this.bannerT = 0; this.toastT = 0; this.mini = new Minimap($('#mini'));
    let showLog = store.get('zwp.log', true); this.el.log.hidden = !showLog;
    this.toggleLog = () => { showLog = !showLog; this.el.log.hidden = !showLog; store.set('zwp.log', showLog); };
    bus.onAny((type, p) => {
      if (!game.inRun && type !== 'GameOver') return;
      const f = LOGGED[type]; if (!f) return;
      const [cls, args] = f(p); this.lines.push(`<div class="${cls}"><span class="t">${game.time.toFixed(1)}</span><b>${type}</b>${args}</div>`);
      if (this.lines.length > 9) this.lines.shift(); this.el.logLines.innerHTML = this.lines.join('');
    });
    bus.on('WaveStarted', p => {
      const label = { normal: '普通波', special: '衝刺波', boss: 'Boss 波' }[p.type];
      const sub = { normal: '撐過這一波', special: '大量快速殭屍，注意尖叫聲', boss: '巨型坦克出現，集火並保持距離' }[p.type];
      this.el.waveNo.textContent = String(p.waveNo).padStart(2, '0'); this.el.waveType.textContent = label; this.el.waveType.className = p.type;
      this.banner(`第 ${p.waveNo} 波`, sub, 2.2); sfx.wave();
    });
    bus.on('WaveCleared', () => { this.el.waveType.textContent = '交易時間'; this.el.waveType.className = 'trade'; });
    bus.on('UpgradePicked', () => this.renderUps());
  }
  resetRun() { this.lines = []; this.el.logLines.innerHTML = ''; this.renderUps(); this.cache = {}; }
  renderUps() { this.el.ups.innerHTML = game.upgrades.items.map(u => `<span class="upchip" style="--c:${SCHOOL[u.def.school]}">${u.def.name}</span>`).join(''); }
  bumpTokens() { const t = this.el.tokens; t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }
  banner(t, s, dur = 2) { this.el.bTitle.textContent = t; this.el.bSub.textContent = s; this.el.banner.classList.add('show'); this.bannerT = dur; }
  toast(html, dur = 4) { this.el.toast.innerHTML = html; this.el.toast.classList.add('show'); this.toastT = dur; }
  hitmarker(head, kill) { const h = this.el.hitm; h.className = ''; void h.offsetWidth; h.className = 'go' + (kill ? ' kill' : head ? ' head' : ''); }
  frame(dt) {
    this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show');
    const p = game.player; if (!p || !game.players.length) return;
    const s = game.score, w = p.weapon, st = game.fsm.state, breakT = st instanceof WaveBreakState ? Math.max(0, Math.ceil(st.t)) : null;
    this.set('score', s.score, v => this.el.score.textContent = v.toLocaleString());
    this.set('kills', s.kills, v => this.el.kills.textContent = v);
    this.set('heads', s.heads, v => this.el.heads.textContent = v);
    this.set('money', p.money, v => { this.el.money.textContent = '$' + v.toLocaleString(); this.el.shopMoney.textContent = '$' + v.toLocaleString(); if (ui.shopOpen) ui.renderShop(); });
    this.set('tokens', p.tokens, v => this.el.tokenNum.textContent = `抽獎幣 ×${v}`);
    this.set('waveLine', breakT === null ? 'r' + game.wave.remaining : 'b' + breakT, () => {
      this.el.waveLine.innerHTML = breakT === null ? `剩餘 <b>${game.wave.remaining || 0}</b>` : `下一波 <b>${breakT}</b> 秒 · 按 <b>G</b> 提早開始`;
      this.el.shopTime.textContent = breakT === null ? 0 : breakT;
    });
    const showDir = breakT !== null && !p.downed;
    this.el.storeDir.hidden = !showDir;
    if (showDir) {
      const c = world.counterPos, dx = c.x - p.pos.x, dz = c.z - p.pos.z, d = Math.hypot(dx, dz);
      const inside = Math.abs(p.pos.x) < 9 && Math.abs(p.pos.z) < 6;
      const rel = Math.atan2(dx, -dz) + p.yaw;
      this.el.storeArrow.style.transform = `rotate(${rel.toFixed(3)}rad)`;
      this.set('storeDist', inside ? 'in' : Math.round(d), v => { this.el.storeDist.textContent = v === 'in' ? '你在商店裡' : `商店 ${v}m`; });
    }
    const hp = Math.ceil(p.hp);
    this.set('hp', hp + '/' + p.maxHp, () => { this.el.hpNum.textContent = hp; this.el.hpFill.style.transform = `scaleX(${p.hp / p.maxHp})`; this.el.hpRow.classList.toggle('low', p.hp / p.maxHp < 0.35); });
    this.set('armor', Math.ceil(p.armor), v => { this.el.armorRow.hidden = v <= 0; this.el.armorFill.style.transform = `scaleX(${v / 100})`; });
    this.set('ammo', w.key + w.ammo + '/' + w.reserve, () => { this.el.mag.textContent = w.ammo; this.el.mag.classList.toggle('empty', w.ammo === 0); this.el.res.textContent = w.reserve === Infinity ? '∞' : w.reserve; });
    this.el.reloadFill.style.transform = `scaleX(${w.reloading > 0 ? 1 - w.reloading / w.reloadTime : 0})`;
    this.set('slots', p.cur + '|' + p.owned.join(), () => { this.el.slots.innerHTML = p.weapons.map((x, i) => `<span class="slot${i === p.cur ? ' on' : ''}${p.owned[i] ? '' : ' locked'}"><kbd>${i + 1}</kbd>${p.owned[i] ? x.name : x.name + '（未購買）'}</span>`).join(''); });
    const b = game.boss; this.el.bossbar.hidden = !b;
    if (b) this.el.bossFill.style.transform = `scaleX(${Math.max(0, b.hp / b.maxHp)})`;
    const f = game.focus, pr = f && !game.picking ? f.prompt(p) : null;
    this.set('prompt', pr ? pr.join('|') : '', () => { this.el.prompt.hidden = !pr; if (pr) { this.el.prompt.className = pr[0]; this.el.prompt.innerHTML = pr[1]; } });
    const gap = 7 + w.spreadNow(p) * 520 + p.gunKick * 6; this.el.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    this.el.cross.style.opacity = p.downed ? 0 : 1;
    this.el.vig.style.opacity = clamp(p.hurtFlash * 0.8 + (1 - p.hp / p.maxHp) * 0.45, 0, 1).toFixed(3);
    this.mini.draw(dt);
  }
}

const ui = {
  screens: ['menu', 'pick', 'over', 'pause', 'shop'],
  shopOpen: false,
  show(id) { this.screens.forEach(s => { $('#' + s).hidden = s !== id; }); $('#hud').hidden = id === 'menu'; this.shopOpen = id === 'shop'; if (id !== 'pick') this.pickCb = null; },
  syncSettings() { $('#sensRange').value = settings.sens; $('#sensOut').textContent = settings.sens.toFixed(2) + '×'; },
  refreshBest() { const b = store.get('zwp.best', null); $('#bestLine').innerHTML = b && b.wave ? `最佳紀錄：撐過 <b>${b.wave}</b> 波 · <b>${b.score.toLocaleString()}</b> 分` : '還沒有紀錄'; },
  showShop() { this.show('shop'); this.renderShop(); },
  renderShop() {
    const p = game.player;
    $('#shopMoney').textContent = '$' + p.money.toLocaleString();
    $('#shopItems').innerHTML = game.shop.items.map((it, i) => {
      const st = it.state(p), price = it.price(p);
      return `<button class="item${st.ok ? '' : ' no'}" type="button" data-i="${i}"><kbd>${i + 1}</kbd><span class="nm">${it.name}</span><span class="pr">${price > 0 ? '$' + price : '—'}${st.ok ? '' : `<small>${st.why}</small>`}</span><span class="ds">${it.desc}</span></button>`;
    }).join('');
  },
  buy(i) { const it = game.shop.items[i]; if (!it) return; game.shop.buy(it, game.player); this.renderShop(); },
  closeShop(relock = true) { if (!this.shopOpen) return; game.closeOverlay(null, relock); },
  showPick(n, opts, cb) {
    this.pickOpts = opts; $('#pickEyebrow').textContent = `抽獎機 · 這一局第 ${n} 次`;
    $('#cards').innerHTML = opts.map((d, i) => `<button class="card" type="button" data-i="${i}" data-rarity="${d.rarity}"><kbd>${i + 1}</kbd><span class="tags"><span class="chip" style="--c:${RARITY[d.rarity].color}">${RARITY[d.rarity].name}</span><span class="chip" style="--c:${SCHOOL[d.school]}">${d.school}</span><span class="kind">${d.kind}</span></span><h3>${d.name}</h3><p>${d.desc}</p><code>${d.cls.name} extends ${Object.getPrototypeOf(d.cls).name}</code></button>`).join('');
    this.show('pick'); this.pickCb = cb;
  },
  choose(i) { const cb = this.pickCb; if (!cb) return; this.pickCb = null; cb(i === -1 ? null : this.pickOpts[i]); },
  showOver(s, isBest, best) {
    $('#oWave').textContent = s.wave; $('#oKills').textContent = s.kills; $('#oHead').textContent = s.kills ? Math.round(s.heads / s.kills * 100) + '%' : '0%'; $('#oScore').textContent = s.score.toLocaleString();
    $('#overSub').textContent = `第 ${s.wave + 1} 波倒地。正式版要三個人都倒地才會結束，隊友可以把你救起來。`;
    $('#overBest').innerHTML = isBest ? '新的最佳紀錄' : `最佳紀錄：撐過 <b>${best.wave}</b> 波 · <b>${best.score.toLocaleString()}</b> 分`;
    this.show('over');
  }
};

