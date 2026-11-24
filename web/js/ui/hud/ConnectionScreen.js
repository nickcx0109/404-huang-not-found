import { ScreenWidget } from './ScreenWidget.js';
import { teamErrorText } from '../../net/teamErrors.js';

/**
 * Online only: covers the game while the connection to the server is down. While NetClient
 * retries it says so; once the team cannot be rejoined (the room is gone, or the game went on
 * without us) it says why and offers the way back to the start screen.
 */
export class ConnectionScreen extends ScreenWidget {
  constructor(doc) {
    super(doc, 'connection-screen');
  }

  /** @param {() => void} handler  leave the team and go back to the start screen */
  onLeave(handler) { this.button.onclick = handler; }

  static describe(status) {
    if (status.connection === 'reconnecting') {
      return { title: '連線中斷', summary: teamErrorText('reconnecting'), hint: '重新連上後會自動回到隊伍',
        action: '離開隊伍' };
    }
    if (status.connection === 'lost') {
      return { title: '連線已中斷', summary: teamErrorText(status.notice ?? 'connection-lost'),
        hint: '回到開始畫面後可以重新建立或加入隊伍', action: '回到開始畫面' };
    }
    return null;
  }
}
