import { Attention } from './logic/Attention.js';

/**
 * Base class of every HUD element (health, ammunition, ...). One subclass per file in this folder.
 *
 * A widget owns one DOM node and learns about the game in two ways:
 *   - bind():  subscribe to game events (game/events.js) for things that happen at one moment
 *   - sync():  receive the current plain numbers (PlayerStatus) and redraw only what changed
 * It never holds a game object.
 */
export class HudWidget {
  /**
   * @param {Document} doc
   * @param {string} name  used for the CSS class `hud-<name>`
   * @param {{holdSeconds?: number}} options  how long the widget stays fully visible after a change
   */
  constructor(doc, name, options = {}) {
    this.doc = doc;
    this.el = doc.createElement('div');
    this.el.className = 'hud-widget hud-' + name;
    this.attention = new Attention(options);
    this._awake = false;
    this._flashes = new Map();
    this._unsubscribe = [];
  }

  /** Creates a child node with a class name and appends it to `parent` (default: the widget itself). */
  part(tag, className, parent = this.el) {
    const node = this.doc.createElement(tag);
    node.className = className;
    parent.appendChild(node);
    return node;
  }

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  /** Override to subscribe with this.listen(). `playerId` is the player this screen belongs to. */
  bind(events, playerId) {}

  /** Subscribes to a game event; the subscription ends in dispose(). */
  listen(events, name, handler) {
    this._unsubscribe.push(events.on(name, handler));
  }

  /** Override: take what you need from the status and touch the DOM only when it differs. */
  sync(status) {}

  /** Adds a CSS class for a short time (a hit flash, a recoil nudge); tick() takes it off again. */
  flash(className, seconds) {
    if (!this._flashes.has(className)) this.el.classList.add(className);
    this._flashes.set(className, seconds);
  }

  /** Template method, once per frame: timed classes, the subclass hook, then the shared fade in and out. */
  tick(dt) {
    for (const [className, left] of this._flashes) {
      if (left - dt > 0) this._flashes.set(className, left - dt);
      else {
        this._flashes.delete(className);
        this.el.classList.remove(className);
      }
    }
    this.advance(dt);
    this.attention.update(dt);
    const awake = this.attention.awake;
    if (awake !== this._awake) {
      this._awake = awake;
      this.el.classList.toggle('is-awake', awake);
    }
  }

  /** Override for time-based work that CSS cannot do. */
  advance(dt) {}

  dispose() {
    for (const unsubscribe of this._unsubscribe) unsubscribe();
    this._unsubscribe.length = 0;
    this.el.remove();
  }
}
