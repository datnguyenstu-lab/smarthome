import { describeBanner, ageText, onOff, describeIssues, guideState, validateSettings, settingsMessage, lastSeenText,
  formatUptime, signalText, resetText, dialFraction, sameSettings, describeSelfTest, memoryText, describeVersions, formatBuild, describeAbout, describeDoor, doorRowState, describeConnectError, connectErrorText } from './logic.js';
import { parseChunk, LogAssembler, requestMessage, buildLogHeader } from './logsync.js';
import { t, setLang, getLang, detectLang } from './i18n.js';
import { addSample, analyze, describePrediction, recentStats, demoPoint, DEMO_STEPS } from './predictor.js';
import { createAssistant, answerFor, speakable, isGoodbye } from './assistant.js';
import { fingerprintAvailable, fingerprintEnrolled, enrollFingerprint, verifyFingerprint } from './auth.js';
import { listenSupported, listenOnce, speak, stopSpeaking } from './voice.js';

const BROKER = 'wss://hff38f13.ala.asia-southeast1.emqxsl.com:8084/mqtt';
// The address of the assistant proxy (worker/, deployed on Cloudflare). Empty: the assistant uses its built-in rules only.
// The address is public; the DeepSeek key stays in the proxy, and the page only holds the person's access code.
const ASSISTANT_URL = '';
const APP_VERSION = '2.0.0';  // the page's own release: keep major.minor equal to the board firmware's
const LIGHTS = { 2: 'Main storage', 3: 'Secondary storage' };  // led 1 (yellow) is the board's status light, not shown
const DEFAULTS = { hot_on_c: 33, door_open_s: 10, status_led: true };
const VIEWS = { home: 'viewHome', assistant: 'viewAssistant', cooler: 'viewCooler', health: 'viewHealth', settings: 'viewSettings', guide: 'viewGuide', about: 'viewAbout' };
const $ = (id) => document.getElementById(id);
const nowSec = () => Date.now() / 1000;

const state = { status: undefined, temp: undefined, door: undefined, doorChanged: undefined, alert: 'none',
  away: false, cool: null, servo: null, led: { 2: false, 3: false }, health: null, selftest: null, settings: null, info: null, about: null };
let client = null, everConnected = false, connected = false, ready = false;
let view = 'home', guideDismissed = false, celebrating = false;
let pending = null, dirty = false;                 // settings sent and waiting for the echo / person is editing
let selfRunning = false, selfBefore = 0, selfTimer = null, selfNote = '';
let dl = null;  // log download in progress: {files, i, asm, texts, retries, timer}
let dlMsg = { key: 'Saves what the board has recorded: restarts, Wi-Fi drops, problems and setting changes.', vars: null, cls: '' };
let dlLabel = 'Download log';   // English keys: they are translated each time the screen is drawn
let loginErrorKind = null;
let samples = [];   // the last 15 minutes of real temperature readings, for the AI predictor
const demo = { on: false, step: 0, timer: null, samples: [], cur: null };   // demo mode: a simulated door-left-open story

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function alertBlock(title, detail, cls) { const d = el('div', 'alertb' + (cls ? ' ' + cls : '')); d.append(el('b', '', title)); if (detail) d.append(detail); return d; }
function json(buf) { try { return JSON.parse(buf.toString()); } catch { return null; } }
function publish(topic, payload, retain = false) { if (client && connected) client.publish(topic, payload, { retain }); }

function setView(v) {
  view = v;
  for (const [name, id] of Object.entries(VIEWS)) $(id).hidden = name !== v;
  render();
}

const hotLimit = () => (state.settings ? Number(state.settings.hot_on_c) : DEFAULTS.hot_on_c);
const currentSamples = () => (demo.on ? demo.samples : samples);
const analysis = () => analyze(currentSamples(), hotLimit());

