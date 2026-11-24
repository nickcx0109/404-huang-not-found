import test from 'node:test';
import assert from 'node:assert/strict';
import { PickupMirror } from '../web/js/net/PickupMirror.js';
import { createWeaponCatalog } from '../web/js/game/createSession.js';
import { NetworkedSession } from '../web/js/net/NetworkedSession.js';
import { SnapshotStatus } from '../web/js/ui/hud/SnapshotStatus.js';
import { WeaponSpecs } from '../web/js/net/WeaponSpecs.js';
import { TeamRoomScreen } from '../web/js/ui/hud/TeamRoomScreen.js';
import { ConnectionScreen } from '../web/js/ui/hud/ConnectionScreen.js';
import { LobbyScreen } from '../web/js/ui/hud/LobbyScreen.js';
import { OnlineLobbyScreen } from '../web/js/ui/hud/OnlineLobbyScreen.js';
import { PlayerName } from '../web/js/net/PlayerName.js';

test('PickupMirror places the level\'s weapon spots and fills them only from snapshots', () => {
  const catalog = createWeaponCatalog();
  const level = { markers: [
    { id: 'w1', type: 'weapon', x: 1, z: 2 },
    { id: 'h1', type: 'healing', x: 3, z: 4 },
    { id: 'exit', type: 'exit', x: 0, z: 0 },
  ] };
  const mirror = PickupMirror.fromLevel(level, catalog);
  assert.deepEqual(mirror.pickups.map(pickup => pickup.id), ['w1', 'h1']);
  assert.ok(mirror.pickups.every(pickup => pickup.empty && pickup.weapon === null), 'nothing lies there before the server says so');
  assert.deepEqual(mirror.apply([{ id: 'w1', item: 'rifle' }, { id: 'h1', item: 'bandage' }, { id: 'zz', item: 'rifle' }]), ['w1', 'h1']);
  assert.equal(mirror.pickups[0].weapon.id, 'rifle');
  assert.ok(catalog.entry(mirror.pickups[0].weapon.id).look, 'WeaponPickupViews can size it');
  assert.deepEqual(mirror.apply([{ id: 'w1', item: 'rifle' }]), [], 'unchanged spots are not refreshed');
  assert.deepEqual(mirror.apply([{ id: 'w1', item: null }, { id: 'h1', item: 'no-such-item' }]), ['w1', 'h1']);
  assert.equal(mirror.pickups[0].empty, true);
  assert.deepEqual(mirror.apply(undefined), []);
});

const room = { t: 'room', code: 'AB2C', you: 'p2', level: 'ch2', state: 'lobby',
  players: [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bo' }] };

function status(view) {
  return new SnapshotStatus({ x: 0, z: 0, yaw: 0 }, { predictedAmmo: ammo => ammo, reloading: false,
    specOf: id => WeaponSpecs.standard().get(id) }).read(view);
}

test('the team room shows the code and roster until the server game runs', () => {
  const view = new NetworkedSession({ you: 'p2', room });
  let read = status(view);
  assert.equal(read.teamCode, 'AB2C');
  assert.deepEqual(read.roster, [{ id: 'p1', name: 'Ann', you: false }, { id: 'p2', name: 'Bo', you: true }]);
  assert.equal(LobbyScreen.describe(read), null, 'the single-player start screen stays hidden online');
  assert.equal(TeamRoomScreen.describe(read).title, 'AB2C');
  assert.equal(TeamRoomScreen.describe(read).action, '開始遊戲');
  view.starting = true;
  assert.equal(TeamRoomScreen.describe(status(view)).action, '開始中…');
  view.applySnapshot({ t: 'snapshot', tick: 1, time: 10, ack: -1, state: 'playing', wave: 1, kills: 0, players: [], enemies: [] });
  assert.equal(TeamRoomScreen.describe(status(view)), null);
  assert.equal(ConnectionScreen.describe(status(view)), null);
  view.connection = 'reconnecting';
  assert.equal(ConnectionScreen.describe(status(view)).title, '連線中斷');
  view.connection = 'lost';
  view.notice = 'started';
  read = status(view);
  assert.equal(read.notice, 'started');
  assert.match(ConnectionScreen.describe(read).summary, /已經開始/);
});

function fakeNode(tag) {
  const listeners = {};
  const classes = new Set();
  const node = {
    tag, hidden: false, textContent: '', value: '', disabled: false, children: [], attributes: {}, onclick: null,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle: (name, force) => { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); } },
    appendChild(child) { node.children.push(child); return child; },
    setAttribute(name, value) { node.attributes[name] = value; },
    addEventListener(type, listener) { (listeners[type] ??= []).push(listener); },
    dispatch(type, event = {}) { for (const listener of listeners[type] ?? []) listener(event); },
    remove() {},
    focus() {},
  };
  return node;
}

test('OnlineLobbyScreen remembers the name, cleans the code and keeps typing away from the game', () => {
  const store = new Map([['net:player-name', 'Nick']]);
  const names = new PlayerName({ getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
  const screen = new OnlineLobbyScreen({ createElement: fakeNode }, { names });
  assert.equal(screen.nameInput.value, 'Nick');
  const calls = [];
  screen.onTeam({ create: name => calls.push(['create', name]), join: (name, code) => calls.push(['join', name, code]) });
  screen.nameInput.value = ' Amy ';
  screen.createButton.onclick();
  assert.deepEqual(calls.pop(), ['create', 'Amy']);
  assert.equal(store.get('net:player-name'), 'Amy');
  screen.codeInput.value = 'ab2';
  screen.joinButton.onclick();
  assert.equal(calls.length, 0, 'a short code is not sent');
  assert.equal(screen.status.classList.contains('is-error'), true);
  screen.codeInput.value = 'ab-2c';
  screen.codeInput.dispatch('input');
  assert.equal(screen.codeInput.value, 'AB2C');
  screen.codeInput.dispatch('keydown', { key: 'Enter', stopPropagation() {} });
  assert.deepEqual(calls.pop(), ['join', 'Amy', 'AB2C']);
  let stopped = false;
  screen.nameInput.dispatch('keydown', { key: 'w', stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true, 'W in the name field does not walk');
  screen.setStatus('建立隊伍中…', { busy: true });
  assert.equal(screen.createButton.disabled, true);
  assert.equal(screen.joinButton.disabled, true);
});
