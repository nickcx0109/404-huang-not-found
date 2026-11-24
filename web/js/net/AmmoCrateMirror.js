import { AMMO_MARKER } from '../pickups/AmmoCrateField.js';

/**
 * The ammo crates as the server last listed them (`snapshot.crates`, `[{id, ready}]`), shaped like the
 * part of an AmmoCrateField that AmmoCrateViews reads: `crates` with `id`, `position` and `ready(time)`.
 * Where each crate stands comes from the level's markers; whether it can be used comes only from the
 * server. Every crate counts as ready until a snapshot says otherwise (an older server sends no list).
 */
export class AmmoCrateMirror {
  /** @param {Array<{id: string, position: {x: number, y: number, z: number}}>} spots */
  constructor(spots) {
    this.crates = spots.map(spot => new MirroredCrate(spot.id, spot.position));
    this._byId = new Map(this.crates.map(crate => [crate.id, crate]));
  }

  static fromLevel(level) {
    return new AmmoCrateMirror((level.markers ?? []).filter(marker => marker.type === AMMO_MARKER)
      .map(marker => ({ id: marker.id, position: { x: marker.x, y: 0, z: marker.z } })));
  }

  /**
   * Takes one snapshot's list; a snapshot without one changes nothing. Unknown crates are ignored.
   * @returns {string[]} ids whose state changed
   */
  apply(records) {
    const changed = [];
    if (!Array.isArray(records)) return changed;
    for (const record of records) {
      const crate = this._byId.get(record?.id);
      if (!crate || typeof record.ready !== 'boolean' || crate.isReady === record.ready) continue;
      crate.isReady = record.ready;
      changed.push(crate.id);
    }
    return changed;
  }
}

class MirroredCrate {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.isReady = true;
  }

  /** AmmoCrateViews asks with its own clock; the server has already answered for its time. */
  ready() {
    return this.isReady;
  }
}
