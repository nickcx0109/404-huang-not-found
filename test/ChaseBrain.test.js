import test from 'node:test';
import assert from 'node:assert/strict';
import { ChaseBrain } from '../web/js/enemies/Brain.js';

const player = (id, x, z, { alive = true, downed = false } = {}) =>
  ({ id, position: { x, y: 0, z }, downed, damageable: { alive } });

function zombie({ inReach = () => false } = {}) {
  return {
    position: { x: 0, y: 0, z: 0 },
    moved: [], attacked: [],
    canAttack(target) { return Boolean(target) && inReach(target); },
    attack(target) { this.attacked.push(target.id); },
    moveToward(target) { this.moved.push(target?.id ?? null); },
  };
}

function think(enemy, players) {
  new ChaseBrain().update(enemy, 1 / 30, { players });
  return enemy.chaseTarget;
}

test('ChaseBrain with one player chases that player, and nobody once they are down or dead', () => {
  const enemy = zombie();
  const solo = player('solo', 8, -3);
  assert.equal(think(enemy, [solo]), solo);
  assert.deepEqual(enemy.moved, ['solo']);
  solo.downed = true;
  assert.equal(think(enemy, [solo]), null);
  solo.downed = false;
  solo.damageable.alive = false;
  assert.equal(think(enemy, [solo]), null);
});

test('ChaseBrain chases the nearest living, standing player, not the first in the list', () => {
  const enemy = zombie();
  const far = player('far', 10, 0);
  const near = player('near', 0, -3);
  const middle = player('middle', 4, 4);
  assert.equal(think(enemy, [far, middle, near]), near);
  near.downed = true;
  assert.equal(think(enemy, [far, middle, near]), middle);
  middle.damageable.alive = false;
  assert.equal(think(enemy, [far, middle, near]), far);
});

test('ChaseBrain attacks the nearest player when in reach instead of walking', () => {
  const enemy = zombie({ inReach: target => target.id === 'near' });
  think(enemy, [player('far', 6, 0), player('near', 0.5, 0)]);
  assert.deepEqual(enemy.attacked, ['near']);
  assert.deepEqual(enemy.moved, []);
});
