import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGuidanceTranslator, createSpeechController, getMeasurementGuidance,
  interpolateGuidance, matchingSpeechVoice, measurementHelpText, speechLanguage,
} from './guidance.js';

const voice = (lang, extra = {}) => ({ lang, name: lang, ...extra });

function fakeBrowser(initialVoices = []) {
  let voices = initialVoices;
  const listeners = new Set();
  const spoken = [];
  let cancellations = 0;
  const synthesis = {
    getVoices: () => voices,
    speak: (utterance) => spoken.push(utterance),
    cancel: () => { cancellations += 1; },
    addEventListener: (event, listener) => { assert.equal(event, 'voiceschanged'); listeners.add(listener); },
    removeEventListener: (event, listener) => { assert.equal(event, 'voiceschanged'); listeners.delete(listener); },
  };
  return {
    browser: { speechSynthesis: synthesis, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } },
    spoken,
    listeners,
    get cancellations() { return cancellations; },
    setVoices(next) { voices = next; for (const listener of listeners) listener(); },
  };
}

test('voice selection prefers the Indian locale, and never another language or an unknown locale', () => {
  const english = voice('en-IN', { default: true });
  const hindi = voice('hi-IN');
  const hindiLocal = voice('hi-IN', { localService: true });
  const marathi = voice('mr-IN');
  const voices = [english, voice('hi-US'), hindi, hindiLocal, marathi];
  assert.equal(speechLanguage('HI_in'), 'hi-IN');
  assert.equal(speechLanguage('mr-IN'), 'mr-IN');
  assert.equal(speechLanguage('fr'), null);
  assert.equal(matchingSpeechVoice(voices, 'hi'), hindiLocal);
  assert.equal(matchingSpeechVoice(voices, 'en'), english);
  assert.equal(matchingSpeechVoice(voices, 'mr'), marathi);
  assert.equal(matchingSpeechVoice([english, marathi], 'hi'), null);
  assert.equal(matchingSpeechVoice(voices, 'fr'), null);
  assert.equal(matchingSpeechVoice([voice('en-US')], 'en').lang, 'en-US');
  assert.equal(matchingSpeechVoice([{}, { lang: null }], 'hi'), null);
});

test('constructing a reader, discovering voices and finishing never start reading', () => {
  const fake = fakeBrowser([voice('en-IN'), voice('hi-IN')]);
  const statuses = [];
  const reader = createSpeechController({ browser: fake.browser, locale: 'hi', onState: (state) => statuses.push(state.status) });
  assert.deepEqual(statuses, ['ready']);
  assert.equal(fake.spoken.length, 0);
  assert.equal(reader.read('निजी सलाह'), true);
  const utterance = fake.spoken[0];
  assert.equal(utterance.text, 'निजी सलाह');
  assert.equal(utterance.lang, 'hi-IN');
  assert.equal(utterance.voice.lang, 'hi-IN');
  assert.equal(reader.getState().status, 'starting');
  utterance.onstart();
  assert.equal(reader.getState().status, 'speaking');
  utterance.onend();
  assert.equal(reader.getState().status, 'ended');
  assert.equal(utterance.text, '');
  fake.setVoices([voice('hi-IN')]);
  assert.equal(fake.spoken.length, 1);
  reader.dispose();
});

test('delayed voices update availability but require a fresh click, with no retained private text', () => {
  const fake = fakeBrowser();
  const reader = createSpeechController({ browser: fake.browser, locale: 'mr' });
  assert.equal(reader.getState().status, 'unavailable');
  assert.equal(reader.read('previous account text'), false);
  fake.setVoices([voice('en-IN')]);
  assert.equal(reader.getState().status, 'unavailable');
  fake.setVoices([voice('mr-IN')]);
  assert.equal(reader.getState().status, 'ready');
  assert.equal(fake.spoken.length, 0);
  assert.equal(reader.read('सध्याचा मजकूर'), true);
  assert.equal(fake.spoken[0].text, 'सध्याचा मजकूर');
  assert.equal(fake.spoken[0].voice.lang, 'mr-IN');
  reader.dispose();
});

