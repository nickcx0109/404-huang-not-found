import test from 'node:test';
import assert from 'node:assert/strict';
import { Attention } from '../web/js/ui/hud/logic/Attention.js';

test('Attention stands out after a change and sinks back after the hold time', () => {
  const attention = new Attention({ holdSeconds: 3 });
  assert.equal(attention.awake, false);
  attention.poke();
  attention.update(2.9);
  assert.equal(attention.awake, true);
  attention.update(0.2);
  assert.equal(attention.awake, false);
});

test('Attention restarts the hold on every change and stays up while pinned', () => {
  const attention = new Attention({ holdSeconds: 1 });
  attention.poke();
  attention.update(0.8);
  attention.poke();
  attention.update(0.8);
  assert.equal(attention.awake, true);
  attention.pin(true);
  attention.update(10);
  assert.equal(attention.awake, true);
  attention.pin(false);
  assert.equal(attention.awake, false);
  assert.throws(() => new Attention({ holdSeconds: -1 }), RangeError);
});
