import { Clip } from '../Clip.js';

/**
 * Ready-made clips shared by many weapons, so each weapon view only states what is its own
 * (how hard it kicks, which part slides). No Three.js. Offsets are metres and radians in game
 * axes: the muzzle (or blade tip) points toward -Z, a positive gun.rot.x lifts it, a positive
 * gun.rot.y turns it left.
 */
export class ClipKit {
  /** Brought up from below the view. */
  static raise({ seconds = 0.45, drop = 0.26, tilt = 0.9, roll = 0.3 } = {}) {
    return new Clip('equip', seconds, {
      'gun.pos.y': [[0, -drop], [seconds * 0.72, 0.006, 'out'], [seconds, 0, 'inOut']],
      'gun.rot.x': [[0, -tilt], [seconds * 0.68, 0.06, 'out'], [seconds, 0, 'inOut']],
      'gun.rot.z': [[0, roll], [seconds * 0.8, 0, 'out']],
    }, [[0, 'raise']]);
  }

  /**
   * One shot: back into the shoulder, muzzle up, settle. `parts` adds the moving pieces
   * (e.g. a bolt that snaps back). The 'shot' event at 0 lights the muzzle flash.
   */
  static shot({ seconds = 0.2, kick = 0.03, rise = 0.08, roll = -0.03, parts = {} } = {}) {
    return new Clip('fire', seconds, {
      'gun.pos.z': [[0, 0], [seconds * 0.15, kick, 'out'], [seconds, 0, 'inOut']],
      'gun.pos.y': [[0, 0], [seconds * 0.2, kick * 0.25, 'out'], [seconds, 0, 'inOut']],
      'gun.rot.x': [[0, 0], [seconds * 0.2, rise, 'out'], [seconds, 0, 'inOut']],
      'gun.rot.z': [[0, 0], [seconds * 0.2, roll, 'out'], [seconds * 0.85, 0, 'inOut']],
      ...parts,
    }, [[0, 'shot']]);
  }

  /**
   * Magazine change: tip the weapon, the magazine drops out and a new one comes up and is slapped
   * home, then the charging handle (if any) is pulled. Played at whatever speed the game's
   * reload takes. `magazine` is the direction the magazine leaves in.
   */
  static magazineSwap({ seconds = 1.8, magazine = [0, -1, 0.15], depth = 0.22, charge = 0.05,
    tilt = 0.35, roll = -0.45 } = {}) {
    const t = k => seconds * k;
    return new Clip('reload', seconds, {
      'gun.rot.x': [[0, 0], [t(0.14), tilt, 'inOut'], [t(0.62), tilt], [t(0.7), tilt * 0.6, 'out'], [t(0.74), tilt], [t(0.9), 0, 'inOut']],
      'gun.rot.z': [[0, 0], [t(0.14), roll, 'inOut'], [t(0.72), roll], [t(0.9), 0, 'inOut']],
      'gun.pos.y': [[0, 0], [t(0.14), 0.03, 'inOut'], [t(0.6), 0.03], [t(0.64), 0.045, 'out'], [t(0.7), 0.03, 'inOut'], [t(0.9), 0, 'inOut']],
      ...Clip.along('magazine.pos', magazine, [
        [0, 0], [t(0.16), 0], [t(0.34), depth, 'in'], [t(0.42), depth, 'step'], [t(0.6), 0.015, 'out'], [t(0.64), 0, 'in'],
      ]),
      'charge.pos.z': [[0, 0], [t(0.74), 0], [t(0.8), charge, 'out'], [t(0.84), charge], [t(0.88), 0, 'in']],
    }, [[t(0.16), 'mag-out'], [t(0.64), 'mag-in'], [t(0.8), 'charge']]);
  }

  /**
   * A cut from one side to the other. `from` and `to` are [rot.x, rot.y, rot.z] of the whole
   * weapon; the cut itself takes `sweep` seconds (it should match the blade light on the screen).
   */
  static swing({ name = 'fire', seconds = 0.45, windup = 0.05, sweep = 0.08, from, to, reach = 0.08 }) {
    const hit = windup + sweep;
    const track = i => [[0, 0], [windup, from[i], 'out'], [hit, to[i], 'in'], [hit + 0.06, to[i] * 1.05, 'out'], [seconds, 0, 'inOut']];
    return new Clip(name, seconds, {
      'gun.rot.x': track(0),
      'gun.rot.y': track(1),
      'gun.rot.z': track(2),
      'gun.pos.x': [[0, 0], [windup, -from[1] * 0.12, 'out'], [hit, -to[1] * 0.12, 'in'], [seconds, 0, 'inOut']],
      'gun.pos.z': [[0, 0], [windup, 0.03, 'out'], [windup + sweep * 0.5, -reach, 'in'], [seconds, 0, 'inOut']],
    }, [[windup, 'swing'], [hit, 'cut']]);
  }

  /** Thrown overarm: drawn back, flung forward, gone from the view, then the next one comes up. */
  static toss({ seconds = 0.75, parts = {} } = {}) {
    const t = k => seconds * k;
    return new Clip('fire', seconds, {
      'gun.pos.z': [[0, 0], [t(0.3), 0.1, 'out'], [t(0.45), -0.32, 'in'], [t(0.6), -0.32], [t(0.61), 0.05, 'step'], [seconds, 0, 'out']],
      'gun.pos.y': [[0, 0], [t(0.3), 0.08, 'out'], [t(0.45), 0.04, 'in'], [t(0.6), -0.28, 'in'], [t(0.61), -0.3, 'step'], [seconds, 0, 'out']],
      'gun.rot.x': [[0, 0], [t(0.3), -0.7, 'out'], [t(0.45), 0.5, 'in'], [t(0.6), -0.9], [seconds, 0, 'out']],
      'gun.pos.x': [[0, 0], [t(0.3), 0.04, 'out'], [t(0.45), -0.06, 'in'], [t(0.6), 0], [seconds, 0]],
      ...parts,
    }, [[t(0.42), 'release']]);
  }
}
