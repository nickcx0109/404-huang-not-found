import { Enemy } from './Enemy.js';
import { ChaseBrain } from './Brain.js';

export class Runner extends Enemy {
  constructor(dependencies) {
    super(dependencies, { health: 40, speed: 3.4, brain: new ChaseBrain() });
  }
}
