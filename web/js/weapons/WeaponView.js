import { State } from '../core/State.js';
import { StateMachine } from '../core/StateMachine.js';

// WeaponView: how one weapon looks and moves in the player's hands. Looks only: it knows
// nothing about ammunition, damage or hits. Gameplay code tells it what happened
// (equip(), fire(), reload()) and it plays the matching animation.
//
// A weapon is a subclass that fills in the static fields below (see PistolView). To give a
// weapon a different behaviour, e.g. a shotgun loaded one shell at a time, override
// createStates().
//
// No Three.js here: the model only has to offer applyPose(channels).

/** Base of the animation states; says what the weapon may do while it is current. */
export class WeaponState extends State {
  /** @param {WeaponView} view */
  constructor(view) {
    super();
    this.view = view;
  }

  get canFire() { return false; }
  get canReload() { return false; }

  /** Adds this state's part of the pose to `channels`. */
  sample(channels) {} // eslint-disable-line no-unused-vars
}

/** Held ready: nothing plays, everything is allowed. */
export class IdleState extends WeaponState {
  get canFire() { return true; }
  get canReload() { return true; }
}

/** Plays one clip from start to end, then returns to idle. Not interruptible. */
export class ClipState extends WeaponState {
  constructor(view, clip) {
    super(view);
    this.clip = clip;
    this.time = 0;
    /** Playback speed: 2 plays the clip in half its length (a reload that the weapon makes quicker). */
    this.rate = 1;
  }

  enter() {
    this.restart();
  }

  /** Starts the clip again from the top (used when the same state is asked for twice). */
  restart() {
    this.time = 0;
    this.view.announce(this.clip, -1, 0);
  }

  update(dt) {
    const before = this.time;
    this.time += dt * this.rate;
    this.view.announce(this.clip, before, this.time);
    if (this.time >= this.clip.duration) this.view.machine.change(this.view.states.idle);
  }

  sample(channels) {
    this.clip.sample(this.time, channels);
  }
}

/** The fire clip: may be cut short by the next shot once the fire interval has passed. */
export class FireState extends ClipState {
  get canFire() { return this.time >= this.view.constructor.fireInterval; }
  get canReload() { return this.canFire; }
}

export class WeaponView {
  /** Asset id: web/assets/models/<id>.glb. */
  static id = null;
  /** Where the weapon sits in the view when held ready: metres and radians, camera space. */
  static hold = { position: [0, 0, 0], rotation: [0, 0, 0] };
  /**
   * Clips by name. The base states use "equip", "fire" and "reload" (a weapon that never fires
   * or reloads leaves that one out), and showProgress() uses "use".
   */
  static clips = {};
  /** Shortest time between two shots, seconds. */
  static fireInterval = 0.2;
  /** How much the weapon reacts to walking and turning (1 = pistol). Heavier weapons: less. */
  static handling = 1;

  /**
   * @param {{applyPose: function(Object): void}} model
   * @param {EventBus} [events]  receives 'weapon:anim' { weapon, clip, name } at clip events
   */
  constructor(model, events = null) {
    this.model = model;
    this.events = events;
    this.states = this.createStates();
    this.machine = new StateMachine(this);
    this.machine.change(this.states.idle);
    this._sway = { x: 0, y: 0, bob: 0, phase: 0, sprint: 0 };
    this._progress = null;
  }

  /** The states of this weapon, by name. Must include "idle". */
  createStates() {
    const clips = this.constructor.clips;
    return {
      idle: new IdleState(this),
      equip: new ClipState(this, clips.equip),
      fire: clips.fire ? new FireState(this, clips.fire) : null,
      reload: clips.reload ? new ClipState(this, clips.reload) : null,
    };
  }

  get id() { return this.constructor.id; }
  get state() { return this.machine.current; }
  get canFire() { return this.state.canFire; }
  get canReload() { return this.state.canReload; }

  /** Raises the weapon into view. */
  equip() {
    this._play(this.states.equip);
    return true;
  }

  /**
   * Plays one shot. Returns false when the weapon is busy (still cycling, reloading).
   * `force` plays it anyway: the game has already decided that the shot happened.
   */
  fire(force = false) {
    if (!this.states.fire || (!force && !this.canFire)) return false;
    this._play(this.states.fire);
    return true;
  }

