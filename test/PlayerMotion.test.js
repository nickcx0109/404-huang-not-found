import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { JumpMotion } from '../web/js/player/JumpMotion.js';
import { RecoilKick } from '../web/js/player/RecoilKick.js';
import { EVENTS } from '../web/js/game/events.js';

test('JumpMotion: up from the ground, back down, no jumping in the air', () => {
  const jump = new JumpMotion({ jumpSpeed: 4.6, gravity: 13 });
  assert.equal(jump.grounded, true);
  assert.equal(jump.jump(), true);
  let top = 0;
  let steps = 0;
  jump.update(0.02);
  assert.equal(jump.jump(), false, 'already in the air');
  while (!jump.grounded && steps++ < 200) {
    jump.update(0.02);
    top = Math.max(top, jump.height);
  }
  assert.ok(top > 0.7 && top < 0.9, 'about 0.8 m high: ' + top);
  assert.ok(steps * 0.02 > 0.6 && steps * 0.02 < 0.8, 'about 0.7 s in the air');
  assert.equal(jump.height, 0);
  assert.equal(jump.jump(), true, 'can jump again after landing');
  assert.throws(() => new JumpMotion({ gravity: 0 }), /Invalid/);
});

test('RecoilKick kicks the view up on my shots only, then gives most of it back', () => {
  const events = new EventBus();
  const recoil = new RecoilKick(events, 'p1', { rng: () => 1 }).register('pistol', { pitch: 2, yaw: 1 });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'pistol' });
  assert.equal(recoil.update(0.016).pitch, 0, 'someone else fired');
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'bat' });
  assert.equal(recoil.update(0.016).pitch, 0, 'melee does not kick');
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'pistol' });
  let pitch = 0;
  let yaw = 0;
  let peak = 0;
  for (let index = 0; index < 120; index++) {
    const turn = recoil.update(1 / 60);
    pitch += turn.pitch;
    yaw += turn.yaw;
    peak = Math.max(peak, pitch);
  }
  const degrees = value => value * 180 / Math.PI;
  assert.ok(degrees(peak) > 1.2, 'kicks up fast: ' + degrees(peak));
  assert.ok(Math.abs(degrees(pitch) - 0.8) < 0.05, '40% of the kick stays: ' + degrees(pitch));
  assert.ok(Math.abs(degrees(yaw) - 0.4) < 0.05, 'sideways too');
  recoil.dispose();
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'pistol' });
  assert.ok(Math.abs(recoil.update(0.016).pitch) < 1e-6, 'no longer listening');
  assert.throws(() => recoil.register('x', { pitch: -1 }), /Invalid/);
});
