import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { EVENTS } from '../web/js/game/events.js';
import { NetworkedSession } from '../web/js/net/NetworkedSession.js';
import { SnapshotStatus } from '../web/js/ui/hud/SnapshotStatus.js';
import { EntityStandIns } from '../web/js/net/EntityStandIns.js';
import { NetEventTranslator, NET_EVENTS } from '../web/js/net/NetEventTranslator.js';
import { ActionForwarder } from '../web/js/net/ActionForwarder.js';
import { FireCadence } from '../web/js/net/FireCadence.js';
import { WeaponSpecs } from '../web/js/net/WeaponSpecs.js';
import { RemoteLoadout } from '../web/js/net/RemoteLoadout.js';
import { Enemy } from '../web/js/enemies/Enemy.js';
import { Runner } from '../web/js/enemies/Runner.js';
import { HitSounds } from '../web/js/audio/HitSounds.js';
import { ZombieSounds } from '../web/js/audio/ZombieSounds.js';

const room = { t: 'room', code: 'AB2C', you: 'p2', level: 'ch2', state: 'lobby',
  players: [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bo' }] };

function player(id, extra = {}) {
  return { id, x: 1, y: 0, z: 2, yaw: 0, pitch: 0, health: 80, downed: false, alive: true, weapon: 'pistol',
    ammo: 9, reserve: null, maxHealth: 100, magazine: 12, reloading: false,
    slots: [{ id: null, count: null, charge: null }, { id: 'pistol', count: null, charge: null }, { id: 'bat', count: null, charge: null }],
    slot: 1, healing: false, offer: null, action: null, ...extra };
}

function snapshot(time, extra = {}) {
  return { t: 'snapshot', tick: time, time, ack: 3, state: 'playing', wave: 2, kills: 7,
    players: [player('p1', { health: 30, downed: true, healing: true }), player('p2')],
    enemies: [{ id: 'enemy-4', type: 'runner', x: 3, z: 4, yaw: 0, health: 50, state: 'chase' },
      { id: 'enemy-5', type: 'walker', x: 9, z: 9, yaw: 0, health: 0, state: 'dead' }],
    goal: 'HOLD THE GATE', objective: { label: 'GATE', seconds: 42 }, breakSeconds: 0, ...extra };
}

test('NetworkedSession: team lobby, starting, then the snapshot state decides movement and restart', () => {
  const view = new NetworkedSession({ you: 'p2', room });
  assert.equal(view.state, 'team-lobby');
  assert.equal(view.canMove, false);
  view.starting = true;
  assert.equal(view.state, 'starting');
  view.applySnapshot(snapshot(100, { state: 'lobby' }));
  assert.equal(view.state, 'starting');
  view.applySnapshot(snapshot(150));
  assert.equal(view.state, 'playing');
  assert.equal(view.canMove, true);
  assert.equal(view.canAct, true);
  assert.equal(view.local.id, 'p2');
  assert.equal(view.nameOf('p1'), 'Ann');
  assert.equal(view.applySnapshot(snapshot(120)), false, 'an older snapshot is ignored');
  view.applyEvent(EVENTS.WEAPON_FIRED, { ownerId: 'p2', ammo: 8, reserve: null });
  view.applyEvent(EVENTS.WEAPON_FIRED, { ownerId: 'p1', ammo: 1, reserve: 5 });
  assert.deepEqual([view.ammo, view.reserve], [8, null], 'own events refresh the count, others do not');
  view.applySnapshot(snapshot(200, { state: 'game-over' }));
  assert.equal(view.canRestart, true);
  assert.equal(view.canMove, false);
  assert.equal(NetworkedSession.slotOf('p3'), 2);
});

test('NetworkedSession roots and speeds the local player as the server says', () => {
  const view = new NetworkedSession({ you: 'p2', room });
  assert.equal(view.rooted, true, 'no snapshot yet: stay put');
  assert.equal(view.speed, 1);
  view.applySnapshot(snapshot(100));
  assert.equal(view.rooted, false, 'an older server without the field: standing and alive is free');
  const bandaging = snapshot(110);
  bandaging.players[1] = player('p2', { rooted: true, speed: 1.3 });
  view.applySnapshot(bandaging);
  assert.equal(view.rooted, true, 'bandaging holds the player still although not downed');
  assert.equal(view.speed, 1.3);
  const free = snapshot(120);
  free.players[1] = player('p2', { rooted: false, speed: 0 });
  view.applySnapshot(free);
  assert.equal(view.rooted, false);
  assert.equal(view.speed, 1, 'a nonsense multiplier falls back to 1');
});

test('SnapshotStatus fills the HUD record from the snapshot, the prediction and the controller', () => {
  const view = new NetworkedSession({ you: 'p2', room });
  view.applySnapshot(snapshot(100, { players: [player('p1', { health: 30, downed: true, healing: true }),
    player('p2', { offer: { name: 'RIFLE', swap: true, full: false, verb: 'SWAP FOR', note: null },
      action: { text: '正在治療 ANN', fraction: 0.25 } })] }));
  view.setSampled({ enemies: snapshot(100).enemies });
  const controller = { x: 1.5, z: 2.5, yaw: 0.3 };
  const status = new SnapshotStatus(controller, { predictedAmmo: ammo => ammo - 1, reloading: false,
    specOf: id => WeaponSpecs.standard().get(id) }).read(view);
  assert.equal(status.health, 80);
  assert.equal(status.maxHealth, 100);
  assert.equal(status.armed, true);
  assert.equal(status.ammo, 8, 'shots still on their way are taken off');
  assert.equal(status.magazine, 12);
  assert.equal(status.reserve, Infinity, 'null reserve with rounds is the endless pistol reserve');
  assert.deepEqual([status.pickup, status.pickupSwap, status.pickupVerb], ['RIFLE', true, 'SWAP FOR']);
  assert.deepEqual([status.action, status.actionProgress], ['正在治療 ANN', 0.25]);
  assert.deepEqual(status.slots.map(slot => slot.id), [null, 'pistol', 'bat']);
  assert.equal(status.selected, 1);
  assert.deepEqual([status.state, status.wave, status.kills, status.canMove], ['playing', 2, 7, true]);
  assert.deepEqual([status.goal, status.objective.seconds], ['HOLD THE GATE', 42]);
  assert.deepEqual([status.x, status.z, status.yaw], [1.5, 2.5, 0.3]);
  assert.deepEqual(status.threats, [{ id: 'enemy-4', x: 3, z: 4 }], 'dead zombies are no threat');
  assert.equal(status.enemies, 1);
  assert.deepEqual(status.mates, [{ id: 'p1', name: 'ANN', health: 30, maxHealth: 100, down: true, healing: true }]);

  view.applySnapshot(snapshot(150, { players: [player('p2', { weapon: 'bat', ammo: null, reserve: null })] }));
  status.read(view);
  assert.equal(status.armed, false, 'a melee weapon has no counter');
  assert.equal(status.mates.length, 0);
});

test('NetEventTranslator republishes server events with stand-ins the single-player listeners accept', () => {
  const events = new EventBus();
  const standIns = EntityStandIns.standard();
  standIns.updateEnemies(snapshot(100).enemies);
  const own = [];
  const translator = new NetEventTranslator(events, standIns, 'p2', {
    isPredicted: id => id !== 'grenade', onOwnEvent: (name, detail) => own.push(name),
  });
  const seen = [];
  for (const name of [EVENTS.WEAPON_FIRED, NET_EVENTS.SHOT_CONFIRMED, EVENTS.ENTITY_DAMAGED, EVENTS.ENTITY_DIED,
    EVENTS.ENEMY_SPAWNED, EVENTS.WAVE_STARTED]) events.on(name, detail => seen.push([name, detail]));

  translator.translate(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'pistol', ammo: 8, reserve: null, hit: { targetId: 'enemy-4', hitPart: 'head' } });
  assert.deepEqual(seen.shift(), [NET_EVENTS.SHOT_CONFIRMED, { ownerId: 'p2', weaponId: 'pistol', hit: { targetId: 'enemy-4', hitPart: 'head' } }],
    'our predicted shot is confirmed, not played twice');
  translator.translate(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'grenade', ammo: null, reserve: null, count: 1, hit: null });
  assert.equal(seen.shift()[0], EVENTS.WEAPON_FIRED, 'a thrown item plays when the server says so');
  translator.translate(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'rifle', ammo: 3, reserve: 30, hit: null });
  assert.equal(seen.shift()[1].ownerId, 'p1', 'teammates\' shots pass through');
  assert.deepEqual(own, [EVENTS.WEAPON_FIRED, EVENTS.WEAPON_FIRED]);

  translator.translate(EVENTS.ENTITY_DAMAGED, { targetId: 'enemy-4', sourceId: 'p2', amount: 20, health: 30, hitPart: 'head', kind: 'bullet', downed: false });
  const [, damaged] = seen.shift();
  assert.ok(damaged.entity instanceof Runner && damaged.entity instanceof Enemy);
  assert.deepEqual([damaged.entity.id, damaged.entity.damageable.health, damaged.info.sourceId, damaged.info.hitPart], ['enemy-4', 30, 'p2', 'head']);
  assert.deepEqual(damaged.entity.position, { x: 3, y: 0, z: 4 });

  translator.translate(EVENTS.ENTITY_DAMAGED, { targetId: 'p2', sourceId: 'enemy-4', amount: 100, health: 0, hitPart: 'body', kind: 'melee', downed: true });
  const [, hurt] = seen.shift();
  assert.equal(hurt.entity.id, 'p2');
  assert.equal(hurt.entity.downed, true);
  assert.ok(!(hurt.entity instanceof Enemy));

  translator.translate(EVENTS.ENTITY_DIED, { targetId: 'enemy-4', sourceId: 'p2' });
  const [, died] = seen.shift();
  assert.equal(died.entity.damageable.alive, false);
  assert.equal(died.info.sourceId, 'p2');

  translator.translate(EVENTS.ENEMY_SPAWNED, { id: 'enemy-9', type: 'tank', x: 1, z: 1, wave: 3 });
  const [, spawned] = seen.shift();
  assert.equal(spawned.enemy.constructor.name, 'Tank');
  translator.translate(EVENTS.WAVE_STARTED, { wave: 3, count: 12 });
  assert.deepEqual(seen.shift(), [EVENTS.WAVE_STARTED, { wave: 3, count: 12 }]);
});

