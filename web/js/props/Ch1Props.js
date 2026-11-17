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
        let grey = 92 + 36 * grain[i] + 26 * (broad[i] - 0.5) + 6 * track + (speck < 0.03 ? 34 : speck > 0.975 ? -26 : 0);
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
          r += (88 * tone - r) * mud;
          g += (72 * tone - g) * mud;
          b += (52 * tone - b) * mud;
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
      let r = 74 * tone;
      let g = 64 * tone;
      let b = 48 * tone;
      const green = smoothstep(0.56, 0.7, moss[i]);
      r += (52 * tone - r) * green * 0.8;
      g += (68 * tone - g) * green * 0.8;
      b += (40 * tone - b) * green * 0.8;
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
  splash: 12, leaves: 13, cracks: 14, soft: 15,
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
    painters[MARK.cracks] = (rnd) => { // glass hit at one point: rays to the edge, rings between them
      g.strokeStyle = 'rgba(214, 226, 226, 0.85)';
      g.lineCap = 'round';
      const cx = 110 + rnd() * 36;
      const cy = 110 + rnd() * 36;
      for (let i = 0; i < 15; i++) {
        let x = cx;
        let y = cy;
        let heading = (i / 15) * 6.28 + (rnd() - 0.5) * 0.3;
        g.lineWidth = 0.8 + rnd() * 1.2;
        g.beginPath();
        g.moveTo(x, y);
        for (let step = 0; step < 9; step++) {
          heading += (rnd() - 0.5) * 0.3;
          x += Math.cos(heading) * 17;
          y += Math.sin(heading) * 17;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.lineWidth = 0.8;
      [24, 50, 82].forEach((radius) => {
        for (let i = 0; i < 15; i++) {
          if (rnd() < 0.3) continue;
          const a0 = (i / 15) * 6.28;
          const a1 = ((i + 1) / 15) * 6.28;
          g.beginPath();
          g.moveTo(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius);
          g.lineTo(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius);
          g.stroke();
        }
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

// ================================================================================================
// The forest. Trees are grown by a small program (trunk that flares into roots, bends and tapers;
// branches that fork into twigs), a handful of shapes each, and every tree in the level is one
// *copy* of a shape: turned, scaled and leaned differently, drawn with InstancedMesh.
//
// Detail follows the distance from the road, because the player cannot leave it:
//   up to 11.5 m from the centre line   full trees
//   up to 19 m                          simplified trees
//   beyond                              flat silhouettes that always face the camera
// ================================================================================================

const NEAR_TREES = 11.5;
const MID_TREES = 19;

function newBuffers() {
  return { positions: [], normals: [], uvs: [], colors: [], index: [] };
}

function toGeometry(buffers) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  if (buffers.colors.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  if (buffers.index.length) geometry.setIndex(buffers.index);
  geometry.computeBoundingSphere();
  return geometry;
}

const _tangent = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _point = new THREE.Vector3();

/**
 * Adds a tube that follows `path` ([{ p: Vector3, r: radius }, ...]) to the buffers: the way a
 * trunk, a root or a branch is built. Bark runs along it; `shade(y)` darkens it near the ground.
 */
function addTube(buffers, path, sides, shade) {
  const first = buffers.positions.length / 3;
  let along = 0;
  for (let i = 0; i < path.length; i++) {
    const here = path[i];
    const before = path[Math.max(0, i - 1)].p;
    const after = path[Math.min(path.length - 1, i + 1)].p;
    _tangent.subVectors(after, before).normalize();
    _side.set(1, 0, 0);
    if (Math.abs(_tangent.x) > 0.9) _side.set(0, 0, 1);
    _up.crossVectors(_tangent, _side).normalize();
    _side.crossVectors(_up, _tangent).normalize();
    if (i > 0) along += here.p.distanceTo(path[i - 1].p);
    const tone = shade(here.p.y);
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      _point.copy(_side).multiplyScalar(cos).addScaledVector(_up, sin);
      buffers.normals.push(_point.x, _point.y, _point.z);
      buffers.positions.push(here.p.x + _point.x * here.r, here.p.y + _point.y * here.r, here.p.z + _point.z * here.r);
      buffers.uvs.push((j / sides) * Math.max(1, Math.round(here.r * 9)), along * 0.55);
      buffers.colors.push(tone[0], tone[1], tone[2]);
    }
  }
  const ring = sides + 1;
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = first + i * ring + j;
      const b = a + ring;
      buffers.index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
}

/** Adds a flat card showing one cell (2 x 2) of the foliage image: leaves, grass, fern, hanging moss. */
function addCard(buffers, cell, centre, right, up, width, height) {
  const first = buffers.positions.length / 3;
  const u0 = (cell % 2) / 2;
  const v0 = 1 - (Math.floor(cell / 2) + 1) / 2;
  [[-0.5, 0, u0, v0], [0.5, 0, u0 + 0.5, v0], [0.5, 1, u0 + 0.5, v0 + 0.5], [-0.5, 1, u0, v0 + 0.5]].forEach(([sx, sy, u, v]) => {
    buffers.positions.push(
      centre.x + right.x * sx * width + up.x * sy * height,
      centre.y + right.y * sx * width + up.y * sy * height,
      centre.z + right.z * sx * width + up.z * sy * height
    );
    buffers.normals.push(0, 1, 0); // lit from above like the ground: foliage has no "side"
    buffers.uvs.push(u, v);
  });
  buffers.index.push(first, first + 1, first + 2, first, first + 2, first + 3);
}

const FOLIAGE = Object.freeze({ leaves: 0, grass: 1, fern: 2, moss: 3 });

/**
 * Grows one tree shape. kind: 'leafy' (tall, in leaf), 'dead' (bare) or 'sapling' (thin);
 * detail 2 = full (roots, twigs), 1 = simplified.
 * @returns {{wood: BufferGeometry, foliage: BufferGeometry|null, proxy: BufferGeometry}}
 */
function growTree(seed, kind, detail) {
  const rnd = seeded(seed);
  const wood = newBuffers();
  const cards = newBuffers();
  const proxy = newBuffers();
  const height = kind === 'sapling' ? 4.2 + rnd() * 1.6 : 8.5 + rnd() * 3;
  const base = kind === 'sapling' ? 0.06 + rnd() * 0.03 : 0.2 + rnd() * 0.08;
  // bark is darker and green with moss toward the ground
  const shade = (y) => {
    const t = smoothstep(0.2, 2.6, y);
    return [0.5 + 0.5 * t, 0.62 + 0.38 * t, 0.46 + 0.54 * t];
  };
  const bendX = (rnd() - 0.5) * 0.9;
  const bendZ = (rnd() - 0.5) * 0.9;
  const phase = rnd() * 6;
  const centre = (t) => new THREE.Vector3(
    bendX * Math.sin(t * 2.4 + phase) * height * 0.035 + bendX * t * t * height * 0.05,
    t * height,
    bendZ * Math.cos(t * 2.1 + phase) * height * 0.035 + bendZ * t * t * height * 0.05
  );
  const radius = (t) => base * (1 - 0.8 * t) * (t < 0.1 ? 1 + (0.1 - t) * 9 : 1);
  const rings = detail === 2 ? 6 : 3;
  const trunk = [];
  for (let i = 0; i <= rings; i++) trunk.push({ p: centre(i / rings), r: radius(i / rings) });
  addTube(wood, trunk, detail === 2 ? 6 : 4, shade);
  addTube(proxy, [trunk[0], trunk[Math.floor(rings / 2)], trunk[rings]], 4, shade);

  if (detail === 2 && kind !== 'sapling') { // roots breaking out of the ground
    const roots = 4 + Math.floor(rnd() * 2);
    for (let i = 0; i < roots; i++) {
      const angle = (i / roots) * Math.PI * 2 + rnd() * 0.8;
      const reach = base * (2.6 + rnd() * 2.2);
      addTube(wood, [
        { p: new THREE.Vector3(Math.cos(angle) * base * 0.5, 0.32, Math.sin(angle) * base * 0.5), r: base * 0.5 },
        { p: new THREE.Vector3(Math.cos(angle) * reach * 0.55, 0.1, Math.sin(angle) * reach * 0.55), r: base * 0.3 },
        { p: new THREE.Vector3(Math.cos(angle + 0.2) * reach, -0.06, Math.sin(angle + 0.2) * reach), r: base * 0.08 },
      ], 4, shade);
    }
  }

  const tips = [];
  const limbs = detail === 2 ? (kind === 'sapling' ? 4 : 5 + Math.floor(rnd() * 3)) : 3;
  for (let i = 0; i < limbs; i++) {
    const t0 = (kind === 'dead' ? 0.3 : 0.42) + rnd() * 0.55;
    const origin = centre(t0);
    const r0 = radius(t0) * (0.45 + rnd() * 0.2);
    const azimuth = rnd() * Math.PI * 2;
    const rise = (kind === 'dead' ? -8 + rnd() * 50 : 15 + rnd() * 45) * DEG;
    const length = height * (0.2 + 0.24 * rnd()) * (1.15 - t0 * 0.6);
    const direction = new THREE.Vector3(Math.cos(azimuth) * Math.cos(rise), Math.sin(rise), Math.sin(azimuth) * Math.cos(rise));
    const limb = [];
    const kink = new THREE.Vector3((rnd() - 0.5) * 0.5, 0.25 + rnd() * 0.4, (rnd() - 0.5) * 0.5);
    for (let s = 0; s <= 3; s++) {
      const f = s / 3;
      const p = origin.clone().addScaledVector(direction, length * f).addScaledVector(kink, length * 0.25 * f * f);
      limb.push({ p, r: r0 * (1 - 0.85 * f) + 0.006 });
    }
    addTube(wood, limb, detail === 2 ? 4 : 3, shade);
    if (i < 3) addTube(proxy, [limb[0], limb[3]], 3, shade);
    tips.push(limb[3].p, limb[2].p);
    if (detail === 2) {
      const twigs = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < twigs; k++) {
        const from = limb[1 + Math.floor(rnd() * 2)];
        const turn = new THREE.Vector3(direction.x + (rnd() - 0.5) * 1.4, direction.y + rnd() * 0.7, direction.z + (rnd() - 0.5) * 1.4).normalize();
        const reach = length * (0.3 + rnd() * 0.3);
        const end = from.p.clone().addScaledVector(turn, reach);
        addTube(wood, [{ p: from.p, r: from.r * 0.55 }, { p: from.p.clone().addScaledVector(turn, reach * 0.5).add(new THREE.Vector3(0, reach * 0.06, 0)), r: from.r * 0.3 }, { p: end, r: 0.005 }], 3, shade);
        tips.push(end);
      }
    }
    // moss or a vine hanging from the limb
    if (kind !== 'sapling' && rnd() < (detail === 2 ? 0.45 : 0.2)) {
      const hang = limb[1 + Math.floor(rnd() * 2)].p;
      const drop = 0.8 + rnd() * 1.6;
      const across = new THREE.Vector3(Math.cos(azimuth + 1.57), 0, Math.sin(azimuth + 1.57));
      addCard(cards, FOLIAGE.moss, new THREE.Vector3(hang.x, hang.y - drop, hang.z), across, new THREE.Vector3(0, 1, 0), 0.5 + rnd() * 0.5, drop);
    }
  }
  if (kind !== 'dead') { // leaves in loose sprays at the ends of the branches: no cones, no balls
    tips.push(centre(1), centre(0.9));
    tips.forEach((tip) => {
      const sprays = detail === 2 ? 2 : 1;
      for (let k = 0; k < sprays; k++) {
        const angle = rnd() * Math.PI;
        const right = new THREE.Vector3(Math.cos(angle), (rnd() - 0.5) * 0.5, Math.sin(angle)).normalize();
        const up = new THREE.Vector3((rnd() - 0.5) * 0.6, 1, (rnd() - 0.5) * 0.6).normalize();
        const spread = (kind === 'sapling' ? 0.9 : 1.7) * (0.7 + rnd() * 0.7);
        addCard(cards, FOLIAGE.leaves, new THREE.Vector3(tip.x, tip.y - spread * 0.5, tip.z), right, up, spread, spread);
      }
    });
  }
  return { wood: toGeometry(wood), foliage: cards.positions.length ? toGeometry(cards) : null, proxy: toGeometry(proxy) };
}

/** Bark: long vertical furrows, dark and wet. Tiles in both directions. */
function barkTexture() {
  return paintedOnce('bark', () => {
    const S = 256;
    const canvas = makeCanvas(S, S);
    const g = canvas.getContext('2d');
    const broad = cloud(S, S, 8, 2, 3, 301);
    const fine = cloud(S, S, 48, 6, 2, 302);
    const data = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const ridge = Math.pow(broad[i], 1.6);
      const tone = 0.35 + 0.9 * ridge + 0.35 * (fine[i] - 0.5);
      data.data[i * 4] = 62 * tone;
      data.data[i * 4 + 1] = 54 * tone;
      data.data[i * 4 + 2] = 44 * tone;
      data.data[i * 4 + 3] = 255;
    }
    g.putImageData(data, 0, 0);
    const rnd = seeded(303);
    g.strokeStyle = 'rgba(6, 5, 4, 0.75)';
    for (let i = 0; i < 46; i++) { // deep cracks
      let x = rnd() * S;
      g.lineWidth = 1 + rnd() * 2.2;
      for (const shift of [-S, 0, S]) {
        const local = seeded(3000 + i);
        let cx = x + shift;
        g.beginPath();
        g.moveTo(cx, -4);
        for (let y = 12; y <= S + 8; y += 14) {
          cx += (local() - 0.5) * 7;
          g.lineTo(cx, y);
        }
        g.stroke();
      }
    }
    return colourTexture(canvas);
  });
}

/** Leaves, grass, fern and hanging moss as cut-out pictures, 2 x 2 cells. */
function foliageTexture() {
  return paintedOnce('foliage', () => {
    const canvas = makeCanvas(512, 512);
    const g = canvas.getContext('2d');
    const cell = (index, paint) => {
      g.save();
      g.beginPath();
      g.rect((index % 2) * 256 + 2, Math.floor(index / 2) * 256 + 2, 252, 252);
      g.clip();
      g.translate((index % 2) * 256, Math.floor(index / 2) * 256);
      paint(seeded(977 * (index + 3)));
      g.restore();
    };
    const greens = ['#1f2a18', '#263220', '#1a2214', '#2b3320', '#22281a', '#2f3222'];
    cell(FOLIAGE.leaves, (rnd) => { // twigs with small leaves, thinning toward the rim
      g.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const angle = rnd() * 6.28;
        const reach = 40 + rnd() * 78;
        g.strokeStyle = '#120f0b';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(128, 128);
        g.lineTo(128 + Math.cos(angle) * reach, 128 + Math.sin(angle) * reach);
        g.stroke();
        for (let k = 0; k < 16; k++) {
          const along = 0.25 + rnd() * 0.8;
          g.save();
          g.translate(128 + Math.cos(angle) * reach * along + (rnd() - 0.5) * 18, 128 + Math.sin(angle) * reach * along + (rnd() - 0.5) * 18);
          g.rotate(rnd() * 6.28);
          g.fillStyle = greens[Math.floor(rnd() * greens.length)];
          g.beginPath();
          g.ellipse(0, 0, 4 + rnd() * 5, 2 + rnd() * 2, 0, 0, 6.28);
          g.fill();
          g.restore();
        }
      }
    });
    cell(FOLIAGE.grass, (rnd) => { // blades from the bottom edge, bending outward
      g.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const x = 128 + (rnd() - 0.5) * 120;
        const lean = (x - 128) * 0.9 + (rnd() - 0.5) * 70;
        const tall = 90 + rnd() * 150;
        g.strokeStyle = greens[Math.floor(rnd() * greens.length)];
        g.lineWidth = 2 + rnd() * 3;
        g.beginPath();
        g.moveTo(x, 256);
        g.quadraticCurveTo(x + lean * 0.3, 256 - tall * 0.6, x + lean, 256 - tall);
        g.stroke();
      }
    });
    cell(FOLIAGE.fern, (rnd) => { // one frond: a rib from the bottom with leaflets both sides
      g.strokeStyle = '#141a10';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(128, 256);
      g.quadraticCurveTo(120, 130, 150, 12);
      g.stroke();
      for (let i = 0; i < 34; i++) {
        const t = i / 34;
        const x = 128 - 8 * Math.sin(t * 3) + 22 * t * t;
        const y = 250 - t * 236;
        const span = (1 - t * 0.85) * (70 + rnd() * 20);
        [-1, 1].forEach((side) => {
          g.fillStyle = greens[Math.floor(rnd() * greens.length)];
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + side * span * 0.5, y - 14, x + side * span, y - 4 + rnd() * 10);
          g.quadraticCurveTo(x + side * span * 0.5, y + 6, x, y + 5);
          g.fill();
        });
      }
    });
    cell(FOLIAGE.moss, (rnd) => { // strands hanging from the top edge, different lengths
      g.lineCap = 'round';
      for (let i = 0; i < 38; i++) {
        let x = 20 + rnd() * 216;
        const drop = 60 + Math.pow(rnd(), 0.7) * 190;
        g.strokeStyle = rnd() < 0.5 ? '#232a1c' : '#2b2f22';
        g.lineWidth = 1 + rnd() * 2.5;
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 16; y <= drop; y += 16) {
          x += (rnd() - 0.5) * 7;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    return texture;
  });
}

/** Four tree outlines for the far layers, drawn branch by branch, 2 x 2 cells. */
function silhouetteTexture() {
  return paintedOnce('silhouettes', () => {
    const canvas = makeCanvas(512, 512);
    const g = canvas.getContext('2d');
    g.strokeStyle = '#000';
    g.fillStyle = '#000';
    g.lineCap = 'round';
    for (let index = 0; index < 4; index++) {
      const rnd = seeded(5000 + index * 31);
      g.save();
      g.beginPath();
      g.rect((index % 2) * 256 + 2, Math.floor(index / 2) * 256 + 2, 252, 252);
      g.clip();
      g.translate((index % 2) * 256, Math.floor(index / 2) * 256);
      const leafy = index < 2;
      const branch = (x, y, angle, length, width, depth) => {
        const ex = x + Math.cos(angle) * length;
        const ey = y - Math.sin(angle) * length;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(ex, ey);
        g.stroke();
        if (depth === 0) {
          if (leafy) {
            g.globalAlpha = 0.9;
            for (let k = 0; k < 5; k++) {
              g.beginPath();
              g.ellipse(ex + (rnd() - 0.5) * 22, ey + (rnd() - 0.5) * 18, 6 + rnd() * 9, 4 + rnd() * 6, rnd() * 3, 0, 6.28);
              g.fill();
            }
            g.globalAlpha = 1;
          }
          return;
        }
        const forks = 2 + (rnd() < 0.4 ? 1 : 0);
        for (let k = 0; k < forks; k++) {
          branch(ex, ey, angle + (rnd() - 0.5) * 1.5, length * (0.55 + rnd() * 0.25), Math.max(1, width * 0.6), depth - 1);
        }
      };
      let x = 128 + (rnd() - 0.5) * 20;
      let y = 256;
      let angle = Math.PI / 2 + (rnd() - 0.5) * 0.15;
      for (let step = 0; step < 6; step++) { // the trunk, with a limb at every step
        const length = 34 + rnd() * 10;
        const width = 13 - step * 1.9;
        const ex = x + Math.cos(angle) * length;
        const ey = y - Math.sin(angle) * length;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(ex, ey);
        g.stroke();
        if (step > 0) {
          const side = step % 2 ? 1 : -1;
          branch(ex, ey, angle + side * (0.6 + rnd() * 0.7), 46 - step * 4 + rnd() * 20, Math.max(1.5, width * 0.5), 2);
        }
        x = ex;
        y = ey;
        angle += (rnd() - 0.5) * 0.25;
      }
      branch(x, y, angle, 30, 3, 2);
      g.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  });
}

/** The forest of one level: every tree, plant and far outline as copies in a few InstancedMesh. */
class Forest {
  constructor(factory) {
    this.factory = factory;
    /** Road legs registered by the road builder: { x1, z1, x2, z2 } centre lines in level space. */
    this.roads = [];
    this.holder = null;
    this.meshes = new Map();
    this.shapes = null;
    this.dummy = new THREE.Object3D();
    this.populated = false;
    this.counts = { full: 0, simple: 0, flat: 0, plants: 0 };
  }

  /**
   * Returns what a builder hands back to the engine. The first caller gets the group that holds
   * the whole forest (moved back so the copies stay in level space); everyone else an empty group.
   */
  anchor(prop) {
    const group = new THREE.Group();
    if (!this.holder) {
      this.holder = new THREE.Group();
      const placed = new THREE.Matrix4().compose(
        new THREE.Vector3(prop.x, prop.y, prop.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, prop.rotY * DEG, 0)),
        new THREE.Vector3(prop.scale, prop.scale, prop.scale)
      );
      this.holder.matrix.copy(placed).invert();
      this.holder.matrixAutoUpdate = false;
      group.add(this.holder);
    }
    return group;
  }

  /** Distance from the nearest road centre line, which leg it is, and the direction away from it. */
  nearest(x, z) {
    let best = null;
    this.roads.forEach((road, leg) => {
      const dx = road.x2 - road.x1;
      const dz = road.z2 - road.z1;
      const t = clamp01(((x - road.x1) * dx + (z - road.z1) * dz) / (dx * dx + dz * dz));
      const px = road.x1 + dx * t;
      const pz = road.z1 + dz * t;
      const dist = Math.hypot(x - px, z - pz);
      if (!best || dist < best.dist) best = { dist, leg, t, along: t * Math.hypot(dx, dz), outX: (x - px) / (dist || 1), outZ: (z - pz) / (dist || 1) };
    });
    return best;
  }

  /** Every 45 m or so the trees on one side leave a gap a few metres wide: fog and deeper dark, nothing else. */
  inGap(near, x, z) {
    const road = this.roads[near.leg];
    const sideSign = (x - road.x1) * (road.z2 - road.z1) - (z - road.z1) * (road.x2 - road.x1) > 0 ? 1 : 0;
    const slot = (near.along + sideSign * 22 + near.leg * 9) % 45;
    return slot > 20 && slot < 25.5;
  }

  shapesOnce() {
    if (this.shapes) return this.shapes;
    const kinds = ['leafy', 'leafy', 'leafy', 'dead', 'dead', 'sapling'];
    this.shapes = {
      full: kinds.map((kind, i) => growTree(811 + i * 53, kind, 2)),
      simple: kinds.map((kind, i) => growTree(811 + i * 53, kind, 1)),
    };
    return this.shapes;
  }

  materials() {
    const factory = this.factory;
    return {
      bark: wetMaterial(factory, 'bark', () => ({ map: barkTexture(), vertexColors: true, roughness: 0.72, color: tint(factory, 'ch1BarkTint'), envMapIntensity: 0.2 })),
      foliage: wetMaterial(factory, 'foliage', () => ({ map: foliageTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, color: tint(factory, 'ch1FoliageTint'), envMapIntensity: 0.25 })),
      shadow: wetMaterial(factory, 'shadow-only', () => ({ colorWrite: false, depthWrite: false, envMap: null })),
      flat: this.flatMaterial(),
    };
  }

  /** Unlit outline for the far layers; its cards are turned to the camera in the vertex shader. */
  flatMaterial() {
    const set = wetSet(this.factory);
    if (!set.has('flat')) {
      const material = new THREE.MeshBasicMaterial({
        map: silhouetteTexture(), alphaTest: 0.5,
        color: Palette.color(typeof this.factory.greybox.ch1Silhouette === 'string' ? this.factory.greybox.ch1Silhouette : '#050706'),
      });
      material.name = 'ch1:far-trees';
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', [
          'vec4 mvPosition = vec4( 0.0, transformed.y, 0.0, 1.0 );',
          '#ifdef USE_INSTANCING',
          '  mvPosition = instanceMatrix * mvPosition;',
          '  float cardScale = length( instanceMatrix[ 0 ].xyz );',
          '#else',
          '  float cardScale = 1.0;',
          '#endif',
          'mvPosition = modelViewMatrix * mvPosition;',
          'mvPosition.x += transformed.x * cardScale;',
          'gl_Position = projectionMatrix * mvPosition;',
        ].join('\n'));
      };
      set.set('flat', material);
    }
    return set.get('flat');
  }

  /** Adds one copy of `geometry` to the InstancedMesh called `key` of a road leg. */
  plant(key, leg, geometry, material, options) {
    const id = key + ':' + leg;
    let mesh = this.meshes.get(id);
    if (!mesh) {
      // each leg gets its own view of the geometry with bounds that cover the whole leg,
      // so a leg that is out of sight or beyond the fog is not drawn at all
      const view = new THREE.BufferGeometry();
      view.attributes = geometry.attributes;
      view.index = geometry.index;
      const road = this.roads[leg] || { x1: 0, z1: 0, x2: 0, z2: 0 };
      view.boundingSphere = new THREE.Sphere(
        new THREE.Vector3((road.x1 + road.x2) / 2, 4, (road.z1 + road.z2) / 2),
        Math.hypot(road.x2 - road.x1, road.z2 - road.z1) / 2 + 42
      );
      mesh = new THREE.InstancedMesh(view, material, options.capacity);
      mesh.frustumCulled = this.roads.length > 0;
      mesh.count = 0;
      mesh.castShadow = Boolean(options.castShadow);
      mesh.receiveShadow = Boolean(options.receiveShadow);
      mesh.name = 'forest:' + id;
      this.meshes.set(id, mesh);
      this.holder.add(mesh);
    }
    if (mesh.count >= mesh.instanceMatrix.count) return;
    this.dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count++, this.dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Plants a tree at (x, z). `pick`, `turn`, `scale`, `lean` are 0..1 numbers that decide shape,
   * rotation, size (0.7 to 1.4) and tilt (0 to 8 degrees); `toward` leans it over the road instead.
   */
  tree(x, z, near, pick, turn, scale, lean, toward) {
    const shapes = this.shapesOnce();
    const materials = this.materials();
    const variant = pick < 0.5 ? Math.floor(pick * 6) : pick < 0.8 ? 3 + Math.floor((pick - 0.5) / 0.15) : 5;
    const size = 0.7 + 0.7 * scale;
    const dist = near ? near.dist : 0;
    const leg = near ? near.leg : 0;
    const d = this.dummy;
    d.position.set(x, 0, z);
    if (dist > MID_TREES) {
      d.rotation.set(0, 0, 0);
      d.scale.set(size * 6.5, size * 11.5, 1);
      this.plant('flat' + (variant % 4), leg, this.cardGeometry(variant % 4), materials.flat, { capacity: 700 });
      this.counts.flat++;
      return;
    }
    const tilt = (toward ? 5 + 9 * lean : 8 * lean) * DEG;
    const fall = toward && near ? Math.atan2(-near.outX, -near.outZ) : turn * 17;
    d.rotation.set(0, 0, 0);
    d.quaternion.setFromAxisAngle(_side.set(Math.cos(fall), 0, -Math.sin(fall)), tilt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(_up.set(0, 1, 0), turn * Math.PI * 2));
    d.scale.setScalar(size);
    const full = dist <= NEAR_TREES;
    // the simplified tier makes do with three shapes: one in leaf, one bare, one thin
    const use = full ? variant : [0, 0, 0, 3, 3, 5][variant];
    const shape = (full ? shapes.full : shapes.simple)[use];
    const tag = (full ? 'full' : 'simple') + use;
    this.plant(tag, leg, shape.wood, materials.bark, { capacity: 600, receiveShadow: true });
    if (shape.foliage) this.plant(tag + '-leaves', leg, shape.foliage, materials.foliage, { capacity: 600 });
    // shadows come from one very plain stand-in shape, not from every twig
    if (full) this.plant('proxy', leg, shapes.full[3].proxy, materials.shadow, { capacity: 900, castShadow: true });
    this.counts[full ? 'full' : 'simple']++;
  }

  cardGeometry(cell) {
    return paintedOnce('card' + cell, () => {
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.translate(0, 0.5, 0);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ((cell % 2) + uv.getX(i)) / 2, 1 - (Math.floor(cell / 2) + 1 - uv.getY(i)) / 2);
      return geometry;
    });
  }

  /** Low plants: a tuft of grass, a fern or a low bush, each a few crossed cards. */
  plantGeometry(kind) {
    return paintedOnce('plant' + kind, () => {
      const cards = newBuffers();
      const rnd = seeded(600 + kind * 7);
      const up = new THREE.Vector3(0, 1, 0);
      if (kind === 0) { // grass
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI + rnd() * 0.4;
          addCard(cards, FOLIAGE.grass, new THREE.Vector3((rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15), new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), up, 0.9, 0.75);
        }
      } else if (kind === 1) { // fern: fronds arching out from one point
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + rnd() * 0.5;
          const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
          addCard(cards, FOLIAGE.fern, new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(-out.z, 0, out.x), new THREE.Vector3(out.x * 0.75, 0.66, out.z * 0.75), 0.45, 0.95);
        }
      } else { // bush
        for (let i = 0; i < 5; i++) {
          const angle = rnd() * Math.PI;
          addCard(cards, FOLIAGE.leaves, new THREE.Vector3((rnd() - 0.5) * 0.7, rnd() * 0.25, (rnd() - 0.5) * 0.7),
            new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), new THREE.Vector3((rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5).normalize(), 1.3, 1.2);
        }
      }
      return toGeometry(cards);
    });
  }

  plantAt(x, z, near, pick, turn, scale) {
    const kind = pick < 0.55 ? 0 : pick < 0.85 ? 1 : 2;
    const d = this.dummy;
    d.position.set(x, 0, z);
    d.rotation.set(0, turn * Math.PI * 2, 0);
    d.scale.setScalar(scale);
    this.plant('plant' + kind, near ? near.leg : 0, this.plantGeometry(kind), this.materials().foliage, { capacity: 2600, receiveShadow: true });
    this.counts.plants++;
  }

  /**
   * What the level file does not list: a wall of trees right behind the edge the player cannot
   * cross, layers of outlines behind that, undergrowth that thickens toward the wood, and grass
   * growing into the broken edge of the tarmac. Runs once, when the first tree is planted.
   */
  populate() {
    if (this.populated || this.roads.length === 0) return;
    this.populated = true;
    this.roads.forEach((road, leg) => {
      const rnd = seeded(9001 + leg * 131);
      const length = Math.hypot(road.x2 - road.x1, road.z2 - road.z1);
      const ax = (road.x2 - road.x1) / length;
      const az = (road.z2 - road.z1) / length;
      const row = (offset, spacing, jitter, add) => {
        [-1, 1].forEach((side) => {
          for (let s = -6; s < length + 6; s += spacing * (0.7 + rnd() * 0.6)) {
            const out = offset + (rnd() - 0.5) * jitter;
            const x = road.x1 + ax * s + -az * side * out;
            const z = road.z1 + az * s + ax * side * out;
            const near = this.nearest(x, z);
            if (near.leg !== leg && near.dist < out - 0.4) continue; // belongs to another leg's side
            if (near.dist < Math.min(out - 0.5, 8.9)) continue;       // would stand on another leg's road
            add(x, z, near);
          }
        });
      };
      // the wall: two tight rows just outside the edge of the walkable strip, leaning in over the road
      row(9.4, 3.0, 0.7, (x, z, near) => { if (!this.inGap(near, x, z)) this.tree(x, z, near, rnd(), rnd(), 0.35 + rnd() * 0.65, rnd(), rnd() < 0.45); });
      row(10.9, 3.9, 1.0, (x, z, near) => { if (!this.inGap(near, x, z)) this.tree(x, z, near, rnd(), rnd(), rnd(), rnd(), false); });
      // far layers: outlines only
      [21, 25.5, 30.5].forEach((offset) => row(offset, 3.1, 2.4, (x, z, near) => this.tree(x, z, near, rnd(), rnd(), 0.3 + rnd() * 0.7, 0, false)));
      // stumps where trees were cut or snapped, a few of them on the shoulder
      const stump = paintedOnce('stump', () => {
        const wood = newBuffers();
        const shade = () => [0.55, 0.62, 0.5];
        addTube(wood, [
          { p: new THREE.Vector3(0, -0.05, 0), r: 0.36 }, { p: new THREE.Vector3(0, 0.3, 0), r: 0.25 },
          { p: new THREE.Vector3(0.03, 0.62, 0), r: 0.22 }, { p: new THREE.Vector3(0.05, 0.7, 0.02), r: 0.02 },
        ], 7, shade);
        return toGeometry(wood);
      });
      const stumpAt = (x, z, near) => {
        this.dummy.position.set(x, 0, z);
        this.dummy.rotation.set((rnd() - 0.5) * 0.2, rnd() * 6.28, (rnd() - 0.5) * 0.2);
        this.dummy.scale.set(0.7 + rnd() * 0.8, 0.5 + rnd() * 1.1, 0.7 + rnd() * 0.8);
        this.plant('stump', near.leg, stump, this.materials().bark, { capacity: 80, receiveShadow: true });
      };
      row(10.1, 15, 1.4, stumpAt);
      row(7.7, 38, 1.2, stumpAt);
      // undergrowth: sparse on the shoulder, thick at the wall
      row(4.2, 1.5, 1.0, (x, z, near) => this.plantAt(x, z, near, rnd() * 0.5, rnd(), 0.35 + rnd() * 0.4));  // grass in the broken edge
      row(6.2, 2.4, 2.2, (x, z, near) => this.plantAt(x, z, near, rnd(), rnd(), 0.6 + rnd() * 0.6));
      row(5.3, 1.9, 1.3, (x, z, near) => this.plantAt(x, z, near, rnd() * 0.8, rnd(), 0.5 + rnd() * 0.5));
      row(7.4, 1.5, 1.5, (x, z, near) => this.plantAt(x, z, near, 0.2 + rnd() * 0.8, rnd(), 0.9 + rnd() * 0.9));
      row(8.6, 1.3, 1.4, (x, z, near) => this.plantAt(x, z, near, 0.3 + rnd() * 0.7, rnd(), 0.8 + rnd() * 0.8));
      row(10.2, 1.5, 1.6, (x, z, near) => this.plantAt(x, z, near, 0.4 + rnd() * 0.6, rnd(), 0.9 + rnd() * 0.9));
    });
  }
}

