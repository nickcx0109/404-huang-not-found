import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenWidget } from '../web/js/ui/hud/ScreenWidget.js';
import { LobbyScreen } from '../web/js/ui/hud/LobbyScreen.js';
import { ResultScreen } from '../web/js/ui/hud/ResultScreen.js';
import { GameOverScreen } from '../web/js/ui/hud/GameOverScreen.js';
import { VictoryScreen } from '../web/js/ui/hud/VictoryScreen.js';

test('screen descriptions are pure, exclusive and include controls and results', () => {
  const status = Object.freeze({ state: 'lobby', wave: 0, kills: 0 });
  assert.equal(ScreenWidget.describe(status), null);
  const lobby = LobbyScreen.describe(status);
  assert.equal(lobby.title, '404 HUANG NOT FOUND');
  assert.equal(lobby.action, 'CLICK TO START');
  assert.match(lobby.hint, /WASD.*R RELOAD.*E PICK UP/);
  assert.equal(GameOverScreen.describe(status), null);
  assert.equal(VictoryScreen.describe(status), null);
  for (const state of ['playing', 'wave-break']) {
    for (const Screen of [LobbyScreen, GameOverScreen, VictoryScreen]) {
      assert.equal(Screen.describe({ ...status, state }), null);
    }
  }
  assert.equal(ResultScreen.format({ wave: 12, kills: 345 }), 'WAVE REACHED  12  /  KILLS  345');
  for (const [state, Screen, title] of [['game-over', GameOverScreen, 'GAME OVER'], ['victory', VictoryScreen, 'VICTORY']]) {
    const result = Screen.describe(Object.freeze({ state, wave: 3, kills: 19 }));
    assert.equal(result.title, title);
    assert.equal(result.summary, 'WAVE REACHED  3  /  KILLS  19');
    assert.equal(result.action, 'RESTART');
    assert.match(result.hint, /ENTER/);
    assert.equal(LobbyScreen.describe({ state }), null);
  }
});
