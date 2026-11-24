import { EVENTS } from '../game/events.js';

/** Snapshot states in which players walk and shoot (GameSession.canMove). */
const MOVING_STATES = new Set(['playing', 'wave-break']);
/** States whose result screen offers RESTART (online: back to the start screen). */
const RESULT_STATES = new Set(['game-over', 'victory']);

/**
 * What an online client knows about the game, in the shape the HUD and the views read instead
 * of a GameSession: the team (room), the newest snapshot in message order (for the local
 * player's own numbers) and the delayed, interpolated one (for drawing everyone else).
 *
 * `state` is the server's game state once snapshots arrive; before that it is 'team-lobby'
 * (waiting in the team room) or 'starting' (start pressed, no snapshot yet).
 * A view-model only: it changes nothing on the server and holds no DOM.
 */
export class NetworkedSession {
  /** @param {{you: string, room?: object}} options  `you` is this client's player id (p1..p3) */
  constructor({ you, room = null }) {
    this.you = you;
    this.room = room;
    /** 'open', 'reconnecting' (NetClient is retrying) or 'lost' (the team cannot be rejoined). */
    this.connection = 'open';
    this.starting = false;
    /** The last error code to show in the team room (e.g. 'start-failed'), or null. */
    this.notice = null;
    /** The newest snapshot received (message order). */
    this.latest = null;
    /** The interpolated world at render time (SnapshotBuffer.sample), or null. */
    this.sampled = null;
    /** Rounds in hand: the newest count from a snapshot or one of our own weapon events. */
    this.ammo = null;
    this.reserve = null;
    this.names = new Map();
    if (room) this.applyRoom(room);
  }

  /**
   * Takes a `room` message. Returns true when it gives this client another player id: after a
   * rejoin the server may hand out a free slot (p2 drops, p1 leaves, p2 comes back as p1).
   */
  applyRoom(room) {
    const before = this.you;
    this.room = room;
    this.you = room.you ?? this.you;
    this.names.clear();
    for (const player of room.players ?? []) this.names.set(player.id, player.name);
    return before !== undefined && before !== null && this.you !== before;
  }

  applySnapshot(snapshot) {
    if (this.latest && snapshot.time < this.latest.time) return false;
    this.latest = snapshot;
    const me = this.local;
    if (me) {
      this.ammo = me.ammo;
      this.reserve = me.reserve;
    }
    return true;
  }

  /** Server events about our own weapon carry fresher round counts than the last snapshot. */
  applyEvent(name, detail) {
    if (detail?.ownerId !== this.you) return;
    if (name === EVENTS.WEAPON_FIRED || name === EVENTS.WEAPON_RELOADED || name === EVENTS.WEAPON_CHANGED
      || name === EVENTS.WEAPON_RELOAD_STARTED) {
      if ('ammo' in detail) this.ammo = detail.ammo;
      if ('reserve' in detail) this.reserve = detail.reserve;
    }
  }

  setSampled(sampled) {
    this.sampled = sampled;
  }

  get state() {
    if (!this.latest) return this.starting ? 'starting' : 'team-lobby';
    return this.latest.state === 'lobby' ? 'starting' : this.latest.state;
  }

  /** This client's player in the newest snapshot, or null. */
  get local() {
    return this.playerById(this.you);
  }

  playerById(id) {
    return this.latest?.players.find(player => player.id === id) ?? null;
  }

  get canMove() {
    return MOVING_STATES.has(this.state);
  }

  /** May this client's player act now (alive and standing, game running)? */
  get canAct() {
    const me = this.local;
    return this.canMove && Boolean(me?.alive) && !me.downed;
  }

  /**
   * Whether the local player's feet must stay still: the server's `rooted` (downed, dead or
   * bandaging, GameSession.isRooted), or downed/dead from a server that does not send it.
   */
  get rooted() {
    const me = this.local;
    if (!me) return true;
    if (typeof me.rooted === 'boolean') return me.rooted;
    return !me.alive || me.downed;
  }

  /** The local player's speed multiplier (adrenaline makes it 1.3); 1 before any snapshot. */
  get speed() {
    const speed = this.local?.speed;
    return Number.isFinite(speed) && speed > 0 ? speed : 1;
  }

  get canRestart() {
    return RESULT_STATES.has(this.state);
  }

  get wave() {
    return this.latest?.wave ?? 0;
  }

  get kills() {
    return this.latest?.kills ?? 0;
  }

  nameOf(id) {
    return this.names.get(id) ?? id;
  }

  /** Room slot (0..2) of a player id, from the server's p1..p3 naming; used for colours. */
  static slotOf(id) {
    const match = /^p(\d+)$/.exec(String(id));
    return match ? Math.max(0, Number(match[1]) - 1) : 0;
  }
}
