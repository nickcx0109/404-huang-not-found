import * as THREE from 'three';
import { EVENTS } from '../game/events.js';

const DEFAULT_COLORS = Object.freeze({ body: '#4b504e', outline: '#ffb03a' });
/** Outline thickness in metres, added on every side of the gun. */
const OUTLINE_METRES = 0.025;
const PULSE_PER_SECOND = 2.4;

/**
 * Greybox look of the weapons on the ground: a box sized like the gun, lying on the ground,
 * with a bright outline around its edges that pulses so it stands out in the dark.
 * The outline is an inverted hull (a slightly larger box drawing only its back faces); it ignores fog
 * so it still shows from down the street. No lights are added. Meshes are made once per pickup and
 * only resized when a swap changes the gun.
 */
export class WeaponPickupViews {
  constructor(scene, field, events, { colors = DEFAULT_COLORS, clock = () => performance.now() / 1000 } = {}) {
    this.scene = scene;
    this.field = field;
    this.clock = clock;
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.55, metalness: 0.3 });
    this.outlineMaterial = new THREE.MeshBasicMaterial({ color: colors.outline, side: THREE.BackSide,
      fog: false, transparent: true, opacity: 1 });
    // One material for every outline, so one pulse per frame drives them all.
    this._pulsedAt = -1;
    this.views = new Map();
    for (const pickup of field.pickups) this.views.set(pickup.id, this._create(pickup));
    this._unsubscribe = events.on(EVENTS.WEAPON_PICKED_UP, ({ pickupId }) => this.refresh(pickupId));
  }

  _create(pickup) {
    const root = new THREE.Group();
    root.name = 'pickup:' + pickup.id;
    root.position.set(pickup.position.x, 0, pickup.position.z);
    // Each gun lies at its own angle so they do not all point the same way.
    root.rotation.y = (pickup.position.x * 1.7 + pickup.position.z * 0.9) % (Math.PI * 2);
    const body = new THREE.Mesh(this.box, this.bodyMaterial);
    const outline = new THREE.Mesh(this.box, this.outlineMaterial);
    outline.onBeforeRender = () => this._pulse();
    root.add(body, outline);
    this.scene.add(root);
    const view = { root, body, outline };
    this._fit(view, pickup);
    return view;
  }

  _pulse() {
    const now = this.clock();
    if (now === this._pulsedAt) return;
    this._pulsedAt = now;
    this.outlineMaterial.opacity = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(now * PULSE_PER_SECOND));
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
    const lift = height / 2 + OUTLINE_METRES;
    view.body.scale.set(width, height, length);
    view.body.position.y = lift;
    view.outline.scale.set(width + OUTLINE_METRES * 2, height + OUTLINE_METRES * 2, length + OUTLINE_METRES * 2);
    view.outline.position.y = lift;
  }

  dispose() {
    this._unsubscribe();
    for (const view of this.views.values()) this.scene.remove(view.root);
    this.views.clear();
    this.box.dispose();
    this.bodyMaterial.dispose();
    this.outlineMaterial.dispose();
  }
}
