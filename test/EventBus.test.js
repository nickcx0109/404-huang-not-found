import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';

test('EventBus delivers arguments in subscription order and isolates events', () => {
  const bus = new EventBus();
  const calls = [];
  const payload = { value: 3 };
  bus.on('ready', (...args) => calls.push(['first', ...args]));
  bus.on('ready', (...args) => calls.push(['second', ...args]));
  bus.on('other', () => assert.fail('wrong event'));
  assert.equal(bus.emit('ready', payload, 7), 2);
  assert.deepEqual(calls, [['first', payload, 7], ['second', payload, 7]]);
  assert.equal(bus.emit('unknown'), 0);
  assert.equal(new EventBus().emit('ready'), 0);
});

test('EventBus unsubscribe removes one subscription and off removes all callback matches', () => {
  const bus = new EventBus();
  const listener = () => {};
  const unsubscribe = bus.on('event', listener);
  bus.on('event', listener);
  assert.equal(unsubscribe(), true);
  assert.equal(unsubscribe(), false);
  assert.equal(bus.emit('event'), 1);
  assert.equal(bus.off('event', listener), true);
  assert.equal(bus.off('event', listener), false);
  assert.equal(bus.emit('event'), 0);
});

test('EventBus once removes before a recursive emit', () => {
  const bus = new EventBus();
  let calls = 0;
  bus.once('event', () => {
    calls++;
    assert.equal(bus.emit('event'), 0);
  });
  assert.equal(bus.emit('event'), 1);
  assert.equal(bus.emit('event'), 0);
  assert.equal(calls, 1);
});

test('EventBus once can be cancelled by callback or unsubscribe', () => {
  const bus = new EventBus();
  const listener = () => assert.fail('cancelled listener');
  bus.once('event', listener);
  assert.equal(bus.off('event', listener), true);
  const unsubscribe = bus.once('event', listener);
  assert.equal(unsubscribe(), true);
  assert.equal(bus.emit('event'), 0);
});

test('EventBus defers additions and skips listeners removed during delivery', () => {
  const bus = new EventBus();
  const calls = [];
  const removed = () => calls.push('removed');
  bus.once('event', () => {
    calls.push('first');
    bus.off('event', removed);
    bus.on('event', () => calls.push('added'));
  });
  bus.on('event', removed);
  assert.equal(bus.emit('event'), 1);
  assert.deepEqual(calls, ['first']);
  assert.equal(bus.emit('event'), 1);
  assert.deepEqual(calls, ['first', 'added']);
});

test('EventBus propagates errors without retaining a once subscription', () => {
  const bus = new EventBus();
  const error = new Error('listener failed');
  bus.once('event', () => { throw error; });
  assert.throws(() => bus.emit('event'), error);
  assert.equal(bus.emit('event'), 0);
  assert.throws(() => bus.on('event', null), TypeError);
  assert.throws(() => bus.once('event', {}), TypeError);
});
