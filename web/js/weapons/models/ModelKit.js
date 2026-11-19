import * as THREE from 'three';
import { Palette } from '../../Palette.js';
import { WeaponModel } from '../WeaponModel.js';

const AXIS_TURN = Object.freeze({ x: [0, 0, -Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] });

/**
 * Builds a weapon out of simple Three.js shapes and hands it over as a WeaponModel, the same
 * posable model a GLB from the asset pipeline becomes. Every piece is baked into weapon space
 * (metres, +Y up, muzzle or blade tip toward -Z), so a moving part only needs its pivot.
 *
 *   const kit = new ModelKit(colors);
 *   kit.box([0.05, 0.07, 0.24], 'gun_steel', [0, 0.02, -0.06]);
 *   kit.part('magazine', [0, -0.02, -0.1], () => kit.box(...));
 *   kit.marker('muzzle', [0, 0.02, -0.71]);
 *   return kit.build('rifle');
 *
 * Colours are names from art/style/chapters/weapons.json "_assets.colors", or sRGB hex.
 */
export class ModelKit {
  /** @param {Object<string, string>} colors  name -> sRGB hex */
  constructor(colors = {}) {
    this.colors = colors;
    this.root = new THREE.Group();
    this._materials = new Map();
    this._part = null;
  }

  /** A shared material. `look`: roughness, metalness, glow (emissive strength), opacity. */
  material(color, look = {}) {
    const key = color + JSON.stringify(look);
    if (!this._materials.has(key)) {
      const hex = this.colors[color] || color;
      const material = new THREE.MeshStandardMaterial({
        color: Palette.color(hex),
        roughness: look.roughness ?? 0.6,
        metalness: look.metalness ?? 0.15,
        flatShading: look.flat ?? false,
      });
      if (look.glow) {
        material.emissive = Palette.color(hex);
        material.emissiveIntensity = look.glow;
      }
      if (look.opacity !== undefined) {
        material.transparent = true;
        material.opacity = look.opacity;
        material.depthWrite = false;
      }
      this._materials.set(key, material);
    }
    return this._materials.get(key);
  }

  /** Everything added inside `build` belongs to the moving part `name`, which turns about `pivot`. */
  part(name, pivot, build) {
    const outer = this._part;
    this._part = { name, pivot };
    try {
      build();
    } finally {
      this._part = outer;
    }
  }

  /** Adds a geometry placed at `at`, turned by `rot` (radians, XYZ). Returns the mesh. */
  add(geometry, color, at = [0, 0, 0], { rot = [0, 0, 0], scale = [1, 1, 1], look } = {}) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3().fromArray(scale)
    );
    geometry.applyMatrix4(matrix);
    const mesh = new THREE.Mesh(geometry, this.material(color, look));
    if (this._part) mesh.userData = { part: this._part.name, pivot: this._part.pivot.slice() };
    this.root.add(mesh);
    return mesh;
  }

  box(size, color, at, options = {}) {
    return this.add(new THREE.BoxGeometry(size[0], size[1], size[2]), color, at, options);
  }

  /**
   * A cylinder (or cone) of `length` along `axis` ('x', 'y' or 'z'); `rot` turns it further.
   * `sides` below 8 gives a faceted look (an octagonal handguard, a hexagonal grip).
   */
  cylinder(radiusTop, radiusBottom, length, color, at, { axis = 'z', sides = 12, rot, ...options } = {}) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, sides);
    const turn = AXIS_TURN[axis];
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(turn[0], turn[1], turn[2])));
    return this.add(geometry, color, at, { rot, ...options });
  }

  sphere(radius, color, at, { segments = 12, ...options } = {}) {
    return this.add(new THREE.SphereGeometry(radius, segments, Math.max(4, Math.round(segments * 0.75))), color, at, options);
  }

  torus(radius, tube, color, at, { arc = Math.PI * 2, sides = 16, ...options } = {}) {
    return this.add(new THREE.TorusGeometry(radius, tube, 6, sides, arc), color, at, options);
  }

  /**
   * A side profile extruded sideways: `points` are [z, y] pairs (as on a side drawing, muzzle to
   * the left at -z), `width` is the thickness along X, centred on x.
   */
  profile(points, width, color, x = 0, { bevel = 0, ...options } = {}) {
    const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1e-4, width - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 6,
    });
    // shape x -> -z, shape y -> y, extrusion -> x
    geometry.applyMatrix4(new THREE.Matrix4().set(
      0, 0, 1, x - width / 2 + bevel,
      0, 1, 0, 0,
      -1, 0, 0, 0,
      0, 0, 0, 1
    ));
    return this.add(geometry, color, [0, 0, 0], options);
  }

  /** A named point of the weapon (e.g. "muzzle", where the flash goes). */
  marker(name, at) {
    const node = new THREE.Object3D();
    node.userData = { marker: name, pivot: at.slice() };
    this.root.add(node);
  }

  /** The finished weapon. Materials keep their own roughness and metalness. */
  build(id) {
    return new WeaponModel(id, this.root);
  }
}
