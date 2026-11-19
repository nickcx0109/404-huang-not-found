import * as THREE from 'three';
import { EVENTS } from '../game/events.js';

const FLASH_SECONDS = 0.45;

/**
 * Greybox look of the effects in `ctx.effects`: one mesh per effect, made by the factory registered for
 * its `kind`, moved to the effect's position every frame and removed when the effect is gone.
 * Explosions get a short expanding flash. No lights are added. A new kind only needs `register`.
 */
export class EffectViews {
  constructor(scene, ctx, events) {
    this.scene = scene;
    this.context = ctx;
    this.factories = new Map();
    this.meshes = new Map();
    this.flashes = [];
    this.time = 0;
    this.flashGeometry = new THREE.SphereGeometry(1, 16, 12);
    this.flashMaterial = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9,
      depthWrite: false, fog: false });
    this._unsubscribe = events.on(EVENTS.EXPLODED, detail => this._flash(detail));
  }

  /** @param {(effect) => THREE.Object3D} create  builds the mesh of one effect of this kind */
  register(kind, create) {
    if (this.factories.has(kind)) throw new TypeError('Duplicate effect view: ' + kind);
    this.factories.set(kind, create);
    return this;
  }

  /** The standard looks: grenade, fire bottle and burning ground. */
  static standard(scene, ctx, events) {
    const grenade = new THREE.MeshStandardMaterial({ color: '#3d4a33', roughness: 0.6, metalness: 0.4 });
    const bottle = new THREE.MeshStandardMaterial({ color: '#7a5a2a', roughness: 0.3, emissive: '#ff6a00',
      emissiveIntensity: 0.6 });
    // Deep, saturated colours outside tone mapping, so the fire stays orange in the graded dark picture.
    const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
      depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false });
    const fire = glow('#b52200', 0.5);
    const flames = glow('#ff4d00', 0.85);
    const sphere = new THREE.SphereGeometry(0.07, 10, 8);
    const cylinder = new THREE.CylinderGeometry(0.045, 0.05, 0.24, 8);
    const disc = new THREE.CircleGeometry(1, 28);
    // A flame tongue: a thin upright cone shape, flat, wider at the bottom.
    const tongue = new THREE.ConeGeometry(0.22, 1, 3, 1, true);
    const views = new EffectViews(scene, ctx, events)
      .register('grenade', () => new THREE.Mesh(sphere, grenade))
      .register('molotov', () => new THREE.Mesh(cylinder, bottle))
      .register('fire', effect => {
        const group = new THREE.Group();
        const ground = new THREE.Mesh(disc, fire);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0.03;
        ground.scale.setScalar(effect.radius);
        group.add(ground);
        // A few flame tongues standing up, so the fire reads from a distance.
        for (let index = 0; index < 11; index++) {
          const angle = index / 11 * Math.PI * 2 + index * 0.7;
          const reach = effect.radius * (0.15 + 0.7 * ((index * 37) % 11) / 11);
          const tall = 0.5 + 0.6 * ((index * 53) % 7) / 7;
          const flame = new THREE.Mesh(tongue, flames);
          flame.scale.set(1, tall, 1);
          flame.position.set(Math.cos(angle) * reach, tall / 2, Math.sin(angle) * reach);
          group.add(flame);
        }
        group.userData.flicker = true;
        return group;
      });
    views._owned = [grenade, bottle, fire, flames, sphere, cylinder, disc, tongue];
    return views;
  }

  /** Once per frame: match the meshes to the effects, flicker the fire, fade the flashes. */
  update(dt) {
    this.time += dt;
    const live = this.context.effects;
    for (const effect of live) {
      let mesh = this.meshes.get(effect);
      if (!mesh) {
        const create = this.factories.get(effect.kind);
        if (!create) continue;
        mesh = create(effect);
        this.meshes.set(effect, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(effect.position.x, effect.position.y, effect.position.z);
      if (mesh.userData.flicker) {
        const pulse = 1 + 0.12 * Math.sin(this.time * 17 + effect.position.x) * Math.sin(this.time * 11);
        mesh.scale.set(1, pulse, 1);
      } else if (effect.velocity) {
        mesh.rotation.x += dt * 9;
        mesh.rotation.z += dt * 6;
      }
    }
    for (const [effect, mesh] of this.meshes) {
      if (live.includes(effect)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(effect);
    }
    for (let index = this.flashes.length - 1; index >= 0; index--) {
      const flash = this.flashes[index];
      flash.age += dt;
      const t = flash.age / FLASH_SECONDS;
      if (t >= 1) {
        this.scene.remove(flash.mesh);
        flash.mesh.material.dispose();
        this.flashes.splice(index, 1);
        continue;
      }
      flash.mesh.scale.setScalar(flash.radius * (0.25 + 0.55 * t));
      flash.mesh.material.opacity = 0.9 * (1 - t);
    }
  }

  _flash({ x, y, z, radius }) {
    const mesh = new THREE.Mesh(this.flashGeometry, this.flashMaterial.clone());
    mesh.position.set(x, Math.max(y, 0.3), z);
    mesh.scale.setScalar(radius * 0.25);
    this.scene.add(mesh);
    this.flashes.push({ mesh, radius, age: 0 });
  }

  dispose() {
    this._unsubscribe();
    for (const mesh of this.meshes.values()) this.scene.remove(mesh);
    this.meshes.clear();
    for (const flash of this.flashes) {
      this.scene.remove(flash.mesh);
      flash.mesh.material.dispose();
    }
    this.flashes.length = 0;
    this.flashGeometry.dispose();
    this.flashMaterial.dispose();
    for (const owned of this._owned ?? []) owned.dispose();
  }
}
