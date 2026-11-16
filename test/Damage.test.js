import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { Entity } from '../web/js/entities/Entity.js';
import { DamageInfo } from '../web/js/entities/DamageInfo.js';
import { Damageable } from '../web/js/entities/Damageable.js';
import { DamagePipeline, DamageRule, HeadshotRule } from '../web/js/entities/DamagePipeline.js';
import { EVENTS } from '../web/js/game/events.js';

test('DamagePipeline chains ordered rules without mutating the input value', () => {
  class ShieldRule extends DamageRule {
    modify(info) { return info.withAmount(Math.max(0, info.amount - 3)); }
  }
  const pipeline = new DamagePipeline([new HeadshotRule(), new ShieldRule()]);
  const head = new DamageInfo({ amount: 10, targetId: 'enemy', hitPart: 'head' });
  assert.equal(pipeline.apply(head).amount, 17);
  assert.equal(head.amount, 10);
  assert.ok(Object.isFrozen(head));
  assert.equal(pipeline.apply(head.withAmount(0)).amount, 0);
  assert.equal(new DamagePipeline().apply(head), head);
  assert.equal(pipeline.apply(new DamageInfo({ amount: 10, targetId: 'enemy' })).amount, 7);
});

test('DamageInfo and damage rules reject invalid amounts and duplicate chain nodes', () => {
  for (const amount of [-1, NaN, Infinity]) assert.throws(() => new DamageInfo({ amount, targetId: 1 }));
  assert.throws(() => new DamageInfo({ amount: 1 }));
  assert.throws(() => new HeadshotRule(-1));
  const rule = new HeadshotRule();
  assert.throws(() => new DamagePipeline([rule, rule]));
  new DamagePipeline([rule]);
  assert.throws(() => new DamagePipeline([rule]));
});

test('Damageable clamps overkill, ignores wrong targets and emits death once per life', () => {
  const events = new EventBus();
  const entity = new Entity('enemy');
  const body = new Damageable(entity, 20, events);
  assert.throws(() => body.takeDamage({ amount: -1, targetId: 'enemy' }), /DamageInfo/);
  const deaths = [];
  events.on(EVENTS.ENTITY_DIED, detail => deaths.push(detail));
  assert.equal(body.takeDamage(new DamageInfo({ amount: 5, targetId: 'other' })), 0);
  assert.equal(body.takeDamage(new DamageInfo({ amount: 5, targetId: 'enemy' })), 5);
  assert.equal(body.health, 15);
  assert.equal(body.takeDamage(new DamageInfo({ amount: 50, targetId: 'enemy' })), 15);
  assert.equal(body.alive, false);
  assert.equal(body.takeDamage(new DamageInfo({ amount: 50, targetId: 'enemy' })), 0);
  assert.equal(deaths.length, 1);
  assert.equal(deaths[0].entity, entity);
  body.reset();
  assert.equal(body.health, 20);
  body.takeDamage(new DamageInfo({ amount: 20, targetId: 'enemy' }));
  assert.equal(deaths.length, 2);
});
