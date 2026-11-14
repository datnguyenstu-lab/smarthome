import { describeBanner, ageText, onOff, describeIssues, guideState, validateSettings, settingsMessage, lastSeenText,
  formatUptime, signalText, resetText, dialFraction, sameSettings, describeSelfTest, memoryText, describeVersions, formatBuild, describeAbout, describeDoor } from './logic.js';
import { parseChunk, LogAssembler, requestMessage } from './logsync.js';

const BROKER = 'wss://hff38f13.ala.asia-southeast1.emqxsl.com:8084/mqtt';
const APP_VERSION = '2.0.0';  // the page's own release: keep major.minor equal to the board firmware's
const LIGHTS = { 2: 'Main storage', 3: 'Secondary storage' };  // led 1 (yellow) is the board's status light, not shown
const DEFAULTS = { hot_on_c: 33, door_open_s: 10, status_led: true };
const VIEWS = { home: 'viewHome', health: 'viewHealth', settings: 'viewSettings', guide: 'viewGuide', about: 'viewAbout' };
const $ = (id) => document.getElementById(id);
const nowSec = () => Date.now() / 1000;

const state = { status: undefined, temp: undefined, door: undefined, doorChanged: undefined, alert: 'none',
  away: false, led: { 2: false, 3: false }, health: null, selftest: null, settings: null, info: null, about: null };
let client = null, everConnected = false, connected = false, ready = false;
let view = 'home', guideDismissed = false, celebrating = false;
let pending = null, dirty = false;                 // settings sent and waiting for the echo / person is editing
let selfRunning = false, selfBefore = 0, selfTimer = null, selfNote = '';
let dl = null;  // log download in progress: {files, i, asm, texts, retries, timer}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function alertBlock(title, detail, cls) { const d = el('div', 'alertb' + (cls ? ' ' + cls : '')); d.append(el('b', '', title)); if (detail) d.append(detail); return d; }
function json(buf) { try { return JSON.parse(buf.toString()); } catch { return null; } }
function publish(topic, payload, retain = false) { if (client && connected) client.publish(topic, payload, { retain }); }

function setView(v) {
  view = v;
  for (const [name, id] of Object.entries(VIEWS)) $(id).hidden = name !== v;
  render();
}

function renderHome() {
  const online = state.status === 'online';
  $('status').className = 'status' + (online ? ' online' : '');
  $('statusText').textContent = online ? 'online' : 'offline';

  const hasTemp = online && state.temp !== undefined && state.temp !== '';
  const t = Number(state.temp);
  const hot = state.settings ? Number(state.settings.hot_on_c) : DEFAULTS.hot_on_c;
  $('temp').textContent = hasTemp ? state.temp : '--';
  $('arc').setAttribute('stroke-dasharray', `${((hasTemp ? dialFraction(t) : 0) * 314.16).toFixed(1)} 400`);
  $('arc').setAttribute('stroke', hasTemp && t >= hot ? 'var(--bad)' : 'var(--ok)');
  const th = Math.PI * (1 - dialFraction(hot)), c = Math.cos(th), s = Math.sin(th);
  const tick = $('hotTick');
  tick.setAttribute('x1', (120 + 88 * c).toFixed(1)); tick.setAttribute('y1', (120 - 88 * s).toFixed(1));
  tick.setAttribute('x2', (120 + 112 * c).toFixed(1)); tick.setAttribute('y2', (120 - 112 * s).toFixed(1));
  const lab = $('hotLabel');
  lab.setAttribute('x', (120 + 124 * c).toFixed(1)); lab.setAttribute('y', Math.max(9, 120 - 124 * s).toFixed(1));
  lab.textContent = `alert at ${hot}°`;

  const d = describeDoor(state.door, state.doorChanged, nowSec());   // the IR sensor is the door sensor
  $('door').textContent = online ? d.label : '--';
  $('age').textContent = online && d.since ? `since ${d.since}` : '';
  $('doorRow').classList.toggle('alarm', online && d.state === 'open');
  for (const b of document.querySelectorAll('.lamp')) {
    const n = b.dataset.led;
    b.querySelector('.lname').textContent = LIGHTS[n];
    b.setAttribute('aria-label', LIGHTS[n]);
    b.setAttribute('aria-pressed', String(!!state.led[n]));
    b.disabled = !online;
  }
  $('away').setAttribute('aria-checked', String(state.away));
  $('away').disabled = !online;

  const issues = online ? describeIssues(state.health?.issues) : [];
  const box = $('alerts');
  box.replaceChildren();
  if (!connected) box.append(alertBlock('Reconnecting…', '', 'warn'));
  else if (online) {
    const b = describeBanner({ alert: state.alert, status: state.status });
    const covered = state.alert === 'temp_fault' && issues.some((i) => i.code === 'temp_fault');
    if (b.level !== 'ok' && !covered) box.append(alertBlock(b.text, '', b.level === 'warn' ? 'warn' : ''));
    for (const i of issues) box.append(alertBlock(i.text, i.fix, ''));
  }
  $('healthLine').textContent = issues.length ? `${issues.length} problem${issues.length > 1 ? 's' : ''} found` : 'Health: no problems found';
  $('guideLink').hidden = !(connected && ready && state.status !== 'online');
}

