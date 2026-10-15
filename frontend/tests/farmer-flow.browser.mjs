/** Optional real-browser smoke test. Always use a separate API/database, never a farmer's data. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUTRISCAN_PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.NUTRISCAN_SMOKE_URL;
assert.ok(url && new URL(url).port === '5174' && process.env.NUTRISCAN_ALLOW_TEST_ACCOUNTS === '1',
  'Use an isolated frontend on port 5174 backed by a temporary test database; explicitly allow test accounts.');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [];
const password = `test-only-${randomUUID()}`;
const username = `farmer-${randomUUID().slice(0, 8)}@example.invalid`;
let scanPosts = 0;

await context.addInitScript(() => {
  window.__speech = [];
  window.__shares = [];
  window.__copies = [];
  window.__opened = [];
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
    constructor(text) { this.text = text; }
  } });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => ['en-IN', 'hi-IN', 'mr-IN'].map((lang) => ({ lang, localService: true })),
    speak: (utterance) => { window.__speech.push({ text: utterance.text, lang: utterance.lang }); utterance.onstart?.(); },
    cancel() {}, addEventListener() {}, removeEventListener() {},
  } });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async (value) => window.__shares.push(value) });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => window.__copies.push(text) } });
  window.open = (...args) => { window.__opened.push(args); return null; };
});

const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/scans') scanPosts += 1;
});

try {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Create farm account', exact: true }).click();
  const registration = page.getByRole('form', { name: 'Create farm account', exact: true });
  await registration.getByLabel('Username', { exact: true }).fill(username);
  await registration.getByLabel('Password', { exact: true }).fill(password);
  await registration.getByLabel('Farm name', { exact: true }).fill('Browser test farm');
  await registration.getByRole('button', { name: 'Create farm account', exact: true }).click();
  await page.getByRole('heading', { name: 'What would you like to do?' }).waitFor();
  assert.equal(await page.locator('.farmer-home-actions a').count(), 3);
  assert.equal(await page.locator('.farmer-account-details').getAttribute('open'), null);
  assert.equal(await page.locator('.hero-panel').count(), 0);
  await page.getByRole('button', { name: 'Detailed dashboard', exact: true }).click();
  await page.locator('.hero-panel').waitFor();
  await page.getByRole('button', { name: 'Farmer mode', exact: true }).click();
  assert.equal(await page.locator('.hero-panel').count(), 0);
  console.log('PASS: registration, three farmer actions, collapsed account and dashboard toggle');

  const form = page.locator('.guided-screening');
  await form.getByRole('button', { name: 'Next', exact: true }).click();
  await form.getByRole('button', { name: 'Next', exact: true }).click();
  await form.getByText('Correct the marked fields before continuing.', { exact: true }).waitFor();
  assert.equal(scanPosts, 0);
  await form.getByLabel('Batch ID', { exact: true }).fill('FARMER-BATCH-01');
  await form.getByRole('button', { name: 'Next', exact: true }).click();
  const fields = {
    moisture_pct: '62', ph: '4.2', temperature_c: '24', humidity_pct: '68',
    protein_pct: '8.8', dry_matter_pct: '38', fiber_pct: '28',
    mold_score: '0.08', color_anomaly: '0.05', surface_damage: '0',
  };
  for (const [key, value] of Object.entries(fields)) {
    const input = form.locator(`[data-screening-field="${key}"]`);
    assert.equal(await input.inputValue(), '');
    await input.fill(value);
  }
  const moisture = form.locator('[data-screening-field="moisture_pct"]');
  await moisture.fill('');
  await form.getByRole('button', { name: 'Next', exact: true }).click();
  await form.getByText('Enter the Moisture reading. Missing measurements block screening.', { exact: true }).waitFor();
  assert.equal(await moisture.inputValue(), '');
  assert.equal(scanPosts, 0);
  await moisture.fill('62');
  const help = form.locator('.measurement-help[data-field="moisture_pct"]');
  await help.locator(':scope > summary').click();
  assert.equal(await help.locator('svg[role="img"]').count(), 1);
  await help.getByRole('button', { name: 'Listen', exact: true }).click();
  await page.waitForFunction(() => window.__speech.length === 1);
  await help.getByRole('button', { name: 'Stop reading', exact: true }).click();
  await form.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await form.getByRole('button', { name: 'Submit screening', exact: true }).isDisabled(), true);
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Submit screening', exact: true }).click();
  await page.locator('#result .fr-risk').waitFor();
  assert.equal(scanPosts, 1);
  assert.match(await page.locator('#result .fr-safety').innerText(), /cannot guarantee feed safety/);
  assert.equal(await page.locator('#result .fr-details').getAttribute('open'), null);
  await page.locator('#result .fr-comparison').getByText('No strictly earlier matching saved result is available in this sample.', { exact: true }).waitFor();
  console.log('PASS: blank readings, validation, illustrated/audio help, confirmed API screening and safe result');

  await form.getByRole('button', { name: 'Back', exact: true }).click();
  await moisture.fill('65');
  await context.setOffline(true);
  const drafts = page.locator('#drafts');
  await drafts.getByRole('button', { name: 'Save draft', exact: true }).click();
  await drafts.getByText('1 saved local drafts', { exact: true }).waitFor();
  await drafts.getByRole('button', { name: 'Queue', exact: true }).click();
  await page.locator('.farmer-connection').getByText('1 queued — waiting for upload', { exact: true }).waitFor();
  assert.equal(await drafts.getByRole('button', { name: 'Sync now', exact: true }).isDisabled(), true);
  assert.equal(scanPosts, 1);
  await context.setOffline(false);
  await page.locator('.farmer-connection').getByText('Online', { exact: true }).waitFor();
  assert.equal(scanPosts, 1);
  await drafts.getByRole('button', { name: 'Sync now', exact: true }).click();
  await drafts.getByText('0 queued — waiting for upload', { exact: true }).waitFor();
  await drafts.locator('time').waitFor();
  assert.equal(scanPosts, 2);
  await page.locator('#result .fr-change-summary').getByText('Moisture increased from 62 % to 65 %.', { exact: true }).waitFor();
  console.log('PASS: offline save/queue, header counts, explicit sync, confirmation time and plain-language comparison');

  const share = page.locator('#result .fr-share');
  assert.equal(await share.locator('textarea').count(), 0);
  assert.equal(await share.getByLabel('Include farm ID', { exact: true }).isChecked(), false);
  assert.equal(await share.getByLabel('Include farm name', { exact: true }).isEnabled(), true);
  await share.getByRole('button', { name: 'Preview summary', exact: true }).click();
  const preview = await share.getByRole('textbox').inputValue();
  assert.ok(preview.includes('65 %') && preview.includes('cannot guarantee feed safety'));
  assert.ok(!preview.includes(username) && !preview.includes(password) && !preview.includes('Browser test farm'));
  await share.getByRole('button', { name: 'Share using this device', exact: true }).click();
  await share.getByText('Summary shared using this device.', { exact: true }).waitFor();
  await share.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await share.getByText('Summary copied.', { exact: true }).waitFor();
  await share.getByRole('button', { name: 'Send text to WhatsApp', exact: true }).click();
  const actions = await page.evaluate(() => ({ shares: window.__shares, copies: window.__copies, opened: window.__opened }));
  assert.deepEqual(actions.shares, [{ text: preview }]);
  assert.deepEqual(actions.copies, [preview]);
  assert.equal(new URL(actions.opened[0][0]).searchParams.get('text'), preview);
  assert.equal(new URL(actions.opened[0][0]).origin, 'https://wa.me');
  console.log('PASS: preview-first sharing, farm-name opt-in, exact copy/native/WhatsApp text with no external transmission');

  assert.equal(await page.evaluate(async () => {
    const records = await (await fetch('/api/v1/scans?limit=1')).json();
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return (await fetch(`/api/v1/scans/${records[0].scan.id}/photos`, {
      method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Filename': 'evidence.png' }, body: blob,
    })).status;
  }), 201);
  await share.getByRole('button', { name: 'Choose saved photos', exact: true }).click();
  await share.getByLabel('evidence.png', { exact: true }).check();
  assert.equal(await share.getByRole('button', { name: 'Preview summary', exact: true }).isDisabled(), true);
  await share.getByRole('button', { name: 'Prepare selected photos', exact: true }).click();
  await share.getByText('1 photos prepared for native sharing. Review them before sharing.', { exact: true }).waitFor();
  assert.equal(await share.locator('.fr-evidence-thumbnails img').count(), 1);
  await share.getByRole('button', { name: 'Preview summary', exact: true }).click();
  const photoPreview = await share.getByRole('textbox').inputValue();
  assert.ok(!photoPreview.includes('/api/v1/') && !photoPreview.includes('blob:'));
  await share.getByRole('button', { name: 'Share using this device', exact: true }).click();
  await share.getByText('Summary shared using this device.', { exact: true }).waitFor();
  const photoShare = await page.evaluate(() => ({
    text: window.__shares.at(-1).text,
    files: window.__shares.at(-1).files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
  }));
  assert.equal(photoShare.text, photoPreview);
  assert.equal(photoShare.files[0].name, 'evidence.png');
  assert.equal(photoShare.files[0].type, 'image/png');
  assert.ok(photoShare.files[0].size > 0);
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
  await share.getByRole('button', { name: 'Share using this device', exact: true }).click();
  await share.getByText(/This device cannot share the selected photos/).waitFor();
  assert.equal(await page.evaluate(() => window.__shares.length), 2);
  await share.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await share.getByText('Summary copied.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__copies.at(-1)), photoPreview);
  await share.getByRole('button', { name: 'Send text to WhatsApp', exact: true }).click();
  assert.equal(await page.evaluate(() => new URL(window.__opened.at(-1)[0]).searchParams.get('text')), photoPreview);
  await share.getByRole('button', { name: 'Remove photo choices — use text only', exact: true }).click();
  assert.equal(await share.locator('.fr-evidence-thumbnails img').count(), 0);
  console.log('PASS: explicit photo selection/preparation, private API bytes, File attachments, unsupported-file fallback and text-only copy/WhatsApp');

  await page.locator('#history').getByRole('button', { name: /^View batch / }).first().click();
  await page.locator('.fh-trends .fr-change-summary').getByText('Moisture increased from 62 % to 65 %.', { exact: true }).waitFor();
  assert.equal(await page.locator('.fh-charts figure').count(), 4);
  for (const locale of ['hi', 'mr']) {
    await page.getByRole('combobox', { name: /Language|भाषा/ }).selectOption(locale);
    await page.waitForFunction((value) => document.documentElement.lang === value, locale);
    await page.locator('#result .fr-listen').getByRole('button').first().click();
    assert.equal(await page.evaluate(() => window.__speech.at(-1).lang), `${locale}-IN`);
    await page.locator('#result .fr-listen').getByRole('button').nth(1).click();
  }
  await page.getByRole('combobox', { name: 'भाषा', exact: true }).selectOption('en');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.reload();
  await page.locator('.farmer-connection time').waitFor();
  await page.locator('#history').getByRole('button', { name: /^View result for batch / }).first().click();
  await page.locator('#result .fr-change-summary').waitFor();
  const storage = await page.evaluate(() => Object.values(localStorage).join('\n'));
  assert.ok(!storage.includes(username) && !storage.includes(password) && !storage.includes('Browser test farm'));
  console.log('PASS: comparisons beside trends, Hindi/Marathi speech selection, mobile layout, saved-history readback and sync-time persistence');
  if (process.env.NUTRISCAN_SMOKE_SCREENSHOT) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: process.env.NUTRISCAN_SMOKE_SCREENSHOT });
  }

  const viewerName = `viewer-${randomUUID().slice(0, 8)}`;
  assert.equal(await page.evaluate(async ({ username, password }) => (await fetch('/api/v1/members', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role: 'viewer' }),
  })).status, { username: viewerName, password }), 201);
  await page.locator('.farmer-account-details > summary').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const login = page.getByRole('form', { name: 'Sign in', exact: true });
  await login.waitFor();
  assert.equal(await page.locator('#result .fr-share').count(), 0);
  await login.getByLabel('Username', { exact: true }).fill(viewerName);
  await login.getByLabel('Password', { exact: true }).fill(password);
  await login.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Viewer access is read-only. Ask a farm owner or member to submit a screening.', { exact: true }).waitFor();
  assert.equal(await form.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  assert.equal(await drafts.getByRole('button', { name: 'Save draft', exact: true }).isDisabled(), true);
  assert.equal(await drafts.locator('time').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: logout clears private result, viewer remains read-only, status is account-isolated, no browser exceptions');
  console.log('All 8 farmer usability features passed isolated Chromium smoke checks. Speech/share APIs were mocked.');
} finally {
  await context.close();
  await browser.close();
}
