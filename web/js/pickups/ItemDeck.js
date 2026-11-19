/**
 * Deals the items of each catalog pool like cards from a shuffled deck: every item in a pool comes
 * out once before any comes out twice. With at least as many spots as items, each weapon lies
 * somewhere in the level, at a different spot each game. A katana in two pools ('weapon' and
 * 'melee') is in both decks, so it may lie twice.
 * Pure logic; give it the session's rng so a host decides the deal.
 */
export class ItemDeck {
  /**
   * @param {WeaponCatalog} catalog
   * @param {() => number} rng  returns 0 <= x < 1
   */
  constructor(catalog, rng = Math.random) {
    this.catalog = catalog;
    this.rng = rng;
    this.decks = new Map();
  }

  /** The next item id from `pool`; a fresh shuffled deck starts when the last one is used up. */
  next(pool) {
    let deck = this.decks.get(pool);
    if (!deck || deck.length === 0) {
      deck = this._shuffled(this.catalog.idsIn(pool));
      this.decks.set(pool, deck);
    }
    return deck.pop();
  }

  _shuffled(ids) {
    if (ids.length === 0) throw new RangeError('Nothing to deal in this pool');
    for (let i = ids.length - 1; i > 0; i--) {
      const roll = this.rng();
      if (!(roll >= 0 && roll < 1)) throw new RangeError('rng must return a number in [0, 1)');
      const j = Math.floor(roll * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }
}
