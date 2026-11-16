import * as THREE from 'three';
import { CollisionWorld, Aabb } from './CollisionWorld.js';
import { StaticBatcher } from './StaticBatcher.js';
import { ModelInstancer } from './ModelInstancer.js';
import { PathFinder } from './PathFinder.js';
import { Palette } from './Palette.js';

// SceneBuilder: LevelData -> collision world + visuals.
// Collision is built only from level.colliders. Visuals come from PropFactory and can be
// swapped (grey boxes today, models later) without changing a single collider.
const GRID_TEXTURE_SIZE = 64; // px per 1 m ground cell
// The ground is drawn this far beyond the playable bounds, so that in open levels its edge
// lies behind the fog instead of showing up as a horizon line.
const GROUND_MARGIN = 60;
// Stand-in figures for ?dummies=1: how far along the route from a zombie spawn to the players.
const DUMMY_STEPS = [0.15, 0.4, 0.65];
const DUMMY_SIZE = Object.freeze({ w: 0.55, h: 1.75, d: 0.35 });

export class BuiltLevel {
  constructor(level) {
    this.level = level;
    /** @type {CollisionWorld} */
    this.collision = null;
    /** Everything visible that belongs to the level. */
    this.root = new THREE.Group();
    this.root.name = 'level:' + level.name;
    /** Debug helpers (spawns, markers, bookmarks, collider outlines). Null unless requested. */
    this.debug = null;
    /** Human-sized stand-ins on the zombies' routes, to judge visibility. Null unless requested. */
    this.dummies = null;
    /** @type {Emitters} animated lights and glowing materials of the props */
    this.emitters = null;
    this.unknownProps = [];
    this.meshCount = { before: 0, after: 0 };
    /** Props drawn with a GLB model: name -> how many. */
    this.modelProps = new Map();
    /** Result of ModelInstancer: instanced meshes created and the meshes they replace. */
    this.instanced = { parts: 0, instances: 0 };
  }

  /** Per-frame update of animated props (sign flicker, rotating beacons). */
  update(time) {
    if (this.emitters) this.emitters.update(time);
  }
}

export class SceneBuilder {
  /**
   * @param {PropFactory} propFactory
   * @param {object} greybox  the "greybox" section of the resolved palette style
   */
  constructor(propFactory, greybox) {
    this.props = propFactory;
    this.greybox = greybox;
  }

  /**
   * @param {LevelData} level
   * @param {{debug?:boolean, dummies?:boolean}} [options]
   * @returns {BuiltLevel}
   */
  build(level, options) {
    const built = new BuiltLevel(level);
    built.collision = this.buildCollision(level);
    this.buildVisuals(level, built);
    built.emitters = this.props.emitters;
    if (options && options.debug) {
      built.debug = this.buildDebugHelpers(level);
    }
    if (options && options.dummies) {
      built.dummies = this.buildDummies(level, built.collision);
    }
    return built;
  }

  // ---- gameplay ------------------------------------------------------------

  buildCollision(level) {
    return CollisionWorld.fromLevel(level);
  }

  // ---- visuals -------------------------------------------------------------

  buildVisuals(level, built) {
    const root = built.root;
    root.add(this._ground(level));

    // Colliders that a prop stands for are drawn by that prop; the rest are plain grey boxes.
    const owned = new Set(level.props.map((p) => p.collider).filter(Boolean));
    level.colliders.forEach((c) => {
      if (owned.has(c.id) || !c.visible) return;
      const box = this.props.box({ w: c.w, h: c.h, d: c.d }, 'collider');
      box.position.set(c.x, c.y, c.z);
      box.name = 'collider:' + c.id;
      root.add(box);
    });

    level.props.forEach((p) => {
      root.add(this.props.create(p, p.collider ? level.collider(p.collider) : null));
    });

    built.unknownProps = Array.from(this.props.unknownNames);
    built.modelProps = new Map(this.props.modelCounts);
    built.meshCount = StaticBatcher.merge(root);
    built.instanced = ModelInstancer.instance(root);
  }

