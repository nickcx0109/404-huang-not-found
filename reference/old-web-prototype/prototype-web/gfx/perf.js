/* =========================================================
   Performance tools (load after the main game script)
   ?perf=1   live panel: FPS, frame time, CPU split, draw calls, triangles, lights
   ?bench=1  automatic benchmark: a fixed worst-case scene, each setting measured in
             turn, then a results table you can copy. Nobody has to play.
   ========================================================= */
(() => {
  const q = new URLSearchParams(location.search);
  const BENCH = q.has('bench'), PANEL = BENCH || q.get('perf') === '1';
  if (!PANEL) return;

  const WARMUP = +(q.get('warm') || 2), MEASURE = +(q.get('secs') || 6), ZOMBIES = +(q.get('zombies') || 64);
  const BASE_DPR = renderer.getPixelRatio(), BASE_POST = GFX.opts.post;

  /* ---------- per-frame timing ---------- */
  renderer.info.autoReset = false;   // count shadow pass + scene + post blits together
  let renderMs = 0, lastNow = 0, sink = null;
  const origRender = GFX.render;
  GFX.render = (...a) => { const t = performance.now(); origRender(...a); renderMs = performance.now() - t; };
  const origStep = stepFrame;
  stepFrame = function (now) {   // frame() looks stepFrame up by name each call, so this wraps every frame
    renderer.info.reset(); renderMs = 0;
    const t0 = performance.now(); origStep(now); const total = performance.now() - t0;
    const s = { dt: lastNow ? now - lastNow : 0, sim: total - renderMs, render: renderMs, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    lastNow = now;
    if (s.dt > 0) { live.push(s); if (sink) sink.push(s); }
  };

  /* ---------- live panel ---------- */
  const live = [], el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;background:rgba(0,0,0,.72);color:#cfe;font:12px/1.45 ui-monospace,Consolas,monospace;padding:6px 9px;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  const countLights = () => { let n = 0, sh = 0; scene.traverse(o => { if (o.isLight && o.visible && !o.isAmbientLight && !o.isHemisphereLight) { n++; if (o.castShadow) sh++; } }); return [n, sh]; };
  let lights = countLights(), lightT = 0;
  setInterval(() => {
    const f = live.splice(0); if (!f.length) return;
    if (++lightT % 4 === 0) lights = countLights();
    const r = summarize(f), sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    el.textContent = `${r.fps.toFixed(0)} fps  每幀 ${r.avg.toFixed(1)} ms（最慢 5% ${r.p95.toFixed(1)}）\n`
      + `CPU 遊戲邏輯 ${r.sim.toFixed(1)} ms  送繪製 ${r.render.toFixed(1)} ms\n`
      + `繪製次數 ${r.calls.toFixed(0)}  三角面 ${(r.tris / 1000).toFixed(0)}k\n`
      + `燈 ${lights[0]}（有陰影 ${lights[1]}）  殭屍 ${game.enemies.length}\n`
      + `解析度 ${sz.x}×${sz.y} @${renderer.getPixelRatio().toFixed(2)}x  後製${GFX.opts.post ? '開' : '關'}`
      + (sink ? `\n測試中：${bench.label}` : '');
  }, 250);

  function summarize(f) {
    const n = f.length, avg = k => f.reduce((a, s) => a + s[k], 0) / n;
    const dts = f.map(s => s.dt).sort((a, b) => a - b), mean = avg('dt');
    return { n, fps: 1000 / mean, avg: mean, p95: dts[Math.min(n - 1, Math.floor(n * 0.95))], sim: avg('sim'), render: avg('render'), calls: avg('calls'), tris: avg('tris') };
  }

  if (!BENCH) return;

  /* ---------- benchmark scene ---------- */
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const EYE = new V3(0, 0, 30); world.collide(EYE, 0.6);   // open street south of the store, looking north at it
  const LOOK_YAW = 0;   // yaw 0 faces -Z

  class BenchState extends GameState {
    enter() {
      const g = this.g; g.inRun = false; g.players = []; ui.show(null); $('#hud').hidden = true;
      if (g.player) g.player.view.visible = false;
      g.setStoreOpen(true); g.guide.setActive(false); g.pickups.clear();
    }
    spawn(n) {
      const g = this.g; g.clearEnemies();
      const r = rng(1234), types = ['walker', 'walker', 'walker', 'runner', 'runner', 'tank', 'exploder'];
      for (let i = 0; i < n; i++) {
        const a = LOOK_YAW + (r() - 0.5) * 1.4, d = 5 + r() * 30;
        const p = new V3(EYE.x - Math.sin(a) * d, 0, EYE.z - Math.cos(a) * d); world.collide(p, 0.5);
        const e = g.factory.create(types[Math.floor(r() * types.length)], p, {}); e.spawnT = 1; e.yaw = r() * 6.28;
      }
    }
    update(dt) {
      const g = this.g, yaw = LOOK_YAW + Math.sin(g.time * 0.35) * 0.55;
      camera.position.set(EYE.x, 1.7, EYE.z); camera.rotation.set(-0.06, yaw, 0); camera.updateMatrixWorld();
      for (let i = g.enemies.length - 1; i >= 0; i--) g.enemies[i].update(dt);
    }
  }

  /* ---------- settings to compare ---------- */
  const lightList = () => { const out = []; scene.traverse(o => { if ((o.isPointLight || o.isSpotLight) && o !== (game.player && game.player.light)) out.push(o); }); return out; };
  const shadowCasters = []; scene.traverse(o => { if (o.isLight && o.castShadow) shadowCasters.push(o); });
  const pointLights = lightList();
  function restore() {
    pointLights.forEach(l => { l.visible = true; });
    if (typeof QUALITY !== 'undefined') { QUALITY.apply('high'); return; }
    GFX.setPost(BASE_POST); delete GFX.opts.msaa;
    shadowCasters.forEach(l => { l.castShadow = true; });
    renderer.setPixelRatio(BASE_DPR); resize();
  }
  const setDpr = d => { renderer.setPixelRatio(d); resize(); };
  const noShadow = () => shadowCasters.forEach(l => { l.castShadow = false; });
  const noPost = () => GFX.setPost(false);
  const hasQ = typeof QUALITY !== 'undefined';
  const noLights = () => pointLights.forEach(l => { l.visible = false; });
  const CONFIGS = [
    { key: 'base', label: '原本設定', apply() {} },
    { key: 'dpr1', label: '解析度改 1 倍', apply() { setDpr(1); }, skip: BASE_DPR <= 1 },
    { key: 'shadow', label: '關陰影', apply: noShadow, skip: !shadowCasters.length },
    { key: 'post', label: '關後製（光暈、調色）', apply: noPost, skip: !BASE_POST },
    { key: 'msaa', label: '關反鋸齒（後製保留）', apply() { GFX.opts.msaa = 0; resize(); }, skip: !BASE_POST },
    { key: 'lights', label: `關路燈點光源（${pointLights.length} 盞）`, apply: noLights, skip: !pointLights.length },
    { key: 'half', label: `殭屍減半（${ZOMBIES >> 1} 隻）`, zombies: ZOMBIES >> 1, apply() {} },
    { key: 'none', label: '不放殭屍', zombies: 0, apply() {} },
    { key: 'qmed', label: '畫質：中', apply() { QUALITY.apply('medium'); }, skip: !hasQ },
    { key: 'qlow', label: '畫質：低', apply() { QUALITY.apply('low'); }, skip: !hasQ },
    { key: 'low', label: '全部調低（1 倍、無陰影、無後製、無點光源）', apply() { setDpr(1); noShadow(); noPost(); noLights(); } },
    { key: 'base2', label: '原本設定（再測一次，檢查誤差）', apply() {} }
  ].filter(c => !c.skip);

  const state = new BenchState(game);
  game.fsm.set(state);
  const bench = { label: '準備中', results: [] };
  let hiddenDuring = false;
  document.addEventListener('visibilitychange', () => { if (document.hidden && sink) hiddenDuring = true; });

  const wait = sec => new Promise(res => setTimeout(res, sec * 1000));
  (async () => {
    await wait(1.5);   // let the page settle (fonts, first shader compile)
    for (let i = 0; i < CONFIGS.length; i++) {
      const c = CONFIGS[i];
      restore(); c.apply(); state.spawn(c.zombies === undefined ? ZOMBIES : c.zombies);
      bench.label = `${i + 1}/${CONFIGS.length} ${c.label}（暖機）`; sink = [];
      await wait(WARMUP);
      sink = []; bench.label = `${i + 1}/${CONFIGS.length} ${c.label}（量測中，請不要切換分頁）`;
      await wait(MEASURE);
      const r = summarize(sink); r.key = c.key; r.label = c.label; bench.results.push(r);
    }
    sink = null; restore(); state.spawn(ZOMBIES);
    showResults(bench.results);
  })();

  /* ---------- results ---------- */
  function env() {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    return { gpu, dpr: devicePixelRatio, renderDpr: BASE_DPR, size: `${sz.x}×${sz.y}`, cores: navigator.hardwareConcurrency || '?', webgl2: renderer.capabilities.isWebGL2, ua: navigator.userAgent, zombies: ZOMBIES, measureSec: MEASURE };
  }
  function verdict(rs) {
    const base = rs.find(r => r.key === 'base'), notes = [];
    if (!base) return notes;
    if (base.fps >= 55) notes.push('原本設定就有 55 fps 以上，這台電腦在這個場景不卡，FPS 被螢幕更新率封頂，各項比較看不出差別。實際遊戲會卡的話，原因可能在別處。');
    const again = rs.find(r => r.key === 'base2');
    if (again && Math.abs(again.fps - base.fps) / base.fps > 0.1) notes.push(`兩次「原本設定」差了 ${Math.round(Math.abs(again.fps - base.fps) / base.fps * 100)}%，筆電可能在升溫降頻或背景有程式在跑。比較時要保守，建議插電、關掉其他程式再測一次。`);
    if (hiddenDuring) notes.push('量測途中分頁被切到背景，瀏覽器會放慢背景分頁，這次數字不能用。請重測，並讓分頁保持在前面。');
    const gains = rs.filter(r => !['base', 'base2', 'low', 'qmed', 'qlow'].includes(r.key)).map(r => ({ r, g: r.fps / base.fps - 1 })).sort((a, b) => b.g - a.g);
    if (gains.length && gains[0].g > 0.15) notes.push(`單項改善最大：${gains[0].r.label}，FPS +${Math.round(gains[0].g * 100)}%。`);
    if (base.sim > base.avg * 0.4) notes.push(`遊戲邏輯佔了每幀 ${base.avg.toFixed(1)} ms 裡的 ${base.sim.toFixed(1)} ms，比例很高，CPU 也是瓶頸。`);
    notes.push('這個測試裡殭屍只是閒晃、沒有在追人，所以沒有算到尋路。CPU 遊戲邏輯的數字會比實際遊戲低。');
    return notes;
  }
  function toMarkdown(rs, e, notes) {
    const base = rs.find(r => r.key === 'base') || rs[0];
    const rows = rs.map(r => `| ${r.label} | ${r.fps.toFixed(1)} | ${r.avg.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.sim.toFixed(1)} | ${r.render.toFixed(1)} | ${r.calls.toFixed(0)} | ${(r.tris / 1000).toFixed(0)}k | ${r === base ? '—' : (r.fps / base.fps - 1 >= 0 ? '+' : '') + Math.round((r.fps / base.fps - 1) * 100) + '%'} |`);
    return [`## 效能測試結果（${new Date().toLocaleString()}）`,
      `顯示卡：${e.gpu}  \n螢幕縮放 ${e.dpr}，遊戲用 ${e.renderDpr} 倍解析度，畫面 ${e.size}，CPU 執行緒 ${e.cores}，WebGL2 ${e.webgl2 ? '有' : '無'}，殭屍 ${e.zombies} 隻，每項量 ${e.measureSec} 秒  \n${e.ua}`, '',
      '| 設定 | 平均 FPS | 平均每幀 ms | 最慢 5% ms | CPU 遊戲邏輯 ms | 送繪製 ms | 繪製次數 | 三角面 | 和原本比 |',
      '|---|---|---|---|---|---|---|---|---|', ...rows, '', ...notes.map(n => `- ${n}`)].join('\n');
  }
  function showResults(rs) {
    const e = env(), notes = verdict(rs), md = toMarkdown(rs, e, notes);
    window.BENCH_RESULT = { env: e, results: rs, notes, markdown: md };
    console.log(md);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:24px;z-index:10000;background:#11161c;color:#e6edf3;font:13px/1.5 system-ui,sans-serif;padding:16px 18px;border-radius:10px;overflow:auto;box-shadow:0 8px 40px rgba(0,0,0,.6)';
    const base = rs.find(r => r.key === 'base') || rs[0];
    const td = 'padding:4px 10px;border-bottom:1px solid #2a3340;text-align:right', th = td + ';color:#9fb0c0;font-weight:600';
    box.innerHTML = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><b style="font-size:16px">效能測試結果</b><span style="flex:1"></span>
      <button id="bCopy" style="padding:6px 14px;border-radius:6px;border:0;background:#3b82f6;color:#fff;cursor:pointer">複製結果</button>
      <button id="bClose" style="padding:6px 14px;border-radius:6px;border:1px solid #445;background:none;color:#ccd;cursor:pointer">關閉</button></div>
      <div style="color:#9fb0c0;margin-bottom:10px">顯示卡：${e.gpu}<br>螢幕縮放 ${e.dpr}，遊戲用 ${e.renderDpr} 倍解析度，畫面 ${e.size}，CPU 執行緒 ${e.cores}，殭屍 ${e.zombies} 隻</div>
      <table style="border-collapse:collapse;width:100%"><tr><th style="${th};text-align:left">設定</th><th style="${th}">平均 FPS</th><th style="${th}">平均每幀 ms</th><th style="${th}">最慢 5% ms</th><th style="${th}">CPU 遊戲邏輯</th><th style="${th}">送繪製</th><th style="${th}">繪製次數</th><th style="${th}">三角面</th><th style="${th}">和原本比</th></tr>
      ${rs.map(r => { const g = r.fps / base.fps - 1, col = r === base ? '#ccd' : g > 0.15 ? '#4ade80' : g < -0.05 ? '#f87171' : '#ccd';
        return `<tr><td style="${td};text-align:left">${r.label}</td><td style="${td}">${r.fps.toFixed(1)}</td><td style="${td}">${r.avg.toFixed(1)}</td><td style="${td}">${r.p95.toFixed(1)}</td><td style="${td}">${r.sim.toFixed(1)}</td><td style="${td}">${r.render.toFixed(1)}</td><td style="${td}">${r.calls.toFixed(0)}</td><td style="${td}">${(r.tris / 1000).toFixed(0)}k</td><td style="${td};color:${col}">${r === base ? '—' : (g >= 0 ? '+' : '') + Math.round(g * 100) + '%'}</td></tr>`; }).join('')}</table>
      <ul style="margin-top:12px;padding-left:18px">${notes.map(n => `<li>${n}</li>`).join('')}</ul>
      <div style="color:#7d8b99;margin-top:6px">CPU 遊戲邏輯：殭屍 AI 和遊戲更新。送繪製：CPU 把繪製指令交給顯示卡的時間。每幀時間還包含顯示卡的工作，所以每幀時間遠大於這兩項加起來時，瓶頸在顯示卡。</div>`;
    document.body.appendChild(box);
    box.querySelector('#bClose').onclick = () => box.remove();
    box.querySelector('#bCopy').onclick = async ev => {
      try { await navigator.clipboard.writeText(md); ev.target.textContent = '已複製'; }
      catch (err) { const t = document.createElement('textarea'); t.value = md; t.style.cssText = 'width:100%;height:200px;margin-top:10px'; box.appendChild(t); t.select(); ev.target.textContent = '請按 Ctrl+C 複製'; }
    };
  }
})();
