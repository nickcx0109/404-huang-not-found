import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { Clip } from '../web/js/weapons/Clip.js';
import { SwingClipState } from '../web/js/weapons/views/SwingClipState.js';
import { HeldWeaponDriver } from '../web/js/weapons/views/HeldWeaponDriver.js';
import { SWING_EVENTS } from '../web/js/weapons/views/swingEvents.js';

const view = () => ({ id: 'katana', announce() {}, machine: { change() {} }, states: { idle: null } });
const cut = (name, start, end) => new Clip(name, 0.4, { 'gun.pos.y': [[0, 0], [0.4, 0]] }, [[start, 'swing'], [end, 'cut']]);

test('SwingClipState reads the cue from the swing and cut markers', () => {
  const state = new SwingClipState(view(), [{ clip: cut('right', 0.06, 0.14), side: 1 }, { clip: cut('left', 0.06, 0.14), side: -1 }]);
  state.restart();
  assert.equal(state.cue, null, 'no trail during the wind-up');
  state.update(0.1);
  const cue = state.cue;
  assert.equal(cue.side, 1);
  assert.ok(Math.abs(cue.sweepSeconds - 0.08) < 1e-9);
  assert.ok(Math.abs(cue.elapsed - 0.04) < 1e-9);
});

test('SwingClipState alternates once a cut starts, keeps the side after a cancelled wind-up, and handles a cut at time 0', () => {
  const state = new SwingClipState(view(), [{ clip: cut('right', 0, 0.08), side: 1 }, { clip: cut('left', 0, 0.08), side: -1 }]);
  state.restart();
  state.update(0.01);
  state.restart();
  assert.equal(state.swing.side, -1, 'a cut starting at 0 still alternates');

  const late = new SwingClipState(view(), [{ clip: cut('right', 0.06, 0.14), side: 1 }, { clip: cut('left', 0.06, 0.14), side: -1 }]);
  late.restart();
  late.update(0.03);
  late.restart();
  assert.equal(late.swing.side, 1, 'a wind-up cut short does not use up the side');
});

test('SwingClipState refuses clips without both markers in order', () => {
  const bare = new Clip('bare', 0.4, { 'gun.pos.y': [[0, 0], [0.4, 0]] });
  assert.throws(() => new SwingClipState(view(), [{ clip: bare, side: 1 }]), /swing/);
  assert.throws(() => new SwingClipState(view(), [{ clip: cut('back', 0.2, 0.1), side: 1 }]), RangeError);
});

test('HeldWeaponDriver.dispose clears a trail that is still on screen', () => {
  const events = new EventBus();
  let cue = { weaponId: 'katana', side: 1, sweepSeconds: 0.08, elapsed: 0, hit: false };
  const target = { equip() {}, fire() { return true; }, reload() {}, finishReload() {}, showProgress() {}, get swingCue() { return cue; } };
  const driver = new HeldWeaponDriver(events, 'me', { current: null }, target);
  const frames = [];
  events.on(SWING_EVENTS.FRAME, detail => frames.push(detail.cue));
  driver.presentSwing();
  driver.dispose();
  assert.deepEqual(frames.map(c => c && c.side), [1, null]);
  cue = null;
  const idle = new HeldWeaponDriver(events, 'me', { current: null }, target);
  idle.dispose();
  assert.equal(frames.length, 2, 'nothing to clear, nothing sent');
});
