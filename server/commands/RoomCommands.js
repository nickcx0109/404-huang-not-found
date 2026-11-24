import { Command } from './Command.js';
import { ErrorCode } from '../protocol/ErrorCodes.js';
import { StartResult } from '../rooms/Room.js';

/**
 * `create`: open a new room and seat the sender as its first player.
 * The new room is opened before the sender leaves the old one, so a failure
 * (no free code, game factory error) leaves the sender where it was.
 */
export class CreateCommand extends Command {
  constructor() { super('create'); }

  execute(server, client, { name, level }) {
    if (!server.levels.has(level)) return server.fail(client, ErrorCode.BAD_LEVEL);
    const room = server.openRoom(level);
    server.leaveRoom(client);
    server.seat(client, room, name);
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

/** `start`: only the room's host may start the game, once; anyone else gets not-host. */
export class StartCommand extends Command {
  constructor() { super('start'); }

  execute(server, client) {
    if (!client.inRoom) return server.fail(client, ErrorCode.NO_ROOM);
    const room = client.room;
    if (!room.isPlaying && !room.isHost(client.playerId)) return server.fail(client, ErrorCode.NOT_HOST);
    // A failed start already told every member start-failed.
    if (room.start() === StartResult.ALREADY_PLAYING) server.fail(client, ErrorCode.STARTED);
  }
}
