import * as THREE from 'three';
import { GameContext } from './GameContext.js';
import { GameSession } from './GameSession.js';
import { ExampleWaveDirector, EXAMPLE_WAVES } from './WaveDirector.js';
import { EVENTS } from './events.js';
import { PathFinder } from '../PathFinder.js';
import { EnemyFactory } from '../enemies/EnemyFactory.js';
import { Walker } from '../enemies/Walker.js';
import { Runner } from '../enemies/Runner.js';
import { Tank } from '../enemies/Tank.js';
import { Exploder } from '../enemies/Exploder.js';
import { CombatPlayer } from '../player/CombatPlayer.js';
import { PlayerCombat } from '../player/PlayerCombat.js';
import { Pistol } from '../weapons/Pistol.js';
import { Wallet } from '../economy/Wallet.js';
import { Economy } from '../economy/Economy.js';
import { ShopCatalog } from '../economy/ShopCatalog.js';
import { RifleItem } from '../economy/RifleItem.js';
import { ShotgunItem } from '../economy/ShotgunItem.js';
import { HealthItem } from '../economy/HealthItem.js';
import { ArmorItem } from '../economy/ArmorItem.js';
import { DamagePipeline, HeadshotRule } from '../entities/DamagePipeline.js';
import { ArmorRule } from '../entities/ArmorRule.js';
import { AmmoRefillItem } from '../economy/AmmoRefillItem.js';
import { SurvivalHud } from '../ui/hud/SurvivalHud.js';

export function installGameplay(app) {
  const ctx = new GameContext({ scene: app.scene, collision: app.built.collision,
    pathFinder: new PathFinder(app.built.collision, { clearance: 0.002 }), events: app.events, level: app.level });
  const player = new CombatPlayer('player-local', app.player, ctx.events);
  player.wallet = new Wallet(player.id, ctx.events);
  player.weapons.add(new Pistol());
  ctx.players.push(player);
  const factory = new EnemyFactory(ctx, type => {
    const geometry = new THREE.BoxGeometry(ctx.pathFinder.radius * 2, ctx.pathFinder.height, ctx.pathFinder.radius * 2);
    const material = new THREE.MeshStandardMaterial({ color: app.style.greybox.dummy,
      roughness: app.style.greybox.roughness ?? 0.9 });
    const view = new THREE.Mesh(geometry, material);
    view.name = 'enemy:' + type;
    view.visible = false;
    ctx.scene.add(view);
    return view;
  }).register('walker', Walker)
    .register('runner', Runner)
    .register('tank', Tank)
    .register('exploder', Exploder);
  const catalog = new ShopCatalog()
    .register(new AmmoRefillItem(), { name: 'Ammo refill', description: 'Fill current weapon', unavailableReason: 'Ammo already full' })
    .register(new RifleItem(), { name: 'Rifle', description: '30 rounds / 210 reserve', unavailableReason: 'Already owned' })
    .register(new ShotgunItem(), { name: 'Shotgun', description: '6 shells / 36 reserve', unavailableReason: 'Already owned' })
    .register(new HealthItem(), { name: 'First aid', description: 'Restore up to 50 HP', unavailableReason: 'Health already full' })
    .register(new ArmorItem(), { name: 'Armor', description: 'Refill to 50 armor', unavailableReason: 'Armor already full' });
  app.game = new GameSession(ctx, { factory, director: new ExampleWaveDirector(), economy: new Economy(),
    catalog, damagePipeline: new DamagePipeline([new HeadshotRule(),
      new ArmorRule(id => ctx.players.find(candidate => candidate.id === id))]), breakSeconds: EXAMPLE_WAVES.breakSeconds });
  app.combat = new PlayerCombat(app.player, app.camera, ctx, player.id);
  app.hud = SurvivalHud.standard(document.body, ctx.events, player.id);
  app.hud.updateGame(0, app.game, true);
  const unsubscribe = ctx.events.on(EVENTS.GAME_OVER, () => {
    app.player.enabled = false;
    app.hud.setStartVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    app.hud.updateGame(0, app.game, true);
  });
  const dispose = () => {
    unsubscribe();
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
