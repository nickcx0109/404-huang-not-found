import { EventBus } from '../core/EventBus.js';
import { ServerClock } from './ServerClock.js';
import {
  ACTION_KINDS,
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  parseServerMessage,
  roundAngle,
  roundCoord,
} from './protocol.js';

/** Connection states reported through the `state` listener. */
export const CONNECTION_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  OPEN: 'open',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed',
});

/** Listener types accepted by NetClient#on. */
export const CLIENT_EVENTS = Object.freeze({
  ROOM: 'room',
  ERROR: 'error',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
  STATE: 'state',
});

const SOCKET_OPEN = 1;

const defaultTimers = Object.freeze({
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id),
});

const defaultSocketFactory = (url) => new globalThis.WebSocket(url);

/**
 * Browser end of the co-op protocol (docs/tech/NETWORK.md). Owns one WebSocket at a time,
 * pings to keep a ServerClock in sync, and hands validated server messages to typed listeners.
 *
 * An unexpected close is retried with exponential backoff; after a reconnect the client
 * rejoins the room it was in. `leave()` and `disconnect()` end the online session, so a
 * close after either is final.
 */
export class NetClient {
  /**
   * @param {object} options
   * @param {string} options.url WebSocket URL, e.g. ws://localhost:8787
   * @param {(url: string) => object} [options.createSocket] WebSocket factory (tests pass a fake)
   * @param {() => number} [options.now] client time source in ms
   * @param {ServerClock} [options.clock] server time estimate fed by pongs
   * @param {object} [options.timers] { setTimeout, clearTimeout, setInterval, clearInterval }
   * @param {number} [options.pingInterval] ms between pings while open
   * @param {object} [options.reconnect] { initialDelay, maxDelay, factor, maxAttempts }
   * @param {boolean} [options.rejoin] rejoin the last room after reconnecting
   */
  constructor({
    url,
    createSocket = defaultSocketFactory,
    now = () => Date.now(),
    clock = new ServerClock({ now }),
    timers = defaultTimers,
    pingInterval = 1000,
    reconnect = {},
    rejoin = true,
  } = {}) {
    if (typeof url !== 'string' || url.length === 0) throw new TypeError('NetClient needs a WebSocket url');
    this.url = url;
    this.clock = clock;
    this._createSocket = createSocket;
    this._now = now;
    this._timers = timers;
    this._pingInterval = pingInterval;
    this._backoff = {
      initialDelay: reconnect.initialDelay ?? 500,
      maxDelay: reconnect.maxDelay ?? 8000,
      factor: reconnect.factor ?? 2,
      maxAttempts: reconnect.maxAttempts ?? Infinity,
    };
    this._rejoin = rejoin;
    this._bus = new EventBus();
    this._socket = null;
    this._state = CONNECTION_STATES.IDLE;
    this._wanted = false;
    this._attempts = 0;
    this._reconnectTimer = null;
    this._pingTimer = null;
    this._inputSeq = 0;
    this._actionSeq = 0;
    this._name = null;
    this.room = null;
  }

  /** Current connection state (see CONNECTION_STATES). */
  get state() {
    return this._state;
  }

  /** True while the socket is open and messages can be sent. */
  get isOpen() {
    return this._state === CONNECTION_STATES.OPEN;
  }

  /** Last `seq` used for `input`. */
  get inputSeq() {
    return this._inputSeq;
  }

  /** Last `seq` used for `action`. */
  get actionSeq() {
    return this._actionSeq;
  }

  /** Reconnect attempts since the last successful open. */
  get reconnectAttempts() {
    return this._attempts;
  }

  /** Subscribes to `room`, `error`, `snapshot`, `event` or `state`; returns an unsubscribe function. */
  on(type, listener) {
    if (!Object.values(CLIENT_EVENTS).includes(type)) throw new RangeError(`Unknown NetClient event: ${type}`);
    return this._bus.on(type, listener);
  }

  /** Removes a listener added with on(). */
  off(type, listener) {
    return this._bus.off(type, listener);
  }

  /** Opens the connection. Does nothing while already connecting or open. */
  connect() {
    if (this._wanted && this._state !== CONNECTION_STATES.CLOSED && this._state !== CONNECTION_STATES.IDLE) return;
    this._wanted = true;
    this._attempts = 0;
    this._open(CONNECTION_STATES.CONNECTING);
  }

  /** Closes for good without telling the server anything (it notices the close). */
  disconnect() {
    this._wanted = false;
    this.room = null;
    this._cancelReconnect();
    this._stopPing();
    const socket = this._socket;
    this._socket = null;
    if (socket) {
      NetClient._detach(socket);
      try {
        socket.close(1000, 'client disconnect');
      } catch {
        // Closing an already closing socket is harmless.
      }
    }
    this._setState(CONNECTION_STATES.CLOSED);
  }

