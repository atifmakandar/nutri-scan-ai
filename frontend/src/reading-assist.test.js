import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createEmptyScreening, updateScreeningReading } from './screening.js';
import {
  INSTRUMENT_FIELDS, INSTRUMENT_PROTOCOL, applyInstrumentCapture, createReadingAssistTranslator,
  isAwareCaptureTime, parseInstrumentFrame, readingCapturePayload, reconcileReadingCapture, validateInstrumentCapture,
} from './reading-assist.js';
import { readingAssistMessages } from './reading-assist-messages.js';
import { createVoiceReadingController, parseVoiceReading } from './reading-assist-voice.js';
import { createInstrumentController, serialAvailability } from './reading-assist-serial.js';

const frame = () => ({ device_id: 'test-transport-only', captured_at: '2026-10-15T10:30:00+05:30', calibration_status: 'reported_current', calibration_reference: 'reported-ref',
  readings: [{ field: 'moisture_pct', value: 62.5, unit: '%' }, { field: 'ph', value: 4.2, unit: 'pH' }] });
const code = (expected) => (error) => error.code === expected;
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('voice parses measured decimals, Indian languages, Devanagari and selected field limits', () => {
  for (const [text, field, locale, value] of [
    ['sixty two point five percent', 'moisture_pct', 'en-IN', 62.5], ['4.2 pH', 'ph', 'en', 4.2],
    ['minus twenty degrees Celsius', 'temperature_c', 'en', -20], ['०.०८', 'mold_score', 'hi', 0.08],
    ['चार दशमलव दो पीएच', 'ph', 'hi-IN', 4.2], ['बासठ दशमलव पांच प्रतिशत', 'moisture_pct', 'hi', 62.5],
    ['बासष्ट दशांश पाच टक्के', 'moisture_pct', 'mr-IN', 62.5], ['उणे वीस', 'temperature_c', 'mr', -20],
    ['one hundred percent', 'humidity_pct', 'en', 100], ['eight point eight', 'protein_pct', 'en', 8.8],
    ['four point two zero', 'ph', 'en', 4.2], ['0%', 'humidity_pct', 'en', 0],
  ]) assert.equal(parseVoiceReading(text, field, locale).value, value, text);
  for (const text of ['four two', '4 2', '4,2', '4 or 5', '4 and 5', '4 to 5', 'four point twenty', '4.2 4.3', '4.2 actually 4.3', '4.2 percent pH', 'about four', '1e1', '', 'दोन तीन']) {
    assert.throws(() => parseVoiceReading(text, 'ph', 'en'), code('ambiguous'), text);
  }
  assert.throws(() => parseVoiceReading('four percent', 'ph'), code('unit'));
  assert.throws(() => parseVoiceReading('24 Fahrenheit', 'temperature_c'), code('unit'));
  assert.throws(() => parseVoiceReading('24 kg', 'protein_pct'), code('unit'));
  assert.throws(() => parseVoiceReading('15', 'ph'), code('range'));
  assert.throws(() => parseVoiceReading('minus twenty one', 'temperature_c'), code('range'));
  assert.throws(() => parseVoiceReading('one point one', 'mold_score'), code('range'));
});

