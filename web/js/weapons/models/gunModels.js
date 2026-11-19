// Gun models for the first-person view, built from simple shapes (see ModelKit). Each takes a
// ModelKit and returns the posable model. The origin is where the right hand holds the grip;
// the muzzle points toward -Z. Shapes after the old prototype's gfx/weapons.js, simplified.

/** Assault rifle. Parts: magazine, charge (charging handle), bolt. */
export function buildRifle(kit) {
  const Y = 0.022; // bore height
  // upper and lower receiver
  kit.box([0.046, 0.04, 0.24], 'gun_steel', [0, 0.03, -0.06]);
  kit.profile([[0.06, 0.012], [-0.17, 0.012], [-0.17, -0.03], [-0.08, -0.034], [0.0, -0.032], [0.05, -0.02]], 0.05, 'gun_steel_dark', 0, { bevel: 0.002 });
  // handguard, barrel, flash hider
  kit.cylinder(0.029, 0.029, 0.3, 'gun_polymer', [0, Y, -0.33], { sides: 8, rot: [0, 0, Math.PI / 8] });
  kit.cylinder(0.0095, 0.0095, 0.2, 'gun_steel_dark', [0, Y, -0.57]);
  kit.cylinder(0.013, 0.013, 0.05, 'gun_bore', [0, Y, -0.69], { sides: 10 });
  kit.marker('muzzle', [0, Y, -0.72]);
  // top rail and a red-dot sight
  kit.box([0.022, 0.01, 0.46], 'gun_steel_dark', [0, 0.055, -0.2]);
  kit.box([0.032, 0.012, 0.07], 'gun_bore', [0, 0.066, -0.07]);
  for (const s of [-1, 1]) kit.box([0.004, 0.032, 0.05], 'gun_bore', [s * 0.015, 0.088, -0.075]);
  kit.box([0.034, 0.005, 0.05], 'gun_bore', [0, 0.105, -0.075]);
  kit.box([0.026, 0.026, 0.002], 'gun_glass', [0, 0.088, -0.097], { look: { opacity: 0.35, roughness: 0.1 } });
  kit.sphere(0.0018, 'red_dot', [0, 0.088, -0.094], { segments: 6, look: { glow: 6 } });
  // pistol grip and trigger guard
  kit.box([0.03, 0.1, 0.038], 'gun_polymer', [0, -0.065, 0.025], { rot: [-0.32, 0, 0] });
  kit.box([0.008, 0.004, 0.06], 'gun_steel_dark', [0, -0.05, -0.03]);
  kit.box([0.004, 0.018, 0.004], 'gun_steel', [0, -0.04, -0.03], { rot: [0.3, 0, 0] });
  // buffer tube and stock
  kit.cylinder(0.015, 0.015, 0.2, 'gun_steel_dark', [0, 0.03, 0.16]);
  kit.profile([[0.15, 0.05], [0.3, 0.052], [0.3, -0.06], [0.27, -0.065], [0.2, -0.03], [0.15, 0.0]], 0.042, 'gun_polymer', 0, { bevel: 0.003 });
  kit.box([0.046, 0.12, 0.016], 'rubber', [0, -0.005, 0.305]);
  kit.part('magazine', [0, -0.03, -0.11], () => {
    kit.profile([[-0.085, -0.03], [-0.13, -0.03], [-0.15, -0.12], [-0.17, -0.2], [-0.115, -0.21], [-0.1, -0.12]], 0.028, 'gun_polymer', 0, { bevel: 0.002 });
  });
  kit.part('charge', [0, 0.05, 0.04], () => {
    kit.box([0.016, 0.008, 0.02], 'gun_steel_dark', [0, 0.05, 0.045]);
    kit.box([0.04, 0.007, 0.008], 'gun_steel_dark', [0, 0.05, 0.055]);
  });
  kit.part('bolt', [0.024, 0.032, -0.05], () => {
    kit.box([0.003, 0.012, 0.026], 'gun_steel_worn', [0.024, 0.032, -0.05], { look: { metalness: 0.6, roughness: 0.35 } });
  });
  return kit.build('rifle');
}

