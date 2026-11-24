import { Client } from './Client.js';
import { Room } from './rooms/Room.js';
import { RoomGame } from './rooms/RoomGame.js';
import { RoomCodes } from './rooms/RoomCodes.js';
import { LevelCatalog } from './rooms/LevelCatalog.js';
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
   *   logger?: { error: (...args: unknown[]) => void },
   *   levels?: LevelCatalog,  which `create.level` names exist; defaults to web/levels/*.json read once
   * }} [options]
   */
  constructor({
    codes = new RoomCodes(),
    createGame = () => new RoomGame(),
    parser = new MessageParser(),
    commands = defaultCommands(),
    now = () => Date.now(),
    logger = console,
    levels = LevelCatalog.fromDirectory(),
  } = {}) {
    this.logger = logger;
    this.levels = levels;
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
    try {
      command.execute(this, client, message);
    } catch (error) {
      // One bad command must not take the process (and every other room) down.
      this.logger.error(`[room-server] ${message.t} failed:`, error);
      this.fail(client, ErrorCode.SERVER_ERROR);
    }
  }

  disconnect(connection) {
    const client = this.clients.get(connection);
    if (!client) return;
    this.leaveRoom(client);
    this.clients.delete(connection);
  }

  /** Advances every room by one fixed step. */
  tick(dt) {
    for (const room of this.rooms.values()) {
      try {
        room.tick(dt);
      } catch (error) {
        this.logger.error(`[room-server] tick failed in room ${room.code}:`, error);
      }
    }
  }

  openRoom(level) {
    const code = this.codes.next(candidate => this.rooms.has(candidate));
    const room = new Room(code, level, this.createGame({ code, level }), { logger: this.logger });
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