function renderHome() {
  const realOnline = state.status === 'online';
  const dm = demo.cur;                       // in demo mode the simulated readings replace the live ones on this screen
  const online = realOnline || !!dm;
  const an = analysis();
  const alertNow = dm ? (an.kind === 'over' ? 'hot' : 'none') : state.alert;
  const tempText = dm ? dm.c.toFixed(1) : state.temp;   // one decimal, like the board's own readings
  $('status').className = 'status' + (online ? ' online' : '');
  $('statusText').textContent = online ? t('online') : t('offline');
  $('demoBar').hidden = !demo.on;
  const pd = online ? describePrediction(an) : null;
  $('aiCard').hidden = !pd;
  if (pd) { $('aiCard').className = 'aicard ' + pd.level; $('aiText').textContent = pd.text; }

  const hasTemp = online && tempText !== undefined && tempText !== '';
  const tempC = Number(tempText);
  const hot = hotLimit();
  $('temp').textContent = hasTemp ? tempText : '--';
  $('arc').setAttribute('stroke-dasharray', `${((hasTemp ? dialFraction(tempC) : 0) * 314.16).toFixed(1)} 400`);
  $('arc').setAttribute('stroke', hasTemp && tempC >= hot ? 'var(--bad)' : 'var(--ok)');
  const th = Math.PI * (1 - dialFraction(hot)), c = Math.cos(th), s = Math.sin(th);
  const tick = $('hotTick');
  tick.setAttribute('x1', (120 + 88 * c).toFixed(1)); tick.setAttribute('y1', (120 - 88 * s).toFixed(1));
  tick.setAttribute('x2', (120 + 112 * c).toFixed(1)); tick.setAttribute('y2', (120 - 112 * s).toFixed(1));
  const lab = $('hotLabel');
  lab.setAttribute('x', (120 + 124 * c).toFixed(1)); lab.setAttribute('y', Math.max(9, 120 - 124 * s).toFixed(1));
  lab.textContent = t('alert at {n}°', { n: hot });

  const doorNow = dm ? dm.door : state.door;
  const d = describeDoor(doorNow, dm ? undefined : state.doorChanged, nowSec());   // the IR sensor is the door sensor
  $('door').textContent = online ? d.label : '--';
  const rowState = doorRowState({ online, door: doorNow, alert: alertNow });
  const grace = Number(state.settings?.door_open_s);
  $('age').textContent = online && d.since ? t('since {ago}', { ago: d.since }) + (rowState === 'watch' && grace > 0 ? ' · ' + t('warns after {n} s', { n: grace }) : '') : '';
  $('doorRow').classList.toggle('alarm', rowState === 'alarm');
  $('doorRow').classList.toggle('watch', rowState === 'watch');
  for (const b of document.querySelectorAll('.lamp')) {
    const n = b.dataset.led;
    b.querySelector('.lname').textContent = t(LIGHTS[n]);
    b.setAttribute('aria-label', t(LIGHTS[n]));
    b.setAttribute('aria-pressed', String(!!state.led[n]));
    b.disabled = !realOnline;
  }
  $('away').setAttribute('aria-checked', String(state.away));
  $('away').disabled = !realOnline;

  const issues = realOnline ? describeIssues(state.health?.issues) : [];
  const box = $('alerts');
  box.replaceChildren();
  if (online) {
    const b = describeBanner({ alert: alertNow, status: 'online' });
    const covered = alertNow === 'temp_fault' && issues.some((i) => i.code === 'temp_fault');
    if (b.level !== 'ok' && !covered) box.append(alertBlock(b.text, '', b.level === 'warn' ? 'warn' : ''));
    for (const i of issues) box.append(alertBlock(i.text, i.fix, ''));
  }
  $('healthLine').textContent = issues.length ? t(issues.length > 1 ? '{n} problems found' : '{n} problem found', { n: issues.length }) : t('Health: no problems found');
  $('guideLink').hidden = !(connected && ready && state.status !== 'online' && !demo.on);
}

function renderHealth() {
  const online = state.status === 'online';
  const h = state.health || {};
  $('hSignal').textContent = h.rssi === undefined ? '--' : `${signalText(h.rssi)} · ${h.rssi} dBm`;
  $('hCloud').textContent = online ? t('Connected') : t('Not connected');
  $('hMem').textContent = memoryText(h.heap) || '--';
  $('hUp').textContent = formatUptime(h.uptime_s) || '--';
  $('hReset').textContent = h.reset ? resetText(h.reset) : '--';
  $('hFw').textContent = h.fw || '--';
  const box = $('hIssues');
  box.replaceChildren();
  const issues = describeIssues(h.issues);
  if (!issues.length) { const r = el('div', 'row'); r.append(el('span', '', t('None found'))); box.append(r); }
  for (const i of issues) box.append(alertBlock(i.text, i.fix, ''));
  const st = describeSelfTest(state.selftest);
  $('hSelf').textContent = selfRunning ? t('Running…') : st ? st.text : t('not run yet');
  $('runSelf').disabled = !online || selfRunning;
  $('dlLog').disabled = !online || !!dl;
  $('selfNote').textContent = t(selfNote || 'The yellow light on the board shows a pattern while the test runs.');
  $('dlLog').textContent = t(dlLabel);
  $('dlNote').textContent = t(dlMsg.key, dlMsg.vars);
  $('dlNote').className = 'note ' + dlMsg.cls;
}

