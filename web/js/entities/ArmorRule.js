import { DamageRule } from './DamagePipeline.js';

/** Runs after damage multipliers. The authority supplies entity lookup, never the DOM. */
export class ArmorRule extends DamageRule {
  constructor(findTarget) {
    super();
    this.findTarget = findTarget;
  }

  modify(info) {
    const armor = this.findTarget(info.targetId)?.armor;
    return armor ? info.withAmount(armor.absorb(info.amount)) : info;
  }
}
