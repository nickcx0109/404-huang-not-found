import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAntialias, antialiasTexelSize } from '../web/js/core/antialias.js';

test('FXAA defaults on and only aa=0 disables it', () => {
  for (const query of ['', '?scale=1.5', '?aa=1', '?aa=', '?aa=false']) {
    assert.equal(resolveAntialias(undefined, query), true);
  }
  assert.equal(resolveAntialias(undefined, '?scale=1.5&aa=0'), false);
});

test('explicit quality setting overrides URL in both directions', () => {
  assert.equal(resolveAntialias(true, '?aa=0'), true);
  assert.equal(resolveAntialias(false, '?aa=1'), false);
});

test('FXAA texels follow drawing-buffer resize and pixel ratio', () => {
  assert.deepEqual(antialiasTexelSize(800, 600), [1 / 800, 1 / 600]);
  assert.deepEqual(antialiasTexelSize(1200, 900), [1 / 1200, 1 / 900]);
  assert.deepEqual(antialiasTexelSize(0, 0), [1, 1]);
});
