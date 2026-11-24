import { createSession, createWeaponCatalog } from './createSession.js';
import { CarryOverStore } from '../level/CarryOverStore.js';
import { ContinueScreen } from '../ui/hud/ContinueScreen.js';
import { ModeSwitch } from './modes/ModeSwitch.js';
import { LocalMode } from '../play/LocalMode.js';
import { createEnemyBox } from '../play/enemyBox.js';
import { DamageInfo } from '../entities/DamageInfo.js';
import { EVENTS } from './events.js';
import { CombatPlayer } from '../player/CombatPlayer.js';
import { PlayerCombat } from '../player/PlayerCombat.js';
import { MovementLock } from '../player/MovementLock.js';
import { Sniper } from '../weapons/Sniper.js';
import { Adrenaline } from '../weapons/Adrenaline.js';
import { Bandage } from '../weapons/Bandage.js';
import { AmmoCrateViews } from '../pickups/AmmoCrateViews.js';
import { EffectViews } from '../effects/EffectViews.js';
import { RecoilKick } from '../player/RecoilKick.js';
import { WeaponPickupViews } from '../pickups/WeaponPickupViews.js';
import { SurvivalHud } from '../ui/hud/SurvivalHud.js';
import { FirstPersonWeapon } from '../weapons/FirstPersonWeapon.js';
import { installAudio } from '../audio/installAudio.js';

/**
 * Turns gameplay on (`?play=1`). The page plays in one GameMode at a time (app.modes): LocalMode,
 * the single-player run, unless a server is configured and the player creates or joins a team, in
 * which case OnlineHost switches to OnlineMode and back again when the team is left.
 * Without a server the online code is never loaded.
 */
export async function installGameplay(app) {
  const modes = new ModeSwitch();
  app.modes = modes;
  let host = null;
  if (app.options.server) {
    const { OnlineHost } = await import('../play/OnlineHost.js');
    host = new OnlineHost(app, modes);
  }
  // What the player brought from the previous level (installLevelFlow saved it); the first run only.
  let arrival = new CarryOverStore().take(app.level.name);
  const playAlone = () => modes.use(() => {
    const mode = new LocalMode(app, host ? host.localRunOptions() : {}, arrival);
    arrival = null;
    return mode;
  });
  host?.onReturn(playAlone);
  playAlone();
  host?.autoJoin();
  const onRestartKey = event => {
    if (!event.repeat && event.code === 'Enter' && app.mode?.canRestart) {
      event.preventDefault();
      app.events.emit(EVENTS.RESTART_REQUESTED);
    }
  };
  window.addEventListener('keydown', onRestartKey);
  window.addEventListener('pagehide', () => {
    window.removeEventListener('keydown', onRestartKey);
    modes.dispose();
    app.player.dispose();
  }, { once: true });
  if (app.options.debug) installDebug(app, modes);
}

/**
 * Builds one single-player run.
 * @param {App} app
 * @param {{lobbyScreen?: (doc: Document) => LobbyScreen, carryOver?: CarryOverState|null}} [options]
 *   lobbyScreen: start screen to use instead of the plain one (OnlineHost adds the team buttons this
 *   way); carryOver: what the player brought from the previous level, put on the new player, with a
 *   「點一下繼續」 screen instead of the start screen
 */
export function createGameplayRun(app, { lobbyScreen = null, carryOver = null } = {}) {
  if (document.pointerLockElement) document.exitPointerLock();
  app.player._releaseKeys();
  app.player.enabled = false;
  app.player.spawnAt(app.level.spawns.players[Math.min(app.options.spawn, app.level.spawns.players.length - 1)]);
  app.game = createSession(app.level, {
    players: [{ id: 'player-local', controller: app.player }],
    collision: app.built.collision,
    events: app.events,
    createEnemyView: (type, { pathFinder }) => {
      const view = createEnemyBox(app.style, type, pathFinder);
      app.scene.add(view);
      return view;
    },
  });
  const ctx = app.game.context;
  const [player] = ctx.players;
  if (carryOver) {
    const catalog = createWeaponCatalog();
    carryOver.applyTo(player, id => catalog.create(id));
    lobbyScreen = doc => new ContinueScreen(doc);
  }
  const { weaponPickups, ammoCrates } = app.game.pickups;
  const pickupViews = new WeaponPickupViews(app.scene, weaponPickups, ctx.events);
  const recoil = RecoilKick.standard(ctx.events, player.id, { rng: ctx.rng });
  app.combat = new PlayerCombat(app.player, app.camera, ctx, player.id, recoil);
  app.effectViews = EffectViews.standard(app.scene, ctx, ctx.events);
  app.crateViews = new AmmoCrateViews(app.scene, ammoCrates, () => ctx.time);
  app.audio = installAudio({ events: ctx.events, player: app.player, enemies: () => ctx.enemies, playerId: player.id });
  app.gameViews = [app.effectViews, app.crateViews, new MovementLock(app.player, app.game, player.id), app.audio];
  app.hud = SurvivalHud.standard(document.body, ctx.events, player.id, { lobby: lobbyScreen?.(document) ?? null });
  app.hud.onStartClick(() => app.player.requestLock());
  app.hud.updateGame(0, app.game, true);
  app.hud.setStartVisible(true);
  let disposed = false;
  // The weapon in the player's hands, drawn over the scene once its models are ready.
  const held = FirstPersonWeapon.create(app, ctx, player).then(weapon => {
    if (disposed) {
      weapon?.dispose();
      return null;
    }
    app.overlay = weapon;
    if (app.options.debug && weapon) window.__weaponView = weapon.debugHandle();
    return weapon;
  }).catch(err => {
    console.warn('[weapons] first-person weapon unavailable: ' + err.message);
    return null;
  });
  app.gameplayReady = held;
  const finish = () => {
    app.player.enabled = false;
    app.hud.setStartVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    app.hud.updateGame(0, app.game, true);
  };
  const subscriptions = [ctx.events.on(EVENTS.GAME_OVER, finish), ctx.events.on(EVENTS.VICTORY, finish)];
  const session = app.game;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const unsubscribe of subscriptions) unsubscribe();
    app.overlay?.dispose();
    app.overlay = null;
    if (app.options.debug) delete window.__weaponView;
    pickupViews.dispose();
    for (const view of app.gameViews) view.dispose();
    app.gameViews = [];
    app.combat.dispose();
    session.dispose();
    app.hud.dispose();
  };
  return { session, dispose };
}

