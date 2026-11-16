import * as THREE from 'three';
import { PropSet } from './PropSet.js';

// Ch3Props: greybox stand-ins for chapter 3 (the blacked-out office tower, server room and
// rooftop launch pad).
// Same contract as CommonProps.js: each builder gets { prop, size, factory } and returns an
// Object3D around the origin — metres, +Y up, front toward -Z, origin at bottom centre.
// Colours come from the palette (factory.material('key') reads greybox.<key>, defined in
// art/style/chapters/ch3.json). A name may only be registered by one file.
//
// Glow in this chapter: fuel barrels wear the accent colour, emergency lamps use the alarm
// colour, and the two warm lights (bin fire, work lamp) plus the rack LEDs are the palette's
// greybox.ch3Fire / ch3Lamp / ch3Led.
//
// Chapter 3 files only; shared stand-ins belong in CommonProps.js.
/** Deterministic 0..1 number from a prop's position: a level looks the same on every load. */
function hash01(prop, salt) {
  const s = Math.sin(prop.x * 127.1 + prop.z * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const DEG = Math.PI / 180;

export class Ch3Props extends PropSet {
  static id = 'ch3';

  static builders = {
    ch3_ceiling: Ch3Props.ceiling,
  };

  /** Ceiling slab; the level places it at ceiling height with a "size". */
  static ceiling(ctx) {
    const slab = ctx.factory.box(ctx.size, 'ch3Ceiling');
    slab.castShadow = false;
    return slab;
  }
}