test('unsupported and blocked browser APIs retain a usable state without throwing', () => {
  for (const browser of [undefined, {}, { speechSynthesis: {} }, {
    get speechSynthesis() { throw new Error('blocked'); },
  }]) {
    const reader = createSpeechController({ browser });
    assert.equal(reader.getState().status, 'unsupported');
    assert.equal(reader.read('Readable fallback'), false);
    assert.doesNotThrow(() => { reader.stop(); reader.dispose(); reader.dispose(); });
  }
});

test('missing language voices and unknown locales never speak a browser default', () => {
  const fake = fakeBrowser([voice('en-IN', { default: true })]);
  for (const locale of ['hi', 'mr', 'fr']) {
    const reader = createSpeechController({ browser: fake.browser, locale });
    assert.equal(reader.read('Private text'), false);
    assert.equal(reader.getState().status, 'unavailable');
    reader.dispose();
  }
  assert.equal(fake.spoken.length, 0);
});

test('stop cancels both queued and speaking utterances and ignores late browser callbacks', () => {
  for (const start of [false, true]) {
    const fake = fakeBrowser([voice('en-IN')]);
    const reader = createSpeechController({ browser: fake.browser });
    reader.read('Private result');
    const utterance = fake.spoken[0];
    const lateStart = utterance.onstart;
    const lateEnd = utterance.onend;
    const lateError = utterance.onerror;
    if (start) utterance.onstart();
    const before = fake.cancellations;
    reader.stop();
    assert.equal(fake.cancellations, before + 1);
    assert.equal(reader.getState().status, 'stopped');
    assert.equal(utterance.text, '');
    assert.equal(utterance.onend, null);
    lateStart(); lateEnd(); lateError({ error: 'network' });
    assert.equal(reader.getState().status, 'stopped');
    reader.stop();
    assert.equal(fake.cancellations, before + 1);
    reader.dispose();
  }
});

test('text/locale replacement and keyed account teardown dispose old readers before new reading', () => {
  const fake = fakeBrowser([voice('en-IN'), voice('mr-IN')]);
  const states = [];
  const old = createSpeechController({ browser: fake.browser, onState: (state) => states.push(state.status) });
  old.read('Account A private report');
  const oldUtterance = fake.spoken[0];
  const lateEnd = oldUtterance.onend;
  const before = fake.cancellations;
  old.dispose();
  assert.equal(fake.cancellations, before + 1);
  assert.equal(fake.listeners.size, 0);
  assert.equal(oldUtterance.text, '');
  const count = states.length;
  const next = createSpeechController({ browser: fake.browser, locale: 'mr' });
  fake.setVoices([voice('en-IN'), voice('mr-IN')]);
  lateEnd();
  assert.equal(old.read('stale text'), false);
  assert.equal(states.length, count);
  assert.equal(fake.spoken.length, 1);
  assert.equal(next.read('नवीन खात्याचा मजकूर'), true);
  assert.equal(fake.spoken[1].voice.lang, 'mr-IN');
  next.dispose();
  assert.equal(fake.listeners.size, 0);
});

test('speech errors stop reading, expose retry state and never use a fallback voice', () => {
  const fake = fakeBrowser([voice('en-IN'), voice('hi-IN')]);
  const reader = createSpeechController({ browser: fake.browser, locale: 'hi' });
  reader.read('पहला पाठ');
  fake.spoken[0].onerror({ error: 'language-unavailable' });
  assert.equal(reader.getState().status, 'error');
  assert.equal(fake.spoken.length, 1);
  assert.equal(fake.spoken[0].text, '');
  assert.equal(reader.read('दूसरा पाठ'), true);
  assert.equal(fake.spoken[1].voice.lang, 'hi-IN');
  fake.spoken[1].onerror({ error: 'interrupted' });
  assert.equal(reader.getState().status, 'stopped');
  reader.dispose();
});

