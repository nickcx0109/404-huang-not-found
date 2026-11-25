import { Shot } from './Shot.js';

/**
 * A black card for chapter titles; the words come from the shot's captions.
 * JSON: `{ type: "title", captions: { lines: [...], position: "center" } }`.
 */
export class TitleShot extends Shot {
  build() {
    const card = document.createElement('div');
    card.className = 'title-card';
    return card;
  }
}
