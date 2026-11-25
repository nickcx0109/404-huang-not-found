import { Typewriter } from './Typewriter.js';

/** Seconds a captioned shot stays up after its last caption, when it has no `duration`. */
export const CAPTION_TAIL_SECONDS = 0.8;

/**
 * Lays the shots of a cutscene script end to end and answers which shot is
 * on screen at a given time. Pure data: it does not know how a shot is drawn.
 *
 * Script shape: `{ shots: [{ id, type, duration?, captions? }, ...], next? }`.
 * A shot without `duration` must have captions; it lasts until they are done.
 */
export class CutsceneTimeline {
  constructor(script) {
    if (!script || !Array.isArray(script.shots) || script.shots.length === 0) {
      throw new RangeError('Cutscene script needs a non-empty shots array');
    }
    let start = 0;
    const ids = new Set();
    this.entries = script.shots.map((spec, index) => {
      const label = spec?.id ?? `#${index}`;
      if (typeof spec?.type !== 'string' || spec.type.length === 0) {
        throw new RangeError(`Shot ${label} has no type`);
      }
      if (ids.has(label)) throw new RangeError(`Shot id ${label} is used twice`);
      ids.add(label);
      const captions = spec.captions ? Typewriter.fromSpec(spec.captions) : null;
      const duration = spec.duration ?? (captions ? captions.duration + CAPTION_TAIL_SECONDS : undefined);
      if (!(Number.isFinite(duration) && duration > 0)) {
        throw new RangeError(`Shot ${label} needs a positive duration or captions`);
      }
      const entry = { index, id: label, spec, captions, start, duration };
      start += duration;
      return entry;
    });
    this.duration = start;
    this.next = typeof script.next === 'string' ? script.next : null;
  }

  /** `{ entry, local }` for time `t`, or `null` once the cutscene is over. */
  at(t) {
    if (t >= this.duration) return null;
    const time = Math.max(0, t);
    for (const entry of this.entries) {
      if (time < entry.start + entry.duration) return { entry, local: time - entry.start };
    }
    return null;
  }

  /** Start time of the shot with this id, for jumping straight to it. */
  startOf(id) {
    const entry = this.entries.find(e => e.id === id);
    if (!entry) throw new RangeError(`No shot ${id}`);
    return entry.start;
  }
}
