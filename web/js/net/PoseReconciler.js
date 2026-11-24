/**
 * Keeps the locally predicted player where the server has them.
 *
 * The browser walks its own player every frame and sends the pose with an increasing `seq`;
 * each snapshot says, in `ack`, the last `seq` the server took and where the player stands
 * after it. Comparing that with the pose this client sent at the same `seq` cancels out the
 * travel time, so running is never mistaken for a disagreement. When they differ by more than
 * `threshold` metres (a wall the browser walked through, a move the server cut short, being
 * rooted), the client moves by the difference and keeps what it walked since.
 *
 * After a correction the poses already sent are wrong, so nothing is compared until the
 * server has acknowledged a pose sent after it.
 */
export class PoseReconciler {
  constructor({ threshold = 1, keep = 90 } = {}) {
    this.threshold = threshold;
    this.keep = keep;
    this.history = [];
    this.placed = false;
    this._afterSeq = -Infinity;
  }

  /** Remembers the pose that went out with `seq`. */
  record(seq, { x, y, z }) {
    if (!Number.isFinite(seq) || seq <= this._afterSeq) return;
    this.history.push({ seq, x, y, z });
    if (this.history.length > this.keep) this.history.shift();
  }

  /**
   * Checks one snapshot.
   * @param {{x: number, y: number, z: number}} server  the player in the snapshot
   * @param {number} ack  the snapshot's ack
   * @param {{x: number, y: number, z: number}} current  where the browser has the player now
   * @param {number} lastSeq  the newest seq sent so far
   * @returns {{x: number, y: number, z: number, first: boolean}|null}  metres to move by, or null
   */
  reconcile(server, ack, current, lastSeq) {
    if (!this.placed) {
      // The first snapshot puts the player on their spawn, whatever the browser had.
      this.placed = true;
      return this._correct({ x: server.x - current.x, y: server.y - current.y, z: server.z - current.z }, lastSeq, true);
    }
    while (this.history.length > 0 && this.history[0].seq < ack) this.history.shift();
    const sent = this.history[0];
    if (!sent || sent.seq !== ack) return null;
    const dx = server.x - sent.x;
    const dz = server.z - sent.z;
    if (Math.hypot(dx, dz) <= this.threshold) return null;
    return this._correct({ x: dx, y: 0, z: dz }, lastSeq, false);
  }

  /** Forgets everything: the next snapshot places the player again (a new game). */
  reset() {
    this.history.length = 0;
    this.placed = false;
    this._afterSeq = -Infinity;
  }

  _correct(offset, lastSeq, first) {
    this.history.length = 0;
    this._afterSeq = Number.isFinite(lastSeq) ? lastSeq : -Infinity;
    return { ...offset, first };
  }
}