function renderSettings() {
  const online = state.status === 'online';
  if (!dirty && state.settings) {
    $('sHot').value = state.settings.hot_on_c;
    $('sDoor').value = state.settings.door_open_s;
    $('sLed').setAttribute('aria-checked', String(!!state.settings.status_led));
  }
  const note = $('sNote');
  note.className = 'note';
  if (pending && sameSettings(pending, state.settings)) { pending = null; dirty = false; }
  if (pending) note.textContent = online ? t('Sent. Waiting for the board…') : t('Saved. The board applies it when it comes back online.');
  else if (!dirty && state.settings) { note.textContent = t('Applied on the board.'); note.className = 'note good'; }
  else note.textContent = '';
  $('setupBtn').disabled = !online;
  $('forgetBtn').disabled = !online;
}

function updateGuide() {
  if (!ready || !connected || demo.on) return;
  const gs = guideState({ status: state.status, healthTs: state.health?.ts, nowSec: nowSec(), liveAtSec: state.healthLiveAt });
  if (gs === 'ok') {
    guideDismissed = false;
    if (view === 'guide' && !celebrating) {
      celebrating = true;
      $('gOk').hidden = false; $('gSteps').hidden = true; $('gStatus').textContent = t('Online');
      setTimeout(() => { celebrating = false; $('gOk').hidden = true; $('gSteps').hidden = false; if (view === 'guide') setView('home'); }, 2500);
    }
    return;
  }
  $('gTitle').textContent = gs === 'hung' ? t('The board stopped reporting') : t("The board isn't answering");
  $('gSeen').textContent = t('{seen}. Let’s get it back online.', { seen: lastSeenText(nowSec(), state.health?.ts) });
  $('gStatus').textContent = t('Offline');
  if (!guideDismissed && view !== 'guide' && !celebrating) setView('guide');
}

function renderAbout() {
  const fw = state.info?.fw ?? state.health?.fw;
  const v = describeVersions(APP_VERSION, fw);
  $('footVersions').textContent = t('Page {v} · Board {fw}', { v: APP_VERSION, fw: fw || '--' });
  $('aPage').textContent = APP_VERSION;
  $('aFw').textContent = fw || '--';
  $('aBuild').textContent = formatBuild(state.info?.build);
  $('aChip').textContent = state.info?.chip || '--';
  $('aCore').textContent = state.info?.core || '--';
  $('aFlash').textContent = state.info?.flash_kb ? `${Math.round(state.info.flash_kb / 1024)} MB` : '--';
  $('aSketch').textContent = state.info?.sketch_kb ? `${state.info.sketch_kb} KB` : '--';
  const who = state.about;  // from the retained smarthome/about message; hidden when it is not published
  $('aStudent').hidden = !who;
  if (who) {
    for (const [id, v] of [['aName', who.name], ['aId', who.studentId], ['aClass', who.className], ['aYear', who.year], ['aSupervisor', who.supervisor]]) {
      $(id).textContent = v; $(id).parentElement.hidden = !v;
    }
  }
  const box = $('vCompat');
  box.replaceChildren();
  if (v.level === 'ok') { const r = el('div', 'ok-banner', v.text); box.append(r); }
  else box.append(alertBlock(v.level === 'warn' ? t('Versions differ') : t('Version unknown'), v.text, v.level === 'warn' ? '' : 'warn'));
}

// Shown on every screen while the page has lost its connection to the cloud (the board may still be fine).
function renderConnBar() {
  const bar = $('connBar');
  bar.hidden = connected;
  if (!connected) bar.textContent = navigator.onLine === false ? t('No internet connection. Reconnecting…') : t('Connection to the cloud lost. Reconnecting…');
}

function render() { renderConnBar(); renderHome(); renderCooler(); renderAssistant(); renderHealth(); renderSettings(); renderAbout(); updateGuide(); }

