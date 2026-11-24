import { EVENTS } from '../game/events.js';

/**
 * Online, the player's requests (PlayerCombat emits *_REQUESTED on the bus, as in single
 * player) become `action` messages instead of reaching a local GameSession.
 *
 * Firing is paced by FireCadence. A shot of a predicted weapon (guns, melee) is also played at
 * once: a local weapon.fired with `hit: null` drives the gun sound, muzzle flash, recoil and the
 * first-person animation without waiting for the server. Damage and kills still come only from
 * the server's events.
 */
export class ActionForwarder {
  /**
   * @param {object} options
   * @param {EventBus} options.events
   * @param {{action(kind: string, extra?: object): boolean}} options.client  usually a NetClient
   * @param {string} options.ownerId
   * @param {RemoteLoadout} options.loadout
   * @param {FireCadence} options.cadence
   * @param {NetworkedSession} options.view
   * @param {() => number} options.now  client seconds
   */
  constructor({ events, client, ownerId, loadout, cadence, view, now }) {
    this.events = events;
    this.client = client;
    this.ownerId = ownerId;
    this.loadout = loadout;
    this.cadence = cadence;
    this.view = view;
    this.now = now;
    this.reviving = false;
    const mine = handler => request => {
      if (request?.ownerId === ownerId) handler(request);
    };
    const simple = kind => mine(() => this._send(kind));
    this._unsubscribe = [
      events.on(EVENTS.FIRE_REQUESTED, mine(() => this.fire())),
      events.on(EVENTS.RELOAD_REQUESTED, simple('reload')),
      events.on(EVENTS.SECONDARY_REQUESTED, simple('secondary')),
      events.on(EVENTS.PICKUP_REQUESTED, simple('pickup')),
      events.on(EVENTS.SWITCH_REQUESTED, mine(({ index }) => this._send('switch', { index }))),
      events.on(EVENTS.CYCLE_REQUESTED, mine(({ step }) => this._send('cycle', { step }))),
    ];
  }

  /** One trigger pull, or one more shot of a held automatic weapon. */
  fire() {
    const weapon = this.loadout.current;
    if (!weapon || !this.view.canAct) return false;
    const now = this.now();
    if (!this.cadence.tryFire(now, weapon, { ammo: this.view.ammo, reloading: weapon.reloading })) return false;
    if (!this.client.action('fire')) {
      this.cadence.pending.pop();
      return false;
    }
    if (weapon.spec?.predicted !== false) {
      this.events.emit(EVENTS.WEAPON_FIRED, {
        ownerId: this.ownerId, weaponId: weapon.id,
        ammo: weapon.usesAmmo ? this.cadence.predictedAmmo(this.view.ammo, now) : null,
        reserve: weapon.usesAmmo ? this.view.reserve : null, hit: null, predicted: true,
      });
    }
    return true;
  }

  /** Holding E next to a downed teammate; only changes are sent. */
  revive(holding) {
    const next = Boolean(holding);
    if (next === this.reviving) return;
    this.reviving = next;
    this._send('revive', { holding: next });
  }

  _send(kind, extra) {
    if (kind !== 'revive' && !this.view.canAct) return false;
    return this.client.action(kind, extra);
  }

  dispose() {
    if (this.reviving) this.revive(false);
    for (const unsubscribe of this._unsubscribe) unsubscribe();
    this._unsubscribe.length = 0;
  }
}
