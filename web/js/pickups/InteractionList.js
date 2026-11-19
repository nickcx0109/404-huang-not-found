/**
 * Composite of everything the player can use with E (guns on the ground, ammo boxes, ...).
 * Each part has `take(player, ctx)` and `offerFor(player, out, time)`; the first part that has
 * something here wins, in the order they were given.
 */
export class InteractionList {
  constructor(parts = []) {
    this.parts = parts.filter(Boolean);
  }

  take(player, ctx) {
    for (const part of this.parts) if (part.take(player, ctx)) return true;
    return false;
  }

  offerFor(player, out, time = 0) {
    for (const part of this.parts) {
      const offer = part.offerFor(player, out, time);
      if (offer) return offer;
    }
    return null;
  }
}
