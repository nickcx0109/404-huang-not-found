import { ScreenWidget } from './ScreenWidget.js';
import { EVENTS } from '../../game/events.js';

export class ResultScreen extends ScreenWidget {
  constructor(doc, name) { super(doc, name, EVENTS.RESTART_REQUESTED); }

  static format(status) {
    return 'WAVE REACHED  ' + status.wave + '  /  KILLS  ' + status.kills;
  }

  static result(title, status) {
    return { title, summary: this.format(status), hint: 'PRESS ENTER OR CLICK TO RETURN TO THE LOBBY', action: 'RESTART' };
  }
}
