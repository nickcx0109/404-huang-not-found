#!/usr/bin/env node
// Zero-dependency static file server for local development.
//
//   node tools/serve.mjs            -> http://localhost:8080/
//   node tools/serve.mjs 9000       -> other port (or PORT=9000)
//   HOST=0.0.0.0 node tools/serve.mjs   -> reachable from other machines on the LAN
//
// The server root is the repository root, because the page (web/) reads
// art/style/palette.json, which lives outside web/. The file serving itself lives in
// server/http/ (StaticFiles, HttpApp), shared with the game server (server/main.mjs).
//
// Other tools can import it:  const { url, close } = await startServer({ port: 0, quiet: true });

import { pathToFileURL } from 'node:url';
import { HttpApp } from '../server/http/HttpApp.js';
import { RedirectRoute, StaticRoute } from '../server/http/routes.js';
import { hasHiddenPart, REPO_ROOT, StaticFiles } from '../server/http/StaticFiles.js';

export { hasHiddenPart };

const ROOT = REPO_ROOT;
const DEFAULT_PORT = 8080;
const DEFAULT_HOST = '127.0.0.1';
const START_PAGE = '/web/index.html';

/**
 * Starts the server. Port 0 picks any free port.
 * @param {{port?: number, host?: string, quiet?: boolean}} [options]
 * @returns {Promise<{server: import('node:http').Server, port: number, url: string, close: () => Promise<void>}>}
 */
export async function startServer(options = {}) {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  // Development server: the whole repository, always re-read (no-store) so edits show up.
  const app = new HttpApp(
    [new RedirectRoute('/', START_PAGE), new StaticRoute(new StaticFiles({ root: ROOT }))],
    { log: options.quiet ? null : (line) => console.log(line) },
  );
  const actualPort = await app.listen(port, host);
  const shownHost = host === '0.0.0.0' || host === '127.0.0.1' ? 'localhost' : host;
  return {
    server: app.server,
    port: actualPort,
    url: `http://${shownHost}:${actualPort}`,
    close: () => app.close(),
  };
}

// Command line: node tools/serve.mjs [port]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || process.env.PORT || DEFAULT_PORT);
  try {
    const { url } = await startServer({ port, host: process.env.HOST });
    console.log(`Serving ${ROOT}`);
    console.log(`Open ${url}${START_PAGE}?level=test`);
    console.log('Press Ctrl+C to stop.');
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try: node tools/serve.mjs ${port + 1}`);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  }
}
