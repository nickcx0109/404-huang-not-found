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

// ================================================================================================
// The wet road at night. Everything below is painted on canvases when the level loads, from fixed
// seeds: no image is downloaded and every load looks the same. Textures are at most 1024 px.
// ================================================================================================

/** Small repeatable random generator (mulberry32): returns a function giving numbers in [0, 1). */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Smooth noise 0..1 that wraps around at the edges of a width x height image. */
function wrapNoise(width, height, cellsX, cellsY, rnd) {
  const lattice = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = (y / height) * cellsY;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const row0 = (y0 % cellsY) * cellsX;
    const row1 = ((y0 + 1) % cellsY) * cellsX;
    for (let x = 0; x < width; x++) {
      const fx = (x / width) * cellsX;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const a = x0 % cellsX;
      const b = (x0 + 1) % cellsX;
      const top = lattice[row0 + a] + (lattice[row0 + b] - lattice[row0 + a]) * sx;
      const bottom = lattice[row1 + a] + (lattice[row1 + b] - lattice[row1 + a]) * sx;
      out[y * width + x] = top + (bottom - top) * sy;
    }
  }
  return out;
}

/** Several layers of wrapping noise added up, 0..1: broad shapes with finer and finer detail. */
function cloud(width, height, cellsX, cellsY, octaves, seed) {
  const rnd = seeded(seed);
  const total = new Float32Array(width * height);
  let weight = 1;
  let sum = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const layer = wrapNoise(width, height, cellsX << octave, cellsY << octave, rnd);
    for (let i = 0; i < total.length; i++) total[i] += layer[i] * weight;
    sum += weight;
    weight *= 0.5;
  }
  for (let i = 0; i < total.length; i++) total[i] /= sum;
  return total;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function colourTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function dataTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Painted images, built once and shared by every material that uses them. */
const painted = new Map();
function paintedOnce(name, paint) {
  if (!painted.has(name)) painted.set(name, paint());
  return painted.get(name);
}

/**
 * What a wet surface mirrors: not the real scene (too expensive), only a small picture of it:
 * fog above, darker woods at the horizon, a hint of warm lamps low down.
 */
