/**
 * How a sound at a world position reaches the listener: pan -1 (left) .. 1 (right) and a volume that
 * falls off with distance and reaches 0 at `range` metres. Yaw follows PlayerController: 0 looks toward
 * -Z and positive turns left, so the right ear points at (cos yaw, -sin yaw).
 */
export class SpatialMix {
  static of(listener, position, range = 30) {
    if (!listener || !position) return { pan: 0, gain: 1 };
    const dx = position.x - listener.x;
    const dz = position.z - listener.z;
    const distance = Math.hypot(dx, dz);
    const gain = Math.max(0, 1 - distance / range);
    if (distance < 1e-6) return { pan: 0, gain };
    const right = (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / distance;
    // Never fully in one ear: that sounds like a broken headphone.
    return { pan: Math.max(-1, Math.min(1, right)) * 0.85, gain };
  }
}
