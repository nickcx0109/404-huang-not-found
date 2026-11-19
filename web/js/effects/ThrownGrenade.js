import { ThrownObject } from './ThrownObject.js';
import { damageInRadius } from './AreaDamage.js';
import { EVENTS } from '../game/events.js';

const UP = Object.freeze({ x: 0, y: 1, z: 0 });
const RESTITUTION = 0.45; // share of the speed into a face that comes back out
const IMPACT_GRIP = 0.8; // share of the sliding speed kept on a real bounce
const SETTLE_SPEED = 1.2; // slower than this into a face and it stops bouncing
const ROLL_DRAG = 8; // m/s^2 lost while rolling on a floor or a box top

/** A grenade in flight: bounces off walls, box tops and the ground, rolls to a stop and explodes when its fuse runs out. */
export class ThrownGrenade extends ThrownObject {
  constructor(options, { fuseSeconds = 3, radius = 5, centreDamage = 150, edgeDamage = 30 } = {}) {
    super('grenade', options);
    this.explodesAt = this.thrownAt + fuseSeconds;
    this.radius = radius;
    this.centreDamage = centreDamage;
    this.edgeDamage = edgeDamage;
  }

  onWall(ctx, normal, dt) {
    this._bounce(normal, dt);
    return true;
  }

  onGround(ctx, dt) {
    this._bounce(UP, dt);
    return true;
  }

  /** Reflects the speed into the face, keeps most of the sliding speed, and rolls on anything floor-like. */
  _bounce(normal, dt) {
    const v = this.velocity;
    const into = v.x * normal.x + v.y * normal.y + v.z * normal.z;
    if (into >= 0) return; // already leaving the face
    const settled = -into < SETTLE_SPEED;
    const outward = settled ? 0 : -into * RESTITUTION;
    // Split into the part along the normal and the part sliding along the face.
    let sx = v.x - into * normal.x;
    let sy = v.y - into * normal.y;
    let sz = v.z - into * normal.z;
    if (settled && normal.y > 0.5) {
      const speed = Math.hypot(sx, sy, sz);
      const keep = speed > 0 ? Math.max(0, speed - ROLL_DRAG * dt) / speed : 0;
      sx *= keep; sy *= keep; sz *= keep;
    } else if (!settled) {
      sx *= IMPACT_GRIP; sy *= IMPACT_GRIP; sz *= IMPACT_GRIP;
    }
    v.x = sx + outward * normal.x;
    v.y = sy + outward * normal.y;
    v.z = sz + outward * normal.z;
  }

  afterMove(ctx) {
    if (ctx.time + 1e-9 < this.explodesAt) return true;
    const { centreDamage, edgeDamage } = this;
    damageInRadius(ctx, { centre: this.position, radius: this.radius, sourceId: this.ownerId,
      kind: 'explosion', blockedByWalls: true,
      damageAt: fraction => centreDamage + (edgeDamage - centreDamage) * fraction });
    ctx.events.emit(EVENTS.EXPLODED, { kind: this.kind, x: this.position.x, y: this.position.y,
      z: this.position.z, radius: this.radius, ownerId: this.ownerId });
    return false;
  }
}
