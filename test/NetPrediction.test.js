import test from 'node:test';
import assert from 'node:assert/strict';
import { FireCadence } from '../web/js/net/FireCadence.js';
import { PoseReconciler } from '../web/js/net/PoseReconciler.js';
import { WeaponSpecs } from '../web/js/net/WeaponSpecs.js';
import { RemoteLoadout } from '../web/js/net/RemoteLoadout.js';
import { LightBudget } from '../web/js/net/LightBudget.js';

const rifle = { cooldownSeconds: 0.095, usesAmmo: true };
const smgLike = { cooldownSeconds: 0.01, usesAmmo: true };

test('FireCadence resends a held automatic no faster than its cooldown plus a margin', () => {
  const cadence = new FireCadence();
  const sent = [];
  // A 60 fps loop asks every frame for a second.
  for (let frame = 0; frame <= 60; frame++) {
    const now = frame / 60;
    if (cadence.tryFire(now, rifle, { ammo: 100 })) sent.push(now);
    if (sent.length && cadence.pendingCount(now) > 0 && frame % 3 === 0) cadence.confirm(now);
  }
  const gaps = sent.slice(1).map((time, index) => time - sent[index]);
  assert.ok(gaps.every(gap => gap >= 0.095 + 0.008 - 1e-9), 'never faster than cooldown + margin');
  assert.ok(sent.length >= 8 && sent.length <= 10, 'about 1 / 0.103 s shots in a second: ' + sent.length);
  assert.ok(cadence.interval(smgLike.cooldownSeconds) >= 1 / 30, 'at most 30 a second');
});

test('FireCadence predicts rounds from unanswered shots and forgets refused ones', () => {
  const cadence = new FireCadence({ pendingSeconds: 0.5 });
  assert.equal(cadence.tryFire(0, rifle, { ammo: 2 }), true);
  assert.equal(cadence.predictedAmmo(2, 0.01), 1);
  assert.equal(cadence.tryFire(0.2, rifle, { ammo: 2 }), true);
  assert.equal(cadence.predictedAmmo(2, 0.21), 0);
  assert.equal(cadence.tryFire(0.4, rifle, { ammo: 2 }), false, 'the magazine is empty as far as we know');
  cadence.confirm(0.3);
  assert.equal(cadence.predictedAmmo(1, 0.31), 0, 'the server counted the first shot');
  assert.equal(cadence.predictedAmmo(1, 0.8), 1, 'a shot unanswered for 0.5 s was refused');
  assert.equal(cadence.tryFire(1, rifle, { ammo: 5, reloading: true }), false);
  assert.equal(cadence.tryFire(1, { cooldownSeconds: 0.6, usesAmmo: false }, { ammo: null }), true, 'melee needs no rounds');
  assert.equal(cadence.predictedAmmo(null, 1), null);
  cadence.reset();
  assert.equal(cadence.tryFire(1.01, rifle, { ammo: 5 }), true, 'a new weapon has its own cooldown');
});

test('PoseReconciler places the player on the first snapshot, then corrects only real disagreements', () => {
  const reconciler = new PoseReconciler({ threshold: 1 });
  const first = reconciler.reconcile({ x: 5, y: 0, z: -3 }, -1, { x: 0, y: 0, z: 0 }, 0);
  assert.deepEqual(first, { x: 5, y: 0, z: -3, first: true });

  // Running forward: the server is always behind, but agrees with what was sent at `ack`.
  let z = -3;
  for (let seq = 1; seq <= 10; seq++) {
    z -= 0.2;
    reconciler.record(seq, { x: 5, y: 0, z });
  }
  assert.equal(reconciler.reconcile({ x: 5, y: 0, z: -3.6 }, 3, { x: 5, y: 0, z }, 10), null, 'lag is not an error');
  assert.equal(reconciler.reconcile({ x: 5.5, y: 0, z: -3.8 }, 4, { x: 5, y: 0, z }, 10), null, 'within 1 m');

  // A wall the browser walked through: the server stopped the player 2 m short.
  const fix = reconciler.reconcile({ x: 5, y: 0, z: -2 }, 5, { x: 5, y: 0, z }, 10);
  assert.equal(fix.first, false);
  assert.ok(Math.abs(fix.z - 2) < 1e-9 && fix.x === 0 && fix.y === 0, 'moves by the difference: ' + JSON.stringify(fix));

  // Poses sent before the correction are not compared again.
  assert.equal(reconciler.reconcile({ x: 5, y: 0, z: -3 }, 8, { x: 5, y: 0, z: z + 2 }, 10), null);
  reconciler.record(10, { x: 9, y: 0, z: 9 });
  reconciler.record(11, { x: 5, y: 0, z: -3 });
  assert.equal(reconciler.history.length, 1, 'only poses sent after the correction are kept');
  assert.equal(reconciler.reconcile({ x: 5, y: 0, z: -3 }, 11, { x: 5, y: 0, z: -3 }, 11), null);
  reconciler.reset();
  assert.equal(reconciler.reconcile({ x: 1, y: 0, z: 1 }, 20, { x: 0, y: 0, z: 0 }, 20).first, true);
});

test('WeaponSpecs knows every weapon a player can hold; RemoteLoadout follows the hand and the reload', () => {
  const specs = WeaponSpecs.standard();
  assert.equal(specs.get('rifle').automatic, true);
  assert.equal(specs.get('pistol').automatic, false);
  assert.equal(specs.get('chainsaw').automatic, true);
  assert.equal(specs.get('bat').usesAmmo, false);
  assert.equal(specs.get('bat').predicted, true);
  assert.equal(specs.get('grenade').predicted, false, 'thrown items wait for the server');
  assert.equal(specs.get('bandage').predicted, false);
  assert.equal(specs.get('mystery').predicted, false);

  const loadout = new RemoteLoadout(specs);
  assert.equal(loadout.apply({ weapon: 'pistol', slot: 1, reloading: false }, 0), true);
  const pistol = loadout.current;
  assert.equal(pistol.id, 'pistol');
  assert.equal(loadout.apply({ weapon: 'pistol', slot: 1, reloading: false }, 0.1), false);
  assert.equal(loadout.current, pistol, 'the same weapon keeps its object');

  loadout.startReload('pistol', 1.5, 1);
  assert.equal(pistol.reloading, true);
  assert.equal(pistol.reloadSecondsLeft(2), 0.5);
  loadout.apply({ weapon: 'pistol', slot: 1, reloading: false }, 1.2);
  assert.equal(pistol.reloading, true, 'an older snapshot does not cancel a reload that just started');
  loadout.finishReload('pistol');
  assert.equal(pistol.reloading, false);
  loadout.apply({ weapon: 'pistol', slot: 1, reloading: true }, 3);
  assert.equal(pistol.reloading, true, 'a reload seen only in a snapshot is timed from its full length');

  assert.equal(loadout.apply({ weapon: 'rifle', slot: 0 }, 4), true);
  assert.notEqual(loadout.current, pistol);
  assert.equal(loadout.current.automatic, true);
  assert.equal(loadout.apply({ weapon: '', slot: -1 }, 5), true);
  assert.equal(loadout.current, null);
});

test('LightBudget keeps one alarm light online', () => {
  const style = { alarm: { light: { count: 3 } } };
  assert.equal(new LightBudget().apply(style), true);
  assert.equal(style.alarm.light.count, 1);
  assert.equal(new LightBudget().apply(style), false);
  assert.equal(new LightBudget().apply({}), false, 'a palette without alarm lights is left alone');
});