function skyTexture() {
  return paintedOnce('sky', () => {
    const canvas = makeCanvas(256, 128);
    const g = canvas.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#56635f');
    sky.addColorStop(0.42, '#465350');
    sky.addColorStop(0.5, '#1c2422');
    sky.addColorStop(1, '#070908');
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 128);
    [[40, '#ffb060'], [150, '#ff9a50'], [215, '#ffcf8a']].forEach(([x, colour]) => {
      const lamp = g.createRadialGradient(x, 60, 0, x, 60, 9);
      lamp.addColorStop(0, colour);
      lamp.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = lamp;
      g.globalAlpha = 0.5;
      g.fillRect(x - 9, 51, 18, 18);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  });
}

/** Materials of this chapter that are built from painted textures, one set per PropFactory. */
const wetSets = new WeakMap();
function wetSet(factory) {
  if (!wetSets.has(factory)) wetSets.set(factory, new Map());
  return wetSets.get(factory);
}

/** Palette colour that only tints a painted texture (white leaves it as painted). */
function tint(factory, key) {
  return Palette.color(typeof factory.greybox[key] === 'string' ? factory.greybox[key] : '#ffffff');
}

/**
 * A rain-wet surface: colour and roughness from painted textures, and a faint mirror image of
 * the foggy sky that gets sharper where the roughness map says "water".
 */
function wetMaterial(factory, name, make) {
  const set = wetSet(factory);
  if (!set.has(name)) {
    const options = make();
    const material = new THREE.MeshStandardMaterial(Object.assign({
      roughness: 1, metalness: 0, envMap: skyTexture(), envMapIntensity: 0.5,
    }, options));
    material.name = 'ch1:' + name;
    set.set(name, material);
  }
  return set.get(name);
}

// ---- asphalt: one image covers the full 7 m width and 14 m of length ---------------------------

const ROAD_TILE = 14;

function roadTextures() {
  return paintedOnce('road', () => {
    const W = 512;
    const H = 1024;
    const colour = makeCanvas(W, H);
    const rough = makeCanvas(W, H);
    const cg = colour.getContext('2d');
    const rg = rough.getContext('2d');
    const broad = cloud(W, H, 3, 6, 4, 101);
    const grain = cloud(W, H, 64, 128, 2, 102);
    const water = cloud(W, H, 2, 4, 4, 103);
    const dirt = cloud(W, H, 5, 10, 3, 104);
    const bite = cloud(W, H, 4, 8, 3, 105);
    const rnd = seeded(106);
    const cd = cg.createImageData(W, H);
    const rd = rg.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const u = x / W;
        const edge = Math.min(u, 1 - u) * 7; // metres to the nearer edge
        // where the wheels run the surface is worn smoother and holds water
        const lane = u < 0.5 ? u * 2 : (u - 0.5) * 2;
        const track = Math.exp(-Math.pow((lane - 0.3) / 0.07, 2)) + Math.exp(-Math.pow((lane - 0.72) / 0.07, 2));
        const speck = rnd();
        let grey = 50 + 30 * grain[i] + 22 * (broad[i] - 0.5) + 5 * track + (speck < 0.03 ? 30 : speck > 0.975 ? -20 : 0);
        const pool = smoothstep(0.58, 0.68, water[i] + 0.1 * (1 - clamp01(edge / 1.2)) + 0.05 * track);
        const damp = smoothstep(0.44, 0.6, water[i]);
        grey *= 1 - 0.42 * damp - 0.2 * pool;
        let r = grey;
        let g = grey;
        let b = grey + 3;
        // mud and rotting leaves creep in from the shoulder
        const mud = clamp01(1 - edge / (0.35 + 1.5 * dirt[i]));
        if (mud > 0) {
          const tone = 0.55 + 0.7 * grain[i];
          r += (58 * tone - r) * mud;
          g += (47 * tone - g) * mud;
          b += (34 * tone - b) * mud;
        }
        cd.data[i * 4] = r;
        cd.data[i * 4 + 1] = g;
        cd.data[i * 4 + 2] = b;
        // the edge of the tarmac is broken away, more in some places than in others
        const crumble = 0.03 + 0.5 * Math.pow(bite[i], 3) + (bite[i] > 0.74 ? 0.5 : 0);
        cd.data[i * 4 + 3] = edge > crumble ? 255 : 0;
        const dull = 0.6 - 0.12 * track + 0.3 * mud - 0.1 * damp;
        const value = 255 * (dull + (0.03 - dull) * pool);
        rd.data[i * 4] = rd.data[i * 4 + 1] = rd.data[i * 4 + 2] = value;
        rd.data[i * 4 + 3] = 255;
      }
    }
    cg.putImageData(cd, 0, 0);
    rg.putImageData(rd, 0, 0);

    // Everything painted on top goes through this, so it never fills in the broken edge.
    cg.globalCompositeOperation = 'source-atop';
    const line = seeded(107);

    // patches of newer tar, darker and smoother, with a seam around them
    for (let i = 0; i < 3; i++) {
      const px = 60 + line() * 300;
      const py = line() * H;
      const pw = 60 + line() * 120;
      const ph = 90 + line() * 200;
      [cg, rg].forEach((ctx, isRough) => {
        for (const shift of [-H, 0, H]) {
          ctx.fillStyle = isRough ? 'rgba(96, 96, 96, 0.75)' : 'rgba(22, 22, 24, 0.5)';
          ctx.fillRect(px, py + shift, pw, ph);
          ctx.strokeStyle = isRough ? 'rgba(40, 40, 40, 0.8)' : 'rgba(10, 10, 10, 0.6)';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(px, py + shift, pw, ph);
        }
      });
    }

    // lane markings on their own layer, worn through before they go onto the road
    const marks = makeCanvas(W, H);
    const mg = marks.getContext('2d');
    mg.fillStyle = '#b79a3f'; // centre: double yellow
    mg.fillRect(W / 2 - 9, 0, 6, H);
    mg.fillRect(W / 2 + 3, 0, 6, H);
    mg.fillStyle = '#b9b7ad'; // edges: white
    mg.fillRect(15, 0, 7, H);
    mg.fillRect(W - 22, 0, 7, H);
    const md = mg.getImageData(0, 0, W, H);
    const wear = cloud(W, H, 6, 12, 4, 108);
    for (let i = 0; i < W * H; i++) {
      const u = (i % W) / W;
      const edge = Math.min(u, 1 - u) * 7;
      const mud = clamp01(1 - edge / (0.35 + 1.5 * dirt[i]));
      md.data[i * 4 + 3] *= clamp01((wear[i] - 0.36) * 4) * (0.35 + 0.4 * grain[i]) * (1 - mud);
    }
    mg.putImageData(md, 0, 0);
    cg.drawImage(marks, 0, 0);

    // cracks: long ones that wander along the road, and a patch of crazing
    const crack = (ctx, colourStyle, width) => {
      const walk = seeded(109);
      ctx.strokeStyle = colourStyle;
      ctx.lineCap = 'round';
      for (let n = 0; n < 9; n++) {
        let x = 40 + walk() * (W - 80);
        let y = walk() * H;
        let heading = Math.PI / 2 + (walk() - 0.5) * 1.2;
        const steps = 30 + Math.floor(walk() * 90);
        ctx.lineWidth = width * (0.6 + walk());
        for (const shift of [-H, 0, H]) {
          const local = seeded(1000 + n);
          let cx = x;
          let cy = y + shift;
          let h = heading;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          for (let s = 0; s < steps; s++) {
            h += (local() - 0.5) * 0.7;
            cx += Math.cos(h) * 7;
            cy += Math.sin(h) * 7;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
      }
      const craze = seeded(110);
      ctx.lineWidth = width * 0.6;
      for (let n = 0; n < 90; n++) {
        const x = 300 + craze() * 150;
        const y = 600 + craze() * 190;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (craze() - 0.5) * 44, y + (craze() - 0.5) * 44);
        ctx.lineTo(x + (craze() - 0.5) * 44, y + (craze() - 0.5) * 44);
        ctx.stroke();
      }
    };
    crack(cg, 'rgba(6, 6, 6, 0.85)', 1.6);
    crack(rg, 'rgba(20, 20, 20, 0.9)', 2.4); // water sits in the cracks
    cg.globalCompositeOperation = 'source-over';
    return { map: colourTexture(colour), roughnessMap: dataTexture(rough) };
  });
}

