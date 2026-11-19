import { WeaponRig } from './WeaponRig.js';
import { HeldWeaponDriver } from './views/HeldWeaponDriver.js';
import { standardViewModels } from './views/standardViewModels.js';
import { STANDARD_MODELS } from './models/standardModels.js';

const STYLE_URL = '../art/style/chapters/weapons.json';
const MODELS_URL = 'assets/models/';

/**
 * The weapon in the local player's hands, as the App sees it: one thing to update, draw over the
 * scene and resize. Only made with ?play=1 (installGameplay), so the walking mode and the scene
 * screenshots look exactly as before.
 *
 * WeaponRig draws; HeldWeaponDriver turns the game's weapon events into its animations.
 */
export class FirstPersonWeapon {
  constructor(rig, driver, { player, flashlight, clock }) {
    this.rig = rig;
    this.driver = driver;
    this.player = player;
    this.flashlight = flashlight;
    this.clock = clock;
    /** While true (debug stills) the pose is left as it is. */
    this.frozen = false;
  }

  /**
   * @param {App} app
   * @param {GameContext} ctx
   * @param {CombatPlayer} player  the local player
   */
  static async create(app, ctx, player) {
    const rig = await WeaponRig.create({
      styleUrl: STYLE_URL,
      modelsUrl: MODELS_URL,
      levelStyle: app.style,
      events: ctx.events,
      registry: standardViewModels(STANDARD_MODELS),
    });
    rig.resize(app.camera.aspect);
    const driver = new HeldWeaponDriver(ctx.events, player.id, player.weapons, rig);
    return new FirstPersonWeapon(rig, driver, { player: app.player, flashlight: app.flashlight, clock: () => ctx.time });
  }

  /** @param {number} dt seconds  @param {number} time seconds on the animation clock */
  update(dt, time) {
    if (this.frozen) return;
    this.driver.update(this.clock());
    this.rig.update(dt, time, this.player, this.flashlight.on);
  }

  render(renderer) {
    this.rig.render(renderer);
  }

  resize(aspect) {
    this.rig.resize(aspect);
  }

  /** For ?debug=1: show any weapon, or one still moment of one of its clips. */
  debugHandle() {
    return Object.freeze({
      ids: this.rig.registry.ids,
      equip: id => {
        this.frozen = false;
        return this.rig.equip(id);
      },
      freeze: (clip, time) => {
        this.frozen = true;
        this.rig.freeze(clip || null, time || 0);
      },
      thaw: () => {
        this.frozen = false;
      },
      /** What is in hand and which animation is playing. */
      now: () => {
        const view = this.rig.view;
        return view ? { id: view.id, state: view.state.constructor.name, clip: view.state.clip?.name ?? null } : null;
      },
    });
  }

  dispose() {
    this.driver.dispose();
    this.rig.dispose();
  }
}
