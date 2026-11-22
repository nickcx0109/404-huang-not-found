import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';
import { TeamPresentation } from './logic/TeamPresentation.js';
import { HealthMeter } from './logic/HealthMeter.js';

/**
 * Teammates, bottom left: a call sign and a very thin bar each.
 * A teammate who is down gets a red call sign and the word DOWN.
 * With nobody else in the game the widget is empty.
 */
export class TeamWidget extends HudWidget {
  constructor(doc) {
    super(doc, 'team', { holdSeconds: 4 });
    /** One entry per teammate, in the order of PlayerStatus.mates. */
    this.rows = [];
  }

  bind(events) {
    // A teammate being hit is worth a glance even before the numbers arrive.
    this.listen(events, EVENTS.ENTITY_DAMAGED, detail => {
      if (this.rows.some(row => row.id === detail.entity.id)) this.attention.poke();
    });
  }

  sync(status) {
    const mates = status.mates;
    if (!this._sameTeam(mates)) this._build(mates);
    let trouble = false;
    for (let index = 0; index < mates.length; index++) {
      const mate = mates[index];
      const row = this.rows[index];
      if (row.meter.set(mate.health, mate.maxHealth) !== 'same') {
        row.fill.style.transform = 'scaleX(' + row.meter.ratio.toFixed(4) + ')';
        row.el.classList.toggle('is-low', row.meter.low);
        this.attention.poke();
      }
      if (mate.down !== row.down) {
        row.down = mate.down;
        row.el.classList.toggle('is-down', mate.down);
        this.attention.poke();
      }
      if (mate.name !== row.name.textContent) {
        row.name.textContent = mate.name;
        row.avatar.textContent = TeamPresentation.avatar(mate.name);
      }
      if (Boolean(mate.healing) !== row.healing) {
        row.healing = Boolean(mate.healing);
        row.icon.hidden = !row.healing;
        this.attention.poke();
      }
      trouble = trouble || mate.down || row.meter.low;
    }
    this.attention.pin(trouble);
  }

  _sameTeam(mates) {
    if (mates.length !== this.rows.length) return false;
    for (let index = 0; index < mates.length; index++) {
      if (mates[index].id !== this.rows[index].id) return false;
    }
    return true;
  }

  _build(mates) {
    for (const row of this.rows) row.el.remove();
    this.rows = mates.map(mate => {
      const el = this.part('div', 'hud-team__row');
      const avatar = this.part('span', 'hud-team__avatar', el);
      avatar.setAttribute('aria-hidden', 'true');
      const name = this.part('span', 'hud-team__name', el);
      const icon = this.part('span', 'hud-team__healing', el);
      icon.textContent = TeamPresentation.healingIcon.glyph;
      icon.setAttribute('title', TeamPresentation.healingIcon.label);
      icon.setAttribute('aria-label', TeamPresentation.healingIcon.label);
      icon.setAttribute('role', 'img');
      icon.hidden = true;
      this.part('span', 'hud-team__state', el).textContent = 'DOWN';
      const fill = this.part('i', 'hud-team__fill', this.part('div', 'hud-team__bar', el));
      return { id: mate.id, el, fill, name, avatar, icon, healing: false, meter: new HealthMeter(), down: false };
    });
  }
}
