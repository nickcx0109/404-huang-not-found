// ColliderFootprint: the collision box of a collider once the props bound to it are drawn.
// A level collider is an axis-aligned box in level space, but a bound prop is drawn turned by
// its rotY and grown by its scale about its own origin, so it can stick out of that box
// (KNOWN_ISSUES #3). The collision box is the smallest axis-aligned box holding both the
// collider as written and every bound prop's local box, scaled and turned the way PropFactory
// places it. It is never smaller than the written collider.
// Pure data, no three.js: LevelData (and a Node server) use it.
const DEG2RAD = Math.PI / 180;
const EPSILON = 1e-9; // cos(90°) is 6e-17, not 0: round it so quarter turns stay exact

const snap = (n) => (Math.abs(n) < EPSILON ? 0 : n);

export class ColliderFootprint {
  /**
   * Axis-aligned extent, in level space, of a box given in a prop's own space
   * ({ minX, maxX, minZ, maxZ } around the prop origin) once the prop stands at (x, z),
   * scaled by `scale` and turned rotY degrees about +Y the way three.js turns it
   * (x' = x cos + z sin, z' = -x sin + z cos).
   * @returns {{minX:number, maxX:number, minZ:number, maxZ:number}}
   */
  static placedExtent(local, x, z, rotY, scale = 1) {
    const angle = (rotY || 0) * DEG2RAD;
    const cos = snap(Math.cos(angle));
    const sin = snap(Math.sin(angle));
    const out = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const lx of [local.minX * scale, local.maxX * scale]) {
      for (const lz of [local.minZ * scale, local.maxZ * scale]) {
        const wx = x + cos * lx + sin * lz;
        const wz = z - sin * lx + cos * lz;
        if (wx < out.minX) out.minX = wx;
        if (wx > out.maxX) out.maxX = wx;
        if (wz < out.minZ) out.minZ = wz;
        if (wz > out.maxZ) out.maxZ = wz;
      }
    }
    return out;
  }

  /**
   * A prop's box in its own space: its footprint, else its size, else the collider's size
   * (what a stand-in is built at), centred on the origin and standing on it.
   */
  static localBox(prop, collider) {
    if (prop.footprint) return prop.footprint;
    const s = prop.size || collider;
    return { minX: -s.w / 2, minY: 0, minZ: -s.d / 2, maxX: s.w / 2, maxY: s.h, maxZ: s.d / 2 };
  }

  /**
   * What a prop bound to `collider` covers in level space.
   * @returns {{minX, maxX, minY, maxY, minZ, maxZ}}
   */
  static ofProp(prop, collider) {
    const local = ColliderFootprint.localBox(prop, collider);
    const scale = prop.scale === undefined ? 1 : prop.scale;
    const extent = ColliderFootprint.placedExtent(local, prop.x, prop.z, prop.rotY, scale);
    extent.minY = prop.y + local.minY * scale;
    extent.maxY = prop.y + local.maxY * scale;
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
