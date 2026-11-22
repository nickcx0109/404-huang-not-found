import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';
import { HealthMeter } from './logic/HealthMeter.js';
import { BrushStroke } from './logic/BrushStroke.js';

const HIT_FLASH_SECONDS = 0.22;

/**
 * Health, bottom right: a number and one brush stroke.
 * When hurt the stroke drops at once and leaves a dark red piece behind that drains away;
 * below the low-health threshold the number turns red and throbs.
 */
export class HealthWidget extends HudWidget {
  constructor(doc, { meter = new HealthMeter(), stroke = new BrushStroke({ width: 250, height: 27, seed: 23 }) } = {}) {
    super(doc, 'health', { holdSeconds: 4 });
    this.meter = meter;
    this.number = this.part('div', 'hud-health__num hud-num');
    const shadow = this.part('div', 'hud-health__stroke');
    this.bar = this.part('div', 'hud-health__bar', shadow);
    this.bar.style.setProperty('--brush', stroke.toCssUrl());
    this.part('i', 'hud-health__ghost', this.bar);
    this.trail = this.part('i', 'hud-health__trail', this.bar);
    this.fill = this.part('i', 'hud-health__fill', this.bar);
  }

  bind(events, playerId) {
    // The event carries the new health, so the bar reacts in the same moment as the hit.
    this.listen(events, EVENTS.ENTITY_DAMAGED, detail => {
      if (detail.entity.id === playerId) this.show(detail.health, this.meter.max);
    });
  }

  sync(status) {
    this.show(status.health, status.maxHealth);
  }

  show(health, max) {
    const change = this.meter.set(health, max);
    if (change === 'same') return;
    const scale = 'scaleX(' + this.meter.ratio.toFixed(4) + ')';
    const text = String(this.meter.shown);
    this.number.textContent = text;
    this.number.setAttribute('data-value', text);
    // Healing (or the first draw) moves the dark red piece at once; only a hit leaves it behind.
    this.el.classList.toggle('is-rising', change !== 'hurt');
    this.fill.style.transform = scale;
    this.trail.style.transform = scale;
    this.el.classList.toggle('is-low', this.meter.low);
    this.attention.pin(this.meter.low);
    this.attention.poke();
    if (change === 'hurt') this.flash('is-hit', HIT_FLASH_SECONDS);
  }
}
