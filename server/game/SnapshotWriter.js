import { angle, coord, wireRounds } from './wire.js';
import { PlayerStatus } from '../../web/js/ui/hud/PlayerStatus.js';
import { TeamPresentation } from '../../web/js/ui/hud/logic/TeamPresentation.js';

/** Zombies further than this from every player are left out of snapshots (docs/tech/NETWORK.md, 手感 5). */
export const SNAPSHOT_RANGE = 60;

/**
 * Builds `snapshot` messages from a GameSession in exactly the shape web/js/net/protocol.js
 * accepts. `frame()` copies the shared part once per snapshot; `forViewer()` adds each
 * member's own `ack`. Positions come from the controllers, which are the server's truth.
 */
export class SnapshotWriter {
  constructor({ range = SNAPSHOT_RANGE } = {}) {
    this.range = range;
    /** Last facing sent per enemy id, kept while an enemy has nobody to face. */
    this._yaw = new Map();
    /** Reads each player's pickup offer and timed action exactly as the single-player HUD would. */
    this._status = new PlayerStatus();
  }

  /** The part every member shares. */
  frame(session, { tick, time }) {
    const ctx = session.context;
    const players = ctx.players.map(player => this.player(player, session));
    const enemies = [];
    const seen = new Set();
    for (const enemy of ctx.enemies) {
      if (!enemy.active || !this.nearAnyPlayer(enemy, ctx.players)) continue;
      enemies.push(this.enemy(enemy));
      seen.add(enemy.id);
    }
    for (const id of this._yaw.keys()) if (!seen.has(id)) this._yaw.delete(id);
    const message = {
      t: 'snapshot', tick, time: Math.round(time), ack: -1,
      state: session.state ?? 'lobby', wave: session.wave, kills: session.kills, players, enemies,
      goal: session.objective?.goal ?? 'SURVIVE THE WAVES',
      objective: this.objective(session),
      breakSeconds: session.state === 'wave-break' ? Math.max(0, Math.ceil(session.breakEndsAt - ctx.time)) : 0,
    };
    const pickups = this.pickups(session);
    if (pickups) message.pickups = pickups;
    return message;
  }

  /** The frame as one member receives it. */
  forViewer(frame, ack) {
    return { ...frame, ack };
  }

  player(player, session) {
    const controller = player.controller;
    const weapon = player.weapons.current;
    const { ammo, reserve } = wireRounds(weapon?.ammoSnapshot());
    const record = {
      id: player.id,
      x: coord(controller.x), y: coord(controller.y ?? 0), z: coord(controller.z),
      yaw: angle(controller.yaw ?? 0), pitch: angle(controller.pitch ?? 0),
      health: coord(player.damageable.health),
      downed: player.downed === true, alive: player.damageable.alive,
      weapon: weapon?.id ?? '', ammo, reserve,
    };
    return session ? Object.assign(record, this.hud(player, session)) : record;
  }

  /**
   * What the player's own HUD needs beyond the protocol core (docs/tech/NETWORK.md, HUD fields):
   * the loadout, the magazine size, reloading, whether they carry healing, and the pickup offer
   * and timed action text the single-player HUD would show; `rooted` (the server will not move
   * them: downed, dead or bandaging, GameSession.isRooted) and `speed` (their speed multiplier,
   * e.g. 1.3 under adrenaline) let the browser predict its own walking the way the server checks it.
   */
  hud(player, session) {
    const weapon = player.weapons.current;
    const status = this._status.read(session, player.id);
    return {
      maxHealth: coord(player.damageable.maxHealth),
      magazine: weapon && weapon.usesAmmo !== false && Number.isFinite(weapon.magazine) ? weapon.magazine : null,
      reloading: Boolean(weapon?.reloading),
      slots: status.slots.map(slot => ({ id: slot.id, count: slot.count, charge: slot.charge })),
      slot: status.selected,
      healing: TeamPresentation.carriesHealing(player.weapons.weapons),
      offer: status.pickup === null ? null : { name: status.pickup, swap: status.pickupSwap,
        full: status.pickupFull, verb: status.pickupVerb, note: status.pickupNote },
      action: status.action === null ? null : { text: status.action, fraction: angle(status.actionProgress) },
      rooted: session.isRooted(player.id),
      speed: coord(player.controller.speedMultiplier ?? 1),
    };
  }

  /** The level's countdown { label, seconds } while it shows one, otherwise null. */
  objective(session) {
    const status = session.objective?.status;
    return status ? { label: status.label, seconds: status.seconds } : null;
  }

  enemy(enemy) {
    return {
      id: enemy.id, type: enemy.type ?? 'enemy',
      x: coord(enemy.position.x), z: coord(enemy.position.z),
      yaw: angle(this.facing(enemy)),
      health: coord(enemy.damageable.health),
      state: !enemy.damageable.alive ? 'dead' : enemy.chaseTarget ? 'chase' : 'idle',
    };
  }

  /** Enemies have no facing of their own: they look at the player they chase (yaw 0 is −Z). */
  facing(enemy) {
    const target = enemy.chaseTarget;
    if (target) {
      const dx = target.position.x - enemy.position.x;
      const dz = target.position.z - enemy.position.z;
      if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) this._yaw.set(enemy.id, Math.atan2(-dx, -dz));
    }
    return this._yaw.get(enemy.id) ?? 0;
  }

  nearAnyPlayer(enemy, players) {
    for (const player of players) {
      const controller = player.controller;
      if (Math.hypot(controller.x - enemy.position.x, controller.z - enemy.position.z) <= this.range) return true;
    }
    return false;
  }

  /** What lies on each weapon spot: [{id, item}] with item null once taken; undefined when the level has none. */
  pickups(session) {
    const field = session.pickups?.weaponPickups;
    if (!field) return undefined;
    return field.pickups.map(pickup => ({ id: pickup.id, item: pickup.weapon?.id ?? null }));
  }
}
