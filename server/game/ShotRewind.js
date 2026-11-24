/**
 * Shot rewind (docs/tech/NETWORK.md, 手感 3): for the length of one synchronous call, puts every
 * enemy back where the shooter saw it — the client draws others 100 ms in the past, so that is
 * `at − 100 ms` — then restores the live positions. Never rewinds more than 250 ms behind the
 * server, and never into the future.
 */
export class ShotRewind {
  /**
   * @param {import('./EnemyHistory.js').EnemyHistory} history
   * @param {{viewDelayMs?: number, maxRewindMs?: number}} [options]
   */
  constructor(history, { viewDelayMs = 100, maxRewindMs = 250 } = {}) {
    this.history = history;
    this.viewDelayMs = viewDelayMs;
    this.maxRewindMs = maxRewindMs;
    this._saved = [];
    this._past = { x: 0, y: 0, z: 0 };
  }

  /** The server time (ms) a shot sent with client estimate `at` is judged at, when the server clock reads `now`. */
  targetTime(at, now) {
    return Math.min(Math.max(at - this.viewDelayMs, now - this.maxRewindMs), now);
  }

  /** Runs `judge()` with the enemies at their positions of `targetTime(at, now)`; returns what judge returns. */
  run(enemies, at, now, judge) {
    const time = this.targetTime(at, now);
    const saved = this._saved;
    saved.length = 0;
    for (const enemy of enemies) {
      const past = this.history.positionAt(enemy.id, time, this._past);
      if (!past) continue;
      const { x, y, z } = enemy.position;
      saved.push(enemy, x, y, z);
      this.place(enemy, past.x, past.y, past.z);
    }
    try {
      return judge();
    } finally {
      for (let index = 0; index < saved.length; index += 4) {
        this.place(saved[index], saved[index + 1], saved[index + 2], saved[index + 3]);
      }
      saved.length = 0;
    }
  }

  /** Moves an enemy and its hit volume (Enemy#syncView) without simulating it. */
  place(enemy, x, y, z) {
    enemy.position.x = x;
    enemy.position.y = y;
    enemy.position.z = z;
    enemy.syncView();
  }
}
