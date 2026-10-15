import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let ListenButton;

before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: ListenButton } = await server.ssrLoadModule('/src/ListenButton.jsx'));
});
after(async () => { await server?.close(); });

const render = (props) => renderToStaticMarkup(createElement(ListenButton, props));

test('SSR exposes click-only reading, a stop control, polite status, and a readable text fallback', () => {
  const html = render({ text: 'Sample advice' });
  assert.match(html, /<button type="button"[^>]*>.*Listen<\/button>/s);
  assert.match(html, /<button type="button"[^>]*disabled=""[^>]*>.*Stop reading<\/button>/s);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /Listen reads only after you press it/);
  assert.match(html, /Text is always available/);
  assert.match(html, /installed on your device or supplied by your browser/);
  assert.match(html, /offline listening is not guaranteed/);
  assert.match(html, /<summary>Read the text<\/summary><p[^>]*>Sample advice<\/p>/);
  assert.doesNotMatch(html, /<audio|autoplay|<input|https?:\/\//i);
});

test('standalone listening labels and availability explanation are localized without the central translator', () => {
  for (const [locale, listen, stop, installed, offline] of [
    ['hi', 'सुनें', 'पढ़ना रोकें', 'स्थापित', 'ऑफ़लाइन'],
    ['mr', 'ऐका', 'वाचन थांबवा', 'स्थापित', 'ऑफलाइन'],
  ]) {
    const html = render({ text: 'नमूना', locale });
    assert.match(html, new RegExp(`lang="${locale}"`));
    for (const label of [listen, stop, installed, offline]) assert.ok(html.includes(label), label);
    assert.doesNotMatch(html, />Listen<|>Stop reading<|Reading uses voices/);
  }
  const t = Object.assign((key) => key, { locale: 'mr' });
  assert.match(render({ text: 'मजकूर', t }), /ऐका/);
  assert.match(render({ text: 'पाठ', t, locale: 'hi' }), /सुनें/);
});

test('SSR treats provided text as text, and disables reading when the text is empty', () => {
  const html = render({ text: '<img src=x onerror=alert(1)>' });
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
  const empty = render({ text: '  ' });
  assert.equal((empty.match(/disabled=""/g) || []).length, 2);
  assert.match(empty, /There is no text to read/);
});

test('several SSR listeners receive separate transcript and status identifiers', () => {
  const html = renderToStaticMarkup(createElement('div', null,
    createElement(ListenButton, { text: 'One' }),
    createElement(ListenButton, { text: 'Two' })));
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of html.matchAll(/aria-(?:describedby|controls)="([^"]+)"/g)) {
    for (const id of match[1].split(' ')) assert.ok(ids.includes(id), `Missing accessible target ${id}`);
  }
});
