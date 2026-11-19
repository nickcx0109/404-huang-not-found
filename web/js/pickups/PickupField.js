import { EVENTS } from '../game/events.js';
import { WeaponPickup } from './WeaponPickup.js';

/**
 * Level marker type that places a weapon on the ground. Its optional `item` names a WeaponCatalog entry;
 * without one the spot is fixed but the gun lying there is drawn at random each game.
 * `healing` and `throwable` markers work the same way, each drawing from its own pool of the catalog.
 */
export const WEAPON_MARKER = 'weapon';

/**
 * All weapons lying on the ground in one level. Taking one swaps it with whatever the player had in
 * that slot: the old weapon is left in the same place with its own rounds, so nothing is refilled.
 * Pure logic: views read `pickups` and listen for WEAPON_PICKED_UP.
 */
export class PickupField {
  constructor(catalog, pickups = []) {
    this.catalog = catalog;
    this.pickups = pickups;
  }

  /**
   * Builds one pickup per marker whose type is a pool of the catalog (`weapon`, `healing`, `throwable`).
   * Unknown items are an error, not a silent skip.
   * @param {() => number} rng  draws the gun for markers without an item (the session's rng, so a host decides)
   */
  static fromLevel(level, catalog, rng = Math.random) {
    const pickups = [];
    for (const marker of level.markers ?? []) {
      if (!catalog.hasPool(marker.type)) continue;
      const item = marker.item ?? catalog.randomId(rng, marker.type);
      if (!catalog.has(item)) throw new RangeError('Marker ' + marker.id + ': unknown weapon item "' + item + '"');
      pickups.push(new WeaponPickup(marker.id, { x: marker.x, y: 0, z: marker.z }, catalog.create(item), marker.r));
    }
    return new PickupField(catalog, pickups);
  }

  /** The closest pickup the player can reach and is allowed to take, or null. */
  nearestFor(player) {
    let best = null;
    let bestDistance = Infinity;
    for (const pickup of this.pickups) {
      if (!pickup.reachableBy(player) || !player.weapons.canEquip?.(pickup.weapon)) continue;
      const distance = pickup.distanceTo(player);
      if (distance < bestDistance) {
        best = pickup;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Swaps the nearest reachable pickup with the player's weapon in that slot.
   * @returns {boolean} whether a weapon was taken
   */
  take(player, ctx) {
    const pickup = this.nearestFor(player);
    if (!pickup) return false;
    const weapon = pickup.weapon;
    const dropped = player.weapons.equip(weapon);
    pickup.swap(dropped);
    ctx.events.emit(EVENTS.WEAPON_PICKED_UP, { ownerId: player.id, pickupId: pickup.id,
      weaponId: weapon.id, droppedId: dropped ? dropped.id : null });
    return true;
  }

  /**
   * What taking the nearest pickup would do, for the HUD prompt: { name, swap, full } or null.
   * When nothing can be taken but the player stands at an item they already carry a full stack of,
   * the offer says so (`full`), so the prompt can tell why E does nothing.
   */
  offerFor(player, out = {}) {
    const pickup = this.nearestFor(player) ?? this._nearestFull(player);
    if (!pickup) return null;
    out.name = this.catalog.nameOf(pickup.weapon.id);
    out.full = player.weapons.isFull?.(pickup.weapon) ?? false;
    out.swap = !out.full && (player.weapons.wouldSwap?.(pickup.weapon) ?? false);
    out.verb = out.swap ? 'SWAP FOR' : 'PICK UP';
    out.note = out.full ? 'FULL' : null;
    return out;
  }

  _nearestFull(player) {
    let best = null;
    let bestDistance = Infinity;
    for (const pickup of this.pickups) {
      if (!pickup.reachableBy(player) || !player.weapons.isFull?.(pickup.weapon)) continue;
      const distance = pickup.distanceTo(player);
      if (distance < bestDistance) {
        best = pickup;
        bestDistance = distance;
      }
    }
    return best;
  }
}
