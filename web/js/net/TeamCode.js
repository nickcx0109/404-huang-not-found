/** Room code letters the server hands out (server/rooms/RoomCodes.js): no 0/O, 1/I/L. */
export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TEAM_CODE_LENGTH = 4;

/** The 4-character team code typed on the start screen. */
export class TeamCode {
  /** Upper-cases `text`, drops every character the server never uses and keeps the first 4. */
  static normalize(text) {
    let code = '';
    for (const char of String(text ?? '').toUpperCase()) {
      if (TEAM_CODE_ALPHABET.includes(char)) code += char;
      if (code.length === TEAM_CODE_LENGTH) break;
    }
    return code;
  }

  static isValid(code) {
    return typeof code === 'string' && code.length === TEAM_CODE_LENGTH && TeamCode.normalize(code) === code;
  }
}
