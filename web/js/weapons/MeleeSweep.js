import { MeleeSwing } from './MeleeSwing.js';
import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from '../game/events.js';

/**
 * Fire-mode Strategy for a wide blade: like MeleeSwing, but every living enemy inside the reach and the
 * arc is hit, not just the closest one. A wall between the player and an enemy still protects it.
 * Returns a summary of the closest hit (or null) so the crosshair shows a hit like any other weapon.
 */
export class MeleeSweep extends MeleeSwing {
  fire(shot, ctx, ownerId) {
    const { origin, direction } = ctx.aim;
    const facing = Math.hypot(direction.x, direction.z);
    if (facing < 1e-6) return null;
    const fx = direction.x / facing;
    const fz = direction.z / facing;
    let closest = null;
    let best = Infinity;
    for (const enemy of ctx.enemies) {
      if (!enemy.damageable.alive) continue;
      const dx = enemy.position.x - origin.x;
      const dz = enemy.position.z - origin.z;
      const centre = Math.hypot(dx, dz);
      const reach = centre - enemy.radius;
      if (reach > shot.range) continue;
      if (centre > enemy.radius && (dx * fx + dz * fz) / centre < shot.minDot) continue;
      if (centre > 1e-6 && this._blocked(ctx, origin, dx, dz, centre, reach)) continue;
      ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({
        amount: shot.damage, sourceId: ownerId, targetId: enemy.id, hitPart: 'body', kind: 'melee',
      }));
      if (Math.max(0, reach) < best) {
        best = Math.max(0, reach);
        closest = enemy;
      }
    }
    return closest ? { targetId: closest.id, hitPart: 'body', distance: best } : null;
  }
}
