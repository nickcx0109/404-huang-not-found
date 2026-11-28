import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { EVENTS } from '../web/js/game/events.js';
import { SoundBoard } from '../web/js/audio/SoundBoard.js';
import { WeaponSounds } from '../web/js/audio/WeaponSounds.js';
import { TeammateWeaponSounds } from '../web/js/audio/TeammateWeaponSounds.js';
import { EntityStandIns } from '../web/js/net/EntityStandIns.js';
import { NetEventTranslator } from '../web/js/net/NetEventTranslator.js';

class RecordingOutput {
  constructor() {
    this.played = [];
  }

  play(cue, mix) {
    this.played.push({ cue, ...mix });
  }

  setLoop() {}
}

test('a loop returns to full centered volume after losing its position or being torn down', () => {
  const output = new RecordingOutput();
  const calls = [];
  output.setLoop = (...args) => calls.push(args);
  const board = new SoundBoard(output, () => ({ x: 0, z: 0, yaw: 0 }));
  board.loop('saw', 'idle', { position: { x: 10, z: 0 } });
  assert.ok(calls.at(-1)[2].gain < 1);
  board.loop('saw', 'idle');
  assert.deepEqual(calls.at(-1), ['saw', 'idle', { pan: 0, gain: 1 }]);
  board.dispose();
  assert.deepEqual(calls.at(-1), ['saw', null]);
  assert.equal(board.holds.size, 0);
});

function setup({ listener = { x: 0, z: 0, yaw: 0 }, positions = {} } = {}) {
  const events = new EventBus();
  const output = new RecordingOutput();
  const board = new SoundBoard(output, () => listener);
  const rule = new TeammateWeaponSounds(events, 'p1', id => positions[id] ?? null)
    .register('pistol', { fire: 'shot_pistol' })
    .register('shotgun', { fire: 'shot_shotgun' })
    .register('katana', { fire: 'katana_swing', hit: 'katana_hit' })
    .register('chainsaw', { held: 'chainsaw_idle', working: 'chainsaw_cut' });
  board.install(rule);
  return { events, output, board, rule };
}

test('TeammateWeaponSounds plays a teammate shot from where they stand, with that weapon\'s cue', () => {
  const { events, output } = setup({ positions: { p2: { x: 10, z: 0 }, p3: { x: -20, z: 0 } } });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'pistol', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p3', weaponId: 'shotgun', hit: null });
  assert.deepEqual(output.played.map(entry => entry.cue), ['shot_pistol', 'shot_shotgun']);
  const [right, left] = output.played;
  assert.ok(right.pan > 0.8, 'p2 is on the right of a player looking toward -Z');
  assert.ok(left.pan < -0.8, 'p3 is on the left');
  assert.ok(right.gain > left.gain, 'the nearer teammate is louder');
  assert.ok(Math.abs(right.gain - (1 - 10 / 60)) < 1e-9, 'gunshots fade over 60 m, not the board\'s 30 m');
});

test('TeammateWeaponSounds ignores the local player, unknown weapons, unplaced teammates and loops', () => {
  const { events, output } = setup({ positions: { p1: { x: 1, z: 0 }, p2: { x: 3, z: 0 } } });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'pistol', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'grenade', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p3', weaponId: 'pistol', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'chainsaw', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { weaponId: 'pistol', hit: null });
  assert.deepEqual(output.played, []);
});

test('TeammateWeaponSounds adds the hit cue only when the swing hit, and drops shots out of earshot', () => {
  const { events, output } = setup({ positions: { p2: { x: 0, z: -5 }, p3: { x: 0, z: -80 } } });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'katana', hit: null });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'katana', hit: { targetId: 'e1', hitPart: 'body' } });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p3', weaponId: 'pistol', hit: null });
  assert.deepEqual(output.played.map(entry => entry.cue), ['katana_swing', 'katana_swing', 'katana_hit']);
});

test('TeammateWeaponSounds needs a way to find teammates', () => {
  assert.throws(() => new TeammateWeaponSounds(new EventBus(), 'p1'), TypeError);
});

