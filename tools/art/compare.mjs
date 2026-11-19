#!/usr/bin/env node
// Compares two folders of screenshots from tools/art/shots.mjs, e.g. taken before and after a change.
//
//   node tools/art/compare.mjs <before-dir> <after-dir>
//
// For every image in <before-dir> it prints one line:
//   same     no pixel differs
//   noise    only a few pixels are off by a step or two; the software renderer does that between runs (TODO B16)
//   DIFF     the picture changed
//   MISSING  <after-dir> has no file of that name
// Exits 1 when any image is DIFF or MISSING, 0 otherwise.
//
// Options
//   --max-delta <n>   largest per-channel difference still counted as noise, default 4
//   --max-share <f>   largest share of differing pixels still counted as noise, default 0.0005 (0.05 %)

import { readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { NOISE_LIMITS, classify, diffPixels } from './imageDiff.mjs';

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const LABELS = { same: 'same', noise: 'noise', different: 'DIFF' };

function fail(message) {
  console.error('compare: ' + message);
  process.exit(2);
}

function readOptions() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        'max-delta': { type: 'string', default: String(NOISE_LIMITS.maxDelta) },
        'max-share': { type: 'string', default: String(NOISE_LIMITS.maxShare) },
      },
    });
  } catch (err) {
    fail(err.message);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 2) fail('usage: node tools/art/compare.mjs <before-dir> <after-dir>');
  const maxDelta = Number(values['max-delta']);
  const maxShare = Number(values['max-share']);
  if (!Number.isFinite(maxDelta) || maxDelta < 0) fail('--max-delta must be a number >= 0');
  if (!Number.isFinite(maxShare) || maxShare < 0 || maxShare > 1) fail('--max-share must be between 0 and 1');
  return { before: resolve(positionals[0]), after: resolve(positionals[1]), limits: { maxDelta, maxShare } };
}

/** Decodes images to RGBA in a headless page, because Node has no image decoder of its own. */
async function openDecoder() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    fail('playwright is not installed. Run: npm install && npx playwright install chromium');
  }
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  const decode = async (bytes, type) => {
    const result = await page.evaluate(async ({ data, type }) => {
      const blob = await (await fetch('data:' + type + ';base64,' + data)).blob();
      const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let binary = '';
      for (let i = 0; i < pixels.length; i += 0x8000) binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
      return { width: bitmap.width, height: bitmap.height, data: btoa(binary) };
    }, { data: bytes.toString('base64'), type });
    return { width: result.width, height: result.height, data: Buffer.from(result.data, 'base64') };
  };
  return { decode, close: () => browser.close() };
}

async function main() {
  const { before, after, limits } = readOptions();
  let names;
  try {
    names = (await readdir(before)).filter((name) => TYPES[extname(name).toLowerCase()]).sort();
  } catch (err) {
    fail('cannot read ' + before + ': ' + err.message);
  }
  if (names.length === 0) fail('no images in ' + before);

  let decoder = null;
  let bad = 0;
  try {
    for (const name of names) {
      let a;
      let b;
      try {
        [a, b] = await Promise.all([readFile(join(before, name)), readFile(join(after, name))]);
      } catch {
        console.log('MISSING  ' + name);
        bad++;
        continue;
      }
      if (a.equals(b)) {
        console.log('same     ' + name);
        continue;
      }
      decoder ??= await openDecoder();
      const type = TYPES[extname(name).toLowerCase()];
      const [ia, ib] = await Promise.all([decoder.decode(a, type), decoder.decode(b, type)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        console.log('DIFF     ' + name + '  size ' + ia.width + 'x' + ia.height + ' vs ' + ib.width + 'x' + ib.height);
        bad++;
        continue;
      }
      const diff = diffPixels(ia.data, ib.data, ia.width, ia.height);
      const verdict = classify(diff, limits);
      if (verdict === 'different') bad++;
      const box = diff.box ? '  in ' + diff.box.x0 + ',' + diff.box.y0 + ' - ' + diff.box.x1 + ',' + diff.box.y1 : '';
      console.log(LABELS[verdict].padEnd(9) + name + '  ' + diff.pixels + ' px, max delta ' + diff.maxDelta + box);
    }
  } finally {
    await decoder?.close();
  }
  if (bad > 0) {
    console.error(bad + ' image(s) differ');
    process.exit(1);
  }
}

await main();
