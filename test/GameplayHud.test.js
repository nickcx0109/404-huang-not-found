import test from 'node:test';
import assert from 'node:assert/strict';
import { GameplayHud } from '../web/js/ui/GameplayHud.js';

test('GameplayHud extends the viewer HUD without replacing its error display', () => {
  const createElement = () => ({ hidden: false, textContent: '', setAttribute() {}, remove() {} });
  const elements = { '#start': { ...createElement(), querySelector: () => null }, '#error': createElement(), '#info': createElement() };
  const root = { querySelector: selector => elements[selector], ownerDocument: { createElement }, appendChild() {} };
  const hud = new GameplayHud(root);
  const session = { state: 'playing', wave: 2, canMove: true, context: { enemies: [], players: [{
    damageable: { health: 75, maxHealth: 100 }, wallet: { balance: 50 },
    weapons: { current: { ammo: 5, reserve: 20, reloading: false } },
  }] } };
  hud.updateGame(0, session, true);
  assert.match(hud.panel.textContent, /生命 75\/100/);
  assert.match(hud.panel.textContent, /彈藥 5\/20/);
  assert.match(hud.panel.textContent, /波次 2/);
  assert.match(hud.panel.textContent, /金錢 \$50/);
  hud.showError('failure', ['detail']);
  assert.equal(elements['#start'].hidden, true);
  assert.equal(elements['#error'].hidden, false);
  assert.equal(elements['#error'].textContent, 'failure\ndetail');
  hud.dispose();
});
