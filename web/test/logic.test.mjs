import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBanner, ageText, onOff, describeDoor, doorRowState, describeConnectError, connectErrorText, describeIssues, isStale, guideState, validateSettings, settingsMessage, lastSeenText, formatUptime, signalText, resetText, dialFraction, sameSettings, describeSelfTest, memoryText, describeVersions, formatBuild, describeAbout } from '../logic.js';

test('offline beats any alert', () => {
  assert.deepEqual(describeBanner({ alert: 'hot', status: 'offline' }), { level: 'error', text: 'Board offline' });
});
test('unknown status is treated as offline, never as live', () => {
  assert.equal(describeBanner({ alert: 'none', status: undefined }).level, 'error');
});
test('each alert has a level and text', () => {
  assert.deepEqual(describeBanner({ alert: 'hot', status: 'online' }), { level: 'warn', text: 'Storage too warm' });
  assert.deepEqual(describeBanner({ alert: 'intruder', status: 'online' }), { level: 'error', text: 'Door opened while locked up' });
  assert.deepEqual(describeBanner({ alert: 'door_open', status: 'online' }), { level: 'error', text: 'Door open too long' });
  assert.deepEqual(describeBanner({ alert: 'temp_fault', status: 'online' }), { level: 'warn', text: 'Temperature sensor not responding' });
  assert.deepEqual(describeBanner({ alert: 'none', status: 'online' }), { level: 'ok', text: '' });
});
test('an unrecognised alert is shown as a warning, not hidden', () => {
  assert.equal(describeBanner({ alert: 'surprise', status: 'online' }).level, 'warn');
});
test('ageText units and boundaries', () => {
  assert.equal(ageText(1000, 1000), 'just now');
  assert.equal(ageText(1059, 1000), 'just now');
  assert.equal(ageText(1300, 1000), '5 min ago');
  assert.equal(ageText(1000 + 3 * 3600, 1000), '3 h ago');
  assert.equal(ageText(1000 + 2 * 86400, 1000), '2 d ago');
});
test('ageText handles missing and future timestamps', () => {
  assert.equal(ageText(1000, undefined), '');
  assert.equal(ageText(1000, NaN), '');
  assert.equal(ageText(1000, 5000), 'just now');
});
test('onOff accepts only exact on/off', () => {
  assert.equal(onOff('on'), true);
  assert.equal(onOff('off'), false);
  assert.equal(onOff('ON'), null);
  assert.equal(onOff(''), null);
  assert.equal(onOff(undefined), null);
});

