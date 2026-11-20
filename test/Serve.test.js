import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasHiddenPart, startServer } from '../tools/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('hasHiddenPart finds dot-named parts on either slash', () => {
  assert.equal(hasHiddenPart('.git/config'), true);
  assert.equal(hasHiddenPart('web\\.cache\\x.js'), true);
  assert.equal(hasHiddenPart('web/js/main.js'), false);
  assert.equal(hasHiddenPart('web/./js/../index.html'), false);
});

test('the dev server serves the game but no hidden file, however it is named', async () => {
  const server = await startServer({ port: 0, quiet: true });
  const status = async (path) => (await fetch(server.url + path, { redirect: 'manual' })).status;
  try {
    assert.equal(await status('/web/index.html'), 200);
    assert.equal(await status('/.git/config'), 403);
    assert.equal(await status('/%2egit/config'), 403);
    assert.equal(await status('/web/index.html::$DATA'), 403);
    // Windows 8.3 short name of .git (KNOWN_ISSUES #4); only where the disk keeps short names.
    if (existsSync(join(ROOT, 'GIT~1', 'HEAD'))) {
      assert.equal(await status('/GIT~1/config'), 403);
      assert.equal(await status('/git~1/HEAD'), 403);
    }
  } finally {
    await server.close();
  }
});
