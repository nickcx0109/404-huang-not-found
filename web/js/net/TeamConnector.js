import { TeamCode } from './TeamCode.js';

/** Why creating or joining a team failed: a server `error` code or one of the client's own. */
export class TeamError extends Error {
  constructor(code) {
    super('team: ' + code);
    this.name = 'TeamError';
    this.code = code;
  }
}

const defaultTimers = Object.freeze({
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: id => globalThis.clearTimeout(id),
});

/**
 * Turns NetClient's messages into one promise per request: `create` and `join` connect when
 * needed, send once the socket is open and resolve with the server's `room` message. They
 * reject with a TeamError on a server `error` (no-room, full, started, bad-level, ...), when
 * the connection fails or drops first ('connection-failed', 'connection-lost'), or after
 * `timeout` ms without an answer ('timeout').
 */
export class TeamConnector {
  /**
   * @param {NetClient} client
   * @param {{timers?: {setTimeout: Function, clearTimeout: Function}, timeout?: number}} [options]
   */
  constructor(client, { timers = defaultTimers, timeout = 8000 } = {}) {
    this.client = client;
    this.timers = timers;
    this.timeout = timeout;
    this.pending = false;
  }

  create(name, level) {
    return this._request(() => this.client.create(name, level));
  }

  /** `token`: a rejoin token kept from an earlier `room` of this team (RejoinTickets), or null. */
  join(name, code, token = null) {
    if (!TeamCode.isValid(code)) return Promise.reject(new TeamError('bad-code'));
    return this._request(() => this.client.join(name, code, token));
  }

  _request(send) {
    if (this.pending) return Promise.reject(new TeamError('busy'));
    this.pending = true;
    return new Promise((resolve, reject) => {
      const client = this.client;
      const subscriptions = [];
      let sent = false;
      let settled = false;
      let timer = null;
      const finish = (settle, value) => {
        if (settled) return;
        settled = true;
        this.pending = false;
        for (const unsubscribe of subscriptions) unsubscribe();
        if (timer !== null) this.timers.clearTimeout(timer);
        settle(value);
      };
      const sendNow = () => {
        sent = true;
        if (!send()) finish(reject, new TeamError('connection-failed'));
      };
      subscriptions.push(client.on('room', room => finish(resolve, room)));
      subscriptions.push(client.on('error', message => finish(reject, new TeamError(message.code))));
      subscriptions.push(client.on('state', state => {
        if (state === 'open' && !sent) sendNow();
        else if (state === 'reconnecting' || state === 'closed') {
          finish(reject, new TeamError(sent ? 'connection-lost' : 'connection-failed'));
        }
      }));
      timer = this.timers.setTimeout(() => finish(reject, new TeamError('timeout')), this.timeout);
      if (client.isOpen) sendNow();
      else client.connect();
    });
  }
}
