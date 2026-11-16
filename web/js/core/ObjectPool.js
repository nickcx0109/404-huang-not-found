/** Lazy LIFO pool. Only acquired values may be released, and reset runs before reuse. */
export class ObjectPool {
  /** @param {() => object} factory @param {(object: object) => void} [reset] */
  constructor(factory, reset = () => {}) {
    if (typeof factory !== 'function' || typeof reset !== 'function') {
      throw new TypeError('ObjectPool requires factory and reset functions');
    }
    this._factory = factory;
    this._reset = reset;
    this._available = [];
    this._active = new Set();
  }

  /** Returns a free value, creating one only when none are available. */
  acquire() {
    const object = this._available.length > 0 ? this._available.pop() : this._factory();
    if (this._active.has(object)) throw new Error('The pool factory returned an active object');
    this._active.add(object);
    return object;
  }

  /** A reset failure leaves the object acquired so callers can repair it and retry. */
  release(object) {
    if (!this._active.has(object)) throw new TypeError('Only an acquired object may be released');
    this._reset(object);
    this._active.delete(object);
    this._available.push(object);
  }

  get activeCount() {
    return this._active.size;
  }

  get availableCount() {
    return this._available.length;
  }
}
