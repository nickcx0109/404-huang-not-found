// Hand-held items for the first-person view, built from simple shapes (see ModelKit). The origin
// is the middle of the item in the hand.

/** Hand grenade: ridged olive body, fuze, lever. Parts: pin (the ring, pulled before the throw). */
export function buildGrenade(kit) {
  kit.sphere(0.03, 'grenade_olive', [0, 0, 0], { segments: 10, scale: [1, 1.2, 1], look: { flat: true, roughness: 0.7 } });
  for (const y of [-0.016, 0, 0.016]) kit.torus(0.029, 0.0018, 'grenade_olive_dark', [0, y, 0], { rot: [Math.PI / 2, 0, 0] });
  kit.cylinder(0.011, 0.012, 0.024, 'gun_steel', [0, 0.044, 0], { axis: 'y', sides: 10, look: { metalness: 0.5 } });
  kit.box([0.012, 0.062, 0.006], 'gun_steel_worn', [0, 0.022, 0.033], { rot: [-0.18, 0, 0], look: { metalness: 0.5 } });
  kit.part('pin', [-0.016, 0.046, 0], () => {
    kit.torus(0.011, 0.0018, 'gun_steel_worn', [-0.026, 0.046, 0], { rot: [0, Math.PI / 2, 0], look: { metalness: 0.7, roughness: 0.3 } });
    kit.cylinder(0.0015, 0.0015, 0.02, 'gun_steel_worn', [-0.012, 0.046, 0], { axis: 'x', sides: 6 });
  });
  return kit.build('grenade');
}

/** Fire bottle: green glass half full of fuel, a rag in the neck. Parts: flame. */
export function buildMolotov(kit) {
  kit.cylinder(0.026, 0.026, 0.084, 'molotov_fuel', [0, -0.022, 0], { axis: 'y', sides: 14, look: { opacity: 0.85, roughness: 0.3 } });
  kit.cylinder(0.031, 0.031, 0.13, 'molotov_glass', [0, 0, 0], { axis: 'y', sides: 16, look: { opacity: 0.7, roughness: 0.15, metalness: 0.1 } });
  kit.cylinder(0.012, 0.031, 0.035, 'molotov_glass', [0, 0.0825, 0], { axis: 'y', sides: 16, look: { opacity: 0.7, roughness: 0.15, metalness: 0.1 } });
  kit.cylinder(0.012, 0.012, 0.05, 'molotov_glass', [0, 0.125, 0], { axis: 'y', sides: 12, look: { opacity: 0.7, roughness: 0.15, metalness: 0.1 } });
  kit.cylinder(0.008, 0.013, 0.035, 'cloth_dirty', [0, 0.165, 0], { axis: 'y', sides: 7, rot: [0.1, 0, 0.12], look: { flat: true, roughness: 0.95, metalness: 0 } });
  kit.box([0.014, 0.05, 0.003], 'cloth_dirty', [0.014, 0.135, 0.008], { rot: [0, 0.4, -0.2], look: { roughness: 0.95, metalness: 0 } });
  kit.part('flame', [0, 0.185, 0], () => {
    kit.cylinder(0, 0.012, 0.05, 'flame_outer', [0, 0.208, 0], { axis: 'y', sides: 8, look: { glow: 2.5, opacity: 0.7 } });
    kit.cylinder(0, 0.007, 0.028, 'flame_core', [0, 0.198, 0], { axis: 'y', sides: 8, look: { glow: 4 } });
  });
  return kit.build('molotov');
}

/** Bandage: a roll of gauze with a loose end. Parts: roll (turns while it is applied). */
export function buildBandage(kit) {
  kit.part('roll', [0, 0, 0], () => {
    kit.cylinder(0.034, 0.034, 0.07, 'cloth', [0, 0, 0], { axis: 'x', sides: 18, look: { roughness: 0.95, metalness: 0 } });
    kit.cylinder(0.0115, 0.0115, 0.0715, 'cloth_dirty', [0, 0, 0], { axis: 'x', sides: 12, look: { roughness: 0.95, metalness: 0 } });
    kit.box([0.071, 0.012, 0.002], 'cloth_dirty', [0, 0.02, 0.028], { rot: [0.6, 0, 0], look: { roughness: 0.95, metalness: 0 } });
  });
  kit.box([0.068, 0.0015, 0.07], 'cloth', [0, -0.034, 0.035], { rot: [0.15, 0, 0], look: { roughness: 0.95, metalness: 0 } });
  kit.box([0.016, 0.004, 0.02], 'gun_steel_worn', [0.01, -0.032, 0.06], { look: { metalness: 0.6 } });
  return kit.build('bandage');
}
