import * as THREE from 'three';
import { Emitters } from './Emitters.js';
import { Palette } from './Palette.js';

// PropFactory: prop name -> mesh. Visuals only; it never creates or changes collision.
// For each prop it uses, in this order:
//   1. the model web/assets/models/<name>.glb, when ModelLibrary has it (manifest says "ready");
//   2. the greybox stand-in registered under that name (web/js/props/*.js);
//   3. a grey box the size of the prop's collider.
// So a level stays playable while its art is missing, and a missing or broken model only
// costs its looks.
const DEFAULT_SIZE = Object.freeze({ w: 1, h: 1, d: 1 });

export class PropFactory {
  /**
   * @param {object} style  resolved palette style
   * @param {ModelLibrary} [models]  loaded models; without it only stand-ins are used
   * @param {string} [texturesUrl]  folder of the surface textures (web/assets/textures/);
   *   without it stand-ins keep their flat palette colours (the plain greybox look)
   */
  constructor(style, models, texturesUrl) {
    this.greybox = style.greybox;
    this.texturesUrl = texturesUrl || null;
    this._textures = new Map();
    this.models = models || null;
    this._extras = new Map();
    /** How many props were drawn with a model, by name. */
    this.modelCounts = new Map();
    /** Glowing materials and small coloured lights (accent, alarm, screens). */
    this.emitters = new Emitters(style);
    this._builders = new Map();
    this._owners = new Map();
    this._materials = new Map();
    /** Prop names that had no builder and were replaced by a fallback box. */
    this.unknownNames = new Set();

    // Every prop set that announced itself (web/js/props/*.js) registers its builders.
    PropFactory.sets.forEach((set) => {
      this._registering = set.name;
      set.register(this);
    });
    this._registering = null;
  }

  /**
   * Called once by each file in web/js/props/: adds its builders to every PropFactory.
   * This is what lets a chapter add props without touching App.js or this file.
   * @param {string} name      who owns these props, e.g. 'common', 'ch1'
   * @param {(factory: PropFactory) => void} register
   */
  static registerSet(name, register) {
    PropFactory.sets.push({ name, register });
  }

  /**
   * Registers a builder. It receives { prop, size, factory } and returns an Object3D
   * modelled around the origin: metres, +Y up, front toward -Z, origin at bottom centre.
   * `size` is the prop's own "size" if the level gives one, else the bound collider's
   * {w, h, d}, else a 1 m cube.
   */
  register(name, builder) {
    const owner = this._registering || 'runtime';
    if (this._builders.has(name)) {
      console.warn(
        '[props] "' + name + '" is registered by both ' + this._owners.get(name) + ' and ' +
          owner + '; ' + owner + ' wins. A prop name must belong to one file.'
      );
    }
    this._builders.set(name, builder);
    this._owners.set(name, owner);
    return this;
  }

  /**
   * Registers code that completes a MODEL of this name with what a GLB cannot carry:
   * lights and other objects made at run time. It receives { prop, size, factory, object }
   * and adds children to `object` (the placed model, origin at its bottom centre).
   * The stand-in builder is not involved: it builds its own lights.
   */
  registerExtras(name, addExtras) {
    this._extras.set(name, addExtras);
    return this;
  }

  has(name) {
    return this._builders.has(name);
  }

  names() {
    return Array.from(this._builders.keys());
  }

