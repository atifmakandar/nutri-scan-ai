import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from './api.js';

function response({ status = 200, payload = {}, blob = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async blob() { return blob; },
  };
}

test('same-origin API serializes JSON, includes the session cookie mode, and supports raw blobs', async () => {
  const calls = [];
  const api = createApi({ fetcher: async (url, options) => {
    calls.push({ url, options });
    return response({ payload: { ok: true } });
  } });
  assert.deepEqual(await api('/api/v1/scans', { method: 'POST', body: { batch_id: 'B-1' } }), { ok: true });
  assert.equal(calls[0].url, '/api/v1/scans');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { batch_id: 'B-1' });
  const image = new Blob(['png'], { type: 'image/png' });
  const blobApi = createApi({ fetcher: async (_url, options) => {
    assert.equal(options.body, image);
    return response({ blob: image });
  } });
  assert.equal(await blobApi('/api/v1/scans/scan-1/photos/photo-1', { responseType: 'blob', body: image }), image);
});

test('API rejects absolute or non-API paths before any network call', async () => {
  let calls = 0;
  const api = createApi({ fetcher: async () => { calls += 1; return response(); } });
  await assert.rejects(api('https://evil.example/api/v1/scans'), /local \/api\/v1\/ path/);
  await assert.rejects(api('/health'), /local \/api\/v1\/ path/);
  assert.equal(calls, 0);
});

test('API errors retain status and notify the app when an authenticated session expires', async () => {
  let expired = 0;
  const api = createApi({ onUnauthorized: () => { expired += 1; }, fetcher: async () => response({ status: 401, payload: { detail: 'Authentication required' } }) });
  await assert.rejects(api('/api/v1/scans'), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Authentication required');
    return true;
  });
  await assert.rejects(api('/api/v1/auth/me'), (error) => error.status === 401);
  assert.equal(expired, 1, 'auth endpoints do not recursively clear the session');
});
