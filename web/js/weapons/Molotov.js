import { Throwable } from './Throwable.js';
import { ThrownMolotov } from '../effects/ThrownMolotov.js';

/** Fire bottle: breaks on the first thing it hits and sets 3 m of ground on fire for 6 seconds, 25 damage a second. */
export class Molotov extends Throwable {
  constructor({ count = 1 } = {}) {
    super({ id: 'molotov', count });
  }

  launch(options) {
    return new ThrownMolotov(options);
  }
}
