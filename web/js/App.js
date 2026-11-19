import * as THREE from 'three';
import { Palette } from './Palette.js';
import { LevelData } from './LevelData.js';
import { Atmosphere } from './Atmosphere.js';
import { Flashlight } from './Flashlight.js';
import { PostFX } from './PostFX.js';
import { ModelLibrary } from './ModelLibrary.js';
import { PropFactory } from './PropFactory.js';
import { SceneBuilder } from './SceneBuilder.js';
import { PlayerController } from './PlayerController.js';
import { PathFinder } from './PathFinder.js';
import { Hud } from './Hud.js';
import { EventBus } from './core/EventBus.js';
import { clampFrameTime } from './core/frameTime.js';

// App: wires the modules together.
//   LevelData -> SceneBuilder (-> PropFactory) -> scene + collision
//   Palette -> Atmosphere -> fog, lights, Flashlight, PostFX
//   PlayerController walks the result; ?shot=<bookmark> renders one still frame instead.
const CONFIG = Object.freeze({
  paletteUrl: '../art/style/palette.json',
  paletteChaptersUrl: '../art/style/chapters/',
  levelsUrl: 'levels/',
  manifestUrl: '../art/manifest/',
  modelsUrl: 'assets/models/',
  texturesUrl: 'assets/textures/',
  defaultLevel: 'test',
  maxPixelRatio: 1.5, // PERFORMANCE_PLAN 3.2-5
  minPixelRatio: 0.5,
  fov: 70,
  near: 0.1,
  maxFrameTime: 0.05, // s; a long hitch must not teleport the player
  maxStatsFrameTime: 0.5, // s; longer gaps (first frame, background tab) are left out of fps stats
  infoInterval: 0.25, // s between info text refreshes
});

/** Options read from the page URL. */
export class AppOptions {
  constructor(params) {
    const flag = (key) => params.has(key) && params.get(key) !== '0';
    this.level = params.get('level') || CONFIG.defaultLevel;
    this.shot = params.get('shot') || null;
    this.palette = params.get('palette') || null;
    this.preset = params.get('preset') || null;
    this.debug = flag('debug');
    this.perf = flag('perf');
    this.flashlight = params.get('flashlight') !== '0';
    this.dummies = flag('dummies');
    this.play = params.get('play') === '1';
    // ?models=0 shows the greybox stand-ins even where a model exists.
    this.models = params.get('models') !== '0';
    // Seconds on the animation clock for ?shot= (flicker and beacons are functions of time).
    this.time = parseFloat(params.get('t')) || 0;
    this.spawn = Math.max(0, parseInt(params.get('spawn') || '0', 10) || 0);
    const scale = parseFloat(params.get('scale'));
    this.scale = Number.isFinite(scale) ? scale : null;
  }

  static fromUrl(search) {
    return new AppOptions(new URLSearchParams(search));
  }
}

export class App {
  /**
   * @param {AppOptions} options
   * @param {HTMLElement} container  element that receives the canvas
   * @param {Hud} hud
   */
  constructor(options, container, hud) {
    this.options = options;
    this.container = container;
    this.hud = hud;
    this.events = new EventBus();
    const app = this;
    // lights walks the scene, so it is counted only when read (info text, ?perf, shots.mjs).
    this.stats = { fps: 0, frameMs: 0, calls: 0, triangles: 0,
      get lights() { return app._countLights(); }, pixelRatio: 1 };
    this._lastTime = 0;
    this._infoTimer = 0;
    this._frameCount = 0;
    this._frameTimeSum = 0;
    this._still = false; // true in ?shot= mode: render on demand only
    this._frame = this._frame.bind(this);
  }

  async start() {
    const options = this.options;
    const [palette, level] = await Promise.all([
      Palette.load(CONFIG.paletteUrl, CONFIG.paletteChaptersUrl),
      LevelData.load(options.level, CONFIG.levelsUrl),
    ]);
    this.level = level;
    await palette.ensure(options.palette || level.palette);
    this.style = palette.resolve(options.palette || level.palette, options.preset);

    this._createRenderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, CONFIG.near, 100);
    this.scene.add(this.camera); // the flashlight is a child of the camera

    // Look: fog, lights, flashlight, post-processing — all from palette.json.
    this.atmosphere = new Atmosphere(this.style);
    this.atmosphere.applyTo(this.scene, this.camera);
    this.flashlight = new Flashlight(this.camera);
    this.atmosphere.configureFlashlight(this.flashlight);
    this.flashlight.on = options.flashlight;
    this.renderer.shadowMap.enabled = this.atmosphere.wantsShadows();
    this.postfx = new PostFX(this.renderer);
    this.atmosphere.configurePost(this.postfx);

