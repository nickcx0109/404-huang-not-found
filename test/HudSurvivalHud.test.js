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
  const player = { id: 'me', position: { x: 0, y: 0, z: 0 }, controller: { yaw: 0 },
    damageable: { health: 100, maxHealth: 100 }, wallet: { balance: 50 }, weapons: { current: weapon } };
  const session = { state: 'playing', wave: 2, canMove: true,
    context: { time: 0, enemies: [{ id: 'z1', position: { x: 4, y: 0, z: 0 } }], players: [player] } };
  const hud = SurvivalHud.standard(root, events, 'me');
  const [damage, health, ammo, line, crosshair, prompt, card, team] = hud.widgets;
  return { elements, doc, events, weapon, player, session, hud, damage, health, ammo, line, crosshair, prompt, card, team };
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
  events.emit(EVENTS.ENTITY_DAMAGED, { entity: { id: 'zombie-1' }, info: { sourceId: 'me' }, amount: 34, health: 10 });
  assert.equal(health.number.textContent, '100');

  player.damageable.health = 66;
  events.emit(EVENTS.ENTITY_DAMAGED, { entity: player, info: { sourceId: 'z1' }, amount: 34, health: 66 });
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
  assert.equal(StatusLine.describe({ ...base, state: 'wave-break' }), 'WAVE 3   $125   NEXT WAVE IN 6   E AT SHOP: OPEN SHOP');
  assert.equal(StatusLine.describe({ ...base, state: 'game-over' }), 'REFRESH TO RETRY');
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

test('DamageOverlay shows the side a hit came from, fades, and marks low health', () => {
  const { events, player, session, hud, damage } = setup();
  hud.updateGame(0, session);
  assert.equal(damage.hit.style.opacity, undefined, 'nothing is drawn before the first hit');

  // z1 stands at x = 4 while the player looks toward -Z: the hit comes from the right.
  player.damageable.health = 80;
  events.emit(EVENTS.ENTITY_DAMAGED, { entity: player, info: { sourceId: 'z1' }, amount: 20, health: 80 });
  hud.updateGame(0, session);
  assert.equal(damage.hit.style.values['--hit-x'], '108.0%');
  assert.equal(damage.hit.style.values['--hit-y'], '50.0%');
  const first = Number(damage.hit.style.opacity);
  assert.ok(first > 0.5 && first <= 1);

  hud.updateGame(0.05, session);
  hud.updateGame(0.05, session);
  assert.ok(Number(damage.hit.style.opacity) < first, 'it fades');
  for (let step = 0; step < 60; step++) hud.updateGame(0.05, session);
  assert.equal(Number(damage.hit.style.opacity), 0);

  // An attacker the HUD cannot find comes from below.
  player.damageable.health = 20;
  events.emit(EVENTS.ENTITY_DAMAGED, { entity: player, info: { sourceId: 'gone' }, amount: 60, health: 20 });
  hud.updateGame(0, session);
  assert.equal(damage.hit.style.values['--hit-x'], '50.0%');
  assert.equal(damage.hit.style.values['--hit-y'], '108.0%');
  assert.equal(damage.el.classList.contains('is-low'), true);
  assert.equal(damage.el.classList.contains('is-dead'), false);

  player.damageable.health = 0;
  hud.updateGame(0, session);
  assert.equal(damage.el.classList.contains('is-low'), false);
  assert.equal(damage.el.classList.contains('is-dead'), true);
  hud.dispose();
});

test('PromptWidget shows, updates and hides a prompt sent as an event', () => {
  const { events, hud, prompt } = setup();
  const has = name => prompt.el.classList.contains(name);
  assert.equal(has('is-on'), false);

  events.emit(EVENTS.PROMPT_CHANGED, { id: 'door', text: 'HOLD E   CLEAR THE WAY', progress: 0 });
  assert.equal(has('is-on'), true);
  assert.equal(has('has-line'), true);
  assert.equal(prompt.text.textContent, 'HOLD E   CLEAR THE WAY');
  assert.equal(prompt.fill.style.transform, 'scaleX(0.0000)');

  events.emit(EVENTS.PROMPT_CHANGED, { id: 'door', text: 'HOLD E   CLEAR THE WAY', progress: 1.4 });
  assert.equal(prompt.fill.style.transform, 'scaleX(1.0000)', 'progress stays inside the line');

  events.emit(EVENTS.PROMPT_CHANGED, { id: 'shop', text: null });
  assert.equal(has('is-on'), true, 'somebody else cannot hide it');
  events.emit(EVENTS.PROMPT_CHANGED, { id: 'door', text: null });
  assert.equal(has('is-on'), false);

  events.emit(EVENTS.PROMPT_CHANGED, { id: 'shop', text: 'E   BUY AMMO' });
  assert.equal(has('is-on'), true);
  assert.equal(has('has-line'), false, 'no progress, no line');
  hud.dispose();
});

