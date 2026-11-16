import * as THREE from 'three';
import { PLAYER_BODY } from './player/PlayerBody.js';

// PlayerController: first-person walking. Pointer-lock mouse look + WASD,
// eye height 1.7 m, AABB collision against the level's CollisionWorld.
const DEFAULTS = Object.freeze({
  ...PLAYER_BODY,
  walkSpeed: 4.5,   // m/s
  sprintSpeed: 7.0, // m/s, hold Shift
  acceleration: 14, // how quickly velocity follows the keys (1/s)
  sensitivity: 0.0022, // radians per pixel of mouse movement
  maxPitch: 85,     // degrees
});

const KEY_BINDINGS = Object.freeze({
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
});

export class PlayerController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement   element that takes the pointer lock
   * @param {CollisionWorld} collision
   * @param {object} [options] overrides for DEFAULTS
   */
  constructor(camera, domElement, collision, options) {
    this.camera = camera;
    this.dom = domElement;
    this.collision = collision;
    this.options = Object.assign({}, DEFAULTS, options);

    this.x = 0;
    this.z = 0;
    this.yaw = 0;   // radians, 0 looks toward -Z, positive turns left
    this.pitch = 0; // radians, positive looks up
    this.velocityX = 0;
    this.velocityZ = 0;
    /** Keys only move the player while enabled (pointer locked). */
    this.enabled = false;
    this.onLockChange = null;
    this._movement = { x: 0, z: 0, hitX: false, hitZ: false };

    this._keys = { forward: false, back: false, left: false, right: false, sprint: false };
    this.camera.rotation.order = 'YXZ';

    this._onKeyDown = (e) => this._setKey(e, true);
    this._onKeyUp = (e) => this._setKey(e, false);
    this._onMouseMove = (e) => this._look(e.movementX || 0, e.movementY || 0);
    this._onLockChange = () => {
      this.enabled = this.locked;
      if (!this.enabled) this._releaseKeys();
      if (this.onLockChange) this.onLockChange(this.enabled);
    };
    this._onBlur = () => this._releaseKeys();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  get locked() {
    return document.pointerLockElement === this.dom;
  }

  requestLock() {
    if (!this.locked && this.dom.requestPointerLock) this.dom.requestPointerLock();
  }

  /** Puts the player on a spawn point ({x, z, yaw in degrees}). */
  spawnAt(spawn) {
    this.x = spawn.x;
    this.z = spawn.z;
    this.yaw = THREE.MathUtils.degToRad(spawn.yaw || 0);
    this.pitch = 0;
    this.velocityX = 0;
    this.velocityZ = 0;
    this._syncCamera();
  }

  /** Advances the simulation by dt seconds. */
  update(dt) {
    const o = this.options;
    const k = this._keys;
    const active = this.enabled;

    let forward = active ? (k.forward ? 1 : 0) - (k.back ? 1 : 0) : 0;
    let strafe = active ? (k.right ? 1 : 0) - (k.left ? 1 : 0) : 0;
    const length = Math.hypot(forward, strafe);
    if (length > 1) {
      forward /= length;
      strafe /= length;
    }

    const speed = active && k.sprint ? o.sprintSpeed : o.walkSpeed;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin) on the XZ plane
    const targetX = (-sin * forward + cos * strafe) * speed;
    const targetZ = (-cos * forward - sin * strafe) * speed;

    const blend = 1 - Math.exp(-o.acceleration * dt);
    this.velocityX += (targetX - this.velocityX) * blend;
    this.velocityZ += (targetZ - this.velocityZ) * blend;

    if (Math.abs(this.velocityX) > 1e-4 || Math.abs(this.velocityZ) > 1e-4) {
      const moved = this.collision.move(
        this.x, this.z,
        this.velocityX * dt, this.velocityZ * dt,
        o.radius, 0, o.height, this._movement
      );
      this.x = moved.x;
      this.z = moved.z;
      if (moved.hitX) this.velocityX = 0;
      if (moved.hitZ) this.velocityZ = 0;
    }
    this._syncCamera();
  }

  /** Current view as a level bookmark (handy for authoring camera positions). */
  toBookmark(name) {
    const round = (n) => Math.round(n * 100) / 100;
    return {
      name: name || 'bookmark',
      pos: [round(this.x), this.options.eyeHeight, round(this.z)],
      yaw: Math.round(THREE.MathUtils.radToDeg(this.yaw) * 10) / 10,
      pitch: Math.round(THREE.MathUtils.radToDeg(this.pitch) * 10) / 10,
    };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }

  _setKey(event, down) {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    this._keys[action] = down;
    if (this.enabled) event.preventDefault();
  }

  _releaseKeys() {
    Object.keys(this._keys).forEach((key) => {
      this._keys[key] = false;
    });
  }

  _look(dx, dy) {
    if (!this.locked) return;
    const o = this.options;
    const limit = THREE.MathUtils.degToRad(o.maxPitch);
    this.yaw -= dx * o.sensitivity;
    this.pitch = Math.min(limit, Math.max(-limit, this.pitch - dy * o.sensitivity));
  }

  _syncCamera() {
    this.camera.position.set(this.x, this.options.eyeHeight, this.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
