import test from 'node:test';
import assert from 'node:assert/strict';
import { NetClient, CONNECTION_STATES } from '../web/js/net/NetClient.js';
import { ServerClock } from '../web/js/net/ServerClock.js';
import { FakeTime, socketFactory } from './helpers/netFakes.js';

const URL = 'ws://localhost:8787';

function setup({ makeClock, ...options } = {}) {
  const time = new FakeTime(10_000);
  const factory = socketFactory();
  if (makeClock) options.clock = makeClock(time);
  const client = new NetClient({ url: URL, createSocket: factory.create, now: time.now, timers: time.timers, ...options });
  const states = [];
  client.on('state', (state, previous) => states.push([previous, state]));
  return { time, factory, client, states };
}

function connected(options) {
  const env = setup(options);
  env.client.connect();
  env.factory.last.open();
  env.factory.last.sent.length = 0;
  return env;
}

const room = (code = 'AB2C', name = 'Nick') => ({ t: 'room', code, you: 'p1', players: [{ id: 'p2', name: 'Amy' }, { id: 'p1', name }], level: 'ch2', state: 'lobby' });
const nonPing = (socket) => socket.messages.filter((m) => m.t !== 'ping');

test('NetClient connects through the injected socket factory and reports states', () => {
  const { client, factory, states } = setup();
  assert.equal(client.state, CONNECTION_STATES.IDLE);
  client.connect();
  assert.equal(factory.sockets.length, 1);
  assert.equal(factory.last.url, URL);
  assert.equal(client.state, 'connecting');
  assert.equal(client.isOpen, false);
  client.connect();
  assert.equal(factory.sockets.length, 1, 'connect while connecting is a no-op');
  factory.last.open();
  assert.equal(client.isOpen, true);
  assert.deepEqual(states, [['idle', 'connecting'], ['connecting', 'open']]);
});

test('NetClient requires a url and rejects unknown listener types', () => {
  assert.throws(() => new NetClient({}), TypeError);
  const { client } = setup();
  assert.throws(() => client.on('pong', () => {}), RangeError);
});

test('NetClient sends lobby messages in protocol shape', () => {
  const { client, factory } = connected();
  assert.equal(client.create('Nick', 'ch2'), true);
  assert.equal(client.join('Amy', 'XY3Z'), true);
  assert.equal(client.start(), true);
  assert.deepEqual(factory.last.messages, [
    { t: 'create', name: 'Nick', level: 'ch2' },
    { t: 'join', name: 'Amy', code: 'XY3Z' },
    { t: 'start' },
  ]);
});

test('NetClient refuses to send before the socket is open', () => {
  const { client, factory } = setup();
  assert.equal(client.create('Nick', 'ch2'), false);
  client.connect();
  assert.equal(client.start(), false);
  assert.equal(client.sendInput({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }), false);
  assert.equal(client.action('fire'), false);
  assert.equal(client.inputSeq, 0, 'unsent input does not use a seq');
  assert.equal(factory.last.sent.length, 0);
});

