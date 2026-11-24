import { EVENTS } from '../game/events.js';

/** Events an online client adds on its own bus. */
export const NET_EVENTS = Object.freeze({
  /** The server fired one of our predicted shots: { ownerId, weaponId, hit } (hit marker, hit sound). */
  SHOT_CONFIRMED: 'net.shot-confirmed',
});

/**
 * Re-publishes the server's `event` messages on the browser's EventBus under the same names, so
 * the sounds, HUD widgets and effects written for single player react online too.
 *
 * Server details are plain ids and numbers; where a local payload holds an entity (damage,
 * deaths, heals, spawns) the translator puts an EntityStandIns object in its place.
 * The local player's own shots of predicted weapons already played when the trigger was pulled
 * (ActionForwarder), so the server's copy is not published again as weapon.fired: it becomes
 * NET_EVENTS.SHOT_CONFIRMED instead, which is where the hit marker comes from.
 */
export class NetEventTranslator {
  /**
   * @param {EventBus} events  the browser's bus
   * @param {EntityStandIns} standIns
   * @param {string} localId
   * @param {{isPredicted?: (weaponId: string) => boolean, onOwnEvent?: (name: string, detail: object) => void}} [hooks]
   */
  constructor(events, standIns, localId, { isPredicted = () => true, onOwnEvent = () => {} } = {}) {
    this.events = events;
    this.standIns = standIns;
    this.localId = localId;
    this.isPredicted = isPredicted;
    this.onOwnEvent = onOwnEvent;
    /** Local payload builders by event name; names without one pass their plain detail on. */
    this.builders = new Map();
    this.register(EVENTS.WEAPON_FIRED, (detail, ownerId) => (ownerId === this.localId && this.isPredicted(detail.weaponId)
      ? [NET_EVENTS.SHOT_CONFIRMED, { ownerId, weaponId: detail.weaponId, hit: detail.hit ?? null }]
      : [EVENTS.WEAPON_FIRED, { ...detail, hit: detail.hit ?? null }]));
    this.register(EVENTS.ENTITY_DAMAGED, detail => {
      const entity = this.standIns.entity(detail.targetId);
      this._health(entity, detail.health);
      if (detail.downed) entity.downed = true;
      const info = { targetId: detail.targetId, sourceId: detail.sourceId, amount: detail.amount,
        hitPart: detail.hitPart, kind: detail.kind };
      return [EVENTS.ENTITY_DAMAGED, { entity, info, amount: detail.amount, health: detail.health }];
    });
    this.register(EVENTS.ENTITY_DIED, detail => {
      const entity = this.standIns.entity(detail.targetId);
      entity.damageable.alive = false;
      entity.damageable.health = 0;
      return [EVENTS.ENTITY_DIED, { entity, info: { targetId: detail.targetId, sourceId: detail.sourceId, kind: detail.kind ?? null } }];
    });
    this.register(EVENTS.ENTITY_HEALED, detail => {
      const entity = this.standIns.entity(detail.targetId);
      this._health(entity, detail.health);
      entity.downed = false;
      return [EVENTS.ENTITY_HEALED, { entity, sourceId: detail.sourceId, amount: detail.amount, health: detail.health }];
    });
    this.register(EVENTS.ENEMY_SPAWNED, detail => {
      const enemy = this.standIns.enemy(detail.id, { type: detail.type, x: detail.x, z: detail.z });
      enemy.damageable.alive = true;
      return [EVENTS.ENEMY_SPAWNED, { enemy, wave: detail.wave }];
    });
  }

  /**
   * How one server event becomes a local one.
   * @param {string} name
   * @param {(detail: object, ownerId: string|undefined) => [string, object]|null} build  local name and payload
   */
  register(name, build) {
    this.builders.set(name, build);
    return this;
  }

  /** Publishes one server event; returns the local event name, or null when nothing was published. */
  translate(name, detail = {}) {
    const ownerId = detail.ownerId;
    if (ownerId !== undefined && ownerId === this.localId) this.onOwnEvent(name, detail);
    const build = this.builders.get(name);
    // Weapons, pickups, blasts, waves and game states carry plain data both ways.
    const result = build ? build(detail, ownerId) : [name, { ...detail }];
    if (!result) return null;
    this.events.emit(result[0], result[1]);
    return result[0];
  }

  _health(entity, health) {
    if (!Number.isFinite(health)) return;
    entity.damageable.health = health;
    if (health > 0) entity.damageable.alive = true;
  }
}
