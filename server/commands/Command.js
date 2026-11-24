/**
 * Handles one validated client message type (Command pattern).
 * RoomServer looks commands up by `type`; add a message by adding a subclass.
 */
export class Command {
  constructor(type) {
    this.type = type;
  }

  /**
   * @param {import('../RoomServer.js').RoomServer} server
   * @param {import('../Client.js').Client} client
   * @param {object} message  already validated by MessageParser
   */
  execute(server, client, message) {
    throw new Error(`${this.constructor.name} must implement execute()`);
  }
}
