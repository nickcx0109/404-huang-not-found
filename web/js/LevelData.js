// LevelData: loads web/levels/<name>.json, validates it and exposes a normalised,
// read-only description of a level. Gameplay data only: no meshes, no colours.
// Format reference: web/levels/README.md
import { PLAYER_BODY } from './player/PlayerBody.js';
import { ColliderFootprint } from './level/ColliderFootprint.js';

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const RAD2DEG = 180 / Math.PI;

export class LevelError extends Error {
  constructor(message, problems) {
    super(message);
    this.name = 'LevelError';
    this.problems = problems || [];
  }
}

/** Collects problems while reading untrusted JSON so that all of them are reported at once. */
class Validator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(path, message) {
    this.errors.push(path + ': ' + message);
  }

  warn(path, message) {
    this.warnings.push(path + ': ' + message);
  }

  number(obj, key, path, opts) {
    const o = opts || {};
    const value = obj[key];
    if (value === undefined) {
      if ('fallback' in o) return o.fallback;
      this.error(path + '.' + key, 'is required (number)');
      return 0;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.error(path + '.' + key, 'must be a finite number');
      return 'fallback' in o ? o.fallback : 0;
    }
    if (o.positive && value <= 0) {
      this.error(path + '.' + key, 'must be > 0');
    }
    if (o.min !== undefined && value < o.min) {
      this.error(path + '.' + key, 'must be >= ' + o.min);
    }
    return value;
  }

  vec3(obj, key, path, required) {
    const value = obj[key];
    if (value === undefined) {
      if (required) this.error(path + '.' + key, 'is required ([x, y, z])');
      return null;
    }
    const ok =
      Array.isArray(value) &&
      value.length === 3 &&
      value.every((n) => typeof n === 'number' && Number.isFinite(n));
    if (!ok) {
      this.error(path + '.' + key, 'must be [x, y, z] numbers');
      return null;
    }
    return value.slice();
  }

  array(obj, key, path, required) {
    const value = obj ? obj[key] : undefined;
    if (value === undefined) {
      if (required) this.error(path + '.' + key, 'is required (array)');
      return [];
    }
    if (!Array.isArray(value)) {
      this.error(path + '.' + key, 'must be an array');
      return [];
    }
    return value;
  }

  object(value, path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      this.error(path, 'must be an object');
      return false;
    }
    return true;
  }
}

export class LevelData {
  /**
   * @param {object} raw   parsed level JSON
   * @param {string} [name] file name without extension, used in messages
   * @throws {LevelError} listing every problem found
   */
  constructor(raw, name) {
    const v = new Validator();
    const label = name || (raw && raw.name) || 'level';
    if (!v.object(raw, label)) {
      throw new LevelError('Level "' + label + '" is invalid', v.errors);
    }

    this.name = typeof raw.name === 'string' ? raw.name : label;
    this.title = typeof raw.title === 'string' ? raw.title : this.name;
    /** Name of the block in art/style/palette.json, or null for the default block. */
    this.palette = typeof raw.palette === 'string' ? raw.palette : null;
    /** Asset manifests (art/manifest/<name>.json) whose ready models this level may use. */
    this.manifests = LevelData._readManifests(raw, v);

    this.colliders = LevelData._readColliders(raw, v);
    this._colliderById = new Map(this.colliders.map((c) => [c.id, c]));
    this.props = LevelData._readProps(raw, v, this._colliderById);
    /**
     * What collision uses: one box per collider, in the same order and with the same ids,
     * grown to cover the turned and scaled props bound to it. `colliders` stays as written
     * (the visuals are drawn from it).
     */
    this.collisionBoxes = LevelData._collisionBoxes(this.colliders, this.props);
    this._collisionBoxById = new Map(this.collisionBoxes.map((c) => [c.id, c]));
    this.spawns = LevelData._readSpawns(raw, v);
    this.bookmarks = LevelData._readBookmarks(raw, v);
    this._bookmarkByName = new Map(this.bookmarks.map((b) => [b.name, b]));
    this.markers = LevelData._readMarkers(raw, v);
    /** How the level is won, e.g. { type: 'hold', seconds: 180 }, or null (survive until everyone is down). */
    this.objective = LevelData._readObjective(raw, v);
    this.bounds = LevelData._readBounds(raw, v, this);

    this._checkSpawnsAreFree(v);
    this.warnings = v.warnings;

    if (v.errors.length > 0) {
      throw new LevelError(
        'Level "' + label + '" has ' + v.errors.length + ' problem(s)',
        v.errors
      );
    }
    Object.freeze(this);
  }

