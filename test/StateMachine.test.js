import test from 'node:test';
import assert from 'node:assert/strict';
import { State } from '../web/js/core/State.js';
import { StateMachine } from '../web/js/core/StateMachine.js';

test('StateMachine orders hooks and supplies shared context and neighbouring states', () => {
  const context = { calls: [] };
  const machine = new StateMachine(context);
  class RecordingState extends State {
    enter(received, previous) {
      assert.equal(received, context);
      assert.equal(machine.current, this);
      received.calls.push(['enter', this, previous]);
    }
    exit(received, next) {
      assert.equal(received, context);
      assert.equal(machine.current, this);
      received.calls.push(['exit', this, next]);
    }
    update(dt, received) { received.calls.push(['update', this, dt]); }
  }
  const first = new RecordingState();
  const second = new RecordingState();
  assert.equal(machine.current, null);
  machine.update(1);
  assert.equal(machine.change(first), first);
  machine.update(0.25);
  machine.change(first);
  machine.change(second);
  assert.equal(machine.change(null), null);
  machine.update(1);
  assert.deepEqual(context.calls, [
    ['enter', first, null], ['update', first, 0.25],
    ['exit', first, second], ['enter', second, first], ['exit', second, null],
  ]);
});

test('State base hooks are optional and invalid states are rejected before exiting', () => {
  const machine = new StateMachine();
  const state = new State();
  machine.change(state);
  machine.update(0.1);
  for (const invalid of [{}, undefined, 'idle']) {
    assert.throws(() => machine.change(invalid), TypeError);
    assert.equal(machine.current, state);
  }
  machine.change(null);
});

test('StateMachine supports a transition requested during update', () => {
  const machine = new StateMachine();
  const next = new State();
  class AdvancingState extends State {
    update() { machine.change(next); }
  }
  machine.change(new AdvancingState());
  machine.update(0.1);
  assert.equal(machine.current, next);
});

test('StateMachine rejects nested lifecycle transitions and unlocks after an enter error', () => {
  const machine = new StateMachine();
  class NestedState extends State {
    enter() { machine.change(null); }
  }
  const nested = new NestedState();
  assert.throws(() => machine.change(nested), /inside enter or exit/);
  assert.equal(machine.current, nested);
  machine.change(null);
  assert.equal(machine.current, null);
});

test('StateMachine retains the previous state when exit fails and allows retry', () => {
  let fail = true;
  class FailingState extends State {
    exit() { if (fail) throw new Error('exit failed'); }
  }
  const machine = new StateMachine();
  const previous = new FailingState();
  const next = new State();
  machine.change(previous);
  assert.throws(() => machine.change(next), /exit failed/);
  assert.equal(machine.current, previous);
  fail = false;
  machine.change(next);
  assert.equal(machine.current, next);
});
