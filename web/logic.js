// Pure helpers for the page; no DOM, no MQTT, so they can be tested with `node --test`.

const ALERTS = {
  hot: { level: 'warn', text: 'Room too hot' },
  intruder: { level: 'error', text: 'Presence while Away is on' },
  temp_fault: { level: 'warn', text: 'Temperature sensor not responding' },
};

export function describeBanner({ alert, status }) {
  if (status !== 'online') return { level: 'error', text: 'Board offline' };
  if (!alert || alert === 'none') return { level: 'ok', text: '' };
  return ALERTS[alert] ?? { level: 'warn', text: `Alert: ${alert}` };
}

export function ageText(nowSec, thenSec) {
  if (typeof thenSec !== 'number' || Number.isNaN(thenSec)) return '';
  const d = nowSec - thenSec;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return `${Math.floor(d / 86400)} d ago`;
}

export function onOff(payload) {
  if (payload === 'on') return true;
  if (payload === 'off') return false;
  return null;
}

const ISSUES = {
  temp_fault: { level: 'warn', text: 'Temperature sensor not responding', fix: 'Check the sensor wire on D2 and that it has 3.3 V and GND.' },
  ir_stuck: { level: 'warn', text: 'Presence sensor has been on for 30 minutes', fix: 'Something may be blocking the IR sensor, or it needs re-aiming.' },
  wifi_weak: { level: 'warn', text: 'Wi-Fi signal is weak', fix: 'Move the board or the router closer together.' },
  wifi_unstable: { level: 'warn', text: 'Connection keeps dropping', fix: 'Check the router, and move the board closer to it.' },
  low_memory: { level: 'warn', text: 'Board is low on memory', fix: 'Restart the board. If it comes back, tell the person who maintains it.' },
  crash_reboot: { level: 'warn', text: 'Board restarted after a crash', fix: 'It recovered on its own. If it repeats, check the power supply.' },
};

export function describeIssues(codes) {
  return (codes ?? []).map((code) => ({
    code,
    ...(ISSUES[code] ?? { level: 'warn', text: `Problem reported: ${code}`, fix: 'Run the self-test for details.' }),
  }));
}

const STALE_AFTER_S = 180;

// True when the board cannot be trusted to be alive: offline, or no health heartbeat for 3 minutes.
// Uses the heartbeat's own timestamp, so an old retained message from hours ago counts as stale.
export function isStale(nowSec, healthTs, status) {
  if (status !== 'online') return true;
  if (typeof healthTs !== 'number' || Number.isNaN(healthTs)) return true;
  return nowSec - healthTs > STALE_AFTER_S;
}

export function guideState({ status, healthTs, nowSec }) {
  if (status !== 'online') return 'offline';
  return isStale(nowSec, healthTs, status) ? 'hung' : 'ok';
}

function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

export function validateSettings({ hot_on_c, presence_hold_s, status_led } = {}) {
  const errors = {};
  const hot = num(hot_on_c);
  const hold = num(presence_hold_s);
  if (!Number.isFinite(hot) || hot < 20 || hot > 60) errors.hot_on_c = 'Enter a temperature from 20 to 60 °C.';
  if (!Number.isInteger(hold) || hold < 1 || hold > 60) errors.presence_hold_s = 'Enter whole seconds from 1 to 60.';
  if (typeof status_led !== 'boolean') errors.status_led = 'Choose on or off.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, errors, value: { hot_on_c: hot, presence_hold_s: hold, status_led } };
}

export function settingsMessage({ hot_on_c, presence_hold_s, status_led }) {
  return JSON.stringify({ hot_on_c, presence_hold_s, status_led });
}

export function lastSeenText(nowSec, thenSec) {
  const a = ageText(nowSec, thenSec);
  return a ? `last seen ${a}` : 'not seen yet';
}
