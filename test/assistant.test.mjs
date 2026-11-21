import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYesNo, routeRule, answerFor, speakable, systemPrompt, validateAction, describeAction, createAssistant, TOOLS } from '../assistant.js';
import { setLang } from '../i18n.js';

test.beforeEach(() => setLang('en'));
const SNAP = { online: true, tempC: -18.5, hotC: -10, door: 'closed', lights: { main: true, secondary: false }, away: false, alert: 'none', issues: [],
  prediction: { kind: 'steady', slope: 0 }, recent: { count: 20, minutes: 5, minC: -18.6, maxC: -18.4, avgC: -18.5 } };

test('yes and no, in English and Vietnamese', () => {
  for (const s of ['yes', 'Yeah, do it', 'OK', 'có', 'Đồng ý', 'xác nhận', 'vâng']) assert.equal(parseYesNo(s), 'yes', s);
  for (const s of ['no', 'cancel', 'không', 'thôi', 'hủy', "don't"]) assert.equal(parseYesNo(s), 'no', s);
  for (const s of ['', 'maybe later', 'what is the temperature', 'x'.repeat(60) + ' yes']) assert.equal(parseYesNo(s), null, s);
});

test('rules understand lights, lock-up and questions in both languages', () => {
  const r = (s) => routeRule(s);
  assert.deepEqual(r('Bật đèn kho chính'), { name: 'set_light', args: { light: 'main', on: true } });
  assert.deepEqual(r('tắt đèn kho phụ'), { name: 'set_light', args: { light: 'secondary', on: false } });
  assert.deepEqual(r('turn off the main light'), { name: 'set_light', args: { light: 'main', on: false } });
  assert.deepEqual(r('switch on light 2'), { name: 'set_light', args: { light: 'secondary', on: true } });
  assert.deepEqual(r('turn off the lights'), { name: 'set_light', args: { light: 'both', on: false } });
  assert.deepEqual(r('khóa kho'), { name: 'set_lock', args: { on: true } });
  assert.deepEqual(r('mở khóa kho'), { name: 'set_lock', args: { on: false } });
  assert.deepEqual(r('unlock the storage'), { name: 'set_lock', args: { on: false } });
  assert.deepEqual(r('Nhiệt độ bao nhiêu?'), { name: 'get_status', args: { focus: 'temp' } });
  assert.deepEqual(r('is the door open'), { name: 'get_status', args: { focus: 'door' } });
  assert.deepEqual(r('Tình trạng kho thế nào?'), { name: 'get_status', args: { focus: 'all' } });
  assert.deepEqual(r('will it get too warm?'), { name: 'get_status', args: { focus: 'prediction' } });
  assert.equal(r('tell me a joke'), null);
  assert.equal(r('the light is nice'), null);   // a light word with no on/off is not a command
});

test('validateAction only accepts the two known tools with sane arguments', () => {
  assert.deepEqual(validateAction('set_light', { light: 'main', on: false, extra: 1 }), { name: 'set_light', args: { light: 'main', on: false } });
  assert.equal(validateAction('set_light', { light: 'garage', on: true }), null);
  assert.equal(validateAction('set_light', { light: 'main', on: 'yes' }), null);
  assert.equal(validateAction('set_lock', {}), null);
  assert.equal(validateAction('set_settings', { hot_on_c: 50 }), null);
  assert.equal(validateAction('set_light', null), null);
  assert.deepEqual(TOOLS.map((x) => x.function.name), ['set_light', 'set_lock']);   // nothing that edits limits or settings
});