test('wire validation is strict, finite, timezone-aware and allowlisted', () => {
  assert.deepEqual(validateInstrumentCapture(frame()), frame());
  for (const captured_at of ['2026-02-30T00:00:00Z', '2026-10-15T00:00:00', '2026-10-15', '2026-10-15T24:00:00Z', '2026-10-15T00:00:00+24:00', 123]) {
    assert.equal(isAwareCaptureTime(captured_at), false);
  }
  const malformed = [
    { extra: true }, { captured_at: '2026-10-15T00:00:00' }, { device_id: ' x' }, { device_id: 'x\n' }, { device_id: 'x'.repeat(121) },
    { calibration_status: 'verified' }, { calibration_reference: '' }, { readings: [] },
    { readings: [frame().readings[0], frame().readings[0]] }, { readings: Array(8).fill(frame().readings[0]) },
    ...[
      { field: 'mold_score', value: 0.1, unit: '%' }, { field: 'ph', value: 4.2, unit: '%' },
      { field: 'ph', value: '4.2', unit: 'pH' }, { field: 'ph', value: NaN, unit: 'pH' },
      { field: 'ph', value: Infinity, unit: 'pH' }, { field: 'ph', value: true, unit: 'pH' },
      { field: 'ph', value: 15, unit: 'pH' }, { field: 'temperature_c', value: -21, unit: '°C' },
      { field: 'protein_pct', value: 101, unit: '%' }, { field: 'ph', value: 4.2, unit: 'pH', extra: true },
    ].map((record) => ({ readings: [record] })),
  ];
  for (const change of malformed) assert.throws(() => validateInstrumentCapture({ ...frame(), ...change }), code('frame'));
  assert.throws(() => parseInstrumentFrame(JSON.stringify(frame()).replace('"device_id":', '"device_id":"first","device_id":')), code('frame'));
  assert.throws(() => parseInstrumentFrame(JSON.stringify(frame()).replace('"value":62.5', '"value":10,"val\\u0075e":62.5')), code('frame'));
  assert.deepEqual(parseInstrumentFrame(JSON.stringify({ ...frame(), calibration_reference: 'quoted " { : } reference' })), { ...frame(), calibration_reference: 'quoted " { : } reference' });
  assert.match(INSTRUMENT_PROTOCOL, /not verification|never verification/);
  assert.equal(INSTRUMENT_FIELDS.length, 7);
});

test('only explicitly selected readings apply, immutable full form and consistent provenance after later edits', () => {
  const original = { ...createEmptyScreening('farm-one'), parent_metadata: { keep: true } };
  original.inputs.sensor.ph = 5;
  const snapshot = structuredClone(original);
  const next = applyInstrumentCapture(original, frame(), ['moisture_pct']);
  assert.deepEqual(original, snapshot);
  assert.equal(next.inputs.sensor.ph, 5);
  assert.equal(next.inputs.sensor.moisture_pct, 62.5);
  assert.equal(next.parent_metadata, original.parent_metadata);
  assert.equal(next.source_mode, 'esp32');
  assert.deepEqual(next.instrument_capture.readings, [frame().readings[0]]);
  assert.equal(next.device_id, frame().device_id);
  assert.equal(next.collected_at, frame().captured_at);
  assert.throws(() => applyInstrumentCapture(original, frame(), []), code('selection'));
  const both = applyInstrumentCapture(original, frame(), ['moisture_pct', 'ph']);
  const edited = reconcileReadingCapture(updateScreeningReading(both, 'ph', 5));
  assert.deepEqual(edited.instrument_capture.readings, [frame().readings[0]]);
  assert.equal(reconcileReadingCapture(updateScreeningReading(edited, 'moisture_pct', '')).instrument_capture, undefined);
  assert.equal(reconcileReadingCapture({ ...both, source_mode: 'manual' }).instrument_capture, undefined);
  assert.equal(reconcileReadingCapture({ ...both, device_id: 'other' }).instrument_capture, undefined);
  assert.equal(reconcileReadingCapture({ ...both, collected_at: '2026-10-15T10:30:00' }).instrument_capture, undefined);
  assert.equal(reconcileReadingCapture(updateScreeningReading(both, 'fiber_pct', 20)).instrument_capture, both.instrument_capture);
  assert.deepEqual(readingCapturePayload(edited).instrument_capture.readings, [frame().readings[0]]);
  assert.deepEqual(readingCapturePayload(original), {});
  const nutrient = applyInstrumentCapture(original, { ...frame(), readings: [{ field: 'protein_pct', value: 8.8, unit: '%' }] }, ['protein_pct']);
  assert.equal(nutrient.inputs.nir.protein_pct, 8.8);
  assert.equal(nutrient.inputs.sensor, original.inputs.sensor);
  assert.equal(nutrient.inputs.vision, original.inputs.vision);
  const precise = applyInstrumentCapture(original, { ...frame(), captured_at: '2026-10-15T10:30:00.123456+05:30' }, ['ph']);
  assert.equal(reconcileReadingCapture({ ...precise, collected_at: '2026-10-15T05:00:00.123457Z' }).instrument_capture, undefined);
  assert.ok(reconcileReadingCapture({ ...precise, collected_at: '2026-10-15T05:00:00.123456Z' }).instrument_capture);
});

