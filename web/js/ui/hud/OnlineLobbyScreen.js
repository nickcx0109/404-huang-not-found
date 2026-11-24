import { LobbyScreen } from './LobbyScreen.js';
import { TeamCode, TEAM_CODE_LENGTH } from '../../net/TeamCode.js';

/**
 * The start screen when a server is configured: the single-player button stays as it was, and a
 * team section underneath offers 「建立隊伍」 and 「輸入編號加入」 with a name field (remembered by
 * PlayerName) and a 4-character code field. What the buttons do is set with `onTeam`.
 */
export class OnlineLobbyScreen extends LobbyScreen {
  /** @param {Document} doc  @param {{names: PlayerName}} options */
  constructor(doc, { names }) {
    super(doc);
    this.names = names;
    this.el.classList.add('hud-lobby-screen--online');
    const team = this.part('div', 'hud-net', this.panel);
    this.part('p', 'hud-net-label', team).textContent = '多人連線（最多 3 人）';
    const row = this.part('div', 'hud-net-row', team);
    this.nameInput = this._input(row, 'hud-net-name', '你的名字', 24);
    this.nameInput.value = names.load();
    this.createButton = this._button(row, '建立隊伍');
    const join = this.part('div', 'hud-net-row', team);
    this.codeInput = this._input(join, 'hud-net-code', '隊伍編號', TEAM_CODE_LENGTH);
    this.codeInput.setAttribute('autocapitalize', 'characters');
    this.joinButton = this._button(join, '輸入編號加入');
    this.status = this.part('p', 'hud-net-status', team);
    this.status.setAttribute('aria-live', 'polite');
    this.codeInput.addEventListener('input', () => {
      const code = TeamCode.normalize(this.codeInput.value);
      if (code !== this.codeInput.value) this.codeInput.value = code;
    });
    this._handlers = null;
    this.createButton.onclick = () => this._create();
    this.joinButton.onclick = () => this._join();
    this.codeInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') this._join();
    });
  }

  /** @param {{create(name: string): void, join(name: string, code: string): void}} handlers */
  onTeam(handlers) {
    this._handlers = handlers;
  }

  /** Shows a line under the buttons; `busy` greys the buttons out while a request is on its way. */
  setStatus(text, { busy = false, error = false } = {}) {
    this.status.textContent = text ?? '';
    this.status.classList.toggle('is-error', error);
    this.createButton.disabled = busy;
    this.joinButton.disabled = busy;
  }

  _create() {
    if (!this._handlers) return;
    this._handlers.create(this.names.use(this.nameInput.value));
  }

  _join() {
    if (!this._handlers) return;
    const code = TeamCode.normalize(this.codeInput.value);
    if (!TeamCode.isValid(code)) {
      this.setStatus('隊伍編號是 ' + TEAM_CODE_LENGTH + ' 個英文字母或數字。', { error: true });
      this.codeInput.focus?.();
      return;
    }
    this._handlers.join(this.names.use(this.nameInput.value), code);
  }

  _input(parent, className, placeholder, maxLength) {
    const input = this.part('input', 'hud-net-input ' + className, parent);
    input.type = 'text';
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.setAttribute('aria-label', placeholder);
    input.spellcheck = false;
    // Typing a name must not walk the player, reload or restart the game.
    input.addEventListener('keydown', event => event.stopPropagation());
    input.addEventListener('keyup', event => event.stopPropagation());
    return input;
  }

  _button(parent, text) {
    const button = this.part('button', 'hud-screen-action hud-net-action', parent);
    button.type = 'button';
    button.textContent = text;
    return button;
  }

  dispose() {
    this.createButton.onclick = null;
    this.joinButton.onclick = null;
    this._handlers = null;
    super.dispose();
  }
}
