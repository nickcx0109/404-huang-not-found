/**
 * The weapons lying on the ground as the server last listed them (`snapshot.pickups`, `[{id, item}]`),
 * shaped like the part of a PickupField that WeaponPickupViews reads: `catalog` and `pickups` with
 * `id`, `position`, `weapon.id` and `empty`. Where each spot is comes from the level's markers (the
 * same ones the server built its field from); what lies there comes only from the server, so every
 * spot starts empty until the first snapshot says otherwise.
 */
export class PickupMirror {
  /**
   * @param {WeaponCatalog} catalog  only its pools (which marker types are pickups) and looks are used
   * @param {Array<{id: string, position: {x: number, y: number, z: number}}>} spots
   */
  constructor(catalog, spots) {
    this.catalog = catalog;
    this.pickups = spots.map(spot => new MirroredPickup(spot.id, spot.position));
    this._byId = new Map(this.pickups.map(pickup => [pickup.id, pickup]));
  }

  static fromLevel(level, catalog) {
    const spots = (level.markers ?? []).filter(marker => catalog.hasPool(marker.type))
      .map(marker => ({ id: marker.id, position: { x: marker.x, y: 0, z: marker.z } }));
    return new PickupMirror(catalog, spots);
  }

  /**
   * Takes one snapshot's list. Unknown spots and items the catalog cannot draw are ignored.
   * @returns {string[]} ids whose item changed, for WeaponPickupViews.refresh
   */
  apply(records) {
    const changed = [];
    if (!Array.isArray(records)) return changed;
    for (const record of records) {
      const pickup = this._byId.get(record?.id);
      if (!pickup) continue;
      const item = typeof record.item === 'string' && this.catalog.has(record.item) ? record.item : null;
      if (pickup.item === item) continue;
      pickup.item = item;
      changed.push(pickup.id);
    }
    return changed;
  }
}

class MirroredPickup {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.item = null;
  }

  get empty() {
    return this.item === null;
  }

  /** WeaponPickupViews reads `weapon.id`; only the id is known here. */
  get weapon() {
    return this.item === null ? null : { id: this.item };
  }
}
