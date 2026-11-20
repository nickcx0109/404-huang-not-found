import * as THREE from 'three';
import { Palette } from './Palette.js';

// Emitters: everything in a level that glows or is a small coloured light — the chapter's
// accent colour (signs, tail lights), the red alarm beacons and dim screens — plus their
// animation (sign flicker, beacon rotation). Colours and numbers come from the palette's
// "accent", "alarm" and "greybox" sections.
//
// Real lights are expensive (PERFORMANCE_PLAN 3.1: 4 at once, flashlight included), so the
// palette decides how many exist; everything else only looks lit (self-lit material + bloom).
// Offsets into the flicker sequence, picked so that at time 0 (what ?shot= renders) the
// sign is lit and its failing part is dark: a still frame should still read as "broken sign".
const FLICKER_SALT_MAIN = 13;
const FLICKER_SALT_FAULTY = 27;

function hash01(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export class Emitters {
  /** @param {object} style  resolved palette style */
  constructor(style) {
    this.accent = style.accent;
    this.alarm = style.alarm;
    this.screen = style.greybox.screen;
    this._materials = new Map();
    this._animations = [];
    this._alarmLights = 0;
  }

  /** Advances every animated emitter. `time` is in seconds; the same time gives the same state. */
  update(time) {
    for (let i = 0; i < this._animations.length; i++) this._animations[i](time);
  }

  /**
   * Registers `step(time)` to run on every update together with the built-in emitters, for
   * chapter props that glow or flicker on their own (a campfire, a cabin lamp). Like the others it
   * must depend only on `time`, so a still frame (?shot=, fixed time) always looks the same.
   */
  addAnimation(step) {
    this._animations.push(step);
    return step;
  }

  // ---- accent: the chapter's guide colour ------------------------------------

  /** Brightness (0..1) of the accent at `time`; 1 when the palette defines no flicker. */
  accentLevel(time, faulty) {
    const f = this.accent.flicker;
    if (!f) return 1;
    const tick = Math.floor(time * f.rate);
    if (faulty) {
      return hash01(tick + FLICKER_SALT_FAULTY) < f.faultyDropChance ? f.faultyDim : 1;
    }
    return hash01(tick + FLICKER_SALT_MAIN) < f.dropChance ? f.dim : 1;
  }

  /** Self-lit accent material: brighter than 1, so it reads through fog and feeds the bloom. */
  accentMaterial() {
    return this._glow('accent', this.accent.color, this.accent.intensity, (time) =>
      this.accentLevel(time, false)
    );
  }

  /** Accent material for the part of a sign that is failing: dark most of the time. */
  accentFaultyMaterial() {
    return this._glow('accent-faulty', this.accent.color, this.accent.intensity, (time) =>
      this.accentLevel(time, true)
    );
  }

  /** Point light in the accent colour, or null when the palette turns it off (intensity 0). */
  accentLight() {
    const cfg = this.accent.light;
    if (!cfg || !(cfg.intensity > 0)) return null;
    const light = new THREE.PointLight(
      Palette.color(this.accent.color), cfg.intensity, cfg.distance, cfg.decay
    );
    light.name = 'accent-light';
    if (this.accent.flicker) {
      this._animations.push((time) => {
        light.intensity = cfg.intensity * this.accentLevel(time, false);
      });
    }
    return light;
  }

  // ---- alarm: red rotating warning beacons --------------------------------------

  /** Brightness (0..1) of a beacon lens: one flash per turn, as seen from a fixed spot. */
  alarmLevel(time) {
    const turns = (time * this.alarm.light.rpm) / 60;
    const facing = 0.5 + 0.5 * Math.cos(turns * Math.PI * 2);
    return this.alarm.pulseMin + (1 - this.alarm.pulseMin) * Math.pow(facing, 4);
  }

  alarmMaterial() {
    return this._glow('alarm', this.alarm.color, this.alarm.intensity, (time) =>
      this.alarmLevel(time)
    );
  }

  /**
   * Moving spot light for a beacon. Only the first `alarm.light.count` requests get one;
   * later beacons return null and rely on their glowing lens alone.
   * With `alarm.light.sweep` (degrees) the beam swings that far to each side of where the
   * beacon faces, so the area in front of it stays lit most of the time; without it the
   * beam turns full circles.
   * @returns {THREE.Group|null} holds the light and its target; place it at the lamp
   */
  alarmLight() {
    const cfg = this.alarm.light;
    if (!cfg || !(cfg.intensity > 0) || this._alarmLights >= cfg.count) return null;
    this._alarmLights++;

    const light = new THREE.SpotLight(
      Palette.color(this.alarm.color),
      cfg.intensity,
      cfg.distance,
      THREE.MathUtils.degToRad(cfg.angle),
      cfg.penumbra,
      cfg.decay
    );
    light.name = 'alarm-light';
    const rig = new THREE.Group();
    rig.add(light);
    rig.add(light.target);

    const tilt = Math.tan(THREE.MathUtils.degToRad(cfg.tilt));
    const aim = (time) => {
      const turns = (time * cfg.rpm) / 60;
      const swing = cfg.sweep > 0 ? cfg.sweep * Math.sin(turns * Math.PI * 2) : turns * 360;
      // heading 0 points toward the beacon's front (-Z), positive turns toward +X
      const heading = THREE.MathUtils.degToRad(cfg.startAngle + swing);
      light.target.position.set(Math.sin(heading), tilt, -Math.cos(heading));
    };
    aim(0);
    this._animations.push(aim);
    return rig;
  }

  // ---- screens --------------------------------------------------------------------

  /** Dim neutral glow for terminals and panels: findable, but not a guide colour. */
  screenMaterial() {
    return this._glow('screen', this.screen.color, this.screen.intensity, null);
  }

  // ---- internals ------------------------------------------------------------------

  _glow(key, hex, intensity, levelAt) {
    let material = this._materials.get(key);
    if (!material) {
      const base = Palette.color(hex).multiplyScalar(intensity);
      material = new THREE.MeshBasicMaterial({ color: base.clone() });
      material.name = 'glow:' + key;
      this._materials.set(key, material);
      if (levelAt) {
        const animate = (time) => material.color.copy(base).multiplyScalar(levelAt(time));
        animate(0);
        this._animations.push(animate);
      }
    }
    return material;
  }
}