test('NetClient numbers input with an incrementing seq and rounds per protocol', () => {
  const { client, factory } = connected();
  client.sendInput({ x: 1.23456, y: 0.5, z: -2.98765, yaw: 1.234567, pitch: -0.0123456 });
  client.sendInput({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  assert.deepEqual(factory.last.messages, [
    { t: 'input', seq: 1, x: 1.23, z: -2.99, y: 0.5, yaw: 1.235, pitch: -0.012 },
    { t: 'input', seq: 2, x: 0, z: 0, y: 0, yaw: 0, pitch: 0 },
  ]);
  assert.equal(client.inputSeq, 2);
  assert.throws(() => client.sendInput({ x: Number.NaN, y: 0, z: 0, yaw: 0, pitch: 0 }), TypeError);
});

test('NetClient stamps actions with the estimated server time', () => {
  const { client, factory, time } = setup();
  client.connect();
  factory.last.open();
  // The open ping went out at 10 000; its pong comes back 40 ms later: offset +5000.
  time.advance(40);
  factory.last.receive({ t: 'pong', c: 10_000, s: 15_020 });
  client.action('fire');
  client.action('switch', { index: 2 });
  client.action('cycle', { step: -1 });
  client.action('revive', { holding: true });
  time.advance(16);
  client.action('reload', { t: 'hack', seq: 99, kind: 'fire', at: 0 });
  const sent = factory.last.messages.filter((m) => m.t === 'action');
  assert.deepEqual(sent, [
    { t: 'action', seq: 1, kind: 'fire', at: 15_040 },
    { t: 'action', seq: 2, kind: 'switch', at: 15_040, index: 2 },
    { t: 'action', seq: 3, kind: 'cycle', at: 15_040, step: -1 },
    { t: 'action', seq: 4, kind: 'revive', at: 15_040, holding: true },
    { t: 'action', seq: 5, kind: 'reload', at: 15_056 },
  ]);
  assert.equal(client.actionSeq, 5);
  assert.throws(() => client.action('dance'), RangeError);
});

test('NetClient pings on open and periodically, and pongs feed the clock', () => {
  const env = setup({ pingInterval: 1000 });
  env.client.connect();
  const socket = env.factory.last;
  socket.open();
  assert.deepEqual(socket.messages, [{ t: 'ping', c: 10_000 }]);
  env.time.advance(1000);
  env.time.advance(1000);
  assert.deepEqual(socket.messages.map((m) => m.c), [10_000, 11_000, 12_000]);
  // Pong for the 12 000 ping arrives 60 ms later with server time 50 030.
  env.time.advance(60);
  socket.receive({ t: 'pong', c: 12_000, s: 50_030 });
  assert.equal(env.client.clock.synced, true);
  assert.equal(env.client.clock.rtt, 60);
  assert.equal(env.client.clock.now(), 50_060);
});

test('NetClient delivers room, error, snapshot and event messages to typed listeners', () => {
  const { client, factory } = connected();
  const got = { room: [], error: [], snapshot: [], event: [] };
  for (const type of Object.keys(got)) client.on(type, (message) => got[type].push(message));
  const snapshot = { t: 'snapshot', tick: 1, time: 50, ack: 0, state: 'playing', wave: 1, kills: 0, players: [], enemies: [] };
  factory.last.receive(room());
  factory.last.receive({ t: 'error', code: 'full' });
  factory.last.receive(snapshot);
  factory.last.receive({ t: 'event', name: 'weapon.fired', detail: { ownerId: 'p2' } });
  assert.deepEqual(got.room, [room()]);
  assert.deepEqual(got.error, [{ t: 'error', code: 'full' }]);
  assert.deepEqual(got.snapshot, [snapshot]);
  assert.deepEqual(got.event, [{ t: 'event', name: 'weapon.fired', detail: { ownerId: 'p2' } }]);
  assert.deepEqual(client.room, room());
});

test('NetClient ignores malformed messages without throwing', () => {
  const { client, factory } = connected();
  let delivered = 0;
  for (const type of ['room', 'error', 'snapshot', 'event']) client.on(type, () => delivered++);
  for (const frame of ['{oops', '"text"', '{"t":"snapshot","time":1}', '{"t":"pong","c":1}', '{"t":"room"}', '{"t":"nope"}']) {
    assert.doesNotThrow(() => factory.last.receive(frame));
  }
  factory.last.onmessage({ data: new Uint8Array([1, 2]) });
  factory.last.onmessage(undefined);
  assert.equal(delivered, 0);
  assert.equal(client.clock.synced, false);
  assert.equal(client.room, null);
});

test('NetClient unsubscribes listeners with the returned function or off()', () => {
  const { client, factory } = connected();
  let calls = 0;
  const listener = () => calls++;
  const unsubscribe = client.on('error', listener);
  factory.last.receive({ t: 'error', code: 'full' });
  unsubscribe();
  factory.last.receive({ t: 'error', code: 'full' });
  client.on('error', listener);
  client.off('error', listener);
  factory.last.receive({ t: 'error', code: 'full' });
  assert.equal(calls, 1);
});

test('NetClient reconnects with exponential backoff after an unexpected close', () => {
  const { client, factory, time, states } = connected({ reconnect: { initialDelay: 500, maxDelay: 2000, factor: 2 } });
  states.length = 0;
  factory.last.drop();
  assert.equal(client.state, 'reconnecting');
  assert.equal(client.reconnectAttempts, 1);
  time.advance(499);
  assert.equal(factory.sockets.length, 1);
  time.advance(1);
  assert.equal(factory.sockets.length, 2, 'retry after 500 ms');
  factory.last.drop();
  time.advance(999);
  assert.equal(factory.sockets.length, 2);
  time.advance(1);
  assert.equal(factory.sockets.length, 3, 'retry after 1000 ms');
  factory.last.drop();
  time.advance(2000);
  assert.equal(factory.sockets.length, 4, 'retry after 2000 ms');
  factory.last.drop();
  time.advance(2000);
  assert.equal(factory.sockets.length, 5, 'capped at maxDelay');
  factory.last.open();
  assert.equal(client.state, 'open');
  assert.equal(client.reconnectAttempts, 0);
  assert.deepEqual(states, [['open', 'reconnecting'], ['reconnecting', 'open']]);
  // Backoff restarts from the initial delay after a successful open.
  factory.last.drop();
  time.advance(500);
  assert.equal(factory.sockets.length, 6);
});

test('NetClient stops pinging while disconnected and resumes on reconnect', () => {
  const { client, factory, time } = connected({ pingInterval: 1000, reconnect: { initialDelay: 100 } });
  const first = factory.last;
  first.drop();
  time.advance(100);
  const pingsBefore = first.sent.length;
  time.advance(3000);
  assert.equal(first.sent.length, pingsBefore, 'no pings on a dead socket');
  factory.last.open();
  assert.deepEqual(factory.last.messages, [{ t: 'ping', c: time.time }]);
  assert.equal(client.isOpen, true);
});

test('NetClient rejoins the last room after reconnecting', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  client.create('Nick', 'ch2');
  factory.last.receive(room('QR7T'));
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  assert.deepEqual(factory.last.messages.filter((m) => m.t !== 'ping'), [{ t: 'join', name: 'Nick', code: 'QR7T' }]);
});

test('NetClient can skip the automatic rejoin', () => {
  const { client, factory, time } = connected({ rejoin: false, reconnect: { initialDelay: 100 } });
  client.join('Nick', 'QR7T');
  factory.last.receive(room('QR7T'));
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  assert.deepEqual(factory.last.messages.filter((m) => m.t !== 'ping'), []);
});

test('NetClient does not reconnect after leave()', () => {
  const { client, factory, time, states } = connected();
  factory.last.receive(room());
  states.length = 0;
  const socket = factory.last;
  assert.equal(client.leave(), true);
  assert.deepEqual(socket.messages, [{ t: 'leave' }]);
  assert.equal(socket.closed, true);
  assert.equal(client.state, 'closed');
  assert.equal(client.room, null);
  socket.drop();
  time.advance(60_000);
  assert.equal(factory.sockets.length, 1);
  assert.equal(time.pending, 0, 'no ping or reconnect timers left');
  assert.deepEqual(states, [['open', 'closed']]);
});

test('NetClient disconnect() cancels a pending reconnect', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 500 } });
  factory.last.drop();
  client.disconnect();
  time.advance(10_000);
  assert.equal(factory.sockets.length, 1);
  assert.equal(client.state, 'closed');
  assert.equal(time.pending, 0);
});

