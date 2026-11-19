/**
 * Vertical part of the player's movement: a jump from the ground and the fall back to it.
 * `height` is how far the feet are above the ground (0 when standing). Pure numbers, no input or DOM.
 */
export class JumpMotion {
  constructor({ jumpSpeed = 4.6, gravity = 13 } = {}) {
    if (!(jumpSpeed > 0) || !(gravity > 0)) throw new RangeError('Invalid jump settings');
    this.jumpSpeed = jumpSpeed;
    this.gravity = gravity;
    this.height = 0;
    this.velocity = 0;
  }

  get grounded() {
    return this.height <= 0 && this.velocity <= 0;
  }

  /** Starts a jump; does nothing in the air. @returns {boolean} whether the jump started */
  jump() {
    if (!this.grounded) return false;
    this.velocity = this.jumpSpeed;
    return true;
  }

  update(dt) {
    if (this.grounded) return;
    this.velocity -= this.gravity * dt;
    this.height += this.velocity * dt;
    if (this.height <= 0) {
      this.height = 0;
      this.velocity = 0;
    }
  }

  reset() {
    this.height = 0;
    this.velocity = 0;
  }
}
