import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { GameplayLifecycle } from '../web/js/game/GameplayLifecycle.js';
import { ExampleWaveDirector } from '../web/js/game/WaveDirector.js';
import { EVENTS } from '../web/js/game/events.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { WeaponCatalog } from '../web/js/pickups/WeaponCatalog.js';
import { PickupField } from '../web/js/pickups/PickupField.js';
import { AmmoCrateField } from '../web/js/pickups/AmmoCrateField.js';
import { InteractionList } from '../web/js/pickups/InteractionList.js';

function fixture() {
  const events = new EventBus();
  const scene = { children: [], remove(view) { this.children.splice(this.children.indexOf(view), 1); } };
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const level = { spawns: { zombies: [{ x: 5, z: 5, r: 1 }] }, markers: [
    { id: 'gun', type: 'weapon', item: 'rifle', x: 0, z: 0, r: 1.2 },
    { id: 'ammo', type: 'ammo', x: 0, z: 0, r: 1.2 },
  ] };
  const create = () => {
    const ctx = new GameContext({ scene, collision, pathFinder: new PathFinder(collision), events, level, rng: () => 0.5 });
    const player = new CombatPlayer('player', { x: 0, z: 0 }, events, new LoadoutHolder('player', events));
    player.weapons.add(new StarterPistol());
    player.weapons.add(new Bat());
    ctx.players.push(player);
    const pickups = PickupField.fromLevel(level, new WeaponCatalog().register('rifle', { create: () => new Rifle(), name: 'RIFLE' }));
    const crates = AmmoCrateField.fromLevel(level);
    const factory = new EnemyFactory(ctx, () => {
      const view = { parent: scene, visible: false, position: { set() {} },
        geometry: { dispose() { view.geometryDisposed = true; } },
        material: { dispose() { view.materialDisposed = true; } } };
      scene.children.push(view);
      return view;
    }).register('walker', Walker);
    const session = new GameSession(ctx, { factory,
      director: new ExampleWaveDirector({ type: 'walker', initialCount: 2, maxCount: 2 }),
      pickups: new InteractionList([pickups, crates]) });
    return { session, player, pickups, crates, dispose: () => session.dispose() };
  };
  return { events, scene, lifecycle: new GameplayLifecycle(events, create) };
}

function listeners(events) {
  return Array.from(events._listeners.values()).reduce((total, entries) => total + entries.size, 0);
}

function start(session) {
  session.start();
  session.update(0);
  assert.equal(session.state, 'playing');
}

test('restart disposes active and pooled enemies, subscriptions, effects and resets the entire run', () => {
  const { events, scene, lifecycle } = fixture();
  const initialListeners = listeners(events);
  const old = lifecycle.current;
  const ctx = old.session.context;
  assert.equal(old.session.state, 'lobby');
  start(old.session);
  assert.equal(ctx.enemies.length, 2);
  const pooled = ctx.enemies[0];
  const views = scene.children.slice();
  events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({ amount: 100, sourceId: old.player.id, targetId: pooled.id }));
  old.session.update(0);
  assert.equal(old.session.kills, 1);
  assert.equal(old.session.factory.active.has(pooled), false);
  assert.equal(old.session.pickUp(old.player.id), true);
  old.player.weapons.current.ammo--;
  assert.equal(old.crates.crates[0].use(old.player, ctx), true);
  ctx.effects.push({ update: () => true });
  const attacker = ctx.enemies[0];
  events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({ amount: 100, sourceId: attacker.id, targetId: old.player.id }));
  old.session.update(0);
  assert.equal(old.session.state, 'game-over');
  events.emit(EVENTS.RESTART_REQUESTED);
  const fresh = lifecycle.current;
  assert.notEqual(fresh.session, old.session);
  assert.equal(old.session.disposed, true);
  assert.equal(ctx.session, null);
  assert.equal(ctx.enemies.length, 0);
  assert.equal(ctx.effects.length, 0);
  assert.equal(ctx.pools.size, 0);
  assert.equal(scene.children.length, 0);
  assert.ok(views.every(view => view.geometryDisposed && view.materialDisposed));
  assert.equal(listeners(events), initialListeners);
  assert.equal(fresh.session.state, 'lobby');
  assert.equal(fresh.session.wave, 0);
  assert.equal(fresh.session.kills, 0);
  assert.equal(fresh.session.context.time, 0);
  assert.equal(fresh.player.damageable.health, 100);
  assert.deepEqual(fresh.player.weapons.weapons.map(weapon => weapon?.id ?? null),
    [null, 'pistol', 'bat', null, null, null, null]);
  assert.equal(fresh.player.weapons.current.ammo, new StarterPistol().ammo);
  assert.equal(fresh.pickups.pickups[0].weapon.id, 'rifle');
  assert.notEqual(fresh.pickups.pickups[0].weapon, old.player.weapons.current);
  assert.equal(fresh.crates.crates[0].readyAt, 0);
  assert.equal(old.session.win(), false);
  old.session.start();
  assert.equal(fresh.session.startRequested, false);
  start(fresh.session);
  assert.equal(fresh.session.wave, 1);
  assert.equal(fresh.session.context.enemies.length, 2);
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: old.player.id });
  assert.equal(old.player.weapons.current.ammo, new Rifle().ammo);
  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(listeners(events), 0);
  assert.equal(scene.children.length, 0);
  assert.equal(lifecycle.restart(), null);
});

test('three restarts keep listener and scene counts stable; commands cannot restart a live run', () => {
  const { events, scene, lifecycle } = fixture();
  const count = listeners(events);
  const original = lifecycle.current;
  events.emit(EVENTS.RESTART_REQUESTED);
  assert.equal(lifecycle.current, original);
  for (let repeat = 0; repeat < 3; repeat++) {
    const session = lifecycle.current.session;
    start(session);
    events.emit(EVENTS.RESTART_REQUESTED);
    assert.equal(lifecycle.current.session, session);
    assert.equal(session.win(), true);
    events.emit(EVENTS.RESTART_REQUESTED);
    assert.equal(scene.children.length, 0);
    assert.equal(listeners(events), count);
    assert.equal(lifecycle.current.session.kills, 0);
    assert.equal(lifecycle.current.session.wave, 0);
  }
  start(lifecycle.current.session);
  assert.equal(scene.children.length, 2);
  lifecycle.dispose();
  assert.equal(listeners(events), 0);
});

test('Victory is explicit, emits results once, freezes combat and supports restart from a break', () => {
  const { events, lifecycle } = fixture();
  const session = lifecycle.current.session;
  const victories = [];
  const off = events.on(EVENTS.VICTORY, detail => victories.push(detail));
  assert.equal(session.win(), false);
  start(session);
  session.kills = 7;
  assert.equal(session.win(), true);
  assert.equal(session.state, 'victory');
  assert.equal(session.canMove, false);
  assert.equal(session.canRestart, true);
  assert.equal(session.win(), false);
  const ammo = lifecycle.current.player.weapons.current.ammo;
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: lifecycle.current.player.id });
  session.update(0.05);
  assert.equal(lifecycle.current.player.weapons.current.ammo, ammo);
  assert.deepEqual(victories, [{ wave: 1, kills: 7 }]);
  events.emit(EVENTS.RESTART_REQUESTED);
  const next = lifecycle.current.session;
  start(next);
  next.changeState(next.states.waveBreak);
  assert.equal(next.win(), true);
  assert.equal(next.state, 'victory');
  off();
  lifecycle.dispose();
});
