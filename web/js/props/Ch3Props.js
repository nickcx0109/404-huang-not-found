import * as THREE from 'three';
import { PropSet } from './PropSet.js';
import { Palette } from '../Palette.js';
import { DECAL, decalQuad, markMaterial, lightMaterial, signTexture } from './Ch3Decals.js';

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

/** Factories whose surfaces already carry their roughness maps. */
const weathered = new WeakSet();

/**
 * Adds the roughness maps of this chapter's surfaces (palette greybox.surfaces.<key>.rough,
 * painted by art/textures/ch3/generate.py next to the colour texture), so a stain, a bare patch of
 * plaster or a metal rail answers the flashlight differently from the surface around it.
 *
 * PropFactory only knows colour textures. Until it learns about roughness maps this is done here,
 * once per factory, from the first chapter 3 prop that is built; with textures off (&models=0)
 * nothing happens. The load is also entered in the factory's list of pending textures so that a
 * screenshot waits for it; if that list is ever renamed the maps simply show up a moment later.
 */
function weatherSurfaces(factory) {
  if (weathered.has(factory)) return;
  weathered.add(factory);
  const surfaces = factory.greybox.surfaces || {};
  Object.keys(surfaces).forEach((key) => {
    const spec = factory.surface(key);
    if (!spec || !/^[a-z0-9_]+$/.test(spec.rough || '')) return;
    const material = factory.material(key);
    const loaded = new Promise((resolve) => {
      const map = new THREE.TextureLoader().load(
        factory.texturesUrl + spec.rough + '.jpg',
        () => {
          material.roughnessMap = map;
          material.needsUpdate = true;
          resolve();
        },
        undefined,
        () => resolve() // missing file: the surface keeps one even roughness
      );
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = 8;
    });
    if (factory._textures instanceof Map) factory._textures.set('rough:' + spec.rough, { loaded });
  });
}

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

/**
 * Where the next parts start on their tiling texture. Each prop sets it from its own position
 * (seedParts), so two desks side by side do not show the same stain in the same place.
 */
let partShift = 0;
function seedParts(prop) {
  partShift = hash01(prop, 91);
}

/** Box part in a palette colour, placed by its bottom centre. A tiling surface repeats at real size. */
function part(factory, colorKey, w, h, d, x, y, z) {
  const material = factory.material(colorKey);
  const mesh = factory.part(material, w, h, d, x, y, z);
  const metres = material.userData.metres;
  if (metres) {
    factory.constructor.tileBoxUVs(mesh.geometry, { w, h, d }, metres);
    const uv = mesh.geometry.attributes.uv;
    const du = partShift * 7.3 + x * 0.37;
    const dv = partShift * 3.1 + z * 0.53 + y * 0.29;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
  }
  return mesh;
}

/** Upright cylinder (mug, can, pot, bin) in a palette colour, placed by its bottom centre. */
function tube(factory, colorKey, radius, height, x, y, z, sides) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, sides || 8);
  geometry.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, factory.material(colorKey));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Decal materials of this chapter, one set per PropFactory. */
const markSets = new WeakMap();

/**
 * old / faint: dried blood, dark and dull (faint for foot prints that are wearing off);
 * fresh: the one or two places where it is still red and wet enough to catch the flashlight;
 * plain: soot, bullet holes, cracked glass, dried water in their own colours.
 */
function marks(factory) {
  let set = markSets.get(factory);
  if (!set) {
    const colour = (key, fallback) => Palette.color(typeof factory.greybox[key] === 'string' ? factory.greybox[key] : fallback);
    set = {
      old: markMaterial('blood-old', colour('ch3BloodOld', '#8a7470'), 0.95),
      faint: markMaterial('blood-faint', colour('ch3BloodOld', '#8a7470'), 0.95, 0.45),
      fresh: markMaterial('blood-fresh', colour('ch3BloodFresh', '#ffd9cf').multiplyScalar(1.3), 0.16),
      plain: markMaterial('plain', new THREE.Color(1, 1, 1), 0.9),
      lights: new Map(),
      signs: null,
    };
    markSets.set(factory, set);
  }
  return set;
}

/**
 * Faked light lying on a surface, in the colour of a palette emitter (greybox.<key>).
 * It costs no real light: the limit of four stays for the flashlight and the three lamps.
 */
function lightOn(factory, key, strength, levelAt) {
  const set = marks(factory);
  const id = key + ':' + strength + (levelAt ? ':live' : '');
  let material = set.lights.get(id);
  if (!material) {
    const spec = glowSpec(factory, key);
    const base = Palette.color(spec.color).multiplyScalar(spec.intensity * strength);
    material = lightMaterial(id, base.clone());
    set.lights.set(id, material);
    if (levelAt) animate(factory, (time) => material.color.copy(base).multiplyScalar(levelAt(time)));
  }
  return material;
}

/** Material showing the sign image (company sign, whiteboard). */
function signMaterial(factory) {
  const set = marks(factory);
  if (!set.signs) {
    set.signs = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6, metalness: 0 });
    set.signs.name = 'ch3:signs';
  }
  return set.signs;
}

/** Decal on the floor. With turn 0 the top of its image points to -Z; turn spins it (radians). */
function onFloor(cell, w, d, material, x, z, turn, lift) {
  const quad = decalQuad(cell, w, d, material);
  if (material.isMeshBasicMaterial) {
    // Faked light: kept out of the batch and drawn after every mark, so it also falls on
    // the blood and stains lying in it instead of leaving them as black cut-outs.
    quad.userData.dynamic = true;
    quad.renderOrder = 10;
  }
  quad.rotation.set(-Math.PI / 2, 0, turn || 0);
  quad.position.set(x, lift, z);
  return quad;
}

/** Decal on a wall that lies in the prop's own plane and is seen from -Z; (x, y) is its centre. */
function onWall(cell, w, h, material, x, y, out) {
  const quad = decalQuad(cell, w, h, material);
  quad.rotation.y = Math.PI;
  quad.position.set(x, y, -(out || 0.012));
  return quad;
}

/** A tube with a failing starter: mostly on, dipping, sometimes almost out. Never regular. */
function flicker(time) {
  const n = Math.sin(time * 12.9) + Math.sin(time * 7.3 + 1.7) + Math.sin(time * 31.1 + 0.4);
  return n > 0.6 ? 1 : n > -0.5 ? 0.4 : 0.05;
}

/** A candle: small slow waver. */
function waver(time) {
  return 0.82 + 0.12 * Math.sin(time * 5.1) + 0.06 * Math.sin(time * 17.3 + 1.1);
}

/** The pieces of an office chair standing on the origin. */
function chairBody(factory, w, h, d) {
  const chair = new THREE.Group();
  chair.add(part(factory, 'ch3Chair', w, 0.08, d, 0, h * 0.45, 0));
  const back = part(factory, 'ch3Chair', w * 0.92, h * 0.48, 0.06, 0, h * 0.54, d / 2 - 0.03);
  back.rotation.x = 0.1;
  chair.add(back);
  chair.add(part(factory, 'ch3Plastic', 0.06, h * 0.4, 0.06, 0, 0.05, 0));
  [0, 1].forEach((i) => {
    const foot = part(factory, 'ch3Plastic', w * 1.05, 0.035, 0.06, 0, 0.02, 0);
    foot.rotation.y = (i * Math.PI) / 2 + 0.4;
    chair.add(foot);
  });
  [-1, 1].forEach((side) => chair.add(part(factory, 'ch3Plastic', 0.05, 0.03, d * 0.6, side * (w / 2 + 0.01), h * 0.66, 0)));
  return chair;
}

