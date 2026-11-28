// LevelFlow: moving between the levels of one chapter, e.g. the floors of a building.
//
// A level marks its ways out with markers of type "exit" whose id is "to_<level name>".
// Standing in one loads that level, and the player arrives at the other level's exit that
// points back ("to_<this level>").
//
// A way out can start blocked. While the collision world holds a box whose id is
// "block_<marker id>", that exit does nothing; the player clears the block by holding the
// interact key next to it for a few seconds. What was cleared is remembered in `store`, so
// it stays cleared when the player comes back to the level.
//
// Pure logic: no DOM, no rendering. installLevelFlow.js connects it to the page.
export class LevelFlow {
  static EXIT_TYPE = 'exit';
  static EXIT_PREFIX = 'to_';
  static BLOCK_PREFIX = 'block_';

  /**
   * @param {object} parts
   * @param {{name: string, markersOfType: (type: string) => object[]}} parts.level
   * @param {CollisionWorld} parts.collision  blocks are removed from its `boxes`
   * @param {{x: number, z: number, spawnAt: (spawn: object) => void}} parts.player
   * @param {(target: string, from: string) => void} parts.navigate  loads another level
   * @param {{has: (key: string) => boolean, add: (key: string) => void}} [parts.store]
   * @param {number} [parts.clearSeconds]  how long the interact key must be held
   * @param {boolean} [parts.requireInteract] online exits require held E; local exits remain automatic
   * @param {number} [parts.reach]  how close to a block the player must stand, in metres
   */
  constructor({ level, collision, player, navigate, store = new Set(), clearSeconds = 2.5, reach = 1.6, requireInteract = false }) {
    this.level = level;
    this.collision = collision;
    this.player = player;
    this.navigate = navigate;
    this.store = store;
    this.clearSeconds = clearSeconds;
    this.reach = reach;
    this.requireInteract = requireInteract;
    /** Called with the removed box whenever a block is cleared, also for remembered ones. */
    this.onCleared = null;

    this.exits = level
      .markersOfType(LevelFlow.EXIT_TYPE)
      .filter((marker) => marker.id.startsWith(LevelFlow.EXIT_PREFIX))
      .map((marker) => ({ marker, target: marker.id.slice(LevelFlow.EXIT_PREFIX.length), armed: true }));
    /** Exit marker id -> the box that blocks it. */
    this.blocks = new Map();
    /** Boxes that were already cleared on an earlier visit; their visuals still need hiding. */
    this.remembered = [];
    for (const exit of this.exits) {
      const box = collision.boxes.find((candidate) => candidate.id === LevelFlow.BLOCK_PREFIX + exit.marker.id);
      if (!box) continue;
      if (store.has(this._key(exit.marker.id))) {
        this._remove(box);
        this.remembered.push(box);
      } else {
        this.blocks.set(exit.marker.id, box);
      }
    }

    this._focus = null;
    this._held = 0;
    this._leaving = false;
    this._disarmWherePlayerStands();
  }

  /**
   * Puts the player where someone coming from `fromLevel` arrives: at the exit that leads
   * back there, facing the marker's yaw. Returns false when this level has no such exit.
   */
  arriveFrom(fromLevel) {
    const exit = this.exits.find((candidate) => candidate.target === fromLevel);
    if (!exit) return false;
    this.player.spawnAt({ x: exit.marker.x, z: exit.marker.z, yaw: exit.marker.yaw });
    this._disarmWherePlayerStands();
    return true;
  }

  /**
   * Advances by dt seconds. `holding` is whether the interact key is down.
   * @returns {{exitId: string, progress: number}|null} the block the player can clear right
   *   now and how far along they are (0..1), for a prompt; null when there is none
   */
  /** Cancels held progress while a higher priority interaction owns E. */
  cancelInteraction() { this._held = 0; this._focus = null; }

  update(dt, holding) {
    if (this._leaving) return null;

    for (const exit of this.exits) {
      const inside = this._distanceTo(exit.marker) <= exit.marker.r;
      // An exit the player arrived in, or stood in while it was blocked, only works after
      // they have stepped out of it once.
      if (!inside) {
        exit.armed = true;
      } else if (exit.armed && (!this.requireInteract || holding) && !this.blocks.has(exit.marker.id)) {
        this._leaving = true;
        this.navigate(exit.target, this.level.name);
        return null;
      }
    }

    const focus = this._nearestBlock();
    if (focus !== this._focus) this._held = 0;
    this._focus = focus;
    if (!focus) return null;

    this._held = holding ? this._held + dt : 0;
    if (this._held >= this.clearSeconds) {
      this.clear(focus);
      return null;
    }
    return { exitId: focus, progress: this._held / this.clearSeconds };
  }

  /** Removes the block of an exit for good. Returns false when that exit is not blocked. */
  clear(exitId) {
    const box = this.blocks.get(exitId);
    if (!box) return false;
    this.blocks.delete(exitId);
    this.store.add(this._key(exitId));
    this._remove(box);
    this._focus = null;
    this._held = 0;
    // The player is usually standing in the exit they just opened; make them step in again.
    this._disarmWherePlayerStands();
    if (this.onCleared) this.onCleared(box);
    return true;
  }

  /** A refused room transition may be retried after stepping out and back in. */
  cancelDeparture() {
    this._leaving = false;
    this._disarmWherePlayerStands();
  }

  isBlocked(exitId) {
    return this.blocks.has(exitId);
  }

  _key(exitId) {
    return this.level.name + ':' + exitId;
  }

  _remove(box) {
    const index = this.collision.boxes.indexOf(box);
    if (index >= 0) this.collision.boxes.splice(index, 1);
  }

  _disarmWherePlayerStands() {
    for (const exit of this.exits) {
      if (this._distanceTo(exit.marker) <= exit.marker.r) exit.armed = false;
    }
  }

  _distanceTo(point) {
    return Math.hypot(this.player.x - point.x, this.player.z - point.z);
  }

  /** Exit id of the closest block within reach, or null. */
  _nearestBlock() {
    let best = null;
    let bestDistance = this.reach;
    for (const [exitId, box] of this.blocks) {
      const dx = Math.max(box.minX - this.player.x, 0, this.player.x - box.maxX);
      const dz = Math.max(box.minZ - this.player.z, 0, this.player.z - box.maxZ);
      const distance = Math.hypot(dx, dz);
      if (distance <= bestDistance) {
        best = exitId;
        bestDistance = distance;
      }
    }
    return best;
  }
}
