import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { EVENTS } from '../web/js/game/events.js';
import { SurvivalHud } from '../web/js/ui/hud/SurvivalHud.js';
import { StatusLine } from '../web/js/ui/hud/StatusLine.js';

// Just enough of the DOM for the HUD: nodes remember what was set on them.
function fakeNode() {
  const classes = new Set();
  const node = {
    hidden: false, textContent: '', innerHTML: '', children: [], attributes: {}, removed: false,
    style: { values: {}, setProperty(name, value) { this.values[name] = value; } },
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle: (name, force) => { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
    },
    appendChild(child) { node.children.push(child); return child; },
    remove() { node.removed = true; },
    setAttribute(name, value) { node.attributes[name] = value; },
    querySelector: () => null,
  };
  return node;
}

function setup() {
  const elements = { '#start': fakeNode(), '#error': fakeNode(), '#info': fakeNode() };
  const doc = { createElement: fakeNode, head: fakeNode() };
  const root = { querySelector: selector => elements[selector], ownerDocument: doc, appendChild() {} };
  const events = new EventBus();
  const weapon = { ammo: 12, magazine: 12, reserve: 60, reloading: false };
  const player = { id: 'me', damageable: { health: 100, maxHealth: 100 }, wallet: { balance: 50 }, weapons: { current: weapon } };
  const session = { state: 'playing', wave: 2, canMove: true, context: { time: 0, enemies: [{}], players: [player] } };
  const hud = SurvivalHud.standard(root, events, 'me');
  const [health, ammo, line, crosshair] = hud.widgets;
  return { elements, doc, events, weapon, player, session, hud, health, ammo, line, crosshair };
}

test('SurvivalHud keeps the viewer error display and draws health, ammunition and the status line', () => {
  const { elements, doc, session, hud, health, ammo, line } = setup();
  hud.updateGame(0, session);
  assert.equal(health.number.textContent, '100');
  assert.equal(ammo.magazine.textContent, '12');
  assert.equal(ammo.reserve.textContent, '60');
  assert.equal(ammo.rounds.length, 12);
  assert.equal(line.el.textContent, 'WAVE 2   $50   1 LEFT');
  assert.equal(doc.head.children.length, 2, 'fonts and hud.css are added with the HUD, not by index.html');

  hud.showError('failure', ['detail']);
  assert.equal(elements['#start'].hidden, true);
  assert.equal(elements['#error'].textContent, 'failure\ndetail');
  hud.dispose();
});

test('HealthWidget reacts to the damage event of its own player only', () => {
  const { events, player, session, hud, health } = setup();
  hud.updateGame(0, session);
  events.emit(EVENTS.ENTITY_DAMAGED, { entity: { id: 'zombie-1' }, health: 10 });
  assert.equal(health.number.textContent, '100');

  player.damageable.health = 66;
  events.emit(EVENTS.ENTITY_DAMAGED, { entity: player, health: 66 });
  assert.equal(health.number.textContent, '66');
  assert.equal(health.fill.style.transform, 'scaleX(0.6600)');
  assert.equal(health.el.classList.contains('is-hit'), true);
  assert.equal(health.el.classList.contains('is-low'), false);
  hud.updateGame(0.3, session);
  assert.equal(health.el.classList.contains('is-hit'), false, 'the hit flash ends by itself');

  player.damageable.health = 20;
  hud.updateGame(0, session);
  assert.equal(health.el.classList.contains('is-low'), true);
  hud.dispose();
});

