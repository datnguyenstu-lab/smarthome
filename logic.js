// Pure helpers for the page; no DOM, no MQTT, so they can be tested with `node --test`.

const ALERTS = {
  hot: { level: 'warn', text: 'Room too hot' },
  intruder: { level: 'error', text: 'Presence while Away is on' },
  temp_fault: { level: 'warn', text: 'Temperature sensor not responding' },
};

export function describeBanner({ alert, status }) {
  if (status !== 'online') return { level: 'error', text: 'Board offline' };
  if (!alert || alert === 'none') return { level: 'ok', text: '' };
  return ALERTS[alert] ?? { level: 'warn', text: `Alert: ${alert}` };
}

export function ageText(nowSec, thenSec) {
  if (typeof thenSec !== 'number' || Number.isNaN(thenSec)) return '';
  const d = nowSec - thenSec;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return `${Math.floor(d / 86400)} d ago`;
}

export function onOff(payload) {
  if (payload === 'on') return true;
  if (payload === 'off') return false;
  return null;
}
