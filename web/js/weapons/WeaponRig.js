import * as THREE from 'three';
import { Palette } from '../Palette.js';
import { WeaponModel } from './WeaponModel.js';

// WeaponRig: draws the weapon in the player's hands.
//
// The weapon lives in its own small scene with its own camera and lights, drawn on top of
// the level after the depth buffer is cleared. That is why it never pokes through a wall,
// is not swallowed by the fog, does not throw a giant shadow in the flashlight, and does
// not use up the level's four dynamic lights. It is drawn before post-processing, so grain,
// vignette and tone mapping treat it like the rest of the picture.
//
// Its look (field of view, lights, muzzle flash) comes from
// art/style/chapters/weapons.json, "viewmodel". The fill light takes the level's own
// hemisphere colours, so the weapon sits in each chapter's mood.
//
// It listens on the App's event bus:
//   'weapon:equip'  (id)   show that weapon
//   'weapon:fire'          play one shot
//   'weapon:reload'        play the reload
// Gameplay code decides WHEN those happen (ammunition, fire rate, who shot whom); until it
// exists, bindDemoInput() sends them straight from the mouse and keyboard.
const NEAR = 0.01;
const FAR = 10;

export class WeaponRig {
  /** Weapon views by id, filled by WeaponRig.register(). */
  static views = new Map();

  /** @param {typeof WeaponView} ViewClass */
  static register(ViewClass) {
    if (!ViewClass.id) throw new Error('A weapon view needs a static id');
    WeaponRig.views.set(ViewClass.id, ViewClass);
  }

  /**
   * @param {object} config  the "viewmodel" block of weapons.json
   * @param {object} levelStyle  resolved palette style of the level
   * @param {string} modelsUrl
   * @param {EventBus} events
   */
  constructor(config, levelStyle, modelsUrl, events) {
    this.config = config;
    this.modelsUrl = modelsUrl;
    this.events = events;
    this.view = null;
    this.model = null;
    this._loading = null;
    this._models = new Map();
    this._flashTime = Infinity;
    this._lastYaw = null;
    this._lastPitch = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(config.fov, 1, NEAR, FAR);
    this.holder = new THREE.Group();
    this.holder.name = 'weapon-holder';
    this.scene.add(this.holder);

    const hemisphere = levelStyle.hemisphere;
    this.fill = new THREE.HemisphereLight(
      Palette.color(hemisphere.sky),
      Palette.color(hemisphere.ground),
      hemisphere.intensity * config.fill.intensity
    );
    this.key = new THREE.DirectionalLight(Palette.color(config.key.color), config.key.intensity);
    this.key.position.fromArray(config.key.direction).normalize();
    // The flash light is always there at intensity 0: adding a light later would make
    // every material recompile in the middle of a shot.
    this.flashLight = new THREE.PointLight(Palette.color(config.muzzleFlash.color), 0, 1.5, 2);
    this.scene.add(this.fill, this.key, this.flashLight);
    this.flash = WeaponRig._createFlash(config.muzzleFlash);

    this._unsubscribe = [
      events.on('weapon:equip', (id) => this.equip(id)),
      events.on('weapon:fire', () => this.fire()),
      events.on('weapon:reload', () => this.reload()),
      events.on('weapon:anim', (e) => {
        if (e.name === 'shot') this._startFlash();
      }),
    ];
  }

