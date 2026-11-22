/** Long precision rifle; iron sights only, with no scope or zoom mechanism. */
export function buildSniper(kit) {
  kit.box([0.05, 0.055, 0.28], 'gun_steel', [0, 0.025, -0.08]);
  kit.box([0.055, 0.045, 0.32], 'gun_polymer', [0, 0, -0.35]);
  kit.cylinder(0.012, 0.012, 0.38, 'gun_steel_dark', [0, 0.025, -0.67]);
  kit.cylinder(0.015, 0.015, 0.04, 'gun_bore', [0, 0.025, -0.88]);
  kit.marker('muzzle', [0, 0.025, -0.905]);
  kit.box([0.008, 0.025, 0.01], 'gun_steel_dark', [0, 0.05, -0.79]);
  kit.box([0.025, 0.018, 0.012], 'gun_steel_dark', [0, 0.06, 0.02]);
  kit.box([0.035, 0.09, 0.04], 'gun_polymer', [0, -0.055, 0.025], { rot: [-0.3, 0, 0] });
  kit.box([0.045, 0.065, 0.25], 'gun_polymer', [0, 0.005, 0.18]);
  kit.box([0.05, 0.11, 0.018], 'rubber', [0, -0.015, 0.31]);
  kit.part('magazine', [0, -0.025, -0.1], () => {
    kit.box([0.035, 0.07, 0.07], 'gun_steel_dark', [0, -0.065, -0.1]);
  });
  return kit.build('sniper');
}
