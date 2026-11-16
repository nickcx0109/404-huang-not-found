import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectPool } from '../web/js/core/ObjectPool.js';

test('ObjectPool creates lazily and resets before reusing the same object', () => {
  let created = 0;
  const pool = new ObjectPool(() => ({ id: ++created, value: 0 }), (object) => { object.value = 0; });
  assert.equal(created, 0);
  const object = pool.acquire();
  object.value = 9;
  assert.equal(pool.activeCount, 1);
  pool.release(object);
  assert.equal(object.value, 0);
  assert.equal(pool.activeCount, 0);
  assert.equal(pool.availableCount, 1);
  assert.equal(pool.acquire(), object);
  assert.equal(created, 1);
  assert.equal(pool.availableCount, 0);
});

test('ObjectPool keeps concurrent leases separate and reuses in LIFO order', () => {
  const pool = new ObjectPool(() => ({}));
  const first = pool.acquire();
  const second = pool.acquire();
  assert.notEqual(first, second);
  assert.equal(pool.activeCount, 2);
  pool.release(first);
  pool.release(second);
  assert.equal(pool.acquire(), second);
  assert.equal(pool.acquire(), first);
});

test('ObjectPool rejects foreign objects and double release without resetting them', () => {
  let resets = 0;
  const pool = new ObjectPool(() => ({}), () => { resets++; });
  assert.throws(() => pool.release({}), TypeError);
  const object = pool.acquire();
  pool.release(object);
  assert.throws(() => pool.release(object), TypeError);
  assert.equal(resets, 1);
  assert.equal(pool.availableCount, 1);
});

test('ObjectPool reset errors retain ownership and allow retry', () => {
  let fail = true;
  const pool = new ObjectPool(() => ({}), () => { if (fail) throw new Error('reset'); });
  const object = pool.acquire();
  assert.throws(() => pool.release(object), /reset/);
  assert.equal(pool.activeCount, 1);
  assert.equal(pool.availableCount, 0);
  fail = false;
  pool.release(object);
  assert.equal(pool.acquire(), object);
});

test('ObjectPool validates callbacks and leaves counts unchanged after a factory error', () => {
  assert.throws(() => new ObjectPool(null), TypeError);
  assert.throws(() => new ObjectPool(() => ({}), null), TypeError);
  const pool = new ObjectPool(() => { throw new Error('factory'); });
  assert.throws(() => pool.acquire(), /factory/);
  assert.equal(pool.activeCount, 0);
  assert.equal(pool.availableCount, 0);
});

test('ObjectPool rejects a factory that returns an already acquired singleton', () => {
  const singleton = {};
  const pool = new ObjectPool(() => singleton);
  assert.equal(pool.acquire(), singleton);
  assert.throws(() => pool.acquire(), /active object/);
  assert.equal(pool.activeCount, 1);
});
