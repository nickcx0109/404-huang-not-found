/** State pattern lifecycle. Subclasses override only the hooks they need. */
export class State {
  /** Called after becoming current, with the shared context and previous state. */
  enter(context, previous) {}

  /** Called before leaving, with the shared context and next state (null when stopped). */
  exit(context, next) {}

  /** Advances the current state by dt seconds using the shared context. */
  update(dt, context) {}
}
