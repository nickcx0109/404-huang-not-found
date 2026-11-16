import { State } from '../../core/State.js';

export class LobbyState extends State {
  constructor() { super(); this.name = 'lobby'; }
  update(dt, ctx) { ctx.session.updateLobby(dt); }
}