// ---- forest floor: one image covers 8 x 8 m -------------------------------------------------------

function groundTextures() {
  return paintedOnce('ground', () => {
    const S = 1024;
    const colour = makeCanvas(S, S);
    const rough = makeCanvas(S, S);
    const cg = colour.getContext('2d');
    const rg = rough.getContext('2d');
    const broad = cloud(S, S, 3, 3, 5, 201);
    const fine = cloud(S, S, 96, 96, 2, 202);
    const water = cloud(S, S, 3, 3, 4, 203);
    const moss = cloud(S, S, 5, 5, 4, 204);
    const cd = cg.createImageData(S, S);
    const rd = rg.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const tone = 0.55 + 0.55 * broad[i] + 0.35 * (fine[i] - 0.5);
      let r = 44 * tone;
      let g = 38 * tone;
      let b = 29 * tone;
      const green = smoothstep(0.56, 0.7, moss[i]);
      r += (34 * tone - r) * green * 0.8;
      g += (44 * tone - g) * green * 0.8;
      b += (26 * tone - b) * green * 0.8;
      const pool = smoothstep(0.62, 0.7, water[i]); // muddy water: brown and cloudy
      const damp = smoothstep(0.5, 0.64, water[i]);
      r *= 1 - 0.35 * damp;
      g *= 1 - 0.35 * damp;
      b *= 1 - 0.35 * damp;
      r += (38 - r) * pool * 0.6;
      g += (30 - g) * pool * 0.6;
      b += (20 - b) * pool * 0.6;
      cd.data[i * 4] = r;
      cd.data[i * 4 + 1] = g;
      cd.data[i * 4 + 2] = b;
      cd.data[i * 4 + 3] = 255;
      const dull = 0.9 - 0.25 * damp;
      const value = 255 * (dull + (0.12 - dull) * pool);
      rd.data[i * 4] = rd.data[i * 4 + 1] = rd.data[i * 4 + 2] = value;
      rd.data[i * 4 + 3] = 255;
    }
    cg.putImageData(cd, 0, 0);
    rg.putImageData(rd, 0, 0);
    // a layer of fallen leaves and twigs; anything near an edge is drawn again on the other side
    const rnd = seeded(205);
    const wrapped = (x, y, draw) => {
      for (const dx of [-S, 0, S]) {
        for (const dy of [-S, 0, S]) {
          if (x + dx < -40 || x + dx > S + 40 || y + dy < -40 || y + dy > S + 40) continue;
          draw(x + dx, y + dy);
        }
      }
    };
    const leafColours = ['#4a3a22', '#3d2f1c', '#55452a', '#34291a', '#5a4a30', '#2c2418', '#3f3a24'];
    for (let n = 0; n < 5200; n++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const w = 5 + rnd() * 7;
      const h = 2.5 + rnd() * 3;
      const turn = rnd() * Math.PI;
      const fill = leafColours[Math.floor(rnd() * leafColours.length)];
      const alpha = 0.55 + rnd() * 0.45;
      wrapped(x, y, (px, py) => {
        cg.save();
        cg.translate(px, py);
        cg.rotate(turn);
        cg.globalAlpha = alpha;
        cg.fillStyle = fill;
        cg.beginPath();
        cg.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
        cg.fill();
        cg.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        cg.lineWidth = 0.6;
        cg.beginPath();
        cg.moveTo(-w, 0);
        cg.lineTo(w, 0);
        cg.stroke();
        cg.restore();
      });
    }
    cg.globalAlpha = 1;
    cg.lineCap = 'round';
    for (let n = 0; n < 260; n++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const turn = rnd() * Math.PI * 2;
      const length = 14 + rnd() * 60;
      const width = 1 + rnd() * 2.6;
      wrapped(x, y, (px, py) => {
        cg.strokeStyle = 'rgba(18, 14, 10, 0.9)';
        cg.lineWidth = width;
        cg.beginPath();
        cg.moveTo(px, py);
        cg.lineTo(px + Math.cos(turn) * length, py + Math.sin(turn) * length);
        cg.stroke();
      });
    }
    return { map: colourTexture(colour), roughnessMap: dataTexture(rough) };
  });
}

// ---- marks on the road: one image, 4 x 4 cells --------------------------------------------------

const MARK = Object.freeze({
  pothole: 0, puddleA: 1, puddleB: 2, skid: 3,
  blood: 4, steps: 5, oil: 6, glass: 7,
  claw: 8, hand: 9, moss: 10, holes: 11,
  splash: 12, leaves: 13, ripple: 14, soft: 15,
});

