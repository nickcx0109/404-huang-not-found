import { EVENTS } from '../game/events.js';
import { SoundRule } from './SoundRule.js';

/** Things everyone hears: explosions where they happen, and the wave horn, all-clear bell and game over. */
export class WorldSounds extends SoundRule {
  subscribe() {
    this.listen(EVENTS.EXPLODED, ({ x, z }) => this.board.play('explosion', { position: { x, z } }));
    this.listen(EVENTS.WAVE_STARTED, () => this.board.play('wave_start'));
    this.listen(EVENTS.WAVE_CLEARED, () => this.board.play('wave_clear'));
    this.listen(EVENTS.GAME_OVER, () => this.board.play('game_over'));
  }
}
