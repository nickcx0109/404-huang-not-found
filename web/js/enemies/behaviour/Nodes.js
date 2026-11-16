export const STATUS = Object.freeze({ SUCCESS: 'success', FAILURE: 'failure', RUNNING: 'running' });

export class Node {
  tick(entity, dt, ctx) { throw new Error('Implement Node.tick'); }
}

export class Sequence extends Node {
  constructor(...children) { super(); this.children = children; }

  tick(entity, dt, ctx) {
    for (const child of this.children) {
      const status = child.tick(entity, dt, ctx);
      if (status !== STATUS.SUCCESS) return status;
    }
    return STATUS.SUCCESS;
  }
}

export class Selector extends Node {
  constructor(...children) { super(); this.children = children; }

  tick(entity, dt, ctx) {
    for (const child of this.children) {
      const status = child.tick(entity, dt, ctx);
      if (status !== STATUS.FAILURE) return status;
    }
    return STATUS.FAILURE;
  }
}

export class Condition extends Node {
  constructor(predicate) { super(); this.predicate = predicate; }
  tick(entity, dt, ctx) { return this.predicate(entity, ctx) ? STATUS.SUCCESS : STATUS.FAILURE; }
}

export class Action extends Node {
  constructor(action) { super(); this.action = action; }
  tick(entity, dt, ctx) { return this.action(entity, dt, ctx); }
}
