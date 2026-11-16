import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { Wallet } from '../web/js/economy/Wallet.js';
import { Economy } from '../web/js/economy/Economy.js';
import { ShopItem } from '../web/js/economy/ShopItem.js';
import { AmmoRefillItem } from '../web/js/economy/AmmoRefillItem.js';
import { Pistol } from '../web/js/weapons/Pistol.js';
import { EVENTS } from '../web/js/game/events.js';

test('Wallet enforces integer money and emits changes only for successful transactions', () => {
  const events = new EventBus();
  const changes = [];
  events.on(EVENTS.WALLET_CHANGED, detail => changes.push(detail));
  const wallet = new Wallet('player', events);
  assert.equal(wallet.spend(1), false);
  wallet.credit(25);
  assert.equal(wallet.spend(10), true);
  assert.equal(wallet.balance, 15);
  assert.equal(changes.length, 2);
  for (const amount of [-1, 0.5, NaN, Infinity]) assert.throws(() => wallet.credit(amount));
  assert.throws(() => new Wallet('bad', events, -1));
  assert.throws(() => new Wallet('large', events, Number.MAX_SAFE_INTEGER).credit(1));
});

test('Economy buys exactly one ammo example by interface and rejects full ammo or insufficient money', () => {
  const ctx = { events: new EventBus(), time: 0 };
  const weapon = new Pistol({ fire: () => null });
  const player = { id: 'player', wallet: new Wallet('player', ctx.events), weapons: { current: weapon } };
  const economy = new Economy();
  const item = new AmmoRefillItem();
  const purchased = [];
  ctx.events.on(EVENTS.ITEM_PURCHASED, detail => purchased.push(detail));
  assert.throws(() => new ShopItem('abstract', 1));
  economy.reward(player, 25);
  assert.equal(economy.purchase(item, player, ctx), false);
  weapon.fire(ctx);
  assert.equal(economy.purchase(item, player, ctx), true);
  assert.equal(weapon.ammo, 12);
  assert.equal(player.wallet.balance, 0);
  weapon.fire({ ...ctx, time: 1 });
  assert.equal(economy.purchase(item, player, ctx), false);
  assert.equal(purchased.length, 1);
});

test('Economy refunds rejected or throwing item application', () => {
  const ctx = { events: new EventBus() };
  const player = { wallet: new Wallet('player', ctx.events, 100) };
  const item = { cost: 25, canBuy: () => true, apply: () => false };
  const economy = new Economy();
  assert.equal(economy.purchase(item, player, ctx), false);
  assert.equal(player.wallet.balance, 100);
  item.apply = () => { throw new Error('apply failed'); };
  assert.throws(() => economy.purchase(item, player, ctx), /apply failed/);
  assert.equal(player.wallet.balance, 100);
});
