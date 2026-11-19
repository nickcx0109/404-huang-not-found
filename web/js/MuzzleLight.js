import * as THREE from 'three';
import { Palette } from './Palette.js';
import { MuzzleGlow } from './weapons/MuzzleGlow.js';

// MuzzleLight: a shot lights up the world in front of the player for a moment, like the
// flashlight but wider and yellower. A SpotLight on the camera next to the flashlight, kept at
// intensity 0 between shots (adding a light mid-game would recompile every material).
// Only made with ?play=1 (FirstPersonWeapon), so the scene screenshots stay the same.
//
// Its look is "viewmodel.muzzleFlash.world" in art/style/chapters/weapons.json. It listens to
// 'weapon:muzzle-flash', which WeaponRig sends when a gun in hand flashes.
const AIM_DISTANCE = 12;

export class MuzzleLight {
  /**
   * @param {THREE.Camera} camera  must be part of the scene graph
   * @param {EventBus} events
   * @param {{color: string, intensity: number, seconds: number, angle: number, penumbra: number,
   *   distance: number, decay: number, offset?: number[]}} cfg  angle in degrees
   */
  constructor(camera, events, cfg) {
    this.camera = camera;
    this.glow = new MuzzleGlow({ peak: cfg.intensity, seconds: cfg.seconds });
    const light = new THREE.SpotLight(Palette.color(cfg.color), 0, cfg.distance, THREE.MathUtils.degToRad(cfg.angle), cfg.penumbra, cfg.decay);
    light.name = 'muzzle-light';
    if (cfg.offset) light.position.fromArray(cfg.offset);
    light.target.position.set(0, 0, -AIM_DISTANCE);
    camera.add(light, light.target);
    this.light = light;
    this._off = events.on('weapon:muzzle-flash', () => this.glow.flash());
  }

  /** @param {number} dt seconds */
  update(dt) {
    this.light.intensity = this.glow.update(dt);
  }

  dispose() {
    this._off();
    this.camera.remove(this.light, this.light.target);
    this.light.dispose?.();
  }
}
