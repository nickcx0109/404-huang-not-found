import { Throwable } from './Throwable.js';
import { ThrownGrenade } from '../effects/ThrownGrenade.js';

/** Hand grenade: bounces, goes off 3 seconds after the throw, 150 damage at the centre down to 30 at 5 m. */
export class Grenade extends Throwable {
  constructor({ count = 1 } = {}) {
    super({ id: 'grenade', count });
  }

  launch(options) {
    return new ThrownGrenade(options);
  }
}
