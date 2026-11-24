/**
 * Server-side state of one connection: which room it is in and as which player.
 * The connection only needs `send(text)`; this class does the JSON encoding,
 * so it can be handed to a Room as a member.
 */
export class Client {
  constructor(connection) {
    this.connection = connection;
    this.room = null;
    this.playerId = null;
  }

  get inRoom() {
    return this.room !== null;
  }

  send(message) {
    this.connection.send(JSON.stringify(message));
  }

  enter(room, playerId) {
    this.room = room;
    this.playerId = playerId;
  }

  exit() {
    this.room = null;
    this.playerId = null;
  }
}
