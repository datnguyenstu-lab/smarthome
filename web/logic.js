// Pure helpers for the page; no DOM, no MQTT, so they can be tested with `node --test`.

const ALERTS = {
  hot: { level: 'warn', text: 'Storage too warm' },
  intruder: { level: 'error', text: 'Door opened while locked up' },
  door_open: { level: 'error', text: 'Door open too long' },
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
  door_open_long: { level: 'warn', text: 'The door has been open for 30 minutes', fix: 'Close the door, or check the door sensor.' },
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

const STALE_AFTER_S = 60;  // the board reports health every 10 s, so 6 missed reports

// True when the board cannot be trusted to be alive: offline, or no health heartbeat for 60 seconds.
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

export function validateSettings({ hot_on_c, door_open_s, status_led } = {}) {
  const errors = {};
  const hot = num(hot_on_c);
  const door = num(door_open_s);
  if (!Number.isFinite(hot) || hot < -25 || hot > 60) errors.hot_on_c = 'Enter a temperature from -25 to 60 °C.';
  if (!Number.isInteger(door) || door < 0 || door > 600) errors.door_open_s = 'Enter whole seconds from 0 to 600.';
  if (typeof status_led !== 'boolean') errors.status_led = 'Choose on or off.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, errors, value: { hot_on_c: hot, door_open_s: door, status_led } };
}

export function settingsMessage({ hot_on_c, door_open_s, status_led }) {
  return JSON.stringify({ hot_on_c, door_open_s, status_led });
}

export function lastSeenText(nowSec, thenSec) {
  const a = ageText(nowSec, thenSec);
  return a ? `last seen ${a}` : 'not seen yet';
}

export function formatUptime(s) {
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) return '';
  if (s < 60) return 'just started';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} ${h === 1 ? 'hour' : 'hours'}`; }
  const d = Math.floor(s / 86400);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

export function signalText(rssi) {
  if (typeof rssi !== 'number' || !Number.isFinite(rssi)) return '--';
  if (rssi >= -55) return 'Strong';
  if (rssi >= -67) return 'Good';
  if (rssi >= -80) return 'Fair';
  return 'Weak';
}

const RESETS = { power: 'Power on', external: 'Reset button', soft: 'Restarted by software', watchdog: 'Crash recovery', soft_watchdog: 'Crash recovery', exception: 'Crash recovery', deep_sleep: 'Woke from sleep' };
export function resetText(reason) { return RESETS[reason] ?? 'Unknown'; }

export function dialFraction(tempC, min = -30, max = 60) {
  const t = Number(tempC);
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, (t - min) / (max - min)));
}

export function sameSettings(a, b) {
  if (!a || !b) return false;
  return Math.abs(Number(a.hot_on_c) - Number(b.hot_on_c)) < 0.05 && Number(a.door_open_s) === Number(b.door_open_s) && a.status_led === b.status_led;
}

const CHECK_NAMES = { temp: 'temperature sensor', door: 'door sensor', wifi: 'Wi-Fi', cloud: 'cloud link' };
export function describeSelfTest(result) {
  if (!result || !Array.isArray(result.checks)) return null;
  const failed = result.checks.filter((c) => !c.ok).map((c) => c.name);
  if (!failed.length) return { ok: true, failed, text: 'All checks passed' };
  return { ok: false, failed, text: `Needs a look: ${failed.map((n) => CHECK_NAMES[n] ?? n).join(', ')}` };
}

export function memoryText(bytes) {
  return typeof bytes === 'number' && Number.isFinite(bytes) ? `${Math.round(bytes / 1024)} KB` : '';
}

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(typeof v === 'string' ? v : '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// Compares the page's version with the board firmware's. Only major.minor matter (patch and any "-demo"
// suffix are ignored): a different major.minor may mean the page and the board speak different messages.
export function describeVersions(pageVersion, boardVersion) {
  const p = parseVersion(pageVersion), b = parseVersion(boardVersion);
  if (!p || !b) return { level: 'unknown', text: 'The board has not reported its firmware version yet.' };
  if (p[0] === b[0] && p[1] === b[1]) return { level: 'ok', text: 'The page and the board are on the same release.' };
  const boardOlder = b[0] < p[0] || (b[0] === p[0] && b[1] < p[1]);
  return boardOlder
    ? { level: 'warn', text: 'The board runs an older release than this page. Update the board firmware.' }
    : { level: 'warn', text: 'The board runs a newer release than this page. Reload the page to get the latest.' };
}

// "Nov 14 2026 22:41:05" (the compiler's __DATE__ __TIME__) -> "Nov 14 2026, 22:41"
export function formatBuild(stamp) {
  if (typeof stamp !== 'string' || !stamp) return '--';
  const m = /^(\w{3} +\d{1,2} \d{4}) (\d{2}:\d{2}):\d{2}$/.exec(stamp);
  return m ? `${m[1]}, ${m[2]}` : stamp;
}

// The About details (student name, id, class, year) come from the retained smarthome/about message, so
// they are not in the public page source. Only the four known text fields are kept, trimmed and cut to 60.
export function describeAbout(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const t = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');
  const out = { name: t(obj.name), studentId: t(obj.student_id), className: t(obj.class), year: t(obj.year) };
  return out.name || out.studentId || out.className || out.year ? out : null;
}

// The IR sensor is the door sensor. `door` is the retained "open" / "closed" message, `changedSec` the epoch
// seconds of the last change.
export function describeDoor(door, changedSec, nowSec) {
  if (door !== 'open' && door !== 'closed') return { state: 'unknown', label: 'Door --', since: '' };
  return { state: door, label: door === 'open' ? 'Door open' : 'Door closed', since: changedSec ? ageText(nowSec, changedSec) : '' };
}
