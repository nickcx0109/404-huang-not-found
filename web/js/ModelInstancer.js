// ModelInstancer: draws a model that appears several times in a level with one draw call.
// Every instance of a model already shares its geometry and material; this replaces the
// separate meshes of such a part with a single THREE.InstancedMesh (PERFORMANCE_PLAN 3.2-2).
(function (Game) {
  'use strict';

  const MIN_INSTANCES = 2;

  class ModelInstancer {
    /**
     * Collapses repeated model parts under `root` into instanced meshes (added to `root`).
     * Only meshes that ModelLibrary marked as model parts are touched.
     * @returns {{parts:number, instances:number}} instanced meshes created, meshes they replace
     */
    static instance(root) {
      root.updateMatrixWorld(true);
      const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const groups = new Map();

      root.traverse((object) => {
        if (!object.isMesh || object.isInstancedMesh || !object.userData.modelPart) return;
        const key =
          object.geometry.uuid + '|' + object.material.uuid + '|' +
          (object.castShadow ? 1 : 0) + (object.receiveShadow ? 1 : 0);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(object);
      });

      const result = { parts: 0, instances: 0 };
      const matrix = new THREE.Matrix4();
      groups.forEach((meshes) => {
        if (meshes.length < MIN_INSTANCES) return;
        const first = meshes[0];
        const instanced = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
        meshes.forEach((mesh, index) => {
          matrix.multiplyMatrices(rootInverse, mesh.matrixWorld);
          instanced.setMatrixAt(index, matrix);
          mesh.parent.remove(mesh);
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.name = 'instances:' + (first.name || first.geometry.uuid);
        instanced.castShadow = first.castShadow;
        instanced.receiveShadow = first.receiveShadow;
        // Its bounding sphere is that of one instance; the instances are spread over the level.
        instanced.frustumCulled = false;
        root.add(instanced);
        result.parts++;
        result.instances += meshes.length;
      });

      ModelInstancer._pruneEmptyGroups(root);
      return result;
    }

    static _pruneEmptyGroups(object) {
      object.children.slice().forEach((child) => {
        ModelInstancer._pruneEmptyGroups(child);
        if (child.type === 'Group' && child.children.length === 0) object.remove(child);
      });
    }
  }

  Game.ModelInstancer = ModelInstancer;
})((window.Game = window.Game || {}));
