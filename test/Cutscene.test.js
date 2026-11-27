import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Typewriter } from '../web/js/cutscenes/logic/Typewriter.js';
import { SplitLine } from '../web/js/cutscenes/logic/SplitLine.js';
import { CameraMove } from '../web/js/cutscenes/logic/CameraMove.js';
import { CutsceneTimeline, CAPTION_TAIL_SECONDS } from '../web/js/cutscenes/logic/CutsceneTimeline.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('Typewriter types one line at a time, clears between lines and keeps the last one', () => {
  const tw = new Typewriter(['AB', 'C D'], { charSeconds: 0.1, holdSeconds: 1, gapSeconds: 0.5, delaySeconds: 0.2 });

  assert.deepEqual(tw.at(0.1), { index: -1, text: '', typing: false, fresh: 0, clearsIn: Infinity, done: false });
  assert.equal(tw.at(0.2).text, 'A');
  assert.equal(tw.at(0.2).typing, true);
  assert.equal(tw.at(0.35).text, 'AB');
  assert.equal(tw.at(0.35).typing, false);
  // line 0: 0.2 .. 0.4 typed, held until 1.4; gap until 1.9
  assert.equal(tw.at(1.39).text, 'AB');
  near(tw.at(1.3).clearsIn, 0.1);
  assert.equal(tw.at(1.6).index, -1);
  assert.equal(tw.at(1.9).text, 'C');
  near(tw.at(2.0).fresh, 0.1);
  assert.equal(tw.at(2.15).text, 'C D');
  // line 1 typed at 2.2, held until 3.2, then stays on screen
  near(tw.duration, 3.2);
  assert.equal(tw.at(3.1).done, false);
  assert.equal(tw.at(3.1).clearsIn, Infinity);
  assert.deepEqual(
    { text: tw.at(99).text, done: tw.at(99).done, index: tw.at(99).index },
    { text: 'C D', done: true, index: 1 },
  );
});

test('Typewriter counts keystrokes without spaces and lets a line be slower', () => {
  const tw = new Typewriter(['A B', { text: 'GO', charSeconds: 0.5, holdSeconds: 2 }], { charSeconds: 0.1, holdSeconds: 0, gapSeconds: 0 });
  assert.equal(tw.keystrokes(-1), 0);
  assert.equal(tw.keystrokes(0.15), 1);   // "A " -> one key
  assert.equal(tw.keystrokes(0.25), 2);   // "A B"
  // line 1 starts at 0.3, 0.5 s per character
  assert.equal(tw.keystrokes(0.31), 3);
  assert.equal(tw.keystrokes(0.79), 3);
  assert.equal(tw.keystrokes(0.81), 4);
  assert.equal(tw.keystrokes(50), 4);
  near(tw.duration, 0.3 + 1 + 2);

  let last = 0;
  for (let t = 0; t < 4; t += 0.01) {
    const now = tw.keystrokes(t);
    assert.ok(now >= last, 'never goes down');
    last = now;
  }
});

test('Typewriter cursor is solid while typing and blinks after', () => {
  const tw = new Typewriter(['ABCDEFGHIJ'], { charSeconds: 0.1, holdSeconds: 5 });
  assert.equal(tw.cursorOn(0.55), true);
  assert.equal(tw.cursorOn(2.2, 0.5), true);
  assert.equal(tw.cursorOn(2.7, 0.5), false);
  assert.equal(new Typewriter(['X'], { delaySeconds: 1 }).cursorOn(0.5), false);
});

test('Typewriter rejects bad input', () => {
  assert.throws(() => new Typewriter([]), RangeError);
  assert.throws(() => new Typewriter(['']), RangeError);
  assert.throws(() => new Typewriter(['A'], { charSeconds: 0 }), RangeError);
  assert.throws(() => new Typewriter(['A'], { gapSeconds: -1 }), RangeError);
  assert.throws(() => new Typewriter([{ text: 'A', charSeconds: -1 }]), RangeError);
  assert.equal(Typewriter.fromSpec({ lines: ['AB'], charSeconds: 1, holdSeconds: 0 }).duration, 2);
});

test('SplitLine gives matching clip paths for the two panels', () => {
  const line = new SplitLine({ top: 0.57, bottom: 0.37 });
  near(line.xAt(0), 0.57);
  near(line.xAt(1), 0.37);
  near(line.xAt(0.5), 0.47);
  near(line.leftCentre, 0.235);
  near(line.rightCentre, 0.735);
  assert.equal(line.clipPath('left'), 'polygon(0% 0%, 57% 0%, 37% 100%, 0% 100%)');
  assert.equal(line.clipPath('right'), 'polygon(57% 0%, 100% 0%, 100% 100%, 37% 100%)');
  assert.throws(() => line.clipPath('up'), RangeError);
  assert.throws(() => new SplitLine({ top: 1.2 }), RangeError);
  assert.throws(() => new SplitLine({ bottom: 0 }), RangeError);
});

