import test from 'node:test';
import assert from 'node:assert/strict';
import { Armor } from '../web/js/entities/Armor.js';
import { ArmorRule } from '../web/js/entities/ArmorRule.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { DamagePipeline, HeadshotRule } from '../web/js/entities/DamagePipeline.js';

test('Armor absorbs up to its remaining points and can be refilled', () => {
  const armor = new Armor();
  assert.equal(armor.absorb(10), 10);
  armor.refill();
  assert.equal(armor.canRefill, false);
  assert.equal(armor.absorb(20), 0);
  assert.equal(armor.points, 30);
  assert.equal(armor.canRefill, true);
  assert.equal(armor.absorb(40), 10);
  assert.equal(armor.points, 0);
  assert.equal(armor.absorb(5), 5);
  armor.refill();
  assert.equal(armor.absorb(0), 0);
  assert.equal(armor.points, 50);
  for (const invalid of [-1, NaN, Infinity]) assert.throws(() => armor.absorb(invalid));
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => new Armor(invalid));
});

test('ArmorRule absorbs multiplied damage for its target only without mutating DamageInfo', () => {
  const player = { armor: new Armor() };
  player.armor.refill();
  const pipeline = new DamagePipeline([new HeadshotRule(), new ArmorRule(id => id === 'me' ? player : null)]);
  const hit = new DamageInfo({ amount: 30, targetId: 'me', hitPart: 'head' });
  assert.equal(pipeline.apply(hit).amount, 10);
  assert.equal(hit.amount, 30);
  assert.equal(player.armor.points, 0);
  assert.equal(pipeline.apply(hit).amount, 60);
  player.armor.refill();
  const other = new DamageInfo({ amount: 40, targetId: 'enemy', kind: 'explosion' });
  assert.equal(pipeline.apply(other), other);
  assert.equal(player.armor.points, 50);
  const explosion = new DamageInfo({ amount: 40, targetId: 'me', kind: 'explosion' });
  assert.equal(pipeline.apply(explosion).amount, 0);
  assert.equal(player.armor.points, 10);
});
