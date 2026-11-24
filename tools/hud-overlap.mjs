#!/usr/bin/env node
// Checks that the HUD's ammo readout never overlaps the inventory rows at small window sizes.
//
//   node tools/hud-overlap.mjs                         -> 640x280, 320x360, 640x360, 800x450, 1280x720, 1920x1080
//   node tools/hud-overlap.mjs --sizes 640x360,960x540 --out <dir>   (also saves a screenshot per size)
//
// Starts its own tools/serve.mjs on a free port and opens ?level=ch2&play=1&debug=1. Every one of the
// 7 loadout slots is filled, then for the sniper and the pistol in hand the bounding boxes of the ammo
// readout and of every inventory row are compared. Boxes closer than 8 px count as overlapping.
// Exit code 1 on overlap, a missing fixture, or a timeout (--timeout seconds bounds each size).

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const { values } = parseArgs({ options: {
  sizes: { type: 'string', default: '640x280,320x360,640x360,800x450,1280x720,1920x1080' },
  out: { type: 'string' },
  timeout: { type: 'string', default: '120' },
} });
const sizes = values.sizes.split(',').map(text => text.trim().split('x').map(Number));
const timeout = Number(values.timeout) * 1000;
const MARGIN = 8;
const SLOTS = 7;
const intersects = (a, b) => a.left < b.right + MARGIN && b.left < a.right + MARGIN && a.top < b.bottom + MARGIN && b.top < a.bottom + MARGIN;

/** Rejects after `ms` so a hung page cannot hold the run forever. */
function deadline(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout: ${what}`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

async function fill(page) {
  await page.waitForFunction(() => window.__gameDebug && window.__app, null, { timeout });
  await deadline(page.evaluate(async () => {
    const debug = window.__gameDebug;
    await debug.ready();
    const holder = window.__app.game.context.players[0].weapons;
    const id = debug.snapshot().players[0].id;
    const { Chainsaw } = await import('/web/js/weapons/Chainsaw.js');
    const { Grenade } = await import('/web/js/weapons/Grenade.js');
    holder.add(new Chainsaw());
    holder.add(new Grenade());
    debug.giveAdrenaline(); debug.giveBandage(id); debug.giveSniper();
    debug.start();
  }), timeout, 'fixture readiness');
}

const measure = page => page.evaluate(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const ammo = document.querySelector('.hud-ammo');
  const rows = [...document.querySelectorAll('.hud-inventory__row')];
  const parts = [...ammo.querySelectorAll('.hud-ammo__count, .hud-ammo__rounds, .hud-ammo__notice')].map(box);
  const mag = ammo.querySelector('.hud-ammo__mag');
  return { ammo: parts, rows: rows.map(box), occupied: rows.filter(row => !row.classList.contains('is-empty')).length,
    ammoVisible: !ammo.classList.contains('is-unarmed') && getComputedStyle(ammo).visibility !== 'hidden'
      && mag.textContent !== '' && mag.getBoundingClientRect().width > 0 && mag.getBoundingClientRect().height > 0,
    rowFont: parseFloat(getComputedStyle(rows[0]).fontSize), vw: innerWidth, vh: innerHeight };
});

let failed = false;
const { url, close } = await startServer({ port: 0, quiet: true });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  if (values.out) await mkdir(resolve(values.out), { recursive: true });
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.goto(new URL('/web/index.html?level=ch2&play=1&debug=1', url).href);
      await fill(page);
      for (const [name, slot] of [['sniper', 0], ['pistol', 1]]) {
        await page.evaluate(index => window.__gameDebug.switchWeapon(index), slot);
        await page.waitForTimeout(400);
        const result = await measure(page);
        const clashes = [];
        result.ammo.forEach((a, i) => result.rows.forEach((r, j) => { if (intersects(a, r)) clashes.push(`ammo part ${i} x row ${j}`); }));
        const offscreen = result.rows.filter(r => r.top < 0 || r.bottom > result.vh || r.right > result.vw || r.left < 0).length;
        const problems = [];
        if (result.rows.length !== SLOTS || result.occupied !== SLOTS) problems.push(`slots ${result.occupied}/${result.rows.length} occupied, want ${SLOTS}`);
        if (!result.ammoVisible) problems.push('ammo box not visible');
        if (clashes.length) problems.push('overlaps: ' + clashes.join(', '));
        if (offscreen) problems.push(`offscreen=${offscreen}`);
        failed ||= problems.length > 0;
        console.log(`${width}x${height} ${name}: ${problems.length ? 'FAIL' : 'ok'} rowFont=${result.rowFont.toFixed(1)}px` +
          ` rowsBottom=${Math.max(...result.rows.map(r => r.bottom)).toFixed(0)} ammoTop=${Math.min(...result.ammo.map(a => a.top)).toFixed(0)}` +
          (problems.length ? ' ' + problems.join('; ') : ''));
        if (values.out && name === 'sniper') await page.screenshot({ path: join(resolve(values.out), `hud-${width}x${height}.png`) });
      }
    } catch (err) {
      failed = true;
      console.log(`${width}x${height}: FAIL ${err.message}`);
    }
    await page.close().catch(() => {});
  }
} catch (err) {
  failed = true;
  console.error('hud-overlap: ' + err.message);
} finally {
  await browser?.close().catch(() => {});
  await close();
}
process.exit(failed ? 1 : 0);
