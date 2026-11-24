import test from 'node:test';
import assert from 'node:assert/strict';
import { MoveBudget } from '../server/game/MoveBudget.js';

const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-9, `${message} ${actual} vs ${expected}`);

test('MoveBudget starts with only the slack and earns speed × time × factor', () => {
  const budget = new MoveBudget({ factor: 1.5, slack: 0.5, slackRefillSeconds: 1, bankSeconds: 1 });
  near(budget.available, 0.5);
  near(budget.peek(4, 0.1), 4 * 0.1 * 1.5 + 0.5);
  near(budget.available, 0.5, 'peek changes nothing');
  near(budget.refill(4, 0.1), 4 * 0.1 * 1.5 + 0.5);
});

test('MoveBudget spends the walk pool first, then the slack, and never goes below zero', () => {
  const budget = new MoveBudget();
  budget.refill(2, 1); // walk 3 m, slack 0.5 m
  budget.spend(3.2);
  near(budget.walk, 0);
  near(budget.slack, 0.3);
  budget.spend(5);
  near(budget.available, 0);
  budget.spend(-1);
  near(budget.available, 0, 'a negative spend gives nothing back');
});

test('MoveBudget caps both pools: a long silence banks one second of walking and 0.5 m slack', () => {
  const budget = new MoveBudget({ bankSeconds: 1 });
  budget.spend(0.5);
  near(budget.refill(7, 60), 7 * 1.5 + 0.5);
  const fresh = new MoveBudget();
  fresh.spend(0.5);
  near(fresh.refill(0, 0.5), 0.25, 'the slack refills from empty in about a second');
  near(fresh.refill(0, 0.5), 0.5);
  near(fresh.refill(0, 3), 0.5);
});
