'use strict';
/* ---------- 啟動 ---------- */
const world = new World();
const game = new Game();
game.player = new Player();
game.score = new ScoreKeeper();
game.economy = new Economy();
game.dropper = new TokenDropper();
const hud = new Hud();
game.fsm.set(new LobbyState(game));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => world.signs.forEach(s => s.redraw()));

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (!game.paused) { game.time += dt; game.fsm.update(dt); game.fx.update(dt); }
  hud.frame(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
