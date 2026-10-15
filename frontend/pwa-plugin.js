import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { iconPng } from './pwa-icons.js';

export const CACHE_NAMESPACE = 'nutriscan-public-shell-v1:';
export const PUBLIC_FILES = Object.freeze([
  'offline.html', 'offline-help.js', 'offline.css', 'manifest.webmanifest', 'icons/nutri-scan.svg',
]);
export const PNG_FILES = Object.freeze([180, 192, 512].map((size) => `icons/nutri-scan-${size}.png`));
const hashedAsset = /^assets\/[A-Za-z0-9_./-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/;
const privatePath = /\/(?:api|health|auth|login|logout|account|accounts|private|uploads|photos|images|reports|results|scans|farms|sessions|admin)(?:[/.]|$)/i;

export function buildAssetPaths(bundle) {
  return Object.keys(bundle).filter((name) => hashedAsset.test(name)
    && !name.split('/').includes('..') && !privatePath.test(`/${name}`)).sort();
}

/** Standalone classic worker; no runtime imports, dependencies, or user data. */
export function createServiceWorker(paths, version) {
  return `/* Nutri-Scan public offline shell. Generated from this production build. */
'use strict';
const CACHE_NAMESPACE = ${JSON.stringify(CACHE_NAMESPACE)};
const CACHE_NAME = CACHE_NAMESPACE + ${JSON.stringify(version)};
const STATIC_PATHS = new Set(${JSON.stringify(paths)});
const PRIVATE_PATH = ${privatePath};
const OFFLINE_PATH = '/offline.html';

function privateRequest(request, url) {
  return PRIVATE_PATH.test(url.pathname) || request.headers.has('authorization');
}

function isStatic(request, url) {
  return request.method === 'GET' && url.origin === self.location.origin
    && url.href === new URL(url.pathname, self.location.origin).href
    && !privateRequest(request, url) && STATIC_PATHS.has(url.pathname);
}

function publicResponse(response, path) {
  if (response.status !== 200 || response.redirected || response.type !== 'basic'
      || response.url !== new URL(path, self.location.origin).href) return false;
  if (/(?:private|no-store)/i.test(response.headers.get('cache-control') || '')
      || /(?:\\*|cookie|authorization)/i.test(response.headers.get('vary') || '')) return false;
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (path === OFFLINE_PATH) return type === 'text/html';
  if (path.endsWith('.js')) return /^(?:text|application)\\/(?:javascript|ecmascript)$/.test(type);
  if (path.endsWith('.css')) return type === 'text/css';
  if (path.endsWith('.webmanifest')) return /^(?:application\\/manifest\\+json|application\\/json)$/.test(type);
  if (/\\.(?:svg|png|jpe?g|webp|avif|gif|ico)$/.test(path)) return type.startsWith('image/');
  return /^(?:font\\/|application\\/(?:font|vnd.ms-fontobject))/.test(type);
}

async function publicFetch(path) {
  // Deliberately omit session cookies, authorization, referrers and redirects.
  const request = new Request(new URL(path, self.location.origin).href, {
    credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
  });
  const response = await fetch(request);
  if (!publicResponse(response, path)) throw new Error('Not a verified public static response');
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Verify every response before writing. Never use addAll with ambient cookies.
    const entries = await Promise.all([...STATIC_PATHS].map(async (path) => [path, await publicFetch(path)]));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(entries.map(([path, response]) => cache.put(new URL(path, self.location.origin).href, response)));
    // Updates wait. Only a user's explicit update action may skip waiting.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_NAMESPACE) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'NUTRISCAN_PWA_ACTIVATE' || !event.source?.url) return;
  if (new URL(event.source.url).origin === self.location.origin) event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Explicit private paths are network-only even for document/image requests.
  // In particular they must never receive offline HTML as an API response.
  if (privateRequest(request, url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.status < 500) return response;
      } catch { /* The only navigation fallback is our public help document. */ }
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(new URL(OFFLINE_PATH, self.location.origin).href)
        || new Response('Offline. Reconnect to open Nutri-Scan.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
    return;
  }
  if (!isStatic(request, url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    const response = await publicFetch(url.pathname);
    await cache.put(url.href, response.clone());
    return response;
  })());
});
`;
}

export function publicPwaPlugin() {
  let config;
  return {
    name: 'nutriscan-public-pwa',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    async generateBundle(_options, bundle) {
      if (config.command !== 'build' || config.mode !== 'production' || config.build.ssr) return;
      if (config.base !== '/') throw new Error('Nutri-Scan public PWA requires a root (/) deployment.');
      const files = new Map();
      for (const name of buildAssetPaths(bundle)) {
        const entry = bundle[name];
        files.set(name, entry.type === 'chunk' ? entry.code : entry.source);
      }
      for (const name of PUBLIC_FILES) files.set(name, await readFile(resolve(config.publicDir, name)));
      for (const size of [180, 192, 512]) {
        const name = `icons/nutri-scan-${size}.png`;
        const source = iconPng(size);
        files.set(name, source);
        this.emitFile({ type: 'asset', fileName: name, source });
      }
      // Includes offline help/icons and the worker policy, not only JS hashes.
      const hash = createHash('sha256').update(createServiceWorker([], 'policy'));
      for (const [name, source] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update('\0').update(source).update('\0');
      const paths = [...files.keys()].sort().map((name) => `/${name}`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: createServiceWorker(paths, hash.digest('hex').slice(0, 20)) });
    },
  };
}
