import { ResultScreen } from './ResultScreen.js';

export class GameOverScreen extends ResultScreen {
  constructor(doc) { super(doc, 'game-over-screen'); }

  static describe(status) {
    return status.state === 'game-over' ? this.result('GAME OVER', status) : null;
  }
}
