import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { translate } from './i18n.js';
import { offlineMessages } from './offline-messages.js';

let server;
let DraftsPanel;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: DraftsPanel } = await server.ssrLoadModule('/src/DraftsPanel.jsx'));
});
after(async () => { await server?.close(); });
const identity = (role = 'owner') => ({ user: { id: 'user-1', username: 'PRIVATE USER', role }, farm: { id: 'farm-1', name: 'PRIVATE FARM' } });
const render = (props) => renderToStaticMarkup(createElement(DraftsPanel, props));
const api = () => assert.fail('render must never send a request');

test('SSR panel exposes a prominent explicit sync action and honest unknown local state without storage or callbacks', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { assert.fail('SSR must not read browser storage'); } });
    const html = render({ identity: identity(), form: {}, online: true, api, onStatus: () => assert.fail('SSR must not report uncommitted status') });
    assert.match(html, /class="primary-button drafts-sync-button"[^>]*disabled="">Sync now/);
    assert.match(html, /Checking local drafts/);
    assert.match(html, /Checking last confirmed sync time/);
    assert.match(html, /Nothing is sent automatically/);
    assert.doesNotMatch(html, /0 saved local|0 queued|PRIVATE USER|PRIVATE FARM|<time/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('incomplete forms cannot be saved and the offline panel never claims their contents are saved', () => {
  const html = render({ identity: identity('member'), form: { inputs: {} }, online: false, api });
  assert.match(html, /Offline — readings stay on this device/);
  assert.match(html, /The live form is not a saved draft/);
  assert.match(html, /incomplete readings cannot be saved/);
  assert.match(html, /aria-describedby="drafts-save-help"[^>]*disabled="">Save draft/);
  assert.doesNotMatch(html, /Draft saved on this device|Your readings are saved/);
});

test('viewers and unknown roles remain read-only; signed-out panel requires an authenticated farm', () => {
  const viewer = render({ identity: identity('viewer'), online: true, api });
  assert.match(viewer, /Viewer access is read-only/);
  assert.match(viewer, /cannot save, queue, delete, or sync/);
  assert.match(viewer, /disabled="">Sync now/);
  assert.match(viewer, /disabled="">Save draft/);
  const unknown = render({ identity: identity('operator'), online: true, api });
  assert.match(unknown, /Only authenticated owners and members/);
  assert.match(unknown, /disabled="">Sync now/);
  const signedOut = render({ online: true, api });
  assert.match(signedOut, /Sign in and select a farm/);
  assert.match(signedOut, /disabled="">Save draft/);
});

test('panel adds supplemental Hindi/Marathi instructions while retaining the existing translated controls', () => {
  for (const locale of ['hi', 'mr']) {
    const t = Object.assign((key, values) => translate(locale, key, values), { locale });
    const html = render({ identity: identity(), online: false, api, t });
    const help = 'The live form is not a saved draft. Only complete, valid readings can be saved; incomplete readings cannot be saved.';
    assert.ok(html.includes(offlineMessages[locale][help]));
    assert.ok(html.includes(translate(locale, 'Save draft')));
    assert.ok(html.includes(offlineMessages[locale]['Sync now']));
    assert.doesNotMatch(html, /incomplete readings|Unsaved form edits|Nothing is sent automatically/);
  }
});
