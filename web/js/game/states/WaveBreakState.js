import { State } from '../../core/State.js';

export class WaveBreakState extends State {
  constructor() { super(); this.name = 'wave-break'; }
  enter(ctx) { ctx.session.beginBreak(); }
  update(dt, ctx) { ctx.session.updateBreak(dt); }
}
