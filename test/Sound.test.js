import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { EVENTS } from '../web/js/game/events.js';
import { SoundBoard } from '../web/js/audio/SoundBoard.js';
import { SpatialMix } from '../web/js/audio/SpatialMix.js';
import { SoundRule } from '../web/js/audio/SoundRule.js';
import { WeaponSounds } from '../web/js/audio/WeaponSounds.js';
import { HitSounds } from '../web/js/audio/HitSounds.js';
import { PlayerSounds } from '../web/js/audio/PlayerSounds.js';
import { PickupSounds } from '../web/js/audio/PickupSounds.js';
import { ZombieSounds } from '../web/js/audio/ZombieSounds.js';
import { WorldSounds } from '../web/js/audio/WorldSounds.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { Enemy } from '../web/js/enemies/Enemy.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { Runner } from '../web/js/enemies/Runner.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';

/** Stands in for WebAudioOutput: remembers what it was told to play. */
class RecordingOutput {
  constructor() {
    this.played = [];
    this.loops = new Map();
    this.loopLog = [];
  }

  play(cue, mix) {
    this.played.push({ cue, ...mix });
  }

  setLoop(key, cue) {
    this.loopLog.push([key, cue]);
    if (cue === null) this.loops.delete(key);
    else this.loops.set(key, cue);
  }

  get cues() {
    return this.played.map(entry => entry.cue);
  }
}

function setup(listener = { x: 0, z: 0, yaw: 0 }) {
  const events = new EventBus();
  const output = new RecordingOutput();
  const board = new SoundBoard(output, () => listener);
  return { events, output, board, listener };
}

function zombie(EnemyClass, events, id, x = 0, z = 0) {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const pathFinder = new PathFinder(collision, { clearance: 0.002 });
  const enemy = new EnemyClass({ events, pathFinder });
  enemy.activate(id, { x, z }, { time: 0 });
  return enemy;
}

test('SpatialMix pans to the side the sound is on and fades with distance', () => {
  const ears = { x: 0, z: 0, yaw: 0 };
  assert.deepEqual(SpatialMix.of(null, { x: 5, z: 0 }), { pan: 0, gain: 1 });
  assert.ok(SpatialMix.of(ears, { x: 5, z: 0 }).pan > 0.8, 'right of a player looking toward -Z');
  assert.ok(SpatialMix.of(ears, { x: -5, z: 0 }).pan < -0.8);
  assert.ok(Math.abs(SpatialMix.of(ears, { x: 0, z: -5 }).pan) < 1e-9, 'straight ahead is centred');
  // Turned left a quarter: -X is now ahead and -Z is on the right.
  assert.ok(SpatialMix.of({ x: 0, z: 0, yaw: Math.PI / 2 }, { x: 0, z: -5 }).pan > 0.8);
  assert.equal(SpatialMix.of(ears, { x: 15, z: 0 }, 30).gain, 0.5);
  assert.equal(SpatialMix.of(ears, { x: 40, z: 0 }, 30).gain, 0);
});

test('SoundBoard skips a cue inside its cooldown and drops sounds out of earshot', () => {
  const { output, board } = setup();
  board.cooldown('hurt', 0.25);
  assert.equal(board.play('hurt'), true);
  assert.equal(board.play('hurt'), false);
  board.update(0.3);
  assert.equal(board.play('hurt'), true);
  assert.equal(board.play('explosion', { position: { x: 100, z: 0 } }), false);
  assert.equal(board.play('explosion', { position: { x: 0, z: -15 }, volume: 0.5 }), true);
  assert.deepEqual(output.cues, ['hurt', 'hurt', 'explosion']);
  assert.equal(output.played[2].gain, 0.25);
});

test('SoundBoard.play keeps its own range unless one sound asks for another', () => {
  const { output, board } = setup();
  assert.equal(board.play('explosion', { position: { x: 40, z: 0 } }), false);
  assert.equal(board.play('shot_pistol', { position: { x: 40, z: 0 }, range: 80 }), true);
  assert.equal(output.played[0].gain, 0.5);
});

test('SoundBoard.hold keeps a loop going while renewed, then falls back or stops', () => {
  const { output, board } = setup();
  board.loop('weapon', 'idle');
  board.hold('weapon', 'cut', 0.2, { then: 'idle' });
  board.update(0.1);
  board.hold('weapon', 'cut', 0.2, { then: 'idle' });
  board.update(0.15);
  assert.equal(output.loops.get('weapon'), 'cut', 'renewed in time, still cutting');
  board.update(0.1);
  assert.equal(output.loops.get('weapon'), 'idle');
  board.hold('other', 'buzz', 0.1);
  board.update(0.2);
  assert.equal(output.loops.has('other'), false);
  assert.deepEqual(output.loopLog.filter(([key]) => key === 'weapon').map(([, cue]) => cue), ['idle', 'cut', 'idle']);
  board.dispose();
  assert.equal(output.loops.size, 0);
});

test('SoundRule is abstract and installs once', () => {
  assert.throws(() => new SoundRule(new EventBus()), TypeError);
  const { events, board } = setup();
  const rule = new WorldSounds(events);
  board.install(rule);
  assert.throws(() => board.install(rule));
});

test('WeaponSounds plays my shots and swings, the hit cue only on a hit, and ignores others', () => {
  const { events, output, board } = setup();
  board.install(new WeaponSounds(events, 'p1')
    .register('pistol', { fire: 'shot_pistol' })
    .register('katana', { fire: 'katana_swing', hit: 'katana_hit' }));
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'pistol', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'pistol', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'katana', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'katana', hit: { targetId: 'z1' } });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'grenade', hit: null });
  events.emit(EVENTS.WEAPON_RELOADED, { ownerId: 'p1', weaponId: 'pistol' });
  assert.deepEqual(output.cues, ['shot_pistol', 'katana_swing', 'katana_swing', 'katana_hit', 'reload']);
});

