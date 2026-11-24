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
    { t: 'snapshot', tick: 3, time: 100, ack: 2, state: 'playing', wave: 1, kills: 0, players: [], enemies: [] },
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

const COMPLETE = Object.freeze({
  room: { t: 'room', code: 'AB2C', you: 'p1', players: [], level: 'ch2', state: 'lobby' },
  error: { t: 'error', code: 'full' },
  pong: { t: 'pong', c: 1, s: 2 },
  snapshot: { t: 'snapshot', tick: 3, time: 100, ack: 2, state: 'playing', wave: 1, kills: 0, players: [], enemies: [] },
  event: { t: 'event', name: 'weapon.fired', detail: {} },
});

test('parseServerMessage rejects messages missing any documented required field', () => {
  for (const [type, message] of Object.entries(COMPLETE)) {
    for (const field of Object.keys(message)) {
      const { [field]: _omitted, ...partial } = message;
      assert.equal(parseServerMessage(JSON.stringify(partial)), null, `${type} without ${field}`);
    }
  }
});

test('parseServerMessage checks field types and the optional pickups list', () => {
  const wrong = [
    { ...COMPLETE.room, you: 1 },
    { ...COMPLETE.room, level: null },
    { ...COMPLETE.room, state: 0 },
    { ...COMPLETE.snapshot, tick: '3' },
    { ...COMPLETE.snapshot, ack: null },
    { ...COMPLETE.snapshot, pickups: {} },
    { ...COMPLETE.event, detail: null },
    { ...COMPLETE.event, detail: [] },
    { ...COMPLETE.event, detail: 'x' },
    { ...COMPLETE.error, t: ['error'] },
  ];
  for (const message of wrong) assert.equal(parseServerMessage(JSON.stringify(message)), null, JSON.stringify(message));
  const withPickups = { ...COMPLETE.snapshot, pickups: [{ id: 1 }] };
  assert.deepEqual(parseServerMessage(JSON.stringify(withPickups)), withPickups);
});

test('parseServerMessage accepts any error code string, including future ones', () => {
  for (const code of ['no-room', 'full', 'started', 'bad-message', 'bad-level', 'start-failed', 'later-code']) {
    assert.deepEqual(parseServerMessage(JSON.stringify({ t: 'error', code })), { t: 'error', code });
  }
});
