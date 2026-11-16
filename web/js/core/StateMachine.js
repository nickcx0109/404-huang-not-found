import { State } from './State.js';

/** Owns one State and a shared context; no rendering or gameplay dependencies. */
export class StateMachine {
  constructor(context = {}) {
    this.context = context;
    this.current = null;
    this._changing = false;
  }

  /**
   * Exits before entering; the same state is a no-op, null stops the machine.
   * Lifecycle hooks must not call change recursively; update may request a transition.
   * Errors propagate: an exit failure retains the old state, an enter failure leaves
   * the new state current. Transition locking is always released.
   */
  change(next) {
    if (this._changing) throw new Error('Cannot change state inside enter or exit');
    if (next !== null && !(next instanceof State)) throw new TypeError('Expected a State or null');
    if (next === this.current) return this.current;
    const previous = this.current;
    this._changing = true;
    try {
      if (previous) previous.exit(this.context, next);
      this.current = next;
      if (next) next.enter(this.context, previous);
    } finally {
      this._changing = false;
    }
    return this.current;
  }

  /** Updates only the current state; an unstarted or stopped machine does nothing. */
  update(dt) {
    if (this.current) this.current.update(dt, this.context);
  }
}
