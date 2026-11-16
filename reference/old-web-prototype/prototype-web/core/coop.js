'use strict';

/* =========================================================
   多人同步（Host 權威）
   - Host（id 0）模擬殭屍、波次與流程，每 0.1 秒廣播一次快照。
   - 客戶端只模擬自己的玩家；殭屍是照快照擺動作的替身，
     打中時送「命中請求」給 Host，由 Host 扣血並宣布死亡。
   - 這個檔案在遊戲主程式之前載入，裡面用到的 game、hud、bus
     等全域物件都在執行時才取用。沒開房時所有掛鉤都直接略過。
   ========================================================= */
const COOP_TYPES = ['walker', 'runner', 'tank', 'exploder'];
const COOP_COLORS = [0xf0a23b, 0x5fe3d0, 0xdc8ad0];
const COOP_REVIVE_SEC = 2.5, COOP_REVIVE_RANGE = 2.2;

class RemoteAvatar {
  constructor(id, name) {
    this.id = id; this.name = name; this.downed = false; this.hp = 100; this.fresh = true; this.k = 0;
    this.pos = new THREE.Vector3(0, 0, 15); this.to = new THREE.Vector3(0, 0, 15); this.yaw = 0; this.toYaw = 0;
    const g = this.group = new THREE.Group(), rig = this.rig = new THREE.Group(); g.add(rig);
    const col = COOP_COLORS[id % COOP_COLORS.length];
    const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; rig.add(o); return o; };
    const shirt = mat(col), dark = mat(0x2b2f36), skin = mat(0xd9b38c);
    box(0.2, 0.8, 0.22, -0.14, 0.4, 0, dark); box(0.2, 0.8, 0.22, 0.14, 0.4, 0, dark);
    box(0.56, 0.66, 0.3, 0, 1.13, 0, shirt);
    box(0.3, 0.3, 0.3, 0, 1.63, 0, skin);
    box(0.14, 0.14, 0.5, -0.24, 1.28, -0.28, shirt); box(0.14, 0.14, 0.5, 0.24, 1.28, -0.28, shirt);
    box(0.08, 0.12, 0.6, 0.12, 1.3, -0.62, mat(0x15171a));
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    x.font = '700 34px "Noto Sans TC",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(name, 128, 32); x.fillStyle = '#' + col.toString(16).padStart(6, '0'); x.fillText(name, 128, 32);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.label.scale.set(1.7, 0.42, 1); this.label.position.y = 2.1; g.add(this.label);
    g.visible = false; scene.add(g);
  }
  set(x, y, z, yaw, dn, hp) {
    this.to.set(x, y, z); this.toYaw = yaw; this.downed = !!dn; this.hp = hp;
    if (this.fresh) { this.fresh = false; this.pos.copy(this.to); this.yaw = yaw; }
  }
  update(dt, visible) {
    this.group.visible = visible && !this.fresh; if (!this.group.visible) return;
    this.pos.lerp(this.to, 1 - Math.exp(-14 * dt));
    let da = this.toYaw - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += da * Math.min(1, dt * 12);
    this.k += ((this.downed ? 1 : 0) - this.k) * Math.min(1, dt * 6);
    this.group.position.copy(this.pos); this.group.rotation.y = this.yaw;
    this.rig.rotation.x = this.k * Math.PI / 2; this.rig.position.y = this.k * 0.18;
    this.label.position.y = 2.1 - this.k * 1.2;
  }
  dispose() { scene.remove(this.group); }
}

class Coop {
  constructor() {
    this.active = false; this.isHost = false; this.isClient = false; this.myId = 0;
    this.pending = null; this.status = ''; this.roster = [];
    this.run = 0; this.curRun = -1; this.lastPhase = ''; this.remaining = 0;
    this.proxies = new Map();   // Host：遠端玩家的替身，放進 game.players 讓殭屍能鎖定
    this.avatars = new Map();   // 其他玩家在畫面上的模型
    this.puppets = new Map();   // 客戶端：nid → 殭屍替身
    this.hitQ = new Map(); this.sendT = 0; this.snapT = 0; this.flowT = 0; this.hitT = 0; this.uiT = 0; this.reviveT = 0; this.shotT = 0;
    this.replay = false; this.ready = false; this.frameAt = 0;
  }

