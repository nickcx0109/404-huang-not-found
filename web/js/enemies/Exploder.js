import { Enemy } from './Enemy.js';
import { ChaseBrain } from './Brain.js';
import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from '../game/events.js';

export class Exploder extends Enemy {
  constructor(dependencies) {
    super(dependencies, { health: 50, speed: 1.8, brain: new ChaseBrain() });
    this.blastRadius = 3;
    this.blastDamage = 40;
    this._blastDirection = { x: 0, y: 0, z: 0 };
    this.detonated = false;
  }

  activate(id, spawn, ctx) {
    super.activate(id, spawn, ctx);
    this.detonated = false;
  }

  attack(target, ctx) {
    if (!this.active || !this.damageable.alive || this.detonated || !this.canAttack(target, ctx)) return;
    this.detonated = true;
    for (const player of ctx.players) {
      if (!player.damageable.alive) continue;
      const dx = player.position.x - this.position.x;
      const dy = (player.position.y ?? 0) - this.position.y;
      const dz = player.position.z - this.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > this.blastRadius + player.body.radius) continue;
      this._rayOrigin.x = this.position.x;
      this._rayOrigin.y = this.position.y + this.height / 2;
      this._rayOrigin.z = this.position.z;
      this._blastDirection.x = distance > 0 ? dx / distance : 0;
      this._blastDirection.y = distance > 0 ? dy / distance : 0;
      this._blastDirection.z = distance > 0 ? dz / distance : 0;
      if (ctx.collision.raycast(this._rayOrigin, this._blastDirection, distance) !== Infinity) continue;
      ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({
        amount: this.blastDamage, sourceId: this.id, targetId: player.id, kind: 'explosion',
      }));
    }
    ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({
      amount: this.damageable.health, sourceId: this.id, targetId: this.id, kind: 'explosion',
    }));
  }
}
