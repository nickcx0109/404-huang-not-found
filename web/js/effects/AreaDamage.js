import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from '../game/events.js';

const RAY = { x: 0, y: 0, z: 0 };
const FROM = { x: 0, y: 0, z: 0 };

/**
 * Damages everyone in the area: every living enemy and every living player (the thrower included) whose
 * body is within `radius` of `centre`. `damageAt(fraction)` gives the amount, fraction 0 at the centre
 * and 1 at the edge. With `blockedByWalls`, a box between the centre and the body shields it.
 * Only sends DAMAGE_REQUESTED, marked `friendlyFire` so the session lets it reach players.
 * @returns {number} how many bodies were asked to take damage
 */
export function damageInRadius(ctx, { centre, radius, damageAt, sourceId, kind, blockedByWalls = false }) {
  let count = 0;
  for (const enemy of ctx.enemies) count += hurt(ctx, enemy, enemy.radius, centre, radius, damageAt, sourceId, kind, blockedByWalls);
  for (const player of ctx.players) count += hurt(ctx, player, player.body?.radius, centre, radius, damageAt, sourceId, kind, blockedByWalls);
  return count;
}

function hurt(ctx, body, bodyRadius = 0, centre, radius, damageAt, sourceId, kind, blockedByWalls) {
  if (!body.damageable.alive) return 0;
  const dx = body.position.x - centre.x;
  const dz = body.position.z - centre.z;
  const flat = Math.hypot(dx, dz);
  const reach = Math.max(0, flat - bodyRadius);
  if (reach > radius) return 0;
  if (blockedByWalls && flat > 1e-6) {
    FROM.x = centre.x;
    FROM.y = Math.max(centre.y, 0.3);
    FROM.z = centre.z;
    const dy = (body.position.y ?? 0) + 0.9 - FROM.y;
    const length = Math.hypot(dx, dy, dz);
    RAY.x = dx / length;
    RAY.y = dy / length;
    RAY.z = dz / length;
    if (ctx.collision.raycast(FROM, RAY, length) < Math.max(0, length - bodyRadius)) return 0;
  }
  const amount = damageAt(radius > 0 ? reach / radius : 0);
  if (amount <= 0) return 0;
  ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({ amount, sourceId, targetId: body.id, kind, friendlyFire: true }));
  return 1;
}
