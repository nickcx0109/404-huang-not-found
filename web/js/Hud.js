// Hud: the few DOM overlays of the scene viewer (start prompt, error panel, info text).
(function (Game) {
  'use strict';

  class Hud {
    /** @param {HTMLElement} root  element holding #start, #error and #info */
    constructor(root) {
      this.start = root.querySelector('#start');
      this.error = root.querySelector('#error');
      this.info = root.querySelector('#info');
    }

    /** Shows or hides the "click to start" prompt. */
    setStartVisible(visible) {
      this.start.hidden = !visible;
    }

    onStartClick(handler) {
      this.start.addEventListener('click', handler);
    }

    /** Small text block in the top-left corner; pass an empty array to hide it. */
    setInfo(lines) {
      this.info.hidden = lines.length === 0;
      this.info.textContent = lines.join('\n');
    }

    showError(title, details) {
      this.setStartVisible(false);
      this.error.hidden = false;
      this.error.textContent = [title].concat(details || []).join('\n');
    }
  }

  Game.Hud = Hud;
})((window.Game = window.Game || {}));