test('answers come from the snapshot', () => {
  assert.equal(answerFor('temp', SNAP), 'The temperature is -18.5 degrees.');
  assert.equal(answerFor('door', SNAP), 'The door is closed.');
  const all = answerFor('all', SNAP);
  assert.match(all, /The temperature is -18\.5 degrees\. The door is closed\. The main light is on, the secondary light is off\. Lock-up mode is off\. All checks are fine\./);
  const warm = { ...SNAP, prediction: { kind: 'warming', slope: 0.6, minutesToLimit: 8 }, alert: 'hot', issues: ['wifi_weak'] };
  assert.match(answerFor('all', warm), /Storage too warm\./);
  assert.match(answerFor('all', warm), /1 problem found\./);
  assert.match(answerFor('temp', warm), /Warming 0\.6° per minute\. The alert limit is about 8 min away\./);
  assert.match(answerFor('all', { ...SNAP, online: false }), /offline/);
  assert.match(answerFor('temp', { ...SNAP, tempC: null }), /don't have a temperature/);
});

test('answers change in Vietnamese', () => {
  setLang('vi');
  assert.equal(answerFor('temp', SNAP), 'Nhiệt độ hiện tại là -18.5 độ.');
  assert.match(answerFor('all', SNAP), /Đèn kho chính đang bật/);
  assert.equal(describeAction({ name: 'set_light', args: { light: 'main', on: false } }), 'Tắt đèn Kho chính');
});

test('speakable spells out minus and degrees', () => {
  assert.equal(speakable('The temperature is -18.5 degrees.'), 'The temperature is minus 18.5 degrees.');
  assert.equal(speakable('Warming 0.6° per minute.'), 'Warming 0.6 degrees per minute.');
  setLang('vi');
  assert.equal(speakable('Nhiệt độ -5 độ'), 'Nhiệt độ âm 5 độ');
});

test('the prompt holds the status, the language and the limits of the assistant', () => {
  const p = systemPrompt(SNAP, 'vi');
  assert.match(p, /Reply in Vietnamese/);
  assert.match(p, /"temperature_c":-18\.5/);
  assert.match(p, /cannot change alert limits or settings/);
  assert.match(systemPrompt(SNAP, 'en'), /Reply in English/);
});

function make({ llm } = {}) {
  const calls = [];
  const a = createAssistant({ snapshot: () => SNAP, act: async (name, args) => { calls.push([name, args]); return { ok: true }; }, llm });
  return { a, calls };
}

test('a light command waits for yes, then acts once', async () => {
  const { a, calls } = make();
  const r = await a.handle('turn off the main light');
  assert.equal(r.reply, 'Turn off the Main storage light? Say yes to confirm, or no to cancel.');
  assert.equal(r.pending, true);
  assert.deepEqual(calls, []);
  const done = await a.handle('yes');
  assert.equal(done.reply, 'Done: Turn off the Main storage light.');
  assert.deepEqual(calls, [['set_light', { light: 'main', on: false }]]);
  assert.equal(a.hasPending(), false);
  assert.match((await a.handle('yes')).reply, /Sorry/);   // a second yes does nothing
  assert.equal(calls.length, 1);
});

test('no cancels, and an unrelated question drops the waiting action', async () => {
  const { a, calls } = make();
  await a.handle('khóa kho');
  assert.equal((await a.handle('không')).reply, 'Cancelled. I changed nothing.');
  await a.handle('khóa kho');
  const r = await a.handle('what is the temperature');
  assert.equal(r.reply, 'The temperature is -18.5 degrees.');
  assert.equal(a.hasPending(), false);
  assert.deepEqual(calls, []);
});

test('a failed action is reported and changes nothing', async () => {
  for (const [reason, re] of [['fingerprint', /fingerprint/], ['offline', /offline/], ['other', /did not work/]]) {
    const a = createAssistant({ snapshot: () => SNAP, act: async () => ({ ok: false, reason }) });
    await a.handle('lock');
    assert.match((await a.handle('yes')).reply, re);
  }
});

test('with an LLM: plain answers pass through, and the system prompt and history are sent', async () => {
  const seen = [];
  const { a } = make({ llm: async (messages) => { seen.push(messages); return { content: 'All good, minus 18.5 degrees.' }; } });
  const r = await a.handle('how is it going?');
  assert.deepEqual([r.reply, r.via], ['All good, minus 18.5 degrees.', 'llm']);
  assert.equal(seen[0][0].role, 'system');
  assert.equal(seen[0].at(-1).content, 'how is it going?');
  await a.handle('and now?');
  assert.ok(seen[1].some((m) => m.role === 'assistant' && m.content === 'All good, minus 18.5 degrees.'));
});

test('with an LLM: a tool call becomes our own confirmation, never an action', async () => {
  const llm = async (messages) => messages.some((m) => m.role === 'tool')
    ? { content: 'Done! I switched it off.' }   // the model claims success; the app must not repeat that
    : { content: null, tool_calls: [{ id: 'c1', function: { name: 'set_light', arguments: '{"light":"secondary","on":true}' } }] };
  const { a, calls } = make({ llm });
  const r = await a.handle('light the back room');
  assert.equal(r.reply, 'Turn on the Secondary storage light? Say yes to confirm, or no to cancel.');
  assert.deepEqual(calls, []);
  await a.handle('yes');
  assert.deepEqual(calls, [['set_light', { light: 'secondary', on: true }]]);
});

test('with an LLM: invalid tool arguments are refused', async () => {
  let round = 0;
  const llm = async (messages) => (round++ === 0
    ? { content: '', tool_calls: [{ id: 'c1', function: { name: 'set_light', arguments: '{"light":"garage","on":true}' } }, { id: 'c2', function: { name: 'set_settings', arguments: 'not json' } }] }
    : { content: 'I cannot do that.', _tool: messages.filter((m) => m.role === 'tool').map((m) => m.content) });
  const { a, calls } = make({ llm });
  const r = await a.handle('open the garage');
  assert.equal(r.reply, 'I cannot do that.');
  assert.equal(r.pending, false);
  assert.deepEqual(calls, []);
});

test('if the LLM fails, the rules take over and the result says so', async () => {
  const { a } = make({ llm: async () => { throw new Error('network'); } });
  const r = await a.handle('nhiệt độ bao nhiêu');
  assert.deepEqual([r.reply, r.via, r.degraded], ['The temperature is -18.5 degrees.', 'rules', true]);
  const bad = make({ llm: async () => ({ content: '' }) });
  assert.equal((await bad.a.handle('door?')).via, 'rules');
});

test('an LLM that keeps calling tools without a confirmation ends in the rules, not a loop', async () => {
  let n = 0;
  const { a } = make({ llm: async () => { n++; return { content: '', tool_calls: [{ id: 'x', function: { name: 'nothing', arguments: '{}' } }] }; } });
  const r = await a.handle('the door');
  assert.equal(n, 3);
  assert.equal(r.via, 'rules');
});

test('empty speech does nothing', async () => {
  const { a, calls } = make();
  assert.equal((await a.handle('   ')).reply, '');
  assert.deepEqual(calls, []);
});

test('demo mode: answers say the readings are simulated, and actions are refused', async () => {
  const demoSnap = { ...SNAP, demo: true };
  assert.match(answerFor('all', demoSnap), /These are simulated demo readings\.$/);
  assert.doesNotMatch(answerFor('all', SNAP), /simulated/);
  assert.match(systemPrompt(demoSnap), /"demo_mode_simulated_readings":true/);
  const a = createAssistant({ snapshot: () => demoSnap, act: async () => ({ ok: false, reason: 'demo' }) });
  await a.handle('turn off the main light');
  assert.match((await a.handle('yes')).reply, /Demo mode is on, so I changed nothing on the board\./);
  setLang('vi');
  assert.match(answerFor('all', demoSnap), /mô phỏng/);
});
