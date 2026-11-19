import test from 'node:test';
import assert from 'node:assert/strict';
import { Objective } from '../web/js/game/objectives/Objective.js';
import { EndlessObjective } from '../web/js/game/objectives/EndlessObjective.js';
import { HoldOutObjective } from '../web/js/game/objectives/HoldOutObjective.js';
import { Objectives } from '../web/js/game/objectives/Objectives.js';
import { ObjectiveWidget } from '../web/js/ui/hud/ObjectiveWidget.js';
import { LevelData } from '../web/js/LevelData.js';
import { readFileSync } from 'node:fs';

test('Objective is abstract; the endless one never wins and shows nothing', () => {
  assert.throws(() => new Objective(), TypeError);
  const endless = new EndlessObjective();
  let won = 0;
  endless.update(1000, { win: () => won++ });
  assert.equal(won, 0);
  assert.equal(endless.status, null);
  assert.equal(endless.goal, 'SURVIVE THE WAVES');
});

test('HoldOutObjective counts down and wins exactly when time is up', () => {
  const hold = new HoldOutObjective({ seconds: 3, label: 'GATE OPENS IN' });
  let won = 0;
  const session = { win: () => { won++; } };
  assert.deepEqual(hold.status, { label: 'GATE OPENS IN', seconds: 3 });
  for (let step = 0; step < 59; step++) hold.update(0.05, session);
  assert.equal(won, 0);
  assert.equal(hold.status.seconds, 1);
  hold.update(0.05, session);
  assert.equal(won, 1);
  assert.equal(hold.status.seconds, 0);
  for (const seconds of [0, -1, NaN, Infinity]) assert.throws(() => new HoldOutObjective({ seconds }), RangeError);
});

test('Objectives builds by registered type, falls back to endless, rejects unknown types', () => {
  const objectives = Objectives.standard();
  assert.ok(objectives.create(null) instanceof EndlessObjective);
  const hold = objectives.create({ type: 'hold', seconds: 90 });
  assert.ok(hold instanceof HoldOutObjective);
  assert.equal(hold.seconds, 90);
  assert.throws(() => objectives.create({ type: 'escort' }), /Unknown objective/);
  assert.throws(() => objectives.register('hold', () => null), /already registered/);
});

test('levels read an optional objective; chapter two holds the gate', () => {
  const base = { colliders: [], props: [], bookmarks: [], spawns: { players: [{ x: 0, z: 0 }], zombies: [] } };
  assert.equal(new LevelData(base, 'none').objective, null);
  assert.deepEqual({ ...new LevelData({ ...base, objective: { type: 'hold', seconds: 60 } }, 'hold').objective },
    { type: 'hold', seconds: 60 });
  assert.throws(() => new LevelData({ ...base, objective: { seconds: 60 } }, 'bad'), error => error.problems.some(problem => problem.startsWith('objective.type')));
  assert.throws(() => new LevelData({ ...base, objective: { type: 'hold', seconds: 0 } }, 'bad'), error => error.problems.some(problem => problem.startsWith('objective.seconds')));
  const ch2 = new LevelData(JSON.parse(readFileSync(new URL('../web/levels/ch2.json', import.meta.url), 'utf8')), 'ch2');
  assert.equal(ch2.objective.type, 'hold');
  assert.ok(Objectives.standard().create(ch2.objective) instanceof HoldOutObjective);
});

test('ObjectiveWidget shows the countdown only during a run', () => {
  const objective = { label: 'GATE OPENS IN', seconds: 155 };
  assert.equal(ObjectiveWidget.describe({ state: 'playing', objective }), 'GATE OPENS IN 2:35');
  assert.equal(ObjectiveWidget.describe({ state: 'wave-break', objective: { ...objective, seconds: 9 } }), 'GATE OPENS IN 0:09');
  assert.equal(ObjectiveWidget.describe({ state: 'lobby', objective }), null);
  assert.equal(ObjectiveWidget.describe({ state: 'playing', objective: null }), null);
  assert.equal(ObjectiveWidget.clock(60), '1:00');
});
