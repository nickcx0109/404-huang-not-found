/** DOM-free teammate presentation policy. Inventory capabilities, never item IDs. */
export class TeamPresentation {
  static healingIcon = Object.freeze({ glyph: '+', label: 'Carries healing supplies' });

  static carriesHealing(items = []) {
    for (const item of items) {
      if (item?.slot === 'healing' && item.count > 0) return true;
    }
    return false;
  }

  static avatar(name) {
    return String(name).trim().slice(0, 2).toUpperCase() || '?';
  }

  static down(player) {
    return Boolean(player.downed);
  }
}
