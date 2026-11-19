import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';
import { AmmoMeter } from './logic/AmmoMeter.js';

const NOTICES = Object.freeze({
  reload: { text: 'R  RELOAD', className: 'is-urgent' },
  reloading: { text: 'RELOADING', className: 'is-quiet' },
  out: { text: 'NO AMMO', className: 'is-dry' },
});
const NOTICE_CLASSES = Object.values(NOTICES).map(notice => notice.className);
const RECOIL_SECONDS = 0.09;
const REFILL_SECONDS = 0.7;

/**
 * Ammunition, bottom right: rounds in the magazine (large), rounds in reserve (small),
 * one row of cartridge icons that go dark as they are fired, and a notice when the magazine is empty.
 */
export class AmmoWidget extends HudWidget {
  constructor(doc, { meter = new AmmoMeter() } = {}) {
    super(doc, 'ammo', { holdSeconds: 3 });
    this.meter = meter;
    const count = this.part('div', 'hud-ammo__count');
    this.magazine = this.part('b', 'hud-ammo__mag hud-num', count);
    this.reserve = this.part('span', 'hud-ammo__reserve', count);
    this.row = this.part('div', 'hud-ammo__rounds');
    this.notice = this.part('div', 'hud-ammo__notice');
    this.rounds = [];
    this._lit = 0;
    this._notice = null;
  }

  bind(events, playerId) {
    const mine = handler => detail => { if (detail.ownerId === playerId) handler(); };
    this.listen(events, EVENTS.WEAPON_FIRED, mine(() => {
      this.attention.poke();
      this.flash('is-firing', RECOIL_SECONDS);
    }));
    // Rounds come back one after another, left to right, instead of all at once.
    this.listen(events, EVENTS.WEAPON_RELOADED, mine(() => {
      this.attention.poke();
      this.flash('is-refilling', REFILL_SECONDS);
    }));
    this.listen(events, EVENTS.WEAPON_CHANGED, mine(() => this.attention.poke()));
  }

  sync(status) {
    const meter = this.meter;
    if (!meter.set(status)) return;
    if (meter.resized) this._buildRounds(meter.icons);
    this.magazine.textContent = meter.armed ? String(meter.ammo) : '';
    this.reserve.textContent = !meter.armed ? '' : meter.reserve === Infinity ? '∞' : String(meter.reserve);
    this._light(meter.litIcons);
    this._showNotice(meter.notice);
    this.el.classList.toggle('is-empty', meter.empty);
    this.el.classList.toggle('is-reloading', meter.reloading);
    this.el.classList.toggle('is-unarmed', !meter.armed);
    this.attention.pin(meter.urgent);
    this.attention.poke();
  }

  _buildRounds(count) {
    for (const round of this.rounds) round.remove();
    this.rounds.length = 0;
    for (let index = 0; index < count; index++) {
      const round = this.part('i', 'is-spent', this.row);
      // Slightly crooked, as if laid out by hand; fixed per position so nothing jitters.
      round.style.setProperty('--i', String(index));
      round.style.setProperty('--tilt', ((index * 37) % 7 - 3) * 0.9 + 'deg');
      round.style.setProperty('--lift', ((index * 53) % 5 - 2) * 0.014 + 'em');
      this.rounds.push(round);
    }
    this._lit = 0;
  }

  /** The lit rounds sit at the right end; firing darkens them from the left. */
  _light(lit) {
    const total = this.rounds.length;
    const from = Math.min(total - lit, total - this._lit);
    const to = Math.max(total - lit, total - this._lit);
    for (let index = from; index < to; index++) {
      this.rounds[index].classList.toggle('is-spent', index < total - lit);
    }
    this._lit = lit;
  }

  _showNotice(kind) {
    if (kind === this._notice) return;
    this._notice = kind;
    const notice = kind ? NOTICES[kind] : null;
    for (const className of NOTICE_CLASSES) this.notice.classList.toggle(className, className === notice?.className);
    this.notice.classList.toggle('is-on', notice !== null);
    if (notice) this.notice.textContent = notice.text;
  }
}
