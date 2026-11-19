import * as THREE from 'three';
import { GameContext } from './GameContext.js';
import { GameSession } from './GameSession.js';
import { TimedWaveDirector } from './TimedWaveDirector.js';
import { CrowdSeparation } from './CrowdSeparation.js';
import { SURVIVAL_WAVES } from './waves/survival.js';
import { Difficulty } from './Difficulty.js';
import { EVENTS } from './events.js';
import { PathFinder } from '../PathFinder.js';
import { EnemyFactory } from '../enemies/EnemyFactory.js';
import { Walker } from '../enemies/Walker.js';
import { Runner } from '../enemies/Runner.js';
import { Tank } from '../enemies/Tank.js';
import { Exploder } from '../enemies/Exploder.js';
import { CombatPlayer } from '../player/CombatPlayer.js';
import { PlayerCombat } from '../player/PlayerCombat.js';
import { MovementLock } from '../player/MovementLock.js';
import { StarterPistol } from '../weapons/StarterPistol.js';
import { Bat } from '../weapons/Bat.js';
import { Rifle } from '../weapons/Rifle.js';
import { Shotgun } from '../weapons/Shotgun.js';
import { SubmachineGun } from '../weapons/SubmachineGun.js';
import { Revolver } from '../weapons/Revolver.js';
import { Bandage } from '../weapons/Bandage.js';
import { Grenade } from '../weapons/Grenade.js';
import { Molotov } from '../weapons/Molotov.js';
import { Katana } from '../weapons/Katana.js';
import { Chainsaw } from '../weapons/Chainsaw.js';
import { AmmoCrateField } from '../pickups/AmmoCrateField.js';
import { AmmoCrateViews } from '../pickups/AmmoCrateViews.js';
import { InteractionList } from '../pickups/InteractionList.js';
import { EffectViews } from '../effects/EffectViews.js';
import { RecoilKick } from '../player/RecoilKick.js';
import { LoadoutHolder } from '../weapons/LoadoutHolder.js';
import { WeaponCatalog } from '../pickups/WeaponCatalog.js';
import { PickupField } from '../pickups/PickupField.js';
import { ItemDeck } from '../pickups/ItemDeck.js';
import { WeaponPickupViews } from '../pickups/WeaponPickupViews.js';
import { Wallet } from '../economy/Wallet.js';
import { Economy } from '../economy/Economy.js';
import { AmmoRefillItem } from '../economy/AmmoRefillItem.js';
import { SurvivalHud } from '../ui/hud/SurvivalHud.js';
import { FirstPersonWeapon } from '../weapons/FirstPersonWeapon.js';
import { installAudio } from '../audio/installAudio.js';

