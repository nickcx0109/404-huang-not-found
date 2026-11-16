import { Enemy } from './Enemy.js';
import { ChaseBrain } from './Brain.js';

export class Walker extends Enemy {
  constructor(dependencies) {
    super(dependencies, { health: 68, speed: 1.6, reward: 25, brain: new ChaseBrain() });
  }
}
