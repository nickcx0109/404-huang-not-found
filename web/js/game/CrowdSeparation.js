/** Replaceable crowd Strategy. Two pairwise passes, O(n²), with no per-tick allocations. */
export class CrowdSeparation {
  constructor() {
    this._movement = { x: 0, z: 0, hitX: false, hitZ: false };
  }

  apply(ctx) {
    const enemies = ctx.enemies;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i];
        if (!a.active || !a.damageable.alive) continue;
        for (let j = i + 1; j < enemies.length; j++) {
          const b = enemies[j];
          if (!b.active || !b.damageable.alive || a.position.y >= b.position.y + b.height ||
              b.position.y >= a.position.y + a.height) continue;
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          const distance = Math.hypot(dx, dz);
          const overlap = a.radius + b.radius - distance;
          if (overlap <= 1e-9) continue;
          // Stable tie-break for coincident centres; no random vector or allocation.
          const nx = distance > 1e-9 ? dx / distance : 1;
          const nz = distance > 1e-9 ? dz / distance : 0;
          const movedA = this.move(a, -nx, -nz, overlap / 2, ctx);
          const movedB = this.move(b, nx, nz, Math.max(0, overlap - movedA), ctx);
          // If B hits a wall, A can take the remaining correction.
          this.move(a, -nx, -nz, Math.max(0, overlap - movedA - movedB), ctx);
        }
      }
    }
    for (const enemy of enemies) if (enemy.active && enemy.damageable.alive) enemy.syncView();
  }

  move(enemy, nx, nz, distance, ctx) {
    if (distance <= 1e-9) return 0;
    const position = enemy.position;
    ctx.collision.move(position.x, position.z, nx * distance, nz * distance,
      enemy.radius, position.y, position.y + enemy.height, this._movement);
    // Bounds clamping must not push a body into a collider at the edge of the map.
    if (ctx.collision.hit(this._movement.x, this._movement.z, enemy.radius, position.y, position.y + enemy.height)) return 0;
    const stepX = this._movement.x - position.x;
    const stepZ = this._movement.z - position.z;
    const moved = stepX * nx + stepZ * nz;
    // Collision push-out can teleport a body through a thin wall; a safe push never moves
    // backwards or farther than requested, so reject anything else and keep the overlap.
    if (moved < -1e-9 || Math.hypot(stepX, stepZ) > distance + 1e-9) return 0;
    position.x = this._movement.x;
    position.z = this._movement.z;
    return Math.max(0, moved);
  }
}
