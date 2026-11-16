import * as THREE from 'three';
import { PropSet } from './PropSet.js';
import { Palette } from '../Palette.js';

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

/**
 * Settings of a glowing emitter. When the level is viewed with a palette block that does not
 * define it (e.g. ?palette=blockout), it falls back to that block's accent colour, unlit.
 */
function glowSpec(factory, key) {
  const spec = factory.greybox[key];
  if (spec && typeof spec.color === 'string') return spec;
  const accent = factory.emitters.accent;
  return { color: accent.color, intensity: accent.intensity, light: null };
}

/** Glowing materials of this chapter's emitters, one set per PropFactory. */
const glowMaterials = new WeakMap();

/**
 * Self-lit material for an emitter (palette greybox.<key>): brighter than 1, so it reads
 * through the haze and feeds the bloom. `levelAt(time)` (optional) animates its brightness.
 */
function glowMaterial(factory, key, levelAt) {
  let cache = glowMaterials.get(factory);
  if (!cache) {
    cache = new Map();
    glowMaterials.set(factory, cache);
  }
  let material = cache.get(key);
  if (!material) {
    const spec = glowSpec(factory, key);
    const base = Palette.color(spec.color).multiplyScalar(spec.intensity);
    material = new THREE.MeshBasicMaterial({ color: base.clone() });
    material.name = 'glow:' + key;
    cache.set(key, material);
    if (levelAt) animate(factory, (time) => material.color.copy(base).multiplyScalar(levelAt(time)));
  }
  return material;
}

/**
 * Runs `step(time)` every frame together with the level's other emitters, so a still frame
 * (?shot=, fixed time) always shows the same state. Emitters has no public hook for this yet;
 * if its animation list ever goes away the lights simply stop flickering.
 */
function animate(factory, step) {
  step(0);
  const list = factory.emitters && factory.emitters._animations;
  if (Array.isArray(list)) list.push(step);
}

/**
 * A glowing mesh: not part of the shadow pass. It can still be batched with the others of its
 * material, because flicker is animated on the shared material, not on the mesh.
 */
function glowing(geometry, material) {
  return new THREE.Mesh(geometry, material);
}

/** Box part in a palette colour, placed by its bottom centre. */
function part(factory, colorKey, w, h, d, x, y, z) {
  return factory.part(factory.material(colorKey), w, h, d, x, y, z);
}

