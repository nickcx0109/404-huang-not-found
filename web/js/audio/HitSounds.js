import { EVENTS } from '../game/events.js';
import { Enemy } from '../enemies/Enemy.js';
import { SoundRule } from './SoundRule.js';

/**
 * Hit markers for the local player's bullets: a tick on a hit, a higher ping on a headshot and a drop
 * when the zombie dies. Melee and explosions make their own noise, so only damage kinds listed in
 * `kinds` count.
 */
export class HitSounds extends SoundRule {
  constructor(events, playerId, { kinds = ['bullet'] } = {}) {
    super(events);
    this.playerId = playerId;
    this.kinds = new Set(kinds);
  }

  subscribe() {
    this.listen(EVENTS.ENTITY_DAMAGED, ({ entity, info, amount }) => {
      if (!this._mine(entity, info) || amount <= 0 || !entity.damageable.alive) return;
      this.board.play(info.hitPart === 'head' ? 'headshot' : 'hit');
    });
    this.listen(EVENTS.ENTITY_DIED, ({ entity, info }) => {
      if (this._mine(entity, info)) this.board.play('kill');
    });
  }

  _mine(entity, info) {
    return entity instanceof Enemy && info.sourceId === this.playerId && this.kinds.has(info.kind);
  }
}