test('synchronous browser speech failures and voice-list failures are recoverable', () => {
  const fake = fakeBrowser([voice('en-IN')]);
  const reader = createSpeechController({ browser: fake.browser });
  fake.browser.speechSynthesis.speak = () => { throw new Error('synthesis blocked'); };
  assert.equal(reader.read('Private text'), false);
  assert.equal(reader.getState().status, 'error');
  fake.browser.speechSynthesis.getVoices = () => { throw new Error('voice list blocked'); };
  assert.equal(reader.read('Private text'), false);
  assert.equal(reader.getState().status, 'unavailable');
  reader.dispose();
});

test('a disappearing language voice cancels reading and never auto-resumes when it returns', () => {
  const fake = fakeBrowser([voice('mr-IN')]);
  const reader = createSpeechController({ browser: fake.browser, locale: 'mr' });
  reader.read('चालू मजकूर');
  fake.setVoices([voice('en-IN')]);
  assert.equal(reader.getState().status, 'unavailable');
  assert.equal(fake.spoken[0].text, '');
  fake.setVoices([voice('mr-IN')]);
  assert.equal(reader.getState().status, 'ready');
  assert.equal(fake.spoken.length, 1);
  reader.dispose();
});

test('multiple help buttons share queue ownership without idle cleanup cancelling the active button', () => {
  const fake = fakeBrowser([voice('en-IN')]);
  const first = createSpeechController({ browser: fake.browser });
  const second = createSpeechController({ browser: fake.browser });
  const idle = createSpeechController({ browser: fake.browser });
  first.read('First');
  second.read('Second');
  assert.equal(first.getState().status, 'stopped');
  assert.equal(fake.spoken[0].text, '');
  const before = fake.cancellations;
  first.dispose(); idle.dispose();
  assert.equal(fake.cancellations, before);
  second.dispose();
  assert.equal(fake.cancellations, before + 1);
  assert.equal(fake.listeners.size, 0);
});

test('legacy delayed-voice subscriptions preserve existing handlers and clean up out of order', () => {
  const fake = fakeBrowser();
  const synthesis = fake.browser.speechSynthesis;
  delete synthesis.addEventListener;
  delete synthesis.removeEventListener;
  let externalCalls = 0;
  const previous = () => { externalCalls += 1; };
  synthesis.onvoiceschanged = previous;
  const first = createSpeechController({ browser: fake.browser });
  const second = createSpeechController({ browser: fake.browser });
  first.dispose();
  fake.setVoices([voice('en-IN')]);
  synthesis.onvoiceschanged({ type: 'voiceschanged' });
  assert.equal(externalCalls, 1);
  assert.equal(second.getState().status, 'ready');
  assert.equal(fake.spoken.length, 0);
  second.dispose();
  assert.equal(synthesis.onvoiceschanged, previous);
});

test('blank text never reaches speech synthesis', () => {
  const fake = fakeBrowser([voice('en-IN')]);
  const reader = createSpeechController({ browser: fake.browser });
  for (const text of ['', '  \n', undefined, 123]) assert.equal(reader.read(text), false);
  assert.equal(reader.getState().status, 'empty');
  assert.equal(fake.spoken.length, 0);
  reader.dispose();
});

test('translation works independently, respects parent locale and preserves uninterpreted placeholders', () => {
  const parent = Object.assign((key) => key, { locale: 'mr' });
  assert.equal(createGuidanceTranslator(parent)('Listen'), 'ऐका');
  assert.equal(createGuidanceTranslator(parent, 'hi')('Listen'), 'सुनें');
  assert.equal(createGuidanceTranslator(undefined)('Listen'), 'Listen');
  assert.equal(createGuidanceTranslator(() => 'custom')('Listen'), 'custom');
  assert.equal(interpolateGuidance('{count} {unknown} {zero}', { count: 3, zero: 0 }), '3 {unknown} 0');
  const text = measurementHelpText('protein_pct', undefined, 'hi');
  assert.match(text, /प्रयोगशाला/);
  assert.doesNotMatch(text, /Copy protein/);
  assert.equal(getMeasurementGuidance('unknown'), undefined);
  assert.equal(measurementHelpText('unknown'), '');
});
