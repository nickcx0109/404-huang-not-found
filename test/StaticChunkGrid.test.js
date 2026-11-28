import test from 'node:test';
import assert from 'node:assert/strict';
import { StaticChunkGrid, WholeLevelGrid } from '../web/js/core/StaticChunkGrid.js';

test('StaticChunkGrid assigns bounds centers to 20 m cells on X and Z', () => {
  const grid = new StaticChunkGrid();
  assert.equal(grid.keyForCenter({ x: 0, y: -30, z: 0 }), '0,0');
  assert.equal(grid.keyForCenter({ x: 19.99, y: 60, z: 19.99 }), '0,0');
  assert.equal(grid.keyForCenter({ x: 20, z: 19.99 }), '1,0');
  assert.equal(grid.keyForCenter({ x: 19.99, z: 20 }), '0,1');
});

test('StaticChunkGrid floors negative coordinates at cell boundaries', () => {
  const grid = new StaticChunkGrid();
  assert.equal(grid.keyForCenter({ x: -0.01, z: -20 }), '-1,-1');
  assert.equal(grid.keyForCenter({ x: -20.01, z: -0.01 }), '-2,-1');
});

test('StaticChunkGrid supports a custom cell size and rejects invalid sizes', () => {
  const grid = new StaticChunkGrid(7.5);
  assert.equal(grid.keyForCenter({ x: 15, z: -7.51 }), '2,-2');
  for (const size of [0, -1, NaN, Infinity]) {
    assert.throws(() => new StaticChunkGrid(size), RangeError);
  }
});

test('StaticChunkGrid.forBounds chunks only levels longer than the minimum span', () => {
  const ch1 = StaticChunkGrid.forBounds({ w: 110, d: 220 });
  assert.ok(ch1 instanceof StaticChunkGrid);
  assert.equal(ch1.cellSize, 20);
  for (const bounds of [{ w: 76, d: 59 }, { w: 33, d: 57 }, { w: 100, d: 100 }, null, undefined]) {
    const grid = StaticChunkGrid.forBounds(bounds);
    assert.ok(grid instanceof WholeLevelGrid);
    assert.equal(grid.keyForCenter({ x: -500, z: 500 }), grid.keyForCenter({ x: 0, z: 0 }));
  }
  assert.equal(StaticChunkGrid.forBounds({ w: 60, d: 10 }, { minSpan: 50, cellSize: 8 }).cellSize, 8);
});
