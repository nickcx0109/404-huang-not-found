import * as THREE from 'three';

// PostFX: lightweight post-processing.
//   scene -> HDR target -> [optional bloom, from quarter resolution down] -> one final pass:
//   exposure + ACES tone mapping, saturation, vignette, film grain, sRGB.
// No MSAA and no full-resolution blur passes (PERFORMANCE_PLAN 3.2-6).
// On integrated GPUs the cost of a pass is roughly the number of pixels it writes, so the
// chain has exactly two full-resolution passes (scene, final) and everything else is small.
// All numbers arrive through setParams() from Atmosphere (palette.json).
const MAX_BLOOM_LEVELS = 4;
// Size of the largest bloom level relative to the screen: 4 = quarter resolution.
// (2 = half resolution looks slightly tighter but writes 4x the pixels: measured
// 1.9 ms vs 0.5 ms per frame at 1080p on Intel Iris Xe.)
const BLOOM_FIRST_DIVISOR = 4;

// ACES filmic fit, the same numbers as THREE.ACESFilmicToneMapping. Written row by row here;
// the GLSL in FINAL_FRAGMENT lists the same matrices column by column. Keep the two in sync.
const ACES_INPUT = new THREE.Matrix3().set(
  0.59719, 0.35458, 0.04823,
  0.07600, 0.90834, 0.01566,
  0.02840, 0.13383, 0.83777
);
const ACES_OUTPUT = new THREE.Matrix3().set(
  1.60475, -0.53108, -0.07367,
  -0.10208, 1.10813, -0.00605,
  -0.00327, -0.07276, 1.07602
);
const ACES_INPUT_INVERSE = ACES_INPUT.clone().invert();
const ACES_OUTPUT_INVERSE = ACES_OUTPUT.clone().invert();
const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);

