import { Entity } from '../entities/Entity.js';
import { DownedHealth } from './DownedHealth.js';
import { WeaponHolder } from '../weapons/WeaponHolder.js';
import { PLAYER_BODY } from './PlayerBody.js';

export class CombatPlayer extends Entity {
  /** `weapons` defaults to a plain WeaponHolder; gameplay passes a LoadoutHolder. */
  constructor(id, controller, events, weapons = new WeaponHolder(id, events)) {
    super(id, controller);
    this.controller = controller;
    this.body = PLAYER_BODY;
    this.downed = false;
    this.damageable = new DownedHealth(this, 100, events);
    this.weapons = weapons;
  }

  update(dt, ctx) {
    this.position.x = this.controller.x;
    this.position.z = this.controller.z;
    this.weapons.update(dt, ctx);
  }
}
