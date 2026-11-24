import test from 'node:test';
import assert from 'node:assert/strict';
import { InputSender } from '../web/js/net/InputSender.js';
import { NetClient } from '../web/js/net/NetClient.js';
import { FakeTime, socketFactory } from './helpers/netFakes.js';

const pose = { x: 1, y: 0, z: 2, yaw: 0.5, pitch: 0 };

function recorder(accept = () => true) {
  const sent = [];
  return { sent, sendInput: (p) => (accept() ? (sent.push(p), true) : false) };
}

test('InputSender sends 30 inputs per second from a 60 fps loop', () => {
  const time = new FakeTime(0);
  const client = recorder();
  const sender = new InputSender({ client, now: time.now });
  for (let frame = 0; frame < 600; frame++) {
    sender.update(pose);
    time.advance(1000 / 60);
  }
  assert.equal(client.sent.length, 300);
  assert.equal(sender.sent, 300);
});

test('InputSender never exceeds the rate on a fast or jittery loop', () => {
  const time = new FakeTime(0);
  const client = recorder();
  const sender = new InputSender({ client, now: time.now });
  const steps = [3, 7, 1, 12, 5, 9];
  for (let i = 0; time.time < 10_000; i++) {
    sender.update(pose);
    time.advance(steps[i % steps.length]);
  }
  assert.ok(client.sent.length <= 301, `${client.sent.length}`);
  assert.ok(client.sent.length >= 290, `${client.sent.length}`);
});

test('InputSender sends every frame when frames are slower than the rate', () => {
  const time = new FakeTime(0);
  const client = recorder();
  const sender = new InputSender({ client, now: time.now });
  for (let frame = 0; frame < 20; frame++) {
    assert.equal(sender.update(pose), true);
    time.advance(50);
  }
});

test('InputSender does not burst to catch up after a stall', () => {
  const time = new FakeTime(0);
  const client = recorder();
  const sender = new InputSender({ client, now: time.now });
  sender.update(pose);
  time.advance(2000);
  assert.equal(sender.update(pose), true);
  assert.equal(sender.update(pose), false);
  time.advance(16);
  assert.equal(sender.update(pose), false);
  time.advance(18);
  assert.equal(sender.update(pose), true);
});

test('InputSender retries next frame when the client could not send', () => {
  const time = new FakeTime(0);
  let open = false;
  const client = recorder(() => open);
  const sender = new InputSender({ client, rate: 10, now: time.now });
  assert.equal(sender.update(pose), false);
  open = true;
  time.advance(1);
  assert.equal(sender.update(pose), true);
  assert.equal(sender.update(pose), false);
  sender.reset();
  assert.equal(sender.update(pose), true);
  assert.deepEqual(client.sent, [pose, pose]);
});

test('InputSender drives a real NetClient over a fake socket', () => {
  const time = new FakeTime(0);
  const factory = socketFactory();
  const client = new NetClient({ url: 'ws://x', createSocket: factory.create, now: time.now, timers: time.timers, pingInterval: 60_000 });
  const sender = new InputSender({ client, now: time.now });
  client.connect();
  factory.last.open();
  for (let frame = 0; frame < 60; frame++) {
    sender.update({ ...pose, x: frame });
    time.advance(1000 / 60);
  }
  const inputs = factory.last.messages.filter((m) => m.t === 'input');
  assert.equal(inputs.length, 30);
  assert.deepEqual(inputs.map((m) => m.seq), Array.from({ length: 30 }, (_, i) => i + 1));
});

test('InputSender validates its options', () => {
  assert.throws(() => new InputSender({}), TypeError);
  assert.throws(() => new InputSender({ client: recorder(), rate: 0 }), RangeError);
});
