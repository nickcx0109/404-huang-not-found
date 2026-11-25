import { Shot } from './Shot.js';
import { PicturePanel } from './PicturePanel.js';

/** A single full-screen picture with a slow camera move. JSON: `{ type: "image", image, move? }`. */
export class ImageShot extends Shot {
  constructor(spec, options) {
    super(spec, options);
    this.panel = new PicturePanel(spec, options.assetUrl);
  }

  get pictures() {
    return [this.panel.src];
  }

  build() {
    return this.panel.build();
  }

  update(progress) {
    this.panel.update(progress);
  }
}