  /**
   * Plays the reload. Returns false when the weapon is busy or has no reload clip.
   * @param {number} [seconds]  how long the game's reload takes; the clip is sped up or slowed to fit
   * @param {boolean} [force]  play it even while busy (the game has already started the reload)
   */
  reload(seconds, force = false) {
    const state = this.states.reload;
    if (!state || (!force && !this.canReload)) return false;
    state.rate = seconds > 0 ? state.clip.duration / seconds : 1;
    this._play(state);
    return true;
  }

  /** The game says the reload is done: back to ready even if the clip has not quite ended. */
  finishReload() {
    if (this.states.reload && this.state === this.states.reload) this.machine.change(this.states.idle);
  }

  /**
   * Shows a timed use (a bandage being applied) at `fraction` of the way through, 0..1, with the
   * "use" clip; null ends it. Weapons without a "use" clip ignore it.
   */
  showProgress(fraction) {
    this._progress = this.constructor.clips.use && fraction !== null && fraction !== undefined
      ? Math.max(0, Math.min(1, fraction)) : null;
  }

  /**
   * Advances the animation and poses the model.
   * @param {number} dt seconds
   * @param {number} time seconds on the animation clock
   * @param {{yawRate: number, pitchRate: number, speed: number, sprinting: boolean}} [motion]
   */
  update(dt, time, motion) {
    this.machine.update(dt);
    const channels = {};
    this.state.sample(channels);
    if (this._progress !== null) {
      const use = this.constructor.clips.use;
      use.sample(this._progress * use.duration, channels);
    }
    this.addHandling(channels, dt, time, motion || WeaponView.STILL);
    this.model.applyPose(channels);
    return channels;
  }

  /** Poses the model at one moment of a clip, with nothing else moving (for screenshots). */
  freeze(clipName, time) {
    const clip = this.constructor.clips[clipName];
    if (!clip) throw new Error('Weapon "' + this.id + '" has no clip "' + clipName + '"');
    const channels = clip.sample(time);
    this.model.applyPose(channels);
    return channels;
  }

  /** Called by the states: reports the clip events that happened in (before, now]. */
  announce(clip, before, now) {
    if (!this.events) return;
    for (const name of clip.eventsBetween(before, now)) {
      this.events.emit('weapon:anim', { weapon: this.id, clip: clip.name, name });
    }
  }

  /**
   * The life in a held weapon: breathing, the bob of walking, lagging behind a turn, and
   * dropping out of the way while sprinting. Added on top of whatever clip is playing.
   */
  addHandling(channels, dt, time, motion) {
    const s = this._sway;
    const k = this.constructor.handling;
    const add = (channel, value) => {
      channels[channel] = (channels[channel] || 0) + value;
    };
    const follow = (rate) => 1 - Math.exp(-rate * dt);
    const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

    // turning: the weapon trails the view a little, then catches up
    s.x += (clamp(motion.yawRate * 0.012, 0.05) - s.x) * follow(9);
    s.y += (clamp(motion.pitchRate * 0.012, 0.05) - s.y) * follow(9);
    add('gun.rot.y', s.x * k);
    add('gun.rot.x', -s.y * k);
    add('gun.pos.x', -s.x * 0.25 * k);

    // walking: a sideways figure of eight, stronger with speed
    const walking = Math.min(1, motion.speed / 4.5);
    s.bob += (walking - s.bob) * follow(8);
    s.phase += dt * (5 + motion.speed * 1.1);
    add('gun.pos.x', Math.cos(s.phase) * 0.006 * s.bob * k);
    add('gun.pos.y', -Math.abs(Math.sin(s.phase)) * 0.007 * s.bob * k);

    // sprinting: lowered and turned across the body
    s.sprint += ((motion.sprinting ? 1 : 0) - s.sprint) * follow(7);
    add('gun.rot.y', 0.55 * s.sprint);
    add('gun.rot.x', -0.25 * s.sprint);
    add('gun.pos.y', -0.03 * s.sprint);
    add('gun.pos.x', -0.03 * s.sprint);

    // breathing
    add('gun.pos.y', Math.sin(time * 1.7) * 0.0016);
    add('gun.rot.x', Math.sin(time * 1.7 + 0.8) * 0.004);
  }

  _play(state) {
    if (this.machine.current === state) state.restart();
    else this.machine.change(state);
  }
}

WeaponView.STILL = Object.freeze({ yawRate: 0, pitchRate: 0, speed: 0, sprinting: false });
