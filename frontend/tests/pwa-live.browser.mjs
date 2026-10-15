/** Read-only check of the actual production app, using a fresh browser context. No test accounts. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUTRISCAN_PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.env.NUTRISCAN_PREVIEW_URL || 'http://127.0.0.1:5174');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local production preview.');
const profile = await mkdtemp(join(tmpdir(), 'nutriscan-pwa-app-'));
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 390, height: 844 } });
const errors = [];
const mutations = [];
await context.route(/^https:\/\/fonts\./, (route) => route.abort());
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (request.method() !== 'GET') mutations.push(request.method()); });
try {
  await page.goto(url.href);
  await page.getByRole('heading', { name: 'Welcome to Nutri-Scan', exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const installability = await (await context.newCDPSession(page)).send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, []);
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) =>
    (await (await caches.open(key)).keys()).map((request) => request.url)))).flat());
  assert.ok(cached.some((value) => new URL(value).pathname === '/offline.html'));
  assert.ok(cached.every((value) => {
    const path = new URL(value);
    return !path.search && !/^\/(api|health|auth|reports|photos)(?:\/|$)/.test(path.pathname) && path.pathname !== '/index.html';
  }));
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Offline field help', exact: true }).waitFor();
  await page.getByRole('link', { name: 'हिन्दी', exact: true }).click();
  await page.getByRole('heading', { name: 'ऑफ़लाइन खेत सहायता', exact: true }).waitFor();
  await page.getByRole('link', { name: 'मराठी', exact: true }).click();
  await page.getByRole('heading', { name: 'ऑफलाइन शेतातील मदत', exact: true }).waitFor();
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  console.log('PASS: actual App bootstrap registers the production worker, Chromium installation is ready, only public assets are cached, and offline reload shows all three local help languages');
} finally {
  await context.close(); await rm(profile, { recursive: true, force: true });
}
