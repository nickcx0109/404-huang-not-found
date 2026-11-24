import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../web/js/game/createSession.js';
import { Difficulty } from '../web/js/game/Difficulty.js';
import { EVENTS } from '../web/js/game/events.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { parseServerMessage } from '../web/js/net/protocol.js';
import { SnapshotWriter, SNAPSHOT_RANGE } from '../server/game/SnapshotWriter.js';
import { EventRelay, standardRelayedEvents } from '../server/game/EventRelay.js';
import { RemoteController } from '../server/game/RemoteController.js';
import { Bandage } from '../web/js/weapons/Bandage.js';

const PLAYER_KEYS = ['id', 'x', 'y', 'z', 'yaw', 'pitch', 'health', 'downed', 'alive', 'weapon', 'ammo', 'reserve',
  'maxHealth', 'magazine', 'reloading', 'slots', 'slot', 'healing', 'offer', 'action', 'rooted', 'speed'];
const ENEMY_KEYS = ['id', 'type', 'x', 'z', 'yaw', 'health', 'state'];
const decimals = value => (String(value).split('.')[1] ?? '').length;

function arena(t, zombies = [{ x: 0, z: -6, r: 0 }]) {
  const level = {
    name: 'arena', bounds: { w: 200, d: 200 }, colliders: [], props: [], bookmarks: [],
    markers: [{ id: 'gun-1', type: 'weapon', item: 'rifle', x: 3, z: 3 }],
    spawns: { players: [{ x: 0, z: 0 }], zombies },
  };
  const a = new RemoteController({ x: 0.123456, z: 0.987654, yaw: 1.23456 });
  const b = new RemoteController({ x: 1, z: 0 });
  const session = createSession(level, {
    players: [{ id: 'p1', name: 'Ann', controller: a }, { id: 'p2', name: 'Bo', controller: b }],
    difficulty: new Difficulty({ count: 0.5, speed: 0.001 }), rng: () => 0,
  });
  t.after(() => session.dispose());
  session.start();
  for (let i = 0; i < 90 && session.context.enemies.length === 0; i++) session.update(1 / 30);
  session.update(1 / 30); // the new zombie picks its target
  return { session, a, b };
}

test('a snapshot has exactly the protocol fields, rounded, and passes the client parser', t => {
  const { session } = arena(t);
  const writer = new SnapshotWriter();
  const frame = writer.frame(session, { tick: 12, time: 123456.7 });
  const message = writer.forViewer(frame, 41);
  assert.deepEqual(Object.keys(message).sort(),
    ['ack', 'breakSeconds', 'enemies', 'goal', 'kills', 'objective', 'pickups', 'players', 'state', 't', 'tick',
      'time', 'wave'].sort());
  assert.deepEqual([message.t, message.tick, message.time, message.ack, message.state, message.wave, message.kills],
    ['snapshot', 12, 123457, 41, 'playing', 1, 0]);
  assert.equal(frame.ack, -1, 'the shared frame is not changed per viewer');

  const [ann, bo] = message.players;
  assert.deepEqual(Object.keys(ann), PLAYER_KEYS);
  assert.deepEqual(ann, {
    id: 'p1', x: 0.12, y: 0, z: 0.99, yaw: 1.235, pitch: 0, health: 100, downed: false, alive: true,
    weapon: 'pistol', ammo: 12, reserve: null,
    maxHealth: 100, magazine: 12, reloading: false, slots: ann.slots, slot: ann.slot, healing: false,
    offer: null, action: null, rooted: false, speed: 1,
  });
  assert.equal(ann.slots[ann.slot].id, 'pistol', 'the selected slot holds the weapon in hand');
  assert.ok(ann.slots.some(slot => slot.id === 'bat'));
  assert.ok(ann.slots.every(slot => Object.keys(slot).join() === 'id,count,charge'));
  assert.deepEqual([message.goal, message.objective, message.breakSeconds], ['SURVIVE THE WAVES', null, 0]);
  assert.equal(session.playerById('p1').weapons.current.reserve, Infinity, 'the endless reserve travels as null');
  assert.equal(bo.id, 'p2');

  assert.equal(message.enemies.length, 1);
  const [zombie] = message.enemies;
  assert.deepEqual(Object.keys(zombie), ENEMY_KEYS);
  assert.equal(zombie.type, 'walker');
  assert.equal(zombie.state, 'chase');
  assert.ok(decimals(zombie.x) <= 2 && decimals(zombie.z) <= 2 && decimals(zombie.yaw) <= 3);
  assert.deepEqual(message.pickups, [{ id: 'gun-1', item: 'rifle' }]);

  assert.deepEqual(parseServerMessage(JSON.stringify(message)), message);
});

