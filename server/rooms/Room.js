import { RoomGame } from './RoomGame.js';
import { ErrorCode } from '../protocol/ErrorCodes.js';

export const RoomState = Object.freeze({ LOBBY: 'lobby', PLAYING: 'playing' });

/** Why a room refuses a new member; the values are the protocol's error codes. */
export const AdmitRefusal = Object.freeze({ FULL: 'full', STARTED: 'started' });

/** Outcome of Room.start(). */
export const StartResult = Object.freeze({ STARTED: 'started', ALREADY_PLAYING: 'already-playing', FAILED: 'failed' });

/**
 * One team: up to three members and a lobby that becomes a game on `start()`.
 * A member is anything with `send(message)`; the room knows nothing about sockets.
 */
export class Room {
  static CAPACITY = 3;

  constructor(code, level, game = new RoomGame(), { logger = console } = {}) {
    this.logger = logger;
    this.code = code;
    this.level = level;
    this.game = game;
    this.state = RoomState.LOBBY;
    this.members = new Map();
  }

  get size() { return this.members.size; }
  get isEmpty() { return this.members.size === 0; }
  get isFull() { return this.members.size >= Room.CAPACITY; }
  get isPlaying() { return this.state === RoomState.PLAYING; }

  /** Player list in join order, as sent in `room` messages. */
  get players() {
    return [...this.members.values()].map(({ id, name }) => ({ id, name }));
  }

  /** null when a new member may join, otherwise the refusal code. */
  admitRefusal() {
    if (this.isPlaying) return AdmitRefusal.STARTED;
    if (this.isFull) return AdmitRefusal.FULL;
    return null;
  }

  /** Adds a member, tells everyone, and returns the new player id ("p1".."p3"). */
  add(member, name) {
    const refusal = this.admitRefusal();
    if (refusal) throw new Error(`Room ${this.code} refused a member: ${refusal}`);
    const id = this.freePlayerId();
    this.members.set(id, { id, name, member });
    this.announce();
    return id;
  }

  /** Removes a member; returns false when the id was not in the room. */
  remove(playerId) {
    if (!this.members.delete(playerId)) return false;
    this.game.memberLeft(this, playerId);
    if (this.isEmpty) this.game.end(this);
    else this.announce();
    return true;
  }

  /**
   * Lobby to playing, only once the game has started. If the game refuses
   * (returns false) or throws, the room stays in the lobby and every member
   * gets `error` `start-failed`.
   * @returns {string} a StartResult value
   */
  start() {
    if (this.isPlaying) return StartResult.ALREADY_PLAYING;
    let started;
    try {
      started = this.game.start(this) !== false;
    } catch (error) {
      this.logger.error(`[room ${this.code}] game failed to start:`, error);
      started = false;
    }
    if (!started) {
      this.broadcast({ t: 'error', code: ErrorCode.START_FAILED });
      return StartResult.FAILED;
    }
    this.state = RoomState.PLAYING;
    this.announce();
    return StartResult.STARTED;
  }

  tick(dt) {
    if (this.isPlaying) this.game.tick(this, dt);
  }

  receiveInput(playerId, message) {
    if (this.isPlaying && this.members.has(playerId)) this.game.input(this, playerId, message);
  }

  receiveAction(playerId, message) {
    if (this.isPlaying && this.members.has(playerId)) this.game.action(this, playerId, message);
  }

  sendTo(playerId, message) {
    const entry = this.members.get(playerId);
    if (!entry) return false;
    entry.member.send(message);
    return true;
  }

  broadcast(message) {
    for (const { member } of this.members.values()) member.send(message);
  }

  /** The `room` message as one member sees it. */
  describeFor(playerId) {
    return { t: 'room', code: this.code, you: playerId, players: this.players, level: this.level, state: this.state };
  }

  /** Sends every member the current roster with their own `you`. */
  announce() {
    for (const id of this.members.keys()) this.sendTo(id, this.describeFor(id));
  }

  freePlayerId() {
    for (let slot = 1; slot <= Room.CAPACITY; slot++) {
      const id = `p${slot}`;
      if (!this.members.has(id)) return id;
    }
    throw new Error('Room is full');
  }
}
