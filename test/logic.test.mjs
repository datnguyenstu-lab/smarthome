import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBanner, ageText, onOff, describeIssues, isStale, guideState, validateSettings, settingsMessage, lastSeenText } from '../logic.js';

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