const forests = new WeakMap();
function forestOf(factory) {
  if (!forests.has(factory)) forests.set(factory, new Forest(factory));
  return forests.get(factory);
}

// ================================================================================================
// Fog and light you can see. Three.js fog only fades things with distance; what makes the night
// thick is added here: a low mist that drifts, a faint cone in front of the flashlight, damp
// specks that show only inside the beam, and cones in front of the lamps that still burn.
//
// These things have to follow the camera, and a prop builder is never told about the camera.
// The driver below is a mesh that draws nothing; Three.js calls its onBeforeRender with the
// camera every frame, and that is where everything is moved.
// ================================================================================================

/** Soft clouds with holes, as a white image whose alpha is the mist. Tiles in both directions. */
function mistTexture() {
  return paintedOnce('mist', () => {
    const S = 256;
    const canvas = makeCanvas(S, S);
    const g = canvas.getContext('2d');
    const broad = cloud(S, S, 2, 2, 5, 401);
    const patch = cloud(S, S, 1, 1, 2, 402);
    const data = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      // thick in some places, almost gone in others: the road closes in and opens up again
      const alpha = smoothstep(0.34, 0.72, broad[i] * 0.75 + patch[i] * 0.4);
      data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255;
      data.data[i * 4 + 3] = 255 * alpha;
    }
    g.putImageData(data, 0, 0);
    return canvas;
  });
}

