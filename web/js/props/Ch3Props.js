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

/** Box part in a palette colour, placed by its bottom centre. */
function part(factory, colorKey, w, h, d, x, y, z) {
  return factory.part(factory.material(colorKey), w, h, d, x, y, z);
}

export class Ch3Props extends PropSet {
  static id = 'ch3';

  static builders = {
    ch3_ceiling: Ch3Props.ceiling,
    ch3_chair: Ch3Props.chair,
    ch3_partition: Ch3Props.partition,
  };

  /** Ceiling slab; the level places it at ceiling height with a "size". */
  static ceiling(ctx) {
    const slab = ctx.factory.box(ctx.size, 'ch3Ceiling');
    slab.castShadow = false;
    return slab;
  }

  /** Office chair; about half of them have been knocked over. */
  static chair(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h, d } = size;
    const chair = new THREE.Group();
    chair.add(part(factory, 'ch3Chair', w, 0.08, d, 0, h * 0.45, 0));
    chair.add(part(factory, 'ch3Chair', w, h * 0.5, 0.07, 0, h * 0.5, d / 2 - 0.035));
    chair.add(part(factory, 'ch3Chair', 0.07, h * 0.45, 0.07, 0, 0, 0));
    chair.add(part(factory, 'ch3Chair', w * 0.9, 0.04, d * 0.9, 0, 0, 0));
    const group = new THREE.Group();
    if (hash01(prop, 1) < 0.5) {
      chair.rotation.x = 90 * DEG;
      chair.position.set(0, d / 2, -h * 0.4);
    }
    group.add(chair);
    return group;
  }

  /** Cubicle partition: a thin upholstered panel on a kick plate. */
  static partition(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const panel = new THREE.Group();
    panel.add(part(factory, 'ch3Partition', w, h - 0.1, d, 0, 0.1, 0));
    panel.add(part(factory, 'ch3Chair', w, 0.1, d * 0.9, 0, 0, 0));
    return panel;
  }
}
