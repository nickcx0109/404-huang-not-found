import { State } from '../../core/State.js';

export class GameOverState extends State {
  constructor() { super(); this.name = 'game-over'; this.canRestart = true; }
  enter(ctx) { ctx.session.finish(); }
}
