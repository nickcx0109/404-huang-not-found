/**
 * Wire-format helpers shared by the browser network classes (docs/tech/NETWORK.md, 協定).
 * Coordinates are rounded to 2 decimals, angles to 3 decimals.
 */

/** Client → server message types. */
export const CLIENT_MESSAGES = Object.freeze({
  CREATE: 'create',
  JOIN: 'join',
  LEAVE: 'leave',
  START: 'start',
  PING: 'ping',
  INPUT: 'input',
  ACTION: 'action',
});

/** Server → client message types. */
export const SERVER_MESSAGES = Object.freeze({
  ROOM: 'room',
  ERROR: 'error',
  PONG: 'pong',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
});

/** `kind` values allowed in an `action` message. */
export const ACTION_KINDS = Object.freeze(['fire', 'reload', 'secondary', 'switch', 'cycle', 'pickup', 'revive']);

/** Rounds a coordinate to 2 decimals. */
export function roundCoord(value) {
  return Math.round(value * 100) / 100;
}

/** Rounds an angle in radians to 3 decimals. */
export function roundAngle(value) {
  return Math.round(value * 1000) / 1000;
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isString = (value) => typeof value === 'string';
const isArray = (value) => Array.isArray(value);
const isObject = (value) => value !== null && typeof value === 'object' && !isArray(value);
const isBoolean = (value) => typeof value === 'boolean';
const isNumberOrNull = (value) => value === null || isFiniteNumber(value);
const isList = (value, isItem) => isArray(value) && value.every((item) => isObject(item) && isItem(item));
const allFinite = (record, keys) => keys.every((key) => isFiniteNumber(record[key]));

/** `room.players` entry: `{ id, name }`. */
const isRosterEntry = (p) => isString(p.id) && isString(p.name);

/**
 * Snapshot player: `{ id, x, y, z, yaw, pitch, health, downed, alive, weapon, ammo, reserve }`.
 * `ammo` and `reserve` are null for weapons without rounds (see game/events.js).
 */
const isSnapshotPlayer = (p) => isString(p.id) && allFinite(p, ['x', 'y', 'z', 'yaw', 'pitch', 'health'])
  && isBoolean(p.downed) && isBoolean(p.alive) && isString(p.weapon)
  && isNumberOrNull(p.ammo) && isNumberOrNull(p.reserve);

/** Snapshot zombie: `{ id, type, x, z, yaw, health, state }`. */
const isSnapshotEnemy = (e) => (isString(e.id) || isFiniteNumber(e.id)) && isString(e.type)
  && allFinite(e, ['x', 'z', 'yaw', 'health']) && isString(e.state);

/**
 * Required fields per server message type (NETWORK.md, Server → Client); anything failing
 * these is ignored. Error codes are any string so new server codes need no client change.
 * `pickups` is the only optional snapshot field; `room.host` and `room.token` are optional for older servers.
 */
const SERVER_SHAPES = Object.freeze({
  [SERVER_MESSAGES.ROOM]: (m) => isString(m.code) && isString(m.you) && isList(m.players, isRosterEntry)
    && m.players.some((player) => player.id === m.you) && isString(m.level) && isString(m.state)
    && (m.host === undefined || m.host === null || isString(m.host))
    && (m.token === undefined || m.token === null || isString(m.token)),
  [SERVER_MESSAGES.ERROR]: (m) => isString(m.code),
  [SERVER_MESSAGES.PONG]: (m) => isFiniteNumber(m.c) && isFiniteNumber(m.s),
  [SERVER_MESSAGES.SNAPSHOT]: (m) => isFiniteNumber(m.tick) && isFiniteNumber(m.time) && isFiniteNumber(m.ack)
    && isString(m.state) && isFiniteNumber(m.wave) && isFiniteNumber(m.kills)
    && isList(m.players, isSnapshotPlayer) && isList(m.enemies, isSnapshotEnemy)
    && (m.pickups === undefined || isArray(m.pickups)),
  [SERVER_MESSAGES.EVENT]: (m) => isString(m.name) && isObject(m.detail),
});

/**
 * Parses one server text frame. Returns the message object, or null when the frame is not
 * JSON, not an object, has an unknown `t`, or lacks the fields its type requires.
 */
export function parseServerMessage(data) {
  if (typeof data !== 'string') return null;
  let message;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(message) || !isString(message.t)) return null;
  const check = Object.hasOwn(SERVER_SHAPES, message.t) ? SERVER_SHAPES[message.t] : null;
  return check && check(message) ? message : null;
}
