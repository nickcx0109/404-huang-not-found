// CollisionWorld: axis-aligned boxes built from LevelData.collisionBoxes (the colliders, grown
// to cover the turned and scaled props bound to them).
// Knows nothing about meshes, so visuals can change without touching collision.
const SKIN = 0.001; // keeps a resolved body from touching the face it was pushed out of
const RAY_AXES = [['x', 'minX', 'maxX'], ['y', 'minY', 'maxY'], ['z', 'minZ', 'maxZ']];

export class Aabb {
  constructor(minX, minY, minZ, maxX, maxY, maxZ, id) {
    this.minX = minX;
    this.minY = minY;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxY = maxY;
    this.maxZ = maxZ;
    this.id = id || null;
  }

  /** Level collider: centre (x, z) on the ground plane, size w (X) × d (Z) × h (Y), base at y. */
  static fromCollider(c) {
    return new Aabb(
      c.x - c.w / 2, c.y, c.z - c.d / 2,
      c.x + c.w / 2, c.y + c.h, c.z + c.d / 2,
      c.id
    );
  }

  /** True if a vertical square column (half-size r, from y0 to y1) at (x, z) overlaps this box. */
  overlapsColumn(x, z, r, y0, y1) {
    return (
      x + r > this.minX && x - r < this.maxX &&
      z + r > this.minZ && z - r < this.maxZ &&
      y1 > this.minY && y0 < this.maxY
    );
  }

  rayDistance(origin, direction, maxDistance) {
    let near = 0;
    let far = maxDistance;
    for (const axis of RAY_AXES) {
      const start = origin[axis[0]];
      const delta = direction[axis[0]];
      const minimum = this[axis[1]];
      const maximum = this[axis[2]];
      if (Math.abs(delta) < 1e-10) {
        if (start < minimum || start > maximum) return Infinity;
      } else {
        const entry = (minimum - start) / delta;
        const exit = (maximum - start) / delta;
        near = Math.max(near, Math.min(entry, exit));
        far = Math.min(far, Math.max(entry, exit));
        if (near > far) return Infinity;
      }
    }
    return near;
  }

  /**
   * Like rayDistance, but also says which face the ray enters through: axis 'x', 'y' or 'z'
   * (null when the origin starts inside the box). Returns null when the ray misses.
   */
  rayFace(origin, direction, maxDistance) {
    let near = 0;
    let far = maxDistance;
    let axisName = null;
    for (const axis of RAY_AXES) {
      const start = origin[axis[0]];
      const delta = direction[axis[0]];
      const minimum = this[axis[1]];
      const maximum = this[axis[2]];
      if (Math.abs(delta) < 1e-10) {
        if (start < minimum || start > maximum) return null;
      } else {
        const entry = Math.min((minimum - start) / delta, (maximum - start) / delta);
        if (entry > near) { near = entry; axisName = axis[0]; }
        far = Math.min(far, Math.max((minimum - start) / delta, (maximum - start) / delta));
        if (near > far) return null;
      }
    }
    return { distance: near, axis: axisName };
  }
}

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.bounds = null;
  }

  static fromLevel(level) {
    const world = new CollisionWorld();
    (level.collisionBoxes || level.colliders).forEach((c) => world.add(Aabb.fromCollider(c)));
    const b = level.bounds;
    world.bounds = {
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
    };
    return world;
  }

  add(aabb) {
    this.boxes.push(aabb);
    return aabb;
  }

  /** First box overlapping the column, or null. */
  hit(x, z, r, y0, y1) {
    for (let i = 0; i < this.boxes.length; i++) {
      if (this.boxes[i].overlapsColumn(x, z, r, y0, y1)) return this.boxes[i];
    }
    return null;
  }

  raycast(origin, direction, maxDistance) {
    let distance = Infinity;
    for (const box of this.boxes) distance = Math.min(distance, box.rayDistance(origin, direction, maxDistance));
    return distance;
  }

  /**
   * The nearest box face a ray hits: { distance, normal } with a unit normal pointing out of the box,
   * or null when nothing is hit within maxDistance. Used by bouncing objects.
   */
  raycastFace(origin, direction, maxDistance) {
    let best = null;
    for (const box of this.boxes) {
      const hit = box.rayFace(origin, direction, maxDistance);
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    if (!best) return null;
    const normal = { x: 0, y: 0, z: 0 };
    if (best.axis) normal[best.axis] = direction[best.axis] > 0 ? -1 : 1;
    else normal.y = 1; // started inside a box: push it up and out
    return { distance: best.distance, normal };
  }

  /**
   * Moves a column (half-size r, spanning y0..y1) from (x, z) by (dx, dz), sliding along boxes.
   * Axes are resolved one at a time, and long moves are split so thin walls cannot be skipped.
   * @returns {{x:number, z:number, hitX:boolean, hitZ:boolean}}
   */
  move(x, z, dx, dz, r, y0, y1, result = {}) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / r));
    const sx = dx / steps;
    const sz = dz / steps;
    let hitX = false;
    let hitZ = false;

    for (let pass = 0; pass < this.boxes.length; pass++) {
      let resolved = false;
      for (const box of this.boxes) {
        if (!box.overlapsColumn(x, z, r, y0, y1)) continue;
        const left = x - box.minX + r;
        const right = box.maxX - x + r;
        const front = z - box.minZ + r;
        const back = box.maxZ - z + r;
        const depth = Math.min(left, right, front, back);
        if (depth === left || depth === right) {
          x = depth === left ? box.minX - r - SKIN : box.maxX + r + SKIN;
          hitX = true;
        } else {
          z = depth === front ? box.minZ - r - SKIN : box.maxZ + r + SKIN;
          hitZ = true;
        }
        resolved = true;
      }
      if (!resolved) break;
    }

    for (let s = 0; s < steps; s++) {
      if (sx !== 0) {
        x += sx;
        for (let i = 0; i < this.boxes.length; i++) {
          const b = this.boxes[i];
          if (b.overlapsColumn(x, z, r, y0, y1)) {
            x = sx > 0 ? b.minX - r - SKIN : b.maxX + r + SKIN;
            hitX = true;
          }
        }
      }
      if (sz !== 0) {
        z += sz;
        for (let i = 0; i < this.boxes.length; i++) {
          const b = this.boxes[i];
          if (b.overlapsColumn(x, z, r, y0, y1)) {
            z = sz > 0 ? b.minZ - r - SKIN : b.maxZ + r + SKIN;
            hitZ = true;
          }
        }
      }
    }

    if (this.bounds) {
      const cx = Math.min(Math.max(x, this.bounds.minX + r), this.bounds.maxX - r);
      const cz = Math.min(Math.max(z, this.bounds.minZ + r), this.bounds.maxZ - r);
      hitX = hitX || cx !== x;
      hitZ = hitZ || cz !== z;
      x = cx;
      z = cz;
    }
    result.x = x;
    result.z = z;
    result.hitX = hitX;
    result.hitZ = hitZ;
    return result;
  }
}
