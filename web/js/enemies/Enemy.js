import { Aabb } from '../CollisionWorld.js';
import { Entity } from '../entities/Entity.js';
import { Damageable } from '../entities/Damageable.js';
import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from '../game/events.js';

export class Enemy extends Entity {
  constructor({ events, pathFinder, view = null }, { health, speed, reward, brain, attackDamage = 10 }) {
    super(null);
    if (new.target === Enemy) throw new TypeError('Enemy is abstract');
    this.damageable = new Damageable(this, health, events);
    this.speed = speed;
    this.reward = reward;
    this.attackDamage = attackDamage;
    this.brain = brain;
    this.view = view;
    this.radius = pathFinder.radius;
    this.height = pathFinder.height;
    this.headHeight = this.height - 0.4;
    this.hitVolume = new Aabb(0, 0, 0, 0, 0, 0);
    this.route = pathFinder.createRoute();
    this._movement = { x: 0, z: 0, hitX: false, hitZ: false };
    this._rayOrigin = { x: 0, y: 0, z: 0 };
    this._rayDirection = { x: 0, y: 0, z: 0 };
    this.active = false;
  }

  activate(id, spawn, ctx) {
    this.id = id;
    this.position.x = spawn.x;
    this.position.y = spawn.y ?? 0;
    this.position.z = spawn.z;
    this.damageable.reset();
    this.active = true;
    this.rewarded = false;
    this.route.length = 0;
    this.routeIndex = 0;
    this.nextPathAt = ctx.time;
    this.nextAttackAt = ctx.time;
    if (this.view) this.view.visible = true;
    this.syncView();
  }

  update(dt, ctx) {
    if (!this.active || !this.damageable.alive) return;
    this.brain.update(this, dt, ctx);
    this.syncView();
  }

  canAttack(target, ctx) {
    if (!target?.damageable.alive) return false;
    const dx = target.position.x - this.position.x;
    const dz = target.position.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > this.radius + target.body.radius + 0.5) return false;
    this._rayOrigin.x = this.position.x;
    this._rayOrigin.y = this.position.y + this.height / 2;
    this._rayOrigin.z = this.position.z;
    this._rayDirection.x = distance > 0 ? dx / distance : 0;
    this._rayDirection.z = distance > 0 ? dz / distance : 0;
    return ctx.collision.raycast(this._rayOrigin, this._rayDirection, distance) === Infinity;
  }

  attack(target, ctx) {
    if (ctx.time < this.nextAttackAt) return;
    this.nextAttackAt = ctx.time + 1;
    ctx.events.emit(EVENTS.DAMAGE_REQUESTED, new DamageInfo({
      amount: this.attackDamage, sourceId: this.id, targetId: target.id, kind: 'melee',
    }));
  }

  moveToward(target, dt, ctx) {
    if (!target?.damageable.alive) return;
    const position = this.position;
    const distance = Math.hypot(target.position.x - position.x, target.position.z - position.z);
    if (ctx.time >= this.nextPathAt) {
      ctx.pathFinder.findPathInto(position.x, position.z, target.position.x, target.position.z, this.route);
      this.routeIndex = 0;
      this.nextPathAt = ctx.time + (distance > 20 ? 1.5 : 0.75);
    }
    if (this.route.length === 0) return;
    while (this.routeIndex < this.route.length - 1 && this.passedWaypoint(ctx.pathFinder.cell)) this.routeIndex++;
    const atGoal = this.routeIndex === this.route.length - 1;
    const dx = (atGoal ? target.position.x : this.route.points[this.routeIndex * 2]) - position.x;
    const dz = (atGoal ? target.position.z : this.route.points[this.routeIndex * 2 + 1]) - position.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) return;
    const step = Math.min(this.speed * dt, length);
    ctx.collision.move(position.x, position.z, dx / length * step, dz / length * step,
      this.radius, position.y, position.y + this.height, this._movement);
    position.x = this._movement.x;
    position.z = this._movement.z;
  }

  /**
   * Whether the zombie is done with its current waypoint: standing on it, or close to it while it is
   * either the first point of the route or already behind the zombie on the way to the next one. A fresh route starts at the centre of the
   * cell the zombie stands in, often a step back; with another zombie pressed against its back it
   * could never get there and both would stand still, pushing each other forever.
   * @param {number} near  how close counts as "close" (one path cell)
   */
  passedWaypoint(near) {
    const points = this.route.points;
    const i = this.routeIndex * 2;
    const toX = points[i] - this.position.x;
    const toZ = points[i + 1] - this.position.z;
    const distance = Math.hypot(toX, toZ);
    if (distance < 0.12) return true;
    if (distance >= near) return false;
    // the first point of a route is only the centre of the cell the zombie is already in
    if (this.routeIndex === 0) return true;
    return toX * (points[i + 2] - points[i]) + toZ * (points[i + 3] - points[i + 1]) < 0;
  }

  syncView() {
    const position = this.position;
    const box = this.hitVolume;
    box.minX = position.x - this.radius;
    box.maxX = position.x + this.radius;
    box.minY = position.y;
    box.maxY = position.y + this.height;
    box.minZ = position.z - this.radius;
    box.maxZ = position.z + this.radius;
    if (this.view) this.view.position.set(position.x, position.y + this.height / 2, position.z);
  }

  deactivate() {
    this.active = false;
    this.route.length = 0;
    if (this.view) this.view.visible = false;
  }

  dispose() {
    this.deactivate();
    if (this.view) {
      if (this.view.parent) this.view.parent.remove(this.view);
      this.view.geometry.dispose();
      this.view.material.dispose();
    }
    super.dispose();
  }
}
