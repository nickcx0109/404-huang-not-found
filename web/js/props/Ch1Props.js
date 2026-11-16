import * as THREE from 'three';
import { CommonProps } from './CommonProps.js';
import { PropSet } from './PropSet.js';

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

/** Box part in a palette colour, placed by its bottom centre. */
function part(factory, colorKey, w, h, d, x, y, z) {
  return factory.part(factory.material(colorKey), w, h, d, x, y, z);
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
}
