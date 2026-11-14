import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { t, setLang, getLang, detectLang, VI } from '../i18n.js';
import { describeBanner, ageText, describeIssues, formatUptime, signalText, resetText, describeSelfTest, describeVersions, describeDoor, connectErrorText, validateSettings, lastSeenText } from '../logic.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const unquote = (q) => q.slice(1, -1).replace(/\\(['"`\\])/g, '$1');

test.beforeEach(() => setLang('en'));

test('t returns the English text unchanged, with {name} placeholders filled', () => {
  assert.equal(t('Settings'), 'Settings');
  assert.equal(t('{n} min ago', { n: 5 }), '5 min ago');
  assert.equal(t('missing {x}', {}), 'missing {x}');
});
test('t translates to Vietnamese and fills placeholders', () => {
  setLang('vi');
  assert.equal(t('Settings'), 'Cài đặt');
  assert.equal(t('{n} min ago', { n: 5 }), '5 phút trước');
  assert.equal(t('Main storage'), 'Kho chính');
  assert.equal(t('Secondary storage'), 'Kho phụ');
});
test('an untranslated text falls back to English', () => {
  setLang('vi');
  assert.equal(t('This sentence has no translation'), 'This sentence has no translation');
});
test('setLang accepts only en and vi', () => {
  assert.equal(setLang('vi'), 'vi');
  assert.equal(setLang('fr'), 'en');
  assert.equal(getLang(), 'en');
});
test('detectLang: a saved choice wins, otherwise the browser language', () => {
  assert.equal(detectLang('vi', 'en-US'), 'vi');
  assert.equal(detectLang('en', 'vi-VN'), 'en');
  assert.equal(detectLang(null, 'vi-VN'), 'vi');
  assert.equal(detectLang(undefined, 'vi'), 'vi');
  assert.equal(detectLang(null, 'en-GB'), 'en');
  assert.equal(detectLang('xx', 'fr-FR'), 'en');
  assert.equal(detectLang(null, undefined), 'en');
});
test('every Vietnamese entry is filled in and keeps the same {placeholders}', () => {
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [en, vi] of Object.entries(VI)) {
    assert.ok(vi.trim().length > 0, `empty translation for "${en}"`);
    assert.equal(ph(vi), ph(en), `placeholders differ for "${en}"`);
  }
});

test('coverage: every text the page can show has a Vietnamese translation', () => {
  const keys = new Set();
  // t('...') calls in the scripts
  for (const f of ['logic.js', 'app.js']) {
    for (const m of read(f).matchAll(/\bt\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) keys.add(unquote(m[1]));
  }
  // texts passed as plain strings and drawn through t() later: download notes, self-test notes, button labels, lights
  const app = read('app.js');
  const STR = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
  const patterns = [String.raw`\b(?:dlNote|dlFail)\(\s*` + STR, String.raw`\bselfNote = ` + STR, String.raw`\bdlLabel = ` + STR,
    String.raw`\bkey: ` + STR, String.raw`\b\d: ` + STR];
  for (const re of patterns) {
    for (const m of app.matchAll(new RegExp(re, 'g'))) keys.add(unquote(m[1]));
  }
  // data-i18n elements and attributes in the page
  const html = read('index.html');
  for (const m of html.matchAll(/<[a-z0-9]+[^>]*\bdata-i18n(?!-)[^>]*>([^<]*)</g)) { const s = m[1].replace(/\s+/g, ' ').trim(); if (s) keys.add(s); }
  for (const m of html.matchAll(/<[a-z0-9]+[^>]*\bdata-i18n-attr="([^"]+)"[^>]*>/g)) {
    for (const attr of m[1].split(',')) { const v = new RegExp(`\\b${attr.trim()}="([^"]*)"`).exec(m[0]); if (v) keys.add(v[1]); }
  }
  assert.ok(keys.size > 60, `expected many keys, found ${keys.size}`);
  const missing = [...keys].filter((k) => k && !(k in VI));   // '' only clears a note
  assert.deepEqual(missing, [], `no Vietnamese text for: ${missing.join(' | ')}`);
});

test('every logic.js text really changes in Vietnamese (alerts, issues, times, checks)', () => {
  const en = {
    banner: ['hot', 'intruder', 'door_open', 'temp_fault'].map((a) => describeBanner({ alert: a, status: 'online' }).text),
    issues: describeIssues(['temp_fault', 'door_open_long', 'wifi_weak', 'wifi_unstable', 'low_memory', 'crash_reboot']).flatMap((i) => [i.text, i.fix]),
    times: [ageText(100, 100), ageText(400, 100), ageText(100 + 7200, 100), ageText(100 + 3 * 86400, 100), formatUptime(30), formatUptime(300), formatUptime(7200), formatUptime(3 * 86400)],
    other: [signalText(-45), signalText(-85), resetText('power'), resetText('external'), resetText('exception'), connectErrorText('network'), connectErrorText('offline'),
      describeDoor('open', 0, 10).label, describeDoor('closed', 0, 10).label, describeSelfTest({ checks: [{ name: 'temp', ok: false }] }).text,
      describeVersions('2.0.0', '2.1.0').text, describeVersions('2.1.0', '2.0.0').text, validateSettings({ hot_on_c: 99, door_open_s: 700, status_led: 1 }).errors.hot_on_c],
  };
  setLang('vi');
  const vi = {
    banner: ['hot', 'intruder', 'door_open', 'temp_fault'].map((a) => describeBanner({ alert: a, status: 'online' }).text),
    issues: describeIssues(['temp_fault', 'door_open_long', 'wifi_weak', 'wifi_unstable', 'low_memory', 'crash_reboot']).flatMap((i) => [i.text, i.fix]),
    times: [ageText(100, 100), ageText(400, 100), ageText(100 + 7200, 100), ageText(100 + 3 * 86400, 100), formatUptime(30), formatUptime(300), formatUptime(7200), formatUptime(3 * 86400)],
    other: [signalText(-45), signalText(-85), resetText('power'), resetText('external'), resetText('exception'), connectErrorText('network'), connectErrorText('offline'),
      describeDoor('open', 0, 10).label, describeDoor('closed', 0, 10).label, describeSelfTest({ checks: [{ name: 'temp', ok: false }] }).text,
      describeVersions('2.0.0', '2.1.0').text, describeVersions('2.1.0', '2.0.0').text, validateSettings({ hot_on_c: 99, door_open_s: 700, status_led: 1 }).errors.hot_on_c],
  };
  for (const group of Object.keys(en)) en[group].forEach((e, i) => assert.notEqual(vi[group][i], e, `${group}[${i}] "${e}" was not translated`));
  assert.equal(vi.times[1], '5 phút trước');
  assert.equal(vi.times[3], '3 ngày trước');
  assert.equal(vi.times[7], '3 ngày');
  assert.equal(lastSeenText(400, 100), 'thấy lần cuối 5 phút trước');
});