  /** Reads weapons.json and returns a rig with nothing in hand yet. */
  static async create({ styleUrl, modelsUrl, levelStyle, events }) {
    const res = await fetch(styleUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('Cannot load weapon style ' + styleUrl + ' (HTTP ' + res.status + ')');
    const style = await res.json();
    return new WeaponRig(style.viewmodel, levelStyle, modelsUrl, events);
  }

  /**
   * Puts a weapon in the player's hands and plays its equip animation.
   * @param {string} id  a registered weapon id
   */
  async equip(id) {
    const ViewClass = WeaponRig.views.get(id);
    if (!ViewClass) {
      throw new Error('Unknown weapon "' + id + '". Known: ' + Array.from(WeaponRig.views.keys()).join(', '));
    }
    this._loading = id;
    if (!this._models.has(id)) {
      this._models.set(id, await WeaponModel.load(this.modelsUrl, id, this.config.surface));
    }
    if (this._loading !== id) return; // another weapon was asked for meanwhile

    if (this.model) this.holder.remove(this.model.root);
    this.model = this._models.get(id);
    this.view = new ViewClass(this.model, this.events);
    this.holder.position.fromArray(ViewClass.hold.position);
    this.holder.rotation.fromArray(ViewClass.hold.rotation);
    this.holder.add(this.model.root);

    const muzzle = this.model.marker('muzzle');
    this.flash.position.copy(muzzle);
    this.model.root.add(this.flash);
    this._muzzle = muzzle;
    this.view.equip();
    this.view.update(0, 0);
  }

  fire() {
    return this.view ? this.view.fire() : false;
  }

  reload() {
    return this.view ? this.view.reload() : false;
  }

  /** Until gameplay exists: left mouse button fires, R reloads, while `isActive()`. */
  bindDemoInput(dom, isActive) {
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0 && isActive()) this.events.emit('weapon:fire');
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && !e.repeat && isActive()) this.events.emit('weapon:reload');
    });
  }

  /**
   * @param {number} dt seconds
   * @param {number} time seconds
   * @param {PlayerController} player  read for how the view is turning and moving
   * @param {boolean} flashlightOn
   */
  update(dt, time, player, flashlightOn) {
    const key = this.config.key;
    this.key.intensity = key.intensity + (flashlightOn ? key.flashlightBoost : 0);
    if (!this.view) return;

    let motion;
    if (player && dt > 0) {
      if (this._lastYaw === null) {
        this._lastYaw = player.yaw;
        this._lastPitch = player.pitch;
      }
      const speed = Math.hypot(player.velocityX, player.velocityZ);
      motion = {
        yawRate: (player.yaw - this._lastYaw) / dt,
        pitchRate: (player.pitch - this._lastPitch) / dt,
        speed,
        sprinting: speed > player.options.walkSpeed * 1.2,
      };
      this._lastYaw = player.yaw;
      this._lastPitch = player.pitch;
    }
    this.view.update(dt, time, motion);
    this._updateFlash(dt);
  }

  /**
   * One fixed moment for screenshots: rig.freeze('reload', 0.6). Without a clip name the
   * weapon is simply held ready.
   */
  freeze(clipName, time) {
    if (!this.view) return;
    if (!clipName) {
      this.model.applyPose({});
      this._showFlash(false, 0);
      return;
    }
    const clip = this.view.constructor.clips[clipName];
    this.view.freeze(clipName, time);
    const shot = clip.events.find((e) => e.name === 'shot');
    const since = shot ? time - shot.time : -1;
    this._showFlash(since >= 0 && since < this.config.muzzleFlash.seconds, 0.6);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Draws the weapon over whatever is in the current render target. */
  render(renderer) {
    if (!this.view) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this._unsubscribe.forEach((off) => off());
  }

  // ---- muzzle flash --------------------------------------------------------------------

  _startFlash() {
    this._flashTime = 0;
    this._showFlash(true, Math.random());
  }

  _updateFlash(dt) {
    if (this._flashTime === Infinity) return;
    this._flashTime += dt;
    if (this._flashTime >= this.config.muzzleFlash.seconds) {
      this._flashTime = Infinity;
      this._showFlash(false, 0);
    }
  }

  _showFlash(visible, variation) {
    this.flash.visible = visible;
    this.flashLight.intensity = visible ? this.config.muzzleFlash.light : 0;
    if (!visible) return;
    this.flash.rotation.z = variation * Math.PI * 2;
    this.flash.scale.setScalar(0.8 + variation * 0.5);
    // the light sits just ahead of the muzzle, in the rig's scene
    this.model.root.updateWorldMatrix(true, false);
    this.flashLight.position.copy(this._muzzle).applyMatrix4(this.model.root.matrixWorld);
  }

  /** A star seen from behind plus two blades along the barrel; brighter than white, so it blooms. */
  static _createFlash(cfg) {
    const positions = [];
    const triangle = (a, b, c) => positions.push(...a, ...b, ...c);
    const points = 8;
    for (let i = 0; i < points; i++) {
      const ring = (k) => {
        const angle = (k / points) * Math.PI * 2;
        const radius = k % 2 === 0 ? 0.05 : 0.016;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius, -0.01];
      };
      triangle([0, 0, -0.01], ring(i), ring(i + 1));
    }
    for (const [x, y] of [[0.014, 0], [0, 0.014]]) {
      triangle([x, y, 0], [0, 0, -0.13], [-x, -y, 0]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.MeshBasicMaterial({
      color: Palette.color(cfg.color).multiplyScalar(cfg.intensity),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const flash = new THREE.Mesh(geometry, material);
    flash.name = 'muzzle-flash';
    flash.visible = false;
    flash.frustumCulled = false;
    flash.renderOrder = 10;
    return flash;
  }
}
