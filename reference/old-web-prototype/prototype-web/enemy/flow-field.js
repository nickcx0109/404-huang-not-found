'use strict';
/* ---------- 尋路：格狀 flow field（正式版改用 NavMesh） ---------- */
class FlowField {
  constructor(world) {
    const N = this.N = world.half * 2; this.off = world.half;
    this.blocked = new Uint8Array(N * N); this.dist = new Int32Array(N * N); this.q = new Int32Array(N * N); this.last = -1;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i - this.off + 0.5, z = j - this.off + 0.5;
      for (const o of world.obstacles) if (x > o.minX - 0.45 && x < o.maxX + 0.45 && z > o.minZ - 0.45 && z < o.maxZ + 0.45) { this.blocked[j * N + i] = 1; break; }
    }
  }
  cell(x, z) { const N = this.N; return clamp(Math.floor(z + this.off), 0, N - 1) * N + clamp(Math.floor(x + this.off), 0, N - 1); }
  center(c, out) { return out.set((c % this.N) - this.off + 0.5, 0, ((c / this.N) | 0) - this.off + 0.5); }
  neighbors(c, fn) {
    const N = this.N, ci = c % N, cj = (c / N) | 0, B = this.blocked;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = nj * N + ni; if (B[n]) continue;
      if (di && dj && (B[cj * N + ni] || B[nj * N + ci])) continue;
      fn(n);
    }
  }
  update(px, pz) {
    const c = this.cell(px, pz); if (c === this.last) return; this.last = c;
    const D = this.dist, Q = this.q; D.fill(-1); D[c] = 0; let h = 0, t = 0; Q[t++] = c;
    while (h < t) { const cur = Q[h++]; this.neighbors(cur, n => { if (D[n] < 0) { D[n] = D[cur] + 1; Q[t++] = n; } }); }
  }
  los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, steps = Math.ceil(Math.hypot(dx, dz) / 0.4);
    for (let s = 1; s < steps; s++) if (this.blocked[this.cell(ax + dx * s / steps, az + dz * s / steps)]) return false;
    return true;
  }
  next(c) { let best = this.dist[c] < 0 ? 1e9 : this.dist[c], bn = -1; this.neighbors(c, n => { const d = this.dist[n]; if (d >= 0 && d < best) { best = d; bn = n; } }); return bn; }
  dir(x, z, out) {
    const bn = this.next(this.cell(x, z)); if (bn < 0) return false;
    this.center(bn, out); out.x -= x; out.z -= z; out.y = 0; out.normalize(); return true;
  }
  path(x, z, max = 160) { const pts = []; let c = this.cell(x, z); for (let i = 0; i < max; i++) { const n = this.next(c); if (n < 0) break; pts.push(n); c = n; if (this.dist[n] === 0) break; } return pts; }
}

