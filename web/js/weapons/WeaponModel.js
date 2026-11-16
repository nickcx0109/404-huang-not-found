import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// WeaponModel: a weapon GLB turned into something that can be posed.
//
// The asset script marks moving pieces with asset.part("slide", pivot=...) and points with
// asset.marker("muzzle", at=...). In the GLB they arrive as nodes whose extras hold the name
// and the pivot; the vertices are left where they are. Here every part gets a group placed
// at its pivot, so that turning or sliding the group moves the piece the right way.
//
//   root ("gun")
//     body meshes
//     group "slide" (at the slide's pivot) -> slide meshes
//     ...
const AXES = Object.freeze({ x: 0, y: 1, z: 2 });

export class WeaponModel {
  /**
   * @param {string} id
   * @param {THREE.Object3D} source  the loaded glTF scene
   * @param {{roughness?: number, metalness?: number}} [surface]
   */
  constructor(id, source, surface = {}) {
    this.id = id;
    this.root = new THREE.Group();
    this.root.name = id;
    /** Posable nodes by name; "gun" is the whole weapon. */
    this.nodes = new Map([['gun', this.root]]);
    /** Named points of the model, in the gun's own space. */
    this.markers = new Map();
    this._rest = new Map([[this.root, new THREE.Vector3()]]);
    this._targets = new Map();

    const found = [];
    source.traverse((node) => found.push(node));
    const materials = new Map();
    for (const node of found) {
      const pivot = Array.isArray(node.userData.pivot) ? new THREE.Vector3().fromArray(node.userData.pivot) : null;
      if (node.userData.marker && pivot) this.markers.set(node.userData.marker, pivot);
      if (!node.isMesh) continue;
      if (!materials.has(node.material)) {
        const material = node.material.clone();
        if (surface.roughness !== undefined) material.roughness = surface.roughness;
        if (surface.metalness !== undefined) material.metalness = surface.metalness;
        materials.set(node.material, material);
      }
      node.material = materials.get(node.material);
      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = false; // always in view, and its bounds move with the pose
      if (node.userData.part && pivot) {
        node.position.copy(pivot).negate();
        this._partGroup(node.userData.part, pivot).add(node);
      } else {
        this.root.add(node);
      }
    }
  }

  /** @returns {Promise<WeaponModel>} */
  static load(modelsUrl, id, surface) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        modelsUrl + id + '.glb',
        (gltf) => resolve(new WeaponModel(id, gltf.scene, surface)),
        undefined,
        () => reject(new Error('Weapon model ' + id + '.glb did not load'))
      );
    });
  }

  /** A marker's position in the gun's space, or the origin with a warning. */
  marker(name) {
    if (!this.markers.has(name)) {
      console.warn('[weapons] ' + this.id + ' has no marker "' + name + '"');
      return new THREE.Vector3();
    }
    return this.markers.get(name).clone();
  }

  /**
   * Puts the model in a pose: every node back to rest, then each channel
   * ("slide.pos.z", "gun.rot.x", ...) added on top. Unknown channels are ignored, so one
   * clip can serve weapons that lack a part.
   */
  applyPose(channels) {
    for (const [node, rest] of this._rest) {
      node.position.copy(rest);
      node.rotation.set(0, 0, 0);
    }
    for (const channel in channels) {
      const target = this._target(channel);
      if (target) target.vector[target.axis] += channels[channel];
    }
  }

  _partGroup(name, pivot) {
    let group = this.nodes.get(name);
    if (!group) {
      group = new THREE.Group();
      group.name = name;
      group.position.copy(pivot);
      this.nodes.set(name, group);
      this._rest.set(group, pivot.clone());
      this.root.add(group);
    }
    return group;
  }

  _target(channel) {
    if (this._targets.has(channel)) return this._targets.get(channel);
    const [nodeName, kind, axis] = channel.split('.');
    const node = this.nodes.get(nodeName);
    const target = node && axis in AXES
      ? { vector: kind === 'rot' ? node.rotation : node.position, axis }
      : null;
    this._targets.set(channel, target);
    return target;
  }
}
