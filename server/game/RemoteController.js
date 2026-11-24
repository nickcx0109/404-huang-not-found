import { PLAYER_BODY } from '../../web/js/player/PlayerBody.js';
import { PLAYER_SPEED } from '../../web/js/player/PlayerSpeed.js';
import { MoveBudget } from './MoveBudget.js';

/**
 * How far a browser's reported moves may run ahead of the fastest legal walk (docs/tech/NETWORK.md, 手感 1):
 * speed × time × factor, plus a slack pool of `slack` metres that refills in `slackRefillSeconds`.
 */
export const MOVE_TOLERANCE = Object.freeze({ factor: 1.5, slack: 0.5, slackRefillSeconds: 1 });
/** Longest gap between two inputs that still earns movement; a stalled client cannot bank minutes of walking. */
export const MAX_INPUT_GAP_SECONDS = 1;
/** Feet may leave the ground only by a jump (JumpMotion peaks near 0.8 m). */
export const MAX_FEET_HEIGHT = 1;
/** Same pitch limit as the browser PlayerController (85 degrees). */
export const MAX_PITCH = 85 * Math.PI / 180;

/** Outcome of RemoteController#accept. */
export const InputResult = Object.freeze({
  /** seq was not newer than the last one; nothing changed. */
  STALE: 'stale',
  /** The reported position was taken as is. */
  MOVED: 'moved',
  /** The position was shortened or slid along a wall; the snapshot carries the server's position. */
  CLAMPED: 'clamped',
  /** The player may not walk now (downed, rooted item, not playing); only the view turned. */
  ROOTED: 'rooted',
});

/**
 * A player driven by network `input` messages (docs/tech/GAMEPLAY.md, G8d 遠端控制器契約).
 * Plain data the GameSession reads like the browser's PlayerController: feet position x, y, z,
 * view yaw/pitch in radians (yaw 0 looks toward −Z, positive pitch looks up) and the writable
 * speedMultiplier. The browser computes its own movement; this class only checks it.
 */
export class RemoteController {
  /**
   * @param {{x: number, z: number, y?: number, yaw?: number}} spawn  yaw in radians
   * @param {{now?: number, body?: object, speed?: number}} [options]  now: server ms the player appears
   */
  constructor(spawn, { now = 0, body = PLAYER_BODY, speed = PLAYER_SPEED.sprint } = {}) {
    this.x = spawn.x;
    this.y = spawn.y ?? 0;
    this.z = spawn.z;
    this.yaw = spawn.yaw ?? 0;
    this.pitch = 0;
    this.speedMultiplier = 1;
    this.body = body;
    this.speed = speed;
    /** Last input seq processed (the snapshot's `ack`); -1 before the first. */
    this.ack = -1;
    this.lastInputAt = now;
    /** Metres this player may still walk; refilled by server time, not by messages. */
    this.budget = new MoveBudget({ ...MOVE_TOLERANCE, bankSeconds: MAX_INPUT_GAP_SECONDS });
    this.session = null;
    this.playerId = null;
    this._moved = { x: 0, z: 0, hitX: false, hitZ: false };
  }

  /** Connects the controller to the session that owns its player, once the session exists. */
  attach(session, playerId) {
    this.session = session;
    this.playerId = playerId;
    return this;
  }

  /** Metres per second this player may walk now (sprint × speedMultiplier). */
  get rate() {
    return this.speed * this.speedMultiplier;
  }

  /**
   * Furthest legal move for the next input if it arrives `seconds` after the last one: what the
   * budget holds then (at most speed × 1 s × 1.5 earned by time, plus up to 0.5 m slack).
   */
  allowance(seconds) {
    return this.budget.peek(this.rate, seconds);
  }

  get rooted() {
    return !this.session || !this.session.canMove || this.session.isRooted(this.playerId);
  }

  /**
   * Takes one validated `input` message received at server time `now` (ms).
   * @returns {string} an InputResult value
   */
  accept(input, now) {
    if (input.seq <= this.ack) return InputResult.STALE;
    this.ack = input.seq;
    const seconds = Math.min(Math.max((now - this.lastInputAt) / 1000, 0), MAX_INPUT_GAP_SECONDS);
    this.lastInputAt = now;
    const limit = this.budget.refill(this.rate, seconds);
    this.yaw = input.yaw;
    this.pitch = Math.min(Math.max(input.pitch, -MAX_PITCH), MAX_PITCH);
    if (this.rooted) return InputResult.ROOTED;

    let dx = input.x - this.x;
    let dz = input.z - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance > limit) {
      dx *= limit / distance;
      dz *= limit / distance;
    }
    const moved = this.session.context.collision.move(this.x, this.z, dx, dz,
      this.body.radius, 0, this.body.height, this._moved);
    this.budget.spend(Math.hypot(moved.x - this.x, moved.z - this.z));
    this.x = moved.x;
    this.z = moved.z;
    this.y = Math.min(Math.max(input.y, 0), MAX_FEET_HEIGHT);
    const exact = Math.abs(moved.x - input.x) < 1e-6 && Math.abs(moved.z - input.z) < 1e-6 && this.y === input.y;
    return exact ? InputResult.MOVED : InputResult.CLAMPED;
  }

  /**
   * A new connection took this player over (a rejoin): its first input seq may be lower than the
   * old ack, so the ack starts again, and the quiet time while away earns no extra walking.
   */
  resume(now) {
    this.ack = -1;
    this.lastInputAt = now;
  }

  /** Writes this player's view ray into `aim` ({origin, direction}), from the eyes along yaw/pitch. */
  aimInto(aim) {
    const cosPitch = Math.cos(this.pitch);
    aim.origin.x = this.x;
    aim.origin.y = this.y + this.body.eyeHeight;
    aim.origin.z = this.z;
    aim.direction.x = -Math.sin(this.yaw) * cosPitch;
    aim.direction.y = Math.sin(this.pitch);
    aim.direction.z = -Math.cos(this.yaw) * cosPitch;
    return aim;
  }
}
