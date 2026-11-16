import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';
import { HitMark } from './logic/HitMark.js';

const KICK_SECONDS = 0.06;

/**
 * Crosshair, centre: four thin ticks that jump apart when the weapon fires,
 * a small cross on a hit, the same cross in red on a kill.
 */
export class CrosshairWidget extends HudWidget {
  constructor(doc, { mark = new HitMark() } = {}) {
    super(doc, 'crosshair');
    this.mark = mark;
    for (const side of ['top', 'right', 'bottom', 'left']) this.part('i', 'hud-crosshair__tick is-' + side);
    this.cross = this.part('b', 'hud-crosshair__mark');
    this._kind = null;
    this._off = false;
  }

  bind(events, playerId) {
    // A kill is announced before the shot that caused it, so the red cross is already set when the hit arrives.
    this.listen(events, EVENTS.ENTITY_DIED, detail => {
      if (detail.info.sourceId === playerId && detail.entity.id !== playerId) this.mark.kill();
    });
    this.listen(events, EVENTS.WEAPON_FIRED, detail => {
      if (detail.ownerId !== playerId) return;
      this.flash('is-firing', KICK_SECONDS);
      if (detail.hit) this.mark.hit();
    });
  }

  sync(status) {
    const off = !status.canMove;
    if (off === this._off) return;
    this._off = off;
    this.el.classList.toggle('is-off', off);
  }

  advance(dt) {
    const kind = this.mark.kind;
    if (kind !== this._kind) {
      this._kind = kind;
      this.el.classList.toggle('is-hit', kind !== null);
      this.el.classList.toggle('is-kill', kind === 'kill');
    }
    this.mark.update(dt);
  }
}
