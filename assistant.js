// The voice assistant's brain, with no DOM and no network of its own: the page passes in how to read the storage
// (`snapshot`), how to act on it (`act`) and, optionally, how to reach the language model (`llm`). The LLM can only
// propose a light or lock-up change; the person always has to confirm it, and the rules below work with no LLM at all.
import { t, getLang } from './i18n.js';
import { describePrediction } from './predictor.js';
import { describeBanner, describeIssues } from './logic.js';

export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

export function parseYesNo(text) {
  const s = norm(text).trim();
  if (!s || s.length > 40) return null;
  if (/\b(no|nope|cancel|stop|never ?mind|don'?t|khong|thoi|huy|dung)\b/.test(s)) return 'no';
  if (/\b(yes|yeah|yep|ok|okay|sure|confirm|do it|go ahead|please do|co|dong y|xac nhan|duoc|vang|oke)\b/.test(s)) return 'yes';
  return null;
}

// "Bye", "hang up", "tạm biệt": a short sentence that ends the call.
export function isGoodbye(text) {
  const s = norm(text).trim();
  return s.length <= 30 && /\b(goodbye|bye|hang up|end the call|end call|tam biet|ket thuc|cup may|thoi nhe)\b/.test(s);
}

// ---- What the assistant may do ----
export const TOOLS = [
  { type: 'function', function: { name: 'set_light', description: 'Turn a storage light on or off.',
    parameters: { type: 'object', properties: { light: { type: 'string', enum: ['main', 'secondary', 'both'] }, on: { type: 'boolean' } }, required: ['light', 'on'] } } },
  { type: 'function', function: { name: 'set_lock', description: 'Turn lock-up mode (the door alarm) on or off.',
    parameters: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] } } },
];

export function validateAction(name, args) {
  const a = args && typeof args === 'object' ? args : {};
  if (name === 'set_light' && ['main', 'secondary', 'both'].includes(a.light) && typeof a.on === 'boolean') return { name, args: { light: a.light, on: a.on } };
  if (name === 'set_lock' && typeof a.on === 'boolean') return { name, args: { on: a.on } };
  return null;
}

export function describeAction({ name, args }) {
  if (name === 'set_lock') return args.on ? t('Turn on lock-up mode') : t('Turn off lock-up mode');
  if (args.light === 'both') return args.on ? t('Turn on both lights') : t('Turn off both lights');
  const light = t(args.light === 'main' ? 'Main storage' : 'Secondary storage');
  return args.on ? t('Turn on the {name} light', { name: light }) : t('Turn off the {name} light', { name: light });
}

// ---- Rules: used when there is no LLM, or when it cannot be reached ----
export function routeRule(text) {
  const s = norm(text);
  const has = (re) => re.test(s);
  const unlock = has(/\b(unlock|disarm|mo khoa|tat khoa|tat che do khoa)\b/);
  const lock = !unlock && has(/\b(lock|away|khoa|chong trom)\b/);
  if (unlock || lock) return { name: 'set_lock', args: { on: lock } };
  if (has(/\b(den|light|lights|lamp|lamps)\b/)) {
    const off = has(/\b(tat|off|turn off|switch off)\b/);
    const on = !off && has(/\b(bat|mo|on|turn on|switch on)\b/);
    if (on || off) {
      const sec = has(/\b(phu|secondary|second|2|hai)\b/), main = has(/\b(chinh|main|primary|first|1|mot)\b/);
      return { name: 'set_light', args: { light: sec && !main ? 'secondary' : main && !sec ? 'main' : 'both', on } };
    }
  }
  if (has(/\b(du doan|predict|forecast|will it|se nong|se vuot|too warm|too hot|nong len|warm up|get warm)\b/)) return { name: 'get_status', args: { focus: 'prediction' } };
  if (has(/\b(nhiet do|temperature|temp|bao nhieu do|may do|how cold|how warm)\b/)) return { name: 'get_status', args: { focus: 'temp' } };
  if (has(/\b(cua|door)\b/)) return { name: 'get_status', args: { focus: 'door' } };
  if (has(/\b(tinh trang|trang thai|status|how is|the nao|binh thuong|everything|ok khong|all good|report|bao cao)\b/)) return { name: 'get_status', args: { focus: 'all' } };
  return null;
}

// What the assistant says about the storage, from a snapshot:
// { online, tempC, hotC, door, lights: {main, secondary}, away, alert, issues: [codes], prediction }
export function answerFor(focus, s) {
  if (!s.online) return t("The board is offline, so I can't read the storage right now.");
  const temp = Number.isFinite(s.tempC) ? t('The temperature is {n} degrees.', { n: s.tempC }) : t("I don't have a temperature reading yet.");
  const door = s.door === 'open' ? t('The door is open.') : s.door === 'closed' ? t('The door is closed.') : t("I don't know the door state yet.");
  const pred = describePrediction(s.prediction);
  const interesting = s.prediction && !['learning', 'steady'].includes(s.prediction.kind);
  if (focus === 'temp') return [temp, interesting ? pred.text : ''].filter(Boolean).join(' ');
  if (focus === 'door') return door;
  if (focus === 'prediction') return `${temp} ${pred.text}`;
  const state = (b) => t(b ? 'on' : 'off');
  const parts = [temp, door, t('The main light is {a}, the secondary light is {b}.', { a: state(s.lights?.main), b: state(s.lights?.secondary) }),
    t('Lock-up mode is {state}.', { state: state(s.away) })];
  const banner = describeBanner({ alert: s.alert, status: 'online' });
  if (banner.level !== 'ok') parts.push(`${banner.text}.`);
  const n = describeIssues(s.issues).length;
  parts.push(n ? t(n > 1 ? '{n} problems found' : '{n} problem found', { n }) + '.' : t('All checks are fine.'));
  if (interesting) parts.push(pred.text);
  if (s.demo) parts.push(t('These are simulated demo readings.'));
  return parts.join(' ');
}

