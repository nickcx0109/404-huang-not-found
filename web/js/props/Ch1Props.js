import * as THREE from 'three';
import { CommonProps } from './CommonProps.js';
import { PropSet } from './PropSet.js';
import { Palette } from '../Palette.js';

// Ch1Props: greybox stand-ins for chapter 1 (the foggy mountain road).
// Same contract as CommonProps.js: each builder gets { prop, size, factory } and returns an
// Object3D around the origin — metres, +Y up, front toward -Z, origin at bottom centre.
// Colours come from the palette. Use names that say "chapter 1" or are clearly its own
// (tree, guardrail, escape_car, ch1_*); a name may only be registered by one file.
//
// The chapter's three warm lights (camp fire, cabin window, string of bulbs) are built here.
// Their colours and strengths are the palette's greybox.ch1Fire / ch1Window / ch1Bulb.
//
// Chapter 1 files only; shared stand-ins belong in CommonProps.js.
/** Deterministic 0..1 number from a prop's position: a level looks the same on every load. */
function hash01(prop, salt) {
  const s = Math.sin(prop.x * 127.1 + prop.z * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const DEG = Math.PI / 180;

/**
 * Settings of a warm emitter. When the level is viewed with a palette block that does not
 * define it (e.g. ?palette=blockout), it falls back to that block's accent colour, unlit.
 */
function warmSpec(factory, key) {
  const spec = factory.greybox[key];
  if (spec && typeof spec.color === 'string') return spec;
  const accent = factory.emitters.accent;
  return { color: accent.color, intensity: accent.intensity, light: null };
}

/** Glowing materials of the warm emitters, one set per PropFactory. */
const warmMaterials = new WeakMap();

/**
 * Self-lit material for a warm emitter (palette greybox.<key>): brighter than 1, so it reads
 * through the fog and feeds the bloom. `levelAt(time)` (optional) animates its brightness.
 */
function warmMaterial(factory, key, levelAt) {
  let cache = warmMaterials.get(factory);
  if (!cache) {
    cache = new Map();
    warmMaterials.set(factory, cache);
  }
  let material = cache.get(key);
  if (!material) {
    const spec = warmSpec(factory, key);
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
  const spec = warmSpec(factory, key);
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

/** Stick between two points, for logs, poles and wires. */
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

export class Ch1Props extends PropSet {
  static id = 'ch1';

  static builders = {
    tree: Ch1Props.tree,
    escape_car: Ch1Props.escapeCar,
    guardrail: Ch1Props.guardrail,
    guardrail_broken: Ch1Props.guardrailBroken,
    ch1_lane_mark: Ch1Props.laneMark,
    ch1_barrier: Ch1Props.barrier,
    ch1_barrier_fallen: Ch1Props.barrierFallen,
    ch1_car_flipped: Ch1Props.carFlipped,
    ch1_trash: Ch1Props.trash,
    ch1_weeds: Ch1Props.weeds,
    ch1_rock: Ch1Props.rock,
    ch1_log: Ch1Props.log,
    ch1_tire: Ch1Props.tire,
    ch1_tent: Ch1Props.tent,
    ch1_campfire: Ch1Props.campfire,
    ch1_cabin: Ch1Props.cabin,
  };

  /** Bare dead tree: a tapered, leaning trunk with a few leafless, forked branches. */
  static tree(ctx) {
    const { factory, size, prop } = ctx;
    const tree = new THREE.Group();
    const trunk = factory.cylinder(size, 'tree', 6, 0.2);
    trunk.rotation.z = (hash01(prop, 2) - 0.5) * 8 * DEG;
    trunk.rotation.x = (hash01(prop, 3) - 0.5) * 8 * DEG;
    tree.add(trunk);

    const trunkRadius = Math.min(size.w, size.d) / 2;
    const branches = 3 + Math.floor(hash01(prop, 1) * 3);
    for (let i = 0; i < branches; i++) {
      const length = size.h * (0.24 + 0.22 * hash01(prop, 10 + i));
      const geometry = new THREE.CylinderGeometry(0.02, trunkRadius * 0.3, length, 4);
      geometry.translate(0, length / 2, 0);
      const branch = new THREE.Mesh(geometry, factory.material('tree'));
      branch.castShadow = true;
      branch.receiveShadow = true;
      branch.position.y = size.h * (0.4 + 0.45 * hash01(prop, 20 + i));
      branch.rotation.order = 'YXZ';
      branch.rotation.y = hash01(prop, 30 + i) * Math.PI * 2;
      branch.rotation.z = (32 + 38 * hash01(prop, 40 + i)) * DEG;

      // One twig forking off each branch breaks up the silhouette against the fog.
      const twigLength = length * 0.5;
      const twigGeometry = new THREE.CylinderGeometry(0.012, trunkRadius * 0.12, twigLength, 3);
      twigGeometry.translate(0, twigLength / 2, 0);
      const twig = new THREE.Mesh(twigGeometry, factory.material('tree'));
      twig.castShadow = true;
      twig.position.y = length * 0.55;
      twig.rotation.z = -(35 + 25 * hash01(prop, 50 + i)) * DEG;
      branch.add(twig);
      tree.add(branch);
    }
    return tree;
  }

  /**
   * The car the players are looking for: its tail lights glow in the accent colour and
   * throw a little of it onto the road. The lights face +Z (the rear).
   */
  static escapeCar(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const car = CommonProps.carBody(ctx);
    [-1, 1].forEach((side) => {
      const geometry = new THREE.BoxGeometry(w * 0.28, h * 0.11, 0.05);
      const lamp = new THREE.Mesh(geometry, factory.emitters.accentMaterial());
      lamp.position.set(side * w * 0.33, h * 0.5, d / 2 + 0.02);
      car.add(lamp);
    });
    const glow = factory.emitters.accentLight();
    if (glow) {
      glow.position.set(0, h * 0.5, d / 2 + 0.7);
      car.add(glow);
    }
    return car;
  }

  /** Steel guard rail along the longer side of `size`: posts every 2 m and one rail. */
  static guardrail(ctx) {
    return Ch1Props._rail(ctx, false);
  }

  /** Guard rail that something drove through: one end of the rail is bent to the ground. */
  static guardrailBroken(ctx) {
    return Ch1Props._rail(ctx, true);
  }

  static _rail(ctx, broken) {
    const { factory, size } = ctx;
    const alongZ = size.d >= size.w;
    const length = alongZ ? size.d : size.w;
    const rail = new THREE.Group();
    const posts = Math.max(2, Math.round(length / 2) + 1);
    for (let i = 0; i < posts; i++) {
      const at = -length / 2 + (length * i) / (posts - 1);
      const post = part(factory, 'ch1Rail', 0.1, size.h, 0.1, 0, 0, at);
      if (broken && i >= posts - 2) post.rotation.x = 35 * DEG;
      rail.add(post);
    }
    const kept = broken ? length * 0.6 : length;
    rail.add(part(factory, 'ch1Rail', 0.06, 0.28, kept, 0, size.h - 0.34, -length / 2 + kept / 2));
    if (broken) {
      const bent = part(factory, 'ch1Rust', 0.06, 0.28, length * 0.42, 0, 0, 0);
      bent.position.set(0.25, size.h * 0.32, length / 2 - length * 0.2);
      bent.rotation.set(-22 * DEG, 14 * DEG, 0);
      rail.add(bent);
    }
    if (!alongZ) rail.rotation.y = Math.PI / 2;
    const group = new THREE.Group();
    group.add(rail);
    return group;
  }

  /** Worn paint on the road: a flat strip the size the level gives. */
  static laneMark(ctx) {
    const mark = ctx.factory.box(ctx.size, 'ch1RoadLine');
    mark.castShadow = false;
    return mark;
  }

  /** Concrete road barrier with a faded warning stripe. */
  static barrier(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const barrier = new THREE.Group();
    barrier.add(part(factory, 'ch1Barrier', w, h * 0.3, d, 0, 0, 0));
    barrier.add(part(factory, 'ch1Barrier', w, h * 0.7, d * 0.5, 0, h * 0.3, 0));
    barrier.add(part(factory, 'ch1BarrierStripe', w * 0.96, h * 0.16, d * 0.52, 0, h * 0.62, 0));
    return barrier;
  }

  /** The same barrier, knocked onto its side. */
  static barrierFallen(ctx) {
    const { prop, size } = ctx;
    const barrier = Ch1Props.barrier(ctx);
    barrier.rotation.x = (88 + 6 * hash01(prop, 1)) * DEG;
    barrier.position.y = size.d * 0.5;
    const group = new THREE.Group();
    group.add(barrier);
    return group;
  }

  /** A car lying on its roof. */
  static carFlipped(ctx) {
    const { prop, size } = ctx;
    const car = CommonProps.carBody(ctx);
    car.rotation.z = Math.PI + (hash01(prop, 1) - 0.5) * 10 * DEG;
    car.position.y = size.h * 0.98;
    const group = new THREE.Group();
    group.add(car);
    return group;
  }

  /** Litter: bags, boxes and loose sheets scattered over the footprint the level gives. */
  static trash(ctx) {
    const { factory, size, prop } = ctx;
    const pile = new THREE.Group();
    const count = 6 + Math.floor(hash01(prop, 1) * 5);
    for (let i = 0; i < count; i++) {
      const pale = hash01(prop, 10 + i) < 0.35;
      const flat = hash01(prop, 20 + i) < 0.4;
      const w = flat ? 0.3 + 0.3 * hash01(prop, 30 + i) : 0.25 + 0.45 * hash01(prop, 30 + i);
      const h = flat ? 0.02 : 0.15 + size.h * 0.6 * hash01(prop, 40 + i);
      const d = flat ? 0.2 + 0.25 * hash01(prop, 50 + i) : 0.25 + 0.35 * hash01(prop, 50 + i);
      const piece = part(
        factory, pale ? 'ch1TrashPale' : 'ch1Trash', w, h, d,
        (hash01(prop, 60 + i) - 0.5) * size.w, 0, (hash01(prop, 70 + i) - 0.5) * size.d
      );
      piece.rotation.y = hash01(prop, 80 + i) * Math.PI;
      if (!flat) piece.rotation.z = (hash01(prop, 90 + i) - 0.5) * 30 * DEG;
      piece.castShadow = !flat;
      pile.add(piece);
    }
    return pile;
  }

  /** Clump of tall dry weeds: thin blades leaning away from the middle. */
  static weeds(ctx) {
    const { factory, size, prop } = ctx;
    const clump = new THREE.Group();
    const blades = 9 + Math.floor(hash01(prop, 1) * 7);
    for (let i = 0; i < blades; i++) {
      const height = size.h * (0.45 + 0.55 * hash01(prop, 10 + i));
      const geometry = new THREE.ConeGeometry(0.035, height, 3);
      geometry.translate(0, height / 2, 0);
      const blade = new THREE.Mesh(geometry, factory.material('ch1Weed'));
      blade.receiveShadow = true;
      const turn = hash01(prop, 20 + i) * Math.PI * 2;
      const out = hash01(prop, 30 + i);
      blade.position.set(Math.cos(turn) * out * size.w * 0.5, 0, Math.sin(turn) * out * size.d * 0.5);
      blade.rotation.set(Math.sin(turn) * out * 0.5, 0, -Math.cos(turn) * out * 0.5);
      clump.add(blade);
    }
    return clump;
  }

  /** Angular boulder filling the size the level gives. */
  static rock(ctx) {
    const { factory, size, prop } = ctx;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), factory.material('ch1Rock'));
    rock.scale.set(size.w, size.h * 1.3, size.d);
    rock.position.y = size.h * 0.4;
    rock.rotation.set(hash01(prop, 1) * 0.6, hash01(prop, 2) * Math.PI * 2, hash01(prop, 3) * 0.6);
    rock.castShadow = true;
    rock.receiveShadow = true;
    const group = new THREE.Group();
    group.add(rock);
    return group;
  }

  /** Fallen trunk lying along the longer side of `size`, with a couple of broken stubs. */
  static log(ctx) {
    const { factory, size, prop } = ctx;
    const alongZ = size.d >= size.w;
    const length = alongZ ? size.d : size.w;
    const radius = size.h / 2;
    const log = new THREE.Group();
    const v = (a, y, b) => (alongZ ? new THREE.Vector3(b, y, a) : new THREE.Vector3(a, y, b));
    log.add(stick(factory, 'ch1Log', v(-length / 2, radius, 0), v(length / 2, radius * 0.8, 0), radius, 7));
    for (let i = 0; i < 3; i++) {
      const at = (hash01(prop, 10 + i) - 0.5) * length * 0.8;
      const side = hash01(prop, 20 + i) < 0.5 ? -1 : 1;
      log.add(stick(
        factory, 'ch1Log', v(at, radius, 0),
        v(at + 0.3, radius + 0.5 + hash01(prop, 30 + i) * 0.7, side * (0.4 + hash01(prop, 40 + i) * 0.5)),
        radius * 0.22, 4
      ));
    }
    return log;
  }

  /** Loose tyre lying flat. */
  static tire(ctx) {
    const { factory, size, prop } = ctx;
    const radius = Math.min(size.w, size.d) / 2;
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, size.h, 10), factory.material('tire'));
    tyre.position.y = size.h / 2;
    tyre.rotation.z = (hash01(prop, 1) - 0.5) * 12 * DEG;
    tyre.castShadow = true;
    tyre.receiveShadow = true;
    const group = new THREE.Group();
    group.add(tyre);
    return group;
  }

  /** Small ridge tent with its entrance toward the front (-Z); one side has sagged. */
  static tent(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const tent = new THREE.Group();
    const slope = Math.hypot(w / 2, h);
    const lean = Math.atan2(w / 2, h);
    [-1, 1].forEach((side) => {
      const sheet = part(factory, 'ch1Tent', 0.04, slope, d, 0, 0, 0);
      sheet.position.set(side * w * 0.5, 0, 0);
      sheet.rotation.z = side * lean * (side > 0 ? 1.08 : 1);
      tent.add(sheet);
    });
    tent.add(stick(factory, 'ch1Pole', new THREE.Vector3(0, 0, -d / 2), new THREE.Vector3(0, h, -d / 2), 0.025));
    tent.add(stick(factory, 'ch1Pole', new THREE.Vector3(0, 0, d / 2), new THREE.Vector3(0, h * 0.9, d / 2), 0.025));
    tent.add(part(factory, 'ch1CabinDark', w * 0.7, 0.03, d * 0.9, 0, 0.01, 0));
    return tent;
  }

  /**
   * Camp fire: a ring of stones, charred logs and a flame that wavers. Warm light 1 of 3.
   * The flame and its light share one flicker so the ground brightens with the fire.
   */
  static campfire(ctx) {
    const { factory, size } = ctx;
    const spec = warmSpec(factory, 'ch1Fire');
    const radius = Math.min(size.w, size.d) / 2;
    const fire = new THREE.Group();

    for (let i = 0; i < 8; i++) {
      const turn = (i / 8) * Math.PI * 2;
      const stone = part(factory, 'ch1Rock', 0.24, 0.16, 0.2, Math.cos(turn) * radius, 0, Math.sin(turn) * radius);
      stone.rotation.y = -turn;
      fire.add(stone);
    }
    for (let i = 0; i < 4; i++) {
      const turn = (i / 4) * Math.PI * 2 + 0.4;
      fire.add(stick(
        factory, 'ch1Ember',
        new THREE.Vector3(Math.cos(turn) * radius * 0.85, 0.05, Math.sin(turn) * radius * 0.85),
        new THREE.Vector3(-Math.cos(turn) * radius * 0.2, 0.32, -Math.sin(turn) * radius * 0.2),
        0.05
      ));
    }

    const f = spec.flicker || { base: 1, slow: 0, fast: 0 };
    const level = (time) => f.base + f.slow * Math.sin(time * 9.7) + f.fast * Math.sin(time * 23.3 + 1.7);
    const flame = warmMaterial(factory, 'ch1Fire', level);
    [[0, 0.55, 0.2], [0.1, 0.4, 0.13], [-0.09, 0.34, 0.11]].forEach(([x, height, width]) => {
      const geometry = new THREE.ConeGeometry(width, height, 5);
      geometry.translate(0, height / 2, 0);
      const tongue = glowing(geometry, flame);
      tongue.position.set(x, 0.1, x * 0.6);
      fire.add(tongue);
    });
    const embers = glowing(new THREE.CylinderGeometry(radius * 0.55, radius * 0.6, 0.06, 8), flame);
    embers.position.y = 0.05;
    fire.add(embers);

    const light = warmLight(factory, 'ch1Fire', level);
    if (light) {
      light.position.set(0, spec.light.height || 0.7, 0);
      fire.add(light);
    }
    return fire;
  }

  /**
   * Roadside cabin with the power still on in one room: the window and the gap under the
   * door glow orange and light the ground in front. Front (door and window) toward -Z.
   * Warm light 2 of 3.
   */
  static cabin(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const wall = h * 0.68;
    const cabin = new THREE.Group();
    cabin.add(part(factory, 'ch1Cabin', w, wall, d, 0, 0, 0));

    // Pitched roof: two slabs meeting at the ridge, overhanging the walls.
    const rise = h - wall;
    const half = w / 2 + 0.35;
    const slope = Math.hypot(half, rise);
    const pitch = Math.atan2(rise, half);
    [-1, 1].forEach((side) => {
      const slab = part(factory, 'ch1CabinRoof', slope, 0.12, d + 0.7, 0, 0, 0);
      slab.position.set(side * half * 0.5, wall + rise * 0.5 - 0.06, 0);
      slab.rotation.z = -side * pitch;
      cabin.add(slab);
    });
    cabin.add(part(factory, 'ch1Cabin', w * 0.96, rise * 0.55, d * 0.98, 0, wall, 0));

    const front = -d / 2 - 0.02;
    cabin.add(part(factory, 'ch1CabinDark', 0.95, wall * 0.78, 0.06, -w * 0.22, 0, front));
    cabin.add(part(factory, 'ch1CabinRoof', w * 0.5, 0.1, 1.1, -w * 0.2, 0, front - 0.55));

    const glow = warmMaterial(factory, 'ch1Window');
    const windowWidth = Math.min(1.3, w * 0.26);
    const pane = glowing(new THREE.BoxGeometry(windowWidth, wall * 0.3, 0.04), glow);
    pane.position.set(w * 0.2, wall * 0.58, front);
    cabin.add(pane);
    const gap = glowing(new THREE.BoxGeometry(0.85, 0.03, 0.04), glow);
    gap.position.set(-w * 0.22, 0.03, front - 0.03);
    cabin.add(gap);
    // Window bars: two dark strips across the light.
    cabin.add(part(factory, 'ch1CabinDark', 0.05, wall * 0.3, 0.05, w * 0.2, wall * 0.43, front - 0.03));
    cabin.add(part(factory, 'ch1CabinDark', windowWidth, 0.05, 0.05, w * 0.2, wall * 0.56, front - 0.03));

    const light = warmLight(factory, 'ch1Window');
    if (light) {
      light.position.set(w * 0.2, wall * 0.5, front - 1.4);
      cabin.add(light);
    }
    return cabin;
  }
}
