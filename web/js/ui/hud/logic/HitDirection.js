/**
 * Where a hit came from, as the player sees it. No DOM, only arithmetic.
 * Yaw follows PlayerController: 0 looks toward -Z, positive turns left.
 */
export class HitDirection {
  /**
   * Angle of a point seen from the player, in radians:
   * 0 straight ahead, +π/2 to the right, -π/2 to the left, ±π behind.
   */
  static angle(playerX, playerZ, yaw, x, z) {
    const dx = x - playerX;
    const dz = z - playerZ;
    const ahead = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
    const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    return Math.atan2(right, ahead);
  }

  /**
   * The point just outside the screen edge that faces that angle, in percent of the screen:
   * ahead is the top edge, behind is the bottom edge.
   * @returns {{x: number, y: number}}
   */
  static edge(angle, reach = 58) {
    return { x: 50 + Math.sin(angle) * reach, y: 50 - Math.cos(angle) * reach };
  }
}
