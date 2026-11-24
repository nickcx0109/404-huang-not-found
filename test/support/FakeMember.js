/** Test double: records every message sent to it, like a connection or room member. */
export class FakeMember {
  constructor(label = 'member') {
    this.label = label;
    this.sent = [];
    this.closed = false;
  }

  send(message) {
    this.sent.push(typeof message === 'string' ? JSON.parse(message) : message);
  }

  close() {
    this.closed = true;
  }

  get last() {
    return this.sent.at(-1);
  }

  ofType(t) {
    return this.sent.filter(message => message.t === t);
  }

  clear() {
    this.sent.length = 0;
  }
}