test('AmmoWidget darkens spent rounds and shows the right notice', () => {
  const { weapon, session, hud, ammo } = setup();
  hud.updateGame(0, session);
  const spent = () => ammo.rounds.filter(round => round.classList.contains('is-spent')).length;
  assert.equal(spent(), 0);

  weapon.ammo = 9;
  hud.updateGame(0, session);
  assert.equal(spent(), 3);
  assert.equal(ammo.rounds[0].classList.contains('is-spent'), true, 'rounds are used up from the left');
  assert.equal(ammo.rounds[11].classList.contains('is-spent'), false);
  assert.equal(ammo.notice.classList.contains('is-on'), false);

  weapon.ammo = 0;
  hud.updateGame(0, session);
  assert.equal(spent(), 12);
  assert.equal(ammo.notice.textContent, 'R  RELOAD');
  assert.equal(ammo.notice.classList.contains('is-urgent'), true);

  weapon.reloading = true;
  hud.updateGame(0, session);
  assert.equal(ammo.notice.textContent, 'RELOADING');
  assert.equal(ammo.notice.classList.contains('is-urgent'), false);

  weapon.reloading = false;
  weapon.ammo = 12;
  weapon.reserve = 48;
  hud.updateGame(0, session);
  assert.equal(spent(), 0);
  assert.equal(ammo.notice.classList.contains('is-on'), false);

  weapon.magazine = 30;
  weapon.ammo = 30;
  hud.updateGame(0, session);
  assert.equal(ammo.rounds.length, 30, 'another weapon rebuilds the row');
  hud.dispose();
});

test('widgets sink back after a while unless something is wrong', () => {
  const { weapon, session, hud, health, ammo } = setup();
  hud.updateGame(0, session);
  assert.equal(health.el.classList.contains('is-awake'), true);
  for (let step = 0; step < 100; step++) hud.updateGame(0.05, session);
  assert.equal(health.el.classList.contains('is-awake'), false);
  assert.equal(ammo.el.classList.contains('is-awake'), false);

  weapon.ammo = 2;
  for (let step = 0; step < 200; step++) hud.updateGame(0.05, session);
  assert.equal(ammo.el.classList.contains('is-awake'), true, 'low ammunition stays visible');
  assert.equal(health.el.classList.contains('is-awake'), false);
  hud.dispose();
});

test('SurvivalHud.dispose removes its nodes and stops listening', () => {
  const { doc, events, session, hud, health } = setup();
  hud.updateGame(0, session);
  hud.dispose();
  assert.equal(events.emit(EVENTS.ENTITY_DAMAGED, { entity: { id: 'me' }, health: 1 }), 0);
  assert.equal(events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'me' }), 0);
  assert.equal(health.el.removed, true);
  assert.equal(hud.layer.removed, true);
  assert.equal(doc.head.children.every(node => node.removed), true);
});

test('StatusLine describes every game state in one line', () => {
  const base = { wave: 3, money: 125, enemies: 4, breakSeconds: 6 };
  assert.equal(StatusLine.describe({ ...base, state: 'lobby' }), 'CLICK TO START');
  assert.equal(StatusLine.describe({ ...base, state: 'playing' }), 'WAVE 3   $125   4 LEFT');
  assert.equal(StatusLine.describe({ ...base, state: 'wave-break' }), 'WAVE 3   $125   NEXT WAVE IN 6   E AT SHOP: AMMO $25');
  assert.equal(StatusLine.describe({ ...base, state: 'game-over' }), 'YOU DIED   REFRESH TO RETRY');
});

test('CrosshairWidget kicks on a shot, marks hits and keeps a kill mark over a later hit', () => {
  const { events, session, hud, crosshair } = setup();
  hud.updateGame(0, session);
  const has = name => crosshair.el.classList.contains(name);
  assert.equal(has('is-off'), false);

  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'someone-else', hit: { targetId: 'z1' } });
  hud.updateGame(0, session);
  assert.equal(has('is-firing'), false);
  assert.equal(has('is-hit'), false);

  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'me', hit: null });
  hud.updateGame(0, session);
  assert.equal(has('is-firing'), true);
  assert.equal(has('is-hit'), false, 'a miss shows no mark');

  events.emit(EVENTS.ENTITY_DIED, { entity: { id: 'z1' }, info: { sourceId: 'me' } });
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'me', hit: { targetId: 'z1' } });
  hud.updateGame(0, session);
  assert.equal(has('is-hit'), true);
  assert.equal(has('is-kill'), true);

  for (let step = 0; step < 12; step++) hud.updateGame(0.05, session);
  assert.equal(has('is-hit'), false);
  assert.equal(has('is-kill'), false);
  assert.equal(has('is-firing'), false);

  session.canMove = false;
  hud.updateGame(0, session);
  assert.equal(has('is-off'), true);
  hud.dispose();
});
