'use strict';
/* ---------- 輸入 ---------- */
const input = { keys: {}, down: false, pressed: false, any: false };
const canPause = () => { const st = game.fsm.state; return game.inRun && !game.picking && (st instanceof PlayingState || st instanceof WaveBreakState); };
addEventListener('keydown', e => {
  // 鎖定滑鼠時按 Esc 會由瀏覽器解除鎖定，交給 pointerlockchange 暫停；拖曳視角模式沒有鎖定，要自己處理
  if (e.code === 'Escape' && game.noLock && !ui.shopOpen && !ui.pickCb) {
    if (game.paused) { game.paused = false; ui.show(null); } else if (canPause()) { game.paused = true; input.keys = {}; input.down = false; ui.show('pause'); }
    e.preventDefault(); return;
  }
  if (ui.pickCb && /^Digit[1-3]$/.test(e.code)) { ui.choose(+e.code.slice(5) - 1); e.preventDefault(); return; }
  if (ui.shopOpen) { if (/^Digit[1-7]$/.test(e.code)) ui.buy(+e.code.slice(5) - 1); else if (e.code === 'KeyE') ui.closeShop();
    // 瀏覽器不把 Esc 當成使用者操作，這時要求鎖定滑鼠一定失敗，所以改成等玩家點畫面
    else if (e.code === 'Escape') ui.closeShop(false);
    e.preventDefault(); return; }
  if (!game.inRun || game.picking) return;
  input.keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (/^Digit[1-3]$/.test(e.code)) game.player.switchTo(+e.code.slice(5) - 1);
  if (e.code === 'KeyE' && !e.repeat) game.tryInteract();
  if (e.code === 'KeyL') hud.toggleLog();
});
addEventListener('keyup', e => { input.keys[e.code] = false; });
addEventListener('blur', () => { input.keys = {}; input.down = false; });
canvas.addEventListener('mousedown', e => {
  sfx.init();
  if (!game.inRun || game.picking || game.paused) return;
  input.any = true;
  if (!game.locked && !game.noLock) { game.requestLock(); return; }
  if (e.button === 0) { input.down = true; input.pressed = true; }
});
addEventListener('mouseup', e => { if (e.button === 0) input.down = false; if (!e.buttons) input.any = false; });
addEventListener('mousemove', e => { if (!game.inRun || game.paused || game.picking || !game.players.length) return; if (game.locked || (game.noLock && input.any)) game.player.look(e.movementX || 0, e.movementY || 0); });
canvas.addEventListener('wheel', e => { if (game.inRun && !game.picking) game.player.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  game.locked = document.pointerLockElement === canvas;
  if (game.locked) { if (game.paused) { game.paused = false; ui.show(null); } return; }
  input.down = false; input.keys = {};
  if (!game.noLock && canPause()) { game.paused = true; ui.show('pause'); }
});
document.addEventListener('pointerlockerror', () => game.lockFailed());

$('#startBtn').addEventListener('click', () => { sfx.init(); game.newRun(); game.requestLock(); });
$('#againBtn').addEventListener('click', () => { sfx.init(); game.newRun(); game.requestLock(); });
$('#menuBtn').addEventListener('click', () => game.fsm.set(new LobbyState(game)));
$('#skipBtn').addEventListener('click', () => ui.choose(-1));
$('#cards').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) ui.choose(+c.dataset.i); });
$('#shopItems').addEventListener('click', e => { const c = e.target.closest('.item'); if (c) ui.buy(+c.dataset.i); });
$('#shopClose').addEventListener('click', () => ui.closeShop());
$('#resumeBtn').addEventListener('click', () => { game.requestLock(); if (game.noLock) { game.paused = false; ui.show(null); } });
$('#quitBtn').addEventListener('click', () => { game.paused = false; ui.show(null); game.player.downed = true; game.player.downT = 99; });
$('#sensRange').addEventListener('input', e => { settings.setSens(e.target.value); ui.syncSettings(); });
$('#sensReset').addEventListener('click', () => { settings.setSens(SENS.def); ui.syncSettings(); });
ui.syncSettings();