/** Submachine gun: short, a long straight magazine, wire stock. Parts: magazine, bolt. */
export function buildSmg(kit) {
  const Y = 0.032;
  kit.cylinder(0.024, 0.024, 0.3, 'gun_steel_dark', [0, Y, -0.1], { sides: 14 });
  kit.box([0.04, 0.03, 0.22], 'gun_polymer', [0, 0.0, -0.06]);
  kit.cylinder(0.026, 0.026, 0.13, 'gun_polymer', [0, Y - 0.006, -0.3], { sides: 10 });
  kit.cylinder(0.009, 0.009, 0.05, 'gun_steel_dark', [0, Y, -0.38]);
  kit.cylinder(0.012, 0.012, 0.02, 'gun_bore', [0, Y, -0.405]);
  kit.marker('muzzle', [0, Y, -0.42]);
  // sights: ring at the front, notch at the back
  kit.torus(0.012, 0.0025, 'gun_steel_dark', [0, Y + 0.035, -0.23], { sides: 10 });
  kit.box([0.004, 0.025, 0.006], 'gun_steel_dark', [0, Y + 0.018, -0.23]);
  kit.box([0.026, 0.02, 0.014], 'gun_steel_dark', [0, Y + 0.032, 0.03]);
  // grip, trigger guard, cocking tube handle on the left
  kit.box([0.03, 0.1, 0.04], 'gun_polymer', [0, -0.055, 0.03], { rot: [-0.25, 0, 0] });
  kit.box([0.008, 0.004, 0.06], 'gun_steel_dark', [0, -0.038, -0.03]);
  kit.box([0.012, 0.008, 0.02], 'gun_steel_worn', [-0.03, Y + 0.012, -0.24]);
  // folding wire stock
  for (const s of [-1, 1]) kit.cylinder(0.004, 0.004, 0.22, 'gun_steel_dark', [s * 0.018, 0.0, 0.16], { sides: 6 });
  kit.box([0.044, 0.08, 0.01], 'rubber', [0, -0.02, 0.27]);
  kit.part('magazine', [0, -0.015, -0.12], () => {
    kit.box([0.022, 0.2, 0.034], 'gun_steel_dark', [0, -0.11, -0.125], { rot: [0.12, 0, 0] });
  });
  kit.part('bolt', [0.025, Y + 0.01, -0.04], () => {
    kit.box([0.003, 0.01, 0.024], 'gun_steel_worn', [0.025, Y + 0.01, -0.04], { look: { metalness: 0.6, roughness: 0.35 } });
  });
  return kit.build('smg');
}

/** Pump shotgun: blued barrel over a tube magazine, wooden stock and pump. Parts: pump. */
export function buildShotgun(kit) {
  const Y = 0.035;
  kit.profile([[0.045, 0.02], [0.035, 0.045], [-0.19, 0.045], [-0.19, -0.04], [0.04, -0.04]], 0.048, 'gun_steel_dark', 0, { bevel: 0.002 });
  kit.box([0.004, 0.016, 0.04], 'gun_bore', [0.025, 0.018, -0.07]);
  kit.cylinder(0.0135, 0.0135, 0.53, 'gun_steel_dark', [0, Y, -0.455], { rot: [0, 0, 0] });
  kit.box([0.007, 0.004, 0.5], 'gun_steel', [0, Y + 0.016, -0.45]);
  kit.sphere(0.003, 'gun_brass', [0, Y + 0.021, -0.71], { segments: 6 });
  kit.cylinder(0.009, 0.009, 0.004, 'gun_bore', [0, Y, -0.722]);
  kit.marker('muzzle', [0, Y, -0.725]);
  kit.cylinder(0.012, 0.012, 0.46, 'gun_steel_dark', [0, -0.01, -0.42]);
  kit.cylinder(0.013, 0.013, 0.03, 'gun_steel', [0, -0.01, -0.665]);
  // trigger guard
  kit.profile([[0.04, -0.04], [0.042, -0.07], [0.02, -0.08], [-0.035, -0.074], [-0.04, -0.04], [-0.03, -0.04], [-0.028, -0.064], [0.03, -0.066], [0.032, -0.04]], 0.012, 'gun_bore', 0);
  // wooden stock with a pistol-like wrist
  kit.profile([[0.04, 0.04], [0.08, 0.03], [0.31, 0.012], [0.32, -0.1], [0.21, -0.08], [0.13, -0.065], [0.09, -0.07], [0.05, -0.05], [0.04, -0.03]], 0.044, 'gun_wood', 0, { bevel: 0.004 });
  kit.box([0.048, 0.118, 0.02], 'rubber', [0, -0.045, 0.325], { rot: [0.05, 0, 0] });
  kit.part('pump', [0, -0.012, -0.33], () => {
    kit.profile([[-0.24, 0.0], [-0.42, 0.0], [-0.425, -0.012], [-0.42, -0.038], [-0.24, -0.038], [-0.235, -0.012]], 0.05, 'gun_wood', 0, { bevel: 0.004 });
    for (let i = 0; i < 6; i++) kit.box([0.06, 0.004, 0.004], 'gun_wood_dark', [0, -0.019, -0.27 - i * 0.026]);
    for (const s of [-1, 1]) kit.box([0.003, 0.006, 0.12], 'gun_steel', [s * 0.014, -0.004, -0.19]);
  });
  return kit.build('shotgun');
}

