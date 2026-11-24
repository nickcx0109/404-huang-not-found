/**
 * The effects the server last listed (`snapshot.effects`, `[{id, kind, x, y, z, radius?}]`), shaped like
 * `ctx.effects` as EffectViews reads it: the same object for the same id while it lives, with `kind`,
 * `position`, `radius` and `velocity`. Fed the interpolated list every frame (SnapshotBuffer), so
 * grenades fly smoothly; an effect missing from the list is gone, and no list means no effects.
 */
export class EffectMirror {
  constructor() {
    /** Live mirrored effects; the array itself stays the same so views can hold on to it. */
    this.effects = [];
    this._byId = new Map();
    this._seen = new Set();
  }

  /** @returns {MirroredEffect[]} the live effects after this list */
  apply(records) {
    const seen = this._seen;
    seen.clear();
    for (const record of Array.isArray(records) ? records : []) {
      if (!MirroredEffect.accepts(record)) continue;
      const effect = this._byId.get(record.id);
      if (effect && effect.kind === record.kind) effect.moveTo(record);
      else this._byId.set(record.id, new MirroredEffect(record));
      seen.add(record.id);
    }
    for (const id of this._byId.keys()) if (!seen.has(id)) this._byId.delete(id);
    this.effects.length = 0;
    for (const effect of this._byId.values()) this.effects.push(effect);
    return this.effects;
  }
}

const MOVED = 1e-4;
const POSITION_KEYS = Object.freeze(['x', 'y', 'z']);

class MirroredEffect {
  static accepts(record) {
    return record !== null && typeof record === 'object' && typeof record.kind === 'string'
      && (typeof record.id === 'string' || Number.isFinite(record.id))
      && POSITION_KEYS.every(key => Number.isFinite(record[key]));
  }

  constructor(record) {
    this.id = record.id;
    this.kind = record.kind;
    this.position = { x: record.x, y: record.y, z: record.z };
    this.radius = Number.isFinite(record.radius) ? record.radius : 0;
    /** How far it moved since the last list, or null while it rests (EffectViews spins moving things). */
    this.velocity = null;
  }

  moveTo(record) {
    const p = this.position;
    const dx = record.x - p.x;
    const dy = record.y - p.y;
    const dz = record.z - p.z;
    this.velocity = Math.hypot(dx, dy, dz) > MOVED ? { x: dx, y: dy, z: dz } : null;
    p.x = record.x;
    p.y = record.y;
    p.z = record.z;
    if (Number.isFinite(record.radius)) this.radius = record.radius;
  }
}
