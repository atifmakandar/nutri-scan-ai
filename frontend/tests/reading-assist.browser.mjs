/** Real browser UI/lifecycle tests with MOCK microphone/serial transports only.
 * Uses an existing Playwright installation; no API, accounts or hardware required.
 * Run from frontend: NUTRISCAN_PLAYWRIGHT_MODULE=/existing/playwright node tests/reading-assist.browser.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUTRISCAN_PLAYWRIGHT_MODULE || 'playwright');
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import ReadingAssist from '/src/ReadingAssist.jsx';
import { createEmptyScreening, updateScreeningReading } from '/src/screening.js';
import { reconcileReadingCapture } from '/src/reading-assist.js';
const root = createRoot(document.getElementById('root'));
window.writes = []; window.submits = 0;
window.form = createEmptyScreening('test-farm');
window.options = { account: 'one', locale: 'en', disabled: false, mounted: true };
window.draw = (changes = {}) => {
  Object.assign(window.options, changes);
  root.render(React.createElement(React.StrictMode, null, window.options.mounted ? React.createElement('form', {
    onSubmit: (event) => { event.preventDefault(); window.submits++; }
  }, React.createElement(ReadingAssist, { key: window.options.account, form: window.form, locale: window.options.locale, disabled: window.options.disabled,
    onChange: (next) => { window.writes.push(next); window.form = reconcileReadingCapture(next); window.draw(); }
  })) : null));
};
window.replaceForm = () => { window.form = structuredClone(window.form); window.draw(); };
window.edit = (field, value) => { window.form = reconcileReadingCapture(updateScreeningReading(window.form, field, value)); window.draw(); };
window.draw();
</script></body></html>`;

const cacheDir = await mkdtemp(join(tmpdir(), 'nutriscan-reading-assist-test-'));
const server = await createServer({ root: process.cwd(), cacheDir, configFile: false, server: { host: '127.0.0.1', port: 0, hmr: false },
  plugins: [{ name: 'reading-assist-test-harness', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url !== '/reading-assist-harness.html') return next();
      response.setHeader('Content-Type', 'text/html');
      response.end(await vite.transformIndexHtml(request.url, html));
    });
  } }] });
let browser;
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    window.mics = []; window.mockSerial = { requests: 0, opens: 0, closes: 0, cancels: 0, releases: 0, listeners: new Set() };
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      constructor() { window.mics.push(this); this.aborts = 0; }
      start() { this.stale = this.onresult; }
      abort() { this.aborts++; }
    } });
    window.say = (text, stale = false) => {
      const mic = window.mics.at(-1);
      (stale ? mic.stale : mic.onresult)?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] });
    };
    const s = window.mockSerial;
    const port = {
      open: async () => { s.opens++; }, close: async () => { s.closes++; },
      readable: { getReader: () => ({
        read: () => new Promise((resolve, reject) => { s.resolve = resolve; s.reject = reject; }),
        cancel: async () => { s.cancels++; s.resolve?.({ done: true }); }, releaseLock: () => { s.releases++; },
      }) },
    };
    s.port = port;
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      requestPort: () => { s.requests++; if (s.deny) return Promise.reject(Object.assign(new Error('test denial'), { name: 'NotAllowedError' }));
        if (s.delayChoice) return new Promise((resolve) => { s.choose = () => resolve(port); }); return Promise.resolve(port); },
      addEventListener: (type, fn) => s.listeners.add(fn), removeEventListener: (type, fn) => s.listeners.delete(fn),
    } });
    window.sendBytes = (bytes) => { const resolve = s.resolve; s.resolve = null; resolve({ done: false, value: new Uint8Array(bytes) }); };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const openCards = async () => {
    for (const name of ['Voice entry', 'Read from instrument (USB serial)']) {
      const summary = page.locator('summary').filter({ hasText: name });
      if (!await summary.evaluate((element) => element.parentElement.open)) await summary.click();
    }
  };
  const readyVoice = async () => {
    await page.getByLabel('Target reading', { exact: true }).selectOption('ph');
    await page.getByLabel('I agree to microphone speech processing for voice entry.', { exact: true }).check();
  };
  const readySerial = async () => {
    await page.getByLabel('My instrument uses this protocol and 115200 baud.', { exact: true }).check();
  };
  const startSerial = async () => {
    await readySerial(); await button('Choose port and capture').click();
    await page.getByText('Receiving instrument bytes. You can cancel.', { exact: true }).waitFor();
  };
  const wire = (capture) => Array.from(new TextEncoder().encode(JSON.stringify(capture) + '\n'));
  const capture = { device_id: 'MOCK-transport-only', captured_at: '2026-10-15T10:30:00+05:30', calibration_status: 'reported_expired',
    calibration_reference: 'MOCK-device-report', readings: [{ field: 'moisture_pct', value: 62, unit: '%' }, { field: 'ph', value: 4.2, unit: 'pH' }] };

  await page.goto(server.resolvedUrls.local[0] + 'reading-assist-harness.html');
  await openCards();
  assert.deepEqual(await page.evaluate(() => [window.writes.length, window.mics.length, window.mockSerial.requests, window.submits]), [0, 0, 0, 0]);
  assert.equal(await button('Start microphone').isDisabled(), true);
  await readyVoice(); await button('Start microphone').click();
  await page.evaluate(() => window.say('four point two pH'));
  await button('Confirm this reading').waitFor();
  assert.equal(await page.evaluate(() => window.writes.length), 0);
  await button('Confirm this reading').click();
  await page.waitForFunction(() => window.writes.length === 1);
  assert.equal(await page.evaluate(() => window.form.inputs.sensor.ph), 4.2);
  assert.equal(await page.evaluate(() => window.form.inputs.sensor.moisture_pct), '');
  assert.equal(await page.evaluate(() => window.submits), 0);

  // Edits invalidate candidates and abort listening before stale callback delivery.
  await button('Start microphone').click();
  await page.getByLabel('Transcript or typed value').fill('5 pH');
  await page.evaluate(() => window.say('6 pH', true));
  assert.equal(await button('Confirm this reading').count(), 0);
  await button('Review value').click();
  await button('Confirm this reading').waitFor();
  await page.getByLabel('Transcript or typed value').fill('4 or 5');
  assert.equal(await button('Confirm this reading').count(), 0);
  await button('Review value').click();
  await page.getByText(/Use exactly one clear value/).waitFor();

  // Form replacement, speech language, locale, disability and account-unmount cleanup.
  for (const change of ['form', 'language', 'locale', 'disabled', 'account', 'unmount']) {
    await page.evaluate(() => window.draw({ locale: 'en', disabled: false, mounted: true }));
    await openCards(); await readyVoice(); await button('Start microphone').click();
    const count = await page.evaluate(() => window.mics.length);
    if (change === 'form') await page.evaluate(() => window.replaceForm());
    if (change === 'language') await page.getByLabel('Speech language').selectOption('hi-IN');
    if (change === 'locale') await page.evaluate(() => window.draw({ locale: 'mr' }));
    if (change === 'disabled') await page.evaluate(() => window.draw({ disabled: true }));
    if (change === 'account') await page.evaluate(() => window.draw({ account: 'two' }));
    if (change === 'unmount') await page.evaluate(() => window.draw({ mounted: false }));
    await page.waitForFunction((n) => window.mics[n - 1].aborts === 1, count);
    await page.evaluate(() => window.say('13 pH', true));
    assert.equal(await page.evaluate(() => window.writes.length), 1, change);
  }
  console.log('PASS: opt-in voice, review-only single-field application, transcript invalidation, form/language/locale/disabled/account/unmount cleanup and stale microphone callbacks');

  await page.evaluate(() => window.draw({ locale: 'en', disabled: false, mounted: true })); await openCards();
  await startSerial();
  const encoded = wire(capture);
  await page.evaluate((bytes) => window.sendBytes(bytes), encoded.slice(0, 33));
  await page.waitForFunction(() => Boolean(window.mockSerial.resolve));
  await page.evaluate((bytes) => window.sendBytes(bytes), encoded.slice(33));
  await page.getByText('Capture received. Select and review readings; nothing has been applied.', { exact: true }).waitFor();
  assert.equal(await button('Confirm selected readings').isDisabled(), true);
  assert.equal(await page.evaluate(() => window.writes.length), 1);
  await page.getByText('Expired calibration (device report)', { exact: true }).waitFor();
  await page.getByText(/Missing instrument fields: Temperature/).waitFor();
  await page.getByLabel('Replace Moisture: Not entered → 62 %', { exact: true }).check();
  assert.equal(await button('Confirm selected readings').isDisabled(), true);
  await page.getByLabel('I reviewed the selected values, units, device, time and calibration report and agree to replace these readings.', { exact: true }).check();
  await button('Confirm selected readings').click();
  await page.waitForFunction(() => window.writes.length === 2);
  const applied = await page.evaluate(() => window.form);
  assert.equal(applied.inputs.sensor.ph, 4.2);
  assert.equal(applied.source_mode, 'esp32'); assert.equal(applied.device_id, capture.device_id);
  assert.deepEqual(applied.instrument_capture.readings, [capture.readings[0]]);
  assert.equal(await page.evaluate(() => window.mockSerial.releases), 1);
  assert.equal(await page.evaluate(() => window.mockSerial.closes), 1);
  await page.evaluate(() => window.edit('moisture_pct', 63));
  assert.equal(await page.evaluate(() => window.form.instrument_capture), undefined);

  await startSerial(); await button('Cancel capture').click();
  await page.getByText('Stopped or cancelled. No values were applied.', { exact: true }).waitFor();
  await startSerial(); await page.evaluate(() => { for (const listener of window.mockSerial.listeners) listener({ port: window.mockSerial.port }); });
  await page.getByText('Instrument disconnected before a complete capture. Reconnect and retry explicitly.', { exact: true }).waitFor();
  await startSerial(); await page.evaluate(() => window.sendBytes(Array.from(new TextEncoder().encode('{"bad":true}\n'))));
  await page.getByText(/Instrument data was invalid/).waitFor();
  await page.evaluate(() => { window.mockSerial.deny = true; });
  await readySerial(); await button('Choose port and capture').click();
  await page.getByText(/Serial permission was denied/).waitFor();
  await page.evaluate(() => { window.mockSerial.deny = false; });

  for (const change of ['form', 'locale', 'disabled', 'account', 'unmount']) {
    await page.evaluate(() => window.draw({ locale: 'en', disabled: false, mounted: true })); await openCards();
    await startSerial();
    const releases = await page.evaluate(() => window.mockSerial.releases);
    await page.evaluate(() => { window.lateSerial = window.mockSerial.resolve; });
    if (change === 'form') await page.evaluate(() => window.replaceForm());
    if (change === 'locale') await page.evaluate(() => window.draw({ locale: 'hi' }));
    if (change === 'disabled') await page.evaluate(() => window.draw({ disabled: true }));
    if (change === 'account') await page.evaluate(() => window.draw({ account: 'three' }));
    if (change === 'unmount') await page.evaluate(() => window.draw({ mounted: false }));
    await page.waitForFunction((n) => window.mockSerial.releases > n, releases);
    await page.evaluate((bytes) => window.lateSerial({ done: false, value: new Uint8Array(bytes) }), wire(capture));
    assert.equal(await page.evaluate(() => window.writes.length), 2);
  }
  await page.evaluate(() => { window.draw({ locale: 'en', mounted: true, disabled: false }); window.mockSerial.delayChoice = true; });
  await openCards(); await readySerial(); await button('Choose port and capture').click();
  const opens = await page.evaluate(() => window.mockSerial.opens);
  await button('Cancel capture').click();
  await page.getByText('Stopped or cancelled. No values were applied.', { exact: true }).waitFor();
  await page.evaluate(() => window.mockSerial.choose());
  assert.equal(await page.evaluate(() => window.mockSerial.opens), opens);
  assert.equal(await page.evaluate(() => window.submits), 0);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.mockSerial.listeners.size), 0);
  console.log('PASS: split serial bytes, reviewed subset/provenance, reconciliation, cancel/disconnect/invalid/permission states, form/locale/disabled/account/unmount cleanup and late chooser protection; no automatic submit');
} finally {
  if (errors.length) console.error('Browser errors:', errors);
  await browser?.close();
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