const KNOWN = ['temp_fault', 'door_open_long', 'wifi_weak', 'wifi_unstable', 'low_memory', 'crash_reboot'];
test('describeIssues maps each known code with a fix', () => {
  const out = describeIssues(KNOWN);
  assert.equal(out.length, 6);
  out.forEach((o, i) => {
    assert.equal(o.code, KNOWN[i]);
    assert.ok(['warn', 'error'].includes(o.level));
    assert.ok(o.text.length > 5 && o.fix.length > 5);
  });
});
test('describeIssues unknown code is a warning', () => {
  const [o] = describeIssues(['mystery']);
  assert.equal(o.level, 'warn');
  assert.equal(o.code, 'mystery');
  assert.deepEqual(describeIssues([]), []);
  assert.deepEqual(describeIssues(undefined), []);
});
test('isStale offline', () => assert.equal(isStale(1000, 990, 'offline'), true));
test('isStale fresh health', () => assert.equal(isStale(1000, 960, 'online'), false));
test('isStale health older than 60 s (the board reports every 10 s)', () => {
  assert.equal(isStale(1060, 1000, 'online'), false);
  assert.equal(isStale(1061, 1000, 'online'), true);
});
test('isStale missing ts', () => {
  assert.equal(isStale(1000, undefined, 'online'), true);
  assert.equal(isStale(1000, NaN, 'online'), true);
});
test('guideState hung when online but silent', () => assert.equal(guideState({ status: 'online', healthTs: 100, nowSec: 1000 }), 'hung'));
test('guideState ok', () => assert.equal(guideState({ status: 'online', healthTs: 990, nowSec: 1000 }), 'ok'));
test('guideState uses the live arrival time, so a wrong phone clock cannot trigger it', () => {
  // the retained health message is hours old by the board's clock, but a live one just arrived
  assert.equal(guideState({ status: 'online', healthTs: 100, nowSec: 1000, liveAtSec: 995 }), 'ok');
});
test('guideState hung when the live heartbeat stopped', () => {
  assert.equal(guideState({ status: 'online', healthTs: 990, nowSec: 1000, liveAtSec: 900 }), 'hung');
  assert.equal(guideState({ status: 'online', healthTs: 990, nowSec: 1060, liveAtSec: 1000 }), 'ok');
  assert.equal(guideState({ status: 'online', healthTs: 990, nowSec: 1061, liveAtSec: 1000 }), 'hung');
});
test('guideState offline', () => {
  assert.equal(guideState({ status: 'offline', healthTs: 990, nowSec: 1000 }), 'offline');
  assert.equal(guideState({ status: undefined, healthTs: 990, nowSec: 1000 }), 'offline');
});
test('validateSettings accepts defaults', () => {
  const r = validateSettings({ hot_on_c: 33, door_open_s: 10, status_led: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { hot_on_c: 33, door_open_s: 10, status_led: true });
});
test('validateSettings warm threshold is -25 to 60', () => {
  for (const ok of [-25, -18, 0, 8, 33, 60]) assert.equal(validateSettings({ hot_on_c: ok, door_open_s: 10, status_led: true }).ok, true, String(ok));
  for (const bad of [-26, -30, 61, 100]) assert.equal(validateSettings({ hot_on_c: bad, door_open_s: 10, status_led: true }).ok, false, String(bad));
  assert.ok(validateSettings({ hot_on_c: 61, door_open_s: 10, status_led: true }).errors.hot_on_c);
});
test('validateSettings door time is whole seconds 0 to 600', () => {
  for (const ok of [0, 1, 10, 600]) assert.equal(validateSettings({ hot_on_c: 8, door_open_s: ok, status_led: true }).ok, true, String(ok));
  for (const bad of [-1, 601, 5.5]) assert.equal(validateSettings({ hot_on_c: 8, door_open_s: bad, status_led: true }).ok, false, String(bad));
  assert.ok(validateSettings({ hot_on_c: 8, door_open_s: 601, status_led: true }).errors.door_open_s);
});
test('validateSettings accepts numeric strings', () => {
  const r = validateSettings({ hot_on_c: '-18.5', door_open_s: '45', status_led: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { hot_on_c: -18.5, door_open_s: 45, status_led: false });
});
test('validateSettings rejects NaN and empty', () => {
  assert.equal(validateSettings({ hot_on_c: 'abc', door_open_s: 5, status_led: true }).ok, false);
  assert.equal(validateSettings({ hot_on_c: '', door_open_s: 5, status_led: true }).ok, false);
  assert.equal(validateSettings({ hot_on_c: 8, door_open_s: 5, status_led: 'yes' }).ok, false);
});
test('settingsMessage is valid JSON with the three keys', () => {
  const m = JSON.parse(settingsMessage({ hot_on_c: 6, door_open_s: 7, status_led: false }));
  assert.deepEqual(m, { hot_on_c: 6, door_open_s: 7, status_led: false });
});
test('lastSeenText', () => {
  assert.equal(lastSeenText(1300, 1000), 'last seen 5 min ago');
  assert.equal(lastSeenText(1300, undefined), 'not seen yet');
});

test('formatUptime units', () => {
  assert.equal(formatUptime(30), 'just started');
  assert.equal(formatUptime(90), '1 min');
  assert.equal(formatUptime(3600), '1 hour');
  assert.equal(formatUptime(7300), '2 hours');
  assert.equal(formatUptime(86400), '1 day');
  assert.equal(formatUptime(259200), '3 days');
  assert.equal(formatUptime(undefined), '');
  assert.equal(formatUptime(-5), '');
});
test('signalText bands', () => {
  assert.equal(signalText(-45), 'Strong');
  assert.equal(signalText(-55), 'Strong');
  assert.equal(signalText(-60), 'Good');
  assert.equal(signalText(-75), 'Fair');
  assert.equal(signalText(-80), 'Fair');
  assert.equal(signalText(-81), 'Weak');
  assert.equal(signalText(undefined), '--');
});
test('resetText names', () => {
  assert.equal(resetText('power'), 'Power on');
  assert.equal(resetText('external'), 'Reset button');
  assert.equal(resetText('soft'), 'Restarted by software');
  assert.equal(resetText('watchdog'), 'Crash recovery');
  assert.equal(resetText('exception'), 'Crash recovery');
  assert.equal(resetText('whatever'), 'Unknown');
});
test('dialFraction clamps to 0..1 over -30..60 (cold storage)', () => {
  assert.equal(dialFraction(-30), 0);
  assert.equal(dialFraction(15), 0.5);
  assert.equal(dialFraction(60), 1);
  assert.equal(dialFraction(-40), 0);
  assert.equal(dialFraction(99), 1);
  assert.ok(Math.abs(dialFraction(33) - 63 / 90) < 1e-9);
  assert.equal(dialFraction(NaN), 0);
  assert.equal(dialFraction(undefined), 0);
});
test('sameSettings compares the three values', () => {
  const a = { hot_on_c: 8, door_open_s: 10, status_led: true };
  assert.equal(sameSettings(a, { ...a, hot_on_c: 8.04 }), true);
  assert.equal(sameSettings(a, { ...a, hot_on_c: 9 }), false);
  assert.equal(sameSettings(a, { ...a, door_open_s: 11 }), false);
  assert.equal(sameSettings(a, { ...a, status_led: false }), false);
  assert.equal(sameSettings(a, undefined), false);
});
test('describeSelfTest', () => {
  assert.deepEqual(describeSelfTest({ checks: [{ name: 'temp', ok: true }, { name: 'wifi', ok: true }] }), { ok: true, failed: [], text: 'All checks passed' });
  const r = describeSelfTest({ checks: [{ name: 'temp', ok: false }, { name: 'door', ok: true }, { name: 'cloud', ok: false }] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.failed, ['temp', 'cloud']);
  assert.equal(r.text, 'Needs a look: temperature sensor, cloud link');
  assert.equal(describeSelfTest(undefined), null);
  assert.equal(describeSelfTest({}), null);
});
test('memoryText', () => {
  assert.equal(memoryText(14624), '14 KB');
  assert.equal(memoryText(undefined), '');
});

test('describeVersions same release is ok', () => {
  assert.deepEqual(describeVersions('2.0.0', '2.0.0'), { level: 'ok', text: 'The page and the board are on the same release.' });
  assert.equal(describeVersions('2.0.3', '2.0.0').level, 'ok');            // patch differences are compatible
  assert.equal(describeVersions('2.0.0', '2.0.0-demo').level, 'ok');       // a suffix is ignored
});
test('describeVersions older and newer board', () => {
  const older = describeVersions('2.1.0', '2.0.0');
  assert.equal(older.level, 'warn');
  assert.match(older.text, /older/);
  const newer = describeVersions('2.0.0', '2.1.0-demo');
  assert.equal(newer.level, 'warn');
  assert.match(newer.text, /newer/);
  assert.match(describeVersions('2.0.0', '1.9.0').text, /older/);
});
test('describeVersions unknown or malformed board version', () => {
  assert.equal(describeVersions('2.0.0', undefined).level, 'unknown');
  assert.equal(describeVersions('2.0.0', '').level, 'unknown');
  assert.equal(describeVersions('2.0.0', 'banana').level, 'unknown');
});
test('formatBuild keeps a build stamp and handles missing', () => {
  assert.equal(formatBuild('Nov 14 2026 22:41:05'), 'Nov 14 2026, 22:41');
  assert.equal(formatBuild(undefined), '--');
  assert.equal(formatBuild('weird'), 'weird');
});

test('describeAbout accepts the four fields and trims them', () => {
  assert.deepEqual(describeAbout({ name: '  Ann Lee ', student_id: '123', class: 'C1', year: '2026-2027' }),
    { name: 'Ann Lee', studentId: '123', className: 'C1', year: '2026-2027', supervisor: '' });
  assert.equal(describeAbout({ name: 'Ann', supervisor: '  Dr Smith ' }).supervisor, 'Dr Smith');
});
test('describeAbout keeps what is there and drops the rest', () => {
  assert.deepEqual(describeAbout({ name: 'Ann', extra: 'x', student_id: 42 }), { name: 'Ann', studentId: '', className: '', year: '', supervisor: '' });
});
test('describeAbout returns null when there is nothing to show', () => {
  assert.equal(describeAbout(undefined), null);
  assert.equal(describeAbout(null), null);
  assert.equal(describeAbout('text'), null);
  assert.equal(describeAbout([]), null);
  assert.equal(describeAbout({}), null);
  assert.equal(describeAbout({ name: '   ' }), null);
  assert.equal(describeAbout({ supervisor: 'Dr Smith' }).supervisor, 'Dr Smith');   // a supervisor alone is enough to show the section
});
test('describeAbout cuts very long values', () => {
  assert.equal(describeAbout({ name: 'x'.repeat(200) }).name.length, 60);
});

test('describeDoor open, closed and unknown', () => {
  assert.deepEqual(describeDoor('open', 700, 1000), { state: 'open', label: 'Door open', since: '5 min ago' });
  assert.deepEqual(describeDoor('closed', 990, 1000), { state: 'closed', label: 'Door closed', since: 'just now' });
  assert.deepEqual(describeDoor('closed', undefined, 1000), { state: 'closed', label: 'Door closed', since: '' });
  assert.deepEqual(describeDoor(undefined, 700, 1000), { state: 'unknown', label: 'Door --', since: '' });
  assert.deepEqual(describeDoor('banana', 700, 1000), { state: 'unknown', label: 'Door --', since: '' });
});

test('doorRowState: red only when the board raises the door or lock-up alert', () => {
  assert.equal(doorRowState({ online: true, door: 'open', alert: 'door_open' }), 'alarm');
  assert.equal(doorRowState({ online: true, door: 'open', alert: 'intruder' }), 'alarm');
});
test('doorRowState: an open door inside the grace time is only watched, not red', () => {
  assert.equal(doorRowState({ online: true, door: 'open', alert: 'none' }), 'watch');
  assert.equal(doorRowState({ online: true, door: 'open', alert: 'hot' }), 'watch');
});
test('doorRowState: closed, unknown or offline is plain', () => {
  assert.equal(doorRowState({ online: true, door: 'closed', alert: 'none' }), 'none');
  assert.equal(doorRowState({ online: true, door: 'closed', alert: 'door_open' }), 'none');   // stale alert while it closes
  assert.equal(doorRowState({ online: true, door: undefined, alert: 'none' }), 'none');
  assert.equal(doorRowState({ online: false, door: 'open', alert: 'door_open' }), 'none');
});

test('describeConnectError: wrong credentials are told apart from a network problem', () => {
  assert.equal(describeConnectError({ code: 4, message: 'Connection refused: Bad username or password' }), 'auth');
  assert.equal(describeConnectError({ code: 5 }), 'auth');
  assert.equal(describeConnectError({ code: 134 }), 'auth');
  assert.equal(describeConnectError({ code: 135 }), 'auth');
  assert.equal(describeConnectError({ message: 'Connection refused: Not authorized' }), 'auth');
  assert.equal(describeConnectError(new Error('Bad User Name or Password')), 'auth');
});
test('describeConnectError: anything else is the cloud or the internet', () => {
  assert.equal(describeConnectError(null), 'network');            // the library reports only a quiet close
  assert.equal(describeConnectError(undefined, true), 'network');
  assert.equal(describeConnectError({ message: 'getaddrinfo ENOTFOUND host' }), 'network');
  assert.equal(describeConnectError({ code: 'ECONNREFUSED' }), 'network');
});
test('describeConnectError: no internet on this device wins when it is not a credentials error', () => {
  assert.equal(describeConnectError(null, false), 'offline');
  assert.equal(describeConnectError({ message: 'timeout' }, false), 'offline');
  assert.equal(describeConnectError({ code: 4 }, false), 'auth');   // the broker answered, so we were online
});
test('connectErrorText gives a plain sentence for each case', () => {
  assert.equal(connectErrorText('auth'), 'Login failed. Check your username and password.');
  assert.match(connectErrorText('network'), /Can.t reach the cloud/);
  assert.match(connectErrorText('offline'), /No internet connection/);
  assert.match(connectErrorText('whatever'), /Login failed/);
});