function handle(topic, buf, packet) {
  const v = buf.toString();
  const sub = topic.replace(/^smarthome\//, '');
  if (sub === 'status') state.status = v;
  else if (sub === 'temp') { state.temp = v; samples = addSample(samples, nowSec(), Number(v)); }
  else if (sub === 'door') state.door = v;
  else if (sub === 'door_changed') state.doorChanged = Number(v);
  else if (sub === 'alert') state.alert = v;
  else if (sub === 'state/cool') state.cool = json(buf);
  else if (sub === 'state/door_servo') state.servo = v;
  else if (sub === 'state/away') { const o = onOff(v); if (o !== null) state.away = o; }
  else if (sub === 'state/led2' || sub === 'state/led3') { const o = onOff(v); if (o !== null) state.led[sub.slice(-1)] = o; }
  else if (sub === 'health') { state.health = json(buf); if (!packet?.retain) state.healthLiveAt = nowSec(); }
  else if (sub === 'settings') state.settings = json(buf);
  else if (sub === 'info') state.info = json(buf);
  else if (sub === 'about') state.about = describeAbout(json(buf));
  else if (sub === 'log/index') onLogIndex(json(buf));
  else if (sub === 'log/data') onLogChunk(parseChunk(buf));
  else if (sub === 'selftest') {
    state.selftest = json(buf);
    if (selfRunning && state.selftest && state.selftest.ts > selfBefore) { selfRunning = false; selfNote = 'Done.'; clearTimeout(selfTimer); }
  }
  render();
}

function connect(username, password) {
  loginErrorKind = null;
  $('loginError').textContent = '';
  $('loginBtn').disabled = true;
  everConnected = false;
  client = mqtt.connect(BROKER, { username, password, clientId: 'web-' + Math.random().toString(16).slice(2, 10), keepalive: 30, reconnectPeriod: 3000, connectTimeout: 10000 });
  client.on('connect', () => {
    everConnected = true; connected = true;
    client.subscribe('smarthome/#');
    $('login').hidden = true; $('app').hidden = false;
    $('pass').value = '';
    setTimeout(() => { ready = true; render(); }, 2000);  // let the retained messages arrive before judging the board
    render();
  });
  client.on('message', (topic, buf, packet) => handle(topic, buf, packet));
  client.on('error', (e) => { if (!everConnected) fail(describeConnectError(e, navigator.onLine)); });
  client.on('close', () => {
    connected = false;
    if (everConnected) { ready = false; state.status = undefined; state.healthLiveAt = undefined; render(); }
    else if (client) fail(describeConnectError(null, navigator.onLine));   // closed before it ever connected: no network
  });
  setTimeout(() => { if (!everConnected && client) fail(describeConnectError(null, navigator.onLine)); }, 12000);
}

function fail(kind) {
  if (client) { client.end(true); client = null; }
  loginErrorKind = kind || 'auth';
  $('loginError').textContent = connectErrorText(loginErrorKind);
  $('loginBtn').disabled = false;
}

$('loginForm').addEventListener('submit', (e) => { e.preventDefault(); connect($('user').value, $('pass').value); });
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.go === 'guide') guideDismissed = false; setView(b.dataset.go); }));
$('gBack').addEventListener('click', () => { guideDismissed = true; setView('home'); });
document.querySelectorAll('.lamp').forEach((b) => b.addEventListener('click', () => {
  const n = b.dataset.led;
  publish(`smarthome/cmd/led${n}`, state.led[n] ? 'off' : 'on');
}));
$('away').addEventListener('click', () => publish('smarthome/cmd/away', state.away ? 'off' : 'on', true));

$('runSelf').addEventListener('click', () => {
  selfBefore = state.selftest?.ts ?? 0; selfRunning = true; selfNote = '';
  publish('smarthome/cmd/selftest', '1');
  clearTimeout(selfTimer);
  selfTimer = setTimeout(() => { selfRunning = false; selfNote = 'The board did not answer. Try again.'; render(); }, 10000);
  render();
});

document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const input = $(b.dataset.step);
  input.value = String((Number(input.value) || 0) + Number(b.dataset.d));
  dirty = true; render();
}));
for (const id of ['sHot', 'sDoor']) $(id).addEventListener('input', () => { dirty = true; });
$('sLed').addEventListener('click', () => { $('sLed').setAttribute('aria-checked', String($('sLed').getAttribute('aria-checked') !== 'true')); dirty = true; });

