#!/usr/bin/env node
// Checks that the HUD's ammo readout never overlaps the inventory rows at small window sizes.
//
//   node tools/hud-overlap.mjs                         -> 640x360, 800x450, 1280x720, 1920x1080
//   node tools/hud-overlap.mjs --sizes 640x360,960x540 --out <dir>   (also saves a screenshot per size)
//
// Starts its own tools/serve.mjs on a free port, opens ?level=ch2&play=1&debug=1, gives the player
// every item so all inventory rows are filled, and compares bounding boxes. Exit code 1 on overlap.

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const { values } = parseArgs({ options: {
  sizes: { type: 'string', default: '640x360,800x450,1280x720,1920x1080' },
  out: { type: 'string' },
  timeout: { type: 'string', default: '120' },
} });
const sizes = values.sizes.split(',').map(text => text.trim().split('x').map(Number));
const timeout = Number(values.timeout) * 1000;
// Boxes closer than MARGIN px count as overlapping, so a layout that merely touches fails too.
const MARGIN = 8;
const intersects = (a, b) => a.left < b.right + MARGIN && b.left < a.right + MARGIN && a.top < b.bottom + MARGIN && b.top < a.bottom + MARGIN;

const { url, close } = await startServer({ port: 0, quiet: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
try {
  if (values.out) await mkdir(resolve(values.out), { recursive: true });
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(new URL('/web/index.html?level=ch2&play=1&debug=1', url).href);
    await page.waitForFunction(() => window.__gameDebug, null, { timeout });
    await page.evaluate(async () => {
      const debug = window.__gameDebug;
      await debug.ready();
      debug.giveAdrenaline(); debug.giveBandage(debug.snapshot().players[0].id); debug.giveSniper();
      debug.start();
    });
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      const ammo = document.querySelector('.hud-ammo');
      const rows = [...document.querySelectorAll('.hud-inventory__row')];
      const textBoxes = [...ammo.querySelectorAll('.hud-ammo__count, .hud-ammo__rounds, .hud-ammo__notice')].map(box);
      return { ammo: textBoxes, rows: rows.map(box), ammoFont: parseFloat(getComputedStyle(ammo.querySelector('.hud-ammo__reserve')).fontSize),
        rowFont: parseFloat(getComputedStyle(rows[0]).fontSize), vw: innerWidth, vh: innerHeight };
    });
    const clashes = [];
    result.ammo.forEach((a, i) => result.rows.forEach((r, j) => { if (intersects(a, r)) clashes.push(`ammo part ${i} x row ${j}`); }));
    const offscreen = result.rows.filter(r => r.top < 0 || r.bottom > result.vh || r.right > result.vw).length;
    const ok = clashes.length === 0 && offscreen === 0 && result.rows.length > 0;
    failed ||= !ok;
    console.log(`${width}x${height}: ${ok ? 'ok' : 'FAIL'} rows=${result.rows.length} rowFont=${result.rowFont.toFixed(1)}px` +
      ` rowsBottom=${Math.max(...result.rows.map(r => r.bottom)).toFixed(0)} ammoTop=${Math.min(...result.ammo.map(a => a.top)).toFixed(0)}` +
      ` ammoParts=${result.ammo.map(a => a.top.toFixed(0) + "-" + a.bottom.toFixed(0)).join(",")} rowsTop=${result.rows[0].top.toFixed(0)}` + (clashes.length ? ' overlaps: ' + clashes.join(', ') : '') + (offscreen ? ` offscreen=${offscreen}` : ''));
    if (values.out) await page.screenshot({ path: join(resolve(values.out), `hud-${width}x${height}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
  await close();
}
process.exit(failed ? 1 : 0);
