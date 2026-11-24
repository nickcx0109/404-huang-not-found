import { GameMode } from '../game/modes/GameMode.js';
import { EVENTS } from '../game/events.js';
import { SnapshotBuffer } from '../net/SnapshotBuffer.js';
import { InputSender } from '../net/InputSender.js';
import { PoseReconciler } from '../net/PoseReconciler.js';
import { FireCadence } from '../net/FireCadence.js';
import { WeaponSpecs } from '../net/WeaponSpecs.js';
import { RemoteLoadout } from '../net/RemoteLoadout.js';
import { NetworkedSession } from '../net/NetworkedSession.js';
import { EntityStandIns } from '../net/EntityStandIns.js';
import { NetEventTranslator } from '../net/NetEventTranslator.js';
import { ActionForwarder } from '../net/ActionForwarder.js';
import { PickupMirror } from '../net/PickupMirror.js';
import { createWeaponCatalog } from '../game/createSession.js';
import { AmmoCrateField } from '../pickups/AmmoCrateField.js';
import { AmmoCrateViews } from '../pickups/AmmoCrateViews.js';
import { WeaponPickupViews } from '../pickups/WeaponPickupViews.js';
import { EffectViews } from '../effects/EffectViews.js';
import { PlayerCombat } from '../player/PlayerCombat.js';
import { RecoilKick } from '../player/RecoilKick.js';
import { SurvivalHud } from '../ui/hud/SurvivalHud.js';
import { SnapshotStatus } from '../ui/hud/SnapshotStatus.js';
import { OnlineCrosshair } from '../ui/hud/OnlineCrosshair.js';
import { TeamRoomScreen } from '../ui/hud/TeamRoomScreen.js';
import { ConnectionScreen } from '../ui/hud/ConnectionScreen.js';
import { FirstPersonWeapon } from '../weapons/FirstPersonWeapon.js';
import { installAudio } from '../audio/installAudio.js';
import { RemoteEnemyViews } from './RemoteEnemyViews.js';
import { RemotePlayerViews } from './RemotePlayerViews.js';

/**
 * Online play: the server runs the GameSession; this page only predicts its own player's
 * movement and draws what the snapshots say.
 *
 * Every frame the PlayerController walks as in single player (the camera never waits for the
 * network); InputSender sends the pose 30 times a second and PoseReconciler moves the player
 * back when the server disagrees by more than 1 m. Clicks and keys still go through
 * PlayerCombat's *_REQUESTED events, which ActionForwarder turns into `action` messages (and
 * plays a gun's shot at once). Everyone else is drawn from SnapshotBuffer 100 ms in the past;
 * server events are republished on the page's bus by NetEventTranslator, so the sounds, HUD
 * widgets and effects of single player react unchanged. The HUD reads a SnapshotStatus.
 *
 * Restarting online is leaving: the result screen's button (or Enter) leaves the team and
 * `onLeave` puts the single-player start screen back, where a new team can be made.
 */
