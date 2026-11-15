// App: wires the modules together.
//   LevelData -> SceneBuilder (-> PropFactory) -> scene + collision
//   Palette -> Atmosphere -> fog, lights, Flashlight, PostFX
//   PlayerController walks the result; ?shot=<bookmark> renders one still frame instead.
(function (Game) {
  'use strict';

  const CONFIG = Object.freeze({
    paletteUrl: '../art/style/palette.json',
    levelsUrl: 'levels/',
    defaultLevel: 'test',
    maxPixelRatio: 1.5, // PERFORMANCE_PLAN 3.2-5
    minPixelRatio: 0.5,
    fov: 70,
    near: 0.1,
    maxFrameTime: 0.05, // s; a long hitch must not teleport the player
    infoInterval: 0.25, // s between info text refreshes
  });

  /** Options read from the page URL. */
  class AppOptions {
    constructor(params) {
      const flag = (key) => params.has(key) && params.get(key) !== '0';
      this.level = params.get('level') || CONFIG.defaultLevel;
      this.shot = params.get('shot') || null;
      this.palette = params.get('palette') || null;
      this.preset = params.get('preset') || null;
      this.debug = flag('debug');
      this.perf = flag('perf');
      this.flashlight = params.get('flashlight') !== '0';
      this.spawn = Math.max(0, parseInt(params.get('spawn') || '0', 10) || 0);
      const scale = parseFloat(params.get('scale'));
      this.scale = Number.isFinite(scale) ? scale : null;
    }

    static fromUrl(search) {
      return new AppOptions(new URLSearchParams(search));
    }
  }

  class App {
    /**
     * @param {AppOptions} options
     * @param {HTMLElement} container  element that receives the canvas
     * @param {Game.Hud} hud
     */
    constructor(options, container, hud) {
      this.options = options;
      this.container = container;
      this.hud = hud;
      this.stats = { fps: 0, frameMs: 0, calls: 0, triangles: 0, lights: 0, pixelRatio: 1 };
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
        Game.Palette.load(CONFIG.paletteUrl),
        Game.LevelData.load(options.level, CONFIG.levelsUrl),
      ]);
      this.level = level;
      this.style = palette.resolve(options.palette || level.palette, options.preset);

      this._createRenderer();
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, CONFIG.near, 100);
      this.scene.add(this.camera); // the flashlight is a child of the camera

      // Look: fog, lights, flashlight, post-processing — all from palette.json.
      this.atmosphere = new Game.Atmosphere(this.style);
      this.atmosphere.applyTo(this.scene, this.camera);
      this.flashlight = new Game.Flashlight(this.camera);
      this.atmosphere.configureFlashlight(this.flashlight);
      this.flashlight.on = options.flashlight;
      this.renderer.shadowMap.enabled = this.atmosphere.wantsShadows();
      this.postfx = new Game.PostFX(this.renderer);
      this.atmosphere.configurePost(this.postfx);

      // Level: collision + visuals.
      this.propFactory = new Game.PropFactory(this.style);
      Game.GreyboxProps.registerAll(this.propFactory);
      this.builder = new Game.SceneBuilder(this.propFactory, this.style.greybox);
      this.built = this.builder.build(level, { debug: options.debug });
      this.scene.add(this.built.root);
      if (this.built.debug) this.scene.add(this.built.debug);
      this._reportLevelNotes();

      this.player = new Game.PlayerController(
        this.camera, this.renderer.domElement, this.built.collision
      );
      this.player.spawnAt(level.spawns.players[Math.min(options.spawn, level.spawns.players.length - 1)]);

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
      if (this._still) this._render(0);
    }

    _reportLevelNotes() {
      this.level.warnings.forEach((w) => console.warn('[level] ' + w));
      if (this.built.unknownProps.length > 0) {
        console.warn(
          '[level] props without a model (drawn as grey boxes): ' + this.built.unknownProps.join(', ')
        );
      }
    }

    // ---- modes ---------------------------------------------------------------

    _startWalk() {
      const canvas = this.renderer.domElement;
      this.hud.setStartVisible(true);
      this.hud.onStartClick(() => this.player.requestLock());
      canvas.addEventListener('click', () => this.player.requestLock());
      this.player.onLockChange = (locked) => this.hud.setStartVisible(!locked);

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
      this._render(0); // time 0: the grain is identical on every run
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
      const dt = Math.min(CONFIG.maxFrameTime, Math.max(0, elapsed));

      this.player.update(dt);
      this.atmosphere.update(dt, now / 1000);
      this._render(now / 1000);

      this._frameCount++;
      this._frameTimeSum += elapsed;
      this._infoTimer += elapsed;
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
      this.stats.lights = this._countLights();
      window.__stats = this.stats;
    }

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
        if (this.built.unknownProps.length > 0) {
          lines.push('no model: ' + this.built.unknownProps.join(', '));
        }
        this.level.warnings.forEach((w) => lines.push('warning: ' + w));
      }
      this.hud.setInfo(lines);
    }

    // ---- entry point ---------------------------------------------------------

    /** Creates and starts the app; failures are shown on the page and in window.__error. */
    static async boot() {
      window.__ready = false;
      window.__error = null;
      const hud = new Game.Hud(document.body);
      try {
        if (!window.THREE) throw new Error('three.js did not load (check the network connection).');
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

  Game.App = App;
  Game.AppOptions = AppOptions;
})((window.Game = window.Game || {}));
