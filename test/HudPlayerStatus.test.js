import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerStatus } from '../web/js/ui/hud/PlayerStatus.js';

test('PlayerStatus copies plain numbers out of the session', () => {
  const weapon = { ammo: 5, magazine: 12, reserve: 20, reloading: false };
  const player = { id: 'p1', position: { x: 3, y: 0, z: -4 }, controller: { yaw: 0.5 },
    damageable: { health: 75, maxHealth: 100 }, wallet: { balance: 50 }, weapons: { current: weapon } };
  const session = { state: 'wave-break', wave: 2, canMove: true, breakEndsAt: 13.2,
    context: { time: 10, players: [player],
      enemies: [{ id: 'z1', position: { x: 1, y: 0, z: 2 } }, { id: 'z2', position: { x: -5, y: 0, z: 0 } }] } };
  const status = new PlayerStatus();
  assert.equal(status.read(session, 'p1'), status);
  assert.deepEqual({ ...status }, { health: 75, maxHealth: 100, armed: true, ammo: 5, magazine: 12, reserve: 20,
    reloading: false, money: 50, state: 'wave-break', wave: 2, enemies: 2, breakSeconds: 4, canMove: true,
    x: 3, z: -4, yaw: 0.5, threats: [{ id: 'z1', x: 1, z: 2 }, { id: 'z2', x: -5, z: 0 }] });

  player.weapons.current = null;
  player.wallet = null;
  session.state = 'playing';
  status.read(session, 'p1');
  assert.equal(status.armed, false);
  assert.equal(status.ammo, 0);
  assert.equal(status.money, 0);
  assert.equal(status.breakSeconds, 0);

  const kept = status.threats[0];
  session.context.enemies.pop();
  status.read(session, 'p1');
  assert.equal(status.threats.length, 1);
  assert.equal(status.threats[0], kept, 'records are reused, not rebuilt every frame');
});
