/**
 * One shot of a cutscene: something drawn on the stage for a while.
 * Template Method: the base class mounts, fades in and removes the shot;
 * subclasses only say what to build (`build`) and how it moves (`update`).
 * New kinds of shots are subclasses registered in `ShotTypes`.
 */
export class Shot {
  /**
   * @param {object} spec  this shot's entry in the cutscene JSON
   * @param {{ assetUrl: (file: string) => string }} options
   */
  constructor(spec, { assetUrl }) {
    this.spec = spec;
    this.assetUrl = assetUrl;
    this.root = null;
  }

  /** Picture files this shot needs, so the player can load them before it starts. */
  get pictures() {
    return [];
  }

  /** Builds the shot's element. Subclasses must override. */
  build() {
    throw new Error(`${this.constructor.name} must implement build()`);
  }

  /** Moves the shot to `progress` (0 at the start of the shot, 1 at the end). */
  update(progress) {} // eslint-disable-line no-unused-vars

  mount(stage) {
    this.root = this.build();
    this.root.classList.add('shot');
    stage.append(this.root);
    this.update(0);
    // next frame, so the fade-in transition runs
    requestAnimationFrame(() => this.root?.classList.add('shown'));
  }

  unmount() {
    this.root?.remove();
    this.root = null;
  }
}