test('online, the server\'s echo of my shot stays silent while a teammate\'s shot plays once, in place', () => {
  const events = new EventBus();
  const output = new RecordingOutput();
  const standIns = EntityStandIns.standard();
  const board = new SoundBoard(output, () => ({ x: 0, z: 0, yaw: 0 }));
  board.install(new WeaponSounds(events, 'p1').register('pistol', { fire: 'shot_pistol' }));
  board.install(new TeammateWeaponSounds(events, 'p1', id => standIns.players.get(id)?.position ?? null)
    .register('pistol', { fire: 'shot_pistol' }));
  const translator = new NetEventTranslator(events, standIns, 'p1');
  standIns.updatePlayers([{ id: 'p1', x: 0, z: 0, alive: true, health: 100 },
    { id: 'p2', x: -6, z: 0, alive: true, health: 100 }]);

  // My own predicted shot already played when I clicked (ActionForwarder's local weapon.fired).
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'pistol', hit: null });
  assert.equal(translator.translate(EVENTS.WEAPON_FIRED, { ownerId: 'p1', weaponId: 'pistol', ammo: 11, reserve: null, hit: null }),
    'net.shot-confirmed');
  assert.equal(translator.translate(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'pistol', ammo: 11, reserve: null, hit: null }),
    EVENTS.WEAPON_FIRED);

  assert.deepEqual(output.played.map(entry => entry.cue), ['shot_pistol', 'shot_pistol']);
  assert.equal(output.played[0].pan, 0, 'my own shot is in my head');
  assert.ok(output.played[1].pan < -0.8, 'the teammate on my left is heard on the left');
  assert.ok(output.played[1].gain < 1);
});


test('teammate loops follow snapshots independently, release to idle and clean up', () => {
  const events = new EventBus();
  const output = new RecordingOutput();
  const loops = new Map();
  output.setLoop = (key, cue, mix) => cue === null ? loops.delete(key) : loops.set(key, { cue, ...mix });
  const listener = { x: 0, z: 0, yaw: 0 };
  let mates = [{ id: 'p1', weapon: 'chainsaw', x: 0, z: 0 },
    { id: 'p2', weapon: 'chainsaw', x: 10, z: 0 },
    { id: 'p3', weapon: 'chainsaw', x: -10, z: 0 }];
  const board = new SoundBoard(output, () => listener);
  const rule = new TeammateWeaponSounds(events, 'p1', id => mates.find(p => p.id === id), { teammates: () => mates })
    .register('chainsaw', { held: 'idle', working: 'cut' });
  board.install(rule);
  board.update(0);
  assert.equal(loops.size, 2);
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'chainsaw' });
  board.update(0.01);
  assert.equal(loops.get('teammate:p2').cue, 'cut');
  assert.equal(loops.get('teammate:p3').cue, 'idle');
  mates[1].x = -20;
  board.update(0.01);
  assert.ok(loops.get('teammate:p2').pan < 0);
  listener.yaw = Math.PI;
  board.update(0.01);
  assert.ok(loops.get('teammate:p2').pan > 0);
  board.update(0.2);
  assert.equal(loops.get('teammate:p2').cue, 'idle');
  events.emit(EVENTS.WEAPON_RELOADED, { ownerId: 'p2' });
  events.emit(EVENTS.WEAPON_RELOADED, { ownerId: 'p1' });
  assert.equal(output.played.length, 1);
  assert.equal(output.played[0].cue, 'reload');
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'chainsaw' });
  board.update(0);
  assert.equal(loops.get('teammate:p2').cue, 'cut');
  mates[1].weapon = 'pistol';
  board.update(0);
  assert.equal(loops.has('teammate:p2'), false);
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'p2', weaponId: 'pistol' });
  board.update(0);
  assert.equal(loops.has('teammate:p2'), false);
  mates[1].weapon = 'chainsaw';
  board.update(0);
  assert.equal(loops.get('teammate:p2').cue, 'idle');
  mates[1].weapon = 'pistol';
  mates[2].away = true;
  board.update(0);
  assert.equal(loops.size, 0);
  mates[2].away = false;
  board.update(0);
  mates = [];
  board.update(0);
  assert.equal(loops.size, 0);
  mates = [{ id: 'p2', weapon: 'chainsaw', x: 80, z: 0 }];
  board.update(0);
  assert.equal(loops.get('teammate:p2').gain, 0);
  rule.dispose();
  assert.equal(loops.size, 0);
  board.dispose();
});
