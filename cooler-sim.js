// Browser twin of lib/logic/cooler.* (same constants and rules) plus a rough thermal model of the demo box, for the
// simulator page (sim.html). The model parameters are ESTIMATES from datasheet-typical values, not measurements.
export const CFG = { hystC: 0.5, maxPct: 85, minOnMs: 30000, minOffMs: 30000, runOnMs: 30000, noCoolingMs: 600000,
  noCoolingDropC: 0.5, hotCutC: 65, hotResumeC: 50, hotFanFullC: 55 };

export class Cooler {
  constructor(cfg = CFG) {
    this.c = cfg; this.on = false; this.changed = false; this.overheated = false; this.noCool = false;
    this.everOn = false; this.lastChange = 0; this.offAt = 0; this.onStart = 0; this.onStartInside = 0;
  }
  turnOff(now, safety) { if (this.on) { this.offAt = now; this.on = false; } this.changed = !safety; this.lastChange = now; }
  reset() { this.noCool = false; this.changed = false; }
  out(pelt, reason, hot, now) {
    let fan = 0;
    if (pelt > 0) fan = pelt > 60 ? 100 : 70; else if (this.everOn && now - this.offAt < this.c.runOnMs) fan = 40;
    if (reason === 'hot_sensor' || reason === 'overheat') fan = 100;
    if (Number.isFinite(hot) && hot >= this.c.hotFanFullC) fan = 100;
    return { peltier: pelt, fan, reason };
  }
  update(enabled, target, inside, hot, now) {
    const c = this.c;
    if (Number.isFinite(hot)) { if (hot >= c.hotCutC) this.overheated = true; else if (hot <= c.hotResumeC) this.overheated = false; }
    if (!enabled) { if (this.on) this.turnOff(now, true); this.noCool = false; return this.out(0, 'off', hot, now); }
    if (!Number.isFinite(inside)) { if (this.on) this.turnOff(now, true); return this.out(0, 'inside_sensor', hot, now); }
    if (!Number.isFinite(hot)) { if (this.on) this.turnOff(now, true); return this.out(0, 'hot_sensor', hot, now); }
    if (this.overheated) { if (this.on) this.turnOff(now, true); return this.out(0, 'overheat', hot, now); }
    if (this.on && now - this.onStart >= c.noCoolingMs) {
      if (this.onStartInside - inside < c.noCoolingDropC) this.noCool = true;
      else { this.onStart = now; this.onStartInside = inside; }
    }
    if (this.noCool) { if (this.on) this.turnOff(now, true); return this.out(0, 'no_cooling', hot, now); }
    let want = this.on;
    if (inside > target + c.hystC) want = true; else if (inside < target - c.hystC) want = false;
    if (want !== this.on && this.changed && now - this.lastChange < (this.on ? c.minOnMs : c.minOffMs)) want = this.on;
    if (want && !this.on) { this.on = true; this.everOn = true; this.changed = true; this.lastChange = now; this.onStart = now; this.onStartInside = inside; }
    else if (!want && this.on) this.turnOff(now, false);
    let pelt = 0;
    if (this.on) pelt = Math.trunc(Math.min(c.maxPct, Math.max(40, 40 + 15 * (inside - target))));
    return this.out(pelt, 'none', hot, now);
  }
}

// Thermal model. Inside: C dT/dt = leak - Qcold. Peltier: Qcold = duty*50 W*(1 - dT/66 K); electrical heat 56 W at full duty (x duty).
// Hot block: T = ambient + heat * R, R = 0.4 K/W with the fan, 2 K/W with no airflow. All of it rough.
export const MODEL = { Cin: 700, UAclosed: 0.35, UAopen: 3.0, Qmax: 50, dTmax: 66, Pfull: 56, Chot: 150, Rfan: 0.4, Rnone: 2.0 };

export function newState(ambient) { return { inside: ambient, hot: ambient, ambient }; }

export function stepThermal(s, peltierPct, fanPct, doorOpen, ambient, dt, fanBlocked = false, M = MODEL) {
  const duty = peltierPct / 100;
  const dT = Math.max(0, s.hot - s.inside);
  const Qc = duty * M.Qmax * Math.max(0, 1 - dT / M.dTmax);
  const Qh = Qc + duty * M.Pfull;
  const airflow = fanBlocked ? 0 : fanPct / 100;
  const R = M.Rnone + (M.Rfan - M.Rnone) * Math.sqrt(airflow);
  const hotSteady = ambient + Qh * R;
  s.hot += (hotSteady - s.hot) * Math.min(1, dt / (M.Chot * R));
  const leak = (doorOpen ? M.UAopen : M.UAclosed) * (ambient - s.inside);
  s.inside += ((leak - Qc) / M.Cin) * dt;
  s.ambient = ambient;
  return s;
}
