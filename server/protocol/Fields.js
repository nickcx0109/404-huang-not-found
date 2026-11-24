/**
 * Field rules for message schemas. Each rule's `read(value)` returns the
 * cleaned value, or INVALID when the value breaks the rule.
 */
export const INVALID = Symbol('invalid');

export class Field {
  constructor({ optional = false } = {}) {
    this.optional = optional;
  }

  read(value) {
    return INVALID;
  }
}

export class TextField extends Field {
  constructor({ min = 1, max = 64, pattern = null, transform = text => text, ...options } = {}) {
    super(options);
    this.min = min;
    this.max = max;
    this.pattern = pattern;
    this.transform = transform;
  }

  read(value) {
    if (typeof value !== 'string') return INVALID;
    const text = this.transform(value);
    if (text.length < this.min || text.length > this.max) return INVALID;
    if (this.pattern && !this.pattern.test(text)) return INVALID;
    return text;
  }
}

export class NumberField extends Field {
  read(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : INVALID;
  }
}

export class IntegerField extends Field {
  constructor({ min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, ...options } = {}) {
    super(options);
    this.min = min;
    this.max = max;
  }

  read(value) {
    return Number.isSafeInteger(value) && value >= this.min && value <= this.max ? value : INVALID;
  }
}

export class BooleanField extends Field {
  read(value) {
    return typeof value === 'boolean' ? value : INVALID;
  }
}

export class ChoiceField extends Field {
  constructor(choices, options) {
    super(options);
    this.choices = new Set(choices);
  }

  read(value) {
    return this.choices.has(value) ? value : INVALID;
  }
}
