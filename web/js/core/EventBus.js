/** Synchronous Observer bus. Listener errors propagate to the emitter. */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /** Subscribes a callback and returns an unsubscribe function. */
  on(event, listener) {
    return this._subscribe(event, listener, false);
  }

  /** Subscribes for one delivery, removed before invocation to allow recursive emits. */
  once(event, listener) {
    return this._subscribe(event, listener, true);
  }

  /** Removes every subscription of this callback for the given event. */
  off(event, listener) {
    const entries = this._listeners.get(event);
    if (!entries) return false;
    let removed = false;
    for (const entry of entries) {
      if (entry.listener === listener) {
        entries.delete(entry);
        removed = true;
      }
    }
    if (entries.size === 0) this._listeners.delete(event);
    return removed;
  }

  /** Delivers arguments in registration order; additions wait until the next emit. */
  emit(event, ...args) {
    const entries = this._listeners.get(event);
    if (!entries) return 0;
    let delivered = 0;
    for (const entry of Array.from(entries)) {
      if (!entries.has(entry)) continue;
      if (entry.once) this._remove(event, entry);
      delivered++;
      entry.listener(...args);
    }
    return delivered;
  }

  _subscribe(event, listener, once) {
    if (typeof listener !== 'function') throw new TypeError('An event listener must be a function');
    const entry = { listener, once };
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(entry);
    return () => this._remove(event, entry);
  }

  _remove(event, entry) {
    const entries = this._listeners.get(event);
    if (!entries) return false;
    const removed = entries.delete(entry);
    if (entries.size === 0) this._listeners.delete(event);
    return removed;
  }
}
