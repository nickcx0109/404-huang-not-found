import { Hud } from '../../Hud.js';
import { HudAssets } from './HudAssets.js';
import { PlayerStatus } from './PlayerStatus.js';
import { HealthWidget } from './HealthWidget.js';
import { AmmoWidget } from './AmmoWidget.js';
import { StatusLine } from './StatusLine.js';
import { CrosshairWidget } from './CrosshairWidget.js';
import { DamageOverlay } from './DamageOverlay.js';
import { PromptWidget } from './PromptWidget.js';
import { EventCard } from './EventCard.js';
import { TeamWidget } from './TeamWidget.js';
import { InventoryWidget } from './InventoryWidget.js';
import { SlashWidget } from './SlashWidget.js';
import { ObjectiveWidget } from './ObjectiveWidget.js';
import { LobbyScreen } from './LobbyScreen.js';
import { GameOverScreen } from './GameOverScreen.js';
import { VictoryScreen } from './VictoryScreen.js';

/**
 * The in-game HUD: a composite of HudWidget objects on one layer above the 3D view.
 * It extends the viewer's Hud, so the start prompt, the error panel and the info text keep working.
 *
 * To add an element: write a HudWidget subclass in this folder and add one line to `standard()`.
 */
export class SurvivalHud extends Hud {
  /**
   * @param {HTMLElement} root   element holding #start, #error and #info (document.body)
   * @param {EventBus} events    the game's event bus
   * @param {string} playerId    the player this screen belongs to
   */
  constructor(root, events, playerId, status = new PlayerStatus()) {
    super(root);
    const doc = root.ownerDocument;
    this.doc = doc;
    this.events = events;
    this.playerId = playerId;
    this.status = status;
    this.widgets = [];
    this.layer = doc.createElement('div');
    this.layer.className = 'hud';
    this.assets = new HudAssets(doc).install(this.layer);
    root.appendChild(this.layer);
    const instructions = this.start.querySelector('p');
    if (instructions) instructions.textContent = '滑鼠：視角／左鍵開火、使用　右鍵：治療隊友　WASD：移動　空白鍵：跳　R：換彈　E：撿起　1–7、滾輪：換武器';
  }

  /**
   * The HUD with every finished widget.
   * @param {{lobby?: LobbyScreen|null}} [options]  start screen to use instead of the plain one
   */
  static standard(root, events, playerId, { lobby = null } = {}) {
    return SurvivalHud.compose(new SurvivalHud(root, events, playerId), {
      lobby: lobby ?? new LobbyScreen(root.ownerDocument),
    });
  }

  /**
   * Adds the standard widget set to `hud`; online play passes its own crosshair and screens.
   * @param {SurvivalHud} hud
   * @param {{lobby: LobbyScreen, crosshair?: HudWidget, extra?: HudWidget[]}} parts
   */
  static compose(hud, { lobby, crosshair = null, extra = [] }) {
    const doc = hud.doc;
    // The overlay goes first so every other widget is drawn on top of it.
    hud.add(new DamageOverlay(doc))
      .add(new HealthWidget(doc))
      .add(new AmmoWidget(doc))
      .add(new StatusLine(doc))
      .add(crosshair ?? new CrosshairWidget(doc))
      .add(new PromptWidget(doc))
      .add(new EventCard(doc))
      .add(new TeamWidget(doc))
      .add(new InventoryWidget(doc))
      .add(new SlashWidget(doc))
      .add(new ObjectiveWidget(doc))
      .add(lobby)
      .add(new GameOverScreen(doc))
      .add(new VictoryScreen(doc));
    for (const widget of extra) hud.add(widget);
    return hud;
  }

  onStartClick(handler) {
    if (this._startHandler) this.start.removeEventListener('click', this._startHandler);
    this._startHandler = handler;
    super.onStartClick(handler);
    for (const widget of this.widgets) widget.onStartClick?.(handler);
  }

  setStartVisible(visible) {
    super.setStartVisible(visible && !this.widgets.some(widget => widget.blocksStart));
  }

  add(widget) {
    widget.mount(this.layer).bind(this.events, this.playerId);
    this.widgets.push(widget);
    return this;
  }

  /** Called by App once per frame while the game runs; `dt` in seconds. */
  updateGame(dt, session) {
    const status = this.status.read(session, this.playerId);
    for (const widget of this.widgets) {
      widget.sync(status);
      widget.tick(dt);
    }
  }

  dispose() {
    if (this._startHandler) this.start.removeEventListener('click', this._startHandler);
    for (const widget of this.widgets) widget.dispose();
    this.widgets.length = 0;
    this.assets.dispose();
    this.layer.remove();
  }
}