/** Stick between two points, for legs, bars and struts. */
function stick(factory, colorKey, from, to, radius, sides) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, sides || 5),
    factory.material(colorKey)
  );
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Ch3Props extends PropSet {
  static id = 'ch3';

  static builders = {
    fuel_barrel: Ch3Props.fuelBarrel,
    server_rack: Ch3Props.serverRack,
    ch3_ceiling: Ch3Props.ceiling,
    ch3_ceiling_lamp: Ch3Props.ceilingLamp,
    ch3_desk: Ch3Props.desk,
    ch3_chair: Ch3Props.chair,
    ch3_partition: Ch3Props.partition,
    ch3_cabinet: Ch3Props.cabinet,
    ch3_papers: Ch3Props.papers,
    ch3_debris: Ch3Props.debris,
  };

  /**
   * Rocket fuel barrel, the thing the players are looking for: a dull drum with a band and
   * a lid in the accent colour, which glow through the haze.
   */
  static fuelBarrel(ctx) {
    const { factory, size } = ctx;
    const radius = Math.min(size.w, size.d) / 2;
    const barrel = new THREE.Group();
    barrel.add(factory.cylinder(size, 'ch3Barrel', 12));
    [0.22, 0.7].forEach((at) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, size.h * 0.05, 12),
        factory.material('ch3BarrelBand')
      );
      band.position.y = size.h * at;
      band.castShadow = true;
      barrel.add(band);
    });
    const accent = factory.emitters.accentMaterial();
    const stripe = glowing(new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, size.h * 0.14, 12, 1, true), accent);
    stripe.position.y = size.h * 0.46;
    barrel.add(stripe);
    const lid = glowing(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, 0.02, 10), accent);
    lid.position.y = size.h + 0.011;
    barrel.add(lid);
    return barrel;
  }

  /** Server rack, dead except for a few status LEDs on its front (-Z). */
  static serverRack(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h, d } = size;
    const rack = new THREE.Group();
    rack.add(factory.box(size, 'ch3Rack'));
    rack.add(part(factory, 'ch3RackTrim', w * 1.02, 0.06, d * 1.02, 0, h, 0));
    rack.add(part(factory, 'ch3RackTrim', w * 0.9, h * 0.9, 0.03, 0, h * 0.05, -d / 2 - 0.015));
    const led = glowMaterial(factory, 'ch3Led');
    const rows = Math.max(3, Math.floor(h / 0.3));
    for (let i = 0; i < rows; i++) {
      if (hash01(prop, 10 + i) < 0.62) continue;
      const lamp = glowing(new THREE.BoxGeometry(0.035, 0.02, 0.02), led);
      lamp.position.set((hash01(prop, 30 + i) - 0.5) * w * 0.7, h * 0.12 + (i / rows) * h * 0.8, -d / 2 - 0.04);
      rack.add(lamp);
    }
    return rack;
  }

  /** Ceiling slab; the level places it at ceiling height with a "size". */
  static ceiling(ctx) {
    const slab = ctx.factory.box(ctx.size, 'ch3Ceiling');
    slab.castShadow = false;
    return slab;
  }

  /** Dead strip light hanging from the ceiling by one end. The origin is at the ceiling. */
  static ceilingLamp(ctx) {
    const { factory, size, prop } = ctx;
    const lamp = new THREE.Group();
    const fixture = part(factory, 'ch3Partition', size.w, 0.07, size.d, 0, 0, 0);
    const drop = hash01(prop, 1) < 0.45;
    if (drop) {
      fixture.position.set(0, -size.w * 0.3, 0);
      fixture.rotation.z = (28 + 22 * hash01(prop, 2)) * DEG;
      lamp.add(stick(factory, 'ch3Chair', v3(size.w * 0.42, 0, 0), v3(size.w * 0.42, -0.12, 0), 0.008, 3));
    } else {
      fixture.position.y = -0.09;
    }
    fixture.castShadow = false;
    lamp.add(fixture);
    return lamp;
  }

  /** Office desk with side panels; some still carry a monitor and a few a lit screen. */
  static desk(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h, d } = size;
    const desk = new THREE.Group();
    desk.add(part(factory, 'ch3Desk', w, 0.05, d, 0, h - 0.05, 0));
    [-1, 1].forEach((side) => desk.add(part(factory, 'ch3Desk', 0.04, h - 0.05, d * 0.94, side * (w / 2 - 0.03), 0, 0)));
    desk.add(part(factory, 'ch3Desk', w * 0.96, h * 0.45, 0.03, 0, h * 0.4, d / 2 - 0.05));
    if (hash01(prop, 1) < 0.6) {
      const tilt = (hash01(prop, 2) - 0.5) * 50 * DEG;
      const monitor = new THREE.Group();
      monitor.add(part(factory, 'ch3Chair', 0.5, 0.32, 0.03, 0, 0.12, 0));
      monitor.add(part(factory, 'ch3Chair', 0.06, 0.12, 0.06, 0, 0, 0.02));
      if (hash01(prop, 3) < 0.25) {
        const screen = glowing(new THREE.BoxGeometry(0.44, 0.26, 0.01), factory.emitters.screenMaterial());
        screen.position.set(0, 0.28, -0.021);
        monitor.add(screen);
      }
      monitor.position.set((hash01(prop, 4) - 0.5) * w * 0.4, h, d * 0.15);
      monitor.rotation.y = tilt;
      desk.add(monitor);
    }
    return desk;
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

  /** Filing cabinet with drawer gaps; the odd drawer hangs open. */
  static cabinet(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h, d } = size;
    const cabinet = new THREE.Group();
    cabinet.add(factory.box(size, 'ch3Cabinet'));
    const drawers = Math.max(2, Math.round(h / 0.45));
    for (let i = 0; i < drawers; i++) {
      const y = (h * i) / drawers;
      cabinet.add(part(factory, 'ch3Chair', w * 0.94, 0.02, 0.02, 0, y + 0.01, -d / 2 - 0.01));
      if (hash01(prop, 10 + i) < 0.22) {
        cabinet.add(part(factory, 'ch3Cabinet', w * 0.9, (h / drawers) * 0.8, d * 0.5, 0, y + 0.04, -d / 2 - d * 0.25));
      }
    }
    return cabinet;
  }

  /** Loose paper all over the floor of the footprint the level gives. */
  static papers(ctx) {
    const { factory, size, prop } = ctx;
    const mess = new THREE.Group();
    const count = 10 + Math.floor(hash01(prop, 1) * 10);
    for (let i = 0; i < count; i++) {
      const sheet = part(
        factory, 'ch3Paper', 0.21, 0.004, 0.3,
        (hash01(prop, 10 + i) - 0.5) * size.w, 0.002 + i * 0.0004, (hash01(prop, 40 + i) - 0.5) * size.d
      );
      sheet.rotation.y = hash01(prop, 70 + i) * Math.PI;
      sheet.castShadow = false;
      mess.add(sheet);
    }
    return mess;
  }

  /** Fallen ceiling tiles and broken board on the floor. */
  static debris(ctx) {
    const { factory, size, prop } = ctx;
    const heap = new THREE.Group();
    const count = 5 + Math.floor(hash01(prop, 1) * 5);
    for (let i = 0; i < count; i++) {
      const w = 0.3 + 0.4 * hash01(prop, 10 + i);
      const piece = part(
        factory, hash01(prop, 20 + i) < 0.5 ? 'ch3Debris' : 'ch3Ceiling', w, 0.04, w * (0.6 + 0.6 * hash01(prop, 30 + i)),
        (hash01(prop, 40 + i) - 0.5) * size.w, 0.02 + hash01(prop, 50 + i) * size.h, (hash01(prop, 60 + i) - 0.5) * size.d
      );
      piece.rotation.set((hash01(prop, 70 + i) - 0.5) * 0.7, hash01(prop, 80 + i) * Math.PI, (hash01(prop, 90 + i) - 0.5) * 0.7);
      heap.add(piece);
    }
    return heap;
  }
}