test('NetClient can connect again after leaving', () => {
  const { client, factory } = connected();
  client.leave();
  client.connect();
  assert.equal(factory.sockets.length, 2);
  factory.last.open();
  assert.equal(client.isOpen, true);
});

test('NetClient ignores events from a socket it has replaced', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  const old = factory.last;
  const onmessage = old.onmessage;
  const onclose = old.onclose;
  old.drop();
  time.advance(100);
  factory.last.open();
  let rooms = 0;
  client.on('room', () => rooms++);
  onmessage({ data: JSON.stringify(room()) });
  onclose({});
  assert.equal(rooms, 0);
  assert.equal(client.isOpen, true);
});

test('NetClient gives up after maxAttempts failed reconnects', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100, factor: 1, maxAttempts: 2 } });
  factory.last.drop();
  time.advance(100);
  factory.last.drop();
  time.advance(100);
  factory.last.drop();
  assert.equal(client.state, 'closed');
  time.advance(10_000);
  assert.equal(factory.sockets.length, 3);
});

test('NetClient treats a throwing socket factory as a failed attempt', () => {
  const time = new FakeTime();
  let calls = 0;
  const sockets = socketFactory();
  const client = new NetClient({
    url: URL,
    now: time.now,
    timers: time.timers,
    reconnect: { initialDelay: 100 },
    createSocket: (url) => {
      calls++;
      if (calls === 1) throw new Error('bad url');
      return sockets.create(url);
    },
  });
  client.connect();
  assert.equal(client.state, 'reconnecting');
  time.advance(100);
  sockets.last.open();
  assert.equal(client.isOpen, true);
});

