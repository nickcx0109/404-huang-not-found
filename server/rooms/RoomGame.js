/**
 * Strategy object that runs the game inside a Room.
 * The default does nothing, so rooms work as a lobby only; G8d plugs a
 * GameSession-backed subclass in through RoomServer's `createGame` option.
 * A game talks to players through `room.sendTo(playerId, message)` and `room.broadcast(message)`.
 */
export class RoomGame {
  /**
   * The room wants to switch from lobby to playing. Return false or throw to
   * refuse (e.g. the level failed to load); the room then stays in the lobby
   * and members get `start-failed`. The room is still in the lobby during
   * this call and becomes playing right after it succeeds.
   * @returns {boolean | void}
   */
  start(room) {
    return true;
  }

  /** One fixed simulation step while the room is playing. */
  tick(room, dt) {}

  /** A validated `input` message from a member of a playing room. */
  input(room, playerId, message) {}

  /** A validated `action` message from a member of a playing room. */
  action(room, playerId, message) {}

  /** A member left or disconnected; other members may remain. */
  memberLeft(room, playerId) {}

  /** The last member left and the room is being deleted. */
  end(room) {}
}
