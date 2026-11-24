import test from 'node:test';
import assert from 'node:assert/strict';
import { NetClient } from '../web/js/net/NetClient.js';
import { TeamConnector } from '../web/js/net/TeamConnector.js';
import { NetworkedSession } from '../web/js/net/NetworkedSession.js';
import { RejoinTickets } from '../web/js/net/RejoinTickets.js';
import { parseServerMessage } from '../web/js/net/protocol.js';
import { RoomServer } from '../server/RoomServer.js';
import { LevelCatalog } from '../server/rooms/LevelCatalog.js';
import { SessionRoomGame, STEP_SECONDS } from '../server/game/SessionRoomGame.js';
import { FakeTime, socketFactory } from './helpers/netFakes.js';

const URL = 'ws://localhost:8787';

/** A Map-backed Storage; `broken` makes every call throw like a blocked sessionStorage. */
class MemoryStorage {
  constructor({ broken = false } = {}) {
    this.items = new Map();
    this.broken = broken;
  }
  getItem(key) { this._check(); return this.items.get(key) ?? null; }
  setItem(key, value) { this._check(); this.items.set(key, String(value)); }
  removeItem(key) { this._check(); this.items.delete(key); }
  _check() { if (this.broken) throw new Error('SecurityError'); }
}

test('RejoinTickets keeps the code and token of the last room', () => {
  const storage = new MemoryStorage();
  const tickets = new RejoinTickets(storage);
  assert.equal(tickets.load(), null);
  assert.equal(tickets.save({ code: 'AB2C', token: 'secret-token-1234' }), true);
  assert.deepEqual(tickets.load(), { code: 'AB2C', token: 'secret-token-1234' });
  assert.equal(tickets.tokenFor('AB2C'), 'secret-token-1234');
  assert.equal(tickets.tokenFor('ZZZZ'), null, 'another team gets no token');
  tickets.save({ code: 'AB2C' });
  assert.equal(tickets.load(), null, 'a room without a token clears the ticket');
  tickets.save({ code: 'AB2C', token: 'secret-token-1234' });
  tickets.clear();
  assert.equal(tickets.load(), null);
});

test('RejoinTickets survives blocked or garbled storage', () => {
  const blocked = new RejoinTickets(new MemoryStorage({ broken: true }));
  assert.equal(blocked.save({ code: 'AB2C', token: 'secret-token-1234' }), false);
  assert.equal(blocked.load(), null);
  assert.doesNotThrow(() => blocked.clear());
  assert.equal(new RejoinTickets(null).tokenFor('AB2C'), null);
  const garbled = new MemoryStorage();
  garbled.setItem('net:rejoin', '{not json');
  assert.equal(new RejoinTickets(garbled).load(), null);
  garbled.setItem('net:rejoin', JSON.stringify({ code: 'AB2C', token: 7 }));
  assert.equal(new RejoinTickets(garbled).load(), null);
});

test('protocol accepts a room token and rejects a token that is not a string', () => {
  const room = { t: 'room', code: 'AB2C', you: 'p1', players: [{ id: 'p1', name: 'Nick' }], level: 'ch2', state: 'playing' };
  assert.ok(parseServerMessage(JSON.stringify(room)), 'older servers send no token');
  assert.ok(parseServerMessage(JSON.stringify({ ...room, token: 'abc' })));
  assert.equal(parseServerMessage(JSON.stringify({ ...room, token: 12 })), null);
});

function fakeClient(options = {}) {
  const time = new FakeTime(10_000);
  const factory = socketFactory();
  const client = new NetClient({ url: URL, createSocket: factory.create, now: time.now, timers: time.timers,
    reconnect: { initialDelay: 100 }, ...options });
  client.connect();
  factory.last.open();
  return { client, factory, time };
}

const room = token => ({ t: 'room', code: 'QR7T', you: 'p2', host: 'p1', level: 'ch2', state: 'playing',
  players: [{ id: 'p1', name: 'Amy' }, { id: 'p2', name: 'Nick' }], ...(token ? { token } : {}) });
const sentJoins = socket => socket.messages.filter(message => message.t === 'join');

test('NetClient sends a join token only when it has one', () => {
  const { client, factory } = fakeClient();
  client.join('Nick', 'QR7T');
  client.join('Nick', 'QR7T', 'secret-token-1234');
  assert.deepEqual(sentJoins(factory.last), [
    { t: 'join', name: 'Nick', code: 'QR7T' },
    { t: 'join', name: 'Nick', code: 'QR7T', token: 'secret-token-1234' },
  ]);
});

test('NetClient rejoins after a drop with the token from the last room message', () => {
  const { client, factory, time } = fakeClient();
  client.join('Nick', 'QR7T');
  factory.last.receive(room('secret-token-1234'));
  factory.last.drop();
  time.advance(100);
  factory.last.open();
  assert.deepEqual(sentJoins(factory.last), [{ t: 'join', name: 'Nick', code: 'QR7T', token: 'secret-token-1234' }]);
});

