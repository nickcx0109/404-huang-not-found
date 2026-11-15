// SceneBuilder: LevelData -> collision world + visuals.
// Collision is built only from level.colliders. Visuals come from PropFactory and can be
// swapped (grey boxes today, models later) without changing a single collider.
(function (Game) {
  'use strict';

  const GRID_TEXTURE_SIZE = 64; // px per 1 m ground cell

  class BuiltLevel {
    constructor(level) {
      this.level = level;
      /** @type {Game.CollisionWorld} */
      this.collision = null;
      /** Everything visible that belongs to the level. */
      this.root = new THREE.Group();
      this.root.name = 'level:' + level.name;
      /** Debug helpers (spawns, bookmarks, collider outlines). Null unless requested. */
      this.debug = null;
      this.unknownProps = [];
      this.meshCount = { before: 0, after: 0 };
    }
  }

  class SceneBuilder {
    /**
     * @param {Game.PropFactory} propFactory
     * @param {object} greybox  the "greybox" section of the resolved palette style
     */
    constructor(propFactory, greybox) {
      this.props = propFactory;
      this.greybox = greybox;
    }

    /**
     * @param {Game.LevelData} level
     * @param {{debug?:boolean}} [options]
     * @returns {BuiltLevel}
     */
    build(level, options) {
      const built = new BuiltLevel(level);
      built.collision = this.buildCollision(level);
      this.buildVisuals(level, built);
      if (options && options.debug) {
        built.debug = this.buildDebugHelpers(level);
      }
      return built;
    }

    // ---- gameplay ------------------------------------------------------------

    buildCollision(level) {
      return Game.CollisionWorld.fromLevel(level);
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
      built.meshCount = Game.StaticBatcher.merge(root);
    }

    _ground(level) {
      const b = level.bounds;
      const geometry = new THREE.PlaneGeometry(b.w, b.d);
      geometry.rotateX(-Math.PI / 2);
      const texture = this._gridTexture();
      texture.repeat.set(b.w, b.d);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: this.greybox.roughness,
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

    /** Spawn points, bookmarks and the outline of every collider (including invisible ones). */
    buildDebugHelpers(level) {
      const markers = this.greybox.markers;
      const group = new THREE.Group();
      group.name = 'debug';
      const glow = (hex) =>
        new THREE.MeshBasicMaterial({
          color: Game.Palette.color(hex).multiplyScalar(markers.intensity),
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
        const box = Game.Aabb.fromCollider(c);
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

  Game.SceneBuilder = SceneBuilder;
  Game.BuiltLevel = BuiltLevel;
})((window.Game = window.Game || {}));