  /* ---------- 啟動與房間 ---------- */
  init() {
    if (this.ready) return; this.ready = true;
    const css = document.createElement('style');
    css.textContent = `
.coopbox{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 4px}
.coopbox input{font:500 14px var(--f-body);background:transparent;color:var(--ink);border:1px solid var(--line);padding:9px 10px;width:9em}
.coopbox .btn{padding:10px 14px;font-size:13px}
#coopStatus{flex-basis:100%}
#coopTeam{position:absolute;left:clamp(10px,2vmin,24px);bottom:calc(clamp(64px,13vmin,120px) + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:flex-start;gap:4px;font-size:12px}
#coopTeam span{padding:4px 9px;background:var(--plate);border:1px solid var(--line);border-radius:4px;white-space:nowrap}
#coopTeam span.dn{border-color:var(--blood);color:var(--blood)}
#coopTeam b{font-variant-numeric:tabular-nums;margin-left:5px}
#coopPrompt{position:absolute;left:50%;top:calc(50% + 96px);transform:translateX(-50%);padding:8px 12px;background:var(--plate);border:1px solid var(--hazard);font-size:14px;text-shadow:none;white-space:nowrap}
#coopPrompt i{display:block;height:3px;margin-top:6px;background:var(--hazard);transform-origin:left}`;
    document.head.append(css);
    const hudEl = document.querySelector('#hud');
    this.teamEl = Object.assign(document.createElement('div'), { id: 'coopTeam', hidden: true });
    this.promptEl = Object.assign(document.createElement('div'), { id: 'coopPrompt', hidden: true });
    hudEl.append(this.teamEl, this.promptEl);
    const q = s => document.querySelector(s);
    this.nameEl = q('#coopName'); this.statusEl = q('#coopStatus');
    this.nameEl.value = store.get('zwp.name', '') || '';
    q('#coopHost').addEventListener('click', () => this.hello('host'));
    q('#coopJoin').addEventListener('click', () => this.hello('join'));
    q('#coopLeave').addEventListener('click', () => this.leave());

    net.on('welcome', m => {
      this.active = true; this.myId = m.clientId; this.isHost = m.clientId === 0; this.isClient = !this.isHost;
      this.roster = m.players || []; this.status = ''; this.pending = null; this.curRun = -1; this.lastPhase = '';
      this.refreshUi();
    });
    for (const [t, msg] of [['hostExists', '已經有人開房了，請改按「加入房間」'], ['noHost', '還沒有人開房，請先由一個人按「建立房間」'], ['full', '房間滿了（最多 3 人）']])
      net.on(t, () => { net.skipReload = true; this.pending = null; this.status = msg; this.refreshUi(); });
    net.on('peerJoined', m => {
      if (!this.isHost || m.id === this.myId) return;
      if (!this.roster.some(p => p.id === m.id)) this.roster.push({ id: m.id, name: m.name });
      this.proxies.set(m.id, this.makeProxy(m.id, m.name));
      this.all({ k: 'roster', list: this.roster }); this.to(m.id, this.phaseMsg()); this.refreshUi();
      if (game.inRun) hud.toast(`<b>${this.esc(m.name)}</b> 加入了`, 3);
    });
    net.on('peerLeft', m => {
      if (!this.active) return;
      this.dropAvatar(m.id);
      if (!this.isHost) return;
      const pr = this.proxies.get(m.id); this.proxies.delete(m.id);
      if (pr) { const i = game.players.indexOf(pr); if (i >= 0) game.players.splice(i, 1); if (game.inRun) hud.toast(`<b>${this.esc(pr.name)}</b> 離開了`, 3); }
      this.roster = this.roster.filter(p => p.id !== m.id);
      this.all({ k: 'roster', list: this.roster }); this.refreshUi();
    });
    net.on('hostLeft', () => this.resetRoom('Host 離開了，房間已關閉'));
    net.on('fromClient', m => { if (this.isHost && m.d) this.onClientMsg(m.from, m.d); });
    net.on('fromHost', m => { if (this.isClient && m.d) this.onHostMsg(m.d); });

    // 分頁被切到背景時 requestAnimationFrame 會停，Host 一停大家都停，所以超過 90 毫秒沒有畫面更新就由 Worker 的計時器接手
    try {
      const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'], { type: 'text/javascript' })));
      w.onmessage = () => { const now = performance.now(); if (this.active && now - this.frameAt > 90) stepFrame(now); };
    } catch (e) { /* 沒有 Worker 就只在前景執行 */ }
    this.refreshUi();
  }
  esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  hello(role) {
    if (this.active || this.pending) return;
    sfx.init();
    const name = this.nameEl.value.trim().slice(0, 12); store.set('zwp.name', name);
    if (!net.send({ t: 'hello', name, role })) { this.status = '連不上連線伺服器。請用 node prototype-web/server.mjs 啟動後再試'; this.refreshUi(); return; }
    this.pending = role; this.status = '連線中…'; this.refreshUi();
  }
  leave() {
    if (!this.active) return;
    net.skipReload = true; if (net.socket) net.socket.close();
    this.resetRoom('已離開房間');
  }
  resetRoom(msg) {
    const wasClient = this.isClient;
    this.active = this.isHost = this.isClient = false; this.myId = 0; this.roster = []; this.pending = null;
    for (const pr of this.proxies.values()) { const i = game.players.indexOf(pr); if (i >= 0) game.players.splice(i, 1); }
    this.proxies.clear(); [...this.avatars.keys()].forEach(id => this.dropAvatar(id));
    this.puppets.clear(); this.hitQ.clear(); this.curRun = -1; this.lastPhase = '';
    this.teamEl.hidden = true; this.promptEl.hidden = true;
    if (wasClient && !(game.fsm.state instanceof LobbyState)) this.toLobby();
    this.status = msg || ''; this.refreshUi();
  }
  toLobby() {
    game.paused = false; game.picking = false; input.down = false; input.keys = {};
    if (document.pointerLockElement) document.exitPointerLock();
    this.puppets.clear(); game.fsm.set(new LobbyState(game));
  }
  refreshUi() {
    if (!this.ready) return;
    const q = s => document.querySelector(s), names = this.roster.map(p => this.esc(p.name) + (p.id === 0 ? '（Host）' : '')).join('、');
    q('#coopHost').hidden = q('#coopJoin').hidden = this.active; q('#coopLeave').hidden = !this.active; this.nameEl.disabled = this.active || !!this.pending;
    q('#startBtn').textContent = this.isClient ? '等 Host 開始' : this.isHost ? `開始遊戲（${this.roster.length} 人）` : '開始遊戲';
    q('#againBtn').textContent = this.isClient ? '等 Host 再開一局' : '再來一局';
    this.statusEl.innerHTML = this.isHost ? `房間已建立 · ${this.roster.length} / 3 人：${names}。同一個區網的隊友打開這個網址按「加入房間」`
      : this.isClient ? `已加入房間 · ${names}。等 Host 按開始` : this.esc(this.status || '多人合作：一個人建立房間，其他人加入（最多 3 人）');
  }
  // 客戶端不能自己開局
  blockStart() {
    if (!this.isClient) return false;
    this.statusEl.textContent = '只有 Host 可以開始，請等一下'; return true;
  }
  quit() {
    if (this.isHost) game.fsm.set(new GameOverState(game)); else this.leave();
  }

