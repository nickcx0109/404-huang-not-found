#!/usr/bin/env node
// Takes screenshots of a level from its named bookmarks (camera positions).
//
//   node tools/art/shots.mjs --level mood --presets subtle,medium,heavy --out art/style/refs/candidates
//   node tools/art/shots.mjs --level test --out art/style/refs/t1-test
//
// It starts its own copy of tools/serve.mjs on a free port and stops it when done.
// First-time setup:  npm install  &&  npx playwright install chromium
//
// Options
//   --level <name>      web/levels/<name>.json                       (required)
//   --out <dir>         output folder, created if missing            (required)
//   --presets <a,b,c>   palette presets; files are <preset>-<bookmark>.<ext>
//                       (without it: <bookmark>.<ext>, using the level's default look)
//   --shots <a,b>       bookmarks to shoot; default: every bookmark of the level
//   --palette <block>   palette block override (?palette=)
//   --query <a=1&b=2>   extra URL parameters, e.g. "debug=1&perf=1"
//   --suffix=<text>     appended to each file name: --suffix=-debug gives overview-debug.jpg
//   --format <jpg|png>  default jpg (film grain makes a 1280x720 PNG about 1 MB)
//   --quality <1-100>   JPEG quality, default 85
//   --width / --height  viewport, default 1280 x 720
//   --gpu               render on the real GPU instead of SwiftShader (software)
//   --url <origin>      use a server that is already running, e.g. http://localhost:8080

import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { startServer } from '../serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SIZE_BUDGET_KB = 300;
const READY_TIMEOUT_MS = 120_000;

// Headless Chromium has no GPU by default; WebGL needs one of these.
const SOFTWARE_GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HARDWARE_GL_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];

function fail(message) {
  console.error('shots: ' + message);
  process.exit(1);
}

function readOptions() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        level: { type: 'string' },
        out: { type: 'string' },
        presets: { type: 'string' },
        shots: { type: 'string' },
        palette: { type: 'string' },
        query: { type: 'string' },
        suffix: { type: 'string' },
        format: { type: 'string', default: 'jpg' },
        quality: { type: 'string', default: '85' },
        width: { type: 'string', default: '1280' },
        height: { type: 'string', default: '720' },
        gpu: { type: 'boolean', default: false },
        url: { type: 'string' },
      },
    }));
  } catch (err) {
    fail(err.message);
  }
  if (!values.level || !values.out) {
    fail('usage: node tools/art/shots.mjs --level <name> --out <dir> [--presets a,b] [--shots a,b]');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(values.level)) fail('invalid level name "' + values.level + '"');
  if (!['jpg', 'png'].includes(values.format)) fail('--format must be jpg or png');
  const list = (text) => (text ? text.split(',').map((s) => s.trim()).filter(Boolean) : []);
  return {
    level: values.level,
    out: resolve(values.out),
    presets: list(values.presets),
    shots: list(values.shots),
    palette: values.palette || null,
    query: values.query || '',
    suffix: values.suffix || '',
    format: values.format,
    quality: Math.min(100, Math.max(1, Number(values.quality) || 85)),
    width: Number(values.width) || 1280,
    height: Number(values.height) || 720,
    gpu: values.gpu,
    url: values.url ? values.url.replace(/\/+$/, '') : null,
  };
}

async function bookmarkNames(level) {
  const file = join(ROOT, 'web', 'levels', level + '.json');
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    fail('cannot read ' + relative(ROOT, file) + ': ' + err.message);
  }
  return (data.bookmarks || []).map((b) => b.name);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    fail('playwright is not installed. Run: npm install && npx playwright install chromium');
  }
}

async function main() {
  const options = readOptions();
  const available = await bookmarkNames(options.level);
  const shots = options.shots.length > 0 ? options.shots : available;
  const unknown = shots.filter((name) => !available.includes(name));
  if (unknown.length > 0) {
    fail('level "' + options.level + '" has no bookmark ' + unknown.join(', ') + ' (has: ' + available.join(', ') + ')');
  }
  if (shots.length === 0) fail('level "' + options.level + '" has no bookmarks');

  const { chromium } = await loadPlaywright();
  await mkdir(options.out, { recursive: true });

  const server = options.url ? null : await startServer({ port: 0, quiet: true });
  const origin = options.url || server.url;
  let browser;
  let failures = 0;

  try {
    browser = await chromium.launch({
      headless: true,
      args: options.gpu ? HARDWARE_GL_ARGS : SOFTWARE_GL_ARGS,
    });
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (err) => console.error('  [page error] ' + err.message));

    // No --presets: one pass with the level's own look.
    for (const preset of options.presets.length > 0 ? options.presets : [null]) {
      for (const shot of shots) {
        const params = new URLSearchParams(options.query);
        params.set('level', options.level);
        params.set('shot', shot);
        if (options.palette) params.set('palette', options.palette);
        if (preset) params.set('preset', preset);

        const name = (preset ? preset + '-' : '') + shot + options.suffix + '.' + options.format;
        const file = join(options.out, name);
        await page.goto(origin + '/web/index.html?' + params.toString());
        await page.waitForFunction(() => window.__ready || window.__error, null, {
          timeout: READY_TIMEOUT_MS,
        });
        const state = await page.evaluate(() => ({ error: window.__error, stats: window.__stats }));
        if (state.error) {
          console.error('FAIL ' + name + ': ' + state.error);
          failures++;
          continue;
        }
        await page.screenshot(
          options.format === 'jpg'
            ? { path: file, type: 'jpeg', quality: options.quality }
            : { path: file, type: 'png' }
        );
        const kb = Math.round((await stat(file)).size / 1024);
        const s = state.stats || {};
        console.log(
          relative(ROOT, file).replaceAll('\\', '/') + '  ' + kb + ' KB' +
            (kb > SIZE_BUDGET_KB ? ' (over ' + SIZE_BUDGET_KB + ' KB!)' : '') +
            '  draw calls ' + s.calls + ', triangles ' + s.triangles + ', lights ' + s.lights
        );
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }

  if (failures > 0) fail(failures + ' shot(s) failed');
}

await main();
