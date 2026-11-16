import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from '../game/events.js';

export class HitscanFire {
  fire(shot, ctx, ownerId) {
    const { origin, direction } = ctx.aim;
    let distance = Math.min(shot.range, ctx.collision.raycast(origin, direction, shot.range));
    let target = null;
    for (const enemy of ctx.enemies) {
      if (!enemy.damageable.alive) continue;
      const hitDistance = enemy.hitVolume.rayDistance(origin, direction, shot.range);
      if (hitDistance < distance) {
        distance = hitDistance;
        target = enemy;
      }
    }
    if (!target) return null;
    const hitPart = origin.y + direction.y * distance >= target.position.y + target.headHeight ? 'head' : 'body';
    ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({
      amount: shot.damage, sourceId: ownerId, targetId: target.id, hitPart,
    }));
    return { targetId: target.id, hitPart, distance };
  }
}
