/**
 * Which co-op server the page talks to. Empty means "no server": the online buttons stay hidden
 * and the game is single player only. Set it when a server is deployed, or pass
 * `?server=ws://host:port` (together with `?play=1`) to try one.
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
