import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ModelLibrary: the GLB models a level may use instead of greybox stand-ins.
//
// A prop named X is drawn with web/assets/models/X.glb when one of the level's asset manifests
// (art/manifest/<name>.json, listed in the level's "manifests") marks X as "ready" and the
// file loads. Otherwise PropFactory falls back to the registered stand-in, then to a grey
// box. A model that fails to load is reported and skipped; it never breaks the level.
//
// Parts of a model whose material is named glow_<kind> (accent, accent_faulty, alarm, screen)
// get the palette's glowing material of that kind, so signs flicker and beacons pulse the
// same way on a model as on a stand-in.
const GLOW_PREFIX = 'glow_';
const NAME = /^[A-Za-z0-9_-]+$/;

export class ModelLibrary {
  /**
   * @param {string} manifestUrl  folder of the asset manifests, with trailing slash
   * @param {string} modelsUrl    folder of the GLB files, with trailing slash
   */
  constructor(manifestUrl, modelsUrl) {
    this.manifestUrl = manifestUrl;
    this.modelsUrl = modelsUrl;
    this._templates = new Map();
    /** Ids the manifests mark "ready". */
    this.ready = new Set();
    /** Ids that should have loaded but did not (the level shows their stand-in). */
    this.failed = [];
  }

  /**
   * Reads the manifests and loads the ready models that the level actually uses.
   * @param {string[]} manifestNames  e.g. ['common', 'ch2']
   * @param {Iterable<string>} propNames  prop names used by the level
   */
  async load(manifestNames, propNames) {
    await Promise.all(manifestNames.map((name) => this._readManifest(name)));
    const wanted = Array.from(new Set(propNames)).filter((name) => this.ready.has(name));
    if (wanted.length === 0) return;
    const loader = new GLTFLoader();
    await Promise.all(wanted.map((id) => this._loadModel(loader, id)));
  }

  has(id) {
    return this._templates.has(id);
  }

  names() {
    return Array.from(this._templates.keys());
  }

  /**
   * A new instance of a model, around the origin. Geometry and materials are shared with
   * every other instance; glowing parts get the materials of `emitters`.
   * @param {string} id
   * @param {Emitters} emitters
   * @returns {THREE.Object3D}
   */
  instantiate(id, emitters) {
    const object = this._templates.get(id).clone(true);
    object.traverse((node) => {
      if (!node.isMesh || !node.material.name.startsWith(GLOW_PREFIX)) return;
      const glow = ModelLibrary.glowMaterial(emitters, node.material.name.slice(GLOW_PREFIX.length));
      if (!glow) {
        console.warn('[models] ' + id + ': unknown glow material "' + node.material.name + '"');
        return;
      }
      node.material = glow;
      node.castShadow = false;
      node.receiveShadow = false;
      node.userData.modelPart = false; // glowing parts are batched like any other glow
    });
    return object;
  }

  /** The palette's glowing material for a glow_<kind> part, or null for an unknown kind. */
  static glowMaterial(emitters, kind) {
    switch (kind) {
      case 'accent': return emitters.accentMaterial();
      case 'accent_faulty': return emitters.accentFaultyMaterial();
      case 'alarm': return emitters.alarmMaterial();
      case 'screen': return emitters.screenMaterial();
      default: return null;
    }
  }

  // ---- loading ------------------------------------------------------------------

  async _readManifest(name) {
    if (!NAME.test(name)) {
      console.warn('[models] invalid manifest name "' + name + '"');
      return;
    }
    try {
      const res = await fetch(this.manifestUrl + name + '.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const manifest = await res.json();
      (manifest.assets || []).forEach((asset) => {
        if (asset.status === 'ready') this.ready.add(asset.id);
      });
    } catch (err) {
      console.warn('[models] cannot read asset manifest "' + name + '": ' + err.message);
    }
  }

  _loadModel(loader, id) {
    return new Promise((resolve) => {
      loader.load(
        this.modelsUrl + id + '.glb',
        (gltf) => {
          const template = gltf.scene;
          template.name = id;
          template.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            node.userData.modelPart = true; // lets ModelInstancer find repeated parts
          });
          this._templates.set(id, template);
          resolve();
        },
        undefined,
        (err) => {
          const reason = (err && (err.message || (err.target && 'HTTP ' + err.target.status))) || 'load error';
          console.warn('[models] ' + id + '.glb did not load (' + reason + '); using its stand-in');
          this.failed.push(id);
          resolve();
        }
      );
    });
  }
}

/** An empty library: no manifests, no models. Used for ?models=0. */
ModelLibrary.none = function () {
  return new ModelLibrary('', '');
};
