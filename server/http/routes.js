// Routes for HttpApp. Each route says whether it takes a request and answers it (Strategy).
import { sendText } from './StaticFiles.js';

/** Base class: `matches(url)` picks the route, `handle(req, res, url)` resolves with the status sent. */
export class Route {
  matches(_url) {
    return false;
  }

  async handle(_req, res) {
    return sendText(res, 404, 'Not Found');
  }
}

/** `GET /health` → 200 `ok`, for cloud health checks. */
export class HealthRoute extends Route {
  constructor(path = '/health') {
    super();
    this.path = path;
  }

  matches(url) {
    return url.pathname === this.path;
  }

  async handle(_req, res) {
    return sendText(res, 200, 'ok', { 'Cache-Control': 'no-store' });
  }
}

/**
 * Redirects one exact path to a target. Query parameters of the request are added to the
 * target's own (`/?join=ABCD` → `/web/index.html?play=1&join=ABCD`); the target's win on a clash.
 */
export class RedirectRoute extends Route {
  constructor(from, to) {
    super();
    this.from = from;
    this.to = to;
  }

  matches(url) {
    return url.pathname === this.from;
  }

  location(url) {
    const [path, query = ''] = this.to.split('?');
    const params = new URLSearchParams(query);
    for (const [key, value] of url.searchParams) if (!params.has(key)) params.append(key, value);
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  }

  async handle(_req, res, url) {
    return sendText(res, 302, '', { Location: this.location(url) });
  }
}

/** Everything else: files from a StaticFiles. */
export class StaticRoute extends Route {
  /** @param {import('./StaticFiles.js').StaticFiles} files */
  constructor(files) {
    super();
    this.files = files;
  }

  matches() {
    return true;
  }

  handle(req, res, url) {
    return this.files.serve(req, res, url);
  }
}
