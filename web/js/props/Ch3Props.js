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

/** Point light of a warm emitter: reaches only a few metres. Null when the palette turns it off. */
function warmLight(factory, key, levelAt) {
  const spec = glowSpec(factory, key);
  const cfg = spec.light;
  if (!cfg || !(cfg.intensity > 0)) return null;
  const light = new THREE.PointLight(Palette.color(spec.color), cfg.intensity, cfg.distance, cfg.decay);
  light.name = key + '-light';
  if (levelAt) animate(factory, (time) => { light.intensity = cfg.intensity * levelAt(time); });
  return light;
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
    freight_elevator: Ch3Props.freightElevator,
    rocket: Ch3Props.rocket,
    launch_pad: Ch3Props.launchPad,
    cage: Ch3Props.cage,
    ch3_ceiling: Ch3Props.ceiling,
    ch3_ceiling_lamp: Ch3Props.ceilingLamp,
    ch3_desk: Ch3Props.desk,
    ch3_chair: Ch3Props.chair,
    ch3_partition: Ch3Props.partition,
    ch3_cabinet: Ch3Props.cabinet,
    ch3_papers: Ch3Props.papers,
    ch3_debris: Ch3Props.debris,
    ch3_fire_bin: Ch3Props.fireBin,
    ch3_emergency_light: Ch3Props.emergencyLight,
    ch3_work_lamp: Ch3Props.workLamp,
    ch3_vent: Ch3Props.vent,
    ch3_parapet: Ch3Props.parapet,
    ch3_stairs: Ch3Props.stairs,
    ch3_stair_hole: Ch3Props.stairHole,
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

  /**
   * Freight lift standing open: back and side walls, a lintel, doors slid aside, a hazard
   * strip on the sill and a call panel whose little screen still glows. It carries the fuel
   * barrels from the ground floor to the roof; people take the stairs. Opening toward -Z.
   */
  static freightElevator(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const lift = new THREE.Group();
    const t = 0.14;
    lift.add(part(factory, 'ch3Lift', w, h, t, 0, 0, d / 2 - t / 2));
    [-1, 1].forEach((side) => {
      lift.add(part(factory, 'ch3Lift', t, h, d, side * (w / 2 - t / 2), 0, 0));
      // Door leaves pushed back into the walls, leaving the middle open.
      lift.add(part(factory, 'ch3LiftDark', w * 0.16, h * 0.82, 0.07, side * (w / 2 - w * 0.08 - t), 0, -d / 2 + 0.06));
    });
    lift.add(part(factory, 'ch3Lift', w, h * 0.18, t * 1.5, 0, h * 0.82, -d / 2 + t * 0.75));
    lift.add(part(factory, 'ch3Lift', w, t, d, 0, h - t, 0));
    lift.add(part(factory, 'ch3LiftDark', w - t * 2, 0.03, d - t, 0, 0.005, 0));
    lift.add(part(factory, 'ch3Hazard', w * 0.66, 0.035, 0.28, 0, 0.006, -d / 2 + 0.16));

    // Mesh gate folded against the left wall.
    for (let i = 0; i < 7; i++) {
      const z = -d / 2 + 0.5 + i * 0.13;
      lift.add(stick(factory, 'ch3LiftDark', v3(-w / 2 + t + 0.06, 0.05, z), v3(-w / 2 + t + 0.06, h * 0.8, z), 0.015, 4));
    }

    // Call panel on the right door post: where the "3/10" barrel count will be shown.
    lift.add(part(factory, 'ch3LiftDark', 0.34, 0.5, 0.06, w / 2 - 0.32, 1.1, -d / 2 - 0.03));
    const screen = glowing(new THREE.BoxGeometry(0.22, 0.14, 0.02), factory.emitters.screenMaterial());
    screen.position.set(w / 2 - 0.32, 1.44, -d / 2 - 0.07);
    lift.add(screen);
    return lift;
  }

  /** The rocket: a tall body with a nose cone, dark bands, four fins and an engine bell. */
  static rocket(ctx) {
    const { factory, size } = ctx;
    const radius = Math.min(size.w, size.d) / 2;
    const h = size.h;
    const rocket = new THREE.Group();
    const cylinder = (rTop, rBottom, height, key, y, sides) => {
      const geometry = new THREE.CylinderGeometry(rTop, rBottom, height, sides || 14);
      geometry.translate(0, height / 2, 0);
      const mesh = new THREE.Mesh(geometry, factory.material(key));
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    rocket.add(cylinder(radius * 0.55, radius * 0.8, h * 0.07, 'ch3RocketDark', 0));
    rocket.add(cylinder(radius, radius, h * 0.66, 'ch3Rocket', h * 0.07));
    rocket.add(cylinder(radius * 1.06, radius * 1.06, h * 0.035, 'ch3RocketDark', h * 0.3));
    rocket.add(cylinder(radius * 1.06, radius * 1.06, h * 0.035, 'ch3RocketDark', h * 0.56));
    rocket.add(cylinder(0.02, radius, h * 0.27, 'ch3Rocket', h * 0.73));
    for (let i = 0; i < 4; i++) {
      const turn = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = part(factory, 'ch3RocketDark', 0.1, h * 0.2, radius * 1.1, 0, 0, 0);
      fin.position.set(Math.sin(turn) * radius * 1.35, h * 0.07, Math.cos(turn) * radius * 1.35);
      fin.rotation.y = turn;
      rocket.add(fin);
    }
    return rocket;
  }

  /**
   * Launch pad: a low eight-sided deck with a hazard ring, and a service tower on its left
   * (-X) with an arm reaching toward the rocket in the middle.
   */
  static launchPad(ctx) {
    const { factory, size } = ctx;
    const radius = Math.min(size.w, size.d) / 2;
    const pad = new THREE.Group();
    const disc = (r, height, key, y) => {
      const geometry = new THREE.CylinderGeometry(r, r * 1.03, height, 8);
      geometry.translate(0, height / 2, 0);
      const mesh = new THREE.Mesh(geometry, factory.material(key));
      mesh.position.y = y;
      mesh.rotation.y = Math.PI / 8;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      return mesh;
    };
    pad.add(disc(radius, 0.35, 'ch3Pad', 0));
    pad.add(disc(radius * 0.78, 0.03, 'ch3Hazard', 0.35));
    pad.add(disc(radius * 0.7, 0.04, 'ch3Pad', 0.36));

    const towerX = -radius * 0.82;
    const towerHeight = size.h;
    [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].forEach(([x, z]) => {
      pad.add(stick(factory, 'ch3RocketDark', v3(towerX + x, 0.35, z), v3(towerX + x, towerHeight, z), 0.07, 4));
    });
    for (let y = 2.4; y < towerHeight; y += 2.6) {
      pad.add(part(factory, 'ch3RocketDark', 1.6, 0.08, 1.6, towerX, y, 0));
      pad.add(stick(factory, 'ch3RocketDark', v3(towerX - 0.7, y - 2.2, 0.7), v3(towerX + 0.7, y, 0.7), 0.035, 4));
      pad.add(stick(factory, 'ch3RocketDark', v3(towerX + 0.7, y - 2.2, -0.7), v3(towerX - 0.7, y, -0.7), 0.035, 4));
    }
    pad.add(stick(factory, 'ch3RocketDark', v3(towerX + 0.7, towerHeight * 0.62, 0), v3(-radius * 0.24, towerHeight * 0.6, 0), 0.09, 5));
    return pad;
  }

  /** Steel cage, big enough for one person: bars all round and a flat roof. */
  static cage(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const cage = new THREE.Group();
    cage.add(part(factory, 'ch3Cage', w, 0.08, d, 0, 0, 0));
    cage.add(part(factory, 'ch3Cage', w, 0.08, d, 0, h - 0.08, 0));
    const bars = (count, along, fixed, isX) => {
      for (let i = 0; i <= count; i++) {
        const at = -along / 2 + (along * i) / count;
        const x = isX ? at : fixed;
        const z = isX ? fixed : at;
        cage.add(stick(factory, 'ch3Cage', v3(x, 0.08, z), v3(x, h - 0.08, z), 0.022, 4));
      }
    };
    const perMetre = 5;
    bars(Math.max(4, Math.round(w * perMetre)), w - 0.06, -d / 2 + 0.03, true);
    bars(Math.max(4, Math.round(w * perMetre)), w - 0.06, d / 2 - 0.03, true);
    bars(Math.max(4, Math.round(d * perMetre)), d - 0.06, -w / 2 + 0.03, false);
    bars(Math.max(4, Math.round(d * perMetre)), d - 0.06, w / 2 - 0.03, false);
    return cage;
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

  /**
   * Steel drum someone lit a fire in. Warm light 1 of 2: the flame and its light share one
   * flicker, so the walls brighten and darken with the fire.
   */
  static fireBin(ctx) {
    const { factory, size } = ctx;
    const spec = glowSpec(factory, 'ch3Fire');
    const radius = Math.min(size.w, size.d) / 2;
    const bin = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.92, size.h, 12, 1, true),
      factory.material('ch3Bin')
    );
    shell.material.side = THREE.DoubleSide;
    shell.position.y = size.h / 2;
    shell.castShadow = true;
    bin.add(shell);

    const f = spec.flicker || { base: 1, slow: 0, fast: 0 };
    const level = (time) => f.base + f.slow * Math.sin(time * 9.7) + f.fast * Math.sin(time * 23.3 + 1.7);
    const flame = glowMaterial(factory, 'ch3Fire', level);
    [[0, 0.6, 0.17], [0.09, 0.42, 0.12], [-0.08, 0.36, 0.1]].forEach(([x, height, width]) => {
      const geometry = new THREE.ConeGeometry(width, height, 5);
      geometry.translate(0, height / 2, 0);
      const tongue = glowing(geometry, flame);
      tongue.position.set(x, size.h * 0.8, x * 0.6);
      bin.add(tongue);
    });
    const embers = glowing(new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, 0.05, 10), flame);
    embers.position.y = size.h * 0.8;
    bin.add(embers);

    const light = warmLight(factory, 'ch3Fire', level);
    if (light) {
      light.position.set(0, (spec.light && spec.light.height) || size.h + 0.3, 0);
      bin.add(light);
    }
    return bin;
  }

  /**
   * Wall-mounted emergency lamp: its red lens pulses. Only the first few in a level (palette
   * alarm.light.count) carry a real turning light; the rest only glow. Front toward -Z.
   */
  static emergencyLight(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const lamp = new THREE.Group();
    lamp.add(part(factory, 'ch3Chair', w, h * 0.45, d, 0, 0, 0));
    const lens = glowing(new THREE.BoxGeometry(w * 0.8, h * 0.5, d * 0.8), factory.emitters.alarmMaterial());
    lens.position.set(0, h * 0.7, 0);
    lamp.add(lens);
    const rig = factory.emitters.alarmLight();
    if (rig) {
      rig.position.set(0, h * 0.7, -d);
      lamp.add(rig);
    }
    return lamp;
  }

  /** Battery work lamp on a tripod, pointing toward the front (-Z). Warm light 2 of 2. */
  static workLamp(ctx) {
    const { factory, size } = ctx;
    const h = size.h;
    const lamp = new THREE.Group();
    const top = v3(0, h * 0.86, 0);
    for (let i = 0; i < 3; i++) {
      const turn = (i / 3) * Math.PI * 2 + 0.5;
      lamp.add(stick(factory, 'ch3Chair', v3(Math.cos(turn) * size.w * 0.5, 0, Math.sin(turn) * size.w * 0.5), top, 0.02, 4));
    }
    lamp.add(part(factory, 'ch3Chair', 0.42, 0.26, 0.1, 0, h * 0.84, 0));
    const face = glowing(new THREE.BoxGeometry(0.36, 0.2, 0.02), glowMaterial(factory, 'ch3Lamp'));
    face.position.set(0, h * 0.84 + 0.13, -0.06);
    lamp.add(face);
    const light = warmLight(factory, 'ch3Lamp');
    if (light) {
      light.position.set(0, h * 0.9, -1.2);
      lamp.add(light);
    }
    return lamp;
  }

  /** Rooftop air handler: a big box with a dark fan opening on top. */
  static vent(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const unit = new THREE.Group();
    unit.add(factory.box(size, 'ch3Vent'));
    const fan = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(w, d) * 0.36, Math.min(w, d) * 0.36, 0.06, 12),
      factory.material('ch3LiftDark')
    );
    fan.position.y = h + 0.03;
    unit.add(fan);
    unit.add(part(factory, 'ch3LiftDark', w * 0.8, h * 0.3, 0.03, 0, h * 0.35, -d / 2 - 0.015));
    return unit;
  }

  /** Low wall around the roof edge. */
  static parapet(ctx) {
    return ctx.factory.box(ctx.size, 'ch3Parapet');
  }

  /**
   * One flight of stairs going up: the foot is at the back (+Z) and it rises toward the
   * front (-Z) to the full height of `size`, with a handrail on each side. The engine has no
   * height, so the level blocks the flight with a collider and puts an exit marker at its
   * foot: walking up means loading the next floor.
   */
  static stairs(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const flight = new THREE.Group();
    const steps = Math.max(4, Math.round(h / 0.2));
    const rise = h / steps;
    const run = d / steps;
    for (let i = 0; i < steps; i++) {
      flight.add(part(factory, 'ch3Stair', w, rise * (i + 1), run, 0, 0, d / 2 - run * (i + 0.5)));
    }
    [-1, 1].forEach((side) => {
      const x = side * (w / 2 - 0.04);
      flight.add(stick(factory, 'ch3Chair', v3(x, 0.95, d / 2), v3(x, h + 0.95, -d / 2), 0.025, 4));
      for (let i = 0; i <= 4; i++) {
        const along = i / 4;
        const z = d / 2 - d * along;
        flight.add(stick(factory, 'ch3Chair', v3(x, h * along, z), v3(x, h * along + 0.95, z), 0.018, 4));
      }
    });
    return flight;
  }

  /**
   * Where a flight of stairs comes up through the floor: a black opening with a rail on
   * three sides and a hazard strip on the open end (the front, -Z), where people step off.
   */
  static stairHole(ctx) {
    const { factory, size } = ctx;
    const { w, d } = size;
    const hole = new THREE.Group();
    const dark = part(factory, 'ch3LiftDark', w, 0.02, d, 0, 0.005, 0);
    dark.castShadow = false;
    hole.add(dark);
    hole.add(part(factory, 'ch3Hazard', w, 0.025, 0.2, 0, 0.006, -d / 2 - 0.1));
    const rail = 0.95;
    const corners = [v3(-w / 2, 0, -d / 2), v3(-w / 2, 0, d / 2), v3(w / 2, 0, d / 2), v3(w / 2, 0, -d / 2)];
    for (let i = 0; i < 3; i++) {
      const from = corners[i];
      const to = corners[i + 1];
      const posts = Math.max(2, Math.round(from.distanceTo(to) / 1.1) + 1);
      for (let p = 0; p < posts; p++) {
        const at = from.clone().lerp(to, p / (posts - 1));
        hole.add(stick(factory, 'ch3Chair', at, at.clone().setY(rail), 0.018, 4));
      }
      [rail, rail * 0.5].forEach((y) => {
        hole.add(stick(factory, 'ch3Chair', from.clone().setY(y), to.clone().setY(y), 0.022, 4));
      });
    }
    return hole;
  }
}