test('weapons without rounds send null ammo; a downed player is downed and not alive', t => {
  const { session } = arena(t);
  const ann = session.playerById('p1');
  ann.weapons.switchTo(ann.weapons.weapons.findIndex(weapon => weapon?.id === 'bat'));
  ann.damageable.takeDamage(new DamageInfo({ amount: 500, sourceId: 'test', targetId: 'p1' }));
  const message = new SnapshotWriter().forViewer(new SnapshotWriter().frame(session, { tick: 1, time: 0 }), 0);
  assert.deepEqual(message.players[0], { ...message.players[0], weapon: 'bat', ammo: null, reserve: null,
    health: 0, downed: true, alive: false });
  assert.ok(parseServerMessage(JSON.stringify(message)));
});

test('the HUD fields carry the pickup offer, a reload, healing items and the objective countdown', t => {
  const { session, a } = arena(t);
  const ann = session.playerById('p1');
  const writer = new SnapshotWriter();
  a.x = 3; a.z = 3; // stands on the rifle spot
  session.update(1 / 30);
  let [record] = writer.frame(session, { tick: 1, time: 0 }).players;
  assert.equal(record.offer?.name, 'RIFLE');
  assert.equal(typeof record.offer.swap, 'boolean');
  ann.weapons.current.ammo = 3;
  session.context.events.emit(EVENTS.RELOAD_REQUESTED, { ownerId: 'p1' });
  session.update(1 / 30);
  [record] = writer.frame(session, { tick: 2, time: 0 }).players;
  assert.equal(record.reloading, true);
  assert.equal(record.healing, false);
  session.objective = { goal: 'HOLD', status: { label: 'GATE', seconds: 42 } };
  assert.deepEqual(writer.frame(session, { tick: 3, time: 0 }).objective, { label: 'GATE', seconds: 42 });
});

test('rooted follows GameSession.isRooted (bandaging too) and speed carries the speed multiplier', t => {
  const { session, a } = arena(t);
  const ann = session.playerById('p1');
  const writer = new SnapshotWriter();
  const read = () => writer.frame(session, { tick: 1, time: 0 }).players[0];
  assert.deepEqual([read().rooted, read().speed], [false, 1]);
  ann.weapons.equip(new Bandage());
  ann.damageable.health = 50;
  assert.equal(ann.weapons.current.fire(session.context), true);
  assert.equal(session.isRooted('p1'), true);
  assert.equal(read().rooted, true, 'a bandaging player is held still, not only a downed one');
  a.speedMultiplier = 1.3;
  assert.equal(read().speed, 1.3);
});

test('only zombies within 60 m of some player are sent', t => {
  const { session, b } = arena(t);
  const [zombie] = session.context.enemies;
  const writer = new SnapshotWriter();
  zombie.position.x = SNAPSHOT_RANGE + 0.5;
  zombie.position.z = 0;
  assert.equal(writer.frame(session, { tick: 1, time: 0 }).enemies.length, 1, 'p2 at x = 1 is 59.5 m away');
  zombie.position.x = SNAPSHOT_RANGE + 10;
  assert.equal(writer.frame(session, { tick: 1, time: 0 }).enemies.length, 0);
  b.x = SNAPSHOT_RANGE;
  assert.equal(writer.frame(session, { tick: 1, time: 0 }).enemies.length, 1, 'close to the other player');
});

test('EventRelay forwards the curated events as plain, parseable messages and stops on detach', t => {
  const { session } = arena(t);
  const events = session.context.events;
  const sent = [];
  const relay = new EventRelay().attach(events, message => sent.push(message));
  const [zombie] = session.context.enemies;

  session.context.aim.origin.y = 1.7;
  Object.assign(session.context.aim.direction, { x: 0, y: -0.05, z: -1 });
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: 'p1' });
  zombie.damageable.takeDamage(new DamageInfo({ amount: 1000, sourceId: 'p1', targetId: zombie.id }));
  session.playerById('p2').damageable.takeDamage(new DamageInfo({ amount: 100, sourceId: zombie.id, targetId: 'p2' }));

  const names = sent.map(message => message.name);
  for (const name of [EVENTS.WEAPON_FIRED, EVENTS.ENTITY_DAMAGED, EVENTS.ENTITY_DIED]) assert.ok(names.includes(name), name);
  const fired = sent.find(message => message.name === EVENTS.WEAPON_FIRED);
  assert.deepEqual(fired.detail, { ownerId: 'p1', weaponId: 'pistol', ammo: 11, reserve: null, hit: { targetId: zombie.id, hitPart: 'head' } });
  const downed = sent.filter(message => message.name === EVENTS.ENTITY_DAMAGED).at(-1);
  assert.deepEqual(downed.detail, { targetId: 'p2', sourceId: zombie.id, amount: 100, health: 0, hitPart: 'body', kind: 'bullet', downed: true });
  for (const message of sent) {
    assert.equal(message.t, 'event');
    assert.deepEqual(parseServerMessage(JSON.stringify(message)), message, message.name);
  }

  relay.detach();
  const count = sent.length;
  events.emit(EVENTS.WAVE_STARTED, { wave: 2, count: 5 });
  assert.equal(sent.length, count);
});

test('every relayed event names a real game event', () => {
  const known = new Set(Object.values(EVENTS));
  for (const { name } of standardRelayedEvents()) assert.ok(known.has(name), name);
});
