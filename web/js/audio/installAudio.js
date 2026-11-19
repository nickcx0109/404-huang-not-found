import { SoundBoard } from './SoundBoard.js';
import { WebAudioOutput } from './WebAudioOutput.js';
import { WeaponSounds } from './WeaponSounds.js';
import { HitSounds } from './HitSounds.js';
import { PlayerSounds } from './PlayerSounds.js';
import { PickupSounds } from './PickupSounds.js';
import { ZombieSounds } from './ZombieSounds.js';
import { WorldSounds } from './WorldSounds.js';
import { Enemy } from '../enemies/Enemy.js';
import { Runner } from '../enemies/Runner.js';
import { Tank } from '../enemies/Tank.js';
import { Exploder } from '../enemies/Exploder.js';

const MANIFEST_URL = new URL('../../assets/sfx/manifest.json', import.meta.url).href;

/**
 * Sound for `play=1`. Returns a view-like object ({ update, dispose }) for App's gameViews list.
 * Which weapon and zombie makes which sound is all set here; the rules only listen to events.
 * The game stops while the mouse is not locked, so the sound pauses with it (TODO B14).
 */
export function installAudio({ events, player, enemies, playerId }) {
  const output = new WebAudioOutput({ manifestUrl: MANIFEST_URL });
  const board = new SoundBoard(output, () => player)
    .cooldown('hurt', 0.25)
    .cooldown('hit', 0.04)
    .cooldown('kill', 0.05)
    .cooldown('zombie_death', 0.08)
    .cooldown('zombie_scream', 0.6)
    .cooldown('zombie_hiss', 0.6)
    .cooldown('heal', 0.4);
  board.install(new WeaponSounds(events, playerId)
    .register('pistol', { fire: 'shot_pistol' })
    .register('revolver', { fire: 'shot_revolver' })
    .register('rifle', { fire: 'shot_rifle' })
    .register('smg', { fire: 'shot_smg' })
    .register('shotgun', { fire: 'shot_shotgun' })
    .register('bat', { fire: 'swing', hit: 'bat_hit' })
    .register('katana', { fire: 'katana_swing', hit: 'katana_hit' })
    .register('chainsaw', { held: 'chainsaw_idle', working: 'chainsaw_cut' }));
  board.install(new HitSounds(events, playerId));
  board.install(new PlayerSounds(events, playerId));
  board.install(new PickupSounds(events, playerId)
    .register(['rifle', 'shotgun', 'smg', 'revolver'], 'pickup_gun')
    .register(['katana', 'chainsaw'], 'pickup_melee'));
  board.install(new ZombieSounds(events, enemies)
    .register(Enemy, { groan: 'zombie_groan', death: 'zombie_death' })
    .register(Runner, { spawn: 'zombie_scream', groan: 'zombie_groan', death: 'zombie_death' })
    .register(Tank, { spawn: 'zombie_windup', groan: 'zombie_windup', death: 'zombie_death' })
    .register(Exploder, { spawn: 'zombie_hiss', groan: 'zombie_hiss', death: 'zombie_death' }));
  board.install(new WorldSounds(events));

  const unlock = () => output.unlock();
  const followLock = () => (player.locked ? output.resume() : output.pause());
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('pointerlockchange', followLock);
  followLock();
  return {
    board,
    update: dt => board.update(dt),
    dispose: () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('pointerlockchange', followLock);
      board.dispose();
      output.dispose();
    },
  };
}
