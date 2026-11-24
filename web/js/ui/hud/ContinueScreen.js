import { LobbyScreen } from './LobbyScreen.js';

/**
 * The start screen after walking to another level: the player keeps what they had (CarryOverState),
 * so it only asks for the click that locks the mouse again. Anywhere on the screen counts.
 */
export class ContinueScreen extends LobbyScreen {
  /** The whole screen takes the click; the button's click bubbles up to it, so it is not bound twice. */
  onStartClick(handler) {
    this.el.onclick = handler;
  }

  static describe(status) {
    if (status.state !== 'lobby') return null;
    return { title: '點一下繼續', summary: status.goal ?? 'SURVIVE THE WAVES',
      hint: 'HEALTH, AMMO AND ITEMS CAME WITH YOU', action: 'CLICK TO CONTINUE' };
  }

  dispose() {
    this.el.onclick = null;
    super.dispose();
  }
}
