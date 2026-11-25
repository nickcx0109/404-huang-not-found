import { CameraMove } from './logic/CameraMove.js';

/**
 * A picture filling its box, slowly panned and zoomed by a CameraMove.
 * Shots are made of one or more of these.
 */
export class PicturePanel {
  /** @param {{ image: string, move?: object }} spec */
  constructor(spec, assetUrl) {
    if (typeof spec?.image !== 'string') throw new RangeError('A picture panel needs an image');
    this.src = assetUrl(spec.image);
    this.move = new CameraMove(spec.move);
    this.element = null;
    this.img = null;
  }

  build() {
    this.element = document.createElement('div');
    this.element.className = 'panel';
    this.img = document.createElement('img');
    this.img.src = this.src;
    this.img.alt = '';
    this.img.draggable = false;
    this.element.append(this.img);
    return this.element;
  }

  update(progress) {
    if (this.img) this.img.style.transform = this.move.transform(progress);
  }
}
