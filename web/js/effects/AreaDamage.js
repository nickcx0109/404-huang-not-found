import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from '../game/events.js';

const RAY = { x: 0, y: 0, z: 0 };
const FROM = { x: 0, y: 0, z: 0 };

/**
 * Damages every living enemy whose body is within `radius` of `centre`, `damageAt(fraction)` giving the
 * amount where fraction is 0 at the centre and 1 at the edge. With `blockedByWalls`, a box between the
 * centre and the enemy shields it. Only sends DAMAGE_REQUESTED; the session decides what lands.
 * @returns {number} how many enemies were asked to take damage
 */
export function damageEnemiesInRadius(ctx, { centre, radius, damageAt, sourceId, kind, blockedByWalls = false }) {
  let count = 0;
  for (const enemy of ctx.enemies) {
    if (!enemy.damageable.alive) continue;
    const dx = enemy.position.x - centre.x;
    const dz = enemy.position.z - centre.z;
    const flat = Math.hypot(dx, dz);
    const reach = Math.max(0, flat - (enemy.radius ?? 0));
    if (reach > radius) continue;
    if (blockedByWalls && flat > 1e-6) {
      FROM.x = centre.x;
      FROM.y = Math.max(centre.y, 0.3);
      FROM.z = centre.z;
      const dy = (enemy.position.y ?? 0) + 0.9 - FROM.y;
      const length = Math.hypot(dx, dy, dz);
      RAY.x = dx / length;
      RAY.y = dy / length;
      RAY.z = dz / length;
      if (ctx.collision.raycast(FROM, RAY, length) < Math.max(0, length - (enemy.radius ?? 0))) continue;
    }
    const amount = damageAt(radius > 0 ? reach / radius : 0);
    if (amount <= 0) continue;
    ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({ amount, sourceId, targetId: enemy.id, kind }));
    count++;
  }
  return count;
}
