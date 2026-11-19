import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CollisionWorld } from '../web/js/CollisionWorld.js';
import { PathFinder } from '../web/js/PathFinder.js';
import { LevelData } from '../web/js/LevelData.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { GameContext } from '../web/js/game/GameContext.js';
import { GameSession } from '../web/js/game/GameSession.js';
import { ExampleWaveDirector } from '../web/js/game/WaveDirector.js';
import { EnemyFactory } from '../web/js/enemies/EnemyFactory.js';
import { Walker } from '../web/js/enemies/Walker.js';
import { Economy } from '../web/js/economy/Economy.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Shotgun } from '../web/js/weapons/Shotgun.js';
import { LoadoutHolder } from '../web/js/weapons/LoadoutHolder.js';
import { WeaponCatalog } from '../web/js/pickups/WeaponCatalog.js';
import { WeaponPickup } from '../web/js/pickups/WeaponPickup.js';
import { PickupField } from '../web/js/pickups/PickupField.js';
import { PlayerStatus } from '../web/js/ui/hud/PlayerStatus.js';
import { AmmoMeter } from '../web/js/ui/hud/logic/AmmoMeter.js';
import { EVENTS } from '../web/js/game/events.js';

function catalog() {
  return new WeaponCatalog()
    .register('rifle', { create: () => new Rifle(), name: 'RIFLE' })
    .register('shotgun', { create: () => new Shotgun(), name: 'SHOTGUN' });
}

function player(events, x = 0, z = 0) {
  const body = new CombatPlayer('p1', { x, z }, events, new LoadoutHolder('p1', events));
  body.weapons.add(new StarterPistol());
  body.weapons.add(new Bat());
  return body;
}

const markers = [
  { id: 'gun_a', type: 'weapon', item: 'rifle', x: 2, z: 0, r: 1.2 },
  { id: 'gun_b', type: 'weapon', item: 'shotgun', x: -1.5, z: 0, r: 1.2 },
  { id: 'shop', type: 'shop', x: 9, z: 9, r: 1 },
];

test('WeaponCatalog builds registered weapons and refuses duplicates and mismatched ids', () => {
  const weapons = catalog();
  assert.ok(weapons.create('rifle') instanceof Rifle);
  assert.notEqual(weapons.create('rifle'), weapons.create('rifle'), 'a fresh weapon every time');
  assert.equal(weapons.nameOf('shotgun'), 'SHOTGUN');
  assert.equal(weapons.nameOf('pistol'), 'PISTOL');
  assert.throws(() => weapons.register('rifle', { create: () => new Rifle() }), /duplicate/);
  assert.throws(() => weapons.register('bad', {}), /create/);
  assert.throws(() => weapons.create('laser'), /Unknown weapon/);
  weapons.register('fake', { create: () => new Rifle() });
  assert.throws(() => weapons.create('fake'), /id rifle/);
});

test('LevelData keeps a marker item and rejects a bad one', () => {
  const raw = { name: 'fixture', bounds: { w: 20, d: 20 }, colliders: [], props: [], bookmarks: [], spawns: { players: [{ x: 0, z: 0 }], zombies: [] }, markers };
  const level = new LevelData(raw);
  assert.equal(level.markers[0].item, 'rifle');
  assert.equal(level.markers[2].item, null);
  assert.throws(() => new LevelData({ ...raw, markers: [{ type: 'weapon', item: 'no spaces', x: 0, z: 0 }] }),
    error => error.problems.some(problem => problem.includes('markers[0].item')));
});

test('PickupField makes one pickup per weapon marker and refuses unknown items', () => {
  const field = PickupField.fromLevel({ markers }, catalog());
  assert.deepEqual(field.pickups.map(pickup => [pickup.id, pickup.weapon.id, pickup.radius]),
    [['gun_a', 'rifle', 1.2], ['gun_b', 'shotgun', 1.2]]);
  assert.throws(() => PickupField.fromLevel({ markers: [{ id: 'x', type: 'weapon', item: 'laser', x: 0, z: 0, r: 1 }] }, catalog()),
    /unknown weapon item "laser"/);
  assert.equal(PickupField.fromLevel({}, catalog()).pickups.length, 0);
});

