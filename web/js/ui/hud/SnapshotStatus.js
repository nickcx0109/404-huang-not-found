import { PlayerStatus } from './PlayerStatus.js';

/**
 * PlayerStatus filled from a NetworkedSession instead of a GameSession, so every HUD widget
 * works online unchanged. The local player's numbers come from the newest snapshot (and the
 * shots still on their way, so the counter drops the moment the trigger is pulled), teammates
 * and zombies from the interpolated one; where the player stands and looks comes from the
 * predicted controller, which is what the camera shows.
 */
export class SnapshotStatus extends PlayerStatus {
  /**
   * @param {{x: number, z: number, yaw: number}} controller  the local PlayerController
   * @param {{predictedAmmo(ammo: number|null): number|null, reloading: boolean, specOf(id: string): object}} weapons
   */
  constructor(controller, weapons) {
    super();
    this.controller = controller;
    this.weapons = weapons;
  }

  /** @param {NetworkedSession} view */
  read(view, playerId = view.you) {
    const latest = view.latest;
    const me = view.playerById(playerId);
    const spec = me?.weapon ? this.weapons.specOf(me.weapon) : null;
    this.health = me ? me.health : 0;
    this.maxHealth = me?.maxHealth > 0 ? me.maxHealth : 100;
    const ammo = me ? view.ammo : null;
    this.armed = Boolean(spec) && ammo !== null && spec.usesAmmo;
    this.ammo = this.armed ? this.weapons.predictedAmmo(ammo) : 0;
    this.magazine = this.armed ? me.magazine ?? spec.magazine : 0;
    // null reserve with a numeric count is the starter pistol's endless reserve.
    this.reserve = this.armed ? (view.reserve === null ? Infinity : view.reserve) : 0;
    this.reloading = Boolean(me?.reloading) || this.weapons.reloading;
    const offer = me && view.canAct ? me.offer ?? null : null;
    this.pickup = offer ? offer.name : null;
    this.pickupSwap = offer ? Boolean(offer.swap) : false;
    this.pickupFull = offer ? Boolean(offer.full) : false;
    this.pickupVerb = offer ? offer.verb ?? null : null;
    this.pickupNote = offer ? offer.note ?? null : null;
    this._copySlots(me);
    this.action = me?.action ? me.action.text : null;
    this.actionProgress = me?.action ? me.action.fraction : 0;
    this.state = view.state;
    this.canRestart = view.canRestart;
    this.wave = view.wave;
    this.kills = view.kills;
    this.breakSeconds = latest?.breakSeconds ?? 0;
    this.canMove = view.canMove;
    this.goal = latest?.goal ?? 'SURVIVE THE WAVES';
    this.objective = latest?.objective ?? null;
    this.x = this.controller.x;
    this.z = this.controller.z;
    this.yaw = this.controller.yaw;
    const enemies = view.sampled?.enemies ?? latest?.enemies ?? [];
    let count = 0;
    for (const enemy of enemies) {
      if (enemy.state === 'dead') continue;
      const threat = this.threats[count] ?? (this.threats[count] = { id: null, x: 0, z: 0 });
      threat.id = enemy.id;
      threat.x = enemy.x;
      threat.z = enemy.z;
      count++;
    }
    this.threats.length = count;
    this.enemies = count;
    this._copyMates(view, playerId);
    return this;
  }

  _copySlots(me) {
    const slots = me?.slots ?? [];
    for (let index = 0; index < slots.length; index++) {
      const record = this.slots[index] ?? (this.slots[index] = { id: null, count: null, charge: null });
      record.id = slots[index]?.id ?? null;
      record.count = slots[index]?.count ?? null;
      record.charge = slots[index]?.charge ?? null;
    }
    this.slots.length = slots.length;
    this.selected = Number.isInteger(me?.slot) ? me.slot : -1;
  }

  _copyMates(view, playerId) {
    const players = view.latest?.players ?? [];
    let count = 0;
    for (const other of players) {
      if (other.id === playerId) continue;
      const mate = this.mates[count] ?? (this.mates[count] = { id: null, name: '', health: 0, maxHealth: 1, down: false, healing: false });
      const name = PlayerStatus.nameOf({ name: view.nameOf(other.id), id: other.id });
      if (mate.id !== other.id || mate.name !== name) {
        mate.id = other.id;
        mate.name = name;
      }
      mate.health = other.health;
      mate.maxHealth = other.maxHealth > 0 ? other.maxHealth : 100;
      mate.down = Boolean(other.downed);
      mate.healing = Boolean(other.healing);
      count++;
    }
    this.mates.length = count;
  }
}
