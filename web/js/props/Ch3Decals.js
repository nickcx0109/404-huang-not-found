import * as THREE from 'three';

// Ch3Decals: the marks left on chapter 3's surfaces (blood, soot, bullet holes, cracked glass)
// and its faked pools of light. Everything is painted on canvases when the level loads, from fixed
// seeds, so nothing is downloaded and every load looks the same.
//
// All marks share ONE 1024 px image cut into 4 x 4 cells. A decal is a flat quad whose texture
// coordinates point at one cell; because they share a material, StaticBatcher merges all decals of
// a level into a handful of draw calls.
//
// Chapter 3 only. Ch3Props.js decides where the marks go and which colour they take.

const GRID = 4;
const CELL = 256;

/** Cells of the atlas. */
export const DECAL = Object.freeze({
  splatterA: 0, splatterB: 1, poolA: 2, poolB: 3,
  trail: 4, drips: 5, hand: 6, foot: 7,
  wipe: 8, scorch: 9, water: 10, grime: 11,
  bullets: 12, cracks: 13, stripes: 14, glow: 15,
});

// Mid-tone blood; the material's colour darkens it (old) or leaves it red (fresh).
const BLOOD = '#56120d';
const BLOOD_DARK = '#2a0705';

/** Small repeatable random generator: returns a function giving numbers in [0, 1). */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function blob(g, x, y, radius, rnd, points = 14, wobble = 0.35) {
  g.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (1 - wobble / 2 + wobble * rnd());
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

// ---- painters: each draws inside a 256 x 256 box, a few pixels away from the border ----------

/** A dense centre and fine drops thinning out from it, each drop stretched away from the centre. */
function splatter(g, rnd) {
  g.fillStyle = BLOOD;
  for (let i = 0; i < 46; i++) {
    const angle = rnd() * Math.PI * 2;
    const out = rnd() * rnd() * 36;
    blob(g, 128 + Math.cos(angle) * out, 128 + Math.sin(angle) * out, 4 + rnd() * 17, rnd, 9, 0.5);
    g.fill();
  }
  for (let i = 0; i < 300; i++) {
    const angle = rnd() * Math.PI * 2;
    const out = 28 + Math.pow(rnd(), 1.7) * 92;
    const size = (0.5 + rnd() * 3.2) * (1.25 - out / 130);
    g.save();
    g.translate(128 + Math.cos(angle) * out, 128 + Math.sin(angle) * out);
    g.rotate(angle);
    g.globalAlpha = 0.55 + rnd() * 0.45;
    g.beginPath();
    g.ellipse(0, 0, size * (1.4 + rnd() * 2.6), size, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = BLOOD_DARK;
  g.globalAlpha = 0.5;
  blob(g, 128, 128, 20, rnd, 12, 0.6);
  g.fill();
}

/** An irregular puddle: darker where it dried at the rim, a little lighter in the middle. */
function pool(g, rnd) {
  const spots = [[128, 128, 86]];
  for (let i = 0; i < 4; i++) spots.push([128 + (rnd() - 0.5) * 90, 128 + (rnd() - 0.5) * 90, 34 + rnd() * 30]);
  g.fillStyle = BLOOD_DARK;
  spots.forEach(([x, y, r]) => { blob(g, x, y, r, rnd, 22, 0.3); g.fill(); });
  g.fillStyle = BLOOD;
  spots.forEach(([x, y, r]) => { blob(g, x, y, r - 7, rnd, 22, 0.3); g.fill(); });
  const shine = g.createRadialGradient(118, 118, 4, 128, 128, 70);
  shine.addColorStop(0, 'rgba(120, 40, 32, 0.45)');
  shine.addColorStop(1, 'rgba(120, 40, 32, 0)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = shine;
  g.fillRect(0, 0, CELL, CELL);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = BLOOD;
  for (let i = 0; i < 26; i++) {
    const angle = rnd() * Math.PI * 2;
    const out = 96 + rnd() * 26;
    g.beginPath();
    g.arc(128 + Math.cos(angle) * out, 128 + Math.sin(angle) * out, 0.8 + rnd() * 3.5, 0, Math.PI * 2);
    g.fill();
  }
}

/** Something dragged: streaks running top to bottom (they continue into the next piece), with gaps. */
function trail(g, rnd) {
  g.strokeStyle = BLOOD;
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    let x = 50 + rnd() * 156;
    g.lineWidth = 1.5 + rnd() * rnd() * 20;
    g.globalAlpha = 0.25 + rnd() * 0.6;
    g.beginPath();
    g.moveTo(x, -12);
    for (let y = 20; y <= 270; y += 25) {
      x += (rnd() - 0.5) * 12;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 1;
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    g.ellipse(20 + rnd() * 216, rnd() * 256, 20 + rnd() * 50, 3 + rnd() * 10, (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

/** Runs from the top edge downwards, thick and thin, each ending in a bead. */
function drips(g, rnd) {
  g.strokeStyle = BLOOD;
  g.fillStyle = BLOOD;
  g.lineCap = 'round';
  for (let i = 0; i < 17; i++) {
    const x = 22 + rnd() * 212;
    const top = rnd() * 26;
    const length = 40 + Math.pow(rnd(), 1.4) * 185;
    const width = 1.5 + rnd() * rnd() * 11;
    g.globalAlpha = 0.6 + rnd() * 0.4;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x + (rnd() - 0.5) * 6, top + length);
    g.stroke();
    g.beginPath();
    g.arc(x, top + length, width * 0.75, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.85;
  for (let i = 0; i < 12; i++) {
    blob(g, 20 + rnd() * 216, 8 + rnd() * 18, 8 + rnd() * 14, rnd, 9, 0.5);
    g.fill();
  }
}

/** A hand pressed flat, then sliding down. */
function hand(g, rnd) {
  g.fillStyle = BLOOD;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.ellipse(128, 86, 27, 30, 0, 0, Math.PI * 2);
  g.fill();
  const fingers = [[-25, 26, -0.22], [-9, 34, -0.07], [8, 35, 0.06], [24, 28, 0.2]];
  fingers.forEach(([dx, length, lean]) => {
    g.save();
    g.translate(128 + dx, 62);
    g.rotate(lean);
    g.beginPath();
    g.ellipse(0, -length / 2, 6.5, length / 2 + 4, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
  g.save();
  g.translate(96, 92);
  g.rotate(-0.9);
  g.beginPath();
  g.ellipse(0, -10, 7, 17, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // the slide
  g.strokeStyle = BLOOD;
  g.lineCap = 'round';
  [-22, -8, 6, 20, 0].forEach((dx) => {
    const gradient = g.createLinearGradient(0, 100, 0, 246);
    gradient.addColorStop(0, 'rgba(86, 18, 13, 0.8)');
    gradient.addColorStop(1, 'rgba(86, 18, 13, 0)');
    g.strokeStyle = gradient;
    g.lineWidth = 5 + rnd() * 9;
    g.beginPath();
    g.moveTo(128 + dx, 100);
    g.lineTo(128 + dx + (rnd() - 0.5) * 16, 180 + rnd() * 66);
    g.stroke();
  });
  // gaps of the palm lines
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 1.5;
  g.strokeStyle = '#000';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(104, 78 + i * 9);
    g.quadraticCurveTo(128, 70 + i * 11, 152, 84 + i * 8);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
}

/** One shoe print, toe toward the top: sole and heel with the tread left open. */
function foot(g) {
  g.fillStyle = BLOOD;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.ellipse(128, 96, 34, 62, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(128, 198, 27, 32, 0, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 1;
  for (let y = 44; y < 230; y += 13) g.fillRect(84, y, 88, 4.5);
  g.fillRect(84, 156, 88, 12);
  g.globalCompositeOperation = 'source-over';
}

/** Someone slid down or along a wall: a broad dragged smear that sags to one side. */
function wipe(g, rnd) {
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const offset = (rnd() - 0.5) * 70;
    g.strokeStyle = BLOOD;
    g.globalAlpha = 0.12 + rnd() * 0.5;
    g.lineWidth = 1.5 + rnd() * 9;
    g.beginPath();
    g.moveTo(24 + rnd() * 20, 70 + offset);
    g.bezierCurveTo(90, 60 + offset, 150, 120 + offset * 0.8, 228 - rnd() * 40, 190 + offset * 0.5);
    g.stroke();
  }
  g.globalAlpha = 0.9;
  g.fillStyle = BLOOD;
  blob(g, 46, 74, 30, rnd, 12, 0.5);
  g.fill();
}

/** Soot around a fire: black in the middle, rays and haze outwards. */
function scorch(g, rnd) {
  const haze = g.createRadialGradient(128, 128, 6, 128, 128, 122);
  haze.addColorStop(0, 'rgba(8, 7, 6, 0.97)');
  haze.addColorStop(0.45, 'rgba(10, 9, 8, 0.7)');
  haze.addColorStop(1, 'rgba(12, 11, 10, 0)');
  g.fillStyle = haze;
  g.fillRect(0, 0, CELL, CELL);
  g.strokeStyle = 'rgba(6, 5, 5, 0.55)';
  g.lineCap = 'round';
  for (let i = 0; i < 44; i++) {
    const angle = rnd() * Math.PI * 2;
    const reach = 50 + rnd() * 68;
    g.lineWidth = 1 + rnd() * 6;
    g.beginPath();
    g.moveTo(128 + Math.cos(angle) * 22, 128 + Math.sin(angle) * 22);
    g.lineTo(128 + Math.cos(angle) * reach, 128 + Math.sin(angle) * reach);
    g.stroke();
  }
}

/** Dried water: a brown outline with a pale wash inside. */
function water(g, rnd) {
  g.fillStyle = 'rgba(86, 70, 44, 0.22)';
  blob(g, 128, 128, 98, rnd, 20, 0.35);
  g.fill();
  g.strokeStyle = 'rgba(70, 54, 30, 0.7)';
  g.lineWidth = 3.5;
  g.stroke();
  g.strokeStyle = 'rgba(70, 54, 30, 0.35)';
  g.lineWidth = 2;
  blob(g, 122, 132, 66, rnd, 18, 0.35);
  g.stroke();
}

/** Dirt, mould, greasy dust: soft dark clouds. */
function grime(g, rnd) {
  for (let i = 0; i < 60; i++) {
    const x = 40 + rnd() * 176;
    const y = 40 + rnd() * 176;
    const radius = 10 + rnd() * 34;
    const cloud = g.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, 'rgba(16, 17, 14, 0.3)');
    cloud.addColorStop(1, 'rgba(16, 17, 14, 0)');
    g.fillStyle = cloud;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/** A burst of bullet holes: dark holes, chipped pale plaster around them, hairline cracks. */
function bullets(g, rnd) {
  for (let i = 0; i < 7; i++) {
    const x = 48 + rnd() * 160;
    const y = 48 + rnd() * 160;
    g.fillStyle = 'rgba(186, 182, 170, 0.85)';
    blob(g, x, y, 11 + rnd() * 9, rnd, 9, 0.7);
    g.fill();
    g.strokeStyle = 'rgba(20, 19, 18, 0.7)';
    g.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const angle = rnd() * Math.PI * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * (16 + rnd() * 22), y + Math.sin(angle) * (16 + rnd() * 22));
      g.stroke();
    }
    g.fillStyle = '#050505';
    g.beginPath();
    g.arc(x, y, 4.5 + rnd() * 2.5, 0, Math.PI * 2);
    g.fill();
  }
}

/** Glass hit at one point: rays to the edge and rings between them. */
function cracks(g, rnd) {
  const cx = 110 + rnd() * 36;
  const cy = 110 + rnd() * 36;
  g.strokeStyle = 'rgba(226, 234, 236, 0.8)';
  g.lineCap = 'round';
  const rays = [];
  for (let i = 0; i < 15; i++) {
    const angle = (i / 15) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
    rays.push(angle);
    let x = cx;
    let y = cy;
    let heading = angle;
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
  [26, 52, 84].forEach((radius) => {
    rays.forEach((angle, i) => {
      if (rnd() < 0.3) return;
      const next = rays[(i + 1) % rays.length] + (i + 1 === rays.length ? Math.PI * 2 : 0);
      g.beginPath();
      g.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      g.lineTo(cx + Math.cos(next) * radius * (0.9 + rnd() * 0.2), cy + Math.sin(next) * radius * (0.9 + rnd() * 0.2));
      g.stroke();
    });
  });
  g.fillStyle = 'rgba(236, 240, 240, 0.9)';
  blob(g, cx, cy, 7, rnd, 8, 0.8);
  g.fill();
}

/** Light through a crooked blind: bars of light, fading away from the window (top). */
function stripes(g, rnd) {
  for (let i = 0; i < 11; i++) {
    if (rnd() < 0.14) continue; // a slat that hangs shut
    const y = 14 + i * 21;
    const fade = 1 - i / 13;
    g.save();
    g.translate(128, y);
    g.rotate((rnd() - 0.5) * 0.07);
    const bar = g.createLinearGradient(-120, 0, 120, 0);
    bar.addColorStop(0, 'rgba(255, 255, 255, 0)');
    bar.addColorStop(0.15, 'rgba(255, 255, 255, ' + (0.9 * fade).toFixed(3) + ')');
    bar.addColorStop(0.85, 'rgba(255, 255, 255, ' + (0.9 * fade).toFixed(3) + ')');
    bar.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = bar;
    g.fillRect(-120, -5, 240, 8 + rnd() * 4);
    g.restore();
  }
}

/** A soft round patch of light. */
function glow(g) {
  const light = g.createRadialGradient(128, 128, 0, 128, 128, 124);
  light.addColorStop(0, 'rgba(255, 255, 255, 1)');
  light.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
  light.addColorStop(0.7, 'rgba(255, 255, 255, 0.12)');
  light.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = light;
  g.fillRect(0, 0, CELL, CELL);
}

const PAINTERS = [splatter, splatter, pool, pool, trail, drips, hand, foot, wipe, scorch, water, grime, bullets, cracks, stripes, glow];

let atlas = null;

/** The shared image of all marks (built on first use). */
export function atlasTexture() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID * CELL;
  const g = canvas.getContext('2d');
  PAINTERS.forEach((paint, index) => {
    g.save();
    g.beginPath();
    g.rect((index % GRID) * CELL + 3, Math.floor(index / GRID) * CELL + 3, CELL - 6, CELL - 6);
    g.clip();
    g.translate((index % GRID) * CELL, Math.floor(index / GRID) * CELL);
    paint(g, random(7919 * (index + 1)));
    g.restore();
  });
  atlas = new THREE.CanvasTexture(canvas);
  atlas.encoding = THREE.sRGBEncoding;
  atlas.anisotropy = 4;
  return atlas;
}

/**
 * Flat quad showing one cell of the atlas. It stands upright facing +Z like a PlaneGeometry;
 * the caller lays it on the floor or turns it to a wall.
 */
export function decalQuad(cell, width, height, material) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.attributes.uv;
  const column = cell % GRID;
  const row = Math.floor(cell / GRID);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (column + uv.getX(i)) / GRID, 1 - (row + 1 - uv.getY(i)) / GRID);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = !material.isMeshBasicMaterial;
  return mesh;
}

/** Material for marks that sit on a surface and take light, fog and shadow like it. */
export function markMaterial(name, color, roughness, opacity = 1) {
  const material = new THREE.MeshStandardMaterial({
    map: atlasTexture(), color, roughness, metalness: 0, opacity,
    transparent: true, depthWrite: false,
    // pulled toward the camera in depth only, so a mark never flickers against its wall
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  material.name = 'decal:' + name;
  return material;
}

/** Material for faked light on a surface: added on top of what is there, unlit, still fogged. */
export function lightMaterial(name, color) {
  const material = new THREE.MeshBasicMaterial({
    map: atlasTexture(), color, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  material.name = 'light:' + name;
  return material;
}

let signs = null;

/**
 * A second small image for the two things that carry writing: the company sign in the lobby (top half)
 * and the whiteboard with the last meeting and a count of days (bottom half).
 * MVIDIA is the company of this game's story; the mark is drawn here and copies nobody's logo.
 */
export function signTexture() {
  if (signs) return signs;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  const rnd = random(4242);

  // sign: dark plate, pale letters, one letter knocked crooked, grime over everything
  g.fillStyle = '#1b1f21';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#aeb6b4';
  g.lineWidth = 9;
  g.beginPath(); // the mark: three chevrons
  for (let i = 0; i < 3; i++) {
    g.moveTo(40 + i * 20, 86);
    g.lineTo(66 + i * 20, 128);
    g.lineTo(40 + i * 20, 170);
  }
  g.stroke();
  g.fillStyle = '#aeb6b4';
  g.font = '700 84px Arial, Helvetica, sans-serif';
  g.textBaseline = 'middle';
  let x = 132;
  'MVIDIA'.split('').forEach((letter, index) => {
    g.save();
    g.translate(x, 130);
    if (index === 3) { g.rotate(0.34); g.translate(0, 16); }
    g.fillText(letter, 0, 0);
    g.restore();
    x += g.measureText(letter).width + 8;
  });
  for (let i = 0; i < 70; i++) {
    const px = rnd() * 512;
    const py = rnd() * 256;
    const radius = 8 + rnd() * 40;
    const cloud = g.createRadialGradient(px, py, 0, px, py, radius);
    cloud.addColorStop(0, 'rgba(8, 9, 8, 0.4)');
    cloud.addColorStop(1, 'rgba(8, 9, 8, 0)');
    g.fillStyle = cloud;
    g.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  }

  // whiteboard: half-wiped meeting notes, then a tally of days and one line in a hurry
  g.fillStyle = '#8c8f89';
  g.fillRect(0, 256, 512, 256);
  g.strokeStyle = 'rgba(40, 52, 70, 0.75)';
  g.lineWidth = 2;
  g.font = '22px "Comic Sans MS", "Bradley Hand", cursive';
  g.fillStyle = 'rgba(40, 52, 70, 0.8)';
  ['Q3 roadmap', '- cooling rev B', '- launch window ??', '- call HQ'].forEach((line, i) => g.fillText(line, 22, 292 + i * 30));
  g.strokeRect(250, 276, 110, 70);
  g.beginPath();
  g.moveTo(360, 311); g.lineTo(420, 311); g.lineTo(410, 301); g.moveTo(420, 311); g.lineTo(410, 321);
  g.stroke();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 5; i++) { // sleeve wipes
    g.globalAlpha = 0.55;
    g.beginPath();
    g.ellipse(60 + rnd() * 300, 290 + rnd() * 70, 60, 14, (rnd() - 0.5) * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#8c8f89';
  g.fillRect(0, 256, 512, 256);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(70, 20, 16, 0.9)';
  g.lineWidth = 3;
  for (let i = 0; i < 23; i++) { // days counted in fives
    const tx = 24 + i * 13 + Math.floor(i / 5) * 12;
    g.beginPath();
    if (i % 5 === 4) { g.moveTo(tx - 58, 452); g.lineTo(tx - 4, 398); } else { g.moveTo(tx, 398 + rnd() * 4); g.lineTo(tx + (rnd() - 0.5) * 4, 452); }
    g.stroke();
  }
  g.fillStyle = 'rgba(70, 20, 16, 0.9)';
  g.font = '34px "Comic Sans MS", "Bradley Hand", cursive';
  g.save();
  g.translate(300, 486);
  g.rotate(-0.05);
  g.fillText('STAY OUT OF 2F', -60, 0);
  g.restore();

  signs = new THREE.CanvasTexture(canvas);
  signs.encoding = THREE.sRGBEncoding;
  signs.anisotropy = 4;
  return signs;
}
