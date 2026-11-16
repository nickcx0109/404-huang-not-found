import { Action, Condition, Selector, Sequence, STATUS } from './behaviour/Nodes.js';

export class Brain {
  update(enemy, dt, ctx) { throw new Error('Implement Brain.update'); }
}

export class ChaseBrain extends Brain {
  constructor() {
    super();
    this.root = new Selector(
      new Sequence(
        new Condition((enemy, ctx) => enemy.canAttack(ctx.players[0], ctx)),
        new Action((enemy, dt, ctx) => { enemy.attack(ctx.players[0], ctx); return STATUS.SUCCESS; })
      ),
      new Action((enemy, dt, ctx) => {
        enemy.moveToward(ctx.players[0], dt, ctx);
        return STATUS.RUNNING;
      })
    );
  }

  update(enemy, dt, ctx) {
    return this.root.tick(enemy, dt, ctx);
  }
}
