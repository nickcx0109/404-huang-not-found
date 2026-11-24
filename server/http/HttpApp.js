import { createServer } from 'node:http';
import { sendText } from './StaticFiles.js';

/**
 * A tiny HTTP server: GET/HEAD requests go to the first matching Route
 * (server/http/routes.js); anything else gets 405.
 */
export class HttpApp {
  /**
   * @param {import('./routes.js').Route[]} routes  tried in order
   * @param {{ log?: ((line: string) => void) | null }} [options]  one line per request when given
   */
  constructor(routes, { log = null } = {}) {
    this.routes = routes;
    this.log = log;
    this.server = createServer((req, res) => this.handle(req, res));
  }

  async handle(req, res) {
    const started = Date.now();
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return this._logged(req, sendText(res, 400, 'Bad Request'), started);
    }
    let status;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      status = sendText(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    } else {
      const route = this.routes.find((candidate) => candidate.matches(url));
      try {
        status = route ? await route.handle(req, res, url) : sendText(res, 404, 'Not Found');
      } catch {
        status = res.headersSent ? (res.destroy(), 500) : sendText(res, 500, 'Internal Server Error');
      }
    }
    return this._logged(req, status, started, url);
  }

  _logged(req, status, started, url = null) {
    if (this.log) {
      const path = url ? url.pathname + url.search : req.url;
      this.log(`${status} ${req.method} ${path} ${Date.now() - started}ms`);
    }
    return status;
  }

  /**
   * Starts listening; resolves with the bound port (0 picks a free one), rejects if binding fails.
   * @param {number} port
   * @param {string} [host]
   */
  listen(port, host) {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        this.server.off('error', reject);
        resolve(this.server.address().port);
      });
    });
  }

  /** Stops accepting requests and drops open keep-alive connections. */
  close() {
    if (!this.server.listening) return Promise.resolve();
    return new Promise((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }
}
