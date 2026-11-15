#!/usr/bin/env node
// Checks the assets listed in art/manifest/*.json against the rules of
// docs/art/SCENE_PIPELINE.md (section 5, step 1). Needs no Blender: it reads the GLB files.
//
//   node tools/art/check_assets.mjs                  every manifest
//   node tools/art/check_assets.mjs --chapter ch2    one manifest (plus the shared totals)
//   node tools/art/check_assets.mjs test_crate       single assets
//
// Per asset: naming, class and triangle limit, file size, size against the manifest, origin
// at the bottom centre, +Y up / front toward -Z (the build tool's stamp), no leftover node
// transforms, textures <= 1024 px, and for "ready" assets the 4 preview images.
// Overall: no duplicate ids, no GLB without a manifest entry, each chapter (with the common
// assets) <= 15 MB. Exits with code 1 when anything fails.
//
// SHARED: talk to the team lead before changing it.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_DIR = join(ROOT, 'art', 'manifest');
const SCRIPT_DIR = join(ROOT, 'art', 'blender');
const MODEL_DIR = join(ROOT, 'web', 'assets', 'models');
const PREVIEW_DIR = join(ROOT, 'art', 'previews');

// Triangle limits are the table in SCENE_PIPELINE.md. File-size limits are derived from them
// (about 190 bytes per triangle of unshared, vertex-coloured geometry) to catch accidents;
// the limit that really matters is the chapter total.
const CLASSES = {
  small_prop: { triangles: 1500, kb: 300 },
  large_prop: { triangles: 6000, kb: 1200 },
  module: { triangles: 3000, kb: 600 },
  landmark: { triangles: 20000, kb: 4000 },
};
const SOURCES = ['blender', 'kit'];
const STATUSES = ['planned', 'wip', 'ready'];
const ID_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const PREVIEW_VIEWS = ['front', 'back', 'side', 'three_quarter'];
const CHAPTER_BUDGET_MB = 15;
const MAX_TEXTURE_PX = 1024;
const SIZE_TOLERANCE = 0.1; // fraction of the expected size ...
const SIZE_SLACK = 0.05; // ... or this many metres, whichever is larger
const GROUND_SLACK = 0.02; // how far the lowest point may be from y = 0
const PIPELINE = '404-build_assets';
const COMMON = 'common';

// ---- GLB reading --------------------------------------------------------------------------

function readGlb(path) {
  const data = readFileSync(path);
  if (data.length < 20 || data.toString('latin1', 0, 4) !== 'glTF') {
    throw new Error('not a binary glTF file');
  }
  const jsonLength = data.readUInt32LE(12);
  if (data.toString('latin1', 16, 20) !== 'JSON') throw new Error('first chunk is not JSON');
  const json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  const bin = binStart <= data.length ? data.subarray(binStart) : Buffer.alloc(0);
  return { json, bin, bytes: data.length };
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return out;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const isIdentity = (m) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-4);

function imageSize(bytes) {
  if (bytes.length > 24 && bytes.toString('latin1', 1, 4) === 'PNG') {
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
      }
      offset += 2 + length;
    }
  }
  return null;
}

/** Triangles, bounding box (in the file's own axes) and other facts of one GLB. */
function measure(path) {
  const { json, bin, bytes } = readGlb(path);
  const scene = (json.scenes || [])[json.scene || 0] || { nodes: [] };
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  let transformed = false;
  let vertexColors = false;

  const visit = (index, parent) => {
    const node = json.nodes[index];
    const local = nodeMatrix(node);
    const world = multiply(parent, local);
    if (node.mesh !== undefined) {
      if (!isIdentity(world)) transformed = true;
      for (const primitive of json.meshes[node.mesh].primitives) {
        const position = json.accessors[primitive.attributes.POSITION];
        const count = primitive.indices !== undefined ? json.accessors[primitive.indices].count : position.count;
        if ((primitive.mode ?? 4) === 4) triangles += count / 3;
        if (primitive.attributes.COLOR_0 !== undefined) vertexColors = true;
        for (let corner = 0; corner < 8; corner++) {
          const p = [0, 1, 2].map((axis) => ((corner >> axis) & 1 ? position.max : position.min)[axis]);
          for (let axis = 0; axis < 3; axis++) {
            const v = world[axis] * p[0] + world[4 + axis] * p[1] + world[8 + axis] * p[2] + world[12 + axis];
            low[axis] = Math.min(low[axis], v);
            high[axis] = Math.max(high[axis], v);
          }
        }
      }
    }
    (node.children || []).forEach((child) => visit(child, world));
  };
  (scene.nodes || []).forEach((index) => visit(index, IDENTITY));

  const textures = (json.images || []).map((image) => {
    if (image.bufferView === undefined) return { name: image.uri || image.name || '?', size: null };
    const view = json.bufferViews[image.bufferView];
    const start = view.byteOffset || 0;
    return { name: image.name || '?', size: imageSize(bin.subarray(start, start + view.byteLength)) };
  });

  return {
    bytes,
    triangles: Math.round(triangles),
    low,
    high,
    size: [0, 1, 2].map((axis) => high[axis] - low[axis]),
    transformed,
    vertexColors,
    textures,
    materials: (json.materials || []).map((m) => m.name),
    extras: scene.extras || {},
  };
}

