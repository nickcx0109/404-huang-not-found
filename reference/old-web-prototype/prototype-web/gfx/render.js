'use strict';
/* =========================================================
   GFX render：夜空、月光陰影、環境反射、HDR 後處理（bloom、ACES、調色、暗角、顆粒）
   以及地面／牆面用的程序材質。
   用法：GFX.init(renderer, scene, camera) → 每幀 GFX.render(dt, focus, radius)
   ========================================================= */
{
  const V = THREE.Vector3;
  const MOON_DIR = new V(-30, 26, -18).normalize();
  const FOG = new THREE.Color().setRGB(0.050, 0.066, 0.092);
  GFX.MOON_DIR = MOON_DIR; GFX.FOG = FOG;

  const NOISE_GLSL = `
    float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float hash31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; } return s; }`;

  /* ---------- 夜空 ---------- */
  function makeSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uMoon: { value: MOON_DIR }, uTime: { value: 0 }, uFog: { value: FOG }, uFlash: { value: 0 }, uFdir: { value: new THREE.Vector2(1, 0) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 uMoon; uniform float uTime; uniform vec3 uFog; uniform float uFlash; uniform vec2 uFdir; ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir); float h = d.y, hc = clamp(h, 0.0, 1.0);
          vec3 col = mix(uFog * 1.25, vec3(0.006, 0.012, 0.032), pow(hc, 0.42));
          col += vec3(0.30, 0.13, 0.04) * pow(1.0 - hc, 9.0) * (0.35 + 0.65 * smoothstep(-0.4, 0.9, d.x * 0.6 + d.z * 0.8));
          vec3 g = d * 190.0, id = floor(g); float s = hash31(id);
          float star = step(0.9968, s) * smoothstep(0.42, 0.0, length(fract(g) - 0.5)) * (0.55 + 0.45 * sin(uTime * 1.7 + s * 90.0));
          col += star * mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.75), fract(s * 71.0)) * 1.6 * smoothstep(0.03, 0.3, h);
          float md = max(dot(d, uMoon), 0.0);
          vec2 cuv = d.xz / (h + 0.32) * 1.35 + uTime * 0.0035; float c = fbm(cuv);
          float cl = smoothstep(0.46, 0.82, c) * smoothstep(0.0, 0.22, h);
          vec3 ccol = mix(vec3(0.016, 0.022, 0.034), vec3(0.20, 0.26, 0.36), pow(md, 5.0)) * (0.6 + 0.8 * c);
          col = mix(col, ccol, cl * 0.82);
          float disc = smoothstep(0.99925, 0.99962, md);
          float crater = 0.78 + 0.22 * fbm(d.xy * 90.0 + d.z * 40.0);
          col += vec3(1.0, 0.96, 0.88) * disc * 3.2 * crater * (1.0 - cl * 0.75);
          col += vec3(0.30, 0.42, 0.68) * pow(md, 420.0) * 0.9 + vec3(0.08, 0.12, 0.2) * pow(md, 14.0) * 0.55;
          // 遠方閃電：雲層被照亮，閃電方向的地平線最亮
          float fl = pow(max(dot(normalize(d.xz + 1e-4), uFdir), 0.0), 5.0) * smoothstep(0.75, 0.0, h);
          col += uFlash * (vec3(0.05, 0.065, 0.10) + vec3(0.30, 0.36, 0.52) * fl * (0.35 + 1.3 * c));
          col = mix(col, uFog + uFlash * vec3(0.05, 0.06, 0.09), smoothstep(0.02, -0.12, h));
          gl_FragColor = vec4(col, 1.0);
          #include <encodings_fragment>
        }`
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat); m.scale.setScalar(230); m.frustumCulled = false; m.renderOrder = -10; m.matrixAutoUpdate = true;
    return m;
  }

  /* ---------- 全螢幕 pass ---------- */
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsScene = new THREE.Scene();
  const fsTri = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), null);
  fsTri.frustumCulled = false; fsScene.add(fsTri);
  const FS_VERT = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  function blit(r, mat, target) { fsTri.material = mat; r.setRenderTarget(target); r.render(fsScene, fsCam); }

  const P = {
    pre: pass(`varying vec2 vUv; uniform sampler2D t; uniform vec2 px; uniform float thr;
      void main(){ vec3 c = (texture2D(t, vUv + px * vec2(-1,-1)).rgb + texture2D(t, vUv + px * vec2(1,-1)).rgb + texture2D(t, vUv + px * vec2(-1,1)).rgb + texture2D(t, vUv + px * vec2(1,1)).rgb) * 0.25;
        c = min(c, vec3(24.0)); float b = max(c.r, max(c.g, c.b)); float k = clamp((b - thr) / max(b, 1e-4), 0.0, 1.0); k *= k * (3.0 - 2.0 * k);
        gl_FragColor = vec4(c * k, 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: 0.82 } }),
    down: pass(`varying vec2 vUv; uniform sampler2D t; uniform vec2 px;
      void main(){ vec3 c = texture2D(t, vUv).rgb * 4.0 + texture2D(t, vUv + px * vec2(-1,-1)).rgb + texture2D(t, vUv + px * vec2(1,-1)).rgb + texture2D(t, vUv + px * vec2(-1,1)).rgb + texture2D(t, vUv + px * vec2(1,1)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() } }),
    up: pass(`varying vec2 vUv; uniform sampler2D t; uniform sampler2D hi; uniform vec2 px; uniform float w;
      void main(){ vec3 c = texture2D(t, vUv + px * vec2(-1,-1)).rgb + texture2D(t, vUv + px * vec2(1,-1)).rgb + texture2D(t, vUv + px * vec2(-1,1)).rgb + texture2D(t, vUv + px * vec2(1,1)).rgb
          + 2.0 * (texture2D(t, vUv + px * vec2(-1.5,0)).rgb + texture2D(t, vUv + px * vec2(1.5,0)).rgb + texture2D(t, vUv + px * vec2(0,-1.5)).rgb + texture2D(t, vUv + px * vec2(0,1.5)).rgb);
        gl_FragColor = vec4(texture2D(hi, vUv).rgb + c / 12.0 * w, 1.0); }`, { t: { value: null }, hi: { value: null }, px: { value: new THREE.Vector2() }, w: { value: 0.85 } }),
    final: pass(`varying vec2 vUv; uniform sampler2D t; uniform sampler2D bloom; uniform vec2 res; uniform float time, exposure, bloomK, sat, vig, grain, ca, flash; uniform vec3 tint; ${NOISE_GLSL}
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      void main(){
        vec2 d = vUv - 0.5; float r2 = dot(d, d); vec2 o = d * r2 * ca;
        vec3 c = vec3(texture2D(t, vUv - o).r, texture2D(t, vUv).g, texture2D(t, vUv + o).b);
        c += texture2D(bloom, vUv).rgb * bloomK;
        c = aces(c * exposure);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, sat);
        c *= mix(vec3(0.90, 0.99, 1.12), vec3(1.07, 1.0, 0.92), smoothstep(0.02, 0.62, l));
        c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;
        c *= tint;
        c *= 1.0 - vig * smoothstep(0.18, 0.78, r2 * 1.9);
        c = pow(c, vec3(1.0 / 2.2));
        float n = hash21(vUv * res + fract(time) * 137.0) - 0.5;
        c += n * (1.6 / 255.0 + grain * (1.0 - l * 0.6));
        gl_FragColor = vec4(c + flash, 1.0);
      }`, { t: { value: null }, bloom: { value: null }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, exposure: { value: 1.25 }, bloomK: { value: 0.55 }, sat: { value: 1.08 }, vig: { value: 0.42 }, grain: { value: 0.028 }, ca: { value: 0.012 }, flash: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) } })
  };
  GFX.post = P.final.uniforms;

  const MIPS = 6;
  let R, scene, camera, sky, moon, hemi, rtScene, rtPre, rtDown = [], rtUp = [], shadowR = 0, time = 0;
  const _f = new V(), _r = new V(), _u = new V(), _zero = new V(), _foc = new V();

  function makeTargets(w, h) {
    [rtScene, rtPre, ...rtDown, ...rtUp].forEach(t => t && t.dispose()); rtDown = []; rtUp = [];
    const o = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
    rtScene = new THREE.WebGLMultisampleRenderTarget(w, h, Object.assign({}, o, { depthBuffer: true })); rtScene.samples = GFX.opts.msaa === undefined ? 4 : GFX.opts.msaa;
    let mw = w >> 1, mh = h >> 1; rtPre = new THREE.WebGLRenderTarget(Math.max(mw, 2), Math.max(mh, 2), o);
    for (let i = 0; i < MIPS; i++) { mw = Math.max(mw >> 1, 2); mh = Math.max(mh >> 1, 2); rtDown.push(new THREE.WebGLRenderTarget(mw, mh, o)); if (i < MIPS - 1) rtUp.push(new THREE.WebGLRenderTarget(mw, mh, o)); }
    P.final.uniforms.res.value.set(w, h);
  }

  GFX.init = (renderer, sc, cam) => {
    R = renderer; scene = sc; camera = cam;
    const q = new URLSearchParams(location.search);
    if (q.get('post') === '0' || !R.capabilities.isWebGL2) GFX.opts.post = false;
    if (q.get('shadows') === '0') GFX.opts.shadows = false;
    R.outputEncoding = THREE.sRGBEncoding;
    if (!GFX.opts.post) { R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.25; }
    scene.background = null; scene.fog = new THREE.FogExp2(0x000000, 0.0155); scene.fog.color.copy(FOG);
    R.setClearColor(new THREE.Color().copy(FOG), 1);
    sky = makeSky(); scene.add(sky); GFX.sky = sky;
    hemi = new THREE.HemisphereLight(0, 0, 1); hemi.color.setRGB(0.20, 0.27, 0.40); hemi.groundColor.setRGB(0.075, 0.066, 0.058); scene.add(hemi);
    moon = new THREE.DirectionalLight(0, 1); moon.color.setRGB(0.50, 0.62, 0.92); moon.intensity = 0.95;
    moon.castShadow = GFX.opts.shadows; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.035; moon.shadow.radius = 2.2;
    scene.add(moon); scene.add(moon.target); GFX.moon = moon; GFX.hemi = hemi;
    // 用夜空烘一張小的環境貼圖，金屬和玻璃才有東西可以反射
    try { const pm = new THREE.PMREMGenerator(R), es = new THREE.Scene(), s2 = makeSky(); es.add(s2); scene.environment = pm.fromScene(es, 0.02, 1, 600).texture; pm.dispose(); s2.geometry.dispose(); } catch (e) { console.warn('env map failed', e); }
    R.shadowMap.enabled = GFX.opts.shadows; R.shadowMap.type = THREE.PCFSoftShadowMap;
    const sz = R.getDrawingBufferSize(new THREE.Vector2()); if (GFX.opts.post) makeTargets(sz.x, sz.y);
  };
  GFX.resize = () => { if (!R || !GFX.opts.post) return; const sz = R.getDrawingBufferSize(new THREE.Vector2()); makeTargets(Math.max(sz.x, 4), Math.max(sz.y, 4)); };

  /* ---------- runtime switches used by the quality tiers ---------- */
  // Without post the renderer does the ACES tone mapping itself, so the picture stays about the same brightness
  GFX.setPost = on => {
    on = !!on && R.capabilities.isWebGL2; if (on === GFX.opts.post) return;
    GFX.opts.post = on; R.toneMapping = on ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.25;
    if (on) GFX.resize();
  };
  // shadowMap stays enabled; turning the moon's castShadow off skips the shadow pass
  GFX.setShadows = on => { GFX.opts.shadows = !!on && R.shadowMap.enabled; moon.castShadow = GFX.opts.shadows; };
  GFX.setShadowSize = n => { if (moon.shadow.mapSize.x === n) return; moon.shadow.mapSize.set(n, n); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } };

  /** 月光陰影的範圍跟著 focus 走；位置對齊陰影貼圖的像素，移動時陰影邊緣才不會閃爍 */
  function fitShadow(focus, radius) {
    const cam = moon.shadow.camera;
    if (radius !== shadowR) { shadowR = radius; cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius; cam.near = 1; cam.far = 220; cam.updateProjectionMatrix(); }
    _f.copy(MOON_DIR).negate(); _r.crossVectors(_f, new V(0, 1, 0)).normalize(); _u.crossVectors(_r, _f);
    const texel = radius * 2 / moon.shadow.mapSize.x, a = Math.round(focus.dot(_r) / texel) * texel, b = Math.round(focus.dot(_u) / texel) * texel, c = focus.dot(_f);
    moon.target.position.set(0, 0, 0).addScaledVector(_r, a).addScaledVector(_u, b).addScaledVector(_f, c);
    moon.position.copy(moon.target.position).addScaledVector(MOON_DIR, 110); moon.target.updateMatrixWorld();
  }

  GFX.render = (dt, focus, radius = 34) => {
    time += dt; sky.material.uniforms.uTime.value = time; sky.position.copy(camera.getWorldPosition(_f));
    if (GFX.opts.shadows) fitShadow(_foc.copy(focus || _zero), radius);
    if (GFX.tick) for (const fn of GFX.tick) fn(dt, time);
    if (!GFX.opts.post) { R.setRenderTarget(null); R.render(scene, camera); return; }
    R.setRenderTarget(rtScene); R.render(scene, camera);
    P.pre.uniforms.t.value = rtScene.texture; P.pre.uniforms.px.value.set(0.5 / rtPre.width, 0.5 / rtPre.height); blit(R, P.pre, rtPre);
    let src = rtPre;
    for (let i = 0; i < MIPS; i++) { P.down.uniforms.t.value = src.texture; P.down.uniforms.px.value.set(1 / src.width, 1 / src.height); blit(R, P.down, rtDown[i]); src = rtDown[i]; }
    for (let i = MIPS - 2; i >= 0; i--) { P.up.uniforms.t.value = src.texture; P.up.uniforms.hi.value = rtDown[i].texture; P.up.uniforms.px.value.set(1 / src.width, 1 / src.height); blit(R, P.up, rtUp[i]); src = rtUp[i]; }
    const u = P.final.uniforms; u.t.value = rtScene.texture; u.bloom.value = src.texture; u.time.value = time;
    blit(R, P.final, null);
  };
  GFX.tick = [];

  /* ---------- 路燈的光錐（假的體積光） ---------- */
  GFX.lightCone = (hex, height = 4.2, radius = 2.6, strength = 0.5) => {
    const g = new THREE.CylinderGeometry(0.12, radius, height, 24, 1, true); g.translate(0, -height / 2, 0);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { col: { value: new THREE.Color(hex) }, k: { value: strength }, hgt: { value: height } },
      vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV; uniform float hgt;
        void main(){ vH = -position.y / hgt; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vH; varying vec3 vN; varying vec3 vV; uniform vec3 col; uniform float k;
        void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = edge * (1.0 - vH) * (1.0 - vH) * k * smoothstep(0.0, 0.06, vH); gl_FragColor = vec4(col * a, a); }`
    }));
    m.renderOrder = 5; return m;
  };

  /* ---------- 雨 ---------- */
  GFX.rain = (count = 2600, box = 26, height = 16) => {
    const pos = new Float32Array(count * 6), seed = new Float32Array(count * 2), rnd = GFX.rng(99);
    for (let i = 0; i < count; i++) { const x = rnd() * box, y = rnd() * height, z = rnd() * box, s = rnd(); pos.set([x, y, z, x, y, z], i * 6); seed.set([s, s], i * 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const top = new Float32Array(count * 2); for (let i = 0; i < count; i++) top[i * 2 + 1] = 1; g.setAttribute('top', new THREE.BufferAttribute(top, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCam: { value: new V() }, uBox: { value: box }, uH: { value: height }, uK: { value: 1 } },
      vertexShader: `attribute float seed; attribute float top; uniform float uTime, uBox, uH; uniform vec3 uCam; varying float vA;
        void main(){ vec3 p = position; float sp = 15.0 + seed * 7.0; p.y = mod(p.y - uTime * sp, uH); p.x += (uH - p.y) * 0.12;
          p.xz = mod(p.xz - uCam.xz + uBox * 0.5, uBox) - uBox * 0.5 + uCam.xz; p.y += uCam.y - uH * 0.35;
          p.y += top * (0.22 + seed * 0.2); p.x -= top * 0.03;
          vec4 mv = viewMatrix * vec4(p, 1.0); vA = (1.0 - top * 0.8) * smoothstep(uBox * 0.5, uBox * 0.25, length(p.xz - uCam.xz)) * smoothstep(0.4, 2.0, -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; uniform float uK; void main(){ gl_FragColor = vec4(vec3(0.55, 0.66, 0.85) * vA * 0.075 * uK, 1.0); }`
    });
    const m = new THREE.LineSegments(g, mat); m.frustumCulled = false; m.renderOrder = 6;
    GFX.tick.push((dt, t) => { mat.uniforms.uTime.value = t; camera.getWorldPosition(mat.uniforms.uCam.value); });
    return m;
  };

  /* ---------- 程序材質 ---------- */
  const pix = (size, fn) => { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data, out = [0, 0, 0]; for (let y = 0, i = 0; y < size; y++) for (let xx = 0; xx < size; xx++, i += 4) { fn(xx, y, y * size + xx, out); d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255; } x.putImageData(img, 0, 0); return c; };
  const tex = (c, srgb, rep) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; if (rep) t.repeat.set(rep, rep); return t; };
  const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  GFX.surf = {};
  /** 第一次用到才產生，之後共用 */
  GFX.surface = name => GFX.surf[name] || (GFX.surf[name] = BUILD[name]());
  const BUILD = {
    // 濕柏油：大塊雜訊決定哪裡積水（粗糙度低、顏色深、法線平），細雜訊做顆粒
    asphalt() {
      const S = 1024, big = GFX.noise(S, 5, 4, 11), mid = GFX.noise(S, 24, 3, 12), fine = GFX.noise(S, 128, 2, 13), rnd = GFX.rng(5), h = new Float32Array(S * S);
      const col = pix(S, (x, y, i, o) => { const wet = sstep(0.52, 0.64, big[i] * 0.8 + mid[i] * 0.2), sp = rnd(); let v = 46 + mid[i] * 22 + fine[i] * 20 + (sp > 0.985 ? 30 : sp < 0.03 ? -14 : 0); v *= 1 - wet * 0.24; o[0] = v * 0.96; o[1] = v; o[2] = v * 1.07; h[i] = (fine[i] * 0.7 + mid[i] * 0.3) * (1 - wet); });
      const x = col.getContext('2d'), r2 = GFX.rng(21); x.strokeStyle = 'rgba(8,9,11,.75)'; x.lineCap = 'round';
      for (let k = 0; k < 16; k++) { let px = r2() * S, py = r2() * S, a = r2() * 6.28; x.lineWidth = 1 + r2() * 1.6; x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 22; s++) { a += (r2() - 0.5) * 1.1; px += Math.cos(a) * 16; py += Math.sin(a) * 16; x.lineTo(px, py); } x.stroke(); }
      for (let k = 0; k < 7; k++) { x.fillStyle = `rgba(20,21,24,${0.18 + r2() * 0.2})`; x.fillRect(r2() * S, r2() * S, 60 + r2() * 160, 40 + r2() * 120); }
      const rough = pix(S, (xx, y, i, o) => { const wet = sstep(0.52, 0.64, big[i] * 0.8 + mid[i] * 0.2); o[0] = o[2] = 0; o[1] = (0.93 - fine[i] * 0.22) * (1 - wet) * 255 + wet * 84; });
      return new THREE.MeshStandardMaterial({ map: tex(col, true), roughnessMap: tex(rough), normalMap: GFX.normalFromHeight(h, S, 5), metalness: 0, roughness: 1, normalScale: new THREE.Vector2(0.45, 0.45) });
    },
    concrete() {
      const S = 512, a = GFX.noise(S, 6, 4, 31), f = GFX.noise(S, 96, 2, 32), h = new Float32Array(S * S);
      const col = pix(S, (x, y, i, o) => { const seam = (x % 256 < 3 || y % 256 < 3) ? 0.62 : 1; const v = (120 + a[i] * 50 + f[i] * 26) * seam; o[0] = v; o[1] = v * 0.99; o[2] = v * 0.95; h[i] = f[i] * 0.6 + (seam < 1 ? -0.6 : 0); });
      return new THREE.MeshStandardMaterial({ map: tex(col, true), normalMap: GFX.normalFromHeight(h, S, 3), roughness: 0.92, metalness: 0 });
    },
    brick() {
      const S = 512, n = GFX.noise(S, 48, 3, 41), big = GFX.noise(S, 4, 3, 42), h = new Float32Array(S * S), bw = 64, bh = 32;
      const col = pix(S, (x, y, i, o) => { const row = Math.floor(y / bh), xo = (x + (row & 1) * bw / 2) % S, bx = Math.floor(xo / bw), mortar = (xo % bw < 3 || y % bh < 3); const t = ((bx * 7 + row * 13) % 5) / 5;
        if (mortar) { const v = 70 + n[i] * 30; o[0] = v; o[1] = v; o[2] = v * 0.97; h[i] = 0; } else { const k = 0.72 + t * 0.3 + n[i] * 0.28 - big[i] * 0.2; o[0] = 118 * k; o[1] = 58 * k; o[2] = 46 * k; h[i] = 0.75 + n[i] * 0.25; } });
      return new THREE.MeshStandardMaterial({ map: tex(col, true), normalMap: GFX.normalFromHeight(h, S, 4), roughness: 0.9, metalness: 0 });
    },
    plaster() {
      const S = 512, a = GFX.noise(S, 5, 4, 51), f = GFX.noise(S, 80, 3, 52), h = new Float32Array(S * S);
      const col = pix(S, (x, y, i, o) => { const grime = sstep(0.35, 0.95, y / S) * 0.25 + (1 - a[i]) * 0.2; const v = (176 + f[i] * 20) * (1 - grime); o[0] = v; o[1] = v * 0.985; o[2] = v * 0.94; h[i] = f[i]; });
      const x = col.getContext('2d'), r2 = GFX.rng(53); for (let k = 0; k < 26; k++) { const px = r2() * S, w = 3 + r2() * 10, len = 60 + r2() * 200, g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(40,34,26,.34)'); g.addColorStop(1, 'rgba(40,34,26,0)'); x.fillStyle = g; x.save(); x.translate(px, r2() * S * 0.4); x.fillRect(0, 0, w, len); x.restore(); }
      return new THREE.MeshStandardMaterial({ map: tex(col, true), normalMap: GFX.normalFromHeight(h, S, 1.6), roughness: 0.88, metalness: 0 });
    },
    tile() {
      const S = 512, n = GFX.noise(S, 32, 3, 61), big = GFX.noise(S, 5, 3, 62), h = new Float32Array(S * S), T = 128;
      const col = pix(S, (x, y, i, o) => { const g = (x % T < 3 || y % T < 3), chk = ((Math.floor(x / T) + Math.floor(y / T)) & 1); const v = g ? 60 : (chk ? 168 : 132) + n[i] * 16 - big[i] * 34; o[0] = v; o[1] = v * 1.0; o[2] = v * 0.97; h[i] = g ? 0 : 1; });
      const rough = pix(S, (x, y, i, o) => { const g = (x % T < 3 || y % T < 3); o[0] = o[2] = 0; o[1] = g ? 235 : 70 + big[i] * 120; });
      return new THREE.MeshStandardMaterial({ map: tex(col, true), roughnessMap: tex(rough), normalMap: GFX.normalFromHeight(h, S, 2), roughness: 1, metalness: 0 });
    },
    grass() {
      const S = 512, a = GFX.noise(S, 6, 4, 71), f = GFX.noise(S, 128, 2, 72), rnd = GFX.rng(73), h = new Float32Array(S * S);
      const col = pix(S, (x, y, i, o) => { const dirt = sstep(0.62, 0.78, a[i]), sp = rnd(), k = 0.7 + f[i] * 0.6 + (sp > 0.97 ? 0.3 : 0); o[0] = (38 * (1 - dirt) + 70 * dirt) * k; o[1] = (62 * (1 - dirt) + 58 * dirt) * k; o[2] = (34 * (1 - dirt) + 42 * dirt) * k; h[i] = f[i]; });
      return new THREE.MeshStandardMaterial({ map: tex(col, true), normalMap: GFX.normalFromHeight(h, S, 4), roughness: 0.96, metalness: 0 });
    },
    metalSheet() {
      const S = 512, n = GFX.noise(S, 6, 4, 81), f = GFX.noise(S, 64, 3, 82), h = new Float32Array(S * S);
      const col = pix(S, (x, y, i, o) => { const rust = sstep(0.55, 0.75, n[i] * 0.75 + f[i] * 0.25 + y / S * 0.15), v = 96 + f[i] * 24; o[0] = v * (1 - rust) + 112 * rust; o[1] = v * (1 - rust) + 62 * rust; o[2] = v * 1.04 * (1 - rust) + 40 * rust; h[i] = 0.5 + 0.5 * Math.sin(x / S * Math.PI * 2 * 24); });
      const rough = pix(S, (x, y, i, o) => { const rust = sstep(0.55, 0.75, n[i] * 0.75 + f[i] * 0.25 + y / S * 0.15); o[0] = 0; o[1] = 110 + rust * 130; o[2] = 200 * (1 - rust); });
      const rt = tex(rough);
      return new THREE.MeshStandardMaterial({ map: tex(col, true), roughnessMap: rt, metalnessMap: rt, normalMap: GFX.normalFromHeight(h, S, 3), roughness: 1, metalness: 1 });
    }
  };
  /** 把方塊的 UV 改成依世界尺寸鋪貼（每 size 公尺重複一次），貼圖才不會被拉長 */
  GFX.boxUV = (geo, ox = 0, oy = 0, oz = 0, size = 4) => {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, k = 1 / size;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i) + ox, y = p.getY(i) + oy, z = p.getZ(i) + oz;
      if (ay >= ax && ay >= az) uv.setXY(i, x * k, z * k); else if (ax >= az) uv.setXY(i, z * k, y * k); else uv.setXY(i, x * k, y * k);
    }
    uv.needsUpdate = true; return geo;
  };
}
