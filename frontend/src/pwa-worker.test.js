import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { CACHE_NAMESPACE, buildAssetPaths, createServiceWorker } from '../pwa-plugin.js';

const origin = 'https://nutriscan.example';
const paths = ['/assets/index-Abc12345.js', '/assets/index-Xyz12345.css', '/offline.html', '/offline-help.js', '/manifest.webmanifest', '/icons/nutri-scan.svg'];
function response(path, body = `public:${path}`, options = {}) {
  const types = { js: 'text/javascript', css: 'text/css', html: 'text/html', webmanifest: 'application/manifest+json', svg: 'image/svg+xml' };
  const result = new Response(body, { status: options.status || 200, headers: { 'content-type': types[path.split('.').at(-1)] || 'text/plain', ...options.headers } });
  const decorate = (value) => {
    Object.defineProperties(value, {
      url: { value: options.url || `${origin}${path}` },
      type: { value: options.type || 'basic' },
      redirected: { value: options.redirected || false },
    });
    const clone = value.clone.bind(value);
    value.clone = () => decorate(clone());
    return value;
  };
  return decorate(result);
}

function harness({ network, version = 'test-v1', existing = new Map() } = {}) {
  const events = new Map();
  const calls = [];
  const reads = [];
  const writes = [];
  const deleted = [];
  let claimed = 0;
  let skipped = 0;
  const fetcher = async (request, options) => {
    calls.push({ request, options });
    return network ? network(request, options) : response(new URL(request.url).pathname);
  };
  const caches = {
    async keys() { return [...existing.keys()]; },
    async delete(name) { deleted.push(name); return existing.delete(name); },
    async open(name) {
      if (!existing.has(name)) existing.set(name, new Map());
      const store = existing.get(name);
      return {
        async put(url, value) { writes.push(url); store.set(url, value.clone()); },
        async match(url) { reads.push(url); return store.get(url)?.clone(); },
      };
    },
  };
  const self = {
    location: { origin },
    addEventListener(type, listener) { events.set(type, listener); },
    clients: { async claim() { claimed += 1; } },
    async skipWaiting() { skipped += 1; },
  };
  vm.runInNewContext(createServiceWorker(paths, version), { self, caches, fetch: fetcher, Request, Response, URL, Set });
  return {
    calls, reads, writes, deleted, existing,
    get claimed() { return claimed; }, get skipped() { return skipped; },
    async lifecycle(type, properties = {}) {
      const waiting = [];
      events.get(type)({ ...properties, waitUntil(promise) { waiting.push(promise); } });
      await Promise.all(waiting);
    },
    request(path, { mode = 'cors', method = 'GET', headers = {} } = {}) {
      const request = { url: new URL(path, origin).href, method, mode, headers: new Headers(headers) };
      let promise;
      events.get('fetch')({ request, respondWith(value) { assert.equal(promise, undefined); promise = value; } });
      return { handled: Boolean(promise), result: promise || fetcher(request) };
    },
  };
}

test('precache contains only exact public URLs, with cookies/referrers/redirects disabled', async () => {
  const sw = harness();
  await sw.lifecycle('install');
  assert.deepEqual(sw.writes.sort(), paths.map((path) => `${origin}${path}`).sort());
  for (const { request, options } of sw.calls) {
    assert.equal(request.credentials, 'omit');
    assert.equal(request.cache, 'no-store');
    assert.equal(request.redirect, 'error');
    assert.equal(request.referrerPolicy, 'no-referrer');
    assert.equal(options, undefined);
  }
  assert.equal(sw.skipped, 0, 'installation must not auto-activate an upgrade');
});

test('API/private GETs and documents are strictly network-only, including offline and auth headers', async () => {
  const sw = harness({ network: async () => { throw new Error('offline'); } });
  for (const path of [
    '/api', '/api/v1/auth/me', '/api/v1/scans?limit=20', '/api/v1/scans/42/report', '/health',
    '/health/live', '/auth/callback?code=secret', '/private/image.png', '/uploads/42.png', '/photos/42',
    '/images/farm.png', '/reports/42.html', '/results/42', '/scans/42', '/farms/1', '/accounts/1',
    '/sessions/current', '/admin', '/login', '/logout', '/account', '/assets/private/secret-Abc12345.js',
  ]) {
    for (const mode of ['cors', 'navigate']) {
      const request = sw.request(path, { mode });
      assert.equal(request.handled, true, path);
      await assert.rejects(request.result, /offline/);
    }
  }
  await assert.rejects(sw.request(paths[0], { headers: { authorization: 'Bearer secret' } }).result, /offline/);
  for (const call of sw.calls) assert.equal(call.options.cache, 'no-store');
  assert.deepEqual(sw.reads, []);
  assert.deepEqual(sw.writes, []);
  assert.equal(sw.existing.size, 0);
});

test('static cache hits are fullpath-only: queries, empty query delimiters, foreign origins and arbitrary assets bypass', async () => {
  const sw = harness();
  await sw.lifecycle('install');
  sw.calls.length = 0;
  sw.writes.length = 0;
  const cached = sw.request(paths[0]);
  assert.equal(cached.handled, true);
  assert.equal(await (await cached.result).text(), `public:${paths[0]}`);
  assert.equal(sw.calls.length, 0);
  for (const path of [
    `${paths[0]}?token=secret`, `${paths[0]}?`, `${paths[0]}#`, '/assets/unknown-Abc12345.js',
    '/assets/another.png', '/index.html', '/', '/sw.js', '/anything.json',
    `https://evil.example${paths[0]}`, 'https://fonts.googleapis.com/css2?family=DM+Sans',
  ]) {
    const request = sw.request(path);
    assert.equal(request.handled, false, path);
    await request.result;
  }
  assert.deepEqual(sw.writes, []);
  assert.deepEqual(sw.reads, [`${origin}${paths[0]}`]);
});

