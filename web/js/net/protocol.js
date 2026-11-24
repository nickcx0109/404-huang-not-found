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

/** Minimal shape checks per server message type; anything failing these is ignored. */
const SERVER_SHAPES = Object.freeze({
  [SERVER_MESSAGES.ROOM]: (m) => isString(m.code) && isArray(m.players),
  [SERVER_MESSAGES.ERROR]: (m) => isString(m.code),
  [SERVER_MESSAGES.PONG]: (m) => isFiniteNumber(m.c) && isFiniteNumber(m.s),
  [SERVER_MESSAGES.SNAPSHOT]: (m) => isFiniteNumber(m.time) && isArray(m.players) && isArray(m.enemies),
  [SERVER_MESSAGES.EVENT]: (m) => isString(m.name),
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
  if (message === null || typeof message !== 'object' || isArray(message)) return null;
  const check = Object.hasOwn(SERVER_SHAPES, message.t) ? SERVER_SHAPES[message.t] : null;
  return check && check(message) ? message : null;
}