test('NetClient treats an error followed by close like any unexpected close', () => {
  const { client, factory } = connected();
  factory.last.error();
  assert.equal(client.isOpen, true, 'error alone changes nothing');
  factory.last.drop();
  assert.equal(client.state, 'reconnecting');
});

test('NetClient: disconnect() from a `connecting` listener closes for good', () => {
  const { client, factory, time } = setup();
  client.on('state', (state) => state === 'connecting' && client.disconnect());
  client.connect();
  const socket = factory.last;
  assert.equal(client.state, 'closed');
  assert.equal(socket.closed, true);
  assert.equal(time.pending, 0);
  socket.open();
  time.advance(60_000);
  assert.equal(client.state, 'closed');
  assert.equal(client.isOpen, false);
  assert.equal(factory.sockets.length, 1);
  assert.equal(time.pending, 0);
});

test('NetClient: disconnect() from an `open` listener leaves no ping running', () => {
  const { client, factory, time } = setup({ pingInterval: 1000 });
  client.on('state', (state) => state === 'open' && client.disconnect());
  client.connect();
  const socket = factory.last;
  socket.open();
  assert.equal(client.state, 'closed');
  assert.equal(time.pending, 0);
  const sent = socket.sent.length;
  time.advance(10_000);
  assert.equal(socket.sent.length, sent, 'no pings after disconnect');
  assert.equal(factory.sockets.length, 1);
});

test('NetClient: disconnect() from a `reconnecting` listener cancels the retry', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  client.on('state', (state) => state === 'reconnecting' && client.disconnect());
  factory.last.drop();
  assert.equal(client.state, 'closed');
  assert.equal(time.pending, 0);
  time.advance(60_000);
  assert.equal(factory.sockets.length, 1);
  assert.equal(client.state, 'closed');
});

function twoListeners(client, disconnectOn) {
  const second = [];
  client.on('state', (state) => state === disconnectOn && client.disconnect());
  client.on('state', (state, previous) => second.push([previous, state]));
  return second;
}

test('NetClient: every listener sees ordered transitions when one disconnects on `connecting`', () => {
  const { client } = setup();
  const second = twoListeners(client, 'connecting');
  client.connect();
  assert.deepEqual(second, [['idle', 'connecting'], ['connecting', 'closed']]);
  assert.equal(second.at(-1)[1], client.state);
});

test('NetClient: every listener sees ordered transitions when one disconnects on `open`', () => {
  const { client, factory } = setup();
  const second = twoListeners(client, 'open');
  client.connect();
  factory.last.open();
  assert.deepEqual(second, [['idle', 'connecting'], ['connecting', 'open'], ['open', 'closed']]);
  assert.equal(client.state, 'closed');
});

test('NetClient: every listener sees ordered transitions when one disconnects on `reconnecting`', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  const second = twoListeners(client, 'reconnecting');
  factory.last.drop();
  assert.deepEqual(second, [['open', 'reconnecting'], ['reconnecting', 'closed']]);
  assert.equal(client.state, 'closed');
  assert.equal(time.pending, 0);
});

test('NetClient: isOpen is false while the socket is closing', () => {
  const { client, factory } = connected();
  assert.equal(client.isOpen, true);
  factory.last.readyState = 2;
  assert.equal(client.isOpen, false);
  assert.equal(client.start(), false);
});

test('NetClient: a pinging clock with its own time origin stays consistent', () => {
  // The clock's client time is 1 000 000 ms ahead of the time NetClient was given.
  const { client, factory, time } = setup({ makeClock: (t) => new ServerClock({ now: () => t.time + 1_000_000 }) });
  client.connect();
  factory.last.open();
  const [ping] = factory.last.messages;
  assert.deepEqual(ping, { t: 'ping', c: 1_010_000 });
  time.advance(30);
  factory.last.receive({ t: 'pong', c: ping.c, s: 77_015 });
  assert.equal(client.clock.rtt, 30);
  assert.equal(client.clock.now(), 77_030);
  client.action('fire');
  assert.equal(nonPing(factory.last)[0].at, 77_030);
});