// Text for the speech engine: "-18" and "0.6°" read badly, so spell them out.
export function speakable(text) {
  return String(text).replace(/(^|[\s(])-(\d)/g, (m, a, d) => `${a}${t('minus')} ${d}`).replace(/\s*°C?/g, ` ${t('degrees')}`);
}

// ---- Talking to the language model ----
export function systemPrompt(s, lang = getLang()) {
  const facts = { board_online: !!s.online, temperature_c: Number.isFinite(s.tempC) ? s.tempC : null, alert_limit_c: s.hotC ?? null, door: s.door ?? null,
    lights: { main: !!s.lights?.main, secondary: !!s.lights?.secondary }, lock_up_mode: !!s.away, alert: s.alert || 'none', problems: s.issues ?? [],
    prediction: s.prediction ?? null, last_minutes: s.recent ?? null, demo_mode_simulated_readings: !!s.demo };
  return [
    'You are the voice assistant of a cold storage monitor (a school project). Talk like a calm, helpful colleague on a phone call.',
    `Reply in ${lang === 'vi' ? 'Vietnamese' : 'English'}. Use one to three short sentences of plain text: no lists, no markdown, no emoji.`,
    'Answer only from the status below. If it is not there, say you do not know. Never invent a reading.',
    'To change a light or lock-up mode, call the matching tool; the app asks the person to confirm. You cannot change alert limits or settings.',
    'If demo_mode_simulated_readings is true, the readings are simulated for a demonstration: say so when you give them.',
    'If the temperature is rising or an alert is active, say what it means and the first thing to do: close the door, check the stored goods, check the sensor.',
    'Status (JSON): ' + JSON.stringify(facts),
  ].join('\n');
}

export function createAssistant({ snapshot, act, llm }) {
  let pending = null;
  const history = [];
  const remember = (role, content) => { history.push({ role, content }); if (history.length > 10) history.splice(0, history.length - 10); };
  const finish = (reply, via, extra = {}) => { remember('assistant', reply); return { reply, via, pending: !!pending, ...extra }; };
  const confirmText = (p) => t('{action}? Say yes to confirm, or no to cancel.', { action: describeAction(p) });

  function failText(r) {
    if (r?.reason === 'fingerprint') return t('The fingerprint check failed, so I changed nothing.');
    if (r?.reason === 'demo') return t('Demo mode is on, so I changed nothing on the board.');
    if (r?.reason === 'offline') return t('The board is offline, so I changed nothing.');
    return t('That did not work. I changed nothing.');
  }

  async function viaLLM(said, snap) {
    const messages = [{ role: 'system', content: systemPrompt(snap) }, ...history, { role: 'user', content: said }];
    for (let round = 0; round < 3; round++) {
      const msg = await llm(messages, TOOLS);
      if (!msg || (!msg.content && !msg.tool_calls?.length)) throw new Error('empty answer');
      if (!msg.tool_calls?.length) return String(msg.content).trim();
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let args = null;
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* invalid arguments are refused below */ }
        const action = validateAction(call.function?.name, args);
        if (action) pending = action;
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(action ? { status: 'waiting for the person to confirm' } : { error: 'unknown tool or invalid arguments' }) });
      }
      if (pending) return confirmText(pending);   // our own wording, not the model's
    }
    throw new Error('too many tool rounds');
  }

  function viaRules(said, snap) {
    const r = routeRule(said);
    if (!r) return t("Sorry, I didn't catch that. You can ask about the temperature, the door or the lights, or ask me to switch a light.");
    if (r.name === 'get_status') return answerFor(r.args.focus, snap);
    pending = validateAction(r.name, r.args);
    return confirmText(pending);
  }

  async function handle(text) {
    const said = String(text ?? '').trim();
    if (!said) return { reply: '', via: 'none', pending: !!pending };
    remember('user', said);
    if (pending) {
      const p = pending, yn = parseYesNo(said);
      pending = null;
      if (yn === 'yes') {
        const r = await act(p.name, p.args);
        return finish(r?.ok ? t('Done: {action}.', { action: describeAction(p) }) : failText(r), 'confirm');
      }
      if (yn === 'no') return finish(t('Cancelled. I changed nothing.'), 'confirm');
    }
    const snap = snapshot();
    if (llm) {
      try { return finish(await viaLLM(said, snap), 'llm'); }
      catch { pending = null; return finish(viaRules(said, snap), 'rules', { degraded: true }); }
    }
    return finish(viaRules(said, snap), 'rules');
  }

  return { handle, hasPending: () => !!pending, cancel: () => { pending = null; } };
}