  /** Creates a room. */
  create(name, level) {
    this._name = name;
    return this._send({ t: CLIENT_MESSAGES.CREATE, name, level });
  }

  /** Joins a room by its 4-character code. */
  join(name, code) {
    this._name = name;
    return this._send({ t: CLIENT_MESSAGES.JOIN, name, code });
  }

  /** Leaves the room and ends the online session; no reconnect follows. */
  leave() {
    const sent = this._send({ t: CLIENT_MESSAGES.LEAVE });
    this.disconnect();
    return sent;
  }

  /** Asks the server to start the room's game. */
  start() {
    return this._send({ t: CLIENT_MESSAGES.START });
  }

  /** Sends the locally simulated pose with the next input `seq`; returns false when not open. */
  sendInput({ x, y, z, yaw, pitch }) {
    if (!this.isOpen) return false;
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) throw new TypeError('NetClient input needs finite x, y, z, yaw, pitch');
    return this._send({
      t: CLIENT_MESSAGES.INPUT,
      seq: ++this._inputSeq,
      x: roundCoord(x),
      z: roundCoord(z),
      y: roundCoord(y),
      yaw: roundAngle(yaw),
      pitch: roundAngle(pitch),
    });
  }

  /**
   * Sends an action stamped with the estimated server time `at`.
   * `extra` carries kind-specific fields: `index` for switch, `step` for cycle, `holding` for revive.
   */
  action(kind, extra = {}) {
    if (!ACTION_KINDS.includes(kind)) throw new RangeError(`Unknown action kind: ${kind}`);
    if (!this.isOpen) return false;
    return this._send({
      ...extra,
      t: CLIENT_MESSAGES.ACTION,
      seq: ++this._actionSeq,
      kind,
      at: Math.round(this.clock.now()),
    });
  }

  /** Sends one ping now; pongs feed the clock. */
  ping() {
    return this._send({ t: CLIENT_MESSAGES.PING, c: this._now() });
  }

  _open(state) {
    this._setState(state);
    let socket;
    try {
      socket = this._createSocket(this.url);
    } catch {
      this._socket = null;
      this._scheduleReconnect();
      return;
    }
    this._socket = socket;
    socket.onopen = () => this._socket === socket && this._handleOpen();
    socket.onmessage = (event) => this._socket === socket && this._handleMessage(event?.data);
    socket.onclose = () => this._socket === socket && this._handleClose();
    socket.onerror = () => {}; // A close event always follows an error.
  }

  _handleOpen() {
    const reconnected = this._attempts > 0;
    this._attempts = 0;
    this._setState(CONNECTION_STATES.OPEN);
    this.ping();
    this._pingTimer = this._timers.setInterval(() => this.ping(), this._pingInterval);
    if (reconnected && this._rejoin && this.room && this._name !== null) {
      this._send({ t: CLIENT_MESSAGES.JOIN, name: this._name, code: this.room.code });
    }
  }

  _handleMessage(data) {
    const message = parseServerMessage(data);
    if (!message) return;
    if (message.t === SERVER_MESSAGES.PONG) {
      this.clock.addSample(message.c, message.s, this._now());
      return;
    }
    if (message.t === SERVER_MESSAGES.ROOM) this.room = message;
    this._bus.emit(message.t, message);
  }

  _handleClose() {
    this._stopPing();
    NetClient._detach(this._socket);
    this._socket = null;
    if (!this._wanted) {
      this._setState(CONNECTION_STATES.CLOSED);
      return;
    }
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this._attempts >= this._backoff.maxAttempts) {
      this._wanted = false;
      this._setState(CONNECTION_STATES.CLOSED);
      return;
    }
    const { initialDelay, maxDelay, factor } = this._backoff;
    const delay = Math.min(maxDelay, initialDelay * factor ** this._attempts);
    this._attempts++;
    this._setState(CONNECTION_STATES.RECONNECTING);
    this._reconnectTimer = this._timers.setTimeout(() => {
      this._reconnectTimer = null;
      if (this._wanted) this._open(CONNECTION_STATES.RECONNECTING);
    }, delay);
  }

  _cancelReconnect() {
    if (this._reconnectTimer === null) return;
    this._timers.clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
  }

  _stopPing() {
    if (this._pingTimer === null) return;
    this._timers.clearInterval(this._pingTimer);
    this._pingTimer = null;
  }

  _send(message) {
    const socket = this._socket;
    if (!this.isOpen || !socket || (socket.readyState !== undefined && socket.readyState !== SOCKET_OPEN)) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  _setState(next) {
    if (next === this._state) return;
    const previous = this._state;
    this._state = next;
    this._bus.emit(CLIENT_EVENTS.STATE, next, previous);
  }

  static _detach(socket) {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
  }
}
