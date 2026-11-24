import { EVENTS } from '../game/events.js';
import { SoundRule } from './SoundRule.js';

/**
 * Teammates' weapons, heard from where each teammate stands (online only: in single player nobody
 * else fires). Each weapon id is registered with its `fire` cue (the gunshot, a swing) and an optional
 * `hit` cue, the same table WeaponSounds uses; held/working cues drive independent chainsaw loops. The local player's
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
  constructor(events, localId, positionOf, { range = 60, workingSeconds = 0.2, teammates = () => [] } = {}) {
    super(events);
    if (typeof positionOf !== 'function') throw new TypeError('TeammateWeaponSounds needs positionOf');
    this.localId = localId;
    this.positionOf = positionOf;
    this.range = range;
    this.table = new Map();
    this.teammates = teammates;
    this.workingSeconds = workingSeconds;
    this.cutting = new Map();
    this.active = new Set();
  }

  register(weaponId, { fire = null, hit = null, held = null, working = null } = {}) {
    this.table.set(weaponId, Object.freeze({ fire, hit, held, working }));
    return this;
  }

  subscribe() {
    this.listen(EVENTS.WEAPON_FIRED, detail => {
      if (detail.ownerId === undefined || detail.ownerId === this.localId) return;
      const sound = this.table.get(detail.weaponId);
      const position = sound ? this.positionOf(detail.ownerId) : null;
      if (!position) return;
      const where = { position: { x: position.x, z: position.z }, range: this.range };
      if (sound.working) this.cutting.set(detail.ownerId, this.board.time + this.workingSeconds);
      if (sound.fire) this.board.play(sound.fire, where);
      if (sound.hit && detail.hit) this.board.play(sound.hit, where);
    });
    this.listen(EVENTS.WEAPON_RELOADED, detail => {
      if (!detail.ownerId || detail.ownerId === this.localId) return;
      const position = this.positionOf(detail.ownerId);
      if (position) this.board.play('reload', { position, range: this.range });
    });
  }

  update() {
    const seen = new Set();
    for (const mate of this.teammates()) {
      if (mate.id === this.localId || mate.away || mate.downed || mate.alive === false) continue;
      const sound = this.table.get(mate.weapon);
      const position = this.positionOf(mate.id);
      if (!sound?.held || !position) continue;
      seen.add(mate.id);
      const cue = this.board.time < (this.cutting.get(mate.id) ?? 0) ? sound.working : sound.held;
      this.board.loop('teammate:' + mate.id, cue, { position, range: this.range });
    }
    for (const id of this.active) if (!seen.has(id)) {
      this.board.loop('teammate:' + id, null);
      this.cutting.delete(id);
    }
    this.active = seen;
  }

  dispose() {
    super.dispose();
    for (const id of this.active) this.board.loop('teammate:' + id, null);
    this.active.clear();
    this.cutting.clear();
  }
}
