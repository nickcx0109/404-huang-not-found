// Entry for web/cutscene.html: loads a cutscene script and plays it.
//
//   cutscene.html                     -> plays assets/cutscenes/opening.json
//   cutscene.html?name=opening        -> same, by name
//   cutscene.html?at=c1_12            -> start at a shot id (or ?at=12.5 seconds)
//   cutscene.html?at=c1_12&freeze=2   -> draw that shot 2 s in and stay there (screenshots)
//
// When the cutscene ends or is skipped, the page goes to the script's `next`.

import { CutsceneTimeline } from './logic/CutsceneTimeline.js';
import { ShotTypes } from './ShotTypes.js';
import { ImageShot } from './ImageShot.js';
import { SplitShot } from './SplitShot.js';
import { CutscenePlayer } from './CutscenePlayer.js';
import { KeyClick } from './KeyClick.js';

window.__ready = false;
window.__error = null;

const params = new URLSearchParams(location.search);
const name = params.get('name') ?? 'opening';

try {
  if (!/^[a-z0-9_-]+$/.test(name)) throw new Error(`Bad cutscene name "${name}"`);
  const scriptUrl = new URL(`../../assets/cutscenes/${name}.json`, import.meta.url);
  const response = await fetch(scriptUrl);
  if (!response.ok) throw new Error(`Cutscene "${name}" not found (${response.status})`);
  const timeline = new CutsceneTimeline(await response.json());

  const shotTypes = new ShotTypes()
    .register('image', ImageShot)
    .register('split', SplitShot);
  const keyClick = new KeyClick();
  const player = new CutscenePlayer(document.getElementById('stage'), timeline, shotTypes, {
    assetUrl: file => new URL(file, scriptUrl).href,
    keyClick,
  });
  await player.preload();

  const from = startTime(timeline, params.get('at'));
  const freeze = params.get('freeze');
  window.__ready = true;

  if (freeze !== null) {
    await player.play({ from: from + (Number(freeze) || 0), freeze: true });
  } else {
    await waitForClick(document.getElementById('start'));
    keyClick.unlock();
    const skipButton = document.getElementById('skip');
    skipButton.hidden = false;
    skipButton.addEventListener('click', () => player.skip());
    addEventListener('keydown', event => {
      if (event.key === 'Escape') player.skip();
    });
    await player.play({ from });
    skipButton.hidden = true;
    keyClick.close();
    if (timeline.next) location.href = new URL(timeline.next, location.href).href;
  }
} catch (error) {
  console.error(error);
  window.__error = error.message;
  const panel = document.getElementById('error');
  panel.textContent = error.message;
  panel.hidden = false;
}

function startTime(timeline, at) {
  if (at === null || at === '') return 0;
  const seconds = Number(at);
  return Number.isFinite(seconds) ? seconds : timeline.startOf(at);
}

function waitForClick(overlay) {
  overlay.hidden = false;
  return new Promise(resolve => {
    overlay.addEventListener('click', () => {
      overlay.hidden = true;
      resolve();
    }, { once: true });
  });
}
