import { MessageSchema } from './MessageSchema.js';
import { VariantSchema } from './VariantSchema.js';
import { TextField, NumberField, IntegerField, BooleanField, ChoiceField } from './Fields.js';
import { RoomCodes, CODE_ALPHABET, CODE_LENGTH } from '../rooms/RoomCodes.js';
import { TOKEN_PATTERN } from '../rooms/RejoinTokens.js';

/** A well-formed team code after trimming and upper-casing; anything else is bad-message, not no-room. */
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Largest accepted client message, in UTF-8 bytes. Inputs are well under 200. */
export const MAX_MESSAGE_BYTES = 4096;

const name = () => new TextField({ min: 1, max: 24, transform: text => text.trim() });
const seq = () => new IntegerField({ min: 0 });

/** Client to server messages from docs/tech/NETWORK.md, keyed by `t`. */
export function clientSchemas() {
  return [
    new MessageSchema('create', { name: name(), level: new TextField({ max: 32, pattern: /^[A-Za-z0-9_-]+$/ }) }),
    new MessageSchema('join', {
      name: name(),
      code: new TextField({ min: CODE_LENGTH, max: CODE_LENGTH, pattern: CODE_PATTERN, transform: RoomCodes.normalize }),
      token: new TextField({ min: 16, max: 64, pattern: TOKEN_PATTERN, optional: true }),
    }),
    new MessageSchema('leave'),
    new MessageSchema('start'),
    new MessageSchema('ping', { c: new NumberField() }),
    new MessageSchema('input', {
      seq: seq(), x: new NumberField(), y: new NumberField(), z: new NumberField(),
      yaw: new NumberField(), pitch: new NumberField(),
    }),
    actionSchema(),
  ];
}

/** `action` fields depend on `kind`: switch needs `index`, cycle needs `step` (±1), revive needs `holding`. */
export function actionSchema() {
  return new VariantSchema('action', 'kind', { seq: seq(), at: new NumberField() }, {
    fire: {},
    reload: {},
    secondary: {},
    switch: { index: new IntegerField({ min: 0, max: 16 }) },
    cycle: { step: new ChoiceField([-1, 1]) },
    pickup: {},
    interact: { holding: new BooleanField() },
    revive: { holding: new BooleanField() },
  });
}

/** Turns raw socket text into a validated message, or null for anything malformed. */
export class MessageParser {
  constructor(schemas = clientSchemas(), { maxBytes = MAX_MESSAGE_BYTES } = {}) {
    this.schemas = new Map(schemas.map(schema => [schema.type, schema]));
    this.maxBytes = maxBytes;
  }

  parse(text) {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > this.maxBytes) return null;
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.t !== 'string') return null;
    const schema = this.schemas.get(raw.t);
    return schema ? schema.parse(raw) : null;
  }
}
