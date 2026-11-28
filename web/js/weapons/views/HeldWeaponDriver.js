import { EVENTS } from '../../game/events.js';
import { SWING_EVENTS } from './swingEvents.js';

/**
 * Tells the first-person weapon what the player's held weapon just did. No Three.js, no DOM.
 *
 * It only listens and reads; it never changes a weapon. The game's events say when the weapon in
 * hand changes (WEAPON_CHANGED), fires (WEAPON_FIRED) and finishes a reload (WEAPON_RELOADED).
 * `update` still reads reload and bandage state (`reloading`, `progress(time)`) so equipping
 * during an ongoing reload also starts the view at the correct remaining duration.
 *
 * The target is whatever draws the weapon (WeaponRig):
 *   equip(weaponId|null), fire({hit}), reload(seconds), finishReload(), showProgress(fraction|null)
 */
export class HeldWeaponDriver {
  /**
   * @param {EventBus} events
   * @param {string} ownerId  the local player
   * @param {{current: object|null}} holder  the local player's weapons
   * @param {object} target
   */
  constructor(events, ownerId, holder, target) {
    this.events = events;
    this.ownerId = ownerId;
    this.holder = holder;
    this.target = target;
    this.weapon = undefined;
    this._reloading = false;
    this._showedSwing = false;
    const mine = handler => detail => {
      if (detail?.ownerId === this.ownerId) handler(detail);
    };
    this._unsubscribe = [
      events.on(EVENTS.WEAPON_CHANGED, mine(() => this._sync())),
      events.on(EVENTS.WEAPON_FIRED, mine(detail => {
        this._sync();
        if (detail.weaponId !== this.weapon?.id) return;
        if (this.target.fire({ hit: detail.hit ?? null }) && this.target.hasSwingCue) {
          events.emit(SWING_EVENTS.QUEUED, detail);
        }
      })),
      events.on(EVENTS.WEAPON_RELOADED, mine(detail => {
        if (detail.weaponId !== this.weapon?.id) return;
        this._reloading = false;
        this.target.finishReload();
      })),
    ];
    this._sync();
  }

  /** Call once a frame. @param {number} time  the game clock (seconds) */
  update(time) {
    this._sync();
    const weapon = this.weapon;
    const reloading = Boolean(weapon?.reloading);
    if (reloading && !this._reloading) {
      const left = typeof weapon.reloadSecondsLeft === 'function' ? weapon.reloadSecondsLeft(time)
        : Number.isFinite(weapon.reloadEndsAt) ? weapon.reloadEndsAt - time : weapon.reloadSeconds;
      this.target.reload(Math.max(0.05, Math.min(weapon.reloadSeconds, left)));
    } else if (!reloading && this._reloading) {
      this.target.finishReload();
    }
    this._reloading = reloading;
    const progress = typeof weapon?.progress === 'function' ? weapon.progress(time) : null;
    this.target.showProgress(progress ? progress.fraction : null);
  }

  /** Publishes the swing after the rig has posed the blade for this frame. */
  presentSwing() {
    const cue = this.target.swingCue ?? null;
    if (!cue && !this._showedSwing) return;
    this._showedSwing = cue !== null;
    this.events.emit(SWING_EVENTS.FRAME, { ownerId: this.ownerId, cue });
  }

  /** Equips the view when the weapon in hand is a different object (a swapped gun of the same kind too). */
  _sync() {
    const weapon = this.holder.current ?? null;
    if (weapon === this.weapon) return;
    this.weapon = weapon;
    this._reloading = false;
    this.target.equip(weapon ? weapon.id : null);
  }

  dispose() {
    // Clear a trail that is still on screen; nothing will publish another frame.
    if (this._showedSwing) {
      this._showedSwing = false;
      this.events.emit(SWING_EVENTS.FRAME, { ownerId: this.ownerId, cue: null });
    }
    this._unsubscribe.forEach(off => off());
    this._unsubscribe = [];
  }
}
