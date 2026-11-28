import test from 'node:test';
import assert from 'node:assert/strict';
import { SampleSound, SynthSound } from '../web/js/audio/Sound.js';
import { Synth } from '../web/js/audio/Synth.js';
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


function setup() {
  const nodes = [];
  const calls = [];
  const node = () => {
    const result = {
      connections: [],
      connect(destination) { this.connections.push(destination); },
      disconnect() { this.connections.length = 0; },
    };
    nodes.push(result);
    return result;
  };
  const context = {
    currentTime: 1,
    createGain: () => Object.assign(node(), {
      gain: { setTargetAtTime: (...args) => calls.push(['fade', ...args]) },
    }),
    createStereoPanner: () => Object.assign(node(), { pan: {} }),
    createBufferSource: () => Object.assign(node(), {
      start() {},
      stop: when => calls.push(['stop', when]),
    }),
    close: () => calls.push(['close']),
  };
  const output = new WebAudioOutput();
  output.synth = Object.assign(Object.create(Synth.prototype), { context, output: {} });
  return { output, nodes, calls };
}

test('a stopped loop stays connected through the fade and disconnects on ended', () => {
  const { output, nodes, calls } = setup();
  output.library.set('idle', new SampleSound([{}]));
  output.setLoop('saw', 'idle');
  const [, , source] = nodes;
  output.setLoop('saw', null);
  output.setLoop('saw', null);
  assert.deepEqual(calls, [['fade', 0, 1, 0.03], ['stop', 1.15]]);
  assert.equal(nodes.every(node => node.connections.length === 1), true);
  source.onended();
  assert.equal(nodes.every(node => node.connections.length === 0), true);
  assert.equal(output.loopDisconnects.size, 0);
});

test('an unavailable loop keeps its latest mix without leaving connected nodes', () => {
  const { output, nodes } = setup();
  output.setLoop('saw', 'idle');
  assert.equal(nodes.length, 0);
  output.library.set('idle', new SynthSound(() => {}));
  output.setLoop('saw', 'idle', { gain: 0.4, pan: -0.7 });
  assert.equal(nodes.every(node => node.connections.length === 0), true);
  output.library.set('idle', new SampleSound([{}]));
  output._restartLoopsOf('idle');
  const [gain, panner, source] = nodes.slice(2);
  assert.equal(gain.gain.value, 0.4);
  assert.equal(panner.pan.value, -0.7);
  output.setLoop('saw', null);
  output.dispose();
  assert.equal(gain.connections.length, 0);
  assert.equal(panner.connections.length, 0);
  assert.equal(output.loopDisconnects.size, 0);
  source.onended();
  assert.equal(nodes.every(node => node.connections.length === 0), true);
});
