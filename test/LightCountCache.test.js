import test from 'node:test';
import assert from 'node:assert/strict';
import { LightCountCache } from '../web/js/core/LightCountCache.js';

// Object3D r128's parent/children and add/remove contract, without WebGL or DOM.
class Node {
  constructor(flags = {}) {
    this.children = [];
    this.parent = null;
    this.visible = true;
    Object.assign(this, flags);
  }
  add(...objects) {
    for (const object of objects) {
      if (object.parent) object.parent.remove(object);
      object.parent = this;
      this.children.push(object);
    }
    return this;
  }
  remove(...objects) {
    for (const object of objects) {
      const index = this.children.indexOf(object);
      if (index !== -1) {
        this.children.splice(index, 1);
        object.parent = null;
      }
    }
    return this;
  }
}
const light = flags => new Node({ isLight: true, ...flags });

test('tracks nested dynamic lights, group removal and reparenting', () => {
  const root = new Node(), group = new Node(), other = new Node();
  root.add(group, other);
  group.add(light(), light({ isAmbientLight: true }), light({ isHemisphereLight: true }));
  const cache = new LightCountCache(root);
  assert.equal(cache.count(), 1);
  const dynamic = light();
  assert.equal(group.add(dynamic), group);
  assert.equal(cache.count(), 2);
  other.add(dynamic);
  assert.equal(cache.count(), 2);
  root.remove(group);
  assert.equal(cache.count(), 1);
  group.add(light()); // detached group is no longer watched
  root.add(group);
  assert.equal(cache.count(), 3);
  other.remove(dynamic);
  assert.equal(cache.count(), 2);
  cache.dispose();
  assert.equal(root.add, Node.prototype.add);
  assert.equal(group.remove, Node.prototype.remove);
});

test('preserves ancestor visibility and zero-intensity light semantics', () => {
  const root = new Node(), group = new Node(), lamp = light({ intensity: 0 });
  root.add(group); group.add(lamp);
  const cache = new LightCountCache(root);
  assert.equal(cache.count(), 1);
  for (const node of [root, group, lamp]) {
    node.visible = false;
    assert.equal(cache.count(), 0);
    node.visible = true;
    assert.equal(cache.count(), 1);
  }
});

test('steady-state counting never reads scene children; explicit invalidation rebuilds membership', () => {
  const root = new Node(), group = new Node();
  root.add(group); group.add(light());
  const cache = new LightCountCache(root);
  const children = root.children;
  Object.defineProperty(root, 'children', { configurable: true, get() { throw Error('scene traversal'); } });
  assert.equal(cache.count(), 1);
  assert.equal(cache.count(), 1);
  Object.defineProperty(root, 'children', { configurable: true, writable: true, value: children });
  const dynamic = light();
  dynamic.parent = root;
  root.children.push(dynamic); // unsupported direct mutation requires invalidate
  cache.invalidate();
  assert.equal(cache.count(), 2);
  dynamic.add(light());
  assert.equal(cache.count(), 3);
});
