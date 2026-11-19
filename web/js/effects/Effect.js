/**
 * Something that lives in the world for a while on its own: a thrown grenade, a patch of fire.
 * GameSession updates every effect in `ctx.effects` once per step and drops it when update() returns false.
 * Views draw effects by `kind` and read `position`; they never change them.
 */
export class Effect {
  constructor(kind, position) {
    if (new.target === Effect) throw new TypeError('Effect is abstract');
    if (typeof kind !== 'string' || kind === '') throw new TypeError('Effect needs a kind');
    this.kind = kind;
    this.position = { x: position.x, y: position.y ?? 0, z: position.z };
  }

  /** @returns {boolean} whether the effect is still there after this step */
  update(dt, ctx) {
    throw new Error('Implement Effect.update');
  }
}