test('the real sound rules react to translated events', () => {
  const events = new EventBus();
  const standIns = EntityStandIns.standard();
  const translator = new NetEventTranslator(events, standIns, 'p2');
  const played = [];
  const board = { play: (cue, options) => played.push([cue, options?.position ?? null]) };
  const hits = new HitSounds(events, 'p2');
  hits.board = board;
  hits.subscribe();
  const voices = new ZombieSounds(events, () => standIns.living).register(Enemy, { death: 'zombie_death' })
    .register(Runner, { spawn: 'zombie_scream', death: 'zombie_death' });
  voices.board = board;
  voices.subscribe();
  translator.translate(EVENTS.ENEMY_SPAWNED, { id: 'enemy-1', type: 'runner', x: 2, z: 3, wave: 1 });
  translator.translate(EVENTS.ENTITY_DAMAGED, { targetId: 'enemy-1', sourceId: 'p2', amount: 10, health: 40, hitPart: 'head', kind: 'bullet', downed: false });
  translator.translate(EVENTS.ENTITY_DIED, { targetId: 'enemy-1', sourceId: 'p2', kind: 'bullet' });
  assert.deepEqual(played.map(([cue]) => cue), ['zombie_scream', 'headshot', 'kill', 'zombie_death']);
  assert.deepEqual(played[0][1], { x: 2, y: 0, z: 3 });
});

