import { State } from '../../core/State.js';

export class PlayingState extends State {
  constructor() { super(); this.name = 'playing'; }
  enter(ctx) { ctx.session.beginWave(); }
  update(dt, ctx) { ctx.session.updatePlaying(dt); }
}
