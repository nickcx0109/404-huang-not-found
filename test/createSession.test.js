import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventBus } from '../web/js/core/EventBus.js';
import { createSession } from '../web/js/game/createSession.js';
import { Difficulty } from '../web/js/game/Difficulty.js';
import { EVENTS } from '../web/js/game/events.js';
import { PLAYER_BODY } from '../web/js/player/PlayerBody.js';

const levelRaw = JSON.parse(readFileSync(new URL('../web/levels/ch2.json', import.meta.url), 'utf8'));
const step = 1 / 30;
const arena = {
  name: 'session-test',
  bounds: { w: 20, d: 20 },
  colliders: [],
  props: [],
  bookmarks: [],
  spawns: {
    players: [{ x: 0, z: 0 }],
    zombies: [{ x: 0, z: -1, r: 0 }],
  },
};

test('createSession validates every player ID before building loadouts or emitting events', t => {
  const events = new EventBus();
  const emit = t.mock.method(events, 'emit');
  for (const [ids, error] of [
    [['valid', ''], /non-empty string/],
    [['valid', '  '], /non-empty string/],
    [['valid', undefined], /non-empty string/],
    [['valid', 'enemy-1'], /Reserved player ID: enemy-1/],
    [['valid', 'valid'], /Duplicate player ID: valid/],
  ]) {
    const players = ids.map(id => ({ id, controller: { x: 0, z: 0 } }));
    assert.throws(() => createSession(levelRaw, {
      players, events, rng: () => assert.fail('Do not build pickups for an invalid roster'),
    }), error);
    assert.equal(emit.mock.callCount(), 0);
  }
});

test('createSession defaults schedule 40 enemies and a walker deals real damage', t => {
  const players = [{ id: 'player', controller: { x: 0, z: 0 } }];
  const session = createSession(arena, { players });
  t.after(() => session.dispose());
  const waves = [];
  session.context.events.on(EVENTS.WAVE_STARTED, wave => waves.push(wave));
  session.start();
  session.update(step);
  assert.deepEqual(waves, [{ wave: 1, count: 40 }]);
  assert.equal(session.context.enemies[0].speed, 3.2);

  const player = session.playerById('player');
  assert.equal(player.damageable.health, 100);
  session.update(step);
  assert.equal(player.damageable.health, 90);
});

test('two players with opposite controller yaw alternate hits on their own targets', t => {
  const level = {
    ...arena,
    spawns: {
      ...arena.spawns,
      zombies: [{ x: -2, z: -6, r: 0 }, { x: 2, z: 6, r: 0 }],
    },
  };
  const north = { id: 'north', controller: { x: -2, y: 0, z: 0, yaw: 0, pitch: -0.1 } };
  const south = { id: 'south', controller: { x: 2, y: 0, z: 0, yaw: Math.PI, pitch: -0.1 } };
  let roll = 0;
  const session = createSession(level, {
    players: [north, south],
    difficulty: new Difficulty({ count: 0.5, speed: 0.001 }),
    rng: () => roll,
  });
  t.after(() => session.dispose());
  const { aim, enemies, events } = session.context;
  session.start();
  session.update(step);
  roll = 0.75;
  for (let i = 0; i < 72; i++) session.update(step);
  assert.equal(enemies.length, 2);
  const [northTarget, southTarget] = enemies;

  function fire({ id, controller: { x, y, z, yaw, pitch } }) {
    Object.assign(aim.origin, { x, y: y + PLAYER_BODY.eyeHeight, z });
    Object.assign(aim.direction, {
      x: -Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch),
    });
    events.emit(EVENTS.FIRE_REQUESTED, { ownerId: id });
  }

  fire(north);
  assert.equal(northTarget.damageable.health, 34);
  assert.equal(southTarget.damageable.health, 68);
  fire(south);
  assert.equal(northTarget.damageable.health, 34);
  assert.equal(southTarget.damageable.health, 34);

  for (let i = 0; i < 8; i++) session.update(step);
  fire(north);
  assert.equal(northTarget.damageable.health, 0);
  assert.equal(southTarget.damageable.health, 34);
  fire(south);
  assert.equal(southTarget.damageable.health, 0);
  assert.equal(session.kills, 2);
});

for (const count of [1, 3]) {
  test(`createSession runs chapter 2 for 60 seconds with ${count} plain controllers`, t => {
    t.mock.method(globalThis, 'fetch', () => assert.fail('The simulation must not fetch'));
    const players = levelRaw.spawns.players.slice(0, count).map(({ x, z, yaw }, index) => ({
      id: `p${index + 1}`, name: `Player ${index + 1}`,
      controller: { x, z, y: 0, yaw: yaw * Math.PI / 180, pitch: 0, speedMultiplier: 1 },
    }));
    // Stationary players must survive so the objective and enemies actually run for the whole test.
    const difficulty = new Difficulty({ count: 10, speed: 2, damage: 0.001 });
    const session = createSession(levelRaw, { players, difficulty, rng: () => 0.5 });
    t.after(() => session.dispose());
    const ctx = session.context;
    const { weaponPickups, ammoCrates } = session.pickups;
    assert.equal(session.state, 'lobby');
    assert.equal(session.objective.remaining, levelRaw.objective.seconds);
    assert.equal(ctx.collision.boxes.length, levelRaw.colliders.length);
    assert.equal(weaponPickups.pickups.length, levelRaw.markers.filter(marker => weaponPickups.catalog.hasPool(marker.type)).length);
    assert.equal(ammoCrates.crates.length, levelRaw.markers.filter(marker => marker.type === 'ammo').length);
    assert.equal(ctx.players.length, count);
    for (const { id, name, controller } of players) {
      const player = session.playerById(id);
      assert.equal(player.name, name);
      assert.equal(player.controller, controller);
      assert.equal(player.weapons.current.id, 'pistol');
      assert.equal(player.weapons.inSlot('melee').id, 'bat');
    }
    assert.equal(new Set(ctx.players.map(player => player.weapons.current)).size, count);

    const spawned = [];
    ctx.events.on(EVENTS.ENEMY_SPAWNED, ({ enemy }) => spawned.push(enemy));
    players[0].controller.y = 0.25;
    session.start();
    for (let tick = 0; tick < 60 * 30; tick++) session.update(1 / 30);

    assert.equal(session.state, 'playing');
    assert.ok(Math.abs(ctx.time - 60) < 1e-9);
    assert.ok(session.objective.remaining < 121);
    assert.ok(spawned.length > 1);
    assert.ok(spawned.every(enemy => enemy.view === null));
    assert.equal(ctx.players[0].position.y, 0.25);

    players[0].controller.speedMultiplier = 2;
    session.dispose();
    assert.equal(players[0].controller.speedMultiplier, 1);
    assert.equal(ctx.players.length, 0);
  });
}
