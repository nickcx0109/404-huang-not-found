/**
 * Registry (Factory) from the `type` in the cutscene JSON to a Shot subclass.
 * Adding a kind of shot = a new subclass + one `register` call in the entry
 * file; the player never checks types itself.
 */
export class ShotTypes {
  #types = new Map();

  register(type, ShotClass) {
    if (this.#types.has(type)) throw new Error(`Shot type "${type}" is already registered`);
    this.#types.set(type, ShotClass);
    return this;
  }

  has(type) {
    return this.#types.has(type);
  }

  create(spec, options) {
    const ShotClass = this.#types.get(spec.type);
    if (!ShotClass) {
      throw new RangeError(`Unknown shot type "${spec.type}" (known: ${[...this.#types.keys()].join(', ')})`);
    }
    return new ShotClass(spec, options);
  }
}
