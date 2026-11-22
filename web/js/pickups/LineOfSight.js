/** DOM-free clear-path check between two players at chest height, through a CollisionWorld. */
export class LineOfSight {
  constructor(collision, { height = 0.9 } = {}) {
    this.collision = collision;
    this.height = height;
    this._origin = { x: 0, y: 0, z: 0 };
    this._direction = { x: 0, y: 0, z: 0 };
  }

  /** True when no collider stands between `from` and `to` (always true without a collision world). */
  clear(from, to) {
    if (!this.collision) return true;
    const ax = from.position.x, ay = (from.position.y ?? 0) + this.height, az = from.position.z;
    const dx = to.position.x - ax, dy = (to.position.y ?? 0) + this.height - ay, dz = to.position.z - az;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-6) return true;
    Object.assign(this._origin, { x: ax, y: ay, z: az });
    Object.assign(this._direction, { x: dx / distance, y: dy / distance, z: dz / distance });
    return this.collision.raycast(this._origin, this._direction, distance) >= distance;
  }
}
