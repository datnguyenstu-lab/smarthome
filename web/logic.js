// Pure helpers for the page; no DOM, no MQTT, so they can be tested with `node --test`.
// Every text a person can read goes through t() (see i18n.js), so the page can show English or Vietnamese.
import { t } from './i18n.js';

const alerts = () => ({
  hot: { level: 'warn', text: t('Storage too warm') },
  intruder: { level: 'error', text: t('Door opened while locked up') },
  door_open: { level: 'error', text: t('Door open too long') },
  temp_fault: { level: 'warn', text: t('Temperature sensor not responding') },
});

export function describeBanner({ alert, status }) {
  if (status !== 'online') return { level: 'error', text: t('Board offline') };
  if (!alert || alert === 'none') return { level: 'ok', text: '' };
  return alerts()[alert] ?? { level: 'warn', text: t('Alert: {code}', { code: alert }) };
}

export function ageText(nowSec, thenSec) {
  if (typeof thenSec !== 'number' || Number.isNaN(thenSec)) return '';
  const d = nowSec - thenSec;
  if (d < 60) return t('just now');
  if (d < 3600) return t('{n} min ago', { n: Math.floor(d / 60) });
  if (d < 86400) return t('{n} h ago', { n: Math.floor(d / 3600) });
  return t('{n} d ago', { n: Math.floor(d / 86400) });
}

export function onOff(payload) {
  if (payload === 'on') return true;
  if (payload === 'off') return false;
  return null;
}

const issues = () => ({
  temp_fault: { level: 'warn', text: t('Temperature sensor not responding'), fix: t('Check the sensor wire on D2 and that it has 3.3 V and GND.') },
  door_open_long: { level: 'warn', text: t('The door has been open for 30 minutes'), fix: t('Close the door, or check the door sensor.') },
  wifi_weak: { level: 'warn', text: t('Wi-Fi signal is weak'), fix: t('Move the board or the router closer together.') },
  wifi_unstable: { level: 'warn', text: t('Connection keeps dropping'), fix: t('Check the router, and move the board closer to it.') },
  low_memory: { level: 'warn', text: t('Board is low on memory'), fix: t('Restart the board. If it comes back, tell the person who maintains it.') },
  crash_reboot: { level: 'warn', text: t('Board restarted after a crash'), fix: t('It recovered on its own. If it repeats, check the power supply.') },
});

export function describeIssues(codes) {
  const known = issues();
  return (codes ?? []).map((code) => ({
    code,
    ...(known[code] ?? { level: 'warn', text: t('Problem reported: {code}', { code }), fix: t('Run the self-test for details.') }),
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

// `liveAtSec` is when a non-retained health message last arrived at the page (the page's own clock, so a wrong
// phone clock cannot cause a false alarm). Before the first live message only the retained one's own timestamp
// is available, so that is used.
export function guideState({ status, healthTs, nowSec, liveAtSec }) {
  if (status !== 'online') return 'offline';
  if (typeof liveAtSec === 'number') return nowSec - liveAtSec > STALE_AFTER_S ? 'hung' : 'ok';
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
  if (!Number.isFinite(hot) || hot < -25 || hot > 60) errors.hot_on_c = t('Enter a temperature from -25 to 60 °C.');
  if (!Number.isInteger(door) || door < 0 || door > 600) errors.door_open_s = t('Enter whole seconds from 0 to 600.');
  if (typeof status_led !== 'boolean') errors.status_led = t('Choose on or off.');
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, errors, value: { hot_on_c: hot, door_open_s: door, status_led } };
}

export function settingsMessage({ hot_on_c, door_open_s, status_led }) {
  return JSON.stringify({ hot_on_c, door_open_s, status_led });
}

export function lastSeenText(nowSec, thenSec) {
  const a = ageText(nowSec, thenSec);
  return a ? t('last seen {ago}', { ago: a }) : t('not seen yet');
}

export function formatUptime(s) {
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) return '';
  if (s < 60) return t('just started');
  if (s < 3600) return t('{n} min', { n: Math.floor(s / 60) });
  if (s < 86400) { const h = Math.floor(s / 3600); return t(h === 1 ? '{n} hour' : '{n} hours', { n: h }); }
  const d = Math.floor(s / 86400);
  return t(d === 1 ? '{n} day' : '{n} days', { n: d });
}

export function signalText(rssi) {
  if (typeof rssi !== 'number' || !Number.isFinite(rssi)) return '--';
  if (rssi >= -55) return t('Strong');
  if (rssi >= -67) return t('Good');
  if (rssi >= -80) return t('Fair');
  return t('Weak');
}

const resets = () => ({ power: t('Power on'), external: t('Reset button'), soft: t('Restarted by software'), watchdog: t('Crash recovery'), soft_watchdog: t('Crash recovery'), exception: t('Crash recovery'), deep_sleep: t('Woke from sleep') });
export function resetText(reason) { return resets()[reason] ?? t('Unknown'); }

export function dialFraction(tempC, min = -30, max = 60) {
  const t = Number(tempC);
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, (t - min) / (max - min)));
}

