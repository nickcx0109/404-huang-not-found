import { Hud } from './Hud.js';

window.__ready = false;
window.__error = null;

try {
  const [{ App }, { PropFactory }, { CommonProps }, { Ch1Props }, { Ch2Props }, { Ch3Props }] =
    await Promise.all([
      import('./App.js'),
      import('./PropFactory.js'),
      import('./props/CommonProps.js'),
      import('./props/Ch1Props.js'),
      import('./props/Ch2Props.js'),
      import('./props/Ch3Props.js'),
    ]);

  for (const propSet of [CommonProps, Ch1Props, Ch2Props, Ch3Props]) {
    propSet.registerWith(PropFactory);
  }
  await App.boot();
} catch (error) {
  console.error(error);
  window.__error = error.message;
  new Hud(document.body).showError(error.message, error.problems);
}