function renderHealth() {
  const online = state.status === 'online';
  const h = state.health || {};
  $('hSignal').textContent = h.rssi === undefined ? '--' : `${signalText(h.rssi)} · ${h.rssi} dBm`;
  $('hCloud').textContent = online ? 'Connected' : 'Not connected';
  $('hMem').textContent = memoryText(h.heap) || '--';
  $('hUp').textContent = formatUptime(h.uptime_s) || '--';
  $('hReset').textContent = h.reset ? resetText(h.reset) : '--';
  $('hFw').textContent = h.fw || '--';
  const box = $('hIssues');
  box.replaceChildren();
  const issues = describeIssues(h.issues);
  if (!issues.length) { const r = el('div', 'row'); r.append(el('span', '', 'None found')); box.append(r); }
  for (const i of issues) box.append(alertBlock(i.text, i.fix, ''));
  const st = describeSelfTest(state.selftest);
  $('hSelf').textContent = selfRunning ? 'Running…' : st ? st.text : 'not run yet';
  $('runSelf').disabled = !online || selfRunning;
  $('dlLog').disabled = !online || !!dl;
  $('selfNote').textContent = selfNote || 'The yellow light on the board shows a pattern while the test runs.';
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
  if (pending) note.textContent = online ? 'Sent. Waiting for the board…' : 'Saved. The board applies it when it comes back online.';
  else if (!dirty && state.settings) { note.textContent = 'Applied on the board.'; note.className = 'note good'; }
  else note.textContent = '';
  $('setupBtn').disabled = !online;
}

function updateGuide() {
  if (!ready || !connected) return;
  const gs = guideState({ status: state.status, healthTs: state.health?.ts, nowSec: nowSec() });
  if (gs === 'ok') {
    guideDismissed = false;
    if (view === 'guide' && !celebrating) {
      celebrating = true;
      $('gOk').hidden = false; $('gSteps').hidden = true; $('gStatus').textContent = 'Online';
      setTimeout(() => { celebrating = false; $('gOk').hidden = true; $('gSteps').hidden = false; if (view === 'guide') setView('home'); }, 2500);
    }
    return;
  }
  $('gTitle').textContent = gs === 'hung' ? 'The board stopped reporting' : "The board isn't answering";
  $('gSeen').textContent = lastSeenText(nowSec(), state.health?.ts) + '. Let’s get it back online.';
  $('gStatus').textContent = 'Offline';
  if (!guideDismissed && view !== 'guide' && !celebrating) setView('guide');
}

function renderAbout() {
  const fw = state.info?.fw ?? state.health?.fw;
  const v = describeVersions(APP_VERSION, fw);
  $('footVersions').textContent = `Page ${APP_VERSION} · Board ${fw || '--'}`;
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
    for (const [id, v] of [['aName', who.name], ['aId', who.studentId], ['aClass', who.className], ['aYear', who.year]]) {
      $(id).textContent = v; $(id).parentElement.hidden = !v;
    }
  }
  const box = $('vCompat');
  box.replaceChildren();
  if (v.level === 'ok') { const r = el('div', 'ok-banner', v.text); box.append(r); }
  else box.append(alertBlock(v.level === 'warn' ? 'Versions differ' : 'Version unknown', v.text, v.level === 'warn' ? '' : 'warn'));
}

