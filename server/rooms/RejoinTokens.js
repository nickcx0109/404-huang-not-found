import { randomBytes } from 'node:crypto';

/** Characters a token may use (base64url), so the `join` schema can check its shape. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Hands out the secret a player shows to take their seat back after a dropped connection
 * (docs/tech/NETWORK.md, 斷線重連). Each token is 128 random bits in base64url and is only ever
 * sent to the player it belongs to, in their own `room` message.
 */
export class RejoinTokens {
  /** @param {{ bytes?: (size: number) => Buffer, size?: number }} [options]  inject `bytes` for predictable tests */
  constructor({ bytes = randomBytes, size = 16 } = {}) {
    this.bytes = bytes;
    this.size = size;
  }

  issue() {
    return this.bytes(this.size).toString('base64url');
  }
}
