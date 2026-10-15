import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createFarmerTranslator } from './farmer-i18n.js';
import { pwaLocale, pwaMessages, pwaText } from './pwa-messages.js';

let server;
let InstallApp;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: false } });
  ({ InstallApp } = await server.ssrLoadModule('/src/InstallApp.jsx'));
});
after(async () => { await server?.close(); });
const render = (props) => renderToStaticMarkup(createElement(InstallApp, props));

test('SSR is browser-free and honest: fallback instructions, public help, no fabricated native prompt', () => {
  const html = render();
  assert.match(html, /<summary>Install options<\/summary>/);
  assert.match(html, /Some browsers or devices do not offer installation/);
  assert.match(html, /Offline access is public help only; reconnect and sign in for private data/);
  assert.match(html, /href="\/offline.html#help-en"/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(html, /<button|localStorage|<iframe|<script/);
});

test('the real parent translator gets complete supplemental English/Hindi/Marathi copy', () => {
  for (const locale of ['en', 'hi', 'mr']) {
    const html = render({ t: createFarmerTranslator(locale) });
    assert.match(html, new RegExp(`lang="${locale}"`));
    assert.match(html, new RegExp(`href="/offline.html#help-${locale}"`));
    assert.ok(html.includes(pwaMessages[locale]['Install options']));
    for (const key of Object.keys(pwaMessages.en)) {
      assert.ok(Object.hasOwn(pwaMessages[locale], key), `${locale}: ${key}`);
      assert.equal(pwaText(Object.assign((value) => value, { locale }), key), pwaMessages[locale][key]);
    }
    if (locale !== 'en') assert.doesNotMatch(html, /Install options|Some browsers|Offline access|Public offline help/);
  }
});

test('prototype locale keys cannot escape catalogs; explicit locale works with identity parent t', () => {
  for (const locale of ['__proto__', 'constructor', 'toString', null, {}, ['hi']]) {
    assert.equal(pwaLocale(locale), 'en');
    assert.equal(pwaText({ locale }, 'Install options'), 'Install options');
    assert.match(render({ t: { locale } }), /lang="en"/);
  }
  assert.match(render({ t: (key) => key, locale: 'mr' }), /इन्स्टॉलचे पर्याय/);
  assert.equal(pwaText(() => '<custom>', 'Install app'), '<custom>');
  assert.match(render({ t: () => '<img src=x>' }), /&lt;img src=x&gt;/);
});

test('several header controls have unique accessible status references', () => {
  const html = renderToStaticMarkup(createElement('div', null, createElement(InstallApp), createElement(InstallApp)));
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});
