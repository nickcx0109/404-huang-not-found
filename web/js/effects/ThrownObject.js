import { Effect } from './Effect.js';

const GRAVITY = 9.8;
const MAX_STEP = 1 / 60;
const SKIN = 0.05;

/**
 * Template for an object flying through the air: gravity, walls (the level's boxes) and the ground at y = 0.
 * Subclasses decide what happens when it touches something (`onWall` with the face's outward normal,
 * `onGround`) and when it is done (`afterMove`). Each returns false to end the object.
 */
export class ThrownObject extends Effect {
  constructor(kind, { position, velocity, ownerId = null, time = 0 }) {
    if (new.target === ThrownObject) throw new TypeError('ThrownObject is abstract');
    super(kind, position);
    this.velocity = { x: velocity.x, y: velocity.y, z: velocity.z };
    this.ownerId = ownerId;
    this.thrownAt = time;
    this._ray = { x: 0, y: 0, z: 0 };
  }

  update(dt, ctx) {
    for (let left = dt; left > 1e-9; left -= MAX_STEP) {
      if (!this._step(Math.min(MAX_STEP, left), ctx)) return false;
    }
    return this.afterMove(ctx);
  }

  _step(dt, ctx) {
    const v = this.velocity;
    v.y -= GRAVITY * dt;
    const distance = Math.hypot(v.x, v.y, v.z) * dt;
    if (distance > 1e-9) {
      const ray = this._ray;
      ray.x = v.x * dt / distance;
      ray.y = v.y * dt / distance;
      ray.z = v.z * dt / distance;
      const hit = ctx.collision.raycastFace(this.position, ray, distance + SKIN);
      if (hit) {
        const travel = Math.max(0, hit.distance - SKIN);
        this.position.x += ray.x * travel;
        this.position.y += ray.y * travel;
        this.position.z += ray.z * travel;
        return this.onWall(ctx, hit.normal, dt);
      }
      this.position.x += v.x * dt;
      this.position.y += v.y * dt;
      this.position.z += v.z * dt;
    }
    if (this.position.y <= 0) {
      this.position.y = 0;
      return this.onGround(ctx, dt);
    }
    return true;
  }

  /** Touched a wall or a box face whose outward normal is `normal`. Default: stop dead and fall. */
  onWall(ctx, normal, dt) {
    this.velocity.x = 0;
    this.velocity.z = 0;
    return true;
  }

  /** Touched the ground. Default: stop. */
  onGround(ctx, dt) {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    return true;
  }

  afterMove(ctx) {
    return true;
  }
}
