import { CollisionWorld } from '../CollisionWorld.js';

/** Applies only server-owned block removals; local browser progress is restored on leaving. */
export class LevelFlowMirror {
  constructor(level, collision, root) {
    this.level = level.name;
    this.collision = collision;
    this.original = collision.boxes.slice();
    this.visuals = root.children.filter(object => object.userData.propName && object.userData.collider?.startsWith('block_to_'));
    this.visibility = this.visuals.map(object => object.visible);
    this.blocks = CollisionWorld.fromLevel(level).boxes.filter(box => box.id?.startsWith('block_to_'));
    this.apply([]);
  }

  apply(cleared) {
    if (!Array.isArray(cleared)) return;
    const removed = new Set(cleared.map(key => key.startsWith(this.level + ':') ? 'block_' + key.slice(this.level.length + 1) : ''));
    const fixed = this.collision.boxes.filter(box => !box.id?.startsWith('block_to_'));
    this.collision.boxes.splice(0, this.collision.boxes.length, ...fixed, ...this.blocks.filter(box => !removed.has(box.id)));
    for (const object of this.visuals) object.visible = !removed.has(object.userData.collider);
  }

  dispose() {
    this.collision.boxes.splice(0, this.collision.boxes.length, ...this.original);
    this.visuals.forEach((object, index) => { object.visible = this.visibility[index]; });
  }
}
