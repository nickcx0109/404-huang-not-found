import * as THREE from 'three';
import { GameContext } from './GameContext.js';
import { GameSession } from './GameSession.js';
import { ExampleWaveDirector, EXAMPLE_WAVES } from './WaveDirector.js';
import { EVENTS } from './events.js';
import { PathFinder } from '../PathFinder.js';
import { EnemyFactory } from '../enemies/EnemyFactory.js';
import { Walker } from '../enemies/Walker.js';
import { CombatPlayer } from '../player/CombatPlayer.js';
import { PlayerCombat } from '../player/PlayerCombat.js';
import { Pistol } from '../weapons/Pistol.js';
import { Wallet } from '../economy/Wallet.js';
import { Economy } from '../economy/Economy.js';
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
  }).register('walker', Walker);
  const ammo = new AmmoRefillItem();
  app.game = new GameSession(ctx, { factory, director: new ExampleWaveDirector(), economy: new Economy(),
    items: [ammo], breakSeconds: EXAMPLE_WAVES.breakSeconds });
  app.combat = new PlayerCombat(app.player, app.camera, ctx, player.id, ammo.id);
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
