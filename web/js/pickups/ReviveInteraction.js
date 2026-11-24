/** DOM-free held interaction. Release, lost range, or incapacity resets all progress. */
export class ReviveInteraction {
  constructor(players, { radius = 2, seconds = 3, health = 40, canReach = () => true } = {}) {
    if (![radius, seconds, health].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('Invalid revive tuning');
    this.players = players;
    this.radius = radius;
    this.seconds = seconds;
    this.health = health;
    /** (rescuer, downed) => boolean; e.g. LineOfSight#clear so walls block a rescue. */
    this.canReach = canReach;
    this.held = new Set();
    this.tasks = new Map();
  }

  targetFor(player) {
    if (!player?.damageable.alive || player.downed) return null;
    let target = null, distance = this.radius;
    for (const mate of this.players) {
      if (mate === player || !mate.downed) continue;
      const next = Math.hypot(mate.position.x - player.position.x, mate.position.z - player.position.z);
      if (next <= distance && this.canReach(player, mate)) { target = mate; distance = next; }
    }
    return target;
  }

  hold(id, holding) {
    if (holding) this.held.add(id);
    else { this.held.delete(id); this.tasks.delete(id); }
  }

  take(player) { return Boolean(this.targetFor(player)); }

  offerFor(player, out) {
    const target = this.targetFor(player);
    if (!target) return null;
    Object.assign(out, { name: target.name ?? target.id, verb: 'HOLD TO REVIVE', swap: false, full: false, note: null });
    return out;
  }

  update(dt) {
    for (const player of this.players) {
      const target = this.held.has(player.id) && this.targetFor(player);
      if (!target) { this.tasks.delete(player.id); continue; }
      let task = this.tasks.get(player.id);
      if (task?.target !== target) { task = { target, elapsed: 0 }; this.tasks.set(player.id, task); }
      task.elapsed += dt;
      if (task.elapsed + 1e-9 >= this.seconds) {
        target.damageable.revive(this.health);
        this.tasks.delete(player.id);
      }
    }
  }

  progressFor(player) {
    const task = this.tasks.get(player?.id);
    return task ? { text: 'REVIVING ' + (task.target.name ?? task.target.id), fraction: Math.min(1, task.elapsed / this.seconds) } : null;
  }

  dispose() {
    this.held.clear();
    this.tasks.clear();
  }
}