function microphone(prefix = 'SpeechRecognition') {
  const instances = [];
  class Recognition {
    constructor() { instances.push(this); this.starts = 0; this.aborts = 0; }
    start() { this.starts++; }
    abort() { this.aborts++; }
  }
  return { browser: { [prefix]: Recognition }, instances };
}
const speechResult = (transcript) => ({ results: [Object.assign([{ transcript }], { isFinal: true })] });

test('microphone is opt-in; final transcript only, abort and stale callback protection', () => {
  const mock = microphone('webkitSpeechRecognition');
  const states = [];
  const reader = createVoiceReadingController({ browser: mock.browser, locale: 'mr', onState: (state) => states.push(state) });
  assert.equal(mock.instances.length, 0);
  assert.equal(reader.start(), false);
  reader.start({ consent: true });
  const first = mock.instances[0];
  assert.equal(first.lang, 'mr-IN');
  assert.equal(first.continuous, false);
  const stale = first.onresult;
  first.onresult(speechResult('बासष्ट'));
  assert.deepEqual(states.at(-1), { status: 'transcript', transcript: 'बासष्ट' });
  assert.equal(first.aborts, 1);
  const length = states.length;
  stale(speechResult('1'));
  assert.equal(states.length, length);
  reader.start({ consent: true });
  const late = mock.instances[1].onresult;
  reader.dispose();
  late(speechResult('5'));
  assert.equal(mock.instances[1].aborts, 1);
  assert.equal(states.length, length + 1);
});

test('microphone unsupported, permission, multiple results, end, timeout and explicit cancellation', async () => {
  const states = [];
  const unsupported = createVoiceReadingController({ browser: {}, onState: (state) => states.push(state) });
  unsupported.start({ consent: true });
  assert.equal(states.at(-1).status, 'unsupported');
  const mock = microphone();
  const reader = createVoiceReadingController({ browser: mock.browser, onState: (state) => states.push(state), maxTimeMs: 10 });
  reader.start({ consent: true }); mock.instances.at(-1).onerror({ error: 'not-allowed' });
  assert.equal(states.at(-1).status, 'permission');
  reader.start({ consent: true }); mock.instances.at(-1).onerror({ error: 'network' });
  assert.equal(states.at(-1).status, 'voice-error');
  reader.start({ consent: true }); mock.instances.at(-1).onresult({ results: [...speechResult('4').results, ...speechResult('5').results] });
  assert.equal(states.at(-1).status, 'ambiguous');
  reader.start({ consent: true }); mock.instances.at(-1).onend();
  assert.equal(states.at(-1).status, 'no-speech');
  reader.start({ consent: true }); reader.stop();
  assert.equal(states.at(-1).status, 'cancelled');
  reader.start({ consent: true }); await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(states.at(-1).status, 'timeout');
  reader.dispose();
});

function transport(chunks = []) {
  let resolveRead;
  const stats = { requests: 0, opens: 0, closes: 0, cancels: 0, releases: 0, locks: 0, listeners: 0 };
  const reader = {
    read: async () => chunks.length ? { done: false, value: chunks.shift() } : new Promise((resolve) => { resolveRead = resolve; }),
    cancel: async () => { stats.cancels++; resolveRead?.({ done: true }); },
    releaseLock: () => { stats.releases++; },
  };
  const port = { open: async (settings) => { stats.opens++; assert.equal(settings.baudRate, 115200); }, close: async () => { stats.closes++; },
    readable: { getReader: () => { stats.locks++; return reader; } } };
  const listeners = new Map();
  const serial = { requestPort: async () => { stats.requests++; return port; },
    addEventListener: (type, fn) => { stats.listeners++; listeners.set(type, fn); },
    removeEventListener: (type) => { stats.listeners--; listeners.delete(type); } };
  return { browser: { isSecureContext: true, navigator: { serial } }, stats, serial, port, reader,
    disconnect: () => listeners.get('disconnect')?.({ target: port }) };
}
const bytes = (value) => new TextEncoder().encode(value);

