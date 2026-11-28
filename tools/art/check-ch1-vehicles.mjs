// B18: measure only solid vehicle sections, excluding decals, light cones and loose debris.
// Run from the repository root: node tools/art/check-ch1-vehicles.mjs [--measure]
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { startServer } from '../serve.mjs';
import { chromium } from 'playwright';

const { values } = parseArgs({ options: { measure: { type: 'boolean' } } });
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
      object.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const vertex = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      const expandMesh = (mesh) => {
        const omissions = mesh.userData.footprintOmissions ?? [];
        const positions = mesh.geometry.attributes.position;
        for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
          if (mesh.isInstancedMesh) {
            mesh.getMatrixAt(instance, matrix);
            matrix.premultiply(mesh.matrixWorld);
          } else matrix.copy(mesh.matrixWorld);
          for (let i = 0; i < positions.count; i++) {
            if (omissions.some(([start, end]) => i >= start && i < end)) continue;
            vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
            box.expandByPoint(vertex);
          }
        }
      };
      // A body group includes its children. Open side doors opt out as a whole group.
      const visit = (node, inherited) => {
        if (node.userData.vehicleFootprint === false) return;
        const included = node.userData.vehicleFootprint ?? inherited;
        if (included && node.isMesh) expandMesh(node);
        for (const child of node.children) visit(child, included);
      };
      visit(object, false);
      if (box.isEmpty()) throw new Error(prop.collider + ' has no tagged vehicle body geometry');
      rows.push({ id: prop.collider, footprint: prop.footprint, min: box.min.toArray(), max: box.max.toArray() });
    }
    return rows;
  });
  assert.equal(rows.length, 10);
  for (const row of rows) {
    const min = row.min.map(value => Math.floor(value * 1000) / 1000);
    const max = row.max.map(value => Math.ceil(value * 1000) / 1000);
    if (values.measure) {
      console.log(row.id + ' ' + JSON.stringify({ min, max }));
      continue;
    }
    assert.ok(row.footprint, row.id + ' missing footprint');
    const { minX, minY, minZ, maxX, maxY, maxZ } = row.footprint;
    assert.deepEqual({ min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }, { min, max }, row.id);
    console.log(row.id + ': footprint matches tagged body geometry to the nearest outward millimetre');
  }
} finally {
  await browser?.close();
  await server.close();
}
