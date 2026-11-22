import { Bandage } from '../weapons/Bandage.js';
import { Adrenaline } from '../weapons/Adrenaline.js';

/** Healing points draw this deck independently of weapons and throwables. */
export function registerHealingItems(catalog) {
  return catalog
    .register('adrenaline', { create: () => new Adrenaline(), name: 'ADRENALINE', pool: 'healing',
      look: { length: 0.2, height: 0.05, width: 0.05 } })
    .register('bandage', { create: () => new Bandage(), name: 'BANDAGE', pool: 'healing',
      look: { length: 0.22, height: 0.08, width: 0.16 } });
}
