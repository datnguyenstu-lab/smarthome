import test from 'node:test';
import assert from 'node:assert/strict';
import { Cooler, newState, stepThermal } from '../cooler-sim.js';

const T = 10;
test('off: no cooling, no fan', () => {
  const o = new Cooler().update(false, T, 25, 30, 0);
  assert.deepEqual([o.peltier, o.fan, o.reason], [0, 0, 'off']);
});
test('warm box starts cooling with the fan; power grows with error and is capped at 85', () => {
  const o = new Cooler().update(true, T, 25, 30, 0);
  assert.ok(o.peltier >= 40 && o.fan > 0 && o.reason === 'none');
  assert.ok(new Cooler().update(true, T, 11, 30, 0).peltier < 85);
  assert.equal(new Cooler().update(true, T, 30, 30, 0).peltier, 85);
});
test('hysteresis and minimum on time', () => {
  const c = new Cooler(); c.update(true, T, 25, 30, 0);
  assert.ok(c.update(true, T, 10.2, 30, 60000).peltier > 0);
  const d = new Cooler(); d.update(true, T, 25, 30, 0);
  assert.ok(d.update(true, T, 9, 30, 10000).peltier > 0);
  assert.equal(d.update(true, T, 9, 30, 31000).peltier, 0);
});
test('sensor faults and overheat cut the Peltier', () => {
  assert.equal(new Cooler().update(true, T, NaN, 30, 0).reason, 'inside_sensor');
  assert.equal(new Cooler().update(true, T, 25, NaN, 0).reason, 'hot_sensor');
  const c = new Cooler(); c.update(true, T, 25, 30, 0);
  const o = c.update(true, T, 25, 66, 1000);
  assert.deepEqual([o.peltier, o.fan, o.reason], [0, 100, 'overheat']);
  assert.equal(c.update(true, T, 25, 56, 2000).peltier, 0);
  assert.ok(c.update(true, T, 25, 49, 3000).peltier > 0);
});
test('no cooling for 10 minutes latches until reset; progress does not', () => {
  const c = new Cooler(); c.update(true, T, 25, 30, 0);
  assert.equal(c.update(true, T, 25, 30, 600000).reason, 'no_cooling');
  c.reset(); assert.ok(c.update(true, T, 25, 30, 710000).peltier > 0);
  const d = new Cooler(); d.update(true, T, 25, 30, 0);
  assert.equal(d.update(true, T, 20, 30, 600000).reason, 'none');
});
test('fan runs on for 30 s after the Peltier stops', () => {
  const c = new Cooler(); c.update(true, T, 25, 30, 0); c.update(true, T, 9, 30, 40000);
  assert.equal(c.update(true, T, 9, 30, 50000).fan, 40);
  assert.equal(c.update(true, T, 9, 30, 80000).fan, 0);
});

// closed loop: controller + thermal model, read every 10 s like the board
function run(minutes, { target = 12, ambient = 28, doorAt = null, doorFor = 30, blockFan = false } = {}) {
  const s = newState(ambient), c = new Cooler();
  let out = { peltier: 0, fan: 0, reason: 'off' }, maxHot = 0;
  const log = [];
  for (let t = 0; t < minutes * 60; t++) {
    const door = doorAt !== null && t >= doorAt && t < doorAt + doorFor;
    stepThermal(s, out.peltier, out.fan, door, ambient, 1, blockFan);
    maxHot = Math.max(maxHot, s.hot);
    if (t % 10 === 0) out = c.update(true, target, s.inside, s.hot, t * 1000);
    log.push({ t, inside: s.inside, hot: s.hot, reason: out.reason });
  }
  return { s, out, maxHot, log };
}
test('closed loop: reaches the target in a plausible time and holds it', () => {
  const r = run(40);
  const reach = r.log.find((p) => p.inside <= 12.5);
  assert.ok(reach && reach.t < 30 * 60, 'reaches 12.5 C within 30 min');
  assert.ok(Math.abs(r.s.inside - 12) < 1.5, `holds near 12 C, got ${r.s.inside.toFixed(1)}`);
  assert.ok(r.maxHot < 65, 'hot side stays under the cut-off');
  console.log(`# reached 12.5 C after ${(reach.t / 60).toFixed(1)} min, hot side peak ${r.maxHot.toFixed(0)} C`);
});
test('closed loop: an open door lets the box warm, then it recovers', () => {
  const r = run(40, { doorAt: 25 * 60 });
  const before = r.log[25 * 60 - 1].inside;
  const peak = Math.max(...r.log.slice(25 * 60).map((p) => p.inside));
  assert.ok(peak - before > 1, `rise ${(peak - before).toFixed(1)} C`);
  assert.ok(r.s.inside < 13.5, 'back near target');
  console.log(`# door open 30 s: ${before.toFixed(1)} -> ${peak.toFixed(1)} C, end ${r.s.inside.toFixed(1)} C`);
});
test('closed loop: a blocked fan trips the overheat cut-off', () => {
  const r = run(30, { blockFan: true });
  assert.ok(r.log.some((p) => p.reason === 'overheat'));
  assert.ok(r.maxHot < 80, `hot side peaked at ${r.maxHot.toFixed(0)} C`);
});
