export class Entity {
  constructor(id, position = { x: 0, y: 0, z: 0 }) {
    this.id = id;
    this.position = { x: position.x, y: position.y ?? 0, z: position.z };
    this.disposed = false;
  }

  update(dt, ctx) {}

  dispose() {
    this.disposed = true;
  }
}
