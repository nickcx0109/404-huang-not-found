import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LevelCatalog } from '../server/rooms/LevelCatalog.js';

test('LevelCatalog lists the shipped levels from web/levels', () => {
  const catalog = LevelCatalog.fromDirectory();
  assert.ok(catalog.has('ch2'));
  assert.ok(catalog.has('test'));
  assert.ok(!catalog.has('README'));
  assert.ok(!catalog.has('ch2.json'));
  assert.ok(!catalog.has('../ch2'));
});

test('LevelCatalog reads only .json files from a directory', t => {
  const dir = mkdtempSync(join(tmpdir(), 'levels-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'alpha.json'), '{}');
  writeFileSync(join(dir, 'notes.md'), '');
  mkdirSync(join(dir, 'nested.json'));
  assert.deepEqual([...LevelCatalog.fromDirectory(dir).names], ['alpha']);
});

test('LevelCatalog can be injected with a fixed list', () => {
  const catalog = new LevelCatalog(['a', 'b']);
  assert.ok(catalog.has('a'));
  assert.ok(!catalog.has('c'));
});