test('TeamConnector passes a kept token to the join', async () => {
  const { client, factory } = fakeClient();
  const connector = new TeamConnector(client, { timers: { setTimeout: () => 0, clearTimeout: () => {} } });
  const joined = connector.join('Nick', 'QR7T', 'secret-token-1234');
  assert.deepEqual(sentJoins(factory.last), [{ t: 'join', name: 'Nick', code: 'QR7T', token: 'secret-token-1234' }]);
  factory.last.receive(room('secret-token-1234'));
  assert.equal((await joined).you, 'p2');
});

/**
 * Real RoomServer + SessionRoomGame behind fake browser sockets: what a socket sends reaches
 * `server.receive`, what the server sends arrives as the socket's message, and a drop closes
 * the server side too.
 */
function bridgedServer(t) {
  const clock = { ms: 1_000_000 };
  const now = () => clock.ms;
  const games = [];
  const server = new RoomServer({
    now, levels: new LevelCatalog(['ch2']),
    createGame: () => {
      const game = new SessionRoomGame({ now, sessionOptions: { rng: () => 0.5 } });
      games.push(game);
      return game;
    },
  });
  t.after(() => { for (const game of games) game.end(); });
  const time = new FakeTime(0);
  const browser = () => {
    const factory = socketFactory();
    const create = url => {
      const socket = factory.create(url);
      const connection = { send: text => socket.readyState === 1 && socket.receive(text), close() {} };
      const send = socket.send.bind(socket);
      socket.send = data => {
        send(data);
        server.receive(connection, data);
      };
      const drop = socket.drop.bind(socket);
      socket.drop = () => {
        server.disconnect(connection);
        drop();
      };
      const open = socket.open.bind(socket);
      socket.open = () => {
        server.connect(connection);
        open();
      };
      return socket;
    };
    const client = new NetClient({ url: URL, createSocket: create, now: time.now, timers: time.timers,
      reconnect: { initialDelay: 500 }, pingInterval: 60_000 });
    return { client, factory };
  };
  const run = steps => {
    for (let index = 0; index < steps; index++) {
      clock.ms += STEP_SECONDS * 1000;
      server.tick(STEP_SECONDS);
    }
  };
  return { server, time, browser, run, games };
}

test('a browser whose socket drops mid-game reconnects into the same seat and gets snapshots again', async t => {
  const { time, browser, run, games } = bridgedServer(t);
  const host = browser();
  const guest = browser();
  const timers = { setTimeout: () => 0, clearTimeout: () => {} };

  const created = new TeamConnector(host.client, { timers }).create('Ann', 'ch2');
  host.factory.last.open();
  const code = (await created).code;
  const joined = new TeamConnector(guest.client, { timers }).join('Bo', code);
  guest.factory.last.open();
  const firstRoom = await joined;
  assert.equal(firstRoom.you, 'p2');
  assert.equal(typeof firstRoom.token, 'string');

  // What OnlineMode keeps: the view of the game and the connection state it shows.
  const view = new NetworkedSession({ you: firstRoom.you, room: firstRoom });
  const states = [];
  guest.client.on('state', state => states.push(state));
  guest.client.on('room', message => view.applyRoom(message));
  guest.client.on('snapshot', snapshot => view.applySnapshot(snapshot));
  const errors = [];
  guest.client.on('error', message => errors.push(message.code));

  host.client.start();
  run(6);
  assert.equal(view.state === 'team-lobby', false, 'snapshots arrive');
  const before = view.local;
  assert.equal(before.id, 'p2');
  games[0].session.playerById('p2').damageable.health = 42;

  guest.factory.last.drop();
  assert.equal(guest.client.state, 'reconnecting');
  run(30); // one second of game without the guest
  assert.ok(games[0].session.playerById('p2'), 'the server kept the player');

  time.advance(500);
  const seen = view.latest.tick;
  guest.factory.last.open();
  assert.deepEqual(errors, [], 'the rejoin is not refused');
  assert.equal(guest.client.state, 'open');
  assert.equal(guest.client.room.you, 'p2');
  assert.equal(view.you, 'p2', 'same player id, so OnlineMode keeps its parts');
  run(3);
  assert.ok(view.latest.tick > seen, 'snapshots resume after the reconnect');
  assert.equal(view.local.id, 'p2');
  assert.equal(view.local.health, 42);
  assert.equal(view.local.weapon, before.weapon);
  assert.deepEqual(states, ['reconnecting', 'open']);
  assert.equal(host.client.room.players.length, 2);
});

test('a reconnect after the grace period is refused with started', async t => {
  const { server, time, browser, run } = bridgedServer(t);
  server.rejoinGraceMs = 1000;
  const host = browser();
  const guest = browser();
  const timers = { setTimeout: () => 0, clearTimeout: () => {} };
  const created = new TeamConnector(host.client, { timers }).create('Ann', 'ch2');
  host.factory.last.open();
  const code = (await created).code;
  const joined = new TeamConnector(guest.client, { timers }).join('Bo', code);
  guest.factory.last.open();
  await joined;
  host.client.start();
  run(2);
  const errors = [];
  guest.client.on('error', message => errors.push(message.code));
  guest.factory.last.drop();
  run(31);
  time.advance(500);
  guest.factory.last.open();
  assert.deepEqual(errors, ['started']);
  assert.equal(guest.client.room, null);
});
