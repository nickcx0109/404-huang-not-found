import test from 'node:test';
import assert from 'node:assert/strict';
import { TeamPresentation } from '../web/js/ui/hud/logic/TeamPresentation.js';
import { Bandage } from '../web/js/weapons/Bandage.js';
test('healing badge uses the inventory slot and positive stock, including future healing items', () => {
  assert.equal(TeamPresentation.carriesHealing(), false);
  assert.equal(TeamPresentation.carriesHealing([null, { slot: 'throwable', count: 2 }]), false);
  assert.equal(TeamPresentation.carriesHealing([new Bandage()]), true);
  assert.equal(TeamPresentation.carriesHealing([{ slot: 'healing', count: 0 }]), false);
  assert.equal(TeamPresentation.carriesHealing([{ id: 'future', slot: 'healing', count: 1 }]), true);
});
test('avatar fallback and authoritative downed state are independent of zero health', () => {
  assert.equal(TeamPresentation.avatar('debug mate'), 'DE');
  assert.equal(TeamPresentation.avatar('  '), '?');
  assert.equal(TeamPresentation.down({ downed: true, health: 40 }), true);
  assert.equal(TeamPresentation.down({ downed: false, health: 0 }), false);
  assert.ok(Object.isFrozen(TeamPresentation.healingIcon));
});