/** A beam seen from the side: bright at the lamp (top of the image), fading along and toward the rim. */
function beamTexture() {
  return paintedOnce('beam', () => {
    const canvas = makeCanvas(64, 256);
    const g = canvas.getContext('2d');
    const along = g.createLinearGradient(0, 0, 0, 256);
    along.addColorStop(0, 'rgba(255, 255, 255, 0)');
    along.addColorStop(0.12, 'rgba(255, 255, 255, 0.9)');
    along.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
    along.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = along;
    g.fillRect(0, 0, 64, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  });
}

/**
 * A cone of lit fog in front of a lamp. It opens along -Z from the origin; `reach` and `radius`
 * in metres. Purely additive: it never darkens anything and costs no real light.
 */
function lightCone(color, reach, radius, strength) {
  // Four cones inside one another, each very faint: where they overlap the fog is brighter,
  // so the beam is densest along its axis and has no hard rim.
  const positions = [];
  const uvs = [];
  [1, 0.78, 0.56, 0.34].forEach((share) => {
    const shell = new THREE.ConeGeometry(radius * share, reach, 24, 1, true).toNonIndexed();
    shell.translate(0, -reach / 2, 0); // tip at the origin
    shell.rotateX(Math.PI / 2);        // opening toward -Z
    positions.push(...shell.attributes.position.array);
    uvs.push(...shell.attributes.uv.array);
    shell.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({
    map: beamTexture(), color: color.clone().multiplyScalar(strength), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  material.name = 'ch1:beam';
  const cone = new THREE.Mesh(geometry, material);
  cone.userData.dynamic = true;
  cone.renderOrder = 20;
  return cone;
}

/** Colour and strength of a palette emitter, or a fallback when the palette has none. */
function emitterColor(factory, key, fallback) {
  const spec = factory.greybox[key];
  if (spec && typeof spec.color === 'string') return Palette.color(spec.color).multiplyScalar(spec.intensity === undefined ? 1 : spec.intensity);
  return Palette.color(fallback);
}

/**
 * Builds the weather of the level: mist layers, the flashlight's cone and the specks in it.
 * Returns a group to add to the scene once.
 */
function buildWeather(factory) {
  const weather = new THREE.Group();
  weather.name = 'ch1:weather';
  const state = { time: 0 };
  animate(factory, (time) => { state.time = time; });

  // ---- low mist: six sheets between ankle and waist, each drifting its own way ------------------
  const SPAN = 80;
  const mistColor = emitterColor(factory, 'ch1Mist', '#5a6b68');
  const sheets = [];
  for (let i = 0; i < 6; i++) {
    const texture = new THREE.CanvasTexture(mistTexture());
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(SPAN / (34 + i * 9), SPAN / (34 + i * 9));
    const material = new THREE.MeshBasicMaterial({
      map: texture, color: mistColor, transparent: true, opacity: 0.17 - i * 0.018, depthWrite: false,
    });
    material.name = 'ch1:mist';
    const geometry = new THREE.PlaneGeometry(SPAN, SPAN);
    geometry.rotateX(-Math.PI / 2);
    const sheet = new THREE.Mesh(geometry, material);
    sheet.position.y = 0.14 + i * 0.13;
    sheet.frustumCulled = false;
    sheet.matrixAutoUpdate = false;
    sheet.userData.dynamic = true;
    sheet.renderOrder = 12 + i;
    const angle = i * 1.9 + 0.4;
    sheets.push({ sheet, texture, scale: 34 + i * 9, driftX: Math.cos(angle) * (0.05 + i * 0.012), driftZ: Math.sin(angle) * (0.05 + i * 0.012) });
    weather.add(sheet);
  }

  // ---- the flashlight in the fog: a faint cone and damp specks that only show inside it -----------
  const torchColor = emitterColor(factory, 'ch1Torch', '#cfd8d2');
  // Seen from behind the torch a cone would show its rim, so the beam is built from soft round
  // patches standing across it, one behind the other, each as wide as the beam is there.
  const haze = { positions: [], uvs: [], colors: [] };
  [2.2, 3.6, 5.2, 7, 9, 11.5, 14.5].forEach((ahead) => {
    const r = Math.tan(17 * DEG) * ahead * 1.3;
    // Each patch stops just above the road and fades out toward that edge (dark vertices add
    // nothing), so the lit fog does not end in a straight line where it meets the ground.
    const low = Math.max(-r, -1.5);
    const fade = Math.min(r, low + 0.7);
    const rows = [[low, 0], [fade, 1], [r, 1]];
    for (let i = 0; i < rows.length - 1; i++) {
      const [y0, c0] = rows[i];
      const [y1, c1] = rows[i + 1];
      [[-r, y0, c0], [r, y0, c0], [r, y1, c1], [-r, y0, c0], [r, y1, c1], [-r, y1, c1]].forEach(([x, y, c]) => {
        haze.positions.push(x, y, -ahead);
        haze.uvs.push((x / r + 1) / 2, (y / r + 1) / 2);
        haze.colors.push(c, c, c);
      });
    }
  });
  const hazeGeometry = new THREE.BufferGeometry();
  hazeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(haze.positions, 3));
  hazeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(haze.uvs, 2));
  hazeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(haze.colors, 3));
  const soft = paintedOnce('soft-disc', () => {
    const canvas = makeCanvas(128, 128);
    const g = canvas.getContext('2d');
    const glow = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  });
  const cone = new THREE.Mesh(hazeGeometry, new THREE.MeshBasicMaterial({
    map: soft, color: torchColor.clone().multiplyScalar(0.012), transparent: true, vertexColors: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  cone.material.name = 'ch1:torch-haze';
  cone.userData.dynamic = true;
  cone.renderOrder = 20;
  cone.frustumCulled = false;
  cone.matrixAutoUpdate = false;
  weather.add(cone);

  const SPECKS = 1400;
  const BOX = 26;
  const positions = new Float32Array(SPECKS * 3);
  const rnd = seeded(77);
  for (let i = 0; i < SPECKS; i++) {
    positions[i * 3] = (rnd() - 0.5) * BOX;
    positions[i * 3 + 1] = rnd() * 4.2;
    positions[i * 3 + 2] = (rnd() - 0.5) * BOX;
  }
  const speckGeometry = new THREE.BufferGeometry();
  speckGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const speckMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBeam: { value: 0 },                       // 1 while the flashlight is on
      uColor: { value: torchColor.clone() },
      uCell: { value: new THREE.Vector3() },     // camera position, so the cloud of specks wraps around it
      uBox: { value: BOX },
    },
    vertexShader: [
      'uniform float uTime; uniform vec3 uCell; uniform float uBox;',
      'varying float vLit;',
      'void main() {',
      '  vec3 p = position;',
      '  p.x += sin( uTime * 0.21 + position.y * 3.1 ) * 0.35 + uTime * 0.05;',
      '  p.y += sin( uTime * 0.17 + position.x * 2.3 ) * 0.2 - uTime * 0.02;',
      '  p.z += cos( uTime * 0.19 + position.y * 2.7 ) * 0.35;',
      // wrap the cloud around the camera so there are always specks ahead
      '  p.xz = mod( p.xz - uCell.xz + uBox * 0.5, uBox ) - uBox * 0.5 + uCell.xz;',
      '  p.y = mod( p.y, 4.2 );',
      '  vec4 mv = viewMatrix * vec4( p, 1.0 );',
      '  float dist = -mv.z;',
      '  float along = dot( normalize( mv.xyz ), vec3( 0.0, 0.0, -1.0 ) );',
      // inside the beam (it leaves the camera along -Z) and not too far away
      '  vLit = smoothstep( 0.95, 0.985, along ) * smoothstep( 13.0, 2.0, dist ) * step( 0.4, dist );',
      '  gl_PointSize = clamp( 16.0 / max( dist, 0.4 ), 1.0, 3.5 );',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColor; uniform float uBeam;',
      'varying float vLit;',
      'void main() {',
      '  vec2 c = gl_PointCoord - 0.5;',
      '  float round = smoothstep( 0.5, 0.1, length( c ) );',
      '  gl_FragColor = vec4( uColor * 0.32 * vLit * uBeam * round, 1.0 );',
      '}',
    ].join('\n'),
  });
  speckMaterial.name = 'ch1:specks';
  const specks = new THREE.Points(speckGeometry, speckMaterial);
  specks.frustumCulled = false;
  specks.userData.dynamic = true;
  specks.renderOrder = 21;
  weather.add(specks);

  // ---- the driver: draws nothing, but is told about the camera every frame -------------------------
  const driver = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false })
  );
  driver.frustumCulled = false;
  driver.userData.dynamic = true;
  driver.renderOrder = -100;
  const aim = new THREE.Matrix4();
  driver.onBeforeRender = (renderer, scene, camera) => {
    const eye = camera.position;
    sheets.forEach(({ sheet, texture, scale, driftX, driftZ }) => {
      // the sheet follows the player; its pattern stays where it is in the world and drifts slowly
      sheet.matrixWorld.makeTranslation(eye.x, sheet.position.y, eye.z);
      texture.offset.set(eye.x / scale + driftX * state.time, -eye.z / scale + driftZ * state.time);
    });
    let torch = null;
    for (const child of camera.children) if (child.isSpotLight) torch = child;
    const lit = torch && torch.intensity > 0 ? 1 : 0;
    cone.visible = lit === 1;
    // tip a little below the eye, where the hand holding the torch is
    cone.matrixWorld.copy(camera.matrixWorld);
    speckMaterial.uniforms.uTime.value = state.time;
    speckMaterial.uniforms.uBeam.value = lit;
    speckMaterial.uniforms.uCell.value.copy(eye);
  };
  weather.add(driver);
  return weather;
}

/** A lamp that is failing: mostly on, dipping, sometimes almost out, never regular. */
function stutter(time) {
  const n = Math.sin(time * 11.3) + Math.sin(time * 6.7 + 1.9) + Math.sin(time * 29.1 + 0.3);
  return n > 0.5 ? 1 : n > -0.6 ? 0.45 : 0.06;
}

/** Hazard lights: on for half a second, off for half a second, like a relay. */
function blink(time) {
  return (time % 1.1) < 0.55 ? 1 : 0.02;
}

