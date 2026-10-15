/** Real API acceptance flow. Port 5174 must proxy a disposable database/API, never farm data. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUTRISCAN_PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.NUTRISCAN_SMOKE_URL;
assert.ok(url && new URL(url).port === '5174' && process.env.NUTRISCAN_ALLOW_TEST_ACCOUNTS === '1', 'Use an explicitly enabled isolated frontend/API/database.');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kolkata', acceptDownloads: true });
const password = `test-only-${randomUUID()}`;
const username = `field-${randomUUID().slice(0, 8)}@example.invalid`;
const errors = [];
await context.addInitScript(() => {
  window.__microphones = 0; window.__ports = 0;
  class Recognition {
    start() { window.__microphones += 1; window.__recognition = this; }
    abort() {} stop() {}
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition });
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    addEventListener() {}, removeEventListener() {},
    async requestPort() {
      window.__ports += 1;
      const frame = { device_id: 'ACCEPTANCE-DEVICE', captured_at: new Date().toISOString(), calibration_status: 'unknown', readings: [
        { field: 'moisture_pct', value: 63, unit: '%' }, { field: 'temperature_c', value: 25, unit: '°C' },
      ] };
      return { async open() {}, async close() {}, readable: new ReadableStream({ start(controller) {
        const bytes = new TextEncoder().encode(JSON.stringify(frame) + '\n');
        controller.enqueue(bytes.slice(0, 30)); controller.enqueue(bytes.slice(30));
      } }) };
    },
  } });
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const hub = page.locator('#fieldwork');
const tab = (name) => hub.getByRole('tab', { name, exact: true }).click();
const activePanel = () => hub.getByRole('tabpanel').filter({ visible: true });
const getRecords = (collection) => page.evaluate(async (name) => {
  const response = await fetch(`/api/v1/${name}?limit=100`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Acceptance read failed: ${response.status}`);
  return response.json();
}, collection);

try {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Create farm account', exact: true }).click();
  const registration = page.getByRole('form', { name: 'Create farm account', exact: true });
  await registration.getByLabel('Username', { exact: true }).fill(username);
  await registration.getByLabel('Password', { exact: true }).fill(password);
  await registration.getByLabel('Farm name', { exact: true }).fill('Fieldwork acceptance farm');
  await registration.getByRole('button', { name: 'Create farm account', exact: true }).click();
  const batchForm = hub.getByRole('form', { name: 'Create batch', exact: true });
  await batchForm.waitFor();
  await batchForm.getByLabel('Batch ID', { exact: true }).fill('LIVE-BATCH-01');
  await batchForm.getByLabel('Display name', { exact: true }).fill('Maize — West shed');
  await batchForm.getByLabel('Storage location', { exact: true }).fill('West shed');
  await batchForm.getByLabel('Quantity', { exact: true }).fill('100');
  await batchForm.getByLabel('Quantity unit', { exact: true }).selectOption('kg');
  await batchForm.getByRole('button', { name: 'Save batch', exact: true }).click();
  await activePanel().getByRole('heading', { name: 'Maize — West shed', exact: true }).waitFor();
  const batch = (await getRecords('batches')).items[0];
  assert.equal(batch.quantity, 100); assert.equal(batch.quantity_unit, 'kg');
  await activePanel().getByRole('button', { name: 'Edit metadata', exact: true }).click();
  const edit = hub.getByRole('form', { name: 'Edit batch metadata', exact: true });
  assert.equal(await edit.getByLabel('Batch ID', { exact: true }).getAttribute('readonly'), '');
  await edit.getByLabel('Storage location', { exact: true }).fill('West shed 2');
  await edit.getByRole('button', { name: 'Save batch changes', exact: true }).click();
  await activePanel().getByText('West shed 2', { exact: true }).waitFor();
  const png = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }));
  await activePanel().getByRole('button', { name: 'Photos (0)', exact: true }).click();
  await activePanel().getByLabel('Choose photo', { exact: true }).setInputFiles({ name: 'batch.png', mimeType: 'image/png', buffer: png });
  await activePanel().getByRole('button', { name: 'Upload photo', exact: true }).click();
  await activePanel().getByRole('button', { name: 'View photo: fieldwork-batch.png', exact: true }).waitFor();
  await activePanel().getByRole('button', { name: 'View photo: fieldwork-batch.png', exact: true }).click();
  await activePanel().getByRole('img', { name: 'Saved photo: fieldwork-batch.png', exact: true }).waitFor();
  console.log('PASS: real batch creation/edit, immutable identity and private photo upload/readback');

  await tab('Quick observations');
  const observationForm = hub.getByRole('form', { name: 'Quick observation checklist', exact: true });
  await observationForm.getByLabel('Batch ID', { exact: true }).fill(batch.batch_id);
  await observationForm.getByRole('group', { name: 'Visible mould', exact: true }).getByRole('radio', { name: 'Yes', exact: true }).check();
  assert.equal(await observationForm.locator('input[type="radio"][value="unknown"]:checked').count(), 3);
  await observationForm.getByRole('button', { name: 'Save observation', exact: true }).click();
  await activePanel().getByText('Observation only — no screening score', { exact: true }).waitFor();
  const observations = await getRecords('observations');
  assert.equal(observations.items[0].kind, 'observation_only');
  assert.equal(observations.items[0].mould, 'yes');
  assert.equal(observations.items[0].unusual_heat, 'unknown');
  assert.equal(Object.hasOwn(observations.items[0], 'quality_score'), false);
  assert.equal(await page.evaluate(async () => (await (await fetch('/api/v1/scans')).json()).length), 0);
  console.log('PASS: observation-only persistence preserves unknown answers and never creates a scored scan');

  await tab('Reminders');
  const reminderForm = hub.getByRole('form', { name: 'Create reminder', exact: true });
  await reminderForm.getByLabel('Task title', { exact: true }).fill('Inspect storage cover');
  await reminderForm.getByRole('button', { name: 'Save reminder', exact: true }).click();
  await activePanel().getByRole('button', { name: 'Mark complete', exact: true }).click();
  await activePanel().getByRole('button', { name: 'Reopen task', exact: true }).waitFor();
  assert.equal((await getRecords('reminders')).items[0].status, 'completed');
  await activePanel().getByRole('button', { name: 'Reopen task', exact: true }).click();
  await activePanel().getByRole('button', { name: 'Mark complete', exact: true }).waitFor();
  console.log('PASS: persisted local-day reminder and complete/reopen workflow');

  await tab('Testing help');
  const requestForm = hub.getByRole('form', { name: 'Create testing request', exact: true });
  await requestForm.getByLabel('Batch ID', { exact: true }).fill(batch.batch_id);
  await requestForm.getByLabel('Contact name', { exact: true }).fill('Farmer-selected testing provider');
  await requestForm.getByRole('button', { name: 'Save farm request', exact: true }).click();
  await activePanel().getByRole('button', { name: 'Mark collected', exact: true }).click();
  await activePanel().getByRole('button', { name: 'Mark report received', exact: true }).waitFor();
  assert.equal(await activePanel().getByRole('button', { name: 'Mark report received', exact: true }).isDisabled(), true);
  await activePanel().getByRole('button', { name: 'Reports (0)', exact: true }).click();
  await activePanel().getByLabel('Choose report', { exact: true }).setInputFiles({
    name: 'lab-report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% isolated acceptance fixture only\n%%EOF\n'),
  });
  await activePanel().getByRole('button', { name: 'Upload report', exact: true }).click();
  const downloadButton = activePanel().getByRole('button', { name: 'Download report: fieldwork-lab-report.pdf', exact: true });
  await downloadButton.waitFor();
  const downloadPending = page.waitForEvent('download');
  await downloadButton.click();
  assert.equal((await downloadPending).suggestedFilename(), 'fieldwork-lab-report.pdf');
  await activePanel().getByRole('button', { name: 'Mark report received', exact: true }).click();
  await activePanel().getByText('Report received', { exact: true }).waitFor();
  assert.equal((await getRecords('testing-requests')).items[0].status, 'report_received');
  assert.equal(await activePanel().locator('iframe, embed, object').count(), 0);
  console.log('PASS: requested→collected→report-received, upload required, private PDF download without inline execution');

  await tab('Batches');
  await activePanel().getByRole('button', { name: 'Use this batch', exact: true }).click();
  const form = page.locator('.guided-screening');
  await form.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await form.getByLabel('Batch ID', { exact: true }).inputValue(), batch.batch_id);
  await form.getByRole('button', { name: 'Next', exact: true }).click();
  const voice = form.locator('.reading-assist-card').filter({ has: page.locator('summary', { hasText: /^Voice entry$/ }) });
  await voice.locator(':scope > summary').click();
  await voice.getByLabel('Target reading', { exact: true }).selectOption('moisture_pct');
  assert.equal(await voice.getByRole('button', { name: 'Start microphone', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__microphones), 0);
  await voice.getByRole('checkbox', { name: 'I agree to microphone speech processing for voice entry.', exact: true }).check();
  await voice.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await page.evaluate(() => {
    const result = [{ transcript: 'sixty two percent' }]; result.isFinal = true;
    window.__recognition.onresult({ results: [result] });
  });
  await voice.getByRole('button', { name: 'Confirm this reading', exact: true }).waitFor();
  const moisture = form.locator('[data-screening-field="moisture_pct"]');
  assert.equal(await moisture.inputValue(), '');
  await voice.getByRole('button', { name: 'Confirm this reading', exact: true }).click();
  assert.equal(await moisture.inputValue(), '62');
  assert.equal(await page.evaluate(() => window.__microphones), 1);

  const instrument = form.locator('.reading-assist-card').filter({ has: page.locator('summary', { hasText: /^Read from instrument/ }) });
  await instrument.locator(':scope > summary').click();
  assert.equal(await page.evaluate(() => window.__ports), 0);
  await instrument.getByRole('checkbox', { name: 'My instrument uses this protocol and 115200 baud.', exact: true }).check();
  await instrument.getByRole('button', { name: 'Choose port and capture', exact: true }).click();
  const selection = instrument.getByRole('checkbox', { name: 'Replace Moisture: 62 → 63 %', exact: true });
  await selection.waitFor();
  assert.equal(await moisture.inputValue(), '62');
  await selection.check();
  await instrument.getByRole('checkbox', { name: 'I reviewed the selected values, units, device, time and calibration report and agree to replace these readings.', exact: true }).check();
  await instrument.getByRole('button', { name: 'Confirm selected readings', exact: true }).click();
  assert.equal(await moisture.inputValue(), '63');
  assert.equal(await form.locator('[data-screening-field="temperature_c"]').inputValue(), '');
  const remaining = { ph: '4.2', temperature_c: '24', humidity_pct: '68', protein_pct: '8.8', dry_matter_pct: '38', fiber_pct: '28', mold_score: '0.08', color_anomaly: '0.05', surface_damage: '0' };
  for (const [key, value] of Object.entries(remaining)) await form.locator(`[data-screening-field="${key}"]`).fill(value);
  await form.getByRole('button', { name: 'Next', exact: true }).click();
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Submit screening', exact: true }).click();
  await page.locator('#result .fr-risk').waitFor();
  const scans = await page.evaluate(async () => (await (await fetch('/api/v1/scans')).json()));
  assert.equal(scans.length, 1);
  assert.equal(scans[0].scan.device_id, 'ACCEPTANCE-DEVICE');
  assert.equal(scans[0].scan.instrument_capture.readings.length, 1);
  assert.equal(scans[0].scan.instrument_capture.readings[0].field, 'moisture_pct');
  assert.equal(scans[0].scan.instrument_capture.calibration_status, 'unknown');
  await page.locator('#result .fr-details > summary').click();
  await page.locator('#result .saved-instrument-provenance').getByText('ACCEPTANCE-DEVICE', { exact: true }).waitFor();
  console.log('PASS: microphone consent/review, selected real-byte transport application and server-persisted provenance (transports mocked)');

  await page.reload();
  await hub.getByRole('heading', { name: 'Maize — West shed', exact: true }).waitFor();
  const reloadedBatch = (await getRecords('batches')).items[0];
  assert.equal(reloadedBatch.id, batch.id);
  assert.equal(reloadedBatch.latest_observation.mould, 'yes');
  assert.equal(reloadedBatch.latest_scan.scan.id, scans[0].scan.id);
  assert.equal((await getRecords('observations')).total, 1);
  assert.equal((await getRecords('reminders')).items[0].status, 'pending');
  assert.equal((await getRecords('testing-requests')).items[0].report_count, 1);
  const storage = await page.evaluate(() => Object.values(localStorage).join('\n'));
  assert.ok(!storage.includes(username) && !storage.includes(password) && !storage.includes('West shed') && !storage.includes('ACCEPTANCE-DEVICE'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const viewer = `viewer-${randomUUID().slice(0, 8)}`;
  assert.equal(await page.evaluate(async ({ username, password }) => (await fetch('/api/v1/members', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, role: 'viewer' }),
  })).status, { username: viewer, password }), 201);
  await page.locator('.farmer-account-details > summary').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const login = page.getByRole('form', { name: 'Sign in', exact: true });
  await login.waitFor(); assert.equal(await hub.count(), 0);
  await login.getByLabel('Username', { exact: true }).fill(viewer);
  await login.getByLabel('Password', { exact: true }).fill(password);
  await login.getByRole('button', { name: 'Sign in', exact: true }).click();
  await hub.getByText('Read-only account. You can view records and download saved attachments.', { exact: true }).waitFor();
  assert.equal(await hub.getByRole('form', { name: 'Create batch', exact: true }).getByRole('button', { name: 'Save batch', exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: persisted readback/latest matching cards, no private local cache, mobile layout, logout and real viewer guards');
} catch (error) {
  console.error('Visible fieldwork errors:', await hub.getByRole('alert').allTextContents());
  throw error;
} finally {
  await context.close(); await browser.close();
}
