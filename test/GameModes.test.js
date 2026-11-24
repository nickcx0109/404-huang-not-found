import test from 'node:test';
import assert from 'node:assert/strict';
import { GameMode } from '../web/js/game/modes/GameMode.js';
import { ModeSwitch } from '../web/js/game/modes/ModeSwitch.js';

class FakeMode extends GameMode {
  constructor(log, name) {
    super();
    this.log = log;
    this.name = name;
    log.push('build ' + name);
  }

  dispose() {
    this.log.push('dispose ' + this.name);
  }
}

test('GameMode is abstract and defaults to a mode that blocks movement and restart', () => {
  assert.throws(() => new GameMode(), TypeError);
  const mode = new FakeMode([], 'a');
  assert.equal(mode.canMove, false);
  assert.equal(mode.canRestart, false);
  assert.equal(mode.blocksLevelFlow(), false);
  assert.doesNotThrow(() => { mode.start(); mode.frame(0.016, true); });
});

test('ModeSwitch disposes the old mode before building the new one', () => {
  const log = [];
  const modes = new ModeSwitch();
  const a = modes.use(() => new FakeMode(log, 'a'));
  assert.equal(modes.current, a);
  const b = modes.use(() => {
    assert.equal(modes.current, null, 'no mode is handed out mid-switch');
    return new FakeMode(log, 'b');
  });
  assert.equal(modes.current, b);
  assert.deepEqual(log, ['build a', 'dispose a', 'build b']);
});

test('ModeSwitch refuses non-modes and nested switches', () => {
  const modes = new ModeSwitch();
  assert.throws(() => modes.use(() => ({})), TypeError);
  assert.equal(modes.current, null);
  assert.throws(() => modes.use(() => {
    modes.use(() => new FakeMode([], 'inner'));
    return new FakeMode([], 'outer');
  }), /being built/);
  // After a failed build the switch still works.
  assert.ok(modes.use(() => new FakeMode([], 'c')) instanceof FakeMode);
});

test('ModeSwitch.dispose disposes the current mode once and ignores later switches', () => {
  const log = [];
  const modes = new ModeSwitch();
  modes.use(() => new FakeMode(log, 'a'));
  modes.dispose();
  modes.dispose();
  assert.equal(modes.use(() => new FakeMode(log, 'late')), null);
  assert.deepEqual(log, ['build a', 'dispose a']);
});
