import { WebSocketServer, WebSocket } from 'ws';

/** Frames above this are dropped by `ws` itself; MessageParser applies the real (smaller) limit. */
const MAX_FRAME_BYTES = 64 * 1024;

/** Adapts one ws socket to the `send(text)` / `close()` connection the RoomServer expects. */
export class WsConnection {
  constructor(socket) {
    this.socket = socket;
  }

  send(text) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(text);
  }

  close() {
    this.socket.close();
  }
}

/** Real network transport: feeds WebSocket traffic into a RoomServer. */
export class WsTransport {
  /**
   * @param {import('../RoomServer.js').RoomServer} roomServer
   * @param {{ maxPayload?: number, onError?: (error: Error) => void }} [options]
   *   `onError` receives server errors after a successful bind; without one they are logged.
   */
  constructor(roomServer, { maxPayload = MAX_FRAME_BYTES, onError = error => console.error('[ws] server error:', error) } = {}) {
    this.roomServer = roomServer;
    this.maxPayload = maxPayload;
    this.onError = onError;
    this.wss = null;
  }

  /** Starts listening; resolves with the bound port (pass 0 for an ephemeral one), rejects if binding fails. */
  listen(port, host) {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port, host, maxPayload: this.maxPayload });
      wss.once('error', reject);
      wss.once('listening', () => {
        wss.off('error', reject);
        // Keep a listener so a later error is reported instead of crashing the process.
        wss.on('error', error => this.onError(error));
        resolve(wss.address().port);
      });
      wss.on('connection', socket => this.accept(socket));
      this.wss = wss;
    });
  }

  accept(socket) {
    const connection = new WsConnection(socket);
    this.roomServer.connect(connection);
    socket.on('message', (data, isBinary) => {
      this.roomServer.receive(connection, isBinary ? null : data.toString('utf8'));
    });
    socket.on('close', () => this.roomServer.disconnect(connection));
    socket.on('error', () => socket.terminate());
  }

  close() {
    if (!this.wss) return Promise.resolve();
    const wss = this.wss;
    this.wss = null;
    for (const socket of wss.clients) socket.terminate();
    return new Promise(resolve => wss.close(() => resolve()));
  }
}
