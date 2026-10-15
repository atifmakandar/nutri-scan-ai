import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { resultsText } from './farmer-results.js';

let server;
let ShareEvidencePicker;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: ShareEvidencePicker } = await server.ssrLoadModule('/src/ShareEvidencePicker.jsx'));
});
after(async () => { await server?.close(); });

const render = (props = {}) => renderToStaticMarkup(createElement(ShareEvidencePicker, props));

test('SSR is opt-in and metadata-only until clicked; it requires no browser globals or effects', () => {
  const html = render({ api: () => assert.fail('no automatic photo requests'), scanId: 'scan-one',
    onChange: () => assert.fail('SSR has no effects'), browser: { fetch: () => assert.fail('no direct fetch') } });
  assert.match(html, /Choose saved photos/);
  assert.match(html, /Photos start off/);
  assert.match(html, /Up to 5 saved JPEG, PNG or WebP photos; 5 MiB maximum per photo/);
  assert.match(html, /Copy and WhatsApp are text-only and never send photo URLs/);
  assert.match(html, /aria-labelledby="[^"]+-title"/);
  assert.doesNotMatch(html, /<img|type="checkbox"|Prepare selected photos|https?:|localStorage/);
});

test('unavailable API and busy share state disable explicit photo loading with a readable explanation', () => {
  assert.match(render({ scanId: 'scan' }), /disabled="">Choose saved photos/);
  assert.match(render(), /Saved photo sharing is unavailable without the authenticated API/);
  assert.match(render({ scanId: 'scan', api() {}, disabled: true }), /disabled="">Choose saved photos/);
});

test('picker supplies its local English default and Hindi/Marathi translations with all placeholders intact', () => {
  for (const locale of ['en', 'hi', 'mr']) {
    const t = locale === 'en' ? undefined : Object.assign((key) => key, { locale });
    const html = render({ scanId: 'scan', api() {}, t });
    assert.ok(html.includes(resultsText(t)('Choose saved photos')));
    assert.doesNotMatch(html, /\{limit\}|\{count\}|undefined/);
    if (locale !== 'en') assert.doesNotMatch(html, /Choose saved photos|Optional photos for native sharing|Photos start off/);
  }
});
