import test from 'node:test';
import assert from 'node:assert/strict';
import { GameMode } from '../web/js/game/modes/GameMode.js';
import { ContinueScreen } from '../web/js/ui/hud/ContinueScreen.js';
import { LobbyScreen } from '../web/js/ui/hud/LobbyScreen.js';

test('a game mode carries nothing unless it says so (online play keeps the default)', () => {
  class Plain extends GameMode {}
  assert.equal(new Plain().carryOver(), null);
});

test('ContinueScreen asks for the click that locks the mouse again', () => {
  assert.ok(ContinueScreen.prototype instanceof LobbyScreen);
  const lobby = ContinueScreen.describe({ state: 'lobby', goal: 'REACH THE ROOF' });
  assert.equal(lobby.title, '點一下繼續');
  assert.equal(lobby.summary, 'REACH THE ROOF');
  assert.equal(lobby.action, 'CLICK TO CONTINUE');
  assert.equal(ContinueScreen.describe({ state: 'playing' }), null);
});