// ---- manifests ------------------------------------------------------------------------------

function loadManifests(problems) {
  const manifests = [];
  for (const file of readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const chapter = file.slice(0, -5);
    let data;
    try {
      data = JSON.parse(readFileSync(join(MANIFEST_DIR, file), 'utf8'));
    } catch (err) {
      problems.push(`art/manifest/${file}: not valid JSON (${err.message})`);
      continue;
    }
    if (data.chapter !== chapter) {
      problems.push(`art/manifest/${file}: "chapter" must be "${chapter}" (the file name)`);
    }
    if (!Array.isArray(data.assets)) {
      problems.push(`art/manifest/${file}: "assets" must be an array`);
      continue;
    }
    manifests.push({ chapter, assets: data.assets.map((a) => ({ ...a, chapter })) });
  }
  return manifests;
}

// ---- checks ----------------------------------------------------------------------------------

function checkAsset(asset) {
  const errors = [];
  const notes = [];
  const id = asset.id;
  const cls = CLASSES[asset.class];

  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    errors.push(`id must be lower_snake_case (letters, digits, single underscores), got ${JSON.stringify(id)}`);
    return { errors, notes, measured: null };
  }
  if (!cls) errors.push(`class must be one of ${Object.keys(CLASSES).join(', ')}`);
  if (!SOURCES.includes(asset.source)) errors.push(`source must be one of ${SOURCES.join(', ')}`);
  if (!STATUSES.includes(asset.status)) errors.push(`status must be one of ${STATUSES.join(', ')}`);
  if (asset.maxTriangles !== undefined && cls && !(asset.maxTriangles > 0 && asset.maxTriangles <= cls.triangles)) {
    errors.push(`maxTriangles must be between 1 and the class limit ${cls.triangles}`);
  }
  if (asset.size !== undefined) {
    const ok = Array.isArray(asset.size) && asset.size.length === 3 && asset.size.every((n) => typeof n === 'number' && n > 0);
    if (!ok) errors.push('size must be [width, height, depth] in metres, all > 0');
  }
  if (errors.length > 0 || asset.status === 'planned') return { errors, notes, measured: null };

  const glb = join(MODEL_DIR, id + '.glb');
  if (asset.source === 'blender' && !existsSync(join(SCRIPT_DIR, id + '.py'))) {
    errors.push(`script art/blender/${id}.py is missing`);
  }
  if (!existsSync(glb)) {
    if (asset.status === 'ready') errors.push(`web/assets/models/${id}.glb is missing (status is "ready")`);
    else notes.push('not built yet');
    return { errors, notes, measured: null };
  }

  let m;
  try {
    m = measure(glb);
  } catch (err) {
    errors.push(`cannot read ${id}.glb: ${err.message}`);
    return { errors, notes, measured: null };
  }

  const limit = Math.min(cls.triangles, asset.maxTriangles ?? Infinity);
  if (m.triangles > limit) errors.push(`${m.triangles} triangles, limit is ${limit}`);
  const kb = m.bytes / 1024;
  if (kb > cls.kb) errors.push(`file is ${kb.toFixed(0)} KB, limit for ${asset.class} is ${cls.kb} KB`);

  // units, axes: the build tool stamps what it enforced
  const x = m.extras;
  if (x.pipeline !== PIPELINE) {
    errors.push('not exported by tools/art/build_assets.py (axes and units cannot be trusted)');
  } else {
    if (x.asset_id !== id) errors.push(`built as "${x.asset_id}" but the file is named ${id}.glb`);
    if (x.unit !== 'm' || x.up !== '+Y' || x.front !== '-Z') {
      errors.push(`axes stamp is unit=${x.unit} up=${x.up} front=${x.front}; expected m, +Y, -Z`);
    }
  }
  if (m.transformed) errors.push('a mesh node still has a rotation, scale or offset (apply transforms)');

  // origin at the bottom centre
  if (Math.abs(m.low[1]) > GROUND_SLACK) {
    errors.push(`lowest point is at y = ${m.low[1].toFixed(3)} m; the model must stand on y = 0`);
  }
  if (asset.pivot !== 'custom') {
    for (const [axis, label] of [[0, 'x'], [2, 'z']]) {
      const centre = (m.low[axis] + m.high[axis]) / 2;
      const allowed = Math.max(0.03, m.size[axis] * 0.05);
      if (Math.abs(centre) > allowed) {
        errors.push(
          `not centred: middle is at ${label} = ${centre.toFixed(3)} m (allowed ${allowed.toFixed(3)}); ` +
            'centre it, or set "pivot": "custom" in the manifest'
        );
      }
    }
  }

  // size against the specification
  if (asset.size) {
    ['width', 'height', 'depth'].forEach((label, axis) => {
      const allowed = Math.max(SIZE_SLACK, asset.size[axis] * SIZE_TOLERANCE);
      if (Math.abs(m.size[axis] - asset.size[axis]) > allowed) {
        errors.push(`${label} is ${m.size[axis].toFixed(2)} m, manifest says ${asset.size[axis]} m`);
      }
    });
  } else {
    errors.push(`"size" is missing in the manifest (the model measures [${m.size.map((n) => +n.toFixed(2)).join(', ')}])`);
  }

  for (const texture of m.textures) {
    if (!texture.size) notes.push(`texture ${texture.name}: size unknown`);
    else if (Math.max(...texture.size) > MAX_TEXTURE_PX) {
      errors.push(`texture ${texture.name} is ${texture.size.join('x')} px, limit is ${MAX_TEXTURE_PX}`);
    }
  }
  if (m.textures.length > 0) notes.push(`${m.textures.length} texture(s): prefer vertex colours`);

  if (asset.status === 'ready') {
    const missing = PREVIEW_VIEWS.filter((view) => !existsSync(join(PREVIEW_DIR, id, view + '.jpg')));
    if (missing.length > 0) errors.push(`previews missing in art/previews/${id}/: ${missing.join(', ')} (run the preview tool)`);
  }
  return { errors, notes, measured: m };
}

