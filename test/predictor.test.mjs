import test from 'node:test';
import assert from 'node:assert/strict';
import { addSample, analyze, describePrediction, recentStats, demoPoint, DEMO_STEPS } from '../predictor.js';
import { setLang } from '../i18n.js';

test.beforeEach(() => setLang('en'));
const feed = (pts) => pts.reduce((s, [t, c]) => addSample(s, t, c), []);
const steady = Array.from({ length: 12 }, (_, i) => [i * 15, -18 + (i % 2 ? 0.05 : -0.05)]);

test('addSample ignores bad numbers, duplicates and out-of-order times, and drops readings older than 15 min', () => {
  let s = addSample([], 0, -18);
  assert.equal(addSample(s, 0, -17), s);
  assert.equal(addSample(s, -5, -17), s);
  assert.equal(addSample(s, 10, NaN), s);
  assert.equal(addSample(s, NaN, -18), s);
  s = addSample(s, 1000, -18);
  assert.deepEqual(s.map((p) => p.t), [1000]);
});

test('too little data means the predictor is still learning', () => {
  assert.equal(analyze(feed(steady.slice(0, 3)), 33).kind, 'learning');
  assert.equal(analyze(feed([[0, 1], [5, 1], [10, 1], [15, 1], [20, 1]]), 33).kind, 'learning');   // 5 readings but 20 s
});

test('sensor noise alone is steady, not warming', () => {
  const a = analyze(feed(steady), 33);
  assert.equal(a.kind, 'steady');
  assert.equal(describePrediction(a).level, 'ok');
});

test('a steady rise is warming, with minutes to the alert limit', () => {
  const pts = Array.from({ length: 12 }, (_, i) => [i * 15, -18 + i * 0.15]);   // 0.6 °C per minute
  const a = analyze(feed(pts), -12);
  assert.equal(a.kind, 'warming');
  assert.ok(Math.abs(a.slope - 0.6) < 0.01);
  assert.ok(Math.abs(a.minutesToLimit - (-12 - (-18 + 11 * 0.15)) / 0.6) < 0.1);
  const d = describePrediction(a);
  assert.equal(d.level, 'warn');   // 10 minutes or less
  assert.match(d.text, /Warming 0\.6° per minute\. The alert limit is about 7 min away\./);
  assert.equal(describePrediction(analyze(feed(pts), -8)).level, 'watch');   // 11 minutes away
});

test('a slow rise far from the limit is a watch with no countdown', () => {
  const pts = Array.from({ length: 12 }, (_, i) => [i * 60, -18 + i * 0.12]);   // 0.12 °C per minute
  const a = analyze(feed(pts), 33);
  assert.equal(a.kind, 'warming');
  assert.match(describePrediction(a).text, /^Slowly warming, 0\.1° per minute\.$/);
});

test('a big change between two readings is a jump', () => {
  const a = analyze(feed([...steady, [180, -15.5]]), 33);
  assert.equal(a.kind, 'jump');
  assert.match(describePrediction(a).text, /Sudden change of 2\.\d°/);
});

test('at or above the limit is over', () => {
  const a = analyze(feed(steady.map(([t]) => [t, 34])), 33);
  assert.equal(a.kind, 'over');
  assert.equal(describePrediction(a).level, 'warn');
});

test('cooling is reported as fine', () => {
  const a = analyze(feed(Array.from({ length: 12 }, (_, i) => [i * 15, -10 - i * 0.15])), 33);
  assert.equal(a.kind, 'cooling');
  assert.equal(describePrediction(a).level, 'ok');
});

test('texts change in Vietnamese', () => {
  const a = analyze(feed(Array.from({ length: 12 }, (_, i) => [i * 15, -18 + i * 0.15])), -10);
  const en = describePrediction(a).text;
  setLang('vi');
  assert.notEqual(describePrediction(a).text, en);
  assert.match(describePrediction(a).text, /Nhiệt độ|Đang nóng lên/);
});

test('recentStats gives min, max and average', () => {
  assert.equal(recentStats([]), null);
  assert.deepEqual(recentStats(feed([[0, -18], [60, -17], [120, -16]])), { count: 3, minutes: 2, minC: -18, maxC: -16, avgC: -17 });
});

test('the demo story is steady first, then warms and reaches the limit, and is the same every time', () => {
  const hot = 33;
  let s = [];
  const kinds = [];
  for (let i = 0; i < DEMO_STEPS; i++) {
    const p = demoPoint(i, hot);
    assert.deepEqual(p, demoPoint(i, hot));
    s = addSample(s, p.t, p.c);
    kinds.push(analyze(s, hot).kind);
  }
  assert.ok(kinds.slice(0, 12).every((k) => k === 'learning' || k === 'steady'), kinds.slice(0, 12).join());
  assert.ok(kinds.includes('warming'));
  assert.equal(kinds.at(-1), 'over');
  assert.equal(demoPoint(0, hot).door, 'closed');
  assert.equal(demoPoint(20, hot).door, 'open');
});
