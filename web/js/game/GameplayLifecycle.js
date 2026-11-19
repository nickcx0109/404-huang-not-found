import { EVENTS } from './events.js';

export class GameplayLifecycle {
  constructor(events, createRun) {
    this.createRun = createRun;
    this.current = null;
    this.disposed = false;
    this.unsubscribe = events.on(EVENTS.RESTART_REQUESTED, () => {
      if (this.current?.session.canRestart) this.restart();
    });
    this.restart();
  }

  restart() {
    if (this.disposed) return null;
    this.current?.dispose();
    this.current = null;
    this.current = this.createRun();
    return this.current.session;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.current?.dispose();
    this.current = null;
  }
}
