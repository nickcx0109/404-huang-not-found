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
 * rejoins the last room the server confirmed, under the name the server confirmed and with the
 * rejoin token from that `room` message, so a game in progress takes the same seat back.
 * `leave()` and `disconnect()` end the online session, so a close after either is final.
 *
 * Every state change is announced only after the sockets and timers for that state are in
 * place, so a `state` listener may call disconnect() and nothing keeps running afterwards.
 */
export class NetClient {
  /**
   * @param {object} options
   * @param {string} options.url WebSocket URL, e.g. ws://localhost:8787
   * @param {(url: string) => object} [options.createSocket] WebSocket factory (tests pass a fake)
   * @param {() => number} [options.now] client time source for the default clock, in ms
   * @param {ServerClock} [options.clock] server time estimate; its own client time stamps pings
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
    this._socketOpen = false;
    this._state = CONNECTION_STATES.IDLE;
    this._stateQueue = [];
    this._notifying = false;
    this._wanted = false;
    this._attempts = 0;
    this._reconnectTimer = null;
    this._pingTimer = null;
    this._inputSeq = 0;
    this._actionSeq = 0;
    this._rejoinTarget = null;
    this._rejoinPending = false;
    /** Last `room` message for the current connection, or null when not in a room. */
    this.room = null;
  }

  /** Current connection state (see CONNECTION_STATES). */
  get state() {
    return this._state;
  }

  /** True while the socket is open and messages can be sent. */
  get isOpen() {
    const socket = this._socket;
    return this._socketOpen && socket !== null && (socket.readyState === undefined || socket.readyState === SOCKET_OPEN);
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

  /** Opens the connection. Does nothing while already connecting, reconnecting or open. */
  connect() {
    if (this._wanted) return;
    this._wanted = true;
    this._attempts = 0;
    this._open(CONNECTION_STATES.CONNECTING);
  }

  /** Closes for good without telling the server anything (it notices the close). */
  disconnect() {
    this._wanted = false;
    this._rejoinTarget = null;
    this._rejoinPending = false;
    this._cancelReconnect();
    this._dropSocket(true);
    this._setState(CONNECTION_STATES.CLOSED);
  }

  /** Creates a room. */
  create(name, level) {
    return this._send({ t: CLIENT_MESSAGES.CREATE, name, level });
  }

  /**
   * Joins a room by its 4-character code. With the `token` of a seat in that room (from an
   * earlier `room` message) the server gives that seat back, also during a game.
   */
  join(name, code, token = null) {
    return this._send(NetClient._joinMessage(name, code, token));
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

  /** Sends the locally simulated pose with the next input `seq`; returns false when not sent. */
  sendInput({ x, y, z, yaw, pitch }) {
    if (!this.isOpen) return false;
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) throw new TypeError('NetClient input needs finite x, y, z, yaw, pitch');
    const seq = this._inputSeq + 1;
    const sent = this._send({
      t: CLIENT_MESSAGES.INPUT,
      seq,
      x: roundCoord(x),
      z: roundCoord(z),
      y: roundCoord(y),
      yaw: roundAngle(yaw),
      pitch: roundAngle(pitch),
    });
    if (sent) this._inputSeq = seq;
    return sent;
  }

  /**
   * Sends an action stamped with the estimated server time `at`.
   * `extra` carries kind-specific fields: `index` for switch, `step` for cycle, `holding` for revive.
   */
  action(kind, extra = {}) {
    if (!ACTION_KINDS.includes(kind)) throw new RangeError(`Unknown action kind: ${kind}`);
    if (!this.isOpen) return false;
    const seq = this._actionSeq + 1;
    const sent = this._send({
      ...extra,
      t: CLIENT_MESSAGES.ACTION,
      seq,
      kind,
      at: Math.round(this.clock.now()),
    });
    if (sent) this._actionSeq = seq;
    return sent;
  }

  /** Sends one ping now, stamped with the clock's own client time; pongs feed the clock. */
  ping() {
    return this._send({ t: CLIENT_MESSAGES.PING, c: this.clock.clientNow() });
  }

  _open(state) {
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
    this._setState(state);
  }

  _handleOpen() {
    const reconnected = this._attempts > 0;
    this._attempts = 0;
    this._socketOpen = true;
    this.clock.beginSession(); // The server may have restarted with a different clock.
    this._pingTimer = this._timers.setInterval(() => this.ping(), this._pingInterval);
    this.ping();
    if (reconnected && this._rejoin && this._rejoinTarget) {
      const { name, code, token } = this._rejoinTarget;
      this._rejoinPending = this._send(NetClient._joinMessage(name, code, token));
    }
    this._setState(CONNECTION_STATES.OPEN);
  }

  _handleMessage(data) {
    const message = parseServerMessage(data);
    if (!message) return;
    if (message.t === SERVER_MESSAGES.PONG) {
      this.clock.addSample(message.c, message.s);
      return;
    }
    if (message.t === SERVER_MESSAGES.ROOM) this._confirmRoom(message);
    if (message.t === SERVER_MESSAGES.ERROR && this._rejoinPending) {
      // The server refused the automatic rejoin (room gone, full or started): stop retrying it.
      this._rejoinPending = false;
      this._rejoinTarget = null;
    }
    this._bus.emit(message.t, message);
  }

  _confirmRoom(message) {
    this.room = message;
    this._rejoinPending = false;
    // parseServerMessage guarantees a roster entry for `you` with a string name.
    const me = message.players.find((player) => player.id === message.you);
    this._rejoinTarget = { code: message.code, name: me.name, token: message.token ?? null };
  }

  /** The `join` message; `token` only when there is one, so older servers see the same shape. */
  static _joinMessage(name, code, token) {
    const message = { t: CLIENT_MESSAGES.JOIN, name, code };
    if (typeof token === 'string' && token.length > 0) message.token = token;
    return message;
  }

  _handleClose() {
    this._dropSocket(false);
    if (!this._wanted) {
      this._setState(CONNECTION_STATES.CLOSED);
      return;
    }
    this._scheduleReconnect();
  }

  /** Forgets the current socket and everything tied to it: pings, membership, a pending rejoin. */
  _dropSocket(close) {
    this._stopPing();
    this._socketOpen = false;
    this._rejoinPending = false;
    this.room = null;
    const socket = this._socket;
    this._socket = null;
    if (!socket) return;
    NetClient._detach(socket);
    if (!close) return;
    try {
      socket.close(1000, 'client disconnect');
    } catch {
      // Closing an already closing socket is harmless.
    }
  }

  _scheduleReconnect() {
    if (this._attempts >= this._backoff.maxAttempts) {
      this._wanted = false;
      this._rejoinTarget = null;
      this._setState(CONNECTION_STATES.CLOSED);
      return;
    }
    const { initialDelay, maxDelay, factor } = this._backoff;
    const delay = Math.min(maxDelay, initialDelay * factor ** this._attempts);
    this._attempts++;
    this._reconnectTimer = this._timers.setTimeout(() => {
      this._reconnectTimer = null;
      if (this._wanted) this._open(CONNECTION_STATES.RECONNECTING);
    }, delay);
    this._setState(CONNECTION_STATES.RECONNECTING);
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
    if (!this.isOpen) return false;
    this._socket.send(JSON.stringify(message));
    return true;
  }

  /**
   * Records a transition and notifies listeners one transition at a time: a change made by a
   * listener is queued until every listener has seen the current one, so all of them observe
   * the same ordered sequence and the last delivery always matches `state`.
   */
  _setState(next) {
    if (next === this._state) return;
    this._stateQueue.push([next, this._state]);
    this._state = next;
    if (this._notifying) return;
    this._notifying = true;
    try {
      while (this._stateQueue.length > 0) {
        const [state, previous] = this._stateQueue.shift();
        this._bus.emit(CLIENT_EVENTS.STATE, state, previous);
      }
    } finally {
      this._notifying = false;
      this._stateQueue.length = 0;
    }
  }

  static _detach(socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
  }
}
