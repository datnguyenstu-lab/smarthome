// Speech in and out with the browser's own engines (best on Chrome for Android). Thin wrappers only; the
// conversation logic is in assistant.js. Recognition is paused while the assistant speaks, otherwise the phone
// hears the assistant's own voice, so the person interrupts by tapping instead of talking over it.
const Recognition = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const locale = (lang) => (lang === 'vi' ? 'vi-VN' : 'en-US');

export const listenSupported = () => !!Recognition();
export const speakSupported = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

// Resolves with the sentence heard, or '' for silence or an abort. Rejects with Error('not-allowed') etc. for real failures.
export function listenOnce(lang, signal) {
  return new Promise((resolve, reject) => {
    const r = new (Recognition())();
    r.lang = locale(lang); r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
    let text = '';
    r.onresult = (e) => { text = e.results[0]?.[0]?.transcript ?? ''; };
    r.onerror = (e) => (['no-speech', 'aborted'].includes(e.error) ? resolve('') : reject(new Error(e.error)));
    r.onend = () => resolve(text);
    signal?.addEventListener('abort', () => { try { r.abort(); } catch { /* already stopped */ } });
    try { r.start(); } catch (e) { reject(e); }
  });
}

let utterance = null;
export function speak(text, lang) {
  return new Promise((resolve) => {
    if (!speakSupported()) return resolve();
    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = locale(lang);
      const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang === 'vi' ? 'vi' : 'en'));
      if (voice) u.voice = voice;
      u.onend = u.onerror = () => resolve();
      utterance = u;   // keep a reference: some browsers drop an utterance that is garbage collected mid-speech
      synth.speak(u);
    } catch { resolve(); }   // a broken speech engine must not end the call: the text is still on screen
  });
}
export function stopSpeaking() { if (speakSupported()) window.speechSynthesis.cancel(); utterance = null; }
