/**
 * Each frame, roots the local player's controller while the game says their feet must stay still
 * (a bandage being applied) and frees it again afterwards. Looking around still works.
 */
export class MovementLock {
  constructor(controller, session, playerId) {
    this.controller = controller;
    this.session = session;
    this.playerId = playerId;
  }

  update() {
    this.controller.rooted = this.session.isRooted(this.playerId);
    if (this.session.playerById?.(this.playerId)?.downed) {
      this.controller.velocityX = 0;
      this.controller.velocityZ = 0;
    }
  }

  dispose() {
    this.controller.rooted = false;
  }
}
