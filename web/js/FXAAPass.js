import * as THREE from 'three';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { antialiasTexelSize } from './core/antialias.js';

/** Filters the display-encoded composite without another tone map or colour conversion. */
export class FXAAPass {
  constructor(width, height) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.material = new THREE.ShaderMaterial({
      ...FXAAShader,
      // The shared full-screen triangle carries position only (no uv attribute).
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = position.xy * 0.5 + 0.5;',
        '  gl_Position = vec4(position.xy, 0.0, 1.0);',
        '}',
      ].join('\n'),
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.material.uniforms.tDiffuse.value = this.target.texture;
    this.resize(width, height);
  }

  resize(width, height) {
    this.target.setSize(width, height);
    this.material.uniforms.resolution.value.set(...antialiasTexelSize(width, height));
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