    // Level: collision + visuals.
    this.models = options.models
      ? new ModelLibrary(CONFIG.manifestUrl, CONFIG.modelsUrl)
      : ModelLibrary.none();
    await this.models.load(options.models ? level.manifests : [], level.props.map((p) => p.name));
    this.propFactory = new PropFactory(
      this.style,
      this.models,
      options.models ? CONFIG.texturesUrl : null // ?models=0 keeps the flat greybox look
    );
    this.builder = new SceneBuilder(this.propFactory, this.style.greybox);
    this.built = this.builder.build(level, { debug: options.debug, dummies: options.dummies });
    await this.propFactory.texturesLoaded(); // so the first frame (and screenshots) has them
    this.scene.add(this.built.root);
    if (this.built.debug) this.scene.add(this.built.debug);
    if (this.built.dummies) this.scene.add(this.built.dummies);
    this._reportLevelNotes();

    this.player = new PlayerController(
      this.camera, this.renderer.domElement, this.built.collision
    );
    this.player.spawnAt(level.spawns.players[Math.min(options.spawn, level.spawns.players.length - 1)]);

    if (options.play && !options.shot) {
      const { installGameplay } = await import('./game/installGameplay.js');
      installGameplay(this);
    }
    if (!options.shot) {
      // Ways out to other levels and the blocks in front of them; null when the level has none.
      const { installLevelFlow } = await import('./level/installLevelFlow.js');
      this.flow = installLevelFlow(this);
    }

    this._resize();
    window.addEventListener('resize', () => this._resize());

