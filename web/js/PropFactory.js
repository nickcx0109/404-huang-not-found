// PropFactory: prop name -> mesh. Visuals only; it never creates or changes collision.
// A name with no registered builder falls back to a grey box the size of the prop's collider,
// so a level stays playable while its art is still missing.
(function (Game) {
  'use strict';

  const DEFAULT_SIZE = Object.freeze({ w: 1, h: 1, d: 1 });

  class PropFactory {
    /** @param {object} style  resolved palette style */
    constructor(style) {
      this.greybox = style.greybox;
      /** Glowing materials and small coloured lights (accent, alarm, screens). */
      this.emitters = new Game.Emitters(style);
      this._builders = new Map();
      this._materials = new Map();
      /** Prop names that had no builder and were replaced by a fallback box. */
      this.unknownNames = new Set();
    }

    /**
     * Registers a builder. It receives { prop, size, factory } and returns an Object3D
     * modelled around the origin: metres, +Y up, front toward -Z, origin at bottom centre.
     * `size` is the prop's own "size" if the level gives one, else the bound collider's
     * {w, h, d}, else a 1 m cube.
     */
    register(name, builder) {
      this._builders.set(name, builder);
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

      if (builder) {
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

    /** Shared, cached greybox material for a colour key of the palette's "greybox" section. */
    material(colorKey) {
      let material = this._materials.get(colorKey);
      if (!material) {
        const hex = this.greybox[colorKey];
        if (typeof hex !== 'string') {
          throw new Error('palette greybox.' + colorKey + ' is missing');
        }
        material = new THREE.MeshStandardMaterial({
          color: Game.Palette.color(hex),
          roughness: this.greybox.roughness,
          metalness: 0,
        });
        material.name = 'greybox:' + colorKey;
        this._materials.set(colorKey, material);
      }
      return material;
    }

    /** Box with its origin at the bottom centre. */
    box(size, colorKey) {
      const geometry = new THREE.BoxGeometry(size.w, size.h, size.d);
      geometry.translate(0, size.h / 2, 0);
      return PropFactory._shadowed(new THREE.Mesh(geometry, this.material(colorKey)));
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

  Game.PropFactory = PropFactory;
})((window.Game = window.Game || {}));
