import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let AuthPanel;
let validatePassword;
let validateAuthFields;
let isSessionResponse;

before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: AuthPanel, validatePassword, validateAuthFields, isSessionResponse } = await server.ssrLoadModule('/src/AuthPanel.jsx'));
});

after(async () => { await server?.close(); });

const render = (props) => renderToStaticMarkup(createElement(AuthPanel, props));
const session = (role = 'owner') => ({
  user: { id: 'user-1', username: 'farm.owner', role },
  farm: { id: 'farm-1', name: 'Green Valley Farm' },
});

test('auth validation requires a ten-character password and registration farm name', () => {
  assert.equal(validatePassword('ninechars'), 'Use at least 10 characters.');
  assert.equal(validatePassword('tencharacters'), '');
  assert.equal(validatePassword('🌾'.repeat(10)), '');
  assert.equal(validateAuthFields({ username: 'owner', password: 'tencharacters' }), '');
  assert.equal(validateAuthFields({ username: 'owner', password: 'tencharacters', createAccount: true }), 'Farm name is required.');
  assert.equal(validateAuthFields({ username: 'owner', password: 'tencharacters', farm_name: 'Farm', createAccount: true }), '');
});

test('session response validation only accepts user and farm objects', () => {
  assert.equal(isSessionResponse(session()), true);
  assert.equal(isSessionResponse({ user: {}, farm: {} }), true);
  for (const value of [undefined, null, {}, { user: {} }, { farm: {} }, { user: [], farm: {} }]) {
    assert.equal(isSessionResponse(value), false);
  }
});

test('signed-out SSR renders sign-in/create-account tabs without making requests', () => {
  const api = () => assert.fail('SSR must not make auth requests');
  const html = render({ api, onSession() {} });
  assert.match(html, /Sign in/);
  assert.match(html, /Create farm account/);
  assert.match(html, /name="username"/);
  assert.match(html, /name="password"/);
  assert.doesNotMatch(html, /name="farm_name"/);
  assert.doesNotMatch(html, /<script|localStorage|sessionStorage/);
});

test('owner SSR exposes farm identity and member creation controls', () => {
  const html = render({ session: session(), api: () => assert.fail('SSR must not load members'), onSession() {} });
  assert.match(html, /Green Valley Farm/);
  assert.match(html, /farm\.owner/);
  assert.match(html, /Owner/);
  assert.match(html, /Farm members/);
  assert.match(html, /Add member/);
  assert.match(html, /name="password"|member-password/);
  assert.match(html, /value="viewer"/);
});

test('viewer SSR is explicitly read-only and has no member-management action', () => {
  const html = render({ session: session('viewer'), api: () => assert.fail('SSR must not load members'), onSession() {} });
  assert.match(html, /Viewer accounts cannot submit scans or upload photos/);
  assert.match(html, /Viewer/);
  assert.doesNotMatch(html, /Farm members|Add member/);
  assert.doesNotMatch(html, /Sign in failed|Account could not be created/);
});