function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: { chapter: { type: 'string', multiple: true }, all: { type: 'boolean' } },
    }));
  } catch (err) {
    console.error('check_assets: ' + err.message);
    process.exit(2);
  }
  const chapters = values.chapter || [];

  const general = [];
  const manifests = loadManifests(general);
  const everything = manifests.flatMap((m) => m.assets);

  for (const chapter of chapters) {
    if (!manifests.some((m) => m.chapter === chapter)) general.push(`no manifest art/manifest/${chapter}.json`);
  }
  for (const id of positionals) {
    if (!everything.some((a) => a.id === id)) general.push(`unknown asset id "${id}"`);
  }

  // ids must be unique across all manifests: an id is also a file name and a prop name
  const owner = new Map();
  for (const asset of everything) {
    if (owner.has(asset.id)) general.push(`id "${asset.id}" is in both ${owner.get(asset.id)}.json and ${asset.chapter}.json`);
    else owner.set(asset.id, asset.chapter);
  }

  const selective = chapters.length > 0 || positionals.length > 0;
  const selected = everything.filter(
    (a) => !selective || chapters.includes(a.chapter) || positionals.includes(a.id)
  );

  let failed = 0;
  console.log('== check_assets ==');
  for (const asset of selected) {
    const { errors, notes, measured } = checkAsset(asset);
    const facts = measured
      ? `${measured.triangles} tris, ${(measured.bytes / 1024).toFixed(0)} KB, ` +
        `${measured.size.map((n) => n.toFixed(2)).join(' x ')} m`
      : asset.status === 'planned' ? 'planned' : '';
    const label = `${asset.chapter}/${asset.id}`.padEnd(34);
    if (errors.length > 0) {
      failed++;
      console.log(`FAIL  ${label} ${facts}`);
      errors.forEach((e) => console.log('        - ' + e));
    } else if (asset.status === 'planned') {
      console.log(`skip  ${label} planned`);
    } else {
      console.log(`ok    ${label} ${facts}  [${asset.status}]`);
    }
    notes.forEach((n) => console.log('        note: ' + n));
  }

  // every GLB in the models folder must be listed, so that nothing unused ships
  const models = existsSync(MODEL_DIR) ? readdirSync(MODEL_DIR).filter((f) => f.endsWith('.glb')) : [];
  for (const file of models) {
    if (!owner.has(file.slice(0, -4))) general.push(`web/assets/models/${file} is not in any manifest`);
  }

  // download budget: a chapter loads its own assets plus the common ones
  const totalMb = (chapter) =>
    everything
      .filter((a) => a.chapter === chapter && existsSync(join(MODEL_DIR, a.id + '.glb')))
      .reduce((sum, a) => sum + statSync(join(MODEL_DIR, a.id + '.glb')).size, 0) / (1024 * 1024);
  const commonMb = totalMb(COMMON);
  console.log('\nchapter totals (own assets + common, limit ' + CHAPTER_BUDGET_MB + ' MB):');
  for (const { chapter } of manifests) {
    if (chapter === COMMON) continue;
    if (selective && chapters.length > 0 && !chapters.includes(chapter)) continue;
    const total = totalMb(chapter) + commonMb;
    console.log(`  ${chapter.padEnd(8)} ${total.toFixed(2)} MB`);
    if (total > CHAPTER_BUDGET_MB) general.push(`${chapter}: ${total.toFixed(2)} MB of models, limit is ${CHAPTER_BUDGET_MB} MB`);
  }

  if (general.length > 0) {
    console.log('\nproblems:');
    general.forEach((g) => console.log('  - ' + g));
  }
  const problems = failed + general.length;
  console.log(problems === 0 ? '\nall checks passed' : `\n${problems} problem(s)`);
  process.exit(problems === 0 ? 0 : 1);
}

main();
