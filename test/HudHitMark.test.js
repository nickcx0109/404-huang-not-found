import test from 'node:test';
import assert from 'node:assert/strict';
import { HitMark } from '../web/js/ui/hud/logic/HitMark.js';

test('HitMark shows a hit briefly and a kill for longer', () => {
  const mark = new HitMark({ hitSeconds: 0.2, killSeconds: 0.5 });
  assert.equal(mark.kind, null);
  mark.hit();
  assert.equal(mark.kind, 'hit');
  mark.update(0.25);
  assert.equal(mark.kind, null);
  mark.kill();
  mark.update(0.4);
  assert.equal(mark.kind, 'kill');
  mark.update(0.2);
  assert.equal(mark.kind, null);
});

test('HitMark does not let a hit replace a kill, but a kill replaces a hit', () => {
  const mark = new HitMark({ hitSeconds: 0.2, killSeconds: 0.5 });
  mark.kill();
  mark.hit();
  assert.equal(mark.kind, 'kill');
  mark.update(0.3);
  assert.equal(mark.kind, 'kill', 'the hit did not shorten the kill mark');
  mark.update(0.3);
  mark.hit();
  mark.kill();
  assert.equal(mark.kind, 'kill');
  assert.throws(() => new HitMark({ hitSeconds: 0 }), RangeError);
});