test('EventCard announces waves one after another and keeps the game-over card up', () => {
  const { events, session, hud, card } = setup();
  const has = name => card.el.classList.contains(name);
  hud.updateGame(0, session);
  assert.equal(has('is-on'), false);

  events.emit(EVENTS.WAVE_STARTED, { wave: 3, count: 4 });
  events.emit(EVENTS.ANNOUNCED, { text: 'FUEL FULL' });
  hud.updateGame(0, session);
  assert.equal(card.text.textContent, 'WAVE 3');
  assert.equal(has('is-on'), true);

  for (let step = 0; step < 42; step++) hud.updateGame(0.05, session);
  assert.equal(has('is-on'), false);
  assert.equal(has('is-fading'), true, 'after two seconds it fades');
  assert.equal(card.text.textContent, 'WAVE 3', 'the words stay while fading');

  for (let step = 0; step < 20; step++) hud.updateGame(0.05, session);
  assert.equal(card.text.textContent, 'FUEL FULL', 'the next card takes its turn');
  assert.equal(has('is-on'), true);

  events.emit(EVENTS.GAME_OVER, { wave: 3, kills: 9 });
  hud.updateGame(0, session);
  assert.equal(card.text.textContent, 'YOU DIED');
  for (let step = 0; step < 200; step++) hud.updateGame(0.05, session);
  assert.equal(has('is-on'), true, 'game over does not fade');
  hud.dispose();
});

test('TeamWidget lists the other players, marks low health and shows who is down', () => {
  const { session, hud, team } = setup();
  hud.updateGame(0, session);
  assert.equal(team.rows.length, 0, 'alone: nothing to show');

  const mate = { id: 'p2', name: 'Mako', position: { x: 0, y: 0, z: 0 }, damageable: { health: 100, maxHealth: 100 }, weapons: { current: null } };
  session.context.players.push(mate);
  hud.updateGame(0, session);
  assert.equal(team.rows.length, 1);
  const row = team.rows[0];
  assert.equal(row.el.children[0].textContent, 'MAKO');
  assert.equal(row.fill.style.transform, 'scaleX(1.0000)');
  for (let step = 0; step < 100; step++) hud.updateGame(0.05, session);
  assert.equal(team.el.classList.contains('is-awake'), false);

  mate.damageable.health = 25;
  hud.updateGame(0, session);
  assert.equal(team.rows[0], row, 'the row is kept, not rebuilt');
  assert.equal(row.fill.style.transform, 'scaleX(0.2500)');
  assert.equal(row.el.classList.contains('is-low'), true);
  assert.equal(row.el.classList.contains('is-down'), false);

  mate.damageable.health = 0;
  for (let step = 0; step < 200; step++) hud.updateGame(0.05, session);
  assert.equal(row.el.classList.contains('is-down'), true);
  assert.equal(team.el.classList.contains('is-awake'), true, 'a downed teammate stays visible');

  session.context.players.pop();
  hud.updateGame(0, session);
  assert.equal(team.rows.length, 0);
  assert.equal(row.el.removed, true);
  hud.dispose();
});

test('ShopWidget renders plain rows, reasons and balance, sends clicks, and cleans up', () => {
  const { events, session, hud } = setup();
  const shop = hud.widgets.at(-1);
  const requests = [];
  events.on(EVENTS.PURCHASE_REQUESTED, detail => requests.push(detail));
  const status = { shopOpen: true, shopAvailable: true, money: 75, armor: 20, breakSeconds: 6,
    shopItems: [{ id: 'rifle', name: 'Rifle', description: '30 rounds', cost: 75, available: true, reason: 'BUY' },
      { id: 'health', name: 'First aid', description: '50 HP', cost: 25, available: false, reason: 'Health already full' }] };
  shop.sync(status);
  assert.equal(shop.el.hidden, false);
  assert.equal(shop.rows.length, 2);
  assert.equal(shop.rows[0].label.textContent, '1   RIFLE   $75');
  assert.equal(shop.rows[1].detail.textContent, '50 HP / Health already full');
  assert.equal(shop.rows[1].button.disabled, true);
  const row = shop.rows[0];
  row.button.onclick();
  assert.deepEqual(requests, [{ ownerId: 'me', itemId: 'rifle' }]);
  events.emit(EVENTS.ITEM_PURCHASED, { ownerId: 'me', itemId: 'rifle' });
  assert.equal(shop.notice.textContent, 'PURCHASED: RIFLE');
  shop.sync(status);
  assert.equal(shop.rows[0], row, 'reuse row DOM');
  assert.equal(shop.balance.textContent, '$75   ARMOR 20   NEXT WAVE IN 6');
  shop.sync({ ...status, shopOpen: false });
  assert.equal(shop.el.hidden, true);
  hud.updateGame(0, session);
  hud.dispose();
  assert.equal(row.button.onclick, null);
  assert.equal(events.emit(EVENTS.ITEM_PURCHASED, { ownerId: 'me', itemId: 'rifle' }), 0);
});