/** Inverse of the GLSL RRTAndODTFit curve for one channel (y = displayed, returns scene value). */
function inverseToneCurve(y) {
  y = Math.min(0.99, Math.max(0, y));
  const a = 1 - 0.983729 * y;
  const b = 0.0245786 - 0.432951 * y;
  const c = -(0.000090537 + 0.238081 * y);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

const VERTEX = [
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = position.xy * 0.5 + 0.5;',
  '  gl_Position = vec4(position.xy, 0.0, 1.0);',
  '}',
].join('\n');

// Bloom step 1: scene -> first bloom level, keeping only what is brighter than the threshold.
// The 4 taps are spaced so that together they average every source texel under the pixel.
const PREFILTER_FRAGMENT = [
  'uniform sampler2D tSource;',
  'uniform vec2 uTexel;',
  'uniform float uThreshold;',
  'uniform float uKnee;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec3 c = texture2D(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb;',
  '  c = min(c * 0.25, vec3(16.0));',
  '  float brightness = max(c.r, max(c.g, c.b));',
  '  float soft = clamp(brightness - uThreshold + uKnee, 0.0, 2.0 * uKnee);',
  '  soft = soft * soft / (4.0 * uKnee + 1e-4);',
  '  float keep = max(soft, brightness - uThreshold) / max(brightness, 1e-4);',
  '  gl_FragColor = vec4(c * keep, 1.0);',
  '}',
].join('\n');

// Bloom step 2: each level is half the size of the previous one.
const DOWNSAMPLE_FRAGMENT = [
  'uniform sampler2D tSource;',
  'uniform vec2 uTexel;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec3 c = texture2D(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb;',
  '  gl_FragColor = vec4(c * 0.25, 1.0);',
  '}',
].join('\n');

// Bloom step 3: walk back up, adding each blurred level onto the next larger one.
const UPSAMPLE_FRAGMENT = [
  'uniform sampler2D tSource;',
  'uniform vec2 uTexel;',
  'varying vec2 vUv;',
  'void main() {',
  '  // 4 bilinear taps half a texel out: a 3x3 tent filter for the price of 4 fetches.',
  '  vec3 c = texture2D(tSource, vUv + uTexel * vec2(-0.5, -0.5)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2( 0.5, -0.5)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2(-0.5,  0.5)).rgb;',
  '  c += texture2D(tSource, vUv + uTexel * vec2( 0.5,  0.5)).rgb;',
  '  gl_FragColor = vec4(c * 0.25, 1.0);',
  '}',
].join('\n');

const FINAL_FRAGMENT = [
  'uniform sampler2D tScene;',
  'uniform sampler2D tBloom;',
  'uniform float uBloom;',
  'uniform float uExposure;',
  'uniform float uSaturation;',
  'uniform float uVignette;',
  'uniform float uVignetteStart;',
  'uniform float uVignetteEnd;',
  'uniform float uGrain;',
  'uniform float uChroma;',
  'uniform float uTime;',
  'uniform float uAspect;',
  'varying vec2 vUv;',
  '',
  '// ACES filmic curve, same fit as THREE.ACESFilmicToneMapping.',
  'vec3 RRTAndODTFit(vec3 v) {',
  '  vec3 a = v * (v + 0.0245786) - 0.000090537;',
  '  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;',
  '  return a / b;',
  '}',
  'vec3 toneMap(vec3 color) {',
  '  const mat3 inputMat = mat3(',
  '    vec3(0.59719, 0.07600, 0.02840),',
  '    vec3(0.35458, 0.90834, 0.13383),',
  '    vec3(0.04823, 0.01566, 0.83777));',
  '  const mat3 outputMat = mat3(',
  '    vec3( 1.60475, -0.10208, -0.00327),',
  '    vec3(-0.53108,  1.10813, -0.07276),',
  '    vec3(-0.07367, -0.00605,  1.07602));',
  '  color *= uExposure / 0.6;',
  '  color = outputMat * RRTAndODTFit(inputMat * color);',
  '  return clamp(color, 0.0, 1.0);',
  '}',
  'vec3 linearToSRGB(vec3 c) {',
  '  return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(vec3(0.0031308), c));',
  '}',
  'float hash(vec2 p) {',
  '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
  '  p3 += dot(p3, p3.yzx + 33.33);',
  '  return fract((p3.x + p3.y) * p3.z);',
  '}',
  '',
  'void main() {',
  '  vec2 fromCentre = vUv - 0.5;',
  '  vec3 hdr = texture2D(tScene, vUv).rgb;',
  '  if (uChroma > 0.0) {',
  '    vec2 shift = fromCentre * uChroma;',
  '    hdr.r = texture2D(tScene, vUv + shift).r;',
  '    hdr.b = texture2D(tScene, vUv - shift).b;',
  '  }',
  '  hdr += texture2D(tBloom, vUv).rgb * uBloom;',
  '',
  '  vec3 color = toneMap(hdr);',
  '  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));',
  '  color = mix(vec3(luma), color, uSaturation);',
  '',
  '  // Vignette: 0 at the centre, 1 in the corners, whatever the aspect ratio.',
  '  float radius = length(fromCentre * vec2(uAspect, 1.0)) / length(vec2(uAspect, 1.0) * 0.5);',
  '  color *= 1.0 - uVignette * smoothstep(uVignetteStart, uVignetteEnd, radius);',
  '',
  '  color = linearToSRGB(clamp(color, 0.0, 1.0));',
  '  float noise = hash(gl_FragCoord.xy + fract(uTime) * 517.0) - 0.5;',
  '  color += noise * uGrain;',
  '  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);',
  '}',
].join('\n');

export class PostFX {
  /** @param {THREE.WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.hdr = PostFX.supportsHalfFloatTargets(renderer);
    if (!this.hdr) {
      console.warn('PostFX: half-float render targets unavailable, using 8-bit (expect some banding).');
    }

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.width = Math.max(1, size.x);
    this.height = Math.max(1, size.y);

    this.sceneTarget = this._target(this.width, this.height, true);
    this.bloomTargets = [];
    this.bloom = { enabled: false, strength: 0, levels: 0 };

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // One triangle covering the screen: no diagonal seam, a little less overdraw than a quad.
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
    );
    this._quad = new THREE.Mesh(triangle, null);
    this._quad.frustumCulled = false;
    this._passScene = new THREE.Scene();
    this._passScene.add(this._quad);

    this._prefilter = PostFX._material(PREFILTER_FRAGMENT, {
      tSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1 },
      uKnee: { value: 0.5 },
    });
    this._downsample = PostFX._material(DOWNSAMPLE_FRAGMENT, {
      tSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
    });
    this._upsample = PostFX._material(UPSAMPLE_FRAGMENT, {
      tSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
    });
    this._upsample.blending = THREE.AdditiveBlending;
    this._upsample.transparent = true;
    this._final = PostFX._material(FINAL_FRAGMENT, {
      tScene: { value: this.sceneTarget.texture },
      tBloom: { value: null },
      uBloom: { value: 0 },
      uExposure: { value: 1 },
      uSaturation: { value: 1 },
      uVignette: { value: 0 },
      uVignetteStart: { value: 0.4 },
      uVignetteEnd: { value: 1 },
      uGrain: { value: 0 },
      uChroma: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: this.width / this.height },
    });
    this._black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    this._black.needsUpdate = true;
    this._final.uniforms.tBloom.value = this._black;
  }

  /**
   * The scene-linear colour that ends up on screen as `display` after this chain's exposure,
   * tone mapping and saturation (at the screen centre, where the vignette is 0).
   * Lets the palette state a colour "as seen" — used for the fog, which fills most of the frame.
   * @param {THREE.Color} display  wanted on-screen colour, linear (see Palette.color)
   * @param {object} post  the "post" section of the resolved palette style
   * @returns {THREE.Color}
   */
  static sceneColorForDisplay(display, post) {
    const v = new THREE.Vector3(display.r, display.g, display.b);
    // undo saturation (it keeps luma, so the mix can be solved directly)
    if (post.saturation > 0.05) {
      const luma = v.dot(LUMA);
      v.subScalar(luma).divideScalar(post.saturation).addScalar(luma);
    }
    // undo tone mapping
    v.applyMatrix3(ACES_OUTPUT_INVERSE);
    v.set(inverseToneCurve(v.x), inverseToneCurve(v.y), inverseToneCurve(v.z));
    v.applyMatrix3(ACES_INPUT_INVERSE);
    // undo exposure
    v.multiplyScalar(0.6 / post.exposure);
    return new THREE.Color(Math.max(0, v.x), Math.max(0, v.y), Math.max(0, v.z));
  }

  static supportsHalfFloatTargets(renderer) {
    const ext = renderer.extensions;
    if (renderer.capabilities.isWebGL2) {
      return Boolean(ext.get('EXT_color_buffer_float') || ext.get('EXT_color_buffer_half_float'));
    }
    return Boolean(
      ext.get('OES_texture_half_float') &&
        ext.get('OES_texture_half_float_linear') &&
        ext.get('EXT_color_buffer_half_float')
    );
  }

  static _material(fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }

  _target(width, height, depthBuffer) {
    return new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer,
      stencilBuffer: false,
    });
  }

  /** @param {object} post  the "post" section of the resolved palette style */
  setParams(post) {
    const u = this._final.uniforms;
    u.uExposure.value = post.exposure;
    u.uSaturation.value = post.saturation;
    u.uVignette.value = post.vignette.strength;
    u.uVignetteStart.value = post.vignette.start;
    u.uVignetteEnd.value = post.vignette.end;
    u.uGrain.value = post.grain;
    u.uChroma.value = post.chromaticAberration || 0;

    const bloom = post.bloom || {};
    this.bloom.enabled = Boolean(bloom.enabled) && bloom.strength > 0;
    this.bloom.strength = bloom.strength || 0;
    this.bloom.levels = Math.min(MAX_BLOOM_LEVELS, Math.max(1, Math.round(bloom.levels || 3)));
    this._prefilter.uniforms.uThreshold.value = bloom.threshold === undefined ? 1 : bloom.threshold;
    this._prefilter.uniforms.uKnee.value = bloom.knee === undefined ? 0.5 : bloom.knee;
    this._rebuildBloomTargets();
  }

  /** Call after renderer.setSize / setPixelRatio. */
  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.width = Math.max(1, size.x);
    this.height = Math.max(1, size.y);
    this.sceneTarget.setSize(this.width, this.height);
    this._final.uniforms.uAspect.value = this.width / this.height;
    this._rebuildBloomTargets();
  }

  _rebuildBloomTargets() {
    this.bloomTargets.forEach((t) => t.dispose());
    this.bloomTargets = [];
    if (!this.bloom.enabled) return;
    let divisor = BLOOM_FIRST_DIVISOR;
    for (let i = 0; i < this.bloom.levels; i++) {
      const w = Math.max(1, Math.floor(this.width / divisor));
      const h = Math.max(1, Math.floor(this.height / divisor));
      this.bloomTargets.push(this._target(w, h, false));
      divisor *= 2;
    }
  }

  _pass(material, target) {
    this._quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._passScene, this._camera);
  }

  _renderBloom() {
    const targets = this.bloomTargets;
    const renderer = this.renderer;

    const spread = BLOOM_FIRST_DIVISOR / 4; // in source texels
    this._prefilter.uniforms.tSource.value = this.sceneTarget.texture;
    this._prefilter.uniforms.uTexel.value.set(spread / this.width, spread / this.height);
    this._pass(this._prefilter, targets[0]);

    for (let i = 1; i < targets.length; i++) {
      const source = targets[i - 1];
      this._downsample.uniforms.tSource.value = source.texture;
      this._downsample.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
      this._pass(this._downsample, targets[i]);
    }

    renderer.autoClear = false; // additive: keep what the level already holds
    for (let i = targets.length - 1; i > 0; i--) {
      const source = targets[i];
      this._upsample.uniforms.tSource.value = source.texture;
      this._upsample.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
      this._pass(this._upsample, targets[i - 1]);
    }
    renderer.autoClear = true;
  }

  /**
   * Renders the scene with post-processing to the canvas.
   * @param {number} time seconds; only animates the grain
   * @param {{render: function(THREE.WebGLRenderer): void}} [overlay]  drawn over the scene
   *   before post-processing (the weapon in the player's hands)
   */
  render(scene, camera, time, overlay) {
    const renderer = this.renderer;
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);
    if (overlay) overlay.render(renderer);

    const u = this._final.uniforms;
    if (this.bloom.enabled && this.bloomTargets.length > 0) {
      this._renderBloom();
      u.tBloom.value = this.bloomTargets[0].texture;
      u.uBloom.value = this.bloom.strength;
    } else {
      u.tBloom.value = this._black;
      u.uBloom.value = 0;
    }
    u.uTime.value = time;
    this._pass(this._final, null);
  }

  dispose() {
    this.sceneTarget.dispose();
    this.bloomTargets.forEach((t) => t.dispose());
    [this._prefilter, this._downsample, this._upsample, this._final].forEach((m) => m.dispose());
    this._quad.geometry.dispose();
    this._black.dispose();
  }
}
