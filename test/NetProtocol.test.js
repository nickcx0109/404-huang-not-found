import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServerMessage, roundAngle, roundCoord } from '../web/js/net/protocol.js';

test('protocol rounds coordinates to 2 decimals and angles to 3', () => {
  assert.equal(roundCoord(1.23456), 1.23);
  assert.equal(roundCoord(-7.005001), -7.01);
  assert.equal(roundAngle(3.14159265), 3.142);
  assert.equal(roundAngle(-0.0004), -0);
});

test('parseServerMessage accepts each well-formed server message', () => {
  const messages = [
    { t: 'room', code: 'AB2C', you: 'p1', players: [{ id: 'p1', name: 'A' }], level: 'ch2', state: 'lobby' },
    { t: 'error', code: 'full' },
    { t: 'pong', c: 1, s: 2 },
    { t: 'snapshot', tick: 3, time: 100, ack: 2, players: [], enemies: [] },
    { t: 'event', name: 'weapon.fired', detail: {} },
  ];
  for (const message of messages) assert.deepEqual(parseServerMessage(JSON.stringify(message)), message);
});

test('parseServerMessage ignores malformed frames', () => {
  const frames = [
    'not json',
    '42',
    'null',
    '[]',
    '{"no":"type"}',
    '{"t":"unknown"}',
    '{"t":"toString"}',
    '{"t":"room","players":[]}',
    '{"t":"error","code":5}',
    '{"t":"pong","c":"1","s":2}',
    '{"t":"snapshot","time":1,"players":[]}',
    '{"t":"snapshot","time":"1","players":[],"enemies":[]}',
    '{"t":"event"}',
  ];
  for (const frame of frames) assert.equal(parseServerMessage(frame), null, frame);
  assert.equal(parseServerMessage(new ArrayBuffer(4)), null);
  assert.equal(parseServerMessage(undefined), null);
});
