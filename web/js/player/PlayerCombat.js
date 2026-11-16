import * as THREE from 'three';
import { EVENTS } from '../game/events.js';

export class PlayerCombat {
  constructor(controller, camera, ctx, ownerId, purchaseItemId) {
    this.controller = controller;
    this.camera = camera;
    this.context = ctx;
    this.ownerId = ownerId;
    this.purchaseItemId = purchaseItemId;
    this._direction = new THREE.Vector3();
    this._ownerRequest = Object.freeze({ ownerId });
    this._purchaseRequest = Object.freeze({ ownerId, itemId: purchaseItemId });
    this._onMouseDown = event => {
      if (event.button === 0 && this.controller.locked) {
        this.updateAim();
        ctx.events.emit(EVENTS.FIRE_REQUESTED, this._ownerRequest);
      }
    };
    this._onKeyDown = event => {
      if (event.repeat || !this.controller.locked) return;
      if (event.code === 'KeyR') ctx.events.emit(EVENTS.RELOAD_REQUESTED, this._ownerRequest);
      else if (event.code === 'KeyE') ctx.events.emit(EVENTS.PURCHASE_REQUESTED, this._purchaseRequest);
      else if (/^Digit[1-9]$/.test(event.code)) {
        ctx.events.emit(EVENTS.SWITCH_REQUESTED, { ownerId, index: Number(event.code.slice(-1)) - 1 });
      }
    };
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('keydown', this._onKeyDown);
  }

  updateAim() {
    const aim = this.context.aim;
    const position = this.camera.position;
    this.camera.getWorldDirection(this._direction);
    aim.origin.x = position.x;
    aim.origin.y = position.y;
    aim.origin.z = position.z;
    aim.direction.x = this._direction.x;
    aim.direction.y = this._direction.y;
    aim.direction.z = this._direction.z;
  }

  dispose() {
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