function render() { renderHome(); renderHealth(); renderSettings(); renderAbout(); updateGuide(); }

function handle(topic, buf) {
  const v = buf.toString();
  const t = topic.replace(/^smarthome\//, '');
  if (t === 'status') state.status = v;
  else if (t === 'temp') state.temp = v;
  else if (t === 'door') state.door = v;
  else if (t === 'door_changed') state.doorChanged = Number(v);
  else if (t === 'alert') state.alert = v;
  else if (t === 'state/away') { const o = onOff(v); if (o !== null) state.away = o; }
  else if (t === 'state/led2' || t === 'state/led3') { const o = onOff(v); if (o !== null) state.led[t.slice(-1)] = o; }
  else if (t === 'health') state.health = json(buf);
  else if (t === 'settings') state.settings = json(buf);
  else if (t === 'info') state.info = json(buf);
  else if (t === 'about') state.about = describeAbout(json(buf));
  else if (t === 'log/index') onLogIndex(json(buf));
  else if (t === 'log/data') onLogChunk(parseChunk(buf));
  else if (t === 'selftest') {
    state.selftest = json(buf);
    if (selfRunning && state.selftest && state.selftest.ts > selfBefore) { selfRunning = false; selfNote = 'Done.'; clearTimeout(selfTimer); }
  }
  render();
}

function connect(username, password) {
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
  client.on('message', handle);
  client.on('error', (e) => { if (!everConnected) fail(e); });
  client.on('close', () => { connected = false; if (everConnected) { ready = false; state.status = undefined; render(); } });
  setTimeout(() => { if (!everConnected) fail(); }, 12000);
}

function fail() {
  if (client) { client.end(true); client = null; }
  $('loginError').textContent = 'Login failed. Check your username and password.';
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
  if (!confirm('Restart the board into setup mode? It goes offline until you join its "SmartHome-Setup" network.')) return;
  publish('smarthome/cmd/setup', '1');
  $('sNote').textContent = 'Restart command sent. Follow the steps on the Home screen when the board goes offline.';
});

// ---- Download the board's event log: list the files, pull each in chunks, re-request after a stall, save one file ----
function dlNote(text, cls = '') { $('dlNote').textContent = text; $('dlNote').className = 'note ' + cls; }
function dlFail(msg) {
  if (dl) clearTimeout(dl.timer);
  dl = null; $('dlLog').textContent = 'Try again'; dlNote(msg, 'bad'); render();
}
function dlRequest() {
  const f = dl.files[dl.i];
  publish('smarthome/cmd/log', requestMessage('get', f.seq, dl.asm.nextOffset()));
  clearTimeout(dl.timer); dl.timer = setTimeout(dlStall, 3000);
  dlNote(`Downloading file ${dl.i + 1} of ${dl.files.length}…`);
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
  let blob = new Blob([text], { type: 'text/plain' }), ext = 'txt';
  if (typeof CompressionStream !== 'undefined') {
    try { blob = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); ext = 'txt.gz'; } catch { /* plain text is fine */ }
  }
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `smarthome-log-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  $('dlLog').textContent = 'Download log';
  dlNote(`Saved ${text.split('\n').length - 1} log lines.`, 'good');
  render();
}
$('dlLog').addEventListener('click', () => {
  if (dl) return;
  dl = { files: null, i: 0, asm: null, texts: [], retries: 0, timer: null };
  $('dlLog').textContent = 'Download log';
  dlNote('Asking the board for its log…');
  publish('smarthome/cmd/log', requestMessage('list'));
  dl.timer = setTimeout(() => dlFail('The board did not answer. Try again.'), 8000);
  render();
});

setInterval(() => { if (!$('app').hidden) render(); }, 10000);
