import { Action, Condition, Selector, Sequence, STATUS } from './behaviour/Nodes.js';

export class Brain {
  update(enemy, dt, ctx) { throw new Error('Implement Brain.update'); }
}

export class ChaseBrain extends Brain {
  constructor() {
    super();
    this.root = new Selector(
      new Sequence(
        new Condition((enemy, ctx) => enemy.canAttack(enemy.chaseTarget, ctx)),
        new Action((enemy, dt, ctx) => { enemy.attack(enemy.chaseTarget, ctx); return STATUS.SUCCESS; })
      ),
      new Action((enemy, dt, ctx) => {
        enemy.moveToward(enemy.chaseTarget, dt, ctx);
        return STATUS.RUNNING;
      })
    );
  }

  update(enemy, dt, ctx) {
    enemy.chaseTarget = null;
    let distance = Infinity;
    for (const player of ctx.players) {
      if (!player.damageable.alive || player.downed) continue;
      const next = Math.hypot(player.position.x - enemy.position.x, player.position.z - enemy.position.z);
      if (next < distance) { distance = next; enemy.chaseTarget = player; }
    }
    return this.root.tick(enemy, dt, ctx);
  }
}
