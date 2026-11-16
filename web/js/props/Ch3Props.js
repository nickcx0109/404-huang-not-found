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
    ch3_ceiling: Ch3Props.ceiling,
    ch3_ceiling_lamp: Ch3Props.ceilingLamp,
    ch3_chair: Ch3Props.chair,
    ch3_partition: Ch3Props.partition,
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
