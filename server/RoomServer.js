import { Client } from './Client.js';
import { Room } from './rooms/Room.js';
import { RoomGame } from './rooms/RoomGame.js';
import { RoomCodes } from './rooms/RoomCodes.js';
import { MessageParser } from './protocol/ClientMessages.js';
import { ErrorCode } from './protocol/ErrorCodes.js';
import { defaultCommands } from './commands/index.js';

/**
 * Owns every room and routes client messages to commands.
 * Transport-agnostic: a transport calls `connect`, `receive` and `disconnect`
 * with any connection object that has `send(text)`.
 */
export class RoomServer {
  /**
   * @param {{
   *   codes?: RoomCodes,
   *   createGame?: (info: { code: string, level: string }) => RoomGame,
   *   parser?: MessageParser,
   *   commands?: import('./commands/Command.js').Command[],
   *   now?: () => number,
   * }} [options]
   */
  constructor({
    codes = new RoomCodes(),
    createGame = () => new RoomGame(),
    parser = new MessageParser(),
    commands = defaultCommands(),
    now = () => Date.now(),
  } = {}) {
    this.codes = codes;
    this.createGame = createGame;
    this.parser = parser;
    this.commands = new Map(commands.map(command => [command.type, command]));
    this.now = now;
    this.rooms = new Map();
    this.clients = new Map();
  }

  connect(connection) {
    const client = new Client(connection);
    this.clients.set(connection, client);
    return client;
  }

  receive(connection, text) {
    const client = this.clients.get(connection);
    if (!client) return;
    const message = this.parser.parse(text);
    const command = message && this.commands.get(message.t);
    if (!command) return this.fail(client, ErrorCode.BAD_MESSAGE);
    command.execute(this, client, message);
  }

  disconnect(connection) {
    const client = this.clients.get(connection);
    if (!client) return;
    this.leaveRoom(client);
    this.clients.delete(connection);
  }

  /** Advances every room by one fixed step. */
  tick(dt) {
    for (const room of this.rooms.values()) room.tick(dt);
  }

  openRoom(level) {
    const code = this.codes.next(candidate => this.rooms.has(candidate));
    const room = new Room(code, level, this.createGame({ code, level }));
    this.rooms.set(code, room);
    return room;
  }

  findRoom(code) {
    return this.rooms.get(code) ?? null;
  }

  seat(client, room, name) {
    client.enter(room, room.add(client, name));
  }

  /** Takes the client out of its room, deleting the room when it empties. */
  leaveRoom(client) {
    const { room, playerId } = client;
    if (!room) return;
    client.exit();
    room.remove(playerId);
    if (room.isEmpty) this.rooms.delete(room.code);
  }

  fail(client, code) {
    client.send({ t: 'error', code });
  }
}
