import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { CombatPlayer } from '../web/js/player/CombatPlayer.js';
import { Wallet } from '../web/js/economy/Wallet.js';
import { Economy } from '../web/js/economy/Economy.js';
import { AmmoRefillItem } from '../web/js/economy/AmmoRefillItem.js';
import { RifleItem } from '../web/js/economy/RifleItem.js';
import { ShotgunItem } from '../web/js/economy/ShotgunItem.js';
import { HealthItem } from '../web/js/economy/HealthItem.js';
import { ArmorItem } from '../web/js/economy/ArmorItem.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { EVENTS } from '../web/js/game/events.js';

function fixture(Item) {
  const ctx = { events: new EventBus(), time: 0 };
  const player = new CombatPlayer('me', { x: 0, z: 0 }, ctx.events);
  const item = new Item();
  player.wallet = new Wallet(player.id, ctx.events, item.cost * 3);
  player.weapons.add(new Pistol());
  player.weapons.current.ammo--;
  player.damageable.health = 20;
  return { ctx, player, item, economy: new Economy() };
}

const cases = [
  [AmmoRefillItem, p => p.weapons.current.refill(), p => assert.equal(p.weapons.current.ammo, 12)],
  [RifleItem, (p, item) => item.apply(p), p => {
    assert.deepEqual(p.weapons.weapons.map(w => w.id), ['pistol', 'rifle']);
    assert.equal(p.weapons.weapons[1].reserve, 210);
  }],
  [ShotgunItem, (p, item) => item.apply(p), p => {
    assert.deepEqual(p.weapons.weapons.map(w => w.id), ['pistol', 'shotgun']);
    assert.equal(p.weapons.weapons[1].ammo, 6);
  }],
  [HealthItem, p => p.damageable.reset(), p => assert.equal(p.damageable.health, 70)],
  [ArmorItem, p => p.armor.refill(), p => assert.equal(p.armor.points, 50)],
];

for (const [Item, invalidate, verify] of cases) {
  test(`${Item.name} rejects insufficient funds without changing state`, () => {
    const { ctx, player, item, economy } = fixture(Item);
    player.wallet.spend(player.wallet.balance);
    const health = player.damageable.health;
    const ammo = player.weapons.current.ammo;
    assert.equal(item.canBuy(player, ctx), false);
    assert.equal(economy.purchase(item, player, ctx), false);
    assert.equal(player.wallet.balance, 0);
    assert.equal(player.damageable.health, health);
    assert.equal(player.weapons.current.ammo, ammo);
    assert.equal(player.armor.points, 0);
    assert.equal(player.weapons.weapons.length, 1);
  });

  test(`${Item.name} rejects unmet conditions without charging`, () => {
    const { ctx, player, item, economy } = fixture(Item);
    invalidate(player, item);
    const balance = player.wallet.balance;
    assert.equal(item.canBuy(player, ctx), false);
    assert.equal(economy.purchase(item, player, ctx), false);
    assert.equal(player.wallet.balance, balance);
  });

  test(`${Item.name} applies once and emits one purchase after payment`, () => {
    const { ctx, player, item, economy } = fixture(Item);
    const bought = [];
    ctx.events.on(EVENTS.ITEM_PURCHASED, data => bought.push(data));
    assert.equal(economy.purchase(item, player, ctx), true);
    assert.equal(player.wallet.balance, item.cost * 2);
    verify(player);
    assert.deepEqual(bought, [{ ownerId: player.id, itemId: item.id, cost: item.cost }]);
  });

  test(`${Item.name} refunds when conditions change between validation and apply`, () => {
    const { ctx, player, item, economy } = fixture(Item);
    let bought = 0;
    ctx.events.on(EVENTS.ITEM_PURCHASED, () => bought++);
    // The synchronous wallet event can invalidate a purchase after canBuy but before apply.
    ctx.events.on(EVENTS.WALLET_CHANGED, ({ delta }) => { if (delta < 0) invalidate(player, item); });
    assert.equal(economy.purchase(item, player, ctx), false);
    assert.equal(player.wallet.balance, item.cost * 3);
    assert.equal(bought, 0);
  });

  test(`${Item.name} refunds an application exception and does not announce success`, () => {
    const { ctx, player, item, economy } = fixture(Item);
    let bought = 0;
    ctx.events.on(EVENTS.ITEM_PURCHASED, () => bought++);
    item.apply = () => { throw new Error('dependency failed'); };
    assert.throws(() => economy.purchase(item, player, ctx), /dependency failed/);
    assert.equal(player.wallet.balance, item.cost * 3);
    assert.equal(bought, 0);
  });
}

test('HealthItem caps healing at max health and never revives; ArmorItem rejects a missing component', () => {
  const { player, ctx, economy } = fixture(HealthItem);
  player.damageable.health = 90;
  assert.equal(economy.purchase(new HealthItem(), player, ctx), true);
  assert.equal(player.damageable.health, 100);
  player.damageable.health = 0;
  assert.equal(economy.purchase(new HealthItem(), player, ctx), false);
  player.armor = null;
  assert.equal(economy.purchase(new ArmorItem(), player, ctx), false);
});
