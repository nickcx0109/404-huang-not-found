import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { WebSocket } from 'ws';
import { contentTypeOf, REPO_ROOT, StaticFiles } from '../server/http/StaticFiles.js';
import { HttpApp } from '../server/http/HttpApp.js';
import { HealthRoute, RedirectRoute, Route, StaticRoute } from '../server/http/routes.js';
import { ServerTaggedPage } from '../server/http/ServerTaggedPage.js';
import { createGameHttp, GAME_START_PAGE } from '../server/http/gameHttp.js';
import { RoomServer } from '../server/RoomServer.js';
import { WsTransport } from '../server/transport/WsTransport.js';
import { pageServerUrl } from '../web/js/net/ServerConfig.js';

/** A tiny repo-shaped folder: web/, art/ and a secret next to them. */
async function makeRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'http-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'web', 'js'), { recursive: true });
  await mkdir(join(root, 'web', '.cache'), { recursive: true });
  await mkdir(join(root, 'art', 'style'), { recursive: true });
  await mkdir(join(root, 'server'), { recursive: true });
  await writeFile(join(root, 'web', 'index.html'), '<!DOCTYPE html>\n<html><head>\n<title>x</title>\n</head><body></body></html>\n');
  await writeFile(join(root, 'web', 'js', 'main.js'), 'export {};\n');
  await writeFile(join(root, 'web', '.cache', 'x.js'), 'hidden\n');
  await writeFile(join(root, 'art', 'style', 'palette.json'), '{}\n');
  await writeFile(join(root, 'server', 'secret.js'), 'secret\n');
  await writeFile(join(root, 'package.json'), '{}\n');
  return root;
}

async function startGameHttp(t, root) {
  const http = createGameHttp({ root });
  const port = await http.listen(0, '127.0.0.1');
  t.after(() => http.close());
  return { http, base: `http://127.0.0.1:${port}` };
}

test('StaticFiles keeps requests inside the allowed folders', () => {
  const files = new StaticFiles({ root: REPO_ROOT, folders: ['web', 'art'] });
  assert.equal(files.resolve('/web/index.html'), join(REPO_ROOT, 'web', 'index.html'));
  assert.equal(files.resolve('/art/style/palette.json'), join(REPO_ROOT, 'art', 'style', 'palette.json'));
  assert.equal(files.resolve('/web/'), join(REPO_ROOT, 'web') + sep);
  for (const bad of [
    '/', '/package.json', '/server/main.mjs', '/webx/a.js', '/web/../server/main.mjs',
    '/web/%2e%2e/server/main.mjs', '/web/..%2fserver/main.mjs', '/web/..%5cserver%5cmain.mjs',
    '/.git/config', '/web/.cache/x.js', '/web/index.html::$DATA', '/web/C:/Windows/win.ini',
    '/web/%00.js', '/web/%E0%A4%A', '/%2e%2e/%2e%2e/etc/passwd',
  ]) {
    assert.equal(files.resolve(bad), null, bad);
  }
});

test('StaticFiles without folders serves the whole root but still no hidden or outside path', () => {
  const files = new StaticFiles({ root: REPO_ROOT });
  assert.equal(files.resolve('/package.json'), join(REPO_ROOT, 'package.json'));
  assert.equal(files.resolve('/../x'), null);
  assert.equal(files.resolve('/.git/HEAD'), null);
});

test('content types follow the file extension', () => {
  assert.equal(contentTypeOf('a/index.html'), 'text/html; charset=utf-8');
  assert.equal(contentTypeOf('main.JS'), 'text/javascript; charset=utf-8');
  assert.equal(contentTypeOf('palette.json'), 'application/json; charset=utf-8');
  assert.equal(contentTypeOf('wall.png'), 'image/png');
  assert.equal(contentTypeOf('car.glb'), 'model/gltf-binary');
  assert.equal(contentTypeOf('noext'), 'application/octet-stream');
});

test('RedirectRoute keeps the request query and lets the target win on a clash', () => {
  const route = new RedirectRoute('/', '/web/index.html?play=1');
  const at = (path) => route.location(new URL(path, 'http://x'));
  assert.equal(at('/'), '/web/index.html?play=1');
  assert.equal(at('/?join=ABCD'), '/web/index.html?play=1&join=ABCD');
  assert.equal(at('/?play=0&level=ch2'), '/web/index.html?play=1&level=ch2');
  assert.equal(new RedirectRoute('/', '/web/index.html').location(new URL('http://x/?level=ch2')), '/web/index.html?level=ch2');
});