/** Additive material showing cells of the marks image in an emitter's colour: light lying on the road. */
function glowSheetMaterial(factory, key, fallback, strength, levelAt) {
  const set = wetSet(factory);
  const id = 'glow:' + key + ':' + strength;
  if (!set.has(id)) {
    const base = emitterColor(factory, key, fallback).multiplyScalar(strength);
    const material = new THREE.MeshBasicMaterial({
      map: markTexture(), color: base.clone(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    material.name = 'ch1:' + id;
    if (levelAt) animate(factory, (time) => material.color.copy(base).multiplyScalar(levelAt(time)));
    set.set(id, material);
  }
  return set.get(id);
}

/** Self-lit surface in an emitter's colour (lamp heads, car lights); `levelAt(time)` makes it blink or stutter. */
function lampMaterial(factory, key, fallback, levelAt) {
  const set = wetSet(factory);
  const id = 'lamp:' + key + (levelAt ? ':' + levelAt.name : '');
  if (!set.has(id)) {
    const base = emitterColor(factory, key, fallback);
    const material = new THREE.MeshBasicMaterial({ color: base.clone() });
    material.name = 'ch1:' + id;
    if (levelAt) animate(factory, (time) => material.color.copy(base).multiplyScalar(levelAt(time)));
    set.set(id, material);
  }
  return set.get(id);
}

// ================================================================================================
// Cars. Each one is put together from flat faces sorted by material (paint, glass, dark parts,
// lamps), so a whole car is a handful of meshes. One painted texture gives every car its mud,
// scratches, rust and dents; the car's own colour comes from vertex colours, so they all share
// one material and none looks like another.
// ================================================================================================

/** Faces collected per material; turned into one mesh per material at the end. */
class Shell {
  constructor() {
    this.parts = new Map();
    this.tint = [1, 1, 1];
  }

  buffers(key) {
    if (!this.parts.has(key)) this.parts.set(key, { positions: [], normals: [], uvs: [], colors: [] });
    return this.parts.get(key);
  }

  /** Triangle; its texture runs along the car (u) and up (v), so mud stays low and streaks run back. */
  tri(key, a, b, c) {
    const out = this.buffers(key);
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const length = Math.hypot(nx, ny, nz) || 1;
    [a, b, c].forEach((p) => {
      out.positions.push(p[0], p[1], p[2]);
      out.normals.push(nx / length, ny / length, nz / length);
      out.uvs.push(p[2] * 0.22 + p[0] * 0.07 + 0.5, p[1] / 1.6);
      out.colors.push(this.tint[0], this.tint[1], this.tint[2]);
    });
  }

  quad(key, a, b, c, d) {
    this.tri(key, a, b, c);
    this.tri(key, a, c, d);
  }

  /** Flat polygon as a fan from its first corner. */
  fan(key, points) {
    for (let i = 1; i < points.length - 1; i++) this.tri(key, points[0], points[i], points[i + 1]);
  }

  /** Box by its centre; `matrix` (optional) turns and moves it. */
  box(key, cx, cy, cz, w, h, d, matrix) {
    const corner = (sx, sy, sz) => {
      const p = new THREE.Vector3(cx + (sx * w) / 2, cy + (sy * h) / 2, cz + (sz * d) / 2);
      if (matrix) p.applyMatrix4(matrix);
      return [p.x, p.y, p.z];
    };
    const faces = [
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
    ];
    faces.forEach((face) => this.quad(key, ...face.map((s) => corner(s[0], s[1], s[2]))));
  }

  /** Wheel lying on its axle along X: tread and two side walls. `squash` < 1 flattens the tyre. */
  wheel(key, x, y, z, radius, width, squash) {
    const sides = 10;
    const ring = (i, sx) => {
      const angle = (i / sides) * Math.PI * 2;
      return [x + sx * width / 2, y + Math.sin(angle) * radius * (Math.sin(angle) < 0 ? squash : 1), z + Math.cos(angle) * radius];
    };
    for (let i = 0; i < sides; i++) {
      this.quad(key, ring(i, -1), ring(i, 1), ring(i + 1, 1), ring(i + 1, -1));
      this.tri(key, [x + width / 2, y, z], ring(i, 1), ring(i + 1, 1));
      this.tri(key, [x - width / 2, y, z], ring(i + 1, -1), ring(i, -1));
    }
  }

  /** Adds any geometry, keeping its normals (smooth shading stays smooth); `matrix` moves and turns it. */
  add(key, geometry, matrix) {
    const out = this.buffers(key);
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const positions = source.attributes.position;
    const normals = source.attributes.normal;
    const normalMatrix = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i);
      if (matrix) v.applyMatrix4(matrix);
      out.positions.push(v.x, v.y, v.z);
      out.uvs.push(v.z * 0.22 + v.x * 0.07 + 0.5, v.y / 1.6);
      out.colors.push(this.tint[0], this.tint[1], this.tint[2]);
      v.fromBufferAttribute(normals, i);
      if (normalMatrix) v.applyMatrix3(normalMatrix).normalize();
      out.normals.push(v.x, v.y, v.z);
    }
    return this;
  }

  /** The faces collected for one material as a geometry (for a shape that many objects share). */
  geometry(key) {
    const buffers = this.buffers(key);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
    return geometry;
  }

  /** One mesh per material. `materials` maps the keys used above to materials. */
  meshes(materials) {
    const list = [];
    this.parts.forEach((buffers, key) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
      const mesh = new THREE.Mesh(geometry, materials[key]);
      mesh.castShadow = key === 'paint' || key === 'dark' || key === 'black';
      mesh.receiveShadow = key === 'paint';
      mesh.userData.dynamic = true;
      list.push(mesh);
    });
    return list;
  }
}

/** Paint as it looks after weeks outside: mud thrown up from below, scratches, rust, dents. */
function paintTextures(clean) {
  return paintedOnce(clean ? 'paint-clean' : 'paint', () => {
    const S = 512;
    const colour = makeCanvas(S, S);
    const rough = makeCanvas(S, S);
    const cg = colour.getContext('2d');
    const rg = rough.getContext('2d');
    const broad = cloud(S, S, 4, 4, 4, 501);
    const fine = cloud(S, S, 64, 64, 2, 502);
    const rust = cloud(S, S, 6, 6, 4, 503);
    const splash = cloud(S, S, 24, 8, 3, 504);
    const cd = cg.createImageData(S, S);
    const rd = rg.createImageData(S, S);
    const dirtiness = clean ? 0.3 : 1;
    for (let y = 0; y < S; y++) {
      const height = 1 - y / S; // 0 at the sill, 1 at the roof
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        let r = 200 + 40 * (broad[i] - 0.5);
        let g = r;
        let b = r;
        let dull = 0.26 + 0.12 * fine[i]; // wet paint shines
        const dust = (0.25 + 0.5 * broad[i]) * dirtiness;
        r += (120 - r) * dust * 0.5;
        g += (114 - g) * dust * 0.5;
        b += (100 - b) * dust * 0.5;
        dull += 0.25 * dust;
        const eaten = clean ? 0 : smoothstep(0.62, 0.74, rust[i] + 0.12 * (1 - height));
        r += (96 * (0.6 + fine[i]) - r) * eaten;
        g += (58 * (0.6 + fine[i]) - g) * eaten;
        b += (36 * (0.6 + fine[i]) - b) * eaten;
        dull += (0.9 - dull) * eaten;
        // mud: solid along the sills, breaking up into spatter higher on the doors
        const mud = clamp01((0.42 - height) / 0.42 + (splash[i] - 0.55) * 1.6) * smoothstep(0.62, 0.2, height) * dirtiness;
        r += (70 * (0.7 + 0.6 * fine[i]) - r) * mud;
        g += (57 * (0.7 + 0.6 * fine[i]) - g) * mud;
        b += (40 * (0.7 + 0.6 * fine[i]) - b) * mud;
        dull += (0.92 - dull) * mud;
        cd.data[i * 4] = r;
        cd.data[i * 4 + 1] = g;
        cd.data[i * 4 + 2] = b;
        cd.data[i * 4 + 3] = 255;
        rd.data[i * 4] = rd.data[i * 4 + 1] = rd.data[i * 4 + 2] = 255 * clamp01(dull);
        rd.data[i * 4 + 3] = 255;
      }
    }
    cg.putImageData(cd, 0, 0);
    rg.putImageData(rd, 0, 0);
    const rnd = seeded(505);
    cg.lineCap = 'round';
    for (let n = 0; n < (clean ? 14 : 70); n++) { // scratches run along the body
      const x = rnd() * S;
      const y = rnd() * S;
      const length = 20 + rnd() * 160;
      const slope = (rnd() - 0.5) * 0.3;
      [cg, rg].forEach((ctx, isRough) => {
        ctx.strokeStyle = isRough ? 'rgba(170, 170, 170, 0.7)' : (rnd() < 0.5 ? 'rgba(240, 240, 236, 0.5)' : 'rgba(40, 38, 36, 0.5)');
        ctx.lineWidth = 0.8 + rnd() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + length, y + length * slope);
        ctx.stroke();
      });
    }
    if (!clean) {
      for (let n = 0; n < 9; n++) { // dents: a dark crease with a light edge
        const x = rnd() * S;
        const y = rnd() * S;
        const radius = 18 + rnd() * 40;
        const dent = cg.createRadialGradient(x, y, 0, x, y, radius);
        dent.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
        dent.addColorStop(0.7, 'rgba(255, 255, 255, 0.12)');
        dent.addColorStop(1, 'rgba(255, 255, 255, 0)');
        cg.fillStyle = dent;
        cg.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
    return { map: colourTexture(colour), roughnessMap: dataTexture(rough) };
  });
}

function carMaterials(factory, clean) {
  const textures = paintTextures(clean);
  const glass = glassTextures();
  const steel = (name, grey, roughness, metalness) => wetMaterial(factory, name, () => ({
    color: new THREE.Color(grey, grey, grey), roughness, metalness, envMapIntensity: 0.9,
  }));
  const set = {
    // paint: dark, a little glossy; the car's own colour comes from vertex colours
    paint: wetMaterial(factory, clean ? 'paint-clean' : 'paint', () => ({
      map: textures.map, roughnessMap: textures.roughnessMap, vertexColors: true, side: THREE.DoubleSide, envMapIntensity: 0.75,
    })),
    // glass: dark and see-through, never white, never glowing; rain marks, dust and hand prints in its texture
    glass: wetMaterial(factory, clean ? 'car-glass-clean' : 'car-glass', () => ({
      map: clean ? null : glass.map, color: clean ? new THREE.Color(0.012, 0.018, 0.018) : new THREE.Color(0.5, 0.55, 0.55),
      roughness: clean ? 0.05 : 0.14, transparent: true, opacity: clean ? 0.66 : 0.76, depthWrite: false,
      side: THREE.DoubleSide, envMapIntensity: 1.3,
    })),
    tyre: wetMaterial(factory, 'car-tyre', () => ({ map: tyreTexture(), color: new THREE.Color(0.5, 0.5, 0.5), roughness: 0.9, envMapIntensity: 0.1 })),
    rim: steel('car-rim', 0.16, 0.45, 0.85),
    black: wetMaterial(factory, 'car-black', () => ({ color: new THREE.Color(0.012, 0.012, 0.013), roughness: 0.7, side: THREE.DoubleSide, envMapIntensity: 0.2 })),
    chrome: steel('car-chrome', 0.26, 0.34, 0.95),
    interior: wetMaterial(factory, 'car-interior', () => ({ color: new THREE.Color(0.02, 0.02, 0.022), roughness: 0.95, envMapIntensity: 0.05 })),
    plate: wetMaterial(factory, 'car-plate', () => ({ color: new THREE.Color(0.06, 0.06, 0.055), roughness: 0.6, envMapIntensity: 0.2 })),
    bright: wetMaterial(factory, 'reflector', () => ({ color: new THREE.Color(0.75, 0.75, 0.72), roughness: 0.25, envMapIntensity: 0.4 })),
    // lamp covers when the lamp is dead: clear, red, amber
    lensClear: wetMaterial(factory, 'lens-clear', () => ({ color: new THREE.Color(0.5, 0.52, 0.52), roughness: 0.08, transparent: true, opacity: 0.45, envMapIntensity: 1.2 })),
    lensRed: wetMaterial(factory, 'lens-red', () => ({ color: new THREE.Color(0.16, 0.012, 0.01), roughness: 0.15, envMapIntensity: 0.9 })),
    lensAmber: wetMaterial(factory, 'lens-amber', () => ({ color: new THREE.Color(0.22, 0.09, 0.012), roughness: 0.15, envMapIntensity: 0.9 })),
  };
  set.dark = set.black; // the lorry builder's name for black plastic
  return set;
}

/** Car glass after weeks outside: streaks where rain ran down, a film of dust, a couple of hand prints. */
function glassTextures() {
  return paintedOnce('car-glass', () => {
    const S = 256;
    const canvas = makeCanvas(S, S);
    const g = canvas.getContext('2d');
    const dust = cloud(S, S, 4, 4, 4, 801);
    const data = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const film = 0.1 + 0.3 * dust[i];
      const tone = 12 + 70 * film; // mostly dark, greyer where the dust is thick
      data.data[i * 4] = tone;
      data.data[i * 4 + 1] = tone + 4;
      data.data[i * 4 + 2] = tone + 4;
      data.data[i * 4 + 3] = 255;
    }
    g.putImageData(data, 0, 0);
    const rnd = seeded(802);
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) { // rain runs: thin clean lines through the dust
      let x = rnd() * S;
      g.strokeStyle = 'rgba(6, 8, 8, 0.6)';
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      g.moveTo(x, rnd() * 60);
      for (let y = 30; y < S; y += 22) {
        x += (rnd() - 0.5) * 6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(96, 100, 98, 0.35)'; // a hand wiped across it
    for (let i = 0; i < 2; i++) {
      const x = 50 + rnd() * 150;
      const y = 60 + rnd() * 120;
      g.beginPath();
      g.ellipse(x, y, 20, 24, 0, 0, 6.28);
      g.fill();
      for (let f = 0; f < 4; f++) {
        g.beginPath();
        g.ellipse(x - 18 + f * 12, y - 34, 5, 16, 0, 0, 6.28);
        g.fill();
      }
    }
    return { map: colourTexture(canvas) };
  });
}

/** Tyre rubber: ribs across the tread, lettering-like marks round the side wall. */
function tyreTexture() {
  return paintedOnce('tyre', () => {
    const canvas = makeCanvas(128, 64);
    const g = canvas.getContext('2d');
    g.fillStyle = '#1b1b1c';
    g.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 8) {
      g.fillStyle = '#070707';
      g.fillRect(x, 0, 3, 64);
    }
    g.fillStyle = '#2a2a2b';
    g.fillRect(0, 28, 128, 3);
    const texture = colourTexture(canvas);
    texture.repeat.set(6, 1);
    return texture;
  });
}

