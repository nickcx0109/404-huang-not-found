import { Enemy } from './Enemy.js';
import { ChaseBrain } from './Brain.js';

export class Runner extends Enemy {
  constructor(dependencies) {
    super(dependencies, { health: 40, speed: 3.4, reward: 25, brain: new ChaseBrain() });
  }
}
