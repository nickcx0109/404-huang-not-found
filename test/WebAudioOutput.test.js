import test from 'node:test';
import assert from 'node:assert/strict';
import { WebAudioOutput } from '../web/js/audio/WebAudioOutput.js';

test('disposing audio during a file read aborts loads without decoding against a closed context', async context => {
  let finishRead;
  let signal;
  let decodes = 0;
  let closes = 0;
  const warnings = context.mock.method(console, 'warn', () => {});
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    signal = options.signal;
    return { ok: true, arrayBuffer: () => new Promise(resolve => { finishRead = resolve; }) };
  });
  const output = new WebAudioOutput();
  output.synth = { context: { close: () => closes++, decodeAudioData: () => decodes++ } };
  output.library.set('old', {});
  const pending = output._decode(new URL('https://example.test/sound.wav'));
  await Promise.resolve();
  output.dispose();
  output.dispose();
  finishRead(new ArrayBuffer(0));
  assert.equal(await pending, null);
  assert.equal(signal.aborted, true);
  assert.equal(decodes, 0);
  assert.equal(closes, 1);
  assert.equal(output.library.size, 0);
  assert.equal(output.ready, false);
  assert.equal(warnings.mock.callCount(), 0);
  output.unlock();
  assert.equal(output.ready, false);
});

test('a decode that finishes after disposal cannot restore an old audio buffer', async context => {
  let finishDecode;
  context.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  const output = new WebAudioOutput();
  output.synth = { context: { close() {},
    decodeAudioData: () => new Promise(resolve => { finishDecode = resolve; }) } };
  const pending = output._decode(new URL('https://example.test/sound.wav'));
  await Promise.resolve();
  await Promise.resolve();
  output.dispose();
  finishDecode({ decoded: true });
  assert.equal(await pending, null);
});
