import * as THREE from 'three';
import { EVENTS } from '../game/events.js';
import { WeaponTrigger } from '../weapons/WeaponTrigger.js';

export class PlayerCombat {
  constructor(controller, camera, ctx, ownerId) {
    this.controller = controller;
    this.camera = camera;
    this.context = ctx;
    this.ownerId = ownerId;
    this._direction = new THREE.Vector3();
    this._ownerRequest = Object.freeze({ ownerId });
    this.trigger = new WeaponTrigger(ctx, ownerId);
    this._onMouseDown = event => {
      if (event.button === 0 && this.controller.locked && !ctx.session.isShopOpen(ownerId)) {
        this.updateAim();
        this.trigger.press();
      }
    };
    this._onMouseUp = event => { if (event.button === 0) this.trigger.release(); };
    this._onBlur = () => this.trigger.release();
    this._onPointerLockChange = () => {
      if (!document.pointerLockElement) this.trigger.release();
    };
    this._unsubscribeShop = ctx.events.on(EVENTS.SHOP_CHANGED, detail => {
      if (detail.ownerId !== ownerId) return;
      this.trigger.release();
      if (detail.open && document.pointerLockElement) document.exitPointerLock();
    });
    this._onKeyDown = event => {
      if (event.repeat) return;
      const open = ctx.session.isShopOpen(ownerId);
      if (open && event.code === 'Escape') {
        ctx.events.emit(EVENTS.SHOP_CLOSE_REQUESTED, this._ownerRequest);
        event.preventDefault();
        return;
      }
      if (!this.controller.locked && !open) return;
      if (event.code === 'KeyE') {
        ctx.events.emit(EVENTS.SHOP_TOGGLE_REQUESTED, this._ownerRequest);
        if (open) this.controller.requestLock();
        event.preventDefault();
      } else if (open) {
        if (/^Digit[1-9]$/.test(event.code)) {
          const entry = [...ctx.session.catalog.entries.values()][Number(event.code.slice(-1)) - 1];
          if (entry) ctx.events.emit(EVENTS.PURCHASE_REQUESTED, { ownerId, itemId: entry.item.id });
          event.preventDefault();
        }
      } else if (event.code === 'KeyR') ctx.events.emit(EVENTS.RELOAD_REQUESTED, this._ownerRequest);
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
    if (this.controller.locked && !this.context.session.isShopOpen(this.ownerId)) this.trigger.update();
    else this.trigger.release();
  }

  dispose() {
    this._unsubscribeShop();
    this.trigger.release();
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
