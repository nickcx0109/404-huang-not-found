import { ResultScreen } from './ResultScreen.js';

export class VictoryScreen extends ResultScreen {
  constructor(doc) { super(doc, 'victory-screen'); }

  static describe(status) {
    return status.state === 'victory' ? this.result('VICTORY', status) : null;
  }
}
