import test from 'node:test';
import assert from 'node:assert/strict';
import { BrushStroke } from '../web/js/ui/hud/logic/BrushStroke.js';

test('BrushStroke is repeatable, stays inside its box and thins towards the end', () => {
  const stroke = new BrushStroke({ width: 300, height: 20, seed: 7 });
  assert.equal(stroke.toSvg(), new BrushStroke({ width: 300, height: 20, seed: 7 }).toSvg());
  assert.notEqual(stroke.outline(), new BrushStroke({ width: 300, height: 20, seed: 8 }).outline());

  const outline = stroke.outline();
  assert.match(outline, /^M[\d. L]+Z$/);
  const points = outline.slice(1, -1).split('L').map(pair => pair.split(' ').map(Number));
  assert.equal(points.length, (stroke.steps + 1) * 2);
  for (const [x, y] of points) {
    assert.ok(x >= 0 && x <= 300 && y >= 0 && y <= 20, 'point inside the box');
  }
  const thickness = index => points[points.length - 1 - index][1] - points[index][1];
  assert.ok(thickness(stroke.steps) < thickness(Math.floor(stroke.steps / 3)), 'thinner at the right end');

  for (const gap of stroke.gaps()) {
    assert.ok(gap.x1 >= 300 * 0.3 && gap.x2 <= 300 && gap.x1 < gap.x2);
    assert.ok(gap.y > 0 && gap.y < 20);
  }
  assert.match(stroke.toCssUrl(), /^url\("data:image\/svg\+xml,%3Csvg/);
  assert.throws(() => new BrushStroke({ width: 0 }), RangeError);
});
