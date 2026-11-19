import { EVENTS } from '../game/events.js';

/**
 * Fire-mode Strategy for throwables: launches the object the shot describes from the player's eyes,
 * along the aim with a little lift, and hands it to the world (`ctx.effects`) to fly on its own.
 */
export class ThrowFire {
  fire(shot, ctx, ownerId) {
    const { origin, direction } = ctx.aim;
    const position = { x: origin.x + direction.x * 0.4, y: origin.y + direction.y * 0.4 - 0.15,
      z: origin.z + direction.z * 0.4 };
    const velocity = { x: direction.x * shot.speed, y: direction.y * shot.speed + shot.lift, z: direction.z * shot.speed };
    const thrown = shot.launch({ position, velocity, ownerId, time: ctx.time });
    ctx.effects.push(thrown);
    ctx.events.emit(EVENTS.ITEM_THROWN, { ownerId, itemId: shot.itemId, effect: thrown });
    return null;
  }
}
