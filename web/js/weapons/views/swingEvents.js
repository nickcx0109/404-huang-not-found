/** Local presentation events shared by the held weapon and the slash HUD. */
export const SWING_EVENTS = Object.freeze({
  /** The original WEAPON_FIRED detail, for a shot accepted by a view with a swing cue. */
  QUEUED: 'weapon:swing-queued',
  /** { ownerId, cue }, with cue null when the view stops showing the swing. */
  FRAME: 'weapon:swing-frame',
});
