import { EVENTS } from '../game/events.js';
import { SoundRule } from './SoundRule.js';

/**
 * Teammates' weapons, heard from where each teammate stands (online only: in single player nobody
 * else fires). Each weapon id is registered with its `fire` cue (the gunshot, a swing) and an optional
 * `hit` cue, the same table WeaponSounds uses; loops (the chainsaw) are left out. The local player's
 * own shots are WeaponSounds' job, so WEAPON_FIRED from `localId` is ignored here.
 *
 * Gunshots carry further than groans, so these play out to `range` metres instead of the board's
 * default earshot.
 */
export class TeammateWeaponSounds extends SoundRule {
  /**
   * @param {EventBus} events
   * @param {string} localId  the player listening; their own shots are not played here
   * @param {(ownerId: string) => ({x: number, z: number} | null)} positionOf  where a teammate is now
   */
  constructor(events, localId, positionOf, { range = 60 } = {}) {
    super(events);
    if (typeof positionOf !== 'function') throw new TypeError('TeammateWeaponSounds needs positionOf');
    this.localId = localId;
    this.positionOf = positionOf;
    this.range = range;
    this.table = new Map();
  }

  register(weaponId, { fire = null, hit = null } = {}) {
    this.table.set(weaponId, Object.freeze({ fire, hit }));
    return this;
  }

  subscribe() {
    this.listen(EVENTS.WEAPON_FIRED, detail => {
      if (detail.ownerId === undefined || detail.ownerId === this.localId) return;
      const sound = this.table.get(detail.weaponId);
      const position = sound ? this.positionOf(detail.ownerId) : null;
      if (!position) return;
      const where = { position: { x: position.x, z: position.z }, range: this.range };
      if (sound.fire) this.board.play(sound.fire, where);
      if (sound.hit && detail.hit) this.board.play(sound.hit, where);
    });
  }
}
