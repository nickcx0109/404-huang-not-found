// B18: measure only solid vehicle sections, excluding decals, light cones and loose debris.
// Run from the repository root: node tools/art/check-ch1-vehicles.mjs
import assert from 'node:assert/strict';
import { startServer } from '../serve.mjs';
import { chromium } from 'playwright';

const server = await startServer({ port: 0, quiet: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.goto(server.url + '/web/index.html?level=ch1&models=0');
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const rows = await page.evaluate(async () => {
    const THREE = await import('three');
    const app = window.__app;
    const rows = [];
    for (const prop of app.level.props.filter(p => p.collider && /^(ch1_car_|ch1_box_truck|escape_car)/.test(p.name))) {
      // Build with the real position first: flipped cars use it as their deterministic seed.
      const object = app.builder.props.create(prop, app.level.collider(prop.collider));
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
      object.scale.setScalar(1);
      const root = object.children[0];
      const solid = new THREE.Group();
      if (prop.name.startsWith('ch1_box_truck')) {
        // The truck's first group contains cab, shell, wheels, rivets, then dressing.
        // Dressing decals use renderOrder 3/4/7; loose cartons are BoxGeometry meshes.
        for (const child of [...root.children]) {
          if (child.renderOrder === 0 && child.geometry?.type !== 'BoxGeometry') solid.add(child);
        }
        solid.rotation.copy(root.rotation); // the blocking truck is internally slewed -0.2 rad
      } else {
        solid.add(root); // buildCar, including open doors and fitted wheels; excludes dressCar
        if (prop.name === 'ch1_car_crashed') {
          // The bent post and sign plate are also solid; smoke planes and skid marks are not.
          for (const child of [...object.children]) {
            if (['BoxGeometry', 'CylinderGeometry'].includes(child.geometry?.type)) solid.add(child);
          }
        }
      }
      solid.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const vertex = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      solid.traverse(mesh => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.attributes.position;
        for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
          if (mesh.isInstancedMesh) {
            mesh.getMatrixAt(instance, matrix);
            matrix.premultiply(mesh.matrixWorld);
          } else matrix.copy(mesh.matrixWorld);
          for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
            box.expandByPoint(vertex);
          }
        }
      });
      rows.push({ id: prop.collider, footprint: prop.footprint, min: box.min.toArray(), max: box.max.toArray() });
    }
    return rows;
  });
  assert.equal(rows.length, 10);
  for (const row of rows) {
    assert.ok(row.footprint, row.id + ' missing footprint');
    for (const [axis, name] of ['X', 'Y', 'Z'].entries()) {
      const low = row.min[axis] - row.footprint['min' + name];
      const high = row.footprint['max' + name] - row.max[axis];
      assert.ok(low >= -1e-6 && low < 0.0011, row.id + ' min' + name);
      assert.ok(high >= -1e-6 && high < 0.0011, row.id + ' max' + name);
    }
    console.log(row.id + ': solid footprint covers geometry, rounded outward within 1 mm');
  }
} finally {
  await browser?.close();
  await server.close();
}