/** Smooth curve through points [[z, y], ...] sorted by z (cubic, with tangents from the neighbours). */
function curveThrough(points) {
  const n = points.length;
  return (z) => {
    if (z <= points[0][0]) return points[0][1];
    if (z >= points[n - 1][0]) return points[n - 1][1];
    let i = 0;
    while (z > points[i + 1][0]) i++;
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const span = p2[0] - p1[0];
    const t = (z - p1[0]) / span;
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * span;
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * span;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

/**
 * Body types. Everything in metres with the front at -z.
 *   top:    the outline seen from the side, front bumper to rear bumper, as points the curve runs through
 *   cabin:  where the windscreen starts and ends, where the rear window starts and ends
 *   door:   where the front door ends (the B pillar); twoDoor: no rear doors
 *   axles:  front and rear wheel centres; wheel: wheel radius; belt: height of the window line
 */
const CAR_TYPES = {
  sedan: {
    L: 4.5, W: 1.8, belt: 0.95, clearance: 0.17, wheel: 0.32, door: 0.22, axles: [-1.36, 1.32], trunk: true,
    top: [[-2.25, 0.45], [-2.21, 0.66], [-2.02, 0.77], [-1.5, 0.86], [-0.98, 0.95], [-0.62, 1.2], [-0.28, 1.4], [0.3, 1.45], [0.82, 1.41], [1.2, 1.2], [1.5, 1.02], [2.05, 0.97], [2.2, 0.85], [2.25, 0.55]],
    cabin: [-0.98, -0.28, 0.82, 1.5],
  },
  hatch: {
    L: 4.1, W: 1.75, belt: 0.96, clearance: 0.17, wheel: 0.31, door: 0.3, axles: [-1.25, 1.27],
    top: [[-2.05, 0.45], [-2.01, 0.66], [-1.84, 0.78], [-1.35, 0.87], [-0.9, 0.96], [-0.55, 1.22], [-0.22, 1.42], [0.4, 1.47], [1.15, 1.43], [1.55, 1.18], [1.84, 0.98], [2.0, 0.86], [2.05, 0.55]],
    cabin: [-0.9, -0.22, 1.15, 1.84],
  },
  suv: {
    L: 4.7, W: 1.9, belt: 1.1, clearance: 0.24, wheel: 0.38, door: 0.3, axles: [-1.45, 1.42],
    top: [[-2.35, 0.55], [-2.31, 0.82], [-2.1, 0.95], [-1.55, 1.02], [-1.02, 1.1], [-0.7, 1.42], [-0.4, 1.66], [0.5, 1.72], [1.72, 1.68], [2.0, 1.4], [2.22, 1.12], [2.32, 0.95], [2.35, 0.6]],
    cabin: [-1.02, -0.4, 1.72, 2.22],
  },
  pickup: {
    L: 5.2, W: 1.9, belt: 1.1, clearance: 0.26, wheel: 0.38, door: 0.34, axles: [-1.65, 1.6], twoDoor: true, bed: [0.82, 2.4],
    top: [[-2.6, 0.55], [-2.56, 0.82], [-2.35, 0.95], [-1.8, 1.02], [-1.28, 1.1], [-0.98, 1.42], [-0.7, 1.64], [-0.1, 1.7], [0.42, 1.66], [0.52, 1.4], [0.62, 1.1], [2.45, 1.08], [2.56, 0.95], [2.6, 0.6]],
    cabin: [-1.28, -0.7, 0.42, 0.62],
  },
};

/** Parts every car shares: one tyre and one wheel rim, built once and reused by all of them. */
function wheelGeometries() {
  return paintedOnce('wheel', () => {
    // tyre: a ring with thickness, lying on the axle (X)
    const tyre = new THREE.TorusGeometry(0.78, 0.22, 8, 18);
    tyre.rotateY(Math.PI / 2);
    tyre.scale(1.25, 1, 1);
    // rim: hub, five spokes, outer ring
    const rim = new Shell();
    const turn = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      turn.makeRotationX((i / 5) * Math.PI * 2);
      rim.box('rim', 0.05, 0.3, 0, 0.05, 0.5, 0.13, turn);
    }
    rim.add('rim', new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    rim.add('rim', new THREE.TorusGeometry(0.58, 0.05, 5, 16), new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(0.05, 0, 0));
    rim.add('rim', new THREE.CylinderGeometry(0.6, 0.6, 0.02, 14), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(-0.06, 0, 0));
    return { tyre, rim: rim.geometry('rim') };
  });
}

/**
 * Builds a car standing on the ground around the origin, front toward -Z.
 *
 * The body is not put together from boxes. Its side outline is a curve; at about fifty places
 * along the car a cross-section is laid through it (bulging sides, rounded shoulders, a cabin that
 * leans in, cut-outs over the wheels), and the skin is stretched over these sections with smooth
 * shading. Bonnet, boot lid and doors are separate pieces of that skin, so their joints show as
 * lines and they can swing open on their hinges; windows are holes filled with glass.
 *
 * options: w, d (the space it must fit: the car is scaled to length d), shape ('sedan', 'hatch',
 * 'suv', 'pickup'), color, clean, crush (0..1 front pushed in), hoodUp, trunkUp,
 * doors ([radians] front-left, front-right, rear-left, rear-right), flat (0 FL, 1 FR, 2 RL, 3 RR),
 * steer (radians), brokenGlass ('front', 'rear', 'left', 'right'),
 * headlamps / taillamps / indicators (glowing materials for lamps that are on), seed.
 */
function buildCar(factory, options) {
  const rnd = seeded(options.seed || 1);
  const type = CAR_TYPES[options.shape === 'van' ? 'suv' : options.shape || 'sedan'];
  const materials = carMaterials(factory, options.clean);
  const { L, W } = type;
  const zF = -L / 2;
  const zR = L / 2;
  const [cowl, roofFront, roofRear, deck] = type.cabin;
  const topAt = curveThrough(type.top);
  const roofHeight = Math.max(...type.top.map((p) => p[1]));
  const crush = options.crush || 0;

  // ---- outline functions ---------------------------------------------------------------------
  const endFactor = (z) => clamp01((Math.abs(z) - (L / 2 - 0.16)) / 0.16); // 0 along the car, 1 at the very tips
  const halfWidth = (z) => (W / 2) * (1 - 0.13 * Math.pow(Math.abs((2 * z) / L), 3.2));
  const bottomAt = (z) => type.clearance + 0.16 * Math.pow(clamp01((Math.abs(z) - (L / 2 - 0.5)) / 0.5), 2);
  const beltAt = (z) => Math.min(type.belt + 0.03 * (z / L), topAt(z) - 0.03);
  const archAt = (z) => {
    let lift = 0;
    type.axles.forEach((axle) => {
      const reach = type.wheel + 0.07;
      const off = Math.abs(z - axle);
      if (off < reach) lift = Math.max(lift, type.wheel + Math.sqrt(reach * reach - off * off));
    });
    return lift;
  };
  /** Half a cross-section at z: ten points from the middle of the floor up the side to the middle of the roof. */
  const section = (z) => {
    const yt = topAt(z);
    const yb = bottomAt(z);
    const belt = beltAt(z);
    const hw = halfWidth(z);
    const cabinShare = clamp01((yt - belt) / (roofHeight - type.belt));
    const roofHalf = hw * (0.93 - 0.2 * cabinShare);
    const edge = belt + (yt - belt) * 0.92;
    const arch = archAt(z);
    const points = [
      [0, yb], [hw * 0.8, yb], [hw * 0.97, yb + 0.09], [hw, yb + (belt - yb) * 0.5], [hw * 0.975, belt - 0.05],
      [hw * 0.93, belt], [(hw * 0.93 + roofHalf) / 2, (belt + edge) / 2], [roofHalf, edge],
      [roofHalf * 0.6, belt + (yt - belt) * 0.99], [0, yt],
    ];
    if (arch > 0) { // the cut-out over a wheel: the sill is lifted along a half circle
      points[1][1] = Math.max(points[1][1], arch - 0.02);
      points[2] = [hw * 0.985, Math.max(points[2][1], arch)];
      points[3][1] = Math.max(points[3][1], arch + 0.05);
      points[4][1] = Math.max(points[4][1], points[3][1] + 0.02);
    }
    // the tips are drawn in so that nose and tail are rounded, not cut off square
    const e = endFactor(z);
    if (e > 0) {
      const k = 1 - 0.5 * e * e;
      const middle = (yb + yt) / 2;
      points.forEach((p) => { p[0] *= k; p[1] = middle + (p[1] - middle) * (1 - 0.35 * e * e); });
    }
    return points;
  };

  // ---- where the sections go -----------------------------------------------------------------
  const doorFront = cowl + 0.12;
  const glassFront = cowl + (roofFront - cowl) * 0.62;
  const doorMid = type.door;
  const glassRear = roofRear + (deck - roofRear) * 0.38;
  const doorRear = Math.min(glassRear - 0.02, type.axles[1] - type.wheel - 0.12);
  const hoodFront = zF + 0.32;
  const trunkEnd = zR - 0.3;
  const stations = [];
  for (let z = zF; z < zR; z += 0.16) stations.push(z);
  stations.push(zR, zF + 0.03, zF + 0.08, zR - 0.03, zR - 0.08, cowl, roofFront, roofRear, deck,
    doorFront, glassFront, doorMid - 0.04, doorMid + 0.04, doorMid, glassRear, doorRear, doorRear + 0.03, hoodFront, trunkEnd);
  if (type.bed) stations.push(type.bed[0], type.bed[1]);
  type.axles.forEach((axle) => [-1, -0.93, -0.72, -0.4, 0, 0.4, 0.72, 0.93, 1].forEach((f) => stations.push(axle + f * (type.wheel + 0.07))));
  stations.sort((a, b) => a - b);
  const zs = stations.filter((z, i) => z >= zF && z <= zR && (i === 0 || z - stations[i - 1] > 0.018));

  // ---- the skin: a grid of points, 19 around each section ----------------------------------------
  const RING = 19;
  const grid = [];
  zs.forEach((z, i) => {
    const half = section(z);
    for (let k = 0; k < RING; k++) {
      const p = half[k < 10 ? k : 18 - k];
      let x = k < 10 ? p[0] : -p[0];
      let y = p[1];
      let zz = z;
      if (crush) { // what was in front of the bulkhead has been pushed back and buckled
        const t = clamp01(1 - (z - zF) / 1.0);
        const wave = Math.sin(k * 2.7 + i * 1.9) * 0.5 + 0.5;
        zz += crush * Math.pow(t, 1.4) * (0.32 + 0.3 * wave);
        y += crush * t * (wave - 0.35) * 0.14 * (k > 4 && k < 14 ? 1 : 0.2);
        x *= 1 - 0.06 * crush * t * wave;
      }
      grid.push([x, y, zz]);
    }
  });
  const at = (i, k) => i * RING + k;

  // ---- which piece each patch of skin belongs to ---------------------------------------------------
  const hasRear = !type.twoDoor;
  const broken = options.brokenGlass;
  const pieces = new Map();
  const piece = (name) => {
    if (!pieces.has(name)) pieces.set(name, []);
    return pieces.get(name);
  };
  for (let i = 0; i < zs.length - 1; i++) {
    const zm = (zs[i] + zs[i + 1]) / 2;
    const within = (a, b) => zm > a && zm < b;
    for (let j = 0; j < RING - 1; j++) {
      const seg = j < 9 ? j : 17 - j; // 0 floor, 1 sill, 2-4 flank, 5-6 side window, 7-8 roof
      const side = j < 9 ? 'R' : 'L';
      let name = 'body';
      if (seg === 0) name = 'under';
      else if (seg >= 7 && within(cowl, roofFront)) name = 'glass-front';
      else if (seg >= 7 && within(roofRear, deck)) name = 'glass-rear';
      else if (seg >= 5 && seg <= 6 && within(glassFront, doorMid - 0.04)) name = 'glass-door-F' + side;
      else if (seg >= 5 && seg <= 6 && hasRear && within(doorMid + 0.04, doorRear)) name = 'glass-door-R' + side;
      else if (seg >= 5 && seg <= 6 && hasRear && glassRear - doorRear > 0.2 && within(doorRear + 0.03, glassRear)) name = 'glass-quarter-' + side;
      else if (seg >= 2 && seg <= 4 && within(doorFront, doorMid)) name = 'door-F' + side;
      else if (seg >= 2 && seg <= 4 && hasRear && within(doorMid, doorRear)) name = 'door-R' + side;
      else if (seg >= 5 && within(hoodFront, cowl)) name = 'hood';
      else if (seg >= 5 && type.trunk && within(deck, trunkEnd)) name = 'trunk';
      else if (seg >= 7 && type.bed && within(type.bed[0], type.bed[1])) name = 'bed';
      piece(name).push([at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)]);
    }
  }
  // nose and tail are closed with a fan around their middle
  [[0, 1], [zs.length - 1, -1]].forEach(([i, facing]) => {
    const centre = grid.length;
    let cy = 0;
    for (let k = 0; k < RING; k++) cy += grid[at(i, k)][1] / RING;
    grid.push([0, cy, grid[at(i, 0)][2] - facing * 0.03]);
    for (let k = 0; k < RING - 1; k++) {
      piece('body').push(facing > 0 ? [centre, at(i, k + 1), at(i, k), -1] : [centre, at(i, k), at(i, k + 1), -1]);
    }
  });

  /** Turns the faces of one piece into a smooth-shaded geometry; `origin` is subtracted (for hinged pieces). */
  const skin = (faces, origin) => {
    const remap = new Map();
    const positions = [];
    const index = [];
    const use = (id) => {
      if (!remap.has(id)) {
        remap.set(id, positions.length / 3);
        const p = grid[id];
        positions.push(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
      }
      return remap.get(id);
    };
    faces.forEach(([a, b, c, d]) => {
      index.push(use(a), use(b), use(c));
      if (d >= 0) index.push(use(a), use(c), use(d));
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  };

  // ---- assemble: fixed pieces go into the shell, hinged pieces become their own little groups --------
  const shell = new Shell();
  // paint is kept dark: under the torch at arm's length even a mid grey burns out to white
  const tone = options.color;
  const depth = options.clean ? 0.75 : 0.55;
  shell.tint = [tone.r * depth, tone.g * depth, tone.b * depth];
  const car = new THREE.Group();
  const origin0 = [0, 0, 0];
  const doors = options.doors || [];
  const hinged = (faces, glassFaces, pivot, rotation) => {
    const group = new THREE.Group();
    group.position.set(pivot[0], pivot[1], pivot[2]);
    group.rotation.set(rotation[0], rotation[1], rotation[2]);
    const leaf = new Shell();
    leaf.tint = shell.tint;
    leaf.add('paint', skin(faces, pivot));
    if (glassFaces && glassFaces.length) leaf.add('glass', skin(glassFaces, pivot));
    leaf.meshes(materials).forEach((mesh) => group.add(mesh));
    car.add(group);
  };
  const shards = (faces) => { // what is left of a broken pane: splinters standing along its lower edge
    faces.forEach(([a, b], n) => {
      if (n % 2) return;
      const p = grid[a];
      const q = grid[b];
      if (Math.abs(p[1] - q[1]) > 0.2) return;
      shell.tri('glass', p, q, [(p[0] + q[0]) / 2, Math.max(p[1], q[1]) + 0.05 + rnd() * 0.12, (p[2] + q[2]) / 2]);
    });
  };
  pieces.forEach((faces, name) => {
    if (name === 'body') shell.add('paint', skin(faces, origin0));
    else if (name === 'under') shell.add('black', skin(faces, origin0));
    else if (name === 'bed') return; // the load bed is open: no skin over it
    else if (name === 'hood') {
      if (options.hoodUp) hinged(faces, null, [0, topAt(cowl), cowl], [0.75 + rnd() * 0.25, 0, 0]);
      else shell.add('paint', skin(faces, origin0));
    } else if (name === 'trunk') {
      if (options.trunkUp) hinged(faces, null, [0, topAt(deck), deck], [-1.0, 0, 0]);
      else shell.add('paint', skin(faces, origin0));
    } else if (name.startsWith('door-')) {
      const frontDoor = name[5] === 'F';
      const right = name[6] === 'R';
      const swing = doors[(frontDoor ? 0 : 2) + (right ? 1 : 0)] || 0;
      const glassName = 'glass-door-' + name.slice(5);
      const pane = ((right && broken === 'right') || (!right && broken === 'left')) && frontDoor ? [] : pieces.get(glassName) || [];
      if (swing) {
        const hingeZ = frontDoor ? doorFront : doorMid;
        hinged(faces, pane, [(right ? 1 : -1) * halfWidth(hingeZ) * 0.97, 0, hingeZ], [0, (right ? 1 : -1) * swing, 0]);
      } else {
        shell.add('paint', skin(faces, origin0));
        if (pane.length) shell.add('glass', skin(pane, origin0));
        else if (pieces.has(glassName)) shards(pieces.get(glassName));
      }
    } else if (name.startsWith('glass-door-')) {
      return; // handled with its door
    } else if (name === 'glass-front' || name === 'glass-rear') {
      if (broken === name.slice(6)) shards(faces);
      else shell.add('glass', skin(faces, origin0));
    } else {
      shell.add('glass', skin(faces, origin0));
    }
  });

  // ---- the open load bed of a pickup -------------------------------------------------------------
  if (type.bed) {
    const [b0, b1] = type.bed;
    const bw = halfWidth((b0 + b1) / 2) * 0.82;
    const rail = topAt((b0 + b1) / 2) - 0.02;
    shell.box('black', 0, rail - 0.42, (b0 + b1) / 2, bw * 2, 0.02, b1 - b0);
    [-1, 1].forEach((side) => shell.box('black', side * bw, rail - 0.2, (b0 + b1) / 2, 0.02, 0.44, b1 - b0));
    shell.box('black', 0, rail - 0.2, b0, bw * 2, 0.44, 0.02);
    shell.box('black', 0, rail - 0.2, b1, bw * 2, 0.44, 0.02);
  }

  // ---- inside: seats, dashboard, steering wheel (dark shapes, seen through the glass) -------------------
  const floor = type.clearance + 0.12;
  const seatZ = (cowl + doorMid) / 2 + 0.25;
  [-1, 1].forEach((side) => {
    shell.box('interior', side * W * 0.22, floor + 0.2, seatZ, 0.5, 0.16, 0.52);
    shell.box('interior', side * W * 0.22, floor + 0.56, seatZ + 0.27, 0.48, 0.62, 0.13, new THREE.Matrix4().makeRotationX(-0.18).setPosition(0, 0.1, 0.1));
    shell.box('interior', side * W * 0.22, floor + 0.95, seatZ + 0.36, 0.26, 0.2, 0.1);
  });
  if (hasRear) {
    shell.box('interior', 0, floor + 0.2, doorMid + 0.55, W * 0.72, 0.16, 0.5);
    shell.box('interior', 0, floor + 0.55, doorMid + 0.83, W * 0.72, 0.58, 0.13);
  }
  shell.box('interior', 0, type.belt - 0.1, cowl + 0.32, W * 0.8, 0.24, 0.36);
  shell.add('interior', new THREE.TorusGeometry(0.17, 0.02, 5, 12), new THREE.Matrix4().makeRotationX(-0.45).setPosition(-W * 0.22, type.belt + 0.02, cowl + 0.55));

  // ---- front: grille, lamps set into dark bowls, bumper, plate -------------------------------------------
  const noseY = topAt(zF + 0.25) - 0.13;
  const lampX = halfWidth(zF + 0.15) * 0.68;
  const faceZ = zF + 0.045 + crush * 0.3;
  shell.box('black', 0, noseY - 0.02, faceZ, lampX * 1.25, 0.15, 0.03);
  for (let i = 0; i < 4; i++) shell.box('chrome', 0, noseY - 0.075 + i * 0.037, faceZ - 0.012, lampX * 1.2, 0.012, 0.012);
  const disc = (key, x, y, z, radius, facing) => {
    const round = new THREE.CircleGeometry(radius, 12);
    if (facing < 0) round.rotateY(Math.PI);
    shell.add(key, round, new THREE.Matrix4().makeTranslation(x, y, z));
  };
  [-1, 1].forEach((side) => {
    const x = side * lampX;
    disc('black', x, noseY, faceZ + 0.03, 0.135, -1);                       // the dark bowl the lamp sits in
    disc('chrome', x, noseY, faceZ + 0.02, 0.1, -1);                        // reflector
    disc(options.headlamps ? 'head' : 'lensClear', x, noseY, faceZ - 0.012, 0.118, -1); // cover
    shell.box(options.indicators ? 'blink' : 'lensAmber', side * (lampX + 0.2), noseY - 0.01, faceZ + 0.06, 0.1, 0.07, 0.03);
    // rear lamps and indicators
    const tailY = Math.min(type.belt, topAt(zR - 0.2)) - 0.12;
    const tailX = side * halfWidth(zR - 0.15) * 0.66;
    shell.box(options.taillamps ? 'tail' : 'lensRed', tailX, tailY, zR - 0.035, 0.34, 0.11, 0.03);
    shell.box(options.indicators ? 'blink' : 'lensAmber', tailX + side * 0.24, tailY, zR - 0.06, 0.1, 0.11, 0.03);
    // mirrors, handles, the strip under the windows
    shell.box('black', side * (halfWidth(glassFront) * 0.93 + 0.05), type.belt + 0.06, glassFront - 0.02, 0.1, 0.03, 0.05);
    shell.box('black', side * (halfWidth(glassFront) * 0.93 + 0.12), type.belt + 0.08, glassFront - 0.02, 0.07, 0.1, 0.15);
    shell.box('chrome', side * halfWidth(doorMid) * 0.985, type.belt - 0.11, doorMid - 0.16, 0.025, 0.03, 0.15);
    if (hasRear) shell.box('chrome', side * halfWidth(doorRear) * 0.985, type.belt - 0.11, doorRear - 0.16, 0.025, 0.03, 0.15);
    shell.box('chrome', side * halfWidth(doorMid) * 0.94, type.belt + 0.004, (doorFront + (hasRear ? doorRear : doorMid)) / 2, 0.02, 0.018, (hasRear ? doorRear : doorMid) - doorFront);
    // wipers
    shell.box('black', side * 0.3 - 0.1, topAt(cowl + 0.09) + 0.012, cowl + 0.1, 0.5, 0.012, 0.02, new THREE.Matrix4().makeRotationY(side * 0.12));
  });
  shell.box('black', 0, type.clearance + 0.13, zF + 0.07, W * 0.84, 0.13, 0.1);
  shell.box('black', 0, type.clearance + 0.13, zR - 0.07, W * 0.84, 0.13, 0.1);
  shell.box('black', 0, type.clearance + 0.3, faceZ - 0.01, 0.48, 0.15, 0.015);
  shell.box('plate', 0, type.clearance + 0.3, faceZ - 0.02, 0.42, 0.11, 0.01); // nothing readable on it
  shell.box('black', 0, type.belt - 0.33, zR - 0.02, 0.48, 0.15, 0.015);
  shell.box('plate', 0, type.belt - 0.33, zR - 0.012, 0.42, 0.11, 0.01);
  shell.add('chrome', new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(W * 0.27, type.clearance + 0.04, zR - 0.08));
  shell.add('black', new THREE.CylinderGeometry(0.004, 0.006, 0.5, 4), new THREE.Matrix4().makeRotationX(-0.3).setPosition(W * 0.3, topAt(roofRear) + 0.2, roofRear + 0.1));

  shell.meshes(Object.assign({}, materials, { head: options.headlamps, tail: options.taillamps, blink: options.indicators }))
    .forEach((mesh) => car.add(mesh));

  // ---- wheels: every car uses the same two shapes -----------------------------------------------------
  const wheels = wheelGeometries();
  const flat = options.flat === undefined ? -1 : options.flat;
  const tyres = new THREE.InstancedMesh(wheels.tyre, materials.tyre, 4);
  const rims = new THREE.InstancedMesh(wheels.rim, materials.rim, 4);
  const dummy = new THREE.Object3D();
  [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(([side, axle], index) => {
    const z = type.axles[axle];
    const sag = index === flat ? 0.8 : 1;
    dummy.position.set(side * (halfWidth(z) * 0.97 - 0.13), type.wheel * sag, z);
    dummy.rotation.set(0, (axle === 0 ? options.steer || 0 : 0) + (side > 0 ? 0 : Math.PI), 0);
    dummy.scale.set(type.wheel, type.wheel * sag, type.wheel);
    dummy.updateMatrix();
    tyres.setMatrixAt(index, dummy.matrix);
    rims.setMatrixAt(index, dummy.matrix);
  });
  [tyres, rims].forEach((mesh) => {
    mesh.frustumCulled = false; // four copies around the car; the car itself is what gets culled
    mesh.castShadow = true;
    mesh.userData.dynamic = true;
    car.add(mesh);
  });

  // ---- finish: fit the space, let a flat tyre pull the body down at that corner --------------------------
  const fit = options.d / L;
  car.scale.setScalar(fit);
  if (flat >= 0) {
    car.rotation.z = (flat % 2 === 0 ? 1 : -1) * 0.03;
    car.rotation.x = (flat < 2 ? 1 : -1) * 0.016;
  }
  let triangles = (wheels.tyre.index.count / 3 + wheels.rim.attributes.position.count / 3) * 4;
  car.traverse((mesh) => {
    if (mesh.isMesh && !mesh.isInstancedMesh) triangles += mesh.geometry.attributes.position.count / 3;
  });
  car.userData.triangles = Math.round(triangles);
  return {
    car, half: (W / 2) * fit, length: L * fit, front: zF * fit, rear: zR * fit,
    lampY: noseY * fit, bodyTop: topAt(zF + 0.9) * fit, roof: roofHeight * fit, triangles: car.userData.triangles,
  };
}

/** Dull colours for abandoned cars: every one greyed down, none bright. */
function carColor(factory, index) {
  const list = Array.isArray(factory.greybox.ch1CarColors) ? factory.greybox.ch1CarColors : ['#4a5356', '#5a4f48', '#3c4440', '#57595a', '#44464d', '#5c5348'];
  return Palette.color(list[index % list.length]);
}

/** What lies around and on a car that has stood out here: oil under it, mud behind the wheels, leaves and rain on top. */
function dressCar(factory, group, built, prop, options) {
  const marks = new QuadSheet();
  const water = new QuadSheet();
  const r = (salt) => hash01(prop, 500 + salt);
  marks.floor(MARK.oil, 0, 0, built.half * 2 + 1.6, built.length + 1.4, 0, 0.045);
  // mud thrown up behind each wheel, on both flanks
  [-1, 1].forEach((side) => {
    [-1, 1].forEach((end) => {
      const z = end * built.length * 0.3 + 0.45;
      const x = side * (built.half + 0.012);
      marks.add(MARK.splash, [x, 0.3, z + side * 0.4], [x, 0.3, z - side * 0.4], [x, 0.95, z - side * 0.4], [x, 0.95, z + side * 0.4], [side, 0, 0]);
    });
  });
  if (!options.clean) {
    // leaves stuck to the bonnet and the roof, rain standing on the roof
    marks.floor(MARK.leaves, (r(1) - 0.5) * 0.5, -built.length * 0.33, 1.3, 1.0, r(2) * 6, built.bodyTop + 0.04);
    marks.floor(MARK.leaves, (r(3) - 0.5) * 0.4, built.length * 0.08, 1.2, 1.1, r(4) * 6, built.roof + 0.03);
    water.floor(MARK.puddleB, (r(5) - 0.5) * 0.4, built.length * 0.1, 0.9, 0.7, r(6) * 6, built.roof + 0.035);
  }
  if (options.glassOnGround) marks.floor(MARK.glass, options.glassOnGround[0], options.glassOnGround[1], 2.2, 2.2, r(7) * 6, 0.05);
  const markMesh = marks.mesh(markMaterial(factory));
  markMesh.renderOrder = 3;
  group.add(markMesh);
  if (!water.empty) {
    const waterMesh = water.mesh(waterMaterial(factory));
    waterMesh.renderOrder = 4;
    group.add(waterMesh);
  }
}

/** Rings spreading from drops that fall into puddles: each quad waits, shows one widening ring, waits again. */
function rippleMaterial(factory) {
  const set = wetSet(factory);
  if (!set.has('ripples')) {
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
      uniforms: { uTime: { value: 0 }, uColor: { value: emitterColor(factory, 'ch1Mist', '#34423f').multiplyScalar(1.6) } },
      vertexShader: [
        'attribute vec2 aDrop; varying vec2 vUv; varying vec2 vDrop;',
        'void main() { vUv = uv; vDrop = aDrop; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec2 vDrop;',
        'void main() {',
        '  float cycle = fract( uTime * vDrop.y + vDrop.x );',   // most of the cycle nothing happens
        '  float t = cycle / 0.3;',
        '  float d = length( vUv - 0.5 ) * 2.0;',
        '  float ring = smoothstep( 0.09, 0.0, abs( d - t * 0.92 ) ) * ( 1.0 - t ) * step( cycle, 0.3 );',
        '  gl_FragColor = vec4( uColor * ring, 1.0 );',
        '}',
      ].join('\n'),
    });
    material.name = 'ch1:ripples';
    animate(factory, (time) => { material.uniforms.uTime.value = time; });
    set.set('ripples', material);
  }
  return set.get('ripples');
}

/** A bank of mist hanging over standing water; it shifts slowly. */
function poolMistMaterial(factory) {
  const set = wetSet(factory);
  if (!set.has('pool-mist')) {
    const texture = new THREE.CanvasTexture(mistTexture());
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    const material = new THREE.MeshBasicMaterial({
      map: texture, color: emitterColor(factory, 'ch1Mist', '#34423f'), transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
    });
    material.name = 'ch1:pool-mist';
    animate(factory, (time) => texture.offset.set(time * 0.012, time * 0.008));
    set.set('pool-mist', material);
  }
  return set.get('pool-mist');
}

/** Galvanised steel that has stood in the rain for years: grey, streaked with rust, green at the foot. */
function railTextures() {
  return paintedOnce('rail', () => {
    const S = 256;
    const colour = makeCanvas(S, S);
    const rough = makeCanvas(S, S);
    const cg = colour.getContext('2d');
    const rg = rough.getContext('2d');
    const broad = cloud(S, S, 4, 4, 4, 701);
    const fine = cloud(S, S, 48, 48, 2, 702);
    const rust = cloud(S, S, 8, 3, 4, 703);
    const cd = cg.createImageData(S, S);
    const rd = rg.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const height = 1 - y / S;
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        let r = 128 + 40 * (broad[i] - 0.5) + 24 * (fine[i] - 0.5);
        let g = r + 2;
        let b = r + 4;
        const eaten = smoothstep(0.5, 0.66, rust[i]);
        r += (104 * (0.6 + fine[i]) - r) * eaten;
        g += (62 * (0.6 + fine[i]) - g) * eaten;
        b += (38 * (0.6 + fine[i]) - b) * eaten;
        const green = smoothstep(0.35, 0.0, height) * smoothstep(0.4, 0.6, broad[i]);
        r += (46 - r) * green * 0.7;
        g += (62 - g) * green * 0.7;
        b += (38 - b) * green * 0.7;
        cd.data[i * 4] = r;
        cd.data[i * 4 + 1] = g;
        cd.data[i * 4 + 2] = b;
        cd.data[i * 4 + 3] = 255;
        rd.data[i * 4] = rd.data[i * 4 + 1] = rd.data[i * 4 + 2] = 255 * clamp01(0.32 + 0.55 * eaten + 0.4 * green);
        rd.data[i * 4 + 3] = 255;
      }
    }
    cg.putImageData(cd, 0, 0);
    rg.putImageData(rd, 0, 0);
    return { map: colourTexture(colour), roughnessMap: dataTexture(rough) };
  });
}

/**
 * Turns everything a builder made into ONE mesh in the rusty-rail material: the pieces keep their
 * shape, the texture is laid over them by position so rust runs across posts and rail alike.
 */
function weatheredSteel(factory, group) {
  group.updateMatrixWorld(true);
  const positions = [];
  const normals = [];
  const uvs = [];
  const point = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      positions.push(point.x, point.y, point.z);
      uvs.push((point.x + point.z) * 0.45, point.y * 0.9);
      point.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      normals.push(point.x, point.y, point.z);
    }
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const textures = railTextures();
  const steel = new THREE.Mesh(merged, wetMaterial(factory, 'rail', () => ({
    map: textures.map, roughnessMap: textures.roughnessMap, envMapIntensity: 0.5, side: THREE.DoubleSide,
  })));
  steel.castShadow = true;
  steel.receiveShadow = true;
  steel.userData.dynamic = true;
  return steel;
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
    ch1_tree_fallen: Ch1Props.treeFallen,
    ch1_tree_leaning: Ch1Props.treeLeaning,
    ch1_lamp: (ctx) => Ch1Props.lamp(ctx, 'dead'),
    ch1_lamp_stutter: (ctx) => Ch1Props.lamp(ctx, 'stutter'),
    ch1_lamp_fallen: (ctx) => Ch1Props.lamp(ctx, 'fallen'),
    ch1_car_crashed: Ch1Props.carCrashed,
    ch1_car_open: Ch1Props.carOpen,
    ch1_car_blocking: Ch1Props.carBlocking,
    ch1_car_hazard: Ch1Props.carHazard,
    ch1_car_lights: Ch1Props.carLights,
    ch1_cone: Ch1Props.cone,
    ch1_sign: Ch1Props.sign,
    ch1_beacon: Ch1Props.beacon,
    ch1_truck: Ch1Props.truck,
  };

  /** Bare dead tree: a tapered, leaning trunk with a few leafless, forked branches. */
  static treeLegacy(ctx) {
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


  /** Steel guard rail along the longer side of `size`: posts every 2 m and one rail. */
  static guardrailLegacy(ctx) {
    return Ch1Props._rail(ctx, false);
  }

  /** Guard rail that something drove through: one end of the rail is bent to the ground. */
  static guardrailBrokenLegacy(ctx) {
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
  static weedsLegacy(ctx) {
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
    // tell the forest where the road runs: trees, plants and far outlines are placed around it
    forestOf(factory).roads.push(alongX
      ? { x1: prop.x - size.w / 2, z1: prop.z, x2: prop.x + size.w / 2, z2: prop.z }
      : { x1: prop.x, z1: prop.z + size.d / 2, x2: prop.x, z2: prop.z - size.d / 2 });

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
    const bigPools = [];
    const pools = Math.round(length / 5);
    for (let i = 0; i < pools; i++) {
      const pick = rnd();
      const across = pick < 0.5 ? 0.15 + rnd() * 0.5 : pick < 0.88 ? 0.7 + rnd() * 1.1 : 2 + rnd() * 1.2;
      const x = rnd() < 0.65 ? (rnd() < 0.5 ? -1 : 1) * (half - 0.3 - rnd() * 0.9) : (rnd() - 0.5) * width * 0.7;
      const z = (rnd() - 0.5) * length;
      water.floor(rnd() < 0.5 ? MARK.puddleA : MARK.puddleB, x, z, across, across * (0.5 + rnd() * 0.6), rnd() * 6.28, 0.043);
      if (across > 0.6) bigPools.push({ x, z, across });
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

    // drops from the branches fall into the larger puddles: a ring spreads and is gone, now and then
    const rings = { positions: [], uvs: [], phases: [] };
    // and the mist lies thicker over standing water
    const fogBank = { positions: [], uvs: [] };
    bigPools.forEach((pool) => {
      const drops = pool.across > 1.5 ? 3 : 1;
      for (let i = 0; i < drops; i++) {
        const cx = pool.x + (rnd() - 0.5) * pool.across * 0.5;
        const cz = pool.z + (rnd() - 0.5) * pool.across * 0.3;
        const r = 0.16 + rnd() * 0.14;
        const phase = rnd();
        const rate = 0.12 + rnd() * 0.2;
        [[-1, 1, 0, 0], [1, 1, 1, 0], [1, -1, 1, 1], [-1, 1, 0, 0], [1, -1, 1, 1], [-1, -1, 0, 1]].forEach(([sx, sz, u, v]) => {
          rings.positions.push(cx + sx * r, 0.05, cz + sz * r);
          rings.uvs.push(u, v);
          rings.phases.push(phase, rate);
        });
      }
      if (pool.across > 1.1) {
        const half = pool.across * 1.1;
        const turn = rnd() * 6.28;
        const y = 0.22 + rnd() * 0.25;
        const corner = (sx, sz) => [pool.x + (sx * Math.cos(turn) + sz * Math.sin(turn)) * half, y, pool.z + (-sx * Math.sin(turn) + sz * Math.cos(turn)) * half];
        [[-1, 1, 0, 0], [1, 1, 1, 0], [1, -1, 1, 1], [-1, 1, 0, 0], [1, -1, 1, 1], [-1, -1, 0, 1]].forEach(([sx, sz, u, v]) => {
          fogBank.positions.push(...corner(sx, sz));
          fogBank.uvs.push(u, v);
        });
      }
    });
    if (rings.positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(rings.positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(rings.uvs, 2));
      geometry.setAttribute('aDrop', new THREE.Float32BufferAttribute(rings.phases, 2));
      const drops = new THREE.Mesh(geometry, rippleMaterial(factory));
      drops.userData.dynamic = true;
      drops.renderOrder = 8;
      leg.add(drops);
    }
    if (fogBank.positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(fogBank.positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(fogBank.uvs, 2));
      const bank = new THREE.Mesh(geometry, poolMistMaterial(factory));
      bank.userData.dynamic = true;
      bank.renderOrder = 11;
      leg.add(bank);
    }

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
    // the level has one ground, so this is also where its weather (mist, torch beam, specks) is hung
    const world = new THREE.Group();
    world.add(floor, buildWeather(factory));
    return world;
  }

  /**
   * A tree. In a level with a chapter 1 road it becomes one copy in the forest's InstancedMesh:
   * its shape, turn, size and lean come from its position, its detail from the distance to the
   * road. A few trunks right beside the road carry claw marks or a bloody hand at chest height.
   * In a level without such a road (the mood board, tests) it is built the old, simple way.
   */
  static tree(ctx) {
    const { factory, size, prop } = ctx;
    const forest = forestOf(factory);
    if (forest.roads.length === 0) return Ch1Props.treeLegacy(ctx);
    const group = forest.anchor(prop);
    forest.populate();
    const near = forest.nearest(prop.x, prop.z);
    // a trunk somebody can bump into keeps its place; the others leave the gaps into the wood open
    if (!prop.collider && forest.inGap(near, prop.x, prop.z)) return group;
    const scale = clamp01((Math.min(size.w, size.d) / 0.6 - 0.7) / 0.7);
    forest.tree(prop.x, prop.z, near, hash01(prop, 1), hash01(prop, 2), scale, hash01(prop, 3), false);
    if (prop.collider && hash01(prop, 4) < 0.45) {
      const out = (0.7 + 0.7 * scale) * 0.27 + 0.03;
      const dx = -near.outX;
      const dz = -near.outZ;
      const sheet = new QuadSheet();
      const claw = hash01(prop, 5) < 0.65;
      const w = claw ? 0.22 : 0.15;
      const h = claw ? 0.34 : 0.2;
      const y = 1 + 0.5 * hash01(prop, 6);
      const at = (sx, sy) => [dx * out + dz * sx * w, y + sy * h, dz * out - dx * sx * w];
      sheet.add(claw ? MARK.claw : MARK.hand, at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), [dx, 0, dz]);
      group.add(sheet.mesh(markMaterial(factory)));
    }
    return group;
  }

  /** Low plants; in a level with a chapter 1 road they are copies in the forest's InstancedMesh. */
  static weeds(ctx) {
    const { factory, size, prop } = ctx;
    const forest = forestOf(factory);
    if (forest.roads.length === 0) return Ch1Props.weedsLegacy(ctx);
    const group = forest.anchor(prop);
    forest.populate();
    forest.plantAt(prop.x, prop.z, forest.nearest(prop.x, prop.z), hash01(prop, 1), hash01(prop, 2), Math.max(0.5, size.h * 1.2));
    return group;
  }

  /**
   * A tree that came down, lying along X with its torn-out roots toward -X and its top toward +X.
   * `size.w` is how much of it lies in the open (bind it to a collider of that width when it
   * blocks the way; the roots reach two metres further back into the wood); `size.h` lifts the
   * top when it rests on something.
   */
  static treeFallen(ctx) {
    const { factory, size, prop } = ctx;
    const forest = forestOf(factory);
    const shapes = forest.shapesOnce();
    const materials = forest.materials();
    const shape = shapes.full[hash01(prop, 1) < 0.5 ? 3 : 0];
    shape.wood.computeBoundingBox();
    const tall = shape.wood.boundingBox.max.y;
    const scale = (size.w + 2.3) / tall;
    const lifted = Math.atan2(size.h * 0.5, size.w + 2);
    const fallen = new THREE.Group();
    const trunk = new THREE.Group();
    const wood = new THREE.Mesh(shape.wood, materials.bark);
    wood.castShadow = true;
    wood.receiveShadow = true;
    wood.userData.dynamic = true;
    trunk.add(wood);
    if (shape.foliage) {
      const leaves = new THREE.Mesh(shape.foliage, materials.foliage);
      leaves.userData.dynamic = true;
      trunk.add(leaves);
    }
    trunk.rotation.set(hash01(prop, 2) * 6.28, 0, -Math.PI / 2 + lifted, 'ZYX');
    trunk.position.set(-size.w / 2 - 2, 0.26 * scale, 0);
    trunk.scale.setScalar(scale);
    fallen.add(trunk);
    // what broke off when it hit the ground
    for (let i = 0; i < 9; i++) {
      const piece = stick(
        factory, 'ch1Log',
        new THREE.Vector3((hash01(prop, 10 + i) - 0.5) * size.w, 0.05, (hash01(prop, 20 + i) - 0.5) * 2.4),
        new THREE.Vector3((hash01(prop, 30 + i) - 0.5) * size.w, 0.05 + hash01(prop, 40 + i) * 0.15, (hash01(prop, 50 + i) - 0.5) * 2.4),
        0.012 + hash01(prop, 60 + i) * 0.03, 4
      );
      fallen.add(piece);
    }
    return fallen;
  }

  /** A tree that started to fall and was caught by its neighbours: it hangs at an angle along X. */
  static treeLeaning(ctx) {
    const { factory, prop } = ctx;
    const forest = forestOf(factory);
    const shape = forest.shapesOnce().full[4];
    const materials = forest.materials();
    const wood = new THREE.Mesh(shape.wood, materials.bark);
    wood.castShadow = true;
    wood.receiveShadow = true;
    wood.userData.dynamic = true;
    wood.rotation.set(0, hash01(prop, 1) * 6.28, -(42 + 14 * hash01(prop, 2)) * DEG, 'ZYX');
    wood.scale.setScalar(1.2);
    const leaning = new THREE.Group();
    leaning.add(wood);
    return leaning;
  }

  /**
   * Street lamp on the shoulder, its arm reaching over the road (toward -Z). `mode`:
   * 'dead' (most of them), 'stutter' (one, flickering unevenly, with a cone of lit fog under it
   * and its light lying on the wet road) or 'fallen' (the post lies across the shoulder).
   * The light is faked: a glowing head, a cone and a patch on the road, no real light.
   */
  static lamp(ctx, mode) {
    const { factory, prop } = ctx;
    const post = new THREE.Group();
    const pole = stick(factory, 'ch1Pole', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 6.2, 0), 0.07, 6);
    const arm = stick(factory, 'ch1Pole', new THREE.Vector3(0, 6.1, 0), new THREE.Vector3(0, 6.35, -1.7), 0.045, 5);
    const lit = mode === 'stutter';
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.62),
      lit ? lampMaterial(factory, 'ch1Lamp', '#ffd9a0', stutter) : factory.material('ch1Pole')
    );
    head.position.set(0, 6.3, -1.95);
    post.add(pole, arm, head);
    post.add(part(factory, 'ch1Rust', 0.3, 0.5, 0.3, 0, 0, 0));
    if (lit) {
      const cone = lightCone(emitterColor(factory, 'ch1Lamp', '#ffd9a0'), 6.4, 2.8, 0.014);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(0, 6.25, -1.95);
      const base = cone.material.color.clone();
      animate(factory, (time) => cone.material.color.copy(base).multiplyScalar(stutter(time)));
      post.add(cone);
      const pool = new QuadSheet().floor(MARK.soft, 0, -1.95, 9, 9, 0, 0.06 - prop.y);
      const light = pool.mesh(glowSheetMaterial(factory, 'ch1Lamp', '#ffd9a0', 0.09, stutter));
      light.renderOrder = 5;
      post.add(light);
    }
    if (mode === 'fallen') {
      post.rotation.set(-(84 + 4 * hash01(prop, 1)) * DEG, 0, 0);
      post.position.y = 0.12;
      const lying = new THREE.Group();
      lying.add(post);
      // glass from the head where it hit the road
      const sheet = new QuadSheet().floor(MARK.glass, 0, -6.4, 1.6, 1.6, hash01(prop, 2) * 6, 0.05);
      lying.add(sheet.mesh(markMaterial(factory)));
      return lying;
    }
    post.rotation.set((hash01(prop, 3) - 0.5) * 0.05, 0, (hash01(prop, 4) - 0.5) * 0.07);
    return post;
  }

  /** Shared by the car builders: the car, with what lies under, on and around it. */
  static carOf(ctx, options) {
    const { factory, size, prop } = ctx;
    const built = buildCar(factory, Object.assign({ w: size.w, d: size.d, seed: Math.floor(hash01(prop, 9) * 1e6) + 1 }, options));
    const group = new THREE.Group();
    group.add(built.car);
    dressCar(factory, group, built, prop, options);
    return { group, built };
  }

  /**
   * Ran off the road and hit a sign post: nose pushed in, bonnet sprung, windscreen gone, a thin
   * thread of smoke, and the black marks of the tyres leading up to it from behind.
   */
  static carCrashed(ctx) {
    const { factory, size, prop } = ctx;
    const { group, built } = Ch1Props.carOf(ctx, {
      color: carColor(factory, 0), crush: 0.9, hoodUp: true, flat: 1, brokenGlass: 'front', steer: -0.4,
      glassOnGround: [0.2, -size.d / 2 - 0.6],
    });
    const skid = new QuadSheet().floor(MARK.skid, 0.2, size.d / 2 + 4.6, 2.6, 9, 0, 0.048);
    const skidMesh = skid.mesh(markMaterial(factory));
    skidMesh.renderOrder = 2;
    group.add(skidMesh);
    // the post it hit, bent over the bonnet
    const post = stick(factory, 'ch1Pole', new THREE.Vector3(0.25, 0, built.front - 0.1), new THREE.Vector3(0.5, 1.5, built.front + 0.9), 0.04, 5);
    group.add(post);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.02), carMaterials(factory).bright);
    plate.position.set(0.56, 1.62, built.front + 1.05);
    plate.rotation.set(0.9, 0.3, 0.78);
    plate.userData.dynamic = true;
    group.add(plate);
    // smoke: four thin puffs rising from under the bonnet, one after the other
    const smoke = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(mistTexture()), color: emitterColor(factory, 'ch1Smoke', '#4a4f4e'),
      transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
    });
    smoke.name = 'ch1:smoke';
    const puffs = [];
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smoke);
      puff.rotation.y = i * 0.8;
      puff.userData.dynamic = true;
      puff.renderOrder = 18;
      puffs.push(puff);
      group.add(puff);
    }
    const drift = hash01(prop, 2) - 0.5;
    animate(factory, (time) => puffs.forEach((puff, i) => {
      const rise = (time * 0.16 + i / 4) % 1;
      puff.position.set(drift * rise * 1.2, built.bodyTop + 0.2 + rise * 2.6, built.front + 0.9 + rise * 0.4);
      puff.scale.setScalar(0.5 + rise * 1.6);
    }));
    return group;
  }

  /** Left in a hurry: every door open, the boot up, cases, clothes and shoes strewn across the road behind it. */
  static carOpen(ctx) {
    const { factory, size, prop } = ctx;
    const { group } = Ch1Props.carOf(ctx, {
      color: carColor(factory, 1), shape: 'hatch', doors: [1.1, 1.25, 0.9, 1.05], trunkUp: true, flat: 2,
    });
    // with the doors open the cabin lamp stays on: a small warm point, and its light on the road around the car
    const dome = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.1), lampMaterial(factory, 'ch1Dome', '#ffd6a0'));
    dome.position.set(0, 1.27, 0.2);
    group.add(dome);
    const spill = new QuadSheet().floor(MARK.soft, 0, 0.2, 7.5, 8.5, 0, 0.058);
    const spillMesh = spill.mesh(glowSheetMaterial(factory, 'ch1Dome', '#ffd6a0', 0.03));
    spillMesh.renderOrder = 7;
    group.add(spillMesh);
    const r = (salt) => hash01(prop, salt);
    for (let i = 0; i < 4; i++) { // cases, one burst open
      const open = i === 0;
      const w = 0.5 + 0.25 * r(10 + i);
      const suitcase = part(factory, i % 2 ? 'ch1Trash' : 'crate', w, open ? 0.1 : 0.22, 0.36, (r(20 + i) - 0.5) * 3.4, 0.03, size.d / 2 + 0.6 + r(30 + i) * 3.2);
      suitcase.rotation.set(0, r(40 + i) * 3, (r(50 + i) - 0.5) * 0.3);
      group.add(suitcase);
      if (open) {
        const lid = part(factory, 'crate', w, 0.03, 0.36, suitcase.position.x, 0.13, suitcase.position.z + 0.3);
        lid.rotation.set(-0.9, suitcase.rotation.y, 0);
        group.add(lid);
      }
    }
    for (let i = 0; i < 9; i++) { // clothes, flat on the wet road
      const cloth = part(factory, ['ch1TrashPale', 'ch1Tent', 'ch1Trash'][i % 3], 0.35 + 0.4 * r(60 + i), 0.015, 0.25 + 0.35 * r(70 + i),
        (r(80 + i) - 0.5) * 4.2, 0.035, size.d / 2 + 0.3 + r(90 + i) * 4.5);
      cloth.rotation.y = r(100 + i) * 3;
      cloth.castShadow = false;
      group.add(cloth);
    }
    for (let i = 0; i < 3; i++) { // shoes, never as a pair
      const shoe = part(factory, 'ch1Trash', 0.1, 0.08, 0.27, (r(110 + i) - 0.5) * 4.6, 0.03, size.d / 2 + 1 + r(120 + i) * 5);
      shoe.rotation.set(0, r(130 + i) * 6, i === 1 ? 1.4 : 0);
      group.add(shoe);
    }
    return group;
  }

  /**
   * Stopped across the road: the driver's window is cracked, there is a bloody hand on the inside
   * of the glass, the driver's door hangs open and something was dragged away from it.
   */
  static carBlocking(ctx) {
    const { factory, size } = ctx;
    const { group, built } = Ch1Props.carOf(ctx, {
      color: carColor(factory, 2), doors: [0.5], flat: 3, glassOnGround: [-size.w / 2 - 0.9, -0.4],
    });
    const sheet = new QuadSheet();
    const x = built.half * 0.845;
    const y = (built.bodyTop + built.roof) / 2;
    // cracks on the passenger window, seen from outside; the hand is on the inside of the same glass
    sheet.add(MARK.cracks, [x + 0.012, y - 0.2, 0.55], [x + 0.012, y - 0.2, -0.25], [x + 0.012, y + 0.22, -0.25], [x + 0.012, y + 0.22, 0.55], [1, 0, 0]);
    sheet.add(MARK.hand, [x + 0.006, y - 0.2, 0.3], [x + 0.006, y - 0.2, 0.0], [x + 0.006, y + 0.2, 0.0], [x + 0.006, y + 0.2, 0.3], [1, 0, 0]);
    sheet.floor(MARK.blood, -built.half - 1.3, 0.2, 0.8, 2.6, Math.PI / 2, 0.047);
    sheet.floor(MARK.blood, -built.half - 3.7, 0.5, 0.7, 2.6, Math.PI / 2 + 0.15, 0.047);
    const marks = sheet.mesh(markMaterial(factory));
    marks.renderOrder = 6;
    group.add(marks);
    // somebody emptied a magazine from behind the open door
    const brass = new THREE.CylinderGeometry(0.006, 0.006, 0.024, 5);
    brass.rotateZ(Math.PI / 2);
    const cases = seeded(4411);
    group.add(scatter(brass, factory.material('ch1Brass'), 14, (o) => {
      o.position.set(-built.half - 0.4 - cases() * 1.6, 0.045, -1.2 + cases() * 1.8);
      o.rotation.set(0, cases() * 6.28, 0);
    }));
    return group;
  }

  /** Hazard lights still blinking, orange and regular: the one thing on this stretch you see from far off. */
  static carHazard(ctx) {
    const { factory, size } = ctx;
    const blinking = lampMaterial(factory, 'ch1Hazard', '#ff9a2a', blink);
    const { group } = Ch1Props.carOf(ctx, { color: carColor(factory, 3), shape: 'suv', indicators: blinking, flat: 0, steer: 0.3 });
    const pools = new QuadSheet();
    [-1, 1].forEach((side) => [-1, 1].forEach((end) => pools.floor(MARK.soft, side * (size.w / 2 + 0.7), end * (size.d / 2 + 0.3), 4.2, 4.2, 0, 0.06)));
    const light = pools.mesh(glowSheetMaterial(factory, 'ch1Hazard', '#ff9a2a', 0.05, blink));
    light.renderOrder = 7;
    group.add(light);
    return group;
  }

  /** A van with its headlamps still on, nearly spent: two weak cones pushing into the fog ahead of it. */
  static carLights(ctx) {
    const { factory, size } = ctx;
    const lamps = lampMaterial(factory, 'ch1Headlamp', '#ffe2b0');
    const { group, built } = Ch1Props.carOf(ctx, { color: carColor(factory, 4), shape: 'pickup', headlamps: lamps, flat: 2, doors: [0, 0.7] });
    const colour = emitterColor(factory, 'ch1Headlamp', '#ffe2b0');
    [-1, 1].forEach((side) => {
      const cone = lightCone(colour, 12, 2.3, 0.0035);
      cone.position.set(side * built.half * 0.62, built.lampY, built.front - 0.05);
      cone.rotation.x = -0.05;
      group.add(cone);
    });
    const pool = new QuadSheet().floor(MARK.soft, 0, built.front - 5.5, 6, 11, 0, 0.06);
    const light = pool.mesh(glowSheetMaterial(factory, 'ch1Headlamp', '#ffe2b0', 0.028));
    light.renderOrder = 7;
    group.add(light);
    return group;
  }

  /** Rolled into the ditch and came to rest on its roof: only the underside and the wheels show. */
  static carFlipped(ctx) {
    if (forestOf(ctx.factory).roads.length === 0) return Ch1Props.carFlippedLegacy(ctx);
    const { factory, size, prop } = ctx;
    const built = buildCar(factory, {
      w: size.w, d: size.d, shape: hash01(prop, 3) < 0.5 ? 'hatch' : 'suv', color: carColor(factory, 5), flat: -1, brokenGlass: 'left',
      seed: 77 + Math.floor(hash01(prop, 9) * 1000),
    });
    built.car.add(part(factory, 'ch1Rust', 0.08, 0.08, size.d * 0.7, 0.32, 0.2, 0.1));
    [-1, 1].forEach((end) => built.car.add(part(factory, 'ch1Rust', size.w * 0.9, 0.07, 0.07, 0, 0.27, end * size.d * 0.3)));
    built.car.rotation.set((hash01(prop, 2) - 0.5) * 0.1, 0, Math.PI + (hash01(prop, 1) - 0.5) * 16 * DEG);
    built.car.position.y = built.roof - 0.28; // sunk into the soft ground of the ditch
    const group = new THREE.Group();
    group.add(built.car);
    const sheet = new QuadSheet().floor(MARK.oil, 0, 0, size.w + 2.4, size.d + 1.6, 0, 0.045)
      .floor(MARK.glass, -size.w / 2 - 0.5, 0.3, 2, 2, 1, 0.05);
    group.add(sheet.mesh(markMaterial(factory)));
    const water = new QuadSheet().floor(MARK.puddleA, 0.2, 0.3, size.w + 2.2, size.d + 1.0, 0.4, 0.046);
    const waterMesh = water.mesh(waterMaterial(factory));
    waterMesh.renderOrder = 4;
    group.add(waterMesh);
    return group;
  }

  /**
   * The car the players are looking for, and the only one out here that still looks as if it would
   * start: clean paint, four good tyres, whole glass, red tail lights glowing toward the road (+Z).
   */
  static escapeCar(ctx) {
    if (forestOf(ctx.factory).roads.length === 0) return Ch1Props.escapeCarLegacy(ctx);
    const { factory, size } = ctx;
    const colour = Palette.color(typeof factory.greybox.ch1EscapeCar === 'string' ? factory.greybox.ch1EscapeCar : '#7a8386');
    const { group, built } = Ch1Props.carOf(ctx, { color: colour, clean: true, taillamps: factory.emitters.accentMaterial() });
    const glow = factory.emitters.accentLight();
    if (glow) {
      glow.position.set(0, built.lampY, size.d / 2 + 0.7);
      group.add(glow);
    }
    // the red of the lamps lying on the wet road behind it
    const pool = new QuadSheet().floor(MARK.soft, 0, size.d / 2 + 1.8, 5, 4.5, 0, 0.06);
    const light = pool.mesh(glowSheetMaterial(factory, 'ch1TailGlow', '#ff3b2f', 0.06));
    light.renderOrder = 7;
    group.add(light);
    return group;
  }

  /** Traffic cone with a reflective band; some lie on their side. */
  static cone(ctx) {
    const { factory, prop } = ctx;
    const cone = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.15, 0.62, 8), factory.material('ch1Cone'));
    body.position.y = 0.33;
    body.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, 0.13, 8), carMaterials(factory).bright);
    band.position.y = 0.4;
    band.userData.dynamic = true;
    cone.add(body, band, part(factory, 'ch1Cone', 0.36, 0.03, 0.36, 0, 0, 0));
    if (hash01(prop, 1) < 0.45) {
      cone.rotation.set(0, hash01(prop, 2) * 6, Math.PI / 2 - 0.12);
      cone.position.y = 0.16;
    } else {
      cone.rotation.y = hash01(prop, 2) * 6;
    }
    const placed = new THREE.Group();
    placed.add(cone);
    return placed;
  }

  /**
   * Warning sign at the roadside, facing -Z: a reflective plate that jumps out of the dark when
   * the torch finds it, shot through, on a post that leans. One in three has been knocked flat.
   */
  static sign(ctx) {
    const { factory, prop } = ctx;
    const sign = new THREE.Group();
    sign.add(stick(factory, 'ch1Pole', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.3, 0), 0.035, 5));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.02), carMaterials(factory).bright);
    plate.position.set(0, 2.0, -0.04);
    plate.rotation.z = Math.PI / 4;
    plate.userData.dynamic = true;
    sign.add(plate);
    const holes = new QuadSheet().add(MARK.holes, [0.3, 1.7, -0.06], [-0.3, 1.7, -0.06], [-0.3, 2.3, -0.06], [0.3, 2.3, -0.06], [0, 0, -1]);
    sign.add(holes.mesh(markMaterial(factory)));
    if (hash01(prop, 1) < 0.34) {
      sign.rotation.set(-(86 + 3 * hash01(prop, 2)) * DEG, hash01(prop, 3) * 0.8, 0);
      sign.position.y = 0.06;
    } else {
      sign.rotation.set((hash01(prop, 4) - 0.5) * 0.3, 0, (hash01(prop, 5) - 0.5) * 0.4);
    }
    const placed = new THREE.Group();
    placed.add(sign);
    return placed;
  }

  /** Road-works warning lamp left standing by a barrier: a slow amber blink low down in the fog. */
  static beacon(ctx) {
    const { factory } = ctx;
    const beacon = new THREE.Group();
    beacon.add(part(factory, 'ch1Cone', 0.3, 0.06, 0.3, 0, 0, 0));
    beacon.add(stick(factory, 'ch1Pole', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.9, 0), 0.025, 5));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), lampMaterial(factory, 'ch1Hazard', '#ff9a2a', blink));
    lamp.position.y = 0.96;
    beacon.add(lamp);
    const pool = new QuadSheet().floor(MARK.soft, 0, 0, 5, 5, 0, 0.06);
    const light = pool.mesh(glowSheetMaterial(factory, 'ch1Hazard', '#ff9a2a', 0.05, blink));
    light.renderOrder = 7;
    beacon.add(light);
    return beacon;
  }

  /** The escape car as it was before the road was rebuilt; levels without a chapter 1 road still get it. */
  static escapeCarLegacy(ctx) {
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

  /** The overturned car as it was before; levels without a chapter 1 road still get it. */
  static carFlippedLegacy(ctx) {
    const { prop, size } = ctx;
    const car = CommonProps.carBody(ctx);
    car.rotation.z = Math.PI + (hash01(prop, 1) - 0.5) * 10 * DEG;
    car.position.y = size.h * 0.98;
    const group = new THREE.Group();
    group.add(car);
    return group;
  }

  /** Crash barrier: the old shape, now one piece of rusty, mossy steel (chapter 1 road levels only). */
  static guardrail(ctx) {
    const built = Ch1Props.guardrailLegacy(ctx);
    return forestOf(ctx.factory).roads.length === 0 ? built : weatheredSteel(ctx.factory, built);
  }

  static guardrailBroken(ctx) {
    const built = Ch1Props.guardrailBrokenLegacy(ctx);
    return forestOf(ctx.factory).roads.length === 0 ? built : weatheredSteel(ctx.factory, built);
  }

  /**
   * A box lorry left across the road, along the longer side of `size`: cab, load box, six wheels,
   * the same mud, rust and misted glass as the cars. One rear door hangs open.
   */
  static truck(ctx) {
    const { factory, size, prop } = ctx;
    const alongX = size.w > size.d;
    const length = alongX ? size.w : size.d;
    const width = Math.min(alongX ? size.d : size.w, 2.5);
    const half = width / 2;
    const materials = carMaterials(factory, false);
    const shell = new Shell();
    const tone = carColor(factory, 1 + Math.floor(hash01(prop, 1) * 5));
    shell.tint = [tone.r, tone.g, tone.b];
    const front = -length / 2;
    const cab = 1.9;
    // load box, chassis, cab
    shell.box('paint', 0, 1.85, front + cab + (length - cab) / 2 + 0.05, width, 2.3, length - cab - 0.1);
    shell.box('dark', 0, 0.55, 0, width * 0.7, 0.3, length * 0.96);
    shell.box('paint', 0, 1.35, front + cab / 2, width * 0.96, 1.7, cab);
    shell.box('glass', 0, 1.75, front - 0.01, width * 0.84, 0.62, 0.03);
    [-1, 1].forEach((side) => {
      shell.box('glass', side * (half * 0.96 + 0.005), 1.72, front + cab * 0.55, 0.02, 0.55, cab * 0.6);
      shell.box('dark', side * (half + 0.14), 1.7, front + 0.25, 0.2, 0.3, 0.08);
      shell.box('chrome', side * (half - 0.35), 0.8, front - 0.02, 0.4, 0.16, 0.06);
      [front + 0.95, length / 2 - 1.3, length / 2 - 2.35].forEach((z, index) => {
        const flat = index === 0 && side < 0;
        shell.wheel('dark', side * (half - 0.14), 0.47 * (flat ? 0.75 : 1), z, 0.47, 0.3, flat ? 0.5 : 1);
      });
    });
    shell.box('dark', 0, 0.55, front - 0.06, width, 0.28, 0.14);
    shell.box('plate', 0, 0.56, front - 0.14, 0.42, 0.11, 0.01);
    // one of the rear doors was forced: it hangs open
    const hinge = new THREE.Matrix4().makeTranslation(half, 0, length / 2).multiply(new THREE.Matrix4().makeRotationY(-1.9));
    shell.box('paint', -half / 2, 1.85, 0.02, half, 2.2, 0.04, hinge);
    shell.box('dark', -half * 0.5, 1.85, length / 2 - 0.05, half * 0.98, 2.2, 0.03);
    const truck = new THREE.Group();
    shell.meshes(materials).forEach((mesh) => truck.add(mesh));
    truck.rotation.z = 0.03;
    const marks = new QuadSheet().floor(MARK.oil, 0, 0, width + 2, length + 1.6, 0, 0.045);
    [-1, 1].forEach((side) => [front + 0.95, length / 2 - 1.8].forEach((z) => {
      const x = side * (half + 0.012);
      marks.add(MARK.splash, [x, 0.4, z + 0.5 + side * 0.6], [x, 0.4, z + 0.5 - side * 0.6], [x, 1.5, z + 0.5 - side * 0.6], [x, 1.5, z + 0.5 + side * 0.6], [side, 0, 0]);
    }));
    marks.floor(MARK.leaves, 0, 0.5, 2.2, 2.6, hash01(prop, 2) * 6, 3.02);
    const markMesh = marks.mesh(markMaterial(factory));
    markMesh.renderOrder = 3;
    truck.add(markMesh);
    // what fell out of the back
    for (let i = 0; i < 5; i++) {
      const box = part(factory, 'crate', 0.4 + 0.3 * hash01(prop, 10 + i), 0.3 + 0.2 * hash01(prop, 20 + i), 0.4, (hash01(prop, 30 + i) - 0.5) * 2.4, 0.03, length / 2 + 0.6 + hash01(prop, 40 + i) * 1.8);
      box.rotation.y = hash01(prop, 50 + i) * 3;
      truck.add(box);
    }
    if (alongX) truck.rotation.y = Math.PI / 2;
    const placed = new THREE.Group();
    placed.add(truck);
    return placed;
  }
}