export class OnlineMode extends GameMode {
  /**
   * @param {App} app
   * @param {{client: NetClient, room: object, onLeave: (notice?: string) => void}} options
   */
  constructor(app, { client, room, onLeave }) {
    super();
    this.app = app;
    this.client = client;
    this.onLeave = onLeave;
    this.disposed = false;
    this.left = false;
    const id = room.you;
    this.playerId = id;
    const events = app.events;
    const now = () => performance.now() / 1000;
    this.now = now;
    this.view = new NetworkedSession({ you: id, room });
    this.buffer = new SnapshotBuffer({ delay: 100 });
    this.reconciler = new PoseReconciler({ threshold: 1 });
    this.cadence = new FireCadence();
    this.specs = WeaponSpecs.standard();
    this.loadout = new RemoteLoadout(this.specs);
    this.standIns = EntityStandIns.standard();
    this.inputs = new InputSender({ client, now: () => performance.now() });

    const player = app.player;
    if (document.pointerLockElement) document.exitPointerLock();
    player._releaseKeys();
    player.speedMultiplier = 1;
    const spawns = app.level.spawns.players;
    player.spawnAt(spawns[Math.min(NetworkedSession.slotOf(id), spawns.length - 1)]);
    app.game = null;

    const mode = this;
    // The small part of a GameContext that PlayerCombat, WeaponTrigger and FirstPersonWeapon read.
    this.ctx = {
      events,
      aim: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } },
      players: [{ id, weapons: this.loadout }],
      session: { disposed: false, revives: { hold: (ownerId, holding) => mode.forwarder?.revive(holding) } },
      get time() { return now(); },
    };

    /** What the server's events about our own weapon change in the prediction, by event name. */
    this._ownHandlers = new Map([
      [EVENTS.WEAPON_FIRED, (detail, time) => this.cadence.confirm(time)],
      [EVENTS.WEAPON_RELOAD_STARTED, (detail, time) => this.loadout.startReload(detail.weaponId, detail.duration, time)],
      [EVENTS.WEAPON_RELOADED, detail => this.loadout.finishReload(detail.weaponId)],
    ]);
    this.translator = new NetEventTranslator(events, this.standIns, id, {
      isPredicted: weaponId => this.specs.get(weaponId).predicted,
      onOwnEvent: (name, detail) => this._ownEvent(name, detail),
    });
    this.forwarder = new ActionForwarder({ events, client, ownerId: id, loadout: this.loadout, cadence: this.cadence,
      view: this.view, now, beforeAction: () => this._sendPose(true) });
    const recoil = RecoilKick.standard(events, id);
    this.combat = new PlayerCombat(player, app.camera, this.ctx, id, recoil);
    app.combat = this.combat;

    // Views.
    const catalog = createWeaponCatalog();
    this.pickups = PickupMirror.fromLevel(app.level, catalog);
    this.pickupViews = new WeaponPickupViews(app.scene, this.pickups, events);
    this.crateViews = new AmmoCrateViews(app.scene, AmmoCrateField.fromLevel(app.level), now);
    this.effectViews = EffectViews.standard(app.scene, { effects: [] }, events);
    this.enemyViews = new RemoteEnemyViews(app.scene, app.style);
    this.playerViews = new RemotePlayerViews(app.scene, events, id, playerId => this.view.nameOf(playerId));
    this.audio = installAudio({ events, player, enemies: () => this.standIns.living, playerId: id });
    app.gameViews = [];

    // HUD.
    const status = new SnapshotStatus(player, {
      predictedAmmo: ammo => this.cadence.predictedAmmo(ammo, now()),
      get reloading() { return Boolean(mode.loadout.current?.reloading); },
      specOf: weaponId => this.specs.get(weaponId),
    });
    this.teamScreen = new TeamRoomScreen(document);
    this.connectionScreen = new ConnectionScreen(document);
    this.hud = SurvivalHud.compose(new SurvivalHud(document.body, events, id, status), {
      lobby: this.teamScreen, crosshair: new OnlineCrosshair(document), extra: [this.connectionScreen],
    });
    app.hud = this.hud;
    this.hud.onStartClick(() => player.requestLock());
    this.teamScreen.onStart(() => this.startGame());
    this.teamScreen.onLeave(() => this.leave());
    this.connectionScreen.onLeave(() => this.leave());
    this.hud.updateGame(0, this.view);
    this.hud.setStartVisible(false);
    this._state = this.view.state;

    const held = FirstPersonWeapon.create(app, this.ctx, this.ctx.players[0]).then(weapon => {
      if (this.disposed) {
        weapon?.dispose();
        return null;
      }
      app.overlay = weapon;
      return weapon;
    }).catch(error => {
      console.warn('[weapons] first-person weapon unavailable: ' + error.message);
      return null;
    });
    app.gameplayReady = held;

    this._unsubscribe = [
      client.on('snapshot', snapshot => this._snapshot(snapshot)),
      client.on('event', message => this.translator.translate(message.name, message.detail)),
      client.on('room', message => this._room(message)),
      client.on('error', message => this._error(message.code)),
      client.on('state', state => this._connection(state)),
      events.on(EVENTS.RESTART_REQUESTED, () => this.leave()),
    ];
    if (app.options.debug) this._installDebug();
  }

  get canMove() {
    return this.view.canMove;
  }

  get canRestart() {
    return this.view.canRestart;
  }

  /** The team room's start button: anyone in the team may start. */
  startGame() {
    this.view.notice = null;
    if (this.client.start()) this.view.starting = true;
    this.app.player.requestLock();
  }

  /** Leaves the team and goes back to the single-player start screen. */
  leave(notice = null) {
    if (this.left) return;
    this.left = true;
    this.client.leave();
    this.onLeave?.(notice);
  }

  frame(dt, locked) {
    const app = this.app;
    const view = this.view;
    const sample = this.buffer.sample(this.buffer.renderTime(this.client.clock.now()));
    view.setSampled(sample);
    if (sample) {
      this.standIns.updateEnemies(sample.enemies);
      this.standIns.updatePlayers(sample.players);
    }
    app.player.rooted = view.rooted;
    app.player.speedMultiplier = view.speed;
    if (this.reconciler.placed && view.canMove) this._sendPose(false);
    this.combat.update(dt);
    this.enemyViews.update(sample?.enemies);
    this.playerViews.update(dt, sample?.players);
    this.crateViews.update(dt);
    this.effectViews.update(dt);
    this.audio.update(dt);
    this.hud.updateGame(dt, view);
    const state = view.state;
    if (state !== this._state) this._stateChanged(this._state, state);
  }

  /** Online the level's exits and obstacles stay put: the server's game decides. */
  blocksLevelFlow() {
    return true;
  }

  _stateChanged(before, state) {
    this._state = state;
    const app = this.app;
    if (this.view.canRestart) {
      // Game over or victory: free the mouse for the result screen, as in single player.
      app.player.enabled = false;
      if (document.pointerLockElement) document.exitPointerLock();
      this.hud.setStartVisible(false);
      return;
    }
    // The game began (maybe started by a teammate): offer the click that takes the mouse.
    this.hud.setStartVisible(!app.player.locked);
  }

  _snapshot(snapshot) {
    this.buffer.push(snapshot); // duplicates and very late ones are refused by the buffer itself
    if (!this.view.applySnapshot(snapshot)) return;
    const changed = this.pickups.apply(snapshot.pickups);
    for (const pickupId of changed) this.pickupViews.refresh(pickupId);
    const me = this.view.local;
    if (!me) return;
    const player = this.app.player;
    const offset = this.reconciler.reconcile(me, snapshot.ack, { x: player.x, y: player.jump.height, z: player.z },
      this.client.inputSeq);
    if (offset) {
      player.x += offset.x;
      player.z += offset.z;
      player.velocityX = 0;
      player.velocityZ = 0;
      if (offset.first) {
        player.yaw = me.yaw;
        player.pitch = me.pitch;
      }
      player._syncCamera();
      this.inputs.reset();
    }
    if (this.loadout.apply(me, this.now())) this.cadence.reset();
  }

  _ownEvent(name, detail) {
    this.view.applyEvent(name, detail);
    this._ownHandlers.get(name)?.(detail, this.now());
  }

  _room(room) {
    this.view.applyRoom(room);
    if (this.view.connection === 'reconnecting') this.view.connection = 'open';
  }

  _error(code) {
    if (this.view.connection === 'reconnecting') {
      // The automatic rejoin was refused (the room is gone or the game went on without us).
      this.view.connection = 'lost';
      this.view.notice = code;
      this.client.disconnect();
      return;
    }
    if (code === 'start-failed') this.view.starting = false;
    this.view.notice = code;
  }

  _connection(state) {
    if (this.left) return;
    if (state === 'reconnecting') {
      this.view.connection = 'reconnecting';
      this.forwarder.reviving = false;
    } else if (state === 'closed' && this.view.connection !== 'lost') {
      this.view.connection = 'lost';
      this.view.notice = this.view.notice ?? 'connection-lost';
    }
    if (this.view.connection !== 'open' && document.pointerLockElement) document.exitPointerLock();
  }

  /** Sends the current pose: throttled every frame, or at once before an action. */
  _sendPose(force) {
    if (!this.reconciler.placed) return;
    const player = this.app.player;
    const pose = { x: player.x, y: player.jump.height, z: player.z, yaw: player.yaw, pitch: player.pitch };
    const sent = force ? this.client.sendInput(pose) : this.inputs.update(pose);
    if (sent) this.reconciler.record(this.client.inputSeq, pose);
  }

  _installDebug() {
    window.__netDebug = Object.freeze({
      state: () => ({
        state: this.view.state, you: this.playerId, code: this.view.room?.code ?? null,
        connection: this.view.connection, notice: this.view.notice,
        players: (this.view.latest?.players ?? []).map(p => ({ id: p.id, x: p.x, z: p.z, health: p.health, weapon: p.weapon, ammo: p.ammo })),
        enemies: this.view.sampled?.enemies.filter(e => e.state !== 'dead').length ?? 0,
        enemyViews: this.enemyViews.views.size,
        remotePlayers: [...this.playerViews.views.keys()],
        local: { x: this.app.player.x, z: this.app.player.z },
        hud: { health: this.hud.status.health, ammo: this.hud.status.ammo, wave: this.hud.status.wave,
          kills: this.hud.status.kills, mates: this.hud.status.mates.map(m => m.name) },
        inputsSent: this.client.inputSeq, actionsSent: this.client.actionSeq,
        lights: this.app.stats.lights,
      }),
      start: () => this.startGame(),
      aimAt: (x, z, y = 1.2) => {
        const player = this.app.player;
        const dx = x - player.x;
        const dz = z - player.z;
        player.yaw = Math.atan2(-dx, -dz);
        player.pitch = Math.atan2(y - player.options.eyeHeight, Math.hypot(dx, dz));
        player._syncCamera();
        this.combat.updateAim();
      },
      fire: () => this.app.events.emit(EVENTS.FIRE_REQUESTED, { ownerId: this.playerId }),
      leave: () => this.leave(),
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.left) {
      this.left = true;
      this.client.leave();
    }
    this.ctx.session.disposed = true;
    for (const unsubscribe of this._unsubscribe) unsubscribe();
    this.combat.dispose();
    this.forwarder.dispose();
    const app = this.app;
    app.overlay?.dispose();
    app.overlay = null;
    app.combat = null;
    app.player.rooted = false;
    app.player.speedMultiplier = 1;
    this.pickupViews.dispose();
    this.crateViews.dispose();
    this.effectViews.dispose();
    this.enemyViews.dispose();
    this.playerViews.dispose();
    this.audio.dispose();
    this.hud.dispose();
    if (app.options.debug) delete window.__netDebug;
  }
}
