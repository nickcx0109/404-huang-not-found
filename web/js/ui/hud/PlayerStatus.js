/** Scratch record for the pickup offer; its two values are copied out at once, so one is enough. */
const OFFER = { name: '', swap: false, full: false, verb: '', note: null };

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
    /** The weapon on the ground the player could take now: its screen name, and whether it would replace one. */
    this.pickup = null;
    this.pickupSwap = false;
    /** True when the item on the ground is one the player already carries as many of as they can. */
    this.pickupFull = false;
    /** What E does there ('PICK UP', 'SWAP FOR', 'REFILL') and why it cannot ('FULL', 'READY IN 42s') or null. */
    this.pickupVerb = null;
    this.pickupNote = null;
    /** A timed action involving this player (bandaging yourself, a teammate, or being bandaged): its text and 0..1, or null. */
    this.action = null;
    this.actionProgress = 0;
    /**
     * What the player carries, one plain record per slot { id, count }: id is the item id or null for an
     * empty slot, count is how many of a stackable item (null for a weapon). `selected` is the slot in hand.
     */
    this.slots = [];
    this.selected = -1;
    this.state = null;
    this.canRestart = false;
    this.wave = 0;
    this.kills = 0;
    this.enemies = 0;
    this.breakSeconds = 0;
    this.canMove = false;
    /** Where the player stands and looks: metres, and radians (0 looks toward -Z, positive turns left). */
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    /** Enemies as plain records { id, x, z }, so a widget can tell where a hit came from. */
    this.threats = [];
    /** The other players as plain records { id, name, health, maxHealth, down }. */
    this.mates = [];
  }

  /** Copies the slots into reused records; a holder without fixed slots lists what it has in order. */
  _readSlots(player) {
    const held = player?.weapons?.weapons ?? [];
    for (let index = 0; index < held.length; index++) {
      const record = this.slots[index] ?? (this.slots[index] = { id: null, count: null, charge: null });
      const item = held[index];
      record.id = item ? item.id : null;
      record.count = item && Number.isInteger(item.count) ? item.count : null;
      // Shown in whole percent, so the HUD only redraws when the number on screen changes.
      record.charge = item && Number.isFinite(item.charge) ? Math.ceil(item.charge * 100) : null;
    }
    this.slots.length = held.length;
    this.selected = player?.weapons ? player.weapons.index ?? -1 : -1;
  }

  /** Finds a timed action this player does or receives; the text says who is bandaging whom. */
  _readAction(context, player) {
    this.action = null;
    this.actionProgress = 0;
    if (!player) return;
    for (const other of context.players) {
      const progress = other.weapons?.current?.progress?.(context.time);
      if (!progress) continue;
      let text = null;
      if (other === player) {
        text = progress.targetId === player.id ? '自我治療' :
          '正在治療 ' + PlayerStatus.nameOf(context.players.find(mate => mate.id === progress.targetId));
      } else if (progress.targetId === player.id) {
        text = PlayerStatus.nameOf(other) + ' 正在治療你';
      }
      if (text === null) continue;
      if (this.action !== text) this.action = text;
      this.actionProgress = progress.fraction;
      return;
    }
  }

  static nameOf(player) {
    return String(player?.name ?? player?.id ?? '').toUpperCase().slice(0, 12);
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
    // Melee weapons have no rounds to show, so the ammo display treats them as unarmed.
    this.armed = weapon !== null && weapon.usesAmmo !== false;
    this.ammo = weapon ? weapon.ammo : 0;
    this.magazine = weapon ? weapon.magazine : 0;
    this.reserve = weapon ? weapon.reserve : 0;
    this.reloading = weapon ? Boolean(weapon.reloading) : false;
    const offer = player && session.canMove ? session.pickups?.offerFor(player, OFFER, context.time) : null;
    this.pickup = offer ? offer.name : null;
    this.pickupSwap = offer ? offer.swap : false;
    this.pickupFull = offer ? offer.full : false;
    this.pickupVerb = offer ? offer.verb ?? null : null;
    this.pickupNote = offer ? offer.note ?? null : null;
    this._readSlots(player);
    this._readAction(context, player);
    this.state = session.state;
    this.canRestart = Boolean(session.canRestart);
    this.wave = session.wave;
    this.kills = session.kills ?? 0;
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
    let count = 0;
    for (const other of context.players) {
      if (other === player) continue;
      const mate = this.mates[count] ?? (this.mates[count] = { id: null, name: '', health: 0, maxHealth: 1, down: false });
      if (mate.id !== other.id) {
        mate.id = other.id;
        mate.name = String(other.name ?? other.id).toUpperCase().slice(0, 12);
      }
      mate.health = other.damageable.health;
      mate.maxHealth = other.damageable.maxHealth;
      // Until downed-and-revive exists (TODO G7), a player without health counts as down.
      mate.down = other.downed ?? other.damageable.health <= 0;
      count++;
    }
    this.mates.length = count;
    return this;
  }
}
