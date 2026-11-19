import * as THREE from 'three';
import { EVENTS } from '../game/events.js';

const DEFAULT_COLORS = Object.freeze({ glow: '#ff9a2e', ring: '#ffa53d' });
const HOVER_HEIGHT = 0.55;
const BOB_METRES = 0.06;
const SPIN_PER_SECOND = 0.9;
const RING_PULSE_PER_SECOND = 2.2;
const BEAM_HEIGHT = 2.6;

/**
 * Greybox look of the weapons on the ground, highlighted so they read through the fog:
 * a self-lit box sized like the gun that slowly turns and bobs, over a glowing ring that pulses,
 * inside a faint column of light that can be seen from down the street.
 * No lights are added. Meshes are made once per pickup and only resized when a swap changes the gun.
 */
export class WeaponPickupViews {
  constructor(scene, field, events, { colors = DEFAULT_COLORS, clock = () => performance.now() / 1000 } = {}) {
    this.scene = scene;
    this.field = field;
    this.clock = clock;
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.ringGeometry = new THREE.RingGeometry(0.42, 0.55, 40);
    this.ringGeometry.rotateX(-Math.PI / 2);
    this.gunMaterial = new THREE.MeshStandardMaterial({ color: colors.glow, emissive: colors.glow,
      emissiveIntensity: 0.55, roughness: 0.6 });
    // The ring ignores fog so a gun far down the road still shows as a small light.
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: colors.ring, transparent: true, opacity: 0.75,
      depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.beamGeometry = new THREE.CylinderGeometry(0.32, 0.5, BEAM_HEIGHT, 20, 1, true);
    this.beamGeometry.translate(0, BEAM_HEIGHT / 2, 0);
    this.beamMaterial = new THREE.MeshBasicMaterial({ color: colors.ring, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.views = new Map();
    for (const pickup of field.pickups) this.views.set(pickup.id, this._create(pickup));
    this._unsubscribe = events.on(EVENTS.WEAPON_PICKED_UP, ({ pickupId }) => this.refresh(pickupId));
  }

  _create(pickup) {
    const root = new THREE.Group();
    root.name = 'pickup:' + pickup.id;
    root.position.set(pickup.position.x, 0, pickup.position.z);
    const gun = new THREE.Mesh(this.box, this.gunMaterial);
    gun.position.y = HOVER_HEIGHT;
    const phase = (pickup.position.x * 1.7 + pickup.position.z * 0.9) % (Math.PI * 2);
    gun.onBeforeRender = () => {
      const t = this.clock() + phase;
      gun.rotation.y = t * SPIN_PER_SECOND;
      gun.position.y = HOVER_HEIGHT + Math.sin(t * 1.6) * BOB_METRES;
    };
    const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    ring.position.y = 0.03;
    ring.renderOrder = 1;
    ring.onBeforeRender = () => {
      const pulse = 1 + 0.12 * Math.sin((this.clock() + phase) * RING_PULSE_PER_SECOND);
      ring.scale.set(pulse, 1, pulse);
    };
    const beam = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
    beam.renderOrder = 2;
    root.add(gun, ring, beam);
    this.scene.add(root);
    const view = { root, gun, ring, beam };
    this._fit(view, pickup);
    return view;
  }

  /** Matches one view to its pickup again after a swap: new size, or hidden when nothing is left. */
  refresh(pickupId) {
    const view = this.views.get(pickupId);
    const pickup = this.field.pickups.find(candidate => candidate.id === pickupId);
    if (view && pickup) this._fit(view, pickup);
  }

  _fit(view, pickup) {
    view.root.visible = !pickup.empty;
    if (pickup.empty) return;
    const { length, height, width } = this.field.catalog.entry(pickup.weapon.id).look;
    view.gun.scale.set(width, height, length);
  }

  dispose() {
    this._unsubscribe();
    for (const view of this.views.values()) this.scene.remove(view.root);
    this.views.clear();
    this.box.dispose();
    this.ringGeometry.dispose();
    this.gunMaterial.dispose();
    this.ringMaterial.dispose();
    this.beamGeometry.dispose();
    this.beamMaterial.dispose();
  }
}
