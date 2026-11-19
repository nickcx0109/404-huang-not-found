import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every playable scene has at least this many pickup spots of each kind.
const MINIMUM = Object.freeze({ weapon: 8, healing: 4, throwable: 4, melee: 2, ammo: 3 });
const SCENES = ['ch1', 'ch2', 'ch3', 'ch3_2f', 'ch3_roof'];

for (const scene of SCENES) {
  test(`${scene}: at least 8 weapon, 4 healing, 4 throwable, 2 melee spots and 3 ammo boxes`, () => {
    const level = JSON.parse(readFileSync(new URL(`../web/levels/${scene}.json`, import.meta.url), 'utf8'));
    for (const [type, minimum] of Object.entries(MINIMUM)) {
      const count = level.markers.filter(marker => marker.type === type).length;
      assert.ok(count >= minimum, `${scene} has ${count} "${type}" markers, needs ${minimum}`);
    }
  });
}
