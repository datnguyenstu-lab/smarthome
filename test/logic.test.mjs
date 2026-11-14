import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBanner, ageText, onOff, describeIssues, isStale, guideState, validateSettings, settingsMessage, lastSeenText, formatUptime, signalText, resetText, dialFraction, sameSettings, describeSelfTest, memoryText, describeVersions, formatBuild } from '../logic.js';

test('offline beats any alert', () => {
  assert.deepEqual(describeBanner({ alert: 'hot', status: 'offline' }), { level: 'error', text: 'Board offline' });
});
test('unknown status is treated as offline, never as live', () => {
  assert.equal(describeBanner({ alert: 'none', status: undefined }).level, 'error');
});
test('each alert has a level and text', () => {
  assert.deepEqual(describeBanner({ alert: 'hot', status: 'online' }), { level: 'warn', text: 'Room too hot' });
  assert.deepEqual(describeBanner({ alert: 'intruder', status: 'online' }), { level: 'error', text: 'Presence while Away is on' });
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

const KNOWN = ['temp_fault', 'ir_stuck', 'wifi_weak', 'wifi_unstable', 'low_memory', 'crash_reboot'];
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
test('isStale fresh health', () => assert.equal(isStale(1000, 900, 'online'), false));
test('isStale health older than 180 s', () => {
  assert.equal(isStale(1180, 1000, 'online'), false);
  assert.equal(isStale(1181, 1000, 'online'), true);
});
test('isStale missing ts', () => {
  assert.equal(isStale(1000, undefined, 'online'), true);
  assert.equal(isStale(1000, NaN, 'online'), true);
});
test('guideState hung when online but silent', () => assert.equal(guideState({ status: 'online', healthTs: 100, nowSec: 1000 }), 'hung'));
test('guideState ok', () => assert.equal(guideState({ status: 'online', healthTs: 990, nowSec: 1000 }), 'ok'));
test('guideState offline', () => {
  assert.equal(guideState({ status: 'offline', healthTs: 990, nowSec: 1000 }), 'offline');
  assert.equal(guideState({ status: undefined, healthTs: 990, nowSec: 1000 }), 'offline');
});
test('validateSettings accepts defaults', () => {
  const r = validateSettings({ hot_on_c: 35, presence_hold_s: 5, status_led: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { hot_on_c: 35, presence_hold_s: 5, status_led: true });
});
test('validateSettings rejects hot 10 and 70', () => {
  assert.equal(validateSettings({ hot_on_c: 10, presence_hold_s: 5, status_led: true }).ok, false);
  const r = validateSettings({ hot_on_c: 70, presence_hold_s: 5, status_led: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.hot_on_c);
});
test('validateSettings rejects hold 0 and 61', () => {
  assert.equal(validateSettings({ hot_on_c: 35, presence_hold_s: 0, status_led: true }).ok, false);
  assert.equal(validateSettings({ hot_on_c: 35, presence_hold_s: 61, status_led: true }).ok, false);
  assert.equal(validateSettings({ hot_on_c: 35, presence_hold_s: 5.5, status_led: true }).ok, false);
});
test('validateSettings accepts numeric strings', () => {
  const r = validateSettings({ hot_on_c: '38.5', presence_hold_s: '12', status_led: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { hot_on_c: 38.5, presence_hold_s: 12, status_led: false });
});
test('validateSettings rejects NaN and empty', () => {
  assert.equal(validateSettings({ hot_on_c: 'abc', presence_hold_s: 5, status_led: true }).ok, false);
  assert.equal(validateSettings({ hot_on_c: '', presence_hold_s: 5, status_led: true }).ok, false);
  assert.equal(validateSettings({ hot_on_c: 35, presence_hold_s: 5, status_led: 'yes' }).ok, false);
});
test('settingsMessage is valid JSON with the three keys', () => {
  const m = JSON.parse(settingsMessage({ hot_on_c: 36, presence_hold_s: 7, status_led: false }));
  assert.deepEqual(m, { hot_on_c: 36, presence_hold_s: 7, status_led: false });
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
test('dialFraction clamps to 0..1 over 20..60', () => {
  assert.equal(dialFraction(20), 0);
  assert.equal(dialFraction(40), 0.5);
  assert.equal(dialFraction(60), 1);
  assert.equal(dialFraction(10), 0);
  assert.equal(dialFraction(99), 1);
  assert.equal(dialFraction(NaN), 0);
  assert.equal(dialFraction(undefined), 0);
});
test('sameSettings compares the three values', () => {
  const a = { hot_on_c: 35, presence_hold_s: 5, status_led: true };
  assert.equal(sameSettings(a, { ...a, hot_on_c: 35.04 }), true);
  assert.equal(sameSettings(a, { ...a, hot_on_c: 36 }), false);
  assert.equal(sameSettings(a, { ...a, presence_hold_s: 6 }), false);
  assert.equal(sameSettings(a, { ...a, status_led: false }), false);
  assert.equal(sameSettings(a, undefined), false);
});
test('describeSelfTest', () => {
  assert.deepEqual(describeSelfTest({ checks: [{ name: 'temp', ok: true }, { name: 'wifi', ok: true }] }), { ok: true, failed: [], text: 'All checks passed' });
  const r = describeSelfTest({ checks: [{ name: 'temp', ok: false }, { name: 'ir', ok: true }, { name: 'cloud', ok: false }] });
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
