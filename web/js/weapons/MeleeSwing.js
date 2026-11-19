import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from '../game/events.js';

/**
 * Fire-mode Strategy for melee: picks the closest living enemy whose body is within `shot.range`
 * of the player and inside the arc in front (`shot.minDot` is the cosine of half the arc, measured
 * on the ground plane). A wall between the player and the enemy blocks the hit.
 * Like HitscanFire it only sends DAMAGE_REQUESTED and returns a hit summary or null.
 */
export class MeleeSwing {
  constructor() {
    this._toTarget = { x: 0, y: 0, z: 0 };
  }

  fire(shot, ctx, ownerId) {
    const { origin, direction } = ctx.aim;
    const facing = Math.hypot(direction.x, direction.z);
    if (facing < 1e-6) return null;
    const fx = direction.x / facing;
    const fz = direction.z / facing;
    let target = null;
    let best = Infinity;
    for (const enemy of ctx.enemies) {
      if (!enemy.damageable.alive) continue;
      const dx = enemy.position.x - origin.x;
      const dz = enemy.position.z - origin.z;
      const centre = Math.hypot(dx, dz);
      const reach = centre - enemy.radius;
      if (reach > shot.range || reach >= best) continue;
      // Standing inside the enemy's radius counts as in front, whatever the angle.
      if (centre > enemy.radius && (dx * fx + dz * fz) / centre < shot.minDot) continue;
      if (centre > 1e-6 && this._blocked(ctx, origin, dx, dz, centre, reach)) continue;
      best = Math.max(0, reach);
      target = enemy;
    }
    if (!target) return null;
    ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({
      amount: shot.damage, sourceId: ownerId, targetId: target.id, hitPart: 'body', kind: 'melee',
    }));
    return { targetId: target.id, hitPart: 'body', distance: best };
  }

  _blocked(ctx, origin, dx, dz, centre, reach) {
    const ray = this._toTarget;
    ray.x = dx / centre;
    ray.y = 0;
    ray.z = dz / centre;
    return ctx.collision.raycast(origin, ray, Math.max(0, reach)) < reach;
  }
}