    if (options.shot) {
      this._startShot(options.shot);
    } else {
      this._startWalk();
    }
  }

  // ---- setup ---------------------------------------------------------------

  _createRenderer() {
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // the scene is drawn into an offscreen target; see PostFX
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    renderer.toneMapping = THREE.NoToneMapping; // PostFX tone-maps in its final pass
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = false; // count every pass of a frame, not just the last one
    this.renderer = renderer;
    this.container.appendChild(renderer.domElement);
  }

  pixelRatio() {
    const wanted = this.options.scale !== null ? this.options.scale : window.devicePixelRatio || 1;
    return Math.min(CONFIG.maxPixelRatio, Math.max(CONFIG.minPixelRatio, wanted));
  }

  _resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.stats.pixelRatio = this.pixelRatio();
    this.renderer.setPixelRatio(this.stats.pixelRatio);
    this.renderer.setSize(width, height);
    this.postfx.resize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this._still) this._render(this.options.time);
  }

  _reportLevelNotes() {
    this.level.warnings.forEach((w) => console.warn('[level] ' + w));
    if (this.options.debug) {
      this.unreachable = App.findUnreachable(this.level, this.built.collision);
      this.unreachable.forEach((name) => console.warn('[level] cannot be reached from the first player spawn: ' + name));
    }
    if (this.built.unknownProps.length > 0) {
      console.warn(
        '[level] props without a model (drawn as grey boxes): ' + this.built.unknownProps.join(', ')
      );
    }
  }

  /** Zombie spawns and markers that have no walking route to the first player spawn. */
  static findUnreachable(level, collision) {
    const finder = new PathFinder(collision);
    const home = level.spawns.players[0];
    const missing = [];
    const check = (label, point) => {
      if (!finder.findPath(home.x, home.z, point.x, point.z)) missing.push(label);
    };
    level.spawns.players.slice(1).forEach((s, i) => check('player spawn ' + (i + 1), s));
    level.spawns.zombies.forEach((s) => check('zombie spawn ' + s.id, s));
    level.markers.forEach((m) => check('marker ' + m.id, m));
    return missing;
  }

  // ---- modes ---------------------------------------------------------------

  _startWalk() {
    const canvas = this.renderer.domElement;
    this.hud.setStartVisible(true);
    this.hud.onStartClick(() => this.player.requestLock());
    canvas.addEventListener('click', () => this.player.requestLock());
    this.player.onLockChange = (locked) => {
      this.hud.setStartVisible(!locked && this.game?.state !== 'game-over');
      if (locked && this.game) this.game.start();
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyF') this.flashlight.toggle();
      if (e.code === 'KeyB') {
        console.log('bookmark: ' + JSON.stringify(this.player.toBookmark()));
      }
    });

    this._lastTime = performance.now();
    requestAnimationFrame(this._frame);
  }

  /** Still frame from a named bookmark, for screenshot tools: wait for window.__ready. */
  _startShot(name) {
    const bookmark = this.level.bookmark(name);
    if (!bookmark) {
      throw new Error(
        'Bookmark "' + name + '" not found in level "' + this.level.name + '". Available: ' +
          (this.level.bookmarkNames().join(', ') || '(none)')
      );
    }
    this.camera.position.fromArray(bookmark.pos);
    this.camera.rotation.set(
      THREE.MathUtils.degToRad(bookmark.pitch),
      THREE.MathUtils.degToRad(bookmark.yaw),
      0
    );
    if (bookmark.fov > 0) {
      this.camera.fov = bookmark.fov;
      this.camera.updateProjectionMatrix();
    }
    this.hud.setStartVisible(false);
    this._still = true;
    this.built.update(this.options.time);
    this._render(this.options.time); // fixed time: the same frame on every run
    this._updateInfo();
    // Ready once the frame has been presented; the timer covers tabs where rAF is paused.
    const ready = () => {
      window.__ready = true;
    };
    requestAnimationFrame(ready);
    setTimeout(ready, 250);
  }

  // ---- frame ---------------------------------------------------------------

  _frame(now) {
    requestAnimationFrame(this._frame);
    const elapsed = (now - this._lastTime) / 1000;
    this._lastTime = now;
    const dt = clampFrameTime(elapsed, CONFIG.maxFrameTime);

    if (!this.game || this.game.canMove) this.player.update(dt);
    if (this.flow) this.flow.update(dt);
    if (this.game && this.player.locked) {
      this.combat.update(dt);
      this.game.update(dt);
      this.hud.updateGame(dt, this.game);
      this.effectViews?.update(dt);
    }
    this.atmosphere.update(dt, now / 1000);
    this.built.update(now / 1000);
    this._render(now / 1000);

    // Stats keep real frame times (a 30 fps machine must read 30, not the dt cap), but a
    // gap longer than maxStatsFrameTime is a pause, not a frame, and is skipped.
    if (elapsed >= 0 && elapsed <= CONFIG.maxStatsFrameTime) {
      this._frameCount++;
      this._frameTimeSum += elapsed;
      this._infoTimer += elapsed;
    }
    if (this._infoTimer >= CONFIG.infoInterval) {
      this.stats.frameMs = (this._frameTimeSum / this._frameCount) * 1000;
      this.stats.fps = this.stats.frameMs > 0 ? 1000 / this.stats.frameMs : 0;
      this._frameCount = 0;
      this._frameTimeSum = 0;
      this._infoTimer = 0;
      this._updateInfo();
    }
    if (!window.__ready) window.__ready = true;
  }

  _render(time) {
    const info = this.renderer.info;
    info.reset();
    this.postfx.render(this.scene, this.camera, time);
    this.stats.calls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    window.__stats = this.stats;
  }

  // Walks the scene; only called when stats.lights is read, never per frame.
  _countLights() {
    let count = 0;
    this.scene.traverseVisible((o) => {
      if (o.isLight && !o.isAmbientLight && !o.isHemisphereLight) count++;
    });
    return count;
  }

  _updateInfo() {
    const lines = [];
    const s = this.stats;
    if (this.options.perf) {
      if (!this._still) lines.push(s.fps.toFixed(0) + ' fps  ' + s.frameMs.toFixed(1) + ' ms');
      lines.push(
        'draw calls ' + s.calls + '  triangles ' + s.triangles,
        'lights ' + s.lights + '  pixel ratio ' + s.pixelRatio.toFixed(2)
      );
    }
    if (this.options.debug) {
      const p = this.player;
      lines.push(
        'level ' + this.level.name + '  palette ' + this.style.blockName +
          (this.style.presetName ? '/' + this.style.presetName : ''),
        'pos ' + p.x.toFixed(2) + ', ' + p.z.toFixed(2) +
          '  yaw ' + THREE.MathUtils.radToDeg(p.yaw).toFixed(0) +
          '  pitch ' + THREE.MathUtils.radToDeg(p.pitch).toFixed(0)
      );
      if (this.built.modelProps.size > 0) {
        lines.push('models: ' + Array.from(this.built.modelProps, (e) => e[0] + ' x' + e[1]).join(', '));
      }
      if (this.models.failed.length > 0) {
        lines.push('model failed, stand-in used: ' + this.models.failed.join(', '));
      }
      if (this.built.unknownProps.length > 0) {
        lines.push('no model: ' + this.built.unknownProps.join(', '));
      }
      this.level.warnings.forEach((w) => lines.push('warning: ' + w));
      (this.unreachable || []).forEach((name) => lines.push('unreachable: ' + name));
    }
    this.hud.setInfo(lines);
  }

  // ---- entry point ---------------------------------------------------------

  /** Creates and starts the app; failures are shown on the page and in window.__error. */
  static async boot() {
    window.__ready = false;
    window.__error = null;
    const hud = new Hud(document.body);
    try {
        const app = new App(AppOptions.fromUrl(window.location.search), document.getElementById('view'), hud);
      window.__app = app;
      await app.start();
    } catch (err) {
      console.error(err);
      window.__error = err.message;
      hud.showError(err.message, err.problems);
    }
  }
}
