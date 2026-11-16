/* =========================================================
   Quality tiers (load after the main game script, before perf.js)
   high   = the original look, resolution capped at 1.5x
   medium = 1x resolution, 1024 shadows, zombies cast no shadows, 2x MSAA
   low    = 0.75x resolution, no shadows, no post-processing
   ?quality=high|medium|low forces a tier. Otherwise the player's choice in the Esc menu is used;
   "auto" picks a tier from the GPU and steps down one tier when play stays under 45 fps.
   ========================================================= */
const QUALITY = (() => {
  const TIERS = {
    high: { name: '高', dprCap: 1.5, dprScale: 1, shadows: true, shadowSize: 2048, zombieShadows: true, post: true, msaa: 4 },
    medium: { name: '中', dprCap: 1, dprScale: 1, shadows: true, shadowSize: 1024, zombieShadows: false, post: true, msaa: 2 },
    low: { name: '低', dprCap: 1, dprScale: 0.75, shadows: false, shadowSize: 1024, zombieShadows: false, post: false, msaa: 0 }
  };
  const ORDER = ['high', 'medium', 'low'], LOW_FPS = 45, WINDOW = 3, BAD_WINDOWS = 2;
  const q = new URLSearchParams(location.search);
  const forced = TIERS[q.get('quality')] ? q.get('quality') : q.has('bench') ? 'high' : null;
  const postAllowed = GFX.opts.post, shadowsAllowed = GFX.opts.shadows;   // ?post=0, ?shadows=0 and WebGL1 still win
  let pref = forced || store.get('zwp.quality', 'auto'); if (pref !== 'auto' && !TIERS[pref]) pref = 'auto';
  let tier = null, zombieShadows = true;

  function gpuName() {
    try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return ''; }
  }
  function guess() {
    const g = gpuName().toLowerCase();
    if (/swiftshader|llvmpipe|software|mali|adreno|powervr/.test(g) || /android|iphone|ipad/i.test(navigator.userAgent)) return 'low';
    if (/intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega \d|apple/.test(g)) return 'medium';
    return 'high';
  }
  const autoStart = () => { const t = store.get('zwp.qualityAuto', null); return TIERS[t] ? t : guess(); };

  /* zombies: keep each mesh's original castShadow and switch it on/off as a group */
  function shadeGroup(g) { g.traverse(o => { if (!o.isMesh) return; if (o.userData.cs0 === undefined) o.userData.cs0 = o.castShadow; o.castShadow = zombieShadows && o.userData.cs0; }); }
  const origCreate = game.factory.create.bind(game.factory);
  game.factory.create = (...a) => { const e = origCreate(...a); shadeGroup(e.group); return e; };

  function apply(t) {
    const c = TIERS[t]; if (!c) return; tier = t;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, c.dprCap) * c.dprScale);
    GFX.setShadows(c.shadows && shadowsAllowed); GFX.setShadowSize(c.shadowSize);
    GFX.opts.msaa = c.msaa; GFX.setPost(c.post && postAllowed);
    resize();   // also rebuilds the post targets with the new MSAA
    zombieShadows = c.zombieShadows; game.enemies.forEach(e => shadeGroup(e.group));
    syncUi();
  }

  /* ---------- Esc menu ---------- */
  const LABELS = { auto: '自動', high: '高', medium: '中', low: '低' };
  const box = document.createElement('div'); box.className = 'setting';
  box.innerHTML = `<div class="setting-head"><label>畫質</label><output id="qOut"></output></div>
    <div id="qBtns" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${Object.keys(LABELS).map(k => `<button class="btn ghost small" type="button" data-q="${k}">${LABELS[k]}</button>`).join('')}</div>
    <div class="scale"><span>自動：依顯示卡選，太卡會自動降一檔</span></div>`;
  const anchor = document.querySelector('#pause .plate-in p.muted'); if (anchor) anchor.before(box);
  function syncUi() {
    const out = box.querySelector('#qOut'); if (out) out.textContent = pref === 'auto' ? `自動（目前：${TIERS[tier].name}）` : TIERS[tier].name;
    box.querySelectorAll('[data-q]').forEach(b => { const on = b.dataset.q === pref; b.classList.toggle('ghost', !on); b.setAttribute('aria-pressed', on); });
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    pref = b.dataset.q; if (!forced) store.set('zwp.quality', pref);
    if (pref === 'auto') { store.set('zwp.qualityAuto', null); apply(guess()); } else apply(pref);
  });

  /* ---------- auto step-down while playing ---------- */
  let frames = 0, winStart = 0, bad = 0, grace = 0;
  const count = () => { frames++; requestAnimationFrame(count); }; requestAnimationFrame(count);
  setInterval(() => {
    const now = performance.now(), live = game.inRun && !game.paused && !game.picking && !document.hidden;
    if (!live || pref !== 'auto' || forced) { frames = 0; winStart = now; bad = 0; return; }
    const sec = (now - winStart) / 1000; if (sec < WINDOW) return;
    const fps = frames / sec; frames = 0; winStart = now;
    if (grace > 0) { grace--; return; }   // the window right after a switch includes shader compiles
    bad = fps < LOW_FPS ? bad + 1 : 0;
    const next = ORDER[ORDER.indexOf(tier) + 1];
    if (bad >= BAD_WINDOWS && next) {
      bad = 0; grace = 1; apply(next); store.set('zwp.qualityAuto', next);
      hud.toast(`<b>畫面不夠順</b>　畫質自動降到「${TIERS[next].name}」，可以在 Esc 設定裡改`, 4);
    }
  }, 500);

  apply(pref === 'auto' ? autoStart() : pref);
  return { apply, TIERS, get tier() { return tier; }, get pref() { return pref; }, gpuName };
})();
