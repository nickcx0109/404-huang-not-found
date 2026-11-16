export class DamageRule {
  constructor() {
    this.next = null;
  }

  modify(info) {
    return info;
  }

  handle(info) {
    const modified = this.modify(info);
    return this.next ? this.next.handle(modified) : modified;
  }
}

export class HeadshotRule extends DamageRule {
  constructor(multiplier = 2) {
    super();
    if (!Number.isFinite(multiplier) || multiplier < 0) throw new RangeError('Invalid headshot multiplier');
    this.multiplier = multiplier;
  }

  modify(info) {
    return info.hitPart === 'head' ? info.withAmount(info.amount * this.multiplier) : info;
  }
}

export class DamagePipeline {
  constructor(rules = []) {
    if (new Set(rules).size !== rules.length || rules.some(rule => !(rule instanceof DamageRule))) {
      throw new TypeError('Damage rules must be distinct DamageRule instances owned by this pipeline');
    }
    this.first = rules[0] ?? null;
    for (let index = 0; index < rules.length; index++) rules[index].next = rules[index + 1] ?? null;
  }

  apply(info) {
    return this.first ? this.first.handle(info) : info;
  }
}