test('ServerTaggedPage adds the same-origin tag that the page reads back', () => {
  const html = ServerTaggedPage.tag('<html><head><title>x</title></head><body></body></html>');
  assert.match(html, /<meta name="coop-server" content="same-origin">\n<\/head>/);
  assert.match(ServerTaggedPage.tag('<p>no head</p>'), /^<meta name="coop-server"/);
  const doc = { querySelector: (selector) => (selector === 'meta[name="coop-server"]' ? { content: 'same-origin' } : null) };
  assert.equal(pageServerUrl(doc, { protocol: 'https:', host: 'game.fly.dev' }), 'wss://game.fly.dev/');
  assert.equal(pageServerUrl(doc, { protocol: 'http:', host: 'localhost:8787' }), 'ws://localhost:8787/');
  assert.equal(pageServerUrl(doc, { protocol: 'file:', host: '' }), '');
  assert.equal(pageServerUrl({ querySelector: () => null }, { protocol: 'https:', host: 'pages.example' }), '', 'plain static hosting has no tag');
  assert.equal(pageServerUrl({ querySelector: () => ({ content: 'other' }) }, { protocol: 'https:', host: 'x' }), '');
  assert.equal(pageServerUrl(undefined, undefined), '');
});

test('the game HTTP server answers /health, redirects / and serves web/ and art/ only', async (t) => {
  const root = await makeRoot(t);
  const { base } = await startGameHttp(t, root);
  const get = (path, init) => fetch(base + path, { redirect: 'manual', ...init });

  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');

  const home = await get('/?join=ABCD');
  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), `${GAME_START_PAGE}&join=ABCD`);

  const page = await get('/web/index.html?play=1');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.match(await page.text(), /<meta name="coop-server" content="same-origin">/);

  const script = await get('/web/js/main.js');
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(await script.text(), 'export {};\n');

  const palette = await get('/art/style/palette.json');
  assert.equal(palette.status, 200);
  assert.equal(palette.headers.get('content-type'), 'application/json; charset=utf-8');

  const head = await get('/web/js/main.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '11');

  assert.equal((await get('/web')).headers.get('location'), '/web/');
  assert.equal((await get('/web/js/missing.js')).status, 404);
  assert.equal((await get('/server/secret.js')).status, 403);
  assert.equal((await get('/package.json')).status, 403);
  assert.equal((await get('/web/%2e%2e/server/secret.js')).status, 403);
  assert.equal((await get('/web/.cache/x.js')).status, 403);
  assert.equal((await get('/health', { method: 'POST' })).status, 405);
});

test('HttpApp answers 500 when a route throws, and 404 when none matches', async (t) => {
  class Broken extends Route {
    matches(url) { return url.pathname === '/boom'; }
    async handle() { throw new Error('boom'); }
  }
  const app = new HttpApp([new Broken(), new HealthRoute()]);
  const port = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  assert.equal((await fetch(`http://127.0.0.1:${port}/boom`)).status, 500);
  assert.equal((await fetch(`http://127.0.0.1:${port}/nothing`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
});

test('StaticRoute serves the real repository page', async (t) => {
  const app = new HttpApp([new StaticRoute(new StaticFiles({ folders: ['web', 'art'] }))]);
  const port = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const response = await fetch(`http://127.0.0.1:${port}/web/index.html`);
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /coop-server/, 'only the game server tags the page');
});

test('WebSocket upgrades work on the same port as HTTP', async (t) => {
  const root = await makeRoot(t);
  const { http, base } = await startGameHttp(t, root);
  const transport = new WsTransport(new RoomServer()).attach(http.server);
  t.after(() => transport.close());

  assert.equal((await fetch(`${base}/health`)).status, 200);
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/');
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const pong = new Promise((resolve) => ws.once('message', (data) => resolve(JSON.parse(data.toString('utf8')))));
  ws.send(JSON.stringify({ t: 'ping', c: 42 }));
  const message = await pong;
  assert.equal(message.t, 'pong');
  assert.equal(message.c, 42);
  assert.equal(typeof message.s, 'number');
  await new Promise((resolve) => {
    ws.once('close', resolve);
    ws.close();
  });
  assert.equal((await fetch(`${base}/health`)).status, 200, 'HTTP still served after a socket');
});

test('WsTransport.listen still runs on its own port', async (t) => {
  const transport = new WsTransport(new RoomServer());
  const port = await transport.listen(0, '127.0.0.1');
  t.after(() => transport.close());
  assert.ok(port > 0);
});
