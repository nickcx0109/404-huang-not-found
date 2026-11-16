const FONTS = 'https://fonts.googleapis.com/css2?family=Special+Elite&family=Stardos+Stencil:wght@700&display=swap';
const STYLESHEET = new URL('../../../css/hud.css', import.meta.url).href;

// Worn print: nudge every edge a little with fine noise, then let larger patches of noise thin the ink.
// Small enough that the text looks clean from a distance.
const FILTERS = '<svg width="0" height="0" aria-hidden="true" focusable="false">' +
  '<filter id="hud-rough" x="-4%" y="-8%" width="108%" height="116%">' +
  '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="4" result="grain"/>' +
  '<feDisplacementMap in="SourceGraphic" in2="grain" scale="1.8" xChannelSelector="R" yChannelSelector="B" result="worn"/>' +
  '<feTurbulence type="fractalNoise" baseFrequency="0.05 0.16" numOctaves="3" seed="11" result="patch"/>' +
  '<feColorMatrix in="patch" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 5.1" result="ink"/>' +
  '<feComposite in="worn" in2="ink" operator="in"/>' +
  '</filter></svg>';

/**
 * What the HUD needs on the page besides its own nodes: the web fonts, hud.css and the SVG filter
 * that roughens text. Added only when the HUD is created, so the page without ?play=1 is untouched.
 */
export class HudAssets {
  constructor(doc) {
    this.doc = doc;
    this.nodes = [];
  }

  /** @param {HTMLElement} layer  the HUD root; it receives the CSS variable that points at the filter */
  install(layer) {
    this._link(FONTS);
    this._link(STYLESHEET);
    const holder = this.doc.createElement('div');
    holder.className = 'hud-defs';
    holder.innerHTML = FILTERS;
    layer.appendChild(holder);
    // Set here, not in hud.css: a url(#id) written in an external stylesheet is not reliably
    // resolved against the page in every browser.
    layer.style.setProperty('--hud-rough', 'url(#hud-rough)');
    return this;
  }

  _link(href) {
    const link = this.doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    this.doc.head.appendChild(link);
    this.nodes.push(link);
  }

  dispose() {
    for (const node of this.nodes) node.remove();
    this.nodes.length = 0;
  }
}
