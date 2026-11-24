import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../web/js/game/createSession.js';
import { Difficulty } from '../web/js/game/Difficulty.js';
import { parseServerMessage } from '../web/js/net/protocol.js';
import { SnapshotWriter, CRATE_REFRESH_FRAMES } from '../server/game/SnapshotWriter.js';
import { RemoteController } from '../server/game/RemoteController.js';
import { ThrownGrenade } from '../web/js/effects/ThrownGrenade.js';
import { ThrownMolotov } from '../web/js/effects/ThrownMolotov.js';
import { FireArea } from '../web/js/effects/FireArea.js';

const decimals = value => (String(value).split('.')[1] ?? '').length;

function yard(t) {
  const level = {
    name: 'yard', bounds: { w: 200, d: 200 }, colliders: [], props: [], bookmarks: [],
    markers: [{ id: 'ammo-1', type: 'ammo', x: 4, z: 0 }, { id: 'ammo-2', type: 'ammo', x: -4, z: 0 }],
    spawns: { players: [{ x: 0, z: 0 }], zombies: [{ x: 0, z: -30, r: 0 }] },
  };
  const session = createSession(level, {
    players: [{ id: 'p1', name: 'Ann', controller: new RemoteController({ x: 0, z: 0 }) }],
    difficulty: new Difficulty({ count: 0.5, speed: 0.001 }), rng: () => 0,
  });
  t.after(() => session.dispose());
  session.start();
  return session;
}

const parsed = message => parseServerMessage(JSON.stringify(message));

test('snapshots list the crates when they change and once a second otherwise', t => {
  const session = yard(t);
  const writer = new SnapshotWriter();
  const frame = () => writer.frame(session, { tick: 1, time: 1 });
  const first = frame();
  assert.deepEqual(first.crates, [{ id: 'ammo-1', ready: true }, { id: 'ammo-2', ready: true }]);
  assert.ok(parsed(writer.forViewer(first, 0)), 'the client parser accepts it');
  assert.equal(frame().crates, undefined, 'unchanged crates are not sent again at once');

  session.pickups.ammoCrates.crates[1].readyAt = session.context.time + 30;
  assert.deepEqual(frame().crates, [{ id: 'ammo-1', ready: true }, { id: 'ammo-2', ready: false }]);
  let sent = 0;
  for (let index = 0; index < CRATE_REFRESH_FRAMES * 2; index++) if (frame().crates) sent++;
  assert.equal(sent, 2, 'the unchanged list is repeated every CRATE_REFRESH_FRAMES snapshots');
});

test('a level without crates sends no crates field', t => {
  const session = yard(t);
  session.pickups.ammoCrates.crates.length = 0;
  assert.equal('crates' in new SnapshotWriter().frame(session, { tick: 1, time: 1 }), false);
});

test('snapshots list the effects with a stable id, rounded, and only while there are some', t => {
  const session = yard(t);
  const writer = new SnapshotWriter();
  const frame = () => writer.frame(session, { tick: 1, time: 1 });
  assert.equal('effects' in frame(), false, 'no effects, no field');

  const ctx = session.context;
  const grenade = new ThrownGrenade({ position: { x: 1.23456, y: 1.5, z: -2.98765 }, velocity: { x: 0, y: 0, z: -5 }, time: ctx.time });
  const fire = new FireArea({ x: 3.333, y: 0, z: 4 }, ctx.time, 'p1', { radius: 3 });
  ctx.effects.push(grenade, fire);
  const message = frame();
  assert.deepEqual(message.effects, [
    { id: 1, kind: 'grenade', x: 1.23, y: 1.5, z: -2.99, radius: 5 },
    { id: 2, kind: 'fire', x: 3.33, y: 0, z: 4, radius: 3 },
  ]);
  assert.ok(message.effects.every(effect => ['x', 'y', 'z'].every(key => decimals(effect[key]) <= 2)));
  assert.ok(parsed(writer.forViewer(message, 0)));

  ctx.effects.splice(0, 1);
  ctx.effects.push(new ThrownMolotov({ position: { x: 0, y: 1, z: 0 }, velocity: { x: 1, y: 0, z: 0 } }));
  assert.deepEqual(frame().effects.map(effect => [effect.id, effect.kind]), [[2, 'fire'], [3, 'molotov']],
    'ids stay with their effect and are never reused');
  assert.equal('radius' in frame().effects[1], false, 'a fire bottle in flight has no radius');
});

test('a molotov thrown in a running session shows in flight, then as burning ground', t => {
  const session = yard(t);
  const writer = new SnapshotWriter();
  session.context.effects.push(new ThrownMolotov({ position: { x: 0, y: 1.5, z: 0 },
    velocity: { x: 0, y: 2, z: -6 }, time: session.context.time }));
  const kinds = new Set();
  for (let step = 0; step < 60; step++) {
    session.update(1 / 30);
    for (const effect of writer.frame(session, { tick: step, time: step }).effects ?? []) kinds.add(effect.kind);
  }
  assert.deepEqual([...kinds], ['molotov', 'fire']);
});

test('parseServerMessage checks the optional crates and effects lists', () => {
  const base = { t: 'snapshot', tick: 3, time: 100, ack: 2, state: 'playing', wave: 1, kills: 0, players: [], enemies: [] };
  const good = { ...base, crates: [{ id: 'ammo-1', ready: false }],
    effects: [{ id: 4, kind: 'fire', x: 1, y: 0, z: 2, radius: 3 }, { id: 'e5', kind: 'grenade', x: 0, y: 1, z: 0 }] };
  assert.deepEqual(parsed(good), good);
  const wrong = [
    { crates: {} }, { crates: [{ id: 'ammo-1' }] }, { crates: [{ id: 1, ready: true }] }, { crates: [{ id: 'a', ready: 'yes' }] },
    { effects: {} }, { effects: [null] }, { effects: [{ id: 1, kind: 'fire', x: 1, z: 2 }] },
    { effects: [{ id: 1, x: 1, y: 0, z: 2 }] }, { effects: [{ id: null, kind: 'fire', x: 1, y: 0, z: 2 }] },
    { effects: [{ id: 1, kind: 'fire', x: 1, y: 0, z: 2, radius: '3' }] },
  ];
  for (const extra of wrong) assert.equal(parsed({ ...base, ...extra }), null, JSON.stringify(extra));
});