test('ActionForwarder turns requests into actions and plays predicted shots at once', () => {
  const events = new EventBus();
  const sent = [];
  const client = { open: true, action: (kind, extra) => (client.open ? (sent.push([kind, extra]), true) : false) };
  const view = new NetworkedSession({ you: 'p2', room });
  view.applySnapshot(snapshot(100));
  const loadout = new RemoteLoadout(WeaponSpecs.standard());
  loadout.apply(view.local, 0);
  let now = 0;
  const forwarder = new ActionForwarder({ events, client, ownerId: 'p2', loadout, cadence: new FireCadence(), view, now: () => now });
  const fired = [];
  events.on(EVENTS.WEAPON_FIRED, detail => fired.push(detail));

  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: 'p2' });
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: 'p2' });
  assert.deepEqual(sent, [['fire', undefined]], 'the pistol cooldown holds the second pull back');
  assert.deepEqual(fired, [{ ownerId: 'p2', weaponId: 'pistol', ammo: 8, reserve: null, hit: null, predicted: true }]);
  now = 0.3;
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: 'p2' });
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: 'p1' });
  assert.equal(sent.length, 2, 'only our own requests');

  sent.length = 0;
  events.emit(EVENTS.RELOAD_REQUESTED, { ownerId: 'p2' });
  events.emit(EVENTS.SWITCH_REQUESTED, { ownerId: 'p2', index: 4 });
  events.emit(EVENTS.CYCLE_REQUESTED, { ownerId: 'p2', step: -1 });
  events.emit(EVENTS.SECONDARY_REQUESTED, { ownerId: 'p2' });
  events.emit(EVENTS.PICKUP_REQUESTED, { ownerId: 'p2' });
  forwarder.revive(true);
  forwarder.revive(true);
  forwarder.revive(false);
  assert.deepEqual(sent, [['reload', undefined], ['switch', { index: 4 }], ['cycle', { step: -1 }], ['secondary', undefined],
    ['pickup', undefined], ['revive', { holding: true }], ['revive', { holding: false }]]);

  sent.length = 0;
  fired.length = 0;
  now = 1;
  client.open = false;
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: 'p2' });
  assert.equal(fired.length, 0, 'nothing plays when the shot could not be sent');
  client.open = true;
  view.applySnapshot(snapshot(200, { players: [player('p2', { downed: true })] }));
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: 'p2' });
  assert.equal(sent.length, 0, 'a downed player does not shoot');
  forwarder.dispose();
  events.emit(EVENTS.RELOAD_REQUESTED, { ownerId: 'p2' });
  assert.equal(sent.length, 0);
});

test('ActionForwarder lets the mode send the pose just before an action goes out', () => {
  const events = new EventBus();
  const order = [];
  const client = { action: kind => (order.push('action:' + kind), true) };
  const view = new NetworkedSession({ you: 'p2', room });
  view.applySnapshot(snapshot(100));
  const loadout = new RemoteLoadout(WeaponSpecs.standard());
  loadout.apply(view.local, 0);
  new ActionForwarder({ events, client, ownerId: 'p2', loadout, cadence: new FireCadence(), view, now: () => 0,
    beforeAction: kind => order.push('pose:' + kind) });
  events.emit(EVENTS.FIRE_REQUESTED, { ownerId: 'p2' });
  events.emit(EVENTS.PICKUP_REQUESTED, { ownerId: 'p2' });
  assert.deepEqual(order, ['pose:fire', 'action:fire', 'pose:pickup', 'action:pickup']);
});
