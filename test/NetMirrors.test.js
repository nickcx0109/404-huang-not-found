import test from 'node:test';
import assert from 'node:assert/strict';
import { AmmoCrateMirror } from '../web/js/net/AmmoCrateMirror.js';
import { EffectMirror } from '../web/js/net/EffectMirror.js';
import { SnapshotBuffer } from '../web/js/net/SnapshotBuffer.js';

test('AmmoCrateMirror places the level\'s crates and takes readiness only from snapshots', () => {
  const mirror = AmmoCrateMirror.fromLevel({ markers: [
    { id: 'ammo-1', type: 'ammo', x: 1, z: 2 }, { id: 'w1', type: 'weapon', x: 0, z: 0 }, { id: 'ammo-2', type: 'ammo', x: 3, z: 4 },
  ] });
  assert.deepEqual(mirror.crates.map(crate => [crate.id, crate.position]), [['ammo-1', { x: 1, y: 0, z: 2 }], ['ammo-2', { x: 3, y: 0, z: 4 }]]);
  assert.ok(mirror.crates.every(crate => crate.ready(123)), 'ready until the server says otherwise');
  assert.deepEqual(mirror.apply([{ id: 'ammo-2', ready: false }, { id: 'zz', ready: false }, { id: 'ammo-1', ready: 'no' }]), ['ammo-2']);
  assert.equal(mirror.crates[1].ready(1e9), false, 'the page clock does not make it ready again');
  assert.deepEqual(mirror.apply(undefined), [], 'a snapshot without the list keeps the last state');
  assert.equal(mirror.crates[1].ready(0), false);
  assert.deepEqual(mirror.apply([{ id: 'ammo-2', ready: false }]), []);
  assert.deepEqual(mirror.apply([{ id: 'ammo-2', ready: true }]), ['ammo-2']);
});

test('EffectMirror keeps one object per effect id, moves it, and drops what the list leaves out', () => {
  const mirror = new EffectMirror();
  const list = mirror.effects;
  mirror.apply([{ id: 1, kind: 'grenade', x: 0, y: 1, z: 0, radius: 5 }, { id: 2, kind: 'fire', x: 3, y: 0, z: 4, radius: 3 },
    { id: 3, x: 0, y: 0, z: 0 }]);
  assert.equal(mirror.effects, list, 'views hold on to the same array');
  assert.deepEqual(list.map(effect => [effect.id, effect.kind, effect.radius]), [[1, 'grenade', 5], [2, 'fire', 3]]);
  const grenade = list[0];
  assert.equal(grenade.velocity, null, 'not moving yet');
  mirror.apply([{ id: 1, kind: 'grenade', x: 0.5, y: 0.8, z: 0 }, { id: 2, kind: 'fire', x: 3, y: 0, z: 4, radius: 3 }]);
  assert.equal(list[0], grenade);
  assert.deepEqual(grenade.position, { x: 0.5, y: 0.8, z: 0 });
  assert.ok(grenade.velocity, 'a moving effect has a velocity, so EffectViews spins it');
  assert.equal(list[1].velocity, null, 'fire stands still');
  mirror.apply([{ id: 2, kind: 'fire', x: 3, y: 0, z: 4, radius: 3 }]);
  assert.deepEqual(list.map(effect => effect.id), [2]);
  mirror.apply(undefined);
  assert.equal(list.length, 0, 'no list means no effects');
});

test('SnapshotBuffer interpolates effects and treats a missing list as empty', () => {
  const snap = (time, rest) => ({ t: 'snapshot', tick: time / 50, time, ack: 0, state: 'playing', wave: 1, kills: 0,
    players: [], enemies: [], ...rest });
  const buffer = new SnapshotBuffer();
  buffer.push(snap(0, { effects: [{ id: 1, kind: 'grenade', x: 0, y: 2, z: 0 }] }));
  buffer.push(snap(50, { effects: [{ id: 1, kind: 'grenade', x: 1, y: 1, z: -2 }] }));
  buffer.push(snap(100));
  assert.deepEqual(buffer.sample(25).effects, [{ id: 1, kind: 'grenade', x: 0.5, y: 1.5, z: -1 }]);
  assert.deepEqual(buffer.sample(75).effects, [], 'gone once a snapshot leaves it out');
});
