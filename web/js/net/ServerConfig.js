/**
 * Which co-op server the page talks to. Empty means "no server": the online buttons stay hidden
 * and the game is single player only. Set it when a server is deployed, or pass
 * `?server=ws://host:port` (together with `?play=1`) to try one. A page served by the game
 * server itself needs neither (see pageServerUrl).
 */
export const DEFAULT_SERVER_URL = '';

/**
 * The WebSocket URL to use, or null when none is configured or the text is not a ws:// or
 * wss:// URL.
 * @param {string|null|undefined} value  the `server` URL parameter
 * @param {string} [fallback]  used when `value` is missing or blank
 */
export function resolveServerUrl(value, fallback = DEFAULT_SERVER_URL) {
  const text = String((value ?? '').trim() || fallback || '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
  if (!url.hostname) return null;
  return text;
}

/**
 * The game server (server/main.mjs) adds `<meta name="coop-server" content="same-origin">` to the
 * page it serves, because it also answers WebSockets on the same port. Plain static hosting
 * (tools/serve.mjs, GitHub Pages ...) has no such tag, so nothing is probed there.
 */
export const SERVER_META_NAME = 'coop-server';
export const SAME_ORIGIN = 'same-origin';

/**
 * The server this page itself says to use: `ws://` or `wss://` on the page's own host when the
 * page carries the same-origin tag (https pages get wss), otherwise DEFAULT_SERVER_URL.
 * @param {{ querySelector: (selector: string) => ({ content?: string } | null) } | null | undefined} doc
 * @param {{ protocol: string, host: string } | null | undefined} location
 */
export function pageServerUrl(doc, location) {
  const tag = doc?.querySelector?.(`meta[name="${SERVER_META_NAME}"]`);
  if (tag?.content !== SAME_ORIGIN || !location?.host) return DEFAULT_SERVER_URL;
  if (location.protocol === 'https:') return `wss://${location.host}/`;
  if (location.protocol === 'http:') return `ws://${location.host}/`;
  return DEFAULT_SERVER_URL;
}
