import test from 'node:test';
import assert from 'node:assert/strict';
import { CardQueue } from '../web/js/ui/hud/logic/CardQueue.js';

test('CardQueue holds a card, fades it, then shows the next one', () => {
  const queue = new CardQueue({ holdSeconds: 2, fadeSeconds: 1 });
  assert.equal(queue.text, null);
  assert.equal(queue.phase, null);

  queue.push('WAVE 1');
  queue.push('FUEL FULL');
  assert.equal(queue.text, 'WAVE 1');
  assert.equal(queue.phase, 'hold');
  queue.update(1.9);
  assert.equal(queue.phase, 'hold');
  queue.update(0.2);
  assert.equal(queue.phase, 'fade');
  assert.equal(queue.text, 'WAVE 1');
  queue.update(1);
  assert.equal(queue.text, 'FUEL FULL');
  assert.equal(queue.phase, 'hold');
  queue.update(3.5);
  assert.equal(queue.text, null);
  assert.equal(queue.phase, null);
});

test('CardQueue lets a sticky card take over and stay', () => {
  const queue = new CardQueue({ holdSeconds: 2, fadeSeconds: 1 });
  queue.push('WAVE 4');
  queue.push('CLEAR');
  queue.push('YOU DIED', { sticky: true });
  assert.equal(queue.text, 'YOU DIED');
  queue.update(60);
  assert.equal(queue.text, 'YOU DIED');
  assert.equal(queue.phase, 'hold');
  queue.push('WAVE 5');
  queue.update(60);
  assert.equal(queue.text, 'YOU DIED', 'nothing follows a sticky card');
  assert.throws(() => new CardQueue({ holdSeconds: 0 }), RangeError);
});