function saveSettings() {
  const r = validateSettings({ hot_on_c: $('sHot').value, door_open_s: $('sDoor').value, status_led: $('sLed').getAttribute('aria-checked') === 'true' });
  $('eHot').textContent = r.errors.hot_on_c ?? '';
  $('eDoor').textContent = r.errors.door_open_s ?? '';
  if (!r.ok) return;
  pending = r.value; dirty = true;
  publish('smarthome/cmd/settings', settingsMessage(r.value), true);
  render();
}
$('sSave').addEventListener('click', saveSettings);
$('sReset').addEventListener('click', () => {
  $('sHot').value = DEFAULTS.hot_on_c; $('sDoor').value = DEFAULTS.door_open_s;
  $('sLed').setAttribute('aria-checked', String(DEFAULTS.status_led));
  saveSettings();
});
$('setupBtn').addEventListener('click', () => {
  if (!confirm(t('Restart the board into setup mode? It goes offline until you join its "SmartHome-Setup" network.'))) return;
  publish('smarthome/cmd/setup', '1');
  $('sNote').textContent = t('Restart command sent. Follow the steps on the Home screen when the board goes offline.');
});
$('forgetBtn').addEventListener('click', () => {
  if (!confirm(t('Forget the saved Wi-Fi network and password? The board goes offline and opens "SmartHome-Setup" until you choose a network again.'))) return;
  publish('smarthome/cmd/forgetwifi', '1');
  $('sNote').textContent = t('Forget command sent. Join "SmartHome-Setup" on your phone to give the board a Wi-Fi network.');
});

