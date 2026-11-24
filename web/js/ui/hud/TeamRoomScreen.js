import { ScreenWidget } from './ScreenWidget.js';
import { teamErrorText } from '../../net/teamErrors.js';

/**
 * The team room (online only): the team code, big and easy to copy, who has joined, and the
 * start and leave buttons. Shown until the server's game is running (states 'team-lobby' and
 * 'starting' of NetworkedSession). Anyone in the team may press start.
 */
export class TeamRoomScreen extends ScreenWidget {
  constructor(doc) {
    super(doc, 'team-screen');
    this.title.classList.add('hud-net-code-text');
    this.copyButton = this.part('button', 'hud-net-copy', this.panel);
    this.copyButton.type = 'button';
    this.copyButton.textContent = '複製編號';
    this.panel.insertBefore?.(this.copyButton, this.summary);
    this.roster = this.part('ol', 'hud-net-roster', this.panel);
    this.panel.insertBefore?.(this.roster, this.hint);
    this.error = this.part('p', 'hud-net-status is-error', this.panel);
    this.error.setAttribute('aria-live', 'polite');
    this.leaveButton = this.part('button', 'hud-net-leave', this.panel);
    this.leaveButton.type = 'button';
    this.leaveButton.textContent = '離開隊伍';
    this._code = '';
    this._roster = '';
    this.copyButton.onclick = () => this.copy();
  }

  static describe(status) {
    if (status.state !== 'team-lobby' && status.state !== 'starting') return null;
    const starting = status.state === 'starting';
    return { title: status.teamCode || '----', summary: '隊伍編號：把它告訴隊友，他們在開始畫面輸入編號加入',
      hint: starting ? '遊戲開始中…' : '人到齊後，任何人都可以按開始（最多 3 人）',
      action: starting ? '開始中…' : '開始遊戲' };
  }

  /** @param {() => void} handler  the start button (it also takes the mouse, like single player) */
  onStart(handler) { this.button.onclick = handler; }

  onLeave(handler) { this.leaveButton.onclick = handler; }

  sync(status) {
    super.sync(status);
    if (this.el.hidden) return;
    this._code = status.teamCode;
    this.button.disabled = status.state === 'starting';
    const roster = JSON.stringify(status.roster);
    if (roster !== this._roster) {
      this._roster = roster;
      this.roster.textContent = '';
      for (let slot = 0; slot < 3; slot++) {
        const player = status.roster[slot];
        const item = this.part('li', 'hud-net-player is-slot-' + (slot + 1), this.roster);
        item.textContent = player ? player.name + (player.you ? '（你）' : '') : '等待隊友…';
        if (!player) item.classList.add('is-empty');
      }
    }
    const notice = status.notice ? teamErrorText(status.notice) : '';
    if (this.error.textContent !== notice) this.error.textContent = notice;
  }

  /** Copies the code to the clipboard, or selects it where the clipboard is not allowed. */
  async copy() {
    const code = this._code;
    if (!code) return false;
    try {
      await globalThis.navigator.clipboard.writeText(code);
      this.copyButton.textContent = '已複製';
      return true;
    } catch {
      const selection = this.doc.getSelection?.();
      if (selection && this.doc.createRange) {
        const range = this.doc.createRange();
        range.selectNodeContents(this.title);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      this.copyButton.textContent = '按 Ctrl+C 複製';
      return false;
    }
  }

  dispose() {
    this.copyButton.onclick = null;
    this.leaveButton.onclick = null;
    super.dispose();
  }
}
