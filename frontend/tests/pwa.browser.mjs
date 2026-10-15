/** Optional isolated production smoke: synthetic responses only, no backend/accounts. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUTRISCAN_PLAYWRIGHT_MODULE || 'playwright');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = await mkdtemp(join(tmpdir(), 'nutriscan-pwa-browser-'));
const profile = await mkdtemp(join(tmpdir(), 'nutriscan-pwa-profile-'));
const configFile = join(root, 'vite.config.js');
const fixture = (revision) => ({
  name: 'pwa-isolated-browser-fixture',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace('src="/src/main.jsx"', 'src="/pwa-browser-fixture.js"'),
  },
  resolveId(id) { if (id === '/pwa-browser-fixture.js') return '\0pwa-browser-fixture'; },
  load(id) {
    if (id !== '\0pwa-browser-fixture') return;
    return `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import InstallApp from '/src/InstallApp.jsx';
      import { registerPwa, getPwaState } from '/src/pwa.js';
      const root = createRoot(document.getElementById('root'));
      window.__renderPwa = (locale = 'en') => root.render(React.createElement(InstallApp, {t: Object.assign(key => key, {locale})}));
      window.__renderPwa();
      window.__pwaState = getPwaState;
      window.__revision = ${revision};
      registerPwa();`;
  },
});

const syntheticNetwork = {
  name: 'pwa-synthetic-private-network',
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      if (/^\/(?:api|health|reports|photos|assets\/unlisted)/.test(request.url)) {
        response.setHeader('Content-Type', 'text/plain');
        response.setHeader('Cache-Control', 'no-store');
        response.end('SYNTHETIC_PRIVATE_RESPONSE');
      } else next();
    });
  },
};
const makeBuild = (revision) => build({ root, configFile, plugins: [fixture(revision)], logLevel: 'silent', build: { outDir: output, emptyOutDir: true } });
let server;
let browser;
try {
  await makeBuild(1);
  server = await preview({ root, configFile, plugins: [syntheticNetwork], logLevel: 'silent', build: { outDir: output }, preview: { host: '127.0.0.1', port: 4187, strictPort: true } });
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 390, height: 844 } });
  browser = context;
  await context.route(/^https:\/\/fonts\./, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = 'http://127.0.0.1:4187';
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.controller && window.__pwaState().status === 'ready');
  const installability = await (await context.newCDPSession(page)).send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, []);
  console.log('PASS: actual production registration, precache, manifest and Chromium installability');

  // A synthetic browser event tests the UI without invoking an OS installation.
  await page.evaluate(() => {
    window.__prompted = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = () => { window.__prompted += 1; };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
    window.__prevented = event.defaultPrevented;
  });
  assert.equal(await page.evaluate(() => window.__prompted), 0);
  assert.equal(await page.evaluate(() => window.__prevented), true);
  const button = page.getByRole('button', { name: 'Install app', exact: true });
  const box = await button.boundingBox();
  assert.ok(box.width >= 48 && box.height >= 48);
  await button.click();
  await page.getByText('Finish installation in your browser.', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.__prompted), 1);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.getByText('✓ Installed', { exact: true }).waitFor();
  await page.evaluate(() => window.__renderPwa('hi'));
  await page.getByText('✓ इंस्टॉल हो गया', { exact: true }).waitFor();
  await page.evaluate(() => window.__renderPwa('mr'));
  await page.getByText('✓ इन्स्टॉल झाले', { exact: true }).waitFor();
  await page.evaluate(() => window.__renderPwa('en'));
  console.log('PASS: click-only native prompt, confirmed installed state, en/hi/mr UI and 48px targets');

  await page.evaluate(async () => {
    await caches.open('unrelated-pwa-browser-cache');
    for (const path of ['/api/v1/auth/me', '/api/v1/scans?limit=2', '/health', '/photos/test.png', '/reports/test.html', '/assets/unlisted-Abc12345.js']) {
      const result = await fetch(path);
      if (await result.text() !== 'SYNTHETIC_PRIVATE_RESPONSE') throw new Error('Fixture leaked to a real backend');
    }
    const own = (await caches.keys()).find((name) => name.startsWith('nutriscan-public-shell-v1:'));
    const asset = (await (await caches.open(own)).keys()).find((request) => /\/assets\/.+\.js$/.test(request.url));
    await fetch(`${asset.url}?private=do-not-cache`);
    const keys = await (await caches.open(own)).keys();
    if (keys.some((request) => /[?]|\/api|\/health|\/photos|\/reports|unlisted|index\.html/.test(request.url))) throw new Error('Private or arbitrary response cached');
  });
  await context.setOffline(true);
  assert.equal(await page.evaluate(async () => {
    try { await fetch('/api/v1/auth/me'); return 'unexpected-response'; } catch { return 'network-failure'; }
  }), 'network-failure');
  await page.reload();
  await page.getByRole('heading', { name: 'Offline field help', exact: true }).waitFor();
  await page.getByRole('link', { name: 'हिन्दी', exact: true }).click();
  await page.getByRole('heading', { name: 'ऑफ़लाइन खेत सहायता', exact: true }).waitFor();
  await page.getByRole('link', { name: 'मराठी', exact: true }).click();
  await page.getByRole('heading', { name: 'ऑफलाइन शेतातील मदत', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.doesNotMatch(await page.locator('body').innerText(), /SYNTHETIC_PRIVATE_RESPONSE/);
  console.log('PASS: private/API responses stay uncached, offline API fails, reload shows local public help in all languages');

  await context.setOffline(false);
  await page.getByRole('link', { name: 'पुन्हा जोडणी करा आणि ॲप उघडा / साइन इन करा', exact: true }).click();
  await page.waitForFunction(() => window.__revision === 1);
  await makeBuild(2);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.getByRole('button', { name: 'Update and reload', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__revision), 1, 'no background reload');
  assert.equal(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)), true);
  await page.getByRole('button', { name: 'Update and reload', exact: true }).click();
  await page.waitForFunction(() => window.__revision === 2);
  const cachesAfterUpdate = await page.evaluate(() => caches.keys());
  assert.ok(cachesAfterUpdate.includes('unrelated-pwa-browser-cache'));
  assert.equal(cachesAfterUpdate.filter((name) => name.startsWith('nutriscan-public-shell-v1:')).length, 1);
  assert.deepEqual(errors, []);
  console.log('PASS: real waiting update activates/reloads only on click; only own old cache is deleted');
} finally {
  await browser?.close();
  await server?.close();
  await rm(output, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
