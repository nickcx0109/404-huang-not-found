import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Route } from './routes.js';
import { sendText } from './StaticFiles.js';
import { SERVER_META_NAME, SAME_ORIGIN } from '../../web/js/net/ServerConfig.js';

/**
 * The game page as served by the game server itself: web/index.html with
 * `<meta name="coop-server" content="same-origin">` added, so the page offers team play on this
 * server (ServerConfig.pageServerUrl) without `?server=`. Plain static hosting never adds it.
 */
export class ServerTaggedPage extends Route {
  /**
   * @param {{ files: import('./StaticFiles.js').StaticFiles, paths?: string[], file?: string }} options
   *   `file` is relative to the files' root.
   */
  constructor({ files, paths = ['/web/', '/web/index.html'], file = join('web', 'index.html') }) {
    super();
    this.files = files;
    this.paths = new Set(paths);
    this.file = join(files.root, file);
  }

  matches(url) {
    return this.paths.has(url.pathname);
  }

  /** The page text with the tag added just before `</head>` (or at the start if there is none). */
  static tag(html) {
    const meta = `<meta name="${SERVER_META_NAME}" content="${SAME_ORIGIN}">`;
    const at = html.search(/<\/head>/i);
    return at < 0 ? meta + '\n' + html : `${html.slice(0, at)}  ${meta}\n${html.slice(at)}`;
  }

  async handle(req, res) {
    let html;
    try {
      html = ServerTaggedPage.tag(await readFile(this.file, 'utf8'));
    } catch {
      return sendText(res, 404, 'Not Found');
    }
    const body = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': this.files.cacheControl,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return 200;
  }
}