  /* ---------- 傳送 ---------- */
  toHost(d) { net.send({ t: 'toHost', d }); }
  all(d, except) { net.send(except === undefined ? { t: 'broadcast', d } : { t: 'broadcast', d, except }); }
  to(id, d) { net.send({ t: 'toClient', to: id, d }); }
  share(d) { if (this.isHost) this.all(d); else this.toHost(d); }

  /* ---------- Host：遠端玩家替身 ---------- */
  makeProxy(id, name) {
    return { id, name, pos: new V3(0, 0, 15), knock: new V3(), y: 0, yaw: 0, hp: 100, downed: false, downT: 0, busy: false, seen: false,
      flow: new FlowField(world), hurt: amount => this.to(id, { k: 'hurt', a: Math.round(amount * 10) / 10 }) };
  }
  anchor() {
    if (!this.isHost) return game.player;
    const up = game.players.filter(p => !p.downed); return up.length ? up[Math.floor(Math.random() * up.length)] : game.player;
  }
  scaleWave(queue) {
    if (!this.isHost || !this.proxies.size) return;
    const extra = Math.round(queue.length * 0.5 * this.proxies.size);
    for (let i = 0; i < extra; i++) { const src = queue[Math.floor(Math.random() * queue.length)]; if (!src[1]) queue.splice(Math.floor(Math.random() * queue.length), 0, [src[0]]); }
  }
  teamBusy() { for (const pr of this.proxies.values()) if (pr.busy) return true; return false; }
  runLost() {
    const p = game.player, out = p.downed && p.downT > 2.8;
    if (!this.active) return out;
    if (this.isClient || !out) return false;
    for (const pr of this.proxies.values()) if (!(pr.downed && pr.downT > 2.8)) return false;
    return true;
  }
  phaseOf(st) { return st instanceof PlayingState ? 'play' : st instanceof WaveBreakState ? 'break' : st instanceof GameOverState ? 'over' : 'lobby'; }
  phaseMsg() { const st = game.fsm.state; return { k: 'phase', phase: this.phaseOf(st), n: st.n || 0, run: this.run }; }
  onNewRun() { if (this.isHost) this.run++; }
  snapshot() {
    const r = v => Math.round(v * 100) / 100, e = [], p = [], me = game.player, st = game.fsm.state;
    for (const z of game.enemies) {
      if (!z.alive) continue; const b = z.busy;
      e.push([z.nid, COOP_TYPES.indexOf(z.type), r(z.pos.x), r(z.pos.z), r(z.yaw), Math.ceil(z.hp), Math.ceil(z.maxHp), (z.burn > 0 ? 1 : 0) | (z.primed ? 2 : 0) | (z.boss ? 4 : 0) | (z.spawnT < 0.7 ? 8 : 0), b ? b.kind : 0, b ? r(b.t) : 0]);
    }
    p.push([0, r(me.pos.x), r(me.y), r(me.pos.z), r(me.yaw), me.downed ? 1 : 0, Math.ceil(me.hp)]);
    for (const pr of this.proxies.values()) if (pr.seen) p.push([pr.id, r(pr.pos.x), r(pr.y), r(pr.pos.z), r(pr.yaw), pr.downed ? 1 : 0, pr.hp]);
    return { k: 's', e, p, rem: game.wave.remaining, sw: [game.wave.sub, Math.round(game.wave.progress * 1000) / 1000], bt: st instanceof WaveBreakState ? r(st.t) : 0, boss: game.boss ? game.boss.nid : 0 };
  }
  onClientMsg(from, d) {
    const pr = this.proxies.get(from), num = Number.isFinite; if (!pr) return;
    if (d.k === 'p') {
      if (![d.x, d.y, d.z, d.yaw].every(num)) return;
      pr.pos.set(d.x, 0, d.z); pr.y = d.y; pr.yaw = d.yaw; pr.downed = !!d.dn; pr.hp = num(d.hp) ? d.hp : 0; pr.busy = !!d.pk; pr.seen = true;
    } else if (d.k === 'hits') {
      if (!Array.isArray(d.l)) return;
      for (const h of d.l) {
        const e = game.enemies.find(z => z.nid === h[0] && z.alive); if (!e || !num(h[1]) || h[1] <= 0) continue;
        const info = { source: String(h[2] || ''), headshot: !!h[3], by: from };
        if (num(h[4]) && num(h[5])) { info.dir = new V3(h[4], 0, h[5]); info.knock = num(h[6]) ? Math.min(h[6], 20) : 0; }
        e.takeDamage(Math.min(h[1], 5000), info);
      }
    } else if (d.k === 'ignite') {
      const e = game.enemies.find(z => z.nid === d.id && z.alive); if (e && num(d.sec)) e.ignite(Math.min(d.sec, 10), from);
    } else if (d.k === 'fx') { this.playFx(d); this.all(d, from); }
    else if (d.k === 'revive') { if (d.to === 0) this.onRevived(); else if (this.proxies.has(d.to)) this.to(d.to, { k: 'revive' }); }
    else if (d.k === 'skip') { const st = game.fsm.state; if (st instanceof WaveBreakState && st.t > 3) st.t = 3; }
  }

