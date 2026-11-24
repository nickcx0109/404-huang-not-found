import * as THREE from 'three';

/**
 * The greybox look of a zombie: a box as wide as the path finder's radius and as tall as its
 * height, in the level's dummy colour, hidden until the zombie is active. Both the local run
 * (EnemyFactory views) and the online run (RemoteEnemyViews) draw zombies with it, so they look
 * the same either way. The caller owns the mesh: geometry and material are its own.
 *
 * @param {object} style  the resolved palette (`greybox.dummy`, `greybox.roughness`)
 * @param {string} type  registered enemy type, e.g. 'walker'
 * @param {{radius: number, height: number}} size
 */
export function createEnemyBox(style, type, { radius, height }) {
  const geometry = new THREE.BoxGeometry(radius * 2, height, radius * 2);
  const material = new THREE.MeshStandardMaterial({ color: style.greybox.dummy,
    roughness: style.greybox.roughness ?? 0.9 });
  const view = new THREE.Mesh(geometry, material);
  view.name = 'enemy:' + type;
  view.visible = false;
  return view;
}