export function installGameplay(app) {
  const ctx = new GameContext({ scene: app.scene, collision: app.built.collision,
    pathFinder: new PathFinder(app.built.collision, { clearance: 0.002 }), events: app.events, level: app.level });
  const player = new CombatPlayer('player-local', app.player, ctx.events, new LoadoutHolder('player-local', ctx.events));
  player.wallet = new Wallet(player.id, ctx.events);
  // Start with the pistol in hand and the bat on the back; guns are found on the ground.
  player.weapons.add(new StarterPistol());
  player.weapons.add(new Bat());
  ctx.players.push(player);
  const catalog = new WeaponCatalog()
    .register('rifle', { create: () => new Rifle(), name: 'RIFLE', look: { length: 0.95, height: 0.14, width: 0.12 } })
    .register('shotgun', { create: () => new Shotgun(), name: 'SHOTGUN', look: { length: 0.85, height: 0.12, width: 0.14 } })
    .register('smg', { create: () => new SubmachineGun(), name: 'SMG', look: { length: 0.55, height: 0.16, width: 0.1 } })
    .register('revolver', { create: () => new Revolver(), name: 'REVOLVER', look: { length: 0.34, height: 0.14, width: 0.07 } })
    // Melee weapons lie at any weapon spot and also at the spots kept for them (at least two per scene).
    .register('katana', { create: () => new Katana(), name: 'KATANA', pool: ['weapon', 'melee'],
      look: { length: 1.0, height: 0.05, width: 0.07 } })
    .register('chainsaw', { create: () => new Chainsaw(), name: 'CHAINSAW', pool: ['weapon', 'melee'],
      look: { length: 0.85, height: 0.26, width: 0.22 } })
    // Healing and throwable spots draw from their own pools, never from the guns.
    .register('bandage', { create: () => new Bandage(), name: 'BANDAGE', pool: 'healing',
      look: { length: 0.22, height: 0.08, width: 0.16 } })
    .register('grenade', { create: () => new Grenade(), name: 'GRENADE', pool: 'throwable',
      look: { length: 0.12, height: 0.12, width: 0.1 } })
    .register('molotov', { create: () => new Molotov(), name: 'MOLOTOV', pool: 'throwable',
      look: { length: 0.28, height: 0.1, width: 0.1 } });
  // Dealt like cards, so every weapon lies somewhere before any lies twice.
  const deck = new ItemDeck(catalog, ctx.rng);
  const pickups = PickupField.fromLevel(app.level, catalog, ctx.rng, pool => deck.next(pool));
  const pickupViews = new WeaponPickupViews(ctx.scene, pickups, ctx.events);
  const crates = AmmoCrateField.fromLevel(app.level);
  // G22: ten times the zombies, twice as fast (same damage). Tune here.
  const difficulty = new Difficulty({ count: 10, speed: 2 });
  const factory = new EnemyFactory(ctx, type => {
    const geometry = new THREE.BoxGeometry(ctx.pathFinder.radius * 2, ctx.pathFinder.height, ctx.pathFinder.radius * 2);
    const material = new THREE.MeshStandardMaterial({ color: app.style.greybox.dummy,
      roughness: app.style.greybox.roughness ?? 0.9 });
    const view = new THREE.Mesh(geometry, material);
    view.name = 'enemy:' + type;
    view.visible = false;
    ctx.scene.add(view);
    return view;
  }, { prepare: enemy => difficulty.tune(enemy) }).register('walker', Walker)
    .register('runner', Runner)
    .register('tank', Tank)
    .register('exploder', Exploder);
  const ammo = new AmmoRefillItem();
  app.game = new GameSession(ctx, { factory, director: new TimedWaveDirector(difficulty.waves(SURVIVAL_WAVES)), economy: new Economy(),
    items: [ammo], separation: new CrowdSeparation(), pickups: new InteractionList([pickups, crates]) });
  // Degrees of upward kick per shot and the most it swings sideways.
  const recoil = new RecoilKick(ctx.events, player.id, { rng: ctx.rng })
    .register('pistol', { pitch: 1.6, yaw: 0.4 })
    .register('rifle', { pitch: 0.9, yaw: 0.35 })
    .register('smg', { pitch: 0.6, yaw: 0.45 })
    .register('shotgun', { pitch: 4.5, yaw: 0.8 })
    .register('revolver', { pitch: 4, yaw: 0.6 });
  app.combat = new PlayerCombat(app.player, app.camera, ctx, player.id, ammo.id, recoil);
  app.effectViews = EffectViews.standard(ctx.scene, ctx, ctx.events);
  app.crateViews = new AmmoCrateViews(ctx.scene, crates, () => ctx.time);
  app.audio = installAudio({ events: ctx.events, player: app.player, enemies: () => ctx.enemies, playerId: player.id });
  app.gameViews = [app.effectViews, app.crateViews, new MovementLock(app.player, app.game, player.id), app.audio];
  app.hud = SurvivalHud.standard(document.body, ctx.events, player.id);
  app.hud.updateGame(0, app.game, true);
  // The weapon in the player's hands, drawn over the scene once its models are ready.
  const held = FirstPersonWeapon.create(app, ctx, player).then(weapon => {
    app.overlay = weapon;
    if (app.options.debug) window.__weaponView = weapon.debugHandle();
    return weapon;
  }).catch(err => {
    console.warn('[weapons] first-person weapon unavailable: ' + err.message);
    return null;
  });
  const unsubscribe = ctx.events.on(EVENTS.GAME_OVER, () => {
    app.player.enabled = false;
    app.hud.setStartVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    app.hud.updateGame(0, app.game, true);
  });
  const dispose = () => {
    unsubscribe();
    held.then(weapon => weapon?.dispose());
    pickupViews.dispose();
    app.effectViews.dispose();
    app.crateViews.dispose();
    app.audio.dispose();
    app.combat.dispose();
    app.game.dispose();
    app.hud.dispose();
    app.player.dispose();
  };
  window.addEventListener('pagehide', dispose, { once: true });
  if (app.options.debug) installDebug(app, ctx);
}

function installDebug(app, ctx) {
  window.__gameDebug = Object.freeze({
    start: () => app.game.start(),
    snapshot: () => ({ state: app.game.state, wave: app.game.wave, kills: app.game.kills,
      time: ctx.time, health: ctx.players[0].damageable.health, money: ctx.players[0].wallet.balance,
      ammo: ctx.players[0].weapons.current.ammo,
      enemies: ctx.enemies.map(enemy => ({ id: enemy.id, health: enemy.damageable.health,
        x: enemy.position.x, z: enemy.position.z })) }),
    aimAt: id => {
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
      ctx.events.emit(EVENTS.FIRE_REQUESTED, { ownerId: ctx.players[0].id });
    },
    reload: () => ctx.events.emit(EVENTS.RELOAD_REQUESTED, { ownerId: ctx.players[0].id }),
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
