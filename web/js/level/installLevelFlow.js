import { LevelFlow } from './LevelFlow.js';
import { EVENTS } from '../game/events.js';

// Connects LevelFlow to the running page: the E key, the on-screen prompt, hiding a cleared
// block, loading the next level, and remembering cleared blocks for the browser session.
//
// A level without exits gets nothing at all: no listeners, no DOM, no per-frame work.
//
// Contract for whoever builds a block: its visible prop must be bound to the block's
// collider and keep its meshes out of the static batch (userData.dynamic = true), otherwise
// it cannot be hidden when the block is cleared.
const STORE_KEY = 'level-flow:cleared';

/** Set-like store kept in sessionStorage; falls back to memory where storage is unavailable. */
function sessionSet() {
  let saved = [];
  try {
    saved = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || '[]');
  } catch (error) {
    saved = [];
  }
  const keys = new Set(Array.isArray(saved) ? saved : []);
  return {
    has: (key) => keys.has(key),
    add: (key) => {
      keys.add(key);
      try {
        window.sessionStorage.setItem(STORE_KEY, JSON.stringify(Array.from(keys)));
      } catch (error) {
        // private mode or a full store: the block is still cleared until the page reloads
      }
    },
  };
}

/** Hides every prop of the level that stands inside the footprint of a removed block. */
function hideVisuals(root, box) {
  root.children.forEach((object) => {
    if (!object.userData.propName) return;
    const { x, z } = object.position;
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) object.visible = false;
  });
}

function createPrompt() {
  const element = document.createElement('div');
  element.className = 'flow-prompt';
  element.hidden = true;
  element.innerHTML = '<span class="flow-prompt__text">按住 E 搬開障礙物</span><i class="flow-prompt__bar"><b></b></i>';
  document.body.appendChild(element);
  const bar = element.querySelector('b');
  return {
    show(status) {
      element.hidden = !status;
      if (status) bar.style.width = Math.round(status.progress * 100) + '%';
    },
    remove: () => element.remove(),
  };
}

/** With gameplay on (?play=1) the HUD draws the prompt; this only tells it what to show. */
function createHudPrompt(events) {
  const id = 'level-flow';
  let shown = null;
  return {
    show(status) {
      const progress = status ? status.progress : null;
      if (progress === shown) return;
      shown = progress;
      events.emit(EVENTS.PROMPT_CHANGED, status ? { id, text: 'HOLD E   CLEAR THE WAY', progress } : { id, text: null });
    },
    remove() {},
  };
}

/**
 * @param {App} app  after its level, collision and player exist
 * @returns {{update: (dt: number) => void, flow: LevelFlow, dispose: () => void}|null}
 */
export function installLevelFlow(app) {
  const flow = new LevelFlow({
    level: app.level,
    collision: app.built.collision,
    player: app.player,
    store: sessionSet(),
    navigate: (target, from) => {
      const next = new URLSearchParams(window.location.search);
      next.set('level', target);
      next.set('from', from);
      next.delete('spawn');
      window.location.search = next.toString();
    },
  });
  if (flow.exits.length === 0) return null;

  flow.remembered.forEach((box) => hideVisuals(app.built.root, box));
  flow.onCleared = (box) => hideVisuals(app.built.root, box);

  const from = new URLSearchParams(window.location.search).get('from');
  if (from) flow.arriveFrom(from);

  let holding = false;
  const onKeyDown = (event) => { if (event.code === 'KeyE') holding = true; };
  const onKeyUp = (event) => { if (event.code === 'KeyE') holding = false; };
  const onBlur = () => { holding = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const prompt = app.game ? createHudPrompt(app.events) : createPrompt();
  return {
    flow,
    update(dt) {
      prompt.show(flow.update(dt, holding && app.player.locked));
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      prompt.remove();
    },
  };
}
