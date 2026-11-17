/** Pure shop interaction state shared by input, HUD snapshots, and authority checks. */
export class ShopAccess {
  constructor() { this.openOwners = new Set(); }

  available(state, player, markers = []) {
    return state === 'wave-break' && Boolean(player?.damageable.alive) && markers.some(marker =>
      marker.type === 'shop' && Math.hypot(marker.x - player.position.x, marker.z - player.position.z) <=
        marker.r + player.body.radius);
  }

  isOpen(ownerId) { return this.openOwners.has(ownerId); }

  close(ownerId) { return this.openOwners.delete(ownerId); }

  toggle(state, player, markers) {
    if (!player) return false;
    if (this.close(player.id)) return false;
    if (!this.available(state, player, markers)) return false;
    this.openOwners.add(player.id);
    return true;
  }
}