test('Taking a gun swaps it with the primary: the old one stays behind with its own rounds', () => {
  const events = new EventBus();
  const ctx = { events };
  const taken = [];
  events.on(EVENTS.WEAPON_PICKED_UP, detail => taken.push(detail));
  const field = PickupField.fromLevel({ markers }, catalog());
  const body = player(events, 0, 0);
  const [rifleSpot, shotgunSpot] = field.pickups;
  assert.equal(field.nearestFor(body), shotgunSpot, 'the closer one wins');
  assert.deepEqual(field.offerFor(body), { name: 'SHOTGUN', swap: false });

  assert.equal(field.take(body, ctx), true);
  const shotgun = body.weapons.current;
  assert.equal(shotgun.id, 'shotgun');
  assert.equal(shotgunSpot.empty, true, 'nothing was in the primary slot, so nothing is left behind');
  assert.equal(shotgunSpot.reachableBy(body), false);
  assert.deepEqual(taken.at(-1), { ownerId: 'p1', pickupId: 'gun_b', weaponId: 'shotgun', droppedId: null });

  shotgun.ammo = 2;
  shotgun.reserve = 5;
  body.position.x = 1.5;
  assert.deepEqual(field.offerFor(body), { name: 'RIFLE', swap: true });
  assert.equal(field.take(body, ctx), true);
  assert.equal(body.weapons.current.id, 'rifle');
  assert.equal(rifleSpot.weapon, shotgun, 'the shotgun lies where the rifle was');
  assert.equal(shotgun.ammo, 2);
  assert.equal(shotgun.reserve, 5);
  assert.deepEqual(taken.at(-1), { ownerId: 'p1', pickupId: 'gun_a', weaponId: 'rifle', droppedId: 'shotgun' });

  // Swapping back gives the same half-empty shotgun, not a refilled one.
  const rifle = body.weapons.current;
  rifle.ammo = 7;
  assert.equal(field.take(body, ctx), true);
  assert.equal(body.weapons.current, shotgun);
  assert.equal(shotgun.ammo, 2);
  assert.equal(rifleSpot.weapon, rifle);
  assert.equal(rifle.ammo, 7);

  body.position.x = 6;
  assert.equal(field.nearestFor(body), null);
  assert.equal(field.offerFor(body), null);
  assert.equal(field.take(body, ctx), false);
});

test('Taking the same kind of gun is still a swap, never a refill', () => {
  const events = new EventBus();
  const field = new PickupField(catalog(), [new WeaponPickup('spot', { x: 0, z: 0 }, new Rifle(), 1)]);
  const body = player(events);
  const mine = new Rifle();
  mine.ammo = 1;
  mine.reserve = 0;
  body.weapons.equip(mine);
  const onGround = field.pickups[0].weapon;
  onGround.ammo = 4;
  onGround.reserve = 10;
  assert.deepEqual(field.offerFor(body), { name: 'RIFLE', swap: true });
  field.take(body, { events });
  assert.equal(body.weapons.current, onGround);
  assert.equal(body.weapons.current.ammo, 4);
  assert.equal(body.weapons.current.reserve, 10);
  assert.equal(field.pickups[0].weapon, mine);
  assert.equal(mine.ammo, 1);
});

function sessionFixture() {
  const collision = new CollisionWorld();
  collision.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const events = new EventBus();
  const level = { spawns: { zombies: [{ x: 8, z: 8, r: 1 }] }, markers };
  const ctx = new GameContext({ collision, pathFinder: new PathFinder(collision), events, rng: () => 0.5, level });
  const body = player(events, 1.5, 0);
  ctx.players.push(body);
  const pickups = PickupField.fromLevel(level, catalog());
  const session = new GameSession(ctx, { factory: new EnemyFactory(ctx).register('walker', Walker),
    director: new ExampleWaveDirector({ type: 'walker', initialCount: 1, maxCount: 1 }), economy: new Economy(), pickups });
  return { ctx, body, session };
}

test('GameSession lets a living player pick up only while players can move', () => {
  const { ctx, body, session } = sessionFixture();
  ctx.events.emit(EVENTS.PICKUP_REQUESTED, { ownerId: 'p1' });
  assert.equal(body.weapons.inSlot('primary'), null, 'not in the lobby');
  session.start();
  session.update(0.05);
  assert.equal(session.state, 'playing');
  assert.equal(session.pickUp('nobody'), false);
  ctx.events.emit(EVENTS.PICKUP_REQUESTED, { ownerId: 'p1' });
  assert.equal(body.weapons.current.id, 'rifle');

  body.damageable.takeDamage(new DamageInfo({ amount: 1000, targetId: 'p1' }));
  body.position.x = -1.5;
  assert.equal(session.pickUp('p1'), false, 'not when dead');
  session.dispose();
});

test('PlayerStatus shows the pickup offer, a melee weapon as unarmed and the infinite reserve', () => {
  const { body, session } = sessionFixture();
  const status = new PlayerStatus();
  status.read(session, 'p1');
  assert.equal(status.pickup, null, 'no offer in the lobby');
  session.start();
  session.update(0.05);
  status.read(session, 'p1');
  assert.equal(status.pickup, 'RIFLE');
  assert.equal(status.pickupSwap, false);
  assert.equal(status.armed, true);
  assert.equal(status.reserve, Infinity);
  const meter = new AmmoMeter();
  assert.equal(meter.set(status), true);
  assert.equal(meter.notice, null);
  body.weapons.switchTo(2);
  status.read(session, 'p1');
  assert.equal(status.armed, false, 'the bat has no rounds to show');
  body.position.x = 7;
  status.read(session, 'p1');
  assert.equal(status.pickup, null);
  session.dispose();
});
