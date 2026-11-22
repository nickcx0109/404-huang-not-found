/**
 * Weapon events carry { ownerId, weaponId, ammo, reserve, count? } from ammoSnapshot().
 * Counts describe state AFTER the action; ammo/reserve are null for weapons without rounds.
 * Stackable items additionally include count. Every snapshot is a fresh plain object.
 * WEAPON_FIRED adds hit (null on a miss); WEAPON_RELOADED marks completion.
 * WEAPON_CHANGED also reports equipped/absorbed stack state, including holstered stacks.
 * WEAPON_RELOAD_STARTED adds duration: real seconds at start, accounting for reload buffs
 * and their expiry. Later effects may alter completion time. Rejected reloads emit nothing.
 * WEAPON_REFILLED is per weapon, emitted only when refill(ctx) changes ammunition;
 * AMMO_REFILLED remains the per-crate notification { ownerId, crateId }.
 */
export const EVENTS = Object.freeze({
  START_REQUESTED: 'game.start-requested',
  RESTART_REQUESTED: 'game.restart-requested',
  FIRE_REQUESTED: 'player.fire-requested',
  RELOAD_REQUESTED: 'player.reload-requested',
  SWITCH_REQUESTED: 'player.switch-requested',
  CYCLE_REQUESTED: 'player.cycle-requested',
  SECONDARY_REQUESTED: 'player.secondary-requested',
  PICKUP_REQUESTED: 'player.pickup-requested',
  DAMAGE_REQUESTED: 'entity.damage-requested',
  ENTITY_DAMAGED: 'entity.damaged',
  ENTITY_DIED: 'entity.died',
  ENTITY_HEALED: 'entity.healed',
  ITEM_THROWN: 'item.thrown',
  EXPLODED: 'effect.exploded',
  ENEMY_SPAWNED: 'enemy.spawned',
  WEAPON_FIRED: 'weapon.fired',
  WEAPON_RELOAD_STARTED: 'weapon.reload-started',
  WEAPON_REFILLED: 'weapon.refilled',
  WEAPON_RELOADED: 'weapon.reloaded',
  WEAPON_CHANGED: 'weapon.changed',
  WEAPON_PICKED_UP: 'weapon.picked-up',
  AMMO_REFILLED: 'ammo.refilled',
  STATE_CHANGED: 'game.state-changed',
  WAVE_STARTED: 'wave.started',
  WAVE_CLEARED: 'wave.cleared',
  GAME_OVER: 'game.over',
  VICTORY: 'game.victory',
  PROMPT_CHANGED: 'hud.prompt-changed',
  ANNOUNCED: 'hud.announced',
});
