import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';
import { HealthMeter } from './logic/HealthMeter.js';
import { DamagePulse } from './logic/DamagePulse.js';
import { HitDirection } from './logic/HitDirection.js';

/**
 * Being hurt, full screen: dark red, grainy, seeping in from the side the hit came from
 * (not a red frame around everything). At low health the whole edge pulses slowly and goes soft.
 */
export class DamageOverlay extends HudWidget {
  constructor(doc, { pulse = new DamagePulse(), meter = new HealthMeter() } = {}) {
    super(doc, 'damage');
    this.pulse = pulse;
    this.meter = meter;
    this.blur = this.part('div', 'hud-damage__blur');
    this.low = this.part('div', 'hud-damage__low');
    this.hit = this.part('div', 'hud-damage__hit');
    this._pending = null;
    this._shown = 0;
  }

  bind(events, playerId) {
    // Only remember the hit here; where it came from is worked out in sync() from plain numbers.
    this.listen(events, EVENTS.ENTITY_DAMAGED, detail => {
      if (detail.entity.id !== playerId) return;
      this._pending = { sourceId: detail.info.sourceId, amount: detail.amount };
    });
  }

  sync(status) {
    const change = this.meter.set(status.health, status.maxHealth);
    if (change !== 'same') {
      this.el.classList.toggle('is-low', this.meter.low && this.meter.health > 0);
      this.el.classList.toggle('is-dead', this.meter.health <= 0);
    }
    if (!this._pending) return;
    const { sourceId, amount } = this._pending;
    this._pending = null;
    const threat = status.threats.find(candidate => candidate.id === sourceId);
    // Unknown attacker: let it come from below, like sinking to the ground.
    const angle = threat ? HitDirection.angle(status.x, status.z, status.yaw, threat.x, threat.z) : Math.PI;
    const edge = HitDirection.edge(angle);
    this.hit.style.setProperty('--hit-x', edge.x.toFixed(1) + '%');
    this.hit.style.setProperty('--hit-y', edge.y.toFixed(1) + '%');
    this.pulse.hit(amount / status.maxHealth);
  }

  advance(dt) {
    const level = this.pulse.level;
    if (level !== this._shown) {
      this._shown = level;
      this.hit.style.opacity = level.toFixed(3);
    }
    this.pulse.update(dt);
  }
}
