// Read-only static files from the repository, shared by tools/serve.mjs and server/main.mjs.
import { createReadStream, realpath } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/** The repository root (the page in web/ reads ../art/, so files are served from here). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const MIME = Object.freeze({
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
});

/** Content-Type for a file name; unknown extensions are plain bytes. */
export function contentTypeOf(filePath) {
  return MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** True when any part of a path (split on / or a backslash) is hidden, e.g. `.git`, `.env`, `web/.cache`. */
export function hasHiddenPart(path) {
  return path.split(/[\\/]/).some((part) => part.startsWith('.') && part !== '.' && part !== '..');
}

// The operating system's own name for a path: on Windows this turns 8.3 short names (GIT~1) back
// into the real ones (.git) and follows links, so the hidden-file check sees what is really read.
const realPathOf = promisify(realpath.native);

/**
 * Serves files under one root, optionally only inside some top-level folders.
 * Never serves hidden files, never leaves the root (KNOWN_ISSUES #4) and only answers GET/HEAD.
 */
export class StaticFiles {
  /**
   * @param {{ root?: string, folders?: string[]|null, cacheControl?: string }} [options]
   *   `folders`: top-level folder names that may be served (null = the whole root).
   */
  constructor({ root = REPO_ROOT, folders = null, cacheControl = 'no-store' } = {}) {
    this.root = resolve(root);
    this.folders = folders ? [...folders] : null;
    this.cacheControl = cacheControl;
    this._realRoot = null;
  }

  /** True when a path relative to the root lies inside one of the allowed folders. */
  allows(rel) {
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return false;
    if (hasHiddenPart(rel)) return false;
    if (!this.folders) return true;
    return this.folders.some((folder) => rel === folder || rel.startsWith(folder + sep));
  }

  /** Maps a URL path to a file path inside the root, or null if it must not be served. */
  resolve(urlPath) {
    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (decoded.includes('\0')) return null;
    // Hidden files and folders (.git, .claude, .env ...) are never served, nor is `..`.
    if (decoded.split(/[\\/]/).some((part) => part.startsWith('.') && part !== '.')) return null;
    // Windows path tricks: alternate data streams (file::$DATA) and drive letters.
    if (decoded.includes(':')) return null;
    const filePath = normalize(join(this.root, decoded));
    if (filePath !== this.root && !filePath.startsWith(this.root + sep)) return null;
    if (filePath !== this.root && !this.allows(relative(this.root, filePath))) return null;
    if (filePath === this.root && this.folders) return null;
    return filePath;
  }

  /**
   * Checks the file that will really be read. The request path is checked first, but `GIT~1/config`
   * or a link can name a hidden file without a dot, so the real path is checked again.
   */
  async isServable(filePath) {
    this._realRoot ??= await realPathOf(this.root);
    const rel = relative(this._realRoot, await realPathOf(filePath));
    return this.allows(rel);
  }

  /**
   * Answers one request for `url` (a parsed URL). Resolves with the status code sent.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} url
   */
  async serve(req, res, url) {
    let filePath = this.resolve(url.pathname);
    if (!filePath) return sendText(res, 403, 'Forbidden');
    try {
      let info = await stat(filePath);
      if (info.isDirectory()) {
        if (!url.pathname.endsWith('/')) {
          return sendText(res, 302, '', { Location: url.pathname + '/' + url.search });
        }
        filePath = join(filePath, 'index.html');
        info = await stat(filePath);
      }
      if (!info.isFile()) return sendText(res, 404, `Not Found: ${url.pathname}`);
      if (!(await this.isServable(filePath))) return sendText(res, 403, 'Forbidden');
      res.writeHead(200, {
        'Content-Type': contentTypeOf(filePath),
        'Content-Length': info.size,
        'Cache-Control': this.cacheControl,
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end();
      else createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
      return 200;
    } catch {
      return sendText(res, 404, `Not Found: ${url.pathname}`);
    }
  }
}

/** Writes a small text response and returns its status (for request logs). */
export function sendText(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
  return status;
}
