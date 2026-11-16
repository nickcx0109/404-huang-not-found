import { EVENTS } from '../game/events.js';

export class Wallet {
  constructor(ownerId, events, balance = 0) {
    this.ownerId = ownerId;
    this.events = events;
    this._validate(balance);
    this.balance = balance;
  }

  _validate(amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Money must be a nonnegative safe integer');
  }

  canAfford(amount) {
    this._validate(amount);
    return this.balance >= amount;
  }

  credit(amount) {
    this._validate(amount);
    this._validate(this.balance + amount);
    this._change(amount);
  }

  spend(amount) {
    if (!this.canAfford(amount)) return false;
    this._change(-amount);
    return true;
  }

  _change(delta) {
    if (delta === 0) return;
    this.balance += delta;
    this.events.emit(EVENTS.WALLET_CHANGED, { ownerId: this.ownerId, balance: this.balance, delta });
  }
}
