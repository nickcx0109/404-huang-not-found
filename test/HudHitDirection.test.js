import test from 'node:test';
import assert from 'node:assert/strict';
import { HitDirection } from '../web/js/ui/hud/logic/HitDirection.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' is not ' + expected);

test('HitDirection.angle is measured from where the player looks', () => {
  // yaw 0 looks toward -Z
  close(HitDirection.angle(0, 0, 0, 0, -5), 0);
  close(HitDirection.angle(0, 0, 0, 5, 0), Math.PI / 2);
  close(HitDirection.angle(0, 0, 0, -5, 0), -Math.PI / 2);
  close(Math.abs(HitDirection.angle(0, 0, 0, 0, 5)), Math.PI);
  // turned a quarter to the left the player looks toward -X: what was ahead is now on the right
  close(HitDirection.angle(0, 0, Math.PI / 2, 0, -5), Math.PI / 2);
  close(HitDirection.angle(0, 0, Math.PI / 2, -5, 0), 0);
  // only the offset from the player matters
  close(HitDirection.angle(10, -3, 0, 15, -3), Math.PI / 2);
});

test('HitDirection.edge puts ahead at the top, behind at the bottom and the sides at the sides', () => {
  const at = (angle, x, y) => {
    const edge = HitDirection.edge(angle, 58);
    close(edge.x, x);
    close(edge.y, y);
  };
  at(0, 50, -8);
  at(Math.PI / 2, 108, 50);
  at(-Math.PI / 2, -8, 50);
  at(Math.PI, 50, 108);
});
