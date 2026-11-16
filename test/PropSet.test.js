import test from 'node:test';
import assert from 'node:assert/strict';
import { PropSet } from '../web/js/props/PropSet.js';

function registrationTarget() {
  return {
    sets: [],
    registerSet(name, register) { this.sets.push({ name, register }); },
  };
}

function factoryTarget() {
  return {
    builders: new Map(),
    extras: new Map(),
    register(name, builder) { this.builders.set(name, builder); },
    registerExtras(name, extras) { this.extras.set(name, extras); },
  };
}

test('PropSet announces its owner and defers builder/extras registration until factory creation', () => {
  const object = {};
  const builder = (context) => { object.context = context; return object; };
  const extra = (context) => { context.object.completed = true; };
  class ChapterProps extends PropSet {
    static id = 'chapter';
    static builders = { sample: builder };
    static extras = { sample: extra };
  }
  const target = registrationTarget();
  ChapterProps.registerWith(target);
  assert.equal(target.sets.length, 1);
  assert.equal(target.sets[0].name, 'chapter');
  const factory = factoryTarget();
  assert.equal(factory.builders.size, 0);
  target.sets[0].register(factory);
  assert.equal(factory.builders.get('sample'), builder);
  assert.equal(factory.extras.get('sample'), extra);
  const context = { prop: {}, size: { w: 1, h: 2, d: 3 }, factory };
  assert.equal(factory.builders.get('sample')(context), object);
  assert.equal(object.context, context);
  factory.extras.get('sample')({ ...context, object });
  assert.equal(object.completed, true);
});

test('PropSet preserves set order and registers on every factory independently', () => {
  const sharedBuilder = () => ({});
  const chapterBuilder = () => ({});
  class SharedProps extends PropSet {
    static id = 'common';
    static builders = { shared: sharedBuilder };
  }
  class ChapterProps extends PropSet {
    static id = 'chapter';
    static builders = { chapter: chapterBuilder };
  }
  const target = registrationTarget();
  SharedProps.registerWith(target);
  ChapterProps.registerWith(target);
  assert.deepEqual(target.sets.map((set) => set.name), ['common', 'chapter']);
  for (const factory of [factoryTarget(), factoryTarget()]) {
    for (const set of target.sets) set.register(factory);
    assert.deepEqual([...factory.builders.keys()], ['shared', 'chapter']);
    assert.equal(factory.builders.get('chapter'), chapterBuilder);
  }
});

test('PropSet supports an empty chapter and rejects missing ownership', () => {
  class EmptyProps extends PropSet { static id = 'empty'; }
  const target = registrationTarget();
  EmptyProps.registerWith(target);
  const factory = factoryTarget();
  target.sets[0].register(factory);
  assert.equal(factory.builders.size, 0);
  assert.equal(factory.extras.size, 0);
  assert.throws(() => PropSet.registerWith(target), TypeError);
  assert.equal(target.sets.length, 1);
});
