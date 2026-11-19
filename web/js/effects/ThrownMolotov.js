import { ThrownObject } from './ThrownObject.js';
import { FireArea } from './FireArea.js';

/** A fire bottle in flight: breaks on the first wall or the ground and leaves a FireArea on the ground there. */
export class ThrownMolotov extends ThrownObject {
  constructor(options) {
    super('molotov', options);
  }

  onWall(ctx) {
    return this._ignite(ctx);
  }

  onGround(ctx) {
    return this._ignite(ctx);
  }

  _ignite(ctx) {
    ctx.effects.push(new FireArea({ x: this.position.x, y: 0, z: this.position.z }, ctx.time, this.ownerId));
    return false;
  }
}
