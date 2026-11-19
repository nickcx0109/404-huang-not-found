import { AmmoCrate } from './AmmoCrate.js';

/** Level marker type of an ammunition box. */
export const AMMO_MARKER = 'ammo';

/**
 * Every ammunition box of a level. Same interface as PickupField (`take`, `offerFor`), so the session
 * and the HUD treat "press E here" the same whether it is a gun on the ground or a box.
 */
export class AmmoCrateField {
  constructor(crates = []) {
    this.crates = crates;
  }

  static fromLevel(level, options) {
    return new AmmoCrateField((level.markers ?? []).filter(marker => marker.type === AMMO_MARKER)
      .map(marker => new AmmoCrate(marker.id, { x: marker.x, y: 0, z: marker.z }, { radius: marker.r, ...options })));
  }

  nearestFor(player) {
    let best = null;
    let bestDistance = Infinity;
    for (const crate of this.crates) {
      if (!crate.reachableBy(player)) continue;
      const distance = crate.distanceTo(player);
      if (distance < bestDistance) {
        best = crate;
        bestDistance = distance;
      }
    }
    return best;
  }

  take(player, ctx) {
    return this.nearestFor(player)?.use(player, ctx) ?? false;
  }

  /** For the prompt: ready → "E  REFILL AMMO", waiting → "AMMO  READY IN 42s", nothing to fill → "AMMO  FULL". */
  offerFor(player, out = {}, time = 0) {
    const crate = this.nearestFor(player);
    if (!crate) return null;
    out.name = 'AMMO';
    out.swap = false;
    out.verb = 'REFILL';
    out.full = !AmmoCrate.needs(player);
    out.note = out.full ? 'FULL' : crate.ready(time) ? null : 'READY IN ' + Math.ceil(crate.secondsLeft(time)) + 's';
    return out;
  }
}
