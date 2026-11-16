/**
 * Shared registration contract for chapter-owned and common prop sets.
 * Builders receive { prop, size: { w, h, d }, factory } and return a
 * Three.js Object3D in metres, +Y up, facing -Z, with its bottom centre at the origin.
 * Extras receive the same context plus object, and complete a loaded model in place.
 * This class has no rendering dependency; PropFactory is supplied by the composition root.
 */
export class PropSet {
  static id = null;

  /** @type {Object<string, (context: {prop: object, size: object, factory: import('../PropFactory.js').PropFactory}) => import('three').Object3D>} */
  static builders = Object.freeze({});

  /** @type {Object<string, (context: {prop: object, size: object, factory: import('../PropFactory.js').PropFactory, object: import('three').Object3D}) => void>} */
  static extras = Object.freeze({});

  /** Announces this set once during startup, before constructing any factories. */
  static registerWith(factoryClass) {
    if (typeof this.id !== 'string' || this.id.length === 0) {
      throw new TypeError('A prop set must define a non-empty static id');
    }
    factoryClass.registerSet(this.id, (factory) => this.registerAll(factory));
  }

  /** Registers this set's builders and model extras with one PropFactory instance. */
  static registerAll(factory) {
    for (const [name, builder] of Object.entries(this.builders)) factory.register(name, builder);
    for (const [name, addExtras] of Object.entries(this.extras)) factory.registerExtras(name, addExtras);
  }
}
