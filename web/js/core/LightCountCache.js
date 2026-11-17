/** Cache light membership without traversing the scene on every frame.
 * Three r128's added/removed events do not bubble. Observe each node's add/remove
 * instead, so adding a light to an existing nested group is also tracked.
 */
export class LightCountCache {
  constructor(root) {
    this.root = root;
    this.lights = new Set();
    this._nodes = new Map();
    this._watch(root);
  }

  _watch(node) {
    if (this._nodes.has(node)) return;
    const cache = this;
    const methods = { add: node.add, remove: node.remove };
    const descriptors = {
      add: Object.getOwnPropertyDescriptor(node, 'add'),
      remove: Object.getOwnPropertyDescriptor(node, 'remove'),
    };
    this._nodes.set(node, descriptors);
    node.add = function (...objects) {
      const result = methods.add.apply(this, objects);
      // Object3D.add may call remove on the old parent during reparenting.
      for (const object of objects) {
        if (object.parent === node) cache._watch(object);
      }
      return result;
    };
    node.remove = function (...objects) {
      const removed = objects.filter(object => object.parent === node);
      const result = methods.remove.apply(this, objects);
      for (const object of removed) {
        if (object.parent !== node) cache._unwatch(object);
      }
      return result;
    };
    if (node.isLight && !node.isAmbientLight && !node.isHemisphereLight) this.lights.add(node);
    for (const child of node.children) this._watch(child);
  }

  _unwatch(node) {
    const descriptors = this._nodes.get(node);
    if (!descriptors) return;
    for (const key of ['add', 'remove']) {
      if (descriptors[key]) Object.defineProperty(node, key, descriptors[key]);
      else delete node[key];
    }
    this._nodes.delete(node);
    this.lights.delete(node);
    for (const child of node.children) this._unwatch(child);
  }

  /** Explicit rebuild for callers that bypass Object3D.add/remove. */
  invalidate() {
    this.dispose();
    this._watch(this.root);
  }

  count() {
    let count = 0;
    // Visibility is mutable without events. Check only lights and their ancestors,
    // preserving traverseVisible semantics without visiting meshes every frame.
    for (const light of this.lights) {
      let node = light;
      while (node && node.visible !== false) {
        if (node === this.root) { count++; break; }
        node = node.parent;
      }
    }
    return count;
  }

  dispose() {
    // Include detached nodes if a caller bypassed remove before invalidating.
    for (const node of this._nodes.keys()) this._unwatch(node);
  }
}
