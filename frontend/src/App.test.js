import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let App;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: App } = await server.ssrLoadModule('/src/App.jsx'));
});
after(async () => { await server?.close(); });

test('the real app boots in farmer mode with blank guided readings, help and no saved/private result', () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /app-shell farmer-mode/);
  assert.match(html, /Detailed dashboard/);
  assert.match(html, /Welcome to Nutri-Scan/);
  assert.match(html, /Screening progress/);
  assert.match(html, /id="farmer-help"/);
  assert.equal((html.match(/type="number"/g) || []).length, 10);
  assert.doesNotMatch(html, /value="(?:62|4\.2|68|8\.8)"/);
  assert.doesNotMatch(html, /Preview summary|SIL-2026-0142|Good morning, Atif/);
});

test('the real app localizes screening plus embedded measurement and audio help together', () => {
  const previous = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => 'mr' };
    const html = renderToStaticMarkup(createElement(App));
    assert.match(html, /Nutri-Scan मध्ये आपले स्वागत आहे/);
    assert.match(html, /lang="mr"/);
    assert.doesNotMatch(html, /What are you checking\?|Common mistake/);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
