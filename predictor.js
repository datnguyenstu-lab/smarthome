// AI Predictor: plain statistics on the last minutes of temperature readings. It runs in the page, so it needs no
// server and no model file. It only warns early; the board's fixed alert limit still decides the real alarm.
import { t } from './i18n.js';

const WINDOW_S = 900;      // keep the last 15 minutes
const MIN_SAMPLES = 5;     // below this, or under a minute of data, the predictor is still learning
const MIN_SPAN_S = 60;
const WARM_SLOPE = 0.1;    // °C per minute that counts as warming
const WARM_RISE = 0.6;     // and the rise over the window must clear sensor noise
const JUMP_C = 1.5;        // a change this big between two readings is a jump, not a trend

export function addSample(samples, tSec, tempC, windowSec = WINDOW_S) {
  if (!Number.isFinite(tSec) || !Number.isFinite(tempC)) return samples;
  const last = samples[samples.length - 1];
  if (last && tSec <= last.t) return samples;   // duplicate or out of order
  return [...samples, { t: tSec, c: tempC }].filter((s) => tSec - s.t <= windowSec);
}

// Least-squares slope in °C per minute.
function slopePerMin(s) {
  const t0 = s[0].t;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of s) { const x = (p.t - t0) / 60; sx += x; sy += p.c; sxx += x * x; sxy += x * p.c; }
  const d = s.length * sxx - sx * sx;
  return d === 0 ? 0 : (s.length * sxy - sx * sy) / d;
}

export function analyze(samples, hotC) {
  if (samples.length < MIN_SAMPLES || samples[samples.length - 1].t - samples[0].t < MIN_SPAN_S) return { kind: 'learning' };
  const latest = samples[samples.length - 1].c;
  if (Number.isFinite(hotC) && latest >= hotC) return { kind: 'over', latest };
  const jump = latest - samples[samples.length - 2].c;
  if (Math.abs(jump) >= JUMP_C) return { kind: 'jump', latest, jump };
  const slope = slopePerMin(samples);
  const spanMin = (samples[samples.length - 1].t - samples[0].t) / 60;
  if (slope >= WARM_SLOPE && slope * spanMin >= WARM_RISE) {
    const minutesToLimit = Number.isFinite(hotC) ? (hotC - latest) / slope : undefined;
    return { kind: 'warming', latest, slope, minutesToLimit };
  }
  if (slope <= -WARM_SLOPE && -slope * spanMin >= WARM_RISE) return { kind: 'cooling', latest, slope };
  return { kind: 'steady', latest, slope };
}

export function describePrediction(a) {
  switch (a?.kind) {
    case 'over': return { level: 'warn', text: t('The temperature is above the alert limit.') };
    case 'jump': return { level: 'watch', text: t('Sudden change of {n}° between two readings. Check the door and the sensor.', { n: Math.abs(a.jump).toFixed(1) }) };
    case 'warming': {
      const rate = a.slope.toFixed(1);
      if (a.minutesToLimit !== undefined && a.minutesToLimit <= 60) {
        const min = Math.max(1, Math.round(a.minutesToLimit));
        return { level: min <= 10 ? 'warn' : 'watch', text: t('Warming {rate}° per minute. The alert limit is about {min} min away.', { rate, min }) };
      }
      return { level: 'watch', text: t('Slowly warming, {rate}° per minute.', { rate }) };
    }
    case 'cooling': return { level: 'ok', text: t('Cooling down, {rate}° per minute.', { rate: Math.abs(a.slope).toFixed(1) }) };
    case 'steady': return { level: 'ok', text: t('Stable. No problem expected.') };
    default: return { level: 'ok', text: t('Learning the normal pattern…') };
  }
}

// Min / max / average of the kept readings, for the assistant to answer "how was the last quarter hour".
export function recentStats(samples) {
  if (!samples.length) return null;
  const cs = samples.map((s) => s.c);
  const round = (n) => Math.round(n * 10) / 10;
  return { count: cs.length, minutes: Math.round((samples[samples.length - 1].t - samples[0].t) / 60),
    minC: round(Math.min(...cs)), maxC: round(Math.max(...cs)), avgC: round(cs.reduce((a, b) => a + b, 0) / cs.length) };
}

// Demo mode replays a "door left open" story: steady for 3 minutes, then warming 0.8° per minute. One step is
// 15 simulated seconds, so the whole story takes about a minute when a step is played each second. No randomness,
// so the same story plays every time.
export const DEMO_STEP_S = 15, DEMO_STEPS = 56;
const WIGGLE = [0, 0.05, -0.05, 0.04, -0.03, 0.02, -0.04, 0.03];
export function demoPoint(step, hotC) {
  const base = hotC - 8;
  const rising = Math.max(0, step - 12);
  return { t: step * DEMO_STEP_S, c: Math.round((base + WIGGLE[step % WIGGLE.length] + rising * 0.2) * 100) / 100, door: step >= 12 ? 'open' : 'closed' };
}
