import { Objective } from './Objective.js';

/**
 * Hold out for a fixed time (chapter 2: keep the gate while its lock opens).
 * The clock runs through waves and the breaks between them, and only while someone is still standing.
 */
export class HoldOutObjective extends Objective {
  /** @param {{seconds: number, label?: string, goal?: string}} data */
  constructor({ seconds, label = 'HOLD OUT', goal = 'SURVIVE UNTIL TIME RUNS OUT' }) {
    super();
    if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('Hold-out time must be a positive number of seconds');
    this.seconds = seconds;
    this.label = String(label);
    this._goal = String(goal);
    this.elapsed = 0;
    this._status = { label: this.label, seconds: Math.ceil(seconds) };
  }

  get goal() { return this._goal; }

  get remaining() { return Math.max(0, this.seconds - this.elapsed); }

  get status() {
    this._status.seconds = Math.max(0, Math.ceil(this.remaining - 1e-9));
    return this._status;
  }

  update(dt, session) {
    this.elapsed += dt;
    if (this.remaining <= 1e-9) session.win();
  }
}