test('POST, PUT, PATCH and DELETE never enter the shell cache', async () => {
  const sw = harness();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of [paths[0], '/api/v1/scans']) {
      const request = sw.request(path, { method });
      assert.equal(request.handled, false);
      await request.result;
    }
  }
  assert.deepEqual(sw.reads, []);
  assert.deepEqual(sw.writes, []);
});

test('navigation is network-first; no personalized HTML or navigation URL is cached', async () => {
  const sw = harness({ network: async (request) => response(new URL(request.url).pathname, 'private signed-in HTML') });
  for (const path of ['/', '/dashboard?farm=secret', '/anything/deep']) {
    assert.equal(await (await sw.request(path, { mode: 'navigate' }).result).text(), 'private signed-in HTML');
  }
  assert.deepEqual(sw.writes, []);
  assert.deepEqual(sw.reads, []);
  assert.ok(sw.calls.every(({ options }) => options.cache === 'no-store'));
});

test('offline and 5xx navigation fall back only to public help, never cached account HTML', async () => {
  let offline = false;
  let serverError = false;
  const sw = harness({ network: async (request) => {
    if (offline) throw new Error('offline');
    return response(new URL(request.url).pathname, undefined, { status: serverError ? 503 : 200 });
  } });
  await sw.lifecycle('install');
  const writes = sw.writes.length;
  offline = true;
  for (const path of ['/', '/dashboard?farm=secret', '/unseen/navigation']) {
    assert.equal(await (await sw.request(path, { mode: 'navigate' }).result).text(), 'public:/offline.html');
  }
  offline = false;
  serverError = true;
  assert.equal(await (await sw.request('/', { mode: 'navigate' }).result).text(), 'public:/offline.html');
  assert.equal(sw.writes.length, writes);
  assert.ok(sw.reads.every((path) => path === `${origin}/offline.html`));
});

test('404 navigations are not disguised as offline, and absent public fallback gives a plain 503', async () => {
  const sw = harness({ network: async () => response('/', 'not found', { status: 404 }) });
  const notFound = await sw.request('/', { mode: 'navigate' }).result;
  assert.equal(notFound.status, 404);
  assert.equal(await notFound.text(), 'not found');
  const missing = harness({ network: async () => { throw new Error('offline'); } });
  const fallback = await missing.request('/', { mode: 'navigate' }).result;
  assert.equal(fallback.status, 503);
  assert.match(fallback.headers.get('content-type'), /text\/plain/);
});

test('rejected public responses cannot populate cache, even if the URL is on the allowlist', async () => {
  for (const options of [
    { headers: { 'content-type': 'text/html' } }, { headers: { 'cache-control': 'private' } },
    { headers: { 'cache-control': 'no-store' } }, { headers: { vary: 'Cookie' } },
    { headers: { vary: 'Authorization' } }, { headers: { vary: '*' } }, { redirected: true },
    { type: 'opaque' }, { url: `${origin}/login` }, { status: 401 },
  ]) {
    const sw = harness({ network: async () => response(paths[0], 'not public', options) });
    await assert.rejects(sw.lifecycle('install'), /Not a verified public/);
    assert.deepEqual(sw.writes, []);
    assert.equal(sw.existing.size, 0);
    await assert.rejects(sw.request(paths[0]).result, /Not a verified public/);
    assert.deepEqual(sw.writes, []);
  }
});

test('cache misses fetch only sanitized static URLs, and never write to a query variant', async () => {
  const sw = harness();
  assert.equal(await (await sw.request(paths[0]).result).text(), `public:${paths[0]}`);
  assert.deepEqual(sw.writes, [`${origin}${paths[0]}`]);
  assert.equal(sw.calls[0].request.credentials, 'omit');
});

test('activation cleans only this namespace; upgrades require an explicit same-origin message', async () => {
  const existing = new Map([
    [`${CACHE_NAMESPACE}old-version`, new Map()], [`${CACHE_NAMESPACE}test-v1`, new Map()],
    ['another-app-cache', new Map()], ['nutriscan-local-drafts', new Map()],
  ]);
  const sw = harness({ existing });
  await sw.lifecycle('activate');
  assert.deepEqual(sw.deleted, [`${CACHE_NAMESPACE}old-version`]);
  assert.equal(sw.claimed, 1);
  for (const properties of [
    { data: { type: 'SKIP_WAITING' }, source: { url: `${origin}/` } },
    { data: { type: 'NUTRISCAN_PWA_ACTIVATE' }, source: { url: 'https://other.example/' } },
    { data: { type: 'NUTRISCAN_PWA_ACTIVATE' } },
  ]) await sw.lifecycle('message', properties);
  assert.equal(sw.skipped, 0);
  await sw.lifecycle('message', { data: { type: 'NUTRISCAN_PWA_ACTIVATE' }, source: { url: `${origin}/` } });
  assert.equal(sw.skipped, 1);
});

test('build assets are actual hashed filenames, not broad runtime asset patterns', () => {
  const names = ['assets/index-Abc12345.js', 'assets/index-xyz98765.css', 'assets/logo-Zxy12345.svg',
    'assets/nohash.js', 'assets/a.map', 'index.html', 'api/secret-Abc12345.js', 'assets/private/secret-Abc12345.js',
    'assets/../secret-Abc12345.js', 'assets/fake-Abc12345.html'];
  assert.deepEqual(buildAssetPaths(Object.fromEntries(names.map((name) => [name, {}]))), names.slice(0, 3).sort());
});
