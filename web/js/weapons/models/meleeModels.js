// Melee weapon models for the first-person view, built from simple shapes (see ModelKit). The
// origin is where the right hand holds the handle; the head or blade points toward -Z.

/** Baseball bat: wood, taped handle, knob. No moving parts. */
export function buildBat(kit) {
  kit.cylinder(0.014, 0.034, 0.55, 'bat_wood', [0, 0, -0.42], { sides: 14 });
  kit.sphere(0.034, 'bat_wood', [0, 0, -0.695], { segments: 14, scale: [1, 1, 0.35] });
  kit.cylinder(0.0128, 0.014, 0.23, 'bat_wood', [0, 0, -0.03], { sides: 12 });
  kit.cylinder(0.0142, 0.0148, 0.16, 'bat_tape', [0, 0, 0.0], { sides: 12, look: { roughness: 0.95, metalness: 0 } });
  kit.cylinder(0.021, 0.017, 0.016, 'bat_wood_dark', [0, 0, 0.088], { sides: 14 });
  // a few dents and stains near the sweet spot
  kit.box([0.004, 0.012, 0.03], 'bat_wood_dark', [0.03, 0.006, -0.55], { rot: [0, 0, 0.3] });
  kit.box([0.02, 0.003, 0.05], 'blood', [0.0, 0.031, -0.6], { rot: [0.05, 0, 0] });
  return kit.build('bat');
}

/**
 * Katana: sharkskin handle with a diamond wrap, brass guard and collar, a curved blade in
 * three bands (ridge, flat, edge) and a faint cold glow along the edge.
 */
export function buildKatana(kit) {
  // handle (ito wrap over sharkskin, the diamonds show the skin)
  kit.cylinder(0.0175, 0.0175, 0.24, 'katana_ito', [0, 0, 0.018], { sides: 8, rot: [0, 0, Math.PI / 8] });
  for (let i = 0; i < 7; i++) {
    for (const s of [-1, 1]) kit.box([0.002, 0.0085, 0.0085], 'katana_same', [s * 0.0172, 0, 0.115 - i * 0.032], { rot: [Math.PI / 4, 0, 0] });
  }
  kit.cylinder(0.0185, 0.018, 0.014, 'gun_steel_dark', [0, 0, 0.145], { sides: 8, rot: [0, 0, Math.PI / 8] });
  kit.cylinder(0.0185, 0.0185, 0.012, 'gun_brass', [0, 0, -0.1], { sides: 8, rot: [0, 0, Math.PI / 8], look: { metalness: 0.7, roughness: 0.35 } });
  kit.cylinder(0.042, 0.042, 0.007, 'gun_brass', [0, 0, -0.112], { sides: 16, scale: [1, 1.15, 1], look: { metalness: 0.7, roughness: 0.4 } });
  kit.box([0.013, 0.036, 0.028], 'gun_brass', [0, 0.001, -0.13], { look: { metalness: 0.7, roughness: 0.35 } });
  // blade: a gentle upward curve, thinning toward the tip
  const steps = 10;
  const spine = [];
  const edge = [];
  const ridge = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 0.93;
    const z = -0.125 - 0.81 * t;
    const middle = 0.03 * t * t;
    const half = 0.0165 - 0.0035 * t;
    spine.push([z, middle + half]);
    ridge.push([z, middle + half * 0.3]);
    edge.push([z, middle - half]);
  }
  const tip = [-0.125 - 0.81, 0.03 + 0.012];
  kit.profile([...spine, tip, ...ridge.slice().reverse()], 0.0058, 'katana_ridge', 0, { look: { metalness: 0.75, roughness: 0.3 } });
  kit.profile([...ridge, tip, ...edge.slice().reverse()], 0.0042, 'katana_blade', 0, { look: { metalness: 0.8, roughness: 0.22 } });
  // the temper line along the edge, slightly proud so it shows on both faces
  const glow = edge.map(([z, y]) => [z, y + 0.0045]);
  kit.profile([...edge, tip, ...glow.slice().reverse()], 0.0046, 'katana_edge', 0, { look: { glow: 1.6, metalness: 0.3, roughness: 0.2 } });
  return kit.build('katana');
}

/** Chainsaw: orange engine, wrap-around front handle, guide bar. Parts: chain (runs on every cut). */
export function buildChainsaw(kit) {
  // rear handle and engine
  kit.box([0.026, 0.03, 0.12], 'saw_orange', [0, 0.0, 0.03]);
  kit.box([0.026, 0.09, 0.026], 'saw_orange', [0, -0.04, 0.08]);
  kit.box([0.11, 0.13, 0.22], 'saw_orange', [0, 0.0, -0.16]);
  kit.box([0.112, 0.03, 0.2], 'gun_polymer', [0, -0.07, -0.16]);
  kit.box([0.09, 0.025, 0.12], 'saw_orange_dark', [0, 0.075, -0.15]);
  for (let i = 0; i < 4; i++) kit.box([0.004, 0.004, 0.08], 'gun_bore', [0.057, 0.04 - i * 0.014, -0.16]);
  kit.cylinder(0.045, 0.045, 0.012, 'gun_polymer', [-0.06, 0.0, -0.15], { axis: 'x', sides: 14 });
  kit.cylinder(0.012, 0.012, 0.03, 'gun_bore', [-0.07, 0.06, -0.12], { axis: 'z', sides: 8 });
  // front handle wrapped over the top, and the chain brake guard
  kit.torus(0.07, 0.009, 'gun_bore', [0, 0.0, -0.22], { arc: Math.PI, sides: 14 });
  kit.box([0.12, 0.08, 0.008], 'gun_polymer', [0, 0.05, -0.285], { rot: [-0.2, 0, 0] });
  // clutch cover and muffler on the right
  kit.box([0.03, 0.08, 0.07], 'gun_polymer', [0.065, -0.02, -0.25]);
  kit.box([0.04, 0.03, 0.025], 'gun_steel_dark', [-0.03, -0.055, -0.28]);
  // guide bar
  kit.box([0.006, 0.05, 0.5], 'gun_steel_worn', [0.02, -0.01, -0.52], { look: { metalness: 0.6, roughness: 0.4 } });
  kit.cylinder(0.025, 0.025, 0.006, 'gun_steel_worn', [0.02, -0.01, -0.77], { axis: 'x', sides: 14, look: { metalness: 0.6, roughness: 0.4 } });
  kit.part('chain', [0.02, -0.01, -0.52], () => {
    for (let i = 0; i < 17; i++) {
      const z = -0.29 - i * 0.03;
      kit.box([0.01, 0.006, 0.014], 'gun_steel_dark', [0.02, 0.017, z], { look: { metalness: 0.5, roughness: 0.5 } });
      kit.box([0.01, 0.006, 0.014], 'gun_steel_dark', [0.02, -0.037, z], { look: { metalness: 0.5, roughness: 0.5 } });
    }
  });
  return kit.build('chainsaw');
}
