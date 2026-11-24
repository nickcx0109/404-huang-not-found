/**
 * Online play keeps fewer dynamic lights: every extra point light costs each player's machine
 * on every frame, and online frames also carry the remote players, the interpolation and the
 * socket. Chapter 2's flashing alarm lights (`alarm.light.count`, 3 offline) drop to one.
 *
 * Applied to the resolved palette before the scene is built (the scene is built once, before
 * any team is joined), only on pages that can go online (`?play=1` with a server configured).
 */
export class LightBudget {
  constructor({ alarmLights = 1 } = {}) {
    this.alarmLights = alarmLights;
  }

  /** Lowers the style's light counts in place; returns true when something changed. */
  apply(style) {
    const light = style?.alarm?.light;
    if (!light || !Number.isFinite(light.count) || light.count <= this.alarmLights) return false;
    light.count = this.alarmLights;
    return true;
  }
}
