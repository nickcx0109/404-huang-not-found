import * as THREE from 'three';
import { EVENTS } from '../game/events.js';
import { WeaponTrigger } from '../weapons/WeaponTrigger.js';

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
    this.trigger = new WeaponTrigger(ctx, ownerId);
    this._onMouseDown = event => {
      if (event.button === 0 && this.controller.locked) {
        this.updateAim();
        this.trigger.press();
      }
    };
    this._onMouseUp = event => { if (event.button === 0) this.trigger.release(); };
    this._onBlur = () => this.trigger.release();
    this._onPointerLockChange = () => {
      if (!document.pointerLockElement) this.trigger.release();
    };
    this._onKeyDown = event => {
      if (event.repeat || !this.controller.locked) return;
      if (event.code === 'KeyR') ctx.events.emit(EVENTS.RELOAD_REQUESTED, this._ownerRequest);
      else if (event.code === 'KeyE') {
        // E is "use": the session ignores whichever of the two does not apply where the player stands.
        ctx.events.emit(EVENTS.PICKUP_REQUESTED, this._ownerRequest);
        ctx.events.emit(EVENTS.PURCHASE_REQUESTED, this._purchaseRequest);
      }
      else if (/^Digit[1-9]$/.test(event.code)) {
        ctx.events.emit(EVENTS.SWITCH_REQUESTED, { ownerId, index: Number(event.code.slice(-1)) - 1 });
      }
    };
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
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

  update() {
    this.updateAim();
    if (this.controller.locked) this.trigger.update();
    else this.trigger.release();
  }

  dispose() {
    this.trigger.release();
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