test('Web Serial reads split real-byte protocol frames including multibyte UTF-8, releases lock and closes', async () => {
  const capture = { ...frame(), readings: [...frame().readings, { field: 'temperature_c', value: 24, unit: '°C' }] };
  const wire = bytes(`${JSON.stringify(capture)}\r\n`);
  const degree = wire.indexOf(194);
  const mock = transport([wire.slice(0, 12), wire.slice(12, degree + 1), wire.slice(degree + 1)]);
  const states = [];
  const controller = createInstrumentController({ browser: mock.browser, onState: (state) => states.push(state) });
  assert.equal(mock.stats.requests, 0);
  const task = controller.capture();
  assert.equal(mock.stats.requests, 1, 'requestPort is inside the initiating gesture');
  await task;
  assert.deepEqual(states.at(-1), { status: 'review', capture });
  assert.equal(mock.stats.cancels, 1); assert.equal(mock.stats.releases, 1); assert.equal(mock.stats.closes, 1); assert.equal(mock.stats.listeners, 0);
  controller.dispose();
});

test('Web Serial enforces 16 KiB byte boundary, rejects bad data/UTF-8 and never accepts unterminated frames', async () => {
  for (const [chunks, expected] of [
    [[bytes('not json\n')], 'frame'], [[new Uint8Array([255, 10])], 'frame'],
    [[new Uint8Array(16385)], 'oversize'], [[bytes(JSON.stringify(frame()))], 'timeout'],
    [[bytes(`${JSON.stringify({ ...frame(), extra: true })}\n`)], 'frame'],
  ]) {
    const mock = transport(chunks); const states = [];
    const controller = createInstrumentController({ browser: mock.browser, onState: (state) => states.push(state), maxTimeMs: 10 });
    await controller.capture();
    assert.equal(states.at(-1).status, expected); assert.equal(mock.stats.releases, 1); assert.equal(mock.stats.closes, 1);
  }
  const text = JSON.stringify(frame());
  const mock = transport([bytes(text + ' '.repeat(16384 - bytes(text).length - 1) + '\n')]);
  const states = [];
  await createInstrumentController({ browser: mock.browser, onState: (state) => states.push(state) }).capture();
  assert.equal(states.at(-1).status, 'review');
});

test('Web Serial unsupported/insecure/permission/read failures are manual-fallback states', async () => {
  assert.equal(serialAvailability({ isSecureContext: false, navigator: { serial: {} } }), 'insecure');
  assert.equal(serialAvailability({ isSecureContext: true }), 'serial-unsupported');
  for (const name of ['NotAllowedError', 'NotFoundError', 'Error']) {
    const mock = transport(); const states = [];
    mock.serial.requestPort = () => Promise.reject(Object.assign(new Error('transport'), { name }));
    await createInstrumentController({ browser: mock.browser, onState: (state) => states.push(state) }).capture();
    assert.equal(states.at(-1).status, { NotAllowedError: 'serial-permission', NotFoundError: 'cancelled', Error: 'serial-error' }[name]);
  }
  const mock = transport(); const states = [];
  mock.reader.read = () => Promise.reject(new Error('USB lost'));
  await createInstrumentController({ browser: mock.browser, onState: (state) => states.push(state) }).capture();
  assert.equal(states.at(-1).status, 'serial-error'); assert.equal(mock.stats.releases, 1);
});

