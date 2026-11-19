import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { EVENTS } from '../web/js/game/events.js';
import { SlashStyles } from '../web/js/ui/hud/logic/SlashStyles.js';
import { SlashTrail } from '../web/js/ui/hud/logic/SlashTrail.js';
import { SlashWidget } from '../web/js/ui/hud/SlashWidget.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('SlashStyles: the katana has a slash, other weapons have none until registered', () => {
  const styles = SlashStyles.standard();
  assert.ok(styles.has('katana'));
  const katana = styles.get('katana');
  const total = katana.sweepSeconds + katana.fadeSeconds;
  assert.ok(total >= 0.15 && total <= 0.25, 'fades out within 0.15 to 0.25 seconds');
  assert.ok(katana.hitStrength > 1, 'a hit is brighter');
  assert.equal(styles.get('pistol'), null);
  assert.equal(styles.get('bat'), null);

  styles.register('machete', { trail: 0.5 });
  assert.equal(styles.get('machete').trail, 0.5);
  assert.equal(styles.get('machete').sweepSeconds, 0.08, 'missing fields take the defaults');
  assert.ok(Object.isFrozen(styles.get('machete')));
});

test('SlashStyles rejects broken styles', () => {
  const styles = new SlashStyles();
  assert.throws(() => styles.register('', {}), TypeError);
  assert.throws(() => styles.register('x', { fadeSeconds: 0 }), RangeError);
  assert.throws(() => styles.register('x', { trail: 1.5 }), RangeError);
  assert.throws(() => styles.register('x', { hitStrength: 0.5 }), RangeError);
});

test('SlashTrail sweeps across, then fades to nothing', () => {
  const style = new SlashStyles().register('k', { sweepSeconds: 0.1, fadeSeconds: 0.1, trail: 0.5 }).get('k');
  const trail = new SlashTrail(style);
  assert.equal(trail.active, false);
  assert.equal(trail.alpha, 0);

  trail.start();
  assert.equal(trail.active, true);
  assert.equal(trail.head, 0);
  assert.equal(trail.tail, 0);
  assert.equal(trail.alpha, 1);

  trail.update(0.05);
  assert.ok(trail.head > 0.5, 'eased: more than half way after half the time');
  assert.ok(trail.tail < trail.head);
  assert.equal(trail.alpha, 1, 'fully visible while sweeping');

  trail.update(0.05);
  close(trail.head, 1);
  close(trail.tail, 0.5);

  trail.update(0.05);
  close(trail.alpha, 0.25);
  assert.ok(trail.tail > 0.5, 'the crescent shrinks while it fades');
  assert.ok(trail.tail <= trail.head);

  trail.update(0.06);
  assert.equal(trail.active, false);
  assert.equal(trail.alpha, 0);
  trail.update(1);
  assert.equal(trail.active, false, 'stays finished');
});

test('SlashTrail alternates sides and is brighter on a hit', () => {
  const style = SlashStyles.standard().get('katana');
  const trail = new SlashTrail(style);
  trail.start(false);
  const first = trail.side;
  assert.equal(trail.strength, 1);
  trail.update(0.1);
  trail.start(true);
  assert.equal(trail.side, -first, 'the next cut comes from the other side');
  assert.equal(trail.elapsed, 0, 'a new cut starts over');
  assert.equal(trail.strength, style.hitStrength);
});

function fakeDoc() {
  const node = () => ({
    hidden: false, className: '', children: [], removed: false,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(child) { this.children.push(child); return child; },
    remove() { this.removed = true; },
  });
  return { createElement: node };
}

test('SlashWidget only reacts to the own player swinging a weapon with a slash', () => {
  const events = new EventBus();
  const widget = new SlashWidget(fakeDoc());
  widget.bind(events, 'me');

  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'me', weaponId: 'pistol', hit: null });
  assert.equal(widget.trail, null, 'guns leave no slash');
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'other', weaponId: 'katana', hit: null });
  assert.equal(widget.trail, null, 'a teammate swinging does not draw on my screen');

  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'me', weaponId: 'katana', hit: null });
  assert.equal(widget.trail.active, true);
  assert.equal(widget.trail.hit, false);
  widget.tick(0.05);
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'me', weaponId: 'katana', hit: { targetId: 'z1' } });
  assert.equal(widget.trail.hit, true);
  widget.tick(1);
  assert.equal(widget.trail.active, false, 'gone after the fade');

  widget.dispose();
  events.emit(EVENTS.WEAPON_FIRED, { ownerId: 'me', weaponId: 'katana', hit: null });
  assert.equal(widget.trail, null, 'no longer listening after dispose');
});
