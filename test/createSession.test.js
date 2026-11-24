import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSession } from '../web/js/game/createSession.js';
import { Difficulty } from '../web/js/game/Difficulty.js';
import { EVENTS } from '../web/js/game/events.js';

const levelRaw = JSON.parse(readFileSync(new URL('../web/levels/ch2.json', import.meta.url), 'utf8'));

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
    const [pickups, crates] = session.pickups.parts;
    assert.equal(session.state, 'lobby');
    assert.equal(session.objective.remaining, levelRaw.objective.seconds);
    assert.equal(ctx.collision.boxes.length, levelRaw.colliders.length);
    assert.equal(pickups.pickups.length, levelRaw.markers.filter(marker => pickups.catalog.hasPool(marker.type)).length);
    assert.equal(crates.crates.length, levelRaw.markers.filter(marker => marker.type === 'ammo').length);
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