function markTexture() {
  return paintedOnce('marks', () => {
    const canvas = makeCanvas(1024, 1024);
    const g = canvas.getContext('2d');
    const blob = (rnd, x, y, radius, points, wobble) => {
      g.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const r = radius * (1 - wobble / 2 + wobble * rnd());
        if (i === 0) g.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        else g.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      }
      g.closePath();
    };
    const painters = [];
    painters[MARK.pothole] = (rnd) => { // broken rim, gravel, a dark hole
      g.fillStyle = 'rgba(30, 29, 27, 0.9)';
      blob(rnd, 128, 128, 112, 26, 0.35);
      g.fill();
      for (let i = 0; i < 500; i++) {
        const angle = rnd() * 6.28;
        const out = 30 + rnd() * 80;
        const tone = 30 + rnd() * 60;
        g.fillStyle = 'rgb(' + tone + ',' + tone + ',' + (tone - 4) + ')';
        g.fillRect(128 + Math.cos(angle) * out, 128 + Math.sin(angle) * out, 1 + rnd() * 5, 1 + rnd() * 4);
      }
      g.fillStyle = 'rgba(6, 6, 6, 0.95)';
      blob(rnd, 128, 128, 74, 20, 0.4);
      g.fill();
    };
    const puddle = (rnd) => { // water: only its shape matters, the material makes it shine
      g.fillStyle = 'rgba(10, 12, 12, 0.55)';
      blob(rnd, 128, 128, 116, 24, 0.5);
      g.fill();
      g.fillStyle = 'rgba(6, 8, 8, 0.9)';
      blob(rnd, 128, 128, 98, 24, 0.45);
      g.fill();
      for (let i = 0; i < 5; i++) {
        blob(rnd, 128 + (rnd() - 0.5) * 150, 128 + (rnd() - 0.5) * 150, 14 + rnd() * 26, 12, 0.5);
        g.fill();
      }
    };
    painters[MARK.puddleA] = puddle;
    painters[MARK.puddleB] = puddle;
    painters[MARK.skid] = (rnd) => { // two tyre marks bending to one side as the car left the road
      g.strokeStyle = 'rgba(6, 6, 6, 0.75)';
      g.lineCap = 'round';
      [70, 150].forEach((x) => {
        for (let pass = 0; pass < 5; pass++) {
          g.lineWidth = 5 + rnd() * 9;
          g.globalAlpha = 0.25 + rnd() * 0.3;
          g.beginPath();
          g.moveTo(x + (rnd() - 0.5) * 6, 250);
          g.bezierCurveTo(x, 170, x + 10, 90, x + 60 + (rnd() - 0.5) * 8, 8);
          g.stroke();
        }
      });
    };
    painters[MARK.blood] = (rnd) => { // something dragged: streaks top to bottom with gaps
      g.strokeStyle = '#3f0e0a';
      g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        let x = 60 + rnd() * 136;
        g.lineWidth = 2 + rnd() * rnd() * 22;
        g.globalAlpha = 0.3 + rnd() * 0.6;
        g.beginPath();
        g.moveTo(x, -8);
        for (let y = 20; y <= 266; y += 24) {
          x += (rnd() - 0.5) * 12;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 1;
      for (let i = 0; i < 22; i++) {
        g.beginPath();
        g.ellipse(20 + rnd() * 216, rnd() * 256, 20 + rnd() * 50, 3 + rnd() * 9, (rnd() - 0.5) * 0.4, 0, 6.28);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    };
    painters[MARK.steps] = () => { // one muddy boot print, toe up
      g.fillStyle = 'rgba(46, 36, 24, 0.85)';
      g.beginPath();
      g.ellipse(128, 96, 34, 62, 0, 0, 6.28);
      g.fill();
      g.beginPath();
      g.ellipse(128, 198, 27, 32, 0, 0, 6.28);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      for (let y = 44; y < 230; y += 13) g.fillRect(84, y, 88, 4.5);
      g.fillRect(84, 156, 88, 12);
      g.globalCompositeOperation = 'source-over';
    };
    painters[MARK.oil] = (rnd) => { // what leaked out from under a car
      for (let i = 0; i < 30; i++) {
        const x = 128 + (rnd() - 0.5) * 150;
        const y = 128 + (rnd() - 0.5) * 150;
        const radius = 20 + rnd() * 60;
        const stain = g.createRadialGradient(x, y, 0, x, y, radius);
        stain.addColorStop(0, 'rgba(4, 4, 5, 0.5)');
        stain.addColorStop(1, 'rgba(4, 4, 5, 0)');
        g.fillStyle = stain;
        g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    };
    painters[MARK.glass] = (rnd) => { // splinters of a car window
      for (let i = 0; i < 260; i++) {
        const out = Math.pow(rnd(), 0.7) * 112;
        const angle = rnd() * 6.28;
        g.save();
        g.translate(128 + Math.cos(angle) * out, 128 + Math.sin(angle) * out);
        g.rotate(rnd() * 6.28);
        g.fillStyle = 'rgba(' + (150 + rnd() * 70) + ',' + (170 + rnd() * 60) + ',' + (170 + rnd() * 60) + ',' + (0.5 + rnd() * 0.5) + ')';
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(2 + rnd() * 7, 1 + rnd() * 3);
        g.lineTo(1 + rnd() * 3, 3 + rnd() * 6);
        g.closePath();
        g.fill();
        g.restore();
      }
    };
    painters[MARK.claw] = (rnd) => { // four gouges through bark, pale wood underneath
      for (let i = 0; i < 4; i++) {
        const x = 62 + i * 42 + (rnd() - 0.5) * 10;
        g.strokeStyle = 'rgba(8, 6, 4, 0.9)';
        g.lineWidth = 11;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, 30 + rnd() * 20);
        g.quadraticCurveTo(x + 14, 128, x + 30 + (rnd() - 0.5) * 10, 216 + rnd() * 20);
        g.stroke();
        g.strokeStyle = 'rgba(150, 128, 92, 0.8)';
        g.lineWidth = 4;
        g.stroke();
      }
    };
    painters[MARK.hand] = (rnd) => { // a hand pressed on and dragged down
      g.fillStyle = '#4a100c';
      g.globalAlpha = 0.9;
      g.beginPath();
      g.ellipse(128, 86, 27, 30, 0, 0, 6.28);
      g.fill();
      [[-25, 26, -0.22], [-9, 34, -0.07], [8, 35, 0.06], [24, 28, 0.2]].forEach(([dx, length, lean]) => {
        g.save();
        g.translate(128 + dx, 62);
        g.rotate(lean);
        g.beginPath();
        g.ellipse(0, -length / 2, 6.5, length / 2 + 4, 0, 0, 6.28);
        g.fill();
        g.restore();
      });
      g.save();
      g.translate(96, 92);
      g.rotate(-0.9);
      g.beginPath();
      g.ellipse(0, -10, 7, 17, 0, 0, 6.28);
      g.fill();
      g.restore();
      g.lineCap = 'round';
      [-22, -8, 6, 20].forEach((dx) => {
        const slide = g.createLinearGradient(0, 100, 0, 246);
        slide.addColorStop(0, 'rgba(74, 16, 12, 0.8)');
        slide.addColorStop(1, 'rgba(74, 16, 12, 0)');
        g.strokeStyle = slide;
        g.lineWidth = 5 + rnd() * 9;
        g.beginPath();
        g.moveTo(128 + dx, 100);
        g.lineTo(128 + dx + (rnd() - 0.5) * 16, 180 + rnd() * 66);
        g.stroke();
      });
    };
    painters[MARK.moss] = (rnd) => {
      for (let i = 0; i < 70; i++) {
        const x = 30 + rnd() * 196;
        const y = 30 + rnd() * 196;
        const radius = 8 + rnd() * 30;
        const patch = g.createRadialGradient(x, y, 0, x, y, radius);
        patch.addColorStop(0, 'rgba(38, 50, 28, 0.55)');
        patch.addColorStop(1, 'rgba(38, 50, 28, 0)');
        g.fillStyle = patch;
        g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    };
    painters[MARK.holes] = (rnd) => { // bullet holes through painted metal: bare ring, dark hole
      for (let i = 0; i < 6; i++) {
        const x = 50 + rnd() * 156;
        const y = 50 + rnd() * 156;
        g.fillStyle = 'rgba(150, 150, 146, 0.9)';
        blob(rnd, x, y, 10 + rnd() * 6, 9, 0.5);
        g.fill();
        g.fillStyle = '#030303';
        g.beginPath();
        g.arc(x, y, 4.5 + rnd() * 2, 0, 6.28);
        g.fill();
      }
    };
    painters[MARK.splash] = (rnd) => { // mud thrown up behind a wheel: thick low down, thin above
      for (let i = 0; i < 420; i++) {
        const y = 250 - Math.pow(rnd(), 2.2) * 230;
        const x = 128 + (rnd() - 0.5) * (236 - (250 - y) * 0.5);
        g.fillStyle = 'rgba(' + (48 + rnd() * 20) + ',' + (38 + rnd() * 14) + ',' + (26 + rnd() * 10) + ',' + (0.35 + rnd() * 0.5) + ')';
        g.beginPath();
        g.ellipse(x, y, 1 + rnd() * 5 * (y / 250), 2 + rnd() * 9 * (y / 250), 0, 0, 6.28);
        g.fill();
      }
    };
    painters[MARK.leaves] = (rnd) => { // a drift of wet leaves
      const colours = ['#4a3a22', '#3d2f1c', '#55452a', '#34291a', '#5a4a30', '#2c2418'];
      for (let i = 0; i < 520; i++) {
        const out = Math.pow(rnd(), 0.8) * 112;
        const angle = rnd() * 6.28;
        g.save();
        g.translate(128 + Math.cos(angle) * out, 128 + Math.sin(angle) * out * 0.8);
        g.rotate(rnd() * 3.14);
        g.fillStyle = colours[Math.floor(rnd() * colours.length)];
        g.globalAlpha = 0.6 + rnd() * 0.4;
        g.beginPath();
        g.ellipse(0, 0, 5 + rnd() * 6, 2.5 + rnd() * 2.5, 0, 0, 6.28);
        g.fill();
        g.restore();
      }
    };
    painters[MARK.ripple] = () => { // rings spreading from a drop
      g.strokeStyle = 'rgba(200, 215, 215, 0.9)';
      [30, 62, 98].forEach((radius, i) => {
        g.lineWidth = 5 - i * 1.2;
        g.globalAlpha = 0.9 - i * 0.25;
        g.beginPath();
        g.arc(128, 128, radius, 0, 6.28);
        g.stroke();
      });
    };
    painters[MARK.soft] = () => { // a soft round patch, for faked light and mist
      const light = g.createRadialGradient(128, 128, 0, 128, 128, 124);
      light.addColorStop(0, 'rgba(255, 255, 255, 1)');
      light.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
      light.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = light;
      g.fillRect(0, 0, 256, 256);
    };
    painters.forEach((paint, index) => {
      g.save();
      g.beginPath();
      g.rect((index % 4) * 256 + 3, Math.floor(index / 4) * 256 + 3, 250, 250);
      g.clip();
      g.translate((index % 4) * 256, Math.floor(index / 4) * 256);
      paint(seeded(7919 * (index + 1)));
      g.restore();
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    return texture;
  });
}

/** Marks that lie on a surface and take light and fog like it. */
function markMaterial(factory) {
  return wetMaterial(factory, 'marks', () => ({
    map: markTexture(), roughness: 0.85, transparent: true, depthWrite: false, envMapIntensity: 0.15,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}

/** Standing water: almost a mirror, dark, showing the foggy sky. Only its outline comes from the image. */
function waterMaterial(factory) {
  return wetMaterial(factory, 'water', () => ({
    map: markTexture(), color: new THREE.Color(0.5, 0.56, 0.56), roughness: 0.02, transparent: true, depthWrite: false,
    envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
}

/**
 * Collects flat quads (each showing one cell of the marks image) and turns them into ONE mesh,
 * so any number of marks costs a single draw call.
 */
class QuadSheet {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
  }

  /** Quad through four corners (counter-clockwise seen from its front), showing one cell. */
  add(cell, a, b, c, d, normal) {
    const column = cell % 4;
    const row = Math.floor(cell / 4);
    const u0 = column / 4;
    const u1 = (column + 1) / 4;
    const v0 = 1 - (row + 1) / 4;
    const v1 = 1 - row / 4;
    const corners = [[a, u0, v0], [b, u1, v0], [c, u1, v1], [a, u0, v0], [c, u1, v1], [d, u0, v1]];
    corners.forEach(([p, u, v]) => {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.uvs.push(u, v);
    });
    return this;
  }

  /** Quad lying on the ground around (x, z); with turn 0 the top of the image points to -Z. */
  floor(cell, x, z, width, depth, turn, y) {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const corner = (dx, dz) => [x + dx * cos + dz * sin, y, z - dx * sin + dz * cos];
    const w = width / 2;
    const d = depth / 2;
    return this.add(cell, corner(-w, d), corner(w, d), corner(w, -d), corner(-w, -d), [0, 1, 0]);
  }

  get empty() {
    return this.positions.length === 0;
  }

  mesh(material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.userData.dynamic = true; // already one mesh: keep it out of the engine's batching
    return mesh;
  }
}

/** Many copies of one small shape (leaves, stones, twigs) drawn in a single call. */
function scatter(geometry, material, count, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    place(dummy, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // its bounds are those of one copy; the copies are everywhere
  mesh.receiveShadow = true;
  return mesh;
}

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
    ch1_bulb_string: Ch1Props.bulbString,
    ch1_turn_sign_right: Ch1Props.turnSignRight,
    ch1_turn_sign_left: Ch1Props.turnSignLeft,
    ch1_road: Ch1Props.road,
    ch1_ground: Ch1Props.ground,
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

  /**
   * A string of bulbs sagging between two poles, across the width (X) of `size`; some bulbs
   * are dead. Warm light 3 of 3: one light under the middle of the string stands for all.
   */
  static bulbString(ctx) {
    const { factory, size, prop } = ctx;
    const { w, h } = size;
    const string = new THREE.Group();
    [-1, 1].forEach((side) => {
      const lean = side * 0.12;
      string.add(stick(
        factory, 'ch1Pole', new THREE.Vector3(side * w * 0.5, 0, 0), new THREE.Vector3(side * w * 0.5 + lean, h, 0), 0.06
      ));
    });

    const bulbs = Math.max(5, Math.round(w / 0.9));
    const sag = Math.min(1.1, w * 0.1);
    const pointAt = (t) => new THREE.Vector3((t - 0.5) * w, h - 0.15 - sag * 4 * t * (1 - t), 0);
    const glow = warmMaterial(factory, 'ch1Bulb');
    const bulb = new THREE.SphereGeometry(0.07, 6, 5);
    for (let i = 0; i <= bulbs; i++) {
      const from = pointAt(i / (bulbs + 1));
      const to = pointAt((i + 1) / (bulbs + 1));
      const wire = stick(factory, 'ch1Pole', from, to, 0.012, 3);
      wire.castShadow = false;
      string.add(wire);
      if (i === bulbs) break;
      const dead = i % 4 === 2 || hash01(prop, 10 + i) < 0.12;
      const lamp = dead
        ? new THREE.Mesh(bulb, factory.material('ch1Pole'))
        : glowing(bulb, glow);
      lamp.position.copy(to).y -= 0.1;
      string.add(lamp);
    }

    const light = warmLight(factory, 'ch1Bulb');
    if (light) {
      light.position.set(0, h - sag - 0.6, 0);
      string.add(light);
    }
    return string;
  }

  /** Bend warning board whose chevrons point to the right of someone facing it. */
  static turnSignRight(ctx) {
    return Ch1Props._turnSign(ctx, -1);
  }

  /** Bend warning board whose chevrons point to the left of someone facing it. */
  static turnSignLeft(ctx) {
    return Ch1Props._turnSign(ctx, 1);
  }

  /**
   * A dark board on two posts with three faintly glowing chevrons (palette greybox.ch1Sign).
   * It has no light of its own: it is a marker to walk toward, not a lamp. Front toward -Z;
   * `direction` is +1 when the chevrons point toward +X, -1 toward -X.
   */
  static _turnSign(ctx, direction) {
    const { factory, size } = ctx;
    const { w, h, d } = size;
    const boardHeight = Math.min(0.55, h * 0.34);
    const sign = new THREE.Group();
    [-1, 1].forEach((side) => sign.add(part(factory, 'ch1Pole', 0.07, h, 0.07, side * w * 0.36, 0, d / 2)));
    sign.add(part(factory, 'ch1Pole', w, boardHeight, d, 0, h - boardHeight, 0));

    const paint = warmMaterial(factory, 'ch1Sign');
    const centreY = h - boardHeight / 2;
    const arm = boardHeight * 0.3;
    const bar = new THREE.BoxGeometry(arm * 2 * Math.SQRT2 * 0.5 + 0.05, 0.06, 0.02);
    [-1, 0, 1].forEach((slot) => {
      [-1, 1].forEach((half) => {
        const stroke = glowing(bar, paint);
        stroke.position.set(slot * w * 0.28, centreY + half * arm * 0.5, -d / 2 - 0.012);
        stroke.rotation.z = -half * direction * (Math.PI / 4);
        sign.add(stroke);
      });
    });
    return sign;
  }

  /**
   * One leg of the road, along the longer side of `size`: cracked, patched tarmac with worn
   * lines and a broken edge, half wet everywhere and standing water in the low places; pot holes,
   * drifts of leaves and muddy prints on top; leaves, grit and twigs along the shoulders.
   * Nothing here collides. Three draw calls for the surface and its marks, three for the litter.
   */
  static road(ctx) {
    const { factory, size, prop } = ctx;
    const alongX = size.w > size.d;
    const width = alongX ? size.d : size.w;
    const length = (alongX ? size.w : size.d) + 0.8; // legs overlap a little where they meet
    const half = width / 2;
    const rnd = seeded(Math.floor(hash01(prop, 1) * 1e6) + 17);
    const leg = new THREE.Group();

    const textures = roadTextures();
    const asphalt = wetMaterial(factory, 'road', () => ({
      map: textures.map, roughnessMap: textures.roughnessMap, alphaTest: 0.5,
      color: tint(factory, 'ch1RoadTint'), envMapIntensity: 0.55,
    }));
    const geometry = new THREE.PlaneGeometry(width, length);
    geometry.rotateX(-Math.PI / 2);
    const uv = geometry.attributes.uv;
    const tile = ROAD_TILE * (0.9 + 0.3 * rnd()); // each leg repeats at its own length
    const start = rnd();
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * length) / tile + start);
    const surface = new THREE.Mesh(geometry, asphalt);
    surface.position.y = 0.03 + 0.004 * rnd();
    surface.receiveShadow = true;
    surface.userData.dynamic = true;
    leg.add(surface);

    const marks = new QuadSheet();
    const water = new QuadSheet();
    const holes = 1 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < holes; i++) {
      const x = (rnd() - 0.5) * width * 0.6;
      const z = (rnd() - 0.5) * length * 0.7;
      const across = 0.9 + rnd() * 0.7;
      marks.floor(MARK.pothole, x, z, across, across * 0.8, rnd() * 6.28, 0.04);
      water.floor(MARK.puddleA, x, z, across * 0.75, across * 0.6, rnd() * 6.28, 0.044);
    }
    // standing water from the size of a hand to three metres, mostly at the edges and in the wheel tracks
    const pools = Math.round(length / 5);
    for (let i = 0; i < pools; i++) {
      const pick = rnd();
      const across = pick < 0.5 ? 0.15 + rnd() * 0.5 : pick < 0.88 ? 0.7 + rnd() * 1.1 : 2 + rnd() * 1.2;
      const x = rnd() < 0.65 ? (rnd() < 0.5 ? -1 : 1) * (half - 0.3 - rnd() * 0.9) : (rnd() - 0.5) * width * 0.7;
      water.floor(rnd() < 0.5 ? MARK.puddleA : MARK.puddleB, x, (rnd() - 0.5) * length, across, across * (0.5 + rnd() * 0.6), rnd() * 6.28, 0.043);
    }
    const drifts = Math.round(length / 9);
    for (let i = 0; i < drifts; i++) {
      const x = (rnd() < 0.5 ? -1 : 1) * (half - 0.2 + rnd() * 0.8);
      marks.floor(MARK.leaves, x, (rnd() - 0.5) * length, 1.4 + rnd() * 1.6, 0.9 + rnd(), rnd() * 6.28, 0.041);
    }
    for (let walker = 0; walker < 2; walker++) { // somebody came through here on foot, out of the mud
      let x = (rnd() - 0.5) * width * 0.7;
      let z = (rnd() - 0.5) * length * 0.8;
      let heading = (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.8;
      const steps = 10 + Math.floor(rnd() * 8);
      for (let i = 0; i < steps; i++) {
        heading += (rnd() - 0.5) * 0.25;
        x += -Math.sin(heading) * 0.66;
        z += -Math.cos(heading) * 0.66;
        if (Math.abs(x) > half - 0.3) break;
        const side = (i % 2 ? 1 : -1) * 0.1;
        marks.floor(MARK.steps, x + Math.cos(heading) * side, z - Math.sin(heading) * side, 0.13, 0.3, heading, 0.042);
      }
    }
    const markMesh = marks.mesh(markMaterial(factory));
    markMesh.renderOrder = 1;
    const waterMesh = water.mesh(waterMaterial(factory));
    waterMesh.renderOrder = 2;
    leg.add(markMesh, waterMesh);

    // litter along the shoulders: thick at the edge of the tarmac, thinning both ways
    const leafMaterial = wetMaterial(factory, 'leaf', () => ({
      color: Palette.color(typeof factory.greybox.ch1Leaf === 'string' ? factory.greybox.ch1Leaf : '#2e2416'),
      roughness: 0.45, side: THREE.DoubleSide, envMapIntensity: 0.3,
    }));
    const leaf = new THREE.PlaneGeometry(0.085, 0.05);
    leaf.rotateX(-Math.PI / 2);
    leg.add(scatter(leaf, leafMaterial, Math.round(length * 9), (o) => {
      const loose = rnd() < 0.12;
      const x = loose ? (rnd() - 0.5) * width : (rnd() < 0.5 ? -1 : 1) * (half - 0.7 + rnd() * rnd() * 3.2);
      o.position.set(x, 0.036 + rnd() * 0.02, (rnd() - 0.5) * length);
      o.rotation.set(rnd() * 0.5 - 0.25, rnd() * 6.28, rnd() * 0.5 - 0.25);
      o.scale.setScalar(0.7 + rnd() * 0.9);
    }));
    leg.add(scatter(new THREE.IcosahedronGeometry(0.03, 0), factory.material('ch1Rock'), Math.round(length * 5), (o) => {
      o.position.set((rnd() < 0.5 ? -1 : 1) * (half + (rnd() - 0.35) * 1.4), 0.03, (rnd() - 0.5) * length);
      o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      o.scale.set(0.5 + rnd() * 1.7, 0.4 + rnd() * 0.6, 0.5 + rnd() * 1.7);
    }));
    const twig = new THREE.CylinderGeometry(0.008, 0.012, 1, 4);
    twig.rotateZ(Math.PI / 2);
    leg.add(scatter(twig, factory.material('ch1Log'), Math.round(length * 1.4), (o) => {
      o.position.set((rnd() - 0.5) * width * 1.3, 0.045, (rnd() - 0.5) * length);
      o.rotation.set(0, rnd() * 6.28, (rnd() - 0.5) * 0.2);
      o.scale.set(0.15 + rnd() * 0.55, 1, 1);
    }));

    if (alongX) leg.rotation.y = Math.PI / 2;
    const placed = new THREE.Group();
    placed.add(leg);
    return placed;
  }

  /**
   * The forest floor under everything: wet earth, moss, a layer of leaves and twigs, brown water
   * standing in the hollows. One flat sheet; `size` is how much of the level it covers.
   */
  static ground(ctx) {
    const { factory, size } = ctx;
    const textures = groundTextures();
    const material = wetMaterial(factory, 'ground', () => ({
      map: textures.map, roughnessMap: textures.roughnessMap,
      color: tint(factory, 'ch1GroundTint'), envMapIntensity: 0.35,
    }));
    const geometry = new THREE.PlaneGeometry(size.w, size.d);
    geometry.rotateX(-Math.PI / 2);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * size.w) / 8, (uv.getY(i) * size.d) / 8);
    const floor = new THREE.Mesh(geometry, material);
    floor.position.y = 0.012;
    floor.receiveShadow = true;
    floor.userData.dynamic = true;
    return floor;
  }
}
