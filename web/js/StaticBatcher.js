import * as THREE from 'three';
import { WholeLevelGrid } from './core/StaticChunkGrid.js';

// Batch nearby meshes with the same material so both cameras can cull each batch independently.
const _position = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();

export class StaticBatcher {
  /**
   * Replaces mergeable meshes under `root` with merged ones (added directly to `root`).
   * A mesh is left alone when it is marked userData.dynamic, has several materials, or its
   * material needs attributes the batch does not carry (vertex colours, tangents).
   * Texture coordinates are carried, so boxes with a tiling surface texture merge as well.
   * @param {THREE.Object3D} root
   * @param {{grid?:{keyForCenter:(c:THREE.Vector3)=>string}}} [options] how batches are split; default one batch per material
   * @returns {{before:number, after:number}} mesh counts
   */
  static merge(root, { grid = new WholeLevelGrid() } = {}) {
    root.updateWorldMatrix(true, true);
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
      // Keep every formerly batched mesh in root space, including singletons in a cell.
      // This preserves vertex precision and the material batches' transparent draw order.
      StaticBatcher._chunkMeshes(meshes, grid).forEach((chunk) => {
        const merged = StaticBatcher._mergeGroup(chunk, rootInverse);
        chunk.forEach((mesh) => mesh.parent.remove(mesh));
        root.add(merged);
        after -= chunk.length - 1;
      });
    });
    StaticBatcher._pruneEmptyGroups(root);
    return { before, after };
  }

  static _chunkMeshes(meshes, grid) {
    const chunks = new Map();
    const center = new THREE.Vector3();
    meshes.forEach((mesh) => {
      const geometry = mesh.geometry;
      if (geometry.boundingBox === null) geometry.computeBoundingBox();
      // An affine transform preserves the center of the box, including for rotated meshes.
      geometry.boundingBox.getCenter(center).applyMatrix4(mesh.matrixWorld);
      const key = grid.keyForCenter(center);
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(mesh);
    });
    return chunks;
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
    if (material.vertexColors || material.normalMap || material.emissiveMap) return false;
    if (material.map && !geometry.attributes.uv) return false;
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
    // Texture coordinates are copied as they are: a tiling texture repeats by metres, not by mesh.
    const uvs = sources.every((s) => s.geometry.attributes.uv) ? new Float32Array(vertexCount * 2) : null;
    const local = new THREE.Matrix4();
    let offset = 0;
    let uvOffset = 0;

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
      if (uvs) {
        const uv = source.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
          uvs[uvOffset] = uv.getX(i);
          uvs[uvOffset + 1] = uv.getY(i);
          uvOffset += 2;
        }
      }
      if (source.geometry !== source.mesh.geometry) source.geometry.dispose();
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    if (uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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
