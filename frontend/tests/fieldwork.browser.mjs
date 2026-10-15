/** Isolated hub browser test: Vite virtual entry + contract-shaped in-memory API.
 * Run with an existing Playwright installation; does not install dependencies or use farmer data.
 * NUTRISCAN_PLAYWRIGHT_MODULE=/existing/path/to/playwright node tests/fieldwork.browser.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUTRISCAN_PLAYWRIGHT_MODULE || 'playwright');
const fixture = `
import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FieldworkHub from '/src/FieldworkHub.jsx';
import { createApi } from '/src/api.js';
const api = createApi();
function Fixture() {
  const [role, setRole] = useState('owner');
  const [online, setOnline] = useState(true);
  const [locale, setLocale] = useState('en');
  const [farm, setFarm] = useState('farm-1');
  window.fieldworkTest = { setRole, setOnline, setLocale, setFarm };
  const session = role ? { user: { id: 'user-1', role }, farm: { id: farm } } : null;
  const t = Object.assign((key) => key, { locale });
  return React.createElement(FieldworkHub, { api, session, online, t, onUseBatch: (batch) => { window.usedBatch = batch; } });
}
createRoot(document.getElementById('root')).render(React.createElement(StrictMode, null, React.createElement(Fixture)));
`;
const server = await createServer({
  configFile: false, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  plugins: [{
    name: 'fieldwork-test-fixture',
    resolveId(id) { if (id === '/__fieldwork-entry.jsx') return '\0fieldwork-fixture.jsx'; },
    load(id) { if (id === '\0fieldwork-fixture.jsx') return fixture; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__fieldwork') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/__fieldwork', '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__fieldwork-entry.jsx"></script></html>'));
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kolkata', acceptDownloads: true });
  await context.addInitScript(() => {
    window.previewUrls = new Set();
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); window.previewUrls.add(url); return url; };
    URL.revokeObjectURL = (url) => { window.previewUrls.delete(url); revoke(url); };
    window.printedHtml = [];
    window.open = () => ({ opener: window, document: { open() {}, write(html) { window.printedHtml.push(html); }, close() {} } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const store = Object.fromEntries(['batches', 'observations', 'reminders', 'testing-requests'].map((name) => [name, []]));
  const files = new Map(); const writes = [];
  let failing = ''; let unauthorized = false; let sequence = 0;
  const timestamp = '2026-10-15T10:00:00Z';
  const make = (collection, body) => ({
    ...body, id: `${collection}-${++sequence}`, farm_id: 'farm-1', created_at: timestamp, updated_at: timestamp,
    ...(collection === 'batches' ? { photo_count: 0, latest_scan: null, latest_observation: null } : {}),
    ...(collection === 'observations' ? { photo_count: 0, kind: 'observation_only' } : {}),
    ...(collection === 'reminders' ? { status: 'pending', completed_at: null } : {}),
    ...(collection === 'testing-requests' ? { status: 'requested', collected_on: null, report_received_on: null, report_count: 0 } : {}),
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const [, , , collection, id, segment, fileId] = url.pathname.split('/');
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (unauthorized) return json({ detail: 'Authentication required' }, 401);
    if (failing === collection && request.method() === 'GET') return json({ detail: 'temporary failure' }, 503);
    if (request.method() === 'POST') writes.push(url.pathname);
    const list = store[collection];
    assert.ok(list, url.pathname);
    if (!id && request.method() === 'GET') {
      const limit = Number(url.searchParams.get('limit')); const offset = Number(url.searchParams.get('offset'));
      assert.ok(limit >= 1 && limit <= 100 && offset >= 0);
      return json({ items: list.slice(offset, offset + limit), total: list.length, limit, offset });
    }
    if (!id) {
      const body = request.postDataJSON(); assert.equal(Object.hasOwn(body, 'farm_id'), false);
      const saved = make(collection, body); list.unshift(saved);
      if (collection === 'observations') {
        const batch = store.batches.find((item) => item.batch_id === saved.batch_id && item.sample_type === saved.sample_type);
        if (batch) batch.latest_observation = saved;
      }
      return json(saved, 201);
    }
    const saved = list.find((record) => record.id === id);
    if (!saved) return json({ detail: 'missing' }, 404);
    if (segment === 'status') {
      const body = request.postDataJSON(); Object.assign(saved, body);
      if (collection === 'reminders') saved.completed_at = body.status === 'completed' ? timestamp : null;
      return json(saved);
    }
    if (segment === 'photos' || segment === 'reports') {
      const key = `${collection}/${id}`;
      const attachments = files.get(key) || [];
      if (fileId) {
        const attachment = attachments.find((item) => item.meta.id === fileId);
        return route.fulfill({ contentType: attachment.meta.content_type, body: attachment.bytes });
      }
      if (request.method() === 'GET') return json(attachments.map((item) => item.meta));
      const meta = { id: `file-${++sequence}`, filename: request.headers()['x-filename'], content_type: request.headers()['content-type'], url: 'https://untrusted.invalid/never-use-this', created_at: timestamp };
      attachments.push({ meta, bytes: request.postDataBuffer() }); files.set(key, attachments);
      saved[segment === 'reports' ? 'report_count' : 'photo_count'] = attachments.length;
      return json(meta, 201);
    }
    if (request.method() === 'POST') Object.assign(saved, request.postDataJSON());
    return json(saved);
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${origin}/__fieldwork`);
  const panel = () => page.getByRole('tabpanel').filter({ visible: true });
  const tab = async (name) => page.getByRole('tab', { name, exact: true }).click();
  await page.getByText('No batches saved yet. Create a batch to keep its records together.', { exact: true }).waitFor();
  const batchForm = page.getByRole('form', { name: 'Create batch', exact: true });
  await batchForm.getByLabel('Batch ID', { exact: true }).fill('BATCH-01');
  await batchForm.getByLabel('Display name', { exact: true }).fill('West shed feed');
  await batchForm.getByLabel('Storage location', { exact: true }).fill('West shed');
  await batchForm.getByLabel('Prepared on', { exact: true }).fill('2026-10-15');
  await batchForm.getByLabel('Opened on', { exact: true }).fill('2026-10-14');
  await batchForm.getByRole('button', { name: 'Save batch', exact: true }).click();
  await panel().getByText('Opening date cannot precede preparation.', { exact: true }).waitFor();
  assert.equal(writes.length, 0);
  await batchForm.getByLabel('Opened on', { exact: true }).fill('2026-10-15');
  await batchForm.getByLabel('Quantity', { exact: true }).fill('0');
  await batchForm.getByLabel('Quantity unit', { exact: true }).selectOption('bags');
  await batchForm.getByRole('button', { name: 'Save batch', exact: true }).click();
  await panel().getByRole('heading', { name: 'West shed feed', exact: true }).waitFor();
  assert.equal(store.batches[0].quantity, 0);
  await panel().getByRole('button', { name: 'Use this batch', exact: true }).click();
  assert.equal(await page.evaluate(() => window.usedBatch.batch_id), 'BATCH-01');
  await panel().getByRole('button', { name: 'Edit metadata', exact: true }).click();
  const edit = page.getByRole('form', { name: 'Edit batch metadata', exact: true });
  assert.equal(await edit.getByLabel('Batch ID', { exact: true }).getAttribute('readonly'), '');
  await edit.getByLabel('Display name', { exact: true }).fill('Renamed feed');
  await edit.getByRole('button', { name: 'Save batch changes', exact: true }).click();
  await panel().getByRole('heading', { name: 'Renamed feed', exact: true }).waitFor();
  assert.equal(store.batches[0].batch_id, 'BATCH-01');
  console.log('PASS: real React forms validate, create, read back, edit fixed identity and call onUseBatch');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
  await panel().getByRole('button', { name: 'Photos (0)', exact: true }).click();
  await panel().getByText('No attachments saved.', { exact: true }).waitFor();
  await panel().getByLabel('Choose photo', { exact: true }).setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: png });
  await panel().getByAltText('Selected photo preview — not yet uploaded', { exact: true }).waitFor();
  await panel().getByRole('button', { name: 'Upload photo', exact: true }).click();
  await panel().getByRole('button', { name: /^View photo:/ }).waitFor();
  await panel().getByRole('button', { name: /^View photo:/ }).click();
  await panel().getByAltText(/^Saved photo:/).waitFor();
  await panel().getByRole('button', { name: 'Close photo', exact: true }).click();
  await panel().getByRole('button', { name: 'Close attachments', exact: true }).click();
  await page.waitForFunction(() => window.previewUrls.size === 0);
  assert.equal(await page.locator('img[src^="/api"],img[src^="http"]').count(), 0);
  console.log('PASS: private photo raw upload, authenticated Blob read, selected/saved previews and URL cleanup');

  await tab('Quick observations');
  const observation = page.getByRole('form', { name: 'Quick observation checklist', exact: true });
  assert.equal(await observation.locator('input[type=radio][value=unknown]:checked').count(), 4);
  await observation.getByLabel('Batch ID', { exact: true }).fill('BATCH-01');
  await observation.getByRole('group', { name: 'Visible mould', exact: true }).getByLabel('Yes', { exact: true }).check();
  await observation.getByRole('button', { name: 'Save observation', exact: true }).click();
  await panel().getByText('Observation only — no screening score', { exact: true }).waitFor();
  assert.equal(store.observations[0].mould, 'yes'); assert.equal(store.observations[0].unusual_heat, 'unknown');
  assert.equal(Object.hasOwn(store.observations[0], 'quality_score'), false);
  failing = 'observations';
  await panel().getByRole('button', { name: 'Refresh list', exact: true }).click();
  await panel().getByRole('button', { name: 'Retry this list', exact: true }).waitFor();
  await panel().getByText('Observation only — no screening score', { exact: true }).waitFor();
  await tab('Batches'); await panel().getByRole('heading', { name: 'Renamed feed', exact: true }).waitFor();
  await panel().getByText('If anything is concerning or unknown, ask a qualified adviser or testing provider to review it. These observations do not establish feeding safety.', { exact: true }).waitFor();
  const failedRefresh = page.waitForResponse((response) => response.url().includes('/api/v1/observations?') && response.status() === 503);
  await tab('Quick observations'); await failedRefresh;
  await panel().getByRole('button', { name: 'Retry this list', exact: true }).waitFor();
  failing = '';
  await panel().getByRole('button', { name: 'Retry this list', exact: true }).click();
  await panel().getByRole('button', { name: 'Retry this list', exact: true }).waitFor({ state: 'hidden' });
  console.log('PASS: separate observation persistence, unknown preservation, old-data retention and independent retry');

  await tab('Reminders');
  const reminder = page.getByRole('form', { name: 'Create reminder', exact: true });
  await reminder.getByLabel('Task title', { exact: true }).fill('Review cover');
  await reminder.getByLabel('Due on', { exact: true }).fill('2020-01-01');
  await reminder.getByRole('button', { name: 'Save reminder', exact: true }).click();
  await panel().getByRole('heading', { name: 'Overdue', exact: true }).waitFor();
  await panel().getByRole('button', { name: 'Mark complete', exact: true }).click();
  await panel().getByRole('heading', { name: 'Completed', exact: true }).waitFor();
  await panel().getByRole('button', { name: 'Reopen task', exact: true }).click();
  await panel().getByRole('heading', { name: 'Overdue', exact: true }).waitFor();
  assert.equal(store.reminders[0].status, 'pending');

  await tab('Testing help');
  const testing = page.getByRole('form', { name: 'Create testing request', exact: true });
  await testing.getByLabel('Batch ID', { exact: true }).fill('BATCH-01');
  await testing.getByLabel('Requested on', { exact: true }).fill('2026-10-15');
  await testing.getByLabel('Contact name', { exact: true }).fill('Chosen provider');
  await testing.getByLabel('Notes', { exact: true }).fill('<script>saved & escaped</script>');
  await testing.getByRole('button', { name: 'Save farm request', exact: true }).click();
  await panel().getByRole('button', { name: 'Print saved request', exact: true }).waitFor();
  await testing.getByLabel('Notes', { exact: true }).fill('UNSAVED LIVE EDIT');
  await panel().getByRole('button', { name: 'Print saved request', exact: true }).click();
  const printed = await page.evaluate(() => window.printedHtml[0]);
  assert.ok(printed.includes('&lt;script&gt;saved &amp; escaped&lt;/script&gt;')); assert.ok(!printed.includes('UNSAVED LIVE EDIT'));
  await panel().getByLabel('Collected on', { exact: true }).fill('2026-10-15');
  await panel().getByRole('button', { name: 'Mark collected', exact: true }).click();
  await panel().getByRole('button', { name: 'Mark report received', exact: true }).waitFor();
  assert.ok(await panel().getByRole('button', { name: 'Mark report received', exact: true }).isDisabled());
  await panel().getByRole('button', { name: 'Reports (0)', exact: true }).click();
  await panel().getByText('No attachments saved.', { exact: true }).waitFor();
  await panel().getByLabel('Choose report', { exact: true }).setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF') });
  await panel().getByRole('button', { name: 'Upload report', exact: true }).click();
  await panel().getByRole('button', { name: /^Download report:/ }).waitFor();
  assert.equal(await panel().locator('iframe,embed,object').count(), 0);
  const download = page.waitForEvent('download');
  await panel().getByRole('button', { name: /^Download report:/ }).click();
  assert.match((await download).suggestedFilename(), /\.pdf$/);
  await panel().getByLabel('Report received on', { exact: true }).fill('2026-10-16');
  await panel().getByRole('button', { name: 'Mark report received', exact: true }).click();
  await panel().getByText('Report received', { exact: true }).waitFor();
  assert.equal(store['testing-requests'][0].status, 'report_received');
  console.log('PASS: reminder complete/reopen; farm-only request; saved-only escaped print; forward dates; report upload and explicit PDF download');

  await page.reload();
  await panel().getByRole('heading', { name: 'Renamed feed', exact: true }).waitFor();
  for (let i = 0; i < 21; i++) store.batches.push(make('batches', { batch_id: `PAGE-${i}`, sample_type: 'feed', name: `Paged batch ${i}` }));
  await panel().getByRole('button', { name: 'Refresh list', exact: true }).click();
  await panel().getByText('Showing 1–20 of 22 records.', { exact: true }).waitFor();
  await panel().getByRole('button', { name: 'Next page', exact: true }).click();
  await panel().getByText('Showing 21–22 of 22 records.', { exact: true }).waitFor();
  assert.ok(await panel().getByRole('button', { name: 'Next page', exact: true }).isDisabled());
  const writeCount = writes.length;
  await page.evaluate(() => window.fieldworkTest.setOnline(false));
  assert.ok(await page.getByRole('form', { name: 'Create batch', exact: true }).getByRole('button', { name: 'Save batch', exact: true }).isDisabled());
  assert.equal(writes.length, writeCount);
  await page.evaluate(() => { window.fieldworkTest.setOnline(true); window.fieldworkTest.setRole('viewer'); });
  await page.getByText('Read-only account. You can view records and download saved attachments.', { exact: true }).waitFor();
  assert.ok(await page.getByRole('form', { name: 'Create batch', exact: true }).getByRole('button', { name: 'Save batch', exact: true }).isDisabled());
  await page.evaluate(() => window.fieldworkTest.setLocale('hi'));
  await page.getByRole('tab', { name: 'त्वरित अवलोकन', exact: true }).click();
  await page.getByRole('tab', { name: 'त्वरित अवलोकन', exact: true }).press('End');
  assert.equal(await page.getByRole('tab', { name: 'जांच में सहायता', exact: true }).getAttribute('aria-selected'), 'true');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.evaluate(() => { window.fieldworkTest.setLocale('en'); window.fieldworkTest.setRole('owner'); });
  await page.getByRole('tab', { name: 'Batches', exact: true }).waitFor();
  await panel().getByRole('heading', { name: 'Renamed feed', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.fw-list')].length === 4
    && [...document.querySelectorAll('.fw-list')].every((node) => node.getAttribute('aria-busy') === 'false'));
  unauthorized = true;
  await panel().getByRole('button', { name: 'Refresh list', exact: true }).click();
  await page.getByText('Your session expired. Sign in again to view farm records.', { exact: true }).waitFor();
  assert.equal(await page.locator('.fw-card').count(), 0);
  assert.equal(await page.locator('form').count(), 0);
  await page.evaluate(() => window.fieldworkTest.setRole(null));
  await page.getByText('Sign in to view saved farm fieldwork.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: server readback after reload, pagination, offline/viewer guards, Hindi keyboard tabs, 390px layout, unauthorized clearing; no browser exceptions');
} finally {
  await browser?.close();
  await server.close();
}
