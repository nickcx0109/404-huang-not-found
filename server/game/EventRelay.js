import { EVENTS } from '../../web/js/game/events.js';
import { coord, wireRounds } from './wire.js';

const hitSummary = hit => (hit ? { targetId: hit.targetId, hitPart: hit.hitPart ?? 'body' } : null);
const ammoCounts = payload => (payload.count === undefined ? wireRounds(payload) : { ...wireRounds(payload), count: payload.count });

/**
 * One game event the server forwards to clients, and the plain fields the browser needs to draw
 * it or play its sound. Payloads hold live entities (borrowed, pooled); `detail` copies numbers
 * and ids out of them so nothing else leaves the server.
 */
export class RelayedEvent {
  /** @param {string} name  an EVENTS value; also the `name` the client receives */
  constructor(name, detail) {
    this.name = name;
    this.detail = detail;
  }
}

/** The curated set (docs/tech/NETWORK.md, `event`): fire, hit, death, downed, revive, waves, pickups, blasts. */
export function standardRelayedEvents() {
  return [
    new RelayedEvent(EVENTS.WEAPON_FIRED, payload => ({
      ownerId: payload.ownerId, weaponId: payload.weaponId, ...ammoCounts(payload), hit: hitSummary(payload.hit),
    })),
    new RelayedEvent(EVENTS.WEAPON_RELOAD_STARTED, payload => ({
      ownerId: payload.ownerId, weaponId: payload.weaponId, ...ammoCounts(payload), duration: coord(payload.duration),
    })),
    new RelayedEvent(EVENTS.WEAPON_RELOADED, payload => ({
      ownerId: payload.ownerId, weaponId: payload.weaponId, ...ammoCounts(payload),
    })),
    new RelayedEvent(EVENTS.WEAPON_CHANGED, payload => ({
      ownerId: payload.ownerId, weaponId: payload.weaponId ?? null, ...ammoCounts(payload),
    })),
    // A hit on a player that leaves no health is that player going down (DownedHealth publishes no death).
    new RelayedEvent(EVENTS.ENTITY_DAMAGED, ({ entity, info, amount, health }) => ({
      targetId: entity.id, sourceId: info.sourceId ?? null, amount: coord(amount), health: coord(health),
      hitPart: info.hitPart ?? null, kind: info.kind ?? null, downed: entity.downed === true,
    })),
    new RelayedEvent(EVENTS.ENTITY_DIED, ({ entity, info }) => ({
      targetId: entity.id, sourceId: info?.sourceId ?? null,
    })),
    new RelayedEvent(EVENTS.ENTITY_HEALED, ({ entity, sourceId, amount, health }) => ({
      targetId: entity.id, sourceId: sourceId ?? null, amount: coord(amount), health: coord(health),
    })),
    new RelayedEvent(EVENTS.ENEMY_SPAWNED, ({ enemy, wave }) => ({
      id: enemy.id, type: enemy.type ?? 'enemy', x: coord(enemy.position.x), z: coord(enemy.position.z), wave,
    })),
    new RelayedEvent(EVENTS.WEAPON_PICKED_UP, ({ ownerId, pickupId, weaponId, droppedId }) => ({
      ownerId, pickupId, weaponId, droppedId: droppedId ?? null,
    })),
    new RelayedEvent(EVENTS.AMMO_REFILLED, ({ ownerId, crateId }) => ({ ownerId, crateId })),
    new RelayedEvent(EVENTS.ITEM_THROWN, ({ ownerId, itemId }) => ({ ownerId, itemId })),
    new RelayedEvent(EVENTS.EXPLODED, ({ kind, x, y, z, radius, ownerId }) => ({
      kind, x: coord(x), y: coord(y), z: coord(z), radius: coord(radius), ownerId: ownerId ?? null,
    })),
    new RelayedEvent(EVENTS.WAVE_STARTED, ({ wave, count }) => ({ wave, count })),
    new RelayedEvent(EVENTS.WAVE_CLEARED, ({ wave, kills }) => ({ wave, kills })),
    new RelayedEvent(EVENTS.STATE_CHANGED, ({ state, wave }) => ({ state, wave })),
    new RelayedEvent(EVENTS.GAME_OVER, ({ wave, kills }) => ({ wave, kills })),
    new RelayedEvent(EVENTS.VICTORY, ({ wave, kills }) => ({ wave, kills })),
  ];
}

/**
 * Observer between a session's EventBus and a room: every relayed event becomes
 * `{t: 'event', name, detail}` handed to `send` (normally room.broadcast).
 */
export class EventRelay {
  constructor(relayed = standardRelayedEvents()) {
    this.relayed = relayed;
    this._unsubscribe = [];
  }

  /** Starts forwarding events from `events` to `send(message)`. */
  attach(events, send) {
    this.detach();
    for (const { name, detail } of this.relayed) {
      this._unsubscribe.push(events.on(name, payload => send({ t: 'event', name, detail: detail(payload ?? {}) })));
    }
    return this;
  }

  detach() {
    for (const unsubscribe of this._unsubscribe) unsubscribe();
    this._unsubscribe.length = 0;
  }
}