  _ground(level) {
    const b = level.bounds;
    const width = b.w + GROUND_MARGIN * 2;
    const depth = b.d + GROUND_MARGIN * 2;
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    if (this.props.surface('ground')) {
      // A real road surface (palette greybox.surfaces.ground) instead of the 1 m grid.
      const material = this.props.material('ground');
      const [mu, mv] = material.userData.metres;
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * width) / mu, (uv.getY(i) * depth) / mv);
      const ground = new THREE.Mesh(geometry, material);
      ground.position.set(b.x, 0, b.z);
      ground.receiveShadow = true;
      ground.name = 'ground';
      return ground;
    }
    const texture = this._gridTexture();
    texture.repeat.set(width, depth);
    // Shift the texture so that grid lines fall on whole metres of level space.
    const fraction = (n) => n - Math.floor(n);
    texture.offset.set(fraction(b.x - width / 2), -fraction(b.z + depth / 2));
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      // A wet road is smoother than the props standing on it.
      roughness:
        this.greybox.groundRoughness === undefined
          ? this.greybox.roughness
          : this.greybox.groundRoughness,
      metalness: 0,
    });
    material.name = 'greybox:ground';
    const ground = new THREE.Mesh(geometry, material);
    ground.position.set(b.x, 0, b.z);
    ground.receiveShadow = true;
    ground.name = 'ground';
    return ground;
  }

  /** 1 m grid so that scale and movement can be read on an otherwise flat grey floor. */
  _gridTexture() {
    const size = GRID_TEXTURE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = this.greybox.ground;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = this.greybox.grid;
    ctx.fillRect(0, 0, size, 2);
    ctx.fillRect(0, 0, 2, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  }

  // ---- debug ---------------------------------------------------------------

  /**
   * Zombie-sized boxes on the walking route from each zombie spawn to the players, so a
   * screenshot shows whether an enemy would be visible there in the current atmosphere.
   */
  buildDummies(level, collision) {
    const group = new THREE.Group();
    group.name = 'dummies';
    const finder = new PathFinder(collision);
    const target = level.spawns.players[0];
    level.spawns.zombies.forEach((spawn) => {
      const path = finder.findPath(spawn.x, spawn.z, target.x, target.z);
      if (!path) return;
      DUMMY_STEPS.forEach((fraction) => {
        const at = PathFinder.pointAlong(path, fraction);
        const dummy = this.props.box(DUMMY_SIZE, 'dummy');
        dummy.position.set(at.x, 0, at.z);
        dummy.rotation.y = Math.atan2(at.dx, at.dz);
        group.add(dummy);
      });
    });
    StaticBatcher.merge(group);
    return group;
  }

  /** Spawn points, bookmarks and the outline of every collider (including invisible ones). */
  buildDebugHelpers(level) {
    const markers = this.greybox.markers;
    const group = new THREE.Group();
    group.name = 'debug';
    const glow = (hex) =>
      new THREE.MeshBasicMaterial({
        color: Palette.color(hex).multiplyScalar(markers.intensity),
      });

    const playerMaterial = glow(markers.playerSpawn);
    level.spawns.players.forEach((s) => {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 3), playerMaterial);
      arrow.rotation.order = 'YXZ';
      arrow.rotation.set(-Math.PI / 2, THREE.MathUtils.degToRad(s.yaw), 0);
      arrow.scale.set(1, 1, 0.15);
      arrow.position.set(s.x, 0.05, s.z);
      group.add(arrow);
    });

    const zombieMaterial = glow(markers.zombieSpawn);
    level.spawns.zombies.forEach((s) => {
      const r = Math.max(s.r, 0.3);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r, 24), zombieMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, 0.05, s.z);
      group.add(ring);
    });

    const markerMaterial = glow(markers.marker);
    level.markers.forEach((m) => {
      const r = Math.max(m.r, 0.3);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 4), markerMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.position.set(m.x, 0.05, m.z);
      group.add(ring);
    });

    const bookmarkMaterial = glow(markers.bookmark);
    level.bookmarks.forEach((b) => {
      const dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), bookmarkMaterial);
      dot.position.fromArray(b.pos);
      group.add(dot);
    });

    group.add(this._colliderOutlines(level, bookmarkMaterial.color));
    group.traverse((o) => {
      o.userData.dynamic = true;
    });
    return group;
  }

  _colliderOutlines(level, color) {
    const points = [];
    const edges = [
      [0, 1], [1, 3], [3, 2], [2, 0],
      [4, 5], [5, 7], [7, 6], [6, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    level.colliders.forEach((c) => {
      const box = Aabb.fromCollider(c);
      const corner = (i) => [
        i & 1 ? box.maxX : box.minX,
        i & 4 ? box.maxY : box.minY,
        i & 2 ? box.maxZ : box.minZ,
      ];
      edges.forEach((e) => points.push(...corner(e[0]), ...corner(e[1])));
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
    lines.name = 'collider-outlines';
    return lines;
  }
}
