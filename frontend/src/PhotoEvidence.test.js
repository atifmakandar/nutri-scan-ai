import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let PhotoEvidence;
let validatePhotoFile;
let photoEndpoint;
let MAX_PHOTO_BYTES;

before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: PhotoEvidence, validatePhotoFile, photoEndpoint, MAX_PHOTO_BYTES } = await server.ssrLoadModule('/src/PhotoEvidence.jsx'));
});

after(async () => { await server?.close(); });

const render = (props) => renderToStaticMarkup(createElement(PhotoEvidence, props));

test('client photo validation enforces the backend size and MIME contract', () => {
  assert.equal(validatePhotoFile({ size: MAX_PHOTO_BYTES, type: 'image/jpeg', name: 'evidence.jpg' }), '');
  assert.match(validatePhotoFile({ size: MAX_PHOTO_BYTES + 1, type: 'image/jpeg' }), /5 MiB/);
  assert.match(validatePhotoFile({ size: 12, type: 'image/gif' }), /JPEG, PNG, and WebP/);
  assert.match(validatePhotoFile(null), /Choose a photo/);
});

test('photo endpoint stays on the authenticated backend route and encodes identifiers', () => {
  const path = photoEndpoint('scan/unsafe', 'photo?id=1');
  assert.equal(path, '/api/v1/scans/scan%2Funsafe/photos/photo%3Fid%3D1');
  assert.doesNotMatch(path, /https?:\/\/|data:|static/);
});

test('SSR exposes the evidence-only label and an empty no-scan state without browser globals', () => {
  const api = () => assert.fail('SSR must not make photo requests');
  const html = render({ api, canWrite: false });
  assert.match(html, /Evidence only — photos are not analyzed by AI\./);
  assert.match(html, /Select a saved scan to view photo evidence/);
  assert.doesNotMatch(html, /<img|localStorage|sessionStorage/);
});

test('viewer photo panel is read-only, retains the accepted input types, and has no delete action', () => {
  const html = render({ api: () => assert.fail('SSR must not make photo requests'), scanId: 'scan-1', canWrite: false });
  assert.match(html, /Evidence only — photos are not analyzed by AI\./);
  assert.match(html, /Viewer accounts cannot submit scans or upload photos/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,\.jpg,\.jpeg,\.png,\.webp"/);
  assert.match(html, /type="file"[^>]*disabled=""/);
  assert.doesNotMatch(html, />Remove</);
  assert.doesNotMatch(html, /https?:\/\//);
});
