import { Shot } from './Shot.js';
import { PicturePanel } from './PicturePanel.js';
import { SplitLine } from './logic/SplitLine.js';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Two pictures side by side, cut along a slanted line like comic panels.
 * JSON: `{ type: "split", line: { top, bottom }, left: { image, move? }, right: { image, move? } }`.
 */
export class SplitShot extends Shot {
  constructor(spec, options) {
    super(spec, options);
    this.line = new SplitLine(spec.line);
    this.left = new PicturePanel(spec.left, options.assetUrl);
    this.right = new PicturePanel(spec.right, options.assetUrl);
  }

  get pictures() {
    return [this.left.src, this.right.src];
  }

  build() {
    const root = document.createElement('div');
    root.className = 'split';
    for (const [side, panel] of [['left', this.left], ['right', this.right]]) {
      const element = panel.build();
      element.classList.add(side);
      element.style.clipPath = this.line.clipPath(side);
      root.append(element);
    }
    root.append(this.#gutter());
    return root;
  }

  update(progress) {
    this.left.update(progress);
    this.right.update(progress);
  }

  /** The panel border along the cut: a cream strip with ink edges. */
  #gutter() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'gutter');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const name of ['ink', 'paper']) {
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('class', name);
      line.setAttribute('x1', String(this.line.top * 100));
      line.setAttribute('y1', '-1');
      line.setAttribute('x2', String(this.line.bottom * 100));
      line.setAttribute('y2', '101');
      svg.append(line);
    }
    return svg;
  }
}
