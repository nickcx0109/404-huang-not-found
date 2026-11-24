import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SessionRoomGame, STEP_SECONDS } from '../server/game/SessionRoomGame.js';
import { Room } from '../server/rooms/Room.js';
import { FakeMember } from './support/FakeMember.js';
import { LevelFlowMirror } from '../web/js/net/LevelFlowMirror.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { LevelData } from '../web/js/LevelData.js';
import { MessageParser } from '../server/protocol/ClientMessages.js';
import { parseServerMessage } from '../web/js/net/protocol.js';
import { InteractAction } from '../server/game/actions/InteractAction.js';

const base = JSON.parse(readFileSync(new URL('../web/levels/ch2.json', import.meta.url), 'utf8'));
function level(name, target, blocked = false) {
  return { ...base, name, colliders: blocked ? [{ id: 'block_to_' + target, x: 5, z: 0, y: 0, w: 1, d: 1, h: 2 }] : [],
    props: [], markers: [{ id: 'to_' + target, type: 'exit', x: 5, z: 0, r: 1, yaw: 90 }],
    spawns: { ...base.spawns, players: [{ x: 0, z: 0, yaw: 0 }, { x: 0, z: 2, yaw: 0 }] } };
}
function setup(t, blocked = false, load) {
  let ms = 1000;
  const a = level('a', 'b', blocked), b = level('b', 'a');
  const game = new SessionRoomGame({ now: () => ms, loadLevel: load ?? (name => ({ a, b })[name]), sessionOptions: { rng: () => 0.5 } });
  const room = new Room('ABCD', 'a', game);
  const host = new FakeMember('host'), guest = new FakeMember('guest');
  room.add(host, 'Ann'); room.add(guest, 'Bo'); room.start();
  t.after(() => game.end());
  const step = (n = 1, holding = false) => {
    for (let i = 0; i < n; i++) {
      ms += 1000 * STEP_SECONDS;
      if (holding) game.action(room, 'p1', { kind: 'interact', holding: true });
      game.tick(room, STEP_SECONDS);
    }
  };
  const place = (x, z = 0) => { Object.assign(game.controllers.get('p1'), { x, z }); };
  return { game, room, host, guest, step, place, a, b };
}

test('online exits require E at the authoritative pose; transition carries every seat and announces the new level', t => {
  const { game, room, host, guest, step, place } = setup(t);
  game.action(room, 'p1', { kind: 'interact', holding: true, x: 5 });
  step();
  assert.equal(room.level, 'a', 'untrusted action coordinates do not choose the exit');
  game.action(room, 'p1', { kind: 'interact', holding: false });
  place(5); step();
  assert.equal(room.level, 'a', 'entry without held E does not travel');
  step(1, true);
  assert.equal(room.level, 'b');
});

test('room transition keeps health, ammo and held seats; rejoin observes current level and arrival', t => {
  const { game, room, host, guest, step, place } = setup(t);
  game.session.playerById('p1').damageable.health = 47;
  const pistol = game.session.playerById('p1').weapons.current;
  pistol.ammo = 3;
  const token = room.describeFor('p2').token;
  room.drop('p2', 100000);
  place(5); step();
  assert.equal(room.level, 'a', 'walking alone cannot leave');
  step(1, true);
  assert.equal(room.level, 'b');
  assert.equal(game.session.playerById('p1').damageable.health, 47);
  assert.equal(game.session.playerById('p1').weapons.current.ammo, 3);
  assert.equal(game.controllers.get('p1').x, 5);
  assert.equal(game.controllers.get('p1').yaw, Math.PI / 2);
  const back = new FakeMember('back'); room.reclaim(token, back);
  assert.equal(back.ofType('room').at(-1).level, 'b');
  step(2);
  assert.equal(room.level, 'b', 'arrival exit stays disarmed');
  assert.ok(back.ofType('snapshot').every(m => m.level === 'b'));
  assert.ok(host.ofType('event').some(m => m.name === 'level.changed'));
  assert.ok(host.sent.every(m => parseServerMessage(JSON.stringify(m))));
});

