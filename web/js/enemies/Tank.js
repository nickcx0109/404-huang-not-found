import { Enemy } from './Enemy.js';
import { ChaseBrain } from './Brain.js';

export class Tank extends Enemy {
  constructor(dependencies) {
    super(dependencies, { health: 240, speed: 0.8, attackDamage: 30, brain: new ChaseBrain() });
  }
}
