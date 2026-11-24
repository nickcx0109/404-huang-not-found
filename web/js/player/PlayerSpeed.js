/**
 * Walking speeds in m/s, shared by the browser's PlayerController and the server's movement check
 * (RemoteController), so both sides agree on how far a player may go. No three.js here: Node imports it.
 */
export const PLAYER_SPEED = Object.freeze({ walk: 4.5, sprint: 7.0 });
