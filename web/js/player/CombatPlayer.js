import { Entity } from '../entities/Entity.js';
import { Armor } from '../entities/Armor.js';
import { Damageable } from '../entities/Damageable.js';
import { WeaponHolder } from '../weapons/WeaponHolder.js';
import { PLAYER_BODY } from './PlayerBody.js';

export class CombatPlayer extends Entity {
  constructor(id, controller, events) {
    super(id, controller);
    this.controller = controller;
    this.body = PLAYER_BODY;
    this.armor = new Armor();
    this.damageable = new Damageable(this, 100, events);
    this.weapons = new WeaponHolder(id, events);
    this.wallet = null;
  }

  update(dt, ctx) {
    this.position.x = this.controller.x;
    this.position.z = this.controller.z;
    this.weapons.update(dt, ctx);
  }
}
