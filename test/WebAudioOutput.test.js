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

function fakeContext(state = 'running') {
  const calls = [];
  return {
    calls,
    state,
    suspend() { calls.push('suspend'); this.state = 'suspended'; },
    resume() { calls.push('resume'); this.state = 'running'; },
    close() {},
  };
}

test('pause suspends the sound and resume lets it go on; a click while paused keeps it quiet', () => {
  const output = new WebAudioOutput();
  const context = fakeContext();
  output.synth = { context };
  output.pause();
  output.pause();
  assert.deepEqual(context.calls, ['suspend']);
  output.unlock(); // a key press or click while the game is paused
  assert.deepEqual(context.calls, ['suspend']);
  output.resume();
  output.resume();
  assert.deepEqual(context.calls, ['suspend', 'resume']);
  output.pause();
  output.dispose();
  output.resume();
  assert.deepEqual(context.calls, ['suspend', 'resume', 'suspend']);
});

test('sound unlocked while paused starts suspended', t => {
  const created = [];
  t.after(() => { delete globalThis.AudioContext; });
  globalThis.AudioContext = class {
    constructor() {
      this.state = 'running';
      this.destination = {};
      this.calls = [];
      created.push(this);
    }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    get sampleRate() { return 8; }
    createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
    suspend() { this.calls.push('suspend'); this.state = 'suspended'; }
    resume() { this.calls.push('resume'); this.state = 'running'; }
    close() {}
  };
  const output = new WebAudioOutput({ manifestUrl: null });
  output.pause();
  output.unlock();
  assert.equal(output.ready, true);
  assert.deepEqual(created[0].calls, ['suspend']);
  output.resume();
  assert.deepEqual(created[0].calls, ['suspend', 'resume']);
  output.dispose();
});


test('loop mix moves without restarting its source and file replacement restarts once', () => {
  let starts = 0;
  let stops = 0;
  const nodes = [];
  const node = field => {
    const value = { [field]: { value: 0 }, connect() {}, disconnect() {} };
    nodes.push(value);
    return value;
  };
  const output = new WebAudioOutput();
  output.synth = { output: {}, context: { createGain: () => node('gain'),
    createStereoPanner: () => node('pan'), close() {} } };
  output.library.set('idle', { startLoop() { starts++; return () => stops++; } });
  output.setLoop('p2', 'idle', { pan: -1, gain: 0.5 });
  output.setLoop('p2', 'idle', { pan: 1, gain: 0.2 });
  assert.equal(starts, 1);
  assert.equal(stops, 0);
  assert.equal(nodes[0].gain.value, 0.2);
  assert.equal(nodes[1].pan.value, 1);
  output._restartLoopsOf('idle');
  assert.equal(starts, 2);
  assert.equal(stops, 1);
  output.dispose();
  assert.equal(stops, 2);
});
