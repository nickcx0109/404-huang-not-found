import { Command } from './Command.js';
import { ErrorCode } from '../protocol/ErrorCodes.js';

/** `create`: open a new room and seat the sender as its first player. */
export class CreateCommand extends Command {
  constructor() { super('create'); }

  execute(server, client, { name, level }) {
    server.leaveRoom(client);
    server.seat(client, server.openRoom(level), name);
  }
}

/** `join`: enter an existing lobby by code. A refused join keeps the sender where it was. */
export class JoinCommand extends Command {
  constructor() { super('join'); }

  execute(server, client, { name, code }) {
    const room = server.findRoom(code);
    if (!room) return server.fail(client, ErrorCode.NO_ROOM);
    if (client.room === room) return client.send(room.describeFor(client.playerId));
    const refusal = room.admitRefusal();
    if (refusal) return server.fail(client, refusal);
    server.leaveRoom(client);
    server.seat(client, room, name);
  }
}

/** `leave`: quit the current room; harmless when not in one. */
export class LeaveCommand extends Command {
  constructor() { super('leave'); }

  execute(server, client) {
    server.leaveRoom(client);
  }
}

/** `start`: any member may start the game once. */
export class StartCommand extends Command {
  constructor() { super('start'); }

  execute(server, client) {
    if (!client.inRoom) return server.fail(client, ErrorCode.NO_ROOM);
    if (!client.room.start()) server.fail(client, ErrorCode.STARTED);
  }
}