/** Revolver: heavy frame, six-shot cylinder, wooden grip. Parts: cylinder, hammer. */
export function buildRevolver(kit) {
  const Y = 0.04;
  kit.profile([[0.03, 0.06], [-0.07, 0.06], [-0.07, 0.015], [-0.02, 0.01], [0.0, -0.004], [0.032, 0.0]], 0.026, 'gun_steel', 0, { bevel: 0.002, look: { metalness: 0.5, roughness: 0.4 } });
  kit.cylinder(0.011, 0.011, 0.14, 'gun_steel', [0, Y, -0.14], { look: { metalness: 0.5, roughness: 0.4 } });
  kit.box([0.012, 0.012, 0.14], 'gun_steel', [0, Y + 0.012, -0.14], { look: { metalness: 0.5, roughness: 0.4 } });
  kit.cylinder(0.006, 0.006, 0.12, 'gun_steel_dark', [0, Y - 0.02, -0.125]);
  kit.box([0.004, 0.012, 0.012], 'gun_steel_dark', [0, Y + 0.022, -0.2]);
  kit.cylinder(0.006, 0.006, 0.003, 'gun_bore', [0, Y, -0.211]);
  kit.marker('muzzle', [0, Y, -0.215]);
  // grip
  kit.profile([[0.035, 0.005], [0.0, -0.002], [0.012, -0.09], [0.05, -0.1], [0.062, -0.04], [0.052, 0.01]], 0.034, 'gun_wood', 0, { bevel: 0.004 });
  // trigger guard and trigger
  kit.torus(0.017, 0.0025, 'gun_steel', [0, -0.006, -0.018], { arc: Math.PI, rot: [0, Math.PI / 2, Math.PI] });
  kit.box([0.004, 0.018, 0.004], 'gun_steel_dark', [0, -0.002, -0.015], { rot: [0.3, 0, 0] });
  kit.part('cylinder', [0, Y - 0.004, -0.045], () => {
    kit.cylinder(0.022, 0.022, 0.05, 'gun_steel_worn', [0, Y - 0.004, -0.045], { sides: 12, look: { metalness: 0.55, roughness: 0.4 } });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      kit.cylinder(0.0045, 0.0045, 0.002, 'gun_brass', [Math.cos(a) * 0.013, Y - 0.004 + Math.sin(a) * 0.013, -0.019], { sides: 8 });
    }
  });
  kit.part('hammer', [0, Y + 0.012, 0.03], () => {
    kit.box([0.008, 0.024, 0.01], 'gun_steel_dark', [0, Y + 0.024, 0.032], { rot: [-0.35, 0, 0] });
  });
  return kit.build('revolver');
}
