import { HitscanFire } from './HitscanFire.js';

export class SpreadFire {
  constructor({ rng = null, fireMode = new HitscanFire() } = {}) {
    this.rng = rng;
    this.fireMode = fireMode;
  }

  fire(shot, ctx, ownerId) {
    const rng = this.rng ?? ctx.rng ?? Math.random;
    const forward = ctx.aim.direction;
    const forwardLength = Math.hypot(forward.x, forward.y, forward.z);
    const forwardX = forward.x / forwardLength;
    const forwardY = forward.y / forwardLength;
    const forwardZ = forward.z / forwardLength;
    const horizontalLength = Math.hypot(forwardX, forwardZ);
    const rightX = horizontalLength > 1e-9 ? -forwardZ / horizontalLength : 1;
    const rightZ = horizontalLength > 1e-9 ? forwardX / horizontalLength : 0;
    const upX = -rightZ * forwardY;
    const upY = rightZ * forwardX - rightX * forwardZ;
    const upZ = rightX * forwardY;
    const direction = { x: 0, y: 0, z: 0 };
    const pelletContext = { ...ctx, aim: { origin: ctx.aim.origin, direction } };
    let firstHit = null;
    for (let index = 0; index < shot.pellets; index++) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * shot.spread;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      direction.x = forwardX + rightX * offsetX + upX * offsetY;
      direction.y = forwardY + upY * offsetY;
      direction.z = forwardZ + rightZ * offsetX + upZ * offsetY;
      const length = Math.hypot(direction.x, direction.y, direction.z);
      direction.x /= length;
      direction.y /= length;
      direction.z /= length;
      const hit = this.fireMode.fire(shot, pelletContext, ownerId);
      if (firstHit === null && hit !== null) firstHit = hit;
    }
    return firstHit;
  }
}