  /* ---------- 客戶端：照 Host 的訊息動作 ---------- */
  onHostMsg(d) {
    if (d.k === 's') this.applySnap(d);
    else if (d.k === 'phase') this.applyPhase(d);
    else if (d.k === 'roster') { this.roster = d.list || []; this.refreshUi(); }
    else if (d.k === 'die') { const e = this.puppets.get(d.id); if (!e) return; this.puppets.delete(d.id); if (e.alive) e.die({ headshot: !!d.h, source: d.s, by: d.by }); }
    else if (d.k === 'hurt') game.player.hurt(d.a);
    else if (d.k === 'knock') { game.player.knock.x += d.x; game.player.knock.z += d.z; }
    else if (d.k === 'fx') this.playFx(d);
    else if (d.k === 'revive') this.onRevived();
  }
  applyPhase(d) {
    const g = game;
    if (d.phase === 'lobby') { this.curRun = -1; if (!(g.fsm.state instanceof LobbyState)) this.toLobby(); return; }
    if (d.run !== this.curRun) { this.curRun = d.run; this.puppets.clear(); sfx.init(); g.newRun(); g.requestLock(); }
    const cur = g.fsm.state;
    if (d.phase === 'play') {
      if (cur instanceof PlayingState && cur.n === d.n) return;
      if (ui.pickCb) ui.choose(-1); else if (g.picking) g.closeOverlay(null, false);
      g.inRun = true; g.fsm.set(new PlayingState(g, d.n));
    } else if (d.phase === 'break') { if (!(cur instanceof WaveBreakState && cur.n === d.n)) g.fsm.set(new WaveBreakState(g, d.n)); }
    else if (d.phase === 'over') { if (!(cur instanceof GameOverState)) g.fsm.set(new GameOverState(g)); }
  }
  applySnap(d) {
    const st = game.fsm.state;
    if (st instanceof LobbyState) { this.puppets.clear(); return; }
    this.remaining = d.rem; if (d.sw && st instanceof PlayingState) game.wave.syncNet(d.sw[0], d.sw[1]);
    if (st instanceof WaveBreakState && d.bt > 0) st.t = d.bt;
    const seen = new Set();
    for (const a of d.e) {
      const nid = a[0], fl = a[7]; seen.add(nid);
      let e = this.puppets.get(nid);
      if (!e) {
        const type = COOP_TYPES[a[1]]; if (!type) continue;
        e = game.factory.create(type, new V3(a[2], 0, a[3]), { boss: !!(fl & 4) });
        e.puppet = true; e.nid = nid; e.target = null; e.net = { x: a[2], z: a[3], yaw: a[4] }; e.yaw = a[4]; e.predT = 0; e.predDead = false; e.nb = null; e.ignT = 0;
        if (!(fl & 8)) e.spawnT = 1;
        this.puppets.set(nid, e);
        if (TIPS[type] && !game.seen.has(type)) { game.seen.add(type); hud.toast(`<b>新威脅：${TIPS[type][0]}</b>　${TIPS[type][1]}`, 6); }
      }
      e.net.x = a[2]; e.net.z = a[3]; e.net.yaw = a[4]; e.maxHp = a[6];
      if (game.time > e.predT) { e.hp = a[5]; e.predDead = false; }
      e.burn = fl & 1 ? 1 : 0;
      if ((fl & 2) && !e.primed) { e.primed = true; sfx.hiss(e.pos); }
      this.netBusy(e, a[8], a[9]);
    }
    for (const [nid, e] of this.puppets) if (!seen.has(nid)) { this.puppets.delete(nid); if (e.alive) game.factory.release(e); }
    game.boss = d.boss ? this.puppets.get(d.boss) || null : null;
    for (const a of d.p) if (a[0] !== this.myId) this.avatarFor(a[0]).set(a[1], a[2], a[3], a[4], a[5], a[6]);
  }
  // 讓替身播 Host 那邊正在做的動作（揮擊、硬直、蓄力重擊、尖叫衝刺、自爆膨脹）
  netBusy(e, kind, t) {
    if (!kind || kind === 'recover') return;
    const cur = e.busy;
    if (cur && cur.kind === kind) return;
    if (e.nb && e.nb.kind === kind && game.time < e.nb.end && t > 0.2) return;
    const rest = z => { z.head.rotation.set(0, 0, 0); z.body.rotation.x = 0; z.armL.rotation.set(-1.35, 0, 0); z.armR.rotation.set(-1.35, 0, 0); };
    if (kind === 'melee') e.melee(0);
    else if (kind === 'stagger') e.stagger();
    else if (kind === 'slam' && e.slam) e.slam();
    else if (kind === 'scream') { sfx.scream(e.pos); e.busy = { kind, t: 0, dur: 0.8, update: (z, dt, tt) => { z.head.rotation.x = -0.6; z.head.rotation.z = Math.sin(tt * 60) * 0.12; z.armL.rotation.set(-0.5, 0, -0.7); z.armR.rotation.set(-0.5, 0, 0.7); }, done: rest }; }
    else if (kind === 'charge') e.busy = { kind, t: 0, dur: 1.3, update: z => { z.body.rotation.x = 0.35; }, done: rest };
    else if (kind === 'detonate') e.busy = { kind, t: 0, dur: 0.6, update: (z, dt, tt) => { z.group.scale.setScalar(z.baseScale * (1 + tt * 0.7)); z.setGlow(1, 0.7, 0.2); } };
    else return;
    e.busy.t = Math.min(t, e.busy.dur - 0.01); e.nb = { kind, end: game.time + e.busy.dur - e.busy.t + 0.35 };
  }
  puppetUpdate(e, dt) {
    if (!e.alive) { e.updateDeath(dt); return; }
    const n = e.net;
    if (e.spawnT < 0.7) { e.spawnT += dt; e.pos.x = n.x; e.pos.z = n.z; e.group.position.set(n.x, -2 * (1 - Math.min(e.spawnT / 0.7, 1)), n.z); e.group.rotation.y = e.yaw; return; }
    if (e.burn > 0 && Math.random() < dt * 14) game.fx.burst(new V3(e.pos.x + rand(-0.3, 0.3), rand(0.6, 1.8) * e.baseScale, e.pos.z + rand(-0.3, 0.3)), 1, 'fire', 1.2);
    const p = game.player, ox = e.pos.x, oz = e.pos.z, k = 1 - Math.exp(-12 * dt);
    e.pos.x += (n.x - ox) * k; e.pos.z += (n.z - oz) * k;
    e.dist = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    let da = n.yaw - e.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); e.yaw += da * Math.min(1, dt * 10);
    if (e.busy) { const b = e.busy; b.t += dt; if (b.update) b.update(e, dt, b.t); if (e.busy === b && b.t >= b.dur) { e.busy = null; if (b.done) b.done(e); } }
    if (!e.alive) return;
    e.group.position.set(e.pos.x, 0, e.pos.z); e.group.rotation.y = e.yaw;
    let moving = Math.min(Math.hypot(e.pos.x - ox, e.pos.z - oz) / Math.max(dt, 1e-4), 10); if (moving < 0.2) moving = 0;
    e.phase += dt * moving * 3.4;
    const sw = Math.sin(e.phase) * Math.min(moving, 1) * 0.65;
    e.legL.rotation.x = sw; e.legR.rotation.x = -sw;
    if (!e.busy || e.busy.kind === 'charge') { e.armL.rotation.set(-1.35 + Math.sin(e.phase * 0.5) * 0.08, 0, 0); e.armR.rotation.set(-1.35 - Math.sin(e.phase * 0.5) * 0.08, 0, 0); e.head.rotation.z = 0; }
    GFX.zombiePose(e, dt, moving);
    e.flashT -= dt;
    if (e.flashT > 0) e.setGlow(0.2, 0.2, 0.2);
    else if (e.primed) { const g = 0.5 + 0.5 * Math.sin(game.time * (e.dist < 4 ? 30 : 16)); e.setGlow(g, 0.55 * g, 0.05, true); }
    else if (e.burn > 0) { const g = 0.35 + 0.25 * Math.sin(game.time * 20 + e.phase); e.setGlow(g, g * 0.35, 0); }
    else e.setGlow(0, 0, 0);
    e.groanT -= dt; if (e.groanT <= 0) { e.groanT = rand(4, 10); if (game.inRun && e.dist < 18) sfx.groan(e.pos); }
  }
  // 客戶端打中替身：先在本機預測扣血（準心回饋才不會慢半拍），真正的結果由 Host 決定
  requestHit(e, amount, info) {
    if (e.predDead || !(amount > 0)) return false;
    if (info.source !== 'burn') e.flashT = 0.07;
    const key = e.nid + '|' + (info.source || '') + '|' + (info.headshot ? 1 : 0), q = this.hitQ.get(key);
    if (q) { q[1] += amount; if (info.dir) { q[4] = info.dir.x; q[5] = info.dir.z; q[6] = info.knock || 1.4; } }
    else this.hitQ.set(key, [e.nid, amount, info.source || '', info.headshot ? 1 : 0, info.dir ? info.dir.x : null, info.dir ? info.dir.z : null, info.dir ? info.knock || 1.4 : null]);
    e.hp -= amount; e.predT = game.time + 0.35;
    bus.emit('EnemyHit', { enemy: e, amount, isHeadshot: !!info.headshot, source: info.source });
    if (e.hp <= 0) { e.predDead = true; e.predT = game.time + 0.7; return true; }
    return false;
  }
  requestIgnite(e, sec) {
    e.burn = Math.max(e.burn, 1);
    if (game.time < e.ignT) return; e.ignT = game.time + 0.3;
    this.toHost({ k: 'ignite', id: e.nid, sec });
  }

  /* ---------- 擊殺歸屬 ---------- */
  killer(e, info) {
    if (!this.active) return 0;
    if (info.by != null) return info.by;
    if (info.source === 'burn') return e.burnBy || 0;
    return this.isHost ? 0 : -1;
  }
  onDie(e, info, by) { if (this.isHost) this.all({ k: 'die', id: e.nid, h: info.headshot ? 1 : 0, s: info.source || '', by }); }

  /* ---------- 只同步畫面的特效 ---------- */
  fxTracer(a, b) {
    if (!this.active) return;
    const r = v => Math.round(v * 100) / 100;
    this.share({ k: 'fx', f: 'tr', a: [r(a.x), r(a.y), r(a.z)], b: [r(b.x), r(b.y), r(b.z)] });
  }
  onExplode(pos, r, src) {
    if (!this.active || this.replay || src instanceof Enemy) return;
    this.share({ k: 'fx', f: 'bm', p: [pos.x, pos.y, pos.z], r });
  }
  // 自爆殭屍的爆炸在客戶端只做畫面與自己受傷，周圍殭屍的傷害由 Host 算
  skipBlast(src) { return this.isClient && src instanceof Enemy; }
  playFx(d) {
    const ok = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (d.f === 'tr' && ok(d.a) && ok(d.b)) {
      const a = new V3(...d.a); game.fx.tracer(a, new V3(...d.b));
      if (game.time > this.shotT) { this.shotT = game.time + 0.07; sfx.noise({ dur: 0.09, f: 1900, f2: 420, vol: 0.4, pos: a }); }
    } else if (d.f === 'bm' && ok(d.p) && Number.isFinite(d.r)) {
      const pos = new V3(...d.p), r = Math.min(d.r, 12);
      game.fx.blast(pos, r); game.fx.ring(pos, r, 0xf0a23b, 0.5); game.fx.burst(new V3(pos.x, 1, pos.z), 26, 'fire', 7); sfx.boom(pos);
    }
  }

  /* ---------- 其他玩家的模型、救援與 HUD ---------- */
  avatarFor(id) {
    let av = this.avatars.get(id);
    if (!av) { const who = this.roster.find(p => p.id === id); av = new RemoteAvatar(id, who ? who.name : `玩家${id}`); this.avatars.set(id, av); }
    return av;
  }
  dropAvatar(id) { const av = this.avatars.get(id); if (av) { av.dispose(); this.avatars.delete(id); } }
  onRevived() {
    const p = game.player; if (!p.downed || !game.inRun) return;
    p.revive(30); hud.banner('被救起來了', '血量只有 30，先退到隊友後面', 2.2);
  }
  drawMinimap(x, k, h) {
    if (!this.active) return;
    for (const av of this.avatars.values()) {
      if (!av.group.visible) continue;
      x.fillStyle = av.downed ? '#dc4a3d' : '#5fe3d0'; x.beginPath(); x.arc((av.pos.x + h) * k, (av.pos.z + h) * k, 4.5, 0, 7); x.fill();
      if (av.downed) { x.strokeStyle = 'rgba(220,74,61,' + (0.5 + 0.5 * Math.sin(game.time * 8)) + ')'; x.lineWidth = 2; x.beginPath(); x.arc((av.pos.x + h) * k, (av.pos.z + h) * k, 8, 0, 7); x.stroke(); }
    }
  }
  updateRevive(dt) {
    const p = game.player; let tgt = null;
    if (game.inRun && !p.downed && !game.picking && !game.paused)
      for (const av of this.avatars.values()) if (av.group.visible && av.downed && Math.hypot(av.pos.x - p.pos.x, av.pos.z - p.pos.z) < COOP_REVIVE_RANGE) tgt = av;
    if (tgt && input.keys.KeyE) {
      this.reviveT += dt;
      if (this.reviveT >= COOP_REVIVE_SEC) {
        this.reviveT = 0; tgt.downed = false;
        if (this.isHost) this.to(tgt.id, { k: 'revive' }); else this.toHost({ k: 'revive', to: tgt.id });
        hud.toast(`<b>救起 ${this.esc(tgt.name)}</b>`, 2.5);
      }
    } else this.reviveT = 0;
    const el = this.promptEl;
    if (tgt) { el.hidden = false; el.innerHTML = `<kbd>E</kbd> 按住救援 ${this.esc(tgt.name)}<i style="transform:scaleX(${(this.reviveT / COOP_REVIVE_SEC).toFixed(3)})"></i>`; }
    else if (game.inRun && p.downed) { el.hidden = false; el.textContent = '倒地了 · 等隊友靠過來按住 E 救你，撐到這一關結束也會站起來'; }
    else el.hidden = true;
  }

  /* ---------- 每一幀 ---------- */
  update(dt) {
    this.frameAt = performance.now();
    if (!this.active) return;
    const st = game.fsm.state, inLobby = st instanceof LobbyState, p = game.player;
    if (this.isHost) {
      for (const pr of this.proxies.values()) {
        if (game.inRun && !game.players.includes(pr)) game.players.push(pr);
        pr.downT = pr.downed ? pr.downT + dt : 0;
        if (pr.knock.lengthSq() > 0.01) { this.to(pr.id, { k: 'knock', x: pr.knock.x, z: pr.knock.z }); pr.knock.set(0, 0, 0); }
        if (pr.seen) this.avatarFor(pr.id).set(pr.pos.x, pr.y, pr.pos.z, pr.yaw, pr.downed, pr.hp);
      }
      this.flowT -= dt; if (this.flowT <= 0) { this.flowT = 0.2; if (game.inRun) for (const pr of this.proxies.values()) pr.flow.update(pr.pos.x, pr.pos.z); }
      const key = this.phaseOf(st) + '|' + (st.n || 0) + '|' + this.run;
      if (key !== this.lastPhase) { this.lastPhase = key; this.all(this.phaseMsg()); }
      this.snapT -= dt; if (this.snapT <= 0 && !inLobby) { this.snapT = 0.1; this.all(this.snapshot()); }
    } else {
      this.sendT -= dt;
      if (this.sendT <= 0 && !inLobby) {
        this.sendT = 1 / 15; const r = v => Math.round(v * 100) / 100;
        this.toHost({ k: 'p', x: r(p.pos.x), y: r(p.y), z: r(p.pos.z), yaw: r(p.yaw), dn: p.downed ? 1 : 0, hp: Math.ceil(p.hp), pk: game.picking || game.machine.state === 'rolling' ? 1 : 0 });
      }
      this.hitT -= dt;
      if (this.hitT <= 0 && this.hitQ.size) { this.hitT = 1 / 30; this.toHost({ k: 'hits', l: [...this.hitQ.values()].map(h => { h[1] = Math.round(h[1] * 100) / 100; return h; }) }); this.hitQ.clear(); }
    }
    for (const av of this.avatars.values()) av.update(dt, !inLobby);
    this.updateRevive(dt);
    this.uiT -= dt;
    if (this.uiT <= 0) {
      this.uiT = 0.25; this.teamEl.hidden = inLobby || !this.avatars.size;
      if (!this.teamEl.hidden) this.teamEl.innerHTML = [...this.avatars.values()].map(av => `<span class="${av.downed ? 'dn' : ''}">${this.esc(av.name)}<b>${av.downed ? '倒地' : Math.max(0, av.hp)}</b></span>`).join('');
    }
  }
}

const coop = new Coop();