export function sameSettings(a, b) {
  if (!a || !b) return false;
  return Math.abs(Number(a.hot_on_c) - Number(b.hot_on_c)) < 0.05 && Number(a.door_open_s) === Number(b.door_open_s) && a.status_led === b.status_led;
}

const checkNames = () => ({ temp: t('temperature sensor'), door: t('door sensor'), wifi: t('Wi-Fi'), cloud: t('cloud link') });
export function describeSelfTest(result) {
  if (!result || !Array.isArray(result.checks)) return null;
  const failed = result.checks.filter((c) => !c.ok).map((c) => c.name);
  if (!failed.length) return { ok: true, failed, text: t('All checks passed') };
  const names = checkNames();
  return { ok: false, failed, text: t('Needs a look: {list}', { list: failed.map((n) => names[n] ?? n).join(', ') }) };
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
  if (!p || !b) return { level: 'unknown', text: t('The board has not reported its firmware version yet.') };
  if (p[0] === b[0] && p[1] === b[1]) return { level: 'ok', text: t('The page and the board are on the same release.') };
  const boardOlder = b[0] < p[0] || (b[0] === p[0] && b[1] < p[1]);
  return boardOlder
    ? { level: 'warn', text: t('The board runs an older release than this page. Update the board firmware.') }
    : { level: 'warn', text: t('The board runs a newer release than this page. Reload the page to get the latest.') };
}

// "Nov 14 2026 22:41:05" (the compiler's __DATE__ __TIME__) -> "Nov 14 2026, 22:41"
export function formatBuild(stamp) {
  if (typeof stamp !== 'string' || !stamp) return '--';
  const m = /^(\w{3} +\d{1,2} \d{4}) (\d{2}:\d{2}):\d{2}$/.exec(stamp);
  return m ? `${m[1]}, ${m[2]}` : stamp;
}

// The About details (student name, id, class, year, supervisor) come from the retained smarthome/about message, so
// they are not in the public page source. Only the known text fields are kept, trimmed and cut to 60.
export function describeAbout(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const t = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');
  const out = { name: t(obj.name), studentId: t(obj.student_id), className: t(obj.class), year: t(obj.year), supervisor: t(obj.supervisor) };
  return out.name || out.studentId || out.className || out.year || out.supervisor ? out : null;
}

// The IR sensor is the door sensor. `door` is the retained "open" / "closed" message, `changedSec` the epoch
// seconds of the last change.
export function describeDoor(door, changedSec, nowSec) {
  if (door !== 'open' && door !== 'closed') return { state: 'unknown', label: t('Door --'), since: '' };
  return { state: door, label: door === 'open' ? t('Door open') : t('Door closed'), since: changedSec ? ageText(nowSec, changedSec) : '' };
}

// How the Door row looks: red ('alarm') only once the board itself raises the door or lock-up alert, which
// happens after the grace time; an open door before that is only 'watch' (outlined); everything else 'none'.
export function doorRowState({ online, door, alert }) {
  if (!online || door !== 'open') return 'none';
  return alert === 'door_open' || alert === 'intruder' ? 'alarm' : 'watch';
}

// Why a connection failed: the broker refused the login ('auth'), this device has no internet ('offline'), or the
// cloud could not be reached ('network'). The MQTT library reports a wrong password as an error with code 4
// (or 5, 134, 135) and a network failure only as a quiet close, so no error at all means 'network'.
export function describeConnectError(err, online = true) {
  const code = Number(err?.code);
  const msg = String(err?.message ?? '');
  if ([4, 5, 134, 135].includes(code) || /not authori[sz]ed|bad user|username or password|bad credentials/i.test(msg)) return 'auth';
  return online === false ? 'offline' : 'network';
}

export function connectErrorText(kind) {
  if (kind === 'network') return t("Can't reach the cloud. Check the internet connection and try again.");
  if (kind === 'offline') return t('No internet connection. Connect to the internet and try again.');
  return t('Login failed. Check your username and password.');
}
