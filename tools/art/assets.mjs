#!/usr/bin/env node
// One entry point for the asset tools, so nobody has to remember Blender's command line.
//
//   node tools/art/assets.mjs build   <ids... | --chapter ch2 | --all>   art/blender/<id>.py -> web/assets/models/<id>.glb
//   node tools/art/assets.mjs textures [ids...]                       art/textures.json -> web/assets/textures/<id>.jpg
//   node tools/art/assets.mjs preview <ids... | --chapter ch2 | --all>   4 preview images per asset -> art/previews/<id>/
//   node tools/art/assets.mjs check   [ids... | --chapter ch2]            limits, size, axes, naming (no Blender needed)
//   node tools/art/assets.mjs all     <ids... | --chapter ch2 | --all>   build, then preview, then check
//
// Blender (4.2 LTS) is taken from PATH; set the environment variable BLENDER to use another one.
//
// SHARED: talk to the team lead before changing it.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BLENDER = process.env.BLENDER || 'blender';

function runBlender(script, args) {
  const result = spawnSync(
    BLENDER,
    ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(HERE, script), '--', ...args],
    { stdio: 'inherit' }
  );
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(
        `assets: cannot start "${BLENDER}". Install Blender 4.2 LTS and put it on PATH, ` +
          'or set the BLENDER environment variable to the full path of blender(.exe).'
      );
    } else {
      console.error('assets: ' + result.error.message);
    }
    return 1;
  }
  return result.status ?? 1;
}

function runCheck(args) {
  const result = spawnSync(process.execPath, [join(HERE, 'check_assets.mjs'), ...args], { stdio: 'inherit' });
  return result.status ?? 1;
}

const [command, ...args] = process.argv.slice(2);
let code;
switch (command) {
  case 'build':
    code = runBlender('build_assets.py', args);
    break;
  case 'preview':
    code = runBlender('preview.py', args);
    break;
  case 'textures':
    code = runBlender('build_textures.py', args);
    break;
  case 'check':
    code = runCheck(args);
    break;
  case 'all':
    code = runBlender('build_assets.py', args) || runBlender('preview.py', args) || runCheck(args.filter((a) => a !== '--all'));
    break;
  default:
    console.error('usage: node tools/art/assets.mjs <build|preview|check|all> <ids... | --chapter <name> | --all>  |  textures [ids...]');
    code = 2;
}
process.exit(code);