test('NetClient resyncs the clock to a restarted server instead of keeping old samples', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  // First server: a very good rtt-10 sample, server clock 100 000 ms ahead.
  time.advance(10);
  factory.last.receive({ t: 'pong', c: 10_000, s: 110_005 });
  assert.equal(client.clock.now(), 110_010);
  // The server restarts with its clock near zero.
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  const ping = factory.last.messages[0];
  assert.equal(ping.t, 'ping');
  time.advance(60);
  factory.last.receive({ t: 'pong', c: ping.c, s: 20 });
  // rtt 60, server stamped 20 halfway: now = 20 + 30 = 50.
  assert.equal(client.clock.now(), 50);
  assert.equal(client.clock.bestRtt, 60);
  client.action('fire');
  assert.equal(nonPing(factory.last)[0].at, 50);
});

test('NetClient clears room membership when the socket is lost', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  factory.last.receive(room('QR7T'));
  assert.equal(client.room.code, 'QR7T');
  factory.last.drop();
  assert.equal(client.room, null);
  time.advance(100);
  factory.last.open();
  assert.equal(client.room, null, 'not a member again until the server says so');
  factory.last.receive(room('QR7T'));
  assert.equal(client.room.code, 'QR7T');
});

test('NetClient stops retrying a rejoin the server refused', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  const errors = [];
  client.on('error', (message) => errors.push(message.code));
  factory.last.receive(room('QR7T'));
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  assert.deepEqual(nonPing(factory.last), [{ t: 'join', name: 'Nick', code: 'QR7T' }]);
  factory.last.receive({ t: 'error', code: 'started' });
  assert.deepEqual(errors, ['started']);
  assert.equal(client.room, null);
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  assert.deepEqual(nonPing(factory.last), [], 'refused room is forgotten');
});

test('NetClient with rejoin:false never sends a join on reconnect and drops membership', () => {
  const { client, factory, time } = connected({ rejoin: false, reconnect: { initialDelay: 100 } });
  factory.last.receive(room('QR7T'));
  factory.last.drop();
  assert.equal(client.room, null);
  time.advance(100);
  factory.last.open();
  assert.deepEqual(nonPing(factory.last), []);
  assert.equal(client.room, null);
});

test('NetClient rejoins under the name the server confirmed, not a refused request', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  client.create('Nick', 'ch2');
  factory.last.receive(room('QR7T', 'Nicky'));
  // A later join attempt with another name is refused: it must not change the rejoin name.
  client.join('Someone', 'ZZ9Z');
  factory.last.receive({ t: 'error', code: 'no-room' });
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  assert.deepEqual(nonPing(factory.last), [{ t: 'join', name: 'Nicky', code: 'QR7T' }]);
});

test('NetClient ignores a room message with an incomplete roster', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  factory.last.receive(room('QR7T'));
  factory.last.receive({ ...room('ZZ9Z'), players: [{ id: 'p1' }] });
  factory.last.receive({ ...room('YY8Y'), players: [{ id: 'p2', name: 'Amy' }] });
  assert.equal(client.room.code, 'QR7T');
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  assert.deepEqual(nonPing(factory.last), [{ t: 'join', name: 'Nick', code: 'QR7T' }]);
});

test('NetClient does not rejoin a room it only asked for', () => {
  const { client, factory, time } = connected({ reconnect: { initialDelay: 100 } });
  client.join('Nick', 'QR7T');
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  assert.deepEqual(nonPing(factory.last), []);
});

test('NetClient keeps seq unchanged when the socket is closing', () => {
  const { client, factory } = connected();
  client.sendInput({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  client.action('fire');
  factory.last.readyState = 2; // CLOSING
  assert.equal(client.sendInput({ x: 1, y: 0, z: 0, yaw: 0, pitch: 0 }), false);
  assert.equal(client.action('reload'), false);
  assert.equal(client.inputSeq, 1);
  assert.equal(client.actionSeq, 1);
  factory.last.readyState = 1;
  client.sendInput({ x: 2, y: 0, z: 0, yaw: 0, pitch: 0 });
  client.action('reload');
  assert.deepEqual(nonPing(factory.last).map((m) => [m.t, m.seq]), [['input', 1], ['action', 1], ['input', 2], ['action', 2]]);
});