function installDebug(app, modes) {
  const refresh = () => {
    app.hud.updateGame(0, app.game);
    app._render(0);
  };
  window.__gameDebug = Object.freeze({
    ready: () => app.gameplayReady,
    start: () => { app.game.start(); app.game.update(0); refresh(); },
    restart: () => { modes.current.restart(); refresh(); },
    spawnTeammate: () => {
      const ctx = app.game.context;
      const local = ctx.players[0];
      const mate = new CombatPlayer('debug-mate-' + ctx.players.length,
        { x: local.position.x + 1, z: local.position.z }, ctx.events);
      mate.name = 'DEBUG MATE';
      ctx.players.push(mate);
      refresh();
      return mate.id;
    },
    damagePlayer: (id, amount) => {
      const player = app.game.playerById(id);
      player.damageable.takeDamage(new DamageInfo({ amount, sourceId: 'debug', targetId: id }));
      refresh();
    },
    giveSniper: () => {
      app.game.context.players[0].weapons.equip(new Sniper());
      refresh();
    },
    switchWeapon: index => {
      app.events.emit(EVENTS.SWITCH_REQUESTED, { ownerId: app.game.context.players[0].id, index });
      refresh();
    },
    giveAdrenaline: () => {
      app.game.context.players[0].weapons.equip(new Adrenaline());
      refresh();
    },
    giveBandage: id => {
      app.game.playerById(id).weapons.add(new Bandage());
      refresh();
    },
    holdRevive: (holding, ownerId = app.game.context.players[0].id) => app.game.revives.hold(ownerId, holding),
    moveTeammate: (id, x, z) => {
      const mate = app.game.playerById(id);
      mate.controller.x = mate.position.x = x;
      mate.controller.z = mate.position.z = z;
    },
    kill: (id = app.game.context.players[0].id) => {
      const player = app.game.playerById(id);
      player.damageable.takeDamage(new DamageInfo({ amount: player.damageable.maxHealth,
        sourceId: 'debug', targetId: player.id }));
      app.game.update(0);
      refresh();
    },
    win: () => { const won = app.game.win(); refresh(); return won; },
    snapshot: () => {
      const ctx = app.game.context;
      return { state: app.game.state, wave: app.game.wave, kills: app.game.kills,
        players: ctx.players.map(player => ({ id: player.id, downed: player.downed, health: player.damageable.health })),
        speedMultiplier: app.player.speedMultiplier,
        reloadRate: ctx.players[0].effects.multiplier('reloadRate', ctx.time),
        reloadEndsAt: ctx.players[0].weapons.current?.reloadEndsAt,
        time: ctx.time, health: ctx.players[0].damageable.health,
        ammo: ctx.players[0].weapons.current.ammo,
        inventory: ctx.players[0].weapons.weapons.map(weapon => weapon?.id ?? null),
        objective: app.game.objective.status?.seconds ?? null,
        sceneChildren: app.scene.children.length,
        listeners: Array.from(ctx.events._listeners.values()).reduce((total, entries) => total + entries.size, 0),
        enemies: ctx.enemies.map(enemy => ({ id: enemy.id, health: enemy.damageable.health,
          x: enemy.position.x, z: enemy.position.z })) };
    },
    aimAt: id => {
      const ctx = app.game.context;
      const enemy = ctx.enemies.find(candidate => candidate.id === id);
      if (!enemy) return false;
      const dx = enemy.position.x - app.player.x;
      const dz = enemy.position.z - app.player.z;
      app.player.yaw = Math.atan2(-dx, -dz);
      app.player.pitch = Math.atan2(enemy.position.y + enemy.headHeight + 0.2 - app.player.options.eyeHeight, Math.hypot(dx, dz));
      app.player._syncCamera();
      app.combat.updateAim();
      return true;
    },
    fire: () => {
      app.combat.updateAim();
      const ctx = app.game.context;
      ctx.events.emit(EVENTS.FIRE_REQUESTED, { ownerId: ctx.players[0].id });
    },
    reload: () => app.events.emit(EVENTS.RELOAD_REQUESTED, { ownerId: app.game.context.players[0].id }),
    advance: seconds => {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120) throw new RangeError('Debug advance is limited to 120 seconds');
      const steps = Math.ceil(seconds / 0.05);
      for (let index = 0; index < steps; index++) {
        app.combat.updateAim();
        app.game.update(Math.min(0.05, seconds - index * 0.05));
      }
      app.hud.updateGame(0, app.game, true);
      app._render(0);
    },
  });
}
