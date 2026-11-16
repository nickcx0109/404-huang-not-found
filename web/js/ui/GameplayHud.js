import { Hud } from '../Hud.js';

export class GameplayHud extends Hud {
  constructor(root) {
    super(root);
    this.panel = root.ownerDocument.createElement('pre');
    this.panel.id = 'gameplay-hud';
    this.panel.setAttribute('aria-live', 'polite');
    this.crosshair = root.ownerDocument.createElement('div');
    this.crosshair.id = 'gameplay-crosshair';
    this.crosshair.textContent = '+';
    this.crosshair.setAttribute('aria-hidden', 'true');
    root.appendChild(this.panel);
    root.appendChild(this.crosshair);
    this._timer = 0;
    this._lastText = '';
    const instructions = this.start.querySelector('p');
    if (instructions) instructions.textContent = '滑鼠：視角／左鍵開火　WASD：移動　R：換彈　1–9：換武器';
  }

  updateGame(dt, session, force = false) {
    this._timer += dt;
    if (!force && this._timer < 0.1) return;
    this._timer = 0;
    const player = session.context.players[0];
    const weapon = player.weapons.current;
    const remaining = session.state === 'wave-break' ? Math.max(0, Math.ceil(session.breakEndsAt - session.context.time)) : 0;
    const status = session.state === 'game-over' ? '遊戲結束 · 重新整理重玩' :
      session.state === 'lobby' ? '點一下開始單人骨架示範' :
      session.state === 'wave-break' ? '整備 ' + remaining + 's · 靠近商店按 E 補彈 $25' :
      '存活殭屍 ' + session.context.enemies.length;
    const text = '生命 ' + player.damageable.health + '/' + player.damageable.maxHealth +
      '　彈藥 ' + (weapon ? weapon.ammo + '/' + weapon.reserve + (weapon.reloading ? '（換彈中）' : '') : '—') +
      '\n波次 ' + session.wave + '　金錢 $' + player.wallet.balance + '　' + status;
    if (text !== this._lastText) {
      this.panel.textContent = text;
      this._lastText = text;
    }
    this.crosshair.hidden = !session.canMove;
  }

  dispose() {
    this.panel.remove();
    this.crosshair.remove();
  }
}
