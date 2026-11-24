import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoomGame } from '../rooms/RoomGame.js';
import { SHIPPED_LEVELS_DIR } from '../rooms/LevelCatalog.js';
import { createSession } from '../../web/js/game/createSession.js';
import { RemoteController } from './RemoteController.js';
import { InputThrottle } from './InputThrottle.js';
import { EnemyHistory } from './EnemyHistory.js';
import { ShotRewind } from './ShotRewind.js';
import { SnapshotWriter } from './SnapshotWriter.js';
import { EventRelay } from './EventRelay.js';
import { ActionRegistry } from './actions/ActionRegistry.js';

/** Simulation step and snapshot period (docs/tech/NETWORK.md, 手感 5). */
export const STEP_SECONDS = 1 / 30;
export const SNAPSHOT_SECONDS = 1 / 20;
/** A stalled ticker catches up at most this many steps at once, then drops the rest. */
export const MAX_CATCH_UP_STEPS = 5;
const EPSILON = 1e-9;

/** Reads web/levels/<name>.json; `directory` lets tests point elsewhere. */
export function levelFileLoader(directory = SHIPPED_LEVELS_DIR) {
  return name => JSON.parse(readFileSync(join(directory, `${name}.json`), 'utf8'));
}

/**
 * The game a playing Room runs: the same GameSession as single player (built by createSession),
 * stepped 30 times a second, with one RemoteController per member and 20 snapshots a second.
 * One instance per room (RoomServer's `createGame` builds a new one for every room).
 */
export class SessionRoomGame extends RoomGame {
  /**
   * @param {object} [options]
   * @param {(level: string) => object} [options.loadLevel]  parsed level JSON by name
   * @param {() => number} [options.now]  server clock in ms, the same one `pong` reports
   * @param {object} [options.sessionOptions]  passed to createSession (difficulty, rng, ...)
   */
  constructor({
    loadLevel = levelFileLoader(), now = () => Date.now(), sessionOptions = {},
    actions = ActionRegistry.standard(), writer = new SnapshotWriter(), relay = new EventRelay(),
    history = new EnemyHistory(),
  } = {}) {
    super();
    this.loadLevel = loadLevel;
    this.now = now;
    this.sessionOptions = sessionOptions;
    this.actions = actions;
    this.writer = writer;
    this.relay = relay;
    this.history = history;
    this.rewind = new ShotRewind(history);
    this.session = null;
    this.controllers = new Map();
    /** One InputThrottle per player in front of their controller (G8n). */
    this.inputs = new Map();
    this.tickCount = 0;
    this._accumulator = 0;
    this._sinceSnapshot = 0;
  }

  start(room) {
    const level = this.loadLevel(room.level);
    const spawns = level?.spawns?.players;
    if (!Array.isArray(spawns) || spawns.length === 0) throw new Error(`Level ${room.level} has no player spawns`);
    const now = this.now();
    const controllers = new Map();
    const players = room.players.map(({ id, name }, order) => {
      const spawn = spawns[Math.min(this.slotOf(id, order), spawns.length - 1)];
      const controller = new RemoteController({ x: spawn.x, z: spawn.z, yaw: (spawn.yaw ?? 0) * Math.PI / 180 }, { now });
      controllers.set(id, controller);
      return { id, name, controller };
    });
    const session = createSession(level, { ...this.sessionOptions, players });
    for (const [id, controller] of controllers) controller.attach(session, id);
    this.session = session;
    this.controllers = controllers;
    this.inputs = new Map([...controllers].map(([id, controller]) => [id, new InputThrottle(controller)]));
    this.relay.attach(session.context.events, message => room.broadcast(message));
    session.start();
    return true;
  }

  /** Spawn index for a player id: p1 → 0, p2 → 1, ...; join order for any other id. */
  slotOf(id, order) {
    const match = /^p(\d+)$/.exec(id);
    return match ? Math.max(0, Number(match[1]) - 1) : order;
  }

  tick(room, dt) {
    if (!this.session) return;
    this._accumulator += dt;
    let steps = Math.floor((this._accumulator + EPSILON) / STEP_SECONDS);
    this._accumulator = Math.max(0, this._accumulator - steps * STEP_SECONDS);
    if (steps > MAX_CATCH_UP_STEPS) {
      steps = MAX_CATCH_UP_STEPS;
      this._accumulator = 0;
    }
    const now = this.now();
    // Inputs that came too fast were held back; the newest of each player's lands before the step.
    for (const throttle of this.inputs.values()) throttle.flush(now);
    for (let step = 0; step < steps; step++) {
      // Steps that catch up are spread back over the time they stand for, one step apart.
      this.step(room, now - (steps - 1 - step) * STEP_SECONDS * 1000);
    }
  }

  /** One fixed simulation step, recorded for shot rewind; sends snapshots when one is due. */
  step(room, time) {
    this.session.update(STEP_SECONDS);
    this.tickCount++;
    this.history.record(time, this.session.context.enemies);
    this._sinceSnapshot += STEP_SECONDS;
    if (this._sinceSnapshot + EPSILON >= SNAPSHOT_SECONDS) {
      this._sinceSnapshot -= SNAPSHOT_SECONDS;
      this.sendSnapshots(room, time);
    }
  }

  sendSnapshots(room, time) {
    const frame = this.writer.frame(this.session, { tick: this.tickCount, time });
    for (const [id, controller] of this.controllers) room.sendTo(id, this.writer.forViewer(frame, controller.ack));
  }

  input(room, playerId, message) {
    this.inputs.get(playerId)?.offer(message, this.now());
  }

  action(room, playerId, message) {
    const controller = this.controllers.get(playerId);
    if (!controller || !this.session) return;
    // The browser sends its pose right before an action; aim with it, not with an older one.
    this.inputs.get(playerId)?.flush(this.now());
    this.actions.dispatch({
      session: this.session, playerId, controller, message, now: this.now(), rewind: this.rewind,
    });
  }

  /**
   * The player's connection dropped: they stay in the run where they stood (no inputs come, so
   * they do not move) and let go of a revive; the seat waits for a rejoin.
   */
  memberAway(room, playerId) {
    this.session?.revives.hold(playerId, false);
  }

  /** The player is back on a new connection, which numbers its inputs from scratch. */
  memberBack(room, playerId) {
    this.controllers.get(playerId)?.resume(this.now());
    this.inputs.get(playerId)?.reset();
  }

  /** The player leaves the run (or their held seat expired); everyone else keeps playing. */
  memberLeft(room, playerId) {
    this.inputs.delete(playerId);
    if (!this.controllers.delete(playerId) || !this.session) return;
    const ctx = this.session.context;
    const player = this.session.playerById(playerId);
    this.session.revives.hold(playerId, false);
    if (!player) return;
    ctx.players.splice(ctx.players.indexOf(player), 1);
    player.dispose();
  }

  end(room) {
    this.relay.detach();
    this.session?.dispose();
    this.session = null;
    this.controllers.clear();
    this.inputs.clear();
    this.history.clear();
  }
}
