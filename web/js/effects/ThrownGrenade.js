import { ThrownObject } from './ThrownObject.js';
import { damageInRadius } from './AreaDamage.js';
import { EVENTS } from '../game/events.js';

/** A grenade in flight: bounces off walls and the ground and explodes when its fuse runs out. */
export class ThrownGrenade extends ThrownObject {
  constructor(options, { fuseSeconds = 3, radius = 5, centreDamage = 150, edgeDamage = 30 } = {}) {
    super('grenade', options);
    this.explodesAt = this.thrownAt + fuseSeconds;
    this.radius = radius;
    this.centreDamage = centreDamage;
    this.edgeDamage = edgeDamage;
  }

  onWall() {
    this.velocity.x *= -0.3;
    this.velocity.z *= -0.3;
    return true;
  }

  onGround() {
    this.velocity.y = this.velocity.y < -1.5 ? -this.velocity.y * 0.3 : 0;
    this.velocity.x *= 0.6;
    this.velocity.z *= 0.6;
    return true;
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
