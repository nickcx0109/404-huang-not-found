/**
 * The plain numbers the HUD draws for one player.
 * This is the only HUD class that looks at the session: widgets get a PlayerStatus, never game objects,
 * so a network client can later fill the same fields from a snapshot sent by the host.
 */
export class PlayerStatus {
  constructor() {
    this.health = 0;
    this.maxHealth = 1;
    this.armed = false;
    this.ammo = 0;
    this.magazine = 0;
    this.reserve = 0;
    this.reloading = false;
    this.money = 0;
    this.state = null;
    this.wave = 0;
    this.enemies = 0;
    this.breakSeconds = 0;
    this.canMove = false;
    /** Where the player stands and looks: metres, and radians (0 looks toward -Z, positive turns left). */
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    /** Enemies as plain records { id, x, z }, so a widget can tell where a hit came from. */
    this.threats = [];
  }

  /**
   * Copies the current numbers out of the session into this object (reused, nothing is allocated per frame).
   * @returns {PlayerStatus} this
   */
  read(session, playerId) {
    const context = session.context;
    const player = context.players.find(candidate => candidate.id === playerId) ?? context.players[0];
    const weapon = player?.weapons.current ?? null;
    this.health = player ? player.damageable.health : 0;
    this.maxHealth = player ? player.damageable.maxHealth : 1;
    this.armed = weapon !== null;
    this.ammo = weapon ? weapon.ammo : 0;
    this.magazine = weapon ? weapon.magazine : 0;
    this.reserve = weapon ? weapon.reserve : 0;
    this.reloading = weapon ? Boolean(weapon.reloading) : false;
    this.money = player?.wallet ? player.wallet.balance : 0;
    this.state = session.state;
    this.wave = session.wave;
    this.enemies = context.enemies.length;
    this.breakSeconds = session.state === 'wave-break' ? Math.max(0, Math.ceil(session.breakEndsAt - context.time)) : 0;
    this.canMove = Boolean(session.canMove);
    this.x = player ? player.position.x : 0;
    this.z = player ? player.position.z : 0;
    this.yaw = player?.controller ? player.controller.yaw : 0;
    const enemies = context.enemies;
    for (let index = 0; index < enemies.length; index++) {
      const threat = this.threats[index] ?? (this.threats[index] = { id: null, x: 0, z: 0 });
      threat.id = enemies[index].id;
      threat.x = enemies[index].position.x;
      threat.z = enemies[index].position.z;
    }
    this.threats.length = enemies.length;
    return this;
  }
}