test('WeaponSounds idles the chainsaw in hand, cuts while firing and goes quiet when put away', () => {
  const { events, output, board } = setup();
  board.install(new WeaponSounds(events, 'p1', { workingSeconds: 0.2 })
    .register('chainsaw', { held: 'chainsaw_idle', working: 'chainsaw_cut' }));
  events.emit(EVENTS.WEAPON_CHANGED, { ownerId: 'p1', weaponId: 'chainsaw' });
  assert.equal(output.loops.get('weapon'), 'chainsaw_idle');
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'chainsaw', hit: null });
  assert.equal(output.loops.get('weapon'), 'chainsaw_cut');
  board.update(0.3);
  assert.equal(output.loops.get('weapon'), 'chainsaw_idle');
  events.emit(EVENTS.WEAPON_CHANGED, { ownerId: 'p1', weaponId: 'pistol' });
  assert.equal(output.loops.has('weapon'), false);
  assert.deepEqual(output.cues, [], 'the chainsaw is only loops');
});

test('HitSounds ticks on my bullet hits, pings on headshots and drops on kills only', () => {
  const { events, output, board } = setup();
  board.install(new HitSounds(events, 'p1'));
  const walker = zombie(Walker, events, 'z1');
  const hit = (amount, hitPart = 'body', sourceId = 'p1', kind = 'bullet') =>
    walker.damageable.takeDamage(new DamageInfo({ amount, sourceId, targetId: 'z1', hitPart, kind }));
  hit(10);
  hit(10, 'head');
  hit(10, 'body', 'p2');
  hit(10, 'body', 'p1', 'melee');
  hit(1000);
  assert.deepEqual(output.cues, ['hit', 'headshot', 'kill']);
});

test('PlayerSounds follows only the local player', () => {
  const { events, output, board } = setup();
  board.install(new PlayerSounds(events, 'p1'));
  events.emit(EVENTS.ENTITY_DAMAGED, { entity: { id: 'p1' }, amount: 5 });
  events.emit(EVENTS.ENTITY_DAMAGED, { entity: { id: 'z1' }, amount: 5 });
  events.emit(EVENTS.ENTITY_HEALED, { entity: { id: 'p1' }, amount: 20 });
  events.emit(EVENTS.ITEM_THROWN, { ownerId: 'p1' });
  events.emit(EVENTS.ITEM_THROWN, { ownerId: 'p2' });
  assert.deepEqual(output.cues, ['hurt', 'heal', 'throw']);
});

test('PickupSounds plays what was picked up, with a fallback for supplies', () => {
  const { events, output, board } = setup();
  board.install(new PickupSounds(events, 'p1')
    .register(['rifle', 'shotgun'], 'pickup_gun')
    .register('katana', 'pickup_melee'));
  for (const weaponId of ['rifle', 'katana', 'bandage']) events.emit(EVENTS.WEAPON_PICKED_UP, { ownerId: 'p1', weaponId });
  events.emit(EVENTS.WEAPON_PICKED_UP, { ownerId: 'p2', weaponId: 'shotgun' });
  events.emit(EVENTS.AMMO_REFILLED, { ownerId: 'p1' });
  events.emit(EVENTS.AMMO_REFILLED, { ownerId: 'p2' });
  assert.deepEqual(output.cues, ['pickup_gun', 'pickup_melee', 'pickup_item', 'ammo_refill']);
});

test('ZombieSounds voices each kind from where it stands and falls back to the Enemy voice', () => {
  const { events, output, board } = setup();
  const enemies = [];
  board.install(new ZombieSounds(events, () => enemies, { rng: () => 0, gapSeconds: [1, 1] })
    .register(Enemy, { groan: 'zombie_groan', death: 'zombie_death' })
    .register(Runner, { spawn: 'zombie_scream', death: 'zombie_death' }));
  const runner = zombie(Runner, events, 'r1', 6, 0);
  const walker = zombie(Walker, events, 'w1', -6, 0);
  enemies.push(runner, walker);
  events.emit(EVENTS.ENEMY_SPAWNED, { enemy: runner });
  events.emit(EVENTS.ENEMY_SPAWNED, { enemy: walker });
  assert.deepEqual(output.cues, ['zombie_scream'], 'walkers come in quietly');
  assert.ok(output.played[0].pan > 0, 'the runner is on the right');
  board.update(1);
  assert.equal(output.played[1].cue, 'zombie_groan', 'the runner has no groan, so the walker groans');
  assert.ok(output.played[1].pan < 0);
  walker.damageable.takeDamage(new DamageInfo({ amount: 1000, targetId: 'w1' }));
  assert.equal(output.cues.at(-1), 'zombie_death');
  board.update(1);
  assert.equal(output.cues.length, 3, 'nobody left who groans');
});

test('WorldSounds plays explosions in place and the wave cues', () => {
  const { events, output, board } = setup();
  board.install(new WorldSounds(events));
  events.emit(EVENTS.EXPLODED, { kind: 'grenade', x: -10, y: 0, z: 0, radius: 4 });
  events.emit(EVENTS.WAVE_STARTED, { wave: 1 });
  events.emit(EVENTS.WAVE_CLEARED, { wave: 1 });
  events.emit(EVENTS.GAME_OVER, { wave: 1 });
  assert.deepEqual(output.cues, ['explosion', 'wave_start', 'wave_clear', 'game_over']);
  assert.ok(output.played[0].pan < 0);
  board.dispose();
  events.emit(EVENTS.WAVE_STARTED, { wave: 2 });
  assert.equal(output.cues.length, 4, 'disposed rules stop listening');
});