/** A flat monitor on its foot, screen toward -Z. */
function monitorBody(factory, lit, cracked) {
  const monitor = new THREE.Group();
  monitor.add(part(factory, 'ch3Plastic', 0.52, 0.32, 0.035, 0, 0.13, 0));
  monitor.add(part(factory, 'ch3Plastic', 0.05, 0.13, 0.05, 0, 0, 0.03));
  monitor.add(part(factory, 'ch3Plastic', 0.22, 0.012, 0.16, 0, 0, 0.03));
  if (lit) {
    const screen = glowing(new THREE.BoxGeometry(0.47, 0.27, 0.008), factory.emitters.screenMaterial());
    screen.position.set(0, 0.29, -0.02);
    monitor.add(screen);
  }
  if (cracked) {
    const crack = decalQuad(DECAL.cracks, 0.47, 0.27, marks(factory).plain);
    crack.rotation.y = Math.PI;
    crack.position.set(0, 0.29, -0.027);
    monitor.add(crack);
  }
  return monitor;
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

/**
 * Dust in the torch beam. A prop builder is never told about the camera, so this adds a mesh that
 * draws nothing: Three.js calls its onBeforeRender with the camera every frame, and that is where
 * the haze is moved in front of the torch and the specks are told where the beam is.
 * The specks are everywhere in the room but only light up inside the beam.
 */
function torchAir(factory) {
  const air = new THREE.Group();
  air.name = 'ch3:torch-air';
  const state = { time: 0 };
  animate(factory, (time) => { state.time = time; });
  const spec = glowSpec(factory, 'ch3Torch');
  const color = Palette.color(spec.color).multiplyScalar(spec.intensity);

  const SPECKS = 1100;
  const BOX = 22;
  const positions = new Float32Array(SPECKS * 3);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < SPECKS; i++) {
    positions[i * 3] = (rnd() - 0.5) * BOX;
    positions[i * 3 + 1] = rnd() * 3.1;
    positions[i * 3 + 2] = (rnd() - 0.5) * BOX;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBeam: { value: 0 }, uColor: { value: color.clone() }, uEye: { value: new THREE.Vector3() }, uBox: { value: BOX } },
    vertexShader: [
      'uniform float uTime; uniform vec3 uEye; uniform float uBox;',
      'varying float vLit;',
      'void main() {',
      '  vec3 p = position;',
      '  p.x += sin( uTime * 0.13 + position.y * 3.1 ) * 0.25;',
      '  p.y += sin( uTime * 0.11 + position.x * 2.3 ) * 0.15 - uTime * 0.012;',
      '  p.z += cos( uTime * 0.12 + position.y * 2.7 ) * 0.25;',
      '  p.xz = mod( p.xz - uEye.xz + uBox * 0.5, uBox ) - uBox * 0.5 + uEye.xz;',
      '  p.y = mod( p.y, 3.1 );',
      '  vec4 mv = viewMatrix * vec4( p, 1.0 );',
      '  float dist = -mv.z;',
      '  float along = dot( normalize( mv.xyz ), vec3( 0.0, 0.0, -1.0 ) );',
      '  vLit = smoothstep( 0.948, 0.985, along ) * smoothstep( 11.0, 1.5, dist ) * step( 0.35, dist );',
      '  gl_PointSize = clamp( 14.0 / max( dist, 0.35 ), 1.0, 3.5 );',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColor; uniform float uBeam;',
      'varying float vLit;',
      'void main() {',
      '  float round = smoothstep( 0.5, 0.1, length( gl_PointCoord - 0.5 ) );',
      '  gl_FragColor = vec4( uColor * 0.4 * vLit * uBeam * round, 1.0 );',
      '}',
    ].join('\n'),
  });
  material.name = 'ch3:dust-in-beam';
  const specks = new THREE.Points(geometry, material);
  specks.frustumCulled = false;
  specks.userData.dynamic = true;
  specks.renderOrder = 21;
  air.add(specks);

  const driver = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false })
  );
  driver.frustumCulled = false;
  driver.userData.dynamic = true;
  driver.renderOrder = -100;
  driver.onBeforeRender = (renderer, scene, camera) => {
    let torch = null;
    for (const child of camera.children) if (child.isSpotLight) torch = child;
    material.uniforms.uTime.value = state.time;
    material.uniforms.uBeam.value = torch && torch.intensity > 0 ? 1 : 0;
    material.uniforms.uEye.value.copy(camera.position);
  };
  air.add(driver);
  return air;
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
    ch3_blood_pool: Ch3Props.bloodPool,
    ch3_blood_trail: Ch3Props.bloodTrail,
    ch3_blood_smear: Ch3Props.bloodSmear,
    ch3_desk_flipped: Ch3Props.deskFlipped,
    ch3_partition_broken: Ch3Props.partitionBroken,
    ch3_ceiling_fallen: Ch3Props.ceilingFallen,
    ch3_cables: Ch3Props.cables,
    ch3_rubble: Ch3Props.rubble,
    ch3_glass: Ch3Props.glass,
    ch3_boards: Ch3Props.boards,
    ch3_barricade: Ch3Props.barricade,
    ch3_exit_sign: Ch3Props.exitSign,
    ch3_window: Ch3Props.window,
    ch3_tile_floor: Ch3Props.tileFloor,
    ch3_scorch: Ch3Props.scorch,
    ch3_bullet_holes: Ch3Props.bulletHoles,
    ch3_copier: Ch3Props.copier,
    ch3_vending: Ch3Props.vending,
    ch3_water_cooler: Ch3Props.waterCooler,
    ch3_sofa: Ch3Props.sofa,
    ch3_whiteboard: Ch3Props.whiteboard,
    ch3_logo_wall: Ch3Props.logoWall,
    ch3_clock: Ch3Props.clock,
    ch3_camp: Ch3Props.camp,
    ch3_box_pile: Ch3Props.boxPile,
    ch3_door_broken: Ch3Props.doorBroken,
    ch3_extinguisher: Ch3Props.extinguisher,
    ch3_trash: Ch3Props.trash,
    ch3_glass_wall: Ch3Props.glassWall,
    ch3_tape: Ch3Props.tape,
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

  /**
   * Suspended ceiling. About one tile in six is gone, in patches rather than evenly: the hole
   * shows the black space above, some tiles still hang by one edge, and wires dangle from others.
   */
  static ceiling(ctx) {
    const { factory, size, prop } = ctx;
    weatherSurfaces(factory);
    seedParts(prop);
    const ceiling = new THREE.Group();
    const slab = factory.box(size, 'ch3Ceiling');
    slab.castShadow = false;
    ceiling.add(slab);
    // every office floor has one ceiling, so this is also where the dust in the torch beam is hung
    ceiling.add(torchAir(factory));
    const cell = 0.6;
    const columns = Math.floor(size.w / cell);
    const rows = Math.floor(size.d / cell);
    const at = (a, b, salt) => {
      const s = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7 + prop.y * 13.3) * 43758.5453;
      return s - Math.floor(s);
    };
    const dark = factory.material('ch3Void');
    for (let ix = 0; ix < columns; ix++) {
      for (let iz = 0; iz < rows; iz++) {
        const patch = at(Math.floor(ix / 4), Math.floor(iz / 4), 1) > 0.74;
        if (at(ix, iz, 2) > (patch ? 0.5 : 0.04)) continue;
        const x = (ix + 0.5) * cell - size.w / 2;
        const z = (iz + 0.5) * cell - size.d / 2;
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(cell * 0.95, cell * 0.95), dark);
        hole.rotation.x = Math.PI / 2;
        hole.position.set(x, -0.004, z);
        ceiling.add(hole);
        const kind = at(ix, iz, 3);
        if (kind < 0.3) {
          const tile = part(factory, 'ch3Ceiling', cell * 0.95, 0.015, cell * 0.95, 0, -0.015, cell * 0.475);
          tile.castShadow = false;
          const hinge = new THREE.Group();
          hinge.position.set(x, -0.005, z - cell * 0.475);
          hinge.rotation.set((25 + 55 * at(ix, iz, 4)) * DEG, 0, (at(ix, iz, 5) - 0.5) * 0.5);
          hinge.add(tile);
          ceiling.add(hinge);
        } else if (kind < 0.52) {
          const wires = 1 + Math.floor(at(ix, iz, 6) * 3);
          for (let i = 0; i < wires; i++) {
            const wx = x + (at(ix, iz, 10 + i) - 0.5) * 0.4;
            const wz = z + (at(ix, iz, 20 + i) - 0.5) * 0.4;
            const length = 0.25 + 0.95 * at(ix, iz, 30 + i);
            const wire = stick(
              factory, 'ch3Cable', v3(wx, 0, wz),
              v3(wx + (at(ix, iz, 40 + i) - 0.5) * 0.35, -length, wz + (at(ix, iz, 50 + i) - 0.5) * 0.35), 0.007, 3
            );
            wire.castShadow = false;
            ceiling.add(wire);
          }
        }
      }
    }
    return ceiling;
  }

  /**
   * Strip light in the ceiling grid; the origin is at the ceiling. Most are dead. About one in
   * ten still burns, cold and weak, one in twenty stutters, and some hang by one end.
   * A burning tube is only a glowing surface plus a faked pool of light on the floor: no real light.
   */
  static ceilingLamp(ctx) {
    const { factory, size, prop } = ctx;
    seedParts(prop);
    const lamp = new THREE.Group();
    const body = new THREE.Group();
    const housing = part(factory, 'ch3Cabinet', size.w, 0.06, size.d, 0, 0, 0);
    housing.castShadow = false;
    body.add(housing);
    const state = hash01(prop, 7);
    const lit = state < 0.11;
    const stutter = !lit && state < 0.17;
    const geometry = new THREE.BoxGeometry(size.w * 0.92, 0.025, size.d * 0.5);
    let strip;
    if (lit) strip = glowing(geometry, glowMaterial(factory, 'ch3Tube'));
    else if (stutter) strip = glowing(geometry, glowMaterial(factory, 'ch3TubeFaint', (time) => 3 * flicker(time)));
    else strip = new THREE.Mesh(geometry, factory.material('ch3Ceramic'));
    strip.position.y = -0.012;
    body.add(strip);
    if (hash01(prop, 1) < 0.16) {
      body.position.set(0, -size.w * 0.3, 0);
      body.rotation.z = (28 + 22 * hash01(prop, 2)) * DEG;
      lamp.add(stick(factory, 'ch3Cable', v3(size.w * 0.42, 0, 0), v3(size.w * 0.42, -0.12, 0), 0.008, 3));
    } else {
      body.position.y = -0.09;
    }
    lamp.add(body);
    if (lit) lamp.add(onFloor(DECAL.glow, 7.5, 7.5, lightOn(factory, 'ch3Tube', 0.1), 0, 0, 0, 0.022 - prop.y));
    if (stutter) lamp.add(onFloor(DECAL.glow, 7.5, 7.5, lightOn(factory, 'ch3TubeFaint', 0.32, flicker), 0, 0, 0, 0.023 - prop.y));
    return lamp;
  }

  /**
   * A work place: desk with a drawer unit and the computer under it, and on top whatever its owner
   * left when they ran: monitor, keyboard, mouse, phone and two or three things of their own.
   * What is there, what has fallen and where it lies comes from the desk's position, so it is the
   * same on every load and different on every desk. The sitter's side is -Z.
   */
  static desk(ctx) {
    const { factory, size, prop } = ctx;
    seedParts(prop);
    const { w, h, d } = size;
    const r = (salt) => hash01(prop, salt);
    const desk = new THREE.Group();
    desk.add(part(factory, 'ch3Desk', w, 0.05, d, 0, h - 0.05, 0));
    [-1, 1].forEach((side) => desk.add(part(factory, 'ch3Desk', 0.04, h - 0.05, d * 0.94, side * (w / 2 - 0.03), 0, 0)));
    desk.add(part(factory, 'ch3Desk', w * 0.96, h * 0.45, 0.03, 0, h * 0.4, d / 2 - 0.05));

    const side = r(5) < 0.5 ? -1 : 1;
    desk.add(part(factory, 'ch3Cabinet', 0.4, h * 0.6, d * 0.8, side * (w / 2 - 0.27), 0.02, 0.02));
    if (r(6) < 0.6) { // a drawer left pulled out
      const drawer = part(factory, 'ch3Cabinet', 0.36, 0.13, d * 0.7, side * (w / 2 - 0.27), h * 0.34, -(0.1 + 0.3 * r(7)));
      drawer.rotation.y = (r(8) - 0.5) * 0.14;
      desk.add(drawer);
    }
    const tower = part(factory, 'ch3Plastic', 0.18, 0.42, 0.44, -side * (w / 2 - 0.22), 0, 0.05);
    if (r(9) < 0.25) { // kicked over and out from under the desk
      tower.rotation.set(0, r(12) * 3, Math.PI / 2 + (r(10) - 0.5) * 0.3);
      tower.position.set(-side * (w / 2 - 0.3), 0.09, -d / 2 - 0.3 * r(11));
    }
    desk.add(tower);

    const fate = r(1);
    const lit = r(3) < 0.22;
    const cracked = r(13) < 0.4;
    if (fate < 0.52) {
      const monitor = monitorBody(factory, lit, cracked);
      monitor.position.set((r(4) - 0.5) * w * 0.35, h, d * 0.18);
      monitor.rotation.y = (r(2) - 0.5) * 50 * DEG;
      desk.add(monitor);
      // the screen's glow on the desk top in front of it
      if (lit) desk.add(onFloor(DECAL.glow, 1.3, 1.0, lightOn(factory, 'ch3Tube', 0.12), monitor.position.x, -0.05, 0, h + 0.004));
    } else if (fate < 0.66) { // pushed over, face down on the desk
      const monitor = monitorBody(factory, false, cracked);
      monitor.rotation.set(-Math.PI / 2 + 0.06, (r(2) - 0.5) * 1.2, 0);
      monitor.position.set((r(4) - 0.5) * w * 0.3, h + 0.04, d * 0.22);
      desk.add(monitor);
    } else if (fate < 0.77) { // on the floor in front of the desk
      const monitor = monitorBody(factory, false, true);
      monitor.rotation.set(-Math.PI / 2 + (r(14) - 0.5) * 0.3, r(2) * 6, (r(15) - 0.5) * 0.5);
      monitor.position.set((r(4) - 0.5) * w * 0.6, 0.04, -d / 2 - 0.35 - 0.5 * r(16));
      desk.add(monitor);
    }

    const put = (mesh, x, z, turn) => {
      mesh.position.x = x;
      mesh.position.z = z;
      mesh.position.y += h;
      mesh.rotation.y = turn;
      desk.add(mesh);
      return mesh;
    };
    if (r(20) < 0.85) {
      const keyboard = put(part(factory, 'ch3Plastic', 0.44, 0.02, 0.14, 0, 0, 0), (r(21) - 0.5) * w * 0.3, -d * 0.22, (r(22) - 0.5) * 0.7);
      if (r(23) < 0.18) { // half off the edge, hanging by its cable
        keyboard.rotation.x = -1.1;
        keyboard.position.set(keyboard.position.x, h - 0.09, -d / 2 - 0.03);
      }
    }
    if (r(24) < 0.8) put(part(factory, 'ch3Plastic', 0.06, 0.03, 0.1, 0, 0, 0), side * w * 0.3, -d * 0.2 + (r(25) - 0.5) * 0.2, r(26) * 3);
    if (r(27) < 0.7) {
      const px = -side * w * 0.34;
      put(part(factory, 'ch3Plastic', 0.16, 0.05, 0.2, 0, 0, 0), px, d * 0.05, (r(28) - 0.5) * 0.8);
      const handset = part(factory, 'ch3Plastic', 0.05, 0.04, 0.2, 0, 0.05, 0);
      if (r(29) < 0.5) put(handset, px - 0.05, d * 0.05, (r(28) - 0.5) * 0.8);
      else { handset.position.y = 0; put(handset, px + 0.16, -d * 0.1 - 0.1 * r(17), r(18) * 3); } // off the hook
    }
    // things of their own: usually two or three of these five
    if (r(30) < 0.6) {
      const mug = tube(factory, 'ch3Ceramic', 0.04, 0.09, 0, 0, 0);
      put(mug, (r(35) - 0.5) * w * 0.7, (r(36) - 0.3) * d * 0.5, 0);
      if (r(37) < 0.3) { mug.rotation.z = Math.PI / 2; mug.position.y = h + 0.04; }
    }
    if (r(31) < 0.55) {
      const fx = (r(38) - 0.5) * w * 0.6;
      const sheets = 2 + Math.floor(r(39) * 3);
      for (let i = 0; i < sheets; i++) {
        put(part(factory, i % 2 ? 'ch3Paper' : 'ch3Cabinet', 0.24, 0.016, 0.32, 0, i * 0.016, 0), fx + (r(60 + i) - 0.5) * 0.06, d * 0.22, (r(63 + i) - 0.5) * 0.6);
      }
    }
    if (r(32) < 0.45) { // a pot plant, long dead
      const plant = new THREE.Group();
      plant.add(tube(factory, 'ch3Ceramic', 0.07, 0.12, 0, 0, 0));
      for (let i = 0; i < 5; i++) {
        plant.add(stick(factory, 'ch3Soil', v3(0, 0.1, 0), v3((r(70 + i) - 0.5) * 0.3, 0.2 + 0.25 * r(75 + i), (r(80 + i) - 0.5) * 0.3), 0.005, 3));
      }
      put(plant, w * 0.38 * (r(41) < 0.5 ? -1 : 1), d * 0.25, 0);
      if (r(42) < 0.4) { // knocked over, soil spilled
        plant.rotation.z = Math.PI / 2 - 0.1;
        plant.position.y = h + 0.07;
        const soil = tube(factory, 'ch3Soil', 0.14, 0.006, 0, 0, 0, 9);
        soil.scale.z = 0.6;
        put(soil, plant.position.x - 0.16, plant.position.z + 0.03, r(43) * 3);
      }
    }
    if (r(33) < 0.45) {
      const frame = part(factory, 'ch3Plastic', 0.13, 0.18, 0.015, 0, 0, 0);
      put(frame, (r(44) - 0.5) * w * 0.7, d * 0.3, (r(45) - 0.5) * 0.8);
      if (r(46) < 0.45) { frame.rotation.x = Math.PI / 2; frame.position.y = h + 0.012; } else frame.rotation.x = 0.25;
    }
    // months of dust over everything; on a few desks somebody bled over the keyboard
    desk.add(onFloor(DECAL.grime, w * 0.95, d * 0.9, marks(factory).plain, 0, 0, r(111) * 6, h + 0.003));
    if (r(110) < 0.16) {
      desk.add(onFloor(r(112) < 0.5 ? DECAL.splatterA : DECAL.splatterB, 1.0, 1.0, marks(factory).old, (r(113) - 0.5) * w * 0.3, -d * 0.15, r(114) * 6, h + 0.026));
    }
    const loose = 2 + Math.floor(r(34) * 5);
    for (let i = 0; i < loose; i++) {
      const sheet = put(part(factory, 'ch3Paper', 0.21, 0.003, 0.3, 0, 0.002 + i * 0.001, 0), (r(90 + i) - 0.5) * w * 0.8, (r(96 + i) - 0.5) * d * 0.7, r(102 + i) * 3);
      sheet.castShadow = false;
    }
    if (r(40) < 0.1) { // somebody put a chair upside down on it and never took it off again
      const chair = chairBody(factory, 0.5, 0.95, 0.5);
      chair.rotation.set(Math.PI, r(47) * 6, (r(48) - 0.5) * 0.2);
      chair.position.set((r(49) - 0.5) * w * 0.3, h + 0.51, 0);
      desk.add(chair);
    }
    // shoved a little out of line, like everything else here
    desk.rotation.y = (r(55) - 0.5) * 0.2;
    desk.position.set((r(56) - 0.5) * 0.12, 0, (r(57) - 0.5) * 0.12);
    const shoved = new THREE.Group();
    shoved.add(desk);
    return shoved;
  }

  /**
   * Office chair. A little over half still stand, turned and pushed away from where they belong;
   * the rest lie on their side, on their back, or with the legs in the air, each at its own angle.
   */
  static chair(ctx) {
    const { factory, size, prop } = ctx;
    seedParts(prop);
    const { w, h, d } = size;
    const r = (salt) => hash01(prop, salt);
    const lean = (salt) => (r(salt) - 0.5) * 0.4;
    const chair = chairBody(factory, w, h, d);
    const fate = r(1);
    const spin = r(2) * Math.PI * 2;
    if (fate < 0.58) {
      chair.rotation.y = spin;
      chair.position.set(lean(3) * 0.8, 0, lean(4) * 0.8);
      if (r(5) < 0.3) { // a coat still over the back
        const coat = part(factory, 'ch3Cloth', w * 0.98, h * 0.42, 0.11, 0, h * 0.58, d / 2 - 0.02);
        coat.rotation.set(0.1, 0, lean(6) * 0.3);
        chair.add(coat);
      } else if (r(13) < 0.18) { // somebody was sitting here when it happened
        const stain = decalQuad(DECAL.wipe, w * 0.85, h * 0.42, marks(factory).old);
        stain.rotation.set(0.1, Math.PI, 0);
        stain.position.set(0, h * 0.78, d / 2 - 0.075);
        chair.add(stain);
      }
    } else if (fate < 0.8) {
      chair.rotation.set(lean(6), spin, (r(7) < 0.5 ? 1 : -1) * (Math.PI / 2 + lean(8) * 0.4));
      chair.position.y = w / 2;
    } else if (fate < 0.9) {
      chair.rotation.set(Math.PI / 2 + lean(9) * 0.5, spin, lean(10));
      chair.position.y = d / 2;
    } else {
      chair.rotation.set(Math.PI + lean(11) * 0.5, spin, lean(12) * 0.5);
      chair.position.y = h;
    }
    const group = new THREE.Group();
    group.add(chair);
    return group;
  }

  /** Cubicle partition: a thin upholstered panel on a kick plate. */
  static partition(ctx) {
    const { factory, size, prop } = ctx;
    seedParts(prop);
    const { w, h, d } = size;
    const panel = new THREE.Group();
    panel.add(part(factory, 'ch3Partition', w, h - 0.1, d, 0, 0.1, 0));
    panel.add(part(factory, 'ch3Chair', w, 0.1, d * 0.9, 0, 0, 0));
    // leaning and turned a few degrees: nobody has straightened these since
    panel.rotation.set(0, (hash01(prop, 61) - 0.5) * 0.12, (hash01(prop, 62) - 0.5) * 0.07);
    const shoved = new THREE.Group();
    shoved.add(panel);
    return shoved;
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
      if (hash01(prop, 10 + i) < 0.4) { // pulled out and left hanging, each one a different way
        const pull = 0.25 + 0.5 * hash01(prop, 20 + i);
        const drawer = part(factory, 'ch3Cabinet', w * 0.9, (h / drawers) * 0.8, d * 0.5, 0, y + 0.04, -d / 2 - d * pull * 0.5);
        drawer.rotation.set((hash01(prop, 30 + i) - 0.3) * 0.25, (hash01(prop, 40 + i) - 0.5) * 0.2, 0);
        cabinet.add(drawer);
      }
    }
    // what was in them, thrown out in front
    const files = 4 + Math.floor(hash01(prop, 2) * 6);
    for (let i = 0; i < files; i++) {
      const file = part(factory, i % 3 ? 'ch3Paper' : 'ch3Cabinet', 0.24, 0.012, 0.32,
        (hash01(prop, 50 + i) - 0.5) * w * 1.6, 0.014 + i * 0.004, -d / 2 - 0.25 - hash01(prop, 60 + i) * 0.8);
      file.rotation.y = hash01(prop, 70 + i) * 3;
      file.castShadow = false;
      cabinet.add(file);
    }
    cabinet.rotation.y = (hash01(prop, 3) - 0.5) * 0.14;
    if (hash01(prop, 4) < 0.3) { // tipped over until something stopped it
      const tip = (hash01(prop, 5) < 0.5 ? 1 : -1) * (0.22 + 0.2 * hash01(prop, 6));
      cabinet.rotation.z = tip;
      cabinet.position.y = Math.abs(Math.sin(tip)) * w * 0.5;
    }
    const shoved = new THREE.Group();
    shoved.add(cabinet);
    return shoved;
  }

  /** Paper all over the floor: thick in the middle of the patch, a few sheets far out, one dropped stack. */
  static papers(ctx) {
    const { factory, size, prop } = ctx;
    seedParts(prop);
    const mess = new THREE.Group();
    const count = 34 + Math.floor(hash01(prop, 1) * 22);
    for (let i = 0; i < count; i++) {
      const x = (hash01(prop, 10 + i) + hash01(prop, 100 + i) - 1) * size.w * 0.55;
      const z = (hash01(prop, 40 + i) + hash01(prop, 130 + i) - 1) * size.d * 0.55;
      const sheet = part(factory, 'ch3Paper', 0.21, 0.003, 0.3, x, 0.014 + (i % 7) * 0.0012, z);
      sheet.rotation.y = hash01(prop, 70 + i) * Math.PI;
      if (hash01(prop, 160 + i) < 0.12) { // curled up, or lying against another sheet
        sheet.rotation.x = (hash01(prop, 190 + i) - 0.5) * 0.6;
        sheet.position.y += 0.03;
      }
      sheet.castShadow = false;
      mess.add(sheet);
    }
    if (hash01(prop, 2) < 0.6) {
      const stack = part(factory, 'ch3Paper', 0.22, 0.04 + 0.05 * hash01(prop, 3), 0.31, (hash01(prop, 4) - 0.5) * size.w * 0.4, 0.012, (hash01(prop, 5) - 0.5) * size.d * 0.4);
      stack.rotation.y = hash01(prop, 6) * 3;
      mess.add(stack);
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

  // ---- wreckage: what the building looks like after it was overrun ----------------------

  /**
   * Where somebody bled out: a pool that dried dark at the rim, what sprayed around it, and often
   * the prints of someone who walked out of it, fainter with every step. One pool in ten is recent:
   * redder and still wet enough to catch the flashlight.
   */
  static bloodPool(ctx) {
    const { factory, size, prop } = ctx;
    const set = marks(factory);
    const r = (salt) => hash01(prop, salt);
    const reach = Math.max(0.9, Math.min(size.w, size.d)) * 0.62;
    const group = new THREE.Group();
    if (r(66) < 0.45) { // nothing happened here but a spill, long dried
      group.add(onFloor(DECAL.water, reach * 1.6, reach * 1.6, set.plain, 0, 0, r(3) * 6.28, 0.016));
      group.add(onFloor(DECAL.grime, reach * 1.2, reach * 1.2, set.plain, 0, 0, r(4) * 6.28, 0.017));
      return group;
    }
    // paper lying in it soaked it up and went dark
    for (let i = 0; i < 4; i++) {
      const sheet = part(factory, 'ch3Blood', 0.21, 0.003, 0.3, (r(70 + i) - 0.5) * reach * 1.3, 0.022 + i * 0.001, (r(75 + i) - 0.5) * reach * 1.3);
      sheet.rotation.y = r(80 + i) * 3;
      sheet.castShadow = false;
      group.add(sheet);
    }
    group.add(onFloor(r(2) < 0.5 ? DECAL.poolA : DECAL.poolB, reach * 1.25, reach * 1.25, r(143) < 0.2 ? set.fresh : set.old, 0, 0, r(3) * 6.28, 0.016));
    const sprays = 1 + Math.floor(r(4) * 2);
    for (let i = 0; i < sprays; i++) {
      const spread = reach * (0.9 + r(10 + i));
      group.add(onFloor(i % 2 ? DECAL.splatterA : DECAL.splatterB, spread, spread, set.old, (r(20 + i) - 0.5) * reach * 1.4, (r(30 + i) - 0.5) * reach * 1.4, r(40 + i) * 6.28, 0.018 + i * 0.001));
    }
    if (r(5) < 0.55) {
      const heading = r(6) * 6.28;
      const steps = 6 + Math.floor(r(7) * 5);
      for (let i = 0; i < steps; i++) {
        const along = 0.5 + i * 0.62;
        const aside = (i % 2 ? 1 : -1) * 0.11;
        const x = -Math.sin(heading) * along + Math.cos(heading) * aside;
        const z = -Math.cos(heading) * along - Math.sin(heading) * aside;
        const fade = 1 - (i / steps) * 0.25;
        group.add(onFloor(DECAL.foot, 0.13 * fade, 0.3 * fade, i < 3 ? set.old : set.faint, x, z, heading + (r(50 + i) - 0.5) * 0.3, 0.02));
      }
    }
    return group;
  }

  /** Something heavy was dragged: a streak along the longer side of `size`, uneven and broken, from a pool. */
  static bloodTrail(ctx) {
    const { factory, size, prop } = ctx;
    const set = marks(factory);
    const alongZ = size.d >= size.w;
    const length = alongZ ? size.d : size.w;
    const width = Math.max(0.5, Math.min(0.9, alongZ ? size.w : size.d));
    const trail = new THREE.Group();
    const pieces = Math.max(3, Math.round(length / 1.1));
    const step = length / pieces;
    for (let i = 0; i < pieces; i++) {
      if (hash01(prop, 10 + i) < 0.12) continue;
      const along = -length / 2 + (i + 0.5) * step;
      const across = (hash01(prop, 30 + i) - 0.5) * width * 0.25;
      const wide = width * (0.55 + 0.6 * hash01(prop, 50 + i));
      const skew = (hash01(prop, 70 + i) - 0.5) * 0.12;
      trail.add(alongZ
        ? onFloor(DECAL.trail, wide, step * 1.08, set.old, across, along, skew, 0.017)
        : onFloor(DECAL.trail, wide, step * 1.08, set.old, along, across, Math.PI / 2 + skew, 0.017));
    }
    trail.add(onFloor(DECAL.poolB, width * 1.4, width * 1.4, set.old, alongZ ? 0 : -length / 2, alongZ ? length / 2 : 0, hash01(prop, 3) * 6.28, 0.016));
    return trail;
  }

  /**
   * Blood on a wall, in the wall's plane and seen from -Z: either a burst (a dense middle, fine
   * drops thinning outwards) with what ran down from it, or the broad smear of someone sliding down.
   * About half have a hand print that slid off.
   */
  static bloodSmear(ctx) {
    const { factory, size, prop } = ctx;
    const set = marks(factory);
    const { w, h } = size;
    const r = (salt) => hash01(prop, salt);
    const smear = new THREE.Group();
    if (r(64) < 0.4) { // only damp and dirt on this stretch of wall
      smear.add(onWall(DECAL.water, Math.max(w, 1.2), h * 0.9, set.plain, 0, h * 0.6, 0.012));
      smear.add(onWall(DECAL.grime, Math.max(w, 1.2) * 1.2, h * 0.7, set.plain, 0, h * 0.3, 0.013));
      return smear;
    }
    if (r(1) < 0.55) {
      const burst = Math.max(w, 1.1) * (1 + 0.5 * r(2));
      smear.add(onWall(r(3) < 0.5 ? DECAL.splatterA : DECAL.splatterB, burst, burst, set.old, (r(4) - 0.5) * w * 0.2, h * 0.72, 0.012));
      smear.add(onWall(DECAL.drips, burst * 0.6, h * 0.6, set.old, (r(5) - 0.5) * w * 0.2, h * 0.4, 0.014));
    } else {
      smear.add(onWall(DECAL.wipe, Math.max(w, 1.2) * 1.2, h * 0.75, set.old, 0, h * 0.5, 0.012));
      smear.add(onWall(DECAL.drips, w * 0.5, h * 0.4, set.old, (r(7) - 0.5) * w * 0.4, h * 0.22, 0.014));
    }
    if (r(8) < 0.55) {
      smear.add(onWall(DECAL.hand, 0.3, 0.42, r(9) < 0.12 ? set.fresh : set.old, (r(10) < 0.5 ? -1 : 1) * w * 0.45, h * 0.62, 0.016));
    }
    return smear;
  }

  /** A desk thrown onto its side. */
  static deskFlipped(ctx) {
    const { prop, size } = ctx;
    const desk = Ch3Props.desk(ctx);
    desk.rotation.z = (hash01(prop, 7) < 0.5 ? 1 : -1) * (80 + 16 * hash01(prop, 8)) * DEG;
    desk.position.y = size.w * 0.5;
    const group = new THREE.Group();
    group.add(desk);
    return group;
  }

  /** A cubicle partition knocked half over, with a broken-off piece on the floor. */
  static partitionBroken(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h, d } = size;
    const group = new THREE.Group();
    const standing = part(factory, 'ch3Partition', w * 0.55, h, d, -w * 0.22, 0, 0);
    standing.rotation.x = (hash01(prop, 1) - 0.5) * 50 * DEG;
    group.add(standing);
    const fallen = part(factory, 'ch3Partition', w * 0.45, d, h * 0.8, w * 0.3, 0, (hash01(prop, 2) - 0.5) * 1.2);
    fallen.rotation.y = (hash01(prop, 3) - 0.5) * 1.2;
    group.add(fallen);
    return group;
  }

  /**
   * A stretch of ceiling that has come down on one side: a tilted panel, loose tiles and the
   * cables that were above it. The origin is at the ceiling.
   */
  static ceilingFallen(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h, d } = size;
    const group = new THREE.Group();
    const panel = part(factory, 'ch3Ceiling', w, 0.05, d, 0, 0, 0);
    panel.position.set(0, -h * 0.5, 0);
    panel.rotation.z = (hash01(prop, 1) < 0.5 ? 1 : -1) * (24 + 20 * hash01(prop, 2)) * DEG;
    group.add(panel);
    for (let i = 0; i < 4; i++) {
      const x = (hash01(prop, 10 + i) - 0.5) * w;
      const z = (hash01(prop, 20 + i) - 0.5) * d;
      const drop = h * (0.4 + 0.6 * hash01(prop, 30 + i));
      group.add(stick(factory, 'ch3Cable', v3(x, 0, z), v3(x + (hash01(prop, 40 + i) - 0.5) * 0.5, -drop, z), 0.012, 3));
    }
    return group;
  }

  /** Loose cables hanging from the ceiling. The origin is at the ceiling. */
  static cables(ctx) {
    const { factory, size, prop } = ctx;
    const group = new THREE.Group();
    const count = 3 + Math.floor(hash01(prop, 1) * 4);
    for (let i = 0; i < count; i++) {
      const x = (hash01(prop, 10 + i) - 0.5) * size.w;
      const z = (hash01(prop, 20 + i) - 0.5) * size.d;
      const drop = size.h * (0.35 + 0.65 * hash01(prop, 30 + i));
      const sway = (hash01(prop, 40 + i) - 0.5) * 0.6;
      const mid = v3(x + sway * 0.5, -drop * 0.55, z);
      group.add(stick(factory, 'ch3Cable', v3(x, 0, z), mid, 0.011, 3));
      group.add(stick(factory, 'ch3Cable', mid, v3(x + sway, -drop, z + sway * 0.4), 0.011, 3));
    }
    group.traverse((object) => { object.castShadow = false; });
    return group;
  }

  /** Heap of broken wall and concrete. */
  static rubble(ctx) {
    const { factory, size, prop } = ctx;
    const heap = new THREE.Group();
    const count = 7 + Math.floor(hash01(prop, 1) * 6);
    for (let i = 0; i < count; i++) {
      const scale = 0.18 + 0.32 * hash01(prop, 10 + i);
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), factory.material('ch3Debris'));
      const out = hash01(prop, 20 + i);
      const turn = hash01(prop, 30 + i) * Math.PI * 2;
      chunk.position.set(
        Math.cos(turn) * out * size.w * 0.45, scale * 0.5 + (1 - out) * size.h * 0.6, Math.sin(turn) * out * size.d * 0.45
      );
      chunk.rotation.set(hash01(prop, 40 + i) * 3, hash01(prop, 50 + i) * 3, 0);
      chunk.scale.y = 0.7;
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      heap.add(chunk);
    }
    return heap;
  }

  /** Broken glass scattered on the floor: small pale shards that catch the flashlight. */
  static glass(ctx) {
    const { factory, size, prop } = ctx;
    const shards = new THREE.Group();
    const count = 14 + Math.floor(hash01(prop, 1) * 12);
    for (let i = 0; i < count; i++) {
      const shard = part(
        factory, 'ch3Glass', 0.05 + 0.14 * hash01(prop, 10 + i), 0.004, 0.03 + 0.1 * hash01(prop, 20 + i),
        (hash01(prop, 30 + i) - 0.5) * size.w, 0.003, (hash01(prop, 40 + i) - 0.5) * size.d
      );
      shard.rotation.y = hash01(prop, 50 + i) * Math.PI;
      shard.castShadow = false;
      shards.add(shard);
    }
    return shards;
  }

  /** Planks nailed across an opening or a wall, every one at its own angle. Front toward -Z. */
  static boards(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h } = size;
    const group = new THREE.Group();
    const planks = Math.max(3, Math.round(h / 0.45));
    for (let i = 0; i < planks; i++) {
      const plank = part(factory, 'ch3Board', w * (0.9 + 0.2 * hash01(prop, 10 + i)), 0.16, 0.03, 0, 0, 0);
      plank.position.set((hash01(prop, 20 + i) - 0.5) * 0.2, h * ((i + 0.5) / planks) - 0.08, -0.02 - 0.012 * (i % 2));
      plank.rotation.z = (hash01(prop, 30 + i) - 0.5) * 0.35;
      group.add(plank);
    }
    return group;
  }

  /**
   * Furniture piled up to block a way through: a cabinet on its side, a desk thrown on top,
   * chairs and planks. The level binds it to a collider named "block_<exit marker id>";
   * LevelFlow removes that collider and hides this pile when the player clears it, so every
   * mesh here stays out of the static batch.
   */
  static barricade(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h, d } = size;
    const pile = new THREE.Group();
    pile.add(part(factory, 'ch3Cabinet', w * 0.82, h * 0.42, d * 0.8, -w * 0.06, 0, 0));
    const desk = part(factory, 'ch3Desk', w * 0.7, 0.06, d * 1.1, w * 0.08, h * 0.42, 0);
    desk.rotation.z = (10 + 12 * hash01(prop, 1)) * DEG;
    pile.add(desk);
    const leaning = part(factory, 'ch3Desk', 0.06, h * 0.9, d * 0.9, w * 0.4, 0, 0);
    leaning.rotation.z = -24 * DEG;
    pile.add(leaning);
    [-1, 1].forEach((side) => {
      const chair = part(factory, 'ch3Chair', 0.5, 0.5, 0.5, side * w * 0.26, h * 0.5, side * d * 0.12);
      chair.rotation.set(0.5 * side, hash01(prop, 3 + side) * 2, 0.6);
      pile.add(chair);
    });
    for (let i = 0; i < 3; i++) {
      const plank = part(factory, 'ch3Board', w * 1.05, 0.14, 0.03, 0, 0, 0);
      plank.position.set(0, h * (0.3 + 0.25 * i), -d * 0.5 - 0.02);
      plank.rotation.z = (hash01(prop, 10 + i) - 0.5) * 0.5;
      pile.add(plank);
    }
    pile.traverse((object) => { object.userData.dynamic = true; });
    return pile;
  }

  /**
   * Emergency exit sign on its own battery: a green plate with a dark arrow, the one thing
   * still lit that says where the stairs are. It glows but lights nothing. Front toward -Z;
   * the arrow points down, at the door it hangs over.
   */
  static exitSign(ctx) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const sign = new THREE.Group();
    sign.add(part(factory, 'ch3Chair', w, h, d, 0, 0, 0));
    const face = glowing(new THREE.BoxGeometry(w * 0.9, h * 0.8, 0.01), glowMaterial(factory, 'ch3Led'));
    face.position.set(0, h * 0.5, -d / 2 - 0.006);
    sign.add(face);
    [-1, 1].forEach((side) => {
      const stroke = part(factory, 'ch3LiftDark', w * 0.3, h * 0.16, 0.012, 0, 0, 0);
      stroke.position.set(side * w * 0.1, h * 0.36, -d / 2 - 0.014);
      stroke.rotation.z = side * 0.75;
      stroke.castShadow = false;
      sign.add(stroke);
    });
    return sign;
  }

  /**
   * Window in an outer wall; origin at the middle of its lower edge on the wall, the room is -Z.
   * Weak grey-blue moonlight comes through a crooked blind and lies on the floor in bars
   * (a glowing pane and a faked patch of light, no real light). About one in five is boarded up.
   */
  static window(ctx) {
    const { factory, size, prop } = ctx;
    seedParts(prop);
    const { w, h } = size;
    const r = (salt) => hash01(prop, salt);
    const frame = new THREE.Group();
    const boarded = r(1) < 0.22;
    const pane = boarded
      ? new THREE.Mesh(new THREE.PlaneGeometry(w, h), factory.material('ch3Void'))
      : glowing(new THREE.PlaneGeometry(w, h), glowMaterial(factory, 'ch3Moon'));
    pane.rotation.y = Math.PI;
    pane.position.set(0, h / 2, -0.01);
    frame.add(pane);
    frame.add(part(factory, 'ch3Cabinet', w + 0.12, 0.06, 0.08, 0, h, -0.04));
    frame.add(part(factory, 'ch3Cabinet', w + 0.12, 0.06, 0.08, 0, -0.06, -0.04));
    [-1, 1].forEach((side) => frame.add(part(factory, 'ch3Cabinet', 0.06, h, 0.08, side * (w / 2 + 0.03), 0, -0.04)));
    frame.add(part(factory, 'ch3Ceramic', w + 0.24, 0.04, 0.18, 0, -0.1, -0.1)); // the sill
    if (boarded) {
      const planks = 3 + Math.floor(r(2) * 2);
      for (let i = 0; i < planks; i++) {
        const plank = part(factory, 'ch3Board', w * 1.18, 0.17, 0.03, (r(10 + i) - 0.5) * 0.1, (h * (i + 0.4)) / planks, -0.1);
        plank.rotation.z = (r(20 + i) - 0.5) * 0.35;
        frame.add(plank);
      }
      return frame;
    }
    const slats = 18;
    for (let i = 0; i < slats; i++) {
      if (r(30 + i) < 0.08) continue; // a slat that is gone
      const slat = part(factory, 'ch3Ceramic', w * 0.98, 0.006, 0.036, 0, h * 0.06 + (h * 0.9 * i) / slats, -0.07);
      slat.rotation.x = 0.5 + r(50 + i) * 0.7;
      if (r(70 + i) < 0.16) { // hanging by one string
        slat.rotation.z = (r(90 + i) < 0.5 ? 1 : -1) * (0.15 + 0.4 * r(110 + i));
        slat.position.y -= 0.12;
      }
      slat.castShadow = false;
      frame.add(slat);
    }
    frame.add(onFloor(DECAL.stripes, w * 1.5, 3.4, lightOn(factory, 'ch3Moon', 0.3), 0, -1.95, Math.PI, 0.021 - prop.y));
    // Dust hanging in the light that comes in: specks along the shaft from the pane down to the
    // patch on the floor, drifting very slowly. They only exist here, so the dark stays empty.
    const specks = 80;
    const positions = new Float32Array(specks * 3);
    for (let i = 0; i < specks; i++) {
      const along = r(200 + i);
      positions[i * 3] = (r(300 + i) - 0.5) * w * 1.3;
      positions[i * 3 + 1] = h * 0.5 + (0.1 - prop.y - h * 0.5) * along + (r(400 + i) - 0.5) * 0.9;
      positions[i * 3 + 2] = -0.3 - along * 3.2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const set = marks(factory);
    if (!set.dust) {
      const spec = glowSpec(factory, 'ch3Moon');
      set.dust = new THREE.PointsMaterial({
        color: Palette.color(spec.color).multiplyScalar(spec.intensity * 0.9), size: 0.016,
        transparent: true, opacity: 0.6, depthWrite: false,
      });
      set.dust.name = 'ch3:dust';
    }
    const dust = new THREE.Points(geometry, set.dust);
    dust.userData.dynamic = true;
    const phase = r(3) * 6.28;
    animate(factory, (time) => {
      dust.position.set(Math.sin(time * 0.07 + phase * 2) * 0.12, Math.sin(time * 0.13 + phase) * 0.08, Math.sin(time * 0.05 + phase) * 0.1);
    });
    frame.add(dust);
    return frame;
  }

  /** A patch of floor tiles (lift lobby, entrance) lying on top of the carpet. `size` gives its extent. */
  static tileFloor(ctx) {
    const slab = ctx.factory.box({ w: ctx.size.w, h: 0.012, d: ctx.size.d }, 'ch3Tile');
    slab.castShadow = false;
    return slab;
  }

  /** Something burned against the wall (the wall is at the origin, the room is -Z): soot fanning out, a burnt-out bin and a computer case. */
  static scorch(ctx) {
    const { factory, prop } = ctx;
    const set = marks(factory);
    const burn = new THREE.Group();
    burn.add(onWall(DECAL.scorch, 2.6, 2.6, set.plain, 0, 1.15, 0.012));
    burn.add(onFloor(DECAL.scorch, 2.2, 2.2, set.plain, 0, -0.75, 0, 0.019));
    burn.add(tube(factory, 'ch3Void', 0.16, 0.34, 0.25, 0, -0.4, 10));
    const tower = part(factory, 'ch3Void', 0.18, 0.42, 0.44, -0.45, 0, -0.42);
    tower.rotation.set(0.12, hash01(prop, 1), -0.2);
    burn.add(tower);
    for (let i = 0; i < 9; i++) {
      const ash = part(factory, 'ch3Void', 0.05 + 0.12 * hash01(prop, 10 + i), 0.01, 0.05 + 0.1 * hash01(prop, 20 + i), (hash01(prop, 30 + i) - 0.5) * 1.6, 0.02, -0.2 - hash01(prop, 40 + i) * 1.3);
      ash.rotation.y = hash01(prop, 50 + i) * 3;
      ash.castShadow = false;
      burn.add(ash);
    }
    return burn;
  }

  /** A burst of gunfire into a wall (wall at the origin, room toward -Z) and the spent cases below. */
  static bulletHoles(ctx) {
    const { factory, prop } = ctx;
    const set = marks(factory);
    const r = (salt) => hash01(prop, salt);
    const burst = new THREE.Group();
    const groups = 2 + Math.floor(r(1) * 2);
    for (let i = 0; i < groups; i++) {
      const holes = onWall(DECAL.bullets, 0.95, 0.95, set.plain, (r(10 + i) - 0.5) * 1.8, 1.0 + r(20 + i) * 0.8, 0.012);
      holes.rotation.z = r(30 + i) * 6.28;
      burst.add(holes);
    }
    const cases = 9 + Math.floor(r(2) * 8);
    for (let i = 0; i < cases; i++) {
      const brass = tube(factory, 'ch3Brass', 0.006, 0.024, (r(40 + i) - 0.5) * 2.4, 0.02, -0.5 - r(60 + i) * 2.2, 5);
      brass.rotation.set(0, r(80 + i) * 6.28, Math.PI / 2);
      brass.castShadow = false;
      burst.add(brass);
    }
    return burst;
  }

  /** Photocopier with its lid up, a tray hanging off and the last job spilled in front of it. Front is -Z. */
  static copier(ctx) {
    const { factory, prop } = ctx;
    seedParts(prop);
    const copier = new THREE.Group();
    copier.add(part(factory, 'ch3Ceramic', 0.7, 0.95, 0.62, 0, 0, 0));
    copier.add(part(factory, 'ch3Plastic', 0.66, 0.02, 0.56, 0, 0.95, 0));
    const lid = part(factory, 'ch3Ceramic', 0.66, 0.03, 0.56, 0, 0, -0.28);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.97, 0.28);
    hinge.rotation.x = 1.0;
    hinge.add(lid);
    copier.add(hinge);
    const tray = part(factory, 'ch3Ceramic', 0.42, 0.02, 0.3, -0.52, 0.52, 0);
    tray.rotation.z = -0.35;
    copier.add(tray);
    copier.add(part(factory, 'ch3Plastic', 0.3, 0.04, 0.1, 0.15, 0.95, -0.3));
    for (let i = 0; i < 16; i++) {
      const sheet = part(factory, 'ch3Paper', 0.21, 0.003, 0.3, -0.5 + (hash01(prop, 10 + i) - 0.5) * 1.3, 0.014 + i * 0.001, -0.6 - hash01(prop, 30 + i) * 1.1);
      sheet.rotation.y = hash01(prop, 50 + i) * 3;
      sheet.castShadow = false;
      copier.add(sheet);
    }
    return copier;
  }

  /** Vending machine, front (-Z) smashed in, leaning where someone tried to tip it. */
  static vending(ctx) {
    const { factory, prop } = ctx;
    seedParts(prop);
    const machine = new THREE.Group();
    machine.add(part(factory, 'ch3Cabinet', 0.95, 1.85, 0.8, 0, 0, 0));
    machine.add(part(factory, 'ch3Void', 0.62, 1.3, 0.02, -0.12, 0.42, -0.41));
    const crack = decalQuad(DECAL.cracks, 0.62, 1.1, marks(factory).plain);
    crack.rotation.y = Math.PI;
    crack.position.set(-0.12, 1.1, -0.425);
    machine.add(crack);
    machine.add(part(factory, 'ch3Plastic', 0.18, 0.5, 0.02, 0.33, 0.9, -0.41));
    for (let i = 0; i < 5; i++) {
      const can = tube(factory, 'ch3Cabinet', 0.033, 0.12, (hash01(prop, 10 + i) - 0.5) * 1.2, 0.045, -0.7 - hash01(prop, 20 + i) * 0.8, 7);
      can.rotation.set(0, hash01(prop, 30 + i) * 6, Math.PI / 2);
      machine.add(can);
    }
    machine.rotation.z = 0.07;
    return machine;
  }

  /** Water cooler; the bottle has rolled away and what was in it dried into the floor. */
  static waterCooler(ctx) {
    const { factory, prop } = ctx;
    seedParts(prop);
    const cooler = new THREE.Group();
    cooler.add(part(factory, 'ch3Ceramic', 0.34, 1.0, 0.34, 0, 0, 0));
    cooler.add(part(factory, 'ch3Plastic', 0.2, 0.08, 0.04, 0, 0.7, -0.19));
    const bottle = tube(factory, 'ch3Glass', 0.13, 0.42, 0.5 + 0.4 * hash01(prop, 1), 0.13, -0.5, 9);
    bottle.rotation.set(0, hash01(prop, 2) * 3, Math.PI / 2);
    cooler.add(bottle);
    cooler.add(onFloor(DECAL.water, 1.9, 1.9, marks(factory).plain, 0.3, -0.5, hash01(prop, 3) * 6, 0.016));
    return cooler;
  }

  /** Lobby sofa, cushions pulled off and slit. The seat faces -Z. */
  static sofa(ctx) {
    const { factory, prop } = ctx;
    seedParts(prop);
    const sofa = new THREE.Group();
    sofa.add(part(factory, 'ch3Chair', 1.9, 0.38, 0.85, 0, 0, 0));
    sofa.add(part(factory, 'ch3Chair', 1.9, 0.45, 0.22, 0, 0.38, 0.32));
    [-1, 1].forEach((side) => sofa.add(part(factory, 'ch3Chair', 0.2, 0.58, 0.85, side * 0.95, 0, 0)));
    const cushion = part(factory, 'ch3Partition', 0.62, 0.14, 0.6, 0.45, 0.38, -0.2);
    cushion.rotation.set(0.25, 0.5, 0.1);
    sofa.add(cushion);
    const dropped = part(factory, 'ch3Partition', 0.62, 0.14, 0.6, -0.7, 0, -0.95);
    dropped.rotation.set(0, hash01(prop, 1) * 3, 0.12);
    sofa.add(dropped);
    return sofa;
  }

  /** Whiteboard on a wall (seen from -Z), hanging crooked: the last meeting half wiped off, a tally of days, one line in a hurry. */
  static whiteboard(ctx) {
    const { factory, prop } = ctx;
    seedParts(prop);
    const board = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), signMaterial(factory));
    const uv = face.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5);
    face.rotation.y = Math.PI;
    face.position.set(0, 0, -0.03);
    face.receiveShadow = true;
    board.add(face);
    board.add(part(factory, 'ch3Cabinet', 1.96, 0.04, 0.04, 0, 0.475, -0.02));
    board.add(part(factory, 'ch3Cabinet', 1.96, 0.06, 0.08, 0, -0.53, -0.04));
    board.rotation.z = (hash01(prop, 1) - 0.5) * 0.16;
    const hung = new THREE.Group();
    hung.add(board);
    return hung;
  }

  /** The company's name on the lobby wall (seen from -Z), one letter knocked loose. */
  static logoWall(ctx) {
    const { factory } = ctx;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), signMaterial(factory));
    const uv = sign.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5);
    sign.rotation.y = Math.PI;
    sign.position.z = -0.03;
    sign.receiveShadow = true;
    const wall = new THREE.Group();
    wall.add(sign);
    return wall;
  }

  /** Wall clock (seen from -Z), stopped. */
  static clock(ctx) {
    const { factory } = ctx;
    const clock = new THREE.Group();
    const face = tube(factory, 'ch3Ceramic', 0.17, 0.03, 0, 0, 0, 14);
    face.rotation.x = Math.PI / 2;
    face.position.z = -0.03;
    clock.add(face);
    const hour = part(factory, 'ch3Plastic', 0.014, 0.09, 0.006, 0, 0, -0.04);
    hour.rotation.z = -1.9;
    const minute = part(factory, 'ch3Plastic', 0.01, 0.14, 0.006, 0, 0, -0.045);
    minute.rotation.z = 1.3;
    clock.add(hour, minute);
    return clock;
  }

  /**
   * Where someone hid for a while: sleeping bag, empty tins, bottles, a note, and one candle that
   * is somehow still burning. The candle is the warm spot of this floor: a small flame and a faked
   * pool of warm light two or three metres wide, no real light.
   */
  static camp(ctx) {
    const { factory, prop } = ctx;
    seedParts(prop);
    const r = (salt) => hash01(prop, salt);
    const camp = new THREE.Group();
    const bag = part(factory, 'ch3Cloth', 0.7, 0.09, 1.9, 0, 0.012, 0);
    bag.rotation.y = 0.2;
    camp.add(bag);
    const pillow = part(factory, 'ch3Partition', 0.5, 0.1, 0.32, 0.12, 0.1, 0.78);
    pillow.rotation.y = 0.5;
    camp.add(pillow);
    for (let i = 0; i < 7; i++) {
      const tin = tube(factory, 'ch3Cabinet', 0.04, 0.11, 0.7 + r(10 + i) * 0.8, 0.012, (r(20 + i) - 0.5) * 1.6, 8);
      if (r(30 + i) < 0.6) { tin.rotation.set(0, r(40 + i) * 6, Math.PI / 2); tin.position.y = 0.052; }
      camp.add(tin);
    }
    for (let i = 0; i < 3; i++) {
      const bottle = tube(factory, 'ch3Glass', 0.035, 0.24, -0.6 - r(50 + i) * 0.4, 0.012, (r(55 + i) - 0.5) * 1.4, 7);
      if (i === 0) { bottle.rotation.z = Math.PI / 2; bottle.position.y = 0.047; }
      camp.add(bottle);
    }
    const note = part(factory, 'ch3Paper', 0.15, 0.003, 0.21, 0.45, 0.014, -0.5);
    note.rotation.y = 0.7;
    camp.add(note);
    camp.add(tube(factory, 'ch3Ceramic', 0.02, 0.07, 0.6, 0.012, -0.45, 7));
    const flame = glowing(new THREE.SphereGeometry(0.014, 6, 5), glowMaterial(factory, 'ch3Candle', waver));
    flame.scale.y = 1.8;
    flame.position.set(0.6, 0.105, -0.45);
    camp.add(flame);
    camp.add(onFloor(DECAL.glow, 5.2, 5.2, lightOn(factory, 'ch3Candle', 0.04, waver), 0.6, -0.45, 0, 0.024));
    // the ground floor has one of its four real lights to spare: the candle takes it, so the things
    // around the sleeping bag are really lit and throw their shadows away from the flame
    const glow = warmLight(factory, 'ch3Candle', waver);
    if (glow) {
      glow.position.set(0.6, 0.22, -0.45);
      camp.add(glow);
    }
    return camp;
  }

  /** Cardboard boxes dumped in a heap: some open, one crushed flat, none square to another. */
  static boxPile(ctx) {
    const { factory, prop } = ctx;
    seedParts(prop);
    const r = (salt) => hash01(prop, salt);
    const pile = new THREE.Group();
    const count = 4 + Math.floor(r(1) * 4);
    for (let i = 0; i < count; i++) {
      const bw = 0.35 + 0.3 * r(10 + i);
      const bh = 0.25 + 0.3 * r(20 + i);
      const bd = 0.3 + 0.25 * r(30 + i);
      const stacked = i > 2 && r(40 + i) < 0.5;
      const crushed = !stacked && r(50 + i) < 0.2;
      const box = new THREE.Group();
      box.add(part(factory, 'crate', bw, crushed ? 0.06 : bh, bd, 0, 0, 0));
      if (!crushed && r(60 + i) < 0.5) { // open: two flaps up
        [-1, 1].forEach((side) => {
          const flap = part(factory, 'crate', bw, 0.012, bd * 0.5, 0, 0, 0);
          flap.position.set(0, bh, side * bd * 0.5);
          flap.rotation.x = side * (0.5 + r(70 + i));
          box.add(flap);
        });
      }
      box.position.set((r(80 + i) - 0.5) * 1.5, stacked ? 0.3 : 0, (r(90 + i) - 0.5) * 1.1);
      box.rotation.set(stacked ? (r(100 + i) - 0.5) * 0.3 : 0, r(110 + i) * 3, stacked ? (r(120 + i) - 0.5) * 0.4 : 0);
      pile.add(box);
    }
    return pile;
  }

  /** A door torn off its frame: it leans in the opening on one hinge. The opening runs along X. */
  static doorBroken(ctx) {
    const { factory, prop } = ctx;
    seedParts(prop);
    const door = new THREE.Group();
    const leaf = part(factory, 'ch3Desk', 0.9, 2.05, 0.045, 0.45, 0, 0);
    const hinge = new THREE.Group();
    hinge.position.set(-0.5, 0, 0);
    hinge.rotation.set(0.1, 0.9 + hash01(prop, 1) * 0.5, 0.16);
    hinge.add(leaf);
    door.add(hinge);
    door.add(onWall(DECAL.drips, 0.7, 1.3, marks(factory).old, 0, 1.3, 0.03));
    const splinter = part(factory, 'ch3Board', 0.08, 0.02, 0.7, 0.4, 0.014, -0.5);
    splinter.rotation.y = 0.8;
    door.add(splinter);
    return door;
  }

  /** Fire extinguisher: on its bracket or, more often, on the floor where it was dropped. */
  static extinguisher(ctx) {
    const { factory, prop } = ctx;
    const body = new THREE.Group();
    body.add(tube(factory, 'ch3Blood', 0.07, 0.42, 0, 0, 0, 9));
    body.add(tube(factory, 'ch3Plastic', 0.025, 0.1, 0, 0.42, 0, 6));
    const group = new THREE.Group();
    if (hash01(prop, 1) < 0.6) {
      body.rotation.set(0, hash01(prop, 2) * 6, Math.PI / 2);
      body.position.set(0.2, 0.08, -0.4);
    } else {
      body.position.set(0, 0.5, -0.09);
    }
    group.add(body);
    return group;
  }

  /** Waste bin kicked over, its contents across the floor. */
  static trash(ctx) {
    const { factory, prop } = ctx;
    const r = (salt) => hash01(prop, salt);
    const mess = new THREE.Group();
    const bin = tube(factory, 'ch3Bin', 0.15, 0.34, 0, 0.15, 0, 9);
    bin.rotation.set(0, r(1) * 6, Math.PI / 2);
    mess.add(bin);
    for (let i = 0; i < 11; i++) {
      const ball = part(factory, 'ch3Paper', 0.05 + 0.05 * r(10 + i), 0.04, 0.05 + 0.04 * r(20 + i), (r(30 + i) - 0.3) * 1.2, 0.012, (r(40 + i) - 0.5) * 0.9);
      ball.rotation.set(r(50 + i), r(60 + i) * 3, r(70 + i));
      mess.add(ball);
    }
    return mess;
  }

  /**
   * Glass partition in place of a solid wall (bind it to the wall's collider): metal posts and
   * rails, panes you can see through, most of them cracked from one point and grey with dust,
   * about one in five gone with its splinters on the floor. Some carry a hand print.
   */
  static glassWall(ctx) {
    const { factory, size, prop } = ctx;
    seedParts(prop);
    const set = marks(factory);
    if (!set.glass) {
      set.glass = new THREE.MeshStandardMaterial({
        color: Palette.color(typeof factory.greybox.ch3Glass === 'string' ? factory.greybox.ch3Glass : '#8a9da0'),
        transparent: true, opacity: 0.2, roughness: 0.08, metalness: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      set.glass.name = 'ch3:glass';
    }
    const r = (salt) => hash01(prop, salt);
    const alongZ = size.d > size.w;
    const length = alongZ ? size.d : size.w;
    const h = size.h;
    const run = new THREE.Group();
    run.add(part(factory, 'ch3Cabinet', length, 0.08, 0.09, 0, 0, 0));
    run.add(part(factory, 'ch3Cabinet', length, 0.08, 0.09, 0, h - 0.08, 0));
    const panes = Math.max(1, Math.round(length / 0.95));
    const wide = length / panes;
    for (let i = 0; i <= panes; i++) run.add(part(factory, 'ch3Cabinet', 0.05, h, 0.07, -length / 2 + i * wide, 0, 0));
    for (let i = 0; i < panes; i++) {
      const x = -length / 2 + (i + 0.5) * wide;
      const fate = r(10 + i);
      if (fate < 0.22) { // smashed out: splinters on both sides, a jagged strip left in the frame
        for (let k = 0; k < 16; k++) {
          const shard = part(factory, 'ch3Glass', 0.04 + 0.12 * r(100 + i * 20 + k), 0.004, 0.03 + 0.1 * r(400 + i * 20 + k),
            x + (r(700 + i * 20 + k) - 0.5) * wide * 1.3, 0.014, (r(1000 + i * 20 + k) - 0.5) * 1.8);
          shard.rotation.y = r(1300 + i * 20 + k) * 3;
          shard.castShadow = false;
          run.add(shard);
        }
        const stump = new THREE.Mesh(new THREE.PlaneGeometry(wide - 0.06, 0.25 + 0.3 * r(40 + i)), set.glass);
        stump.position.set(x, 0.08 + stump.geometry.parameters.height / 2, 0);
        run.add(stump);
        continue;
      }
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(wide - 0.06, h - 0.16), set.glass);
      pane.position.set(x, h / 2, 0);
      pane.receiveShadow = false;
      run.add(pane);
      const marksOn = (cell, w, tall, material, y, out) => {
        const front = decalQuad(cell, w, tall, material);
        front.rotation.y = Math.PI;
        front.position.set(x, y, -out);
        const back = decalQuad(cell, w, tall, material);
        back.position.set(x, y, out);
        run.add(front, back);
      };
      marksOn(DECAL.grime, wide - 0.08, 1.5, set.plain, 0.85, 0.006);
      if (fate < 0.62) marksOn(DECAL.cracks, wide * 1.1, wide * 1.1, set.plain, 0.8 + 1.4 * r(20 + i), 0.008);
      if (r(30 + i) < 0.3) marksOn(DECAL.hand, 0.28, 0.4, set.old, 1.2 + 0.2 * r(50 + i), 0.01);
    }
    if (alongZ) run.rotation.y = Math.PI / 2;
    const wall = new THREE.Group();
    wall.add(run);
    return wall;
  }

  /**
   * An opening taped shut (it lies in the prop's plane, seen from -Z): two strips of warning tape
   * crossed over it and a third hanging loose. `size` is the opening.
   */
  static tape(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h } = size;
    const tape = new THREE.Group();
    const strip = (x0, y0, x1, y1, sag) => {
      const length = Math.hypot(x1 - x0, y1 - y0);
      const piece = part(factory, 'ch3Hazard', length, 0.07, 0.004, 0, -0.035, 0);
      const holder = new THREE.Group();
      holder.position.set((x0 + x1) / 2, (y0 + y1) / 2 - sag, -0.03 - 0.02 * hash01(prop, Math.round(x0 * 10 + y1 * 7)));
      holder.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      piece.castShadow = false;
      holder.add(piece);
      tape.add(holder);
    };
    strip(-w / 2, 0.35, w / 2, h - 0.3, 0);
    strip(-w / 2, h - 0.45, w / 2, 0.5, 0);
    strip(-w / 2, h * 0.55, w / 2, h * 0.5, 0.05);
    strip(w * 0.1, h * 0.52, w * 0.32, 0.12, 0); // torn end hanging down
    return tape;
  }
}
