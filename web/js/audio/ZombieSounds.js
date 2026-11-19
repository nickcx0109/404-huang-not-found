import { EVENTS } from '../game/events.js';
import { Enemy } from '../enemies/Enemy.js';
import { SoundRule } from './SoundRule.js';

/**
 * Zombie voices, heard from where the zombie is. Each enemy class is registered with its cues:
 * - `spawn`: when one of them shows up (a runner's scream, an exploder's hiss);
 * - `groan`: now and then one living zombie of that kind groans, every `gapSeconds` on average;
 * - `death`: when it dies.
 * A class that is not registered uses the voice registered for `Enemy`, if any.
 */
export class ZombieSounds extends SoundRule {
  /** @param {() => Enemy[]} enemies  the zombies right now (GameContext.enemies) */
  constructor(events, enemies, { rng = Math.random, gapSeconds = [1.5, 3.5] } = {}) {
    super(events);
    this.enemies = enemies;
    this.rng = rng;
    this.gapSeconds = gapSeconds;
    this.voices = new Map();
    this.nextGroanIn = this._gap();
  }

  register(enemyClass, { spawn = null, groan = null, death = null } = {}) {
    this.voices.set(enemyClass, Object.freeze({ spawn, groan, death }));
    return this;
  }

  voiceOf(enemy) {
    return this.voices.get(enemy.constructor) ?? this.voices.get(Enemy) ?? null;
  }

  subscribe() {
    this.listen(EVENTS.ENEMY_SPAWNED, ({ enemy }) => this._say(enemy, 'spawn'));
    this.listen(EVENTS.ENTITY_DIED, ({ entity }) => {
      if (entity instanceof Enemy) this._say(entity, 'death');
    });
  }

  update(dt) {
    this.nextGroanIn -= dt;
    if (this.nextGroanIn > 0) return;
    this.nextGroanIn = this._gap();
    const living = this.enemies().filter(enemy => enemy.active && enemy.damageable.alive && this.voiceOf(enemy)?.groan);
    if (living.length === 0) return;
    this._say(living[Math.min(living.length - 1, Math.floor(this.rng() * living.length))], 'groan');
  }

  _say(enemy, part) {
    const cue = this.voiceOf(enemy)?.[part];
    if (cue) this.board.play(cue, { position: enemy.position });
  }

  _gap() {
    const [low, high] = this.gapSeconds;
    return low + this.rng() * (high - low);
  }
}
