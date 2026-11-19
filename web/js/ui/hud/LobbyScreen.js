import { ScreenWidget } from './ScreenWidget.js';

export class LobbyScreen extends ScreenWidget {
  constructor(doc) { super(doc, 'lobby-screen'); }

  onStartClick(handler) { this.button.onclick = handler; }

  static describe(status) {
    if (status.state !== 'lobby') return null;
    return { title: '404 HUANG NOT FOUND', summary: status.goal ?? 'SURVIVE THE WAVES',
      hint: 'WASD MOVE / MOUSE AIM & FIRE / R RELOAD / E PICK UP / 1-7 ITEMS / ESC PAUSE',
      action: 'CLICK TO START' };
  }
}