  static isValidName(name) {
    return typeof name === 'string' && NAME_PATTERN.test(name);
  }

  /** Fetches and validates <baseUrl><name>.json. */
  static async load(name, baseUrl) {
    if (!LevelData.isValidName(name)) {
      throw new LevelError('Invalid level name "' + name + '" (use letters, digits, - and _)');
    }
    const url = (baseUrl || 'levels/') + name + '.json';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new LevelError('Cannot load ' + url + ' (HTTP ' + res.status + ')');
    }
    let raw;
    try {
      raw = await res.json();
    } catch (err) {
      throw new LevelError(url + ' is not valid JSON: ' + err.message);
    }
    return new LevelData(raw, name);
  }

  collider(id) {
    return this._colliderById.get(id) || null;
  }

  /** The collision box of a collider id (the collider grown to cover its props), or null. */
  collisionBox(id) {
    return this._collisionBoxById.get(id) || null;
  }

  bookmark(name) {
    return this._bookmarkByName.get(name) || null;
  }

  bookmarkNames() {
    return this.bookmarks.map((b) => b.name);
  }

  /** Markers of one type, e.g. markersOfType('objective'). */
  markersOfType(type) {
    return this.markers.filter((m) => m.type === type);
  }

  // ---- readers -----------------------------------------------------------

  static _readColliders(raw, v) {
    const seen = new Set();
    return v.array(raw, 'colliders', 'level', true).map((c, i) => {
      const path = 'colliders[' + i + ']';
      if (!v.object(c, path)) return null;
      const id = c.id === undefined ? 'c' + i : String(c.id);
      if (seen.has(id)) v.error(path + '.id', 'duplicate id "' + id + '"');
      seen.add(id);
      return Object.freeze({
        id,
        x: v.number(c, 'x', path),
        z: v.number(c, 'z', path),
        w: v.number(c, 'w', path, { positive: true }),
        d: v.number(c, 'd', path, { positive: true }),
        h: v.number(c, 'h', path, { positive: true }),
        y: v.number(c, 'y', path, { fallback: 0 }),
        visible: c.visible !== false,
      });
    }).filter(Boolean);
  }

  static _collisionBoxes(colliders, props) {
    const bound = new Map();
    props.forEach((p) => {
      if (!p.collider) return;
      if (!bound.has(p.collider)) bound.set(p.collider, []);
      bound.get(p.collider).push(p);
    });
    return Object.freeze(colliders.map((c) => ColliderFootprint.cover(c, bound.get(c.id) || [])));
  }

  static _readProps(raw, v, colliderById) {
    return v.array(raw, 'props', 'level', true).map((p, i) => {
      const path = 'props[' + i + ']';
      if (!v.object(p, path)) return null;
      if (typeof p.name !== 'string' || p.name === '') {
        v.error(path + '.name', 'is required (string)');
      }
      let collider = null;
      if (p.collider !== undefined && p.collider !== null) {
        collider = colliderById.get(String(p.collider)) || null;
        if (!collider) v.error(path + '.collider', 'unknown collider id "' + p.collider + '"');
      }
      // A prop bound to a collider may omit its position: it then sits on the collider's footprint.
      const anchor = collider || {};
      return Object.freeze({
        name: String(p.name),
        x: v.number(p, 'x', path, collider ? { fallback: anchor.x } : undefined),
        y: v.number(p, 'y', path, { fallback: collider ? anchor.y : 0 }),
        z: v.number(p, 'z', path, collider ? { fallback: anchor.z } : undefined),
        rotY: v.number(p, 'rotY', path, { fallback: 0 }),
        scale: v.number(p, 'scale', path, { fallback: 1, positive: true }),
        size: LevelData._readSize(p, v, path),
        footprint: LevelData._readFootprint(p, v, path),
        collider: collider ? collider.id : null,
      });
    }).filter(Boolean);
  }

  /** Optional visual size [w, h, d] of a prop; null when the level does not give one. */
  static _readSize(p, v, path) {
    const size = v.vec3(p, 'size', path, false);
    if (!size) return null;
    if (size.some((n) => n <= 0)) {
      v.error(path + '.size', 'must be [w, h, d], all > 0');
      return null;
    }
    return Object.freeze({ w: size[0], h: size[1], d: size[2] });
  }

  /**
   * Optional box a prop is really drawn in, in its own space (around its origin, before rotY and
   * scale), for collision only: [w, h, d] (centred, standing on the origin) or
   * { "min": [x, y, z], "max": [x, y, z] } for a stand-in that is not centred on its origin,
   * e.g. one tipped over about an edge. Normalised to { minX, minY, minZ, maxX, maxY, maxZ };
   * null when the level does not give one.
   */
  static _readFootprint(p, v, path) {
    const value = p.footprint;
    if (value === undefined) return null;
    const key = path + '.footprint';
    if (Array.isArray(value)) {
      const size = v.vec3(p, 'footprint', path, false);
      if (!size) return null;
      if (size.some((n) => n <= 0)) {
        v.error(key, 'must be [w, h, d], all > 0');
        return null;
      }
      const [w, h, d] = size;
      return Object.freeze({ minX: -w / 2, minY: 0, minZ: -d / 2, maxX: w / 2, maxY: h, maxZ: d / 2 });
    }
    if (!v.object(value, key)) return null;
    const min = v.vec3(value, 'min', key, true);
    const max = v.vec3(value, 'max', key, true);
    if (!min || !max) return null;
    if (max.some((n, i) => n <= min[i])) {
      v.error(key, 'max must be greater than min on every axis');
      return null;
    }
    return Object.freeze({ minX: min[0], minY: min[1], minZ: min[2], maxX: max[0], maxY: max[1], maxZ: max[2] });
  }

  static _readSpawns(raw, v) {
    const spawns = raw.spawns;
    if (!v.object(spawns, 'spawns')) return Object.freeze({ players: [], zombies: [] });

    const players = v.array(spawns, 'players', 'spawns', true).map((s, i) => {
      const path = 'spawns.players[' + i + ']';
      if (!v.object(s, path)) return null;
      return Object.freeze({
        x: v.number(s, 'x', path),
        z: v.number(s, 'z', path),
        yaw: v.number(s, 'yaw', path, { fallback: 0 }),
      });
    }).filter(Boolean);
    if (players.length === 0) v.error('spawns.players', 'needs at least one player spawn');

    const zombies = v.array(spawns, 'zombies', 'spawns', true).map((s, i) => {
      const path = 'spawns.zombies[' + i + ']';
      if (!v.object(s, path)) return null;
      return Object.freeze({
        id: s.id === undefined ? 'z' + i : String(s.id),
        x: v.number(s, 'x', path),
        z: v.number(s, 'z', path),
        r: v.number(s, 'r', path, { fallback: 1, min: 0 }),
      });
    }).filter(Boolean);

    return Object.freeze({ players: Object.freeze(players), zombies: Object.freeze(zombies) });
  }

  static _readBookmarks(raw, v) {
    const seen = new Set();
    return v.array(raw, 'bookmarks', 'level', true).map((b, i) => {
      const path = 'bookmarks[' + i + ']';
      if (!v.object(b, path)) return null;
      if (typeof b.name !== 'string' || !NAME_PATTERN.test(b.name)) {
        v.error(path + '.name', 'is required (letters, digits, - and _)');
      } else if (seen.has(b.name)) {
        v.error(path + '.name', 'duplicate bookmark "' + b.name + '"');
      }
      seen.add(b.name);

      const pos = v.vec3(b, 'pos', path, true) || [0, 0, 0];
      const lookAt = v.vec3(b, 'lookAt', path, false);
      let yaw = 0;
      let pitch = 0;
      if (lookAt) {
        // Same convention as the player: yaw 0 looks toward -Z, positive yaw turns left.
        const dx = lookAt[0] - pos[0];
        const dy = lookAt[1] - pos[1];
        const dz = lookAt[2] - pos[2];
        const flat = Math.hypot(dx, dz);
        if (flat < 1e-6 && Math.abs(dy) < 1e-6) {
          v.error(path + '.lookAt', 'must differ from pos');
        } else {
          yaw = flat < 1e-6 ? 0 : Math.atan2(-dx, -dz) * RAD2DEG;
          pitch = Math.atan2(dy, flat) * RAD2DEG;
        }
      } else if (b.yaw === undefined) {
        v.error(path, 'needs a direction: either "lookAt": [x, y, z] or "yaw" (+ optional "pitch")');
      } else {
        yaw = v.number(b, 'yaw', path);
        pitch = v.number(b, 'pitch', path, { fallback: 0 });
      }
      return Object.freeze({
        name: String(b.name),
        pos: Object.freeze(pos),
        yaw,
        pitch,
        fov: v.number(b, 'fov', path, { fallback: 0, min: 0 }),
      });
    }).filter(Boolean);
  }

  static _readManifests(raw, v) {
    return v.array(raw, 'manifests', 'level', false).filter((name, i) => {
      const ok = typeof name === 'string' && NAME_PATTERN.test(name);
      if (!ok) v.error('manifests[' + i + ']', 'must be a manifest name such as "common" or "ch2"');
      return ok;
    });
  }

  /** Optional win condition: an object with a `type` string; the other fields are that type's settings. */
  static _readObjective(raw, v) {
    if (raw.objective === undefined || raw.objective === null) return null;
    if (!v.object(raw.objective, 'objective')) return null;
    const { type } = raw.objective;
    if (typeof type !== 'string' || type === '') {
      v.error('objective.type', 'is required (string)');
      return null;
    }
    if (raw.objective.seconds !== undefined) v.number(raw.objective, 'seconds', 'objective', { positive: true });
    return Object.freeze({ ...raw.objective });
  }

  /** Optional named gameplay points: objective, defence posts, pickups ... */
  static _readMarkers(raw, v) {
    const seen = new Set();
    return v.array(raw, 'markers', 'level', false).map((m, i) => {
      const path = 'markers[' + i + ']';
      if (!v.object(m, path)) return null;
      if (typeof m.type !== 'string' || m.type === '') v.error(path + '.type', 'is required (string)');
      const id = m.id === undefined ? 'm' + i : String(m.id);
      if (seen.has(id)) v.error(path + '.id', 'duplicate id "' + id + '"');
      seen.add(id);
      // What the marker hands out, e.g. the weapon of a "weapon" marker. Optional; null when absent.
      let item = null;
      if (m.item !== undefined) {
        if (typeof m.item === 'string' && NAME_PATTERN.test(m.item)) item = m.item;
        else v.error(path + '.item', 'must be a name such as "rifle"');
      }
      return Object.freeze({
        id,
        type: String(m.type),
        item,
        x: v.number(m, 'x', path),
        z: v.number(m, 'z', path),
        r: v.number(m, 'r', path, { fallback: 1, min: 0 }),
        yaw: v.number(m, 'yaw', path, { fallback: 0 }),
      });
    }).filter(Boolean);
  }

  /** Playable rectangle. If the level does not give one, it is the extent of everything (with the
   * collision boxes, not the colliders as written) + 2 m. */
  static _readBounds(raw, v, level) {
    if (raw.bounds !== undefined) {
      if (v.object(raw.bounds, 'bounds')) {
        return Object.freeze({
          x: v.number(raw.bounds, 'x', 'bounds', { fallback: 0 }),
          z: v.number(raw.bounds, 'z', 'bounds', { fallback: 0 }),
          w: v.number(raw.bounds, 'w', 'bounds', { positive: true }),
          d: v.number(raw.bounds, 'd', 'bounds', { positive: true }),
        });
      }
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const grow = (x, z, hw, hd) => {
      minX = Math.min(minX, x - hw);
      maxX = Math.max(maxX, x + hw);
      minZ = Math.min(minZ, z - hd);
      maxZ = Math.max(maxZ, z + hd);
    };
    level.collisionBoxes.forEach((c) => grow(c.x, c.z, c.w / 2, c.d / 2));
    level.spawns.players.forEach((s) => grow(s.x, s.z, 0, 0));
    level.spawns.zombies.forEach((s) => grow(s.x, s.z, s.r, s.r));
    if (!Number.isFinite(minX)) grow(0, 0, 10, 10);
    const margin = 2;
    return Object.freeze({
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      w: maxX - minX + margin * 2,
      d: maxZ - minZ + margin * 2,
    });
  }

  _checkSpawnsAreFree(v) {
    const inside = (spawn, collider) => {
      if (collider.y >= PLAYER_BODY.height || collider.y + collider.h <= 0) return false;
      const dx = Math.max(0, Math.abs(spawn.x - collider.x) - collider.w / 2);
      const dz = Math.max(0, Math.abs(spawn.z - collider.z) - collider.d / 2);
      return dx * dx + dz * dz < PLAYER_BODY.radius * PLAYER_BODY.radius;
    };
    const check = (list, path) =>
      list.forEach((s, i) => {
        const hit = this.collisionBoxes.find((c) => inside(s, c));
        if (hit) v.warn(path + '[' + i + ']', 'is inside collider "' + hit.id + '"');
      });
    check(this.spawns.players, 'spawns.players');
    check(this.spawns.zombies, 'spawns.zombies');
    check(this.markers, 'markers');
  }
}
