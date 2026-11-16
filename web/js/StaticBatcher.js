import * as THREE from 'three';

// StaticBatcher: merges static meshes that share a material into one mesh per material,
// so a level costs a handful of draw calls instead of one per box (PERFORMANCE_PLAN 3.2-2).
const _position = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();

export class StaticBatcher {
  /**
   * Replaces mergeable meshes under `root` with merged ones (added directly to `root`).
   * A mesh is left alone when it is marked userData.dynamic, has several materials,
   * or its material needs attributes other than position / normal (textures, vertex colours).
   * @returns {{before:number, after:number}} mesh counts
   */
  static merge(root) {
    root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map();
    let before = 0;

    root.traverse((object) => {
      if (!object.isMesh) return;
      before++;
      if (!StaticBatcher.isMergeable(object)) return;
      const key =
        object.material.uuid + '|' + (object.castShadow ? 1 : 0) + (object.receiveShadow ? 1 : 0);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(object);
    });

    let after = before;
    groups.forEach((meshes) => {
      if (meshes.length < 2) return;
      const merged = StaticBatcher._mergeGroup(meshes, rootInverse);
      meshes.forEach((mesh) => mesh.parent.remove(mesh));
      root.add(merged);
      after -= meshes.length - 1;
    });
    StaticBatcher._pruneEmptyGroups(root);
    return { before, after };
  }

  /** Removes groups that lost all their meshes to a batch. */
  static _pruneEmptyGroups(object) {
    object.children.slice().forEach((child) => {
      StaticBatcher._pruneEmptyGroups(child);
      if (child.type === 'Group' && child.children.length === 0) object.remove(child);
    });
  }

  static isMergeable(mesh) {
    const material = mesh.material;
    const geometry = mesh.geometry;
    if (mesh.userData.dynamic || mesh.isInstancedMesh || mesh.isSkinnedMesh) return false;
    if (Array.isArray(material)) return false;
    if (material.map || material.vertexColors || material.normalMap || material.emissiveMap) return false;
    return Boolean(geometry.attributes.position && geometry.attributes.normal);
  }

  static _mergeGroup(meshes, rootInverse) {
    const sources = meshes.map((mesh) => ({
      mesh,
      geometry: mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry,
    }));
    const vertexCount = sources.reduce((n, s) => n + s.geometry.attributes.position.count, 0);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const local = new THREE.Matrix4();
    let offset = 0;

    sources.forEach((source) => {
      local.multiplyMatrices(rootInverse, source.mesh.matrixWorld);
      _normalMatrix.getNormalMatrix(local);
      const pos = source.geometry.attributes.position;
      const nor = source.geometry.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        _position.fromBufferAttribute(pos, i).applyMatrix4(local);
        _normal.fromBufferAttribute(nor, i).applyMatrix3(_normalMatrix).normalize();
        positions[offset] = _position.x;
        positions[offset + 1] = _position.y;
        positions[offset + 2] = _position.z;
        normals[offset] = _normal.x;
        normals[offset + 1] = _normal.y;
        normals[offset + 2] = _normal.z;
        offset += 3;
      }
      if (source.geometry !== source.mesh.geometry) source.geometry.dispose();
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingSphere();

    const first = meshes[0];
    const merged = new THREE.Mesh(geometry, first.material);
    merged.name = 'batch:' + (first.material.name || first.material.uuid);
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.userData.batched = meshes.length;
    return merged;
  }
}
