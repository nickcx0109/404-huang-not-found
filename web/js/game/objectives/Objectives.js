import { EndlessObjective } from './EndlessObjective.js';
import { HoldOutObjective } from './HoldOutObjective.js';

/**
 * Builds a level's objective from its data (`"objective": { "type": ..., ...settings }` in the level file).
 * New kinds register here; nothing else needs to know them.
 */
export class Objectives {
  constructor() {
    this._types = new Map();
  }

  register(type, create) {
    if (this._types.has(type)) throw new Error('Objective type "' + type + '" is already registered');
    this._types.set(type, create);
    return this;
  }

  /** @param {{type: string}|null} data  the level's objective, or null for none */
  create(data) {
    if (!data) return new EndlessObjective();
    const create = this._types.get(data.type);
    if (!create) throw new Error('Unknown objective type "' + data.type + '"');
    return create(data);
  }

  static standard() {
    return new Objectives().register('hold', data => new HoldOutObjective(data));
  }
}
