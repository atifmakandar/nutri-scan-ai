import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildBatchUrl } from './history-utils.js';

let server;
let BatchQr;
let generateBatchQr;
let printQrLabel;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: BatchQr, generateBatchQr, printQrLabel } = await server.ssrLoadModule('/src/BatchQr.jsx'));
});
after(async () => { await server?.close(); });

function printBrowser() {
  const state = { nodes: [], printed: 0, closed: false };
  const node = (tag) => {
    const element = {
      tag, children: [], listeners: {}, attributes: {}, textContent: '',
      appendChild(child) { this.children.push(child); },
      insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); },
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      set innerHTML(_) { assert.fail('QR labels must never insert user data as HTML'); },
    };
    state.nodes.push(element);
    return element;
  };
  const popup = {
    opener: 'original-window',
    document: {
      head: node('head'), body: node('body'),
      createElement(tag) { assert.equal(popup.opener, null); return node(tag); },
      write() { assert.fail('QR label must be constructed using safe DOM text'); },
    },
    print() { state.printed += 1; },
    close() { state.closed = true; },
  };
  const browser = { open(url, target) { assert.equal(url, ''); assert.equal(target, '_blank'); return popup; } };
  return { browser, popup, state };
}

test('print labels preserve dangerous/unicode identifiers as text and wait for the local PNG before printing', () => {
  const batchId = '"><img src=x onerror=alert(1)>羊';
  const { browser, popup, state } = printBrowser();
  const url = buildBatchUrl('http://localhost:5173', batchId, 'feed');
  assert.equal(printQrLabel({ url, dataUrl: 'data:image/png;base64,AAA=', batchId, sampleType: 'feed' }, browser), popup);
  assert.equal(state.nodes.find((item) => item.tag === 'h2').textContent, batchId);
  assert.equal(state.nodes.find((item) => item.tag === 'a').href, url);
  assert.ok(state.nodes.some((item) => item.textContent.includes('localhost or loopback')));
  assert.ok(state.nodes.some((item) => item.textContent.includes('Sign-in is required')));
  const image = state.nodes.find((item) => item.tag === 'img');
  const button = state.nodes.find((item) => item.tag === 'button');
  assert.equal(image.src, 'data:image/png;base64,AAA=');
  assert.equal(button.disabled, true);
  assert.equal(state.printed, 0);
  image.onload();
  assert.equal(button.disabled, false);
  button.listeners.click();
  assert.equal(state.printed, 1);
  assert.equal(state.closed, false);
});

test('print image failures remain visible and blocked popups provide an actionable error', () => {
  const { browser, state } = printBrowser();
  printQrLabel({ url: 'https://farm.example/?batch=B&sample_type=feed#history', dataUrl: 'data:image/png;base64,AAA=', batchId: 'B', sampleType: 'feed' }, browser);
  state.nodes.find((item) => item.tag === 'img').onerror();
  assert.equal(state.nodes.find((item) => item.tag === 'button').disabled, true);
  assert.ok(state.nodes.some((item) => item.textContent.includes('could not be loaded')));
  assert.ok(!state.nodes.some((item) => item.textContent.includes('localhost or loopback')));
  assert.throws(() => printQrLabel({}, { open() { return null; } }), /Allow pop-ups/);
});

test('an incomplete print preview is closed and its original failure is preserved', () => {
  const { browser, popup, state } = printBrowser();
  popup.document.createElement = () => { throw new Error('Cannot create print document'); };
  assert.throws(() => printQrLabel({ url: 'https://farm.example' }, browser), /Cannot create print document/);
  assert.equal(state.closed, true);
});

test('QR UI renders only the encoded route link and provides auth and local-device guidance', () => {
  const oldWindow = globalThis.window;
  for (const origin of ['http://localhost:5173', 'https://farm.example']) {
    globalThis.window = { location: { origin, search: '?access_token=private' } };
    try {
      const html = renderToStaticMarkup(createElement(BatchQr, { batchId: '<script>羊&"', sampleType: 'silage' }));
      assert.match(html, /batch=%3Cscript%3E%E7%BE%8A%26%22&amp;sample_type=silage#history/);
      assert.match(html, /role="status">Generating QR code on this device/);
      assert.match(html, /Sign-in is required/);
      assert.equal(html.includes('localhost or loopback'), origin.includes('localhost'));
      assert.match(html, /&lt;script&gt;羊&amp;&quot;/);
      assert.doesNotMatch(html, /<script|access_token|secret-token/);
    } finally {
      if (oldWindow === undefined) delete globalThis.window;
      else globalThis.window = oldWindow;
    }
  }
});

test('qrcode generates an actual local PNG data URL for encoded unicode batch links', async (context) => {
  try { await import('qrcode'); } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    context.skip('qrcode installation is owned by the parent and is not available yet');
    return;
  }
  const url = buildBatchUrl('https://farm.example', '<script>羊&"', 'feed');
  const dataUrl = await generateBatchQr(url);
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 320);
  assert.equal(png.readUInt32BE(20), 320);
  assert.notEqual(dataUrl, await generateBatchQr(buildBatchUrl('https://farm.example', 'different-batch', 'feed')));
});
