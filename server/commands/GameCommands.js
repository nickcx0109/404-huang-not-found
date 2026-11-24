import { Command } from './Command.js';

/** `ping`: echo the client time with the server time, for clock sync. */
export class PingCommand extends Command {
  constructor() { super('ping'); }

  execute(server, client, { c }) {
    client.send({ t: 'pong', c, s: server.now() });
  }
}

/** `input`: forwarded to the room's game; ignored outside a playing room. */
export class InputCommand extends Command {
  constructor() { super('input'); }

  execute(server, client, message) {
    client.room?.receiveInput(client.playerId, message);
  }
}

/** `action`: forwarded to the room's game; ignored outside a playing room. */
export class ActionCommand extends Command {
  constructor() { super('action'); }

  execute(server, client, message) {
    client.room?.receiveAction(client.playerId, message);
  }
}
