/**
 * Hands out short team codes such as "K7QX".
 * Only unambiguous characters are used (no 0 O 1 I L), see docs/tech/NETWORK.md.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export class RoomCodes {
  /**
   * @param {{ random?: () => number, alphabet?: string, length?: number, maxAttempts?: number }} [options]
   *   `random` returns a number in [0, 1) like Math.random; inject it to make codes predictable in tests.
   */
  constructor({ random = Math.random, alphabet = CODE_ALPHABET, length = CODE_LENGTH, maxAttempts = 1000 } = {}) {
    if (typeof random !== 'function') throw new TypeError('random must be a function');
    if (!alphabet.length || length < 1) throw new RangeError('Invalid code format');
    this.random = random;
    this.alphabet = alphabet;
    this.length = length;
    this.maxAttempts = maxAttempts;
  }

  /** A fresh code for which `isTaken(code)` is false. */
  next(isTaken = () => false) {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const code = this.generate();
      if (!isTaken(code)) return code;
    }
    throw new Error('No free room code');
  }

  generate() {
    let code = '';
    for (let i = 0; i < this.length; i++) {
      const index = Math.min(this.alphabet.length - 1, Math.floor(this.random() * this.alphabet.length));
      code += this.alphabet[index];
    }
    return code;
  }

  /** Upper-cases and trims what a player typed, so "k7qx " finds room "K7QX". */
  static normalize(text) {
    return String(text).trim().toUpperCase();
  }
}
