// ColliderFootprint: the collision box of a collider once the props bound to it are drawn.
// A level collider is an axis-aligned box in level space, but a bound prop is drawn turned by
// its rotY and grown by its scale, so it can stick out of that box (KNOWN_ISSUES #3).
// The collision box is the smallest axis-aligned box holding both the collider as written and
// every bound prop's turned, scaled footprint. It is never smaller than the written collider.
// Pure data, no three.js: LevelData (and a Node server) use it.
const DEG2RAD = Math.PI / 180;
const EPSILON = 1e-9; // cos(90°) is 6e-17, not 0: round it so quarter turns stay exact

export class ColliderFootprint {
  /**
   * Axis-aligned extent of a w (X) × d (Z) rectangle centred at (x, z), turned rotY degrees
   * about +Y. The direction of the turn does not matter for the extent.
   * @returns {{minX:number, maxX:number, minZ:number, maxZ:number}}
   */
  static rotatedExtent(x, z, w, d, rotY) {
    const angle = (rotY || 0) * DEG2RAD;
    let cos = Math.abs(Math.cos(angle));
    let sin = Math.abs(Math.sin(angle));
    if (cos < EPSILON) cos = 0;
    if (sin < EPSILON) sin = 0;
    const halfX = (cos * w + sin * d) / 2;
    const halfZ = (sin * w + cos * d) / 2;
    return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
  }

  /**
   * What a prop bound to `collider` covers: its footprint, else its size, else the collider's
   * size (the size a stand-in is built at), times its scale, turned by its rotY, standing at its
   * position.
   * @returns {{minX, maxX, minY, maxY, minZ, maxZ}}
   */
  static ofProp(prop, collider) {
    const size = prop.footprint || prop.size || collider;
    const scale = prop.scale === undefined ? 1 : prop.scale;
    const extent = ColliderFootprint.rotatedExtent(
      prop.x, prop.z, size.w * scale, size.d * scale, prop.rotY
    );
    extent.minY = prop.y;
    extent.maxY = prop.y + size.h * scale;
    return extent;
  }

  /**
   * The collider grown to also hold the footprint of every prop in `props` (the props bound to
   * it). Same fields as a LevelData collider. Returns the collider itself when nothing sticks out.
   */
  static cover(collider, props) {
    let minX = collider.x - collider.w / 2;
    let maxX = collider.x + collider.w / 2;
    let minZ = collider.z - collider.d / 2;
    let maxZ = collider.z + collider.d / 2;
    let minY = collider.y;
    let maxY = collider.y + collider.h;
    let grown = false;
    for (const prop of props) {
      const e = ColliderFootprint.ofProp(prop, collider);
      if (e.minX < minX) { minX = e.minX; grown = true; }
      if (e.maxX > maxX) { maxX = e.maxX; grown = true; }
      if (e.minZ < minZ) { minZ = e.minZ; grown = true; }
      if (e.maxZ > maxZ) { maxZ = e.maxZ; grown = true; }
      if (e.minY < minY) { minY = e.minY; grown = true; }
      if (e.maxY > maxY) { maxY = e.maxY; grown = true; }
    }
    if (!grown) return collider;
    return Object.freeze({
      id: collider.id,
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      w: maxX - minX,
      d: maxZ - minZ,
      h: maxY - minY,
      y: minY,
      visible: collider.visible,
    });
  }
}
