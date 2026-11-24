import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageParser, MAX_MESSAGE_BYTES } from '../server/protocol/ClientMessages.js';
import { MessageSchema } from '../server/protocol/MessageSchema.js';
import { TextField, IntegerField } from '../server/protocol/Fields.js';

const parser = new MessageParser();
const parse = message => parser.parse(JSON.stringify(message));

test('MessageParser accepts every client message type and drops unknown fields', () => {
  assert.deepEqual(parse({ t: 'create', name: '  Ann ', level: 'ch2', extra: 1 }), { t: 'create', name: 'Ann', level: 'ch2' });
  assert.deepEqual(parse({ t: 'join', name: 'Bo', code: ' k7qx' }), { t: 'join', name: 'Bo', code: 'K7QX' });
  assert.deepEqual(parse({ t: 'leave' }), { t: 'leave' });
  assert.deepEqual(parse({ t: 'start' }), { t: 'start' });
  assert.deepEqual(parse({ t: 'ping', c: 12.5 }), { t: 'ping', c: 12.5 });
  const input = { t: 'input', seq: 3, x: 1.25, y: 0, z: -4, yaw: 3.142, pitch: -0.2 };
  assert.deepEqual(parse(input), input);
  assert.deepEqual(parse({ t: 'action', seq: 4, kind: 'switch', at: 1000, index: 2 }),
    { t: 'action', seq: 4, kind: 'switch', at: 1000, index: 2 });
  assert.deepEqual(parse({ t: 'action', seq: 5, kind: 'revive', at: 1, holding: true }),
    { t: 'action', seq: 5, kind: 'revive', at: 1, holding: true });
});

test('MessageParser rejects malformed text, wrong shapes and oversize messages', () => {
  const bad = [
    'not json', '[]', 'null', '42', '{"name":"x"}', '{"t":"dance"}', '{"t":5}',
    JSON.stringify({ t: 'create', name: '', level: 'ch2' }),
    JSON.stringify({ t: 'create', name: 'A'.repeat(25), level: 'ch2' }),
    JSON.stringify({ t: 'create', name: 'Ann', level: '../secret' }),
    JSON.stringify({ t: 'join', name: 'Ann' }),
    JSON.stringify({ t: 'ping', c: '12' }),
    JSON.stringify({ t: 'input', seq: 1.5, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }),
    JSON.stringify({ t: 'input', seq: 1, x: 0, y: 0, z: 0, yaw: 0 }),
    JSON.stringify({ t: 'action', seq: 1, kind: 'nuke', at: 0 }),
    JSON.stringify({ t: 'action', seq: 1, kind: 'switch', at: 0, index: -1 }),
  ];
  for (const text of bad) assert.equal(parser.parse(text), null, text);
  assert.equal(parser.parse(null), null);
  assert.equal(parser.parse(Buffer.from('{"t":"leave"}')), null, 'binary frames are rejected');
  const padded = JSON.stringify({ t: 'leave', pad: 'x'.repeat(MAX_MESSAGE_BYTES) });
  assert.equal(parser.parse(padded), null);
  // NaN/Infinity cannot come through JSON, but the field rule still guards direct use.
  assert.equal(new MessageParser().schemas.get('ping').parse({ c: Infinity }), null);
});

test('MessageParser can be built from custom schemas and limits', () => {
  const custom = new MessageParser([
    new MessageSchema('hello', { who: new TextField({ max: 3 }), n: new IntegerField({ min: 1, optional: true }) }),
  ], { maxBytes: 40 });
  assert.deepEqual(custom.parse('{"t":"hello","who":"me"}'), { t: 'hello', who: 'me' });
  assert.equal(custom.parse('{"t":"hello","who":"me","n":0}'), null);
  assert.equal(custom.parse('{"t":"leave"}'), null);
  assert.equal(custom.parse(JSON.stringify({ t: 'hello', who: 'me', junk: 'y'.repeat(30) })), null);
});
