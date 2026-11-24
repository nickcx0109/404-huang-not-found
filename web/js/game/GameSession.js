import { ReviveInteraction } from '../pickups/ReviveInteraction.js';
import { LineOfSight } from '../pickups/LineOfSight.js';
import { StateMachine } from '../core/StateMachine.js';
import { DamageInfo } from '../entities/DamageInfo.js';
import { DamagePipeline, HeadshotRule } from '../entities/DamagePipeline.js';
import { LobbyState } from './states/LobbyState.js';
import { PlayingState } from './states/PlayingState.js';
import { WaveBreakState } from './states/WaveBreakState.js';
import { GameOverState } from './states/GameOverState.js';
import { VictoryState } from './states/VictoryState.js';
import { EVENTS } from './events.js';
import { EndlessObjective } from './objectives/EndlessObjective.js';

export class GameSession {
  constructor(ctx, { factory, director, breakSeconds = 8,
    damagePipeline = new DamagePipeline([new HeadshotRule()]), separation = null, pickups = null,
    objective = new EndlessObjective() }) {
    if (ctx.session) throw new Error('Context already has an authority');
    if (!Number.isFinite(breakSeconds) || breakSeconds < 0) throw new RangeError('Invalid break duration');
    this.context = ctx;
    ctx.session = this;
    this.factory = factory;
    this.director = director;
    this.separation = separation;
    /** Ground pickups and ammo crate interactions, or null when the level has none. */
    this.pickups = pickups;
    const sight = new LineOfSight(ctx.collision);
    this.revives = new ReviveInteraction(ctx.players, { canReach: (rescuer, downed) => sight.clear(rescuer, downed) });
    /** How this level is won (an Objective); the default never wins. */
    this.objective = objective;
    this.damagePipeline = damagePipeline;
    this.breakSeconds = breakSeconds;
    this.wave = 0;
    this.kills = 0;
    this.startRequested = false;
    this.disposed = false;
    this._spawn = { type: '', x: 0, y: 0, z: 0 };
    this.states = { lobby: new LobbyState(), playing: new PlayingState(),
      waveBreak: new WaveBreakState(), gameOver: new GameOverState(), victory: new VictoryState() };
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
      ctx.events.on(EVENTS.SECONDARY_REQUESTED, request => {
        const player = this.playerById(request.ownerId);
        if (this.canMove && player?.damageable.alive) player.weapons.current?.secondary(ctx);
      }),
      ctx.events.on(EVENTS.SWITCH_REQUESTED, request => {
        const player = this.playerById(request.ownerId);
        if (this.canMove && player?.damageable.alive) player.weapons.switchTo(request.index);
      }),
      ctx.events.on(EVENTS.CYCLE_REQUESTED, request => {
        const player = this.playerById(request.ownerId);
        if (this.canMove && player?.damageable.alive) player.weapons.cycle?.(request.step);
      }),
      ctx.events.on(EVENTS.PICKUP_REQUESTED, request => this.pickUp(request.ownerId)),
      ctx.events.on(EVENTS.DAMAGE_REQUESTED, info => this.resolveDamage(info)),
      ctx.events.on(EVENTS.ENTITY_DIED, detail => this.recordDeath(detail)),
    ];
    this.changeState(this.states.lobby);
  }

  get state() { return this.machine.current?.name ?? null; }

  get canRestart() { return this.machine.current?.canRestart === true; }

  get canMove() {
    return (this.state === 'playing' || this.state === 'wave-break') && this.anyPlayerAlive;
  }

  get anyPlayerAlive() {
    for (const player of this.context.players) if (player.damageable.alive) return true;
    return false;
  }

  start() {
    if (this.disposed) return;
    this.context.events.emit(EVENTS.START_REQUESTED);
  }

  win() {
    if (!this.canMove || this.disposed) return false;
    this.changeState(this.states.victory);
    return true;
  }

  /** True when this player may not walk: the item in their hand keeps them still. */
  isRooted(playerId) {
    const player = this.playerById(playerId);
    return Boolean(player && (player.downed || !player.damageable.alive || player.weapons.current?.holdsOwnerStill));
  }

  playerById(id) {
    return this.context.players.find(player => player.id === id);
  }

  update(dt) {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.05 + 1e-9) throw new RangeError('Use simulation steps of 0..0.05 seconds');
    this.context.time += dt;
    this.machine.update(dt);
    this.revives.update(this.canMove ? dt : 0);
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
    this.breakSeconds = this.director.breakSeconds ?? this.breakSeconds;
    ctx.events.emit(EVENTS.WAVE_STARTED, { wave: this.wave, count: this.director.remaining });
    this.spawnDue(0);
  }

  spawnDue(dt) {
    const ctx = this.context;
    this.director.update(dt, ctx);
    while (this.director.nextSpawn(ctx, this._spawn)) {
      const enemy = this.factory.create(this._spawn.type, this._spawn);
      ctx.enemies.push(enemy);
      ctx.events.emit(EVENTS.ENEMY_SPAWNED, { enemy, wave: this.wave });
    }
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

  /** Moves every effect in the world one step and drops the ones that are over. */
  updateEffects(dt) {
    const effects = this.context.effects;
    for (let index = 0; index < effects.length; index++) {
      if (effects[index].update(dt, this.context)) continue;
      effects.splice(index, 1);
      index--;
    }
  }

  updatePlaying(dt) {
    this.simulate(dt);
    this.updateEffects(dt);
    this.separation?.apply(this.context);
    if (!this.anyPlayerAlive) this.changeState(this.states.gameOver);
    else if (!this.advanceObjective(dt)) {
      this.spawnDue(dt);
      if (this.director.remaining === 0 && this.context.enemies.length === 0) this.changeState(this.states.waveBreak);
    }
  }

  beginBreak() {
    this.breakEndsAt = this.context.time + this.breakSeconds;
    this.context.events.emit(EVENTS.WAVE_CLEARED, { wave: this.wave, kills: this.kills });
  }

  updateBreak(dt) {
    for (const player of this.context.players) player.update(dt, this.context);
    this.updateEffects(dt);
    if (!this.anyPlayerAlive) { this.changeState(this.states.gameOver); return; }
    if (this.advanceObjective(dt)) return;
    if (this.context.time + 1e-9 >= this.breakEndsAt) this.changeState(this.states.playing);
  }

  /** Runs the objective for one step; true when it ended the game (the state changed). */
  advanceObjective(dt) {
    if (!this.anyPlayerAlive) return false;
    const before = this.machine.current;
    this.objective.update(dt, this);
    return this.machine.current !== before;
  }

  resolveDamage(info) {
    if (this.state !== 'playing' || !(info instanceof DamageInfo)) return 0;
    const ctx = this.context;
    const sourcePlayer = this.playerById(info.sourceId);
    const targetPlayer = this.playerById(info.targetId);
    const sourceEnemy = ctx.enemies.find(enemy => enemy.id === info.sourceId && enemy.damageable.alive);
    const targetEnemy = ctx.enemies.find(enemy => enemy.id === info.targetId && enemy.active);
    // A player's grenade or fire may hurt players too (friendlyFire), even after the thrower died; bullets never do.
    const target = sourcePlayer?.damageable.alive && targetEnemy ? targetEnemy :
      sourcePlayer && info.friendlyFire && targetPlayer ? targetPlayer :
      sourceEnemy && (targetPlayer || (targetEnemy === sourceEnemy && targetEnemy));
    if (!target) return 0;
    return target.damageable.takeDamage(this.damagePipeline.apply(info));
  }

  recordDeath({ entity, info }) {
    if (this.state !== 'playing' || entity.damageable.alive || entity.deathRecorded ||
        !this.context.enemies.includes(entity)) return;
    entity.deathRecorded = true;
    if (this.playerById(info.sourceId)) this.kills++;
  }

  /** Takes the nearest weapon on the ground, swapping it with the one in that slot. Allowed whenever players can move. */
  pickUp(ownerId) {
    const player = this.playerById(ownerId);
    if (!this.canMove || !player?.damageable.alive) return false;
    if (this.revives.take(player)) return true;
    if (!this.pickups) return false;
    return this.pickups.take(player, this.context);
  }

  finish() {
    this.context.events.emit(EVENTS.GAME_OVER, { wave: this.wave, kills: this.kills });
  }

  finishVictory() {
    this.context.events.emit(EVENTS.VICTORY, { wave: this.wave, kills: this.kills });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this._subscriptions) unsubscribe();
    this.machine.change(null);
    this.revives.dispose();
    this.factory.dispose();
    for (const player of this.context.players) player.dispose();
    this.context.players.length = 0;
    this.context.enemies.length = 0;
    this.context.effects.length = 0;
    this.context.session = null;
  }
}
