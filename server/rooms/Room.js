import { RoomGame } from './RoomGame.js';
import { ErrorCode } from '../protocol/ErrorCodes.js';
import { RejoinTokens } from './RejoinTokens.js';

export const RoomState = Object.freeze({ LOBBY: 'lobby', PLAYING: 'playing' });

/** Why a room refuses a new member; the values are the protocol's error codes. */
export const AdmitRefusal = Object.freeze({ FULL: 'full', STARTED: 'started' });

/** Outcome of Room.start(). */
export const StartResult = Object.freeze({ STARTED: 'started', ALREADY_PLAYING: 'already-playing', FAILED: 'failed' });

/**
 * One team: up to three members and a lobby that becomes a game on `start()`.
 * A member is anything with `send(message)`; the room knows nothing about sockets.
 *
 * Every seat has a rejoin token, sent only to its own player. When a member's connection drops
 * during a game the seat is held (`drop`): the player stays in the game, standing still, until
 * the deadline; `reclaim(token, member)` gives the seat back, and `expire(now)` frees seats
 * whose deadline passed as if the player had left.
 */
export class Room {
  static CAPACITY = 3;

  constructor(code, level, game = new RoomGame(), { logger = console, tokens = new RejoinTokens() } = {}) {
    this.logger = logger;
    this.tokens = tokens;
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

  /** Player list in join order, as sent in `room` messages; a held seat says `away: true`. */
  get players() {
    return [...this.members.values()].map(({ id, name, awayUntil }) =>
      (awayUntil === null ? { id, name } : { id, name, away: true }));
  }

  /** True while the player's seat is held for a rejoin. */
  isAway(playerId) {
    return (this.members.get(playerId)?.awayUntil ?? null) !== null;
  }

  /**
   * The player id that may press start: the earliest member still in the room (members keep
   * join order), so the creator first and, when the host leaves, whoever joined next. null when empty.
   */
  get host() {
    for (const id of this.members.keys()) return id;
    return null;
  }

  isHost(playerId) {
    return playerId !== null && playerId !== undefined && playerId === this.host;
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
    this.members.set(id, { id, name, member, token: this.tokens.issue(), awayUntil: null });
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
   * The member's connection is gone. In the lobby that is leaving; during a game the seat is
   * held until `until` (server ms) so the player can come back with their token.
   * @returns {boolean} true when the seat is held, false when the player was removed
   */
  drop(playerId, until) {
    const entry = this.members.get(playerId);
    if (!entry) return false;
    if (!this.isPlaying) {
      this.remove(playerId);
      return false;
    }
    entry.member = null;
    entry.awayUntil = until;
    this.game.memberAway(this, playerId);
    this.announce();
    return true;
  }

  /** May `token` take a seat back? */
  canReclaim(token) {
    return this.seatOf(token) !== null;
  }

  /**
   * Gives the seat that owns `token` to `member`: a held seat comes back, and a seat whose old
   * connection the server has not noticed is dead yet is taken over.
   * @returns {{id: string, previous: object|null}|null}  `previous` is the member it replaced; null on a bad token
   */
  reclaim(token, member) {
    const entry = this.seatOf(token);
    if (!entry) return null;
    const previous = entry.member;
    const wasAway = entry.awayUntil !== null;
    entry.member = member;
    entry.awayUntil = null;
    if (wasAway) this.game.memberBack(this, entry.id);
    this.announce();
    return { id: entry.id, previous };
  }

  /** Frees every held seat whose deadline is at or before `now`; returns their player ids. */
  expire(now) {
    const expired = [...this.members.values()]
      .filter(({ awayUntil }) => awayUntil !== null && awayUntil <= now)
      .map(({ id }) => id);
    for (const id of expired) this.remove(id);
    return expired;
  }

  seatOf(token) {
    if (typeof token !== 'string' || token.length === 0) return null;
    for (const entry of this.members.values()) if (entry.token === token) return entry;
    return null;
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
    if (!entry?.member) return false;
    entry.member.send(message);
    return true;
  }

  /** Sends to every connected member (held seats have nobody to send to). */
  broadcast(message) {
    for (const { member } of this.members.values()) member?.send(message);
  }

  /** The `room` message as one member sees it, with that member's own rejoin token. */
  describeFor(playerId) {
    return { t: 'room', code: this.code, you: playerId, host: this.host, players: this.players, level: this.level,
      state: this.state, token: this.members.get(playerId)?.token ?? null };
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
