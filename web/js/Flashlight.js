import * as THREE from 'three';

// Flashlight: the player's SpotLight. It is attached to the camera, slightly off the eye
// (as if hand-held) so that it throws visible shadows. On by default.
const AIM_DISTANCE = 12; // metres in front of the eye where the beam crosses the view axis

export class Flashlight {
  /** @param {THREE.Camera} camera  must be part of the scene graph */
  constructor(camera) {
    this.light = new THREE.SpotLight();
    this.light.name = 'flashlight';
    this.light.target.position.set(0, 0, -AIM_DISTANCE);
    camera.add(this.light);
    camera.add(this.light.target);
    this._intensity = this.light.intensity;
    this._on = true;
  }

  /** Values come from Atmosphere (palette.json): colour is linear, angle in radians. */
  configure(cfg) {
    const light = this.light;
    light.color.copy(cfg.color);
    light.distance = cfg.distance;
    light.angle = cfg.angle;
    light.penumbra = cfg.penumbra;
    light.decay = cfg.decay;
    if (cfg.offset) light.position.fromArray(cfg.offset);

    const shadow = cfg.shadow || {};
    light.castShadow = Boolean(shadow.enabled);
    if (light.castShadow) {
      light.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
      light.shadow.camera.near = 0.2;
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.bias = shadow.bias;
    }

    this._intensity = cfg.intensity;
    light.intensity = this._on ? this._intensity : 0;
  }

  get on() {
    return this._on;
  }

  set on(value) {
    this._on = Boolean(value);
    // Intensity 0 instead of visible=false: the light count stays the same, so toggling
    // never forces every material to recompile.
    this.light.intensity = this._on ? this._intensity : 0;
  }

  toggle() {
    this.on = !this.on;
    return this.on;
  }
}
