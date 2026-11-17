import { registerHooks } from 'node:module';

// The controls only need a direction container and angle conversions. Keep Node
// tests offline; rendering and real Three.js are exercised in the browser.
const three = 'data:text/javascript,' + encodeURIComponent(`
  export class Vector3 {}
  export const MathUtils = {
    degToRad: value => value * Math.PI / 180,
    radToDeg: value => value * 180 / Math.PI,
  };
`);
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'three' ? { url: three, shortCircuit: true } : nextResolve(specifier, context);
  },
});
export const { PlayerCombat } = await import('../../web/js/player/PlayerCombat.js');
export const { PlayerController } = await import('../../web/js/PlayerController.js');
hook.deregister();

export function browserInput(t) {
  const cleanup = [];
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const window = globalThis.window = new EventTarget();
  const document = globalThis.document = new EventTarget();
  document.pointerLockElement = null;
  document.exitPointerLock = () => {
    document.pointerLockElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  t.after(() => {
    for (const dispose of cleanup) dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const send = (target, type, detail) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, detail);
    target.dispatchEvent(event);
  };
  return { window, document, send, cleanup };
}
