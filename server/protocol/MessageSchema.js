import { INVALID } from './Fields.js';

/**
 * Shape of one client message type. `parse` returns a clean copy that holds
 * only `t` and the declared fields, or null when any field is wrong.
 */
export class MessageSchema {
  /** @param {string} type  the `t` value  @param {Record<string, import('./Fields.js').Field>} fields */
  constructor(type, fields = {}) {
    this.type = type;
    this.fields = Object.entries(fields);
  }

  parse(raw) {
    const message = { t: this.type };
    for (const [name, field] of this.fields) {
      if (!Object.hasOwn(raw, name) || raw[name] === undefined) {
        if (field.optional) continue;
        return null;
      }
      const value = field.read(raw[name]);
      if (value === INVALID) return null;
      message[name] = value;
    }
    return message;
  }
}
