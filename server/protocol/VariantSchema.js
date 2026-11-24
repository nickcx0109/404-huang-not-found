import { MessageSchema } from './MessageSchema.js';

/**
 * A message type whose fields depend on a discriminator field, e.g. `action`
 * whose `kind` decides which extra fields are required. Each variant is a
 * full MessageSchema (shared fields plus its own); unknown variants are rejected.
 */
export class VariantSchema {
  /**
   * @param {string} type  the `t` value
   * @param {string} key   discriminator field name
   * @param {Record<string, import('./Fields.js').Field>} shared  fields every variant has
   * @param {Record<string, Record<string, import('./Fields.js').Field>>} variants  extra fields per discriminator value
   */
  constructor(type, key, shared, variants) {
    this.type = type;
    this.key = key;
    this.variants = new Map(Object.entries(variants).map(([value, fields]) => [value, new MessageSchema(type, { ...shared, ...fields })]));
  }

  get values() {
    return [...this.variants.keys()];
  }

  parse(raw) {
    const value = raw[this.key];
    if (typeof value !== 'string' || !this.variants.has(value)) return null;
    const message = this.variants.get(value).parse(raw);
    if (message) message[this.key] = value;
    return message;
  }
}
