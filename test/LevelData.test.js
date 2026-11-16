import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LevelData, LevelError } from '../web/js/LevelData.js';

function fixture() {
  return {
    name: 'fixture',
    bounds: { w: 20, d: 20 },
    colliders: [{ id: 'box', x: 2, z: 3, w: 2, h: 4, d: 6 }],
    props: [{ name: 'crate', collider: 'box' }],
    spawns: { players: [{ x: -4, z: -4 }], zombies: [] },
    bookmarks: [{ name: 'view', pos: [0, 2, 5], lookAt: [0, 2, 0] }],
    markers: [{ id: 'goal', type: 'objective', x: -3, z: -3 }],
  };
}

test('LevelData normalizes collider-bound props and exposes lookups without mutating input', () => {
  const raw = fixture();
  const original = structuredClone(raw);
  const level = new LevelData(raw);
  assert.deepEqual(raw, original);
  assert.equal(level.props[0].x, 2);
  assert.equal(level.props[0].z, 3);
  assert.equal(level.props[0].y, 0);
  assert.equal(level.props[0].scale, 1);
  assert.equal(level.collider('box').h, 4);
  assert.equal(level.collider('missing'), null);
  assert.equal(level.bookmark('missing'), null);
  assert.deepEqual(level.bookmarkNames(), ['view']);
  assert.equal(Math.abs(level.bookmark('view').yaw), 0);
  assert.deepEqual(level.markersOfType('objective').map((marker) => marker.id), ['goal']);
  assert.deepEqual(level.markersOfType('unknown'), []);
  assert.ok(Object.isFrozen(level));
  assert.ok(Object.isFrozen(level.props[0]));
  assert.ok(Object.isFrozen(level.bookmark('view').pos));
});

test('LevelData collects validation errors for duplicates, dimensions, and unknown bindings', () => {
  const raw = fixture();
  raw.colliders.push({ ...raw.colliders[0], w: -1 });
  raw.props[0].collider = 'missing';
  raw.props[0].scale = 0;
  assert.throws(() => new LevelData(raw), (error) => {
    assert.ok(error instanceof LevelError);
    assert.ok(error.problems.some((problem) => problem.includes('duplicate id')));
    assert.ok(error.problems.some((problem) => problem.includes('colliders[1].w')));
    assert.ok(error.problems.some((problem) => problem.includes('unknown collider')));
    assert.ok(error.problems.some((problem) => problem.includes('props[0].scale')));
    return true;
  });
  assert.throws(() => new LevelData(null), LevelError);
});

test('LevelData reports overlapping spawn centres as warnings, not errors', () => {
  const raw = fixture();
  raw.spawns.players[0] = { x: 2, z: 3 };
  const level = new LevelData(raw);
  assert.ok(level.warnings.some((warning) => warning.includes('inside collider "box"')));
});

test('LevelData loads without a browser and rejects unsafe names before fetching', async (context) => {
  let fetched = null;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    fetched = { url, options };
    return { ok: true, json: async () => fixture() };
  });
  await assert.rejects(LevelData.load('../escape'), LevelError);
  assert.equal(fetched, null);
  const level = await LevelData.load('fixture', '/levels/');
  assert.equal(level.name, 'fixture');
  assert.deepEqual(fetched, { url: '/levels/fixture.json', options: { cache: 'no-store' } });
});

test('LevelData reports HTTP and malformed JSON failures', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
  await assert.rejects(LevelData.load('missing'), /HTTP 404/);
  fetchMock.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new Error('syntax'); } }));
  await assert.rejects(LevelData.load('bad'), /not valid JSON/);
});

test('LevelData validates every shipped level using the production parser', async () => {
  for (const name of ['test', 'ch2', 'mood']) {
    const raw = JSON.parse(await readFile(new URL('../web/levels/' + name + '.json', import.meta.url), 'utf8'));
    const level = new LevelData(raw, name);
    assert.equal(level.name, name);
    assert.ok(level.spawns.players.length > 0);
    assert.ok(level.bookmarkNames().length > 0);
  }
});
