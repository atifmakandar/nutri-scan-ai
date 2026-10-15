import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { translate } from './i18n.js';
import { offlineMessages } from './offline-messages.js';

let server;
let OfflineStatus;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ OfflineStatus } = await server.ssrLoadModule('/src/OfflineStatus.jsx'));
});
after(async () => { await server?.close(); });
const render = (props) => renderToStaticMarkup(createElement(OfflineStatus, props));
const t = (locale) => Object.assign((key, values) => translate(locale, key, values), { locale });
const status = { draftCount: 2, queuedCount: 3, lastSyncedAt: null, storageError: false, syncing: false };

test('online is explicitly connection-only; separate draft and pending-upload counts do not claim live form storage', () => {
  const html = render({ online: true, status });
  assert.match(html, />Online</);
  assert.match(html, /online does not mean readings have been uploaded/);
  assert.match(html, /2 saved local drafts/);
  assert.match(html, /3 queued — waiting for upload/);
  assert.match(html, /Unsaved form edits are not stored automatically/);
  assert.match(html, /No confirmed sync time recorded/);
  assert.doesNotMatch(html, /<time|All synced|Everything saved/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
});

test('offline banner explains device-only storage without calling the live form saved', () => {
  const html = render({ online: false, status });
  assert.match(html, /Offline — readings stay on this device/);
  assert.match(html, /Only saved drafts and queued readings are kept locally/);
  assert.match(html, /Unsaved form edits are not stored automatically/);
  assert.match(html, /3 queued — waiting for upload/);
  assert.doesNotMatch(html, />Online<|Your readings are saved/);
});

test('empty queue is not evidence of upload, and unverified storage never invents zero counts', () => {
  const empty = render({ online: true, status: { ...status, draftCount: 0, queuedCount: 0 } });
  assert.match(empty, /0 saved local drafts/);
  assert.match(empty, /0 queued — waiting for upload/);
  assert.match(empty, /No confirmed sync time recorded/);
  assert.doesNotMatch(empty, /<time/);
  const failed = render({ online: false, status: { ...status, draftCount: null, queuedCount: null, storageError: true } });
  assert.match(failed, /Local draft counts are unavailable/);
  assert.match(failed, /Local storage could not be fully verified/);
  assert.match(failed, /Last confirmed sync time is unavailable/);
  assert.doesNotMatch(failed, /No confirmed sync time recorded/);
  assert.doesNotMatch(failed, /0 saved|0 queued/);
  assert.match(render({ online: true }), /Checking local drafts/);
  assert.match(render({ online: true, status: null }), /Checking local drafts/);
});

test('confirmed timestamp uses the requested locale in full and compact rendering, even with a remaining queue', () => {
  const timestamp = '2026-10-15T08:00:00.000Z';
  for (const compact of [false, true]) {
    for (const locale of ['en', 'hi', 'mr']) {
      const html = render({ online: true, status: { ...status, lastSyncedAt: timestamp }, t: t(locale), compact });
      assert.match(html, /<time dateTime="2026-10-15T08:00:00.000Z">/);
      assert.ok(html.includes(new Date(timestamp).toLocaleString(locale)));
      assert.equal(html.includes('offline-status-compact'), compact);
      assert.doesNotMatch(html, /\{count\}|\{time\}/);
    }
  }
  const invalidLocale = Object.assign((key) => key, { locale: 'invalid_locale' });
  assert.match(render({ online: true, status: { ...status, lastSyncedAt: timestamp }, t: invalidLocale }), /<time/);
});

test('invalid timestamps are hidden; syncing and storage problems stay explicit in compact mode', () => {
  for (const value of ['invalid', '2026-02-30T08:00:00.000Z', 0, {}]) {
    const html = render({ online: true, status: { ...status, lastSyncedAt: value, syncing: true, storageError: true }, compact: true });
    assert.doesNotMatch(html, /<time|Invalid Date/);
    assert.match(html, /Confirmation is pending for each upload/);
    assert.match(html, /Local storage could not be fully verified/);
    // Metadata trouble does not hide verified queue counts.
    assert.match(html, /3 queued — waiting for upload/);
  }
});

test('actual app translator gets complete Hindi and Marathi supplemental status copy and count replacements', () => {
  for (const locale of ['hi', 'mr']) {
    const html = render({ online: false, status, t: t(locale) });
    assert.ok(html.includes(offlineMessages[locale]['Offline — readings stay on this device.']));
    assert.ok(html.includes(offlineMessages[locale]['{count} saved local drafts'].replace('{count}', '2')));
    assert.ok(html.includes(offlineMessages[locale]['{count} queued — waiting for upload'].replace('{count}', '3')));
    assert.doesNotMatch(html, /Unsaved form edits|waiting for upload|\{count\}/);
  }
});