test('blocked exit progress is server timed, cancels on release/range/away and clears for both seats', t => {
  const { game, room, host, step, place } = setup(t, true);
  place(3.5);
  step(35, true);
  game.action(room, 'p1', { kind: 'interact', holding: false }); step();
  assert.equal(game.levelFlow.status.get('p1').progress, 0);
  step(35, true); place(0); step();
  game.action(room, 'p1', { kind: 'interact', holding: false });
  place(3.5); step();
  assert.equal(game.levelFlow.status.get('p1').progress, 0);
  step(35, true); room.drop('p1', 100000); step(90);
  assert.ok(game.session.context.collision.boxes.some(box => box.id === 'block_to_b'));
  room.reclaim(room.describeFor('p1').token, host);
  step(76, true);
  assert.ok(!game.session.context.collision.boxes.some(box => box.id === 'block_to_b'));
  assert.ok([...game.levelFlow.flows.values()].every(flow => !flow.isBlocked('to_b')));
  assert.ok(game.cleared.has('a:to_b'));
  assert.ok(host.ofType('event').some(m => m.name === 'level.block-cleared'));
  place(5); step(1, true); assert.equal(room.level, 'b');
  place(0); step(); place(5); step(1, true);
  assert.equal(room.level, 'a');
  assert.ok(!game.session.context.collision.boxes.some(box => box.id === 'block_to_b'), 'cleared across visits');
  step(2);
  assert.ok(host.ofType('snapshot').at(-1).cleared.includes('a:to_b'));
});

test('a lost held heartbeat expires and a downed teammate prevents travel', t => {
  const { game, room, step, place } = setup(t, true);
  place(3.5); game.action(room, 'p1', { kind: 'interact', holding: true });
  step(100);
  assert.ok(game.session.context.collision.boxes.some(box => box.id === 'block_to_b'));
  assert.equal(game.levelFlow.status.get('p1').progress, 0);
  game.session.playerById('p2').damageable.health = 0;
  assert.equal(game.changeLevel(room, { target: 'b', from: 'a' }), false);
  assert.equal(room.level, 'a');
});

test('failed destination preparation leaves the old session usable', t => {
  const { game, room, step, place } = setup(t, false, name => { if (name === 'a') return level('a', 'b'); throw new Error('missing b'); });
  const session = game.session;
  place(5); step(1, true);
  assert.equal(game.session, session); assert.equal(session.disposed, false); assert.equal(room.level, 'a');
  place(0); step(); place(5); step(1, true);
  assert.equal(game.session, session);
});

test('LevelFlowMirror isolates local cleared blocks and restores collision and visuals on leave', () => {
  const data = new LevelData(level('a', 'b', true));
  const world = CollisionWorld.fromLevel(data); world.boxes.length = 0;
  const prop = { userData: { propName: 'block', collider: 'block_to_b' }, visible: false };
  const mirror = new LevelFlowMirror(data, world, { children: [prop] });
  assert.equal(world.boxes.length, 1); assert.equal(prop.visible, true);
  mirror.apply(['a:to_b']); assert.equal(world.boxes.length, 0); assert.equal(prop.visible, false);
  mirror.apply(['other:to_b']); assert.equal(world.boxes.length, 1);
  mirror.dispose(); assert.equal(world.boxes.length, 0); assert.equal(prop.visible, false);
});

test('interact action validates holding and dispatches only the seat identity', () => {
  const parser = new MessageParser();
  assert.equal(parser.parse(JSON.stringify({ t: 'action', kind: 'interact', seq: 1, at: 0 })), null);
  const message = parser.parse(JSON.stringify({ t: 'action', kind: 'interact', seq: 1, at: 0, holding: true }));
  let held;
  new InteractAction().handle({ playerId: 'p2', message, levelFlow: { hold: (...args) => { held = args; } } });
  assert.deepEqual(held, ['p2', true]);
});
