import { EVENTS } from '../game/events.js';
import { SoundRule } from './SoundRule.js';

/**
 * The local player's weapons. Each weapon id is registered with what it sounds like:
 * - `fire`: played on every WEAPON_FIRED (a gunshot, a swing);
 * - `hit`: also played when that use hit something (the katana's clang);
 * - `reload`: played when a reload starts (the magazine coming out and going back in);
 * - `held` + `working`: one loop that plays `held` while the weapon is in hand and switches to `working`
 *   while it keeps firing (the chainsaw idling, then cutting), back to `held` a moment after the last use.
 * Weapons that are not registered make no sound, so a new gun only adds one `register` line.
 */
export class WeaponSounds extends SoundRule {
  constructor(events, ownerId, { workingSeconds = 0.2 } = {}) {
    super(events);
    this.ownerId = ownerId;
    this.workingSeconds = workingSeconds;
    this.table = new Map();
    this.inHand = null;
  }

  register(weaponId, { fire = null, hit = null, reload = null, held = null, working = null } = {}) {
    this.table.set(weaponId, Object.freeze({ fire, hit, reload, held, working }));
    return this;
  }

  subscribe() {
    this.listen(EVENTS.WEAPON_FIRED, detail => {
      if (detail.ownerId !== this.ownerId) return;
      const sound = this.table.get(detail.weaponId);
      if (!sound) return;
      if (sound.working) this.board.hold('weapon', sound.working, this.workingSeconds, { then: sound.held });
      if (sound.fire) this.board.play(sound.fire);
      if (sound.hit && detail.hit) this.board.play(sound.hit);
    });
    this.listen(EVENTS.WEAPON_CHANGED, detail => {
      if (detail.ownerId === this.ownerId) this.changeTo(detail.weaponId);
    });
    this.listen(EVENTS.WEAPON_RELOAD_STARTED, detail => {
      if (detail.ownerId !== this.ownerId) return;
      const cue = this.table.get(detail.weaponId)?.reload;
      if (cue) this.board.play(cue);
    });
  }

  changeTo(weaponId) {
    if (weaponId === this.inHand) return;
    this.inHand = weaponId;
    this.board.loop('weapon', this.table.get(weaponId)?.held ?? null);
  }
}
