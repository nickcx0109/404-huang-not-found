import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponView } from '../web/js/weapons/WeaponView.js';
import { standardViewModels, VIEWS } from '../web/js/weapons/views/standardViewModels.js';
import { KatanaView } from '../web/js/weapons/views/KatanaView.js';
import { ClipKit } from '../web/js/weapons/views/ClipKit.js';
import { ChainsawView } from '../web/js/weapons/views/ChainsawView.js';
import { MolotovView } from '../web/js/weapons/views/MolotovView.js';
import { StarterPistol } from '../web/js/weapons/StarterPistol.js';
import { Bat } from '../web/js/weapons/Bat.js';
import { Rifle } from '../web/js/weapons/Rifle.js';
import { Shotgun } from '../web/js/weapons/Shotgun.js';
import { SubmachineGun } from '../web/js/weapons/SubmachineGun.js';
import { Revolver } from '../web/js/weapons/Revolver.js';
import { Katana } from '../web/js/weapons/Katana.js';
import { Chainsaw } from '../web/js/weapons/Chainsaw.js';
import { Grenade } from '../web/js/weapons/Grenade.js';
import { Molotov } from '../web/js/weapons/Molotov.js';
import { Bandage } from '../web/js/weapons/Bandage.js';

const silent = { fire: () => null };
const GAME_WEAPONS = () => [new StarterPistol(silent), new Bat(silent), new Rifle(silent), new Shotgun(silent),
  new SubmachineGun(silent), new Revolver(silent), new Katana(silent), new Chainsaw({ fireMode: silent }),
  new Grenade(), new Molotov(), new Bandage()];

const noModel = () => ({ applyPose() {} });
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);

test('ClipKit clips end where they start, so the weapon settles back into its hold', () => {
  const clips = [
    ClipKit.raise(), ClipKit.shot({ parts: { 'bolt.pos.z': [[0, 0], [0.05, 0.02], [0.1, 0]] } }),
    ClipKit.magazineSwap(), ClipKit.swing({ from: [0.2, -0.5, 0], to: [-0.4, 1, 0.5] }), ClipKit.toss(),
  ];
  for (const clip of clips) {
    const end = clip.sample(clip.duration);
    for (const [channel, value] of Object.entries(end)) near(value, 0, `${clip.name} ${channel} at the end`);
  }
  assert.deepEqual(ClipKit.shot().eventsBetween(-1, 0), ['shot'], 'a shot lights the muzzle flash at once');
  assert.ok(ClipKit.magazineSwap().tracks.has('magazine.pos.y'), 'the magazine moves');
});


test('every weapon in the game has a first-person view whose ids and clips fit together', () => {
  const models = Object.fromEntries(Object.keys(VIEWS).map(id => [id, noModel]));
  const registry = standardViewModels(models);
  for (const weapon of GAME_WEAPONS()) {
    const entry = registry.get(weapon.id);
    assert.ok(entry, weapon.id + ' has a view');
    assert.equal(entry.View.id, weapon.id);
    assert.ok(entry.View.prototype instanceof WeaponView);
    assert.ok(entry.View.clips.equip, weapon.id + ' can be brought up');
    if (weapon.usesAmmo) assert.ok(entry.View.clips.reload, weapon.id + ' reloads');
    const view = new entry.View(noModel(), null);
    view.equip();
    view.update(0.016, 0);
  }
  assert.throws(() => standardViewModels({}), /No model/);
});

test('only guns light the muzzle flash; blades swing without one', () => {
  for (const [id, View] of Object.entries(VIEWS)) {
    const shot = View.clips.fire?.events.some(e => e.name === 'shot') ?? false;
    const gun = ['pistol', 'revolver', 'rifle', 'smg', 'shotgun', 'sniper'].includes(id);
    assert.equal(shot, gun, id);
  }
});

test('KatanaView cuts right-to-left, then left-to-right, in step with the slash light', () => {
  const view = new KatanaView(noModel(), null);
  const order = [];
  for (let i = 0; i < 4; i++) {
    view.fire(true);
    order.push(view.state.clip.name);
    view.update(0.05, 0);
  }
  assert.deepEqual(order, ['fire', 'fireBack', 'fire', 'fireBack']);
  assert.ok(KatanaView.clips.fire.sample(0.06)['gun.rot.y'] < 0, 'drawn back to the right first');
  assert.ok(KatanaView.clips.fireBack.sample(0.06)['gun.rot.y'] > 0, 'the return cut starts on the left');
});

test('the chainsaw engine and the molotov flame keep moving while held', () => {
  const still = { yawRate: 0, pitchRate: 0, speed: 0, sprinting: false };
  const saw = new ChainsawView(noModel(), null);
  const pose = time => {
    const channels = {};
    saw.addHandling(channels, 0, time, still);
    return channels['gun.pos.y'];
  };
  assert.notEqual(pose(1.0), pose(1.01));
  const bottle = new MolotovView(noModel(), null);
  const channels = {};
  bottle.addHandling(channels, 0.016, 0.3, still);
  assert.ok(channels['flame.rot.x'] !== 0 && 'flame.rot.x' in channels);
});

test('a gun fired while sprinting comes back up to the crosshair, then drops again', () => {
  const sprinting = { yawRate: 0, pitchRate: 0, speed: 7, sprinting: true };
  const view = new VIEWS.pistol(noModel(), null);
  view.equip();
  const lowered = () => {
    const channels = {};
    view.addHandling(channels, 0, 0, sprinting);
    return channels['gun.rot.x'];
  };
  for (let i = 0; i < 60; i++) view.addHandling({}, 0.016, 0, sprinting);
  assert.ok(lowered() < -0.2, 'sprinting lowers the gun');
  view.fire(true);
  for (let i = 0; i < 10; i++) view.addHandling({}, 0.016, 0, sprinting);
  assert.ok(Math.abs(lowered()) < 0.02, 'a shot raises it at once');
  for (let i = 0; i < 90; i++) view.addHandling({}, 0.016, 0, sprinting);
  assert.ok(lowered() < -0.2, 'still sprinting a while later: lowered again');
});
