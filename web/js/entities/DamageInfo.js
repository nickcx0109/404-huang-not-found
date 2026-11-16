export class DamageInfo {
  constructor({ amount, sourceId = null, targetId, hitPart = 'body', kind = 'bullet' }) {
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Damage must be finite and nonnegative');
    if (targetId === undefined || targetId === null) throw new TypeError('Damage needs a targetId');
    this.amount = amount;
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.hitPart = hitPart;
    this.kind = kind;
    Object.freeze(this);
  }

  withAmount(amount) {
    return new DamageInfo({ ...this, amount });
  }
}
