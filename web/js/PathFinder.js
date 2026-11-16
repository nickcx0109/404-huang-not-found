// PathFinder: shortest walkable route between two points of a CollisionWorld, on a coarse grid.
// Used to check a greybox ("can the players reach every cover? can the zombies reach the
// players?") and to stand dummies on the zombies' routes. It is a level-checking aid, not the
// in-game zombie navigation (that is the enemy module's flow field).
import { PLAYER_BODY } from './player/PlayerBody.js';

const UNKNOWN = 0;
const FREE = 1;
const BLOCKED = 2;
// 8 neighbours: dx, dz, cost
const STEPS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export class PathFinder {
  /**
   * @param {CollisionWorld} collision  must have bounds
   * @param {{cell?:number, radius?:number, height?:number}} [options]
   *   cell: grid spacing in metres; radius / height: the walker's collision column
   */
  constructor(collision, options) {
    const o = options || {};
    this.collision = collision;
    this.cell = o.cell || 0.5;
    this.radius = o.radius || PLAYER_BODY.radius;
    this.height = o.height || PLAYER_BODY.height;
    this.clearanceRadius = this.radius + (o.clearance ?? 0);
    const b = collision.bounds;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.cols = Math.max(1, Math.floor((b.maxX - b.minX) / this.cell));
    this.rows = Math.max(1, Math.floor((b.maxZ - b.minZ) / this.cell));
    this._state = new Uint8Array(this.cols * this.rows);
    this._routeQueue = null;
    this._routeFrom = null;
  }

  createRoute() {
    const count = this.cols * this.rows;
    this._routeQueue ??= new Int32Array(count);
    this._routeFrom ??= new Int32Array(count);
    return { points: new Float64Array(count * 2), length: 0 };
  }

  findPathInto(x0, z0, x1, z1, route) {
    route.length = 0;
    const start = this._nearestFree(x0, z0);
    const goal = this._nearestFree(x1, z1);
    if (start < 0 || goal < 0) return false;
    const from = this._routeFrom;
    const queue = this._routeQueue;
    from.fill(-1);
    from[start] = start;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    while (head < tail && from[goal] === -1) {
      const current = queue[head++];
      const col = current % this.cols;
      const row = (current - col) / this.cols;
      for (const step of STEPS) {
        const dc = step[0];
        const dr = step[1];
        if (!this._free(col + dc, row + dr)) continue;
        if (dc && dr && (!this._free(col + dc, row) || !this._free(col, row + dr))) continue;
        const next = (row + dr) * this.cols + col + dc;
        if (from[next] !== -1) continue;
        from[next] = current;
        queue[tail++] = next;
      }
    }
    if (from[goal] === -1) return false;
    for (let current = goal; ; current = from[current]) {
      const col = current % this.cols;
      const row = (current - col) / this.cols;
      const offset = route.length++ * 2;
      route.points[offset] = this.minX + (col + 0.5) * this.cell;
      route.points[offset + 1] = this.minZ + (row + 0.5) * this.cell;
      if (current === start) break;
    }
    for (let index = 0; index < Math.floor(route.length / 2); index++) {
      const other = route.length - index - 1;
      for (let axis = 0; axis < 2; axis++) {
        const value = route.points[index * 2 + axis];
        route.points[index * 2 + axis] = route.points[other * 2 + axis];
        route.points[other * 2 + axis] = value;
      }
    }
    return true;
  }

  /**
   * @returns {Array<{x:number, z:number}>|null} points from start to goal, or null when the
   *   goal cannot be reached. Start and goal snap to the nearest free cell (within 1.5 m).
   */
  findPath(x0, z0, x1, z1) {
    const start = this._nearestFree(x0, z0);
    const goal = this._nearestFree(x1, z1);
    if (start < 0 || goal < 0) return null;

    // Dijkstra with a simple array-backed queue; the grids here are a few 10,000 cells.
    const count = this.cols * this.rows;
    const cost = new Float32Array(count).fill(Infinity);
    const from = new Int32Array(count).fill(-1);
    const open = [start];
    cost[start] = 0;
    while (open.length > 0) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[best]]) best = i;
      const current = open.splice(best, 1)[0];
      if (current === goal) break;
      const col = current % this.cols;
      const row = (current - col) / this.cols;
      for (let s = 0; s < STEPS.length; s++) {
        const dc = STEPS[s][0];
        const dr = STEPS[s][1];
        if (!this._free(col + dc, row + dr)) continue;
        // no squeezing diagonally between two blocked cells
        if (dc !== 0 && dr !== 0 && (!this._free(col + dc, row) || !this._free(col, row + dr))) continue;
        const next = (row + dr) * this.cols + col + dc;
        const total = cost[current] + STEPS[s][2];
        if (total < cost[next]) {
          if (cost[next] === Infinity) open.push(next);
          cost[next] = total;
          from[next] = current;
        }
      }
    }
    if (cost[goal] === Infinity) return null;

    const path = [];
    for (let cellIndex = goal; cellIndex >= 0; cellIndex = from[cellIndex]) {
      path.push(this._centre(cellIndex));
    }
    return path.reverse();
  }

  /** Length of a path in metres. */
  static pathLength(path) {
    let length = 0;
    for (let i = 1; i < path.length; i++) {
      length += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    }
    return length;
  }

  /** Point at `fraction` (0..1) of the way along a path, with the direction of travel. */
  static pointAlong(path, fraction) {
    const target = PathFinder.pathLength(path) * Math.min(1, Math.max(0, fraction));
    let walked = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const step = Math.hypot(b.x - a.x, b.z - a.z);
      if (walked + step >= target && step > 0) {
        const t = (target - walked) / step;
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: b.x - a.x, dz: b.z - a.z };
      }
      walked += step;
    }
    const last = path[path.length - 1];
    return { x: last.x, z: last.z, dx: 0, dz: 1 };
  }

  // ---- grid ------------------------------------------------------------------

  _centre(index) {
    const col = index % this.cols;
    const row = (index - col) / this.cols;
    return { x: this.minX + (col + 0.5) * this.cell, z: this.minZ + (row + 0.5) * this.cell };
  }

  _free(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    const index = row * this.cols + col;
    if (this._state[index] === UNKNOWN) {
      const x = this.minX + (col + 0.5) * this.cell;
      const z = this.minZ + (row + 0.5) * this.cell;
      const b = this.collision.bounds;
      const inside =
        x - this.clearanceRadius >= b.minX && x + this.clearanceRadius <= b.maxX &&
        z - this.clearanceRadius >= b.minZ && z + this.clearanceRadius <= b.maxZ;
      const hit = !inside || this.collision.hit(x, z, this.clearanceRadius, 0, this.height);
      this._state[index] = hit ? BLOCKED : FREE;
    }
    return this._state[index] === FREE;
  }

  _nearestFree(x, z) {
    const col = Math.floor((x - this.minX) / this.cell);
    const row = Math.floor((z - this.minZ) / this.cell);
    const reach = Math.ceil(1.5 / this.cell);
    let best = -1;
    let bestDistance = Infinity;
    for (let dr = -reach; dr <= reach; dr++) {
      for (let dc = -reach; dc <= reach; dc++) {
        if (!this._free(col + dc, row + dr)) continue;
        const centreX = this.minX + (col + dc + 0.5) * this.cell;
        const centreZ = this.minZ + (row + dr + 0.5) * this.cell;
        const distance = Math.hypot(centreX - x, centreZ - z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = (row + dr) * this.cols + col + dc;
        }
      }
    }
    return best;
  }
}
