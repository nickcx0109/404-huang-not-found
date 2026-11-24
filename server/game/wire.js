import { roundAngle, roundCoord } from '../../web/js/net/protocol.js';

/** A coordinate rounded to 2 decimals (protocol.js), never -0. */
export const coord = value => roundCoord(value) || 0;

/** An angle in radians rounded to 3 decimals (protocol.js), never -0. */
export const angle = value => roundAngle(value) || 0;

/**
 * Round counts as they go on the wire (docs/tech/NETWORK.md). JSON has no Infinity, so the
 * starter pistol's endless reserve is sent as `reserve: null` with a numeric `ammo`;
 * `ammo: null` (and `reserve: null`) still means a weapon without rounds.
 */
export function wireRounds({ ammo = null, reserve = null } = {}) {
  const count = value => (Number.isFinite(value) ? value : null);
  return { ammo: count(ammo), reserve: count(reserve) };
}