  /**
   * @param {object} prop      a LevelData prop
   * @param {object|null} collider the LevelData collider it is bound to, if any
   * @returns {THREE.Object3D} placed in level space
   */
  create(prop, collider) {
    const colliderSize = collider ? { w: collider.w, h: collider.h, d: collider.d } : null;
    const size = prop.size || colliderSize || DEFAULT_SIZE;
    const builder = this._builders.get(prop.name);
    let object;

    if (this.models && this.models.has(prop.name)) {
      // A model has its own real size; "size" and the collider's size only shape stand-ins.
      object = this.models.instantiate(prop.name, this.emitters);
      object.position.set(prop.x, prop.y, prop.z);
      object.rotation.y = THREE.MathUtils.degToRad(prop.rotY);
      object.scale.setScalar(prop.scale);
      const addExtras = this._extras.get(prop.name);
      if (addExtras) addExtras({ prop, size, factory: this, object });
      object.userData.model = true;
      this.modelCounts.set(prop.name, (this.modelCounts.get(prop.name) || 0) + 1);
    } else if (builder) {
      object = builder({ prop, size, factory: this });
      object.position.set(prop.x, prop.y, prop.z);
      object.rotation.y = THREE.MathUtils.degToRad(prop.rotY);
      object.scale.setScalar(prop.scale);
    } else {
      this.unknownNames.add(prop.name);
      object = this.box(colliderSize || size, 'prop');
      if (collider) {
        // Show exactly what the player collides with: axis-aligned, at the collider.
        object.position.set(collider.x, collider.y, collider.z);
      } else {
        object.position.set(prop.x, prop.y, prop.z);
        object.rotation.y = THREE.MathUtils.degToRad(prop.rotY);
        object.scale.setScalar(prop.scale);
      }
      object.userData.fallback = true;
    }

    object.name = prop.name;
    object.userData.propName = prop.name;
    return object;
  }

  /**
   * The palette's tiling surface for a colour key (greybox.surfaces.<key>), e.g.
   * { "texture": "brick", "metres": [3, 3] }: web/assets/textures/brick.jpg, one tile per
   * 3 x 3 m. Null when textures are off or the key has none.
   */
  surface(colorKey) {
    const surfaces = this.greybox.surfaces;
    const spec = this.texturesUrl && surfaces && surfaces[colorKey];
    return spec && /^[a-z0-9_]+$/.test(spec.texture) ? spec : null;
  }

  /** Shared, cached greybox material for a colour key of the palette's "greybox" section. */
  material(colorKey) {
    let material = this._materials.get(colorKey);
    if (!material && this.surface(colorKey)) {
      material = this._surfaceMaterial(colorKey, this.surface(colorKey));
      this._materials.set(colorKey, material);
    }
    if (!material) {
      let hex = this.greybox[colorKey];
      if (typeof hex !== 'string') {
        // e.g. a chapter's own colour key while the level is viewed with another palette block
        console.warn('[props] palette greybox.' + colorKey + ' is missing; using greybox.prop');
        hex = this.greybox.prop;
      }
      material = new THREE.MeshStandardMaterial({
        color: Palette.color(hex),
        roughness: this.greybox.roughness,
        metalness: 0,
      });
      material.name = 'greybox:' + colorKey;
      this._materials.set(colorKey, material);
    }
    return material;
  }

  /** Box with its origin at the bottom centre. A textured surface tiles at real size. */
  box(size, colorKey) {
    const geometry = new THREE.BoxGeometry(size.w, size.h, size.d);
    geometry.translate(0, size.h / 2, 0);
    const material = this.material(colorKey);
    if (material.userData.metres) PropFactory.tileBoxUVs(geometry, size, material.userData.metres);
    return PropFactory._shadowed(new THREE.Mesh(geometry, material));
  }

