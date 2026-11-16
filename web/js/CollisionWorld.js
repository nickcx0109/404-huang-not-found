// CollisionWorld: axis-aligned boxes built from LevelData.colliders.
// Knows nothing about meshes, so visuals can change without touching collision.
const SKIN = 0.001; // keeps a resolved body from touching the face it was pushed out of

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
}

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.bounds = null;
  }

  static fromLevel(level) {
    const world = new CollisionWorld();
    level.colliders.forEach((c) => world.add(Aabb.fromCollider(c)));
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

  /**
   * Moves a column (half-size r, spanning y0..y1) from (x, z) by (dx, dz), sliding along boxes.
   * Axes are resolved one at a time, and long moves are split so thin walls cannot be skipped.
   * @returns {{x:number, z:number, hitX:boolean, hitZ:boolean}}
   */
  move(x, z, dx, dz, r, y0, y1) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / r));
    const sx = dx / steps;
    const sz = dz / steps;
    let hitX = false;
    let hitZ = false;

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
    return { x, z, hitX, hitZ };
  }
}
