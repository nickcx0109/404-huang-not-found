import { StateMachine } from '../core/StateMachine.js';
import { DamageInfo } from '../entities/DamageInfo.js';
import { DamagePipeline, HeadshotRule } from '../entities/DamagePipeline.js';
import { LobbyState } from './states/LobbyState.js';
import { PlayingState } from './states/PlayingState.js';
import { WaveBreakState } from './states/WaveBreakState.js';
import { GameOverState } from './states/GameOverState.js';
import { EVENTS } from './events.js';

export class GameSession {
  constructor(ctx, { factory, director, economy, items = [], breakSeconds = 8,
    damagePipeline = new DamagePipeline([new HeadshotRule()]) }) {
    if (ctx.session) throw new Error('Context already has an authority');
    if (!Number.isFinite(breakSeconds) || breakSeconds < 0) throw new RangeError('Invalid break duration');
    this.context = ctx;
    ctx.session = this;
    this.factory = factory;
    this.director = director;
    this.economy = economy;
    this.items = new Map(items.map(item => [item.id, item]));
    this.damagePipeline = damagePipeline;
    this.breakSeconds = breakSeconds;
    this.wave = 0;
    this.kills = 0;
    this.startRequested = false;
    this.disposed = false;
    this._spawn = { type: '', x: 0, y: 0, z: 0 };
    this.states = { lobby: new LobbyState(), playing: new PlayingState(),
      waveBreak: new WaveBreakState(), gameOver: new GameOverState() };
    this.machine = new StateMachine(ctx);
    this._subscriptions = [
      ctx.events.on(EVENTS.START_REQUESTED, () => { if (this.state === 'lobby') this.startRequested = true; }),
      ctx.events.on(EVENTS.FIRE_REQUESTED, request => {
        const player = this.playerById(request.ownerId);
        if (this.canMove && player?.damageable.alive) player.weapons.current?.fire(ctx);
      }),
      ctx.events.on(EVENTS.RELOAD_REQUESTED, request => {
        const player = this.playerById(request.ownerId);
        if (this.canMove && player?.damageable.alive) player.weapons.current?.reload(ctx);
      }),
      ctx.events.on(EVENTS.SWITCH_REQUESTED, request => {
        const player = this.playerById(request.ownerId);
        if (this.canMove && player?.damageable.alive) player.weapons.switchTo(request.index);
      }),
      ctx.events.on(EVENTS.PURCHASE_REQUESTED, request => this.buy(request.ownerId, request.itemId)),
      ctx.events.on(EVENTS.DAMAGE_REQUESTED, info => this.resolveDamage(info)),
      ctx.events.on(EVENTS.ENTITY_DIED, detail => this.recordDeath(detail)),
    ];
    this.changeState(this.states.lobby);
  }

  get state() { return this.machine.current?.name ?? null; }

  get canMove() {
    return (this.state === 'playing' || this.state === 'wave-break') &&
      this.context.players.some(player => player.damageable.alive);
  }

  start() {
    this.context.events.emit(EVENTS.START_REQUESTED);
  }

  playerById(id) {
    return this.context.players.find(player => player.id === id);
  }

  update(dt) {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.05 + 1e-9) throw new RangeError('Use simulation steps of 0..0.05 seconds');
    this.context.time += dt;
    this.machine.update(dt);
  }

  changeState(state) {
    this.machine.change(state);
    this.context.events.emit(EVENTS.STATE_CHANGED, { state: this.state, wave: this.wave });
  }

  updateLobby() {
    if (this.startRequested && this.context.players.length > 0) this.changeState(this.states.playing);
  }

  beginWave() {
    const ctx = this.context;
    this.wave++;
    this.director.start(this.wave, ctx);
    while (this.director.nextSpawn(ctx, this._spawn)) {
      const enemy = this.factory.create(this._spawn.type, this._spawn);
      ctx.enemies.push(enemy);
      ctx.events.emit(EVENTS.ENEMY_SPAWNED, { enemy, wave: this.wave });
    }
    ctx.events.emit(EVENTS.WAVE_STARTED, { wave: this.wave, count: ctx.enemies.length });
  }

  simulate(dt) {
    const ctx = this.context;
    for (const player of ctx.players) player.update(dt, ctx);
    for (let index = ctx.enemies.length - 1; index >= 0; index--) {
      const enemy = ctx.enemies[index];
      if (enemy.damageable.alive) enemy.update(dt, ctx);
      else {
        this.factory.release(enemy);
        ctx.enemies[index] = ctx.enemies[ctx.enemies.length - 1];
        ctx.enemies.pop();
      }
    }
  }

  updatePlaying(dt) {
    this.simulate(dt);
    if (!this.context.players.some(player => player.damageable.alive)) this.changeState(this.states.gameOver);
    else if (this.director.remaining === 0 && this.context.enemies.length === 0) this.changeState(this.states.waveBreak);
  }

  beginBreak() {
    this.breakEndsAt = this.context.time + this.breakSeconds;
    this.context.events.emit(EVENTS.WAVE_CLEARED, { wave: this.wave, kills: this.kills });
  }

  updateBreak(dt) {
    for (const player of this.context.players) player.update(dt, this.context);
    if (this.context.time + 1e-9 >= this.breakEndsAt) this.changeState(this.states.playing);
  }

  resolveDamage(info) {
    if (this.state !== 'playing' || !(info instanceof DamageInfo)) return 0;
    const ctx = this.context;
    const sourcePlayer = this.playerById(info.sourceId);
    const targetPlayer = this.playerById(info.targetId);
    const sourceEnemy = ctx.enemies.find(enemy => enemy.id === info.sourceId && enemy.damageable.alive);
    const targetEnemy = ctx.enemies.find(enemy => enemy.id === info.targetId && enemy.active);
    const target = sourcePlayer?.damageable.alive && targetEnemy ? targetEnemy : sourceEnemy && targetPlayer;
    if (!target) return 0;
    return target.damageable.takeDamage(this.damagePipeline.apply(info));
  }

  recordDeath({ entity, info }) {
    if (this.state !== 'playing' || entity.damageable.alive || entity.rewarded ||
        !this.context.enemies.includes(entity)) return;
    entity.rewarded = true;
    const player = this.playerById(info.sourceId);
    if (player) {
      this.kills++;
      this.economy.reward(player, entity.reward);
    }
  }

  buy(ownerId, itemId) {
    if (this.state !== 'wave-break') return false;
    const player = this.playerById(ownerId);
    const item = this.items.get(itemId);
    if (!player?.damageable.alive || !item) return false;
    const nearShop = this.context.level.markers.some(marker => marker.type === 'shop' &&
      Math.hypot(marker.x - player.position.x, marker.z - player.position.z) <= marker.r + player.body.radius);
    return nearShop && this.economy.purchase(item, player, this.context);
  }

  finish() {
    this.context.events.emit(EVENTS.GAME_OVER, { wave: this.wave, kills: this.kills });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this._subscriptions) unsubscribe();
    this.machine.change(null);
    this.factory.dispose();
    this.context.enemies.length = 0;
    this.context.session = null;
  }
}