  /**
   * Rescales a BoxGeometry's UVs so that its texture repeats every `metres` = [u, v] metres
   * on every face, whatever the box's size (faces: +x, -x, +y, -y, +z, -z; 4 vertices each).
   */
  static tileBoxUVs(geometry, size, metres) {
    const faces = [
      [size.d, size.h], [size.d, size.h],
      [size.w, size.d], [size.w, size.d],
      [size.w, size.h], [size.w, size.h],
    ];
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const [fu, fv] = faces[Math.floor(i / 4)] || [1, 1];
      uv.setXY(i, (uv.getX(i) * fu) / metres[0], (uv.getY(i) * fv) / metres[1]);
    }
    uv.needsUpdate = true;
  }

  /** Resolves when every surface texture requested so far has loaded (or failed). */
  texturesLoaded() {
    return Promise.all(Array.from(this._textures.values(), (entry) => entry.loaded));
  }

  /**
   * A textured material that keeps the palette's brightness: once the texture has loaded,
   * the material is scaled so that its average brightness equals the greybox colour of the
   * same key (so a darker palette or preset still darkens the scene). "tint" (optional)
   * then colours it; "gain" (optional, default 1) brightens or darkens it.
   */
  _surfaceMaterial(colorKey, spec) {
    const base = Palette.color(this.greybox[colorKey] || this.greybox.prop);
    const material = new THREE.MeshStandardMaterial({
      color: base.clone(),
      roughness: spec.roughness === undefined ? this.greybox.roughness : spec.roughness,
      metalness: 0,
    });
    material.name = 'surface:' + colorKey;
    const metres = Array.isArray(spec.metres) ? spec.metres : [spec.metres || 2, spec.metres || 2];
    material.userData.metres = metres;
    material.map = this._texture(
      spec.texture,
      (average) => {
        const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        const factor = (luma(base) / Math.max(0.02, luma(average))) * (spec.gain || 1);
        const tint = spec.tint ? Palette.color(spec.tint) : new THREE.Color(1, 1, 1);
        material.color.setRGB(tint.r * factor, tint.g * factor, tint.b * factor);
      },
      () => {
        // texture missing: fall back to the flat palette colour, still a working level
        material.map = null;
        material.color.copy(base);
        material.needsUpdate = true;
      }
    );
    return material;
  }

  _texture(id, onLoad, onError) {
    let entry = this._textures.get(id);
    if (!entry) {
      entry = { texture: null, average: null, onLoad: [], onError: [] };
      let settle;
      entry.loaded = new Promise((resolve) => (settle = resolve));
      entry.texture = new THREE.TextureLoader().load(
        this.texturesUrl + id + '.jpg',
        (texture) => {
          entry.average = PropFactory._averageColor(texture.image);
          entry.onLoad.forEach((fn) => fn(entry.average));
          settle();
        },
        undefined,
        () => {
          console.warn('[props] texture ' + id + '.jpg did not load; using flat colours');
          entry.onError.forEach((fn) => fn());
          settle();
        }
      );
      entry.texture.encoding = THREE.sRGBEncoding;
      entry.texture.wrapS = entry.texture.wrapT = THREE.RepeatWrapping;
      entry.texture.anisotropy = 8;
      this._textures.set(id, entry);
    }
    if (entry.average) onLoad(entry.average);
    else entry.onLoad.push(onLoad);
    entry.onError.push(onError);
    return entry.texture;
  }

  /** Average colour of an image, in linear RGB (what the material colour multiplies). */
  static _averageColor(image) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) sum[c] += Math.pow(data[i + c] / 255, 2.2);
    }
    const n = data.length / 4;
    return new THREE.Color(sum[0] / n, sum[1] / n, sum[2] / n);
  }

  /**
   * Upright cylinder with its origin at the bottom centre, fitting inside the given size.
   * `taper` is the top radius as a fraction of the bottom radius (1 = straight).
   */
  cylinder(size, colorKey, segments, taper) {
    const radius = Math.min(size.w, size.d) / 2;
    const top = radius * (taper === undefined ? 1 : taper);
    const geometry = new THREE.CylinderGeometry(top, radius, size.h, segments || 12);
    geometry.translate(0, size.h / 2, 0);
    return PropFactory._shadowed(new THREE.Mesh(geometry, this.material(colorKey)));
  }

  /** Box in any material, placed by its bottom centre (for parts of a larger prop). */
  part(material, w, h, d, x, y, z) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    // Self-lit parts neither take nor throw shadows.
    const lit = !material.isMeshBasicMaterial;
    mesh.castShadow = lit;
    mesh.receiveShadow = lit;
    return mesh;
  }

  static _shadowed(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Prop sets announced by web/js/props/*.js, in load order. */
PropFactory.sets = [];
