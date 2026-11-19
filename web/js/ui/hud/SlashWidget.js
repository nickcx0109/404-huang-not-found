import { EVENTS } from '../../game/events.js';
import { HudWidget } from './HudWidget.js';
import { SlashStyles } from './logic/SlashStyles.js';
import { SlashTrail } from './logic/SlashTrail.js';

const DEG = Math.PI / 180;
const STEPS = 40;

/**
 * Blade light, full screen: when the player swings a weapon that has a slash style
 * (SlashStyles), a glowing crescent runs across the screen and fades. A hit makes it brighter.
 * Which weapon draws what lives in the registry, not here; the timing lives in SlashTrail.
 */
export class SlashWidget extends HudWidget {
  constructor(doc, { styles = SlashStyles.standard() } = {}) {
    super(doc, 'slash');
    this.styles = styles;
    this.canvas = this.part('canvas', 'hud-slash__canvas');
    this.canvas.hidden = true;
    this.trail = null;
    this._drawn = false;
  }

  bind(events, playerId) {
    this.listen(events, EVENTS.WEAPON_FIRED, detail => {
      if (detail.ownerId !== playerId) return;
      const style = this.styles.get(detail.weaponId);
      if (!style) return;
      if (!this.trail || this.trail.style !== style) {
        const side = this.trail ? this.trail.side : -1;
        this.trail = new SlashTrail(style);
        this.trail.side = side;
      }
      this.trail.start(detail.hit != null);
    });
  }

  advance(dt) {
    const trail = this.trail;
    if (trail?.active) {
      this._draw(trail);
      trail.update(dt);
    } else if (this._drawn) {
      this._clear();
    }
  }

  _context() {
    if (typeof this.canvas.getContext !== 'function') return null;
    const view = this.doc.defaultView;
    const width = Math.max(1, Math.round(view?.innerWidth || 1280));
    const height = Math.max(1, Math.round(view?.innerHeight || 720));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    return this.canvas.getContext('2d');
  }

  _clear() {
    this._drawn = false;
    this.canvas.hidden = true;
    const g = typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
    g?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _draw(trail) {
    const g = this._context();
    if (!g) return;
    this.canvas.hidden = false;
    this._drawn = true;
    const { width: W, height: H } = this.canvas;
    g.clearRect(0, 0, W, H);
    const head = trail.head;
    const tail = trail.tail;
    const alpha = trail.alpha;
    if (head - tail < 1e-3 || alpha <= 0) return;

    const style = trail.style;
    const strength = trail.strength;
    const side = trail.side;
    // The arc is part of a wide ellipse whose centre sits below the screen, so the cut bulges upward.
    const cx = W / 2;
    const cy = H * 1.12;
    const rx = W * 0.6;
    const ry = H * 0.64;
    const tilt = side * style.tiltDegrees * DEG;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const half = style.spanDegrees / 2;
    const thick = style.width * H * (0.7 + 0.3 * strength);

    const outer = [];
    const core = [];
    const inner = [];
    for (let i = 0; i <= STEPS; i++) {
      const u = tail + (head - tail) * (i / STEPS);
      const angle = (-90 + side * half * (1 - 2 * u)) * DEG;
      const ex = rx * Math.cos(angle);
      const ey = ry * Math.sin(angle);
      // Normal pointing to the centre of the ellipse.
      let nx = -Math.cos(angle) / rx;
      let ny = -Math.sin(angle) / ry;
      const n = Math.hypot(nx, ny);
      nx /= n;
      ny /= n;
      const p = i / STEPS;
      // Thin at the tail, full near the head, then a quick rounded tip.
      const w = thick * Math.pow(p, 1.3) * Math.min(1, (1 - p) * 9 + 0.25);
      const at = (dx, dy) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos });
      outer.push(at(ex, ey));
      core.push(at(ex + nx * w * 0.32, ey + ny * w * 0.32));
      inner.push(at(ex + nx * w, ey + ny * w));
    }

    const from = outer[0];
    const to = outer[outer.length - 1];
    const ramp = (rgb, a) => {
      const gradient = g.createLinearGradient(from.x, from.y, to.x, to.y);
      gradient.addColorStop(0, `rgba(${rgb},0)`);
      gradient.addColorStop(0.55, `rgba(${rgb},${(a * 0.45).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${rgb},${a.toFixed(3)})`);
      return gradient;
    };
    const fill = (edge, back) => {
      g.beginPath();
      g.moveTo(edge[0].x, edge[0].y);
      for (let i = 1; i < edge.length; i++) g.lineTo(edge[i].x, edge[i].y);
      for (let i = back.length - 1; i >= 0; i--) g.lineTo(back[i].x, back[i].y);
      g.closePath();
      g.fill();
    };

    g.save();
    g.globalCompositeOperation = 'lighter';
    // Soft light around the cut.
    g.shadowColor = `rgba(${style.glow},${Math.min(1, alpha * 0.9 * strength).toFixed(3)})`;
    g.shadowBlur = H * 0.03 * strength;
    g.fillStyle = ramp(style.glow, Math.min(1, alpha * 0.6 * strength));
    fill(outer, inner);
    // Sharp bright edge along the outside, where the blade was.
    g.shadowBlur = H * 0.012 * strength;
    g.shadowColor = `rgba(${style.core},${Math.min(1, alpha * strength).toFixed(3)})`;
    g.fillStyle = ramp(style.core, Math.min(1, alpha * 0.95 * (0.7 + 0.3 * strength)));
    fill(outer, core);
    g.restore();
  }

  dispose() {
    this.trail = null;
    super.dispose();
  }
}
