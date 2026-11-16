'use strict';

// Transport only. Gameplay will opt into hello/relay messages in the next phase.
class Net {
  constructor(url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`) {
    this.url = url;
    this.handlers = new Map();
    this.socket = null;
    this.everConnected = false;
    this.failures = 0;
    this.timer = null;
    this.skipReload = false;
    this.on('reload', () => location.reload());
    this.on('css', message => this.replaceCss(message.href));
  }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  send(obj) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(obj));
    return true;
  }
  retry() {
    this.socket = null;
    this.failures++;
    if (!this.everConnected && this.failures >= 3) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), 1000);
  }
  async connect() {
    if (this.socket) return;
    try {
      // A successful HEAD request avoids failed WebSocket console entries on
      // python http.server, which serves the same single-player files.
      const probe = new URL(this.url);
      probe.protocol = probe.protocol === 'wss:' ? 'https:' : 'http:';
      probe.pathname = '/'; probe.search = ''; probe.hash = '';
      const response = await fetch(probe, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (response.headers.get('X-Prototype-Server') !== 'zombie-coop') { this.retry(); return; }
      const socket = this.socket = new WebSocket(this.url);
      socket.onopen = () => {
        this.failures = 0;
        // A refused or abandoned room hello closes the socket on purpose; that reconnect must not reload the page.
        if (this.everConnected) { if (this.skipReload) { this.skipReload = false; return; } location.reload(); return; }
        this.everConnected = true;
      };
      socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!message || typeof message !== 'object') return;
        for (const fn of this.handlers.get(message.t) || []) fn(message);
      };
      socket.onerror = () => {}; // close handles retries; no application error logging.
      socket.onclose = () => this.retry();
    } catch { this.retry(); }
  }
  replaceCss(href) {
    if (typeof href !== 'string') return;
    const target = new URL(href, document.baseURI);
    if (target.origin !== location.origin) return;
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const current = new URL(link.href);
      if (current.origin !== target.origin || current.pathname !== target.pathname) continue;
      current.searchParams.set('v', Date.now());
      link.href = current.href;
    }
  }
}

// The prototype has no favicon asset. Avoid the browser's automatic /favicon.ico
// 404 (including on python http.server) without changing the game or HTML markup.
if (!document.querySelector('link[rel~="icon"]')) {
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
  document.head.append(icon);
}

const net = new Net();
net.connect();
