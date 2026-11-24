import test from 'node:test';
import assert from 'node:assert/strict';
import { NetClient } from '../web/js/net/NetClient.js';
import { DEFAULT_SERVER_URL, resolveServerUrl } from '../web/js/net/ServerConfig.js';
import { TeamCode, TEAM_CODE_ALPHABET, TEAM_CODE_LENGTH } from '../web/js/net/TeamCode.js';
import { PlayerName } from '../web/js/net/PlayerName.js';
import { teamErrorText } from '../web/js/net/teamErrors.js';
import { TeamConnector, TeamError } from '../web/js/net/TeamConnector.js';
import { CODE_ALPHABET, CODE_LENGTH } from '../server/rooms/RoomCodes.js';
import { FakeTime, socketFactory } from './helpers/netFakes.js';

test('no server is configured by default; only ws:// and wss:// URLs are accepted', () => {
  assert.equal(DEFAULT_SERVER_URL, '');
  assert.equal(resolveServerUrl(null), null);
  assert.equal(resolveServerUrl('   '), null);
  assert.equal(resolveServerUrl('ws://localhost:8787'), 'ws://localhost:8787');
  assert.equal(resolveServerUrl(' wss://game.example/net '), 'wss://game.example/net');
  assert.equal(resolveServerUrl('http://localhost:8787'), null);
  assert.equal(resolveServerUrl('javascript:alert(1)'), null);
  assert.equal(resolveServerUrl('not a url'), null);
  assert.equal(resolveServerUrl(null, 'ws://fallback:1'), 'ws://fallback:1', 'a configured default is used when no parameter is given');
});

test('team codes use the server alphabet, upper case, 4 characters', () => {
  assert.equal(TEAM_CODE_ALPHABET, CODE_ALPHABET);
  assert.equal(TEAM_CODE_LENGTH, CODE_LENGTH);
  assert.equal(TeamCode.normalize(' ab-2c9x '), 'AB2C');
  assert.equal(TeamCode.normalize('o0i1l'), '', 'letters the server never hands out are dropped');
  assert.equal(TeamCode.normalize(null), '');
  assert.equal(TeamCode.isValid('AB2C'), true);
  assert.equal(TeamCode.isValid('AB2'), false);
  assert.equal(TeamCode.isValid('ab2c'), false);
  assert.equal(TeamCode.isValid('AB0C'), false);
});

test('PlayerName remembers the typed name and survives storage that throws', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const names = new PlayerName(storage);
  assert.equal(names.load(), '');
  assert.equal(names.use('   '), 'PLAYER', 'an empty name falls back');
  assert.equal(names.load(), '');
  assert.equal(names.use('  Nick  '), 'Nick');
  assert.equal(names.load(), 'Nick');
  assert.equal(PlayerName.normalize('x'.repeat(30)).length, 24);

  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const guarded = new PlayerName(broken);
  assert.equal(guarded.load(), '');
  assert.equal(guarded.use('Amy'), 'Amy');
  assert.equal(new PlayerName(null).load(), '');
});

test('every error the player can meet has a readable line', () => {
  for (const code of ['no-room', 'full', 'started', 'bad-level', 'start-failed', 'server-error', 'connection-lost', 'reconnecting', 'timeout']) {
    assert.ok(!teamErrorText(code).includes(code), code + ' has its own text');
  }
  assert.match(teamErrorText('weird'), /weird/);
});

function connector({ timeout = 1000 } = {}) {
  const time = new FakeTime(0);
  const factory = socketFactory();
  const client = new NetClient({ url: 'ws://test', createSocket: factory.create, now: time.now, timers: time.timers,
    reconnect: { initialDelay: 100 } });
  return { time, factory, client, team: new TeamConnector(client, { timers: time.timers, timeout }) };
}

const room = (code, you = 'p1') => ({ t: 'room', code, you, players: [{ id: you, name: 'Nick' }], level: 'ch2', state: 'lobby' });

test('TeamConnector connects, sends once the socket opens and resolves with the room', async () => {
  const { factory, client, team } = connector();
  const created = team.create('Nick', 'ch2');
  assert.equal(client.state, 'connecting');
  factory.last.open();
  assert.deepEqual(factory.last.messages.filter(m => m.t !== 'ping'), [{ t: 'create', name: 'Nick', level: 'ch2' }]);
  factory.last.receive(room('AB2C'));
  assert.equal((await created).code, 'AB2C');
  assert.equal(team.pending, false);

  const joined = team.join('Nick', 'XY7Z');
  factory.last.receive(room('XY7Z', 'p2'));
  assert.equal((await joined).you, 'p2', 'an open client sends at once');
});

test('TeamConnector rejects with the server error code, a dropped connection or a timeout', async () => {
  let env = connector();
  let joining = env.team.join('Nick', 'AB2C');
  env.factory.last.open();
  env.factory.last.receive({ t: 'error', code: 'no-room' });
  await assert.rejects(joining, error => error instanceof TeamError && error.code === 'no-room');

  env = connector();
  joining = env.team.join('Nick', 'AB2C');
  env.factory.last.drop();
  await assert.rejects(joining, { code: 'connection-failed' });

  env = connector();
  joining = env.team.join('Nick', 'AB2C');
  env.factory.last.open();
  env.factory.last.drop();
  await assert.rejects(joining, { code: 'connection-lost' });

  env = connector({ timeout: 500 });
  joining = env.team.join('Nick', 'AB2C');
  env.factory.last.open();
  env.time.advance(500);
  await assert.rejects(joining, { code: 'timeout' });
  assert.equal(env.time.pending > 0, true, 'the client keeps pinging; the connector left no timer of its own');

  await assert.rejects(connector().team.join('Nick', 'AB'), { code: 'bad-code' });
  env = connector();
  env.team.create('Nick', 'ch2').catch(() => {});
  await assert.rejects(env.team.create('Nick', 'ch2'), { code: 'busy' });
});