test('Web Serial cancellation, disconnect and unmount invalidate pending work and clean up', async () => {
  for (const action of ['cancel', 'disconnect', 'dispose']) {
    const mock = transport(); const states = [];
    const controller = createInstrumentController({ browser: mock.browser, onState: (state) => states.push(state) });
    const task = controller.capture(); await tick();
    const length = states.length;
    if (action === 'disconnect') mock.disconnect(); else controller[action]();
    await task;
    assert.equal(mock.stats.cancels, 1); assert.equal(mock.stats.releases, 1); assert.equal(mock.stats.closes, 1);
    if (action === 'dispose') assert.equal(states.length, length);
    else assert.equal(states.at(-1).status, action === 'disconnect' ? 'disconnected' : 'cancelled');
  }
});

test('native chooser and port-open resolving after disposal cannot start a stale capture', async () => {
  for (const stage of ['requestPort', 'open']) {
    const mock = transport(); const states = []; let resolve;
    (stage === 'requestPort' ? mock.serial : mock.port)[stage] = () => new Promise((done) => { resolve = done; });
    const controller = createInstrumentController({ browser: mock.browser, onState: (state) => states.push(state) });
    const task = controller.capture(); await tick(); controller.dispose(); const length = states.length;
    await task; resolve(stage === 'requestPort' ? mock.port : undefined); await tick();
    assert.equal(mock.stats.locks, 0); assert.equal(states.length, length);
    if (stage === 'requestPort') assert.equal(mock.stats.opens, 0);
    else assert.ok(mock.stats.closes >= 1);
  }
});

test('chooser timeout never opens a late port, and cancellation during cleanup cannot expose a review', async () => {
  const mock = transport(); const states = []; let choose;
  mock.serial.requestPort = () => new Promise((resolve) => { choose = resolve; });
  const controller = createInstrumentController({ browser: mock.browser, onState: (state) => states.push(state), maxTimeMs: 10 });
  await controller.capture();
  assert.equal(states.at(-1).status, 'timeout');
  choose(mock.port); await tick(); assert.equal(mock.stats.opens, 0);
  const cleanup = transport([bytes(`${JSON.stringify(frame())}\n`)]); let finish;
  cleanup.reader.cancel = () => new Promise((resolve) => { finish = resolve; });
  const pending = createInstrumentController({ browser: cleanup.browser, onState: (state) => states.push(state) });
  const task = pending.capture(); await tick(); pending.cancel(); finish(); await task;
  assert.equal(states.at(-1).status, 'cancelled');
  assert.equal(cleanup.stats.releases, 1); assert.equal(cleanup.stats.closes, 1);
});

let server; let ReadingAssist;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: false } });
  ({ default: ReadingAssist } = await server.ssrLoadModule('/src/ReadingAssist.jsx'));
});
after(async () => { await server?.close(); });

test('SSR has opt-in controls only, accessible status, protocol, draft notice and complete Hindi/Marathi fallbacks', () => {
  for (const locale of ['en', 'hi', 'mr']) {
    const html = renderToStaticMarkup(createElement(ReadingAssist, { form: createEmptyScreening(), locale,
      onChange: () => assert.fail('no automatic form writes') }));
    assert.match(html, /role="status" aria-live="polite"/);
    assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /checked=""|type="submit"|<audio|autoplay/);
    assert.match(html, /device_id/); assert.match(html, /16384|16 KiB/);
    assert.match(html, new RegExp(`lang="${locale}"`));
    if (locale !== 'en') {
      for (const text of ['Voice entry', 'Start microphone', 'Choose port and capture', 'Offline drafts save readings only']) assert.ok(!html.includes(text), text);
      const g = createReadingAssistTranslator((key) => key, locale);
      for (const [key, translated] of Object.entries(readingAssistMessages[locale])) {
        assert.ok(translated.length); assert.equal(g(key, { field: 'X', old: 1, value: 2, unit: '%' }).includes('{field}'), false);
        assert.deepEqual([...key.matchAll(/\{\w+\}/g)].map((x) => x[0]).sort(), [...translated.matchAll(/\{\w+\}/g)].map((x) => x[0]).sort());
      }
    }
  }
});
