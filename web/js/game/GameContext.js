export class GameContext {
  constructor({ scene = null, collision, pathFinder, events, level, rng = Math.random }) {
    this.scene = scene;
    this.collision = collision;
    this.pathFinder = pathFinder;
    this.events = events;
    this.level = level;
    this.rng = rng;
    this.time = 0;
    this.pools = new Map();
    this.players = [];
    this.enemies = [];
    this.aim = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } };
    this.session = null;
  }
}
