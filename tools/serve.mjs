#!/usr/bin/env node
// Zero-dependency static file server for local development.
//
//   node tools/serve.mjs            -> http://localhost:8080/
//   node tools/serve.mjs 9000       -> other port (or PORT=9000)
//   HOST=0.0.0.0 node tools/serve.mjs   -> reachable from other machines on the LAN
//
// The server root is the repository root, because the page (web/) reads
// art/style/palette.json, which lives outside web/.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const START_PAGE = '/web/index.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

/** Maps a request path to a file inside ROOT, or null if it must not be served. */
function resolveRequestPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  // Hidden files and folders (.git, .claude, .env ...) are never served.
  if (decoded.split(/[\\/]/).some((part) => part.startsWith('.') && part !== '.')) return null;
  const filePath = normalize(join(ROOT, decoded));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) return null;
  return filePath;
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const log = (status) =>
    console.log(`${status} ${req.method} ${url.pathname}${url.search} ${Date.now() - started}ms`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return log(405);
  }
  if (url.pathname === '/') {
    send(res, 302, '', { Location: START_PAGE + url.search });
    return log(302);
  }

  let filePath = resolveRequestPath(url.pathname);
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return log(403);
  }

  try {
    let info = await stat(filePath);
    if (info.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        send(res, 302, '', { Location: url.pathname + '/' + url.search });
        return log(302);
      }
      filePath = join(filePath, 'index.html');
      info = await stat(filePath);
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      // Development server: always pick up edited files.
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
    }
    log(200);
  } catch {
    send(res, 404, `Not Found: ${url.pathname}`);
    log(404);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: node tools/serve.mjs ${PORT + 1}`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const shownHost = HOST === '0.0.0.0' || HOST === '127.0.0.1' ? 'localhost' : HOST;
  console.log(`Serving ${ROOT}`);
  console.log(`Open http://${shownHost}:${PORT}${START_PAGE}?level=test`);
  console.log('Press Ctrl+C to stop.');
});