// ---- Download the board's event log: list the files, pull each in chunks, re-request after a stall, save one file ----
function dlNote(key, cls = '', vars = null) { dlMsg = { key, vars, cls }; $('dlNote').textContent = t(key, vars); $('dlNote').className = 'note ' + cls; }
function dlFail(msg) {
  if (dl) clearTimeout(dl.timer);
  dl = null; dlLabel = 'Try again'; dlNote(msg, 'bad'); render();
}
function dlRequest() {
  const f = dl.files[dl.i];
  publish('smarthome/cmd/log', requestMessage('get', f.seq, dl.asm.nextOffset()));
  clearTimeout(dl.timer); dl.timer = setTimeout(dlStall, 3000);
  dlNote('Downloading file {i} of {n}…', '', { i: dl.i + 1, n: dl.files.length });
}
function dlStall() { if (!dl) return; if (++dl.retries > 3) dlFail('The download stalled. Try again.'); else dlRequest(); }
function dlNextFile() {
  while (dl.i < dl.files.length && !(dl.files[dl.i].bytes > 0)) dl.i++;
  if (dl.i >= dl.files.length) { dlFinish(); return; }
  dl.asm = new LogAssembler(dl.files[dl.i].bytes); dl.retries = 0; dlRequest();
}
function onLogIndex(idx) {
  if (!dl || dl.files) return;
  clearTimeout(dl.timer);
  dl.files = Array.isArray(idx?.files) ? idx.files : [];
  if (!dl.files.some((f) => f.bytes > 0)) { dlFail('The board has no log yet.'); return; }
  dlNextFile();
}
function onLogChunk(c) {
  if (!dl || !dl.asm || !c || c.seq !== dl.files[dl.i].seq) return;
  if (dl.asm.accept(c)) { dl.retries = 0; clearTimeout(dl.timer); dl.timer = setTimeout(dlStall, 3000); }
  else if (c.data.length === 0) { dlFail('The board does not have that log file. Try again.'); return; }
  if (dl.asm.done()) { dl.texts.push(dl.asm.text()); dl.i++; dlNextFile(); }
}
async function dlFinish() {
  clearTimeout(dl.timer);
  const text = dl.texts.join('');
  dl = null;
  const iso = new Date().toISOString().replace(/[.][0-9]+Z$/, 'Z');
  const file = buildLogHeader(state.info, iso) + text;   // a short header, then the log lines
  let blob = new Blob([file], { type: 'text/plain' }), ext = 'txt';
  if (typeof CompressionStream !== 'undefined') {
    try { blob = await new Response(new Blob([file]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); ext = 'txt.gz'; } catch { /* plain text is fine */ }
  }
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `smarthome-log-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  dlLabel = 'Download log';
  dlNote('Saved {n} log lines.', 'good', { n: text.split('\n').length - 1 });
  render();
}
$('dlLog').addEventListener('click', () => {
  if (dl) return;
  dl = { files: null, i: 0, asm: null, texts: [], retries: 0, timer: null };
  dlLabel = 'Download log';
  dlNote('Asking the board for its log…');
  publish('smarthome/cmd/log', requestMessage('list'));
  dl.timer = setTimeout(() => dlFail('The board did not answer. Try again.'), 8000);
  render();
});

// ---- Demo mode: replays a simulated "door left open" story into the predictor and the Home screen; the board is not touched ----
function demoTick() {
  const p = demoPoint(demo.step, hotLimit());
  demo.samples = addSample(demo.samples, p.t, p.c);
  demo.cur = p;
  if (++demo.step >= DEMO_STEPS) { clearInterval(demo.timer); demo.timer = null; }
  render();
}
function stopDemo() { clearInterval(demo.timer); Object.assign(demo, { on: false, step: 0, timer: null, samples: [], cur: null }); render(); }
function startDemo() {
  stopDemo();
  demo.on = true;
  demoTick();
  demo.timer = setInterval(demoTick, 1000);
  setView('home');
}
$('demoBtn').addEventListener('click', () => (demo.on ? stopDemo() : startDemo()));
$('demoStop').addEventListener('click', stopDemo);

// ---- Assistant: what it can see, what it can do, and the language model behind it ----
function snapshot() {
  const dm = demo.cur, an = analysis();
  const online = state.status === 'online' || !!dm;
  const raw = dm ? dm.c : (state.temp === undefined || state.temp === '' ? NaN : Number(state.temp));
  return { online, demo: !!dm, tempC: online && Number.isFinite(raw) ? Math.round(raw * 10) / 10 : null, hotC: hotLimit(), door: dm ? dm.door : state.door,
    lights: { main: !!state.led[2], secondary: !!state.led[3] }, away: state.away, alert: dm ? (an.kind === 'over' ? 'hot' : 'none') : state.alert,
    issues: state.status === 'online' ? (state.health?.issues ?? []) : [], prediction: an, recent: recentStats(currentSamples()) };
}

const waitFor = async (cond, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return cond();
};
// Runs a confirmed action and says it worked only once the board's own state message agrees.
async function actOnStorage(name, args) {
  if (demo.on) return { ok: false, reason: 'demo' };
  if (state.status !== 'online') return { ok: false, reason: 'offline' };
  if (name === 'set_lock') {
    if (!(await verifyFingerprint()).ok) return { ok: false, reason: 'fingerprint' };   // lock-up mode needs the fingerprint again
    publish('smarthome/cmd/away', args.on ? 'on' : 'off', true);
    return { ok: await waitFor(() => state.away === args.on) };
  }
  const ids = args.light === 'main' ? [2] : args.light === 'secondary' ? [3] : [2, 3];
  for (const n of ids) if (state.led[n] !== args.on) publish(`smarthome/cmd/led${n}`, args.on ? 'on' : 'off');
  return { ok: await waitFor(() => ids.every((n) => state.led[n] === args.on)) };
}

let aiStatus = 'unknown';   // unknown | ok | denied | down
function accessCode() { try { return localStorage.getItem('aiCode') || ''; } catch { return ''; } }
async function askLLM(messages, tools) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(ASSISTANT_URL, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-access-code': accessCode() }, body: JSON.stringify({ messages, tools }) });
    if (res.status === 401) { aiStatus = 'denied'; throw new Error('access code'); }
    if (!res.ok) throw new Error('http ' + res.status);
    const { message } = await res.json();
    aiStatus = 'ok';
    return message;
  } catch (e) { if (aiStatus !== 'denied') aiStatus = 'down'; throw e; }
  finally { clearTimeout(timer); }
}
const buildAssistant = () => createAssistant({ snapshot, act: actOnStorage, llm: ASSISTANT_URL && accessCode() ? askLLM : null });
let assistant = buildAssistant();

let fpAvail = null, fpNote = { key: '', cls: '' };
fingerprintAvailable().then((v) => { fpAvail = v; render(); });
let coolTouched = 0;   // the person is moving the target slider: do not overwrite it with the board's echo
function coolStatus(c) {
  if (!c) return t('Waiting for the board.');
  if (c.reason === 'off') return t('Cooling is off.');
  if (c.reason === 'inside_sensor') return t('Stopped: the inside temperature sensor is missing.');
  if (c.reason === 'hot_sensor') return t('Stopped: the hot-side sensor is missing.');
  if (c.reason === 'overheat') return t('Stopped: the hot side is too hot. Check the fan and the vents.');
  if (c.reason === 'no_cooling') return t('Stopped: the box did not cool in 10 minutes. Check the Peltier, then switch cooling off and on.');
  return c.peltier > 0 ? t('Cooling.') : t('At the target. The Peltier is resting.');
}
function renderCooler() {
  const c = state.cool, online = state.status === 'online';
  $('cIn').textContent = state.temp ?? '--';
  $('cHot').textContent = c && c.hot_c != null ? Number(c.hot_c).toFixed(0) : '--';
  $('cPel').textContent = c ? `${c.peltier}%` : '--';
  $('cFan').textContent = c ? `${c.fan}%` : '--';
  $('cDoor').textContent = state.servo === 'open' ? t('Open') : state.servo === 'closed' ? t('Closed') : '--';
  $('cStatus').textContent = coolStatus(c);
  $('coolOn').setAttribute('aria-checked', String(!!c?.on));
  if (c && Date.now() - coolTouched > 3000) $('coolTarget').value = c.target_c;
  $('coolTargetVal').textContent = $('coolTarget').value;
  for (const id of ['coolOn', 'coolTarget', 'doorOpen', 'doorClose']) $(id).disabled = !online;
  $('cLock').hidden = !state.away;
}
const sendCool = (on) => publish('smarthome/cmd/cool', JSON.stringify({ on, target_c: Number($('coolTarget').value) }), true);
$('coolOn').addEventListener('click', () => sendCool(!state.cool?.on));
$('coolTarget').addEventListener('input', () => { coolTouched = Date.now(); $('coolTargetVal').textContent = $('coolTarget').value; });
$('coolTarget').addEventListener('change', () => { coolTouched = Date.now(); sendCool(!!state.cool?.on); });
$('doorOpen').addEventListener('click', () => publish('smarthome/cmd/door', 'open'));
$('doorClose').addEventListener('click', () => publish('smarthome/cmd/door', 'close'));

function renderAssistant() {
  $('fpState').textContent = fpAvail === false ? t('Not available on this device') : fingerprintEnrolled() ? t('Ready') : t('Not set up');
  $('fpSetup').hidden = fpAvail === false || fingerprintEnrolled();
  $('fpNote').textContent = fpNote.key ? t(fpNote.key) : '';
  $('fpNote').className = 'note ' + fpNote.cls;
  const hasCode = !!accessCode();
  $('aiMode').textContent = !ASSISTANT_URL ? t('AI service not set up. The assistant uses built-in rules.')
    : !hasCode ? t('Enter the access code to use the AI service. Until then the assistant uses built-in rules.')
    : aiStatus === 'denied' ? t('The AI service refused the access code.')
    : aiStatus === 'down' ? t('The AI service did not answer. The assistant uses built-in rules.')
    : aiStatus === 'ok' ? t('AI service connected.') : t('AI service ready.');
  $('aiCode').hidden = !ASSISTANT_URL; $('aiSave').hidden = !ASSISTANT_URL;
  $('demoBtn').textContent = demo.on ? t('Stop demo') : t('Play demo: door left open');
}
$('aiSave').addEventListener('click', () => {
  try { localStorage.setItem('aiCode', $('aiCode').value.trim()); } catch { /* not remembered */ }
  $('aiCode').value = ''; aiStatus = 'unknown'; assistant = buildAssistant(); render();
});
$('fpSetup').addEventListener('click', async () => {
  const r = await enrollFingerprint();
  fpNote = r.ok ? { key: 'Fingerprint set up.', cls: 'good' } : { key: r.reason === 'cancelled' ? 'Cancelled. Fingerprint was not set up.' : 'Could not set up the fingerprint on this device.', cls: 'bad' };
  render();
});

function chat(who, text) {
  const p = el('p', who, text);
  $('chatLog').append(p);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}
async function ask(text) {
  const r = await assistant.handle(text);
  if (r.reply) chat('ai', r.reply);
  render();
  return r;
}
$('chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('chatIn').value.trim();
  $('chatIn').value = '';
  if (!v) return;
  chat('me', v);
  await ask(v);
});

// ---- The call: fingerprint first, then a spoken back-and-forth until someone hangs up ----
let call = null;
const callNotes = (msg) => document.querySelectorAll('.callnote').forEach((n) => { n.textContent = msg; });
async function ensureFingerprint() {
  if (fpAvail === null) fpAvail = await fingerprintAvailable();
  if (!fpAvail) return { ok: false, message: t('Fingerprint is not available on this device, so the call cannot start.') };
  if (!fingerprintEnrolled()) {
    const e = await enrollFingerprint();   // setting it up is itself a fingerprint check
    return e.ok ? { ok: true } : { ok: false, message: t('Could not set up the fingerprint on this device.') };
  }
  return (await verifyFingerprint()).ok ? { ok: true } : { ok: false, message: t('Fingerprint check failed. The call did not start.') };
}
function setCall(name) {
  $('call').dataset.state = name;
  $('callState').textContent = name === 'listening' ? t('Listening…') : name === 'thinking' ? t('Thinking…') : name === 'speaking' ? t('Speaking… tap to interrupt') : '';
}
async function say(c, text) {
  if (c.ended) return;
  chat('ai', text);
  $('callText').textContent = text;
  setCall('speaking');
  await speak(speakable(text), getLang());
}
function hear(c) {
  if (c.queued) { const q = c.queued; c.queued = null; return Promise.resolve(q); }
  c.listenCtl = new AbortController();
  const typed = new Promise((res) => { c.onTyped = (txt) => { res(txt); c.listenCtl.abort(); }; });
  const spoken = listenSupported() && !c.typedOnly ? listenOnce(getLang(), c.listenCtl.signal) : new Promise(() => {});   // no recognition: wait for typing
  return Promise.race([typed, spoken]).finally(() => { c.onTyped = null; });
}
function hangUp(c) {
  if (!c || c.ended) return;
  c.ended = true;
  clearInterval(c.timer);
  c.listenCtl?.abort(); c.onTyped?.('');
  stopSpeaking();
  assistant.cancel();
  $('call').hidden = true;
  document.body.style.overflow = '';
  call = null;
}
async function runCall(c) {
  await say(c, t('Hello. Here is the storage status.') + ' ' + answerFor('all', snapshot()));
  while (!c.ended) {
    setCall('listening');
    let heard = '';
    try { heard = await hear(c); }
    catch (e) {
      if (c.ended) break;
      if (/not-allowed/.test(e.message)) { await say(c, t('The microphone is blocked. Allow microphone access for this page, then call again.')); break; }
      c.typedOnly = true;   // keep the call, but only by typing
      const msg = e.message === 'network' ? t('Speech recognition needs an internet connection. You can type your message.') : t('I could not hear you. Check the microphone, or type your message.');
      $('callText').textContent = msg;
      continue;
    }
    if (c.ended) break;
    if (!heard) {
      c.silent++;
      if (c.silent === 3) await say(c, t('Are you still there?'));
      else if (c.silent >= 5) { await say(c, t('I did not hear anything, so I am ending the call. Call again any time.')); break; }
      continue;
    }
    c.silent = 0;
    chat('me', heard);
    $('callText').textContent = heard;
    if (isGoodbye(heard)) { await say(c, t('Goodbye.')); break; }
    setCall('thinking');
    const r = await assistant.handle(heard);
    render();
    if (r.reply) await say(c, r.reply);
  }
  hangUp(c);
}
async function startCall() {
  if (call) return;
  callNotes('');
  const fp = await ensureFingerprint();
  if (!fp.ok) { callNotes(fp.message); return; }
  const c = call = { ended: false, silent: 0, typedOnly: false, queued: null, listenCtl: null, onTyped: null, started: Date.now(), timer: null };
  c.timer = setInterval(() => { const s = Math.floor((Date.now() - c.started) / 1000); $('callTimer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
  $('callTimer').textContent = '0:00'; $('callText').textContent = '';
  $('call').hidden = false;
  document.body.style.overflow = 'hidden';
  runCall(c);
}
$('callBtn').addEventListener('click', startCall);
$('callBtn2').addEventListener('click', startCall);
$('hangup').addEventListener('click', () => hangUp(call));
$('avatar').addEventListener('click', stopSpeaking);   // tap to interrupt the assistant
$('callForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('callIn').value.trim();
  $('callIn').value = '';
  if (!v || !call) return;
  stopSpeaking();
  if (call.onTyped) call.onTyped(v); else call.queued = v;
});

// ---- Language: the saved choice, else the browser's language; every label is drawn through t() ----
function applyStatic() {
  document.documentElement.lang = getLang();
  document.title = t('Cold Storage Monitor');
  document.querySelectorAll('[data-i18n]').forEach((e) => { if (e.dataset.en === undefined) e.dataset.en = e.textContent.trim(); e.textContent = t(e.dataset.en); });
  document.querySelectorAll('[data-i18n-attr]').forEach((e) => {
    for (const a of e.dataset.i18nAttr.split(',')) {
      if (!e.hasAttribute('data-en-' + a)) e.setAttribute('data-en-' + a, e.getAttribute(a) ?? '');
      e.setAttribute(a, t(e.getAttribute('data-en-' + a)));
    }
  });
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}
function chooseLang(l) {
  setLang(l);
  try { localStorage.setItem('lang', getLang()); } catch { /* the choice just is not remembered */ }
  applyStatic();
  if (loginErrorKind) $('loginError').textContent = connectErrorText(loginErrorKind);
  if (!$('app').hidden) render();
}
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => chooseLang(b.dataset.lang)));
{
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch { /* private mode: no saved choice */ }
  setLang(detectLang(saved, navigator.language));
  applyStatic();
}

window.addEventListener('online', () => { if (!$('app').hidden) render(); });
window.addEventListener('offline', () => { if (!$('app').hidden) render(); });
setInterval(() => { if (!$('app').hidden) render(); }, 10000);
