import * as THREE from 'three';

const OUTLINE_METRES = 0.03;
const PULSE_PER_SECOND = 2.4;
const SIZE = Object.freeze({ width: 0.7, height: 0.42, depth: 0.45 });

/**
 * Greybox look of the ammunition boxes: an olive box on the ground with a pulsing green outline,
 * like the guns on the ground but another colour. While a box rests its outline goes dim and still.
 * No lights are added. `update` is called once per frame.
 */
export class AmmoCrateViews {
  constructor(scene, field, clock) {
    this.scene = scene;
    this.field = field;
    this.clock = clock;
    this.time = 0;
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: '#4a5232', roughness: 0.8, metalness: 0.1 });
    this.readyMaterial = new THREE.MeshBasicMaterial({ color: '#7dff6a', side: THREE.BackSide, fog: false,
      transparent: true, opacity: 1 });
    this.restingMaterial = new THREE.MeshBasicMaterial({ color: '#3b5a35', side: THREE.BackSide, fog: false,
      transparent: true, opacity: 0.5 });
    this.views = field.crates.map(crate => this._create(crate));
  }

  _create(crate) {
    const root = new THREE.Group();
    root.name = 'ammo:' + crate.id;
    root.position.set(crate.position.x, 0, crate.position.z);
    root.rotation.y = (crate.position.x * 1.3 + crate.position.z * 0.7) % (Math.PI * 2);
    const body = new THREE.Mesh(this.box, this.bodyMaterial);
    body.scale.set(SIZE.width, SIZE.height, SIZE.depth);
    body.position.y = SIZE.height / 2;
    const outline = new THREE.Mesh(this.box, this.readyMaterial);
    outline.scale.set(SIZE.width + OUTLINE_METRES * 2, SIZE.height + OUTLINE_METRES * 2, SIZE.depth + OUTLINE_METRES * 2);
    outline.position.y = SIZE.height / 2;
    root.add(body, outline);
    this.scene.add(root);
    return { crate, outline };
  }

  update(dt) {
    this.time += dt;
    this.readyMaterial.opacity = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * PULSE_PER_SECOND));
    const now = this.clock();
    for (const view of this.views) {
      view.outline.material = view.crate.ready(now) ? this.readyMaterial : this.restingMaterial;
    }
  }

  dispose() {
    for (const view of this.views) this.scene.remove(view.outline.parent);
    this.views.length = 0;
    this.box.dispose();
    this.bodyMaterial.dispose();
    this.readyMaterial.dispose();
    this.restingMaterial.dispose();
  }
}
