import { State } from '../../core/State.js';

export class VictoryState extends State {
  constructor() { super(); this.name = 'victory'; this.canRestart = true; }
  enter(ctx) { ctx.session.finishVictory(); }
}
