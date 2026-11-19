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
  constructor(root, events, playerId) {
    super(root);
    const doc = root.ownerDocument;
    this.events = events;
    this.playerId = playerId;
    this.status = new PlayerStatus();
    this.widgets = [];
    this.layer = doc.createElement('div');
    this.layer.className = 'hud';
    this.assets = new HudAssets(doc).install(this.layer);
    this.layer.setAttribute('aria-hidden', 'true');
    root.appendChild(this.layer);
    const instructions = this.start.querySelector('p');
    if (instructions) instructions.textContent = '滑鼠：視角／左鍵開火、使用　右鍵：治療隊友　WASD：移動　空白鍵：跳　R：換彈　E：撿起　1–7、滾輪：換武器';
  }

  /** The HUD with every finished widget. */
  static standard(root, events, playerId) {
    const doc = root.ownerDocument;
    // The overlay goes first so every other widget is drawn on top of it.
    return new SurvivalHud(root, events, playerId)
      .add(new DamageOverlay(doc))
      .add(new HealthWidget(doc))
      .add(new AmmoWidget(doc))
      .add(new StatusLine(doc))
      .add(new CrosshairWidget(doc))
      .add(new PromptWidget(doc))
      .add(new EventCard(doc))
      .add(new TeamWidget(doc))
      .add(new InventoryWidget(doc))
      .add(new SlashWidget(doc));
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
    for (const widget of this.widgets) widget.dispose();
    this.widgets.length = 0;
    this.assets.dispose();
    this.layer.remove();
  }
}