test('CameraMove eases from one framing to the other', () => {
  const move = new CameraMove({ from: { x: -10, scale: 1 }, to: { x: 10, scale: 1.2 } });
  assert.deepEqual(move.at(0), { x: -10, y: 0, scale: 1 });
  assert.deepEqual(move.at(1), { x: 10, y: 0, scale: 1.2 });
  assert.deepEqual(move.at(2), move.at(1));
  near(move.at(0.5).x, 0);
  assert.ok(move.at(0.1).x - move.at(0).x < move.at(0.55).x - move.at(0.45).x, 'starts slow');
  assert.equal(move.transform(0), 'translate(-10%, 0%) scale(1)');

  const still = new CameraMove({ from: { x: 5, scale: 1.1 } });
  assert.deepEqual(still.at(0.7), { x: 5, y: 0, scale: 1.1 });
  assert.throws(() => new CameraMove({ from: { scale: 0 } }), RangeError);
  assert.throws(() => new CameraMove({ to: { x: 'a' } }), RangeError);
});

test('CutsceneTimeline lays shots end to end and sizes captioned shots by their captions', () => {
  const timeline = new CutsceneTimeline({
    next: 'index.html',
    shots: [
      { id: 'a', type: 'image', duration: 2 },
      { id: 'b', type: 'split', captions: { lines: ['AB'], charSeconds: 0.5, holdSeconds: 1 } },
      { id: 'c', type: 'image', duration: 1 },
    ],
  });
  near(timeline.entries[1].duration, 2 + CAPTION_TAIL_SECONDS);
  near(timeline.duration, 2 + 2 + CAPTION_TAIL_SECONDS + 1);
  assert.equal(timeline.next, 'index.html');
  assert.equal(timeline.at(-1).entry.id, 'a');
  assert.equal(timeline.at(1.99).entry.id, 'a');
  const mid = timeline.at(2.5);
  assert.equal(mid.entry.id, 'b');
  near(mid.local, 0.5);
  assert.equal(timeline.at(timeline.duration - 0.01).entry.id, 'c');
  assert.equal(timeline.at(timeline.duration), null);
  assert.equal(timeline.startOf('c'), 4 + CAPTION_TAIL_SECONDS);
  assert.throws(() => timeline.startOf('zz'), RangeError);
});

test('CutsceneTimeline rejects broken scripts', () => {
  assert.throws(() => new CutsceneTimeline({}), RangeError);
  assert.throws(() => new CutsceneTimeline({ shots: [] }), RangeError);
  assert.throws(() => new CutsceneTimeline({ shots: [{ id: 'a', duration: 1 }] }), RangeError);
  assert.throws(() => new CutsceneTimeline({ shots: [{ id: 'a', type: 'image' }] }), RangeError);
  assert.throws(() => new CutsceneTimeline({ shots: [{ id: 'a', type: 'image', duration: 1 }, { id: 'a', type: 'image', duration: 1 }] }), RangeError);
});

test('the opening cutscene file is a valid script whose pictures exist', async () => {
  const base = new URL('../web/assets/cutscenes/', import.meta.url);
  const script = JSON.parse(await readFile(new URL('opening.json', base), 'utf8'));
  const timeline = new CutsceneTimeline(script);
  assert.ok(timeline.duration > 40 && timeline.duration < 90);

  const images = new Set();
  for (const { spec } of timeline.entries) {
    if (spec.image) images.add(spec.image);
    for (const side of ['left', 'right']) if (spec[side]?.image) images.add(spec[side].image);
  }
  assert.ok(images.size > 0);
  for (const image of images) {
    await readFile(new URL(image, base)); // throws if missing
  }
  assert.deepEqual(timeline.entries.map(e => e.id), [
    'c1_01', 'c1_02', 'c1_03', 'c1_04', 'c1_05', 'c1_06', 'c1_07', 'c1_08', 'c1_09', 'c1_10', 'title',
  ]);
  const call = timeline.entries.find(e => e.id === 'c1_08');
  assert.equal(call.captions.lines.length, 3, 'the phone call types three lines');
  assert.equal(timeline.entries.at(-1).spec.type, 'title');
});

test('ShotTypes creates the registered class for each type and refuses unknown or duplicate types', async () => {
  const { ShotTypes } = await import('../web/js/cutscenes/ShotTypes.js');
  const { Shot } = await import('../web/js/cutscenes/Shot.js');
  class Still extends Shot {}
  class Wipe extends Shot {}
  const types = new ShotTypes().register('still', Still).register('wipe', Wipe);
  const options = { assetUrl: f => `/x/${f}` };

  const shot = types.create({ type: 'wipe', id: 'w' }, options);
  assert.ok(shot instanceof Wipe);
  assert.equal(shot.spec.id, 'w');
  assert.equal(shot.assetUrl('a.webp'), '/x/a.webp');
  assert.deepEqual(shot.pictures, []);
  assert.throws(() => shot.build(), /Wipe must implement build/);
  assert.equal(types.has('still'), true);
  assert.equal(types.has('video'), false);
  assert.throws(() => types.create({ type: 'video' }, options), /Unknown shot type "video"/);
  assert.throws(() => types.register('still', Still), /already registered/);
});
