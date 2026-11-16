import * as THREE from 'three';
import { PostFX } from './PostFX.js';
import { Palette } from './Palette.js';

// Atmosphere: turns a resolved palette style into fog, scene lights, flashlight settings
// and post-processing settings. It is the only place that maps palette numbers to the renderer.
// FogExp2 leaves exp(-(density * d)^2) of an object's colour. Beyond this distance less
// than 1 % is left, so the camera far plane can stop there (fog doubles as a culling tool).
const FOG_CUTOFF = Math.sqrt(Math.log(100));
const FAR_MIN = 20;
const FAR_MAX = 400;

export class Atmosphere {
  /** @param {object} style  result of Palette.resolve() */
  constructor(style) {
    this.style = style;
    this.fog = null;
    this.hemisphere = null;
    this.moon = null;
    this.lights = new THREE.Group();
    this.lights.name = 'atmosphere-lights';
  }

  /** Fog, background and ambient lights; also pulls the camera far plane in to the fog. */
  applyTo(scene, camera) {
    const s = this.style;

    // fog.color in the palette is the colour as seen on screen, so undo the post chain here.
    const fogColor = PostFX.sceneColorForDisplay(Palette.color(s.fog.color), s.post);
    this.fog = new THREE.FogExp2(fogColor.getHex(), s.fog.density);
    this.fog.color.copy(fogColor);
    scene.fog = this.fog;
    scene.background = fogColor.clone();

    this.hemisphere = new THREE.HemisphereLight(
      Palette.color(s.hemisphere.sky),
      Palette.color(s.hemisphere.ground),
      s.hemisphere.intensity
    );
    this.lights.add(this.hemisphere);

    // Intensity 0 means "no moon": the light is not created, which frees one of the few
    // dynamic-light slots for the level's own lights.
    if (s.moon.intensity > 0) {
      this.moon = new THREE.DirectionalLight(Palette.color(s.moon.color), s.moon.intensity);
      this.moon.position.fromArray(s.moon.direction).normalize().multiplyScalar(50);
      this.lights.add(this.moon);
    }

    scene.add(this.lights);

    if (camera) {
      camera.far = this.viewDistance();
      camera.updateProjectionMatrix();
    }
  }

  /** Distance at which the fog has swallowed everything. */
  viewDistance() {
    const density = this.style.fog.density;
    if (!(density > 0)) return FAR_MAX;
    return Math.min(FAR_MAX, Math.max(FAR_MIN, FOG_CUTOFF / density));
  }

  /** @param {Flashlight} flashlight */
  configureFlashlight(flashlight) {
    const f = this.style.flashlight;
    flashlight.configure({
      color: Palette.color(f.color),
      intensity: f.intensity,
      distance: f.distance,
      angle: THREE.MathUtils.degToRad(f.angle),
      penumbra: f.penumbra,
      decay: f.decay,
      offset: f.offset,
      shadow: f.shadow,
    });
  }

  /** @param {PostFX} postfx */
  configurePost(postfx) {
    postfx.setParams(this.style.post);
  }

  /** True when any light of this style wants shadows (the renderer needs to know up front). */
  wantsShadows() {
    const shadow = this.style.flashlight.shadow;
    return Boolean(shadow && shadow.enabled);
  }

  /** Per-frame hook for animated atmosphere (flicker, drifting fog). Nothing moves yet. */
  update(dt, time) {} // eslint-disable-line no-unused-vars
}
