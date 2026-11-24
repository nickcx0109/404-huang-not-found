/** Test doubles for the browser network classes: a manual clock/timer queue and a fake WebSocket. */

export class FakeTime {
  constructor(start = 0) {
    this.time = start;
    this._nextId = 1;
    this._timers = new Map();
    this.now = () => this.time;
    this.timers = {
      setTimeout: (fn, ms) => this._add(fn, ms, null),
      clearTimeout: (id) => this._timers.delete(id),
      setInterval: (fn, ms) => this._add(fn, ms, ms),
      clearInterval: (id) => this._timers.delete(id),
    };
  }

  get pending() {
    return this._timers.size;
  }

  /** Moves time forward, firing due timers in order. */
  advance(ms) {
    const end = this.time + ms;
    for (;;) {
      let due = null;
      for (const [id, timer] of this._timers) {
        if (timer.at <= end && (!due || timer.at < due.timer.at)) due = { id, timer };
      }
      if (!due) break;
      this.time = due.timer.at;
      if (due.timer.every === null) this._timers.delete(due.id);
      else due.timer.at += due.timer.every;
      due.timer.fn();
    }
    this.time = end;
  }

  _add(fn, ms, every) {
    const id = this._nextId++;
    this._timers.set(id, { fn, at: this.time + Math.max(0, ms), every: every === null ? null : Math.max(1, every) });
    return id;
  }
}

export class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  /** Parsed messages the client sent. */
  get messages() {
    return this.sent.map((raw) => JSON.parse(raw));
  }

  send(data) {
    if (this.readyState !== 1) throw new Error('FakeSocket not open');
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  // Server-side controls.
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(message) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  error() {
    this.onerror?.({});
  }

  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

/** Factory that records every socket a client creates. */
export function socketFactory() {
  const sockets = [];
  const create = (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  };
  return { sockets, create, get last() { return sockets.at(-1); } };
}
