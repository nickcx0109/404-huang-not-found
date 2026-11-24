import * as THREE from 'three';
import { EVENTS } from '../game/events.js';
import { PLAYER_BODY } from '../player/PlayerBody.js';
import { NetworkedSession } from '../net/NetworkedSession.js';

/** One colour per room slot (p1..p3); the team room list uses the same ones. */
export const SLOT_COLORS = Object.freeze(['#4fa3ff', '#ffb03a', '#7dff6a']);
const FLASH_SECONDS = 0.06;
const LABEL_HEIGHT = 0.28;

/**
 * Teammates online: a capsule in the player's slot colour with their name floating above it,
 * moved to the interpolated snapshot every frame. A downed teammate lies down; one who is out
 * is hidden. Their shots flash at the muzzle. The local player is never drawn (the camera is them).
 * No lights are added.
 */
export class RemotePlayerViews {
  /**
   * @param {THREE.Scene} scene
   * @param {EventBus} events
   * @param {string} localId
   * @param {(id: string) => string} nameOf
   */
  constructor(scene, events, localId, nameOf, { doc = globalThis.document } = {}) {
    this.scene = scene;
    this.localId = localId;
    this.nameOf = nameOf;
    this.doc = doc;
    const radius = PLAYER_BODY.radius * 0.8;
    const length = PLAYER_BODY.height - radius * 2;
    this.radius = radius;
    this.length = length;
    this.bodyGeometry = new THREE.CylinderGeometry(radius, radius, length, 12);
    this.capGeometry = new THREE.SphereGeometry(radius, 12, 8);
    this.flashGeometry = new THREE.SphereGeometry(0.09, 8, 6);
    this.flashMaterial = new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false, toneMapped: false });
    this.views = new Map();
    this._unsubscribe = events.on(EVENTS.WEAPON_FIRED, detail => this._flash(detail.ownerId));
  }

  /** @param {Array<{id, x, y, z, yaw, downed, alive}>} records  SnapshotBuffer.sample(...).players */
  update(dt, records) {
    const seen = new Set();
    for (const record of records ?? []) {
      if (record.id === this.localId) continue;
      seen.add(record.id);
      const view = this.views.get(record.id) ?? this._create(record.id);
      const name = this.nameOf(record.id);
      if (name !== view.name) this._label(view, name);
      view.root.visible = record.alive !== false;
      view.root.position.set(record.x, record.y ?? 0, record.z);
      view.root.rotation.y = Number.isFinite(record.yaw) ? record.yaw : 0;
      // Downed: the capsule lies on the ground, the name stays readable above it.
      view.body.rotation.x = record.downed ? Math.PI / 2 : 0;
      view.body.position.y = record.downed ? this.radius : PLAYER_BODY.height / 2;
      view.label.position.y = (record.downed ? this.radius * 2 : PLAYER_BODY.height) + 0.35;
      if (view.flashLeft > 0) {
        view.flashLeft -= dt;
        view.flash.visible = view.flashLeft > 0;
      }
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this._remove(view);
      this.views.delete(id);
    }
  }

  _create(id) {
    const color = SLOT_COLORS[NetworkedSession.slotOf(id) % SLOT_COLORS.length];
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 });
    const root = new THREE.Group();
    root.name = 'remote-player:' + id;
    const body = new THREE.Group();
    body.add(new THREE.Mesh(this.bodyGeometry, material));
    for (const end of [1, -1]) {
      const cap = new THREE.Mesh(this.capGeometry, material);
      cap.position.y = end * this.length / 2;
      body.add(cap);
    }
    root.add(body);
    const flash = new THREE.Mesh(this.flashGeometry, this.flashMaterial);
    flash.position.set(0.25, PLAYER_BODY.eyeHeight - 0.25, -0.6); // in front of the right shoulder
    flash.visible = false;
    root.add(flash);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    root.add(label);
    this.scene.add(root);
    const view = { root, body, material, label, flash, flashLeft: 0, name: null, color };
    this.views.set(id, view);
    return view;
  }

  /** Draws the name in the slot colour on a small canvas texture. */
  _label(view, name) {
    view.name = name;
    view.label.material.map?.dispose();
    view.label.material.map = null;
    const canvas = this.doc?.createElement?.('canvas');
    const context = canvas?.getContext?.('2d');
    if (!context) return;
    const font = 'bold 40px "Courier New", monospace';
    context.font = font;
    const width = Math.ceil(context.measureText(name).width) + 24;
    canvas.width = width;
    canvas.height = 56;
    context.font = font;
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(8, 6, 5, 0.55)';
    context.fillRect(0, 0, width, 56);
    context.fillStyle = view.color;
    context.fillText(name, 12, 30);
    const texture = new THREE.CanvasTexture(canvas);
    view.label.material.map = texture;
    view.label.material.needsUpdate = true;
    view.label.scale.set(LABEL_HEIGHT * width / 56, LABEL_HEIGHT, 1);
  }

  _flash(ownerId) {
    const view = this.views.get(ownerId);
    if (!view) return;
    view.flashLeft = FLASH_SECONDS;
    view.flash.visible = true;
  }

  _remove(view) {
    this.scene.remove(view.root);
    view.material.dispose();
    view.label.material.map?.dispose();
    view.label.material.dispose();
  }

  dispose() {
    this._unsubscribe();
    for (const view of this.views.values()) this._remove(view);
    this.views.clear();
    this.bodyGeometry.dispose();
    this.capGeometry.dispose();
    this.flashGeometry.dispose();
    this.flashMaterial.dispose();
  }
}
