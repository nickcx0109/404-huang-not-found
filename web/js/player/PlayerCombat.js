import * as THREE from 'three';
import { EVENTS } from '../game/events.js';
import { WeaponTrigger } from '../weapons/WeaponTrigger.js';

const WHEEL_NOTCH = 50;

export class PlayerCombat {
  /** @param {RecoilKick|null} recoil  kicks the view when this player's gun fires */
  constructor(controller, camera, ctx, ownerId, recoil = null) {
    this.recoil = recoil;
    this.controller = controller;
    this.camera = camera;
    this.context = ctx;
    this.ownerId = ownerId;
    this._direction = new THREE.Vector3();
    this._ownerRequest = Object.freeze({ ownerId });
    this.trigger = new WeaponTrigger(ctx, ownerId);
    this._onMouseDown = event => {
      if (!this.controller.locked) return;
      if (event.button === 0) {
        this.updateAim();
        this.trigger.press();
      } else if (event.button === 2) {
        // Right button: the item's second use, e.g. bandaging the teammate in front.
        this.updateAim();
        ctx.events.emit(EVENTS.SECONDARY_REQUESTED, this._ownerRequest);
      }
    };
    this._onContextMenu = event => { if (this.controller.locked) event.preventDefault(); };
    this._onMouseUp = event => { if (event.button === 0) this.trigger.release(); };
    this._onBlur = () => this.trigger.release();
    this._onPointerLockChange = () => {
      if (!document.pointerLockElement) this.trigger.release();
    };
    this._onKeyDown = event => {
      if (event.repeat || !this.controller.locked) return;
      if (event.code === 'KeyR') ctx.events.emit(EVENTS.RELOAD_REQUESTED, this._ownerRequest);
      else if (event.code === 'KeyE') {
        // E uses the nearest ground item or ammunition box.
        ctx.events.emit(EVENTS.PICKUP_REQUESTED, this._ownerRequest);
      }
      else if (/^Digit[1-9]$/.test(event.code)) {
        ctx.events.emit(EVENTS.SWITCH_REQUESTED, { ownerId, index: Number(event.code.slice(-1)) - 1 });
      }
    };
    // The wheel moves one slot per notch; a trackpad's many small deltas are added up to one notch first.
    this._wheel = 0;
    this._onWheel = event => {
      if (!this.controller.locked) return;
      this._wheel += event.deltaY;
      if (Math.abs(this._wheel) < WHEEL_NOTCH) return;
      ctx.events.emit(EVENTS.CYCLE_REQUESTED, { ownerId, step: Math.sign(this._wheel) });
      this._wheel = 0;
    };
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('contextmenu', this._onContextMenu);
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

  update(dt = 0) {
    if (this.recoil) {
      const turn = this.recoil.update(dt);
      if (turn.pitch !== 0 || turn.yaw !== 0) {
        this.controller.nudge(turn.pitch, turn.yaw);
        this.controller._syncCamera();
      }
    }
    this.updateAim();
    if (this.controller.locked) this.trigger.update();
    else this.trigger.release();
  }

  dispose() {
    this.trigger.release();
    window.removeEventListener('wheel', this._onWheel);
    this.recoil?.dispose();
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
