import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { english } from './screening.js';

let server;
let FarmerHome;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: FarmerHome } = await server.ssrLoadModule('/src/FarmerHome.jsx'));
});
after(async () => { await server?.close(); });
const render = (props) => renderToStaticMarkup(createElement(FarmerHome, props));

test('farmer home has exactly three text-and-icon quick links to scan, history and measurement help', () => {
  const html = render({ canWrite: true });
  assert.equal((html.match(/<a /g) || []).length, 3);
  for (const fragment of ['#scan', '#history', '#farmer-help']) assert.ok(html.includes(`href="${fragment}"`));
  for (const label of ['Check feed or silage', 'View past results', 'Get measurement help']) assert.ok(html.includes(`<strong>${label}</strong>`));
  assert.match(html, /aria-label="Farm quick actions"/);
  assert.equal((html.match(/class="farmer-action-icon" aria-hidden="true"/g) || []).length, 3);
  assert.doesNotMatch(html, /read-only|needs write access/);
});

test('viewer home explains write access on its scan link and leaves history and help usable', () => {
  const html = render({ canWrite: false });
  assert.match(html, /role="note">Viewer access is read-only/);
  assert.match(html, /href="#scan" aria-describedby="[^"]+-access"/);
  assert.match(html, /Submitting needs write access/);
  assert.match(html, /href="#history"/);
  assert.match(html, /href="#farmer-help"/);
  assert.match(render({}), /Viewer access is read-only/);
});

test('home uses the supplied translator for all labels and descriptions', () => {
  const html = render({ canWrite: true, t: (text, values) => `translated:${english(text, values)}` });
  assert.match(html, /translated:What would you like to do/);
  assert.match(html, /aria-label="translated:Farm quick actions"/);
  assert.match(html, /translated:Start a guided screening/);
});
