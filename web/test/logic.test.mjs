import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBanner, ageText, onOff } from '../logic.js';

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
