import test from 'node:test';
import assert from 'node:assert/strict';
import { Clip } from '../web/js/weapons/Clip.js';
import { WeaponView } from '../web/js/weapons/WeaponView.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);

test('Clip eases between keys and holds the ends', () => {
  const keys = [[0, 0], [1, 10], [2, 0, 'in'], [3, 5, 'step']];
  near(Clip.valueAt(keys, -1), 0, 'before the first key');
  near(Clip.valueAt(keys, 0.5), 5, 'linear');
  near(Clip.valueAt(keys, 1.5), 10 - 10 * 0.25, 'ease in starts slow');
  near(Clip.valueAt(keys, 2.9), 0, 'step holds the previous value');
  near(Clip.valueAt(keys, 3), 5, 'step lands on the key');
  near(Clip.valueAt(keys, 9), 5, 'after the last key');
});

test('Clip rejects bad channels and unsorted keys, and adds onto a shared pose', () => {
  assert.throws(() => new Clip('x', 1, { slide: [[0, 0]] }), /must look like/);
  assert.throws(() => new Clip('x', 1, { 'gun.pos.z': [[1, 0], [0, 1]] }), /sorted/);
  assert.throws(() => new Clip('x', 0, {}), RangeError);
  const clip = new Clip('kick', 1, { 'gun.pos.z': [[0, 0], [1, 1]] }, [[0.5, 'mid'], [0, 'start']]);
  assert.deepEqual(clip.sample(0.5, { 'gun.pos.z': 1 }), { 'gun.pos.z': 1.5 });
  assert.deepEqual(clip.eventsBetween(-1, 0.5), ['start', 'mid']);
  assert.deepEqual(clip.eventsBetween(0, 0.4), []);
});

class TestView extends WeaponView {
  static id = 'test';
  static clips = {
    equip: new Clip('equip', 0.2, { 'gun.pos.y': [[0, -1], [0.2, 0]] }),
    fire: new Clip('fire', 0.4, { 'gun.pos.z': [[0, 0], [0.1, 1], [0.4, 0]] }, [[0, 'shot']]),
    reload: new Clip('reload', 2, { 'gun.rot.x': [[0, 0], [1, 1], [2, 0]] }),
    use: new Clip('use', 1, { 'roll.rot.x': [[0, 0], [1, 10]] }),
  };
  static fireInterval = 0.3;
}

function makeView(View = TestView) {
  const poses = [];
  const fired = [];
  const model = { applyPose: channels => poses.push({ ...channels }) };
  const events = { emit: (name, detail) => fired.push(detail.name) };
  return { view: new View(model, events), poses, fired };
}

test('WeaponView: a forced shot plays even while the last one is still cycling', () => {
  const { view, fired } = makeView();
  assert.equal(view.fire(), true);
  view.update(0.1, 0);
  assert.equal(view.fire(), false, 'too soon by the view\'s own fire interval');
  assert.equal(view.fire(true), true, 'the game decided the shot happened');
  assert.equal(view.state.time, 0, 'the clip starts again');
  assert.deepEqual(fired, ['shot', 'shot']);
});

test('WeaponView: the reload clip is stretched to the game\'s reload time and can be ended early', () => {
  const { view } = makeView();
  assert.equal(view.reload(4), true);
  near(view.state.rate, 0.5, 'a 2 s clip over 4 s');
  view.update(1, 0);
  near(view.state.time, 0.5, 'half speed');
  view.finishReload();
  assert.equal(view.state, view.states.idle);
  view.fire(true);
  assert.equal(view.reload(1), false, 'busy firing');
  assert.equal(view.reload(1, true), true, 'unless forced');
  near(view.state.rate, 2, 'a 2 s clip in 1 s');
});

test('WeaponView: a timed use is shown at its fraction; weapons without fire or reload clips refuse them', () => {
  const { view, poses } = makeView();
  view.showProgress(0.5);
  view.update(0, 0);
  near(poses.at(-1)['roll.rot.x'], 5, 'half way through the use clip');
  view.showProgress(null);
  view.update(0, 0);
  assert.equal(poses.at(-1)['roll.rot.x'], undefined);

  class Bare extends WeaponView {
    static id = 'bare';
    static clips = { equip: TestView.clips.equip };
  }
  const bare = makeView(Bare).view;
  assert.equal(bare.fire(true), false);
  assert.equal(bare.reload(1, true), false);
  bare.showProgress(0.5);
  bare.update(0.1, 0);
  assert.equal(bare.state, bare.states.idle);
});
